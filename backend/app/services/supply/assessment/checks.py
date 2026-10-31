"""Findings: what is wrong with a part, from facts alone.

Pure functions. ``Facts`` is everything the checks look at; the service builds it from the
database and nothing here reads one. The checks that need data Prism does not hold yet (REACH,
parameter mismatch, package, target price, approved sources per component) are not here; they arrive with
the data, under the ids the plan reserves.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
import statistics
from datetime import date, datetime, timedelta, timezone
from typing import Any, Mapping, Sequence

from app.services.supply import insights
from app.services.supply import stock as stock_rules
from app.services.supply.offer_rules import lead_time_of, rohs_verdict  # functions here name their figure "stock"
from app.services.supply.stock import as_of
from app.services.supply.assessment import settings as ids
from app.services.supply.assessment.settings import AssessmentSettings
from app.services.supply.vocabulary import Lifecycle, Status


@dataclass(frozen=True, slots=True)
class Facts:
    """One part as the checks see it."""

    lifecycle: Lifecycle
    # Counted offers (exact and manual listings), with their stock, flags and ages.
    offers: Sequence[Mapping[str, Any]]
    now: datetime
    # Set when nothing counted exists although it should: the part cannot be found.
    problem: str | None = None
    # Units a build needs, for the parts that sit on a BOM. None when no build quantity is asked for.
    need: int | None = None
    # Distributors Prism reads. A part held by one of several is a single source; with only one there is no choice.
    distributors: int | None = None
    # Names of substances declared for the part that are on the ECHA Candidate List.
    svhc_listed: Sequence[str] = ()
    # What each distributor quotes per piece at the part's price quantity, in the base currency: (distributor name, price).
    prices: Sequence[tuple[str, Decimal]] = ()
    # Where the part stands on the way to its end (``outlook.py``): "ended", "ending", "warning_signs", "no_signs", "unknown", or "" when not known.
    outlook: str = ""
    # The earliest last date to buy a distributor states or an open notice gives, when there is one.
    last_buy: date | None = None
    # How often the part is read: "daily", "weekly" or "monthly"; "" when it has no schedule (then it is judged as a daily one).
    rate: str = ""
    # The ``facts.rohs_class`` of each RoHS status stated for the part: what decides RoHS when no offer says.
    rohs_stated: Sequence[str] = ()
    # The stock level a person set on the part's watch, at or under which it needs a look.
    threshold: int | None = None
    # The facts kept from the part's history (``part_insights``): the drain, its confidence, the price trend. None when none are kept.
    insight: Mapping[str, Any] | None = None
    # The forecast's chance of being out everywhere within four weeks, when its model is shown; and the chance that is "likely".
    out_chance: float | None = None
    likely_at: float = 0.7
    # The rise of the cheapest price, in percent, that needs a look.
    price_rise_percent: int = 20
    # The most pressing open change notice (``pcn.alert_detail``), and when the clock alone changes it (``pcn.next_change``).
    notice: Mapping[str, Any] | None = None
    notice_changes: date | None = None
    # The part's list price (unit price, currency, quantity) and the target a person set for it (price, currency).
    price: tuple[str, str, int | None] | None = None
    target: tuple[Decimal, str] | None = None


@dataclass(frozen=True, slots=True)
class Finding:
    check: str
    severity: Status
    # What it says, in one plain sentence.
    text: str
    # Names the condition. A waiver holds only while the same condition does.
    scope: str
    # Set by waivers.apply.
    waiver: Mapping[str, Any] | None = field(default=None, compare=False)
    # The figures behind it, for an alert to show.
    detail: Mapping[str, Any] = field(default_factory=dict, compare=False)



def rohs_sides(offers) -> str:
    """Who says compliant and who says not, as one phrase: "Mouser says compliant; DigiKey says not"."""

    said: dict[bool, list[str]] = {True: [], False: []}
    for offer in offers:
        if offer.get("rohs") is not None:
            name = str(offer.get("connector_name") or offer.get("connector_id") or "")
            if name not in said[bool(offer["rohs"])]:
                said[bool(offer["rohs"])].append(name)
    return f"{', '.join(said[True])} {'says' if len(said[True]) == 1 else 'say'} compliant; {', '.join(said[False])} {'says' if len(said[False]) == 1 else 'say'} not"

def stock_of(offers: Sequence[Mapping[str, Any]]) -> int | None:
    """Units on hand across counted, non-marketplace offers, by pile at each distributor (``stock.aggregate``); None when none was read."""

    usable = [o for o in offers if not o["marketplace"]]
    return stock_rules.aggregate(usable, "any").total if usable else None


# At least this many quotes, and one at more than this multiple or less than its inverse of the median, make an outlier.
PRICE_MIN_QUOTES = 3
PRICE_OUTLIER_RATIO = Decimal(2)


def _disagreements(offers: Sequence[Mapping[str, Any]], add) -> None:
    """Distributors that give the part different lifecycles. The manufacturer's word is one thing; the distributors' copies of it are another."""

    named: dict[str, list[str]] = {}
    for offer in offers:
        if offer["marketplace"] or offer.get("lifecycle") in (None, "unknown"):
            continue
        named.setdefault(str(offer["lifecycle"]).replace("_", " "), []).append(str(offer.get("connector_name") or offer["connector_id"]))
    if len(named) > 1:
        who = "; ".join(f"{lifecycle} at {', '.join(sorted(set(names)))}" for lifecycle, names in sorted(named.items()))
        add(ids.LIFECYCLE_DISAGREEMENT, f"Distributors disagree on the lifecycle: {who}.", "lifecycle_disagreement")


# Checks whose severity the last date to buy raises: past it the part can no longer be ordered, near it the time is short.
# How often a part of each rate is read, in hours.
READ_EVERY_HOURS = {"daily": 24, "weekly": 7 * 24, "monthly": 30 * 24}
_DATED = frozenset({ids.LAST_TIME_BUY, ids.ENDING_WITHIN_2_YEARS})
_RANK = {Status.OK: 0, Status.WARNING: 1, Status.ERROR: 2, Status.FATAL: 3}


def _by_last_buy(configured: Status, facts: Facts, settings: AssessmentSettings, held: int = 0) -> Status:
    """The check's own severity, raised to error within ``last_buy_error_days`` of the last date to buy, and once it has passed to fatal
    when no distributor holds stock (``held``) and to error when some does: the date is the last day to order from the maker, and
    distributors can still sell what they have. A date only raises: a workspace that set the check to "ok" keeps it a note."""

    if facts.last_buy is None or configured is Status.OK:
        return configured
    days = (facts.last_buy - facts.now.date()).days
    if days < 0:
        wanted = Status.ERROR if held > 0 else Status.FATAL
    else:
        wanted = Status.ERROR if days <= settings.last_buy_error_days else configured
    return wanted if _RANK[wanted] > _RANK[configured] else configured


def _passed_text(facts: Facts, held: int) -> str:
    """What the dated findings add once the last date to buy has passed: whether distributors still have stock."""

    if facts.last_buy is None or facts.last_buy >= facts.now.date():
        return ""
    return " The last date to buy has passed" + (f"; distributors still have {held:,}." if held > 0 else " and no distributor has stock.")


def _coming(facts: Facts, add) -> None:
    """What is coming for a part that has stock: the forecast's chance of running out, once its model is shown, else the drain the
    history shows."""

    if facts.out_chance is not None:
        if facts.out_chance >= facts.likely_at:
            add(ids.LIKELY_OUT, f"The forecast gives a {round(facts.out_chance * 100)}% chance of being out everywhere within 4 weeks.",
                "likely_out", {"chance": facts.out_chance, "weeks": 4})
        return
    days = insights.rupture_expected_within(dict(facts.insight)) if facts.insight else None
    if days is not None:
        add(ids.RUNS_OUT_SOON, f"At the recent rate stock could run out in about {days} days.", "runs_out_soon", {
            "days_to_zero": days, "decrease_per_day": facts.insight["decrease_per_day"], "confidence": facts.insight["confidence"],
        })


def _price_up(facts: Facts, add) -> None:
    trend = (facts.insight or {}).get("price_trend")
    if trend and trend.get("change_percent") is not None and trend["change_percent"] >= facts.price_rise_percent:
        add(ids.PRICE_UP, f"The cheapest price rose {trend['change_percent']}% in {trend.get('days', 0)} days.", "price_up", dict(trend))


def _notice(facts: Facts, settings: AssessmentSettings, add) -> None:
    """An open change notice: an error when the last time buy it gives is close, whatever the check's own severity below that."""

    if facts.notice is None:
        return
    configured = settings.severity_of(ids.CHANGE_NOTICE)
    severity = Status.ERROR if facts.notice["soon"] and configured is not Status.OK and _RANK[configured] < _RANK[Status.ERROR] else configured
    add(ids.CHANGE_NOTICE, f"{facts.notice.get('kind_label') or 'Notice'}: {facts.notice['title']}.", "change_notice", dict(facts.notice), severity)


def _target(facts: Facts, add) -> None:
    if facts.target is None or facts.price is None:
        return
    target, currency = facts.target
    price, priced_in, quantity = facts.price
    if price and priced_in == currency and Decimal(price) > target:
        shown = format(target.normalize(), "f")
        add(ids.TARGET_PRICE_MISSED, f"The price {price} {currency} is over the target of {shown}.", "target_price_missed",
            {"price": price, "target": shown, "currency": currency, "quantity": quantity})


def changes_at(facts: Facts, settings: AssessmentSettings) -> datetime | None:
    """The next time the clock alone changes what ``evaluate`` finds: a read becoming late, the last date to buy coming within
    ``last_buy_error_days`` or passing. None when nothing waits on the clock. A kept assessment is current until then."""

    times = []
    usable = [o for o in facts.offers if not o["marketplace"]]
    oldest = as_of(usable) if usable else None
    if oldest is not None:
        times.append(oldest + timedelta(hours=READ_EVERY_HOURS.get(facts.rate, READ_EVERY_HOURS["daily"]) + settings.late_hours, seconds=1))
    days = [facts.notice_changes] if facts.notice_changes else []
    if facts.last_buy is not None:
        days += [facts.last_buy - timedelta(days=settings.last_buy_error_days), facts.last_buy + timedelta(days=1)]
    times += [datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc) for day in days]
    later = [moment for moment in times if moment > facts.now]
    return min(later) if later else None


def _compliance(facts: Facts, offers: Sequence[Mapping[str, Any]], add) -> None:
    """RoHS and REACH: from the offers when they say, else from what is stated or declared for the part."""

    rohs = rohs_verdict(offers, facts.rohs_stated)
    said = any(o.get("rohs") is not None for o in offers)
    if rohs == "not_compliant":
        add(ids.ROHS_NONCOMPLIANT, "Distributors list this part as not RoHS compliant." if said else "The part's stated RoHS status is not compliant.", "rohs_false")
    elif rohs == "disputed":
        add(ids.ROHS_DISPUTED, f"Distributors disagree on RoHS: {rohs_sides(offers)}." if said else "The RoHS statuses stated for the part disagree.", "rohs_disputed")
    if facts.svhc_listed:
        add(ids.REACH_SVHC, f"A declared substance is on the REACH Candidate List: {', '.join(facts.svhc_listed)}.", "svhc_declared")
    elif any(o.get("reach_affected") for o in offers):
        add(ids.REACH_SVHC, "A distributor lists this part as affected by REACH.", "reach_flag")


def evaluate(facts: Facts, settings: AssessmentSettings) -> list[Finding]:
    found: list[Finding] = []

    held = stock_of(facts.offers) or 0

    def add(check: str, text: str, scope: str, detail: Mapping[str, Any] | None = None, severity: Status | None = None) -> None:
        dated = check in _DATED
        found.append(Finding(
            check, severity or (_by_last_buy(settings.severity_of(check), facts, settings, held) if dated else settings.severity_of(check)),
            text + (_passed_text(facts, held) if dated else ""), scope, detail=detail or {},
        ))

    if facts.problem:
        add(ids.PART_NOT_FOUND, "No distributor carries this part number.", "not_found", {"problem": facts.problem})
    if facts.lifecycle is Lifecycle.OBSOLETE:
        add(ids.OBSOLETE, "The manufacturer lists this part as obsolete.", "obsolete", {"lifecycle": facts.lifecycle.value})
    elif facts.lifecycle is Lifecycle.LAST_TIME_BUY:
        add(ids.LAST_TIME_BUY, "The manufacturer has announced a last time buy.", "last_time_buy", {"lifecycle": facts.lifecycle.value})
    elif facts.lifecycle is Lifecycle.NRND:
        add(ids.NRND, "The manufacturer does not recommend this part for new designs.", "nrnd", {"lifecycle": facts.lifecycle.value})

    offers = list(facts.offers)
    # A lifecycle word or every distributor dropping the part already says it; the outlook adds what notices and last dates to buy say. An "ended" outlook is only ever an obsolete part, which is already said.
    said = facts.lifecycle in (Lifecycle.OBSOLETE, Lifecycle.LAST_TIME_BUY) or (bool(offers) and all(o["discontinued"] for o in offers))
    if facts.outlook == "ending" and not said:
        add(ids.ENDING_WITHIN_2_YEARS, "A notice or a last date to buy says this part is ending.", "ending_within_2_years")
    _notice(facts, settings, add)
    _target(facts, add)
    if not offers:
        # Stated RoHS and declared substances are facts about the part, not about an offer: they stand with no offer.
        _compliance(facts, offers, add)
        return found
    stock = stock_of(offers) or 0
    if offers and all(o["discontinued"] for o in offers):
        add(ids.DISTRIBUTOR_DISCONTINUED, "Every distributor that lists this part has stopped selling it.", "dropped",
            {"lifecycle": facts.lifecycle.value, "dropped": True})
    if stock == 0:
        add(ids.NO_DISTRIBUTOR_STOCK, "No distributor has this part in stock.", "no_stock", {"stock": 0})
    elif facts.need is not None and stock < facts.need:
        add(ids.INSUFFICIENT_STOCK, f"Distributors hold {stock:,} and the build needs {facts.need:,}.", "short")
    elif facts.threshold is not None and stock <= facts.threshold:
        add(ids.BELOW_THRESHOLD, f"Distributors hold {stock:,}, at or under the {facts.threshold:,} set on the watch.", "below_threshold",
            {"stock": stock, "threshold": facts.threshold})
    if stock > 0 and not any(f.check == ids.BELOW_THRESHOLD for f in found):
        _coming(facts, add)
    _price_up(facts, add)
    # Connectors on one account (shared credentials) are one holder: they list the same stock.
    if stock_rules.holders(offers) == 1 and (facts.distributors or 0) > 1:
        add(ids.SINGLE_SOURCE, "Only one distributor has this part in stock.", "single_source")
    lead = lead_time_of(offers)
    if lead is not None and lead > settings.lead_time_days:
        add(ids.LEAD_TIME_OVER_THRESHOLD, f"Lead time is {lead} days, over the {settings.lead_time_days} you accept.", "slow")
    _compliance(facts, offers, add)
    _disagreements(offers, add)
    quoted = list(facts.prices)
    if len(quoted) >= PRICE_MIN_QUOTES:
        middle = statistics.median(price for _name, price in quoted)
        far = [(name, price) for name, price in quoted if middle > 0 and not middle / PRICE_OUTLIER_RATIO <= price <= middle * PRICE_OUTLIER_RATIO]
        if far:
            name, price = max(far, key=lambda item: abs(item[1] - middle))
            add(ids.PRICE_OUTLIER, f"{name} quotes {price:.4f} a piece against a median of {middle:.4f} across {len(quoted)} distributors.", "price_outlier")
    # The figures are as old as the oldest read they rest on: a fresh zero from one distributor doesn't make another's old stock current.
    oldest = as_of(o for o in offers if not o["marketplace"])
    # Late is judged from when the part's schedule wanted the read, not from a flat age: a weekly part read on its day is not late.
    due = READ_EVERY_HOURS.get(facts.rate, READ_EVERY_HOURS["daily"])
    if oldest is not None and facts.now - oldest > timedelta(hours=due + settings.late_hours):
        add(ids.DATA_STALE, f"A read the figures rest on is {int((facts.now - oldest).total_seconds() // 3600)} hours old and this part is read {facts.rate or 'daily'}, so it is late.", "stale")
    return found
