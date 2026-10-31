"""Exchange rates, so prices in different currencies can be compared and totalled.

Rates are the European Central Bank's daily reference rates (units of a currency per euro). A
workspace with no route to the internet loads rates by hand. Any currency is converted through the
euro. A rate Prism does not have means no conversion, never a guess; the BOM then shows no total.
Prices are list prices: no VAT, no shipping.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Mapping
from xml.etree import ElementTree

from app.services.supply import clock
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.http_client import SafeHttpClient
from app.services.supply.providers.base import ProviderError

ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"
ECB_HOSTS = ("www.ecb.europa.eu",)
REFRESH_AFTER = timedelta(hours=20)
_CODE = re.compile(r"^[A-Z]{3}$")
# Rates are never newer than this many days behind today before they are called out of date.
STALE_AFTER_DAYS = 7


@dataclass(frozen=True, slots=True)
class Rates:
    day: date | None
    per_eur: Mapping[str, Decimal]

    def convert(self, amount: Decimal, source: str, target: str) -> Decimal | None:
        """``amount`` in ``source`` currency as ``target``, or None when either rate is unknown."""

        if source == target:
            return amount
        rates = {"EUR": Decimal(1), **self.per_eur}
        if source not in rates or target not in rates:
            return None
        return amount / rates[source] * rates[target]


def parse_ecb(body: bytes) -> tuple[date, dict[str, Decimal]]:
    """The day and rates of an ECB daily file. Refuses anything that declares entities or a type."""

    if b"<!DOCTYPE" in body or b"<!ENTITY" in body:
        raise ProviderError("the exchange rate file declares a document type")
    try:
        root = ElementTree.fromstring(body)
    except ElementTree.ParseError:
        raise ProviderError("the exchange rate file is not valid XML") from None
    rates: dict[str, Decimal] = {}
    day: date | None = None
    for node in root.iter():
        if not node.tag.endswith("Cube"):
            continue
        if "time" in node.attrib:
            day = date.fromisoformat(node.attrib["time"])
        elif "currency" in node.attrib and "rate" in node.attrib:
            code = node.attrib["currency"].upper()
            if _CODE.match(code):
                rates[code] = Decimal(node.attrib["rate"])
    if day is None or not rates:
        raise ProviderError("the exchange rate file has no rates")
    return day, rates


def store(conn, day: date, rates: Mapping[str, Decimal], source: str) -> int:
    """Save one day's rates, replacing any for that day and currency. Returns how many were saved."""

    saved = 0
    for code, rate in rates.items():
        if not _CODE.match(code) or code == "EUR" or rate <= 0:
            continue
        conn.execute(
            """
            INSERT INTO supply_fx_rates (day, currency, per_eur, source, fetched_at) VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (day, currency) DO UPDATE SET per_eur = EXCLUDED.per_eur, source = EXCLUDED.source, fetched_at = EXCLUDED.fetched_at
            """,
            (day, code, rate, source, clock.now()),
        )
        saved += 1
    return saved


def latest(conn) -> Rates:
    """The most recent rate of each currency, and the day of the newest."""

    rows = conn.execute(
        "SELECT DISTINCT ON (currency) currency, per_eur, day FROM supply_fx_rates ORDER BY currency, day DESC"
    ).fetchall()
    if not rows:
        return Rates(None, {})
    return Rates(max(row["day"] for row in rows), {row["currency"]: Decimal(row["per_eur"]) for row in rows})


def is_stale(rates: Rates, today: date) -> bool:
    return rates.day is None or (today - rates.day).days > STALE_AFTER_DAYS


def refresh_from_ecb(conn, now: datetime | None = None, client: Any | None = None) -> int:
    """Fetch the ECB file unless rates were fetched in the last 20 hours. Returns how many rates were saved."""

    now = now or clock.now()
    recent = conn.execute("SELECT MAX(fetched_at) AS at FROM supply_fx_rates WHERE source = 'ecb'").fetchone()["at"]
    if recent is not None and now - recent < REFRESH_AFTER:
        return 0
    http = client or SafeHttpClient(ECB_HOSTS)
    body = http.request("GET", ECB_URL).body
    day, rates = parse_ecb(body)
    return store(conn, day, rates, "ecb")


def enter_manually(conn, day: date, rates: Mapping[str, Any], actor: str) -> int:
    """An administrator's own rates, for a workspace that cannot reach the ECB."""

    actor = actor_text(actor)
    parsed: dict[str, Decimal] = {}
    for code, value in rates.items():
        code = str(code).upper()
        try:
            rate = Decimal(str(value))
        except Exception:  # noqa: BLE001 - any unreadable number is the same answer
            raise ValueError(f"The rate for {code} is not a number.") from None
        if not _CODE.match(code) or code == "EUR":
            raise ValueError(f"{code} is not a currency code other than EUR.")
        if rate <= 0:
            raise ValueError(f"The rate for {code} must be above 0.")
        parsed[code] = rate
    if not parsed:
        raise ValueError("Give at least one rate.")
    if day > clock.now().date():
        raise ValueError("A rate cannot be dated in the future.")
    saved = store(conn, day, parsed, "manual")
    write_audit(conn, actor, "fx.manual", day.isoformat(), {"currencies": sorted(parsed)}, subject_kind="fx")
    return saved
