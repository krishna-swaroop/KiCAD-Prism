"""Manufacturers, their spellings, and parts. Functions on a connection; none commit.

A manufacturer part is (canonical manufacturer, part number key). A person who
enters a part names its manufacturer and that name is trusted. A spelling a
distributor uses is matched to a maker by ``makers.same_maker``; a part whose maker
is not settled is provisional until distributors' answers settle it (``settle.py``).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Literal

from app.services.supply.audit import actor_text, write_audit
from app.services.supply.identity import alias_key, match_key
from app.services.supply import makers
from app.services.supply.makers import same_maker
from app.services.supply.errors import Missing, Refused


class PartNotFound(Missing):
    """No part with this id."""


class AliasError(Refused):
    """The alias cannot be confirmed as asked. The message is safe to show."""

    code = "alias_error"


class UnknownManufacturer(Refused):
    """The part cannot be made from the line as written. The message is safe to show."""

    code = "unknown_manufacturer"


class AmbiguousNumber(UnknownManufacturer):
    """Several makers have the part number and the line does not say which."""


@dataclass(frozen=True, slots=True)
class Resolution:
    manufacturer_id: str | None
    status: Literal["confirmed", "pending", "blank"]


@dataclass(frozen=True, slots=True)
class PartRecord:
    id: str
    manufacturer_id: str
    manufacturer_name: str
    mpn: str
    match_key: str
    provisional: bool = False


UNKNOWN_NAME = "Not known yet"
UNKNOWN_KEY = "~not known yet"


def _known_keys(conn) -> dict[str, str]:
    """The manufacturer each known name or confirmed spelling stands for, by spelling key."""

    makers.refresh(conn)
    found = {row["name_key"]: row["id"] for row in conn.execute("SELECT id, name_key FROM supply_manufacturers").fetchall()}
    for row in conn.execute("SELECT alias_key, manufacturer_id FROM supply_manufacturer_aliases WHERE status = 'confirmed'").fetchall():
        found[row["alias_key"]] = row["manufacturer_id"]
    return found


def similar_manufacturer(conn, name: str) -> str | None:
    """The manufacturer this spelling names: a known name or spelling, else one it is the same maker as (``makers.py``)."""

    key = alias_key(name)
    if not key:
        return None
    known = _known_keys(conn)
    if key in known:
        return known[key]
    rows = conn.execute(
        "SELECT id, name FROM supply_manufacturers WHERE name_key <> %s ORDER BY provisional, lower(name)", (UNKNOWN_KEY,)
    ).fetchall()
    for row in rows:
        if same_maker(name, row["name"], known.get):
            return row["id"]
    return None


def resolve_manufacturer(conn, name: str, *, provider: str = "") -> Resolution:
    """Look a spelling up. Nothing is written: a spelling Prism cannot place is ``pending`` until a part settles it."""

    key = alias_key(name)
    if not key:
        return Resolution(None, "blank")
    found = similar_manufacturer(conn, name)
    return Resolution(found, "confirmed") if found else Resolution(None, "pending")


def ensure_manufacturer(conn, name: str, actor: str, *, may_create: bool = True, provisional: bool = False) -> str:
    """The manufacturer for a name: a known one, one it is the same maker as, or a new one named as written.

    ``may_create`` is kept for callers that still pass it; nobody is refused (section 11 of the plan). A new manufacturer
    is ``provisional`` when it comes from a line nobody has checked, until distributors' answers settle it.
    """

    actor = actor_text(actor)
    key = alias_key(name)
    if not key:
        raise ValueError("manufacturer is required")
    found = similar_manufacturer(conn, name)
    if found:
        return found
    manufacturer_id = uuid.uuid4().hex
    conn.execute(
        "INSERT INTO supply_manufacturers (id, name, name_key, provisional) VALUES (%s, %s, %s, %s) ON CONFLICT (name_key) DO NOTHING",
        (manufacturer_id, name.strip(), key, provisional),
    )
    row = conn.execute("SELECT id FROM supply_manufacturers WHERE name_key = %s", (key,)).fetchone()
    if row["id"] == manufacturer_id:
        # Creating one from a spelling distributors reported settles that spelling and the listings that waited on it.
        pending = conn.execute(
            "SELECT 1 FROM supply_manufacturer_aliases WHERE alias_key = %s AND status = 'pending' FOR UPDATE", (key,)
        ).fetchone()
        if pending:
            conn.execute(
                "UPDATE supply_manufacturer_aliases SET manufacturer_id = %s, status = 'confirmed', confirmed_by = %s WHERE alias_key = %s",
                (row["id"], actor, key),
            )
            _release_waiting(conn, key, row["id"], actor)
    return row["id"]


def _unknown_manufacturer(conn) -> str:
    conn.execute(
        "INSERT INTO supply_manufacturers (id, name, name_key, provisional) VALUES (%s, %s, %s, TRUE) ON CONFLICT (name_key) DO NOTHING",
        (uuid.uuid4().hex, UNKNOWN_NAME, UNKNOWN_KEY),
    )
    return conn.execute("SELECT id FROM supply_manufacturers WHERE name_key = %s", (UNKNOWN_KEY,)).fetchone()["id"]


def record_spelling(conn, part_id: str, text: str, source: str = "learned") -> None:
    """Remember that a spelling names this part's maker, unless the manufacturer already answers to it."""

    key = alias_key(text)
    if not key or key.startswith("~"):
        return
    owner = conn.execute("SELECT manufacturer_id FROM supply_parts WHERE id = %s", (part_id,)).fetchone()["manufacturer_id"]
    if _known_keys(conn).get(key) == owner:
        return
    conn.execute(
        "INSERT INTO supply_part_spellings (part_id, alias_key, alias_text, source) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
        (part_id, key, text.strip()[:200], source),
    )


def part_number_keys(conn, part_id: str) -> set[str]:
    """The part's own number key and the other numbers it is sold under."""

    keys = {row["match_key"] for row in conn.execute("SELECT match_key FROM supply_part_numbers WHERE part_id = %s", (part_id,)).fetchall()}
    own = conn.execute("SELECT match_key FROM supply_parts WHERE id = %s", (part_id,)).fetchone()
    return keys | ({own["match_key"]} if own else set())


def searched_numbers(conn, part_id: str) -> list[str]:
    """The other numbers a person said the part is sold as (by hand or from a suggestion). They are searched for on their own,
    because a search for the part's number may not bring them back. Numbers added by a suffix rule are found by that search."""

    rows = conn.execute(
        "SELECT mpn FROM supply_part_numbers WHERE part_id = %s AND source IN ('person', 'suggested') ORDER BY created_at LIMIT 3", (part_id,)
    ).fetchall()
    return [row["mpn"] for row in rows]


def add_number(conn, part_id: str, mpn: str, actor: str, source: str = "person") -> bool:
    """Say the part is also sold as ``mpn``. Its listings then count. False when it already is, or is the part's own number."""

    actor = actor_text(actor)
    key = match_key(mpn)
    part = get_part(conn, part_id)
    if not key or key == part.match_key:
        return False
    added = conn.execute(
        "INSERT INTO supply_part_numbers (part_id, mpn, match_key, source, created_by) VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING RETURNING match_key",
        (part_id, mpn.strip()[:120], key, source, actor),
    ).fetchone()
    if added:
        write_audit(conn, actor, "part.number_add", part_id, {"mpn": mpn.strip(), "source": source}, subject_kind="part")
        conn.execute("UPDATE supply_discovery_runs SET family_done = FALSE WHERE part_id = %s", (part_id,))
    return added is not None


def part_spelling_keys(conn, part_id: str) -> set[str]:
    return {row["alias_key"] for row in conn.execute("SELECT alias_key FROM supply_part_spellings WHERE part_id = %s", (part_id,)).fetchall()}


def _create_part(conn, manufacturer_id: str, mpn: str, key: str, actor: str) -> str:
    part_id = uuid.uuid4().hex
    created = conn.execute(
        "INSERT INTO supply_parts (id, manufacturer_id, mpn, match_key) VALUES (%s, %s, %s, %s) "
        "ON CONFLICT (manufacturer_id, match_key) DO NOTHING RETURNING id",
        (part_id, manufacturer_id, mpn.strip(), key),
    ).fetchone()
    if created:
        write_audit(conn, actor, "part.create", part_id, {"mpn": mpn.strip()}, subject_kind="part")
    return conn.execute("SELECT id FROM supply_parts WHERE manufacturer_id = %s AND match_key = %s", (manufacturer_id, key)).fetchone()["id"]


def ensure_part(conn, manufacturer_name: str, mpn: str, actor: str, *, may_create: bool = True) -> PartRecord:
    """The part for a manufacturer and part number, created on first use. Nobody is refused.

    1. A manufacturer Prism knows, or is the same maker as: that one.
    2. A spelling it does not know, and exactly one part has the number: that part, and the spelling joins it.
    3. Several parts have the number and none is this maker: ``AmbiguousNumber`` (a person picks which).
    4. Otherwise a new part under a provisional manufacturer named as written ("Not known yet" without a name); the
       distributors' answers settle it (``settle.py``).
    """

    actor = actor_text(actor)
    key = match_key(mpn)
    if not key:
        raise ValueError("mpn is required")
    written = manufacturer_name.strip()
    found = similar_manufacturer(conn, written) if alias_key(written) else None
    if found:
        part_id = _create_part(conn, found, mpn, key, actor)
        record_spelling(conn, part_id, written, "bom")
        return get_part(conn, part_id)
    candidates = [row["id"] for row in conn.execute("SELECT id FROM supply_parts WHERE match_key = %s ORDER BY created_at", (key,)).fetchall()]
    named = [part_id for part_id in candidates if alias_key(written) and alias_key(written) in part_spelling_keys(conn, part_id)]
    if len(named) == 1:
        return get_part(conn, named[0])
    if len(candidates) == 1:
        record_spelling(conn, candidates[0], written, "bom")
        return get_part(conn, candidates[0])
    if len(candidates) > 1:
        raise AmbiguousNumber(f"Several makers have the part number {mpn.strip()}. Name the maker to tell them apart.")
    manufacturer_id = ensure_manufacturer(conn, written, actor, provisional=True) if alias_key(written) else _unknown_manufacturer(conn)
    return get_part(conn, _create_part(conn, manufacturer_id, mpn, key, actor))


def find_part(conn, manufacturer_name: str, mpn: str) -> PartRecord | None:
    """The part for a manufacturer and part number, or None. Reads only: nothing is created or remembered."""

    key, name_key = match_key(mpn), alias_key(manufacturer_name)
    if not key:
        return None
    rows = conn.execute(
        "SELECT p.id, p.manufacturer_id, m.name FROM supply_parts p JOIN supply_manufacturers m ON m.id = p.manufacturer_id WHERE p.match_key = %s", (key,)
    ).fetchall()
    if not rows:
        return None
    if not name_key:
        return get_part(conn, rows[0]["id"]) if len(rows) == 1 else None
    known = _known_keys(conn)
    for row in rows:
        if known.get(name_key) == row["manufacturer_id"] or name_key in part_spelling_keys(conn, row["id"]) or same_maker(manufacturer_name, row["name"], known.get):
            return get_part(conn, row["id"])
    return None


def get_part(conn, part_id: str) -> PartRecord:
    row = conn.execute(
        "SELECT p.id, p.manufacturer_id, m.name AS manufacturer_name, p.mpn, p.match_key, m.provisional "
        "FROM supply_parts p JOIN supply_manufacturers m ON m.id = p.manufacturer_id WHERE p.id = %s",
        (part_id,),
    ).fetchone()
    if row is None:
        raise PartNotFound(part_id)
    return PartRecord(row["id"], row["manufacturer_id"], row["manufacturer_name"], row["mpn"], row["match_key"], bool(row["provisional"]))


def pending_aliases(conn) -> list[dict]:
    """Spellings distributors used that nobody has mapped yet, oldest first."""

    rows = conn.execute(
        "SELECT alias_key, alias_text, seen_at_provider, first_seen_at FROM supply_manufacturer_aliases "
        "WHERE status = 'pending' ORDER BY first_seen_at, alias_key"
    ).fetchall()
    return [dict(row) for row in rows]


def confirm_alias(conn, key: str, manufacturer_id: str, actor: str) -> int:
    """Map a pending spelling to a manufacturer. Returns how many listings it moved.

    Listings that waited on this spelling become exact when the manufacturer is
    the part's own, and near when it is a different one.
    """

    actor = actor_text(actor)
    row = conn.execute(
        "SELECT alias_text, status FROM supply_manufacturer_aliases WHERE alias_key = %s FOR UPDATE", (key,)
    ).fetchone()
    if row is None:
        raise AliasError("Unknown spelling.")
    if row["status"] != "pending":
        raise AliasError("This spelling is already mapped.")
    if conn.execute("SELECT 1 FROM supply_manufacturers WHERE id = %s", (manufacturer_id,)).fetchone() is None:
        raise AliasError("Unknown manufacturer.")
    conn.execute(
        "UPDATE supply_manufacturer_aliases SET manufacturer_id = %s, status = 'confirmed', confirmed_by = %s "
        "WHERE alias_key = %s",
        (manufacturer_id, actor, key),
    )
    moved = _release_waiting(conn, key, manufacturer_id, actor)
    write_audit(conn, actor, "alias.confirm", key, {"manufacturer_id": manufacturer_id, "listings": moved},
                subject_kind="manufacturer_alias")
    return moved


def _release_waiting(conn, key: str, manufacturer_id: str, actor: str) -> int:
    """Settle the listings that waited on a spelling. Returns how many moved.

    They become exact when the manufacturer is the part's own, and near when it
    is a different one.
    """

    waiting = conn.execute(
        "SELECT l.id, l.raw_manufacturer, p.manufacturer_id AS part_manufacturer FROM supply_listings l "
        "JOIN supply_parts p ON p.id = l.part_id WHERE l.match_state = 'manufacturer_unresolved'"
    ).fetchall()
    moved = 0
    for listing in waiting:
        if alias_key(listing["raw_manufacturer"]) != key:
            continue
        same = listing["part_manufacturer"] == manufacturer_id
        conn.execute(
            "UPDATE supply_listings SET match_state = %s, match_reason = %s, matched_by = %s WHERE id = %s",
            (
                "exact" if same else "near",
                "manufacturer spelling confirmed" if same else "same part number, different manufacturer",
                actor,
                listing["id"],
            ),
        )
        moved += 1
    return moved
