"""Which packaging of a part is followed at each distributor.

A distributor lists one part as several listings: cut tape, reel, Digi-Reel, tray. Reading all of them costs a call each
at most providers, and adding their stock double counts one pile. A person picks one listing per part and distributor;
only that listing is read, and its stock and price are the part's there. Until a pick every listing is read as before and
the part is flagged "pick a packaging to save N calls a day".

* ``waiting`` lists the tracked parts with more than one counted listing at a distributor and no pick, with the calls a
  day a pick would save.
* ``options`` sets a part's listings at a distributor side by side.
* ``pick`` and ``clear`` change one. ``similar`` then finds the other waiting parts at that distributor whose listings
  offer the same set of packagings, and ``apply_similar`` picks that packaging for the ones a person confirms, in one
  transaction.
* A pick is dropped when its listing stops being counted (``admission.sync`` does it): the part is read at all its listings again and shows
  up in ``waiting``. A listing that appears later is not followed.

Functions on a connection; none commit.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Sequence

from app.services.supply import admission, budget, clock, counted, params, parts, pricing
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.identity import match_key
from app.services.supply.providers import registry
from app.services.supply.errors import Refused

PRICE_QUANTITIES = (1, 100, 1000)
MAX_WAITING = 500


class PickError(Refused):
    """The choice cannot be made. The message is safe to show."""

    code = "invalid_pick"


def _listings(conn, part_id: str, connector_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT l.id, l.sku, l.raw_mpn, l.packaging AS listing_packaging, o.packaging, o.reel_size, o.packaging_inferred, o.moq, o.order_multiple, o.stock, o.lead_time_days,
               o.marketplace, o.currency, o.price_breaks, o.price_up_to, o.fetched_at, o.product_url
        FROM supply_listings l LEFT JOIN supply_offers o ON o.listing_id = l.id
        WHERE l.part_id = %s AND l.connector_id = %s AND l.match_state = ANY(%s) ORDER BY l.sku
        """,
        (part_id, connector_id, list(counted.STATES)),
    ).fetchall()
    return [dict(row) for row in rows]


def _packaging(row: dict[str, Any]) -> str:
    return str(row["packaging"] or row["listing_packaging"] or "unknown")


def _prices(row: dict[str, Any]) -> dict[str, str | None]:
    breaks = [(int(quantity), Decimal(price)) for quantity, price in (row["price_breaks"] or [])]
    result: dict[str, str | None] = {}
    for quantity in PRICE_QUANTITIES:
        price = pricing.unit_price_at(breaks, moq=row["moq"] or 1, order_multiple=row["order_multiple"] or 1, wanted=quantity, up_to=row["price_up_to"]) if breaks else None
        result[str(quantity)] = format(price.normalize(), "f") if price is not None else None
    return result


def picked_by(conn, part_id: str, connector_id: str) -> str:
    row = conn.execute("SELECT picked_by FROM supply_packaging_picks WHERE part_id = %s AND connector_id = %s", (part_id, connector_id)).fetchone()
    return row["picked_by"] if row else ""


def pick_note(conn, part_id: str, connector_id: str) -> str:
    row = conn.execute("SELECT note FROM supply_packaging_picks WHERE part_id = %s AND connector_id = %s", (part_id, connector_id)).fetchone()
    return row["note"] if row else ""


def picked(conn, part_id: str, connector_id: str) -> str | None:
    row = conn.execute("SELECT listing_id FROM supply_packaging_picks WHERE part_id = %s AND connector_id = %s", (part_id, connector_id)).fetchone()
    return row["listing_id"] if row else None


def _saving(conn, part_id: str, connector_id: str, listings: int) -> float:
    row = conn.execute(
        "SELECT c.provider, pt.tier, pt.rate FROM supply_connectors c JOIN supply_part_tiers pt ON pt.part_id = %s WHERE c.id = %s", (part_id, connector_id)
    ).fetchone()
    if row is None:
        return 0.0
    try:
        spec = registry.get_spec(row["provider"])
    except registry.UnknownProvider:
        return 0.0
    return round(budget.pick_saving(spec, int(row["tier"]), row["rate"], listings), 3)


def mechanical_package(conn, part_id: str, connector_id: str) -> str:
    """The case the part comes in (QFN, SOT-23, 0402), as this distributor lists it, or as any other does."""

    rows = conn.execute(
        "SELECT pp.name, pp.raw, c.id AS connector_id FROM supply_part_params pp LEFT JOIN supply_connectors c ON c.provider = pp.provider WHERE pp.part_id = %s ORDER BY pp.name",
        (part_id,),
    ).fetchall()
    found = [(row["connector_id"] == connector_id, row["raw"]) for row in rows if params.canonical_key(row["name"]) == "package" and row["raw"]]
    found.sort(key=lambda item: not item[0])
    return str(found[0][1]).strip() if found else ""


def options(conn, part_id: str, connector_id: str) -> dict[str, Any]:
    """A part's counted listings at a distributor, side by side, with the pick and what picking would save."""

    part = parts.get_part(conn, part_id)
    rows = _listings(conn, part_id, connector_id)
    chosen = picked(conn, part_id, connector_id)
    return {
        "part_id": part_id,
        "connector_id": connector_id,
        "package": mechanical_package(conn, part_id, connector_id),
        "picked": chosen,
        # Who picked (a person, or "auto" for Prism) and the note when Prism fell back to a packaging next to the one asked for.
        "picked_by": picked_by(conn, part_id, connector_id) if chosen else "",
        "note": pick_note(conn, part_id, connector_id) if chosen else "",
        "saves_calls_a_day": 0.0 if chosen else _saving(conn, part_id, connector_id, len(rows)),
        "listings": [
            {
                "id": row["id"], "sku": row["sku"], "raw_mpn": row["raw_mpn"] or "",
                # A listing pinned under another number than the part's (LCSC's loose search returns many) is not this part.
                "other_number": bool(match_key(row["raw_mpn"] or "")) and match_key(row["raw_mpn"] or "") != part.match_key,
                "packaging": _packaging(row), "reel_size": row["reel_size"], "packaging_inferred": bool(row["packaging_inferred"]), "moq": row["moq"], "order_multiple": row["order_multiple"],
                "stock": row["stock"], "lead_time_days": row["lead_time_days"], "marketplace": bool(row["marketplace"]),
                "currency": row["currency"] or "", "prices": _prices(row),
                "fetched_at": row["fetched_at"].isoformat() if row["fetched_at"] else None,
                "product_url": row["product_url"] or "",
            }
            for row in rows
        ],
    }


def waiting(conn, limit: int = MAX_WAITING) -> list[dict[str, Any]]:
    """Tracked parts with several counted listings at a distributor and no pick, biggest saving first."""

    rows = conn.execute(
        """
        SELECT l.part_id, l.connector_id, COUNT(*) AS listings, p.mpn, m.name AS manufacturer, c.display_name AS connector
        FROM supply_listings l
        JOIN supply_part_tiers pt ON pt.part_id = l.part_id
        JOIN supply_parts p ON p.id = l.part_id JOIN supply_manufacturers m ON m.id = p.manufacturer_id
        JOIN supply_connectors c ON c.id = l.connector_id
        LEFT JOIN supply_packaging_picks pk ON pk.part_id = l.part_id AND pk.connector_id = l.connector_id
        WHERE l.match_state = ANY(%s) AND pk.part_id IS NULL
        GROUP BY l.part_id, l.connector_id, p.mpn, m.name, c.display_name HAVING COUNT(*) > 1
        """,
        (list(counted.STATES),),
    ).fetchall()
    items = [
        {
            "part_id": row["part_id"], "connector_id": row["connector_id"], "connector": row["connector"], "mpn": row["mpn"],
            "manufacturer": row["manufacturer"], "listings": int(row["listings"]),
            "saves_calls_a_day": _saving(conn, row["part_id"], row["connector_id"], int(row["listings"])),
        }
        for row in rows
    ]
    items.sort(key=lambda item: (-item["saves_calls_a_day"], item["mpn"].lower()))
    return items[:limit]


def _check_listing(conn, part_id: str, connector_id: str, listing_id: str) -> dict[str, Any]:
    row = conn.execute(
        "SELECT id, packaging FROM supply_listings WHERE id = %s AND part_id = %s AND connector_id = %s AND match_state = ANY(%s)",
        (listing_id, part_id, connector_id, list(counted.STATES)),
    ).fetchone()
    if row is None:
        raise PickError("That listing is not one of this part's counted listings at this distributor.")
    return dict(row)


def pick(conn, part_id: str, connector_id: str, listing_id: str, actor: str, *, note: str = "") -> None:
    actor = actor_text(actor)
    parts.get_part(conn, part_id)
    _check_listing(conn, part_id, connector_id, listing_id)
    conn.execute(
        """
        INSERT INTO supply_packaging_picks (part_id, connector_id, listing_id, picked_by, note, picked_at) VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (part_id, connector_id) DO UPDATE SET listing_id = EXCLUDED.listing_id, picked_by = EXCLUDED.picked_by,
            note = EXCLUDED.note, picked_at = EXCLUDED.picked_at
        """,
        (part_id, connector_id, listing_id, actor, note, clock.now()),
    )
    write_audit(conn, actor, "packaging.pick", part_id, {"connector_id": connector_id, "listing_id": listing_id}, subject_kind="part")
    admission.sync(conn)


def clear(conn, part_id: str, connector_id: str, actor: str) -> bool:
    actor = actor_text(actor)
    removed = conn.execute("DELETE FROM supply_packaging_picks WHERE part_id = %s AND connector_id = %s", (part_id, connector_id)).rowcount
    if removed:
        write_audit(conn, actor, "packaging.clear", part_id, {"connector_id": connector_id}, subject_kind="part")
        admission.sync(conn)
    return bool(removed)


def _offered(conn, part_id: str, connector_id: str) -> tuple[str, ...]:
    return tuple(sorted({_packaging(row) for row in _listings(conn, part_id, connector_id)}))


def similar(conn, part_id: str, connector_id: str, packaging: str) -> list[dict[str, Any]]:
    """Other parts waiting for a pick at this distributor whose listings offer the same packagings, and the listing of
    ``packaging`` that would be picked for each. A part with two listings of that packaging is left out: it is a choice."""

    offered = _offered(conn, part_id, connector_id)
    found = []
    for item in waiting(conn):
        if item["connector_id"] != connector_id or item["part_id"] == part_id:
            continue
        if _offered(conn, item["part_id"], connector_id) != offered:
            continue
        matching = [row for row in _listings(conn, item["part_id"], connector_id) if _packaging(row) == packaging]
        if len(matching) == 1:
            found.append({**item, "listing_id": matching[0]["id"], "sku": matching[0]["sku"]})
    return found


def apply_similar(conn, connector_id: str, packaging: str, part_ids: Sequence[str], actor: str) -> int:
    """Pick ``packaging`` at this distributor for each of these parts, in one go. Returns how many were picked."""

    actor = actor_text(actor)
    done = 0
    for part_id in dict.fromkeys(part_ids):
        matching = [row for row in _listings(conn, part_id, connector_id) if _packaging(row) == packaging]
        if len(matching) != 1 or picked(conn, part_id, connector_id):
            continue
        conn.execute(
            "INSERT INTO supply_packaging_picks (part_id, connector_id, listing_id, picked_by, picked_at) VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
            (part_id, connector_id, matching[0]["id"], actor, clock.now()),
        )
        write_audit(conn, actor, "packaging.pick", part_id, {"connector_id": connector_id, "listing_id": matching[0]["id"], "same_for_similar": True},
                    subject_kind="part")
        done += 1
    if done:
        admission.sync(conn)
    return done


def several(conn, limit: int = MAX_WAITING) -> list[dict[str, Any]]:
    """Tracked parts with more than one counted listing at a distributor, picked or not, for Review.

    ``picked_by`` is the person, ``auto`` for Prism's own pick, or empty without a pick; ``saves_calls_a_day`` is what following
    one listing there saves (nothing at a distributor that reads a part's packagings together).
    """

    rows = conn.execute(
        """
        SELECT l.part_id, l.connector_id, COUNT(*) AS listings, p.mpn, m.name AS manufacturer, c.display_name AS connector, c.provider,
               pk.listing_id AS picked_id, pl.sku AS picked_sku, pk.picked_by, pk.note,
               COUNT(*) FILTER (WHERE pk.picked_at IS NOT NULL AND l.first_seen_at > pk.picked_at AND l.id <> pk.listing_id) AS newer
        FROM supply_listings l
        JOIN supply_part_tiers pt ON pt.part_id = l.part_id
        JOIN supply_parts p ON p.id = l.part_id JOIN supply_manufacturers m ON m.id = p.manufacturer_id
        JOIN supply_connectors c ON c.id = l.connector_id
        LEFT JOIN supply_packaging_picks pk ON pk.part_id = l.part_id AND pk.connector_id = l.connector_id
        LEFT JOIN supply_listings pl ON pl.id = pk.listing_id
        WHERE l.match_state = ANY(%s)
        GROUP BY l.part_id, l.connector_id, p.mpn, m.name, c.display_name, c.provider, pk.listing_id, pl.sku, pk.picked_by, pk.note, pk.picked_at
        HAVING COUNT(*) > 1
        """,
        (list(counted.STATES),),
    ).fetchall()
    items = [
        {
            "part_id": row["part_id"], "connector_id": row["connector_id"], "connector": row["connector"], "provider": row["provider"],
            "mpn": row["mpn"], "manufacturer": row["manufacturer"], "listings": int(row["listings"]),
            "picked_listing": row["picked_id"], "picked_sku": row["picked_sku"] or "", "picked_by": row["picked_by"] or "", "note": row["note"] or "",
            # Listings found after the pick was made: a pick is of what there was then.
            "new_since_pick": int(row["newer"]),
            "saves_calls_a_day": _saving(conn, row["part_id"], row["connector_id"], int(row["listings"])),
        }
        for row in rows
    ]
    items.sort(key=lambda item: (bool(item["picked_by"]), -item["saves_calls_a_day"], item["mpn"].lower()))
    return items[:limit]
