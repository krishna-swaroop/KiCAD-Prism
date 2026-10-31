"""What the KiCad panel gets from supply data. Needs ``PRISM_DATABASE_URL``."""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
ORIGIN = "https://prism.example"


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply tests")
class PanelPayloadTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.api import remote_provider
        from app.core.security import AuthenticatedUser
        from app.services.postgres_database import database
        from app.services.supply import panel_payload, parts
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.remote_provider, cls.panel_payload, cls.parts = database, remote_provider, panel_payload, parts
        cls.users = {
            role: AuthenticatedUser(email=f"{role}@example.com", name=role, role=role)
            for role in ("viewer", "qa", "designer", "admin")
        }
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_panel_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        cls.patcher = mock.patch("app.services.supply.store.supply_store", cls.store)
        cls.patcher.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.patcher.stop()
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        # Summaries are assessed at the time the fixtures read at, so their reads are not late.
        patcher = mock.patch("app.services.supply.parts_view._now", return_value=datetime(2026, 3, 1, 2, tzinfo=timezone.utc))
        patcher.start()
        self.addCleanup(patcher.stop)
        with self.store.connection() as conn:
            for table in ("supply_listings", "supply_watches", "supply_parts", "supply_manufacturer_aliases", "supply_manufacturers", "supply_connectors", "supply_audit_events"):
                conn.execute(f"DELETE FROM {table}")
            conn.execute("INSERT INTO supply_manufacturers (id, name, name_key) VALUES ('m1', 'Acme', 'acme')")
        self.cid = self.connectors.create(actor="seed@example.com", provider="fake", currency="EUR", display_name="Sim", interactive_reserve_pct=0)["id"]
        with self.store.connection() as conn:
            self.part = self.parts.ensure_part(conn, "Acme", "ABC-123", "seed@example.com")

    def listing(self, *, stock: int, sku: str = "A", connector_id: str | None = None, **offer) -> None:
        listing_id = uuid.uuid4().hex
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) VALUES (%s, %s, %s, %s, 'x', 'Acme', 'exact')",
                (listing_id, connector_id or self.cid, sku, self.part.id))
            conn.execute(
                "INSERT INTO supply_offers (listing_id, fetched_at, stock, lifecycle, currency, price_breaks, moq) VALUES (%s, %s, %s, %s, 'EUR', %s::jsonb, 1)",
                (listing_id, datetime(2026, 3, 1, tzinfo=timezone.utc), stock, offer.get("lifecycle", "active"), offer.get("breaks", '[[1, "0.50"], [100, "0.30"]]')))

    def refresh(self, part_id: str, role: str = "qa"):
        from fastapi import FastAPI

        from app.api import supply_connectors
        from supply_api_helpers import request

        app = FastAPI()
        from app.core.errors import install_error_handlers
        install_error_handlers(app)
        app.include_router(self.remote_provider.router)
        with mock.patch.object(supply_connectors, "service", self.connectors):
            return request(app, "POST", f"/api/remote-provider/supply/parts/{part_id}/refresh", user=self.users[role])

    def test_the_panel_can_read_a_part_now_once_in_a_while(self) -> None:
        self.listing(stock=50)
        first = self.refresh(self.part.id)
        self.assertEqual((first.status, first.json["connectors"]), (200, 1), first.text)
        second = self.refresh(self.part.id)
        self.assertEqual(second.status, 429)
        self.assertIn("You can read it again in", second.json["detail"])

    def test_the_panel_refresh_needs_supply_access_and_a_known_part(self) -> None:
        self.assertEqual(self.refresh(self.part.id, role="viewer").status, 403)
        self.assertEqual(self.refresh("no-such-part").status, 404)

    @staticmethod
    def component(**over):
        return {"id": "cmp-1", "manufacturer": "ACME", "mpn": "abc123", "supply": {"sources": []}} | over

    def test_a_tracked_component_gets_a_one_line_summary(self) -> None:
        self.listing(stock=900)
        with self.store.connection() as conn:
            found = self.panel_payload.summaries(conn, [self.component(), self.component(id="cmp-2", mpn="UNTRACKED-9")])
        self.assertEqual(set(found), {"cmp-1"}, "a component Prism does not track has none")
        summary = found["cmp-1"]
        self.assertEqual((summary["status"], summary["stock"], summary["distributors"], summary["lifecycle"]), ("ok", 900, 1, "active"))
        self.assertEqual((summary["unit_price"], summary["currency"], summary["price_quantity"], summary["watched"]), ("0.3", "EUR", 100, False))

    def test_detail_adds_sources_insight_and_links(self) -> None:
        self.listing(stock=900)
        with self.store.connection() as conn:
            detail = self.panel_payload.detail(conn, self.component(), "designer", ORIGIN, now=datetime(2026, 3, 1, 2, tzinfo=timezone.utc))
        self.assertEqual(detail["summary"]["stock"], 900)
        (source,) = detail["offers"]
        self.assertEqual((source["connector"], source["sku"], source["stock"], source["unit_price"], source["currency"]), ("Sim", "A", 900, "0.3", "EUR"))
        self.assertNotIn("alternates", detail)
        self.assertIn("confidence", detail["insight"])
        self.assertEqual(detail["health"]["status"], "ok")
        self.assertEqual(detail["outlook"], "No signs of an end")
        self.assertEqual(detail["risks"], [])
        self.assertEqual(detail["links"]["sourcing"], f"{ORIGIN}/?section=library-manager&libraryView=catalog&component=cmp-1&componentTab=sourcing")
        self.assertEqual(detail["links"]["supply"], f"{ORIGIN}/?section=supply&supplyView=parts&part={self.part.id}&component=cmp-1")

    def test_risks_name_the_worst_open_findings_at_most_two(self) -> None:
        self.listing(stock=0, lifecycle="nrnd")
        with self.store.connection() as conn:
            detail = self.panel_payload.detail(conn, self.component(), "designer", ORIGIN, now=datetime(2026, 3, 1, 2, tzinfo=timezone.utc))
        self.assertEqual(detail["risks"], ["No distributor has this part in stock.", "The manufacturer does not recommend this part for new designs."])
        self.assertEqual(detail["health"]["status"], "error")

    def test_marketplace_stock_is_listed_last_and_does_not_count_as_a_distributor(self) -> None:
        self.listing(stock=50)
        with self.store.connection() as conn:
            other = conn.execute("SELECT id FROM supply_connectors").fetchone()["id"]
            listing_id = uuid.uuid4().hex
            conn.execute("INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) VALUES (%s, %s, 'M', %s, 'x', 'Acme', 'exact')", (listing_id, other, self.part.id))
            conn.execute("INSERT INTO supply_offers (listing_id, fetched_at, stock, marketplace) VALUES (%s, NOW(), 5000, TRUE)", (listing_id,))
            detail = self.panel_payload.detail(conn, self.component(), "designer", ORIGIN, now=datetime(2026, 3, 1, 2, tzinfo=timezone.utc))
        self.assertEqual([row["sku"] for row in detail["offers"]], ["A", "M"])
        self.assertEqual((detail["summary"]["stock"], detail["summary"]["distributors"]), (50, 1))

    def test_nothing_is_attached_for_a_role_that_cannot_read_supply_or_when_supply_fails(self) -> None:
        self.listing(stock=900)
        rp = self.remote_provider
        viewer = [self.component()]
        rp._attach_supply(viewer, self.users["viewer"], ORIGIN)
        self.assertEqual(viewer[0]["supply"], {"sources": []})
        designer = [self.component()]
        rp._attach_supply(designer, self.users["designer"], ORIGIN)
        self.assertEqual(designer[0]["supply"]["summary"]["stock"], 900)
        self.assertEqual(designer[0]["supply"]["sources"], [], "the inventory sources are not touched")
        with mock.patch("app.services.supply.panel_payload.summaries", side_effect=RuntimeError("down")):
            broken = [self.component()]
            rp._attach_supply(broken, self.users["designer"], ORIGIN)
        self.assertEqual(broken[0]["supply"], {"sources": []})
        full = [self.component(supply={"sources": [{"kind": "local", "id": "inv"}]})]
        rp._attach_supply(full, self.users["designer"], ORIGIN, full=True)
        self.assertEqual(full[0]["supply"]["sources"], [{"kind": "local", "id": "inv"}], "the inventory list survives the detail")
        self.assertEqual(full[0]["supply"]["offers"][0]["sku"], "A")

    def test_the_cache_key_moves_when_supply_data_does_and_is_empty_for_other_roles(self) -> None:
        rp = self.remote_provider
        self.assertEqual(rp._supply_version(self.users["viewer"]), "")
        before = rp._supply_version(self.users["designer"])
        self.listing(stock=10)
        self.assertNotEqual(rp._supply_version(self.users["designer"]), before)


if __name__ == "__main__":
    unittest.main()
