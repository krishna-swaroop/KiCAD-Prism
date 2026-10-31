"""What the KiCad panel gets from supply data (remote provider payload 0.4.0, additive).

A component resolves to its manufacturer part by manufacturer and part number. Search, list and
detail carry a one-line ``summary``; detail adds the per-distributor ``offers`` (``sources`` is already the inventory list), the approved
``alternates``, the ``insight`` and server-built ``links``.

Reads only: browsing never calls a distributor. Nothing here is sent to a role that cannot read
supply data, and a component Prism does not track simply has no summary.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Mapping, Sequence
from urllib.parse import urlencode

from app.services.supply import bom_lookup, clock, insights, parts_view, price_quantity, pricing
from app.services.supply.assessment import service as assessment
from app.services.supply.bom_lookup import BomLine
from app.services.supply.forecast import views

MAX_RISKS = 2
_SEVERITY_ORDER = {"fatal": 0, "error": 1, "warning": 2, "ok": 3}


def data_version(conn) -> str:
    """Changes when supply data does, to a granularity the panel's caches can live with."""

    row = conn.execute("SELECT COALESCE(MAX(fetched_at), 'epoch'::timestamptz) AS newest FROM supply_offers").fetchone()
    return str(int(row["newest"].timestamp() // 600))


def _distributors(offers: Sequence[Mapping[str, Any]]) -> int:
    return len({o["connector_id"] for o in offers if o["stock"] > 0 and not o["marketplace"]})


def _summary(item: Mapping[str, Any], offers: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    return {
        "part_id": item["id"],
        "status": item["status"],
        "stock": item["stock"],
        "distributors": _distributors(offers),
        "lifecycle": item["lifecycle"],
        "unit_price": item["unit_price"],
        "price_quantity": item["price_quantity"],
        "currency": item["currency"],
        "fetched_at": item["fetched_at"],
        "watched": item["tracking"] is not None,
    }


def _resolve(conn, components: Sequence[Mapping[str, Any]]) -> dict[str, str]:
    """Component id to part id, for the components whose part Prism knows."""

    lines = [BomLine(str(c["id"]), str(c.get("manufacturer") or ""), str(c.get("mpn") or ""), 1) for c in components]
    resolved = bom_lookup.resolve_lines(lines, conn)
    return {key: part_id for key, (state, part_id, _how) in resolved.items() if state == bom_lookup.TRACKED and part_id}


def summaries(conn, components: Sequence[Mapping[str, Any]], role: str | None = None) -> dict[str, dict[str, Any]]:
    """A summary per tracked component, by component id. Components without one are left out."""

    if not components:
        return {}
    by_component = _resolve(conn, components)
    items, offers = parts_view.summaries_with_offers(conn, sorted(set(by_component.values())), role)
    standing = {item["id"]: item for item in items}
    return {
        component_id: _summary(standing[part_id], offers.get(part_id, []))
        for component_id, part_id in by_component.items()
        if part_id in standing
    }


def _source_rows(offers: Sequence[Mapping[str, Any]], wanted: int) -> list[dict[str, Any]]:
    """Each offer at the part's price quantity, in its own currency."""

    rows = []
    for offer in offers:
        price, _currency, _quantity = pricing.native_price(offer, wanted)
        rows.append({
            "connector": offer["connector_name"],
            "provider": offer["provider"],
            "sku": offer["sku"],
            "stock": offer["stock"],
            "marketplace": bool(offer["marketplace"]),
            "unit_price": price,
            "currency": offer["currency"],
            "moq": offer["moq"],
            "lead_time_days": offer["lead_time_days"],
            "product_url": offer["product_url"],
            "fetched_at": offer["fetched_at"].isoformat() if offer["fetched_at"] else None,
        })
    return sorted(rows, key=lambda row: (row["marketplace"], -row["stock"]))


def _links(origin: str, component_id: str, part_id: str) -> dict[str, str]:
    def library(**extra: str) -> str:
        return f"{origin}/?" + urlencode({"section": "library-manager", "libraryView": "catalog", "component": component_id, **extra})

    return {
        "component": library(),
        "sourcing": library(componentTab="sourcing"),
        # ``component`` brings KiCad's panel back to this component when the part page it opens there is closed.
        "supply": f"{origin}/?" + urlencode({"section": "supply", "supplyView": "parts", "part": part_id, "component": component_id}),
    }


def _risks(assessed: Mapping[str, Any], insight: Mapping[str, Any]) -> list[str]:
    """At most two lines on what to watch: the worst findings nobody has waived, then a drain."""

    open_findings = sorted(
        (f for f in assessed["findings"] if not (f["waiver"] and f["waiver"]["holds"])),
        key=lambda f: _SEVERITY_ORDER[f["severity"]],
    )
    lines = [f["text"] for f in open_findings]
    days = insights.rupture_expected_within(dict(insight))
    if days is not None:
        lines.append(f"Could run out in about {days} days at the recent rate.")
    return lines[:MAX_RISKS]


def detail(conn, component: Mapping[str, Any], role: str | None, origin: str, now: datetime | None = None) -> dict[str, Any] | None:
    """Everything the panel shows for one component, or None when Prism does not track its part."""

    now = now or clock.now()
    component_id = str(component["id"])
    part_id = _resolve(conn, [component]).get(component_id)
    if part_id is None:
        return None
    items, offers = parts_view.summaries_with_offers(conn, [part_id], role)
    if not items:
        return None
    here = offers.get(part_id, [])
    detail_view = parts_view.part_detail(conn, part_id, now=now, role=role)
    insight = detail_view["insight"]
    assessed = assessment.assess_summaries(conn, items, offers, {}, now)[part_id]
    return {
        "summary": _summary(items[0], here),
        "offers": _source_rows(here, price_quantity.of_parts(conn, [part_id])[part_id]),
        "insight": insight,
        "outlook": detail_view["outlook"]["label"],
        "health": {"score": assessed["health"], "status": assessed["status"]},
        "risks": _risks(assessed, insight),
        "forecast": views.panel_line(conn, part_id),
        "links": _links(origin, component_id, part_id),
    }
