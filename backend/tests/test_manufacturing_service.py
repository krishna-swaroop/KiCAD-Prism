from __future__ import annotations

import os
import sys
import unittest
import uuid
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

    def test_sync_never_overwrites_an_existing_template(self) -> None:
        # Templates are fully mutable: an edit must always persist across seeding.
        mfg.seed_builtin_manufacturers()
        jlcpcb = next(m for m in mfg.list_manufacturers() if m["name"] == "JLCPCB")
        templates = {t["name"]: t for t in mfg.list_templates(jlcpcb["id"])}

        mfg.update_template(templates["JLCPCB standard"]["id"], spec_config="[Mine]\ny: text")
        mfg.update_template(templates["JLCPCB advanced PCB"]["id"], capabilities={"min_track_width": 0.5})

        mfg.seed_builtin_manufacturers()  # a restart must not revert anything

        after = {t["name"]: mfg.get_template(t["id"]) for t in mfg.list_templates(jlcpcb["id"])}
        self.assertEqual(after["JLCPCB standard"]["spec_config"], "[Mine]\ny: text")
        self.assertEqual(after["JLCPCB advanced PCB"]["capabilities"], {"min_track_width": 0.5})

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

    def test_builtin_jlcpcb_templates_carry_capabilities(self) -> None:
        # Delete first so the seed recreates the templates with pristine values;
        # the seed never overwrites an existing (possibly edited) row.
        mfg.seed_builtin_manufacturers()
        jlcpcb = next(m for m in mfg.list_manufacturers() if m["name"] == "JLCPCB")
        for t in mfg.list_templates(jlcpcb["id"]):
            if t["name"].startswith("JLCPCB"):
                mfg.delete_template(t["id"])
        mfg.seed_builtin_manufacturers()

        by_name = {t["name"]: mfg.get_template(t["id"]) for t in mfg.list_templates(jlcpcb["id"])}
        std = by_name["JLCPCB standard"]["capabilities"]
        self.assertEqual(std["min_track_width"], 0.1)
        self.assertEqual(std["min_via_diameter"], 0.25)

        # The advanced process reaches finer features.
        adv = by_name["JLCPCB advanced PCB"]["capabilities"]
        self.assertLess(adv["min_track_width"], std["min_track_width"])

    def test_capability_backfill_does_not_clobber_user_capabilities(self) -> None:
        mfg.seed_builtin_manufacturers()
        jlcpcb = next(m for m in mfg.list_manufacturers() if m["name"] == "JLCPCB")
        std = next(t for t in mfg.list_templates(jlcpcb["id"]) if t["name"] == "JLCPCB standard")
        # A user tightens a capability.
        mfg.update_template(std["id"], capabilities={"min_track_width": 0.2})
        mfg.seed_builtin_manufacturers()  # must not overwrite it
        self.assertEqual(mfg.get_template(std["id"])["capabilities"]["min_track_width"], 0.2)

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

    def test_run_snapshot_captures_all_fields_with_defaults(self) -> None:
        # A spec with defaults and one edited value: the run's snapshot should carry
        # every field (defaults filled in), not just the edited one.
        cfg = (
            "[Base]\n"
            "material: choice(FR-4, Flex) = FR-4 | Material\n"
            "finish: choice(HASL, ENIG) = HASL | Finish\n"
            "notes: text | Notes\n"
        )
        mfg.save_spec_config(self.project_id, cfg, updated_by="d@x")
        mfg.save_board_spec(self.project_id, {"finish": "ENIG"}, {}, updated_by="d@x")
        run_id = mfg.create_run(self.project_id, quantity_ordered=1)

        specs = mfg.get_run(run_id)["spec_snapshot"]["specs"]
        self.assertEqual(specs["material"], "FR-4")   # from the schema default
        self.assertEqual(specs["finish"], "ENIG")     # the edited value wins
        self.assertIn("notes", specs)                  # a value-less field is present too

    def test_template_capabilities_and_spec_live_link(self) -> None:
        mid = mfg.create_manufacturer("Caps Fab " + uuid.uuid4().hex[:5])
        mfg.attach_manufacturer(self.project_id, mid)
        tid = mfg.create_template(mid, "flex", capabilities={"min_track_width": 0.09})
        self.assertEqual(mfg.get_template(tid)["capabilities"], {"min_track_width": 0.09})

        # A spec built from the template links to it and reads its capabilities live.
        sid = mfg.create_project_spec(self.project_id, mid, "flex-spec", template_id=tid)
        spec = mfg.get_project_spec(sid)
        self.assertEqual(spec["template_id"], tid)
        self.assertEqual(spec["template_name"], "flex")
        self.assertEqual(spec["template_capabilities"], {"min_track_width": 0.09})

        # Editing the template's capabilities is reflected in the linked spec.
        mfg.update_template(tid, capabilities={"min_track_width": 0.05, "allow_microvias": True})
        self.assertEqual(
            mfg.get_project_spec(sid)["template_capabilities"],
            {"min_track_width": 0.05, "allow_microvias": True},
        )

        # A blank spec (no template) has no capabilities.
        blank = mfg.create_project_spec(self.project_id, mid, "blank-spec")
        self.assertIsNone(mfg.get_project_spec(blank)["template_id"])
        self.assertEqual(mfg.get_project_spec(blank)["template_capabilities"], {})

        # A template from a different manufacturer is not linked.
        other = mfg.create_manufacturer("Other Fab " + uuid.uuid4().hex[:5])
        other_tid = mfg.create_template(other, "std")
        mfg.attach_manufacturer(self.project_id, other)
        cross = mfg.create_project_spec(self.project_id, mid, "cross-spec", template_id=other_tid)
        self.assertIsNone(mfg.get_project_spec(cross)["template_id"])

        for s in (sid, blank, cross):
            mfg.delete_project_spec(s)
        mfg.delete_template(tid)
        mfg.delete_manufacturer(mid)
        mfg.delete_manufacturer(other)

    def test_create_run_unknown_project_rejected(self) -> None:
        with self.assertRaises(mfg.ManufacturingError):
            mfg.create_run("prj_does_not_exist", quantity_ordered=1)

    # -- project manufacturers and named specs --

    def test_attach_manufacturers_and_named_specs(self) -> None:
        m1 = mfg.create_manufacturer("Named Specs Fab A")
        m2 = mfg.create_manufacturer("Named Specs Fab B")
        mfg.attach_manufacturer(self.project_id, m1)
        mfg.attach_manufacturer(self.project_id, m2)
        mfg.attach_manufacturer(self.project_id, m1)  # idempotent
        attached = {m["id"] for m in mfg.list_project_manufacturers(self.project_id)}
        self.assertIn(m1, attached)
        self.assertIn(m2, attached)

        # Several named specs per (project, manufacturer).
        s1 = mfg.create_project_spec(self.project_id, m1, "Prototype", spec_config="[S]\nk: int | K")
        s2 = mfg.create_project_spec(self.project_id, m1, "4L ENIG")
        for_m1 = {s["id"] for s in mfg.list_project_specs(self.project_id, m1)}
        self.assertEqual(for_m1, {s1, s2})
        # A different manufacturer sees none of them.
        self.assertEqual(mfg.list_project_specs(self.project_id, m2), [])

        # Name collision (case-insensitive) is rejected.
        with self.assertRaises(mfg.ManufacturingError):
            mfg.create_project_spec(self.project_id, m1, "prototype")

        # Update values, then a run frozen against the named spec keeps the picture.
        mfg.update_project_spec(s1, specs={"k": 3}, updated_by="d@x")
        run_id = mfg.create_run(self.project_id, manufacturer_id=m1, spec_id=s1, quantity_ordered=2)
        run = mfg.get_run(run_id)
        self.assertEqual(run["spec_id"], s1)
        self.assertEqual(run["spec_name"], "Prototype")
        self.assertEqual(run["spec_snapshot"]["specs"], {"k": 3})

        # A spec from the wrong manufacturer is rejected for the run.
        with self.assertRaises(mfg.ManufacturingError):
            mfg.create_run(self.project_id, manufacturer_id=m2, spec_id=s1, quantity_ordered=1)

        # Detach is forgiving: the spec survives and re-attaching resurfaces it.
        mfg.detach_manufacturer(self.project_id, m1)
        self.assertNotIn(m1, {m["id"] for m in mfg.list_project_manufacturers(self.project_id)})
        self.assertIsNotNone(mfg.get_project_spec(s1))
        mfg.attach_manufacturer(self.project_id, m1)
        self.assertIn(s1, {s["id"] for s in mfg.list_project_specs(self.project_id, m1)})

        mfg.delete_project_spec(s1)
        mfg.delete_project_spec(s2)
        mfg.delete_run(run_id)
        mfg.delete_manufacturer(m1)
        mfg.delete_manufacturer(m2)


if __name__ == "__main__":
    unittest.main()
