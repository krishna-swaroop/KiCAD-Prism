"""PostgreSQL catalog search and integrity guard infrastructure."""

from __future__ import annotations

import logging

from app.services.catalog.postgres_runtime import PostgresCatalogRuntime


logger = logging.getLogger(__name__)

POSTGRES_SEARCH_VERSION = "catalog-search-v3"
POSTGRES_INTEGRITY_GUARDS_VERSION = "catalog-integrity-guards-v4"


def ensure_postgres_search_indexes(runtime: PostgresCatalogRuntime) -> None:
    # Trigram search keeps the existing forgiving catalog query behavior while
    # avoiding full scans at tens of thousands of components. Extension creation
    # can be disallowed on managed databases, so degrade to ordinary indexes.
    with runtime.connect() as conn:
        conn.execute(
            "SELECT pg_advisory_xact_lock(hashtext(%s))",
            ("prism-component-catalog-search",),
        ).fetchone()
        marker = conn.execute(
            "SELECT value FROM catalog_meta WHERE key = %s",
            ("postgres_search_version",),
        ).fetchone()
        if marker and str(marker["value"]) == POSTGRES_SEARCH_VERSION:
            conn.commit()
            return
        try:
            conn.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_revisions_search_trgm "
                "ON component_revisions USING GIN (lower(search_document) gin_trgm_ops)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_revisions_mpn_trgm "
                "ON component_revisions USING GIN (lower(mpn) gin_trgm_ops)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_remote_heads_search_trgm "
                "ON remote_component_heads USING GIN "
                "(lower(search_document) gin_trgm_ops)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_remote_heads_mpn_trgm "
                "ON remote_component_heads USING GIN (lower(mpn) gin_trgm_ops)"
            )
            # The asset link picker searches with leading wildcards, which no
            # btree index can serve, so without these it sequentially scans
            # every asset on each keystroke.
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_assets_name_trgm "
                "ON assets USING GIN (lower(name) gin_trgm_ops)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_assets_target_name_trgm "
                "ON assets USING GIN (lower(target_name) gin_trgm_ops)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_assets_target_library_trgm "
                "ON assets USING GIN (lower(target_library) gin_trgm_ops)"
            )
            # A new index is invisible to the planner until the table has
            # statistics that justify it: measured on ~17k assets, the search
            # kept seq scanning until this ran, then dropped from 27ms to
            # under 1ms. Waiting for autovacuum would leave every deploy slow
            # for as long as that takes to come around.
            conn.execute("ANALYZE assets")
            conn.execute(
                """
                    INSERT INTO catalog_meta (key, value) VALUES (%s, %s)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                    """,
                ("postgres_search_version", POSTGRES_SEARCH_VERSION),
            )
            conn.commit()
        except Exception as exc:
            logger.warning(
                "pg_trgm catalog search indexes unavailable; falling back to btree lower() indexes: %s",
                exc,
            )
            conn.rollback()
            conn.execute(
                "SELECT pg_advisory_xact_lock(hashtext(%s))",
                ("prism-component-catalog-search",),
            ).fetchone()
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_revisions_search_lower "
                "ON component_revisions(lower(search_document))"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_revisions_mpn_lower "
                "ON component_revisions(lower(mpn))"
            )
            conn.execute(
                """
                    INSERT INTO catalog_meta (key, value) VALUES (%s, %s)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                    """,
                ("postgres_search_version", POSTGRES_SEARCH_VERSION),
            )
            conn.commit()



def ensure_postgres_integrity_guards(runtime: PostgresCatalogRuntime) -> None:
    with runtime.connect() as conn:
        conn.execute(
            "SELECT pg_advisory_xact_lock(hashtext(%s))",
            ("prism-component-catalog-integrity-guards",),
        ).fetchone()
        marker = conn.execute(
            "SELECT value FROM catalog_meta WHERE key = %s",
            ("postgres_integrity_guards_version",),
        ).fetchone()
        if marker and str(marker["value"]) == POSTGRES_INTEGRITY_GUARDS_VERSION:
            conn.commit()
            return
        conn.execute(
            """
                CREATE OR REPLACE FUNCTION prism_reject_catalog_evidence_mutation()
                RETURNS trigger
                LANGUAGE plpgsql
                AS $$
                BEGIN
                    RAISE EXCEPTION 'immutable catalog evidence cannot be updated or deleted';
                END;
                $$
                """
        )
        guarded_tables = {
            "catalog_audit_events": "UPDATE OR DELETE",
            "component_review_decisions": "UPDATE OR DELETE",
            "component_release_records": "UPDATE OR DELETE",
            "components": "DELETE",
            "component_revisions": "DELETE",
            "asset_previews": "UPDATE OR DELETE",
            "asset_preview_versions": "UPDATE OR DELETE",
        }
        for table, operations in guarded_tables.items():
            trigger_name = f"trg_{table}_immutable"
            exists = conn.execute(
                """
                    SELECT 1 AS present
                    FROM pg_trigger
                    WHERE tgname = %s AND tgrelid = to_regclass(%s) AND NOT tgisinternal
                    """,
                (trigger_name, f"catalog.{table}"),
            ).fetchone()
            if not exists:
                conn.execute(
                    f"CREATE TRIGGER {trigger_name} BEFORE {operations} ON {table} "
                    "FOR EACH ROW EXECUTE FUNCTION prism_reject_catalog_evidence_mutation()"
                )
        conn.execute(
            """
                CREATE OR REPLACE FUNCTION prism_guard_revision_preview_mutation()
                RETURNS trigger
                LANGUAGE plpgsql
                AS $$
                DECLARE
                    guarded_revision_id TEXT;
                    parent_manifest_hash TEXT;
                BEGIN
                    IF current_setting('prism.catalog_migration', true) = 'on' THEN
                        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
                    END IF;
                    guarded_revision_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.revision_id ELSE NEW.revision_id END;
                    SELECT manifest_hash INTO parent_manifest_hash
                    FROM component_revisions revision
                    WHERE revision.id = guarded_revision_id;
                    IF COALESCE(parent_manifest_hash, '') <> '' THEN
                        RAISE EXCEPTION 'finalized revision preview evidence is immutable';
                    END IF;
                    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
                END;
                $$
                """
        )
        conn.execute(
            """
                CREATE OR REPLACE FUNCTION prism_guard_finalized_revision_update()
                RETURNS trigger
                LANGUAGE plpgsql
                AS $$
                BEGIN
                    IF current_setting('prism.catalog_migration', true) = 'on' THEN
                        RETURN NEW;
                    END IF;
                    IF COALESCE(OLD.manifest_hash, '') <> ''
                       AND (to_jsonb(NEW) - ARRAY['release_status', 'updated_at'])
                           IS DISTINCT FROM
                           (to_jsonb(OLD) - ARRAY['release_status', 'updated_at']) THEN
                        RAISE EXCEPTION 'finalized component revision evidence is immutable';
                    END IF;
                    RETURN NEW;
                END;
                $$
                """
        )
        conn.execute(
            """
                CREATE OR REPLACE FUNCTION prism_guard_asset_identity_update()
                RETURNS trigger
                LANGUAGE plpgsql
                AS $$
                BEGIN
                    IF current_setting('prism.catalog_migration', true) = 'on' THEN
                        RETURN NEW;
                    END IF;
                    IF (to_jsonb(NEW) - ARRAY['name', 'canonical_path', 'size_bytes', 'content_type', 'updated_at'])
                       IS DISTINCT FROM
                       (to_jsonb(OLD) - ARRAY['name', 'canonical_path', 'size_bytes', 'content_type', 'updated_at']) THEN
                        RAISE EXCEPTION 'immutable asset identity or content hash cannot be changed';
                    END IF;
                    RETURN NEW;
                END;
                $$
                """
        )
        conn.execute(
            """
                CREATE OR REPLACE FUNCTION prism_validate_revision_asset_type()
                RETURNS trigger
                LANGUAGE plpgsql
                AS $$
                DECLARE actual_type TEXT;
                BEGIN
                    SELECT asset_type INTO actual_type FROM assets WHERE id = NEW.asset_id;
                    IF actual_type IS DISTINCT FROM NEW.asset_type THEN
                        RAISE EXCEPTION 'revision asset type does not match asset';
                    END IF;
                    RETURN NEW;
                END;
                $$
                """
        )
        conn.execute(
            """
                CREATE OR REPLACE FUNCTION prism_validate_representation_assets()
                RETURNS trigger
                LANGUAGE plpgsql
                AS $$
                BEGIN
                    IF NEW.symbol_asset_id IS NOT NULL AND NOT EXISTS (
                        SELECT 1 FROM revision_assets link JOIN assets asset ON asset.id = link.asset_id
                        WHERE link.revision_id = NEW.revision_id AND link.asset_id = NEW.symbol_asset_id
                          AND link.asset_type = 'symbol' AND asset.asset_type = 'symbol'
                    ) THEN
                        RAISE EXCEPTION 'representation symbol is not attached to the revision';
                    END IF;
                    IF NEW.footprint_asset_id IS NOT NULL AND NOT EXISTS (
                        SELECT 1 FROM revision_assets link JOIN assets asset ON asset.id = link.asset_id
                        WHERE link.revision_id = NEW.revision_id AND link.asset_id = NEW.footprint_asset_id
                          AND link.asset_type = 'footprint' AND asset.asset_type = 'footprint'
                    ) THEN
                        RAISE EXCEPTION 'representation footprint is not attached to the revision';
                    END IF;
                    RETURN NEW;
                END;
                $$
                """
        )
        conn.execute(
            """
                CREATE OR REPLACE FUNCTION prism_validate_revision_release()
                RETURNS trigger
                LANGUAGE plpgsql
                AS $$
                DECLARE
                    component_identity_kind TEXT;
                    complete_defaults INTEGER;
                BEGIN
                    IF NEW.release_status NOT IN ('done', 'released') THEN
                        RETURN NEW;
                    END IF;
                    SELECT identity_kind INTO component_identity_kind
                    FROM components WHERE id = NEW.component_id;
                    IF component_identity_kind = 'provisional_ipn' THEN
                        RAISE EXCEPTION 'provisional components cannot reach done or released';
                    END IF;
                    IF NEW.release_status = 'released' THEN
                        SELECT COUNT(*) INTO complete_defaults
                        FROM revision_representations
                        WHERE revision_id = NEW.id AND is_default = 1
                          AND symbol_asset_id IS NOT NULL AND footprint_asset_id IS NOT NULL;
                    END IF;
                    IF NEW.release_status = 'released' AND complete_defaults <> 1 THEN
                        RAISE EXCEPTION 'released revisions require exactly one complete default representation';
                    END IF;
                    RETURN NEW;
                END;
                $$
                """
        )
        asset_update_trigger = conn.execute(
            """
                SELECT 1 AS present
                FROM pg_trigger
                WHERE tgname = 'trg_assets_identity_update'
                  AND tgrelid = to_regclass('catalog.assets')
                  AND NOT tgisinternal
                """
        ).fetchone()
        if not asset_update_trigger:
            conn.execute(
                "CREATE TRIGGER trg_assets_identity_update BEFORE UPDATE ON assets "
                "FOR EACH ROW EXECUTE FUNCTION prism_guard_asset_identity_update()"
            )
        revision_update_trigger = conn.execute(
            """
                SELECT 1 AS present
                FROM pg_trigger
                WHERE tgname = 'trg_component_revisions_finalized_update'
                  AND tgrelid = to_regclass('catalog.component_revisions')
                  AND NOT tgisinternal
                """
        ).fetchone()
        if not revision_update_trigger:
            conn.execute(
                "CREATE TRIGGER trg_component_revisions_finalized_update "
                "BEFORE UPDATE ON component_revisions "
                "FOR EACH ROW EXECUTE FUNCTION prism_guard_finalized_revision_update()"
            )
        revision_preview_trigger = conn.execute(
            """
                SELECT 1 AS present
                FROM pg_trigger
                WHERE tgname = 'trg_revision_previews_finalized'
                  AND tgrelid = to_regclass('catalog.revision_previews')
                  AND NOT tgisinternal
                """
        ).fetchone()
        if not revision_preview_trigger:
            conn.execute(
                "CREATE TRIGGER trg_revision_previews_finalized "
                "BEFORE INSERT OR UPDATE OR DELETE ON revision_previews "
                "FOR EACH ROW EXECUTE FUNCTION prism_guard_revision_preview_mutation()"
            )
        revision_asset_trigger = conn.execute(
            """
                SELECT 1 AS present
                FROM pg_trigger
                WHERE tgname = 'trg_revision_assets_finalized'
                  AND tgrelid = to_regclass('catalog.revision_assets')
                  AND NOT tgisinternal
                """
        ).fetchone()
        if not revision_asset_trigger:
            conn.execute(
                "CREATE TRIGGER trg_revision_assets_finalized "
                "BEFORE INSERT OR UPDATE OR DELETE ON revision_assets "
                "FOR EACH ROW EXECUTE FUNCTION prism_guard_revision_preview_mutation()"
            )
        for trigger_name, table, operations, function_name in (
            (
                "trg_revision_assets_type",
                "revision_assets",
                "INSERT OR UPDATE",
                "prism_validate_revision_asset_type",
            ),
            (
                "trg_revision_representations_finalized",
                "revision_representations",
                "INSERT OR UPDATE OR DELETE",
                "prism_guard_revision_preview_mutation",
            ),
            (
                "trg_revision_representations_assets",
                "revision_representations",
                "INSERT OR UPDATE",
                "prism_validate_representation_assets",
            ),
            (
                "trg_component_revisions_release",
                "component_revisions",
                "INSERT OR UPDATE OF release_status",
                "prism_validate_revision_release",
            ),
        ):
            conn.execute(f"DROP TRIGGER IF EXISTS {trigger_name} ON {table}")
            conn.execute(
                f"CREATE TRIGGER {trigger_name} BEFORE {operations} ON {table} "
                f"FOR EACH ROW EXECUTE FUNCTION {function_name}()"
            )
        conn.execute(
            """
                INSERT INTO catalog_meta (key, value) VALUES (%s, %s)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """,
            ("postgres_integrity_guards_version", POSTGRES_INTEGRITY_GUARDS_VERSION),
        )
        conn.commit()


__all__ = [
    "POSTGRES_INTEGRITY_GUARDS_VERSION",
    "POSTGRES_SEARCH_VERSION",
    "ensure_postgres_integrity_guards",
    "ensure_postgres_search_indexes",
]
