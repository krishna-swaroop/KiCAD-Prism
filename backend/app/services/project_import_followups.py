"""Post-import metadata and thumbnail scheduling.

Import registration stays available even when a derived job cannot be queued.
Outcomes are recorded so a later retry can name the project and operation.
"""

from __future__ import annotations

from typing import Callable, Optional, Sequence


def schedule_import_follow_up(
    project_id: str,
    operation: str,
    start: Callable[..., Optional[str]],
    *,
    requested_by: str = "",
) -> dict[str, str]:
    """Queue one derived job and record whether it actually started.

    Import must not roll back because metadata or a thumbnail could not be
    queued. The outcome is stored on the import job so a later retry can see
    which operation failed.
    """
    try:
        job_id = start(project_id, requested_by=requested_by)
    except Exception as error:
        return {
            "project_id": project_id,
            "operation": operation,
            "status": "failed",
            "error": str(error),
        }
    if not job_id:
        return {
            "project_id": project_id,
            "operation": operation,
            "status": "skipped",
            "error": "Project not found",
        }
    return {
        "project_id": project_id,
        "operation": operation,
        "status": "queued",
        "job_id": str(job_id),
    }


def schedule_import_follow_ups(
    project_ids: Sequence[str],
    *,
    requested_by: str = "",
) -> list[dict[str, str]]:
    from app.services.project_import_service import (
        start_project_metadata_job,
        start_thumbnail_job,
    )

    outcomes: list[dict[str, str]] = []
    for project_id in project_ids:
        outcomes.append(
            schedule_import_follow_up(
                project_id,
                "metadata",
                start_project_metadata_job,
                requested_by=requested_by,
            )
        )
        outcomes.append(
            schedule_import_follow_up(
                project_id,
                "thumbnail",
                start_thumbnail_job,
                requested_by=requested_by,
            )
        )
    return outcomes


def retry_import_follow_ups(
    project_id: str,
    *,
    requested_by: str = "",
) -> list[dict[str, str]]:
    """Re-queue derived jobs for one imported project.

    Active metadata/thumbnail jobs are reused via their artifact keys, so a
    retry does not start a second render or metadata pass. The registered
    project row is left untouched.
    """
    return schedule_import_follow_ups([project_id], requested_by=requested_by)
