"""What several distributors' answers share, read one way: price breaks, RoHS wording, packaging words."""

from __future__ import annotations

import sys
import unittest
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply.providers import normalise  # noqa: E402
from app.services.supply.vocabulary import Packaging  # noqa: E402


class NormaliseTests(unittest.TestCase):
    def test_price_breaks_are_parsed_kept_first_per_quantity_and_ascending(self) -> None:
        breaks = normalise.price_breaks([("100", "€0,30"), ("1", "0.50"), ("100", "0.29"), ("", "1"), ("10", None), (1_000, Decimal("0.2"))])
        self.assertEqual([(b.quantity, b.unit_price) for b in breaks], [(1, Decimal("0.50")), (100, Decimal("0.30")), (1000, Decimal("0.2"))])
        self.assertEqual(normalise.price_breaks([("1", "0"), ("10", "0.4")], free=False)[0].quantity, 10, "a zero that means ask us")
        self.assertEqual(len(normalise.price_breaks([("1", "0")])), 1)
        self.assertEqual(normalise.price_breaks([(1, Decimal("1.476"))])[0].unit_price, Decimal("1.476"), "a number is not read as text")

    def test_rohs_wording(self) -> None:
        for text, said in (("ROHS3 Compliant", True), ("RoHS Compliant By Exemption", True), ("Yes", True), ("Non-Compliant", False),
                           ("RoHS non compliant", False), ("Not Compliant", False), ("N", False), ("", None), ("Unknown", None), ("Not Applicable", None)):
            self.assertEqual(normalise.rohs_word(text), said, text)

    def test_packaging_words_most_specific_first(self) -> None:
        for text, packaging in (("Cut Tape (CT)", Packaging.CUT_TAPE), ("Tape & Reel (TR)", Packaging.TAPE_REEL), ("Digi-Reel®", Packaging.CUSTOM_REEL),
                                ("MouseReel", Packaging.CUSTOM_REEL), ("Full Reel", Packaging.TAPE_REEL), ("Tube", Packaging.TUBE),
                                ("Bag", Packaging.BULK), ("Ammo Pack", Packaging.UNKNOWN), ("", Packaging.UNKNOWN), ("1000", Packaging.UNKNOWN)):
            self.assertEqual(normalise.packaging_word(text), packaging, text)

    def test_links_are_made_absolute_and_anything_else_dropped(self) -> None:
        self.assertEqual(normalise.link("//mm.digikey.com/a.pdf"), "https://mm.digikey.com/a.pdf")
        self.assertEqual(normalise.link(" https://x.example/a "), "https://x.example/a")
        self.assertEqual(normalise.link("javascript:void(0)"), "")
        self.assertEqual(normalise.link(None), "")


if __name__ == "__main__":
    unittest.main()
