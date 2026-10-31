"""A listing's price breaks as they changed over time: the only price history.

The poller keeps a listing's breaks whenever they differ from the last kept (they change rarely, so the table stays small).
A listing's price on a day, at any quantity, is read from the breaks in force that day (``price_on``); readings keep stock and
terms, not a price. A day before the first kept row has no price.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Sequence


def record(
    conn, listing_id: str, since: datetime, breaks: Sequence[tuple[int, Decimal]], currency: str, moq: int, order_multiple: int,
    *, up_to: int | None = None,
) -> bool:
    """Keep the breaks when they differ from the last kept. Returns whether a row was added."""

    if not breaks or not currency:
        return False
    text = [[int(quantity), format(Decimal(price).normalize(), "f")] for quantity, price in breaks]
    last = conn.execute(
        "SELECT breaks, currency, moq, order_multiple, price_up_to FROM supply_price_breaks_history WHERE listing_id = %s ORDER BY since DESC LIMIT 1",
        (listing_id,),
    ).fetchone()
    if last is not None and _same(last["breaks"], text) and (
        last["currency"], last["moq"], last["order_multiple"], last["price_up_to"]) == (currency, moq, order_multiple, up_to):
        return False
    conn.execute(
        "INSERT INTO supply_price_breaks_history (listing_id, since, breaks, currency, moq, order_multiple, price_up_to) "
        "VALUES (%s, %s, %s::jsonb, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
        (listing_id, since, json.dumps(text), currency, moq, order_multiple, up_to),
    )
    return True


def _same(kept: Any, text: list[list[Any]]) -> bool:
    return [[int(q), Decimal(str(p))] for q, p in kept] == [[q, Decimal(p)] for q, p in text]


def load(conn, listing_ids: Sequence[str]) -> dict[str, list[dict[str, Any]]]:
    """Kept rows per listing, oldest first, with the breaks as (quantity, price) pairs and ``day`` the date they began."""

    found: dict[str, list[dict[str, Any]]] = {}
    if not listing_ids:
        return found
    for row in conn.execute(
        "SELECT listing_id, since, breaks, currency, moq, order_multiple, price_up_to FROM supply_price_breaks_history "
        "WHERE listing_id = ANY(%s) ORDER BY since",
        (list(listing_ids),),
    ).fetchall():
        found.setdefault(row["listing_id"], []).append({
            "day": row["since"].astimezone(timezone.utc).date(),
            "breaks": [(int(quantity), Decimal(str(price))) for quantity, price in row["breaks"]],
            "currency": row["currency"], "moq": int(row["moq"]), "order_multiple": int(row["order_multiple"]), "up_to": row["price_up_to"],
        })
    return found


def price_on(rows: Sequence[dict[str, Any]], day: date, quantity: int) -> tuple[Decimal | None, str, int]:
    """A listing's unit price on ``day`` at ``quantity`` from its kept breaks (``load``), in the currency it was quoted in, with its
    smallest order. No price before the first kept row, or when the breaks do not reach the quantity."""

    from app.services.supply import pricing

    held = in_force(rows, day)
    if held is None:
        return None, "", 1
    price = pricing.unit_price_at(held["breaks"], moq=held["moq"], order_multiple=held["order_multiple"], wanted=quantity, up_to=held.get("up_to"))
    return price, held["currency"], held["moq"]


def in_force(rows: Sequence[dict[str, Any]], day: date) -> dict[str, Any] | None:
    """The kept row that held on ``day``, or None when the day is before the first."""

    chosen = None
    for row in rows:
        if row["day"] <= day:
            chosen = row
        else:
            break
    return chosen
