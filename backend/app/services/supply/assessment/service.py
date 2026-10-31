"""Assess parts: gather their facts, run the checks, score and apply waivers.

``assess_parts`` is what the API and the BOM lookup call. It reads what Prism already holds and
never calls a distributor.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Mapping, Sequence

from app.services.supply import clock
from app.services.supply import alert_rules, compliance, facts as stated_facts, fx, part_insights, parts_view, pcn, price_quantity, pricing
from app.services.supply import settings as supply_settings
from app.services.supply.assessment import checks, health, risk, waivers
from app.services.supply.forecast import store
from app.services.supply.vocabulary import Lifecycle


def distributor_count(conn) -> int:
    """Distributors Prism reads: distinct providers among enabled connectors. Files and the simulator are not distributors."""

    return conn.execute(
        "SELECT COUNT(DISTINCT provider) AS n FROM supply_connectors WHERE enabled AND provider NOT IN ('csv', 'fake')"
    ).fetchone()["n"]


def _quotes(offers: Sequence[Mapping[str, Any]], wanted: int, base: str, rates: fx.Rates | None) -> list[tuple[str, Decimal]]:
    """Each distributor's cheapest unit price at the part's quantity (``pricing.quote``), in the base currency. A distributor with
    no price there, or in a currency without a rate, is left out."""

    cheapest: dict[str, tuple[str, Decimal]] = {}
    for offer in offers:
        found = pricing.quote(offer, wanted, base, rates)
        if found is None:
            continue
        name = str(offer.get("connector_name") or offer["connector_id"])
        if name not in cheapest or found.price < cheapest[name][1]:
            cheapest[name] = (name, found.price)
    return list(cheapest.values())


def assess_one(
    item: Mapping[str, Any],
    offers: Sequence[Mapping[str, Any]],
    part_waivers: Sequence[Mapping[str, Any]],
    now: datetime,
    need: int | None = None,
    settings: supply_settings.Settings = supply_settings.DEFAULTS,
    distributors: int | None = None,
    extras: Sequence[checks.Finding] = (),
    svhc_listed: Sequence[str] = (),
    rates: fx.Rates | None = None,
    outlook: str = "",
    last_buy: date | None = None,
    rohs_stated: Sequence[str] = (),
    wanted: int = pricing.REFERENCE_QUANTITY,
    *,
    insight: Mapping[str, Any] | None = None,
    out_chance: float | None = None,
    rules: alert_rules.Rules = alert_rules.NONE,
    notices: Sequence[Mapping[str, Any]] = (),
) -> dict[str, Any]:
    facts = checks.Facts(
        lifecycle=Lifecycle(item["lifecycle"]), offers=offers, now=now, problem=item["problem"], need=need,
        distributors=distributors,
        svhc_listed=svhc_listed, prices=_quotes(offers, wanted, settings.pricing.base_currency, rates), outlook=outlook,
        last_buy=last_buy, rate=str((item.get("tracking") or {}).get("rate") or ""), rohs_stated=rohs_stated,
        threshold=(item.get("watch") or {}).get("threshold"),
        insight=insight, out_chance=out_chance,
        # A part's own rule wins over the workspace's (``alert_rules``).
        likely_at=(rules.likely_out_percent or settings.alerts.likely_out_percent) / 100,
        price_rise_percent=rules.price_rise_percent or settings.alerts.price_rise_percent,
        notice=pcn.alert_detail(notices, now.date()), notice_changes=pcn.next_change(notices, now.date()),
        price=(item["unit_price"], item.get("currency") or "", item.get("price_quantity")) if item.get("unit_price") else None,
        target=(rules.target_price, rules.target_currency) if rules.target_price is not None else None,
    )
    # Findings from outside the part (a component's) are waived like the part's own.
    findings = waivers.apply([*checks.evaluate(facts, settings.assessment), *extras], part_waivers)
    scores = risk.sub_scores(facts, findings)
    result = health.health(findings, scores, settings.assessment, has_data=bool(offers))
    return {
        "part_id": item["id"],
        "health": result.score,
        "status": result.status.value,
        "need": need,
        "findings": [
            {"check": f.check, "severity": f.severity.value, "text": f.text, "scope": f.scope, "waiver": dict(f.waiver) if f.waiver else None,
             "detail": dict(f.detail)}
            for f in findings
        ],
        "sub_scores": [{"name": s.name, "score": s.score, "reasons": list(s.reasons)} for s in scores],
        # When the clock alone changes the answer, so a kept one knows until when it holds.
        "changes_at": (lambda moment: moment.isoformat() if moment else None)(checks.changes_at(facts, settings.assessment)),
    }


def last_buy_dates(conn, part_ids: Sequence[str]) -> dict[str, date]:
    """The earliest last date to buy of each part: one a distributor states, or an open notice gives. Read for all parts at once."""

    found: dict[str, date] = {}

    def note(part_id: str, value: Any) -> None:
        try:
            day = value if isinstance(value, date) else date.fromisoformat(str(value)[:10])
        except ValueError:
            return
        if part_id not in found or day < found[part_id]:
            found[part_id] = day

    for row in conn.execute("SELECT part_id, value FROM supply_part_facts WHERE name = 'last_buy_date' AND part_id = ANY(%s)", (list(part_ids),)).fetchall():
        note(row["part_id"], row["value"])
    for row in conn.execute(
        "SELECT pp.part_id, n.last_time_buy FROM supply_pcn_parts pp JOIN supply_pcns n ON n.id = pp.pcn_id "
        "WHERE n.state = 'open' AND n.last_time_buy IS NOT NULL AND pp.part_id = ANY(%s)", (list(part_ids),),
    ).fetchall():
        note(row["part_id"], row["last_time_buy"])
    return found


def assess_summaries(
    conn,
    items: Sequence[Mapping[str, Any]],
    offers: Mapping[str, Sequence[Mapping[str, Any]]],
    needs: Mapping[str, int | None],
    now: datetime,
    settings: supply_settings.Settings | None = None,
    extras: Mapping[str, Sequence[checks.Finding]] | None = None,
) -> dict[str, dict[str, Any]]:
    """Assess parts whose summaries and offers a caller already loaded, by the workspace's settings.

    ``extras`` are findings from outside the part (a component's, say); a waiver on the part covers them like its own.
    """

    settings = settings or supply_settings.load(conn)
    held = waivers.for_parts(conn, [item["id"] for item in items])
    distributors = distributor_count(conn)
    listed = compliance.listed_substances(conn, [item["id"] for item in items])
    rates = fx.latest(conn)
    ids = [item["id"] for item in items]
    # What the history says (the outlook band, the drain, the price trend, the forecast) is kept by housekeeping with the part's
    # other insights, so a read here costs one query.
    kept = part_insights.of_parts(conn, ids)
    shown = store.shown(store.model_states(conn), "out_4w")
    rules = alert_rules.for_parts(conn, ids)
    notices = pcn.for_parts(conn, ids)
    last_buys = last_buy_dates(conn, [item["id"] for item in items])
    rohs_said = stated_facts.rohs_stated(conn, [item["id"] for item in items])
    quantities = price_quantity.of_parts(conn, [item["id"] for item in items])
    return {
        item["id"]: assess_one(
            item, offers.get(item["id"], []), held.get(item["id"], []), now, needs.get(item["id"]), settings, distributors,
            (extras or {}).get(item["id"], ()), listed.get(item["id"], ()), rates, (kept.get(item["id"]) or {}).get("outlook_band") or "",
            last_buys.get(item["id"]), rohs_said.get(item["id"], ()), quantities[item["id"]],
            insight=kept.get(item["id"]), out_chance=part_insights.out_chance(kept.get(item["id"])) if shown else None,
            rules=rules.get(item["id"], alert_rules.NONE), notices=notices.get(item["id"], ()),
        )
        for item in items
    }


def assess_parts(
    conn,
    part_ids: Sequence[str],
    needs: Mapping[str, int | None] | None = None,
    now: datetime | None = None,
    settings: supply_settings.Settings | None = None,
) -> dict[str, dict[str, Any]]:
    items, offers = parts_view.summaries_with_offers(conn, list(part_ids))
    return assess_summaries(conn, items, offers, needs or {}, now or clock.now(), settings)
