"""Build a ``prism.system_manifest.v1`` from the live system, and import one (CONTRACTS_P2 §9).

``build`` reads one system inside a transaction and returns a validated
``Manifest``: unredacted, like a snapshot document (redaction happens on read).
``import_manifest`` recreates a system from a manifest, keeping its IDs, so a
manifest round-trips DB → manifest → DB (and, in M7, Git → DB).

P2 objects that have no tables yet (harness nodes, driving mates) are
emitted empty; their tickets extend both directions.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Mapping, Optional

from app.services.systems import harnesses as harnesses_module
from app.services.systems.placement import poses as placement_poses
from app.services.systems.manifest_schema import SCHEMA, Manifest
from app.services.systems.store import Invalid, SystemStore


def _iso(value: Any) -> str:
    return value.isoformat() if isinstance(value, datetime) else str(value)


def _port(baseline: Mapping[str, Any]) -> dict:
    return {
        "portKey": baseline["portKey"],
        "memberKeys": sorted(baseline.get("memberKeys") or [baseline["portKey"]]),
        "reference": baseline.get("reference") or "",
        "libId": baseline.get("libId"),
        "footprint": baseline.get("footprint"),
        "pinCount": int(baseline.get("pinCount") or 0),
    }


def _manifest_end(kinds: Mapping[str, str], instance_id: str, baseline: Mapping[str, Any]) -> dict:
    """A link or harness-end mate: a port end, or an export end on an assembly (§6.1)."""
    port = _port(baseline)
    if kinds.get(instance_id, "board") == "assembly":
        return {"instanceId": instance_id, "exportId": port["portKey"],
                "export": {"exportId": port["portKey"], "name": port["reference"], "reference": port["reference"],
                           "libId": port["libId"], "footprint": port["footprint"], "pinCount": port["pinCount"]}}
    return {"instanceId": instance_id, "portKey": port["portKey"], "port": port}


def build(
    store: SystemStore, system_id: str, *, created_by: str, created_at: Any,
    snapshot: Optional[Mapping[str, str]] = None,
    catalog_refs: Optional[Mapping[str, Mapping[str, Any]]] = None,
) -> Manifest:
    """The manifest of ``system_id`` as stored now. ``snapshot`` fills ``meta.snapshot``.

    ``catalog_refs`` maps each assembly/module instance ID to its pinned
    revision (``system_revision`` shape: ``version``, ``identity``); the
    catalog is a separate service, so the caller reads it.
    """

    system = store.get_system(system_id)
    instances = []
    for instance in sorted(store.list_instances(system_id, kinds=SystemStore.ALL_KINDS), key=lambda i: i["id"]):
        if instance["kind"] != "board":
            ref = (catalog_refs or {}).get(instance["id"])
            if ref is None:
                raise Invalid(f"catalog revision of {instance['label']} is not available")
            instances.append({
                "id": instance["id"], "label": instance["label"], "kind": instance["kind"],
                "catalog": {"componentId": instance["catalog_component_id"],
                            "revisionId": instance["catalog_revision_id"],
                            "revisionVersion": int(ref["version"]), "identity": str(ref.get("identity") or "")},
                "follow": instance["follow"],
            })
            continue
        overrides = store.list_overrides(instance["id"])
        instances.append({
            "id": instance["id"], "label": instance["label"], "kind": "board",
            "projectId": instance["project_id"], "baselineCommit": instance["baseline_commit"],
            "trackedRef": instance["tracked_ref"], "pinned": bool(instance["pinned"]),
            "portOverrides": [{"portKey": key, "state": state} for key, state in sorted(overrides.items())],
        })
    kinds = {i["id"]: i["kind"] for i in store.list_instances(system_id, kinds=SystemStore.ALL_KINDS)}
    links = []
    for link in sorted(store.list_links(system_id), key=lambda item: item["id"]):
        ends = {end: _manifest_end(kinds, link[f"{end}_instance_id"], link[f"{end}_port"]) for end in ("a", "b")}
        links.append({
            "id": link["id"], "name": link["name"], "type": link.get("type") or "unspecified",
            "stackHeightMm": link.get("stack_height_mm"),
            "harnessLabel": link["harness"], **ends,
            "rows": [{
                "id": row["id"], "pinA": row["pin_a"], "pinB": row["pin_b"], "signal": row["signal"],
                "source": row["source"], "netA": sorted(row["net_a"]), "netB": sorted(row["net_b"]),
            } for row in sorted(link["rows"], key=lambda r: r["id"])],
        })
    exports = []
    for export in sorted(store.list_exports(system_id), key=lambda e: e["id"]):
        if export["target_port"]:
            port = _port(export["target_port"])
            target = {"instanceId": export["target_instance_id"], "portKey": port["portKey"], "port": port}
        else:
            target = {"instanceId": export["target_instance_id"], "exportId": export["target_export_id"]}
        exports.append({"id": export["id"], "name": export["name"], "description": export["description"],
                        "target": target})
    harnesses = [{
        "id": harness["id"], "name": harness["name"], "label": harness["label"],
        "cutLengthMm": harness["cut_length_mm"], "serviceAllowancePct": harness["service_allowance_pct"],
        "ends": [{"id": end["id"], "ordinal": end["ordinal"],
                  "mates": (_manifest_end(kinds, end["mates_instance_id"], end["mates_port"])
                            if end["mates_instance_id"] and end["mates_port"] else None),
                  "part": harnesses_module.part_ref(end),
                  "pinCount": end["pin_count"], "pinMap": end["pin_map"], "bootMm": end["boot_mm"],
                  "partPins": end["part_pins"]}
                 for end in harness["ends"]],
        "wires": [{"id": wire["id"], "from": {"end": wire["from_end"], "pin": wire["from_pin"]},
                   "to": {"end": wire["to_end"], "pin": wire["to_pin"]}, "signal": wire["signal"],
                   "gaugeAwg": wire["gauge_awg"], "colour": wire["colour"], "label": wire["label"],
                   "netFrom": sorted(wire["net_from"]), "netTo": sorted(wire["net_to"])}
                  for wire in sorted(harness["wires"], key=lambda w: w["id"])],
        "nodes": [],
    } for harness in sorted(store.list_harnesses(system_id), key=lambda h: h["id"])]
    mating = [
        {"instanceId": instance["id"], "portKey": port_key, "mode": record["mode"],
         "frame": {"axis": record["axis"], "quarterTurns": record["quarterTurns"]},
         "geometryDigest": record["geometryDigest"]}
        for instance in sorted(store.list_instances(system_id), key=lambda i: i["id"])
        for port_key, record in sorted(store.list_mating(instance["id"]).items())
    ]
    layout = store.get_layout(system_id)
    body = {
        "schema": SCHEMA,
        "system": {"id": system["id"], "name": system["name"], "description": system["description"],
                   "optionalRules": sorted(system.get("optional_rules") or [])},
        "meta": {
            "createdAt": _iso(created_at), "createdBy": created_by, "sourceVersion": int(system["version"]),
            "snapshot": dict(snapshot) if snapshot else None,
        },
        "instances": instances,
        "exports": exports,
        "links": links,
        "harnesses": harnesses,
        "mating": mating,
        "placement": {"poses": [{"instanceId": instance_id, "translationMm": pose["translationMm"],
                                 "rotation": pose["rotation"], "source": pose["source"]}
                                for instance_id, pose in sorted(store.list_poses(system_id).items())],
                      "drivingMates": []},
        "layout": {"positions": {key: {"x": float(p["x"]), "y": float(p["y"])}
                                 for key, p in sorted(layout.items())}},
    }
    return Manifest.model_validate(body)


def _end_baseline(end: Any) -> dict:
    """The stored port baseline of a manifest link end; an export end stores its export as a port."""
    if hasattr(end, "port"):
        return end.port.model_dump()
    export = end.export
    return {"portKey": export.exportId, "memberKeys": [export.exportId], "reference": export.name,
            "libId": export.libId, "footprint": export.footprint, "pinCount": export.pinCount}


def import_manifest(
    store: SystemStore, manifest: Manifest, *, actor: str, folder_id: Optional[str] = None,
) -> str:
    """Create the manifest's system with its own IDs. Returns the system ID.

    Row net baselines are taken from the manifest as-is (they are the accepted
    baselines), so an imported system validates exactly as the source did.
    Runs inside the caller's transaction; a clash with an existing ID fails it.
    """

    unsupported = []
    if any(harness.nodes for harness in manifest.harnesses):
        unsupported.append("harness nodes")
    if manifest.placement.drivingMates:
        unsupported.append("driving mates")
    if unsupported:
        raise Invalid(f"manifest sections not supported yet: {', '.join(unsupported)}")

    row = store.create_system(
        name=manifest.system.name, description=manifest.system.description, folder_id=folder_id,
        actor=actor, system_id=manifest.system.id, optional_rules=manifest.system.optionalRules,
    )
    with store.mutation(row["id"], expected_version=None, actor=actor) as change:
        for instance in manifest.instances:
            if instance.kind != "board":
                store.add_catalog_instance(
                    change, kind=instance.kind, label=instance.label, component_id=instance.catalog.componentId,
                    revision_id=instance.catalog.revisionId, follow=instance.follow, instance_id=instance.id,
                )
                continue
            store.add_instance(
                change, project_id=instance.projectId, label=instance.label,
                baseline_commit=instance.baselineCommit, tracked_ref=instance.trackedRef,
                pinned=instance.pinned, instance_id=instance.id,
            )
            for override in instance.portOverrides:
                store.set_override(change, instance.id, override.portKey, override.state)
        for link in manifest.links:
            store.create_link(
                change, a_instance_id=link.a.instanceId, a_port=_end_baseline(link.a),
                b_instance_id=link.b.instanceId, b_port=_end_baseline(link.b),
                name=link.name, harness=link.harnessLabel, link_id=link.id,
                link_type=link.type, stack_height_mm=link.stackHeightMm,
            )
            store.replace_rows(change, link.id, [{
                "id": r.id, "pinA": r.pinA, "pinB": r.pinB, "signal": r.signal, "source": r.source,
                "netA": r.netA, "netB": r.netB,
            } for r in link.rows], keep_new_ids=True)
        for export in manifest.exports:
            target = export.target
            if hasattr(target, "port"):
                store.create_export(change, name=export.name, description=export.description,
                                    instance_id=target.instanceId, port=target.port.model_dump(),
                                    export_id=export.id)
            else:
                store.create_export(change, name=export.name, description=export.description,
                                    instance_id=target.instanceId, child_export_id=target.exportId,
                                    export_id=export.id)
        for harness in manifest.harnesses:
            store.create_harness(change, name=harness.name, label=harness.label, harness_id=harness.id,
                                 cut_length_mm=harness.cutLengthMm, service_allowance_pct=harness.serviceAllowancePct)
            for end in sorted(harness.ends, key=lambda e: e.ordinal):
                store.add_harness_end(
                    change, harness.id, end_id=end.id, ordinal=end.ordinal, pin_count=end.pinCount,
                    mates_instance_id=end.mates.instanceId if end.mates else None,
                    mates_port=_end_baseline(end.mates) if end.mates else None,
                    pin_map=end.pinMap, boot_mm=end.bootMm,
                    catalog_component_id=end.part.componentId if end.part else None,
                    catalog_revision_id=end.part.revisionId if end.part else None, part_pins=end.partPins,
                    part_summary=({k: getattr(end.part, k) or "" for k in harnesses_module.PART_SUMMARY}
                                  if end.part else None))
            store.replace_wires(change, harness.id, [
                {"id": w.id, "from": {"end": w.source.end, "pin": w.source.pin},
                 "to": {"end": w.target.end, "pin": w.target.pin}, "signal": w.signal, "gaugeAwg": w.gaugeAwg,
                 "colour": w.colour, "label": w.label, "netFrom": w.netFrom, "netTo": w.netTo}
                for w in harness.wires], keep_new_ids=True)
        for record in manifest.mating:
            store.set_mating(change, record.instanceId, record.portKey, {
                "mode": record.mode, "axis": record.frame.axis, "quarterTurns": record.frame.quarterTurns,
                "geometryDigest": record.geometryDigest})
        for pose in manifest.placement.poses:
            store.set_pose(change, pose.instanceId,
                           {**placement_poses.pose_from(pose.translationMm, pose.rotation), "source": pose.source})
        change.audit("system_imported", {"schema": SCHEMA, "sourceVersion": manifest.meta.sourceVersion,
                                         "snapshot": manifest.meta.snapshot.id if manifest.meta.snapshot else None})
    if manifest.layout.positions:
        store.put_layout(row["id"], {k: v.model_dump() for k, v in manifest.layout.positions.items()})
    return row["id"]
