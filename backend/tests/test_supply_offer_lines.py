"""The ways of buying one crystal (``ABS07-32.768KHZ-7-T``), from what DigiKey, Farnell and Mouser answered on 2026-10-18."""

from __future__ import annotations

import json
import unittest
from datetime import datetime, timezone
from pathlib import Path

from app.services.supply.offer_lines import offer_lines
from app.services.supply.providers import digikey, farnell, mouser

FIXTURES = Path(__file__).parent / "fixtures" / "supply"
NOW = datetime(2026, 10, 18, tzinfo=timezone.utc)


def _answers(name: str) -> list[dict]:
    return [call["answer"] for call in json.loads((FIXTURES / f"{name}_live_abs07_32_768khz_7_t.json").read_text(encoding="utf-8"))["calls"]]


def _row(offer, connector_id: str, name: str, order_multiple: int | None = None) -> dict:
    """An offer as the list reads it from the database."""

    return {
        "connector_id": connector_id, "provider": offer.provider, "connector_name": name, "sku": offer.sku, "stock": offer.stock,
        "marketplace": False, "packaging": offer.packaging.value, "reel_size": offer.reel_size, "packaging_inferred": False,
        "moq": offer.moq, "order_multiple": order_multiple or offer.order_multiple, "currency": offer.currency, "product_url": offer.product_url,
        "price_breaks": [[item.quantity, str(item.unit_price)] for item in offer.price_breaks],
    }


class OfferLineTests(unittest.TestCase):
    def test_digikey_reports_three_products_and_three_show_smallest_order_first(self) -> None:
        answer = next(a for a in _answers("digikey") if "Product" in a)
        rows = [_row(digikey._offer(sku, answer, NOW), "dk", "DigiKey") for sku in ("535-9543-1-ND", "535-9543-2-ND", "535-9543-6-ND")]  # noqa: SLF001
        lines = offer_lines(rows)
        self.assertEqual([(line["sku"], line["packaging"], line["moq"]) for line in lines], [
            ("535-9543-1-ND", "cut_tape", 1), ("535-9543-6-ND", "custom_reel", 1), ("535-9543-2-ND", "tape_reel", 3000),
        ])
        # Cut tape and Digi-Reel share their prices, and both are shown.
        self.assertEqual(lines[0]["price_breaks"], lines[1]["price_breaks"])

    def test_the_followed_listing_comes_first_even_with_a_larger_order(self) -> None:
        answer = next(a for a in _answers("digikey") if "Product" in a)
        rows = [_row(digikey._offer(sku, answer, NOW), "dk", "DigiKey") for sku in ("535-9543-1-ND", "535-9543-2-ND")]  # noqa: SLF001
        rows[1]["followed"] = True
        self.assertEqual([line["sku"] for line in offer_lines(rows)], ["535-9543-2-ND", "535-9543-1-ND"])

    def test_the_lower_price_comes_first_at_the_same_smallest_order(self) -> None:
        base = {
            "connector_id": "c", "provider": "digikey", "connector_name": "DigiKey", "stock": 5, "marketplace": False, "reel_size": None,
            "packaging_inferred": False, "moq": 1, "order_multiple": 1, "currency": "EUR", "product_url": "", "packaging": "cut_tape",
        }
        rows = [{**base, "sku": "B", "price_breaks": [[1, "0.60"]]}, {**base, "sku": "A", "price_breaks": [[1, "0.70"]]}]
        self.assertEqual([line["sku"] for line in offer_lines(rows)], ["B", "A"])

    def test_lcsc_and_tme_sell_cut_tape_from_one_piece_whatever_the_standard_packaging_is(self) -> None:
        base = {
            "connector_id": "c", "connector_name": "LCSC", "stock": 5, "marketplace": False, "reel_size": 3000, "packaging_inferred": False,
            "moq": 1, "order_multiple": 1, "currency": "USD", "product_url": "", "packaging": "tape_reel", "sku": "C1",
        }
        for provider in ("lcsc", "tme"):
            from_one = offer_lines([{**base, "provider": provider, "price_breaks": [[1, "0.6"], [3000, "0.4"]]}])[0]
            self.assertEqual((from_one["packaging"], from_one["reel_size"], from_one["packaging_inferred"]), ("cut_tape", None, True), provider)
            by_reel = offer_lines([{**base, "provider": provider, "moq": 3000, "price_breaks": [[3000, "0.4"]]}])[0]
            self.assertEqual((by_reel["packaging"], by_reel["reel_size"]), ("tape_reel", 3000), provider)
        # Another distributor's reel is left alone.
        other = offer_lines([{**base, "provider": "mouser", "price_breaks": [[1, "0.6"]]}])[0]
        self.assertEqual(other["packaging"], "tape_reel")

    def test_mouser_one_number_with_a_reel_in_its_price_table_is_cut_tape_and_a_reel(self) -> None:
        answer = _answers("mouser")[0]
        part = answer["SearchResults"]["Parts"][0]
        offer = mouser._offer(part["MouserPartNumber"], part, NOW)  # noqa: SLF001
        self.assertEqual((offer.packaging.value, offer.reel_size), ("several", 3000))
        lines = offer_lines([_row(offer, "mo", "Mouser")])
        self.assertEqual([(line["packaging"], line["moq"], line["reel_size"]) for line in lines], [("cut_tape", 1, None), ("tape_reel", 3000, 3000)])
        self.assertEqual([line["followed"] for line in lines], [False, False])
        self.assertEqual(lines[0]["also_packaging"], ["custom_reel"])
        self.assertTrue(all(item[0] < 3000 for item in lines[0]["price_breaks"]))
        self.assertTrue(all(item[0] >= 3000 for item in lines[1]["price_breaks"]))
        self.assertEqual({line["sku"] for line in lines}, {"815-ABS07-32.768K7T"})

    def test_farnell_keeps_cut_tape_re_reel_and_reel_apart(self) -> None:
        products = farnell._products(_answers("farnell")[0])  # noqa: SLF001
        rows = [_row(farnell._offer(p["sku"], p, "EUR", NOW, "it.farnell.com"), "fa", "Farnell") for p in products]  # noqa: SLF001
        lines = offer_lines(rows)
        self.assertEqual([(line["sku"], line["packaging"], line["moq"]) for line in lines], [
            ("1838935", "cut_tape", 5), ("1838935RL", "custom_reel", 100), ("3573150", "tape_reel", 3000),
        ])
        # The distributor answers the same prices for the cut length and the re-reeled one; nothing is invented to tell them apart.
        self.assertEqual(lines[0]["price_breaks"], lines[1]["price_breaks"])


if __name__ == "__main__":
    unittest.main()


class InBaseTests(unittest.TestCase):
    def test_a_line_carries_its_prices_in_the_workspace_currency_and_keeps_its_own(self) -> None:
        from decimal import Decimal

        from app.services.supply.fx import Rates
        from app.services.supply.offer_lines import in_base

        rates = Rates(day=None, per_eur={"INR": Decimal("90"), "USD": Decimal("1.1")})
        lines = [
            {"currency": "EUR", "price_breaks": [[1, "2.00"], [100, "1.50"]]},
            {"currency": "INR", "price_breaks": [[1, "180"]]},
            {"currency": "XYZ", "price_breaks": [[1, "3"]]},
        ]
        out = in_base(lines, "INR", rates)
        self.assertEqual(out[0]["base_price_breaks"], [[1, "180.0000"], [100, "135.0000"]])
        self.assertEqual(out[0]["price_breaks"], [[1, "2.00"], [100, "1.50"]])
        self.assertEqual(out[1]["base_price_breaks"], [[1, "180.0000"]])
        self.assertIsNone(out[2]["base_price_breaks"], "no rate for the line's currency")
        self.assertEqual({line["base_currency"] for line in out}, {"INR"})
