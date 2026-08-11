"""Read-only, deterministic projections of KiCad board facts.

R5 deliberately keeps this module at the data boundary.  KiCad owns the board
statistics schema, while the existing Prism S-expression scanner is used for
the board stackup and variant declarations.  No function in this module starts
KiCad, opens a source file for writing, or updates a fixture/check-out.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from app.release_studio.canonical import canonicalize_board_stats_json
from app.release_studio.canonical.json import canonical_json_bytes
from app.services import semantic_index_service


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


def _iter_named_blocks(text: str, name: str):
    """Yield balanced named S-expressions using the shared Prism scanner."""

    pattern = re.compile(rf"\({re.escape(name)}(?=\s|\))")
    for match in pattern.finditer(text):
        end = semantic_index_service._balanced_s_expression_end(text, match.start())
        if end is not None:
            yield text[match.start() : end]


def _unescape_quoted(value: str) -> str:
    return value.replace("\\\"", '"').replace("\\\\", "\\")


def _field_atom(block: str, field: str) -> str | None:
    match = re.search(
        rf'\({re.escape(field)}\s+(?:"((?:[^"\\]|\\.)*)"|([^\s()]+))\)',
        block,
    )
    if match is None:
        return None
    quoted, atom = match.groups()
    return _unescape_quoted(quoted) if quoted is not None else atom


def _field_atoms(block: str, field: str) -> list[str]:
    match = re.search(rf"\({re.escape(field)}\s+([^)]*)\)", block)
    if match is None:
        return []
    return [
        _unescape_quoted(quoted) if quoted is not None else atom
        for quoted, atom in re.findall(
            r'"((?:[^"\\]|\\.)*)"|([^\s()]+)', match.group(1)
        )
        if quoted or atom
    ]


def _property_value(block: str, name: str) -> str | None:
    match = re.search(
        rf'\(property\s+"{re.escape(name)}"\s+"((?:[^"\\]|\\.)*)"',
        block,
    )
    return _unescape_quoted(match.group(1)) if match else None


def _field_number(block: str, field: str) -> float | None:
    atom = _field_atom(block, field)
    if atom is None:
        return None
    try:
        return float(Decimal(atom))
    except (InvalidOperation, ValueError):
        return None


def _field_decimal(block: str, field: str) -> Decimal | None:
    atom = _field_atom(block, field)
    if atom is None:
        return None
    try:
        return Decimal(atom)
    except (InvalidOperation, ValueError):
        return None


def _boolean_atom(value: str | None) -> bool | None:
    if value is None:
        return None
    if value.lower() in {"yes", "true"}:
        return True
    if value.lower() in {"no", "false"}:
        return False
    return None


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


def _board_layer_table(text: str) -> list[dict[str, Any]]:
    layers_block = next(iter(_iter_named_blocks(text, "layers")), None)
    if layers_block is None:
        return []

    layers: list[dict[str, Any]] = []
    # Board layer-table entries are ``(numeric_id "name" type ["user name"])``.
    entry_pattern = re.compile(
        r'\(\s*(\d+)\s+"((?:[^"\\]|\\.)*)"\s+([^\s()]+)'
        r'(?:\s+"((?:[^"\\]|\\.)*)")?\s*\)'
    )
    for match in entry_pattern.finditer(layers_block):
        ordinal, name, layer_type, user_name = match.groups()
        layers.append(
            {
                "order": len(layers),
                "layer_id": int(ordinal),
                "name": _unescape_quoted(name),
                "type": layer_type,
                "material": None,
                "thickness": None,
                "epsilon_r": None,
                "loss_tangent": None,
                "color": None,
                "user_name": _unescape_quoted(user_name) if user_name else None,
                "kind": _layer_kind(_unescape_quoted(name), layer_type),
            }
        )
    return layers


def _stackup_layers(text: str) -> tuple[list[dict[str, Any]], str]:
    stackup_block = next(iter(_iter_named_blocks(text, "stackup")), None)
    if stackup_block is None:
        return _board_layer_table(text), "board.layers"

    layers: list[dict[str, Any]] = []
    for layer_block in _iter_named_blocks(stackup_block, "layer"):
        # The first argument of a stackup layer is its quoted name, not a
        # ``(layer ...)`` field.  The regex below mirrors KiCad's writer while
        # retaining escaped names.
        name_match = re.match(r'\(layer\s+"((?:[^"\\]|\\.)*)"', layer_block)
        if name_match is None:
            continue
        layer_name = _unescape_quoted(name_match.group(1))
        layer_type = _field_atom(layer_block, "type")
        layers.append(
            {
                "order": len(layers),
                "layer_id": None,
                "name": layer_name,
                "type": layer_type,
                "material": _field_atom(layer_block, "material"),
                "thickness": _field_number(layer_block, "thickness"),
                "epsilon_r": _field_number(layer_block, "epsilon_r"),
                "loss_tangent": _field_number(layer_block, "loss_tangent"),
                "color": _field_atom(layer_block, "color"),
                "user_name": None,
                "kind": _layer_kind(layer_name, layer_type),
            }
        )
    return layers, "board.setup.stackup"


def _general_thickness(text: str) -> float | None:
    general = next(iter(_iter_named_blocks(text, "general")), None)
    return _field_number(general, "thickness") if general else None


def _via_type(block: str) -> str:
    match = re.match(r"\(via(?:\s+(blind|buried|micro))?(?=\s|\))", block)
    return match.group(1) if match and match.group(1) else "through"


def _drill_span(block: str, field: str) -> dict[str, Any] | None:
    drill_block = next(iter(_iter_named_blocks(block, field)), None)
    if drill_block is None:
        return None
    layers = _field_atoms(drill_block, "layers")
    return {
        "size": _field_number(drill_block, "size"),
        "start_layer": layers[0] if len(layers) >= 1 else None,
        "stop_layer": layers[1] if len(layers) >= 2 else None,
    }


def _via_span_record(
    block: str,
    copper_layers: list[str],
) -> dict[str, Any]:
    via_type = _via_type(block)
    layers = _field_atoms(block, "layers")
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
        "backdrill": _drill_span(block, "backdrill"),
        "tertiary_drill": _drill_span(block, "tertiary_drill"),
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
    text: str,
    copper_layers: list[str],
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    grouped: dict[tuple[Any, ...], dict[str, Any]] = {}
    counts = {via_type: 0 for via_type in _VIA_TYPES}
    for via_block in _iter_named_blocks(text, "via"):
        record = _via_span_record(via_block, copper_layers)
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
        },
        "via_count": 0,
        "via_type_counts": {via_type: 0 for via_type in _VIA_TYPES},
        "via_spans": [],
    }


def project_stackup(board_path: PathLike) -> dict[str, Any]:
    """Project stackup ordering, materials, thickness, and via spans.

    KiCad stores physical layer facts in ``setup.stackup`` and the complete
    enabled-layer table in ``layers``.  A board without a stackup still gets a
    useful layer-table projection, but all unavailable stackup fields remain
    ``None`` rather than being inferred from a generic board thickness.
    """

    text = _read_text(board_path)
    layers, source = _stackup_layers(text)
    if not layers:
        return _empty_stackup()

    copper_layers = [layer["name"] for layer in layers if layer["kind"] == "copper"]
    dielectric_layers = [
        layer["name"] for layer in layers if layer["kind"] == "dielectric"
    ]
    thickness_values = [
        Decimal(str(layer["thickness"]))
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
    total_thickness = (
        float(sum(thickness_values, Decimal("0"))) if thickness_complete else None
    )

    stackup_block = next(iter(_iter_named_blocks(text, "stackup")), None)
    copper_finish = _field_atom(stackup_block, "copper_finish") if stackup_block else None
    dielectric_constraints = (
        _boolean_atom(_field_atom(stackup_block, "dielectric_constraints"))
        if stackup_block
        else None
    )
    via_spans, via_type_counts = _group_via_spans(text, copper_layers)
    return {
        "schema": "prism.release_studio.stackup.a0",
        "present": source == "board.setup.stackup",
        "source": source,
        "units": "mm",
        "layers": layers,
        "copper_layers": copper_layers,
        "dielectric_layers": dielectric_layers,
        "copper_layer_count": len(copper_layers),
        "dielectric_layer_count": len(dielectric_layers),
        "board_thickness": _general_thickness(text),
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


def _board_variant_declarations(text: str) -> list[dict[str, Any]]:
    declarations: list[dict[str, Any]] = []
    catalog = next(iter(_iter_named_blocks(text, "variants")), None)
    if catalog is not None:
        for variant_block in _iter_named_blocks(catalog, "variant"):
            name = _field_atom(variant_block, "name")
            if not name:
                continue
            declarations.append(
                _variant_declaration(
                    name,
                    _field_atom(variant_block, "description"),
                    _boolean_atom(
                        _field_atom(variant_block, "is_default")
                        or _field_atom(variant_block, "default")
                    ),
                )
            )

    assignments: dict[str, dict[str, bool]] = {}
    for footprint_block in _iter_named_blocks(text, "footprint"):
        reference = _property_value(footprint_block, "Reference")
        if reference is None:
            reference_match = re.search(
                r'\(fp_text\s+reference\s+"((?:[^"\\]|\\.)*)"', footprint_block
            )
            reference = (
                _unescape_quoted(reference_match.group(1))
                if reference_match
                else None
            )
        if not reference:
            continue
        for variant_block in _iter_named_blocks(footprint_block, "variant"):
            name = _field_atom(variant_block, "name")
            dnp = _boolean_atom(_field_atom(variant_block, "dnp"))
            if name and dnp is not None:
                assignments.setdefault(name, {})[reference] = dnp
    return _merge_declaration_names(declarations, assignments)


def _project_variant_declarations(project_path: PathLike | None) -> list[dict[str, Any]]:
    if project_path is None:
        return []
    payload = _read_json_source(Path(project_path))
    schematic = payload.get("schematic")
    if not isinstance(schematic, Mapping):
        return []
    raw_variants = schematic.get("variants")
    if raw_variants is None:
        return []
    if not isinstance(raw_variants, list):
        raise ValueError("project schematic.variants must be a list")

    declarations: list[dict[str, Any]] = []
    for index, raw_variant in enumerate(raw_variants):
        if not isinstance(raw_variant, Mapping):
            raise ValueError(f"project schematic.variants[{index}] must be an object")
        name = raw_variant.get("name")
        if not isinstance(name, str) or not name:
            raise ValueError(f"project schematic.variants[{index}].name must be non-empty")
        description = raw_variant.get("description")
        if description is not None and not isinstance(description, str):
            raise ValueError(
                f"project schematic.variants[{index}].description must be a string"
            )
        explicit_default = raw_variant.get("is_default", raw_variant.get("default"))
        if explicit_default is not None and not isinstance(explicit_default, bool):
            raise ValueError(
                f"project schematic.variants[{index}].default must be boolean"
            )
        declarations.append(
            _variant_declaration(name, description, explicit_default)
        )
    return _dedupe_declarations(declarations)


def _schematic_variant_declarations(schematic_path: PathLike | None) -> list[dict[str, Any]]:
    if schematic_path is None:
        return []
    text = _read_text(schematic_path)
    assignments: dict[str, dict[str, bool]] = {}
    names: list[str] = []
    for path_block in _iter_named_blocks(text, "path"):
        reference = _field_atom(path_block, "reference")
        for variant_block in _iter_named_blocks(path_block, "variant"):
            name = _field_atom(variant_block, "name")
            if not name:
                continue
            if name not in names:
                names.append(name)
            dnp = _boolean_atom(_field_atom(variant_block, "dnp"))
            if reference and dnp is not None:
                assignments.setdefault(name, {})[reference] = dnp
    return [
        _variant_declaration(name, None, None, assignments.get(name)) for name in names
    ]


def _dedupe_declarations(declarations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_name: dict[str, dict[str, Any]] = {}
    for declaration in declarations:
        name = declaration["name"]
        if name not in by_name:
            by_name[name] = declaration
            continue
        current = by_name[name]
        if current["description"] is None:
            current["description"] = declaration["description"]
        current["assignments"].update(declaration["assignments"])
        current["assignments"] = {
            reference: current["assignments"][reference]
            for reference in sorted(current["assignments"])
        }
    return list(by_name.values())


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
) -> dict[str, Any]:
    """Union board, project, and schematic variant declarations.

    Declaration order is retained within each source; the deterministic union
    uses board order first, then project-only names, then schematic-only names.
    Source comparison ignores ordering but includes names, descriptions,
    default markers, and shared board/schematic DNP assignments.
    """

    board_declarations = _board_variant_declarations(_read_text(board_path))
    project_declarations = _project_variant_declarations(project_path)
    schematic_declarations = _schematic_variant_declarations(schematic_path)
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
