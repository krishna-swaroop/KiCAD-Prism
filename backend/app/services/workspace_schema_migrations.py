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
from app.services.workspace_migrations import m143_kicad_libraries


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
    (143, "kicad_libraries", m143_kicad_libraries.migrate),
)

# Migrations that a long-lived branch database recorded under an earlier number.
RENUMBERED: tuple[tuple[str, int, int], ...] = (
    ("repository_origin", 26, 41),
    # Simulation Studio's first deployment recorded its migrations as 9056-9058.
    ("sim_studio_setups", 9056, 120),
    ("sim_studio_runs", 9057, 121),
    ("sim_studio_layouts", 9058, 122),
)


WORKSPACE_LEDGER = Ledger(
    name="workspace",
    schema="workspace",
    table="ws_schema_migrations",
    steps=tuple(Step(version, name, body) for version, name, body in MIGRATIONS),
    renumbered=tuple(Renumbered(name, old, new) for name, old, new in RENUMBERED),
)
