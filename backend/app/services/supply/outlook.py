"""A rule-based lifecycle outlook: what the signals Prism holds say about whether a part is heading for its end.

This is not a forecast of years, and its bands claim none: *ended*, *ending* (an end is announced or every
distributor has dropped it), *warning signs*, *no signs of an end* and *not enough to say*. Each signal is listed
with where it came from and any date it gives, so a person can disagree with the band. Absence of signals is never
read as a long life.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Sequence

from app.services.supply.vocabulary import Lifecycle

ENDED = "ended"
ENDING = "ending"
WARNING_SIGNS = "warning_signs"
NO_SIGNS = "no_signs"
UNKNOWN = "unknown"

# How many soft signals together move a part from "no signs" to "warning signs".
SOFT_SIGNALS_FOR_WATCH = 2
ZERO_STOCK_DAYS = 30
PRICE_RISE_PERCENT = 20

LABELS = {
    ENDED: "Ended",
    ENDING: "Ending",
    WARNING_SIGNS: "Warning signs",
    NO_SIGNS: "No signs of an end",
    UNKNOWN: "Not enough to say",
}


@dataclass(frozen=True, slots=True)
class Signal:
    text: str
    source: str
    # "hard" decides the band by itself (ending); "watch" points to warning signs; "soft" only counts together.
    weight: str


def signals(
    lifecycle: Lifecycle,
    *,
    dropped_by: int,
    listed_at: int,
    zero_stock_days: int = 0,
    price_change_percent: float | None = None,
    notices: Sequence[Mapping[str, Any]] = (),
    last_buy_dates: Sequence[tuple[str, str]] = (),
) -> list[Signal]:
    found: list[Signal] = []
    if lifecycle is Lifecycle.OBSOLETE:
        found.append(Signal("The manufacturer lists the part as obsolete.", "distributor lifecycle", "hard"))
    elif lifecycle is Lifecycle.LAST_TIME_BUY:
        found.append(Signal("A last time buy has been announced.", "distributor lifecycle", "hard"))
    elif lifecycle is Lifecycle.NRND:
        found.append(Signal("Not recommended for new designs.", "distributor lifecycle", "watch"))
    if listed_at and dropped_by == listed_at:
        found.append(Signal("Every distributor that lists the part has stopped selling it.", "listings", "hard"))
    elif dropped_by:
        found.append(Signal(f"{dropped_by} of {listed_at} distributors have stopped selling it.", "listings", "soft"))
    for notice in notices:
        if notice["state"] != "open":
            continue
        when = f", last time buy {notice['last_time_buy']}" if notice.get("last_time_buy") else ""
        if notice["kind"] in ("end_of_life", "last_time_buy"):
            found.append(Signal(f"A notice announces {notice['kind_label'].lower()}{when}: {notice['title']}.", "product change notice", "hard"))
        elif notice["kind"] == "nrnd":
            found.append(Signal(f"A notice marks it not recommended for new designs: {notice['title']}.", "product change notice", "watch"))
    for source, day in last_buy_dates:
        found.append(Signal(f"{source} gives a last date to buy: {day}.", "distributor", "hard"))
    if zero_stock_days >= ZERO_STOCK_DAYS:
        found.append(Signal(f"No distributor has had it in stock for {zero_stock_days} days.", "stock history", "soft"))
    if price_change_percent is not None and price_change_percent >= PRICE_RISE_PERCENT:
        found.append(Signal(f"The cheapest price rose {price_change_percent:g}% in the last month.", "price history", "soft"))
    return found


def band(lifecycle: Lifecycle, found: Sequence[Signal], *, has_data: bool) -> str:
    if lifecycle is Lifecycle.OBSOLETE:
        return ENDED
    if any(item.weight == "hard" for item in found):
        return ENDING
    if any(item.weight == "watch" for item in found) or sum(1 for item in found if item.weight == "soft") >= SOFT_SIGNALS_FOR_WATCH:
        return WARNING_SIGNS
    if lifecycle is Lifecycle.UNKNOWN and not has_data:
        return UNKNOWN
    return NO_SIGNS


def outlook(
    lifecycle: Lifecycle,
    offers: Sequence[Mapping[str, Any]],
    *,
    zero_stock_days: int = 0,
    price_change_percent: float | None = None,
    notices: Sequence[Mapping[str, Any]] = (),
    last_buy_dates: Sequence[tuple[str, str]] = (),
) -> dict[str, Any]:
    """The band, its label and the signals behind it, for a part with these counted offers."""

    dropped = sum(1 for offer in offers if offer.get("discontinued"))
    found = signals(
        lifecycle,
        dropped_by=dropped,
        listed_at=len(offers),
        zero_stock_days=zero_stock_days,
        price_change_percent=price_change_percent,
        notices=notices,
        last_buy_dates=last_buy_dates,
    )
    chosen = band(lifecycle, found, has_data=bool(offers) or bool(notices) or bool(last_buy_dates))
    return {
        "band": chosen,
        "label": LABELS[chosen],
        "method": "rule-based",
        "signals": [{"text": item.text, "source": item.source, "weight": item.weight} for item in found],
    }


def trailing_zero_days(history: Sequence[Mapping[str, Any]]) -> int:
    """How many of the latest days in a stock history had nothing in stock."""

    count = 0
    for point in reversed(history):
        if point["stock"] != 0:
            break
        count += 1
    return count
