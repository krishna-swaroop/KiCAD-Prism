"""Arrow: the Pricing & Availability API (Item Service v4, ``search/list``).

Written against Arrow's documentation (developers.arrow.com, pages Search By List v4 and Search By Token v4). It has not been
run against the live service: no key was available. The tests use answers shaped like the documentation, and the plan
(docs/plans/arrow-connector.md) lists what a real answer must confirm.

* ``GET https://api.arrow.com/itemservice/v4/en/search/list?req=<json>&rows=25`` takes up to 100 parts (the Best Practices
  page) as ``{"request": {"login", "apikey", "remoteIp", "useExact": true, "parts": [{"partNum", "mfr"?}]}}``. Arrow answers
  HTTP 200 even for a refused request; ``transactionArea[0].response.success`` and ``returnMsg`` decide.
* An answer lists ``PartList`` items (one per Arrow ``itemId``), each with ``InvOrg.webSites[].sources[]`` (one per region,
  with its own ``currency``) and ``sourceParts[]`` (one per orderable line: its own prices, stock, pack size and minimum
  order). Every source part is a listing.
* A source part has no number that can be asked for on its own, so a listing's SKU is ``{partNum}|{sourcePartId}``: the
  number to ask for and the line to pick out of the answer.
* Prices are read in the currency of their source and never converted by Arrow (``utm_currency`` is not sent). ``vipPrice``
  (Perks accounts only) is ignored, so a price does not depend on the key's tier.
* Stock is ``Availability[].fohQty``; ``pipeline`` entries are incoming stock. Lead time is the manufacturer's, in weeks, and
  counts only when stock does not cover the smallest order. ``status`` and ``containerType`` have no documented values: the
  wording below is what is expected, anything else is logged once and read as unknown.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any, Mapping, Sequence

from app.services.supply.identity import match_key
from app.services.supply.models import Incoming, Offer, PartData, PartMatch, PriceBreak
from app.services.supply.providers import packaging_hints
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
    RateLimited,
)
from app.services.supply.providers import normalise
from app.services.supply.providers.http import HttpProvider
from app.services.supply.providers.text_values import parse_count
from app.services.supply.providers.unrecognised import note
from app.services.supply.vocabulary import Lifecycle, Packaging

KEY = "arrow"
LIST_URL = "https://api.arrow.com/itemservice/v4/en/search/list"
ALLOWED_HOSTS = ("api.arrow.com",)
# Parts per call: the Best Practices page allows 100 (the endpoint page says 1,000).
MAX_PARTS = 100
# Rows Arrow returns per part number, at most 25.
ROWS = 25
PACE_SECONDS = 1.0
# The storefront names the regions (``sourceCd``) a connector keeps; ALL keeps every one the key can see.
ALL = "ALL"
SOURCES = (ALL, "ACNA", "EUROPE", "ASIA", "VERICAL")
SEPARATOR = "|"


def sku_of(part_number: str, source_part_id: str) -> str:
    return f"{part_number}{SEPARATOR}{source_part_id}"


def split_sku(sku: str) -> tuple[str, str]:
    """The part number to ask for and the source part to pick; the id is empty for a number without one."""

    number, _, source_id = sku.partition(SEPARATOR)
    return number.strip(), source_id.strip()


class ArrowProvider(HttpProvider):
    def __init__(self, config: ProviderConfig, **transport: Any) -> None:
        super().__init__(config, hosts=ALLOWED_HOSTS, pace_seconds=PACE_SECONDS, **transport)
        self._login = config.credentials.get("login", "").strip()
        self._api_key = config.credentials.get("api_key", "").strip()
        self._remote_ip = config.credentials.get("remote_ip", "").strip()
        region = config.storefront.strip().upper()
        self._sources = frozenset({region} if region and region != ALL else ())

    # --- transport ---------------------------------------------------------

    def _call(self, numbers: Sequence[str]) -> list[dict[str, Any]]:
        """The ``PartList`` items Arrow gives for up to ``MAX_PARTS`` part numbers."""

        if not (self._login and self._api_key and self._remote_ip):
            raise AuthError("Arrow needs a login, an API key and the address of this server")
        request = {"request": {
            "login": self._login, "apikey": self._api_key, "remoteIp": self._remote_ip, "useExact": True,
            "parts": [{"partNum": number} for number in numbers],
        }}
        answer = self.request("GET", LIST_URL, params={"req": json.dumps(request, separators=(",", ":")), "rows": str(ROWS), "fmt": "JSON"})
        return _part_list(answer)

    def _ask(self, numbers: Sequence[str]) -> list[dict[str, Any]]:
        """Items for each distinct, askable number, ``MAX_PARTS`` numbers a call."""

        askable = list(dict.fromkeys(number.strip() for number in numbers if number.strip() and "*" not in number))
        items: list[dict[str, Any]] = []
        for start in range(0, len(askable), MAX_PARTS):
            items += self._call(askable[start:start + MAX_PARTS])
        return items

    def _wanted_source(self, source: Mapping[str, Any]) -> bool:
        return not self._sources or str(source.get("sourceCd") or "").upper() in self._sources

    # --- the contract ------------------------------------------------------

    def lookup_mpns(self, mpns: Sequence[str]) -> dict[str, list[PartMatch]]:
        """Matches for several manufacturer numbers in one call, keyed by each number's ``match_key``. One match per orderable line."""

        result: dict[str, list[PartMatch]] = {match_key(number): [] for number in mpns if match_key(number)}
        items = self._ask(mpns)
        for item in items:
            key = match_key(str(item.get("partNum") or ""))
            if key not in result:
                continue  # Arrow answered with a number that was not asked for
            result[key] += [_match(item, source, part) for source, part in _lines(item) if self._wanted_source(source)]
        return result

    def lookup_mpn(self, mpn: str, manufacturer: str | None = None) -> list[PartMatch]:
        # The manufacturer is not sent as a filter: whether it is the same maker is decided by Prism, which knows every spelling.
        key = match_key(mpn)
        return self.lookup_mpns([mpn]).get(key, []) if key else []

    def get_offers(self, skus: Sequence[str]) -> list[Offer]:
        """Offers for known SKUs. A part's lines come in one answer, so a part with several listings costs one call."""

        wanted: dict[str, str] = {}  # the SKU asked for, by the line it names
        numbers: list[str] = []
        for sku in dict.fromkeys(skus):
            number, source_id = split_sku(sku)
            if number and source_id:
                wanted[source_id] = sku
                numbers.append(number)
        items = self._ask(numbers)
        now = self._clock()
        offers: list[Offer] = []
        for item in items:
            for source, part in _lines(item):
                sku = wanted.get(str(part.get("sourcePartId") or ""))
                if sku is not None and self._wanted_source(source):
                    offer = _offer(sku, item, source, part, now)
                    if offer is not None:
                        offers.append(offer)
        return offers

    def get_part_data(self, match: PartMatch) -> PartData:
        # The search answer already carries the description and the package; nothing more is asked.
        return PartData(match=match, description=match.description, datasheet_url=match.datasheet_url)


# --- reading an answer -------------------------------------------------------

_AUTH_WORDS = ("login", "api key", "apikey", "credential", "unauthor", "not authori", "invalid key", "authenticat")
_LIMIT_WORDS = ("limit", "quota", "too many", "throttl", "exceed")


def _part_list(answer: Any) -> list[dict[str, Any]]:
    result = answer.get("itemserviceresult") if isinstance(answer, dict) else None
    if not isinstance(result, dict):
        raise ProviderError("Arrow answered with something other than an item service result")
    area = (result.get("transactionArea") or [{}])[0]
    response = area.get("response") if isinstance(area, dict) else None
    response = response if isinstance(response, dict) else {}
    if response.get("success") is False or str(response.get("success")).lower() == "false":
        _raise_refusal(str(response.get("returnCode") or ""), str(response.get("returnMsg") or ""))
    items: list[dict[str, Any]] = []
    for block in result.get("data") or []:
        if isinstance(block, dict):
            items += [item for item in block.get("PartList") or [] if isinstance(item, dict)]
    return items


def _raise_refusal(code: str, message: str) -> None:
    text = message.lower()
    if any(word in text for word in _AUTH_WORDS):
        raise AuthError("Arrow did not accept the login or the API key")
    if any(word in text for word in _LIMIT_WORDS):
        raise RateLimited("Arrow's limit was reached")
    # The message is Arrow's own wording and carries no key, but it is not shown as is: the code is enough to look up.
    raise ProviderError(f"Arrow refused the request (code {code or 'unknown'})")


def _lines(item: Mapping[str, Any]) -> list[tuple[Mapping[str, Any], Mapping[str, Any]]]:
    """Every orderable line of an item with the source (region) it belongs to."""

    found: list[tuple[Mapping[str, Any], Mapping[str, Any]]] = []
    organisation = item.get("InvOrg")
    organisation = organisation if isinstance(organisation, dict) else {}
    # The example puts ``sources`` under ``webSites``, the field table directly under ``InvOrg``: both are read.
    sources = list(organisation.get("sources") or [])
    for site in organisation.get("webSites") or []:
        if isinstance(site, dict):
            sources += site.get("sources") or []
    for source in sources:
        if not isinstance(source, dict):
            continue
        for part in source.get("sourceParts") or []:
            if isinstance(part, dict) and part.get("sourcePartId"):
                found.append((source, part))
    return found


def _resource(resources: Any, *kinds: str) -> str:
    for wanted in kinds:
        for entry in resources or []:
            if isinstance(entry, dict) and str(entry.get("type") or "").lower() == wanted and entry.get("uri"):
                return str(entry["uri"])
    return ""


def _match(item: Mapping[str, Any], source: Mapping[str, Any], part: Mapping[str, Any]) -> PartMatch:
    number = str(item.get("partNum") or "")
    manufacturer = item.get("manufacturer") if isinstance(item.get("manufacturer"), dict) else {}
    package = str(item.get("packageType") or "").strip()
    return PartMatch(
        provider=KEY,
        sku=sku_of(number, str(part["sourcePartId"])),
        mpn=number,
        manufacturer=str(manufacturer.get("mfrName") or ""),
        description=str(item.get("desc") or ""),
        product_url=_resource(item.get("resources"), "part_detail") or _resource(part.get("resources"), "detail"),
        datasheet_url=_resource(item.get("resources"), "datasheet"),
        # The mechanical package (QFN, SOT-23), read by params.py as "package".
        parameters=(("Package / Case", package),) if package else (),
    )


# --- one offer ---------------------------------------------------------------

_LIFECYCLE = (
    (("nrnd", "not recommended", "not for new"), Lifecycle.NRND),
    (("last time", "last buy", "ltb"), Lifecycle.LAST_TIME_BUY),
    (("obsolete", "eol", "end of life", "end of production", "not in production", "no longer", "discontinued", "inactive", "not active"), Lifecycle.OBSOLETE),
    # Not a bare "production": "end of production" would read as active.
    (("active", "in production"), Lifecycle.ACTIVE),
)


def _lifecycle(item: Mapping[str, Any], part: Mapping[str, Any]) -> Lifecycle:
    status = " ".join(str(item.get("status") or "").lower().split())
    found = Lifecycle.UNKNOWN
    if status:
        for needles, lifecycle in _LIFECYCLE:
            if any(needle in status for needle in needles):
                found = lifecycle
                break
        else:
            note(KEY, "status", status)
    # Arrow Supply Assurance is offered for parts the maker no longer makes.
    if found is Lifecycle.UNKNOWN and part.get("isASA") is True:
        return Lifecycle.OBSOLETE
    return found


def _compliance(item: Mapping[str, Any], label: str) -> str:
    env = item.get("EnvData")
    for entry in (env.get("compliance") if isinstance(env, dict) else None) or []:
        if isinstance(entry, dict) and str(entry.get("displayLabel") or "").lower() == label:
            return str(entry.get("displayValue") or "").strip()
    return ""


def _rohs(item: Mapping[str, Any]) -> bool | None:
    value = _compliance(item, "eurohs").lower()
    found = normalise.rohs_word(value)
    if found is None and value and value != "unknown":
        note(KEY, "RoHS wording", value)
    return found


def _price_breaks(source: Mapping[str, Any], part: Mapping[str, Any]) -> tuple[tuple[PriceBreak, ...], str]:
    currency = str(source.get("currency") or "").strip().upper()
    if len(currency) != 3 or not currency.isalpha():
        return (), ""
    prices = part.get("Prices")
    entries = (prices.get("resaleList") if isinstance(prices, dict) else None) or []
    # Arrow writes 0 where it gives no price.
    breaks = normalise.price_breaks(((entry.get("minQty"), entry.get("price")) for entry in entries if isinstance(entry, dict)), free=False)
    return (breaks, currency) if breaks else ((), "")


def _stock(part: Mapping[str, Any]) -> int:
    return sum(parse_count(entry.get("fohQty")) or 0 for entry in part.get("Availability") or [] if isinstance(entry, dict))


_QUANTITY_KEYS = ("qty", "quantity", "pipelineQty", "pipelineQuantity")
_DATE_KEYS = ("date", "deliveryDate", "pipelineDate", "expectedDate", "eta")


def _incoming(part: Mapping[str, Any]) -> tuple[Incoming, ...]:
    """Batches on the way. The documentation says "dates and quantities" and names no field, so the likely names are tried."""

    found = []
    for availability in part.get("Availability") or []:
        if not isinstance(availability, dict):
            continue
        for entry in availability.get("pipeline") or []:
            if not isinstance(entry, dict):
                continue
            quantity = next((parse_count(entry[key]) for key in _QUANTITY_KEYS if key in entry), None)
            if not quantity:
                note(KEY, "pipeline entry", sorted(entry))
                continue
            expected = None
            for key in _DATE_KEYS:
                if key in entry:
                    try:
                        expected = date.fromisoformat(str(entry[key])[:10])
                    except ValueError:
                        pass
                    break
            found.append(Incoming(quantity, expected))
    return tuple(found)


def _yes_no(value: object) -> str:
    return "" if value is None else ("Yes" if value is True else "No")


def _facts(item: Mapping[str, Any], part: Mapping[str, Any]) -> tuple[tuple[str, str], ...]:
    pairs = [
        ("rohs_status", _compliance(item, "eurohs")),
        ("eccn", str(part.get("eccnCode") or "").strip()),
        ("hts_us", str(part.get("htsCode") or "").strip()),
        ("category", str(item.get("categoryName") or "").strip()),
        ("ncnr", _yes_no(part.get("isNcnr"))),
    ]
    weeks = parse_count(part.get("mfrLeadTime"))
    if weeks is not None:
        pairs.append(("mfr_lead_weeks", str(weeks)))
    return tuple((name, value) for name, value in pairs if value)


def _packaging(part: Mapping[str, Any], moq: int, multiple: int, first_break: int | None) -> tuple[Packaging, int | None, bool]:
    """The packaging Arrow states, else a reading of the order terms (marked as one)."""

    pack = parse_count(part.get("packSize"))
    text = str(part.get("containerType") or "").strip()
    if text:
        packaging = packaging_hints.from_text(text)
        if packaging is Packaging.OTHER:
            note(KEY, "container type", text)
        # A line that says reel but sells from fewer pieces than the reel is cut from it.
        return packaging_hints.sold_as(packaging, pack if packaging is Packaging.TAPE_REEL and pack and pack > 1 else None, first_break)
    guess = packaging_hints.infer("", moq, multiple, first_break)
    if guess is Packaging.UNKNOWN:
        return Packaging.UNKNOWN, None, False
    return guess, (moq if guess is Packaging.TAPE_REEL else None), True


def _offer(sku: str, item: Mapping[str, Any], source: Mapping[str, Any], part: Mapping[str, Any], now: datetime) -> Offer | None:
    number = str(item.get("partNum") or "").strip()
    if not number:
        return None
    manufacturer = item.get("manufacturer") if isinstance(item.get("manufacturer"), dict) else {}
    stock = _stock(part) if part.get("inStock") is not False else 0
    moq = max(parse_count(part.get("minimumOrderQuantity")) or 1, 1)
    pack = parse_count(part.get("packSize")) or 1
    # The minimum is a multiple of the pack size; orders go in packs only when it says so.
    multiple = pack if pack > 1 and moq % pack == 0 else 1
    breaks, currency = _price_breaks(source, part)
    packaging, reel_size, inferred = _packaging(part, moq, multiple, breaks[0].quantity if breaks else None)
    weeks = parse_count(part.get("mfrLeadTime"))
    if weeks is None:
        weeks = parse_count(part.get("arrowLeadTime"))
    return Offer(
        provider=KEY,
        sku=sku,
        mpn=number,
        manufacturer=str(manufacturer.get("mfrName") or ""),
        stock=stock,
        fetched_at=now,
        incoming=_incoming(part),
        moq=moq,
        order_multiple=multiple,
        packaging=packaging,
        reel_size=reel_size,
        packaging_inferred=inferred,
        price_breaks=breaks,
        currency=currency,
        # The factory lead time only matters when stock does not cover the smallest order.
        lead_time_days=weeks * 7 if weeks is not None and stock < moq else None,
        lifecycle=_lifecycle(item, part),
        rohs=_rohs(item),
        product_url=_resource(item.get("resources"), "part_detail") or _resource(part.get("resources"), "detail"),
        datasheet_url=_resource(item.get("resources"), "datasheet"),
        facts=_facts(item, part),
    )


SPEC = ProviderSpec(
    key=KEY,
    hosts=ALLOWED_HOSTS,
    limits_storage=True,
    label="Arrow",
    capabilities=frozenset({CAP_SEARCH, CAP_OFFERS, CAP_BATCH, CAP_LIFECYCLE, CAP_INCOMING}),
    max_batch=MAX_PARTS,
    stock_pooling="separate",
    credential_fields=(
        CredentialField("login", "Login", secret=False),
        CredentialField("api_key", "API key"),
        CredentialField("remote_ip", "Address of this server", secret=False),
    ),
    factory=lambda config: ArrowProvider(config),
    storefronts=SOURCES,
    default_daily_budget=1000,
    groups_by_part=True,
    search_batch=MAX_PARTS,
)
