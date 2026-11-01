"""How many more parts tracking has room for, in parts like the ones already searched."""

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
NOW = datetime(2026, 10, 16, 12, tzinfo=timezone.utc)


class CostTests(unittest.TestCase):
    def test_a_typical_part_costs_between_a_carried_one_and_one_that_is_only_searched(self) -> None:
        from app.services.supply import budget, room
        from app.services.supply.providers.base import ProviderSpec

        spec = ProviderSpec(key="room_pure", label="x", capabilities=frozenset({"search", "offers"}), max_batch=10, stock_pooling="separate",
                            factory=lambda config: None, default_daily_budget=100, credential_fields=())
        carried, searched = budget.cost(spec, 1, "daily", 1), budget.cost(spec, 1, "daily", 0)
        half = room.part_cost(spec, {"carried_share": 0.5, "listings": 1}, 1, "daily")
        self.assertAlmostEqual(half, (carried + searched) / 2)


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class RoomTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.services.postgres_database import database
        from app.services.supply import room, watches
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.providers import registry
        from app.services.supply.providers.base import ProviderSpec
        from app.services.supply.providers.fake import FakeProvider
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.room, cls.watches, cls.registry = database, room, watches, registry
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_room_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        for key, assembly in (("room_demo", False), ("room_other", False), ("room_assembly", True)):
            registry.register(ProviderSpec(
                key=key, label=key, capabilities=frozenset({"search", "offers"}), max_batch=10, stock_pooling="separate",
                factory=lambda config: FakeProvider(config), default_daily_budget=100, credential_fields=(), assembly_only=assembly,
            ), replace=True)

    @classmethod
    def tearDownClass(cls) -> None:
        for key in ("room_demo", "room_other", "room_assembly"):
            cls.registry.unregister(key)
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        with self.store.connection() as conn:
            for table in ("supply_call_counts", "supply_discovery_runs", "supply_listings", "supply_watches", "supply_parts", "supply_manufacturer_aliases", "supply_manufacturers", "supply_connectors"):
                conn.execute(f"DELETE FROM {table}")

    def connector(self, provider: str = "room_demo", budget: int = 100) -> str:
        return self.connectors.create(actor=ACTOR, provider=provider, daily_budget=budget, interactive_reserve_pct=10)["id"]

    def track(self, count: int, cid: str, carried: int) -> None:
        """``count`` tier-1 parts, all searched at ``cid``, the first ``carried`` of them listed there once."""

        with self.store.connection() as conn:
            for n in range(count):
                self.watches.add_watch(conn, "Acme", f"P-{n:03d}", ACTOR, tier=1)
            ids = [row["part_id"] for row in conn.execute("SELECT part_id FROM supply_part_tiers ORDER BY part_id").fetchall()]
            for index, part_id in enumerate(ids):
                conn.execute("INSERT INTO supply_discovery_runs (part_id, connector_id, last_run_at, found) VALUES (%s, %s, %s, 1)", (part_id, cid, NOW))
                if index < carried:
                    conn.execute(
                        "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) "
                        "VALUES (%s, %s, %s, %s, 'x', 'Acme', 'exact')", (f"{cid}-{index}", cid, f"S{index}", part_id),
                    )
            from app.services.supply import admission

            admission.sync(conn)

    def view(self) -> dict:
        with self.store.connection() as conn:
            return self.room.view(conn, NOW)

    def test_room_is_counted_in_parts_like_the_ones_searched(self) -> None:
        cid = self.connector()
        self.track(12, cid, carried=6)
        (row,) = self.view()["accounts"]
        # 90 committed, 2 used; a typical part is carried half the time: (0.1333 + 1/14) / 2 a day, or (0.0254 + 1/30) / 2 weekly
        # (a part not carried is searched again every two weeks at tier 1, every month at tier 2).
        self.assertEqual((row["free"], row["searched"], row["carried_percent"]), (88, 12, 50))
        self.assertEqual(row["room"], {"daily": 859, "weekly": 2996})
        self.assertEqual(self.view()["headline"]["daily"], {"room": 859, "limited_by": row["name"]})

    def test_too_few_parts_searched_gives_no_figure(self) -> None:
        cid = self.connector()
        self.track(5, cid, carried=5)
        (row,) = self.view()["accounts"]
        self.assertEqual(row["room"], {"daily": None, "weekly": None})
        self.assertIsNone(self.view()["headline"]["daily"])

    def test_the_headline_is_the_distributor_that_fills_first_and_leaves_out_assembly(self) -> None:
        small, large = self.connector(budget=50), self.connector("room_other", budget=1000)
        assembly = self.connector("room_assembly", budget=10)
        self.track(12, small, carried=12)
        with self.store.connection() as conn:
            for other in (large, assembly):
                conn.execute(
                    "INSERT INTO supply_discovery_runs (part_id, connector_id, last_run_at, found) SELECT part_id, %s, %s, 0 FROM supply_part_tiers",
                    (other, NOW),
                )
        found = self.view()
        names = {row["connector_ids"][0]: row["name"] for row in found["accounts"]}
        self.assertEqual(found["headline"]["daily"]["limited_by"], names[small])
        self.assertIsNotNone(next(row for row in found["accounts"] if row["connector_ids"] == [assembly])["room"]["daily"])

    def test_parts_waiting_for_room_mean_none(self) -> None:
        cid = self.connector(budget=2)
        self.track(12, cid, carried=12)
        (row,) = self.view()["accounts"]
        self.assertGreater(row["waiting"], 0)
        self.assertEqual(row["room"]["daily"], 0)

    def test_what_tracking_really_spent_corrects_the_estimate(self) -> None:
        cid = self.connector(budget=1000)
        self.track(60, cid, carried=60)
        before = self.view()["accounts"][0]
        self.assertAlmostEqual(before["estimated_per_day"], 8.0)
        self.assertIsNone(before["measured_per_day"], "no week of spending yet")
        with self.store.connection() as conn:
            for back in range(1, 9):
                conn.execute(
                    "INSERT INTO supply_call_counts (connector_id, day, hour, kind, purpose, calls) VALUES (%s, %s, 3, 'offers', 'tier1', 16)",
                    (cid, NOW.date() - timedelta(days=back)),
                )
        after = self.view()["accounts"][0]
        self.assertEqual((after["measured_per_day"], after["factor"]), (16.0, 2.0))
        self.assertEqual(after["room"]["daily"], before["room"]["daily"] // 2)


if __name__ == "__main__":
    unittest.main()
