from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.catalog.conflicts import CatalogConflict, REVISION_CONFLICT_CODE  # noqa: E402
from app.services.catalog.revision_kernel import CatalogRevisionKernel  # noqa: E402
from app.services.component_catalog_domain import (  # noqa: E402
    _normalize_workflow_stage,
)


class CatalogWorkflowNormalizeTests(unittest.TestCase):
    def test_normalize_lowercases_and_maps_legacy_stages(self) -> None:
        self.assertEqual(_normalize_workflow_stage("QA_Review"), "qa_review")
        self.assertEqual(_normalize_workflow_stage("In_Progress"), "in_progress")
        self.assertEqual(_normalize_workflow_stage("draft"), "open")
        self.assertEqual(_normalize_workflow_stage("in_review"), "qa_review")
        self.assertEqual(_normalize_workflow_stage("qa_approved"), "done")
        self.assertEqual(_normalize_workflow_stage("deprecated"), "archived")


class CatalogRevisionPreconditionTests(unittest.TestCase):
    def test_empty_expected_revision_is_the_legacy_skip(self) -> None:
        CatalogRevisionKernel.assert_expected_revision("rev-1", "")
        CatalogRevisionKernel.assert_expected_revision("rev-1")

    def test_mismatched_expected_revision_is_a_conflict(self) -> None:
        with self.assertRaises(CatalogConflict) as raised:
            CatalogRevisionKernel.assert_expected_revision("rev-2", "rev-1")
        self.assertEqual(raised.exception.code, REVISION_CONFLICT_CODE)
        self.assertIsInstance(raised.exception, ValueError)


if __name__ == "__main__":
    unittest.main()
