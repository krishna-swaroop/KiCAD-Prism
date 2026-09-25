"""Contract coverage for catalog asset filesystem and symbol-library helpers."""

from __future__ import annotations

import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.catalog import asset_files as asset_files_module  # noqa: E402
from app.services.catalog.asset_files import CatalogAssetFiles  # noqa: E402
from app.services.catalog.normalization import sanitize_name  # noqa: E402
from app.services.catalog.runtime import CatalogRuntime  # noqa: E402


class CatalogAssetFilesPathsTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.store = Path(temporary.name) / "components"
        self.runtime = CatalogRuntime(store_root=self.store)

    def test_sanitize_name_preserves_legacy_name_shaping(self) -> None:
        self.assertEqual(sanitize_name("  A/B C--  ", "fallback"), "A_B_C")
        self.assertEqual(sanitize_name("...---", "fallback"), "fallback")
        self.assertEqual(sanitize_name("", "fallback"), "fallback")

    def test_asset_roots_and_destinations_are_runtime_relative(self) -> None:
        expected_roots = {
            "symbol": self.runtime.store_root / "symbols",
            "footprint": self.runtime.store_root / "footprints",
            "3dmodel": self.runtime.store_root / "3dmodels",
            "spice": self.runtime.store_root / "spice",
        }
        for asset_type, expected in expected_roots.items():
            self.assertEqual(CatalogAssetFiles.asset_root(self.runtime, asset_type), expected)

        self.assertEqual(
            CatalogAssetFiles.symbol_destination(
                self.runtime, "  Analog/Parts  ", "--OPA 187--"
            ),
            self.runtime.store_root / "symbols" / "Analog_Parts" / "OPA_187.kicad_sym",
        )
        self.assertEqual(
            CatalogAssetFiles.footprint_destination(
                self.runtime, "  SMD/Parts  ", "--SOT-23--"
            ),
            self.runtime.store_root / "footprints" / "SMD_Parts.pretty" / "SOT-23.kicad_mod",
        )
        self.assertEqual(
            CatalogAssetFiles.aux_destination(
                self.runtime, "3dmodel", "  Mechanical/Parts  ", "../../Body.step"
            ),
            self.runtime.store_root / "3dmodels" / "Mechanical_Parts" / "Body.step",
        )

        self.assertEqual(
            CatalogAssetFiles.symbol_destination(self.runtime, "", ""),
            self.runtime.store_root / "symbols" / "Prism_Symbols" / "symbol.kicad_sym",
        )
        self.assertEqual(
            CatalogAssetFiles.footprint_destination(self.runtime, "", ""),
            self.runtime.store_root / "footprints" / "Prism_Footprints.pretty" / "footprint.kicad_mod",
        )
        self.assertEqual(
            CatalogAssetFiles.aux_destination(self.runtime, "spice", "", ""),
            self.runtime.store_root / "spice" / "Prism_Assets" / "spice.bin",
        )

    def test_unsupported_asset_type_has_the_legacy_error(self) -> None:
        with self.assertRaisesRegex(ValueError, "^Unsupported asset type$"):
            CatalogAssetFiles.asset_root(self.runtime, "gerber")
        with self.assertRaisesRegex(ValueError, "^Unsupported asset type$"):
            CatalogAssetFiles.aux_destination(self.runtime, "gerber", "Library", "file.bin")


class CatalogAssetFilesSymbolTests(unittest.TestCase):
    def test_top_level_blocks_preserve_order_and_ignore_nested_symbols_in_strings(self) -> None:
        text = r'''(kicad_symbol_lib (version 20240101) (generator "test")
  (symbol "Amp" (property "Description" "text with (parentheses) and \"quotes\"")
    (symbol "Nested_1_1" (property "Value" "nested")))
  (symbol "Amp_2_1" (property "Value" "second"))
  (symbol "Amp_1_1" (property "Value" "first"))
  (symbol "Amp_2_1_extra" (property "Value" "not a unit"))
  (symbol "Other" (property "Value" "other")))'''

        blocks = CatalogAssetFiles.extract_top_level_symbol_blocks(text)

        self.assertEqual([name for name, _ in blocks], ["Amp", "Amp_2_1", "Amp_1_1", "Amp_2_1_extra", "Other"])
        self.assertIn('(property "Description" "text with (parentheses) and \\"quotes\\"")', blocks[0][1])
        self.assertNotIn("Nested_1_1", [name for name, _ in blocks])

    def test_header_defaults_and_single_symbol_payload_selection(self) -> None:
        explicit = '(kicad_symbol_lib (version 20240101) (generator "unit-test") (symbol "R"))'
        self.assertEqual(CatalogAssetFiles.symbol_header(explicit), ("20240101", '"unit-test"'))
        self.assertEqual(CatalogAssetFiles.symbol_header("(kicad_symbol_lib)"), ("20211014", '"KiCAD Prism"'))

        text = '''(kicad_symbol_lib (version 20240101) (generator "unit-test")
  (symbol "R" (property "Value" "10k"))
  (symbol "R_2_1" (property "Value" "unit 2"))
  (symbol "R_1_1" (property "Value" "unit 1"))
  (symbol "R_2_1_extra" (property "Value" "not a unit"))
  (symbol "C" (property "Value" "1u")))'''
        payload = CatalogAssetFiles.single_symbol_payload(text, "R")

        self.assertEqual(
            payload,
            b'''(kicad_symbol_lib (version 20240101) (generator "unit-test")
  (symbol "R" (property "Value" "10k"))
  (symbol "R_2_1" (property "Value" "unit 2"))
  (symbol "R_1_1" (property "Value" "unit 1"))
)
''',
        )
        self.assertNotIn(b"R_2_1_extra", payload)
        self.assertNotIn(b'(symbol "C"', payload)

    def test_single_symbol_payload_reports_the_exact_missing_symbol_error(self) -> None:
        with self.assertRaisesRegex(ValueError, "^Selected symbol was not found in the library$"):
            CatalogAssetFiles.single_symbol_payload(
                '(kicad_symbol_lib (symbol "R"))', "Missing"
            )


class CatalogAssetFilesWriteTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.store = Path(temporary.name) / "components"
        self.runtime = CatalogRuntime(store_root=self.store)
        self.destination = self.store / "symbols" / "Library" / "Part.kicad_sym"

    def test_writes_are_idempotent_and_changed_content_is_immutable(self) -> None:
        self.runtime.browse_cache = {"symbol": (1.0, ["Library/Part.kicad_sym"])}
        self.runtime.browse_cache_generation = 9

        first_payload = b"first\n"
        first = CatalogAssetFiles.write_canonical_file(
            self.runtime, self.destination, first_payload
        )
        self.assertEqual(first, self.destination)
        self.assertEqual(self.destination.read_bytes(), first_payload)
        self.assertEqual(self.runtime.browse_cache_generation, 10)
        self.assertEqual(self.runtime.browse_cache, {})

        identical = CatalogAssetFiles.write_canonical_file(
            self.runtime, self.destination, first_payload
        )
        self.assertEqual(identical, self.destination)
        self.assertEqual(self.runtime.browse_cache_generation, 10)

        changed_payload = b"changed\n"
        digest = hashlib.sha256(changed_payload).hexdigest()
        changed = CatalogAssetFiles.write_canonical_file(
            self.runtime, self.destination, changed_payload
        )
        expected_revision = self.runtime.store_root / "revisions" / digest / "symbols" / "Library" / "Part.kicad_sym"
        self.assertEqual(changed, expected_revision)
        self.assertEqual(self.destination.read_bytes(), first_payload)
        self.assertEqual(changed.read_bytes(), changed_payload)
        self.assertEqual(self.runtime.browse_cache_generation, 11)

        repeated_changed = CatalogAssetFiles.write_canonical_file(
            self.runtime, self.destination, changed_payload
        )
        self.assertEqual(repeated_changed, expected_revision)
        self.assertEqual(self.runtime.browse_cache_generation, 11)

    def test_immutable_hash_collision_has_the_exact_error(self) -> None:
        destination = self.destination
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(b"original\n")
        digest = "collision-digest"
        immutable = self.runtime.store_root / "revisions" / digest / "symbols" / "Library" / "Part.kicad_sym"
        immutable.parent.mkdir(parents=True, exist_ok=True)
        immutable.write_bytes(b"different\n")
        self.runtime.browse_cache_generation = 4

        with patch.object(asset_files_module, "sha256_bytes", return_value=digest):
            with self.assertRaisesRegex(
                ValueError,
                rf"^Immutable asset hash collision at {immutable}$",
            ):
                CatalogAssetFiles.write_canonical_file(
                    self.runtime, destination, b"new content\n"
                )

        self.assertEqual(destination.read_bytes(), b"original\n")
        self.assertEqual(immutable.read_bytes(), b"different\n")
        self.assertEqual(self.runtime.browse_cache_generation, 4)


if __name__ == "__main__":
    unittest.main()
