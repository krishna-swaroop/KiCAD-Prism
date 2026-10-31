"""What the forecasts are worked out from, read from the database in the shapes the models take.

Reads only. The outage models, quote ratios, pooled repricings and lifecycle rates are kept, since every part's forecast uses
them. Each is kept against a marker of what it is made from (the day, and a cheap read of the rows it pools), so a process
works them out again once those rows change, and the API and the worker agree. Each cache has its own ``forget`` for tests.
"""

from __future__ import annotations

import math
import statistics
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Sequence

import numpy as np

from app.services.supply import clock, counted, part_history, prices
from app.services.supply.forecast import models
from app.services.supply.vocabulary import ENDING_LIFECYCLES

_pooled: tuple[tuple[Any, ...], tuple[dict[str, models.OutageModel | None], dict[str, float], dict[str, int]]] | None = None


def _marker(conn, sql: str, params: Sequence[Any] = ()) -> tuple[Any, ...]:
    """What a pooled cache is kept against: one row of cheap aggregates over the rows it pools."""

    return tuple(conn.execute(sql, params).fetchone().values())


def holders(conn, part_id: str, now: datetime, days: int = 90, *, borrow: bool = True) -> list[models.Holder]:
    """Each distributor's daily stock of the part, with the lead time it quotes. A distributor with too few readings since its last
    restock to have a drain of its own is given the drains of similar parts (``borrow`` False leaves that out)."""

    built = part_history.build(conn, part_id, now, days)
    if not built["connectors"]:
        return []
    quotes = {
        row["connector_id"]: row["lead"] for row in conn.execute(
            """
            SELECT l.connector_id, MIN(o.lead_time_days) FILTER (WHERE o.lead_time_days > 0) AS lead
            FROM supply_listings l JOIN supply_offers o ON o.listing_id = l.id WHERE l.part_id = %s AND l.match_state = ANY(%s) GROUP BY l.connector_id
            """,
            (part_id, list(counted.STATES)),
        ).fetchall()
    }
    rate = conn.execute("SELECT rate FROM supply_part_tiers WHERE part_id = %s", (part_id,)).fetchone()
    found = []
    similar: np.ndarray | None | bool = False
    for line in built["connectors"]:
        series = [(date.fromisoformat(day), int(stock)) for day, stock in line["stock"]]
        if series:
            holder = models.Holder(line["connector_id"], line["name"], line["provider"], series, quotes.get(line["connector_id"]), bool(rate and rate["rate"] != "daily"))
            if borrow and len(models.run_since_restock(series)) < models.FEW_READINGS:
                if similar is False:
                    similar = similar_shares(conn, part_id, now)
                holder.similar = similar  # type: ignore[assignment]
            found.append(holder)
    return found


def similar_shares(conn, part_id: str, now: datetime, limit: int = 40) -> np.ndarray | None:
    """The drain, as a share of stock a day, of each tracked part of the same maker and category that has a drain of its own. None
    unless at least ``MIN_SIMILAR`` parts have one."""

    category = conn.execute("SELECT lower(trim(value)) AS value FROM supply_part_facts WHERE part_id = %s AND name = 'category' LIMIT 1", (part_id,)).fetchone()
    if category is None or not category["value"]:
        return None
    others = conn.execute(
        """
        SELECT p.id FROM supply_parts p JOIN supply_part_tiers pt ON pt.part_id = p.id
        JOIN supply_parts me ON me.id = %s AND me.manufacturer_id = p.manufacturer_id
        WHERE p.id <> %s AND EXISTS (SELECT 1 FROM supply_part_facts f WHERE f.part_id = p.id AND f.name = 'category' AND lower(trim(f.value)) = %s)
        ORDER BY p.id LIMIT %s
        """,
        (part_id, part_id, category["value"], limit),
    ).fetchall()
    shares: list[float] = []
    for other in others:
        drains = stocks = 0.0
        for holder in holders(conn, other["id"], now, borrow=False):
            slopes = models.drain_samples(holder.series)
            if slopes is not None and holder.stock > 0:
                drains += float(np.median(slopes))
                stocks += holder.stock
        if stocks > 0:
            shares.append(drains / stocks)
    return np.asarray(shares, dtype=float) if len(shares) >= models.MIN_SIMILAR else None


def is_weekly(conn, part_id: str) -> bool:
    row = conn.execute("SELECT rate FROM supply_part_tiers WHERE part_id = %s", (part_id,)).fetchone()
    return bool(row and row["rate"] != "daily")


def pooled(conn, today: date | None = None) -> tuple[dict[str, models.OutageModel | None], dict[str, float], dict[str, int]]:
    """(outage model per connector id with an ``all`` fallback, real-to-quoted ratio per connector, quote cases per connector)."""

    global _pooled
    today = today or clock.now().date()
    # An open stock-out lengthens each day; a new one, or one ending, changes the counts.
    key = (today, *_marker(
        conn, "SELECT COUNT(*) AS n, COUNT(resolved_on) AS ended, MAX(day) AS latest FROM supply_stock_events WHERE kind = 'stock_out'",
    ))
    if _pooled is not None and _pooled[0] == key:
        return _pooled[1]
    rows = conn.execute(
        """
        SELECT l.connector_id, e.day, e.resolved_on, e.quoted_lead_days
        FROM supply_stock_events e JOIN supply_listings l ON l.id = e.listing_id WHERE e.kind = 'stock_out'
        """
    ).fetchall()
    durations: dict[str, list[tuple[float, bool]]] = defaultdict(list)
    ratios: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        ended = row["resolved_on"] is not None
        length = ((row["resolved_on"] if ended else today) - row["day"]).days
        durations[row["connector_id"]].append((float(length), ended))
        durations["all"].append((float(length), ended))
        if ended and row["quoted_lead_days"]:
            ratios[row["connector_id"]].append(length / row["quoted_lead_days"])
            ratios["all"].append(length / row["quoted_lead_days"])
    outage: dict[str, models.OutageModel | None] = {}
    everyone = models.kaplan_meier([d for d, _ in durations["all"]], [o for _, o in durations["all"]], pooled=True)
    for connector, items in durations.items():
        own = models.kaplan_meier([d for d, _ in items], [o for _, o in items])
        outage[connector] = own or everyone
    outage.setdefault("all", everyone)
    shrunk = {connector: models.shrunk_ratio(values, ratios["all"]) for connector, values in ratios.items() if connector != "all"}
    result = (_with_fallback(outage), {c: r for c, (r, _n) in shrunk.items()}, {c: n for c, (_r, n) in shrunk.items()})
    _pooled = (key, result)
    return result


class _Fallback(dict):
    """A connector with no stock-outs of its own uses the pooled model."""

    def get(self, key, default=None):  # type: ignore[override]
        return super().get(key) or super().get("all") or default


def _with_fallback(outage: dict[str, models.OutageModel | None]) -> dict[str, models.OutageModel | None]:
    return _Fallback(outage)


def forget_outage_pool() -> None:
    global _pooled
    _pooled = None


def default_quantity(conn, part_id: str) -> int:
    from app.services.supply import price_quantity

    return int(price_quantity.of_part(conn, part_id)["quantity"])


# --- price -----------------------------------------------------------------

_pool: tuple[tuple[Any, ...], models.Moves] | None = None


def own_moves(conn, part_id: str, now: datetime, days: int = 90) -> models.Moves:
    """The repricings of a part as its own listings made them: one event for each day a listing's price differed from its last reading,
    sized by the median change among the listings that moved that day. The cheapest listing changing, or a listing joining or leaving,
    is not an event, which the move sizes of the part's cheapest price used to count."""

    return models._moves_of(prices.listing_series(conn, part_id, now, days).values())


def series_of(conn, part_id: str, now: datetime, days: int = 90) -> list[tuple[date, float]]:
    points, _meta = prices.daily(conn, part_id, now, days)
    return [(day, float(price)) for day, price, _currency in points]


def pooled_moves(conn, part_ids: Sequence[str], now: datetime) -> models.Moves:
    """The moves across these parts over 90 days, kept until a price is read again, the parts change or the day turns."""

    global _pool
    key = (now.date(), hash(tuple(sorted(part_ids))), *_marker(conn, "SELECT MAX(since) AS latest FROM supply_price_breaks_history"))
    if _pool is not None and _pool[0] == key:
        return _pool[1]
    count, span, sizes = 0, 0.0, []
    # Every part's series in one read: a read per part was over a thousand queries for 200 parts.
    series = prices.listing_series_of(conn, part_ids, now, 90)
    for part_id in part_ids:
        found = models._moves_of(series.get(part_id, {}).values())
        count += found.count
        span += found.span
        sizes.extend(found.sizes)
    result = models.Moves(count, span, sizes)
    _pool = (key, result)
    return result


def forget_price_pool() -> None:
    global _pool
    _pool = None


# --- lifecycle -------------------------------------------------------------

_rates: tuple[tuple[Any, ...], dict[str, Any]] | None = None


def pooled_rates(conn, today: date) -> dict[str, Any]:
    """``rates`` for ``today``, kept until a part event is recorded or the tracked parts change: a forecast run asks for them once
    per part, and they rest on every tracked part and every lifecycle change."""

    global _rates
    key = (today, *_marker(
        conn, "SELECT (SELECT MAX(id) FROM supply_events) AS latest, (SELECT COUNT(*) FROM supply_part_tiers) AS tracked",
    ))
    if _rates is not None and _rates[0] == key:
        return _rates[1]
    found = rates(conn, today)
    _rates = (key, found)
    return found


def forget_lifecycle_rates() -> None:
    global _rates
    _rates = None


def rates(conn, today: date | None = None) -> dict[str, Any]:
    """Pooled and per-maker monthly rates of changes into an ending lifecycle, with the changes and part-months they rest on."""

    today = today or clock.now().date()
    exposure: dict[str, float] = defaultdict(float)
    for row in conn.execute(
        """
        SELECT m.name AS maker, p.created_at FROM supply_parts p JOIN supply_manufacturers m ON m.id = p.manufacturer_id
        JOIN supply_part_tiers pt ON pt.part_id = p.id
        """
    ).fetchall():
        months = max((today - row["created_at"].date()).days, 0) / 30.0
        exposure["__all__"] += months
        exposure[row["maker"]] += months
    changes: dict[str, int] = defaultdict(int)
    for row in conn.execute(
        """
        SELECT DISTINCT ON (e.part_id) e.part_id, m.name AS maker FROM supply_events e JOIN supply_parts p ON p.id = e.part_id
        JOIN supply_manufacturers m ON m.id = p.manufacturer_id
        WHERE e.kind = 'lifecycle_changed' AND e.payload->>'to' = ANY(%s) ORDER BY e.part_id, e.at
        """,
        (list(ENDING_LIFECYCLES),),
    ).fetchall():
        changes["__all__"] += 1
        changes[row["maker"]] += 1
    pooled = (changes["__all__"] + models.PRIOR_EVENTS) / max(exposure["__all__"], 1.0)
    makers = {
        maker: (changes[maker] + models.MAKER_SHRINK_MONTHS * pooled) / (months + models.MAKER_SHRINK_MONTHS)
        for maker, months in exposure.items() if maker != "__all__"
    }
    return {"pooled": pooled, "makers": makers, "changes": changes["__all__"], "part_months": exposure["__all__"], "exposure": dict(exposure)}


def signs(conn, part_id: str) -> dict[str, Any]:
    """What the part itself shows: whether an end-of-life, not-recommended or last-time-buy notice is open, and the share of the
    distributors that list it that have dropped it."""

    notice = conn.execute(
        "SELECT 1 FROM supply_pcn_parts pp JOIN supply_pcns n ON n.id = pp.pcn_id WHERE pp.part_id = %s AND n.state = 'open' "
        "AND n.kind IN ('end_of_life', 'nrnd', 'last_time_buy') LIMIT 1",
        (part_id,),
    ).fetchone()
    rows = conn.execute(
        """
        SELECT l.connector_id, bool_and(o.discontinued) AS dropped FROM supply_listings l JOIN supply_offers o ON o.listing_id = l.id
        WHERE l.part_id = %s AND supply_counted(l.match_state) AND NOT o.marketplace GROUP BY l.connector_id
        """,
        (part_id,),
    ).fetchall()
    return {"notice": notice is not None, "dropped_share": (sum(1 for row in rows if row["dropped"]) / len(rows)) if rows else 0.0}


def part_chance(conn, part_id: str, lifecycle: str, today: date | None = None, *, pooled: dict[str, Any] | None = None) -> dict[str, Any]:
    """The chance a part turns ending within 12 and 24 months, from its maker's rate and its own signs. None for a part that already is."""

    if lifecycle in ENDING_LIFECYCLES:
        return {"available": False, "reason": "already_ending"}
    found = pooled if pooled is not None else rates(conn, today)
    maker = conn.execute("SELECT m.name FROM supply_parts p JOIN supply_manufacturers m ON m.id = p.manufacturer_id WHERE p.id = %s", (part_id,)).fetchone()
    rate = found["makers"].get(maker["name"], found["pooled"]) if maker else found["pooled"]
    shown = signs(conn, part_id)
    rate = min(rate * models.factor(shown), -math.log(1.0 - models.MAX_P12) / 12)
    return {
        "available": True, "rate": rate, "p12": models.chance(rate, 12), "p24": models.chance(rate, 24), "signs": shown,
        "changes": found["changes"], "needs": models.MIN_CHANGES_TO_SHOW, "part_months": round(found["part_months"]),
    }


def last_buy_lag(conn) -> dict[str, Any]:
    """Months from a first sign (end-of-life or not-recommended notice) to the last time buy date, over the parts that have both."""

    lags = []
    for row in conn.execute(
        """
        SELECT pp.part_id,
               MIN(COALESCE(n.published_on, (n.created_at AT TIME ZONE 'UTC')::date)) FILTER (WHERE n.kind IN ('end_of_life', 'nrnd')) AS first_sign,
               MIN(n.last_time_buy) AS last_buy
        FROM supply_pcns n JOIN supply_pcn_parts pp ON pp.pcn_id = n.id GROUP BY pp.part_id
        HAVING MIN(n.last_time_buy) IS NOT NULL AND MIN(COALESCE(n.published_on, (n.created_at AT TIME ZONE 'UTC')::date)) FILTER (WHERE n.kind IN ('end_of_life', 'nrnd')) IS NOT NULL
        """
    ).fetchall():
        months = (row["last_buy"] - row["first_sign"]).days / 30.0
        if months >= 0:
            lags.append(months)
    if len(lags) < models.MIN_CASES:
        return {"available": False, "cases": len(lags), "needs": models.MIN_CASES}
    q = statistics.quantiles(lags, n=10) if len(lags) >= 10 else [min(lags)] + [statistics.median(lags)] * 8 + [max(lags)]
    return {"available": True, "cases": len(lags), "low": q[0], "median": statistics.median(lags), "high": q[-1]}


# --- market ----------------------------------------------------------------

def _series(conn, metric: str, today: date) -> dict[tuple[str, str], list[tuple[date, float]]]:
    found: dict[tuple[str, str], list[tuple[date, float]]] = {}
    for row in conn.execute(
        "SELECT day, scope_kind, scope_value, value FROM supply_market_indices WHERE metric = %s AND day >= %s AND scope_kind <> 'all' ORDER BY day",
        (metric, today - timedelta(days=models.HISTORY_DAYS)),
    ).fetchall():
        found.setdefault((row["scope_kind"], row["scope_value"]), []).append((row["day"], float(row["value"])))
    return found


def outlook(conn, today: date | None = None) -> dict[str, Any]:
    """Lead times ahead and early warnings across the families Prism has stored figures for."""

    today = today or clock.now().date()
    leads = []
    for (kind, scope), points in _series(conn, "median_lead_time_days", today).items():
        found = models.lead_trend(points)
        if found:
            leads.append({"kind": kind, "scope": scope, **found})
    leads.sort(key=lambda item: ({"stretching": 0, "easing": 1, "flat": 2}[item["direction"]], -abs(item["median"] - item["now"]), item["scope"].lower()))
    warnings = []
    for metric in ("out_of_stock", "median_lead_time_days", "dropped", "lifecycle_risk"):
        for (kind, scope), points in _series(conn, metric, today).items():
            found = models.shift(metric, points)
            if found:
                warnings.append({"kind": kind, "scope": scope, **found})
    warnings.sort(key=lambda item: -abs(item["after"] - item["before"]))
    return {"lead_times": leads, "warnings": warnings}
