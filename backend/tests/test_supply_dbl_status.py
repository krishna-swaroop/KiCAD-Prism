"""The KiCad database's Status column for components the library marked not for new designs. No database."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.catalog import dbl_export  # noqa: E402

COMPONENT = {
    "id": "c1", "value": "10k", "name": "R", "manufacturer": "Acme", "mpn": "R-10K", "package_name": "0603", "workflow_stage": "released",
    "description": "", "datasheet_url": "", "representations": [],
}


class StatusMarkTests(unittest.TestCase):
    def tearDown(self) -> None:
        dbl_export.set_status_marks(None)

    def test_a_mark_replaces_the_workflow_stage_in_the_status_column_only(self) -> None:
        plain = dbl_export.dbl_row_for_component(COMPONENT, "R-10K", [])
        marked = dbl_export.dbl_row_for_component(COMPONENT, "R-10K", [], "Not for new designs")
        self.assertEqual((plain["Status"], marked["Status"]), ("released", "Not for new designs"))
        self.assertEqual({k: v for k, v in plain.items() if k != "Status"}, {k: v for k, v in marked.items() if k != "Status"})

    def test_marks_come_from_whoever_registered_and_a_failure_changes_nothing(self) -> None:
        self.assertEqual(dbl_export.status_marks_for(["c1"]), {}, "nobody registered")
        dbl_export.set_status_marks(lambda ids: {i: "Not for new designs" for i in ids if i == "c1"})
        self.assertEqual(dbl_export.status_marks_for(["c1", "c2"]), {"c1": "Not for new designs"})

        def broken(ids):
            raise RuntimeError("supply is down")

        dbl_export.set_status_marks(broken)
        self.assertEqual(dbl_export.status_marks_for(["c1"]), {})


if __name__ == "__main__":
    unittest.main()
