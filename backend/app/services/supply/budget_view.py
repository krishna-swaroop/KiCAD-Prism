"""Where each connector's call budget goes: today, the last two weeks, and what tracking costs.

Everything here is read, nothing is changed. Per metered connector:

* the shares of its account's day: committed (what tracking may use) and the pool (people's reads, first searches and
  one-off checks), with what each has spent, and the time to the provider's reset
* what scheduled work still needs today, what is kept for people, and what is free to spend now (``demand.py``)
* what was spent, by kind and by purpose, hour by hour today and by day for 14 days (``call_counts``)
* what tracking has admitted and what waits for room (``admission.status``)
* the projects and parts that cost most, from the cost model (``budget.py``), a part two projects share split between them
* how many tracked parts it gives a price for, and how many it has not searched for yet
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

from app.services.supply import accounts, admission, budget, demand, ledger, library_match, notice_budget, quota
from app.services.supply.providers import registry
from app.services.supply.providers.base import CAP_SEARCH

DAYS = 14
TOP = 10


def _hourly(conn, connector_id: str, day, *, notices: bool = True) -> list[dict[str, Any]]:
    """Today's calls by hour. ``notices`` False leaves out change-notice calls, for a provider whose notices have a quota of their own."""

    rows = conn.execute(
        "SELECT hour, kind, purpose, calls FROM supply_call_counts WHERE connector_id = %s AND day = %s AND (%s OR kind <> 'notices') ORDER BY hour, kind, purpose",
        (connector_id, day, notices),
    ).fetchall()
    return [{"hour": int(r["hour"]), "kind": r["kind"], "purpose": r["purpose"], "calls": int(r["calls"])} for r in rows]


def _daily(conn, connector_id: str, day, *, notices: bool = True) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT day, purpose, SUM(calls) AS calls FROM supply_call_counts WHERE connector_id = %s AND day > %s AND day <= %s AND kind <> 'refused' "
        "AND (%s OR kind <> 'notices') GROUP BY day, purpose ORDER BY day, purpose",
        (connector_id, day - timedelta(days=DAYS), day, notices),
    ).fetchall()
    return [{"day": r["day"].isoformat(), "purpose": r["purpose"], "calls": int(r["calls"])} for r in rows]


def _refused(conn, connector_id: str, day) -> int:
    row = conn.execute(
        "SELECT COALESCE(SUM(calls), 0) AS n FROM supply_call_counts WHERE connector_id = %s AND day = %s AND kind = 'refused'", (connector_id, day)
    ).fetchone()
    return int(row["n"])


def owners(conn, connector_id: str, spec, data: dict[str, Any], visible: set[str] | None = None) -> dict[str, list[dict[str, Any]]]:
    """The projects and parts that cost most at a connector, estimated: calls a day, by the cost model."""

    rows = conn.execute(
        "SELECT a.part_id, p.mpn, m.name AS manufacturer FROM supply_admissions a JOIN supply_parts p ON p.id = a.part_id "
        "JOIN supply_manufacturers m ON m.id = p.manufacturer_id WHERE a.connector_id = %s AND a.state = 'admitted'",
        (connector_id,),
    ).fetchall()
    projects: dict[str, float] = defaultdict(float)
    parts: list[dict[str, Any]] = []
    for row in rows:
        if row["part_id"] not in data["tiers"]:
            continue
        cost = admission.part_cost(spec, row["part_id"], connector_id, data)
        tier, rate, reasons = data["tiers"][row["part_id"]]
        named = sorted({item["ref"] for item in reasons if item["kind"] == "project"})
        for ref in named or [""]:
            projects[ref] += cost / len(named or [""])
        parts.append({
            "part_id": row["part_id"], "mpn": row["mpn"], "manufacturer": row["manufacturer"], "tier": tier,
            "calls_a_day": round(cost, 3),
            "pick_saves": round(budget.pick_saving(spec, tier, rate, int(data["listed"].get((row["part_id"], connector_id), 1))), 3)
            if (row["part_id"], connector_id) not in data["picked"] else 0.0,
        })
    parts.sort(key=lambda item: -item["calls_a_day"])
    # A project the caller may not see is left out, not named.
    shown = {ref: cost for ref, cost in projects.items() if visible is None or ref == "" or ref in visible}
    top_projects = sorted(({"project_id": ref, "calls_a_day": round(cost, 3)} for ref, cost in shown.items()), key=lambda item: -item["calls_a_day"])
    top_projects = top_projects[:TOP]
    names = {row["project_id"]: row["project_name"] for row in conn.execute(
        "SELECT project_id, project_name FROM supply_bom_usage_projects WHERE project_id = ANY(%s)", ([item["project_id"] for item in top_projects],)
    ).fetchall()}
    for item in top_projects:
        item["project_name"] = names.get(item["project_id"]) or item["project_id"]
    return {"projects": top_projects, "parts": parts[:TOP]}


def _library(conn, connector_id: str, spec, account, committed: int, standing: dict[str, Any] | None, now: datetime) -> dict[str, Any] | None:
    """The library pass at this connector (``library_match``), its days left reckoned on the calls a day nothing else is
    expected to take: the budget less what tracking commits and the half of the pool kept for people."""

    if CAP_SEARCH not in spec.capabilities:
        return None
    used = int(standing["committed"]) if standing else 0
    kept = (account.daily_budget - committed) * ledger.POOL_KEPT_FOR_PEOPLE_PCT // 100
    found = library_match.progress(conn, connector_id, spec.key, now, account.daily_budget - used - kept)
    return found.dto() if found else None


def _coverage(conn) -> dict[str, dict[str, Any]]:
    """Per connector, of the tracked parts admitted to it: how many it has not searched for yet, and how many it gives a price
    for. A part waiting for room is not one it reads, so it counts in neither."""

    def counted(sql: str) -> dict[str, int]:
        return {row["connector_id"]: int(row["n"]) for row in conn.execute(sql).fetchall()}

    admitted = "supply_admissions a JOIN supply_part_tiers w ON w.part_id = a.part_id"
    unsearched = counted(
        f"SELECT a.connector_id, COUNT(*) AS n FROM {admitted} LEFT JOIN supply_discovery_runs d ON d.part_id = a.part_id AND "
        "d.connector_id = a.connector_id WHERE a.state = 'admitted' AND d.part_id IS NULL GROUP BY a.connector_id"
    )
    read = counted(f"SELECT a.connector_id, COUNT(*) AS n FROM {admitted} WHERE a.state = 'admitted' GROUP BY a.connector_id")
    quoted = counted(
        f"""
        SELECT a.connector_id, COUNT(DISTINCT a.part_id) AS n FROM {admitted}
        JOIN supply_listings l ON l.part_id = a.part_id AND l.connector_id = a.connector_id JOIN supply_offers o ON o.listing_id = l.id
        WHERE a.state = 'admitted' AND supply_counted(l.match_state) AND NOT o.marketplace AND o.currency <> '' AND o.price_breaks <> '[]'::jsonb
        GROUP BY a.connector_id
        """
    )
    return {
        connector_id: {"searches_pending": unsearched.get(connector_id, 0), "quotes": {"parts": quoted.get(connector_id, 0), "of": of}}
        for connector_id, of in read.items()
    }


def view(conn, now: datetime, visible: set[str] | None = None) -> list[dict[str, Any]]:
    data = admission._inputs(conn)  # noqa: SLF001 - the cost inputs are read once for every connector
    coverage = _coverage(conn)
    standing = {item["connector_id"]: item for item in admission.status(conn)}
    result = []
    for row in conn.execute("SELECT id, provider, display_name, enabled FROM supply_connectors ORDER BY lower(display_name), id").fetchall():
        try:
            spec = registry.get_spec(row["provider"])
        except registry.UnknownProvider:
            continue
        if not spec.metered:
            continue
        account = accounts.resolve(conn, row["id"])
        day = quota.provider_day(now, account.reset_time, account.reset_tz)
        state = ledger.get_state(
            conn, account.ledger_id, daily_budget=account.daily_budget, reserve_pct=account.reserve_pct, now=now,
            reset_time=account.reset_time, reset_tz=account.reset_tz,
        )
        committed = budget.committed_calls(account.daily_budget, account.reserve_pct)
        hour_row = conn.execute(
            "SELECT spare_hour, spare_hour_spent FROM supply_quota_ledger WHERE account_id = %s AND day = %s", (account.ledger_id, day)
        ).fetchone()
        spare_hour = int(hour_row["spare_hour_spent"]) if hour_row and hour_row["spare_hour"] == quota.day_hour(now, account.reset_time, account.reset_tz) else 0
        reset_in = quota.seconds_to_reset(now, account.reset_time, account.reset_tz)
        result.append({
            "connector_id": row["id"],
            "name": row["display_name"],
            "provider": row["provider"],
            "enabled": bool(row["enabled"]),
            "account": account.ledger_id,
            "shares_account": account.shared,
            "day": day.isoformat(),
            "reset_in_seconds": reset_in,
            "daily_budget": account.daily_budget,
            "committed": {"capacity": committed, "spent": state.spent_today - state.interactive_spent_today - state.spare_spent_today},
            "pool": {"capacity": account.daily_budget - committed, "spent": state.interactive_spent_today},
            "spare_spent": state.spare_spent_today,
            "free": demand.summary(conn, account, state, now, demand.scheduled_rest(conn, account, now), spare_hour),
            "spent": state.spent_today,
            "refused_today": _refused(conn, row["id"], day),
            "tracking": standing.get(row["id"]),
            # A provider's own notice quota has its own bar; its calls are not part of the product budget's day.
            "hourly": _hourly(conn, row["id"], day, notices=not spec.notice_daily_limit),
            "days": _daily(conn, row["id"], day, notices=not spec.notice_daily_limit),
            "owners": owners(conn, row["id"], spec, data, visible),
            # The provider's change-notice quota, apart from the products budget; absent for providers without one.
            "notices": notice_budget.plan(conn, row["id"], spec.notice_daily_limit, now).dto() if spec.notice_daily_limit else None,
            "library": _library(conn, row["id"], spec, account, committed, standing.get(row["id"]), now),
            **coverage.get(row["id"], {"searches_pending": 0, "quotes": {"parts": 0, "of": 0}}),
        })
    return result
