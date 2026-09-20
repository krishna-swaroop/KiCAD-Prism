"""Bounded tracker job handlers registered into the Prism worker (TR-14).

Dispatch/poll/sweep run in the existing prism pool. Claimed ``sent`` ops take
the recovery path and are never resent (D2). Network I/O, when a later ticket
installs an executor, happens after the claim/sent transaction commits.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

from app.services.job_runtime import JobContext, JobResult, RetryableJobError
from app.services.trackers.inbox_store import InboxStore
from app.services.trackers.op_store import (
    EXECUTE_DISPATCH,
    RECOVERY_DISPATCH,
    OpStore,
)
from app.services.trackers.scheduler import (
    DISPATCH_KIND,
    POLL_INTERVAL_SECONDS,
    POLL_KIND,
    SWEEP_INTERVAL_SECONDS,
    SWEEP_KIND,
)

DispatchExecutor = Callable[[dict[str, Any]], None]


def register_tracker_job_handlers(register: Callable[[str, Callable], None]) -> None:
    register(DISPATCH_KIND, run_tracker_dispatch_job)
    register(POLL_KIND, run_tracker_poll_job)
    register(SWEEP_KIND, run_tracker_sweep_job)


def run_tracker_dispatch_job(context: JobContext) -> JobResult:
    context.check_cancelled()
    payload = context.payload
    connector_id = str(payload.get("connectorId") or "")
    with _comments_connect(context) as conn:
        paused = _connector_paused(conn, connector_id)
        ops = OpStore(conn)
        claimed = ops.claim(context.worker_id, lease_seconds=60)
        if claimed is None:
            inbox = InboxStore(conn)
            hint = inbox.claim_hint(context.worker_id, lease_seconds=60)
            if hint is None:
                conn.commit()
                raise RetryableJobError(
                    "No due tracker operations",
                    code="tracker_idle",
                    retry_after_seconds=30,
                )
            if paused:
                conn.commit()
                return JobResult(message="Connector paused; hint retained")
            inbox.finish_hint(str(hint["id"]), int(hint["fence"]), state="ignored")
            conn.commit()
            return JobResult(message="Hint claimed; apply is a later ticket")
        result = _handle_claimed_op(ops, claimed, paused=paused, executor=_executor(context))
        conn.commit()
        return result


def run_tracker_poll_job(context: JobContext) -> JobResult:
    return _run_checkpoint_job(context, kind="poll", interval=POLL_INTERVAL_SECONDS)


def run_tracker_sweep_job(context: JobContext) -> JobResult:
    return _run_checkpoint_job(context, kind="sweep", interval=SWEEP_INTERVAL_SECONDS)


def _run_checkpoint_job(context: JobContext, *, kind: str, interval: int) -> JobResult:
    context.check_cancelled()
    payload = context.payload
    scope = f"{payload.get('connectorId')}:{payload.get('remoteContainerId')}"
    with _comments_connect(context) as conn:
        inbox = InboxStore(conn)
        claimed = inbox.claim_checkpoint(
            kind=kind,
            scope_key=scope,
            worker_id=context.worker_id,
            lease_seconds=60,
        )
        if claimed is None:
            conn.commit()
            raise RetryableJobError(
                "Tracker checkpoint already leased",
                code="tracker_checkpoint_busy",
                retry_after_seconds=interval,
            )
        conn.execute(
            """
            UPDATE sync_checkpoints
            SET next_run_at = NOW() + (%s * INTERVAL '1 second'),
                claimed_by = NULL,
                lease_expires_at = NULL
            WHERE kind = %s AND scope_key = %s AND fence = %s
            """,
            (interval, kind, scope, int(claimed["fence"])),
        )
        conn.commit()
    return JobResult(message=f"Scheduled next {kind}")


def _handle_claimed_op(
    ops: OpStore,
    claimed: dict[str, Any],
    *,
    paused: bool,
    executor: DispatchExecutor | None,
) -> JobResult:
    op_id = str(claimed["id"])
    fence = int(claimed["fence"])
    if paused:
        ops.schedule(
            op_id,
            fence,
            next_attempt_at=datetime.now(timezone.utc) + timedelta(minutes=15),
            error={"class": "auth_lost", "message": "Connector is paused.", "retryable": False},
            consume_attempt=False,
        )
        return JobResult(message="Paused connector retained the operation")
    resume_at = _rate_limit_resume(claimed)
    if resume_at is not None and resume_at > datetime.now(timezone.utc):
        ops.schedule(op_id, fence, next_attempt_at=resume_at, consume_attempt=False)
        return JobResult(message="Rate-limited operation waiting")
    if claimed.get("dispatch") == RECOVERY_DISPATCH:
        if executor is not None:
            executor(claimed)
        else:
            ops.schedule(
                op_id,
                fence,
                next_attempt_at=datetime.now(timezone.utc) + timedelta(minutes=1),
                consume_attempt=False,
            )
        return JobResult(message="Recovery path; not resent")
    if claimed.get("dispatch") != EXECUTE_DISPATCH:
        ops.schedule(op_id, fence, next_attempt_at=datetime.now(timezone.utc), consume_attempt=False)
        return JobResult(message="Unexpected dispatch")
    if executor is None:
        ops.schedule(
            op_id,
            fence,
            next_attempt_at=datetime.now(timezone.utc) + timedelta(seconds=30),
            consume_attempt=False,
        )
        return JobResult(message="Dispatch claimed; executor not mounted")
    ops.mark_sent(op_id, fence)
    executor(claimed)
    return JobResult(message="Dispatched")


def _rate_limit_resume(claimed: dict[str, Any]) -> Optional[datetime]:
    error = claimed.get("last_error") or {}
    if not isinstance(error, dict):
        return None
    if str(error.get("class") or "") != "rate_limited":
        return None
    raw = error.get("resumeAt") or error.get("resume_at")
    if not raw:
        return datetime.now(timezone.utc) + timedelta(minutes=1)
    text = str(raw)
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return datetime.now(timezone.utc) + timedelta(minutes=1)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _connector_paused(conn: Any, connector_id: str) -> bool:
    if not connector_id:
        return False
    row = conn.execute(
        "SELECT paused FROM tracker_connectors WHERE id = %s",
        (connector_id,),
    ).fetchone()
    return bool(row and row.get("paused"))


def _executor(context: JobContext) -> DispatchExecutor | None:
    value = context.payload.get("_executor")
    return value if callable(value) else None


@contextmanager
def _comments_connect(context: JobContext):
    opener = context.payload.get("_connect")
    if opener is not None:
        with opener() as conn:
            yield conn
        return
    from app.services.postgres_database import database

    with database.connection() as conn:
        conn.execute("SET search_path TO comments, workspace, public")
        yield conn
