"""The tracking API: who may change what Prism follows, previews, refusals and part tiers.

Needs ``PRISM_DATABASE_URL``.
"""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from supply_api_helpers import request as _request  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
NOW = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)
BASE = "/api/supply/tracking"


def components(count: int) -> list[dict]:
    return [
        {"componentUid": f"c{n}", "reference": f"R{n}", "fields": {
            "Manufacturer": "Acme", "Manufacturer Part Number": f"R-{n:03d}", "DNP": "No", "In BOM": "Yes"}}
        for n in range(count)
    ]


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply tests")
class TrackingApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_checks, supply_connectors, supply_tracking
        from app.core.security import AuthenticatedUser
        from app.services.postgres_database import database
        from app.services.supply import tracking, usage
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.providers import registry
        from app.services.supply.providers.base import ProviderSpec
        from app.services.supply.providers.fake import FakeProvider
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.usage, cls.supply_tracking, cls.tracking = database, usage, supply_tracking, tracking
        cls.registry = registry
        cls.users = {role: AuthenticatedUser(email=f"{role}@example.com", name=role, role=role) for role in ("viewer", "qa", "designer", "admin")}
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_trk_api_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        registry.register(ProviderSpec(
            key="trk_demo", label="Demo", capabilities=frozenset({"search", "offers"}), max_batch=10, stock_pooling="separate",
            credential_fields=(), factory=lambda config: FakeProvider(config), default_daily_budget=100,
        ), replace=True)
        cls.app = FastAPI()
        from app.core.errors import install_error_handlers
        install_error_handlers(cls.app)
        cls.app.include_router(supply_tracking.router)
        cls.app.include_router(supply_tracking.budget_router)
        cls.app.include_router(supply_checks.router)
        supply_connectors.register_validation_redaction(cls.app)
        cls.patcher = mock.patch.object(supply_connectors, "service", cls.connectors)
        cls.patcher.start()
        # The workspace's folder rules decide which projects aggregate answers name; this test's one project is visible.
        cls.visible = mock.patch("app.services.supply.usage.visible_project_ids", return_value={"prj_1"})
        cls.visible.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.patcher.stop()
        cls.visible.stop()
        cls.registry.unregister("trk_demo")
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        with self.store.connection() as conn:
            for table in ("supply_bom_usage_projects", "supply_tracked_projects", "supply_listings", "supply_watches", "supply_parts", "supply_manufacturer_aliases",
                          "supply_manufacturers", "supply_connectors", "supply_audit_events"):
                conn.execute(f"DELETE FROM {table}")
        self.bom = components(3)

    def connector(self, budget: int = 4, reserve: int = 50) -> str:
        return self.connectors.create(actor="x@example.com", provider="trk_demo", daily_budget=budget, interactive_reserve_pct=reserve)["id"]

    def call(self, method, path, *, role="designer", body=None):
        def read(conn, project_id):
            lines = self.usage.lines_from_components(self.bom)
            self.usage.store_project(conn, project_id, project_id, f"r{len(self.bom)}", lines, NOW)
            return "updated"

        with mock.patch("app.api.supply_tracking.get_project_for_role_or_404", return_value=SimpleNamespace(id="prj_1")), \
                mock.patch.object(self.supply_tracking, "_read_project_bom", read):
            return _request(self.app, method, BASE + path, user=self.users[role], body=body)

    def part_id(self, mpn: str) -> str:
        with self.store.connection() as conn:
            return conn.execute("SELECT id FROM supply_parts WHERE mpn = %s", (mpn,)).fetchone()["id"]

    def counts(self) -> dict:
        with self.store.connection() as conn:
            return self.tracking.counts(conn)

    def test_readers_see_the_state_and_only_they(self) -> None:
        for role in ("qa", "designer", "admin"):
            self.assertEqual(self.call("GET", "/projects/prj_1", role=role).status, 200, role)
        self.assertEqual(self.call("GET", "/projects/prj_1", role="viewer").status, 403)
        self.assertEqual(self.call("PUT", "/projects/prj_1", role="viewer", body={"variants": [""]}).status, 403)

    def test_admin_designer_and_qa_may_track_a_project(self) -> None:
        self.connector()
        for role in ("qa", "designer", "admin"):
            result = self.call("PUT", "/projects/prj_1", role=role, body={"variants": [""]})
            self.assertEqual(result.status, 200, role)
            self.call("DELETE", "/projects/prj_1", role=role)

    def test_a_preview_reports_and_changes_nothing(self) -> None:
        cid = self.connector()
        report = self.call("POST", "/projects/prj_1/preview", body={"variants": [""]}).json
        (item,) = [c for c in report["connectors"] if c["connector_id"] == cid]
        self.assertEqual((item["admitted_new"], item["waiting_new"], report["fits_nowhere"]), (3, 0, False))
        state = self.call("GET", "/projects/prj_1").json
        self.assertIsNone(state["tracked"])
        self.assertEqual(self.counts(), {"tier1": 0, "tier2": 0})

    def test_tracking_records_the_project_and_the_overview_counts_it(self) -> None:
        self.connector()
        self.assertEqual(self.call("PUT", "/projects/prj_1", body={"variants": [""]}).status, 200)
        self.assertEqual(self.counts(), {"tier1": 3, "tier2": 0})
        with self.store.connection() as conn:
            self.assertEqual([p["project_id"] for p in self.tracking.list_tracked_projects(conn)], ["prj_1"])
        state = self.call("GET", "/projects/prj_1").json
        self.assertEqual((state["tracked"]["variants"], state["has_usage"]), ([""], True))
        self.assertEqual(self.call("DELETE", "/projects/prj_1").status, 204)
        self.assertEqual(self.counts(), {"tier1": 0, "tier2": 0})

    def test_nothing_that_fits_nowhere_is_refused_with_the_reason(self) -> None:
        self.connector(budget=1)
        result = self.call("PUT", "/projects/prj_1", body={"variants": [""]})
        self.assertEqual((result.status, result.json["code"]), (409, "no_room"))
        self.assertEqual(self.counts(), {"tier1": 0, "tier2": 0})
        self.assertTrue(self.call("POST", "/projects/prj_1/preview", body={"variants": [""]}).json["fits_nowhere"])

    def test_an_unknown_variant_is_a_bad_request(self) -> None:
        self.connector()
        result = self.call("PUT", "/projects/prj_1", body={"variants": ["nope"]})
        self.assertEqual((result.status, result.json["code"]), (400, "invalid_request"))

    def test_a_person_sets_a_parts_tier_and_clears_it(self) -> None:
        self.connector()
        self.call("PUT", "/projects/prj_1", body={"variants": [""]})
        part = self.part_id("R-001")
        self.assertEqual(self.call("PUT", f"/parts/{part}", body={"tier": 2, "rate": "monthly"}).json["tier"]["tier"], 1,
                         "still tier 1 through the project")
        self.call("DELETE", "/projects/prj_1")
        shown = self.call("PUT", f"/parts/{part}", body={"tier": 2, "rate": "monthly"}).json
        self.assertEqual((shown["tier"]["tier"], shown["tier"]["rate"]), (2, "monthly"))
        self.assertEqual(self.call("GET", f"/parts/{part}").json["tier"]["rate"], "monthly")
        self.assertEqual(self.call("DELETE", f"/parts/{part}").status, 204)
        self.assertIsNone(self.call("GET", f"/parts/{part}").json["tier"])

    def test_following_a_part_sets_its_rules_with_its_tier_for_anyone_who_reads(self) -> None:
        self.connector()
        self.call("PUT", "/projects/prj_1", body={"variants": [""]})
        part = self.part_id("R-001")
        self.call("DELETE", "/projects/prj_1")
        shown = self.call("PUT", f"/parts/{part}", role="qa", body={"threshold": 40, "packaging": "cut_tape"}).json
        self.assertEqual((shown["watch"]["threshold"], shown["watch"]["packaging"], shown["watch"]["tier"]), (40, "cut_tape", 2))
        kept = self.call("PUT", f"/parts/{part}", body={"tier": 1}).json["watch"]
        self.assertEqual((kept["threshold"], kept["tier"], kept["rate"]), (40, 1, "daily"), "only what was sent changes; tier 1 is daily")
        self.assertEqual(self.call("GET", f"/parts/{part}", role="qa").json["watch"]["threshold"], 40)
        self.assertEqual(self.call("PUT", f"/parts/{part}", role="viewer", body={"threshold": 1}).status, 403)
        self.assertEqual(self.call("PUT", f"/parts/{part}", body={"owner": "x"}).status, 422)

    def test_a_component_is_followed_under_tracking_by_anyone_who_reads(self) -> None:
        self.assertEqual(self.call("GET", "/components/c-none", role="qa").json, {"watch": None})
        refused = self.call("PUT", "/components/c-none", role="qa", body={"packaging": "any"})
        self.assertEqual(refused.status, 400, "a component without a manufacturer and number cannot be followed")
        self.assertEqual(self.call("PUT", "/components/c-none", role="viewer", body={}).status, 403)
        self.assertEqual(self.call("DELETE", "/components/c-none", role="qa").status, 204)

    def test_the_budget_view_shows_shares_spending_and_what_tracking_costs(self) -> None:
        cid = self.connector(budget=40, reserve=10)
        self.call("PUT", "/projects/prj_1", body={"variants": [""]})
        from app.services.supply import ledger

        spent = ledger.spend_call(self.store, self.connectors.get(cid), now=datetime.now(timezone.utc), interactive=True, kind="search", purpose="interactive")
        self.assertTrue(spent)
        response = _request(self.app, "GET", "/api/supply/budget", user=self.users["qa"])
        self.assertEqual(response.status, 200, response.text)
        (item,) = response.json["items"]
        self.assertEqual((item["daily_budget"], item["committed"]["capacity"], item["pool"]["capacity"]), (40, 36, 4))
        self.assertEqual((item["pool"]["spent"], item["spent"]), (1, 1))
        self.assertEqual(item["tracking"]["admitted"], 3)
        self.assertEqual([p["project_id"] for p in item["owners"]["projects"]], ["prj_1"])
        self.assertEqual(len(item["owners"]["parts"]), 3)
        self.assertEqual(item["hourly"][0]["purpose"], "interactive")
        self.assertEqual(_request(self.app, "GET", "/api/supply/budget", user=self.users["viewer"]).status, 403)

    def test_a_check_is_asked_for_by_those_who_may_track_and_its_progress_is_read_by_readers(self) -> None:
        self.connector()
        body = {"kind": "bom", "project_id": "prj_1", "lines": [{"manufacturer": "Acme", "mpn": "A-1"}, {"manufacturer": "Acme", "mpn": ""}]}
        made = _request(self.app, "POST", "/api/supply/checks", user=self.users["qa"], body=body)
        self.assertEqual((made.status, made.json["parts"], made.json["progress"]["total"]), (201, 1, 1))
        shown = _request(self.app, "GET", f"/api/supply/checks/{made.json['id']}", user=self.users["designer"])
        self.assertEqual((shown.status, shown.json["state"], shown.json["done"]), (200, "running", 0))
        self.assertEqual(_request(self.app, "POST", "/api/supply/checks", user=self.users["viewer"], body=body).status, 403)
        self.assertEqual(_request(self.app, "GET", "/api/supply/checks/nope", user=self.users["qa"]).status, 404)
        empty = _request(self.app, "POST", "/api/supply/checks", user=self.users["qa"], body={"kind": "bom", "lines": []})
        self.assertEqual((empty.status, empty.json["code"]), (400, "invalid_check"))
        self.assertEqual(_request(self.app, "POST", "/api/supply/checks", user=self.users["qa"], body={"kind": "other", "lines": []}).status, 422)

    def test_the_spare_switches_are_read_by_readers_and_changed_by_administrators_and_there_is_no_week(self) -> None:
        shown = _request(self.app, "GET", "/api/supply/schedule", user=self.users["qa"])
        self.assertEqual((shown.status, sorted(shown.json)), (200, ["spare"]))
        switches = {"spare": {**shown.json["spare"], "notices": False}}
        self.assertEqual(_request(self.app, "PUT", "/api/supply/schedule", user=self.users["designer"], body=switches).status, 403)
        saved = _request(self.app, "PUT", "/api/supply/schedule", user=self.users["admin"], body=switches)
        self.assertEqual((saved.status, saved.json["spare"]["notices"]), (200, False))
        self.assertFalse(_request(self.app, "GET", "/api/supply/schedule", user=self.users["qa"]).json["spare"]["notices"])
        for bad in ({"spare": {"nope": True}}, {**switches, "days": [1]}):
            answer = _request(self.app, "PUT", "/api/supply/schedule", user=self.users["admin"], body=bad)
            self.assertIn(answer.status, (400, 422), bad)

    def test_a_bad_tier_or_unknown_part_is_refused(self) -> None:
        self.connector()
        self.call("PUT", "/projects/prj_1", body={"variants": [""]})
        part = self.part_id("R-001")
        self.assertEqual(self.call("PUT", f"/parts/{part}", body={"tier": 3}).status, 400)
        self.assertEqual(self.call("PUT", f"/parts/{part}", body={"tier": 2, "rate": "daily"}).status, 400)
        self.assertEqual(self.call("PUT", "/parts/nope", body={"tier": 1}).status, 404)


if __name__ == "__main__":
    unittest.main()
