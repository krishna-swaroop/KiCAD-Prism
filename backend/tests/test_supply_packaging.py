"""Packaging picks: one followed listing per part and distributor. Needs ``PRISM_DATABASE_URL``."""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from supply_api_helpers import request as _request  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
NOW = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)
ACTOR = "ana@example.com"
BREAKS = '[[1, "0.5"], [100, "0.4"]]'


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class PackagingPickTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_connectors, supply_packaging
        from app.core.security import AuthenticatedUser
        from app.services.postgres_database import database
        from app.services.supply import admission, packaging_picks, parts_view, stock, watches
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.providers import registry
        from app.services.supply.providers.base import ProviderSpec
        from app.services.supply.providers.fake import FakeProvider
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.admission, cls.picks, cls.parts_view, cls.stock, cls.watches = (
            database, admission, packaging_picks, parts_view, stock, watches,
        )
        cls.users = {role: AuthenticatedUser(email=f"{role}@example.com", name=role, role=role) for role in ("viewer", "qa", "designer", "admin")}
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_pick_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        # A provider that pays a call for each listing, so a packaging pick saves calls (LCSC and JLCPCB are CSV-fed now).
        cls.registry = registry
        registry.register(ProviderSpec(
            key="pick_demo", label="Pick demo", capabilities=frozenset({"search", "offers"}), max_batch=1,
            stock_pooling="separate", credential_fields=(), factory=lambda config: FakeProvider(config), default_daily_budget=1000,
        ), replace=True)
        cls.app = FastAPI()
        from app.core.errors import install_error_handlers
        install_error_handlers(cls.app)
        cls.app.include_router(supply_packaging.router)
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
        with self.store.connection() as conn:
            for table in ("supply_listings", "supply_watches", "supply_parts", "supply_manufacturers", "supply_connectors", "supply_audit_events"):
                conn.execute(f"DELETE FROM {table}")
        self.cid = self.connectors.create(actor=ACTOR, provider="pick_demo", daily_budget=1000)["id"]

    def part(self, mpn: str, packagings: tuple[str, ...], stock: int = 100) -> str:
        with self.store.connection() as conn:
            watch, _ = self.watches.add_watch(conn, "Acme", mpn, ACTOR, tier=1)
            for index, packaging in enumerate(packagings):
                lid = f"{mpn}-{index}"
                conn.execute(
                    "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state, packaging) "
                    "VALUES (%s, %s, %s, %s, 'x', 'Acme', 'exact', %s)", (lid, self.cid, f"SKU-{lid}", watch.part_id, packaging))
                conn.execute(
                    "INSERT INTO supply_offers (listing_id, fetched_at, stock, packaging, price_breaks, currency, moq) "
                    "VALUES (%s, %s, %s, %s, %s::jsonb, 'USD', 1)", (lid, NOW, stock, packaging, BREAKS))
            self.admission.sync(conn)
        return watch.part_id

    def waiting(self) -> list[dict]:
        """The parts waiting for a pick whose pick would save calls."""

        with self.store.connection() as conn:
            return [item for item in self.picks.waiting(conn) if item["saves_calls_a_day"] > 0]

    def call(self, method, path, *, role="designer", body=None):
        return _request(self.app, method, "/api/supply/packaging" + path, user=self.users[role], body=body)

    def picked(self, part_id: str):
        with self.store.connection() as conn:
            return self.picks.picked(conn, part_id, self.cid)

    def test_a_part_with_several_listings_waits_for_a_pick_and_says_what_it_would_save(self) -> None:
        a = self.part("A", ("cut_tape", "tape_reel"))
        self.part("ONE", ("cut_tape",))
        listed = self.waiting()
        self.assertEqual([item["part_id"] for item in listed], [a])
        self.assertAlmostEqual(listed[0]["saves_calls_a_day"], 1.0, places=2, msg="the provider reads each listing: one fewer call a day")

    def test_review_lists_every_part_with_several_listings_picked_or_not(self) -> None:
        waiting = self.part("A", ("cut_tape", "tape_reel"))
        picked = self.part("B", ("cut_tape", "tape_reel"))
        self.part("ONE", ("cut_tape",))
        with self.store.connection() as conn:
            self.picks.pick(conn, picked, self.cid, "B-0", ACTOR)
        items = self.call("GET", "/several").json["items"]
        by_part = {item["part_id"]: item for item in items}
        self.assertEqual(set(by_part), {waiting, picked})
        self.assertEqual((by_part[waiting]["picked_by"], by_part[picked]["picked_by"], by_part[picked]["picked_sku"]), ("", ACTOR, "SKU-B-0"))

    def test_one_per_distributor_shows_what_it_would_pick_then_picks_by_the_parts_packaging(self) -> None:
        a = self.part("A", ("tape_reel", "cut_tape"))
        proposed = self.call("GET", f"/auto/{a}").json
        self.assertEqual([(item["sku"], item["packaging"]) for item in proposed["items"]], [("SKU-A-1", "cut_tape")])
        self.assertIsNone(self.picked(a), "asking changes nothing")
        self.assertEqual(self.call("POST", f"/auto/{a}").json, {"picked": 1})
        self.assertEqual(self.picked(a), "A-1")
        self.assertEqual(self.call("POST", f"/auto/{a}").json, {"picked": 0}, "nothing waits any more")

    def test_a_person_prefers_one_distributor_and_it_is_the_part_sheets_to_show(self) -> None:
        from app.services.supply import preferences

        a = self.part("A", ("cut_tape",))
        with self.store.connection() as conn:
            self.assertIsNone(preferences.get(conn, a))
            preferences.set_preferred(conn, a, self.cid, ACTOR)
            self.assertEqual(self.parts_view.part_detail(conn, a)["preferred_connector_id"], self.cid)
            with self.assertRaises(preferences.PreferenceError):
                preferences.set_preferred(conn, a, "no-such-connector", ACTOR)
            self.assertTrue(preferences.clear(conn, a, ACTOR))
            self.assertIsNone(preferences.get(conn, a))

    def test_the_options_set_listings_side_by_side(self) -> None:
        a = self.part("A", ("cut_tape", "tape_reel"))
        options = self.call("GET", f"/{a}/{self.cid}").json
        self.assertEqual([item["packaging"] for item in options["listings"]], ["cut_tape", "tape_reel"])
        self.assertEqual(options["listings"][0]["prices"], {"1": "0.5", "100": "0.4", "1000": "0.4"})
        self.assertIsNone(options["picked"])

    def test_a_listing_under_another_number_is_marked_and_unpinning_is_for_those_who_decide(self) -> None:
        a = self.part("A", ("cut_tape", "tape_reel"))
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_listings SET raw_mpn = 'A' WHERE id = 'A-0'")
            conn.execute("UPDATE supply_listings SET raw_mpn = 'A-T' WHERE id = 'A-1'")
        options = self.call("GET", f"/{a}/{self.cid}").json
        self.assertEqual([item["other_number"] for item in options["listings"]], [False, True])
        self.assertFalse(options["can_unpin"])
        self.assertTrue(self.call("GET", f"/{a}/{self.cid}", role="qa").json["can_unpin"])

    def test_a_pick_follows_one_listing_counts_only_its_stock_and_cuts_the_cost(self) -> None:
        a = self.part("A", ("cut_tape", "tape_reel"), stock=100)
        with self.store.connection() as conn:
            before = self.admission.status(conn)[0]["committed"]
            self.assertEqual(self.parts_view.summaries_for(conn, [a])[0]["stock"], 200, "both listings of one distributor add up")
        answer = self.call("PUT", f"/{a}/{self.cid}", body={"listing_id": "A-1"}).json
        self.assertEqual((answer["picked"], answer["packaging"], answer["similar"]), ("A-1", "tape_reel", []))
        with self.store.connection() as conn:
            self.assertEqual(self.parts_view.summaries_for(conn, [a])[0]["stock"], 100)
            self.assertEqual(self.stock.part_stock(conn, a).total, 100)
            self.assertLessEqual(self.admission.status(conn)[0]["committed"], before)
        self.assertEqual(self.waiting(), [])
        self.assertEqual(self.call("GET", f"/{a}/{self.cid}").json["picked"], "A-1")
        self.assertEqual(self.call("DELETE", f"/{a}/{self.cid}").status, 204)
        self.assertEqual(len(self.waiting()), 1)

    def test_a_listing_found_after_the_pick_is_flagged_in_review(self) -> None:
        a = self.part("A", ("cut_tape", "tape_reel"))
        self.assertEqual(self.call("PUT", f"/{a}/{self.cid}", body={"listing_id": "A-0"}).status, 200)
        (before,) = [item for item in self.call("GET", "/several").json["items"] if item["part_id"] == a]
        self.assertEqual(before["new_since_pick"], 0)
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state, packaging) "
                "VALUES ('A-2', %s, 'SKU-A-2', %s, 'x', 'Acme', 'exact', 'custom_reel')", (self.cid, a))
        (after,) = [item for item in self.call("GET", "/several").json["items"] if item["part_id"] == a]
        self.assertEqual(after["new_since_pick"], 1)

    def test_similar_parts_have_the_same_packagings_and_one_listing_of_the_choice(self) -> None:
        a = self.part("A", ("cut_tape", "tape_reel"))
        b = self.part("B", ("cut_tape", "tape_reel"))
        self.part("C", ("tape_reel", "tray"))
        self.part("D", ("cut_tape", "tape_reel", "tape_reel"))
        answer = self.call("PUT", f"/{a}/{self.cid}", body={"listing_id": "A-1"}).json
        self.assertEqual([item["part_id"] for item in answer["similar"]], [b], "other sets, and a choice between two reels, are not similar")
        self.assertEqual(answer["similar"][0]["sku"], "SKU-B-1")
        self.assertIsNone(self.picked(b), "nothing applies until confirmed")
        done = self.call("POST", "/similar", body={"connector_id": self.cid, "packaging": "tape_reel", "part_ids": [b]}).json
        self.assertEqual(done, {"picked": 1})
        self.assertEqual(self.picked(b), "B-1")
        with self.store.connection() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_audit_events WHERE action = 'packaging.pick'").fetchone()["n"], 2)

    def test_a_pick_is_dropped_when_its_listing_stops_being_counted(self) -> None:
        a = self.part("A", ("cut_tape", "tape_reel"))
        self.call("PUT", f"/{a}/{self.cid}", body={"listing_id": "A-1"})
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_listings SET match_state = 'gone' WHERE id = 'A-1'")
            self.admission.sync(conn)
        self.assertIsNone(self.picked(a))

    def test_only_a_counted_listing_of_the_part_can_be_picked_and_only_trackers_pick(self) -> None:
        a = self.part("A", ("cut_tape", "tape_reel"))
        b = self.part("B", ("cut_tape", "tape_reel"))
        self.assertEqual(self.call("PUT", f"/{a}/{self.cid}", body={"listing_id": "B-0"}).status, 400)
        self.assertEqual(self.call("PUT", f"/{b}/{self.cid}", body={"listing_id": "B-0"}, role="viewer").status, 403)
        self.assertEqual(self.call("PUT", f"/{b}/{self.cid}", body={"listing_id": "B-0"}, role="qa").status, 200)
        self.assertEqual(self.call("GET", "/nope/" + self.cid).status, 404)


if __name__ == "__main__":
    unittest.main()
