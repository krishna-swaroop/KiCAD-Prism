"""Fill from distributor: what it asks, what it spends, who may use it.

Needs ``PRISM_DATABASE_URL``. The simulated provider stands in for a distributor.
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


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply API tests")
class SupplyFillTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_connectors, supply_fill
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
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_fill_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        cls.app = FastAPI()
        from app.core.errors import install_error_handlers
        install_error_handlers(cls.app)
        cls.app.include_router(supply_fill.router)
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
            for table in ("supply_connectors", "supply_audit_events"):
                conn.execute(f"DELETE FROM {table}")
        self.cid = self.connectors.create(
            actor="seed@example.com", provider="fake", currency="EUR", display_name="Sim",
            daily_budget=20, interactive_reserve_pct=50,
        )["id"]

    def call(self, path: str, body: dict, role: str = "designer"):
        return _request(self.app, "POST", f"/api/supply/fill/{path}", user=self.users[role], body=body)

    def spent(self) -> int:
        with self.store.connection() as conn:
            row = conn.execute("SELECT COALESCE(SUM(interactive_spent), 0) AS n FROM supply_quota_ledger").fetchone()
        return int(row["n"])

    def test_search_returns_the_matching_candidates_and_spends_the_interactive_reserve(self) -> None:
        response = self.call("search", {"mpn": "LM358DR", "manufacturer": "Acme"})
        self.assertEqual(response.status, 200, response.text)
        (candidate,) = response.json["candidates"]
        self.assertEqual((candidate["connector"], candidate["mpn"], candidate["manufacturer"]), ("Sim", "LM358DR", "Acme"))
        self.assertTrue(candidate["manufacturer_matches"])
        self.assertEqual(self.spent(), 1)

    def test_a_part_the_distributor_does_not_know_says_so(self) -> None:
        response = self.call("search", {"mpn": "NONE-1"})
        self.assertEqual(response.json["candidates"], [])
        self.assertEqual(response.json["skipped"], [{"connector": "Sim", "reason": "no match"}])

    def test_details_give_the_description_and_datasheet(self) -> None:
        candidate = self.call("search", {"mpn": "LM358DR"}).json["candidates"][0]
        response = self.call("details", {k: candidate[k] for k in ("connector_id", "sku", "mpn", "manufacturer")})
        self.assertEqual(response.status, 200, response.text)
        self.assertEqual(response.json["description"], "Simulated part LM358DR")
        self.assertEqual(response.json["datasheet_url"], "https://example.invalid/datasheets/LM358DR.pdf")
        self.assertEqual(self.spent(), 2)

    def test_a_connector_that_is_paused_or_out_of_allowance_is_skipped_not_called(self) -> None:
        self.connectors.pause(self.cid, actor="admin@example.com", reason="test")
        response = self.call("search", {"mpn": "LM358DR"})
        self.assertEqual(response.json["skipped"], [{"connector": "Sim", "reason": "paused"}])
        self.assertEqual(self.spent(), 0)
        self.connectors.resume(self.cid, actor="admin@example.com")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_accounts SET daily_budget = 0")
        response = self.call("search", {"mpn": "LM358DR"})
        self.assertEqual(response.json["skipped"], [{"connector": "Sim", "reason": "daily lookup allowance used"}])

    def test_details_for_an_unknown_connector_is_not_found(self) -> None:
        response = self.call("details", {"connector_id": "nope", "sku": "S", "mpn": "M"})
        self.assertEqual(response.status, 404)

    def test_who_may_look_a_part_up(self) -> None:
        for role, status in (("admin", 200), ("designer", 200), ("qa", 403), ("viewer", 403)):
            self.assertEqual(self.call("search", {"mpn": "LM358DR"}, role).status, status, role)


if __name__ == "__main__":
    unittest.main()
