"""Effective default and per-variant assembly state from a parsed design (VAR-09).

The builder turns one kicad-monkey design into the ``assembly`` block frozen in
contract packet v1.0 section 3.2: occurrence, component and footprint maps for
the default design and for every catalog variant, plus the diagnostics the
index reports.

Semantics follow packet sections 2.2-2.7:

- occurrence identity is ``<sheetInstancePath>/<symbolUuid>``; the record for a
  variant lives on the symbol instance whose ``path`` equals that sheet path,
  and an occurrence whose symbol has no such instance resolves the base
  attributes and is reported as ``occurrence-instance-missing`` (no
  first-instance fallback);
- ``in_bom`` inside a variant record is positive logic from schematic version
  20260306 and is the excluded flag before it (N3); the pinned kicad-monkey
  resolver does not apply that gate, so the gate is applied here from the raw
  record;
- sheet records OR onto their contents for dnp/bom/board/sim, never for
  position files (N6); the pinned resolver does not fold sheets, so the fold is
  done here;
- multi-unit occurrences project onto one component: agreement keeps the value,
  disagreement uses the representative occurrence (first sheet occurrence in
  hierarchy order, then smallest symbol UUID) and emits ``multi-unit-conflict``;
- named maps are differential against the effective default; the default maps
  are differential against the all-false neutral state.

``assemble()`` is never called and the parsed design is never mutated.
"""

from __future__ import annotations

import re
from copy import copy
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional, Sequence

from app.services import semantic_index_service
from app.services.kicad_monkey_design_adapter import KiCadMonkeyDesign

SCHEMA = "prism.assembly_state_a0"

FLAG_KEYS = (
    "dnp",
    "excludeFromBom",
    "excludeFromBoard",
    "excludeFromSim",
    "excludeFromPosFiles",
)
FOOTPRINT_FLAG_KEYS = ("dnp", "excludeFromBom", "excludeFromPosFiles")

# Schematic files from this version write the record `in_bom` token as positive
# logic; older files store the excluded flag itself (packet N3).
IN_BOM_POSITIVE_SINCE = 20260306

# Text-scanned divergences the tolerant parser drops (packet N22/E18).
_UNSUPPORTED_TOKENS = {
    ".kicad_sch": ("symbol_override", "pin_map_override"),
    ".kicad_pcb": ("exclude_from_sim",),
}

_VARIANT_START = re.compile(r"\(variant(?=\s|\))")
_RULE_AREA_START = re.compile(r"\(rule_area(?=\s|\))")
_RULE_AREA_FLAGS = (
    ("dnp", re.compile(r"\(dnp\s+yes\)"), True),
    ("in_bom", re.compile(r"\(in_bom\s+no\)"), False),
    ("on_board", re.compile(r"\(on_board\s+no\)"), False),
    ("exclude_from_sim", re.compile(r"\(exclude_from_sim\s+yes\)"), True),
)


@dataclass
class _OccurrenceState:
    occurrence_id: str
    reference: str
    sheet_instance_path: str
    sheet_order: int
    symbol_uuid: str
    flags: dict[str, bool]
    fields: dict[str, str]


@dataclass
class _FootprintState:
    uuid: str
    reference: str
    order: int
    flags: dict[str, bool]
    fields: dict[str, str]


@dataclass
class _ComponentState:
    reference: str
    flags: dict[str, bool]
    fields: dict[str, str]


@dataclass
class _SchematicGraph:
    """Occurrences, sheet fold and source files for one design."""

    instances: list[Any]
    by_path: dict[str, Any]
    version: Optional[int]
    top_path: Optional[Path]
    schematic_paths: list[Path] = field(default_factory=list)


def _legacy_in_bom(version: Optional[int]) -> bool:
    return version is not None and version < IN_BOM_POSITIVE_SINCE


def _valid_reference(reference: str) -> bool:
    """Virtual power symbols and unannotated references have no component."""

    return (
        bool(reference)
        and not reference.startswith("#")
        and not reference.endswith("?")
    )


def _select_symbol_variant(
    symbol: Any, variant_name: str, sheet_path: str
) -> Optional[Any]:
    for instance in getattr(symbol, "instances", []) or []:
        if getattr(instance, "path", None) != sheet_path:
            continue
        for record in getattr(instance, "variants", []) or []:
            if record.name == variant_name:
                return record
        return None
    return None


def _has_symbol_instance(symbol: Any, sheet_path: str) -> bool:
    return any(
        getattr(instance, "path", None) == sheet_path
        for instance in getattr(symbol, "instances", []) or []
    )


def _symbol_flags(
    resolved: Any, record: Optional[Any], version: Optional[int]
) -> dict[str, bool]:
    if record is None or record.in_bom is None:
        exclude_from_bom = not bool(resolved.in_bom)
    elif _legacy_in_bom(version):
        exclude_from_bom = bool(record.in_bom)
    else:
        exclude_from_bom = not bool(resolved.in_bom)
    return {
        "dnp": bool(resolved.dnp),
        "excludeFromBom": exclude_from_bom,
        "excludeFromBoard": not bool(resolved.on_board),
        "excludeFromSim": bool(resolved.exclude_from_sim),
        "excludeFromPosFiles": not bool(resolved.in_pos_files),
    }


def _select_sheet_variant(
    sheet: Any, containing_path: Optional[str], variant_name: str
) -> Optional[Any]:
    for instance in getattr(sheet, "instances", []) or []:
        if getattr(instance, "path", None) != containing_path:
            continue
        for record in getattr(instance, "variants", []) or []:
            if record.name == variant_name:
                return record
        return None
    return None


def _sheet_flags(
    sheet: Any,
    containing_path: Optional[str],
    variant_name: Optional[str],
    version: Optional[int],
) -> dict[str, bool]:
    record = (
        _select_sheet_variant(sheet, containing_path, variant_name)
        if variant_name is not None
        else None
    )
    dnp = bool(getattr(sheet, "dnp", False))
    on_board = bool(getattr(sheet, "on_board", True))
    exclude_from_sim = bool(getattr(sheet, "exclude_from_sim", False))
    in_bom = bool(getattr(sheet, "in_bom", True))
    if record is not None:
        if record.dnp is not None:
            dnp = bool(record.dnp)
        if record.on_board is not None:
            on_board = bool(record.on_board)
        if record.exclude_from_sim is not None:
            exclude_from_sim = bool(record.exclude_from_sim)
        if record.in_bom is not None:
            exclude_from_bom = (
                bool(record.in_bom)
                if _legacy_in_bom(version)
                else not bool(record.in_bom)
            )
        else:
            exclude_from_bom = not in_bom
    else:
        exclude_from_bom = not in_bom
    return {
        "dnp": dnp,
        "excludeFromBom": exclude_from_bom,
        "excludeFromBoard": not on_board,
        "excludeFromSim": exclude_from_sim,
    }


def _fold_sheet_flags(
    flags: dict[str, bool], ancestors: Iterable[Mapping[str, bool]]
) -> dict[str, bool]:
    """OR the ancestor sheet state onto dnp/bom/board/sim (packet N6)."""

    folded = dict(flags)
    for sheet in ancestors:
        folded["dnp"] = folded["dnp"] or bool(sheet["dnp"])
        folded["excludeFromBom"] = folded["excludeFromBom"] or bool(
            sheet["excludeFromBom"]
        )
        folded["excludeFromBoard"] = folded["excludeFromBoard"] or bool(
            sheet["excludeFromBoard"]
        )
        folded["excludeFromSim"] = folded["excludeFromSim"] or bool(
            sheet["excludeFromSim"]
        )
    return folded


def _build_schematic_graph(design: Any, project_file: Path) -> _SchematicGraph:
    top = design.top_schematic
    instances = list(design.schematic_instances())
    by_path = {
        instance.sheet_instance_path: instance
        for instance in instances
        if instance.sheet_instance_path
    }
    schematic_paths: list[Path] = []
    for instance in instances:
        path = getattr(instance, "source_path", None)
        if path is not None and path not in schematic_paths:
            schematic_paths.append(path)
    top_path = getattr(top, "source_path", None) or (
        project_file.with_suffix(".kicad_sch") if top is not None else None
    )
    return _SchematicGraph(
        instances=instances,
        by_path=by_path,
        version=getattr(top, "version", None),
        top_path=Path(top_path) if top_path is not None else None,
        schematic_paths=[Path(path) for path in schematic_paths],
    )


def _ancestor_sheet_flags(
    instance: Any, graph: _SchematicGraph, variant_name: Optional[str]
) -> list[dict[str, bool]]:
    folded: list[dict[str, bool]] = []
    node = instance
    while node is not None:
        sheet = getattr(node, "sheet_symbol", None)
        parent_path = getattr(node, "parent_sheet_instance_path", None)
        parent = graph.by_path.get(parent_path)
        version = getattr(parent.schematic, "version", graph.version) if parent else graph.version
        if sheet is not None:
            folded.append(
                _sheet_flags(
                    sheet,
                    getattr(node, "parent_sheet_instance_path", None),
                    variant_name,
                    version,
                )
            )
        parent_path = getattr(node, "parent_sheet_instance_path", None)
        node = graph.by_path.get(parent_path) if parent_path else None
    return folded


def _resolve_occurrence(
    symbol: Any,
    sheet_path: str,
    graph: _SchematicGraph,
    variant_name: Optional[str],
    version: Optional[int] = None,
) -> tuple[str, dict[str, bool], dict[str, str]]:
    from kicad_monkey.kicad_variants import resolve_symbol

    if not _has_symbol_instance(symbol, sheet_path):
        # The pinned resolver otherwise borrows another occurrence's reference.
        symbol = copy(symbol)
        symbol.instances = []
    resolved = resolve_symbol(symbol, variant_name, sheet_path)
    record = (
        _select_symbol_variant(symbol, variant_name, sheet_path)
        if variant_name is not None
        else None
    )
    fields = dict(resolved.fields)
    fields["Reference"] = resolved.reference
    return resolved.reference, _symbol_flags(resolved, record, version), fields


def _occurrence_states(
    design: Any, project_file: Path
) -> tuple[_SchematicGraph, list[_OccurrenceState], list[dict[str, Any]]]:
    graph = _build_schematic_graph(design, project_file)
    occurrences: list[_OccurrenceState] = []
    diagnostics: list[dict[str, Any]] = []
    ancestors_cache: dict[int, list[dict[str, bool]]] = {}

    for order, instance in enumerate(graph.instances):
        sheet_path = instance.sheet_instance_path or "/"
        for symbol in getattr(instance.schematic, "symbols", []) or []:
            ancestors = ancestors_cache.get(id(instance))
            if ancestors is None:
                ancestors = _ancestor_sheet_flags(instance, graph, None)
                ancestors_cache[id(instance)] = ancestors
            reference, flags, fields = _resolve_occurrence(
                symbol, sheet_path, graph, None, getattr(instance.schematic, "version", graph.version)
            )
            if not _valid_reference(reference):
                continue
            occurrence_id = f"{sheet_path}/{symbol.uuid}"
            if not _has_symbol_instance(symbol, sheet_path):
                diagnostics.append(
                    {
                        "code": "occurrence-instance-missing",
                        "severity": "warning",
                        "reference": reference,
                        "occurrenceId": occurrence_id,
                        "message": "No symbol instance matches this sheet path; base attributes used.",
                    }
                )
            occurrences.append(
                _OccurrenceState(
                    occurrence_id=occurrence_id,
                    reference=reference,
                    sheet_instance_path=sheet_path,
                    sheet_order=order,
                    symbol_uuid=symbol.uuid,
                    flags=_fold_sheet_flags(flags, ancestors),
                    fields=fields,
                )
            )
    return graph, occurrences, diagnostics


def _variant_occurrence_states(
    graph: _SchematicGraph, variant_name: str
) -> dict[str, _OccurrenceState]:
    states: dict[str, _OccurrenceState] = {}
    ancestors_cache: dict[int, list[dict[str, bool]]] = {}
    for order, instance in enumerate(graph.instances):
        sheet_path = instance.sheet_instance_path or "/"
        for symbol in getattr(instance.schematic, "symbols", []) or []:
            ancestors = ancestors_cache.get(id(instance))
            if ancestors is None:
                ancestors = _ancestor_sheet_flags(instance, graph, variant_name)
                ancestors_cache[id(instance)] = ancestors
            reference, flags, fields = _resolve_occurrence(
                symbol, sheet_path, graph, variant_name, getattr(instance.schematic, "version", graph.version)
            )
            if not _valid_reference(reference):
                continue
            occurrence_id = f"{sheet_path}/{symbol.uuid}"
            states[occurrence_id] = _OccurrenceState(
                occurrence_id=occurrence_id,
                reference=reference,
                sheet_instance_path=sheet_path,
                sheet_order=order,
                symbol_uuid=symbol.uuid,
                flags=_fold_sheet_flags(flags, ancestors),
                fields=fields,
            )
    return states


def _project_components(
    occurrences: Sequence[_OccurrenceState],
    variant_name: Optional[str],
    diagnostics: list[dict[str, Any]],
) -> dict[str, _ComponentState]:
    """Agreement keeps a value; disagreement uses the representative unit."""

    grouped: dict[str, list[_OccurrenceState]] = {}
    for occurrence in occurrences:
        grouped.setdefault(occurrence.reference, []).append(occurrence)

    components: dict[str, _ComponentState] = {}
    for reference, members in grouped.items():
        if len({member.sheet_instance_path for member in members}) > 1:
            collision: dict[str, Any] = {
                "code": "reference-collision",
                "severity": "warning",
                "reference": reference,
                "message": "One reference appears on more than one sheet occurrence.",
                "detail": {
                    "occurrenceIds": sorted(
                        member.occurrence_id for member in members
                    )
                },
            }
            if variant_name is not None:
                collision["variant"] = variant_name
            diagnostics.append(collision)

        first_sheet = min(member.sheet_order for member in members)
        representative = min(
            (member for member in members if member.sheet_order == first_sheet),
            key=lambda member: member.symbol_uuid,
        )

        flags: dict[str, bool] = {}
        detail: dict[str, Any] = {}
        for flag in FLAG_KEYS:
            values = {member.occurrence_id: member.flags[flag] for member in members}
            if len(set(values.values())) == 1:
                flags[flag] = next(iter(values.values()))
            else:
                flags[flag] = representative.flags[flag]
                detail[flag] = values

        field_names = {name for member in members for name in member.fields}
        fields: dict[str, str] = {}
        for name in sorted(field_names):
            values = {
                member.occurrence_id: member.fields.get(name, "")
                for member in members
            }
            if len(set(values.values())) == 1:
                fields[name] = next(iter(values.values()))
            else:
                fields[name] = representative.fields.get(name, "")
                detail[name] = values

        if detail:
            conflict: dict[str, Any] = {
                "code": "multi-unit-conflict",
                "severity": "warning",
                "reference": reference,
                "message": "Units disagree; the representative unit's value is used.",
                "detail": detail,
            }
            if variant_name is not None:
                conflict["variant"] = variant_name
            diagnostics.append(conflict)

        components[reference] = _ComponentState(
            reference=reference, flags=flags, fields=fields
        )
    return components


def _select_footprint_variant(footprint: Any, variant_name: str) -> Optional[Any]:
    """First record whose name matches case-insensitively (packet 2.4, N16)."""

    folded = variant_name.lower()
    for record in getattr(footprint, "variants", []) or []:
        if record.name.lower() == folded:
            return record
    return None


def _footprint_state(
    footprint: Any, order: int, variant_name: Optional[str]
) -> _FootprintState:
    from kicad_monkey.kicad_variants import resolve_footprint

    record = (
        _select_footprint_variant(footprint, variant_name)
        if variant_name is not None
        else None
    )
    resolved = resolve_footprint(footprint, record.name if record else None)
    return _FootprintState(
        uuid=footprint.uuid,
        reference=resolved.reference,
        order=order,
        flags={
            "dnp": bool(resolved.dnp),
            "excludeFromBom": bool(resolved.exclude_from_bom),
            "excludeFromPosFiles": bool(resolved.exclude_from_pos_files),
        },
        fields=dict(resolved.fields),
    )


def _footprint_states(pcb: Any, variant_name: Optional[str]) -> list[_FootprintState]:
    return [
        _footprint_state(footprint, order, variant_name)
        for order, footprint in enumerate(getattr(pcb, "footprints", []) or [])
    ]


def _differential_flags(
    default: Mapping[str, bool], variant: Mapping[str, bool], keys: Sequence[str]
) -> dict[str, bool]:
    return {
        key: bool(variant[key])
        for key in keys
        if bool(variant.get(key)) != bool(default.get(key))
    }


def _differential_fields(
    default: Mapping[str, str], variant: Mapping[str, str]
) -> dict[str, str]:
    return {
        name: value for name, value in variant.items() if default.get(name) != value
    }


def physical_visibility(
    footprints_by_reference: Mapping[str, Sequence[tuple[str, bool]]],
) -> dict[str, str]:
    """Packet 2.6 classification from ``(footprint uuid, effective dnp)`` pairs."""

    visibility: dict[str, str] = {}
    for reference, footprints in footprints_by_reference.items():
        if not footprints:
            visibility[reference] = "absent"
        elif len(footprints) == 1:
            visibility[reference] = "hidden" if footprints[0][1] else "visible"
        else:
            visibility[reference] = "ambiguous"
    return visibility


def _scan_unsupported_tokens(text: str, suffix: str) -> list[str]:
    tokens: list[str] = []
    for match in _VARIANT_START.finditer(text):
        end = semantic_index_service._balanced_s_expression_end(text, match.start())
        if end is None:
            continue
        block = text[match.start() : end]
        for token in _UNSUPPORTED_TOKENS.get(suffix, ()):
            if token not in tokens and f"({token}" in block:
                tokens.append(token)
    return tokens


def _scan_rule_areas(text: str) -> list[dict[str, bool]]:
    areas: list[dict[str, bool]] = []
    for match in _RULE_AREA_START.finditer(text):
        end = semantic_index_service._balanced_s_expression_end(text, match.start())
        if end is None:
            continue
        block = text[match.start() : end]
        detail: dict[str, bool] = {}
        for key, pattern, value in _RULE_AREA_FLAGS:
            if pattern.search(block):
                detail[key] = value
        if detail:
            areas.append(detail)
    return areas


def _read_text(path: Path) -> Optional[str]:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return None


def _relative(root: Path, path: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return path.name


def _source_diagnostics(
    project_file: Path, graph: _SchematicGraph
) -> list[dict[str, Any]]:
    diagnostics: list[dict[str, Any]] = []
    root = project_file.parent
    version = graph.version
    if _legacy_in_bom(version) and graph.top_path is not None:
        diagnostics.append(
            {
                "code": "legacy-in-bom-semantics",
                "severity": "info",
                "path": _relative(root, graph.top_path),
                "message": "Schematic version predates the positive in_bom record token.",
                "detail": {"version": version},
            }
        )

    for path in graph.schematic_paths:
        text = _read_text(path)
        if text is None:
            continue
        tokens = _scan_unsupported_tokens(text, ".kicad_sch")
        if tokens:
            diagnostics.append(
                {
                    "code": "unsupported-variant-token",
                    "severity": "info",
                    "path": _relative(root, path),
                    "message": "KiCad 11 variant tokens were ignored.",
                    "detail": {"tokens": tokens},
                }
            )
        for detail in _scan_rule_areas(text):
            diagnostics.append(
                {
                    "code": "rule-area-flags-unsupported",
                    "severity": "warning",
                    "path": _relative(root, path),
                    "message": "Rule-area-driven exclusion is not resolved this release.",
                    "detail": detail,
                }
            )

    return diagnostics


def _board_diagnostics(
    project_file: Path, board_path: Optional[Path]
) -> list[dict[str, Any]]:
    if board_path is None:
        return []
    text = _read_text(board_path)
    if text is None:
        return []
    tokens = _scan_unsupported_tokens(text, ".kicad_pcb")
    if not tokens:
        return []
    return [
        {
            "code": "unsupported-variant-token",
            "severity": "info",
            "path": _relative(project_file.parent, board_path),
            "message": "KiCad 11 variant tokens were ignored.",
            "detail": {"tokens": tokens},
        }
    ]


def _default_occurrence_wire(state: _OccurrenceState) -> Optional[dict[str, Any]]:
    entry: dict[str, Any] = {"reference": state.reference}
    for flag in FLAG_KEYS:
        if state.flags[flag]:
            entry[flag] = True
    return entry if len(entry) > 1 else None


def _default_component_wire(state: _ComponentState) -> Optional[dict[str, Any]]:
    entry = {flag: True for flag in FLAG_KEYS if state.flags[flag]}
    return entry or None


def _default_footprint_wire(state: _FootprintState) -> Optional[dict[str, Any]]:
    entry: dict[str, Any] = {"reference": state.reference}
    for flag in FOOTPRINT_FLAG_KEYS:
        if state.flags[flag]:
            entry[flag] = True
    return entry if len(entry) > 1 else None


def _variant_occurrence_wire(
    default_states: Mapping[str, _OccurrenceState],
    variant_states: Mapping[str, _OccurrenceState],
) -> dict[str, Any]:
    wire: dict[str, Any] = {}
    for occurrence_id, state in variant_states.items():
        default_state = default_states.get(occurrence_id)
        if default_state is None:
            continue
        flags = _differential_flags(default_state.flags, state.flags, FLAG_KEYS)
        fields = _differential_fields(default_state.fields, state.fields)
        if flags or fields:
            entry: dict[str, Any] = dict(flags)
            if fields:
                entry["fields"] = fields
            wire[occurrence_id] = entry
    return wire


def _variant_component_wire(
    default_states: Mapping[str, _ComponentState],
    variant_states: Mapping[str, _ComponentState],
) -> dict[str, Any]:
    wire: dict[str, Any] = {}
    for reference, state in variant_states.items():
        default_state = default_states.get(reference)
        if default_state is None:
            continue
        flags = _differential_flags(default_state.flags, state.flags, FLAG_KEYS)
        fields = _differential_fields(default_state.fields, state.fields)
        if flags or fields:
            entry = dict(flags)
            if fields:
                entry["fields"] = fields
            wire[reference] = entry
    return wire


def _variant_footprint_wire(
    default_states: Mapping[str, _FootprintState],
    variant_states: Sequence[_FootprintState],
) -> dict[str, Any]:
    wire: dict[str, Any] = {}
    for state in variant_states:
        default_state = default_states.get(state.uuid)
        if default_state is None:
            continue
        flags = _differential_flags(
            default_state.flags, state.flags, FOOTPRINT_FLAG_KEYS
        )
        fields = _differential_fields(default_state.fields, state.fields)
        if flags or fields:
            entry = dict(flags)
            if fields:
                entry["fields"] = fields
            wire[state.uuid] = entry
    return wire


def _source_state_mismatches(
    component_states: Mapping[str, _ComponentState],
    footprint_states: Mapping[str, Sequence[_FootprintState]],
    variant_name: Optional[str],
    diagnostics: list[dict[str, Any]],
) -> None:
    for reference, component in component_states.items():
        group = footprint_states.get(reference)
        if not group or len(group) != 1:
            continue
        footprint = group[0]
        if (
            component.flags["dnp"] != footprint.flags["dnp"]
            or component.flags["excludeFromBom"] != footprint.flags["excludeFromBom"]
        ):
            diagnostic: dict[str, Any] = {
                "code": "source-state-mismatch",
                "severity": "info",
                "reference": reference,
                "message": "Schematic and footprint state disagree; neither side wins.",
            }
            if variant_name is not None:
                diagnostic["variant"] = variant_name
            diagnostics.append(diagnostic)


def build_assembly_state(
    design: Any,
    *,
    project_file: Path,
    catalog: Optional[Sequence[Mapping[str, Any]]] = None,
) -> dict[str, Any]:
    """Build the packet-3.2 assembly block for one parsed design.

    ``catalog`` is the discovery result (name/description/sources); callers
    pass ``variant_catalog_service``'s wire entries so the endpoint and the
    index agree. Without one, only the default state is emitted.
    """

    native = design.native if isinstance(design, KiCadMonkeyDesign) else design
    project_file = Path(project_file)
    entries = [
        {
            "name": str(entry["name"]),
            "description": entry.get("description"),
            "sources": list(entry.get("sources", [])),
        }
        for entry in (catalog or [])
        if entry.get("name")
    ]
    variant_names = [entry["name"] for entry in entries]

    graph, occurrences, diagnostics = _occurrence_states(native, project_file)
    diagnostics = (
        _source_diagnostics(project_file, graph)
        + _board_diagnostics(
            project_file, getattr(native, "pcb_path", None)
        )
        + diagnostics
    )

    components = _project_components(occurrences, None, diagnostics)
    pcb = native.pcb
    footprints = _footprint_states(pcb, None) if pcb is not None else []

    default_state = {
        "occurrences": {
            state.occurrence_id: wire
            for state in occurrences
            if (wire := _default_occurrence_wire(state)) is not None
        },
        "components": {
            state.reference: wire
            for state in components.values()
            if (wire := _default_component_wire(state)) is not None
        },
        "footprints": {
            state.uuid: wire
            for state in footprints
            if (wire := _default_footprint_wire(state)) is not None
        },
    }

    footprints_by_reference: dict[str, list[_FootprintState]] = {}
    for state in footprints:
        footprints_by_reference.setdefault(state.reference, []).append(state)

    duplicate_references = [
        reference
        for reference, group in footprints_by_reference.items()
        if len(group) > 1
    ]

    default_by_uuid = {state.uuid: state for state in footprints}
    default_by_occurrence = {state.occurrence_id: state for state in occurrences}
    variants: list[dict[str, Any]] = []
    alternate_diagnostics: list[dict[str, Any]] = []
    mismatch_diagnostics: list[dict[str, Any]] = []
    for variant_name in variant_names:
        occurrence_states = _variant_occurrence_states(graph, variant_name)
        variant_components = _project_components(
            list(occurrence_states.values()), variant_name, diagnostics
        )
        variant_footprints = (
            _footprint_states(pcb, variant_name) if pcb is not None else []
        )
        variant_by_uuid = {state.uuid: state for state in variant_footprints}

        variants.append(
            {
                "name": variant_name,
                "occurrences": _variant_occurrence_wire(
                    default_by_occurrence,
                    occurrence_states,
                ),
                "components": _variant_component_wire(
                    components, variant_components
                ),
                "footprints": _variant_footprint_wire(
                    default_by_uuid, variant_footprints
                ),
            }
        )

        for reference in duplicate_references:
            populated = [
                state
                for state in footprints_by_reference[reference]
                if not variant_by_uuid[state.uuid].flags["dnp"]
            ]
            if len(populated) > 1:
                alternate_diagnostics.append(
                    {
                        "code": "alternate-footprints-both-populated",
                        "severity": "info",
                        "variant": variant_name,
                        "reference": reference,
                        "message": "More than one alternate footprint is populated.",
                        "footprintUuids": [state.uuid for state in populated],
                    }
                )

        variant_footprints_by_reference: dict[str, list[_FootprintState]] = {}
        for state in variant_footprints:
            variant_footprints_by_reference.setdefault(
                state.reference, []
            ).append(state)
        _source_state_mismatches(variant_components, variant_footprints_by_reference, variant_name, mismatch_diagnostics)

    # Footprint diagnostics follow the component conflicts so the order matches
    # the fixture expectations (multi-unit first, then duplicate references) and
    # stays deterministic.
    for reference in duplicate_references:
        group = footprints_by_reference[reference]
        diagnostics.append(
            {
                "code": "duplicate-reference-footprints",
                "severity": "warning",
                "reference": reference,
                "message": "Several footprints share this reference; models stay visible.",
                "footprintUuids": [state.uuid for state in group],
            }
        )
    diagnostics.extend(alternate_diagnostics)
    _source_state_mismatches(components, footprints_by_reference, None, mismatch_diagnostics)
    diagnostics.extend(mismatch_diagnostics)

    return {
        "schema": SCHEMA,
        "catalog": entries,
        # Identity must survive sparse flag maps, including PCB-only parts.
        "footprintInventory": [
            {"uuid": state.uuid, "reference": state.reference} for state in footprints
        ],
        "default": default_state,
        "variants": variants,
        "diagnostics": diagnostics,
    }


def _translate_component_keys(
    states: Mapping[str, dict[str, Any]],
    component_uids: Mapping[str, str],
) -> dict[str, dict[str, Any]]:
    translated: dict[str, dict[str, Any]] = {}
    for reference, state in states.items():
        translated[component_uids.get(reference, reference)] = state
    return translated


def _occurrence_id_for_ref(
    schematic_ref: Mapping[str, Any],
    placements: Mapping[str, Sequence[Mapping[str, str]]],
) -> Optional[str]:
    """The full occurrence id behind an index schematicRef, when identifiable.

    ``schematicRefs`` carry the human sheet path, while the assembly identifies
    occurrences by KiCad's UUID instance path. The placement projection has
    both; prefer the exact (symbol, human path) match so repeated sheets keep
    their own occurrence.
    """

    symbol_uuid = semantic_index_service._string(schematic_ref.get("symbolUuid"))
    if not symbol_uuid:
        return None
    human_path = semantic_index_service._string(
        schematic_ref.get("sheetInstancePath")
    )
    for placement in placements.get(symbol_uuid) or ():
        instance_path = semantic_index_service._string(
            placement.get("sheetInstancePath")
        )
        if not instance_path:
            continue
        if human_path and semantic_index_service._string(
            placement.get("sheetPath")
        ) not in ("", human_path):
            continue
        return f"{instance_path}/{symbol_uuid}"
    return None


def _project_onto_components(
    block: dict[str, Any],
    components: Sequence[Mapping[str, Any]],
    schematic_placements: Mapping[str, Sequence[Mapping[str, str]]],
) -> None:
    """Join the reference-keyed assembly state onto existing componentUids.

    The assembly builder keys components by reference because that is the
    fixture form and the only identity the schematic side shares with the index
    join; the index publishes componentUid. A reference that resolves to
    exactly one index component is rewritten; a reference the index carries
    more than once is never guessed at — it keeps the reference key and gets a
    ``reference-collision`` diagnostic naming every candidate.
    """

    references: dict[str, list[Mapping[str, Any]]] = {}
    for component in components:
        reference = semantic_index_service._string(component.get("reference"))
        if reference:
            references.setdefault(reference, []).append(component)

    ambiguous = {
        reference for reference, entries in references.items() if len(entries) > 1
    }
    unique_uids = {
        reference: entries[0]["componentUid"]
        for reference, entries in references.items()
        if len(entries) == 1
    }

    default_states = block.get("default", {}).get("components", {})
    block.setdefault("default", {})["components"] = _translate_component_keys(
        default_states, unique_uids
    )
    for variant in block.get("variants", ()):
        variant["components"] = _translate_component_keys(
            variant.get("components", {}), unique_uids
        )

    occurrences = block.get("default", {}).get("occurrences", {})
    for entry in occurrences.values():
        uid = unique_uids.get(semantic_index_service._string(entry.get("reference")))
        if uid:
            entry["componentUid"] = uid
    for entry in block.get("default", {}).get("footprints", {}).values():
        entry["componentUid"] = unique_uids.get(
            semantic_index_service._string(entry.get("reference"))
        )

    for reference, entries in references.items():
        state = default_states.get(reference)
        for component in entries:
            if state is not None:
                fields = component.setdefault("fields", {})
                fields["DNP"] = "Yes" if state.get("dnp") else "No"
                fields["In BOM"] = "No" if state.get("excludeFromBom") else "Yes"
            for schematic_ref in component.get("schematicRefs") or ():
                occurrence_id = _occurrence_id_for_ref(
                    schematic_ref, schematic_placements
                )
                if occurrence_id:
                    schematic_ref["occurrenceId"] = occurrence_id

    diagnosed = {
        (diagnostic.get("code"), diagnostic.get("reference"))
        for diagnostic in block.get("diagnostics", ())
    }
    for reference in sorted(ambiguous):
        if ("reference-collision", reference) in diagnosed:
            continue
        block.setdefault("diagnostics", []).append(
            {
                "code": "reference-collision",
                "severity": "warning",
                "reference": reference,
                "message": "Several index components share this reference; no single join exists.",
                "detail": {
                    "componentUids": [
                        entry["componentUid"] for entry in references[reference]
                    ]
                },
            }
        )
    for diagnostic in block.get("diagnostics", ()):
        reference = semantic_index_service._string(diagnostic.get("reference"))
        if not reference or reference in ambiguous:
            continue
        uid = unique_uids.get(reference)
        if uid and "componentUid" not in diagnostic:
            diagnostic["componentUid"] = uid


def assemble_semantic_index(
    design: Any,
    project_file: Path,
    components: Sequence[Mapping[str, Any]],
    schematic_placements: Mapping[str, Sequence[Mapping[str, str]]],
) -> dict[str, Any]:
    """Build the packet-3.2 block and join it onto the index's componentUids.

    ``build_semantic_index`` runs against a working tree or a commit checkout,
    so the catalog's configured anchor is the project file it was handed and
    the source snapshot is that same directory: the endpoint and the index see
    one discovery rule. Catalog diagnostics precede resolver diagnostics, and
    the join never invents a component identity (see ``_project_onto_components``).
    """

    from app.services import variant_catalog_service

    from app.services.project_source_snapshot import ProjectSourceSnapshot

    catalog_result = variant_catalog_service.discover_snapshot_catalog(
        ProjectSourceSnapshot(root=project_file.parent.resolve(), project_file=project_file.resolve(), commit=None)
    )
    block = build_assembly_state(
        design,
        project_file=project_file,
        catalog=catalog_result.get("variants", ()),
    )
    block["diagnostics"] = list(catalog_result.get("diagnostics", ())) + list(
        block.get("diagnostics", ())
    )
    _project_onto_components(block, components, schematic_placements)
    return block
