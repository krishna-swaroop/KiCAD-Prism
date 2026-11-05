"""Farnell, Newark and element14: the Product Search API (REST).

Written against the description element14 publishes at
partner.element14.com/docs/Product_Search_API_REST__Description, and run against the live service on 2026-10-13
(the manufacturer-number search, the ``id`` search and the ``medium`` group all answer as described).

* Endpoint: ``GET https://api.element14.com/catalog/products``. Generic access needs only
  ``callInfo.apiKey``; contract pricing (a signature) is not used here.
* ``storeInfo.id`` is mandatory and is the store's domain (``uk.farnell.com``, ``www.newark.com``...). That
  is the connector's storefront. The answer does not say which currency its prices are in. The connector's
  currency is used when it names one; otherwise the store's own currency, for the stores where that is not in
  doubt (``STORE_CURRENCY``). For any other store offers have no price until the connector names a currency.
* ``productURL`` (description version 1.3) comes back null from the live service, so a product link is a search
  on the store for the SKU, which lands on the product page.
* Search: ``term=manuPartNum:<number>``. Offers: ``term=id:<SKU>``. ``resultsSettings.responseGroup=medium``
  carries stock, prices, status and RoHS. The description shows several SKUs in one ``id`` term but says
  nothing about a limit, so one SKU is asked for per call until that is checked against the service.
* The wrapper around a manufacturer-number or SKU answer is not in the description (only the keyword
  search's ``keywordSearchReturn`` is), so the first object holding a ``products`` list is used.

Meanings taken from the description: ``stock.level`` is units on hand and ``stock.leastLeadTime`` the
shortest lead time (read as days); ``prices`` is a list of ``from``/``to``/``cost`` quantity bands, so ``from``
is the break and ``cost`` the unit price (inferred from its example); ``translatedMinimumOrderQuality`` is the
minimum order; ``productStatus`` ``NO_LONGER_MANUFACTURED`` is the manufacturer's end; ``releaseStatusCode``
6 and 7 (to be discontinued, discontinued) and ``NO_LONGER_STOCKED`` mean Farnell itself is dropping the part.
No limits are given; one call a second and 1,000 a day are used until they are known. Offers are read ten SKUs
a call (one ``id`` term, SKUs separated by spaces, checked live 2026-10-14); a manufacturer number search takes one
number, since several in one ``manuPartNum`` term find nothing.
"""

from __future__ import annotations

import unicodedata
from datetime import datetime
from urllib.parse import quote
from typing import Any, Mapping, Sequence

from app.services.supply.models import Offer, PartData, PartMatch, PriceBreak
from app.services.supply.providers.base import (
    CAP_LIFECYCLE,
    CAP_OFFERS,
    CAP_SEARCH,
    AuthError,
    CredentialField,
    ProviderConfig,
    ProviderError,
    ProviderSpec,
)
from app.services.supply.identity import keep_family, match_key
from app.services.supply.providers import normalise
from app.services.supply.providers.http import HttpProvider
from app.services.supply.providers.text_values import parse_count, parse_decimal
from app.services.supply.providers.unrecognised import note
from app.services.supply.vocabulary import Lifecycle, Packaging

KEY = "farnell"
BASE_URL = "https://api.element14.com/catalog/products"
ALLOWED_HOSTS = ("api.element14.com",)
# No limit is known for this service: an assumed, polite pace, drawn at random from 0.75 to 1.5 times this (see pacing.py). Change it when a limit is learned.
PACE_SECONDS = 1.5
MAX_MATCHES = 10
# A search asks for further pages while the answer says more exist, up to this many pages (each a call).
MAX_PAGES = 5

STOREFRONTS = (
    "bg.farnell.com", "cz.farnell.com", "dk.farnell.com", "at.farnell.com", "ch.farnell.com", "de.farnell.com",
    "cpc.farnell.com", "cpcireland.farnell.com", "export.farnell.com", "onecall.farnell.com", "ie.farnell.com",
    "il.farnell.com", "uk.farnell.com", "es.farnell.com", "ee.farnell.com", "fi.farnell.com", "fr.farnell.com",
    "hu.farnell.com", "it.farnell.com", "lt.farnell.com", "lv.farnell.com", "be.farnell.com", "nl.farnell.com",
    "no.farnell.com", "pl.farnell.com", "pt.farnell.com", "ro.farnell.com", "ru.farnell.com", "sk.farnell.com",
    "si.farnell.com", "se.farnell.com", "tr.farnell.com", "canada.newark.com", "mexico.newark.com", "www.newark.com",
    "cn.element14.com", "au.element14.com", "nz.element14.com", "hk.element14.com", "sg.element14.com",
    "my.element14.com", "ph.element14.com", "th.element14.com", "in.element14.com", "tw.element14.com",
    "kr.element14.com", "vn.element14.com",
)

# Stores whose prices are in their country's currency, which is not in doubt. The API does not say, so any store not
# listed here needs the currency set on the connector.
_EURO_STORES = (
    "at", "be", "de", "es", "fi", "fr", "ie", "it", "lt", "lv", "nl", "pt", "sk", "si", "ee",
)
STORE_CURRENCY: Mapping[str, str] = {
    "uk.farnell.com": "GBP",
    "www.newark.com": "USD",
    "canada.newark.com": "CAD",
    "in.element14.com": "INR",
    **{f"{code}.farnell.com": "EUR" for code in _EURO_STORES},
}

# Meaning of these is in the description. Anything else is logged once and read as having no effect.
_STATUS_ENDED = "NO_LONGER_MANUFACTURED"
_STATUS_DROPPED = frozenset({"NO_LONGER_STOCKED"})
_STATUS_KNOWN = frozenset({"STOCKED", "DIRECT_SHIP", "DEFAULTSTATUS"}) | _STATUS_DROPPED | {_STATUS_ENDED}
_RELEASE_DROPPING = frozenset({6, 7})
_STOCK_STATUS_ENDED = -3


class FarnellProvider(HttpProvider):
    def __init__(self, config: ProviderConfig, **transport: Any) -> None:
        super().__init__(config, hosts=ALLOWED_HOSTS, pace_seconds=PACE_SECONDS, **transport)
        self._api_key = config.credentials.get("api_key", "")
        self._store = config.storefront
        self._currency = config.currency or STORE_CURRENCY.get(config.storefront, "")

    def _search(self, term: str, *, pages: int = 1) -> list[dict[str, Any]]:
        """The products a term finds, ``MAX_MATCHES`` a call, asking for the next page while the answer says there are more
        (``numberOfResults``), up to ``pages`` calls."""

        if not self._api_key:
            raise AuthError("Farnell needs an API key")
        if not self._store:
            raise ProviderError("Farnell needs a store, such as uk.farnell.com")
        found: list[dict[str, Any]] = []
        for page in range(pages):
            answer = self.request("GET", BASE_URL, params={
                "term": term,
                "storeInfo.id": self._store,
                "resultsSettings.responseGroup": "medium",
                "resultsSettings.offset": str(page * MAX_MATCHES),
                "resultsSettings.numberOfResults": str(MAX_MATCHES),
                "callInfo.responseDataFormat": "JSON",
                "callInfo.apiKey": self._api_key,
            })
            products = _products(answer)
            found += products
            if len(products) < MAX_MATCHES or len(found) >= _total(answer):
                break
        return found

    # --- the contract ------------------------------------------------------

    def lookup_mpn(self, mpn: str, manufacturer: str | None = None) -> list[PartMatch]:
        wanted = match_key(mpn)
        if not wanted:
            return []
        found = [
            product for product in self._search(f"manuPartNum:{mpn.strip()}", pages=MAX_PAGES)
            if product.get("sku") and product.get("translatedManufacturerPartNumber")
        ]
        return [
            _match(product, str(product["sku"]), str(product["translatedManufacturerPartNumber"]), self._store)
            for product in keep_family(found, wanted, lambda product: str(product["translatedManufacturerPartNumber"]))
        ]

    def lookup_family(self, mpn: str) -> list[PartMatch]:
        """The number and its longer forms: a keyword search (``any:``), not the exact manufacturer-number term, kept to the same
        number and its longer forms. One call; used when the exact search found nothing that counts."""

        wanted = match_key(mpn)
        if not wanted:
            return []
        found = [
            product for product in self._search(f"any:{mpn.strip()}", pages=MAX_PAGES)
            if product.get("sku") and product.get("translatedManufacturerPartNumber")
        ]
        return [
            _match(product, str(product["sku"]), str(product["translatedManufacturerPartNumber"]), self._store)
            for product in keep_family(found, wanted, lambda product: str(product["translatedManufacturerPartNumber"]))
        ]

    def get_offers(self, skus: Sequence[str]) -> list[Offer]:
        # Several SKUs go in one ``id`` term, separated by spaces (checked live on 2026-10-14: four SKUs, one call, all four
        # answered, in no fixed order). One answer holds at most ``MAX_MATCHES`` products, which sets the batch size.
        wanted = [sku for sku in dict.fromkeys(skus) if sku and not any(ch.isspace() for ch in sku)]
        offers = []
        for start in range(0, len(wanted), MAX_MATCHES):
            chunk = wanted[start:start + MAX_MATCHES]
            found = {str(p.get("sku") or ""): p for p in self._search("id:" + " ".join(chunk))}
            offers += [_offer(sku, found[sku], self._currency, self._clock(), self._store) for sku in chunk if sku in found]
        return offers

    def get_part_data(self, match: PartMatch) -> PartData:
        product = next((p for p in self._search(f"id:{match.sku}") if str(p.get("sku") or "") == match.sku), None)
        if product is None:
            return PartData(match=match)
        sheets = [d for d in product.get("datasheets") or [] if isinstance(d, dict) and d.get("url")]
        return PartData(
            match=match,
            description=str(product.get("displayName") or ""),
            datasheet_url=str(sheets[0]["url"]) if sheets else "",
        )


def _total(answer: Any) -> int:
    """How many products the search found in all, as the answer's wrapper says (0 when it does not)."""

    for holder in [value for value in answer.values() if isinstance(value, dict)] if isinstance(answer, dict) else []:
        if "numberOfResults" in holder:
            return parse_count(holder.get("numberOfResults")) or 0
    return 0


def _products(answer: Any) -> list[dict[str, Any]]:
    """The products of an answer, whatever its wrapper is called."""

    if not isinstance(answer, dict):
        raise ProviderError("Farnell answered with something other than an object")
    holders = [answer] + [value for value in answer.values() if isinstance(value, dict)]
    for holder in holders:
        products = holder.get("products")
        if isinstance(products, list):
            return [p for p in products if isinstance(p, dict)]
    return []


def page_url(store: str, sku: str, product: Mapping[str, Any]) -> str:
    """The product page: the address the service gives when it gives one, else the store's search for the SKU."""

    given = str(product.get("productURL") or "").strip()
    if given.lower().startswith("https://"):
        return given
    return f"https://{store}/search?st={quote(sku, safe='')}" if store else ""


def _match(product: Mapping[str, Any], sku: str, number: str, store: str = "") -> PartMatch:
    return PartMatch(
        provider=KEY,
        sku=sku,
        mpn=number,
        manufacturer=str(product.get("brandName") or ""),
        description=str(product.get("displayName") or ""),
        product_url=page_url(store, sku, product),
        datasheet_url=next((str(d["url"]) for d in product.get("datasheets") or [] if isinstance(d, dict) and d.get("url")), ""),
    )


def _pack(product: Mapping[str, Any]) -> int:
    """Pieces in the unit Farnell sells: 1000 for "CONFEZIONE DA 1000". Prices, breaks, stock and minimum are in these units."""
    return max(parse_count(product.get("packSize")) or 1, 1)


def _price_breaks(product: Mapping[str, Any]) -> tuple[PriceBreak, ...]:
    pack = _pack(product)
    bands = [(parse_count(band.get("from")), parse_decimal(band.get("cost"))) for band in product.get("prices") or [] if isinstance(band, dict)]
    # A band is priced per unit of sale (a pack of ``pack`` pieces): per piece here, from the pieces it starts at.
    return normalise.price_breaks((quantity * pack if quantity else None, cost / pack if cost is not None else None) for quantity, cost in bands)


# Each store words the unit in its own language ("EACH (SUPPLIED ON CUT TAPE)", "STÜCK (GURTABSCHNITT)", "UNITÀ, FORNITO SU
# NASTRO TAGLIATO"). These are the phrases read live from the stores of the UK, Germany, France, Spain, the Netherlands,
# Belgium, Sweden, Denmark, Finland, Portugal, Austria, Switzerland and Italy. A phrase not here says nothing.
_CUT_TAPE = (
    "CUT TAPE", "GURTABSCHNITT", "BANDE DECOUPEE", "CINTA CORTADA", "AFGESNEDEN", "KLIPPT REMSA", "KLIPPET BAND", "LEIKATTU NAUHA",
    "NASTRO TAGLIATO", "FITA E ROLO CORTADOS",
)
_FULL_REEL = (
    "FULL REEL", "GANZE ROLLE", "BOBINE COMPLETE", "ROLLO COMPLETO", "VOLLEDIG", "HEL RULLE", "TAYSI KELA", "BOBINA COMPLETA",
    "ROLO COMPLETOS",
)


def _folded(text: str) -> str:
    """Upper case with accents and the second letters of ligatures taken off, so "BANDE DÉCOUPÉE" reads "BANDE DECOUPEE"."""

    return "".join(char for char in unicodedata.normalize("NFKD", text.upper()) if not unicodedata.combining(char))


def _packaging(product: Mapping[str, Any]) -> Packaging:
    """Farnell words it in the unit, in the store's language. Other units say nothing, but ``reeling`` marks a re-reeled length."""

    # Sold re-reeled (an "RL" number): a length of tape wound on a reel for a fee, which is what a custom reel is. Its unit still
    # reads "cut tape", and its prices are the cut tape's; what sets it apart is the smallest order and the reel.
    if product.get("reeling") is True:
        return Packaging.CUSTOM_REEL
    unit = _folded(str(product.get("unitOfMeasure") or ""))
    if any(phrase in unit for phrase in _CUT_TAPE):
        return Packaging.CUT_TAPE
    if any(phrase in unit for phrase in _FULL_REEL):
        return Packaging.TAPE_REEL
    return Packaging.UNKNOWN


def _rohs(code: object) -> bool | None:
    value = str(code or "").strip().upper()
    # "Y-EX" was seen live: compliant by an exemption.
    if value in ("YES", "Y", "Y-EX"):
        return True
    if value in ("NO", "N"):
        return False
    # "NA" was seen live on a coin cell: the rule does not apply.
    if value and value != "NA":
        note(KEY, "RoHS code", value)
    return None


def _offer(sku: str, product: Mapping[str, Any], currency: str, now: datetime, store: str = "") -> Offer:
    stock_info = product.get("stock") if isinstance(product.get("stock"), dict) else {}
    pack = _pack(product)
    stock = (parse_count(stock_info.get("level")) or 0) * pack
    status = str(product.get("productStatus") or "").strip().upper()
    if status and status not in _STATUS_KNOWN:
        note(KEY, "product status", status)
    release = parse_count(product.get("releaseStatusCode"))
    ended = status == _STATUS_ENDED or stock_info.get("status") == _STOCK_STATUS_ENDED
    breaks = _price_breaks(product) if currency else ()
    moq = max(parse_count(product.get("translatedMinimumOrderQuality")) or 1, 1) * pack
    packaging = _packaging(product)
    lead = parse_count(stock_info.get("leastLeadTime"))
    return Offer(
        provider=KEY,
        sku=sku,
        mpn=str(product.get("translatedManufacturerPartNumber") or sku),
        manufacturer=str(product.get("brandName") or ""),
        stock=stock,
        fetched_at=now,
        moq=moq,
        # A pack is the smallest thing sold: the price is the pack's, so everything above is in pieces.
        order_multiple=pack,
        packaging=packaging,
        reel_size=pack if packaging is Packaging.TAPE_REEL and pack > 1 else None,
        price_breaks=breaks,
        currency=currency if breaks else "",
        lead_time_days=lead if lead is not None and stock < moq else None,
        lifecycle=Lifecycle.OBSOLETE if ended else Lifecycle.UNKNOWN,
        discontinued=status in _STATUS_DROPPED or release in _RELEASE_DROPPING,
        rohs=_rohs(product.get("rohsStatusCode")),
        product_url=page_url(store, sku, product),
        datasheet_url=next((str(d["url"]) for d in product.get("datasheets") or [] if isinstance(d, dict) and d.get("url")), ""),
    )


SPEC = ProviderSpec(
    key=KEY,
    hosts=ALLOWED_HOSTS,
    limits_storage=True,
    label="Farnell / Newark / element14",
    capabilities=frozenset({CAP_SEARCH, CAP_OFFERS, CAP_LIFECYCLE}),
    max_batch=MAX_MATCHES,
    stock_pooling="separate",
    credential_fields=(CredentialField("api_key", "API key"),),
    factory=lambda config: FarnellProvider(config),
    storefronts=STOREFRONTS,
    default_daily_budget=1000,
    guesses_packaging=False,
)
