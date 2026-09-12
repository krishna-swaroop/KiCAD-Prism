"""PostgreSQL catalog head projection infrastructure.

``inventory_sources`` stores location-level inventory rows. Public catalog and
remote payloads aggregate those rows through ``inventory_policy``.
"""

from __future__ import annotations

from app.services.catalog.postgres_runtime import CatalogPostgresConnection


POSTGRES_HEAD_PROJECTION_VERSION = "catalog-component-heads-v6"
POSTGRES_REMOTE_HEAD_PROJECTION_VERSION = "catalog-remote-heads-v5"


def ensure_component_heads_projection(conn: CatalogPostgresConnection) -> None:
    """Install the current-head read model and its transactional refresh hooks."""
    marker = conn.execute(
        "SELECT value FROM catalog_meta WHERE key = %s",
        ("postgres_head_projection_version",),
    ).fetchone()
    if marker and str(marker["value"]) == POSTGRES_HEAD_PROJECTION_VERSION:
        return
    conn.execute(
        """
            CREATE TABLE IF NOT EXISTS component_heads (
                component_id TEXT PRIMARY KEY REFERENCES components(id) ON DELETE CASCADE,
                revision_id TEXT NOT NULL,
                slug TEXT NOT NULL,
                source TEXT NOT NULL,
                is_active INTEGER NOT NULL,
                identity_kind TEXT NOT NULL,
                stock_known INTEGER NOT NULL DEFAULT 0,
                stock_quantity DOUBLE PRECISION NOT NULL,
                stock_uom TEXT NOT NULL,
                inventory_status TEXT NOT NULL,
                version INTEGER NOT NULL,
                workflow_stage TEXT NOT NULL,
                name TEXT NOT NULL,
                value TEXT NOT NULL,
                description TEXT NOT NULL,
                datasheet_url TEXT NOT NULL,
                manufacturer TEXT NOT NULL,
                mpn TEXT NOT NULL,
                category TEXT NOT NULL,
                package_name TEXT NOT NULL,
                vendor TEXT NOT NULL,
                vendor_part_number TEXT NOT NULL,
                mass_g TEXT NOT NULL,
                rqjc_c_w TEXT NOT NULL,
                rqjc_top_c_w TEXT NOT NULL,
                temp_max_c TEXT NOT NULL,
                temp_min_c TEXT NOT NULL,
                power_dissipation_w TEXT NOT NULL,
                rate TEXT NOT NULL,
                sap_code TEXT NOT NULL,
                summary TEXT NOT NULL,
                extra_fields TEXT NOT NULL,
                search_document TEXT NOT NULL,
                created_by TEXT NOT NULL,
                revision_created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                has_symbol INTEGER NOT NULL DEFAULT 0,
                has_footprint INTEGER NOT NULL DEFAULT 0,
                symbol_library TEXT NOT NULL DEFAULT '',
                symbol_name TEXT NOT NULL DEFAULT '',
                footprint_library TEXT NOT NULL DEFAULT '',
                footprint_name TEXT NOT NULL DEFAULT '',
                default_representation_id TEXT NOT NULL DEFAULT '',
                representation_count INTEGER NOT NULL DEFAULT 0,
                symbol_variant_count INTEGER NOT NULL DEFAULT 0,
                footprint_variant_count INTEGER NOT NULL DEFAULT 0,
                inventory_sources TEXT NOT NULL DEFAULT '[]'
            )
            """
    )
    conn.execute(
        "ALTER TABLE component_heads ADD COLUMN IF NOT EXISTS inventory_sources "
        "TEXT NOT NULL DEFAULT '[]'"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_component_heads_active_updated "
        "ON component_heads(is_active, updated_at DESC)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_component_heads_workflow "
        "ON component_heads(workflow_stage, updated_at DESC)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_component_heads_category "
        "ON component_heads(category, updated_at DESC)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_component_heads_search_lower "
        "ON component_heads(lower(search_document))"
    )
    conn.execute(
        """
            CREATE OR REPLACE FUNCTION prism_refresh_component_head(target_component_id TEXT)
            RETURNS void
            LANGUAGE plpgsql
            SET search_path = catalog, public
            AS $$
            BEGIN
                DELETE FROM component_heads WHERE component_id = target_component_id;
                INSERT INTO component_heads (
                    component_id, revision_id, slug, source, is_active, identity_kind, stock_known,
                    stock_quantity, stock_uom,
                    inventory_status, version, workflow_stage, name, value, description, datasheet_url,
                    manufacturer, mpn, category, package_name, vendor, vendor_part_number, mass_g,
                    rqjc_c_w, rqjc_top_c_w, temp_max_c, temp_min_c, power_dissipation_w, rate,
                    sap_code, summary, extra_fields, search_document, created_by, revision_created_at,
                    updated_at, has_symbol, has_footprint, symbol_library, symbol_name,
                    footprint_library, footprint_name, default_representation_id,
                    representation_count, symbol_variant_count, footprint_variant_count,
                    inventory_sources
                )
                SELECT
                    component.id, revision.id, component.slug, component.source, component.is_active,
                    component.identity_kind, CASE WHEN inventory.source IS NULL THEN 0 ELSE 1 END,
                    COALESCE(inventory.quantity, 0), COALESCE(inventory.uom, ''),
                    COALESCE(inventory.inventory_status, ''),
                    revision.version, revision.release_status, revision.name, revision.value,
                    revision.description, revision.datasheet_url, revision.manufacturer, revision.mpn,
                    revision.category, revision.package_name, revision.vendor,
                    revision.vendor_part_number, revision.mass_g, revision.rqjc_c_w,
                    revision.rqjc_top_c_w, revision.temp_max_c, revision.temp_min_c,
                    revision.power_dissipation_w, revision.rate, revision.sap_code, revision.summary,
                    revision.extra_fields, revision.search_document, revision.created_by,
                    revision.created_at, revision.updated_at,
                    CASE WHEN symbol.id IS NULL THEN 0 ELSE 1 END,
                    CASE WHEN footprint.id IS NULL THEN 0 ELSE 1 END,
                    COALESCE(symbol.target_library, ''), COALESCE(symbol.target_name, ''),
                    COALESCE(footprint.target_library, ''), COALESCE(footprint.target_name, ''),
                    COALESCE(representation.id, ''), COALESCE(counts.representation_count, 0),
                    COALESCE(counts.symbol_variant_count, 0), COALESCE(counts.footprint_variant_count, 0),
                    COALESCE(inventory_all.sources_json, '[]')
                FROM components component
                JOIN component_revisions revision ON revision.id = component.current_revision_id
                LEFT JOIN revision_representations representation
                  ON representation.revision_id = revision.id AND representation.is_default = 1
                LEFT JOIN assets symbol ON symbol.id = representation.symbol_asset_id
                LEFT JOIN assets footprint ON footprint.id = representation.footprint_asset_id
                LEFT JOIN LATERAL (
                    SELECT COUNT(*)::integer AS representation_count,
                           COUNT(DISTINCT symbol_asset_id)::integer AS symbol_variant_count,
                           COUNT(DISTINCT footprint_asset_id)::integer AS footprint_variant_count
                    FROM revision_representations WHERE revision_id = revision.id
                ) counts ON true
                LEFT JOIN LATERAL (
                    -- Denormalized preferred-source hint; payloads use inventory_policy.
                    SELECT source, SUM(quantity) AS quantity, MIN(uom) AS uom,
                           MIN(inventory_status) AS inventory_status
                    FROM inventory_levels WHERE component_id = component.id
                    GROUP BY source
                    ORDER BY CASE source WHEN 'inventree' THEN 1 WHEN 'csv' THEN 2 ELSE 99 END
                    LIMIT 1
                ) inventory ON true
                LEFT JOIN LATERAL (
                    SELECT COALESCE(
                        json_agg(json_build_object(
                            'source', loc.source,
                            'location_key', loc.location_key,
                            'quantity', loc.quantity,
                            'uom', loc.uom,
                            'inventory_status', loc.inventory_status,
                            'fetch_status', loc.fetch_status,
                            'fetched_at', loc.fetched_at
                        ) ORDER BY CASE loc.source WHEN 'inventree' THEN 1 WHEN 'csv' THEN 2 ELSE 99 END,
                                  loc.source, loc.location_key)::text, '[]') AS sources_json
                    FROM inventory_levels loc
                    WHERE loc.component_id = component.id
                ) inventory_all ON true
                WHERE component.id = target_component_id AND component.current_revision_id <> '';
            END;
            $$
            """
    )
    conn.execute(
        """
            CREATE OR REPLACE FUNCTION prism_refresh_component_head_trigger()
            RETURNS trigger
            LANGUAGE plpgsql
            SET search_path = catalog, public
            AS $$
            DECLARE
                target_component_id TEXT;
            BEGIN
                IF TG_TABLE_NAME = 'components' THEN
                    target_component_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
                ELSE
                    target_component_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.component_id ELSE NEW.component_id END;
                END IF;
                PERFORM catalog.prism_refresh_component_head(target_component_id);
                RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
            END;
            $$
            """
    )
    conn.execute(
        """
            CREATE OR REPLACE FUNCTION prism_refresh_component_head_asset_trigger()
            RETURNS trigger
            LANGUAGE plpgsql
            SET search_path = catalog, public
            AS $$
            DECLARE
                target_revision_id TEXT;
                target_component_id TEXT;
            BEGIN
                IF TG_TABLE_NAME = 'inventory_levels' THEN
                    target_component_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.component_id ELSE NEW.component_id END;
                ELSE
                    target_revision_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.revision_id ELSE NEW.revision_id END;
                    SELECT component_id INTO target_component_id
                    FROM component_revisions WHERE id = target_revision_id;
                END IF;
                IF target_component_id IS NOT NULL THEN
                    PERFORM catalog.prism_refresh_component_head(target_component_id);
                END IF;
                RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
            END;
            $$
            """
    )
    for trigger_name, table, events, function_name in (
        ("trg_component_heads_components", "components", "INSERT OR UPDATE", "prism_refresh_component_head_trigger"),
        ("trg_component_heads_revisions", "component_revisions", "INSERT OR UPDATE", "prism_refresh_component_head_trigger"),
        ("trg_component_heads_assets", "revision_assets", "INSERT OR UPDATE OR DELETE", "prism_refresh_component_head_asset_trigger"),
        ("trg_component_heads_representations", "revision_representations", "INSERT OR UPDATE OR DELETE", "prism_refresh_component_head_asset_trigger"),
        ("trg_component_heads_inventory", "inventory_levels", "INSERT OR UPDATE OR DELETE", "prism_refresh_component_head_asset_trigger"),
    ):
        conn.execute(f"DROP TRIGGER IF EXISTS {trigger_name} ON {table}")
        conn.execute(
            f"CREATE TRIGGER {trigger_name} AFTER {events} ON {table} "
            f"FOR EACH ROW EXECUTE FUNCTION {function_name}()"
        )
    conn.execute("SELECT catalog.prism_refresh_component_head(id) FROM components")
    conn.execute(
        """
            INSERT INTO catalog_meta (key, value) VALUES (%s, %s)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
        ("postgres_head_projection_version", POSTGRES_HEAD_PROJECTION_VERSION),
    )



def ensure_remote_component_heads_projection(conn: CatalogPostgresConnection) -> None:
    """Install the released-only read model used by the KiCad provider."""

    marker = conn.execute(
        "SELECT value FROM catalog_meta WHERE key = %s",
        ("postgres_remote_head_projection_version",),
    ).fetchone()
    if marker and str(marker["value"]) == POSTGRES_REMOTE_HEAD_PROJECTION_VERSION:
        return
    conn.execute(
        """
            CREATE TABLE IF NOT EXISTS remote_component_heads (
                component_id TEXT PRIMARY KEY REFERENCES components(id) ON DELETE CASCADE,
                revision_id TEXT NOT NULL,
                slug TEXT NOT NULL,
                source TEXT NOT NULL,
                is_active INTEGER NOT NULL,
                identity_kind TEXT NOT NULL,
                stock_known INTEGER NOT NULL DEFAULT 0,
                stock_quantity DOUBLE PRECISION NOT NULL,
                stock_uom TEXT NOT NULL,
                inventory_status TEXT NOT NULL,
                version INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                datasheet_url TEXT NOT NULL,
                manufacturer TEXT NOT NULL,
                mpn TEXT NOT NULL,
                category TEXT NOT NULL,
                package_name TEXT NOT NULL,
                summary TEXT NOT NULL,
                extra_fields TEXT NOT NULL,
                search_document TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                has_symbol INTEGER NOT NULL DEFAULT 0,
                has_footprint INTEGER NOT NULL DEFAULT 0,
                symbol_library TEXT NOT NULL DEFAULT '',
                symbol_name TEXT NOT NULL DEFAULT '',
                symbol_preview_id TEXT NOT NULL DEFAULT '',
                footprint_preview_id TEXT NOT NULL DEFAULT '',
                footprint_library TEXT NOT NULL DEFAULT '',
                footprint_name TEXT NOT NULL DEFAULT '',
                default_representation_id TEXT NOT NULL DEFAULT '',
                representation_count INTEGER NOT NULL DEFAULT 0,
                symbol_variant_count INTEGER NOT NULL DEFAULT 0,
                footprint_variant_count INTEGER NOT NULL DEFAULT 0,
                inventory_sources TEXT NOT NULL DEFAULT '[]'
            )
            """
    )
    conn.execute(
        "ALTER TABLE remote_component_heads ADD COLUMN IF NOT EXISTS inventory_sources "
        "TEXT NOT NULL DEFAULT '[]'"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_remote_component_heads_updated "
        "ON remote_component_heads(updated_at DESC)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_remote_component_heads_category "
        "ON remote_component_heads(category, updated_at DESC)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_remote_component_heads_search_lower "
        "ON remote_component_heads(lower(search_document))"
    )
    conn.execute(
        """
            CREATE OR REPLACE FUNCTION prism_refresh_remote_component_head(
                target_component_id TEXT
            )
            RETURNS void
            LANGUAGE plpgsql
            SET search_path = catalog, public
            AS $$
            BEGIN
                DELETE FROM remote_component_heads
                WHERE component_id = target_component_id;
                INSERT INTO remote_component_heads (
                    component_id, revision_id, slug, source, is_active, identity_kind, stock_known,
                    stock_quantity, stock_uom, inventory_status, version,
                    name, description, datasheet_url, manufacturer, mpn,
                    category, package_name, summary, extra_fields,
                    search_document, updated_at, has_symbol, has_footprint,
                    symbol_library, symbol_name, symbol_preview_id,
                    footprint_preview_id, footprint_library, footprint_name,
                    default_representation_id, representation_count,
                    symbol_variant_count, footprint_variant_count,
                    inventory_sources
                )
                SELECT
                    component.id, revision.id, component.slug, component.source,
                    component.is_active, component.identity_kind,
                    CASE WHEN inventory.source IS NULL THEN 0 ELSE 1 END,
                    COALESCE(inventory.quantity, 0), COALESCE(inventory.uom, ''),
                    COALESCE(inventory.inventory_status, ''),
                    revision.version, revision.name, revision.description,
                    revision.datasheet_url, revision.manufacturer, revision.mpn,
                    revision.category, revision.package_name, revision.summary,
                    revision.extra_fields, revision.search_document,
                    revision.updated_at,
                    CASE WHEN symbol.id IS NULL THEN 0 ELSE 1 END,
                    CASE WHEN footprint.id IS NULL THEN 0 ELSE 1 END,
                    COALESCE(symbol.target_library, ''),
                    COALESCE(symbol.target_name, ''),
                    COALESCE(symbol_preview.preview_id, ''),
                    COALESCE(footprint_preview.preview_id, ''),
                    COALESCE(footprint.target_library, ''), COALESCE(footprint.target_name, ''),
                    COALESCE(representation.id, ''), COALESCE(counts.representation_count, 0),
                    COALESCE(counts.symbol_variant_count, 0), COALESCE(counts.footprint_variant_count, 0),
                    COALESCE(inventory_all.sources_json, '[]')
                FROM components component
                JOIN component_revisions revision
                  ON revision.id = component.released_revision_id
                LEFT JOIN revision_representations representation
                  ON representation.revision_id = revision.id AND representation.is_default = 1
                LEFT JOIN assets symbol ON symbol.id = representation.symbol_asset_id
                LEFT JOIN assets footprint ON footprint.id = representation.footprint_asset_id
                LEFT JOIN LATERAL (
                    SELECT COUNT(*)::integer AS representation_count,
                           COUNT(DISTINCT symbol_asset_id)::integer AS symbol_variant_count,
                           COUNT(DISTINCT footprint_asset_id)::integer AS footprint_variant_count
                    FROM revision_representations WHERE revision_id = revision.id
                ) counts ON true
                LEFT JOIN LATERAL (
                    -- Denormalized preferred-source hint; payloads use inventory_policy.
                    SELECT source, SUM(quantity) AS quantity, MIN(uom) AS uom,
                           MIN(inventory_status) AS inventory_status
                    FROM inventory_levels WHERE component_id = component.id
                    GROUP BY source
                    ORDER BY CASE source WHEN 'inventree' THEN 1 WHEN 'csv' THEN 2 ELSE 99 END
                    LIMIT 1
                ) inventory ON true
                LEFT JOIN LATERAL (
                    SELECT COALESCE(
                        json_agg(json_build_object(
                            'source', loc.source,
                            'location_key', loc.location_key,
                            'quantity', loc.quantity,
                            'uom', loc.uom,
                            'inventory_status', loc.inventory_status,
                            'fetch_status', loc.fetch_status,
                            'fetched_at', loc.fetched_at
                        ) ORDER BY CASE loc.source WHEN 'inventree' THEN 1 WHEN 'csv' THEN 2 ELSE 99 END,
                                  loc.source, loc.location_key)::text, '[]') AS sources_json
                    FROM inventory_levels loc
                    WHERE loc.component_id = component.id
                ) inventory_all ON true
                LEFT JOIN LATERAL (
                    SELECT preview.id AS preview_id
                    FROM revision_preview_outputs link
                    JOIN asset_preview_versions preview
                      ON preview.id = link.preview_id
                    WHERE link.revision_id = revision.id
                      AND link.asset_id = representation.symbol_asset_id
                      AND link.kind = 'symbol'
                      AND preview.status = 'ready'
                      AND preview.file_path <> ''
                    ORDER BY preview.created_at DESC
                    LIMIT 1
                ) symbol_preview ON true
                LEFT JOIN LATERAL (
                    SELECT preview.id AS preview_id
                    FROM revision_preview_outputs link
                    JOIN asset_preview_versions preview
                      ON preview.id = link.preview_id
                    WHERE link.revision_id = revision.id
                      AND link.asset_id = representation.footprint_asset_id
                      AND link.kind = 'footprint'
                      AND preview.status = 'ready'
                      AND preview.file_path <> ''
                    ORDER BY preview.created_at DESC
                    LIMIT 1
                ) footprint_preview ON true
                WHERE component.id = target_component_id
                  AND component.is_active = 1
                  AND component.released_revision_id <> ''
                  AND revision.release_status = 'released';
                INSERT INTO catalog_meta(key, value)
                VALUES (
                    'remote_component_heads_version',
                    EXTRACT(EPOCH FROM clock_timestamp())::text
                )
                ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value;
            END;
            $$
            """
    )
    conn.execute(
        """
            CREATE OR REPLACE FUNCTION prism_refresh_remote_head_trigger()
            RETURNS trigger
            LANGUAGE plpgsql
            SET search_path = catalog, public
            AS $$
            DECLARE
                target_component_id TEXT;
                target_revision_id TEXT;
            BEGIN
                IF TG_TABLE_NAME = 'components' THEN
                    target_component_id :=
                        CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
                ELSIF TG_TABLE_NAME = 'component_revisions' THEN
                    target_component_id :=
                        CASE WHEN TG_OP = 'DELETE'
                             THEN OLD.component_id ELSE NEW.component_id END;
                ELSIF TG_TABLE_NAME = 'inventory_levels' THEN
                    target_component_id :=
                        CASE WHEN TG_OP = 'DELETE'
                             THEN OLD.component_id ELSE NEW.component_id END;
                ELSE
                    target_revision_id :=
                        CASE WHEN TG_OP = 'DELETE'
                             THEN OLD.revision_id ELSE NEW.revision_id END;
                    SELECT component_id INTO target_component_id
                    FROM component_revisions
                    WHERE id = target_revision_id;
                END IF;
                IF target_component_id IS NOT NULL THEN
                    PERFORM catalog.prism_refresh_remote_component_head(
                        target_component_id
                    );
                END IF;
                RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
            END;
            $$
            """
    )
    for trigger_name, table, events in (
        (
            "trg_remote_heads_components",
            "components",
            "INSERT OR UPDATE",
        ),
        (
            "trg_remote_heads_revisions",
            "component_revisions",
            "INSERT OR UPDATE",
        ),
        (
            "trg_remote_heads_assets",
            "revision_assets",
            "INSERT OR UPDATE OR DELETE",
        ),
        (
            "trg_remote_heads_representations",
            "revision_representations",
            "INSERT OR UPDATE OR DELETE",
        ),
        (
            "trg_remote_heads_inventory",
            "inventory_levels",
            "INSERT OR UPDATE OR DELETE",
        ),
        (
            "trg_remote_heads_previews",
            "revision_preview_outputs",
            "INSERT OR UPDATE OR DELETE",
        ),
    ):
        conn.execute(f"DROP TRIGGER IF EXISTS {trigger_name} ON {table}")
        conn.execute(
            f"CREATE TRIGGER {trigger_name} AFTER {events} ON {table} "
            "FOR EACH ROW EXECUTE FUNCTION prism_refresh_remote_head_trigger()"
        )
    conn.execute(
        "SELECT catalog.prism_refresh_remote_component_head(id) FROM components"
    )
    conn.execute(
        """
            INSERT INTO catalog_meta(key, value)
            VALUES (%s, %s)
            ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value
            """,
        (
            "postgres_remote_head_projection_version",
            POSTGRES_REMOTE_HEAD_PROJECTION_VERSION,
        ),
    )


__all__ = [
    "POSTGRES_HEAD_PROJECTION_VERSION",
    "POSTGRES_REMOTE_HEAD_PROJECTION_VERSION",
    "ensure_component_heads_projection",
    "ensure_remote_component_heads_projection",
]
