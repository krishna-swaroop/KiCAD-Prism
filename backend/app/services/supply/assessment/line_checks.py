"""Findings about how a BOM line names its part, not about the part itself."""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Any, Mapping, Sequence

from app.services.supply import params
from app.services.supply.assessment import settings as ids
from app.services.supply.assessment.checks import Finding
from app.services.supply.assessment.settings import DEFAULTS, AssessmentSettings


def manufacturer_missing(settings: AssessmentSettings = DEFAULTS) -> Finding:
    """The line gives a part number but no manufacturer; the part was found by number alone."""

    return Finding(
        ids.MANUFACTURER_MISSING,
        settings.severity_of(ids.MANUFACTURER_MISSING),
        "The BOM line has no manufacturer. The part was found by its number alone.",
        "manufacturer_missing",
    )


def not_in_library(settings: AssessmentSettings = DEFAULTS) -> Finding:
    """The part is tracked, but no catalog component has this manufacturer and part number."""

    return Finding(
        ids.NOT_IN_LIBRARY,
        settings.severity_of(ids.NOT_IN_LIBRARY),
        "No component in the library has this manufacturer and part number.",
        "not_in_library",
    )


_VALUE_KEYS = (("resistance", "ohm"), ("capacitance", "farad"), ("inductance", "henry"))
_SIZE = re.compile(r"(?<!\d)(0201|0402|0603|0805|1206|1210|1812|2010|2512)(?!\d)")


def parameter_mismatch(value: str, parameters: Sequence[Mapping[str, Any]], settings: AssessmentSettings = DEFAULTS) -> Finding | None:
    """The symbol's value (such as 10k) against the value the distributor lists, for resistors, capacitors and inductors.

    Raised only when both are read into numbers and differ. A value that does not parse (4k7) says nothing.
    """

    text = value.strip()
    if not text:
        return None
    for key, unit in _VALUE_KEYS:
        listed = next((p for p in parameters if p["key"] == key and p["value"] is not None), None)
        if listed is None:
            continue
        parsed = params.parse_quantity(text, unit)
        if parsed is not None and params.differs(parsed, Decimal(listed["value"])):
            return Finding(
                ids.PARAMETER_MISMATCH, settings.severity_of(ids.PARAMETER_MISMATCH),
                f"The BOM value is {text}; the distributor lists {listed['raw']}.", f"parameter_mismatch:{text}",
            )
        return None
    return None


def package_mismatch(footprint: str, parameters: Sequence[Mapping[str, Any]], settings: AssessmentSettings = DEFAULTS) -> Finding | None:
    """The size in the footprint's name (0603) against the package the distributor lists, when both give one."""

    wanted = _SIZE.search(footprint)
    listed = next((p for p in parameters if p["key"] == "package"), None)
    if wanted is None or listed is None:
        return None
    found = _SIZE.search(listed["raw"])
    if found is None or found.group(1) == wanted.group(1):
        return None
    return Finding(
        ids.PACKAGE_MISMATCH, settings.severity_of(ids.PACKAGE_MISMATCH),
        f"The footprint is {wanted.group(1)}; the distributor lists {listed['raw']}.", f"package_mismatch:{wanted.group(1)}",
    )
