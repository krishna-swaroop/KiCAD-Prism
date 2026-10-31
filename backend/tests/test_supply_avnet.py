"""The Avnet adapter.

The answers are shaped by the operation definition from the Avnet API portal (getPriceAndQty). They were not
recorded from the live service: no approved subscription was available. Replace them with recorded answers as
soon as one is.
"""

from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.supply.providers import avnet, registry, unrecognised  # noqa: E402
from app.services.supply.providers.base import AuthError, ProviderConfig, RateLimited, Unavailable  # noqa: E402
from app.services.supply.vocabulary import Lifecycle, Packaging  # noqa: E402
from test_supply_distributors import FakeClient  # noqa: E402

NOW = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)
TOKEN = {"access_token": "tok", "token_type": "Bearer", "expires_in": 3599}
CREDENTIALS = {"client_id": "cid", "client_secret": "sec", "scope": "api://x/.default", "subscription_key": "SUB"}
TOKEN_PATH = "/external/getToken/oauth2/v2.0/token"
PRICE_PATH = "/external/getPriceAndQuantity/"


def provider(client, *, currency="", credentials=None, monotonic=None):
    config = ProviderConfig(connector_id="c1", currency=currency, credentials=CREDENTIALS if credentials is None else credentials)
    return avnet.AvnetProvider(config, client=client, clock=lambda: NOW, monotonic=monotonic or (lambda: 0.0), sleep=lambda _s: None)


def line(asked="CR0402-FX-1003GLF", **over):
    row = {
        "ORIGINAL_LINE": 1, "PART_NUMBER": asked, "DEMAND_QTY": 1, "PART_NUMBER_OUT": asked, "MANUFACTURER_NAME_OUT": "BOURNS",
        "DEMAND_QTY_OUT": 1, "FREE_STOCK": 25000, "MIN_ORDER_QTY": 100, "PACKAGE_TYPE": "Tape & Reel", "PACK_SIZE": 10000,
        "MATERIAL_STATUS": "Active", "ROHSL": "RoHS Compliant", "MARKET_PRICE": 0.0123, "CURRENCY_OUT": "EUR", "LEAD_TIME": 70,
        "ECCN_NUMBER": "EAR99", "EOL_PCN": "", "PART_NUMBER_DESC": "RES 100K 1% 0402", "ERROR": "",
    }
    return row | over


class AvnetTests(unittest.TestCase):
    def setUp(self) -> None:
        unrecognised._seen.clear()

    def test_it_is_registered_with_the_four_credentials_it_needs(self) -> None:
        spec = registry.get_spec("avnet")
        self.assertEqual(spec.required_credentials, ("client_id", "client_secret", "scope", "subscription_key"))
        self.assertEqual((spec.max_batch, spec.search_batch), (avnet.MAX_LINES, avnet.MAX_LINES))
        self.assertEqual([f.secret for f in spec.credential_fields], [False, True, False, True])

    def test_a_search_sends_the_subscription_key_and_a_bearer_token_and_finds_the_part(self) -> None:
        client = FakeClient({TOKEN_PATH: [TOKEN], PRICE_PATH: [[line()]]})
        (match,) = provider(client).lookup_mpn("CR0402-FX-1003GLF", "Vishay")
        self.assertEqual((match.sku, match.mpn, match.manufacturer, match.description), ("CR0402-FX-1003GLF", "CR0402-FX-1003GLF", "BOURNS", "RES 100K 1% 0402"))
        token_call, call = client.calls
        self.assertEqual(token_call["form"], {"grant_type": "client_credentials", "client_id": "cid", "client_secret": "sec", "scope": "api://x/.default"})
        self.assertEqual(call["headers"], {"Authorization": "Bearer tok", "Ocp-Apim-Subscription-Key": "SUB"})
        self.assertEqual(call["json"], [{"PART_NUMBER": "CR0402-FX-1003GLF", "DEMAND_QTY": 1, "MAX_RESULT": 3}], "no manufacturer is sent")

    def test_several_numbers_go_in_one_call_and_unaskable_ones_are_left_out(self) -> None:
        client = FakeClient({TOKEN_PATH: [TOKEN], PRICE_PATH: [[line("LM358DR"), line("NE555P", MANUFACTURER_NAME_OUT="TI")]]})
        found = provider(client, currency="EUR").lookup_mpns(["LM358DR", "NE555P", "R1", "AB*CD", "NOPE-1234"])
        self.assertEqual({key: [m.sku for m in matches] for key, matches in found.items()}, {"LM358DR": ["LM358DR"], "NE555P": ["NE555P"], "R1": [], "AB*CD": [], "NOPE1234": []})
        self.assertEqual(len(client.calls), 2, "the token and one search")
        sent = [item["PART_NUMBER"] for item in client.calls[1]["json"]]
        self.assertEqual(sent, ["LM358DR", "NE555P", "NOPE-1234"], "under four characters and wildcards are never sent")
        self.assertEqual(client.calls[1]["json"][0]["CURRENCY"], "EUR")

    def test_a_line_for_another_part_is_not_a_match(self) -> None:
        client = FakeClient({TOKEN_PATH: [TOKEN], PRICE_PATH: [[line("LM358DR", PART_NUMBER_OUT="LM358DRG4")]]})
        self.assertEqual(provider(client).lookup_mpn("LM358DR"), [])

    def test_an_offer_carries_stock_one_price_packaging_lead_time_and_facts(self) -> None:
        client = FakeClient({TOKEN_PATH: [TOKEN], PRICE_PATH: [[line(DEMAND_QTY_OUT=100)]]})
        (offer,) = provider(client).get_offers(["CR0402-FX-1003GLF"])
        self.assertEqual((offer.sku, offer.stock, offer.moq, offer.packaging, offer.currency), ("CR0402-FX-1003GLF", 25000, 100, Packaging.TAPE_REEL, "EUR"))
        self.assertEqual([(b.quantity, b.unit_price) for b in offer.price_breaks], [(100, Decimal("0.0123"))])
        self.assertEqual(offer.price_up_to, 100, "the quote holds for the quantity asked, not beyond")
        self.assertEqual((offer.lifecycle, offer.rohs, offer.order_multiple), (Lifecycle.ACTIVE, True, 1))
        self.assertIsNone(offer.lead_time_days, "stock covers the minimum order")
        self.assertEqual(dict(offer.facts), {"rohs_status": "RoHS Compliant", "eccn": "EAR99"})

    def test_lead_time_shows_only_without_enough_stock_and_an_unnamed_currency_gives_no_price(self) -> None:
        client = FakeClient({TOKEN_PATH: [TOKEN], PRICE_PATH: [[line(FREE_STOCK=0, CURRENCY_OUT="")]]})
        (offer,) = provider(client).get_offers(["CR0402-FX-1003GLF"])
        self.assertEqual((offer.stock, offer.lead_time_days, offer.price_breaks, offer.currency), (0, 70, (), ""))

    def test_offers_are_read_back_under_the_sku_that_was_asked(self) -> None:
        client = FakeClient({TOKEN_PATH: [TOKEN], PRICE_PATH: [[line("cr0402-fx-1003glf", PART_NUMBER="CR0402-FX-1003GLF")]]})
        (offer,) = provider(client).get_offers(["CR0402-FX-1003GLF"])
        self.assertEqual(offer.sku, "CR0402-FX-1003GLF")

    def test_a_part_obsolete_with_a_replacement_is_last_time_buy_and_names_the_replacement(self) -> None:
        client = FakeClient({TOKEN_PATH: [TOKEN], PRICE_PATH: [[line(ERROR="036", MESSAGE="Product is OBSO or LTB and replacement part is XYZ-9", FREE_STOCK=0)]]})
        (offer,) = provider(client).get_offers(["CR0402-FX-1003GLF"])
        self.assertEqual(offer.lifecycle, Lifecycle.LAST_TIME_BUY)
        self.assertEqual(dict(offer.facts)["suggested_replacement"], "Product is OBSO or LTB and replacement part is XYZ-9")

    def test_material_statuses_are_read_and_unknown_ones_are_noted(self) -> None:
        for status, expected in (("Obsolete", Lifecycle.OBSOLETE), ("Inactive", Lifecycle.OBSOLETE), ("Not Active", Lifecycle.OBSOLETE), ("LTB", Lifecycle.LAST_TIME_BUY), ("NRND", Lifecycle.NRND), ("Active", Lifecycle.ACTIVE), ("Z9", Lifecycle.UNKNOWN), ("", Lifecycle.UNKNOWN)):
            client = FakeClient({TOKEN_PATH: [TOKEN], PRICE_PATH: [[line(MATERIAL_STATUS=status)]]})
            (offer,) = provider(client).get_offers(["CR0402-FX-1003GLF"])
            self.assertEqual(offer.lifecycle, expected, status)

    def test_error_numbers_mean_what_the_definition_says(self) -> None:
        cases = (("002", AuthError), ("003", RateLimited), ("040", RateLimited), ("041", Unavailable))
        for code, error in cases:
            client = FakeClient({TOKEN_PATH: [TOKEN], PRICE_PATH: [[line(ERROR=code, PART_NUMBER_OUT="")]]})
            with self.assertRaises(error, msg=code):
                provider(client).get_offers(["CR0402-FX-1003GLF"])
        client = FakeClient({TOKEN_PATH: [TOKEN], PRICE_PATH: [[line(ERROR="005", PART_NUMBER_OUT="")]]})
        self.assertEqual(provider(client).get_offers(["CR0402-FX-1003GLF"]), [], "no such material: nothing, not an error")

    def test_a_refused_token_is_renewed_once_and_then_the_refusal_stands(self) -> None:
        client = FakeClient({TOKEN_PATH: [TOKEN, TOKEN], PRICE_PATH: [AuthError("401"), [line()]]})
        self.assertEqual(len(provider(client).get_offers(["CR0402-FX-1003GLF"])), 1)
        self.assertEqual(len([c for c in client.calls if c["path"] == TOKEN_PATH]), 2)
        client = FakeClient({TOKEN_PATH: [TOKEN, TOKEN], PRICE_PATH: [AuthError("401"), AuthError("401")]})
        with self.assertRaises(AuthError):
            provider(client).get_offers(["CR0402-FX-1003GLF"])

    def test_the_token_is_kept_until_it_runs_out(self) -> None:
        now = [0.0]
        client = FakeClient({TOKEN_PATH: [TOKEN, TOKEN], PRICE_PATH: [[line()], [line()], [line()]]})
        reader = provider(client, monotonic=lambda: now[0])
        reader.get_offers(["CR0402-FX-1003GLF"])
        now[0] = 100.0
        reader.get_offers(["CR0402-FX-1003GLF"])
        self.assertEqual(len([c for c in client.calls if c["path"] == TOKEN_PATH]), 1)
        now[0] = 4000.0
        reader.get_offers(["CR0402-FX-1003GLF"])
        self.assertEqual(len([c for c in client.calls if c["path"] == TOKEN_PATH]), 2)

    def test_missing_credentials_are_an_auth_error_before_any_call(self) -> None:
        client = FakeClient({})
        with self.assertRaises(AuthError):
            provider(client, credentials={"client_id": "cid"}).lookup_mpn("LM358DR")
        self.assertEqual(client.calls, [])

    def test_rohs_wording_is_read_plainly(self) -> None:
        for text, expected in (("RoHS Compliant", True), ("Compliant with exemption", True), ("Non-compliant", False), ("N", False), ("", None), ("Whatever", None)):
            client = FakeClient({TOKEN_PATH: [TOKEN], PRICE_PATH: [[line(ROHSL=text)]]})
            (offer,) = provider(client).get_offers(["CR0402-FX-1003GLF"])
            self.assertEqual(offer.rohs, expected, text)


if __name__ == "__main__":
    unittest.main()
