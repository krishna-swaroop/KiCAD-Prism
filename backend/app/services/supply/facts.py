"""What distributors state about a part beyond stock and price: compliance and trade facts, as they wrote them.

DigiKey and Mouser send these with every answer, so they are kept when offers are read and cost no extra call.
Each fact is stored per part and provider with the time it was last seen; a provider's set for a part is replaced
whole on each read, so a fact it stops sending goes away. Nothing is merged across providers: the part sheet shows
each source, and where two disagree, both.

Names (``LABELS``) are Prism's; the values stay as the distributor wrote them. ``rohs_class`` and ``reach_class``
read the wording into a few classes for summaries. A wording they do not know is "unknown", never compliant.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any, Iterable, Mapping, Sequence

from app.services.supply.providers import registry

LABELS: dict[str, str] = {
    "rohs_status": "RoHS",
    "reach_status": "REACH",
    "reach_svhc": "Substances of very high concern",
    "category": "Distributor category",
    "msl": "Moisture sensitivity level",
    "eccn": "Export control class (ECCN)",
    "hts_us": "Tariff code, United States (HTS)",
    "hts_eu": "Tariff code, European Union (TARIC)",
    "hts_cn": "Tariff code, China",
    "hts_ca": "Tariff code, Canada",
    "hts_jp": "Tariff code, Japan",
    "hts_kr": "Tariff code, South Korea",
    "hts_mx": "Tariff code, Mexico",
    "hts_br": "Tariff code, Brazil",
    "last_buy_date": "Last date to buy",
    "suggested_replacement": "Suggested replacement",
    "eol_notice_date": "End-of-life notice date",
    "factory_stock": "Manufacturer's own stock",
    "normally_stocking": "Normally stocked by the distributor",
    "ncnr": "Non-cancellable, non-returnable",
    "backorder_allowed": "Back orders allowed",
    "mfr_lead_weeks": "Manufacturer lead time (weeks)",
    "origin_country": "Country of origin",
    "jlc_library": "JLCPCB part class",
    "jlc_preferred": "JLCPCB preferred part",
}
ORDER = tuple(LABELS)
# Facts that describe the part rather than its compliance: the part sheet shows them with the parameters.
NOT_COMPLIANCE = frozenset({
    "category", "jlc_library", "jlc_preferred", "factory_stock", "normally_stocking", "ncnr", "backorder_allowed", "mfr_lead_weeks", "origin_country",
})
MAX_VALUE = 500
MAX_PER_PROVIDER = 40
_NAME = re.compile(r"^[a-z][a-z0-9_]{1,40}$")

ROHS_CLASSES = ("compliant", "compliant_exemption", "not_compliant", "not_applicable", "unknown")
REACH_CLASSES = ("unaffected", "affected", "not_applicable", "unknown")


def rohs_class(text: str) -> str:
    """``compliant``, ``compliant_exemption``, ``not_compliant``, ``not_applicable`` or ``unknown``."""

    value = " ".join(text.lower().split())
    if not value or "undefined" in value or "unknown" in value:
        return "unknown"
    if "not applicable" in value or value == "n/a":
        return "not_applicable"
    if re.search(r"\bnon[- ]?(rohs|compliant)|not compliant", value):
        return "not_compliant"
    if "exempt" in value:
        return "compliant_exemption"
    return "compliant" if "compliant" in value else "unknown"


def reach_class(text: str) -> str:
    """``unaffected``, ``affected``, ``not_applicable`` or ``unknown``."""

    value = " ".join(text.lower().split())
    if "unaffected" in value or "not affected" in value:
        return "unaffected"
    if "affected" in value:
        return "affected"
    if "not applicable" in value:
        return "not_applicable"
    return "unknown"


def clean(pairs: Iterable[tuple[str, str]]) -> dict[str, str]:
    """Known-shaped names with non-empty values, the first of each name kept, values trimmed."""

    kept: dict[str, str] = {}
    for name, value in pairs:
        name, value = str(name).strip(), " ".join(str(value).split())[:MAX_VALUE]
        if _NAME.match(name) and value and name not in kept:
            kept[name] = value
        if len(kept) >= MAX_PER_PROVIDER:
            break
    return kept


# Facts that come from a read of their own (``details.py``), not with offers: an offer read leaves them alone.
SEPARATE = ("reach_svhc",)
# An unchanged fact is touched again only when its observation is this old.
OBSERVED_REFRESH = timedelta(days=1)


def replace(conn, part_id: str, provider: str, pairs: Iterable[tuple[str, str]], now: datetime) -> None:
    """Make ``provider``'s facts for the part exactly ``pairs`` (``SEPARATE`` ones aside). An empty set removes what it said.

    Only what changed is written. A fact that still says the same thing has its observation date moved forward at most
    once a day, so reading a part many times adds no writes.
    """

    kept = {name: value for name, value in clean(pairs).items() if name not in SEPARATE}
    stored = {
        row["name"]: row
        for row in conn.execute(
            "SELECT name, value, observed_at FROM supply_part_facts WHERE part_id = %s AND provider = %s", (part_id, provider)
        ).fetchall()
    }
    gone = [name for name in stored if name not in kept and name not in SEPARATE]
    if gone:
        conn.execute("DELETE FROM supply_part_facts WHERE part_id = %s AND provider = %s AND name = ANY(%s)", (part_id, provider, gone))
    for name, value in kept.items():
        current = stored.get(name)
        if current is not None and current["value"] == value and current["observed_at"] > now - OBSERVED_REFRESH:
            continue
        conn.execute(
            """
            INSERT INTO supply_part_facts (part_id, provider, name, value, observed_at) VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (part_id, provider, name) DO UPDATE SET value = EXCLUDED.value, observed_at = EXCLUDED.observed_at
            """,
            (part_id, provider, name, value, now),
        )


def set_one(conn, part_id: str, provider: str, name: str, value: str, now: datetime) -> None:
    """Keep one fact without touching the provider's others (used by reads that only bring one, such as substances)."""

    kept = clean([(name, value)])
    if not kept:
        conn.execute("DELETE FROM supply_part_facts WHERE part_id = %s AND provider = %s AND name = %s", (part_id, provider, name))
        return
    conn.execute(
        """
        INSERT INTO supply_part_facts (part_id, provider, name, value, observed_at) VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (part_id, provider, name) DO UPDATE SET value = EXCLUDED.value, observed_at = EXCLUDED.observed_at
        """,
        (part_id, provider, name, kept[name], now),
    )


def source_label(provider: str) -> str:
    try:
        return registry.get_spec(provider).label
    except registry.UnknownProvider:
        return provider


def _order(name: str) -> tuple[int, str]:
    return (ORDER.index(name) if name in LABELS else len(ORDER), name)


def for_part(conn, part_id: str, *, hide: frozenset[str] = frozenset()) -> list[dict[str, Any]]:
    """One entry per fact name: its label and what each provider says, in a fixed order. Disagreement is flagged."""

    rows = conn.execute(
        "SELECT provider, name, value, observed_at FROM supply_part_facts WHERE part_id = %s ORDER BY provider", (part_id,)
    ).fetchall()
    by_name: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        by_name.setdefault(row["name"], []).append({
            "provider": row["provider"], "source": source_label(row["provider"]), "value": row["value"],
            "observed_at": row["observed_at"].isoformat(),
        })
    return [
        {"name": name, "label": LABELS.get(name, name.replace("_", " ")), "sources": sources, "disagree": _disagree(name, sources)}
        for name, sources in sorted(by_name.items(), key=lambda item: _order(item[0]))
        if name not in hide
    ]


def _disagree(name: str, sources: Sequence[Mapping[str, Any]]) -> bool:
    if len(sources) < 2:
        return False
    if name == "rohs_status":
        values = {rohs_class(s["value"]) for s in sources} - {"unknown"}
    elif name == "reach_status":
        values = {reach_class(s["value"]) for s in sources} - {"unknown"}
    else:
        values = {re.sub(r"[\s.]", "", s["value"].lower()) for s in sources}
    return len(values) > 1


def summary(conn, part_ids: Sequence[str]) -> dict[str, dict[str, str]]:
    """Per part, the RoHS and REACH wording each provider uses, for drafts and tables: ``{part: {"rohs": ..., "reach": ...}}``.

    The text names its source, for example "ROHS3 Compliant (DigiKey); RoHS Compliant (Mouser)".
    """

    if not part_ids:
        return {}
    rows = conn.execute(
        "SELECT part_id, name, value, provider FROM supply_part_facts "
        "WHERE part_id = ANY(%s) AND name IN ('rohs_status', 'reach_status', 'reach_svhc') ORDER BY part_id, name, provider",
        (list(part_ids),),
    ).fetchall()
    found: dict[str, dict[str, list[str]]] = {}
    for row in rows:
        key = {"rohs_status": "rohs", "reach_status": "reach", "reach_svhc": "svhc"}[row["name"]]
        found.setdefault(row["part_id"], {}).setdefault(key, []).append(f"{row['value']} ({source_label(row['provider'])})")
    return {part_id: {key: "; ".join(values) for key, values in kinds.items()} for part_id, kinds in found.items()}


def rohs_stated(conn, part_ids: Sequence[str]) -> dict[str, list[str]]:
    """Per part, the ``rohs_class`` of each RoHS status a provider states."""

    if not part_ids:
        return {}
    found: dict[str, list[str]] = {}
    for row in conn.execute(
        "SELECT part_id, value FROM supply_part_facts WHERE name = 'rohs_status' AND part_id = ANY(%s) ORDER BY part_id, provider", (list(part_ids),)
    ).fetchall():
        found.setdefault(row["part_id"], []).append(rohs_class(row["value"]))
    return found


def jlc_classes(conn, part_ids: Sequence[str]) -> dict[str, dict[str, Any]]:
    """Per part JLCPCB lists, its class (``Basic`` or ``Extended``) and whether it is preferred. Parts JLCPCB has not answered for are left out."""

    if not part_ids:
        return {}
    rows = conn.execute(
        "SELECT part_id, name, value FROM supply_part_facts WHERE part_id = ANY(%s) AND name IN ('jlc_library', 'jlc_preferred')",
        (list(part_ids),),
    ).fetchall()
    found: dict[str, dict[str, Any]] = {}
    for row in rows:
        entry = found.setdefault(row["part_id"], {"library": None, "preferred": False})
        if row["name"] == "jlc_library":
            entry["library"] = row["value"]
        else:
            entry["preferred"] = True
    return found
