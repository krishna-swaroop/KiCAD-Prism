"""PostgreSQL base catalog schema infrastructure."""

from __future__ import annotations

from app.services.catalog.postgres_runtime import CatalogPostgresConnection


POSTGRES_SCHEMA_VERSION = "catalog-postgres-v7"
CATALOG_SCHEMA_EPOCH = "2"


def create_base_schema(conn: CatalogPostgresConnection) -> None:
    conn.executescript(
        """
            CREATE TABLE IF NOT EXISTS components (
                id TEXT PRIMARY KEY,
                slug TEXT NOT NULL UNIQUE,
                identity_kind TEXT NOT NULL DEFAULT 'mpn',
                identity_source TEXT NOT NULL DEFAULT '',
                normalized_manufacturer TEXT NOT NULL DEFAULT '',
                normalized_part_number TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'manual',
                external_source TEXT NOT NULL DEFAULT '',
                external_id TEXT NOT NULL DEFAULT '',
                external_workflow_source TEXT NOT NULL DEFAULT '',
                external_workflow_id TEXT NOT NULL DEFAULT '',
                external_workflow_url TEXT NOT NULL DEFAULT '',
                external_url TEXT NOT NULL DEFAULT '',
                external_payload_json TEXT NOT NULL DEFAULT '{}',
                external_updated_at TEXT,
                sync_status TEXT NOT NULL DEFAULT '',
                sync_error TEXT NOT NULL DEFAULT '',
                is_active INTEGER NOT NULL DEFAULT 1,
                current_revision_id TEXT NOT NULL DEFAULT '',
                released_revision_id TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS component_revisions (
                id TEXT PRIMARY KEY,
                component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
                version INTEGER NOT NULL,
                parent_revision_id TEXT NOT NULL DEFAULT '',
                change_kind TEXT NOT NULL DEFAULT 'create',
                change_summary TEXT NOT NULL DEFAULT '',
                created_by TEXT NOT NULL DEFAULT '',
                manifest_hash TEXT NOT NULL DEFAULT '',
                manifest_schema TEXT NOT NULL DEFAULT 'prism.revision_manifest_a0',
                release_status TEXT NOT NULL DEFAULT 'open',
                name TEXT NOT NULL,
                value TEXT NOT NULL,
                description TEXT NOT NULL,
                datasheet_url TEXT NOT NULL,
                manufacturer TEXT NOT NULL,
                mpn TEXT NOT NULL,
                normalized_manufacturer TEXT NOT NULL DEFAULT '',
                normalized_mpn TEXT NOT NULL DEFAULT '',
                mpn_source TEXT NOT NULL DEFAULT 'manufacturer',
                category TEXT NOT NULL DEFAULT '',
                package_name TEXT NOT NULL DEFAULT '',
                vendor TEXT NOT NULL DEFAULT '',
                vendor_part_number TEXT NOT NULL DEFAULT '',
                mass_g TEXT NOT NULL DEFAULT '',
                rqjc_c_w TEXT NOT NULL DEFAULT '',
                rqjc_top_c_w TEXT NOT NULL DEFAULT '',
                temp_max_c TEXT NOT NULL DEFAULT '',
                temp_min_c TEXT NOT NULL DEFAULT '',
                power_dissipation_w TEXT NOT NULL DEFAULT '',
                rate TEXT NOT NULL DEFAULT '',
                sap_code TEXT NOT NULL DEFAULT '',
                summary TEXT NOT NULL DEFAULT '',
                keywords TEXT NOT NULL DEFAULT '[]',
                extra_fields TEXT NOT NULL DEFAULT '{}',
                search_document TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(component_id, version)
            );

            CREATE TABLE IF NOT EXISTS catalog_audit_events (
                id TEXT PRIMARY KEY,
                component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
                sequence INTEGER NOT NULL DEFAULT 0,
                revision_id TEXT NOT NULL DEFAULT '',
                event_type TEXT NOT NULL,
                actor TEXT NOT NULL DEFAULT '',
                details_json TEXT NOT NULL DEFAULT '{}',
                previous_hash TEXT NOT NULL DEFAULT '',
                event_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS project_component_import_sessions (
                id TEXT PRIMARY KEY,
                scope TEXT NOT NULL,
                project_id TEXT NOT NULL DEFAULT '',
                project_ids_json TEXT NOT NULL DEFAULT '[]',
                project_revisions_json TEXT NOT NULL DEFAULT '{}',
                source_revision TEXT NOT NULL DEFAULT '',
                selection_json TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'queued',
                error_message TEXT NOT NULL DEFAULT '',
                created_by TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS project_component_import_proposals (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES project_component_import_sessions(id) ON DELETE CASCADE,
                dedupe_key TEXT NOT NULL,
                component_uid TEXT NOT NULL DEFAULT '',
                reference TEXT NOT NULL DEFAULT '',
                metadata_json TEXT NOT NULL DEFAULT '{}',
                assets_json TEXT NOT NULL DEFAULT '[]',
                provenance_json TEXT NOT NULL DEFAULT '[]',
                findings_json TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'candidate',
                accepted_component_id TEXT NOT NULL DEFAULT '',
                draft_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(session_id, dedupe_key)
            );

            CREATE TABLE IF NOT EXISTS component_usage (
                id TEXT PRIMARY KEY,
                component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
                project_id TEXT NOT NULL,
                source_revision TEXT NOT NULL DEFAULT '',
                references_json TEXT NOT NULL DEFAULT '[]',
                details_json TEXT NOT NULL DEFAULT '[]',
                source TEXT NOT NULL DEFAULT 'project_import',
                is_current INTEGER NOT NULL DEFAULT 1,
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                UNIQUE(component_id, project_id, source_revision)
            );

            CREATE TABLE IF NOT EXISTS component_review_decisions (
                id TEXT PRIMARY KEY,
                component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
                revision_id TEXT NOT NULL REFERENCES component_revisions(id) ON DELETE CASCADE,
                reviewer TEXT NOT NULL DEFAULT '',
                reviewer_role TEXT NOT NULL DEFAULT '',
                decision TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                manifest_hash TEXT NOT NULL DEFAULT '',
                validation_json TEXT NOT NULL DEFAULT '{}',
                policy_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS component_release_records (
                id TEXT PRIMARY KEY,
                component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
                revision_id TEXT NOT NULL REFERENCES component_revisions(id) ON DELETE CASCADE,
                release_label TEXT NOT NULL,
                manifest_hash TEXT NOT NULL,
                released_by TEXT NOT NULL DEFAULT '',
                approval_decision_id TEXT NOT NULL DEFAULT '',
                validation_json TEXT NOT NULL DEFAULT '{}',
                policy_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                UNIQUE(component_id, revision_id, manifest_hash)
            );

            CREATE TABLE IF NOT EXISTS assets (
                id TEXT PRIMARY KEY,
                asset_type TEXT NOT NULL,
                name TEXT NOT NULL,
                canonical_path TEXT NOT NULL,
                target_library TEXT NOT NULL DEFAULT '',
                target_name TEXT NOT NULL DEFAULT '',
                source_group TEXT NOT NULL DEFAULT '',
                sha256 TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                content_type TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(asset_type, canonical_path, target_name)
            );

            CREATE TABLE IF NOT EXISTS revision_assets (
                revision_id TEXT NOT NULL REFERENCES component_revisions(id) ON DELETE CASCADE,
                asset_type TEXT NOT NULL,
                asset_id TEXT NOT NULL REFERENCES assets(id),
                required INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(revision_id, asset_id)
            );

            CREATE TABLE IF NOT EXISTS revision_representations (
                id TEXT PRIMARY KEY,
                revision_id TEXT NOT NULL REFERENCES component_revisions(id) ON DELETE CASCADE,
                label TEXT NOT NULL,
                symbol_asset_id TEXT REFERENCES assets(id),
                footprint_asset_id TEXT REFERENCES assets(id),
                is_default INTEGER NOT NULL DEFAULT 0,
                display_order INTEGER NOT NULL DEFAULT 0,
                source_internal_part_number TEXT NOT NULL DEFAULT '',
                provenance_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(revision_id, symbol_asset_id, footprint_asset_id)
            );

            CREATE TABLE IF NOT EXISTS inventory_levels (
                source TEXT NOT NULL,
                component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
                location_key TEXT NOT NULL DEFAULT '',
                source_record_id TEXT NOT NULL DEFAULT '',
                quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
                uom TEXT NOT NULL DEFAULT '',
                inventory_status TEXT NOT NULL DEFAULT '',
                fetch_status TEXT NOT NULL DEFAULT 'ok',
                fetched_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(source, component_id, location_key)
            );

            CREATE TABLE IF NOT EXISTS asset_previews (
                id TEXT PRIMARY KEY,
                asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                kind TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'failed',
                content_type TEXT NOT NULL DEFAULT 'image/svg+xml',
                file_path TEXT NOT NULL DEFAULT '',
                generation_error TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(asset_id, kind)
            );

            CREATE TABLE IF NOT EXISTS asset_preview_versions (
                id TEXT PRIMARY KEY,
                asset_id TEXT NOT NULL REFERENCES assets(id),
                kind TEXT NOT NULL,
                status TEXT NOT NULL,
                content_type TEXT NOT NULL DEFAULT 'image/svg+xml',
                file_path TEXT NOT NULL DEFAULT '',
                sha256 TEXT NOT NULL DEFAULT '',
                size_bytes INTEGER NOT NULL DEFAULT 0,
                generator_name TEXT NOT NULL DEFAULT '',
                generator_version TEXT NOT NULL DEFAULT '',
                pipeline_version TEXT NOT NULL DEFAULT '',
                generator_fingerprint TEXT NOT NULL DEFAULT '',
                generation_error TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                UNIQUE(asset_id, kind, sha256, generator_fingerprint)
            );

            CREATE TABLE IF NOT EXISTS revision_previews (
                revision_id TEXT NOT NULL REFERENCES component_revisions(id) ON DELETE CASCADE,
                asset_id TEXT NOT NULL REFERENCES assets(id),
                kind TEXT NOT NULL,
                preview_id TEXT NOT NULL REFERENCES asset_preview_versions(id),
                created_at TEXT NOT NULL,
                PRIMARY KEY(revision_id, asset_id, kind)
            );

            CREATE TABLE IF NOT EXISTS revision_preview_outputs (
                revision_id TEXT NOT NULL REFERENCES component_revisions(id) ON DELETE CASCADE,
                asset_id TEXT NOT NULL REFERENCES assets(id),
                kind TEXT NOT NULL,
                preview_id TEXT NOT NULL REFERENCES asset_preview_versions(id),
                generated_at TEXT NOT NULL,
                PRIMARY KEY(revision_id, asset_id, kind)
            );

            CREATE TABLE IF NOT EXISTS asset_validation_runs (
                id TEXT PRIMARY KEY,
                component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
                revision_id TEXT NOT NULL REFERENCES component_revisions(id) ON DELETE CASCADE,
                asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                asset_type TEXT NOT NULL,
                checker_type TEXT NOT NULL,
                status TEXT NOT NULL,
                error_count INTEGER NOT NULL DEFAULT 0,
                warning_count INTEGER NOT NULL DEFAULT 0,
                exit_code INTEGER,
                tool_version TEXT NOT NULL DEFAULT '',
                report_dir TEXT NOT NULL DEFAULT '',
                stdout_path TEXT NOT NULL DEFAULT '',
                stderr_path TEXT NOT NULL DEFAULT '',
                junit_path TEXT NOT NULL DEFAULT '',
                json_path TEXT NOT NULL DEFAULT '',
                raw_output TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                finished_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS asset_validation_findings (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL REFERENCES asset_validation_runs(id) ON DELETE CASCADE,
                severity TEXT NOT NULL,
                rule_code TEXT NOT NULL DEFAULT '',
                rule_url TEXT NOT NULL DEFAULT '',
                message TEXT NOT NULL,
                details_json TEXT NOT NULL DEFAULT '[]',
                object_name TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS oauth_auth_codes (
                code TEXT PRIMARY KEY,
                grant_json TEXT NOT NULL,
                exp INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS oauth_revoked_tokens (
                jti TEXT PRIMARY KEY,
                exp INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS oauth_service_clients (
                client_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                secret_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'viewer',
                scopes TEXT NOT NULL DEFAULT '[]',
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_used_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_components_active ON components(is_active);
            CREATE INDEX IF NOT EXISTS idx_components_source ON components(source, external_source, external_id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_components_identity_mpn
                ON components(normalized_manufacturer, normalized_part_number)
                WHERE identity_kind = 'mpn';
            CREATE UNIQUE INDEX IF NOT EXISTS idx_components_identity_provisional
                ON components(identity_source, normalized_part_number)
                WHERE identity_kind = 'provisional_ipn';
            CREATE INDEX IF NOT EXISTS idx_revisions_component ON component_revisions(component_id, version DESC);
            CREATE INDEX IF NOT EXISTS idx_revisions_status ON component_revisions(release_status);
            CREATE INDEX IF NOT EXISTS idx_revisions_category ON component_revisions(category);
            CREATE INDEX IF NOT EXISTS idx_revisions_search ON component_revisions(search_document);
            CREATE INDEX IF NOT EXISTS idx_revisions_mpn ON component_revisions(mpn);
            CREATE INDEX IF NOT EXISTS idx_revisions_normalized_mpn ON component_revisions(normalized_mpn);
            CREATE INDEX IF NOT EXISTS idx_revisions_updated ON component_revisions(updated_at);
            CREATE INDEX IF NOT EXISTS idx_audit_component ON catalog_audit_events(component_id, created_at, id);
            CREATE INDEX IF NOT EXISTS idx_project_import_status ON project_component_import_sessions(status, created_at);
            CREATE INDEX IF NOT EXISTS idx_project_import_proposals ON project_component_import_proposals(session_id, status, created_at);
            CREATE INDEX IF NOT EXISTS idx_component_usage_component ON component_usage(component_id, last_seen_at DESC);
            CREATE INDEX IF NOT EXISTS idx_component_usage_project ON component_usage(project_id, last_seen_at DESC);
            CREATE INDEX IF NOT EXISTS idx_component_reviews_revision ON component_review_decisions(component_id, revision_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_component_releases_component ON component_release_records(component_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_assets_kind ON assets(asset_type, target_library, target_name);
            CREATE INDEX IF NOT EXISTS idx_revision_assets_revision ON revision_assets(revision_id);
            CREATE INDEX IF NOT EXISTS idx_revision_representations_revision
                ON revision_representations(revision_id, display_order, id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_revision_representations_default
                ON revision_representations(revision_id) WHERE is_default = 1;
            CREATE INDEX IF NOT EXISTS idx_inventory_levels_component
                ON inventory_levels(component_id, source, location_key);
            CREATE INDEX IF NOT EXISTS idx_asset_previews_asset ON asset_previews(asset_id, kind);
            CREATE INDEX IF NOT EXISTS idx_asset_preview_versions_asset ON asset_preview_versions(asset_id, kind, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_revision_previews_revision ON revision_previews(revision_id, kind);
            CREATE INDEX IF NOT EXISTS idx_revision_preview_outputs_revision ON revision_preview_outputs(revision_id, kind);
            CREATE INDEX IF NOT EXISTS idx_asset_validation_runs_asset ON asset_validation_runs(asset_id, finished_at DESC);
            CREATE INDEX IF NOT EXISTS idx_asset_validation_runs_component ON asset_validation_runs(component_id, revision_id);
            CREATE INDEX IF NOT EXISTS idx_asset_validation_findings_run ON asset_validation_findings(run_id);
            CREATE INDEX IF NOT EXISTS idx_oauth_service_clients_enabled ON oauth_service_clients(enabled);

            CREATE TABLE IF NOT EXISTS catalog_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """
    )


__all__ = [
    "CATALOG_SCHEMA_EPOCH",
    "POSTGRES_SCHEMA_VERSION",
    "create_base_schema",
]
