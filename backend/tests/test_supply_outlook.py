"""The rule-based lifecycle outlook. No database."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply import outlook  # noqa: E402
from app.services.supply.vocabulary import Lifecycle  # noqa: E402


def read(lifecycle=Lifecycle.ACTIVE, offers=({"discontinued": False},), **kw):
    return outlook.outlook(lifecycle, list(offers), **kw)


class OutlookTests(unittest.TestCase):
    def test_a_healthy_part_has_no_signs_of_an_end_never_a_promise_of_years(self) -> None:
        result = read()
        self.assertEqual((result["band"], result["signals"], result["method"]), ("no_signs", [], "rule-based"))
        self.assertEqual(result["label"], "No signs of an end")

    def test_obsolete_is_ended_and_a_last_time_buy_is_under_two_years(self) -> None:
        self.assertEqual(read(Lifecycle.OBSOLETE)["band"], "ended")
        self.assertEqual(read(Lifecycle.LAST_TIME_BUY)["band"], "ending")

    def test_nrnd_is_two_to_five_years(self) -> None:
        self.assertEqual(read(Lifecycle.NRND)["band"], "warning_signs")

    def test_every_distributor_dropping_it_is_under_two_years(self) -> None:
        self.assertEqual(read(offers=[{"discontinued": True}, {"discontinued": True}])["band"], "ending")

    def test_one_soft_signal_is_a_note_and_two_together_move_the_band(self) -> None:
        one = read(offers=[{"discontinued": True}, {"discontinued": False}])
        self.assertEqual((one["band"], len(one["signals"])), ("no_signs", 1))
        two = read(offers=[{"discontinued": True}, {"discontinued": False}], zero_stock_days=45)
        self.assertEqual(two["band"], "warning_signs")
        three = read(zero_stock_days=45, price_change_percent=30.0)
        self.assertEqual(three["band"], "warning_signs")

    def test_nothing_known_is_not_enough_to_say(self) -> None:
        self.assertEqual(read(Lifecycle.UNKNOWN, offers=[])["band"], "unknown")
        self.assertEqual(read(Lifecycle.UNKNOWN)["band"], "no_signs", "offers exist and nothing is wrong")

    def test_every_signal_names_its_source(self) -> None:
        result = read(Lifecycle.NRND, zero_stock_days=40)
        self.assertEqual({item["source"] for item in result["signals"]}, {"distributor lifecycle", "stock history"})

    def test_a_distributors_last_date_to_buy_is_under_two_years_and_counts_as_data(self) -> None:
        found = outlook.outlook(Lifecycle.UNKNOWN, [], last_buy_dates=[("DigiKey", "2027-03-31")])
        self.assertEqual(found["band"], outlook.ENDING)
        self.assertEqual(found["signals"], [{"text": "DigiKey gives a last date to buy: 2027-03-31.", "source": "distributor", "weight": "hard"}])

    def test_trailing_zero_days_count_only_the_latest_run(self) -> None:
        history = [{"stock": 5}, {"stock": 0}, {"stock": 3}, {"stock": 0}, {"stock": 0}]
        self.assertEqual(outlook.trailing_zero_days(history), 2)
        self.assertEqual(outlook.trailing_zero_days([]), 0)


if __name__ == "__main__":
    unittest.main()
