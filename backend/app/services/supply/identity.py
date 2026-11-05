"""Part identity helpers shared by every supply feature.

``match_key`` is for lookup only. It is never displayed and never replaces the
catalog's own identity (``normalize_identity_value``: trim and lowercase).

The rule is deliberately conservative. Two part numbers that differ in a
character that carries meaning must not collide: dots and slashes stay, so
``1.0UF`` and ``10UF`` are different keys. Only whitespace, hyphens and
underscores are ignored, because distributors and people disagree about them
(``LM358-D`` and ``LM358D``) far more often than they mean different parts.
"""

from __future__ import annotations

import re
import unicodedata

# Hyphen-like characters by code point (hyphen, non-breaking hyphen, figure dash,
# en dash, em dash, minus sign), so this file holds no ambiguous glyphs.
_DASH_CODES = (0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2212)
_IGNORED = re.compile(r"[\s_\-" + "".join(map(chr, _DASH_CODES)) + r"]+")


def match_key(part_number: str) -> str:
    """The lookup key for a manufacturer part number. Empty for blank input."""

    return _IGNORED.sub("", unicodedata.normalize("NFKC", part_number or "")).upper()


# Legal-form words dropped from the end of a manufacturer name. Only these:
# "TI" and "Texas Instruments" stay different until a person confirms the alias.
_LEGAL_FORMS = frozenset({
    "inc", "incorporated", "corp", "corporation", "co", "company", "ltd", "limited", "llc", "plc",
    "gmbh", "ag", "sa", "bv", "nv", "srl", "spa", "ab", "as", "oy", "kg", "kk", "pte", "pty",
})
_PUNCTUATION = re.compile(r"[.,;:'\"()\[\]!?]")


def alias_key(name: str) -> str:
    """The key under which a manufacturer spelling is looked up. Blank for blank input.

    Case, punctuation, ``&`` and trailing legal forms are ignored, so
    ``Texas Instruments Inc.`` and ``TEXAS INSTRUMENTS`` share a key.
    """

    text = unicodedata.normalize("NFKC", name or "").casefold().replace("&", " and ")
    words = _PUNCTUATION.sub(" ", text).replace("-", " ").split()
    while len(words) > 1 and words[-1] in _LEGAL_FORMS:
        words.pop()
    return " ".join(words)


FAMILY_EXTRA = 8
FAMILY_MAX = 10


def keep_family(items, wanted: str, number_of):
    """What a search answer keeps for the asked number key: every item with that number, then up to ``FAMILY_MAX`` of the
    same number with up to ``FAMILY_EXTRA`` more characters (``74AHC1G09GV`` -> ``74AHC1G09GV,125``), shortest first.

    Distributors list orderable numbers longer than the base number a catalog keeps. The longer ones are kept as near
    listings, never counted unless a person or a known suffix says so."""

    exact, family = [], []
    for item in items:
        key = match_key(number_of(item))
        if key == wanted:
            exact.append(item)
        elif key.startswith(wanted) and 0 < len(key) - len(wanted) <= FAMILY_EXTRA:
            family.append((len(key), item))
    family.sort(key=lambda pair: pair[0])
    return exact + [item for _, item in family[:FAMILY_MAX]]
