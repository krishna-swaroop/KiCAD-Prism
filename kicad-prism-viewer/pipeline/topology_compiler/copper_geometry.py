"""Prism integration for legacy and Rust-native PCB geometry contracts.

This module is the only Prism-owned bridge between the renderer-neutral copper
document and the semantic GLTF builder. It deliberately never hydrates a full
``KiCadPcb`` on the copper path.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .models import stable_id
from .pcb_extract import (
    LAYER_COLORS,
    _canonical_fallback_stackup,
    _layer_material,
    _merge_bbox,
    _normalize_stackup_layers,
    _profile_emit,
    _profile_timed,
    _role_for_layer,
    _stackup_layers_from_pcb_file,
    _stackup_metadata_from_pcb_file,
)
from .pcb_geometry import NM_TO_MM


COPPER_GEOMETRY_SCHEMA = "kicad.copper_geometry.a0"
PRISM_PCB_GEOMETRY_SCHEMA = "prism.pcb_geometry.v1"
PRISM_SEMANTIC_MESH_PACK_SCHEMA = "prism.semantic_mesh_pack.v1"
KICAD_MONKEY_RUST_REVISION = "bc6796c1b8ce55bfbcb8b1771f3ecbc70658d34d"
DEFAULT_PLATING_THICKNESS_MM = 0.025
DEFAULT_NATIVE_HELPER = "/usr/local/bin/prism-kicad-native"


@dataclass(frozen=True)
class PcbGeometryLayer:
    index: int
    key: str
    name: str
    source_ordinal: int
    layer_type: str
    user_name: str | None


@dataclass(frozen=True)
class PcbGeometryNet:
    index: int
    key: str
    name: str
    source_ordinal: int | None


@dataclass(frozen=True)
class PcbGeometryFeature:
    source_order: int
    semantic_id: str
    kind: str
    source_uid: str
    net_index: int | None
    layer_indexes: tuple[int, ...]
    outer_nm: tuple[tuple[int, int], ...]
    holes_nm: tuple[tuple[tuple[int, int], ...], ...]
    footprint_uid: str | None
    component_ref: str | None
    pad_number: str | None
    island: bool


@dataclass(frozen=True)
class PcbGeometryDrill:
    semantic_id: str
    source_uid: str
    kind: str
    center_nm: tuple[int, int]
    width_nm: int
    height_nm: int
    oval: bool
    plated: bool
    layer_indexes: tuple[int, ...]
    footprint_uid: str | None
    component_ref: str | None
    pad_number: str | None


@dataclass(frozen=True)
class PcbGeometryDocument:
    schema: str
    kicad_monkey_revision: str
    source_digest: str
    board: dict[str, Any]
    bounds_nm: tuple[int, int, int, int] | None
    layers: tuple[PcbGeometryLayer, ...]
    nets: tuple[PcbGeometryNet, ...]
    features: tuple[PcbGeometryFeature, ...]
    drills: tuple[PcbGeometryDrill, ...]
    diagnostics: tuple[dict[str, Any], ...]
    stats: dict[str, int]
    metrics: dict[str, Any]


@dataclass(frozen=True)
class NativeSemanticMeshPack:
    root: Path
    metadata_path: Path
    payload: dict[str, Any]

    @property
    def metrics(self) -> dict[str, Any]:
        return dict(self.payload.get("metrics") or {})

    @property
    def geometry_revision(self) -> str:
        return str(self.payload.get("geometryRevision") or "")


def pcb_geometry_backend() -> str:
    value = os.environ.get("PRISM_PCB_GEOMETRY_BACKEND", "").strip().lower()
    if not value:
        # Preserve the old experimental Python-copper opt-in only as a legacy
        # development compatibility switch. New deployments use the explicit
        # legacy/rust backend contract above.
        if copper_emit_enabled():
            return "python-copper"
        return "legacy"
    if value not in {"legacy", "rust", "python-copper"}:
        raise RuntimeError(
            "PRISM_PCB_GEOMETRY_BACKEND must be one of legacy, rust, or python-copper"
        )
    return value


def native_helper_path() -> Path:
    configured = os.environ.get("PRISM_KICAD_NATIVE_PATH", "").strip()
    return Path(configured or DEFAULT_NATIVE_HELPER)


def rust_geometry_available() -> bool:
    helper = native_helper_path()
    return helper.is_file() and os.access(helper, os.X_OK)


def _pairs(values: Any) -> tuple[tuple[int, int], ...]:
    return tuple((int(point[0]), int(point[1])) for point in values or ())


def _geometry_document_from_dict(payload: dict[str, Any], pcb_file: Path) -> PcbGeometryDocument:
    if payload.get("schema") != PRISM_PCB_GEOMETRY_SCHEMA:
        raise RuntimeError(
            f"native PCB helper schema mismatch: expected {PRISM_PCB_GEOMETRY_SCHEMA}, "
            f"got {payload.get('schema')!r}"
        )
    revision = str(payload.get("kicad_monkey_revision") or "")
    if revision != KICAD_MONKEY_RUST_REVISION:
        raise RuntimeError(
            f"native PCB helper kicad-monkey revision mismatch: expected "
            f"{KICAD_MONKEY_RUST_REVISION}, got {revision or '<missing>'}"
        )
    expected_digest = hashlib.sha256(pcb_file.read_bytes()).hexdigest()
    source = payload.get("source") or {}
    actual_digest = str(source.get("digest_sha256") or "")
    if actual_digest != expected_digest:
        raise RuntimeError(
            "native PCB helper source digest mismatch: output does not describe the requested board"
        )
    board = dict(payload.get("board") or {})
    thickness_mm = float(board.get("thickness_mm") or 1.6)
    if thickness_mm <= 0.0:
        raise RuntimeError("native PCB helper emitted invalid board thickness")

    layers = tuple(
        PcbGeometryLayer(
            index=int(item["index"]),
            key=str(item["key"]),
            name=str(item["name"]),
            source_ordinal=int(item["source_ordinal"]),
            layer_type=str(item.get("layer_type") or ""),
            user_name=(str(item["user_name"]) if item.get("user_name") is not None else None),
        )
        for item in payload.get("layers") or ()
    )
    nets = tuple(
        PcbGeometryNet(
            index=int(item["index"]),
            key=str(item["key"]),
            name=str(item["name"]),
            source_ordinal=(
                int(item["source_ordinal"])
                if item.get("source_ordinal") is not None
                else None
            ),
        )
        for item in payload.get("nets") or ()
    )
    layer_indexes = {layer.index for layer in layers}
    net_indexes = {net.index for net in nets}
    if layer_indexes != set(range(len(layers))) or net_indexes != set(range(len(nets))):
        raise RuntimeError("native PCB helper emitted non-dense layer or net indexes")

    features = tuple(
        PcbGeometryFeature(
            source_order=int(item["source_order"]),
            semantic_id=str(item["semantic_id"]),
            kind=str(item["kind"]),
            source_uid=str(item["source_uid"]),
            net_index=(int(item["net_index"]) if item.get("net_index") is not None else None),
            layer_indexes=tuple(int(value) for value in item.get("layer_indexes") or ()),
            outer_nm=_pairs(item.get("outer_nm")),
            holes_nm=tuple(_pairs(ring) for ring in item.get("holes_nm") or ()),
            footprint_uid=(
                str(item["footprint_uid"]) if item.get("footprint_uid") is not None else None
            ),
            component_ref=(
                str(item["component_ref"]) if item.get("component_ref") is not None else None
            ),
            pad_number=(str(item["pad_number"]) if item.get("pad_number") is not None else None),
            island=bool(item.get("island", False)),
        )
        for item in payload.get("features") or ()
    )
    drills = tuple(
        PcbGeometryDrill(
            semantic_id=str(item["semantic_id"]),
            source_uid=str(item["source_uid"]),
            kind=str(item["kind"]),
            center_nm=(int(item["center_nm"][0]), int(item["center_nm"][1])),
            width_nm=int(item["width_nm"]),
            height_nm=int(item["height_nm"]),
            oval=bool(item["oval"]),
            plated=bool(item["plated"]),
            layer_indexes=tuple(int(value) for value in item.get("layer_indexes") or ()),
            footprint_uid=(
                str(item["footprint_uid"]) if item.get("footprint_uid") is not None else None
            ),
            component_ref=(
                str(item["component_ref"]) if item.get("component_ref") is not None else None
            ),
            pad_number=(str(item["pad_number"]) if item.get("pad_number") is not None else None),
        )
        for item in payload.get("drills") or ()
    )
    for feature in features:
        if not feature.semantic_id or not feature.source_uid:
            raise RuntimeError("native PCB helper emitted a feature without stable identity")
        if len(feature.outer_nm) < 3:
            raise RuntimeError(f"native PCB helper emitted a degenerate ring for {feature.semantic_id}")
        if not feature.layer_indexes or not set(feature.layer_indexes) <= layer_indexes:
            raise RuntimeError(f"native PCB helper emitted invalid layers for {feature.semantic_id}")
        if feature.net_index is not None and feature.net_index not in net_indexes:
            raise RuntimeError(f"native PCB helper emitted invalid net index for {feature.semantic_id}")
    for drill in drills:
        if not drill.semantic_id or not drill.source_uid:
            raise RuntimeError("native PCB helper emitted a drill without stable identity")
        if drill.width_nm <= 0 or drill.height_nm <= 0:
            raise RuntimeError(f"native PCB helper emitted invalid drill size for {drill.semantic_id}")
        if not drill.layer_indexes or not set(drill.layer_indexes) <= layer_indexes:
            raise RuntimeError(f"native PCB helper emitted invalid drill layers for {drill.semantic_id}")
    diagnostics = tuple(dict(item) for item in payload.get("diagnostics") or ())
    errors = [item for item in diagnostics if str(item.get("severity")) == "error"]
    if errors:
        raise RuntimeError(f"native PCB helper reported {len(errors)} error diagnostic(s): {errors[0]}")
    stats = {str(key): int(value) for key, value in (payload.get("stats") or {}).items()}
    unsupported = stats.get("unsupported_features", 0)
    if unsupported:
        raise RuntimeError(
            f"native PCB helper reported {unsupported} unsupported feature(s); "
            "refusing to publish partial Rust geometry"
        )
    bounds = payload.get("bounds_nm")
    if bounds is not None and len(bounds) != 4:
        raise RuntimeError("native PCB helper emitted invalid bounds")
    return PcbGeometryDocument(
        schema=PRISM_PCB_GEOMETRY_SCHEMA,
        kicad_monkey_revision=revision,
        source_digest=actual_digest,
        board=board,
        bounds_nm=(tuple(int(value) for value in bounds) if bounds is not None else None),
        layers=layers,
        nets=nets,
        features=features,
        drills=drills,
        diagnostics=diagnostics,
        stats=stats,
        metrics=dict(payload.get("metrics") or {}),
    )


def emit_rust_geometry(pcb_file: Path) -> PcbGeometryDocument:
    helper = native_helper_path()
    if not helper.is_file() or not os.access(helper, os.X_OK):
        raise RuntimeError(f"Rust PCB geometry helper is unavailable or not executable: {helper}")
    timeout = float(os.environ.get("PRISM_KICAD_NATIVE_TIMEOUT_SECONDS", "300"))
    completed = subprocess.run(
        [str(helper), str(pcb_file)],
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or "no diagnostic output"
        raise RuntimeError(
            f"Rust PCB geometry helper failed with exit code {completed.returncode}: {detail}"
        )
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Rust PCB geometry helper emitted invalid JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("Rust PCB geometry helper output must be a JSON object")
    return _geometry_document_from_dict(payload, pcb_file)


def compile_rust_semantic_mesh_pack(
    pcb_file: Path,
    output_dir: Path,
    *,
    tile_size: str = "auto",
    mesh_tolerance_mm: float = 0.005,
    meshopt_level: str = "medium",
) -> NativeSemanticMeshPack:
    helper = native_helper_path()
    if not helper.is_file() or not os.access(helper, os.X_OK):
        raise RuntimeError(f"Rust PCB geometry helper is unavailable or not executable: {helper}")
    timeout = float(os.environ.get("PRISM_KICAD_NATIVE_TIMEOUT_SECONDS", "300"))
    completed = subprocess.run(
        [
            str(helper),
            "compile-semantic",
            "--pcb",
            str(pcb_file),
            "--output",
            str(output_dir),
            "--tile-size",
            str(tile_size),
            "--mesh-tolerance-mm",
            str(mesh_tolerance_mm),
            "--meshopt-level",
            meshopt_level,
        ],
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or "no diagnostic output"
        raise RuntimeError(
            f"Rust semantic compiler failed with exit code {completed.returncode}: {detail}"
        )
    metadata_path = output_dir / "mesh-pack.json"
    if not metadata_path.is_file():
        raise RuntimeError("Rust semantic compiler did not write mesh-pack.json")
    try:
        payload = json.loads(metadata_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Rust semantic mesh pack metadata is invalid JSON: {exc}") from exc
    if payload.get("schema") != PRISM_SEMANTIC_MESH_PACK_SCHEMA:
        raise RuntimeError(
            f"native semantic mesh pack schema mismatch: expected {PRISM_SEMANTIC_MESH_PACK_SCHEMA}, "
            f"got {payload.get('schema')!r}"
        )
    if str(payload.get("kicadMonkeyRevision") or "") != KICAD_MONKEY_RUST_REVISION:
        raise RuntimeError("native semantic mesh pack kicad-monkey revision mismatch")
    expected_digest = hashlib.sha256(pcb_file.read_bytes()).hexdigest()
    if str(payload.get("sourceDigest") or "") != expected_digest:
        raise RuntimeError("native semantic mesh pack source digest mismatch")
    diagnostics = list(payload.get("diagnostics") or ())
    errors = [item for item in diagnostics if str(item.get("severity")) == "error"]
    if errors:
        raise RuntimeError(f"native semantic mesh pack reported an error: {errors[0]}")
    missing = [
        str(tile.get("path") or "")
        for tile in payload.get("tiles") or ()
        if not (output_dir / str(tile.get("path") or "")).is_file()
    ]
    if missing:
        raise RuntimeError(f"native semantic mesh pack references missing tile {missing[0]!r}")
    if not str(payload.get("geometryRevision") or ""):
        raise RuntimeError("native semantic mesh pack has no geometry revision")
    return NativeSemanticMeshPack(
        root=output_dir,
        metadata_path=metadata_path,
        payload=payload,
    )


def extract_pcb_metadata_from_mesh_pack(
    project_file: Path,
    pack: NativeSemanticMeshPack,
    profile_callback=None,
) -> dict[str, Any]:
    """Build topology metadata from native semantic tables without geometry hydration."""

    started = time.perf_counter()
    payload = pack.payload
    board = dict(payload.get("board") or {})
    layers = [
        {
            "name": str(layer.get("name") or ""),
            "role": str(layer.get("role") or "unknown"),
            "type": str(layer.get("role") or "unknown"),
            "thickness_mm": float(layer.get("thicknessMm") or 0.0),
            "material": str(layer.get("material") or ""),
            "color": str(layer.get("color") or ""),
            "stack_index": int(layer.get("stackIndex") or 0),
            "epsilon_r": layer.get("epsilonR"),
            "loss_tangent": layer.get("lossTangent"),
        }
        for layer in payload.get("layers") or ()
    ]
    layer_names = {
        int(layer.get("id") or 0): str(layer.get("name") or "")
        for layer in payload.get("layers") or ()
    }
    net_names = {
        int(net.get("id") or 0): str(net.get("name") or "")
        for net in payload.get("nets") or ()
    }
    components_by_key: dict[str, dict[str, Any]] = {}
    terminal_pad_links: list[dict[str, str]] = []
    pads: list[dict[str, Any]] = []
    for feature in payload.get("objectFeatures") or ():
        if str(feature.get("kind") or "") != "pad" or int(feature.get("id") or 0) == 0:
            continue
        designator = str(feature.get("componentRef") or "")
        footprint_uid = str(feature.get("footprintUid") or "")
        pad_number = str(feature.get("padNumber") or "")
        source_uid = str(feature.get("sourceUid") or "")
        bounds = list(feature.get("boundsMm") or ())
        bbox = [bounds[0], bounds[1], bounds[3], bounds[4]] if len(bounds) == 6 else None
        layer_ids = [int(value) for value in feature.get("layerIds") or ()]
        selected_layers = [layer_names[value] for value in layer_ids if value in layer_names]
        net_name = net_names.get(int(feature.get("netId") or 0), "")
        key = footprint_uid or designator
        if bbox and key:
            if key not in components_by_key:
                components_by_key[key] = {
                    "designator": designator,
                    "uid": _component_uid(designator),
                    "unique_id": footprint_uid,
                    "layer": next(
                        (name for name in selected_layers if name.endswith(".Cu")),
                        selected_layers[0] if selected_layers else "F.Cu",
                    ),
                    "bbox_mm": bbox,
                    "x_mm": (bbox[0] + bbox[2]) / 2.0,
                    "y_mm": (bbox[1] + bbox[3]) / 2.0,
                    "angle_deg": 0.0,
                }
            else:
                component = components_by_key[key]
                component["bbox_mm"] = _merge_bbox(component.get("bbox_mm"), bbox)
                component["x_mm"] = (component["bbox_mm"][0] + component["bbox_mm"][2]) / 2.0
                component["y_mm"] = (component["bbox_mm"][1] + component["bbox_mm"][3]) / 2.0
        pad_uid = stable_id("obj", f"pad:{footprint_uid}:{source_uid or pad_number}")
        pads.append(
            {
                "uid": pad_uid,
                "designator": designator,
                "number": pad_number,
                "net_name": net_name,
                "layers": selected_layers,
                "bbox_mm": bbox,
                "source_uid": source_uid,
            }
        )
        if designator and pad_number:
            terminal_pad_links.append(
                {
                    "designator": designator,
                    "pin": pad_number,
                    "net_name": net_name,
                    "object_uid": pad_uid,
                }
            )
    stats = dict(payload.get("stats") or {})
    metadata = {
        "source": str(project_file.with_suffix(".kicad_pcb")),
        "board": {
            "bbox_mm": list(board.get("bboxMm") or [0.0, 0.0, 80.0, 50.0]),
            "thickness_mm": float(board.get("thicknessMm") or 1.6),
            "aux_axis_origin_mm": list(board.get("auxAxisOriginMm") or [0.0, 0.0]),
            "stackup": {
                "present": bool(layers),
                "layers": layers,
                "computed_thickness_mm": float(board.get("thicknessMm") or 1.6),
                "copper_finish": str(board.get("copperFinish") or "None"),
                "edge_connector": bool(board.get("edgeConnector")),
                "castellated_pads": False,
                "edge_plating": bool(board.get("edgePlating")),
            },
            "net_classes": [],
        },
        "physical_objects": [],
        "terminal_pad_links": terminal_pad_links,
        "components": list(components_by_key.values()),
        "pads": pads,
        "stats": {
            "layers": len(layers),
            "footprints": len(components_by_key),
            "pads": int(stats.get("pads") or len(pads)),
            "segments": int(stats.get("tracks") or 0),
            "vias": int(stats.get("vias") or 0),
            "zones": int(stats.get("zone_fills") or 0),
            "physical_objects": 0,
        },
        "mode": "rust-packed",
        "geometry_backend": {
            "name": "rust",
            "schema": PRISM_SEMANTIC_MESH_PACK_SCHEMA,
            "kicad_monkey_revision": str(payload.get("kicadMonkeyRevision") or ""),
            "source_digest": str(payload.get("sourceDigest") or ""),
            "geometry_revision": pack.geometry_revision,
            "metrics": pack.metrics,
            "diagnostics": list(payload.get("diagnostics") or ()),
        },
        "bbox_mm": list(board.get("bboxMm") or [0.0, 0.0, 80.0, 50.0]),
    }
    _profile_emit(
        profile_callback,
        "total",
        (time.perf_counter() - started) * 1000.0,
        **metadata["stats"],
    )
    return metadata


def copper_emit_enabled() -> bool:
    return os.environ.get("PRISM_COPPER_EMIT_ENABLED", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def copper_emit_available() -> bool:
    try:
        from kicad_monkey import emit_pcb_copper_geometry  # type: ignore

        return callable(emit_pcb_copper_geometry)
    except Exception:
        return False


def is_copper_geometry_document(value: Any) -> bool:
    schema = str(getattr(value, "schema", "") or "")
    if schema == PRISM_PCB_GEOMETRY_SCHEMA:
        return True
    try:
        from kicad_monkey import KICAD_COPPER_GEOMETRY_ACCEPTED_SCHEMAS  # type: ignore

        return schema in {str(item) for item in KICAD_COPPER_GEOMETRY_ACCEPTED_SCHEMAS}
    except Exception:
        return schema == COPPER_GEOMETRY_SCHEMA


def emit_copper_geometry(pcb_file: Path):
    from kicad_monkey import emit_pcb_copper_geometry  # type: ignore

    return emit_pcb_copper_geometry(pcb_file)


def _component_uid(designator: str) -> str:
    return stable_id("cmp", designator)


def _board_bbox_from_copper(document: Any) -> list[float]:
    bounds = getattr(document, "bounds_nm", None)
    if not bounds or len(bounds) != 4:
        return [0.0, 0.0, 80.0, 50.0]
    return [
        round(float(bounds[0]) * NM_TO_MM, 6),
        round(float(bounds[1]) * NM_TO_MM, 6),
        round(float(bounds[2]) * NM_TO_MM, 6),
        round(float(bounds[3]) * NM_TO_MM, 6),
    ]


def _components_and_links_from_copper(
    document: Any,
) -> tuple[list[dict[str, Any]], list[dict[str, str]], list[dict[str, Any]]]:
    layer_names = {
        int(layer.index): str(layer.name)
        for layer in getattr(document, "layers", ()) or ()
    }
    net_names = {
        int(net.index): str(net.name)
        for net in getattr(document, "nets", ()) or ()
    }
    components_by_key: dict[str, dict[str, Any]] = {}
    terminal_pad_links: list[dict[str, str]] = []
    pads: list[dict[str, Any]] = []

    for feature in getattr(document, "features", ()) or ():
        if str(getattr(feature, "kind", "")) != "pad":
            continue
        designator = str(getattr(feature, "component_ref", "") or "")
        footprint_uid = str(getattr(feature, "footprint_uid", "") or "")
        pad_number = str(getattr(feature, "pad_number", "") or "")
        source_uid = str(getattr(feature, "source_uid", "") or "")
        net_name = (
            net_names.get(int(feature.net_index), "")
            if getattr(feature, "net_index", None) is not None
            else ""
        )
        layers = [
            layer_names[index]
            for index in getattr(feature, "layer_indexes", ()) or ()
            if index in layer_names
        ]
        outer = getattr(feature, "outer_nm", ()) or ()
        if outer:
            xs = [float(point[0]) * NM_TO_MM for point in outer]
            ys = [float(point[1]) * NM_TO_MM for point in outer]
            bbox = [min(xs), min(ys), max(xs), max(ys)]
            x_mm = (bbox[0] + bbox[2]) / 2.0
            y_mm = (bbox[1] + bbox[3]) / 2.0
        else:
            bbox = None
            x_mm = 0.0
            y_mm = 0.0
        key = footprint_uid or designator
        if key and key not in components_by_key:
            components_by_key[key] = {
                "designator": designator,
                "uid": _component_uid(designator),
                "unique_id": footprint_uid,
                "layer": next(
                    (name for name in layers if name.endswith(".Cu")),
                    layers[0] if layers else "F.Cu",
                ),
                "bbox_mm": bbox,
                "x_mm": x_mm,
                "y_mm": y_mm,
                "angle_deg": 0.0,
            }
        elif key and bbox:
            component = components_by_key[key]
            component["bbox_mm"] = _merge_bbox(component.get("bbox_mm"), bbox)
            if component.get("bbox_mm"):
                component["x_mm"] = (component["bbox_mm"][0] + component["bbox_mm"][2]) / 2.0
                component["y_mm"] = (component["bbox_mm"][1] + component["bbox_mm"][3]) / 2.0
        pad_uid = stable_id("obj", f"pad:{footprint_uid}:{source_uid or pad_number}")
        pads.append(
            {
                "uid": pad_uid,
                "designator": designator,
                "number": pad_number,
                "net_name": net_name,
                "layers": layers,
                "bbox_mm": bbox,
                "source_uid": source_uid,
            }
        )
        if designator and pad_number:
            terminal_pad_links.append(
                {
                    "designator": designator,
                    "pin": pad_number,
                    "net_name": net_name,
                    "object_uid": pad_uid,
                }
            )
    return list(components_by_key.values()), terminal_pad_links, pads


def _stackup_from_geometry_contract(document: Any) -> list[dict[str, Any]]:
    board = dict(getattr(document, "board", {}) or {})
    board_thickness = float(board.get("thickness_mm") or 1.6)
    allowed_roles = {"copper", "dielectric", "soldermask", "silkscreen", "paste"}
    authored = list(board.get("stackup_layers") or ())
    if authored:
        return _normalize_stackup_layers(
            [
                {
                    "name": str(item.get("name") or f"stackup_{index}"),
                    "role": _role_for_layer(
                        str(item.get("name") or ""),
                        str(item.get("type_name") or ""),
                    ),
                    "type": str(item.get("type_name") or ""),
                    "thickness_mm": float(item.get("thickness_mm") or 0.0),
                    "material": str(item.get("material") or ""),
                    "epsilon_r": item.get("epsilon_r"),
                    "loss_tangent": item.get("loss_tangent"),
                    "color": str(item.get("color") or ""),
                }
                for index, item in enumerate(authored)
            ],
            allowed_roles,
        )

    extracted_layers: list[dict[str, Any]] = []
    for raw in getattr(document, "layers", ()) or ():
        name = str(getattr(raw, "name", "") or "")
        role = _role_for_layer(name, str(getattr(raw, "layer_type", "") or ""))
        if not name or role not in allowed_roles:
            continue
        thickness = 0.035 if role == "copper" else 0.01 if role == "soldermask" else 0.0
        extracted_layers.append(
            {
                "name": name,
                "role": role,
                "thickness_mm": thickness,
                "material": _layer_material(role),
                "color": LAYER_COLORS.get(name, "#8a8a8a"),
                "synthetic_stackup": True,
            }
        )
    occupied = sum(float(layer.get("thickness_mm") or 0.0) for layer in extracted_layers)
    return _canonical_fallback_stackup(
        extracted_layers,
        {
            "name": "Board",
            "role": "dielectric",
            "type": "core",
            "thickness_mm": max(0.0, board_thickness - occupied),
            "material": "FR4",
            "color": LAYER_COLORS["Board"],
            "synthetic_stackup": True,
        },
    )


def extract_pcb_metadata_from_copper(
    project_file: Path,
    document: Any,
    profile_callback=None,
) -> dict[str, Any]:
    """Build Prism board metadata without hydrating a full ``KiCadPcb``."""
    started = time.perf_counter()
    pcb_file = project_file.with_suffix(".kicad_pcb")
    allowed_roles = {"copper", "dielectric", "soldermask", "silkscreen", "paste"}
    contract_layers = (
        _stackup_from_geometry_contract(document)
        if getattr(document, "schema", None) == PRISM_PCB_GEOMETRY_SCHEMA
        else []
    )
    layers = _profile_timed(
        profile_callback,
        "declared_layers",
        lambda: contract_layers
        or _normalize_stackup_layers(_stackup_layers_from_pcb_file(pcb_file), allowed_roles),
    )
    if not layers:
        layers = _normalize_stackup_layers(
            [
                {"name": "F.Cu", "role": "copper", "thickness_mm": 0.035, "synthetic_stackup": True},
                {"name": "Board", "role": "dielectric", "type": "core", "thickness_mm": 1.53, "material": "FR4"},
                {"name": "B.Cu", "role": "copper", "thickness_mm": 0.035, "synthetic_stackup": True},
            ],
            allowed_roles,
        )
    file_stackup_metadata = _profile_timed(
        profile_callback,
        "stackup_metadata_from_file",
        lambda: _stackup_metadata_from_pcb_file(pcb_file),
    )
    board_bbox = _profile_timed(
        profile_callback,
        "board_bbox",
        lambda: _board_bbox_from_copper(document),
    )
    components, terminal_pad_links, pads = _profile_timed(
        profile_callback,
        "components_from_copper",
        lambda: _components_and_links_from_copper(document),
    )
    board_contract = dict(getattr(document, "board", {}) or {})
    computed_thickness = float(board_contract.get("thickness_mm") or 0.0) or (
        sum(float(layer.get("thickness_mm") or 0.0) for layer in layers) or 1.6
    )
    copper_stats = dict(getattr(document, "stats", {}) or {})
    stats = {
        "layers": len(layers),
        "footprints": len(components),
        "pads": int(copper_stats.get("pads") or len(pads)),
        "segments": int(copper_stats.get("tracks") or 0),
        "vias": int(copper_stats.get("vias") or 0),
        "zones": int(copper_stats.get("zone_fills") or 0),
        "physical_objects": 0,
    }
    project_file_pro = project_file.with_suffix(".kicad_pro")
    net_classes_list: list[dict[str, Any]] = []
    if project_file_pro.is_file():
        net_classes_started = time.perf_counter()
        try:
            from kicad_monkey.kicad_project import KiCadProject

            proj = KiCadProject.from_file(project_file_pro)
            if proj.net_settings and proj.net_settings.classes:
                for nc in proj.net_settings.classes:
                    net_classes_list.append(
                        {
                            "name": nc.name,
                            "track_width": nc.track_width,
                            "clearance": nc.clearance,
                            "diff_pair_gap": nc.diff_pair_gap,
                            "diff_pair_width": nc.diff_pair_width,
                            "via_diameter": nc.via_diameter,
                            "via_drill": nc.via_drill,
                        }
                    )
        except Exception:
            pass
        _profile_emit(
            profile_callback,
            "project_net_classes",
            (time.perf_counter() - net_classes_started) * 1000.0,
            net_classes=len(net_classes_list),
        )

    metadata = {
        "source": str(pcb_file),
        "board": {
            "bbox_mm": board_bbox,
            "thickness_mm": computed_thickness,
            "aux_axis_origin_mm": [
                float(value) * NM_TO_MM
                for value in board_contract.get("aux_axis_origin_nm", [0, 0])
            ],
            "stackup": {
                "present": bool(layers),
                "layers": layers,
                "computed_thickness_mm": computed_thickness,
                "copper_finish": str(
                    board_contract.get("copper_finish")
                    or file_stackup_metadata.get("copper_finish", "None")
                ),
                "edge_connector": bool(
                    board_contract.get("edge_connector")
                    or file_stackup_metadata.get("edge_connector", False)
                ),
                "castellated_pads": bool(file_stackup_metadata.get("castellated_pads", False)),
                "edge_plating": bool(
                    board_contract.get("edge_plating")
                    or file_stackup_metadata.get("edge_plating", False)
                ),
            },
            "net_classes": net_classes_list,
        },
        "physical_objects": [],
        "terminal_pad_links": terminal_pad_links,
        "components": components,
        "pads": pads,
        "stats": stats,
        "mode": "copper",
        "bbox_mm": board_bbox,
    }
    _profile_emit(profile_callback, "total", (time.perf_counter() - started) * 1000.0, **stats)
    return metadata


def ingest_copper_geometry(builder: Any, document: Any) -> None:
    """Map a copper document onto an existing ``SemanticGltfBuilder``."""
    layer_names = {int(layer.index): str(layer.name) for layer in document.layers}
    net_names = {int(net.index): str(net.name) for net in document.nets}
    features_by_source: dict[str, list[Any]] = {}
    for feature in document.features:
        features_by_source.setdefault(str(feature.source_uid), []).append(feature)

    plated_drills = {
        str(drill.source_uid): drill
        for drill in document.drills
        if bool(drill.plated)
    }
    shared_feature_ids: dict[str, int] = {}
    for feature in document.features:
        source_uid = str(feature.source_uid)
        net_name = net_names.get(feature.net_index, "") if feature.net_index is not None else ""
        kind = "zone" if str(feature.kind) == "zone_fill" else str(feature.kind)
        selected_layers = [
            layer_names[index]
            for index in feature.layer_indexes
            if index in layer_names and layer_names[index] in builder.layer_by_name
        ]
        feature_id = None
        if source_uid in plated_drills:
            feature_id = shared_feature_ids.get(source_uid)
            if feature_id is None:
                layer_ids = [int(builder.layer_by_name[name]["id"]) for name in selected_layers]
                feature_id = builder._source_feature_id(
                    source_uid,
                    builder.net_id_by_name.get(net_name, 0),
                    kind,
                    layer_ids,
                )
                shared_feature_ids[source_uid] = feature_id
        outer = [(x * NM_TO_MM, y * NM_TO_MM) for x, y in feature.outer_nm]
        holes = [
            [(x * NM_TO_MM, y * NM_TO_MM) for x, y in ring]
            for ring in feature.holes_nm
        ]
        for layer_name in selected_layers:
            builder._append_polygon(
                source_uid=source_uid,
                net_name=net_name,
                layer_name=layer_name,
                kind=kind,
                outer=outer,
                holes=holes,
                feature_id=feature_id,
            )

    for source_uid, drill in plated_drills.items():
        source_features = features_by_source.get(source_uid, [])
        feature = source_features[0] if source_features else None
        net_name = (
            net_names.get(feature.net_index, "")
            if feature is not None and feature.net_index is not None
            else ""
        )
        selected_layers = [
            layer_names[index]
            for index in drill.layer_indexes
            if index in layer_names and layer_names[index] in builder.layer_by_name
        ]
        if not selected_layers:
            continue
        feature_id = shared_feature_ids.get(source_uid)
        if feature_id is None:
            layer_ids = [int(builder.layer_by_name[name]["id"]) for name in selected_layers]
            feature_id = builder._source_feature_id(
                source_uid,
                builder.net_id_by_name.get(net_name, 0),
                "via" if str(drill.kind) == "via" else "pad",
                layer_ids,
            )
        builder._append_barrel(
            source_uid=source_uid,
            feature_id=feature_id,
            net_id=builder.net_id_by_name.get(net_name, 0),
            kind="via" if str(drill.kind) == "via" else "plated_pad",
            center=(
                drill.center_nm[0] * NM_TO_MM,
                drill.center_nm[1] * NM_TO_MM,
            ),
            drill_width=drill.width_nm * NM_TO_MM,
            drill_height=drill.height_nm * NM_TO_MM,
            layer_names=selected_layers,
            plating_thickness=DEFAULT_PLATING_THICKNESS_MM,
        )
