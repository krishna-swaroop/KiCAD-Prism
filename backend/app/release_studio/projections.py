"""Read-only, deterministic projections of authoritative KiCad facts.

KiCad owns the board-statistics schema and ``kicad_monkey`` owns parsing KiCad
source formats.  This module only normalizes those typed models into the stable
Release Studio projection schema.  No function starts KiCad, opens a source
file for writing, or updates a fixture/check-out.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Mapping
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from app.release_studio.canonical import canonicalize_board_stats_json
from app.release_studio.canonical.json import canonical_json_bytes

logger = logging.getLogger(__name__)

PathLike = str | Path
JsonValue = Any

PROJECTION_SCHEMA = "prism.release_studio.board_projections.a0"
BOARD_STATS_SOURCE = "kicad-cli pcb export stats --format json"
_SOURCE_NAMES = ("board", "project", "schematic")
_VIA_TYPES = ("through", "blind", "buried", "micro")


def _read_text(path: PathLike) -> str:
    """Read one source file without exposing a write-capable file handle."""

    return Path(path).read_text(encoding="utf-8", errors="replace")


def _read_json_source(source: Any) -> Mapping[str, Any]:
    if isinstance(source, Mapping):
        return source
    if isinstance(source, bytes):
        payload = json.loads(source.decode("utf-8"))
    elif isinstance(source, Path):
        payload = json.loads(_read_text(source))
    elif isinstance(source, str):
        # JSON text is common at this boundary.  Parse an object-shaped string
        # before treating it as a possible path so long input cannot leak the
        # platform's filename-too-long OSError from Path.is_file().
        if source.lstrip().startswith("{"):
            payload = json.loads(source)
        else:
            try:
                candidate = Path(source)
                source_is_file = candidate.is_file()
            except (OSError, ValueError):
                source_is_file = False
            if source_is_file:
                payload = json.loads(_read_text(candidate))
            else:
                payload = json.loads(source)
    else:
        raise TypeError("JSON source must be a mapping, path, text, or bytes")
    if not isinstance(payload, Mapping):
        raise ValueError("JSON projection source must be an object")
    return payload


def _canonicalize_board_stats_object(value: Mapping[str, Any]) -> dict[str, Any]:
    """Reuse R4's one-object board-stats canonicalization boundary."""

    canonical = canonicalize_board_stats_json(canonical_json_bytes(value))
    normalized = json.loads(canonical.decode("utf-8"))
    if not isinstance(normalized, dict):
        raise AssertionError("canonical board stats object was not a mapping")
    return normalized


def project_board_stats(source: Mapping[str, Any] | PathLike | bytes) -> dict[str, Any]:
    """Return a timestamp-free copy of KiCad's board statistics JSON.

    The projection does not derive or rename board facts.  It preserves the
    KiCad 10.0.4 payload as emitted by ``pcb export stats --format json`` and
    removes the volatile root ``metadata.date`` field.  When a caller supplies
    the known R4-style wrapper, its nested ``stats`` object is canonicalized as
    the raw KiCad payload too; unrelated nested objects are left untouched.
    """

    payload = _read_json_source(source)
    projected = _canonicalize_board_stats_object(payload)
    nested_stats = projected.get("stats")
    if isinstance(nested_stats, Mapping):
        projected["stats"] = _canonicalize_board_stats_object(nested_stats)
    return projected


def project_board_stats_file(path: PathLike) -> dict[str, Any]:
    """Read and project a KiCad board-statistics JSON file."""

    return project_board_stats(Path(path))


def _layer_kind(name: str, layer_type: str | None) -> str:
    type_text = (layer_type or "").casefold().replace("_", " ")
    name_text = name.casefold()
    if "copper" in type_text or name_text.endswith(".cu"):
        return "copper"
    if type_text in {"prepreg", "core"} or "dielectric" in type_text:
        return "dielectric"
    if "mask" in type_text or "mask" in name_text:
        return "mask"
    if "paste" in type_text or "paste" in name_text:
        return "paste"
    if "silk" in type_text or "silk" in name_text:
        return "silkscreen"
    return "other"


def _optional_number(value: Any) -> float | None:
    """Normalize kicad_monkey's zero sentinel for an omitted dimension."""

    number = float(value or 0.0)
    return number if number != 0.0 else None


def _drill_span(drill: Any) -> dict[str, Any] | None:
    if not drill:
        return None
    layers = getattr(drill, "layers", None)
    return {
        "size": getattr(drill, "size", None),
        "start_layer": getattr(layers, "start", None) or None,
        "stop_layer": getattr(layers, "end", None) or None,
    }


def _via_span_record(
    via: Any,
    copper_layers: list[str],
) -> dict[str, Any]:
    via_type = getattr(via, "via_type", None) or "through"
    layers = list(getattr(via, "layers", ()) or ())
    start_layer = layers[0] if len(layers) >= 1 else None
    stop_layer = layers[1] if len(layers) >= 2 else None
    if start_layer in copper_layers and stop_layer in copper_layers:
        start_index = copper_layers.index(start_layer)
        stop_index = copper_layers.index(stop_layer)
        lo, hi = sorted((start_index, stop_index))
        span_layers: list[str] | None = copper_layers[lo : hi + 1]
    else:
        span_layers = None
    return {
        "via_type": via_type,
        "start_layer": start_layer,
        "stop_layer": stop_layer,
        "span_layers": span_layers,
        "span_layer_count": len(span_layers) if span_layers is not None else None,
        "backdrill": _drill_span(getattr(via, "backdrill", None)),
        "tertiary_drill": _drill_span(getattr(via, "tertiary_drill", None)),
    }


def _via_sort_key(record: dict[str, Any], copper_layers: list[str]) -> tuple[Any, ...]:
    def layer_index(name: Any) -> int:
        return copper_layers.index(name) if name in copper_layers else len(copper_layers)

    def drill_sort_key(drill: Any) -> tuple[Any, ...]:
        if not isinstance(drill, Mapping):
            return (False, None, "", "")
        return (
            True,
            drill.get("size"),
            drill.get("start_layer") or "",
            drill.get("stop_layer") or "",
        )

    return (
        layer_index(record["start_layer"]),
        layer_index(record["stop_layer"]),
        record["via_type"],
        record["start_layer"] or "",
        record["stop_layer"] or "",
        drill_sort_key(record["backdrill"]),
        drill_sort_key(record["tertiary_drill"]),
    )


def _group_via_spans(
    vias: list[Any],
    copper_layers: list[str],
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    grouped: dict[tuple[Any, ...], dict[str, Any]] = {}
    counts = {via_type: 0 for via_type in _VIA_TYPES}
    for via in vias:
        record = _via_span_record(via, copper_layers)
        via_type = record["via_type"]
        if via_type in counts:
            counts[via_type] += 1
        key = (
            record["via_type"],
            record["start_layer"],
            record["stop_layer"],
            tuple(record["span_layers"] or ()),
            tuple(
                (record["backdrill"] or {}).get(field)
                for field in ("size", "start_layer", "stop_layer")
            ),
            tuple(
                (record["tertiary_drill"] or {}).get(field)
                for field in ("size", "start_layer", "stop_layer")
            ),
        )
        if key not in grouped:
            grouped[key] = {**record, "count": 0}
        grouped[key]["count"] += 1
    records = list(grouped.values())
    records.sort(key=lambda record: _via_sort_key(record, copper_layers))
    return records, counts


def _empty_stackup() -> dict[str, Any]:
    return {
        "schema": "prism.release_studio.stackup.a0",
        "present": False,
        "source": "none",
        "units": "mm",
        "layers": [],
        "copper_layers": [],
        "dielectric_layers": [],
        "copper_layer_count": 0,
        "dielectric_layer_count": 0,
        "board_thickness": None,
        "total_thickness": None,
        "total_thickness_status": "unsupported",
        "total_thickness_source": None,
        "settings": {
            "copper_finish": None,
            "dielectric_constraints": None,
            "edge_connector": None,
            "edge_plating": None,
        },
        "via_count": 0,
        "via_type_counts": {via_type: 0 for via_type in _VIA_TYPES},
        "via_spans": [],
    }


def load_board_model(board_path: PathLike) -> tuple[Any, str | None]:
    """Parse *board_path* once for every projection that needs it.

    Parsing a large ``.kicad_pcb`` is the most expensive thing the projections
    do -- minutes on a board of tens of megabytes -- and the stackup and the
    variant projections each used to do it separately for the same file.  The
    result is passed between them instead.

    Returns ``(model, fallback_reason)``; ``fallback_reason`` is non-``None``
    when the typed parse was rejected and only the targeted stackup facts could
    be recovered, in which case the model is **not** a full ``KiCadPcb``.
    """

    return _load_pcb_projection_model(board_path)


def _load_pcb_projection_model(board_path: PathLike) -> tuple[Any, str | None]:
    """Load only the typed board facts this projection owns.

    Some released ``kicad_monkey`` versions reject KiCad 9/10 footprint text
    positions containing the valid trailing ``unlocked`` token.  A stackup
    projection must not depend on parsing unrelated footprint graphics, so the
    fallback still uses kicad_monkey's parser and component models but builds
    only ``Layer``, ``Stackup``, and ``Via`` objects from the authoritative
    S-expression tree.
    """

    from kicad_monkey import (
        KiCadPcb,
        Layer,
        Via,
        find_all_elements,
        find_element,
        get_value,
        parse_sexp,
    )
    from kicad_monkey.kicad_pcb_other import Stackup

    try:
        return KiCadPcb.from_file(board_path), None
    except (IndexError, TypeError, ValueError) as exc:
        # This cannot tell "this Monkey release rejects a token KiCad emits"
        # from "this board is corrupt", so it says which exception it stepped
        # over rather than leaving the caller to infer it from a `source` field
        # nobody reads. The reason travels with the projection as well.
        logger.warning(
            "kicad_monkey rejected %s (%s: %s); falling back to a targeted "
            "stackup parse of the same S-expression tree",
            board_path, type(exc).__name__, exc,
        )
        root = parse_sexp(_read_text(board_path))
        if not isinstance(root, list) or not root or root[0] != "kicad_pcb":
            raise ValueError("expected a kicad_pcb S-expression")

        layer_table = find_element(root, "layers")
        layers = [
            Layer.from_sexp(item)
            for item in (layer_table[1:] if layer_table else ())
            if isinstance(item, list)
        ]
        setup = find_element(root, "setup")
        stackup_node = find_element(setup, "stackup") if setup else None
        stackup = Stackup.from_sexp(stackup_node) if stackup_node else None
        vias = [Via.from_sexp(item) for item in find_all_elements(root, "via")]
        general = find_element(root, "general")
        thickness = float(get_value(general, "thickness", 0.0) or 0.0)
        return (
            SimpleNamespace(
                layers=layers,
                stackup=stackup,
                vias=vias,
                thickness=thickness,
            ),
            f"{type(exc).__name__}: {exc}",
        )


def project_stackup(
    board_path: PathLike,
    *,
    model: tuple[Any, str | None] | None = None,
) -> dict[str, Any]:
    """Project stackup ordering, materials, thickness, and via spans.

    KiCad stores physical layer facts in ``setup.stackup`` and the complete
    enabled-layer table in ``layers``.  A board without a stackup still gets a
    useful layer-table projection, but all unavailable stackup fields remain
    ``None`` rather than being inferred from a generic board thickness.

    ``model`` is a parse from :func:`load_board_model` to reuse instead of
    reading the file again.
    """

    pcb, fallback_reason = model if model is not None else _load_pcb_projection_model(
        board_path
    )
    stackup = getattr(pcb, "stackup", None)
    model_source = "board.setup.stackup" if stackup is not None else "board.layers"
    source = "kicad_monkey.fallback" if fallback_reason else model_source
    if stackup is not None:
        layers = [
            {
                "order": order,
                "layer_id": None,
                "name": str(getattr(layer, "name", "") or ""),
                "type": str(getattr(layer, "type_name", "") or "") or None,
                "material": getattr(layer, "material", None),
                "thickness": _optional_number(getattr(layer, "thickness", None)),
                "epsilon_r": getattr(layer, "epsilon_r", None),
                "loss_tangent": getattr(layer, "loss_tangent", None),
                "color": getattr(layer, "color", None),
                "user_name": None,
                "kind": _layer_kind(
                    str(getattr(layer, "name", "") or ""),
                    str(getattr(layer, "type_name", "") or ""),
                ),
            }
            for order, layer in enumerate(getattr(stackup, "layers", ()) or ())
        ]
    else:
        layers = [
            {
                "order": order,
                "layer_id": int(layer.ordinal),
                "name": str(layer.canonical_name),
                "type": str(getattr(layer.layer_type, "value", layer.layer_type)),
                "material": None,
                "thickness": None,
                "epsilon_r": None,
                "loss_tangent": None,
                "color": None,
                "user_name": layer.user_name,
                "kind": _layer_kind(
                    str(layer.canonical_name),
                    str(getattr(layer.layer_type, "value", layer.layer_type)),
                ),
            }
            for order, layer in enumerate(getattr(pcb, "layers", ()) or ())
        ]
    if not layers:
        return _empty_stackup()

    copper_layers = [layer["name"] for layer in layers if layer["kind"] == "copper"]
    dielectric_layers = [
        layer["name"] for layer in layers if layer["kind"] == "dielectric"
    ]
    thickness_values = [
        float(layer["thickness"])
        for layer in layers
        if layer["kind"] in {"copper", "dielectric", "mask"}
        and layer["thickness"] is not None
    ]
    physical_layers = [
        layer
        for layer in layers
        if layer["kind"] in {"copper", "dielectric", "mask"}
    ]
    thickness_complete = bool(physical_layers) and all(
        layer["thickness"] is not None for layer in physical_layers
    )
    total_thickness = float(sum(thickness_values)) if thickness_complete else None

    copper_finish = getattr(stackup, "copper_finish", None) if stackup else None
    # KiCad writes the literal finish label "None" for an explicitly selected
    # no-finish option.  Some kicad_monkey versions normalize that spelling to
    # Python None; retain the stable Release Studio label for a present stackup.
    if stackup is not None and copper_finish is None:
        copper_finish = "None"
    dielectric_constraints = (
        bool(getattr(stackup, "dielectric_constraints", False))
        if stackup is not None
        else None
    )
    raw_edge_connector = getattr(stackup, "edge_connector", None) if stackup else None
    edge_connector_value = getattr(raw_edge_connector, "value", raw_edge_connector)
    edge_connector = (
        None if edge_connector_value in {None, "", "none"} else str(edge_connector_value)
    )
    edge_plating = (
        bool(getattr(stackup, "edge_plating", False))
        if stackup is not None
        else None
    )
    via_spans, via_type_counts = _group_via_spans(
        list(getattr(pcb, "vias", ()) or ()), copper_layers
    )
    return {
        "schema": "prism.release_studio.stackup.a0",
        "present": stackup is not None,
        "source": source,
        "source_detail": model_source,
        "fallback_reason": fallback_reason,
        "units": "mm",
        "layers": layers,
        "copper_layers": copper_layers,
        "dielectric_layers": dielectric_layers,
        "copper_layer_count": len(copper_layers),
        "dielectric_layer_count": len(dielectric_layers),
        "board_thickness": float(getattr(pcb, "thickness", 0.0) or 0.0) or None,
        "total_thickness": total_thickness,
        "total_thickness_status": (
            "available" if thickness_complete else "partial" if thickness_values else "unsupported"
        ),
        "total_thickness_source": (
            "board.setup.stackup.layer.thickness" if thickness_complete else None
        ),
        "settings": {
            "copper_finish": copper_finish,
            "dielectric_constraints": dielectric_constraints,
            "edge_connector": edge_connector,
            "edge_plating": edge_plating,
        },
        "via_count": sum(via_type_counts.values()),
        "via_type_counts": via_type_counts,
        "via_spans": via_spans,
    }


def _variant_declaration(
    name: str,
    description: str | None,
    is_default: bool | None,
    assignments: Mapping[str, bool] | None = None,
) -> dict[str, Any]:
    return {
        "name": name,
        "description": description,
        "is_default": name == "default" if is_default is None else is_default,
        "assignments": {
            reference: bool(value)
            for reference, value in sorted((assignments or {}).items())
        },
    }


def _merge_declaration_names(
    declarations: list[dict[str, Any]],
    names: Mapping[str, Mapping[str, bool]],
) -> list[dict[str, Any]]:
    by_name = {declaration["name"]: declaration for declaration in declarations}
    for name, assignments in names.items():
        if name not in by_name:
            by_name[name] = _variant_declaration(name, None, None, assignments)
        elif assignments:
            merged = dict(by_name[name]["assignments"])
            merged.update(assignments)
            by_name[name]["assignments"] = {
                reference: merged[reference] for reference in sorted(merged)
            }
    return [by_name[name] for name in by_name]


def _variant_assignments(overrides: Any) -> dict[str, dict[str, bool]]:
    assignments: dict[str, dict[str, bool]] = {}
    for override in overrides:
        name = str(getattr(override, "variant_name", "") or "")
        reference = str(getattr(override, "reference", "") or "")
        dnp = getattr(override, "dnp", None)
        if name and reference and dnp is not None:
            assignments.setdefault(name, {})[reference] = bool(dnp)
    return assignments


#: Reference-designator prefix that marks a testpoint.
#:
#: KiCad has no testpoint *type*, so the designator is the convention -- and it
#: is the same string the Cruncher view configuration selects on, which is what
#: keeps the drawing and its schedule talking about the same set of parts.
TESTPOINT_PREFIX = "TP"


def board_designators(
    board_path: PathLike,
    *,
    model: tuple[Any, str | None] | None = None,
) -> tuple[str, ...]:
    """Every reference designator on the board, sorted.

    A build input rather than a released projection: the testpoint view needs
    it to say which component outlines to leave out, and it belongs in no
    manifest.
    """

    parsed, fallback_reason = model if model is not None else _load_pcb_projection_model(
        board_path
    )
    if fallback_reason:
        return ()
    found = {
        reference
        for footprint in getattr(parsed, "footprints", ()) or ()
        if (reference := _footprint_reference(footprint).strip())
    }
    return tuple(sorted(found))


def project_population(
    board_path: PathLike,
    *,
    model: tuple[Any, str | None] | None = None,
) -> dict[str, Any]:
    """Per-side component counts, and what the position file leaves out.

    The assembly sheet used to count rows in ``positions.csv`` and print a note
    saying do-not-populate parts were excluded from that count.  They are not:
    ``pcb export pos`` includes them unless ``--exclude-dnp`` is passed, which
    Prism deliberately does not pass -- a CM needs to know a part is placed and
    not fitted.  On JTYU-OBC that made the note wrong about 107 components.

    So the counts are read from the board, where "fitted", "do not populate"
    and "not in the position file" are three separate facts and can be stated
    as three separate numbers.
    """

    parsed, fallback_reason = model if model is not None else _load_pcb_projection_model(
        board_path
    )
    if fallback_reason:
        return {"source": "kicad_monkey.fallback", "sides": {}}

    sides: dict[str, dict[str, int]] = {
        "top": {"components": 0, "dnp": 0, "fitted": 0, "absent_from_position_file": 0},
        "bottom": {"components": 0, "dnp": 0, "fitted": 0, "absent_from_position_file": 0},
    }
    for footprint in getattr(parsed, "footprints", ()) or ():
        if not _footprint_reference(footprint):
            continue
        layer = str(getattr(footprint, "layer", "") or "")
        counts = sides["bottom" if layer.startswith("B.") else "top"]
        counts["components"] += 1
        if getattr(footprint, "is_dnp", False):
            counts["dnp"] += 1
        else:
            counts["fitted"] += 1
        if getattr(footprint, "is_excluded_from_pos_files", False):
            counts["absent_from_position_file"] += 1
    return {"source": "board.footprints", "sides": sides}


def project_testpoints(
    board_path: PathLike,
    *,
    model: tuple[Any, str | None] | None = None,
    prefix: str = TESTPOINT_PREFIX,
) -> dict[str, Any]:
    """Testpoint designators and positions, read from the board itself.

    **Not** from the position file.  Testpoint footprints are routinely marked
    "exclude from position files" -- they are not placed by a pick-and-place
    machine -- so a schedule built from ``positions.csv`` reports none while the
    drawing beside it labels eighty-one.  JTYU-OBC is exactly that board.

    Positions are the footprint's own placement in board coordinates, which is
    what a probe fixture is dimensioned against.
    """

    parsed, fallback_reason = model if model is not None else _load_pcb_projection_model(
        board_path
    )
    if fallback_reason:
        # The targeted stackup fallback has no footprints to read.
        return {"source": "kicad_monkey.fallback", "prefix": prefix, "testpoints": []}

    marker = prefix.strip().upper()
    found: list[dict[str, Any]] = []
    for footprint in getattr(parsed, "footprints", ()) or ():
        reference = _footprint_reference(footprint)
        if not reference.strip().upper().startswith(marker):
            continue
        layer = str(getattr(footprint, "layer", "") or "")
        found.append(
            {
                "ref": reference,
                "side": "bottom" if layer.startswith("B.") else "top",
                "x": _optional_number(getattr(footprint, "at_x", None)),
                "y": _optional_number(getattr(footprint, "at_y", None)),
                "rotation": _optional_number(getattr(footprint, "at_angle", None)),
                # Recorded because it is the reason this projection exists at
                # all, and because a reader comparing the schedule against
                # positions.csv deserves to know why they differ.
                "excluded_from_position_file": bool(
                    getattr(footprint, "is_excluded_from_pos_files", False)
                ),
            }
        )
    return {
        "source": "board.footprints",
        "prefix": prefix,
        "testpoints": found,
    }


def _footprint_reference(footprint: Any) -> str:
    get_property = getattr(footprint, "get_property_value", None)
    if callable(get_property):
        reference = str(get_property("Reference") or "")
        if reference:
            return reference
    for text in getattr(footprint, "fp_texts", ()) or ():
        if getattr(text, "text_type", None) == "reference":
            return str(getattr(text, "text", "") or "")
    return ""


def _board_variant_declarations(pcb: Any) -> list[dict[str, Any]]:
    from kicad_monkey import VariantCatalog

    catalog = VariantCatalog.from_pcb(pcb)
    declarations = [
        _variant_declaration(variant.name, variant.description, None)
        for variant in catalog
        if variant.name
    ]
    assignments: dict[str, dict[str, bool]] = {}
    # ``collect_footprint_overrides`` in older supported kicad_monkey releases
    # cannot recover references from legacy fp_text-only footprints.  Reading
    # the typed footprint objects directly keeps the parser boundary in the
    # library while preserving those designators.
    for footprint in getattr(pcb, "footprints", ()) or ():
        reference = _footprint_reference(footprint)
        if not reference:
            continue
        for override in getattr(footprint, "variants", ()) or ():
            name = str(getattr(override, "name", "") or "")
            dnp = getattr(override, "dnp", None)
            if name and dnp is not None:
                assignments.setdefault(name, {})[reference] = bool(dnp)
    return _merge_declaration_names(declarations, assignments)


def _project_variant_declarations(project: Any | None) -> list[dict[str, Any]]:
    if project is None:
        return []
    from kicad_monkey import VariantCatalog

    return [
        _variant_declaration(variant.name, variant.description, None)
        for variant in VariantCatalog.from_project(project)
        if variant.name
    ]


def _schematic_variant_declarations(schematic: Any | None) -> list[dict[str, Any]]:
    if schematic is None:
        return []
    from kicad_monkey import VariantCatalog, collect_symbol_overrides

    assignments = _variant_assignments(collect_symbol_overrides(schematic))
    return [
        _variant_declaration(variant.name, variant.description, None, assignments.get(variant.name))
        for variant in VariantCatalog.from_overrides(schematic=schematic)
        if variant.name
    ]


def _declaration_map(declarations: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {
        declaration["name"]: {
            "description": declaration["description"],
            "is_default": declaration["is_default"],
            "assignments": declaration["assignments"],
        }
        for declaration in declarations
    }


def _compare_variant_sources(
    left_name: str,
    left: list[dict[str, Any]],
    right_name: str,
    right: list[dict[str, Any]],
) -> dict[str, Any] | None:
    left_map = _declaration_map(left)
    right_map = _declaration_map(right)
    left_names = set(left_map)
    right_names = set(right_map)
    changed = sorted(
        name
        for name in left_names & right_names
        if (
            (
                left_map[name]["description"] is not None
                and right_map[name]["description"] is not None
                and left_map[name]["description"] != right_map[name]["description"]
            )
            or left_map[name]["is_default"] != right_map[name]["is_default"]
            or (
                left_map[name]["assignments"]
                and right_map[name]["assignments"]
                and left_map[name]["assignments"] != right_map[name]["assignments"]
            )
        )
    )
    missing_left = sorted(right_names - left_names)
    missing_right = sorted(left_names - right_names)
    if not changed and not missing_left and not missing_right:
        return None
    return {
        "left": left_name,
        "right": right_name,
        "missing_in_left": missing_left,
        "missing_in_right": missing_right,
        "changed": changed,
    }


def project_variants(
    board_path: PathLike,
    project_path: PathLike | None = None,
    schematic_path: PathLike | None = None,
    *,
    pcb: Any = None,
) -> dict[str, Any]:
    """Union board, project, and schematic variant declarations.

    Declaration order is retained within each source; the deterministic union
    uses board order first, then project-only names, then schematic-only names.
    Source comparison ignores ordering but includes names, descriptions,
    default markers, and shared board/schematic DNP assignments.

    ``pcb`` is a typed board model from :func:`load_board_model` to reuse
    instead of parsing the same file a second time.
    """

    from kicad_monkey import KiCadPcb, KiCadProject, KiCadSchematic

    if pcb is None:
        pcb = KiCadPcb.from_file(board_path)
    project = KiCadProject.from_file(project_path) if project_path is not None else None
    schematic = (
        KiCadSchematic.from_file(schematic_path)
        if schematic_path is not None
        else None
    )
    board_declarations = _board_variant_declarations(pcb)
    project_declarations = _project_variant_declarations(project)
    schematic_declarations = _schematic_variant_declarations(schematic)
    declarations_by_source = {
        "board": board_declarations,
        "project": project_declarations,
        "schematic": schematic_declarations,
    }

    ordered_names: list[str] = []
    for source_name in _SOURCE_NAMES:
        for declaration in declarations_by_source[source_name]:
            name = declaration["name"]
            if name not in ordered_names:
                ordered_names.append(name)

    divergence_reasons: list[dict[str, Any]] = []
    present_sources = [
        source_name
        for source_name in _SOURCE_NAMES
        if declarations_by_source[source_name]
    ]
    for index, left_name in enumerate(present_sources):
        for right_name in present_sources[index + 1 :]:
            difference = _compare_variant_sources(
                left_name,
                declarations_by_source[left_name],
                right_name,
                declarations_by_source[right_name],
            )
            if difference is not None:
                divergence_reasons.append(difference)

    declarations_by_name = {
        source_name: _declaration_map(declarations_by_source[source_name])
        for source_name in _SOURCE_NAMES
    }
    variants: list[dict[str, Any]] = []
    for name in ordered_names:
        source_membership = {
            source_name: name in declarations_by_name[source_name]
            for source_name in _SOURCE_NAMES
        }
        sources = [
            source_name for source_name in _SOURCE_NAMES if source_membership[source_name]
        ]
        variants.append(
            {
                "name": name,
                "is_default": name == "default"
                or any(
                    declarations_by_name[source_name].get(name, {}).get("is_default")
                    is True
                    for source_name in sources
                ),
                "sources": sources,
                "source_membership": source_membership,
                "declarations": {
                    source_name: declarations_by_name[source_name][name]
                    for source_name in sources
                },
            }
        )

    default_names = [variant["name"] for variant in variants if variant["is_default"]]
    default_name = default_names[0] if default_names else None
    default_sources = [
        source_name
        for source_name in _SOURCE_NAMES
        if default_name is not None and default_name in declarations_by_name[source_name]
    ]
    return {
        "schema": "prism.release_studio.variants.a0",
        "diverged": bool(divergence_reasons),
        "sources": present_sources,
        "source_membership": {
            source_name: bool(declarations_by_source[source_name])
            for source_name in _SOURCE_NAMES
        },
        "ordering": ordered_names,
        "default": {
            "name": default_name,
            "sources": default_sources,
        },
        "declarations": {
            source_name: declarations_by_source[source_name]
            for source_name in _SOURCE_NAMES
        },
        "variants": variants,
        "divergence_reasons": divergence_reasons,
    }


def build_board_projections(
    board_path: PathLike,
    project_path: PathLike | None = None,
    schematic_path: PathLike | None = None,
    *,
    board_stats: Mapping[str, Any] | PathLike | bytes | None = None,
) -> dict[str, Any]:
    """Build the three R5 projections from read-only source inputs.

    ``board_stats`` is intentionally supplied separately because the R2
    executor or a pinned KiCad live step owns creation of the CLI JSON.  If it
    is absent, the result says ``unsupported`` instead of inventing counts.
    """

    stats_projection: dict[str, Any]
    if board_stats is None:
        stats_projection = {
            "status": "unsupported",
            "source": BOARD_STATS_SOURCE,
            "reason": "KiCad board statistics JSON was not supplied",
        }
    else:
        stats_projection = project_board_stats(board_stats)
    return {
        "schema": PROJECTION_SCHEMA,
        "board_stats": stats_projection,
        "stackup": project_stackup(board_path),
        "variants": project_variants(board_path, project_path, schematic_path),
    }


# Descriptive aliases make the three projection boundaries discoverable to
# callers that use noun-first names while keeping one implementation.
board_stats_projection = project_board_stats
stackup_projection = project_stackup
variants_projection = project_variants
build_projections = build_board_projections


__all__ = [
    "BOARD_STATS_SOURCE",
    "PROJECTION_SCHEMA",
    "board_stats_projection",
    "build_board_projections",
    "build_projections",
    "project_board_stats",
    "project_board_stats_file",
    "project_stackup",
    "project_variants",
    "stackup_projection",
    "variants_projection",
]
