"""Keeping the sample history from growing without limit.

Raw samples stay for ``RAW_DAYS``. Older ones are rolled into one row per listing
per day, the day's last reading with every column a sample has, and the raw rows deleted.
``history.days_sql`` reads both as one history.
The roll-up is idempotent, so a run that is interrupted or repeated changes
nothing it should not.

A connector can also say how long any history may be kept (``keep_days``, for a provider whose terms limit
storage): past that, every history of its listings is deleted (samples, daily rows, price breaks, stock-outs and restocks,
arrival promises, change events), except what still describes today. Without it, that history stays for good.

A distributor whose terms forbid keeping its data as a database (``ProviderSpec.limits_storage``) keeps prices and stock
only for parts in use: followed at a tier (a tracked project, a watch) or held in stock by an inventory source. Any other
part's offer and history go ``READ_WINDOW`` after its last read (``drop_unused``); its listings stay, since a distributor's
part numbers are identifiers, not its price data. A connector whose administrator holds the distributor's written leave to
keep more says so (``keep_unused``).

Call counts are operational: they are kept ``CALL_COUNT_DAYS``, well past the four weeks any view reads.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

from app.services.supply import clock, component_parts, freshness
from app.services.supply.providers import registry
from app.services.supply.project_supply import ROLLUP_MAX_AGE

RAW_DAYS = 60
BATCH_DAYS = 30
CALL_COUNT_DAYS = 90
READ_WINDOW = timedelta(hours=24)


def _midnight(day) -> datetime:
    return datetime.combine(day, time.min, tzinfo=timezone.utc)


def compact_samples(conn, now: datetime) -> int:
    """Roll up raw samples past their connector's keep time (``RAW_DAYS`` unless the connector says otherwise).

    Returns how many raw rows were removed. A listing's keep time is that of its connector.
    """

    keeps = [
        int(row["days"])
        for row in conn.execute("SELECT DISTINCT COALESCE(retention_days, %s) AS days FROM supply_connectors", (RAW_DAYS,)).fetchall()
    ]
    removed = 0
    for days in keeps or [RAW_DAYS]:
        removed += _compact(conn, now, days)
    return removed


_CUT = "%(now)s - (c.keep_days * INTERVAL '1 day')"
_CUT_DAY = f"({_CUT})::date"

# Each listing history and which of its rows are past the cut. A row that still describes today stays: the price breaks
# held now (no later row ends them), a stock-out not yet over, a promise not yet resolved.
_LISTING_HISTORY = (
    ("supply_samples", f"h.sampled_at < {_CUT}"),
    ("supply_samples_daily", f"h.day < {_CUT_DAY}"),
    (
        "supply_price_breaks_history",
        f"EXISTS (SELECT 1 FROM supply_price_breaks_history n WHERE n.listing_id = h.listing_id AND n.since > h.since AND n.since < {_CUT})",
    ),
    ("supply_stock_events", f"h.day < {_CUT_DAY} AND (h.kind <> 'stock_out' OR h.resolved_on < {_CUT_DAY})"),
    ("supply_arrival_promises", f"h.resolved_at < {_CUT}"),
    ("supply_events", f"h.at < {_CUT}"),
)


def drop_expired(conn, now: datetime) -> int:
    """Delete history past its connector's ``keep_days``, and call counts past ``CALL_COUNT_DAYS``. Returns how many rows
    were removed."""

    removed = 0
    for table, past in _LISTING_HISTORY:
        # A join, not a subquery naming the row's date: that form was evaluated again for every row of the table.
        result = conn.execute(
            f"DELETE FROM {table} h USING supply_listings l JOIN supply_connectors c ON c.id = l.connector_id "
            f"WHERE h.listing_id = l.id AND c.keep_days IS NOT NULL AND {past}",
            {"now": now},
        )
        removed += int(result.rowcount or 0)
    result = conn.execute("DELETE FROM supply_call_counts WHERE day < %s", ((now - timedelta(days=CALL_COUNT_DAYS)).date(),))
    return removed + int(result.rowcount or 0)


# Every history of a listing, beside its offer, that holds the distributor's prices or stock.
_PRICE_HISTORY = ("supply_samples", "supply_samples_daily", "supply_price_breaks_history", "supply_stock_events", "supply_arrival_promises", "supply_events")


def _in_use(conn) -> str:
    """A condition on ``l.part_id``: the part is followed at a tier, or an inventory source holds it in stock."""

    tiered = "l.part_id IN (SELECT part_id FROM supply_part_tiers)"
    if not component_parts.library_present(conn) or conn.execute("SELECT to_regclass('inventory_levels') IS NULL AS absent").fetchone()["absent"]:
        return tiered
    return (
        f"({tiered} OR l.part_id IN (SELECT cp.part_id FROM component_parts cp JOIN inventory_levels i ON i.component_id = cp.component_id "
        "WHERE cp.approval = 'approved' AND i.quantity > 0))"
    )


def in_use(conn, part_ids) -> set[str]:
    """Which of these parts are in use (``_in_use``): their prices are read on schedule and kept."""

    wanted = sorted({str(part_id) for part_id in part_ids if part_id})
    if not wanted:
        return set()
    rows = conn.execute(f"SELECT l.part_id FROM unnest(%s::text[]) AS l(part_id) WHERE {_in_use(conn)}", (wanted,)).fetchall()
    return {row["part_id"] for row in rows}


def drop_unused(conn, now: datetime) -> int:
    """Delete the offer and every price and stock history of each listing whose part is not in use, at a distributor that limits
    storage, once ``READ_WINDOW`` has passed since its last read. Returns how many listings were cleared."""

    limited = [spec.key for spec in registry.list_specs(include_dev=True) if spec.limits_storage]
    if not limited:
        return 0
    rows = conn.execute(
        f"""
        SELECT l.id FROM supply_listings l JOIN supply_connectors c ON c.id = l.connector_id
        WHERE c.provider = ANY(%s) AND NOT c.keep_unused AND NOT (l.part_id IS NOT NULL AND {_in_use(conn)})
          AND NOT EXISTS (SELECT 1 FROM supply_offers o WHERE o.listing_id = l.id AND o.fetched_at >= %s)
          AND (EXISTS (SELECT 1 FROM supply_offers o WHERE o.listing_id = l.id)
               OR EXISTS (SELECT 1 FROM supply_samples_daily d WHERE d.listing_id = l.id)
               OR EXISTS (SELECT 1 FROM supply_price_breaks_history b WHERE b.listing_id = l.id))
        """,
        (limited, now - READ_WINDOW),
    ).fetchall()
    gone = [row["id"] for row in rows]
    if not gone:
        return 0
    for table in ("supply_offers", *_PRICE_HISTORY):
        conn.execute(f"DELETE FROM {table} WHERE listing_id = ANY(%s)", (gone,))
    return len(gone)


def _compact(conn, now: datetime, days: int) -> int:
    """One keep time. Works in bounded slices of days, so the first run on a large table does not
    hold one long transaction. The cut is at a UTC day boundary: a day is rolled up whole or not at all."""

    cutoff = (now - timedelta(days=days)).date()
    mine = "listing_id IN (SELECT l.id FROM supply_listings l JOIN supply_connectors c ON c.id = l.connector_id WHERE COALESCE(c.retention_days, %s) = %s)"
    oldest = conn.execute(
        f"SELECT MIN((sampled_at AT TIME ZONE 'UTC')::date) AS day FROM supply_samples WHERE sampled_at < %s AND {mine}",
        (_midnight(cutoff), RAW_DAYS, days),
    ).fetchone()["day"]
    if oldest is None:
        return 0
    stop = min(cutoff, oldest + timedelta(days=BATCH_DAYS))
    conn.execute(
        f"""
        INSERT INTO supply_samples_daily (listing_id, day, stock, incoming_qty, lead_time_days, lifecycle,
                                          discontinued, marketplace, moq, order_multiple)
        SELECT DISTINCT ON (listing_id, (sampled_at AT TIME ZONE 'UTC')::date)
               listing_id, (sampled_at AT TIME ZONE 'UTC')::date, stock, incoming_qty, lead_time_days, lifecycle,
               discontinued, marketplace, moq, order_multiple
        FROM supply_samples
        WHERE sampled_at < %s AND {mine}
        ORDER BY listing_id, (sampled_at AT TIME ZONE 'UTC')::date, sampled_at DESC
        ON CONFLICT (listing_id, day) DO NOTHING
        """,
        (_midnight(stop), RAW_DAYS, days),
    )
    removed = conn.execute(f"DELETE FROM supply_samples WHERE sampled_at < %s AND {mine}", (_midnight(stop), RAW_DAYS, days)).rowcount
    return int(removed or 0)


def trim_summaries(conn, now: datetime | None = None) -> int:
    """Forget kept summaries nobody has read for a week and rollups past the age a reader accepts, then every change mark no kept
    answer can still depend on (``freshness.trim``). Returns how many marks were removed."""

    now = now or clock.now()
    conn.execute("DELETE FROM supply_part_summaries WHERE computed_at < %s", (now - timedelta(days=7),))
    conn.execute("DELETE FROM supply_project_rollups WHERE computed_at < %s", (now - ROLLUP_MAX_AGE,))
    return freshness.trim(conn)
