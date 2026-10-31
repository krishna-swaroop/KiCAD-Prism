"""The supply snapshot of a published release, taken by a worker job.

Publishing a release queues one job per build (idempotent: the job key is the build, and a snapshot is written once). The
job reads the BOM the build exported, assesses it and freezes the result beside the release record (``release_check``).
It is retried when it fails for a reason that may pass, and ``release_snapshot_jobs`` says whether the snapshot was
taken, or why not, so the release record never has to guess.

The BOM is read from the build's stored dossier (``release_source``). A build with no BOM in it cannot have a snapshot;
that is recorded as the reason, not retried.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from app.services.job_kinds import JobKind
from app.services.supply import catalog_read, clock, release_bom, release_check, release_source
from app.services.supply.progress import job_progress
from app.services.supply.store import supply_store

JOB_KIND = "supply_release_snapshot"
SNAPSHOT_PRIORITY = 150
SYSTEM_REQUESTER = "system:supply-release"
logger = logging.getLogger(__name__)


def artifact_key(build_id: str) -> str:
    return f"supply-snapshot:{build_id}"


def _state(conn, project_id: str, build_id: str, state: str, reason: str = "", *, attempt: bool = False) -> None:
    conn.execute(
        """
        INSERT INTO supply_release_snapshot_jobs (build_id, project_id, state, reason, attempts, updated_at) VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (build_id) DO UPDATE SET state = EXCLUDED.state, reason = EXCLUDED.reason, updated_at = EXCLUDED.updated_at,
            attempts = supply_release_snapshot_jobs.attempts + %s
        """,
        (build_id, project_id, state, reason[:300], 1 if attempt else 0, clock.now(), 1 if attempt else 0),
    )


def status_of(conn, project_id: str, build_id: str) -> dict[str, Any]:
    """Whether a release has its snapshot, as a job's progress: ``done`` once taken, ``running`` while queued, ``failed``
    with the reason, ``none`` when nothing was asked."""

    if conn.execute("SELECT 1 FROM supply_release_snapshots WHERE project_id = %s AND build_id = %s", (project_id, build_id)).fetchone():
        return job_progress("done", done=1, total=1)
    row = conn.execute("SELECT state, reason FROM supply_release_snapshot_jobs WHERE build_id = %s AND project_id = %s", (build_id, project_id)).fetchone()
    if row is None:
        return job_progress("none")
    if row["state"] == "failed":
        return job_progress("failed", total=1, failed=1, reason=row["reason"])
    if row["state"] == "done":
        return job_progress("done", done=1, total=1)
    return job_progress("running", total=1)


def queue(project_id: str, build_id: str, tag: str, commit_sha: str, actor: str, *, job_service: Any | None = None) -> bool:
    """Ask for the snapshot of a published build. Never raises: a release must stand whether or not this can be queued."""

    try:
        if job_service is None:
            from app.services.job_service import jobs as job_service
        with supply_store.connection() as conn:
            _state(conn, project_id, build_id, "queued")
        job_service.enqueue(
            JOB_KIND,
            {"project_id": project_id, "build_id": build_id, "tag": tag, "commit_sha": commit_sha, "actor": actor},
            worker_pool="prism",
            artifact_key=artifact_key(build_id),
            priority=SNAPSHOT_PRIORITY,
            requested_by=SYSTEM_REQUESTER,
            max_attempts=3,
        )
        return True
    except Exception:  # noqa: BLE001
        logger.warning("Could not queue the supply snapshot for build %s", build_id, exc_info=True)
        try:
            with supply_store.connection() as conn:
                _state(conn, project_id, build_id, "failed", "It could not be queued.")
        except Exception:  # noqa: BLE001
            pass
        return False


def take(project_id: str, build_id: str, tag: str, commit_sha: str, actor: str, *, now: datetime | None = None) -> str:
    """Take the snapshot now. Returns ``taken``, or ``failed`` for a reason that retrying will not change."""

    now = now or clock.now()
    try:
        text = release_source.build_bom_text(build_id)
    except release_source.NoBuildBom as exc:
        with supply_store.connection() as conn:
            _state(conn, project_id, build_id, "failed", str(exc))
        return "failed"
    try:
        read = release_bom.lines_from_csv(text, catalog_read.identities)
    except release_bom.BomReadError as exc:
        with supply_store.connection() as conn:
            _state(conn, project_id, build_id, "failed", str(exc))
        return "failed"
    with supply_store.connection() as conn:
        release_check.freeze(
            conn, project_id, build_id, tag, commit_sha, actor, read.lines, now, read.without_number
        )
        _state(conn, project_id, build_id, "done")
    return "taken"


def run_job(context: Any) -> Any:
    """Job handler. A failure that may pass is retried; on the last attempt the reason is recorded."""

    from app.services.job_runtime import JobResult

    payload = context.payload
    project_id, build_id = str(payload["project_id"]), str(payload["build_id"])
    attempt, limit = int(context.job.get("attempt") or 1), int(context.job.get("max_attempts") or 1)
    try:
        with supply_store.connection() as conn:
            _state(conn, project_id, build_id, "queued", attempt=True)
        outcome = take(project_id, build_id, str(payload.get("tag") or ""), str(payload.get("commit_sha") or ""), str(payload.get("actor") or ""))
    except Exception as exc:  # noqa: BLE001
        if attempt >= limit:
            with supply_store.connection() as conn:
                _state(conn, project_id, build_id, "failed", f"It failed {attempt} times: {type(exc).__name__}.")
            return JobResult(message="The supply snapshot could not be taken", details={"build_id": build_id})
        raise
    return JobResult(message=f"Supply snapshot {outcome}", details={"build_id": build_id, "outcome": outcome})


JOB_KINDS = (JobKind(JOB_KIND, run_job, priority=SNAPSHOT_PRIORITY, max_attempts=3),)
