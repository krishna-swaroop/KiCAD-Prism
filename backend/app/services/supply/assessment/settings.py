"""What the assessment weighs, with defaults in code: the ``assessment`` section of the workspace's settings (``supply/settings.py``
keeps it). Every function takes the settings it was given.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Mapping

from app.services.supply.vocabulary import Status

# Check ids. Severity is the default; a workspace can override it per check.
PART_NOT_FOUND = "part_not_found"
OBSOLETE = "obsolete"
NRND = "nrnd"
LAST_TIME_BUY = "last_time_buy"
DISTRIBUTOR_DISCONTINUED = "distributor_discontinued"
NO_DISTRIBUTOR_STOCK = "no_distributor_stock"
INSUFFICIENT_STOCK = "insufficient_stock"
BELOW_THRESHOLD = "below_threshold"
RUNS_OUT_SOON = "runs_out_soon"
LIKELY_OUT = "likely_out"
PRICE_UP = "price_up"
TARGET_PRICE_MISSED = "target_price_missed"
CHANGE_NOTICE = "change_notice"
LEAD_TIME_OVER_THRESHOLD = "lead_time_over_threshold"
ROHS_NONCOMPLIANT = "rohs_noncompliant"
ROHS_DISPUTED = "rohs_disputed"
DATA_STALE = "data_stale"
SINGLE_SOURCE = "single_source"
MANUFACTURER_MISSING = "manufacturer_missing"
NOT_IN_LIBRARY = "not_in_library"
REACH_SVHC = "reach_svhc"
PARAMETER_MISMATCH = "parameter_mismatch"
PACKAGE_MISMATCH = "package_mismatch"
LIFECYCLE_DISAGREEMENT = "lifecycle_disagreement"
PRICE_OUTLIER = "price_outlier"
ENDING_WITHIN_2_YEARS = "ending_within_2_years"

DEFAULT_SEVERITY: Mapping[str, Status] = MappingProxyType({
    PART_NOT_FOUND: Status.ERROR,
    OBSOLETE: Status.FATAL,
    NRND: Status.WARNING,
    LAST_TIME_BUY: Status.WARNING,
    DISTRIBUTOR_DISCONTINUED: Status.WARNING,
    NO_DISTRIBUTOR_STOCK: Status.ERROR,
    INSUFFICIENT_STOCK: Status.ERROR,
    # Stock at or under the level a person set on the part's watch.
    BELOW_THRESHOLD: Status.WARNING,
    # What the stock history and the forecast say is coming: a drain that empties it within the horizon, or the forecast's chance.
    RUNS_OUT_SOON: Status.WARNING,
    LIKELY_OUT: Status.WARNING,
    # The cheapest price rising past the part's limit, or over the target a person set for it.
    PRICE_UP: Status.WARNING,
    TARGET_PRICE_MISSED: Status.WARNING,
    # An open change notice on the part; an error when its last time buy is close.
    CHANGE_NOTICE: Status.WARNING,
    LEAD_TIME_OVER_THRESHOLD: Status.WARNING,
    ROHS_NONCOMPLIANT: Status.ERROR,
    # Distributors say both: neither is taken as the answer.
    ROHS_DISPUTED: Status.WARNING,
    DATA_STALE: Status.WARNING,
    SINGLE_SOURCE: Status.WARNING,
    MANUFACTURER_MISSING: Status.WARNING,
    # The plan says error; a manufacturer spelled differently in the library would flood a BOM, so it starts as a warning.
    NOT_IN_LIBRARY: Status.WARNING,
    REACH_SVHC: Status.WARNING,
    PARAMETER_MISMATCH: Status.WARNING,
    PACKAGE_MISMATCH: Status.WARNING,
    LIFECYCLE_DISAGREEMENT: Status.WARNING,
    # Prices differ for many reasons; it starts as a note that does not count against health.
    PRICE_OUTLIER: Status.OK,
    # The lifecycle outlook (``outlook.py``) reads more than the lifecycle word: notices, last dates to buy, distributors dropping it.
    ENDING_WITHIN_2_YEARS: Status.WARNING,
})


@dataclass(frozen=True, slots=True)
class AssessmentSettings:
    # Longer than this and a lead time is a finding.
    lead_time_days: int = 84
    # A last date to buy this close, or past, makes a last time buy (or an ending part) an error, and a fatal one once it has passed.
    last_buy_error_days: int = 180
    # A read is late when it is this many hours past when the part's schedule wanted it (a day for a daily part, a week, a month).
    late_hours: int = 48
    severity: Mapping[str, Status] = field(default_factory=lambda: DEFAULT_SEVERITY)

    def severity_of(self, check: str) -> Status:
        return self.severity.get(check, DEFAULT_SEVERITY[check])


DEFAULTS = AssessmentSettings()


CHECK_LABELS: Mapping[str, str] = MappingProxyType({
    PART_NOT_FOUND: "No distributor carries the part number",
    OBSOLETE: "Manufacturer lists it as obsolete",
    NRND: "Not recommended for new designs",
    LAST_TIME_BUY: "Last time buy announced",
    DISTRIBUTOR_DISCONTINUED: "Every distributor dropped it",
    NO_DISTRIBUTOR_STOCK: "No distributor has it in stock",
    INSUFFICIENT_STOCK: "Stock does not cover the build",
    BELOW_THRESHOLD: "Stock at or under the watch's level",
    RUNS_OUT_SOON: "Stock could run out soon at the recent rate",
    LIKELY_OUT: "Likely out of stock everywhere within 4 weeks",
    PRICE_UP: "The cheapest price rose",
    TARGET_PRICE_MISSED: "The price is over the target",
    CHANGE_NOTICE: "A change notice is open",
    LEAD_TIME_OVER_THRESHOLD: "Lead time over the limit",
    ROHS_NONCOMPLIANT: "Not RoHS compliant",
    ROHS_DISPUTED: "Distributors disagree on RoHS",
    DATA_STALE: "A read is late",
    SINGLE_SOURCE: "Only one distributor has it in stock",
    MANUFACTURER_MISSING: "The BOM line has no manufacturer",
    NOT_IN_LIBRARY: "No library component has this part",
    REACH_SVHC: "Affected by REACH (substance of very high concern)",
    PARAMETER_MISMATCH: "The BOM value differs from the distributor's",
    PACKAGE_MISMATCH: "The footprint size differs from the distributor's package",
    LIFECYCLE_DISAGREEMENT: "Distributors disagree on the lifecycle",
    PRICE_OUTLIER: "A distributor's price is far from the others'",
    ENDING_WITHIN_2_YEARS: "A notice or a last date to buy says the part is ending",
})

# Where each check is listed in the settings: one area for every check.
AREAS = ("Lifecycle", "Sourcing", "Stock", "Compliance", "BOM line")
CHECK_AREA: Mapping[str, str] = MappingProxyType({
    OBSOLETE: "Lifecycle", NRND: "Lifecycle", LAST_TIME_BUY: "Lifecycle", DISTRIBUTOR_DISCONTINUED: "Lifecycle",
    LIFECYCLE_DISAGREEMENT: "Lifecycle", ENDING_WITHIN_2_YEARS: "Lifecycle",
    PART_NOT_FOUND: "Sourcing", SINGLE_SOURCE: "Sourcing", LEAD_TIME_OVER_THRESHOLD: "Sourcing", DATA_STALE: "Sourcing", PRICE_OUTLIER: "Sourcing",
    NO_DISTRIBUTOR_STOCK: "Stock", INSUFFICIENT_STOCK: "Stock", BELOW_THRESHOLD: "Stock", RUNS_OUT_SOON: "Stock", LIKELY_OUT: "Stock",
    PRICE_UP: "Sourcing", TARGET_PRICE_MISSED: "Sourcing", CHANGE_NOTICE: "Lifecycle",
    ROHS_NONCOMPLIANT: "Compliance", ROHS_DISPUTED: "Compliance", REACH_SVHC: "Compliance",
    MANUFACTURER_MISSING: "BOM line", NOT_IN_LIBRARY: "BOM line", PARAMETER_MISMATCH: "BOM line", PACKAGE_MISMATCH: "BOM line",
})

# What a workspace may set. "ok" turns a check into a note that does not count against health.
SEVERITY_CHOICES = (Status.OK, Status.WARNING, Status.ERROR, Status.FATAL)
LEAD_TIME_RANGE = (1, 730)
LAST_BUY_ERROR_RANGE = (30, 730)
LATE_HOURS_RANGE = (1, 720)


def to_dto(settings: AssessmentSettings) -> dict:
    return {
        "lead_time_days": settings.lead_time_days,
        "last_buy_error_days": settings.last_buy_error_days,
        "late_hours": settings.late_hours,
        "severity": {check: settings.severity_of(check).value for check in CHECK_LABELS},
    }


def from_dto(payload: Mapping) -> AssessmentSettings:
    """Settings from a validated payload, filling anything missing from the defaults."""

    base = DEFAULTS
    return AssessmentSettings(
        lead_time_days=int(payload.get("lead_time_days", base.lead_time_days)),
        last_buy_error_days=int(payload.get("last_buy_error_days", base.last_buy_error_days)),
        late_hours=int(payload.get("late_hours", base.late_hours)),
        severity=MappingProxyType({
            check: Status(payload.get("severity", {}).get(check, base.severity_of(check).value)) for check in CHECK_LABELS
        }),
    )


def validate(payload: Mapping) -> dict:
    """The payload in its stored form, or a ValueError with a sentence a person can act on."""

    def whole(name: str, label: str, low: int, high: int) -> int:
        value = payload.get(name, getattr(DEFAULTS, name))
        if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
            raise ValueError(f"{label} must be a whole number from {low} to {high}.")
        return value

    severity = payload.get("severity", {})
    if not isinstance(severity, Mapping):
        raise ValueError("Severities must be given by name.")
    allowed = {item.value for item in SEVERITY_CHOICES}
    for check, value in severity.items():
        if check not in CHECK_LABELS:
            raise ValueError(f"Unknown check: {check}.")
        if value not in allowed:
            raise ValueError(f"The severity of {check} must be one of {', '.join(sorted(allowed))}.")
    return {
        "lead_time_days": whole("lead_time_days", "The lead time limit", *LEAD_TIME_RANGE),
        "last_buy_error_days": whole("last_buy_error_days", "The last-date-to-buy limit", *LAST_BUY_ERROR_RANGE),
        "late_hours": whole("late_hours", "The late read limit", *LATE_HOURS_RANGE),
        "severity": {check: severity.get(check, DEFAULTS.severity_of(check).value) for check in CHECK_LABELS},
    }
