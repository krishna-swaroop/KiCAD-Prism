"""Picking a packaging by what a project buys for (plan section 12)."""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
ACTOR = "ana@example.com"
NOW = datetime(2026, 10, 16, 12, tzinfo=timezone.utc)


def listing(sku: str, packaging: str, moq: int) -> dict:
    return {"id": sku, "sku": sku, "packaging": packaging, "listing_packaging": packaging, "moq": moq}


class ChooseTests(unittest.TestCase):
    def test_each_packaging_looks_for_its_own_and_falls_back_to_the_next(self) -> None:
        from app.services.supply import packaging_auto

        listings = [listing("A-REEL", "tape_reel", 3000), listing("A-CUT", "cut_tape", 1), listing("A-DKR", "custom_reel", 1), listing("A-REEL2", "tape_reel", 2500)]
        self.assertEqual(packaging_auto.choose(listings, "cut_tape")["id"], "A-CUT")
        self.assertEqual(packaging_auto.choose(listings, "custom_reel")["id"], "A-DKR")
        self.assertEqual(packaging_auto.choose(listings, "tape_reel")["id"], "A-REEL2", "the smallest full reel")
        self.assertEqual(packaging_auto.choose(listings, "smallest")["id"], "A-CUT")
        no_reel = [listing("B-CUT", "cut_tape", 1), listing("B-DKR", "custom_reel", 1)]
        chosen, note = packaging_auto.choose_with_note(no_reel, "tape_reel")
        self.assertEqual((chosen["id"], note), ("B-DKR", "Full reel, not offered here"), "a full reel falls back to a custom reel")
        self.assertEqual(packaging_auto.choose_with_note([listing("T", "tray", 10), listing("B", "bulk", 100)], "cut_tape")[0]["id"], "T")
        self.assertEqual(packaging_auto.choose([listing("T", "tray", 10), listing("U", "tube", 5)], "tube_tray")["id"], "U")

    def test_the_followed_listing_is_in_stock_then_the_smallest_order_then_the_cheapest(self) -> None:
        from app.services.supply import packaging_auto

        def stocked(sku: str, moq: int, stock: int, price: str) -> dict:
            return {**listing(sku, "cut_tape", moq), "stock": stock, "price_breaks": [[moq, price]]}

        self.assertEqual(packaging_auto.choose([stocked("A", 1, 0, "0.5"), stocked("B", 5, 100, "0.7")], "cut_tape")["id"], "B", "in stock first")
        self.assertEqual(packaging_auto.choose([stocked("A", 5, 100, "0.5"), stocked("B", 1, 100, "0.7")], "cut_tape")["id"], "B", "then the smallest order")
        self.assertEqual(packaging_auto.choose([stocked("A", 1, 100, "0.7"), stocked("B", 1, 100, "0.5")], "cut_tape")["id"], "B", "then the lowest price")

    def test_a_guessed_packaging_loses_to_a_stated_one(self) -> None:
        from app.services.supply import packaging_auto

        guessed = {**listing("G-CUT", "cut_tape", 1), "packaging_inferred": True}
        stated = listing("S-CUT", "cut_tape", 5)
        self.assertEqual(packaging_auto.choose([guessed, stated], "cut_tape")["id"], "S-CUT")
        self.assertEqual(packaging_auto.choose([guessed, listing("X", "tray", 1)], "cut_tape")["id"], "G-CUT", "a guess still beats nothing")


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class AutoPickTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.services.postgres_database import database
        from app.services.supply import packaging_auto, parts, tracking, watches
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.auto, cls.parts, cls.tracking, cls.watches = database, packaging_auto, parts, tracking, watches
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_auto_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)

    @classmethod
    def tearDownClass(cls) -> None:
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        with self.store.connection() as conn:
            for table in ("supply_listings", "supply_watches", "supply_tracked_projects", "supply_bom_usage_projects", "supply_parts", "supply_manufacturers", "supply_connectors", "supply_audit_events"):
                conn.execute(f"DELETE FROM {table}")
        self.cid = self.connectors.create(actor=ACTOR, provider="lcsc", daily_budget=1000)["id"]

    def part_with_listings(self, mpn: str) -> str:
        with self.store.connection() as conn:
            watch, _ = self.watches.add_watch(conn, "Acme", mpn, ACTOR, tier=1)
            for sku, packaging, moq in ((f"{mpn}-CUT", "cut_tape", 1), (f"{mpn}-REEL", "tape_reel", 3000)):
                conn.execute(
                    "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state, packaging) "
                    "VALUES (%s, %s, %s, %s, %s, 'Acme', 'exact', %s)", (sku, self.cid, sku, watch.part_id, mpn, packaging))
                conn.execute("INSERT INTO supply_offers (listing_id, fetched_at, stock, packaging, moq, currency) VALUES (%s, %s, 100, %s, %s, 'USD')", (sku, NOW, packaging, moq))
            self.tracking.recompute(conn)
        return watch.part_id

    def picked(self, part_id: str) -> str | None:
        with self.store.connection() as conn:
            row = conn.execute("SELECT listing_id FROM supply_packaging_picks WHERE part_id = %s", (part_id,)).fetchone()
        return row["listing_id"] if row else None

    def test_a_part_in_no_project_follows_the_smallest_order(self) -> None:
        part = self.part_with_listings("R1")
        with self.store.connection() as conn:
            self.assertEqual(self.auto.auto_pick(conn), 1)
        self.assertEqual(self.picked(part), "R1-CUT")

    def test_a_part_only_production_projects_use_follows_a_reel_and_a_persons_pick_is_left_alone(self) -> None:
        part = self.part_with_listings("R2")
        other = self.part_with_listings("R3")
        with self.store.connection() as conn:
            for project_id in ("p1", "p2"):
                conn.execute("INSERT INTO supply_bom_usage_projects (project_id, project_name, revision_key, line_count, updated_at) VALUES (%s, %s, 'r', 1, NOW())", (project_id, project_id))
                conn.execute("INSERT INTO supply_bom_usage (project_id, line_key, manufacturer, mpn, alias_key, match_key, quantity) VALUES (%s, 'k', 'Acme', 'R2', 'acme', 'R2', 1)", (project_id,))
                conn.execute("INSERT INTO supply_tracked_projects (project_id, variants, packaging, tracked_by) VALUES (%s, ARRAY['']::text[], 'tape_reel', 'x')", (project_id,))
            from app.services.supply import packaging_picks

            packaging_picks.pick(conn, other, self.cid, "R3-REEL", ACTOR)
            self.assertEqual(self.auto.policy_of(conn, part), "tape_reel")
            self.assertEqual(self.auto.auto_pick(conn), 1)
            conn.execute("UPDATE supply_tracked_projects SET packaging = 'cut_tape' WHERE project_id = 'p2'")
            self.assertEqual(self.auto.policy_of(conn, part), "cut_tape", "the smaller packaging wins")
        self.assertEqual(self.picked(part), "R2-REEL")
        self.assertEqual(self.picked(other), "R3-REEL", "a person's pick stays")


if __name__ == "__main__":
    unittest.main()
