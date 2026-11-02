"""Avnet: the getPriceAndQuantity API.

Written against the operation's definition from the Avnet API portal (apiportal.avnet.com, signed in; it is not
public), pasted by the person who set the connector up. It has not been run against the live service: the tests
use answers shaped like the definition.

* ``POST https://apigw.avnet.com/external/getPriceAndQuantity/`` takes a JSON array of request lines and answers
  with an array of result lines. Each request line asks for one part number (``PART_NUMBER``), optionally a
  quantity (``DEMAND_QTY``), a currency (``CURRENCY``) and how many results to return (``MAX_RESULT``).
* Two credentials are needed on every call: the subscription key (``Ocp-Apim-Subscription-Key``) and an OAuth 2
  bearer token from the ``client_credentials`` grant (``client_id``, ``client_secret``, ``scope``, all shown on the
  portal's Profile page once Avnet approves the subscription).
* There is no search by keyword and no SKU: Avnet answers for a manufacturer part number. A listing's SKU is the part
  number Avnet answers with (``PART_NUMBER_OUT``), and reading it again asks for that number. A part number must be
  at least 4 characters and cannot contain ``*``.
* The answer gives one price for the quantity asked (``MARKET_PRICE`` for ``DEMAND_QTY_OUT``), so an offer has one
  price break, at the quantity Avnet offered. Prices are customer specific. The currency is ``CURRENCY_OUT``.
* Each result line may carry an ``ERROR`` number; the definition lists them. 002 is a wrong credential, 003 and 040
  are limits, 041 is Avnet's own shortage of resources, 005 means no such material, 036 means the part is obsolete or
  on last-time buy and names a replacement. The rest are read as "no answer for this line".
* ``PACK_SIZE`` is not read as an order multiple: the definition only calls it "PackQty", and a wrong multiple
  would misprice a build. ``MATERIAL_STATUS`` values are not listed; unknown ones are logged once and read as
  having no effect.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Mapping, Sequence

from app.services.supply.models import Offer, PartData, PartMatch, PriceBreak
from app.services.supply.providers.base import (
    CAP_BATCH,
    CAP_LIFECYCLE,
    CAP_OFFERS,
    CAP_SEARCH,
    AuthError,
    CredentialField,
    ProviderConfig,
    ProviderError,
    ProviderSpec,
    RateLimited,
    Unavailable,
)
from app.services.supply.identity import match_key
from app.services.supply.providers import normalise
from app.services.supply.providers.http import ClientCredentials, HttpProvider
from app.services.supply.providers.text_values import parse_count, parse_decimal
from app.services.supply.providers.unrecognised import note
from app.services.supply.vocabulary import Lifecycle, Packaging

KEY = "avnet"
BASE_URL = "https://apigw.avnet.com/external/getPriceAndQuantity/"
TOKEN_URL = "https://apigw.avnet.com/external/getToken/oauth2/v2.0/token"
ALLOWED_HOSTS = ("apigw.avnet.com",)
# About half the per-minute limit; the pacer draws each gap at random around it (see pacing.py).
PACE_SECONDS = 1.5
TOKEN_MARGIN_SECONDS = 60
# Request lines per call. The definition gives no limit (error 017 says it exists), so this is kept small.
MAX_LINES = 20
MAX_MATCHES = 3
MIN_PART_NUMBER = 4

_RATE_ERRORS = frozenset({"003", "040"})
_UNAVAILABLE_ERRORS = frozenset({"041"})
_NO_MATERIAL = frozenset({"005"})
_OBSOLETE_WITH_REPLACEMENT = "036"
_QUIET_ERRORS = frozenset({"012", "014", "017", "025", "026", "028", "029", "035", "038", "051"})


def _askable(number: str) -> bool:
    text = number.strip()
    return len(text) >= MIN_PART_NUMBER and "*" not in text


class AvnetProvider(HttpProvider):
    def __init__(self, config: ProviderConfig, **transport: Any) -> None:
        super().__init__(config, hosts=ALLOWED_HOSTS, pace_seconds=PACE_SECONDS, **transport)
        credentials = config.credentials
        client_id, client_secret = credentials.get("client_id", ""), credentials.get("client_secret", "")
        scope = credentials.get("scope", "")
        self._subscription_key = credentials.get("subscription_key", "")
        self._currency = config.currency
        self._token = ClientCredentials(
            TOKEN_URL, form={"client_id": client_id, "client_secret": client_secret, "scope": scope}, label="Avnet",
            default_life=3600, margin=TOKEN_MARGIN_SECONDS,
            missing="" if client_id and client_secret and scope and self._subscription_key
            else "Avnet needs a client ID, a client secret, a scope and a subscription key",
        )

    # --- transport ---------------------------------------------------------

    def _post(self, lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
        answer = self.authorised(self._token, "POST", BASE_URL, lambda token: {
            "Authorization": f"Bearer {token}", "Ocp-Apim-Subscription-Key": self._subscription_key,
        }, json=lines)
        return _rows(answer)

    def _ask(self, numbers: Sequence[str], *, results: int) -> dict[str, list[dict[str, Any]]]:
        """Result lines per asked number (by ``match_key``), errors raised or dropped. One call per ``MAX_LINES`` numbers."""

        found: dict[str, list[dict[str, Any]]] = {}
        askable = list(dict.fromkeys(number.strip() for number in numbers if _askable(number)))
        for start in range(0, len(askable), MAX_LINES):
            chunk = askable[start:start + MAX_LINES]
            lines = []
            for number in chunk:
                line: dict[str, Any] = {"PART_NUMBER": number, "DEMAND_QTY": 1, "MAX_RESULT": results}
                if self._currency:
                    line["CURRENCY"] = self._currency
                lines.append(line)
            for row in self._post(lines):
                _raise_for(row)
                asked = match_key(str(row.get("PART_NUMBER") or ""))
                if asked:
                    found.setdefault(asked, []).append(row)
        return found

    # --- the contract ------------------------------------------------------

    def lookup_mpns(self, mpns: Sequence[str]) -> dict[str, list[PartMatch]]:
        """Several manufacturer numbers in one call (up to ``MAX_LINES``), keyed by each number's ``match_key``."""

        result: dict[str, list[PartMatch]] = {match_key(number): [] for number in mpns if match_key(number)}
        for asked, rows in self._ask(mpns, results=MAX_MATCHES).items():
            for row in rows:
                match = _match(row)
                if match is not None and match_key(match.sku) == asked:
                    result.setdefault(asked, []).append(match)
        return result

    def lookup_mpn(self, mpn: str, manufacturer: str | None = None) -> list[PartMatch]:
        # The manufacturer is not sent: Avnet refuses a line whose manufacturer differs from its own spelling (error 051).
        wanted = match_key(mpn)
        return self.lookup_mpns([mpn]).get(wanted, []) if wanted else []

    def get_offers(self, skus: Sequence[str]) -> list[Offer]:
        offers: list[Offer] = []
        now = self._clock()
        # A few results are asked for, not one: the line for this very number is picked out below, and a different first result must not hide it.
        for asked, rows in self._ask(skus, results=MAX_MATCHES).items():
            for row in rows:
                number = str(row.get("PART_NUMBER_OUT") or "")
                sku = next((s for s in skus if match_key(s) == asked), number)
                if match_key(number) == asked:
                    offers.append(_offer(sku, row, now))
                    break
        return offers

    def get_part_data(self, match: PartMatch) -> PartData:
        # The search answer already carries the description; nothing more is asked.
        return PartData(match=match, description=match.description)


def _rows(answer: Any) -> list[dict[str, Any]]:
    if isinstance(answer, list):
        return [row for row in answer if isinstance(row, dict)]
    raise ProviderError("Avnet answered with something other than a list")


def _raise_for(row: Mapping[str, Any]) -> None:
    code = str(row.get("ERROR") or "").strip()
    if not code:
        return
    if code == "002":
        raise AuthError("Avnet did not accept the credentials")
    if code in _RATE_ERRORS:
        raise RateLimited("Avnet's limit was reached")
    if code in _UNAVAILABLE_ERRORS:
        raise Unavailable("Avnet is short of resources")
    if code not in _NO_MATERIAL and code != _OBSOLETE_WITH_REPLACEMENT and code not in _QUIET_ERRORS:
        note(KEY, "error number", code)


def _answered(row: Mapping[str, Any]) -> bool:
    """Whether the line names a part. A line with only an error does not."""

    code = str(row.get("ERROR") or "").strip()
    return bool(str(row.get("PART_NUMBER_OUT") or "").strip()) and code not in _NO_MATERIAL and code not in _QUIET_ERRORS


def _match(row: Mapping[str, Any]) -> PartMatch | None:
    if not _answered(row):
        return None
    number = str(row.get("PART_NUMBER_OUT") or "").strip()
    return PartMatch(
        provider=KEY,
        sku=number,
        mpn=number,
        manufacturer=str(row.get("MANUFACTURER_NAME_OUT") or row.get("MANUFACTURER_NAME") or ""),
        description=str(row.get("PART_NUMBER_DESC") or ""),
    )


def _packaging(text: object) -> Packaging:
    packaging = normalise.packaging_word(text)
    if packaging is Packaging.UNKNOWN and str(text or "").strip():
        note(KEY, "package type", str(text).strip().lower())
    return packaging


def _lifecycle(row: Mapping[str, Any]) -> Lifecycle:
    if str(row.get("ERROR") or "").strip() == _OBSOLETE_WITH_REPLACEMENT:
        return Lifecycle.LAST_TIME_BUY  # the definition says obsolete or last-time buy, and does not say which
    status = str(row.get("MATERIAL_STATUS") or "").strip().lower()
    if not status:
        return Lifecycle.UNKNOWN
    # "Inactive" and "not active" contain "active", so they are read before it.
    if any(word in status for word in ("obso", "eol", "end of life", "end of production", "discontinued", "inactive", "not active")):
        return Lifecycle.OBSOLETE
    if "ltb" in status or "last" in status:
        return Lifecycle.LAST_TIME_BUY
    if "nrnd" in status or "not recommended" in status:
        return Lifecycle.NRND
    if status in ("active", "a") or "active" in status:
        return Lifecycle.ACTIVE
    note(KEY, "material status", status)
    return Lifecycle.UNKNOWN


def _rohs(text: object) -> bool | None:
    """The definition gives no list of RoHS values, so only plain wording is read; anything else is left unknown."""

    found = normalise.rohs_word(text)
    if found is None and str(text or "").strip():
        note(KEY, "RoHS wording", " ".join(str(text).lower().split()))
    return found


def _facts(row: Mapping[str, Any]) -> tuple[tuple[str, str], ...]:
    pairs = [
        ("rohs_status", str(row.get("ROHSL") or "").strip()),
        ("eccn", str(row.get("ECCN_NUMBER") or "").strip()),
        ("eol_notice_date", str(row.get("EOL_PCN") or "").strip()),
    ]
    if str(row.get("ERROR") or "").strip() == _OBSOLETE_WITH_REPLACEMENT:
        pairs.append(("suggested_replacement", str(row.get("MESSAGE") or "").strip()))
    return tuple((name, value) for name, value in pairs if value)


def _offer(sku: str, row: Mapping[str, Any], now: datetime) -> Offer:
    stock = max(parse_count(row.get("FREE_STOCK")) or 0, 0)
    moq = max(parse_count(row.get("MIN_ORDER_QTY")) or 1, 1)
    currency = str(row.get("CURRENCY_OUT") or "").strip().upper()
    price = parse_decimal(row.get("MARKET_PRICE"))
    quantity = max(parse_count(row.get("DEMAND_QTY_OUT")) or 1, 1)
    breaks: tuple[PriceBreak, ...] = ()
    if price is not None and price > 0 and len(currency) == 3 and currency.isalpha():
        breaks = (PriceBreak(quantity, Decimal(price)),)
    # Avnet quotes the quantity asked and nothing beyond it: the price holds up to that quantity only, never for a larger order.
    lead = parse_count(row.get("LEAD_TIME"))
    return Offer(
        provider=KEY,
        sku=sku,
        mpn=str(row.get("PART_NUMBER_OUT") or sku),
        manufacturer=str(row.get("MANUFACTURER_NAME_OUT") or row.get("MANUFACTURER_NAME") or ""),
        stock=stock,
        fetched_at=now,
        moq=moq,
        packaging=_packaging(row.get("PACKAGE_TYPE")),
        price_breaks=breaks, price_up_to=quantity if breaks else None,
        currency=currency if breaks else "",
        lead_time_days=lead if lead is not None and stock < moq else None,
        lifecycle=_lifecycle(row),
        rohs=_rohs(row.get("ROHSL")),
        facts=_facts(row),
    )


SPEC = ProviderSpec(
    key=KEY,
    hosts=ALLOWED_HOSTS,
    limits_storage=True,
    label="Avnet",
    capabilities=frozenset({CAP_SEARCH, CAP_OFFERS, CAP_LIFECYCLE, CAP_BATCH}),
    max_batch=MAX_LINES,
    stock_pooling="separate",
    credential_fields=(
        CredentialField("client_id", "Client ID", secret=False),
        CredentialField("client_secret", "Client secret"),
        CredentialField("scope", "Scope", secret=False),
        CredentialField("subscription_key", "Subscription key"),
    ),
    factory=lambda config: AvnetProvider(config),
    default_daily_budget=1000,
    search_batch=MAX_LINES,
)
