"""When a kept answer is stale: one rule for part summaries, part insights, part forecasts and project rollups.

A change to what an answer is worked out from writes a mark, ``supply_dirty(kind, key, xid)`` (``schema.derived.SOURCES``
names the tables and triggers; code that changes something no table shows calls ``mark``). A kept answer records the snapshot
it read (``seen``), that snapshot's oldest running transaction (``snap``) and its own transaction (``own``, 0 when it wrote
nothing). It is stale when a mark of a kind it reads, for one of its keys or ``*``, comes from a transaction its snapshot did
not see, or from its own. A transaction that ran long does not make answers worked out meanwhile stale: only what they did not
see does.
"""

from __future__ import annotations

from typing import Iterable, Sequence

# The marks each kind of kept answer reads: a rollup is made from its parts' summaries, so their marks make it stale too. An
# ``outlook`` mark (an insight's outlook band moved) is read by what the status feeds, not by the insights that wrote it.
READS: dict[str, tuple[str, ...]] = {
    "summary": ("summary", "outlook"),
    "rollup": ("rollup", "summary", "outlook"),
    "insight": ("insight", "summary"),
    # A kept part forecast is made from the part's readings, its read rate and its price quantity: what its summary is made from.
    "forecast": ("summary",),
}

# The snapshot an answer is about to read, as (seen, snap): take it before reading anything the answer is made from.
SEEN_SQL = "SELECT pg_current_snapshot()::text AS seen, pg_snapshot_xmin(pg_current_snapshot())::text::bigint AS snap"
# The keeping transaction, for ``own``: assigned now, so a change it makes after keeping marks the answer stale.
OWN_SQL = "pg_current_xact_id()::text::bigint"


def seen(conn) -> tuple[str, int]:
    """The snapshot to record with an answer worked out from what is read after this call."""

    row = conn.execute(SEEN_SQL).fetchone()
    return str(row["seen"]), int(row["snap"])


def stale_sql(kind: str, keys: str, kept: str) -> str:
    """SQL for "a mark makes this kept answer stale". ``keys`` is an SQL array of its keys (``*`` is added), ``kept`` the alias of
    its row, with ``seen``, ``snap`` and ``own``."""

    kinds = ", ".join(f"'{name}'" for name in READS[kind])
    return (
        f"EXISTS (SELECT 1 FROM supply_dirty d WHERE d.kind IN ({kinds}) AND d.key = ANY({keys} || '{{*}}'::text[]) "
        f"AND d.xid >= {kept}.snap AND (d.xid = {kept}.own OR NOT pg_visible_in_snapshot(d.xid::text::xid8, {kept}.seen::pg_snapshot)))"
    )


def mark(conn, kind: str, keys: Iterable[str]) -> None:
    """Mark these keys' kept answers of ``kind`` stale (``*`` for all of them), for a change no trigger sees."""

    conn.execute("INSERT INTO supply_dirty (kind, key) SELECT %s, k FROM unnest(%s::text[]) AS k", (kind, sorted(set(keys))))


def mark_sql(conn, kind: str, keys_query: str, params: Sequence[object] = ()) -> None:
    """Mark stale the keys a query returns (its one column)."""

    conn.execute(f"INSERT INTO supply_dirty (kind, key) SELECT DISTINCT %s, k FROM ({keys_query}) AS q(k) WHERE k IS NOT NULL", (kind, *params))


# Kept answers and the keys each depends on, as SQL over ``supply_dirty d``: a mark is still needed while one of them was worked
# out before it (``snap <= xid``) and depends on its key.
_HOLDERS = {
    "summary": "SELECT 1 FROM supply_part_summaries s WHERE s.snap <= d.xid AND d.key IN (s.part_id, '*')",
    "insight": "SELECT 1 FROM supply_part_insights i WHERE i.snap <= d.xid AND d.key IN (i.part_id, '*')",
    "forecast": "SELECT 1 FROM supply_part_forecasts f WHERE f.snap <= d.xid AND d.key IN (f.part_id, '*')",
    "rollup": "SELECT 1 FROM supply_project_rollups r WHERE r.snap <= d.xid AND (d.key IN (r.project_id, '*') OR d.key = ANY(r.part_ids))",
}


def trim(conn) -> int:
    """Remove the marks no kept answer can still depend on: older than every transaction still running, and newer than none
    of the kept answers that read them. Returns how many."""

    running = "pg_snapshot_xmin(pg_current_snapshot())::text::bigint"
    removed = 0
    for kind in sorted({name for reads in READS.values() for name in reads}):
        readers = [reader for reader, reads in READS.items() if kind in reads]
        held = " OR ".join(f"EXISTS ({_HOLDERS[reader]})" for reader in readers)
        removed += conn.execute(f"DELETE FROM supply_dirty d WHERE d.kind = %s AND d.xid < {running} AND NOT ({held})", (kind,)).rowcount or 0
    return removed
