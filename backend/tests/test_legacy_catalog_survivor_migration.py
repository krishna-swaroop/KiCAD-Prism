from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace


SCRIPT = next(
    candidate
    for candidate in (
        Path(__file__).resolve().parents[2] / "scripts" / "migrate_legacy_catalog_survivors.py",
        Path(__file__).resolve().parents[1] / "scripts" / "migrate_legacy_catalog_survivors.py",
    )
    if candidate.is_file()
)
SPEC = importlib.util.spec_from_file_location("legacy_catalog_survivors", SCRIPT)
assert SPEC and SPEC.loader
migration = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(migration)


def _component(component_id: str, *, creator: str, current_creator: str | None = None) -> dict:
    return {
        "id": component_id,
        "original_creator": creator,
        "current_creator": current_creator or creator,
    }


def _manifest(*, duplicate_identity: bool = False) -> dict:
    components = []
    revisions = []
    revision_assets = []
    for index in range(2 if duplicate_identity else 1):
        component_id = f"component-{index}"
        revision_id = f"revision-{index}"
        components.append(
            {
                "id": component_id,
                "slug": f"manual-{index}",
                "source": "manual",
                "original_creator": "rajesh@pixxel.co.in",
                "current_creator": "rajesh@pixxel.co.in",
                "current_revision_id": revision_id,
                "released_revision_id": revision_id,
            }
        )
        revisions.append(
            {
                "id": revision_id,
                "component_id": component_id,
                "version": 3,
                "created_by": "rajesh@pixxel.co.in",
                "name": f"Rajesh Part {index}",
                "value": "10k",
                "description": "Preserved manual component",
                "datasheet_url": "https://example.com/part.pdf",
                "manufacturer": "Pixxel Parts",
                "mpn": "PX-100" if duplicate_identity else f"PX-{index}",
                "release_status": "released",
            }
        )
        revision_assets.extend(
            [
                {
                    "revision_id": revision_id,
                    "asset_id": f"symbol-{index}",
                    "asset_type": "symbol",
                    "required": 1,
                },
                {
                    "revision_id": revision_id,
                    "asset_id": f"footprint-{index}",
                    "asset_type": "footprint",
                    "required": 1,
                },
            ]
        )
    return {
        "schema": migration.ARCHIVE_SCHEMA,
        "summary": {"survivor_components": len(components)},
        "components": components,
        "revisions": revisions,
        "revision_assets": revision_assets,
        "assets": [],
    }


class LegacyCatalogSurvivorMigrationTests(unittest.TestCase):
    def test_classification_excludes_only_original_database_imports(self) -> None:
        rows = [
            _component("cern", creator=migration.LEGACY_CERN_ACTOR),
            _component("manual", creator="rajesh@pixxel.co.in"),
            _component(
                "edited-footprint",
                creator="system:import_footprint_library",
                current_creator="rajesh@pixxel.co.in",
            ),
        ]

        result = migration.classify_legacy_components(rows)

        self.assertEqual(result["total_components"], 3)
        self.assertEqual(result["excluded_cern_components"], 1)
        self.assertEqual(result["survivor_components"], 2)
        self.assertEqual(result["librarian_impacted_components"], 2)
        self.assertEqual(result["survivor_ids"], ["manual", "edited-footprint"])

    def test_restore_plan_builds_complete_default_pair(self) -> None:
        plans = migration._component_restore_plan(_manifest())

        self.assertEqual(len(plans), 1)
        self.assertEqual(plans[0]["identity_kind"], "mpn")
        revision = plans[0]["active_revisions"][0]
        self.assertTrue(revision["complete"])
        self.assertEqual(revision["restored_status"], "released")
        self.assertEqual(revision["symbol_asset_id"], "symbol-0")
        self.assertEqual(revision["footprint_asset_id"], "footprint-0")

    def test_incomplete_released_legacy_revision_is_restored_as_draft(self) -> None:
        manifest = _manifest()
        manifest["revision_assets"] = [manifest["revision_assets"][0]]

        plan = migration._component_restore_plan(manifest)[0]["active_revisions"][0]

        self.assertEqual(plan["restored_status"], "open")
        self.assertIn("complete representation", plan["status_adjustment"])

    def test_duplicate_survivor_identity_fails_before_restore(self) -> None:
        with self.assertRaisesRegex(ValueError, "Survivor identity collision"):
            migration._component_restore_plan(_manifest(duplicate_identity=True))

    def test_restored_assets_use_an_isolated_namespace(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            path = migration._permanent_asset_path(
                Path(tempdir),
                {
                    "id": "asset-1",
                    "sha256": "a" * 64,
                    "name": "Part.kicad_sym",
                    "store_relative_path": "symbols/CERN/Part.kicad_sym",
                },
            )

        self.assertIn("legacy-survivors", path.parts)
        self.assertNotIn("CERN", path.parts)

    def test_archive_round_trip_verifies_manifest_and_payload(self) -> None:
        payload = b"(kicad_symbol_lib (version 20231120))\n"
        sha256 = migration._sha256_bytes(payload)
        manifest = _manifest()
        manifest["assets"] = [
            {
                "id": "asset-1",
                "sha256": sha256,
                "size_bytes": len(payload),
                "archive_path": f"payloads/{sha256}",
            }
        ]
        with tempfile.TemporaryDirectory() as tempdir:
            archive_path = Path(tempdir) / "survivors.zip"
            migration.write_archive(archive_path, manifest, {f"payloads/{sha256}": payload})

            restored_manifest, restored_payloads = migration.read_archive(archive_path)

        self.assertEqual(restored_manifest["schema"], migration.ARCHIVE_SCHEMA)
        self.assertEqual(restored_payloads[f"payloads/{sha256}"], payload)

    def test_archive_rejects_corrupt_payload(self) -> None:
        payload = b"correct"
        sha256 = migration._sha256_bytes(payload)
        manifest = _manifest()
        manifest["assets"] = [
            {
                "id": "asset-1",
                "sha256": sha256,
                "size_bytes": len(payload),
                "archive_path": f"payloads/{sha256}",
            }
        ]
        manifest_payload = migration._json_bytes(manifest)
        with tempfile.TemporaryDirectory() as tempdir:
            archive_path = Path(tempdir) / "corrupt.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr(migration.ARCHIVE_MANIFEST, manifest_payload)
                archive.writestr(
                    migration.ARCHIVE_MANIFEST_HASH,
                    migration._sha256_bytes(manifest_payload),
                )
                archive.writestr(f"payloads/{sha256}", b"broken")

            with self.assertRaisesRegex(ValueError, "checksum failed"):
                migration.read_archive(archive_path)

    def test_cern_report_collision_check_passes_for_distinct_identities(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            archive_path = Path(tempdir) / "survivors.zip"
            report_path = Path(tempdir) / "cern-report.json"
            migration.write_archive(archive_path, _manifest(), {})
            report_path.write_text(
                json.dumps(
                    {
                        "dry_run": True,
                        "hard_conflicts": [],
                        "groups": [
                            {
                                "identity_kind": "mpn",
                                "manufacturer": "Another Manufacturer",
                                "mpn": "OTHER-1",
                                "canonical_internal_part_number": "IPN-1",
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            result = migration.check_cern_report(
                SimpleNamespace(archive=archive_path, report=report_path)
            )

        self.assertEqual(result["identity_collisions"], [])

    def test_cern_report_collision_check_blocks_matching_survivor(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            archive_path = Path(tempdir) / "survivors.zip"
            report_path = Path(tempdir) / "cern-report.json"
            migration.write_archive(archive_path, _manifest(), {})
            report_path.write_text(
                json.dumps(
                    {
                        "dry_run": True,
                        "hard_conflicts": [],
                        "groups": [
                            {
                                "identity_kind": "mpn",
                                "manufacturer": " pixxel parts ",
                                "mpn": "px-0",
                                "canonical_internal_part_number": "CERN-IPN",
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "collides with 1 survivor"):
                migration.check_cern_report(
                    SimpleNamespace(archive=archive_path, report=report_path)
                )


if __name__ == "__main__":
    unittest.main()
