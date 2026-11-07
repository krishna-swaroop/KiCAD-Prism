"""Which path variables a board's models and its project's drawing sheets name."""

from __future__ import annotations

import unittest

from app.services import kicad_variables as variables


def board(*paths: str) -> dict:
    return {"footprints": [{"reference": f"R{i}", "models": [{"path": p}]} for i, p in enumerate(paths)]}


class VariablesInTests(unittest.TestCase):
    def test_the_three_forms_a_path_can_name_a_variable(self) -> None:
        self.assertEqual(variables.variables_in("${KICAD10_3DMODEL_DIR}/R.step"), {"KICAD10_3DMODEL_DIR"})
        self.assertEqual(variables.variables_in("$(LSF_KICAD_LIB)/x.step"), {"LSF_KICAD_LIB"})
        self.assertEqual(variables.variables_in(":KICAD9_3DMODEL_DIR:Capacitor_SMD/C.step"), {"KICAD9_3DMODEL_DIR"})

    def test_the_project_folder_and_embedded_and_plain_paths_name_nothing(self) -> None:
        for path in ("${KIPRJMOD}/models/x.step", "kicad-embed://x.step", "models/x.step", "/abs/x.step", ""):
            with self.subTest(path=path):
                self.assertEqual(variables.variables_in(path), set())

    def test_a_project_text_variable_is_expanded_to_the_variable_behind_it(self) -> None:
        text = {"LIB": "${LSF_KICAD_LIB}/3d"}
        self.assertEqual(variables.variables_in("${LIB}/x.step", text), {"LSF_KICAD_LIB"})
        self.assertEqual(variables.variables_in("${LIB}/x.step"), {"LIB"})

    def test_text_variables_can_chain_and_a_cycle_ends(self) -> None:
        self.assertEqual(variables.variables_in("${A}", {"A": "${B}/x", "B": "${REAL_LIB}"}), {"REAL_LIB"})
        self.assertEqual(variables.variables_in("${A}", {"A": "${B}", "B": "${A}"}), set())

    def test_a_text_variable_that_is_defined_with_nothing_behind_it_names_nothing(self) -> None:
        self.assertEqual(variables.variables_in("${LOCAL}/x.step", {"LOCAL": "models"}), set())


class BoardAndProjectTests(unittest.TestCase):
    def test_models_are_counted_per_variable(self) -> None:
        placements = board(
            "${KICAD10_3DMODEL_DIR}/a.step", "${KICAD10_3DMODEL_DIR}/b.step", "${LSF_KICAD_LIB}/c.step", "${KIPRJMOD}/d.step"
        )
        self.assertEqual(variables.model_variables(placements), {"KICAD10_3DMODEL_DIR": 2, "LSF_KICAD_LIB": 1})

    def test_a_model_naming_two_variables_counts_for_each(self) -> None:
        self.assertEqual(variables.model_variables(board("${A_LIB}/${B_LIB}/x.step")), {"A_LIB": 1, "B_LIB": 1})

    def test_a_footprint_with_no_models_and_odd_shapes_are_ignored(self) -> None:
        placements = {"footprints": [{"reference": "R1"}, {"models": [{"path": None}, {}, "x"]}, "x", None]}
        self.assertEqual(variables.model_variables(placements), {})
        self.assertEqual(variables.model_variables(None), {})
        self.assertEqual(variables.model_variables({}), {})

    def test_the_drawing_sheets_of_the_board_and_the_schematic(self) -> None:
        project = {
            "pcbnew": {"page_layout_descr_file": "${LSF_KICAD_LIB}/layouts/A4.kicad_wks"},
            "schematic": {"page_layout_descr_file": "${LSF_KICAD_LIB}/layouts/A4.kicad_wks"},
        }
        self.assertEqual(variables.sheet_variables(project), {"LSF_KICAD_LIB": 2})
        self.assertEqual(variables.sheet_variables({"pcbnew": {"page_layout_descr_file": ""}}), {})
        self.assertEqual(variables.sheet_variables(None), {})

    def test_referenced_expands_the_projects_text_variables_for_models_and_sheets(self) -> None:
        project = {
            "text_variables": {"LIB": "${LSF_KICAD_LIB}"},
            "pcbnew": {"page_layout_descr_file": "${LIB}/layouts/A4.kicad_wks"},
        }
        found = variables.referenced(board("${LIB}/3d/x.step", "${KICAD10_3DMODEL_DIR}/y.step"), project)
        self.assertEqual(dict(found.models), {"LSF_KICAD_LIB": 1, "KICAD10_3DMODEL_DIR": 1})
        self.assertEqual(dict(found.sheets), {"LSF_KICAD_LIB": 1})
        self.assertEqual(found.variables, ["KICAD10_3DMODEL_DIR", "LSF_KICAD_LIB"])

    def test_a_sheet_alone_does_not_make_a_variable_one_the_models_depend_on(self) -> None:
        found = variables.referenced(board("${KIPRJMOD}/x.step"), {"pcbnew": {"page_layout_descr_file": "${SHEET_LIB}/a"}})
        self.assertEqual(found.variables, [])
        self.assertEqual(found.all_variables, ["SHEET_LIB"])

    def test_text_variables_of_a_project_that_has_none(self) -> None:
        self.assertEqual(variables.project_text_variables({}), {})
        self.assertEqual(variables.project_text_variables({"text_variables": []}), {})
        self.assertEqual(variables.project_text_variables(None), {})


class ExpansionTests(unittest.TestCase):
    def folders(self, name: str):
        from pathlib import Path

        return {"LSF_KICAD_LIB": Path("/lib/lsf")}.get(name)

    def test_a_path_is_expanded_through_the_projects_text_variables_and_the_defined_folders(self) -> None:
        expanded = variables.expand("${LIB}/x.step", {"LIB": "${LSF_KICAD_LIB}/3d"}, self.folders)
        self.assertTrue(expanded.replace(chr(92), "/").endswith("/lsf/3d/x.step"), expanded)

    def test_an_undefined_variable_makes_the_path_unexpandable(self) -> None:
        self.assertIsNone(variables.expand("${NOPE_LIB}/x.step", {}, self.folders))
        self.assertIsNone(variables.expand(":NOPE_LIB:x.step", {}, self.folders))

    def test_the_project_folder_is_left_for_kicad(self) -> None:
        self.assertEqual(variables.expand("${KIPRJMOD}/x.step", {}, self.folders), "${KIPRJMOD}/x.step")

    def test_missing_models_counts_only_files_absent_under_a_defined_variable(self) -> None:
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            library = Path(tmp)
            (library / "present.step").write_text("x", encoding="utf-8")
            placements = board(
                "${LSF_KICAD_LIB}/present.step", "${LSF_KICAD_LIB}/gone.step", "${LSF_KICAD_LIB}/also-gone.step",
                "${UNDEFINED_LIB}/x.step", "${KIPRJMOD}/own.step", "plain/own.step",
            )
            counts = variables.missing_models(placements, {}, lambda name: library if name == "LSF_KICAD_LIB" else None)
        self.assertEqual(counts, {"LSF_KICAD_LIB": 2})

    def test_a_git_lfs_pointer_in_place_of_a_model_counts_as_missing(self) -> None:
        import tempfile
        from pathlib import Path

        pointer = "version https://git-lfs.github.com/spec/v1\noid sha256:" + "a" * 64 + "\nsize 4000\n"
        with tempfile.TemporaryDirectory() as tmp:
            library = Path(tmp)
            (library / "pointer.step").write_text(pointer, encoding="utf-8")
            (library / "real.step").write_bytes(b"ISO-10303-21;" * 200)
            placements = board("${LSF_KICAD_LIB}/pointer.step", "${LSF_KICAD_LIB}/real.step")
            counts = variables.missing_models(placements, {}, lambda name: library if name == "LSF_KICAD_LIB" else None)
        self.assertEqual(counts, {"LSF_KICAD_LIB": 1})

    def test_a_path_leaving_its_variables_folder_counts_as_missing_without_being_looked_at(self) -> None:
        import os
        import tempfile
        from pathlib import Path
        from unittest import mock

        with tempfile.TemporaryDirectory() as tmp:
            library = Path(tmp) / "lib"
            library.mkdir()
            (Path(tmp) / "secret.txt").write_text("x", encoding="utf-8")
            escapes = ("${LSF_KICAD_LIB}/../secret.txt", "${LSF_KICAD_LIB}/../absent.txt", "${LSF_KICAD_LIB}/x/../../secret.txt")
            looked: list[str] = []
            real = os.path.isfile
            with mock.patch.object(variables.os.path, "isfile", side_effect=lambda p: looked.append(p) or real(p)):
                counts = variables.missing_models(
                    board(*escapes), {}, lambda name: library if name == "LSF_KICAD_LIB" else None
                )
        self.assertEqual(counts, {"LSF_KICAD_LIB": 3}, "an existing file and a missing one answer the same")
        self.assertEqual(looked, [])

    def test_a_link_leaving_the_folder_counts_as_missing(self) -> None:
        import os
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            library = Path(tmp) / "lib"
            library.mkdir()
            outside = Path(tmp) / "outside.step"
            outside.write_bytes(b"ISO-10303-21;" * 200)
            try:
                os.symlink(outside, library / "link.step")
            except (OSError, NotImplementedError):
                self.skipTest("symlinks are not permitted here")
            counts = variables.missing_models(
                board("${LSF_KICAD_LIB}/link.step"), {}, lambda name: library if name == "LSF_KICAD_LIB" else None
            )
        self.assertEqual(counts, {"LSF_KICAD_LIB": 1})


if __name__ == "__main__":
    unittest.main()
