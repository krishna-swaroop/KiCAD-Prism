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

    # -- templates --

    def test_template_crud_scoped_to_manufacturer(self) -> None:
        mid = mfg.create_manufacturer("MfgTest Template Fab")
        tid = mfg.create_template(mid, "4-layer standard", "[S]\nlayer_count: int = 4")
        listed = {t["id"]: t for t in mfg.list_templates(mid)}
        self.assertIn(tid, listed)
        self.assertEqual(listed[tid]["manufacturer_name"], "MfgTest Template Fab")

        self.assertTrue(mfg.update_template(tid, name="4-layer ENIG"))
        self.assertEqual(mfg.get_template(tid)["name"], "4-layer ENIG")

        # Deleting the manufacturer cascades to its templates.
        mfg.delete_manufacturer(mid)
        self.assertIsNone(mfg.get_template(tid))

    def test_apply_template_copies_config_into_project(self) -> None:
        # Copy-on-apply: the project gets its own copy of the template's config.
        saved = mfg.save_spec_config(self.project_id, "[X]\nfoo: text", updated_by="designer@x")
        self.assertIn("foo: text", saved["spec_config"])

    def test_seed_is_idempotent(self) -> None:
        mfg.seed_builtin_manufacturers()
        # Everything exists and is current now; a second run reports no changes.
        self.assertEqual(mfg.seed_builtin_manufacturers(), [])
        names = {m["name"] for m in mfg.list_manufacturers()}
        self.assertIn("JLCPCB", names)
        self.assertIn("PCBWay", names)

    def test_sync_refreshes_unedited_builtin_but_not_edited_one(self) -> None:
        mfg.seed_builtin_manufacturers()
        jlcpcb = next(m for m in mfg.list_manufacturers() if m["name"] == "JLCPCB")
        templates = {t["name"]: t for t in mfg.list_templates(jlcpcb["id"])}
        standard = templates["JLCPCB standard"]
        advanced = templates["JLCPCB advanced PCB"]

        # Simulate an old, out-of-date seed by overwriting the stored text AND its
        # recorded seed hash to match (so it looks unedited, just stale).
        import app.services.manufacturing_service as m

        stale = "[Old]\nx: int"
        with m._connect() as conn:
            conn.execute(
                "UPDATE ws_spec_templates SET spec_config = %s, seeded_hash = %s WHERE id = %s",
                (stale, m._config_hash(stale), standard["id"]),
            )
            conn.commit()

        # A user edits the advanced one (its text no longer matches its seed hash).
        mfg.update_template(advanced["id"], spec_config="[Mine]\ny: text")

        mfg.seed_builtin_manufacturers()

        after = {t["name"]: mfg.get_template(t["id"]) for t in mfg.list_templates(jlcpcb["id"])}
        # The unedited (just stale) standard template was refreshed back to source.
        self.assertNotEqual(after["JLCPCB standard"]["spec_config"], stale)
        self.assertIn("[Base]", after["JLCPCB standard"]["spec_config"])
        # The user-edited advanced template was left exactly as the user left it.
        self.assertEqual(after["JLCPCB advanced PCB"]["spec_config"], "[Mine]\ny: text")

    def test_sync_creates_a_newly_added_builtin_template(self) -> None:
        # Seed, then delete the advanced template to mimic an install predating it.
        mfg.seed_builtin_manufacturers()
        jlcpcb = next(m for m in mfg.list_manufacturers() if m["name"] == "JLCPCB")
        advanced = next(
            t for t in mfg.list_templates(jlcpcb["id"]) if t["name"] == "JLCPCB advanced PCB"
        )
        mfg.delete_template(advanced["id"])

        mfg.seed_builtin_manufacturers()  # should recreate it
        names = {t["name"] for t in mfg.list_templates(jlcpcb["id"])}
        self.assertIn("JLCPCB advanced PCB", names)

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

    def test_create_run_freezes_current_board_spec(self) -> None:
        # Save a spec, create a run, then change the spec: the run keeps a picture.
        mfg.save_spec_config(self.project_id, "[Stackup]\nlayers: choice(2,4) | Layer count", updated_by="d@x")
        mfg.save_board_spec(self.project_id, {"layers": "4"}, {}, updated_by="d@x")
        run_id = mfg.create_run(self.project_id, quantity_ordered=5)

        snap = mfg.get_run(run_id)["spec_snapshot"]
        self.assertEqual(snap["specs"], {"layers": "4"})
        self.assertIn("Layer count", snap["spec_config"])

        # Moving the live spec on does not touch the run's frozen copy.
        mfg.save_board_spec(self.project_id, {"layers": "2"}, {}, updated_by="d@x")
        self.assertEqual(mfg.get_run(run_id)["spec_snapshot"]["specs"], {"layers": "4"})

    def test_create_run_unknown_project_rejected(self) -> None:
        with self.assertRaises(mfg.ManufacturingError):
            mfg.create_run("prj_does_not_exist", quantity_ordered=1)


if __name__ == "__main__":
    unittest.main()
