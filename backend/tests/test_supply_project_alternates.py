"""A project's BOM counts its components' approved alternates (D2): stock, offers and status, in the project lookup and the
release check. Against a real catalog, since ``component_parts`` refers to catalog components.

Needs ``TEST_POSTGRES_URL``.
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
import unittest.mock
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from support.postgres import CATALOG_URL, requires_scratch_postgres  # noqa: E402

AUTHOR = "author@example.com"
NOW = datetime.now(timezone.utc)


@requires_scratch_postgres("project alternates")
class ProjectAlternatesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.services.component_catalog_service_postgres import ComponentCatalogPostgresService
        from app.services.supply import bom_lookup, catalog_read, component_parts, project_supply, release_check
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.tempdir = tempfile.TemporaryDirectory()
        cls.catalog = ComponentCatalogPostgresService(store_root=Path(cls.tempdir.name) / "components", database_url=CATALOG_URL)
        cls.catalog.initialize()
        cls.store = type("CatalogSupplyStore", (SupplyStore,), {"url": CATALOG_URL})()
        cls.store._initialized = True  # the catalog service above ran the ledger, supply tables included
        cls.cp, cls.bom, cls.project, cls.release = component_parts, bom_lookup, project_supply, release_check
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        cls.cid = connectors.create(actor="seed@example.com", provider="fake", currency="EUR", display_name=f"Sim {uuid.uuid4().hex[:6]}", interactive_reserve_pct=0)["id"]
        # The catalog readers go through the catalog service; here that is the catalog these tests made.
        cls.readers = [
            unittest.mock.patch.object(catalog_read, "identities", lambda ids: cls.catalog.component_identities(sorted({str(i) for i in ids if i}))),
            unittest.mock.patch.object(catalog_read, "in_library", lambda pairs: {(m.strip().casefold(), n.strip().casefold()) for m, n in pairs}),
        ]
        for patch in cls.readers:
            patch.start()

    @classmethod
    def tearDownClass(cls) -> None:
        for patch in cls.readers:
            patch.stop()
        cls.tempdir.cleanup()

    def _component(self) -> dict:
        token = uuid.uuid4().hex[:10]
        component = self.catalog.create_manual_component(
            value="10k", description="Project alternates test", datasheet="https://example.com/r.pdf",
            manufacturer=f"Maker {token}", manufacturer_part_number=f"PA-{token}", actor=AUTHOR,
        )
        self.addCleanup(self.catalog.deactivate_component, str(component["id"]), actor=AUTHOR, reason="project alternates test cleanup")
        return component

    def _offer(self, conn, part_id: str, stock: int, price: str = "0.10") -> None:
        listing_id = uuid.uuid4().hex
        conn.execute(
            "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) VALUES (%s, %s, %s, %s, 'x', 'x', 'exact')",
            (listing_id, self.cid, f"S-{listing_id[:12]}", part_id),
        )
        conn.execute(
            "INSERT INTO supply_offers (listing_id, fetched_at, stock, lifecycle, currency, price_breaks) VALUES (%s, %s, %s, 'active', 'EUR', %s::jsonb)",
            (listing_id, NOW, stock, f'[[1, "{price}"]]'),
        )

    def _with_alternate(self, *, approve: bool = True, main_stock: int = 0, alternate_stock: int = 5000) -> tuple[dict, str, str]:
        """A component whose main part has ``main_stock`` and one alternate with ``alternate_stock``."""

        component = self._component()
        component_id = str(component["id"])
        with self.store.connection() as conn:
            self.cp.sync_main(conn, [component_id])
            main_id = self.cp.parts_of(conn, component_id)[0]["part_id"]
            alternate = self.cp.propose_alternate(conn, component_id, component["manufacturer"], f"ALT-{uuid.uuid4().hex[:8]}", AUTHOR)
            if approve:
                self.cp.decide(conn, component_id, alternate["part_id"], True, "qa@example.com")
            self._offer(conn, main_id, main_stock)
            self._offer(conn, alternate["part_id"], alternate_stock, "0.08")
        return component, main_id, alternate["part_id"]

    def test_a_line_counts_its_components_approved_alternates(self) -> None:
        component, main_id, alternate_id = self._with_alternate()
        line = self.bom.BomLine("k1", component["manufacturer"], component["mpn"], 2)
        with self.store.connection() as conn:
            entry = self.bom.lookup(conn, [line], 100)["lines"]["k1"]
        self.assertEqual(entry["part_id"], main_id)
        self.assertEqual(entry["stock"], 5000, "the alternate's stock counts")
        self.assertFalse(entry["short"])
        self.assertEqual((entry["status"], entry["status_from"]), ("ok", alternate_id), "the line is as good as its best approved part")
        self.assertEqual([alt["part_id"] for alt in entry["alternates"]], [alternate_id])
        self.assertEqual(entry["buy"]["part_id"], alternate_id, "the alternate holds the stock, so it is bought")

    def test_a_pending_alternate_does_not_count(self) -> None:
        component, main_id, _alternate_id = self._with_alternate(approve=False)
        line = self.bom.BomLine("k1", component["manufacturer"], component["mpn"], 2)
        with self.store.connection() as conn:
            entry = self.bom.lookup(conn, [line], 100)["lines"]["k1"]
        self.assertEqual((entry["stock"], entry["alternates"], entry["status_from"]), (0, [], None))
        self.assertNotEqual(entry["status"], "ok")
        self.assertEqual(entry["buy"]["part_id"], main_id)

    def test_an_alternate_already_on_the_bom_is_not_counted_twice(self) -> None:
        component, _main_id, alternate_id = self._with_alternate()
        with self.store.connection() as conn:
            alternate = self.cp.parts_of(conn, str(component["id"]))[1]
            result = self.bom.lookup(conn, [
                self.bom.BomLine("k1", component["manufacturer"], component["mpn"], 2),
                self.bom.BomLine("k2", alternate["manufacturer"], alternate["mpn"], 3),
            ], 100)
        self.assertEqual((result["lines"]["k1"]["stock"], result["lines"]["k1"]["alternates"]), (0, []))
        self.assertEqual(result["lines"]["k2"]["part_id"], alternate_id)

    def test_available_stores_stock_counts_toward_the_build_and_held_stock_does_not(self) -> None:
        component = self._component()
        component_id = str(component["id"])
        stamp = NOW.isoformat()
        with self.store.connection() as conn:
            self.cp.sync_main(conn, [component_id])
            self._offer(conn, self.cp.parts_of(conn, component_id)[0]["part_id"], 10)
            for record, quantity, status in (("a", 500, "available"), ("h", 900, "on hold")):
                conn.execute(
                    "INSERT INTO inventory_levels (source, component_id, location_key, source_record_id, quantity, inventory_status, fetched_at, updated_at) "
                    "VALUES ('csv', %s, %s, %s, %s, %s, %s, %s)", (component_id, f"stores-{record}", record, quantity, status, stamp, stamp),
                )
        self.addCleanup(self._drop_levels, component_id)
        rows = [{"key": "k1", "manufacturer": component["manufacturer"], "mpn": component["mpn"], "quantity": 2, "references": "R1 R2", "lcsc": "", "prism_id": component_id}]
        with self.store.connection() as conn:
            (part,), rollup, _curve = self.project._parts(conn, rows, 100, {})
        self.assertEqual(part["stock"], 10, "the distributors' figure stays as it is")
        self.assertEqual(part["stores"], {"state": "stock", "available": 500.0, "since": None})
        self.assertFalse(part["short"], "200 needed, 10 + 500 usable")
        self.assertEqual(rollup["can_build"], 255, "held stock is not counted")

    def _drop_levels(self, component_id: str) -> None:
        with self.store.connection() as conn:
            conn.execute("DELETE FROM inventory_levels WHERE component_id = %s", (component_id,))

    def test_a_line_placed_by_prism_id_takes_the_component_and_its_alternates(self) -> None:
        component, main_id, alternate_id = self._with_alternate()
        rows = [{"key": "k1", "manufacturer": "Someone", "mpn": "WRONG-1", "quantity": 1, "references": "R1", "lcsc": "", "prism_id": str(component["id"])}]
        with self.store.connection() as conn:
            (part,), rollup, _curve = self.project._parts(conn, rows, 10, {})
        self.assertEqual((part["part_id"], part["stock"], part["in_library"]), (main_id, 5000, True))
        self.assertEqual([alt["part_id"] for alt in part["alternates"]], [alternate_id])
        self.assertEqual(rollup["short"], 0)

    def test_the_release_check_counts_alternates_and_records_them(self) -> None:
        from app.services.supply import usage

        component, main_id, alternate_id = self._with_alternate()
        lines = usage.lines_from_components([
            {"reference": "R1", "fields": {"Manufacturer": component["manufacturer"], "Manufacturer Part Number": component["mpn"], "DNP": "No", "In BOM": "Yes"}},
        ])
        with self.store.connection() as conn:
            (row,) = self.release.check(conn, lines)["lines"]
        self.assertEqual((row["part_id"], row["status"], row["status_from"], row["alternates"]), (main_id, "ok", alternate_id, [alternate_id]))

    def test_a_part_that_is_the_main_part_of_two_components_takes_no_alternates(self) -> None:
        first, main_id, _alternate_id = self._with_alternate()
        second = self.catalog.create_manual_component(
            value="10k", description="Project alternates twin", datasheet="https://example.com/r.pdf",
            manufacturer=first["manufacturer"], manufacturer_part_number=first["mpn"].replace("-", ""), actor=AUTHOR,
        )
        self.addCleanup(self.catalog.deactivate_component, str(second["id"]), actor=AUTHOR, reason="project alternates test cleanup")
        with self.store.connection() as conn:
            self.cp.sync_main(conn, [str(second["id"])])
            self.assertEqual(self.cp.alternates_for(conn, {main_id: set()}), {}, "which component the line means cannot be told")
            self.assertEqual(len(self.cp.alternates_for(conn, {main_id: {str(first["id"])}})[main_id]), 1, "a Prism ID tells it")


if __name__ == "__main__":
    unittest.main()
