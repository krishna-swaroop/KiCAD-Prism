"""The TME (v2) and Mouser (V1) adapters, against their published API descriptions.

No network. A fake client answers with the examples from the descriptions
(``fixtures/supply``) and records what the adapter asked for. One test per
provider goes through the real ``SafeHttpClient`` with a scripted transport, to
check the request on the wire.
"""

from __future__ import annotations

import base64
import copy
import json
import sys
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply.http_client import HttpResponse, SafeHttpClient  # noqa: E402
from app.services.supply.providers import mouser, registry, tme  # noqa: E402
from app.services.supply.providers.base import AuthError, ProviderConfig, ProviderError  # noqa: E402
from app.services.supply.providers.text_values import parse_count, parse_decimal, parse_lead_time_days  # noqa: E402
from app.services.supply.vocabulary import Lifecycle, Packaging  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "supply"
NOW = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)
TME = json.loads((FIXTURES / "tme_v2_examples.json").read_text(encoding="utf-8"))
MOUSER = json.loads((FIXTURES / "mouser_v1_partnumber.json").read_text(encoding="utf-8"))
LIVE_TME = json.loads((FIXTURES / "tme_live_lm358dr.json").read_text(encoding="utf-8"))
LIVE_MOUSER = json.loads((FIXTURES / "mouser_live_lm358dr.json").read_text(encoding="utf-8"))["answer"]


class FakeClient:
    """Answers queued per URL path; records every call."""

    def __init__(self, answers: dict[str, list]) -> None:
        self.answers = {path: list(items) for path, items in answers.items()}
        self.calls: list[dict] = []

    def request_json(self, method, url, **kwargs):
        path = urlsplit(url).path
        self.calls.append({"method": method, "path": path, **kwargs})
        queue = self.answers.get(path) or []
        if not queue:
            raise AssertionError(f"unexpected call to {path}")
        answer = queue.pop(0)
        if isinstance(answer, BaseException):
            raise answer
        return copy.deepcopy(answer)


def tme_provider(client, *, storefront="PL", currency="EUR", credentials=None, monotonic=None):
    config = ProviderConfig(
        connector_id="c1", storefront=storefront, currency=currency,
        credentials={"token": "T" * 50, "secret": "S" * 20} if credentials is None else credentials,
    )
    return tme.TmeProvider(config, client=client, clock=lambda: NOW, monotonic=monotonic or (lambda: 0.0))


def product(symbol, *, mpns=("MPN-1",), statuses=(), minimal=1, multiples=1, maker="Acme"):
    return {
        "product_status": list(statuses), "symbol": symbol, "manufacturer_symbols": list(mpns),
        "manufacturer": {"id": 1, "name": maker}, "description": f"{symbol} description",
        "category": {"id": 2, "name": "Op amps"}, "multiples": multiples, "minimal_amount": minimal,
    }


def figures(symbol, *, stock=100, prices=((1, 0.5), (100, 0.3)), currency="EUR", kind="NET", rate=23):
    return {
        "symbol": symbol, "stock_quantity": stock,
        "prices": {"elements": [{"amount": a, "price": p, "special": False} for a, p in prices],
                   "tax": {"type": "VAT", "rate": rate}, "currency": currency, "type": kind},
        "deliveries": None,
    }


def ok(elements):
    return {"status": "OK", "data": {"elements": elements}}


TOKEN = {"access_token": "abc", "token_type": "Bearer", "expires_in": 300, "refresh_token": "r"}


class TextValueTests(unittest.TestCase):
    def test_numbers_in_display_text(self) -> None:
        cases = {
            "12,480 In Stock": Decimal("12480"), "0,52 \u20ac": Decimal("0.52"), "$1,234.50": Decimal("1234.50"),
            "1.234,50 \u20ac": Decimal("1234.50"), "0.113": Decimal("0.113"), "12,5": Decimal("12.5"),
            "1 234": Decimal("1234"), "1\u00a0234,5": Decimal("1234.5"), "1.000.000": Decimal("1000000"),
            "\u00a30.07": Decimal("0.07"), 0.647: Decimal("0.647"), 3: Decimal("3"),
            # Rupees, grouped in lakhs and crores
            "\u20b91,23,456.50": Decimal("123456.50"), "\u20b912,34,56,789": Decimal("123456789"), "Rs. 1,00,000": Decimal("100000"), "\u20b912.75": Decimal("12.75"),
        }
        for text, expected in cases.items():
            self.assertEqual(parse_decimal(text), expected, text)
        for empty in (None, "", "None", "Call for price", True):
            self.assertIsNone(parse_decimal(empty), empty)

    def test_counts_and_lead_times(self) -> None:
        self.assertEqual(parse_count("12,480 In Stock"), 12480)
        self.assertIsNone(parse_count("None"))
        self.assertIsNone(parse_count(-5))
        self.assertEqual(parse_lead_time_days("42 Days"), 42)
        self.assertEqual(parse_lead_time_days("12 Weeks"), 84)
        self.assertEqual(parse_lead_time_days("P5W"), 35)
        self.assertEqual(parse_lead_time_days("P10D"), 10)
        self.assertIsNone(parse_lead_time_days(None))
        self.assertIsNone(parse_lead_time_days("Unknown"))
        # Mouser writes the unit in the account's language.
        self.assertEqual(parse_lead_time_days("140 Giorni"), 140)
        self.assertEqual(parse_lead_time_days("12 Settimane"), 84)
        self.assertEqual(parse_lead_time_days("6 Wochen"), 42)
        self.assertEqual(parse_lead_time_days("30 Tage"), 30)
        self.assertEqual(parse_lead_time_days("42"), 42, "a bare number is days")
        self.assertIsNone(parse_lead_time_days("12 Mesi"), "a unit it does not know gives nothing, not a wrong number")


class TmeTests(unittest.TestCase):
    def test_both_are_registered_and_metered(self) -> None:
        for key, batch, calls in (("tme", 50, 2), ("mouser", 10, 1)):
            spec = registry.get_spec(key)
            self.assertEqual((spec.max_batch, spec.calls_per_offers_batch, spec.metered), (batch, calls, True), key)
        self.assertIn("PL", registry.get_spec("tme").storefronts)
        self.assertEqual(registry.get_spec("mouser").storefronts, ())
        self.assertEqual(registry.get_spec("tme").required_credentials, ("token", "secret"))
        self.assertEqual(registry.get_spec("mouser").required_credentials, ("api_key",))

    def test_the_documented_examples_parse(self) -> None:
        client = FakeClient({"/auth/token": [TME["auth_token"] | {"access_token": "abc"}],
                             "/products": [TME["products"]]})
        (match,) = tme_provider(client).lookup_mpn("AX-100")
        self.assertEqual((match.sku, match.manufacturer), ("AX-100", "AXIOMET / Transfer Multisort Elektronik Sp. z o.o."))
        self.assertEqual(match.mpn, "AX-100", "no manufacturer symbol listed: the TME symbol stands in")

        data = TME["products_data"]
        symbol = data["data"]["elements"][0]["symbol"]
        client = FakeClient({"/auth/token": [TOKEN], "/products": [ok([product(symbol, mpns=("02KR-6H-P",), maker="JST")])],
                             "/products/data": [data]})
        (offer,) = tme_provider(client).get_offers([symbol])
        self.assertEqual((offer.sku, offer.stock, offer.currency, offer.manufacturer), (symbol, 647, "PLN", "JST"))
        # The example is a GROSS price with 23% VAT: Prism keeps net prices.
        self.assertEqual([(b.quantity, b.unit_price) for b in offer.price_breaks],
                         [(1, Decimal("0.526016")), (2000, Decimal("0.492033"))])

    def test_it_signs_in_once_and_sends_the_bearer_token(self) -> None:
        client = FakeClient({"/auth/token": [TOKEN], "/products": [ok([product("S1")]), ok([product("S1")])]})
        provider = tme_provider(client)
        provider.lookup_mpn("MPN-1")
        provider.lookup_mpn("MPN-1")
        auth = [call for call in client.calls if call["path"] == "/auth/token"]
        self.assertEqual(len(auth), 1, "the token is reused while it is valid")
        expected = base64.b64encode(("T" * 50 + ":" + "S" * 20).encode()).decode()
        self.assertEqual(auth[0]["headers"]["Authorization"], f"Basic {expected}")
        self.assertEqual(auth[0]["form"], {"grant_type": "client_credentials"})
        search = client.calls[1]
        self.assertEqual(search["headers"]["Authorization"], "Bearer abc")
        self.assertEqual(search["params"], [("mpns[]", "MPN-1"), ("country", "PL")])

    def test_an_expired_token_is_renewed(self) -> None:
        clock = {"t": 0.0}
        client = FakeClient({"/auth/token": [TOKEN, TOKEN | {"access_token": "def"}],
                             "/products": [ok([]), ok([])]})
        provider = tme_provider(client, monotonic=lambda: clock["t"])
        provider.lookup_mpn("MPN-1")
        clock["t"] = 280.0  # inside the 30 second margin before 300
        provider.lookup_mpn("MPN-1")
        self.assertEqual(client.calls[-1]["headers"]["Authorization"], "Bearer def")

    def test_a_401_renews_the_token_once(self) -> None:
        client = FakeClient({"/auth/token": [TOKEN, TOKEN | {"access_token": "def"}],
                             "/products": [AuthError("expired"), ok([product("S1")])]})
        self.assertEqual(len(tme_provider(client).lookup_mpn("MPN-1")), 1)
        client = FakeClient({"/auth/token": [TOKEN, TOKEN], "/products": [AuthError("no"), AuthError("still no")]})
        with self.assertRaises(AuthError):
            tme_provider(client).lookup_mpn("MPN-1")

    def test_checking_the_connection_asks_for_a_token_and_nothing_else(self) -> None:
        client = FakeClient({"/auth/token": [TOKEN]})
        tme_provider(client).check_connection()
        self.assertEqual([call["path"] for call in client.calls], ["/auth/token"])
        with self.assertRaises(AuthError):
            tme_provider(FakeClient({"/auth/token": [AuthError("refused")]})).check_connection()
        with self.assertRaises(AuthError):
            tme_provider(FakeClient({}), credentials={}).check_connection()

    def test_missing_or_refused_credentials_are_an_auth_error(self) -> None:
        with self.assertRaises(AuthError):
            tme_provider(FakeClient({}), credentials={}).lookup_mpn("MPN-1")
        with self.assertRaises(AuthError):
            tme_provider(FakeClient({"/auth/token": [{"token_type": "Bearer"}]})).lookup_mpn("MPN-1")

    def test_lookup_reports_the_part_number_that_was_asked_for(self) -> None:
        client = FakeClient({"/auth/token": [TOKEN], "/products": [ok([
            product("LM358D-TI", mpns=("LM358DR", "LM358D")), product("", mpns=("X",)),
        ])]})
        (match,) = tme_provider(client).lookup_mpn("lm358-d")
        self.assertEqual((match.sku, match.mpn, match.description), ("LM358D-TI", "LM358D", "LM358D-TI description"))

    def test_offers_merge_order_rules_with_stock_and_price(self) -> None:
        client = FakeClient({"/auth/token": [TOKEN],
                             "/products": [ok([product("A", minimal=10, multiples=5), product("B")])],
                             "/products/data": [ok([figures("A", stock=1200), figures("B", stock=0)])]})
        offers = {offer.sku: offer for offer in tme_provider(client).get_offers(["A", "B", "GONE"])}
        self.assertEqual(sorted(offers), ["A", "B"], "a symbol TME no longer knows is left out")
        a = offers["A"]
        self.assertEqual((a.stock, a.moq, a.order_multiple, a.currency, a.mpn, a.fetched_at), (1200, 10, 5, "EUR", "MPN-1", NOW))
        self.assertEqual([(b.quantity, b.unit_price) for b in a.price_breaks], [(1, Decimal("0.5")), (100, Decimal("0.3"))])
        data_call = next(call for call in client.calls if call["path"] == "/products/data")
        self.assertEqual(data_call["params"], [("symbols[]", "A"), ("symbols[]", "B"), ("symbols[]", "GONE"),
                                               ("scope[]", "prices"), ("scope[]", "stock"), ("currency", "EUR"),
                                               ("country", "PL")])

    def test_statuses_map_to_flags_not_lifecycle(self) -> None:
        client = FakeClient({"/auth/token": [TOKEN],
                             "/products": [ok([product("END", statuses=("NOT_IN_OFFER",)),
                                               product("LAST", statuses=("AVAILABLE_WHILE_STOCKS_LAST",)),
                                               product("EXT", statuses=("EXTERNAL_WAREHOUSE",)),
                                               product("NO", statuses=("CANNOT_BE_ORDERED",))])],
                             "/products/data": [ok([figures(s, stock=50) for s in ("END", "LAST", "EXT", "NO")])]})
        offers = {offer.sku: offer for offer in tme_provider(client).get_offers(["END", "LAST", "EXT", "NO"])}
        self.assertTrue(offers["END"].discontinued and offers["LAST"].discontinued)
        self.assertTrue(all(offer.lifecycle is Lifecycle.UNKNOWN for offer in offers.values()))
        self.assertTrue(offers["EXT"].marketplace)
        self.assertEqual(offers["NO"].stock, 0, "stock that cannot be ordered here does not count")

    def test_a_batch_over_fifty_is_split(self) -> None:
        skus = [f"S{i}" for i in range(60)]
        client = FakeClient({"/auth/token": [TOKEN],
                             "/products": [ok([product(s) for s in skus[:50]]), ok([product(s) for s in skus[50:]])],
                             "/products/data": [ok([figures(s) for s in skus[:50]]), ok([figures(s) for s in skus[50:]])]})
        self.assertEqual(len(tme_provider(client).get_offers(skus)), 60)

    def test_odd_prices_are_dropped_not_fatal(self) -> None:
        bad = figures("A", prices=((0, 1.0), (5, -1), (10, "x")))
        client = FakeClient({"/auth/token": [TOKEN], "/products": [ok([product("A")])], "/products/data": [ok([bad])]})
        (offer,) = tme_provider(client).get_offers(["A"])
        self.assertEqual((offer.price_breaks, offer.currency), ((), ""))

    def test_a_status_other_than_ok_is_a_provider_error(self) -> None:
        client = FakeClient({"/auth/token": [TOKEN], "/products": [{"status": "E_INPUT_PARAMS_VALIDATION_ERROR"}]})
        with self.assertRaises(ProviderError):
            tme_provider(client).lookup_mpn("MPN-1")

    def test_stock_is_never_read_from_the_availability_text(self) -> None:
        answer = copy.deepcopy(MOUSER)
        part = answer["SearchResults"]["Parts"][0]
        part["AvailabilityInStock"], part["Availability"] = None, "500 On Order"
        offers = mouser_provider(FakeClient({SEARCH: [answer]})).get_offers(["595-LM358DR", "595-TPS62840DLCR"])
        self.assertEqual([o.sku for o in offers], ["595-TPS62840DLCR"], "a stock the answer does not state is left out")

    def test_an_unknown_lifecycle_is_logged_once(self) -> None:
        from app.services.supply.providers import unrecognised

        unrecognised._seen.clear()
        answer = copy.deepcopy(MOUSER)
        answer["SearchResults"]["Parts"][0]["LifecycleStatus"] = "Factory Special Order"
        with self.assertLogs(unrecognised.logger, "WARNING") as logged:
            for _ in range(2):
                (offer, *_) = mouser_provider(FakeClient({SEARCH: [answer]})).get_offers(["595-LM358DR"])
        self.assertEqual(offer.lifecycle, Lifecycle.UNKNOWN)
        self.assertEqual(len(logged.records), 1)

    def test_part_data(self) -> None:
        from app.services.supply.models import PartMatch

        client = FakeClient({"/auth/token": [TOKEN], "/products": [ok([product("A")]), ok([])]})
        provider = tme_provider(client)
        data = provider.get_part_data(PartMatch(provider="tme", sku="A", mpn="MPN-1", manufacturer="Acme"))
        self.assertEqual((data.description, data.category), ("A description", "Op amps"))
        self.assertEqual(provider.get_part_data(PartMatch(provider="tme", sku="Z", mpn="Z1", manufacturer="")).description, "")

    def test_on_the_wire(self) -> None:
        class Transport:
            def __init__(self):
                self.sent = []

            def send(self, *, method, target, headers, body, timeout, max_bytes):
                self.sent.append({"method": method, "url": target.url, "headers": dict(headers), "body": body})
                answer = TOKEN if target.url.endswith("/auth/token") else ok([product("S1")])
                return HttpResponse(200, {"content-type": "application/json"}, json.dumps(answer).encode())

        transport = Transport()
        client = SafeHttpClient(tme.ALLOWED_HOSTS, transport=transport, resolve=lambda host: ["93.184.216.34"])
        tme_provider(client).lookup_mpn("LM358 D")
        token_call, search_call = transport.sent
        self.assertEqual((token_call["method"], token_call["body"]), ("POST", b"grant_type=client_credentials"))
        self.assertEqual(token_call["headers"]["Content-Type"], "application/x-www-form-urlencoded")
        url = urlsplit(search_call["url"])
        self.assertEqual((url.netloc, url.path), ("api.tme.eu", "/products"))
        self.assertEqual(parse_qsl(url.query), [("mpns[]", "LM358 D"), ("country", "PL")])
        self.assertEqual(search_call["headers"]["Accept-Language"], "en")


def mouser_provider(client, *, api_key="KEY", sleeps=None, clock=None):
    config = ProviderConfig(connector_id="c2", credentials={"api_key": api_key} if api_key else {})
    ticks = clock or {"t": 0.0}

    def sleep(seconds: float) -> None:
        if sleeps is not None:
            sleeps.append(seconds)
        ticks["t"] += seconds

    return mouser.MouserProvider(config, client=client, clock=lambda: NOW, monotonic=lambda: ticks["t"], sleep=sleep)


SEARCH = "/api/v1/search/partnumber"


class MouserTests(unittest.TestCase):
    def test_the_schema_shaped_answer_parses(self) -> None:
        client = FakeClient({SEARCH: [MOUSER]})
        offers = {o.sku: o for o in mouser_provider(client).get_offers(["595-LM358DR", "595-TPS62840DLCR", "595-UNKNOWN"])}
        self.assertEqual(sorted(offers), ["595-LM358DR", "595-TPS62840DLCR"])
        lm = offers["595-LM358DR"]
        self.assertEqual((lm.stock, lm.mpn, lm.manufacturer, lm.currency, lm.lead_time_days), (12480, "LM358DR", "Texas Instruments", "EUR", None))
        self.assertEqual(lm.lead_time_days, None, "the factory lead time is not shown when stock covers the minimum order")
        self.assertEqual([(b.quantity, b.unit_price) for b in lm.price_breaks],
                         [(1, Decimal("0.52")), (10, Decimal("0.331")), (100, Decimal("0.213")), (2500, Decimal("0.113"))])
        self.assertEqual(lm.incoming[0].quantity, 5000)
        self.assertEqual(lm.incoming[0].expected, date(2026, 11, 20))
        self.assertEqual((lm.lifecycle, lm.discontinued, lm.rohs, lm.packaging), (Lifecycle.UNKNOWN, False, True, Packaging.SEVERAL))
        self.assertEqual(lm.product_url, "https://www.mouser.com/ProductDetail/Texas-Instruments/LM358DR")
        tps = offers["595-TPS62840DLCR"]
        self.assertEqual((tps.stock, tps.moq, tps.order_multiple, tps.lead_time_days), (0, 3000, 3000, 84))
        self.assertEqual((tps.lifecycle, tps.discontinued, tps.packaging), (Lifecycle.NRND, True, Packaging.TAPE_REEL))

    def test_the_request_shape(self) -> None:
        client = FakeClient({SEARCH: [MOUSER]})
        mouser_provider(client).get_offers(["595-LM358DR", "595-TPS62840DLCR"])
        (call,) = client.calls
        self.assertEqual((call["method"], call["params"]), ("POST", {"apiKey": "KEY"}))
        self.assertEqual(call["json"], {"SearchByPartRequest": {"mouserPartNumber": "595-LM358DR|595-TPS62840DLCR",
                                                                "partSearchOptions": "Exact"}})

    def test_ten_numbers_per_call_spaced_apart(self) -> None:
        skus = [f"595-P{i:02d}" for i in range(23)]
        empty = {"Errors": [], "SearchResults": {"NumberOfResult": 0, "Parts": []}}
        sleeps: list[float] = []
        client = FakeClient({SEARCH: [empty, empty, empty]})
        mouser_provider(client, sleeps=sleeps).get_offers(skus)
        self.assertEqual([len(call["json"]["SearchByPartRequest"]["mouserPartNumber"].split("|")) for call in client.calls], [10, 10, 3])
        self.assertEqual(len(sleeps), 2)
        for gap in sleeps:
            self.assertTrue(0.75 * mouser.PACE_SECONDS <= gap <= 1.5 * mouser.PACE_SECONDS, "spaced at random around Mouser's pace")

    def test_lookup_skips_unorderable_numbers_and_impossible_queries(self) -> None:
        answer = copy.deepcopy(MOUSER)
        answer["SearchResults"]["Parts"][1]["MouserPartNumber"] = "N/A"
        client = FakeClient({SEARCH: [answer]})
        (match,) = mouser_provider(client).lookup_mpn("LM358DR")
        self.assertEqual((match.sku, match.mpn, match.manufacturer), ("595-LM358DR", "LM358DR", "Texas Instruments"))
        self.assertEqual(mouser_provider(FakeClient({})).lookup_mpn("AB"), [], "under three characters is not searchable")

    def test_errors_in_a_200_answer(self) -> None:
        refused = {"Errors": [{"Id": 0, "Code": "Invalid", "Message": "Invalid unique identifier.", "PropertyName": "API Key"}],
                   "SearchResults": None}
        with self.assertRaises(AuthError):
            mouser_provider(FakeClient({SEARCH: [refused]})).lookup_mpn("LM358DR")
        other = {"Errors": [{"Code": "TooManyCharacters", "Message": "Too long", "PropertyName": "mouserPartNumber"}]}
        with self.assertRaises(ProviderError) as caught:
            mouser_provider(FakeClient({SEARCH: [other]})).lookup_mpn("LM358DR")
        self.assertNotIsInstance(caught.exception, AuthError)
        with self.assertRaises(AuthError):
            mouser_provider(FakeClient({}), api_key="").lookup_mpn("LM358DR")

    def test_mixed_currencies_give_no_price(self) -> None:
        answer = copy.deepcopy(MOUSER)
        answer["SearchResults"]["Parts"][0]["PriceBreaks"][1]["Currency"] = "USD"
        (offer, _) = mouser_provider(FakeClient({SEARCH: [answer]})).get_offers(["595-LM358DR", "595-TPS62840DLCR"])
        self.assertEqual((offer.price_breaks, offer.currency), ((), ""))

    def test_part_data(self) -> None:
        from app.services.supply.models import PartMatch

        data = mouser_provider(FakeClient({SEARCH: [MOUSER]})).get_part_data(
            PartMatch(provider="mouser", sku="595-LM358DR", mpn="LM358DR", manufacturer="Texas Instruments"))
        self.assertEqual(data.category, "Operational Amplifiers - Op Amps")
        self.assertEqual(data.parameters[0], ("Packaging", "Reel"))
        self.assertTrue(data.datasheet_url.endswith(".pdf"))

    def test_the_key_stays_out_of_error_messages(self) -> None:
        class Transport:
            def send(self, **kwargs):
                return HttpResponse(500, {}, b"")

        client = SafeHttpClient(mouser.ALLOWED_HOSTS, transport=Transport(), resolve=lambda host: ["93.184.216.34"])
        with self.assertRaises(ProviderError) as caught:
            mouser_provider(client, api_key="SECRET-KEY-123").lookup_mpn("LM358DR")
        self.assertNotIn("SECRET-KEY-123", str(caught.exception))


class RecordedAnswerTests(unittest.TestCase):
    """Answers recorded from the live services (see the ``_source`` note in each fixture)."""

    def test_tme_as_it_really_answers(self) -> None:
        client = FakeClient({
            "/auth/token": [TOKEN],
            "/products": [LIVE_TME["products_lookup"], LIVE_TME["products"]],
            "/products/data": [LIVE_TME["products_data"]],
        })
        provider = tme_provider(client, storefront="AT", currency="")
        (match,) = provider.lookup_mpn("LM358DR")
        self.assertEqual((match.sku, match.mpn, match.manufacturer), ("LM358DR", "LM358DR", "TEXAS INSTRUMENTS"))
        (offer,) = provider.get_offers(["LM358DR"])
        self.assertEqual((offer.stock, offer.currency, offer.moq, offer.order_multiple), (0, "EUR", 1, 1))
        # Gross prices with 22% VAT become net; the first tier was 0.22 gross.
        self.assertEqual(offer.price_breaks[0].quantity, 1)
        self.assertEqual(offer.price_breaks[0].unit_price, Decimal("0.180328"))
        self.assertEqual([b.quantity for b in offer.price_breaks], sorted(b.quantity for b in offer.price_breaks))
        self.assertFalse(offer.discontinued, "a status TME does not document is not read as a reason")
        self.assertFalse(offer.marketplace)
        self.assertEqual(offer.product_url, "https://www.tme.eu/at/details/lm358dr/")

    def test_tme_batches_on_the_way_are_incoming_stock_with_their_date(self) -> None:
        from datetime import date

        row = figures("A", stock=647)
        row["deliveries"] = {"elements": [
            {"status": "DS_AVAILABLE_IN_STOCK", "amount": 647, "data": None},
            {"status": "DS_DELIVERY_NEEDS_CONFIRMATION", "amount": 353, "data": {"waiting_period": "P5W", "supply_date": "2026-06-17"}},
            {"status": "DS_DELIVERY_NEEDS_CONFIRMATION", "amount": 100, "data": None},
        ]}
        client = FakeClient({"/auth/token": [TOKEN], "/products": [ok([product("A")])], "/products/data": [ok([row])]})
        (offer,) = tme_provider(client).get_offers(["A"])
        self.assertEqual(offer.stock, 647, "stock on hand is not counted twice")
        self.assertEqual([(i.quantity, i.expected) for i in offer.incoming], [(353, date(2026, 6, 17)), (100, None)])

    def test_mouser_as_it_really_answers_in_italian(self) -> None:
        provider = mouser_provider(FakeClient({SEARCH: [LIVE_MOUSER, LIVE_MOUSER, LIVE_MOUSER]}))
        matches = provider.lookup_mpn("LM358DR")
        self.assertEqual({(m.sku, m.manufacturer) for m in matches},
                         {("595-LM358DR", "Texas Instruments"), ("755-LM358DR", "ROHM Semiconductor")})
        offers = {o.sku: o for o in provider.get_offers(["595-LM358DR", "755-LM358DR"])}

        sold = offers["595-LM358DR"]
        self.assertEqual((sold.stock, sold.lead_time_days, sold.moq, sold.currency, sold.rohs), (69338, None, 1, "EUR", True))
        self.assertEqual(sold.price_breaks[0].unit_price, Decimal("0.224"))
        self.assertEqual(len(sold.price_breaks), 9)
        self.assertEqual(sold.packaging, Packaging.SEVERAL, "reel, cut tape and MouseReel share one number")

        restricted = offers["755-LM358DR"]
        self.assertEqual((restricted.stock, restricted.moq, restricted.lifecycle), (0, 2500, Lifecycle.NRND))
        self.assertEqual((restricted.price_breaks, restricted.packaging), ((), Packaging.TAPE_REEL),
                         "the packaging value is English even when the attribute name is Italian")

    def test_a_restricted_listing_has_no_stock_whatever_the_figures_say(self) -> None:
        answer = copy.deepcopy(LIVE_MOUSER)
        restricted = next(p for p in answer["SearchResults"]["Parts"] if p["MouserPartNumber"] == "755-LM358DR")
        restricted["AvailabilityInStock"] = "900"
        (offer,) = mouser_provider(FakeClient({SEARCH: [answer]})).get_offers(["755-LM358DR"])
        self.assertEqual(offer.stock, 0)


if __name__ == "__main__":
    unittest.main()
