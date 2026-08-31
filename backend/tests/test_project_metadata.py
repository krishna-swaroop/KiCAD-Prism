from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.services import (
    kicad_board_stats_service,
    project_metadata_service,
    project_properties_service,
)


# A board header in the shape KiCad writes one: the fields the project card
# shows are all in the first few hundred bytes, before any geometry.
BOARD_HEADER = """(kicad_pcb
\t(version 20240819)
\t(generator "pcbnew")
\t(generator_version "8.99")
\t(paper "A4")
\t(title_block
\t\t(title "Mainboard")
\t\t(date "2026-08-31")
\t\t(rev "V1.0")
\t\t(company "Example Ltd")
\t\t(comment 1 "First note")
\t)
"""

SCHEMATIC_HEADER = """(kicad_sch
\t(version 20231120)
\t(generator "eeschema")
\t(generator_version "8.0")
\t(paper "A3")
\t(uuid "00000000-0000-0000-0000-000000000001")
\t(title_block
\t\t(title "Sheet")
\t\t(rev "A")
\t)
"""


def _write(directory: Path, name: str, header: str, filler_mb: int = 0) -> str:
    path = directory / name
    with path.open("w", encoding="utf-8") as handle:
        handle.write(header)
        # Geometry after the header, so a test that reads only the header slice
        # is genuinely reading past nothing it needs.
        for _ in range(filler_mb * 1024):
            handle.write('\t(gr_line (start 0 0) (end 1 1) (layer "Edge.Cuts"))\n' * 16)
        handle.write(")\n")
    return str(path)


class HeaderExtractionTests(unittest.TestCase):
    def test_reads_board_header_fields(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pcb = _write(root, "board.kicad_pcb", BOARD_HEADER)

            metadata = project_properties_service.compute_pcb_metadata(str(root), pcb)

        self.assertEqual(metadata["version"], 20240819)
        self.assertEqual(metadata["generator"], "pcbnew")
        self.assertEqual(metadata["generator_version"], "8.99")
        self.assertEqual(metadata["paper"], "A4")
        self.assertEqual(metadata["filename"], "board.kicad_pcb")
        self.assertEqual(metadata["title_block"]["title"], "Mainboard")
        self.assertEqual(metadata["title_block"]["rev"], "V1.0")
        self.assertEqual(metadata["title_block"]["comments"], {"1": "First note"})

    def test_reads_schematic_header_fields(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sch = _write(root, "root.kicad_sch", SCHEMATIC_HEADER)

            metadata = project_properties_service.compute_schematic_metadata(str(root), sch)

        self.assertEqual(metadata["version"], 20231120)
        self.assertEqual(metadata["generator"], "eeschema")
        self.assertEqual(metadata["uuid"], "00000000-0000-0000-0000-000000000001")
        self.assertEqual(metadata["title_block"]["title"], "Sheet")

    def test_reads_only_the_header_of_a_large_board(self) -> None:
        """The whole point: cost must not scale with the file.

        The old implementation pulled the entire board into memory and scanned
        every graphic in it to find the outline. This asserts the read is
        bounded -- a board an order of magnitude past the header slice costs
        the same as a small one.
        """
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            big = _write(root, "big.kicad_pcb", BOARD_HEADER, filler_mb=4)
            self.assertGreater(os.path.getsize(big), 8 * project_properties_service.HEADER_BYTES)

            with patch.object(Path, "read_text", side_effect=AssertionError("read the whole file")):
                metadata = project_properties_service.compute_pcb_metadata(str(root), big)

        self.assertEqual(metadata["title_block"]["title"], "Mainboard")

    def test_missing_file_yields_no_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            self.assertIsNone(
                project_properties_service.compute_pcb_metadata(
                    directory, os.path.join(directory, "absent.kicad_pcb")
                )
            )
        self.assertIsNone(project_properties_service.compute_pcb_metadata("/tmp", None))


class BoardFactsTests(unittest.TestCase):
    """KiCad reports dimensions as formatted quantities, not numbers."""

    def test_reduces_a_real_stats_report(self) -> None:
        stats = {
            "metadata": {"generator": "KiCad 10.0.4"},
            "board": {
                "has_outline": True,
                "width": "160.0000 mm",
                "height": "233.3500 mm",
                "board_thickness": "1.5640 mm",
            },
        }

        facts = kicad_board_stats_service.board_facts(stats)

        self.assertEqual(facts["dimensions_mm"], {"width": 160.0, "height": 233.35})
        self.assertEqual(facts["thickness_mm"], 1.564)
        self.assertEqual(facts["stats_generator"], "KiCad 10.0.4")

    def test_board_without_an_outline_reports_no_dimensions(self) -> None:
        facts = kicad_board_stats_service.board_facts(
            {"board": {"has_outline": False, "width": "0.0000 mm", "height": "0.0000 mm"}}
        )

        self.assertIsNone(facts["dimensions_mm"])

    def test_refuses_a_unit_it_does_not_understand(self) -> None:
        # Better a blank field than a number silently in the wrong unit.
        facts = kicad_board_stats_service.board_facts(
            {"board": {"has_outline": True, "width": "6.3 in", "height": "9.1 in"}}
        )

        self.assertIsNone(facts["dimensions_mm"])

    def test_empty_report_is_survivable(self) -> None:
        facts = kicad_board_stats_service.board_facts({})

        self.assertIsNone(facts["dimensions_mm"])
        self.assertIsNone(facts["thickness_mm"])


class ComputeProjectMetadataTests(unittest.TestCase):
    def test_combines_header_fields_with_kicad_cli_geometry(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pcb = _write(root, "board.kicad_pcb", BOARD_HEADER)
            sch = _write(root, "root.kicad_sch", SCHEMATIC_HEADER)

            stats = {
                "metadata": {"generator": "KiCad 10.0.4"},
                "board": {
                    "has_outline": True,
                    "width": "100.0000 mm",
                    "height": "80.0000 mm",
                    "board_thickness": "1.6000 mm",
                },
            }
            with patch.object(
                kicad_board_stats_service, "export_board_stats", return_value=stats
            ) as export:
                computed = project_metadata_service.compute_project_metadata(str(root), sch, pcb)

        export.assert_called_once_with(pcb)
        self.assertEqual(computed["pcb"]["dimensions_mm"], {"width": 100.0, "height": 80.0})
        self.assertEqual(computed["pcb"]["thickness_mm"], 1.6)
        self.assertEqual(computed["pcb"]["title_block"]["title"], "Mainboard")
        self.assertEqual(computed["schematic"]["title_block"]["title"], "Sheet")
        self.assertEqual(computed["board_stats_source"], kicad_board_stats_service.SOURCE)

    def test_missing_toolchain_still_produces_a_card(self) -> None:
        """A deployment without kicad-cli loses the size, not the whole panel."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pcb = _write(root, "board.kicad_pcb", BOARD_HEADER)

            with patch.object(
                kicad_board_stats_service,
                "export_board_stats",
                side_effect=kicad_board_stats_service.BoardStatsUnavailable("no kicad-cli"),
            ):
                computed = project_metadata_service.compute_project_metadata(str(root), None, pcb)

        self.assertIsNone(computed["pcb"]["dimensions_mm"])
        self.assertIsNone(computed["pcb"]["thickness_mm"])
        self.assertEqual(computed["pcb"]["title_block"]["title"], "Mainboard")
        self.assertEqual(computed["board_stats_source"], "")

    def test_no_board_does_not_invoke_the_toolchain(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sch = _write(root, "root.kicad_sch", SCHEMATIC_HEADER)

            with patch.object(kicad_board_stats_service, "export_board_stats") as export:
                computed = project_metadata_service.compute_project_metadata(str(root), sch, None)

        export.assert_not_called()
        self.assertIsNone(computed["pcb"])
        self.assertIsNotNone(computed["schematic"])


class SourceFingerprintTests(unittest.TestCase):
    """The fingerprint is what lets a stored row notice it has gone stale."""

    def test_changes_when_a_file_changes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pcb = _write(root, "board.kicad_pcb", BOARD_HEADER)
            before = project_metadata_service.source_fingerprint(None, pcb)

            with open(pcb, "a", encoding="utf-8") as handle:
                handle.write("\n; edited\n")
            os.utime(pcb, (0, 0))

            after = project_metadata_service.source_fingerprint(None, pcb)

        self.assertNotEqual(before, after)

    def test_is_stable_for_an_untouched_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            pcb = _write(Path(directory), "board.kicad_pcb", BOARD_HEADER)

            self.assertEqual(
                project_metadata_service.source_fingerprint(None, pcb),
                project_metadata_service.source_fingerprint(None, pcb),
            )

    def test_distinguishes_absent_from_missing(self) -> None:
        self.assertNotEqual(
            project_metadata_service.source_fingerprint(None, None),
            project_metadata_service.source_fingerprint(None, "/nonexistent.kicad_pcb"),
        )


if __name__ == "__main__":
    unittest.main()
