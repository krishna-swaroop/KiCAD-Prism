"""One job's timeline: queue wait, claim attempts, stages, claims and log tail.

The job queue already records everything an operator asks for, scattered across
``ws_jobs``, ``ws_job_events``, ``ws_job_resource_slots`` and ``ws_job_locks``.
This module joins those reads into one answer without copying a payload or a
result document: a payload can carry design data, and the brief for an ops
result is identifiers, timings, counts and sizes (ADR §11, D22). Only the
payload's and result metadata's top-level keys are reported, and every event
detail, error message and log line is redacted. The error message and log tail
also lose server internals: a traceback keeps only its exception line, and an
absolute path keeps only its file name.

Blocking reads (the database and the log file) are called from a worker thread;
the route does that. Nothing here is async.
"""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from typing import Any

from app.core.redaction import redact_text, redact_value
from app.services.job_rows import timestamp
from app.services.job_runtime import JobLogNotFound, tail_job_log
from app.services.job_service import jobs
from app.services.postgres_database import database

#: More than this many events are cut off, and the result says so.
MAX_EVENTS = 500
#: A log tail is never longer than this, whatever the caller asked for.
MAX_LOG_LINES = 200

_CLAIM_EVENTS = frozenset({"claimed", "lease_reclaimed"})
#: Events that close one claim attempt. A reclaim closes it too, because the
#: next attempt is a new claim, and so does an ops requeue of a lease-expired
#: job. A cancel request does not: the worker keeps the attempt until its next
#: checkpoint, and the cancelled event that follows closes it.
_ATTEMPT_END_EVENTS = _CLAIM_EVENTS | frozenset(
    {
        "completed",
        "failed",
        "cancelled",
        "retry_scheduled",
        "cancelled_after_lease_expiry",
        "ended_without_lease",
        "requeued",
    }
)
_EXIT_CODE = re.compile(r"exited with code (-?\d+)")
#: An absolute filesystem path of two or more segments, not part of a URL.
_ABSOLUTE_PATH = re.compile(r"(?<![\w:/.~-])(?:/[\w.@+-]+)+/([\w.@+-]+)")
_TRACEBACK = "Traceback (most recent call last):"
_FRAME = re.compile(r'^\s*File ".*", line \d+')


def _moment(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _seconds(start: Any, end: Any) -> float | None:
    first, last = _moment(start), _moment(end)
    if first is None or last is None:
        return None
    return round(max(0.0, (last - first).total_seconds()), 3)


def exit_code_from_message(message: Any) -> int | None:
    """The worker's exit code when it wrote ``Job runner exited with code N``."""

    found = _EXIT_CODE.search(str(message or ""))
    return int(found.group(1)) if found else None


def _summary(job: dict[str, Any]) -> dict[str, Any]:
    message = job.get("error_message") or ""
    return {
        "job_id": str(job.get("job_id") or job.get("id") or ""),
        "kind": str(job.get("kind") or ""),
        "status": str(job.get("status") or ""),
        "stage": str(job.get("stage") or ""),
        "project_id": job.get("project_id"),
        "repository_id": job.get("repository_id"),
        "worker_pool": str(job.get("worker_pool") or ""),
        "priority": job.get("priority"),
        "attempt": job.get("attempt"),
        "max_attempts": job.get("max_attempts"),
        "fence": job.get("fence"),
        "lease_owner": str(job.get("lease_owner") or ""),
        "created_at": job.get("created_at"),
        "updated_at": job.get("updated_at"),
        "started_at": job.get("started_at"),
        "completed_at": job.get("completed_at"),
        "cancel_requested_at": job.get("cancel_requested_at"),
        "error_code": str(job.get("error_code") or ""),
        "error_message": _without_paths(redact_text(message)),
        "exit_code": exit_code_from_message(message),
    }


def _event_rows(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "id": int(event["id"]),
            "event_type": str(event.get("event_type") or ""),
            "stage": str(event.get("stage") or ""),
            "percent": event.get("percent"),
            "details": redact_value(event.get("details") or {}),
            "created_at": event.get("created_at"),
        }
        for event in events
    ]


def _queue_wait(job: dict[str, Any], events: list[dict[str, Any]]) -> dict[str, Any] | None:
    created = job.get("created_at")
    claimed = next(
        (event.get("created_at") for event in events if event.get("event_type") in _CLAIM_EVENTS),
        job.get("started_at"),
    )
    if created is None or claimed is None:
        return None
    return {"created_at": created, "claimed_at": claimed, "seconds": _seconds(created, claimed)}


def _claim_attempts(job: dict[str, Any], events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    attempts: list[dict[str, Any]] = []
    terminal = str(job.get("status") or "") in {"completed", "failed", "cancelled"}
    for index, event in enumerate(events):
        if event.get("event_type") not in _CLAIM_EVENTS:
            continue
        details = event.get("details") or {}
        ended_at: Any = None
        outcome = ""
        for later in events[index + 1:]:
            if later.get("event_type") in _ATTEMPT_END_EVENTS:
                ended_at = later.get("created_at")
                outcome = str(later.get("event_type") or "")
                break
        if ended_at is None and terminal:
            ended_at = job.get("completed_at") or job.get("updated_at")
            outcome = str(job.get("status") or "")
        attempts.append(
            {
                "worker_id": str(details.get("worker_id") or "") or None,
                "fence": details.get("fence"),
                "started_at": event.get("created_at"),
                "ended_at": ended_at,
                "seconds": _seconds(event.get("created_at"), ended_at),
                "outcome": outcome or "running",
            }
        )
    return attempts


def _stage_runs(job: dict[str, Any], events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Consecutive progress events' stages, each closed by the next change.

    An event that ends the attempt also closes the open stage, so a stage
    that failed is not stretched across the time the job then sat failed or
    waited for its retry.
    """

    def close(at: Any) -> None:
        if runs and runs[-1]["ended_at"] is None:
            runs[-1]["ended_at"] = at
            runs[-1]["seconds"] = _seconds(runs[-1]["started_at"], at)

    runs: list[dict[str, Any]] = []
    for event in events:
        event_type = event.get("event_type")
        if event_type in _ATTEMPT_END_EVENTS:
            close(event.get("created_at"))
            continue
        if event_type != "progress":
            continue
        stage = str(event.get("stage") or "")
        if not stage:
            continue
        if not runs or runs[-1]["ended_at"] is not None or runs[-1]["stage"] != stage:
            close(event.get("created_at"))
            runs.append(
                {
                    "stage": stage,
                    "started_at": event.get("created_at"),
                    "ended_at": None,
                    "seconds": None,
                }
            )
    if runs and runs[-1]["ended_at"] is None:
        ended_at = job.get("completed_at")
        if ended_at is None and str(job.get("status") or "") in {"completed", "failed", "cancelled"}:
            ended_at = job.get("updated_at")
        close(ended_at)
    return runs


def _claims_held(job_id: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    with database.connection() as conn:
        conn.execute("SET search_path TO workspace, public")
        slots = conn.execute(
            """SELECT resource_name, slot_number, fence, lease_owner, lease_expires_at
               FROM ws_job_resource_slots WHERE job_id = %s
               ORDER BY resource_name, slot_number""",
            (job_id,),
        ).fetchall()
        locks = conn.execute(
            """SELECT lock_key, mode, fence, lease_owner, lease_expires_at
               FROM ws_job_locks WHERE job_id = %s
               ORDER BY lock_key""",
            (job_id,),
        ).fetchall()
    return (
        [
            {
                "resource_name": str(row["resource_name"]),
                "slot_number": int(row["slot_number"]),
                "fence": row["fence"],
                "lease_owner": str(row["lease_owner"] or ""),
                "lease_expires_at": timestamp(row["lease_expires_at"]),
            }
            for row in slots
        ],
        [
            {
                "lock_key": str(row["lock_key"]),
                "mode": str(row["mode"] or ""),
                "fence": row["fence"],
                "lease_owner": str(row["lease_owner"] or ""),
                "lease_expires_at": timestamp(row["lease_expires_at"]),
            }
            for row in locks
        ],
    )


def _without_paths(text: str) -> str:
    return _ABSOLUTE_PATH.sub(r"\1", text)


def _without_tracebacks(lines: list[str]) -> list[str]:
    """Each traceback reduced to one marker line; its exception line is kept.

    A tail can start inside a traceback, so a frame line also starts the
    skipped run. Every indented line after it (source, carets) is a frame's.
    """

    kept: list[str] = []
    in_traceback = False
    for line in lines:
        if line.startswith(_TRACEBACK) or _FRAME.match(line):
            if not in_traceback:
                kept.append("Traceback (frames omitted)")
            in_traceback = True
            continue
        if in_traceback and line[:1].isspace():
            continue
        in_traceback = False
        kept.append(line)
    return kept


def _log_tail(job: dict[str, Any], line_count: int) -> list[str]:
    log_path = str(job.get("log_path") or "")
    if not log_path:
        return []
    try:
        lines = tail_job_log(Path(log_path), line_count)
    except (JobLogNotFound, OSError):
        # A missing, moved or out-of-root log is not an ops failure: the
        # timeline still answers from the database.
        return []
    return [_without_paths(redact_text(line)) for line in _without_tracebacks(lines)]


def job_timeline(job_id: str, *, log_lines: int = 50) -> dict[str, Any] | None:
    """One job's summary, events, derived phases, held claims and log tail.

    ``None`` when no job has this id. Reads block; call it from a thread.
    """

    job = jobs.get(job_id)
    if job is None:
        return None

    raw_events = jobs.events(job_id, limit=1000)
    truncated = len(raw_events) > MAX_EVENTS
    events = _event_rows(raw_events[:MAX_EVENTS])
    slots, locks = _claims_held(job_id)
    lines = max(0, min(int(log_lines), MAX_LOG_LINES))
    payload = job.get("payload")
    result_metadata = job.get("result_metadata")

    return {
        "job": _summary(job),
        "events": events,
        "events_truncated": truncated,
        "phases": {
            "queue_wait": _queue_wait(job, events),
            "claims": _claim_attempts(job, events),
            "stages": _stage_runs(job, events),
        },
        "resource_slots": slots,
        "locks": locks,
        "log_tail": _log_tail(job, lines),
        # A payload or result can hold design data; only its shape is reported.
        "payload_keys": sorted(payload.keys()) if isinstance(payload, dict) else [],
        "result_metadata_keys": sorted(result_metadata.keys())
        if isinstance(result_metadata, dict)
        else [],
    }


__all__ = ["MAX_EVENTS", "MAX_LOG_LINES", "exit_code_from_message", "job_timeline"]
