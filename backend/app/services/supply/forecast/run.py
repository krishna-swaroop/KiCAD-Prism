"""The daily run of forecasts: make them for a part, keep them, check the ones whose day has come, and work out each model's state.

Called from the housekeeping job beside ``part_insights`` (a part's forecasts are renewed with its insights) and, for checking,
once a run. No distributor is asked: everything is worked out from readings already kept.
"""

from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Mapping

from app.services.supply import clock, freshness, insights, part_history
from app.services.supply.forecast import inputs, models, store
from app.services.supply.vocabulary import ENDING_LIFECYCLES

CHECK_DAYS = 200


def stock_forecast(conn, part_id: str, now: datetime, quantity: int | None = None) -> dict[str, Any]:
    """The stock forecast of a part (see ``models.stock_forecast``), at a quantity (the part's own price quantity by default)."""

    holders = inputs.holders(conn, part_id, now)
    outage, ratios, _cases = inputs.pooled(conn, now.astimezone(timezone.utc).date())
    wanted = quantity or inputs.default_quantity(conn, part_id)
    return models.stock_forecast(holders, outage, ratios, wanted, weekly=inputs.is_weekly(conn, part_id))


def price_forecast(conn, part_id: str, now: datetime) -> dict[str, Any]:
    series = inputs.series_of(conn, part_id, now)
    if not series:
        return {"available": False, "now": None, "reason": "no_prices"}
    return models.price_forecast(series, inputs.pooled_moves(conn, _tracked(conn), now), inputs.own_moves(conn, part_id, now))


def price_by_distributor(conn, part_id: str, now: datetime) -> list[dict[str, Any]]:
    """Each distributor's price in 30 and 90 days, from its own readings, in the currency of the part's history."""

    history = part_history.build(conn, part_id, now, 90)
    pool = inputs.pooled_moves(conn, _tracked(conn), now)
    found: list[dict[str, Any]] = []
    for line in history["connectors"]:
        series = [(date.fromisoformat(day), float(price)) for day, price in line["price"]]
        if not series:
            continue
        result = models.price_forecast(series, pool)
        if result.get("available"):
            found.append({"connector_id": line["connector_id"], "now": result["now"], "h30": result["h30"], "h90": result["h90"]})
    return found


def part_forecast(conn, part_id: str, now: datetime, quantity: int) -> dict[str, Any]:
    """What a part's sheet shows of its forecasts at ``quantity``, before the dates and model states are put on it
    (``views.part``): the stock forecast, the price forecast and each distributor's price, in their JSON form, as kept."""

    price = price_forecast(conn, part_id, now)
    made = {
        "stock": stock_forecast(conn, part_id, now, quantity),
        "price": price,
        "price_by_distributor": price_by_distributor(conn, part_id, now) if price.get("available") else [],
    }
    return json.loads(json.dumps(made))


def _tracked(conn) -> list[str]:
    return [row["part_id"] for row in conn.execute("SELECT part_id FROM supply_part_tiers").fetchall()]


def run_part(conn, part_id: str, now: datetime) -> dict[str, Any]:
    """Make and keep the forecasts of one part. Returns the little the lists need to show them."""

    day = now.astimezone(timezone.utc).date()
    seen = freshness.seen(conn)
    quantity = inputs.default_quantity(conn, part_id)
    made = part_forecast(conn, part_id, now, quantity)
    # The sheet reads this until something it is made from changes or the day turns (``views.part``).
    store.keep_part(conn, part_id, day, quantity, seen, made)
    stock = made["stock"]
    summary: dict[str, Any] = {"available": bool(stock.get("available")), "made_on": day.isoformat()}
    if stock.get("available"):
        run = stock["runout"]
        if run:
            store.store(conn, "part", part_id, "runout", day, max(math.ceil(run["high"]), 1), model="drain-sim", median=run["median"], low=run["low"], high=run["high"],
                        probability=run["probability"], inputs=stock["inputs"])
            summary["runout"] = {
                "median_date": (day + timedelta(days=round(run["median"]))).isoformat(), "low_date": (day + timedelta(days=round(run["low"]))).isoformat(),
                "high_date": (day + timedelta(days=round(run["high"]))).isoformat(), "p": run["probability"],
            }
        for item in stock["back"]:
            store.store(conn, "part", part_id, "back_in", day, max(math.ceil(item["high"]), 1), model="km-sim", scope=item["connector_id"],
                        median=item["median"], low=item["low"], high=item["high"], inputs={"quote_days": item["quote_days"], "ratio": item["ratio"]})
        store.store(conn, "part", part_id, "out_4w", day, 28, model="drain-sim", probability=stock["out_everywhere"]["4"], inputs=stock["inputs"])
        for target, weeks in (("can_buy_4w", 4), ("can_buy_8w", 8)):
            store.store(conn, "part", part_id, target, day, weeks * 7, model="drain-sim", quantity=quantity, probability=stock["weeks"][weeks - 1], inputs=stock["inputs"])
        summary |= {"p_out_4w": stock["out_everywhere"]["4"], "p_out_8w": stock["out_everywhere"]["8"],
                    "can_buy_4w": stock["weeks"][3], "can_buy_8w": stock["weeks"][7], "out_now": stock["out_now"]}
    _store_end_of_life(conn, part_id, day)
    price = made["price"]
    if price.get("available"):
        for target, key, horizon in (("price_30", "h30", 30), ("price_90", "h90", 90)):
            p = price[key]
            store.store(conn, "part", part_id, target, day, horizon, model="repricing-sim", median=p["median"], low=p["low"], high=p["high"], inputs=price["inputs"])
        summary["price_90"] = price["h90"] | {"now": price["now"], "date": (day + timedelta(days=90)).isoformat()}
    return summary


EOL_EVERY_DAYS = 28


def _store_end_of_life(conn, part_id: str, day: date) -> None:
    """Keep the 12-month end-of-life chance of a part that is not ending, about once a month (its check is a year away)."""

    from app.services.supply import parts_view

    recent = conn.execute(
        "SELECT 1 FROM supply_forecasts WHERE subject_kind = 'part' AND subject_id = %s AND target = 'eol_12' AND made_on > %s",
        (part_id, day - timedelta(days=EOL_EVERY_DAYS)),
    ).fetchone()
    if recent:
        return
    items = parts_view.summaries_for(conn, [part_id])
    if not items:
        return
    found = inputs.part_chance(conn, part_id, items[0]["lifecycle"], day, pooled=inputs.pooled_rates(conn, day))
    if found["available"]:
        store.store(conn, "part", part_id, "eol_12", day, 365, model="pooled-hazard", probability=found["p12"], inputs={"rate": found["rate"], "changes": found["changes"], "signs": found["signs"]})


# --- checking ---------------------------------------------------------------


class _Truth:
    """What actually happened to a part, read once per part while checking."""

    def __init__(self, conn, part_id: str, now: datetime) -> None:
        built = part_history.build(conn, part_id, now, CHECK_DAYS)
        self.total = {date.fromisoformat(d): int(n) for d, n in built["total"]}
        self.lines = {line["connector_id"]: {date.fromisoformat(d): int(n) for d, n in line["stock"]} for line in built["connectors"]}
        self.last = max(self.total) if self.total else None
        self.prices = {day: price for day, price in inputs.series_of(conn, part_id, now, CHECK_DAYS)}
        self.ended = [
            row["at"].astimezone(timezone.utc).date() for row in conn.execute(
                "SELECT at FROM supply_events WHERE part_id = %s AND kind = 'lifecycle_changed' AND payload->>'to' = ANY(%s)",
                (part_id, list(ENDING_LIFECYCLES)),
            ).fetchall()
        ]

    def covers(self, until: date) -> bool:
        """Whether readings reach (close to) ``until``: a forecast about a day nobody read is not judged."""

        return self.last is not None and (until - self.last).days <= 3

    @staticmethod
    def at(series: Mapping[date, Any], day: date):
        before = [d for d in series if d <= day]
        return series[max(before)] if before else None


def _judge(row: Mapping[str, Any], truth: _Truth) -> tuple[float | None, bool | None, bool]:
    """(observed, inside, void) for one forecast against the truth."""

    made = row["made_on"]
    target = row["target"]
    end = made + timedelta(days=int(row["horizon_days"]))
    if target == "eol_12":
        return float(any(made < day <= end for day in truth.ended)), None, False
    if not truth.covers(end):
        return None, None, True
    if target == "runout":
        for day in sorted(d for d in truth.total if d > made):
            before = truth.at(truth.total, day - timedelta(days=1)) or 0
            if truth.total[day] > before and insights.is_restock(before, truth.total[day]):
                return None, None, True  # restocked first: the premise of the drain no longer holds
            if truth.total[day] == 0:
                days = float((day - made).days)
                return days, bool(row["low"] <= days <= row["high"]), False
        return None, False, False
    if target == "back_in":
        line = truth.lines.get(row["scope"])
        if not line:
            return None, None, True
        for day in sorted(d for d in line if d > made):
            if line[day] > 0:
                days = float((day - made).days)
                return days, bool(row["low"] <= days <= row["high"]), False
        return None, False, False
    if target == "out_4w":
        # Out everywhere on any day of the window, as the forecast means it.
        return float(any(stock == 0 for day, stock in truth.total.items() if made < day <= end)), None, False
    if target in ("can_buy_4w", "can_buy_8w"):
        held = [truth.at(line, end) or 0 for line in truth.lines.values()]
        return float(any(stock >= max(int(row["quantity"] or 1), 1) for stock in held)), None, False
    if target in ("price_30", "price_90"):
        price = truth.at(truth.prices, end)
        if price is None:
            return None, None, True
        return float(price), bool(row["low"] - 1e-9 <= price <= row["high"] + 1e-9), False
    return None, None, True


def check_due(conn, now: datetime, limit: int = 2000) -> int:
    """Check the forecasts whose day has come. Returns how many."""

    day = now.astimezone(timezone.utc).date()
    rows = [row for row in store.due(conn, day, limit) if row["subject_kind"] == "part"]
    by_part: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_part[row["subject_id"]].append(row)
    done = 0
    for part_id, items in by_part.items():
        truth = _Truth(conn, part_id, now)
        for row in items:
            observed, inside, void = _judge(row, truth)
            store.record_check(conn, row["id"], day, observed=observed, inside=inside, void=void)
            done += 1
    return done


def run_checks(conn, now: datetime | None = None) -> dict[str, Any]:
    """Check what is due, drop what is old, and work the models' states out again."""

    now = now or clock.now()
    checked = check_due(conn, now)
    store.forget_old(conn, now.astimezone(timezone.utc).date())
    return {"checked": checked, "states": store.update_models(conn, now)}
