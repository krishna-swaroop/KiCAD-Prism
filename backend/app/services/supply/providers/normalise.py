"""What several distributors' answers share, read one way: price breaks, RoHS wording and packaging words.

What is a distributor's own (its field names, its codes such as Farnell's "Y-EX") stays in its adapter, which hands the
values here. A word none of these knows comes back as unknown; the adapter decides whether to note it (``unrecognised``).
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Iterable

from app.services.supply.models import PriceBreak
from app.services.supply.providers.text_values import parse_count, parse_decimal
from app.services.supply.vocabulary import Packaging


def price_breaks(tiers: Iterable[tuple[object, object]], *, free: bool = True) -> tuple[PriceBreak, ...]:
    """Price breaks from (quantity, unit price) pairs as a distributor writes them ("1,000", "€0,52", or numbers): ascending, the
    first price given for a quantity kept. A pair without a quantity or a price, or with a negative price, is left out, and a
    zero price too when ``free`` is False (a distributor that writes 0 for "ask us")."""

    found: dict[int, Decimal] = {}
    for quantity_text, price_text in tiers:
        quantity, price = parse_count(quantity_text), parse_decimal(price_text)
        if not quantity or price is None or price < 0 or (price == 0 and not free):
            continue
        found.setdefault(quantity, price)
    return tuple(PriceBreak(quantity, found[quantity]) for quantity in sorted(found))


_NOT_COMPLIANT = re.compile(r"(^|\W)non[- ]?(rohs|compliant)|not compliant|^(no|n)$")


def rohs_word(text: object) -> bool | None:
    """RoHS from plain wording ("RoHS Compliant", "Non-Compliant", "Yes", "N"): None when it says neither, or nothing."""

    value = " ".join(str(text or "").lower().split())
    if not value or value == "unknown":
        return None
    if _NOT_COMPLIANT.search(value):
        return False
    return True if "compliant" in value or value in ("yes", "y") else None


# Most specific first: a custom reel before a reel, cut tape before the reel it was cut from.
_PACKAGING_WORDS: tuple[tuple[str, Packaging], ...] = (
    ("digi-reel", Packaging.CUSTOM_REEL),
    ("mousereel", Packaging.CUSTOM_REEL),
    ("custom reel", Packaging.CUSTOM_REEL),
    ("cut", Packaging.CUT_TAPE),
    ("reel", Packaging.TAPE_REEL),
    ("tray", Packaging.TRAY),
    ("tube", Packaging.TUBE),
    ("stick", Packaging.TUBE),
    ("bulk", Packaging.BULK),
    ("bag", Packaging.BULK),
    ("box", Packaging.BULK),
)


def packaging_word(text: object) -> Packaging:
    """The packaging a distributor's word names ("Cut Tape (CT)", "Tape & Reel", "MouseReel", "Tube"), else unknown."""

    value = str(text or "").strip().lower()
    return next((packaging for word, packaging in _PACKAGING_WORDS if word in value), Packaging.UNKNOWN) if value else Packaging.UNKNOWN


def link(text: object) -> str:
    """A web address as a distributor writes it, made absolute: one that starts ``//`` (DigiKey's datasheets) gets ``https:``.
    Anything that is not a web address is dropped."""

    value = str(text or "").strip()
    if value.startswith("//"):
        value = f"https:{value}"
    return value if value.lower().startswith(("https://", "http://")) else ""
