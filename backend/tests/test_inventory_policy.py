"""Compatible-unit inventory aggregation keeps mixed data explicit."""

from __future__ import annotations

import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.catalog.inventory_policy import (  # noqa: E402
    FETCH_STATUS_ERROR,
    FETCH_STATUS_OK,
    aggregate_inventory_locations,
    csv_export_quantity_fields,
    inventory_source_sort_key,
)


def _location(
    source: str,
    quantity: float,
    *,
    uom: str = "pcs",
    inventory_status: str = "available",
    fetch_status: str = FETCH_STATUS_OK,
    fetched_at: str = "2026-01-02T00:00:00Z",
    location_key: str = "",
) -> dict[str, object]:
    return {
        "source": source,
        "location_key": location_key or source,
        "quantity": quantity,
        "uom": uom,
        "inventory_status": inventory_status,
        "fetch_status": fetch_status,
        "fetched_at": fetched_at,
    }


class InventorySourceSortTests(unittest.TestCase):
    def test_inventree_outranks_csv_and_unknown_names_stay_sortable(self) -> None:
        names = ["warehouse_x", "csv", "inventree", "sap"]
        ordered = sorted(names, key=inventory_source_sort_key)
        self.assertEqual(ordered, ["inventree", "csv", "sap", "warehouse_x"])


class InventoryAggregationTests(unittest.TestCase):
    def test_freshness_compares_instants_across_offsets_and_precision(self) -> None:
        newest = "2026-01-02T00:00:00.5Z"
        aggregate = aggregate_inventory_locations([
            _location("csv", 1, fetched_at="2026-01-02T01:00:00+02:00"),
            _location("csv", 2, fetched_at="2026-01-02T00:00:00Z"),
            _location("csv", 3, fetched_at=newest),
        ])[0]
        self.assertEqual(aggregate.fetched_at, newest)
        self.assertTrue(aggregate.mixed_freshness)

    def test_equal_instants_are_not_mixed_and_invalid_dates_do_not_win(self) -> None:
        rows = [
            _location("csv", 1, fetched_at="2026-01-02T01:00:00+01:00"),
            _location("csv", 1, fetched_at="2026-01-02T00:00:00Z"),
        ]
        self.assertFalse(aggregate_inventory_locations(rows)[0].mixed_freshness)
        for missing in ("", "unknown", "2026-01-03T00:00:00"):
            with self.subTest(missing=missing):
                aggregate = aggregate_inventory_locations(rows + [_location("csv", 1, fetched_at=missing)])[0]
                self.assertTrue(aggregate.mixed_freshness)
                self.assertIn(aggregate.fetched_at, [row["fetched_at"] for row in rows])

    def test_same_unit_csv_and_inventree_keep_totals_and_precedence(self) -> None:
        aggregates = aggregate_inventory_locations(
            [
                _location("csv", 2, location_key="shelf-a"),
                _location("csv", 3, location_key="shelf-b"),
                _location("inventree", 10, location_key="main"),
                _location("inventree", 4, location_key="overflow"),
            ]
        )
        self.assertEqual([item.source for item in aggregates], ["inventree", "csv"])
        self.assertEqual(aggregates[0].quantity, 14.0)
        self.assertEqual(aggregates[0].uom, "pcs")
        self.assertFalse(aggregates[0].mixed_units)
        self.assertEqual(aggregates[1].quantity, 5.0)
        self.assertEqual(aggregates[1].uom, "pcs")

    def test_mixed_units_do_not_sum(self) -> None:
        aggregate = aggregate_inventory_locations(
            [
                _location("csv", 2, uom="pcs", location_key="a"),
                _location("csv", 3, uom="g", location_key="b"),
            ]
        )[0]
        self.assertTrue(aggregate.mixed_units)
        self.assertEqual(aggregate.quantity, 0.0)
        self.assertEqual(aggregate.uom, "")
        self.assertEqual(csv_export_quantity_fields(aggregate), ("", "", "available"))

    def test_blank_uom_is_compatible_with_a_single_named_unit(self) -> None:
        aggregate = aggregate_inventory_locations(
            [
                _location("csv", 2, uom="", location_key="a"),
                _location("csv", 3, uom="PCS", location_key="b"),
            ]
        )[0]
        self.assertFalse(aggregate.mixed_units)
        self.assertEqual(aggregate.quantity, 5.0)
        self.assertEqual(aggregate.uom, "PCS")

    def test_zero_same_unit_is_known_zero_not_mixed(self) -> None:
        aggregate = aggregate_inventory_locations(
            [_location("csv", 0, uom="pcs", location_key="a")]
        )[0]
        self.assertFalse(aggregate.mixed_units)
        self.assertEqual(aggregate.quantity, 0.0)
        self.assertEqual(aggregate.uom, "pcs")
        self.assertEqual(csv_export_quantity_fields(None), (0.0, "", ""))

    def test_stale_and_fresh_keep_newest_timestamp_and_flag_mix(self) -> None:
        aggregate = aggregate_inventory_locations(
            [
                _location("inventree", 1, fetched_at="2026-01-01T00:00:00Z", location_key="stale"),
                _location("inventree", 2, fetched_at="2026-03-01T00:00:00Z", location_key="fresh"),
            ]
        )[0]
        self.assertTrue(aggregate.mixed_freshness)
        self.assertEqual(aggregate.fetched_at, "2026-03-01T00:00:00Z")
        self.assertEqual(aggregate.quantity, 3.0)

    def test_failed_and_successful_fetches_fail_closed(self) -> None:
        aggregate = aggregate_inventory_locations(
            [
                _location("inventree", 4, fetch_status="ok", location_key="ok"),
                _location("inventree", 1, fetch_status="error", location_key="bad"),
            ]
        )[0]
        self.assertTrue(aggregate.mixed_fetch)
        self.assertEqual(aggregate.fetch_status, FETCH_STATUS_ERROR)
        self.assertEqual(aggregate.quantity, 5.0)

    def test_unanimous_error_stays_error_without_mixed_fetch(self) -> None:
        aggregate = aggregate_inventory_locations(
            [_location("csv", 0, fetch_status="error")]
        )[0]
        self.assertFalse(aggregate.mixed_fetch)
        self.assertEqual(aggregate.fetch_status, FETCH_STATUS_ERROR)

    def test_mixed_status_is_not_lexicographic_min(self) -> None:
        aggregate = aggregate_inventory_locations(
            [
                _location("csv", 1, inventory_status="available", location_key="a"),
                _location("csv", 1, inventory_status="reserved", location_key="b"),
            ]
        )[0]
        self.assertTrue(aggregate.mixed_status)
        self.assertEqual(aggregate.inventory_status, "")
        self.assertEqual(aggregate.quantity, 2.0)

    def test_unknown_source_names_remain_representable(self) -> None:
        aggregates = aggregate_inventory_locations(
            [
                _location("warehouse_x", 3),
                _location("csv", 1),
            ]
        )
        self.assertEqual([item.source for item in aggregates], ["csv", "warehouse_x"])
        self.assertEqual(aggregates[1].quantity, 3.0)


if __name__ == "__main__":
    unittest.main()
