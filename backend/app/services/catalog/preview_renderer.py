"""KiCad symbol and footprint SVG rendering for catalog assets."""

from __future__ import annotations

import re
import shutil
import tempfile
from pathlib import Path
from typing import Any, Callable

from app.services.catalog.normalization import sanitize_name


CommandRunner = Callable[[list[str]], tuple[bool, str]]

PREVIEW_STATUS_READY = "ready"
PREVIEW_STATUS_FAILED = "failed"


class CatalogPreviewRenderer:
    """Stateless catalog preview rendering using a caller-supplied command runner."""

    @staticmethod
    def generate_symbol_preview(
        asset: dict[str, Any],
        run_kicad_cli: CommandRunner,
    ) -> tuple[str, bytes | str]:
        with tempfile.TemporaryDirectory(prefix="prism_symsvg_") as tmp_dir:
            success, error = run_kicad_cli(
                [
                    "sym", "export", "svg", str(asset["canonical_path"]),
                    "--output", tmp_dir, "--symbol", str(asset["target_name"]),
                ]
            )
            if not success:
                return PREVIEW_STATUS_FAILED, error
            expected = Path(tmp_dir) / f"{asset['target_name']}_unit1.svg"
            if not expected.is_file():
                candidates = sorted(Path(tmp_dir).glob("*.svg"))
                if not candidates:
                    return PREVIEW_STATUS_FAILED, "symbol preview export did not produce an SVG"
                expected = candidates[0]
            return PREVIEW_STATUS_READY, expected.read_bytes()

    @staticmethod
    def generate_symbol_preview_units(
        asset: dict[str, Any],
        run_kicad_cli: CommandRunner,
    ) -> tuple[str, list[tuple[int, bytes]] | str]:
        with tempfile.TemporaryDirectory(prefix="prism_symsvg_units_") as tmp_dir:
            success, error = run_kicad_cli(
                [
                    "sym", "export", "svg", str(asset["canonical_path"]),
                    "--output", tmp_dir, "--symbol", str(asset["target_name"]),
                ]
            )
            if not success:
                return PREVIEW_STATUS_FAILED, error
            candidates = sorted(Path(tmp_dir).glob("*.svg"))
            if not candidates:
                return PREVIEW_STATUS_FAILED, "symbol preview export did not produce an SVG"
            units: dict[int, bytes] = {}
            for index, candidate in enumerate(candidates, start=1):
                match = re.search(
                    r"_unit(\d+)(?:[^0-9].*)?\.svg$",
                    candidate.name,
                    flags=re.IGNORECASE,
                )
                unit = int(match.group(1)) if match else index
                units.setdefault(unit, candidate.read_bytes())
            return PREVIEW_STATUS_READY, sorted(units.items())

    @staticmethod
    def generate_footprint_preview(
        asset: dict[str, Any],
        run_kicad_cli: CommandRunner,
    ) -> tuple[str, bytes | str]:
        with tempfile.TemporaryDirectory(prefix="prism_fpsvg_") as tmp_dir:
            footprint_source = Path(str(asset["canonical_path"]))
            target_name = str(asset["target_name"])
            isolated_library = Path(tmp_dir) / "isolated.pretty"
            isolated_library.mkdir(parents=True, exist_ok=True)
            isolated_footprint = isolated_library / (
                f"{sanitize_name(target_name, footprint_source.stem)}.kicad_mod"
            )
            shutil.copy2(footprint_source, isolated_footprint)
            success, error = run_kicad_cli(
                [
                    "fp", "export", "svg", "--output", tmp_dir,
                    "--footprint", isolated_footprint.stem, str(isolated_library),
                ]
            )
            if not success:
                return PREVIEW_STATUS_FAILED, error
            expected = Path(tmp_dir) / f"{target_name}.svg"
            if not expected.is_file():
                candidates = sorted(Path(tmp_dir).glob("*.svg"))
                if not candidates:
                    return PREVIEW_STATUS_FAILED, "footprint preview export did not produce an SVG"
                expected = candidates[0]
            return PREVIEW_STATUS_READY, expected.read_bytes()


__all__ = [
    "CatalogPreviewRenderer",
    "CommandRunner",
    "PREVIEW_STATUS_FAILED",
    "PREVIEW_STATUS_READY",
]
