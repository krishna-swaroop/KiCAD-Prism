from __future__ import annotations

import hashlib
import json
import math
import os
import shutil
import subprocess
import tempfile
import time
from collections import defaultdict
from pathlib import Path
from typing import Any, Callable

from .copper_geometry import ingest_copper_geometry, is_copper_geometry_document
from .glb_inspect import mesh_axis_range
from .native_clipper import NativeClipperError, build_native_clip_response
from .prism_clipper2 import PrismClipper2Library, prism_clipper2_library_info
from .pcb_geometry import (
    KIND_IDS,
    NM_TO_MM,
    capsule,
    circle,
    clean_ring,
    pad_rings,
    point_nm,
    sample_arc_op,
    transform,
)


SCHEMA = "prism.semantic_gltf_a0"
TILE_SIZE_MM = 20.0
SEMANTIC_GEOMETRY_PROTOCOL_VERSION = "prism.semantic_geometry_protocol_a1"
SEMANTIC_CLIPPER_PROTOCOL_VERSION = "prism.semantic_clipper_response_a1"
SEMANTIC_GEOMETRY_COMPILER_VERSION = "semantic-gltf-clipper-a1"


class SemanticGltfBuilder:
    def __init__(self, topology: dict[str, Any], base_board_glb: Path | None = None) -> None:
        self.topology = topology
        self.layers = []
        self.layer_by_name: dict[str, dict[str, Any]] = {}
        for index, layer in enumerate(topology.get("layers", []) or [], start=1):
            item = {**layer, "id": index}
            self.layers.append(item)
            self.layer_by_name[str(item.get("name") or "")] = item
        self.copper_layers = [
            layer
            for layer in self.layers
            if str(layer.get("role") or "") == "copper"
            or str(layer.get("name") or "").endswith(".Cu")
        ]
        self.copper_index = {
            str(layer.get("name") or ""): index
            for index, layer in enumerate(self.copper_layers)
        }
        self.net_id_by_name: dict[str, int] = {}
        self.nets = [{"id": 0, "uid": "", "name": "", "netClass": "", "metrics": {}}]
        for net in topology.get("nets", []) or []:
            name = str(net.get("name") or "")
            if not name:
                continue
            net_id = len(self.nets)
            self.net_id_by_name[name] = net_id
            self.nets.append(
                {
                    "id": net_id,
                    "uid": str(net.get("uid") or ""),
                    "name": name,
                    "netClass": str(net.get("net_class") or ""),
                    "metrics": {
                        "traceLengthMm": 0.0,
                        "layers": [],
                        "objectCounts": {},
                    },
                    "analysis": {},
                }
            )
        self.objects: list[dict[str, Any]] = []
        self.object_features = [
            {
                "id": 0,
                "sourceUid": "",
                "netId": 0,
                "layerId": 0,
                "kind": "none",
            }
        ]
        self.object_feature_by_key: dict[tuple[str, int, int, str], int] = {}
        self.source_feature_by_key: dict[tuple[str, int, str], int] = {}
        self.barrels: list[dict[str, Any]] = []
        self.component_nodes: dict[str, dict[str, Any]] = {}
        self.feature_bounds: dict[int, list[float]] = {}
        self.net_bounds: dict[int, list[float]] = {}
        self.net_layer_bounds: dict[int, dict[int, list[float]]] = defaultdict(dict)
        self.net_layers: dict[int, set[str]] = defaultdict(set)
        self.net_kind_counts: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self.net_trace_length: dict[int, float] = defaultdict(float)
        self.source_polygon_record_id = 0
        self.board_y_min_mm: float | None = None
        self.board_y_max_mm: float | None = None
        self.board_thickness_mm = float(topology.get("board", {}).get("thickness_mm") or 0.0)
        if base_board_glb and base_board_glb.exists():
            self._read_board_y_range(base_board_glb)

    def _read_board_y_range(self, path: Path) -> None:
        axis_range = mesh_axis_range(path, "_pcb", 1)
        if axis_range:
            self.board_y_min_mm = axis_range[0] * 1000.0
            self.board_y_max_mm = axis_range[1] * 1000.0

    def _runtime_z_mm(self, centered_z_mm: float) -> float:
        if (
            self.board_y_min_mm is None
            or self.board_y_max_mm is None
            or self.board_thickness_mm <= 0
        ):
            return centered_z_mm
        normalized = (centered_z_mm + self.board_thickness_mm / 2.0) / self.board_thickness_mm
        return self.board_y_min_mm + normalized * (self.board_y_max_mm - self.board_y_min_mm)

    def _layers_for(self, values: list[Any]) -> list[str]:
        names = [str(item) for item in values]
        if any(name in {"*.Cu", "F&B.Cu"} for name in names):
            return [str(layer["name"]) for layer in self.copper_layers]
        selected = [name for name in names if name in self.copper_index]
        if len(selected) == 2:
            low, high = sorted((self.copper_index[selected[0]], self.copper_index[selected[1]]))
            return [str(self.copper_layers[index]["name"]) for index in range(low, high + 1)]
        return selected

    def _feature_id(self, source_uid: str, net_id: int, layer_id: int, kind: str) -> int:
        key = (source_uid, net_id, layer_id, kind)
        existing = self.object_feature_by_key.get(key)
        if existing is not None:
            return existing
        feature_id = len(self.object_features)
        self.object_feature_by_key[key] = feature_id
        self.object_features.append(
            {
                "id": feature_id,
                "sourceUid": source_uid,
                "netId": net_id,
                "layerId": layer_id,
                "kind": kind,
            }
        )
        return feature_id

    def _source_feature_id(
        self,
        source_uid: str,
        net_id: int,
        kind: str,
        layer_ids: list[int],
    ) -> int:
        key = (source_uid, net_id, kind)
        existing = self.source_feature_by_key.get(key)
        if existing is not None:
            return existing
        feature_id = len(self.object_features)
        self.source_feature_by_key[key] = feature_id
        self.object_features.append(
            {
                "id": feature_id,
                "sourceUid": source_uid,
                "netId": net_id,
                "layerId": layer_ids[0] if layer_ids else 0,
                "layerIds": layer_ids,
                "layerMask": self._layer_mask(layer_ids),
                "kind": kind,
            }
        )
        return feature_id

    def _layer_mask(self, layer_ids: list[int]) -> int:
        mask = 0
        copper_ids = [int(layer["id"]) for layer in self.copper_layers]
        for layer_id in layer_ids:
            if layer_id in copper_ids:
                mask |= 1 << copper_ids.index(layer_id)
        return mask

    @staticmethod
    def _merge_bounds(current: list[float] | None, incoming: list[float]) -> list[float]:
        if not current:
            return list(incoming)
        return [
            min(current[0], incoming[0]),
            min(current[1], incoming[1]),
            min(current[2], incoming[2]),
            max(current[3], incoming[3]),
            max(current[4], incoming[4]),
            max(current[5], incoming[5]),
        ]

    def _append_polygon(
        self,
        *,
        source_uid: str,
        net_name: str,
        layer_name: str,
        kind: str,
        outer: list[tuple[float, float]],
        holes: list[list[tuple[float, float]]] | None = None,
        feature_id: int | None = None,
    ) -> None:
        outer = clean_ring(outer)
        holes = [clean_ring(hole) for hole in holes or []]
        holes = [hole for hole in holes if len(hole) >= 3]
        layer = self.layer_by_name.get(layer_name)
        if len(outer) < 3 or not layer:
            return
        net_id = self.net_id_by_name.get(net_name, 0)
        layer_id = int(layer["id"])
        if feature_id is None:
            feature_id = self._feature_id(source_uid, net_id, layer_id, kind)
        self.source_polygon_record_id += 1
        source_polygon_record_id = self.source_polygon_record_id
        z_mm = self._runtime_z_mm(float(layer.get("z_mm") or 0.0))
        thickness_mm = float(layer.get("thickness_mm") or 0.035) or 0.035
        xs = [point[0] for point in outer]
        ys = [point[1] for point in outer]
        bounds = [
            min(xs),
            min(ys),
            z_mm - thickness_mm / 2.0,
            max(xs),
            max(ys),
            z_mm + thickness_mm / 2.0,
        ]
        self.objects.append(
            {
                "netId": net_id,
                "objectFeatureId": feature_id,
                "layerId": layer_id,
                "layerName": layer_name,
                "zMm": z_mm,
                "thicknessMm": thickness_mm,
                "kindId": KIND_IDS.get(kind, KIND_IDS["unknown"]),
                "polygons": [
                    {
                        "sourcePolygonRecordId": source_polygon_record_id,
                        "sourceOrder": source_polygon_record_id - 1,
                        "outer": [[point[0], point[1]] for point in outer],
                        "holes": [
                            [[point[0], point[1]] for point in hole]
                            for hole in holes
                        ],
                    }
                ],
            }
        )
        self.feature_bounds[feature_id] = self._merge_bounds(self.feature_bounds.get(feature_id), bounds)
        self.net_bounds[net_id] = self._merge_bounds(self.net_bounds.get(net_id), bounds)
        self.net_layer_bounds[net_id][layer_id] = self._merge_bounds(
            self.net_layer_bounds[net_id].get(layer_id),
            bounds,
        )
        if net_id:
            self.net_layers[net_id].add(layer_name)
            self.net_kind_counts[net_id][kind] += 1

    def add_pcb_ir(
        self,
        pcb_ir: Any,
        *,
        pad_holes: dict[str, dict[str, Any]] | None = None,
    ) -> None:
        payload = pcb_ir.to_dict() if hasattr(pcb_ir, "to_dict") else pcb_ir
        pad_holes = pad_holes or {}
        for record in payload.get("records", []) or []:
            kind = str(record.get("kind") or "")
            if kind == "segment":
                self._add_track(record)
            elif kind in {"track_arc", "arc"}:
                self._add_arc(record)
            elif kind == "zone_fill":
                self._add_zone(record)
            elif kind == "via":
                self._add_via(record)
            elif kind == "footprint":
                self._add_pads(record, pad_holes)

    def add_copper_geometry(self, document: Any) -> None:
        """Add renderer-ready polygons emitted by kicad-monkey."""
        ingest_copper_geometry(self, document)

    def add_component_nodes(self, nodes: list[dict[str, Any]]) -> None:
        self.component_nodes = {
            str(node.get("designator") or ""): node
            for node in nodes
            if node.get("designator")
        }

    def _add_track(self, record: dict[str, Any]) -> None:
        layer = str(record.get("layer") or "")
        net_name = str(record.get("net_name") or "")
        source_uid = str(record.get("uuid") or "")
        for op in record.get("operations", []) or []:
            if op.get("kind") != "ThickSegment":
                continue
            start = point_nm(op.get("start_x"), op.get("start_y"))
            end = point_nm(op.get("end_x"), op.get("end_y"))
            width = float(op.get("width_nm") or 0) * NM_TO_MM
            if width <= 0:
                continue
            self._append_polygon(
                source_uid=source_uid,
                net_name=net_name,
                layer_name=layer,
                kind="track",
                outer=capsule(start, end, width / 2.0),
            )
            self.net_trace_length[self.net_id_by_name.get(net_name, 0)] += math.dist(start, end)

    def _add_arc(self, record: dict[str, Any]) -> None:
        layer = str(record.get("layer") or "")
        net_name = str(record.get("net_name") or "")
        source_uid = str(record.get("uuid") or "")
        for op in record.get("operations", []) or []:
            if op.get("kind") not in {"ArcThreePoint", "ThickArc"}:
                continue
            path = sample_arc_op(op)
            width = float(op.get("width_nm") or 0) * NM_TO_MM
            if width <= 0:
                continue
            for start, end in zip(path, path[1:]):
                self._append_polygon(
                    source_uid=source_uid,
                    net_name=net_name,
                    layer_name=layer,
                    kind="track_arc",
                    outer=capsule(start, end, width / 2.0),
                )
                self.net_trace_length[self.net_id_by_name.get(net_name, 0)] += math.dist(start, end)

    def _add_zone(self, record: dict[str, Any]) -> None:
        operations = [op for op in record.get("operations", []) or [] if op.get("kind") == "PlotPoly"]
        fill_layers = [str(item) for item in record.get("fill_layers", []) or []]
        declared = [str(item) for item in record.get("layers", []) or []]
        if not operations:
            return
        if not fill_layers and len(declared) == 1:
            fill_layers = declared * len(operations)
        if len(fill_layers) != len(operations):
            raise ValueError(
                f"Zone {record.get('uuid') or '<unknown>'} has ambiguous fill-layer assignments"
            )
        for layer, op in zip(fill_layers, operations):
            self._append_polygon(
                source_uid=str(record.get("uuid") or ""),
                net_name=str(record.get("net_name") or ""),
                layer_name=layer,
                kind="zone",
                outer=[point_nm(point[0], point[1]) for point in op.get("points", [])],
            )

    def _add_via(self, record: dict[str, Any]) -> None:
        aperture = next(
            (op for op in record.get("operations", []) or [] if op.get("kind") == "FlashPadCircle"),
            None,
        )
        layers = self._layers_for(record.get("layers", []) or [])
        if not aperture or not layers:
            return
        center = point_nm(aperture.get("x"), aperture.get("y"))
        radius = float(aperture.get("diameter_nm") or 0) * NM_TO_MM / 2.0
        drill = float(record.get("drill") or 0.0)
        outer = circle(center, radius)
        holes = [circle(center, drill / 2.0)] if drill > 0 else []
        net_id = self.net_id_by_name.get(str(record.get("net_name") or ""), 0)
        layer_ids = [int(self.layer_by_name[layer]["id"]) for layer in layers]
        feature_id = self._source_feature_id(
            str(record.get("uuid") or ""),
            net_id,
            "via",
            layer_ids,
        )
        for layer in layers:
            self._append_polygon(
                source_uid=str(record.get("uuid") or ""),
                net_name=str(record.get("net_name") or ""),
                layer_name=layer,
                kind="via",
                outer=outer,
                holes=holes,
                feature_id=feature_id,
            )
        if drill > 0:
            self._append_barrel(
                source_uid=str(record.get("uuid") or ""),
                feature_id=feature_id,
                net_id=net_id,
                kind="via",
                center=center,
                drill_width=drill,
                drill_height=drill,
                layer_names=layers,
                plating_thickness=0.025,
            )

    def _add_pads(
        self,
        record: dict[str, Any],
        pad_holes: dict[str, dict[str, Any]],
    ) -> None:
        placement = record.get("placement") or {}
        origin = point_nm(placement.get("x_nm"), placement.get("y_nm"))
        angle = -float(placement.get("angle_deg") or 0.0)
        block: dict[str, Any] | None = None
        for op in record.get("operations", []) or []:
            if op.get("kind") == "StartBlock" and op.get("data_ref") == "pad":
                block = op
                continue
            if op.get("kind") == "EndBlock":
                block = None
                continue
            if block is None or not str(op.get("kind") or "").startswith("FlashPad"):
                continue
            attrs = block.get("extra_attrs") or {}
            source_uid = str(block.get("data_uuid") or block.get("label") or "")
            net_name = str(attrs.get("net") or "")
            layers = self._layers_for(op.get("layers") or block.get("layers") or [])
            rings = [
                [transform(point, origin, angle) for point in ring]
                for ring in pad_rings(op)
            ]
            hole_info = pad_holes.get(source_uid) or {}
            drill = float(hole_info.get("drill_mm") or 0.0)
            center = transform(point_nm(op.get("x"), op.get("y")), origin, angle)
            holes = [circle(center, drill / 2.0)] if drill > 0 else []
            net_id = self.net_id_by_name.get(net_name, 0)
            layer_ids = [int(self.layer_by_name[layer]["id"]) for layer in layers]
            is_plated = drill > 0 and bool(hole_info.get("plated", True))
            feature_id = (
                self._source_feature_id(source_uid, net_id, "pad", layer_ids)
                if is_plated
                else None
            )
            for layer in layers:
                for ring in rings:
                    self._append_polygon(
                        source_uid=source_uid,
                        net_name=net_name,
                        layer_name=layer,
                        kind="pad",
                        outer=ring,
                        holes=holes,
                        feature_id=feature_id,
                    )
            if is_plated:
                self._append_barrel(
                    source_uid=source_uid,
                    feature_id=int(feature_id),
                    net_id=net_id,
                    kind="plated_pad",
                    center=center,
                    drill_width=float(hole_info.get("drill_width_mm") or drill),
                    drill_height=float(hole_info.get("drill_height_mm") or drill),
                    layer_names=layers,
                    plating_thickness=0.025,
                )

    def _append_barrel(
        self,
        *,
        source_uid: str,
        feature_id: int,
        net_id: int,
        kind: str,
        center: tuple[float, float],
        drill_width: float,
        drill_height: float,
        layer_names: list[str],
        plating_thickness: float,
    ) -> None:
        layers = [self.layer_by_name[name] for name in layer_names if name in self.layer_by_name]
        if not layers:
            return
        z_values = [
            self._runtime_z_mm(float(layer.get("z_mm") or 0.0))
            for layer in layers
        ]
        start_z, end_z = z_values[0], z_values[-1]
        bounds = [
            center[0] - drill_width / 2.0 - plating_thickness,
            center[1] - drill_height / 2.0 - plating_thickness,
            min(start_z, end_z),
            center[0] + drill_width / 2.0 + plating_thickness,
            center[1] + drill_height / 2.0 + plating_thickness,
            max(start_z, end_z),
        ]
        record = {
            "sourceUid": source_uid,
            "objectFeatureId": feature_id,
            "netId": net_id,
            "kind": kind,
            "centerMm": list(center),
            "drillWidthMm": drill_width,
            "drillHeightMm": drill_height,
            "outerWidthMm": drill_width + plating_thickness * 2.0,
            "outerHeightMm": drill_height + plating_thickness * 2.0,
            "platingThicknessMm": plating_thickness,
            "platingThicknessSource": "default",
            "startLayerId": int(layers[0]["id"]),
            "endLayerId": int(layers[-1]["id"]),
            "layerIds": [int(layer["id"]) for layer in layers],
            "layerMask": self._layer_mask([int(layer["id"]) for layer in layers]),
            "startZMm": start_z,
            "endZMm": end_z,
            "boundsMm": bounds,
        }
        self.barrels.append(record)
        self.feature_bounds[feature_id] = self._merge_bounds(self.feature_bounds.get(feature_id), bounds)
        self.net_bounds[net_id] = self._merge_bounds(self.net_bounds.get(net_id), bounds)

    def build_input_payload(self, *, tile_size_mm: float = TILE_SIZE_MM) -> dict[str, Any]:
        for net in self.nets[1:]:
            net_id = int(net["id"])
            net["metrics"] = {
                "traceLengthMm": round(self.net_trace_length[net_id], 6),
                "layers": sorted(self.net_layers[net_id]),
                "objectCounts": dict(sorted(self.net_kind_counts[net_id].items())),
            }
            net["boundsMm"] = self.net_bounds.get(net_id)
            net["layerBoundsMm"] = {
                str(layer_id): bounds
                for layer_id, bounds in sorted(self.net_layer_bounds[net_id].items())
            }
        for feature in self.object_features:
            feature["boundsMm"] = self.feature_bounds.get(int(feature["id"]))
        revision_source = json.dumps(
            {
                "layers": self.layers,
                "nets": self.nets,
                "objects": self.objects,
                "barrels": self.barrels,
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        components = []
        for component in self.topology.get("components", []) or []:
            designator = str(component.get("designator") or "")
            node = self.component_nodes.get(designator, {})
            components.append(
                {
                    "id": len(components) + 1,
                    "featureId": len(self.object_features) + len(components),
                    "uid": str(component.get("uid") or ""),
                    "designator": designator,
                    "value": str(component.get("value") or ""),
                    "footprint": str(component.get("footprint") or ""),
                    "nodeIndex": node.get("node_index"),
                    "meshNames": node.get("mesh_names", []),
                }
            )
        payload = {
            "schema": "prism.semantic_gltf_build_a0",
            "tileSizeMm": tile_size_mm,
            "geometryRevision": hashlib.sha256(revision_source).hexdigest(),
            "coordinateSystem": {
                "source": {
                    "axes": {"x": "board-right", "y": "board-down", "z": "stackup-up"},
                    "units": "millimetres",
                    "handedness": "right",
                },
                "gltf": {
                    "axes": {"x": "board-right", "y": "stackup-up", "z": "board-down"},
                    "units": "millimetres",
                    "handedness": "right",
                },
                "runtime": {
                    "axes": {"x": "board-right", "y": "board-up", "z": "stackup-up"},
                    "sourceToRuntime": ["x", "-y", "z"],
                    "gltfToRuntime": ["x", "-z", "y"],
                    "units": "millimetres",
                    "handedness": "right",
                },
            },
            "layers": self.layers,
            "nets": self.nets,
            "objectFeatures": self.object_features,
            "objects": self.objects,
            "barrels": self.barrels,
            "components": components,
        }
        return payload

    def write_input(self, path: Path, *, tile_size_mm: float = TILE_SIZE_MM) -> dict[str, Any]:
        payload = self.build_input_payload(tile_size_mm=tile_size_mm)
        path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        return payload


def build_semantic_gltf_scene(
    topology: dict[str, Any],
    semantic_geometry: dict[str, Any],
    geometry_source: Any,
    output_dir: Path,
    *,
    pad_holes: dict[str, dict[str, Any]] | None = None,
    tile_size_mm: float = TILE_SIZE_MM,
    force_rebuild: bool = False,
    clean_cache: bool = False,
    cache_dir: Path | None = None,
    meshopt_level: str = "medium",
    progress: Callable[[str], None] | None = None,
    profile_callback: Callable[[str, dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    assets = semantic_geometry.get("assets", {})
    base_asset = str(assets.get("base_board_glb") or "")
    base_path = output_dir / base_asset if base_asset else None
    collect_started = time.perf_counter()
    started = time.perf_counter()
    builder = SemanticGltfBuilder(topology, base_path)
    if profile_callback:
        profile_callback("builder_init", {"elapsed_ms": (time.perf_counter() - started) * 1000.0})
    started = time.perf_counter()
    is_copper_geometry = is_copper_geometry_document(geometry_source)
    if is_copper_geometry:
        if progress:
            progress(
                "semantic GLTF collect copper emit "
                f"features={len(geometry_source.features)} drills={len(geometry_source.drills)}"
            )
        builder.add_copper_geometry(geometry_source)
        profile_stage = "add_copper_geometry"
    else:
        pcb_payload = geometry_source.to_dict() if hasattr(geometry_source, "to_dict") else geometry_source
        if profile_callback:
            records = pcb_payload.get("records", []) if isinstance(pcb_payload, dict) else []
            by_kind: dict[str, int] = {}
            for record in records:
                kind = str(record.get("kind") or "")
                by_kind[kind] = by_kind.get(kind, 0) + 1
            profile_callback(
                "pcb_ir_to_dict",
                {
                    "elapsed_ms": (time.perf_counter() - started) * 1000.0,
                    "records": len(records),
                    "records_by_kind": by_kind,
                },
            )
        if progress:
            records = pcb_payload.get("records", []) if isinstance(pcb_payload, dict) else []
            progress(f"semantic GLTF collect PCB IR records={len(records)}")
        started = time.perf_counter()
        builder.add_pcb_ir(pcb_payload, pad_holes=pad_holes)
        profile_stage = "add_pcb_ir"
    if profile_callback:
        profile_callback(
            profile_stage,
            {
                "elapsed_ms": (time.perf_counter() - started) * 1000.0,
                "objects": len(builder.objects),
                "barrels": len(builder.barrels),
                "features": len(builder.object_features),
            },
        )
    started = time.perf_counter()
    builder.add_component_nodes(semantic_geometry.get("components", []) or [])
    if profile_callback:
        profile_callback(
            "add_component_nodes",
            {
                "elapsed_ms": (time.perf_counter() - started) * 1000.0,
                "components": len(builder.component_nodes),
            },
        )
    if progress:
        progress(
            "semantic GLTF collected "
            f"objects={len(builder.objects)} barrels={len(builder.barrels)} "
            f"features={len(builder.object_features)} nets={len(builder.nets) - 1}"
        )
    scene_dir = output_dir / "scene-gltf"
    tool = Path(__file__).resolve().parents[2] / "tools" / "semantic-gltf" / "build.mjs"
    cache_root = (cache_dir or (output_dir.parent / ".cache")) / "semantic-gltf"
    input_cache_dir = cache_root / "inputs"
    scene_cache_root = cache_root / "scenes"
    input_cache_dir.mkdir(parents=True, exist_ok=True)
    scene_cache_root.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    payload = builder.build_input_payload(tile_size_mm=tile_size_mm)
    if profile_callback:
        profile_callback(
            "build_input_payload",
            {
                "elapsed_ms": (time.perf_counter() - started) * 1000.0,
                "objects": len(payload.get("objects", []) or []),
                "barrels": len(payload.get("barrels", []) or []),
                "features": len(payload.get("objectFeatures", []) or []),
                "nets": len(payload.get("nets", []) or []),
            },
        )
    payload["meshoptLevel"] = meshopt_level
    source_geometry_revision = str(payload["geometryRevision"])
    started = time.perf_counter()
    compiler_identity = _semantic_geometry_compiler_identity(
        tile_size_mm=tile_size_mm,
        meshopt_level=meshopt_level,
    )
    compiler_revision = hashlib.sha256(
        json.dumps(compiler_identity, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    payload["sourceGeometryRevision"] = source_geometry_revision
    payload["geometryCompiler"] = {
        **compiler_identity,
        "revision": compiler_revision,
    }
    payload["geometryRevision"] = hashlib.sha256(
        json.dumps(
            {
                "sourceGeometryRevision": source_geometry_revision,
                "geometryCompiler": payload["geometryCompiler"],
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    if profile_callback:
        profile_callback(
            "geometry_revision_hash",
            {"elapsed_ms": (time.perf_counter() - started) * 1000.0},
        )
    started = time.perf_counter()
    input_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    input_digest = hashlib.sha256(input_bytes).hexdigest()
    input_path = input_cache_dir / f"{payload['geometryRevision']}-{meshopt_level}.json"
    input_cache_hit = input_path.exists()
    if not input_cache_hit:
        input_path.write_bytes(input_bytes)
    if profile_callback:
        profile_callback(
            "serialize_input",
            {
                "elapsed_ms": (time.perf_counter() - started) * 1000.0,
                "input_json_bytes": len(input_bytes),
                "cache_hit": input_cache_hit,
            },
        )
    if profile_callback:
        profile_callback(
            "collect_total",
            {
                "elapsed_ms": (time.perf_counter() - collect_started) * 1000.0,
                "objects": len(payload.get("objects", []) or []),
                "barrels": len(payload.get("barrels", []) or []),
                "features": len(payload.get("objectFeatures", []) or []),
                "nets": len(payload.get("nets", []) or []),
                "input_json_bytes": input_path.stat().st_size if input_path.exists() else 0,
            },
        )
    if progress:
        progress(
            f"semantic GLTF input revision={payload['geometryRevision'][:12]} "
            f"bytes={input_path.stat().st_size / 1_000_000:.1f} MB "
            f"meshopt={meshopt_level} cache={cache_root}"
        )
    manifest_path = scene_dir / "scene.manifest.json"
    existing_manifest = None
    if manifest_path.exists():
        existing_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest_files_complete = False
    if existing_manifest:
        manifest_files_complete = all(
            (manifest_path.parent / str(tile.get("path") or "")).is_file()
            for tile in existing_manifest.get("tiles", [])
        )
    cache_hit = bool(
        not force_rebuild
        and
        existing_manifest
        and existing_manifest.get("geometryRevision") == payload["geometryRevision"]
        and manifest_files_complete
    )
    persistent_scene_dir = scene_cache_root / f"{payload['geometryRevision']}-{meshopt_level}"
    persistent_manifest_path = persistent_scene_dir / "scene.manifest.json"
    persistent_manifest = None
    if persistent_manifest_path.exists() and not clean_cache:
        try:
            persistent_manifest = json.loads(persistent_manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            persistent_manifest = None
    persistent_scene_complete = bool(
        persistent_manifest
        and persistent_manifest.get("geometryRevision") == payload["geometryRevision"]
        and all(
            (persistent_manifest_path.parent / str(tile.get("path") or "")).is_file()
            for tile in persistent_manifest.get("tiles", [])
        )
    )
    if profile_callback:
        profile_callback(
            "cache_decision",
            {
                "output_cache_hit": cache_hit,
                "persistent_cache_hit": persistent_scene_complete,
                "force_rebuild": force_rebuild,
                "clean_cache": clean_cache,
            },
        )
    if not cache_hit:
        shutil.rmtree(scene_dir, ignore_errors=True)
        if persistent_scene_complete and not force_rebuild and not clean_cache:
            if progress:
                progress(f"semantic GLTF persistent scene cache hit revision={payload['geometryRevision'][:12]}")
            started = time.perf_counter()
            shutil.copytree(persistent_scene_dir, scene_dir)
            if profile_callback:
                profile_callback(
                    "persistent_scene_restore",
                    {"elapsed_ms": (time.perf_counter() - started) * 1000.0},
                )
        else:
            if progress:
                if force_rebuild:
                    progress("semantic GLTF output scene cache bypassed by force rebuild")
                if clean_cache:
                    progress("semantic GLTF persistent scene cache bypassed by clean cache")
                elif existing_manifest and existing_manifest.get("geometryRevision") == payload["geometryRevision"] and not manifest_files_complete:
                    progress("semantic GLTF output scene cache invalid: manifest references missing tile files")
                elif persistent_manifest and not persistent_scene_complete:
                    progress("semantic GLTF persistent scene cache invalid: manifest references missing tile files")
                progress("semantic GLTF node builder: start")
            node_env = {
                "PRISM_SEMANTIC_CLIPPER": compiler_identity["clipperBackend"],
            }
            native_preclip = _prepare_native_preclip(
                payload,
                cache_root=cache_root,
                compiler_identity=compiler_identity,
                input_digest=input_digest,
                progress=progress,
                profile_callback=profile_callback,
            )
            if native_preclip:
                node_env.update(native_preclip)
            with tempfile.TemporaryDirectory(prefix="semantic-node-profile-") as profile_tmp:
                node_metrics_path = Path(profile_tmp) / "metrics.json"
                if profile_callback:
                    node_env["PRISM_SEMANTIC_GLTF_METRICS_PATH"] = str(node_metrics_path)
                started = time.perf_counter()
                _run_node_builder(
                    ["node", str(tool), str(input_path), str(scene_dir)],
                    env=node_env,
                    progress=progress,
                )
                if profile_callback:
                    event: dict[str, Any] = {
                        "elapsed_ms": (time.perf_counter() - started) * 1000.0,
                    }
                    if node_metrics_path.is_file():
                        event["node_metrics"] = json.loads(node_metrics_path.read_text(encoding="utf-8"))
                    profile_callback("node_builder", event)
            if progress:
                progress("semantic GLTF persistent scene cache update: start")
            temp_cache_scene = persistent_scene_dir.with_name(f"{persistent_scene_dir.name}.tmp-{int(time.time() * 1000)}")
            shutil.rmtree(temp_cache_scene, ignore_errors=True)
            started = time.perf_counter()
            shutil.copytree(scene_dir, temp_cache_scene)
            if persistent_scene_dir.exists():
                shutil.rmtree(persistent_scene_dir)
            temp_cache_scene.rename(persistent_scene_dir)
            if profile_callback:
                profile_callback(
                    "persistent_scene_update",
                    {"elapsed_ms": (time.perf_counter() - started) * 1000.0},
                )
            if progress:
                progress("semantic GLTF persistent scene cache update: done")
    elif progress:
        progress(f"semantic GLTF scene cache hit revision={payload['geometryRevision'][:12]}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    missing_tiles = [
        str(tile.get("path") or "")
        for tile in manifest.get("tiles", [])
        if not (manifest_path.parent / str(tile.get("path") or "")).is_file()
    ]
    if missing_tiles:
        preview = ", ".join(missing_tiles[:8])
        suffix = "" if len(missing_tiles) <= 8 else f", ... +{len(missing_tiles) - 8} more"
        raise RuntimeError(f"semantic GLTF manifest references missing tile files: {preview}{suffix}")
    if progress:
        progress(
            "semantic GLTF manifest "
            f"tiles={len(manifest.get('tiles', []))} "
            f"bytes={sum(int(tile.get('bytes') or 0) for tile in manifest.get('tiles', [])) / 1_000_000:.1f} MB"
        )
    if profile_callback:
        profile_callback(
            "manifest_validate",
            {
                "tiles": len(manifest.get("tiles", [])),
                "bytes": sum(int(tile.get("bytes") or 0) for tile in manifest.get("tiles", [])),
                "missing_tiles": len(missing_tiles),
            },
        )
    return {
        "schema": SCHEMA,
        "path": "scene-gltf/scene.manifest.json",
        "geometryRevision": payload["geometryRevision"],
        "tiles": len(manifest.get("tiles", [])),
        "bytes": sum(int(tile.get("bytes") or 0) for tile in manifest.get("tiles", [])),
    }


def _semantic_geometry_compiler_identity(
    *,
    tile_size_mm: float,
    meshopt_level: str,
) -> dict[str, Any]:
    backend = _semantic_clipper_backend()
    clipped_input = os.environ.get("PRISM_SEMANTIC_CLIPPED_INPUT")
    clipped_input_digest = _file_digest(Path(clipped_input)) if clipped_input else None
    runtime_backend = backend
    if backend == "auto":
        if clipped_input:
            runtime_backend = "native-preclipped"
        elif prism_clipper2_library_info().get("a2Support"):
            runtime_backend = "clipper2-native"
        else:
            runtime_backend = "js-fallback"
    elif backend in {"clipper2", "clipper2-a2", "verify", "verify-clipper2-a2"}:
        runtime_backend = "clipper2-preclipped" if clipped_input else "clipper2-native"
    clipper2_info: dict[str, Any] = {}
    if runtime_backend in {"clipper2-native", "clipper2-preclipped"} or os.environ.get("PRISM_CLIPPER2_LIBRARY"):
        clipper2_info = prism_clipper2_library_info()
    return {
        "compilerVersion": SEMANTIC_GEOMETRY_COMPILER_VERSION,
        "protocolVersion": SEMANTIC_GEOMETRY_PROTOCOL_VERSION,
        "clipperProtocolVersion": SEMANTIC_CLIPPER_PROTOCOL_VERSION,
        "clipperBackend": backend,
        "clipperRuntimeBackend": runtime_backend,
        "preclippedInputDigest": clipped_input_digest,
        "clipper2Library": clipper2_info.get("libraryPath") or os.environ.get("PRISM_CLIPPER2_LIBRARY"),
        "clipper2LibrarySha256": clipper2_info.get("librarySha256"),
        "clipper2Version": clipper2_info.get("version"),
        "clipper2Abi": clipper2_info.get("abiVersion"),
        "clipper2Protocol": "a2",
        "clipper2BatchSymbol": "prism_clipper2_batch_a2_bytes"
        if runtime_backend in {"clipper2-native", "clipper2-preclipped"}
        else None,
        "tileSizeMm": tile_size_mm,
        "meshoptLevel": meshopt_level,
    }


def _prepare_native_preclip(
    payload: dict[str, Any],
    *,
    cache_root: Path,
    compiler_identity: dict[str, Any],
    input_digest: str | None = None,
    progress: Callable[[str], None] | None = None,
    profile_callback: Callable[[str, dict[str, Any]], None] | None = None,
) -> dict[str, str] | None:
    backend = str(compiler_identity.get("clipperBackend") or "")
    existing = os.environ.get("PRISM_SEMANTIC_CLIPPED_INPUT")
    if existing:
        return {"PRISM_SEMANTIC_CLIPPED_INPUT": existing}
    if backend == "js":
        return None
    native_backend = _native_backend_for_semantic_mode(backend)
    if native_backend == "js":
        return None
    if native_backend == "clipper2" and not prism_clipper2_library_info().get("a2Support"):
        if backend == "auto":
            return None
        raise RuntimeError(
            "PRISM_SEMANTIC_CLIPPER="
            f"{backend} requires PRISM_CLIPPER2_LIBRARY, a packaged libprism_clipper2, "
            "or PRISM_SEMANTIC_CLIPPED_INPUT"
        )
    preclip_dir = cache_root / "preclipped"
    preclip_dir.mkdir(parents=True, exist_ok=True)
    revision = str(payload.get("sourceGeometryRevision") or payload.get("geometryRevision") or "unknown")
    native_protocol = "a2"
    native_identity = _native_preclip_identity(native_backend, compiler_identity)
    preclip_identity = {
        "semanticProtocolVersion": compiler_identity.get("protocolVersion"),
        "nativeBackend": native_backend,
        "nativeProtocol": native_protocol,
        **native_identity,
        "tileSizeMm": payload.get("tileSizeMm"),
        "meshoptLevel": compiler_identity.get("meshoptLevel"),
        "geometryRevision": payload.get("geometryRevision"),
        "inputDigest": input_digest or _payload_digest(payload),
    }
    preclip_key = hashlib.sha256(
        json.dumps(preclip_identity, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    preclip_path = preclip_dir / f"{revision}-{payload.get('tileSizeMm')}-clipper-{native_backend}-{native_protocol}-{preclip_key[:16]}.json"
    if not preclip_path.exists():
        if progress:
            progress(f"semantic GLTF native {native_backend} clipper: start")
        try:
            if native_backend != "clipper2":
                raise NativeClipperError(f"unsupported native semantic clipping backend {native_backend!r}")
            response, timings = build_native_clip_response(
                payload,
                library=PrismClipper2Library(),
                protocol="a2",
            )
        except NativeClipperError as exc:
            if backend == "auto":
                if progress:
                    progress(f"semantic GLTF native {native_backend} unavailable; falling back to JS: {exc}")
                return None
            raise RuntimeError(f"native {native_backend} semantic clipping failed: {exc}") from exc
        serialize_started = time.perf_counter()
        preclip_path.write_text(json.dumps(response, separators=(",", ":")), encoding="utf-8")
        if profile_callback:
            profile_callback(
                "native_preclip",
                {
                    "elapsed_ms": timings.get("native_total_ms", 0.0),
                    **{key: value for key, value in timings.items() if isinstance(value, (int, float))},
                    "serialize_ms": (time.perf_counter() - serialize_started) * 1000.0,
                    "bytes": preclip_path.stat().st_size,
                    "cache_hit": False,
                },
            )
        if progress:
            stats = response.get("stats") or {}
            progress(
                f"semantic GLTF native {native_backend} clipper: "
                f"jobs={stats.get('native_boolean_jobs', 0)} "
                f"regions={stats.get('clipped_regions', 0)} "
                f"nativeMs={timings.get('native_batch_call_ms', 0):.1f} "
                f"totalMs={timings.get('native_total_ms', 0):.1f}"
            )
    elif profile_callback:
        profile_callback(
            "native_preclip",
            {"elapsed_ms": 0.0, "bytes": preclip_path.stat().st_size, "cache_hit": True},
        )
    return {"PRISM_SEMANTIC_CLIPPED_INPUT": str(preclip_path)}


def _semantic_clipper_backend() -> str:
    value = os.environ.get("PRISM_SEMANTIC_CLIPPER", "auto").strip().lower()
    if value not in {
        "js",
        "clipper2",
        "clipper2-a2",
        "auto",
        "verify",
        "verify-clipper2-a2",
    }:
        raise ValueError(
            "PRISM_SEMANTIC_CLIPPER must be one of js, clipper2, clipper2-a2, "
            "auto, verify, verify-clipper2-a2; "
            f"got {value!r}"
        )
    return value


def _requested_native_backend() -> str:
    value = os.environ.get("PRISM_NATIVE_CLIPPER_BACKEND", "auto").strip().lower()
    if value not in {"auto", "clipper2"}:
        raise ValueError(f"PRISM_NATIVE_CLIPPER_BACKEND must be auto or clipper2; got {value!r}")
    return value


def _native_backend_for_semantic_mode(mode: str) -> str:
    if mode in {"js"}:
        return "js"
    if mode in {"clipper2", "clipper2-a2", "verify", "verify-clipper2-a2"}:
        return "clipper2"
    requested = _requested_native_backend()
    if requested == "clipper2":
        return requested
    if prism_clipper2_library_info().get("a2Support"):
        return "clipper2"
    return "js"


def _native_preclip_identity(native_backend: str, compiler_identity: dict[str, Any]) -> dict[str, Any]:
    if native_backend == "clipper2":
        return {
            "nativeAbi": compiler_identity.get("clipper2Abi"),
            "nativeVersion": compiler_identity.get("clipper2Version"),
            "nativeLibrarySha256": compiler_identity.get("clipper2LibrarySha256"),
            "nativeBatchSymbol": compiler_identity.get("clipper2BatchSymbol"),
        }
    return {}


def _file_digest(path: Path) -> str:
    if not path.exists():
        return f"missing:{path}"
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _payload_digest(payload: dict[str, Any]) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _run_node_builder(
    cmd: list[str],
    *,
    env: dict[str, str] | None = None,
    progress: Callable[[str], None] | None = None,
) -> None:
    process_env = os.environ.copy()
    if env:
        process_env.update(env)
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        env=process_env,
    )
    assert process.stdout is not None
    tail: list[str] = []
    for raw_line in process.stdout:
        line = raw_line.strip()
        if not line:
            continue
        tail.append(line)
        tail = tail[-40:]
        if progress:
            progress(f"semantic GLTF node: {line}")
    return_code = process.wait()
    if return_code != 0:
        detail = "\n".join(tail)
        raise RuntimeError(f"Semantic GLB build failed with code {return_code}: {detail}")
