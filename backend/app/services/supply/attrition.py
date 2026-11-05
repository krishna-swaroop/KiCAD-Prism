"""Spares by kind of part. Small passives are lost on the pick-and-place machine and in handling; a fine-pitch IC is not
placed from a loose reel, so it gets none by default.

The class comes from the footprint's name on the BOM line (``R_0603_1608Metric``, ``C_0402``); a line without one is ``other``.
Used when a caller asks for spares "by package" instead of one percent for everything; the percent of each class is the workspace's
(``settings.Spares``).
"""

from __future__ import annotations

import re
from typing import Mapping

SMALL_PASSIVE = "small_passive"
OTHER = "other"

_SIZE = re.compile(r"(?<!\d)(01005|0201|0402|0603)(?!\d)")
_PASSIVE_PREFIX = re.compile(r"^(r|c|l|fb|led|d|resistor|capacitor|inductor|ferrite)[_\- ]", re.IGNORECASE)


def class_of(footprint: str) -> str:
    """``small_passive`` for a resistor, capacitor, inductor, ferrite, diode or LED in a 01005 to 0603 package, else ``other``."""

    name = footprint.strip().rsplit(":", 1)[-1]
    return SMALL_PASSIVE if _PASSIVE_PREFIX.match(name) and _SIZE.search(name) else OTHER


def percent_for(footprint: str, table: Mapping[str, float]) -> float:
    return table.get(class_of(footprint), 0.0)
