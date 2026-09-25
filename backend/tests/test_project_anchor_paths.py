"""Path resolution when a directory holds more than one KiCad project.

KiCad allows two projects to share a directory. Prism resolved a project's
board and schematic from the directory alone, so the two halves of a fixture
kept side by side in a repository root both resolved to whichever file sorted
first -- and editing the paths in project settings could not move either of
them, because the viewer never consulted those settings.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from app.services import path_config_service, semantic_visualizer_service


def write_tree(root: Path, names: list[str]) -> None:
    for name in names:
        (root / name).write_text("", encoding="utf-8")


class ResolvesTheAnchoredProject(unittest.TestCase):
    names = [
        "base.kicad_pro",
        "base.kicad_pcb",
        "base.kicad_sch",
        "top.kicad_pro",
        "top.kicad_pcb",
        "top.kicad_sch",
    ]

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        write_tree(self.root, self.names)
        path_config_service.clear_config_cache()
        self.addCleanup(self._tmp.cleanup)
        self.addCleanup(path_config_service.clear_config_cache)

    def test_each_anchor_detects_its_own_board(self) -> None:
        for anchor, board in (("top.kicad_pro", "top.kicad_pcb"), ("base.kicad_pro", "base.kicad_pcb")):
            with self.subTest(anchor=anchor):
                config = path_config_service.get_path_config(str(self.root), anchor=anchor)
                self.assertEqual(config.pcb, board)

    def test_each_anchor_detects_its_own_schematic(self) -> None:
        config = path_config_service.get_path_config(str(self.root), anchor="top.kicad_pro")
        self.assertEqual(config.schematic, "top.kicad_sch")

    def test_anchored_configs_do_not_share_a_cache_entry(self) -> None:
        # Same directory, same `.prism.json` mtime: the cache used to answer the
        # second project with the first project's paths.
        first = path_config_service.get_path_config(str(self.root), anchor="base.kicad_pro")
        second = path_config_service.get_path_config(str(self.root), anchor="top.kicad_pro")
        self.assertEqual(first.pcb, "base.kicad_pcb")
        self.assertEqual(second.pcb, "top.kicad_pcb")

    def test_resolved_paths_follow_the_anchor(self) -> None:
        resolved = path_config_service.resolve_paths(str(self.root), anchor="top.kicad_pro")
        self.assertEqual(Path(resolved.pcb or "").name, "top.kicad_pcb")
        self.assertEqual(Path(resolved.schematic or "").name, "top.kicad_sch")

    def test_a_glob_config_still_honours_the_anchor(self) -> None:
        config = path_config_service.PathConfig(pcb="*.kicad_pcb")
        resolved = path_config_service.resolve_paths(str(self.root), config, anchor="top.kicad_pro")
        self.assertEqual(Path(resolved.pcb or "").name, "top.kicad_pcb")

    def test_without_an_anchor_detection_is_deterministic(self) -> None:
        # Unsorted `glob` meant this answer could differ between machines.
        config = path_config_service.get_path_config(str(self.root), anchor=None)
        self.assertEqual(config.pcb, "base.kicad_pcb")


class NamespacedPrismConfig(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        write_tree(self.root, ["base.kicad_pro", "base.kicad_pcb", "top.kicad_pro", "top.kicad_pcb"])
        path_config_service.clear_config_cache()
        self.addCleanup(self._tmp.cleanup)
        self.addCleanup(path_config_service.clear_config_cache)

    def test_settings_saved_for_one_project_do_not_move_its_sibling(self) -> None:
        path_config_service.save_path_config(
            str(self.root),
            path_config_service.PathConfig(pcb="top.kicad_pcb"),
            anchor="top.kicad_pro",
        )
        top = path_config_service.get_path_config(str(self.root), anchor="top.kicad_pro")
        base = path_config_service.get_path_config(str(self.root), anchor="base.kicad_pro")
        self.assertEqual(top.pcb, "top.kicad_pcb")
        self.assertEqual(base.pcb, "base.kicad_pcb")

    def test_a_namespaced_override_beats_detection(self) -> None:
        (self.root / ".prism.json").write_text(
            json.dumps({"projects": {"top.kicad_pro": {"paths": {"pcb": "base.kicad_pcb"}}}}),
            encoding="utf-8",
        )
        config = path_config_service.get_path_config(str(self.root), anchor="top.kicad_pro")
        self.assertEqual(config.pcb, "base.kicad_pcb")

    def test_a_flat_config_written_by_an_earlier_prism_still_applies(self) -> None:
        (self.root / ".prism.json").write_text(
            json.dumps({"paths": {"pcb": "base.kicad_pcb"}, "project_name": "Fixture"}),
            encoding="utf-8",
        )
        config = path_config_service.get_path_config(str(self.root), anchor="top.kicad_pro")
        self.assertEqual(config.pcb, "base.kicad_pcb")
        self.assertEqual(config.project_name, "Fixture")

    def test_saving_without_an_anchor_keeps_the_flat_shape(self) -> None:
        path_config_service.save_path_config(
            str(self.root), path_config_service.PathConfig(pcb="top.kicad_pcb")
        )
        written = json.loads((self.root / ".prism.json").read_text(encoding="utf-8"))
        self.assertEqual(written["paths"]["pcb"], "top.kicad_pcb")
        self.assertNotIn("projects", written)


class FindsTheProjectFileTheViewerShouldRender(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        write_tree(self.root, ["base.kicad_pro", "base.kicad_pcb", "top.kicad_pro", "top.kicad_pcb"])
        path_config_service.clear_config_cache()
        self.addCleanup(self._tmp.cleanup)
        self.addCleanup(path_config_service.clear_config_cache)

    def test_the_anchor_decides_which_project_is_opened(self) -> None:
        found = semantic_visualizer_service.find_kicad_project(str(self.root), "top.kicad_pro")
        self.assertEqual(found.name, "top.kicad_pro")

    def test_a_configured_board_moves_the_viewer_to_its_project(self) -> None:
        # The reported symptom: settings pointed at the top plate, the viewer
        # kept rendering the base plate.
        (self.root / ".prism.json").write_text(
            json.dumps({"paths": {"pcb": "top.kicad_pcb"}}), encoding="utf-8"
        )
        found = semantic_visualizer_service.find_kicad_project(str(self.root))
        self.assertEqual(found.name, "top.kicad_pro")

    def test_without_an_anchor_or_config_the_first_project_is_used(self) -> None:
        found = semantic_visualizer_service.find_kicad_project(str(self.root))
        self.assertEqual(found.name, "base.kicad_pro")


class SettingsChangesInvalidateTheCachedBundle(unittest.TestCase):
    def test_editing_prism_json_changes_the_source_fingerprint(self) -> None:
        # `.prism.json` was excluded from the fingerprint, so a settings change
        # left the previously built bundle in place and appeared to do nothing.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_tree(root, ["board.kicad_pro", "board.kicad_pcb"])
            before = semantic_visualizer_service.source_fingerprint_for_root(root)
            (root / ".prism.json").write_text(
                json.dumps({"paths": {"pcb": "board.kicad_pcb"}}), encoding="utf-8"
            )
            after = semantic_visualizer_service.source_fingerprint_for_root(root)
            self.assertNotEqual(before, after)


if __name__ == "__main__":
    unittest.main()


class NeverResolvesOntoASiblingProject(unittest.TestCase):
    """KiCad associates files by name: `top.kicad_pro` owns `top.kicad_pcb`.

    Prism's fallback ("the first board in the directory") is right for a lone
    project whose board happens to be named differently, and wrong the moment a
    sibling project stands next to it -- that fallback is how a project rendered
    its neighbour's board.
    """

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        path_config_service.clear_config_cache()
        self.addCleanup(self._tmp.cleanup)
        self.addCleanup(path_config_service.clear_config_cache)

    def test_a_project_without_its_own_board_does_not_borrow_a_siblings(self) -> None:
        write_tree(self.root, ["base.kicad_pro", "base.kicad_pcb", "top.kicad_pro"])
        resolved = path_config_service.resolve_paths(str(self.root), anchor="top.kicad_pro")
        self.assertIsNone(resolved.pcb)

    def test_a_project_without_its_own_schematic_does_not_borrow_a_siblings(self) -> None:
        write_tree(self.root, ["base.kicad_pro", "base.kicad_sch", "top.kicad_pro"])
        resolved = path_config_service.resolve_paths(str(self.root), anchor="top.kicad_pro")
        self.assertIsNone(resolved.schematic)

    def test_a_lone_project_still_finds_a_differently_named_board(self) -> None:
        # No sibling to confuse it with, so the existing fallback still applies:
        # plenty of repositories name the board something other than the project.
        write_tree(self.root, ["fixture.kicad_pro", "mainboard.kicad_pcb"])
        config = path_config_service.get_path_config(str(self.root), anchor="fixture.kicad_pro")
        self.assertEqual(config.pcb, "mainboard.kicad_pcb")

    def test_an_unowned_board_is_still_available_to_a_project(self) -> None:
        # `shared.kicad_pcb` belongs to no project file, so the anchored project
        # may still fall back to it.
        write_tree(self.root, ["top.kicad_pro", "shared.kicad_pcb"])
        config = path_config_service.get_path_config(str(self.root), anchor="top.kicad_pro")
        self.assertEqual(config.pcb, "shared.kicad_pcb")

    def test_an_explicit_setting_still_wins(self) -> None:
        # Ownership shapes detection, not a choice the user made deliberately.
        write_tree(self.root, ["base.kicad_pro", "base.kicad_pcb", "top.kicad_pro"])
        (self.root / ".prism.json").write_text(
            json.dumps({"projects": {"top.kicad_pro": {"paths": {"pcb": "base.kicad_pcb"}}}}),
            encoding="utf-8",
        )
        config = path_config_service.get_path_config(str(self.root), anchor="top.kicad_pro")
        self.assertEqual(config.pcb, "base.kicad_pcb")


class BackgroundJobsKeepTheAnchor(unittest.TestCase):
    """A job must build the project it was asked for, not the first sibling.

    Jobs resolve their project through `project_service`'s own workspace-row
    converter rather than the API's. That converter dropped the anchor, so
    every WebGPU render, semantic index and KiCad workflow fell back to
    whichever `.kicad_pro` sorted first -- producing artifacts for the wrong
    project while the API, which uses a different converter, showed the right
    one.
    """

    def test_the_converter_carries_the_anchor(self) -> None:
        from app.services import project_service

        row = {
            "id": "prj_x",
            "name": "top",
            "description": "",
            "path": "/tmp/shared",
            "last_modified": "",
            "relative_path": ".",
            "project_file_rel": "top.kicad_pro",
        }
        project = project_service._workspace_row_to_project(row)
        self.assertEqual(project.project_file, "top.kicad_pro")
        self.assertEqual(project_service.project_anchor(project), "top.kicad_pro")

    def test_a_row_without_an_anchor_still_converts(self) -> None:
        from app.services import project_service

        row = {
            "id": "prj_y",
            "name": "solo",
            "description": "",
            "path": "/tmp/solo",
            "last_modified": "",
            "relative_path": ".",
            "project_file_rel": "",
        }
        project = project_service._workspace_row_to_project(row)
        self.assertIsNone(project.project_file)
        self.assertIsNone(project_service.project_anchor(project))

    def test_both_converters_agree(self) -> None:
        # The API and the job runner resolved the same row differently, which
        # is why this went unnoticed: the workspace looked correct.
        from app.api import _helpers
        from app.services import project_service

        row = {
            "id": "prj_z",
            "name": "base",
            "description": "",
            "path": "/tmp/shared",
            "last_modified": "",
            "relative_path": ".",
            "project_file_rel": "base.kicad_pro",
        }
        self.assertEqual(
            project_service._workspace_row_to_project(row).project_file,
            _helpers._row_to_project(row).project_file,
        )


class HistoricalRevisionsHonourTheAnchor(unittest.TestCase):
    """Reading a project's settings at a past commit is anchor-scoped too.

    The live path resolver learned about ``projects.<anchor>``; the commit
    reader kept flattening the file the old way, so a co-located sibling looked
    correct on the working tree and showed the first project's board -- or the
    defaults -- at a historical revision.
    """

    RAW = {
        "paths": {"pcb": "shared.kicad_pcb"},
        "schematic": "shared.kicad_sch",
        "projects": {
            "top.kicad_pro": {"paths": {"pcb": "top.kicad_pcb"}},
            "base.kicad_pro": {"schematic": "base.kicad_sch"},
        },
    }

    def test_an_anchor_overrides_the_shared_settings(self) -> None:
        merged = path_config_service.config_for_anchor(self.RAW, "top.kicad_pro")
        self.assertEqual(merged["pcb"], "top.kicad_pcb")
        # Untouched keys still fall through to the shared block.
        self.assertEqual(merged["schematic"], "shared.kicad_sch")

    def test_each_anchor_gets_its_own_settings(self) -> None:
        base = path_config_service.config_for_anchor(self.RAW, "base.kicad_pro")
        self.assertEqual(base["schematic"], "base.kicad_sch")
        self.assertEqual(base["pcb"], "shared.kicad_pcb")

    def test_without_an_anchor_the_shared_settings_are_used(self) -> None:
        merged = path_config_service.config_for_anchor(self.RAW, None)
        self.assertEqual(merged["pcb"], "shared.kicad_pcb")
        self.assertEqual(merged["schematic"], "shared.kicad_sch")
        self.assertNotIn("projects", merged)

    def test_an_unknown_anchor_falls_back_rather_than_failing(self) -> None:
        merged = path_config_service.config_for_anchor(self.RAW, "absent.kicad_pro")
        self.assertEqual(merged["pcb"], "shared.kicad_pcb")

    def test_the_commit_reader_uses_the_same_merge(self) -> None:
        # The live reader and the commit reader disagreeing is the bug; this
        # holds them to one implementation.
        from app.api import projects as projects_api

        self.assertIs(
            projects_api._merge_commit_config,
            path_config_service.config_for_anchor,
        )

    def test_default_commit_globs_select_the_anchored_schematic(self) -> None:
        from app.api import projects as projects_api
        from app.services import project_service

        project = project_service.Project(
            id="prj_top",
            name="top",
            description="",
            path="/tmp/shared",
            last_modified="",
            project_file="top.kicad_pro",
        )
        expected = object()
        with (
            mock.patch.object(
                projects_api.file_service,
                "find_files_in_commit",
                return_value=["base.kicad_sch", "top.kicad_sch"],
            ),
            mock.patch.object(
                projects_api,
                "_read_commit_file",
                return_value=expected,
            ) as read_file,
        ):
            result = projects_api._read_configured_commit_file(
                project,
                "deadbeef",
                "*.kicad_sch",
                not_found_detail="Schematic not found",
            )

        self.assertIs(result, expected)
        self.assertEqual(read_file.call_args.args[2], "top.kicad_sch")

    def test_a_missing_anchored_file_does_not_select_a_sibling(self) -> None:
        from fastapi import HTTPException
        from app.api import projects as projects_api
        from app.services import project_service

        project = project_service.Project(
            id="prj_top",
            name="top",
            description="",
            path="/tmp/shared",
            last_modified="",
            project_file="top.kicad_pro",
        )
        with mock.patch.object(
            projects_api.file_service,
            "find_files_in_commit",
            return_value=["base.kicad_pcb"],
        ):
            with self.assertRaises(HTTPException) as raised:
                projects_api._read_configured_commit_file(
                    project,
                    "deadbeef",
                    "*.kicad_pcb",
                    not_found_detail="PCB not found",
                )
        self.assertEqual(raised.exception.status_code, 404)

    def test_sibling_root_schematics_are_not_loaded_as_subsheets(self) -> None:
        from app.api import projects as projects_api
        from app.services import project_service

        project = project_service.Project(
            id="prj_top",
            name="top",
            description="",
            path="/tmp/shared",
            last_modified="",
            project_file="top.kicad_pro",
        )
        self.assertEqual(
            projects_api._sibling_root_schematic_names(
                project, ["base.kicad_pro", "top.kicad_pro"]
            ),
            {"base.kicad_sch"},
        )


class DesignComparisonPicksTheAnchoredProject(unittest.TestCase):
    """A comparison scans a checked-out revision, where only filenames identify
    a project. Selecting the shallowest file meant a second co-located project
    compared its sibling's board while looking correct live."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.snap = Path(self._tmp.name)
        write_tree(
            self.snap,
            [
                "base.kicad_pro",
                "base.kicad_pcb",
                "top.kicad_pro",
                "top.kicad_pcb",
            ],
        )
        self.addCleanup(self._tmp.cleanup)

    def test_the_anchor_selects_its_own_project_file(self) -> None:
        from app.services import design_compare_sources as sources

        self.assertEqual(
            sources._find_pro(self.snap, "top.kicad_pro").name, "top.kicad_pro"
        )
        self.assertEqual(
            sources._find_pro(self.snap, "base.kicad_pro").name, "base.kicad_pro"
        )

    def test_the_anchor_selects_its_own_board(self) -> None:
        from app.services import design_compare_sources as sources

        self.assertEqual(
            sources._find_pcb(self.snap, "top.kicad_pro").name, "top.kicad_pcb"
        )
        self.assertEqual(
            sources._find_pcb(self.snap, "base.kicad_pro").name, "base.kicad_pcb"
        )

    def test_without_an_anchor_the_old_rule_still_applies(self) -> None:
        from app.services import design_compare_sources as sources

        self.assertEqual(sources._find_pro(self.snap).name, "base.kicad_pro")
        self.assertEqual(sources._find_pcb(self.snap).name, "base.kicad_pcb")

    def test_a_revision_predating_the_project_does_not_compare_a_sibling(self) -> None:
        # The anchored file may simply not exist at an older commit. Selecting
        # a sibling would manufacture a comparison against a different design.
        from app.services import design_compare_sources as sources

        older = Path(self._tmp.name) / "older"
        older.mkdir()
        write_tree(older, ["base.kicad_pro", "base.kicad_pcb"])
        self.assertIsNone(sources._find_pcb(older, "top.kicad_pro"))

    def test_comparison_cache_identity_includes_the_anchor(self) -> None:
        from app.services import design_compare_service

        with mock.patch.object(
            design_compare_service,
            "_project_anchor",
            side_effect=("top.kicad_pro", "base.kicad_pro"),
        ):
            top = design_compare_service._project_cache_namespace("prj_shared")
            base = design_compare_service._project_cache_namespace("prj_shared")

        self.assertNotEqual(top, base)

    def test_comparison_anchor_lookup_errors_fail_closed(self) -> None:
        from app.services import design_compare_service

        with mock.patch.object(
            design_compare_service.workspace,
            "get_project_by_id",
            side_effect=RuntimeError("database unavailable"),
        ):
            with self.assertRaisesRegex(RuntimeError, "database unavailable"):
                design_compare_service._project_anchor("prj_shared")

    def test_comparison_artifact_identity_includes_the_anchor(self) -> None:
        from app.services import design_compare_service

        def artifact_key(anchor: str) -> tuple[str, str]:
            with mock.patch.object(
                design_compare_service.workspace,
                "get_project_by_id",
                return_value={
                    "id": "prj_shared",
                    "repo_id": "repo_shared",
                    "project_file_rel": anchor,
                },
            ), mock.patch.object(
                design_compare_service.v3_jobs,
                "enqueue",
                return_value={"job_id": "job_compare"},
            ) as enqueue:
                design_compare_service.start_design_compare_job(
                    "prj_shared", "base", "head"
                )
            return (
                str(enqueue.call_args.kwargs["artifact_key"]),
                str(enqueue.call_args.args[1]["project_file_rel"]),
            )

        top_key, top_payload_anchor = artifact_key("top.kicad_pro")
        base_key, base_payload_anchor = artifact_key("base.kicad_pro")
        self.assertNotEqual(top_key, base_key)
        self.assertEqual(top_payload_anchor, "top.kicad_pro")
        self.assertEqual(base_payload_anchor, "base.kicad_pro")

    def test_semantic_and_webgpu_cache_identity_includes_the_anchor(self) -> None:
        from app.services import semantic_index_service, semantic_visualizer_service

        top = self.snap / "top.kicad_pro"
        base = self.snap / "base.kicad_pro"
        self.assertNotEqual(
            semantic_index_service.source_revision_key_for_project_file(top),
            semantic_index_service.source_revision_key_for_project_file(base),
        )
        self.assertNotEqual(
            semantic_visualizer_service.source_fingerprint_for_project_file(top),
            semantic_visualizer_service.source_fingerprint_for_project_file(base),
        )
