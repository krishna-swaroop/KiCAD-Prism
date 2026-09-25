"""Recover metadata and thumbnail jobs that an import could not schedule."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends

from app.api._helpers import get_project_for_role_or_404
from app.core.security import AuthenticatedUser, require_designer, require_viewer
from app.services import project_import_followups

router = APIRouter(dependencies=[Depends(require_viewer)])


@router.post(
    "/{project_id}/import-follow-ups/retry",
    dependencies=[Depends(require_designer)],
)
async def retry_project_import_follow_ups(
    project_id: str,
    user: AuthenticatedUser = Depends(require_designer),
):
    """Retry metadata and thumbnail jobs that an import could not schedule.

    The completed import job records these operations in ``result.follow_ups``.
    The project lookup intentionally happens before dispatch so a hidden or
    missing project cannot reach the scheduler.
    """
    get_project_for_role_or_404(project_id, user.role)
    outcomes = await asyncio.to_thread(
        project_import_followups.retry_import_follow_ups,
        project_id,
        requested_by=user.email,
    )
    job_ids = [
        str(outcome["job_id"])
        for outcome in outcomes
        if outcome.get("job_id")
    ]
    has_queued = any(outcome.get("status") == "queued" for outcome in outcomes)
    if has_queued and all(outcome.get("status") == "queued" for outcome in outcomes):
        status = "queued"
    elif has_queued:
        status = "partial"
    else:
        status = "failed"
    return {
        "status": status,
        "project_id": project_id,
        "follow_ups": outcomes,
        "job_ids": job_ids,
        "message": (
            "Import follow-ups queued"
            if status == "queued"
            else "Some import follow-ups could not be queued"
        ),
    }
