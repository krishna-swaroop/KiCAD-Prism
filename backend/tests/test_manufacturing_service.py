from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import manufacturing_service as mfg  # noqa: E402


class ManufacturingValidationTests(unittest.TestCase):
    """Validation that rejects before any database work; needs no database."""

    def test_manufacturer_name_required(self) -> None:
        with self.assertRaises(mfg.ManufacturingError):
            mfg.create_manufacturer("   ")

    def test_unknown_run_status_rejected(self) -> None:
        with self.assertRaises(mfg.ManufacturingError):
            mfg.update_run("run_x", status="teleported")

    def test_unknown_severity_rejected(self) -> None:
        with self.assertRaises(mfg.ManufacturingError):
            mfg.log_defect("run_x", severity="apocalyptic")

    def test_status_lifecycle_is_ordered(self) -> None:
        self.assertEqual(mfg.RUN_STATUSES[0], "draft")
        self.assertEqual(mfg.RUN_STATUSES[-1], "closed")


@unittest.skipUnless(
    os.environ.get("PRISM_DATABASE_URL"),
    "PRISM_DATABASE_URL not set; skipping database-backed manufacturing tests",
)
class ManufacturingStoreTests(unittest.TestCase):
    """End-to-end store behaviour against a real workspace database.

    Uses a throwaway repo+project so the foreign keys resolve, and cleans up after.
    """

    @classmethod
    def setUpClass(cls) -> None:
        from app.services.workspace_service import workspace

        workspace.initialize()
        cls.workspace = workspace
        cls.repo_id = workspace.register_repository(
            name="mfg-test-repo",
            url="ssh://git@example.com/mfg/test.git",
            clone_path_abs="/tmp/mfg-test",
            import_type="single",
        )
        cls.project_id = workspace.register_project(
            repo_id=cls.repo_id, name="mfg-test-board", relative_path="."
        )

    @classmethod
    def tearDownClass(cls) -> None:
        # Deleting the repo cascades to the project, its runs, and their defects.
        with mfg._connect() as conn:
            conn.execute("DELETE FROM ws_repositories WHERE id = %s", (cls.repo_id,))
            conn.commit()

    def tearDown(self) -> None:
        with mfg._connect() as conn:
            conn.execute(
                "DELETE FROM ws_manufacturing_runs WHERE project_id = %s", (self.project_id,)
            )
            conn.execute("DELETE FROM ws_manufacturers WHERE name LIKE 'MfgTest%'")
            conn.commit()

    # -- manufacturers --

    def test_manufacturer_crud(self) -> None:
        mid = mfg.create_manufacturer("MfgTest Fab", contact="sales@fab.example")
        listed = {m["id"]: m for m in mfg.list_manufacturers()}
        self.assertIn(mid, listed)
        self.assertEqual(listed[mid]["contact"], "sales@fab.example")

        self.assertTrue(mfg.update_manufacturer(mid, notes="fast turnaround"))
        self.assertTrue(mfg.delete_manufacturer(mid))
        self.assertNotIn(mid, {m["id"] for m in mfg.list_manufacturers()})

    # -- board specs --

    def test_board_spec_upsert_round_trips(self) -> None:
        saved = mfg.save_board_spec(
            self.project_id,
            {"layer_count": 4, "solder_mask_color": "green"},
            {"layer_count": "extracted", "solder_mask_color": "manual"},
            updated_by="designer@x",
        )
        self.assertEqual(saved["specs"]["layer_count"], 4)
        self.assertEqual(saved["source"]["solder_mask_color"], "manual")

        # Upsert replaces.
        again = mfg.save_board_spec(
            self.project_id, {"layer_count": 6}, {"layer_count": "manual"}, updated_by="designer@x"
        )
        self.assertEqual(again["specs"]["layer_count"], 6)

    # -- runs --

    def test_run_lifecycle_and_defects(self) -> None:
        mid = mfg.create_manufacturer("MfgTest Runs Fab")
        run_id = mfg.create_run(
            self.project_id,
            manufacturer_id=mid,
            commit_sha="deadbeef",
            quantity_ordered=100,
            created_by="designer@x",
        )
        run = mfg.get_run(run_id)
        self.assertEqual(run["status"], "draft")
        self.assertEqual(run["quantity_ordered"], 100)
        self.assertEqual(run["manufacturer_name"], "MfgTest Runs Fab")
        self.assertEqual(run["defects"], [])

        # Advance and mark good.
        self.assertTrue(mfg.update_run(run_id, status="received", quantity_good=95))
        self.assertEqual(mfg.get_run(run_id)["quantity_good"], 95)

        # Log a defect, then resolve it (resolved_at gets stamped).
        def_id = mfg.log_defect(
            run_id, category="soldering", severity="major", quantity_affected=5,
            description="cold joints on U3", logged_by="qa@x",
        )
        defect = mfg.get_defect(def_id)
        self.assertEqual(defect["status"], "open")
        self.assertIsNone(defect["resolved_at"])

        self.assertTrue(mfg.update_defect(def_id, status="resolved"))
        resolved = mfg.get_defect(def_id)
        self.assertEqual(resolved["status"], "resolved")
        self.assertIsNotNone(resolved["resolved_at"])

        # The run now reports one defect and a defect_count in the list view.
        self.assertEqual(len(mfg.get_run(run_id)["defects"]), 1)
        listed = {r["id"]: r for r in mfg.list_runs(self.project_id)}
        self.assertEqual(listed[run_id]["defect_count"], 1)

        mfg.delete_manufacturer(mid)
        # Manufacturer delete nulls the run's FK, run survives.
        self.assertIsNotNone(mfg.get_run(run_id))
        self.assertIsNone(mfg.get_run(run_id)["manufacturer_id"])

    def test_deleting_run_cascades_to_defects(self) -> None:
        run_id = mfg.create_run(self.project_id, quantity_ordered=10)
        def_id = mfg.log_defect(run_id, description="scratch")
        self.assertTrue(mfg.delete_run(run_id))
        self.assertIsNone(mfg.get_defect(def_id))  # cascaded away

    def test_evidence_descriptor_round_trip(self) -> None:
        run_id = mfg.create_run(self.project_id, quantity_ordered=1)
        def_id = mfg.log_defect(run_id, description="see photo")
        evidence = [{"kind": "photo", "filename": "u3.jpg", "digest": "abc123",
                     "media_type": "image/jpeg", "size": 5000}]
        self.assertTrue(mfg.set_defect_evidence(def_id, evidence))
        self.assertEqual(mfg.get_defect(def_id)["evidence"][0]["digest"], "abc123")

    def test_create_run_unknown_project_rejected(self) -> None:
        with self.assertRaises(mfg.ManufacturingError):
            mfg.create_run("prj_does_not_exist", quantity_ordered=1)


if __name__ == "__main__":
    unittest.main()
