"""Discovery has to cope with how KiCad repositories are actually laid out.

Requiring a `.kicad_pro` in the same directory as the board made whole
repositories import as nothing at all: KiCad rewrites that file on every open,
so teams routinely gitignore it, and hierarchical designs keep their sheets one
level down.
"""

from __future__ import annotations

import unittest
from unittest import mock

from app.services import project_import_service


def discover(paths: list[str]):
    """Run discovery over a repository whose tree is exactly ``paths``."""
    repo = mock.Mock()
    repo.git.ls_tree.return_value = "\n".join(paths)
    return project_import_service.discover_projects_from_repo(repo)


class FindsProjectsWithoutAProjectFile(unittest.TestCase):
    def test_board_without_kicad_pro_is_found(self) -> None:
        projects = discover(["board.kicad_pcb", "board.kicad_sch", ".gitignore"])
        self.assertEqual(len(projects), 1)
        self.assertEqual(projects[0].relative_path, ".")
        self.assertEqual(projects[0].name, "board")
        self.assertFalse(projects[0].has_project_file)
        self.assertTrue(projects[0].has_pcb)
        self.assertTrue(projects[0].has_schematic)

    def test_schematic_only_project_is_found(self) -> None:
        projects = discover(["hardware/psu/psu.kicad_sch"])
        self.assertEqual(len(projects), 1)
        self.assertEqual(projects[0].name, "psu")
        self.assertTrue(projects[0].has_schematic)
        self.assertFalse(projects[0].has_pcb)

    def test_project_file_is_reported_when_present(self) -> None:
        projects = discover(["board.kicad_pro", "board.kicad_pcb"])
        self.assertTrue(projects[0].has_project_file)


class ReportsDesignFilesInSubdirectories(unittest.TestCase):
    def test_hierarchical_sheets_count_as_a_schematic(self) -> None:
        # The board's sheets live in Subsheets/, so looking only at the project
        # directory used to report "no schematic".
        projects = discover(
            [
                "hardware/main/main.kicad_pro",
                "hardware/main/main.kicad_pcb",
                "hardware/main/Subsheets/power.kicad_sch",
                "hardware/main/Subsheets/mcu.kicad_sch",
            ]
        )
        self.assertEqual(len(projects), 1)
        self.assertTrue(projects[0].has_schematic)

    def test_subsheet_directory_is_not_a_separate_project(self) -> None:
        projects = discover(
            [
                "board.kicad_pcb",
                "Subsheets/power.kicad_sch",
            ]
        )
        self.assertEqual([p.relative_path for p in projects], ["."])

    def test_sibling_boards_stay_separate(self) -> None:
        projects = discover(
            [
                "hardware/board-a/board-a.kicad_pcb",
                "hardware/board-b/board-b.kicad_pcb",
            ]
        )
        self.assertEqual(
            sorted(p.relative_path for p in projects),
            ["hardware/board-a", "hardware/board-b"],
        )


class KeepsExistingBehaviour(unittest.TestCase):
    def test_single_root_project_is_still_type1(self) -> None:
        projects = discover(["board.kicad_pro", "board.kicad_pcb", "board.kicad_sch"])
        self.assertEqual(
            project_import_service.classify_import_type(projects), "type1"
        )

    def test_multiple_projects_are_type2(self) -> None:
        projects = discover(
            ["a/a.kicad_pro", "a/a.kicad_pcb", "b/b.kicad_pro", "b/b.kicad_pcb"]
        )
        self.assertEqual(
            project_import_service.classify_import_type(projects), "type2"
        )

    def test_archive_and_hidden_directories_are_ignored(self) -> None:
        projects = discover(
            [
                "board.kicad_pro",
                "board.kicad_pcb",
                "archive/old-rev/old.kicad_pcb",
                ".backup/scratch.kicad_pcb",
                "node_modules/thing/x.kicad_pcb",
            ]
        )
        self.assertEqual([p.relative_path for p in projects], ["."])

    def test_repository_with_no_design_files_yields_nothing(self) -> None:
        self.assertEqual(discover(["README.md", "docs/guide.md"]), [])

    def test_container_directory_is_not_reported_as_a_project(self) -> None:
        # The root holds only a readme; the boards are below it.
        projects = discover(
            ["README.md", "hardware/board-a/board-a.kicad_pro", "hardware/board-a/board-a.kicad_pcb"]
        )
        self.assertEqual([p.relative_path for p in projects], ["hardware/board-a"])

    def test_shallow_projects_sort_first(self) -> None:
        projects = discover(
            [
                "deep/nested/board-z/board-z.kicad_pcb",
                "board-a.kicad_pro",
                "board-a.kicad_pcb",
            ]
        )
        self.assertEqual(projects[0].relative_path, ".")

    def test_unreadable_tree_yields_nothing(self) -> None:
        repo = mock.Mock()
        repo.git.ls_tree.side_effect = RuntimeError("empty repository")
        self.assertEqual(project_import_service.discover_projects_from_repo(repo), [])


if __name__ == "__main__":
    unittest.main()
