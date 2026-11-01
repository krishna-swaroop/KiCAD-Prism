"""Behaviour found wrong in review and fixed: gone listings, change detection, review order, budgets, rollups.

Needs ``PRISM_DATABASE_URL``; each class works in a disposable schema.
"""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from supply_api_helpers import reading as _reading  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
ACTOR = "ana@example.com"
START = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)


class Clock:
    def __init__(self, now: datetime = START) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **delta) -> None:
        self.now += timedelta(**delta)


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class HardeningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.services.postgres_database import database
        from app.services.supply import discovery, jobs, ledger, parts, poller, retention, trouble, watches
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.csv_import_service import CsvImportService
        from app.services.supply.providers.base import ProviderConfig
        from app.services.supply.providers.fake import FakeProvider
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.discovery, cls.jobs, cls.ledger, cls.parts = database, discovery, jobs, ledger, parts
        cls.poller_module, cls.retention, cls.trouble, cls.watches = poller, retention, trouble, watches
        cls.FakeProvider, cls.ProviderConfig, cls.CsvImportService = FakeProvider, ProviderConfig, CsvImportService
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_hard_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)

    @classmethod
    def tearDownClass(cls) -> None:
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        with self.store.connection() as conn:
            for table in ("supply_events", "supply_listings", "supply_watches", "supply_parts", "supply_manufacturer_aliases", "supply_manufacturers", "supply_connectors", "supply_audit_events"):
                conn.execute(f"DELETE FROM {table}")
        self.clock = Clock()
        self.behaviour = None

    # --- helpers ----------------------------------------------------------

    def connector(self, provider: str = "fake", **overrides) -> str:
        values = dict(actor=ACTOR, provider=provider, currency="EUR", interactive_reserve_pct=10)
        values.update(overrides)
        return self.connectors.create(**values)["id"]

    def provider_for(self, connector_id: str):
        inner = self.FakeProvider(self.ProviderConfig(connector_id=connector_id, currency="EUR"), clock=self.clock)
        return self.behaviour(inner) if self.behaviour else inner

    def poller(self):
        return self.poller_module.Poller(self.connectors, store=self.store, provider_for=self.provider_for, clock=self.clock)

    def watch(self, mpn: str = "ABC123", **kwargs):
        kwargs.setdefault("tier", 1)  # read daily, as a tracked project's parts are
        with self.store.connection() as conn:
            return self.watches.add_watch(conn, "Acme", mpn, ACTOR, **kwargs)[0]

    def add_listing(self, part_id: str, connector_id: str, sku: str, state: str = "exact") -> str:
        listing_id = uuid.uuid4().hex
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) "
                "VALUES (%s, %s, %s, %s, 'x', 'Acme', %s)", (listing_id, connector_id, sku, part_id, state))
        return listing_id

    def rows(self, sql: str, *params):
        with self.store.connection() as conn:
            return conn.execute(sql, params).fetchall()

    def altering(self, **changes):
        class Altered:
            def __init__(self, inner): self.inner = inner
            def lookup_mpn(self, mpn, manufacturer=None): return self.inner.lookup_mpn(mpn, manufacturer)
            def get_offers(self, skus): return [replace(offer, **changes) for offer in self.inner.get_offers(skus)]
        self.behaviour = Altered

    # --- polling ----------------------------------------------------------

    def test_a_listing_that_disappears_raises_an_event(self) -> None:
        cid = self.connector()
        watch = self.watch()
        listing_id = self.add_listing(watch.part_id, cid, "FAKE-GHOST-CT")

        class DropsAll:
            def __init__(self, inner): self.inner = inner
            def get_offers(self, skus): return []

        self.behaviour = DropsAll
        poller = self.poller()
        for _ in range(3):
            poller.poll_connector(cid)
            self.clock.advance(hours=2)
        (event,) = self.rows("SELECT kind, part_id, listing_id, payload FROM supply_events")
        self.assertEqual((event["kind"], event["part_id"], event["listing_id"]), ("listing_gone", watch.part_id, listing_id))
        self.assertEqual(event["payload"], {"sku": "FAKE-GHOST-CT", "packaging": "unknown"})

    def test_a_lifecycle_change_counts_as_a_change(self) -> None:
        from app.services.supply.vocabulary import Lifecycle

        cid = self.connector()
        watch = self.watch()
        self.add_listing(watch.part_id, cid, "FAKE-ABC123-CT")
        poller = self.poller()
        poller.poll_connector(cid)
        (first,) = self.rows("SELECT last_change_at FROM supply_poll_state")
        self.clock.advance(days=2)
        self.altering(lifecycle=Lifecycle.NRND)
        poller.poll_connector(cid)
        (second,) = self.rows("SELECT last_change_at, tier FROM supply_poll_state")
        self.assertGreater(second["last_change_at"], first["last_change_at"], "NRND is news even when stock and price did not move")
        self.assertEqual(len(self.rows("SELECT 1 FROM supply_samples")), 2)

    def test_a_missing_listing_keeps_its_schedule_and_urgency(self) -> None:
        cid = self.connector()
        watch = self.watch(pinned=True)
        self.add_listing(watch.part_id, cid, "FAKE-ABC123-CT")
        self.poller().poll_connector(cid)
        self.assertEqual(self.rows("SELECT tier, urgency FROM supply_poll_state")[0]["urgency"], 0)

        class DropsAll:
            def __init__(self, inner): self.inner = inner
            def get_offers(self, skus): return []

        self.behaviour = DropsAll
        self.clock.advance(days=2)
        self.poller().poll_connector(cid)
        (state,) = self.rows("SELECT tier, urgency, missing_streak FROM supply_poll_state")
        self.assertEqual((state["tier"], state["urgency"], state["missing_streak"]), ("daily", 0, 1))

    def test_a_sample_remembers_marketplace_stock(self) -> None:
        cid = self.connector()
        self.add_listing(self.watch().part_id, cid, "FAKE-ABC123-CT")
        self.altering(marketplace=True)
        self.poller().poll_connector(cid)
        self.assertTrue(self.rows("SELECT marketplace FROM supply_samples")[0]["marketplace"])

    # --- discovery --------------------------------------------------------

    def test_a_listing_waiting_for_review_stays_with_the_first_part_it_was_found_for(self) -> None:
        from app.services.supply.models import PartMatch

        cid = self.connector()
        a, b = self.watch("PART-A"), self.watch("PART-B")

        class Stub:
            def lookup_mpn(self, mpn, manufacturer=None):
                return [PartMatch(provider="fake", sku="S1", mpn="PART-C", manufacturer="Acme")]

        service = self.discovery.DiscoveryService(lambda _cid: Stub(), self.store)
        service.discover(a.part_id, cid)
        service.discover(b.part_id, cid)
        (listing,) = self.rows("SELECT part_id, match_state FROM supply_listings")
        self.assertEqual((listing["part_id"], listing["match_state"]), (a.part_id, "near"))

    def test_uploading_a_file_has_the_connector_searched_again(self) -> None:
        cid = self.connector("csv")
        watch = self.watch()
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_discovery_runs (part_id, connector_id, last_run_at, found) VALUES (%s, %s, %s, 0)",
                (watch.part_id, cid, START))
        self.CsvImportService(self.connectors, self.store).import_file(
            cid, b"sku,mpn,manufacturer,stock\nC1,ABC123,Acme,10\n", actor=ACTOR, filename="f.csv")
        self.assertEqual(self.rows("SELECT 1 FROM supply_discovery_runs"), [])

    def test_a_connector_that_reads_the_jlcparts_catalogue_imports_the_known_parts_twice_a_day(self) -> None:
        from app.services.supply import csv_import_service
        from test_supply_jlc_catalogue import files

        jlc = self.connector("jlcpcb")
        with self.assertRaises(Exception):
            self.connectors.update(self.connector("csv"), actor=ACTOR, catalogue=True)
        self.assertEqual((self.connectors.get(jlc)["catalogue"], self.connectors.get(jlc)["catalogue_available"]), (False, True))
        self.watch("NE555DR")
        published = files()
        fetch_for = lambda base: published.__getitem__  # noqa: E731
        with self.store.connection() as conn:
            self.assertEqual(csv_import_service.refresh_catalogues(conn, START, fetch_for=fetch_for), 0, "off until an administrator turns it on")
        self.connectors.update(jlc, actor=ACTOR, catalogue=True)
        with self.store.connection() as conn:
            self.assertEqual(csv_import_service.refresh_catalogues(conn, START, fetch_for=fetch_for), 1)
            self.assertEqual(csv_import_service.refresh_catalogues(conn, START + timedelta(hours=1), fetch_for=fetch_for), 0, "not due yet")
        self.assertEqual([(r["sku"], r["jlc_preferred"]) for r in self.rows("SELECT sku, jlc_preferred FROM supply_csv_offers WHERE connector_id = %s", jlc)], [("C7593", True)])
        self.assertEqual(self.connectors.get(jlc)["csv_import"]["filename"], "jlcparts 2026-10-29T10:26:45+00:00")

        def broken(base):
            def fetch(name):
                raise RuntimeError("offline")
            return fetch

        with self.store.connection() as conn:
            self.assertEqual(csv_import_service.refresh_catalogues(conn, START + timedelta(hours=13), fetch_for=broken), 0)
        self.assertEqual(self.connectors.get(jlc)["last_error_code"], "catalogue")
        self.assertEqual(len(self.rows("SELECT 1 FROM supply_csv_offers WHERE connector_id = %s", jlc)), 1, "the old offers stand")

    # --- budget and cooldown ----------------------------------------------

    def test_keeping_part_of_the_pool_leaves_it_for_people(self) -> None:
        cid = self.connector(daily_budget=100, interactive_reserve_pct=10)
        connector = self.connectors.get(cid)
        taken = 0
        while self.ledger.spend_call(self.store, connector, now=self.clock.now, interactive=True, keep_pool_pct=50):
            taken += 1
        self.assertEqual(taken, 5, "half of the 10-call pool")
        self.assertTrue(self.ledger.spend_call(self.store, connector, now=self.clock.now, interactive=True), "people still have the rest")

    def test_a_connector_with_no_budget_for_now_queues_no_job(self) -> None:
        cid = self.connector(daily_budget=10, interactive_reserve_pct=0)
        self.watch()
        self.assertEqual(self.work(), [cid])
        while self.ledger.spend_call(self.store, self.connectors.get(cid), now=self.clock.now):
            pass
        self.assertEqual(self.work(), [], "the budget for this stretch of the day is spent")
        self.clock.advance(minutes=30)
        self.assertEqual(self.work(), [], "the new day's start is held back a few minutes after the reset")
        self.clock.advance(hours=12, minutes=30)
        self.assertEqual(self.work(), [cid], "the next day has opened by the early morning")

    def test_a_free_connector_is_never_held_back_by_budget(self) -> None:
        cid = self.connector("csv")
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) "
                "VALUES ('l1', %s, 'C1', %s, 'x', 'Acme', 'exact')", (cid, self.watch().part_id))
        self.assertEqual(self.work(), [cid])

    def work(self) -> list[str]:
        with self.store.connection() as conn:
            return self.jobs.connectors_with_work(conn, self.clock.now)

    def test_a_provider_cannot_hold_a_connector_off_for_weeks(self) -> None:
        from app.services.supply.providers.base import RateLimited

        cid = self.connector()
        self.trouble.react(self.connectors, self.store, cid, RateLimited("slow down", retry_after_seconds=10_000_000), self.clock.now)
        (row,) = self.rows("SELECT cooldown_until FROM supply_connectors WHERE id = %s", cid)
        self.assertEqual(row["cooldown_until"], self.clock.now + self.trouble.MAX_COOLDOWN)

    def test_a_batch_that_costs_two_calls_is_charged_two(self) -> None:
        from app.services.supply.providers import registry
        from app.services.supply.providers.base import ProviderSpec

        registry.register(ProviderSpec(
            key="demo_twocall", label="Two calls", capabilities=frozenset({"offers"}), max_batch=10,
            stock_pooling="separate", credential_fields=(), factory=lambda config: self.FakeProvider(config),
            calls_per_offers_batch=2,
        ), replace=True)
        try:
            cid = self.connector("demo_twocall", daily_budget=1000)
            self.add_listing(self.watch().part_id, cid, "FAKE-ABC123-CT")
            summary = self.poller().poll_connector(cid)
            (row,) = self.rows("SELECT spent FROM supply_quota_ledger WHERE account_id = %s", cid)
            self.assertEqual((summary.calls, row["spent"]), (1, 2), "one batch, two calls on the budget")
        finally:
            registry.unregister("demo_twocall")

    # --- rollups ----------------------------------------------------------

    def test_old_samples_become_daily_rollups_and_recent_ones_stay(self) -> None:
        cid = self.connector()
        listing = self.add_listing(self.watch().part_id, cid, "A")
        old = datetime(2025, 12, 1, 8, 0, tzinfo=timezone.utc)
        recent = START - timedelta(days=5)
        with self.store.connection() as conn:
            for hours, stock, price, lead in ((0, 10, "1.0", 70), (6, 4, "1.2", 63), (12, 7, "1.1", 56)):
                _reading(conn, listing, old + timedelta(hours=hours), stock, price=price, moq=10, lead_time_days=lead, lifecycle="nrnd")
            conn.execute("INSERT INTO supply_samples (listing_id, sampled_at, stock) VALUES (%s, %s, 99)", (listing, recent))
            removed = self.retention.compact_samples(conn, START)
        self.assertEqual(removed, 3)
        (daily,) = self.rows("SELECT * FROM supply_samples_daily")
        # The day's last reading, every column of it.
        self.assertEqual((daily["day"], daily["stock"], daily["lead_time_days"], daily["lifecycle"], daily["moq"]), (old.date(), 7, 56, "nrnd", 10))
        self.assertNotIn("unit_price", daily, "a price is kept as price breaks, not on a reading")
        with self.store.connection() as conn:
            from app.services.supply.history import days_sql

            days = conn.execute(f"SELECT day, stock FROM {days_sql('SELECT unnest(%(ids)s::text[])')} d ORDER BY day", {"ids": [listing]}).fetchall()
        self.assertEqual([(row["day"], row["stock"]) for row in days], [(old.date(), 7), (recent.date(), 99)], "one history, daily rows then raw")
        self.assertEqual(len(self.rows("SELECT 1 FROM supply_samples")), 1, "the recent sample is untouched")
        with self.store.connection() as conn:
            self.assertEqual(self.retention.compact_samples(conn, START), 0, "nothing left to do")

    def test_what_counts_is_one_rule_for_the_list_and_the_part_sheet(self) -> None:
        from app.services.supply import counted, parts_view, stock

        with self.store.connection() as conn:
            known = {state: conn.execute("SELECT supply_counted(%s) AS c", (state,)).fetchone()["c"]
                     for state in ("exact", "manual", "near", "gone", "rejected", "manufacturer_unresolved")}
        self.assertEqual({state for state, yes in known.items() if yes}, set(counted.STATES), "the database's copy of the counted states")
        part = self.watch().part_id
        on, off = self.connector(), self.connector("csv")
        for connector_id, held in ((on, 40), (off, 500)):
            listing = self.add_listing(part, connector_id, f"SKU-{held}")
            with self.store.connection() as conn:
                conn.execute("INSERT INTO supply_offers (listing_id, fetched_at, stock, currency) VALUES (%s, %s, %s, 'EUR')", (listing, START, held))
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_connectors SET enabled = FALSE WHERE id = %s", (off,))
            listed = parts_view.summaries_for(conn, [part])[0]["stock"]
            sheet = parts_view.part_detail(conn, part, now=START)["stock"]
            alone = stock.part_stock(conn, part).total
        self.assertEqual((listed, sheet, alone), (40, 40, 40), "a disabled connector's stock counts nowhere")

    def test_the_part_sheet_and_the_bom_read_the_summary_the_list_keeps(self) -> None:
        from app.services.supply import parts_view

        part = self.watch().part_id
        listing = self.add_listing(part, self.connector(), "SKU-1")
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_offers (listing_id, fetched_at, stock, currency) VALUES (%s, %s, 40, 'EUR')", (listing, START))
        with self.store.connection() as conn:
            self.assertEqual(parts_view.summaries_for(conn, [part])[0]["stock"], 40)
        with self.store.connection() as conn:
            # Change the kept row behind the triggers' back: whoever reads it shows the change, whoever works it out does not.
            conn.execute("UPDATE supply_part_summaries SET stock = 7, price = price || '{\"unit_price\": \"9.9\"}' WHERE part_id = %s", (part,))
        with self.store.connection() as conn:
            sheet = parts_view.part_detail(conn, part, now=START)
            items, _offers = parts_view.summaries_with_offers(conn, [part])
        self.assertEqual((sheet["stock"], sheet["price"]["headline"]["unit_price"]), (7, "9.9"))
        self.assertEqual((items[0]["stock"], items[0]["unit_price"]), (7, "9.9"))

    def test_a_connector_can_keep_raw_samples_for_fewer_days(self) -> None:
        short = self.connector("fake", storefront="")
        self.connectors.update(short, actor="a@example.com", retention_days=10)
        with self.assertRaises(Exception):
            self.connectors.update(short, actor="a@example.com", retention_days=0)
        kept = self.connector("csv")
        part = self.watch().part_id
        one, two = self.add_listing(part, short, "S"), self.add_listing(part, kept, "K")
        stamp = START - timedelta(days=20)
        with self.store.connection() as conn:
            for listing in (one, two):
                conn.execute("INSERT INTO supply_samples (listing_id, sampled_at, stock) VALUES (%s, %s, 5)", (listing, stamp))
            self.assertEqual(self.retention.compact_samples(conn, START), 1, "only the short-keeping connector's sample is old enough")
        self.assertEqual([r["listing_id"] for r in self.rows("SELECT listing_id FROM supply_samples")], [two])
        self.assertEqual([r["listing_id"] for r in self.rows("SELECT listing_id FROM supply_samples_daily")], [one])
        self.connectors.update(short, actor="a@example.com", retention_days=None)
        self.assertIsNone(self.connectors.get(short)["retention_days"])

    def test_the_storefront_can_move_to_another_one_the_provider_offers(self) -> None:
        mine = self.connector("farnell", storefront="il.farnell.com", credentials={"api_key": "key-1"})
        moved = self.connectors.update(mine, actor="a@example.com", storefront="it.farnell.com")
        self.assertEqual(moved["storefront"], "it.farnell.com")
        for bad in ("nowhere.example", ""):
            with self.assertRaises(Exception):
                self.connectors.update(mine, actor="a@example.com", storefront=bad)
        other = self.connector("farnell", storefront="uk.farnell.com", credentials={"api_key": "key-2"})
        with self.assertRaises(Exception):
            self.connectors.update(other, actor="a@example.com", storefront="it.farnell.com")
        with self.assertRaises(Exception):
            self.connectors.update(self.connector("fake", storefront=""), actor="a@example.com", storefront="x")

    def test_a_connector_that_may_not_store_history_loses_all_of_it_past_its_limit(self) -> None:
        limited = self.connector("fake", storefront="")
        free = self.connector("csv")
        with self.assertRaises(Exception):
            self.connectors.update(limited, actor="a@example.com", keep_days=0)
        self.connectors.update(limited, actor="a@example.com", keep_days=30)
        part = self.watch().part_id
        one, two = self.add_listing(part, limited, "L"), self.add_listing(part, free, "F")
        old = START - timedelta(days=45)
        with self.store.connection() as conn:
            for listing in (one, two):
                conn.execute("INSERT INTO supply_samples (listing_id, sampled_at, stock) VALUES (%s, %s, 5)", (listing, old))
                conn.execute("INSERT INTO supply_samples (listing_id, sampled_at, stock) VALUES (%s, %s, 5)", (listing, START - timedelta(days=5)))
                conn.execute(
                    "INSERT INTO supply_samples_daily (listing_id, day, stock) VALUES (%s, %s, 5)",
                    (listing, old.date()))
            self.assertEqual(self.retention.drop_expired(conn, START), 2, "its old sample and its old daily row")
        self.assertEqual(sorted(r["listing_id"] for r in self.rows("SELECT listing_id FROM supply_samples")), sorted([one, two, two]))
        self.assertEqual([r["listing_id"] for r in self.rows("SELECT listing_id FROM supply_samples_daily")], [two])
        self.assertEqual(self.connectors.get(limited)["keep_days"], 30)

    def test_the_history_limit_covers_every_listing_history_but_keeps_what_describes_today(self) -> None:
        limited = self.connector("fake", storefront="")
        free = self.connector("csv")
        self.connectors.update(limited, actor="a@example.com", keep_days=30)
        part = self.watch().part_id
        old, older, recent = START - timedelta(days=45), START - timedelta(days=90), START - timedelta(days=5)
        with self.store.connection() as conn:
            for listing in (self.add_listing(part, limited, "L"), self.add_listing(part, free, "F")):
                breaks = "INSERT INTO supply_price_breaks_history (listing_id, since, breaks) VALUES (%s, %s, '[]'::jsonb)"
                # Ended 45 days ago; held since then, so still today's price.
                conn.execute(breaks, (listing, older))
                conn.execute(breaks, (listing, old))
                stock = "INSERT INTO supply_stock_events (listing_id, day, kind, stock_before, stock_after, resolved_on) VALUES (%s, %s, %s, 5, 0, %s)"
                conn.execute(stock, (listing, older.date(), "stock_out", old.date()))
                conn.execute(stock, (listing, old.date(), "stock_out", None))  # still out
                conn.execute(stock, (listing, old.date(), "restock", None))
                promise = ("INSERT INTO supply_arrival_promises (listing_id, expected, quantity, first_seen_at, last_seen_at, state, resolved_at) "
                           "VALUES (%s, %s, 10, %s, %s, %s, %s)")
                conn.execute(promise, (listing, old.date(), older, old, "arrived", old))
                conn.execute(promise, (listing, recent.date(), old, recent, "open", None))
                conn.execute("INSERT INTO supply_events (at, kind, part_id, listing_id) VALUES (%s, 'lifecycle_changed', %s, %s)", (old, part, listing))
                conn.execute("INSERT INTO supply_events (at, kind, part_id, listing_id) VALUES (%s, 'lifecycle_changed', %s, %s)", (recent, part, listing))
            conn.execute("INSERT INTO supply_call_counts (connector_id, day, hour, kind, purpose, calls) VALUES (%s, %s, 0, 'offers', 'scheduled', 3)",
                         (free, (START - timedelta(days=120)).date()))
            self.assertEqual(self.retention.drop_expired(conn, START), 6, "five old rows of the limited listing, and the old call count")
        left = lambda table: len(self.rows(f"SELECT 1 FROM {table}"))  # noqa: E731
        self.assertEqual(left("supply_price_breaks_history"), 3, "the ended breaks of the limited listing go; today's stay")
        self.assertEqual(left("supply_stock_events"), 4, "the stock-out still open stays")
        self.assertEqual(left("supply_arrival_promises"), 3, "the open promise stays")
        self.assertEqual(left("supply_events"), 3)
        self.assertEqual(left("supply_call_counts"), 0)

    def test_a_distributor_that_limits_storage_keeps_prices_of_parts_not_in_use_only_for_the_read_window(self) -> None:
        limited = self.connector("farnell", storefront="uk.farnell.com", credentials={"api_key": "key-1"})
        allowed = self.connector("farnell", storefront="it.farnell.com", credentials={"api_key": "key-2"})
        own = self.connector("csv")
        with self.assertRaises(Exception):
            self.connectors.update(allowed, actor="a@example.com", keep_unused="yes")
        self.connectors.update(allowed, actor="a@example.com", keep_unused=True)
        self.assertEqual((self.connectors.get(limited)["limits_storage"], self.connectors.get(limited)["keep_unused"]), (True, False))
        self.assertEqual((self.connectors.get(allowed)["keep_unused"], self.connectors.get(own)["limits_storage"]), (True, False))
        used = self.watch("USED1").part_id
        unused = self.watch("SPARE1").part_id
        with self.store.connection() as conn:
            conn.execute("DELETE FROM supply_part_tiers WHERE part_id = %s", (unused,))
        stale, fresh = START - timedelta(hours=30), START - timedelta(hours=2)
        listings = {
            "used": (self.add_listing(used, limited, "U"), stale),
            "stale": (self.add_listing(unused, limited, "S"), stale),
            "fresh": (self.add_listing(unused, limited, "F"), fresh),
            "allowed": (self.add_listing(unused, allowed, "A"), stale),
            "own": (self.add_listing(unused, own, "O"), stale),
        }
        with self.store.connection() as conn:
            for listing, fetched in listings.values():
                conn.execute("INSERT INTO supply_offers (listing_id, fetched_at, stock) VALUES (%s, %s, 5)", (listing, fetched))
                conn.execute("INSERT INTO supply_samples (listing_id, sampled_at, stock) VALUES (%s, %s, 5)", (listing, fetched))
                conn.execute("INSERT INTO supply_samples_daily (listing_id, day, stock) VALUES (%s, %s, 5)", (listing, (fetched - timedelta(days=3)).date()))
            self.assertEqual(self.retention.drop_unused(conn, START), 1, "only the stale read of a part not in use, where storage is limited")
            self.assertEqual(self.retention.drop_unused(conn, START), 0, "nothing left to clear")
        gone = listings["stale"][0]
        for table in ("supply_offers", "supply_samples", "supply_samples_daily"):
            kept = {r["listing_id"] for r in self.rows(f"SELECT listing_id FROM {table}")}
            self.assertEqual(kept, {listing for listing, _ in listings.values()} - {gone}, table)
        self.assertEqual(len(self.rows("SELECT 1 FROM supply_listings WHERE id = %s", gone)), 1, "its part number stays")

    def test_the_first_run_on_a_long_history_works_in_slices(self) -> None:
        cid = self.connector()
        listing = self.add_listing(self.watch().part_id, cid, "A")
        first = datetime(2025, 6, 1, 8, 0, tzinfo=timezone.utc)
        with self.store.connection() as conn:
            for day in (0, 20, 40, 90):
                conn.execute("INSERT INTO supply_samples (listing_id, sampled_at, stock) VALUES (%s, %s, 5)", (listing, first + timedelta(days=day)))
            removed = [self.retention.compact_samples(conn, START) for _ in range(4)]
        self.assertEqual(removed, [2, 1, 1, 0], "30 days a run: days 0 and 20, then 40, then 90, then nothing")
        self.assertEqual(len(self.rows("SELECT 1 FROM supply_samples_daily")), 4)


if __name__ == "__main__":
    unittest.main()
