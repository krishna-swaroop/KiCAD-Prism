"""Alerts: when a watched part crosses a line, say so once, and stop saying it when it clears.

Alerts are the part rows of ``supply_attention`` (``attention.py``), in-app only; nothing is sent anywhere. One alert exists per
part and kind.
A condition has to hold on two evaluations at least ``HOLD`` apart before it opens
(so one odd reading does not raise anything), except a lost part, which is already
a settled fact. A condition that clears resolves its alert by itself. A person can
acknowledge an alert (it stays listed, quieter) or snooze it; a worse severity wakes
either of them up. Muting a kind on a part and the status a part is judged against are standing decisions.

The lines are the tracked part's assessment findings (``ALERT_OF_CHECK``), so an alert says
what the status says, at the severity the workspace set for the check, and a held waiver
quiets it. Evaluation happens when a part has just been read, when its watch changes, and
when it stops being watched. Functions work on a connection and do not commit.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Iterable, Mapping

from app.services.supply import alert_rules, attention
from app.services.supply.assessment import settings as checks_ids
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.vocabulary import Status
from app.services.supply.errors import Clash, Missing

HOLD = timedelta(minutes=30)
MAX_SNOOZE_HOURS = 24 * 30

# Kinds, and the severity that goes with them. Lifecycle severity depends on the value.
OUT_OF_STOCK = "out_of_stock"
BELOW_THRESHOLD = "below_threshold"
LIFECYCLE = "lifecycle"
PART_LOST = "part_lost"
RUPTURE_SOON = "rupture_soon"
PRICE_UP = "price_up"
PCN = "pcn"
TARGET_PRICE_MISSED = "target_price_missed"
ASSESSMENT_WORSE = "assessment_worse"
LIKELY_OUT = "likely_out"
KINDS = (
    OUT_OF_STOCK, BELOW_THRESHOLD, LIFECYCLE, PART_LOST, RUPTURE_SOON, PRICE_UP, PCN,
    TARGET_PRICE_MISSED, ASSESSMENT_WORSE, LIKELY_OUT,
)

# Assessment statuses from best to worst; "unknown" is not a state to compare.
_STATUS_ORDER = ("ok", "warning", "error", "fatal")


# Open on the first look: these are facts that do not flicker, unlike a stock reading.
_IMMEDIATE = frozenset({PART_LOST, PCN})
_SEVERITY_RANK = {Status.FATAL.value: 0, Status.ERROR.value: 1, Status.WARNING.value: 2}

PENDING, OPEN, RESOLVED = attention.PENDING, attention.OPEN, attention.RESOLVED
ACKNOWLEDGED, SNOOZED = attention.ACKNOWLEDGED, attention.SNOOZED
# The standing decision that holds the status a part is judged against.
STATUS = "status"


class AlertNotFound(Missing):
    """No alert with this id."""


class AlertError(Clash):
    """The action does not apply to this alert. The message is safe to show."""

    code = "alert_state"


@dataclass(frozen=True, slots=True)
class Condition:
    severity: str
    detail: Mapping[str, Any]


# The alert each check's finding raises. A lifecycle alert says the worst of the lifecycle findings.
ALERT_OF_CHECK: Mapping[str, str] = {
    checks_ids.PART_NOT_FOUND: PART_LOST,
    checks_ids.NO_DISTRIBUTOR_STOCK: OUT_OF_STOCK,
    checks_ids.BELOW_THRESHOLD: BELOW_THRESHOLD,
    checks_ids.RUNS_OUT_SOON: RUPTURE_SOON,
    checks_ids.LIKELY_OUT: LIKELY_OUT,
    checks_ids.PRICE_UP: PRICE_UP,
    checks_ids.CHANGE_NOTICE: PCN,
    checks_ids.TARGET_PRICE_MISSED: TARGET_PRICE_MISSED,
    checks_ids.OBSOLETE: LIFECYCLE,
    checks_ids.LAST_TIME_BUY: LIFECYCLE,
    checks_ids.NRND: LIFECYCLE,
    checks_ids.DISTRIBUTOR_DISCONTINUED: LIFECYCLE,
}


def conditions_from(
    findings: Iterable[Mapping[str, Any]], assessed: str | None = None, mark: str | None = None, muted: Iterable[str] = (),
) -> dict[str, Condition]:
    """The lines a tracked part has crossed: its assessment's findings that raise an alert (``ALERT_OF_CHECK``), unwaived and above
    a note, and a status worse than the one it is judged against (``mark``), when no other alert already says as much."""

    found: dict[str, Condition] = {}
    for finding in findings:
        kind = ALERT_OF_CHECK.get(finding["check"])
        if kind is None or finding["severity"] not in _SEVERITY_RANK or (finding.get("waiver") or {}).get("holds"):
            continue
        before = found.get(kind)
        if before is None or _SEVERITY_RANK[finding["severity"]] < _SEVERITY_RANK[before.severity]:
            found[kind] = Condition(finding["severity"], dict(finding.get("detail") or {}))
    if assessed in _STATUS_ORDER and mark in _STATUS_ORDER and _STATUS_ORDER.index(assessed) > _STATUS_ORDER.index(mark):
        worse = Condition(Status.ERROR.value if assessed in ("error", "fatal") else Status.WARNING.value, {"was": mark, "now": assessed, "to": assessed})
        if not any(_SEVERITY_RANK[other.severity] <= _SEVERITY_RANK[worse.severity] for other in found.values()):
            found[ASSESSMENT_WORSE] = worse
    return {kind: condition for kind, condition in found.items() if kind not in set(muted)}


def evaluate_parts(conn, part_ids: Iterable[str], now: datetime) -> None:
    """Bring the alerts of these parts in line with how they stand now: the tracked ones' assessments, the others none."""

    ids = sorted(set(part_ids))
    if not ids:
        return
    rules = alert_rules.for_parts(conn, ids)
    result, marks = _assessment_states(conn, ids, now)
    current = {
        part_id: conditions_from(entry["findings"], entry["status"], marks.get(part_id), rules.get(part_id, alert_rules.NONE).muted)
        for part_id, entry in result.items()
    }
    existing = attention.live(conn, attention.PART, ids, KINDS)
    for part_id in ids:
        found = current.get(part_id, {})
        for kind in KINDS:
            row = existing.get((part_id, kind))
            condition = found.get(kind)
            if condition is None:
                if row is not None:
                    attention.clear(conn, row, now)
            elif row is None:
                attention.begin(conn, attention.PART, part_id, kind, condition.severity, condition.detail, now, at_once=kind in _IMMEDIATE)
            else:
                attention.hold(conn, row, condition.severity, condition.detail, now,
                               opens=row["state"] == PENDING and row["seen_count"] + 1 >= 2 and now - row["first_seen_at"] >= HOLD)


def _assessment_states(conn, ids: list[str], now: datetime) -> tuple[dict[str, dict[str, Any]], dict[str, str]]:
    """Each tracked part's assessment, and the status it is judged against. A part is marked the first time it is assessed, and the
    mark follows it down when it improves; a worsening is an alert until someone acknowledges it."""

    from app.services.supply.assessment import service as assessment

    tracked = [row["part_id"] for row in conn.execute("SELECT part_id FROM supply_part_tiers WHERE part_id = ANY(%s)", (ids,)).fetchall()]
    if not tracked:
        return {}, {}
    result = assessment.assess_parts(conn, tracked, now=now)
    states = {part_id: entry["status"] for part_id, entry in result.items() if entry["status"] in _STATUS_ORDER}
    marks = {part_id: rows[-1]["scope"] for part_id, rows in attention.standing(conn, attention.PART, tracked, attention.ACCEPT, [STATUS]).items()}
    for part_id, status in states.items():
        mark = marks.get(part_id)
        if mark is None or _STATUS_ORDER.index(status) < _STATUS_ORDER.index(mark):
            attention.stand(conn, attention.PART, part_id, STATUS, attention.ACCEPT, "system", scope=status)
            marks[part_id] = status
    return result, marks


# --- reading -------------------------------------------------------------------


_SELECT = """
    SELECT a.*, p.mpn, m.name AS manufacturer
    FROM supply_attention a JOIN supply_parts p ON p.id = a.part_id JOIN supply_manufacturers m ON m.id = p.manufacturer_id
"""


def _dtos(conn, rows, now: datetime) -> list[dict[str, Any]]:
    decided = attention.row_decisions(conn, [row["id"] for row in rows])
    return [_dto(row, decided.get(row["id"], {}), now) for row in rows]


def list_alerts(conn, now: datetime, *, include_resolved: bool = False, limit: int = 200) -> list[dict[str, Any]]:
    """Alerts people should see: worst first, then newest. Resolved ones only on request (recent first)."""

    states = [OPEN] + ([RESOLVED] if include_resolved else [])
    rows = conn.execute(
        _SELECT + "WHERE a.part_id IS NOT NULL AND a.kind = ANY(%s) AND a.state = ANY(%s) ORDER BY a.last_event_at DESC, a.id DESC LIMIT %s",
        (list(KINDS), states, limit),
    ).fetchall()
    items = _dtos(conn, rows, now)
    items.sort(key=lambda item: (item["state"] == RESOLVED, _SEVERITY_RANK.get(item["severity"], 3)))
    return items


def recent_changes(conn, now: datetime, *, days: int = 14, role: str | None = None) -> list[dict[str, Any]]:
    """What happened lately, newest first: alerts that opened, alerts that cleared, listings that disappeared, and what a
    tracked project's new revision added to or took off its BOM (only for a ``role`` that may see the project)."""

    since = now - timedelta(days=days)
    changes: list[dict[str, Any]] = []
    rows = conn.execute(
        _SELECT + "WHERE a.part_id IS NOT NULL AND a.kind = ANY(%s) AND (a.opened_at >= %s OR a.resolved_at >= %s)", (list(KINDS), since, since),
    ).fetchall()
    for row, alert in zip(rows, _dtos(conn, rows, now)):
        if row["opened_at"] and row["opened_at"] >= since:
            changes.append({"at": alert["opened_at"], "type": "alert_opened", "part_id": row["part_id"], "mpn": row["mpn"],
                            "manufacturer": row["manufacturer"], "alert": alert, "sku": ""})
        if row["resolved_at"] and row["resolved_at"] >= since:
            changes.append({"at": alert["resolved_at"], "type": "alert_cleared", "part_id": row["part_id"], "mpn": row["mpn"],
                            "manufacturer": row["manufacturer"], "alert": alert, "sku": ""})
    for row in conn.execute(
        """
        SELECT e.at, e.kind, e.part_id, e.payload, p.mpn, m.name AS manufacturer
        FROM supply_events e JOIN supply_parts p ON p.id = e.part_id JOIN supply_manufacturers m ON m.id = p.manufacturer_id
        WHERE e.kind IN ('listing_gone', 'lifecycle_changed', 'normally_stocking_lost', 'moq_jump', 'family_member_new', 'param_changed') AND e.at >= %s
        """,
        (since,),
    ).fetchall():
        changes.append({"at": row["at"].isoformat(), "type": row["kind"], "part_id": row["part_id"], "mpn": row["mpn"],
                        "manufacturer": row["manufacturer"], "alert": None, "sku": str((row["payload"] or {}).get("sku", "")),
                        "detail": row["payload"] or {}})
    for row in conn.execute("SELECT at, kind, payload FROM supply_events WHERE kind = 'project_bom_changed' AND at >= %s", (since,)).fetchall():
        payload = row["payload"] or {}
        if role is not None and role not in (payload.get("visible_roles") or []):
            continue
        changes.append({"at": row["at"].isoformat(), "type": row["kind"], "part_id": None, "mpn": "", "manufacturer": "", "alert": None,
                        "sku": "", "detail": {key: value for key, value in payload.items() if key != "visible_roles"}})
    changes.sort(key=lambda item: item["at"], reverse=True)
    return changes


def count_attention(conn, now: datetime) -> int:
    """Alerts that are open (not acknowledged, snoozed or resolved)."""

    return attention.open_counts(conn, now)[""]


def _dto(row: Mapping[str, Any], decided: Mapping[str, Mapping[str, Any]], now: datetime) -> dict[str, Any]:
    def iso(value: datetime | None) -> str | None:
        return value.isoformat() if value else None

    return {
        "id": row["id"],
        "part_id": row["part_id"],
        "mpn": row["mpn"],
        "manufacturer": row["manufacturer"],
        "kind": row["kind"],
        "severity": row["severity"],
        "state": attention.shown_state(row, decided, now),
        "detail": row["detail"],
        "opened_at": iso(row["opened_at"]),
        "last_event_at": iso(row["last_event_at"]),
        "acknowledged_by": next((item["made_by"] for item in decided.values()), ""),
        "snoozed_until": iso((decided.get(attention.SNOOZE) or {}).get("until")),
        "resolved_at": iso(row["resolved_at"]),
    }


# --- actions -------------------------------------------------------------------


def _fetch(conn, alert_id: int):
    row = conn.execute("SELECT * FROM supply_attention WHERE id = %s AND part_id IS NOT NULL AND kind = ANY(%s) FOR UPDATE",
                       (alert_id, list(KINDS))).fetchone()
    if row is None or row["state"] == PENDING:
        raise AlertNotFound(alert_id)
    if row["state"] == RESOLVED:
        raise AlertError("This alert has already cleared.")
    return row


def acknowledge(conn, alert_id: int, actor: str, now: datetime) -> None:
    actor = actor_text(actor)
    row = _fetch(conn, alert_id)
    if attention.shown_state(row, attention.row_decisions(conn, [alert_id]).get(alert_id, {}), now) != OPEN:
        raise AlertError("Only an open alert can be acknowledged.")
    attention.decide_row(conn, alert_id, attention.ACKNOWLEDGE, actor)
    if row["kind"] == ASSESSMENT_WORSE and (row["detail"] or {}).get("to") in _STATUS_ORDER:
        # Seen and accepted: the part is now judged against where it stands.
        attention.stand(conn, attention.PART, row["part_id"], STATUS, attention.ACCEPT, actor, scope=row["detail"]["to"])
    write_audit(conn, actor, "alert.acknowledge", str(alert_id), {"kind": row["kind"]}, subject_kind="alert")


def snooze(conn, alert_id: int, hours: int, actor: str, now: datetime) -> None:
    actor = actor_text(actor)
    if isinstance(hours, bool) or not isinstance(hours, int) or not 1 <= hours <= MAX_SNOOZE_HOURS:
        raise AlertError(f"Snooze for 1 to {MAX_SNOOZE_HOURS} hours.")
    row = _fetch(conn, alert_id)
    attention.decide_row(conn, alert_id, attention.SNOOZE, actor, until=now + timedelta(hours=hours))
    write_audit(conn, actor, "alert.snooze", str(alert_id), {"kind": row["kind"], "hours": hours}, subject_kind="alert")
