"""The quantity prices are read at: a workspace default, and a part's own when it has one.

Lists, the price history, price alerts and the market figures price a part at its quantity. The BOM does not: it prices
at its build quantity. Changing a quantity throws away what was worked out at the old one (the kept summaries and
insights); the next reader works it out again. No distributor is asked.
"""

from __future__ import annotations

from typing import Iterable

from app.services.supply import clock, freshness
from app.services.supply import settings as supply_settings
from app.services.supply.audit import actor_text, write_audit


def default(conn) -> int:
    return supply_settings.load(conn).pricing.quantity


def of_parts(conn, part_ids: Iterable[str], fallback: int | None = None) -> dict[str, int]:
    """The effective quantity of each part: its own, else the workspace default."""

    ids = list(part_ids)
    fallback = fallback if fallback is not None else default(conn)
    own = {
        row["part_id"]: int(row["quantity"])
        for row in conn.execute("SELECT part_id, quantity FROM supply_part_price_quantity WHERE part_id = ANY(%s)", (ids,)).fetchall()
    } if ids else {}
    return {part_id: own.get(part_id, fallback) for part_id in ids}


def of_part(conn, part_id: str) -> dict[str, object]:
    """The part's quantity and where it comes from."""

    standard = default(conn)
    row = conn.execute("SELECT quantity FROM supply_part_price_quantity WHERE part_id = %s", (part_id,)).fetchone()
    return {"quantity": int(row["quantity"]) if row else standard, "default": standard, "own": row is not None}


def set_for_part(conn, part_id: str, quantity: int | None, actor: str) -> dict[str, object]:
    """Give a part its own quantity, or take it back to the default with ``None``."""

    actor = actor_text(actor)
    low, high = supply_settings.PRICE_QUANTITY_RANGE
    if quantity is not None and (isinstance(quantity, bool) or not isinstance(quantity, int) or not low <= quantity <= high):
        raise ValueError(f"The price quantity must be a whole number from {low:,} to {high:,}.")
    if conn.execute("SELECT 1 FROM supply_parts WHERE id = %s", (part_id,)).fetchone() is None:
        raise ValueError("That part is not in Prism.")
    before = of_part(conn, part_id)
    if quantity is None:
        conn.execute("DELETE FROM supply_part_price_quantity WHERE part_id = %s", (part_id,))
    else:
        conn.execute(
            "INSERT INTO supply_part_price_quantity (part_id, quantity, set_by, set_at) VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (part_id) DO UPDATE SET quantity = EXCLUDED.quantity, set_by = EXCLUDED.set_by, set_at = EXCLUDED.set_at",
            (part_id, quantity, actor, clock.now()),
        )
    after = of_part(conn, part_id)
    write_audit(conn, actor, "part.price_quantity", part_id, {"before": before["quantity"], "after": after["quantity"], "own": after["own"]},
                subject_kind="part")
    return after


def forget(conn) -> None:
    """Have every kept summary, and so every kept insight and rollup, worked out again: the default quantity or the base currency
    changed (``freshness``). A part's own quantity marks its own through its row."""

    freshness.mark(conn, "summary", ["*"])
