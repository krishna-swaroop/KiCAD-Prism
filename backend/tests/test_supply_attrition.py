"""Spares by kind of part."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply import attrition  # noqa: E402
from app.services.supply.settings import DEFAULTS  # noqa: E402


class AttritionTests(unittest.TestCase):
    def test_small_passives_get_spares_and_the_rest_do_not(self) -> None:
        for name in ("R_0603_1608Metric", "Capacitor_SMD:C_0402_1005Metric", "LED_0603_1608Metric", "L_01005"):
            self.assertEqual(attrition.class_of(name), "small_passive", name)
            self.assertEqual(attrition.percent_for(name, DEFAULTS.spares.table()), 2.0)
        for name in ("R_1206_3216Metric", "Package_QFP:LQFP-48_7x7mm_P0.5mm", "Connector_PinHeader_2.54mm:PinHeader_1x04", "SOT-23", ""):
            self.assertEqual(attrition.class_of(name), "other", name)
            self.assertEqual(attrition.percent_for(name, DEFAULTS.spares.table()), 0.0)

    def test_a_number_that_only_looks_like_a_size_is_not_one(self) -> None:
        self.assertEqual(attrition.class_of("R_10603"), "other")
        self.assertEqual(attrition.class_of("C_06031"), "other")


if __name__ == "__main__":
    unittest.main()
