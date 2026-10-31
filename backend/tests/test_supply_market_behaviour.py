"""How prices and restocks move across distributors, announced arrivals, new family members and silent attribute changes."""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply import price_behaviour, promises  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
D0 = date(2026, 1, 1)


def prices(*pairs):
    return [(D0 + timedelta(days=day), Decimal(str(price))) for day, price in pairs]


class PriceTests(unittest.TestCase):
    def test_a_move_under_half_a_percent_is_not_a_change(self) -> None:
        self.assertEqual(len(price_behaviour.changes(prices((0, 1.000), (1, 1.003), (2, 1.2)))), 1)

    def test_cadence_is_the_median_gap_and_needs_three_changes(self) -> None:
        steady = prices((0, 1), (10, 1.1), (20, 1.2), (30, 1.3), (40, 1.4))
        self.assertEqual(price_behaviour.cadence(steady), 10)
        self.assertIsNone(price_behaviour.cadence(prices((0, 1), (10, 1.1), (20, 1.2))))

    def test_who_goes_first_and_whether_the_others_follow(self) -> None:
        first = prices((0, 1.0), (5, 1.1), (30, 1.2), (60, 1.3), (90, 1.4))
        second = prices((0, 1.0), (8, 1.1), (33, 1.2), (63, 1.3), (95, 1.4))
        found = price_behaviour.leadership({"A": first, "B": second})
        self.assertEqual(found["leader"], "A")
        self.assertEqual(found["changes"], 8)
        self.assertGreaterEqual(found["followed_share"], 0.5)
        self.assertIsNone(price_behaviour.leadership({"A": first}), "one distributor leads nobody")
        self.assertIsNone(price_behaviour.leadership({"A": prices((0, 1), (5, 1.1)), "B": prices((0, 1), (6, 1.1))}), "too few changes")

    def test_a_dollar_price_that_did_not_move_can_still_move_in_euro(self) -> None:
        local = prices((0, 1.00), (90, 1.00))
        rates = {D0: Decimal("1.10"), D0 + timedelta(days=90): Decimal("1.00")}
        found = price_behaviour.fx_effect(local, rates, "USD", "EUR")
        self.assertEqual(found["local_percent"], 0.0)
        self.assertEqual(found["in_base_percent"], 10.0)
        self.assertEqual(found["exchange_percent"], 10.0)
        self.assertIsNone(price_behaviour.fx_effect(local, rates, "EUR", "EUR"))

    def test_who_restocks_first(self) -> None:
        def stock(*days):
            level, series = 0, []
            for day in range(0, 200):
                if day in days:
                    level = 1000
                elif day - 1 in days:
                    level = 10
                series.append((D0 + timedelta(days=day), level))
            return series

        found = price_behaviour.restock_order({"A": stock(10, 70, 130), "B": stock(14, 75, 134)})
        self.assertEqual((found["first"], found["rounds"]), ("A", 3))


class PromiseTests(unittest.TestCase):
    def test_a_rate_is_given_only_from_enough_resolved_arrivals(self) -> None:
        few = promises.summarize([("arrived", 2), ("slipped", None), ("open", None)])
        self.assertIsNone(few["on_time_share"])
        many = promises.summarize([("arrived", 2), ("arrived", 3), ("arrived", 20), ("slipped", None), ("open", None)])
        self.assertEqual((many["on_time"], many["on_time_share"], many["median_delay_days"], many["open"]), (2, 0.5, 3, 1))


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class DatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.services.postgres_database import database
        from app.services.supply import discovery, parts
        from app.services.supply.store import SupplyStore

        cls.database, cls.discovery, cls.parts = database, discovery, parts
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_behave_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()

    @classmethod
    def tearDownClass(cls) -> None:
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        with self.store.connection() as conn:
            for table in ("supply_events", "supply_listings", "supply_parts", "supply_manufacturer_aliases", "supply_manufacturers", "supply_connectors"):
                conn.execute(f"DELETE FROM {table}")
            conn.execute("INSERT INTO supply_manufacturers (id, name, name_key) VALUES ('m1', 'Acme', 'acme')")
            conn.execute("INSERT INTO supply_connectors (id, provider) VALUES ('c1', 'fake')")
            self.part = self.parts.ensure_part(conn, "Acme", "ABC-1", "seed@example.com")
            conn.execute(
                "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) VALUES ('l1', 'c1', 'S', %s, 'x', 'x', 'exact')",
                (self.part.id,))

    def test_an_announced_arrival_is_kept_and_found_to_have_come_late(self) -> None:
        from app.services.supply.models import Incoming

        t0 = datetime(2026, 3, 1, 12, tzinfo=timezone.utc)
        with self.store.connection() as conn:
            promises.record(conn, "l1", [Incoming(1000, date(2026, 3, 10))], 0, 0, t0)
            promises.record(conn, "l1", [Incoming(1000, date(2026, 3, 10))], 0, 0, t0 + timedelta(days=5))
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_arrival_promises").fetchone()["n"], 1, "one promise, seen twice")
            promises.record(conn, "l1", [], 0, 900, t0 + timedelta(days=15))
            row = conn.execute("SELECT state, delay_days FROM supply_arrival_promises").fetchone()
        self.assertEqual((row["state"], row["delay_days"]), ("arrived", 6))

    def test_a_new_later_date_means_it_slipped_and_silence_means_nothing_is_known(self) -> None:
        from app.services.supply.models import Incoming

        t0 = datetime(2026, 3, 1, 12, tzinfo=timezone.utc)
        with self.store.connection() as conn:
            promises.record(conn, "l1", [Incoming(500, date(2026, 3, 10))], 0, 0, t0)
            promises.record(conn, "l1", [Incoming(500, date(2026, 4, 10))], 0, 0, t0 + timedelta(days=12))
            promises.record(conn, "l1", [], 0, 0, t0 + timedelta(days=60))
            states = {row["expected"].isoformat(): row["state"] for row in conn.execute("SELECT expected, state FROM supply_arrival_promises").fetchall()}
        self.assertEqual(states, {"2026-03-10": "slipped", "2026-04-10": "gone"})

    def test_a_sibling_found_by_a_later_search_is_news_and_the_first_search_is_not(self) -> None:
        from app.services.supply.models import PartMatch

        def match(sku: str, mpn: str):
            return PartMatch(provider="fake", sku=sku, mpn=mpn, manufacturer="Acme")

        service = self.discovery.DiscoveryService(lambda cid: None, self.store)
        service.apply(self.part, [match("S1", "ABC-1X")], "c1")
        with self.store.connection() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_events WHERE kind = 'family_member_new'").fetchone()["n"], 0)
            conn.execute("INSERT INTO supply_discovery_runs (part_id, connector_id, last_run_at, found) VALUES (%s, 'c1', NOW(), 1)", (self.part.id,))
        service.apply(self.part, [match("S1", "ABC-1X"), match("S2", "ABC-1Y")], "c1")
        with self.store.connection() as conn:
            rows = conn.execute("SELECT payload FROM supply_events WHERE kind = 'family_member_new'").fetchall()
        self.assertEqual([row["payload"]["mpn"] for row in rows], ["ABC-1Y"])

    def test_an_attribute_that_changes_without_a_notice_is_an_event(self) -> None:
        with self.store.connection() as conn:
            self.discovery.remember_parameters(conn, self.part.id, "digikey", [("Package / Case", "0603")])
            self.discovery.remember_parameters(conn, self.part.id, "digikey", [("Package / Case", "0603")])
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_events").fetchone()["n"], 0)
            self.discovery.remember_parameters(conn, self.part.id, "digikey", [("Package / Case", "0805")])
            event = conn.execute("SELECT payload FROM supply_events WHERE kind = 'param_changed'").fetchone()
        self.assertEqual((event["payload"]["from"], event["payload"]["to"]), ("0603", "0805"))


if __name__ == "__main__":
    unittest.main()
