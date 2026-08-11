"""Integration tests for Import Centre bulk remediation.

Covers the pieces that make a large import tractable: searching existing catalog
assets, persisting grid edits, and - most importantly - linking an existing
footprint by reference so importing a hundred resistors does not create a hundred
copies of the same 0603.
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.component_catalog_service_postgres import ComponentCatalogPostgresService  # noqa: E402

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

SYMBOL_BODY = """(kicad_symbol_lib (version 20240101) (generator prism-test)
  (symbol "R_Test" (pin_numbers hide) (in_bom yes) (on_board yes)
    (property "Reference" "R" (at 0 0 0))
    (property "Value" "R_Test" (at 0 0 0))
  )
)
"""

FOOTPRINT_BODY = """(footprint "R_0603" (version 20240101) (generator prism-test) (layer "F.Cu")
  (pad "1" smd rect (at -0.7875 0) (size 0.875 0.95) (layers "F.Cu" "F.Paste" "F.Mask"))
  (pad "2" smd rect (at 0.7875 0) (size 0.875 0.95) (layers "F.Cu" "F.Paste" "F.Mask"))
)
"""


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for PostgreSQL integration tests")
@unittest.skipIf(
    SHARED_APPLICATION_DATABASE,
    "Import remediation tests require a dedicated PostgreSQL database; "
    "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL",
)
class ImportBulkRemediationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tempdir.name)
        self.component_ids: list[str] = []
        self.service = ComponentCatalogPostgresService(
            store_root=self.root / "components",
            database_url=POSTGRES_URL,
        )
        self.service.initialize()

    def tearDown(self) -> None:
        for component_id in reversed(self.component_ids):
            self.service.deactivate_component(
                component_id,
                actor="integration-test@local",
                reason="Import remediation test cleanup",
            )
        self.service.close()
        self.tempdir.cleanup()

    # ------------------------------------------------------------------
    # helpers

    def _staged_asset(self, session_id: str, name: str, body: str, asset_type: str) -> dict[str, object]:
        import hashlib

        # Staged assets must live under the session's imports root; the service
        # rejects anything outside it.
        staged = self.root / "components" / "imports" / session_id / f"{uuid.uuid4()}-{name}"
        staged.parent.mkdir(parents=True, exist_ok=True)
        staged.write_text(body, encoding="utf-8")
        return {
            "asset_type": asset_type,
            "filename": name,
            "source_path": f"project/{name}",
            "staged_path": str(staged),
            "sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
            "target_library": "Prism_Imported",
            "target_name": Path(name).stem,
        }

    def _stage_proposal(
        self,
        *,
        reference: str,
        mpn: str,
        with_footprint: bool = True,
        findings: list[dict[str, str]] | None = None,
    ):
        session = self.service.create_project_import_session(
            scope="project", project_id="proj-1", actor="tester@example.com"
        )
        session_id = str(session["id"])
        assets = [self._staged_asset(session_id, "R_Test.kicad_sym", SYMBOL_BODY, "symbol")]
        if with_footprint:
            assets.append(
                self._staged_asset(session_id, "R_0603.kicad_mod", FOOTPRINT_BODY, "footprint")
            )
        self.service.stage_project_import_proposals(
            str(session["id"]),
            [
                {
                    "dedupe_key": f"key-{uuid.uuid4()}",
                    "reference": reference,
                    "metadata": {
                        "value": "10k",
                        "description": "Test resistor",
                        "datasheet": "https://example.com/ds.pdf",
                        "manufacturer": "Yageo",
                        "manufacturer_part_number": mpn,
                        "footprint": "Resistor_SMD:R_0603_1608Metric",
                        "fields": {},
                    },
                    "assets": assets,
                    "provenance": [{"projectId": "proj-1", "sourceRevision": "abc123"}],
                    "findings": findings or [],
                }
            ],
        )
        proposals = self.service.list_project_import_proposals(str(session["id"]))
        return str(session["id"]), proposals[0]

    def _revision_asset_ids(self, component_id: str, asset_type: str) -> list[str]:
        component = self.service.get_component(component_id)
        assert component is not None
        return [
            str(asset["id"])
            for asset in component.get("assets") or []
            if str(asset.get("asset_type")) == asset_type
        ]

    # ------------------------------------------------------------------
    # tests

    def test_drafts_round_trip_and_survive_reload(self) -> None:
        session_id, proposal = self._stage_proposal(reference="R1", mpn="RC0603-A")
        self.assertEqual(proposal["draft"], {})

        saved = self.service.save_project_import_drafts(
            session_id,
            {
                str(proposal["id"]): {
                    "metadata_overrides": {"manufacturer": "Vishay"},
                    "asset_links": {"footprint": "asset-123"},
                }
            },
        )
        self.assertEqual(saved, 1)

        reloaded = self.service.list_project_import_proposals(session_id)[0]
        self.assertEqual(reloaded["draft"]["metadata_overrides"]["manufacturer"], "Vishay")
        self.assertEqual(reloaded["draft"]["asset_links"]["footprint"], "asset-123")

    def test_search_assets_finds_imported_footprints_and_rejects_bad_types(self) -> None:
        _, proposal = self._stage_proposal(reference="R1", mpn="RC0603-SEARCH")
        result = self.service.accept_project_import_proposal(
            str(proposal["id"]), actor="tester@example.com"
        )
        self.component_ids.append(str(result["component"]["id"]))

        matches = self.service.search_assets(asset_type="footprint", query="R_0603")
        self.assertTrue(matches, "expected the imported footprint to be searchable")
        self.assertTrue(all(item["asset_type"] == "footprint" for item in matches))
        self.assertTrue(all(item["usage_count"] >= 1 for item in matches))

        # A symbol query must not return footprints.
        self.assertEqual(
            [item for item in self.service.search_assets(asset_type="symbol", query="R_0603")
             if item["asset_type"] != "symbol"],
            [],
        )

        with self.assertRaises(ValueError):
            self.service.search_assets(asset_type="gerber", query="")

    def test_linked_footprint_is_shared_not_duplicated(self) -> None:
        """The point of the feature: two imports referencing one asset row."""
        _, first = self._stage_proposal(reference="R1", mpn="RC0603-FIRST")
        first_result = self.service.accept_project_import_proposal(
            str(first["id"]), actor="tester@example.com"
        )
        first_component_id = str(first_result["component"]["id"])
        self.component_ids.append(first_component_id)

        existing_footprint_ids = self._revision_asset_ids(first_component_id, "footprint")
        self.assertEqual(len(existing_footprint_ids), 1)
        shared_asset_id = existing_footprint_ids[0]

        # Import a different part, reusing the first part's footprint by reference.
        _, second = self._stage_proposal(reference="R2", mpn="RC0603-SECOND")
        second_result = self.service.accept_project_import_proposal(
            str(second["id"]),
            asset_links={"footprint": shared_asset_id},
            actor="tester@example.com",
        )
        second_component_id = str(second_result["component"]["id"])
        self.component_ids.append(second_component_id)

        self.assertNotEqual(first_component_id, second_component_id)
        self.assertEqual(
            self._revision_asset_ids(second_component_id, "footprint"),
            [shared_asset_id],
            "the second component must reference the same asset row, not a copy",
        )

    def test_link_satisfies_a_proposal_that_has_no_footprint_of_its_own(self) -> None:
        _, seed = self._stage_proposal(reference="R1", mpn="RC0603-SEED")
        seed_result = self.service.accept_project_import_proposal(
            str(seed["id"]), actor="tester@example.com"
        )
        seed_component_id = str(seed_result["component"]["id"])
        self.component_ids.append(seed_component_id)
        shared_asset_id = self._revision_asset_ids(seed_component_id, "footprint")[0]

        _, orphan = self._stage_proposal(
            reference="R9", mpn="RC0603-ORPHAN", with_footprint=False
        )
        # Without a link this proposal cannot be accepted at all.
        with self.assertRaises(ValueError):
            self.service.accept_project_import_proposal(
                str(orphan["id"]), actor="tester@example.com"
            )

        result = self.service.accept_project_import_proposal(
            str(orphan["id"]),
            asset_links={"footprint": shared_asset_id},
            actor="tester@example.com",
        )
        component_id = str(result["component"]["id"])
        self.component_ids.append(component_id)
        self.assertEqual(self._revision_asset_ids(component_id, "footprint"), [shared_asset_id])

    def test_linking_clears_the_not_resolved_finding_it_answers(self) -> None:
        """A footprint the extractor could not find is resolved by linking one.

        The finding is severity 'error' and was treated as a permanent blocker, so a
        fully remediated row stayed stuck at "needs attention" and could not import.
        """
        _, seed = self._stage_proposal(reference="R1", mpn="RC0603-FINDING-SEED")
        seed_result = self.service.accept_project_import_proposal(
            str(seed["id"]), actor="tester@example.com"
        )
        seed_component_id = str(seed_result["component"]["id"])
        self.component_ids.append(seed_component_id)
        shared_asset_id = self._revision_asset_ids(seed_component_id, "footprint")[0]

        _, blocked = self._stage_proposal(
            reference="C149",
            mpn="RC0603-FINDING",
            with_footprint=False,
            findings=[
                {
                    "code": "footprint_not_resolved",
                    "severity": "error",
                    "message": "Embedded footprint for C149 was not found.",
                }
            ],
        )

        with self.assertRaises(ValueError):
            self.service.accept_project_import_proposal(
                str(blocked["id"]), actor="tester@example.com"
            )

        result = self.service.accept_project_import_proposal(
            str(blocked["id"]),
            asset_links={"footprint": shared_asset_id},
            actor="tester@example.com",
        )
        component_id = str(result["component"]["id"])
        self.component_ids.append(component_id)
        self.assertEqual(self._revision_asset_ids(component_id, "footprint"), [shared_asset_id])

    def test_an_unrelated_error_finding_still_blocks_after_linking(self) -> None:
        _, seed = self._stage_proposal(reference="R1", mpn="RC0603-STILL-BLOCKED-SEED")
        seed_result = self.service.accept_project_import_proposal(
            str(seed["id"]), actor="tester@example.com"
        )
        seed_component_id = str(seed_result["component"]["id"])
        self.component_ids.append(seed_component_id)
        shared_asset_id = self._revision_asset_ids(seed_component_id, "footprint")[0]

        _, blocked = self._stage_proposal(
            reference="U7",
            mpn="RC0603-STILL-BLOCKED",
            findings=[
                {
                    "code": "symbol_not_resolved",
                    "severity": "error",
                    "message": "Embedded symbol for U7 was not found.",
                }
            ],
        )
        with self.assertRaises(ValueError):
            # Linking a footprint must not excuse an unresolved symbol.
            self.service.accept_project_import_proposal(
                str(blocked["id"]),
                asset_links={"footprint": shared_asset_id},
                actor="tester@example.com",
            )

    def test_same_mpn_rows_converge_on_one_component(self) -> None:
        """Two references remediated to the same MPN must not create two components.

        Scan-time dedupe only groups by MPN when the project symbol already carries
        manufacturer and MPN fields. When a reviewer supplies them during remediation
        the proposals stay separate, so accepting both has to converge here.
        """
        _, first = self._stage_proposal(reference="C149", mpn="")
        _, second = self._stage_proposal(reference="C150", mpn="")

        shared = {
            "value": "22uF_25V_1210",
            "manufacturer": "TDK Corporation",
            "manufacturer_part_number": "CGA6P3X7R1E226M250AE",
            "description": "Unpolarized capacitor, small symbol",
            "datasheet": "https://product.tdk.com/en/datasheet.pdf",
            "package_name": "Pixxel_Capacitors:CAP1210",
        }

        first_result = self.service.accept_project_import_proposal(
            str(first["id"]), metadata_overrides=dict(shared), actor="tester@example.com"
        )
        second_result = self.service.accept_project_import_proposal(
            str(second["id"]), metadata_overrides=dict(shared), actor="tester@example.com"
        )

        first_id = str(first_result["component"]["id"])
        second_id = str(second_result["component"]["id"])
        self.component_ids.append(first_id)

        self.assertEqual(
            first_id,
            second_id,
            "both references must resolve to the same catalog component",
        )

        # Identical content must not spawn a second revision either.
        revisions = self.service.list_component_revisions(first_id)
        self.assertEqual(len(revisions), 1, "identical remediation should not add a revision")

    def test_unknown_or_mistyped_asset_links_are_rejected(self) -> None:
        _, seed = self._stage_proposal(reference="R1", mpn="RC0603-TYPES")
        seed_result = self.service.accept_project_import_proposal(
            str(seed["id"]), actor="tester@example.com"
        )
        seed_component_id = str(seed_result["component"]["id"])
        self.component_ids.append(seed_component_id)
        symbol_asset_id = self._revision_asset_ids(seed_component_id, "symbol")[0]

        _, proposal = self._stage_proposal(reference="R2", mpn="RC0603-TYPES-2")
        with self.assertRaises(ValueError):
            self.service.accept_project_import_proposal(
                str(proposal["id"]),
                asset_links={"footprint": "does-not-exist"},
                actor="tester@example.com",
            )

        with self.assertRaises(ValueError):
            # A symbol asset must not be accepted as a footprint.
            self.service.accept_project_import_proposal(
                str(proposal["id"]),
                asset_links={"footprint": symbol_asset_id},
                actor="tester@example.com",
            )


if __name__ == "__main__":
    unittest.main()
