from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

from app.services.comments_store_service import CommentsStoreService
from app.services.component_catalog_service_postgres import ComponentCatalogPostgresService
from app.services.local_artifact_store import LocalArtifactStore
from app.services.workspace_service import WorkspaceService


POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()


@unittest.skipUnless(
    POSTGRES_URL,
    "PRISM_DATABASE_URL is required for PostgreSQL schema-switching tests",
)
class SharedPostgresSchemaSwitchingTests(unittest.TestCase):
    def test_initialization_is_idempotent_and_each_service_selects_its_schema(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace = WorkspaceService()
            comments = CommentsStoreService()
            catalog = ComponentCatalogPostgresService(
                store_root=Path(temporary) / "catalog",
                database_url=POSTGRES_URL,
            )
            artifacts = LocalArtifactStore(Path(temporary) / "artifacts")

            for service in (workspace, comments, catalog, artifacts):
                service.initialize()
                service.initialize()

            expected = (
                (workspace, 'workspace, public'),
                (comments, 'comments, public'),
                (catalog, 'catalog, public'),
                (artifacts, 'operations, catalog, public'),
                # Re-enter the first service after every alternate schema has
                # used the shared pool. Its per-call SET must still win.
                (workspace, 'workspace, public'),
            )
            for service, expected_path in expected:
                with service._connect() as connection:  # type: ignore[attr-defined]
                    raw = getattr(connection, "_connection", connection)
                    row = raw.execute("SHOW search_path").fetchone()
                    actual = next(iter(row.values())) if isinstance(row, dict) else row[0]
                    self.assertEqual(actual, expected_path)


if __name__ == "__main__":
    unittest.main()
