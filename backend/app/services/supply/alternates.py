"""Parts distributors suggest in place of a part, as they said them.

Some come free with an offer read (Mouser names a suggested replacement); DigiKey's are asked for and
kept as ``asked``. Each provider's set for a part is replaced whole on each read, so a suggestion it stops making goes away.
A suggestion Prism has not compared with the part: it is shown as "suggested by", never as graded.

A suggestion is matched to a part Prism knows (by maker and number) so the part sheet can show its stock and let a person track
it. A suggestion given only as a distributor number (Mouser's) stays as that number until a person looks it up.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable

from app.services.supply import facts, parts
from app.services.supply.identity import match_key
from app.services.supply.models import Alternate

MAX_PER_PROVIDER = 8
MAX_TEXT = 120


def _key(alternate: Alternate) -> str:
    return match_key(alternate.mpn) or alternate.sku.strip().lower()


def replace(conn, part_id: str, provider: str, alternates: Iterable[Alternate], now: datetime, *, origin: str = "listed") -> None:
    """Make ``provider``'s suggestions for the part of this origin exactly ``alternates``. Empty removes what it suggested."""

    kept: dict[str, Alternate] = {}
    own = match_key(_own_number(conn, part_id))
    # A suggestion given as a distributor number stays resolved to the part number a person asked for it to be.
    resolved = {
        row["sku"]: (row["manufacturer"], row["mpn"]) for row in conn.execute(
            "SELECT sku, manufacturer, mpn FROM supply_part_alternates WHERE part_id = %s AND provider = %s AND origin = %s AND sku <> '' AND mpn <> ''",
            (part_id, provider, origin),
        ).fetchall()
    }
    for alternate in alternates:
        if not alternate.mpn and alternate.sku in resolved:
            maker, number = resolved[alternate.sku]
            alternate = Alternate(manufacturer=maker, mpn=number, sku=alternate.sku, note=alternate.note)
        key = _key(alternate)
        if key and key != own and key not in kept and len(kept) < MAX_PER_PROVIDER:
            kept[key] = alternate
    conn.execute("DELETE FROM supply_part_alternates WHERE part_id = %s AND provider = %s AND origin = %s AND NOT (alt_key = ANY(%s))",
                 (part_id, provider, origin, list(kept)))
    for key, alternate in kept.items():
        conn.execute(
            """
            INSERT INTO supply_part_alternates (part_id, provider, origin, alt_key, manufacturer, mpn, sku, note, seen_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (part_id, provider, origin, alt_key) DO UPDATE SET
                manufacturer = EXCLUDED.manufacturer, mpn = EXCLUDED.mpn, sku = EXCLUDED.sku, note = EXCLUDED.note, seen_at = EXCLUDED.seen_at
            """,
            (part_id, provider, origin, key, alternate.manufacturer[:MAX_TEXT], alternate.mpn[:MAX_TEXT], alternate.sku[:MAX_TEXT], alternate.note[:MAX_TEXT], now),
        )


def unresolved(conn, part_id: str, provider: str) -> list[str]:
    """Distributor numbers a provider suggested for the part that are not yet a part number."""

    return [row["sku"] for row in conn.execute(
        "SELECT sku FROM supply_part_alternates WHERE part_id = %s AND provider = %s AND origin = 'listed' AND mpn = '' AND sku <> '' ORDER BY sku",
        (part_id, provider),
    ).fetchall()]


def resolve(conn, part_id: str, provider: str, sku: str, manufacturer: str, mpn: str) -> bool:
    """Give a suggested distributor number its part number. False when the number is not (or no longer) suggested."""

    old = conn.execute(
        "SELECT note, seen_at FROM supply_part_alternates WHERE part_id = %s AND provider = %s AND origin = 'listed' AND sku = %s AND mpn = ''",
        (part_id, provider, sku),
    ).fetchone()
    key = match_key(mpn)
    if old is None or not key:
        return False
    conn.execute("DELETE FROM supply_part_alternates WHERE part_id = %s AND provider = %s AND origin = 'listed' AND sku = %s AND mpn = ''", (part_id, provider, sku))
    conn.execute(
        """
        INSERT INTO supply_part_alternates (part_id, provider, origin, alt_key, manufacturer, mpn, sku, note, seen_at)
        VALUES (%s, %s, 'listed', %s, %s, %s, %s, %s, %s) ON CONFLICT (part_id, provider, origin, alt_key) DO NOTHING
        """,
        (part_id, provider, key, manufacturer[:MAX_TEXT], mpn[:MAX_TEXT], sku, old["note"], old["seen_at"]),
    )
    return True


def _own_number(conn, part_id: str) -> str:
    row = conn.execute("SELECT mpn FROM supply_parts WHERE id = %s", (part_id,)).fetchone()
    return row["mpn"] if row else ""


def for_part(conn, part_id: str) -> list[dict[str, Any]]:
    """The suggestions for a part, one row for each number with every distributor that suggested it, and the Prism part when one matches."""

    rows = conn.execute(
        "SELECT provider, origin, alt_key, manufacturer, mpn, sku, note FROM supply_part_alternates WHERE part_id = %s ORDER BY mpn, sku",
        (part_id,),
    ).fetchall()
    merged: dict[str, dict[str, Any]] = {}
    for row in rows:
        entry = merged.setdefault(row["alt_key"], {
            "manufacturer": row["manufacturer"], "mpn": row["mpn"], "sku": row["sku"], "notes": [], "sources": [], "asked": False,
        })
        if row["mpn"] and not entry["mpn"]:
            entry.update(manufacturer=row["manufacturer"], mpn=row["mpn"])
        entry["sources"].append({"provider": row["provider"], "name": facts.source_label(row["provider"])})
        if row["note"] and row["note"] not in entry["notes"]:
            entry["notes"].append(row["note"])
        entry["asked"] = entry["asked"] or row["origin"] == "asked"
    for entry in merged.values():
        entry["sources"].sort(key=lambda source: source["name"].lower())
        found = parts.find_part(conn, entry["manufacturer"], entry["mpn"]) if entry["mpn"] else None
        entry["part_id"] = found.id if found else None
    return list(merged.values())
