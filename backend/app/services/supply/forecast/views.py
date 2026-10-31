"""A forecast as the screens get it: dates instead of day counts, the words for chances, and each figure's model state.

Also the roll-ups across all tracked parts, from the ones Prism keeps: the Dashboard tile and "Coming up", the panel line,
and Insights' families. Computed on request from the readings (no distributor call); the quantity is a question and nothing
is saved.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Mapping

from app.services.supply import clock, freshness, part_insights
from app.services.supply import settings as supply_settings
from app.services.supply.forecast import inputs, models, run, store

COMING_UP = 10


def _day(today: date, offset: float) -> str:
    return (today + timedelta(days=round(offset))).isoformat()


def _range(today: date, item: Mapping[str, Any], extra: Mapping[str, Any] | None = None) -> dict[str, Any]:
    return {"low": _day(today, item["low"]), "median": _day(today, item["median"]), "high": _day(today, item["high"]), **(extra or {})}


def _chance(probability: float) -> dict[str, Any]:
    return {"probability": probability, "percent": store.chance_percent(probability), "word": store.chance_word(probability)}


def _borrowed(state: dict[str, Any], stock: dict[str, Any]) -> dict[str, Any]:
    """A runout worked out from similar parts, because the part has too few readings of its own, is kept as learning: it says so."""

    if stock["inputs"].get("from_similar"):
        return {**state, "state": "learning", "reason": "The drain is taken from similar parts of the same maker and category: this part has too few readings of its own."}
    return state


def part(conn, part_id: str, now: datetime | None = None, quantity: int | None = None) -> dict[str, Any]:
    """Everything the part sheet's Forecast section and chart bands need. At the part's own quantity it is the forecast the daily run
    kept, while that is today's and nothing it is made from has changed; otherwise it is worked out now, and kept when it is at the
    part's own quantity. Only another quantity is never kept."""

    now = now or clock.now()
    today = now.astimezone(timezone.utc).date()
    states = store.model_states(conn)

    def state(target: str) -> dict[str, Any]:
        item = states[target]
        return {"state": item["state"], "checks": item["checks"], "needs": item["needs"], "reason": item["reason"]}

    own = inputs.default_quantity(conn, part_id)
    wanted = quantity or own
    made = store.kept_part(conn, part_id, today, own) if wanted == own else None
    if made is None:
        seen = freshness.seen(conn)
        made = run.part_forecast(conn, part_id, now, wanted)
        if wanted == own:
            store.keep_part(conn, part_id, today, own, seen, made)
    stock, price = made["stock"], made["price"]
    out: dict[str, Any] = {"available": bool(stock.get("available")), "reason": stock.get("reason"), "today": today.isoformat(), "models": {name: state(name) for name in states}}
    if stock.get("available"):
        weeks = [{"week": index + 1, "date": _day(today, (index + 1) * 7), **_chance(value)} for index, value in enumerate(stock["weeks"])]
        out |= {
            "quantity": stock["quantity"], "out_now": stock["out_now"], "weeks": weeks,
            "buy_state": {"4w": state("can_buy_4w"), "8w": state("can_buy_8w")},
            "out_everywhere": {"4w": _chance(stock["out_everywhere"]["4"]), "8w": _chance(stock["out_everywhere"]["8"])},
            "runout": ({**_range(today, stock["runout"]), **_chance(stock["runout"]["probability"]), "state": _borrowed(state("runout"), stock)} if stock["runout"] else None),
            "back": [
                _range(today, item, {"connector_id": item["connector_id"], "name": item["name"], "provider": item["provider"], "quote_days": item["quote_days"],
                                      "ratio": item["ratio"], "beyond_share": item["beyond"], "state": state("back_in")})
                for item in stock["back"]
            ],
            "path": [{"day": _day(today, offset), "low": low, "median": mid, "high": high} for offset, low, mid, high in stock["path"]],
            "inputs": stock["inputs"],
            "by_distributor": {
                "stock": [
                    {"connector_id": item["connector_id"], "path": [{"day": _day(today, offset), "median": median} for offset, median in item["path"]]}
                    for item in stock["holder_paths"]
                ],
                "price": [],
            },
        }
    if price.get("available"):
        out["price"] = {
            "now": price["now"], "inputs": price["inputs"],
            "h30": {**price["h30"], "date": _day(today, 30), "state": state("price_30")},
            "h90": {**price["h90"], "date": _day(today, 90), "state": state("price_90")},
        }
        out.setdefault("by_distributor", {"stock": [], "price": []})["price"] = [
            {"connector_id": item["connector_id"], "now": item["now"],
             "h30": {"date": _day(today, 30), "median": item["h30"]["median"], "low": item["h30"]["low"], "high": item["h30"]["high"]},
             "h90": {"date": _day(today, 90), "median": item["h90"]["median"], "low": item["h90"]["low"], "high": item["h90"]["high"]}}
            for item in made["price_by_distributor"]
        ]
    items = _lifecycle_of(conn, part_id)
    if items is not None:
        found = inputs.part_chance(conn, part_id, items, today)
        # Until enough lifecycle changes are seen the chance is the prior's, which says "almost certain" of every new part next to an
        # outlook of no signs (UX-02, Q6). It is still stored to learn from; it is shown once it rests on data.
        if found["available"] and found["changes"] >= found["needs"]:
            out["end_of_life"] = {"p12": _chance(found["p12"]), "p24": _chance(found["p24"]), "changes": found["changes"], "needs": found["needs"], "state": state("eol_12")}
    return out


def _lifecycle_of(conn, part_id: str) -> str | None:
    from app.services.supply import parts_view

    found = parts_view.summaries_for(conn, [part_id])
    return found[0]["lifecycle"] if found else None


def _rows(conn) -> list[dict[str, Any]]:
    return [row for row in part_insights.read_all(conn) if (row.get("forecast") or {}).get("available")]


def dashboard(conn, today: date | None = None) -> dict[str, Any]:
    """The tile ("likely out in 4 weeks") and the next ten expected events."""

    today = today or clock.now().date()
    states = store.model_states(conn)
    rows = _rows(conn)
    # Likely out by the one rule the likely_out check and the Insights lists use (the part's or the workspace's chance).
    likely_4w = [row for row in rows if part_insights.KINDS["likely_out_4w"](row)]
    events = []
    for row in rows:
        forecast = row["forecast"]
        run = forecast.get("runout")
        if run:
            events.append({"kind": "runout", "date": run["median_date"], "part_id": row["part_id"], "mpn": row["mpn"],
                           "manufacturer": row["manufacturer"], "text": "likely out", "probability": run["p"]})
        price = forecast.get("price_90")
        if price and price.get("now") and abs(price["median"] / price["now"] - 1) >= 0.05:
            up = price["median"] > price["now"]
            events.append({"kind": "price", "date": price["date"], "part_id": row["part_id"], "mpn": row["mpn"],
                           "manufacturer": row["manufacturer"], "text": f"price likely {'up' if up else 'down'} {abs(price['median'] / price['now'] - 1) * 100:.0f}%", "probability": None})
    events.sort(key=lambda item: item["date"])
    return {
        "likely_out_4w": len(likely_4w), "state": states["out_4w"], "coming_up": events[:COMING_UP],
        "part_ids_likely_out_4w": [row["part_id"] for row in likely_4w],
    }


def panel_line(conn, part_id: str) -> dict[str, str] | None:
    """One line for the KiCad panel's Availability block, from the kept forecast, once its models have a good record. Else None."""

    states = store.model_states(conn)
    if not (store.shown(states, "can_buy_8w") and store.shown(states, "out_4w")):
        return None
    forecast = (part_insights.of_parts(conn, [part_id]).get(part_id) or {}).get("forecast") or {}
    if not forecast.get("available") or forecast.get("out_now"):
        return None
    out_4w, can_8w, run = forecast.get("p_out_4w") or 0.0, forecast.get("can_buy_8w") or 0.0, forecast.get("runout")
    if out_4w >= 0.7 and run:
        return {"tone": "warning", "text": f"Likely out by {run['median_date']} ({store.chance_percent(out_4w)}%)"}
    if can_8w >= 0.7:
        return {"tone": "ok", "text": f"Likely in stock for the next 8 weeks ({store.chance_percent(can_8w)}%)"}
    return None


def insights_page(conn, today: date | None = None) -> dict[str, Any]:
    """The Insights Forecasts section: coming up, lead times ahead, early warnings, prices ahead, lifecycle, and the track record."""

    today = today or clock.now().date()
    board = dashboard(conn, today)
    families = inputs.outlook(conn, today)
    movers = []
    for row in _rows(conn):
        price = row["forecast"].get("price_90")
        if price and price.get("now") and price["now"] > 0:
            movers.append({"part_id": row["part_id"], "mpn": row["mpn"], "manufacturer": row["manufacturer"], "now": price["now"], "low": price["low"],
                           "median": price["median"], "high": price["high"], "change": price["median"] / price["now"] - 1, "flat": bool(price.get("flat"))})
    movers.sort(key=lambda item: -item["change"])
    return {
        "currency": supply_settings.base_currency(conn),
        "coming_up": board["coming_up"], "likely_out_4w": board["likely_out_4w"],
        "lead_times": families["lead_times"], "warnings": families["warnings"],
        "prices": {"parts": len(movers), "flat": sum(1 for m in movers if m["flat"]), "likeliest_up": movers[:50]},
        "lifecycle": {"last_buy_lag": inputs.last_buy_lag(conn), "changes": inputs.rates(conn, today)["changes"], "needs": models.MIN_CHANGES_TO_SHOW},
        "track_record": store.track_record(conn),
    }
