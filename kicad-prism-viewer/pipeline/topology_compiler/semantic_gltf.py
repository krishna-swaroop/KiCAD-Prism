from __future__ import annotations

import gc
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
from .models import stable_id
from .native_clipper import NativeClipperError, build_native_clip_response
from .prism_clipper2 import PrismClipper2Library, prism_clipper2_library_info
from .stackup_frame import board_frame, outward_sign
from .pcb_geometry import (
    KIND_IDS,
    NM_TO_MM,
    capsule,
    circle,
    clean_ring,
    pad_drill_ops,
    pad_rings,
    point_nm,
    sample_arc_op,
    transform,
)


def _pad_drill(
    hole_info: dict[str, Any],
    pad_center: tuple[float, float],
    origin: tuple[float, float],
    angle: float,
) -> dict[str, Any]:
    """A pad's drill in board millimetres: its centre, outline ring, and the
    width (along its axis), height and rotation a barrel record carries.

    A slot comes from its drill segment, so it keeps its true rotation and any
    drill offset; a round drill from its circle op; older pad-hole records with
    neither fall back to the pad centre and the width/height sizes.
    """
    drill = float(hole_info.get("drill_mm") or 0.0)
    slot = hole_info.get("slot_nm")
    if slot and all(value is not None for value in slot):
        start = transform(point_nm(slot[0], slot[1]), origin, angle)
        end = transform(point_nm(slot[2], slot[3]), origin, angle)
        width = float(slot[4]) * NM_TO_MM
        length = math.dist(start, end)
        if length > 1e-9 and width > 0:
            return {
                "center": ((start[0] + end[0]) / 2.0, (start[1] + end[1]) / 2.0),
                "ring": capsule(start, end, width / 2.0, segments=16),
                "width": length + width,
                "height": width,
                "rotation_deg": math.degrees(math.atan2(end[1] - start[1], end[0] - start[0])),
            }
        drill = width or drill
    center = pad_center
    drill_center = hole_info.get("drill_center_nm")
    if drill_center and all(value is not None for value in drill_center):
        center = transform(point_nm(drill_center[0], drill_center[1]), origin, angle)
    width = float(hole_info.get("drill_width_mm") or drill)
    height = float(hole_info.get("drill_height_mm") or drill)
    return {
        "center": center,
        "ring": circle(center, drill / 2.0),
        "width": width,
        "height": height,
        "rotation_deg": 0.0,
    }


SCHEMA = "prism.semantic_gltf_a0"
TILE_SIZE_MM = 20.0
SEMANTIC_GEOMETRY_PROTOCOL_VERSION = "prism.semantic_geometry_protocol_a1"
SEMANTIC_CLIPPER_PROTOCOL_VERSION = "prism.semantic_clipper_response_a1"
SEMANTIC_GEOMETRY_COMPILER_VERSION = "semantic-gltf-clipper-a2-canonical-frame"


def _polygon_rings(polygon: Any) -> list[list[list[float]]]:
    """A shapely polygon's exterior then interiors, as the builder's open point lists."""
    import numpy as np
    import shapely

    coords, ring_index = shapely.get_coordinates(shapely.get_rings(polygon), return_index=True)
    ends = np.flatnonzero(np.diff(ring_index)) + 1
    # Shapely's rings are closed and free of repeated points: drop each closing point.
    return [ring[:-1].tolist() for ring in np.split(coords, ends)]


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
            aliases = [
                str(alias)
                for alias in net.get("aliases", []) or []
                if alias and str(alias) != name
            ]
            net_id = self._register_net(
                name,
                uid=str(net.get("uid") or ""),
                net_class=str(net.get("net_class") or ""),
                aliases=aliases,
            )
            # A name the topology already owns keeps its id; an alias never
            # steals a net's own name.
            for alias in aliases:
                self.net_id_by_name.setdefault(alias, net_id)
        self.objects: list[dict[str, Any]] = []
        # Outer-ring bounding box of each object, for the drilling pass.
        self._object_boxes: list[tuple[float, float, float, float]] = []
        # Index of the drill an object was built around (its own hole), or -1.
        self._object_drill: list[int] = []
        self._own_drill = -1
        # Set by build_input_payload: the objects as compact JSON.
        self.objects_json: str | None = None
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
        # Centred stackup z plus this is KiCad's board frame (bottom copper inner face at 0).
        self.board_z_offset_mm: float | None = None
        self.board_thickness_mm = float(topology.get("board", {}).get("thickness_mm") or 0.0)
        self._set_canonical_board_y_range()

    def _register_net(
        self,
        name: str,
        *,
        uid: str = "",
        net_class: str = "",
        aliases: list[str] | None = None,
    ) -> int:
        net_id = len(self.nets)
        self.net_id_by_name[name] = net_id
        self.nets.append(
            {
                "id": net_id,
                "uid": uid or stable_id("net", name),
                "name": name,
                "netClass": net_class,
                "aliases": list(aliases or []),
                "metrics": {
                    "traceLengthMm": 0.0,
                    "layers": [],
                    "objectCounts": {},
                },
                "analysis": {},
            }
        )
        return net_id

    def _net_id(self, net_name: str) -> int:
        """The scene id for a copper record's net, 0 for no net.

        Copper carries the board's net name. The topology normally already
        maps it (``_reconcile_board_nets``); a name it never saw, such as a
        net routed without any pad, is registered here so its copper is still
        attributable rather than lumped into net 0.
        """

        if not net_name:
            return 0
        net_id = self.net_id_by_name.get(net_name)
        if net_id is None:
            net_id = self._register_net(net_name)
        return net_id

    def _set_canonical_board_y_range(self) -> None:
        """Derive KiCad's board-body frame from stackup facts, without opening a GLB.

        KiCad's exported substrate spans the inward faces of the outer copper
        layers, and its outer copper sits on those faces.  The stackup is therefore
        shifted, not scaled, into that frame: scaling the full board thickness onto
        the substrate pushed the outer copper inside the substrate, where the solder
        mask openings showed substrate instead of copper.
        """

        if self.board_thickness_mm <= 0:
            return
        frame = board_frame(
            (float(layer.get("z_mm") or 0.0), float(layer.get("thickness_mm") or 0.0))
            for layer in self.copper_layers
        )
        if frame is not None and frame[1] > 0:
            offset, body_thickness = frame
            self.board_y_min_mm = 0.0
            self.board_y_max_mm = body_thickness
            self.board_z_offset_mm = offset

    def _runtime_z_mm(self, centered_z_mm: float) -> float:
        if self.board_z_offset_mm is None:
            return centered_z_mm
        return centered_z_mm + self.board_z_offset_mm

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
        net_id = self._net_id(net_name)
        layer_id = int(layer["id"])
        if feature_id is None:
            feature_id = self._feature_id(source_uid, net_id, layer_id, kind)
        self.source_polygon_record_id += 1
        source_polygon_record_id = self.source_polygon_record_id
        centered_z_mm = float(layer.get("z_mm") or 0.0)
        z_mm = self._runtime_z_mm(centered_z_mm)
        thickness_mm = float(layer.get("thickness_mm") or 0.035) or 0.035
        xs = [point[0] for point in outer]
        ys = [point[1] for point in outer]
        self._object_boxes.append((min(xs), min(ys), max(xs), max(ys)))
        self._object_drill.append(self._own_drill)
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
                # Face drawn for the layer: the outward one, so outer copper is on the surface.
                "surfaceSign": outward_sign(centered_z_mm),
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
        self._drills: list[tuple[tuple[float, float], list[tuple[float, float]], frozenset[str] | None]] = []
        first_object = len(self.objects)
        # A board makes millions of small point lists and no reference cycles;
        # the cyclic collector would rescan them all over and over.
        collecting = gc.isenabled()
        gc.disable()
        try:
            for record in payload.get("records", []) or []:
                kind = str(record.get("kind") or "")
                self._own_drill = -1
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
            self._own_drill = -1
            self._drill_copper(first_object)
        finally:
            if collecting:
                gc.enable()

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
            self.net_trace_length[self._net_id(net_name)] += math.dist(start, end)

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
                self.net_trace_length[self._net_id(net_name)] += math.dist(start, end)

    def _drill_copper(self, first_object: int) -> None:
        """Knock every drill out of the copper it passes through.

        KiCad leaves holes to the drill file: a zone fill covers a same-net,
        solidly connected hole (stitching vias, a mounting hole on GND), a
        track ends at the centre of its via or pin, and a mounting pad covers
        the stitching vias in its ring. Each pad and via is built with its own
        hole only, so without this pass those holes render capped wherever
        other copper on the same layer covers them.

        Large boards have thousands of drills inside a few huge pours, so the
        tests run in bulk against prepared shapes, and a drill lying wholly
        inside a shape becomes a new hole ring without a polygon overlay.
        """
        if not self._drills:
            return
        import numpy as np
        import shapely

        objects = self.objects[first_object:]
        if not objects:
            return
        # The same ring (a 32-gon, or a slot's capsule) each pad and via cuts for its own hole.
        # Rings differ in length (circles and capsules), so each becomes its own polygon.
        disc_rings = [[[x, y] for x, y in ring] for _, ring, _ in self._drills]
        discs = np.array([shapely.Polygon(ring) for ring in disc_rings], dtype=object)
        tree = shapely.STRtree(discs)
        boxes = np.array(self._object_boxes[first_object:], dtype=float)
        box_index, disc_index = tree.query(shapely.box(*boxes.T), predicate="intersects")
        # An object's own drill is already its hole.
        own = np.array(self._object_drill[first_object:], dtype=np.int64)
        keep = own[box_index] != disc_index
        box_index, disc_index = box_index[keep], disc_index[keep]
        keep = np.fromiter(
            (
                self._drills[disc][2] is None or objects[item]["layerName"] in self._drills[disc][2]
                for item, disc in zip(box_index.tolist(), disc_index.tolist())
            ),
            dtype=bool,
            count=len(box_index),
        )
        box_index, disc_index = box_index[keep], disc_index[keep]
        if not len(box_index):
            return

        candidates, pair_shape = np.unique(box_index, return_inverse=True)
        shapes = np.array(
            [
                shapely.polygons(
                    np.asarray(objects[item]["polygons"][0]["outer"], dtype=float),
                    [np.asarray(hole, dtype=float) for hole in objects[item]["polygons"][0].get("holes") or []]
                    or None,
                )
                for item in candidates.tolist()
            ],
            dtype=object,
        )
        # KiCad zone fills arrive fractured: one ring with zero-width slits out
        # to each hole. "structure" rebuilds a polygon with real holes; the
        # default repair returns a collection that the predicates crawl on.
        repaired = ~shapely.is_valid(shapes)
        if repaired.any():
            shapes[repaired] = shapely.make_valid(shapes[repaired], method="structure", keep_collapsed=False)
        shapely.prepare(shapes)
        pair_shapes = shapes[pair_shape]
        pair_discs = discs[disc_index]
        inside = shapely.contains_properly(pair_shapes, pair_discs)
        crossing = np.zeros(len(inside), dtype=bool)
        touching = ~inside & shapely.intersects(pair_shapes, pair_discs)
        if touching.any():
            # Copper that only touches a drill keeps its outline.
            crossing[touching] = shapely.relate_pattern(pair_shapes[touching], pair_discs[touching], "T********")

        per_shape: dict[int, tuple[list[int], list[int]]] = {}
        for shape_slot, disc, is_inside, is_crossing in zip(
            pair_shape.tolist(), disc_index.tolist(), inside.tolist(), crossing.tolist()
        ):
            if is_inside or is_crossing:
                per_shape.setdefault(shape_slot, ([], []))[0 if is_inside else 1].append(disc)
        if not per_shape:
            return
        # Drills that overlap each other (a via in a pad's hole) become one hole.
        overlap_a, overlap_b = tree.query(discs, predicate="intersects")
        overlapping = set(overlap_a[overlap_a != overlap_b].tolist())

        for shape_slot, (inner, cross) in per_shape.items():
            item = objects[int(candidates[shape_slot])]
            polygon = item["polygons"][0]
            shape = shapes[shape_slot]
            if cross:
                cut = shapely.union_all(discs[cross])
                if inner:
                    touched = shapely.intersects(discs[inner], cut)
                    if touched.any():
                        cut = shapely.union_all([cut, *discs[inner][touched]])
                        inner = np.asarray(inner)[~touched].tolist()
                shape = shape.difference(cut)
            pieces = [
                piece
                for piece in shapely.get_parts(shape).tolist()
                if piece.geom_type == "Polygon" and not piece.is_empty
            ]
            hole_rings: list[list[list[float]]] = []
            hole_points: list[tuple[float, float]] = []
            merged = [disc for disc in inner if disc in overlapping]
            for disc in inner:
                if disc not in overlapping:
                    hole_rings.append(disc_rings[disc])
                    hole_points.append(self._drills[disc][0])
            if merged:
                for hole in shapely.get_parts(shapely.union_all(discs[merged])).tolist():
                    hole_rings.append(_polygon_rings(hole)[0])
                    point = hole.representative_point()
                    hole_points.append((point.x, point.y))
            extra: list[list[list[list[float]]]] = [[] for _ in pieces]
            if hole_rings and len(pieces) == 1:
                extra[0] = hole_rings
            elif hole_rings and pieces:
                point_index, piece_index = shapely.STRtree(pieces).query(
                    shapely.points(np.array(hole_points, dtype=float)), predicate="within"
                )
                for ring_slot, owner in zip(point_index.tolist(), piece_index.tolist()):
                    extra[owner].append(hole_rings[ring_slot])
            keep_source = not cross and not repaired[shape_slot] and len(pieces) == 1
            drilled = []
            for slot, piece in enumerate(pieces):
                if keep_source:
                    outer = polygon["outer"]
                    holes = list(polygon.get("holes") or [])
                else:
                    outer, *holes = _polygon_rings(piece)
                piece_record = dict(polygon)
                if slot:
                    # Clipping and tiling key on the record id: each piece is its own record.
                    self.source_polygon_record_id += 1
                    piece_record["sourcePolygonRecordId"] = self.source_polygon_record_id
                    piece_record["sourceOrder"] = self.source_polygon_record_id - 1
                drilled.append({**piece_record, "outer": outer, "holes": holes + extra[slot]})
            item["polygons"] = drilled

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
        if drill > 0:
            self._record_drill(center, holes[0], self._via_span(layers))
        net_id = self._net_id(str(record.get("net_name") or ""))
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
        drill_ops = pad_drill_ops(record.get("operations", []) or [])
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
            drill_shape = _pad_drill({**hole_info, **drill_ops.get(source_uid, {})}, center, origin, angle)
            holes = [drill_shape["ring"]] if drill > 0 else []
            self._own_drill = -1
            if drill > 0:
                # A pad's hole goes through the board, whatever layers its copper is on.
                self._record_drill(drill_shape["center"], drill_shape["ring"], None)
            net_id = self._net_id(net_name)
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
                    center=drill_shape["center"],
                    drill_width=drill_shape["width"],
                    drill_height=drill_shape["height"],
                    rotation_deg=drill_shape["rotation_deg"],
                    layer_names=layers,
                    plating_thickness=0.025,
                )

    def _record_drill(
        self,
        center: tuple[float, float],
        ring: list[tuple[float, float]],
        layers: frozenset[str] | None,
    ) -> None:
        drills = getattr(self, "_drills", None)
        if drills is not None:
            self._own_drill = len(drills)
            drills.append((center, ring, layers))

    def _via_span(self, layers: list[str]) -> frozenset[str] | None:
        """Copper layers a via's drill passes through: from its first to its last layer in stackup order."""
        copper = [layer["name"] for layer in self.layers if layer.get("role") == "copper" or str(layer.get("name", "")).endswith(".Cu")]
        positions = [copper.index(layer) for layer in layers if layer in copper]
        if not positions:
            return None
        return frozenset(copper[min(positions): max(positions) + 1])

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
        rotation_deg: float = 0.0,
    ) -> None:
        layers = [self.layer_by_name[name] for name in layer_names if name in self.layer_by_name]
        if not layers:
            return
        z_values = [
            self._runtime_z_mm(float(layer.get("z_mm") or 0.0))
            for layer in layers
        ]
        start_z, end_z = z_values[0], z_values[-1]
        # The drill's width axis turned by rotation_deg: its board-axis half extents.
        turn = math.radians(rotation_deg)
        half_x = abs(math.cos(turn)) * drill_width / 2.0 + abs(math.sin(turn)) * drill_height / 2.0
        half_y = abs(math.sin(turn)) * drill_width / 2.0 + abs(math.cos(turn)) * drill_height / 2.0
        bounds = [
            center[0] - half_x - plating_thickness,
            center[1] - half_y - plating_thickness,
            min(start_z, end_z),
            center[0] + half_x + plating_thickness,
            center[1] + half_y + plating_thickness,
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
            "rotationDeg": rotation_deg,
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
        # The objects are most of the input: encode them once, for the
        # revision here and for the input file (serialize_semantic_input).
        self.objects_json = json.dumps(self.objects, separators=(",", ":"))
        revision = hashlib.sha256(
            json.dumps(
                {
                    "layers": self.layers,
                    "nets": self.nets,
                    "barrels": self.barrels,
                },
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        )
        revision.update(self.objects_json.encode("utf-8"))
        components = _component_manifest_entries(
            self.topology,
            self.component_nodes,
            first_feature_id=len(self.object_features),
        )
        payload = {
            "schema": "prism.semantic_gltf_build_a0",
            "tileSizeMm": tile_size_mm,
            "geometryRevision": revision.hexdigest(),
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
        path.write_bytes(serialize_semantic_input(payload, self.objects_json))
        return payload


_OBJECTS_SLOT = "\u0000prism-objects\u0000"


def serialize_semantic_input(payload: dict[str, Any], objects_json: str | None = None) -> bytes:
    """The builder input as compact JSON, splicing in already-encoded objects."""
    if objects_json is None:
        return json.dumps(payload, separators=(",", ":")).encode("utf-8")
    head, slot, tail = json.dumps(
        {**payload, "objects": _OBJECTS_SLOT}, separators=(",", ":")
    ).partition(json.dumps(_OBJECTS_SLOT))
    if not slot or json.dumps(_OBJECTS_SLOT) in tail:
        return json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return "".join((head, objects_json, tail)).encode("utf-8")


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
    # The build makes millions of small lists and no reference cycles; the
    # cyclic collector would rescan them all over and over (seconds on a
    # large board), in collection and in reading the clipper's response.
    collecting = gc.isenabled()
    gc.disable()
    try:
        return _build_semantic_gltf_scene(
            topology,
            semantic_geometry,
            geometry_source,
            output_dir,
            base_path=base_path,
            collect_started=collect_started,
            pad_holes=pad_holes,
            tile_size_mm=tile_size_mm,
            force_rebuild=force_rebuild,
            clean_cache=clean_cache,
            cache_dir=cache_dir,
            meshopt_level=meshopt_level,
            progress=progress,
            profile_callback=profile_callback,
        )
    finally:
        if collecting:
            gc.enable()


def _build_semantic_gltf_scene(
    topology: dict[str, Any],
    semantic_geometry: dict[str, Any],
    geometry_source: Any,
    output_dir: Path,
    *,
    base_path: Path | None,
    collect_started: float,
    pad_holes: dict[str, dict[str, Any]] | None,
    tile_size_mm: float,
    force_rebuild: bool,
    clean_cache: bool,
    cache_dir: Path | None,
    meshopt_level: str,
    progress: Callable[[str], None] | None,
    profile_callback: Callable[[str, dict[str, Any]], None] | None,
) -> dict[str, Any]:
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
    input_bytes = serialize_semantic_input(payload, builder.objects_json)
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


def build_packed_semantic_gltf_scene(
    topology: dict[str, Any],
    mesh_pack: Any,
    output_dir: Path,
    *,
    force_rebuild: bool = False,
    clean_cache: bool = False,
    progress: Callable[[str], None] | None = None,
    profile_callback: Callable[[str, dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Package native tile buffers without hydrating or reprocessing geometry."""

    del force_rebuild, clean_cache
    payload = mesh_pack.payload
    if payload.get("schema") != "prism.semantic_mesh_pack.v1":
        raise RuntimeError("packed semantic builder requires prism.semantic_mesh_pack.v1")
    _reconcile_packed_net_metadata(topology, payload)
    # The native compiler owns geometry and feature IDs.  Topology compilation
    # owns canonical net names and aliases, so update only the small metadata
    # document before the thin packer reads it.  Packed vertices are untouched.
    mesh_pack.metadata_path.write_text(
        json.dumps(payload, separators=(",", ":")), encoding="utf-8"
    )
    scene_dir = output_dir / "scene-gltf"
    manifest_path = scene_dir / "scene.manifest.json"
    tool = Path(__file__).resolve().parents[2] / "tools" / "semantic-gltf" / "build.mjs"
    shutil.rmtree(scene_dir, ignore_errors=True)
    if progress:
        progress(
            "semantic GLTF packed builder: start "
            f"tiles={len(payload.get('tiles') or ())} "
            f"metadata={mesh_pack.metadata_path.stat().st_size / 1_000_000:.1f} MB"
        )
    started = time.perf_counter()
    try:
        with tempfile.TemporaryDirectory(prefix="semantic-packed-node-profile-") as profile_tmp:
            node_metrics_path = Path(profile_tmp) / "metrics.json"
            node_env = {}
            if profile_callback:
                node_env["PRISM_SEMANTIC_GLTF_METRICS_PATH"] = str(node_metrics_path)
            _run_node_builder(
                ["node", str(tool), str(mesh_pack.metadata_path), str(scene_dir)],
                env=node_env,
                progress=progress,
            )
            if profile_callback:
                event: dict[str, Any] = {
                    "elapsed_ms": (time.perf_counter() - started) * 1000.0,
                    "packed_metadata_bytes": mesh_pack.metadata_path.stat().st_size,
                    "packed_tile_bytes": sum(
                        int(tile.get("bytes") or 0) for tile in payload.get("tiles") or ()
                    ),
                }
                if node_metrics_path.is_file():
                    event["node_metrics"] = json.loads(
                        node_metrics_path.read_text(encoding="utf-8")
                    )
                profile_callback("packed_node_builder", event)
    finally:
        shutil.rmtree(mesh_pack.root, ignore_errors=True)
    if not manifest_path.is_file():
        raise RuntimeError("packed semantic GLTF builder did not write scene.manifest.json")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    missing_tiles = [
        str(tile.get("path") or "")
        for tile in manifest.get("tiles", [])
        if not (manifest_path.parent / str(tile.get("path") or "")).is_file()
    ]
    if missing_tiles:
        raise RuntimeError(
            f"packed semantic GLTF manifest references missing tile {missing_tiles[0]!r}"
        )
    if progress:
        progress(
            "semantic GLTF packed builder: done "
            f"tiles={len(manifest.get('tiles', []))} "
            f"bytes={sum(int(tile.get('bytes') or 0) for tile in manifest.get('tiles', [])) / 1_000_000:.1f} MB"
        )
    return {
        "schema": SCHEMA,
        "path": "scene-gltf/scene.manifest.json",
        "geometryRevision": str(manifest.get("geometryRevision") or ""),
        "tiles": len(manifest.get("tiles", [])),
        "bytes": sum(int(tile.get("bytes") or 0) for tile in manifest.get("tiles", [])),
    }


def _reconcile_packed_net_metadata(
    topology: dict[str, Any], payload: dict[str, Any]
) -> None:
    """Apply topology-owned names to native board-net IDs without touching meshes.

    Board nets the topology knows as one net (one name an alias of the other)
    are not renamed into duplicates: the first keeps its id and the others are
    listed in ``payload["netMerges"]`` (board id -> kept id), which the scene
    manifest module applies to the net table, the features, the barrels and
    the tile vertices.
    """

    topology_by_name: dict[str, dict[str, Any]] = {}
    for net in topology.get("nets", []) or []:
        name = str(net.get("name") or "")
        if name:
            topology_by_name[name] = net
        for alias in net.get("aliases", []) or []:
            if alias:
                topology_by_name.setdefault(str(alias), net)

    kept_by_name: dict[str, dict[str, Any]] = {}
    merges: dict[str, int] = {}
    for packed_net in payload.get("nets", []) or []:
        if int(packed_net.get("id") or 0) == 0:
            continue
        board_name = str(packed_net.get("name") or "")
        topology_net = topology_by_name.get(board_name)
        if topology_net is None:
            continue
        canonical_name = str(topology_net.get("name") or board_name)
        kept = kept_by_name.get(canonical_name)
        if kept is not None:
            merges[str(int(packed_net["id"]))] = int(kept["id"])
            if board_name and board_name != canonical_name and board_name not in kept["aliases"]:
                kept["aliases"].append(board_name)
            continue
        aliases = [
            str(value)
            for value in topology_net.get("aliases", []) or []
            if value and str(value) != canonical_name
        ]
        if board_name and board_name != canonical_name and board_name not in aliases:
            aliases.append(board_name)
        packed_net["name"] = canonical_name
        packed_net["uid"] = str(topology_net.get("uid") or packed_net.get("uid") or "")
        packed_net["netClass"] = str(
            topology_net.get("net_class") or packed_net.get("netClass") or ""
        )
        packed_net["aliases"] = aliases
        kept_by_name[canonical_name] = packed_net
    if merges:
        payload["netMerges"] = merges


def _component_manifest_entries(
    topology: dict[str, Any],
    component_nodes: dict[str, dict[str, Any]],
    *,
    first_feature_id: int,
) -> list[dict[str, Any]]:
    components: list[dict[str, Any]] = []
    for component in topology.get("components", []) or []:
        designator = str(component.get("designator") or "")
        node = component_nodes.get(designator, {})
        components.append(
            {
                "id": len(components) + 1,
                "featureId": first_feature_id + len(components),
                "uid": str(component.get("uid") or ""),
                "designator": designator,
                "value": str(component.get("value") or ""),
                "footprint": str(component.get("footprint") or ""),
                "nodeIndex": node.get("node_index"),
                "meshNames": node.get("mesh_names", []),
            }
        )
    return components


def patch_semantic_gltf_components(
    manifest_path: Path,
    topology: dict[str, Any],
    component_nodes: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Attach late component bindings without rebuilding any copper tile."""

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    object_features = manifest.get("objectFeatures")
    if not isinstance(object_features, list):
        raise RuntimeError("semantic GLTF manifest has no objectFeatures table")
    nodes_by_designator = {
        str(node.get("designator") or ""): node
        for node in component_nodes
        if node.get("designator")
    }
    components = _component_manifest_entries(
        topology,
        nodes_by_designator,
        first_feature_id=len(object_features),
    )
    manifest["components"] = components
    temporary = manifest_path.with_name(f".{manifest_path.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")
    os.replace(temporary, manifest_path)
    return components


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
