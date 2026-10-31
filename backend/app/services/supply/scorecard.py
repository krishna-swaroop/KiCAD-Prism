"""Who restocks first and who keeps their word, per distributor, judged on the same parts.

A distributor that carries the harder parts is not punished: only parts that two or more distributors list count, and each
distributor is judged on its own events for those parts. The figures come from ``stock_events`` (stock-outs with the lead time
quoted, restocks) and ``arrival_promises`` (Mouser's dated arrivals). Each carries the number it rests on and is withheld under
``MIN_EVENTS``.

Limits: a part read weekly gives week-wide dates, and a few months of readings are needed before the figures say much. The
screens say so until then.
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import date, timedelta
from typing import Any, Sequence

from app.services.supply import counted
from app.services.supply.history import days_sql

MIN_EVENTS = 5
WINDOW_DAYS = 365
STOCK_DAYS = 90
ROUND_DAYS = 21
ON_TIME_DAYS = 7


def _median(values: Sequence[int]) -> int | None:
    return round(statistics.median(values)) if values else None


# Listings of the parts two or more distributors list (exact or a person's match), as SQL both readers share.
_SHARED_LISTINGS = """
    SELECT l.part_id, l.id AS listing_id, l.connector_id FROM supply_listings l
    WHERE l.match_state = ANY(%(counted)s) AND l.part_id IN (
        SELECT part_id FROM supply_listings WHERE match_state = ANY(%(counted)s) GROUP BY part_id HAVING COUNT(DISTINCT connector_id) >= 2)
"""


def _shared(conn) -> dict[str, dict[str, str]]:
    """Parts two or more distributors list: part id to {listing id: connector id}."""

    found: dict[str, dict[str, str]] = defaultdict(dict)
    for row in conn.execute(_SHARED_LISTINGS, {"counted": list(counted.STATES)}).fetchall():
        found[row["part_id"]][row["listing_id"]] = row["connector_id"]
    return found


def _rounds(restocks: dict[str, dict[str, list[date]]]) -> tuple[dict[str, int], dict[str, int]]:
    """Per distributor: rounds it restocked first, and rounds it took part in. A round is a time two or more restocked within three weeks."""

    first: dict[str, int] = defaultdict(int)
    took_part: dict[str, int] = defaultdict(int)
    for by_connector in restocks.values():
        seen: set[tuple[str, date]] = set()
        for connector, days in by_connector.items():
            for day in days:
                if (connector, day) in seen:
                    continue
                group = {connector: day}
                for other, rows in by_connector.items():
                    near = [d for d in rows if other != connector and abs((d - day).days) <= ROUND_DAYS]
                    if near:
                        group[other] = min(near, key=lambda d: abs((d - day).days))
                if len(group) < 2:
                    continue
                seen.update(group.items())
                earliest = min(group.values())
                leaders = [name for name, when in group.items() if when == earliest]
                for name in group:
                    took_part[name] += 1
                if len(leaders) == 1:
                    first[leaders[0]] += 1
    return first, took_part


def _stock_share(conn, today: date) -> dict[str, tuple[int, int]]:
    """Per connector: days with stock and days observed, over the last ``STOCK_DAYS``, on the shared parts.

    A day's figure is the listing's last reading that day (``days_sql``). Counted in the database: the days run to millions
    on a large library, and the shared set is joined there rather than sent as a list of listings."""

    rows = conn.execute(
        f"""
        SELECT l.connector_id, COUNT(*) AS seen, COUNT(*) FILTER (WHERE d.stock > 0) AS held
        FROM {days_sql(f"SELECT shared.listing_id FROM ({_SHARED_LISTINGS}) shared", "%(since)s")} d
        JOIN supply_listings l ON l.id = d.listing_id
        WHERE NOT d.marketplace
        GROUP BY l.connector_id
        """,
        {"counted": list(counted.STATES), "since": today - timedelta(days=STOCK_DAYS)},
    ).fetchall()
    return {row["connector_id"]: (int(row["held"]), int(row["seen"])) for row in rows}


def build(conn, today: date) -> dict[str, Any]:
    """The scorecard: one row for each distributor that lists a part another also lists."""

    shared = _shared(conn)
    owner = {listing: (part, connector) for part, listings in shared.items() for listing, connector in listings.items()}
    since = today - timedelta(days=WINDOW_DAYS)
    events = conn.execute(
        "SELECT listing_id, day, kind, quoted_lead_days, expected, resolved_on FROM supply_stock_events WHERE day >= %s AND listing_id = ANY(%s)",
        (since, list(owner)),
    ).fetchall() if owner else []
    arrivals = conn.execute(
        "SELECT listing_id, state, delay_days FROM supply_arrival_promises WHERE state IN ('arrived', 'slipped') AND first_seen_at >= %s AND listing_id = ANY(%s)",
        (since, list(owner)),
    ).fetchall() if owner else []

    out: dict[str, list[int]] = defaultdict(list)  # days out of stock, resolved
    outs: dict[str, int] = defaultdict(int)
    kept: dict[str, int] = defaultdict(int)
    resolved: dict[str, int] = defaultdict(int)
    late: dict[str, list[int]] = defaultdict(list)
    quoted: dict[str, list[int]] = defaultdict(list)
    real: dict[str, list[int]] = defaultdict(list)
    restocks: dict[str, dict[str, list[date]]] = defaultdict(lambda: defaultdict(list))
    for event in events:
        part, connector = owner[event["listing_id"]]
        if event["kind"] == "restock":
            restocks[part][connector].append(event["day"])
            continue
        outs[connector] += 1
        if event["resolved_on"] is None:
            continue
        waited = (event["resolved_on"] - event["day"]).days
        out[connector].append(waited)
        if event["expected"] is not None:
            behind = max(0, (event["resolved_on"] - event["expected"]).days)
            resolved[connector] += 1
            kept[connector] += 1 if behind <= ON_TIME_DAYS else 0
            if behind > ON_TIME_DAYS:
                late[connector].append(behind)
            quoted[connector].append(int(event["quoted_lead_days"]))
            real[connector].append(waited)
    for arrival in arrivals:
        connector = owner[arrival["listing_id"]][1]
        resolved[connector] += 1
        if arrival["state"] == "arrived" and arrival["delay_days"] is not None and arrival["delay_days"] <= ON_TIME_DAYS:
            kept[connector] += 1
        elif arrival["delay_days"] is not None and arrival["delay_days"] > ON_TIME_DAYS:
            late[connector].append(int(arrival["delay_days"]))
    first, took_part = _rounds(restocks)
    share = _stock_share(conn, today)

    connectors = {connector for _part, connector in owner.values()}
    names = {row["id"]: (row["display_name"], row["provider"]) for row in conn.execute(
        "SELECT id, display_name, provider FROM supply_connectors WHERE id = ANY(%s)", (list(connectors),)).fetchall()} if connectors else {}
    parts_of: dict[str, int] = defaultdict(int)
    for listings in shared.values():
        for connector in set(listings.values()):
            parts_of[connector] += 1

    def held_back(count: int, figure: Any) -> Any:
        return figure if count >= MIN_EVENTS else None

    rows = []
    for connector in sorted(connectors, key=lambda c: names.get(c, ("", ""))[0].lower()):
        held, seen = share.get(connector, (0, 0))
        rows.append({
            "connector_id": connector, "name": names[connector][0], "provider": names[connector][1], "parts": parts_of[connector],
            "stock_outs": {"n": outs[connector], "median_days_out": held_back(len(out[connector]), _median(out[connector]))},
            "restocked_first": {"rounds": took_part[connector], "first": held_back(took_part[connector], first[connector])},
            "promises": {
                "resolved": resolved[connector], "kept": held_back(resolved[connector], kept[connector]),
                "median_days_late": held_back(len(late[connector]), _median(late[connector])),
            },
            "wait": {"n": len(real[connector]), "quoted_days": held_back(len(real[connector]), _median(quoted[connector])),
                     "real_days": held_back(len(real[connector]), _median(real[connector]))},
            "in_stock": {"days": seen, "share": held_back(seen, round(held / seen, 2) if seen else None)},
        })
    return {"distributors": rows, "shared_parts": len(shared), "min_events": MIN_EVENTS}


def for_part(conn, part_id: str, today: date) -> list[dict[str, Any]]:
    """Each distributor's open promise on a part and how its earlier ones turned out."""

    listings = {row["id"]: row for row in conn.execute(
        "SELECT l.id, l.connector_id, c.display_name, c.provider FROM supply_listings l JOIN supply_connectors c ON c.id = l.connector_id "
        "WHERE l.part_id = %s AND l.match_state = ANY(%s)", (part_id, list(counted.STATES))).fetchall()}
    if not listings:
        return []
    ids = list(listings)
    by_connector: dict[str, dict[str, Any]] = {}

    def entry(listing_id: str) -> dict[str, Any]:
        row = listings[listing_id]
        return by_connector.setdefault(row["connector_id"], {
            "connector_id": row["connector_id"], "name": row["display_name"], "provider": row["provider"],
            "open": None, "kept": 0, "resolved": 0, "stock_outs": 0,
        })

    for event in conn.execute(
        "SELECT listing_id, day, quoted_lead_days, expected, resolved_on FROM supply_stock_events WHERE listing_id = ANY(%s) AND kind = 'stock_out' ORDER BY day",
        (ids,),
    ).fetchall():
        item = entry(event["listing_id"])
        item["stock_outs"] += 1
        if event["resolved_on"] is None:
            if event["expected"] is not None:
                item["open"] = {"kind": "lead_time", "expected": event["expected"].isoformat(), "quoted_lead_days": event["quoted_lead_days"], "late": event["expected"] < today}
        elif event["expected"] is not None:
            item["resolved"] += 1
            item["kept"] += 1 if (event["resolved_on"] - event["expected"]).days <= ON_TIME_DAYS else 0
    for promise in conn.execute(
        "SELECT listing_id, expected, quantity, state, delay_days FROM supply_arrival_promises WHERE listing_id = ANY(%s)", (ids,)
    ).fetchall():
        item = entry(promise["listing_id"])
        if promise["state"] == "open":
            current = item["open"]
            if current is None or current["kind"] != "dated" or promise["expected"].isoformat() < current["expected"]:
                item["open"] = {"kind": "dated", "expected": promise["expected"].isoformat(), "quantity": promise["quantity"], "late": promise["expected"] < today}
        elif promise["state"] in ("arrived", "slipped"):
            item["resolved"] += 1
            item["kept"] += 1 if promise["state"] == "arrived" and (promise["delay_days"] or 0) <= ON_TIME_DAYS else 0
    return sorted(by_connector.values(), key=lambda item: item["name"].lower())
