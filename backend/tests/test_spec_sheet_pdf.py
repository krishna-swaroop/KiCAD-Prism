from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import spec_sheet_pdf_service as svc  # noqa: E402


def _render(specs, active_sections, config, project=None, identity=None):
    project = project or {"name": "Test Board", "display_name": "Test Board"}
    spec = {"specs": specs, "active_sections": active_sections, "spec_config": config}
    identity = identity if identity is not None else {"manufacturer": None, "schema": None}
    with patch.object(svc.workspace, "get_project_by_id", return_value=project), patch.object(
        svc.mfg, "get_board_spec", return_value=spec
    ), patch.object(svc.mfg, "identify_schema", return_value=identity):
        return svc.build_spec_sheet("prj_test")


class SpecSheetPdfTests(unittest.TestCase):
    """PDF generation is pure (no DB); the store calls are mocked."""

    CONFIG = (
        "[Base]\n"
        "material: choice(FR-4, Flex) = FR-4\n"
        "layer_count: choice(1, 2, 4) = 2\n"
        "inner_copper: choice(0.5, 1) when layer_count != 1\n"
        "[+Assembly]\n"
        "qty: int\n"
    )

    def test_produces_a_valid_pdf(self) -> None:
        pdf = _render({"material": "FR-4", "layer_count": "4"}, [], self.CONFIG)
        self.assertTrue(pdf.startswith(b"%PDF-"))
        self.assertGreater(len(pdf), 1000)

    def test_unknown_project_raises(self) -> None:
        with patch.object(svc.workspace, "get_project_by_id", return_value=None):
            with self.assertRaises(ValueError):
                svc.build_spec_sheet("prj_missing")

    def test_gate_evaluation_matches_the_form(self) -> None:
        # inner_copper is gated on layer_count != 1.
        self.assertTrue(svc._satisfied({"key": "layer_count", "op": "!=", "values": ["1"]},
                                       {"layer_count": "4"}))
        self.assertFalse(svc._satisfied({"key": "layer_count", "op": "!=", "values": ["1"]},
                                        {"layer_count": "1"}))
        # numeric comparisons
        self.assertTrue(svc._satisfied({"key": "n", "op": ">", "values": ["2"]}, {"n": "4"}))
        self.assertFalse(svc._satisfied({"key": "n", "op": ">", "values": ["2"]}, {"n": "2"}))
        # in-list and equality
        self.assertTrue(svc._satisfied({"key": "m", "op": "in", "values": ["Flex", "FR-4"]},
                                       {"m": "Flex"}))
        self.assertIsNone(None if svc._satisfied(None, {}) is True else "unreached")

    def test_bool_and_default_display(self) -> None:
        field_bool = {"key": "b", "type": "bool", "default": None}
        self.assertEqual(svc._display_value(field_bool, {"b": True}), "Yes")
        self.assertEqual(svc._display_value(field_bool, {"b": False}), "No")
        field_default = {"key": "x", "type": "text", "default": "FR-4"}
        self.assertEqual(svc._display_value(field_default, {}), "FR-4")  # falls back to default
        self.assertEqual(svc._display_value(field_default, {"x": ""}), "FR-4")
        field_empty = {"key": "y", "type": "text", "default": None}
        self.assertEqual(svc._display_value(field_empty, {}), "—")

    def test_empty_spec_still_renders(self) -> None:
        pdf = _render({}, [], "# no sections\n")
        self.assertTrue(pdf.startswith(b"%PDF-"))

    def test_header_shows_project_board_manufacturer_and_schema(self) -> None:
        import io

        from pypdf import PdfReader

        project = {
            "name": "MainBoard",
            "display_name": "Main Controller",
            "relative_path": "boards/main",
            "parent_repo": "robot-arm",
        }
        pdf = _render(
            {"material": "FR-4", "layer_count": "4"},
            [],
            self.CONFIG,
            project=project,
            identity={"manufacturer": "JLCPCB", "schema": "JLCPCB standard"},
        )
        text = "".join(page.extract_text() for page in PdfReader(io.BytesIO(pdf)).pages)
        self.assertIn("Main Controller", text)          # title is the project name
        self.assertIn("robot-arm/boards/main", text)    # multi-board board name
        self.assertIn("JLCPCB", text)                   # manufacturer
        self.assertIn("JLCPCB standard", text)          # schema

    def test_single_board_uses_the_board_name_not_a_path(self) -> None:
        import io

        from pypdf import PdfReader

        project = {"name": "SoloBoard", "display_name": "Solo Board", "relative_path": "."}
        pdf = _render({}, [], self.CONFIG, project=project)
        text = "".join(page.extract_text() for page in PdfReader(io.BytesIO(pdf)).pages)
        self.assertIn("Solo Board", text)      # title
        self.assertIn("SoloBoard", text)       # board name (the row name, no path)


if __name__ == "__main__":
    unittest.main()
