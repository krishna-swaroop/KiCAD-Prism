"""What a part is and how Prism finds it at each distributor: manufacturers and their spellings, parts and their numbers,
listings and the bookkeeping of searching and reading them (discovery, details, poll state, tiers, admissions, one-off
read requests), and a person's per-part choices (packaging picks, preferred distributor, price quantity, trade marks).
"""

from __future__ import annotations

from app.services.supply import counted

TABLES: tuple[str, ...] = (
    """
    CREATE TABLE IF NOT EXISTS supply_manufacturers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_key TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        provisional BOOLEAN NOT NULL DEFAULT FALSE
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_parts (
        id TEXT PRIMARY KEY,
        manufacturer_id TEXT NOT NULL REFERENCES supply_manufacturers(id),
        mpn TEXT NOT NULL,
        match_key TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        datasheet_url TEXT NOT NULL DEFAULT '',
        ask_maker BOOLEAN NOT NULL DEFAULT FALSE,
        UNIQUE (manufacturer_id, match_key)
    );
    CREATE INDEX IF NOT EXISTS idx_supply_parts_match_key ON supply_parts (match_key);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_admissions (
        part_id TEXT NOT NULL REFERENCES supply_parts(id) ON DELETE CASCADE,
        connector_id TEXT NOT NULL REFERENCES supply_connectors(id) ON DELETE CASCADE,
        state TEXT NOT NULL CHECK (state IN ('admitted', 'waiting')),
        since TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (part_id, connector_id)
    );
    CREATE INDEX IF NOT EXISTS idx_supply_admissions_connector ON supply_admissions (connector_id, state, since);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_alias_rejections (
        alias_key TEXT NOT NULL,
        manufacturer_id TEXT NOT NULL REFERENCES supply_manufacturers(id) ON DELETE CASCADE,
        rejected_by TEXT NOT NULL DEFAULT '',
        at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (alias_key, manufacturer_id)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_listings (
        id TEXT PRIMARY KEY,
        connector_id TEXT NOT NULL REFERENCES supply_connectors(id) ON DELETE CASCADE,
        sku TEXT NOT NULL,
        part_id TEXT REFERENCES supply_parts(id) ON DELETE SET NULL,
        raw_mpn TEXT NOT NULL,
        raw_manufacturer TEXT NOT NULL,
        packaging TEXT NOT NULL DEFAULT 'unknown',
        match_state TEXT NOT NULL CHECK (match_state IN ('exact', 'manual', 'manufacturer_unresolved', 'near', 'rejected', 'gone')),
        match_reason TEXT NOT NULL DEFAULT '',
        matched_by TEXT NOT NULL DEFAULT 'discovery',
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (connector_id, sku)
    );
    CREATE INDEX IF NOT EXISTS idx_supply_listings_part ON supply_listings (part_id, match_state);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_detail_checks (
        listing_id TEXT NOT NULL REFERENCES supply_listings(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('notices', 'substances')),
        checked_at TIMESTAMPTZ,
        status TEXT NOT NULL,
        failures INTEGER NOT NULL DEFAULT 0,
        tried_at TIMESTAMPTZ,
        PRIMARY KEY (listing_id, kind)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_discovery_runs (
        part_id TEXT NOT NULL REFERENCES supply_parts(id) ON DELETE CASCADE,
        connector_id TEXT NOT NULL REFERENCES supply_connectors(id) ON DELETE CASCADE,
        last_run_at TIMESTAMPTZ NOT NULL,
        found INTEGER NOT NULL DEFAULT 0,
        family_done BOOLEAN NOT NULL DEFAULT FALSE,
        PRIMARY KEY (part_id, connector_id)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_maker_seeds (
        alias_key TEXT PRIMARY KEY,
        group_key TEXT NOT NULL,
        alias_text TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'seeded'
    );
    CREATE INDEX IF NOT EXISTS idx_supply_maker_seeds_group ON supply_maker_seeds (group_key);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_manufacturer_aliases (
        alias_key TEXT PRIMARY KEY,
        alias_text TEXT NOT NULL,
        manufacturer_id TEXT REFERENCES supply_manufacturers(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('confirmed', 'pending')),
        seen_at_provider TEXT NOT NULL DEFAULT '',
        confirmed_by TEXT NOT NULL DEFAULT '',
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        source TEXT NOT NULL DEFAULT 'person',
        CONSTRAINT supply_manufacturer_aliases_check CHECK ((status = 'confirmed') = (manufacturer_id IS NOT NULL))
    );
    CREATE INDEX IF NOT EXISTS idx_supply_manufacturer_aliases_maker ON supply_manufacturer_aliases (manufacturer_id);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_number_suffixes (
        suffix_key TEXT PRIMARY KEY,
        suffix_text TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('packaging', 'grade')),
        source TEXT NOT NULL DEFAULT 'seeded'
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_packaging_picks (
        part_id TEXT NOT NULL REFERENCES supply_parts(id) ON DELETE CASCADE,
        connector_id TEXT NOT NULL REFERENCES supply_connectors(id) ON DELETE CASCADE,
        listing_id TEXT NOT NULL REFERENCES supply_listings(id) ON DELETE CASCADE,
        picked_by TEXT NOT NULL,
        picked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        note TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (part_id, connector_id)
    );
    CREATE INDEX IF NOT EXISTS idx_supply_packaging_picks_listing ON supply_packaging_picks (listing_id);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_part_numbers (
        part_id TEXT NOT NULL REFERENCES supply_parts(id) ON DELETE CASCADE,
        mpn TEXT NOT NULL,
        match_key TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'person',
        created_by TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (part_id, match_key)
    );
    CREATE INDEX IF NOT EXISTS idx_supply_part_numbers_key ON supply_part_numbers (match_key);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_part_preferences (
        part_id TEXT PRIMARY KEY REFERENCES supply_parts(id) ON DELETE CASCADE,
        connector_id TEXT NOT NULL REFERENCES supply_connectors(id) ON DELETE CASCADE,
        set_by TEXT NOT NULL DEFAULT '',
        set_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_supply_part_preferences_connector ON supply_part_preferences (connector_id);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_part_price_quantity (
        part_id TEXT PRIMARY KEY REFERENCES supply_parts(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL CHECK ((quantity >= 1) AND (quantity <= 1000000)),
        set_by TEXT NOT NULL DEFAULT '',
        set_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_part_spellings (
        part_id TEXT NOT NULL REFERENCES supply_parts(id) ON DELETE CASCADE,
        alias_key TEXT NOT NULL,
        alias_text TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'learned',
        at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (part_id, alias_key)
    );
    CREATE INDEX IF NOT EXISTS idx_supply_part_spellings_key ON supply_part_spellings (alias_key);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_part_tiers (
        part_id TEXT PRIMARY KEY REFERENCES supply_parts(id) ON DELETE CASCADE,
        tier SMALLINT NOT NULL CHECK (tier IN (1, 2)),
        rate TEXT NOT NULL CHECK (rate IN ('daily', 'weekly', 'monthly')),
        reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_supply_part_tiers_tier ON supply_part_tiers (tier, part_id);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_part_trade_marks (
        part_id TEXT PRIMARY KEY REFERENCES supply_parts(id) ON DELETE CASCADE,
        control TEXT NOT NULL CHECK (control IN ('controlled', 'none')),
        eccn TEXT NOT NULL DEFAULT '',
        set_by TEXT NOT NULL DEFAULT '',
        set_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_poll_state (
        listing_id TEXT PRIMARY KEY REFERENCES supply_listings(id) ON DELETE CASCADE,
        tier TEXT NOT NULL CHECK (tier IN ('daily', 'weekly', 'monthly')),
        next_poll_at TIMESTAMPTZ NOT NULL,
        last_polled_at TIMESTAMPTZ,
        last_change_at TIMESTAMPTZ,
        error_streak INTEGER NOT NULL DEFAULT 0,
        missing_streak INTEGER NOT NULL DEFAULT 0,
        last_error_code TEXT NOT NULL DEFAULT '',
        urgency SMALLINT NOT NULL DEFAULT 2
    );
    CREATE INDEX IF NOT EXISTS idx_supply_poll_state_due ON supply_poll_state (next_poll_at);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_read_requests (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('bom', 'component')),
        project_id TEXT NOT NULL DEFAULT '',
        requested_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_supply_read_requests_open ON supply_read_requests (created_at) WHERE finished_at IS NULL;
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_read_request_work (
        request_id TEXT NOT NULL REFERENCES supply_read_requests(id) ON DELETE CASCADE,
        part_id TEXT NOT NULL REFERENCES supply_parts(id) ON DELETE CASCADE,
        connector_id TEXT NOT NULL REFERENCES supply_connectors(id) ON DELETE CASCADE,
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'done', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (request_id, part_id, connector_id)
    );
    CREATE INDEX IF NOT EXISTS idx_supply_read_request_work_connector ON supply_read_request_work (connector_id, state);
    CREATE INDEX IF NOT EXISTS idx_supply_read_request_work_part ON supply_read_request_work (part_id);
    """,
)

FUNCTIONS: tuple[str, ...] = (counted.FUNCTION,)
TRIGGERS: tuple[str, ...] = ()
