"""How prices and restocks move across a part's distributors, from the stored history.

Pure functions over daily series, and a loader. Nothing here is a forecast. Each figure says how many events it rests on, and a
figure is withheld when there are too few. A price change is a move of at least ``MIN_MOVE`` of the price; smaller wobble is
rounding, not repricing.

* Repricing cadence: the median days between a distributor's price changes.
* Leadership: when one distributor changes its price, whether the others follow in the same direction within ``FOLLOW_DAYS``,
  and who tends to go first.
* Currency: how much of a price change in the base currency came from exchange rates and how much from the distributor.
* Restock order: who gets stock back first when several restock.
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Mapping, Sequence

from app.services.supply import price_breaks, pricing
from app.services.supply.history import days_sql

MIN_MOVE = Decimal("0.005")
FOLLOW_DAYS = 14
MIN_CHANGES = 3
MIN_EVENTS = 3
HISTORY_DAYS = 180
RESTOCK_SHARE = 0.2

Series = Sequence[tuple[date, Decimal]]


def changes(series: Series) -> list[tuple[date, Decimal, Decimal]]:
    """(day, before, after) for each move of at least ``MIN_MOVE``."""

    found = []
    for (_, before), (day, after) in zip(series, series[1:]):
        if before > 0 and abs(after - before) / before >= MIN_MOVE:
            found.append((day, before, after))
    return found


def cadence(series: Series) -> int | None:
    """Median days between price changes, or None with fewer than ``MIN_CHANGES`` changes."""

    days = [day for day, _, _ in changes(series)]
    if len(days) < MIN_CHANGES:
        return None
    return round(statistics.median((b - a).days for a, b in zip(days, days[1:])))


def leadership(by_name: Mapping[str, Series]) -> dict[str, Any] | None:
    """Who changes price first, and whether the others follow. None when too few changes or fewer than two distributors."""

    if len(by_name) < 2:
        return None
    moves = {name: changes(series) for name, series in by_name.items()}
    led: dict[str, int] = defaultdict(int)
    followed = total = 0
    for name, items in moves.items():
        for day, before, after in items:
            up = after > before
            total += 1
            others = [
                other for other, rows in moves.items() if other != name and any(
                    (o_after > o_before) == up and timedelta(0) < o_day - day <= timedelta(days=FOLLOW_DAYS) for o_day, o_before, o_after in rows
                )
            ]
            if others:
                followed += 1
                led[name] += 1
    if total < MIN_EVENTS:
        return None
    leader = max(led, key=led.__getitem__) if led else None
    return {"changes": total, "followed": followed, "followed_share": round(followed / total, 2), "leader": leader, "led": dict(led)}


def fx_effect(local: Series, rates: Mapping[date, Decimal], local_currency: str, base: str) -> dict[str, Any] | None:
    """For a price in another currency, the change in the base currency over the series and how much of it is the exchange rate.

    ``rates`` is units of the local currency per unit of the base currency by day (the rate to divide the local price by)."""

    if local_currency == base or len(local) < 2:
        return None
    first_day, first_price = local[0]
    last_day, last_price = local[-1]
    start, end = rates.get(first_day), rates.get(last_day)
    if not start or not end or first_price <= 0:
        return None
    base_before, base_after = first_price / start, last_price / end
    total = (base_after - base_before) / base_before
    price_only = (last_price - first_price) / first_price
    return {
        "from": first_day.isoformat(), "to": last_day.isoformat(), "in_base_percent": round(float(total) * 100, 1),
        "local_percent": round(float(price_only) * 100, 1), "exchange_percent": round(float(total - price_only) * 100, 1),
    }


def restocks(stock: Sequence[tuple[date, int]]) -> list[date]:
    """Days stock rose from zero, or by at least 20%."""

    return [
        day for (_, before), (day, after) in zip(stock, stock[1:])
        if after > before and (before == 0 or after - before >= RESTOCK_SHARE * before)
    ]


def restock_order(by_name: Mapping[str, Sequence[tuple[date, int]]], window_days: int = 21) -> dict[str, Any] | None:
    """Of the times two or more distributors restocked within ``window_days`` of each other, who was first."""

    days = {name: restocks(series) for name, series in by_name.items()}
    firsts: dict[str, int] = defaultdict(int)
    rounds = 0
    seen: set[tuple[str, date]] = set()
    for name, items in days.items():
        for day in items:
            if (name, day) in seen:
                continue
            group = {name: day}
            for other, rows in days.items():
                if other != name:
                    near = [d for d in rows if abs((d - day).days) <= window_days]
                    if near:
                        group[other] = min(near, key=lambda d: abs((d - day).days))
            if len(group) < 2:
                continue
            seen.update(group.items())
            rounds += 1
            firsts[min(group, key=group.__getitem__)] += 1
    if rounds < MIN_EVENTS:
        return None
    return {"rounds": rounds, "first": max(firsts, key=firsts.__getitem__), "firsts": dict(firsts)}


def load(conn, part_id: str, now: datetime, base: str = "EUR") -> dict[str, Any]:
    """Everything above for one part, from its counted listings' daily readings."""

    since = now - timedelta(days=HISTORY_DAYS)
    rows = conn.execute(
        f"""
        SELECT l.id, c.display_name, d.day, d.stock
        FROM {days_sql("SELECT id FROM supply_listings WHERE part_id = %(part)s AND supply_counted(match_state)", "%(since)s")} d
        JOIN supply_listings l ON l.id = d.listing_id JOIN supply_connectors c ON c.id = l.connector_id
        ORDER BY d.day
        """,
        {"part": part_id, "since": since.date()},
    ).fetchall()
    prices: dict[str, dict[date, Decimal]] = defaultdict(dict)
    stocks: dict[str, dict[date, int]] = defaultdict(dict)
    currency: dict[str, str] = {}
    # Each distributor's price on the days it was read, at 100 pieces, from the breaks in force then (``price_breaks``).
    kept = price_breaks.load(conn, sorted({row["id"] for row in rows}))
    for row in rows:
        name = row["display_name"]
        price, code, _moq = price_breaks.price_on(kept.get(row["id"], []), row["day"], pricing.REFERENCE_QUANTITY)
        if price is not None:
            prices[name][row["day"]] = price
            currency[name] = code
        stocks[name][row["day"]] = row["stock"]
    price_series = {name: sorted(items.items()) for name, items in prices.items()}
    stock_series = {name: sorted(items.items()) for name, items in stocks.items()}
    rate_rows = conn.execute("SELECT day, currency, per_eur FROM supply_fx_rates WHERE day >= %s", (since.date(),)).fetchall()
    per_eur: dict[str, dict[date, Decimal]] = defaultdict(dict)
    for rate in rate_rows:
        per_eur[rate["currency"]][rate["day"]] = Decimal(rate["per_eur"])
    exchange = {}
    for name, series in price_series.items():
        code = currency.get(name, "")
        if code and code != base and code in per_eur and base == "EUR":
            effect = fx_effect(series, per_eur[code], code, base)
            if effect:
                exchange[name] = effect | {"currency": code}
    return {
        "repricing": {name: days for name, series in price_series.items() if (days := cadence(series)) is not None},
        "leadership": leadership(price_series),
        "exchange": exchange,
        "restock_order": restock_order(stock_series),
    }
