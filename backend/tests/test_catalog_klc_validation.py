"""Direct contracts for KLC execution, evidence, and workflow decisions."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.services.catalog.klc_validation import (  # noqa: E402
    VALIDATION_SEVERITY_ERROR,
    VALIDATION_SEVERITY_INFO,
    VALIDATION_SEVERITY_WARNING,
    CatalogKlcValidation,
)
from app.services.catalog.release_workflow import WORKFLOW_TRANSITIONS, review_decision_for  # noqa: E402
from app.services.catalog.runtime import CatalogRuntime  # noqa: E402


JUNIT = """<?xml version="1.0"?>
<testsuites>
  <testsuite name="klc">
    <testcase name="R_Test - Errors" type="Errors">
      <failure type="ERROR" message="S3.1: Origin is centered">
S3.1: Origin is centered
https://klc.kicad.org/symbol/s3/s3.1/
Origin at (1.27, 0)
      </failure>
    </testcase>
    <testcase name="R_Test - Warnings" type="Warnings">
      <failure message="S4.1: Pin length">detail line</failure>
    </testcase>
    <testcase name="R_Test - Info" type="Info">
      <failure type="INFO" message="note"></failure>
    </testcase>
  </testsuite>
</testsuites>
"""


class _Rows:
    def __init__(self, row: dict[str, object] | None = None) -> None:
        self._row = row

    def fetchone(self) -> dict[str, object] | None:
        return self._row


class _RecordingConnection:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple[object, ...] | None]] = []

    def execute(self, sql: str, params: tuple[object, ...] | None = None) -> _Rows:
        self.calls.append((sql, params))
        if sql.strip().startswith("SELECT * FROM asset_validation_runs"):
            return _Rows({"id": params[0] if params else ""})
        return _Rows(None)

    def commit(self) -> None:
        raise AssertionError("KLC validation must not commit")


class _ReadModels:
    def validation_run_payload(self, row, *, include_findings=False, conn=None):
        return {"id": str(row["id"]), "include_findings": include_findings}


class KlcJunitParsingTests(unittest.TestCase):
    def test_severities_rule_codes_and_urls_are_extracted(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "report.junit.xml"
            path.write_text(JUNIT, encoding="utf-8")
            findings = CatalogKlcValidation.parse_klc_junit(path)
        self.assertEqual(
            [(f["severity"], f["rule_code"], f["object_name"]) for f in findings],
            [
                (VALIDATION_SEVERITY_ERROR, "S3.1", "R_Test"),
                (VALIDATION_SEVERITY_WARNING, "S4.1", "R_Test"),
                (VALIDATION_SEVERITY_INFO, "", "R_Test - Info"),
            ],
        )
        self.assertEqual(findings[0]["rule_url"], "https://klc.kicad.org/symbol/s3/s3.1/")
        self.assertEqual(findings[0]["details"], ["Origin at (1.27, 0)"])
        self.assertEqual(findings[2]["message"], "note")

    def test_missing_report_yields_no_findings(self) -> None:
        self.assertEqual(CatalogKlcValidation.parse_klc_junit(Path("/nonexistent/report.xml")), [])


class KlcRunTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.runtime = CatalogRuntime(store_root=self.root / "store", database_path=self.root / "unused.db")
        self.klc = CatalogKlcValidation(revision_kernel=None, read_models=_ReadModels())  # type: ignore[arg-type]
        self.asset = {
            "id": "asset-1",
            "asset_type": "symbol",
            "name": "R_Test",
            "target_library": "Prism_Test",
            "target_name": "R_Test",
            "canonical_path": str(self.root / "R_Test.kicad_sym"),
        }

    def _install_checker(self, body: str) -> Path:
        utils = self.root / "kicad-library-utils"
        (utils / "klc-check").mkdir(parents=True)
        script = utils / "klc-check" / "check_symbol.py"
        script.write_text(body, encoding="utf-8")
        return utils

    def test_missing_checker_records_a_skipped_run_with_evidence_files(self) -> None:
        conn = _RecordingConnection()
        with patch.object(settings, "CATALOG_KLC_UTILS_PATH", str(self.root / "absent")):
            payload = self.klc.run_klc_for_asset(
                conn, self.runtime, component_id="c1", revision_id="r1", asset=self.asset
            )
        insert = next(params for sql, params in conn.calls if "INSERT INTO asset_validation_runs" in sql)
        self.assertEqual(insert[6], "skipped")
        self.assertEqual(insert[5], "klc_symbol")
        report_dir = Path(str(insert[11]))
        self.assertTrue(report_dir.is_relative_to(self.runtime.validation_root))
        report = json.loads((report_dir / "report.json").read_text(encoding="utf-8"))
        self.assertEqual(report["status"], "skipped")
        self.assertIn("KLC checker unavailable", (report_dir / "stderr.txt").read_text(encoding="utf-8"))
        self.assertEqual((report_dir / "report.junit.xml").read_text(encoding="utf-8"), "<testsuites />\n")
        self.assertEqual(payload["include_findings"], True)

    def test_checker_findings_drive_status_and_are_persisted(self) -> None:
        utils = self._install_checker(
            "import sys\n"
            "junit = sys.argv[sys.argv.index('--junit') + 1]\n"
            f"open(junit, 'w').write({JUNIT!r})\n"
            "print('checked')\n"
            "sys.exit(3)\n"
        )
        conn = _RecordingConnection()
        with (
            patch.object(settings, "CATALOG_KLC_UTILS_PATH", str(utils)),
            patch.object(settings, "CATALOG_KLC_SYMBOL_RULES", "S3,S4"),
            patch.object(settings, "CATALOG_KLC_FOOTPRINT_LIB_DIR", ""),
        ):
            self.klc.run_klc_for_asset(
                conn, self.runtime, component_id="c1", revision_id="r1", asset=self.asset
            )
        insert = next(params for sql, params in conn.calls if "INSERT INTO asset_validation_runs" in sql)
        self.assertEqual(insert[6], "failed")
        self.assertEqual((insert[7], insert[8], insert[9]), (1, 1, 3))
        findings = [params for sql, params in conn.calls if "INSERT INTO asset_validation_findings" in sql]
        self.assertEqual([row[2] for row in findings], ["error", "warning", "info"])
        self.assertEqual(json.loads(findings[0][6]), ["Origin at (1.27, 0)"])

    def test_warning_only_exit_code_two_is_a_warning_run(self) -> None:
        utils = self._install_checker(
            "import sys\n"
            "junit = sys.argv[sys.argv.index('--junit') + 1]\n"
            "open(junit, 'w').write('<testsuites/>')\n"
            "sys.exit(2)\n"
        )
        conn = _RecordingConnection()
        with patch.object(settings, "CATALOG_KLC_UTILS_PATH", str(utils)):
            self.klc.run_klc_for_asset(
                conn, self.runtime, component_id="c1", revision_id="r1", asset=self.asset
            )
        insert = next(params for sql, params in conn.calls if "INSERT INTO asset_validation_runs" in sql)
        self.assertEqual(insert[6], "warning")

    def test_unsupported_asset_type_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            self.klc.run_klc_for_asset(
                _RecordingConnection(),
                self.runtime,
                component_id="c1",
                revision_id="r1",
                asset={**self.asset, "asset_type": "3dmodel"},
            )


class ReleaseWorkflowDecisionTests(unittest.TestCase):
    def test_transition_table_matches_the_shipped_workflow(self) -> None:
        self.assertEqual(
            {stage: sorted(targets) for stage, targets in WORKFLOW_TRANSITIONS.items()},
            {
                "open": ["archived", "in_progress"],
                "in_progress": ["archived", "open", "qa_review"],
                "qa_review": ["archived", "done", "in_progress"],
                "done": ["archived", "qa_review", "released"],
                "released": ["archived", "open"],
                "archived": ["open"],
            },
        )

    def test_review_decisions_per_transition(self) -> None:
        self.assertEqual(review_decision_for("qa_review", "done", self_approval_override=False), "approved")
        self.assertEqual(
            review_decision_for("qa_review", "done", self_approval_override=True), "emergency_override"
        )
        self.assertEqual(
            review_decision_for("qa_review", "in_progress", self_approval_override=False), "changes_requested"
        )
        self.assertEqual(review_decision_for("done", "released", self_approval_override=False), "released")
        self.assertEqual(review_decision_for("open", "archived", self_approval_override=False), "archived")
        self.assertEqual(review_decision_for("open", "in_progress", self_approval_override=False), "")


if __name__ == "__main__":
    unittest.main()
