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

from app.services import kicad_project_locator, path_config_service


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

    def test_settings_namespaced_for_one_project_do_not_move_its_sibling(self) -> None:
        (self.root / ".prism.json").write_text(
            json.dumps({"projects": {"top.kicad_pro": {"paths": {"pcb": "top.kicad_pcb"}}}}),
            encoding="utf-8",
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


class FindsTheProjectFileTheViewerShouldRender(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        write_tree(self.root, ["base.kicad_pro", "base.kicad_pcb", "top.kicad_pro", "top.kicad_pcb"])
        path_config_service.clear_config_cache()
        self.addCleanup(self._tmp.cleanup)
        self.addCleanup(path_config_service.clear_config_cache)

    def test_the_anchor_decides_which_project_is_opened(self) -> None:
        found = kicad_project_locator.find_kicad_project(str(self.root), "top.kicad_pro")
        self.assertEqual(found.name, "top.kicad_pro")

    def test_a_configured_board_moves_the_viewer_to_its_project(self) -> None:
        # The reported symptom: settings pointed at the top plate, the viewer
        # kept rendering the base plate.
        (self.root / ".prism.json").write_text(
            json.dumps({"paths": {"pcb": "top.kicad_pcb"}}), encoding="utf-8"
        )
        found = kicad_project_locator.find_kicad_project(str(self.root))
        self.assertEqual(found.name, "top.kicad_pro")

    def test_without_an_anchor_or_config_the_first_project_is_used(self) -> None:
        found = kicad_project_locator.find_kicad_project(str(self.root))
        self.assertEqual(found.name, "base.kicad_pro")


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


class CacheFollowsTheDetectedSources(unittest.TestCase):
    """A sync runs in the worker; the API process has to see the new sources.

    The cache used to be validated only by `.prism.json` and stored settings,
    so a renamed or added source stayed invisible until restart.
    """

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        path_config_service.clear_config_cache()
        self.addCleanup(self._tmp.cleanup)
        self.addCleanup(path_config_service.clear_config_cache)

    def test_a_renamed_schematic_is_detected_without_an_explicit_invalidation(self) -> None:
        (self.root / "old.kicad_sch").write_text("", encoding="utf-8")
        first = path_config_service.get_path_config(str(self.root))
        self.assertEqual(first.schematic, "old.kicad_sch")

        (self.root / "old.kicad_sch").rename(self.root / "new.kicad_sch")
        second = path_config_service.get_path_config(str(self.root))
        self.assertEqual(second.schematic, "new.kicad_sch")

    def test_a_new_board_is_detected_without_an_explicit_invalidation(self) -> None:
        first = path_config_service.get_path_config(str(self.root))
        self.assertEqual(first.pcb, path_config_service.DEFAULT_PATHS["pcb"])

        (self.root / "board.kicad_pcb").write_text("", encoding="utf-8")
        second = path_config_service.get_path_config(str(self.root))
        self.assertEqual(second.pcb, "board.kicad_pcb")

    def test_a_new_readme_is_detected_without_an_explicit_invalidation(self) -> None:
        first = path_config_service.get_path_config(str(self.root))
        self.assertNotEqual(first.readme, "README.rst")
        (self.root / "README.rst").write_text("Board", encoding="utf-8")
        second = path_config_service.get_path_config(str(self.root))
        self.assertEqual(second.readme, "README.rst")


if __name__ == "__main__":
    unittest.main()
