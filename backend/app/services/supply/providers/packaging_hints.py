"""What a listing's packaging is, when the distributor does not say it in a field Prism can read.

Every adapter reads the field its distributor sends (``Offer.packaging``, ``Offer.reel_size``). When there is none, the
listing is read for clues: a SKU ending DigiKey and others use (``-1-ND``, ``CT``, ``TR``, ``DKR``, ``RL``), or a minimum
order that is a whole reel ordered in that multiple. A packaging found this way is marked ``packaging_inferred`` so the
screens show it as a guess and the automatic pick never counts it as certain.
"""

from __future__ import annotations

import re

from app.services.supply.vocabulary import Packaging

# DigiKey's own numbering: the digit before "-ND" names the packaging of the same product.
_DIGIKEY_DIGIT = {"1": Packaging.CUT_TAPE, "2": Packaging.TAPE_REEL, "6": Packaging.CUSTOM_REEL}
_ENDINGS = (
    (re.compile(r"(?:^|[-_/])CT$"), Packaging.CUT_TAPE),
    (re.compile(r"(?:^|[-_/])TR$"), Packaging.TAPE_REEL),
    (re.compile(r"(?:^|[-_/])RL$"), Packaging.TAPE_REEL),
    (re.compile(r"(?:^|[-_/])DKR$"), Packaging.CUSTOM_REEL),
)
def guesses(provider: str) -> bool:
    """Whether packaging this provider does not state is guessed (``ProviderSpec.guesses_packaging``). An unknown provider's is."""

    spec = _spec(provider)
    return spec is None or spec.guesses_packaging


def standard(provider: str) -> bool:
    """Whether this provider states the product's standard packaging (``ProviderSpec.standard_packaging``)."""

    spec = _spec(provider)
    return spec is not None and spec.standard_packaging


def _spec(provider: str):
    # Read when asked: the adapters import this module, and the registry imports them.
    from app.services.supply.providers import registry

    try:
        return registry.get_spec(provider)
    except registry.UnknownProvider:
        return None


# A minimum order of at least this many, ordered in that multiple, is a reel.
REEL_MOQ = 1000

_TEXT = (
    ("custom reel", Packaging.CUSTOM_REEL),
    ("digi-reel", Packaging.CUSTOM_REEL),
    ("mousereel", Packaging.CUSTOM_REEL),
    ("cut tape", Packaging.CUT_TAPE),
    ("full reel", Packaging.TAPE_REEL),
    ("tape & reel", Packaging.TAPE_REEL),
    ("tape and reel", Packaging.TAPE_REEL),
    ("reel", Packaging.TAPE_REEL),
    ("tray", Packaging.TRAY),
    ("tube", Packaging.TUBE),
    ("stick", Packaging.TUBE),
    ("bulk", Packaging.BULK),
    ("bag", Packaging.BULK),
)


def from_text(text: object) -> Packaging:
    """A packaging named in words, in English. UNKNOWN when the words say nothing Prism knows."""

    value = str(text or "").strip().lower()
    if not value:
        return Packaging.UNKNOWN
    for needle, packaging in _TEXT:
        if needle in value:
            return packaging
    return Packaging.OTHER


def sold_as(packaging: Packaging, reel_size: int | None, first_break: int | None) -> tuple[Packaging, int | None, bool]:
    """How a listing is sold, from its price breaks, when its distributor names the product's standard packaging, not the sale.

    LCSC's ``productArrange`` and TME's packing say how the maker ships the part ("Reel", 3,000), yet both sell from one piece up:
    the pieces come off a reel as cut tape. What is sold is told by the first price break: from the reel size up it is a
    whole reel; below it, cut tape (marked as a reading, not a statement). Returns the packaging, the reel size and whether
    it was worked out."""

    if packaging is Packaging.TAPE_REEL and reel_size and first_break is not None and first_break < reel_size:
        return Packaging.CUT_TAPE, None, True
    return packaging, reel_size, False


def infer(sku: str, moq: int, order_multiple: int, first_break: int | None = None) -> Packaging:
    """A guess from the SKU and the order terms, or UNKNOWN. ``first_break`` is the quantity of the first price break."""

    code = sku.strip().upper()
    match = re.search(r"-(\d)-ND$", code)
    if match and match.group(1) in _DIGIKEY_DIGIT:
        return _DIGIKEY_DIGIT[match.group(1)]
    for pattern, packaging in _ENDINGS:
        if pattern.search(code):
            return packaging
    if moq >= REEL_MOQ and order_multiple == moq:
        return Packaging.TAPE_REEL
    # Priced only from a whole reel up: nothing smaller is sold.
    if moq >= REEL_MOQ and first_break == moq:
        return Packaging.TAPE_REEL
    return Packaging.UNKNOWN
