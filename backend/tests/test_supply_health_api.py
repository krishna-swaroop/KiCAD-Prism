"""Supply health: per connector calls against budget, errors and late reads. Needs ``PRISM_DATABASE_URL``."""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from supply_api_helpers import request as _request  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
NOW = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply API tests")
class SupplyHealthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_connectors, supply_health
        from app.core.security import AuthenticatedUser
        from app.services.postgres_database import database
        from app.services.supply import parts
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.parts = database, parts
        cls.users = {
            role: AuthenticatedUser(email=f"{role}@example.com", name=role, role=role)
            for role in ("viewer", "qa", "designer", "admin")
        }
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_health_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        cls.app = FastAPI()
        from app.core.errors import install_error_handlers
        install_error_handlers(cls.app)
        cls.app.include_router(supply_health.router)
        cls.patcher = mock.patch.object(supply_connectors, "service", cls.connectors)
        cls.patcher.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.patcher.stop()
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        with self.store.connection() as conn:
            for table in ("supply_poll_state", "supply_offers", "supply_listings", "supply_parts", "supply_manufacturers", "supply_connectors"):
                conn.execute(f"DELETE FROM {table}")
            conn.execute("INSERT INTO supply_manufacturers (id, name, name_key) VALUES ('m1', 'Acme', 'acme')")
            conn.execute("INSERT INTO supply_connectors (id, provider, display_name, last_error_code) VALUES ('c1', 'tme', 'TME', 'rate_limited')")
            conn.execute("UPDATE supply_accounts SET daily_budget = 1000 WHERE id = 'c1'")
            part = self.parts.ensure_part(conn, "Acme", "ABC-1", "seed@example.com").id
            for index, (due, errors) in enumerate(((NOW - timedelta(hours=5), 2), (NOW + timedelta(hours=3), 0))):
                conn.execute(
                    "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) "
                    "VALUES (%s, 'c1', %s, %s, 'x', 'Acme', 'exact')", (f"l{index}", f"S{index}", part))
                conn.execute(
                    "INSERT INTO supply_poll_state (listing_id, tier, next_poll_at, last_polled_at, error_streak) VALUES (%s, 'daily', %s, %s, %s)",
                    (f"l{index}", due, NOW - timedelta(hours=30 - index), errors))

    def test_an_administrator_sees_what_polling_has_done_and_how_late_it_runs(self) -> None:
        from app.services.supply import connector_health

        with self.store.connection() as conn:
            (row,) = connector_health.connector_health(conn, NOW)
        self.assertEqual((row["name"], row["calls_today"], row["budget"], row["last_error_code"]), ("TME", 0, 1000, "rate_limited"))
        self.assertEqual((row["listings"], row["late"], row["failing"], row["late_by_hours"]), (2, 1, 1, 5.0))
        self.assertTrue(row["oldest_read"].startswith("2026-02-28T06:00"))

    def test_a_failed_catalogue_import_is_reported(self) -> None:
        from app.services.supply import connector_health

        with self.store.connection() as conn:
            conn.execute(
                "UPDATE supply_connectors SET catalogue = TRUE, catalogue_failed_at = %s, "
                "catalogue_error = 'The catalogue could not be read.' WHERE id = 'c1'",
                (NOW,),
            )
            (row,) = connector_health.connector_health(conn, NOW)
        self.assertEqual(
            (row["catalogue_failed_at"], row["catalogue_error"]),
            (NOW.isoformat(), "The catalogue could not be read."),
        )

    def test_calls_today_are_the_provider_s_day_not_utc_s(self) -> None:
        from app.services.supply import connector_health, quota

        with self.store.connection() as conn:
            # Resets at midnight in UTC+14: at noon UTC it is already the next day there.
            conn.execute("UPDATE supply_accounts SET reset_time = '00:00', reset_tz = 'Pacific/Kiritimati' WHERE id = 'c1'")
            day = quota.provider_day(NOW, "00:00", "Pacific/Kiritimati")
            conn.execute("DELETE FROM supply_quota_ledger WHERE account_id = 'c1'")
            conn.execute("INSERT INTO supply_quota_ledger (account_id, day, spent) VALUES ('c1', %s, 42)", (day,))
            if day != NOW.date():
                conn.execute("INSERT INTO supply_quota_ledger (account_id, day, spent) VALUES ('c1', %s, 7)", (NOW.date(),))
            (row,) = connector_health.connector_health(conn, NOW)
            conn.execute("DELETE FROM supply_quota_ledger WHERE account_id = 'c1'")
            conn.execute("UPDATE supply_accounts SET reset_time = DEFAULT, reset_tz = DEFAULT WHERE id = 'c1'")
        self.assertNotEqual(day, NOW.date(), "the moment is chosen so the two days differ")
        self.assertEqual(row["calls_today"], 42)

    def test_a_task_whose_run_never_ended_is_flagged_stuck(self) -> None:
        from app.services.supply import tasks

        with self.store.connection() as conn:
            conn.execute("DELETE FROM supply_task_runs")
            conn.execute(
                "INSERT INTO supply_task_runs (name, started_at, last_ok_at) VALUES ('rates', %s, %s), ('market', %s, %s)",
                (NOW - timedelta(hours=2), NOW - timedelta(hours=3), NOW - timedelta(minutes=2), NOW - timedelta(hours=3)),
            )
            found = {row["name"]: row["stuck"] for row in tasks.state(conn, NOW)}
            conn.execute("DELETE FROM supply_task_runs")
        self.assertEqual((found["rates"], found["market"], found["costs"]), (True, False, False), "two hours without an end; two minutes is still running")

    def test_only_administrators_may_look(self) -> None:
        for role in ("viewer", "qa", "designer"):
            self.assertEqual(_request(self.app, "GET", "/api/supply/health", user=self.users[role]).status, 403, role)
        response = _request(self.app, "GET", "/api/supply/health", user=self.users["admin"])
        self.assertEqual((response.status, len(response.json["connectors"])), (200, 1))
        self.assertIn("inventory", [task["name"] for task in response.json["tasks"]])


if __name__ == "__main__":
    unittest.main()
