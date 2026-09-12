from __future__ import annotations

import os
import sys
import tempfile
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
import base64
import csv
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sqlite3
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.catalog.asset_imports import CatalogAssetImports  # noqa: E402
from app.services.catalog.asset_registry import CatalogAssetRegistry  # noqa: E402
from app.services.catalog.postgres_runtime import CatalogPostgresConnection, PostgresCatalogRuntime  # noqa: E402
from app.services.catalog.inventory_csv import CatalogInventoryCsv  # noqa: E402
from app.services.catalog.preview_pipeline import CatalogPreviewPipeline  # noqa: E402
from app.services.catalog.preview_renderer import CatalogPreviewRenderer  # noqa: E402
from app.services.catalog_schema_migrations import (  # noqa: E402
    MIGRATIONS,
    pending_catalog_migrations,
)
from app.services.component_catalog_domain import (  # noqa: E402
    PREVIEW_PIPELINE_VERSION,
    PREVIEW_STATUS_READY,
)
from app.services.component_catalog_service_postgres import (  # noqa: E402
    POSTGRES_SCHEMA_VERSION,
    ComponentCatalogPostgresService,
)


POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
APPLICATION_POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()

UUID_TEXT = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
    re.IGNORECASE,
)
FIXTURE_TOKEN = re.compile(r"assets-[0-9a-f]{8}", re.IGNORECASE)
ISO_TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$")
SHA256_TEXT = re.compile(r"[0-9a-f]{64}", re.IGNORECASE)

# Revision A3 manifests embed representation asset UUIDs, so this test's
# ``manifest_hash`` changes every run. Preview SVG bytes and generator
# identity are supplied by a deterministic fixture renderer: GitHub Actions
# has no kicad-cli, and a host/Docker KiCad version would otherwise move
# both the preview hash and the retained fingerprint.
VOLATILE_HASH_PATHS = frozenset({("manifest_hash",)})

FIXTURE_PREVIEW_SVG = b'<svg xmlns="http://www.w3.org/2000/svg"/>'
FIXTURE_PREVIEW_SHA256 = hashlib.sha256(FIXTURE_PREVIEW_SVG).hexdigest()


def _fixture_preview_identity(kind: str) -> dict[str, str]:
    canonical = json.dumps(
        {
            "generator_name": "kicad-cli",
            "generator_version": "fixture",
            "pipeline_version": PREVIEW_PIPELINE_VERSION,
            "kind": kind,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return {
        "generator_name": "kicad-cli",
        "generator_version": "fixture",
        "pipeline_version": PREVIEW_PIPELINE_VERSION,
        "generator_fingerprint": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
    }


FIXTURE_SYMBOL_PREVIEW_FINGERPRINT = _fixture_preview_identity("symbol")[
    "generator_fingerprint"
]
FIXTURE_FOOTPRINT_PREVIEW_FINGERPRINT = _fixture_preview_identity("footprint")[
    "generator_fingerprint"
]

COMPONENT_PAYLOAD_KEYS = (
    "id", "slug", "external_source", "external_id", "external_workflow_source",
    "external_workflow_id", "external_workflow_url", "external_url", "external_payload",
    "external_updated_at", "sync_status", "sync_error", "source", "identity_kind", "name",
    "value", "manufacturer", "mpn", "description", "package_name", "category",
    "datasheet_url", "vendor", "vendor_part_number", "mass_g", "rqjc_c_w",
    "rqjc_top_c_w", "temp_max_c", "temp_min_c", "power_dissipation_w", "rate",
    "sap_code", "keywords", "extra_fields", "availability_state", "missing_assets",
    "place_enabled", "local_inventory", "stock_known", "stock_quantity", "stock_uom",
    "inventory_status", "supply", "serial_number", "lot_number", "pedigree",
    "last_synced_at", "is_active", "revision_id", "revision", "version",
    "parent_revision_id", "change_kind", "change_summary", "created_by", "manifest_hash",
    "component_created_at", "component_updated_at", "revision_created_at",
    "revision_updated_at", "current_revision_id", "released_revision_id",
    "is_historical_revision", "summary", "library_name", "symbol_name", "representations",
    "default_representation_id", "effective_representation_id", "release_status",
    "workflow_stage", "released_view", "assets", "previews", "validation",
)


def _hash_path_is_volatile(path: tuple[str, ...]) -> bool:
    for volatile in VOLATILE_HASH_PATHS:
        if path[-len(volatile) :] == volatile:
            return True
    return False


def _normalize_contract(value: object, path: tuple[str, ...] = ()) -> object:
    """Remove only per-run identities, timestamps, and temporary store roots."""

    if isinstance(value, dict):
        return {
            key: _normalize_contract(item, path + (str(key),))
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_normalize_contract(item, path) for item in value]
    if not isinstance(value, str):
        return value
    if ISO_TIMESTAMP.fullmatch(value):
        return "<timestamp>"
    normalized = FIXTURE_TOKEN.sub("assets-<token>", value)
    normalized = UUID_TEXT.sub("<uuid>", normalized)
    if _hash_path_is_volatile(path):
        normalized = SHA256_TEXT.sub("<sha256>", normalized)
    marker = normalized.find("/components/")
    if marker >= 0 and (normalized.startswith("/") or normalized.startswith("<store>")):
        normalized = "<store>" + normalized[marker:]
    elif normalized.startswith(("/tmp/", "/private/tmp/", "/var/folders/")):
        normalized = "<temporary-path>"
    return normalized


def _contract_digest(value: object) -> str:
    normalized = _normalize_contract(value)
    encoded = json.dumps(
        normalized,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _normalize_contract_bytes(value: bytes) -> bytes:
    normalized = re.sub(
        rb"assets-[0-9a-f]{8}", b"assets-<token>", value, flags=re.IGNORECASE
    )
    return re.sub(
        rb"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
        b"<uuid>",
        normalized,
        flags=re.IGNORECASE,
    )


def _database_identity(url: str) -> tuple[str, str, int | None, str]:
    parsed = urlsplit(url)
    return (
        parsed.username or "",
        (parsed.hostname or "").lower(),
        parsed.port,
        parsed.path.lstrip("/"),
    )


SHARED_APPLICATION_DATABASE = bool(
    POSTGRES_URL
    and APPLICATION_POSTGRES_URL
    and _database_identity(POSTGRES_URL) == _database_identity(APPLICATION_POSTGRES_URL)
)


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for PostgreSQL integration tests")
@unittest.skipIf(
    SHARED_APPLICATION_DATABASE,
    "Component catalog integration tests require a dedicated PostgreSQL database; "
    "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL",
)
class ComponentCatalogPostgresIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.component_ids: list[str] = []
        self.metadata_field_ids: list[str] = []
        self.service = ComponentCatalogPostgresService(
            store_root=Path(self.tempdir.name) / "components",
            database_url=POSTGRES_URL,
        )
        self.service.initialize()

    def tearDown(self) -> None:
        # The database is explicitly isolated from the application database.
        # Deactivation keeps the test database's own audit chain valid while the
        # test database remains disposable as a unit. Custom metadata fields
        # are archived for the same reason: the DBL export contract hashes the
        # active field list, so a leaked field would fail the next run against
        # this database.
        for field_id in reversed(self.metadata_field_ids):
            self.service.set_metadata_field_archived(field_id, True, actor="integration-test@local")
        for component_id in reversed(self.component_ids):
            self.assertTrue(
                self.service.deactivate_component(
                    component_id,
                    actor="integration-test@local",
                    reason="PostgreSQL integration-test cleanup",
                ),
                f"failed to deactivate integration fixture {component_id}",
            )
            component = self.service.get_component(component_id)
            self.assertIsNotNone(component)
            self.assertFalse(bool((component or {}).get("is_active")))
        self.service.close()
        self.tempdir.cleanup()

    def _component(self, suffix: str = "") -> dict:
        token = suffix or uuid.uuid4().hex[:10]
        component = self.service.create_manual_component(
            value="10k",
            description="PostgreSQL catalog integration component",
            datasheet="https://example.com/r.pdf",
            manufacturer="Prism Integration",
            manufacturer_part_number=f"PG-R-{token}",
            actor="author@example.com",
        )
        self.component_ids.append(str(component["id"]))
        return component

    def _install_deterministic_preview_renderer(self) -> None:
        """Keep preview evidence independent of kicad-cli availability and version."""

        for target, value in (
            ("app.core.config.settings.CATALOG_KLC_ENABLED", False),
            ("app.core.config.settings.CATALOG_KLC_RELEASE_GATE", "warn"),
            (
                "app.core.config.settings.SESSION_SECRET",
                "catalog-contract-test-secret",
            ),
        ):
            settings_patcher = patch(target, value)
            settings_patcher.start()
            self.addCleanup(settings_patcher.stop)

        def generate_symbol_units(_asset: object, _run: object) -> tuple[str, list[tuple[int, bytes]]]:
            return PREVIEW_STATUS_READY, [(1, FIXTURE_PREVIEW_SVG)]

        def generate_footprint(_asset: object, _run: object) -> tuple[str, bytes]:
            return PREVIEW_STATUS_READY, FIXTURE_PREVIEW_SVG

        def preview_identity(_runtime: object, kind: str) -> dict[str, str]:
            return _fixture_preview_identity(kind)

        def preserve_symbol_upload(
            _runtime: object,
            _upload_name: str,
            payload: bytes,
        ) -> bytes:
            # The contract fixture must not depend on whether this runtime has
            # kicad-cli. The canonical single-symbol extraction remains real.
            return payload

        def no_existing_asset_signature(*_args: object, **_kwargs: object) -> None:
            # Each test run owns a temporary store. Do not reuse immutable
            # asset rows whose previous backing files were removed at teardown.
            return None

        # Patch the package seams the service composes. They are static
        # methods, so the replacement is wrapped to stay callable through both
        # the class and an instance.
        for owner, target, replacement in (
            (CatalogAssetRegistry, "asset_by_signature", no_existing_asset_signature),
            (CatalogAssetImports, "normalize_symbol_upload", preserve_symbol_upload),
            (CatalogPreviewRenderer, "generate_symbol_preview_units", generate_symbol_units),
            (CatalogPreviewRenderer, "generate_footprint_preview", generate_footprint),
            (CatalogPreviewPipeline, "generator_identity", preview_identity),
        ):
            patcher = patch.object(owner, target, staticmethod(replacement))
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_concurrent_creation_allows_one_manufacturer_mpn_identity(self) -> None:
        token = "identity-" + uuid.uuid4().hex[:8]

        def create() -> tuple[str, str]:
            try:
                component = self.service.create_manual_component(
                    value="part",
                    description="Concurrent identity fixture",
                    datasheet="https://example.com/identity.pdf",
                    manufacturer="Prism Identity",
                    manufacturer_part_number=token,
                    actor="author@example.com",
                )
                return "ok", str(component["id"])
            except ValueError as exc:
                return "duplicate", str(exc)

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: create(), range(2)))
        successful = [value for status, value in results if status == "ok"]
        self.assertEqual(len(successful), 1)
        self.component_ids.extend(successful)
        self.assertEqual([status for status, _ in results].count("duplicate"), 1)

    def test_cern_scoped_reset_preserves_non_cern_components(self) -> None:
        manual = self._component("reset-manual-" + uuid.uuid4().hex[:8])
        imported = self.service.create_manual_component(
            value="cern",
            description="CERN reset fixture",
            datasheet="https://example.com/cern.pdf",
            manufacturer="CERN Reset Fixture",
            manufacturer_part_number="CERN-" + uuid.uuid4().hex[:8],
            actor="system:import_database_library",
        )
        imported_id = str(imported["id"])
        with self.service._connect() as conn:  # type: ignore[attr-defined]
            conn.execute(
                "UPDATE components SET source = 'import', external_source = %s, external_id = %s WHERE id = %s",
                ("cern-database-library", "cern:CERN", imported_id),
            )
            conn.commit()

        script = Path(__file__).resolve().parents[2] / "scripts" / "reset_prism_catalog.py"
        spec = importlib.util.spec_from_file_location("prism_catalog_reset", script)
        assert spec and spec.loader
        reset_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(reset_module)

        with self.service._connect() as conn:  # type: ignore[attr-defined]
            component_count, _, _ = reset_module._delete_cern_imports(conn, dry_run=True)
            self.assertEqual(component_count, 1)
            component_count, orphan_count, _ = reset_module._delete_cern_imports(conn, dry_run=False)
            conn.commit()
        self.assertEqual(component_count, 1)
        self.assertEqual(orphan_count, 0)
        self.assertIsNone(self.service.get_component(imported_id))
        self.assertIsNotNone(self.service.get_component(str(manual["id"])))
        with self.service._connect() as conn:  # type: ignore[attr-defined]
            with self.assertRaisesRegex(Exception, "immutable catalog evidence"):
                conn.execute("DELETE FROM components WHERE id = %s", (manual["id"],))
            conn.rollback()

    def test_provisional_identity_is_draft_only_and_can_be_corrected_to_mpn(self) -> None:
        token = uuid.uuid4().hex[:8]
        provisional = self.service.create_manual_component(
            name=f"IPN-{token}",
            value="provisional",
            description="Missing manufacturer MPN",
            datasheet="https://example.com/provisional.pdf",
            manufacturer="Prism Provisional",
            manufacturer_part_number="",
            identity_kind="provisional_ipn",
            identity_source="fixture",
            source_internal_part_number=f"IPN-{token}",
            actor="author@example.com",
        )
        self.component_ids.append(str(provisional["id"]))
        self.assertEqual(provisional["identity_kind"], "provisional_ipn")
        self.assertFalse(provisional["place_enabled"])
        self.service.set_release_status(provisional["id"], "in_progress", actor="author@example.com")
        review = self.service.set_release_status(provisional["id"], "qa_review", actor="author@example.com")
        with self.assertRaisesRegex(ValueError, "Provisional"):
            self.service.set_release_status(
                provisional["id"], "done", actor="qa@example.com",
                expected_revision_id=review["revision_id"],
                expected_manifest_hash=review["manifest_hash"],
            )
        corrected = self.service.update_component_metadata(
            provisional["id"],
            {"mpn": f"REAL-{token}"},
            actor="author@example.com",
            expected_revision_id=review["revision_id"],
        )
        assert corrected is not None
        self.assertEqual(corrected["identity_kind"], "mpn")
        self.assertEqual(corrected["mpn"], f"REAL-{token}")

    def test_inventory_distinguishes_unknown_zero_and_error(self) -> None:
        component = self._component("inventory-" + uuid.uuid4().hex[:8])
        self.assertFalse(component["stock_known"])
        result = self.service.import_inventory_csv(
            "component_id,manufacturer,mpn,quantity,uom,inventory_status\n"
            f"{component['id']},{component['manufacturer']},{component['mpn']},0,pcs,available\n"
        )
        self.assertEqual(result["updated"], 1)
        zero = self.service.get_component(component["id"])
        assert zero is not None
        self.assertTrue(zero["stock_known"])
        self.assertEqual(zero["stock_quantity"], 0)
        with self.service._connect() as conn:  # type: ignore[attr-defined]
            conn.execute(
                "UPDATE inventory_levels SET fetch_status = 'error' WHERE component_id = %s",
                (component["id"],),
            )
            conn.commit()
        errored = self.service.get_component(component["id"])
        assert errored is not None
        self.assertEqual(errored["local_inventory"]["fetch_status"], "error")

    def test_inventory_policy_survives_list_remote_projection_and_csv_roundtrip(self) -> None:
        self._install_deterministic_preview_renderer()
        component = self._complete_cad(self._component(), "InventoryPolicy")
        component_id = component["id"]
        for stage, actor in (("in_progress", "designer@example.com"), ("qa_review", "designer@example.com"),
                             ("done", "qa@example.com"), ("released", "designer@example.com")):
            component = self.service.set_release_status(
                component_id, stage, actor=actor,
                expected_revision_id=component["revision_id"],
                expected_manifest_hash=component["manifest_hash"],
            )
        runtime = PostgresCatalogRuntime(database_url=POSTGRES_URL)
        locations = [
            ("inventree", "a", 2, "pcs", "available", "ok", "2026-01-02T00:00:00.5Z"),
            ("inventree", "b", 3, "pcs", "reserved", "error", "2026-01-02T01:00:00+02:00"),
            ("csv", "", 2, "pcs", "available", "ok", "2026-01-01T00:00:00Z"),
            ("csv", "b", 3, "g", "available", "ok", "2026-01-01T00:00:00Z"),
            ("warehouse_x", "", 7, "pcs", "available", "ok", "2026-01-01T00:00:00Z"),
        ]
        with runtime.connect() as conn:
            for source, location, quantity, uom, status, fetch, stamp in locations:
                conn.execute(
                    """INSERT INTO inventory_levels
                       (source, component_id, location_key, source_record_id, quantity, uom,
                        inventory_status, fetch_status, fetched_at, updated_at)
                       VALUES (%s, %s, %s, '', %s, %s, %s, %s, %s, %s)""",
                    (source, component_id, location, quantity, uom, status, fetch, stamp, stamp),
                )
            conn.commit()
        detail = self.service.get_component(component_id)
        self.assertIsNotNone(detail)
        assert detail is not None
        sources = detail["supply"]["sources"]
        self.assertEqual([source["id"] for source in sources], ["inventree", "csv", "warehouse_x"])
        self.assertEqual(detail["stock_quantity"], 5)
        self.assertEqual(sources[0]["fetch_status"], "error")
        self.assertTrue(sources[0]["mixed_fetch"])
        self.assertTrue(sources[0]["mixed_status"])
        self.assertTrue(sources[0]["mixed_freshness"])
        self.assertEqual(sources[0]["fetched_at"], "2026-01-02T00:00:00.5Z")
        self.assertTrue(sources[1]["mixed_units"])
        self.assertEqual(sources[1]["stock"], 0)
        listed = self.service.list_components(query=component["mpn"], lightweight=False)["items"][0]
        self.assertEqual(listed["local_inventory"], detail["local_inventory"])
        self.assertEqual(listed["supply"], detail["supply"])
        remote = self.service.list_remote_component_heads(query=component["mpn"])["items"][0]
        self.assertEqual(remote["supply"], detail["supply"])

        exported = next(row for row in CatalogInventoryCsv.parse(self.service.export_inventory_csv())
                        if row["component_id"] == component_id)
        self.assertEqual(exported["quantity"], "")
        result = self.service.import_inventory_csv(CatalogInventoryCsv.render_export([exported]))
        self.assertEqual(result["updated"], 0)
        self.assertIn("quantity is required", result["errors"][0])
        self.assertEqual(self.service.get_component(component_id)["supply"], detail["supply"])

    def _capture_list_sql(self, **kwargs: object) -> tuple[list[str], dict]:
        captured: list[str] = []
        original = CatalogPostgresConnection.execute

        def execute(conn: object, sql: str, params: object = None) -> object:
            captured.append(str(sql))
            return original(conn, sql, params)

        with patch.object(CatalogPostgresConnection, "execute", execute):
            page = self.service.list_components(**kwargs)
        return captured, page

    @staticmethod
    def _is_representation_hydration(sql: str) -> bool:
        compact = " ".join(sql.split()).lower()
        return "from revision_representations" in compact and "where revision_id in" in compact

    @staticmethod
    def _is_inventory_hydration(sql: str) -> bool:
        compact = " ".join(sql.split()).lower()
        return "from inventory_levels" in compact

    def test_full_list_hydration_query_count_is_bounded_for_page_size(self) -> None:
        token = "hydrate-" + uuid.uuid4().hex[:8]
        fixtures: list[dict] = []
        for index in range(50):
            component = self.service.create_manual_component(
                value="10k",
                description="List hydration fixture",
                datasheet="https://example.com/hydrate.pdf",
                manufacturer=f"Hydrate {token}",
                manufacturer_part_number=f"HYD-{token}-{index:02d}",
                actor="author@example.com",
            )
            self.component_ids.append(str(component["id"]))
            fixtures.append(component)
        self._install_deterministic_preview_renderer()
        fixtures[24] = self._complete_cad(fixtures[24], f"HydrateCad{token[:8]}")
        csv_rows = [
            "component_id,manufacturer,mpn,quantity,uom,inventory_status",
            f"{fixtures[0]['id']},{fixtures[0]['manufacturer']},{fixtures[0]['mpn']},12,pcs,available",
            f"{fixtures[-1]['id']},{fixtures[-1]['manufacturer']},{fixtures[-1]['mpn']},3,pcs,available",
        ]
        self.assertEqual(self.service.import_inventory_csv("\n".join(csv_rows))["updated"], 2)

        one_sql, one_page = self._capture_list_sql(query=token, page=1, page_size=1)
        fifty_sql, fifty_page = self._capture_list_sql(query=token, page=1, page_size=50)
        self.assertEqual(one_page["total"], 50)
        self.assertEqual(len(one_page["items"]), 1)
        self.assertEqual(len(fifty_page["items"]), 50)
        self.assertEqual(len(one_sql), len(fifty_sql))
        self.assertEqual(sum(1 for sql in fifty_sql if self._is_representation_hydration(sql)), 1)
        self.assertEqual(sum(1 for sql in fifty_sql if self._is_inventory_hydration(sql)), 1)

        listed_by_id = {item["id"]: item for item in fifty_page["items"]}
        for fixture in (fixtures[0], fixtures[24], fixtures[-1]):
            detail = self.service.get_component(str(fixture["id"]))
            listed = listed_by_id[str(fixture["id"])]
            assert detail is not None
            self.assertEqual(listed["representations"], detail["representations"])
            self.assertEqual(listed["previews"], detail["previews"])
            self.assertEqual(listed["local_inventory"], detail["local_inventory"])
            self.assertEqual(listed["supply"], detail["supply"])
        cad_rep = next(
            item
            for item in listed_by_id[str(fixtures[24]["id"])]["representations"]
            if item["is_default"]
        )
        self.assertTrue(cad_rep["symbol"]["id"])
        self.assertTrue(cad_rep["footprint"]["id"])
        self.assertTrue(cad_rep["symbol"]["preview_id"])
        self.assertTrue(cad_rep["footprint"]["preview_id"])
        self.assertEqual(listed_by_id[str(fixtures[0]["id"])]["stock_quantity"], 12)
        self.assertEqual(listed_by_id[str(fixtures[-1]["id"])]["stock_quantity"], 3)
        self.assertFalse(listed_by_id[str(fixtures[24]["id"])]["stock_known"])

        light_sql, light_page = self._capture_list_sql(
            query=token, page=1, page_size=50, lightweight=True
        )
        self.assertEqual(len(light_page["items"]), 50)
        self.assertFalse(any(self._is_representation_hydration(sql) for sql in light_sql))
        self.assertFalse(any(self._is_inventory_hydration(sql) for sql in light_sql))
        self.assertIsNone(light_page["items"][0]["local_inventory"])

    def test_mpn_correction_updates_identity_and_rejects_conflicts(self) -> None:
        first = self._component("correction-a-" + uuid.uuid4().hex[:8])
        second = self._component("correction-b-" + uuid.uuid4().hex[:8])
        with self.assertRaisesRegex(ValueError, "already exists"):
            self.service.update_component_metadata(
                second["id"],
                {"manufacturer": first["manufacturer"], "mpn": first["mpn"]},
                actor="editor@example.com",
                expected_revision_id=second["revision_id"],
            )
        corrected_mpn = "corrected-" + uuid.uuid4().hex[:8]
        corrected = self.service.update_component_metadata(
            second["id"],
            {"mpn": corrected_mpn},
            actor="editor@example.com",
            expected_revision_id=second["revision_id"],
        )
        assert corrected is not None
        self.assertEqual(corrected["mpn"], corrected_mpn)

    def test_unchanged_metadata_patch_does_not_create_a_revision(self) -> None:
        component = self._component("unchanged-" + uuid.uuid4().hex[:8])
        before = self.service.list_component_revisions(component["id"])

        unchanged = self.service.update_component_metadata(
            component["id"],
            {},
            actor="editor@example.com",
            expected_revision_id=component["revision_id"],
        )

        assert unchanged is not None
        self.assertEqual(unchanged["revision_id"], component["revision_id"])
        self.assertEqual(self.service.list_component_revisions(component["id"]), before)

    def test_concurrent_edits_serialize_head_and_audit(self) -> None:
        component = self._component("concurrent-" + uuid.uuid4().hex[:8])
        expected_revision_id = component["revision_id"]

        def update(description: str) -> tuple[str, str]:
            try:
                updated = self.service.update_component_metadata(
                    component["id"],
                    {"description": description},
                    actor="editor@example.com",
                    change_summary=description,
                    expected_revision_id=expected_revision_id,
                )
                return ("ok", str(updated["revision_id"]))
            except ValueError as exc:
                return ("conflict", str(exc))

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(update, ("Concurrent edit A", "Concurrent edit B")))

        self.assertEqual([status for status, _ in results].count("ok"), 1)
        self.assertEqual([status for status, _ in results].count("conflict"), 1)
        self.assertEqual(len(self.service.list_component_revisions(component["id"])), 2)
        self.assertTrue(self.service.verify_component_audit_chain(component["id"])["valid"])

    def test_stale_asset_upload_and_link_do_not_advance_head(self) -> None:
        component = self._component("asset-rev-" + uuid.uuid4().hex[:8])
        self._import_symbol(str(self._component("asset-donor-" + uuid.uuid4().hex[:8])["id"]), "DonorSym")
        stale_id = component["revision_id"]
        advanced = self.service.update_component_metadata(
            component["id"],
            {"description": "Editor B advanced the head"},
            actor="editor-b@example.com",
            expected_revision_id=stale_id,
        )
        assert advanced is not None
        head_id = str(advanced["revision_id"])
        revisions_before = self.service.list_component_revisions(component["id"])
        donor_file = next(
            path for path in self.service.browse_library_assets("symbol")["files"]
            if "DonorSym" in path
        )

        def conflict(action) -> None:
            with self.assertRaisesRegex(ValueError, "revision conflict"):
                action()

        stale_symbol = b'''(kicad_symbol_lib (version 20231120) (generator "test")
          (symbol "StaleSym"
            (property "Reference" "U" (at 0 0 0) (effects (font (size 1.27 1.27))))
            (property "Value" "StaleSym" (at 0 0 0) (effects (font (size 1.27 1.27))))
          )
        )'''
        conflict(lambda: self.service.import_symbol_library(
            component["id"], upload_name="StaleSym.kicad_sym", payload=stale_symbol,
            target_library="Stale", selected_symbol="StaleSym", actor="editor-a@example.com",
            expected_revision_id=stale_id,
        ))
        conflict(lambda: self.service.import_footprint(
            component["id"], upload_name="StaleFp.kicad_mod",
            payload=b'(footprint "StaleFp" (version 20240108) (generator "test"))',
            target_library="Stale", selected_footprint="StaleFp", actor="editor-a@example.com",
            expected_revision_id=stale_id,
        ))
        conflict(lambda: self.service.attach_auxiliary_asset(
            component["id"], asset_type="3dmodel", upload_name="stale.step",
            payload=b"ISO-10303-21;END-ISO-10303-21;", target_library="Stale",
            actor="editor-a@example.com", expected_revision_id=stale_id,
        ))
        conflict(lambda: self.service.link_library_asset(
            component["id"], "symbol", file_path_rel=donor_file,
            target_library="Availability", target_name="DonorSym", actor="editor-a@example.com",
            expected_revision_id=stale_id,
        ))

        blocked = self.service.get_component(component["id"])
        assert blocked is not None
        self.assertEqual(blocked["revision_id"], head_id)
        self.assertEqual(blocked["assets"], [])
        self.assertEqual(self.service.list_component_revisions(component["id"]), revisions_before)

        imported = self.service.import_symbol_library(
            component["id"], upload_name="FreshSym.kicad_sym",
            payload=stale_symbol.replace(b"StaleSym", b"FreshSym"),
            target_library="Fresh", selected_symbol="FreshSym", actor="editor-a@example.com",
            expected_revision_id=head_id,
        )
        self.assertEqual(imported["mode"], "imported")
        self.assertNotEqual(imported["component"]["revision_id"], head_id)

        legacy = self.service.import_footprint(
            component["id"], upload_name="LegacyFp.kicad_mod",
            payload=b'(footprint "LegacyFp" (version 20240108) (generator "test"))',
            target_library="Fresh", selected_footprint="LegacyFp", actor="editor-a@example.com",
        )
        self.assertEqual(legacy["mode"], "imported")

        auxiliary = self.service.attach_auxiliary_asset(
            component["id"], asset_type="3dmodel", upload_name="fresh.step",
            payload=b"ISO-10303-21;END-ISO-10303-21;", target_library="Fresh",
            actor="editor-a@example.com",
            expected_revision_id=legacy["component"]["revision_id"],
        )
        self.assertTrue(any(item["asset_type"] == "3dmodel" for item in auxiliary["component"]["assets"]))

        self.service.link_library_asset(
            component["id"], "symbol", file_path_rel=donor_file,
            target_library="Availability", target_name="DonorSym", actor="editor-a@example.com",
            expected_revision_id=auxiliary["component"]["revision_id"],
        )
        after_link = self.service.get_component(component["id"])
        assert after_link is not None
        self.assertNotEqual(after_link["revision_id"], auxiliary["component"]["revision_id"])
        self.assertGreaterEqual(sum(1 for item in after_link["assets"] if item["asset_type"] == "symbol"), 2)

        multi = b'''(kicad_symbol_lib (version 20231120) (generator "test")
          (symbol "PickA"
            (property "Reference" "U" (at 0 0 0) (effects (font (size 1.27 1.27))))
            (property "Value" "PickA" (at 0 0 0) (effects (font (size 1.27 1.27))))
          )
          (symbol "PickB"
            (property "Reference" "U" (at 0 0 0) (effects (font (size 1.27 1.27))))
            (property "Value" "PickB" (at 0 0 0) (effects (font (size 1.27 1.27))))
          )
        )'''
        picker_head = str(after_link["revision_id"])
        picker = self.service.import_symbol_library(
            component["id"], upload_name="multi.kicad_sym", payload=multi,
            target_library="Fresh", selected_symbol="", actor="editor-a@example.com",
            expected_revision_id=picker_head,
        )
        self.assertEqual(picker["mode"], "selection_required")
        self.assertEqual(self.service.get_component(component["id"])["revision_id"], picker_head)
        chosen = self.service.import_symbol_library(
            component["id"], upload_name="multi.kicad_sym", payload=multi,
            target_library="Fresh", selected_symbol="PickB", actor="editor-a@example.com",
            expected_revision_id=picker_head,
        )
        self.assertEqual(chosen["mode"], "imported")
        self.assertEqual(chosen["selected_symbol"], "PickB")
        conflict(lambda: self.service.import_symbol_library(
            component["id"], upload_name="multi.kicad_sym", payload=multi,
            target_library="Fresh", selected_symbol="", actor="editor-a@example.com",
            expected_revision_id=picker_head,
        ))

    def test_metadata_schema_and_qa_batch_round_trip(self) -> None:
        token = uuid.uuid4().hex[:10]
        component = self._component(f"metadata-{token}")
        field = self.service.create_metadata_field(
            {
                "key": f"voltage_rating_{token}",
                "label": "Voltage rating",
                "type": "number",
                "unit": "V",
            },
            actor="admin@example.com",
        )
        self.metadata_field_ids.append(str(field["id"]))
        batch = self.service.stage_metadata_batch(
            [
                {
                    "component_id": component["id"],
                    "expected_revision_id": component["revision_id"],
                    "patch": {"value": "12k", field["key"]: "50"},
                }
            ],
            source="grid",
            actor="designer@example.com",
            change_summary="Correct metadata in PostgreSQL",
        )
        self.assertEqual(batch["valid_items"], 1)
        applied = self.service.apply_metadata_batch(batch["id"], actor="designer@example.com")
        self.assertEqual(applied["applied"], 1)
        updated = self.service.get_component(component["id"])
        assert updated is not None
        self.assertEqual(updated["workflow_stage"], "qa_review")
        self.assertEqual(updated["revision"], component["revision"] + 1)
        self.assertEqual(updated["extra_fields"][field["key"]], "50")
        self.assertEqual(updated["value"], "12k")

        # Initialization is a version lookup after the first successful v6 migration.
        self.service.initialize()
        with self.service._connect() as conn:  # type: ignore[attr-defined]
            version = conn.execute(
                "SELECT 1 AS present FROM catalog_schema_migrations WHERE version = %s",
                (POSTGRES_SCHEMA_VERSION,),
            ).fetchone()
        self.assertIsNotNone(version)

    def test_component_head_projection_and_streaming_csv_follow_current_revision(self) -> None:
        component = self._component("head-" + uuid.uuid4().hex[:8])
        with self.service._connect() as conn:  # type: ignore[attr-defined]
            head = conn.execute(
                "SELECT revision_id, value FROM component_heads WHERE component_id = %s",
                (component["id"],),
            ).fetchone()
        self.assertEqual(head["revision_id"], component["revision_id"])
        self.assertEqual(head["value"], "10k")

        updated = self.service.update_component_metadata(
            component["id"],
            {"value": "12k"},
            actor="editor@example.com",
            expected_revision_id=component["revision_id"],
        )
        with self.service._connect() as conn:  # type: ignore[attr-defined]
            head = conn.execute(
                "SELECT revision_id, value FROM component_heads WHERE component_id = %s",
                (component["id"],),
            ).fetchone()
        self.assertEqual(head["revision_id"], updated["revision_id"])
        self.assertEqual(head["value"], "12k")
        exported = "".join(self.service.iter_metadata_csv(field_keys=["value", "package_name"]))
        self.assertIn(component["id"], exported)
        self.assertIn("12k", exported)

    def test_concurrent_qa_approval_creates_one_decision_and_transition(self) -> None:
        component = self._component("approval-" + uuid.uuid4().hex[:8])
        self.service.set_release_status(component["id"], "in_progress", actor="designer@example.com")
        review = self.service.set_release_status(component["id"], "qa_review", actor="designer@example.com")

        def approve(reviewer: str) -> str:
            approved = self.service.set_release_status(
                component["id"],
                "done",
                actor=reviewer,
                actor_role="qa",
                expected_revision_id=review["revision_id"],
                expected_manifest_hash=review["manifest_hash"],
            )
            return str(approved["workflow_stage"])

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(approve, ("qa-a@example.com", "qa-b@example.com")))

        self.assertEqual(results, ["done", "done"])
        approvals = [
            decision
            for decision in self.service.list_component_review_decisions(component["id"])
            if decision["decision"] == "approved"
        ]
        transitions_to_done = [
            event
            for event in self.service.list_component_audit_events(component["id"])
            if event["event_type"] == "workflow.transitioned" and event["details"].get("to") == "done"
        ]
        self.assertEqual(len(approvals), 1)
        self.assertEqual(len(transitions_to_done), 1)
        self.assertTrue(self.service.verify_component_audit_chain(component["id"])["valid"])

    def test_assets_release_evidence_and_diff_scope_round_trip(self) -> None:
        self._install_deterministic_preview_renderer()
        component = self._component("assets-" + uuid.uuid4().hex[:8])
        symbol_payload = b'''(kicad_symbol_lib (version 20231120) (generator "test")
          (symbol "R_Test"
            (property "Reference" "R" (at 0 0 0) (effects (font (size 1.27 1.27))))
            (property "Value" "10k" (at 0 0 0) (effects (font (size 1.27 1.27))))
          )
        )'''
        imported_symbol = self.service.import_symbol_library(
            component["id"],
            upload_name="R_Test.kicad_sym",
            payload=symbol_payload,
            target_library="Prism_Test",
            selected_symbol="R_Test",
            actor="designer@example.com",
        )["component"]
        imported_footprint = self.service.import_footprint(
            component["id"],
            upload_name="R_Test.kicad_mod",
            payload=b'(footprint "R_Test" (version 20240108) (generator "test"))',
            target_library="Prism_Test",
            selected_footprint="R_Test",
            actor="designer@example.com",
        )["component"]
        self.assertEqual(tuple(imported_symbol), COMPONENT_PAYLOAD_KEYS)
        self.assertEqual(
            [preview["kind"] for preview in imported_symbol["previews"]],
            ["symbol"],
            imported_symbol["previews"],
        )
        self.assertEqual(
            _contract_digest(imported_symbol),
            "93e52eb5141723ec2a987ae9de938907923747cf1918a8e8528b69d6982e35e0",
            {
                "preview_status": [item.get("status") for item in imported_symbol["previews"]],
                "preview_paths": [
                    _normalize_contract(item.get("file_path"), ("previews", "file_path"))
                    for item in imported_symbol["previews"]
                ],
                "asset_sha256": [item.get("sha256") for item in imported_symbol["assets"]],
                "generator_version": [
                    item.get("generator_version") for item in imported_symbol["previews"]
                ],
            },
        )
        self.assertEqual(tuple(imported_footprint), COMPONENT_PAYLOAD_KEYS)
        self.assertEqual(
            _contract_digest(imported_footprint),
            "ae8eeb5b599f1a8135cff4228878960d1ed2d137db8b49127feea53d7e687820",
        )
        with_model = self.service.attach_auxiliary_asset(
            component["id"],
            asset_type="3dmodel",
            upload_name="R_Test.step",
            payload=b"ISO-10303-21;END-ISO-10303-21;",
            target_library="Prism_Test",
            actor="designer@example.com",
        )["component"]
        with_spice = self.service.attach_auxiliary_asset(
            component["id"],
            asset_type="spice",
            upload_name="R_Test.lib",
            payload=b".MODEL R_Test RES R=10k",
            target_library="Prism_Test",
            actor="designer@example.com",
        )["component"]

        diff = self.service.compare_component_revisions(
            component["id"],
            imported_footprint["revision_id"],
            with_spice["revision_id"],
        )
        self.assertEqual(diff["summary"]["assetChanges"], 0)
        self.assertTrue(
            all(
                change["before"]["assetType"] in {"symbol", "footprint"}
                for change in diff["assetChanges"]
                if change["before"]
            )
        )
        self.assertEqual(with_model["revision"] + 1, with_spice["revision"])

        self.service.set_release_status(component["id"], "in_progress", actor="designer@example.com")
        self.service.set_release_status(component["id"], "qa_review", actor="designer@example.com")
        approved = self.service.set_release_status(
            component["id"],
            "done",
            actor="qa@example.com",
            actor_role="qa",
            expected_revision_id=with_spice["revision_id"],
            expected_manifest_hash=with_spice["manifest_hash"],
        )
        released = self.service.set_release_status(
            component["id"],
            "released",
            actor="designer@example.com",
            actor_role="designer",
            expected_revision_id=approved["revision_id"],
            expected_manifest_hash=approved["manifest_hash"],
        )
        self.assertEqual(released["release_status"], "released")
        self.assertEqual(tuple(released), COMPONENT_PAYLOAD_KEYS)
        self.assertEqual(
            _contract_digest(released),
            "ecb19c09822c12c5ed0ab9249f7e42c57dea9576154b871f1e4c4a6a03ba670f",
        )
        self.assertEqual(released["identity_kind"], "mpn")
        self.assertEqual(released["mpn"], component["mpn"])
        self.assertEqual(
            [asset["asset_type"] for asset in released["assets"]],
            ["symbol", "footprint", "3dmodel", "spice"],
        )
        self.assertEqual(
            [asset["target_name"] for asset in released["assets"]],
            ["R_Test", "R_Test", "R_Test.step", "R_Test.lib"],
        )
        self.assertEqual(
            [asset["sha256"] for asset in released["assets"][1:]],
            [
                hashlib.sha256(
                    b'(footprint "R_Test" (version 20240108) (generator "test"))'
                ).hexdigest(),
                hashlib.sha256(b"ISO-10303-21;END-ISO-10303-21;").hexdigest(),
                hashlib.sha256(b".MODEL R_Test RES R=10k").hexdigest(),
            ],
        )
        self.assertEqual(released["revision_id"], with_spice["revision_id"])
        self.assertEqual(released["manifest_hash"], with_spice["manifest_hash"])
        self.assertEqual({preview["kind"] for preview in released["previews"]}, {"symbol", "footprint"})
        for preview in released["previews"]:
            self.assertEqual(preview["status"], "ready")
            self.assertEqual(preview["content_type"], "image/svg+xml")
            self.assertEqual(preview["sha256"], FIXTURE_PREVIEW_SHA256)
            self.assertEqual(preview["generator_version"], "fixture")
            self.assertEqual(
                preview["generator_fingerprint"],
                (
                    FIXTURE_SYMBOL_PREVIEW_FINGERPRINT
                    if preview["kind"] == "symbol"
                    else FIXTURE_FOOTPRINT_PREVIEW_FINGERPRINT
                ),
            )
            backing = Path(preview["file_path"])
            self.assertTrue(backing.is_file(), preview["file_path"])
            self.assertEqual(backing.read_bytes(), FIXTURE_PREVIEW_SVG)
            self.assertEqual(
                hashlib.sha256(backing.read_bytes()).hexdigest(),
                preview["sha256"],
            )
            bucket = "symbols" if preview["kind"] == "symbol" else "footprints"
            self.assertEqual(
                _normalize_contract(preview["file_path"], ("previews", "file_path")),
                f"<store>/components/previews/versions/{bucket}/<uuid>/{FIXTURE_PREVIEW_SHA256}.svg",
            )

        revisions = self.service.list_component_revisions(component["id"])
        self.assertEqual(
            [int(revision["version"]) for revision in revisions],
            sorted((int(revision["version"]) for revision in revisions), reverse=True),
        )
        self.assertEqual(revisions[0]["id"], released["revision_id"])
        self.assertEqual(revisions[0]["manifest_hash"], released["manifest_hash"])
        audit_events = self.service.list_component_audit_events(component["id"])
        self.assertEqual(
            [int(event["sequence"]) for event in audit_events],
            sorted((int(event["sequence"]) for event in audit_events), reverse=True),
        )
        self.assertTrue(self.service.verify_component_audit_chain(component["id"])["valid"])

        fixed_now = 1_700_000_000
        with patch("app.services.catalog.signed_urls.time.time", return_value=fixed_now):
            manifest = self.service.build_manifest(component["id"], "https://prism.example")
        assert manifest is not None
        self.assertEqual(manifest["part_id"], component["id"])
        self.assertEqual(manifest["representation_id"], released["default_representation_id"])
        self.assertEqual(
            [asset["asset_type"] for asset in manifest["assets"]],
            ["symbol", "footprint", "3dmodel", "spice"],
        )
        signed = urlsplit(manifest["assets"][0]["download_url"])
        signed_query = parse_qs(signed.query, keep_blank_values=True)
        self.assertEqual(signed.scheme, "https")
        self.assertEqual(signed.netloc, "prism.example")
        self.assertEqual(signed.fragment, "")
        self.assertEqual(set(signed_query), {"rev", "representation", "exp", "sig"})
        self.assertEqual(signed.path, f"/api/remote-provider/assets/{released['assets'][0]['id']}")
        self.assertEqual(signed_query["rev"], [released["revision_id"]])
        self.assertEqual(
            signed_query["representation"],
            [released["default_representation_id"]],
        )
        self.assertEqual(int(signed_query["exp"][0]), fixed_now + 300)
        with patch("app.services.catalog.signed_urls.time.time", return_value=fixed_now):
            self.assertTrue(
                self.service.validate_asset_signature(
                    released["assets"][0]["id"],
                    signed_query["rev"][0],
                    int(signed_query["exp"][0]),
                    signed_query["sig"][0],
                    signed_query["representation"][0],
                )
            )
        with patch("app.services.catalog.signed_urls.time.time", return_value=fixed_now + 300):
            self.assertFalse(
                self.service.validate_asset_signature(
                    released["assets"][0]["id"],
                    signed_query["rev"][0],
                    int(signed_query["exp"][0]),
                    signed_query["sig"][0],
                    signed_query["representation"][0],
                )
            )

        remote = self.service.list_remote_component_heads(
            query=released["mpn"],
            page=1,
            page_size=1,
            include_total=False,
        )
        self.assertEqual(remote["items"][0]["id"], component["id"])
        self.assertIsNone(remote["total"])
        self.assertFalse(remote["has_more"])
        self.assertTrue(remote["items"][0]["place_enabled"])
        self.assertEqual(remote["items"][0]["representation_count"], 1)
        self.assertTrue(remote["items"][0]["default_representation_id"])
        self.assertNotEqual(remote["projection_version"], "0")
        inline = self.service.build_inline_bundle(component["id"])
        assert inline is not None
        self.assertEqual(
            inline["representation_id"], released["default_representation_id"]
        )
        inline_again = self.service.build_inline_bundle(component["id"])
        assert inline_again is not None
        inline_bytes = base64.b64decode(inline["data"])
        self.assertEqual(inline_bytes, base64.b64decode(inline_again["data"]))
        inline_entries = json.loads(inline_bytes)
        self.assertEqual(
            [entry["type"] for entry in inline_entries],
            ["symbol", "footprint", "3dmodel", "spice"],
        )
        for entry in inline_entries:
            self.assertEqual(
                hashlib.sha256(base64.b64decode(entry["content"])).hexdigest(),
                entry["checksum"],
            )
        self.assertEqual(
            [asset["sha256"] for asset in manifest["assets"]],
            [entry["checksum"] for entry in inline_entries],
        )
        records = self.service.list_component_release_records(component["id"])
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["manifest_hash"], released["manifest_hash"])
        self.assertTrue(self.service.verify_component_audit_chain(component["id"])["valid"])

        metadata_csv = self.service.export_metadata_csv(field_keys=["value", "package_name"])
        metadata_lines = metadata_csv.splitlines(keepends=True)
        target_metadata_csv = metadata_lines[0] + next(
            line for line in metadata_lines[1:] if component["id"] in line
        )
        normalized_metadata_csv = target_metadata_csv.replace(
            component["id"], "<component-id>"
        ).replace(released["revision_id"], "<revision-id>")
        self.assertEqual(
            normalized_metadata_csv,
            "_prism_schema_version,component_id,expected_revision_id,revision,workflow_stage,value,package_name\r\n"
            "prism.component_metadata_a1,<component-id>,<revision-id>,5,released,\u200b10k,\r\n",
        )
        self.assertEqual(
            hashlib.sha256(normalized_metadata_csv.encode("utf-8")).hexdigest(),
            "155c8c4d36ee614b581a6307b340af5cd4249c22e3300ab867a149dd28823b92",
        )
        self.assertEqual(metadata_csv, self.service.export_metadata_csv(field_keys=["value", "package_name"]))
        metadata_rows = list(csv.reader(metadata_csv.splitlines()))
        self.assertEqual(
            metadata_rows[0],
            [
                "_prism_schema_version",
                "component_id",
                "expected_revision_id",
                "revision",
                "workflow_stage",
                "value",
                "package_name",
            ],
        )
        self.assertEqual(metadata_rows[1][1], component["id"])
        self.assertEqual(metadata_rows[1][5], "\u200b10k")
        inventory_csv = self.service.export_inventory_csv()
        inventory_lines = inventory_csv.splitlines(keepends=True)
        target_inventory_csv = inventory_lines[0] + next(
            line for line in inventory_lines[1:] if component["id"] in line
        )
        normalized_inventory_csv = FIXTURE_TOKEN.sub(
            "assets-<token>", target_inventory_csv.replace(component["id"], "<component-id>")
        )
        self.assertEqual(
            normalized_inventory_csv,
            "component_id,manufacturer,mpn,quantity,uom,inventory_status\r\n"
            "<component-id>,Prism Integration,PG-R-assets-<token>,0.0,,\r\n",
        )
        self.assertEqual(inventory_csv, self.service.export_inventory_csv())
        self.assertEqual(
            next(csv.reader(inventory_csv.splitlines())),
            ["component_id", "manufacturer", "mpn", "quantity", "uom", "inventory_status"],
        )

        first_dbl = self.service.export_kicad_dbl_bundle()
        first_root = Path(first_dbl["export_root"])
        first_files = {
            path.relative_to(first_root).as_posix(): path.read_bytes()
            for path in first_root.rglob("*")
            if path.is_file()
        }
        normalized_dbl_files = {
            FIXTURE_TOKEN.sub("assets-<token>", name): _normalize_contract_bytes(payload)
            for name, payload in first_files.items()
            if name != "Prism.sqlite"
        }
        self.assertEqual(
            {
                name: hashlib.sha256(payload).hexdigest()
                for name, payload in sorted(normalized_dbl_files.items())
            },
            {
                "PcbLib/Prism_Test.pretty/R_Test.kicad_mod": "8d4ef2234c867094a30e793fdbff4975a78a98742ac72825b5fef2c2c5355461",
                "Prism_Linux.kicad_dbl": "86cacbfb2c4f192082191bf6cfd4a386cb89672ffb4747ebea6cd538c379064d",
                "Prism_Windows.kicad_dbl": "5f8b5b8128abd1fd8021eac341c104b152f407a179a5df6c2e6c6c8efd20ad14",
                "SchLib/Prism_PG-R-assets-<token>_Prism_Test_R_Test.kicad_sym": "f005b31dc8b9553ea528ad253896bab79c9c69ea1e1dac0a683bbcc4dc8d9fbe",
                "fp-lib-table": "149d573ae28f732acb912b6707b02f0851c7c250d3f698b6e7a92269e2cc3c86",
                "sym-lib-table": "a97a151e180b2945dbd6a81a3cbc00d4a7edcb17488f371d5fe24f43a1805fbf",
            },
        )
        with sqlite3.connect(first_dbl["sqlite_path"]) as dbl_conn:
            tables = [
                row[0]
                for row in dbl_conn.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
                ).fetchall()
            ]
            self.assertEqual(tables, ["Uncategorized"])
            columns = [
                row[1]
                for row in dbl_conn.execute('PRAGMA table_info("Uncategorized")').fetchall()
            ]
            self.assertEqual(
                columns,
                [
                    "Part Number",
                    "Part Number Nocolon",
                    "Comment",
                    "Value",
                    "Manufacturer",
                    "Manufacturer Part Number",
                    "PackageDescription",
                    "Status",
                    "Part Description",
                    "Datasheet",
                    "LibSymbol",
                    "LibFootprint",
                ],
            )
            dbl_row = dbl_conn.execute(
                """
                SELECT "Part Number", "Part Number Nocolon", "Comment", "Value",
                       "Manufacturer", "Manufacturer Part Number", "PackageDescription",
                       "Status", "Part Description", "Datasheet", "LibSymbol", "LibFootprint"
                FROM "Uncategorized"
                WHERE "Manufacturer Part Number" = ?
                """,
                (component["mpn"],),
            ).fetchone()
            self.assertIsNotNone(dbl_row)
            self.assertEqual(
                tuple(
                    FIXTURE_TOKEN.sub("assets-<token>", cell) if isinstance(cell, str) else cell
                    for cell in dbl_row
                ),
                (
                    "PG-R-assets-<token>",
                    "PG-R-assets-<token>",
                    "10k",
                    "10k",
                    "Prism Integration",
                    "PG-R-assets-<token>",
                    "",
                    "released",
                    "PostgreSQL catalog integration component",
                    "https://example.com/r.pdf",
                    "Prism_PG-R-assets-<token>_Prism_Test_R_Test:R_Test",
                    "Prism_Test:R_Test",
                ),
            )
            self.assertEqual(
                dbl_conn.execute('SELECT COUNT(*) FROM "Uncategorized"').fetchone(),
                (1,),
            )
        second_dbl = self.service.export_kicad_dbl_bundle()
        second_root = Path(second_dbl["export_root"])
        second_files = {
            path.relative_to(second_root).as_posix(): path.read_bytes()
            for path in second_root.rglob("*")
            if path.is_file()
        }
        self.assertEqual(first_files, second_files)
        self.assertEqual(
            {name: hashlib.sha256(payload).hexdigest() for name, payload in first_files.items()},
            {name: hashlib.sha256(payload).hexdigest() for name, payload in second_files.items()},
        )

    def test_non_default_representation_drives_manifest_and_inline_pair(self) -> None:
        component = self._component("representations-" + uuid.uuid4().hex[:8])

        def symbol_payload(name: str) -> bytes:
            return f'''(kicad_symbol_lib (version 20231120) (generator "test")
              (symbol "{name}"
                (property "Reference" "U" (at 0 0 0) (effects (font (size 1.27 1.27))))
                (property "Value" "{name}" (at 0 0 0) (effects (font (size 1.27 1.27))))
              )
            )'''.encode()

        first_symbol = self.service.import_symbol_library(
            component["id"], upload_name="S1.kicad_sym", payload=symbol_payload("S1"),
            target_library="Representations", selected_symbol="S1", actor="designer@example.com",
        )["component"]
        first_footprint = self.service.import_footprint(
            component["id"], upload_name="F1.kicad_mod",
            payload=b'(footprint "F1" (version 20240108) (generator "test"))',
            target_library="Representations", selected_footprint="F1", actor="designer@example.com",
        )["component"]
        default_footprint_id = first_footprint["representations"][0]["footprint"]["id"]
        second_symbol = self.service.import_symbol_library(
            component["id"], upload_name="S2.kicad_sym", payload=symbol_payload("S2"),
            target_library="Representations", selected_symbol="S2",
            counterpart_asset_id=default_footprint_id, actor="designer@example.com",
        )["component"]
        stale_representation_id = next(
            item["id"] for item in second_symbol["representations"]
            if item["symbol"] and item["symbol"]["target_name"] == "S2"
        )
        second_symbol_id = next(
            item["symbol"]["id"] for item in second_symbol["representations"]
            if item["symbol"] and item["symbol"]["target_name"] == "S2"
        )
        second_footprint = self.service.import_footprint(
            component["id"], upload_name="F2.kicad_mod",
            payload=b'(footprint "F2" (version 20240108) (generator "test"))',
            target_library="Representations", selected_footprint="F2",
            counterpart_asset_id=second_symbol_id, actor="designer@example.com",
        )["component"]
        selected = next(
            item for item in second_footprint["representations"]
            if item["symbol"] and item["footprint"]
            and item["symbol"]["target_name"] == "S2"
            and item["footprint"]["target_name"] == "F2"
        )
        self.assertNotEqual(selected["id"], second_footprint["default_representation_id"])
        self.service.set_release_status(component["id"], "in_progress", actor="designer@example.com")
        self.service.set_release_status(component["id"], "qa_review", actor="designer@example.com")
        approved = self.service.set_release_status(
            component["id"], "done", actor="qa@example.com",
            expected_revision_id=second_footprint["revision_id"],
            expected_manifest_hash=second_footprint["manifest_hash"],
        )
        self.service.set_release_status(
            component["id"], "released", actor="designer@example.com",
            expected_revision_id=approved["revision_id"], expected_manifest_hash=approved["manifest_hash"],
        )

        bundle = self.service.build_inline_bundle(component["id"], selected["id"])
        assert bundle is not None
        entries = json.loads(base64.b64decode(bundle["data"]))
        self.assertEqual(
            {(entry["type"], entry["name"]) for entry in entries if entry["type"] in {"symbol", "footprint"}},
            {("symbol", "S2"), ("footprint", "F2")},
        )
        with self.assertRaisesRegex(ValueError, "not found"):
            self.service.build_inline_bundle(component["id"], stale_representation_id)

    def test_database_guards_and_widened_portable_types(self) -> None:
        component = self._component("guards-" + uuid.uuid4().hex[:8])
        with self.assertRaises(Exception):
            with self.service._connect() as conn:  # type: ignore[attr-defined]
                conn.execute(
                    "UPDATE component_revisions SET description = %s WHERE id = %s",
                    ("tampered", component["revision_id"]),
                )
                conn.commit()

        transitioned = self.service.set_release_status(
            component["id"], "in_progress", actor="workflow@example.com"
        )
        self.assertEqual(transitioned["release_status"], "in_progress")

        attached = self.service.attach_auxiliary_asset(
            component["id"],
            asset_type="3dmodel",
            upload_name="guard.step",
            payload=b"ISO-10303-21;END-ISO-10303-21;",
            target_library="Guard",
            actor="author@example.com",
        )["component"]
        with self.service._connect() as conn:  # type: ignore[attr-defined]
            asset = conn.execute(
                "SELECT asset_id FROM revision_assets WHERE revision_id = %s LIMIT 1",
                (attached["revision_id"],),
            ).fetchone()
        assert asset is not None
        with self.assertRaises(Exception):
            with self.service._connect() as conn:  # type: ignore[attr-defined]
                conn.execute(
                    "DELETE FROM revision_assets WHERE revision_id = %s AND asset_id = %s",
                    (attached["revision_id"], asset["asset_id"]),
                )
                conn.commit()
        with self.assertRaises(Exception):
            with self.service._connect() as conn:  # type: ignore[attr-defined]
                conn.execute("UPDATE assets SET sha256 = %s WHERE id = %s", ("0" * 64, asset["asset_id"]))
                conn.commit()

        preview_id = str(uuid.uuid4())
        with self.service._connect() as conn:  # type: ignore[attr-defined]
            conn.execute(
                """
                INSERT INTO asset_preview_versions (
                    id, asset_id, kind, status, content_type, file_path, sha256, size_bytes,
                    generator_name, generator_version, pipeline_version, generator_fingerprint,
                    generation_error, created_at
                ) VALUES (%s, %s, 'symbol', 'ready', 'image/svg+xml', '/tmp/guard.svg', %s, 6,
                          'test', '1', 'test', %s, '', CURRENT_TIMESTAMP::text)
                """,
                (preview_id, asset["asset_id"], "a" * 64, str(uuid.uuid4())),
            )
            conn.commit()
        with self.assertRaises(Exception):
            with self.service._connect() as conn:  # type: ignore[attr-defined]
                conn.execute(
                    "UPDATE asset_preview_versions SET sha256 = %s WHERE id = %s",
                    ("b" * 64, preview_id),
                )
                conn.commit()
        with self.assertRaises(Exception):
            with self.service._connect() as conn:  # type: ignore[attr-defined]
                conn.execute(
                    """
                    INSERT INTO revision_previews (revision_id, asset_id, kind, preview_id, created_at)
                    VALUES (%s, %s, 'symbol', %s, CURRENT_TIMESTAMP::text)
                    """,
                    (attached["revision_id"], asset["asset_id"], preview_id),
                )
                conn.commit()

        with self.service._connect() as conn:  # type: ignore[attr-defined]
            types = {
                (str(row["table_name"]), str(row["column_name"])): str(row["data_type"])
                for row in conn.execute(
                    """
                    SELECT table_name, column_name, data_type
                    FROM information_schema.columns
                    WHERE table_schema = 'catalog' AND (
                        (table_name = 'inventory_levels' AND column_name = 'quantity') OR
                        (table_name = 'assets' AND column_name = 'size_bytes') OR
                        (table_name = 'catalog_audit_events' AND column_name = 'sequence') OR
                        (table_name = 'oauth_auth_codes' AND column_name = 'exp') OR
                        (table_name = 'oauth_revoked_tokens' AND column_name = 'exp')
                    )
                    """
                ).fetchall()
            }
            component_stock_column = conn.execute(
                """
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'catalog' AND table_name = 'components'
                  AND column_name = 'stock_quantity'
                """
            ).fetchone()
        self.assertIsNone(component_stock_column)
        self.assertEqual(types[("inventory_levels", "quantity")], "double precision")
        for key in (
            ("assets", "size_bytes"),
            ("catalog_audit_events", "sequence"),
            ("oauth_auth_codes", "exp"),
            ("oauth_revoked_tokens", "exp"),
        ):
            self.assertEqual(types[key], "bigint")

    def test_a_database_from_before_the_ladder_upgrades_with_its_data(self) -> None:
        """Starting a newer build against an older catalog must not cost data.

        Until this landed, a database whose ``catalog_schema_migrations`` row did
        not match the build's version string raised at startup and pointed the
        operator at a destructive reset. That made the first catalog schema
        change in any release equivalent to discarding the catalog.
        """
        component = self._component("upgrade-" + uuid.uuid4().hex[:8])

        with self.service._connect() as conn:  # type: ignore[attr-defined]
            conn.execute("DROP TABLE IF EXISTS catalog_schema_versions")
            conn.execute("DELETE FROM catalog_schema_migrations")
            conn.commit()

        upgraded = ComponentCatalogPostgresService(
            store_root=Path(self.tempdir.name) / "components",
            database_url=POSTGRES_URL,
        )
        upgraded.initialize()

        with upgraded._connect() as conn:  # type: ignore[attr-defined]
            ledger = [
                (int(row["version"]), str(row["name"]))
                for row in conn.execute(
                    "SELECT version, name FROM catalog_schema_versions ORDER BY version"
                ).fetchall()
            ]
            self.assertEqual(ledger, [(version, name) for version, name, _ in MIGRATIONS])
            self.assertEqual(pending_catalog_migrations(conn), [])
            # An older Prism treats this row as a hard precondition, so the
            # newer build has to leave it in place for a rollback to work.
            legacy = conn.execute(
                "SELECT version FROM catalog_schema_migrations WHERE version = %s",
                (POSTGRES_SCHEMA_VERSION,),
            ).fetchone()
            self.assertIsNotNone(legacy)

        survivor = upgraded.get_component(component["id"])
        self.assertIsNotNone(survivor)
        self.assertEqual(survivor["slug"], component["slug"])

    def test_repeated_startup_does_not_rewrite_widened_columns(self) -> None:
        """Replaying the column widening rewrites whole tables for nothing."""
        with self.service._connect() as conn:  # type: ignore[attr-defined]
            self.assertEqual(pending_catalog_migrations(conn), [])

        restarted = ComponentCatalogPostgresService(
            store_root=Path(self.tempdir.name) / "components",
            database_url=POSTGRES_URL,
        )
        restarted.initialize()

        with restarted._connect() as conn:  # type: ignore[attr-defined]
            applied = conn.execute(
                "SELECT count(*) AS total FROM catalog_schema_versions"
            ).fetchone()
            self.assertEqual(int(applied["total"]), len(MIGRATIONS))

    def test_populated_pre_epoch_two_catalog_is_refused_with_reset_guidance(self) -> None:
        self._component("epoch-" + uuid.uuid4().hex[:8])
        with self.service._connect() as conn:  # type: ignore[attr-defined]
            conn.execute("DELETE FROM catalog_meta WHERE key = 'catalog_schema_epoch'")
            conn.commit()
        incompatible = ComponentCatalogPostgresService(
            store_root=Path(self.tempdir.name) / "components",
            database_url=POSTGRES_URL,
        )
        try:
            with self.assertRaisesRegex(RuntimeError, "catalog-only reset"):
                incompatible.initialize()
        finally:
            with self.service._connect() as conn:  # type: ignore[attr-defined]
                conn.execute(
                    "INSERT INTO catalog_meta(key, value) VALUES ('catalog_schema_epoch', '2') "
                    "ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value"
                )
                conn.commit()

    def _import_symbol(self, component_id: str, name: str) -> dict:
        payload = f'''(kicad_symbol_lib (version 20231120) (generator "test")
          (symbol "{name}"
            (property "Reference" "U" (at 0 0 0) (effects (font (size 1.27 1.27))))
            (property "Value" "{name}" (at 0 0 0) (effects (font (size 1.27 1.27))))
          )
        )'''.encode()
        return self.service.import_symbol_library(
            component_id,
            upload_name=f"{name}.kicad_sym",
            payload=payload,
            target_library="Availability",
            selected_symbol=name,
            actor="designer@example.com",
        )["component"]

    def _import_footprint(self, component_id: str, name: str) -> dict:
        return self.service.import_footprint(
            component_id,
            upload_name=f"{name}.kicad_mod",
            payload=f'(footprint "{name}" (version 20240108) (generator "test"))'.encode(),
            target_library="Availability",
            selected_footprint=name,
            actor="designer@example.com",
        )["component"]

    def _complete_cad(self, component: dict, name: str) -> dict:
        after_symbol = self._import_symbol(str(component["id"]), name)
        return self._import_footprint(str(after_symbol["id"]), name)

    def _listed(
        self,
        component_id: str,
        *,
        lightweight: bool = False,
        include_inactive: bool = False,
        **kwargs: object,
    ) -> dict:
        detail = self.service.get_component(component_id, include_inactive=True)
        assert detail is not None
        page = self.service.list_components(
            query=str(detail.get("mpn") or detail.get("name") or ""),
            page=1,
            page_size=50,
            lightweight=lightweight,
            include_inactive=include_inactive,
            **kwargs,
        )
        match = next((item for item in page["items"] if item["id"] == component_id), None)
        self.assertIsNotNone(match, f"{component_id} missing from list {kwargs}")
        return match or {}

    def _assert_availability(
        self,
        component_id: str,
        *,
        state: str,
        missing: list[str],
        place_enabled: bool,
        include_inactive: bool = False,
    ) -> None:
        detail = self.service.get_component(component_id, include_inactive=include_inactive)
        assert detail is not None
        summary = self._listed(
            component_id, lightweight=True, include_inactive=include_inactive
        )
        full_list = self._listed(
            component_id, lightweight=False, include_inactive=include_inactive
        )
        for payload in (detail, summary, full_list):
            self.assertEqual(payload["availability_state"], state)
            self.assertEqual(payload["missing_assets"], missing)
            self.assertEqual(payload["place_enabled"], place_enabled)
        filtered = self.service.list_components(
            query=str(detail.get("mpn") or detail.get("name") or ""),
            availability_state=state,
            page=1,
            page_size=50,
            include_inactive=include_inactive,
        )
        self.assertIn(component_id, {item["id"] for item in filtered["items"]})
        other_states = {"metadata_only", "files_partial", "place_ready"} - {state}
        for other in other_states:
            other_page = self.service.list_components(
                query=str(detail.get("mpn") or detail.get("name") or ""),
                availability_state=other,
                page=1,
                page_size=50,
                include_inactive=include_inactive,
            )
            self.assertNotIn(component_id, {item["id"] for item in other_page["items"]})

    def test_availability_agrees_across_filter_summary_and_detail(self) -> None:
        metadata = self._component("avail-meta-" + uuid.uuid4().hex[:8])
        self._assert_availability(
            str(metadata["id"]),
            state="metadata_only",
            missing=["symbol", "footprint"],
            place_enabled=False,
        )

        partial = self._import_symbol(
            str(self._component("avail-partial-" + uuid.uuid4().hex[:8])["id"]),
            "PartialSym",
        )
        self._assert_availability(
            str(partial["id"]),
            state="files_partial",
            missing=["footprint"],
            place_enabled=False,
        )

        complete = self._complete_cad(
            self._component("avail-complete-" + uuid.uuid4().hex[:8]),
            "Complete",
        )
        default_symbol_id = next(
            item["symbol"]["id"]
            for item in complete["representations"]
            if item.get("is_default") and item.get("symbol")
        )
        mismatched = self.service.create_representation(
            str(complete["id"]),
            label="Incomplete default",
            symbol_asset_id=default_symbol_id,
            make_default=True,
            expected_revision_id=str(complete["revision_id"]),
            actor="designer@example.com",
        )
        self.assertTrue(
            any(asset["asset_type"] == "footprint" for asset in mismatched["assets"])
        )
        self._assert_availability(
            str(mismatched["id"]),
            state="files_partial",
            missing=["footprint"],
            place_enabled=False,
        )
        before_queue = self.service.release_queue_summary()
        self.service.set_release_status(
            str(mismatched["id"]), "in_progress", actor="designer@example.com"
        )
        self.service.set_release_status(
            str(mismatched["id"]), "qa_review", actor="designer@example.com"
        )
        queued = self.service.release_queue_summary()
        self.assertEqual(queued["qa_review"], before_queue["qa_review"] + 1)
        self.assertEqual(queued["blocked"], before_queue["blocked"] + 1)

        ready = self._complete_cad(
            self._component("avail-ready-" + uuid.uuid4().hex[:8]),
            "Ready",
        )
        self._assert_availability(
            str(ready["id"]),
            state="place_ready",
            missing=[],
            place_enabled=False,
        )

        token = uuid.uuid4().hex[:8]
        provisional = self._complete_cad(
            self.service.create_manual_component(
                name=f"IPN-{token}",
                value="provisional",
                description="Provisional availability fixture",
                datasheet="https://example.com/provisional.pdf",
                manufacturer="Prism Availability",
                manufacturer_part_number="",
                identity_kind="provisional_ipn",
                identity_source="fixture",
                source_internal_part_number=f"IPN-{token}",
                actor="author@example.com",
            ),
            "Provisional",
        )
        self.component_ids.append(str(provisional["id"]))
        self._assert_availability(
            str(provisional["id"]),
            state="place_ready",
            missing=[],
            place_enabled=False,
        )

        inactive = self._complete_cad(
            self._component("avail-inactive-" + uuid.uuid4().hex[:8]),
            "Inactive",
        )
        self.assertTrue(
            self.service.deactivate_component(
                str(inactive["id"]), actor="author@example.com", reason="availability fixture"
            )
        )
        hidden = self.service.list_components(page=1, page_size=100, include_inactive=False)
        self.assertNotIn(str(inactive["id"]), {item["id"] for item in hidden["items"]})
        self._assert_availability(
            str(inactive["id"]),
            state="place_ready",
            missing=[],
            place_enabled=False,
            include_inactive=True,
        )

        released = self._complete_cad(
            self._component("avail-released-" + uuid.uuid4().hex[:8]),
            "Released",
        )
        self.service.set_release_status(
            str(released["id"]), "in_progress", actor="designer@example.com"
        )
        self.service.set_release_status(
            str(released["id"]), "qa_review", actor="designer@example.com"
        )
        current = self.service.get_component(str(released["id"]))
        assert current is not None
        approved = self.service.set_release_status(
            str(released["id"]),
            "done",
            actor="qa@example.com",
            expected_revision_id=current["revision_id"],
            expected_manifest_hash=current["manifest_hash"],
        )
        self.service.set_release_status(
            str(released["id"]),
            "released",
            actor="designer@example.com",
            expected_revision_id=approved["revision_id"],
            expected_manifest_hash=approved["manifest_hash"],
        )
        self._assert_availability(
            str(released["id"]),
            state="place_ready",
            missing=[],
            place_enabled=True,
        )

    def test_tied_timestamps_paginate_without_duplicate_or_omitted_ids(self) -> None:
        token = "tie-" + uuid.uuid4().hex[:8]
        frozen = "2026-09-12T21:00:00+00:00"
        fixtures: list[dict] = []
        with (
            patch("app.services.catalog.component_writer.utc_now_iso", return_value=frozen),
            patch("app.services.catalog.revision_kernel._utc_now_iso", return_value=frozen),
            patch("app.services.catalog.revision_finalization.utc_now_iso", return_value=frozen),
        ):
            for index in range(4):
                component = self.service.create_manual_component(
                    name="Tied Name",
                    value="10k",
                    description=f"Pagination {token}",
                    datasheet="https://example.com/r.pdf",
                    manufacturer="Prism Tiebreak",
                    manufacturer_part_number=f"PG-TIE-{token}-{index}",
                    actor="author@example.com",
                )
                self.component_ids.append(str(component["id"]))
                fixtures.append(component)

        expected = {str(item["id"]) for item in fixtures}
        timestamps = {str(item["revision_updated_at"]) for item in fixtures}
        names = {str(item["name"]) for item in fixtures}
        self.assertEqual(timestamps, {frozen})
        self.assertEqual(names, {"Tied Name"})

        def paged_ids(**kwargs: object) -> list[str]:
            seen: list[str] = []
            page = 1
            while True:
                result = self.service.list_components(
                    query=token,
                    page=page,
                    page_size=2,
                    lightweight=True,
                    **kwargs,
                )
                batch = [
                    str(item["id"])
                    for item in result["items"]
                    if str(item["id"]) in expected
                ]
                overlap = set(seen) & set(batch)
                self.assertFalse(overlap, overlap)
                seen.extend(batch)
                if page >= int(result["pages"]) or not result["items"]:
                    break
                page += 1
            return seen

        ranked_ids = paged_ids()
        named_ids = paged_ids(sort_by="name", sort_dir="asc")
        manufacturer_ids = paged_ids(sort_by="manufacturer", sort_dir="asc")
        self.assertEqual(set(ranked_ids), expected)
        self.assertEqual(len(ranked_ids), 4)
        self.assertEqual(ranked_ids, sorted(expected))
        self.assertEqual(named_ids, ranked_ids)
        self.assertEqual(manufacturer_ids, ranked_ids)
        self.assertEqual(paged_ids(), ranked_ids)


if __name__ == "__main__":
    unittest.main()
