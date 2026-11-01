"""Where supply data comes from and what it costs: accounts (the credentials a provider knows Prism by, with their call
budget and its ledger), connectors and their credentials' grants, rate-limit marks and pacing, uploaded and pushed offers
and the tokens a source pushes with, exchange rates, periodic task runs, settings and the audit trail.
"""

from __future__ import annotations

TABLES: tuple[str, ...] = (
    """
    CREATE TABLE IF NOT EXISTS supply_audit_events (
        id BIGSERIAL PRIMARY KEY,
        at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        subject_kind TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        detail JSONB NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE INDEX IF NOT EXISTS idx_supply_audit_subject ON supply_audit_events (subject_kind, subject_id, at);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_accounts (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        account_key TEXT NOT NULL DEFAULT '',
        daily_budget INTEGER NOT NULL DEFAULT 0 CHECK (daily_budget >= 0),
        interactive_reserve_pct INTEGER NOT NULL DEFAULT 10 CHECK ((interactive_reserve_pct >= 0) AND (interactive_reserve_pct <= 50)),
        reset_time TEXT NOT NULL DEFAULT '00:00',
        reset_tz TEXT NOT NULL DEFAULT 'UTC',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_supply_accounts_key ON supply_accounts (provider, account_key) WHERE account_key <> '';
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_connectors (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        storefront TEXT NOT NULL DEFAULT '',
        display_name TEXT NOT NULL DEFAULT '',
        currency TEXT NOT NULL DEFAULT '',
        credential_envelope TEXT,
        credential_names JSONB NOT NULL DEFAULT '[]'::jsonb,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        paused_reason TEXT NOT NULL DEFAULT '',
        account_id TEXT NOT NULL REFERENCES supply_accounts(id),
        terms_reviewed_by TEXT NOT NULL DEFAULT '',
        terms_reviewed_at TIMESTAMPTZ,
        last_ok_at TIMESTAMPTZ,
        last_error_code TEXT NOT NULL DEFAULT '',
        last_error_at TIMESTAMPTZ,
        created_by TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        cooldown_until TIMESTAMPTZ,
        retention_days INTEGER CHECK ((retention_days >= 1) AND (retention_days <= 365)),
        keep_days INTEGER CHECK ((keep_days >= 1) AND (keep_days <= 3650)),
        keep_unused BOOLEAN NOT NULL DEFAULT FALSE,
        catalogue BOOLEAN NOT NULL DEFAULT FALSE,
        error_streak INTEGER NOT NULL DEFAULT 0,
        rate_limits JSONB NOT NULL DEFAULT '{}'::jsonb,
        rate_limits_at TIMESTAMPTZ,
        reset_from_provider BOOLEAN NOT NULL DEFAULT FALSE,
        block_streak INTEGER NOT NULL DEFAULT 0,
        UNIQUE (provider, storefront)
    );
    CREATE INDEX IF NOT EXISTS idx_supply_connectors_account ON supply_connectors (account_id);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_call_counts (
        connector_id TEXT NOT NULL REFERENCES supply_connectors(id) ON DELETE CASCADE,
        day DATE NOT NULL,
        hour SMALLINT NOT NULL CHECK ((hour >= 0) AND (hour <= 23)),
        kind TEXT NOT NULL,
        purpose TEXT NOT NULL,
        calls INTEGER NOT NULL DEFAULT 0 CHECK (calls >= 0),
        PRIMARY KEY (connector_id, day, hour, kind, purpose)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_connector_grants (
        connector_id TEXT PRIMARY KEY REFERENCES supply_connectors(id) ON DELETE CASCADE,
        envelope TEXT NOT NULL,
        access_expires_at TIMESTAMPTZ,
        refresh_expires_at TIMESTAMPTZ,
        granted_by TEXT NOT NULL,
        granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_error TEXT NOT NULL DEFAULT ''
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_csv_imports (
        connector_id TEXT PRIMARY KEY REFERENCES supply_connectors(id) ON DELETE CASCADE,
        filename TEXT NOT NULL DEFAULT '',
        imported_by TEXT NOT NULL,
        imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        row_count INTEGER NOT NULL CHECK (row_count >= 0)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_csv_offers (
        connector_id TEXT NOT NULL REFERENCES supply_connectors(id) ON DELETE CASCADE,
        sku TEXT NOT NULL,
        mpn TEXT NOT NULL,
        match_key TEXT NOT NULL,
        manufacturer TEXT NOT NULL,
        stock INTEGER NOT NULL CHECK (stock >= 0),
        currency TEXT NOT NULL DEFAULT '',
        moq INTEGER NOT NULL DEFAULT 1 CHECK (moq >= 1),
        order_multiple INTEGER NOT NULL DEFAULT 1 CHECK (order_multiple >= 1),
        packaging TEXT NOT NULL DEFAULT 'unknown',
        lead_time_days INTEGER CHECK ((lead_time_days IS NULL) OR (lead_time_days >= 0)),
        lifecycle TEXT NOT NULL DEFAULT 'unknown',
        discontinued BOOLEAN NOT NULL DEFAULT FALSE,
        rohs BOOLEAN,
        product_url TEXT NOT NULL DEFAULT '',
        incoming_qty INTEGER CHECK ((incoming_qty IS NULL) OR (incoming_qty >= 1)),
        incoming_date DATE,
        price_breaks JSONB NOT NULL DEFAULT '[]'::jsonb,
        jlc_library TEXT NOT NULL DEFAULT '',
        jlc_preferred BOOLEAN NOT NULL DEFAULT FALSE,
        -- When this row arrived: a push replaces some rows and keeps the rest, so each row carries its own age.
        fetched_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (connector_id, sku)
    );
    CREATE INDEX IF NOT EXISTS idx_supply_csv_offers_match ON supply_csv_offers (connector_id, match_key);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_fx_rates (
        day DATE NOT NULL,
        currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
        per_eur NUMERIC(20,8) NOT NULL CHECK (per_eur > (0)::numeric),
        source TEXT NOT NULL CHECK (source IN ('ecb', 'manual')),
        fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (day, currency)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_limit_marks (
        connector_id TEXT NOT NULL REFERENCES supply_connectors(id) ON DELETE CASCADE,
        at TIMESTAMPTZ NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('remaining', 'refused', 'ok')),
        remaining INTEGER,
        quota INTEGER,
        scope TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_supply_limit_marks_connector ON supply_limit_marks (connector_id, at);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_oauth_states (
        state TEXT PRIMARY KEY,
        connector_id TEXT NOT NULL REFERENCES supply_connectors(id) ON DELETE CASCADE,
        actor TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_push_tokens (
        target_kind TEXT NOT NULL CHECK (target_kind IN ('connector', 'inventory_source')),
        target_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        prefix TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ,
        PRIMARY KEY (target_kind, target_id)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_pace_state (
        pace_key TEXT PRIMARY KEY,
        next_at TIMESTAMPTZ NOT NULL,
        slow_until TIMESTAMPTZ
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_quota_ledger (
        account_id TEXT NOT NULL REFERENCES supply_accounts(id) ON DELETE CASCADE,
        day DATE NOT NULL,
        spent INTEGER NOT NULL DEFAULT 0 CHECK (spent >= 0),
        interactive_spent INTEGER NOT NULL DEFAULT 0,
        spare_spent INTEGER NOT NULL DEFAULT 0,
        scheduled_rest INTEGER NOT NULL DEFAULT 0,
        scheduled_at TIMESTAMPTZ,
        spare_hour INTEGER,
        spare_hour_spent INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (account_id, day),
        CONSTRAINT supply_quota_ledger_check CHECK ((interactive_spent >= 0) AND (interactive_spent <= spent))
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_task_runs (
        name TEXT PRIMARY KEY,
        started_at TIMESTAMPTZ,
        next_at TIMESTAMPTZ,
        last_ok_at TIMESTAMPTZ,
        last_error TEXT NOT NULL DEFAULT '',
        last_error_at TIMESTAMPTZ
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """,
)

FUNCTIONS: tuple[str, ...] = (
    # A connector inserted without an account is an account of its own (``accounts.py``).
    """
    CREATE OR REPLACE FUNCTION supply_connector_account() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        IF NEW.account_id IS NULL THEN
            INSERT INTO supply_accounts (id, provider) VALUES (NEW.id, NEW.provider) ON CONFLICT (id) DO NOTHING;
            NEW.account_id := NEW.id;
        END IF;
        RETURN NEW;
    END $$
    """,
    # An account goes with its last connector, and its ledger with it.
    """
    CREATE OR REPLACE FUNCTION supply_account_left() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        DELETE FROM supply_accounts a WHERE a.id = OLD.account_id
            AND NOT EXISTS (SELECT 1 FROM supply_connectors c WHERE c.account_id = a.id);
        RETURN NULL;
    END $$
    """,
)
TRIGGERS: tuple[str, ...] = (
    "CREATE OR REPLACE TRIGGER trg_supply_connector_account BEFORE INSERT ON supply_connectors "
    "FOR EACH ROW EXECUTE FUNCTION supply_connector_account()",
    "CREATE OR REPLACE TRIGGER trg_supply_account_left AFTER DELETE OR UPDATE OF account_id ON supply_connectors "
    "FOR EACH ROW EXECUTE FUNCTION supply_account_left()",
)
