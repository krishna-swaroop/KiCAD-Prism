"""``ws_sim_runs``: submitted analyses and their results."""

from __future__ import annotations

import uuid
from typing import Any, Callable, ContextManager, Optional

from psycopg.types.json import Jsonb

from app.core import errors
from app.sim_studio.store import workspace_connection


class RunNotFound(errors.NotFound):
    code = "sim_run_not_found"
    default_detail = "Run not found"


_COLUMNS = (
    "run_id, project_id, setup_id, setup_revision, setup_sha256, setup_document, analysis_id, "
    "source_commit, project_path, job_id, status, message, bundle_sha256, result, created_by, "
    "created_at, updated_at"
)

TERMINAL = frozenset({"succeeded", "failed", "cancelled"})


class RunStore:
    def __init__(self, connect: Callable[[], ContextManager[Any]] = workspace_connection) -> None:
        self._connect = connect

    @staticmethod
    def new_id() -> str:
        return f"run_{uuid.uuid4().hex[:16]}"

    def create(self, row: dict[str, Any]) -> dict[str, Any]:
        values = dict(row, setup_document=Jsonb(row["setup_document"]))
        columns = ", ".join(values)
        placeholders = ", ".join(["%s"] * len(values))
        with self._connect() as conn:
            created = conn.execute(
                f"INSERT INTO ws_sim_runs ({columns}) VALUES ({placeholders}) RETURNING {_COLUMNS}",
                tuple(values.values()),
            ).fetchone()
            conn.commit()
        return dict(created)

    def read(self, run_id: str, project_id: Optional[str] = None) -> dict[str, Any]:
        query = f"SELECT {_COLUMNS} FROM ws_sim_runs WHERE run_id = %s"
        params: tuple[Any, ...] = (run_id,)
        if project_id is not None:
            query += " AND project_id = %s"
            params += (project_id,)
        with self._connect() as conn:
            row = conn.execute(query, params).fetchone()
        if row is None:
            raise RunNotFound()
        return dict(row)

    def list(self, project_id: str, limit: int = 50) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT {_COLUMNS} FROM ws_sim_runs WHERE project_id = %s ORDER BY created_at DESC LIMIT %s",
                (project_id, limit),
            ).fetchall()
        return [dict(row) for row in rows]

    def update(self, run_id: str, **fields: Any) -> None:
        if "result" in fields and fields["result"] is not None:
            fields["result"] = Jsonb(fields["result"])
        assignments = ", ".join(f"{name} = %s" for name in fields)
        with self._connect() as conn:
            conn.execute(
                f"UPDATE ws_sim_runs SET {assignments}, updated_at = now() WHERE run_id = %s",
                (*fields.values(), run_id),
            )
            conn.commit()

    def prune(self, *, keep_succeeded: int) -> list[str]:
        """Delete runs past retention; returns their ids.

        The newest ``keep_succeeded`` succeeded runs of each setup are kept
        indefinitely; older succeeded runs go. Failed and cancelled runs go,
        except a setup's newest run, whose message the Studio shows until a
        newer run replaces it. Runs still queued or running are never touched.
        """

        with self._connect() as conn:
            rows = conn.execute(
                """
                WITH ranked AS (
                    SELECT run_id, status,
                           ROW_NUMBER() OVER (PARTITION BY project_id, setup_id ORDER BY created_at DESC) AS newest,
                           ROW_NUMBER() OVER (
                               PARTITION BY project_id, setup_id, status = 'succeeded' ORDER BY created_at DESC
                           ) AS newest_of_kind
                    FROM ws_sim_runs
                )
                DELETE FROM ws_sim_runs run USING ranked
                WHERE run.run_id = ranked.run_id
                  AND (
                      (ranked.status = 'succeeded' AND ranked.newest_of_kind > %s)
                      OR (ranked.status IN ('failed', 'cancelled') AND ranked.newest > 1)
                  )
                RETURNING run.run_id
                """,
                (max(1, int(keep_succeeded)),),
            ).fetchall()
            conn.commit()
        return [str(row["run_id"]) for row in rows]

    def ids(self) -> set[str]:
        with self._connect() as conn:
            return {str(row["run_id"]) for row in conn.execute("SELECT run_id FROM ws_sim_runs").fetchall()}

    def bundles(self) -> dict[str, str]:
        """``run_id -> bundle_sha256`` for every run that recorded one."""

        with self._connect() as conn:
            rows = conn.execute(
                "SELECT run_id, bundle_sha256 FROM ws_sim_runs WHERE bundle_sha256 IS NOT NULL"
            ).fetchall()
        return {str(row["run_id"]): str(row["bundle_sha256"]) for row in rows}

    def unsettled_job_ids(self) -> list[str]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT job_id FROM ws_sim_runs WHERE status NOT IN ('succeeded', 'failed', 'cancelled')"
            ).fetchall()
        return [str(row["job_id"]) for row in rows]

    def settle_job(self, job_id: str, status: str, message: str) -> None:
        """End a run whose job ended without the handler recording it (crash, cancel)."""

        with self._connect() as conn:
            conn.execute(
                """
                UPDATE ws_sim_runs SET status = %s, message = %s, updated_at = now()
                 WHERE job_id = %s AND status NOT IN ('succeeded', 'failed', 'cancelled')
                """,
                (status, message, job_id),
            )
            conn.commit()


def public(row: dict[str, Any]) -> dict[str, Any]:
    """A run as ``prism.sim.run`` a0."""

    run = {
        "schema": "prism.sim.run",
        "version": "a0",
        "run_id": row["run_id"],
        "job_id": row["job_id"],
        "setup_id": row["setup_id"],
        "setup_revision": int(row["setup_revision"]),
        "setup_sha256": row["setup_sha256"],
        "analysis_id": row["analysis_id"],
        "status": row["status"],
        "created_at": row["created_at"].isoformat(),
    }
    if row.get("source_commit"):
        run["commit"] = row["source_commit"]
    if row.get("message") and row["status"] in {"failed", "cancelled"}:
        run["message"] = row["message"]
    return run
