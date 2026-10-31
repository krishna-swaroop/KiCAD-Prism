"""Market indices over the followed parts. The metrics need nothing; the rest needs ``PRISM_DATABASE_URL``."""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.core.errors import install_error_handlers  # noqa: E402
from app.services.supply import market  # noqa: E402
from supply_api_helpers import reading as _reading  # noqa: E402
from supply_api_helpers import request as _request  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
NOW = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)


def row(stock, lifecycle="active", offers=()):
    return {"stock": stock, "lifecycle": lifecycle, "offers": list(offers)}


def offer(lead=None, dropped=False):
    return {"lead_time_days": lead, "discontinued": dropped}


class MetricTests(unittest.TestCase):
    def test_shares_and_the_median_lead_time(self) -> None:
        rows = [
            row(0, offers=[offer(84)]),
            row(500, "nrnd", offers=[offer(28), offer(56)]),
            row(900, offers=[offer()]),
            row(None, "obsolete"),
        ]
        result = market.metrics_of(rows)
        self.assertAlmostEqual(result["out_of_stock"], 1 / 3)
        self.assertEqual(result["lifecycle_risk"], 0.5)
        self.assertEqual(result["median_lead_time_days"], 56.0)

    def test_dropped_means_every_listing_of_the_part_was_dropped(self) -> None:
        rows = [row(0, offers=[offer(dropped=True), offer(dropped=True)]), row(5, offers=[offer(dropped=True), offer()]), row(5, offers=[offer()])]
        self.assertAlmostEqual(market.metrics_of(rows)["dropped"], 1 / 3)

    def test_nothing_read_gives_no_stock_shares_and_no_lead_time(self) -> None:
        result = market.metrics_of([row(None), row(None, "nrnd")])
        self.assertEqual(result, {"lifecycle_risk": 0.5})


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class MarketDatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_connectors, supply_market
        from app.core.security import AuthenticatedUser
        from app.services.postgres_database import database
        from app.services.supply import parts, watches
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.parts, cls.watches = database, parts, watches
        cls.users = {role: AuthenticatedUser(email=f"{role}@example.com", name=role, role=role) for role in ("viewer", "qa")}
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_market_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        cls.app = FastAPI()
        install_error_handlers(cls.app)
        cls.app.include_router(supply_market.router)
        cls.patcher = mock.patch.object(supply_connectors, "service", cls.connectors)
        cls.patcher.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.patcher.stop()
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        with self.store.connection() as conn:
            for table in ("supply_market_indices", "supply_samples", "supply_offers", "supply_listings", "supply_watches", "supply_parts", "supply_manufacturers", "supply_connectors"):
                conn.execute(f"DELETE FROM {table}")
            conn.execute("INSERT INTO supply_manufacturers (id, name, name_key) VALUES ('m1', 'Acme', 'acme'), ('m2', 'Globex', 'globex')")
            conn.execute("INSERT INTO supply_connectors (id, provider) VALUES ('c1', 'fake')")

    def follow(self, maker: str, mpn: str, stock: int, lifecycle: str = "active") -> None:
        with self.store.connection() as conn:
            record, _ = self.watches.add_watch(conn, maker, mpn, "seed@example.com")
            conn.execute(
                "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) VALUES (%s, 'c1', %s, %s, 'x', 'x', 'exact')",
                (f"l-{mpn}", mpn, record.part_id))
            conn.execute("INSERT INTO supply_offers (listing_id, fetched_at, stock, lifecycle) VALUES (%s, %s, %s, %s)", (f"l-{mpn}", NOW, stock, lifecycle))

    def test_a_group_needs_enough_parts_and_the_whole_set_is_always_given_its_size(self) -> None:
        for index in range(3):
            self.follow("Acme", f"A-{index}", 0 if index == 0 else 100, "nrnd" if index == 1 else "active")
        self.follow("Globex", "G-1", 50)
        with self.store.connection() as conn:
            scopes = market.compute(conn)
        self.assertEqual(set(scopes), {"all", "Acme"}, "Globex has one part, below the minimum")
        self.assertEqual((scopes["all"]["sample"], scopes["Acme"]["sample"]), (4, 3))
        self.assertAlmostEqual(scopes["Acme"]["metrics"]["out_of_stock"], 1 / 3)

    def test_a_snapshot_is_stored_once_a_day_and_compared_with_a_month_earlier(self) -> None:
        for index in range(3):
            self.follow("Acme", f"A-{index}", 100)
        with self.store.connection() as conn:
            self.assertGreater(market.snapshot(conn, date(2026, 2, 1)), 0)
            self.assertEqual(market.snapshot(conn, date(2026, 2, 1)), 0, "already stored today")
            conn.execute("UPDATE supply_offers SET stock = 0 WHERE listing_id = 'l-A-0'")
            market.snapshot(conn, date(2026, 3, 3))
            result = market.overview(conn)
        self.assertEqual((result["day"], result["compared_with"]), ("2026-03-03", "2026-02-01"))
        metric = result["scopes"][0]["metrics"]["out_of_stock"]
        self.assertEqual((metric["before"], round(metric["value"], 2)), (0.0, 0.33))
        self.assertEqual(result["scopes"][0]["scope"], "All followed parts")

    def test_parts_are_also_grouped_by_the_category_a_distributor_files_them_under(self) -> None:
        from app.services.supply import facts

        for index in range(3):
            self.follow("Acme" if index < 2 else "Globex", f"X-{index}", 100)
        with self.store.connection() as conn:
            for mpn, provider, category in (("X-0", "digikey", "Op Amps"), ("X-1", "mouser", "Op Amps"), ("X-2", "digikey", "Op Amps"), ("X-2", "mouser", "Other")):
                part = conn.execute("SELECT id FROM supply_parts WHERE mpn = %s", (mpn,)).fetchone()["id"]
                facts.set_one(conn, part, provider, "category", category, NOW)
            scopes = market.compute(conn)
            market.snapshot(conn, date(2026, 3, 1))
            history = market.history(conn, "out_of_stock", date(2026, 3, 2))
        self.assertEqual(scopes["category:Op Amps"]["sample"], 3, "DigiKey's wording wins over Mouser's")
        self.assertNotIn("category:Other", scopes)
        kinds = [(s["kind"], s["scope"]) for s in history["series"]]
        self.assertEqual(kinds[0], ("all", "All followed parts"))
        self.assertIn(("category", "Op Amps"), kinds)
        self.assertEqual(history["series"][0]["points"], [["2026-03-01", 0.0]])
        with self.assertRaises(ValueError):
            market.history(conn, "nonsense")

    def test_the_price_index_starts_at_100_and_follows_the_median_price_change(self) -> None:
        from datetime import datetime, timezone

        for index in range(3):
            self.follow("Acme", f"A-{index}", 100)

        def price(mpn: str, day: date, unit: str) -> None:
            with self.store.connection() as conn:
                _reading(conn, f"l-{mpn}", datetime(day.year, day.month, day.day, 12, tzinfo=timezone.utc), 100, price=unit)

        for mpn in ("A-0", "A-1", "A-2"):
            price(mpn, date(2026, 3, 1), "1.00")
        with self.store.connection() as conn:
            market.snapshot(conn, date(2026, 3, 1))
        # Two parts rise 10%, one falls 50%: the median change is +10%.
        price("A-0", date(2026, 3, 2), "1.10")
        price("A-1", date(2026, 3, 2), "1.10")
        price("A-2", date(2026, 3, 2), "0.50")
        with self.store.connection() as conn:
            market.snapshot(conn, date(2026, 3, 2))
            history = market.history(conn, "price_index", date(2026, 3, 3))
        line = history["series"][0]["points"]
        self.assertEqual([day for day, _ in line], ["2026-03-01", "2026-03-02"])
        self.assertAlmostEqual(line[0][1], 100.0)
        self.assertAlmostEqual(line[1][1], 110.0, places=3)

    def test_a_disabled_connector_s_prices_leave_the_price_index(self) -> None:
        from datetime import datetime, timezone

        for index in range(3):
            self.follow("Acme", f"A-{index}", 100)

        def price(mpn: str, day: date, unit: str) -> None:
            with self.store.connection() as conn:
                _reading(conn, f"l-{mpn}", datetime(day.year, day.month, day.day, 12, tzinfo=timezone.utc), 100, price=unit)

        for mpn in ("A-0", "A-1", "A-2"):
            price(mpn, date(2026, 3, 1), "1.00")
            price(mpn, date(2026, 3, 2), "2.00")
        with self.store.connection() as conn:
            self.assertEqual(len(market.price_changes(conn, [self.part_of("A-0")], datetime(2026, 3, 2, tzinfo=timezone.utc))), 1)
            conn.execute("UPDATE supply_connectors SET enabled = false WHERE id = 'c1'")
            self.assertEqual(market.price_changes(conn, [self.part_of("A-0")], datetime(2026, 3, 2, tzinfo=timezone.utc)), {})

    def part_of(self, mpn: str) -> str:
        with self.store.connection() as conn:
            return conn.execute("SELECT id FROM supply_parts WHERE mpn = %s", (mpn,)).fetchone()["id"]

    def test_the_history_is_for_readers_and_one_known_metric(self) -> None:
        self.assertEqual(_request(self.app, "GET", "/api/supply/market/history", user=self.users["qa"], query="metric=dropped").json,
                         {"metric": "dropped", "series": []})
        self.assertEqual(_request(self.app, "GET", "/api/supply/market/history", user=self.users["qa"], query="metric=bad").status, 422)
        self.assertEqual(_request(self.app, "GET", "/api/supply/market/history", user=self.users["viewer"], query="metric=dropped").status, 403)

    def test_nothing_stored_yet_says_so(self) -> None:
        with self.store.connection() as conn:
            self.assertEqual(market.overview(conn), {"day": None, "scopes": []})


if __name__ == "__main__":
    unittest.main()


class SignalTests(unittest.TestCase):
    def test_a_group_going_out_of_stock_or_stretching_its_lead_times_is_a_signal(self) -> None:
        from app.services.supply import market

        def scope(name, sample, **metrics):
            return {"scope": name, "kind": "manufacturer", "sample": sample, "metrics": {k: {"value": v[1], "before": v[0]} for k, v in metrics.items()}}

        found = market.signals([
            scope("Acme", 6, out_of_stock=(0.1, 0.4), median_lead_time_days=(40, 80)),
            scope("Calm", 6, out_of_stock=(0.1, 0.15), median_lead_time_days=(40, 45)),
            scope("Tiny", 2, out_of_stock=(0.0, 1.0)),
            scope("New", 6, out_of_stock=(None, 0.9)),
            {"scope": "All followed parts", "kind": "all", "sample": 20, "metrics": {"out_of_stock": {"value": 0.9, "before": 0.1}}},
        ])
        self.assertEqual([(item["scope"], item["signal"]) for item in found], [("Acme", "draining"), ("Acme", "lead_times")])
        self.assertIn("40% of the parts you follow are out of stock, up from 10%", found[0]["text"])
