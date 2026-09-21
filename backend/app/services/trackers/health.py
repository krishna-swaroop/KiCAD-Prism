"""Sanitized connector and project tracker health (TR-35, C7).

Aggregates webhook delivery age, poll/sweep checkpoints, durable backlog and
rate-limit resume times without exposing secrets or raw provider bodies.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from typing import Any, Mapping, Optional

from app.services.trackers.errors import PROVIDER_ERROR_CLASSES

COMMENTS_SCHEMA = "comments"
WORKSPACE_SCHEMA = "workspace"


def _qual(schema: str, table: str) -> str:
    if not schema.replace("_", "").isalnum():
        raise ValueError("invalid schema name")
    return f'"{schema}".{table}'


def iso8601_duration(delta: timedelta) -> str:
    total = max(0, int(delta.total_seconds()))
    if total < 60:
        return f"PT{total}S"
    minutes, seconds = divmod(total, 60)
    if minutes < 60:
        return f"PT{minutes}M" if seconds == 0 else f"PT{minutes}M{seconds}S"
    hours, minutes = divmod(minutes, 60)
    if seconds == 0 and minutes == 0:
        return f"PT{hours}H"
    parts = f"{hours}H"
    if minutes:
        parts += f"{minutes}M"
    if seconds:
        parts += f"{seconds}S"
    return f"PT{parts}"


def _iso8601(dt: Any) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return str(dt)


def _wire_provider_error(raw: Any) -> dict | None:
    if raw is None:
        return None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return None
    if not isinstance(raw, Mapping):
        return None
    class_ = str(raw.get("class") or raw.get("class_") or "transient")
    if class_ not in PROVIDER_ERROR_CLASSES:
        class_ = "transient"
    return {
        "class": class_,
        "message": str(raw.get("message") or "sync degraded")[:300],
        "resumeAt": raw.get("resumeAt") or raw.get("resume_at"),
        "status": raw.get("status"),
        "retryable": bool(raw.get("retryable", class_ in {"rate_limited", "transient"})),
        "newRef": raw.get("newRef") or raw.get("new_ref"),
    }


def _sync_op_metrics(conn: Any, connector_id: str, *, comments_schema: str = COMMENTS_SCHEMA) -> dict[str, Any]:
    ops = _qual(comments_schema, "sync_ops")
    threads = _qual(comments_schema, "tracked_threads")
    row = conn.execute(
        f"""
        SELECT
            COUNT(*) FILTER (WHERE o.state = 'pending')::int AS pending_ops,
            COUNT(*) FILTER (WHERE o.state IN ('sent', 'recovering'))::int AS sent_ops,
            COUNT(*) FILTER (WHERE o.state = 'quarantine')::int AS quarantined_ops,
            COUNT(*) FILTER (WHERE o.state = 'failed')::int AS failed_ops,
            MIN(o.created_at) FILTER (WHERE o.state = 'pending') AS oldest_pending,
            MIN(o.next_attempt_at) FILTER (
                WHERE o.state = ANY(ARRAY['pending','sent','recovering','quarantine'])
                  AND o.last_error ->> 'class' = 'rate_limited'
                  AND o.next_attempt_at > NOW()
            ) AS rate_limit_resume
        FROM {ops} o
        JOIN {threads} t ON t.id = o.tracked_thread_id
        WHERE t.connector_id = %s
        """,
        (connector_id,),
    ).fetchone()
    oldest_pending = (row or {}).get("oldest_pending")
    oldest_age = None
    if isinstance(oldest_pending, datetime):
        oldest_age = iso8601_duration(datetime.now(timezone.utc) - oldest_pending.astimezone(timezone.utc))
    return {
        "pendingOps": int((row or {}).get("pending_ops") or 0),
        "sentOps": int((row or {}).get("sent_ops") or 0),
        "quarantinedOps": int((row or {}).get("quarantined_ops") or 0),
        "failedOps": int((row or {}).get("failed_ops") or 0),
        "oldestPendingOpAge": oldest_age,
        "rateLimitResumeAt": _iso8601((row or {}).get("rate_limit_resume")),
    }


def _checkpoint_timestamp(
    conn: Any,
    *,
    kind: str,
    connector_id: str,
    comments_schema: str = COMMENTS_SCHEMA,
) -> str | None:
    checkpoints = _qual(comments_schema, "sync_checkpoints")
    row = conn.execute(
        f"""
        SELECT MAX(last_success_at) AS last_success
        FROM {checkpoints}
        WHERE kind = %s AND scope_key LIKE %s
        """,
        (kind, f"{connector_id}:%"),
    ).fetchone()
    return _iso8601((row or {}).get("last_success"))


def _oldest_unapplied_hint_age(
    conn: Any,
    connector_id: str,
    *,
    comments_schema: str = COMMENTS_SCHEMA,
) -> str | None:
    hints = _qual(comments_schema, "remote_hints")
    row = conn.execute(
        f"""
        SELECT MIN(received_at) AS oldest
        FROM {hints}
        WHERE connector_id = %s AND state = 'pending'
        """,
        (connector_id,),
    ).fetchone()
    oldest = (row or {}).get("oldest")
    if not isinstance(oldest, datetime):
        return None
    return iso8601_duration(datetime.now(timezone.utc) - oldest.astimezone(timezone.utc))


def _last_webhook_at(conn: Any, connector_id: str, *, comments_schema: str = COMMENTS_SCHEMA) -> str | None:
    deliveries = _qual(comments_schema, "remote_deliveries")
    row = conn.execute(
        f"SELECT MAX(received_at) AS last_webhook FROM {deliveries} WHERE connector_id = %s",
        (connector_id,),
    ).fetchone()
    return _iso8601((row or {}).get("last_webhook"))


def _recent_checkpoint_error(
    conn: Any,
    connector_id: str,
    *,
    comments_schema: str = COMMENTS_SCHEMA,
) -> dict | None:
    checkpoints = _qual(comments_schema, "sync_checkpoints")
    row = conn.execute(
        f"""
        SELECT last_error
        FROM {checkpoints}
        WHERE scope_key LIKE %s AND last_error IS NOT NULL
        ORDER BY next_run_at DESC NULLS LAST, kind ASC
        LIMIT 1
        """,
        (f"{connector_id}:%",),
    ).fetchone()
    return _wire_provider_error((row or {}).get("last_error"))


def aggregate_connector_health(
    conn: Any,
    connector_id: str,
    *,
    comments_schema: str = COMMENTS_SCHEMA,
    workspace_schema: str = WORKSPACE_SCHEMA,
) -> dict[str, Any]:
    connectors = _qual(workspace_schema, "tracker_connectors")
    row = conn.execute(
        f"SELECT paused, paused_reason FROM {connectors} WHERE id = %s",
        (connector_id,),
    ).fetchone()
    if row is None:
        raise KeyError(connector_id)

    metrics = _sync_op_metrics(conn, connector_id, comments_schema=comments_schema)
    paused_reason = str(row.get("paused_reason") or "")
    quarantined = int(metrics["quarantinedOps"])
    failed = int(metrics["failedOps"])
    last_error = _recent_checkpoint_error(conn, connector_id, comments_schema=comments_schema)
    last_poll = _checkpoint_timestamp(conn, kind="poll", connector_id=connector_id, comments_schema=comments_schema)
    last_sweep = _checkpoint_timestamp(conn, kind="sweep", connector_id=connector_id, comments_schema=comments_schema)
    last_webhook = _last_webhook_at(conn, connector_id, comments_schema=comments_schema)

    degraded = (
        quarantined > 0
        or failed > 0
        or paused_reason in {"auth_lost", "revoked"}
        or bool(last_error and last_error.get("class") not in {None, "transient"})
    )
    # F7.quiet_repo_not_broken: successful poll/sweep without webhooks is healthy.
    if (
        not degraded
        and not bool(row.get("paused"))
        and last_webhook is None
        and (last_poll is not None or last_sweep is not None)
    ):
        degraded = False

    return {
        "connectorId": connector_id,
        "paused": bool(row.get("paused")),
        "lastWebhookAt": last_webhook,
        "lastPollAt": last_poll,
        "lastSweepAt": last_sweep,
        "pendingOps": metrics["pendingOps"],
        "sentOps": metrics["sentOps"],
        "quarantinedOps": quarantined,
        "failedOps": failed,
        "oldestPendingOpAge": metrics["oldestPendingOpAge"],
        "oldestUnappliedHintAge": _oldest_unapplied_hint_age(conn, connector_id, comments_schema=comments_schema),
        "rateLimitResumeAt": metrics["rateLimitResumeAt"],
        "degraded": degraded,
        "lastError": last_error,
    }


def aggregate_project_health(
    conn: Any,
    project_id: str,
    *,
    comments_schema: str = COMMENTS_SCHEMA,
    workspace_schema: str = WORKSPACE_SCHEMA,
) -> dict[str, Any]:
    project_trackers = _qual(workspace_schema, "project_trackers")
    row = conn.execute(
        f"SELECT connector_id, remote_container_id FROM {project_trackers} WHERE project_id = %s",
        (project_id,),
    ).fetchone()
    if row is None:
        raise KeyError(project_id)

    connector_id = str(row["connector_id"])
    container_id = str(row["remote_container_id"])
    base = aggregate_connector_health(
        conn,
        connector_id,
        comments_schema=comments_schema,
        workspace_schema=workspace_schema,
    )

    threads = _qual(comments_schema, "tracked_threads")
    ops = _qual(comments_schema, "sync_ops")
    project_row = conn.execute(
        f"""
        SELECT
            COUNT(*) FILTER (WHERE t.link_state = 'linked')::int AS linked_threads,
            COUNT(*) FILTER (WHERE t.link_state = 'inaccessible')::int AS inaccessible_threads,
            COUNT(*) FILTER (WHERE t.link_state = 'deleted')::int AS deleted_threads,
            COUNT(*) FILTER (WHERE t.link_state = 'transferred')::int AS transferred_threads,
            COUNT(*) FILTER (WHERE t.paused_reason IS NOT NULL)::int AS paused_threads
        FROM {threads} t
        JOIN comments c ON c.id = t.comment_id
        WHERE c.project_id = %s AND t.unlinked_at IS NULL
        """,
        (project_id,),
    ).fetchone()
    backlog = conn.execute(
        f"""
        SELECT
            COUNT(*) FILTER (WHERE o.state = 'pending')::int AS pending_ops,
            COUNT(*) FILTER (WHERE o.state = 'failed')::int AS failed_ops
        FROM {ops} o
        JOIN {threads} t ON t.id = o.tracked_thread_id
        JOIN comments c ON c.id = t.comment_id
        WHERE c.project_id = %s
          AND t.connector_id = %s
          AND t.remote_container_id = %s
        """,
        (project_id, connector_id, container_id),
    ).fetchone()

    return {
        "projectId": project_id,
        "connectorId": connector_id,
        "destinationContainerId": container_id,
        "linkedThreads": int((project_row or {}).get("linked_threads") or 0),
        "inaccessibleThreads": int((project_row or {}).get("inaccessible_threads") or 0),
        "deletedThreads": int((project_row or {}).get("deleted_threads") or 0),
        "transferredThreads": int((project_row or {}).get("transferred_threads") or 0),
        "pausedThreads": int((project_row or {}).get("paused_threads") or 0),
        "pendingOps": int((backlog or {}).get("pending_ops") or 0),
        "failedOps": int((backlog or {}).get("failed_ops") or 0),
        "connectorHealth": base,
    }


__all__ = [
    "aggregate_connector_health",
    "aggregate_project_health",
    "iso8601_duration",
]
