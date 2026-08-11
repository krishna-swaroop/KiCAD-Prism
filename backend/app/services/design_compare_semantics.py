"""The semantic diff: what the two designs mean, not what their files say.

Works entirely on the semantic index — components identified by designator and
library part, nets identified by the terminals they connect — so it sees a
component that moved sheets as one relocation rather than as a removal and an
addition, and a net whose membership changed as a connectivity edit rather than
as a rewritten wire.

Pure: give it two indexes and it returns the same changes every time.
"""

import json
from collections import defaultdict, deque
from typing import Any, Dict, Iterable, List, Optional


def _native_item(
    *,
    source_id: Optional[str],
    semantic_id: Optional[str],
    page: Optional[str] = None,
    layer: Optional[str] = None,
    layers: Optional[List[str]] = None,
    reference: Optional[str] = None,
    net: Optional[str] = None,
    parent_source_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if not any((source_id, semantic_id, reference, net)):
        return None
    return {
        "source_id": source_id,
        "parent_source_id": parent_source_id,
        "semantic_id": semantic_id,
        "page": page,
        "path": page,
        "layer": layer,
        # Every layer this revision's object occupies. A via keeps both span
        # endpoints here while `layer` stays the single primary layer.
        "layers": layers or ([layer] if layer else []),
        "reference": reference,
        "net": net,
    }


def _component_sources(component: Dict[str, Any], context: str = "schematic") -> List[str]:
    refs = component.get("schematicRefs" if context == "schematic" else "pcbRefs") or []
    key = "symbolUuid" if context == "schematic" else "footprintUuid"
    return [str(ref[key]) for ref in refs if ref.get(key)]


def _component_page(component: Dict[str, Any]) -> Optional[str]:
    return next(
        (
            str(ref.get("page"))
            for ref in component.get("schematicRefs") or []
            if ref.get("page")
        ),
        None,
    )


def _terminal_pairs(index: Dict[str, Any], net_uid: str) -> set[tuple[str, str]]:
    return {
        (str(item.get("reference") or ""), str(item.get("pin") or ""))
        for item in index.get("terminals") or []
        if item.get("netUid") == net_uid
    }


def _semantic_lookups(index: Dict[str, Any]) -> Dict[str, Any]:
    """Build the revision's hot lookup tables once for linear-time matching."""

    terminal_pairs_by_net: Dict[str, set[tuple[str, str]]] = defaultdict(set)
    terminals_by_pair: Dict[tuple[str, str], Dict[str, Any]] = {}
    for terminal in index.get("terminals") or []:
        pair = (
            str(terminal.get("reference") or ""),
            str(terminal.get("pin") or ""),
        )
        net_uid = str(terminal.get("netUid") or "")
        if net_uid:
            terminal_pairs_by_net[net_uid].add(pair)
        terminals_by_pair.setdefault(pair, terminal)

    components_by_reference: Dict[str, Dict[str, Any]] = {}
    components_by_native_key: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for component in index.get("components") or []:
        reference = str(component.get("reference") or "")
        if reference:
            components_by_reference.setdefault(reference, component)
        for key in _component_native_keys(component):
            components_by_native_key[key].append(component)

    return {
        "terminal_pairs_by_net": terminal_pairs_by_net,
        "terminals_by_pair": terminals_by_pair,
        "components_by_reference": components_by_reference,
        "components_by_native_key": components_by_native_key,
    }


def _lookup_terminal_pairs(
    index: Dict[str, Any],
    net_uid: str,
    lookups: Optional[Dict[str, Any]] = None,
) -> set[tuple[str, str]]:
    if lookups is None:
        return _terminal_pairs(index, net_uid)
    return set((lookups.get("terminal_pairs_by_net") or {}).get(str(net_uid), set()))


def _terminal_names(pairs: set[tuple[str, str]]) -> List[str]:
    return sorted(f"{reference}.{pin}" for reference, pin in pairs)


def _net_label_count(net: Optional[Dict[str, Any]]) -> int:
    if not net:
        return 0
    return sum(
        int(ref.get("labelInstanceCount") or 0)
        for ref in net.get("schematicRefs") or []
    )


def _net_source_ids(net: Optional[Dict[str, Any]]) -> List[str]:
    if not net:
        return []
    values: List[str] = []
    for ref in net.get("schematicRefs") or []:
        for bucket in ("wireUuids", "labelUuids", "pinUuids", "junctionUuids"):
            values.extend(str(value) for value in ref.get(bucket) or [] if value)
    return list(dict.fromkeys(values))


def _component_visual_targets(
    component: Optional[Dict[str, Any]],
    *,
    side: str,
    status: str,
) -> List[Dict[str, Any]]:
    if not component:
        return []
    return [
        {
            "side": side,
            "status": status,
            "sourceId": source_id,
            "page": _component_page(component),
            "role": "component",
        }
        for source_id in _component_sources(component)
    ]


def _net_bucket_targets(
    net: Optional[Dict[str, Any]],
    *,
    side: str,
    status: str,
    buckets: Optional[set[str]] = None,
) -> List[Dict[str, Any]]:
    if not net:
        return []
    roles = {
        "wireUuids": "wire",
        "labelUuids": "label",
        "junctionUuids": "junction",
        "pinUuids": "terminal",
    }
    selected = buckets or set(roles)
    targets: List[Dict[str, Any]] = []
    for ref in net.get("schematicRefs") or []:
        page = ref.get("page")
        sheet_instance_path = ref.get("sheetInstancePath")
        for bucket, role in roles.items():
            if bucket not in selected:
                continue
            for source_id in ref.get(bucket) or []:
                if not source_id:
                    continue
                target = {
                    "side": side,
                    "status": status,
                    "sourceId": str(source_id),
                    "page": str(page) if page else None,
                    "role": role,
                }
                if sheet_instance_path:
                    target["sheetPath"] = str(sheet_instance_path)
                targets.append(target)
    return targets


def _terminal_visual_target(
    index: Dict[str, Any],
    pair: tuple[str, str],
    *,
    side: str,
    status: str,
    lookups: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    reference, pin = pair
    if lookups is None:
        terminal = next(
            (
                item
                for item in index.get("terminals") or []
                if str(item.get("reference") or "") == reference
                and str(item.get("pin") or "") == pin
            ),
            None,
        )
        component = next(
            (
                item
                for item in index.get("components") or []
                if str(item.get("reference") or "") == reference
            ),
            None,
        )
    else:
        terminal = (lookups.get("terminals_by_pair") or {}).get(pair)
        component = (lookups.get("components_by_reference") or {}).get(reference)
    source_id = str((terminal or {}).get("schematicPinUuid") or "")
    parent_sources = _component_sources(component or {})
    parent_source_id = parent_sources[0] if parent_sources else None
    if not source_id and not parent_source_id:
        return None
    return {
        "side": side,
        "status": status,
        "sourceId": source_id or parent_source_id,
        "parentSourceId": parent_source_id,
        "page": _component_page(component or {}),
        "role": "terminal" if source_id else "component",
        "reference": reference,
        "pin": pin,
    }


def _dedupe_visual_targets(targets: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    result: List[Dict[str, Any]] = []
    positions: Dict[tuple[str, str, str, str], int] = {}
    for target in targets:
        key = (
            str(target.get("side") or ""),
            str(target.get("status") or ""),
            str(target.get("sourceId") or ""),
            str(target.get("sheetPath") or ""),
        )
        if not key[2]:
            continue
        if key in positions:
            existing = result[positions[key]]
            existing.update(
                {
                    name: value
                    for name, value in target.items()
                    if value not in (None, "", [])
                }
            )
            continue
        positions[key] = len(result)
        result.append(dict(target))
    return result


def _net_connectivity_fingerprint(
    index: Dict[str, Any],
    net: Dict[str, Any],
    lookups: Optional[Dict[str, Any]] = None,
) -> frozenset[tuple[str, str]]:
    """Cross-revision net identity from terminal/pad membership, not name."""
    return frozenset(
        _lookup_terminal_pairs(
            index,
            str(net.get("netUid") or ""),
            lookups,
        )
    )


def _net_source_id(net: Dict[str, Any], index: Dict[str, Any]) -> Optional[str]:
    """Pick a native paint identity so net-owned geometry enters PROJECT_DIFF."""
    for ref in net.get("schematicRefs") or []:
        for bucket in ("wireUuids", "labelUuids", "pinUuids", "junctionUuids"):
            for uid in ref.get(bucket) or []:
                if uid:
                    return str(uid)
    for ref in net.get("pcbRefs") or []:
        for bucket in ("trackUuids", "arcUuids", "viaUuids", "padUuids", "zoneUuids"):
            for uid in ref.get(bucket) or []:
                if uid:
                    return str(uid)
    net_uid = net.get("netUid")
    for item in index.get("terminals") or []:
        if item.get("netUid") == net_uid and item.get("schematicPinUuid"):
            return str(item["schematicPinUuid"])
        if item.get("netUid") == net_uid and item.get("pcbPadUuid"):
            return str(item["pcbPadUuid"])
    return None


def _component_native_keys(component: Dict[str, Any]) -> set[str]:
    keys: set[str] = set()
    for ref in component.get("schematicRefs") or []:
        uuid = ref.get("symbolUuid")
        if uuid:
            keys.add(f"sch:{uuid}")
    for ref in component.get("pcbRefs") or []:
        uuid = ref.get("footprintUuid")
        if uuid:
            keys.add(f"pcb:{uuid}")
    return keys


def _match_by_keys(
    base_items: List[Dict[str, Any]],
    head_items: List[Dict[str, Any]],
    keys_of,
) -> List[tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]]:
    """Greedy 1:1 match using a prebuilt key index."""
    pairs: List[tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]] = []
    head_by_key: Dict[str, deque[Dict[str, Any]]] = defaultdict(deque)
    for candidate in head_items:
        for key in keys_of(candidate):
            head_by_key[str(key)].append(candidate)
    used_head: set[int] = set()
    for old in base_items:
        match = None
        for key in sorted(str(value) for value in keys_of(old)):
            candidates = head_by_key.get(key) or []
            while candidates and id(candidates[0]) in used_head:
                candidates.popleft()
            if candidates:
                match = candidates.popleft()
                break
        if match is None:
            pairs.append((old, None))
            continue
        used_head.add(id(match))
        pairs.append((old, match))
    for new in head_items:
        if id(new) not in used_head:
            pairs.append((None, new))
    return pairs


def _summary(changes: List[Dict[str, Any]]) -> Dict[str, int]:
    return {
        "added": sum(1 for change in changes if change["kind"] == "added"),
        "removed": sum(1 for change in changes if change["kind"] == "removed"),
        "changed": sum(1 for change in changes if change["kind"] == "changed"),
    }


def _semantic_structure_changes(
    base: Dict[str, Any],
    head: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """First-class tier-1 changes for buses and concrete sheet instances."""

    changes: List[Dict[str, Any]] = []

    def target(
        item: Dict[str, Any],
        *,
        side: str,
        status: str,
        sheet_instance: bool = False,
    ) -> Optional[Dict[str, Any]]:
        source_id = item.get("sheetSymbolUuid") if sheet_instance else item.get("sourceUuid")
        if not source_id:
            return None
        return {
            "side": side,
            "status": status,
            "sourceId": source_id,
            "page": item.get("parentPage") if sheet_instance else item.get("page"),
            "sheetPath": (
                item.get("parentSheetInstancePath")
                if sheet_instance
                else item.get("sheetInstancePath")
            ),
            "role": "sheet" if sheet_instance else item.get("kind") or "bus",
            "kind": "sheet" if sheet_instance else item.get("kind") or "bus",
        }

    def emit_collection(
        collection: str,
        uid_field: str,
        *,
        category: str,
        sheet_instance: bool = False,
    ) -> None:
        old_by_uid = {
            str(item.get(uid_field)): item
            for item in base.get(collection) or []
            if item.get(uid_field)
        }
        new_by_uid = {
            str(item.get(uid_field)): item
            for item in head.get(collection) or []
            if item.get(uid_field)
        }
        for uid in sorted(old_by_uid.keys() | new_by_uid.keys()):
            old = old_by_uid.get(uid)
            new = new_by_uid.get(uid)
            if old == new:
                continue
            kind = "added" if old is None else "removed" if new is None else "changed"
            if kind == "added":
                visual_targets = [
                    value
                    for value in [
                        target(
                            new or {},
                            side="comparison",
                            status="added",
                            sheet_instance=sheet_instance,
                        )
                    ]
                    if value
                ]
            elif kind == "removed":
                visual_targets = [
                    value
                    for value in [
                        target(
                            old or {},
                            side="reference",
                            status="removed",
                            sheet_instance=sheet_instance,
                        )
                    ]
                    if value
                ]
            else:
                visual_targets = [
                    value
                    for value in (
                        target(
                            old or {},
                            side="reference",
                            status="modified",
                            sheet_instance=sheet_instance,
                        ),
                        target(
                            new or {},
                            side="comparison",
                            status="modified",
                            sheet_instance=sheet_instance,
                        ),
                    )
                    if value
                ]
            # The root sheet and a bus alias have no native selectable object.
            # They remain indexed, but do not manufacture an unresolved change.
            if not visual_targets:
                continue
            active = new or old or {}
            fields: Dict[str, Any] = {}
            if sheet_instance:
                for name in ("sheetPath", "sheetInstancePath", "page"):
                    before = (old or {}).get(name)
                    after = (new or {}).get(name)
                    if before != after:
                        fields[name] = {"old": before, "new": after}
            elif kind == "changed":
                fields["busContent"] = {
                    "old": json.dumps(old, sort_keys=True, separators=(",", ":")),
                    "new": json.dumps(new, sort_keys=True, separators=(",", ":")),
                }
            else:
                fields["instances"] = {
                    "old": 0 if old is None else 1,
                    "new": 0 if new is None else 1,
                }
            label = (
                active.get("sheetName")
                or active.get("name")
                or active.get("kind")
                or uid
            )
            changes.append(
                {
                    "id": f"sch-{category}-{kind}-{uid}",
                    "kind": kind,
                    "domain": "schematic",
                    "category": category,
                    "classification": "primary",
                    "label": str(label),
                    "semantic_id": uid,
                    "page": visual_targets[0].get("page"),
                    "source_id_base": (old or {}).get(
                        "sheetSymbolUuid" if sheet_instance else "sourceUuid"
                    ),
                    "source_id_compare": (new or {}).get(
                        "sheetSymbolUuid" if sheet_instance else "sourceUuid"
                    ),
                    "source_side": "reference" if kind == "removed" else "comparison",
                    "fields": fields,
                    "reasons": [
                        "object-added"
                        if kind == "added"
                        else "object-removed"
                        if kind == "removed"
                        else "sheet-changed"
                        if sheet_instance
                        else "content-changed"
                    ],
                    "details": {
                        "visualTargets": _dedupe_visual_targets(visual_targets)
                    },
                    "object_kind": "sheet" if sheet_instance else active.get("kind"),
                }
            )

    emit_collection("buses", "busUid", category="nets")
    emit_collection(
        "sheetInstances",
        "sheetInstanceUid",
        category="sheets",
        sheet_instance=True,
    )
    return changes


def _diff_designs(base: Dict[str, Any], head: Dict[str, Any]) -> Dict[str, Any]:
    """Diff compact kicad-monkey semantic indexes with connectivity-aware matching.

    Components prefer native schematic/PCB UUIDs over refdes so renames become
    modified. Nets prefer terminal/pad fingerprints over name so renames and
    rewires are explicit; name-hash netUid is never treated as a cross-commit UID.
    """
    base_lookups = _semantic_lookups(base)
    head_lookups = _semantic_lookups(head)
    # Order is part of the contract: components, then nets, then the
    # project-level records. The queue regroups and re-sorts these, but the
    # raw list is also what the CSV export and the debug log record.
    changes: List[Dict[str, Any]] = [
        *_diff_components(base, head, base_lookups, head_lookups),
        *_diff_nets(base, head, base_lookups, head_lookups),
        *_semantic_structure_changes(base, head),
    ]
    return {"changes": changes, "summary": _summary(changes)}


def _diff_components(
    base: Dict[str, Any],
    head: Dict[str, Any],
    base_lookups: Dict[str, Any],
    head_lookups: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Components matched on native identity first, then on designator.

    Matching native UUIDs before refdes is what makes a re-annotation read as
    one modified component rather than as a removal plus an addition.
    """
    base_components = [item for item in base.get("components") or [] if item.get("reference")]
    head_components = [item for item in head.get("components") or [] if item.get("reference")]
    base_lookups = _semantic_lookups(base)
    head_lookups = _semantic_lookups(head)
    changes: List[Dict[str, Any]] = []

    def component_change(
        old: Optional[Dict[str, Any]],
        new: Optional[Dict[str, Any]],
        *,
        kind: Optional[str] = None,
        reasons: Optional[List[str]] = None,
        details: Optional[Dict[str, Any]] = None,
        base_sources: Optional[List[str]] = None,
        compare_sources: Optional[List[str]] = None,
        source_side: Optional[str] = None,
        semantic_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        old_reference = str((old or {}).get("reference") or "")
        new_reference = str((new or {}).get("reference") or "")
        reference = new_reference or old_reference
        old_page, new_page = _component_page(old or {}), _component_page(new or {})
        base_ids = base_sources if base_sources is not None else _component_sources(old or {})
        compare_ids = compare_sources if compare_sources is not None else _component_sources(new or {})
        change_kind = kind or ("added" if old is None else "removed" if new is None else "changed")
        resolved_side = source_side or ("reference" if change_kind == "removed" else "comparison")
        base_source = base_ids[0] if base_ids else None
        compare_source = compare_ids[0] if compare_ids else None
        active_source = base_source if resolved_side == "reference" else compare_source or base_source
        resolved_semantic_id = semantic_id or (new or old or {}).get("componentUid") or f"ref:{reference}"
        pages = list(dict.fromkeys(page for page in (old_page, new_page) if page))
        instance_delta = (details or {}).get("instanceCount") or {}
        old_instance_count = instance_delta.get("old")
        new_instance_count = instance_delta.get("new")
        visual_targets: List[Dict[str, Any]] = []
        if change_kind != "added":
            visual_targets.extend(
                {
                    "side": "reference",
                    "status": (
                        "removed"
                        if change_kind == "removed"
                        or (
                            isinstance(old_instance_count, int)
                            and isinstance(new_instance_count, int)
                            and new_instance_count < old_instance_count
                        )
                        else "modified"
                    ),
                    "sourceId": source_id,
                    "page": old_page,
                    "role": "component",
                }
                for source_id in base_ids
            )
        if change_kind != "removed":
            visual_targets.extend(
                {
                    "side": "comparison",
                    "status": (
                        "added"
                        if change_kind == "added"
                        or (
                            isinstance(old_instance_count, int)
                            and isinstance(new_instance_count, int)
                            and new_instance_count > old_instance_count
                        )
                        else "modified"
                    ),
                    "sourceId": source_id,
                    "page": new_page,
                    "role": "component",
                }
                for source_id in compare_ids
            )
        resolved_details = dict(details or {})
        resolved_details["visualTargets"] = _dedupe_visual_targets(visual_targets)
        fields: Dict[str, Any] = {}
        if old is None:
            fields = {
                field: {"old": None, "new": value}
                for field, value in ((new or {}).get("fields") or {}).items()
                if value not in (None, "")
            }
        elif new is not None:
            old_fields = dict(old.get("fields") or {})
            new_fields = dict(new.get("fields") or {})
            if old_reference != new_reference:
                old_fields["Reference"] = old_reference
                new_fields["Reference"] = new_reference
            fields = {
                field: {"old": old_fields.get(field, ""), "new": new_fields.get(field, "")}
                for field in sorted(old_fields.keys() | new_fields.keys())
                if old_fields.get(field, "") != new_fields.get(field, "")
            }
        return {
            "id": f"sch-comp-{change_kind}-{resolved_semantic_id}",
            "kind": change_kind,
            "domain": "schematic",
            "category": "components",
            "classification": "primary",
            "label": reference,
            "reference": reference,
            "semantic_id": resolved_semantic_id,
            "page": new_page or old_page,
            "alsoOnPages": pages,
            "source_id_base": base_source,
            "source_id_compare": compare_source,
            "affected_source_ids_base": base_ids,
            "affected_source_ids_compare": compare_ids,
            "source_side": resolved_side,
            "uuid": active_source,
            "base_item": _native_item(
                source_id=base_source,
                semantic_id=resolved_semantic_id,
                page=old_page,
                reference=old_reference or reference,
            ),
            "compare_item": _native_item(
                source_id=compare_source,
                semantic_id=resolved_semantic_id,
                page=new_page,
                reference=new_reference or reference,
            ),
            "fields": fields,
            "reasons": reasons or (["object-added"] if change_kind == "added" else ["object-removed"]),
            "details": resolved_details,
        }

    # Match native identities first. This preserves renames and lets placement
    # changes disappear when fields, sheet, and connectivity are unchanged.
    native_pairs = _match_by_keys(
        base_components,
        head_components,
        _component_native_keys,
    )
    matched_pairs = [
        (old, new)
        for old, new in native_pairs
        if old is not None and new is not None
    ]
    base_unmatched = [
        old for old, new in native_pairs if old is not None and new is None
    ]
    head_unused = [
        new for old, new in native_pairs if old is None and new is not None
    ]

    for old, new in matched_pairs:
        field_probe = component_change(old, new)
        reasons: List[str] = []
        details: Dict[str, Any] = {}
        if field_probe["fields"]:
            reasons.append("symbol-fields-changed")
            details["fieldDeltas"] = field_probe["fields"]
        old_page, new_page = _component_page(old), _component_page(new)
        if old_page != new_page:
            reasons.append("sheet-changed")
            details["sheetChange"] = {"old": old_page, "new": new_page}
        if _component_sources(old) != _component_sources(new):
            reasons.append("instance-replaced")
        if reasons:
            change = component_change(old, new, reasons=reasons, details=details)
            changes.append(change)

    base_by_ref: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    head_by_ref: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    all_base_by_ref: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    all_head_by_ref: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for component in base_unmatched:
        base_by_ref[str(component.get("reference"))].append(component)
    for component in head_unused:
        head_by_ref[str(component.get("reference"))].append(component)
    for component in base_components:
        all_base_by_ref[str(component.get("reference"))].append(component)
    for component in head_components:
        all_head_by_ref[str(component.get("reference"))].append(component)

    for reference in sorted(base_by_ref.keys() | head_by_ref.keys()):
        old_group = sorted(base_by_ref.get(reference, []), key=lambda item: _component_sources(item))
        new_group = sorted(head_by_ref.get(reference, []), key=lambda item: _component_sources(item))
        old_all = all_base_by_ref.get(reference, [])
        new_all = all_head_by_ref.get(reference, [])
        old_count, new_count = len(old_all), len(new_all)
        base_ids = [source for item in old_group for source in _component_sources(item)]
        compare_ids = [source for item in new_group for source in _component_sources(item)]
        semantic_id = (
            str((new_group[0] if len(new_group) == 1 else {}).get("componentUid") or "")
            or str((old_group[0] if len(old_group) == 1 else {}).get("componentUid") or "")
            or f"ref:{reference}"
        )

        if old_count and new_count and old_count != new_count:
            source_side = "comparison" if new_count > old_count else "reference"
            change = component_change(
                old_group[0] if old_group else old_all[0],
                new_group[0] if new_group else new_all[0],
                kind="changed",
                reasons=["instance-count-changed"],
                details={"instanceCount": {"old": old_count, "new": new_count}},
                base_sources=base_ids,
                compare_sources=compare_ids,
                source_side=source_side,
                semantic_id=semantic_id,
            )
            change["affected_source_ids_base"] = [
                source for item in old_all for source in _component_sources(item)
            ]
            change["affected_source_ids_compare"] = [
                source for item in new_all for source in _component_sources(item)
            ]
            change["fields"]["instanceCount"] = {"old": old_count, "new": new_count}
            changes.append(change)
        elif old_group and new_group:
            # Same RefDes, same multiplicity, but no shared native UUID: a
            # copy/paste or delete/recreate operation is a semantic replacement.
            changes.append(
                component_change(
                    old_group[0],
                    new_group[0],
                    kind="changed",
                    reasons=["instance-replaced"],
                    details={"instanceReplacement": {"old": base_ids, "new": compare_ids}},
                    base_sources=base_ids,
                    compare_sources=compare_ids,
                    semantic_id=semantic_id,
                )
            )
        elif old_group:
            change = component_change(
                old_group[0],
                None,
                kind="removed",
                base_sources=base_ids,
                compare_sources=[],
                semantic_id=semantic_id,
            )
            change["details"]["instanceCount"] = {"old": old_count, "new": 0}
            changes.append(change)
        elif new_group:
            change = component_change(
                None,
                new_group[0],
                kind="added",
                base_sources=[],
                compare_sources=compare_ids,
                semantic_id=semantic_id,
            )
            change["details"]["instanceCount"] = {"old": 0, "new": new_count}
            changes.append(change)

    return changes


def _diff_nets(
    base: Dict[str, Any],
    head: Dict[str, Any],
    base_lookups: Dict[str, Any],
    head_lookups: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Nets matched on the terminals they connect, then on name.

    Fingerprinting membership first is what separates a renamed net from a
    rewired one: the same terminals under a new name is a rename, the same
    name over different terminals is a connectivity change.
    """
    changes: List[Dict[str, Any]] = []
    base_nets = [item for item in base.get("nets") or [] if item.get("name")]
    head_nets = [item for item in head.get("nets") or [] if item.get("name")]
    base_by_fp: Dict[frozenset[tuple[str, str]], List[Dict[str, Any]]] = {}
    head_by_fp: Dict[frozenset[tuple[str, str]], List[Dict[str, Any]]] = {}
    for net in base_nets:
        fp = _net_connectivity_fingerprint(base, net, base_lookups)
        if fp:
            base_by_fp.setdefault(fp, []).append(net)
    for net in head_nets:
        fp = _net_connectivity_fingerprint(head, net, head_lookups)
        if fp:
            head_by_fp.setdefault(fp, []).append(net)

    net_pairs: List[tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]] = []
    used_base: set[int] = set()
    used_head: set[int] = set()

    for fp in sorted(base_by_fp.keys() & head_by_fp.keys(), key=lambda value: sorted(value)):
        base_group = list(base_by_fp[fp])
        head_group = list(head_by_fp[fp])
        # Disambiguate identical connectivity by net name when possible.
        head_by_name: Dict[str, deque[Dict[str, Any]]] = defaultdict(deque)
        unmatched_heads: deque[Dict[str, Any]] = deque()
        for item in head_group:
            head_by_name[str(item.get("name"))].append(item)
            unmatched_heads.append(item)
        for old in base_group:
            named_candidates = head_by_name.get(str(old.get("name")))
            named = named_candidates.popleft() if named_candidates else None
            if named is not None:
                net_pairs.append((old, named))
                used_base.add(id(old))
                used_head.add(id(named))
                continue
            while unmatched_heads and id(unmatched_heads[0]) in used_head:
                unmatched_heads.popleft()
            if unmatched_heads:
                candidate = unmatched_heads.popleft()
                net_pairs.append((old, candidate))
                used_base.add(id(old))
                used_head.add(id(candidate))

    leftover_base_nets = [net for net in base_nets if id(net) not in used_base]
    leftover_head_nets = [net for net in head_nets if id(net) not in used_head]
    by_name_base: Dict[str, deque[Dict[str, Any]]] = defaultdict(deque)
    by_name_head: Dict[str, deque[Dict[str, Any]]] = defaultdict(deque)
    for item in leftover_base_nets:
        by_name_base[str(item.get("name"))].append(item)
    for item in leftover_head_nets:
        by_name_head[str(item.get("name"))].append(item)
    for name in sorted(by_name_base.keys() | by_name_head.keys()):
        old_group = by_name_base.get(name, deque())
        new_group = by_name_head.get(name, deque())
        while old_group or new_group:
            net_pairs.append(
                (
                    old_group.popleft() if old_group else None,
                    new_group.popleft() if new_group else None,
                )
            )

    for old, new in net_pairs:
        name = str((new or old or {}).get("name") or "")
        old_pairs = (
            _lookup_terminal_pairs(base, str(old.get("netUid") or ""), base_lookups)
            if old
            else set()
        )
        new_pairs = (
            _lookup_terminal_pairs(head, str(new.get("netUid") or ""), head_lookups)
            if new
            else set()
        )
        # Prefer compare-side identity for navigation; never use name-hash as UID.
        semantic_id = (new or old or {}).get("netUid")
        base_source = _net_source_id(old, base) if old else None
        compare_source = _net_source_id(new, head) if new else None
        base_sources = _net_source_ids(old)
        compare_sources = _net_source_ids(new)
        base_label_count = _net_label_count(old)
        compare_label_count = _net_label_count(new)
        page = None
        kind = "added" if old is None else "removed" if new is None else "changed"
        fields: Dict[str, Any] = {}
        reasons: List[str] = []
        details: Dict[str, Any] = {}
        if old is not None and new is not None:
            old_name, new_name = str(old.get("name") or ""), str(new.get("name") or "")
            if old_name != new_name:
                fields["name"] = {"old": old_name, "new": new_name}
                reasons.append("net-renamed")
            if old_pairs != new_pairs:
                fields["connections"] = {"old": len(old_pairs), "new": len(new_pairs)}
                reasons.append("connectivity-changed")
                details["connectivity"] = {
                    "addedTerminals": _terminal_names(new_pairs - old_pairs),
                    "removedTerminals": _terminal_names(old_pairs - new_pairs),
                }
            if base_label_count != compare_label_count:
                fields["labelInstances"] = {
                    "old": base_label_count,
                    "new": compare_label_count,
                }
                reasons.append("label-count-changed")
                details["labelInstances"] = {
                    "old": base_label_count,
                    "new": compare_label_count,
                }
            old_aliases = sorted(str(value) for value in old.get("aliases") or [])
            new_aliases = sorted(str(value) for value in new.get("aliases") or [])
            if old_aliases != new_aliases:
                fields["busMembership"] = {
                    "old": ", ".join(old_aliases),
                    "new": ", ".join(new_aliases),
                }
                reasons.append("bus-membership-changed")
            if not reasons:
                continue
        elif kind == "added":
            fields["instances"] = {"old": 0, "new": 1}
            if new_pairs:
                fields["connections"] = {"old": 0, "new": len(new_pairs)}
            details["netInstances"] = {"old": 0, "new": 1}
            reasons.append("object-added")
        elif kind == "removed":
            fields["instances"] = {"old": 1, "new": 0}
            if old_pairs:
                fields["connections"] = {"old": len(old_pairs), "new": 0}
            details["netInstances"] = {"old": 1, "new": 0}
            reasons.append("object-removed")

        visual_targets: List[Dict[str, Any]] = []
        if kind == "added":
            visual_targets.extend(
                _net_bucket_targets(
                    new,
                    side="comparison",
                    status="added",
                )
            )
            visual_targets.extend(
                target
                for pair in sorted(new_pairs)
                if (
                    target := _terminal_visual_target(
                        head,
                        pair,
                        side="comparison",
                        status="added",
                        lookups=head_lookups,
                    )
                )
            )
        elif kind == "removed":
            visual_targets.extend(
                _net_bucket_targets(
                    old,
                    side="reference",
                    status="removed",
                )
            )
            visual_targets.extend(
                target
                for pair in sorted(old_pairs)
                if (
                    target := _terminal_visual_target(
                        base,
                        pair,
                        side="reference",
                        status="removed",
                        lookups=base_lookups,
                    )
                )
            )
        else:
            if "net-renamed" in reasons:
                visual_targets.extend(
                    _net_bucket_targets(
                        old,
                        side="reference",
                        status="modified",
                    )
                )
                visual_targets.extend(
                    _net_bucket_targets(
                        new,
                        side="comparison",
                        status="modified",
                    )
                )
            if "connectivity-changed" in reasons:
                # Sorted, like `_terminal_names` already does with the same
                # pairs. Set iteration order varies with the interpreter's hash
                # seed, and `_dedupe_visual_targets` merges targets sharing a
                # source id by letting the later one overwrite fields — so an
                # unordered walk made the `reference` a target reports differ
                # between two identical runs.
                visual_targets.extend(
                    target
                    for pair in sorted(old_pairs - new_pairs)
                    if (
                        target := _terminal_visual_target(
                            base,
                            pair,
                            side="reference",
                            status="removed",
                            lookups=base_lookups,
                        )
                    )
                )
                visual_targets.extend(
                    target
                    for pair in sorted(new_pairs - old_pairs)
                    if (
                        target := _terminal_visual_target(
                            head,
                            pair,
                            side="comparison",
                            status="added",
                            lookups=head_lookups,
                        )
                    )
                )
            if "label-count-changed" in reasons:
                old_labels = _net_bucket_targets(
                    old,
                    side="reference",
                    status="removed",
                    buckets={"labelUuids"},
                )
                new_labels = _net_bucket_targets(
                    new,
                    side="comparison",
                    status="added",
                    buckets={"labelUuids"},
                )
                old_ids = {str(target["sourceId"]) for target in old_labels}
                new_ids = {str(target["sourceId"]) for target in new_labels}
                visual_targets.extend(
                    target
                    for target in old_labels
                    if str(target["sourceId"]) not in new_ids
                )
                visual_targets.extend(
                    target
                    for target in new_labels
                    if str(target["sourceId"]) not in old_ids
                )
            if "bus-membership-changed" in reasons:
                visual_targets.extend(
                    _net_bucket_targets(
                        old,
                        side="reference",
                        status="modified",
                    )
                )
                visual_targets.extend(
                    _net_bucket_targets(
                        new,
                        side="comparison",
                        status="modified",
                    )
                )

        visual_targets = _dedupe_visual_targets(visual_targets)
        if not visual_targets:
            visual_targets.extend(
                _net_bucket_targets(
                    old,
                    side="reference",
                    status="modified",
                )
            )
            visual_targets.extend(
                _net_bucket_targets(
                    new,
                    side="comparison",
                    status="modified",
                )
            )
            visual_targets = _dedupe_visual_targets(visual_targets)
        details["visualTargets"] = visual_targets
        page = next(
            (
                str(target.get("page"))
                for target in visual_targets
                if target.get("page")
            ),
            None,
        )

        changes.append(
            {
                "id": f"sch-net-{kind}-{semantic_id or name}",
                "kind": kind,
                "domain": "schematic",
                "category": "nets",
                "label": name,
                "net": name,
                "semantic_id": semantic_id,
                "page": page,
                "classification": "primary",
                "source_id_base": base_source,
                "source_id_compare": compare_source,
                "affected_source_ids_base": base_sources,
                "affected_source_ids_compare": compare_sources,
                "source_side": "reference" if kind == "removed" else "comparison",
                "uuid": compare_source or base_source,
                "base_item": _native_item(
                    source_id=base_source, semantic_id=semantic_id, net=name
                ),
                "compare_item": _native_item(
                    source_id=compare_source, semantic_id=semantic_id, net=name
                ),
                "fields": fields,
                "reasons": reasons,
                "details": details,
            }
        )

    return changes
