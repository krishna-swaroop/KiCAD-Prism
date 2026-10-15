"""``ws_sim_setups``: stored setup documents with an integer revision."""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from typing import Any, Callable, ContextManager, Iterator, Optional

from psycopg.types.json import Jsonb

from app.core import errors, preconditions
from app.services.postgres_database import database

ETAG_KIND = "simsetup"


class SetupNotFound(errors.NotFound):
    code = "sim_setup_not_found"
    default_detail = "Setup not found"


class StaleSetup(errors.StaleVersion):
    code = "sim_setup_stale"

    def __init__(self, setup_id: str, revision: int) -> None:
        super().__init__(
            "The setup changed since you read it; reload it and apply your change again.",
            headers={"ETag": preconditions.etag(ETAG_KIND, setup_id, revision)},
        )


@contextmanager
def workspace_connection() -> Iterator[Any]:
    with database.connection() as conn:
        conn.execute("SET search_path TO workspace, public")
        yield conn


_COLUMNS = (
    "setup_id, project_id, kind, name, source_commit, project_path, document, revision, "
    "created_by, created_at, updated_at"
)


class SetupStore:
    def __init__(self, connect: Callable[[], ContextManager[Any]] = workspace_connection) -> None:
        self._connect = connect

    def list(self, project_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT {_COLUMNS} FROM ws_sim_setups WHERE project_id = %s ORDER BY updated_at DESC, setup_id",
                (project_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def read(self, project_id: str, setup_id: str) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                f"SELECT {_COLUMNS} FROM ws_sim_setups WHERE project_id = %s AND setup_id = %s",
                (project_id, setup_id),
            ).fetchone()
        if row is None:
            raise SetupNotFound()
        return dict(row)

    def create(
        self, *, project_id: str, kind: str, name: str, source_commit: Optional[str],
        project_path: str, document: dict[str, Any], created_by: str,
    ) -> dict[str, Any]:
        setup_id = f"sup_{uuid.uuid4().hex[:16]}"
        with self._connect() as conn:
            row = conn.execute(
                f"""
                INSERT INTO ws_sim_setups
                    (setup_id, project_id, kind, name, source_commit, project_path, document, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING {_COLUMNS}
                """,
                (setup_id, project_id, kind, name, source_commit, project_path, Jsonb(document), created_by),
            ).fetchone()
            conn.commit()
        return dict(row)

    def update(
        self, project_id: str, setup_id: str, *, expected_revision: Optional[int],
        change: Callable[[dict[str, Any]], dict[str, Any]],
    ) -> dict[str, Any]:
        """Lock the row, check the revision, store ``change(document)`` and bump the revision.

        A change that leaves the document as it was writes nothing: the revision
        names a distinct document, and runs and checks are kept per revision.
        """

        with self._connect() as conn:
            row = conn.execute(
                "SELECT revision, document FROM ws_sim_setups WHERE project_id = %s AND setup_id = %s FOR UPDATE",
                (project_id, setup_id),
            ).fetchone()
            if row is None:
                conn.rollback()
                raise SetupNotFound()
            if expected_revision is not None and expected_revision != int(row["revision"]):
                conn.rollback()
                raise StaleSetup(setup_id, int(row["revision"]))
            try:
                document = change(row["document"])
            except Exception:
                conn.rollback()
                raise
            if document == row["document"]:
                current = conn.execute(
                    f"SELECT {_COLUMNS} FROM ws_sim_setups WHERE project_id = %s AND setup_id = %s",
                    (project_id, setup_id),
                ).fetchone()
                conn.rollback()
                return dict(current)
            updated = conn.execute(
                f"""
                UPDATE ws_sim_setups
                   SET document = %s, name = %s, revision = revision + 1, updated_at = now()
                 WHERE project_id = %s AND setup_id = %s
                RETURNING {_COLUMNS}
                """,
                (Jsonb(document), document["name"], project_id, setup_id),
            ).fetchone()
            conn.commit()
        return dict(updated)

    def delete(self, project_id: str, setup_id: str, *, expected_revision: Optional[int]) -> None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT revision FROM ws_sim_setups WHERE project_id = %s AND setup_id = %s FOR UPDATE",
                (project_id, setup_id),
            ).fetchone()
            if row is None:
                conn.rollback()
                raise SetupNotFound()
            if expected_revision is not None and expected_revision != int(row["revision"]):
                conn.rollback()
                raise StaleSetup(setup_id, int(row["revision"]))
            conn.execute("DELETE FROM ws_sim_setups WHERE project_id = %s AND setup_id = %s", (project_id, setup_id))
            conn.commit()


class LayoutStore:
    """``ws_sim_setup_layouts``: canvas positions, last write wins, no revision."""

    def __init__(self, connect: Callable[[], ContextManager[Any]] = workspace_connection) -> None:
        self._connect = connect

    def read(self, setup_id: str) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT layout FROM ws_sim_setup_layouts WHERE setup_id = %s", (setup_id,),
            ).fetchone()
        return dict(row["layout"]) if row else {}

    def write(self, setup_id: str, layout: dict[str, Any]) -> dict[str, Any]:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO ws_sim_setup_layouts (setup_id, layout) VALUES (%s, %s)
                ON CONFLICT (setup_id) DO UPDATE SET layout = EXCLUDED.layout, updated_at = now()
                """,
                (setup_id, Jsonb(layout)),
            )
            conn.commit()
        return layout
