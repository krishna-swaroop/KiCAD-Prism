"""What a provider says about its own limits, and what Prism learns from it.

Some providers send the daily limit and what is left of it with every answer (DigiKey: ``x-ratelimit-limit`` and
``x-ratelimit-remaining``). Prism keeps those readings and does three things with them:

* Shows them on the connector card.
* Works out when the provider's day resets. Remaining calls only ever rise at a reset, so a reading that is higher than the
  one before brackets the reset between the two. A provider that sends nothing can still be bracketed by a refusal that
  lasted for hours: the last refusal and the first answer that worked after it. Two such windows on different days that
  overlap in the time of day give a window for the reset. It is only a suggestion; an administrator applies it.
* Once an administrator has applied a suggestion, takes the provider's count as the truth for the day: calls spent by anything
  else on the same key are added to the ledger. Before that the provider's day is not known, so its count says nothing about
  Prism's.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping, Sequence
from urllib.parse import urlsplit

from app.services.supply import accounts, ledger

KIND_SYNCED = "synced"
MARK_REMAINING, MARK_REFUSED, MARK_OK = "remaining", "refused", "ok"

HISTORY_DAYS = 10
# A refusal counts toward a daily quota only when most of the day's budget was gone, and when it lasted this long.
REFUSAL_SHARE = 0.8
MIN_REFUSAL_RUN = timedelta(minutes=60)
# A bracket wider than this says little about when the reset was.
MAX_WINDOW = timedelta(hours=6)
MAX_SUGGESTED_WIDTH_MINUTES = 180
MIN_WINDOWS = 2

_LIMIT_NAMES = ("x-ratelimit-limit", "ratelimit-limit")
_REMAINING_NAMES = ("x-ratelimit-remaining", "ratelimit-remaining")

# The last readings seen by this process, so an unchanged answer writes nothing.
_last: dict[str, tuple] = {}


def parse(limits: Mapping[str, str]) -> tuple[int, int] | None:
    """(limit, remaining) when the headers give both as whole numbers."""

    def number(names: Sequence[str]) -> int | None:
        for name in names:
            value = str(limits.get(name, "")).strip()
            if value.isdigit():
                return int(value)
        return None

    limit, remaining = number(_LIMIT_NAMES), number(_REMAINING_NAMES)
    if limit is None or remaining is None or limit <= 0:
        return None
    return limit, min(remaining, limit)


def scope_of(url: str) -> str:
    """Which of a provider's APIs answered, by the first part of its path: DigiKey's ``products`` and ``changenotifications``
    count against separate quotas."""

    path = urlsplit(url).path.strip("/")
    return path.split("/", 1)[0].lower()[:40] if path else ""


def note(store, connector_id: str, limits: Mapping[str, str], now: datetime, *, url: str = "") -> None:
    """Keep what an answer's headers said, per API. Called for every answer that carried limit headers."""

    scope = scope_of(url)
    reading = parse(limits)
    key = (tuple(sorted(limits.items())), reading)
    if _last.get((connector_id, scope)) == key:
        return
    _last[(connector_id, scope)] = key
    with store.connection() as conn:
        row = conn.execute(
            "UPDATE supply_connectors SET rate_limits = rate_limits || jsonb_build_object(%s::text, %s::jsonb), rate_limits_at = %s "
            "WHERE id = %s RETURNING reset_from_provider, rate_limits",
            (scope or "api", json.dumps(dict(limits)), now, connector_id),
        ).fetchone()
        if row is None or reading is None:
            return
        conn.execute(
            "INSERT INTO supply_limit_marks (connector_id, at, kind, remaining, quota, scope) VALUES (%s, %s, %s, %s, %s, %s)",
            (connector_id, now, MARK_REMAINING, reading[1], reading[0], scope),
        )
        conn.execute("DELETE FROM supply_limit_marks WHERE connector_id = %s AND at < %s", (connector_id, now - timedelta(days=HISTORY_DAYS)))
        trusted = bool(row["reset_from_provider"])
        # Only the API with the largest quota is the one the daily budget stands for.
        largest = max((parsed[0] for parsed in (parse(item) for item in (row["rate_limits"] or {}).values()) if parsed), default=0)
    if trusted and reading[0] >= largest:
        sync(store, connector_id, reading[0] - reading[1], now)


def sync(store, connector_id: str, provider_spent: int, now: datetime) -> None:
    """Raise today's ledger to what the provider counted, when something else spent calls on the same key."""

    with store.connection() as conn:
        account = accounts.resolve(conn, connector_id)
        state = ledger.get_state(
            conn, account.ledger_id, daily_budget=account.daily_budget, reserve_pct=account.reserve_pct, now=now,
            reset_time=account.reset_time, reset_tz=account.reset_tz,
        )
    if provider_spent > state.spent_today:
        ledger.record_calls(
            store, connector_id, provider_spent - state.spent_today, now=now, kind=KIND_SYNCED, purpose=ledger.PURPOSE_COMMITTED
        )


def note_refused(store, connector_id: str, now: datetime) -> None:
    """A rate-limit refusal, kept when most of the day's budget was already spent (a burst limit says nothing of the day)."""

    with store.connection() as conn:
        account = accounts.resolve(conn, connector_id)
        state = ledger.get_state(
            conn, account.ledger_id, daily_budget=account.daily_budget, reserve_pct=account.reserve_pct, now=now,
            reset_time=account.reset_time, reset_tz=account.reset_tz,
        )
        if account.daily_budget > 0 and state.spent_today >= REFUSAL_SHARE * account.daily_budget:
            conn.execute("INSERT INTO supply_limit_marks (connector_id, at, kind) VALUES (%s, %s, %s)", (connector_id, now, MARK_REFUSED))


def note_ok(conn, connector_id: str, now: datetime) -> None:
    """The first answer that worked after a refusal."""

    last = conn.execute("SELECT kind FROM supply_limit_marks WHERE connector_id = %s ORDER BY at DESC LIMIT 1", (connector_id,)).fetchone()
    if last is not None and last["kind"] == MARK_REFUSED:
        conn.execute("INSERT INTO supply_limit_marks (connector_id, at, kind) VALUES (%s, %s, %s)", (connector_id, now, MARK_OK))


def windows(marks: Sequence[Mapping[str, Any]]) -> list[tuple[datetime, datetime]]:
    """Brackets (earlier, later) in which the provider's day reset, from marks in time order."""

    found: list[tuple[datetime, datetime]] = []
    previous: Mapping[str, Any] | None = None
    run_start: datetime | None = None
    last_refusal: datetime | None = None
    for mark in marks:
        if mark["kind"] == MARK_REMAINING:
            if previous is not None and mark["remaining"] > previous["remaining"]:
                found.append((previous["at"], mark["at"]))
            previous = mark
        elif mark["kind"] == MARK_REFUSED:
            run_start = run_start or mark["at"]
            last_refusal = mark["at"]
        elif mark["kind"] == MARK_OK and last_refusal is not None and run_start is not None:
            if mark["at"] - run_start >= MIN_REFUSAL_RUN:
                found.append((last_refusal, mark["at"]))
            run_start = last_refusal = None
    return [(a, b) for a, b in found if b - a <= MAX_WINDOW]


def _minutes(moment: datetime) -> float:
    moment = moment.astimezone(timezone.utc)
    return moment.hour * 60 + moment.minute + moment.second / 60


def suggest(marks: Sequence[Mapping[str, Any]]) -> dict[str, Any] | None:
    """When the provider's day seems to reset, in UTC, once brackets from different days agree. None while they do not."""

    brackets = windows(marks)
    if len({b.date() for _, b in brackets}) < MIN_WINDOWS:
        return None
    spans = [(_minutes(start), _minutes(start) + (end - start).total_seconds() / 60) for start, end in brackets]
    anchor = (spans[0][0] + spans[0][1]) / 2
    low, high = -1e9, 1e9
    for a, b in spans:
        shift = round((anchor - (a + b) / 2) / 1440) * 1440
        low, high = max(low, a + shift), min(high, b + shift)
    if low > high or high - low > MAX_SUGGESTED_WIDTH_MINUTES:
        return None

    def clock(minutes: float) -> str:
        whole = int(round(minutes)) % 1440
        return f"{whole // 60:02d}:{whole % 60:02d}"

    return {"from": clock(low), "to": clock(high), "suggested": clock(high), "tz": "UTC", "windows": len(brackets)}


def suggestions(conn, now: datetime) -> dict[str, dict[str, Any]]:
    """Per connector, where the marks agree on a reset time. Readings are compared within one API only, the one with the
    largest quota, together with the refusals."""

    rows = conn.execute(
        "SELECT connector_id, at, kind, remaining, quota, scope FROM supply_limit_marks WHERE at >= %s ORDER BY connector_id, at",
        (now - timedelta(days=HISTORY_DAYS),),
    ).fetchall()
    by_connector: dict[str, list[Mapping[str, Any]]] = {}
    for row in rows:
        by_connector.setdefault(row["connector_id"], []).append(row)
    found = {}
    for connector_id, marks in by_connector.items():
        quotas: dict[str, int] = {}
        for mark in marks:
            if mark["kind"] == MARK_REMAINING:
                quotas[mark["scope"]] = max(quotas.get(mark["scope"], 0), int(mark["quota"] or 0))
        main = max(quotas, key=quotas.__getitem__) if quotas else ""
        guess = suggest([mark for mark in marks if mark["scope"] == main or mark["kind"] != MARK_REMAINING])
        if guess:
            found[connector_id] = guess
    return found
