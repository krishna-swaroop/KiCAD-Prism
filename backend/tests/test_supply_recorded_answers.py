"""The adapters against what DigiKey, Mouser and Farnell really answered for LM358DR (recorded 2026-10-14).

The answers were recorded by ``scripts/record_supply_answer.py`` and are replayed in order. The checks are about
shape and meaning, not the figures, which change daily. Nothing here may log an unrecognised value: that is how a
wording the adapters do not know yet shows up.
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.supply.providers import unrecognised  # noqa: E402
from app.services.supply.providers.base import PartMatch  # noqa: E402
from app.services.supply.vocabulary import Lifecycle, Packaging  # noqa: E402
from test_supply_digikey_farnell import dk_provider, fa_provider  # noqa: E402
from test_supply_distributors import mouser_provider  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "supply"


class Replay:
    """Answers each call with the next recorded answer for the same method and path."""

    def __init__(self, name: str) -> None:
        recorded = json.loads((FIXTURES / name).read_text(encoding="utf-8"))["calls"]
        self.queues: dict[tuple[str, str], list] = {}
        for call in recorded:
            self.queues.setdefault((call["method"], call["path"]), []).append(call["answer"])
        self.calls: list[tuple[str, str, dict]] = []

    def request_json(self, method, url, **kwargs):
        path = urlsplit(url).path
        self.calls.append((method, path, kwargs.get("params") or {}))
        if "oauth2/token" in path:  # token answers are never recorded
            return {"access_token": "token", "token_type": "Bearer", "expires_in": 599}
        queue = self.queues.get((method, path)) or []
        if not queue:
            raise AssertionError(f"no recorded answer left for {method} {path}")
        return queue.pop(0) if len(queue) > 1 else queue[0]


class RecordedAnswerTests(unittest.TestCase):
    def setUp(self) -> None:
        unrecognised._seen.clear()

    def tearDown(self) -> None:
        self.assertEqual(dict(unrecognised._seen), {}, "a value the adapters do not know was logged")

    def check_offers(self, offers, provider: str) -> None:
        self.assertTrue(offers)
        for offer in offers:
            self.assertEqual(offer.provider, provider)
            self.assertGreaterEqual(offer.stock, 0)
            self.assertIsInstance(offer.packaging, Packaging)
            self.assertIsInstance(offer.lifecycle, Lifecycle)
            if offer.price_breaks:
                self.assertTrue(offer.currency)
                quantities = [item.quantity for item in offer.price_breaks]
                self.assertEqual(quantities, sorted(quantities))
                self.assertTrue(all(item.unit_price > 0 for item in offer.price_breaks))

    def test_digikey(self) -> None:
        client = Replay("digikey_live_calls_lm358dr.json")
        provider = dk_provider(client)
        matches = provider.lookup_mpn("LM358DR", "Texas Instruments")
        self.assertTrue(matches)
        self.assertTrue(all(m.mpn.upper().startswith("LM358DR") and m.sku for m in matches))
        offers = provider.get_offers([matches[0].sku])
        self.check_offers(offers, "digikey")
        self.assertTrue(all(o.product_url.startswith("https://") for o in offers))
        data = provider.get_part_data(matches[0])
        self.assertTrue(data.datasheet_url.startswith("https://"))

    def test_mouser(self) -> None:
        client = Replay("mouser_live_calls_lm358dr.json")
        provider = mouser_provider(client)
        matches = provider.lookup_mpn("LM358DR", "Texas Instruments")
        self.assertTrue(matches)
        offers = provider.get_offers([matches[0].sku])
        self.check_offers(offers, "mouser")
        # Mouser lists no REACH-SVHC entry for this part: nothing is stated, which is not "none listed".
        self.assertTrue(all(offer.substances is None for offer in offers))

    def test_farnell(self) -> None:
        client = Replay("farnell_live_calls_lm358dr.json")
        provider = fa_provider(client, store="il.farnell.com", currency="EUR")
        matches = provider.lookup_mpn("LM358DR")
        self.assertTrue(matches)
        offers = provider.get_offers([match.sku for match in matches])
        self.check_offers(offers, "farnell")
        self.assertTrue(all("il.farnell.com/search?st=" in o.product_url for o in offers))
        data = provider.get_part_data(PartMatch("farnell", matches[0].sku, matches[0].mpn, matches[0].manufacturer))
        self.assertTrue(data.datasheet_url == "" or data.datasheet_url.startswith("https://"))


if __name__ == "__main__":
    unittest.main()
