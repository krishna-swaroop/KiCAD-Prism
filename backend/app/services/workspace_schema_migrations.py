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


logger = logging.getLogger(__name__)

Migration = Callable[[Any], None]

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
