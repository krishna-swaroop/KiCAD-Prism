"""Design keys (ADR amendment K2 §3.6): recorded per bundle, looked up per commit, used by comment anchors.

On a scratch workspace with the stub CLI, whose semantic index ``designKey``
digests the configuration and the source members' bytes. Its parse reads no 3D
model, so a commit that changes only ``lib/models/part.step`` keeps the design
key, and one that changes a sheet does not.
"""

from __future__ import annotations

import unittest

from app.services import comment_anchor_service, project_service
from app.services.design_bundle import design_keys, jobs, rows
from support.postgres import requires_scratch_postgres
from support.repo import git
from test_design_bundle_job import _Workspace
from test_design_bundle_reuse import _commit


@requires_scratch_postgres("design keys")
class DesignKeyTests(_Workspace, unittest.TestCase):
    def _build(self) -> dict:
        return self.run_job(jobs.start_design_bundle_job("p1")).details

    def _project(self, repo) -> project_service.Project:
        return project_service.Project(
            id="p1", name="demo", description="", path=str(repo / "board"), last_modified="",
            project_file="demo.kicad_pro",
        )

    def test_stage_parse_records_the_design_key(self) -> None:
        self.add_project()
        built = self._build()
        row = rows.get_bundle("p1", built["bundle_key"])
        self.assertRegex(row["design_key"], r"^[0-9a-f]{64}$")
        self.assertEqual(built["design_key"], row["design_key"])

    def test_an_unchanged_design_keeps_its_key_and_a_changed_one_does_not(self) -> None:
        repo = self.add_project()
        first = git(repo, "rev-parse", "HEAD")
        self._build()
        same = _commit(repo, "lib/models/part.step", "ISO-10303-21; changed\n", "model only")
        self.assertTrue(self._build()["aliased"])
        changed = _commit(repo, "board/demo.kicad_sch", "(kicad_sch (version 20260306) (v2))\n", "sheet")
        self._build()
        keys = design_keys.of_commits("p1", [first, same, changed])
        self.assertIsNotNone(keys[first])
        self.assertEqual(keys[first], keys[same])
        self.assertNotEqual(keys[first], keys[changed])

    def test_a_bundle_without_a_recorded_key_is_read_once(self) -> None:
        repo = self.add_project()
        built = self._build()
        with self.scratch.connection() as conn:
            conn.execute("UPDATE ws_design_bundles SET design_key = NULL")
        found = design_keys.of_commit("p1", git(repo, "rev-parse", "HEAD"))
        self.assertEqual(found, built["design_key"])
        self.assertEqual(rows.get_bundle("p1", built["bundle_key"])["design_key"], found)

    def test_a_commit_with_no_bundle_has_no_design_key(self) -> None:
        repo = self.add_project()
        self.assertIsNone(design_keys.of_commit("p1", git(repo, "rev-parse", "HEAD")))

    def test_a_freehand_comment_stays_current_while_the_design_is_unchanged(self) -> None:
        repo = self.add_project()
        posted = git(repo, "rev-parse", "HEAD")
        self._build()
        anchor = comment_anchor_service.resolve_canvas_anchor(
            self._project(repo), revision={"commit": posted}, context="PCB",
        )
        self.assertIsNotNone(anchor.design_key)
        comment = {
            "id": "c1", "elementId": None, "filePath": None, "location": {"x": 1.0, "y": 2.0},
            "anchor": {"state": "pinned", "commit": posted, "designKey": None},
        }
        same = _commit(repo, "lib/models/part.step", "ISO-10303-21; changed\n", "model only")
        self._build()
        recorded: list[dict] = []
        [shown] = comment_anchor_service.resolve_displayed_bindings(
            self._project(repo), [comment], same, {}, recorded.append,
        )
        self.assertEqual(shown["anchorResolution"]["state"], "candidate")
        self.assertTrue(shown["anchorResolution"]["sameDesign"])
        self.assertEqual(recorded, [{"c1": anchor.design_key}])  # the old anchor is mapped once
        changed = _commit(repo, "board/demo.kicad_sch", "(kicad_sch (version 20260306) (v2))\n", "sheet")
        self._build()
        comment["anchor"]["designKey"] = anchor.design_key
        recorded.clear()
        [shown] = comment_anchor_service.resolve_displayed_bindings(
            self._project(repo), [comment], changed, {}, recorded.append,
        )
        self.assertEqual(shown["anchorResolution"]["reason"], "coordinate_review")
        self.assertEqual(recorded, [])

    def test_a_freehand_comment_follows_while_its_own_file_is_unchanged(self) -> None:
        repo = self.add_project()
        posted = git(repo, "rev-parse", "HEAD")

        def area(comment_id: str, context: str, page: str) -> dict:
            return {
                "id": comment_id, "context": context, "elementId": None, "filePath": None,
                "location": {"x": 1.0, "y": 2.0, "page": page},
                "anchor": {"state": "pinned", "commit": posted, "designKey": None},
            }

        comments = [
            area("board", "PCB", ""),
            area("root", "SCH", ""),
            area("power", "SCH", "Subsheets/power.kicad_sch:/aa/bb"),
            area("gone", "SCH", "Subsheets/missing.kicad_sch"),
        ]

        def shown(commit: str) -> dict[str, dict]:
            listed = comment_anchor_service.resolve_displayed_bindings(self._project(repo), comments, commit, {})
            return {comment["id"]: comment["anchorResolution"] for comment in listed}

        board_only = _commit(repo, "board/demo.kicad_pcb", "(kicad_pcb (version 20260206) (v2))\n", "board")
        after_board = shown(board_only)
        self.assertEqual(after_board["board"]["reason"], "coordinate_review")
        for sheet in ("root", "power"):
            self.assertEqual(after_board[sheet]["state"], "candidate")
            self.assertTrue(after_board[sheet]["sameFile"])
        self.assertEqual(after_board["gone"]["reason"], "coordinate_review")

        root_sheet = _commit(repo, "board/demo.kicad_sch", "(kicad_sch (version 20260306) (v2))\n", "sheet")
        after_sheet = shown(root_sheet)
        self.assertEqual(after_sheet["root"]["reason"], "coordinate_review")
        self.assertTrue(after_sheet["power"]["sameFile"])


if __name__ == "__main__":
    unittest.main()
