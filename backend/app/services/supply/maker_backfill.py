"""Sort the listings that waited under the old rules again under the new ones (migration 56). Functions on a connection."""

from __future__ import annotations

from app.services.supply import parts, settle
from app.services.supply.discovery import classify
from app.services.supply.models import PartMatch


def run(conn) -> dict[str, int]:
    """Listings waiting on a spelling, or near, are classified again; provisional parts settle; spellings are learned."""

    moved = 0
    rows = conn.execute(
        """
        SELECT l.id, l.sku, l.raw_mpn, l.raw_manufacturer, l.match_state, l.part_id, c.provider
        FROM supply_listings l JOIN supply_connectors c ON c.id = l.connector_id
        WHERE l.match_state IN ('manufacturer_unresolved', 'near') AND l.part_id IS NOT NULL
        """
    ).fetchall()
    for row in rows:
        part = parts.get_part(conn, row["part_id"])
        match = PartMatch(provider=row["provider"], sku=row["sku"], mpn=row["raw_mpn"] or "", manufacturer=row["raw_manufacturer"] or "")
        resolution = parts.resolve_manufacturer(conn, match.manufacturer)
        state, reason = classify(part, match, resolution, frozenset(parts.part_spelling_keys(conn, part.id)))
        if state == "manufacturer_unresolved":
            state = "near"
        if state != row["match_state"]:
            conn.execute("UPDATE supply_listings SET match_state = %s, match_reason = %s, matched_by = 'discovery' WHERE id = %s", (state, reason, row["id"]))
            moved += 1
        elif state == "near":
            conn.execute("UPDATE supply_listings SET match_reason = %s WHERE id = %s", (reason, row["id"]))
        if state == "exact":
            parts.record_spelling(conn, part.id, match.manufacturer, "learned")
    learned = settle.learn_aliases(conn)
    # A spelling nobody waits on is not a question any more.
    conn.execute("DELETE FROM supply_manufacturer_aliases WHERE status = 'pending'")
    return {"listings": moved, "learned": learned}
