"""TME (Transfer Multisort Elektronik), API v2.

Written against the OpenAPI 3.1 description TME publishes at
developers.tme.eu/en/api-doc/v2 (title "TME API", version "V2.0 Current
Version"). Tokens issued after 2026-05-14 only work with v2.

* Authentication: ``POST /auth/token`` with HTTP Basic (the 50 character token
  as user, the 20 character application secret as password) and
  ``grant_type=client_credentials``. The answer is a bearer token valid for
  ``expires_in`` seconds (300 in the documentation). It is kept for the life
  of this adapter and fetched again shortly before it expires, or once after a
  401.
* Search by part number: ``GET /products?mpns[]=...`` (up to 50).
* Stock and price: ``GET /products/data?symbols[]=...&scope[]=prices&scope[]=stock``
  (up to 50). Minimum order and multiples are only in ``GET /products``, so one
  batch of offers is two calls, and the spec says so (``calls_per_offers_batch``).

The storefront is the TME country (it sets prices and what can be ordered); the
connector currency, when set, is passed as ``currency``.

Product statuses map as follows. ``NOT_IN_OFFER`` and
``AVAILABLE_WHILE_STOCKS_LAST`` mean TME stops selling it: the listing is
discontinued at this distributor, which is not the manufacturer's lifecycle.
``EXTERNAL_WAREHOUSE`` is third-party stock, kept apart like marketplace stock.
``CANNOT_BE_ORDERED``, ``PRODUCT_BLOCKED`` and ``INVALID`` cannot be bought here,
so their stock counts as zero. Batches on the way (``deliveries``) are incoming stock
with their supply date. TME reports no manufacturer lifecycle, and no
retirement flag for every retired part; some come back with zero stock and a
backorder block only. v2 has no product page link, so it is built from the
symbol and the storefront (``tme.eu/<country>/details/<symbol>/``).

Prices of type ``GROSS`` include tax; they are turned into net prices with the
tax rate in the same answer, so every offer compares excluding VAT.
"""

from __future__ import annotations

import base64
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Mapping, Sequence
from urllib.parse import quote

from app.services.supply.identity import match_key
from app.services.supply.models import Incoming, Offer, PartData, PartMatch, PriceBreak
from app.services.supply.providers import packaging_hints
from app.services.supply.providers.base import (
    CAP_BATCH,
    CAP_OFFERS,
    CAP_SEARCH,
    CredentialField,
    ProviderConfig,
    ProviderError,
    ProviderSpec,
)
from app.services.supply.providers import normalise
from app.services.supply.providers.http import ClientCredentials, HttpProvider
from app.services.supply.providers.text_values import parse_count, parse_decimal
from app.services.supply.vocabulary import Packaging
from app.services.supply.providers.unrecognised import note

KEY = "tme"
BASE_URL = "https://api.tme.eu"
# No limit is known for this service: an assumed, polite pace, drawn at random from 0.75 to 1.5 times this (see pacing.py). Change it when a limit is learned.
PACE_SECONDS = 1.5
ALLOWED_HOSTS = ("api.tme.eu",)
MAX_BATCH = 50
# Fetch a new token this long before the old one expires.
TOKEN_MARGIN_SECONDS = 30

# Countries TME sells to that people are most likely to need; the storefront sets prices.
STOREFRONTS = (
    "AT", "BE", "CH", "CZ", "DE", "DK", "ES", "FI", "FR", "GB", "HU", "IE", "IT",
    "NL", "NO", "PL", "PT", "RO", "SE", "SK", "US",
)

_STOPPING = frozenset({"NOT_IN_OFFER", "AVAILABLE_WHILE_STOCKS_LAST"})
_NOT_ORDERABLE = frozenset({"CANNOT_BE_ORDERED", "PRODUCT_BLOCKED", "INVALID"})
_THIRD_PARTY = frozenset({"EXTERNAL_WAREHOUSE"})
# Seen from the live API, not in its documentation, and with no meaning for stock here.
_HARMLESS = frozenset({"BLOCKED_FOR_ZBL_BACKORDERS", "BLOCKED_FOR_ZBL_MP", "HARDLY_AVAILABLE"})
# Delivery statuses: stock on hand is ``stock_quantity``; a batch that still has to arrive is incoming.
_ON_HAND = "DS_AVAILABLE_IN_STOCK"
_ARRIVING = "DS_DELIVERY_NEEDS_CONFIRMATION"


class TmeProvider(HttpProvider):
    def __init__(self, config: ProviderConfig, **transport: Any) -> None:
        super().__init__(config, hosts=ALLOWED_HOSTS, pace_seconds=PACE_SECONDS, **transport)
        token = config.credentials.get("token", "")
        secret = config.credentials.get("secret", "")
        self._country = config.storefront
        self._currency = config.currency
        # Missing credentials surface on the first call, as an AuthError the poller acts on.
        basic = base64.b64encode(f"{token}:{secret}".encode()).decode() if token and secret else ""
        self._token = ClientCredentials(
            f"{BASE_URL}/auth/token", form={}, headers={"Authorization": f"Basic {basic}"}, label="TME", default_life=300,
            margin=TOKEN_MARGIN_SECONDS, missing="" if basic else "TME needs a token and an application secret",
        )

    # --- calls --------------------------------------------------------------

    def _get(self, path: str, params: Sequence[tuple[str, str]]) -> list[dict[str, Any]]:
        """GET an endpoint and return ``data.elements`` (or ``data.products.elements``)."""

        query = list(params)
        if self._country:
            query.append(("country", self._country))
        answer = self.authorised(
            self._token, "GET", f"{BASE_URL}{path}", lambda token: {"Authorization": f"Bearer {token}", "Accept-Language": "en"}, params=query,
        )
        if not isinstance(answer, dict) or answer.get("status") != "OK":
            raise ProviderError("TME answered without an OK status")
        data = answer.get("data") or {}
        if "products" in data:
            data = data.get("products") or {}
        elements = data.get("elements") or []
        return [element for element in elements if isinstance(element, dict)]

    def check_connection(self) -> None:
        """Ask for a fresh token: the cheapest call that proves the token and secret are accepted."""

        self._token.get(self, renew=True)

    # --- the contract ------------------------------------------------------

    def lookup_mpn(self, mpn: str, manufacturer: str | None = None) -> list[PartMatch]:
        wanted = match_key(mpn)
        matches = []
        for product in self._get("/products", [("mpns[]", mpn)]):
            match = self._search_match(product, wanted, strict=False)
            if match is not None:
                matches.append(match)
        return matches

    def lookup_mpns(self, mpns: Sequence[str]) -> dict[str, list[PartMatch]]:
        """Several manufacturer numbers in one call (up to ``MAX_BATCH``), keyed by each number's ``match_key``.

        A product is given to each asked number it lists among its manufacturer symbols; one that lists none of them
        is left out.
        """

        found: dict[str, list[PartMatch]] = {match_key(number): [] for number in mpns if match_key(number)}
        askable = list(dict.fromkeys(number.strip() for number in mpns if match_key(number)))
        for start in range(0, len(askable), MAX_BATCH):
            chunk = askable[start:start + MAX_BATCH]
            for product in self._get("/products", [("mpns[]", number) for number in chunk]):
                for number in chunk:
                    match = self._search_match(product, match_key(number), strict=True)
                    if match is not None:
                        found[match_key(number)].append(match)
        return found

    def _search_match(self, product: Mapping[str, Any], wanted: str, *, strict: bool) -> PartMatch | None:
        symbol = str(product.get("symbol") or "")
        if not symbol:
            return None
        numbers = [str(item) for item in product.get("manufacturer_symbols") or [] if item]
        # The part number TME lists for this symbol that is the one asked for, if any.
        here = next((item for item in numbers if match_key(item) == wanted), None)
        if here is None:
            if strict:
                return None
            here = numbers[0] if numbers else symbol
        return PartMatch(
            provider=KEY,
            sku=symbol,
            mpn=here,
            manufacturer=str((product.get("manufacturer") or {}).get("name") or ""),
            description=str(product.get("description") or ""),
            product_url=_page_url(symbol, self._country or ""),
        )

    def get_offers(self, skus: Sequence[str]) -> list[Offer]:
        offers: list[Offer] = []
        for start in range(0, len(skus), MAX_BATCH):
            offers.extend(self._offers_batch(list(skus[start:start + MAX_BATCH])))
        return offers

    def get_part_data(self, match: PartMatch) -> PartData:
        products = self._get("/products", [("symbols[]", match.sku)])
        product = next((item for item in products if item.get("symbol") == match.sku), None)
        if product is None:
            return PartData(match=match)
        return PartData(
            match=match,
            description=str(product.get("description") or ""),
            category=str((product.get("category") or {}).get("name") or ""),
        )

    # --- offers ------------------------------------------------------------

    def _offers_batch(self, skus: list[str]) -> list[Offer]:
        symbols = [("symbols[]", sku) for sku in skus]
        products = {item.get("symbol"): item for item in self._get("/products", symbols)}
        scope: list[tuple[str, str]] = [("scope[]", "prices"), ("scope[]", "stock")]
        if self._currency:
            scope.append(("currency", self._currency))
        data = {item.get("symbol"): item for item in self._get("/products/data", symbols + scope)}

        now = self._clock()
        offers = []
        for sku in skus:
            product, figures = products.get(sku), data.get(sku)
            if product is None or figures is None:
                continue  # unknown to TME now: left out, as the contract says
            offers.append(_offer(sku, product, figures, now, self._country or ""))
        return offers


def _net_prices(prices: Mapping[str, Any]) -> tuple[tuple[PriceBreak, ...], str]:
    currency = str(prices.get("currency") or "").upper()
    gross = str(prices.get("type") or "").upper() == "GROSS"
    rate = parse_decimal((prices.get("tax") or {}).get("rate")) if gross else None

    def net(price: object) -> object:
        value = parse_decimal(price)
        return (value / (1 + rate / 100)).quantize(Decimal("0.000001")) if value is not None and rate else price

    breaks = normalise.price_breaks((tier.get("amount"), net(tier.get("price"))) for tier in prices.get("elements") or [])
    if not breaks or len(currency) != 3:
        return (), ""
    return breaks, currency


def _incoming(figures: Mapping[str, Any]) -> tuple[Incoming, ...]:
    """Batches TME has on the way, with the date it expects them when it gives one."""

    found = []
    for item in (figures.get("deliveries") or {}).get("elements") or []:
        if not isinstance(item, dict):
            continue
        status = str(item.get("status") or "")
        if status == _ARRIVING:
            quantity = parse_count(item.get("amount"))
            if not quantity:
                continue
            expected = None
            try:
                expected = date.fromisoformat(str((item.get("data") or {}).get("supply_date") or "")[:10])
            except ValueError:
                pass
            found.append(Incoming(quantity, expected))
        elif status != _ON_HAND:
            note(KEY, "delivery status", status)
    return tuple(found)


def _page_url(sku: str, country: str) -> str:
    """The product page; TME redirects the short form to the full one."""

    if not sku or "/" in sku:
        return ""
    site = {"": "en", "GB": "en"}.get(country.upper(), country.lower())
    return f"https://www.tme.eu/{quote(site)}/details/{quote(sku.lower(), safe='')}/"


def _packing(product: Mapping[str, Any]) -> tuple[Packaging, int | None]:
    """The packaging TME names for a product ("Reel", amount 2500), and the reel size when it is a reel."""

    packing = product.get("packing")
    elements = [item for item in (packing.get("elements") if isinstance(packing, dict) else None) or [] if isinstance(item, dict)]
    if not elements:
        return Packaging.UNKNOWN, None
    first = elements[0]
    packaging = packaging_hints.from_text(first.get("translation"))
    return packaging, parse_count(first.get("amount")) if packaging is Packaging.TAPE_REEL else None


def _offer(sku: str, product: Mapping[str, Any], figures: Mapping[str, Any], now: datetime, country: str = "") -> Offer:
    statuses = {str(item).upper() for item in product.get("product_status") or []}
    for status in sorted(statuses - _STOPPING - _NOT_ORDERABLE - _THIRD_PARTY - _HARMLESS):
        note(KEY, "product status", status)
    stock = parse_count(figures.get("stock_quantity")) or 0
    if statuses & _NOT_ORDERABLE:
        stock = 0
    breaks, currency = _net_prices(figures.get("prices") or {})
    numbers = [str(item) for item in product.get("manufacturer_symbols") or [] if item]
    packaging, reel = _packing(product)
    moq = max(parse_count(product.get("minimal_amount")) or 1, 1)
    # The packing is how the maker ships it ("Reel", 3,000); what TME sells is told by where its price breaks start.
    packaging, reel, inferred = packaging_hints.sold_as(packaging, reel, breaks[0].quantity if breaks else moq)
    return Offer(
        provider=KEY,
        sku=sku,
        mpn=numbers[0] if numbers else sku,
        manufacturer=str((product.get("manufacturer") or {}).get("name") or ""),
        stock=stock,
        fetched_at=now,
        incoming=_incoming(figures),
        moq=moq,
        order_multiple=max(parse_count(product.get("multiples")) or 1, 1),
        packaging=packaging,
        packaging_inferred=inferred,
        reel_size=reel,
        price_breaks=breaks,
        currency=currency,
        discontinued=bool(statuses & _STOPPING),
        marketplace=bool(statuses & _THIRD_PARTY),
        product_url=_page_url(sku, country),
    )


SPEC = ProviderSpec(
    key=KEY,
    hosts=ALLOWED_HOSTS,
    label="TME",
    capabilities=frozenset({CAP_SEARCH, CAP_OFFERS, CAP_BATCH}),
    max_batch=MAX_BATCH,
    search_batch=MAX_BATCH,
    stock_pooling="separate",
    credential_fields=(
        CredentialField("token", "Token"),
        CredentialField("secret", "Application secret"),
    ),
    factory=lambda config: TmeProvider(config),
    storefronts=STOREFRONTS,
    default_daily_budget=1000,
    calls_per_offers_batch=2,
    standard_packaging=True,
)
