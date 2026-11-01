"""The supply ledger steps are closed, a database they ran on early is refused, and the reset script makes it whole again."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply.schema import frozen  # noqa: E402
from support.postgres import CATALOG_URL, scratch_schema  # noqa: E402

_RESET = Path(__file__).resolve().parents[2] / "scripts" / "reset_supply_tables.py"


def _reset_script():
    spec = importlib.util.spec_from_file_location("reset_supply_tables", _RESET)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


@unittest.skipUnless(CATALOG_URL, "TEST_POSTGRES_URL is required")
class FrozenSupplySchemaTests(unittest.TestCase):
    def setUp(self) -> None:
        self.scratch = scratch_schema(self, "supply_frozen")
        self.conn = self.scratch.conn

    def recorded(self, *versions: int) -> None:
        self.conn.execute("CREATE TABLE catalog_schema_versions (version INTEGER PRIMARY KEY, name TEXT NOT NULL)")
        for version in versions:
            self.conn.execute("INSERT INTO catalog_schema_versions VALUES (%s, %s)", (version, f"step_{version}"))

    def test_steps_17_and_20_still_make_what_was_frozen(self) -> None:
        built = frozen.build(self.conn)
        for step in ("17", "20"):
            changed = sorted(set(built[step].items()) ^ set(frozen.frozen()[step].items()))
            self.assertEqual(
                changed, [],
                f"Step {step} is released and runs once: a database that ran it never sees this change. Put the change in a "
                "new catalog ledger step instead (see app/services/supply/schema/frozen.py).",
            )

    def test_a_database_without_the_supply_steps_starts(self) -> None:
        frozen.refuse_behind(self.conn)
        self.recorded(1, 2)
        frozen.refuse_behind(self.conn)

    def test_a_database_that_ran_the_steps_early_is_refused_by_name(self) -> None:
        frozen.build(self.conn)
        self.recorded(17, 20)
        frozen.refuse_behind(self.conn)

        self.conn.execute("ALTER TABLE supply_accounts DROP COLUMN daily_budget")
        self.conn.execute("DROP TABLE supply_release_snapshots CASCADE")
        with self.assertRaises(frozen.SupplySchemaBehind) as refused:
            frozen.refuse_behind(self.conn)
        self.assertIn("column supply_accounts.daily_budget", str(refused.exception))
        self.assertIn("reset_supply_tables.py", str(refused.exception))

    def test_only_recorded_steps_are_held_to_their_output(self) -> None:
        from app.services.supply.schema import create_supply_tables

        create_supply_tables(self.conn)
        self.recorded(17)
        frozen.refuse_behind(self.conn)

    def test_the_reset_drops_supply_and_forgets_its_steps(self) -> None:
        frozen.build(self.conn)
        self.recorded(16, 17, 18, 19, 20, 21)
        self.conn.execute("CREATE TABLE inventory_sources (id TEXT)")
        tables, functions = _reset_script().reset(self.conn, self.scratch.name)
        self.assertGreater(tables, 50)
        self.assertGreater(functions, 3)
        self.assertEqual(frozen.shape(self.conn), {})
        left = {row["version"] for row in self.conn.execute("SELECT version FROM catalog_schema_versions").fetchall()}
        self.assertEqual(left, {16, 19})
        kept = self.conn.execute("SELECT to_regclass('components') AS c, to_regclass('inventory_sources') AS i").fetchone()
        self.assertTrue(kept["c"] and kept["i"])


if __name__ == "__main__":
    unittest.main()
