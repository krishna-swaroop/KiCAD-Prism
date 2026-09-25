"""PostgreSQL connection ownership for the catalog compatibility service."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator

from app.core.config import settings
from app.services.postgres_database import database


def _postgres_dsn(value: str) -> str:
    """Accept both native and SQLAlchemy-style psycopg URLs."""
    return value.strip().replace("postgresql+psycopg://", "postgresql://", 1)


def _split_sql_script(script: str) -> list[str]:
    """Split the catalog's simple DDL script while respecting quoted strings."""
    statements: list[str] = []
    current: list[str] = []
    quote = ""
    index = 0
    while index < len(script):
        char = script[index]
        if quote:
            current.append(char)
            if char == quote:
                if index + 1 < len(script) and script[index + 1] == quote:
                    current.append(script[index + 1])
                    index += 1
                else:
                    quote = ""
        elif char in {"'", '"'}:
            quote = char
            current.append(char)
        elif char == ";":
            statement = "".join(current).strip()
            if statement:
                statements.append(statement)
            current = []
        else:
            current.append(char)
        index += 1
    statement = "".join(current).strip()
    if statement:
        statements.append(statement)
    return statements


class CatalogPostgresConnection:
    """Native psycopg connection with the domain's DDL-script API."""

    def __init__(self, connection: Any) -> None:
        self._connection = connection

    def execute(self, sql: str, params: Any = None) -> Any:
        return self._connection.execute(sql, params, prepare=False)

    def executescript(self, script: str) -> None:
        # Psycopg accepts parameter-free multi-statement DDL through the simple
        # protocol. The catalog script is idempotent, so send it in one round
        # trip rather than splitting it into dozens of remote calls.
        if script.strip():
            self._connection.execute(script, prepare=False)

    def commit(self) -> None:
        self._connection.commit()

    def rollback(self) -> None:
        self._connection.rollback()

    def iter_rows(self, sql: str, params: Any = None, *, batch_size: int = 500) -> Iterator[Any]:
        """Iterate a large read through a PostgreSQL server-side cursor."""
        with self._connection.cursor(name="prism_catalog_export") as cursor:
            cursor.itersize = batch_size
            cursor.execute(sql, params)
            while rows := cursor.fetchmany(batch_size):
                yield from rows


class PostgresCatalogRuntime:
    """Own URL selection and per-call PostgreSQL connection setup."""

    def __init__(self, database_url: str | None = None) -> None:
        self._postgres_url = _postgres_dsn(database_url or settings.PRISM_DATABASE_URL)

    @property
    def postgres_url(self) -> str:
        return self._postgres_url

    @postgres_url.setter
    def postgres_url(self, value: str) -> None:
        self._postgres_url = _postgres_dsn(value)

    @contextmanager
    def connect(self) -> Iterator[CatalogPostgresConnection]:
        if not self._postgres_url:
            raise ValueError("PRISM_DATABASE_URL is required for PostgreSQL catalog storage")
        configured_url = _postgres_dsn(settings.PRISM_DATABASE_URL)
        if configured_url and self._postgres_url == configured_url:
            connection_context = database.connection()
        else:
            import psycopg
            from psycopg.rows import dict_row

            connection_context = psycopg.connect(
                self._postgres_url,
                row_factory=dict_row,
                autocommit=False,
            )
        with connection_context as connection:
            connection.execute("SET search_path TO catalog, public")
            yield CatalogPostgresConnection(connection)


__all__ = [
    "CatalogPostgresConnection",
    "PostgresCatalogRuntime",
    "_postgres_dsn",
    "_split_sql_script",
]
