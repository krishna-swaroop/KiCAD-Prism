"""A listing's history, read one way.

Every reader of how a listing's figures moved (the stock chart, price history, lead-time trend, price behaviour, market moves, the
distributor scorecard) asks the same thing: the listing's last reading of each UTC day, from the raw samples where they are still kept
and from the daily rows that compaction left before that (``retention``). ``days_sql`` is that question as SQL, for the caller to put
in its own query, so the planner sees the listing set as a join: a SQL function taking it as an argument cannot be inlined and was
several times slower on a large library.
"""

from __future__ import annotations

# The columns every row has, raw or daily. A listing's price on a day is not a reading: it comes from its price breaks
# (``price_breaks.price_on``).
COLUMNS = "listing_id, day, stock, incoming_qty, lead_time_days, lifecycle, discontinued, marketplace, moq, order_multiple"


def days_sql(listings: str, since: str = "NULL") -> str:
    """SQL for a subquery of each listing's last reading per UTC day (``COLUMNS``), alias it in ``FROM``.

    ``listings`` is a query of listing ids (``SELECT id FROM supply_listings WHERE ...``) and ``since`` an expression for the first
    day, or ``NULL`` for all of it. Both are written into each part of the query, so the planner sees them (a CTE around them hid
    the size of the listing set and the day range, and a large set was read one listing at a time); the caller's parameters must
    therefore be named (``%(part)s``), not positional. A daily row stands only for a day no raw sample speaks for.
    """

    daily = (
        "d.listing_id, d.day, d.stock, d.incoming_qty, d.lead_time_days, d.lifecycle, d.discontinued, "
        "d.marketplace, d.moq, d.order_multiple FROM supply_samples_daily d"
    )
    return f"""(
        WITH raw AS MATERIALIZED (
            SELECT DISTINCT ON (s.listing_id, (s.sampled_at AT TIME ZONE 'UTC')::date)
                   s.listing_id, (s.sampled_at AT TIME ZONE 'UTC')::date AS day, s.stock, s.incoming_qty, s.lead_time_days, s.lifecycle, s.discontinued, s.marketplace, s.moq, s.order_multiple
            FROM supply_samples s
            WHERE s.listing_id IN ({listings})
              AND ({since}::date IS NULL OR s.sampled_at >= ({since})::date::timestamp AT TIME ZONE 'UTC')
            ORDER BY s.listing_id, (s.sampled_at AT TIME ZONE 'UTC')::date, s.sampled_at DESC
        )
        SELECT {COLUMNS} FROM raw
        UNION ALL
        -- Compaction leaves a day raw or daily, so only days from the first raw one on can be both: the older daily rows are taken
        -- as they are, and only the few after are checked against the raw days.
        SELECT {daily}
        WHERE d.listing_id IN ({listings}) AND ({since}::date IS NULL OR d.day >= ({since})::date)
          AND d.day < (SELECT COALESCE(MIN(day), 'infinity') FROM raw)
        UNION ALL
        SELECT {daily}
        WHERE d.listing_id IN ({listings}) AND ({since}::date IS NULL OR d.day >= ({since})::date)
          AND d.day >= (SELECT MIN(day) FROM raw)
          AND NOT EXISTS (SELECT 1 FROM raw r WHERE r.listing_id = d.listing_id AND r.day = d.day)
    )"""
