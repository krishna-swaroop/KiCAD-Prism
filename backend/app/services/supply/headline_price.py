"""The price a part shows in lists: one figure in the base currency, and what kind of figure it is.

Every counted listing is priced at the part's quantity and converted to the base currency, so distributors that quote
in different currencies compare. The figure is, in order of preference:

* ``orderable``: the cheapest listing that can be bought now (its stock covers what must be ordered);
* ``backorder``: nothing can, so the cheapest listing that quotes a lead time, with that lead time;
* ``last_seen``: no lead time either, so the price when the part was last in stock;
* ``listed``: nothing was ever seen in stock, so the cheapest list price.

The choice is ``pricing.best_offer``, the BOM's purchase rule too: cheapest is what the order costs, so a listing whose
minimum order is above the quantity (a full reel) wins only when the reel costs less than the pieces wanted. The range and median are over distributors, each at its own cheapest, so a pile of
listings at one distributor does not move them. A mean is never shown: one pack price would move it.
"""

from __future__ import annotations

import statistics
from datetime import date
from decimal import Decimal
from typing import Any, Callable, Mapping, Sequence

from app.services.supply import pricing
from app.services.supply.fx import Rates

MIN_SELLERS_FOR_RANGE = 2


def _range(quotes: Sequence[pricing.Quote]) -> dict[str, Any] | None:
    best: dict[str, Decimal] = {}
    for found in quotes:
        best[found.connector_id] = min(found.price, best.get(found.connector_id, found.price))
    if len(best) < MIN_SELLERS_FOR_RANGE:
        return None
    prices = list(best.values())
    return {"low": _text(min(prices)), "high": _text(max(prices)), "median": _text(statistics.median(prices)), "sellers": len(prices)}


_PLACES = Decimal("0.000001")


def _text(price: Decimal) -> str:
    """A price as plain text to the six places the readings keep, so a converted price is not 28 digits long."""

    return format(price.quantize(_PLACES).normalize(), "f")


def headline(
    offers: Sequence[Mapping[str, Any]], wanted: int, base: str, rates: Rates,
    last_seen: Callable[[], tuple[Decimal, date] | None] | None = None,
) -> dict[str, Any]:
    """The list price of a part: the figure, its kind and what goes with it. ``last_seen`` is asked only when nothing else prices it."""

    quotes = [found for found in (pricing.quote(offer, wanted, base, rates) for offer in offers) if found is not None]
    from app.services.supply.providers import registry  # the registry loads every provider, so it is imported when asked

    simulated = {offer["connector_id"] for offer in offers if registry.is_simulated(offer.get("provider") or "")}
    none = {"unit_price": None, "currency": "", "price_quantity": wanted, "price_kind": None, "price_lead_days": None,
            "price_range": None, "price_native": None, "price_seen_day": None, "price_unrated": pricing.unrated(offers, base, rates), "price_test_data": False}
    if not quotes:
        return none
    within = [found for found in quotes if found.within]
    beyond = [found for found in quotes if not found.within]
    chosen, kind = pricing.best_offer(quotes)
    price, quantity, seen_day = chosen.price, chosen.quantity, None
    seen = last_seen() if kind == pricing.LISTED and last_seen is not None else None
    if seen is not None:
        # No listing priced the part: the figure is no listing's.
        (price, seen_day), quantity, chosen, kind = seen, wanted, None, "last_seen"
    foreign = chosen is not None and chosen.currency != base and kind != "last_seen"
    return {
        **none,
        "unit_price": _text(price), "currency": base, "price_quantity": quantity, "price_kind": kind,
        "price_lead_days": chosen.lead_days if kind == "backorder" and chosen else None,
        "price_range": _range(within or beyond),
        "price_native": {"price": _text(chosen.native), "currency": chosen.currency} if foreign else None,
        "price_seen_day": seen_day.isoformat() if seen_day else None,
        # The figure came from a simulated connector; a last-seen price is test data when every offer of the part is.
        "price_test_data": chosen.connector_id in simulated if chosen else bool(offers) and all(offer["connector_id"] in simulated for offer in offers),
    }
