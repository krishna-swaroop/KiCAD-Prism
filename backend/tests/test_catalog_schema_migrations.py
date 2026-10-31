"""The catalog migration ladder, exercised without a PostgreSQL server.

These cover the ledger behaviour itself -- ordering, recording, adoption of the
markers an older Prism left behind, and the guarantee that a second run is a
no-op. The SQL the migrations emit is exercised against a real server by
test_component_catalog_postgres_integration.
"""

from __future__ import annotations

import sys
import unittest
from unittest import mock
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.catalog_schema_migrations import (  # noqa: E402
    MIGRATIONS,
    PORTABLE_TYPES_MARKER,
    PORTABLE_TYPES_VERSION,
    CATALOG_LEDGER,
)


class _Result:
    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows

    def fetchall(self) -> list[dict]:
        return list(self._rows)

    def fetchone(self) -> dict | None:
        return self._rows[0] if self._rows else None


class FakeConnection:
    """Just enough PostgreSQL to run the ladder and see what it did."""

    def __init__(self, *, ledger_exists: bool = True, catalog_meta: dict | None = None) -> None:
        self.ledger_exists = ledger_exists
        self.catalog_meta = dict(catalog_meta or {})
        self.ledger: dict[int, str] = {}
        self.statements: list[str] = []

    def execute(self, sql: str, params: tuple = (), **_options: object) -> _Result:
        statement = " ".join(sql.split())
        self.statements.append(statement)

        if statement.startswith("CREATE TABLE IF NOT EXISTS catalog_schema_versions"):
            self.ledger_exists = True
            return _Result([])
        if statement.startswith("SELECT to_regclass") and params == ("catalog_meta",):
            return _Result([{"relation": "catalog_meta" if self.catalog_meta else None}])
        if statement.startswith("SELECT to_regclass"):
            return _Result([{"relation": "catalog_schema_versions" if self.ledger_exists else None}])
        if statement.startswith("SELECT version FROM catalog_schema_versions"):
            return _Result([{"version": version} for version in sorted(self.ledger)])
        if statement.startswith("SELECT version, name FROM catalog_schema_versions"):
            return _Result([{"version": v, "name": n} for v, n in sorted(self.ledger.items())])
        if statement.startswith("UPDATE catalog_schema_versions SET version"):
            new_version, old_version, name = int(params[0]), int(params[1]), str(params[2])
            if self.ledger.get(old_version) == name:
                self.ledger[new_version] = self.ledger.pop(old_version)
            return _Result([])
        if statement.startswith("SELECT value FROM catalog_meta"):
            value = self.catalog_meta.get(params[0])
            return _Result([{"value": value}] if value is not None else [])
        if statement.startswith("INSERT INTO catalog_schema_versions"):
            version, name = int(params[0]), str(params[1])
            if version in self.ledger and "ON CONFLICT" not in statement:
                raise AssertionError(f"migration {version} recorded twice")
            self.ledger.setdefault(version, name)
            return _Result([])
        if statement.startswith("INSERT INTO catalog_meta"):
            self.catalog_meta[params[0]] = params[1]
            return _Result([])
        return _Result([])

    def executescript(self, sql: str) -> None:
        self.statements.append(" ".join(sql.split()))

    def rewrites_columns(self) -> list[str]:
        return [statement for statement in self.statements if "ALTER COLUMN" in statement]


class CatalogSchemaMigrationTests(unittest.TestCase):
    def setUp(self) -> None:
        # The fake runs the ladder, not real SQL: the supply step's tables are checked against PostgreSQL elsewhere.
        for target in ("app.services.supply.schema.create_supply_tables", "app.services.supply.schema.create_catalog_links"):
            patcher = mock.patch(target)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_fresh_database_applies_every_migration_in_order(self) -> None:
        conn = FakeConnection(ledger_exists=False)
        CATALOG_LEDGER.apply(conn)
        self.assertEqual(
            [(version, name) for version, name in sorted(conn.ledger.items())],
            [(version, name) for version, name, _ in MIGRATIONS],
        )

    def test_second_run_changes_nothing(self) -> None:
        conn = FakeConnection(ledger_exists=False)
        CATALOG_LEDGER.apply(conn)
        first_pass = list(conn.ledger.items())
        conn.statements.clear()

        CATALOG_LEDGER.apply(conn)

        self.assertEqual(list(conn.ledger.items()), first_pass)
        self.assertEqual(conn.rewrites_columns(), [])
        self.assertFalse([s for s in conn.statements if s.startswith("INSERT INTO catalog_schema_versions")])

    def test_existing_marker_is_adopted_rather_than_replayed(self) -> None:
        """An upgrade must not rewrite tables an older Prism already converted.

        Widening those columns rewrites every row, which on a real catalog is
        minutes of downtime for work that was done releases ago.
        """
        conn = FakeConnection(
            ledger_exists=False,
            catalog_meta={PORTABLE_TYPES_MARKER: PORTABLE_TYPES_VERSION},
        )

        CATALOG_LEDGER.apply(conn)

        self.assertIn(1, conn.ledger)
        self.assertEqual(conn.rewrites_columns(), [])

    def test_stale_marker_still_runs_the_migration(self) -> None:
        conn = FakeConnection(ledger_exists=False, catalog_meta={PORTABLE_TYPES_MARKER: "catalog-portable-types-v0"})

        CATALOG_LEDGER.apply(conn)

        self.assertIn(1, conn.ledger)
        self.assertTrue(conn.rewrites_columns())
        self.assertEqual(conn.catalog_meta[PORTABLE_TYPES_MARKER], PORTABLE_TYPES_VERSION)

    def test_adoption_only_considers_a_database_with_no_ledger(self) -> None:
        """Once the ledger exists it is the only authority on what has run."""
        conn = FakeConnection(catalog_meta={PORTABLE_TYPES_MARKER: PORTABLE_TYPES_VERSION})
        conn.ledger = {0: "baseline", 1: "portable_column_types", 2: "import_proposal_draft_column"}
        conn.statements.clear()

        CATALOG_LEDGER.apply(conn)

        self.assertNotIn(
            "SELECT value FROM catalog_meta WHERE key = %s",
            conn.statements,
        )

    def test_pending_reports_what_an_upgrade_would_do(self) -> None:
        conn = FakeConnection(ledger_exists=False)
        self.assertEqual(
            CATALOG_LEDGER.pending(conn),
            [(version, name) for version, name, _ in MIGRATIONS],
        )

        CATALOG_LEDGER.apply(conn)
        self.assertEqual(CATALOG_LEDGER.pending(conn), [])

    def test_pending_does_not_list_a_migration_that_will_only_be_adopted(self) -> None:
        """The pre-upgrade report has to match what the upgrade actually does."""
        conn = FakeConnection(
            ledger_exists=False,
            catalog_meta={PORTABLE_TYPES_MARKER: PORTABLE_TYPES_VERSION},
        )

        pending = CATALOG_LEDGER.pending(conn)

        self.assertNotIn(1, [version for version, _ in pending])
        self.assertEqual(conn.ledger, {}, "reporting must not modify the database")

    def test_versions_are_unique_and_ascending(self) -> None:
        """Gaps are allowed: a number another branch has taken stays reserved."""
        versions = [version for version, _, _ in MIGRATIONS]
        names = [name for _, name, _ in MIGRATIONS]
        self.assertEqual(versions, sorted(set(versions)))
        self.assertEqual(len(set(names)), len(names))

    def test_the_baseline_is_step_zero_and_runs_before_the_numbered_steps(self) -> None:
        """D8: the catalog baseline is ledger step 0, run once, ahead of step 1."""
        self.assertEqual(MIGRATIONS[0][:2], (0, "baseline"))
        conn = FakeConnection(ledger_exists=False)
        CATALOG_LEDGER.apply(conn)
        statements = conn.statements
        base = next(i for i, s in enumerate(statements) if "CREATE TABLE IF NOT EXISTS components" in s)
        widen = next(i for i, s in enumerate(statements) if "ALTER COLUMN" in s)
        self.assertLess(base, widen)
        self.assertFalse([s for s in statements if "catalog_schema_migrations" in s])
        conn.statements.clear()
        CATALOG_LEDGER.apply(conn)
        self.assertFalse([s for s in conn.statements if "CREATE TABLE IF NOT EXISTS components" in s])

    def test_renumbered_row_moves_instead_of_replaying(self) -> None:
        """A branch database recorded agent_tokens_registry as 3 before it moved to 6."""
        conn = FakeConnection()
        conn.ledger = {1: "portable_column_types", 2: "import_proposal_draft_column", 3: "agent_tokens_registry"}

        self.assertNotIn("agent_tokens_registry", [name for _, name in CATALOG_LEDGER.pending(conn)])
        self.assertEqual(conn.ledger[3], "agent_tokens_registry", "reporting must not modify the database")

        CATALOG_LEDGER.apply(conn)

        self.assertEqual(conn.ledger[6], "agent_tokens_registry")
        self.assertEqual(list(conn.ledger.values()).count("agent_tokens_registry"), 1)
        # 3 is free again for the migration that owns it.
        self.assertNotEqual(conn.ledger.get(3), "agent_tokens_registry")
        self.assertEqual(CATALOG_LEDGER.pending(conn), [])


if __name__ == "__main__":
    unittest.main()
