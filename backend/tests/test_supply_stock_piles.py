"""Stock of a distributor's listings of one part: cut tape and custom reel are one pile, any other packaging adds."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply import stock  # noqa: E402


def row(provider: str, packaging: str | None, count: int, connector: str = "c1") -> dict:
    return {"connector_id": connector, "provider": provider, "stock": count, "marketplace": False, "packaging": packaging, "fetched_at": 0}


class PileTests(unittest.TestCase):
    def test_cut_tape_and_custom_reel_are_one_pile_and_a_full_reel_adds(self) -> None:
        # Farnell's shapes in the dev data: the same 11,140 on both, and a reel of its own in some parts.
        self.assertEqual(stock.connector_stock("farnell", [row("farnell", "cut_tape", 11140), row("farnell", "custom_reel", 11140)]), 11140)
        self.assertEqual(stock.connector_stock("farnell", [row("farnell", "cut_tape", 11140), row("farnell", "custom_reel", 11140), row("farnell", "tape_reel", 5000)]), 16140)
        self.assertEqual(stock.connector_stock("farnell", [row("farnell", "cut_tape", 2264), row("farnell", "custom_reel", 2250)]), 2264, "the largest of the pile")

    def test_named_packagings_each_add(self) -> None:
        self.assertEqual(stock.connector_stock("mouser", [row("mouser", "tray", 100), row("mouser", "tube", 50), row("mouser", None, 7)]), 157)
        self.assertEqual(stock.connector_stock("farnell", [row("farnell", "cut_tape", 300), row("farnell", "tape_reel", 4000)]), 4300)

    def test_an_unknown_packaging_joins_the_cut_tape_pile_so_a_guess_never_doubles_stock(self) -> None:
        self.assertEqual(stock.connector_stock("farnell", [row("farnell", "cut_tape", 300), row("farnell", "unknown", 300)]), 300)
        self.assertEqual(stock.connector_stock("farnell", [row("farnell", "unknown", 50)]), 50)
        self.assertEqual(stock.connector_stock("farnell", [row("farnell", "other", 80), row("farnell", None, 90), row("farnell", "tray", 10)]), 100)

    def test_a_provider_that_pools_its_stock_counts_the_largest_of_all(self) -> None:
        self.assertEqual(stock.connector_stock("digikey", [row("digikey", "cut_tape", 900), row("digikey", "tape_reel", 900), row("digikey", "custom_reel", 400)]), 900)

    def test_storefronts_on_one_account_are_one_pool_and_one_holder(self) -> None:
        # Two storefronts of one account list the same reel: it counts once, and the account holds it once.
        uk = {**row("tme", "tape_reel", 1000, "uk"), "pool": "acct", "sku": "SKU-1"}
        de = {**row("tme", "tape_reel", 1000, "de"), "pool": "acct", "sku": "SKU-1"}
        other = {**row("mouser", "cut_tape", 200, "m"), "pool": "m", "sku": "M-1"}
        combined = stock.aggregate([uk, de, other])
        self.assertEqual((combined.total, sum(1 for amount in combined.by_pool.values() if amount > 0)), (1200, 2))
        self.assertEqual(combined.by_connector, {"uk": 1000, "de": 1000, "m": 200}, "each storefront still shows its own figure")
        self.assertEqual(stock.aggregate([uk, {**de, "pool": "other-account"}]).total, 2000, "separate accounts are separate shelves")

    def test_a_total_is_as_old_as_the_oldest_read_that_holds_stock(self) -> None:
        old = {**row("tme", "cut_tape", 1000, "c1"), "fetched_at": 1}
        fresh_zero = {**row("mouser", "cut_tape", 0, "c2"), "fetched_at": 180}
        self.assertEqual(stock.aggregate([old, fresh_zero]).as_of, 1, "a fresh zero doesn't make the old 1,000 current")
        self.assertEqual(stock.aggregate([{**old, "stock": 0}, fresh_zero]).as_of, 1, "with none holding, the oldest of all")

    def test_a_part_adds_across_distributors_and_leaves_out_marketplace_and_other_packaging_than_a_watch_counts(self) -> None:
        rows = [row("farnell", "cut_tape", 100), row("farnell", "custom_reel", 100), row("tme", "cut_tape", 30, "c2"), {**row("tme", "tray", 500, "c2"), "marketplace": True}]
        self.assertEqual(stock.aggregate(rows).total, 130)
        self.assertEqual(stock.aggregate(rows, "custom_reel").total, 100)

    def test_the_sql_for_what_counts_names_the_providers_a_pick_limits(self) -> None:
        from app.services.supply.providers import registry
        from app.services.supply.providers.base import ProviderSpec

        registry.register(ProviderSpec(
            key="pick_demo", label="Pick demo", capabilities=frozenset({"search", "offers"}), max_batch=1,
            stock_pooling="separate", credential_fields=(), factory=lambda config: None, default_daily_budget=100,
        ), replace=True)
        try:
            from app.services.supply import counted

            sql = counted.read_sql()
        finally:
            registry.unregister("pick_demo")
        self.assertIn("'pick_demo'", sql)
        self.assertNotIn("'farnell'", sql)
        self.assertNotIn("'lcsc'", sql, "a CSV-fed connector is not pick-limited: a pick saves it no calls")


if __name__ == "__main__":
    unittest.main()
