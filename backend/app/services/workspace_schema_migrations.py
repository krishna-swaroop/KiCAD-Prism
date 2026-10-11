"""Ordered registry and runner for the workspace schema migrations.

Each body is frozen in its own module under ``app.services.workspace_migrations``;
this file only lists them in order and applies the ones a database has not
recorded yet. Add a migration by adding a module and one registry line.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

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
from app.services.workspace_migrations import m026_system_builder
from app.services.workspace_migrations import m027_system_workspace_version
from app.services.workspace_migrations import m028_system_review_pending_changes
from app.services.workspace_migrations import m029_system_import_sessions
from app.services.workspace_migrations import m030_system_snapshot_manifest
from app.services.workspace_migrations import m031_system_exports
from app.services.workspace_migrations import m032_system_catalog_binding
from app.services.workspace_migrations import m033_system_catalog_instances
from app.services.workspace_migrations import m034_system_child_reviews
from app.services.workspace_migrations import m035_system_optional_rules
from app.services.workspace_migrations import m036_system_port_mating
from app.services.workspace_migrations import m037_system_link_types
from app.services.workspace_migrations import m038_system_harnesses
from app.services.workspace_migrations import m039_system_harness_part_pins
from app.services.workspace_migrations import m040_system_poses
from app.services.trackers import migrations as tracker_migrations
from app.services.workspace_migrations import m041_repository_origin
from app.services.workspace_migrations import m042_system_archive
from app.services.workspace_migrations import m043_system_driving_mates
from app.services.workspace_migrations import m044_system_harness_nodes
from app.services.workspace_migrations import m045_system_git
from app.services.workspace_migrations import m046_system_manifest_reviews
from app.services.workspace_migrations import m047_system_bundle_frames
from app.services.workspace_migrations import m048_system_finding_waivers
from app.services.workspace_migrations import m049_system_finding_counts
from app.services.workspace_migrations import m050_system_subports
from app.services.workspace_migrations import m051_system_net_renames
from app.services.workspace_migrations import m052_system_parts_collisions
from app.services.workspace_migrations import m053_system_step_exports
from app.services.workspace_migrations import m054_system_harness_outputs


logger = logging.getLogger(__name__)

Migration = Callable[[Any], None]

def _manufacturing_spec_config(conn: Any) -> None:
    """Create the board-specs table (if absent) and add its spec-schema column.

    The manufacturing tables are also created in _create_schema; creating the base
    table here too makes this migration self-contained, so a database that runs
    the migration ladder without _create_schema (some test harnesses) does not
    fail on the ALTER. IF NOT EXISTS keeps everything a no-op on a fresh database.
    """
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
    (26, "system_builder", m026_system_builder.migrate),
    (27, "system_workspace_version", m027_system_workspace_version.migrate),
    (28, "system_review_pending_changes", m028_system_review_pending_changes.migrate),
    (29, "system_import_sessions", m029_system_import_sessions.migrate),
    (30, "system_snapshot_manifest", m030_system_snapshot_manifest.migrate),
    (31, "system_exports", m031_system_exports.migrate),
    (32, "system_catalog_binding", m032_system_catalog_binding.migrate),
    (33, "system_catalog_instances", m033_system_catalog_instances.migrate),
    (34, "system_child_reviews", m034_system_child_reviews.migrate),
    (35, "system_optional_rules", m035_system_optional_rules.migrate),
    (36, "system_port_mating", m036_system_port_mating.migrate),
    (37, "system_link_types", m037_system_link_types.migrate),
    (38, "system_harnesses", m038_system_harnesses.migrate),
    (39, "system_harness_part_pins", m039_system_harness_part_pins.migrate),
    (40, "system_poses", m040_system_poses.migrate),
    (41, "repository_origin", m041_repository_origin.migrate),
    (42, "system_archive", m042_system_archive.migrate),
    (43, "system_driving_mates", m043_system_driving_mates.migrate),
    (44, "system_harness_nodes", m044_system_harness_nodes.migrate),
    (45, "system_git", m045_system_git.migrate),
    (46, "system_manifest_reviews", m046_system_manifest_reviews.migrate),
    (47, "system_bundle_frames", m047_system_bundle_frames.migrate),
    (48, "system_finding_waivers", m048_system_finding_waivers.migrate),
    (49, "system_finding_counts", m049_system_finding_counts.migrate),
    (50, "system_subports", m050_system_subports.migrate),
    (51, "system_net_renames", m051_system_net_renames.migrate),
    (52, "system_parts_collisions", m052_system_parts_collisions.migrate),
    (53, "system_step_exports", m053_system_step_exports.migrate),
    (54, "system_harness_outputs", m054_system_harness_outputs.migrate),
    (55, "manufacturing_spec_config", _manufacturing_spec_config),
    (56, "manufacturing_spec_templates", _manufacturing_spec_templates),
    (57, "manufacturing_active_sections", _manufacturing_active_sections),
    (58, "manufacturing_builtin_templates", _manufacturing_builtin_templates),
    (59, "manufacturing_run_release_tag", _manufacturing_run_release_tag),
    (60, "manufacturing_project_manufacturers_and_specs", _manufacturing_project_manufacturers_and_specs),
    (61, "manufacturing_run_spec_id", _manufacturing_run_spec_id),
    (62, "manufacturing_manufacturer_capabilities", _manufacturing_manufacturer_capabilities),
    (63, "manufacturing_capabilities_per_template", _manufacturing_capabilities_per_template),
    (64, "manufacturing_run_job_number", _manufacturing_run_job_number),
    (65, "manufacturing_capability_meta", _manufacturing_capability_meta),
    (66, "manufacturing_capability_config", _manufacturing_capability_config),
    (67, "manufacturing_one_spec_per_manufacturer", _manufacturing_one_spec_per_manufacturer),
    (68, "manufacturing_defect_disposition", _manufacturing_defect_disposition),
)

# Migrations that a long-lived branch database recorded under an earlier number.
# The ledger keys on version, so without this the old row would hide another
# migration's version and the new one would fail on the unique name.
RENUMBERED: tuple[tuple[str, int, int], ...] = (
    ("repository_origin", 26, 41),
    ("manufacturing_spec_config", 26, 55),
    ("manufacturing_spec_templates", 27, 56),
    ("manufacturing_active_sections", 28, 57),
    ("manufacturing_builtin_templates", 29, 58),
    ("manufacturing_run_release_tag", 30, 59),
    ("manufacturing_project_manufacturers_and_specs", 31, 60),
    ("manufacturing_run_spec_id", 32, 61),
    ("manufacturing_manufacturer_capabilities", 33, 62),
    ("manufacturing_capabilities_per_template", 34, 63),
    ("manufacturing_run_job_number", 35, 64),
    ("manufacturing_capability_meta", 36, 65),
    ("manufacturing_capability_config", 37, 66),
    ("manufacturing_one_spec_per_manufacturer", 38, 67),
    ("manufacturing_defect_disposition", 39, 68),
)


def apply_workspace_migrations(conn: Any) -> None:
    """Apply versioned, additive workspace migrations under the caller's lock."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    for name, old_version, new_version in RENUMBERED:
        conn.execute(
            "UPDATE ws_schema_migrations SET version = %s WHERE version = %s AND name = %s",
            (new_version, old_version, name),
        )
    applied = {
        int(row["version"])
        for row in conn.execute("SELECT version FROM ws_schema_migrations").fetchall()
    }
    for version, name, migration in MIGRATIONS:
        if version in applied:
            continue
        logger.info("Applying workspace schema migration %s (%s)", version, name)
        migration(conn)
        conn.execute(
            "INSERT INTO ws_schema_migrations(version, name) VALUES (%s, %s)",
            (version, name),
        )
