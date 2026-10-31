"""What needs a person, and what people decided about it: one table of things to look at, one table of decisions (D3).

``supply_attention`` holds one row per subject (a part or a component), kind and episode: an alert on a part, an ending component, a
work item. A row is ``pending`` until its condition has held long enough, ``open`` while it holds, and ``resolved`` when it clears; one
live row per subject and kind. ``scope`` fingerprints the condition, so a decision made against one condition does not carry over to
another. The assignment columns (owner, title, action, notes, recheck date, QA's disposition) make a row someone's work item.

``supply_attention_decisions`` holds what people decided:

* ``acknowledge`` and ``snooze`` (until a time) quiet one row; a worse severity on it wakes it, and they go when it resolves.
* ``mute`` switches a kind off on a subject; ``dismiss`` puts it aside while its scope stays the same; ``waive`` accepts an
  assessment finding (``assessment.waivers``) while its scope stays the same.
* ``accept`` is the status a part is judged against: an assessment worse than it is an alert until someone acknowledges it.

Standing decisions (all but acknowledge and snooze) are one per subject, kind and decision. Functions on a connection; none commit.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Iterable, Mapping, Sequence

from app.services.supply import clock


PART, COMPONENT = "part", "component"
PENDING, OPEN, RESOLVED = "pending", "open", "resolved"
ACKNOWLEDGED, SNOOZED = "acknowledged", "snoozed"
ACKNOWLEDGE, SNOOZE, DISMISS, MUTE, WAIVE, ACCEPT = "acknowledge", "snooze", "dismiss", "mute", "waive", "accept"
PROPOSED, APPROVED, REJECTED = "proposed", "approved", "rejected"
# Decisions about one row; the rest stand for a subject and kind.
ON_ROW = (ACKNOWLEDGE, SNOOZE)
SEVERITY_RANK = {"fatal": 0, "error": 1, "warning": 2, "info": 3}
# A work item a person opened: a row of its own, any number per subject.
WORK = "work"


def column(subject_kind: str) -> str:
    """The subject's column: rows name a part or a component, each with its own foreign key."""

    if subject_kind == PART:
        return "part_id"
    if subject_kind == COMPONENT:
        return "component_id"
    raise ValueError(subject_kind)


def subject_of(row: Mapping[str, Any]) -> tuple[str, str]:
    return (PART, row["part_id"]) if row["part_id"] is not None else (COMPONENT, row["component_id"])


# --- rows -------------------------------------------------------------------------------------------------------------------


def live(conn, subject_kind: str, subject_ids: Sequence[str], kinds: Sequence[str]) -> dict[tuple[str, str], dict[str, Any]]:
    """The live (not resolved) rows of these subjects and kinds, by (subject id, kind)."""

    col = column(subject_kind)
    rows = conn.execute(
        f"SELECT * FROM supply_attention WHERE {col} = ANY(%s) AND kind = ANY(%s) AND state <> 'resolved' FOR UPDATE",
        (list(subject_ids), list(kinds)),
    ).fetchall()
    return {(row[col], row["kind"]): dict(row) for row in rows}


def begin(conn, subject_kind: str, subject_id: str, kind: str, severity: str, detail: Mapping[str, Any], now: datetime, *,
          at_once: bool, scope: str = "") -> int:
    state = OPEN if at_once else PENDING
    return int(conn.execute(
        f"""
        INSERT INTO supply_attention ({column(subject_kind)}, kind, scope, severity, state, first_seen_at, opened_at, last_event_at, detail)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb) RETURNING id
        """,
        (subject_id, kind, scope, severity, state, now, now if at_once else None, now, json.dumps(dict(detail))),
    ).fetchone()["id"])


def clear(conn, row: Mapping[str, Any], now: datetime) -> None:
    """The condition is gone: a pending row was never shown and goes; an open one is resolved, and what quieted it goes with it."""

    if row["state"] == PENDING:
        conn.execute("DELETE FROM supply_attention WHERE id = %s", (row["id"],))
        return
    conn.execute("UPDATE supply_attention SET state = 'resolved', resolved_at = %s, updated_at = %s WHERE id = %s", (now, now, row["id"]))
    conn.execute("DELETE FROM supply_attention_decisions WHERE attention_id = %s", (row["id"],))


def hold(conn, row: Mapping[str, Any], severity: str, detail: Mapping[str, Any], now: datetime, *, opens: bool) -> None:
    """The condition still holds. A pending row opens when ``opens``; an open one that got worse is open again, unquieted."""

    payload = json.dumps(dict(detail))
    if row["state"] == PENDING:
        conn.execute(
            "UPDATE supply_attention SET seen_count = seen_count + 1, severity = %s, detail = %s::jsonb, "
            "state = CASE WHEN %s THEN 'open' ELSE state END, opened_at = CASE WHEN %s THEN %s ELSE opened_at END, "
            "last_event_at = CASE WHEN %s THEN %s ELSE last_event_at END WHERE id = %s",
            (severity, payload, opens, opens, now, opens, now, row["id"]),
        )
        return
    if SEVERITY_RANK[severity] < SEVERITY_RANK[row["severity"]]:
        conn.execute("UPDATE supply_attention SET severity = %s, detail = %s::jsonb, last_event_at = %s WHERE id = %s",
                     (severity, payload, now, row["id"]))
        conn.execute("DELETE FROM supply_attention_decisions WHERE attention_id = %s", (row["id"],))
    else:
        conn.execute("UPDATE supply_attention SET severity = %s, detail = %s::jsonb WHERE id = %s", (severity, payload, row["id"]))


# --- decisions on a row -----------------------------------------------------------------------------------------------------


def row_decisions(conn, ids: Sequence[int]) -> dict[int, dict[str, dict[str, Any]]]:
    """The acknowledgement and snooze of each row, by row id and decision."""

    found: dict[int, dict[str, dict[str, Any]]] = {}
    if ids:
        for row in conn.execute("SELECT * FROM supply_attention_decisions WHERE attention_id = ANY(%s)", (list(ids),)).fetchall():
            found.setdefault(row["attention_id"], {})[row["decision"]] = dict(row)
    return found


def shown_state(row: Mapping[str, Any], decided: Mapping[str, Mapping[str, Any]], now: datetime) -> str:
    """Open, acknowledged or snoozed (a snooze that ran out is open), or the row's own state when it is pending or resolved."""

    if row["state"] != OPEN:
        return row["state"]
    snooze = decided.get(SNOOZE)
    if snooze is not None and snooze["until"] is not None and snooze["until"] > now:
        return SNOOZED
    if snooze is None and ACKNOWLEDGE in decided:
        return ACKNOWLEDGED
    return OPEN


def decide_row(conn, attention_id: int, decision: str, actor: str, *, until: datetime | None = None) -> None:
    """Acknowledge or snooze one row. A snooze replaces an acknowledgement and the other way round."""

    conn.execute("DELETE FROM supply_attention_decisions WHERE attention_id = %s AND decision = ANY(%s)", (attention_id, list(ON_ROW)))
    row = conn.execute("SELECT part_id, component_id, kind, scope FROM supply_attention WHERE id = %s", (attention_id,)).fetchone()
    conn.execute(
        """
        INSERT INTO supply_attention_decisions (id, attention_id, part_id, component_id, kind, scope, decision, until, made_by, decided_by, decided_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (uuid.uuid4().hex, attention_id, row["part_id"], row["component_id"], row["kind"], row["scope"], decision, until, actor, actor, clock.now()),
    )


QUIET_SQL = """
    NOT EXISTS (SELECT 1 FROM supply_attention_decisions d WHERE d.attention_id = a.id
                AND (d.decision = 'acknowledge' OR (d.decision = 'snooze' AND d.until > %(now)s)))
"""


def open_counts(conn, now: datetime, subject_kind: str | None = None, subject_ids: Sequence[str] | None = None) -> dict[str, int]:
    """Open rows nobody has quieted, per subject id (or in all, under the key ``""``)."""

    if subject_kind is None:
        row = conn.execute(f"SELECT COUNT(*) AS n FROM supply_attention a WHERE a.state = 'open' AND a.kind <> 'work' AND {QUIET_SQL}",
                           {"now": now}).fetchone()
        return {"": int(row["n"])}
    col = column(subject_kind)
    return {row["id"]: int(row["n"]) for row in conn.execute(
        f"SELECT a.{col} AS id, COUNT(*) AS n FROM supply_attention a WHERE a.{col} = ANY(%(ids)s) AND a.state = 'open' "
        f"AND a.kind <> 'work' AND {QUIET_SQL} GROUP BY a.{col}",
        {"now": now, "ids": list(subject_ids or [])},
    ).fetchall()}


def summary(conn, now: datetime) -> list[dict[str, Any]]:
    """What waits for a person, by kind: how many rows are open and unquieted, and the worst severity among them."""

    return [{"kind": row["kind"], "count": int(row["n"]), "severity": row["worst"]} for row in conn.execute(
        f"""
        SELECT a.kind, COUNT(*) AS n,
               (ARRAY['fatal', 'error', 'warning', 'info'])[1 + MIN(CASE a.severity WHEN 'fatal' THEN 0 WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END)] AS worst
        FROM supply_attention a WHERE a.state = 'open' AND a.kind <> 'work' AND {QUIET_SQL}
        GROUP BY a.kind ORDER BY MIN(CASE a.severity WHEN 'fatal' THEN 0 WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END), a.kind
        """,
        {"now": now},
    ).fetchall()]


# --- standing decisions -----------------------------------------------------------------------------------------------------


def standing(conn, subject_kind: str, subject_ids: Iterable[str], decision: str, kinds: Sequence[str] | None = None,
             *, rejected: bool = False) -> dict[str, list[dict[str, Any]]]:
    """The standing decisions of this kind about these subjects, by subject id (rejected ones only on request)."""

    ids = sorted({str(item) for item in subject_ids if item})
    if not ids:
        return {}
    col = column(subject_kind)
    found: dict[str, list[dict[str, Any]]] = {}
    for row in conn.execute(
        f"SELECT * FROM supply_attention_decisions WHERE {col} = ANY(%s) AND attention_id IS NULL AND decision = %s "
        "AND (%s::text[] IS NULL OR kind = ANY(%s)) AND (%s OR state <> 'rejected') ORDER BY made_at, id",
        (ids, decision, kinds, kinds, rejected),
    ).fetchall():
        found.setdefault(row[col], []).append(dict(row))
    return found


def stand(conn, subject_kind: str, subject_id: str, kind: str, decision: str, actor: str, *, scope: str = "", reason: str = "",
          state: str = APPROVED, decision_id: str | None = None) -> str:
    """Record a standing decision, replacing the one there was. Returns its id. Audited by the caller, which knows what it means."""

    col = column(subject_kind)
    conn.execute(
        f"DELETE FROM supply_attention_decisions WHERE {col} = %s AND kind = %s AND decision = %s AND attention_id IS NULL AND state <> 'rejected'",
        (subject_id, kind, decision),
    )
    decision_id = decision_id or uuid.uuid4().hex
    approved = state == APPROVED
    conn.execute(
        f"""
        INSERT INTO supply_attention_decisions (id, {col}, kind, scope, decision, state, reason, made_by, decided_by, decided_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, CASE WHEN %s THEN %s::timestamptz END)
        """,
        (decision_id, subject_id, kind, scope, decision, state, reason, actor, actor if approved else "", approved, clock.now()),
    )
    return decision_id


def withdraw(conn, subject_kind: str, subject_id: str, kind: str, decision: str) -> bool:
    col = column(subject_kind)
    return conn.execute(
        f"DELETE FROM supply_attention_decisions WHERE {col} = %s AND kind = %s AND decision = %s AND attention_id IS NULL AND state <> 'rejected' RETURNING id",
        (subject_id, kind, decision),
    ).fetchone() is not None


# --- proposals ----------------------------------------------------------------------------------------------------------------

# The one rule for putting something aside, by how long it lasts. Acknowledging and snoozing quiet one row for now, for anyone who
# writes supply data. Dismissing, muting and waiving put it aside for good: an approver's stands at once, and anyone else's is a
# proposal an approver accepts or rejects.
SETTLING = (DISMISS, MUTE, WAIVE)


def state_for(decision: str, *, approver: bool) -> str:
    """The state a decision starts in for this person (``supply_access.is_approver``)."""

    return APPROVED if approver or decision not in SETTLING else PROPOSED


def proposal(conn, decision_id: str, decision: str) -> dict[str, Any]:
    """A standing decision of this kind, locked. LookupError when there is none."""

    row = conn.execute(
        "SELECT * FROM supply_attention_decisions WHERE id = %s AND decision = %s AND attention_id IS NULL FOR UPDATE", (decision_id, decision)
    ).fetchone()
    if row is None:
        raise LookupError(decision_id)
    return dict(row)


def settle(conn, row: Mapping[str, Any], actor: str, *, approve: bool) -> None:
    """An approver accepts or rejects a proposal."""

    if row["state"] != PROPOSED:
        raise ValueError("Only a proposal that is waiting can be decided.")
    conn.execute(
        "UPDATE supply_attention_decisions SET state = %s, decided_by = %s, decided_at = %s WHERE id = %s",
        (APPROVED if approve else REJECTED, actor, clock.now(), row["id"]),
    )


def waiting(conn, decision: str, *, limit: int = 200) -> list[dict[str, Any]]:
    """Proposals of this kind, oldest first."""

    return [dict(row) for row in conn.execute(
        "SELECT * FROM supply_attention_decisions WHERE decision = %s AND state = 'proposed' AND attention_id IS NULL ORDER BY made_at, id LIMIT %s",
        (decision, limit),
    ).fetchall()]
