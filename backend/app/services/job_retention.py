"""Retention for finished jobs: their rows, events and log folders.

Routine background jobs (tracker polls and sweeps, background fetches,
system source checks) run every few minutes per repository and used to be
kept forever: tens of thousands of rows, events and one log folder each.
Artifact maintenance runs this once a day.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.services.job_runtime import job_state_root

#: Kinds a scheduler queues on its own, many times a day.
ROUTINE_KINDS = (
    "tracker_poll",
    "tracker_sweep",
    "tracker_dispatch",
    "project_sync",
    "system_source_check",
)
_DAY = 24 * 60 * 60
#: Upper bound on rows deleted per maintenance run, in batches.
_MAX_ROWS_PER_RUN = 200_000


def _remove_log_folder(log_path: str, root: Path) -> bool:
    folder = Path(log_path).parent
    try:
        folder.resolve().relative_to(root.resolve())
    except (OSError, ValueError):
        return False  # Only ever a folder under <state>/jobs.
    shutil.rmtree(folder, ignore_errors=True)
    return True


def prune_jobs(jobs: Any) -> dict[str, int]:
    """Delete finished jobs past retention, then log folders no job row owns."""

    root = job_state_root() / "jobs"
    routine = max(0, settings.PRISM_ROUTINE_JOB_RETENTION_DAYS) * _DAY
    other = max(0, settings.PRISM_JOB_RETENTION_DAYS) * _DAY
    rows = folders = 0
    while rows < _MAX_ROWS_PER_RUN:
        log_paths = jobs.prune_terminal_jobs(
            routine_kinds=ROUTINE_KINDS,
            routine_retention_seconds=routine,
            retention_seconds=other,
        )
        rows += len(log_paths)
        folders += sum(_remove_log_folder(path, root) for path in log_paths)
        if not log_paths:
            break
    folders += _remove_orphan_log_folders(jobs, root, older_than_seconds=routine)
    return {"job_rows_pruned": rows, "job_log_folders_removed": folders}


def _remove_orphan_log_folders(jobs: Any, root: Path, *, older_than_seconds: int) -> int:
    """Log folders whose job row is gone (deleted before retention existed)."""

    import time

    if not root.is_dir():
        return 0
    known = jobs.job_ids()
    cutoff = time.time() - older_than_seconds
    removed = 0
    for folder in root.iterdir():
        try:
            if folder.name in known or not folder.is_dir() or folder.stat().st_mtime >= cutoff:
                continue
        except OSError:
            continue
        shutil.rmtree(folder, ignore_errors=True)
        removed += 1
    return removed
