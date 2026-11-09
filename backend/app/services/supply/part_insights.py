"""What the stock and price history says about each tracked part, kept so a page can list and chart every part at once.

``parts_view.part_detail`` works one part out when its sheet opens. The Dashboard and Insights need the same facts for all
of them, so housekeeping keeps one row per tracked part (``part_insights``) and renews the oldest. No distributor call.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Any, Callable

from app.services.supply import clock, freshness, insights, offer_rules, price_behaviour, prices, promises

SPARK_DAYS = 30
PRICE_MOVE_PERCENT = 5
OFTEN_OUT_SHARE = 0.2

# The groups the Insights lists and the Dashboard bars count, each a test on one part's facts. ``runs_out_*`` are buckets of
# the projected days until zero stock; the others are findings.
# Parts nothing will refill: no limit on how far ahead their drain is shown.
ENDING_BANDS = ("ended", "ending")
OUTLOOK_BANDS = ("ended", "ending", "warning_signs", "no_signs", "unknown")
# The shortest quoted lead time in buckets of weeks.
LEAD_BUCKETS = (("under_2w", 14), ("2_to_8w", 56), ("8_to_16w", 112), ("16_to_26w", 182))


def lead_bucket(days: int | None) -> str:
    if not days:
        return "none"
    return next((name for name, limit in LEAD_BUCKETS if days <= limit), "over_26w")


KINDS: dict[str, Callable[[dict[str, Any]], bool]] = {
    "runs_out_2w": lambda d: d["days_to_zero"] is not None and d["days_to_zero"] <= 14,
    "runs_out_8w": lambda d: d["days_to_zero"] is not None and 14 < d["days_to_zero"] <= 56,
    "runs_out_later": lambda d: d["days_to_zero"] is not None and d["days_to_zero"] > 56,
    "steady": lambda d: d["trend"] in ("steady", "rising") or bool(d.get("beyond_year")),
    "few_readings": lambda d: d["trend"] is None and d["stock"] != 0,
    "draining": lambda d: d["trend"] == "falling" and not d.get("beyond_year"),
    "restock_late": lambda d: d["restock_expected_in_days"] is not None and d["restock_expected_in_days"] < 0,
    "often_out": lambda d: (d["zero_share"] or 0) >= OFTEN_OUT_SHARE,
    "one_distributor": lambda d: d["holders"] == 1,
    "lead_up": lambda d: bool(d["lead_time_trend"]) and d["lead_time_trend"]["after"] > d["lead_time_trend"]["before"],
    "unusual_drop": lambda d: (d["anomalies"] or 0) > 0,
    "likely_out_4w": lambda d: _likely_out(d, "p_out_4w"),
    "likely_out_8w": lambda d: _likely_out(d, "p_out_8w"),
    "price_moving": lambda d: d["price_change_percent"] is not None and abs(d["price_change_percent"]) >= PRICE_MOVE_PERCENT,
    # The groups of the Insights charts "When parts will end" and "Lead times", so a bar and the list behind it agree.
    **{f"outlook_{band}": (lambda d, band=band: (d.get("outlook_band") or "unknown") == band) for band in OUTLOOK_BANDS},
    **{f"lead_{bucket}": (lambda d, bucket=bucket: lead_bucket(d.get("lead_days")) == bucket) for bucket in (*(name for name, _ in LEAD_BUCKETS), "over_26w", "none")},
}
def out_chance(facts: dict[str, Any] | None, key: str = "p_out_4w") -> float | None:
    """The forecast's chance of being out everywhere (within 4 weeks, or 8 with ``p_out_8w``) of a part that has stock; None without one."""

    forecast = (facts or {}).get("forecast") or {}
    if not forecast.get("available") or forecast.get("out_now") or forecast.get(key) is None:
        return None
    return float(forecast[key])


def _likely_out(facts: dict[str, Any], key: str) -> bool:
    """Likely out: the forecast's chance at least the one kept with the facts, the workspace's or the part's own (the
    ``likely_out`` check's threshold too)."""

    chance = out_chance(facts, key)
    return chance is not None and chance >= facts.get("likely_at", DEFAULT_LIKELY_AT)


# Kept facts are renewed when a mark says what they are made from changed (``freshness``), and at least this often, since their
# trends move with the clock. A run renews as many as it can in ``RENEW_SECONDS`` (one part takes about 90 ms): missing first,
# then marked, then the oldest.
# The chance that is "likely out" until the workspace's setting is kept with the facts (``settings.Alerts.likely_out_percent``).
DEFAULT_LIKELY_AT = 0.7
RENEW_AFTER = timedelta(hours=20)
RENEW_SECONDS = 60.0
_RENEW_BATCH = 100


def compute(conn, part_id: str, now: datetime) -> dict[str, Any]:
    """The facts for one part, small enough to keep: the trend, when stock runs out, the lead time, the price move, 30 days of stock."""

    from app.services.supply import parts_view  # parts_view lists with these facts, so it is imported here

    days = parts_view.history(conn, part_id, now)
    watch = conn.execute("SELECT threshold FROM supply_watches WHERE part_id = %s", (part_id,)).fetchone()
    insight = parts_view.insight_from(days, watch["threshold"] if watch else None, now)
    offers = parts_view.offers_by_part(conn, [part_id]).get(part_id, [])
    lead = offer_rules.lead_time_of(offers)
    price = prices.view(prices.daily_cheapest(conn, part_id, now, prices.CHART_DAYS), now.date())
    last = days[-1] if days else None
    band = _outlook_band(conn, part_id, offers, days, (price["trend"] or {}).get("change_percent"))
    insights.apply_horizon(insight, ending=band in ENDING_BANDS)
    behaviour = price_behaviour.load(conn, part_id, now)
    forecast = _forecast(conn, part_id, now)
    arrivals = promises.reliability(conn, part_id, now.date())
    return {
        "confidence": insight["confidence"],
        "trend": insight["trend"],
        "decrease_per_day": insight["decrease_per_day"],
        "days_to_zero": insight["days_to_zero"],
        "days_to_zero_recent": insight["days_to_zero_recent"],
        "pace": insight["pace"],
        "beyond_year": insight["beyond_year"],
        "restocks": insight["restocks"],
        "restock_interval_days": insight["restock_interval_days"],
        "restock_expected_in_days": insight["restock_expected_in_days"],
        "zero_share": insight["zero_share"],
        "volatility": insight["volatility"],
        "sources_change": insight["sources_change"],
        "concentration": insight["concentration"],
        "anomalies": len(insight["anomalies"]),
        "lead_days": lead,
        "outlook_band": band,
        "lead_gap_days": insights.lead_gap_days(insight, lead),
        "lead_time_trend": parts_view.lead_time_trend(conn, part_id, now),
        "price_change_percent": (price["trend"] or {}).get("change_percent"),
        "price_trend": price["trend"],
        "likely_at": _likely_at(conn, part_id),
        "forecast": forecast,
        "stock": last["stock"] if last else None,
        "holders": last["sources"] if last else None,
        "spark": [day["stock"] for day in days[-SPARK_DAYS:]],
        "behaviour": {
            "repricing": behaviour["repricing"],
            "leader": (behaviour["leadership"] or {}).get("leader"),
            "restock_first": (behaviour["restock_order"] or {}).get("first"),
            "arrivals": {"on_time": arrivals["on_time"], "resolved": arrivals["arrived"] + arrivals["slipped"]} if arrivals and arrivals["on_time"] is not None else None,
        },
    }


def _likely_at(conn, part_id: str) -> float:
    """The chance that makes the part likely out: its own rule's, else the workspace's (``alert_rules``, assessment settings)."""

    from app.services.supply import alert_rules
    from app.services.supply import settings as supply_settings

    own = alert_rules.for_parts(conn, [part_id]).get(part_id)
    return ((own.likely_out_percent if own else None) or supply_settings.load(conn).alerts.likely_out_percent) / 100


def _forecast(conn, part_id: str, now: datetime) -> dict[str, Any]:
    """Make and keep the part's forecasts and return the little a list shows. A failure leaves the rest of the insights as they are."""

    from app.services.supply.forecast import run as forecast_run

    try:
        with conn.transaction():
            return forecast_run.run_part(conn, part_id, now)
    except Exception:  # noqa: BLE001
        import logging

        logging.getLogger(__name__).info("Forecasts not made for %s", part_id, exc_info=True)
        return {"available": False}


def _outlook_band(conn, part_id: str, offers: list[dict[str, Any]], days: list[dict[str, Any]], price_change: float | None) -> str:
    """Where the part stands on the way to its end of life (see ``outlook``), kept so Insights can count the bands."""

    from app.services.supply import facts, outlook, pcn
    from app.services.supply.vocabulary import Lifecycle, worst_lifecycle

    lifecycle = worst_lifecycle(Lifecycle(offer["lifecycle"]) for offer in offers)
    found = outlook.outlook(
        lifecycle, offers, zero_stock_days=outlook.trailing_zero_days(days), price_change_percent=price_change,
        notices=pcn.for_part(conn, part_id),
        last_buy_dates=[
            (source["source"], source["value"])
            for item in facts.for_part(conn, part_id) if item["name"] == "last_buy_date" for source in item["sources"]
        ],
    )
    return found["band"]


def refresh(conn, part_id: str, now: datetime) -> None:
    import json

    seen, snap = freshness.seen(conn)
    data = compute(conn, part_id, now)
    conn.execute(
        f"INSERT INTO supply_part_insights (part_id, computed_at, data, seen, snap, own) VALUES (%s, %s, %s::jsonb, %s, %s, {freshness.OWN_SQL}) "
        "ON CONFLICT (part_id) DO UPDATE SET computed_at = EXCLUDED.computed_at, data = EXCLUDED.data, seen = EXCLUDED.seen, "
        "snap = EXCLUDED.snap, own = EXCLUDED.own",
        (part_id, now, json.dumps(data), seen, snap),
    )


def renew(conn, now: datetime | None = None, seconds: float = RENEW_SECONDS) -> list[str]:
    """Work out the facts again for the tracked parts that have none, that a mark made stale or that are older than ``RENEW_AFTER``,
    in that order, until ``seconds`` have gone. Returns the parts renewed."""

    now = now or clock.now()
    stop, done, tried = time.monotonic() + seconds, [], set()
    while time.monotonic() < stop:
        rows = conn.execute(
            f"""
            SELECT pt.part_id FROM supply_part_tiers pt LEFT JOIN supply_part_insights i ON i.part_id = pt.part_id
            CROSS JOIN LATERAL (SELECT i.part_id IS NOT NULL AND {freshness.stale_sql("insight", "ARRAY[i.part_id]", "i")} AS marked) m
            WHERE (i.part_id IS NULL OR m.marked OR i.computed_at < %s) AND pt.part_id <> ALL(%s)
            ORDER BY i.part_id IS NOT NULL, NOT m.marked, i.computed_at, pt.part_id LIMIT {_RENEW_BATCH}
            """,
            (now - RENEW_AFTER, list(tried)),
        ).fetchall()
        if not rows:
            break
        for row in rows:
            if time.monotonic() >= stop:
                break
            refresh(conn, row["part_id"], now)
            tried.add(row["part_id"])
            done.append(row["part_id"])
    return done


def read_all(conn) -> list[dict[str, Any]]:
    """Every tracked part with its facts and the little the lists need to show it."""

    rows = conn.execute(
        """
        SELECT i.part_id, i.computed_at, i.data, p.mpn, m.name AS manufacturer, pt.tier
        FROM supply_part_insights i JOIN supply_part_tiers pt ON pt.part_id = i.part_id JOIN supply_parts p ON p.id = i.part_id
        JOIN supply_manufacturers m ON m.id = p.manufacturer_id
        """
    ).fetchall()
    return [
        {"part_id": row["part_id"], "mpn": row["mpn"], "manufacturer": row["manufacturer"], "tier": row["tier"], "computed_at": row["computed_at"], **row["data"]}
        for row in rows
    ]


def matching(conn, kind: str) -> set[str]:
    """The ids of the tracked parts a kind applies to."""

    test = KINDS[kind]
    return {row["part_id"] for row in read_all(conn) if test(row)}


def of_parts(conn, part_ids: list[str]) -> dict[str, dict[str, Any]]:
    """The facts kept for these parts, by part id (parts without any are left out)."""

    rows = conn.execute("SELECT part_id, data FROM supply_part_insights WHERE part_id = ANY(%s)", (part_ids,)).fetchall()
    return {row["part_id"]: row["data"] for row in rows}
