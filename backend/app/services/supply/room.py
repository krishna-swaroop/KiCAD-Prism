"""How many more parts tracking has room for.

A raw call limit says little: DigiKey reads one part per call, TME fifty, and a part DigiKey does not carry costs it only a
search now and then. So room is counted in parts like the ones Prism already knows:

* For each distributor, what a typical part costs a day, from the real database: the share of searched parts it carries,
  and how many listings a carried part has there (one once a packaging is picked). A part it does not carry costs only the
  search that finds nothing (``budget.py``).
* That estimate is checked against what tracking actually spent over the last week (``call_counts``). When the two differ,
  the measured figure wins: the cost of a typical part is scaled by spent over estimated, within ``FACTOR_RANGE``.
* An account's free committed calls (``admission.status``) divided by a typical part's cost at all its connectors is its
  room. Anything already waiting for room means none.
* The headline is the account that runs out first among the distributors every part is read at (assembly-only ones are
  read only for projects built there and are left out): adding that many typical parts fills it. Past it, parts are still
  read at the others and wait there.

A figure is withheld for a distributor that has searched fewer than ``MIN_SEARCHED`` parts: there is nothing to base it on.
"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

from app.services.supply import accounts, admission, budget, quota

MIN_SEARCHED = 10
# The measured week counts when the estimate is at least this many calls a day; below it the ratio is noise.
MIN_CALIBRATION_CALLS = 5.0
CALIBRATION_DAYS = 7
FACTOR_RANGE = (0.5, 3.0)
TRACKING_PURPOSES = ("tier1", "tier2", "committed")
# What room is counted for: tier 1 (daily) and tier 2 at its usual weekly rate.
LEVELS = {"daily": (1, "daily"), "weekly": (2, "weekly")}


def _typical(conn) -> dict[str, dict[str, float | int]]:
    """Per connector: parts searched there, the share it carries, and the listings read for a carried part."""

    searched: dict[str, set[str]] = defaultdict(set)
    for row in conn.execute("SELECT part_id, connector_id FROM supply_discovery_runs").fetchall():
        searched[row["connector_id"]].add(row["part_id"])
    listings: dict[str, dict[str, int]] = defaultdict(dict)
    for row in conn.execute(
        "SELECT part_id, connector_id, COUNT(*) AS n FROM supply_listings WHERE supply_counted(match_state) GROUP BY part_id, connector_id"
    ).fetchall():
        listings[row["connector_id"]][row["part_id"]] = int(row["n"])
    for row in conn.execute("SELECT part_id, connector_id FROM supply_packaging_picks").fetchall():
        if row["part_id"] in listings[row["connector_id"]]:
            listings[row["connector_id"]][row["part_id"]] = 1
    found = {}
    for connector_id in set(searched) | set(listings):
        known = searched[connector_id] | set(listings[connector_id])
        carried = listings[connector_id]
        found[connector_id] = {
            "searched": len(known),
            "carried_share": len(carried) / len(known) if known else 0.0,
            "listings": sum(carried.values()) / len(carried) if carried else admission.DEFAULT_LISTINGS,
        }
    return found


def part_cost(spec, typical: dict[str, float | int], tier: int, rate: str) -> float:
    """Calls a day one more typical part costs at a connector."""

    share = float(typical["carried_share"])
    return share * budget.cost(spec, tier, rate, float(typical["listings"])) + (1 - share) * budget.cost(spec, tier, rate, 0)


def _measured(conn, connector_ids: tuple[str, ...], now: datetime, reset_time: str, reset_tz: str) -> float | None:
    """Tracking calls a day over the last full week, or None while there is not a week of spending to go on."""

    today = quota.provider_day(now, reset_time, reset_tz)
    first = conn.execute(
        "SELECT MIN(day) AS day FROM supply_call_counts WHERE connector_id = ANY(%s)", (list(connector_ids),)
    ).fetchone()["day"]
    if first is None or (today - first).days < CALIBRATION_DAYS:
        return None
    row = conn.execute(
        "SELECT COALESCE(SUM(calls), 0) AS n FROM supply_call_counts WHERE connector_id = ANY(%s) AND day >= %s AND day < %s "
        "AND purpose = ANY(%s) AND kind NOT IN ('refused', 'test')",
        (list(connector_ids), today - timedelta(days=CALIBRATION_DAYS), today, list(TRACKING_PURPOSES)),
    ).fetchone()
    return int(row["n"]) / CALIBRATION_DAYS


def _spent_yesterday(conn, connector_ids: tuple[str, ...], now: datetime, reset_time: str, reset_tz: str) -> int | None:
    """Tracking calls made on the provider's previous day, or None when nothing was counted then."""

    day = quota.provider_day(now, reset_time, reset_tz) - timedelta(days=1)
    row = conn.execute(
        "SELECT COALESCE(SUM(calls), 0) AS n, COUNT(*) AS rows FROM supply_call_counts WHERE connector_id = ANY(%s) AND day = %s "
        "AND purpose = ANY(%s) AND kind NOT IN ('refused', 'test')",
        (list(connector_ids), day, list(TRACKING_PURPOSES)),
    ).fetchone()
    return int(row["n"]) if row["rows"] else None


def view(conn, now: datetime) -> dict[str, Any]:
    groups, connectors = admission._accounts(conn)  # noqa: SLF001 - the same accounts admission counts
    data = admission._inputs(conn)  # noqa: SLF001
    standing = {item["connector_id"]: item for item in admission.status(conn)}
    typical = _typical(conn)
    rows = []
    for group in groups:
        owner = accounts.resolve(conn, group.connector_ids[0])
        members = group.connector_ids
        status = standing[members[0]]
        specs = {connector_id: connectors[connector_id][1] for connector_id in members}
        known = [typical.get(connector_id) for connector_id in members]
        searched = min((int(item["searched"]) for item in known if item), default=0)
        estimated = sum(
            admission.part_cost(specs[row["connector_id"]], row["part_id"], row["connector_id"], data)
            for row in conn.execute("SELECT part_id, connector_id FROM supply_admissions WHERE state = 'admitted' AND connector_id = ANY(%s)",
                                    (list(members),)).fetchall()
            if row["part_id"] in data["tiers"]
        )
        measured = _measured(conn, members, now, owner.reset_time, owner.reset_tz)
        factor = 1.0
        if measured is not None and estimated >= MIN_CALIBRATION_CALLS:
            factor = min(max(measured / estimated, FACTOR_RANGE[0]), FACTOR_RANGE[1])
        waiting = sum(standing[connector_id]["waiting"] for connector_id in members)
        room: dict[str, int | None] = {}
        for level, (tier, rate) in LEVELS.items():
            if searched < MIN_SEARCHED or any(item is None for item in known):
                room[level] = None
                continue
            cost = sum(part_cost(specs[connector_id], typical[connector_id], tier, rate) for connector_id in members) * factor
            room[level] = 0 if waiting else (math.floor(status["free"] / cost) if cost > 0 else None)
        rows.append({
            "connector_ids": list(members),
            "name": " + ".join(group.names[connector_id] for connector_id in members),
            "assembly_only": all(spec.assembly_only for spec in specs.values()),
            "capacity": status["capacity"],
            "free": status["free"],
            "waiting": waiting,
            "searched": searched,
            "carried_percent": round(100 * min((float(item["carried_share"]) for item in known if item), default=0.0)),
            "estimated_per_day": round(estimated, 1),
            "measured_per_day": round(measured, 1) if measured is not None else None,
            "factor": round(factor, 2),
            "by_tier": status["by_tier"],
            "yesterday": {"expected": round(estimated), "spent": _spent_yesterday(conn, members, now, owner.reset_time, owner.reset_tz)},
            "room": room,
        })
    rows.sort(key=lambda item: item["name"].lower())
    headline: dict[str, dict[str, Any] | None] = {}
    for level in LEVELS:
        counted = [item for item in rows if not item["assembly_only"] and item["room"][level] is not None]
        if not counted:
            headline[level] = None
            continue
        first = min(counted, key=lambda item: item["room"][level])
        headline[level] = {"room": first["room"][level], "limited_by": first["name"]}
    return {"headline": headline, "accounts": rows}
