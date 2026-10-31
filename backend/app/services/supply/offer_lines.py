"""A part's offers as the detailed list shows them: a line for each way of buying, the followed one first.

A distributor lists a part as several products and the list shows each: DigiKey's Cut Tape (``-1-ND``), Tape & Reel (``-2-ND``)
and Digi-Reel (``-6-ND``) are three lines, even where two share their prices. Two things are read from the price breaks, because
a distributor's own words are about the product, not the sale (seen live for ``ABS07-32.768KHZ-7-T``):

* Mouser has one number whose single price table covers cut tape, MouseReel and a full reel of 3,000. The reel is a second way
  of buying: it starts at the reel size, with the prices from there up.
* LCSC and TME name the standard packaging ("Reel", 3,000) yet sell from one piece, so a reel is only a reel where the first
  price break reaches the reel size (``packaging_hints.sold_as``).

In each distributor the followed listing comes first (the preferred one, else the smallest order that is in stock), then the
others by smallest order and lowest price at it. Nothing is dropped.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.services.supply.fx import Rates
from app.services.supply.providers import packaging_hints
from app.services.supply.vocabulary import Packaging


def packaging_of(offer: dict[str, Any]) -> dict[str, Any]:
    """The packaging as stated, or a guess from the number and the order terms (marked as one) where the distributor says nothing."""

    stated = offer["packaging"] or Packaging.UNKNOWN.value
    if packaging_hints.standard(offer["provider"]) and stated == Packaging.TAPE_REEL.value:
        first = int(offer["price_breaks"][0][0]) if offer["price_breaks"] else None
        sold, reel, worked_out = packaging_hints.sold_as(Packaging.TAPE_REEL, offer["reel_size"], first)
        return {"packaging": sold.value, "reel_size": reel, "packaging_inferred": worked_out or bool(offer["packaging_inferred"])}
    if stated != Packaging.UNKNOWN.value or not packaging_hints.guesses(offer["provider"]):
        return {"packaging": stated, "reel_size": offer["reel_size"], "packaging_inferred": bool(offer["packaging_inferred"])}
    first = int(offer["price_breaks"][0][0]) if offer["price_breaks"] else None
    guess = packaging_hints.infer(str(offer["sku"]), int(offer["moq"] or 0), int(offer["order_multiple"] or 0), first)
    return {"packaging": guess.value, "reel_size": None, "packaging_inferred": guess is not Packaging.UNKNOWN}


def _line(offer: dict[str, Any]) -> dict[str, Any]:
    return {
        "connector_id": offer["connector_id"], "provider": offer["provider"], "name": offer["connector_name"], "sku": offer["sku"],
        "skus": [offer["sku"]], "also_packaging": [], "followed": bool(offer.get("followed")),
        "stock": int(offer["stock"] or 0), "moq": int(offer["moq"] or 0), **packaging_of(offer),
        "product_url": offer["product_url"] or "",
        "currency": offer["currency"] or "", "price_breaks": [[int(quantity), str(price)] for quantity, price in offer["price_breaks"] or []],
    }


def _first_price(line: dict[str, Any]) -> Decimal:
    return Decimal(line["price_breaks"][0][1]) if line["price_breaks"] else Decimal("Infinity")


def _lines(offers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [_line(offer) for offer in offers]


def _split_reel(line: dict[str, Any]) -> list[dict[str, Any]]:
    """A number sold as several packagings with one price table has a full reel in it where the prices pass the reel size."""

    reel = line["reel_size"]
    if line["packaging"] != Packaging.SEVERAL.value or not reel:
        return [line]
    small = [item for item in line["price_breaks"] if item[0] < reel]
    full = [item for item in line["price_breaks"] if item[0] >= reel]
    if not small or not full:
        return [line]
    # The reel is a way of buying on its own, from its size up. The cut length and the distributor's custom reel come before it.
    cut = {**line, "packaging": Packaging.CUT_TAPE.value, "also_packaging": [Packaging.CUSTOM_REEL.value], "reel_size": None, "price_breaks": small}
    whole = {**line, "followed": False, "packaging": Packaging.TAPE_REEL.value, "also_packaging": [], "moq": max(line["moq"], int(reel)), "price_breaks": full}
    return [cut, whole]


def offer_lines(offers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The lines of the detailed list for these offers (one distributor's or several), by distributor and number."""

    lines = [part for line in _lines(offers) for part in _split_reel(line)]
    # By distributor; in each, the followed listing first, then the smallest order, then the lowest price at it.
    return sorted(lines, key=lambda line: (line["name"].lower(), not line["followed"], line["moq"], _first_price(line), line["sku"]))


PLACES = Decimal("0.0001")


def in_base(lines: list[dict[str, Any]], base: str, rates: Rates) -> list[dict[str, Any]]:
    """The lines with their prices in the workspace currency too (``base_price_breaks``), so the detailed list reads in one
    currency like the summary row. A line whose currency has no rate keeps ``None`` and shows its own prices."""

    out = []
    for line in lines:
        converted = [rates.convert(Decimal(price), line["currency"], base) for _quantity, price in line["price_breaks"]] if line["currency"] else []
        known = bool(converted) and all(value is not None for value in converted)
        out.append({
            **line, "base_currency": base,
            "base_price_breaks": [[quantity, str(value.quantize(PLACES))] for (quantity, _price), value in zip(line["price_breaks"], converted)] if known else None,
        })
    return out
