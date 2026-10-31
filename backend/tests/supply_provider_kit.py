"""The contract test kit for distributor adapters ("Add a distributor").

An adapter is run under the real ``SafeHttpClient``: only the network is replaced, by a transport that answers from a
recording. So the spec's ``hosts`` are enforced (a call to any other host fails), HTTP statuses become the contract's
errors, and the adapter's ``calls`` meter is compared with what really went out.

A recording is the file ``scripts/record_supply_answer.py`` writes (``tests/fixtures/supply/<provider>_live_<mpn>.json``)::

    {"provider": "digikey", "mpn": "LM358DR", "calls": [{"method": "GET", "path": "/...", "answer": {...}}, ...]}

A call may also carry ``status`` (default 200), ``headers`` and ``body`` (raw text in place of ``answer``). Token
requests are never recorded: any path that names a token or OAuth is answered with a made-up token.

``ContractChecks`` is the mixin a test case uses::

    class MyDistributorContract(ContractChecks, unittest.TestCase):
        spec = mydistributor.SPEC
        build = staticmethod(lambda config, **transport: mydistributor.MyProvider(config, **transport))
        recordings = ("mydistributor_live_lm358dr.json",)

It checks the spec against what the adapter can do, replays each recording the way the recorder made it (search, the
offers of the first matches, the part data of the first), checks the shapes, that every recorded answer was used (so a
page the adapter should have asked for is not skipped), the call count against the spec, and how the adapter fails
when the service refuses, limits, falls over or answers a web page.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, ClassVar, Mapping, Sequence
from urllib.parse import urlsplit

from app.services.supply.http_client import HttpResponse, SafeHttpClient
from app.services.supply.models import Offer, PartData, PartMatch
from app.services.supply.providers import unrecognised
from app.services.supply.providers.base import (
    CAP_PCN,
    CAP_SUBSTANCES,
    CAP_SUBSTITUTES,
    AuthError,
    BatchSearch,
    Blocked,
    CallCounting,
    ChangeNoticeReader,
    EgressBlocked,
    ProviderConfig,
    ProviderError,
    ProviderSpec,
    RateLimited,
    SubstanceReader,
    SubstituteReader,
    SupplyProvider,
    Unavailable,
)
from app.services.supply.vocabulary import Lifecycle, Packaging

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "supply"
# The recorder reads the offers of this many matches.
RECORDED_OFFERS = 3
# What every name resolves to: a public address, so the egress check passes. Nothing connects to it.
PUBLIC_ADDRESS = "93.184.216.34"
_TOKEN_WORDS = ("token", "oauth")


@dataclass
class Exchange:
    method: str
    path: str
    status: int = 200
    headers: Mapping[str, str] = field(default_factory=dict)
    body: bytes = b""


def _exchange(call: Mapping[str, Any]) -> Exchange:
    if "body" in call:
        body = str(call["body"]).encode("utf-8")
    else:
        body = json.dumps(call.get("answer")).encode("utf-8")
    headers = {"content-type": "application/json", **{k.lower(): str(v) for k, v in (call.get("headers") or {}).items()}}
    return Exchange(str(call["method"]).upper(), str(call["path"]), int(call.get("status") or 200), headers, body)


def is_token_path(path: str) -> bool:
    return any(word in path.lower() for word in _TOKEN_WORDS)


def token_answer() -> HttpResponse:
    # Built at run time: never a token-shaped literal in the repository.
    made_up = "-".join(("replayed", "access", "value"))
    return HttpResponse(200, {"content-type": "application/json"}, json.dumps({"access_token": made_up, "expires_in": 3599}).encode())


class ReplayTransport:
    """Answers each request with the next recorded answer for its method and path, and keeps every request it was sent."""

    def __init__(self, calls: Sequence[Mapping[str, Any]]) -> None:
        self._queues: dict[tuple[str, str], list[Exchange]] = {}
        for call in calls:
            exchange = _exchange(call)
            if not is_token_path(exchange.path):
                self._queues.setdefault((exchange.method, exchange.path), []).append(exchange)
        self.sent: list[tuple[str, str, str]] = []

    def send(self, *, method, target, headers, body, timeout, max_bytes) -> HttpResponse:
        path = urlsplit(target.url).path
        self.sent.append((method, target.host, path))
        if is_token_path(path):
            return token_answer()
        queue = self._queues.get((method, path)) or []
        if not queue:
            raise AssertionError(f"no recorded answer left for {method} {path}")
        exchange = queue.pop(0)
        return HttpResponse(exchange.status, exchange.headers, exchange.body)

    def unused(self) -> list[str]:
        return [f"{method} {path}" for (method, path), queue in self._queues.items() for _ in queue]

    def searches(self) -> int:
        return sum(1 for _method, _host, path in self.sent if not is_token_path(path))


class AnswerAllTransport:
    """Answers every request, token requests included, with one status and body: how a refusal or an outage looks."""

    def __init__(self, status: int, *, headers: Mapping[str, str] | None = None, body: bytes = b"{}") -> None:
        self._response = HttpResponse(status, {"content-type": "application/json", **(headers or {})}, body)
        self.sent = 0

    def send(self, **_kwargs) -> HttpResponse:
        self.sent += 1
        return self._response


def load_recording(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def client_for(spec: ProviderSpec, transport: Any) -> SafeHttpClient:
    """The real client, limited to the spec's hosts, with ``transport`` in place of the network."""

    return SafeHttpClient(spec.hosts, transport=transport, resolve=lambda _host: [PUBLIC_ADDRESS])


def kit_credentials(spec: ProviderSpec) -> dict[str, str]:
    return {item.name: f"kit-{item.name}" for item in spec.credential_fields}


@dataclass
class Run:
    """What one replay did, for further checks a test case makes."""

    provider: Any
    transport: ReplayTransport
    matches: list[PartMatch]
    offers: list[Offer]
    data: PartData | None
    offer_calls: int


class ContractChecks:
    """Mixed into a ``unittest.TestCase``. Set ``spec``, ``build`` and ``recordings``."""

    spec: ClassVar[ProviderSpec]
    # ``build(config, client=..., clock=..., monotonic=..., sleep=...)``: the adapter, as ``HttpProvider`` takes it.
    build: ClassVar[Callable[..., Any]]
    # File names under ``tests/fixtures/supply``, or recordings built in the test (the same shape, with a ``name``).
    recordings: ClassVar[tuple[str | Mapping[str, Any], ...]] = ()
    storefront: ClassVar[str] = ""
    currency: ClassVar[str] = ""
    # Credentials by field name, where the adapter wants a value of a certain form; the rest are made up.
    credentials: ClassVar[Mapping[str, str]] = {}

    def setUp(self) -> None:  # noqa: N802 - unittest
        super().setUp()  # type: ignore[misc]
        unrecognised._seen.clear()

    def tearDown(self) -> None:  # noqa: N802 - unittest
        self.assertEqual(set(unrecognised._seen), set(), "the adapter logged a value it does not know")  # type: ignore[attr-defined]
        super().tearDown()  # type: ignore[misc]

    # --- building ----------------------------------------------------------

    def config(self) -> ProviderConfig:
        return ProviderConfig(
            connector_id="kit", storefront=self.storefront, currency=self.currency, account="kit",
            credentials={**kit_credentials(self.spec), **self.credentials},
        )

    def adapter(self, transport: Any) -> Any:
        return type(self).build(
            self.config(), client=client_for(self.spec, transport), monotonic=lambda: 0.0, sleep=lambda _s: None,
        )

    # --- the spec ----------------------------------------------------------

    def test_the_spec_says_what_the_adapter_can_do(self) -> None:
        spec = self.spec
        provider = self.adapter(AnswerAllTransport(500))
        self.assertIsInstance(provider, SupplyProvider)
        self.assertTrue(spec.hosts, "an adapter that calls a web API names its hosts")
        self.assertIsInstance(provider, CallCounting, "every request is counted (build on providers/http.py)")
        self.assertEqual(spec.search_batch > 1, isinstance(provider, BatchSearch), "search_batch > 1 needs lookup_mpns, and lookup_mpns needs search_batch")
        for capability, protocol in ((CAP_PCN, ChangeNoticeReader), (CAP_SUBSTANCES, SubstanceReader), (CAP_SUBSTITUTES, SubstituteReader)):
            self.assertEqual(capability in spec.capabilities, isinstance(provider, protocol), f"capability {capability!r} and {protocol.__name__}")
        self.assertFalse(spec.dev_only or spec.csv_fed, "a web adapter is neither simulated nor fed by a file")

    # --- recorded answers --------------------------------------------------

    def replay(self, source: str | Mapping[str, Any]) -> Run:
        recording = load_recording(source) if isinstance(source, str) else source
        name = source if isinstance(source, str) else str(recording.get("name") or "a recording")
        self.assertEqual(recording.get("provider"), self.spec.key, f"{name} was recorded for another provider")
        transport = ReplayTransport(recording["calls"])
        provider = self.adapter(transport)
        matches = provider.lookup_mpn(recording["mpn"], recording.get("manufacturer"))
        self.check_matches(matches)
        offers: list[Offer] = []
        offer_calls = 0
        data = None
        if matches:
            skus = list(dict.fromkeys(match.sku for match in matches))[:RECORDED_OFFERS]
            before = transport.searches()
            offers = provider.get_offers(skus)
            offer_calls = transport.searches() - before
            self.check_offers(offers, skus)
            data = provider.get_part_data(matches[0])
            self.check_part_data(data, matches[0])
            batches = math.ceil(len(skus) / self.spec.max_batch)
            self.assertLessEqual(
                offer_calls, batches * self.spec.calls_per_offers_batch,
                f"{name}: reading {len(skus)} offers made {offer_calls} calls; the spec charges {self.spec.calls_per_offers_batch} a batch of {self.spec.max_batch}",
            )
        self.assertEqual(transport.unused(), [], f"{name}: recorded answers the adapter never asked for (a page skipped?)")
        self.assertEqual(provider.calls, len(transport.sent), f"{name}: the meter must count every request, token requests included")
        return Run(provider, transport, matches, offers, data, offer_calls)

    def test_recorded_answers(self) -> None:
        self.assertTrue(self.recordings, "an adapter is checked against at least one recording")
        for source in self.recordings:
            with self.subTest(recording=source if isinstance(source, str) else source.get("name")):  # type: ignore[attr-defined]
                self.replay(source)

    def test_no_skus_cost_no_call(self) -> None:
        transport = AnswerAllTransport(500)
        self.assertEqual(self.adapter(transport).get_offers([]), [])
        self.assertEqual(transport.sent, 0)

    # --- errors ------------------------------------------------------------

    def failing(self, transport: AnswerAllTransport, expected: type[ProviderError]) -> ProviderError:
        provider = self.adapter(transport)
        with self.assertRaises(expected) as caught:  # type: ignore[attr-defined]
            provider.lookup_mpn("LM358DR")
        self.assertEqual(provider.calls, transport.sent, "a failed request is still counted")
        return caught.exception

    def test_a_refusal_is_an_auth_error(self) -> None:
        self.failing(AnswerAllTransport(401), AuthError)

    def test_a_limit_is_rate_limited_with_its_wait(self) -> None:
        error = self.failing(AnswerAllTransport(429, headers={"retry-after": "30"}), RateLimited)
        self.assertEqual(error.retry_after_seconds, 30)

    def test_an_outage_is_unavailable(self) -> None:
        self.failing(AnswerAllTransport(503), Unavailable)

    def test_a_web_page_is_a_block(self) -> None:
        self.failing(AnswerAllTransport(200, headers={"content-type": "text/html"}, body=b"<!doctype html><title>Check</title>"), Blocked)

    def test_an_answer_that_is_not_json_is_a_provider_error(self) -> None:
        self.failing(AnswerAllTransport(200, body=b"not json"), ProviderError)

    def test_it_reaches_no_host_but_its_own(self) -> None:
        client = SafeHttpClient(self.spec.hosts, transport=AnswerAllTransport(200), resolve=lambda _host: [PUBLIC_ADDRESS])
        with self.assertRaises(EgressBlocked):  # type: ignore[attr-defined]
            client.request_json("GET", "https://elsewhere.example.org/")

    # --- shapes ------------------------------------------------------------

    def check_matches(self, matches: Any) -> None:
        self.assertIsInstance(matches, list)  # type: ignore[attr-defined]
        for match in matches:
            self.assertIsInstance(match, PartMatch)  # type: ignore[attr-defined]
            self.assertEqual(match.provider, self.spec.key)  # type: ignore[attr-defined]
            self.assert_link(match.product_url)
            self.assert_link(match.datasheet_url)
            if self.spec.search_reads_offers:
                self.assertIsInstance(match.offer, Offer, "search_reads_offers: a match carries its offer")  # type: ignore[attr-defined]

    def check_offers(self, offers: Any, skus: Sequence[str]) -> None:
        self.assertIsInstance(offers, list)  # type: ignore[attr-defined]
        for offer in offers:
            self.assertIsInstance(offer, Offer)  # type: ignore[attr-defined]
            self.assertEqual(offer.provider, self.spec.key)  # type: ignore[attr-defined]
            self.assertIn(offer.sku, skus, "an offer is for a number that was asked for")  # type: ignore[attr-defined]
            self.assertIsInstance(offer.packaging, Packaging)  # type: ignore[attr-defined]
            self.assertIsInstance(offer.lifecycle, Lifecycle)  # type: ignore[attr-defined]
            self.assert_link(offer.product_url)
            self.assert_link(offer.datasheet_url)

    def check_part_data(self, data: Any, match: PartMatch) -> None:
        self.assertIsInstance(data, PartData)  # type: ignore[attr-defined]
        self.assertEqual(data.match.sku, match.sku)  # type: ignore[attr-defined]
        self.assert_link(data.datasheet_url)

    def assert_link(self, url: str) -> None:
        if url:
            self.assertTrue(url.startswith(("https://", "http://")), f"not a link: {url[:60]}")  # type: ignore[attr-defined]
