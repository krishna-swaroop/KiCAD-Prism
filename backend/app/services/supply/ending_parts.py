"""Library components whose part is ending, and what a person decided about each.

Supply knows a part is ending (not recommended for new designs, last time buy, obsolete, dropped by every distributor, or an
an outlook of ending). The library decides what that means for a component. This module only proposes: it lists the
components, the reason and its source, the last-time-buy date, stock and the projects that use the part. Nothing here changes
the catalog.

The components are those the part counts for in ``component_parts`` (main part or approved alternate); a schema without the
catalog falls back to a catalog search by part number.

Three decisions, all for QA and administrators, kept outside the revision (supply data never enters the revision hash):

* ``not_for_new_designs``: the component stays released and keeps resolving where it is placed; it is marked, not hidden.
* ``retired``: recorded after the component was archived through the catalog's own workflow (which takes it out of the export).
  Retiring is allowed while tracked projects still use the part: the dialog shows them first.
* dismissed (a standing ``dismiss`` decision, ``attention.py``): nothing to do for now. It holds while the reasons stay the
  same; a new reason brings the component back. Anyone who writes supply data may propose it; an approver's stands at once.
"""

from __future__ import annotations

from typing import Any, Mapping, Sequence

from app.services.supply import attention, catalog_read, clock, component_parts, facts, outlook, parts_view, usage
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.identity import alias_key, match_key
from app.services.supply.vocabulary import ENDING_LIFECYCLES, Lifecycle

LEVELS = ("not_for_new_designs", "retired")
LEVEL_LABEL = {"not_for_new_designs": "Not for new designs", "retired": "Retired"}
MAX_PARTS = 80
MAX_REASON = 300
_ENDING = {
    Lifecycle.NRND.value: "Not recommended for new designs",
    Lifecycle.LAST_TIME_BUY.value: "Last time buy",
    Lifecycle.OBSOLETE.value: "Obsolete",
}
_OUTLOOK = {outlook.ENDED: "Outlook: ended", outlook.ENDING: "Outlook: ending"}


def reasons_of(item: Mapping[str, Any], band: str | None) -> list[dict[str, str]]:
    """Why a part is ending, each with its source: the lifecycle distributors state, every distributor dropping it, the outlook."""

    found = []
    if item["lifecycle"] in ENDING_LIFECYCLES:
        found.append({"kind": item["lifecycle"], "text": _ENDING[item["lifecycle"]], "source": "Distributors"})
    if item["dropped"]:
        found.append({"kind": "dropped", "text": "Every distributor dropped it", "source": "Distributors"})
    if band in _OUTLOOK:
        found.append({"kind": "outlook", "text": _OUTLOOK[band], "source": "Prism's outlook"})
    return found


def restrictions_of(conn, component_ids: Sequence[str]) -> dict[str, dict[str, Any]]:
    ids = list({item for item in component_ids if item})
    if not ids:
        return {}
    return {
        row["component_id"]: {
            "level": row["level"], "reason": row["reason"], "replacement_component_id": row["replacement_component_id"] or None,
            "set_by": row["set_by"], "set_at": row["set_at"].isoformat(),
        }
        for row in conn.execute(
            "SELECT component_id, level, reason, replacement_component_id, set_by, set_at FROM supply_component_restrictions WHERE component_id = ANY(%s)", (ids,)
        ).fetchall()
    }


def set_restriction(conn, component_id: str, level: str, reason: str, replacement_component_id: str, actor: str) -> dict[str, Any]:
    """Mark a component (or record that it was retired). A later mark replaces the earlier one."""

    actor = actor_text(actor)
    if level not in LEVELS:
        raise ValueError(f"The level must be one of: {', '.join(LEVELS)}.")
    reason = " ".join(reason.split())[:MAX_REASON]
    if replacement_component_id == component_id:
        raise ValueError("A component cannot replace itself.")
    conn.execute(
        """
        INSERT INTO supply_component_restrictions (component_id, level, reason, replacement_component_id, set_by, set_at) VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (component_id) DO UPDATE SET level = EXCLUDED.level, reason = EXCLUDED.reason,
            replacement_component_id = EXCLUDED.replacement_component_id, set_by = EXCLUDED.set_by, set_at = EXCLUDED.set_at
        """,
        (component_id, level, reason, replacement_component_id, actor, clock.now()),
    )
    write_audit(conn, actor, "component.restriction", component_id, {"level": level, "reason": reason, "replacement": replacement_component_id}, subject_kind="component")
    return restrictions_of(conn, [component_id])[component_id]


def status_marks(component_ids: Sequence[str]) -> dict[str, str]:
    """The Status text of the KiCad database for components marked not for new designs. Registered with the catalog export at start-up."""

    from app.services.supply.store import supply_store

    with supply_store.connection() as conn:
        found = restrictions_of(conn, list(component_ids))
    return {component_id: LEVEL_LABEL[mark["level"]] for component_id, mark in found.items() if mark["level"] == "not_for_new_designs"}


def clear_restriction(conn, component_id: str, actor: str) -> None:
    actor = actor_text(actor)
    removed = conn.execute("DELETE FROM supply_component_restrictions WHERE component_id = %s RETURNING level", (component_id,)).fetchone()
    if removed:
        write_audit(conn, actor, "component.restriction.clear", component_id, {"was": removed["level"]}, subject_kind="component")


def _components_of(item: Mapping[str, Any]) -> list[dict[str, Any]]:
    """The catalog components that are this part: those with its number whose maker is its maker."""

    wanted = (alias_key(item["manufacturer"]), match_key(item["mpn"]))
    found = []
    for candidate in catalog_read.search(item["mpn"], 8):
        if catalog_read.component_ids_by_part(iter([candidate])).get(wanted) is not None:
            found.append(candidate)
    return found


def _ending(conn, states: Sequence[Mapping[str, Any]]) -> list[tuple[str, list[dict[str, str]]]]:
    """The tracked parts that are ending, with why, from their kept states (``parts_view.tracked_states``) and kept outlooks."""

    bands = {row["part_id"]: row["band"] for row in conn.execute(
        "SELECT part_id, data->>'outlook_band' AS band FROM supply_part_insights WHERE data->>'outlook_band' = ANY(%s)", (list(_OUTLOOK),),
    ).fetchall()}
    found = [(state["id"], reasons_of(state, bands.get(state["id"]))) for state in states]
    return [(part_id, reasons) for part_id, reasons in found if reasons]


def undecided_count(conn, states: Sequence[Mapping[str, Any]] | None = None) -> int:
    """How many components whose part is ending nobody has decided about. ``states`` are the tracked parts' kept states when the
    caller has them already (the Dashboard does)."""

    try:
        if not component_parts.library_present(conn):
            return sum(1 for row in queue(conn)["items"] if row["restriction"] is None and not row["dismissed"])
        ending = _ending(conn, parts_view.tracked_states(conn) if states is None else states)
        holders = component_parts.components_holding(conn, [part_id for part_id, _ in ending])
        rows = [
            (str(component["id"]), reasons_key(reasons))
            for part_id, reasons in ending for component in holders.get(part_id, []) if component.get("workflow_stage") != "archived"
        ]
        marks = restrictions_of(conn, [component_id for component_id, _ in rows])
        dismissed = dismissals_of(conn, [component_id for component_id, _ in rows])
    except Exception:  # noqa: BLE001 - a tile on the Dashboard must not depend on the catalog answering
        return 0
    return sum(1 for component_id, key in rows if component_id not in marks and dismissed.get(component_id) != key)


def queue(conn, role: str | None = None, limit: int = MAX_PARTS) -> dict[str, Any]:
    """Components whose part is ending, worst first, without the ones already retired."""

    states = parts_view.tracked_states(conn)
    why = dict(_ending(conn, states))
    items = {item["id"]: item for item in parts_view.summaries_for(conn, list(why))}
    ending = sorted(((items[part_id], reasons) for part_id, reasons in why.items()), key=lambda pair: (-len(pair[1]), pair[0]["mpn"].lower()))
    holders = component_parts.components_holding(conn, [item["id"] for item, _ in ending[:limit]])
    library = component_parts.library_present(conn)
    rows: list[dict[str, Any]] = []
    for item, reasons in ending[:limit]:
        last_buy = [
            {"source": source["source"], "value": source["value"]}
            for fact in facts.for_part(conn, item["id"]) if fact["name"] == "last_buy_date" for source in fact["sources"]
        ]
        used = [{"project_id": use["project_id"], "name": use["project_name"], "quantity": use["quantity"]} for use in usage.used_in(conn, item["id"], role)]
        for component in (holders.get(item["id"], []) if library else _components_of(item)):
            stage = str(component.get("workflow_stage") or component.get("stage") or "")
            if stage == "archived":
                continue
            rows.append({
                "component": {"id": str(component["id"]), "name": str(component.get("name") or ""), "mpn": str(component.get("mpn") or ""),
                              "manufacturer": str(component.get("manufacturer") or ""), "stage": stage},
                "part_id": item["id"], "reasons": reasons, "last_buy": last_buy, "stock": item["stock"], "status": item["status"],
                "problem": item["problem"], "lifecycle": item["lifecycle"], "fetched_at": item["fetched_at"],
                "projects": used, "restriction": None,
                # Whether the ending part is the component's main part or one of its approved alternates.
                "role": str(component.get("role") or "main"),
            })
    # How many of each component's other approved parts are not ending: retiring is only offered when none is left.
    counted = component_parts.counted_parts(conn, [row["component"]["id"] for row in rows]) if library else {}
    for row in rows:
        row["healthy"] = sum(1 for other in counted.get(row["component"]["id"], []) if other != row["part_id"] and other not in why)
    marks = restrictions_of(conn, [row["component"]["id"] for row in rows])
    dismissed = dismissals_of(conn, [row["component"]["id"] for row in rows])
    asked = {
        component_id: entries[-1]["scope"]
        for component_id, entries in attention.standing(conn, attention.COMPONENT, [row["component"]["id"] for row in rows], attention.DISMISS, [ENDING]).items()
        if entries[-1]["state"] == attention.PROPOSED
    }
    kept = []
    for row in rows:
        row["restriction"] = marks.get(row["component"]["id"])
        row["dismissed"] = dismissed.get(row["component"]["id"]) == reasons_key(row["reasons"])
        # Someone asked QA to dismiss it for these reasons.
        row["dismissal_waiting"] = asked.get(row["component"]["id"]) == reasons_key(row["reasons"])
        if row["restriction"] and row["restriction"]["level"] == "retired":
            continue
        kept.append(row)
    return {"items": kept, "tracked": len(states), "more": max(0, len(ending) - limit)}


def reasons_key(reasons: Sequence[Mapping[str, Any]]) -> str:
    """The reasons a dismissal was made for, as one comparable text."""

    return ",".join(sorted({str(reason["kind"]) for reason in reasons}))


# The attention kind an ending component's dismissal is about.
ENDING = "ending"


def dismissals_of(conn, component_ids: Sequence[str]) -> dict[str, str]:
    """The reasons each component's approved dismissal was made for."""

    return {
        component_id: rows[-1]["scope"]
        for component_id, rows in attention.standing(conn, attention.COMPONENT, component_ids, attention.DISMISS, [ENDING]).items()
        if rows[-1]["state"] == attention.APPROVED
    }


def dismiss(conn, component_id: str, reason_kinds: Sequence[str], actor: str, *, approver: bool) -> dict[str, str]:
    """Nothing to do about this component for these reasons; a new reason brings it back. An approver's dismissal stands, anyone
    else's waits for one (``attention.state_for``)."""

    actor = actor_text(actor)
    key = reasons_key([{"kind": kind} for kind in reason_kinds])
    if not key:
        raise ValueError("Say which reasons are dismissed.")
    state = attention.state_for(attention.DISMISS, approver=approver)
    decision_id = attention.stand(conn, attention.COMPONENT, component_id, ENDING, attention.DISMISS, actor, scope=key, state=state)
    write_audit(conn, actor, "component.ending.dismiss", component_id, {"reasons": key, "state": state}, subject_kind="component")
    return {"id": decision_id, "state": state}


def decide_dismissal(conn, decision_id: str, actor: str, *, approve: bool) -> None:
    actor = actor_text(actor)
    row = attention.proposal(conn, decision_id, attention.DISMISS)
    attention.settle(conn, row, actor, approve=approve)
    write_audit(conn, actor, "component.ending.dismiss_" + ("approve" if approve else "reject"), row["component_id"], {"reasons": row["scope"]},
                subject_kind="component")
