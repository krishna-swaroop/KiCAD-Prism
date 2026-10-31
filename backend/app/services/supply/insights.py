"""What a part's stock history says, with the working shown.

Pure: takes the daily points that ``parts_view`` builds and returns facts about them.
Nothing here is a forecast of demand. It is the *observed net decrease* of counted
stock, which is not consumption: transfers between warehouses, allocations and
reporting caps look the same, and a restock and a sale in one day cancel out.

The method has to cope with uneven history, so it uses medians and no fixed spacing:

* A change in how many listings stand behind the figure (a listing found, lost or
  rejected) is a change of coverage, not stock moving. The series is cut there.
* A rise of at least 20% of the previous level is a restock (any rise, from zero).
* The rate is the Theil-Sen slope (the median of the slopes between every pair of
  points) over the days since the last restock, so one odd day cannot move it.
* Every answer carries a confidence from how many points there are and how long they
  span, and the inputs it was computed from.
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from datetime import date
from typing import Any, Sequence

HORIZON_DAYS = 56
# A part that is still made and restocked is not shown running out later than this: a drain that slow is not a finding.
RESTOCKABLE_HORIZON_DAYS = 365
# Falling this much faster in the later half of the run than in the earlier half is an accelerating drain (and the reverse, slowing).
PACE_RATIO = 1.5
MIN_PACE_POINTS = 8
MIN_PACE_SPAN_DAYS = 7
RESTOCK_SHARE = 0.2
MIN_RUN_POINTS = 4
MIN_RUN_SPAN_DAYS = 3
MAX_PAIRWISE_POINTS = 60

NONE, LOW, MEDIUM, HIGH = "none", "low", "medium", "high"


@dataclass(frozen=True, slots=True)
class Point:
    day: date
    stock: int
    listings: int
    # How many distributors hold stock that day, and how concentrated it is among them (0 to 1, 1 is all at one).
    sources: int | None = None
    concentration: float | None = None


def _segments(points: Sequence[Point]) -> list[list[Point]]:
    """Runs of points with the same coverage."""

    segments: list[list[Point]] = []
    for point in points:
        if segments and segments[-1][-1].listings == point.listings:
            segments[-1].append(point)
        else:
            segments.append([point])
    return segments


def is_restock(before: int, after: int) -> bool:
    return _is_restock(before, after)


def _is_restock(before: int, after: int) -> bool:
    rise = after - before
    return rise > 0 and (before == 0 or rise >= RESTOCK_SHARE * before)


def _theil_sen(points: Sequence[Point]) -> float | None:
    """Median pairwise slope, in pieces per day. None without two different days."""

    sample = list(points[-MAX_PAIRWISE_POINTS:])
    slopes = [
        (b.stock - a.stock) / (b.day - a.day).days
        for index, a in enumerate(sample)
        for b in sample[index + 1:]
        if (b.day - a.day).days > 0
    ]
    return statistics.median(slopes) if slopes else None


def _confidence(count: int, span_days: int, run_points: int) -> str:
    if count < 2 or span_days < 1:
        return NONE
    if count < 4 or span_days < 7:
        return LOW
    if count < 15 or span_days < 30 or run_points < 8:
        return MEDIUM
    return HIGH


def analyse(points: Sequence[Point], *, threshold: int | None = None, today: date | None = None) -> dict[str, Any]:
    """Facts about one part's stock history. Every key is always present."""

    points = list(points)
    result: dict[str, Any] = {
        "confidence": NONE,
        "trend": None,
        "decrease_per_day": None,
        "days_to_zero": None,
        "days_to_threshold": None,
        "pace": None,
        "recent_decrease_per_day": None,
        "days_to_zero_recent": None,
        "beyond_year": False,
        "restocks": 0,
        "restock_interval_days": None,
        "restock_expected_in_days": None,
        "zero_share": None,
        "restock_latency_days": None,
        "volatility": None,
        "sources_change": None,
        "concentration": None,
        "anomalies": [],
        "seasonality": None,
        "inputs": {"points": len(points), "span_days": 0, "points_in_run": 0, "current": points[-1].stock if points else None},
    }
    if len(points) < 2:
        return result
    result |= _shape(points)
    result["anomalies"] = anomalies(points)
    result["seasonality"] = seasonality(points)

    span = (points[-1].day - points[0].day).days
    restock_days: list[date] = []
    run: list[Point] = []
    for segment in _segments(points):
        run = segment[:1]
        for before, after in zip(segment, segment[1:]):
            if _is_restock(before.stock, after.stock):
                restock_days.append(after.day)
                run = [after]
            else:
                run.append(after)
    # `run` is the stretch since the last restock, or since the coverage last changed.

    current = points[-1].stock
    result["restocks"] = len(restock_days)
    result["inputs"] |= {"span_days": span, "points_in_run": len(run)}
    result["confidence"] = _confidence(len(points), span, len(run))

    slope = None
    run_span = (run[-1].day - run[0].day).days
    if len(run) >= MIN_RUN_POINTS and run_span >= MIN_RUN_SPAN_DAYS:
        slope = _theil_sen(run)
    if slope is not None:
        if slope < 0:
            result["trend"] = "falling"
            rate = -slope
            result["decrease_per_day"] = round(rate, 2)
            if current > 0:
                result["days_to_zero"] = math.ceil(current / rate)
            if threshold is not None and current > threshold:
                result["days_to_threshold"] = math.ceil((current - threshold) / rate)
            result |= _pace(run, current, rate)
        else:
            result["trend"] = "rising" if slope > 0 else "steady"

    if len(restock_days) >= 2:
        gaps = [(b - a).days for a, b in zip(restock_days, restock_days[1:])]
        interval = round(statistics.median(gaps))
        result["restock_interval_days"] = interval
        reference = today or points[-1].day
        result["restock_expected_in_days"] = interval - (reference - restock_days[-1]).days
    return result


def _pace(run: Sequence[Point], current: int, rate: float) -> dict[str, Any]:
    """Whether the fall is speeding up or slowing down: the rate in the later half of the run against the earlier half.

    Both halves must fall. ``recent_decrease_per_day`` and ``days_to_zero_recent`` are the later half's, for a drain that accelerates.
    """

    if len(run) < MIN_PACE_POINTS or (run[-1].day - run[0].day).days < MIN_PACE_SPAN_DAYS:
        return {}
    middle = len(run) // 2
    earlier, later = _theil_sen(run[:middle]), _theil_sen(run[middle:])
    if earlier is None or later is None or earlier >= 0 or later >= 0:
        return {}
    ratio = (-later) / (-earlier)
    pace = "accelerating" if ratio >= PACE_RATIO else "slowing" if ratio <= 1 / PACE_RATIO else "steady"
    found: dict[str, Any] = {"pace": pace}
    if pace == "accelerating" and current > 0:
        found["recent_decrease_per_day"] = round(-later, 2)
        found["days_to_zero_recent"] = math.ceil(current / -later)
    return found


def apply_horizon(insight: dict[str, Any], *, ending: bool) -> dict[str, Any]:
    """Limit how far ahead a drain is shown. A part still made and restocked runs out in at most a year as far as anyone can tell:
    longer is dropped and ``beyond_year`` says so. A part that is ending (last time buy, obsolete, a notice or last date to buy) has
    no limit, since nothing will refill it. Changes ``insight`` in place and returns it."""

    if ending:
        return insight
    for key in ("days_to_zero", "days_to_threshold", "days_to_zero_recent"):
        if insight.get(key) is not None and insight[key] > RESTOCKABLE_HORIZON_DAYS:
            if key == "days_to_zero":
                insight["beyond_year"] = True
            insight[key] = None
    return insight


def _shape(points: Sequence[Point]) -> dict[str, Any]:
    """How the stock has behaved over the whole history, not since the last restock: how often it was at zero, how long
    it stayed there before it came back, how widely it swung, and how many distributors held it."""

    shape: dict[str, Any] = {}
    if len(points) >= 4:
        shape["zero_share"] = round(sum(1 for point in points if point.stock == 0) / len(points), 3)
        average = statistics.fmean(point.stock for point in points)
        if average > 0:
            shape["volatility"] = round(statistics.pstdev(point.stock for point in points) / average, 2)
    # Zero runs that ended: the days between the first zero and the stock coming back.
    latencies: list[int] = []
    started: date | None = None
    for point in points:
        if point.stock == 0 and started is None:
            started = point.day
        elif point.stock > 0 and started is not None:
            latencies.append((point.day - started).days)
            started = None
    if latencies:
        shape["restock_latency_days"] = round(statistics.median(latencies))
    counted = [point.sources for point in points if point.sources is not None]
    if len(counted) >= 7:
        shape["sources_change"] = counted[-1] - counted[0]
    if points[-1].concentration is not None:
        shape["concentration"] = round(points[-1].concentration, 2)
    return shape


MAX_ANOMALIES = 5
# A single day in which stock falls by this share of a level that was worth noticing is not ordinary use.
ANOMALY_DROP_SHARE = 0.7
ANOMALY_MIN_LEVEL = 50
SEASON_MIN_SPAN_DAYS = 540
SEASON_MIN_POINTS = 120
SEASON_MIN_PER_MONTH = 5


def anomalies(points: Sequence[Point]) -> list[dict[str, Any]]:
    """Days on which stock fell by most of a notable level between two readings with the same coverage: a block order, a
    recall or a reporting change look like this, and ordinary use does not. The most recent few, newest first."""

    found = [
        {"day": after.day.isoformat(), "from": before.stock, "to": after.stock}
        for before, after in zip(points, points[1:])
        if before.listings == after.listings and before.stock >= ANOMALY_MIN_LEVEL
        and after.stock <= before.stock * (1 - ANOMALY_DROP_SHARE) and (after.day - before.day).days <= 3
    ]
    return found[::-1][:MAX_ANOMALIES]


def seasonality(points: Sequence[Point]) -> dict[str, Any] | None:
    """How stock runs by month of the year against its average, once there is more than a year of history. None before that.

    ``index`` is the month's average stock over the overall average (1 is typical) for months with enough readings."""

    if len(points) < SEASON_MIN_POINTS or (points[-1].day - points[0].day).days < SEASON_MIN_SPAN_DAYS:
        return None
    overall = statistics.fmean(point.stock for point in points)
    if overall <= 0:
        return None
    by_month: dict[int, list[int]] = {}
    for point in points:
        by_month.setdefault(point.day.month, []).append(point.stock)
    index = {
        month: round(statistics.fmean(values) / overall, 2)
        for month, values in sorted(by_month.items()) if len(values) >= SEASON_MIN_PER_MONTH
    }
    if len(index) < 6:
        return None
    return {"index": index, "peak": max(index, key=index.__getitem__), "trough": min(index, key=index.__getitem__)}


def lead_gap_days(insight: dict[str, Any], lead_time_days: int | None) -> int | None:
    """Days by which stock is expected to run out before a new order could arrive (the lead time less the days to zero),
    or None when it does not, or when either is unknown."""

    zero = insight.get("days_to_zero")
    if zero is None or lead_time_days is None or insight.get("confidence") not in (MEDIUM, HIGH):
        return None
    return lead_time_days - zero if zero < lead_time_days else None


def rupture_expected_within(insight: dict[str, Any], horizon_days: int = HORIZON_DAYS) -> int | None:
    """Days until stock hits zero if that is inside the horizon and believable, else None.

    Believable means at least medium confidence, and no regular restock due before then:
    a part that always dips before its restock is not about to run out.
    """

    days = insight.get("days_to_zero")
    if days is None or days > horizon_days or insight.get("confidence") not in (MEDIUM, HIGH):
        return None
    expected = insight.get("restock_expected_in_days")
    if expected is not None and 0 <= expected < days and insight.get("restocks", 0) >= 2:
        return None
    return int(days)
