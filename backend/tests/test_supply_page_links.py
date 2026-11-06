"""A listing's page at its distributor, from its reading or from its number."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply.page_links import page_url  # noqa: E402


class PageUrlTests(unittest.TestCase):
    def test_the_page_a_reading_gave_wins(self) -> None:
        self.assertEqual(page_url("mouser", "595-LM358", "https://www.mouser.com/ProductDetail/x"), "https://www.mouser.com/ProductDetail/x")

    def test_every_distributor_with_a_known_page_gets_one_before_a_reading(self) -> None:
        self.assertEqual(page_url("lcsc", "C7593"), "https://www.lcsc.com/product-detail/C7593.html")
        self.assertEqual(page_url("tme", "LM358DT"), "https://www.tme.eu/en/details/lm358dt/")
        self.assertEqual(page_url("jlcpcb", "C7593"), "https://jlcpcb.com/partdetail/C7593")
        self.assertEqual(page_url("mouser", "595-LM358DR"), "https://www.mouser.com/ProductDetail/595-LM358DR")
        self.assertEqual(page_url("digikey", "296-1395-1-ND"), "https://www.digikey.com/en/products/result?keywords=296-1395-1-ND")
        self.assertEqual(page_url("digikey", "A B#1"), "https://www.digikey.com/en/products/result?keywords=A%20B%231")

    def test_no_page_without_a_number_a_known_pattern_or_with_a_slash(self) -> None:
        for provider, sku in (("mouser", ""), ("arrow", "LM358"), ("mouser", "595-LM358/NOPB")):
            self.assertEqual(page_url(provider, sku), "", f"{provider} {sku}")


if __name__ == "__main__":
    unittest.main()
