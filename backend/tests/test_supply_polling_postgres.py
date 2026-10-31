"""Watches, stock aggregation and the poller, with a fake clock and the simulated market.

Needs ``PRISM_DATABASE_URL``. Uses a disposable schema.
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
START = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)


class Clock:
    def __init__(self) -> None:
        self.now = START

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **delta) -> None:
        self.now += timedelta(**delta)


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class PollingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.services.postgres_database import database
        from app.services.supply import discovery, parts, poller, pricing, stock, watches
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.providers import registry
        from app.services.supply.providers.base import CredentialField, ProviderConfig, ProviderSpec
        from app.services.supply.providers.fake import FakeProvider
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.discovery, cls.parts, cls.poller_module = database, discovery, parts, poller
        cls.stock, cls.watches, cls.registry, cls.pricing = stock, watches, registry, pricing
        cls.FakeProvider, cls.ProviderConfig = FakeProvider, ProviderConfig
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_poll_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)

        # A metered provider that only takes two SKUs per call, to make batching and budgets visible.
        cls.small_spec = ProviderSpec(
            key="demo_small", label="Demo small", capabilities=frozenset({"offers"}), max_batch=2,
            stock_pooling="separate", credential_fields=(), factory=lambda config: FakeProvider(config),
            default_daily_budget=100,
        )
        registry.register(cls.small_spec, replace=True)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.registry.unregister("demo_small")
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        with self.store.connection() as conn:
            for table in ("supply_listings", "supply_watches", "supply_parts", "supply_manufacturer_aliases", "supply_manufacturers", "supply_connectors", "supply_audit_events"):
                conn.execute(f"DELETE FROM {table}")
        self.clock = Clock()
        self.provider_behaviour = None  # set by a test to wrap the provider

    # --- helpers ----------------------------------------------------------

    def connector(self, provider: str = "fake", **overrides) -> str:
        values = dict(actor=ACTOR, provider=provider, currency="EUR", interactive_reserve_pct=0)
        values.update(overrides)
        return self.connectors.create(**values)["id"]

    def provider_for(self, connector_id: str):
        inner = self.FakeProvider(self.ProviderConfig(connector_id=connector_id, currency="EUR"), clock=self.clock)
        return self.provider_behaviour(inner) if self.provider_behaviour else inner

    def poller(self):
        return self.poller_module.Poller(self.connectors, store=self.store, provider_for=self.provider_for, clock=self.clock)

    def watch(self, mpn: str = "ABC123", **kwargs):
        kwargs.setdefault("tier", 1)  # read daily, as a tracked project's parts are
        with self.store.connection() as conn:
            return self.watches.add_watch(conn, "Acme", mpn, ACTOR, **kwargs)[0]

    def discover(self, watch, connector_id: str) -> None:
        service = self.discovery.DiscoveryService(lambda cid: self.provider_for(cid), self.store)
        service.discover(watch.part_id, connector_id)

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

    def state_of(self, sku: str) -> dict:
        (row,) = self.rows("SELECT l.id, l.match_state, ps.* FROM supply_listings l LEFT JOIN supply_poll_state ps ON ps.listing_id = l.id WHERE l.sku = %s", sku)
        return dict(row)

    # --- watches ----------------------------------------------------------

    def test_a_search_that_is_a_read_evaluates_the_part_alerts(self) -> None:
        from app.services.supply.models import Offer

        cid = self.connector()
        watch = self.watch(threshold=100)
        listing = self.add_listing(watch.part_id, cid, "SR-1")
        offer = Offer(provider="fake", sku="SR-1", mpn="ABC123", manufacturer="Acme", stock=40, fetched_at=self.clock.now)
        self.poller().record_search_offers(cid, [(listing, offer)])
        (alert,) = self.rows("SELECT kind, seen_count FROM supply_attention WHERE part_id = %s", watch.part_id)
        self.assertEqual((alert["kind"], alert["seen_count"]), ("below_threshold", 1), "the first look is counted; the alert opens after the second")

    def test_watching_creates_the_part_and_is_idempotent(self) -> None:
        first = self.watch("LM358-D", threshold=100)
        again = self.watch("lm358d")
        self.assertEqual((first.id, first.threshold, first.owner), (again.id, 100, ACTOR))
        self.assertEqual(len(self.rows("SELECT 1 FROM supply_parts")), 1)
        self.assertEqual(first.mpn, "LM358-D")

    def test_changing_and_removing_a_watch(self) -> None:
        watch = self.watch()
        with self.store.connection() as conn:
            changed = self.watches.update_watch(conn, watch.id, "ben@example.com", threshold=50, pinned=True)
            self.assertEqual((changed.threshold, changed.pinned), (50, True))
            cleared = self.watches.update_watch(conn, watch.id, ACTOR, threshold=None)
            self.assertEqual((cleared.threshold, cleared.pinned), (None, True), "omitted fields are left alone")
            self.assertEqual(self.watches.update_watch(conn, watch.id, ACTOR), cleared, "no change, no audit")
            self.watches.remove_watch(conn, watch.id, ACTOR)
            with self.assertRaises(self.watches.WatchNotFound):
                self.watches.get_watch(conn, watch.id)
        actions = [r["action"] for r in self.rows("SELECT action FROM supply_audit_events WHERE action LIKE 'watch.%%' ORDER BY id")]
        self.assertEqual(actions, ["watch.add", "watch.update", "watch.update", "watch.remove"])
        self.assertEqual(len(self.rows("SELECT 1 FROM supply_parts")), 1, "removing a watch keeps the part")

    def test_watch_rules_are_checked(self) -> None:
        watch = self.watch()
        with self.store.connection() as conn:
            for bad in (-1, True, 1.5, "10"):
                with self.assertRaises(self.watches.WatchError, msg=repr(bad)):
                    self.watches.update_watch(conn, watch.id, ACTOR, threshold=bad)
            with self.assertRaises(self.watches.WatchError):
                self.watches.update_watch(conn, watch.id, ACTOR, pinned="yes")
            with self.assertRaises(ValueError):
                self.watches.update_watch(conn, watch.id, " ", threshold=1)
            with self.assertRaises(self.watches.WatchNotFound):
                self.watches.update_watch(conn, "missing", ACTOR, threshold=1)

    def test_pins_are_capped(self) -> None:
        original = self.watches.MAX_PINNED
        self.watches.MAX_PINNED = 2
        try:
            first, second = self.watch("P1", pinned=True), self.watch("P2", pinned=True)
            with self.assertRaises(self.watches.WatchError):
                self.watch("P3", pinned=True)
            third = self.watch("P3")
            with self.store.connection() as conn:
                with self.assertRaises(self.watches.WatchError):
                    self.watches.update_watch(conn, third.id, ACTOR, pinned=True)
                self.watches.update_watch(conn, first.id, ACTOR, pinned=True)  # already pinned: not counted twice
                self.watches.update_watch(conn, second.id, ACTOR, pinned=False)
                self.watches.update_watch(conn, third.id, ACTOR, pinned=True)
        finally:
            self.watches.MAX_PINNED = original

    # --- stock across listings --------------------------------------------

    def _offer(self, listing_id: str, stock: int, *, marketplace: bool = False, packaging: str = "unknown") -> None:
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_offers (listing_id, fetched_at, stock, marketplace, packaging) VALUES (%s, %s, %s, %s, %s)",
                (listing_id, START, stock, marketplace, packaging))

    def test_stock_counts_pooled_packaging_once_and_separate_stock_together(self) -> None:
        watch = self.watch()
        pooled, separate = self.connector("fake"), self.connector("demo_small")
        for connector_id, skus in ((pooled, ("CT", "RL")), (separate, ("A", "B"))):
            for sku in skus:
                self._offer(self.add_listing(watch.part_id, connector_id, sku), 1000 if sku in ("CT", "RL", "A") else 500,
                            packaging={"A": "tray", "B": "tape_reel"}.get(sku, "unknown"))
        with self.store.connection() as conn:
            result = self.stock.part_stock(conn, watch.part_id)
        self.assertEqual(result.by_connector, {pooled: 1000, separate: 1500})
        self.assertEqual((result.total, result.listings), (2500, 4))

    def test_stock_leaves_out_marketplace_unproven_and_gone_listings(self) -> None:
        watch = self.watch()
        cid = self.connector("demo_small")
        for sku, state, marketplace in (("OK", "exact", False), ("MKT", "exact", True), ("NEAR", "near", False),
                                        ("GONE", "gone", False), ("PIN", "manual", False)):
            self._offer(self.add_listing(watch.part_id, cid, sku, state), 100, marketplace=marketplace, packaging="tray" if sku == "OK" else "tube")
        with self.store.connection() as conn:
            result = self.stock.part_stock(conn, watch.part_id)
        self.assertEqual((result.total, result.listings), (200, 2))
        with self.store.connection() as conn:
            self.assertEqual(self.stock.part_stock(conn, self.watch("NOOFFERS").part_id).total, 0)

    # --- polling ----------------------------------------------------------

    def test_a_number_from_a_bom_that_names_another_product_is_demoted_and_not_kept(self) -> None:
        cid = self.connector()
        watch = self.watch()
        right = self.add_listing(watch.part_id, cid, "FAKE-ABC123-CT", "manual")
        wrong = self.add_listing(watch.part_id, cid, "FAKE-OTHER999-CT", "manual")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_listings SET matched_by = 'bom' WHERE id = ANY(%s)", ([right, wrong],))
        self.poller().poll_connector(cid)
        states = {r["sku"]: (r["match_state"], r["match_reason"]) for r in self.rows("SELECT sku, match_state, match_reason FROM supply_listings")}
        self.assertEqual(states["FAKE-ABC123-CT"][0], "manual")
        self.assertEqual(states["FAKE-OTHER999-CT"][0], "near")
        self.assertIn("OTHER999", states["FAKE-OTHER999-CT"][1])
        self.assertEqual([r["listing_id"] for r in self.rows("SELECT listing_id FROM supply_offers")], [right], "the other product's figures are not kept")

    def test_the_first_poll_records_the_offer_a_sample_and_the_schedule(self) -> None:
        cid = self.connector()
        watch = self.watch()
        self.discover(watch, cid)
        summary = self.poller().poll_connector(cid)
        self.assertEqual((summary.calls, summary.polled, summary.stopped), (1, 1, None))

        expected = self.provider_for(cid).get_offers(["FAKE-ABC123-CT"])[0]
        (offer,) = self.rows("SELECT * FROM supply_offers")
        self.assertEqual((offer["stock"], offer["currency"], offer["packaging"]), (expected.stock, "EUR", "cut_tape"))
        self.assertEqual(len(offer["price_breaks"]), 4)
        (sample,) = self.rows("SELECT * FROM supply_samples")
        self.assertEqual((sample["stock"], sample["sampled_at"]), (expected.stock, self.clock.now))
        self.assertNotIn("unit_price", sample, "the price is kept as the offer's breaks, not on the sample")
        (kept,) = self.rows("SELECT * FROM supply_price_breaks_history")
        self.assertEqual((len(kept["breaks"]), kept["since"]), (4, self.clock.now))
        state = self.state_of("FAKE-ABC123-CT")
        self.assertGreater(state["next_poll_at"], self.clock.now)
        self.assertEqual((state["error_streak"], state["last_change_at"]), (0, self.clock.now))
        self.assertEqual(self.rows("SELECT packaging FROM supply_listings")[0]["packaging"], "cut_tape")
        self.assertIsNotNone(self.connectors.get(cid)["last_ok_at"])

    def test_nothing_is_polled_before_it_is_due_and_the_next_run_adds_history(self) -> None:
        cid = self.connector()
        self.discover(self.watch(), cid)
        poller = self.poller()
        poller.poll_connector(cid)
        self.assertEqual(poller.poll_connector(cid).stopped, "nothing_due")
        self.clock.advance(hours=2)
        self.assertEqual(poller.poll_connector(cid).stopped, "nothing_due", "a daily listing waits for the next day")
        self.clock.advance(days=2)
        summary = poller.poll_connector(cid)
        self.assertEqual((summary.calls, summary.polled), (1, 1))
        self.assertEqual(len(self.rows("SELECT 1 FROM supply_samples")), 2)

    def test_last_change_moves_only_when_the_numbers_do(self) -> None:
        cid = self.connector("csv")
        watch = self.watch()
        self.imports_file(cid, "sku,mpn,manufacturer,stock\nC1,ABC123,Acme,10\n")
        self.discover_csv(watch, cid)
        poller = self.poller_csv()
        poller.poll_connector(cid)
        first = self.state_of("C1")["last_change_at"]
        self.clock.advance(days=2)
        poller.poll_connector(cid)
        self.assertEqual(len(self.rows("SELECT 1 FROM supply_samples")), 1, "the same upload is one observation")
        self.assertEqual(self.state_of("C1")["last_change_at"], first)
        self.clock.advance(days=1)
        self.imports_file(cid, "sku,mpn,manufacturer,stock\nC1,ABC123,Acme,7\n")
        self.clock.advance(days=2)
        poller.poll_connector(cid)
        self.assertEqual(len(self.rows("SELECT 1 FROM supply_samples")), 2)
        self.assertGreater(self.state_of("C1")["last_change_at"], first)

    def imports_file(self, connector_id: str, text: str) -> None:
        from app.services.supply.csv_import_service import CsvImportService

        CsvImportService(self.connectors, self.store).import_file(connector_id, text.encode(), actor=ACTOR, filename="f.csv")

    def csv_provider(self, connector_id: str):
        from app.services.supply.providers.csv_provider import CsvProvider

        return CsvProvider(self.ProviderConfig(connector_id=connector_id), store=self.store)

    def discover_csv(self, watch, connector_id: str) -> None:
        self.discovery.DiscoveryService(lambda cid: self.csv_provider(cid), self.store).discover(watch.part_id, connector_id)

    def poller_csv(self):
        return self.poller_module.Poller(self.connectors, store=self.store, provider_for=self.csv_provider, clock=self.clock)

    def test_unwatched_parts_and_unproven_listings_are_not_polled(self) -> None:
        cid = self.connector()
        with self.store.connection() as conn:
            unwatched = self.parts.ensure_part(conn, "Acme", "NOTWATCHED", ACTOR)
        self.add_listing(unwatched.id, cid, "FAKE-NOTWATCHED-CT")
        watched = self.watch("WATCHED")
        self.add_listing(watched.part_id, cid, "FAKE-WATCHED-CT")
        self.add_listing(watched.part_id, cid, "FAKE-WATCHED-RL", state="near")
        summary = self.poller().poll_connector(cid)
        self.assertEqual(summary.polled, 1)
        self.assertEqual([r["sku"] for r in self.rows("SELECT l.sku FROM supply_offers o JOIN supply_listings l ON l.id = o.listing_id")], ["FAKE-WATCHED-CT"])

    def test_listings_are_asked_about_in_batches_within_the_budget(self) -> None:
        # 4 calls a day, 2 listings per call. At noon 3 calls have accrued; by evening, all 4.
        cid = self.connector("demo_small", daily_budget=4)
        watch = self.watch()
        for n in range(7):
            self.add_listing(watch.part_id, cid, f"FAKE-P{n}-CT")
        summary = self.poller().poll_connector(cid)
        self.assertEqual((summary.calls, summary.polled, summary.stopped), (3, 6, "budget"))
        with self.store.connection() as conn:
            spent = conn.execute("SELECT spent FROM supply_quota_ledger WHERE account_id = %s", (cid,)).fetchone()["spent"]
        self.assertEqual(spent, 3)
        self.clock.advance(hours=11)
        later = self.poller().poll_connector(cid)
        self.assertEqual(later.calls, 1)
        self.assertEqual(len(self.rows("SELECT 1 FROM supply_offers WHERE listing_id IN (SELECT id FROM supply_listings WHERE sku = 'FAKE-P6-CT')")), 1,
                         "the listing that never got a turn is asked about first")

    def test_a_connector_with_no_budget_polls_nothing_and_a_free_one_never_spends(self) -> None:
        paid = self.connector("demo_small", daily_budget=0)
        self.add_listing(self.watch("A1").part_id, paid, "FAKE-A1-CT")
        self.assertEqual(self.poller().poll_connector(paid).stopped, "nothing_due", "with no budget nothing is admitted, so it waits")
        self.assertEqual(self.rows("SELECT * FROM supply_offers"), [])

        free = self.connector("csv")
        watch = self.watch("C2")
        self.imports_file(free, "sku,mpn,manufacturer,stock\nC2,C2,Acme,3\n")
        self.discover_csv(watch, free)
        self.assertEqual(self.poller_csv().poll_connector(free).polled, 1)
        self.assertEqual(self.rows("SELECT * FROM supply_quota_ledger WHERE account_id = %s", free), [])

    def test_a_reading_that_differs_from_the_last_writes_change_events(self) -> None:
        import dataclasses

        from app.services.supply.vocabulary import Lifecycle

        cid = self.connector()
        watch = self.watch()
        self.add_listing(watch.part_id, cid, "FAKE-ABC123-CT")
        changes = {"now": False}

        class Shifts:
            def __init__(self, inner): self.inner = inner
            def get_offers(self, skus):
                found = self.inner.get_offers(skus)
                if not changes["now"]:
                    return [dataclasses.replace(o, lifecycle=Lifecycle.ACTIVE, moq=100, facts=(("normally_stocking", "Yes"),)) for o in found]
                return [dataclasses.replace(o, lifecycle=Lifecycle.NRND, moq=1000, facts=(("normally_stocking", "No"),)) for o in found]

        self.provider_behaviour = Shifts
        self.poller().poll_connector(cid)
        self.assertEqual(self.rows("SELECT kind FROM supply_events"), [], "a first reading is not a change")
        changes["now"] = True
        self.clock.advance(days=2)
        self.poller().poll_connector(cid)
        kinds = sorted(row["kind"] for row in self.rows("SELECT kind FROM supply_events"))
        self.assertEqual(kinds, ["lifecycle_changed", "moq_jump", "normally_stocking_lost"])
        (sample,) = self.rows("SELECT moq, order_multiple FROM supply_samples ORDER BY sampled_at DESC LIMIT 1")
        self.assertEqual(sample["moq"], 1000)

    def test_substances_listed_with_an_offer_become_the_distributors_declarations(self) -> None:
        import dataclasses

        cid = self.connector()
        watch = self.watch()
        self.add_listing(watch.part_id, cid, "FAKE-ABC123-CT")
        listed = {"now": ("Lead (CAS 7439-92-1)",)}

        class Lists:
            def __init__(self, inner): self.inner = inner
            def get_offers(self, skus):
                return [dataclasses.replace(o, substances=listed["now"]) for o in self.inner.get_offers(skus)]

        self.provider_behaviour = Lists
        self.poller().poll_connector(cid)
        self.assertEqual(self.rows("SELECT cas, declared_by FROM supply_part_substances"), [{"cas": "7439-92-1", "declared_by": "distributor:fake"}])
        listed["now"] = None
        self.clock.advance(days=2)
        self.poller().poll_connector(cid)
        self.assertEqual(len(self.rows("SELECT cas FROM supply_part_substances")), 1, "an answer that states nothing changes nothing")
        listed["now"] = ()
        self.clock.advance(days=2)
        self.poller().poll_connector(cid)
        self.assertEqual(self.rows("SELECT cas FROM supply_part_substances"), [])
        self.assertEqual(self.rows("SELECT value FROM supply_part_facts WHERE name = 'reach_svhc'"), [{"value": "None listed"}])

    def test_a_change_is_seen_when_the_samples_before_it_were_deleted(self) -> None:
        import dataclasses

        from app.services.supply.vocabulary import Lifecycle

        cid = self.connector()
        watch = self.watch()
        self.add_listing(watch.part_id, cid, "FAKE-ABC123-CT")
        changes = {"now": False}

        class Shifts:
            def __init__(self, inner): self.inner = inner
            def get_offers(self, skus):
                found = self.inner.get_offers(skus)
                if not changes["now"]:
                    return [dataclasses.replace(o, lifecycle=Lifecycle.ACTIVE) for o in found]
                return [dataclasses.replace(o, lifecycle=Lifecycle.NRND, stock=0) for o in found]

        self.provider_behaviour = Shifts
        self.poller().poll_connector(cid)
        # Retention took every sample (a short history setting, or a listing read less often than samples are kept).
        with self.store.connection() as conn:
            conn.execute("DELETE FROM supply_samples")
        changes["now"] = True
        self.clock.advance(days=2)
        self.poller().poll_connector(cid)
        kinds = sorted(row["kind"] for row in self.rows("SELECT kind FROM supply_events"))
        self.assertEqual(kinds, ["lifecycle_changed"])
        self.assertEqual([row["kind"] for row in self.rows("SELECT kind FROM supply_stock_events")], ["stock_out"])

    def test_a_datasheet_address_in_an_offer_is_kept_for_the_part_once(self) -> None:
        import dataclasses

        cid = self.connector()
        watch = self.watch()
        self.add_listing(watch.part_id, cid, "FAKE-ABC123-CT")

        class GivesDatasheet:
            def __init__(self, inner): self.inner = inner
            def get_offers(self, skus):
                return [dataclasses.replace(o, datasheet_url="https://acme.example/abc123.pdf") for o in self.inner.get_offers(skus)]

        self.provider_behaviour = GivesDatasheet
        self.poller().poll_connector(cid)
        self.assertEqual(self.rows("SELECT datasheet_url FROM supply_parts")[0]["datasheet_url"], "https://acme.example/abc123.pdf")

    def test_a_listing_missing_three_times_is_marked_gone(self) -> None:
        cid = self.connector()
        watch = self.watch()
        self.add_listing(watch.part_id, cid, "FAKE-ABC123-CT")
        self.add_listing(watch.part_id, cid, "FAKE-GHOST-CT")

        class DropsGhost:
            def __init__(self, inner): self.inner = inner
            def get_offers(self, skus): return [o for o in self.inner.get_offers(skus) if "GHOST" not in o.sku]

        self.provider_behaviour = DropsGhost
        poller = self.poller()
        results = []
        for _ in range(3):
            results.append(poller.poll_connector(cid))
            self.state = self.state_of("FAKE-GHOST-CT")
            if self.state["match_state"] != "gone":
                self.assertEqual(self.state["missing_streak"], len(results))
                self.assertLessEqual(self.state["next_poll_at"], self.clock.now + timedelta(hours=1, minutes=1), "retried soon")
            self.clock.advance(hours=2)
        self.assertEqual([r.gone for r in results], [0, 0, 1])
        self.assertEqual(self.state_of("FAKE-GHOST-CT")["match_state"], "gone")
        self.assertEqual(self.state_of("FAKE-ABC123-CT")["match_state"], "exact")
        self.clock.advance(days=3)
        self.assertEqual(poller.poll_connector(cid).polled, 1, "a gone listing is no longer asked about")

    def test_a_batch_that_is_not_full_waits_for_company_unless_it_is_old_urgent_or_the_day_is_ending(self) -> None:
        cid = self.connector()
        self.add_listing(self.watch().part_id, cid, "FAKE-ABC123-CT")
        poller = self.poller()
        self.assertEqual(poller.poll_connector(cid).polled, 1, "a listing never read goes out at once")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_poll_state SET next_poll_at = %s", (self.clock.now - timedelta(minutes=10),))
        held = poller.poll_connector(cid)
        self.assertEqual((held.polled, held.holding, held.stopped), (0, 1, "nothing_due"), "due for ten minutes, a batch of one waits")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_poll_state SET urgency = 0")
        self.assertEqual(poller.poll_connector(cid).polled, 1, "an urgent listing does not wait")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_poll_state SET next_poll_at = %s, urgency = 2", (self.clock.now - timedelta(hours=2, minutes=1),))
        self.assertEqual(poller.poll_connector(cid).polled, 1, "nor one that has been due two hours")
        self.clock.now = START.replace(hour=22, minute=30)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_poll_state SET next_poll_at = %s", (self.clock.now - timedelta(minutes=10),))
        self.assertEqual(poller.poll_connector(cid).polled, 1, "nor in the last two hours of the day")

    def test_a_batch_held_for_company_is_not_sent_alone_by_spare_work_and_its_late_read_counts_to_its_tier(self) -> None:
        from app.services.supply import jobs

        cid = self.connector()
        self.add_listing(self.watch().part_id, cid, "FAKE-ABC123-CT")
        poller = self.poller()
        self.assertEqual(poller.poll_connector(cid).polled, 1)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_poll_state SET next_poll_at = %s", (self.clock.now - timedelta(minutes=10),))
            jobs.refresh_scheduled(conn, cid, self.clock.now)
        self.assertEqual(poller.poll_connector(cid).holding, 1)
        spare = poller.poll_connector(cid, spare="overdue")
        self.assertEqual((spare.polled, spare.holding), (0, 1), "the held batch is not sent alone from spare budget either")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_poll_state SET next_poll_at = %s", (self.clock.now - timedelta(hours=2, minutes=1),))
            jobs.refresh_scheduled(conn, cid, self.clock.now)
        self.assertEqual(poller.poll_connector(cid, spare="overdue").polled, 1, "due two hours: it goes")
        late = self.rows("SELECT purpose, SUM(calls) AS n FROM supply_call_counts WHERE connector_id = %s GROUP BY purpose ORDER BY purpose", cid)
        self.assertEqual([row["purpose"] for row in late], ["tier1"], "a late committed read is tracking spend, also from spare budget")

    def test_a_late_committed_read_is_read_from_spare_budget(self) -> None:
        cid = self.connector("demo_small", daily_budget=100, interactive_reserve_pct=20)
        for mpn in ("AAA", "BBB"):
            self.add_listing(self.watch(mpn).part_id, cid, f"FAKE-{mpn}-CT")
        poller = self.poller()
        self.assertEqual(poller.poll_connector(cid).polled, 2)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_poll_state SET next_poll_at = %s", (self.clock.now - timedelta(hours=5),))
        before = self.rows("SELECT COALESCE(SUM(spare_spent), 0) AS n FROM supply_quota_ledger")[0]["n"]
        from app.services.supply import jobs

        with self.store.connection() as conn:
            conn.execute("UPDATE supply_poll_state SET next_poll_at = %s", (self.clock.now - timedelta(hours=5),))
            jobs.refresh_scheduled(conn, cid, self.clock.now)
        summary = poller.poll_connector(cid, spare="overdue")
        self.assertEqual(summary.polled, 2, "both late listings are read")
        self.assertGreater(self.rows("SELECT COALESCE(SUM(spare_spent), 0) AS n FROM supply_quota_ledger")[0]["n"], before)
        self.assertEqual(poller.poll_connector(cid, spare="overdue").stopped, "nothing_due", "nothing is late any more")

    def test_scheduled_work_left_in_the_day_is_counted_in_calls_the_way_the_provider_batches(self) -> None:
        from app.services.supply import accounts, demand

        cid = self.connector("demo_small", daily_budget=100)
        for mpn in ("AAA", "BBB", "CCC"):
            self.add_listing(self.watch(mpn).part_id, cid, f"FAKE-{mpn}-CT")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_admissions SET state = 'admitted'")
            account = accounts.resolve(conn, cid)
            self.assertEqual(demand.scheduled_rest(conn, account, self.clock.now), 2, "three never-read listings, two to a call")
        self.assertEqual(self.poller().poll_connector(cid).polled, 3)
        with self.store.connection() as conn:
            self.assertEqual(demand.scheduled_rest(conn, account, self.clock.now), 0, "the next reads are tomorrow's")
            conn.execute("UPDATE supply_poll_state SET next_poll_at = %s WHERE listing_id = (SELECT id FROM supply_listings WHERE sku = 'FAKE-AAA-CT')", (self.clock.now + timedelta(hours=1),))
            self.assertEqual(demand.scheduled_rest(conn, account, self.clock.now), 1, "one comes due before the reset")

    def test_no_calls_are_free_until_the_scheduled_work_has_been_counted_and_not_when_the_count_is_old(self) -> None:
        from app.services.supply import accounts, jobs, ledger, quota

        cid = self.connector("demo_small", daily_budget=1000, interactive_reserve_pct=10)

        def free() -> int:
            with self.store.connection() as conn:
                account = accounts.resolve(conn, cid)
                state = ledger.get_state(conn, account.ledger_id, daily_budget=1000, reserve_pct=10, now=self.clock.now)
                day = quota.provider_day(self.clock.now)
                conn.execute("INSERT INTO supply_quota_ledger (account_id, day) VALUES (%s, %s) ON CONFLICT DO NOTHING", (account.ledger_id, day))
                row = conn.execute("SELECT scheduled_rest, scheduled_at, spare_hour, spare_hour_spent FROM supply_quota_ledger WHERE account_id = %s AND day = %s", (account.ledger_id, day)).fetchone()
                return ledger.free_calls(conn, account.ledger_id, state, row, self.clock.now, reset_time=account.reset_time, reset_tz=account.reset_tz)

        self.assertEqual(free(), 0, "nothing counted yet")
        with self.store.connection() as conn:
            jobs.refresh_scheduled(conn, cid, self.clock.now)
        self.assertGreater(free(), 0)
        self.clock.advance(minutes=16)
        self.assertEqual(free(), 0, "a count older than 15 minutes is not trusted")

    def test_a_part_that_left_a_distributor_is_searched_there_again_on_the_not_found_cadence(self) -> None:
        from app.services.supply import discoverer

        cid = self.connector()
        watch = self.watch()
        self.add_listing(watch.part_id, cid, "FAKE-GHOST-CT")
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_discovery_runs (part_id, connector_id, last_run_at, found) VALUES (%s, %s, %s, 1)", (watch.part_id, cid, self.clock.now))

        class DropsAll:
            def __init__(self, inner): self.inner = inner
            def get_offers(self, skus): return []

        self.provider_behaviour = DropsAll
        poller = self.poller()
        for _ in range(3):
            poller.poll_connector(cid)
            self.clock.advance(hours=2)
        self.assertEqual(self.state_of("FAKE-GHOST-CT")["match_state"], "gone")
        self.assertEqual(self.rows("SELECT found FROM supply_discovery_runs")[0]["found"], 0, "nothing counted is left here")
        with self.store.connection() as conn:
            self.assertEqual(discoverer.pending_parts(conn, cid, self.clock.now, 10), [], "searched six hours ago")
            conn.execute("UPDATE supply_discovery_runs SET last_run_at = %s", (self.clock.now - timedelta(days=15),))
            self.assertEqual([p.part_id for p in discoverer.pending_parts(conn, cid, self.clock.now, 10)], [watch.part_id], "a part not found is searched after 14 days, not 30")

    def test_a_listing_found_after_a_pick_is_read_once_and_a_picked_listing_still_wins_the_rest(self) -> None:
        from app.services.supply.providers.base import ProviderSpec

        # A provider that pays a call for each listing: a pick limits what is read there.
        self.registry.register(ProviderSpec(
            key="demo_pay", label="Pays per listing", capabilities=frozenset({"offers"}), max_batch=1, stock_pooling="separate",
            credential_fields=(), factory=lambda config: self.FakeProvider(config), default_daily_budget=100,
        ), replace=True)
        self.addCleanup(self.registry.unregister, "demo_pay")
        cid = self.connector("demo_pay")
        watch = self.watch()
        picked = self.add_listing(watch.part_id, cid, "FAKE-ABC123-CT")
        self.add_listing(watch.part_id, cid, "FAKE-ABC123-RL")
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_packaging_picks (part_id, connector_id, listing_id, picked_by) VALUES (%s, %s, %s, 'auto')", (watch.part_id, cid, picked))
            conn.execute("UPDATE supply_admissions SET state = 'admitted'")
        poller = self.poller()
        first = poller.poll_connector(cid)
        self.assertEqual(first.polled, 2, "the listing nobody read yet is read once whatever the pick")
        self.clock.advance(days=2)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_poll_state SET next_poll_at = %s", (self.clock.now - timedelta(hours=3),))
        self.assertEqual(poller.poll_connector(cid).polled, 1, "afterwards only the picked one")

    def test_where_a_listing_costs_a_place_in_a_batch_and_not_a_call_a_pick_does_not_limit_what_is_read(self) -> None:
        cid = self.connector("demo_small", daily_budget=100)
        watch = self.watch()
        picked = self.add_listing(watch.part_id, cid, "FAKE-ABC123-CT")
        self.add_listing(watch.part_id, cid, "FAKE-ABC123-RL")
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_packaging_picks (part_id, connector_id, listing_id, picked_by) VALUES (%s, %s, %s, 'auto')", (watch.part_id, cid, picked))
            conn.execute("UPDATE supply_admissions SET state = 'admitted'")
        poller = self.poller()
        self.assertEqual(poller.poll_connector(cid).polled, 2)
        self.clock.advance(days=2)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_poll_state SET next_poll_at = %s", (self.clock.now - timedelta(hours=3),))
        self.assertEqual(poller.poll_connector(cid).polled, 2, "both listings are read again")

    def test_a_returning_listing_clears_its_misses(self) -> None:
        cid = self.connector()
        self.add_listing(self.watch().part_id, cid, "FAKE-ABC123-CT")
        calls = {"n": 0}

        class DropsOnce:
            def __init__(self, inner): self.inner = inner
            def get_offers(self, skus):
                calls["n"] += 1
                return [] if calls["n"] == 1 else self.inner.get_offers(skus)

        self.provider_behaviour = DropsOnce
        poller = self.poller()
        poller.poll_connector(cid)
        self.assertEqual(self.state_of("FAKE-ABC123-CT")["missing_streak"], 1)
        self.clock.advance(hours=2)
        poller.poll_connector(cid)
        self.assertEqual(self.state_of("FAKE-ABC123-CT")["missing_streak"], 0)

    # --- trouble ----------------------------------------------------------

    def _failing(self, error):
        class Failing:
            def __init__(self, inner): self.inner = inner
            def get_offers(self, skus): raise error
        self.provider_behaviour = Failing

    def test_a_rate_limit_holds_the_whole_connector_off(self) -> None:
        from app.services.supply.providers.base import RateLimited

        cid = self.connector()
        self.add_listing(self.watch().part_id, cid, "FAKE-ABC123-CT")
        self._failing(RateLimited("slow down", retry_after_seconds=600))
        summary = self.poller().poll_connector(cid)
        self.assertEqual(summary.stopped, "rate_limited")
        self.assertEqual(self.connectors.get(cid)["last_error_code"], "rate_limited")
        self.assertEqual(self.poller().poll_connector(cid).stopped, "cooling_down")
        self.assertEqual(self.rows("SELECT * FROM supply_poll_state"), [], "the listing is not blamed")
        self.clock.advance(minutes=11)
        self.provider_behaviour = None
        self.assertEqual(self.poller().poll_connector(cid).polled, 1)

    def test_a_rate_limit_without_a_retry_time_waits_fifteen_minutes(self) -> None:
        from app.services.supply.providers.base import RateLimited

        cid = self.connector()
        self.add_listing(self.watch().part_id, cid, "FAKE-ABC123-CT")
        self._failing(RateLimited("slow down"))
        self.poller().poll_connector(cid)
        self.clock.advance(minutes=14)
        self.assertEqual(self.poller().poll_connector(cid).stopped, "cooling_down")
        self.clock.advance(minutes=2)
        self.provider_behaviour = None
        self.assertEqual(self.poller().poll_connector(cid).stopped, None)

    def test_rejected_credentials_pause_the_connector(self) -> None:
        from app.services.supply.providers.base import AuthError

        cid = self.connector()
        self.add_listing(self.watch().part_id, cid, "FAKE-ABC123-CT")
        self._failing(AuthError("no"))
        self.assertEqual(self.poller().poll_connector(cid).stopped, "auth_failed")
        connector = self.connectors.get(cid)
        self.assertEqual(connector["paused_reason"], "The provider rejected the credentials.")
        self.assertEqual(connector["last_error_code"], "auth_failed")
        self.assertEqual(self.poller().poll_connector(cid).stopped, "inactive")
        actor = self.rows("SELECT actor FROM supply_audit_events WHERE action = 'connector.pause'")[0]["actor"]
        self.assertEqual(actor, "system:poller")

    def test_other_provider_errors_back_the_batch_off_and_stop_the_run(self) -> None:
        from app.services.supply.providers.base import Unavailable

        cid = self.connector("demo_small")
        watch = self.watch()
        for n in range(4):
            self.add_listing(watch.part_id, cid, f"FAKE-P{n}-CT")
        self._failing(Unavailable("down"))
        summary = self.poller().poll_connector(cid)
        self.assertEqual((summary.calls, summary.stopped), (1, "error"), "later batches are not tried")
        failed = [r for r in self.rows("SELECT * FROM supply_poll_state")]
        self.assertEqual(len(failed), 2)
        self.assertTrue(all(r["error_streak"] == 1 and r["last_error_code"] == "unavailable" for r in failed))
        self.assertTrue(all(r["next_poll_at"] >= self.clock.now + timedelta(minutes=5) for r in failed))
        self.assertEqual(self.connectors.get(cid)["last_error_code"], "unavailable")

        self.clock.advance(minutes=8)  # the rest is 5 minutes plus up to half again
        self.provider_behaviour = None
        self.poller().poll_connector(cid)
        states = self.rows("SELECT error_streak, last_error_code FROM supply_poll_state")
        self.assertEqual(len(states), 4, "the batch that was never reached is asked about too")
        self.assertTrue(all(r["error_streak"] == 0 and r["last_error_code"] == "" for r in states), "failures are forgiven")

    def test_failures_back_off_further_each_time(self) -> None:
        from app.services.supply.providers.base import Unavailable

        cid = self.connector()
        self.add_listing(self.watch().part_id, cid, "FAKE-ABC123-CT")
        self._failing(Unavailable("down"))
        waits = []
        for _ in range(3):
            self.poller().poll_connector(cid)
            waits.append(self.state_of("FAKE-ABC123-CT")["next_poll_at"] - self.clock.now)
            self.clock.advance(days=2)
        self.assertEqual(self.state_of("FAKE-ABC123-CT")["error_streak"], 3)
        self.assertGreater(waits[1], waits[0])
        self.assertGreater(waits[2], waits[1])
        self.assertLess(waits[0], timedelta(hours=1), "the first retry is soon, not a day away")

    def test_inactive_connectors_are_skipped(self) -> None:
        cid = self.connector()
        self.add_listing(self.watch().part_id, cid, "FAKE-ABC123-CT")
        self.connectors.update(cid, actor=ACTOR, enabled=False)
        self.assertEqual(self.poller().poll_connector(cid).stopped, "inactive")
        self.connectors.update(cid, actor=ACTOR, enabled=True)
        self.connectors.pause(cid, actor=ACTOR, reason="maintenance")
        self.assertEqual(self.poller().poll_connector(cid).stopped, "inactive")
        self.assertEqual(self.rows("SELECT * FROM supply_offers"), [])

    # --- risk sets the order, not the rate ---------------------------------

    def test_a_threshold_breach_makes_the_listing_urgent_but_not_more_frequent(self) -> None:
        cid = self.connector()
        watch = self.watch(threshold=10_000_000)
        self.add_listing(watch.part_id, cid, "FAKE-ABC123-CT")
        self.poller().poll_connector(cid)
        state = self.state_of("FAKE-ABC123-CT")
        self.assertEqual((state["tier"], state["urgency"]), ("daily", 0))
        self.assertGreater(state["next_poll_at"], self.clock.now + timedelta(hours=11), "still once a day")

    def test_a_pin_and_an_obsolete_part_are_urgent(self) -> None:
        cid = self.connector()
        pinned = self.watch("P1", pinned=True)
        self.add_listing(pinned.part_id, cid, "FAKE-P1-CT")
        eol = self.watch("EOL-1")
        self.add_listing(eol.part_id, cid, "FAKE-EOL-1-CT")
        quiet = self.watch("Q1")
        self.add_listing(quiet.part_id, cid, "FAKE-Q1-CT")
        self.poller().poll_connector(cid)
        self.assertEqual(self.state_of("FAKE-P1-CT")["urgency"], 0)
        self.assertIn(self.state_of("FAKE-EOL-1-CT")["urgency"], (0, 1))
        # Everything just changed for the first time, so even a quiet part starts warm.
        self.assertEqual(self.state_of("FAKE-Q1-CT")["urgency"], 1)
        self.clock.advance(days=2)
        self.poller().poll_connector(cid)
        self.assertEqual(self.state_of("FAKE-Q1-CT")["urgency"], 1, "it moved again, being a sawtooth market")

    def test_when_the_budget_cannot_cover_everything_the_urgent_go_first_then_tier_one(self) -> None:
        cid = self.connector("demo_small", daily_budget=2, interactive_reserve_pct=0)
        quiet = self.watch("QUIET", tier=2, rate="weekly")
        urgent = self.watch("URGENT", threshold=10_000_000)
        for watch, sku in ((quiet, "FAKE-QUIET-CT"), (urgent, "FAKE-URGENT-CT")):
            self.add_listing(watch.part_id, cid, sku)
        self.clock.now = START.replace(hour=23, minute=59)  # the whole day's allowance has accrued
        self.poller().poll_connector(cid)
        self.assertEqual(len(self.rows("SELECT 1 FROM supply_offers")), 2)
        self.clock.advance(days=2)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_poll_state SET urgency = 2 WHERE listing_id IN (SELECT id FROM supply_listings WHERE sku = 'FAKE-QUIET-CT')")
            conn.execute("UPDATE supply_poll_state SET next_poll_at = %s", (self.clock.now - timedelta(hours=1),))
        with self.store.connection() as conn:
            due = self.poller_module.due_listings(conn, cid, self.clock.now, 10)
        self.assertEqual([item.sku for item in due], ["FAKE-URGENT-CT", "FAKE-QUIET-CT"])


if __name__ == "__main__":
    unittest.main()
