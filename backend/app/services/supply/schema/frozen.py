"""What the catalog ledger's supply steps created, frozen, and the guard that refuses a database they ran on early.

Step 17 (``supply_tables``) runs ``create_supply_tables`` once and step 20 (``supply_catalog_links``) runs
``create_catalog_links`` once. A database that recorded either before the supply schema settled (a pre-release build of
this branch) never receives what was added to them later. ``frozen.json`` holds what each step makes on an empty schema:
the columns, constraints, indexes, functions and triggers. ``refuse_behind`` runs before the ledger on every start and
stops Prism when a recorded step's tables, columns, indexes, constraints, functions or triggers are missing, naming
``scripts/reset_supply_tables.py``.

Both steps are now closed: ``test_supply_frozen_schema`` fails when their output changes. A later supply schema change is
a new ledger step (and runs on test schemas through ``supply.store``), never an edit to the tables these two create.

Regenerate the file only with a step that is not yet released: ``python -m app.services.supply.schema.frozen --write``
with ``TEST_POSTGRES_URL`` set.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

FROZEN_PATH = Path(__file__).with_name("frozen.json")
TABLES_STEP, LINKS_STEP = 17, 20
RESET = "scripts/reset_supply_tables.py"

# Everything named supply_ in the current schema: tables and their parts, and the functions and the triggers that call them,
# wherever those triggers sit (step 20 puts some on catalog tables). Schema-qualified names are stripped so the shape does
# not depend on which schema it was read from.
_SHAPE = """
WITH s AS (SELECT current_schema() AS name),
rel AS (
    SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, s
    WHERE n.nspname = s.name AND c.relkind IN ('r', 'p') AND c.relname LIKE 'supply\\_%'
)
SELECT 'column ' || rel.relname || '.' || a.attname AS key,
       format_type(a.atttypid, a.atttypmod) || CASE WHEN a.attnotnull THEN ' not null' ELSE '' END
           || COALESCE(' default ' || pg_get_expr(d.adbin, d.adrelid), '') AS definition
FROM rel JOIN pg_attribute a ON a.attrelid = rel.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
UNION ALL
SELECT 'constraint ' || rel.relname || '.' || con.conname, pg_get_constraintdef(con.oid)
FROM rel JOIN pg_constraint con ON con.conrelid = rel.oid
UNION ALL
SELECT 'index ' || i.tablename || '.' || i.indexname, i.indexdef
FROM pg_indexes i, s WHERE i.schemaname = s.name AND i.tablename LIKE 'supply\\_%'
UNION ALL
SELECT 'function ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', md5(p.prosrc)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace, s WHERE n.nspname = s.name AND p.proname LIKE 'supply\\_%'
UNION ALL
SELECT 'trigger ' || c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid)
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid, s
WHERE n.nspname = s.name AND NOT t.tgisinternal AND p.proname LIKE 'supply\\_%'
"""


def shape(conn) -> dict[str, str]:
    """The supply schema on ``conn``'s current schema, entry name to definition."""

    schema = conn.execute("SELECT current_schema() AS name").fetchone()["name"]
    rows = conn.execute(_SHAPE).fetchall()
    return {row["key"]: row["definition"].replace(f'"{schema}".', "").replace(f"{schema}.", "") for row in rows}


def build(conn) -> dict[str, dict[str, str]]:
    """What steps 17 and 20 make on ``conn``'s current schema, which must be empty. Step 20 needs the catalog tables it ties
    to; bare stand-ins do, since only what supply adds is kept."""

    from app.services.supply.schema import create_catalog_links, create_supply_tables

    create_supply_tables(conn)
    tables = shape(conn)
    conn.execute("CREATE TABLE components (id TEXT PRIMARY KEY)")
    conn.execute("CREATE TABLE component_parts (component_id TEXT)")
    conn.execute("CREATE TABLE inventory_levels (component_id TEXT)")
    create_catalog_links(conn)
    links = {key: value for key, value in shape(conn).items() if tables.get(key) != value}
    return {str(TABLES_STEP): dict(sorted(tables.items())), str(LINKS_STEP): dict(sorted(links.items()))}


def frozen() -> dict[str, dict[str, str]]:
    return json.loads(FROZEN_PATH.read_text(encoding="utf-8"))


class SupplySchemaBehind(RuntimeError):
    """The supply tables were made by an earlier build of their steps and lack what came later."""


def missing(conn, recorded: set[int]) -> list[str]:
    """What the recorded supply steps should have made and the database lacks, by entry name."""

    have = shape(conn)
    wanted = frozen()
    return sorted(key for step in (TABLES_STEP, LINKS_STEP) if step in recorded for key in wanted[str(step)] if key not in have)


def refuse_behind(conn: Any) -> None:
    """Catalog ledger ``before`` hook: stop when a recorded supply step's output is incomplete. Reads only."""

    raw = getattr(conn, "_connection", conn)
    ledger = raw.execute("SELECT to_regclass('catalog_schema_versions') AS relation").fetchone()
    if not ledger or not ledger["relation"]:
        return
    recorded = {int(row["version"]) for row in raw.execute(
        "SELECT version FROM catalog_schema_versions WHERE version = ANY(%s)", ([TABLES_STEP, LINKS_STEP],),
    ).fetchall()}
    if not recorded:
        return
    lacking = missing(raw, recorded)
    if lacking:
        shown = ", ".join(lacking[:5]) + (f" and {len(lacking) - 5} more" if len(lacking) > 5 else "")
        raise SupplySchemaBehind(
            f"The supply tables were created by a pre-release build of Prism and lack {shown}. Back up Prism, run "
            f"`python {RESET} --confirm RESET-PRISM-SUPPLY-TABLES`, then restart. Supply history, tracking and alternates are lost; "
            "the catalog is kept."
        )


if __name__ == "__main__":
    import os
    import sys

    import psycopg
    from psycopg.rows import dict_row

    if sys.argv[1:] != ["--write"]:
        raise SystemExit("usage: python -m app.services.supply.schema.frozen --write")
    with psycopg.connect(os.environ["TEST_POSTGRES_URL"], row_factory=dict_row) as connection:
        connection.execute("CREATE SCHEMA supply_frozen_build")
        connection.execute("SET search_path TO supply_frozen_build, public")
        try:
            built = build(connection)
        finally:
            connection.rollback()
    FROZEN_PATH.write_text(json.dumps(built, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {FROZEN_PATH} ({sum(len(step) for step in built.values())} entries)")
