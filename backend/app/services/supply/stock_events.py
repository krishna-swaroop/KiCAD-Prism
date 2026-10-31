"""Stock-outs and restocks as they happen, kept by the poller.

A reading that takes a listing from stock to none is a stock-out, with the lead time the distributor quoted at that moment: a
promise to be back by that many days later. A reading that takes it from none to stock is a restock, and ends the open stock-out.
Today's ``price_behaviour`` finds restocks again from the samples each time it is asked, and never kept the quote. The scorecard
(``scorecard``) judges distributors from these rows.
"""

from __future__ import annotations

from datetime import datetime, timedelta


def record(conn, listing_id: str, previous_stock: int | None, stock: int, lead_days: int | None, marketplace: bool, now: datetime) -> str | None:
    """Keep the event this reading shows, if any. Returns ``stock_out``, ``restock`` or None. A first reading, or marketplace stock, is no event."""

    if previous_stock is None or marketplace:
        return None
    day = now.date()
    if previous_stock > 0 and stock == 0:
        expected = day + timedelta(days=lead_days) if lead_days else None
        conn.execute(
            "INSERT INTO supply_stock_events (listing_id, day, kind, stock_before, stock_after, quoted_lead_days, expected) "
            "VALUES (%s, %s, 'stock_out', %s, %s, %s, %s) ON CONFLICT DO NOTHING",
            (listing_id, day, previous_stock, stock, lead_days or None, expected),
        )
        return "stock_out"
    if previous_stock == 0 and stock > 0:
        conn.execute(
            "INSERT INTO supply_stock_events (listing_id, day, kind, stock_before, stock_after) VALUES (%s, %s, 'restock', %s, %s) ON CONFLICT DO NOTHING",
            (listing_id, day, previous_stock, stock),
        )
        conn.execute(
            "UPDATE supply_stock_events SET resolved_on = %s WHERE listing_id = %s AND kind = 'stock_out' AND resolved_on IS NULL AND day <= %s",
            (day, listing_id, day),
        )
        return "restock"
    return None
