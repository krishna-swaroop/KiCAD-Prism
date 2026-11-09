"""Sorting listings that wait on a maker again as the maker rules grow: once in migration 56 (``run``), then by the aliases task
after each pass of learned spellings (``resort``). Functions on a connection."""

from __future__ import annotations

from typing import Any

from app.services.supply import parts, settle
from app.services.supply.discovery import EXACT, NEAR, UNRESOLVED, classify
from app.services.supply.models import PartMatch

# A near listing a maker rule can change: same number, another spelling of the maker. One of another number stays near.
_OTHER_MAKER = "same part number, different manufacturer"


def _sorted(conn, rows: list[Any]) -> list[tuple[Any, str, str]]:
    """Each listing with its state and reason under today's rules; a part's spellings are read once."""

    known: dict[str, tuple[parts.PartRecord, frozenset[str], tuple[str, ...]]] = {}
    found = []
    for row in rows:
        if row["part_id"] not in known:
            known[row["part_id"]] = (
                parts.get_part(conn, row["part_id"]), frozenset(parts.part_spelling_keys(conn, row["part_id"])), parts.maker_spellings(conn, row["part_id"]),
            )
        part, keys, spellings = known[row["part_id"]]
        match = PartMatch(provider=row["provider"], sku=row["sku"], mpn=row["raw_mpn"] or "", manufacturer=row["raw_manufacturer"] or "")
        state, reason = classify(part, match, parts.resolve_manufacturer(conn, match.manufacturer), keys, spellings=spellings)
        found.append((row, state, reason))
    return found


def _waiting(conn, where: str, params: tuple = ()) -> list[Any]:
    return conn.execute(
        "SELECT l.id, l.sku, l.raw_mpn, l.raw_manufacturer, l.match_state, l.part_id, c.provider "
        "FROM supply_listings l JOIN supply_connectors c ON c.id = l.connector_id WHERE l.part_id IS NOT NULL AND " + where,
        params,
    ).fetchall()


def resort(conn) -> int:
    """Listings waiting on a spelling, or near under another spelling of the number, that today's rules count become exact.
    Nothing else moves: a question a person may be answering stays. Returns how many moved."""

    rows = _waiting(conn, "(l.match_state = %s OR (l.match_state = %s AND l.match_reason = %s))", (UNRESOLVED, NEAR, _OTHER_MAKER))
    moved = 0
    for row, state, reason in _sorted(conn, rows):
        if state != EXACT:
            continue
        conn.execute("UPDATE supply_listings SET match_state = %s, match_reason = %s, matched_by = 'discovery' WHERE id = %s", (state, reason, row["id"]))
        parts.record_spelling(conn, row["part_id"], row["raw_manufacturer"] or "", "learned")
        moved += 1
    return moved


def run(conn) -> dict[str, int]:
    """Listings waiting on a spelling, or near, are classified again; provisional parts settle; spellings are learned."""

    moved = 0
    for row, state, reason in _sorted(conn, _waiting(conn, "l.match_state IN ('manufacturer_unresolved', 'near')")):
        if state == UNRESOLVED:
            state = NEAR
        if state != row["match_state"]:
            conn.execute("UPDATE supply_listings SET match_state = %s, match_reason = %s, matched_by = 'discovery' WHERE id = %s", (state, reason, row["id"]))
            moved += 1
        elif state == NEAR:
            conn.execute("UPDATE supply_listings SET match_reason = %s WHERE id = %s", (reason, row["id"]))
        if state == EXACT:
            parts.record_spelling(conn, row["part_id"], row["raw_manufacturer"] or "", "learned")
    learned = settle.learn_aliases(conn)
    # A spelling nobody waits on is not a question any more.
    conn.execute("DELETE FROM supply_manufacturer_aliases WHERE status = 'pending'")
    return {"listings": moved, "learned": learned}
