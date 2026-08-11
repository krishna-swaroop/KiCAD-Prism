from __future__ import annotations

import logging
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from app.core.config import settings
from app.services.catalog_schema_migrations import apply_catalog_migrations
from app.services.component_catalog_domain import ComponentCatalogDomainService
from app.services.postgres_database import database

logger = logging.getLogger(__name__)


# Written on every startup so an older Prism, which treats this row as a hard
# precondition, can still open a database this build has touched. Schema changes
# belong in app.services.catalog_schema_migrations, not here.
POSTGRES_SCHEMA_VERSION = "catalog-postgres-v6"

# Derived state. Each is rebuilt when its version changes, so these deliberately
# stay outside the migration ladder, which records a migration as run once.
POSTGRES_SEARCH_VERSION = "catalog-search-v2"
POSTGRES_INTEGRITY_GUARDS_VERSION = "catalog-integrity-guards-v3"
POSTGRES_HEAD_PROJECTION_VERSION = "catalog-component-heads-v2"
POSTGRES_REMOTE_HEAD_PROJECTION_VERSION = "catalog-remote-heads-v1"

def _postgres_dsn(value: str) -> str:
    """Accept both native and SQLAlchemy-style psycopg URLs."""
    return value.strip().replace("postgresql+psycopg://", "postgresql://", 1)


def _split_sql_script(script: str) -> list[str]:
    """Split the catalog's simple DDL script while respecting quoted strings."""
    statements: list[str] = []
    current: list[str] = []
    quote = ""
    index = 0
    while index < len(script):
        char = script[index]
        if quote:
            current.append(char)
            if char == quote:
                if index + 1 < len(script) and script[index + 1] == quote:
                    current.append(script[index + 1])
                    index += 1
                else:
                    quote = ""
        elif char in {"'", '"'}:
            quote = char
            current.append(char)
        elif char == ";":
            statement = "".join(current).strip()
            if statement:
                statements.append(statement)
            current = []
        else:
            current.append(char)
        index += 1
    statement = "".join(current).strip()
    if statement:
        statements.append(statement)
    return statements


class _CatalogConnection:
    """Native psycopg connection with the domain's DDL-script convenience API."""

    def __init__(self, connection: Any) -> None:
        self._connection = connection

    def execute(self, sql: str, params: Any = None) -> Any:
        return self._connection.execute(sql, params, prepare=False)

    def executescript(self, script: str) -> None:
        # Psycopg accepts parameter-free multi-statement DDL through the simple
        # protocol. The catalog script is idempotent, so send it in one round
        # trip rather than splitting it into dozens of remote calls.
        if script.strip():
            self._connection.execute(script, prepare=False)

    def commit(self) -> None:
        self._connection.commit()

    def rollback(self) -> None:
        self._connection.rollback()

    def iter_rows(self, sql: str, params: Any = None, *, batch_size: int = 500) -> Iterator[Any]:
        """Iterate a large read through a PostgreSQL server-side cursor."""
        with self._connection.cursor(name="prism_catalog_export") as cursor:
            cursor.itersize = batch_size
            cursor.execute(sql, params)
            while rows := cursor.fetchmany(batch_size):
                yield from rows


class ComponentCatalogPostgresService(ComponentCatalogDomainService):
    """PostgreSQL-backed catalog with the existing stable domain/API contract.

    The file store remains content-addressed on the shared projects volume. PostgreSQL
    owns identities, revisions, workflow, usage, review, and audit state.
    """

    def __init__(self, store_root: Path | None = None, database_url: str | None = None) -> None:
        self._postgres_url = _postgres_dsn(database_url or settings.PRISM_DATABASE_URL)
        super().__init__(store_root=store_root, database_url="postgres")

    def _database_path(self, database_url: str | None) -> Path:
        # Retained only for the legacy service's diagnostic property. PostgreSQL does
        # not use this path and no data is written here.
        _ = database_url
        return Path("/dev/null")

    @contextmanager
    def _connect(self) -> Iterator[_CatalogConnection]:
        if not self._postgres_url:
            raise ValueError("PRISM_DATABASE_URL is required for PostgreSQL catalog storage")
        configured_url = _postgres_dsn(settings.PRISM_DATABASE_URL)
        if configured_url and self._postgres_url == configured_url:
            connection_context = database.connection()
        else:
            import psycopg
            from psycopg.rows import dict_row

            connection_context = psycopg.connect(
                self._postgres_url,
                row_factory=dict_row,
                autocommit=False,
            )
        with connection_context as connection:
            connection.execute("SET search_path TO catalog, public")
            yield _CatalogConnection(connection)

    def initialize(self) -> None:
        with self._lock:
            if self._initialized:
                return
            self._ensure_storage_dirs()
            with self._connect() as conn:
                conn.execute(
                    "SELECT pg_advisory_xact_lock(hashtext(%s))",
                    ("prism-component-catalog-schema",),
                ).fetchone()
                conn.execute("CREATE SCHEMA IF NOT EXISTS catalog")
                conn.execute("SET search_path TO catalog, public")
                # Every statement below is CREATE ... IF NOT EXISTS, so running
                # this on an existing database adds whatever a new release
                # introduced and leaves everything else untouched. An older
                # Prism reaching this database still finds the schema-version
                # row it insists on, which is what keeps a rollback from
                # needing a data restore.
                self._create_schema(conn)
                conn.execute(
                    "CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_component_sequence "
                    "ON catalog_audit_events(component_id, sequence)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_component_usage_current "
                    "ON component_usage(component_id, is_current, last_seen_at DESC)"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS catalog_schema_migrations (
                        version TEXT PRIMARY KEY,
                        applied_at TEXT NOT NULL
                    )
                    """
                )
                self._ensure_metadata_schema(conn)
                conn.execute(
                    """
                    INSERT INTO catalog_schema_migrations (version, applied_at)
                    VALUES (%s, CURRENT_TIMESTAMP::text)
                    ON CONFLICT (version) DO NOTHING
                    """,
                    (POSTGRES_SCHEMA_VERSION,),
                )
                # Projections first: they are part of the schema surface a
                # migration may need to alter, and a migration that widens a
                # head column cannot run before the head table exists.
                self._ensure_component_heads_projection(conn)
                self._ensure_remote_component_heads_projection(conn)
                apply_catalog_migrations(conn)
                conn.commit()
            self._ensure_postgres_search_indexes()
            self._ensure_postgres_integrity_guards()
            self._fts_available = False
            self._initialized = True

    def _ensure_component_heads_projection(self, conn: _CatalogConnection) -> None:
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
                symbol_name TEXT NOT NULL DEFAULT ''
            )
            """
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
                    component_id, revision_id, slug, source, is_active, stock_quantity, stock_uom,
                    inventory_status, version, workflow_stage, name, value, description, datasheet_url,
                    manufacturer, mpn, category, package_name, vendor, vendor_part_number, mass_g,
                    rqjc_c_w, rqjc_top_c_w, temp_max_c, temp_min_c, power_dissipation_w, rate,
                    sap_code, summary, extra_fields, search_document, created_by, revision_created_at,
                    updated_at, has_symbol, has_footprint, symbol_library, symbol_name
                )
                SELECT
                    component.id, revision.id, component.slug, component.source, component.is_active,
                    component.stock_quantity, component.stock_uom, component.inventory_status,
                    revision.version, revision.release_status, revision.name, revision.value,
                    revision.description, revision.datasheet_url, revision.manufacturer, revision.mpn,
                    revision.category, revision.package_name, revision.vendor,
                    revision.vendor_part_number, revision.mass_g, revision.rqjc_c_w,
                    revision.rqjc_top_c_w, revision.temp_max_c, revision.temp_min_c,
                    revision.power_dissipation_w, revision.rate, revision.sap_code, revision.summary,
                    revision.extra_fields, revision.search_document, revision.created_by,
                    revision.created_at, revision.updated_at,
                    CASE WHEN symbol.asset_id IS NULL THEN 0 ELSE 1 END,
                    CASE WHEN footprint.asset_id IS NULL THEN 0 ELSE 1 END,
                    COALESCE(symbol.target_library, ''), COALESCE(symbol.target_name, '')
                FROM components component
                JOIN component_revisions revision ON revision.id = component.current_revision_id
                LEFT JOIN LATERAL (
                    SELECT link.asset_id, asset.target_library, asset.target_name
                    FROM revision_assets link JOIN assets asset ON asset.id = link.asset_id
                    WHERE link.revision_id = revision.id AND link.asset_type = 'symbol'
                    ORDER BY asset.id LIMIT 1
                ) symbol ON true
                LEFT JOIN LATERAL (
                    SELECT link.asset_id
                    FROM revision_assets link
                    WHERE link.revision_id = revision.id AND link.asset_type = 'footprint'
                    ORDER BY link.asset_id LIMIT 1
                ) footprint ON true
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
                target_revision_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.revision_id ELSE NEW.revision_id END;
                SELECT component_id INTO target_component_id
                FROM component_revisions WHERE id = target_revision_id;
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

    def _ensure_remote_component_heads_projection(self, conn: _CatalogConnection) -> None:
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
                footprint_preview_id TEXT NOT NULL DEFAULT ''
            )
            """
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
                    component_id, revision_id, slug, source, is_active,
                    stock_quantity, stock_uom, inventory_status, version,
                    name, description, datasheet_url, manufacturer, mpn,
                    category, package_name, summary, extra_fields,
                    search_document, updated_at, has_symbol, has_footprint,
                    symbol_library, symbol_name, symbol_preview_id,
                    footprint_preview_id
                )
                SELECT
                    component.id, revision.id, component.slug, component.source,
                    component.is_active, component.stock_quantity,
                    component.stock_uom, component.inventory_status,
                    revision.version, revision.name, revision.description,
                    revision.datasheet_url, revision.manufacturer, revision.mpn,
                    revision.category, revision.package_name, revision.summary,
                    revision.extra_fields, revision.search_document,
                    revision.updated_at,
                    CASE WHEN symbol.asset_id IS NULL THEN 0 ELSE 1 END,
                    CASE WHEN footprint.asset_id IS NULL THEN 0 ELSE 1 END,
                    COALESCE(symbol.target_library, ''),
                    COALESCE(symbol.target_name, ''),
                    COALESCE(symbol_preview.preview_id, ''),
                    COALESCE(footprint_preview.preview_id, '')
                FROM components component
                JOIN component_revisions revision
                  ON revision.id = component.released_revision_id
                LEFT JOIN LATERAL (
                    SELECT link.asset_id, asset.target_library, asset.target_name
                    FROM revision_assets link
                    JOIN assets asset ON asset.id = link.asset_id
                    WHERE link.revision_id = revision.id
                      AND link.asset_type = 'symbol'
                    ORDER BY asset.id
                    LIMIT 1
                ) symbol ON true
                LEFT JOIN LATERAL (
                    SELECT link.asset_id
                    FROM revision_assets link
                    WHERE link.revision_id = revision.id
                      AND link.asset_type = 'footprint'
                    ORDER BY link.asset_id
                    LIMIT 1
                ) footprint ON true
                LEFT JOIN LATERAL (
                    SELECT preview.id AS preview_id
                    FROM revision_previews link
                    JOIN asset_preview_versions preview
                      ON preview.id = link.preview_id
                    WHERE link.revision_id = revision.id
                      AND link.kind = 'symbol'
                      AND preview.status = 'ready'
                      AND preview.file_path <> ''
                    ORDER BY preview.created_at DESC
                    LIMIT 1
                ) symbol_preview ON true
                LEFT JOIN LATERAL (
                    SELECT preview.id AS preview_id
                    FROM revision_previews link
                    JOIN asset_preview_versions preview
                      ON preview.id = link.preview_id
                    WHERE link.revision_id = revision.id
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
                "trg_remote_heads_previews",
                "revision_previews",
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

    def _ensure_postgres_search_indexes(self) -> None:
        # Trigram search keeps the existing forgiving catalog query behavior while
        # avoiding full scans at tens of thousands of components. Extension creation
        # can be disallowed on managed databases, so degrade to ordinary indexes.
        with self._connect() as conn:
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

    def _ensure_postgres_integrity_guards(self) -> None:
        with self._connect() as conn:
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
            conn.execute(
                """
                INSERT INTO catalog_meta (key, value) VALUES (%s, %s)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """,
                ("postgres_integrity_guards_version", POSTGRES_INTEGRITY_GUARDS_VERSION),
            )
            conn.commit()

    def _clone_revision(self, conn: Any, component_id: str, **kwargs: Any) -> dict[str, Any]:
        # Serialize version allocation and head updates per component. The unique
        # (component_id, version) constraint remains the final invariant.
        conn.execute("SELECT id FROM components WHERE id = %s FOR UPDATE", (component_id,)).fetchone()
        return super()._clone_revision(conn, component_id, **kwargs)

    def _lock_component_for_mutation(self, conn: Any, component_id: str) -> None:
        conn.execute("SELECT id FROM components WHERE id = %s FOR UPDATE", (component_id,)).fetchone()

    def _append_audit_event(self, conn: Any, *, component_id: str, **kwargs: Any) -> None:
        # Prevent audit forks when independent workflow/import requests arrive at once.
        conn.execute("SELECT id FROM components WHERE id = %s FOR UPDATE", (component_id,)).fetchone()
        super()._append_audit_event(conn, component_id=component_id, **kwargs)

    def _unique_slug(self, conn: Any, base: str) -> str:
        # Stable transaction-scoped advisory lock eliminates concurrent slug races.
        conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"catalog-slug:{base}",)).fetchone()
        return super()._unique_slug(conn, base)

    def _lock_component_identity(self, conn: Any, manufacturer: str, mpn: str) -> None:
        normalized = f"{manufacturer.strip().casefold()}\n{mpn.strip().casefold()}"
        conn.execute(
            "SELECT pg_advisory_xact_lock(hashtext(%s))",
            (f"catalog-component-identity:{normalized}",),
        ).fetchone()

    def close(self) -> None:
        with self._lock:
            self._initialized = False


__all__ = [
    "ComponentCatalogPostgresService",
    "_postgres_dsn",
    "_split_sql_script",
    "POSTGRES_SCHEMA_VERSION",
]
