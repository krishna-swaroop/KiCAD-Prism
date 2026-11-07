"""Deleting an Import Centre session (#714).

A session whose candidates were all rejected used to stay in the list for good,
still counting its rejected proposals as candidates.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.errors import Conflict, NotFound  # noqa: E402
from app.services.component_catalog_service_postgres import ComponentCatalogPostgresService  # noqa: E402
from support.postgres import CATALOG_URL, connect, requires_scratch_postgres  # noqa: E402
from test_import_bulk_remediation import FOOTPRINT_BODY, SYMBOL_BODY  # noqa: E402


@requires_scratch_postgres("import session delete tests")
class ImportSessionDeleteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tempdir.name)
        self.component_ids: list[str] = []
        self.service = ComponentCatalogPostgresService(
            store_root=self.root / "components",
            database_url=CATALOG_URL,
        )
        self.service.initialize()

    def tearDown(self) -> None:
        for component_id in reversed(self.component_ids):
            self.service.deactivate_component(
                component_id,
                actor="integration-test@local",
                reason="Import session delete test cleanup",
            )
        self.service.close()
        self.tempdir.cleanup()

    def _staged_session(self, count: int = 2) -> tuple[str, list[dict]]:
        import hashlib

        session_id = str(
            self.service.create_project_import_session(
                scope="project", project_id="proj-1", actor="tester@example.com"
            )["id"]
        )
        proposals = []
        for index in range(count):
            assets = []
            for name, body, asset_type in (
                ("R_Test.kicad_sym", SYMBOL_BODY, "symbol"),
                ("R_0603.kicad_mod", FOOTPRINT_BODY, "footprint"),
            ):
                staged = self.root / "components" / "imports" / session_id / f"{uuid.uuid4()}-{name}"
                staged.parent.mkdir(parents=True, exist_ok=True)
                staged.write_text(body, encoding="utf-8")
                assets.append({
                    "asset_type": asset_type,
                    "filename": name,
                    "source_path": f"project/{name}",
                    "staged_path": str(staged),
                    "sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
                    "target_library": "Prism_Imported",
                    "target_name": Path(name).stem,
                })
            proposals.append({
                "dedupe_key": f"key-{uuid.uuid4()}",
                "reference": f"R{index + 1}",
                "metadata": {
                    "value": "10k",
                    "description": "Test resistor",
                    "datasheet": "https://example.com/ds.pdf",
                    "manufacturer": "Yageo",
                    "manufacturer_part_number": f"RC0603-{uuid.uuid4().hex[:8]}",
                    "footprint": "Resistor_SMD:R_0603_1608Metric",
                    "fields": {},
                },
                "assets": assets,
                "provenance": [{"projectId": "proj-1", "sourceRevision": "abc123"}],
                "findings": [],
            })
        self.service.stage_project_import_proposals(session_id, proposals)
        return session_id, self.service.list_project_import_proposals(session_id)

    def test_rejected_proposals_are_not_counted_as_candidates(self) -> None:
        session_id, proposals = self._staged_session()
        self.service.reject_project_import_proposal(str(proposals[0]["id"]))

        session = self.service.get_project_import_session(session_id)

        self.assertEqual(session["proposal_count"], 2)
        self.assertEqual(session["candidate_count"], 1)

    def test_delete_removes_the_session_its_proposals_and_staged_files(self) -> None:
        session_id, proposals = self._staged_session()
        for proposal in proposals:
            self.service.reject_project_import_proposal(str(proposal["id"]))
        staging = self.root / "components" / "imports" / session_id
        self.assertTrue(staging.is_dir())

        self.service.delete_project_import_session(session_id)

        self.assertIsNone(self.service.get_project_import_session(session_id))
        self.assertEqual(self.service.list_project_import_proposals(session_id), [])
        self.assertFalse(staging.exists())

    def test_delete_keeps_components_already_accepted(self) -> None:
        session_id, proposals = self._staged_session()
        accepted = self.service.accept_project_import_proposal(
            str(proposals[0]["id"]), actor="tester@example.com"
        )
        component_id = str(accepted["component"]["id"])
        self.component_ids.append(component_id)

        self.service.delete_project_import_session(session_id)

        self.assertIsNone(self.service.get_project_import_session(session_id))
        self.assertEqual(str(self.service.get_component(component_id)["id"]), component_id)

    def test_a_running_session_cannot_be_deleted(self) -> None:
        session_id = str(
            self.service.create_project_import_session(
                scope="project", project_id="proj-1", actor="tester@example.com"
            )["id"]
        )

        with self.assertRaises(Conflict):
            self.service.delete_project_import_session(session_id)
        self.assertIsNotNone(self.service.get_project_import_session(session_id))

    def test_a_running_session_can_be_deleted_once_its_job_is_terminal(self) -> None:
        session_id = str(
            self.service.create_project_import_session(
                scope="project", project_id="proj-1", actor="tester@example.com"
            )["id"]
        )

        self.service.delete_project_import_session(session_id, job_terminal=True)

        self.assertIsNone(self.service.get_project_import_session(session_id))

    def test_a_session_with_a_proposal_being_accepted_cannot_be_deleted(self) -> None:
        session_id, proposals = self._staged_session()
        # An acceptance in flight, as the claim leaves it.
        with connect("catalog") as conn:
            conn.execute(
                "UPDATE project_component_import_proposals SET status = 'accepting' WHERE id = %s",
                (str(proposals[0]["id"]),),
            )
            conn.commit()

        with self.assertRaises(Conflict):
            self.service.delete_project_import_session(session_id)
        self.assertIsNotNone(self.service.get_project_import_session(session_id))

    def test_an_unknown_session_is_not_found(self) -> None:
        with self.assertRaises(NotFound):
            self.service.delete_project_import_session(str(uuid.uuid4()))


if __name__ == "__main__":
    unittest.main()
