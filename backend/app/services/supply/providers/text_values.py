"""Reading numbers that distributors send as display text.

Some APIs return stock as "1,234 In Stock" and prices as "0,52 EUR" or "$1,234.50",
formatted for a locale. These helpers turn that text into numbers without
guessing more than they must, and return None when the text holds no number.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

_NUMBER = re.compile(r"\d[\d.,\s\u00a0\u202f']*")


def _normalise(digits: str) -> str:
    """One numeral with ``.`` as the decimal point and no grouping."""

    text = re.sub(r"[\s\u00a0\u202f']", "", digits).rstrip(".,")
    if "," in text and "." in text:
        # Whichever comes last is the decimal point.
        if text.rfind(",") > text.rfind("."):
            return text.replace(".", "").replace(",", ".")
        return text.replace(",", "")
    for mark in (",", "."):
        if mark in text:
            whole, _, rest = text.rpartition(mark)
            # One mark followed by exactly three digits, after a non-zero whole part,
            # is grouping ("1,234"); anything else is a decimal point ("0,52", "1.5").
            if text.count(mark) > 1 or (len(rest) == 3 and whole not in ("", "0")):
                return text.replace(mark, "")
            return text.replace(mark, ".")
    return text


def parse_decimal(text: object) -> Decimal | None:
    if text is None:
        return None
    if isinstance(text, Decimal):
        return text  # already a number: "1.476" as text would read as a thousand and more
    if isinstance(text, (int, float)) and not isinstance(text, bool):
        return Decimal(str(text))
    match = _NUMBER.search(str(text))
    if not match:
        return None
    try:
        return Decimal(_normalise(match.group(0)))
    except InvalidOperation:
        return None


def parse_count(text: object) -> int | None:
    """A whole count (stock, quantity). A decimal is rounded down; negative counts are not counts."""

    value = parse_decimal(text)
    if value is None or value < 0:
        return None
    return int(value)


# Unit words by language, from what Mouser sends: the text follows the account's locale
# ("140 Giorni"). A unit that is not here gives no lead time rather than a wrong one.
_DAY_WORDS = ("day", "giorn", "tag", "jour", "dia", "dni", "dag")
_WEEK_WORDS = ("week", "settiman", "woche", "semain", "seman", "tygod", "weken")


def parse_lead_time_days(text: object) -> int | None:
    """``"84 Days"``, ``"12 Weeks"``, ``"140 Giorni"`` or ISO-8601 ``"P5W"`` as days."""

    if text is None:
        return None
    raw = str(text).strip()
    iso = re.fullmatch(r"P(\d+)([DW])", raw, flags=re.IGNORECASE)
    if iso:
        return int(iso.group(1)) * (7 if iso.group(2).upper() == "W" else 1)
    amount = parse_count(raw)
    if amount is None:
        return None
    unit = re.sub(r"[\d.,\s\u00a0\u202f]+", " ", raw).strip().lower()
    if not unit or any(unit.startswith(word) for word in _DAY_WORDS):
        return amount
    if any(unit.startswith(word) for word in _WEEK_WORDS):
        return amount * 7
    return None
