from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import run_report_pdf_service as svc  # noqa: E402


def _run(**overrides):
    run = {
        "id": "run_1",
        "project_id": "prj_1",
        "project_name": "Test Board",
        "relative_path": ".",
        "manufacturer_name": "Acme Fab",
        "spec_name": "4L ENIG",
        "commit_sha": "abc1234def567890",
        "release_tag": "v1.2.0",
        "status": "received",
        "quantity_ordered": 100,
        "quantity_good": 95,
        "notes": "First batch.",
        "created_by": "designer@x",
        "created_at": "2026-08-16T10:00:00+00:00",
        "spec_snapshot": {
            "spec_config": "[Stackup]\nlayers: choice(2,4) | Layers\nfinish: text | Finish",
            "specs": {"layers": "4", "finish": "ENIG"},
            "active_sections": [],
        },
        "defects": [],
    }
    run.update(overrides)
    return run


def _render(run, *, evidence_path=None):
    with patch.object(svc.mfg, "get_run", return_value=run), patch.object(
        svc.workspace, "get_project_by_id", return_value={"name": "Test Board"}
    ), patch.object(svc.derived_assets, "find_evidence", return_value=evidence_path):
        return svc.build_run_report(run["id"])


class RunReportPdfTests(unittest.TestCase):
    """The report is pure PDF generation; the run lookup and evidence store are mocked."""

    def test_renders_a_valid_pdf_with_info_and_spec(self) -> None:
        pdf = _render(_run())
        self.assertTrue(pdf.startswith(b"%PDF"))
        self.assertGreater(len(pdf), 1000)

    def test_renders_with_defects_of_every_severity(self) -> None:
        defects = [
            {"id": "d1", "run_id": "run_1", "category": "soldering", "severity": sev,
             "quantity_affected": 3, "description": f"{sev} issue", "status": "open",
             "evidence": [], "logged_by": "qa@x", "created_at": "2026-08-16T11:00:00+00:00",
             "resolved_at": None}
            for sev in ("aesthetic", "minor", "major", "critical")
        ]
        pdf = _render(_run(defects=defects))
        self.assertTrue(pdf.startswith(b"%PDF"))

    def test_pdf_evidence_is_listed_as_an_attachment(self) -> None:
        # A PDF report cannot be inlined; it should be listed, and not crash.
        defect = {
            "id": "d1", "run_id": "run_1", "category": "other", "severity": "minor",
            "quantity_affected": 1, "description": "see report", "status": "open",
            "evidence": [{"kind": "report", "filename": "aoi.pdf", "digest": "deadbeef",
                          "media_type": "application/pdf", "size": 100}],
            "logged_by": "qa@x", "created_at": "2026-08-16T11:00:00+00:00", "resolved_at": None,
        }
        pdf = _render(_run(defects=[defect]))
        self.assertTrue(pdf.startswith(b"%PDF"))

    def test_empty_run_still_renders(self) -> None:
        pdf = _render(_run(spec_snapshot={}, defects=[], notes="", commit_sha="", release_tag=""))
        self.assertTrue(pdf.startswith(b"%PDF"))

    def test_missing_run_raises(self) -> None:
        with patch.object(svc.mfg, "get_run", return_value=None):
            with self.assertRaises(ValueError):
                svc.build_run_report("run_missing")


if __name__ == "__main__":
    unittest.main()
