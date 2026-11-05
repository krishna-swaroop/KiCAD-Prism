"""Price moves: the cheapest price per day and when a rise counts. No database."""

from __future__ import annotations

import sys
import unittest
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply import prices  # noqa: E402

TODAY = date(2026, 3, 1)


def points(*values, currency="EUR", every=1, end=TODAY):
    return [(end - timedelta(days=every * (len(values) - 1 - i)), Decimal(v), currency) for i, v in enumerate(values)]


class PriceTrendTests(unittest.TestCase):
    def test_the_first_and_latest_price_make_the_move(self) -> None:
        result = prices.trend(points("1.00", "1.10", "1.25", every=5), TODAY)
        self.assertEqual(result, {"currency": "EUR", "was": "1", "now": "1.25", "change_percent": 25.0, "days": 10})

    def test_too_few_too_close_or_too_old_says_nothing(self) -> None:
        self.assertIsNone(prices.trend(points("1.00"), TODAY))
        self.assertIsNone(prices.trend(points("1.00", "2.00", every=3), TODAY), "six days is under a week")
        self.assertIsNone(prices.trend(points("1.00", "2.00", every=10, end=TODAY - timedelta(days=5)), TODAY), "last reading is old")

    def test_a_fall_is_reported_as_a_negative_change(self) -> None:
        self.assertEqual(prices.trend(points("2.00", "1.00", every=10), TODAY)["change_percent"], -50.0)

    def test_the_view_has_the_daily_series_and_the_move_over_the_last_thirty_days_only(self) -> None:
        old = (TODAY - timedelta(days=60), Decimal("0.50"), "EUR")
        recent = points("1.00", "1.30", every=10)
        view = prices.view([old, *recent], TODAY)
        self.assertEqual((view["currency"], [h["price"] for h in view["history"]]), ("EUR", [0.5, 1.0, 1.3]))
        self.assertEqual(view["trend"]["change_percent"], 30.0, "the 60 day old reading is outside the move")
        self.assertEqual(prices.view([], TODAY), {"currency": "", "history": [], "trend": None})


class CheapestHeldTests(unittest.TestCase):
    """The part's price on a day is its listings' cheapest, each at its latest reading: a day nobody read a listing is not a move."""

    def day(self, n: int) -> date:
        return TODAY + timedelta(days=n)

    def test_a_listing_not_read_that_day_still_counts_at_its_last_price(self) -> None:
        readings = [("cheap", self.day(0), Decimal("0.10")), ("dear", self.day(0), Decimal("0.20")),
                    ("dear", self.day(1), Decimal("0.20")), ("cheap", self.day(2), Decimal("0.10"))]
        self.assertEqual(prices.cheapest_held(readings), [(self.day(n), Decimal("0.10")) for n in range(3)])

    def test_a_listing_first_read_later_counts_from_the_start_so_finding_it_is_no_drop(self) -> None:
        readings = [("first", self.day(0), Decimal("0.50")), ("first", self.day(5), Decimal("0.50")), ("found", self.day(1), Decimal("0.30"))]
        self.assertEqual({price for _day, price in prices.cheapest_held(readings)}, {Decimal("0.30")})

    def test_a_listing_that_changed_its_price_moves_the_part(self) -> None:
        readings = [("only", self.day(0), Decimal("1.00")), ("only", self.day(10), Decimal("1.30"))]
        self.assertEqual(prices.cheapest_held(readings), [(self.day(0), Decimal("1.00")), (self.day(10), Decimal("1.30"))])

    def test_a_listing_not_read_for_a_week_after_its_last_reading_has_gone(self) -> None:
        readings = [("gone", self.day(0), Decimal("0.10")), ("kept", self.day(0), Decimal("0.20")),
                    ("kept", self.day(prices.LAPSE_DAYS), Decimal("0.20")), ("kept", self.day(prices.LAPSE_DAYS + 1), Decimal("0.20"))]
        self.assertEqual(prices.cheapest_held(readings)[-2:], [(self.day(prices.LAPSE_DAYS), Decimal("0.10")), (self.day(prices.LAPSE_DAYS + 1), Decimal("0.20"))])
        self.assertEqual(prices.cheapest_held([]), [])


if __name__ == "__main__":
    unittest.main()
