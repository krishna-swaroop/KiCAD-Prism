from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import pcb_rules_service as rs  # noqa: E402


class NormalizeCapabilityTests(unittest.TestCase):
    def test_legacy_scalar_wraps_with_field_default(self) -> None:
        # min_* fields default to gte.
        self.assertEqual(rs.normalize_capability("min_track_width", 0.09), {"op": "gte", "value": 0.09})
        # copper_finish defaults to `in`; a bare string becomes a single-item set.
        self.assertEqual(rs.normalize_capability("copper_finish", "ENIG"), {"op": "in", "values": ["ENIG"]})
        # a bool field wraps as bool.
        self.assertEqual(rs.normalize_capability("allow_microvias", True), {"op": "bool", "value": True})

    def test_object_is_kept(self) -> None:
        cap = {"op": "between", "min": 0.4, "max": 2.0}
        self.assertEqual(rs.normalize_capability("board_thickness_mm", cap), cap)

    def test_empty_is_none(self) -> None:
        self.assertIsNone(rs.normalize_capability("min_track_width", None))
        self.assertIsNone(rs.normalize_capability("min_track_width", ""))


class EvaluateCapabilityTests(unittest.TestCase):
    def test_gte(self) -> None:
        cap = {"op": "gte", "value": 0.089}
        self.assertEqual(rs.evaluate_capability("min_track_width", cap, 0.1), "pass")
        self.assertEqual(rs.evaluate_capability("min_track_width", cap, 0.05), "fail")

    def test_lte(self) -> None:
        cap = {"op": "lte", "value": 2.0}
        self.assertEqual(rs.evaluate_capability("board_thickness_mm", cap, 1.6), "pass")
        self.assertEqual(rs.evaluate_capability("board_thickness_mm", cap, 2.4), "fail")

    def test_between(self) -> None:
        cap = {"op": "between", "min": 1, "max": 4}
        self.assertEqual(rs.evaluate_capability("layer_count", cap, 4), "pass")
        self.assertEqual(rs.evaluate_capability("layer_count", cap, 6), "fail")
        self.assertEqual(rs.evaluate_capability("layer_count", cap, 0), "fail")
        # An open-ended range (only a min) is allowed.
        self.assertEqual(rs.evaluate_capability("layer_count", {"op": "between", "min": 2}, 8), "pass")

    def test_in(self) -> None:
        cap = {"op": "in", "values": ["ENIG", "HASL"]}
        self.assertEqual(rs.evaluate_capability("copper_finish", cap, "ENIG"), "pass")
        self.assertEqual(rs.evaluate_capability("copper_finish", cap, "enig"), "pass")  # case-insensitive
        self.assertEqual(rs.evaluate_capability("copper_finish", cap, "OSP"), "fail")

    def test_bool_need_vs_support(self) -> None:
        supported = {"op": "bool", "value": True}
        unsupported = {"op": "bool", "value": False}
        # Board needs microvias.
        self.assertEqual(rs.evaluate_capability("allow_microvias", supported, True), "pass")
        self.assertEqual(rs.evaluate_capability("allow_microvias", unsupported, True), "fail")
        # Board does not need them: an unsupporting fab is still fine.
        self.assertEqual(rs.evaluate_capability("allow_microvias", unsupported, False), "pass")

    def test_unknown_when_board_absent(self) -> None:
        self.assertEqual(rs.evaluate_capability("min_track_width", {"op": "gte", "value": 0.1}, None), "unknown")

    def test_unknown_when_no_capability(self) -> None:
        self.assertEqual(rs.evaluate_capability("min_track_width", None, 0.1), "unknown")


class EvaluateRulesTests(unittest.TestCase):
    def test_full_comparison_rows(self) -> None:
        caps = {
            "min_track_width": {"op": "gte", "value": 0.089},
            "layer_count": {"op": "between", "min": 1, "max": 4},
            "copper_finish": {"op": "in", "values": ["HASL"]},
        }
        board = {"min_track_width": 0.1, "layer_count": 6, "copper_finish": "ENIG", "min_clearance": 0.1}
        rows = {r["key"]: r for r in rs.evaluate_rules(caps, board)}
        self.assertEqual(rows["min_track_width"]["verdict"], "pass")
        self.assertEqual(rows["layer_count"]["verdict"], "fail")
        self.assertEqual(rows["copper_finish"]["verdict"], "fail")
        # A board value with no capability still appears, as unknown.
        self.assertEqual(rows["min_clearance"]["verdict"], "unknown")
        self.assertIsNone(rows["min_clearance"]["capability"])

    def test_rows_follow_field_order_and_skip_empty(self) -> None:
        rows = rs.evaluate_rules({}, {})
        self.assertEqual(rows, [])


if __name__ == "__main__":
    unittest.main()
