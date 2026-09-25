from __future__ import annotations

import hashlib
import importlib.util
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


POSTGRES_URL = os.environ.get("LEGACY_SURVIVOR_TEST_POSTGRES_URL", "").strip()
SCRIPT = next(
    candidate
    for candidate in (
        Path(__file__).resolve().parents[2] / "scripts" / "migrate_legacy_catalog_survivors.py",
        Path(__file__).resolve().parents[1] / "scripts" / "migrate_legacy_catalog_survivors.py",
    )
    if candidate.is_file()
)
SPEC = importlib.util.spec_from_file_location("legacy_catalog_survivors_integration", SCRIPT)
assert SPEC and SPEC.loader
migration = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(migration)


@unittest.skipUnless(
    POSTGRES_URL,
    "LEGACY_SURVIVOR_TEST_POSTGRES_URL must point to a disposable PostgreSQL database",
)
class LegacyCatalogSurvivorPostgresIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ModuleNotFoundError as exc:  # pragma: no cover - integration environment guard
            self.skipTest(f"psycopg is unavailable: {exc}")
        self.psycopg = psycopg
        self.dict_row = dict_row
        self.tempdir = tempfile.TemporaryDirectory()
        self.projects_root = Path(self.tempdir.name) / "projects"
        self.store_root = self.projects_root / ".kicad-prism" / "components"
        self.store_root.mkdir(parents=True)
        self._create_legacy_fixture()

    def tearDown(self) -> None:
        with self.psycopg.connect(POSTGRES_URL, autocommit=True) as conn:
            conn.execute("DROP SCHEMA IF EXISTS catalog CASCADE")
        self.tempdir.cleanup()

    def _create_legacy_fixture(self) -> None:
        with self.psycopg.connect(POSTGRES_URL, row_factory=self.dict_row, autocommit=True) as conn:
            conn.execute("DROP SCHEMA IF EXISTS catalog CASCADE")
            conn.execute("CREATE SCHEMA catalog")
            conn.execute(
                """
                CREATE TABLE catalog.components (
                    id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, source TEXT NOT NULL,
                    external_source TEXT NOT NULL DEFAULT '', external_id TEXT NOT NULL DEFAULT '',
                    stock_quantity DOUBLE PRECISION NOT NULL DEFAULT 0, stock_uom TEXT NOT NULL DEFAULT '',
                    inventory_status TEXT NOT NULL DEFAULT '', last_synced_at TEXT,
                    is_active INTEGER NOT NULL DEFAULT 1, current_revision_id TEXT NOT NULL,
                    released_revision_id TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE catalog.component_revisions (
                    id TEXT PRIMARY KEY, component_id TEXT NOT NULL REFERENCES catalog.components(id),
                    version INTEGER NOT NULL, parent_revision_id TEXT NOT NULL DEFAULT '',
                    change_kind TEXT NOT NULL, change_summary TEXT NOT NULL, created_by TEXT NOT NULL,
                    manifest_hash TEXT NOT NULL DEFAULT '', manifest_schema TEXT NOT NULL DEFAULT '',
                    release_status TEXT NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL,
                    description TEXT NOT NULL, datasheet_url TEXT NOT NULL, manufacturer TEXT NOT NULL,
                    mpn TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', package_name TEXT NOT NULL DEFAULT '',
                    vendor TEXT NOT NULL DEFAULT '', vendor_part_number TEXT NOT NULL DEFAULT '',
                    extra_fields TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    UNIQUE(component_id, version)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE catalog.assets (
                    id TEXT PRIMARY KEY, asset_type TEXT NOT NULL, name TEXT NOT NULL,
                    canonical_path TEXT NOT NULL, target_library TEXT NOT NULL DEFAULT '',
                    target_name TEXT NOT NULL DEFAULT '', source_group TEXT NOT NULL DEFAULT '',
                    sha256 TEXT NOT NULL, size_bytes BIGINT NOT NULL, content_type TEXT NOT NULL,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE catalog.revision_assets (
                    revision_id TEXT NOT NULL REFERENCES catalog.component_revisions(id),
                    asset_type TEXT NOT NULL, asset_id TEXT NOT NULL REFERENCES catalog.assets(id),
                    required INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    PRIMARY KEY(revision_id, asset_id)
                )
                """
            )

            assets = [
                ("manual-symbol", "symbol", "Manual.kicad_sym", "Manual", "ManualPart"),
                ("manual-footprint", "footprint", "Manual.kicad_mod", "Manual", "ManualFootprint"),
                ("footprint-only", "footprint", "Connector.kicad_mod", "Legacy", "Connector"),
                ("cern-symbol", "symbol", "Cern.kicad_sym", "CERN", "CernPart"),
                ("cern-footprint", "footprint", "Cern.kicad_mod", "CERN", "CernFootprint"),
            ]
            for asset_id, asset_type, filename, library, target in assets:
                path = self.store_root / asset_type / filename
                path.parent.mkdir(parents=True, exist_ok=True)
                payload = f"fixture:{asset_id}\n".encode()
                path.write_bytes(payload)
                conn.execute(
                    """
                    INSERT INTO catalog.assets (
                        id, asset_type, name, canonical_path, target_library, target_name,
                        source_group, sha256, size_bytes, content_type, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, 'fixture', %s, %s, 'text/plain', '2026-01-01', '2026-01-01')
                    """,
                    (
                        asset_id,
                        asset_type,
                        filename,
                        str(path),
                        library,
                        target,
                        hashlib.sha256(payload).hexdigest(),
                        len(payload),
                    ),
                )

            components = [
                ("cern-component", "cern-component", "cern-revision", "cern-revision"),
                ("manual-component", "manual-component", "manual-revision", "manual-revision"),
                ("footprint-component", "footprint-component", "footprint-edit", "footprint-edit"),
            ]
            for component_id, slug, current_revision, released_revision in components:
                conn.execute(
                    """
                    INSERT INTO catalog.components (
                        id, slug, source, current_revision_id, released_revision_id, created_at, updated_at
                    ) VALUES (%s, %s, 'manual', %s, %s, '2026-01-01', '2026-01-02')
                    """,
                    (component_id, slug, current_revision, released_revision),
                )

            revisions = [
                (
                    "cern-revision", "cern-component", 1, "", "system:import_database_library",
                    "Imported from database library", "CERN Part", "CERN", "CERN-1",
                ),
                (
                    "manual-revision", "manual-component", 1, "", "rajesh@pixxel.co.in",
                    "Create component metadata record", "Manual Part", "Pixxel", "PX-1",
                ),
                (
                    "footprint-original", "footprint-component", 1, "", "system:import_footprint_library",
                    "Imported from footprint library", "Connector", "", "",
                ),
                (
                    "footprint-edit", "footprint-component", 2, "footprint-original", "rajesh@pixxel.co.in",
                    "Edit footprint metadata", "Connector edited", "", "",
                ),
            ]
            for revision_id, component_id, version, parent, creator, summary, name, manufacturer, mpn in revisions:
                conn.execute(
                    """
                    INSERT INTO catalog.component_revisions (
                        id, component_id, version, parent_revision_id, change_kind, change_summary,
                        created_by, release_status, name, value, description, datasheet_url,
                        manufacturer, mpn, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, 'import', %s, %s, 'released', %s, %s, %s, %s, %s, %s, '2026-01-01', '2026-01-02')
                    """,
                    (
                        revision_id,
                        component_id,
                        version,
                        parent,
                        summary,
                        creator,
                        name,
                        name,
                        f"Description for {name}",
                        "https://example.com/datasheet.pdf",
                        manufacturer,
                        mpn,
                    ),
                )

            links = [
                ("cern-revision", "cern-symbol", "symbol"),
                ("cern-revision", "cern-footprint", "footprint"),
                ("manual-revision", "manual-symbol", "symbol"),
                ("manual-revision", "manual-footprint", "footprint"),
                ("footprint-original", "footprint-only", "footprint"),
                ("footprint-edit", "footprint-only", "footprint"),
            ]
            for revision_id, asset_id, asset_type in links:
                conn.execute(
                    """
                    INSERT INTO catalog.revision_assets (
                        revision_id, asset_type, asset_id, required, created_at, updated_at
                    ) VALUES (%s, %s, %s, 1, '2026-01-01', '2026-01-02')
                    """,
                    (revision_id, asset_type, asset_id),
                )

    def test_export_reset_restore_preserves_manual_and_librarian_components(self) -> None:
        archive_path = Path(self.tempdir.name) / "survivors.zip"
        export_report = migration.export_archive(
            SimpleNamespace(
                database_url=POSTGRES_URL,
                projects_root=str(self.projects_root),
                output=archive_path,
                librarian_actor="rajesh@pixxel.co.in",
                expect_survivors=2,
                expect_librarian=2,
                expect_excluded_cern=1,
            )
        )
        manifest, payloads = migration.read_archive(archive_path)
        self.assertEqual(export_report["survivor_components"], 2)
        self.assertEqual(manifest["summary"]["survivor_components"], 2)
        self.assertEqual(manifest["summary"]["librarian_impacted_components"], 2)
        self.assertNotIn("cern-component", {row["id"] for row in manifest["components"]})

        shutil.rmtree(self.store_root)

        with self.psycopg.connect(POSTGRES_URL, autocommit=True) as conn:
            conn.execute("DROP SCHEMA catalog CASCADE")

        from app.services.component_catalog_service_postgres import ComponentCatalogPostgresService

        service = ComponentCatalogPostgresService(store_root=self.store_root, database_url=POSTGRES_URL)
        service.initialize()
        plans = migration._component_restore_plan(manifest)
        with service._connect() as conn:  # type: ignore[attr-defined]
            migration._preflight_destination(conn, plans)
            required_asset_ids = {
                str(link["asset_id"])
                for plan in plans
                for revision_plan in plan["active_revisions"]
                for link in revision_plan["links"]
            }
            mapping = migration._restore_asset_payloads(
                service,
                conn,
                manifest=manifest,
                payloads=payloads,
                required_asset_ids=required_asset_ids,
            )
            restored = [
                migration._insert_restored_component(
                    service,
                    conn,
                    plan=plan,
                    asset_mapping=mapping,
                )
                for plan in plans
            ]
            conn.commit()

        self.assertEqual({item["component_id"] for item in restored}, {"manual-component", "footprint-component"})
        manual = service.get_component("manual-component")
        self.assertIsNotNone(manual)
        self.assertEqual((manual or {})["manufacturer"], "Pixxel")
        self.assertEqual((manual or {})["mpn"], "PX-1")
        self.assertEqual(len((manual or {})["representations"]), 1)
        self.assertEqual((manual or {})["release_status"], "released")

        footprint = service.get_component("footprint-component")
        self.assertIsNotNone(footprint)
        self.assertEqual((footprint or {})["name"], "Connector edited")
        self.assertEqual((footprint or {})["identity_kind"], "provisional_ipn")
        self.assertEqual((footprint or {})["release_status"], "open")
        self.assertEqual(len((footprint or {})["representations"]), 1)
        self.assertIsNone(service.get_component("cern-component"))
        self.assertTrue((self.store_root / "legacy-survivors").is_dir())
        service.close()


if __name__ == "__main__":
    unittest.main()
