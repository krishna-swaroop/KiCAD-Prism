"""KiCad-shaped document-diff normalization.

This module is independent of rendering. It adapts Prism's semantic comparison
result to the same PROJECT_DIFF / DOCUMENT_DIFF / ITEM_CHANGE shape consumed
by KiCad's comparison dialog and ecad-viewer. A future kicad-cli provider can
replace this adapter without changing the frontend or viewer contract.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, Iterable, List, Mapping, Optional


_TYPE_NAMES = {
    "symbol": "SCH_SYMBOL",
    "wire": "SCH_LINE",
    "label": "SCH_LABEL",
    "junction": "SCH_JUNCTION",
    "pin": "SCH_PIN",
    "sheet_pin": "SCH_SHEET_PIN",
    "sheet": "SCH_SHEET",
    "bus": "SCH_BUS_WIRE",
    "bus_entry": "SCH_BUS_ENTRY",
    "no_connect": "SCH_NO_CONNECT",
    "graphic": "SCH_SHAPE",
    "footprint": "PCB_FOOTPRINT",
    "track": "PCB_TRACK",
    # Accept parser-native names defensively. design_compare_service normally
    # canonicalizes these first, but document-diff is also a public adapter.
    "segment": "PCB_TRACK",
    "arc": "PCB_ARC",
    "arc_segment": "PCB_ARC",
    "via": "PCB_VIA",
    "zone": "ZONE",
    "pad": "PCB_PAD",
}

_KIND_NAMES = {
    "added": "added",
    "removed": "removed",
    "changed": "modified",
    "modified": "modified",
}


def _first_pcb_path(files: Mapping[str, Any]) -> Optional[str]:
    for side in ("head", "base"):
        for source in files.get(side) or []:
            path = str(source.get("path") or source.get("filename") or "")
            if path.endswith(".kicad_pcb"):
                return path.replace("\\", "/")
    return None


def _source_id(change: Mapping[str, Any]) -> Optional[str]:
    if change.get("source_side") == "reference" or change.get("kind") == "removed":
        value = change.get("source_id_base")
    else:
        value = change.get("source_id_compare") or change.get("source_id_base")
    return str(value) if value else None


def _geometry(change: Mapping[str, Any]) -> Mapping[str, Any]:
    if change.get("source_side") == "reference" or change.get("kind") == "removed":
        return change.get("oldGeometry") or {}
    return change.get("geometry") or change.get("oldGeometry") or {}


def _document_path(
    change: Mapping[str, Any],
    pcb_path: Optional[str],
) -> Optional[str]:
    if change.get("domain") == "pcb":
        return pcb_path
    geometry = _geometry(change)
    path = (
        geometry.get("page")
        or change.get("page")
        or (change.get("compare_item") or {}).get("page")
        or (change.get("base_item") or {}).get("page")
    )
    return str(path).replace("\\", "/") if path else None


def _diff_value(value: Any) -> Dict[str, Any]:
    if value is None:
        return {"type": "null", "v": None}
    if isinstance(value, bool):
        return {"type": "bool", "v": value}
    if isinstance(value, int):
        return {"type": "int", "v": value}
    if isinstance(value, float):
        return {"type": "double", "v": value}
    return {"type": "string", "v": str(value)}


def _property_deltas(change: Mapping[str, Any]) -> List[Dict[str, Any]]:
    deltas: List[Dict[str, Any]] = []
    for name, delta in sorted((change.get("fields") or {}).items()):
        if isinstance(delta, Mapping):
            before = delta.get("old")
            after = delta.get("new")
        else:
            before = None
            after = delta
        deltas.append(
            {
                "name": str(name),
                "before": _diff_value(before),
                "after": _diff_value(after),
            }
        )
    return deltas


def _item_change(
    change: Mapping[str, Any],
    target: Mapping[str, Any],
    target_geometry: Mapping[str, Any],
    *,
    children: Optional[List[Dict[str, Any]]] = None,
    include_properties: bool = True,
    retain_reference: bool = False,
) -> Dict[str, Any]:
    source_id = str(target.get("sourceId") or "")
    role = str(target.get("role") or "")
    type_name = _TYPE_NAMES.get(
        str(target.get("kind") or target_geometry.get("kind") or change.get("object_kind") or "")
    )
    if not type_name:
        type_name = {
            "component": "SCH_SYMBOL",
            "wire": "SCH_LINE",
            "label": "SCH_LABEL",
            "junction": "SCH_JUNCTION",
            "terminal": "SCH_PIN",
        }.get(role, "EDA_ITEM")
    refdes = change.get("reference") or change.get("net")
    return {
        "id": _change_id(change, target),
        "typeName": type_name,
        "kind": _KIND_NAMES[str(target.get("status") or change.get("kind"))],
        "sourceSide": str(target.get("side") or "comparison"),
        "properties": _property_deltas(change) if include_properties else [],
        **({"refdes": str(refdes)} if refdes else {}),
        **({"retainReference": True} if retain_reference else {}),
        "children": children or [],
    }


def _visual_targets(change: Mapping[str, Any]) -> List[Dict[str, Any]]:
    if (change.get("details") or {}).get("reviewOnly"):
        return []
    values = (change.get("details") or {}).get("visualTargets") or []
    targets = [dict(value) for value in values if isinstance(value, Mapping)]
    if targets:
        return targets
    source_id = _source_id(change)
    if not source_id:
        return []
    status = _KIND_NAMES[str(change.get("kind"))]
    return [{
        "side": (
            change.get("source_side")
            or ("reference" if change.get("kind") == "removed" else "comparison")
        ),
        "status": status,
        "sourceId": source_id,
        "page": _document_path(change, None),
        "role": "component" if change.get("reference") else "wire",
    }]


def _target_geometry(
    target: Mapping[str, Any],
    change: Mapping[str, Any],
    geometry: Optional[Mapping[str, Any]],
) -> Mapping[str, Any]:
    side = "base" if target.get("side") == "reference" else "head"
    domain = str(change.get("domain") or "")
    side_geometry = (((geometry or {}).get(side) or {}).get(domain) or {})
    source_id = target.get("sourceId")
    parent_source_id = target.get("parentSourceId")
    resolved = side_geometry.get(source_id) if source_id else None
    if resolved:
        return resolved
    parent = side_geometry.get(parent_source_id) if parent_source_id else None
    if parent:
        return parent
    return _geometry(change)


def _is_native_schematic_path(value: Any) -> bool:
    return isinstance(value, str) and value.replace("\\", "/").endswith(".kicad_sch")


def _sheet_instance_path(
    change: Mapping[str, Any],
    target: Mapping[str, Any],
) -> Optional[str]:
    """The KIID_PATH prefix for a hierarchical symbol, or None.

    A sheet reused across a hierarchy is one file, so every instance of it
    shares the same symbol UUIDs. KiCad identifies a symbol by
    ``sheetInstancePath + symbolUuid``; the UUID alone is ambiguous exactly as
    often as a sheet is instantiated more than once.

    Connectivity extraction can name a sheet by its human hierarchy; native
    target hydration moves that into ``sheetPath`` and rewrites ``page`` to the
    loadable filename supplied by the ecad-viewer parser.
    """
    if change.get("domain") == "pcb":
        return None
    for candidate in (
        target.get("sheetPath"),
        target.get("page"),
        change.get("page"),
    ):
        if not isinstance(candidate, str):
            continue
        normalized = candidate.replace("\\", "/")
        if not normalized.startswith("/") or _is_native_schematic_path(normalized):
            continue
        # The root sheet is "/", which contributes no disambiguating segment.
        return normalized.rstrip("/") or None
    return None


def _change_id(change: Mapping[str, Any], target: Mapping[str, Any]) -> str:
    """Native item id: the full KIID_PATH where the hierarchy supplies one."""
    source_id = str(target.get("sourceId") or "")
    prefix = _sheet_instance_path(change, target)
    return f"{prefix}/{source_id}" if prefix else f"/{source_id}"


def build_project_diff(
    *,
    schematic_changes: Iterable[Mapping[str, Any]],
    pcb_changes: Iterable[Mapping[str, Any]],
    files: Mapping[str, Any],
    geometry: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    """Build one strict PROJECT_DIFF plus a Prism-ID navigation sidecar."""

    pcb_path = _first_pcb_path(files)
    by_document: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    document_types: Dict[str, str] = {}
    navigation: Dict[str, Dict[str, Any]] = {}
    diagnostics: List[Dict[str, str]] = []
    claimed_targets: set[tuple[str, str, str]] = set()

    for original_change in [*schematic_changes, *pcb_changes]:
        change = dict(original_change)
        prism_id = str(change.get("id") or "")
        targets = _visual_targets(change)
        if not prism_id or not targets:
            if not (change.get("details") or {}).get("reviewOnly"):
                diagnostics.append(
                    {
                        "changeId": prism_id,
                        "reason": "missing-source-id",
                    }
                )
            continue

        resolved_by_document: Dict[
            str,
            List[tuple[Dict[str, Any], Mapping[str, Any]]],
        ] = defaultdict(list)
        candidates: List[tuple[Dict[str, Any], Mapping[str, Any], Optional[str]]] = []
        seen_targets: set[tuple[str, str, str, str]] = set()
        for target in targets:
            source_id = str(target.get("sourceId") or "")
            side = str(target.get("side") or "comparison")
            status = str(target.get("status") or "modified")
            key = (
                side,
                status,
                source_id,
                str(target.get("sheetPath") or ""),
            )
            if not source_id or key in seen_targets:
                continue
            seen_targets.add(key)
            target_geometry = _target_geometry(target, change, geometry)
            raw_path = (
                pcb_path
                if change.get("domain") == "pcb"
                else target.get("documentPath")
                or target_geometry.get("page")
                or target.get("page")
                or change.get("page")
                or (change.get("compare_item") or {}).get("page")
                or (change.get("base_item") or {}).get("page")
            )
            path = str(raw_path).replace("\\", "/") if raw_path else None
            candidates.append((target, target_geometry, path))

        native_paths_by_side: Dict[str, set[str]] = defaultdict(set)
        all_native_paths: set[str] = set()
        if change.get("domain") == "schematic":
            for target, _target_geometry_value, path in candidates:
                if path and _is_native_schematic_path(path):
                    side = str(target.get("side") or "comparison")
                    native_paths_by_side[side].add(path)
                    all_native_paths.add(path)

        for target, target_geometry, path in candidates:
            if change.get("domain") == "schematic" and not _is_native_schematic_path(path):
                side = str(target.get("side") or "comparison")
                side_paths = native_paths_by_side.get(side) or set()
                if len(side_paths) == 1:
                    path = next(iter(side_paths))
                elif len(all_native_paths) == 1:
                    path = next(iter(all_native_paths))
                else:
                    diagnostics.append(
                        {
                            "changeId": prism_id,
                            "reason": "unresolved-schematic-hierarchy",
                        }
                    )
                    continue
            if not path:
                diagnostics.append(
                    {
                        "changeId": prism_id,
                        "reason": "missing-document-path",
                    }
                )
                continue
            resolved_by_document[path].append(
                (target, target_geometry)
            )

        navigation_documents: List[Dict[str, Any]] = []
        for path, resolved_targets in resolved_by_document.items():
            unique_targets: List[
                tuple[Dict[str, Any], Mapping[str, Any]]
            ] = []
            duplicate_change_ids: List[str] = []
            for target, target_geometry in resolved_targets:
                change_id = _change_id(change, target)
                native_key = (
                    path,
                    change_id,
                    str(target.get("side") or "comparison"),
                )
                if native_key in claimed_targets:
                    duplicate_change_ids.append(change_id)
                    continue
                claimed_targets.add(native_key)
                unique_targets.append((target, target_geometry))

            if not unique_targets:
                change_ids = list(dict.fromkeys(duplicate_change_ids))
                if change_ids:
                    navigation_documents.append(
                        {
                            "documentPath": path,
                            "changeId": change_ids[0],
                            "changeIds": change_ids,
                        }
                    )
                continue

            first_target, first_geometry = unique_targets[0]
            children = [
                _item_change(
                    change,
                    target,
                    target_geometry,
                    include_properties=False,
                    retain_reference=True,
                )
                for target, target_geometry in unique_targets[1:]
            ]
            item = _item_change(
                change,
                first_target,
                first_geometry,
                children=children,
            )
            by_document[path].append(item)
            document_types[path] = (
                "kicad_pcb" if change.get("domain") == "pcb" else "kicad_sch"
            )
            navigation_documents.append(
                {
                    "documentPath": path,
                    "changeId": item["id"],
                    "changeIds": [
                        item["id"],
                        *(child["id"] for child in children),
                        *duplicate_change_ids,
                    ],
                }
            )

        if navigation_documents:
            navigation[prism_id] = {
                **navigation_documents[0],
                **(
                    {"documents": navigation_documents}
                    if len(navigation_documents) > 1
                    else {}
                ),
            }

    documents = [
        {
            "path": path,
            "docType": document_types[path],
            "changes": changes,
        }
        for path, changes in sorted(by_document.items())
    ]
    return {
        "schema": "prism.kicad_project_diff_v1",
        "provider": "prism-semantic",
        "project": {"documents": documents},
        "navigation": navigation,
        "diagnostics": diagnostics,
    }
