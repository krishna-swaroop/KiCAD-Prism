"""What people follow and decide: watches, what needs a person and what they decided (attention, work items among it), alert
rules, ending components, tracked projects and their BOM usage, BOM notes and cost history, and release snapshots.
"""

from __future__ import annotations

TABLES: tuple[str, ...] = (
    """
    CREATE TABLE IF NOT EXISTS supply_alert_rules (
        part_id TEXT PRIMARY KEY REFERENCES supply_parts(id) ON DELETE CASCADE,
        price_rise_percent INTEGER,
        target_price NUMERIC(14,6),
        target_currency TEXT NOT NULL DEFAULT '',
        updated_by TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        likely_out_percent INTEGER
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_attention (
        id BIGSERIAL PRIMARY KEY,
        part_id TEXT REFERENCES supply_parts(id) ON DELETE CASCADE,
        component_id TEXT,
        kind TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT '',
        severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'fatal')),
        state TEXT NOT NULL CHECK (state IN ('pending', 'open', 'resolved')),
        first_seen_at TIMESTAMPTZ NOT NULL,
        seen_count INTEGER NOT NULL DEFAULT 1,
        opened_at TIMESTAMPTZ,
        last_event_at TIMESTAMPTZ NOT NULL,
        resolved_at TIMESTAMPTZ,
        detail JSONB NOT NULL DEFAULT '{}'::jsonb,
        title TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL DEFAULT '',
        owner TEXT NOT NULL DEFAULT '',
        disposition TEXT NOT NULL DEFAULT '' CHECK (disposition IN ('', 'accepted', 'rejected')),
        notes JSONB NOT NULL DEFAULT '[]'::jsonb,
        project_ids TEXT[] NOT NULL DEFAULT '{}'::text[],
        recheck_on DATE,
        created_by TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK ((part_id IS NULL) <> (component_id IS NULL))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_supply_attention_one_live_part ON supply_attention (part_id, kind) WHERE state <> 'resolved' AND kind <> 'work' AND part_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_supply_attention_one_live_component ON supply_attention (component_id, kind) WHERE state <> 'resolved' AND kind <> 'work' AND component_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_supply_attention_state ON supply_attention (state, last_event_at);
    CREATE INDEX IF NOT EXISTS idx_supply_attention_part ON supply_attention (part_id);
    CREATE INDEX IF NOT EXISTS idx_supply_attention_component ON supply_attention (component_id);
    CREATE INDEX IF NOT EXISTS idx_supply_attention_work ON supply_attention (state, recheck_on) WHERE kind = 'work';
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_attention_decisions (
        id TEXT PRIMARY KEY,
        attention_id BIGINT REFERENCES supply_attention(id) ON DELETE CASCADE,
        part_id TEXT REFERENCES supply_parts(id) ON DELETE CASCADE,
        component_id TEXT,
        kind TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT '',
        decision TEXT NOT NULL CHECK (decision IN ('acknowledge', 'snooze', 'dismiss', 'mute', 'waive', 'accept')),
        state TEXT NOT NULL DEFAULT 'approved' CHECK (state IN ('proposed', 'approved', 'rejected')),
        reason TEXT NOT NULL DEFAULT '',
        until TIMESTAMPTZ,
        made_by TEXT NOT NULL,
        made_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        decided_by TEXT NOT NULL DEFAULT '',
        decided_at TIMESTAMPTZ,
        CHECK ((part_id IS NULL) <> (component_id IS NULL)),
        CHECK ((attention_id IS NULL) = (decision NOT IN ('acknowledge', 'snooze')))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_supply_attention_decisions_row ON supply_attention_decisions (attention_id, decision) WHERE attention_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_supply_attention_decisions_part ON supply_attention_decisions (part_id, kind, decision)
        WHERE attention_id IS NULL AND part_id IS NOT NULL AND state <> 'rejected';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_supply_attention_decisions_component ON supply_attention_decisions (component_id, kind, decision)
        WHERE attention_id IS NULL AND component_id IS NOT NULL AND state <> 'rejected';
    CREATE INDEX IF NOT EXISTS idx_supply_attention_decisions_waiting ON supply_attention_decisions (state) WHERE state = 'proposed';
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_bom_comments (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        line_key TEXT NOT NULL,
        body TEXT NOT NULL,
        author TEXT NOT NULL,
        author_name TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_supply_bom_comments_project ON supply_bom_comments (project_id, line_key, created_at);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_bom_cost_history (
        project_id TEXT NOT NULL,
        variant TEXT NOT NULL DEFAULT '',
        day DATE NOT NULL,
        cost_per_board NUMERIC(14,4) NOT NULL,
        currency TEXT NOT NULL,
        lines INTEGER NOT NULL,
        lines_priced INTEGER NOT NULL,
        rollup JSONB NOT NULL DEFAULT '{}'::jsonb,
        build_quantity INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (project_id, variant, day)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_bom_usage_projects (
        project_id TEXT PRIMARY KEY,
        project_name TEXT NOT NULL,
        revision_key TEXT NOT NULL,
        line_count INTEGER NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        visible_roles TEXT[] NOT NULL DEFAULT '{admin,designer,qa}'::text[]
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_bom_usage (
        project_id TEXT NOT NULL REFERENCES supply_bom_usage_projects(project_id) ON DELETE CASCADE,
        -- The base design is ''; a named design variant has its own lines.
        variant TEXT NOT NULL DEFAULT '',
        line_key TEXT NOT NULL,
        manufacturer TEXT NOT NULL DEFAULT '',
        mpn TEXT NOT NULL,
        alias_key TEXT NOT NULL DEFAULT '',
        match_key TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity >= 1),
        refs TEXT NOT NULL DEFAULT '',
        lcsc TEXT NOT NULL DEFAULT '',
        datasheet TEXT NOT NULL DEFAULT '',
        prism_id TEXT NOT NULL DEFAULT '',
        -- The symbol's value and footprint, checked against the distributor's.
        value TEXT NOT NULL DEFAULT '',
        footprint TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (project_id, variant, line_key)
    );
    CREATE INDEX IF NOT EXISTS idx_supply_bom_usage_match ON supply_bom_usage (match_key);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_component_restrictions (
        component_id TEXT PRIMARY KEY,
        level TEXT NOT NULL CHECK (level IN ('not_for_new_designs', 'retired')),
        reason TEXT NOT NULL DEFAULT '',
        replacement_component_id TEXT NOT NULL DEFAULT '',
        set_by TEXT NOT NULL DEFAULT '',
        set_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_component_watches (
        component_id TEXT PRIMARY KEY,
        packaging TEXT NOT NULL DEFAULT 'any' CHECK (packaging IN ('any', 'cut_tape', 'tape_reel', 'tray', 'tube', 'bulk')),
        owner TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        tier SMALLINT NOT NULL DEFAULT 2 CHECK (tier IN (1, 2)),
        rate TEXT NOT NULL DEFAULT 'weekly' CHECK (rate IN ('daily', 'weekly', 'monthly'))
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_release_snapshot_jobs (
        build_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('queued', 'done', 'failed')),
        reason TEXT NOT NULL DEFAULT '',
        attempts INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_supply_release_snapshot_jobs_project ON supply_release_snapshot_jobs (project_id);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_release_snapshots (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        build_id TEXT NOT NULL UNIQUE,
        tag TEXT NOT NULL,
        commit_sha TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        health NUMERIC(3,1),
        status TEXT NOT NULL,
        assessment JSONB NOT NULL,
        compliance JSONB
    );
    CREATE INDEX IF NOT EXISTS idx_supply_release_snapshots_project ON supply_release_snapshots (project_id, created_at DESC);
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_tracked_projects (
        project_id TEXT PRIMARY KEY,
        variants TEXT[] NOT NULL DEFAULT '{""}'::text[],
        tracked_by TEXT NOT NULL,
        tracked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        excluded_ids TEXT[] NOT NULL DEFAULT '{}'::text[],
        assembly_ids TEXT[] NOT NULL DEFAULT '{}'::text[],
        all_variants BOOLEAN NOT NULL DEFAULT FALSE,
        packaging TEXT NOT NULL DEFAULT 'cut_tape',
        build_quantity INTEGER NOT NULL DEFAULT 100 CHECK ((build_quantity >= 1) AND (build_quantity <= 1000000)),
        spares TEXT
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS supply_watches (
        id TEXT PRIMARY KEY,
        part_id TEXT NOT NULL UNIQUE REFERENCES supply_parts(id) ON DELETE CASCADE,
        threshold INTEGER CHECK ((threshold IS NULL) OR (threshold >= 0)),
        pinned BOOLEAN NOT NULL DEFAULT FALSE,
        owner TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        packaging TEXT NOT NULL DEFAULT 'any' CHECK (packaging IN ('any', 'cut_tape', 'tape_reel', 'tray', 'tube', 'bulk')),
        tier SMALLINT NOT NULL DEFAULT 2 CHECK (tier IN (1, 2)),
        rate TEXT NOT NULL DEFAULT 'weekly' CHECK (rate IN ('daily', 'weekly', 'monthly')),
        origin TEXT NOT NULL DEFAULT 'person' CHECK (origin IN ('person', 'legacy'))
    );
    """,
)

# A release snapshot is evidence: it is never changed or removed.
FUNCTIONS: tuple[str, ...] = (
    """
    CREATE OR REPLACE FUNCTION supply_release_snapshots_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        RAISE EXCEPTION 'A release snapshot cannot be changed or removed';
    END;
    $$;
    """,
)

TRIGGERS: tuple[str, ...] = (
    "CREATE OR REPLACE TRIGGER trg_supply_release_snapshots_frozen BEFORE DELETE OR UPDATE ON supply_release_snapshots "
    "FOR EACH ROW EXECUTE FUNCTION supply_release_snapshots_frozen()",
)

# Supply rows about one catalog component must name a real one (and go if it is ever deleted). Made with the catalog's own steps
# (``create_catalog_links``), since a test's disposable schema has no ``components``.
COMPONENT_LINKS = ("supply_component_watches", "supply_component_restrictions", "supply_attention", "supply_attention_decisions")


def _component_link(table: str) -> str:
    name = f"{table}_component_id_fkey"
    return f"""
    DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{name}' AND conrelid = '{table}'::regclass) THEN
            ALTER TABLE {table} ADD CONSTRAINT {name} FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE;
        END IF;
    END $$;
    """


CATALOG_LINKS: tuple[str, ...] = tuple(_component_link(table) for table in COMPONENT_LINKS)
