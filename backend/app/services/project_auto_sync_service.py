"""Queue one bounded background fetch per due repository, not per project."""

from __future__ import annotations

from datetime import datetime, timezone

from app.services.project_import_service import start_sync_job
from app.services.workspace_service import workspace


def _synced_at(value: object) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    return parsed.replace(tzinfo=parsed.tzinfo or timezone.utc)


def enqueue_due_fetches(
    last_attempts: dict[str, datetime], *, interval_seconds: int, now: datetime
) -> int:
    """Use repository sync timestamps and in-process retry throttling."""
    if interval_seconds <= 0:
        return 0

    projects_by_repo: dict[str, dict] = {}
    for project in workspace.get_all_projects():
        repo_id = str(project.get("repo_id") or "")
        if repo_id and repo_id not in projects_by_repo:
            projects_by_repo[repo_id] = project

    queued = 0
    for repo_id, project in projects_by_repo.items():
        last_success = _synced_at(project.get("repo_last_synced"))
        last_attempt = last_attempts.get(repo_id)
        newest = max((stamp for stamp in (last_success, last_attempt) if stamp), default=None)
        if newest and (now - newest).total_seconds() < interval_seconds:
            continue
        start_sync_job(str(project["id"]), requested_by="system:auto-sync", fetch_only=True)
        last_attempts[repo_id] = now
        queued += 1
        if queued >= 8:
            break
    return queued
