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


class SeveralProjectsInOneDirectory(unittest.TestCase):
    """KiCad allows two projects to share a directory; Prism has to as well.

    A fixture repository keeping its top and base plate side by side in the root
    used to import as a single project: both were discovered, but both answered
    to the same directory, so one checkbox ticked both, one row was registered,
    and it was named after one board while the viewer rendered the other.
    """

    tree = [
        "bed_of_nails_base.kicad_pro",
        "bed_of_nails_base.kicad_pcb",
        "bed_of_nails_base.kicad_sch",
        "bed_of_nails_top.kicad_pro",
        "bed_of_nails_top.kicad_pcb",
        "bed_of_nails_top.kicad_sch",
        "README.md",
    ]

    def test_both_projects_are_discovered(self) -> None:
        projects = discover(self.tree)
        self.assertEqual(
            [p.name for p in projects], ["bed_of_nails_base", "bed_of_nails_top"]
        )
        self.assertEqual([p.relative_path for p in projects], [".", "."])

    def test_each_project_records_its_own_file(self) -> None:
        projects = discover(self.tree)
        self.assertEqual(
            [p.project_file for p in projects],
            ["bed_of_nails_base.kicad_pro", "bed_of_nails_top.kicad_pro"],
        )

    def test_project_keys_are_distinct(self) -> None:
        keys = [p.project_key for p in discover(self.tree)]
        self.assertEqual(
            keys,
            [".::bed_of_nails_base.kicad_pro", ".::bed_of_nails_top.kicad_pro"],
        )
        self.assertEqual(len(set(keys)), 2)

    def test_design_files_are_attributed_per_project(self) -> None:
        # "Is there a board anywhere in this directory?" is the right question
        # for one project per directory and the wrong one for two.
        projects = discover(
            [
                "with_board.kicad_pro",
                "with_board.kicad_pcb",
                "sch_only.kicad_pro",
                "sch_only.kicad_sch",
            ]
        )
        by_name = {p.name: p for p in projects}
        self.assertTrue(by_name["with_board"].has_pcb)
        self.assertFalse(by_name["with_board"].has_schematic)
        self.assertFalse(by_name["sch_only"].has_pcb)
        self.assertTrue(by_name["sch_only"].has_schematic)

    def test_two_root_projects_are_type2(self) -> None:
        self.assertEqual(
            project_import_service.classify_import_type(discover(self.tree)), "type2"
        )


class ProjectKeys(unittest.TestCase):
    def test_a_lone_project_keeps_its_bare_directory_key(self) -> None:
        # Single-project repositories are the overwhelming majority, and their
        # keys have to keep the spelling already recorded against them.
        projects = discover(["board.kicad_pro", "board.kicad_pcb"])
        self.assertEqual(projects[0].project_key, ".::board.kicad_pro")

    def test_a_project_without_a_project_file_is_anchored_on_its_board(self) -> None:
        projects = discover(["board.kicad_pcb"])
        self.assertEqual(projects[0].project_file, "board.kicad_pcb")

    def test_a_row_without_an_anchor_keys_on_its_directory_alone(self) -> None:
        self.assertEqual(project_import_service.make_project_key("hardware/a", ""), "hardware/a")


class AdoptsAProjectRegisteredBeforeAnchors(unittest.TestCase):
    """Re-importing a directory that used to register as one project.

    An affected install has a single row for the directory, with no anchor,
    named after one of the projects. Re-importing discovers both anchored
    projects, and neither matches that row's key -- so both registered as new
    and the old, wrongly-identified row stayed alongside them. Discovery names
    a project after its `.kicad_pro` stem and always did, so the row's name
    says exactly which project it is, and it is taken over rather than
    duplicated.
    """

    def rows(self, *names_and_anchors: tuple[str, str]) -> list[dict]:
        return [
            {
                "id": f"prj_{name}",
                "name": name,
                "relative_path": ".",
                "project_file_rel": anchor,
            }
            for name, anchor in names_and_anchors
        ]

    def test_a_legacy_row_is_taken_over_by_its_own_project(self) -> None:
        row = project_import_service.find_legacy_row_to_adopt(
            self.rows(("top", "")), ".", "top"
        )
        self.assertIsNotNone(row)
        self.assertEqual(row["id"], "prj_top")

    def test_the_sibling_does_not_take_it_over(self) -> None:
        self.assertIsNone(
            project_import_service.find_legacy_row_to_adopt(
                self.rows(("top", "")), ".", "base"
            )
        )

    def test_an_already_anchored_row_is_never_adopted(self) -> None:
        self.assertIsNone(
            project_import_service.find_legacy_row_to_adopt(
                self.rows(("top", "top.kicad_pro")), ".", "top"
            )
        )

    def test_a_row_in_another_directory_is_not_adopted(self) -> None:
        rows = self.rows(("top", ""))
        rows[0]["relative_path"] = "hardware"
        self.assertIsNone(
            project_import_service.find_legacy_row_to_adopt(rows, ".", "top")
        )

    def test_an_ambiguous_match_is_left_alone(self) -> None:
        # Two unanchored rows with the same name in the same directory should
        # never have existed; guessing between them is worse than duplicating.
        self.assertIsNone(
            project_import_service.find_legacy_row_to_adopt(
                self.rows(("top", ""), ("top", "")), ".", "top"
            )
        )
