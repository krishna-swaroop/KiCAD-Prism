"""Matching the library's parts nothing follows to each distributor (``library_match``), batch distributors first.

Needs ``PRISM_DATABASE_URL``; works in a disposable schema with a stand-in ``component_parts`` table.
"""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
ACTOR = "ana@example.com"
NOW = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class LibraryMatchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.services.supply import library_match, parts
        from app.services.supply.store import SupplyStore

        cls.lm, cls.parts = library_match, parts
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_library_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        with cls.store.connection() as conn:
            conn.execute("CREATE TABLE component_parts (component_id TEXT, part_id TEXT, role TEXT, approval TEXT)")

    @classmethod
    def tearDownClass(cls) -> None:
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        with self.store.connection() as conn:
            for table in ("supply_discovery_runs", "supply_listings", "supply_part_tiers", "component_parts", "supply_parts", "supply_connectors"):
                conn.execute(f"DELETE FROM {table}")
            self.arrow, self.digikey = self.connector(conn, "arrow"), self.connector(conn, "digikey")
            self.followed, self.first, self.second = (self.library_part(conn, mpn) for mpn in ("FOLLOWED1", "LIB1", "LIB2"))
            conn.execute("INSERT INTO supply_part_tiers (part_id, tier, rate) VALUES (%s, 1, 'daily')", (self.followed,))

    def connector(self, conn, provider: str) -> str:
        connector_id = f"{provider}-{uuid.uuid4().hex[:6]}"
        conn.execute("INSERT INTO supply_connectors (id, provider) VALUES (%s, %s)", (connector_id, provider))
        return connector_id

    def library_part(self, conn, mpn: str) -> str:
        part_id = self.parts.ensure_part(conn, "Acme", mpn, ACTOR).id
        conn.execute("INSERT INTO component_parts VALUES (%s, %s, 'main', 'approved')", (uuid.uuid4().hex, part_id))
        return part_id

    def searched(self, conn, part_id: str, connector_id: str, found: int, at: datetime = NOW) -> None:
        conn.execute("INSERT INTO supply_discovery_runs (part_id, connector_id, last_run_at, found) VALUES (%s, %s, %s, %s)", (part_id, connector_id, at, found))
        if found:
            conn.execute(
                "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) VALUES (%s, %s, %s, %s, 'x', 'Acme', 'exact')",
                (uuid.uuid4().hex, connector_id, uuid.uuid4().hex[:8], part_id))

    def test_a_batch_distributor_searches_the_library_parts_nothing_follows(self) -> None:
        with self.store.connection() as conn:
            self.assertEqual(set(self.lm.pending(conn, self.arrow, "arrow", NOW, 10)), {self.first, self.second})
            self.searched(conn, self.first, self.arrow, 1)
            self.assertEqual(self.lm.pending(conn, self.arrow, "arrow", NOW, 10), [self.second], "a part searched lately waits")
            later = NOW + self.lm.RESEARCH_AFTER + timedelta(days=1)
            self.assertEqual(self.lm.pending(conn, self.arrow, "arrow", later, 10), [self.second, self.first], "never searched first, then the oldest")

    def test_a_distributor_that_looks_up_few_numbers_a_call_only_fills_the_gaps(self) -> None:
        with self.store.connection() as conn:
            self.assertEqual(self.lm.pending(conn, self.digikey, "digikey", NOW, 10), [], "Arrow has not searched yet")
            self.searched(conn, self.first, self.arrow, 0)
            self.searched(conn, self.second, self.arrow, 1)
            self.assertEqual(self.lm.pending(conn, self.digikey, "digikey", NOW, 10), [self.first], "only what Arrow does not carry")
            conn.execute("UPDATE supply_connectors SET enabled = FALSE WHERE id = %s", (self.arrow,))
            self.assertEqual(self.lm.pending(conn, self.digikey, "digikey", NOW, 10), [self.first], "what another distributor carries stays skipped")

    def test_progress_counts_the_library_and_reckons_the_days_left(self) -> None:
        with self.store.connection() as conn:
            before = self.lm.progress(conn, self.arrow, "arrow", NOW, 1)
            self.assertEqual((before.total, before.waiting, before.days_left), (2, 2, 1), "100 parts a call: one call a day does both")
            self.assertIsNone(self.lm.progress(conn, self.arrow, "arrow", NOW, 0).days_left, "no spare calls, no end in sight")
            self.searched(conn, self.first, self.arrow, 0)
            self.searched(conn, self.second, self.arrow, 3)
            after = self.lm.progress(conn, self.arrow, "arrow", NOW, 1)
            self.assertEqual((after.found, after.not_found, after.waiting, after.days_left), (1, 1, 0, 0))
            gaps = self.lm.progress(conn, self.digikey, "digikey", NOW, 1)
            self.assertEqual((gaps.waiting, gaps.days_left), (1, 1), "DigiKey waits only on the part Arrow does not carry")


if __name__ == "__main__":
    unittest.main()
