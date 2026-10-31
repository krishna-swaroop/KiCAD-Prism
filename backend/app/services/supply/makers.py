"""Whether two manufacturer spellings name the same maker.

Distributors spell one maker several ways ("KOA", "KOA Speer", "KOA Speer Electronics, Inc."), and a different maker can
share a part number (clones sold by UMW or TECH PUBLIC as onsemi's FDN308P). So the question is never whether two spellings
are equal, but whether they are the same maker.

The rules, none of which look at a part number:

1. Same key (``alias_key``: case, punctuation, ``&`` and a trailing legal form are ignored).
2. A known alias: both spellings are listed for one maker in ``SEEDED`` (or the caller's own aliases).
3. One spelling's words start the other's ("KOA" / "KOA Speer", "Stanley" / "Stanley Electric").
4. One spelling's words are inside the other's, whole words in a row ("Maxim Integrated" in "Analog Devices Inc./Maxim
   Integrated"), unless they are only generic words ("Semiconductor", "Electronics").
5. One spelling is the initials of the other's words, 2 to 4 letters ("TI" / "Texas Instruments", "ADI" / "Analog Devices
   Inc"). A person's or a seeded alias wins over this: it is only a guess.

Anything else is a different maker.
"""

from __future__ import annotations

import re
import time
import unicodedata
from typing import Callable, Mapping

from app.services.supply.identity import alias_key

# Usual spellings of large makers, as `alias_key`s. Only spellings of one maker's name: a maker that was bought (Linear,
# Maxim, Fairchild) is its own maker here, and each part settles on its distributors' evidence.
SEEDED: tuple[tuple[str, ...], ...] = (
    ("texas instruments", "ti", "texas instruments incorporated"),
    ("stmicroelectronics", "st", "stmicro", "st microelectronics", "st microelectronics group"),
    ("onsemi", "on semiconductor", "on semi"),
    ("nxp", "nxp semiconductors", "nxp usa"),
    ("microchip technology", "microchip"),
    ("analog devices", "adi"),
    ("infineon technologies", "infineon"),
    ("renesas electronics", "renesas"),
    ("vishay", "vishay intertechnology", "vishay siliconix", "vishay dale", "vishay semiconductors", "siliconix"),
    ("murata", "murata electronics", "murata manufacturing", "murata electronics north america"),
    ("yageo", "yageo corporation", "yageo america"),
    ("tdk", "tdk corporation", "tdk electronics"),
    ("kemet", "kemet electronics", "kemet corporation"),
    ("bourns", "bourns electronics", "bourns inc"),
    ("wurth elektronik", "wurth", "wuerth elektronik", "w rth elektronik"),
    ("nexperia", "nexperia usa"),
    ("diodes incorporated", "diodes", "diodes inc"),
    ("rohm semiconductor", "rohm", "rohm co"),
    ("toshiba", "toshiba semiconductor and storage", "toshiba electronic devices and storage"),
    ("littelfuse", "littelfuse inc"),
    ("te connectivity", "te", "tyco electronics"),
    ("molex", "molex connector", "molex llc"),
    ("amphenol", "amphenol icc"),
    ("samsung electro mechanics", "samsung", "samsung electro-mechanics"),
    ("panasonic", "panasonic electronic components", "panasonic industrial devices"),
    ("koa speer", "koa", "koa speer electronics"),
    ("stanley electric", "stanley"),
    ("skyworks solutions", "skyworks"),
    ("silicon labs", "silicon laboratories"),
    ("espressif systems", "espressif"),
    ("nordic semiconductor", "nordic"),
    ("semtech", "semtech corporation"),
    ("monolithic power systems", "mps"),
    ("lite on", "liteon", "lite-on"),
    ("cui devices", "cui"),
    ("traco power", "traco"),
    ("ecs", "ecs inc", "ecs inc international"),
    ("rfmi", "rf monolithics"),
    ("tai saw", "tst", "tai saw technology"),
)

# Words that name a kind of company, not a company: sharing one says nothing.
GENERIC = frozenset({
    "semiconductor", "semiconductors", "electronics", "electronic", "technology", "technologies", "components", "component",
    "devices", "device", "systems", "system", "group", "international", "industries", "industrial", "microelectronics",
    "solutions", "power", "products", "usa", "america", "america's", "co", "company", "the", "and",
})

_WORD = re.compile(r"[a-z0-9�]+")
_REPLACED = "�"  # a letter some distributor's encoding lost ("W?rth Elektronik")


def _fold(text: str) -> str:
    """Letters without accents ("Wurth" for the umlaut spelling), so spellings compare on what they say."""

    return "".join(ch for ch in unicodedata.normalize("NFKD", text) if not unicodedata.combining(ch))


def _words(name: str) -> list[str]:
    return _WORD.findall(_fold(alias_key(name)))


def _raw_words(name: str) -> list[str]:
    """The words including a trailing legal form, for initials ("Analog Devices Inc" is ADI)."""

    return _WORD.findall(_fold(name.casefold().replace("&", " and ")))


def _close(one: str, two: str) -> bool:
    """The same word allowing for one lost letter, one wrong letter or one extra letter in a long word ("Renasas")."""

    if one == two:
        return True
    if _REPLACED in one or _REPLACED in two:
        pattern = re.compile("^" + "".join("." if ch == _REPLACED else re.escape(ch) for ch in one) + "$")
        return bool(pattern.match(two)) or (_REPLACED in two and bool(re.compile("^" + "".join("." if ch == _REPLACED else re.escape(ch) for ch in two) + "$").match(one)))
    if min(len(one), len(two)) < 6 or abs(len(one) - len(two)) > 1:
        return False
    if len(one) == len(two):
        return sum(a != b for a, b in zip(one, two)) == 1
    shorter, longer = sorted((one, two), key=len)
    return any(longer[:index] + longer[index + 1:] == shorter for index in range(len(longer)))


def _same_words(first: list[str], second: list[str]) -> bool:
    return len(first) == len(second) and all(_close(a, b) for a, b in zip(first, second))


def _canonical() -> dict[str, str]:
    found: dict[str, str] = {}
    for group in SEEDED:
        head = alias_key(group[0])
        for spelling in group:
            found.setdefault(alias_key(spelling), head)
    return found


_DEFAULT = _canonical()
# What same_maker consults. It starts as the list above and is replaced by the database's (``refresh``), which an administrator edits.
_CANON: dict[str, str] = dict(_DEFAULT)
_loaded_at = 0.0
_TTL = 30.0


def default_spellings() -> tuple[tuple[str, ...], ...]:
    return SEEDED


def refresh(conn, *, force: bool = False) -> None:
    """Load the known spellings from the database, at most every half minute (at once with ``force``)."""

    global _CANON, _loaded_at
    now = time.monotonic()
    if not force and now - _loaded_at < _TTL:
        return
    # Before the migration that makes the table (an older schema being brought up) the list in this file stands.
    exists = conn.execute("SELECT to_regclass('supply_maker_seeds') AS found").fetchone()["found"] is not None
    rows = conn.execute("SELECT alias_key, group_key FROM supply_maker_seeds").fetchall() if exists else []
    _CANON = {row["alias_key"]: row["group_key"] for row in rows} if rows else dict(_DEFAULT)
    _loaded_at = now


def _contains(longer: list[str], shorter: list[str]) -> bool:
    size = len(shorter)
    return size > 0 and any(longer[start:start + size] == shorter for start in range(len(longer) - size + 1))


def _initials(words: list[str]) -> str:
    return "".join(word[0] for word in words if word not in {"and", "the", "of"})


def might_be_same(first: str, second: str) -> bool:
    """A weaker question than ``same_maker``: whether two spellings share a distinctive word or a leading run of letters, so
    a person is worth asking. "Microdiode Semiconductor" and "Nexperia" share nothing; "TAI-SAW" and "TAI-SAW Technology" do."""

    one, two = _words(first), _words(second)
    if not one or not two:
        return False
    shared = {word for word in one if word not in GENERIC and len(word) >= 3} & {word for word in two if word not in GENERIC and len(word) >= 3}
    if shared:
        return True
    a, b = "".join(one), "".join(two)
    return min(len(a), len(b)) >= 3 and (a.startswith(b[:3]) or b.startswith(a[:3]))


def same_maker(first: str, second: str, canonical: Callable[[str], str | None] | Mapping[str, str] | None = None) -> bool:
    """Whether two spellings name one maker. Blank is never the same as anything."""

    one, two = alias_key(first), alias_key(second)
    if not one or not two:
        return False
    if one == two:
        return True
    lookup = canonical if callable(canonical) else (canonical.get if canonical else None)
    for table in (_CANON.get, lookup):
        if table is None:
            continue
        a, b = table(one), table(two)
        if a and b and a == b:
            return True
    short, long_ = sorted((_words(first), _words(second)), key=len)
    if _same_words(short, long_):
        return True
    if short and short != long_ and short == long_[:len(short)]:
        return not all(word in GENERIC for word in short)
    if short and len(short) < len(long_) and _contains(long_, short) and not all(word in GENERIC for word in short):
        return True
    # A person's alias outranks this guess, so it only runs when neither is a known alias of another maker.
    for letters, name in ((one, second), (two, first)):
        if " " not in letters and 2 <= len(letters) <= 4 and letters.isalpha():
            if letters in _CANON and _CANON[letters] != canonical_key(name):
                continue  # "TI" is Texas Instruments, not whoever else has those initials
            if letters in (_initials(_words(name)), _initials(_raw_words(name))):
                return True
    return False


def canonical_key(name: str) -> str:
    """The seeded maker a spelling belongs to, or its own key."""

    key = alias_key(name)
    return _CANON.get(key, key)
