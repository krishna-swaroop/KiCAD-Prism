"""A week of reading on a fake clock, a weekend included, against a daily budget.

Asserts what the scheduler promises: committed work is always served (every admitted tier-1 listing each provider day,
every admitted tier-2 listing about weekly), no share overspends (the day, the committed share and the pool each stay
within their limit), parts waiting for room are read from spare budget only, and spare is released outside working hours.
Needs ``PRISM_DATABASE_URL``.
"""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
ACTOR = "sim@example.com"
# Monday 2026-03-02, half past midnight UTC: past the account's start delay of at most half an hour.
START = datetime(2026, 3, 2, 0, 31, tzinfo=timezone.utc)
BUDGET = 40
RESERVE_PCT = 10  # a pool of 4 calls, so a committed share of 36
TIER_ONE = 30
TIER_TWO = 250


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class SchedulerSimulationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.services.postgres_database import database
        from app.services.supply import admission, jobs, parts, poller, watches
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.discoverer import Discoverer
        from app.services.supply.providers import registry
        from app.services.supply.providers.base import ProviderConfig, ProviderSpec
        from app.services.supply.providers.fake import FakeProvider
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.admission, cls.jobs, cls.parts, cls.poller_module, cls.watches = database, admission, jobs, parts, poller, watches
        cls.Discoverer = Discoverer
        cls.registry, cls.FakeProvider, cls.ProviderConfig = registry, FakeProvider, ProviderConfig
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_sim_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        registry.register(ProviderSpec(
            key="sim_batch", label="Sim", capabilities=frozenset({"search", "offers"}), max_batch=2, stock_pooling="separate",
            credential_fields=(), factory=lambda config: FakeProvider(config), default_daily_budget=BUDGET,
        ), replace=True)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.registry.unregister("sim_batch")
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def test_a_week_serves_committed_work_never_overspends_and_reads_waiting_parts_from_spare(self) -> None:
        now = {"t": START}

        def clock() -> datetime:
            return now["t"]

        reads: dict[str, list[datetime]] = defaultdict(list)
        FakeProvider = self.FakeProvider

        class Counting(FakeProvider):
            def get_offers(self, skus):
                for sku in skus:
                    reads[sku].append(clock())
                return super().get_offers(skus)

        connector = self.connectors.create(
            actor=ACTOR, provider="sim_batch", currency="EUR", interactive_reserve_pct=RESERVE_PCT, daily_budget=BUDGET,
        )["id"]
        searched = datetime(2026, 2, 20, tzinfo=timezone.utc)
        sku_of: dict[str, str] = {}
        with self.store.connection() as conn:
            for index in range(TIER_ONE + TIER_TWO):
                mpn = f"SIM-{index:03d}"
                tier = 1 if index < TIER_ONE else 2
                record, _created = self.watches.add_watch(conn, "Acme", mpn, ACTOR, tier=tier, rate="weekly")
                sku = f"FAKE-{mpn}-CT"
                sku_of[record.part_id] = sku
                conn.execute(
                    "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) "
                    "VALUES (%s, %s, %s, %s, %s, 'Acme', 'exact')", (f"l{index}", connector, sku, record.part_id, mpn))
                conn.execute(
                    "INSERT INTO supply_discovery_runs (part_id, connector_id, last_run_at, found) VALUES (%s, %s, %s, 1)",
                    (record.part_id, connector, searched))
            self.admission.sync(conn, START)
            states = {
                row["part_id"]: row["state"]
                for row in conn.execute("SELECT part_id, state FROM supply_admissions WHERE connector_id = %s", (connector,)).fetchall()
            }
            tiers = {row["part_id"]: int(row["tier"]) for row in conn.execute("SELECT part_id, tier FROM supply_part_tiers").fetchall()}
        admitted = {sku_of[p] for p, s in states.items() if s == "admitted"}
        waiting = {sku_of[p] for p, s in states.items() if s == "waiting"}
        admitted_one = {sku_of[p] for p, s in states.items() if s == "admitted" and tiers[p] == 1}
        admitted_two = admitted - admitted_one
        self.assertEqual(len(admitted_one), TIER_ONE, "every tier-1 part is admitted")
        self.assertGreater(len(waiting), 0, "the committed share cannot hold every tier-2 part")

        def provider_for(connector_id: str):
            return Counting(self.ProviderConfig(connector_id=connector_id, currency="EUR"), clock=clock)

        poller = self.poller_module.Poller(self.connectors, store=self.store, provider_for=provider_for, clock=clock)
        discoverer = self.Discoverer(self.connectors, store=self.store, provider_for=provider_for, clock=clock)
        hours = 7 * 24
        for _hour in range(hours):
            summary = poller.poll_connector(connector)
            if summary.stopped in (None, "nothing_due", "budget"):
                with self.store.connection() as conn:
                    self.jobs.refresh_scheduled(conn, connector, now["t"])
                self.jobs._spend_spare(self.connectors, connector, poller=poller, discoverer=discoverer)
            now["t"] += timedelta(hours=1)

        with self.store.connection() as conn:
            ledger = conn.execute(
                "SELECT day, spent, interactive_spent, spare_spent FROM supply_quota_ledger WHERE account_id = %s ORDER BY day", (connector,)
            ).fetchall()
            by_purpose = {
                (row["day"], row["purpose"]): int(row["n"])
                for row in conn.execute(
                    "SELECT day, purpose, SUM(calls) AS n FROM supply_call_counts WHERE connector_id = %s AND kind <> 'refused' GROUP BY day, purpose",
                    (connector,),
                ).fetchall()
            }
            counted = conn.execute("SELECT COALESCE(SUM(calls), 0) AS n FROM supply_call_counts WHERE kind <> 'refused'").fetchone()["n"]

        committed_share = BUDGET - (-(-BUDGET * RESERVE_PCT // 100))
        for row in ledger:
            self.assertLessEqual(row["spent"], BUDGET, f"{row['day']} spent more than the budget")
            self.assertLessEqual(row["spent"] - row["interactive_spent"] - row["spare_spent"], committed_share,
                                 f"{row['day']} spent more than the committed share on committed work")
        self.assertEqual(int(counted), sum(row["spent"] for row in ledger), "the breakdown adds up to what was spent")

        # Committed work is always served. Day one starts with everything due, so it is read within the first day.
        first_day = START.date()
        for sku in admitted_one:
            days = {moment.date() for moment in reads[sku]}
            missed = [d for d in (first_day + timedelta(days=n) for n in range(7)) if d not in days]
            self.assertLessEqual(len(missed), 1, f"{sku} missed {missed}")
        for sku in admitted_two:
            self.assertGreaterEqual(len(reads[sku]), 1, f"{sku} was never read")
            self.assertLessEqual(len(reads[sku]), 3, f"{sku} was read more than weekly would")

        # Parts waiting for room are read only from spare budget, and spare was spent on them.
        spare_calls = sum(n for (day, purpose), n in by_purpose.items() if purpose == "spare")
        self.assertGreater(spare_calls, 0, "spare budget was used")
        self.assertGreater(sum(1 for sku in waiting if reads[sku]), 0, "some waiting parts were read from spare")
        weekend = [d for d in ledger if d["day"].weekday() >= 5]
        self.assertTrue(any(row["spare_spent"] > 0 for row in weekend), "spare was released on the weekend")
        for row in ledger:
            self.assertLessEqual(row["interactive_spent"], BUDGET - committed_share, "the pool was not overspent")


    def test_spare_budget_reads_a_tier_two_part_early_at_most_once_a_day(self) -> None:
        # Few tier-2 parts and a large budget: in the last hours before the reset everything left is spare, and the
        # scheduler runs every few minutes. Each part must still be read early only once, not on every run.
        now = {"t": datetime(2026, 3, 4, 20, 0, tzinfo=timezone.utc)}

        def clock() -> datetime:
            return now["t"]

        reads: dict[str, int] = defaultdict(int)
        FakeProvider = self.FakeProvider

        class Counting(FakeProvider):
            def get_offers(self, skus):
                for sku in skus:
                    reads[sku] += 1
                return super().get_offers(skus)

        with self.store.connection() as conn:
            for table in ("supply_listings", "supply_watches", "supply_parts", "supply_manufacturer_aliases", "supply_manufacturers", "supply_connectors"):
                conn.execute(f"DELETE FROM {table}")
        connector = self.connectors.create(
            actor=ACTOR, provider="sim_batch", currency="EUR", interactive_reserve_pct=RESERVE_PCT, daily_budget=1000,
        )["id"]
        with self.store.connection() as conn:
            for index in range(5):
                mpn = f"EARLY-{index}"
                record, _created = self.watches.add_watch(conn, "Acme", mpn, ACTOR, tier=2, rate="weekly")
                conn.execute(
                    "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) "
                    "VALUES (%s, %s, %s, %s, %s, 'Acme', 'exact')", (f"e{index}", connector, f"FAKE-{mpn}-CT", record.part_id, mpn))
                conn.execute(
                    "INSERT INTO supply_discovery_runs (part_id, connector_id, last_run_at, found) VALUES (%s, %s, %s, 1)",
                    (record.part_id, connector, now["t"]))
            self.admission.sync(conn, now["t"])

        def provider_for(connector_id: str):
            return Counting(self.ProviderConfig(connector_id=connector_id, currency="EUR"), clock=clock)

        poller = self.poller_module.Poller(self.connectors, store=self.store, provider_for=provider_for, clock=clock)
        discoverer = self.Discoverer(self.connectors, store=self.store, provider_for=provider_for, clock=clock)
        for _run in range(12 * 6):  # every 5 minutes, 20:00 to 02:00, across the reset
            summary = poller.poll_connector(connector)
            if summary.stopped in (None, "nothing_due", "budget"):
                with self.store.connection() as conn:
                    self.jobs.refresh_scheduled(conn, connector, now["t"])
                self.jobs._spend_spare(self.connectors, connector, poller=poller, discoverer=discoverer)
            now["t"] += timedelta(minutes=5)
        self.assertEqual(len(reads), 5)
        self.assertTrue(all(count <= 2 for count in reads.values()), f"read again and again: {dict(reads)}")


if __name__ == "__main__":
    unittest.main()
