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
