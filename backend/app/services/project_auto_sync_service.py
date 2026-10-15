"""Queue one bounded background fetch per due repository, not per project.

A repository whose remote has not moved since the last fetch gets no job: a
``git ls-remote`` against the local remote-tracking refs and tags shows it,
and only the synced time is recorded. Background fetches used to start one
worker process, job row, events and log folder per repository every few
minutes whether or not anything had changed.
"""

from __future__ import annotations

import os
import subprocess
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


LS_REMOTE_TIMEOUT_SECONDS = 30


def _repository_path(project: dict) -> str:
    multi = (project.get("import_type") or "single") == "multi"
    return str((project.get("parent_repo_path") if multi else project.get("path")) or "")


def remote_unchanged(path: str) -> bool:
    """True only when every branch and tag on ``origin`` matches what the last fetch left.

    Any doubt (no checkout, a failed or slow ``ls-remote``, a narrower clone)
    is False, so the fetch job runs as before and reports its own errors.
    """

    from app.services import git_remote_access

    if not path or not os.path.isdir(path):
        return False
    try:
        remote = subprocess.run(
            ["git", "-C", path, "ls-remote", "--heads", "--tags", "origin"],
            capture_output=True, text=True, timeout=LS_REMOTE_TIMEOUT_SECONDS,
            env=git_remote_access.git_env(), check=False,
        )
        local = subprocess.run(
            ["git", "-C", path, "for-each-ref", "--format=%(objectname) %(refname)", "refs/remotes/origin", "refs/tags"],
            capture_output=True, text=True, timeout=LS_REMOTE_TIMEOUT_SECONDS, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    if remote.returncode != 0 or local.returncode != 0:
        return False
    upstream = {
        ref: sha for sha, ref in (line.split("\t", 1) for line in remote.stdout.splitlines() if "\t" in line)
        if not ref.endswith("^{}")
    }
    tracked = {}
    for line in local.stdout.splitlines():
        sha, _, ref = line.partition(" ")
        if ref == "refs/remotes/origin/HEAD":
            continue
        if ref.startswith("refs/remotes/origin/"):
            ref = "refs/heads/" + ref[len("refs/remotes/origin/"):]
        tracked[ref] = sha
    return bool(upstream) and upstream == tracked


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
        last_attempts[repo_id] = now
        if remote_unchanged(_repository_path(project)):
            workspace.update_repository_synced(repo_id)
            continue
        start_sync_job(str(project["id"]), requested_by="system:auto-sync", fetch_only=True)
        queued += 1
        if queued >= 8:
            break
    return queued
