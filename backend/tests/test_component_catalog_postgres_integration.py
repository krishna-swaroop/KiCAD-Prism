from __future__ import annotations

import os
import sys
import tempfile
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlsplit


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.catalog_schema_migrations import (  # noqa: E402
    MIGRATIONS,
    pending_catalog_migrations,
)
from app.services.component_catalog_service_postgres import (  # noqa: E402
    POSTGRES_SCHEMA_VERSION,
    ComponentCatalogPostgresService,
)


POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
APPLICATION_POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()


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
        self.service = ComponentCatalogPostgresService(
            store_root=Path(self.tempdir.name) / "components",
            database_url=POSTGRES_URL,
        )
        self.service.initialize()

    def tearDown(self) -> None:
        # The database is explicitly isolated from the application database.
        # Deactivation keeps the test database's own audit chain valid while the
        # test database remains disposable as a unit.
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
                ("catalog-postgres-v6",),
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
                actor_role="component_qa",
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
            actor_role="component_qa",
            expected_revision_id=with_spice["revision_id"],
            expected_manifest_hash=with_spice["manifest_hash"],
        )
        released = self.service.set_release_status(
            component["id"],
            "released",
            actor="release@example.com",
            actor_role="admin",
            expected_revision_id=approved["revision_id"],
            expected_manifest_hash=approved["manifest_hash"],
        )
        self.assertEqual(released["release_status"], "released")
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
        self.assertNotEqual(remote["projection_version"], "0")
        records = self.service.list_component_release_records(component["id"])
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["manifest_hash"], released["manifest_hash"])
        self.assertTrue(self.service.verify_component_audit_chain(component["id"])["valid"])

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
                        (table_name = 'components' AND column_name = 'stock_quantity') OR
                        (table_name = 'assets' AND column_name = 'size_bytes') OR
                        (table_name = 'catalog_audit_events' AND column_name = 'sequence') OR
                        (table_name = 'oauth_auth_codes' AND column_name = 'exp') OR
                        (table_name = 'oauth_revoked_tokens' AND column_name = 'exp')
                    )
                    """
                ).fetchall()
            }
        self.assertEqual(types[("components", "stock_quantity")], "double precision")
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


if __name__ == "__main__":
    unittest.main()
