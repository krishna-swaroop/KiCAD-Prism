from __future__ import annotations

import logging
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from app.services.catalog.locking import PostgresCatalogLocks
from app.services.catalog.postgres_runtime import (
    CatalogPostgresConnection,
    PostgresCatalogRuntime,
)
from app.services.catalog.postgres_integrity import (
    ensure_postgres_integrity_guards,
    ensure_postgres_search_indexes,
)
from app.services.catalog.postgres_projections import (
    ensure_component_heads_projection,
    ensure_remote_component_heads_projection,
)
from app.services.catalog.postgres_schema import CATALOG_SCHEMA_EPOCH
from app.services.catalog_schema_migrations import CATALOG_LEDGER
from app.services.component_catalog_domain import ComponentCatalogDomainService

logger = logging.getLogger(__name__)


class ComponentCatalogPostgresService(ComponentCatalogDomainService):
    """PostgreSQL-backed catalog with the existing stable domain/API contract.

    The file store remains content-addressed on the shared projects volume. PostgreSQL
    owns identities, revisions, workflow, usage, review, and audit state.
    """

    def __init__(self, store_root: Path | None = None, database_url: str | None = None) -> None:
        self._postgres_runtime = PostgresCatalogRuntime(database_url=database_url)
        super().__init__(
            store_root=store_root,
            database_url="postgres",
            catalog_locks=PostgresCatalogLocks(),
        )

    def _database_path(self, database_url: str | None) -> Path:
        # Retained only for the legacy service's diagnostic property. PostgreSQL does
        # not use this path and no data is written here.
        _ = database_url
        return Path("/dev/null")

    @contextmanager
    def _connect(self) -> Iterator[CatalogPostgresConnection]:
        with self._postgres_runtime.connect() as connection:
            yield connection

    def component_identities(self, component_ids: list[str]) -> dict[str, tuple[str, str]]:
        """Manufacturer and MPN per active component id, without building any component payload."""
        self.initialize()
        with self._connect() as conn:
            return self._component_read_models.identities(conn, component_ids)

    def component_inventory(self, component_ids: list[str]) -> dict[str, dict[str, Any]]:
        """Our own stock per component id (the preferred aggregate), for components that have any."""
        if not component_ids:
            return {}
        self.initialize()
        with self._connect() as conn:
            return self._component_read_models.local_inventory_for(conn, component_ids)

    def initialize(self) -> None:
        runtime = self._catalog_runtime
        with runtime.initialization_lock:
            if runtime.initialized:
                return
            self._ensure_storage_dirs()
            CATALOG_LEDGER.migrate(
                self._connect,
                before=(self._refuse_or_reset_pre_epoch,),
                after=(self._reconcile_projections,),
            )
            self._ensure_postgres_search_indexes()
            self._ensure_postgres_integrity_guards()
            runtime.fts_available = False
            runtime.initialized = True

    def _refuse_or_reset_pre_epoch(self, conn: CatalogPostgresConnection) -> None:
        """Refuse a populated catalog from before epoch 2; drop an empty one."""
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

    def _reconcile_projections(self, conn: CatalogPostgresConnection) -> None:
        """Rebuild a head projection whose definition version changed (derived state)."""
        self._ensure_component_heads_projection(conn)
        self._ensure_remote_component_heads_projection(conn)

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


__all__ = ["ComponentCatalogPostgresService"]
