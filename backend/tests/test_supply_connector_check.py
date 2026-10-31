"""Testing a connector, and what the budget says it prices and has still to search.

Needs ``PRISM_DATABASE_URL``. Requests go through the real router into a disposable schema.
"""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from supply_api_helpers import request as _request  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
ACTOR = "ana@example.com"


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply API tests")
class ConnectorCheckTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_connectors
        from app.core.security import AuthenticatedUser
        from app.services.postgres_database import database
        from app.services.supply import watches
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.providers import base, registry
        from app.services.supply.providers.fake import FakeProvider
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.watches, cls.registry, cls.base = database, watches, registry, base
        cls.users = {
            role: AuthenticatedUser(email=f"{role}@example.com", name=role, role=role)
            for role in ("viewer", "qa", "designer", "admin")
        }
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_check_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        cls.app = FastAPI()
        from app.core.errors import install_error_handlers
        install_error_handlers(cls.app)
        cls.app.include_router(supply_connectors.router)
        supply_connectors.register_validation_redaction(cls.app)
        cls.patcher = mock.patch.object(supply_connectors, "service", cls.connectors)
        cls.patcher.start()

        # A provider whose behaviour a test sets, so each failure code can be exercised.
        cls.behaviour = {"error": None, "calls": 0}

        class Scripted(FakeProvider):
            def lookup_mpn(self, mpn, manufacturer=None):
                cls.behaviour["calls"] += 1
                if cls.behaviour["error"] is not None:
                    raise cls.behaviour["error"]
                return []

        registry.register(base.ProviderSpec(
            key="demo_script", label="Scripted", capabilities=frozenset({"search", "offers"}), max_batch=2,
            stock_pooling="separate", credential_fields=(), factory=lambda config: Scripted(config),
            default_daily_budget=100, calls_per_offers_batch=2,
        ), replace=True)
        registry.register(base.ProviderSpec(
            key="demo_free", label="Free", capabilities=frozenset({"search", "offers"}), max_batch=10,
            stock_pooling="separate", credential_fields=(), factory=lambda config: FakeProvider(config),
            default_daily_budget=0, metered=False,
        ), replace=True)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.registry.unregister("demo_script")
        cls.registry.unregister("demo_free")
        cls.patcher.stop()
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        with self.store.connection() as conn:
            for table in ("supply_listings", "supply_watches", "supply_parts", "supply_manufacturer_aliases", "supply_manufacturers", "supply_connectors", "supply_audit_events"):
                conn.execute(f"DELETE FROM {table}")
        type(self).behaviour.update(error=None, calls=0)

    # --- helpers ----------------------------------------------------------

    def call(self, method: str, path: str, *, role: str = "admin", body=None):
        return _request(self.app, method, path, user=self.users[role], body=body)

    def connector(self, provider: str = "demo_script", **overrides) -> str:
        values = dict(actor=ACTOR, provider=provider, currency="EUR", interactive_reserve_pct=50, daily_budget=100)
        if provider in ("csv", "demo_free"):
            values.pop("daily_budget")
        values.update(overrides)
        return self.connectors.create(**values)["id"]

    def rows(self, sql: str, *params):
        with self.store.connection() as conn:
            return conn.execute(sql, params).fetchall()

    # --- the test ---------------------------------------------------------

    def test_a_working_connector_answers_ok_and_spends_one_interactive_call(self) -> None:
        cid = self.connector()
        result = self.call("POST", f"/api/supply/connectors/{cid}/test")
        self.assertEqual(result.status, 200)
        self.assertEqual((result.json["ok"], result.json["code"]), (True, "ok"))
        self.assertIsInstance(result.json["took_ms"], int)
        self.assertEqual(type(self).behaviour["calls"], 1)
        (ledger,) = self.rows("SELECT spent, interactive_spent FROM supply_quota_ledger WHERE account_id = %s", cid)
        self.assertEqual((ledger["spent"], ledger["interactive_spent"]), (1, 1))
        (connector,) = self.rows("SELECT last_ok_at, last_error_code FROM supply_connectors WHERE id = %s", cid)
        self.assertIsNotNone(connector["last_ok_at"])
        (event,) = self.rows("SELECT actor, detail FROM supply_audit_events WHERE action = 'connector.test'")
        self.assertEqual((event["actor"], event["detail"]), ("admin@example.com", {"ok": True, "code": "ok"}))

    def test_each_failure_has_its_own_safe_message_and_never_the_providers_text(self) -> None:
        cid = self.connector(interactive_reserve_pct=50, daily_budget=100)
        cases = (
            (self.base.AuthError("key sk-live-SECRET rejected"), "auth_failed", "rejected the credentials"),
            (self.base.RateLimited("429 for https://api.example.com/x?apiKey=SECRET"), "rate_limited", "rate limiting"),
            (self.base.Unavailable("connect to 10.0.0.5 failed"), "unavailable", "could not reach"),
            (self.base.EgressBlocked("host is not on the allowlist"), "egress_denied", "not allowed to reach"),
            (self.base.ProviderError("weird body with SECRET"), "provider_error", "not in the way prism expects"),
        )
        for error, code, words in cases:
            type(self).behaviour["error"] = error
            result = self.call("POST", f"/api/supply/connectors/{cid}/test").json
            self.assertEqual((result["ok"], result["code"]), (False, code), code)
            self.assertIn(words, result["message"].lower(), code)
            self.assertNotIn("SECRET", result["message"])
            self.assertNotIn("10.0.0.5", result["message"])
        (connector,) = self.rows("SELECT last_error_code, paused_reason FROM supply_connectors WHERE id = %s", cid)
        self.assertEqual(connector["last_error_code"], "provider_error", "the last failure is recorded")
        self.assertEqual(connector["paused_reason"], "", "a test never pauses a connector")

    def test_a_success_after_a_failure_clears_the_error(self) -> None:
        cid = self.connector()
        type(self).behaviour["error"] = self.base.Unavailable("down")
        self.call("POST", f"/api/supply/connectors/{cid}/test")
        type(self).behaviour["error"] = None
        self.assertTrue(self.call("POST", f"/api/supply/connectors/{cid}/test").json["ok"])
        self.assertEqual(self.rows("SELECT last_error_code FROM supply_connectors WHERE id = %s", cid)[0]["last_error_code"], "")

    def test_it_stops_when_the_interactive_reserve_is_used_up(self) -> None:
        cid = self.connector(daily_budget=2, interactive_reserve_pct=50)  # a reserve of one call
        self.assertTrue(self.call("POST", f"/api/supply/connectors/{cid}/test").json["ok"])
        second = self.call("POST", f"/api/supply/connectors/{cid}/test").json
        self.assertEqual((second["ok"], second["code"]), (False, "budget"))
        self.assertEqual(type(self).behaviour["calls"], 1, "no call was made")

    def test_a_paused_or_disabled_connector_is_not_called(self) -> None:
        cid = self.connector()
        self.connectors.pause(cid, actor=ACTOR, reason="maintenance")
        result = self.call("POST", f"/api/supply/connectors/{cid}/test").json
        self.assertEqual((result["ok"], result["code"]), (False, "inactive"))
        self.assertEqual((type(self).behaviour["calls"], self.rows("SELECT 1 FROM supply_quota_ledger")), (0, []))

    def test_a_free_connector_is_tested_without_spending(self) -> None:
        cid = self.connector("demo_free")
        self.assertTrue(self.call("POST", f"/api/supply/connectors/{cid}/test").json["ok"])
        self.assertEqual(self.rows("SELECT 1 FROM supply_quota_ledger"), [])

    def test_only_admins_test_and_a_missing_connector_is_a_404(self) -> None:
        cid = self.connector()
        for role in ("designer", "qa", "viewer"):
            self.assertEqual(self.call("POST", f"/api/supply/connectors/{cid}/test", role=role).status, 403, role)
        self.assertEqual(self.call("POST", "/api/supply/connectors/missing/test").status, 404)
        self.assertEqual(type(self).behaviour["calls"], 0)

    # --- coverage in the budget ---------------------------------------------

    def watch_with_listing(self, mpn: str, cid: str, tier: str | None) -> None:
        with self.store.connection() as conn:
            watch = self.watches.add_watch(conn, "Acme", mpn, ACTOR, tier=1)[0]
            listing_id = uuid.uuid4().hex
            conn.execute(
                "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) "
                "VALUES (%s, %s, %s, %s, 'x', 'Acme', 'exact')", (listing_id, cid, f"SKU-{mpn}", watch.part_id))
            if tier:
                conn.execute(
                    "INSERT INTO supply_poll_state (listing_id, tier, next_poll_at) VALUES (%s, %s, NOW())", (listing_id, tier))
            conn.execute(
                "INSERT INTO supply_discovery_runs (part_id, connector_id, last_run_at, found) VALUES (%s, %s, NOW(), 1)",
                (watch.part_id, cid))

    def budget(self) -> list[dict]:
        from app.services.supply import budget_view, clock

        with self.store.connection() as conn:
            return budget_view.view(conn, clock.now())

    def coverage(self, cid: str) -> dict:
        (row,) = [item for item in self.budget() if item["connector_id"] == cid]
        return row

    def test_the_budget_says_how_many_tracked_parts_a_connector_quotes(self) -> None:
        cid = self.connector()
        self.watch_with_listing("PRICED", cid, "daily")
        self.watch_with_listing("UNPRICED", cid, "daily")
        with self.store.connection() as conn:
            listing = conn.execute("SELECT id FROM supply_listings WHERE sku = 'SKU-PRICED'").fetchone()["id"]
            conn.execute(
                "INSERT INTO supply_offers (listing_id, fetched_at, stock, currency, price_breaks) VALUES (%s, NOW(), 5, 'EUR', '[[1, \"0.5\"]]'::jsonb)",
                (listing,),
            )
        self.assertEqual(self.coverage(cid)["quotes"], {"parts": 1, "of": 2})

    def test_the_budget_says_how_many_watched_parts_are_not_searched_yet(self) -> None:
        cid = self.connector()
        self.connector("csv")
        with self.store.connection() as conn:
            self.watches.add_watch(conn, "Acme", "UNSEARCHED", ACTOR)
        rows = self.budget()
        self.assertEqual([r["connector_id"] for r in rows], [cid], "a file connector has no budget")
        self.assertEqual(rows[0]["searches_pending"], 1)


if __name__ == "__main__":
    unittest.main()
