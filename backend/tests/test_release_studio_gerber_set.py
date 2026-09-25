"""Completeness of a Gerber export, checked against its own job manifest."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.release_studio.steps import gerber_manifest_gaps  # noqa: E402


def _write(directory: Path, name: str, payload: str = "G04*\n") -> Path:
    path = directory / name
    path.write_text(payload, encoding="utf-8")
    return path


def _job(directory: Path, stem: str, plots: list[str]) -> Path:
    return _write(
        directory,
        f"{stem}-job.gbrjob",
        json.dumps(
            {
                "Header": {},
                "FilesAttributes": [
                    {"Path": plot, "FileFunction": "Copper,L1,Top"} for plot in plots
                ],
            }
        ),
    )


class GerberManifestGapTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temporary = tempfile.TemporaryDirectory()
        self.root = Path(self._temporary.name)
        self.addCleanup(self._temporary.cleanup)

    def test_a_complete_export_reports_no_gaps(self) -> None:
        plots = ["OBC-TOP.gbr", "OBC-BOT.gbr", "OBC-Edge_Cuts.gbr"]
        files = [_write(self.root, name) for name in plots]
        files.append(_job(self.root, "OBC", plots))

        self.assertEqual(gerber_manifest_gaps(files), (True, ()))

    def test_a_truncated_export_names_the_plots_it_never_wrote(self) -> None:
        """The failure this exists for: kicad-cli dying part-way through."""

        promised = ["OBC-TOP.gbr", "OBC-BOT.gbr", "OBC-F_Mask.gbr", "OBC-Edge_Cuts.gbr"]
        files = [_write(self.root, name) for name in promised[:2]]
        files.append(_job(self.root, "OBC", promised))

        found, missing = gerber_manifest_gaps(files)
        self.assertTrue(found)
        self.assertEqual(missing, ("OBC-Edge_Cuts.gbr", "OBC-F_Mask.gbr"))

    def test_renamed_copper_layers_are_not_treated_as_gaps(self) -> None:
        """Designers rename copper layers; an expected-name allowlist would not survive it."""

        plots = ["Board-GND1.gbr", "Board-PWR2.gbr", "Board-SIG3.gbr"]
        files = [_write(self.root, name) for name in plots]
        files.append(_job(self.root, "Board", plots))

        self.assertEqual(gerber_manifest_gaps(files), (True, ()))

    def test_a_missing_job_file_is_reported_as_uncheckable(self) -> None:
        files = [_write(self.root, "OBC-TOP.gbr")]

        self.assertEqual(gerber_manifest_gaps(files), (False, ()))

    def test_an_unreadable_job_file_is_reported_as_uncheckable(self) -> None:
        files = [
            _write(self.root, "OBC-TOP.gbr"),
            _write(self.root, "OBC-job.gbrjob", "{ this is not json"),
        ]

        self.assertEqual(gerber_manifest_gaps(files), (False, ()))


if __name__ == "__main__":
    unittest.main()
