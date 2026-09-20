"""Bounded tracker job handlers registered into the Prism worker (TR-14/TR-62).

Dispatch/poll/sweep run in the existing prism pool. Claimed ``sent`` ops take
the recovery path and are never resent (D2). ``mark_sent`` commits before any
provider I/O; confirm/fail use a new transaction (C2/H2). Inbound hints are
applied through the shared composition reducer (TR-62). Poll/sweep cadence
follows C7 (M4).
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Mapping, Optional

from app.services.job_runtime import JobContext, JobResult, RetryableJobError
from app.services.trackers.errors import ProviderError
from app.services.trackers.inbox_store import InboxStore
from app.services.trackers.op_store import (
    EXECUTE_DISPATCH,
    RECOVERY_DISPATCH,
    OpStore,
)
from app.services.trackers.scheduler import (
    DISPATCH_KIND,
    OUTBOX_POLL_SECONDS,
    POLL_KIND,
    SWEEP_KIND,
    poll_interval_seconds,
    sweep_interval_seconds,
)

DispatchExecutor = Callable[[dict[str, Any]], str | None]

QUARANTINE_FIRST_MINUTES = 1


def register_tracker_job_handlers(register: Callable[[str, Callable], None]) -> None:
    register(DISPATCH_KIND, run_tracker_dispatch_job)
    register(POLL_KIND, run_tracker_poll_job)
    register(SWEEP_KIND, run_tracker_sweep_job)


def run_tracker_dispatch_job(context: JobContext) -> JobResult:
    context.check_cancelled()
    payload = context.payload
    connector_id = str(payload.get("connectorId") or "")
    container_id = str(payload.get("remoteContainerId") or "")
    executor = _executor(context)
    with _comments_connect(context) as conn:
        hints_applied = _apply_destination_hints(conn, connector_id, container_id)
        paused = _connector_paused(conn, connector_id)
        ops = OpStore(conn)
        claimed = ops.claim(context.worker_id, lease_seconds=60)
        if claimed is None:
            conn.commit()
            if hints_applied:
                return JobResult(message="Applied inbound hints", details={"hintsApplied": hints_applied})
            return _retain_or_idle(conn)
        prepared = _prepare_claimed_op(
            ops, claimed, paused=paused, has_executor=executor is not None
        )
        conn.commit()
    if not prepared["run_io"]:
        return prepared["result"]
    return _run_executor_outside_txn(context, prepared["claimed"], executor)


def run_tracker_poll_job(context: JobContext) -> JobResult:
    return _run_checkpoint_job(context, kind="poll")


def run_tracker_sweep_job(context: JobContext) -> JobResult:
    return _run_checkpoint_job(context, kind="sweep")


def _run_checkpoint_job(context: JobContext, *, kind: str) -> JobResult:
    context.check_cancelled()
    payload = context.payload
    connector_id = str(payload.get("connectorId") or "")
    container_id = str(payload.get("remoteContainerId") or "")
    scope = f"{connector_id}:{container_id}"
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
            fallback = poll_interval_seconds(conn, connector_id) if kind == "poll" else sweep_interval_seconds(
                conn, connector_id, container_id
            )
            raise RetryableJobError(
                "Tracker checkpoint already leased",
                code="tracker_checkpoint_busy",
                retry_after_seconds=fallback,
            )
        runtime = _runtime()
        if kind == "poll":
            result = runtime.run_poll(
                conn,
                connector_id=connector_id,
                remote_container_id=container_id,
            )
            interval = poll_interval_seconds(conn, connector_id)
        else:
            result = runtime.run_sweep(
                conn,
                connector_id=connector_id,
                remote_container_id=container_id,
            )
            interval = sweep_interval_seconds(conn, connector_id, container_id)
        conn.execute(
            """
            UPDATE sync_checkpoints
            SET claimed_by = NULL,
                lease_expires_at = NULL,
                next_run_at = COALESCE(next_run_at, NOW() + (%s * INTERVAL '1 second'))
            WHERE kind = %s AND scope_key = %s AND fence = %s
            """,
            (interval, kind, scope, int(claimed["fence"])),
        )
        conn.commit()
    return result


def _apply_destination_hints(conn: Any, connector_id: str, container_id: str) -> int:
    if not connector_id or not container_id:
        return 0
    try:
        return _runtime().apply_pending_hints(
            conn,
            connector_id=connector_id,
            remote_container_id=container_id,
        )
    except Exception:
        return 0


def _retain_or_idle(conn: Any) -> JobResult:
    pending = conn.execute(
        "SELECT 1 FROM remote_hints WHERE state = 'pending' LIMIT 1"
    ).fetchone()
    if pending:
        raise RetryableJobError(
            "Inbound hints retained pending apply",
            code="tracker_hints_deferred",
            retry_after_seconds=OUTBOX_POLL_SECONDS,
        )
    raise RetryableJobError(
        "No due tracker operations",
        code="tracker_idle",
        retry_after_seconds=OUTBOX_POLL_SECONDS,
    )


# TR-26 mount_create_executor snapshots this name before TR-62 renamed the helper.
_retain_inbound_hints = _retain_or_idle


def _prepare_claimed_op(
    ops: OpStore,
    claimed: dict[str, Any],
    *,
    paused: bool,
    has_executor: bool,
) -> dict[str, Any]:
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
        return {
            "run_io": False,
            "claimed": claimed,
            "result": JobResult(message="Paused connector retained the operation"),
        }
    resume_at = _rate_limit_resume(claimed)
    if resume_at is not None and resume_at > datetime.now(timezone.utc):
        ops.schedule(op_id, fence, next_attempt_at=resume_at, consume_attempt=False)
        return {
            "run_io": False,
            "claimed": claimed,
            "result": JobResult(message="Rate-limited operation waiting"),
        }
    if claimed.get("dispatch") == RECOVERY_DISPATCH:
        if has_executor:
            return {
                "run_io": True,
                "claimed": claimed,
                "result": JobResult(message="Recovery path; not resent"),
            }
        ops.schedule(
            op_id,
            fence,
            next_attempt_at=datetime.now(timezone.utc) + timedelta(minutes=1),
            consume_attempt=False,
        )
        return {
            "run_io": False,
            "claimed": claimed,
            "result": JobResult(message="Recovery path; not resent"),
        }
    if claimed.get("dispatch") != EXECUTE_DISPATCH:
        ops.schedule(op_id, fence, next_attempt_at=datetime.now(timezone.utc), consume_attempt=False)
        return {
            "run_io": False,
            "claimed": claimed,
            "result": JobResult(message="Unexpected dispatch"),
        }
    if not has_executor:
        ops.schedule(
            op_id,
            fence,
            next_attempt_at=datetime.now(timezone.utc) + timedelta(seconds=OUTBOX_POLL_SECONDS),
            consume_attempt=False,
        )
        return {
            "run_io": False,
            "claimed": claimed,
            "result": JobResult(message="Dispatch claimed; executor not mounted"),
        }
    ops.mark_sent(op_id, fence)
    return {
        "run_io": True,
        "claimed": claimed,
        "result": JobResult(message="Dispatched"),
    }


def _run_executor_outside_txn(
    context: JobContext,
    claimed: dict[str, Any],
    executor: DispatchExecutor | None,
) -> JobResult:
    if executor is None:
        return JobResult(message="Dispatched")
    op_id = str(claimed["id"])
    fence = int(claimed["fence"])
    dispatch = str(claimed.get("dispatch") or EXECUTE_DISPATCH)
    try:
        external_id = executor(claimed)
    except Exception as exc:
        with _comments_connect(context) as conn:
            _record_executor_outcome(OpStore(conn), op_id, fence, exc, dispatch=dispatch)
            conn.commit()
        raise
    if external_id:
        with _comments_connect(context) as conn:
            OpStore(conn).confirm(op_id, fence, external_result_id=str(external_id))
            conn.commit()
    return JobResult(
        message="Recovery path; not resent" if claimed.get("dispatch") == RECOVERY_DISPATCH else "Dispatched"
    )


def _record_executor_outcome(
    ops: OpStore,
    op_id: str,
    fence: int,
    exc: BaseException,
    *,
    dispatch: str,
) -> None:
    if isinstance(exc, ProviderError):
        error = exc.to_dto()
        resume_at = _rate_limit_resume({"last_error": error})
        if exc.class_ == "rate_limited":
            ops.schedule(
                op_id,
                fence,
                next_attempt_at=resume_at or datetime.now(timezone.utc) + timedelta(minutes=1),
                error=error,
                consume_attempt=False,
            )
            return
        if exc.retryable:
            ops.schedule(
                op_id,
                fence,
                next_attempt_at=datetime.now(timezone.utc) + timedelta(seconds=OUTBOX_POLL_SECONDS),
                error=error,
                consume_attempt=True,
            )
            return
        if dispatch == EXECUTE_DISPATCH and exc.class_ in {"invalid_request", "capability_missing"}:
            ops.fail(op_id, fence, error=error)
            return
        _enter_unknown_outcome_recovery(ops, op_id, fence, error=error)
        return
    ops.schedule(
        op_id,
        fence,
        next_attempt_at=datetime.now(timezone.utc) + timedelta(seconds=OUTBOX_POLL_SECONDS),
        error={"class": "transient", "message": str(exc)[:300], "retryable": True},
        consume_attempt=True,
    )


def _enter_unknown_outcome_recovery(
    ops: OpStore,
    op_id: str,
    fence: int,
    *,
    error: Mapping[str, Any],
) -> None:
    """Unknown write outcome (D2): sent → recovering → quarantine, not fail on the spot."""

    ops.enter_recovery(op_id, fence)
    ops.enter_quarantine(
        op_id,
        fence,
        next_attempt_at=datetime.now(timezone.utc) + timedelta(minutes=QUARANTINE_FIRST_MINUTES),
    )


def _handle_claimed_op(
    ops: OpStore,
    claimed: dict[str, Any],
    *,
    paused: bool,
    executor: DispatchExecutor | None,
) -> JobResult:
    """Test helper: prepare + optional in-process executor without a JobContext."""

    prepared = _prepare_claimed_op(
        ops, claimed, paused=paused, has_executor=executor is not None
    )
    if prepared["run_io"] and executor is not None:
        external_id = executor(claimed)
        if external_id:
            ops.confirm(
                str(claimed["id"]),
                int(claimed["fence"]),
                external_result_id=str(external_id),
            )
    return prepared["result"]


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


def _runtime():
    from app.services.trackers.composition import get_tracker_runtime

    return get_tracker_runtime()


def _executor(context: JobContext) -> DispatchExecutor | None:
    payload_executor = context.payload.get("_executor")
    if callable(payload_executor):
        return payload_executor

    def _dispatch(claimed: dict[str, Any]) -> str | None:
        with _comments_connect(context) as conn:
            return _runtime().dispatch_executor(conn, claimed)

    from app.services.trackers.composition import has_outbound_executor

    has_outbound = has_outbound_executor()
    if not has_outbound:
        def _recovery_only(claimed: dict[str, Any]) -> str | None:
            if str(claimed.get("dispatch") or EXECUTE_DISPATCH) != RECOVERY_DISPATCH:
                return None
            with _comments_connect(context) as conn:
                return _runtime().dispatch_executor(conn, claimed)

        return _recovery_only
    return _dispatch


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
