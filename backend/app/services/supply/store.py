"""Connections for supply data, which lives in the component catalog's schema."""

from __future__ import annotations

import threading
from contextlib import contextmanager
from typing import Iterator

from app.services.postgres_database import database
from app.services.supply.schema import create_supply_tables

CATALOG_SCHEMA = "catalog"


class SupplyStore:
    """Hands services a connection on the catalog schema, where every supply table (``supply_*``) lives.

    The catalog ledger creates the tables (step ``supply_tables``), so initialising the store initialises the catalog.
    Tests point a subclass at a disposable schema; there only the supply steps run, since supply tables do not refer
    to catalog tables yet.
    """

    schema = CATALOG_SCHEMA
    # Tests that need catalog tables beside supply ones point a subclass at the catalog test database.
    url: str | None = None

    def __init__(self) -> None:
        self._init_lock = threading.Lock()
        self._initialized = False

    def initialize(self) -> None:
        if self._initialized:
            return
        with self._init_lock:
            if self._initialized:
                return
            if self.schema == CATALOG_SCHEMA:
                from app.services.component_catalog_service import catalog_service

                catalog_service.initialize()
            else:
                with database.connection() as conn:
                    conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("prism-schema",))
                    conn.execute(f'CREATE SCHEMA IF NOT EXISTS "{self.schema}"')
                    conn.execute(f'SET search_path TO "{self.schema}", public')
                    create_supply_tables(conn)
                    conn.commit()
            self._initialized = True

    @contextmanager
    def connection(self) -> Iterator[object]:
        """A pooled connection with the search path on the catalog schema (or the test's schema)."""

        if self.url:
            import psycopg
            from psycopg.rows import dict_row

            with psycopg.connect(self.url, row_factory=dict_row) as conn:
                conn.execute(f'SET search_path TO "{self.schema}", public')
                yield conn
            return
        with database.connection() as conn:
            conn.execute(f'SET search_path TO "{self.schema}", public')
            yield conn


supply_store = SupplyStore()


def initialize_supply_store() -> None:
    supply_store.initialize()
