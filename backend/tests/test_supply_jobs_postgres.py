"""Scheduled discovery, the scan that queues supply jobs, the job itself, and the worker hook.

Needs ``PRISM_DATABASE_URL``. Uses a disposable schema and a fake clock.
"""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

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


class RecordingJobs:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def enqueue(self, kind, payload=None, **kwargs):
        self.calls.append({"kind": kind, "payload": dict(payload or {}), **kwargs})
        return {"id": f"job-{len(self.calls)}"}


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class SupplyJobTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.services.postgres_database import database
        from app.services.supply import admission, discoverer, jobs, poller, watches
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.providers import registry
        from app.services.supply.providers.base import CredentialField, ProviderConfig, ProviderSpec
        from app.services.supply.providers.fake import FakeProvider
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.discoverer, cls.jobs, cls.poller = database, discoverer, jobs, poller
        cls.admission = admission
        cls.watches, cls.registry = watches, registry
        cls.FakeProvider, cls.ProviderConfig = FakeProvider, ProviderConfig
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_jobs_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        # A provider that can be polled but not searched.
        registry.register(ProviderSpec(
            key="demo_nosearch", label="No search", capabilities=frozenset({"offers"}), max_batch=10,
            stock_pooling="separate", credential_fields=(), factory=lambda config: FakeProvider(config),
            default_daily_budget=100,
        ), replace=True)
        # A provider with credentials and storefronts, so two connectors can share an account.
        registry.register(ProviderSpec(
            key="demo_keyed", label="Keyed", capabilities=frozenset({"search", "offers"}), max_batch=10,
            stock_pooling="separate", credential_fields=(CredentialField("api_key", "API key"),),
            factory=lambda config: FakeProvider(config), storefronts=("uk", "de"), default_daily_budget=100,
        ), replace=True)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.registry.unregister("demo_nosearch")
        cls.registry.unregister("demo_keyed")
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        with self.store.connection() as conn:
            for table in ("supply_listings", "supply_watches", "supply_parts", "supply_manufacturer_aliases", "supply_manufacturers", "supply_connectors", "supply_audit_events"):
                conn.execute(f"DELETE FROM {table}")
        self.clock = Clock()
        self.behaviour = None
        self.tasks_not_due()

    def tasks_not_due(self) -> None:
        """The periodic tasks ran a moment ago, so a scan queues only distributor work."""

        from app.services.supply import tasks

        with self.store.connection() as conn:
            conn.execute("DELETE FROM supply_task_runs")
            for task in tasks.TASKS:
                conn.execute("INSERT INTO supply_task_runs (name, next_at) VALUES (%s, %s)", (task.name, self.clock.now + task.every))

    # --- helpers ----------------------------------------------------------

    def connector(self, provider: str = "fake", **overrides) -> str:
        values = dict(actor=ACTOR, provider=provider, currency="EUR", interactive_reserve_pct=10)
        values.update(overrides)
        return self.connectors.create(**values)["id"]

    def provider_for(self, connector_id: str):
        inner = self.FakeProvider(self.ProviderConfig(connector_id=connector_id, currency="EUR"), clock=self.clock)
        return self.behaviour(inner) if self.behaviour else inner

    def discoverer_(self):
        return self.discoverer.Discoverer(self.connectors, store=self.store, provider_for=self.provider_for, clock=self.clock)

    def poller_(self):
        return self.poller.Poller(self.connectors, store=self.store, provider_for=self.provider_for, clock=self.clock)

    def watch(self, mpn: str = "ABC123", **kwargs):
        kwargs.setdefault("tier", 1)  # read daily, as a tracked project's parts are
        with self.store.connection() as conn:
            return self.watches.add_watch(conn, "Acme", mpn, ACTOR, **kwargs)[0]

    def rows(self, sql: str, *params):
        with self.store.connection() as conn:
            return conn.execute(sql, params).fetchall()

    def failing(self, error):
        class Failing:
            def __init__(self, inner): self.inner = inner
            def lookup_mpn(self, mpn, manufacturer=None): raise error
            def get_offers(self, skus): raise error
        self.behaviour = Failing

    # --- discovery --------------------------------------------------------

    def test_a_new_watch_gets_its_listings_found_once(self) -> None:
        cid = self.connector()
        self.watch()
        summary = self.discoverer_().run(cid)
        self.assertEqual((summary.searched, summary.listings, summary.stopped), (1, 1, None))
        (listing,) = self.rows("SELECT sku, match_state FROM supply_listings")
        self.assertEqual((listing["sku"], listing["match_state"]), ("FAKE-ABC123-CT", "exact"))
        (run,) = self.rows("SELECT found, last_run_at FROM supply_discovery_runs")
        self.assertEqual((run["found"], run["last_run_at"]), (1, self.clock.now))
        self.assertEqual(self.discoverer_().run(cid).searched, 0, "already searched")

    def test_a_part_the_distributor_carries_is_searched_again_after_a_month(self) -> None:
        cid = self.connector()
        self.watch()
        self.discoverer_().run(cid)
        self.clock.advance(days=8)
        self.assertEqual(self.discoverer_().run(cid).searched, 0, "found parts wait a month, not a week")
        self.clock.advance(days=23)
        self.assertEqual(self.discoverer_().run(cid).searched, 1)

    def test_a_part_not_found_is_searched_again_after_two_weeks(self) -> None:
        cid = self.connector()
        self.watch("NONE-1")
        self.discoverer_().run(cid)
        self.clock.advance(days=8)
        self.assertEqual(self.discoverer_().run(cid).searched, 0, "not within the week")
        self.clock.advance(days=7)
        self.assertEqual(self.discoverer_().run(cid).searched, 1, "a distributor that starts stocking it is noticed")

    def test_a_tier_two_part_not_found_is_searched_again_after_a_month(self) -> None:
        cid = self.connector()
        self.watch("NONE-2", tier=2, rate="weekly")
        self.discoverer_().run(cid)
        self.clock.advance(days=20)
        self.assertEqual(self.discoverer_().run(cid).searched, 0)
        self.clock.advance(days=11)
        self.assertEqual(self.discoverer_().run(cid).searched, 1)

    def test_a_tier_two_part_is_searched_again_every_quarter(self) -> None:
        cid = self.connector()
        self.watch("SLOW", tier=2, rate="weekly")
        self.discoverer_().run(cid)
        self.clock.advance(days=40)
        self.assertEqual(self.discoverer_().run(cid).searched, 0)
        self.clock.advance(days=51)
        self.assertEqual(self.discoverer_().run(cid).searched, 1)

    def test_a_first_search_with_no_read_due_and_a_repeat_come_from_the_committed_share(self) -> None:
        cid = self.connector()
        self.watch()
        self.discoverer_().run(cid)
        self.clock.advance(days=31)
        self.discoverer_().run(cid)
        got = {(r["purpose"], r["kind"]): int(r["n"]) for r in self.rows("SELECT purpose, kind, SUM(calls) AS n FROM supply_call_counts GROUP BY purpose, kind")}
        self.assertEqual(got, {("tier1", "search"): 2}, "both are tracking work; neither touched the pool")

    def test_a_part_the_distributor_does_not_carry_is_not_searched_again_at_once(self) -> None:
        cid = self.connector()
        self.watch("NONE-9")
        summary = self.discoverer_().run(cid)
        self.assertEqual((summary.searched, summary.listings), (1, 0))
        self.assertEqual(self.rows("SELECT found FROM supply_discovery_runs")[0]["found"], 0)
        self.assertEqual(self.discoverer_().run(cid).searched, 0)

    def test_first_searches_are_scheduled_work_paid_from_the_background_allowance_and_leave_the_pool_alone(self) -> None:
        cid = self.connector(daily_budget=20)  # a committed share of 18 calls, a pool of 2
        for n in range(4):
            self.watch(f"P{n}")
        summary = self.discoverer_().run(cid)
        self.assertEqual((summary.searched, summary.stopped), (4, None))
        (row,) = self.rows("SELECT spent, interactive_spent FROM supply_quota_ledger")
        self.assertEqual((row["spent"], row["interactive_spent"]), (4, 0), "nothing was taken from the pool")

    def test_with_the_background_allowance_spent_first_searches_fall_back_to_the_pool_and_stop_with_it(self) -> None:
        from app.services.supply import quota

        cid = self.connector(daily_budget=20)  # a pool of 2 calls, half of it kept for people: 1 for first searches
        for n in range(4):
            self.watch(f"P{n}")
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_quota_ledger (account_id, day, spent) VALUES (%s, %s, 18)", (cid, quota.provider_day(self.clock.now)))
        summary = self.discoverer_().run(cid)
        self.assertEqual((summary.searched, summary.stopped), (1, "budget"))
        self.assertEqual(len(self.rows("SELECT * FROM supply_discovery_runs")), 1)
        self.assertEqual(self.rows("SELECT spent FROM supply_quota_ledger")[0]["spent"], 19)

    def test_a_search_whose_answer_carries_the_offer_is_also_the_first_read(self) -> None:
        from app.services.supply.models import Offer, PartMatch
        from app.services.supply.providers.base import ProviderSpec

        self.registry.register(ProviderSpec(
            key="demo_reads", label="Reads", capabilities=frozenset({"offers", "search"}), max_batch=1, stock_pooling="separate",
            credential_fields=(), factory=lambda config: self.FakeProvider(config), default_daily_budget=100, search_reads_offers=True,
        ), replace=True)
        self.addCleanup(self.registry.unregister, "demo_reads")
        cid = self.connector("demo_reads")
        record = self.watch("ABC123")
        clock = self.clock

        class Answering:
            def lookup_mpn(self, mpn, manufacturer=None):
                offer = Offer(provider="demo_reads", sku="C1", mpn=mpn, manufacturer="Acme", stock=500, fetched_at=clock.now, marketplace=True)
                return [PartMatch(provider="demo_reads", sku="C1", mpn=mpn, manufacturer="Acme", offer=offer)]

        discoverer = self.discoverer.Discoverer(self.connectors, store=self.store, provider_for=lambda _id: Answering(), clock=self.clock)
        self.assertEqual(discoverer.run(cid).searched, 1)
        (offer,) = self.rows("SELECT o.stock FROM supply_offers o JOIN supply_listings l ON l.id = o.listing_id WHERE l.part_id = %s", record.part_id)
        self.assertEqual(offer["stock"], 500, "the search recorded the offer")
        (state,) = self.rows("SELECT next_poll_at, last_polled_at FROM supply_poll_state")
        self.assertGreater(state["next_poll_at"], self.clock.now, "so the listing is not due for a read")
        summary = self.poller_().poll_connector(cid)
        self.assertEqual((summary.calls, summary.polled), (0, 0), "the poller makes no second call for it")

    def test_a_request_the_provider_repeated_is_charged_to_the_search_and_to_the_read(self) -> None:
        class Retrying:
            # Counts its requests as ``HttpProvider`` does: each lookup here was refused once and asked again.
            calls = 0

            def __init__(self, inner): self.inner = inner

            def lookup_mpn(self, mpn, manufacturer=None):
                self.calls += 2
                return self.inner.lookup_mpn(mpn, manufacturer)

            def get_offers(self, skus):
                self.calls += 2
                return self.inner.get_offers(skus)

        self.behaviour = Retrying
        cid = self.connector()
        self.watch()
        self.discoverer_().run(cid)
        self.assertEqual(self.rows("SELECT SUM(spent) AS n FROM supply_quota_ledger")[0]["n"], 2, "the search and its retry")
        self.poller_().poll_connector(cid)
        self.assertEqual(self.rows("SELECT SUM(spent) AS n FROM supply_quota_ledger")[0]["n"], 4, "the read and its retry")

    def test_free_connectors_search_without_spending(self) -> None:
        cid = self.connector("csv")
        self.watch()
        provider = mock.Mock()
        provider.lookup_mpn.return_value = []
        discoverer = self.discoverer.Discoverer(self.connectors, store=self.store, provider_for=lambda _id: provider, clock=self.clock)
        self.assertEqual(discoverer.run(cid).searched, 1)
        self.assertEqual(self.rows("SELECT * FROM supply_quota_ledger"), [])

    def test_the_run_is_limited(self) -> None:
        cid = self.connector()
        for n in range(5):
            self.watch(f"P{n}")
        self.assertEqual(self.discoverer_().run(cid, limit=3).searched, 3)
        self.assertEqual(self.discoverer_().run(cid, limit=3).searched, 2)

    def test_discovery_leaves_alone_connectors_it_cannot_or_should_not_use(self) -> None:
        self.watch()
        nosearch = self.connector("demo_nosearch")
        self.assertEqual(self.discoverer_().run(nosearch).stopped, "unsupported")
        off = self.connector("fake")
        self.connectors.update(off, actor=ACTOR, enabled=False)
        self.assertEqual(self.discoverer_().run(off).stopped, "inactive")
        self.assertEqual(self.rows("SELECT * FROM supply_discovery_runs"), [])

    def test_a_failed_search_is_not_recorded_and_the_connector_rests(self) -> None:
        from app.services.supply.providers.base import Unavailable

        cid = self.connector()
        self.watch()
        self.failing(Unavailable("down"))
        self.assertEqual(self.discoverer_().run(cid).stopped, "error")
        self.assertEqual(self.rows("SELECT * FROM supply_discovery_runs"), [], "a failed search is not a search")
        self.assertEqual(self.discoverer_().run(cid).stopped, "cooling_down")
        self.clock.advance(minutes=8)  # the first rest is 5 minutes plus up to half again
        self.behaviour = None
        self.assertEqual(self.discoverer_().run(cid).searched, 1)

    def test_a_rate_limited_search_waits_as_long_as_the_provider_asks(self) -> None:
        from app.services.supply.providers.base import RateLimited

        cid = self.connector()
        self.watch()
        self.failing(RateLimited("slow", retry_after_seconds=1200))
        self.assertEqual(self.discoverer_().run(cid).stopped, "rate_limited")
        self.clock.advance(minutes=19)
        self.assertEqual(self.discoverer_().run(cid).stopped, "cooling_down")
        self.clock.advance(minutes=2)
        self.behaviour = None
        self.assertEqual(self.discoverer_().run(cid).searched, 1)

    def test_rejected_credentials_during_a_search_pause_the_connector(self) -> None:
        from app.services.supply.providers.base import AuthError

        cid = self.connector()
        self.watch()
        self.failing(AuthError("no"))
        self.assertEqual(self.discoverer_().run(cid).stopped, "auth_failed")
        self.assertTrue(self.connectors.get(cid)["paused_reason"])
        self.assertEqual(self.discoverer_().run(cid).stopped, "inactive")

    def test_a_provider_error_in_a_poll_also_makes_the_connector_rest(self) -> None:
        from app.services.supply.providers.base import Unavailable

        cid = self.connector()
        watch = self.watch()
        self.discoverer_().run(cid)
        self.failing(Unavailable("down"))
        self.assertEqual(self.poller_().poll_connector(cid).stopped, "error")
        self.assertEqual(self.poller_().poll_connector(cid).stopped, "cooling_down")
        self.assertEqual(watch.part_id, self.rows("SELECT part_id FROM supply_watches")[0]["part_id"])

    # --- the scan ---------------------------------------------------------

    def work(self) -> list[str]:
        with self.store.connection() as conn:
            return self.jobs.connectors_with_work(conn, self.clock.now)

    def test_no_watches_means_no_work(self) -> None:
        self.connector()
        self.assertEqual(self.work(), [])

    def test_a_watch_with_no_search_yet_is_work_for_a_searchable_connector_only(self) -> None:
        fake, nosearch = self.connector("fake"), self.connector("demo_nosearch")
        self.watch()
        self.assertEqual(self.work(), [fake])
        self.assertNotIn(nosearch, self.work())

    def test_due_listings_are_work_even_without_search(self) -> None:
        nosearch = self.connector("demo_nosearch")
        watch = self.watch()
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) "
                "VALUES ('l1', %s, 'FAKE-ABC123-CT', %s, 'x', 'Acme', 'exact')", (nosearch, watch.part_id))
        self.assertEqual(self.work(), [nosearch])
        self.poller_().poll_connector(nosearch)
        self.assertEqual(self.work(), [], "polled, so not due")
        self.clock.advance(days=2)
        self.assertEqual(self.work(), [nosearch])

    def test_work_ends_when_everything_is_searched_and_polled(self) -> None:
        cid = self.connector()
        self.watch()
        self.assertEqual(self.work(), [cid])
        self.discoverer_().run(cid)
        self.assertEqual(self.work(), [cid], "the new listing is due to be polled")
        self.poller_().poll_connector(cid)
        self.assertEqual(self.work(), [])
        self.clock.advance(days=8)
        self.assertEqual(self.work(), [cid])

    def test_inactive_and_resting_connectors_have_no_work(self) -> None:
        cid = self.connector()
        self.watch()
        self.connectors.pause(cid, actor=ACTOR, reason="maintenance")
        self.assertEqual(self.work(), [])
        self.connectors.resume(cid, actor=ACTOR)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_connectors SET cooldown_until = %s", (self.clock.now + timedelta(minutes=5),))
        self.assertEqual(self.work(), [])
        self.clock.advance(minutes=6)
        self.assertEqual(self.work(), [cid])
        self.connectors.update(cid, actor=ACTOR, enabled=False)
        self.assertEqual(self.work(), [])

    def test_unproven_and_gone_listings_are_not_work(self) -> None:
        cid = self.connector("demo_nosearch")
        watch = self.watch()
        with self.store.connection() as conn:
            for n, state in enumerate(("near", "gone", "rejected", "manufacturer_unresolved")):
                conn.execute(
                    "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) "
                    "VALUES (%s, %s, %s, %s, 'x', 'Acme', %s)", (f"l{n}", cid, f"S{n}", watch.part_id, state))
        self.assertEqual(self.work(), [])

    def test_the_scan_queues_one_job_per_connector_with_the_right_shape(self) -> None:
        first, second = self.connector("fake"), self.connector("demo_nosearch")
        self.watch()
        queue = RecordingJobs()
        queued = self.jobs.schedule_due_supply_jobs(job_service=queue, store=self.store, now=self.clock.now)
        self.assertEqual(len(queued), 1, "only the searchable connector has work")
        (call,) = queue.calls
        self.assertEqual(call["kind"], "supply_poll")
        self.assertEqual(call["payload"], {"connector_id": first})
        self.assertEqual(call["artifact_key"], f"supply-poll:{first}")
        self.assertEqual(call["resources"], {"supply": 1})
        self.assertEqual((call["worker_pool"], call["requested_by"], call["max_attempts"]), ("prism", "system:supply-scheduler", 2))
        self.assertNotEqual(first, second)

    def test_a_connector_with_due_notices_is_work_when_its_product_budget_is_spent(self) -> None:
        from app.services.supply import oauth
        from app.services.supply.providers.base import ProviderSpec

        self.registry.register(ProviderSpec(
            key="demo_notices", label="Notices", capabilities=frozenset({"offers", "pcn"}), max_batch=10, stock_pooling="separate",
            credential_fields=(), factory=lambda config: self.FakeProvider(config), default_daily_budget=100, notice_daily_limit=50,
        ), replace=True)
        self.addCleanup(self.registry.unregister, "demo_notices")
        cid = self.connector("demo_notices", daily_budget=0)
        record = self.watch()
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) VALUES ('ln', %s, 'S1', %s, 'x', 'Acme', 'exact')",
                (cid, record.part_id),
            )
            conn.execute("INSERT INTO supply_poll_state (listing_id, tier, urgency, next_poll_at, last_polled_at) VALUES ('ln', 'daily', 2, %s, %s)",
                         (self.clock.now + timedelta(days=1), self.clock.now))
            conn.execute("UPDATE supply_admissions SET state = 'admitted' WHERE connector_id = %s", (cid,))
            with mock.patch.object(oauth, "status", return_value={"signed_in": False}):
                self.assertNotIn(cid, self.jobs.connectors_with_work(conn, self.clock.now), "nobody signed in: nothing to read")
            with mock.patch.object(oauth, "status", return_value={"signed_in": True}):
                self.assertIn(cid, self.jobs.connectors_with_work(conn, self.clock.now), "notices have their own quota")
            conn.execute("INSERT INTO supply_detail_checks (listing_id, kind, checked_at, tried_at, status) VALUES ('ln', 'notices', %s, %s, 'ok')", (self.clock.now, self.clock.now))
            with mock.patch.object(oauth, "status", return_value={"signed_in": True}):
                self.assertNotIn(cid, self.jobs.connectors_with_work(conn, self.clock.now), "read today: not due")

    def test_connectors_on_one_account_share_one_job(self) -> None:
        def keyed(storefront: str, key: str) -> str:
            return self.connectors.create(
                actor=ACTOR, provider="demo_keyed", storefront=storefront, credentials={"api_key": key}, interactive_reserve_pct=0
            )["id"]

        uk, de = keyed("uk", "K1"), keyed("de", "K1")
        self.watch()
        queue = RecordingJobs()
        self.jobs.schedule_due_supply_jobs(job_service=queue, store=self.store, now=self.clock.now)
        (call,) = queue.calls
        self.assertEqual(sorted(call["payload"]["connector_ids"]), sorted([uk, de]))
        self.assertEqual(call["artifact_key"], f"supply-poll:{uk}", "keyed by the account's first connector, not by each connector")

    def test_a_batching_connector_whose_few_due_listings_are_all_held_is_queued_only_when_the_hold_runs_out(self) -> None:
        cid = self.connectors.create(
            actor=ACTOR, provider="demo_keyed", storefront="uk", credentials={"api_key": "K9"}, daily_budget=1000, interactive_reserve_pct=10
        )["id"]
        part = self.watch("H1")
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_discovery_runs (part_id, connector_id, last_run_at, found) VALUES (%s, %s, %s, 1)", (part.part_id, cid, self.clock.now))
            conn.execute(
                "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) "
                "VALUES ('h1', %s, 'SKU-H1', %s, 'x', 'Acme', 'exact')", (cid, part.part_id))
            conn.execute("INSERT INTO supply_poll_state (listing_id, tier, urgency, next_poll_at, last_polled_at) VALUES ('h1', 'daily', 2, %s, %s)",
                         (self.clock.now - timedelta(minutes=10), self.clock.now - timedelta(days=1)))
            self.admission.sync(conn)
        self.assertEqual(self.work(), [], "one listing due ten minutes ago waits for company: a job would only say nothing is due")
        self.assertEqual(self.poller_().poll_connector(cid).holding, 1, "and the poller agrees")
        self.clock.advance(hours=2)
        self.assertEqual(self.work(), [cid], "held for two hours, it goes out alone")
        self.clock.advance(hours=-2)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_poll_state SET urgency = 0")
        self.assertEqual(self.work(), [cid], "an urgent listing is never held")

    def test_parts_waiting_for_room_are_work_for_spare_budget_only(self) -> None:
        cid = self.connectors.create(
            actor=ACTOR, provider="demo_keyed", storefront="uk", credentials={"api_key": "K9"}, daily_budget=4, interactive_reserve_pct=50
        )["id"]  # a committed share of 2 calls holds 15 tier-1 parts, and a pool of 2 leaves 1 spare after its floor
        for n in range(16):
            part = self.watch(f"W{n:02d}")
            with self.store.connection() as conn:
                conn.execute("INSERT INTO supply_discovery_runs (part_id, connector_id, last_run_at, found) VALUES (%s, %s, %s, 1)",
                             (part.part_id, cid, self.clock.now))
                conn.execute(
                    "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) "
                    "VALUES (%s, %s, %s, %s, 'x', 'Acme', 'exact')", (f"w{n}", cid, f"SKU-W{n}", part.part_id))
                conn.execute("INSERT INTO supply_poll_state (listing_id, tier, next_poll_at) VALUES (%s, 'daily', %s)",
                             (f"w{n}", self.clock.now + timedelta(days=3)))
            with self.store.connection() as conn:
                self.admission.sync(conn)
        self.assertEqual(self.rows("SELECT COUNT(*) AS n FROM supply_admissions WHERE state = 'waiting'")[0]["n"], 1)
        self.assertEqual(self.clock.now.weekday(), 6, "a Sunday: no working hours")
        self.assertEqual(self.work(), [], "a part waits, but nothing of it is due: no job for it")
        with self.store.connection() as conn:
            conn.execute(
                "UPDATE supply_poll_state SET next_poll_at = %s WHERE listing_id IN "
                "(SELECT l.id FROM supply_listings l JOIN supply_admissions a ON a.part_id = l.part_id AND a.connector_id = l.connector_id WHERE a.state = 'waiting')",
                (self.clock.now - timedelta(hours=1),))
        self.assertEqual(self.work(), [cid], "spare budget is open, and a part waiting for room is due a read")
        self.clock.advance(days=1, hours=-1)  # Monday 11:00, working hours: free calls are spare whatever the hour
        self.assertEqual(self.work(), [cid])
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_quota_ledger SET spent = 4")
        self.assertEqual(self.work(), [], "nothing is free once the day is spent")

    def test_tier_two_parts_are_spare_work_only_once_a_listing_is_older_than_the_early_gap(self) -> None:
        cid = self.connector()
        record = self.watch("T2", tier=2, rate="weekly")
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_discovery_runs (part_id, connector_id, last_run_at, found) VALUES (%s, %s, %s, 1)", (record.part_id, cid, self.clock.now))
            conn.execute(
                "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) "
                "VALUES ('t2l', %s, 'SKU-T2', %s, 'x', 'Acme', 'exact')", (cid, record.part_id))
            conn.execute("INSERT INTO supply_poll_state (listing_id, tier, next_poll_at, last_polled_at) VALUES ('t2l', 'weekly', %s, %s)",
                         (self.clock.now + timedelta(days=5), self.clock.now - timedelta(hours=6)))
            self.admission.sync(conn)
        self.assertEqual(self.work(), [], "read six hours ago: nothing early to read")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_poll_state SET last_polled_at = %s", (self.clock.now - timedelta(days=2),))
        self.assertEqual(self.work(), [cid], "read two days ago and not due for five: an early read")

    def test_the_scan_queues_one_tasks_job_when_a_task_is_due_even_with_no_connector_work(self) -> None:
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_task_runs SET next_at = %s WHERE name = 'rates'", (self.clock.now,))
        queue = RecordingJobs()
        self.jobs.schedule_due_supply_jobs(job_service=queue, store=self.store, now=self.clock.now)
        self.assertEqual([(call["kind"], call["artifact_key"]) for call in queue.calls], [("supply_tasks", "supply:tasks")])

    def test_a_task_runs_when_due_in_its_own_transaction_and_a_failure_is_kept_without_stopping_the_rest(self) -> None:
        from app.services.supply import tasks

        ran = []

        def broken(conn, now, store):
            conn.execute("INSERT INTO supply_settings (key, value, updated_by) VALUES ('probe', '1', 'test')")
            raise RuntimeError("ECB unreachable")

        with self.store.connection() as conn:
            conn.execute("UPDATE supply_task_runs SET next_at = %s WHERE name IN ('rates', 'market')", (self.clock.now,))
        fake = (tasks.Task("rates", tasks._TEN_MINUTES, broken), tasks.Task("market", tasks._TEN_MINUTES, lambda conn, now, store: ran.append(now)))
        with mock.patch.object(tasks, "TASKS", fake), mock.patch.dict(tasks.BY_NAME, {task.name: task for task in fake}):
            outcome = tasks.run_due(self.store, self.clock.now)
            self.assertEqual(tasks.run_due(self.store, self.clock.now), {}, "claimed: not due again until its interval passed")
        self.assertEqual((outcome, ran), ({"rates": False, "market": True}, [self.clock.now]))
        rows = {row["name"]: row for row in self.rows("SELECT * FROM supply_task_runs WHERE name IN ('rates', 'market')")}
        self.assertEqual(rows["rates"]["last_error"], "RuntimeError: ECB unreachable")
        self.assertEqual(self.rows("SELECT key FROM supply_settings WHERE key = 'probe'"), [], "the failing task's own writes were rolled back")
        self.assertEqual(rows["rates"]["next_at"], self.clock.now + tasks._TEN_MINUTES)

    def test_the_scan_queues_nothing_when_there_is_nothing_to_do(self) -> None:
        self.connector()
        queue = RecordingJobs()
        self.assertEqual(self.jobs.schedule_due_supply_jobs(job_service=queue, store=self.store, now=self.clock.now), [])
        self.assertEqual(queue.calls, [])

    # --- the job ----------------------------------------------------------

    def test_the_job_polls_what_is_due_then_searches_and_the_next_job_reads_what_was_found(self) -> None:
        cid = self.connector()
        self.watch()
        progress = []
        context = SimpleNamespace(payload={"connector_id": cid}, progress=lambda **kwargs: progress.append(kwargs["stage"]))
        with (
            mock.patch.object(self.jobs, "ConnectorService", lambda: self.connectors),
            mock.patch.object(self.jobs, "Discoverer", lambda connectors, **_kwargs: self.discoverer_()),
            mock.patch.object(self.jobs, "Poller", lambda connectors, **_kwargs: self.poller_()),
        ):
            result = self.jobs.run_supply_poll_job(context)
            self.assertEqual((result.details["searched"], result.details["polled"]), (1, 0), "nothing was due yet: the search found the listing")
            self.assertEqual(progress, ["supply-poll", "supply-discover"], "reads come before searches")
            result = self.jobs.run_supply_poll_job(context)
        self.assertEqual((result.details["calls"], result.details["polled"]), (1, 1))
        self.assertEqual(len(self.rows("SELECT * FROM supply_offers")), 1)
        self.assertIn("polled 1 listing", result.message)

    # --- the worker -------------------------------------------------------

    def test_the_worker_has_a_supply_slot_and_a_registered_handler(self) -> None:
        from app import prism_worker
        from app.services.job_handlers import get_job_handler, load_builtin_job_handlers

        load_builtin_job_handlers()
        self.assertIs(get_job_handler("supply_poll"), self.jobs.run_supply_poll_job)
        capacities = prism_worker.PrismWorker.resource_capacities()
        self.assertGreaterEqual(capacities[self.jobs.SUPPLY_RESOURCE], 1)
        if capacities["prism_worker"] > 1:
            self.assertLess(capacities[self.jobs.SUPPLY_RESOURCE], capacities["prism_worker"], "a slot is left for everything else")

    def test_only_the_prism_pool_scans_and_not_more_than_once_a_minute(self) -> None:
        from app import prism_worker

        prism, catalog = prism_worker.PrismWorker("prism"), prism_worker.PrismWorker("catalog")
        with mock.patch("app.services.supply.jobs.schedule_due_supply_jobs") as scan:
            prism.schedule_supply_jobs()
            prism.schedule_supply_jobs()
            catalog.schedule_supply_jobs()
        scan.assert_called_once()

    def test_a_failing_scan_is_not_retried_on_every_pass(self) -> None:
        from app import prism_worker

        worker = prism_worker.PrismWorker("prism")
        with mock.patch("app.services.supply.jobs.schedule_due_supply_jobs", side_effect=RuntimeError("db down")) as scan:
            with self.assertRaises(RuntimeError):
                worker.schedule_supply_jobs()
            worker.schedule_supply_jobs()
        scan.assert_called_once()


if __name__ == "__main__":
    unittest.main()
