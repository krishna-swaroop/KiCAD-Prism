"""The migration that gives the catalogue import its own failure state (IS-09).

A catalogue failure recorded by an older build lived in ``last_error_code`` beside provider calls. The step moves it to
``catalogue_failed_at``/``catalogue_error`` and leaves ``last_error_code`` empty, so a poll cannot read it as its own.

Needs ``TEST_POSTGRES_URL``; each test works in a disposable schema.
"""

from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from support.postgres import requires_scratch_postgres, scratch_schema

START = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)


@requires_scratch_postgres("the catalogue failure migration tests")
class CatalogueFailureMigrationTests(unittest.TestCase):
    def setUp(self) -> None:
        from app.services.supply.schema import create_supply_tables

        self.scratch = scratch_schema(self, "supply_catalogue_migration", then=(create_supply_tables,))
        self.conn = self.scratch.conn

    def migrate(self) -> None:
        from app.services.catalog_schema_migrations import MIGRATIONS

        body = next(body for _, name, body in MIGRATIONS if name == "supply_catalogue_failure")
        body(self.conn)

    def insert(self, connector_id: str, code: str, at: datetime | None) -> None:
        self.conn.execute("INSERT INTO supply_accounts (id, provider) VALUES (%s, 'jlcpcb')", (f"acct-{connector_id}",))
        self.conn.execute(
            "INSERT INTO supply_connectors (id, provider, account_id, last_error_code, last_error_at) VALUES (%s, 'jlcpcb', %s, %s, %s)",
            (connector_id, f"acct-{connector_id}", code, at),
        )

    def row(self, connector_id: str) -> dict:
        return self.conn.execute(
            "SELECT catalogue_failed_at, catalogue_error, last_error_code, last_error_at "
            "FROM supply_connectors WHERE id = %s",
            (connector_id,),
        ).fetchone()

    def test_a_catalogue_failure_is_moved_to_its_own_columns(self) -> None:
        self.insert("c-old", "catalogue", START)

        self.migrate()

        moved = self.row("c-old")
        self.assertEqual(moved["catalogue_failed_at"], START)
        self.assertEqual(moved["catalogue_error"], "")
        self.assertEqual(moved["last_error_code"], "", "a poll must not read the catalogue's failure as its own")
        self.assertIsNone(moved["last_error_at"], "a migrated connector is not still flagged as a failing call")

    def test_a_provider_error_is_left_alone(self) -> None:
        self.insert("c-poll", "rate_limited", START)

        self.migrate()

        poll = self.row("c-poll")
        self.assertIsNone(poll["catalogue_failed_at"])
        self.assertEqual(poll["last_error_code"], "rate_limited")
        self.assertEqual(poll["last_error_at"], START, "a provider error keeps its time")

    def test_the_backfill_is_idempotent(self) -> None:
        self.insert("c-old", "catalogue", START)

        self.migrate()
        self.migrate()

        self.assertEqual(self.row("c-old")["catalogue_failed_at"], START)
        self.assertEqual(self.row("c-old")["last_error_code"], "")

    def test_an_older_catalogue_failure_with_no_time_stays_empty(self) -> None:
        self.insert("c-old", "catalogue", None)

        self.migrate()

        old = self.row("c-old")
        self.assertIsNone(old["catalogue_failed_at"])
        self.assertEqual(old["last_error_code"], "")


if __name__ == "__main__":
    unittest.main()
