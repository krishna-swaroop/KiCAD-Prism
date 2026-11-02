"""Supply has one clock (``app.services.supply.clock``): no SQL reads the database's, and no code reads the wall clock directly."""

from __future__ import annotations

import ast
import re
import unittest
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"
SUPPLY = APP / "services" / "supply"

# The schema's column defaults are a fallback for rows written outside supply's code (fixtures, hand-run SQL); supply's own
# writes set every time they store.
SKIPPED = {SUPPLY / "clock.py"}
SKIPPED_DIRS = {SUPPLY / "schema"}

DATABASE_CLOCK = re.compile(
    r"(?<![\w.])(?:now\(\s*\)|current_timestamp\b|current_date\b|current_time\b|localtimestamp\b|localtime\b"
    r"|clock_timestamp\s*\(|statement_timestamp\s*\(|transaction_timestamp\s*\()",
    re.IGNORECASE,
)
WALL_CLOCK = {("datetime", "now"), ("datetime", "utcnow"), ("datetime", "today"), ("date", "today")}


def _sources() -> list[Path]:
    files = [*SUPPLY.rglob("*.py"), *(APP / "api").glob("supply*.py")]
    return sorted(p for p in files if p not in SKIPPED and not any(d in p.parents for d in SKIPPED_DIRS))


def _strings(tree: ast.AST):
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            yield node.lineno, node.value


def _wall_clock_calls(tree: ast.AST):
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
            if (node.func.value.id, node.func.attr) in WALL_CLOCK:
                yield node.lineno, f"{node.func.value.id}.{node.func.attr}()"


class OneClockTests(unittest.TestCase):
    def test_supply_sql_never_reads_the_database_clock(self) -> None:
        found = []
        for path in _sources():
            for line, text in _strings(ast.parse(path.read_text(encoding="utf-8"))):
                for match in DATABASE_CLOCK.finditer(text):
                    found.append(f"{path.relative_to(APP)}:{line}: {match.group(0)}")
        self.assertEqual(found, [], "Pass the time from app.services.supply.clock (or the caller's now) as a parameter.")

    def test_supply_code_never_reads_the_wall_clock_directly(self) -> None:
        found = [
            f"{path.relative_to(APP)}:{line}: {call}"
            for path in _sources()
            for line, call in _wall_clock_calls(ast.parse(path.read_text(encoding="utf-8")))
        ]
        self.assertEqual(found, [], "Use app.services.supply.clock.now().")

    def test_the_guard_sees_what_it_bans(self) -> None:
        sample = ast.parse(
            'conn.execute("UPDATE t SET at = NOW() WHERE x < current_date")\n'
            'f"SELECT {a} FROM t WHERE at > now()"\n'
            "datetime.now(timezone.utc)\n"
            "clock.now()\n"
        )
        hits = [m.group(0).lower() for _, text in _strings(sample) for m in DATABASE_CLOCK.finditer(text)]
        self.assertEqual(hits, ["now()", "current_date", "now()"])
        self.assertEqual([call for _, call in _wall_clock_calls(sample)], ["datetime.now()"])


if __name__ == "__main__":
    unittest.main()
