"""What distributors say about a listing and how it changed: the current offer, samples and their daily roll-up, price
breaks, stock-outs and restocks, arrival promises, change events, facts, parameters, substances, alternates, change
notices, market indices and forecasts.
"""

from __future__ import annotations

TABLES: tuple[str, ...] = (
    """
    CREATE TABLE IF NOT EXISTS supply_arrival_promises (
        listing_id TEXT NOT NULL REFERENCES supply_listings(id) ON DELETE CASCADE,
        expected DATE NOT NULL,
        quantity INTEGER NOT NULL,
        first_seen_at TIMESTAMPTZ NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('open', 'arrived', 'slipped', 'gone')),
        resolved_at TIMESTAMPTZ,
        delay_days INTEGER,
        PRIMARY KEY (listing_id, expected)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_events (
        id BIGSERIAL PRIMARY KEY,
        at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        kind TEXT NOT NULL,
        part_id TEXT REFERENCES supply_parts(id) ON DELETE CASCADE,
        listing_id TEXT REFERENCES supply_listings(id) ON DELETE CASCADE,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE INDEX IF NOT EXISTS idx_supply_events_part ON supply_events (part_id, at);
    CREATE INDEX IF NOT EXISTS idx_supply_events_kind ON supply_events (kind, at);
    CREATE INDEX IF NOT EXISTS idx_supply_events_listing ON supply_events (listing_id);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_figure_history (
        day DATE NOT NULL,
        metric TEXT NOT NULL,
        value INTEGER NOT NULL,
        PRIMARY KEY (day, metric)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_forecasts (
        id BIGSERIAL PRIMARY KEY,
        subject_kind TEXT NOT NULL CHECK (subject_kind IN ('part', 'project', 'family')),
        subject_id TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT '',
        target TEXT NOT NULL,
        made_on DATE NOT NULL,
        horizon_days INTEGER NOT NULL,
        quantity INTEGER,
        median DOUBLE PRECISION,
        low DOUBLE PRECISION,
        high DOUBLE PRECISION,
        probability DOUBLE PRECISION,
        model TEXT NOT NULL,
        model_version INTEGER NOT NULL DEFAULT 1,
        inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT supply_forecasts_subject_kind_subject_id_scope_target_made__key UNIQUE (subject_kind, subject_id, scope, target, made_on)
    );
    CREATE INDEX IF NOT EXISTS idx_supply_forecasts_due ON supply_forecasts (made_on);
    CREATE INDEX IF NOT EXISTS idx_supply_forecasts_subject ON supply_forecasts (subject_kind, subject_id, made_on);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_forecast_checks (
        forecast_id BIGINT PRIMARY KEY REFERENCES supply_forecasts(id) ON DELETE CASCADE,
        checked_on DATE NOT NULL,
        observed DOUBLE PRECISION,
        inside BOOLEAN,
        void BOOLEAN NOT NULL DEFAULT FALSE
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_forecast_models (
        target TEXT PRIMARY KEY,
        version INTEGER NOT NULL DEFAULT 1,
        state TEXT NOT NULL DEFAULT 'learning' CHECK (state IN ('learning', 'shown', 'paused')),
        checks INTEGER NOT NULL DEFAULT 0,
        coverage DOUBLE PRECISION,
        since TIMESTAMPTZ,
        reason TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_market_indices (
        day DATE NOT NULL,
        scope_kind TEXT NOT NULL CHECK (scope_kind IN ('all', 'manufacturer', 'category')),
        scope_value TEXT NOT NULL DEFAULT '',
        metric TEXT NOT NULL,
        value NUMERIC(14,4) NOT NULL,
        sample_size INTEGER NOT NULL CHECK (sample_size >= 1),
        PRIMARY KEY (day, scope_kind, scope_value, metric)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_offers (
        listing_id TEXT PRIMARY KEY REFERENCES supply_listings(id) ON DELETE CASCADE,
        fetched_at TIMESTAMPTZ NOT NULL,
        stock INTEGER NOT NULL CHECK (stock >= 0),
        incoming JSONB NOT NULL DEFAULT '[]'::jsonb,
        moq INTEGER NOT NULL DEFAULT 1,
        order_multiple INTEGER NOT NULL DEFAULT 1,
        packaging TEXT NOT NULL DEFAULT 'unknown',
        price_breaks JSONB NOT NULL DEFAULT '[]'::jsonb,
        currency TEXT NOT NULL DEFAULT '',
        lead_time_days INTEGER,
        lifecycle TEXT NOT NULL DEFAULT 'unknown',
        discontinued BOOLEAN NOT NULL DEFAULT FALSE,
        rohs BOOLEAN,
        marketplace BOOLEAN NOT NULL DEFAULT FALSE,
        product_url TEXT NOT NULL DEFAULT '',
        reach_affected BOOLEAN,
        reel_size INTEGER,
        packaging_inferred BOOLEAN NOT NULL DEFAULT FALSE,
        price_up_to INTEGER
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_part_alternates (
        part_id TEXT NOT NULL REFERENCES supply_parts(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        origin TEXT NOT NULL DEFAULT 'listed' CHECK (origin IN ('listed', 'asked')),
        alt_key TEXT NOT NULL,
        manufacturer TEXT NOT NULL DEFAULT '',
        mpn TEXT NOT NULL DEFAULT '',
        sku TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        seen_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (part_id, provider, origin, alt_key)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_part_facts (
        part_id TEXT NOT NULL REFERENCES supply_parts(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        name TEXT NOT NULL,
        value TEXT NOT NULL,
        observed_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (part_id, provider, name)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_part_params (
        part_id TEXT NOT NULL REFERENCES supply_parts(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        name TEXT NOT NULL,
        raw TEXT NOT NULL,
        observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (part_id, provider, name)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_part_substances (
        part_id TEXT NOT NULL REFERENCES supply_parts(id) ON DELETE CASCADE,
        cas TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        declared_by TEXT NOT NULL,
        declared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (part_id, cas)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_pcns (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('end_of_life', 'nrnd', 'last_time_buy', 'change')),
        notice_url TEXT NOT NULL DEFAULT '',
        last_time_buy DATE,
        last_time_ship DATE,
        notes TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL CHECK (state IN ('open', 'closed')),
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_by TEXT NOT NULL DEFAULT '',
        closed_at TIMESTAMPTZ,
        source TEXT NOT NULL DEFAULT 'manual',
        external_key TEXT NOT NULL DEFAULT '',
        published_on DATE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_supply_pcns_external ON supply_pcns (source, external_key) WHERE external_key <> '';
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_pcn_parts (
        pcn_id TEXT NOT NULL REFERENCES supply_pcns(id) ON DELETE CASCADE,
        part_id TEXT NOT NULL REFERENCES supply_parts(id) ON DELETE CASCADE,
        PRIMARY KEY (pcn_id, part_id)
    );
    CREATE INDEX IF NOT EXISTS idx_supply_pcn_parts_part ON supply_pcn_parts (part_id);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_price_breaks_history (
        listing_id TEXT NOT NULL REFERENCES supply_listings(id) ON DELETE CASCADE,
        since TIMESTAMPTZ NOT NULL,
        breaks JSONB NOT NULL,
        currency TEXT NOT NULL DEFAULT '',
        moq INTEGER NOT NULL DEFAULT 1,
        order_multiple INTEGER NOT NULL DEFAULT 1,
        price_up_to INTEGER,
        PRIMARY KEY (listing_id, since)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_rohs_exemptions (
        part_id TEXT NOT NULL REFERENCES supply_parts(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        declared_by TEXT NOT NULL,
        declared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (part_id, code)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_samples (
        listing_id TEXT NOT NULL REFERENCES supply_listings(id) ON DELETE CASCADE,
        sampled_at TIMESTAMPTZ NOT NULL,
        stock INTEGER NOT NULL CHECK (stock >= 0),
        incoming_qty INTEGER NOT NULL DEFAULT 0,
        lead_time_days INTEGER,
        lifecycle TEXT NOT NULL DEFAULT 'unknown',
        discontinued BOOLEAN NOT NULL DEFAULT FALSE,
        marketplace BOOLEAN NOT NULL DEFAULT FALSE,
        moq INTEGER NOT NULL DEFAULT 1,
        order_multiple INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (listing_id, sampled_at)
    );
    CREATE INDEX IF NOT EXISTS idx_supply_samples_sampled_at ON supply_samples (sampled_at);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_samples_daily (
        -- A listing's last reading of a UTC day, once its raw samples are compacted: every column a sample has. Prices are in
        -- supply_price_breaks_history, not here.
        listing_id TEXT NOT NULL REFERENCES supply_listings(id) ON DELETE CASCADE,
        day DATE NOT NULL,
        stock INTEGER NOT NULL CHECK (stock >= 0),
        incoming_qty INTEGER NOT NULL DEFAULT 0,
        lead_time_days INTEGER,
        lifecycle TEXT NOT NULL DEFAULT 'unknown',
        discontinued BOOLEAN NOT NULL DEFAULT FALSE,
        marketplace BOOLEAN NOT NULL DEFAULT FALSE,
        moq INTEGER NOT NULL DEFAULT 1,
        order_multiple INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (listing_id, day)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_stock_events (
        listing_id TEXT NOT NULL REFERENCES supply_listings(id) ON DELETE CASCADE,
        day DATE NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('stock_out', 'restock')),
        stock_before INTEGER NOT NULL,
        stock_after INTEGER NOT NULL,
        quoted_lead_days INTEGER,
        expected DATE,
        resolved_on DATE,
        PRIMARY KEY (listing_id, day, kind)
    );
    CREATE INDEX IF NOT EXISTS idx_supply_stock_events_day ON supply_stock_events (day);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_svhc_list (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        loaded_at TIMESTAMPTZ NOT NULL,
        loaded_by TEXT NOT NULL,
        source_name TEXT NOT NULL DEFAULT '',
        substances INTEGER NOT NULL
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_svhc_substances (
        cas TEXT NOT NULL,
        name TEXT NOT NULL,
        ec TEXT NOT NULL DEFAULT '',
        added_on DATE,
        PRIMARY KEY (cas, name)
    );
    """,
)
