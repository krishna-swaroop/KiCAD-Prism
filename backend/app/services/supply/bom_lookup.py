"""Looking a bill of materials up in what Prism knows about parts.

A BOM line is a manufacturer, a part number and how many go on one board. This resolves each
line to a supply part (plan 6.4),
then reports stock, status, lead time and the cheapest way to buy what a build needs.

Reads only: it never calls a distributor. A line whose part nobody watches is reported as such;
watching it (``watch_lines``) is what makes Prism read it. Lines without a part number are "not
tracked" and are counted, never dropped.

Resolution, first hit wins. A line with a ``Prism ID`` the catalog knows is first given that component's
manufacturer and part number (``with_library_identity``); the rest is unchanged.

1. manufacturer and part number, through confirmed spellings and the part number key: exact
2. part number alone, when the manufacturer is blank or unrecognised and exactly one part has it:
   that part, marked so the manufacturer can be fixed
3. several parts share the number and the manufacturer cannot tell them apart: ambiguous
4. a part number nobody has watched or matched: unknown
5. no part number: not tracked

A line the steps above leave untracked, unknown or ambiguous, but whose symbol carries an LCSC number already
linked to a part, is that part. Watching a line with an LCSC number links that number to the part at the LCSC
connector, as a person's decision.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
import math
import uuid
from decimal import Decimal
from typing import Any, Callable, Iterable, Mapping, Sequence

from app.services.supply import attrition, clock, component_parts, ending_parts, fx, offer_rules, parts, parts_view, preferences, pricing, usage, watches
from app.services.supply import settings as supply_settings
from app.services.supply.assessment import line_checks
from app.services.supply.assessment import health as health_rules
from app.services.supply.assessment import service as assessment
from app.services.supply.audit import write_audit
from app.services.supply.vocabulary import Status
from app.services.supply.identity import alias_key, match_key
from app.services.supply.inventory import levels
from app.services.supply.providers import registry

MAX_LINES = 2000
MAX_WATCH_LINES = 200
_NEEDS_A_LOOK = frozenset({"warning", "error", "fatal"})
# "At risk" is error or fatal everywhere (the Projects view, the Dashboard, this rollup); a warning only needs a look.
_AT_RISK = frozenset({"error", "fatal"})
# Which of a line's part and its approved alternates tells the line's status: the best that has been read.
_PICK = {"ok": 0, "warning": 1, "error": 2, "fatal": 3, "unknown": 4}

NO_MPN, UNKNOWN, AMBIGUOUS, TRACKED = "no_mpn", "unknown", "ambiguous", "tracked"


@dataclass(frozen=True, slots=True)
class BomLine:
    key: str
    manufacturer: str
    mpn: str
    quantity: int  # per board, counting only parts that are fitted
    prism_id: str = ""  # the catalog component placed on the symbol
    lcsc: str = ""  # the LCSC number the symbol carries, such as C7950
    value: str = ""  # the symbol's value, such as 10k, checked against the distributor's
    footprint: str = ""  # the footprint's name, whose size (0603) is checked against the distributor's package


LCSC_PROVIDER = "lcsc"
LCSC_REASON = "LCSC number on the BOM"


def _by_lcsc(conn, numbers: Iterable[str]) -> dict[str, str]:
    """Part id per LCSC number, for numbers already linked to a part at an LCSC connector."""

    wanted = sorted({number for number in numbers if number})
    if not wanted:
        return {}
    rows = conn.execute(
        "SELECT l.sku, l.part_id FROM supply_listings l JOIN supply_connectors c ON c.id = l.connector_id "
        "WHERE c.provider = %s AND l.sku = ANY(%s) AND supply_counted(l.match_state) AND l.part_id IS NOT NULL",
        (LCSC_PROVIDER, wanted),
    ).fetchall()
    return {row["sku"]: row["part_id"] for row in rows}


def _manufacturer_ids(conn, alias_keys: Iterable[str]) -> dict[str, str]:
    keys = sorted({key for key in alias_keys if key})
    if not keys:
        return {}
    found: dict[str, str] = {}
    for row in conn.execute("SELECT name_key, id FROM supply_manufacturers WHERE name_key = ANY(%s)", (keys,)).fetchall():
        found[row["name_key"]] = row["id"]
    for row in conn.execute(
        "SELECT alias_key, manufacturer_id FROM supply_manufacturer_aliases WHERE alias_key = ANY(%s) AND status = 'confirmed'",
        (keys,),
    ).fetchall():
        found[row["alias_key"]] = row["manufacturer_id"]
    return found


def _resolve(lines: Sequence[BomLine], conn) -> dict[str, tuple[str, str | None, str | None]]:
    """Per line key: (state, part id, how the manufacturer matched)."""

    keys = {line.key: (alias_key(line.manufacturer), match_key(line.mpn)) for line in lines}
    manufacturers = _manufacturer_ids(conn, (alias for alias, _ in keys.values()))
    wanted = sorted({number for _, number in keys.values() if number})
    by_number: dict[str, list[tuple[str, str]]] = {}
    if wanted:
        for row in conn.execute("SELECT id, manufacturer_id, match_key FROM supply_parts WHERE match_key = ANY(%s)", (wanted,)).fetchall():
            by_number.setdefault(row["match_key"], []).append((row["id"], row["manufacturer_id"]))
        # A number the part is also sold under finds it too.
        for row in conn.execute(
            "SELECT p.id, p.manufacturer_id, n.match_key FROM supply_part_numbers n JOIN supply_parts p ON p.id = n.part_id WHERE n.match_key = ANY(%s)", (wanted,)
        ).fetchall():
            by_number.setdefault(row["match_key"], []).append((row["id"], row["manufacturer_id"]))

    spelled: dict[str, set[str]] = {}
    candidate_ids = sorted({part_id for part_ids in by_number.values() for part_id, _ in part_ids})
    if candidate_ids:
        for row in conn.execute("SELECT part_id, alias_key FROM supply_part_spellings WHERE part_id = ANY(%s)", (candidate_ids,)).fetchall():
            spelled.setdefault(row["part_id"], set()).add(row["alias_key"])

    resolved: dict[str, tuple[str, str | None, str | None]] = {}
    for line in lines:
        alias, number = keys[line.key]
        if not number:
            resolved[line.key] = (NO_MPN, None, None)
            continue
        candidates = by_number.get(number, [])
        manufacturer_id = manufacturers.get(alias) if alias else None
        exact = [part_id for part_id, owner in candidates if owner == manufacturer_id] if manufacturer_id else []
        if not exact and alias:
            exact = [part_id for part_id, _owner in candidates if alias in spelled.get(part_id, ())]
        if exact:
            resolved[line.key] = (TRACKED, exact[0], "exact")
        elif len(candidates) == 1:
            resolved[line.key] = (TRACKED, candidates[0][0], "missing" if not alias else "unmatched")
        elif len(candidates) > 1:
            resolved[line.key] = (AMBIGUOUS, None, None)
        else:
            resolved[line.key] = (UNKNOWN, None, None)
    # A line the numbers could not settle is still the part its LCSC number is linked to.
    unsettled = [line for line in lines if resolved[line.key][0] != TRACKED and line.lcsc]
    linked = _by_lcsc(conn, (line.lcsc for line in unsettled))
    for line in unsettled:
        if line.lcsc in linked:
            resolved[line.key] = (TRACKED, linked[line.lcsc], "lcsc")
    return resolved


def resolve_lines(lines: Sequence[BomLine], conn) -> dict[str, tuple[str, str | None, str | None]]:
    """Per line key: (state, part id, how the manufacturer matched). Reads only."""

    return _resolve(lines, conn)


def _preferred_for(part_id: str, own: Mapping[str, str], settings) -> list[str]:
    """The distributors to price a part at first: its own preferred one, then the workspace's order. Empty while the option is off."""

    if not settings.pricing.prefer_distributors:
        return []
    return list(dict.fromkeys([*([own[part_id]] if part_id in own else []), *settings.pricing.distributor_order]))


def _preferred_standing(offers: Sequence[Mapping[str, Any]], connector_id: str | None) -> dict[str, Any] | None:
    mine = [offer for offer in offers if offer.get("connector_id") == connector_id and not offer["marketplace"]] if connector_id else []
    if not mine:
        return None
    return {"connector_id": connector_id, "connector_name": mine[0]["connector_name"], "provider": mine[0]["provider"], "stock": sum(int(o["stock"] or 0) for o in mine)}


def _best_purchase(
    offers: Sequence[Mapping[str, Any]], need: int, rates: fx.Rates | None = None, base: str = "EUR", preferred: Sequence[str] = ()
) -> dict[str, Any] | None:
    """The single offer to buy ``need`` pieces from: ``pricing.best_offer``, the list price's rule too. An offer whose stock covers
    the order wins over a cheaper one that does not; with ``preferred`` (connector ids, most preferred first) the first of them
    covering it wins over a cheaper offer elsewhere. Marketplace stock is not offered. Offers in one currency are compared in it;
    offers in several are compared in ``base``, and not at all when a rate is missing. ``in_base`` is the chosen offer's extended
    price in ``base``, if it can be told."""

    currencies = {offer["currency"] for offer in offers if offer["currency"] and not offer["marketplace"] and offer["price_breaks"]}
    compared_in = next(iter(currencies)) if len(currencies) == 1 else base
    if pricing.unrated(offers, compared_in, rates):
        return None
    quotes = [found for found in (pricing.quote(offer, need, compared_in, rates) for offer in offers) if found is not None]
    chosen, _kind = pricing.best_offer(quotes, preferred)
    if chosen is None:
        return None
    converted = chosen.cost if compared_in == base else (rates.convert(chosen.cost, compared_in, base) if rates is not None else None)
    offer, order, unit = chosen.offer, chosen.quantity, chosen.native
    extended, spare = unit * order, order - need
    return {
        # Pieces bought beyond the need because of the smallest order and its multiples, and what they cost.
        "waste": spare,
        "waste_cost": format((unit * spare).quantize(Decimal("0.0001")).normalize(), "f") if spare > 0 else "0",
        "next_break": _next_break(offer, order, extended),
        "in_base": format(converted.quantize(Decimal("0.0001")).normalize(), "f") if converted is not None else None,
        "quantity": order,
        "unit_price": format(unit.normalize(), "f"),
        "currency": offer["currency"],
        "extended": format(extended.quantize(Decimal("0.0001")).normalize(), "f"),
        "covers": chosen.covers,
        "connector_name": offer["connector_name"],
        "provider": offer["provider"],
        "test_data": registry.is_simulated(offer["provider"]),
        "sku": offer["sku"],
        "product_url": offer["product_url"],
        # The part bought: the line's own, or the approved alternate whose offer won.
        "part_id": offer.get("part_id"),
    }


def _next_break(offer: Mapping[str, Any], order: int, extended: Decimal) -> dict[str, Any] | None:
    """The next price break above the order, and what buying that many would cost in total against the order. Negative
    ``extra`` means buying more is cheaper in total."""

    for quantity, price in sorted((int(q), Decimal(p)) for q, p in offer["price_breaks"]):
        if quantity > order:
            total = price * pricing.order_quantity(quantity, offer["moq"], offer["order_multiple"])
            return {
                "quantity": quantity, "unit_price": format(price.normalize(), "f"),
                "extra": format((total - extended).quantize(Decimal("0.0001")).normalize(), "f"),
            }
    return None


def needed(per_board: int, build_quantity: int, attrition_percent: float = 0) -> int:
    """Units to have for a build: what the boards use, plus the spares attrition asks for, rounded up."""

    exact = Decimal(per_board * build_quantity) * (Decimal(100) + Decimal(str(attrition_percent))) / Decimal(100)
    return math.ceil(exact)


def library_identities(lines: Sequence[BomLine], identities: usage.Identities | None) -> dict[str, tuple[str, str]]:
    """Manufacturer and part number of the catalog components the lines name. A component without a part number is left out."""

    wanted = {line.prism_id for line in lines if line.prism_id}
    found = identities(wanted) if identities and wanted else {}
    return {component_id: identity for component_id, identity in found.items() if identity[1].strip()}


def with_library_identity(lines: Sequence[BomLine], library: Mapping[str, tuple[str, str]]) -> list[BomLine]:
    """Lines whose ``prism_id`` the catalog knows take the library component's manufacturer and part number (6.4, step 1)."""

    return [replace(line, manufacturer=library[line.prism_id][0], mpn=library[line.prism_id][1]) if line.prism_id in library else line for line in lines]


def library_readers(conn) -> dict[str, Any]:
    """The catalog readers a project's lines are looked up with (``identities`` and ``in_library``), so lines placed by Prism ID take
    their component's part and the rest are told whether the library has them (D3). Empty in a schema without the catalog."""

    from app.services.supply import catalog_read

    return {"identities": catalog_read.identities, "in_library": catalog_read.in_library} if component_parts.library_present(conn) else {}


def line_alternates(
    conn, lines: Sequence[BomLine], resolved: Mapping[str, tuple[str, str | None, str | None]], known: Mapping[str, tuple[str, str]],
) -> dict[str, list[str]]:
    """Per part a line resolved to, the approved alternates of its component that are not on the BOM themselves (D2): those of the
    components the lines place by Prism ID, or of the one component whose main part it is."""

    leads: dict[str, set[str]] = {}
    for line in lines:
        part_id = resolved[line.key][1]
        if part_id:
            leads.setdefault(part_id, set()).update({line.prism_id} if line.prism_id in known else ())
    return {
        part_id: kept for part_id, others in component_parts.alternates_for(conn, leads).items()
        if (kept := [other for other in others if other not in leads])
    }


def best_of(candidates: Sequence[str], status_of: Callable[[str], str]) -> str:
    """The candidate with the best status that has been read; the first on a tie."""

    return min(candidates, key=lambda candidate: _PICK.get(status_of(candidate), len(_PICK)))


@dataclass(frozen=True)
class Loaded:
    """What a lookup reads from the database, which does not depend on how many boards are built: pricing it for another build size
    reads nothing again."""

    lines: list[BomLine]
    known: Mapping[str, tuple[str, str]]
    resolved: Mapping[str, tuple[str, str | None, str]]
    items: list[dict[str, Any]]
    offers: Mapping[str, Sequence[Mapping[str, Any]]]
    summary: Mapping[str, dict[str, Any]]
    per_board: Mapping[str, int]
    first_line: Mapping[str, str]
    by_key: Mapping[str, BomLine]
    settings: supply_settings.Settings
    extras: Mapping[str, list]
    rates: fx.Rates | None
    preferred_of: Mapping[str, Any]
    # The keys of lines a catalog component has (by Prism ID or by manufacturer and part number); None when the library was not asked.
    library: frozenset[str] | None = None
    # Per line part, the approved alternates of its component that are not on the BOM themselves (D2): their stock and offers count.
    alternates: Mapping[str, list[str]] = field(default_factory=dict)
    # Per line key, the stores state of the line's catalog component (levels.stores_state); a line with no component has none.
    stores: Mapping[str, dict[str, Any]] = field(default_factory=dict)


def load(
    conn,
    lines: Sequence[BomLine],
    identities: usage.Identities | None = None,
    in_library: Callable[[Iterable[tuple[str, str]]], set[tuple[str, str]]] | None = None,
) -> Loaded:
    if len(lines) > MAX_LINES:
        raise ValueError(f"At most {MAX_LINES} lines can be looked up at once.")
    known = library_identities(lines, identities)
    lines = with_library_identity(lines, known)
    resolved = _resolve(lines, conn)
    alternates = line_alternates(conn, lines, resolved, known)
    part_ids = sorted({part_id for _, part_id, _ in resolved.values() if part_id} | {other for others in alternates.values() for other in others})
    items, offers = parts_view.summaries_with_offers(conn, part_ids)
    summary = {item["id"]: item for item in items}

    # Two lines can be one part (one names the manufacturer, one leaves it blank). The part is
    # checked against stock and bought once, for everything the lines need together.
    per_board: dict[str, int] = {}
    first_line: dict[str, str] = {}
    for line in lines:
        part_id = resolved[line.key][1]
        if part_id:
            per_board[part_id] = per_board.get(part_id, 0) + line.quantity
            first_line.setdefault(part_id, line.key)
    settings = supply_settings.load(conn)
    extras: dict[str, list] = {}
    _line_findings(conn, lines, resolved, summary, first_line, set(known), in_library, settings.assessment, extras)
    stores = _stores_of_lines(conn, lines, resolved, known)
    return Loaded(
        lines=list(lines), known=known, resolved=resolved, items=items, offers=offers, summary=summary, per_board=per_board,
        first_line=first_line, by_key={line.key: line for line in lines}, settings=settings, extras=extras,
        rates=fx.latest(conn), preferred_of=preferences.of_parts(conn, list(per_board)), library=_library_lines(lines, known, in_library),
        alternates={part_id: [other for other in others if other in summary] for part_id, others in alternates.items()},
        stores=stores,
    )


def _stores_of_lines(
    conn, lines: Sequence[BomLine], resolved: Mapping[str, tuple[str, str | None, str | None]], known: Mapping[str, tuple[str, str]],
) -> dict[str, dict[str, Any]]:
    """The stores state of each line's catalog component: the one its Prism ID places, else the one component its part counts for."""

    holders = component_parts.components_of(conn, [part_id for _, part_id, _ in resolved.values() if part_id]) if component_parts.library_present(conn) else {}
    component_of: dict[str, str] = {}
    for line in lines:
        part_id = resolved[line.key][1]
        if line.prism_id and line.prism_id in known:
            component_of[line.key] = line.prism_id
        elif part_id and len(holders.get(part_id, [])) == 1:
            component_of[line.key] = holders[part_id][0]
    states = levels.stores_state(conn, sorted(set(component_of.values())))
    return {key: states[component] for key, component in component_of.items() if component in states}


def _counted(loaded: Loaded, part_id: str) -> list[str]:
    """The line's part, then the approved alternates it may be built with."""

    return [part_id, *loaded.alternates.get(part_id, ())]


def _pick(loaded: Loaded, part_id: str, assessed: Mapping[str, Mapping[str, Any]] | None) -> str:
    """The part whose status the line shows: the best of its part and alternates, the line's own part on a tie."""

    def status(candidate: str) -> str:
        return assessed[candidate]["status"] if assessed is not None and candidate in assessed else loaded.summary[candidate]["status"]

    return best_of(_counted(loaded, part_id), status)


def _library_lines(
    lines: Sequence[BomLine], known: Mapping[str, tuple[str, str]], in_library: Callable[[Iterable[tuple[str, str]]], set[tuple[str, str]]] | None,
) -> frozenset[str] | None:
    """The lines a catalog component has: placed by Prism ID, or naming a component's manufacturer and part number (D12)."""

    if in_library is None:
        return None
    loose = [line for line in lines if line.prism_id not in known and match_key(line.mpn)]
    have = in_library((line.manufacturer, line.mpn) for line in loose)
    named = {line.key for line in loose if (line.manufacturer.strip().casefold(), line.mpn.strip().casefold()) in have}
    return frozenset({line.key for line in lines if line.prism_id in known} | named)


def _percents(loaded: Loaded, attrition_percent: float | None) -> dict[str, float]:
    """Spares per part. `None` asks for spares by kind of part, taken from the footprint on the part's first line; a number is for every part."""

    table = loaded.settings.spares.table()
    return {
        part_id: attrition.percent_for(loaded.by_key[loaded.first_line[part_id]].footprint, table) if attrition_percent is None else attrition_percent
        for part_id in loaded.per_board
    }


def _entries(
    loaded: Loaded, build_quantity: int, attrition_percent: float | None, percents: Mapping[str, float], needs: Mapping[str, int],
    assessed: Mapping[str, Mapping[str, Any]] | None,
) -> dict[str, dict[str, Any]]:
    """The result of each line for a build size. Without ``assessed`` (a cost curve asks only for prices and stock) a line has no assessment."""

    results: dict[str, dict[str, Any]] = {}
    for line in loaded.lines:
        state, part_id, how = loaded.resolved[line.key]
        entry: dict[str, Any] = {"state": state, "part_id": part_id, "manufacturer_match": how, "in_library": _in_library(loaded, line), "need": needed(line.quantity, build_quantity, percents.get(part_id, attrition_percent or 0) if part_id else (attrition_percent or 0))}
        stores = loaded.stores.get(line.key)
        entry["stores"] = stores
        if part_id:
            item = loaded.summary[part_id]
            group = _counted(loaded, part_id)
            chosen = _pick(loaded, part_id, assessed)
            picked = loaded.summary[chosen]
            if len(group) == 1:
                offers_here, stock = loaded.offers.get(part_id, []), item["stock"]
            else:
                offers_here = [offer for other in group for offer in loaded.offers.get(other, [])]
                stocks = [loaded.summary[other]["stock"] for other in group if loaded.summary[other]["stock"] is not None]
                stock = sum(stocks) if stocks else None
            part_need = needs[part_id]
            leader = loaded.first_line[part_id]
            # What the build can draw on: the distributors' stock and what the stores have available (Q1). Held and at-vendor stock
            # are shown on the component, never counted.
            on_hand = (stores or {}).get("available")
            usable = None if stock is None and on_hand is None else (stock or 0) + int(on_hand or 0)
            entry |= {
                "watched": item["tracking"] is not None,
                "jlc": item.get("jlc"),
                "status": picked["status"],
                "problem": picked["problem"],
                # The alternate the status is told by, when it is not the line's own part.
                "status_from": chosen if chosen != part_id else None,
                "alternates": [
                    {"part_id": other, "manufacturer": loaded.summary[other]["manufacturer"], "mpn": loaded.summary[other]["mpn"],
                     "stock": loaded.summary[other]["stock"], "status": loaded.summary[other]["status"]}
                    for other in group[1:]
                ],
                "stock": stock,
                "lifecycle": item["lifecycle"],
                "lead_time_days": offer_rules.lead_time_of(offers_here),
                "fetched_at": item["fetched_at"],
                "part_need": part_need,
                "usable": usable,
                "short": usable is not None and usable < part_need,
                # Only the first line of a part carries the purchase; the others say where it is.
                "buy": _best_purchase(offers_here, part_need, loaded.rates, loaded.settings.pricing.base_currency, _preferred_for(part_id, loaded.preferred_of, loaded.settings)) if line.key == leader else None,
                "bought_with": None if line.key == leader else leader,
                # The distributor a person prefers for this part, with what it holds, shown first in the drawer.
                "preferred": _preferred_standing(offers_here, loaded.preferred_of.get(part_id)),
                "assessment": _assessment_line(assessed[chosen]) if assessed is not None else None,
            }
        results[line.key] = entry
    return results


def _in_library(loaded: Loaded, line: BomLine) -> bool | None:
    """Whether a catalog component has the line; None for a line without a part number, or when the library was not asked."""

    if loaded.library is None or not match_key(line.mpn):
        return None
    return line.key in loaded.library


def price(conn, loaded: Loaded, build_quantity: int, attrition_percent: float | None = 0) -> dict[str, Any]:
    """The lookup for a build size, from what ``load`` read."""

    percents = _percents(loaded, attrition_percent)
    needs = {part_id: needed(count, build_quantity, percents[part_id]) for part_id, count in loaded.per_board.items()}
    # An alternate is assessed for the whole need of its line, as it would be bought instead.
    assessed_needs = needs | {other: needs[part_id] for part_id, others in loaded.alternates.items() for other in others}
    assessed = assessment.assess_summaries(conn, loaded.items, loaded.offers, assessed_needs, clock.now(), loaded.settings, loaded.extras)
    results = _entries(loaded, build_quantity, attrition_percent, percents, needs, assessed)
    shown = {part_id: assessed[_pick(loaded, part_id, assessed)] for part_id in loaded.per_board}
    return {
        "build_quantity": build_quantity,
        "attrition_percent": attrition_percent,
        "attrition_by_part": percents if attrition_percent is None else None,
        "lines": results,
        "rollup": _rollup(loaded.lines, results, build_quantity, loaded.per_board, loaded.first_line, percents, loaded.rates, loaded.settings.pricing.base_currency)
        | _health_rollup(shown, needs),
    }


def cost_curve(loaded: Loaded, sizes: Sequence[int], attrition_percent: float | None = 0) -> list[dict[str, Any]]:
    """What the BOM costs at each build size, from one load: the cost of a board, the money out and the parts the stock cannot cover. It
    assesses nothing, so it is the pricing alone."""

    curve = []
    percents = _percents(loaded, attrition_percent)
    for boards in sizes:
        needs = {part_id: needed(count, boards, percents[part_id]) for part_id, count in loaded.per_board.items()}
        results = _entries(loaded, boards, attrition_percent, percents, needs, None)
        rollup = _rollup(loaded.lines, results, boards, loaded.per_board, loaded.first_line, percents, loaded.rates, loaded.settings.pricing.base_currency)
        curve.append({
            "boards": boards, "cost_per_board": rollup["cost_per_board"], "cost_build": rollup["cost_build"], "currency": rollup["currency"],
            "short": rollup["short"], "lines_priced": rollup["lines_priced"], "lines": rollup["lines"],
        })
    return curve


def lookup(
    conn,
    lines: Sequence[BomLine],
    build_quantity: int,
    attrition_percent: float | None = 0,
    identities: usage.Identities | None = None,
    in_library: Callable[[Iterable[tuple[str, str]]], set[tuple[str, str]]] | None = None,
) -> dict[str, Any]:
    return price(conn, load(conn, lines, identities, in_library), build_quantity, attrition_percent)


def _line_findings(conn, lines, resolved, summary, first_line, placed, in_library, settings, extras) -> None:
    """Add what the way a line names its part says: a missing manufacturer, a part the library does not have."""

    by_key = {line.key: line for line in lines}
    leaders = {part_id: by_key[key] for part_id, key in first_line.items()}
    for part_id, line in leaders.items():
        if resolved[line.key][2] == "missing":
            extras.setdefault(part_id, []).append(line_checks.manufacturer_missing(settings))
    for part_id, line in leaders.items():
        if line.value or line.footprint:
            listed = parts_view.parameters_of(conn, part_id)
            for found in (line_checks.parameter_mismatch(line.value, listed, settings), line_checks.package_mismatch(line.footprint, listed, settings)):
                if found:
                    extras.setdefault(part_id, []).append(found)
    if in_library is None:
        return
    unplaced = {part_id: line for part_id, line in leaders.items() if line.prism_id not in placed}
    have = in_library((summary[part_id]["manufacturer"], summary[part_id]["mpn"]) for part_id in unplaced)
    for part_id in unplaced:
        pair = (str(summary[part_id]["manufacturer"]).strip().casefold(), str(summary[part_id]["mpn"]).strip().casefold())
        if pair not in have:
            extras.setdefault(part_id, []).append(line_checks.not_in_library(settings))


def _assessment_line(assessment_dto: Mapping[str, Any]) -> dict[str, Any]:
    """What a BOM row needs of an assessment: the number, the status, and which findings still stand."""

    open_findings = [f for f in assessment_dto["findings"] if not (f["waiver"] and f["waiver"]["holds"])]
    return {
        "health": assessment_dto["health"],
        "status": assessment_dto["status"],
        "open": len(open_findings),
        "checks": [f["check"] for f in open_findings],
    }


def _health_rollup(assessed: Mapping[str, Mapping[str, Any]], needs: Mapping[str, int]) -> dict[str, Any]:
    """BOM health: the mean of its parts weighted by units needed, capped when any part is fatal."""

    rolled = health_rules.rollup([(a["health"], needs.get(part_id, 1), Status(a["status"])) for part_id, a in assessed.items()])
    return {"health": rolled.score if rolled.status is not Status.UNKNOWN else None, "health_status": rolled.status.value}


def _rollup(
    lines: Sequence[BomLine],
    results: Mapping[str, Mapping[str, Any]],
    build_quantity: int,
    per_board: Mapping[str, int],
    first_line: Mapping[str, str],
    percents: Mapping[str, float],
    rates: fx.Rates | None = None,
    base: str = "EUR",
) -> dict[str, Any]:
    """Counts of lines (``lines``, ``tracked``, ``not_tracked``, ``watched``) and of distinct parts
    (``at_risk`` is error or fatal, ``needs_a_look`` adds warnings; ``short``, ``priced``, ``without_stock_data``);
    ``lines_priced`` is how many lines the cost covers, so one part on two lines counts once."""

    tracked = [results[line.key] for line in lines if results[line.key]["state"] == TRACKED]
    leaders = [results[key] for key in first_line.values()]
    priced = [entry["buy"] for entry in leaders if entry["buy"]]
    lines_priced = sum(1 for line in lines if results[line.key]["part_id"] and results[first_line[results[line.key]["part_id"]]]["buy"])
    currencies = {buy["currency"] for buy in priced}
    converted = False
    # The total is in the workspace's currency whenever every price converts to it; prices all in one other currency
    # that has no rate stay in that currency rather than showing no total.
    if priced and all(buy["in_base"] is not None for buy in priced):
        total = sum((Decimal(buy["in_base"]) for buy in priced), Decimal(0))
        shown_currency: str | None = base
        converted = currencies != {base}
    elif len(currencies) == 1:
        total = sum((Decimal(buy["extended"]) for buy in priced), Decimal(0))
        shown_currency = next(iter(currencies))
    else:
        total, shown_currency = None, None

    # What the rounding to smallest orders and multiples buys beyond the need, in the total's currency.
    waste: Decimal | None = Decimal(0) if total is not None else None
    for buy in priced:
        if waste is None or Decimal(buy["extended"]) <= 0 or buy["waste"] <= 0:
            continue
        figure = Decimal(buy["in_base"] if converted else buy["extended"]) if (buy["in_base"] is not None or not converted) else None
        if figure is None:
            waste = None
            break
        waste += figure * Decimal(buy["waste_cost"]) / Decimal(buy["extended"])

    can_build = None
    limiting = None
    for part_id, key in first_line.items():
        stock = results[key].get("usable")
        if stock is None:
            continue
        # Boards the stock covers once the spares are set aside.
        possible = int(Decimal(stock) * 100 // (Decimal(per_board[part_id]) * (Decimal(100) + Decimal(str(percents[part_id])))))
        if can_build is None or possible < can_build:
            can_build, limiting = possible, key
    return {
        "lines": len(lines),
        "tracked": len(tracked),
        "not_tracked": len(lines) - len(tracked),
        "watched": sum(1 for entry in tracked if entry["watched"]),
        "at_risk": sum(1 for entry in leaders if entry["status"] in _AT_RISK),
        "needs_a_look": sum(1 for entry in leaders if entry["status"] in _NEEDS_A_LOOK),
        "short": sum(1 for entry in leaders if entry["short"]),
        "priced": len(priced),
        "lines_priced": lines_priced,
        "currency": shown_currency,
        "converted": converted,
        # Some of the cost comes from a simulated connector, so the total is test data.
        "test_data": any(buy.get("test_data") for buy in priced),
        "rates_day": rates.day.isoformat() if converted and rates is not None and rates.day else None,
        "cost_build": format(total.quantize(Decimal("0.01")), "f") if total is not None else None,
        # What the total is made of before conversion, per currency the offers are quoted in. Empty when nothing was converted.
        "original_costs": (
            {code: format(sum((Decimal(buy["extended"]) for buy in priced if buy["currency"] == code), Decimal(0)).quantize(Decimal("0.01")), "f")
             for code in sorted(currencies)}
            if converted else {}
        ),
        "waste_cost": format(waste.quantize(Decimal("0.01")), "f") if waste is not None else None,
        # What a board uses: the money out ("cost_build") less the pieces bought beyond the need, per board.
        "cost_per_board": format(((total - (waste or Decimal(0))) / build_quantity).quantize(Decimal("0.0001")), "f") if total is not None else None,
        "can_build": can_build,
        "limited_by": limiting,
        "without_stock_data": sum(1 for entry in leaders if entry.get("usable") is None),
        "parts": len(first_line),
    }


def standing_of(conn, lines: Sequence[BomLine]) -> dict[str, dict[str, Any]]:
    """Status, stock and whether it is watched, per line key, for the lines that resolve to a tracked part. Reads only."""

    resolved = _resolve(lines, conn)
    part_ids = sorted({part_id for state, part_id, _ in resolved.values() if state == TRACKED and part_id})
    summary = {item["id"]: item for item in parts_view.summaries_for(conn, part_ids)} if part_ids else {}
    marks = ending_parts.restrictions_of(conn, list(resolved))
    found = {
        key: {
            "status": summary[part_id]["status"], "stock": summary[part_id]["stock"], "watched": summary[part_id]["tracking"] is not None,
            "unit_price": summary[part_id].get("unit_price"), "currency": summary[part_id].get("currency") or "",
            "test_data": bool(summary[part_id].get("price_test_data")), "restriction": (marks.get(key) or {}).get("level"),
        }
        for key, (state, part_id, _how) in resolved.items()
        if state == TRACKED and part_id in summary
    }
    # A marked component shows its mark even when Prism does not track its part.
    for key, mark in marks.items():
        found.setdefault(key, {"status": "unknown", "stock": None, "watched": False, "unit_price": None, "currency": "", "restriction": mark["level"]})
    return found


def _link_lcsc(conn, connector_id: str, sku: str, part_id: str, mpn: str, manufacturer: str, actor: str) -> bool:
    """Link an LCSC number to a part, unless the number is already linked. True when a listing was added."""

    listing_id = uuid.uuid4().hex
    created = conn.execute(
        """
        INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state, match_reason, matched_by, first_seen_at)
        VALUES (%s, %s, %s, %s, %s, %s, 'manual', %s, 'bom', %s)
        ON CONFLICT (connector_id, sku) DO NOTHING RETURNING id
        """,
        (listing_id, connector_id, sku, part_id, mpn, manufacturer, LCSC_REASON, clock.now()),
    ).fetchone()
    if created:
        write_audit(conn, actor, "listing.seed", listing_id,
                    {"part_id": part_id, "connector_id": connector_id, "sku": sku, "source": "bom"}, subject_kind="listing")
    return created is not None


def watch_lines(
    conn, lines: Sequence[BomLine], actor: str, *, may_create_manufacturer: bool, identities: usage.Identities | None = None,
    lcsc_connector: str | None = None, tier: int | None = None, rate: str | None = None,
) -> dict[str, Any]:
    """Watch every distinct part on the lines at a tier (tier 2 weekly when none is asked). Reports what it could not and why.

    With ``lcsc_connector``, a line's LCSC number is linked to its part there, so it is read without a search.
    """

    if len(lines) > MAX_WATCH_LINES:
        raise ValueError(f"At most {MAX_WATCH_LINES} lines can be watched at once.")
    lines = with_library_identity(lines, library_identities(lines, identities))
    seen: set[tuple[str, str]] = set()
    watched = already = linked = 0
    skipped: list[dict[str, str]] = []
    for line in lines:
        mpn, maker = line.mpn.strip(), line.manufacturer.strip()
        if not match_key(mpn):
            skipped.append({"key": line.key, "reason": "no_mpn"})
            continue
        identity = (alias_key(maker), match_key(mpn))
        if identity in seen:
            continue
        seen.add(identity)
        try:
            with conn.transaction():
                record, created = watches.add_watch(conn, maker, mpn, actor, tier=tier, rate=rate, may_create_manufacturer=may_create_manufacturer)
                if lcsc_connector and line.lcsc:
                    linked += _link_lcsc(conn, lcsc_connector, line.lcsc, record.part_id, mpn, maker, actor)
        except component_parts.NotInLibrary:
            skipped.append({"key": line.key, "reason": "not_in_library"})
            continue
        except parts.UnknownManufacturer:
            skipped.append({"key": line.key, "reason": "needs_choice"})
            continue
        watched += 1 if created else 0
        already += 0 if created else 1
    return {"watched": watched, "already_watched": already, "lcsc_linked": linked, "skipped": skipped}
