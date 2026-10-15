"""Board metadata: the one place that turns board facts into ``pcb_metadata``.

Each geometry backend is an adapter that reads what it can from its own
source (a parsed ``KiCadPcb`` and its plotter IR, the copper geometry
document, or the Rust mesh pack) into :class:`BoardFacts`.
:func:`board_metadata` fills what an adapter left unknown from the same
places for every backend, and shapes the result:

* stackup flags (copper finish, edge connector, castellated pads, edge
  plating) fall back to the board file's ``(stackup ...)`` form;
* net classes always come from the project file;
* components built from pads (:func:`components_from_pads`) take placement
  from footprint records when the adapter has them, so padless footprints
  and rotations are not lost.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable

from .models import stable_id

ProfileCallback = Callable[[str, dict[str, Any]], None] | None


@dataclass
class BoardFacts:
    """What one backend knows about a board. ``None`` means "not known here"."""

    layers: list[dict[str, Any]]
    bbox_mm: list[float]
    thickness_mm: float
    components: list[dict[str, Any]]
    terminal_pad_links: list[dict[str, str]]
    stats: dict[str, int]
    mode: str
    aux_axis_origin_mm: list[float] = field(default_factory=lambda: [0.0, 0.0])
    stackup_present: bool = True
    copper_finish: Any = None
    edge_connector: Any = None
    castellated_pads: Any = None
    edge_plating: Any = None
    physical_objects: list[dict[str, Any]] = field(default_factory=list)
    pads: list[dict[str, Any]] | None = None
    # Backend-specific top-level keys, appended last (e.g. geometry_backend).
    extra: dict[str, Any] = field(default_factory=dict)


def project_net_classes(project_file: Path, profile_callback: ProfileCallback = None) -> list[dict[str, Any]]:
    """Net classes from the ``.kicad_pro`` beside the board, or none."""

    from .pcb_extract import _profile_emit

    project_file_pro = project_file.with_suffix(".kicad_pro")
    net_classes: list[dict[str, Any]] = []
    if not project_file_pro.is_file():
        return net_classes
    started = time.perf_counter()
    try:
        from kicad_monkey.kicad_project import KiCadProject  # type: ignore

        project = KiCadProject.from_file(project_file_pro)
        if project.net_settings and project.net_settings.classes:
            for net_class in project.net_settings.classes:
                net_classes.append(
                    {
                        "name": net_class.name,
                        "track_width": net_class.track_width,
                        "clearance": net_class.clearance,
                        "diff_pair_gap": net_class.diff_pair_gap,
                        "diff_pair_width": net_class.diff_pair_width,
                        "via_diameter": net_class.via_diameter,
                        "via_drill": net_class.via_drill,
                    }
                )
    except Exception:
        pass
    _profile_emit(
        profile_callback,
        "project_net_classes",
        (time.perf_counter() - started) * 1000.0,
        net_classes=len(net_classes),
    )
    return net_classes


def board_metadata(
    facts: BoardFacts,
    project_file: Path,
    *,
    profile_callback: ProfileCallback = None,
) -> dict[str, Any]:
    """``pcb_metadata`` from one backend's facts."""

    # pcb_extract imports this module; its helpers are imported late.
    from .pcb_extract import _clean_enum_text, _first_boolish, _profile_timed, _stackup_metadata_from_pcb_file

    pcb_file = project_file.with_suffix(".kicad_pcb")
    from_file = _profile_timed(
        profile_callback,
        "stackup_metadata_from_file",
        lambda: _stackup_metadata_from_pcb_file(pcb_file),
    )
    metadata: dict[str, Any] = {
        "source": str(pcb_file),
        "board": {
            "bbox_mm": facts.bbox_mm,
            "thickness_mm": facts.thickness_mm,
            "aux_axis_origin_mm": facts.aux_axis_origin_mm,
            "stackup": {
                "present": facts.stackup_present,
                "layers": facts.layers,
                "computed_thickness_mm": facts.thickness_mm,
                "copper_finish": _clean_enum_text(facts.copper_finish)
                or from_file.get("copper_finish", "None"),
                "edge_connector": _first_boolish(
                    facts.edge_connector, from_file.get("edge_connector"), default=False
                ),
                "castellated_pads": _first_boolish(
                    facts.castellated_pads, from_file.get("castellated_pads"), default=False
                ),
                "edge_plating": _first_boolish(
                    facts.edge_plating, from_file.get("edge_plating"), default=False
                ),
            },
            "net_classes": project_net_classes(project_file, profile_callback),
        },
        "physical_objects": facts.physical_objects,
        "terminal_pad_links": facts.terminal_pad_links,
        "components": facts.components,
        "stats": {**facts.stats, "layers": len(facts.layers), "physical_objects": len(facts.physical_objects)},
    }
    if facts.pads is not None:
        metadata["pads"] = facts.pads
    metadata["mode"] = facts.mode
    metadata.update(facts.extra)
    return metadata


def _merge_bbox(left: list[float] | None, right: list[float] | None) -> list[float] | None:
    if left is None:
        return right
    if right is None:
        return left
    return [min(left[0], right[0]), min(left[1], right[1]), max(left[2], right[2]), max(left[3], right[3])]


def component_uid(designator: str) -> str:
    return stable_id("cmp", designator)


def components_from_pads(
    pads: Iterable[dict[str, Any]],
    footprints: Iterable[dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, str]], list[dict[str, Any]]]:
    """Components, terminal pad links and pad records from pad facts.

    Each pad is ``{designator, footprint_uid, number, source_uid, net_name,
    layers, bbox_mm}``. ``footprints``, when the backend has them, are
    ``{uid, designator, layer, x_mm, y_mm, angle_deg, body_bbox_mm?}``: every
    footprint is a component at its own placement, its bbox the extent of its
    pads and its body bbox, when given, the courtyard or fab outline. Without
    them a component exists only for footprints with pads, placed at the
    centre of its pads with no rotation.
    """

    components_by_key: dict[str, dict[str, Any]] = {}
    for footprint in footprints or ():
        designator = str(footprint.get("designator") or "")
        key = str(footprint.get("uid") or "") or designator
        if not key:
            continue
        components_by_key[key] = {
            "designator": designator,
            "uid": component_uid(designator),
            "unique_id": str(footprint.get("uid") or ""),
            "layer": str(footprint.get("layer") or "F.Cu"),
            "bbox_mm": None,
            "x_mm": round(float(footprint.get("x_mm") or 0.0), 6),
            "y_mm": round(float(footprint.get("y_mm") or 0.0), 6),
            "angle_deg": float(footprint.get("angle_deg") or 0.0),
        }
        body_bbox = footprint.get("body_bbox_mm")
        if isinstance(body_bbox, (list, tuple)) and len(body_bbox) == 4:
            components_by_key[key]["body_bbox_mm"] = [float(value) for value in body_bbox]
    placed = bool(components_by_key)

    terminal_pad_links: list[dict[str, str]] = []
    pad_records: list[dict[str, Any]] = []
    for pad in pads:
        designator = str(pad.get("designator") or "")
        footprint_uid = str(pad.get("footprint_uid") or "")
        pad_number = str(pad.get("number") or "")
        source_uid = str(pad.get("source_uid") or "")
        net_name = str(pad.get("net_name") or "")
        layers = list(pad.get("layers") or ())
        bbox = pad.get("bbox_mm")
        key = footprint_uid or designator
        component = components_by_key.get(key)
        if key and component is None and not placed:
            component = components_by_key[key] = {
                "designator": designator,
                "uid": component_uid(designator),
                "unique_id": footprint_uid,
                "layer": next(
                    (name for name in layers if name.endswith(".Cu")),
                    layers[0] if layers else "F.Cu",
                ),
                "bbox_mm": None,
                "x_mm": 0.0,
                "y_mm": 0.0,
                "angle_deg": 0.0,
            }
        if component is not None and bbox:
            component["bbox_mm"] = _merge_bbox(component["bbox_mm"], bbox)
            if not placed:
                component["x_mm"] = (component["bbox_mm"][0] + component["bbox_mm"][2]) / 2.0
                component["y_mm"] = (component["bbox_mm"][1] + component["bbox_mm"][3]) / 2.0
        pad_uid = stable_id("obj", f"pad:{footprint_uid}:{source_uid or pad_number}")
        pad_records.append(
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
                    "source_uid": source_uid,
                }
            )
    return list(components_by_key.values()), terminal_pad_links, pad_records
