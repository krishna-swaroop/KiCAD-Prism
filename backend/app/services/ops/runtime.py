"""Pool, worker and queue state for the ops diagnostics (ADR §11, OPS-04c).

The API's own pool is process-local, so this answers for the process that
serves the call and says so. Everything else is shared PostgreSQL state: the
worker heartbeat rows OPS-03 publishes, the resource slots a claim holds, and
the queue grouped by pool, kind and status. Results carry identifiers, counts,
sizes and timings only, and pass through the one redactor on the way out (D22).
"""

from __future__ import annotations

import os
import socket
from typing import Any

from app.core.config import settings
from app.core.redaction import redact_value
from app.services.job_kinds import resource_capacities
from app.services.job_service import ACTIVE_STATUSES
from app.services.ops import workers
from app.services.ops.timefmt import iso_z as _iso
from app.services.postgres_database import database
from app.services.workspace_connection import connect


def _resource_usage(conn: Any) -> list[dict[str, Any]]:
    """Capacity versus live leases per resource slot.

    A slot counts as in use only while its lease is live; an expired row is a
    worker that died mid-job, and the claim path will reuse it.
    """

    rows = conn.execute(
        """
        SELECT resource_name,
               COUNT(*) FILTER (
                   WHERE job_id IS NOT NULL
                     AND lease_expires_at IS NOT NULL
                     AND lease_expires_at > NOW()
               ) AS in_use
        FROM ws_job_resource_slots
        GROUP BY resource_name
        """
    ).fetchall()
    used = {str(row["resource_name"]): int(row["in_use"] or 0) for row in rows}
    capacities = resource_capacities()
    names = sorted(set(capacities) | set(used))
    return [
        {
            "resource": name,
            "capacity": int(capacities.get(name, 0)),
            "in_use": int(used.get(name, 0)),
            "free": max(0, int(capacities.get(name, 0)) - int(used.get(name, 0))),
        }
        for name in names
    ]


def _queue(conn: Any) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Depth by pool/kind/status, and the oldest queued age per pool."""

    statuses = tuple(sorted(ACTIVE_STATUSES))
    depth = conn.execute(
        """
        SELECT worker_pool, kind, status, COUNT(*) AS count
        FROM ws_jobs
        WHERE status = ANY(%s)
        GROUP BY worker_pool, kind, status
        ORDER BY worker_pool, kind, status
        """,
        (list(statuses),),
    ).fetchall()
    oldest = conn.execute(
        """
        SELECT worker_pool,
               MIN(created_at) AS oldest_queued_at,
               EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) AS age_seconds
        FROM ws_jobs
        WHERE status = 'queued'
        GROUP BY worker_pool
        ORDER BY worker_pool
        """
    ).fetchall()
    return (
        [
            {
                "worker_pool": str(row["worker_pool"]),
                "kind": str(row["kind"]),
                "status": str(row["status"]),
                "count": int(row["count"]),
            }
            for row in depth
        ],
        [
            {
                "worker_pool": str(row["worker_pool"]),
                "oldest_queued_at": _iso(row["oldest_queued_at"]),
                "age_seconds": float(row["age_seconds"] or 0.0),
            }
            for row in oldest
        ],
    )


def pool_and_workers() -> dict[str, Any]:
    """This process's pool, the deployment's workers, slots and queue depth."""

    with connect() as conn:
        resources = _resource_usage(conn)
        queue, oldest_queued = _queue(conn)

    snapshot = {
        "process": {
            "host": socket.gethostname(),
            "pid": os.getpid(),
            "kind": "api",
        },
        "pool": database.metrics_snapshot(),
        "workers": workers.list_workers(),
        "resources": resources,
        "queue": queue,
        "oldest_queued": oldest_queued,
        "memory_budget_mib": int(settings.PRISM_WORKER_MEMORY_BUDGET_MIB),
    }
    return redact_value(snapshot)


__all__ = ["connect", "pool_and_workers"]
