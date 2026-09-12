"""Inventory CSV export uses the shared aggregation policy."""

from __future__ import annotations

import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.catalog.inventory_csv import (  # noqa: E402
    CatalogInventoryCsv,
    INVENTORY_CSV_HEADERS,
)


def _row(
    component_id: str,
    *,
    manufacturer: str = "Prism",
    mpn: str = "PG-1",
    inventory_source: str | None = "csv",
    location_key: str | None = "",
    quantity: float | None = 0.0,
    uom: str | None = "pcs",
    inventory_status: str | None = "available",
) -> dict[str, object]:
    return {
        "component_id": component_id,
        "manufacturer": manufacturer,
        "mpn": mpn,
        "inventory_source": inventory_source,
        "location_key": location_key,
        "quantity": quantity,
        "uom": uom,
        "inventory_status": inventory_status,
    }


class InventoryCsvExportShapeTests(unittest.TestCase):
    def test_mixed_unit_export_cannot_be_reimported_as_zero(self) -> None:
        exported = CatalogInventoryCsv.render_export(CatalogInventoryCsv.shape_export_rows([
            _row("c1", location_key="", quantity=2, uom="pcs"),
            _row("c1", location_key="b", quantity=3, uom="g"),
        ]))
        row = next(iter(CatalogInventoryCsv.parse(exported)))
        with self.assertRaisesRegex(ValueError, "quantity is required"):
            CatalogInventoryCsv.prepare_upsert(row, 2)

    def test_import_requires_finite_quantity_and_preserves_explicit_zero(self) -> None:
        for value in (None, "", " ", "nan", "inf", "-Infinity", "1e999"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                CatalogInventoryCsv.prepare_upsert({"quantity": value}, 2)
        self.assertEqual(CatalogInventoryCsv.prepare_upsert({"quantity": 0, "stock_quantity": 9}, 2).quantity, 0)
        self.assertEqual(CatalogInventoryCsv.prepare_upsert({"stock_quantity": "2.5"}, 2).quantity, 2.5)

    def test_same_unit_csv_locations_sum(self) -> None:
        rows = CatalogInventoryCsv.shape_export_rows(
            [
                _row("c1", location_key="a", quantity=2),
                _row("c1", location_key="b", quantity=3),
            ]
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["quantity"], 5.0)
        self.assertEqual(rows[0]["uom"], "pcs")
        self.assertEqual(rows[0]["inventory_status"], "available")
        self.assertEqual(list(rows[0]), list(INVENTORY_CSV_HEADERS))

    def test_mixed_units_omit_quantity_instead_of_summing(self) -> None:
        rows = CatalogInventoryCsv.shape_export_rows(
            [
                _row("c1", location_key="a", quantity=2, uom="pcs"),
                _row("c1", location_key="b", quantity=3, uom="g"),
            ]
        )
        self.assertEqual(rows[0]["quantity"], "")
        self.assertEqual(rows[0]["uom"], "")
        self.assertEqual(rows[0]["inventory_status"], "available")

    def test_missing_csv_inventory_exports_numeric_zero(self) -> None:
        rows = CatalogInventoryCsv.shape_export_rows(
            [_row("c1", inventory_source=None, location_key=None, quantity=None, uom=None, inventory_status=None)]
        )
        self.assertEqual(rows[0]["quantity"], 0.0)
        self.assertEqual(rows[0]["uom"], "")
        self.assertEqual(rows[0]["inventory_status"], "")

    def test_component_order_follows_first_appearance(self) -> None:
        rows = CatalogInventoryCsv.shape_export_rows(
            [
                _row("c-b", manufacturer="B", mpn="2", quantity=1),
                _row("c-a", manufacturer="A", mpn="1", quantity=4),
            ]
        )
        self.assertEqual([row["component_id"] for row in rows], ["c-b", "c-a"])


if __name__ == "__main__":
    unittest.main()
