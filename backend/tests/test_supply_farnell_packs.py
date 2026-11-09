"""Farnell sells some parts in packs and prices the pack: the Seiko MS621FE-FL11E coin cell, recorded 2026-10-17."""

from __future__ import annotations

import sys
import unittest
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.supply.providers import unrecognised  # noqa: E402
from test_supply_digikey_farnell import fa_provider  # noqa: E402
from test_supply_recorded_answers import Replay  # noqa: E402


class FarnellPackTests(unittest.TestCase):
    def setUp(self) -> None:
        unrecognised._seen.clear()
        client = Replay("farnell_live_ms621fe_fl11e.json")
        provider = fa_provider(client, store="it.farnell.com", currency="EUR")
        matches = provider.lookup_mpn("MS621FE-FL11E")
        self.offers = {o.sku: o for o in provider.get_offers([m.sku for m in matches])}

    def test_a_pack_is_priced_by_the_piece(self) -> None:
        pack = self.offers["4628014"]
        self.assertEqual(pack.order_multiple, 1000)
        self.assertEqual(pack.moq, 1000)
        self.assertEqual(pack.price_breaks[0].quantity, 1000)
        self.assertEqual(pack.price_breaks[0].unit_price, Decimal("1.476"))

    def test_a_single_cell_keeps_its_own_figures(self) -> None:
        single = self.offers["1614634"]
        self.assertEqual((single.order_multiple, single.moq), (1, 1))
        self.assertEqual(single.price_breaks[0].unit_price, Decimal("5.47"))
        self.assertEqual(single.price_breaks[-1].quantity, 100)

    def test_nothing_unknown_was_logged(self) -> None:
        self.assertEqual(dict(unrecognised._seen), {})


if __name__ == "__main__":
    unittest.main()
