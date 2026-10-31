"""Market indices: how the parts Prism follows are doing as a group, by manufacturer.

Only parts that are watched or on a project BOM are counted, so these describe what this workspace uses and the
distributors it connects. They are not the market. A figure is shown only for a group of at least
``MIN_SAMPLE`` parts, and its sample size is always given. One snapshot is stored a day, so a figure can be
set against a month earlier.

A group is a manufacturer or a category (the one the distributors file the part under; DigiKey's, else Mouser's).
Metrics (shares are 0 to 1): ``out_of_stock`` (no distributor has it), ``lifecycle_risk`` (not recommended for
new designs, last time buy or obsolete), ``dropped`` (every distributor stopped selling it) and
``median_lead_time_days`` (parts with a lead time given) and ``price_index``: a chain-linked index, 100 on the first
snapshot of a group, each day multiplied by the median change in price of the group's listings since the last
snapshot (each listing against its own earlier price, so a currency never mixes with another).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from statistics import median
from typing import Any, Mapping, Sequence

from app.services.supply import clock, offer_rules, parts_view, price_breaks, price_quantity, pricing
from app.services.supply.vocabulary import ENDING_LIFECYCLES

MIN_SAMPLE = 3
MAX_SERIES = 6
ALL = "all"
METRICS = ("out_of_stock", "lifecycle_risk", "dropped", "median_lead_time_days", "price_index")
INDEX_BASE = Decimal(100)
COMPARE_DAYS = 30
CATEGORY_PREFIX = "category:"
HISTORY_DAYS = 365


def _tracked_part_ids(conn) -> list[str]:
    return [
        row["id"]
        for row in conn.execute(
            "SELECT p.id FROM supply_parts p WHERE EXISTS (SELECT 1 FROM supply_part_tiers t WHERE t.part_id = p.id)"
        ).fetchall()
    ]


def metrics_of(rows: Sequence[Mapping[str, Any]]) -> dict[str, float]:
    """The metrics of one group of parts. Each row has ``stock``, ``lifecycle``, ``offers`` (counted)."""

    with_data = [row for row in rows if row["stock"] is not None]
    result: dict[str, float] = {}
    if with_data:
        result["out_of_stock"] = sum(1 for row in with_data if row["stock"] == 0) / len(with_data)
        result["dropped"] = sum(
            1 for row in with_data if row["offers"] and all(offer["discontinued"] for offer in row["offers"])
        ) / len(with_data)
    result["lifecycle_risk"] = sum(1 for row in rows if row["lifecycle"] in ENDING_LIFECYCLES) / len(rows)
    leads = [lead for row in rows if (lead := offer_rules.lead_time_of(row["offers"])) is not None]
    if leads:
        result["median_lead_time_days"] = float(median(leads))
    return result


def _categories(conn, part_ids: Sequence[str]) -> dict[str, str]:
    """Each part's category: DigiKey's wording when it has one, else Mouser's, else any provider's."""

    if not part_ids:
        return {}
    rows = conn.execute(
        "SELECT DISTINCT ON (part_id) part_id, value FROM supply_part_facts WHERE name = 'category' AND part_id = ANY(%s) "
        "ORDER BY part_id, CASE provider WHEN 'digikey' THEN 0 WHEN 'mouser' THEN 1 ELSE 2 END, provider",
        (list(part_ids),),
    ).fetchall()
    return {row["part_id"]: row["value"] for row in rows}


def compute(conn) -> dict[str, dict[str, Any]]:
    """Metrics per scope: ``all``, every manufacturer and every category (``category:<name>``) with enough tracked parts."""

    ids = _tracked_part_ids(conn)
    items, offers = parts_view.summaries_with_offers(conn, ids)
    categories = _categories(conn, ids)
    rows = [
        {"id": item["id"], "manufacturer": item["manufacturer"], "category": categories.get(item["id"], ""), "stock": item["stock"],
         "lifecycle": item["lifecycle"], "offers": offers.get(item["id"], [])}
        for item in items
    ]
    groups: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        # A maker nobody has confirmed (or none at all) is not a group of its own.
        if row["manufacturer"] != "Not known yet":
            groups.setdefault(row["manufacturer"], []).append(row)
        if row["category"]:
            groups.setdefault(CATEGORY_PREFIX + row["category"], []).append(row)
    scopes: dict[str, dict[str, Any]] = {}
    if len(rows) >= MIN_SAMPLE:
        scopes[ALL] = {"sample": len(rows), "metrics": metrics_of(rows), "ids": [row["id"] for row in rows]}
    for name, group in groups.items():
        if len(group) >= MIN_SAMPLE:
            scopes[name] = {"sample": len(group), "metrics": metrics_of(group), "ids": [row["id"] for row in group]}
    return scopes


def price_changes(conn, part_ids: Sequence[str], since: datetime) -> dict[str, list[Decimal]]:
    """Per part, how each of its counted listings' unit price at the part's quantity changed since ``since``: the price breaks in force
    now over those in force then (``price_breaks``).

    A listing with no price at either end, a price of nothing, or a change of currency is left out. A part with no listing left has
    no entry.
    """

    if not part_ids:
        return {}
    rows = conn.execute(
        # The listings the stock, lead and lifecycle figures count (``parts_view``): a disabled connector's kept prices are history,
        # not today's market.
        "SELECT l.id AS listing_id, l.part_id FROM supply_listings l JOIN supply_connectors c ON c.id = l.connector_id "
        "WHERE l.part_id = ANY(%s) AND supply_counted(l.match_state) AND c.enabled", (list(part_ids),),
    ).fetchall()
    quantities = price_quantity.of_parts(conn, part_ids)
    kept = price_breaks.load(conn, [row["listing_id"] for row in rows])
    found: dict[str, list[Decimal]] = {}
    for row in rows:
        ratio = _ratio_at_quantity(kept.get(row["listing_id"], []), quantities[row["part_id"]], since.date())
        if ratio is not None:
            found.setdefault(row["part_id"], []).append(ratio)
    return found


def _ratio_at_quantity(history: Sequence[dict], quantity: int, since_day: date) -> Decimal | None:
    """The price change of one listing at ``quantity`` from its kept breaks: the latest over those in force before ``since_day``
    (on the day before it). None when they do not reach back that far."""

    if not history:
        return None
    then, now = price_breaks.in_force(history, since_day - timedelta(days=1)), history[-1]
    if then is None:
        return None
    before = pricing.unit_price_at(then["breaks"], moq=then["moq"], order_multiple=then["order_multiple"], wanted=quantity, up_to=then.get("up_to"))
    after = pricing.unit_price_at(now["breaks"], moq=now["moq"], order_multiple=now["order_multiple"], wanted=quantity, up_to=now.get("up_to"))
    if not before or not after or then["currency"] != now["currency"]:
        return None
    return after / before


def _price_index(conn, kind: str, name: str, ids: Sequence[str], today: date) -> Decimal | None:
    """Today's chain-linked price index of one group: the last stored value times the median price change since then."""

    last = conn.execute(
        "SELECT day, value FROM supply_market_indices WHERE scope_kind = %s AND scope_value = %s AND metric = 'price_index' AND day < %s "
        "ORDER BY day DESC LIMIT 1",
        (kind, name, today),
    ).fetchone()
    if last is None:
        return INDEX_BASE
    since = datetime.combine(last["day"] + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
    per_part = [Decimal(str(median(ratios))) for ratios in price_changes(conn, ids, since).values()]
    if not per_part:
        return Decimal(last["value"])
    return (Decimal(last["value"]) * Decimal(str(median(per_part)))).quantize(Decimal("0.0001"))


def snapshot(conn, today: date | None = None) -> int:
    """Store today's indices unless they were stored already. Returns how many values were written."""

    today = today or clock.now().date()
    if conn.execute("SELECT 1 FROM supply_market_indices WHERE day = %s LIMIT 1", (today,)).fetchone():
        return 0
    written = 0
    for scope, data in compute(conn).items():
        if scope == ALL:
            kind, name = "all", ""
        elif scope.startswith(CATEGORY_PREFIX):
            kind, name = "category", scope[len(CATEGORY_PREFIX):]
        else:
            kind, name = "manufacturer", scope
        data["metrics"]["price_index"] = float(_price_index(conn, kind, name, data["ids"], today) or INDEX_BASE)
        for metric, value in data["metrics"].items():
            conn.execute(
                "INSERT INTO supply_market_indices (day, scope_kind, scope_value, metric, value, sample_size) VALUES (%s, %s, %s, %s, %s, %s)",
                (today, kind, name, metric, value, data["sample"]),
            )
            written += 1
    return written


def overview(conn, today: date | None = None) -> dict[str, Any]:
    """The latest snapshot per scope, each metric with its value a month earlier when that was stored."""

    today = today or clock.now().date()
    latest_day = conn.execute("SELECT MAX(day) AS day FROM supply_market_indices").fetchone()["day"]
    if latest_day is None:
        return {"day": None, "scopes": []}
    before_day = conn.execute(
        "SELECT MAX(day) AS day FROM supply_market_indices WHERE day <= %s", (latest_day - timedelta(days=COMPARE_DAYS),)
    ).fetchone()["day"]
    scopes: dict[tuple[str, str], dict[str, Any]] = {}
    for row in conn.execute(
        "SELECT scope_kind, scope_value, metric, value, sample_size FROM supply_market_indices WHERE day = %s", (latest_day,)
    ).fetchall():
        scope = scopes.setdefault((row["scope_kind"], row["scope_value"]), {"scope": row["scope_value"] or "All followed parts", "kind": row["scope_kind"], "sample": row["sample_size"], "metrics": {}})
        scope["metrics"][row["metric"]] = {"value": float(row["value"]), "before": None}
    if before_day is not None:
        for row in conn.execute(
            "SELECT scope_kind, scope_value, metric, value FROM supply_market_indices WHERE day = %s", (before_day,)
        ).fetchall():
            target = scopes.get((row["scope_kind"], row["scope_value"]))
            if target and row["metric"] in target["metrics"]:
                target["metrics"][row["metric"]]["before"] = float(row["value"])
    ordered = sorted(scopes.values(), key=lambda item: (item["kind"] != "all", -item["sample"], item["scope"].lower()))
    return {
        "day": latest_day.isoformat(), "compared_with": before_day.isoformat() if before_day else None, "min_sample": MIN_SAMPLE,
        "scopes": ordered, "signals": signals(ordered),
    }


SIGNAL_OUT_OF_STOCK_RISE = 0.2
SIGNAL_LEAD_RISE = 0.25
SIGNAL_LEAD_MIN_DAYS = 14


def signals(scopes: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Groups where something is moving together: more of a manufacturer's or a category's parts out of stock than a month
    ago, or its lead times stretching. A group is only judged with a figure from a month earlier and enough parts."""

    found: list[dict[str, Any]] = []
    for scope in scopes:
        if scope["kind"] == "all" or scope["sample"] < MIN_SAMPLE:
            continue
        metrics = scope["metrics"]
        stock = metrics.get("out_of_stock")
        if stock and stock["before"] is not None and stock["value"] - stock["before"] >= SIGNAL_OUT_OF_STOCK_RISE:
            found.append({
                "kind": scope["kind"], "scope": scope["scope"], "signal": "draining", "was": stock["before"], "now": stock["value"],
                "text": f"{scope['scope']}: {round(stock['value'] * 100)}% of the parts you follow are out of stock, up from {round(stock['before'] * 100)}%.",
            })
        lead = metrics.get("median_lead_time_days")
        if lead and lead["before"] and lead["value"] - lead["before"] >= SIGNAL_LEAD_MIN_DAYS and lead["value"] >= lead["before"] * (1 + SIGNAL_LEAD_RISE):
            found.append({
                "kind": scope["kind"], "scope": scope["scope"], "signal": "lead_times", "was": lead["before"], "now": lead["value"],
                "text": f"{scope['scope']}: the median lead time is {round(lead['value'])} days, up from {round(lead['before'])}.",
            })
    return found


def history(conn, metric: str, today: date | None = None) -> dict[str, Any]:
    """One metric over the stored days, a line per group: ``{"metric", "series": [{"kind", "scope", "points": [[day, value]]}]}``.

    Groups are the whole set first, then the largest by sample size, at most ``MAX_SERIES``.
    """

    if metric not in METRICS:
        raise ValueError("unknown metric")
    today = today or clock.now().date()
    rows = conn.execute(
        "SELECT day, scope_kind, scope_value, value, sample_size FROM supply_market_indices "
        "WHERE metric = %s AND day >= %s ORDER BY day",
        (metric, today - timedelta(days=HISTORY_DAYS)),
    ).fetchall()
    series: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        entry = series.setdefault((row["scope_kind"], row["scope_value"]), {
            "kind": row["scope_kind"], "scope": row["scope_value"] or "All followed parts", "sample": 0, "points": []})
        entry["sample"] = row["sample_size"]
        entry["points"].append([row["day"].isoformat(), float(row["value"])])
    ordered = sorted(series.values(), key=lambda item: (item["kind"] != "all", -item["sample"], item["scope"].lower()))
    return {"metric": metric, "series": ordered[:MAX_SERIES]}
