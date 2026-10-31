"""The one vocabulary every supply surface uses.

Status, lifecycle and packaging values are stored and sent as these strings.
Providers map their own wording into them; nothing downstream sees raw
provider text.
"""

from __future__ import annotations

from enum import StrEnum


class Status(StrEnum):
    """Health of a part, line or BOM. ``UNKNOWN`` means no data, not good."""

    OK = "ok"
    WARNING = "warning"
    ERROR = "error"
    FATAL = "fatal"
    UNKNOWN = "unknown"


class Lifecycle(StrEnum):
    """Manufacturer lifecycle. Distributor discontinuation is not part of it."""

    ACTIVE = "active"
    NRND = "nrnd"
    LAST_TIME_BUY = "last_time_buy"
    OBSOLETE = "obsolete"
    UNKNOWN = "unknown"


# A manufacturer lifecycle that says the part is going: not for new designs, a last date to buy, or gone. As values, so it serves
# Python tests and SQL parameters alike.
ENDING_LIFECYCLES: tuple[str, ...] = (Lifecycle.NRND.value, Lifecycle.LAST_TIME_BUY.value, Lifecycle.OBSOLETE.value)

# Most urgent first, for putting the parts that need a look at the top of a list.
STATUS_ORDER = (Status.FATAL, Status.ERROR, Status.WARNING, Status.UNKNOWN, Status.OK)
# Most severe first: the one lifecycle shown for a part whose offers give several.
_LIFECYCLE_SEVERITY = (Lifecycle.OBSOLETE, Lifecycle.LAST_TIME_BUY, Lifecycle.NRND, Lifecycle.ACTIVE, Lifecycle.UNKNOWN)


def worst_lifecycle(lifecycles) -> Lifecycle:
    seen = set(lifecycles)
    return next((lifecycle for lifecycle in _LIFECYCLE_SEVERITY if lifecycle in seen), Lifecycle.UNKNOWN)


class Packaging(StrEnum):
    CUT_TAPE = "cut_tape"
    # A reel cut to the quantity asked, with a reeling fee (DigiKey Digi-Reel, Mouser MouseReel).
    CUSTOM_REEL = "custom_reel"
    TAPE_REEL = "tape_reel"
    TRAY = "tray"
    TUBE = "tube"
    BULK = "bulk"
    OTHER = "other"
    # One listing sold as several packagings together (Mouser's usual case).
    SEVERAL = "several"
    UNKNOWN = "unknown"
