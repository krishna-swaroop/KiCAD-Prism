"""Prices at a quantity, one rule for every reader.

Offers list price breaks from the first orderable quantity upward. Comparing the
first break of each offer would pit a reel price (3,000 pieces) against a cut
tape price (1 piece), so prices are compared at one quantity instead: the part's
price quantity (``price_quantity``), or ``REFERENCE_QUANTITY`` where there is no part.

* ``unit_price_at``: the unit price of a set of breaks when buying a quantity.
* ``quote``: one offer priced at a quantity, in the base currency, with what must be ordered.
* ``best_offer``: which quote to buy, for the list price and the BOM's purchase alike.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import TYPE_CHECKING, Any, Mapping, Sequence

if TYPE_CHECKING:
    from app.services.supply.fx import Rates

REFERENCE_QUANTITY = 100


def order_quantity(wanted: int, moq: int, order_multiple: int) -> int:
    """What must be ordered to get ``wanted``: at least the minimum, in whole multiples."""

    quantity = max(wanted, moq, 1)
    multiple = max(order_multiple, 1)
    return -(-quantity // multiple) * multiple


def unit_price_at(
    breaks: Sequence[tuple[int, Decimal]],
    *,
    moq: int = 1,
    order_multiple: int = 1,
    wanted: int = REFERENCE_QUANTITY,
    up_to: int | None = None,
) -> Decimal | None:
    """The unit price when buying ``wanted`` pieces, or None if no break covers it.

    ``breaks`` is ascending by quantity. A price break above the order quantity
    does not apply, and an offer whose cheapest break starts higher than that
    quantity has no price here (the buyer would need more pieces). ``up_to`` is
    the largest quantity the breaks hold for, when the distributor quoted only
    up to it: a larger order has no price here rather than the quote's.
    """

    quantity = order_quantity(wanted, moq, order_multiple)
    if up_to is not None and quantity > up_to:
        return None
    chosen: Decimal | None = None
    for break_quantity, price in breaks:
        if break_quantity <= quantity:
            chosen = price
    return chosen


def breaks_of(offer: Mapping[str, Any]) -> list[tuple[int, Decimal]]:
    return [(int(quantity), Decimal(str(price))) for quantity, price in offer["price_breaks"] or []]


def native_price(offer: Mapping[str, Any], wanted: int) -> tuple[str | None, str, int]:
    """One offer's unit price at ``wanted`` in its own currency, as (price, currency, quantity it is quoted at)."""

    quantity = order_quantity(wanted, offer["moq"], offer["order_multiple"])
    if not offer["currency"]:
        return None, "", quantity
    price = unit_price_at(breaks_of(offer), moq=offer["moq"], order_multiple=offer["order_multiple"], wanted=wanted, up_to=offer.get("price_up_to"))
    return (format(price.normalize(), "f") if price is not None else None), offer["currency"], quantity


@dataclass(frozen=True, slots=True)
class Quote:
    price: Decimal  # per piece, in the base currency
    native: Decimal  # per piece, in the offer's currency
    currency: str
    quantity: int  # what must be ordered
    within: bool  # the minimum order is not above the wanted quantity
    holds: bool  # there is stock to order from: it covers the minimum order
    covers: bool  # the stock covers what must be ordered
    lead_days: int | None
    connector_id: str
    offer: Mapping[str, Any] = field(compare=False, repr=False)

    @property
    def cost(self) -> Decimal:
        """What the order costs in the base currency."""

        return self.price * self.quantity


def quote(offer: Mapping[str, Any], wanted: int, base: str, rates: Rates | None) -> Quote | None:
    """The offer priced at ``wanted`` in the base currency, or None when it is marketplace stock, has no price there, or its currency
    has no rate (without ``rates`` only offers in the base currency are priced)."""

    if offer["marketplace"] or not offer["currency"]:
        return None
    native = unit_price_at(breaks_of(offer), moq=offer["moq"], order_multiple=offer["order_multiple"], wanted=wanted, up_to=offer.get("price_up_to"))
    if native is None:
        return None
    converted = rates.convert(native, offer["currency"], base) if rates is not None else (native if offer["currency"] == base else None)
    if converted is None:
        return None
    quantity = order_quantity(wanted, offer["moq"], offer["order_multiple"])
    lead = offer.get("lead_time_days")
    return Quote(
        price=converted, native=native, currency=offer["currency"], quantity=quantity, within=offer["moq"] <= wanted,
        holds=int(offer["stock"] or 0) >= max(int(offer["moq"] or 1), 1), covers=int(offer["stock"] or 0) >= quantity, lead_days=int(lead) if lead else None, connector_id=offer["connector_id"], offer=offer,
    )


ORDERABLE, BACKORDER, LISTED = "orderable", "backorder", "listed"


def best_offer(quotes: Sequence[Quote], preferred: Sequence[str] = ()) -> tuple[Quote | None, str | None]:
    """The quote to buy and its kind. ``orderable``: the cheapest whose stock covers the order, else the cheapest with stock to order
    from; with ``preferred`` (connector ids, most preferred first) the first of them covering it wins before price does.
    ``backorder``: none has stock, so the cheapest that quotes a lead time. ``listed``: the cheapest of all. Cheapest is what the
    order costs in the base currency, so a full reel only wins when it costs less than the pieces wanted."""

    covering = [found for found in quotes if found.covers]
    for connector_id in preferred:
        mine = [found for found in covering if found.connector_id == connector_id]
        if mine:
            return min(mine, key=lambda found: found.cost), ORDERABLE
    tiers = (
        (ORDERABLE, covering), (ORDERABLE, [found for found in quotes if found.holds]),
        (BACKORDER, [found for found in quotes if found.lead_days]), (LISTED, list(quotes)),
    )
    for kind, group in tiers:
        if group:
            return min(group, key=lambda found: found.cost), kind
    return None, None


def unrated(offers: Sequence[Mapping[str, Any]], base: str, rates: Rates | None) -> list[str]:
    """Currencies of priced offers that cannot be converted to ``base`` for want of a rate."""

    priced = {offer["currency"] for offer in offers if offer["currency"] and not offer["marketplace"] and offer["price_breaks"]}
    return sorted(
        currency for currency in priced
        if currency != base and (rates is None or rates.convert(Decimal(1), currency, base) is None)
    )
