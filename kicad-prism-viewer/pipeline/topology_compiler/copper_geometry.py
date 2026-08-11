"""Prism integration for kicad-monkey ``kicad.copper_geometry.a0``.

This module is the only Prism-owned bridge between the renderer-neutral copper
document and the semantic GLTF builder. It deliberately never hydrates a full
``KiCadPcb`` on the copper path.
"""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

from .models import stable_id
from .pcb_extract import (
    _merge_bbox,
    _normalize_stackup_layers,
    _profile_emit,
    _profile_timed,
    _stackup_layers_from_pcb_file,
    _stackup_metadata_from_pcb_file,
)
from .pcb_geometry import NM_TO_MM


COPPER_GEOMETRY_SCHEMA = "kicad.copper_geometry.a0"
DEFAULT_PLATING_THICKNESS_MM = 0.025


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


def extract_pcb_metadata_from_copper(
    project_file: Path,
    document: Any,
    profile_callback=None,
) -> dict[str, Any]:
    """Build Prism board metadata without hydrating a full ``KiCadPcb``."""
    started = time.perf_counter()
    pcb_file = project_file.with_suffix(".kicad_pcb")
    allowed_roles = {"copper", "dielectric", "soldermask", "silkscreen", "paste"}
    layers = _profile_timed(
        profile_callback,
        "declared_layers",
        lambda: _normalize_stackup_layers(_stackup_layers_from_pcb_file(pcb_file), allowed_roles),
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
    computed_thickness = sum(float(layer.get("thickness_mm") or 0.0) for layer in layers) or 1.6
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
            "aux_axis_origin_mm": [0.0, 0.0],
            "stackup": {
                "present": bool(layers),
                "layers": layers,
                "computed_thickness_mm": computed_thickness,
                "copper_finish": file_stackup_metadata.get("copper_finish", "None"),
                "edge_connector": bool(file_stackup_metadata.get("edge_connector", False)),
                "castellated_pads": bool(file_stackup_metadata.get("castellated_pads", False)),
                "edge_plating": bool(file_stackup_metadata.get("edge_plating", False)),
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
