"""Discover due tracker work and enqueue bounded worker jobs (TR-14, C5/C7).

Workers call ``schedule_due_tracker_jobs`` on each loop so a lost API wakeup
cannot strand pending ops. Enqueue uses ``artifact_key`` so two workers
collapse to one job per destination. Tracker jobs run at a lower priority
and take a dedicated ``tracker_sync`` slot so they cannot starve import or
compare work. Paused connectors keep their ops; rate-limited rows wait on
``next_attempt_at``. Poll/sweep cadence follows CONTRACTS.md §6 (C7).
"""

from __future__ import annotations

import time
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Callable, Iterator, Optional

from app.services.job_service import jobs as default_jobs
from app.services.trackers.op_store import LIVE_STATES

DISPATCH_KIND = "tracker_dispatch"
POLL_KIND = "tracker_poll"
SWEEP_KIND = "tracker_sweep"
TRACKER_RESOURCE = "tracker_sync"
TRACKER_PRIORITY = 200
TRACKER_RESOURCE_CAPACITY = 2
OUTBOX_POLL_SECONDS = 30
SCHEDULER_SCAN_SECONDS = 30
POLL_WEBHOOK_WINDOW_SECONDS = 30 * 60
POLL_WHILE_WEBHOOK_FRESH_SECONDS = 15 * 60
POLL_QUIET_SECONDS = 3 * 60
SWEEP_ACTIVITY_WINDOW_SECONDS = 24 * 60 * 60
SWEEP_WHILE_ACTIVE_SECONDS = 60 * 60
SWEEP_QUIET_SECONDS = 6 * 60 * 60
# Back-compat aliases: default to the quiet C7 cadence, not the old 5/15 min values.
POLL_INTERVAL_SECONDS = POLL_QUIET_SECONDS
SWEEP_INTERVAL_SECONDS = SWEEP_QUIET_SECONDS
TRACKER_JOB_KINDS = (DISPATCH_KIND, POLL_KIND, SWEEP_KIND)

Connect = Callable[[], Any]

_hints_applier_mounted = False
_last_scheduler_scan_at: float | None = None


def mount_hints_applier(mounted: bool = True) -> None:
    """TR-18 mounts the inbound hint applier; until then skip hint-only dispatch."""

    global _hints_applier_mounted
    _hints_applier_mounted = mounted


def hints_applier_mounted() -> bool:
    return _hints_applier_mounted


def hint_dispatch_enabled() -> bool:
    """Hint-only destinations get dispatch jobs (TR-26). Kept as a hook for tests."""

    return True


def reset_scheduler_throttle() -> None:
    """Test helper: allow the next scheduler pass without waiting."""

    global _last_scheduler_scan_at
    _last_scheduler_scan_at = None


@contextmanager
def _default_connect() -> Iterator[Any]:
    from app.services.postgres_database import database

    with database.connection() as conn:
        conn.execute('SET search_path TO comments, workspace, public')
        yield conn


def artifact_key(kind: str, connector_id: str, remote_container_id: str) -> str:
    return f"{kind}:{connector_id}:{remote_container_id}"


def poll_interval_seconds(conn: Any, connector_id: str) -> int:
    """15 min while a webhook arrived in the last 30 min; else 3 min (C7)."""

    if not connector_id:
        return POLL_QUIET_SECONDS
    row = conn.execute(
        """
        SELECT MAX(received_at) AS last_webhook
        FROM remote_deliveries
        WHERE connector_id = %s
        """,
        (connector_id,),
    ).fetchone()
    last = row["last_webhook"] if row else None
    if last is None:
        return POLL_QUIET_SECONDS
    if getattr(last, "tzinfo", None) is None:
        last = last.replace(tzinfo=timezone.utc)
    age = datetime.now(timezone.utc) - last.astimezone(timezone.utc)
    if age.total_seconds() <= POLL_WEBHOOK_WINDOW_SECONDS:
        return POLL_WHILE_WEBHOOK_FRESH_SECONDS
    return POLL_QUIET_SECONDS


def sweep_interval_seconds(conn: Any, connector_id: str, container_id: str) -> int:
    """1 h while pending ops or 24 h activity; else 6 h (C7)."""

    if not connector_id or not container_id:
        return SWEEP_QUIET_SECONDS
    pending = conn.execute(
        """
        SELECT COUNT(*) AS n
        FROM sync_ops o
        JOIN tracked_threads t ON t.id = o.tracked_thread_id
        WHERE t.connector_id = %s
          AND t.remote_container_id = %s
          AND o.state = ANY(%s)
        """,
        (connector_id, container_id, list(LIVE_STATES)),
    ).fetchone()
    if pending and int(pending["n"] or 0) > 0:
        return SWEEP_WHILE_ACTIVE_SECONDS
    recent = conn.execute(
        """
        SELECT 1
        WHERE EXISTS (
            SELECT 1 FROM remote_hints
            WHERE connector_id = %s AND remote_container_id = %s
              AND received_at >= NOW() - (%s * INTERVAL '1 second')
        )
        OR EXISTS (
            SELECT 1 FROM tracked_threads
            WHERE connector_id = %s AND remote_container_id = %s
              AND last_verified_at >= NOW() - (%s * INTERVAL '1 second')
        )
        """,
        (
            connector_id,
            container_id,
            SWEEP_ACTIVITY_WINDOW_SECONDS,
            connector_id,
            container_id,
            SWEEP_ACTIVITY_WINDOW_SECONDS,
        ),
    ).fetchone()
    if recent:
        return SWEEP_WHILE_ACTIVE_SECONDS
    return SWEEP_QUIET_SECONDS


def schedule_due_tracker_jobs(
    *,
    job_service: Any | None = None,
    connect: Connect | None = None,
    comments_schema: str = "comments",
    workspace_schema: str = "workspace",
    force: bool = False,
) -> list[dict[str, Any]]:
    """Scan durable rows and enqueue at most one job per destination+kind."""

    global _last_scheduler_scan_at
    if not force:
        now = time.monotonic()
        if (
            _last_scheduler_scan_at is not None
            and (now - _last_scheduler_scan_at) < SCHEDULER_SCAN_SECONDS
        ):
            return []
        _last_scheduler_scan_at = now

    service = job_service or default_jobs
    opener = connect or _default_connect
    scheduled: list[dict[str, Any]] = []
    with opener() as conn:
        destinations = _due_dispatch_destinations(conn, comments_schema, workspace_schema)
        hints = (
            _due_hint_destinations(conn, comments_schema, workspace_schema)
            if hint_dispatch_enabled() and hints_applier_mounted()
            else []
        )
        polls = _due_checkpoint_destinations(conn, comments_schema, workspace_schema, "poll")
        sweeps = _due_checkpoint_destinations(conn, comments_schema, workspace_schema, "sweep")
        conn.commit()
    seen: set[tuple[str, str, str]] = set()
    enqueued = 0
    for connector_id, container_id, paused in destinations:
        if paused:
            continue
        row = _enqueue(service, DISPATCH_KIND, connector_id, container_id, seen)
        scheduled.append(row)
        if row and not row.get("deduplicated"):
            enqueued += 1
    for connector_id, container_id in hints:
        row = _enqueue(service, DISPATCH_KIND, connector_id, container_id, seen)
        scheduled.append(row)
        if row and not row.get("deduplicated"):
            enqueued += 1
    # Throttle: poll/sweep share the tracker_sync slot; skip extra kinds once
    # the dedicated capacity is already filled by this pass.
    remaining = max(0, TRACKER_RESOURCE_CAPACITY - enqueued)
    for connector_id, container_id in polls:
        if remaining <= 0:
            break
        row = _enqueue(service, POLL_KIND, connector_id, container_id, seen)
        scheduled.append(row)
        if row and not row.get("deduplicated"):
            remaining -= 1
    for connector_id, container_id in sweeps:
        if remaining <= 0:
            break
        row = _enqueue(service, SWEEP_KIND, connector_id, container_id, seen)
        scheduled.append(row)
        if row and not row.get("deduplicated"):
            remaining -= 1
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
    rows = conn.execute(
        f"""
        SELECT DISTINCT h.connector_id, h.remote_container_id
        FROM {_qual(comments_schema, 'remote_hints')} h
        LEFT JOIN {_qual(workspace_schema, 'tracker_connectors')} c ON c.id = h.connector_id
        WHERE h.state = 'pending'
          AND (h.claimed_by IS NULL OR h.lease_expires_at IS NULL OR h.lease_expires_at < NOW())
          AND COALESCE(c.paused, FALSE) = FALSE
        """
    ).fetchall()
    return [(str(row["connector_id"]), str(row["remote_container_id"])) for row in rows]


def _due_checkpoint_destinations(
    conn: Any, comments_schema: str, workspace_schema: str, kind: str
) -> list[tuple[str, str]]:
    _seed_destination_checkpoints(conn, comments_schema, workspace_schema, kind)
    rows = conn.execute(
        f"""
        SELECT cp.scope_key
        FROM {_qual(comments_schema, 'sync_checkpoints')} cp
        WHERE cp.kind = %s
          AND (cp.next_run_at IS NULL OR cp.next_run_at <= NOW())
        """,
        (kind,),
    ).fetchall()
    out: list[tuple[str, str]] = []
    paused = _paused_connectors(conn, workspace_schema)
    for row in rows:
        connector_id, _, container_id = str(row["scope_key"]).partition(":")
        if connector_id and container_id and connector_id not in paused:
            out.append((connector_id, container_id))
    return out


def _seed_destination_checkpoints(
    conn: Any, comments_schema: str, workspace_schema: str, kind: str
) -> None:
    rows = conn.execute(
        f"""
        SELECT p.connector_id, p.remote_container_id, COALESCE(c.paused, FALSE) AS paused
        FROM {_qual(workspace_schema, 'project_trackers')} p
        LEFT JOIN {_qual(workspace_schema, 'tracker_connectors')} c ON c.id = p.connector_id
        """
    ).fetchall()
    for row in rows:
        if row["paused"]:
            continue
        scope = f"{row['connector_id']}:{row['remote_container_id']}"
        conn.execute(
            f"""
            INSERT INTO {_qual(comments_schema, 'sync_checkpoints')} (kind, scope_key, next_run_at)
            VALUES (%s, %s, NOW())
            ON CONFLICT (kind, scope_key) DO NOTHING
            """,
            (kind, scope),
        )


def _paused_connectors(conn: Any, workspace_schema: str) -> set[str]:
    rows = conn.execute(
        f'SELECT id FROM {_qual(workspace_schema, "tracker_connectors")} WHERE paused = TRUE'
    ).fetchall()
    return {str(row["id"]) for row in rows}
