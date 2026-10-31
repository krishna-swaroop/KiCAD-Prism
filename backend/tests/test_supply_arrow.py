"""The Arrow adapter.

The answers are shaped by Arrow's documentation (Search By List v4 and Search By Token v4). They were not recorded from the
live service: no key was available. Replace them with recorded answers as soon as one is.
"""

from __future__ import annotations

import json
import sys
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.supply.providers import arrow, registry, unrecognised  # noqa: E402
from app.services.supply.providers.base import AuthError, ProviderConfig, ProviderError, RateLimited  # noqa: E402
from app.services.supply.vocabulary import Lifecycle, Packaging  # noqa: E402
from test_supply_distributors import FakeClient  # noqa: E402

NOW = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)
CREDENTIALS = {"login": "me", "api_key": "KEY", "remote_ip": "203.0.113.5"}
PATH = "/itemservice/v4/en/search/list"


def provider(client, *, storefront="", credentials=None):
    config = ProviderConfig(connector_id="c1", storefront=storefront, credentials=CREDENTIALS if credentials is None else credentials)
    return arrow.ArrowProvider(config, client=client, clock=lambda: NOW, monotonic=lambda: 0.0, sleep=lambda _s: None)


def source_part(identifier="V72:1", **over):
    part = {
        "packSize": 3000, "minimumOrderQuantity": 3000, "sourcePartId": identifier,
        "Prices": {"resaleList": [
            {"displayPrice": "$0.0990", "price": 0.099, "minQty": 3000, "maxQty": 5999},
            {"displayPrice": "$0.0800", "price": 0.08, "minQty": 6000, "maxQty": 9999999, "vipPrice": 0.05},
        ]},
        "Availability": [{"fohQty": 12000, "availabilityCd": "INSTK", "availabilityMessage": "In Stock", "pipeline": []}],
        "inStock": True, "mfrLeadTime": 12, "arrowLeadTime": 8, "isNcnr": False, "isNpi": False, "isASA": False,
        "eccnCode": "EAR99", "htsCode": "8541100080", "containerType": "Reel", "resources": [{"type": "detail", "uri": "https://arrow.example/line"}],
    }
    return part | over


def source(code="ACNA", currency="USD", parts=None):
    return {"currency": currency, "sourceCd": code, "displayName": code.title(), "sourceParts": parts if parts is not None else [source_part()]}


def item(number="BAV99", sources=None, **over):
    row = {
        "itemId": 1, "partNum": number, "manufacturer": {"mfrCd": "NXP", "mfrName": "Nexperia"}, "desc": "DIODE ARRAY", "packageType": "SOT-23",
        "resources": [{"type": "part_detail", "uri": "https://www.arrow.com/en/products/bav99/nexperia"}, {"type": "api_part_detail", "uri": "http://api/x"}],
        "EnvData": {"compliance": [{"displayLabel": "eurohs", "displayValue": "Compliant"}, {"displayLabel": "cnrohs", "displayValue": "Unknown"}]},
        "InvOrg": {"webSites": [{"code": "arrow.com", "name": "Arrow", "sources": sources if sources is not None else [source()]}]},
        "hasDatasheet": True, "categoryName": "Diodes", "status": "Active",
    }
    return row | over


def answer(*items, success=True, message="", code=0):
    return {"itemserviceresult": {
        "serviceMetaData": [{"version": "4.0.0"}],
        "transactionArea": [{"response": {"returnCode": code, "returnMsg": message, "success": success}, "responseSequence": {"totalItems": len(items)}}],
        "data": [{"resources": [], "PartList": list(items)}],
    }}


class ArrowTests(unittest.TestCase):
    def setUp(self) -> None:
        unrecognised._seen.clear()

    def test_it_is_registered_with_three_credentials_and_the_regions(self) -> None:
        spec = registry.get_spec("arrow")
        self.assertEqual(spec.required_credentials, ("login", "api_key", "remote_ip"))
        self.assertEqual([f.secret for f in spec.credential_fields], [False, True, False])
        self.assertEqual((spec.max_batch, spec.search_batch, spec.groups_by_part, spec.stock_pooling), (100, 100, True, "separate"))
        self.assertEqual(spec.storefronts[0], "ALL")

    def test_a_search_sends_the_documented_request_and_makes_a_match_per_line(self) -> None:
        two = source("ACNA", parts=[source_part("V72:1"), source_part("V72:2", containerType="Cut Tape", minimumOrderQuantity=1, packSize=1)])
        client = FakeClient({PATH: [answer(item(sources=[two, source("EUROPE", "EUR", [source_part("V36:9")])]))]})
        matches = provider(client).lookup_mpn("BAV99", "NXP")
        self.assertEqual([m.sku for m in matches], ["BAV99|V72:1", "BAV99|V72:2", "BAV99|V36:9"])
        match = matches[0]
        self.assertEqual((match.mpn, match.manufacturer, match.description, match.product_url), ("BAV99", "Nexperia", "DIODE ARRAY", "https://www.arrow.com/en/products/bav99/nexperia"))
        self.assertEqual(match.parameters, (("Package / Case", "SOT-23"),))
        (call,) = client.calls
        sent = json.loads(call["params"]["req"])["request"]
        self.assertEqual(sent, {"login": "me", "apikey": "KEY", "remoteIp": "203.0.113.5", "useExact": True, "parts": [{"partNum": "BAV99"}]})
        self.assertEqual((call["method"], call["params"]["rows"]), ("GET", "25"), "no manufacturer is sent as a filter")

    def test_a_storefront_keeps_only_its_region(self) -> None:
        sources = [source("ACNA", parts=[source_part("A")]), source("EUROPE", "EUR", [source_part("E")])]
        client = FakeClient({PATH: [answer(item(sources=sources))]})
        self.assertEqual([m.sku for m in provider(client, storefront="EUROPE").lookup_mpn("BAV99")], ["BAV99|E"])
        client = FakeClient({PATH: [answer(item(sources=sources))]})
        self.assertEqual(len(provider(client, storefront="ALL").lookup_mpn("BAV99")), 2)

    def test_a_number_that_was_not_asked_for_is_not_a_match(self) -> None:
        client = FakeClient({PATH: [answer(item("BAV99W"))]})
        self.assertEqual(provider(client).lookup_mpn("BAV99"), [])

    def test_several_numbers_go_in_one_call_and_wildcards_are_never_sent(self) -> None:
        client = FakeClient({PATH: [answer(item("LM358DR"), item("NE555P"))]})
        found = provider(client).lookup_mpns(["LM358DR", "NE555P", "AB*CD", "NOPE-1"])
        self.assertEqual({key: len(matches) for key, matches in found.items()}, {"LM358DR": 1, "NE555P": 1, "AB*CD": 0, "NOPE1": 0})
        self.assertEqual([p["partNum"] for p in json.loads(client.calls[0]["params"]["req"])["request"]["parts"]], ["LM358DR", "NE555P", "NOPE-1"])
        self.assertEqual(len(client.calls), 1)

    def test_more_than_a_hundred_numbers_are_split_into_calls(self) -> None:
        numbers = [f"PART{n:03d}" for n in range(150)]
        client = FakeClient({PATH: [answer(), answer()]})
        provider(client).lookup_mpns(numbers)
        self.assertEqual([len(json.loads(c["params"]["req"])["request"]["parts"]) for c in client.calls], [100, 50])

    def test_an_offer_carries_stock_prices_in_the_source_currency_packaging_and_facts(self) -> None:
        client = FakeClient({PATH: [answer(item())]})
        (offer,) = provider(client).get_offers(["BAV99|V72:1"])
        self.assertEqual((offer.sku, offer.stock, offer.moq, offer.order_multiple, offer.currency), ("BAV99|V72:1", 12000, 3000, 3000, "USD"))
        self.assertEqual([(b.quantity, b.unit_price) for b in offer.price_breaks], [(3000, Decimal("0.099")), (6000, Decimal("0.08"))], "vipPrice is never read")
        self.assertEqual((offer.packaging, offer.reel_size, offer.packaging_inferred), (Packaging.TAPE_REEL, 3000, False))
        self.assertEqual((offer.lifecycle, offer.rohs, offer.marketplace), (Lifecycle.ACTIVE, True, False))
        self.assertIsNone(offer.lead_time_days, "stock covers the minimum order")
        self.assertEqual(offer.product_url, "https://www.arrow.com/en/products/bav99/nexperia")
        self.assertEqual(dict(offer.facts), {"rohs_status": "Compliant", "eccn": "EAR99", "hts_us": "8541100080", "category": "Diodes", "ncnr": "No", "mfr_lead_weeks": "12"})

    def test_each_source_keeps_its_own_currency(self) -> None:
        sources = [source("ACNA", "USD", [source_part("A")]), source("EUROPE", "EUR", [source_part("E")]), source("ASIA", "xx", [source_part("X")])]
        client = FakeClient({PATH: [answer(item(sources=sources))]})
        offers = {o.sku: o for o in provider(client).get_offers(["BAV99|A", "BAV99|E", "BAV99|X"])}
        self.assertEqual((offers["BAV99|A"].currency, offers["BAV99|E"].currency), ("USD", "EUR"))
        self.assertEqual((offers["BAV99|X"].currency, offers["BAV99|X"].price_breaks), ("", ()), "an unreadable currency gives no price")
        self.assertNotIn("utm_currency", client.calls[0]["params"], "Arrow never converts")

    def test_price_breaks_are_ascending_unique_and_skip_what_is_not_a_price(self) -> None:
        resale = [
            {"price": 0.5, "minQty": 100}, {"price": 0.9, "minQty": 1}, {"price": 0.45, "minQty": 100}, {"price": 0, "minQty": 5000},
            {"price": "n/a", "minQty": 7}, {"price": 0.3, "minQty": 1000},
        ]
        client = FakeClient({PATH: [answer(item(sources=[source(parts=[source_part(Prices={"resaleList": resale}, minimumOrderQuantity=1, packSize=1)])]))]})
        (offer,) = provider(client).get_offers(["BAV99|V72:1"])
        self.assertEqual([(b.quantity, b.unit_price) for b in offer.price_breaks], [(1, Decimal("0.9")), (100, Decimal("0.5")), (1000, Decimal("0.3"))])

    def test_the_order_multiple_is_the_pack_only_when_the_minimum_is_whole_packs(self) -> None:
        cases = (
            (dict(minimumOrderQuantity=3000, packSize=3000), (3000, 3000)),
            (dict(minimumOrderQuantity=1, packSize=3000), (1, 1)),
            (dict(minimumOrderQuantity=100, packSize=25), (100, 25)),
            (dict(minimumOrderQuantity=110, packSize=25), (110, 1)),
            (dict(minimumOrderQuantity=None, packSize=None), (1, 1)),
        )
        for over, expected in cases:
            client = FakeClient({PATH: [answer(item(sources=[source(parts=[source_part(**over)])]))]})
            (offer,) = provider(client).get_offers(["BAV99|V72:1"])
            self.assertEqual((offer.moq, offer.order_multiple), expected, over)

    def test_stock_is_summed_and_zero_when_arrow_says_it_is_not_in_stock(self) -> None:
        part = source_part(Availability=[{"fohQty": 500, "pipeline": []}, {"fohQty": 250, "pipeline": []}])
        client = FakeClient({PATH: [answer(item(sources=[source(parts=[part])]))]})
        self.assertEqual(provider(client).get_offers(["BAV99|V72:1"])[0].stock, 750)
        client = FakeClient({PATH: [answer(item(sources=[source(parts=[source_part(inStock=False)])]))]})
        self.assertEqual(provider(client).get_offers(["BAV99|V72:1"])[0].stock, 0)

    def test_lead_time_counts_only_without_enough_stock_and_falls_back_to_arrows_own(self) -> None:
        empty = dict(Availability=[{"fohQty": 0, "pipeline": []}])
        for over, expected in ((dict(empty), 84), (dict(empty, mfrLeadTime=None), 56), (dict(empty, mfrLeadTime=None, arrowLeadTime=None), None)):
            client = FakeClient({PATH: [answer(item(sources=[source(parts=[source_part(**over)])]))]})
            self.assertEqual(provider(client).get_offers(["BAV99|V72:1"])[0].lead_time_days, expected, over)

    def test_the_pipeline_is_incoming_stock_with_its_dates(self) -> None:
        pipeline = [{"qty": 6881, "date": "2026-11-03T00:00:00Z"}, {"quantity": "3,119", "deliveryDate": "2027-02-08"}, {"qty": 40, "date": "soon"}, {"what": 1}]
        part = source_part(Availability=[{"fohQty": 0, "pipeline": pipeline}])
        client = FakeClient({PATH: [answer(item(sources=[source(parts=[part])]))]})
        (offer,) = provider(client).get_offers(["BAV99|V72:1"])
        self.assertEqual([(i.quantity, i.expected) for i in offer.incoming], [(6881, date(2026, 11, 3)), (3119, date(2027, 2, 8)), (40, None)])

    def test_lifecycle_wording_is_read_and_unknown_words_stay_unknown(self) -> None:
        cases = (("Active", Lifecycle.ACTIVE), ("NRND", Lifecycle.NRND), ("Not Recommended for New Designs", Lifecycle.NRND), ("Last Time Buy", Lifecycle.LAST_TIME_BUY),
                 ("Obsolete", Lifecycle.OBSOLETE), ("EOL", Lifecycle.OBSOLETE), ("End of Production", Lifecycle.OBSOLETE), ("Not in Production", Lifecycle.OBSOLETE),
                 ("In Production", Lifecycle.ACTIVE), ("Z9", Lifecycle.UNKNOWN), ("", Lifecycle.UNKNOWN))
        for status, expected in cases:
            client = FakeClient({PATH: [answer(item(status=status))]})
            self.assertEqual(provider(client).get_offers(["BAV99|V72:1"])[0].lifecycle, expected, status)

    def test_supply_assurance_means_obsolete_only_when_the_status_says_nothing_firmer(self) -> None:
        part = source_part(isASA=True)
        client = FakeClient({PATH: [answer(item(status="", sources=[source(parts=[part])]))]})
        self.assertEqual(provider(client).get_offers(["BAV99|V72:1"])[0].lifecycle, Lifecycle.OBSOLETE)
        client = FakeClient({PATH: [answer(item(status="NRND", sources=[source(parts=[part])]))]})
        self.assertEqual(provider(client).get_offers(["BAV99|V72:1"])[0].lifecycle, Lifecycle.NRND)

    def test_rohs_follows_the_european_label_and_unknown_is_not_compliant(self) -> None:
        for value, expected in (("Compliant", True), ("Non Compliant", False), ("Unknown", None)):
            env = {"compliance": [{"displayLabel": "eurohs", "displayValue": value}]}
            client = FakeClient({PATH: [answer(item(EnvData=env))]})
            self.assertEqual(provider(client).get_offers(["BAV99|V72:1"])[0].rohs, expected, value)
        client = FakeClient({PATH: [answer(item(EnvData={"compliance": [{"displayLabel": "cnrohs", "displayValue": "Compliant"}]}))]})
        self.assertIsNone(provider(client).get_offers(["BAV99|V72:1"])[0].rohs, "only the European label counts")

    def test_the_stated_container_is_used_and_a_missing_one_is_read_from_the_order_terms(self) -> None:
        stated = (("Reel", Packaging.TAPE_REEL), ("Cut Tape", Packaging.CUT_TAPE), ("Tray", Packaging.TRAY), ("Tube", Packaging.TUBE), ("Bag", Packaging.BULK))
        for text, expected in stated:
            client = FakeClient({PATH: [answer(item(sources=[source(parts=[source_part(containerType=text)])]))]})
            offer = provider(client).get_offers(["BAV99|V72:1"])[0]
            self.assertEqual((offer.packaging, offer.packaging_inferred), (expected, False), text)
        client = FakeClient({PATH: [answer(item(sources=[source(parts=[source_part(containerType="")])]))]})
        offer = provider(client).get_offers(["BAV99|V72:1"])[0]
        self.assertEqual((offer.packaging, offer.reel_size, offer.packaging_inferred), (Packaging.TAPE_REEL, 3000, True), "a whole reel ordered in that multiple")
        client = FakeClient({PATH: [answer(item(sources=[source(parts=[source_part(containerType="", minimumOrderQuantity=5, packSize=5)])]))]})
        offer = provider(client).get_offers(["BAV99|V72:1"])[0]
        self.assertEqual((offer.packaging, offer.packaging_inferred), (Packaging.UNKNOWN, False), "nothing is guessed from a small order")

    def test_an_unknown_container_word_is_noted_and_is_other(self) -> None:
        client = FakeClient({PATH: [answer(item(sources=[source(parts=[source_part(containerType="Foil wrap")])]))]})
        with self.assertLogs("app.services.supply.providers.unrecognised", level="WARNING"):
            offer = provider(client).get_offers(["BAV99|V72:1"])[0]
        self.assertEqual(offer.packaging, Packaging.OTHER)

    def test_offers_for_several_lines_of_one_part_cost_one_call(self) -> None:
        parts = [source_part("A"), source_part("B", containerType="Cut Tape", minimumOrderQuantity=1, packSize=1)]
        client = FakeClient({PATH: [answer(item(sources=[source(parts=parts)]))]})
        reader = provider(client)
        offers = reader.get_offers(["BAV99|A", "BAV99|B"])
        self.assertEqual(sorted(o.sku for o in offers), ["BAV99|A", "BAV99|B"])
        self.assertEqual((len(client.calls), reader.calls), (1, 1))

    def test_a_line_that_is_gone_is_left_out(self) -> None:
        client = FakeClient({PATH: [answer(item())]})
        self.assertEqual(provider(client).get_offers(["BAV99|NOPE", "no-separator"]), [])

    def test_a_refused_request_is_told_by_the_success_flag_not_the_http_status(self) -> None:
        cases = (("Invalid login or API key", AuthError), ("Request limit exceeded", RateLimited), ("Malformed request", ProviderError))
        for message, error in cases:
            client = FakeClient({PATH: [answer(success=False, message=message, code=12)]})
            with self.assertRaises(error, msg=message):
                provider(client).lookup_mpn("BAV99")

    def test_no_parts_is_not_an_error_and_the_key_is_never_in_an_error_text(self) -> None:
        client = FakeClient({PATH: [answer()]})
        self.assertEqual(provider(client).lookup_mpn("BAV99"), [])
        client = FakeClient({PATH: [answer(success=False, message="boom KEY", code=7)]})
        with self.assertRaises(ProviderError) as caught:
            provider(client).lookup_mpn("BAV99")
        self.assertNotIn("KEY", str(caught.exception))

    def test_missing_credentials_are_an_auth_error_before_any_call(self) -> None:
        client = FakeClient({})
        with self.assertRaises(AuthError):
            provider(client, credentials={"login": "me", "api_key": "", "remote_ip": ""}).lookup_mpn("BAV99")
        self.assertEqual(client.calls, [])

    def test_the_search_answer_already_describes_the_part(self) -> None:
        client = FakeClient({PATH: [answer(item())]})
        reader = provider(client)
        (match, *_rest) = reader.lookup_mpn("BAV99")
        data = reader.get_part_data(match)
        self.assertEqual(data.description, "DIODE ARRAY")
        self.assertEqual(len(client.calls), 1)


if __name__ == "__main__":
    unittest.main()
