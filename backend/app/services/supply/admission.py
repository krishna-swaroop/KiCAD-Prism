"""Where each followed part is read, and what waits for room.

A part in ``part_tiers`` is followed at every metered connector it may be read at. Each pair is admitted while the
account's committed share of the daily budget has room for its cost (``budget.py``) and waits otherwise. Waiting pairs
are read from spare budget only, and join when room frees. Connectors that are not metered cost nothing and have no
rows here: they follow every followed part.

``sync`` is the one place ``admissions`` is written. It runs after tiers change, a connector is added or its budget
changes, and a search finds more (or fewer) listings than were estimated. Admitted pairs keep their place; a lowered
budget demotes the newest first; freed room promotes the oldest waiting pair that fits.

``preview`` runs a change and rolls it back, so what a person is shown is exactly what confirming would do.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable

from app.services.supply import budget, clock
from app.services.supply.providers import registry
from app.services.supply.providers.base import ProviderSpec
from app.services.supply.errors import Clash

ADMITTED = "admitted"
WAITING = "waiting"
# What a part not yet searched is assumed to have at a connector, until a connector's own average is known.
DEFAULT_LISTINGS = 1.0


class NoRoom(Clash):
    """Nothing the change adds fits at any connector. The message names what holds the room."""

    code = "no_room"


@dataclass(frozen=True, slots=True)
class _Account:
    ledger_id: str
    connector_ids: tuple[str, ...]
    capacity: int
    names: dict[str, str]


def _accounts(conn) -> tuple[list[_Account], dict[str, tuple[Any, ProviderSpec]]]:
    """Enabled, metered connectors grouped into accounts, with each connector's row and spec."""

    connectors: dict[str, tuple[Any, ProviderSpec]] = {}
    groups: dict[str, list[Any]] = defaultdict(list)
    for row in conn.execute(
        "SELECT c.id, c.provider, c.display_name, c.account_id, a.daily_budget, a.interactive_reserve_pct FROM supply_connectors c "
        "JOIN supply_accounts a ON a.id = c.account_id WHERE c.enabled ORDER BY c.created_at, c.id"
    ).fetchall():
        try:
            spec = registry.get_spec(row["provider"])
        except registry.UnknownProvider:
            continue
        if not spec.metered:
            continue
        connectors[row["id"]] = (row, spec)
        groups[row["account_id"]].append(row)
    accounts = [
        _Account(
            account_id, tuple(item["id"] for item in rows),
            budget.committed_calls(rows[0]["daily_budget"], rows[0]["interactive_reserve_pct"]),
            {item["id"]: item["display_name"] for item in rows},
        )
        for account_id, rows in groups.items()
    ]
    return accounts, connectors


def _eligible(spec: ProviderSpec, connector_id: str, reasons: list[dict], restrictions: dict[str, tuple[set[str], set[str]]]) -> bool:
    """Whether a part may be read at a connector: for a project reason, every regular distributor the project does not
    leave out (so one added later is used too); for other reasons, every regular distributor.

    A distributor that is assembly-only is read only for a project that names it.
    """

    for reason in reasons:
        if reason["kind"] == "project":
            excluded, built_at = restrictions.get(reason["ref"], (set(), set()))
            if (connector_id in built_at) if spec.assembly_only else connector_id not in excluded:
                return True
        elif not spec.assembly_only:
            return True
    return False


def _inputs(conn) -> dict[str, Any]:
    tiers = {
        row["part_id"]: (int(row["tier"]), row["rate"], row["reasons"])
        for row in conn.execute("SELECT part_id, tier, rate, reasons FROM supply_part_tiers").fetchall()
    }
    restrictions = {
        row["project_id"]: (set(row["excluded_ids"] or []), set(row["assembly_ids"] or []))
        for row in conn.execute("SELECT project_id, excluded_ids, assembly_ids FROM supply_tracked_projects").fetchall()
    }
    listed: dict[tuple[str, str], int] = {
        (row["part_id"], row["connector_id"]): int(row["n"])
        for row in conn.execute(
            "SELECT part_id, connector_id, COUNT(*) AS n FROM supply_listings WHERE supply_counted(match_state) "
            "GROUP BY part_id, connector_id"
        ).fetchall()
    }
    picked = {(row["part_id"], row["connector_id"]) for row in conn.execute("SELECT part_id, connector_id FROM supply_packaging_picks").fetchall()}
    searched = {(row["part_id"], row["connector_id"]) for row in conn.execute("SELECT part_id, connector_id FROM supply_discovery_runs").fetchall()}
    carried: dict[str, list[int]] = defaultdict(list)
    for (part_id, connector_id), count in listed.items():
        carried[connector_id].append(count)
    return {
        "tiers": tiers, "restrictions": restrictions, "listed": listed, "picked": picked, "searched": searched,
        "average": {connector_id: sum(counts) / len(counts) for connector_id, counts in carried.items()},
    }


def part_cost(spec: ProviderSpec, part_id: str, connector_id: str, data: dict[str, Any]) -> float:
    tier, rate, _reasons = data["tiers"][part_id]
    key = (part_id, connector_id)
    if key in data["picked"] and budget.picks_limit_reads(spec):
        listings = 1.0
    elif key in data["listed"]:
        listings = float(data["listed"][key])
    elif key in data["searched"]:
        listings = 0.0
    else:
        listings = data["average"].get(connector_id, DEFAULT_LISTINGS)
    return budget.cost(spec, tier, rate, listings)


def sync(conn, now: datetime | None = None) -> dict[str, int]:
    """Bring ``admissions`` in line with the tiers, the budgets and the listings. Returns how many pairs changed."""

    now = now or clock.now()
    # One writer at a time: two runs would admit the same pair twice, or both promote into the same free room.
    conn.execute("SELECT pg_advisory_xact_lock(hashtext('supply-admission'))")
    # A pick on a listing that is no longer counted (gone, rejected) is dropped: the part is read at all its listings again.
    conn.execute(
        "DELETE FROM supply_packaging_picks pk USING supply_listings l WHERE l.id = pk.listing_id AND NOT supply_counted(l.match_state)"
    )
    accounts, connectors = _accounts(conn)
    data = _inputs(conn)
    existing: dict[tuple[str, str], Any] = {
        (row["part_id"], row["connector_id"]): row
        for row in conn.execute("SELECT part_id, connector_id, state, since FROM supply_admissions").fetchall()
    }
    desired: dict[tuple[str, str], float] = {}
    for part_id, (_tier, _rate, reasons) in data["tiers"].items():
        for connector_id, (_row, spec) in connectors.items():
            if _eligible(spec, connector_id, reasons, data["restrictions"]):
                desired[(part_id, connector_id)] = part_cost(spec, part_id, connector_id, data)

    stale = [key for key in existing if key not in desired]
    removed = len(stale)
    for part_id, connector_id in stale:
        conn.execute("DELETE FROM supply_admissions WHERE part_id = %s AND connector_id = %s", (part_id, connector_id))
        existing.pop((part_id, connector_id))

    counts = {"admitted": 0, "waiting": 0, "promoted": 0, "demoted": 0, "removed": removed}
    for account in accounts:
        members = set(account.connector_ids)
        mine = {key: row for key, row in existing.items() if key[1] in members}
        used = sum(desired[key] for key, row in mine.items() if row["state"] == ADMITTED)

        # A lowered budget, or listings found beyond the estimate, can leave more admitted than fits: newest first out.
        if budget.total([used]) > account.capacity:
            for key, row in sorted(((k, r) for k, r in mine.items() if r["state"] == ADMITTED), key=lambda item: item[1]["since"], reverse=True):
                if budget.total([used]) <= account.capacity:
                    break
                conn.execute("UPDATE supply_admissions SET state = 'waiting', since = %s WHERE part_id = %s AND connector_id = %s", (now, *key))
                used -= desired[key]
                mine[key] = {**row, "state": WAITING, "since": now}
                counts["demoted"] += 1

        # New pairs: tier 1 first, then by part, admitted while they fit.
        new = sorted((key for key in desired if key[1] in members and key not in existing),
                     key=lambda key: (data["tiers"][key[0]][0], key[0], key[1]))
        for key in new:
            fits = budget.total([used + desired[key]]) <= account.capacity
            state = ADMITTED if fits else WAITING
            conn.execute(
                "INSERT INTO supply_admissions (part_id, connector_id, state, since) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING", (*key, state, now)
            )
            mine[key] = {"state": state, "since": now}
            used += desired[key] if fits else 0
            counts[state] += 1

        # Room that has freed goes to the oldest waiting pair that fits.
        for key, row in sorted(((k, r) for k, r in mine.items() if r["state"] == WAITING), key=lambda item: (item[1]["since"], item[0])):
            if budget.total([used + desired[key]]) <= account.capacity:
                conn.execute("UPDATE supply_admissions SET state = 'admitted', since = %s WHERE part_id = %s AND connector_id = %s", (now, *key))
                used += desired[key]
                counts["promoted"] += 1
    return counts


def status(conn) -> list[dict[str, Any]]:
    """Per connector: its account's committed capacity and use, and how many pairs are admitted and waiting."""

    accounts, connectors = _accounts(conn)
    data = _inputs(conn)
    rows = conn.execute("SELECT part_id, connector_id, state FROM supply_admissions").fetchall()
    result = []
    for account in accounts:
        members = set(account.connector_ids)
        by_tier: dict[str, dict[str, float | int]] = {"1": {"calls": 0.0, "parts": 0}, "2": {"calls": 0.0, "parts": 0}}
        for row in rows:
            if row["connector_id"] in members and row["state"] == ADMITTED and row["part_id"] in data["tiers"]:
                share = by_tier[str(data["tiers"][row["part_id"]][0])]
                share["calls"] += part_cost(connectors[row["connector_id"]][1], row["part_id"], row["connector_id"], data)
                share["parts"] += 1
        used = by_tier["1"]["calls"] + by_tier["2"]["calls"]
        for connector_id in account.connector_ids:
            mine = [row for row in rows if row["connector_id"] == connector_id]
            result.append({
                "connector_id": connector_id,
                "name": account.names[connector_id],
                "account": account.ledger_id,
                "capacity": account.capacity,
                "committed": budget.total([used]),
                "free": max(0, account.capacity - budget.total([used])),
                # Committed calls a day and parts admitted, for tier 1 and tier 2 (account-wide calls, this connector's parts).
                "by_tier": {tier: {"calls": budget.total([share["calls"]]), "parts": share["parts"]} for tier, share in by_tier.items()},
                "admitted": sum(1 for row in mine if row["state"] == ADMITTED),
                "waiting": sum(1 for row in mine if row["state"] == WAITING),
            })
    return sorted(result, key=lambda item: item["name"].lower())


class _Rollback(Exception):
    pass


def _compare(before: dict[str, dict], after: dict[str, dict]) -> dict[str, Any]:
    connectors = []
    for connector_id, now in after.items():
        was = before.get(connector_id, {"committed": 0, "admitted": 0, "waiting": 0})
        connectors.append({
            **now,
            "adds_calls": now["committed"] - was["committed"],
            "admitted_new": now["admitted"] - was["admitted"],
            "waiting_new": now["waiting"] - was["waiting"],
        })
    placed = sum(max(item["admitted_new"], 0) for item in connectors)
    waiting = sum(max(item["waiting_new"], 0) for item in connectors)
    return {"connectors": connectors, "fits_nowhere": waiting > 0 and placed == 0}


def preview(conn, change: Callable[[Any], Any]) -> dict[str, Any]:
    """Run ``change`` and report what it did to the budget, then undo it.

    Returns each connector's figures after the change and what the change added to them, and whether none of what it
    added fits anywhere. What a person is shown is exactly what ``apply`` would do.
    """

    before = {item["connector_id"]: item for item in status(conn)}
    outcome: dict[str, Any] = {}
    try:
        with conn.transaction():
            outcome["result"] = change(conn)
            outcome["after"] = {item["connector_id"]: item for item in status(conn)}
            raise _Rollback
    except _Rollback:
        pass
    return {**_compare(before, outcome["after"]), "result": outcome["result"]}


def apply(conn, change: Callable[[Any], Any]) -> dict[str, Any]:
    """Run ``change`` for real, "track where room": parts that fit are admitted and the rest wait.

    Refused with ``NoRoom``, and nothing changed, when what the change adds fits at no connector.
    """

    before = {item["connector_id"]: item for item in status(conn)}
    with conn.transaction():
        result = change(conn)
        after = {item["connector_id"]: item for item in status(conn)}
        report = _compare(before, after)
        if report["fits_nowhere"]:
            full = [f"{item['name']} ({item['committed']} of {item['capacity']} calls a day committed)" for item in report["connectors"] if item["waiting_new"] > 0]
            raise NoRoom("No room to track this: " + ", ".join(full) + ". Free room by untracking something or raise the budget.")
    return {**report, "result": result}
