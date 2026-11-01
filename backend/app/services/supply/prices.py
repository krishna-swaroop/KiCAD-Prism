"""How a part's price has moved, from the price breaks the poller kept.

The price of a part on a day is the cheapest unit price of its counted, non-marketplace listings at the part's price
quantity, in the base currency (see ``price_quantity`` and ``price_breaks.price_on``), each listing at its latest reading up to
that day (``cheapest_held``): a listing not read that day still sells at its last price. A rise is a price move only
when the readings span a week or more and the latest one is recent, so a part nobody has read lately says nothing.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Sequence

from app.services.supply import counted, pricing
from app.services.supply.history import days_sql

WINDOW_DAYS = 30
CHART_DAYS = 90
MIN_SPAN_DAYS = 7
MAX_AGE_DAYS = 3

DayPrice = tuple[date, Decimal, str]  # day, cheapest unit price, currency


REFERENCE_QUANTITY = pricing.REFERENCE_QUANTITY




def daily_cheapest(conn, part_id: str, now: datetime, days: int = WINDOW_DAYS) -> list[DayPrice]:
    """The cheapest counted unit price per day over the last ``days``, oldest first, in the base currency."""

    return daily(conn, part_id, now, days)[0]


def daily(conn, part_id: str, now: datetime, days: int = WINDOW_DAYS) -> tuple[list[DayPrice], dict[str, Any]]:
    """The daily series and the quantity it was priced at: ``{"quantity"}``.

    Each listing's price is worked out from the price breaks in force that day at the part's quantity, converted to the
    base currency. A listing a packaging pick leaves out does not count, and neither does one whose smallest order is above
    the quantity (a reel of 1,500), unless nothing else prices the part.
    """

    points, meta = _points(conn, part_id, now, days)
    base = meta["base"]
    chosen = [point for point in points if point[3]] or points
    # A listing that changed the currency it is quoted in counts in its current one: the switch is not a repricing (its price list in
    # the other currency differs by a few percent), as in `listing_series`.
    latest: dict[str, tuple[date, str]] = {}
    for listing, day, _price, _orderable, currency in chosen:
        if listing not in latest or day >= latest[listing][0]:
            latest[listing] = (day, currency)
    cheapest = cheapest_held([(listing, day, price) for listing, day, price, _orderable, currency in chosen if currency == latest[listing][1]])
    result = [(day, price, base) for day, price in cheapest]
    return result, {"quantity": meta["quantity"]}


# After its last reading a listing still counts while it has been read within this many days of the day priced; past that it has gone.
LAPSE_DAYS = 7


def cheapest_held(readings: Sequence[tuple[str, date, Decimal]]) -> list[tuple[date, Decimal]]:
    """The cheapest price on each day any listing was read, oldest first, from (listing, day, price) readings.

    A listing keeps its last price until it is read again, so a day a distributor was not read is not a day its price was missing:
    taking the cheapest of only the listings read that day made a part's price jump when the cheap distributor's read fell on another
    day, though no distributor had changed its price. Before its first reading a listing counts at that first price: Prism finding a
    listing (the first days of tracking, a distributor read later than the others) is not the price moving, as in the forecast's
    repricings. A listing not read for ``LAPSE_DAYS`` after its last reading stops counting.
    """

    by_listing: dict[str, dict[date, Decimal]] = {}
    for listing, day, price in readings:
        own = by_listing.setdefault(listing, {})
        own[day] = min(price, own.get(day, price))
    days = sorted({day for own in by_listing.values() for day in own})
    cheapest: dict[date, Decimal] = {}
    for own in by_listing.values():
        read = sorted(own)
        held = own[read[0]]
        index = 0
        for day in days:
            while index < len(read) and read[index] <= day:
                held = own[read[index]]
                index += 1
            if (day - read[-1]).days > LAPSE_DAYS:
                continue
            cheapest[day] = min(held, cheapest.get(day, held))
    return sorted(cheapest.items())


def listing_series(conn, part_id: str, now: datetime, days: int = CHART_DAYS) -> dict[str, list[tuple[date, Decimal]]]:
    """Each counted listing's own price per day in the base currency, oldest first, orderable listings only when any are. Converted at one rate (the latest), so a currency
    a listing is quoted in changing is not a price change, and a listing that joins later is its own series, not a move of the part."""

    return listing_series_of(conn, [part_id], now, days)[part_id]


def listing_series_of(conn, part_ids: Sequence[str], now: datetime, days: int = CHART_DAYS) -> dict[str, dict[str, list[tuple[date, Decimal]]]]:
    """``listing_series`` of many parts, read in the same few queries whatever their number (the pooled price moves read every tracked
    part, and one round trip a part cost most of a second)."""

    found: dict[str, dict[str, list[tuple[date, Decimal]]]] = {}
    for part_id, (points, _meta) in _points_of(conn, part_ids, now, days).items():
        # As in `daily`: a reel sold from more pieces than the part needs does not set the part's price moves, unless nothing else prices it.
        points = [point for point in points if point[3]] or points
        series: dict[str, list[tuple[date, Decimal]]] = {}
        for listing, day, price, _orderable, currency in points:
            # A listing that changes the currency it is quoted in starts a series of its own: the switch is not a repricing.
            series.setdefault(f"{listing}|{currency}", []).append((day, price))
        found[part_id] = {key: sorted(days_) for key, days_ in series.items()}
    return found


def _points(conn, part_id: str, now: datetime, days: int) -> tuple[list[tuple[str, date, Decimal, bool, str]], dict[str, Any]]:
    """Every listing's price on each day it was read: (listing, day, price in the base currency, orderable at the part's quantity,
    the currency it was quoted in)."""

    return _points_of(conn, [part_id], now, days)[part_id]


def _points_of(conn, part_ids: Sequence[str], now: datetime, days: int) -> dict[str, tuple[list[tuple[str, date, Decimal, bool, str]], dict[str, Any]]]:
    """``_points`` for each of many parts."""

    from app.services.supply import fx, price_breaks, price_quantity
    from app.services.supply import settings as supply_settings

    ids = list(dict.fromkeys(part_ids))
    quantities = price_quantity.of_parts(conn, ids)
    base = supply_settings.base_currency(conn)
    rates = fx.latest(conn)
    raw = _daily_rows(conn, ids, now, days)
    kept = price_breaks.load(conn, sorted({row["listing_id"] for row in raw}))
    rows_of: dict[str, list[dict[str, Any]]] = {part_id: [] for part_id in ids}
    for row in raw:
        rows_of[row["part_id"]].append(row)
    found: dict[str, tuple[list[tuple[str, date, Decimal, bool, str]], dict[str, Any]]] = {}
    for part_id in ids:
        quantity = quantities[part_id]
        points: list[tuple[str, date, Decimal, bool, str]] = []
        for row in rows_of[part_id]:
            price, currency, moq = price_breaks.price_on(kept.get(row["listing_id"], []), row["day"], quantity)
            converted = rates.convert(price, currency, base) if price is not None else None
            if converted is not None and converted > 0:
                points.append((row["listing_id"], row["day"], converted, moq <= quantity, currency))
        found[part_id] = (points, {"quantity": quantity, "base": base})
    return found


def _daily_rows(conn, part_ids: Sequence[str], now: datetime, days: int) -> list[dict[str, Any]]:
    """The days each counted, non-marketplace listing of the parts was read (``days_sql``): the days it is priced on."""

    return conn.execute(
        f"""
        SELECT l.part_id, d.listing_id, d.day
        FROM {days_sql("SELECT id FROM supply_listings WHERE part_id = ANY(%(parts)s) AND match_state = ANY(%(states)s)", "%(since)s")} d
        JOIN supply_listings l ON l.id = d.listing_id
        WHERE NOT d.marketplace
          AND {counted.priced_sql()}
        """,
        {"parts": list(part_ids), "states": list(counted.STATES), "since": (now - timedelta(days=days)).date()},
    ).fetchall()


def last_in_stock(conn, part_id: str, base: str, rates, quantity: int = REFERENCE_QUANTITY) -> tuple[Decimal, date] | None:
    """The cheapest price at ``quantity`` (``price_breaks.price_on``) on the most recent day any counted listing had stock and a
    price, in the base currency, and that day."""

    from app.services.supply import price_breaks

    rows = conn.execute(
        f"""
        SELECT d.listing_id, d.day
        FROM {days_sql("SELECT id FROM supply_listings WHERE part_id = %(part)s AND match_state = ANY(%(states)s)")} d
        WHERE d.stock > 0 AND NOT d.marketplace
          AND EXISTS (SELECT 1 FROM supply_price_breaks_history b WHERE b.listing_id = d.listing_id AND (b.since AT TIME ZONE 'UTC')::date <= d.day)
        ORDER BY d.day DESC LIMIT 20
        """,
        {"part": part_id, "states": list(counted.STATES)},
    ).fetchall()
    if not rows:
        return None
    day = rows[0]["day"]
    rows = [row for row in rows if row["day"] == day]
    kept = price_breaks.load(conn, [row["listing_id"] for row in rows])
    quoted = [price_breaks.price_on(kept.get(row["listing_id"], []), day, quantity) for row in rows]
    converted = [rates.convert(price, currency, base) for price, currency, _moq in quoted if price is not None]
    known = [price for price in converted if price is not None and price > 0]
    return (min(known), day) if known else None


def view(points: Sequence[DayPrice], today: date) -> dict[str, Any]:
    """What the part sheet shows: the daily series and, over the last 30 days of it, the move."""

    recent = [point for point in points if (today - point[0]).days <= WINDOW_DAYS]
    return {
        "currency": points[-1][2] if points else "",
        "history": [{"day": day.isoformat(), "price": float(price)} for day, price, _ in points],
        "trend": trend(recent, today),
    }


def trend(points: Sequence[DayPrice], today: date) -> dict[str, Any] | None:
    """First and latest price over the window, or None when the readings are too few, too close or too old."""

    if len(points) < 2:
        return None
    (first_day, first, currency), (last_day, last, _) = points[0], points[-1]
    if (last_day - first_day).days < MIN_SPAN_DAYS or (today - last_day).days > MAX_AGE_DAYS:
        return None
    return {
        "currency": currency,
        "was": format(first.normalize(), "f"),
        "now": format(last.normalize(), "f"),
        "change_percent": round(float((last - first) / first * 100), 1),
        "days": (last_day - first_day).days,
    }
