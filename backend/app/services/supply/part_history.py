"""A part's stock and price over time, one line per distributor.

The part sheet draws these as lines in each distributor's colour and opens them larger with a choice of timeframe.

* A line steps from reading to reading and is carried forward to the listing's last read (the offer's read time, not the
  last stored sample), so a part read once draws a flat line from that day to the last read.
* A distributor's stock is what the part's stock counts there (``counted.listing_sql``: every listing, except those a pick
  stops being read where a pick limits reading), pooled or added up by pile as that provider shares it (``stock.aggregate``).
* A distributor's price is its followed (picked) listing at the part's price quantity (``price_breaks.price_on``: the price breaks in force
  that day), or its cheapest listing where none is picked, in the base currency at the latest rates.
  Listings whose smallest order is above that quantity are left out, unless there is nothing else.
* ``total`` is what counts for the part.
* ``stale`` marks a line whose distributor was not read for longer than the part's rate allows; the chart dashes the rest.

Reads only.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.services.supply import clock, counted, fx, insights, price_breaks, price_quantity, stock
from app.services.supply.history import days_sql
from app.services.supply import settings as supply_settings

MAX_DAYS = 3650
# Days a listing may go unread before its line is dashed, by the part's rate.
GAP_DAYS = {"daily": 2, "weekly": 9, "monthly": 35}
DEFAULT_DAYS = 90


def _listings(conn, part_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT l.id, l.sku, l.connector_id, {pool} AS pool, c.display_name, c.provider, o.fetched_at, o.moq, o.packaging,
               EXISTS (SELECT 1 FROM supply_packaging_picks fp WHERE fp.listing_id = l.id) AS followed
        FROM supply_listings l
        JOIN supply_connectors c ON c.id = l.connector_id
        LEFT JOIN supply_offers o ON o.listing_id = l.id
        WHERE l.part_id = %s AND {counted}
        """.replace("{counted}", counted.listing_sql()).replace("{pool}", stock.pool_sql()),
        (part_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def _day_figures(conn, listing_ids: list[str], since: datetime) -> dict[str, dict[date, dict[str, Any]]]:
    """Each listing's last figures per day (``days_sql``)."""

    figures: dict[str, dict[date, dict[str, Any]]] = defaultdict(dict)
    for row in conn.execute(
        "SELECT listing_id, day, stock, marketplace, moq FROM "
        + days_sql("SELECT unnest(%(ids)s::text[])", "%(since)s") + " d",
        {"ids": listing_ids, "since": since.date()},
    ).fetchall():
        figures[row["listing_id"]][row["day"]] = dict(row)
    return figures


def _events(conn, part_id: str, total: list[list[Any]], first: date) -> list[dict[str, Any]]:
    """Days worth marking on the axis: a restock (the total rose as ``insights`` counts one) and a product change notice published."""

    found = [
        {"day": after[0], "kind": "restock", "text": f"Restock: {before[1]:,} to {after[1]:,}"}
        for before, after in zip(total, total[1:])
        if insights.is_restock(int(before[1]), int(after[1]))
    ]
    for row in conn.execute(
        """
        SELECT COALESCE(n.published_on, (n.created_at AT TIME ZONE 'UTC')::date) AS day, n.title, n.kind
        FROM supply_pcns n JOIN supply_pcn_parts pp ON pp.pcn_id = n.id WHERE pp.part_id = %s
        """,
        (part_id,),
    ).fetchall():
        if row["day"] >= first:
            found.append({"day": row["day"].isoformat(), "kind": "notice", "text": f"Notice: {row['title']}"})
    return sorted(found, key=lambda item: item["day"])


def build(conn, part_id: str, now: datetime | None = None, days: int = DEFAULT_DAYS) -> dict[str, Any]:
    now = now or clock.now()
    days = max(1, min(int(days), MAX_DAYS))
    listings = _listings(conn, part_id)
    empty = {"days": days, "currency": "", "connectors": [], "total": [], "events": []}
    if not listings:
        return empty
    figures = _day_figures(conn, [item["id"] for item in listings], now - timedelta(days=days))
    figures = {key: value for key, value in figures.items() if value}
    if not figures:
        return empty
    base = supply_settings.base_currency(conn)
    rates = fx.latest(conn)
    tier = conn.execute("SELECT rate FROM supply_part_tiers WHERE part_id = %s", (part_id,)).fetchone()
    allowed_gap = GAP_DAYS.get(tier["rate"] if tier else "daily", GAP_DAYS["daily"])
    quantity = int(price_quantity.of_part(conn, part_id)["quantity"])
    kept = price_breaks.load(conn, list(figures))

    first = min(min(per_day) for per_day in figures.values())
    today = now.astimezone(timezone.utc).date()
    ends: dict[str, date] = {}
    for item in listings:
        if item["id"] not in figures:
            continue
        read = item["fetched_at"].astimezone(timezone.utc).date() if item["fetched_at"] else max(figures[item["id"]])
        ends[item["id"]] = min(max(read, max(figures[item["id"]])), today)
    last_day = max(ends.values())

    # Orderable listings carry the price lines; if none are, every listing does.
    orderable = {item["id"] for item in listings if (item["moq"] or 1) <= quantity}
    priced = orderable if any(item["id"] in orderable for item in listings if item["id"] in figures) else {item["id"] for item in listings}

    by_connector: dict[str, dict[str, Any]] = {}
    for item in listings:
        if item["id"] in figures:
            by_connector.setdefault(item["connector_id"], {"name": item["display_name"], "provider": item["provider"], "listings": []})["listings"].append(item)

    carried: dict[str, dict[str, Any]] = {}
    lines: dict[str, dict[str, Any]] = {
        connector_id: {"connector_id": connector_id, "name": info["name"], "provider": info["provider"], "stock": [], "price": [],
                       "last_read": max((i["fetched_at"] for i in info["listings"] if i["fetched_at"]), default=None)}
        for connector_id, info in by_connector.items()
    }
    total: list[list[Any]] = []
    day = first
    while day <= last_day:
        for listing_id, per_day in figures.items():
            if day in per_day:
                carried[listing_id] = per_day[day]
        live = {listing_id: row for listing_id, row in carried.items() if ends[listing_id] >= day}
        rows_for_total = []
        for connector_id, info in by_connector.items():
            mine = [item for item in info["listings"] if item["id"] in live]
            if not mine:
                continue
            # The pool and SKU let the total count connectors on one account once, as everywhere else (R1).
            rows = [{"connector_id": connector_id, "provider": info["provider"], "stock": live[item["id"]]["stock"], "marketplace": bool(live[item["id"]]["marketplace"]),
                     "fetched_at": day, "packaging": item["packaging"], "pool": item["pool"], "sku": item["sku"]} for item in mine]
            rows_for_total.extend(rows)
            lines[connector_id]["stock"].append([day.isoformat(), stock.aggregate(rows, "any").total])
            candidates = []
            # Where a listing is picked, it prices the part; else every listing does.
            followed = [item for item in mine if item["followed"]]
            for item in (followed or mine):
                row = live[item["id"]]
                if item["id"] in priced and not row.get("marketplace"):
                    price, currency, _moq = price_breaks.price_on(kept.get(item["id"], []), day, quantity)
                    converted = rates.convert(price, currency, base) if price is not None else None
                    if converted is not None:
                        candidates.append(converted)
            if candidates:
                lines[connector_id]["price"].append([day.isoformat(), float(min(candidates))])
        total.append([day.isoformat(), stock.aggregate(rows_for_total, "any").total])
        day += timedelta(days=1)

    events = _events(conn, part_id, total, first)
    ordered = sorted(lines.values(), key=lambda line: line["name"].lower())
    for line in ordered:
        read = line["last_read"]
        # Not read for longer than the part's rate allows: the chart draws the rest of the line dashed.
        line["stale"] = read is not None and (today - read.astimezone(timezone.utc).date()).days > allowed_gap
        line["last_read"] = read.isoformat() if read else None
    return {"days": days, "currency": base, "connectors": ordered, "total": total, "events": events}
