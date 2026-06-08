from __future__ import annotations

import sys
import tempfile
import types
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import kicad_analysis_service  # noqa: E402


class KiCadAnalysisServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        kicad_analysis_service.clear_analysis_cache()

    def test_validate_commit_hash_rejects_non_hash_input(self) -> None:
        for value in ("HEAD", "main", "../abc", "abc123 -- path", ""):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    kicad_analysis_service.validate_commit_hash(value)

    def test_load_design_uses_project_loader_for_same_stem_project_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            project = root / "Demo.kicad_pro"
            schematic = root / "Demo.kicad_sch"
            pcb = root / "Demo.kicad_pcb"
            for path in (project, schematic, pcb):
                path.write_text("", encoding="utf-8")

            design = SimpleNamespace(project=None, project_path=None, pcb_path=None, _pcb=None)
            fake_module = types.ModuleType("kicad_monkey")
            fake_module.KiCadDesign = SimpleNamespace(
                from_project_file=lambda _path: None,
                from_schematic_file=lambda _path: None,
            )
            fake_module.KiCadProject = SimpleNamespace(from_file=lambda _path: None)
            with patch.dict(sys.modules, {"kicad_monkey": fake_module}), \
                patch("kicad_monkey.KiCadDesign.from_project_file", return_value=design) as from_project, \
                patch("kicad_monkey.KiCadDesign.from_schematic_file") as from_schematic, \
                patch("kicad_monkey.KiCadProject.from_file", return_value=object()):
                loaded = kicad_analysis_service._load_design(
                    kicad_analysis_service.DesignFileSet(root, project, schematic, pcb)
                )

            self.assertIs(loaded, design)
            from_project.assert_called_once_with(project)
            from_schematic.assert_not_called()
            self.assertEqual(loaded.project_path, project)
            self.assertEqual(loaded.pcb_path, pcb)

    def test_design_diff_tracks_component_net_sheet_and_placement_changes(self) -> None:
        old_design = {
            "components": [
                {"designator": "R1", "value": "10k", "footprint": "R_0603", "library_ref": "Device:R", "parameters": {}},
                {"designator": "C1", "value": "1u", "footprint": "C_0603", "library_ref": "Device:C", "parameters": {}},
            ],
            "nets": [
                {"name": "GND", "terminals": [{"designator": "R1", "pin": "1"}], "net_class": "", "aliases": []},
                {"name": "OLD", "terminals": [], "net_class": "", "aliases": []},
            ],
            "sheets": [
                {"sheet_path": "/", "filename": "root.kicad_sch", "path": "/", "title": "Root", "revision": "A", "date": ""},
            ],
            "pnp": {"placements": [
                {"designator": "R1", "layer": "top", "footprint": "R_0603", "center_x": 1, "center_y": 2, "rotation": 0}
            ]},
        }
        new_design = {
            "components": [
                {"designator": "R1", "value": "22k", "footprint": "R_0603", "library_ref": "Device:R", "parameters": {}},
                {"designator": "U1", "value": "MCU", "footprint": "QFN", "library_ref": "MCU:U", "parameters": {}},
            ],
            "nets": [
                {"name": "GND", "terminals": [{"designator": "R1", "pin": "2"}], "net_class": "", "aliases": []},
                {"name": "NEW", "terminals": [], "net_class": "", "aliases": []},
            ],
            "sheets": [
                {"sheet_path": "/", "filename": "root.kicad_sch", "path": "/", "title": "Root", "revision": "B", "date": ""},
                {"sheet_path": "/Child/", "filename": "child.kicad_sch", "path": "/Child/", "title": "Child", "revision": "", "date": ""},
            ],
            "pnp": {"placements": [
                {"designator": "R1", "layer": "bottom", "footprint": "R_0603", "center_x": 1, "center_y": 2, "rotation": 0}
            ]},
        }

        diff = kicad_analysis_service.diff_design_json(old_design, new_design)

        self.assertEqual(diff["components"]["summary"], {"added": 1, "removed": 1, "changed": 1})
        self.assertEqual(diff["nets"]["summary"], {"added": 1, "removed": 1, "changed": 1})
        self.assertEqual(diff["sheets"]["summary"], {"added": 1, "removed": 0, "changed": 1})
        self.assertEqual(diff["placements"]["summary"], {"added": 0, "removed": 0, "changed": 1})

    def test_schematic_symbol_geometry_is_preserved_for_overlays(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            schematic_path = root / "child.kicad_sch"
            schematic_path.write_text("", encoding="utf-8")

            symbol = SimpleNamespace(
                reference="R42",
                uuid="symbol-uuid",
                at_x=12.5,
                at_y=34.75,
            )
            schematic = SimpleNamespace(source_path=schematic_path)
            design = SimpleNamespace(
                top_schematic=SimpleNamespace(
                    walk_symbols=lambda: [(symbol, "/child/", schematic)]
                )
            )
            design_json = {
                "components": [
                    {
                        "designator": "R42",
                        "value": "10k",
                        "footprint": "R_0603",
                        "library_ref": "Device:R",
                        "parameters": {},
                    }
                ]
            }

            kicad_analysis_service._augment_design_json_with_schematic_positions(
                design_json,
                design,
                kicad_analysis_service.DesignFileSet(root, None, schematic_path, None),
            )

        component = design_json["components"][0]
        self.assertEqual(component["uuid"], "symbol-uuid")
        self.assertEqual(component["svg_id"], "symbol-uuid")
        self.assertEqual(component["x"], 12.5)
        self.assertEqual(component["y"], 34.75)
        self.assertEqual(component["sheet_file"], "child.kicad_sch")

        mapped = kicad_analysis_service._component_map(design_json)["R42"]
        self.assertEqual(mapped["uuid"], "symbol-uuid")
        self.assertEqual(mapped["sheet_file"], "child.kicad_sch")
        self.assertEqual(mapped["x"], 12.5)
        self.assertEqual(mapped["y"], 34.75)


if __name__ == "__main__":
    unittest.main()
