"""Ordered registry of the workspace schema migrations.

Each body is frozen in its own module under ``app.services.workspace_migrations``;
this file only lists them in order. :mod:`app.services.schema_ledger` applies the
ones a database has not recorded in ``ws_schema_migrations``. Add a migration by
adding a module and one registry line.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.services.manufacturing_schema import MANUFACTURING_SCHEMA_SQL
from app.services.schema_ledger import Ledger, Renumbered, Step
from app.services.workspace_migrations import m000_base_tables
from app.services.workspace_migrations import m001_v3_job_foundation
from app.services.workspace_migrations import m002_workspace_read_versions
from app.services.workspace_migrations import m003_git_read_cache
from app.services.workspace_migrations import m004_webgpu_ready_metadata
from app.services.workspace_migrations import m005_thumbnail_metadata
from app.services.workspace_migrations import m006_thumbnail_source
from app.services.workspace_migrations import m007_generated_thumbnail_default
from app.services.workspace_migrations import m008_release_studio
from app.services.workspace_migrations import m013_release_studio_build_projections
from app.services.workspace_migrations import m014_release_studio_waiver_build_scope
from app.services.workspace_migrations import m015_release_studio_configuration_snapshot
from app.services.workspace_migrations import m016_release_studio_append_only_evaluations
from app.services.workspace_migrations import m017_release_studio_terminal_and_identity_guards
from app.services.workspace_migrations import m018_release_studio_source_defaults
from app.services.workspace_migrations import m019_release_studio_project_signoff
from app.services.workspace_migrations import m020_project_file_anchor
from app.services.workspace_migrations import m021_project_metadata
from app.services.workspace_migrations import m022_project_metadata_repository
from app.services.workspace_migrations import m024_tracker_connector_delete_cascade
from app.services.workspace_migrations import m025_tracker_webhook_oauth
from app.services.trackers import migrations as tracker_migrations
from app.services.workspace_migrations import m041_repository_origin
from app.services.workspace_migrations import m055_project_path_settings
from app.services.workspace_migrations import m056_release_studio_model_inputs
from app.services.workspace_migrations import m057_job_retention_indexes
from app.services.workspace_migrations import m100_design_bundle_commit_index
from app.services.workspace_migrations import m101_design_bundles
from app.services.workspace_migrations import m102_design_bundle_outcomes
from app.services.workspace_migrations import m103_design_bundle_aliases
from app.services.workspace_migrations import m118_design_bundle_design_keys
from app.services.workspace_migrations import m120_sim_studio_setups
from app.services.workspace_migrations import m121_sim_studio_runs
from app.services.workspace_migrations import m122_sim_studio_layouts
from app.services.workspace_migrations import m123_drop_system_builder_v1
from app.services.workspace_migrations import m124_drop_mesh_viewer_readiness
from app.services.workspace_migrations import m129_drop_system_builder_v2
from app.services.workspace_migrations import m130_sim_run_solved_commit
from app.services.workspace_migrations import m131_idempotency_keys
from app.services.workspace_migrations import m132_workspace_events
from app.services.workspace_migrations import m133_personal_access_tokens
from app.services.workspace_migrations import m134_mcp_grants
from app.services.workspace_migrations import m135_mcp_governance
from app.services.workspace_migrations import m136_mcp_audit
from app.services.workspace_migrations import m137_webhooks
from app.services.workspace_migrations import m138_token_audit
from app.services.workspace_migrations import m139_ops_instrumentation
from app.services.workspace_migrations import m140_ops_workers_settings
from app.services.workspace_migrations import m141_pg_stat_statements
from app.services.workspace_migrations import m142_ops_profiles


Migration = Callable[[Any], None]

def _manufacturing_spec_config(conn: Any) -> None:
    """Create the manufacturing tables (if absent) and add the board specs' spec-schema column.

    The workspace schema used to be created by ``_create_schema``, which held the
    manufacturing tables. The ledger replaced it, so the first manufacturing step
    creates them all. Every statement is IF NOT EXISTS, so a database that already
    has them (made by ``_create_schema``) is unchanged, and the later steps, which
    ALTER them, find their tables on a fresh database.
    """
    conn.execute(MANUFACTURING_SCHEMA_SQL, prepare=False)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_board_specs (
            project_id      TEXT PRIMARY KEY REFERENCES ws_projects(id) ON DELETE CASCADE,
            specs           JSONB NOT NULL DEFAULT '{}'::jsonb,
            source          JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_by      TEXT NOT NULL DEFAULT ''
        )
        """
    )
    conn.execute(
        "ALTER TABLE ws_board_specs ADD COLUMN IF NOT EXISTS spec_config TEXT NOT NULL DEFAULT ''"
    )


def _manufacturing_spec_templates(conn: Any) -> None:
    """Add the manufacturers, runs and manufacturer-scoped spec-template tables.

    ws_manufacturers and ws_manufacturing_runs are created here too (as well as in
    _create_schema) so the later manufacturing migrations, which ALTER them, are
    self-contained for a database that runs the ladder without _create_schema.
    All IF NOT EXISTS, so a fresh database is a no-op.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_manufacturers (
            id           TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            contact      TEXT NOT NULL DEFAULT '',
            website      TEXT NOT NULL DEFAULT '',
            notes        TEXT NOT NULL DEFAULT '',
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_manufacturing_runs (
            id               TEXT PRIMARY KEY,
            project_id       TEXT NOT NULL REFERENCES ws_projects(id) ON DELETE CASCADE,
            manufacturer_id  TEXT REFERENCES ws_manufacturers(id) ON DELETE SET NULL,
            commit_sha       TEXT NOT NULL DEFAULT '',
            quantity_ordered INTEGER NOT NULL DEFAULT 0,
            quantity_good    INTEGER NOT NULL DEFAULT 0,
            status           TEXT NOT NULL DEFAULT 'draft',
            notes            TEXT NOT NULL DEFAULT '',
            spec_snapshot    JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_by       TEXT NOT NULL DEFAULT '',
            created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_spec_templates (
            id              TEXT PRIMARY KEY,
            manufacturer_id TEXT NOT NULL REFERENCES ws_manufacturers(id) ON DELETE CASCADE,
            name            TEXT NOT NULL,
            spec_config     TEXT NOT NULL DEFAULT '',
            created_at      TIMESTAMPTZ NOT NULL,
            updated_at      TIMESTAMPTZ NOT NULL
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ws_spec_templates_mfr ON ws_spec_templates(manufacturer_id)"
    )


def _manufacturing_active_sections(conn: Any) -> None:
    """Track which optional spec sections a project has switched on."""
    conn.execute(
        "ALTER TABLE ws_board_specs ADD COLUMN IF NOT EXISTS active_sections JSONB NOT NULL DEFAULT '[]'::jsonb"
    )


def _manufacturing_builtin_templates(conn: Any) -> None:
    """Track which spec templates are built-in and what source they were seeded from.

    Lets startup refresh an untouched built-in template to the latest source while
    leaving a user-edited one alone. Existing seeded rows get no key, so they are
    treated as user templates until the backfill in seed_builtin_manufacturers
    claims them by name+manufacturer.
    """
    conn.execute("ALTER TABLE ws_spec_templates ADD COLUMN IF NOT EXISTS builtin_key TEXT")
    conn.execute("ALTER TABLE ws_spec_templates ADD COLUMN IF NOT EXISTS seeded_hash TEXT")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ws_spec_templates_builtin ON ws_spec_templates(builtin_key)"
    )


def _manufacturing_run_release_tag(conn: Any) -> None:
    """Record the tagged release a run was built from, as a first-class field."""
    conn.execute(
        "ALTER TABLE ws_manufacturing_runs ADD COLUMN IF NOT EXISTS release_tag TEXT NOT NULL DEFAULT ''"
    )


def _manufacturing_project_manufacturers_and_specs(conn: Any) -> None:
    """Attach manufacturers to projects and give each (project, manufacturer) its
    own named fabrication specs.

    A board is quoted by several manufacturers, each needing its own spec. These
    tables replace the "one board spec per project" assumption for run purposes;
    ws_board_specs stays as the project board profile the extractor/PDF use.
    Created idempotently so a fresh database (where _create_schema already made
    them) is a no-op.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_project_manufacturers (
            project_id      TEXT NOT NULL REFERENCES ws_projects(id) ON DELETE CASCADE,
            manufacturer_id TEXT NOT NULL REFERENCES ws_manufacturers(id) ON DELETE CASCADE,
            created_at      TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (project_id, manufacturer_id)
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ws_project_mfrs_project ON ws_project_manufacturers(project_id)"
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_project_specs (
            id              TEXT PRIMARY KEY,
            project_id      TEXT NOT NULL REFERENCES ws_projects(id) ON DELETE CASCADE,
            manufacturer_id TEXT NOT NULL REFERENCES ws_manufacturers(id) ON DELETE CASCADE,
            name            TEXT NOT NULL,
            spec_config     TEXT NOT NULL DEFAULT '',
            specs           JSONB NOT NULL DEFAULT '{}'::jsonb,
            source          JSONB NOT NULL DEFAULT '{}'::jsonb,
            active_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
            updated_at      TIMESTAMPTZ NOT NULL,
            updated_by      TEXT NOT NULL DEFAULT ''
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ws_project_specs_scope ON ws_project_specs(project_id, manufacturer_id)"
    )
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_project_specs_name
            ON ws_project_specs(project_id, manufacturer_id, lower(name))
        """
    )


def _manufacturing_run_spec_id(conn: Any) -> None:
    """Link a run to the named spec it was ordered against (nullable; the frozen
    spec_snapshot remains the durable picture)."""
    conn.execute(
        "ALTER TABLE ws_manufacturing_runs ADD COLUMN IF NOT EXISTS spec_id TEXT REFERENCES ws_project_specs(id) ON DELETE SET NULL"
    )


def _manufacturing_manufacturer_capabilities(conn: Any) -> None:
    """Store a manufacturer's fabrication capabilities (KiCad rule fields) as JSONB."""
    conn.execute(
        "ALTER TABLE ws_manufacturers ADD COLUMN IF NOT EXISTS capabilities JSONB NOT NULL DEFAULT '{}'::jsonb"
    )


def _manufacturing_capabilities_per_template(conn: Any) -> None:
    """Move capabilities from the vendor to the fabrication method: each spec
    template carries its own capabilities, and a project spec links to the
    template it was created from. The vendor-level column is dropped."""
    conn.execute(
        "ALTER TABLE ws_spec_templates ADD COLUMN IF NOT EXISTS capabilities JSONB NOT NULL DEFAULT '{}'::jsonb"
    )
    conn.execute(
        "ALTER TABLE ws_project_specs ADD COLUMN IF NOT EXISTS template_id TEXT REFERENCES ws_spec_templates(id) ON DELETE SET NULL"
    )
    conn.execute(
        "ALTER TABLE ws_manufacturers DROP COLUMN IF EXISTS capabilities"
    )


def _manufacturing_run_job_number(conn: Any) -> None:
    """Give each production run a human-readable job number (JOB-YYYY-NNNN).

    A workspace-wide sequence supplies the running count; the year comes from the
    run's creation date. Existing rows are backfilled in creation order so numbers
    are stable and unique. New rows get theirs at insert time in the service.
    """
    conn.execute("ALTER TABLE ws_manufacturing_runs ADD COLUMN IF NOT EXISTS job_number TEXT")
    conn.execute("CREATE SEQUENCE IF NOT EXISTS ws_manufacturing_job_seq")
    # Backfill: number rows without one, oldest first, using each row's own year.
    conn.execute(
        """
        WITH ordered AS (
            SELECT id, created_at,
                   nextval('ws_manufacturing_job_seq') AS seq
            FROM (
                SELECT id, created_at FROM ws_manufacturing_runs
                WHERE job_number IS NULL OR job_number = ''
                ORDER BY created_at, id
            ) q
        )
        UPDATE ws_manufacturing_runs r
        SET job_number = 'JOB-' || to_char(o.created_at, 'YYYY') || '-'
                         || lpad(o.seq::text, 4, '0')
        FROM ordered o
        WHERE r.id = o.id
        """
    )
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_mfg_runs_job_number ON ws_manufacturing_runs(job_number)"
    )


def _manufacturing_capability_meta(conn: Any) -> None:
    """Label/unit metadata for custom capabilities a template records beyond the
    KiCad-tracked rule fields. Keyed by capability key; KiCad-tracked keys get
    their label/unit from PCB_RULE_FIELDS and need no entry here."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS ws_spec_templates (id TEXT PRIMARY KEY)"
    )
    conn.execute(
        "ALTER TABLE ws_spec_templates ADD COLUMN IF NOT EXISTS capability_meta JSONB NOT NULL DEFAULT '{}'::jsonb"
    )


def _manufacturing_capability_config(conn: Any) -> None:
    """The editable source of a template's capabilities: the same .config text as
    a spec schema, where each capability is a field whose default is the minimum.
    The capabilities/capability_meta maps are derived from this on save."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS ws_spec_templates (id TEXT PRIMARY KEY)"
    )
    conn.execute(
        "ALTER TABLE ws_spec_templates ADD COLUMN IF NOT EXISTS capability_config TEXT NOT NULL DEFAULT ''"
    )


def _manufacturing_one_spec_per_manufacturer(conn: Any) -> None:
    """Collapse to one project spec per (project, manufacturer).

    Keep the spec a run references (else the most recently updated), delete the
    rest, then enforce it with a unique index. Runs keep their frozen snapshot,
    so removing an extra spec never changes what a past run was ordered as.
    """
    conn.execute(
        """
        WITH ranked AS (
            SELECT s.id, s.project_id, s.manufacturer_id,
                   ROW_NUMBER() OVER (
                       PARTITION BY s.project_id, s.manufacturer_id
                       ORDER BY
                           (EXISTS (SELECT 1 FROM ws_manufacturing_runs r
                                    WHERE r.spec_id = s.id)) DESC,
                           s.updated_at DESC, s.id DESC
                   ) AS rn
            FROM ws_project_specs s
        )
        DELETE FROM ws_project_specs
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
        """
    )
    conn.execute("DROP INDEX IF EXISTS idx_ws_project_specs_name")
    conn.execute(
        """CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_project_specs_one_per_mfr
           ON ws_project_specs(project_id, manufacturer_id)"""
    )


def _manufacturing_defect_disposition(conn: Any) -> None:
    """Who closed a defect and why: a note on resolve, a required reason on
    accept-as-is, and the person who did it."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS ws_run_defects (id TEXT PRIMARY KEY)"
    )
    conn.execute(
        "ALTER TABLE ws_run_defects ADD COLUMN IF NOT EXISTS resolution_note TEXT NOT NULL DEFAULT ''"
    )
    conn.execute(
        "ALTER TABLE ws_run_defects ADD COLUMN IF NOT EXISTS resolved_by TEXT NOT NULL DEFAULT ''"
    )


MIGRATIONS: tuple[tuple[int, str, Migration], ...] = (
    (0, "base_tables", m000_base_tables.migrate),
    (1, "v3_job_foundation", m001_v3_job_foundation.migrate),
    (2, "workspace_read_versions", m002_workspace_read_versions.migrate),
    (3, "git_read_cache", m003_git_read_cache.migrate),
    (4, "webgpu_ready_metadata", m004_webgpu_ready_metadata.migrate),
    (5, "thumbnail_metadata", m005_thumbnail_metadata.migrate),
    (6, "thumbnail_source", m006_thumbnail_source.migrate),
    (7, "generated_thumbnail_default", m007_generated_thumbnail_default.migrate),
    (8, "release_studio", m008_release_studio.migrate),
    (13, "release_studio_build_projections", m013_release_studio_build_projections.migrate),
    (14, "release_studio_waiver_build_scope", m014_release_studio_waiver_build_scope.migrate),
    (15, "release_studio_configuration_snapshot", m015_release_studio_configuration_snapshot.migrate),
    (16, "release_studio_append_only_evaluations", m016_release_studio_append_only_evaluations.migrate),
    (17, "release_studio_terminal_and_identity_guards", m017_release_studio_terminal_and_identity_guards.migrate),
    (18, "release_studio_source_defaults", m018_release_studio_source_defaults.migrate),
    (19, "release_studio_project_signoff", m019_release_studio_project_signoff.migrate),
    (20, "project_file_anchor", m020_project_file_anchor.migrate),
    (21, "project_metadata", m021_project_metadata.migrate),
    (22, "project_metadata_repository", m022_project_metadata_repository.migrate),
    (23, tracker_migrations.WORKSPACE_MIGRATION_NAME, tracker_migrations.migrate),
    (24, tracker_migrations.WORKSPACE_FK_CASCADE_NAME, m024_tracker_connector_delete_cascade.migrate),
    (25, tracker_migrations.WORKSPACE_WEBHOOK_OAUTH_NAME, m025_tracker_webhook_oauth.migrate),
    (41, "repository_origin", m041_repository_origin.migrate),
    (55, "project_path_settings", m055_project_path_settings.migrate),
    (56, "release_studio_model_inputs", m056_release_studio_model_inputs.migrate),
    (57, "job_retention_indexes", m057_job_retention_indexes.migrate),
    # 100-103 and 118: the design bundle (WP-K; reserved block, native/contracts/prism/ownership.md §5).
    (100, "design_bundle_commit_index", m100_design_bundle_commit_index.migrate),
    (101, "design_bundles", m101_design_bundles.migrate),
    (102, "design_bundle_outcomes", m102_design_bundle_outcomes.migrate),
    (103, "design_bundle_aliases", m103_design_bundle_aliases.migrate),
    (118, "design_bundle_design_keys", m118_design_bundle_design_keys.migrate),
    (120, "sim_studio_setups", m120_sim_studio_setups.migrate),
    (121, "sim_studio_runs", m121_sim_studio_runs.migrate),
    (122, "sim_studio_layouts", m122_sim_studio_layouts.migrate),
    # 26-54 (but 41) were System Builder v1; 123 drops what they made.
    (123, "drop_system_builder_v1", m123_drop_system_builder_v1.migrate),
    (124, "drop_mesh_viewer_readiness", m124_drop_mesh_viewer_readiness.migrate),
    # 125-128 were System Builder v2; 129 drops what they made.
    (129, "drop_system_builder_v2", m129_drop_system_builder_v2.migrate),
    (130, "sim_run_solved_commit", m130_sim_run_solved_commit.migrate),
    (131, "idempotency_keys", m131_idempotency_keys.migrate),
    (132, "workspace_events", m132_workspace_events.migrate),
    (133, "personal_access_tokens", m133_personal_access_tokens.migrate),
    (134, "mcp_grants", m134_mcp_grants.migrate),
    (135, "mcp_governance", m135_mcp_governance.migrate),
    (136, "mcp_audit", m136_mcp_audit.migrate),
    (137, "webhooks", m137_webhooks.migrate),
    (138, "token_audit", m138_token_audit.migrate),
    (139, "ops_instrumentation", m139_ops_instrumentation.migrate),
    (140, "ops_workers_settings", m140_ops_workers_settings.migrate),
    (141, "pg_stat_statements", m141_pg_stat_statements.migrate),
    (142, "ops_profiles", m142_ops_profiles.migrate),
    # 143-156: manufacturing. They sat at 26-39, then 55-68; dev took 55-57 and 100-142, so they follow its head.
    (143, "manufacturing_spec_config", _manufacturing_spec_config),
    (144, "manufacturing_spec_templates", _manufacturing_spec_templates),
    (145, "manufacturing_active_sections", _manufacturing_active_sections),
    (146, "manufacturing_builtin_templates", _manufacturing_builtin_templates),
    (147, "manufacturing_run_release_tag", _manufacturing_run_release_tag),
    (148, "manufacturing_project_manufacturers_and_specs", _manufacturing_project_manufacturers_and_specs),
    (149, "manufacturing_run_spec_id", _manufacturing_run_spec_id),
    (150, "manufacturing_manufacturer_capabilities", _manufacturing_manufacturer_capabilities),
    (151, "manufacturing_capabilities_per_template", _manufacturing_capabilities_per_template),
    (152, "manufacturing_run_job_number", _manufacturing_run_job_number),
    (153, "manufacturing_capability_meta", _manufacturing_capability_meta),
    (154, "manufacturing_capability_config", _manufacturing_capability_config),
    (155, "manufacturing_one_spec_per_manufacturer", _manufacturing_one_spec_per_manufacturer),
    (156, "manufacturing_defect_disposition", _manufacturing_defect_disposition),
)

# Migrations that a long-lived branch database recorded under an earlier number.
RENUMBERED: tuple[tuple[str, int, int], ...] = (
    ("repository_origin", 26, 41),
    # Simulation Studio's first deployment recorded its migrations as 9056-9058.
    ("sim_studio_setups", 9056, 120),
    ("sim_studio_runs", 9057, 121),
    ("sim_studio_layouts", 9058, 122),
    ("manufacturing_spec_config", 26, 143),
    ("manufacturing_spec_config", 55, 143),
    ("manufacturing_spec_config", 9055, 143),
    ("manufacturing_spec_templates", 27, 144),
    ("manufacturing_spec_templates", 56, 144),
    ("manufacturing_spec_templates", 9056, 144),
    ("manufacturing_active_sections", 28, 145),
    ("manufacturing_active_sections", 57, 145),
    ("manufacturing_active_sections", 9057, 145),
    ("manufacturing_builtin_templates", 29, 146),
    ("manufacturing_builtin_templates", 58, 146),
    ("manufacturing_builtin_templates", 9058, 146),
    ("manufacturing_run_release_tag", 30, 147),
    ("manufacturing_run_release_tag", 59, 147),
    ("manufacturing_run_release_tag", 9059, 147),
    ("manufacturing_project_manufacturers_and_specs", 31, 148),
    ("manufacturing_project_manufacturers_and_specs", 60, 148),
    ("manufacturing_project_manufacturers_and_specs", 9060, 148),
    ("manufacturing_run_spec_id", 32, 149),
    ("manufacturing_run_spec_id", 61, 149),
    ("manufacturing_run_spec_id", 9061, 149),
    ("manufacturing_manufacturer_capabilities", 33, 150),
    ("manufacturing_manufacturer_capabilities", 62, 150),
    ("manufacturing_manufacturer_capabilities", 9062, 150),
    ("manufacturing_capabilities_per_template", 34, 151),
    ("manufacturing_capabilities_per_template", 63, 151),
    ("manufacturing_capabilities_per_template", 9063, 151),
    ("manufacturing_run_job_number", 35, 152),
    ("manufacturing_run_job_number", 64, 152),
    ("manufacturing_run_job_number", 9064, 152),
    ("manufacturing_capability_meta", 36, 153),
    ("manufacturing_capability_meta", 65, 153),
    ("manufacturing_capability_meta", 9065, 153),
    ("manufacturing_capability_config", 37, 154),
    ("manufacturing_capability_config", 66, 154),
    ("manufacturing_capability_config", 9066, 154),
    ("manufacturing_one_spec_per_manufacturer", 38, 155),
    ("manufacturing_one_spec_per_manufacturer", 67, 155),
    ("manufacturing_one_spec_per_manufacturer", 9067, 155),
    ("manufacturing_defect_disposition", 39, 156),
    ("manufacturing_defect_disposition", 68, 156),
    ("manufacturing_defect_disposition", 9068, 156),
)


WORKSPACE_LEDGER = Ledger(
    name="workspace",
    schema="workspace",
    table="ws_schema_migrations",
    steps=tuple(Step(version, name, body) for version, name, body in MIGRATIONS),
    renumbered=tuple(Renumbered(name, old, new) for name, old, new in RENUMBERED),
)
