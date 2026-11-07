#!/usr/bin/env python3
"""Drop the supply tables a pre-release build of Prism created, so the next start makes them again.

Prism refuses to start when the catalog ledger recorded the supply steps but the tables lack what those steps make now
(``app/services/supply/schema/frozen.py``). This drops every ``supply_`` table and function, and ``component_parts``
(approved alternates point at supply parts), then forgets ledger steps 17, 18, 20, 21 and 22 so they run again.
Components, revisions, assets and local inventory are kept. Supply history, tracking, settings, connector credentials and
alternates are lost.
"""

from __future__ import annotations

import argparse
import os

CONFIRMATION = "RESET-PRISM-SUPPLY-TABLES"
# supply_tables, component_parts, supply_catalog_links, component_parts_reviewed_against, supply_catalogue_failure:
# the steps whose tables this drops or changes.
STEPS = (17, 18, 20, 21, 22)


def _dsn() -> str:
    value = os.environ.get("PRISM_DATABASE_URL", "").strip()
    if not value:
        raise SystemExit("PRISM_DATABASE_URL is required")
    return value.replace("postgresql+psycopg://", "postgresql://", 1)


def reset(connection: object, schema: str = "catalog") -> tuple[int, int]:
    """Drop the tables and functions under the catalog's schema lock. Returns (tables, functions) dropped."""

    connection.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("prism-component-catalog-schema",))  # type: ignore[attr-defined]
    connection.execute(f'SET LOCAL search_path TO "{schema}", public')  # type: ignore[attr-defined]
    tables = [row["relname"] for row in connection.execute(  # type: ignore[attr-defined]
        """
        SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = %s AND c.relkind IN ('r', 'p') AND (c.relname LIKE 'supply\\_%%' OR c.relname = 'component_parts')
        """,
        (schema,),
    ).fetchall()]
    functions = [row["signature"] for row in connection.execute(  # type: ignore[attr-defined]
        """
        SELECT p.oid::regprocedure::text AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = %s AND p.proname LIKE 'supply\\_%%'
        """,
        (schema,),
    ).fetchall()]
    for table in tables:
        connection.execute(f'DROP TABLE IF EXISTS "{schema}"."{table}" CASCADE')  # type: ignore[attr-defined]
    # CASCADE also takes the triggers step 20 put on catalog tables.
    for signature in functions:
        connection.execute(f"DROP FUNCTION IF EXISTS {signature} CASCADE")  # type: ignore[attr-defined]
    connection.execute("DELETE FROM catalog_schema_versions WHERE version = ANY(%s)", (list(STEPS),))  # type: ignore[attr-defined]
    return len(tables), len(functions)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--confirm", required=True)
    args = parser.parse_args()
    if args.confirm != CONFIRMATION:
        raise SystemExit(f"Refusing reset: --confirm must be exactly {CONFIRMATION}")

    try:
        import psycopg
        from psycopg.rows import dict_row
    except ModuleNotFoundError as exc:
        raise SystemExit("psycopg is required; run this with the backend environment") from exc

    with psycopg.connect(_dsn(), row_factory=dict_row) as connection:
        tables, functions = reset(connection)
        connection.commit()
    print(f"Dropped {tables} tables and {functions} functions. Restart Prism to create them again.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
