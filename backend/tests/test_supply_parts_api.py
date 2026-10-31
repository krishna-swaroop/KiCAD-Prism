"""The parts and watches API: roles, watch rules, the parts list, and the part detail.

Needs ``PRISM_DATABASE_URL``. Requests go through the real router into a
disposable schema. Stock and prices come from the simulated market on a fake clock.
"""

from __future__ import annotations

import json
import os
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from supply_api_helpers import reading as _reading  # noqa: E402
from supply_api_helpers import request as _request  # noqa: E402

from app.core.errors import install_error_handlers  # noqa: E402
from app.services.supply import pricing  # noqa: E402
from app.services.supply.vocabulary import Lifecycle, Status, worst_lifecycle  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
SEED_ACTOR = "seed@example.com"
START = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)


class PartStatusTests(unittest.TestCase):
    def test_the_status_is_the_assessments_from_stock_threshold_lifecycle_and_problem(self) -> None:
        from app.services.supply.assessment import service as assessment

        def status(stock, threshold, lifecycle, problem=None) -> Status:
            offers = [] if stock is None else [{
                "connector_id": "c1", "connector_name": "A", "provider": "fake", "pool": None, "packaging": None, "stock": stock,
                "marketplace": False, "discontinued": False, "lifecycle": lifecycle.value, "lead_time_days": None, "rohs": None,
                "reach_affected": None, "price_breaks": [], "currency": "", "moq": 1, "order_multiple": 1, "fetched_at": START,
            }]
            item = {"id": "p", "lifecycle": lifecycle.value, "problem": problem, "watch": {"threshold": threshold} if threshold is not None else None}
            return Status(assessment.assess_one(item, offers, [], START, distributors=1)["status"])

        active = Lifecycle.ACTIVE
        self.assertEqual(status(None, None, active), Status.UNKNOWN)
        self.assertEqual(status(None, None, Lifecycle.UNKNOWN, "not_found"), Status.ERROR)
        self.assertEqual(status(None, None, Lifecycle.UNKNOWN, "gone"), Status.ERROR)
        self.assertEqual(status(5000, None, active), Status.OK)
        self.assertEqual(status(0, None, active), Status.ERROR)
        self.assertEqual(status(100, 100, active), Status.WARNING)
        self.assertEqual(status(101, 100, active), Status.OK)
        self.assertEqual(status(5000, None, Lifecycle.NRND), Status.WARNING)
        self.assertEqual(status(5000, None, Lifecycle.LAST_TIME_BUY), Status.WARNING)
        self.assertEqual(status(5000, None, Lifecycle.OBSOLETE), Status.FATAL)
        self.assertEqual(status(0, None, Lifecycle.OBSOLETE), Status.FATAL, "obsolete outranks empty")

    def test_the_worst_lifecycle_is_shown(self) -> None:
        self.assertEqual(worst_lifecycle([Lifecycle.ACTIVE, Lifecycle.NRND]), Lifecycle.NRND)
        self.assertEqual(worst_lifecycle([Lifecycle.ACTIVE, Lifecycle.OBSOLETE, Lifecycle.NRND]), Lifecycle.OBSOLETE)
        self.assertEqual(worst_lifecycle([Lifecycle.UNKNOWN, Lifecycle.ACTIVE]), Lifecycle.ACTIVE)
        self.assertEqual(worst_lifecycle([]), Lifecycle.UNKNOWN)


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply API tests")
class SupplyPartsApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_connectors, supply_parts, supply_tracking
        from app.core.security import AuthenticatedUser
        from app.services.postgres_database import database
        from app.services.supply import discoverer, parts, poller, watches
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.providers import registry
        from app.services.supply.providers.base import ProviderConfig, ProviderSpec
        from app.services.supply.providers.fake import FakeProvider
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.parts, cls.watches = database, parts, watches
        cls.discoverer, cls.poller = discoverer, poller
        cls.FakeProvider, cls.ProviderConfig = FakeProvider, ProviderConfig
        cls.AuthenticatedUser = AuthenticatedUser
        cls.registry = registry
        # A provider that pays a call for each listing, so a packaging pick has something to save.
        registry.register(ProviderSpec(
            key="pick_demo", label="Pick demo", capabilities=frozenset({"search", "offers"}), max_batch=1,
            stock_pooling="separate", credential_fields=(), factory=lambda config: FakeProvider(config), default_daily_budget=1000,
        ), replace=True)
        cls.users = {
            role: AuthenticatedUser(email=f"{role}@example.com", name=role, role=role)
            for role in ("viewer", "qa", "designer", "admin")
        }
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_parts_api_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        cls.app = FastAPI()
        install_error_handlers(cls.app)
        cls.app.include_router(supply_parts.router)
        cls.app.include_router(supply_tracking.router)
        supply_connectors.register_validation_redaction(cls.app)
        cls.patcher = mock.patch.object(supply_connectors, "service", cls.connectors)
        cls.patcher.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.patcher.stop()
        cls.registry.unregister("pick_demo")
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        # Summaries are assessed at the time the fixtures read at, so their reads are not late.
        patcher = mock.patch("app.services.supply.parts_view._now", return_value=START)
        patcher.start()
        self.addCleanup(patcher.stop)
        with self.store.connection() as conn:
            for table in ("supply_listings", "supply_watches", "supply_parts", "supply_manufacturer_aliases", "supply_manufacturers", "supply_connectors", "supply_audit_events"):
                conn.execute(f"DELETE FROM {table}")
        self.now = START

    # --- helpers ----------------------------------------------------------

    def call(self, method: str, path: str, *, role: str = "admin", body=None, user=None, query: str = ""):
        return _request(self.app, method, path, user=user or self.users[role], body=body, query=query)

    def watch_via_api(self, mpn: str = "ABC123", *, status: int = 201, **extra) -> dict:
        response = self.call("POST", "/api/supply/tracking/parts", body={"manufacturer": "Acme", "mpn": mpn, **extra})
        self.assertEqual(response.status, status, response.text)
        return response.json["watch"]

    def fake_connector(self, **overrides) -> str:
        values = dict(actor=SEED_ACTOR, provider="fake", currency="EUR", display_name="Sim", interactive_reserve_pct=10)
        values.update(overrides)
        return self.connectors.create(**values)["id"]

    def provider(self, connector_id: str):
        return self.FakeProvider(self.ProviderConfig(connector_id=connector_id, currency="EUR"), clock=lambda: self.now)

    def collect(self, connector_id: str) -> None:
        """Search for listings and read them, as the worker job would."""

        clock = lambda: self.now  # noqa: E731
        self.discoverer.Discoverer(self.connectors, store=self.store, provider_for=self.provider, clock=clock).run(connector_id)
        self.poller.Poller(self.connectors, store=self.store, provider_for=self.provider, clock=clock).poll_connector(connector_id)

    def insert_listing(self, part_id: str, connector_id: str, sku: str, *, state: str = "exact", stock: int | None = None,
                       currency: str = "EUR", price: str | None = None, fetched: datetime = START) -> str:
        listing_id = uuid.uuid4().hex
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) "
                "VALUES (%s, %s, %s, %s, 'x', 'Acme', %s)", (listing_id, connector_id, sku, part_id, state))
            if stock is not None:
                breaks = json.dumps([[1, price]]) if price else "[]"
                conn.execute(
                    "INSERT INTO supply_offers (listing_id, fetched_at, stock, currency, price_breaks) VALUES (%s, %s, %s, %s, %s::jsonb)",
                    (listing_id, fetched, stock, currency, breaks))
        return listing_id

    def insert_sample(self, listing_id: str, when: datetime, stock: int) -> None:
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_samples (listing_id, sampled_at, stock) VALUES (%s, %s, %s)", (listing_id, when, stock))

    def part_row(self, mpn: str) -> dict:
        items = self.call("GET", "/api/supply/parts", query="scope=all").json["items"]
        return next(item for item in items if item["mpn"] == mpn)

    def test_the_list_comes_in_pages_that_do_not_overlap(self) -> None:
        for n in range(5):
            self.watch_via_api(f"PAGE{n}")
        first = self.call("GET", "/api/supply/parts", query="scope=all&limit=2").json
        second = self.call("GET", "/api/supply/parts", query=f"scope=all&limit=2&offset={first['next_offset']}").json
        last = self.call("GET", "/api/supply/parts", query=f"scope=all&limit=2&offset={second['next_offset']}").json
        names = [item["mpn"] for page in (first, second, last) for item in page["items"]]
        self.assertEqual(len(names), len(set(names)))
        self.assertEqual((first["total"], len(names)), (5, 5))
        self.assertIsNone(last["next_offset"])

    # --- roles ------------------------------------------------------------

    def test_readers_look_and_follow(self) -> None:
        watch = self.watch_via_api()
        for role in ("admin", "designer", "qa"):
            self.assertEqual(self.call("GET", "/api/supply/parts", role=role).status, 200, role)
            self.assertEqual(self.call("GET", f"/api/supply/parts/{watch['part_id']}", role=role).status, 200, role)
        self.assertEqual(self.call("GET", "/api/supply/parts", role="viewer").status, 403)

        body = {"manufacturer": "Acme", "mpn": "X1"}
        self.assertEqual(self.call("POST", "/api/supply/tracking/parts", role="designer", body=body).status, 201)
        self.assertEqual(self.call("POST", "/api/supply/tracking/parts", role="qa", body=body).status, 200)
        self.assertEqual(self.call("POST", "/api/supply/tracking/parts", role="viewer", body=body).status, 403)
        self.assertEqual(self.call("PUT", f"/api/supply/tracking/parts/{watch['part_id']}", role="viewer", body={"pinned": True}).status, 403)
        self.assertEqual(self.call("DELETE", f"/api/supply/tracking/parts/{watch['part_id']}", role="viewer").status, 403)
        self.assertFalse(self.call("GET", f"/api/supply/parts/{watch['part_id']}").json["watch"]["pinned"])
        self.assertTrue(self.call("PUT", f"/api/supply/tracking/parts/{watch['part_id']}", role="qa", body={"pinned": True}).json["watch"]["pinned"])

    def test_a_part_is_found_by_manufacturer_and_number_without_creating_anything(self) -> None:
        watch = self.watch_via_api("ABC-123")
        found = self.call("GET", "/api/supply/part-lookup", role="qa", query="manufacturer=ACME&mpn=abc123")
        self.assertEqual((found.status, found.json), (200, {"part_id": watch["part_id"], "followed": True}))
        missing = self.call("GET", "/api/supply/part-lookup", query="manufacturer=Acme&mpn=NOPE-1")
        self.assertEqual(missing.json, {"part_id": None, "followed": False})
        unknown = self.call("GET", "/api/supply/part-lookup", query="manufacturer=Nobody+Inc&mpn=ABC-123")
        self.assertEqual(unknown.json, {"part_id": None, "followed": False})
        blank = self.call("GET", "/api/supply/part-lookup", query="mpn=ABC-123")
        self.assertEqual(blank.json, {"part_id": watch["part_id"], "followed": True})
        self.assertEqual(self.call("GET", "/api/supply/part-lookup", query="mpn=NOPE-1").json["part_id"], None)
        with self.store.connection() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_manufacturer_aliases WHERE status = 'pending'").fetchone()["n"], 0)
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_parts").fetchone()["n"], 1)
        self.assertEqual(self.call("GET", "/api/supply/part-lookup", role="viewer", query="manufacturer=Acme&mpn=ABC-123").status, 403)

    # --- read now ---------------------------------------------------------

    def test_a_part_is_read_now_from_the_interactive_reserve_and_not_again_for_fifteen_minutes(self) -> None:
        watch = self.watch_via_api("ABC-123")
        connector = self.fake_connector(daily_budget=20, interactive_reserve_pct=50)
        self.collect(connector)
        with self.store.connection() as conn:
            before = conn.execute("SELECT COUNT(*) AS n FROM supply_samples").fetchone()["n"]
            spent_before = conn.execute("SELECT COALESCE(SUM(interactive_spent), 0) AS n FROM supply_quota_ledger").fetchone()["n"]
        first = self.call("POST", f"/api/supply/parts/{watch['part_id']}/refresh", role="designer")
        self.assertEqual((first.status, first.json["read"], first.json["connectors"], first.json["problems"]), (200, 1, 1, []), first.text)
        with self.store.connection() as conn:
            self.assertGreater(conn.execute("SELECT COUNT(*) AS n FROM supply_samples").fetchone()["n"], before - 1)
            self.assertEqual(conn.execute("SELECT COALESCE(SUM(interactive_spent), 0) AS n FROM supply_quota_ledger").fetchone()["n"], spent_before + 1)
        again = self.call("POST", f"/api/supply/parts/{watch['part_id']}/refresh", role="designer")
        self.assertEqual((again.status, again.json["code"]), (429, "read_too_soon"))
        self.assertIn("again in", again.json["detail"])
        other = self.call("POST", f"/api/supply/parts/{watch['part_id']}/refresh", role="admin")
        self.assertEqual(other.status, 200, "the wait is per person")

    def test_read_now_says_when_a_distributor_cannot_be_asked(self) -> None:
        watch = self.watch_via_api("ABC-123")
        connector = self.fake_connector()
        self.collect(connector)
        self.connectors.update(connector, actor=SEED_ACTOR, interactive_reserve_pct=0)  # nothing is left to ask with today
        response = self.call("POST", f"/api/supply/parts/{watch['part_id']}/refresh", role="designer")
        self.assertEqual(response.json["read"], 0)
        self.assertEqual(response.json["problems"], [{"connector": "Sim", "reason": "Sim has used today's allowance for asking."}])
        self.connectors.pause(connector, actor=SEED_ACTOR, reason="test")
        paused = self.call("POST", f"/api/supply/parts/{watch['part_id']}/refresh", role="admin")
        self.assertEqual(paused.json["problems"][0]["reason"], "Sim is disabled or paused.")

    def test_read_now_works_on_a_part_nobody_watches_and_a_part_nothing_lists_costs_no_wait(self) -> None:
        with self.store.connection() as conn:
            lonely = self.parts.ensure_part(conn, "Acme", "NOBODY-1", SEED_ACTOR).id
        for _ in range(2):
            response = self.call("POST", f"/api/supply/parts/{lonely}/refresh", role="designer")
            self.assertEqual((response.status, response.json["read"], response.json["connectors"]), (200, 0, 0))
        connector = self.fake_connector(daily_budget=20, interactive_reserve_pct=50)
        listing = self.insert_listing(lonely, connector, "FAKE-NOBODY-1-CT", stock=1)
        self.assertTrue(listing)
        self.assertEqual(self.call("POST", f"/api/supply/parts/{lonely}/refresh", role="designer").json["read"], 1)

    def test_who_may_read_now_and_an_unknown_part_is_not_found(self) -> None:
        watch = self.watch_via_api("ABC-123")
        for role in ("qa", "viewer"):
            self.assertEqual(self.call("POST", f"/api/supply/parts/{watch['part_id']}/refresh", role=role).status, 403, role)
        self.assertEqual(self.call("POST", "/api/supply/parts/nope/refresh", role="designer").status, 404)

    def test_opening_a_part_nothing_follows_reads_it_once_while_its_prices_have_aged_out(self) -> None:
        connector = self.fake_connector(daily_budget=20, interactive_reserve_pct=50)
        with self.store.connection() as conn:
            lonely = self.parts.ensure_part(conn, "Acme", "NOBODY-1", SEED_ACTOR).id
        self.insert_listing(lonely, connector, "FAKE-NOBODY-1-CT", stock=1)
        self.assertEqual(self.call("POST", f"/api/supply/parts/{lonely}/view-read", role="viewer").status, 403, "as for the part sheet")
        first = self.call("POST", f"/api/supply/parts/{lonely}/view-read", role="qa")
        self.assertEqual((first.status, first.json), (200, {"read": 1}), first.text)
        self.assertEqual(self.call("POST", f"/api/supply/parts/{lonely}/view-read", role="designer").json, {"read": 0}, "tried once in fifteen minutes, whoever looks")
        watch = self.watch_via_api("ABC-123")
        self.collect(connector)
        self.assertEqual(self.call("POST", f"/api/supply/parts/{watch['part_id']}/view-read", role="qa").json, {"read": 0}, "a followed part is read on schedule")
        self.assertEqual(self.call("POST", "/api/supply/parts/nope/view-read", role="qa").json, {"read": 0})

    def test_tokens(self) -> None:
        reader = self.AuthenticatedUser(email="bot@example.com", name="bot", role="admin", auth_type="agent", scopes=["api:read"])
        self.assertEqual(self.call("GET", "/api/supply/parts", user=reader).status, 200)
        body = {"manufacturer": "Acme", "mpn": "X1"}
        self.assertEqual(self.call("POST", "/api/supply/tracking/parts", user=reader, body=body).status, 403)
        kicad = self.AuthenticatedUser(email="k@example.com", name="k", role="admin", auth_type="kicad_provider", scopes=["remote_symbols.read"])
        self.assertEqual(self.call("GET", "/api/supply/parts", user=kicad).status, 403)
        self.assertEqual(self.call("POST", "/api/supply/tracking/parts", user=kicad, body=body).status, 403)

    # --- watches ----------------------------------------------------------

    def test_watching_a_part_lists_it_with_nothing_read_yet(self) -> None:
        watch = self.watch_via_api("LM358-D", threshold=100)
        self.assertEqual((watch["manufacturer"], watch["mpn"], watch["threshold"], watch["pinned"], watch["owner"]),
                         ("Acme", "LM358-D", 100, False, "admin@example.com"))
        (item,) = self.call("GET", "/api/supply/parts").json["items"]
        self.assertEqual((item["mpn"], item["status"], item["stock"], item["listings"], item["tier"]), ("LM358-D", "unknown", None, 0, None))
        self.assertEqual(item["watch"], {"threshold": 100, "pinned": False, "owner": "admin@example.com", "packaging": "any"})

    def test_a_watch_can_count_only_one_packaging(self) -> None:
        cid = self.fake_connector()
        watch = self.watch_via_api("PK-1")
        part = self.part_row("PK-1")["id"]
        cut = self.insert_listing(part, cid, "PK-CT", stock=300)
        reel = self.insert_listing(part, cid, "PK-REEL", stock=5000)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_listings SET packaging = 'cut_tape' WHERE id = %s", (cut,))
            conn.execute("UPDATE supply_listings SET packaging = 'tape_reel' WHERE id = %s", (reel,))
            conn.execute("UPDATE supply_offers SET packaging = 'cut_tape' WHERE listing_id = %s", (cut,))
            conn.execute("UPDATE supply_offers SET packaging = 'tape_reel' WHERE listing_id = %s", (reel,))
            conn.execute("UPDATE supply_connectors SET provider = 'demo_sum' WHERE id = %s", (cid,))
        from app.services.supply.providers import registry
        from app.services.supply.providers.base import ProviderSpec

        registry.register(ProviderSpec(
            key="demo_sum", label="Sum", capabilities=frozenset({"offers"}), max_batch=10, stock_pooling="separate",
            credential_fields=(), factory=lambda config: self.FakeProvider(config)), replace=True)
        try:
            self.assertEqual(self.part_row("PK-1")["stock"], 5300)
            reply = self.call("PUT", f"/api/supply/tracking/parts/{watch['part_id']}", body={"packaging": "cut_tape"})
            self.assertEqual((reply.status, reply.json["watch"]["packaging"]), (200, "cut_tape"))
            self.assertEqual(self.part_row("PK-1")["stock"], 300)
            detail = self.call("GET", f"/api/supply/parts/{part}").json
            self.assertEqual((detail["stock"], detail["watch"]["packaging"]), (300, "cut_tape"))
            self.call("PUT", f"/api/supply/tracking/parts/{watch['part_id']}", body={"packaging": "tape_reel"})
            self.assertEqual(self.part_row("PK-1")["stock"], 5000)
            self.assertEqual(self.call("PUT", f"/api/supply/tracking/parts/{watch['part_id']}", body={"packaging": "nonsense"}).status, 422)
        finally:
            registry.unregister("demo_sum")

    def test_a_pick_prices_the_part_and_every_listing_counts_toward_its_stock(self) -> None:
        from app.services.supply.providers import registry
        from app.services.supply.providers.base import ProviderSpec

        registry.register(ProviderSpec(
            key="demo_piles", label="Piles", capabilities=frozenset({"offers"}), max_batch=10, stock_pooling="separate",
            credential_fields=(), factory=lambda config: self.FakeProvider(config)), replace=True)
        try:
            cid = self.fake_connector()
            self.watch_via_api("PILE-1")
            part = self.part_row("PILE-1")["id"]
            cut = self.insert_listing(part, cid, "PL-CUT", stock=1000, price="0.50")
            custom = self.insert_listing(part, cid, "PL-CUSTOM", stock=1000, price="0.45")
            reel = self.insert_listing(part, cid, "PL-REEL", stock=5000, price="0.30")
            with self.store.connection() as conn:
                for listing, packaging in ((cut, "cut_tape"), (custom, "custom_reel"), (reel, "tape_reel")):
                    conn.execute("UPDATE supply_offers SET packaging = %s, moq = %s WHERE listing_id = %s", (packaging, 3000 if packaging == "tape_reel" else 1, listing))
                conn.execute("UPDATE supply_connectors SET provider = 'demo_piles' WHERE id = %s", (cid,))
                conn.execute("INSERT INTO supply_packaging_picks (part_id, connector_id, listing_id, picked_by) VALUES (%s, %s, %s, 'auto')", (part, cid, cut))
            row = self.part_row("PILE-1")
            self.assertEqual(row["stock"], 6000, "cut tape and custom reel are one pile of 1,000; the full reel adds its 5,000")
            self.assertEqual(self.call("GET", f"/api/supply/parts/{part}").json["stock"], 6000)
        finally:
            registry.unregister("demo_piles")

    def test_the_chart_counts_stock_like_the_part_and_is_priced_by_the_pick(self) -> None:
        from app.services.supply import part_history
        from app.services.supply.providers import registry
        from app.services.supply.providers.base import ProviderSpec

        registry.register(ProviderSpec(
            key="demo_chart", label="Chart", capabilities=frozenset({"offers"}), max_batch=10, stock_pooling="separate",
            credential_fields=(), factory=lambda config: self.FakeProvider(config)), replace=True)
        try:
            cid = self.fake_connector()
            self.watch_via_api("CHART-1")
            part = self.part_row("CHART-1")["id"]
            cut = self.insert_listing(part, cid, "CH-CUT", stock=11140, price="0.50")
            custom = self.insert_listing(part, cid, "CH-CUSTOM", stock=11140, price="0.45")
            reel = self.insert_listing(part, cid, "CH-REEL", stock=5000, price="0.30")
            now = datetime.now(timezone.utc)
            with self.store.connection() as conn:
                for listing, packaging, amount, price in ((cut, "cut_tape", 11140, "0.50"), (custom, "custom_reel", 11140, "0.45"), (reel, "tape_reel", 5000, "0.30")):
                    conn.execute("UPDATE supply_offers SET packaging = %s, moq = 1 WHERE listing_id = %s", (packaging, listing))
                    _reading(conn, listing, now, amount, price=price)
                conn.execute("UPDATE supply_connectors SET provider = 'demo_chart' WHERE id = %s", (cid,))
                conn.execute("INSERT INTO supply_packaging_picks (part_id, connector_id, listing_id, picked_by) VALUES (%s, %s, %s, 'person')", (part, cid, cut))
                data = part_history.build(conn, part, now, 7)
            line = data["connectors"][0]
            self.assertEqual(line["stock"][-1][1], 16140, "the cut tape and custom reel pile once, the full reel adds")
            self.assertEqual(data["total"][-1][1], self.call("GET", f"/api/supply/parts/{part}").json["stock"])
            self.assertEqual(line["price"][-1][1], 0.5, "the picked cut tape prices the line, not the cheaper reel")
            with self.store.connection() as conn:
                conn.execute("DELETE FROM supply_packaging_picks WHERE part_id = %s", (part,))
            (row,) = self.call("GET", "/api/supply/parts", query="scope=all&q=CHART-1").json["items"]
            self.assertEqual(row["distributors"][0]["stock"], 16140, "the list row counts a distributor's piles as the part does")
        finally:
            registry.unregister("demo_chart")

    def test_the_chart_total_counts_two_storefronts_of_one_account_once(self) -> None:
        from app.services.supply import part_history
        from app.services.supply.providers import registry
        from app.services.supply.providers.base import ProviderSpec

        registry.register(ProviderSpec(
            key="demo_store_b", label="Store B", capabilities=frozenset({"offers"}), max_batch=10, stock_pooling="separate",
            credential_fields=(), factory=lambda config: self.FakeProvider(config)), replace=True)
        self.addCleanup(registry.unregister, "demo_store_b")
        first, second = self.fake_connector(display_name="Store A"), self.fake_connector(display_name="Store B", provider="demo_store_b")
        self.watch_via_api("POOL-1")
        part = self.part_row("POOL-1")["id"]
        now = datetime.now(timezone.utc)
        listings = [self.insert_listing(part, cid, "PO-1", stock=1000, price="0.50") for cid in (first, second)]
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_connectors SET account_id = %s WHERE id = %s", (first, second))
            for listing in listings:
                _reading(conn, listing, now, 1000, price="0.5")
            data = part_history.build(conn, part, now, 7)
        self.assertEqual(data["total"][-1][1], 1000, "one shelf listed by two storefronts")
        self.assertEqual(data["total"][-1][1], self.call("GET", f"/api/supply/parts/{part}").json["stock"])

    def test_stock_history_leaves_out_a_listing_a_pick_stopped_reading_at_a_pick_limited_provider(self) -> None:
        from app.services.supply import parts_view

        cid = self.fake_connector()
        self.watch_via_api("HIST-1")
        part = self.part_row("HIST-1")["id"]
        picked = self.insert_listing(part, cid, "HI-PICKED", stock=100, price="0.50")
        other = self.insert_listing(part, cid, "HI-OTHER", stock=900, price="0.40")
        now = datetime.now(timezone.utc)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_connectors SET provider = 'pick_demo' WHERE id = %s", (cid,))
            conn.execute("INSERT INTO supply_packaging_picks (part_id, connector_id, listing_id, picked_by) VALUES (%s, %s, %s, 'person')", (part, cid, picked))
            for listing, amount, when in ((picked, 100, now), (other, 900, now - timedelta(days=10))):
                _reading(conn, listing, when, amount, price="0.5")
            series = parts_view.history(conn, part, now)
        self.assertEqual({point["stock"] for point in series[-3:]}, {100}, "the listing no longer read is not carried forward")

    def test_the_pick_a_packaging_list_holds_only_where_a_pick_saves_calls(self) -> None:
        cid = self.fake_connector()
        for mpn in ("PK-FARNELL", "PK-PICK"):
            self.watch_via_api(mpn)
        farnell, pick = self.part_row("PK-FARNELL")["id"], self.part_row("PK-PICK")["id"]
        other = self.connectors.create(actor=SEED_ACTOR, provider="pick_demo", display_name="Other", daily_budget=1000)["id"]
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_connectors SET provider = 'farnell' WHERE id = %s", (cid,))
        for part, connector, provider in ((farnell, cid, "farnell"), (pick, other, "pick_demo")):
            self.insert_listing(part, connector, f"{provider}-1", stock=10)
            self.insert_listing(part, connector, f"{provider}-2", stock=10)
        listed = [item["mpn"] for item in self.call("GET", "/api/supply/parts", query="scope=pick").json["items"]]
        self.assertEqual(listed, ["PK-PICK"], "Farnell reads every listing anyway, so a pick saves it nothing")

    def test_watching_twice_is_one_watch(self) -> None:
        first, second = self.watch_via_api("LM358-D"), self.watch_via_api("lm358d", status=200)
        self.assertEqual(first["part_id"], second["part_id"])
        self.assertEqual(self.call("GET", "/api/supply/parts").json["total"], 1)

    def test_bad_watch_requests(self) -> None:
        for body in ({}, {"manufacturer": "Acme"}, {"manufacturer": "Acme", "mpn": "X", "threshold": -1},
                     {"manufacturer": "Acme", "mpn": "X", "owner": "mallory"}):
            response = self.call("POST", "/api/supply/tracking/parts", body=body)
            self.assertEqual(response.status, 422, body)
            self.assertNotIn("mallory", json.dumps(response.json))
        blank = self.call("POST", "/api/supply/tracking/parts", body={"manufacturer": "Acme", "mpn": " - "})
        self.assertEqual((blank.status, blank.json["code"]), (400, "invalid_request"))

    def test_changing_a_watch(self) -> None:
        watch = self.watch_via_api(threshold=50)
        path = f"/api/supply/tracking/parts/{watch['part_id']}"
        pinned = self.call("PUT", path, body={"pinned": True})
        self.assertEqual((pinned.status, pinned.json["watch"]["threshold"], pinned.json["watch"]["pinned"]), (200, 50, True), "threshold left alone")
        cleared = self.call("PUT", path, body={"threshold": None})
        self.assertEqual((cleared.json["watch"]["threshold"], cleared.json["watch"]["pinned"]), (None, True), "null clears it, pin left alone")
        self.assertEqual(self.call("PUT", path, body={"threshold": 7}).json["watch"]["threshold"], 7)
        self.assertEqual(self.call("PUT", path, body={}).json["watch"]["threshold"], 7, "an empty change changes nothing")
        for body in ({"threshold": -1}, {"owner": "x"}):
            self.assertEqual(self.call("PUT", path, body=body).status, 422, body)
        self.assertEqual(self.call("PUT", "/api/supply/tracking/parts/missing", body={"pinned": True}).status, 404)

    def test_the_pin_limit_is_reported(self) -> None:
        with mock.patch.object(self.watches, "MAX_PINNED", 1):
            self.watch_via_api("P1", pinned=True)
            refused = self.call("POST", "/api/supply/tracking/parts", body={"manufacturer": "Acme", "mpn": "P2", "pinned": True})
            self.assertEqual((refused.status, refused.json["code"]), (400, "watch_error"))

    def test_removing_a_watch_keeps_the_part(self) -> None:
        watch = self.watch_via_api()
        self.assertEqual(self.call("DELETE", f"/api/supply/tracking/parts/{watch['part_id']}").status, 204)
        self.assertEqual(self.call("GET", "/api/supply/parts").json["items"], [])
        self.assertEqual(len(self.call("GET", "/api/supply/parts", query="scope=all").json["items"]), 1)
        self.assertEqual(self.call("DELETE", f"/api/supply/tracking/parts/{watch['part_id']}").status, 204, "stopping again is no change")
        self.assertEqual(self.call("DELETE", "/api/supply/tracking/parts/missing").status, 404)

    # --- the list ---------------------------------------------------------

    def test_scope_search_and_limit(self) -> None:
        self.watch_via_api("LM358-D")
        self.watch_via_api("TPS62840")
        with self.store.connection() as conn:
            self.parts.ensure_part(conn, "Onsemi", "NCP1117", SEED_ACTOR)
        listed = lambda **q: self.call("GET", "/api/supply/parts", query="&".join(f"{k}={v}" for k, v in q.items())).json  # noqa: E731
        self.assertEqual([i["mpn"] for i in listed()["items"]], ["LM358-D", "TPS62840"])
        self.assertEqual(listed(scope="all")["total"], 3)
        self.assertEqual([i["mpn"] for i in listed(scope="all", q="onsemi")["items"]], ["NCP1117"], "matches the manufacturer, any case")
        self.assertEqual([i["mpn"] for i in listed(q="tps")["items"]], ["TPS62840"])
        self.assertEqual(listed(q="zzz")["items"], [])
        page = listed(scope="all", limit=2)
        self.assertEqual((len(page["items"]), page["total"], page["limit"]), (2, 3, 2))
        self.assertEqual(self.call("GET", "/api/supply/parts", query="scope=nope").status, 422)
        self.assertEqual(self.call("GET", "/api/supply/parts", query="limit=0").status, 422)

    def test_search_wildcards_are_literal(self) -> None:
        self.watch_via_api("LM358-D")
        self.assertEqual(self.call("GET", "/api/supply/parts", query="q=%25").json["items"], [], "a percent sign is not everything")
        self.assertEqual(self.call("GET", "/api/supply/parts", query="q=_").json["items"], [])

    def test_a_collected_part_shows_stock_price_lifecycle_and_tier(self) -> None:
        cid = self.fake_connector()
        self.watch_via_api("ABC123")
        self.collect(cid)
        item = self.part_row("ABC123")
        expected = self.provider(cid).get_offers(["FAKE-ABC123-CT"])[0]
        self.assertEqual((item["stock"], item["listings"], item["lifecycle"], item["currency"]), (expected.stock, 1, "active", "EUR"))
        at_reference = pricing.unit_price_at(
            [(b.quantity, b.unit_price) for b in expected.price_breaks], moq=expected.moq, order_multiple=expected.order_multiple
        )
        self.assertEqual(float(item["unit_price"]), float(at_reference))
        self.assertEqual(item["price_quantity"], pricing.REFERENCE_QUANTITY)
        self.assertIn(item["status"], ("ok", "warning"))
        self.assertEqual(item["tier"], "weekly", "read on the schedule of its tracking rate")
        self.assertEqual(item["fetched_at"], self.now.isoformat())
        (line,) = item["offers"]
        self.assertEqual((line["connector_id"], line["stock"], line["moq"]), (cid, expected.stock, expected.moq))
        self.assertEqual(line["price_breaks"], [[b.quantity, str(b.unit_price)] for b in expected.price_breaks])
        self.assertIn("product_url", line)
        self.assertEqual(line["packaging"], expected.packaging.value)

    def test_the_list_can_be_narrowed_to_one_distributor(self) -> None:
        cid = self.fake_connector()
        self.watch_via_api("ABC123")
        self.collect(cid)
        listed = self.call("GET", "/api/supply/parts", query=f"scope=all&vendor={cid}").json
        self.assertEqual([item["mpn"] for item in listed["items"]], ["ABC123"])
        none = self.call("GET", "/api/supply/parts", query="scope=all&vendor=no-such-connector").json
        self.assertEqual((none["items"], none["total"]), ([], 0))

    def test_a_part_names_the_library_component_that_has_it(self) -> None:
        from unittest import mock

        from app.services.supply import catalog_read

        self.watch_via_api("ABC123")
        part_id = self.part_row("ABC123")["id"]
        with mock.patch.object(catalog_read, "component_for", lambda maker, mpn: "cmp-9" if mpn == "ABC123" else None):
            self.assertEqual(self.call("GET", f"/api/supply/parts/{part_id}/library-component").json, {"component_id": "cmp-9"})
        with mock.patch.object(catalog_read, "component_for", lambda maker, mpn: None):
            self.assertEqual(self.call("GET", f"/api/supply/parts/{part_id}/library-component").json, {"component_id": None})

    def test_the_list_shows_every_way_of_buying_but_counts_the_followed_one_once(self) -> None:
        cid = self.fake_connector()
        self.watch_via_api("TWICE1")
        part_id = self.part_row("TWICE1")["id"]
        cut = self.insert_listing(part_id, cid, "TW-1-ND", stock=100, price="0.5")
        self.insert_listing(part_id, cid, "TW-2-ND", stock=100, price="0.4")
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_packaging_picks (part_id, connector_id, listing_id, picked_by) VALUES (%s, %s, %s, 'auto')", (part_id, cid, cut))
        row = self.part_row("TWICE1")
        self.assertEqual(row["stock"], 100, "a distributor is counted once, through the followed listing")
        self.assertEqual({line["sku"] for line in row["offers"]}, {"TW-1-ND", "TW-2-ND"}, "but the list shows both")

    def test_status_follows_what_the_market_says(self) -> None:
        cid = self.fake_connector()
        for mpn in ("OOS-1", "EOL-1", "NRND-1"):
            self.watch_via_api(mpn)
        self.collect(cid)
        self.assertEqual(self.part_row("OOS-1")["status"], "error")
        self.assertEqual(self.part_row("EOL-1")["status"], "fatal")
        nrnd = self.part_row("NRND-1")
        self.assertEqual((nrnd["status"], nrnd["lifecycle"]), ("warning", "nrnd"))

    def test_the_list_can_be_narrowed_to_the_groups_the_overview_counts(self) -> None:
        cid = self.fake_connector()
        for mpn in ("OOS-1", "EOL-1", "NRND-1", "FINE-1"):
            self.watch_via_api(mpn)
        self.collect(cid)

        def only(group: str) -> list[str]:
            reply = self.call("GET", "/api/supply/parts", query=f"only={group}").json
            self.assertEqual(reply["total"], len(reply["items"]))
            return sorted(item["mpn"] for item in reply["items"])

        self.assertEqual(only("out_of_stock"), ["OOS-1"])
        self.assertEqual(only("lifecycle"), ["EOL-1", "NRND-1"])
        self.assertEqual(only("at_risk"), ["EOL-1", "OOS-1"], "an NRND part is a warning: it needs a look but is not at risk")
        self.assertEqual(len(only("")), 4)
        self.assertEqual(self.call("GET", "/api/supply/parts", query="only=nonsense").status, 400)

    def test_a_threshold_above_stock_is_a_warning(self) -> None:
        cid = self.fake_connector()
        watch = self.watch_via_api("ABC123", threshold=10_000_000)
        self.collect(cid)
        self.assertEqual(self.part_row("ABC123")["status"], "warning")
        self.call("PUT", f"/api/supply/tracking/parts/{watch['part_id']}", body={"threshold": None})
        self.assertEqual(self.part_row("ABC123")["status"], "ok")

    def store_rate(self, currency: str, per_eur: str) -> None:
        from decimal import Decimal

        from app.services.supply import fx

        with self.store.connection() as conn:
            fx.store(conn, self.now.date(), {currency: Decimal(per_eur)}, "manual")

    def test_a_price_from_the_simulated_market_is_test_data(self) -> None:
        simulated = self.fake_connector()
        real = self.fake_connector(provider="pick_demo", display_name="Real")
        part_id = self.watch_via_api("SIMMED")["part_id"]
        self.insert_listing(part_id, simulated, "S", stock=10, currency="EUR", price="0.30")
        item = self.part_row("SIMMED")
        self.assertEqual((item["unit_price"], item["price_test_data"]), ("0.3", True))
        self.insert_listing(part_id, real, "R", stock=10, currency="EUR", price="0.20")
        item = self.part_row("SIMMED")
        self.assertEqual((item["unit_price"], item["price_test_data"]), ("0.2", False), "the cheapest is a real distributor's")
        self.assertTrue(self.registry.is_simulated("fake"))
        self.assertFalse(self.registry.is_simulated("pick_demo"))

    def test_prices_in_other_currencies_are_converted_to_the_base_currency(self) -> None:
        cid = self.fake_connector()
        part_id = self.watch_via_api("MIXED")["part_id"]
        self.insert_listing(part_id, cid, "A", stock=10, currency="EUR", price="0.50")
        self.insert_listing(part_id, cid, "B", stock=10, currency="EUR", price="0.40")
        item = self.part_row("MIXED")
        self.assertEqual((item["unit_price"], item["currency"], item["price_kind"]), ("0.4", "EUR", "orderable"), "the lowest, as a plain number")
        self.insert_listing(part_id, cid, "C", stock=10, currency="USD", price="0.30")
        item = self.part_row("MIXED")
        self.assertEqual((item["unit_price"], item["price_unrated"]), ("0.4", ["USD"]), "no rate for dollars: it is left out, and the row says so")
        self.store_rate("USD", "1.25")
        item = self.part_row("MIXED")
        self.assertEqual((item["unit_price"], item["currency"], item["price_unrated"]), ("0.24", "EUR", []), "0.30 USD is 0.24 EUR")
        self.assertEqual(item["price_native"], {"price": "0.3", "currency": "USD"}, "the row says what the converted price was")

    def test_a_part_nobody_has_in_stock_shows_the_backorder_price_with_its_lead_time(self) -> None:
        cid = self.fake_connector()
        part_id = self.watch_via_api("OUT")["part_id"]
        self.insert_listing(part_id, cid, "A", stock=0, price="0.50")
        slow = self.insert_listing(part_id, cid, "B", stock=0, price="0.40")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_offers SET lead_time_days = 84 WHERE listing_id = %s", (slow,))
        item = self.part_row("OUT")
        self.assertEqual((item["unit_price"], item["price_kind"], item["price_lead_days"]), ("0.4", "backorder", 84))
        self.insert_listing(part_id, cid, "C", stock=500, price="0.45")
        item = self.part_row("OUT")
        self.assertEqual((item["unit_price"], item["price_kind"], item["price_lead_days"]), ("0.45", "orderable", None), "stock beats a cheaper backorder")

    def test_a_part_with_no_lead_time_shows_the_price_it_last_had_in_stock(self) -> None:
        cid = self.fake_connector()
        part_id = self.watch_via_api("GONE")["part_id"]
        listing = self.insert_listing(part_id, cid, "A", stock=0, price="0.50")
        with self.store.connection() as conn:
            _reading(conn, listing, self.now - timedelta(days=9), 40, price="0.42")
        item = self.part_row("GONE")
        self.assertEqual((item["unit_price"], item["price_kind"], item["price_seen_day"]),
                         ("0.42", "last_seen", (self.now - timedelta(days=9)).date().isoformat()))
        other = self.watch_via_api("NEVER")["part_id"]
        self.insert_listing(other, cid, "N", stock=0, price="0.50")
        self.assertEqual(self.part_row("NEVER")["price_kind"], "listed", "never seen in stock: the list price, said so")

    def test_the_range_is_over_distributors_and_there_is_no_mean(self) -> None:
        first, second = self.fake_connector(), self.fake_connector(provider="lcsc", display_name="Other", currency="USD")
        part_id = self.watch_via_api("RANGE")["part_id"]
        self.insert_listing(part_id, first, "A", stock=10, price="0.50")
        self.insert_listing(part_id, first, "B", stock=10, price="0.30")
        self.assertIsNone(self.part_row("RANGE")["price_range"], "one distributor is not a range")
        self.insert_listing(part_id, second, "C", stock=10, price="0.70")
        item = self.part_row("RANGE")
        self.assertEqual(item["price_range"], {"low": "0.3", "high": "0.7", "median": "0.5", "sellers": 2})

    def test_a_part_can_have_its_own_price_quantity(self) -> None:
        cid = self.fake_connector()
        part_id = self.watch_via_api("QTY2")["part_id"]
        listing = self.insert_listing(part_id, cid, "A", stock=100000, price="0.50")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_offers SET price_breaks = %s::jsonb WHERE listing_id = %s", (json.dumps([[1, "0.50"], [100, "0.30"], [1000, "0.20"]]), listing))
        self.assertEqual(self.part_row("QTY2")["unit_price"], "0.3", "the workspace default is 100")
        reply = self.call("PUT", f"/api/supply/parts/{part_id}/price-quantity", role="designer", body={"quantity": 1000})
        self.assertEqual((reply.status, reply.json), (200, {"quantity": 1000, "default": 100, "own": True}))
        self.assertEqual(self.part_row("QTY2")["unit_price"], "0.2", "the list follows the part's quantity at once")
        detail = self.call("GET", f"/api/supply/parts/{part_id}").json["price"]
        self.assertEqual((detail["quantity"], detail["own"], detail["headline"]["unit_price"]), (1000, True, "0.2"))
        from app.services.supply import settings as supply_settings

        def put_back() -> None:
            with self.store.connection() as conn:
                supply_settings.reset(conn, "admin@example.com")

        self.addCleanup(put_back)
        with self.store.connection() as conn:
            supply_settings.save_form(conn, {"price_quantity": 1}, "admin@example.com")
        self.assertEqual(self.part_row("QTY2")["unit_price"], "0.2", "a part's own quantity wins over the default")
        self.call("PUT", f"/api/supply/parts/{part_id}/price-quantity", role="designer", body={"quantity": None})
        self.assertEqual(self.part_row("QTY2")["unit_price"], "0.5", "back on the default, now 1")
        self.assertEqual(self.call("PUT", f"/api/supply/parts/{part_id}/price-quantity", role="viewer", body={"quantity": 5}).status, 403)
        self.assertEqual(self.call("PUT", f"/api/supply/parts/{part_id}/price-quantity", role="designer", body={"quantity": 0}).status, 422)

    def test_the_price_history_follows_the_quantity_from_the_kept_breaks(self) -> None:
        from app.services.supply import prices

        cid = self.fake_connector()
        part_id = self.watch_via_api("HIST")["part_id"]
        listing = self.insert_listing(part_id, cid, "A", stock=50, price="0.50")
        today = self.now
        with self.store.connection() as conn:
            for days, price in ((6, "0.30"), (3, "0.30"), (0, "0.28")):
                _reading(conn, listing, today - timedelta(days=days), 50)
            conn.execute("DELETE FROM supply_price_breaks_history WHERE listing_id = %s", (listing,))
            conn.execute(
                "INSERT INTO supply_price_breaks_history (listing_id, since, breaks, currency, moq, order_multiple) "
                "VALUES (%s, %s, %s::jsonb, 'EUR', 1, 1), (%s, %s, %s::jsonb, 'EUR', 1, 1)",
                (listing, today - timedelta(days=4), json.dumps([[1, "0.50"], [100, "0.30"], [1000, "0.20"]]),
                 listing, today - timedelta(days=1), json.dumps([[1, "0.50"], [100, "0.28"], [1000, "0.18"]])),
            )
            at_100, meta_100 = prices.daily(conn, part_id, today)
        self.assertEqual([float(p) for _, p, _ in at_100], [0.3, 0.28], "a reading before the first kept breaks has no price")
        self.assertEqual(meta_100["quantity"], 100)
        self.call("PUT", f"/api/supply/parts/{part_id}/price-quantity", role="designer", body={"quantity": 1000})
        with self.store.connection() as conn:
            at_1000, meta = prices.daily(conn, part_id, today)
        self.assertEqual(sorted(float(p) for _, p, _ in at_1000), [0.18, 0.2])
        self.assertEqual(meta["quantity"], 1000)
        from app.services.supply import part_history

        with self.store.connection() as conn:
            line = part_history.build(conn, part_id, today, 7)["connectors"][0]["price"]
        self.assertEqual(line[-1][1], 0.18, "the distributor's line is priced at the part's quantity too, from the breaks in force")
        self.assertEqual(line[0][1], 0.2, "and has no price before the first kept breaks")

    def test_supply_search_finds_a_part_by_number_other_number_sku_or_maker(self) -> None:
        from app.services.supply import part_search

        cid = self.fake_connector()
        part_id = self.watch_via_api("LM358DR")["part_id"]
        self.watch_via_api("NE5532P")
        self.insert_listing(part_id, cid, "296-1395-1-ND", stock=5)
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_part_numbers (part_id, mpn, match_key) VALUES (%s, 'LM358-OLD', 'LM358OLD')", (part_id,))
            by_number = [hit["mpn"] for hit in part_search.supply_hits(conn, "lm358", 8)]
            by_other = [hit["mpn"] for hit in part_search.supply_hits(conn, "LM358-OLD", 8)]
            by_sku = [hit["mpn"] for hit in part_search.supply_hits(conn, "296-1395", 8)]
            by_maker = {hit["mpn"] for hit in part_search.supply_hits(conn, "Acme", 8)}
            exact = part_search.supply_hits(conn, "NE5532P", 8)
            none = part_search.supply_hits(conn, "x", 8)
        self.assertEqual((by_number, by_other, by_sku), (["LM358DR"], ["LM358DR"], ["LM358DR"]))
        self.assertEqual(by_maker, {"LM358DR", "NE5532P"})
        self.assertEqual((exact[0]["mpn"], exact[0]["rank"]), ("NE5532P", 0))
        self.assertEqual(none, [], "one letter is not a search")
        self.assertEqual(part_search._like("100%_"), "%100" + chr(92) + "%" + chr(92) + "_%", "wildcards in the query are literal")

    def test_distributor_suggestions_are_kept_per_distributor_and_replaced_whole(self) -> None:
        from app.services.supply import alternates, cross_reference
        from app.services.supply.models import Alternate

        part_id = self.watch_via_api("LM358DR")["part_id"]
        known = self.watch_via_api("LM358ADR")["part_id"]
        with self.store.connection() as conn:
            alternates.replace(conn, part_id, "lcsc", [Alternate("Acme", "LM358ADR", "C1", "SOIC-8"), Alternate("Acme", "LM358DR"), Alternate("Foo", "NOPE-1")], self.now)
            alternates.replace(conn, part_id, "mouser", [Alternate(sku="595-LM358ADR", note="Mouser number"), Alternate("Acme", "LM358ADR")], self.now)
            found = {entry["mpn"] or entry["sku"]: entry for entry in alternates.for_part(conn, part_id)}
            suggested = cross_reference.candidates(conn, part_id)["suggestions"]
            self.assertEqual(sorted(found), ["595-LM358ADR", "LM358ADR", "NOPE-1"], "the part itself is never its own alternate")
            self.assertEqual(found["LM358ADR"]["part_id"], known, "matched to the part Prism knows")
            self.assertEqual([source["provider"] for source in found["LM358ADR"]["sources"]], ["lcsc", "mouser"], "one row, every distributor that said it, in name order")
            self.assertIsNone(found["NOPE-1"]["part_id"])
            self.assertEqual([entry["tracked"] for entry in suggested if entry["part_id"] == known], [True])
            alternates.replace(conn, part_id, "lcsc", [], self.now)
            left = {entry["mpn"] or entry["sku"] for entry in alternates.for_part(conn, part_id)}
        self.assertEqual(left, {"595-LM358ADR", "LM358ADR"}, "an empty set removes what LCSC said and leaves Mouser's")

    def test_the_poller_keeps_stock_outs_and_restocks_with_the_quote_and_closes_the_open_one(self) -> None:
        from app.services.supply import stock_events

        cid = self.fake_connector()
        part_id = self.watch_via_api("EVT")["part_id"]
        listing = self.insert_listing(part_id, cid, "A", stock=0)
        day = self.now
        with self.store.connection() as conn:
            self.assertIsNone(stock_events.record(conn, listing, None, 0, 84, False, day), "a first reading is no event")
            self.assertIsNone(stock_events.record(conn, listing, 5, 4, None, False, day), "stock going down is no event")
            self.assertIsNone(stock_events.record(conn, listing, 5, 0, 84, True, day), "marketplace stock is no event")
            self.assertEqual(stock_events.record(conn, listing, 5, 0, 84, False, day), "stock_out")
            open_row = conn.execute("SELECT * FROM supply_stock_events WHERE listing_id = %s", (listing,)).fetchone()
            self.assertEqual((open_row["quoted_lead_days"], open_row["expected"], open_row["resolved_on"]), (84, (day + timedelta(days=84)).date(), None))
            self.assertEqual(stock_events.record(conn, listing, 0, 900, None, False, day + timedelta(days=30)), "restock")
            rows = {row["kind"]: row for row in conn.execute("SELECT * FROM supply_stock_events WHERE listing_id = %s", (listing,)).fetchall()}
        self.assertEqual(rows["stock_out"]["resolved_on"], (day + timedelta(days=30)).date(), "the restock ends the open stock-out")

    def seed_scorecard(self, shared: int) -> tuple[str, str]:
        """``shared`` parts each listed by two distributors; the first always restocks first and keeps its word, the second is late."""

        first, second = self.fake_connector(), self.fake_connector(provider="lcsc", display_name="Other", currency="USD")
        today = self.now.date()
        with self.store.connection() as conn:
            for n in range(shared):
                part_id = self.watch_via_api(f"SC{n}")["part_id"]
                one = self.insert_listing(part_id, first, f"A{n}", stock=5)
                two = self.insert_listing(part_id, second, f"B{n}", stock=5)
                for listing, back, quote in ((one, 10, 10), (two, 25, 14)):
                    out = today - timedelta(days=60)
                    conn.execute(
                        "INSERT INTO supply_stock_events (listing_id, day, kind, stock_before, stock_after, quoted_lead_days, expected, resolved_on) "
                        "VALUES (%s, %s, 'stock_out', 5, 0, %s, %s, %s)", (listing, out, quote, out + timedelta(days=quote), out + timedelta(days=back)))
                    conn.execute("INSERT INTO supply_stock_events (listing_id, day, kind, stock_before, stock_after) VALUES (%s, %s, 'restock', 0, 5)",
                                 (listing, out + timedelta(days=back)))
        return first, second

    def test_the_scorecard_judges_on_shared_parts_and_withholds_under_five_events(self) -> None:
        from app.services.supply import scorecard

        first, second = self.seed_scorecard(2)
        with self.store.connection() as conn:
            few = scorecard.build(conn, self.now.date())
        self.assertEqual(few["shared_parts"], 2)
        row = next(item for item in few["distributors"] if item["connector_id"] == first)
        self.assertEqual((row["stock_outs"]["n"], row["stock_outs"]["median_days_out"], row["promises"]["kept"]), (2, None, None), "two events say nothing yet")

    def test_the_scorecard_says_who_restocks_first_and_who_keeps_its_word(self) -> None:
        from app.services.supply import scorecard

        first, second = self.seed_scorecard(5)
        with self.store.connection() as conn:
            card = scorecard.build(conn, self.now.date())
        rows = {item["connector_id"]: item for item in card["distributors"]}
        self.assertEqual(card["shared_parts"], 5)
        self.assertEqual((rows[first]["restocked_first"], rows[second]["restocked_first"]), ({"rounds": 5, "first": 5}, {"rounds": 5, "first": 0}))
        self.assertEqual((rows[first]["promises"]["kept"], rows[first]["promises"]["resolved"]), (5, 5), "back on the day it said")
        self.assertEqual((rows[second]["promises"]["kept"], rows[second]["promises"]["median_days_late"]), (0, 11), "quoted 14 days, took 25")
        self.assertEqual((rows[second]["wait"]["quoted_days"], rows[second]["wait"]["real_days"]), (14, 25))
        self.assertEqual(rows[first]["stock_outs"], {"n": 5, "median_days_out": 10})

    def test_the_stock_share_counts_each_day_once_from_its_last_reading(self) -> None:
        from app.services.supply import scorecard

        first, second = self.seed_scorecard(1)
        alone = self.insert_listing(self.watch_via_api("ALONE")["part_id"], first, "ALONE", stock=5)
        today = self.now.date()
        with self.store.connection() as conn:
            listings = {row["sku"]: row["id"] for row in conn.execute("SELECT id, sku FROM supply_listings WHERE sku IN ('A0', 'B0')").fetchall()}
            one, two = listings["A0"], listings["B0"]
            def daily(listing: str, days_ago: int, stock: int, marketplace: bool = False) -> None:
                conn.execute(
                    "INSERT INTO supply_samples_daily (listing_id, day, stock, marketplace) VALUES (%s, %s, %s, %s)",
                    (listing, today - timedelta(days=days_ago), stock, marketplace))

            def raw(listing: str, days_ago: int, hour: int, stock: int, marketplace: bool = False) -> None:
                at = datetime.combine(today - timedelta(days=days_ago), datetime.min.time(), timezone.utc) + timedelta(hours=hour)
                conn.execute("INSERT INTO supply_samples (listing_id, sampled_at, stock, marketplace) VALUES (%s, %s, %s, %s)", (listing, at, stock, marketplace))

            for days_ago, stock in ((10, 5), (11, 0), (12, 5)):
                daily(one, days_ago, stock)
            daily(one, scorecard.STOCK_DAYS + 5, 5)  # before the window
            daily(one, 13, 5, marketplace=True)  # a marketplace's stock is not the distributor's
            daily(two, 3, 0)
            raw(two, 3, 8, 0)
            raw(two, 3, 20, 7)  # the day's last reading speaks for it, not the rollup
            daily(two, 4, 9)
            raw(two, 4, 9, 9, marketplace=True)  # a raw day holding only marketplace readings counts for nothing
            daily(alone, 10, 5)  # one distributor's part is not judged
            share = scorecard._stock_share(conn, today)
        self.assertEqual(share, {first: (2, 3), second: (1, 1)})

    def test_a_part_one_distributor_lists_is_not_judged(self) -> None:
        from app.services.supply import scorecard

        cid = self.fake_connector()
        part_id = self.watch_via_api("ALONE")["part_id"]
        listing = self.insert_listing(part_id, cid, "A", stock=5)
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_stock_events (listing_id, day, kind, stock_before, stock_after) VALUES (%s, %s, 'stock_out', 5, 0)", (listing, self.now.date()))
            card = scorecard.build(conn, self.now.date())
        self.assertEqual((card["shared_parts"], card["distributors"]), (0, []))

    def test_the_part_sheet_shows_each_distributors_open_promise_and_record(self) -> None:
        cid = self.fake_connector()
        part_id = self.watch_via_api("OPEN")["part_id"]
        listing = self.insert_listing(part_id, cid, "A", stock=0)
        today = self.now.date()
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_stock_events (listing_id, day, kind, stock_before, stock_after, quoted_lead_days, expected) VALUES (%s, %s, 'stock_out', 5, 0, 30, %s)",
                (listing, today - timedelta(days=40), today - timedelta(days=10)))
        record = self.call("GET", f"/api/supply/parts/{part_id}").json["restock_record"]
        self.assertEqual(len(record), 1)
        self.assertEqual((record[0]["open"]["kind"], record[0]["open"]["late"], record[0]["stock_outs"]), ("lead_time", True, 1), "ten days past the day it said")

    def test_ending_reasons_come_with_their_source(self) -> None:
        from app.services.supply import ending_parts

        item = {"lifecycle": "nrnd", "dropped": True}
        self.assertEqual([r["kind"] for r in ending_parts.reasons_of(item, "ending")], ["nrnd", "dropped", "outlook"])
        self.assertEqual(ending_parts.reasons_of({"lifecycle": "active", "dropped": False}, "no_signs"), [])
        self.assertEqual(ending_parts.reasons_of({"lifecycle": "last_time_buy", "dropped": False}, None)[0]["text"], "Last time buy")

    def test_a_restriction_is_kept_audited_replaced_and_cleared(self) -> None:
        from app.services.supply import ending_parts

        with self.store.connection() as conn:
            marked = ending_parts.set_restriction(conn, "c1", "not_for_new_designs", "  NRND   since   2026  ", "c2", "qa@example.com")
            self.assertEqual((marked["level"], marked["reason"], marked["replacement_component_id"]), ("not_for_new_designs", "NRND since 2026", "c2"))
            with self.assertRaises(ValueError):
                ending_parts.set_restriction(conn, "c1", "hidden", "", "", "qa@example.com")
            with self.assertRaises(ValueError):
                ending_parts.set_restriction(conn, "c1", "retired", "", "c1", "qa@example.com")
            ending_parts.set_restriction(conn, "c1", "retired", "archived", "", "qa@example.com")
            self.assertEqual(ending_parts.restrictions_of(conn, ["c1", "c9"])["c1"]["level"], "retired")
            ending_parts.clear_restriction(conn, "c1", "qa@example.com")
            self.assertEqual(ending_parts.restrictions_of(conn, ["c1"]), {})
            actions = [row["action"] for row in conn.execute("SELECT action FROM supply_audit_events WHERE subject_id = 'c1' ORDER BY id").fetchall()]
        self.assertEqual(actions, ["component.restriction", "component.restriction", "component.restriction.clear"])

    def test_the_queue_lists_components_of_ending_tracked_parts_with_what_a_person_needs_to_decide(self) -> None:
        from app.services.supply import catalog_read, ending_parts

        cid = self.fake_connector()
        part_id = self.watch_via_api("OLD-1")["part_id"]
        self.watch_via_api("FINE-1")
        listing = self.insert_listing(part_id, cid, "A", stock=40)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_offers SET lifecycle = 'nrnd' WHERE listing_id = %s", (listing,))
            conn.execute("INSERT INTO supply_part_facts (part_id, provider, name, value, observed_at) VALUES (%s, 'fake', 'last_buy_date', '2027-03-31', NOW())", (part_id,))

        def found(query: str, limit: int):
            return [{"id": "comp-1", "name": "Old part", "mpn": "OLD-1", "manufacturer": "Acme", "workflow_stage": "released"}] if query == "OLD-1" else []

        with mock.patch.object(catalog_read, "search", found), self.store.connection() as conn:
            queue = ending_parts.queue(conn)
            self.assertEqual([row["component"]["id"] for row in queue["items"]], ["comp-1"], "the active part is not ending")
            row = queue["items"][0]
            self.assertEqual((row["part_id"], row["stock"], [r["kind"] for r in row["reasons"]]), (part_id, 40, ["nrnd"]))
            self.assertEqual([item["value"] for item in row["last_buy"]], ["2027-03-31"])
            ending_parts.set_restriction(conn, "comp-1", "not_for_new_designs", "", "", "qa@example.com")
            marked = ending_parts.queue(conn)["items"][0]["restriction"]
            self.assertEqual(marked["level"], "not_for_new_designs", "still listed, marked")
            ending_parts.set_restriction(conn, "comp-1", "retired", "archived", "", "qa@example.com")
            self.assertEqual(ending_parts.queue(conn)["items"], [], "a retired component leaves the queue")

    def test_the_market_price_change_follows_a_parts_own_quantity_from_the_kept_breaks(self) -> None:
        from app.services.supply import market

        cid = self.fake_connector()
        part_id = self.watch_via_api("MKT")["part_id"]
        listing = self.insert_listing(part_id, cid, "A", stock=10, price="0.50")
        today = self.now
        since = today - timedelta(days=10)
        with self.store.connection() as conn:
            conn.execute("DELETE FROM supply_price_breaks_history WHERE listing_id = %s", (listing,))
            for days, price, price_1000 in ((20, "0.30", "0.20"), (0, "0.30", "0.10")):
                _reading(conn, listing, today - timedelta(days=days), 10)
                conn.execute(
                    "INSERT INTO supply_price_breaks_history (listing_id, since, breaks, currency, moq, order_multiple) VALUES (%s, %s, %s::jsonb, 'EUR', 1, 1)",
                    (listing, today - timedelta(days=days), json.dumps([[1, "0.50"], [100, price], [1000, price_1000]])))
            at_100 = market.price_changes(conn, [part_id], since)[part_id]
        self.call("PUT", f"/api/supply/parts/{part_id}/price-quantity", role="designer", body={"quantity": 1000})
        with self.store.connection() as conn:
            at_1000 = market.price_changes(conn, [part_id], since)[part_id]
        self.assertEqual([float(r) for r in at_100], [1.0], "at 100 the price did not move")
        self.assertEqual([float(r) for r in at_1000], [0.5], "at 1,000 it halved")

    def test_the_poller_keeps_the_price_breaks_only_when_they_change(self) -> None:
        from decimal import Decimal

        from app.services.supply import price_breaks

        cid = self.fake_connector()
        part_id = self.watch_via_api("KEEP")["part_id"]
        listing = self.insert_listing(part_id, cid, "A")
        breaks = [(1, Decimal("0.50")), (100, Decimal("0.30"))]
        with self.store.connection() as conn:
            self.assertTrue(price_breaks.record(conn, listing, self.now, breaks, "EUR", 1, 1))
            self.assertFalse(price_breaks.record(conn, listing, self.now + timedelta(days=1), breaks, "EUR", 1, 1), "same breaks")
            self.assertTrue(price_breaks.record(conn, listing, self.now + timedelta(days=2), [(1, Decimal("0.50")), (100, Decimal("0.29"))], "EUR", 1, 1))
            self.assertFalse(price_breaks.record(conn, listing, self.now, [], "EUR", 1, 1), "nothing to keep")
            self.assertTrue(price_breaks.record(conn, listing, self.now + timedelta(days=3), [(1, Decimal("0.50")), (100, Decimal("0.29"))], "EUR", 1, 1, up_to=100),
                            "a quote that now stops at a quantity is a change")
            kept = price_breaks.load(conn, [listing])[listing]
        self.assertEqual([row["breaks"][1][1] for row in kept], [Decimal("0.30"), Decimal("0.29"), Decimal("0.29")])
        self.assertEqual([row["up_to"] for row in kept], [None, None, 100])

    # --- the detail -------------------------------------------------------

    def test_the_detail_lists_every_listing_with_its_offer_and_schedule(self) -> None:
        cid = self.fake_connector()
        watch = self.watch_via_api("ABC123")
        self.collect(cid)
        near = self.insert_listing(watch["part_id"], cid, "NEARSKU", state="near")
        rejected = self.insert_listing(watch["part_id"], cid, "NOPE", state="rejected", stock=5)
        detail = self.call("GET", f"/api/supply/parts/{watch['part_id']}", role="qa").json
        self.assertEqual({key: value for key, value in detail["part"].items() if key != "first_seen"}, {"id": watch["part_id"], "mpn": "ABC123", "manufacturer": "Acme"})
        self.assertTrue(detail["part"]["first_seen"])
        self.assertEqual(detail["watch"]["threshold"], watch["threshold"])
        skus = {item["sku"]: item for item in detail["listings"]}
        self.assertEqual(sorted(skus), ["FAKE-ABC123-CT", "NEARSKU"], "a rejected listing is not shown")
        main = skus["FAKE-ABC123-CT"]
        self.assertEqual((main["counted"], main["packaging"], main["match_state"]), (True, "cut_tape", "exact"))
        self.assertEqual(len(main["offer"]["price_breaks"]), 4)
        self.assertEqual((main["offer"]["currency"], main["offer"]["moq"], main["offer"]["fetched_at"]), ("EUR", 1, self.now.isoformat()))
        self.assertEqual(main["poll"]["error_streak"], 0)
        self.assertIsNotNone(main["poll"]["next_poll_at"])
        self.assertEqual((skus["NEARSKU"]["counted"], skus["NEARSKU"]["offer"], skus["NEARSKU"]["poll"]), (False, None, None))
        self.assertEqual(detail["stock"], main["offer"]["stock"])
        self.assertEqual(detail["stock_by_connector"], [{"connector_id": cid, "connector_name": "Sim", "provider": "fake", "stock": main["offer"]["stock"]}])
        self.assertNotIn(rejected, [item["id"] for item in detail["listings"]])
        self.assertNotIn(near, [item["id"] for item in detail["listings"] if item["counted"]])

    def test_the_detail_of_a_part_nobody_read_yet(self) -> None:
        detail = self.call("GET", f"/api/supply/parts/{self.watch_via_api()['part_id']}").json
        self.assertEqual((detail["status"], detail["stock"], detail["stock_by_connector"], detail["history"], detail["listings"]),
                         ("unknown", None, [], [], []))

    def test_a_part_that_is_not_watched_still_has_a_detail(self) -> None:
        with self.store.connection() as conn:
            part = self.parts.ensure_part(conn, "Acme", "LOOSE", SEED_ACTOR)
        detail = self.call("GET", f"/api/supply/parts/{part.id}").json
        self.assertIsNone(detail["watch"])

    def test_history_carries_each_listings_last_figure_forward(self) -> None:
        cid = self.fake_connector()
        part_id = self.watch_via_api("HIST")["part_id"]
        first = self.insert_listing(part_id, cid, "A", stock=0)
        # The API looks back from the real clock, so the samples are placed relative to it.
        start = (datetime.now(timezone.utc) - timedelta(days=6)).replace(hour=9, minute=0, second=0, microsecond=0)
        day = lambda n, hour=9: (start + timedelta(days=n)).replace(hour=hour)  # noqa: E731
        for when, stock in ((day(0), 10), (day(0, 18), 12), (day(3), 25)):
            self.insert_sample(first, when, stock)
        detail = self.call("GET", f"/api/supply/parts/{part_id}").json
        history = detail["history"]
        self.assertEqual([(h["day"], h["stock"]) for h in history],
                         [((start + timedelta(days=n)).date().isoformat(), value) for n, value in ((0, 12), (1, 12), (2, 12), (3, 25))],
                         "the last sample of a day wins and quiet days repeat it")
        # The sheet's charts come with the detail, a line per distributor, as the history endpoint gives them.
        self.assertEqual(detail["distributor_history"], self.call("GET", f"/api/supply/parts/{part_id}/history").json)

    def test_history_combines_listings_without_double_counting_pooled_stock(self) -> None:
        cid = self.fake_connector()  # the simulated market's stock is pooled across packaging
        part_id = self.watch_via_api("POOL")["part_id"]
        ct, rl = (self.insert_listing(part_id, cid, sku, stock=0) for sku in ("CT", "RL"))
        when = datetime.now(timezone.utc) - timedelta(days=3)
        self.insert_sample(ct, when, 1000)
        self.insert_sample(rl, when, 1000)
        history = self.call("GET", f"/api/supply/parts/{part_id}").json["history"]
        self.assertEqual([h["stock"] for h in history], [1000])

    def test_history_is_limited_to_the_recent_past(self) -> None:
        cid = self.fake_connector()
        part_id = self.watch_via_api("OLD")["part_id"]
        listing = self.insert_listing(part_id, cid, "A", stock=0)
        self.insert_sample(listing, START - timedelta(days=200), 5)
        self.insert_sample(listing, START - timedelta(days=1), 9)
        from app.services.supply import parts_view

        with self.store.connection() as conn:
            history = parts_view.part_detail(conn, part_id, now=START)["history"]
        self.assertEqual([h["stock"] for h in history], [9])

    def test_history_leaves_out_marketplace_stock_and_listings_that_disappeared(self) -> None:
        cid = self.fake_connector()
        part_id = self.watch_via_api("COVER")["part_id"]
        kept = self.insert_listing(part_id, cid, "KEPT", stock=0)
        vanished = self.insert_listing(part_id, cid, "VANISHED", state="gone", stock=0)
        resold = self.insert_listing(part_id, cid, "RESOLD", stock=0)
        start = (datetime.now(timezone.utc) - timedelta(days=4)).replace(hour=9, minute=0, second=0, microsecond=0)
        self.insert_sample(kept, start, 10)
        self.insert_sample(kept, start + timedelta(days=2), 20)
        self.insert_sample(vanished, start, 50)
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_samples (listing_id, sampled_at, stock, marketplace) VALUES (%s, %s, 900, TRUE)", (resold, start))
        history = self.call("GET", f"/api/supply/parts/{part_id}").json["history"]
        self.assertEqual([(h["stock"], h["listings"]) for h in history], [(50, 2), (10, 1), (20, 1)],
                         "a gone listing counts until its last reading (pooled stock takes the larger); marketplace stock never does")

    def test_older_days_come_from_the_rollups(self) -> None:
        cid = self.fake_connector()
        part_id = self.watch_via_api("ROLL")["part_id"]
        listing = self.insert_listing(part_id, cid, "A", stock=0)
        old_day = (datetime.now(timezone.utc) - timedelta(days=80)).date()
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_samples_daily (listing_id, day, stock) VALUES (%s, %s, 30)",
                (listing, old_day))
        self.insert_sample(listing, datetime.now(timezone.utc) - timedelta(days=1), 7)
        history = self.call("GET", f"/api/supply/parts/{part_id}").json["history"]
        self.assertEqual((history[0]["day"], history[0]["stock"]), (old_day.isoformat(), 30))
        self.assertEqual(history[-1]["stock"], 7)

    def test_a_part_no_distributor_carries_is_an_error_not_unknown(self) -> None:
        cid = self.fake_connector()
        part_id = self.watch_via_api("NOBODY")["part_id"]
        self.assertEqual(self.part_row("NOBODY")["status"], "unknown", "not searched yet")
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_discovery_runs (part_id, connector_id, last_run_at, found) VALUES (%s, %s, %s, 0)", (part_id, cid, START))
        item = self.part_row("NOBODY")
        self.assertEqual((item["status"], item["problem"]), ("error", "not_found"))
        self.assertIn("No distributor", self.call("GET", f"/api/supply/parts/{part_id}").json["problem_text"])
        self.insert_listing(part_id, cid, "CANDIDATE", state="near")
        self.assertEqual(self.part_row("NOBODY")["status"], "unknown", "a candidate waiting in Review is not 'nobody carries it'")

    def test_a_part_whose_listings_all_disappeared_is_an_error(self) -> None:
        cid = self.fake_connector()
        part_id = self.watch_via_api("VANISH")["part_id"]
        self.insert_listing(part_id, cid, "A", state="gone", stock=10)
        item = self.part_row("VANISH")
        self.assertEqual((item["status"], item["problem"], item["stock"]), ("error", "gone", None))
        self.insert_listing(part_id, cid, "B", stock=10)
        self.assertEqual(self.part_row("VANISH")["status"], "ok", "one live listing is enough")

    def test_parts_that_need_a_look_come_first(self) -> None:
        cid = self.fake_connector()
        for mpn, stock in (("AAA", 5000), ("BBB", 0), ("CCC", 5000)):
            self.insert_listing(self.watch_via_api(mpn)["part_id"], cid, mpn, stock=stock)
        self.assertEqual([i["mpn"] for i in self.call("GET", "/api/supply/parts").json["items"]], ["BBB", "AAA", "CCC"])

    def test_prices_are_compared_at_one_quantity(self) -> None:
        cid = self.fake_connector()
        part_id = self.watch_via_api("QTY")["part_id"]
        with self.store.connection() as conn:
            for sku, moq, breaks in (("TAPE", 1, [[1, "0.50"], [100, "0.30"]]), ("REEL", 3000, [[3000, "0.10"]])):
                listing = self.insert_listing(part_id, cid, sku, stock=10)
                conn.execute("UPDATE supply_offers SET moq = %s, price_breaks = %s::jsonb WHERE listing_id = %s", (moq, json.dumps(breaks), listing))
        item = self.part_row("QTY")
        self.assertEqual((item["unit_price"], item["price_quantity"]), ("0.3", 100), "the reel needs 3,000 pieces, so it is not the price at 100")
        with self.store.connection() as conn:
            conn.execute("DELETE FROM supply_listings WHERE sku = 'TAPE'")
        item = self.part_row("QTY")
        self.assertEqual((item["unit_price"], item["price_quantity"]), ("0.1", 3000), "alone, the reel is quoted at what must be ordered")

    # --- who may name a manufacturer --------------------------------------

    def test_a_part_can_be_tracked_by_its_number_alone(self) -> None:
        response = self.call("POST", "/api/supply/tracking/parts", role="designer", body={"mpn": "LM358-D"})
        self.assertEqual(response.status, 201, response.text)
        self.assertEqual(response.json["watch"]["manufacturer"], "Not known yet")

    def test_a_designer_can_name_a_manufacturer_prism_does_not_know_yet(self) -> None:
        body = {"manufacturer": "TI", "mpn": "TPS1"}
        self.assertEqual(self.call("POST", "/api/supply/tracking/parts", role="designer", body=body).status, 201)
        self.assertEqual(self.call("POST", "/api/supply/tracking/parts", role="designer", body={"manufacturer": "ti", "mpn": "TPS2"}).status, 201)
        names = [m["name"] for m in self.call("GET", "/api/supply/manufacturers", role="designer").json["items"]]
        self.assertEqual(names, ["TI"], "one manufacturer, however it is spelled")

    def test_naming_a_manufacturer_distributors_reported_settles_the_listings_waiting_on_it(self) -> None:
        cid = self.fake_connector()
        part_id = self.watch_via_api("LM1")["part_id"]
        waiting = self.insert_listing(part_id, cid, "W", state="manufacturer_unresolved")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_listings SET raw_manufacturer = 'Zeta Works' WHERE id = %s", (waiting,))
            conn.execute("INSERT INTO supply_manufacturer_aliases (alias_key, alias_text, status) VALUES ('zeta works', 'Zeta Works', 'pending')")
        self.assertEqual(self.call("POST", "/api/supply/tracking/parts", role="admin", body={"manufacturer": "Zeta Works", "mpn": "OTHER"}).status, 201)
        with self.store.connection() as conn:
            state = conn.execute("SELECT match_state FROM supply_listings WHERE id = %s", (waiting,)).fetchone()["match_state"]
        self.assertEqual(state, "near", "Zeta Works is a different manufacturer from the part's own (Acme)")

    def test_watching_a_watched_part_applies_what_was_asked(self) -> None:
        first = self.watch_via_api("RULES")
        second = self.watch_via_api("RULES", status=200, threshold=250, pinned=True)
        self.assertEqual(first["part_id"], second["part_id"])
        self.assertEqual((second["threshold"], second["pinned"]), (250, True))

    def test_watch_changes_are_audited_with_before_and_after(self) -> None:
        watch = self.watch_via_api("AUDIT", threshold=5)
        self.call("PUT", f"/api/supply/tracking/parts/{watch['part_id']}", body={"threshold": 9})
        with self.store.connection() as conn:
            detail = conn.execute(
                "SELECT e.detail FROM supply_audit_events e JOIN supply_watches w ON w.id = e.subject_id "
                "WHERE e.action = 'watch.update' AND w.part_id = %s", (watch["part_id"],)).fetchone()["detail"]
        self.assertEqual(detail, {"before": {"threshold": 5}, "after": {"threshold": 9}})

    def test_the_detail_carries_the_insight_with_its_inputs(self) -> None:
        cid = self.fake_connector()
        part_id = self.watch_via_api("TREND", threshold=100)["part_id"]
        listing = self.insert_listing(part_id, cid, "A", stock=300)
        today = datetime.now(timezone.utc)
        for index in range(12):
            self.insert_sample(listing, today - timedelta(days=12 - index), 900 - 50 * index)
        insight = self.call("GET", f"/api/supply/parts/{part_id}").json["insight"]
        self.assertEqual((insight["trend"], insight["decrease_per_day"], insight["restocks"]), ("falling", 50.0, 0))
        self.assertEqual(insight["confidence"], "medium")
        self.assertEqual(insight["inputs"]["points"], 12)
        self.assertIsNotNone(insight["days_to_zero"])
        self.assertIsNotNone(insight["days_to_threshold"])

    def test_the_insight_of_a_part_nobody_read_is_empty_not_missing(self) -> None:
        insight = self.call("GET", f"/api/supply/parts/{self.watch_via_api('NEW')['part_id']}").json["insight"]
        self.assertEqual((insight["confidence"], insight["decrease_per_day"], insight["days_to_zero"]), ("none", None, None))

    def test_unknown_parts(self) -> None:
        self.assertEqual(self.call("GET", "/api/supply/parts/missing").status, 404)


if __name__ == "__main__":
    unittest.main()


def test_each_lifecycle_is_a_filter():
    from app.services.supply import parts_view

    for state in ("active", "nrnd", "last_time_buy", "obsolete", "unknown"):
        keep = parts_view.FILTERS[f"lifecycle_{state}"]
        assert keep({"lifecycle": state})
        assert not keep({"lifecycle": "other"})
