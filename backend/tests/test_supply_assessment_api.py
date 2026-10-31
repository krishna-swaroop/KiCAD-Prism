"""Assessment and waivers through the API. Needs ``PRISM_DATABASE_URL``."""

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


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply API tests")
class AssessmentApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_assessment, supply_bom, supply_connectors, supply_parts, supply_tracking
        from app.core.security import AuthenticatedUser
        from app.services.postgres_database import database
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database = database
        cls.users = {
            role: AuthenticatedUser(email=f"{role}@example.com", name=role, role=role)
            for role in ("viewer", "qa", "designer", "admin")
        }
        # QA's role through an agent: it may propose, never approve.
        cls.users["qa_agent"] = AuthenticatedUser(email="qa@example.com", name="qa", role="qa", auth_type="mcp", scopes=["*"])
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_assess_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        cls.app = FastAPI()
        from app.core.errors import install_error_handlers
        install_error_handlers(cls.app)
        for module in (supply_parts, supply_tracking, supply_assessment, supply_bom):
            cls.app.include_router(module.router)
        supply_connectors.register_validation_redaction(cls.app)
        cls.patcher = mock.patch.object(supply_connectors, "service", cls.connectors)
        cls.patcher.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.patcher.stop()
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        with self.store.connection() as conn:
            for table in ("supply_attention_decisions", "supply_listings", "supply_watches", "supply_parts", "supply_manufacturer_aliases", "supply_manufacturers", "supply_connectors", "supply_audit_events"):
                conn.execute(f"DELETE FROM {table}")
        self.cid = self.connectors.create(actor="seed@example.com", provider="fake", currency="EUR", display_name="Sim", interactive_reserve_pct=0)["id"]
        self.part_id = self.call("POST", "/api/supply/tracking/parts", body={"manufacturer": "Acme", "mpn": "ABC123"}).json["watch"]["part_id"]

    def call(self, method: str, path: str, *, role: str = "admin", body=None, query: str = ""):
        return _request(self.app, method, path, user=self.users[role], body=body, query=query)

    def offer(self, *, stock=1000, lifecycle="active", sku="A") -> None:
        listing_id = uuid.uuid4().hex
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) VALUES (%s, %s, %s, %s, 'x', 'Acme', 'exact')",
                (listing_id, self.cid, sku, self.part_id))
            conn.execute(
                "INSERT INTO supply_offers (listing_id, fetched_at, stock, lifecycle) VALUES (%s, %s, %s, %s)",
                (listing_id, datetime.now(timezone.utc), stock, lifecycle))

    def assessment(self, quantity=None, role="qa") -> dict:
        query = f"quantity={quantity}" if quantity else ""
        response = self.call("GET", f"/api/supply/parts/{self.part_id}/assessment", role=role, query=query)
        self.assertEqual(response.status, 200, response.text)
        return response.json

    def audited(self) -> list[str]:
        with self.store.connection() as conn:
            return [r["action"] for r in conn.execute("SELECT action FROM supply_audit_events WHERE action LIKE 'waiver.%' ORDER BY id").fetchall()]

    def test_a_part_that_has_not_been_read_is_unknown(self) -> None:
        result = self.assessment()
        self.assertEqual((result["status"], result["findings"]), ("unknown", []))

    def test_findings_scores_and_health(self) -> None:
        self.offer(stock=1000, lifecycle="nrnd")
        result = self.assessment(quantity=5000)
        self.assertEqual({f["check"] for f in result["findings"]}, {"nrnd", "insufficient_stock"})
        self.assertEqual(result["status"], "error")
        self.assertEqual({s["name"] for s in result["sub_scores"]}, {"lifecycle", "sourcing", "inventory", "market", "compliance"})
        self.assertTrue(0 <= result["health"] < 8)

    def test_a_last_time_buy_is_fatal_once_a_distributors_or_a_notices_last_date_has_passed_and_nobody_has_stock(self) -> None:
        from datetime import date, timedelta

        self.offer(stock=1000, lifecycle="last_time_buy")
        self.assertEqual(self.assessment()["status"], "warning", "no date known")
        today = datetime.now(timezone.utc).date()
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_part_facts (part_id, provider, name, value, observed_at) VALUES (%s, 'mouser', 'last_buy_date', %s, now())",
                (self.part_id, (today + timedelta(days=90)).isoformat()),
            )
        self.assertEqual(self.assessment()["status"], "error", "a date within 180 days")
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_pcns (id, title, kind, last_time_buy, state, created_by) VALUES ('n1', 'EOL', 'end_of_life', %s, 'open', 'a')", (today - timedelta(days=2),))
            conn.execute("INSERT INTO supply_pcn_parts (pcn_id, part_id) VALUES ('n1', %s)", (self.part_id,))
        found = self.assessment()
        self.assertEqual(found["status"], "error", "an open notice's date has passed, the earliest counts, and a distributor still has stock")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_offers SET stock = 0")
        found = self.assessment()
        self.assertEqual((found["status"], found["health"]), ("fatal", 0.0), "the date has passed and nobody has stock")

    def test_a_waiver_is_proposed_then_approved_and_then_the_finding_stops_counting(self) -> None:
        self.offer(lifecycle="nrnd")
        proposed = self.call("POST", f"/api/supply/parts/{self.part_id}/waivers", role="designer", body={"check": "nrnd", "reason": "We stock last-time buys"})
        self.assertEqual((proposed.status, proposed.json["state"]), (201, "proposed"))
        before = self.assessment()
        self.assertEqual(before["status"], "warning", "a proposed waiver does not hold")
        self.assertEqual(self.call("POST", f"/api/supply/waivers/{proposed.json['id']}/approve", role="qa").status, 204)
        after = self.assessment()
        self.assertEqual(after["status"], "ok")
        (finding,) = after["findings"]
        self.assertEqual((finding["waiver"]["holds"], finding["waiver"]["decided_by"]), (True, "qa@example.com"))
        self.assertGreater(after["health"], before["health"])
        self.assertEqual(self.audited(), ["waiver.propose", "waiver.approve"])

    def test_an_approver_who_proposes_approves_in_the_same_step(self) -> None:
        self.offer(lifecycle="nrnd")
        response = self.call("POST", f"/api/supply/parts/{self.part_id}/waivers", role="qa", body={"check": "nrnd", "reason": "Fine"})
        self.assertEqual(response.json["state"], "approved")

    def test_an_approver_through_an_agent_only_proposes(self) -> None:
        self.offer(lifecycle="nrnd")
        response = self.call("POST", f"/api/supply/parts/{self.part_id}/waivers", role="qa_agent", body={"check": "nrnd", "reason": "Fine"})
        self.assertEqual(response.json.get("state"), "proposed", response.json)
        self.assertEqual(self.call("POST", f"/api/supply/waivers/{response.json['id']}/approve", role="qa_agent").status, 403)

    def test_a_waiver_stops_holding_when_the_condition_changes(self) -> None:
        self.offer(lifecycle="nrnd")
        waiver = self.call("POST", f"/api/supply/parts/{self.part_id}/waivers", role="qa", body={"check": "nrnd", "reason": "Fine"}).json
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_attention_decisions SET scope = 'something_else' WHERE id = %s", (waiver["id"],))
        (finding,) = self.assessment()["findings"]
        self.assertEqual((finding["waiver"]["holds"], finding["waiver"]["outdated"]), (False, True))
        again = self.call("POST", f"/api/supply/parts/{self.part_id}/waivers", role="qa", body={"check": "nrnd", "reason": "Still fine"})
        self.assertEqual(again.status, 201, "an outdated approval is replaced")
        self.assertTrue(self.assessment()["findings"][0]["waiver"]["holds"])

    def test_what_cannot_be_waived(self) -> None:
        self.offer()
        no_finding = self.call("POST", f"/api/supply/parts/{self.part_id}/waivers", body={"check": "nrnd", "reason": "x"})
        self.assertEqual((no_finding.status, no_finding.json["detail"]), (400, "The part has no such finding to waive."))
        self.offer(lifecycle="nrnd", sku="B")
        self.assertEqual(self.call("POST", f"/api/supply/parts/{self.part_id}/waivers", body={"check": "nrnd", "reason": "  "}).status, 400)
        self.call("POST", f"/api/supply/parts/{self.part_id}/waivers", body={"check": "nrnd", "reason": "ok"})
        twice = self.call("POST", f"/api/supply/parts/{self.part_id}/waivers", body={"check": "nrnd", "reason": "ok"})
        self.assertEqual(twice.json["detail"], "This finding already has a waiver.")

    def test_rejecting_and_revoking(self) -> None:
        self.offer(lifecycle="nrnd")
        first = self.call("POST", f"/api/supply/parts/{self.part_id}/waivers", role="designer", body={"check": "nrnd", "reason": "ok"}).json["id"]
        self.assertEqual(self.call("POST", f"/api/supply/waivers/{first}/reject", role="qa").status, 204)
        self.assertEqual(self.assessment()["findings"][0]["waiver"], None, "a rejected waiver is gone from the finding")
        second = self.call("POST", f"/api/supply/parts/{self.part_id}/waivers", role="designer", body={"check": "nrnd", "reason": "again"}).json["id"]
        self.assertEqual(self.call("DELETE", f"/api/supply/waivers/{second}", role="designer").status, 204)
        third = self.call("POST", f"/api/supply/parts/{self.part_id}/waivers", role="qa", body={"check": "nrnd", "reason": "ok"}).json["id"]
        self.assertEqual(self.call("DELETE", f"/api/supply/waivers/{third}", role="designer").status, 400, "a designer cannot revoke an approval")
        self.assertEqual(self.call("DELETE", f"/api/supply/waivers/{third}", role="qa").status, 204)
        self.assertEqual(self.call("POST", "/api/supply/waivers/nope/approve", role="qa").status, 404)

    def test_who_may_do_what(self) -> None:
        self.offer(lifecycle="nrnd")
        body = {"check": "nrnd", "reason": "ok"}
        self.assertEqual(self.call("POST", f"/api/supply/parts/{self.part_id}/waivers", role="viewer", body=body).status, 403)
        waiver = self.call("POST", f"/api/supply/parts/{self.part_id}/waivers", role="designer", body=body).json["id"]
        self.assertEqual(self.call("POST", f"/api/supply/waivers/{waiver}/approve", role="designer").status, 403)
        self.assertEqual(self.call("GET", f"/api/supply/parts/{self.part_id}/assessment", role="viewer").status, 403)

    def test_the_bom_lookup_carries_each_line_s_health_and_the_bom_s(self) -> None:
        from app.services.supply import catalog_read

        self.offer(lifecycle="nrnd")
        with mock.patch.object(catalog_read, "in_library", lambda pairs: {("acme", "abc123")}):
            response = self.call("POST", "/api/supply/bom/lookup", body={"build_quantity": 10, "lines": [
                {"key": "L1", "manufacturer": "Acme", "mpn": "ABC123", "quantity": 2},
                {"key": "L2", "manufacturer": "Acme", "mpn": "UNKNOWN-9", "quantity": 1},
            ]})
        self.assertEqual(response.status, 200, response.text)
        line = response.json["lines"]["L1"]["assessment"]
        self.assertEqual((line["status"], line["open"]), ("warning", 1))
        self.assertNotIn("assessment", response.json["lines"]["L2"])
        self.assertEqual(response.json["rollup"]["health_status"], "warning")
        self.assertEqual(response.json["rollup"]["health"], line["health"])


if __name__ == "__main__":
    unittest.main()
