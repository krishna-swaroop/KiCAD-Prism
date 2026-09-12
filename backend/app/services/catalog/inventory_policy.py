"""Compatible-unit inventory aggregation, source precedence, and mixed-data flags.

Location rows are the source of truth. Totals are summed only when units are
compatible. Mixed units, statuses, fetch outcomes, and freshness are flagged
instead of collapsing through SQL MIN/MAX. InvenTree outranks CSV; any other
source name stays representable and sorts after those two.

Distributor adapters are out of scope; this module does not name vendors.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Mapping


INVENTORY_SOURCE_PRIORITY: tuple[str, ...] = ("inventree", "csv")
FETCH_STATUS_OK = "ok"
FETCH_STATUS_ERROR = "error"


@dataclass(frozen=True)
class InventoryLocation:
    """One ``inventory_levels`` row before source aggregation."""

    source: str
    location_key: str
    quantity: float
    uom: str
    inventory_status: str
    fetch_status: str
    fetched_at: str


@dataclass(frozen=True)
class InventorySourceAggregate:
    """One source after compatible-unit aggregation."""

    source: str
    quantity: float
    uom: str
    inventory_status: str
    fetch_status: str
    fetched_at: str
    mixed_units: bool
    mixed_status: bool
    mixed_fetch: bool
    mixed_freshness: bool

    def as_payload_row(self) -> dict[str, Any]:
        """Shape used by catalog ``local_inventory`` and supply-source payloads."""

        return {
            "source": self.source,
            "quantity": self.quantity,
            "uom": self.uom,
            "inventory_status": self.inventory_status,
            "fetch_status": self.fetch_status,
            "fetched_at": self.fetched_at,
            "mixed_units": self.mixed_units,
            "mixed_status": self.mixed_status,
            "mixed_fetch": self.mixed_fetch,
            "mixed_freshness": self.mixed_freshness,
        }


def inventory_source_sort_key(source: str) -> tuple[int, str]:
    """InvenTree, then CSV, then every other source name alphabetically."""

    try:
        return (INVENTORY_SOURCE_PRIORITY.index(source), source)
    except ValueError:
        return (len(INVENTORY_SOURCE_PRIORITY), source)


def inventory_location_from_row(row: Mapping[str, Any]) -> InventoryLocation:
    """Parse one location mapping from SQL, JSON, or a test fixture."""

    return InventoryLocation(
        source=str(row.get("source") or ""),
        location_key=str(row.get("location_key") or ""),
        quantity=float(row.get("quantity") or 0),
        uom=str(row.get("uom") or ""),
        inventory_status=str(row.get("inventory_status") or ""),
        fetch_status=str(row.get("fetch_status") or FETCH_STATUS_OK),
        fetched_at=str(row.get("fetched_at") or ""),
    )


def _compatible_unit_key(uom: str) -> str:
    return uom.strip().casefold()


def _normalize_fetch_status(status: str) -> str:
    stripped = status.strip().casefold()
    if stripped in ("", FETCH_STATUS_OK):
        return FETCH_STATUS_OK
    return FETCH_STATUS_ERROR


def aggregate_source_locations(
    source: str, locations: list[InventoryLocation]
) -> InventorySourceAggregate:
    """Aggregate every location of one source."""

    display_uom = ""
    unit_keys: set[str] = set()
    for location in locations:
        key = _compatible_unit_key(location.uom)
        if not key:
            continue
        unit_keys.add(key)
        if not display_uom:
            display_uom = location.uom.strip()
    mixed_units = len(unit_keys) > 1
    quantity = 0.0 if mixed_units else sum(location.quantity for location in locations)
    uom = "" if mixed_units else display_uom

    nonempty_statuses = {
        location.inventory_status.strip()
        for location in locations
        if location.inventory_status.strip()
    }
    mixed_status = len(nonempty_statuses) > 1
    inventory_status = "" if mixed_status else next(iter(nonempty_statuses), "")

    fetches = {_normalize_fetch_status(location.fetch_status) for location in locations}
    mixed_fetch = FETCH_STATUS_ERROR in fetches and FETCH_STATUS_OK in fetches
    fetch_status = (
        FETCH_STATUS_ERROR if FETCH_STATUS_ERROR in fetches else FETCH_STATUS_OK
    )

    stamps = [location.fetched_at.strip() for location in locations]
    mixed_freshness = len(set(stamps)) > 1
    nonempty_stamps = [stamp for stamp in stamps if stamp]
    fetched_at = max(nonempty_stamps) if nonempty_stamps else ""

    return InventorySourceAggregate(
        source=source,
        quantity=quantity,
        uom=uom,
        inventory_status=inventory_status,
        fetch_status=fetch_status,
        fetched_at=fetched_at,
        mixed_units=mixed_units,
        mixed_status=mixed_status,
        mixed_fetch=mixed_fetch,
        mixed_freshness=mixed_freshness,
    )


def aggregate_inventory_locations(
    rows: Iterable[Mapping[str, Any]],
) -> list[InventorySourceAggregate]:
    """Group location rows by source and return them in precedence order."""

    grouped: dict[str, list[InventoryLocation]] = {}
    for row in rows:
        location = inventory_location_from_row(row)
        if not location.source:
            continue
        grouped.setdefault(location.source, []).append(location)
    return [
        aggregate_source_locations(source, locations)
        for source, locations in sorted(
            grouped.items(), key=lambda item: inventory_source_sort_key(item[0])
        )
    ]


def csv_export_quantity_fields(
    aggregate: InventorySourceAggregate | None,
) -> tuple[float | str, str, str]:
    """CSV quantity/uom/status for one component's CSV source.

    Same-unit totals stay numeric (including ``0.0`` when there is no CSV
    inventory). Mixed units omit quantity and unit rather than emitting a sum.
    """

    if aggregate is None:
        return 0.0, "", ""
    if aggregate.mixed_units:
        return "", "", aggregate.inventory_status
    return aggregate.quantity, aggregate.uom, aggregate.inventory_status


__all__ = [
    "FETCH_STATUS_ERROR",
    "FETCH_STATUS_OK",
    "INVENTORY_SOURCE_PRIORITY",
    "InventoryLocation",
    "InventorySourceAggregate",
    "aggregate_inventory_locations",
    "aggregate_source_locations",
    "csv_export_quantity_fields",
    "inventory_location_from_row",
    "inventory_source_sort_key",
]
