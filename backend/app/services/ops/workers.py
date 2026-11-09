"""Worker heartbeats for the ops diagnostics (ADR scripting-and-mcp §11, OPS-03).

A worker's running jobs live in its own memory, so an admin looking at another
process would otherwise have nothing to read. Each worker therefore upserts one
``ws_ops_workers`` row every fifteen seconds from its supervision loop and
deletes it on clean shutdown. The row carries identifiers, timings and counts
only — never design content: ``{job_id, kind, started_at, pid}`` per job.

A worker that stops without a clean shutdown leaves its row behind; readers mark
it ``stale`` once it has not been seen for ``STALE_AFTER_SECONDS``. Rows unseen
for a day are pruned by the heartbeat itself, a bounded number at a time so the
sweep never grows with the number of dead workers.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Iterable

from psycopg.types.json import Jsonb

from app.services.ops.timefmt import iso_z as _iso
from app.services.workspace_connection import connect

logger = logging.getLogger(__name__)

#: How long a row may go unseen before readers call its worker stale.
STALE_AFTER_SECONDS = 120

#: Rows older than this are pruned by the next heartbeat.
_PRUNE_AFTER_SECONDS = 24 * 60 * 60

#: The most rows one heartbeat removes, so the sweep stays bounded.
_PRUNE_LIMIT = 100


def _running_jobs(running_jobs: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep only the four keys a heartbeat may publish."""

    jobs: list[dict[str, Any]] = []
    for item in running_jobs:
        if not isinstance(item, dict):
            continue
        job_id = str(item.get("job_id") or "").strip()
        if not job_id:
            continue
        pid = item.get("pid")
        jobs.append(
            {
                "job_id": job_id,
                "kind": str(item.get("kind") or ""),
                "started_at": _iso(item.get("started_at"))
                if isinstance(item.get("started_at"), datetime)
                else item.get("started_at"),
                "pid": int(pid) if pid is not None else None,
            }
        )
    return jobs


def heartbeat(
    worker_id: str,
    pool: str,
    host: str,
    pid: int,
    started_at: datetime | None,
    concurrency: int,
    memory_budget_mib: int,
    running_jobs: list[dict[str, Any]],
) -> None:
    """Upsert this worker's row and prune rows no heartbeat has touched for a day."""

    worker_id = str(worker_id or "").strip()
    if not worker_id:
        raise ValueError("worker_id is required")

    with connect() as conn:
        conn.execute(
            """
            INSERT INTO ws_ops_workers
                (worker_id, pool, host, pid, started_at, concurrency,
                 memory_budget_mib, running_jobs, last_seen_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (worker_id) DO UPDATE SET
                pool = EXCLUDED.pool,
                host = EXCLUDED.host,
                pid = EXCLUDED.pid,
                started_at = EXCLUDED.started_at,
                concurrency = EXCLUDED.concurrency,
                memory_budget_mib = EXCLUDED.memory_budget_mib,
                running_jobs = EXCLUDED.running_jobs,
                last_seen_at = NOW()
            """,
            (
                worker_id,
                pool,
                host,
                int(pid),
                started_at,
                int(concurrency),
                int(memory_budget_mib),
                Jsonb(_running_jobs(running_jobs)),
            ),
        )
        _prune(conn)


def _prune(conn: Any) -> int:
    """Delete at most ``_PRUNE_LIMIT`` rows not seen for a day; return how many went."""

    result = conn.execute(
        """
        DELETE FROM ws_ops_workers
        WHERE ctid IN (
            SELECT ctid FROM ws_ops_workers
            WHERE last_seen_at < NOW() - (%s * INTERVAL '1 second')
            ORDER BY last_seen_at ASC
            LIMIT %s
        )
        """,
        (_PRUNE_AFTER_SECONDS, _PRUNE_LIMIT),
    )
    return int(result.rowcount or 0)


def forget(worker_id: str) -> None:
    """Remove a worker's row; called on clean shutdown."""

    with connect() as conn:
        conn.execute(
            "DELETE FROM ws_ops_workers WHERE worker_id = %s",
            (str(worker_id or "").strip(),),
        )


def list_workers(stale_after_seconds: int = STALE_AFTER_SECONDS) -> list[dict[str, Any]]:
    """Every known worker, most recently seen first, each with a ``stale`` flag."""

    stale_after = max(0, int(stale_after_seconds))
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT worker_id, pool, host, pid, started_at, concurrency,
                   memory_budget_mib, running_jobs, last_seen_at,
                   (last_seen_at < NOW() - (%s * INTERVAL '1 second')) AS stale
            FROM ws_ops_workers
            ORDER BY last_seen_at DESC, worker_id ASC
            """,
            (stale_after,),
        ).fetchall()

    return [
        {
            "worker_id": row["worker_id"],
            "pool": row["pool"],
            "host": row["host"],
            "pid": int(row["pid"]) if row["pid"] is not None else None,
            "started_at": _iso(row["started_at"]),
            "concurrency": int(row["concurrency"]) if row["concurrency"] is not None else None,
            "memory_budget_mib": int(row["memory_budget_mib"])
            if row["memory_budget_mib"] is not None
            else None,
            "running_jobs": list(row["running_jobs"] or []),
            "last_seen_at": _iso(row["last_seen_at"]),
            "stale": bool(row["stale"]),
        }
        for row in rows
    ]


__all__ = [
    "STALE_AFTER_SECONDS",
    "connect",
    "forget",
    "heartbeat",
    "list_workers",
]
