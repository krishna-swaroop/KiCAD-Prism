from __future__ import annotations

import logging
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from app.services.catalog.component_history import CatalogComponentHistoryReads
from app.services.catalog.component_read_models import CatalogComponentReadModels
from app.services.catalog.component_queries import CatalogComponentQueries
from app.services.catalog.locking import CatalogLockOperations, PostgresCatalogLocks
from app.services.catalog.project_import_assets import CatalogProjectImportAssets
from app.services.catalog.revision_comparison import CatalogRevisionComparison
from app.services.catalog.revision_kernel import CatalogRevisionKernel
from app.services.catalog.postgres_runtime import (
    CatalogPostgresConnection,
    PostgresCatalogRuntime,
    _postgres_dsn,
    _split_sql_script,
)
from app.services.catalog.postgres_integrity import (
    POSTGRES_INTEGRITY_GUARDS_VERSION,
    POSTGRES_SEARCH_VERSION,
    ensure_postgres_integrity_guards,
    ensure_postgres_search_indexes,
)
from app.services.catalog.postgres_projections import (
    POSTGRES_HEAD_PROJECTION_VERSION,
    POSTGRES_REMOTE_HEAD_PROJECTION_VERSION,
    ensure_component_heads_projection,
    ensure_remote_component_heads_projection,
)
from app.services.catalog.postgres_schema import (
    CATALOG_SCHEMA_EPOCH,
    POSTGRES_SCHEMA_VERSION,
    create_base_schema,
)
from app.services.catalog_schema_migrations import apply_catalog_migrations
from app.services.component_catalog_domain import ComponentCatalogDomainService

logger = logging.getLogger(__name__)


class ComponentCatalogPostgresService(ComponentCatalogDomainService):
    """PostgreSQL-backed catalog with the existing stable domain/API contract.

    The file store remains content-addressed on the shared projects volume. PostgreSQL
    owns identities, revisions, workflow, usage, review, and audit state.
    """

    _catalog_locks: CatalogLockOperations = PostgresCatalogLocks()
    _revision_kernel: CatalogRevisionKernel = CatalogRevisionKernel(_catalog_locks)
    _revision_comparison: CatalogRevisionComparison = CatalogRevisionComparison(_revision_kernel)
    _component_history_reads: CatalogComponentHistoryReads = CatalogComponentHistoryReads(_revision_kernel)
    _component_read_models: CatalogComponentReadModels = CatalogComponentReadModels(_revision_kernel)
    _component_queries: CatalogComponentQueries = CatalogComponentQueries(_component_read_models)
    _project_import_assets: CatalogProjectImportAssets = CatalogProjectImportAssets(_revision_kernel)

    def __init__(self, store_root: Path | None = None, database_url: str | None = None) -> None:
        self._postgres_runtime = PostgresCatalogRuntime(database_url=database_url)
        super().__init__(store_root=store_root, database_url="postgres")
        self._catalog_locks = PostgresCatalogLocks()
        self._revision_kernel = CatalogRevisionKernel(self._catalog_locks)
        self._revision_comparison = CatalogRevisionComparison(self._revision_kernel)
        self._component_history_reads = CatalogComponentHistoryReads(self._revision_kernel)
        self._component_read_models = CatalogComponentReadModels(self._revision_kernel)
        self._component_queries = CatalogComponentQueries(self._component_read_models)
        self._project_import_assets = CatalogProjectImportAssets(self._revision_kernel)

    def _database_path(self, database_url: str | None) -> Path:
        # Retained only for the legacy service's diagnostic property. PostgreSQL does
        # not use this path and no data is written here.
        _ = database_url
        return Path("/dev/null")

    @contextmanager
    def _connect(self) -> Iterator[CatalogPostgresConnection]:
        with self._postgres_runtime.connect() as connection:
            yield connection

    def initialize(self) -> None:
        runtime = self._catalog_runtime
        with runtime.initialization_lock:
            if runtime.initialized:
                return
            self._ensure_storage_dirs()
            with self._connect() as conn:
                conn.execute(
                    "SELECT pg_advisory_xact_lock(hashtext(%s))",
                    ("prism-component-catalog-schema",),
                ).fetchone()
                conn.execute("CREATE SCHEMA IF NOT EXISTS catalog")
                conn.execute("SET search_path TO catalog, public")
                existing_catalog = conn.execute(
                    "SELECT to_regclass('catalog.components') AS relation"
                ).fetchone()
                if existing_catalog and existing_catalog["relation"]:
                    epoch_table = conn.execute(
                        "SELECT to_regclass('catalog.catalog_meta') AS relation"
                    ).fetchone()
                    epoch = None
                    if epoch_table and epoch_table["relation"]:
                        epoch = conn.execute(
                            "SELECT value FROM catalog_meta WHERE key = %s",
                            ("catalog_schema_epoch",),
                        ).fetchone()
                    if not epoch or str(epoch["value"]) != CATALOG_SCHEMA_EPOCH:
                        populated = conn.execute(
                            "SELECT EXISTS (SELECT 1 FROM components LIMIT 1) AS populated"
                        ).fetchone()
                        if populated and populated["populated"]:
                            raise RuntimeError(
                                "Catalog schema epoch 2 is required. Back up Prism, run the "
                                "catalog-only reset, then restart before importing components."
                            )
                        conn.execute("DROP SCHEMA catalog CASCADE")
                        conn.execute("CREATE SCHEMA catalog")
                        conn.execute("SET search_path TO catalog, public")
                # Every statement below is CREATE ... IF NOT EXISTS, so running
                # this on an existing database adds whatever a new release
                # introduced and leaves everything else untouched. An older
                # Prism reaching this database still finds the schema-version
                # row it insists on, which is what keeps a rollback from
                # needing a data restore.
                create_base_schema(conn)
                conn.execute(
                    "INSERT INTO catalog_meta(key, value) VALUES (%s, %s) "
                    "ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
                    ("catalog_schema_epoch", CATALOG_SCHEMA_EPOCH),
                )
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
                self._metadata_schema.ensure_schema(conn)
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
            runtime.fts_available = False
            runtime.initialized = True

    def _ensure_component_heads_projection(self, conn: CatalogPostgresConnection) -> None:
        """Install the current-head read model and its transactional refresh hooks."""
        ensure_component_heads_projection(conn)

    def _ensure_remote_component_heads_projection(self, conn: CatalogPostgresConnection) -> None:
        """Install the released-only read model used by the KiCad provider."""
        ensure_remote_component_heads_projection(conn)

    def _ensure_postgres_search_indexes(self) -> None:
        ensure_postgres_search_indexes(self._postgres_runtime)

    def _ensure_postgres_integrity_guards(self) -> None:
        ensure_postgres_integrity_guards(self._postgres_runtime)

    def close(self) -> None:
        self._catalog_runtime.close()


__all__ = [
    "ComponentCatalogPostgresService",
    "_postgres_dsn",
    "_split_sql_script",
    "POSTGRES_SCHEMA_VERSION",
]
