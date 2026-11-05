"""Small counts behind the Dashboard and the insights: the risk grid's column and the scorecard's restock rounds."""

from __future__ import annotations

import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply import risk_views, scorecard  # noqa: E402


class RiskColumnTests(unittest.TestCase):
    def test_a_read_part_whose_holders_are_not_worked_out_is_not_single_sourced(self) -> None:
        self.assertEqual(risk_views.availability_of({"stock": 5000}, None), "not_read")
        self.assertEqual(risk_views.availability_of({"stock": 5000}, {"holders": 1}), "one")
        self.assertEqual(risk_views.availability_of({"stock": 5000}, {"holders": 3}), "two_plus")
        self.assertEqual(risk_views.availability_of({"stock": 0}, None), "out")


class ReasonTests(unittest.TestCase):
    def test_a_project_the_caller_cannot_see_is_left_out_of_the_reasons(self) -> None:
        from app.services.supply import tracking

        reasons = [{"kind": "project", "ref": "prj_open"}, {"kind": "project", "ref": "prj_hidden", "variant": "Secret"}, {"kind": "person", "ref": "ana"}]
        self.assertEqual(tracking.visible_reasons(reasons, {"prj_open"}), [reasons[0], reasons[2]])
        self.assertEqual(tracking.visible_reasons(reasons, None), reasons)


class RoundTests(unittest.TestCase):
    def test_a_restock_counts_in_one_round_only(self) -> None:
        first, took_part = scorecard._rounds({"p1": {"a": [date(2026, 9, 1), date(2026, 9, 21)], "b": [date(2026, 9, 11)]}})  # noqa: SLF001
        self.assertEqual(dict(took_part), {"a": 1, "b": 1}, "b restocked once, after a")
        self.assertEqual(dict(first), {"a": 1})


if __name__ == "__main__":
    unittest.main()
