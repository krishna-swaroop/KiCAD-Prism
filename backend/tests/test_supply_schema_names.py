"""Every object the supply steps create is named for supply.

Supply tables live in the catalog's schema, beside the catalog's own. A table,
view, function, trigger, index or constraint that is not named for supply is one
a catalog migration can collide with, and one a human cannot tell apart from a
catalog object when reading ``\\d``. The names PostgreSQL derives from an
already-prefixed table (``_pkey``, ``_key``, ``_fkey``, ``_check``) are the only
exception.

Needs ``PRISM_DATABASE_URL``.
"""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import psycopg  # noqa: E402
from psycopg.rows import dict_row  # noqa: E402
from support.postgres import CATALOG_URL, requires_scratch_postgres  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()

TABLE_PREFIXES = ("supply_",)
FUNCTION_PREFIXES = ("supply_",)
TRIGGER_PREFIXES = ("trg_supply_",)
INDEX_PREFIXES = ("idx_supply_", "uq_supply_")
CONSTRAINT_PREFIXES = ("supply_", "uq_supply_")


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class SchemaNameTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.services.supply.store import SupplyStore

        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_names_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()

    @classmethod
    def tearDownClass(cls) -> None:
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def rows(self, sql: str) -> list[dict]:
        with self.store.connection() as conn:
            return conn.execute(sql, (self.store.schema,)).fetchall()

    def assert_named(self, kind: str, names: list[str], prefixes: tuple[str, ...]) -> None:
        offenders = sorted(name for name in names if not name.startswith(prefixes))
        self.assertEqual(offenders, [], f"{kind} not named for supply (expected one of {prefixes}): " + ", ".join(offenders))

    def test_tables_and_views_are_named_for_the_schema(self) -> None:
        rows = self.rows(
            """
            SELECT c.relname AS name
            FROM pg_catalog.pg_class AS c
            JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
            WHERE n.nspname = %s AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
            """
        )
        self.assert_named("table/view", [row["name"] for row in rows], TABLE_PREFIXES)

    def test_functions_are_named_for_the_schema(self) -> None:
        rows = self.rows(
            """
            SELECT p.proname AS name
            FROM pg_catalog.pg_proc AS p
            JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
            WHERE n.nspname = %s
            """
        )
        self.assert_named("function", [row["name"] for row in rows], FUNCTION_PREFIXES)

    def test_triggers_are_named_for_the_schema(self) -> None:
        rows = self.rows(
            """
            SELECT t.tgname AS name
            FROM pg_catalog.pg_trigger AS t
            JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
            JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
            WHERE n.nspname = %s AND NOT t.tgisinternal
            """
        )
        self.assert_named("trigger", [row["name"] for row in rows], TRIGGER_PREFIXES)

    def test_indexes_are_named_for_the_schema(self) -> None:
        # A primary key or UNIQUE constraint PostgreSQL named itself carries the
        # table's name, so it is already prefixed; only hand-written indexes need
        # the idx_/uq_ prefix.
        rows = self.rows(
            """
            SELECT i.relname AS name, con.conname AS constraint_name
            FROM pg_catalog.pg_index AS x
            JOIN pg_catalog.pg_class AS i ON i.oid = x.indexrelid
            JOIN pg_catalog.pg_class AS t ON t.oid = x.indrelid
            JOIN pg_catalog.pg_namespace AS n ON n.oid = t.relnamespace
            LEFT JOIN pg_catalog.pg_constraint AS con ON con.conindid = x.indexrelid
            WHERE n.nspname = %s
            """
        )
        offenders = sorted(
            row["name"] for row in rows
            if not row["name"].startswith(INDEX_PREFIXES)
            and not (row["constraint_name"] or "").startswith(CONSTRAINT_PREFIXES)
        )
        self.assertEqual(offenders, [], "index not named for supply: " + ", ".join(offenders))

    def test_constraints_are_named_for_the_schema(self) -> None:
        rows = self.rows(
            """
            SELECT con.conname AS name
            FROM pg_catalog.pg_constraint AS con
            JOIN pg_catalog.pg_namespace AS n ON n.oid = con.connamespace
            WHERE n.nspname = %s
            """
        )
        self.assert_named("constraint", [row["name"] for row in rows], CONSTRAINT_PREFIXES)


@requires_scratch_postgres("the catalog ledger's supply step")
class CatalogLedgerCreatesSupplyTablesTests(unittest.TestCase):
    def test_initialising_the_catalog_creates_the_supply_tables_in_its_schema(self) -> None:
        import tempfile

        from app.services.component_catalog_service_postgres import ComponentCatalogPostgresService

        with tempfile.TemporaryDirectory() as root:
            ComponentCatalogPostgresService(store_root=Path(root) / "components", database_url=CATALOG_URL).initialize()
        with psycopg.connect(CATALOG_URL, row_factory=dict_row) as conn:
            relation = conn.execute("SELECT to_regclass('catalog.supply_parts') AS relation").fetchone()["relation"]
            step = conn.execute("SELECT version FROM catalog.catalog_schema_versions WHERE name = 'supply_tables'").fetchone()
        self.assertIsNotNone(relation, "catalog.supply_parts exists")
        self.assertIsNotNone(step, "the ledger recorded the supply step")
