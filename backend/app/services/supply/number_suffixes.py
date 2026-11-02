"""The endings a maker puts on a base part number, and what each means. Functions on a connection; none commit.

* ``packaging``: the same part in a reel, tube or tape (``LM358D`` -> ``LM358DR``, ``74AHC1G09GV`` -> ``74AHC1G09GV,125``).
  Listings of such a number count for the part, added to it automatically.
* ``grade``: a different orderable part for the same job (AEC-Q100 automotive, enhanced product). Never counted without a
  person saying so.

A comma and three digits is Nexperia's and NXP's packing code and is always packaging. The rest is the table
``number_suffixes``, which an administrator edits; it began as the list below.
"""

from __future__ import annotations

import re
import time
from typing import Any

from app.services.supply.audit import actor_text, write_audit
from app.services.supply.identity import match_key

PACKAGING = "packaging"
GRADE = "grade"

DEFAULTS: tuple[tuple[str, str], ...] = (
    ("R", PACKAGING), ("RL", PACKAGING), ("TR", PACKAGING), ("T", PACKAGING), ("REEL", PACKAGING), ("REEL7", PACKAGING),
    ("REEL13", PACKAGING), ("#PBF", PACKAGING), ("#TRPBF", PACKAGING), ("/TR", PACKAGING), ("/R", PACKAGING), ("+T", PACKAGING),
    ("+TR", PACKAGING), ("/NOPB", PACKAGING), ("TR7", PACKAGING), ("TR13", PACKAGING), ("T5", PACKAGING),
    ("Q100", GRADE), ("Q101", GRADE), ("Q200", GRADE), ("EP", GRADE),
)

_PACKING_CODE = re.compile(r"^,\d{3}$")
_TABLE: dict[str, str] = dict(DEFAULTS)
_loaded_at = 0.0
_TTL = 30.0


def refresh(conn, *, force: bool = False) -> None:
    global _TABLE, _loaded_at
    now = time.monotonic()
    if not force and now - _loaded_at < _TTL:
        return
    exists = conn.execute("SELECT to_regclass('supply_number_suffixes') AS found").fetchone()["found"] is not None
    rows = conn.execute("SELECT suffix_key, kind FROM supply_number_suffixes").fetchall() if exists else []
    _TABLE = {row["suffix_key"]: row["kind"] for row in rows} if exists else dict(DEFAULTS)
    _loaded_at = now


def kind_of(ending: str) -> str | None:
    """What the characters after a base number mean: ``packaging``, ``grade`` or None (unknown)."""

    key = match_key(ending)
    if not key:
        return None
    if _PACKING_CODE.match(key):
        return PACKAGING
    if key in _TABLE:
        return _TABLE[key]
    # A grade may carry a packing letter after it (Q100H).
    for known, kind in _TABLE.items():
        if kind == GRADE and key.startswith(known) and len(key) - len(known) <= 2:
            return GRADE
    return None


def listing_all(conn) -> list[dict[str, Any]]:
    rows = conn.execute("SELECT suffix_key, suffix_text, kind, source FROM supply_number_suffixes ORDER BY kind, suffix_key").fetchall()
    return [dict(row) for row in rows]


def add(conn, text: str, kind: str, actor: str) -> None:
    actor = actor_text(actor)
    key = match_key(text)
    if not key:
        raise ValueError("Give an ending.")
    if kind not in (PACKAGING, GRADE):
        raise ValueError("The kind is packaging or grade.")
    if len(key) > 12:
        raise ValueError("An ending is at most 12 characters.")
    if conn.execute("SELECT 1 FROM supply_number_suffixes WHERE suffix_key = %s", (key,)).fetchone():
        raise ValueError("That ending is already in the list.")
    conn.execute(
        "INSERT INTO supply_number_suffixes (suffix_key, suffix_text, kind, source) VALUES (%s, %s, %s, 'person')", (key, text.strip()[:20], kind)
    )
    write_audit(conn, actor, "number_suffix.add", key, {"kind": kind}, subject_kind="number_suffix")
    refresh(conn, force=True)


def remove(conn, key: str, actor: str) -> bool:
    actor = actor_text(actor)
    gone = conn.execute("DELETE FROM supply_number_suffixes WHERE suffix_key = %s RETURNING suffix_key", (key,)).fetchone()
    if gone:
        write_audit(conn, actor, "number_suffix.remove", key, {}, subject_kind="number_suffix")
        refresh(conn, force=True)
    return gone is not None
