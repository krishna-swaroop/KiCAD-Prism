from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path

import anyio
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse

from app.api._helpers import get_project_for_role_or_404
from app.core.roles import CATALOG_READ_ROLES, CATALOG_WRITE_ROLES, role_meets_minimum
from app.core.security import AuthenticatedUser, require_viewer
from app.services.job_runtime import job_state_root
from app.services.job_service import jobs
from app.services.postgres_database import database


router = APIRouter(dependencies=[Depends(require_viewer)])


def _authorize_read(job: dict, user: AuthenticatedUser) -> None:
    project_id = job.get("project_id")
    if project_id:
        get_project_for_role_or_404(str(project_id), user.role)
        return
    if job.get("worker_pool") == "catalog":
        if user.role not in CATALOG_READ_ROLES:
            raise HTTPException(status_code=403, detail="Catalog read access required")
        return
    if user.role != "admin" and job.get("requested_by") not in {"", user.email}:
        raise HTTPException(status_code=403, detail="Job access denied")


def _authorize_cancel(job: dict, user: AuthenticatedUser) -> None:
    _authorize_read(job, user)
    if job.get("worker_pool") == "catalog":
        if user.role not in CATALOG_WRITE_ROLES:
            raise HTTPException(status_code=403, detail="Catalog write access required")
        return
    if not role_meets_minimum(user.role, "designer"):
        raise HTTPException(status_code=403, detail="Designer role required")


def _slim_status(job: dict) -> dict:
    status = {
        key: job.get(key)
        for key in (
            "job_id",
            "kind",
            "status",
            "stage",
            "message",
            "percent",
            "attempt",
            "max_attempts",
            "project_id",
            "repository_id",
            "created_at",
            "updated_at",
            "available_at",
            "started_at",
            "completed_at",
            "cancel_requested_at",
            "result_digest",
            "result_metadata",
            "error_code",
            "error_message",
        )
    }
    status["result_url"] = (
        f"/api/jobs/{job['job_id']}/artifact"
        if job.get("status") == "completed" and job.get("result_digest")
        else None
    )
    return status


def _get_authorized_job(job_id: str, user: AuthenticatedUser) -> dict:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    _authorize_read(job, user)
    return job


@router.get("/benchmark-metrics")
async def benchmark_metrics(
    since: str = Query(default=""),
    user: AuthenticatedUser = Depends(require_viewer),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    try:
        since_at = (
            datetime.fromisoformat(since.replace("Z", "+00:00"))
            if since
            else datetime.now(timezone.utc) - timedelta(minutes=15)
        )
        if since_at.tzinfo is None:
            since_at = since_at.replace(tzinfo=timezone.utc)
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Invalid since timestamp") from error
    snapshot = await asyncio.to_thread(jobs.benchmark_snapshot, since=since_at)
    limiter = anyio.to_thread.current_default_thread_limiter()
    limiter_stats = limiter.statistics()
    snapshot["apiDatabasePool"] = database.metrics_snapshot()
    snapshot["apiThreadPool"] = {
        "borrowedTokens": int(limiter.borrowed_tokens),
        "totalTokens": int(limiter.total_tokens),
        "queueDepth": int(limiter_stats.tasks_waiting),
    }
    return snapshot


@router.get("/{job_id}")
async def get_job(
    job_id: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    job = await asyncio.to_thread(jobs.get, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    _authorize_read(job, user)
    return _slim_status(job)


@router.post("/{job_id}/cancel", status_code=202)
async def cancel_job(
    job_id: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    job = await asyncio.to_thread(jobs.get, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    _authorize_cancel(job, user)
    status = await asyncio.to_thread(
        jobs.request_cancel,
        job_id,
        requested_by=user.email,
    )
    return {"job_id": job_id, "status": status}


@router.get("/{job_id}/events")
async def get_job_events(
    job_id: str,
    after: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
    user: AuthenticatedUser = Depends(require_viewer),
):
    job = await asyncio.to_thread(jobs.get, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    _authorize_read(job, user)
    events = await asyncio.to_thread(jobs.events, job_id, after=after, limit=limit)
    return {"job_id": job_id, "events": events}


@router.get("/{job_id}/artifact")
async def get_job_artifact(
    job_id: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    job = await asyncio.to_thread(jobs.get, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    _authorize_read(job, user)
    artifact = await asyncio.to_thread(jobs.get_artifact_for_job, job_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="Job artifact not found")
    root = (job_state_root() / "artifacts" / "objects" / "sha256").resolve()
    path = Path(str(artifact.get("object_path") or "")).resolve()
    try:
        path.relative_to(root)
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Job artifact not found") from error
    if not path.is_file():
        await asyncio.to_thread(
            jobs.invalidate_artifact,
            str(artifact["id"]),
            reason="object_missing_on_download",
        )
        raise HTTPException(status_code=404, detail="Job artifact not found")
    digest = str(artifact.get("digest") or "")
    return FileResponse(
        path,
        media_type=str(artifact.get("media_type") or "application/octet-stream"),
        headers={
            "ETag": f'"{digest}"',
            "Cache-Control": "private, max-age=31536000, immutable",
        },
    )


def _tail_log(path: Path, line_count: int) -> list[str]:
    root = (job_state_root() / "jobs").resolve()
    resolved = path.resolve()
    try:
        resolved.relative_to(root)
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Job log not found") from error
    if not resolved.is_file():
        raise HTTPException(status_code=404, detail="Job log not found")
    with resolved.open("rb") as handle:
        size = handle.seek(0, 2)
        handle.seek(max(0, size - 256 * 1024))
        text = handle.read(256 * 1024).decode("utf-8", errors="replace")
    return text.splitlines()[-line_count:]


@router.get("/{job_id}/logs")
async def get_job_logs(
    job_id: str,
    tail: int = Query(200, ge=1, le=1000),
    user: AuthenticatedUser = Depends(require_viewer),
):
    job = await asyncio.to_thread(jobs.get, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    _authorize_read(job, user)
    log_path = str(job.get("log_path") or "")
    if not log_path:
        return {"job_id": job_id, "lines": []}
    lines = await asyncio.to_thread(_tail_log, Path(log_path), tail)
    return {"job_id": job_id, "lines": lines}
