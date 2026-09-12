from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.catalog.component_read_models import (  # noqa: E402
    inventory_payloads_from_source_rows,
)
from app.services.component_catalog_domain import _supply_source_payload  # noqa: E402
from app.services.component_catalog_service_postgres import (  # noqa: E402
    ComponentCatalogPostgresService,
)


class _FakeResult:
    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows

    def fetchall(self) -> list[dict]:
        return self._rows

    def fetchone(self) -> dict | None:
        return self._rows[0] if self._rows else None


class _FakeConn:
    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows
        self.queries: list[tuple[str, tuple | None]] = []

    def execute(self, sql: str, params: tuple | None = None) -> _FakeResult:
        self.queries.append((sql, params))
        return _FakeResult(self.rows)


class SupplySourcePayloadTests(unittest.TestCase):
    def test_local_source_maps_display_name_and_fields(self) -> None:
        payload = _supply_source_payload(
            {
                "source": "inventree",
                "quantity": 42,
                "uom": "pcs",
                "inventory_status": "available",
                "fetch_status": "ok",
                "fetched_at": "2026-01-01T00:00:00Z",
            }
        )
        self.assertEqual(
            payload,
            {
                "kind": "local",
                "id": "inventree",
                "display_name": "InvenTree",
                "stock": 42.0,
                "uom": "pcs",
                "stock_status": "available",
                "fetch_status": "ok",
                "fetched_at": "2026-01-01T00:00:00Z",
                "mixed_units": False,
                "mixed_status": False,
                "mixed_fetch": False,
                "mixed_freshness": False,
            },
        )

    def test_missing_fetch_status_defaults_to_ok(self) -> None:
        payload = _supply_source_payload(
            {"source": "csv", "quantity": 0, "uom": "", "inventory_status": "", "fetched_at": ""}
        )
        self.assertEqual(payload["fetch_status"], "ok")
        self.assertEqual(payload["kind"], "local")
        self.assertEqual(payload["stock"], 0.0)

    def test_unknown_source_falls_back_to_title_case_local(self) -> None:
        payload = _supply_source_payload(
            {"source": "warehouse_x", "quantity": 3, "fetched_at": ""}
        )
        self.assertEqual(payload["kind"], "local")
        self.assertEqual(payload["display_name"], "Warehouse X")


class SupplySourcesQueryTests(unittest.TestCase):
    def setUp(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.service = ComponentCatalogPostgresService(
            store_root=Path(tmp.name),
            database_url="postgresql://placeholder:5432/unused",
        )

    def test_maps_every_row_in_sql_order(self) -> None:
        conn = _FakeConn(
            [
                {
                    "source": "inventree",
                    "location_key": "main",
                    "quantity": 10,
                    "uom": "pcs",
                    "inventory_status": "available",
                    "fetch_status": "ok",
                    "fetched_at": "2026-01-01T00:00:00Z",
                },
                {
                    "source": "inventree",
                    "location_key": "overflow",
                    "quantity": 2,
                    "uom": "pcs",
                    "inventory_status": "available",
                    "fetch_status": "ok",
                    "fetched_at": "2026-01-01T00:00:00Z",
                },
                {
                    "source": "csv",
                    "location_key": "",
                    "quantity": 2,
                    "uom": "pcs",
                    "inventory_status": "",
                    "fetch_status": "error",
                    "fetched_at": "2026-01-02T00:00:00Z",
                },
            ]
        )
        sources = self.service._supply_sources(conn, "component-1")
        self.assertEqual([s["id"] for s in sources], ["inventree", "csv"])
        self.assertEqual(sources[0]["stock"], 12.0)
        self.assertFalse(sources[0]["mixed_units"])
        self.assertEqual([s["fetch_status"] for s in sources], ["ok", "error"])
        sql, params = conn.queries[0]
        self.assertIn("location_key", sql)
        self.assertNotIn("GROUP BY", sql)
        self.assertNotIn("LIMIT", sql)
        self.assertEqual(params, ("component-1",))

    def test_empty_when_no_rows(self) -> None:
        sources = self.service._supply_sources(_FakeConn([]), "component-1")
        self.assertEqual(sources, [])


class InventoryPayloadsFromSourceRowsTests(unittest.TestCase):
    def test_first_row_is_local_inventory_and_all_rows_are_supply(self) -> None:
        local, sources = inventory_payloads_from_source_rows(
            [
                {
                    "source": "inventree",
                    "quantity": 10,
                    "uom": "pcs",
                    "inventory_status": "available",
                    "fetch_status": "ok",
                    "fetched_at": "2026-01-01T00:00:00Z",
                },
                {
                    "source": "csv",
                    "quantity": 2,
                    "uom": "pcs",
                    "inventory_status": "",
                    "fetch_status": "error",
                    "fetched_at": "2026-01-02T00:00:00Z",
                },
            ]
        )
        assert local is not None
        self.assertEqual(local["source"], "inventree")
        self.assertEqual(local["quantity"], 10.0)
        self.assertFalse(local["mixed_units"])
        self.assertEqual([item["id"] for item in sources], ["inventree", "csv"])
        self.assertEqual([item["fetch_status"] for item in sources], ["ok", "error"])

    def test_mixed_unit_locations_do_not_sum(self) -> None:
        local, sources = inventory_payloads_from_source_rows(
            [
                {
                    "source": "csv",
                    "location_key": "a",
                    "quantity": 2,
                    "uom": "pcs",
                    "inventory_status": "available",
                    "fetch_status": "ok",
                    "fetched_at": "2026-01-01T00:00:00Z",
                },
                {
                    "source": "csv",
                    "location_key": "b",
                    "quantity": 5,
                    "uom": "g",
                    "inventory_status": "available",
                    "fetch_status": "ok",
                    "fetched_at": "2026-01-01T00:00:00Z",
                },
            ]
        )
        assert local is not None
        self.assertTrue(local["mixed_units"])
        self.assertEqual(local["quantity"], 0.0)
        self.assertEqual(local["uom"], "")
        self.assertEqual(len(sources), 1)
        self.assertTrue(sources[0]["mixed_units"])

    def test_empty_rows_mean_unknown_stock(self) -> None:
        local, sources = inventory_payloads_from_source_rows([])
        self.assertIsNone(local)
        self.assertEqual(sources, [])


if __name__ == "__main__":
    unittest.main()
