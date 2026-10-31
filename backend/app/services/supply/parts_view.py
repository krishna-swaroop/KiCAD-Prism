"""Read models for the Parts screen: a list of parts and the detail of one.

Reads only. Counting rules are the ones in ``stock`` (exact and manual listings,
no marketplace stock, pooling per provider). A part with a watch is "watched".
"""

from __future__ import annotations

import hashlib
import json
import statistics
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Callable, Literal, Mapping, Sequence

from app.services.supply import attention, budget, clock, counted, facts, freshness, fx, headline_price, insights, offer_rules, outlook, params, part_history, part_insights, parts, pcn, preferences, price_behaviour, price_quantity, prices, pricing, promises, scorecard, stock, trade_marks, usage
from app.services.supply.history import days_sql
from app.services.supply import settings as supply_settings
from app.services.supply.forecast import store
from app.services.supply.providers import registry
from app.services.supply.tiers import SCHEDULES
from app.services.supply.offer_lines import in_base, offer_lines
from app.services.supply.vocabulary import ENDING_LIFECYCLES, STATUS_ORDER, Lifecycle, worst_lifecycle

# watched: tracked at tier 1 or 2; tier1 and tier2 narrow that; waiting: waits for room at a distributor; pick: has several
# listings at a distributor and no packaging picked.
Scope = Literal["watched", "followed", "in_use", "all", "tier1", "tier2", "waiting", "pick"]
Filter = Literal[
    "", "at_risk", "out_of_stock", "lifecycle", "runs_out_2w", "runs_out_8w", "runs_out_later", "steady", "few_readings", "draining",
    "restock_late", "often_out", "one_distributor", "lead_up", "unusual_drop", "price_moving", "likely_out_4w", "likely_out_8w",
    "lifecycle_active", "lifecycle_nrnd", "lifecycle_last_time_buy", "lifecycle_obsolete", "lifecycle_unknown",
    "outlook_ended", "outlook_ending", "outlook_warning_signs", "outlook_no_signs", "outlook_unknown",
    "lead_under_2w", "lead_2_to_8w", "lead_8_to_16w", "lead_16_to_26w", "lead_over_26w", "lead_none",
    "rohs_compliant", "rohs_not_compliant", "rohs_disputed", "rohs_not_applicable", "rohs_unknown",
    "reach_compliant", "reach_affected", "reach_not_applicable", "reach_unknown",
    "control_controlled", "control_disputed", "control_none", "control_unknown",
]
# "At risk" is error or fatal everywhere (the Dashboard, this filter, the Projects view, a project's page); a warning only needs a look.
_AT_RISK = ("fatal", "error")


def _sql_in(values) -> str:
    return "(" + ", ".join(f"'{value}'" for value in values) + ")"


# The groups the Overview counts, so a count and the list it links to agree: each as a test of a kept summary (``s``) and the same
# test of a summary row.
_GROUPS: dict[str, tuple[str, Callable[[dict[str, Any]], bool]]] = {
    "at_risk": (f"s.status IN {_sql_in(_AT_RISK)}", lambda item: item["status"] in _AT_RISK),
    "out_of_stock": ("s.stock = 0", lambda item: item["stock"] == 0),
    "lifecycle": (f"s.lifecycle IN {_sql_in(ENDING_LIFECYCLES)}", lambda item: item["lifecycle"] in ENDING_LIFECYCLES),
    **{f"lifecycle_{state.value}": (f"s.lifecycle = '{state.value}'", lambda item, value=state.value: item["lifecycle"] == value) for state in Lifecycle},
}
FILTERS: dict[str, Callable[[dict[str, Any]], bool]] = {name: test for name, (_sql, test) in _GROUPS.items()}
MAX_LIMIT = 200
HISTORY_DAYS = 90
# Most often first: the schedule a part is read on.
_TIER_ORDER = list(SCHEDULES)
_STATUS_RANK = {status.value: rank for rank, status in enumerate(STATUS_ORDER)}
# Of a kept summary, what needs a look first.
_RANK_SQL = "CASE s.status " + " ".join(f"WHEN '{status}' THEN {rank}" for status, rank in _STATUS_RANK.items()) + f" ELSE {len(_STATUS_RANK)} END"


def _like(text: str) -> str:
    """A contains-pattern for ILIKE with the user's own wildcards made literal."""

    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _tracking_dto(row) -> dict[str, Any] | None:
    """Whether Prism follows the part and why: tier 1 or 2, how often, and the reasons (a project, a person, a component)."""

    if row["tracking_tier"] is None:
        return None
    return {"tier": int(row["tracking_tier"]), "rate": row["tracking_rate"], "reasons": row["tracking_reasons"]}


def _watch_dto(row) -> dict[str, Any] | None:
    if row["watch_id"] is None:
        return None
    return {"threshold": row["threshold"], "pinned": bool(row["pinned"]), "owner": row["owner"],
            "packaging": row["watch_packaging"] or "any"}


# Why a part has no counted stock at all, when it should have; None when it is merely not read yet.
PROBLEM_NOT_FOUND = "not_found"  # distributors were asked and none carries it
PROBLEM_GONE = "gone"  # it had listings and every one has disappeared
PROBLEM_LABEL = {PROBLEM_NOT_FOUND: "No distributor carries this part number", PROBLEM_GONE: "Every listing for this part has disappeared"}


def problem_of(*, counted: bool, gone: bool, listed: bool, searched: bool) -> str | None:
    """Why a part with nothing counted is in trouble, or None if it is merely not read yet (or candidates wait in Review)."""

    if counted:
        return None
    if gone:
        return PROBLEM_GONE
    return PROBLEM_NOT_FOUND if searched and not listed else None


def _problems(conn, part_ids: list[str]) -> dict[str, str | None]:
    """Why a part with nothing counted is in trouble, per part."""

    if not part_ids:
        return {}
    facts = {
        row["part_id"]: row
        for row in conn.execute(
            """
            SELECT part_id,
                   bool_or(match_state = ANY(%s)) AS counted,
                   bool_or(match_state = 'gone') AS gone,
                   bool_or(match_state <> 'rejected') AS listed
            FROM supply_listings WHERE part_id = ANY(%s) GROUP BY part_id
            """,
            (list(counted.STATES), part_ids),
        ).fetchall()
    }
    searched = {
        row["part_id"]
        for row in conn.execute("SELECT DISTINCT part_id FROM supply_discovery_runs WHERE part_id = ANY(%s)", (part_ids,)).fetchall()
    }
    result: dict[str, str | None] = {}
    for part_id in part_ids:
        fact = facts.get(part_id)
        result[part_id] = problem_of(
            counted=bool(fact and fact["counted"]), gone=bool(fact and fact["gone"]), listed=bool(fact and fact["listed"]), searched=part_id in searched,
        )
    return result


# A part some visible project's BOM uses: one set over every part, not a scan of the BOM lines for each (role twice as parameters).
_IN_USE = "p.id IN (SELECT pp.part_id FROM (" + usage.part_projects_sql(False) + ") pp)"

_ROW_SELECT = (
    "SELECT p.id, p.mpn, m.name AS manufacturer, m.provisional AS maker_provisional, w.id AS watch_id, w.threshold, w.pinned, w.owner, w.packaging AS watch_packaging, "
    "pt.tier AS tracking_tier, pt.rate AS tracking_rate, pt.reasons AS tracking_reasons "
    "FROM supply_parts p JOIN supply_manufacturers m ON m.id = p.manufacturer_id LEFT JOIN supply_watches w ON w.part_id = p.id "
    "LEFT JOIN supply_part_tiers pt ON pt.part_id = p.id "
)


def offers_by_part(conn, part_ids: list[str], *, every_listing: bool = False) -> dict[str, list[dict]]:
    """Counted offers per part (exact and manual listings), with what pricing and display need.

    A distributor with several listings of a part is counted once, through the one followed (``packaging_picks``). With
    ``every_listing`` the others come too, for the lists that show each way of buying."""

    offers: dict[str, list[dict]] = defaultdict(list)
    if not part_ids:
        return offers
    for row in conn.execute(
        """
        SELECT l.part_id, l.connector_id, l.sku, c.provider, c.display_name AS connector_name, {pool} AS pool,
               o.stock, o.marketplace, o.packaging, o.reel_size, o.packaging_inferred, o.discontinued, o.rohs, o.reach_affected, o.fetched_at, o.lifecycle, o.price_breaks, o.currency, o.moq,
               o.order_multiple, o.lead_time_days, o.product_url, o.price_up_to, ps.tier,
               EXISTS (SELECT 1 FROM supply_packaging_picks fp WHERE fp.listing_id = l.id) AS followed
        FROM supply_listings l
        JOIN supply_offers o ON o.listing_id = l.id
        JOIN supply_connectors c ON c.id = l.connector_id
        LEFT JOIN supply_poll_state ps ON ps.listing_id = l.id
        WHERE l.part_id = ANY(%s) AND {state} AND c.enabled AND (%s OR {read})
        """.replace("{state}", counted.state_sql()).replace("{read}", counted.read_sql()).replace("{pool}", stock.pool_sql()),
        (part_ids, every_listing),
    ).fetchall():
        offers[row["part_id"]].append(dict(row))
    if not every_listing:
        _one_offer_per_pick(offers)
    return offers


def _one_offer_per_pick(offers: dict[str, list[dict]]) -> None:
    """A distributor with a pick is one offer: the followed listing, which prices the part, carrying the stock of every listing the
    distributor has (``stock.connector_stock``: cut tape and custom reel are one pile, a full reel adds)."""

    for part_id, rows in offers.items():
        by_connector: dict[str, list[dict]] = defaultdict(list)
        for row in rows:
            by_connector[row["connector_id"]].append(row)
        kept: list[dict] = []
        for held in by_connector.values():
            followed = next((row for row in held if row["followed"]), None)
            if followed is None or len(held) == 1:
                kept.extend(held)
                continue
            sold = [row for row in held if not row["marketplace"]]
            kept.append({**followed, "stock": stock.connector_stock(followed["provider"], sold) if sold and not followed["marketplace"] else followed["stock"]})
        offers[part_id] = kept


def _offer_summary(offers_here: list[dict], policy: str, problem: str | None, price: dict[str, Any]) -> dict[str, Any]:
    """What a part's counted offers add up to. This is what ``part_summaries`` keeps."""

    combined = stock.aggregate(offers_here, policy) if offers_here else None
    lifecycle = worst_lifecycle(Lifecycle(o["lifecycle"]) for o in offers_here)
    tiers = [o["tier"] for o in offers_here if o["tier"]]
    return {
        "problem": problem if combined is None else None,
        "stock": combined.total if combined else None,
        "listings": combined.listings if combined else 0,
        "lifecycle": lifecycle.value,
        # Every distributor that lists it has stopped selling it.
        "dropped": bool(offers_here) and all(o["discontinued"] for o in offers_here),
        **price,
        # As old as the oldest read the total rests on: a fresh zero from one distributor doesn't make another's old stock current.
        "fetched_at": combined.as_of.isoformat() if combined and combined.as_of else None,
        "dated_by": "oldest",
        "tier": min(tiers, key=_TIER_ORDER.index) if tiers else None,
    }


def _money(conn) -> tuple[str, fx.Rates, str]:
    """The workspace currency, the exchange rates, and a key naming both: a kept summary priced with another key is stale."""

    base = supply_settings.base_currency(conn)
    rates = fx.latest(conn)
    named = ",".join([base, str(rates.day), *(f"{currency}={rate}" for currency, rate in sorted(rates.per_eur.items()))])
    return base, rates, hashlib.sha256(named.encode()).hexdigest()[:16]


def _now() -> datetime:
    """The time a summary's status is assessed at (a test sets its own clock)."""

    return clock.now()


def _computed(conn, rows, offers: dict[str, list[dict]], money: tuple[str, fx.Rates, str] | None = None) -> dict[str, dict[str, Any]]:
    problems = _problems(conn, [r["id"] for r in rows])
    base, rates, priced_with = money or _money(conn)
    quantities = price_quantity.of_parts(conn, [r["id"] for r in rows])
    found, counted = {}, {}
    for row in rows:
        here = [o for o in offers.get(row["id"], []) if stock.counts(o["packaging"], row["watch_packaging"] or "any")]
        price = headline_price.headline(
            [o for o in here if not o["marketplace"]], quantities[row["id"]], base, rates,
            lambda part_id=row["id"]: prices.last_in_stock(conn, part_id, base, rates, quantities[part_id]),
        )
        summary = _offer_summary(here, row["watch_packaging"] or "any", problems.get(row["id"]), price)
        summary["priced_with"] = priced_with
        found[row["id"]] = summary
        counted[row["id"]] = here
    # The part's status is its assessment's (without a build to cover), kept with the summary so lists filter and the Dashboard counts
    # on it; it holds until what it read changes (``freshness``) or the clock changes it (``changes_at``).
    from app.services.supply.assessment import service as assessment  # the assessment reads summaries, so it is imported here

    items = [
        {"id": row["id"], "lifecycle": found[row["id"]]["lifecycle"], "problem": found[row["id"]]["problem"],
         "tracking": {"rate": row["tracking_rate"]} if row["tracking_rate"] else None,
         "watch": {"threshold": row["threshold"]} if row["watch_id"] else None}
        for row in rows
    ]
    for part_id, assessed in assessment.assess_summaries(conn, items, counted, {}, _now()).items():
        found[part_id].update(status=assessed["status"], health=assessed["health"], changes_at=assessed["changes_at"])
    return found


# Bumped whenever what a kept summary holds or how it is worked out changes: every kept one is then worked out again.
SUMMARY_VERSION = 3
_SUMMARY_FIELDS = (
    "part_id text, status text, health real, changes_at timestamptz, problem text, stock integer, listings integer, lifecycle text, "
    "dropped boolean, tier text, unit_price numeric, as_of timestamptz, price jsonb, priced_with text"
)
_PRICE_KEYS = ("unit_price", "currency", "price_quantity", "price_kind", "price_lead_days", "price_range", "price_native", "price_seen_day",
               "price_unrated", "price_test_data")


def _current_sql(priced_with: str, summary: str = "s") -> str:
    """SQL for "this kept summary is current": worked out by this code, in today's currency at today's rates (neither marks a part:
    they change every price at once), no change it did not see has marked it (``freshness``), and the clock has not reached the time
    its assessment changes by itself (``changes_at``: a read falling late, a last date to buy coming close). Takes the clock's time as
    its one parameter, after any the caller's SQL has before it."""

    if not priced_with.isalnum():
        raise ValueError("not a pricing key")
    return (
        f"({summary}.version = {SUMMARY_VERSION} AND {summary}.priced_with = '{priced_with}' AND {summary}.snap > 0 "
        f"AND ({summary}.changes_at IS NULL OR {summary}.changes_at > %s) "
        f"AND NOT {freshness.stale_sql('summary', f'ARRAY[{summary}.part_id]', summary)})"
    )


def _from_row(row) -> dict[str, Any]:
    """A kept summary as ``_computed`` gives it."""

    return {
        "problem": row["problem"], "stock": row["stock"], "listings": row["listings"], "lifecycle": row["lifecycle"], "dropped": row["dropped"],
        **row["price"],
        "fetched_at": row["as_of"].isoformat() if row["as_of"] else None, "dated_by": "oldest", "tier": row["tier"], "status": row["status"],
        "health": row["health"], "changes_at": row["changes_at"].isoformat() if row["changes_at"] else None, "priced_with": row["priced_with"],
    }


def _keep(conn, found: dict[str, dict[str, Any]], seen: tuple[str, int]) -> None:
    """Keep worked-out summaries, as a favour to the next reader: never wait for a row another transaction holds, and write them all at
    once. ``seen`` is the snapshot taken before what they were worked out from was read (``freshness.seen``)."""

    if not found:
        return
    ids = list(found)
    mine = {row["part_id"] for row in conn.execute(
        "SELECT part_id FROM supply_part_summaries WHERE part_id = ANY(%s) FOR UPDATE SKIP LOCKED", (ids,)).fetchall()}
    held = {row["part_id"] for row in conn.execute("SELECT part_id FROM supply_part_summaries WHERE part_id = ANY(%s)", (ids,)).fetchall()} - mine

    def records(part_ids: list[str]) -> str:
        return json.dumps([
            {"part_id": part_id, **{key: found[part_id][key] for key in ("status", "health", "changes_at", "problem", "stock", "listings", "lifecycle", "dropped", "tier", "unit_price", "priced_with")},
             "as_of": found[part_id]["fetched_at"], "price": {key: found[part_id][key] for key in _PRICE_KEYS}}
            for part_id in part_ids
        ])

    columns = "status, health, changes_at, problem, stock, listings, lifecycle, dropped, tier, unit_price, as_of, price, priced_with"
    values = ", ".join("n." + name.strip() for name in columns.split(","))
    update = [part_id for part_id in ids if part_id in mine]
    insert = [part_id for part_id in ids if part_id not in mine and part_id not in held]
    if update:
        conn.execute(
            f"UPDATE supply_part_summaries s SET ({columns}, version, seen, snap, own, computed_at) = "
            f"({values}, %s, %s, %s, {freshness.OWN_SQL}, %s) "
            f"FROM jsonb_to_recordset(%s::jsonb) AS n({_SUMMARY_FIELDS}) WHERE s.part_id = n.part_id",
            (SUMMARY_VERSION, *seen, clock.now(), records(update)),
        )
    if insert:
        conn.execute(
            f"INSERT INTO supply_part_summaries (part_id, {columns}, version, seen, snap, own, computed_at) "
            f"SELECT n.part_id, {values}, %s, %s, %s, {freshness.OWN_SQL}, %s "
            f"FROM jsonb_to_recordset(%s::jsonb) AS n({_SUMMARY_FIELDS}) ON CONFLICT DO NOTHING",
            (SUMMARY_VERSION, *seen, clock.now(), records(insert)),
        )


def _cached(
    conn, rows, money: tuple[str, fx.Rates, str] | None = None, offers: dict[str, list[dict]] | None = None, seen: tuple[str, int] | None = None,
) -> dict[str, dict[str, Any]]:
    """The offer summaries of these parts: kept ones as they are, stale or missing ones worked out and kept. A caller that has read
    the offers passes them with the snapshot it took before (``freshness.seen``)."""

    if offers is None or seen is None:
        offers, seen = None, freshness.seen(conn)
    money = money or _money(conn)
    fresh = {
        row["part_id"]: _from_row(row) for row in conn.execute(
            f"SELECT s.* FROM supply_part_summaries s WHERE s.part_id = ANY(%s) AND {_current_sql(money[2])}", ([r["id"] for r in rows], clock.now()),
        ).fetchall()
    }
    todo = [r for r in rows if r["id"] not in fresh]
    if todo:
        found = _computed(conn, todo, offers if offers is not None else offers_by_part(conn, [r["id"] for r in todo]), money)
        _keep(conn, found, seen)
        fresh.update(found)
    return fresh


_BATCH = 1000


def _bring_up_to_date(conn, where: str, params: list[Any]) -> str:
    """Work out and keep the summaries of the parts ``where`` selects that are stale or missing (the worker keeps the tracked ones
    current, so normally few), so a list can filter, sort and page on the kept columns. Returns the pricing key."""

    money = _money(conn)
    while True:
        seen = freshness.seen(conn)
        rows = conn.execute(
            _ROW_SELECT + f"LEFT JOIN supply_part_summaries s ON s.part_id = p.id WHERE {where} AND NOT COALESCE({_current_sql(money[2])}, FALSE) "
            f"LIMIT {_BATCH}", [*params, clock.now()],
        ).fetchall()
        if rows:
            _keep(conn, _computed(conn, rows, offers_by_part(conn, [r["id"] for r in rows]), money), seen)
        if len(rows) < _BATCH:
            return money[2]


def _summaries(
    conn, rows, offers: dict[str, list[dict]] | None = None, *, role: str | None = None, seen: tuple[str, int] | None = None,
) -> list[dict[str, Any]]:
    """The list-row summary of each part row: status, stock, price, lifecycle, tier, and how many projects ``role`` may see use it.

    The offer summaries are the kept ones (``part_summaries``); a stale or missing one is worked out from ``offers`` when given.
    """

    ids = [r["id"] for r in rows]
    sums = _cached(conn, rows, offers=offers, seen=seen)
    jlc = facts.jlc_classes(conn, ids)
    used = usage.projects_of_parts(conn, ids, role)

    items = []
    for row in rows:
        mine = sums[row["id"]]
        items.append({
            "id": row["id"],
            "mpn": row["mpn"],
            "manufacturer": row["manufacturer"],
            # Written by a person or a BOM and not yet confirmed by a distributor's answer.
            "manufacturer_provisional": bool(row["maker_provisional"]),
            "watch": _watch_dto(row),
            "tracking": _tracking_dto(row),
            **mine,
            "used_in": len(used.get(row["id"], ())),
            "jlc": jlc.get(row["id"]),
        })
    return items


def summaries_for(conn, part_ids: list[str]) -> list[dict[str, Any]]:
    """Summaries of the given parts, in no particular order. Reads the kept offer summaries; no offers are loaded."""

    if not part_ids:
        return []
    rows = conn.execute(_ROW_SELECT + "WHERE p.id = ANY(%s)", [list(part_ids)]).fetchall()
    return _summaries(conn, rows)


def summaries_with_offers(conn, part_ids: list[str], role: str | None = None) -> tuple[list[dict[str, Any]], dict[str, list[dict]]]:
    """Summaries of the given parts (the kept ones, as the list shows) and the counted offers behind them, for callers that price.

    A watch counts one packaging when it says so (cut tape for prototypes), and the offers returned follow it, so a
    purchase suggestion and the checks never use a packaging the watch leaves out.
    """

    if not part_ids:
        return [], {}
    seen = freshness.seen(conn)
    rows = conn.execute(_ROW_SELECT + "WHERE p.id = ANY(%s)", [list(part_ids)]).fetchall()
    offers = offers_by_part(conn, [row["id"] for row in rows])
    wanted = {
        row["id"]: [o for o in offers.get(row["id"], []) if stock.counts(o["packaging"], row["watch_packaging"] or "any")]
        for row in rows
    }
    return _summaries(conn, rows, wanted, role=role, seen=seen), wanted


def _scope_where(scope: Scope, query: str, role: str | None) -> tuple[str, list[Any]]:
    """SQL over ``_ROW_SELECT`` for the parts a scope and a search take in, and its parameters."""

    limited = "ARRAY[" + ", ".join(f"'{key}'" for key in budget.providers_limited_by_picks() if key.replace("_", "").isalnum()) + "]::text[]"
    conditions = [{
        "all": "TRUE", "watched": "pt.part_id IS NOT NULL", "in_use": "(" + _IN_USE + ")",
        "followed": "(pt.part_id IS NOT NULL OR " + _IN_USE + ")",
        "tier1": "pt.tier = 1", "tier2": "pt.tier = 2",
        "waiting": "EXISTS (SELECT 1 FROM supply_admissions ad WHERE ad.part_id = p.id AND ad.state = 'waiting')",
        "pick": "pt.part_id IS NOT NULL AND EXISTS (SELECT 1 FROM supply_listings pl JOIN supply_connectors pc ON pc.id = pl.connector_id "
                "WHERE pl.part_id = p.id AND supply_counted(pl.match_state) AND pc.provider = ANY(" + limited + ") "
                "AND NOT EXISTS (SELECT 1 FROM supply_packaging_picks pk WHERE pk.part_id = pl.part_id AND pk.connector_id = pl.connector_id) "
                "GROUP BY pl.connector_id HAVING COUNT(*) > 1)",
    }[scope]]
    params: list[Any] = usage.role_params(role) if scope in ("in_use", "followed") else []
    text = query.strip()
    if text:
        conditions.append("(p.mpn ILIKE %s OR m.name ILIKE %s)")
        params += [_like(text), _like(text)]
    return " AND ".join(conditions), params


_KEPT = "JOIN supply_part_summaries s ON s.part_id = p.id "


def ranked_parts(conn, *, scope: Scope = "watched", query: str = "", role: str | None = None) -> tuple[list[dict[str, Any]], int]:
    """Every matching part, the ones that need a look first, then by name, with what counts and groups need: id, mpn, manufacturer,
    status, stock, lifecycle, whether every distributor dropped it, and when it was read. From the kept summaries."""

    where, params = _scope_where(scope, query, role)
    _bring_up_to_date(conn, where, params)
    rows = conn.execute(
        "SELECT p.id, p.mpn, m.name AS manufacturer, s.status, s.stock, s.lifecycle, s.dropped, s.as_of "
        "FROM supply_parts p JOIN supply_manufacturers m ON m.id = p.manufacturer_id LEFT JOIN supply_watches w ON w.part_id = p.id "
        f"LEFT JOIN supply_part_tiers pt ON pt.part_id = p.id {_KEPT}WHERE {where} ORDER BY {_RANK_SQL}, lower(m.name), lower(p.mpn)", params,
    ).fetchall()
    items = [{**{key: row[key] for key in ("id", "mpn", "manufacturer", "status", "stock", "lifecycle", "dropped")},
              "fetched_at": row["as_of"].isoformat() if row["as_of"] else None} for row in rows]
    return items, len(items)


def tracked_states(conn) -> list[dict[str, Any]]:
    """Every tracked part, uncapped, with what the Dashboard counts: id, status, stock, lifecycle and whether every distributor dropped
    it. Reads the kept summaries and works out only the stale ones (the worker keeps them fresh, so normally none)."""

    rows = conn.execute(_ROW_SELECT + "WHERE pt.part_id IS NOT NULL").fetchall()
    sums = _cached(conn, rows)
    return [{"id": row["id"], **{key: sums[row["id"]][key] for key in ("status", "stock", "lifecycle", "dropped")}} for row in rows]


_EVERY = object()


def tracked_project_rows(
    conn, states: list[dict[str, Any]], kept: dict[str, dict[str, Any]], role: str | None, *, visible: Any = _EVERY,
) -> list[dict[str, Any]]:
    """The Dashboard's row for each tracked project ``role`` may see: its parts' status counts and its kept usual-build rollup.
    ``visible`` is ``usage.visible_project_ids(role)`` when the caller has it already."""

    if visible is _EVERY:
        visible = usage.visible_project_ids(role)
    tracked = [row["project_id"] for row in conn.execute("SELECT project_id FROM supply_tracked_projects").fetchall()
               if visible is None or row["project_id"] in visible]
    if not tracked:
        return []
    of = _projects_of(conn, [state["id"] for state in states], role)
    names = {row["project_id"]: row["project_name"] for row in conn.execute(
        "SELECT project_id, project_name FROM supply_bom_usage_projects WHERE project_id = ANY(%s)", (tracked,)).fetchall()}
    members: dict[str, list[dict[str, Any]]] = {project_id: [] for project_id in tracked if project_id in names}
    for state in states:
        for project_id in of.get(state["id"], ()):
            if project_id in members:
                members[project_id].append(state)
    groups = [{"project_id": project_id, "tracked": True, "members": mine} for project_id, mine in members.items()]
    known = _row_facts(conn, groups)
    rows = []
    for group in groups:
        statuses: dict[str, int] = {}
        for state in group["members"]:
            statuses[state["status"]] = statuses.get(state["status"], 0) + 1
        rows.append({"project_id": group["project_id"], "project_name": names[group["project_id"]], "count": len(group["members"]),
                     "statuses": statuses, "stats": _group_stats(group, kept, known)})
    # As the Projects view orders them: what needs a look first, then by name.
    rows.sort(key=lambda row: (min((_STATUS_RANK[status] for status in row["statuses"]), default=len(_STATUS_RANK)), row["project_name"].lower()))
    return rows


NO_PROJECT = "none"


def _projects_of(conn, part_ids: list[str], role: str | None) -> dict[str, set[str]]:
    """The projects (that ``role`` may see) whose BOM carries each part."""

    return usage.projects_of_parts(conn, part_ids, role)


def part_groups(
    conn, *, scope: Scope = "watched", query: str = "", role: str | None = None, only: Filter | str = "", vendor: str = "",
) -> dict[str, Any]:
    """The parts that match, grouped by the projects that use them: tracked projects first, then by what needs a look.

    A part in two projects is in both. Parts no visible project uses are the group ``none``.
    """

    items, _total = ranked_parts(conn, scope=scope, query=query, role=role)
    if only:
        items = _only(conn, items, only)
    items = _at_vendor(conn, items, vendor)
    of = _projects_of(conn, [item["id"] for item in items], role)
    groups: dict[str, dict[str, Any]] = {}
    for item in items:
        for project_id in of.get(item["id"]) or {NO_PROJECT}:
            group = groups.setdefault(project_id, {"project_id": project_id, "count": 0, "statuses": {}})
            group["count"] += 1
            group["statuses"][item["status"]] = group["statuses"].get(item["status"], 0) + 1
    named = {}
    tracked: set[str] = set()
    for key, group in groups.items():
        group["members"] = [item for item in items if key in (of.get(item["id"]) or {NO_PROJECT})]
    real = [key for key in groups if key != NO_PROJECT]
    if real:
        named = {row["project_id"]: row["project_name"] for row in conn.execute(
            "SELECT project_id, project_name FROM supply_bom_usage_projects WHERE project_id = ANY(%s)", (real,)).fetchall()}
        tracked = {row["project_id"] for row in conn.execute(
            "SELECT project_id FROM supply_tracked_projects WHERE project_id = ANY(%s)", (real,)).fetchall()}
    for key, group in groups.items():
        group["project_name"] = "Not in a project" if key == NO_PROJECT else (named.get(key) or key)
        group["tracked"] = key in tracked
        group["worst"] = min((_STATUS_RANK[status] for status in group["statuses"]), default=len(_STATUS_RANK))
    ordered = sorted(
        groups.values(),
        key=lambda group: (group["project_id"] == NO_PROJECT, not group["tracked"], group["worst"], group["project_name"].lower()),
    )
    kept = part_insights.of_parts(conn, [item["id"] for item in items])
    known = _row_facts(conn, ordered)
    for group in ordered:
        del group["worst"]
        group["stats"] = _group_stats(group, kept, known)
        del group["members"]
    return {"groups": ordered, "total": len(items)}


SOON_DAYS = 14


def status_counts(members: list[dict[str, Any]], facts: list[dict[str, Any]]) -> dict[str, int]:
    """The counts a project row shows of its parts, in the Projects view and the Dashboard's table of tracked projects: parts at risk
    (error or fatal), out of stock, ending, held by one distributor, and running out within two weeks. ``members`` carry
    ``status``, ``stock`` and ``lifecycle``; ``facts`` are the kept insights of the same parts, in the same order."""

    return {
        "at_risk": sum(1 for item in members if item["status"] in _AT_RISK),
        "out": sum(1 for item in members if item["stock"] == 0),
        "end_of_life": sum(1 for item in members if item["lifecycle"] not in ("active", "unknown")),
        "one_distributor": sum(1 for data in facts if data.get("holders") == 1),
        "runs_out_soon": sum(1 for data in facts if data.get("days_to_zero") is not None and data["days_to_zero"] <= SOON_DAYS),
    }


def _row_facts(conn, groups: list[dict[str, Any]]) -> dict[str, Any]:
    """What the project rows need beyond their parts, read once for all of them: BOM ages, tracked projects, their kept rollups and cost
    series, and open alerts per part."""

    from app.services.supply import cost_history, project_supply, tracking  # they read this module, so they are imported here

    real = [group["project_id"] for group in groups if group["project_id"] != NO_PROJECT]
    read_at = {row["project_id"]: row["updated_at"] for row in conn.execute(
        "SELECT project_id, updated_at FROM supply_bom_usage_projects WHERE project_id = ANY(%s)", (real,)).fetchall()} if real else {}
    tracked = tracking.tracked_projects(conn, [group["project_id"] for group in groups if group["project_id"] != NO_PROJECT and group["tracked"]])
    variants = {project_id: (project["variants"] or [""])[0] for project_id, project in tracked.items()}
    rollups = project_supply.usual_rollups(conn, [(project, variants[project_id]) for project_id, project in tracked.items()])
    costed = [(project_id, variants[project_id]) for project_id, rollup in rollups.items()
              if rollup and rollup["cost_per_board"] is not None and rollup["currency"]]
    members = list({item["id"] for group in groups for item in group["members"]})
    alerts = attention.open_counts(conn, clock.now(), attention.PART, members)
    return {"read_at": read_at, "tracked": tracked, "variants": variants, "rollups": rollups,
            "series": cost_history.series_of(conn, costed, 120), "alerts": alerts}


def _group_stats(group: dict[str, Any], kept: dict[str, dict[str, Any]], known: dict[str, Any]) -> dict[str, Any]:
    """What a project row shows closed: the counts that need a look, and for a tracked project its cost, boards, BOM age and alerts.
    ``known`` is ``_row_facts`` of the rows shown."""

    from app.services.supply import cost_history  # it reads this module, so it is imported here

    members = group["members"]
    facts = [kept.get(item["id"]) or {} for item in members]
    stats: dict[str, Any] = status_counts(members, facts)
    project_id = group["project_id"]
    if project_id == NO_PROJECT:
        return stats
    read = known["read_at"].get(project_id)
    stats["bom_read_at"] = read.isoformat() if read else None
    if not group["tracked"]:
        return stats
    tracked = known["tracked"].get(project_id)
    stats["variants"] = list(tracked["variants"]) if tracked else []
    stats["all_variants"] = bool(tracked and tracked["all_variants"])
    stats["packaging"] = tracked["packaging"] if tracked else None
    # The same rollup the project page shows: the day's stored row only gives the change over time.
    rollup = known["rollups"].get(project_id) if tracked else None
    if rollup and rollup["cost_per_board"] is not None and rollup["currency"]:
        stats["cost_per_board"] = format(Decimal(str(rollup["cost_per_board"])), "f")
        stats["currency"] = rollup["currency"]
        stats["boards"] = rollup["can_build"]
        stats["build_quantity"] = int(tracked["build_quantity"])
        stats["unchecked"] = int(rollup["not_tracked"])
        # A cost over fewer lines than the BOM has is a subtotal: every summary says how many lines it covers.
        stats["lines"] = int(rollup["lines"])
        stats["lines_priced"] = int(rollup["lines_priced"])
        stats["test_data"] = bool(rollup.get("test_data"))
        series, _left_out = known["series"].get((project_id, known["variants"][project_id]), ([], []))
        stats["cost_change_percent"] = cost_history.change_percent(series) if series else None
    stats["alerts"] = sum(known["alerts"].get(item["id"], 0) for item in members)
    return stats


def _at_vendor(conn, items: list[dict[str, Any]], vendor: str) -> list[dict[str, Any]]:
    """The parts a distributor lists (a counted listing at that connector)."""

    if not vendor or not items:
        return items
    listed = {row["part_id"] for row in conn.execute(
        "SELECT DISTINCT part_id FROM supply_listings WHERE connector_id = %s AND match_state = ANY(%s) AND part_id = ANY(%s)",
        (vendor, list(counted.STATES), [item["id"] for item in items]),
    ).fetchall()}
    return [item for item in items if item["id"] in listed]


def _only(conn, items: list[dict[str, Any]], only: str) -> list[dict[str, Any]]:
    """The parts a group applies to: a status or stock group from the rows themselves, a finding from the kept insights."""

    if only in FILTERS:
        return [item for item in items if FILTERS[only](item)]
    from app.services.supply import risk_views  # risk_views reads this module, so it is imported here

    if only in risk_views.GROUPS:
        keep = risk_views.group_members(conn, only, [item["id"] for item in items])
    elif ":" in only:
        keep = risk_views.valued_members(conn, only, items)
        if keep is None:
            raise ValueError("That filter is not one Prism knows.")
    elif only in part_insights.KINDS:
        keep = part_insights.matching(conn, only)
    else:
        raise ValueError("That filter is not one Prism knows.")
    return [item for item in items if item["id"] in keep]


# Columns the list sorts by, as "<column>:<asc|desc>". A part with no figure comes after the others either way.
SORT_COLUMNS = {"part": "lower(p.mpn)", "stock": "s.stock", "price": "s.unit_price"}
# The chance of being out in 4 weeks, a part already out counting as certain (kept insights, ``i``).
_OUT_CHANCE_SQL = (
    "CASE WHEN COALESCE((i.data->'forecast'->>'out_now')::boolean, FALSE) THEN 1.0 "
    "WHEN COALESCE((i.data->'forecast'->>'available')::boolean, FALSE) THEN COALESCE((i.data->'forecast'->>'p_out_4w')::float, 0.0) ELSE 0.0 END"
)


def _order_sql(sort: str) -> str:
    """The list's order: what needs a look first, then by name; ``sort`` puts its key before that."""

    usual = f"{_RANK_SQL}, lower(m.name), lower(p.mpn)"
    if sort == "runout":
        return f"{_OUT_CHANCE_SQL} DESC, (i.data->>'days_to_zero')::float ASC NULLS LAST, {usual}"
    column, _, direction = sort.partition(":")
    if column in SORT_COLUMNS and direction in ("asc", "desc"):
        return f"{SORT_COLUMNS[column]} {direction.upper()} NULLS LAST, {usual}"
    return usual


def list_parts(
    conn, *, scope: Scope = "watched", query: str = "", limit: int = 100, role: str | None = None, only: Filter | str = "", offset: int = 0,
    project_id: str = "", vendor: str = "", sort: str = "", part_ids: Sequence[str] | None = None, order_ids: Sequence[str] | None = None,
) -> dict[str, Any]:
    """Parts that need a look first (worst status), then by name. ``only`` keeps one group of them; ``project_id`` the parts of
    one project (``none`` for those in no project). ``sort`` "runout" puts the parts likeliest to be out within 4 weeks first, then
    by days to zero; "part", "stock" or "price" with ":asc" or ":desc" sorts by that column. ``part_ids`` keeps only those parts;
    ``order_ids`` puts the parts in that order first (a project's own columns). Filtered, ordered and paged on the kept summaries,
    however many parts match."""

    limit = max(1, min(limit, MAX_LIMIT))
    offset = max(0, offset)
    where, params = _scope_where(scope, query, role)
    _bring_up_to_date(conn, where, params)
    conditions = [where]
    if only in _GROUPS:
        conditions.append(_GROUPS[only][0])
    elif only:
        # A finding from the kept insights or a risk group: the parts it names, of those the scope takes in.
        items, _total = ranked_parts(conn, scope=scope, query=query, role=role)
        conditions.append("p.id = ANY(%s)")
        params = [*params, [item["id"] for item in _only(conn, items, only)]]
    if vendor:
        conditions.append("EXISTS (SELECT 1 FROM supply_listings vl WHERE vl.part_id = p.id AND vl.connector_id = %s AND supply_counted(vl.match_state))")
        params = [*params, vendor]
    if project_id:
        used = "p.id IN (SELECT pp.part_id FROM (" + usage.part_projects_sql(False) + ") pp" + (" WHERE pp.project_id = %s)" if project_id != NO_PROJECT else ")")
        conditions.append(used if project_id != NO_PROJECT else f"NOT {used}")
        params = [*params, *usage.role_params(role), *([project_id] if project_id != NO_PROJECT else [])]
    if part_ids is not None:
        conditions.append("p.id = ANY(%s)")
        params = [*params, list(part_ids)]
    where = " AND ".join(conditions)
    order = _order_sql(sort)
    order_params: list[Any] = []
    if order_ids is not None:
        order = f"array_position(%s::text[], p.id) NULLS LAST, {order}"
        order_params = [list(order_ids)]
    joins = _KEPT + ("LEFT JOIN supply_part_insights i ON i.part_id = p.id " if sort == "runout" else "")
    total = int(conn.execute(
        "SELECT COUNT(*) AS n FROM supply_parts p JOIN supply_manufacturers m ON m.id = p.manufacturer_id LEFT JOIN supply_watches w ON w.part_id = p.id "
        f"LEFT JOIN supply_part_tiers pt ON pt.part_id = p.id {_KEPT}WHERE {where}", params,
    ).fetchone()["n"])
    rows = conn.execute(_ROW_SELECT + f"{joins}WHERE {where} ORDER BY {order} LIMIT %s OFFSET %s", [*params, *order_params, limit, offset]).fetchall()
    page = _summaries(conn, rows, role=role)
    kept = part_insights.of_parts(conn, [item["id"] for item in page])
    extras = _row_extras(conn, page, kept, role)
    page = [
        item | ({"spark": kept[item["id"]]["spark"], "runs_out_days": kept[item["id"]]["days_to_zero"]} if item["id"] in kept else {}) | extras[item["id"]]
        for item in page
    ]
    more = offset + limit < total
    states = store.model_states(conn)
    return {
        "items": page, "total": total, "limit": limit, "offset": offset, "next_offset": offset + limit if more else None,
        "forecast_state": {name: states[name]["state"] for name in ("runout", "out_4w", "can_buy_4w", "can_buy_8w")},
    }


def _row_extras(conn, page: list[dict[str, Any]], kept: dict[str, dict[str, Any]], role: str | None) -> dict[str, dict[str, Any]]:
    """What a row shows beyond the summary: the first projects, the distributors that list the part, the price move, the lead time, flags."""

    ids = [item["id"] for item in page]
    projects = _projects_of(conn, ids, role)
    names = {}
    wanted = {project for found in projects.values() for project in found}
    if wanted:
        names = {row["project_id"]: row["project_name"] for row in conn.execute(
            "SELECT project_id, project_name FROM supply_bom_usage_projects WHERE project_id = ANY(%s)", (list(wanted),)).fetchall()}
    offers = offers_by_part(conn, ids)
    shown = offers_by_part(conn, ids, every_listing=True)
    quantities = price_quantity.of_parts(conn, ids)
    base = supply_settings.base_currency(conn)
    rates = fx.latest(conn)
    waiting = {row["part_id"] for row in conn.execute("SELECT DISTINCT part_id FROM supply_admissions WHERE state = 'waiting' AND part_id = ANY(%s)", (ids,)).fetchall()}
    preferred = preferences.of_parts(conn, ids)
    stated: dict[str, dict[str, set[str]]] = {}
    for row in conn.execute(
        "SELECT part_id, name, value FROM supply_part_facts WHERE name IN ('ncnr', 'normally_stocking') AND part_id = ANY(%s)", (ids,)
    ).fetchall():
        stated.setdefault(row["part_id"], {}).setdefault(row["name"], set()).add(row["value"].strip().lower())
    rohs_said = facts.rohs_stated(conn, ids)
    extras = {}
    for item in page:
        here = [offer for offer in offers.get(item["id"], []) if not offer["marketplace"]]
        by_connector: dict[str, dict[str, Any]] = {}
        held: dict[str, list[dict]] = defaultdict(list)
        for offer in here:
            entry = by_connector.setdefault(offer["connector_id"], {"connector_id": offer["connector_id"], "provider": offer["provider"], "name": offer["connector_name"], "stock": 0, "price": None, "currency": ""})
            held[offer["connector_id"]].append(offer)
            price, currency, _quantity = pricing.native_price(offer, quantities[item["id"]])
            if price is not None and (entry["price"] is None or Decimal(price) < Decimal(entry["price"])):
                entry["price"], entry["currency"] = price, currency
        for connector_id, entry in by_connector.items():
            # By pile, as the part's stock counts it: cut tape and custom reel are one shelf.
            entry["stock"] = stock.connector_stock(entry["provider"], held[connector_id])
        flags = []
        if item["id"] in waiting:
            flags.append("waiting")
        if offer_rules.rohs_verdict(offers.get(item["id"], []), rohs_said.get(item["id"], ())) in ("not_compliant", "disputed"):
            flags.append("rohs")
        if any(offer["reach_affected"] for offer in here):
            flags.append("reach")
        if "yes" in stated.get(item["id"], {}).get("ncnr", set()):
            flags.append("ncnr")
        if "no" in stated.get(item["id"], {}).get("normally_stocking", set()):
            flags.append("not_stocked")
        facts_here = kept.get(item["id"]) or {}
        projects_here = sorted(names.get(project) or project for project in projects.get(item["id"], set()))
        extras[item["id"]] = {
            "project_names": projects_here[:2],
            "distributors": sorted(by_connector.values(), key=lambda entry: entry["name"].lower()),
            "offers": in_base(offer_lines([offer for offer in shown.get(item["id"], []) if not offer["marketplace"]]), base, rates),
            "preferred_connector_id": preferred.get(item["id"]),
            "price_change_percent": facts_here.get("price_change_percent"),
            "forecast": (facts_here.get("forecast") or None) if (facts_here.get("forecast") or {}).get("available") else None,
            "lead_days": facts_here.get("lead_days"),
            "flags": flags,
        }
    return extras


def _day_rows(conn, part_id: str, since: datetime) -> list[dict]:
    """Each counted listing's last known stock per day (``days_sql``)."""

    states = list(counted.STATES) + ["gone"]
    days = days_sql("SELECT id FROM supply_listings WHERE part_id = %(part)s AND match_state = ANY(%(states)s)", "%(since)s")
    rows = conn.execute(
        f"""
        SELECT d.listing_id, l.connector_id, l.sku, c.provider, {stock.pool_sql()} AS pool, l.match_state, l.packaging, d.day, d.stock, d.marketplace
        FROM {days} d
        JOIN supply_listings l ON l.id = d.listing_id
        JOIN supply_connectors c ON c.id = l.connector_id
        WHERE {counted.read_sql()}
        """,
        {"part": part_id, "states": states, "since": since.date()},
    ).fetchall()
    return [dict(row) for row in rows]


def history(conn, part_id: str, now: datetime) -> list[dict[str, Any]]:
    """Total counted stock per day, carrying each listing's last known figure forward.

    Marketplace stock is left out, as in the current total. A listing that has
    disappeared stops counting after its last reading. ``listings`` says how
    many listings stood behind each day, so a jump from a new listing reads as a
    change in coverage and not as a restock.
    """

    rows = _day_rows(conn, part_id, now - timedelta(days=HISTORY_DAYS))
    if not rows:
        return []
    policy = stock.packaging_of(conn, part_id)
    by_day: dict[date, list] = defaultdict(list)
    last_day: dict[str, date] = {}
    gone: set[str] = set()
    for row in rows:
        by_day[row["day"]].append(row)
        last_day[row["listing_id"]] = max(row["day"], last_day.get(row["listing_id"], row["day"]))
        if row["match_state"] == "gone":
            gone.add(row["listing_id"])
    last: dict[str, dict] = {}
    series = []
    day, end = min(by_day), max(by_day)
    while day <= end:
        for row in by_day.get(day, []):
            last[row["listing_id"]] = {
                "connector_id": row["connector_id"], "provider": row["provider"], "stock": row["stock"], "pool": row["pool"], "sku": row["sku"],
                "marketplace": bool(row["marketplace"]), "fetched_at": day, "packaging": row["packaging"],
            }
        for listing_id in gone:
            if last_day[listing_id] < day:
                last.pop(listing_id, None)
        combined = stock.aggregate(last.values(), policy)
        # Holders and concentration count stock pools: connectors on one account hold one shelf.
        holding = [amount for amount in combined.by_pool.values() if amount > 0]
        series.append({
            "day": day.isoformat(), "stock": combined.total, "listings": combined.listings, "sources": combined.holders,
            "concentration": sum((amount / combined.total) ** 2 for amount in holding) if combined.total > 0 else None,
        })
        day += timedelta(days=1)
    return series


LEAD_TREND_DAYS = 90
LEAD_TREND_WINDOW_DAYS = 14
LEAD_TREND_MIN_CHANGE_DAYS = 7


def lead_time_trend(conn, part_id: str, now: datetime) -> dict[str, Any] | None:
    """How the quoted lead time moved over the last 90 days: the median of the first two weeks of daily readings against the last two.
    None without lead times in both windows, or when the change is under a week."""

    rows = conn.execute(
        f"""
        SELECT d.day, d.lead_time_days FROM {days_sql("SELECT id FROM supply_listings WHERE part_id = %(part)s", "%(since)s")} d
        WHERE d.lead_time_days IS NOT NULL ORDER BY d.day
        """,
        {"part": part_id, "since": (now - timedelta(days=LEAD_TREND_DAYS)).date()},
    ).fetchall()
    if len(rows) < 2:
        return None
    window = timedelta(days=LEAD_TREND_WINDOW_DAYS)
    first_day, last_day = rows[0]["day"], rows[-1]["day"]
    if last_day - first_day < window * 2:
        return None
    first = [row["lead_time_days"] for row in rows if row["day"] <= first_day + window]
    last = [row["lead_time_days"] for row in rows if row["day"] >= last_day - window]
    before, after = statistics.median(first), statistics.median(last)
    if abs(after - before) < LEAD_TREND_MIN_CHANGE_DAYS:
        return None
    return {"before": round(before), "after": round(after), "since": first_day.isoformat()}


def _first_seen(conn, part_id: str) -> str | None:
    """The day Prism first knew the part: a rough age, since parts are created when first searched for."""

    row = conn.execute("SELECT created_at FROM supply_parts WHERE id = %s", (part_id,)).fetchone()
    return row["created_at"].date().isoformat() if row else None


def _with_lead_gap(insight: dict[str, Any], listings: list[dict[str, Any]], trend: dict[str, Any] | None = None) -> dict[str, Any]:
    """Add how far ahead of the soonest restock stock is expected to run out: the shortest lead time any counted listing quotes."""

    leads = [item["offer"]["lead_time_days"] for item in listings if item["counted"] and item["offer"] and item["offer"].get("lead_time_days")]
    return insight | {"lead_gap_days": insights.lead_gap_days(insight, min(leads) if leads else None), "lead_time_trend": trend}


def insight_from(days: list[dict[str, Any]], threshold: int | None, now: datetime) -> dict[str, Any]:
    """What the daily history says (see ``insights``)."""

    points = [
        insights.Point(date.fromisoformat(day["day"]), day["stock"], day["listings"], day.get("sources"), day.get("concentration"))
        for day in days
    ]
    return insights.analyse(points, threshold=threshold, today=now.astimezone(timezone.utc).date())


def _parameters(rows: list[dict[str, Any]], part_facts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Shape one part's parameter rows and facts into the list the part sheet shows."""

    sources: dict[tuple[str, str], list[str]] = {}
    for row in rows:
        sources.setdefault((row["name"].lower(), row["raw"]), []).append(row["provider"])
    first_seen = list(dict.fromkeys((row["name"], row["raw"]) for row in rows))
    listed = [
        {
            "name": item.name, "raw": item.raw, "key": item.key, "unit": item.unit,
            "value": format(item.value.normalize(), "f") if item.value is not None else None,
            "sources": sources.get((item.name.lower(), item.raw), []),
        }
        for item in params.normalise(first_seen)
    ]
    # What a distributor files the part under is not a compliance fact; it is listed here, as the distributor wrote it.
    for fact in part_facts:
        if fact["name"] in facts.NOT_COMPLIANCE:
            for value in dict.fromkeys(source["value"] for source in fact["sources"]):
                listed.append({
                    "name": fact["label"], "raw": value, "key": None, "unit": None, "value": None,
                    "sources": [source["provider"] for source in fact["sources"] if source["value"] == value],
                })
    return listed


def parameters_of(conn, part_id: str) -> list[dict[str, Any]]:
    """The attributes distributors list for the part: known ones in one vocabulary first, the rest as written."""

    rows = conn.execute(
        "SELECT provider, name, raw FROM supply_part_params WHERE part_id = %s ORDER BY provider, name", (part_id,)
    ).fetchall()
    return _parameters(rows, facts.for_part(conn, part_id))


def parameters_of_parts(conn, part_ids: list[str], *, with_facts: bool = True) -> dict[str, list[dict[str, Any]]]:
    """The attributes of several parts, each exactly as ``parameters_of`` gives it, from one parameter read. ``with_facts`` False leaves
    out what distributors file the parts under (rows with no ``key``), and with them a facts read per part."""

    ids = list(dict.fromkeys(part_ids))
    if not ids:
        return {}
    by_part: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in conn.execute(
        "SELECT part_id, provider, name, raw FROM supply_part_params WHERE part_id = ANY(%s) ORDER BY part_id, provider, name", (ids,)
    ).fetchall():
        by_part[row["part_id"]].append(row)
    return {part_id: _parameters(by_part.get(part_id, []), facts.for_part(conn, part_id) if with_facts else []) for part_id in ids}


def _packaging_state(conn, part_id: str) -> dict[str, Any]:
    """The picks on a part (listing per distributor), and the distributors where it still waits for one."""

    pick_rows = conn.execute("SELECT connector_id, listing_id, picked_by, note FROM supply_packaging_picks WHERE part_id = %s", (part_id,)).fetchall()
    picks = {row["connector_id"]: row["listing_id"] for row in pick_rows}
    counts = conn.execute(
        "SELECT l.connector_id, c.display_name, COUNT(*) AS n FROM supply_listings l JOIN supply_connectors c ON c.id = l.connector_id "
        "WHERE l.part_id = %s AND l.match_state = ANY(%s) GROUP BY l.connector_id, c.display_name HAVING COUNT(*) > 1",
        (part_id, list(counted.STATES)),
    ).fetchall()
    tracked = conn.execute("SELECT 1 FROM supply_part_tiers WHERE part_id = %s", (part_id,)).fetchone() is not None
    return {
        "picks": picks,
        # Who picked each (a person, or "auto" for Prism) and what Prism noted when it fell back.
        "picked_by": {row["connector_id"]: {"by": row["picked_by"], "note": row["note"]} for row in pick_rows},
        "needs_pick": [
            {"connector_id": r["connector_id"], "connector": r["display_name"], "listings": int(r["n"])}
            for r in counts if tracked and r["connector_id"] not in picks
        ],
    }


def _price_block(conn, part_id: str, now: datetime, kept: Mapping[str, Any]) -> dict[str, Any]:
    """The part sheet's price: the daily series and move, the quantity it is priced at, and the list price with its range (the
    kept summary's, as the list shows it)."""

    series, _meta = prices.daily(conn, part_id, now, prices.CHART_DAYS)
    block = prices.view(series, now.date())
    chosen = price_quantity.of_part(conn, part_id)
    base = supply_settings.base_currency(conn)
    return block | {"currency": base, **chosen, "headline": {key: kept[key] for key in _PRICE_KEYS}}


# Distributors whose product page is known from the number alone, for a listing not read yet.
_PAGE_URLS = {"lcsc": "https://www.lcsc.com/product-detail/{}.html", "tme": "https://www.tme.eu/en/details/{}/"}


def _page_url(provider: str, sku: str, read_url: str | None) -> str:
    """The distributor's page for a listing: the one its last reading gave, else one built from the number."""

    if read_url:
        return str(read_url)
    pattern = _PAGE_URLS.get(provider)
    return pattern.format(sku.lower() if provider == "tme" else sku) if pattern and sku and "/" not in sku else ""


def part_detail(conn, part_id: str, *, now: datetime | None = None, role: str | None = None) -> dict[str, Any]:
    now = now or clock.now()
    part = parts.get_part(conn, part_id)
    watch_row = conn.execute(
        "SELECT w.id AS watch_id, w.threshold, w.pinned, w.owner, w.packaging AS watch_packaging, "
        "pt.tier AS tracking_tier, pt.rate AS tracking_rate, pt.reasons AS tracking_reasons "
        "FROM supply_parts p LEFT JOIN supply_watches w ON w.part_id = p.id LEFT JOIN supply_part_tiers pt ON pt.part_id = p.id WHERE p.id = %s",
        (part_id,),
    ).fetchone()

    rows = conn.execute(
        """
        SELECT l.id, l.connector_id, c.display_name AS connector_name, c.provider, {pool} AS pool, l.sku, COALESCE(NULLIF(o.packaging, 'unknown'), l.packaging) AS packaging,
               o.reel_size, o.packaging_inferred, l.match_state,
               l.match_reason, l.raw_mpn, l.raw_manufacturer, o.fetched_at, o.stock, o.incoming, o.moq, o.order_multiple, o.price_breaks, o.currency,
               o.lead_time_days, o.lifecycle, o.discontinued, o.rohs, o.reach_affected, o.marketplace, o.product_url,
               ps.tier, ps.next_poll_at, ps.last_polled_at, ps.error_streak, ps.last_error_code, {counts} AS counts
        FROM supply_listings l
        JOIN supply_connectors c ON c.id = l.connector_id
        LEFT JOIN supply_offers o ON o.listing_id = l.id
        LEFT JOIN supply_poll_state ps ON ps.listing_id = l.id
        WHERE l.part_id = %s AND l.match_state <> 'rejected'
        ORDER BY c.display_name, l.sku
        """.replace("{pool}", stock.pool_sql()).replace("{counts}", counted.listing_sql()),
        (part_id,),
    ).fetchall()

    policy = watch_row["watch_packaging"] or "any"
    # Status, stock, lifecycle, problem and price are the kept summary's, so the sheet and the list agree; the stock by distributor
    # is worked out from the same listings (``counted.listing_sql`` and the watch's packaging).
    kept = _cached(conn, conn.execute(_ROW_SELECT + "WHERE p.id = %s", [part_id]).fetchall())[part_id]
    counting = [dict(r) for r in rows if r["counts"] and r["fetched_at"] is not None and stock.counts(r["packaging"], policy)]
    combined = stock.aggregate(counting, policy) if counting else None
    lifecycle = Lifecycle(kept["lifecycle"])
    names = {r["connector_id"]: r["connector_name"] for r in rows}
    providers = {r["connector_id"]: r["provider"] for r in rows}
    problem = kept["problem"]

    def iso(value: datetime | None) -> str | None:
        return value.isoformat() if value else None

    listings = []
    for r in rows:
        has_offer = r["fetched_at"] is not None
        listings.append({
            "id": r["id"],
            "connector_id": r["connector_id"],
            "connector_name": r["connector_name"],
            "provider": r["provider"],
            "test_data": registry.is_simulated(r["provider"]),
            "sku": r["sku"],
            "packaging": r["packaging"],
            "reel_size": r["reel_size"],
            "packaging_inferred": bool(r["packaging_inferred"]),
            "match_state": r["match_state"],
            "raw_mpn": r["raw_mpn"] or "",
            "raw_manufacturer": r["raw_manufacturer"] or "",
            "match_reason": r["match_reason"] or "",
            "page_url": _page_url(r["provider"], r["sku"], r["product_url"]),
            "counted": r["match_state"] in counted.STATES,
            "offer": {
                "fetched_at": iso(r["fetched_at"]),
                "stock": r["stock"],
                "incoming": r["incoming"],
                "moq": r["moq"],
                "order_multiple": r["order_multiple"],
                "price_breaks": r["price_breaks"],
                "currency": r["currency"],
                "lead_time_days": r["lead_time_days"],
                "lifecycle": r["lifecycle"],
                "discontinued": bool(r["discontinued"]),
                "rohs": r["rohs"],
                "reach_affected": r["reach_affected"],
                "marketplace": bool(r["marketplace"]),
                "product_url": r["product_url"],
            } if has_offer else None,
            "poll": {
                "tier": r["tier"],
                "next_poll_at": iso(r["next_poll_at"]),
                "last_polled_at": iso(r["last_polled_at"]),
                "error_streak": r["error_streak"],
                "last_error_code": r["last_error_code"],
            } if r["tier"] else None,
        })

    days = history(conn, part_id, now)
    price_view = _price_block(conn, part_id, now, kept)
    ahead = outlook.outlook(
        lifecycle,
        [item["offer"] for item in listings if item["counted"] and item["offer"]],
        zero_stock_days=outlook.trailing_zero_days(days),
        price_change_percent=(price_view["trend"] or {}).get("change_percent"),
        notices=pcn.for_part(conn, part_id),
        last_buy_dates=[
            (source["source"], source["value"])
            for item in facts.for_part(conn, part_id) if item["name"] == "last_buy_date" for source in item["sources"]
        ],
    )
    insight = insights.apply_horizon(insight_from(days, watch_row["threshold"], now), ending=ahead["band"] in part_insights.ENDING_BANDS)
    return {
        "part": {"id": part.id, "mpn": part.mpn, "manufacturer": part.manufacturer_name, "first_seen": _first_seen(conn, part_id)},
        "watch": _watch_dto(watch_row),
        "tracking": _tracking_dto(watch_row),
        "packaging": _packaging_state(conn, part_id),
        "preferred_connector_id": preferences.get(conn, part_id),
        "trade": trade_marks.state(conn, part_id),
        "status": kept["status"],
        "problem": problem,
        "problem_text": PROBLEM_LABEL.get(problem or "", ""),
        "stock": kept["stock"],
        "stock_by_connector": [
            {"connector_id": cid, "connector_name": names.get(cid, ""), "provider": providers.get(cid, ""), "stock": value}
            for cid, value in (combined.by_connector.items() if combined else [])
        ],
        "lifecycle": lifecycle.value,
        "fetched_at": kept["fetched_at"],
        "listings": listings,
        "history": days,
        # Stock and price a line per distributor over the sheet's 90 days, so the sheet needs no second request for its charts.
        "distributor_history": part_history.build(conn, part_id, now),
        "price": price_view,
        "parameters": parameters_of(conn, part_id),
        "outlook": ahead,
        "used_in": usage.used_in(conn, part_id, role),
        "jlc": facts.jlc_classes(conn, [part_id]).get(part_id),
        "market_behaviour": price_behaviour.load(conn, part_id, now) | {"arrivals": promises.reliability(conn, part_id, now.date())},
        "restock_record": scorecard.for_part(conn, part_id, now.date()),
        "insight": _with_lead_gap(insight, listings, lead_time_trend(conn, part_id, now)),
    }
