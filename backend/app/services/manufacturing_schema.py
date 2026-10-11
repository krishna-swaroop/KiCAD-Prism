"""Manufacturing tables (manufacturers, specs, runs, defects) for the workspace schema."""

MANUFACTURING_SCHEMA_SQL = """
            CREATE TABLE IF NOT EXISTS ws_manufacturers (
                id           TEXT PRIMARY KEY,
                name         TEXT NOT NULL,
                contact      TEXT NOT NULL DEFAULT '',
                website      TEXT NOT NULL DEFAULT '',
                notes        TEXT NOT NULL DEFAULT '',
                created_at   TIMESTAMPTZ NOT NULL,
                updated_at   TIMESTAMPTZ NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ws_board_specs (
                project_id      TEXT PRIMARY KEY REFERENCES ws_projects(id) ON DELETE CASCADE,
                specs           JSONB NOT NULL DEFAULT '{}'::jsonb,
                source          JSONB NOT NULL DEFAULT '{}'::jsonb,
                spec_config     TEXT NOT NULL DEFAULT '',
                active_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
                updated_at      TIMESTAMPTZ NOT NULL,
                updated_by      TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS ws_manufacturing_runs (
                id               TEXT PRIMARY KEY,
                project_id       TEXT NOT NULL REFERENCES ws_projects(id) ON DELETE CASCADE,
                manufacturer_id  TEXT REFERENCES ws_manufacturers(id) ON DELETE SET NULL,
                commit_sha       TEXT NOT NULL DEFAULT '',
                release_tag      TEXT NOT NULL DEFAULT '',
                -- Which named spec the run was ordered against. The FK to
                -- ws_project_specs is added by migration 26 (that table is created
                -- below/after this one), so it is a plain column here; the frozen
                -- spec_snapshot is the durable picture either way.
                spec_id          TEXT,
                -- Human-readable job number (JOB-YYYY-NNNN); assigned at insert
                -- from the sequence below. Migration 29 adds both for existing DBs.
                job_number       TEXT,
                quantity_ordered INTEGER NOT NULL DEFAULT 0,
                quantity_good    INTEGER NOT NULL DEFAULT 0,
                status           TEXT NOT NULL DEFAULT 'draft',
                notes            TEXT NOT NULL DEFAULT '',
                spec_snapshot    JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_by       TEXT NOT NULL DEFAULT '',
                created_at       TIMESTAMPTZ NOT NULL,
                updated_at       TIMESTAMPTZ NOT NULL
            );
            CREATE SEQUENCE IF NOT EXISTS ws_manufacturing_job_seq;
            CREATE INDEX IF NOT EXISTS idx_ws_mfg_runs_project ON ws_manufacturing_runs(project_id);
            CREATE INDEX IF NOT EXISTS idx_ws_mfg_runs_status  ON ws_manufacturing_runs(status);
            -- The job_number unique index lives in migration 29, so it never runs
            -- against an existing table before that migration adds the column.

            CREATE TABLE IF NOT EXISTS ws_spec_templates (
                id              TEXT PRIMARY KEY,
                manufacturer_id TEXT NOT NULL REFERENCES ws_manufacturers(id) ON DELETE CASCADE,
                name            TEXT NOT NULL,
                spec_config     TEXT NOT NULL DEFAULT '',
                -- Fabrication capabilities for this method (KiCad rule fields);
                -- added by migration 28 too.
                capabilities    JSONB NOT NULL DEFAULT '{}'::jsonb,
                -- Label/unit metadata for custom capabilities beyond the KiCad
                -- rule fields; keyed by capability key. Added by migration 30 too.
                capability_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
                -- Editable .config text for capabilities; the two JSONB maps
                -- above are derived from it on save. Added by migration 31 too.
                capability_config TEXT NOT NULL DEFAULT '',
                -- Identifies a built-in template (e.g. 'jlcpcb:standard'); NULL for
                -- user-created ones. seeded_hash is the sha256 of the source text it
                -- was last seeded from, so startup can tell an untouched built-in
                -- (safe to refresh) from one the user edited (leave alone). Both are
                -- added by migration 23 as well, for databases predating them; the
                -- builtin_key index lives there too so it never runs before the column.
                builtin_key     TEXT,
                seeded_hash     TEXT,
                created_at      TIMESTAMPTZ NOT NULL,
                updated_at      TIMESTAMPTZ NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_ws_spec_templates_mfr ON ws_spec_templates(manufacturer_id);

            CREATE TABLE IF NOT EXISTS ws_run_defects (
                id                TEXT PRIMARY KEY,
                run_id            TEXT NOT NULL REFERENCES ws_manufacturing_runs(id) ON DELETE CASCADE,
                category          TEXT NOT NULL DEFAULT 'other',
                severity          TEXT NOT NULL DEFAULT 'minor',
                quantity_affected INTEGER NOT NULL DEFAULT 1,
                description       TEXT NOT NULL DEFAULT '',
                status            TEXT NOT NULL DEFAULT 'open',
                evidence          JSONB NOT NULL DEFAULT '[]'::jsonb,
                logged_by         TEXT NOT NULL DEFAULT '',
                created_at        TIMESTAMPTZ NOT NULL,
                resolved_at       TIMESTAMPTZ
            );
            CREATE INDEX IF NOT EXISTS idx_ws_run_defects_run ON ws_run_defects(run_id);

            -- A project's attached manufacturers (from the global directory), and
            -- the named fabrication specs each (project, manufacturer) holds. A run
            -- picks a manufacturer scoped to its project, then one of these specs.
            CREATE TABLE IF NOT EXISTS ws_project_manufacturers (
                project_id      TEXT NOT NULL REFERENCES ws_projects(id) ON DELETE CASCADE,
                manufacturer_id TEXT NOT NULL REFERENCES ws_manufacturers(id) ON DELETE CASCADE,
                created_at      TIMESTAMPTZ NOT NULL,
                PRIMARY KEY (project_id, manufacturer_id)
            );
            CREATE INDEX IF NOT EXISTS idx_ws_project_mfrs_project ON ws_project_manufacturers(project_id);

            CREATE TABLE IF NOT EXISTS ws_project_specs (
                id              TEXT PRIMARY KEY,
                project_id      TEXT NOT NULL REFERENCES ws_projects(id) ON DELETE CASCADE,
                manufacturer_id TEXT NOT NULL REFERENCES ws_manufacturers(id) ON DELETE CASCADE,
                -- The template this spec was created from, if any. Capabilities are
                -- read live from it. Added by migration 28 too. ON DELETE SET NULL so
                -- deleting a template does not delete project specs built from it.
                template_id     TEXT REFERENCES ws_spec_templates(id) ON DELETE SET NULL,
                name            TEXT NOT NULL,
                spec_config     TEXT NOT NULL DEFAULT '',
                specs           JSONB NOT NULL DEFAULT '{}'::jsonb,
                source          JSONB NOT NULL DEFAULT '{}'::jsonb,
                active_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
                updated_at      TIMESTAMPTZ NOT NULL,
                updated_by      TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_ws_project_specs_scope ON ws_project_specs(project_id, manufacturer_id);
            -- One spec per (project, manufacturer); migration 32 enforces this too.
            CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_project_specs_one_per_mfr
                ON ws_project_specs(project_id, manufacturer_id);
"""
