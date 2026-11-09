"""One workspace-schema Postgres connection shared by the stores."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from app.services.postgres_database import database


@contextmanager
def connect() -> Iterator[Any]:
    with database.connection() as conn:
        conn.execute("SET search_path TO workspace, public")
        yield conn
