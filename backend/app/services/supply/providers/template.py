"""A template adapter: copy it to start a new distributor ("Add a distributor" in the contributor docs).

It is not registered. It talks to a made-up API at ``api.example.com`` whose answers are in
``tests/fixtures/supply/template_live_lm358dr.json``, and ``tests/test_supply_provider_contract.py`` runs it through the
contract kit like every built-in adapter, so it stays a working example.

The made-up API:

* ``POST /v1/search`` with ``{"mpns": [...], "page": n}`` and an ``X-Api-Key`` header: ``{"results": [...], "next_page": n}``,
  each result naming the number it was found for (``asked``). Up to ``SEARCH_BATCH`` numbers a call; ``next_page`` is set
  while there are more results.
* ``GET /v1/offers?skus=a,b``: ``{"offers": [...]}`` with stock, order terms, packaging and price breaks. Up to ``MAX_BATCH``
  numbers a call; a number it no longer knows is missing from the answer.
* ``GET /v1/parts/{sku}``: description, datasheet, category and attributes. 404 for a number it does not know.
* ``GET /v1/account``: answers when the key is good.

Copy this file to ``providers/<key>.py``, rename the class, ``KEY``, ``HOSTS`` and the URLs, map the real answers, add a
``register`` line in ``registry.py``, and record an answer (``scripts/record_supply_answer.py``) for the contract test.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Mapping, Sequence
from urllib.parse import quote

from app.services.supply.identity import match_key
from app.services.supply.models import Offer, PartData, PartMatch
from app.services.supply.providers import normalise
from app.services.supply.providers.base import (
    CAP_BATCH,
    CAP_LIFECYCLE,
    CAP_OFFERS,
    CAP_SEARCH,
    AuthError,
    CredentialField,
    NotFound,
    ProviderConfig,
    ProviderError,
    ProviderSpec,
)
from app.services.supply.providers.http import HttpProvider
from app.services.supply.providers.text_values import parse_count
from app.services.supply.providers.unrecognised import note
from app.services.supply.vocabulary import Lifecycle

# A key: lower case, stored with every listing, never changed once released.
KEY = "example"
API_URL = "https://api.example.com/v1"
# Every host the adapter calls. Its HTTP client reaches no other.
HOSTS = ("api.example.com",)
# The gap between two calls of one account: under the distributor's published per-minute limit (see ``pacing.py``).
PACE_SECONDS = 1.0
SEARCH_BATCH = 10
MAX_BATCH = 20
# A search stops after this many pages (each a call), however many the answer says there are.
MAX_PAGES = 3

# The distributor's lifecycle words, lower case. A word not here is read as unknown and noted once (``unrecognised``).
_LIFECYCLE = {
    "active": Lifecycle.ACTIVE,
    "nrnd": Lifecycle.NRND,
    "last time buy": Lifecycle.LAST_TIME_BUY,
    "obsolete": Lifecycle.OBSOLETE,
}


class ExampleProvider(HttpProvider):
    def __init__(self, config: ProviderConfig, **transport: Any) -> None:
        # ``transport`` is how a test hands in a client and clocks; Prism passes nothing.
        super().__init__(config, hosts=HOSTS, pace_seconds=PACE_SECONDS, **transport)
        self._api_key = config.credentials.get("api_key", "")
        self._currency = config.currency

    # --- calls --------------------------------------------------------------

    def _call(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        if not self._api_key:
            raise AuthError("Example Parts needs an API key")
        answer = self.request(method, f"{API_URL}{path}", headers={"X-Api-Key": self._api_key}, **kwargs)
        if not isinstance(answer, dict):
            raise ProviderError("Example Parts answered with something other than an object")
        return answer

    def check_connection(self) -> None:
        self._call("GET", "/account")

    # --- the contract ------------------------------------------------------

    def lookup_mpn(self, mpn: str, manufacturer: str | None = None) -> list[PartMatch]:
        # The manufacturer is a ranking hint only: Prism decides whether a maker is the same.
        wanted = match_key(mpn)
        return self.lookup_mpns([mpn]).get(wanted, []) if wanted else []

    def lookup_mpns(self, mpns: Sequence[str]) -> dict[str, list[PartMatch]]:
        found: dict[str, list[PartMatch]] = {match_key(number): [] for number in mpns if match_key(number)}
        askable = list(dict.fromkeys(number.strip() for number in mpns if match_key(number)))
        for start in range(0, len(askable), SEARCH_BATCH):
            chunk = askable[start:start + SEARCH_BATCH]
            page = 0
            for _ in range(MAX_PAGES):
                answer = self._call("POST", "/search", json={"mpns": chunk, "page": page})
                for result in answer.get("results") or []:
                    match = _match(result) if isinstance(result, dict) else None
                    asked = match_key(str((result or {}).get("asked") or ""))
                    if match is not None and asked in found:
                        found[asked].append(match)
                next_page = answer.get("next_page")
                if not isinstance(next_page, int) or next_page <= page:
                    break
                page = next_page
        return found

    def get_offers(self, skus: Sequence[str]) -> list[Offer]:
        offers: list[Offer] = []
        wanted = list(dict.fromkeys(skus))
        now = self._clock()
        for start in range(0, len(wanted), MAX_BATCH):
            chunk = wanted[start:start + MAX_BATCH]
            answer = self._call("GET", "/offers", params={"skus": ",".join(chunk)})
            for item in answer.get("offers") or []:
                if isinstance(item, dict) and item.get("sku") in chunk:
                    offers.append(_offer(item, now))
        return offers

    def get_part_data(self, match: PartMatch) -> PartData:
        try:
            part = self._call("GET", f"/parts/{quote(match.sku, safe='')}")
        except NotFound:
            return PartData(match=match)
        return PartData(
            match=match,
            description=str(part.get("description") or match.description),
            datasheet_url=str(part.get("datasheet") or ""),
            package_name=str(part.get("package") or ""),
            category=str(part.get("category") or ""),
            parameters=tuple(
                (str(item.get("name")), str(item.get("value") or ""))
                for item in part.get("attributes") or [] if isinstance(item, dict) and item.get("name")
            ),
        )


# --- reading an answer -------------------------------------------------------


def _match(result: Mapping[str, Any]) -> PartMatch | None:
    sku, mpn = str(result.get("sku") or "").strip(), str(result.get("mpn") or "").strip()
    if not sku or not mpn:
        return None
    return PartMatch(
        provider=KEY, sku=sku, mpn=mpn, manufacturer=str(result.get("manufacturer") or ""),
        description=str(result.get("description") or ""), product_url=str(result.get("url") or ""),
    )


def _lifecycle(word: object) -> Lifecycle:
    text = str(word or "").strip().lower()
    if not text:
        return Lifecycle.UNKNOWN
    if text not in _LIFECYCLE:
        note(KEY, "lifecycle", text)
    return _LIFECYCLE.get(text, Lifecycle.UNKNOWN)


def _offer(item: Mapping[str, Any], now: datetime) -> Offer:
    breaks = normalise.price_breaks((tier.get("qty"), tier.get("price")) for tier in item.get("prices") or [] if isinstance(tier, dict))
    return Offer(
        provider=KEY,
        sku=str(item["sku"]),
        mpn=str(item.get("mpn") or ""),
        manufacturer=str(item.get("manufacturer") or ""),
        stock=parse_count(item.get("stock")) or 0,
        fetched_at=now,
        moq=parse_count(item.get("moq")) or 1,
        order_multiple=parse_count(item.get("multiple")) or 1,
        packaging=normalise.packaging_word(item.get("packaging")),
        price_breaks=breaks,
        currency=str(item.get("currency") or "").upper() if breaks else "",
        lifecycle=_lifecycle(item.get("lifecycle")),
        rohs=normalise.rohs_word(item.get("rohs")),
        product_url=str(item.get("url") or ""),
    )


SPEC = ProviderSpec(
    key=KEY,
    label="Example Parts",
    hosts=HOSTS,
    capabilities=frozenset({CAP_SEARCH, CAP_OFFERS, CAP_LIFECYCLE, CAP_BATCH}),
    max_batch=MAX_BATCH,
    search_batch=SEARCH_BATCH,
    # "pooled": one stock figure for all packagings; "separate": each listing has its own.
    stock_pooling="separate",
    credential_fields=(CredentialField("api_key", "API key"),),
    factory=lambda config: ExampleProvider(config),
    default_daily_budget=1000,
)
