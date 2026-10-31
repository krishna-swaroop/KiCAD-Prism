"""The pure forecast models: stock, price, lifecycle and market maths, with no database.

Stock is a simulation of 2,000 futures per distributor (a drain from the slopes since the last restock, time out from
Kaplan-Meier, restock sizes seen). Price is repricing events (a Poisson rate shrunk to the pooled rate, sizes seen).
Lifecycle is a pooled monthly rate of changes into an ending lifecycle, then the chance over the months. Market is a
family's lead-time trend and the early warnings in its series. Each takes arrays in and returns what is said, so a
backtest can replay a past day from a slice of history.
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any, Iterable, Mapping, Sequence

import numpy as np

from app.services.supply import insights

# --- stock -----------------------------------------------------------------

DRAWS = 2000
HORIZON_DAYS = 84
RUNOUT_HORIZON = 56
MIN_RUN_POINTS = insights.MIN_RUN_POINTS
MIN_RUN_SPAN_DAYS = insights.MIN_RUN_SPAN_DAYS
# Readings since the last restock below which a part borrows the drain of similar parts, and how many similar parts that takes.
FEW_READINGS = 4
MIN_SIMILAR = 5
MIN_OUTAGES = 5
SHRINK_EVENTS = 5
QUOTE_SPREAD = 0.4
SEED = 20261017
NEVER = 10_000.0


@dataclass(slots=True)
class Holder:
    """One distributor's standing on a part."""

    connector_id: str
    name: str
    provider: str
    series: list[tuple[date, int]]
    quote_days: int | None = None
    weekly: bool = False
    # With fewer than ``FEW_READINGS`` readings since its last restock a part has no drain of its own; these are the drains, as a share
    # of stock a day, of similar parts (the same maker and category) that have one.
    similar: np.ndarray | None = None

    @property
    def stock(self) -> int:
        return self.series[-1][1] if self.series else 0


@dataclass(slots=True)
class OutageModel:
    """Survival of stock-outs: the event times and their survival, from Kaplan-Meier."""

    times: np.ndarray
    survival: np.ndarray
    events: int
    pooled: bool = False


@dataclass(slots=True)
class Simulation:
    stock: np.ndarray  # (holders, draws, days + 1)
    names: list[str]
    drain_known: list[bool]
    from_similar: list[bool] = field(default_factory=list)
    back_days: list[np.ndarray | None] = field(default_factory=list)  # per holder that is out now: draws of days until it is back


# --- pieces ---------------------------------------------------------------


def run_since_restock(series: Sequence[tuple[date, int]]) -> list[tuple[date, int]]:
    """The stretch of a distributor's series since its last restock."""

    run: list[tuple[date, int]] = []
    for day, stock in series:
        if run and insights.is_restock(run[-1][1], stock):
            run = []
        run.append((day, stock))
    return run


def restock_sizes(series: Sequence[tuple[date, int]]) -> list[int]:
    return [after - before for (_, before), (_, after) in zip(series, series[1:]) if insights.is_restock(before, after)]


def drain_samples(series: Sequence[tuple[date, int]], limit: int = insights.MAX_PAIRWISE_POINTS) -> np.ndarray | None:
    """Pairwise slopes, as a drain in pieces a day (rises count as zero), of the stretch since the last restock. None when it is too short."""

    run = run_since_restock(series)
    if len(run) < MIN_RUN_POINTS or (run[-1][0] - run[0][0]).days < MIN_RUN_SPAN_DAYS:
        return None
    sample = run[-limit:]
    slopes = [
        (b[1] - a[1]) / (b[0] - a[0]).days
        for index, a in enumerate(sample) for b in sample[index + 1:] if (b[0] - a[0]).days > 0
    ]
    return np.maximum(-np.asarray(slopes, dtype=float), 0.0) if slopes else None


def days_out(series: Sequence[tuple[date, int]]) -> int:
    """How many trailing days the distributor has held none."""

    count = 0
    for _, stock in reversed(series):
        if stock > 0:
            break
        count += 1
    return count


def kaplan_meier(durations: Sequence[float], observed: Sequence[bool], pooled: bool = False) -> OutageModel | None:
    """Survival of the time out of stock. None without at least ``MIN_OUTAGES`` stock-outs that ended."""

    if sum(1 for flag in observed if flag) < MIN_OUTAGES:
        return None
    pairs = sorted(zip((max(float(d), 1.0) for d in durations), observed))
    at_risk = len(pairs)
    survival = 1.0
    times, curve = [], []
    index = 0
    while index < len(pairs):
        time = pairs[index][0]
        ended = tied = 0
        while index < len(pairs) and pairs[index][0] == time:
            ended += 1 if pairs[index][1] else 0
            tied += 1
            index += 1
        if ended:
            survival *= 1 - ended / at_risk
            times.append(time)
            curve.append(survival)
        at_risk -= tied
    return OutageModel(np.asarray(times), np.asarray(curve), sum(1 for flag in observed if flag), pooled)


def sample_back(model: OutageModel | None, quote_days: int | None, ratio: float, already: float, rng: np.random.Generator, draws: int) -> np.ndarray | None:
    """Draws of the days until a distributor that has been out ``already`` days is back, or None when nothing says."""

    if model is not None:
        floor = float(np.interp(already, model.times, model.survival, left=1.0)) if already > 0 else 1.0
        floor = max(min(floor, 1.0), 1e-9)
        u = rng.uniform(0.0, floor, draws)
        # The first event time whose survival is at or below u; beyond the curve means longer than any seen.
        index = np.searchsorted(-model.survival, -u, side="left")
        out = np.where(index < len(model.times), model.times[np.minimum(index, len(model.times) - 1)], NEVER)
        return np.maximum(out - already, 0.0)
    if quote_days:
        centre = max(quote_days * ratio - already, 1.0)
        return rng.lognormal(np.log(centre), QUOTE_SPREAD, draws)
    return None


def shrunk_ratio(own: Sequence[float], pooled: Sequence[float]) -> tuple[float, int]:
    """The real-to-quoted wait ratio of a distributor, pulled towards the pooled one when it has few cases (P4)."""

    base = statistics.median(pooled) if len(pooled) >= SHRINK_EVENTS else 1.0
    if not own:
        return base, 0
    mine = statistics.median(own)
    return (len(own) * mine + SHRINK_EVENTS * base) / (len(own) + SHRINK_EVENTS), len(own)


# --- the simulation -------------------------------------------------------


def simulate(
    holders: Sequence[Holder], outage: Mapping[str, OutageModel | None], ratios: Mapping[str, float], *,
    draws: int = DRAWS, horizon: int = HORIZON_DAYS, seed: int = SEED,
) -> Simulation:
    """Stock of every distributor on each of the next ``horizon`` days, in ``draws`` possible futures."""

    rng = np.random.default_rng(seed)
    days = np.arange(horizon + 1, dtype=float)
    stock = np.zeros((len(holders), draws, horizon + 1))
    known: list[bool] = []
    borrowed: list[bool] = []
    backs: list[np.ndarray | None] = []
    for index, holder in enumerate(holders):
        now = float(holder.stock)
        slopes = drain_samples(holder.series)
        known.append(slopes is not None)
        borrows = slopes is None and holder.similar is not None and len(holder.similar) > 0 and now > 0
        borrowed.append(bool(borrows))
        if slopes is not None:
            drain = rng.choice(slopes, draws)
        elif borrows:
            drain = rng.choice(holder.similar, draws) * now
        else:
            drain = np.zeros(draws)
        sizes = restock_sizes(holder.series)
        size = rng.choice(np.asarray(sizes, dtype=float), draws) if sizes else np.full(draws, float(max((s for _, s in holder.series), default=0) or 1))
        model = outage.get(holder.connector_id)
        ratio = ratios.get(holder.connector_id, 1.0)
        if now <= 0:
            back = sample_back(model, holder.quote_days, ratio, float(days_out(holder.series)), rng, draws)
            backs.append(back)
            back = back if back is not None else np.full(draws, NEVER)
            out_at = np.zeros(draws)
        else:
            backs.append(None)
            with np.errstate(divide="ignore"):
                out_at = np.where(drain > 0, now / np.where(drain > 0, drain, 1.0), NEVER)
            wait = sample_back(model, holder.quote_days, ratio, 0.0, rng, draws)
            back = out_at + (wait if wait is not None else NEVER)
        t = days[None, :]
        before = np.maximum(now - drain[:, None] * t, 0.0) if now > 0 else np.zeros((draws, horizon + 1))
        after = np.maximum(size[:, None] - drain[:, None] * (t - back[:, None]), 0.0)
        stock[index] = np.where(t < out_at[:, None], before, np.where(t < back[:, None], 0.0, after))
    return Simulation(stock, [h.name for h in holders], known, borrowed, backs)


# --- what is said ----------------------------------------------------------


def _quantiles(values: np.ndarray) -> tuple[float, float, float]:
    low, mid, high = np.percentile(values, [10, 50, 90])
    return float(low), float(mid), float(high)


def _widen(low: float, high: float, weekly: bool) -> tuple[float, float]:
    """A part read weekly gives week-wide dates: the range is at least that wide."""

    if weekly and high - low < 7:
        return max(low - 3.0, 0.0), high + 4.0
    return low, high


def stock_forecast(holders: Sequence[Holder], outage: Mapping[str, OutageModel | None], ratios: Mapping[str, float], quantity: int, *, weekly: bool = False) -> dict[str, Any]:
    """Everything stock-related that is said about a part: runout, back-in, the chance of buying by week, and what it rests on."""

    live = [holder for holder in holders if holder.series]
    if not live:
        return {"available": False, "reason": "no_readings"}
    span = max((h.series[-1][0] - h.series[0][0]).days for h in live)
    if span < 7:
        return {"available": False, "reason": "too_few_readings"}
    sim = simulate(live, outage, ratios)
    total = sim.stock.sum(axis=0)  # (draws, days)
    out_now = bool(total[:, 0].max() == 0)
    zero = total <= 0
    first_zero = np.where(zero.any(axis=1), zero.argmax(axis=1), -1)
    horizon_hit = (first_zero >= 0) & (first_zero <= RUNOUT_HORIZON)
    p_out = float(horizon_hit.mean())
    runout = None
    if p_out >= 0.10 and not out_now and (any(sim.drain_known) or any(sim.from_similar)):
        low, mid, high = _quantiles(first_zero[horizon_hit].astype(float))
        low, high = _widen(low, high, weekly)
        runout = {"low": low, "median": mid, "high": high, "probability": p_out}
    weeks = []
    for week in range(1, 13):
        day = min(week * 7, HORIZON_DAYS)
        weeks.append(float((sim.stock[:, :, day] >= max(quantity, 1)).any(axis=0).mean()))
    # Out everywhere on any day of the weeks, not only on their last day: a stock-out in week two is one, restocked or not.
    out_everywhere = {w: float(zero[:, : min(w * 7, HORIZON_DAYS) + 1].any(axis=1).mean()) for w in (4, 8)}
    back = []
    for holder, draw in zip(live, sim.back_days):
        if draw is not None:
            low, mid, high = _quantiles(np.minimum(draw, 365.0))
            low, high = _widen(low, high, weekly)
            back.append({
                "connector_id": holder.connector_id, "name": holder.name, "provider": holder.provider,
                "low": low, "median": mid, "high": high, "quote_days": holder.quote_days,
                "ratio": ratios.get(holder.connector_id), "beyond": float((draw >= NEVER / 2).mean()),
            })
    steps = list(range(0, RUNOUT_HORIZON + 1, 2))
    path = [[day, *(float(v) for v in np.percentile(total[:, day], [10, 50, 90]))] for day in steps]
    # Each distributor's most likely stock on the same days, for a line of its own on the chart.
    holder_paths = [
        {"connector_id": holder.connector_id, "path": [[day, float(np.percentile(sim.stock[index][:, day], 50))] for day in steps]}
        for index, holder in enumerate(live)
    ]
    return {
        "available": True, "quantity": quantity, "path": path, "holder_paths": holder_paths, "out_now": out_now, "runout": runout, "p_out_total": p_out,
        "out_everywhere": out_everywhere, "weeks": weeks, "back": back,
        "inputs": {
            "span_days": span, "holders": len(live), "drain_known": sum(sim.drain_known), "from_similar": sum(sim.from_similar), "outages_modelled": sum(1 for m in outage.values() if m),
            "weekly": weekly,
        },
    }


# --- price -----------------------------------------------------------------

# Days of readings a horizon needs before it is forecast: a month for the month ahead, two for the quarter.
MIN_SPAN_DAYS = {30: 30, 90: 60}
# A part's rate of repricing is pulled towards one in 90 days, as strongly as 90 days of its own history.
PRIOR_RATE = 1 / 90
SHRINK_DAYS = 90.0
MIN_OWN_MOVES = 3
# A change under this share is rounding or noise, not a repricing; one over BIG_MOVE counts only when the next reading holds the new price.
NOISE_MOVE = 0.01
BIG_MOVE = 0.25
# Moves are believed to drift one way only when the part's own history has this many the same way over at least this many days.
DRIFT_MOVES = 3
DRIFT_DAYS = 60
# No single repricing is believed to be bigger than a doubling or a halving: a bigger jump is a listing that changed, not a price.
MAX_MOVE = math.log(2)
PRICE_SEED = 20261018


class Moves:
    """The moves of a price series: how many, over how long, and their sizes as log ratios."""

    __slots__ = ("count", "span", "sizes")

    def __init__(self, count: int, span: float, sizes: list[float]) -> None:
        self.count, self.span, self.sizes = count, span, sizes


def moves_of(series: Sequence[tuple[date, float]]) -> Moves:
    sizes = [math.log(b / a) for (_, a), (_, b) in zip(series, series[1:]) if a > 0 and b > 0 and a != b]
    span = (series[-1][0] - series[0][0]).days if len(series) > 1 else 0
    return Moves(len(sizes), float(span), sizes)


def _repricings(series: Sequence[tuple[date, Any]]) -> list[tuple[date, float]]:
    """The real repricings in one listing's series: (day, log ratio). Changes under ``NOISE_MOVE`` are dropped, and so is a big one the
    next reading does not confirm (a spike that reverts, or a last reading nothing follows)."""

    found: list[tuple[date, float]] = []
    level = float(series[0][1]) if series else 0.0
    for index in range(1, len(series)):
        after = float(series[index][1])
        if level <= 0 or after <= 0:
            level = after
            continue
        change = after / level - 1
        if abs(change) > BIG_MOVE:
            following = float(series[index + 1][1]) if index + 1 < len(series) else None
            if following is None or abs(following / after - 1) >= NOISE_MOVE:
                continue  # a reading nothing confirms: the level stays what it was
        if abs(change) >= NOISE_MOVE:
            found.append((series[index][0], math.log(after / level)))
        level = after
    return found


def _moves_of(listings: Iterable[Sequence[tuple[date, Decimal]]]) -> Moves:
    """The repricings of a part as its own listings made them: one event for each day a listing's price differed from its last reading,
    sized by the median change among the listings that moved that day."""

    events: dict[date, list[float]] = {}
    first: date | None = None
    last: date | None = None
    for series in listings:
        first = series[0][0] if first is None else min(first, series[0][0])
        last = series[-1][0] if last is None else max(last, series[-1][0])
        for day, size in _repricings(series):
            events.setdefault(day, []).append(size)
    sizes = [max(-MAX_MOVE, min(MAX_MOVE, float(np.median(changes)))) for _day, changes in sorted(events.items())]
    span = float((last - first).days) if first is not None and last is not None else 0.0
    return Moves(len(sizes), span, sizes)


def _centred(sizes: Sequence[float]) -> list[float]:
    """Sizes with their mean taken out: how big a move is, not which way prices happen to have gone."""

    if not sizes:
        return []
    mean = sum(sizes) / len(sizes)
    return [size - mean for size in sizes]


def drifts(own: Moves) -> bool:
    """Whether a part's own history is evidence for a trend: at least ``DRIFT_MOVES`` moves the same way over ``DRIFT_DAYS`` days."""

    if own.span < DRIFT_DAYS:
        return False
    return max(sum(1 for size in own.sizes if size > 0), sum(1 for size in own.sizes if size < 0)) >= DRIFT_MOVES


def draw_prices(
    series: Sequence[tuple[date, float]], pool: Moves, horizon: int, draws: int = DRAWS, seed: int = PRICE_SEED, own: Moves | None = None,
) -> np.ndarray | None:
    """Possible prices ``horizon`` days ahead, or None when the series is too short to say anything.

    ``own`` is the part's repricings from its listings (``inputs.own_moves``); without it they are read from the series itself.
    The median is today's price unless the part's own history shows a trend: the sizes are centred, so a pool that went mostly one
    way is a spread, not a drift.
    """

    if len(series) < 2 or (series[-1][0] - series[0][0]).days < MIN_SPAN_DAYS.get(horizon, max(MIN_SPAN_DAYS.values())):
        return None
    own = own or moves_of(series)
    rate = (own.count + SHRINK_DAYS * PRIOR_RATE) / (own.span + SHRINK_DAYS)
    rng = np.random.default_rng(seed)
    counts = rng.poisson(rate * horizon, draws)
    if own.count >= MIN_OWN_MOVES:
        own_sizes = own.sizes if drifts(own) else _centred(own.sizes)
        sizes = np.asarray(own_sizes + _centred(pool.sizes)[: len(own.sizes)], dtype=float)
    else:
        sizes = np.asarray(_centred(pool.sizes) or [0.0], dtype=float)
    total = np.zeros(draws)
    for index, moves in enumerate(counts):
        if moves:
            total[index] = rng.choice(sizes, moves).sum()
    return series[-1][1] * np.exp(total)


def price_forecast(series: Sequence[tuple[date, float]], pool: Moves, own: Moves | None = None) -> dict[str, Any]:
    """The cheapest price in 30 and 90 days as ranges, with what they rest on."""

    now = series[-1][1] if series else None
    out: dict[str, Any] = {"available": False, "now": now}
    for horizon in (30, 90):
        draw = draw_prices(series, pool, horizon, own=own)
        if draw is None:
            out["reason"] = "too_few_readings"
            return out
        low, mid, high = (float(v) for v in np.percentile(draw, [10, 50, 90]))
        out[f"h{horizon}"] = {"low": low, "median": mid, "high": high, "flat": bool(np.isclose(low, high, rtol=1e-4) or (high - low) / max(now or 1, 1e-12) < 0.005)}
    own = own or moves_of(series)
    out["available"] = True
    out["inputs"] = {"readings": len(series), "span_days": own.span, "own_moves": own.count, "pooled_moves": pool.count}
    return out


# --- lifecycle -------------------------------------------------------------

MAKER_SHRINK_MONTHS = 60.0
PRIOR_EVENTS = 0.5
MIN_CASES = 5
MIN_CHANGES_TO_SHOW = 30
# What each sign multiplies the rate by when the data cannot say: an open notice, and every distributor that lists the part having dropped it.
NOTICE_FACTOR = 3.0
DROPPED_FACTOR = 2.0
# A year's chance never reaches this.
MAX_P12 = 0.95


def chance(rate_per_month: float, months: int) -> float:
    return 1.0 - math.exp(-max(rate_per_month, 0.0) * months)


def factor(found: dict[str, Any]) -> float:
    """What the part's own signs multiply the maker's rate by."""

    return (NOTICE_FACTOR if found["notice"] else 1.0) * (1.0 + (DROPPED_FACTOR - 1.0) * found["dropped_share"])


# --- market ----------------------------------------------------------------

HISTORY_DAYS = 120
MIN_POINTS = 14
MARKET_MIN_SPAN_DAYS = 21
MAX_PAIRWISE = 60
LEAD_HORIZON = 90
EASING_STRETCHING_SHARE = 0.10
SHIFT_RECENT, SHIFT_PRIOR = 14, 14
SHIFT_SIGMAS = 3.0
# A share must move by at least this to be a warning, however calm the family was.
FLOORS = {"out_of_stock": 0.05, "dropped": 0.05, "lifecycle_risk": 0.05, "median_lead_time_days": 7.0}


def lead_trend(points: Sequence[tuple[date, float]]) -> dict[str, Any] | None:
    """Where a family's median quoted lead time is heading in ``LEAD_HORIZON`` days, as a range from the spread of pairwise slopes."""

    sample = list(points)[-MAX_PAIRWISE:]
    if len(sample) < MIN_POINTS or (sample[-1][0] - sample[0][0]).days < MARKET_MIN_SPAN_DAYS:
        return None
    slopes = np.asarray([
        (b[1] - a[1]) / (b[0] - a[0]).days for index, a in enumerate(sample) for b in sample[index + 1:] if (b[0] - a[0]).days > 0
    ])
    now = float(statistics.median(value for _, value in sample[-5:]))
    low, mid, high = (float(v) for v in np.percentile(slopes, [10, 50, 90]))
    ahead = [max(now + slope * LEAD_HORIZON, 0.0) for slope in (low, mid, high)]
    base = max(now, 1.0)
    if ahead[0] > now and (ahead[1] - now) / base >= EASING_STRETCHING_SHARE:
        direction = "stretching"
    elif ahead[2] < now and (now - ahead[1]) / base >= EASING_STRETCHING_SHARE:
        direction = "easing"
    else:
        direction = "flat"
    return {"now": now, "low": ahead[0], "median": ahead[1], "high": ahead[2], "direction": direction, "points": len(sample)}


def shift(metric: str, points: Sequence[tuple[date, float]]) -> dict[str, Any] | None:
    """A family's figure that moved and stayed moved for two weeks: the last 14 days against the 14 before, beyond what that family's own
    day-to-day wobble explains and beyond the metric's floor."""

    values = [value for _, value in points]
    if len(values) < SHIFT_RECENT + SHIFT_PRIOR:
        return None
    recent, prior = values[-SHIFT_RECENT:], values[-(SHIFT_RECENT + SHIFT_PRIOR):-SHIFT_RECENT]
    before, after = statistics.fmean(prior), statistics.fmean(recent)
    wobble = statistics.pstdev(prior)
    change = after - before
    if abs(change) < max(SHIFT_SIGMAS * wobble, FLOORS.get(metric, 0.05)):
        return None
    # It has to stay: every one of the last seven days is on the new side of the old mean.
    side = 1 if change > 0 else -1
    if not all((value - before) * side > 0 for value in values[-7:]):
        return None
    return {"metric": metric, "before": before, "after": after, "direction": "up" if change > 0 else "down", "since": points[-SHIFT_RECENT][0].isoformat()}
