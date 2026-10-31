"""Mouser Search API, version 1.

Written against the Swagger 2.0 description Mouser serves at
api.mouser.com/api/docs/V1 (the page at /api/docs/ui/index renders it).

* ``POST /api/v1/search/partnumber?apiKey=...`` with
  ``{"SearchByPartRequest": {"mouserPartNumber": "A|B", "partSearchOptions": "Exact"}}``.
  Despite its name the field takes Mouser or manufacturer part numbers, up to 10
  separated by ``|``, each 3 to 40 characters. ``Exact`` keeps the answer to the
  numbers asked for, so a search does not flood Review with every suffix.
  One call serves both discovery and polling.
* Errors come back as HTTP 200 with an ``Errors`` list. An error about the API key
  is treated as rejected credentials; any other is a provider error.

The answer is display text: stock as "1,234 In Stock", prices as currency
strings, lead time as "84 Days". ``text_values`` reads them. Prices are in the
currency of the account behind the key; there is no storefront to choose.

Compliance and trade. ``ROHSStatus`` and the ``ProductCompliance`` list (``USHTS``, ``TARIC``, ``CNHTS``,
``ECCN`` and other codes, seen live) are kept as facts with each offer (``facts.py``); ``SuggestedReplacement``
too. No extra call.

Substances. ``REACH-SVHC``, a list of strings, is on each part in the version 1 description, so it is read with
the offer and costs no call (``Offer.substances``); a part without it states nothing. Version 2's
``search/partnumberandmanufacturer``, read once a week per listing before, is not used: it needs the manufacturer in
Mouser's own spelling and refuses the one version 1 returns for some makers ("Panasonic Industry"), and in live calls on
30 Oct 2026 neither version listed the field for any of five listings.

Mouser's published limits (30 calls a minute, 1,000 a day) are not in the
description; the default daily budget follows them, and calls from one adapter
are spaced ``PACE_SECONDS`` apart so a run cannot burst past the minute.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Mapping, Sequence

from app.services.supply.identity import keep_family, match_key
from app.services.supply.models import Alternate, Incoming, Offer, PartData, PartMatch, PriceBreak
from app.services.supply.providers.base import (
    CAP_BATCH,
    CAP_INCOMING,
    CAP_LIFECYCLE,
    CAP_OFFERS,
    CAP_SEARCH,
    AuthError,
    CredentialField,
    ProviderConfig,
    ProviderError,
    ProviderSpec,
)
from app.services.supply.providers import normalise
from app.services.supply.providers.http import HttpProvider
from app.services.supply.providers.text_values import parse_count, parse_lead_time_days
from app.services.supply.providers.unrecognised import note
from app.services.supply.vocabulary import Lifecycle, Packaging

KEY = "mouser"
SEARCH_URL = "https://api.mouser.com/api/v1/search/partnumber"
ALLOWED_HOSTS = ("api.mouser.com",)
MAX_BATCH = 10
# Mouser's 30 calls a minute (published, and confirmed). Each gap is drawn at random from 0.75 to 1.5 times this (see pacing.py), so the average
# is about 2.25 s: roughly 27 a minute, 90% of the limit.
PACE_SECONDS = 2.0

# Mouser's lifecycle wording, lower case, to the canonical set. Anything else is unknown.
_LIFECYCLE = {
    "new product": Lifecycle.ACTIVE,
    "new at mouser": Lifecycle.ACTIVE,
    "active": Lifecycle.ACTIVE,
    "not recommended for new designs": Lifecycle.NRND,
    "nrnd": Lifecycle.NRND,
    # Mouser has no separate stage between an end of life notice and the last buy; both warn.
    "end of life": Lifecycle.LAST_TIME_BUY,
    "last time buy": Lifecycle.LAST_TIME_BUY,
    "obsolete": Lifecycle.OBSOLETE,
}

class MouserProvider(HttpProvider):
    def __init__(self, config: ProviderConfig, **transport: Any) -> None:
        super().__init__(config, hosts=ALLOWED_HOSTS, pace_seconds=PACE_SECONDS, **transport)
        self._api_key = config.credentials.get("api_key", "")

    def _post(self, url: str, body: Mapping[str, Any]) -> Any:
        if not self._api_key:
            raise AuthError("Mouser needs an API key")
        return self.request("POST", url, params={"apiKey": self._api_key}, json=body)

    def _search(self, numbers: Sequence[str], *, exact: bool = True) -> list[dict[str, Any]]:
        answer = self._post(SEARCH_URL, {"SearchByPartRequest": {"mouserPartNumber": "|".join(numbers), "partSearchOptions": "Exact" if exact else "None"}})
        if not isinstance(answer, dict):
            raise ProviderError("Mouser answered with something other than an object")
        _raise_for_errors(answer.get("Errors") or [])
        results = answer.get("SearchResults") or {}
        return [part for part in results.get("Parts") or [] if isinstance(part, dict)]

    # --- the contract ------------------------------------------------------

    def lookup_mpn(self, mpn: str, manufacturer: str | None = None) -> list[PartMatch]:
        if not 3 <= len(mpn.strip()) <= 40:
            return []  # outside what the search accepts; nothing to ask
        return [match for part in self._search([mpn.strip()]) if (match := _match(part)) is not None]

    def lookup_family(self, mpn: str) -> list[PartMatch]:
        """The number and its longer forms (``74AHC1G09GV`` -> ``74AHC1G09GV,125``): the search without ``Exact``, kept to the
        same number and its longer forms. One call; used when the exact search found nothing that counts."""

        wanted = match_key(mpn)
        if not wanted or not 3 <= len(mpn.strip()) <= 40:
            return []
        found = [part for part in self._search([mpn.strip()], exact=False) if part.get("ManufacturerPartNumber")]
        return [match for part in keep_family(found, wanted, lambda part: str(part["ManufacturerPartNumber"])) if (match := _match(part)) is not None]

    def lookup_mpns(self, mpns: Sequence[str]) -> dict[str, list[PartMatch]]:
        """Several manufacturer numbers in as few calls as Mouser allows (``MAX_BATCH`` a call).

        The answer is keyed by each number's ``match_key``. A part is given to the number it matches; one that matches
        none of those asked for (Mouser sometimes answers a near number) is left out.
        """

        found: dict[str, list[PartMatch]] = {match_key(number): [] for number in mpns if match_key(number)}
        askable = list(dict.fromkeys(number.strip() for number in mpns if 3 <= len(number.strip()) <= 40 and match_key(number)))
        for start in range(0, len(askable), MAX_BATCH):
            for part in self._search(askable[start:start + MAX_BATCH]):
                match = _match(part)
                if match is not None and match_key(match.mpn) in found:
                    found[match_key(match.mpn)].append(match)
        return found

    def get_offers(self, skus: Sequence[str]) -> list[Offer]:
        wanted = {sku.upper(): sku for sku in skus}
        offers: list[Offer] = []
        for start in range(0, len(skus), MAX_BATCH):
            for part in self._search(skus[start:start + MAX_BATCH]):
                sku = wanted.get(str(part.get("MouserPartNumber") or "").upper())
                if sku is None:
                    continue
                offer = _offer(sku, part, self._clock())
                if offer is not None:
                    offers.append(offer)
        return offers

    def get_part_data(self, match: PartMatch) -> PartData:
        part = next((item for item in self._search([match.sku]) if item.get("MouserPartNumber") == match.sku), None)
        if part is None:
            return PartData(match=match)
        attributes = tuple(
            (str(item.get("AttributeName") or ""), str(item.get("AttributeValue") or ""))
            for item in part.get("ProductAttributes") or []
            if isinstance(item, dict) and item.get("AttributeName")
        )
        return PartData(
            match=match,
            description=str(part.get("Description") or ""),
            datasheet_url=str(part.get("DataSheetUrl") or ""),
            category=str(part.get("Category") or ""),
            parameters=attributes,
        )


def _match(part: Mapping[str, Any]) -> PartMatch | None:
    sku, number = str(part.get("MouserPartNumber") or ""), str(part.get("ManufacturerPartNumber") or "")
    # "N/A" stands for a Mouser number that cannot be ordered.
    if not sku or not number or sku.upper() == "N/A":
        return None
    return PartMatch(
        provider=KEY, sku=sku, mpn=number,
        manufacturer=str(part.get("Manufacturer") or ""),
        description=str(part.get("Description") or ""),
        product_url=str(part.get("ProductDetailUrl") or ""),
        datasheet_url=str(part.get("DataSheetUrl") or ""),
        parameters=tuple(
            (str(item.get("AttributeName") or ""), str(item.get("AttributeValue") or ""))
            for item in part.get("ProductAttributes") or []
            if isinstance(item, dict) and item.get("AttributeName")
        ),
    )


def _raise_for_errors(errors: Sequence[Any]) -> None:
    for error in errors:
        if not isinstance(error, dict):
            continue
        about = " ".join(str(error.get(field) or "") for field in ("PropertyName", "Code", "Message")).lower()
        if "api key" in about or "apikey" in about or "unauthorized" in about:
            raise AuthError("Mouser rejected the API key")
        raise ProviderError(f"Mouser reported an error ({str(error.get('Code') or 'unknown')[:40]})")


def _stock(part: Mapping[str, Any]) -> int | None:
    """Units on hand, or None when the answer does not say.

    ``Availability`` is display text that can describe units on order, so its number is never
    used as stock. Mouser sends a null ``AvailabilityInStock`` with "None" for no stock; a null
    next to text that holds a number is not understood, and is left unread.
    """

    on_hand = parse_count(part.get("AvailabilityInStock"))
    if on_hand is not None:
        return on_hand
    return 0 if parse_count(part.get("Availability")) is None else None


def _price_breaks(part: Mapping[str, Any]) -> tuple[tuple[PriceBreak, ...], str]:
    tiers = [tier for tier in part.get("PriceBreaks") or [] if isinstance(tier, dict) and len(str(tier.get("Currency") or "")) == 3]
    currencies = {str(tier["Currency"]).upper() for tier in tiers}
    if len(currencies) != 1:
        return (), ""
    return normalise.price_breaks((tier.get("Quantity"), tier.get("Price")) for tier in tiers), currencies.pop()


def _incoming(part: Mapping[str, Any]) -> tuple[Incoming, ...]:
    found = []
    for item in part.get("AvailabilityOnOrder") or []:
        if not isinstance(item, dict):
            continue
        quantity = parse_count(item.get("Quantity"))
        if not quantity:
            continue
        expected = None
        try:
            expected = date.fromisoformat(str(item.get("Date") or "")[:10])
        except ValueError:
            pass
        found.append(Incoming(quantity, expected))
    return tuple(found)


def _pack_size(part: Mapping[str, Any]) -> int | None:
    """The standard pack quantity, a whole number among the attributes (its name follows the account's language, so it is read by value).

    Mouser's attributes are the packaging and this quantity; the packaging values are words, so the one that is only digits is the pack.
    For a reel it is the reel."""

    for item in part.get("ProductAttributes") or []:
        if isinstance(item, dict):
            value = str(item.get("AttributeValue") or "").strip().replace(",", "").replace(".", "")
            if value.isdigit() and int(value) > 1:
                return int(value)
    return None


def _packaging(part: Mapping[str, Any]) -> Packaging:
    # Attribute names follow the account's language ("Confezione" for Packaging in Italian),
    # but the packaging values stay in English, so they are matched by value.
    values = {
        packaging
        for item in part.get("ProductAttributes") or []
        if isinstance(item, dict)
        for packaging in [normalise.packaging_word(item.get("AttributeValue"))]
        if packaging is not Packaging.UNKNOWN
    }
    # One Mouser number often covers cut tape and reel together: it is sold as several packagings.
    if len(values) > 1:
        return Packaging.SEVERAL
    return values.pop() if values else Packaging.UNKNOWN


# Mouser's compliance names (seen live) to Prism's fact names. Others are kept under their own name, lower case.
_COMPLIANCE_NAMES = {
    "USHTS": "hts_us", "TARIC": "hts_eu", "CNHTS": "hts_cn", "CAHTS": "hts_ca", "JPHTS": "hts_jp",
    "KRHTS": "hts_kr", "MXHTS": "hts_mx", "BRHTS": "hts_br", "ECCN": "eccn",
}


def _trade_facts(items: object) -> tuple[tuple[str, str], ...]:
    pairs = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("ComplianceName") or "").strip()
        value = str(item.get("ComplianceValue") or "").strip()
        if not name or not value:
            continue
        canonical = _COMPLIANCE_NAMES.get(name.upper())
        if canonical is None:
            note(KEY, "compliance name", name)
            canonical = "trade_" + "".join(ch for ch in name.lower() if ch.isalnum())[:30]
        pairs.append((canonical, value))
    return tuple(pairs)


# What the account's language calls the country of origin in TradeCompliance (seen: Italian).
_ORIGIN_NAMES = frozenset({
    "country of origin", "paese di origine", "pays d'origine", "herkunftsland", "país de origen", "ursprungsland", "land van herkomst",
})


def _origin(items: object) -> str:
    for item in items if isinstance(items, list) else []:
        if isinstance(item, dict) and str(item.get("ComplianceName") or "").strip().lower() in _ORIGIN_NAMES:
            return str(item.get("ComplianceValue") or "").strip()
    return ""


def _facts(part: Mapping[str, Any]) -> tuple[tuple[str, str], ...]:
    pairs = [("rohs_status", str(part.get("ROHSStatus") or "").strip()), ("category", str(part.get("Category") or "").strip())]
    pairs.append(("origin_country", _origin(part.get("TradeCompliance"))))
    factory = parse_count(part.get("FactoryStock"))
    pairs.append(("factory_stock", "" if factory is None else str(factory)))
    pairs += list(_trade_facts(part.get("ProductCompliance")))
    pairs.append(("suggested_replacement", str(part.get("SuggestedReplacement") or "").strip()))
    return tuple((name, value) for name, value in pairs if value)


def _substances(part: Mapping[str, Any]) -> tuple[str, ...] | None:
    raw = part.get("REACH-SVHC")
    if not isinstance(raw, list):
        return None
    return tuple(" ".join(str(item).split())[:300] for item in raw if str(item).strip())


def _alternates(part: Mapping[str, Any]) -> tuple[Alternate, ...]:
    """Mouser's suggested replacement. It is given as a Mouser number, so it stays one (Mouser's own listing resolves it)."""

    suggested = str(part.get("SuggestedReplacement") or "").strip()
    return (Alternate(sku=suggested, note="Mouser number"),) if suggested else ()


def _offer(sku: str, part: Mapping[str, Any], now: datetime) -> Offer | None:
    """The offer, or None when the answer does not say how many are on hand (left out, as the contract says)."""

    on_hand = _stock(part)
    if on_hand is None:
        note(KEY, "answer without AvailabilityInStock", sku)
        return None
    breaks, currency = _price_breaks(part)
    lifecycle_text = str(part.get("LifecycleStatus") or "").strip().lower()
    if lifecycle_text and lifecycle_text not in _LIFECYCLE:
        note(KEY, "lifecycle", lifecycle_text)
    # A restriction message means Mouser does not sell this number to this account's region.
    restricted = bool(str(part.get("RestrictionMessage") or "").strip())
    stock = 0 if restricted else on_hand
    moq = max(parse_count(part.get("Min")) or 1, 1)
    packaging = _packaging(part)
    return Offer(
        provider=KEY,
        sku=sku,
        mpn=str(part.get("ManufacturerPartNumber") or sku),
        manufacturer=str(part.get("Manufacturer") or ""),
        stock=stock,
        fetched_at=now,
        incoming=_incoming(part),
        moq=moq,
        order_multiple=max(parse_count(part.get("Mult")) or 1, 1),
        packaging=packaging,
        reel_size=_pack_size(part) if packaging in (Packaging.TAPE_REEL, Packaging.SEVERAL) else None,
        price_breaks=breaks,
        currency=currency,
        lead_time_days=None if stock >= moq else parse_lead_time_days(part.get("LeadTime")),
        lifecycle=_LIFECYCLE.get(lifecycle_text, Lifecycle.UNKNOWN),
        discontinued=str(part.get("IsDiscontinued") or "").strip().lower() == "true",
        rohs=normalise.rohs_word(part.get("ROHSStatus")),
        product_url=str(part.get("ProductDetailUrl") or ""),
        datasheet_url=str(part.get("DataSheetUrl") or ""),
        facts=_facts(part),
        substances=_substances(part),
        alternates=_alternates(part),
    )


SPEC = ProviderSpec(
    key=KEY,
    hosts=ALLOWED_HOSTS,
    limits_storage=True,
    label="Mouser",
    capabilities=frozenset({CAP_SEARCH, CAP_OFFERS, CAP_BATCH, CAP_LIFECYCLE, CAP_INCOMING}),
    max_batch=MAX_BATCH,
    search_batch=MAX_BATCH,
    stock_pooling="separate",
    credential_fields=(CredentialField("api_key", "Search API key"),),
    factory=lambda config: MouserProvider(config),
    default_daily_budget=1000,
)
