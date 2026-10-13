"""Ordered registry of the workspace schema migrations.

Each body is frozen in its own module under ``app.services.workspace_migrations``;
this file only lists them in order. :mod:`app.services.schema_ledger` applies the
ones a database has not recorded in ``ws_schema_migrations``. Add a migration by
adding a module and one registry line.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

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
from app.services.workspace_migrations import m055_project_path_settings
from app.services.workspace_migrations import m056_sim_studio_setups


Migration = Callable[[Any], None]

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
    (55, "project_path_settings", m055_project_path_settings.migrate),
    (56, "sim_studio_setups", m056_sim_studio_setups.migrate),
)

# Migrations that a long-lived branch database recorded under an earlier number.
RENUMBERED: tuple[tuple[str, int, int], ...] = (
    ("repository_origin", 26, 41),
)


WORKSPACE_LEDGER = Ledger(
    name="workspace",
    schema="workspace",
    table="ws_schema_migrations",
    steps=tuple(Step(version, name, body) for version, name, body in MIGRATIONS),
    renumbered=tuple(Renumbered(name, old, new) for name, old, new in RENUMBERED),
)
