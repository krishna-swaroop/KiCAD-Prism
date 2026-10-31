"""What an account still has to ask before its day ends, and what people usually ask for.

Spare work may only use calls nothing else needs (``quota.free_allowance``), so the scheduled work left until the reset is counted
here: reads due before the reset, searches due, and the notices and substances that share the product budget. Each is turned into
calls the way the provider batches them. The figure is stored on the account's ledger row (``ledger.store_scheduled``) and is
trusted for 15 minutes.

What people usually ask for is ``ledger.expected_people_calls``.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any

from app.services.supply import accounts, budget, details, ledger, quota
from app.services.supply.discoverer import DUE_SEARCH, cutoffs
from app.services.supply.providers import registry
from app.services.supply.providers.base import CAP_PCN, CAP_SEARCH, CAP_SUBSTANCES



def _calls(items: int, per_call: int, calls_per_batch: int = 1) -> int:
    return math.ceil(items / max(per_call, 1)) * calls_per_batch if items > 0 else 0


def connector_rest(conn, connector_id: str, now: datetime, until: datetime) -> int:
    """Calls this connector still needs before ``until`` for the work that is on a schedule."""

    row = conn.execute("SELECT provider, enabled, paused_reason FROM supply_connectors WHERE id = %s", (connector_id,)).fetchone()
    if row is None or not row["enabled"] or row["paused_reason"]:
        return 0
    try:
        spec = registry.get_spec(row["provider"])
    except registry.UnknownProvider:
        return 0
    if not spec.metered:
        return 0
    reads = conn.execute(
        """
        SELECT COUNT(*) AS listings, COUNT(DISTINCT l.part_id) AS parts
        FROM supply_listings l
        JOIN supply_part_tiers pt ON pt.part_id = l.part_id
        JOIN supply_admissions a ON a.part_id = l.part_id AND a.connector_id = l.connector_id AND a.state = 'admitted'
        LEFT JOIN supply_packaging_picks pk ON pk.part_id = l.part_id AND pk.connector_id = l.connector_id AND %s
        LEFT JOIN supply_poll_state ps ON ps.listing_id = l.id
        WHERE l.connector_id = %s AND supply_counted(l.match_state)
          AND (pk.listing_id IS NULL OR pk.listing_id = l.id OR ps.listing_id IS NULL)
          AND (ps.listing_id IS NULL OR ps.next_poll_at <= %s)
        """,
        (budget.picks_limit_reads(spec), connector_id, until),
    ).fetchone()
    if spec.groups_by_part:
        # One call reads all of a part's listings, and where a call takes several parts, many parts.
        calls = _calls(int(reads["parts"]), spec.max_batch, spec.calls_per_offers_batch)
    else:
        calls = _calls(int(reads["listings"]), spec.max_batch, spec.calls_per_offers_batch)
    if CAP_SEARCH in spec.capabilities:
        searches = conn.execute(
            f"""
            SELECT COUNT(*) AS n FROM supply_connectors c
            CROSS JOIN supply_part_tiers pt
            LEFT JOIN supply_admissions a ON a.part_id = pt.part_id AND a.connector_id = c.id
            LEFT JOIN supply_discovery_runs d ON d.part_id = pt.part_id AND d.connector_id = c.id
            WHERE c.id = %(connector)s AND ({DUE_SEARCH})
            """,
            {"connector": connector_id, **cutoffs(until)},
        ).fetchone()
        calls += _calls(int(searches["n"]), spec.search_batch)
    # Notices of a provider with a quota of its own are not charged to the product budget; the rest are.
    for capability, kind in ((CAP_PCN, "notices"), (CAP_SUBSTANCES, "substances")):
        if capability in spec.capabilities and not (kind == "notices" and spec.notice_daily_limit):
            calls += len(details.due(conn, connector_id, kind, until, 200))
    return calls


def scheduled_rest(conn, account: accounts.Account, now: datetime) -> int:
    """Calls the account's connectors still need before the provider's day ends."""

    _start, end = quota.day_bounds(now, account.reset_time, account.reset_tz)
    return sum(connector_rest(conn, connector_id, now, end) for connector_id in account.members)


def summary(conn, account: accounts.Account, state: quota.QuotaState, now: datetime, rest: int, spare_this_hour: int = 0) -> dict[str, Any]:
    """The figures the budget bar shows: what scheduled work needs, what is kept for people, and what is free now."""

    kept = quota.kept_for_people(state, ledger.expected_people_calls(conn, account, now))
    free = quota.free_allowance(
        state, now, scheduled_rest=rest, kept_for_people=kept, spare_this_hour=spare_this_hour,
        reset_time=account.reset_time, tz=account.reset_tz,
    )
    return {"scheduled": rest, "kept_for_people": kept, "free": free}
