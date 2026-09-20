"""Discover due tracker work and enqueue bounded worker jobs (TR-14, C5/C7).

Workers call ``schedule_due_tracker_jobs`` on each loop so a lost API wakeup
cannot strand pending ops. Enqueue uses ``artifact_key`` so two workers
collapse to one job per destination. Tracker jobs run at a lower priority
and take a dedicated ``tracker_sync`` slot so they cannot starve import or
compare work. Paused connectors keep their ops; rate-limited rows wait on
``next_attempt_at``.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Callable, Iterator, Optional

from app.services.job_service import jobs as default_jobs
from app.services.trackers.op_store import LIVE_STATES

DISPATCH_KIND = "tracker_dispatch"
POLL_KIND = "tracker_poll"
SWEEP_KIND = "tracker_sweep"
TRACKER_RESOURCE = "tracker_sync"
TRACKER_PRIORITY = 200
TRACKER_RESOURCE_CAPACITY = 2
POLL_INTERVAL_SECONDS = 300
SWEEP_INTERVAL_SECONDS = 900
TRACKER_JOB_KINDS = (DISPATCH_KIND, POLL_KIND, SWEEP_KIND)

Connect = Callable[[], Any]


@contextmanager
def _default_connect() -> Iterator[Any]:
    from app.services.postgres_database import database

    with database.connection() as conn:
        conn.execute('SET search_path TO comments, workspace, public')
        yield conn


def artifact_key(kind: str, connector_id: str, remote_container_id: str) -> str:
    return f"{kind}:{connector_id}:{remote_container_id}"


def schedule_due_tracker_jobs(
    *,
    job_service: Any | None = None,
    connect: Connect | None = None,
    comments_schema: str = "comments",
    workspace_schema: str = "workspace",
) -> list[dict[str, Any]]:
    """Scan durable rows and enqueue at most one job per destination+kind."""

    service = job_service or default_jobs
    opener = connect or _default_connect
    scheduled: list[dict[str, Any]] = []
    with opener() as conn:
        destinations = _due_dispatch_destinations(conn, comments_schema, workspace_schema)
        hints = _due_hint_destinations(conn, comments_schema, workspace_schema)
        polls = _due_checkpoint_destinations(conn, comments_schema, "poll")
        sweeps = _due_checkpoint_destinations(conn, comments_schema, "sweep")
        conn.commit()
    seen: set[tuple[str, str, str]] = set()
    for connector_id, container_id, paused in destinations:
        if paused:
            continue
        scheduled.append(
            _enqueue(service, DISPATCH_KIND, connector_id, container_id, seen)
        )
    for connector_id, container_id in hints:
        scheduled.append(
            _enqueue(service, DISPATCH_KIND, connector_id, container_id, seen)
        )
    for connector_id, container_id in polls:
        scheduled.append(
            _enqueue(service, POLL_KIND, connector_id, container_id, seen)
        )
    for connector_id, container_id in sweeps:
        scheduled.append(
            _enqueue(service, SWEEP_KIND, connector_id, container_id, seen)
        )
    return [row for row in scheduled if row is not None]


def _enqueue(
    service: Any,
    kind: str,
    connector_id: str,
    container_id: str,
    seen: set[tuple[str, str, str]],
) -> Optional[dict[str, Any]]:
    key = (kind, connector_id, container_id)
    if key in seen:
        return None
    seen.add(key)
    return service.enqueue(
        kind,
        {
            "connectorId": connector_id,
            "remoteContainerId": container_id,
            "kind": kind,
        },
        worker_pool="prism",
        artifact_key=artifact_key(kind, connector_id, container_id),
        priority=TRACKER_PRIORITY,
        resources={TRACKER_RESOURCE: 1},
        requested_by="system:tracker-scheduler",
        max_attempts=8,
    )


def _qual(schema: str, table: str) -> str:
    if not schema.replace("_", "").isalnum():
        raise ValueError("invalid schema name")
    return f'"{schema}".{table}'


def _due_dispatch_destinations(conn: Any, comments_schema: str, workspace_schema: str) -> list[tuple[str, str, bool]]:
    rows = conn.execute(
        f"""
        SELECT DISTINCT t.connector_id, t.remote_container_id,
               COALESCE(c.paused, FALSE) AS paused
        FROM {_qual(comments_schema, 'sync_ops')} o
        JOIN {_qual(comments_schema, 'tracked_threads')} t ON t.id = o.tracked_thread_id
        LEFT JOIN {_qual(workspace_schema, 'tracker_connectors')} c ON c.id = t.connector_id
        WHERE o.state = ANY(%s)
          AND o.next_attempt_at <= NOW()
        """,
        (list(LIVE_STATES),),
    ).fetchall()
    return [
        (str(row["connector_id"]), str(row["remote_container_id"]), bool(row["paused"]))
        for row in rows
    ]


def _due_hint_destinations(conn: Any, comments_schema: str, workspace_schema: str) -> list[tuple[str, str]]:
    del workspace_schema
    rows = conn.execute(
        f"""
        SELECT DISTINCT h.connector_id, h.remote_container_id
        FROM {_qual(comments_schema, 'remote_hints')} h
        WHERE h.state = 'pending'
        """
    ).fetchall()
    return [(str(row["connector_id"]), str(row["remote_container_id"])) for row in rows]


def _due_checkpoint_destinations(conn: Any, comments_schema: str, kind: str) -> list[tuple[str, str]]:
    rows = conn.execute(
        f"""
        SELECT scope_key
        FROM {_qual(comments_schema, 'sync_checkpoints')}
        WHERE kind = %s
          AND (next_run_at IS NULL OR next_run_at <= NOW())
        """,
        (kind,),
    ).fetchall()
    out: list[tuple[str, str]] = []
    for row in rows:
        connector_id, _, container_id = str(row["scope_key"]).partition(":")
        if connector_id and container_id:
            out.append((connector_id, container_id))
    return out
