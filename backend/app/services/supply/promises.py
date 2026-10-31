"""Whether announced arrivals arrive when they are said to.

A distributor lists stock on the way with a date. Each reading that shows one keeps it as a promise. When it leaves the list, stock
that rose by about its quantity says it arrived (and how many days after the date); a new, later date for the same listing says it
slipped; anything else is left as gone, which says nothing. A jump in stock is not proof of that delivery, so the figures are given with
how many promises they rest on, and no rate is stated from fewer than ``MIN_RESOLVED``.
"""

from __future__ import annotations

import statistics
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Sequence

from app.services.supply.models import Incoming

ARRIVED_SHARE = 0.5
ON_TIME_DAYS = 7
MIN_RESOLVED = 3
KEEP_DAYS = 365


def record(conn, listing_id: str, incoming: Sequence[Incoming], previous_stock: int | None, stock: int, now: datetime) -> None:
    """Bring the listing's promises in line with this reading."""

    today = now.date()
    listed = {item.expected: item.quantity for item in incoming if item.expected is not None}
    for expected, quantity in listed.items():
        conn.execute(
            """
            INSERT INTO supply_arrival_promises (listing_id, expected, quantity, first_seen_at, last_seen_at, state)
            VALUES (%s, %s, %s, %s, %s, 'open')
            ON CONFLICT (listing_id, expected) DO UPDATE SET quantity = EXCLUDED.quantity, last_seen_at = EXCLUDED.last_seen_at
            WHERE supply_arrival_promises.state = 'open'
            """,
            (listing_id, expected, quantity, now, now),
        )
    gone = [
        row for row in conn.execute(
            "SELECT expected, quantity FROM supply_arrival_promises WHERE listing_id = %s AND state = 'open'", (listing_id,)
        ).fetchall() if row["expected"] not in listed
    ]
    rise = stock - previous_stock if previous_stock is not None else 0
    for row in gone:
        if rise >= row["quantity"] * ARRIVED_SHARE and rise > 0:
            state, delay = "arrived", (today - row["expected"]).days
        elif any(expected > row["expected"] for expected in listed):
            state, delay = "slipped", None
        else:
            state, delay = "gone", None
        conn.execute(
            "UPDATE supply_arrival_promises SET state = %s, resolved_at = %s, delay_days = %s WHERE listing_id = %s AND expected = %s",
            (state, now, delay, listing_id, row["expected"]),
        )
        rise = max(0, rise - row["quantity"])


def reliability(conn, part_id: str, today: date) -> dict[str, Any] | None:
    """How announced arrivals for the part have turned out. None when none has ever been announced."""

    rows = conn.execute(
        """
        SELECT p.state, p.delay_days, p.expected FROM supply_arrival_promises p JOIN supply_listings l ON l.id = p.listing_id
        WHERE l.part_id = %s AND p.first_seen_at >= %s
        """,
        (part_id, datetime.combine(today - timedelta(days=KEEP_DAYS), time.min, tzinfo=timezone.utc)),
    ).fetchall()
    if not rows:
        return None
    return summarize([(row["state"], row["delay_days"]) for row in rows])


def summarize(promises: Sequence[tuple[str, int | None]]) -> dict[str, Any]:
    arrived = [delay for state, delay in promises if state == "arrived" and delay is not None]
    slipped = sum(1 for state, _ in promises if state == "slipped")
    open_count = sum(1 for state, _ in promises if state == "open")
    resolved = len(arrived) + slipped
    on_time = sum(1 for delay in arrived if delay <= ON_TIME_DAYS)
    return {
        "announced": len(promises), "open": open_count, "arrived": len(arrived), "slipped": slipped,
        "on_time": on_time if resolved >= MIN_RESOLVED else None,
        "on_time_share": round(on_time / resolved, 2) if resolved >= MIN_RESOLVED else None,
        "median_delay_days": round(statistics.median(arrived)) if len(arrived) >= MIN_RESOLVED else None,
    }
