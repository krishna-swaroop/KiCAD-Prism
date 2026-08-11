from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.services.kicad_library_discovery import discover_library


class KiCadLibraryDiscoveryTests(unittest.TestCase):
    def test_review_choice_resolves_renamed_footprint_and_model(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            symbol = root / "symbols" / "Pixxel_Memories.kicad_sym"
            footprint = root / "footprints" / "Pixxel_Memories.pretty" / "MT53_LPDDR4.kicad_mod"
            model = root / "3D" / "Pixxel_Memories" / "MT53 Part.STEP"
            symbol.parent.mkdir(parents=True)
            footprint.parent.mkdir(parents=True)
            model.parent.mkdir(parents=True)
            symbol.write_text(
                '(kicad_symbol_lib (version 20231120) (generator "test") '
                '(symbol "MT53E1G32" (property "Value" "LPDDR4") '
                '(property "Footprint" "BGA200C65P12X22")))',
                encoding="utf-8",
            )
            footprint.write_text(
                '(footprint "MT53_LPDDR4_BGA200" '
                '(model "${KIPRJMOD}/3D/Pixxel_Memories/MT53 Part.STEP"))',
                encoding="utf-8",
            )
            model.write_text("STEP", encoding="utf-8")
            files = [symbol, footprint, model]
            inventory = [
                {"relative_path": path.relative_to(root).as_posix(), "size_bytes": path.stat().st_size}
                for path in files
            ]
            sources = [
                {"relative_path": path.relative_to(root).as_posix(), "object_path": str(path)}
                for path in (symbol, footprint)
            ]

            initial = discover_library(sources, inventory)
            component = initial["components"][0]
            self.assertEqual(component["footprint"]["status"], "suggested")
            choice = component["footprint"]["candidates"][0]["relative_path"]

            resolved = discover_library(sources, inventory, {component["id"]: choice})
            component = resolved["components"][0]
            self.assertEqual(component["footprint"]["status"], "resolved")
            self.assertEqual(component["models"][0]["status"], "resolved")
            self.assertIn(model.relative_to(root).as_posix(), resolved["required_paths"])


if __name__ == "__main__":
    unittest.main()
