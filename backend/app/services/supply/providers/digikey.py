"""DigiKey Product Information API, version 4.

Written against the Swagger 2.0 description DigiKey publishes for "ProductSearch Api"
(developer.digikey.com, the "Download Swagger File" link on the ProductSearch pages): host
``api.digikey.com``, base path ``/products/v4``, token URL ``https://api.digikey.com/v1/oauth2/token``.
It has run against the live service; the answers for LM358DR (2026-10-14) are replayed in
``tests/test_supply_recorded_answers.py``. The unit tests still use small schema-shaped answers for the odd cases.

* Authentication: OAuth 2.0 client credentials. ``POST /v1/oauth2/token`` with ``client_id``,
  ``client_secret`` and ``grant_type=client_credentials``; the answer is a bearer token with
  ``expires_in`` seconds. Every call also sends ``X-DIGIKEY-Client-Id``.
* Locale: ``X-DIGIKEY-Locale-Site`` (the storefront), ``-Language`` and ``-Currency``. The answer
  says which locale it used (``SearchLocaleUsed``), and that currency is the one prices are in.
* Discovery: ``POST /search/keyword`` with ``Keywords``. ``ExactMatches`` are used; if there are none,
  only products whose manufacturer part number is the one asked for.
* Offers: ``GET /search/{productNumber}/productdetails``. DigiKey has no batch endpoint (checked in the
  v4 description: none, and the old v3 batch API is gone). A SKU is a DigiKey product number, which is one
  packaging of a part (cut tape, tape and reel, Digi-Reel each have their own), so a part has one listing per
  packaging. But one answer lists every packaging of its product in ``ProductVariations``, so the listings of
  a part are read together (``groups_by_part``): ``get_offers`` serves a number found in an answer it already
  has from that answer; the calls it made are counted in ``calls``.

Stock. ``QuantityAvailableforPackageType`` is the stock of one packaging. DigiKey shares one pool of
stock between some packagings, so the provider is declared pooled: a part's stock here is the largest
of its listings, never their sum, which could count the same reel twice.

Lifecycle. ``ProductStatus.Status`` is text the description does not list; the wording below is mapped
and anything else is logged once and read as unknown. ``Discontinued`` ("no longer sold at Digi-Key")
is the distributor flag and is never the manufacturer's lifecycle. ``EndOfLife`` ("no longer manufactured")
is obsolete.

Compliance and trade. ``Product.Classifications`` carries ``RohsStatus``, ``ReachStatus``,
``MoistureSensitivityLevel``, ``ExportControlClassNumber`` and ``HtsusCode`` as text; they are kept as facts
with each offer (``facts.py``), next to ``DateLastBuyChance``. No extra call.

Change notices. ``GET https://api.digikey.com/ChangeNotifications/v3/Products/{DigiKeyPartNumber}`` (the
"Product Change Notifications Api" Swagger file). Its only security scheme is the authorization-code flow, so it
needs a person's sign-in (``oauth.py``); the client-credentials token is not accepted. A 404 means the product
has no notices. Each notice has ``PcnChangeDate``, ``PcnType``, ``PcnDescription`` and ``PcnLink``.

Limits. The description gives none. DigiKey's published defaults for this API (120 calls a minute,
1,000 a day) are used for the pacing and the default budget; both can be changed.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any, Mapping, Sequence
from urllib.parse import quote

from app.services.supply.identity import keep_family, match_key
from app.services.supply.models import Alternate, ChangeNotice, Offer, PartData, PartMatch
from app.services.supply.providers.base import (
    CAP_LIFECYCLE,
    CAP_OFFERS,
    CAP_PCN,
    CAP_SEARCH,
    CAP_SUBSTITUTES,
    AuthError,
    CredentialField,
    NotFound,
    ProviderConfig,
    ProviderError,
    ProviderSpec,
)
from app.services.supply.providers import normalise
from app.services.supply.providers.http import ClientCredentials, HttpProvider
from app.services.supply.providers.text_values import parse_count
from app.services.supply.providers.unrecognised import note
from app.services.supply.vocabulary import Lifecycle, Packaging

KEY = "digikey"
API_URL = "https://api.digikey.com/products/v4"
PCN_URL = "https://api.digikey.com/ChangeNotifications/v3/Products/{}"
AUTHORIZE_URL = "https://api.digikey.com/v1/oauth2/authorize"
TOKEN_URL = "https://api.digikey.com/v1/oauth2/token"
ALLOWED_HOSTS = ("api.digikey.com",)
TOKEN_MARGIN_SECONDS = 30
# DigiKey's published 120 calls a minute. Each gap is drawn at random from 0.75 to 1.5 times this (see pacing.py), so the average is about 0.56 s:
# roughly 108 a minute, 90% of the limit.
PACE_SECONDS = 0.5
MAX_MATCHES = 10
# A search asks for further pages while the answer says more exist (``ProductsCount``), up to this many pages (each a call).
MAX_PAGES = 5

# DigiKey sites that sell in a currency of their own. A wrong one is corrected by the server, which
# reports the locale it used.
STOREFRONTS = (
    "US", "CA", "UK", "DE", "FR", "IT", "ES", "NL", "BE", "AT", "CH", "DK", "FI", "IE", "NO", "SE", "PL", "PT",
    "CZ", "HU", "RO", "BG", "GR", "HR", "SI", "SK", "EE", "LV", "LT", "LU", "AU", "NZ", "JP", "KR", "SG", "IN", "MX", "CN",
)

_LIFECYCLE = {
    "active": Lifecycle.ACTIVE,
    "not for new designs": Lifecycle.NRND,
    "last time buy": Lifecycle.LAST_TIME_BUY,
    "obsolete": Lifecycle.OBSOLETE,
}
# Wording that says DigiKey stopped selling it, which is not a manufacturer lifecycle.
_DISTRIBUTOR_WORDING = frozenset({"discontinued at digi-key", "discontinued"})
_HARMLESS_STATUS = frozenset({"preliminary", "new product"})

class DigiKeyProvider(HttpProvider):
    def __init__(self, config: ProviderConfig, **transport: Any) -> None:
        super().__init__(config, hosts=ALLOWED_HOSTS, pace_seconds=PACE_SECONDS, **transport)
        self._client_id = config.credentials.get("client_id", "")
        client_secret = config.credentials.get("client_secret", "")
        self._site = config.storefront
        self._currency = config.currency
        self._token = ClientCredentials(
            TOKEN_URL, form={"client_id": self._client_id, "client_secret": client_secret}, label="DigiKey", margin=TOKEN_MARGIN_SECONDS,
            missing="" if self._client_id and client_secret else "DigiKey needs a client ID and a client secret",
        )

    # --- calls --------------------------------------------------------------

    def _headers(self, token: str) -> dict[str, str]:
        headers = {"Authorization": f"Bearer {token}", "X-DIGIKEY-Client-Id": self._client_id}
        if self._site:
            headers["X-DIGIKEY-Locale-Site"] = self._site
        if self._currency:
            headers["X-DIGIKEY-Locale-Currency"] = self._currency
        return headers

    def _call(self, method: str, path: str, **kwargs: Any) -> Any:
        answer = self.authorised(self._token, method, f"{API_URL}{path}", self._headers, **kwargs)
        if not isinstance(answer, dict):
            raise ProviderError("DigiKey answered with something other than an object")
        return answer

    # --- the contract ------------------------------------------------------

    def lookup_mpn(self, mpn: str, manufacturer: str | None = None) -> list[PartMatch]:
        wanted = match_key(mpn)
        if not wanted:
            return []
        exact: list[dict[str, Any]] = []
        listed: list[dict[str, Any]] = []
        for page in range(MAX_PAGES):
            answer = self._call("POST", "/search/keyword", json={"Keywords": mpn.strip()[:250], "Limit": MAX_MATCHES, "Offset": page * MAX_MATCHES})
            if page == 0:
                exact = [p for p in answer.get("ExactMatches") or [] if isinstance(p, dict)]
            products = [p for p in answer.get("Products") or [] if isinstance(p, dict)]
            listed += products
            if len(products) < MAX_MATCHES or len(listed) >= (parse_count(answer.get("ProductsCount")) or 0):
                break
        products = exact + [
            p for p in keep_family(listed, wanted, lambda p: str(p.get("ManufacturerProductNumber") or ""))
            if p not in exact
        ]
        matches: list[PartMatch] = []
        seen: set[str] = set()
        for product in products:
            for variation in product.get("ProductVariations") or []:
                sku = str((variation or {}).get("DigiKeyProductNumber") or "")
                if not sku or sku in seen:
                    continue
                seen.add(sku)
                matches.append(_match(product, sku))
        return matches

    def get_offers(self, skus: Sequence[str]) -> list[Offer]:
        """Offers for DigiKey product numbers. One answer lists every packaging of its product, so a number found
        in an answer already read is served from it: a part with three packagings costs one call, not three."""

        wanted = set(skus)
        answers: dict[str, Mapping[str, Any]] = {}
        offers: list[Offer] = []
        for sku in skus:
            if sku not in answers:
                try:
                    answer = self._call("GET", f"/search/{_quote(sku)}/productdetails")
                except NotFound:
                    continue  # a number DigiKey no longer knows: left out, as the contract says
                answers[sku] = answer
                for variation in (answer.get("Product") or {}).get("ProductVariations") or []:
                    number = str((variation or {}).get("DigiKeyProductNumber") or "") if isinstance(variation, dict) else ""
                    if number in wanted:
                        answers.setdefault(number, answer)
            offer = _offer(sku, answers[sku], self._clock())
            if offer is not None:
                offers.append(offer)
        return offers

    def substitutes(self, sku: str) -> tuple[Alternate, ...]:
        """Parts DigiKey offers in place of one of its product numbers. One call. DigiKey lists a substitute once for each
        of its packagings; here it is one part, with DigiKey's word for how close it is (Direct, Upgrade)."""

        try:
            answer = self._call("GET", f"/search/{_quote(sku)}/substitutions")
        except NotFound:
            return ()
        found: dict[str, Alternate] = {}
        for item in answer.get("ProductSubstitutes") or []:
            if not isinstance(item, dict):
                continue
            number = str(item.get("ManufacturerProductNumber") or "").strip()
            if number and match_key(number) not in found:
                found[match_key(number)] = Alternate(
                    manufacturer=str((item.get("Manufacturer") or {}).get("Name") or "").strip(), mpn=number,
                    sku=str(item.get("DigiKeyProductNumber") or "").strip(), note=str(item.get("SubstituteType") or "").strip(),
                )
        return tuple(found.values())

    def change_notices(self, sku: str, user_token: str) -> list[ChangeNotice]:
        """The notices DigiKey lists for one of its product numbers. ``user_token`` is a signed-in person's access token."""

        if not user_token:
            raise AuthError("DigiKey change notices need a person's sign-in")
        try:
            answer = self.request("GET", PCN_URL.format(_quote(sku)), headers=self._headers(user_token))
        except ProviderError as exc:
            if exc.code == "not_found":
                return []  # DigiKey answers 404 for a product without notices
            raise
        if not isinstance(answer, dict):
            raise ProviderError("DigiKey answered with something other than an object")
        return [_notice(sku, item) for item in answer.get("ProductChangeNotifications") or [] if isinstance(item, dict)]

    def get_part_data(self, match: PartMatch) -> PartData:
        try:
            product = (self._call("GET", f"/search/{_quote(match.sku)}/productdetails").get("Product")) or {}
        except NotFound:
            return PartData(match=match)
        variation = next(
            (v for v in product.get("ProductVariations") or [] if str((v or {}).get("DigiKeyProductNumber")) == match.sku), {}
        )
        parameters = tuple(
            (str(item.get("ParameterText") or ""), str(item.get("ValueText") or ""))
            for item in product.get("Parameters") or []
            if isinstance(item, dict) and item.get("ParameterText")
        )
        return PartData(
            match=match,
            description=str((product.get("Description") or {}).get("ProductDescription") or ""),
            datasheet_url=normalise.link(product.get("DatasheetUrl")),
            category=str((product.get("Category") or {}).get("Name") or ""),
            package_name=str((variation.get("PackageType") or {}).get("Name") or ""),
            parameters=parameters,
        )


def _quote(sku: str) -> str:
    return quote(sku, safe="")


def _match(product: Mapping[str, Any], sku: str) -> PartMatch:
    return PartMatch(
        provider=KEY,
        sku=sku,
        mpn=str(product.get("ManufacturerProductNumber") or ""),
        manufacturer=str((product.get("Manufacturer") or {}).get("Name") or ""),
        description=str((product.get("Description") or {}).get("ProductDescription") or ""),
        product_url=str(product.get("ProductUrl") or ""),
        datasheet_url=normalise.link(product.get("DatasheetUrl")),
        parameters=tuple(
            (str(item.get("ParameterText") or ""), str(item.get("ValueText") or ""))
            for item in product.get("Parameters") or []
            if isinstance(item, dict) and item.get("ParameterText")
        ),
    )


def _lifecycle(product: Mapping[str, Any]) -> tuple[Lifecycle, bool]:
    """(manufacturer lifecycle, whether DigiKey itself stopped selling it)."""

    status = str((product.get("ProductStatus") or {}).get("Status") or "").strip().lower()
    dropped = bool(product.get("Discontinued")) or status in _DISTRIBUTOR_WORDING
    if status in _LIFECYCLE:
        return _LIFECYCLE[status], dropped
    if status and status not in _DISTRIBUTOR_WORDING and status not in _HARMLESS_STATUS:
        note(KEY, "product status", status)
    if product.get("EndOfLife"):
        return Lifecycle.OBSOLETE, dropped
    return Lifecycle.UNKNOWN, dropped


def _reach(text: object) -> bool | None:
    """DigiKey's REACH status: affected is true, unaffected is false, anything else says nothing."""

    value = str(text or "").strip().lower()
    if value == "reach affected":
        return True
    if value == "reach unaffected":
        return False
    if value and value not in ("vendor undefined", "not applicable"):
        note(KEY, "REACH status", value)
    return None


def _day(text: object) -> date | None:
    try:
        return date.fromisoformat(str(text or "")[:10])
    except ValueError:
        return None


_DESCRIPTION_DAY = re.compile(r"(\d{1,2})/([A-Za-z]{3})/(\d{4})")
_MONTHS = {name: number for number, name in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), 1)}


def _description_day(text: str) -> date | None:
    """The date a notice's description gives, such as "Label Chg 12/Mar/2017". None when it gives none."""

    found = _DESCRIPTION_DAY.search(text)
    month = _MONTHS.get(found.group(2).lower()) if found else None
    if not found or month is None:
        return None
    try:
        return date(int(found.group(3)), month, int(found.group(1)))
    except ValueError:
        return None


def _notice(sku: str, item: Mapping[str, Any]) -> ChangeNotice:
    link = str(item.get("PcnLink") or "").strip()
    return ChangeNotice(
        provider=KEY,
        sku=sku,
        kind_text=str(item.get("PcnType") or "").strip(),
        description=str(item.get("PcnDescription") or "").strip(),
        url=link if link.lower().startswith("https://") else "",
        # ``PcnChangeDate`` is when DigiKey last changed its record (seen 2026-10-13: notices from 2017 dated last week),
        # not when the notice came out. The release date is in the description, when DigiKey writes one.
        published_on=_description_day(str(item.get("PcnDescription") or "")),
    )


def _leaf_category(category: Any) -> str:
    """The most specific category name: DigiKey nests them (``Category`` holds ``ChildCategories``)."""

    name = ""
    while isinstance(category, dict):
        name = str(category.get("Name") or name)
        children = category.get("ChildCategories")
        category = children[0] if isinstance(children, list) and children else None
    return name


def _yes_no(value: object) -> str | None:
    return None if not isinstance(value, bool) else "Yes" if value else "No"


def _facts(product: Mapping[str, Any]) -> tuple[tuple[str, str], ...]:
    classes = product.get("Classifications") or {}
    pairs = [
        ("category", _leaf_category(product.get("Category"))),
        ("rohs_status", classes.get("RohsStatus")),
        ("reach_status", classes.get("ReachStatus")),
        ("msl", classes.get("MoistureSensitivityLevel")),
        ("eccn", classes.get("ExportControlClassNumber")),
        ("hts_us", classes.get("HtsusCode")),
    ]
    pairs += [
        ("factory_stock", product.get("ManufacturerPublicQuantity")),
        ("mfr_lead_weeks", product.get("ManufacturerLeadWeeks")),
        ("normally_stocking", _yes_no(product.get("NormallyStocking"))),
        ("ncnr", _yes_no(product.get("Ncnr"))),
        ("backorder_allowed", _yes_no(not product["BackOrderNotAllowed"]) if isinstance(product.get("BackOrderNotAllowed"), bool) else None),
    ]
    last_buy = _day(product.get("DateLastBuyChance"))
    if last_buy is not None and last_buy.year > 1900:
        pairs.append(("last_buy_date", last_buy.isoformat()))
    return tuple((name, str(value).strip()) for name, value in pairs if value is not None and str(value).strip())


def _offer(sku: str, answer: Mapping[str, Any], now: datetime) -> Offer | None:
    product = answer.get("Product") or {}
    variation = next((v for v in product.get("ProductVariations") or [] if isinstance(v, dict) and str(v.get("DigiKeyProductNumber")) == sku), None)
    if variation is None:
        return None  # DigiKey answered, but not with this packaging: left out
    stock = parse_count(variation.get("QuantityAvailableforPackageType"))
    if stock is None:
        note(KEY, "answer without QuantityAvailableforPackageType", sku)
        return None
    breaks = normalise.price_breaks((tier.get("BreakQuantity"), tier.get("UnitPrice")) for tier in variation.get("StandardPricing") or [] if isinstance(tier, dict))
    currency = str((answer.get("SearchLocaleUsed") or {}).get("Currency") or "").upper()
    if len(currency) != 3:
        breaks, currency = (), ""
    moq = max(parse_count(variation.get("MinimumOrderQuantity")) or 1, 1)
    lifecycle, dropped = _lifecycle(product)
    weeks = parse_count(product.get("ManufacturerLeadWeeks"))
    packaging = normalise.packaging_word((variation.get("PackageType") or {}).get("Name"))
    return Offer(
        provider=KEY,
        sku=sku,
        mpn=str(product.get("ManufacturerProductNumber") or sku),
        manufacturer=str((product.get("Manufacturer") or {}).get("Name") or ""),
        stock=stock,
        fetched_at=now,
        moq=moq,
        packaging=packaging,
        # StandardPackage is the pieces in the packaging; for a full reel it is the reel.
        reel_size=parse_count(variation.get("StandardPackage")) if packaging is Packaging.TAPE_REEL else None,
        price_breaks=breaks,
        currency=currency,
        # The factory lead time only matters when stock does not cover the smallest order.
        lead_time_days=weeks * 7 if weeks is not None and stock < moq else None,
        lifecycle=lifecycle,
        discontinued=dropped,
        rohs=normalise.rohs_word((product.get("Classifications") or {}).get("RohsStatus")),
        reach_affected=_reach((product.get("Classifications") or {}).get("ReachStatus")),
        marketplace=bool(variation.get("MarketPlace")),
        product_url=str(product.get("ProductUrl") or ""),
        datasheet_url=normalise.link(product.get("DatasheetUrl")),
        facts=_facts(product),
    )


SPEC = ProviderSpec(
    key=KEY,
    hosts=ALLOWED_HOSTS,
    limits_storage=True,
    label="DigiKey",
    capabilities=frozenset({CAP_SEARCH, CAP_OFFERS, CAP_LIFECYCLE, CAP_PCN, CAP_SUBSTITUTES}),
    max_batch=1,
    stock_pooling="pooled",
    credential_fields=(
        CredentialField("client_id", "Client ID"),
        CredentialField("client_secret", "Client secret"),
    ),
    factory=lambda config: DigiKeyProvider(config),
    storefronts=STOREFRONTS,
    default_daily_budget=1000,
    groups_by_part=True,
    # The Change Notifications API has its own daily quota (x-ratelimit-limit: 50), apart from the product API's 1000.
    notice_daily_limit=50,
)
