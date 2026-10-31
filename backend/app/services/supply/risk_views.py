"""The risk views of the Dashboard and Insights: where the risk sits, the dates that cannot be missed, who carries the BOM.

Industry practice (SiliconExpert, Z2Data, Altium BOM Portal) puts risk on a grid of lifecycle against availability, keeps a
calendar of last-time-buy and last-ship dates, and counts how many distributors carry the parts. Unknown is always its own
category and never folded into "fine". Reads only, from the summaries, the facts kept in ``part_insights`` and the facts distributors state.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, timedelta
from typing import Any, Mapping, Sequence

from app.services.supply import clock, compliance, facts, fx, part_insights, parts_view, price_quantity, pricing, trade
from app.services.supply import settings as supply_settings

LIFECYCLES = ("active", "nrnd", "last_time_buy", "obsolete", "unknown")
AVAILABILITY = ("two_plus", "one", "out", "not_read")
DEADLINE_DAYS = 365
DEADLINE_LIMIT = 40
LEAD_BUCKETS = part_insights.LEAD_BUCKETS
MOVERS = 50
ORIGINS = 12
CONTROLLED_LIMIT = 200
# The bars of the Insights compliance charts.
ROHS_BARS = ("compliant", "not_compliant", "disputed", "not_applicable", "unknown")
REACH_BARS = ("compliant", "affected", "not_applicable", "unknown")


def availability_of(item: Mapping[str, Any], held: Mapping[str, Any] | None) -> str:
    """Where a part stands for supply: nothing read, out, held by one distributor, or by two or more."""

    if item["stock"] is None:
        return "not_read"
    if item["stock"] == 0:
        return "out"
    holders = (held or {}).get("holders")
    return "two_plus" if holders is not None and holders >= 2 else "one"


def risk_grid(items: Sequence[Mapping[str, Any]], kept: Mapping[str, Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Lifecycle against availability, one row per lifecycle, every cell a count of parts."""

    cells: dict[str, Counter[str]] = {name: Counter() for name in LIFECYCLES}
    for item in items:
        lifecycle = item["lifecycle"] if item["lifecycle"] in cells else "unknown"
        cells[lifecycle][availability_of(item, kept.get(item["id"]))] += 1
    return [{"lifecycle": name, **{column: cells[name].get(column, 0) for column in AVAILABILITY}} for name in LIFECYCLES]


def _day(text: str) -> date | None:
    try:
        return date.fromisoformat(text.strip()[:10])
    except ValueError:
        return None


def deadlines(conn, tracked: Sequence[str], today: date) -> list[dict[str, Any]]:
    """Last-time-buy and last-ship dates of open notices and the last date to buy a distributor gives, in the next year, soonest first."""

    if not tracked:
        return []
    until = today + timedelta(days=DEADLINE_DAYS)
    found: list[dict[str, Any]] = []
    for row in conn.execute(
        """
        SELECT n.title, n.last_time_buy, n.last_time_ship, n.notice_url, pp.part_id, p.mpn, m.name AS manufacturer
        FROM supply_pcns n JOIN supply_pcn_parts pp ON pp.pcn_id = n.id JOIN supply_parts p ON p.id = pp.part_id JOIN supply_manufacturers m ON m.id = p.manufacturer_id
        WHERE n.state = 'open' AND pp.part_id = ANY(%s) AND (n.last_time_buy IS NOT NULL OR n.last_time_ship IS NOT NULL)
        """,
        (list(tracked),),
    ).fetchall():
        for kind, when in (("last_time_buy", row["last_time_buy"]), ("last_time_ship", row["last_time_ship"])):
            if when and today <= when <= until:
                found.append({"part_id": row["part_id"], "mpn": row["mpn"], "manufacturer": row["manufacturer"], "kind": kind, "date": when.isoformat(), "source": "notice", "url": row["notice_url"]})
    for row in conn.execute(
        """
        SELECT f.part_id, f.provider, f.value, p.mpn, m.name AS manufacturer
        FROM supply_part_facts f JOIN supply_parts p ON p.id = f.part_id JOIN supply_manufacturers m ON m.id = p.manufacturer_id
        WHERE f.name = 'last_buy_date' AND f.part_id = ANY(%s)
        """,
        (list(tracked),),
    ).fetchall():
        when = _day(row["value"])
        if when and today <= when <= until:
            found.append({"part_id": row["part_id"], "mpn": row["mpn"], "manufacturer": row["manufacturer"], "kind": "last_buy_date", "date": when.isoformat(), "source": row["provider"], "url": ""})
    found.sort(key=lambda item: (item["date"], item["mpn"].lower()))
    seen: set[tuple[str, str, str]] = set()
    unique = []
    for item in found:
        key = (item["part_id"], item["kind"], item["date"])
        if key not in seen:
            seen.add(key)
            unique.append(item)
    return unique[:DEADLINE_LIMIT]


def coverage(conn, items: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """For each distributor: how many of the tracked parts it lists, holds in stock, and is the cheapest for."""

    ids = [item["id"] for item in items]
    listed, held, cheapest, names = _coverage_sets(conn, items)
    return sorted(
        ({"connector_id": cid, "name": names[cid][0], "provider": names[cid][1], "tracked": len(ids), "listed": len(listed[cid]), "in_stock": len(held[cid]), "cheapest": len(cheapest[cid])} for cid in listed),
        key=lambda item: -item["listed"],
    )


def _coverage_sets(conn, items: Sequence[Mapping[str, Any]]):
    """For each distributor the parts it lists, holds in stock and is the cheapest for, as sets of part ids (the counts are their sizes)."""

    ids = [item["id"] for item in items]
    offers = parts_view.offers_by_part(conn, ids)
    quantities = price_quantity.of_parts(conn, ids)
    base = supply_settings.base_currency(conn)
    rates = fx.latest(conn)
    listed: dict[str, set[str]] = defaultdict(set)
    held: dict[str, set[str]] = defaultdict(set)
    cheapest: dict[str, set[str]] = defaultdict(set)
    names: dict[str, tuple[str, str]] = {}
    for part_id in ids:
        here = [offer for offer in offers.get(part_id, []) if not offer["marketplace"]]
        by_connector: dict[str, dict[str, Any]] = {}
        for offer in here:
            names[offer["connector_id"]] = (offer["connector_name"], offer["provider"])
            entry = by_connector.setdefault(offer["connector_id"], {"stock": 0, "price": None})
            entry["stock"] += int(offer["stock"] or 0)
            found = pricing.quote(offer, quantities[part_id], base, rates)
            if found is not None and (entry["price"] is None or found.price < entry["price"]):
                entry["price"] = found.price
        for connector_id, entry in by_connector.items():
            listed[connector_id].add(part_id)
            if entry["stock"] > 0:
                held[connector_id].add(part_id)
        priced = {cid: entry for cid, entry in by_connector.items() if entry["price"] is not None}
        if len(priced) > 1:
            best = min(entry["price"] for entry in priced.values())
            for connector_id, entry in priced.items():
                if entry["price"] == best:
                    cheapest[connector_id].add(part_id)
        for connector_id in by_connector:
            cheapest.setdefault(connector_id, set())
    return listed, held, cheapest, names


def origin_labels(conn, tracked: Sequence[str]) -> dict[str, str]:
    """The country each tracked part is said to come from: the one country distributors give, ``Several`` when they differ, else ``Unknown``."""

    origins: dict[str, set[str]] = defaultdict(set)
    for row in conn.execute("SELECT part_id, value FROM supply_part_facts WHERE name = 'origin_country' AND part_id = ANY(%s)", (list(tracked),)).fetchall():
        origins[row["part_id"]].add(row["value"].strip())
    found = {part_id: {value for value in origins.get(part_id, set()) if value} for part_id in tracked}
    return {part_id: (sorted(values)[0] if len(values) == 1 else "Several" if values else "Unknown") for part_id, values in found.items()}


# Filters that carry a value (``kind:value``), from the Insights charts that have one bar per country or distributor.
VALUED = ("origin", "listed", "stocked", "cheapest", "repricing", "leader", "restock_first", "risk")


def valued_members(conn, only: str, items: Sequence[Mapping[str, Any]]) -> set[str] | None:
    """The parts one bar of a per-country or per-distributor chart counts, or None when ``only`` is not such a filter."""

    kind, _, value = only.partition(":")
    if kind not in VALUED or not value:
        return None
    if kind == "risk":
        # One cell of the risk grid, "nrnd.one": exactly the parts ``risk_grid`` counts there.
        lifecycle, _, column = value.partition(".")
        if lifecycle not in LIFECYCLES or column not in AVAILABILITY:
            return None
        kept = {row["part_id"]: row for row in part_insights.read_all(conn)}
        return {
            item["id"] for item in items
            if (item["lifecycle"] if item["lifecycle"] in LIFECYCLES else "unknown") == lifecycle and availability_of(item, kept.get(item["id"])) == column
        }
    ids = [item["id"] for item in items]
    if kind == "origin":
        return {part_id for part_id, label in origin_labels(conn, ids).items() if label == value}
    if kind in ("listed", "stocked", "cheapest"):
        listed, held, cheapest, names = _coverage_sets(conn, items)
        sets = {"listed": listed, "stocked": held, "cheapest": cheapest}[kind]
        return set().union(*(sets.get(cid, set()) for cid, (name, _provider) in names.items() if name == value))
    wanted = set(ids)
    members: set[str] = set()
    for row in part_insights.read_all(conn):
        if row["part_id"] not in wanted:
            continue
        behaviour = row.get("behaviour") or {}
        if kind == "repricing" and value in (behaviour.get("repricing") or {}):
            members.add(row["part_id"])
        elif kind == "leader" and behaviour.get("leader") == value:
            members.add(row["part_id"])
        elif kind == "restock_first" and behaviour.get("restock_first") == value:
            members.add(row["part_id"])
    return members


def lifecycle_mix(items: Sequence[Mapping[str, Any]]) -> dict[str, int]:
    counts = Counter(item["lifecycle"] if item["lifecycle"] in LIFECYCLES else "unknown" for item in items)
    return {name: counts.get(name, 0) for name in LIFECYCLES}


def outlook_bands(rows: Sequence[Mapping[str, Any]]) -> dict[str, int]:
    from app.services.supply import outlook

    counts = Counter(row.get("outlook_band") or outlook.UNKNOWN for row in rows)
    return {name: counts.get(name, 0) for name in (outlook.ENDED, outlook.ENDING, outlook.WARNING_SIGNS, outlook.NO_SIGNS, outlook.UNKNOWN)}


def compliance_verdicts(conn, tracked: Sequence[str]) -> tuple[dict[str, str], dict[str, str]]:
    """RoHS and REACH verdict of each tracked part. RoHS is ``compliance.rohs_verdicts``: the offers first, the stated status when
    none says. REACH is by what distributors state: any one saying affected wins, then unaffected, else unknown."""

    reach: dict[str, set[str]] = defaultdict(set)
    if tracked:
        for row in conn.execute(
            "SELECT part_id, value FROM supply_part_facts WHERE name = 'reach_status' AND part_id = ANY(%s)", (list(tracked),)
        ).fetchall():
            reach[row["part_id"]].add(facts.reach_class(row["value"]))

    def verdict(classes: set[str]) -> str:
        if "affected" in classes:
            return "affected"
        if "unaffected" in classes:
            return "compliant"
        return "not_applicable" if "not_applicable" in classes else "unknown"

    return compliance.rohs_verdicts(conn, tracked), {part_id: verdict(reach.get(part_id, set())) for part_id in tracked}


def compliance_counts(conn, tracked: Sequence[str]) -> dict[str, dict[str, int]]:
    """RoHS and REACH counts by verdict (see ``compliance_verdicts``)."""

    rohs, reach = compliance_verdicts(conn, tracked)
    rohs_counts, reach_counts = Counter(rohs.values()), Counter(reach.values())
    return {
        "rohs": {name: rohs_counts.get(name, 0) for name in ROHS_BARS},
        "reach": {name: reach_counts.get(name, 0) for name in REACH_BARS},
    }


def lead_histogram(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """The shortest quoted lead time of each part in buckets of weeks; parts that give none are counted apart."""

    counts = Counter(part_insights.lead_bucket(row.get("lead_days")) for row in rows)
    return [{"bucket": name, "parts": counts.get(name, 0)} for name in [*(name for name, _ in LEAD_BUCKETS), "over_26w", "none"]]


def price_movers(rows: Sequence[Mapping[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """The parts whose cheapest price moved most over 30 days, up and down."""

    moved = [row for row in rows if row.get("price_change_percent")]

    def pick(row: Mapping[str, Any]) -> dict[str, Any]:
        return {"part_id": row["part_id"], "mpn": row["mpn"], "manufacturer": row["manufacturer"], "percent": row["price_change_percent"]}

    up = sorted((row for row in moved if row["price_change_percent"] > 0), key=lambda row: -row["price_change_percent"])
    down = sorted((row for row in moved if row["price_change_percent"] < 0), key=lambda row: row["price_change_percent"])
    return {"up": [pick(row) for row in up[:MOVERS]], "down": [pick(row) for row in down[:MOVERS]]}


def _control(part_id: str, eccn: Mapping[str, set[str]], marks: Mapping[str, Any]) -> tuple[str, str]:
    """A part's export control state and the class to show: a person's mark wins over what distributors state."""

    mark = marks.get(part_id)
    if mark:
        return ("controlled", mark["eccn"]) if mark["control"] == "controlled" else ("none", "")
    classes = {value for value in eccn.get(part_id, set()) if value}
    state = trade.control_of(sorted(classes))
    return state, ", ".join(sorted(classes)) if state in ("controlled", "disputed") else ""


def control_states(conn, tracked: Sequence[str]) -> dict[str, str]:
    """Export control state of each tracked part (controlled, disputed, none, unknown)."""

    eccn: dict[str, set[str]] = defaultdict(set)
    for row in conn.execute("SELECT part_id, value FROM supply_part_facts WHERE name = 'eccn' AND part_id = ANY(%s)", (list(tracked),)).fetchall():
        eccn[row["part_id"]].add(row["value"].strip())
    marks = {row["part_id"]: row for row in conn.execute("SELECT part_id, control, eccn FROM supply_part_trade_marks WHERE part_id = ANY(%s)", (list(tracked),)).fetchall()}
    return {part_id: _control(part_id, eccn, marks)[0] for part_id in tracked}


# The Insights charts whose bars open the parts behind them: name, then how to tell which tracked parts belong.
GROUPS = (
    *(f"rohs_{name}" for name in ROHS_BARS),
    *(f"reach_{name}" for name in REACH_BARS),
    *(f"control_{name}" for name in ("controlled", "disputed", "none", "unknown")),
)


def group_members(conn, group: str, tracked: Sequence[str]) -> set[str]:
    """The tracked parts one bar of the compliance and export control charts counts."""

    kind, _, value = group.partition("_")
    if kind == "rohs":
        verdicts = compliance_verdicts(conn, tracked)[0]
    elif kind == "reach":
        verdicts = compliance_verdicts(conn, tracked)[1]
    elif kind == "control":
        verdicts = control_states(conn, tracked)
    else:
        raise KeyError(group)
    return {part_id for part_id, verdict in verdicts.items() if verdict == value}


def trade_overview(conn, tracked: Sequence[str]) -> dict[str, Any]:
    """Where the tracked parts come from and which are export controlled. A person's mark wins over what distributors state."""

    if not tracked:
        return {"origins": [], "other_origins": 0, "control": {"controlled": 0, "none": 0, "disputed": 0, "unknown": 0}, "controlled": []}
    origins: dict[str, set[str]] = defaultdict(set)
    eccn: dict[str, set[str]] = defaultdict(set)
    for row in conn.execute("SELECT part_id, name, value FROM supply_part_facts WHERE name IN ('origin_country', 'eccn') AND part_id = ANY(%s)", (list(tracked),)).fetchall():
        (origins if row["name"] == "origin_country" else eccn)[row["part_id"]].add(row["value"].strip())
    marks = {row["part_id"]: row for row in conn.execute("SELECT part_id, control, eccn FROM supply_part_trade_marks WHERE part_id = ANY(%s)", (list(tracked),)).fetchall()}
    names = {row["id"]: (row["mpn"], row["manufacturer"]) for row in conn.execute(
        "SELECT p.id, p.mpn, m.name AS manufacturer FROM supply_parts p JOIN supply_manufacturers m ON m.id = p.manufacturer_id WHERE p.id = ANY(%s)", (list(tracked),)).fetchall()}
    country: Counter[str] = Counter()
    control: Counter[str] = Counter()
    controlled = []
    for part_id in tracked:
        found = {value for value in origins.get(part_id, set()) if value}
        country[sorted(found)[0] if len(found) == 1 else ("Several" if found else "Unknown")] += 1
        state, code = _control(part_id, eccn, marks)
        control[state] += 1
        if state in ("controlled", "disputed") and len(controlled) < CONTROLLED_LIMIT:
            controlled.append({"part_id": part_id, "mpn": names.get(part_id, ("", ""))[0], "manufacturer": names.get(part_id, ("", ""))[1], "eccn": code, "state": state, "by_person": part_id in marks})
    top = [(name, count) for name, count in country.most_common() if name not in ("Unknown", "Several")][:ORIGINS]
    shown = {name for name, _ in top}
    return {
        "origins": [{"country": name, "parts": count} for name, count in top] + [{"country": name, "parts": country[name]} for name in ("Several", "Unknown") if country.get(name)],
        "other_origins": sum(count for name, count in country.items() if name not in shown and name not in ("Unknown", "Several")),
        "control": {name: control.get(name, 0) for name in ("controlled", "none", "disputed", "unknown")},
        "controlled": controlled,
    }


def today() -> date:
    return clock.now().date()
