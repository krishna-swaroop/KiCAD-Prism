"""The change-notice allowance of a provider that gives notices a quota of its own (DigiKey: 50 a day, apart from its 1,000).

Notice calls are counted in ``call_counts`` as kind ``notices`` and are not charged to the product budget. All of the
day's calls may be spent. The tracked parts are read over the shortest interval the quota allows (every day when it
covers them all, otherwise every few days), so each day takes up to the whole allowance. Notices of parts nobody tracks
are read only in the last hours of the provider's day, from what is left.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from app.services.supply import accounts, ledger, quota

BASE_INTERVAL_DAYS = 1
# Notices of untracked parts wait for the end of the provider's day.
SPARE_HOURS_BEFORE_RESET = 3


@dataclass(frozen=True, slots=True)
class Plan:
    limit: int
    used: int
    parts: int
    interval_days: int
    per_day: int

    def dto(self) -> dict[str, Any]:
        return {"limit": self.limit, "used": self.used, "parts": self.parts, "interval_days": self.interval_days, "per_day": self.per_day}


def tracked_parts(conn, connector_id: str) -> int:
    """Parts whose notices are read at this connector: admitted there, not obsolete."""

    row = conn.execute(
        """
        SELECT COUNT(DISTINCT l.part_id) AS n
        FROM supply_listings l
        JOIN supply_part_tiers pt ON pt.part_id = l.part_id
        JOIN supply_admissions a ON a.part_id = l.part_id AND a.connector_id = l.connector_id AND a.state = 'admitted'
        WHERE l.connector_id = %s AND supply_counted(l.match_state)
          AND NOT EXISTS (SELECT 1 FROM supply_offers o WHERE o.listing_id = l.id AND o.lifecycle = 'obsolete')
        """,
        (connector_id,),
    ).fetchone()
    return int(row["n"])


def used_today(conn, connector_id: str, now: datetime) -> int:
    account = accounts.resolve(conn, connector_id)
    day = quota.provider_day(now, account.reset_time, account.reset_tz)
    row = conn.execute(
        "SELECT COALESCE(SUM(calls), 0) AS n FROM supply_call_counts WHERE connector_id = ANY(%s) AND day = %s AND kind = %s",
        (list(account.members), day, ledger.KIND_NOTICES),
    ).fetchone()
    return int(row["n"])


def interval_days(parts: int, limit: int) -> int:
    """Days between reads of one part: every day when the quota covers all of them, otherwise as many days as it takes."""

    return max(BASE_INTERVAL_DAYS, math.ceil(parts / max(1, limit)))


def plan(conn, connector_id: str, limit: int, now: datetime) -> Plan:
    parts = tracked_parts(conn, connector_id)
    days = interval_days(parts, limit)
    return Plan(limit, used_today(conn, connector_id, now), parts, days, min(limit, parts))


def allowed(conn, connector_id: str, limit: int, now: datetime, *, interactive: bool, spare: bool, news: bool) -> bool:
    """Whether one more notice call may be made now."""

    current = plan(conn, connector_id, limit, now)
    if interactive:
        return current.used < limit
    if current.used >= limit:
        return False
    if spare:
        account = accounts.resolve(conn, connector_id)
        return quota.seconds_to_reset(now, account.reset_time, account.reset_tz) <= SPARE_HOURS_BEFORE_RESET * 3600
    return news or current.used < current.per_day


def spend(store, connector: dict[str, Any], limit: int, now: datetime, *, interactive: bool, spare: bool, news: bool, purpose: str) -> bool:
    """Count one notice call if the allowance lets it through. Nothing is charged to the product budget."""

    with store.connection() as conn:
        if not allowed(conn, connector["id"], limit, now, interactive=interactive, spare=spare, news=news):
            return False
        account = accounts.resolve(conn, connector["id"])
        day = quota.provider_day(now, account.reset_time, account.reset_tz)
        ledger.count_only(conn, connector["id"], day, quota.day_hour(now, account.reset_time, account.reset_tz), ledger.KIND_NOTICES, purpose, 1)
    return True


def every(days: int) -> timedelta:
    return timedelta(days=days)
