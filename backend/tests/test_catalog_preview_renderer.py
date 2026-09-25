from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.services.catalog.preview_renderer import CatalogPreviewRenderer


class CatalogPreviewRendererTests(unittest.TestCase):
    def setUp(self) -> None:
        self.renderer = CatalogPreviewRenderer()
        self.asset = {
            "canonical_path": "/tmp/source.kicad_sym",
            "target_name": "R_Test",
        }

    def test_symbol_preview_uses_expected_output_and_command(self) -> None:
        commands: list[list[str]] = []

        def run_kicad_cli(args: list[str]) -> tuple[bool, str]:
            commands.append(args)
            output = Path(args[args.index("--output") + 1])
            (output / "R_Test_unit1.svg").write_bytes(b"<symbol-unit-1/>")
            return True, ""

        status, payload = self.renderer.generate_symbol_preview(self.asset, run_kicad_cli)

        self.assertEqual(status, "ready")
        self.assertEqual(payload, b"<symbol-unit-1/>")
        self.assertEqual(
            commands,
            [[
                "sym", "export", "svg", "/tmp/source.kicad_sym",
                "--output", commands[0][5], "--symbol", "R_Test",
            ]],
        )

    def test_symbol_preview_falls_back_to_first_sorted_svg(self) -> None:
        def run_kicad_cli(args: list[str]) -> tuple[bool, str]:
            output = Path(args[args.index("--output") + 1])
            (output / "z.svg").write_bytes(b"z")
            (output / "a.svg").write_bytes(b"a")
            return True, ""

        status, payload = self.renderer.generate_symbol_preview(self.asset, run_kicad_cli)

        self.assertEqual((status, payload), ("ready", b"a"))

    def test_symbol_preview_reports_runner_error_and_missing_output(self) -> None:
        status, result = self.renderer.generate_symbol_preview(
            self.asset,
            lambda _args: (False, "runner failed"),
        )
        self.assertEqual((status, result), ("failed", "runner failed"))

        status, result = self.renderer.generate_symbol_preview(
            self.asset,
            lambda _args: (True, ""),
        )
        self.assertEqual(
            (status, result),
            ("failed", "symbol preview export did not produce an SVG"),
        )

    def test_symbol_preview_units_extracts_integer_units_first_wins_and_sorts(self) -> None:
        def run_kicad_cli(args: list[str]) -> tuple[bool, str]:
            output = Path(args[args.index("--output") + 1])
            (output / "a_unit2.svg").write_bytes(b"unit-2-first")
            (output / "b_unit2-extra.svg").write_bytes(b"unit-2-duplicate")
            (output / "c_unit10.svg").write_bytes(b"unit-10")
            (output / "d_other.svg").write_bytes(b"fallback-unit")
            return True, ""

        status, units = self.renderer.generate_symbol_preview_units(self.asset, run_kicad_cli)

        self.assertEqual(status, "ready")
        self.assertEqual(units, [(2, b"unit-2-first"), (4, b"fallback-unit"), (10, b"unit-10")])

    def test_symbol_preview_units_reports_missing_output(self) -> None:
        status, result = self.renderer.generate_symbol_preview_units(
            self.asset,
            lambda _args: (True, ""),
        )
        self.assertEqual(
            (status, result),
            ("failed", "symbol preview export did not produce an SVG"),
        )

    def test_footprint_preview_uses_isolated_sanitized_library_and_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "source.kicad_mod"
            source.write_bytes(b"(footprint source)")
            asset = {
                "canonical_path": str(source),
                "target_name": "BAT_VARTA_V 364 MF",
            }

            def run_kicad_cli(args: list[str]) -> tuple[bool, str]:
                output = Path(args[args.index("--output") + 1])
                library = Path(args[-1])
                self.assertEqual(args[:3], ["fp", "export", "svg"])
                self.assertEqual(args[args.index("--footprint") + 1], "BAT_VARTA_V_364_MF")
                self.assertEqual(library.name, "isolated.pretty")
                self.assertEqual(
                    (library / "BAT_VARTA_V_364_MF.kicad_mod").read_bytes(),
                    source.read_bytes(),
                )
                (output / "BAT_VARTA_V_364_MF.svg").write_bytes(b"<footprint/>")
                return True, ""

            status, payload = self.renderer.generate_footprint_preview(asset, run_kicad_cli)

        self.assertEqual((status, payload), ("ready", b"<footprint/>"))

    def test_footprint_preview_reports_runner_error_and_missing_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "source.kicad_mod"
            source.write_bytes(b"(footprint source)")
            asset = {**self.asset, "canonical_path": str(source)}
            status, result = self.renderer.generate_footprint_preview(
                asset,
                lambda _args: (False, "runner failed"),
            )
            self.assertEqual((status, result), ("failed", "runner failed"))

            status, result = self.renderer.generate_footprint_preview(
                asset,
                lambda _args: (True, ""),
            )
            self.assertEqual(
                (status, result),
                ("failed", "footprint preview export did not produce an SVG"),
            )


if __name__ == "__main__":
    unittest.main()
