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


if __name__ == "__main__":
    unittest.main()
