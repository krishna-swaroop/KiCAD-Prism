"""Kept answers worked out from the rest, and the change marks that say when they are stale: part summaries, part
insights, project rollups, the one table of marks, what each kind is worked out from (``SOURCES``) and the triggers made
from it.
"""

from __future__ import annotations

from dataclasses import dataclass

TABLES: tuple[str, ...] = (
    """
    CREATE TABLE IF NOT EXISTS supply_part_insights (
        part_id TEXT PRIMARY KEY REFERENCES supply_parts(id) ON DELETE CASCADE,
        computed_at TIMESTAMPTZ NOT NULL,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        seen TEXT NOT NULL DEFAULT '1:1:',
        snap BIGINT NOT NULL DEFAULT 0,
        own BIGINT NOT NULL DEFAULT 0
    );
    """,
    """
    -- A part's forecast as its sheet shows it, at the part's own quantity: kept when the daily run or a reader makes it, read again
    -- while it is today's and no mark of what it is made from has come since (``forecast.store.kept_part``).
    CREATE TABLE IF NOT EXISTS supply_part_forecasts (
        part_id TEXT PRIMARY KEY REFERENCES supply_parts(id) ON DELETE CASCADE,
        made_on DATE NOT NULL,
        quantity INTEGER NOT NULL,
        data JSONB NOT NULL,
        computed_at TIMESTAMPTZ NOT NULL,
        seen TEXT NOT NULL DEFAULT '1:1:',
        snap BIGINT NOT NULL DEFAULT 0,
        own BIGINT NOT NULL DEFAULT 0
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_part_summaries (
        part_id TEXT PRIMARY KEY REFERENCES supply_parts(id) ON DELETE CASCADE,
        version SMALLINT NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'unknown',
        health REAL,
        changes_at TIMESTAMPTZ,
        problem TEXT,
        stock INTEGER,
        listings INTEGER NOT NULL DEFAULT 0,
        lifecycle TEXT NOT NULL DEFAULT 'unknown',
        dropped BOOLEAN NOT NULL DEFAULT FALSE,
        tier TEXT,
        unit_price NUMERIC,
        as_of TIMESTAMPTZ,
        price JSONB NOT NULL DEFAULT '{}'::jsonb,
        priced_with TEXT NOT NULL DEFAULT '',
        computed_at TIMESTAMPTZ,
        seen TEXT NOT NULL DEFAULT '1:1:',  -- a snapshot that saw nothing, until it is worked out
        snap BIGINT NOT NULL DEFAULT 0,
        own BIGINT NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_supply_part_summaries_status ON supply_part_summaries (status);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_project_rollups (
        project_id TEXT NOT NULL,
        variant TEXT NOT NULL DEFAULT '',
        data JSONB NOT NULL,
        part_ids TEXT[] NOT NULL DEFAULT '{}'::text[],
        seen TEXT NOT NULL,
        snap BIGINT NOT NULL,
        own BIGINT NOT NULL DEFAULT 0,
        computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (project_id, variant)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_dirty (
        id BIGSERIAL PRIMARY KEY,
        kind TEXT NOT NULL,
        key TEXT NOT NULL,
        xid BIGINT NOT NULL DEFAULT ((pg_current_xact_id())::text)::bigint
    );
    CREATE INDEX IF NOT EXISTS idx_supply_dirty_key ON supply_dirty (kind, key, xid);
    """,
)

# What each kept answer is worked out from, in one place: a row written to one of these tables marks the kind of kept answer
# that reads it stale for its key (``supply_dirty``). ``key`` is the column naming the part or project the row belongs to,
# ``listing`` for the part of the row's listing, or ``*`` for every kept answer of the kind. Row triggers only, and an update
# marks only when it changes the row (``WHEN OLD IS DISTINCT FROM NEW``, or the columns named), so a write that changes nothing
# marks nothing; a ``*`` source with no columns is a table written seldom, marked once per statement. ``freshness.py`` reads the
# marks.
@dataclass(frozen=True, slots=True)
class Source:
    kind: str
    table: str
    key: str
    # Columns (or expressions over the row, written with ``{row}``) an update must change to mark; empty is any column.
    columns: tuple[str, ...] = ()


SOURCES: tuple[Source, ...] = (
    # A part's summary (``parts_view``): its listings and their offers, the packaging picked, its watch, its read rate, its quantity.
    Source("summary", "supply_listings", "part_id"),
    Source("summary", "supply_offers", "listing"),
    Source("summary", "supply_poll_state", "listing", ("tier",)),
    Source("summary", "supply_discovery_runs", "part_id"),
    Source("summary", "supply_packaging_picks", "part_id"),
    Source("summary", "supply_watches", "part_id"),
    Source("summary", "supply_part_price_quantity", "part_id"),
    # Its status is its assessment's (``assessment.service``): its waivers, what is declared and stated for it, the notices on it,
    # the rate it is read at, its outlook, and the settings, the distributors Prism reads and the REACH list every part shares.
    Source("summary", "supply_attention_decisions", "part_id"),
    Source("summary", "supply_alert_rules", "part_id"),
    Source("summary", "supply_part_substances", "part_id"),
    Source("summary", "supply_part_facts", "part_id"),
    Source("summary", "supply_pcn_parts", "part_id"),
    Source("summary", "supply_part_tiers", "part_id", ("rate",)),
    # The outlook comes from the part's insights, which read the summary marks: its own kind, so keeping insights marks no insight.
    Source("outlook", "supply_part_insights", "part_id", ("({row}.data ->> 'outlook_band')",)),
    Source("summary", "supply_pcns", "*", ("state", "last_time_buy")),
    Source("summary", "supply_connectors", "*", ("enabled", "provider")),
    Source("summary", "supply_settings", "*"),
    Source("summary", "supply_svhc_list", "*"),
    Source("summary", "supply_svhc_substances", "*"),
    # A part's insights (``part_insights``) also read its summary marks: here, what else they are made from. Their trends move with
    # the clock too, so they are renewed a day on whatever marks say.
    Source("insight", "supply_part_facts", "part_id"),
    Source("insight", "supply_pcn_parts", "part_id"),
    Source("insight", "supply_arrival_promises", "listing"),
    Source("insight", "supply_fx_rates", "*"),
    # A project's rollup (``project_supply``) also reads its parts' summary marks: here, the rest of what it is made from.
    Source("rollup", "supply_parts", "id"),
    Source("rollup", "supply_part_alternates", "part_id"),
    Source("rollup", "supply_part_numbers", "part_id"),
    Source("rollup", "supply_part_preferences", "part_id"),
    Source("rollup", "supply_part_spellings", "part_id"),
    Source("rollup", "supply_part_tiers", "part_id"),
    Source("rollup", "supply_bom_usage", "project_id"),
    Source("rollup", "supply_bom_usage_projects", "project_id"),
    Source("rollup", "supply_tracked_projects", "project_id"),
    Source("rollup", "supply_fx_rates", "*"),
    Source("rollup", "supply_manufacturer_aliases", "*"),
    Source("rollup", "supply_settings", "*"),
)
# Catalog tables the rollups read; their triggers are made once the catalog has them (``create_catalog_links``).
CATALOG_SOURCES: tuple[Source, ...] = (
    Source("rollup", "component_parts", "*"),
    Source("rollup", "components", "*"),
    Source("rollup", "inventory_levels", "*"),
)

FUNCTIONS: tuple[str, ...] = (
    """
    CREATE OR REPLACE FUNCTION supply_mark_row() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
        kind TEXT := TG_ARGV[0];
        source TEXT := TG_ARGV[1];
        keys TEXT[];
    BEGIN
        IF source = 'listing' THEN
            SELECT array_agg(part_id) INTO keys FROM supply_listings
            WHERE id IN (CASE WHEN TG_OP <> 'INSERT' THEN OLD.listing_id END, CASE WHEN TG_OP <> 'DELETE' THEN NEW.listing_id END);
        ELSE
            keys := ARRAY[CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ->> source END, CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ->> source END];
        END IF;
        INSERT INTO supply_dirty (kind, key) SELECT DISTINCT kind, k FROM unnest(keys) AS k WHERE k IS NOT NULL;
        RETURN NULL;
    END;
    $$;
    """,
    """
    CREATE OR REPLACE FUNCTION supply_mark_all() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        INSERT INTO supply_dirty (kind, key) VALUES (TG_ARGV[0], '*');
        RETURN NULL;
    END;
    $$;
    """,
)


def _triggers(source: Source) -> tuple[str, ...]:
    name = f"trg_supply_mark_{source.kind}_{source.table.removeprefix('supply_')}"
    if source.key == "*" and not source.columns:
        return (
            f"CREATE OR REPLACE TRIGGER {name} AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON {source.table} "
            f"FOR EACH STATEMENT EXECUTE FUNCTION supply_mark_all('{source.kind}')",
        )

    def side(column: str, row: str) -> str:
        return column.format(row=row) if "{row}" in column else f"{row}.{column}"

    changed = " OR ".join(f"{side(column, 'OLD')} IS DISTINCT FROM {side(column, 'NEW')}" for column in source.columns) or "OLD.* IS DISTINCT FROM NEW.*"
    call = (
        f"EXECUTE FUNCTION supply_mark_all('{source.kind}')" if source.key == "*"
        else f"EXECUTE FUNCTION supply_mark_row('{source.kind}', '{source.key}')"
    )
    return (
        f"CREATE OR REPLACE TRIGGER {name} AFTER INSERT OR DELETE ON {source.table} FOR EACH ROW {call}",
        f"CREATE OR REPLACE TRIGGER {name}_update AFTER UPDATE ON {source.table} FOR EACH ROW WHEN ({changed}) {call}",
    )


TRIGGERS: tuple[str, ...] = tuple(statement for source in SOURCES for statement in _triggers(source))
CATALOG_TRIGGERS: tuple[str, ...] = tuple(statement for source in CATALOG_SOURCES for statement in _triggers(source))
