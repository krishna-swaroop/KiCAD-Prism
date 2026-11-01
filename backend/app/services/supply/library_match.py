"""Matching the whole library to each distributor's part numbers, from spare budget.

A library part that nothing follows (no tier) is still worth one search per distributor: the listings it finds are
identifiers, kept for good, so a person who opens the part later is read at once instead of searched first. Prices found on
the way follow the read window (``retention.drop_unused``). A part is searched again after ``RESEARCH_AFTER``.

Distributors that look up many numbers in one call (``search_batch`` of at least ``BATCH_FIRST``) go first. One that looks
up a few at a time only searches the gaps: a part every such distributor has searched and none of them carries.

Functions on a connection; none commit.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from app.services.supply import component_parts
from app.services.supply.providers import registry

RESEARCH_AFTER = timedelta(days=90)
BATCH_FIRST = 10

# Library parts nothing follows, by their searches at connector %(connector)s. Aliases: cp component_parts, d discovery_runs.
_LIBRARY = """
    FROM (SELECT DISTINCT part_id FROM component_parts WHERE approval = 'approved' AND part_id IS NOT NULL) cp
    LEFT JOIN supply_part_tiers pt ON pt.part_id = cp.part_id
    LEFT JOIN supply_discovery_runs d ON d.part_id = cp.part_id AND d.connector_id = %(connector)s
    WHERE pt.part_id IS NULL
"""

_DUE = "(d.part_id IS NULL OR d.last_run_at <= %(cut)s)"

# For a connector that fills gaps: every active batch connector has searched the part, and no other connector carries it.
_GAP = """
    AND NOT EXISTS (
        SELECT 1 FROM supply_listings l WHERE l.part_id = cp.part_id AND l.connector_id <> %(connector)s AND l.match_state IN ('exact', 'manual'))
    AND NOT EXISTS (
        SELECT 1 FROM supply_connectors b WHERE b.provider = ANY(%(batch)s) AND b.enabled AND b.paused_reason = '' AND b.id <> %(connector)s
          AND NOT EXISTS (SELECT 1 FROM supply_discovery_runs s WHERE s.part_id = cp.part_id AND s.connector_id = b.id))
"""


def _batch_providers() -> list[str]:
    return [spec.key for spec in registry.list_specs(include_dev=True) if spec.search_batch >= BATCH_FIRST]


def _params(connector_id: str, now: datetime, **more: Any) -> dict[str, Any]:
    return {"connector": connector_id, "cut": now - RESEARCH_AFTER, "batch": _batch_providers(), **more}


def fills_gaps(provider: str) -> bool:
    """Whether a connector of this provider only searches what the batch distributors did not find."""

    try:
        return registry.get_spec(provider).search_batch < BATCH_FIRST
    except registry.UnknownProvider:
        return False


def pending(conn, connector_id: str, provider: str, now: datetime, limit: int) -> list[str]:
    """Library parts due a search at this connector: never searched first, then the longest ago."""

    if not component_parts.library_present(conn):
        return []
    gap = _GAP if fills_gaps(provider) else ""
    rows = conn.execute(
        f"SELECT cp.part_id {_LIBRARY} AND {_DUE} {gap} "
        "ORDER BY (d.part_id IS NULL) DESC, COALESCE(d.last_run_at, '-infinity'::timestamptz), cp.part_id LIMIT %(limit)s",
        _params(connector_id, now, limit=limit),
    ).fetchall()
    return [row["part_id"] for row in rows]


@dataclass(frozen=True, slots=True)
class Progress:
    total: int
    found: int
    not_found: int
    waiting: int
    calls_a_day: int
    days_left: int | None

    def dto(self) -> dict[str, Any]:
        return {
            "total": self.total, "found": self.found, "not_found": self.not_found, "waiting": self.waiting,
            "calls_a_day": self.calls_a_day, "days_left": self.days_left,
        }


def progress(conn, connector_id: str, provider: str, now: datetime, calls_a_day: int) -> Progress | None:
    """How far the library pass is at this connector. ``calls_a_day`` is what spare budget is expected to give it; the days
    left are the waiting parts over the parts that many calls search. None when there is no library."""

    if not component_parts.library_present(conn):
        return None
    row = conn.execute(
        f"""
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE d.part_id IS NOT NULL AND d.last_run_at > %(cut)s AND d.found > 0) AS found,
               COUNT(*) FILTER (WHERE d.part_id IS NOT NULL AND d.last_run_at > %(cut)s AND d.found = 0) AS not_found
        {_LIBRARY}
        """,
        _params(connector_id, now),
    ).fetchone()
    total, found, not_found = int(row["total"]), int(row["found"]), int(row["not_found"])
    if fills_gaps(provider):
        waiting = int(conn.execute(f"SELECT COUNT(*) AS n {_LIBRARY} AND {_DUE} {_GAP}", _params(connector_id, now)).fetchone()["n"])
    else:
        waiting = total - found - not_found
    try:
        per_call = max(registry.get_spec(provider).search_batch, 1)
    except registry.UnknownProvider:
        per_call = 1
    days_left = 0 if not waiting else (math.ceil(waiting / per_call / calls_a_day) if calls_a_day > 0 else None)
    return Progress(total, found, not_found, waiting, max(calls_a_day, 0), days_left)
