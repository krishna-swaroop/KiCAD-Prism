"""What the stock history says: rates, restocks, confidence, and when a warning is believable."""

from __future__ import annotations

import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply import insights  # noqa: E402
from app.services.supply.insights import Point  # noqa: E402

START = date(2026, 1, 1)


def series(values, *, listings=1, start=START, step=1):
    return [Point(start + timedelta(days=index * step), value, listings) for index, value in enumerate(values)]


class RateTests(unittest.TestCase):
    def test_nothing_to_say_without_history(self) -> None:
        for points in ([], series([100])):
            result = insights.analyse(points)
            self.assertEqual((result["confidence"], result["decrease_per_day"], result["days_to_zero"]), ("none", None, None))
            self.assertEqual(result["restocks"], 0)

    def test_a_steady_drawdown_gives_a_rate_and_days_left(self) -> None:
        result = insights.analyse(series([1000, 950, 900, 850, 800, 750, 700, 650]), threshold=300)
        self.assertEqual((result["trend"], result["decrease_per_day"]), ("falling", 50.0))
        self.assertEqual((result["days_to_zero"], result["days_to_threshold"]), (13, 7))
        self.assertEqual(result["inputs"], {"points": 8, "span_days": 7, "points_in_run": 8, "current": 650})

    def test_the_rate_is_a_median_so_one_odd_day_does_not_move_it(self) -> None:
        values = [1000, 950, 900, 850, 100 + 700, 750, 700, 650]  # one reading 700 pieces too high
        result = insights.analyse(series(values))
        self.assertAlmostEqual(result["decrease_per_day"], 50.0, delta=8)

    def test_uneven_spacing_is_measured_in_days(self) -> None:
        points = [Point(START + timedelta(days=d), stock, 1) for d, stock in ((0, 1000), (2, 900), (3, 850), (7, 650), (10, 500))]
        self.assertEqual(insights.analyse(points)["decrease_per_day"], 50.0)

    def test_too_few_points_or_days_give_no_rate(self) -> None:
        self.assertIsNone(insights.analyse(series([100, 90, 80]))["decrease_per_day"])
        short = [Point(START, 100, 1), Point(START, 90, 1), Point(START + timedelta(days=1), 80, 1), Point(START + timedelta(days=2), 70, 1)]
        self.assertIsNone(insights.analyse(short)["decrease_per_day"], "four readings in under three days")

    def test_a_flat_or_rising_part_has_no_days_to_zero(self) -> None:
        flat = insights.analyse(series([500] * 8))
        self.assertEqual((flat["trend"], flat["days_to_zero"]), ("steady", None))
        rising = insights.analyse(series([500, 505, 510, 515, 520, 525, 530, 535]))
        self.assertEqual((rising["trend"], rising["days_to_zero"], rising["restocks"]), ("rising", None, 0))

    def test_out_of_stock_has_no_days_to_zero_and_a_met_threshold_no_days_to_it(self) -> None:
        empty = insights.analyse(series([40, 30, 20, 10, 0]), threshold=5)
        self.assertEqual((empty["days_to_zero"], empty["days_to_threshold"]), (None, None))
        below = insights.analyse(series([100, 90, 80, 70, 60]), threshold=500)
        self.assertEqual((below["days_to_threshold"], below["days_to_zero"]), (None, 6))


class RestockTests(unittest.TestCase):
    def test_a_big_rise_is_a_restock_and_the_rate_starts_again_after_it(self) -> None:
        values = [1000, 900, 800, 700, 5000, 4900, 4800, 4700, 4600]
        result = insights.analyse(series(values))
        self.assertEqual(result["restocks"], 1)
        self.assertEqual(result["decrease_per_day"], 100.0, "only the days since the restock count")
        self.assertEqual(result["inputs"]["points_in_run"], 5)

    def test_a_small_rise_is_not_a_restock(self) -> None:
        self.assertEqual(insights.analyse(series([1000, 900, 950, 850, 800, 760]))["restocks"], 0)

    def test_any_rise_from_zero_is_a_restock(self) -> None:
        self.assertEqual(insights.analyse(series([30, 20, 10, 0, 5, 4, 3]))["restocks"], 1)

    def test_a_just_restocked_part_has_no_rate_yet(self) -> None:
        result = insights.analyse(series([1000, 900, 800, 700, 600, 5000, 4900]))
        self.assertIsNone(result["decrease_per_day"])
        self.assertEqual(result["restocks"], 1)

    def test_a_change_of_coverage_is_not_a_restock_and_cuts_the_series(self) -> None:
        points = series([1000, 950, 900], listings=1) + series([5900, 5850, 5800, 5750, 5700], listings=2, start=START + timedelta(days=3))
        result = insights.analyse(points)
        self.assertEqual(result["restocks"], 0, "a second listing appearing is not stock arriving")
        self.assertEqual(result["decrease_per_day"], 50.0)
        self.assertEqual(result["inputs"]["points_in_run"], 5)

    def test_regular_restocks_give_a_cadence(self) -> None:
        values = [1000, 800, 600, 4000, 3800, 3600, 3400, 3200, 3000, 6000, 5800, 5600, 5400]
        points = series(values)
        result = insights.analyse(points, today=points[-1].day)
        self.assertEqual((result["restocks"], result["restock_interval_days"]), (2, 6))
        self.assertEqual(result["restock_expected_in_days"], 6 - 3)


class ConfidenceTests(unittest.TestCase):
    def test_it_grows_with_points_and_span(self) -> None:
        self.assertEqual(insights.analyse(series([100, 99, 98]))["confidence"], "low")
        self.assertEqual(insights.analyse(series([1000 - 10 * i for i in range(10)]))["confidence"], "medium")
        self.assertEqual(insights.analyse(series([5000 - 10 * i for i in range(40)]))["confidence"], "high")

    def test_a_long_history_with_a_short_run_stays_medium(self) -> None:
        values = [5000 - 10 * i for i in range(35)] + [9000, 8990, 8980, 8970]
        self.assertEqual(insights.analyse(series(values))["confidence"], "medium")


class BelievableWarningTests(unittest.TestCase):
    def falling(self, count=20, start_value=1000, step=50):
        return insights.analyse(series([start_value - step * i for i in range(count)]))

    def test_a_confident_rate_inside_the_horizon_is_a_warning(self) -> None:
        result = {**insights.analyse(series([2000 - 50 * i for i in range(35)]))}
        self.assertEqual(insights.rupture_expected_within(result), result["days_to_zero"])
        self.assertLessEqual(result["days_to_zero"], insights.HORIZON_DAYS)

    def test_beyond_the_horizon_or_with_low_confidence_it_is_not(self) -> None:
        self.assertIsNone(insights.rupture_expected_within({"days_to_zero": 120, "confidence": "high"}))
        self.assertIsNone(insights.rupture_expected_within({"days_to_zero": 10, "confidence": "low"}))
        self.assertIsNone(insights.rupture_expected_within({"days_to_zero": None, "confidence": "high"}))

    def test_a_regular_restock_due_first_is_not_a_false_alarm(self) -> None:
        base = {"days_to_zero": 20, "confidence": "high", "restocks": 3}
        self.assertIsNone(insights.rupture_expected_within({**base, "restock_expected_in_days": 5}))
        self.assertEqual(insights.rupture_expected_within({**base, "restock_expected_in_days": 40}), 20)
        self.assertEqual(insights.rupture_expected_within({**base, "restock_expected_in_days": -3}), 20, "overdue: no comfort in it")
        self.assertEqual(insights.rupture_expected_within({**base, "restocks": 1, "restock_expected_in_days": 5}), 20,
                         "one restock is not a cadence")


class DrainTests(unittest.TestCase):
    def test_a_part_still_made_is_not_shown_running_out_after_a_year_but_an_ending_one_is(self) -> None:
        slow = series([1_000_000 - 100 * index for index in range(10)])
        made = insights.apply_horizon(insights.analyse(slow), ending=False)
        self.assertEqual((made["trend"], made["days_to_zero"], made["beyond_year"]), ("falling", None, True))
        ending = insights.apply_horizon(insights.analyse(slow), ending=True)
        self.assertEqual((ending["days_to_zero"], ending["beyond_year"]), (9991, False))

    def test_a_drain_inside_a_year_is_left_alone(self) -> None:
        result = insights.apply_horizon(insights.analyse(series([1000, 950, 900, 850, 800, 750, 700, 650])), ending=False)
        self.assertEqual((result["days_to_zero"], result["beyond_year"]), (13, False))

    def test_a_drain_that_speeds_up_says_so_and_gives_the_recent_runout(self) -> None:
        result = insights.analyse(series([1000, 990, 980, 970, 960, 950, 900, 800, 650, 450, 250]))
        self.assertEqual(result["pace"], "accelerating")
        self.assertGreater(result["recent_decrease_per_day"], result["decrease_per_day"])
        self.assertLess(result["days_to_zero_recent"], result["days_to_zero"])

    def test_an_even_or_slowing_drain_has_no_recent_runout(self) -> None:
        even = insights.analyse(series([1000 - 20 * index for index in range(12)]))
        self.assertEqual((even["pace"], even["days_to_zero_recent"]), ("steady", None))
        slowing = insights.analyse(series([1000, 800, 650, 550, 480, 440, 430, 424, 420, 417, 415]))
        self.assertEqual((slowing["pace"], slowing["days_to_zero_recent"]), ("slowing", None))

    def test_too_short_a_run_has_no_pace(self) -> None:
        self.assertIsNone(insights.analyse(series([1000, 900, 800, 700, 600]))["pace"])


if __name__ == "__main__":
    unittest.main()


class ShapeTests(unittest.TestCase):
    def test_zero_days_the_wait_before_a_restock_and_the_swing(self) -> None:
        result = insights.analyse(series([100, 0, 0, 0, 100, 100, 0, 0, 0, 100]))
        self.assertEqual(result["zero_share"], 0.6)
        self.assertEqual(result["restock_latency_days"], 3, "two waits of 3 days")
        self.assertGreater(result["volatility"], 0.5)

    def test_a_steady_part_has_no_wait_and_little_swing(self) -> None:
        result = insights.analyse(series([500, 502, 498, 501, 499]))
        self.assertEqual((result["zero_share"], result["restock_latency_days"]), (0.0, None))
        self.assertLess(result["volatility"], 0.05)

    def test_fewer_distributors_and_where_the_stock_sits(self) -> None:
        points = [Point(START + timedelta(days=index), 100, 3, sources=3 if index < 4 else 1, concentration=0.4 if index < 4 else 1.0) for index in range(8)]
        result = insights.analyse(points)
        self.assertEqual((result["sources_change"], result["concentration"]), (-2, 1.0))
        self.assertIsNone(insights.analyse(series([100, 100, 100]))["sources_change"], "too short to call a trend")

    def test_a_gap_to_the_lead_time_only_when_stock_runs_out_first(self) -> None:
        falling = insights.analyse(series([1000, 900, 800, 700, 600, 500, 400, 300, 200, 100, 50, 40, 30, 20, 10, 8]))
        self.assertIsNotNone(falling["days_to_zero"])
        self.assertEqual(insights.lead_gap_days({"days_to_zero": 10, "confidence": "high"}, 30), 20)
        self.assertIsNone(insights.lead_gap_days({"days_to_zero": 40, "confidence": "high"}, 30))
        self.assertIsNone(insights.lead_gap_days({"days_to_zero": 10, "confidence": "low"}, 30), "not believable enough")
        self.assertIsNone(insights.lead_gap_days({"days_to_zero": 10, "confidence": "high"}, None))


class UnusualTests(unittest.TestCase):
    def test_a_one_day_collapse_is_an_anomaly_but_a_slow_fall_or_a_new_listing_is_not(self) -> None:
        found = insights.analyse(series([1000, 980, 960, 100, 95, 90]))["anomalies"]
        self.assertEqual([(item["from"], item["to"]) for item in found], [(960, 100)])
        self.assertEqual(insights.analyse(series([1000, 900, 800, 700, 600, 500]))["anomalies"], [])
        cut = [Point(START + timedelta(days=index), value, 2 if index < 3 else 1) for index, value in enumerate([1000, 1000, 1000, 100, 100])]
        self.assertEqual(insights.analyse(cut)["anomalies"], [], "a listing that stopped counting is coverage, not stock")
        self.assertEqual(insights.analyse(series([40, 5, 5, 5, 5]))["anomalies"], [], "too small a level to notice")

    def test_seasonality_needs_more_than_a_year_and_names_the_months(self) -> None:
        short = [Point(START + timedelta(days=index), 100, 1) for index in range(200)]
        self.assertIsNone(insights.analyse(short)["seasonality"])
        days = [START + timedelta(days=index * 3) for index in range(260)]
        long_run = [Point(day, 200 if day.month in (11, 12) else 100, 1) for day in days]
        found = insights.analyse(long_run)["seasonality"]
        self.assertIn(found["peak"], (11, 12))
        self.assertLess(found["index"][found["trough"]], 1)
        self.assertGreater(found["index"][found["peak"]], 1)
