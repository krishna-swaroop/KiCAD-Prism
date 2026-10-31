"""Work items: a record of an engineering decision about a component or a part, that colleagues can work from.

An item says what is proposed (find an alternate, mark not for new designs, retire, buy before the last date...), who owns it, the
evidence for it, the projects it touches (taken when it is made, so the record keeps them), QA's disposition and when to look again.
Anyone who follows supply opens and edits items; QA and administrators accept or reject them; the owner or QA marks one done. Its
history is the audit trail. Nothing here changes the library or the BOM: an item records the decision, the change is made where it
belongs.

An item is an attention row (``attention.py``) of kind ``work``, open until done or rejected, and the assignment columns of that row
are the item: its title, action, owner, notes, projects, recheck date and QA's disposition.
"""

from __future__ import annotations

import json
from datetime import date
from typing import Any, Sequence

from app.services.supply import attention, clock, component_parts, usage
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.errors import Denied, Refused

SUBJECTS = ("component", "part")
ACTIONS = ("investigate", "alternate", "not_for_new_designs", "retire", "replace", "last_time_buy", "other")
STATES = ("open", "accepted", "rejected", "done")
MAX_TITLE = 160
MAX_NOTE = 2000
MAX_NOTES = 50


class WorkItemError(Refused):
    """The request is not valid. The message is safe to show."""

    code = "invalid_work_item"


class NotAllowed(Denied):
    """The caller may not make this change."""

    code = "not_allowed"


def _clean_title(title: str) -> str:
    text = " ".join(str(title or "").split())
    if not text or len(text) > MAX_TITLE:
        raise WorkItemError(f"Give a title of up to {MAX_TITLE} characters.")
    return text


def _clean_note(note: str) -> str:
    text = str(note or "").strip()
    if len(text) > MAX_NOTE:
        raise WorkItemError(f"A note is at most {MAX_NOTE} characters.")
    return text


def _affected(conn, subject_kind: str, subject_id: str) -> list[str]:
    """Every project whose BOM uses the part, or the component's main part and approved alternates, now."""

    parts = [subject_id] if subject_kind == "part" else component_parts.counted_parts(conn, [subject_id]).get(subject_id, [])
    found = usage.projects_of_parts(conn, parts, None) if parts else {}
    return sorted({project for projects in found.values() for project in projects})


def create(
    conn, *, subject_kind: str, subject_id: str, title: str, action: str, actor: str, owner: str = "", note: str = "",
    recheck_on: date | None = None,
) -> dict[str, Any]:
    actor = actor_text(actor)
    if subject_kind not in SUBJECTS or not str(subject_id or "").strip():
        raise WorkItemError("A work item is about a component or a part.")
    if action not in ACTIONS:
        raise WorkItemError("That action is not one Prism knows.")
    note = _clean_note(note)
    now = clock.now()
    evidence = [{"text": note, "by": actor, "at": now.isoformat()}] if note else []
    item_id = str(conn.execute(
        f"""
        INSERT INTO supply_attention ({attention.column(subject_kind)}, kind, severity, state, first_seen_at, opened_at, last_event_at,
                                      title, action, owner, notes, project_ids, recheck_on, created_by)
        VALUES (%s, 'work', 'info', 'open', %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s) RETURNING id
        """,
        (subject_id, now, now, now, _clean_title(title), action, str(owner or "").strip()[:200], json.dumps(evidence),
         _affected(conn, subject_kind, subject_id), recheck_on, actor),
    ).fetchone()["id"])
    write_audit(conn, actor, "work_item.create", item_id, {"title": title, "action": action, "owner": owner}, subject_kind="work_item")
    return get(conn, item_id)


# The item's state from its row: open until done or rejected, with QA's disposition.
STATE_SQL = (
    "CASE WHEN w.state = 'resolved' THEN CASE WHEN w.disposition = 'rejected' THEN 'rejected' ELSE 'done' END "
    "WHEN w.disposition = 'accepted' THEN 'accepted' ELSE 'open' END"
)
_SELECT = f"""
    SELECT w.id::text AS id, CASE WHEN w.part_id IS NOT NULL THEN 'part' ELSE 'component' END AS subject_kind,
           COALESCE(w.part_id, w.component_id) AS subject_id, w.title, w.action, w.owner, {STATE_SQL} AS state, w.notes AS evidence,
           w.project_ids, w.recheck_on, w.created_by, w.first_seen_at AS created_at, w.updated_at
    FROM supply_attention w
"""
# The row for each state an item is moved to: (attention state, disposition), None keeping the disposition.
_MOVE = {"open": ("open", ""), "accepted": ("open", "accepted"), "rejected": ("resolved", "rejected"), "done": ("resolved", None)}


def get(conn, item_id: str) -> dict[str, Any]:
    row = conn.execute(_SELECT + "WHERE w.id = %s AND w.kind = 'work'", (int(item_id),)).fetchone() if str(item_id).isdigit() else None
    if row is None:
        raise LookupError(item_id)
    return dict(row)


def _may_edit(item: dict[str, Any], actor: str, approver: bool) -> bool:
    return approver or actor in (item["created_by"], item["owner"])


def update(
    conn, item_id: str, *, actor: str, approver: bool, title: str | None = None, action: str | None = None, owner: str | None = None,
    recheck_on: date | None | str = "unchanged", note: str = "",
) -> dict[str, Any]:
    """Change what an item says, or add a note to its evidence. Its maker, its owner and QA may.

    ``approver`` is whether the caller's decisions stand alone (``policy`` "supply_approve"): QA or an administrator, as a person.
    """

    actor = actor_text(actor)
    item = get(conn, item_id)
    if not _may_edit(item, actor, approver):
        raise NotAllowed("Only its owner, whoever opened it, or QA may change a work item.")
    fields: dict[str, Any] = {}
    if title is not None:
        fields["title"] = _clean_title(title)
    if action is not None:
        if action not in ACTIONS:
            raise WorkItemError("That action is not one Prism knows.")
        fields["action"] = action
    if owner is not None:
        fields["owner"] = str(owner).strip()[:200]
    if recheck_on != "unchanged":
        fields["recheck_on"] = recheck_on
    note = _clean_note(note)
    if note:
        evidence = list(item["evidence"] or [])
        if len(evidence) >= MAX_NOTES:
            raise WorkItemError(f"A work item keeps at most {MAX_NOTES} notes.")
        fields["evidence"] = json.dumps([*evidence, {"text": note, "by": actor, "at": clock.now().isoformat()}])
    if fields:
        # Column names come from the fixed set above, never from the caller; the evidence is the row's notes.
        assignments = ", ".join("notes = %s::jsonb" if column == "evidence" else f"{column} = %s" for column in fields)
        conn.execute(f"UPDATE supply_attention SET {assignments}, updated_at = %s WHERE id = %s", (*fields.values(), clock.now(), int(item_id)))
        shown = {key: (value if key != "evidence" else note) for key, value in fields.items()}
        write_audit(conn, actor, "work_item.update", item_id, {key: str(value) for key, value in shown.items()}, subject_kind="work_item")
    return get(conn, item_id)


def decide(conn, item_id: str, state: str, *, actor: str, approver: bool, note: str = "") -> dict[str, Any]:
    """Move an item: QA accepts or rejects it, or opens it again; its owner, its maker or QA marks it done."""

    actor = actor_text(actor)
    if state not in STATES:
        raise WorkItemError("That state is not one Prism knows.")
    item = get(conn, item_id)
    if state in ("accepted", "rejected", "open") and not approver:
        raise NotAllowed("QA and administrators accept, reject or reopen a work item.")
    if state == "done" and not _may_edit(item, actor, approver):
        raise NotAllowed("Only its owner, whoever opened it, or QA may mark a work item done.")
    row_state, disposition = _MOVE[state]
    now = clock.now()
    conn.execute(
        """
        UPDATE supply_attention SET state = %s, disposition = CASE WHEN %s::text IS NULL THEN (CASE WHEN disposition = 'rejected' THEN '' ELSE disposition END) ELSE %s END,
            resolved_at = CASE WHEN %s = 'resolved' THEN %s::timestamptz END, updated_at = %s
        WHERE id = %s
        """,
        (row_state, disposition, disposition, row_state, now, now, int(item_id)),
    )
    if note:
        update(conn, item_id, actor=actor, approver=approver, note=note)
    write_audit(conn, actor, f"work_item.{state}", item_id, {"from": item["state"], "note": _clean_note(note)}, subject_kind="work_item")
    return get(conn, item_id)


def listed(
    conn, *, role: str | None, actor: str = "", state: str = "live", subject_kind: str = "", subject_id: str = "", today: date | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    """Work items, soonest recheck first. ``state`` is one of ``STATES``, ``live`` (open or accepted), ``mine`` (live and owned by
    ``actor``) or ``due`` (live with a recheck date today or past). Projects the caller may not see are not named."""

    today = today or clock.now().date()
    where, params = ["w.kind = 'work'"], []
    if state in STATES:
        where.append(f"{STATE_SQL} = %s")
        params.append(state)
    elif state in ("live", "mine", "due"):
        where.append("w.state = 'open'")
        if state == "mine":
            where.append("w.owner = %s")
            params.append(actor_text(actor))
        if state == "due":
            where.append("w.recheck_on <= %s")
            params.append(today)
    else:
        raise WorkItemError("That list is not one Prism knows.")
    if subject_kind:
        if subject_kind not in SUBJECTS:
            raise WorkItemError("A work item is about a component or a part.")
        where.append(f"w.{attention.column(subject_kind)} = %s")
        params.append(subject_id)
    rows = conn.execute(
        _SELECT + f"WHERE {' AND '.join(where)} "
        "ORDER BY w.recheck_on NULLS LAST, w.updated_at DESC LIMIT %s",
        (*params, limit),
    ).fetchall()
    return _shown(conn, [dict(row) for row in rows], role)


def history(conn, item_id: str) -> list[dict[str, Any]]:
    get(conn, item_id)
    return [
        {"at": row["at"].isoformat(), "actor": row["actor"], "action": row["action"].removeprefix("work_item."), "detail": row["detail"]}
        for row in conn.execute(
            "SELECT at, actor, action, detail FROM supply_audit_events WHERE subject_kind = 'work_item' AND subject_id = %s ORDER BY at, id",
            (item_id,),
        ).fetchall()
    ]


def _shown(conn, items: Sequence[dict[str, Any]], role: str | None) -> list[dict[str, Any]]:
    """Items as the API shows them: dates as text, the subject named, and only the projects ``role`` may see."""

    projects = sorted({project for item in items for project in item["project_ids"]})
    names = {row["project_id"]: row["project_name"] for row in conn.execute(
        "SELECT project_id, project_name FROM supply_bom_usage_projects up WHERE project_id = ANY(%s) AND " + usage.VISIBLE,
        (projects, *usage.role_params(role)),
    ).fetchall()} if projects else {}
    parts = [item["subject_id"] for item in items if item["subject_kind"] == "part"]
    part_names = {row["id"]: f"{row['mpn']}, {row['manufacturer']}" for row in conn.execute(
        "SELECT p.id, p.mpn, m.name AS manufacturer FROM supply_parts p JOIN supply_manufacturers m ON m.id = p.manufacturer_id WHERE p.id = ANY(%s)",
        (parts,),
    ).fetchall()} if parts else {}
    components = [item["subject_id"] for item in items if item["subject_kind"] == "component"]
    component_names = {str(row["id"]): row["name"] for row in conn.execute(
        "SELECT c.id, r.name FROM components c JOIN component_revisions r ON r.id = c.current_revision_id WHERE c.id::text = ANY(%s)",
        (components,),
    ).fetchall()} if components and component_parts.library_present(conn) else {}
    return [
        {
            "id": item["id"], "subject_kind": item["subject_kind"], "subject_id": item["subject_id"],
            "subject_name": (part_names if item["subject_kind"] == "part" else component_names).get(item["subject_id"], item["subject_id"]),
            "title": item["title"], "action": item["action"], "owner": item["owner"], "state": item["state"],
            "evidence": item["evidence"] or [],
            "projects": [{"project_id": project, "name": names[project]} for project in item["project_ids"] if project in names],
            "recheck_on": item["recheck_on"].isoformat() if item["recheck_on"] else None,
            "created_by": item["created_by"], "created_at": item["created_at"].isoformat(), "updated_at": item["updated_at"].isoformat(),
        }
        for item in items
    ]


def shown(conn, item: dict[str, Any], role: str | None) -> dict[str, Any]:
    return _shown(conn, [item], role)[0]
