"""DigiKey and Farnell adapters.

The answers here are shaped by the providers' published descriptions (DigiKey's Swagger file, element14's
REST description). They were not recorded from the live services: no key was available. Replace them with
recorded answers, as was done for TME and Mouser, as soon as one is.
"""

from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.supply.providers import digikey, farnell, mouser, registry, unrecognised  # noqa: E402
from app.services.supply.providers.base import AuthError, NotFound, ProviderConfig, ProviderError, RateLimited  # noqa: E402
from app.services.supply.vocabulary import Lifecycle, Packaging  # noqa: E402
from test_supply_distributors import FakeClient  # noqa: E402

NOW = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)
TOKEN = {"access_token": "tok", "token_type": "Bearer", "expires_in": 599}
DETAILS = "/products/v4/search/{}/productdetails"


def dk_provider(client, *, site="IT", currency="", credentials=None, monotonic=None):
    config = ProviderConfig(
        connector_id="c1", storefront=site, currency=currency,
        credentials={"client_id": "id", "client_secret": "secret"} if credentials is None else credentials,
    )
    return digikey.DigiKeyProvider(config, client=client, clock=lambda: NOW, monotonic=monotonic or (lambda: 0.0), sleep=lambda _s: None)


def variation(sku="296-1395-1-ND", package="Cut Tape (CT)", stock=5000, moq=1, prices=((1, 0.5), (100, 0.3)), marketplace=False):
    return {
        "DigiKeyProductNumber": sku, "PackageType": {"Id": 1, "Name": package}, "QuantityAvailableforPackageType": stock,
        "MinimumOrderQuantity": moq, "MarketPlace": marketplace,
        "StandardPricing": [{"BreakQuantity": q, "UnitPrice": p, "TotalPrice": q * p} for q, p in prices],
    }


def dk_product(variations=None, *, status="Active", discontinued=False, end_of_life=False, weeks="14", rohs="ROHS3 Compliant"):
    return {
        "Description": {"ProductDescription": "IC OPAMP GP 2 CIRCUIT 8SOIC", "DetailedDescription": "..."},
        "Manufacturer": {"Id": 296, "Name": "Texas Instruments"}, "ManufacturerProductNumber": "LM358DR",
        "ProductUrl": "https://www.digikey.it/it/products/detail/texas-instruments/LM358DR/404606",
        "DatasheetUrl": "https://www.ti.com/lit/ds/symlink/lm358.pdf", "ProductVariations": variations or [variation()],
        "ProductStatus": {"Id": 0, "Status": status}, "Discontinued": discontinued, "EndOfLife": end_of_life,
        "ManufacturerLeadWeeks": weeks, "Classifications": {"RohsStatus": rohs, "ReachStatus": "REACH Unaffected"},
        "Category": {"CategoryId": 685, "Name": "Linear - Amplifiers"},
        "Parameters": [{"ParameterId": 1, "ParameterText": "Number of Circuits", "ValueText": "2"}],
    }


def dk_details(product, currency="EUR"):
    return {"SearchLocaleUsed": {"Site": "IT", "Language": "en", "Currency": currency}, "Product": product}


class DigiKeyTests(unittest.TestCase):
    def setUp(self) -> None:
        unrecognised._seen.clear()

    def test_the_spec(self) -> None:
        spec = registry.get_spec("digikey")
        self.assertEqual((spec.max_batch, spec.stock_pooling, spec.required_credentials), (1, "pooled", ("client_id", "client_secret")))
        self.assertIn("IT", spec.storefronts)

    def test_it_signs_in_once_and_sends_the_locale_and_client_id(self) -> None:
        client = FakeClient({
            "/v1/oauth2/token": [TOKEN],
            "/products/v4/search/keyword": [{"ExactMatches": [], "Products": []}, {"ExactMatches": [], "Products": []}],
        })
        provider = dk_provider(client, site="IT", currency="EUR")
        provider.lookup_mpn("LM358DR")
        provider.lookup_mpn("LM358DR")
        token_call, call = client.calls[0], client.calls[1]
        self.assertEqual(token_call["form"], {"client_id": "id", "client_secret": "secret", "grant_type": "client_credentials"})
        self.assertEqual(call["headers"], {
            "Authorization": "Bearer tok", "X-DIGIKEY-Client-Id": "id",
            "X-DIGIKEY-Locale-Site": "IT", "X-DIGIKEY-Locale-Currency": "EUR",
        })
        self.assertEqual(call["json"], {"Keywords": "LM358DR", "Limit": 10, "Offset": 0})
        self.assertEqual(sum(1 for c in client.calls if c["path"] == "/v1/oauth2/token"), 1, "the token is kept")

    def test_a_rejected_token_is_renewed_once_and_missing_credentials_are_an_auth_error(self) -> None:
        client = FakeClient({
            "/v1/oauth2/token": [TOKEN, {**TOKEN, "access_token": "tok2"}],
            "/products/v4/search/keyword": [AuthError("expired"), {"ExactMatches": [], "Products": []}],
        })
        dk_provider(client).lookup_mpn("LM358DR")
        self.assertEqual(client.calls[-1]["headers"]["Authorization"], "Bearer tok2")
        with self.assertRaises(AuthError):
            dk_provider(FakeClient({}), credentials={}).lookup_mpn("LM358DR")

    def test_each_packaging_of_an_exact_match_is_a_listing(self) -> None:
        product = dk_product([variation("296-1395-1-ND"), variation("296-1395-2-ND", "Tape & Reel (TR)"), variation("296-1395-6-ND", "Digi-Reel®")])
        client = FakeClient({"/v1/oauth2/token": [TOKEN], "/products/v4/search/keyword": [{"ExactMatches": [product], "Products": [dk_product()]}]})
        matches = dk_provider(client).lookup_mpn("lm358dr")
        self.assertEqual([m.sku for m in matches], ["296-1395-1-ND", "296-1395-2-ND", "296-1395-6-ND"])
        self.assertEqual((matches[0].mpn, matches[0].manufacturer), ("LM358DR", "Texas Instruments"))
        self.assertIn("digikey.it", matches[0].product_url)

    def test_without_exact_matches_the_same_number_and_its_longer_forms_are_kept_and_other_numbers_are_not(self) -> None:
        other = dk_product([variation("X-1-ND")]) | {"ManufacturerProductNumber": "LM358DR-EXTRA"}
        client = FakeClient({"/v1/oauth2/token": [TOKEN], "/products/v4/search/keyword": [{"ExactMatches": [], "Products": [other, dk_product()]}]})
        self.assertEqual([m.sku for m in dk_provider(client).lookup_mpn("LM358DR")], ["296-1395-1-ND", "X-1-ND"], "the longer number is kept for review")
        unrelated = dk_product([variation("Y-1-ND")]) | {"ManufacturerProductNumber": "LM358DRABCDEFGHIJ"}
        client = FakeClient({"/v1/oauth2/token": [TOKEN], "/products/v4/search/keyword": [{"ExactMatches": [], "Products": [unrelated, dk_product()]}]})
        self.assertEqual([m.sku for m in dk_provider(client).lookup_mpn("LM358DR")], ["296-1395-1-ND"])

    def test_an_offer_carries_stock_prices_packaging_and_the_currency_the_server_used(self) -> None:
        client = FakeClient({"/v1/oauth2/token": [TOKEN], DETAILS.format("296-1395-1-ND"): [dk_details(dk_product())]})
        (offer,) = dk_provider(client).get_offers(["296-1395-1-ND"])
        self.assertEqual((offer.stock, offer.moq, offer.packaging, offer.currency), (5000, 1, Packaging.CUT_TAPE, "EUR"))
        self.assertEqual([(b.quantity, b.unit_price) for b in offer.price_breaks], [(1, Decimal("0.5")), (100, Decimal("0.3"))])
        self.assertEqual((offer.rohs, offer.marketplace, offer.lifecycle, offer.discontinued), (True, False, Lifecycle.ACTIVE, False))
        self.assertIsNone(offer.lead_time_days, "the factory lead time is hidden while stock covers the minimum order")
        self.assertIn("digikey.it", offer.product_url)

    def test_digikeys_reach_status_is_read_as_affected_unaffected_or_nothing(self) -> None:
        for wording, expected in (("REACH Unaffected", False), ("REACH Affected", True), ("Vendor undefined", None), ("Not applicable", None)):
            product = dk_product()
            product["Classifications"]["ReachStatus"] = wording
            client = FakeClient({"/v1/oauth2/token": [TOKEN], DETAILS.format("296-1395-1-ND"): [dk_details(product)]})
            (offer,) = dk_provider(client).get_offers(["296-1395-1-ND"])
            self.assertEqual(offer.reach_affected, expected, wording)

    def test_the_variation_asked_for_is_the_one_read(self) -> None:
        product = dk_product([variation("A-ND", stock=10), variation("B-ND", "Tape & Reel (TR)", stock=9000, moq=2500)])
        client = FakeClient({"/v1/oauth2/token": [TOKEN], DETAILS.format("B-ND"): [dk_details(product)]})
        (offer,) = dk_provider(client).get_offers(["B-ND"])
        self.assertEqual((offer.stock, offer.moq, offer.packaging), (9000, 2500, Packaging.TAPE_REEL))

    def test_lead_time_shows_when_stock_cannot_cover_the_smallest_order(self) -> None:
        product = dk_product([variation(stock=0)], weeks="14")
        client = FakeClient({"/v1/oauth2/token": [TOKEN], DETAILS.format("296-1395-1-ND"): [dk_details(product)]})
        (offer,) = dk_provider(client).get_offers(["296-1395-1-ND"])
        self.assertEqual((offer.stock, offer.lead_time_days), (0, 98))

    def test_lifecycle_and_the_distributor_flag_are_kept_apart(self) -> None:
        cases = [
            (dk_product(status="Not For New Designs"), Lifecycle.NRND, False),
            (dk_product(status="Last Time Buy"), Lifecycle.LAST_TIME_BUY, False),
            (dk_product(status="Obsolete"), Lifecycle.OBSOLETE, False),
            (dk_product(status="Discontinued at Digi-Key", discontinued=True), Lifecycle.UNKNOWN, True),
            (dk_product(status="", end_of_life=True), Lifecycle.OBSOLETE, False),
            (dk_product(status="Active", discontinued=True), Lifecycle.ACTIVE, True),
        ]
        for product, lifecycle, dropped in cases:
            client = FakeClient({"/v1/oauth2/token": [TOKEN], DETAILS.format("296-1395-1-ND"): [dk_details(product)]})
            (offer,) = dk_provider(client).get_offers(["296-1395-1-ND"])
            self.assertEqual((offer.lifecycle, offer.discontinued), (lifecycle, dropped), product["ProductStatus"])

    def test_a_status_it_does_not_know_is_logged_once_and_read_as_nothing(self) -> None:
        client = FakeClient({"/v1/oauth2/token": [TOKEN], DETAILS.format("296-1395-1-ND"): [dk_details(dk_product(status="Wibble"))] * 2})
        provider = dk_provider(client)
        with self.assertLogs(unrecognised.logger, "WARNING") as logged:
            for _ in range(2):
                (offer,) = provider.get_offers(["296-1395-1-ND"])
        self.assertEqual((offer.lifecycle, len(logged.records)), (Lifecycle.UNKNOWN, 1))

    def test_a_block_page_is_not_read_as_a_number_digikey_no_longer_knows(self) -> None:
        from app.services.supply.providers.base import Blocked

        client = FakeClient({
            "/v1/oauth2/token": [TOKEN],
            DETAILS.format("296-1395-1-ND"): [Blocked("a web page")],
        })
        with self.assertRaises(Blocked):
            dk_provider(client).get_offers(["296-1395-1-ND"])

    def test_what_digikey_does_not_say_is_left_out_not_guessed(self) -> None:
        no_stock = dk_product([{**variation(), "QuantityAvailableforPackageType": None}])
        client = FakeClient({
            "/v1/oauth2/token": [TOKEN],
            DETAILS.format("296-1395-1-ND"): [dk_details(no_stock)],
            DETAILS.format("GONE-ND"): [NotFound("HTTP 404")],
            DETAILS.format("OTHER-ND"): [dk_details(dk_product())],
        })
        self.assertEqual(dk_provider(client).get_offers(["296-1395-1-ND", "GONE-ND", "OTHER-ND"]), [])

    def test_a_rate_limit_or_a_rejected_key_stops_the_batch(self) -> None:
        client = FakeClient({"/v1/oauth2/token": [TOKEN], DETAILS.format("A-ND"): [RateLimited("slow down", retry_after_seconds=30)]})
        with self.assertRaises(RateLimited):
            dk_provider(client).get_offers(["A-ND", "B-ND"])

    def test_part_data(self) -> None:
        from app.services.supply.models import PartMatch

        client = FakeClient({"/v1/oauth2/token": [TOKEN], DETAILS.format("296-1395-1-ND"): [dk_details(dk_product())]})
        data = dk_provider(client).get_part_data(PartMatch("digikey", "296-1395-1-ND", "LM358DR", "Texas Instruments"))
        self.assertEqual((data.datasheet_url, data.category, data.package_name), ("https://www.ti.com/lit/ds/symlink/lm358.pdf", "Linear - Amplifiers", "Cut Tape (CT)"))
        self.assertEqual(data.parameters, (("Number of Circuits", "2"),))


def fa_provider(client, *, store="uk.farnell.com", currency="GBP", api_key="KEY"):
    config = ProviderConfig(connector_id="c1", storefront=store, currency=currency, credentials={"api_key": api_key} if api_key else {})
    return farnell.FarnellProvider(config, client=client, clock=lambda: NOW, monotonic=lambda: 0.0, sleep=lambda _s: None)


def fa_product(**over):
    base = {
        "sku": "1278613", "displayName": "TEXAS INSTRUMENTS LM339ADT Comparator", "brandName": "TEXAS INSTRUMENTS",
        "translatedManufacturerPartNumber": "LM339ADT", "packSize": 1, "translatedMinimumOrderQuality": 10,
        "productStatus": "STOCKED", "rohsStatusCode": "YES", "releaseStatusCode": 4,
        "datasheets": [{"type": "T", "description": "Technical Data Sheet", "url": "https://www.farnell.com/datasheets/1.pdf"}],
        "prices": [{"from": 10, "to": 90, "cost": 0.78}, {"from": 100, "to": 490, "cost": 0.62}, {"from": 500, "to": 1000000000, "cost": 0.5}],
        "stock": {"level": 518, "leastLeadTime": 63, "status": 1, "shipsFromMultipleWarehouses": True},
    }
    return base | over


def wrapped(*products, wrapper="manufacturerPartNumberSearchReturn"):
    return {wrapper: {"numberOfResults": len(products), "products": list(products)}}


class FarnellTests(unittest.TestCase):
    def setUp(self) -> None:
        unrecognised._seen.clear()

    def test_a_search_pages_while_the_answer_says_there_are_more_and_stops_at_its_limit(self) -> None:
        def page(start, count, total):
            products = [fa_product(sku=str(start + i)) for i in range(count)]
            return {"manufacturerPartNumberSearchReturn": {"numberOfResults": total, "products": products}}

        client = FakeClient({"/catalog/products": [page(0, 10, 23), page(10, 10, 23), page(20, 3, 23)]})
        provider = fa_provider(client)
        self.assertEqual(len(provider.lookup_mpn("LM339ADT")), 23)
        self.assertEqual([call["params"]["resultsSettings.offset"] for call in client.calls], ["0", "10", "20"])
        self.assertEqual(provider.calls, 3, "each page is a call")
        many = FakeClient({"/catalog/products": [page(start, 10, 500) for start in range(0, 100, 10)]})
        self.assertEqual(len(fa_provider(many).lookup_mpn("LM339ADT")), 10 * farnell.MAX_PAGES, "no more than the page limit")

    def test_the_spec(self) -> None:
        spec = registry.get_spec("farnell")
        self.assertEqual((spec.max_batch, spec.required_credentials), (10, ("api_key",)))
        self.assertIn("uk.farnell.com", spec.storefronts)
        self.assertIn("www.newark.com", spec.storefronts)
        self.assertEqual(len(spec.storefronts), 47)

    def test_a_search_names_the_store_the_term_and_the_key(self) -> None:
        client = FakeClient({"/catalog/products": [wrapped(fa_product())]})
        (match,) = fa_provider(client).lookup_mpn("LM339ADT")
        self.assertEqual((match.sku, match.mpn, match.manufacturer), ("1278613", "LM339ADT", "TEXAS INSTRUMENTS"))
        params = client.calls[0]["params"]
        self.assertEqual(
            {k: params[k] for k in ("term", "storeInfo.id", "resultsSettings.responseGroup", "callInfo.apiKey", "callInfo.responseDataFormat")},
            {"term": "manuPartNum:LM339ADT", "storeInfo.id": "uk.farnell.com", "resultsSettings.responseGroup": "medium",
             "callInfo.apiKey": "KEY", "callInfo.responseDataFormat": "JSON"},
        )

    def test_the_number_asked_for_and_its_longer_forms_are_matches_and_any_wrapper_will_do(self) -> None:
        other = fa_product(sku="2", translatedManufacturerPartNumber="LM339ADT-X")
        for wrapper in ("manufacturerPartNumberSearchReturn", "keywordSearchReturn", "somethingNew"):
            client = FakeClient({"/catalog/products": [wrapped(fa_product(), other, wrapper=wrapper)]})
            self.assertEqual([m.sku for m in fa_provider(client).lookup_mpn("lm339adt")], ["1278613", "2"], wrapper)
        self.assertEqual(fa_provider(FakeClient({"/catalog/products": [{"nothing": 1}]})).lookup_mpn("LM339ADT"), [])

    def test_the_family_search_is_a_keyword_search_kept_to_the_number_and_its_longer_forms(self) -> None:
        client = FakeClient({"/catalog/products": [wrapped(
            fa_product(sku="1", translatedManufacturerPartNumber="74AHC1G09GV,125"),
            fa_product(sku="2", translatedManufacturerPartNumber="74AHC1G09GV"),
            fa_product(sku="3", translatedManufacturerPartNumber="SN74AHC1G09DBVR"),
        )]})
        matches = fa_provider(client).lookup_family("74AHC1G09GV")
        self.assertEqual([m.mpn for m in matches], ["74AHC1G09GV", "74AHC1G09GV,125"])
        self.assertEqual(client.calls[0]["params"]["term"], "any:74AHC1G09GV")

    def test_an_offer_reads_stock_prices_minimum_and_rohs(self) -> None:
        client = FakeClient({"/catalog/products": [wrapped(fa_product())]})
        (offer,) = fa_provider(client).get_offers(["1278613"])
        self.assertEqual(client.calls[0]["params"]["term"], "id:1278613")
        self.assertEqual((offer.stock, offer.moq, offer.currency, offer.rohs, offer.discontinued, offer.lifecycle), (518, 10, "GBP", True, False, Lifecycle.UNKNOWN))
        self.assertEqual([(b.quantity, b.unit_price) for b in offer.price_breaks], [(10, Decimal("0.78")), (100, Decimal("0.62")), (500, Decimal("0.5"))])
        self.assertIsNone(offer.lead_time_days, "stock covers the minimum order")

    def test_several_skus_go_in_one_call_in_batches_of_ten(self) -> None:
        skus = [str(1000 + n) for n in range(12)]
        first = wrapped(*[fa_product(sku=sku) for sku in reversed(skus[:10])])
        second = wrapped(fa_product(sku=skus[10]))
        client = FakeClient({"/catalog/products": [first, second]})
        offers = fa_provider(client).get_offers(skus)
        self.assertEqual([o.sku for o in offers], skus[:11], "in the order asked, a SKU the store does not know is left out")
        self.assertEqual([c["params"]["term"] for c in client.calls], ["id:" + " ".join(skus[:10]), "id:" + " ".join(skus[10:])])
        self.assertEqual(fa_provider(FakeClient({})).get_offers(["", "a b"]), [], "nothing askable, nothing sent")

    def test_lead_time_shows_only_without_enough_stock(self) -> None:
        client = FakeClient({"/catalog/products": [wrapped(fa_product(stock={"level": 0, "leastLeadTime": 63, "status": 0}))]})
        (offer,) = fa_provider(client).get_offers(["1278613"])
        self.assertEqual((offer.stock, offer.lead_time_days), (0, 63))

    def test_the_answer_has_no_currency_so_the_connector_names_one_or_the_store_decides(self) -> None:
        client = FakeClient({"/catalog/products": [wrapped(fa_product())]})
        (unknown,) = fa_provider(client, store="il.farnell.com", currency="").get_offers(["1278613"])
        self.assertEqual((unknown.price_breaks, unknown.currency), ((), ""), "a store whose currency is in doubt needs one named")
        client = FakeClient({"/catalog/products": [wrapped(fa_product())]})
        (named,) = fa_provider(client, store="il.farnell.com", currency="USD").get_offers(["1278613"])
        self.assertEqual((len(named.price_breaks), named.currency), (3, "USD"))
        client = FakeClient({"/catalog/products": [wrapped(fa_product())]})
        (italy,) = fa_provider(client, store="it.farnell.com", currency="").get_offers(["1278613"])
        self.assertEqual((len(italy.price_breaks), italy.currency), (3, "EUR"), "a euro store prices in euros")
        client = FakeClient({"/catalog/products": [wrapped(fa_product())]})
        (uk,) = fa_provider(client, store="uk.farnell.com", currency="").get_offers(["1278613"])
        self.assertEqual(uk.currency, "GBP")
        client = FakeClient({"/catalog/products": [wrapped(fa_product())]})
        (india,) = fa_provider(client, store="in.element14.com", currency="").get_offers(["1278613"])
        self.assertEqual((len(india.price_breaks), india.currency), (3, "INR"), "element14 India prices in rupees")

    def test_a_product_link_is_the_stores_search_for_the_sku_unless_the_service_gives_one(self) -> None:
        from app.services.supply.providers import farnell

        self.assertEqual(farnell.page_url("it.farnell.com", "2787798RL", {"productURL": None}), "https://it.farnell.com/search?st=2787798RL")
        self.assertEqual(farnell.page_url("it.farnell.com", "1", {"productURL": "https://it.farnell.com/x/dp/1"}), "https://it.farnell.com/x/dp/1")
        self.assertEqual(farnell.page_url("it.farnell.com", "1", {"productURL": "http://insecure.example/1"}), "https://it.farnell.com/search?st=1")
        client = FakeClient({"/catalog/products": [wrapped(fa_product())]})
        (offer,) = fa_provider(client, store="it.farnell.com").get_offers(["1278613"])
        self.assertEqual(offer.product_url, "https://it.farnell.com/search?st=1278613")
        client = FakeClient({"/catalog/products": [wrapped(fa_product(translatedManufacturerPartNumber="LM358DR"))]})
        (match,) = fa_provider(client, store="it.farnell.com").lookup_mpn("LM358DR")
        self.assertEqual(match.product_url, "https://it.farnell.com/search?st=1278613")

    def test_roHS_codes_seen_live_are_read(self) -> None:
        for code, expected in (("YES", True), ("Y-EX", True), ("NO", False)):
            client = FakeClient({"/catalog/products": [wrapped(fa_product(rohsStatusCode=code))]})
            (offer,) = fa_provider(client).get_offers(["1278613"])
            self.assertEqual(offer.rohs, expected, code)

    def test_status_and_release_codes_say_who_stopped_what(self) -> None:
        cases = [
            (fa_product(productStatus="NO_LONGER_MANUFACTURED"), Lifecycle.OBSOLETE, False),
            (fa_product(stock={"level": 5, "status": -3}), Lifecycle.OBSOLETE, False),
            (fa_product(productStatus="NO_LONGER_STOCKED"), Lifecycle.UNKNOWN, True),
            (fa_product(releaseStatusCode=6), Lifecycle.UNKNOWN, True),
            (fa_product(releaseStatusCode=7), Lifecycle.UNKNOWN, True),
            (fa_product(releaseStatusCode=4), Lifecycle.UNKNOWN, False),
        ]
        for product, lifecycle, dropped in cases:
            (offer,) = fa_provider(FakeClient({"/catalog/products": [wrapped(product)]})).get_offers(["1278613"])
            self.assertEqual((offer.lifecycle, offer.discontinued), (lifecycle, dropped))

    def test_codes_it_does_not_know_are_logged_once(self) -> None:
        product = fa_product(productStatus="WIBBLE", rohsStatusCode="EXEMPT")
        client = FakeClient({"/catalog/products": [wrapped(product), wrapped(product)]})
        provider = fa_provider(client)
        with self.assertLogs(unrecognised.logger, "WARNING") as logged:
            for _ in range(2):
                (offer,) = provider.get_offers(["1278613"])
        self.assertEqual((offer.rohs, len(logged.records)), (None, 2), "one for the status and one for the RoHS code")

    def test_a_sku_it_does_not_return_is_left_out(self) -> None:
        client = FakeClient({"/catalog/products": [wrapped(fa_product(sku="999"))]})
        self.assertEqual(fa_provider(client).get_offers(["1278613"]), [])

    def test_missing_settings_are_clear(self) -> None:
        with self.assertRaises(AuthError):
            fa_provider(FakeClient({}), api_key="").lookup_mpn("LM339ADT")
        with self.assertRaises(ProviderError):
            fa_provider(FakeClient({}), store="").lookup_mpn("LM339ADT")

    def test_part_data(self) -> None:
        from app.services.supply.models import PartMatch

        client = FakeClient({"/catalog/products": [wrapped(fa_product())]})
        data = fa_provider(client).get_part_data(PartMatch("farnell", "1278613", "LM339ADT", "TEXAS INSTRUMENTS"))
        self.assertEqual((data.description, data.datasheet_url), ("TEXAS INSTRUMENTS LM339ADT Comparator", "https://www.farnell.com/datasheets/1.pdf"))


class MouserFamilyTests(unittest.TestCase):
    def test_the_family_search_drops_exact_and_keeps_the_number_and_its_longer_forms(self) -> None:
        def part(number, sku):
            return {"MouserPartNumber": sku, "ManufacturerPartNumber": number, "Manufacturer": "Nexperia"}

        client = FakeClient({"/api/v1/search/partnumber": [{"Errors": [], "SearchResults": {"Parts": [
            part("74AHC1G09GV,125", "771-74AHC1G09GV125"), part("74AHC1G09GV-Q100H", "771-74AHC1G09GVQ100H"), part("SN74AHC1G09DBVR", "595-X"),
        ]}}]})
        config = ProviderConfig(connector_id="c1", storefront="", currency="EUR", credentials={"api_key": "KEY"})
        provider = mouser.MouserProvider(config, client=client, clock=lambda: NOW, monotonic=lambda: 0.0, sleep=lambda _s: None)
        self.assertEqual([m.mpn for m in provider.lookup_family("74AHC1G09GV")], ["74AHC1G09GV,125", "74AHC1G09GV-Q100H"])
        self.assertEqual(client.calls[0]["json"]["SearchByPartRequest"]["partSearchOptions"], "None")


class DigiKeyPagingTests(unittest.TestCase):
    def test_a_search_pages_while_the_answer_says_there_are_more(self) -> None:
        def product(n):
            return dk_product([variation(sku=f"{n}-ND")])

        def page(start, count, total):
            return {"ExactMatches": [], "Products": [product(start + i) for i in range(count)], "ProductsCount": total}

        client = FakeClient({"/v1/oauth2/token": [TOKEN], "/products/v4/search/keyword": [page(0, 10, 13), page(10, 3, 13)]})
        provider = dk_provider(client)
        self.assertEqual(len(provider.lookup_mpn("LM358DR")), 13)
        self.assertEqual([call["json"]["Offset"] for call in client.calls if call["path"].endswith("keyword")], [0, 10])
        self.assertEqual(provider.calls, 3, "the token and two pages")


class DigiKeySubstitutesTests(unittest.TestCase):
    """The substitutions answer is recorded from the live service (tests/fixtures/supply/digikey_live_substitutions.json)."""

    def recorded(self, index: int) -> dict:
        import json

        path = Path(__file__).resolve().parent / "fixtures" / "supply" / "digikey_live_substitutions.json"
        return json.loads(path.read_text(encoding="utf-8"))["calls"][index]["answer"]

    def test_the_packagings_of_a_substitute_are_one_part_with_digikeys_word_for_the_match(self) -> None:
        client = FakeClient({"/products/v4/search/445-5982-1-ND/substitutions": [self.recorded(0)], "/v1/oauth2/token": [TOKEN]})
        found = dk_provider(client).substitutes("445-5982-1-ND")
        self.assertEqual([(a.manufacturer, a.mpn, a.note) for a in found], [("TDK", "C2012X5R1V685K125AC", "Upgrade")], "three packagings, one part")
        self.assertTrue(found[0].sku.startswith("445-"))

    def test_a_direct_substitute_and_a_product_digikey_does_not_know(self) -> None:
        client = FakeClient({"/products/v4/search/P120HDKR-ND/substitutions": [self.recorded(1)], "/v1/oauth2/token": [TOKEN]})
        found = dk_provider(client).substitutes("P120HDKR-ND")
        self.assertTrue(found and all(a.note in ("Direct", "Upgrade") for a in found))
        self.assertEqual(len({a.mpn for a in found}), len(found), "each part once")
        missing = FakeClient({"/products/v4/search/GONE/substitutions": [NotFound("no")], "/v1/oauth2/token": [TOKEN]})
        self.assertEqual(dk_provider(missing).substitutes("GONE"), ())



if __name__ == "__main__":
    unittest.main()