from __future__ import annotations

import logging
import threading
import time
import uuid
from datetime import datetime
from typing import Any, Callable, Mapping, Sequence

from app.core import request_context
from app.services import (
    event_log,
    job_artifact_records,
    job_benchmark,
    job_claims,
    job_lease_recovery,
    job_requeue,
)
from app.services.job_claims import LOCK_MODES  # noqa: F401  (kept importable from here)
from app.services.job_rows import (
    decode_artifact as _decode_artifact,
    decode_job,
    loads as _loads,
    timestamp as _timestamp,
    to_json as _json,
)
from app.services.postgres_database import database
from app.services.workspace_service import workspace


ACTIVE_STATUSES = frozenset({"queued", "running", "retry_wait", "cancel_requested"})
TERMINAL_STATUSES = frozenset({"completed", "failed", "cancelled"})
CLAIMABLE_STATUSES = frozenset({"queued", "retry_wait", "running"})

logger = logging.getLogger(__name__)

#: ``job.progress`` events are a heartbeat, not a log line: one per job per 2 s.
_PROGRESS_EVENT_INTERVAL_SECONDS = 2.0
_progress_event_times: dict[str, float] = {}
_progress_event_lock = threading.Lock()
_monotonic = time.monotonic


def _progress_event_due(job_id: str) -> bool:
    """Whether this attempt may append ``job.progress`` now, and start its clock."""

    now = _monotonic()
    with _progress_event_lock:
        previous = _progress_event_times.get(job_id)
        if previous is not None and now - previous < _PROGRESS_EVENT_INTERVAL_SECONDS:
            return False
        _progress_event_times[job_id] = now
        return True


def _forget_progress_event(job_id: str) -> None:
    with _progress_event_lock:
        _progress_event_times.pop(job_id, None)


class JobService:
    """Fenced PostgreSQL job queue shared by all Prism worker pools.

    Resource slots and locks live in ``job_claims``, artifact rows in
    ``job_artifact_records`` and benchmark metrics in ``job_benchmark``; each runs on the connection and
    inside the transaction this class opens.
    """

    def initialize(self) -> None:
        workspace.initialize()

    def _set_workspace_search_path(self, conn) -> None:
        conn.execute("SET search_path TO workspace, public")

    @staticmethod
    def _record_finished(
        *, job_id: str, job_kind: str, project_id: str | None, state: str
    ) -> None:
        """Tell the event log a job reached a terminal state (after its commit)."""

        _forget_progress_event(job_id)
        event_log.record_quietly(
            "job.finished",
            project_id=project_id or None,
            topic=f"job:{job_id}",
            payload={"jobId": job_id, "jobKind": job_kind, "state": state},
        )

    @staticmethod
    def _record_progress(
        *,
        job_id: str,
        job_kind: str,
        project_id: str | None,
        percent: float | None,
        previous_percent: Any = None,
    ) -> None:
        """Append ``job.progress`` when it moved, at most once per 2 s per job."""

        if percent is None or percent == previous_percent or not _progress_event_due(job_id):
            return
        event_log.record_quietly(
            "job.progress",
            project_id=project_id or None,
            topic=f"job:{job_id}",
            payload={"jobId": job_id, "jobKind": job_kind, "progress": float(percent)},
        )

    @staticmethod
    def _connect():
        return database.connection()

    def prune_finished(self, kind: str, *, older_than_seconds: int = 7 * 24 * 60 * 60) -> int:
        """Delete the finished jobs of one kind that completed longer ago than the cutoff, and return how many. For jobs that keep
        no artifacts and that the scheduler queues all day (their rows would otherwise stay for ever); a job with artifacts is not
        touched, since deleting it would take its artifact metadata with it."""

        self.initialize()
        with self._connect() as conn:
            self._set_workspace_search_path(conn)
            rows = conn.execute(
                """
                DELETE FROM ws_jobs job
                WHERE job.kind = %s AND job.status IN ('completed', 'failed', 'cancelled')
                  AND COALESCE(job.completed_at, job.updated_at) < NOW() - (%s * INTERVAL '1 second')
                  AND NOT EXISTS (SELECT 1 FROM ws_artifacts artifact WHERE artifact.source_job_id = job.id)
                RETURNING job.id
                """,
                (kind, max(0, int(older_than_seconds))),
            ).fetchall()
            conn.commit()
        return len(rows)

    def configure_resource_slots(self, capacities: Mapping[str, int]) -> None:
        """Reconcile configured slot rows without evicting active leases."""

        self.initialize()
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            job_claims.configure_resource_slots(conn, capacities)
            conn.commit()

    def enqueue(
        self,
        kind: str,
        payload: Mapping[str, Any] | None = None,
        *,
        worker_pool: str = "prism",
        artifact_key: str = "",
        project_id: str | None = None,
        repository_id: str | None = None,
        requested_by: str = "",
        priority: int = 100,
        max_attempts: int = 3,
        resources: Mapping[str, int] | None = None,
        locks: Sequence[Mapping[str, str]] | None = None,
    ) -> dict[str, Any]:
        self.initialize()
        normalized_kind = kind.strip()
        normalized_pool = worker_pool.strip()
        normalized_artifact = artifact_key.strip() or None
        if not normalized_kind or not normalized_pool:
            raise ValueError("Job kind and worker pool are required")
        if max_attempts < 1:
            raise ValueError("max_attempts must be at least one")
        resource_requirements = job_claims.normalize_resources(resources)
        lock_requirements = job_claims.normalize_locks(locks)
        job_id = str(uuid.uuid4())

        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            if normalized_artifact:
                conn.execute(
                    "SELECT pg_advisory_xact_lock(hashtext(%s))",
                    (f"prism-job:{normalized_kind}:{normalized_artifact}",),
                )
                existing = conn.execute(
                    """
                    SELECT * FROM ws_jobs
                    WHERE kind = %s
                      AND artifact_key = %s
                      AND status IN ('queued', 'running', 'retry_wait', 'cancel_requested')
                    ORDER BY created_at
                    LIMIT 1
                    """,
                    (normalized_kind, normalized_artifact),
                ).fetchone()
                if existing:
                    self._event(
                        conn,
                        str(existing["id"]),
                        "enqueue_deduplicated",
                        details={"requested_by": requested_by},
                    )
                    conn.commit()
                    result = self._decode(existing)
                    result["deduplicated"] = True
                    return result
                cached = job_artifact_records.reuse_cached_completion(
                    conn,
                    normalized_kind,
                    normalized_artifact,
                    requested_by=requested_by,
                    record_event=self._event,
                )
                if cached:
                    conn.commit()
                    result = self._decode(cached)
                    result["deduplicated"] = False
                    result["cache_hit"] = True
                    return result

            row = conn.execute(
                """
                INSERT INTO ws_jobs (
                    id, kind, worker_pool, status, message, percent, payload,
                    priority, artifact_key, project_id, repository_id,
                    requested_by, max_attempts, resource_requirements,
                    lock_requirements, created_at, updated_at, available_at,
                    request_id
                ) VALUES (
                    %s, %s, %s, 'queued', 'Queued', 0, %s::jsonb,
                    %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb,
                    NOW(), NOW(), NOW(), %s
                )
                RETURNING *
                """,
                (
                    job_id,
                    normalized_kind,
                    normalized_pool,
                    _json(dict(payload or {})),
                    int(priority),
                    normalized_artifact,
                    project_id,
                    repository_id,
                    requested_by,
                    int(max_attempts),
                    _json(resource_requirements),
                    _json(lock_requirements),
                    request_context.request_id(),
                ),
            ).fetchone()
            self._event(conn, job_id, "queued")
            conn.commit()
        result = self._decode(row)
        result["deduplicated"] = False
        result["cache_hit"] = False
        return result

    def claim(
        self,
        worker_id: str,
        *,
        worker_pool: str,
        lease_seconds: int = 30,
        candidate_limit: int = 32,
    ) -> dict[str, Any] | None:
        """Claim the first runnable job whose global resources are available."""

        self.initialize()
        if lease_seconds < 10:
            raise ValueError("lease_seconds must be at least 10")
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            ended = job_lease_recovery.recover_dead_attempts(
                conn, worker_pool, job_claims.release_claims, self._event
            )
            job_claims.release_non_authoritative_claims(conn)
            conn.commit()
            for ended_id, ended_kind, ended_project, ended_state in ended:
                self._record_finished(
                    job_id=ended_id, job_kind=ended_kind, project_id=ended_project, state=ended_state
                )
            candidate_ids = conn.execute(
                """
                SELECT id
                FROM ws_jobs
                WHERE worker_pool = %s
                  AND (
                    (status = 'queued' AND available_at <= NOW())
                    OR (status = 'retry_wait' AND available_at <= NOW())
                    OR (
                        status = 'running'
                        AND lease_expires_at IS NOT NULL
                        AND lease_expires_at < NOW()
                    )
                  )
                ORDER BY
                    CASE WHEN status = 'running' THEN 0 ELSE 1 END,
                    priority ASC, available_at ASC, created_at ASC, id ASC
                LIMIT %s
                """,
                (worker_pool, max(1, min(128, int(candidate_limit)))),
            ).fetchall()
            conn.commit()

            for candidate in candidate_ids:
                job_id = str(candidate["id"])
                row = conn.execute(
                    """
                    SELECT *
                    FROM ws_jobs
                    WHERE id = %s
                      AND worker_pool = %s
                      AND (
                        (status = 'queued' AND available_at <= NOW())
                        OR (status = 'retry_wait' AND available_at <= NOW())
                        OR (
                            status = 'running'
                            AND lease_expires_at IS NOT NULL
                            AND lease_expires_at < NOW()
                        )
                      )
                    FOR UPDATE SKIP LOCKED
                    """,
                    (job_id, worker_pool),
                ).fetchone()
                if not row:
                    conn.commit()
                    continue
                resources = job_claims.normalize_resources(
                    _loads(row["resource_requirements"], {})
                )
                locks = job_claims.normalize_locks(_loads(row["lock_requirements"], []))
                old_status = str(row["status"])
                reclaim_job_id = job_id if old_status == "running" else None
                chosen_slots = job_claims.find_slots(
                    conn,
                    resources,
                    reclaim_job_id=reclaim_job_id,
                )
                if chosen_slots is None or not job_claims.locks_available(conn, job_id, locks):
                    conn.commit()
                    continue

                old_fence = int(row["fence"] or 0)
                fence = old_fence + 1
                job_claims.clear_job_claims(conn, job_id)
                claimed = conn.execute(
                    """
                    UPDATE ws_jobs
                    SET status = 'running',
                        fence = %s,
                        lease_owner = %s,
                        lease_expires_at = NOW() + (%s * INTERVAL '1 second'),
                        heartbeat_at = NOW(),
                        started_at = COALESCE(started_at, NOW()),
                        attempt = attempt + 1,
                        message = CASE
                            WHEN status = 'running' THEN 'Reclaimed after lease expiry'
                            ELSE 'Starting'
                        END,
                        updated_at = NOW()
                    WHERE id = %s AND fence = %s
                    RETURNING *
                    """,
                    (fence, worker_id, lease_seconds, job_id, old_fence),
                ).fetchone()
                if not claimed:
                    conn.commit()
                    continue
                job_claims.assign_slots(
                    conn,
                    chosen_slots,
                    job_id=job_id,
                    fence=fence,
                    worker_id=worker_id,
                    lease_seconds=lease_seconds,
                )
                job_claims.assign_locks(
                    conn,
                    locks,
                    job_id=job_id,
                    fence=fence,
                    worker_id=worker_id,
                    lease_seconds=lease_seconds,
                )
                self._event(
                    conn,
                    job_id,
                    "lease_reclaimed" if old_status == "running" else "claimed",
                    details={
                        "worker_id": worker_id,
                        "fence": fence,
                        "previous_fence": old_fence,
                    },
                )
                conn.commit()
                return self._decode(claimed)
        return None

    def _authoritative_claim(
        self,
        conn: Any,
        job_id: str,
        worker_id: str,
        fence: int,
        *,
        statuses: Sequence[str] = ("running",),
    ) -> Mapping[str, Any] | None:
        row = conn.execute(
            """
            SELECT *
            FROM ws_jobs
            WHERE id = %s
              AND fence = %s
              AND lease_owner = %s
              AND status = ANY(%s)
              AND lease_expires_at IS NOT NULL
              AND lease_expires_at >= NOW()
            FOR UPDATE
            """,
            (job_id, fence, worker_id, list(statuses)),
        ).fetchone()
        if not row:
            return None
        if not job_claims.holds_claims(conn, row, job_id, worker_id, fence):
            return None
        return row

    def heartbeat(
        self,
        job_id: str,
        worker_id: str,
        fence: int,
        *,
        lease_seconds: int = 30,
    ) -> bool:
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            authoritative = self._authoritative_claim(
                conn,
                job_id,
                worker_id,
                fence,
                statuses=("running", "cancel_requested"),
            )
            if not authoritative:
                conn.commit()
                return False
            cursor = conn.execute(
                """
                UPDATE ws_jobs
                SET heartbeat_at = NOW(),
                    lease_expires_at = NOW() + (%s * INTERVAL '1 second'),
                    updated_at = NOW()
                WHERE id = %s
                  AND fence = %s
                  AND lease_owner = %s
                  AND status IN ('running', 'cancel_requested')
                  AND lease_expires_at >= NOW()
                """,
                (lease_seconds, job_id, fence, worker_id),
            )
            if cursor.rowcount == 1:
                job_claims.extend_claims(
                    conn, job_id, worker_id, fence, lease_seconds=lease_seconds
                )
            conn.commit()
            return cursor.rowcount == 1

    def progress(
        self,
        job_id: str,
        worker_id: str,
        fence: int,
        *,
        stage: str | None = None,
        message: str | None = None,
        percent: float | None = None,
        payload_updates: Mapping[str, Any] | None = None,
    ) -> bool:
        fields = ["updated_at = NOW()"]
        params: list[Any] = []
        if stage is not None:
            fields.append("stage = %s")
            params.append(stage)
        if message is not None:
            fields.append("message = %s")
            params.append(message)
        normalized_percent: float | None = None
        if percent is not None:
            normalized_percent = max(0.0, min(100.0, float(percent)))
            fields.append("percent = %s")
            params.append(normalized_percent)
        if payload_updates:
            fields.append("payload = payload || %s::jsonb")
            params.append(_json(dict(payload_updates)))
        params.extend((job_id, fence, worker_id))
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            claim = self._authoritative_claim(
                conn,
                job_id,
                worker_id,
                fence,
                statuses=("running", "cancel_requested"),
            )
            if not claim:
                conn.commit()
                return False
            cursor = conn.execute(
                f"""
                UPDATE ws_jobs SET {", ".join(fields)}
                WHERE id = %s AND fence = %s AND lease_owner = %s
                  AND status IN ('running', 'cancel_requested')
                  AND lease_expires_at >= NOW()
                """,
                tuple(params),
            )
            if cursor.rowcount == 1 and (stage is not None or normalized_percent is not None):
                self._event(
                    conn,
                    job_id,
                    "progress",
                    stage=stage or "",
                    percent=normalized_percent,
                    details={"message": message} if message is not None else {},
                )
            conn.commit()
        if cursor.rowcount == 1:
            self._record_progress(
                job_id=job_id,
                job_kind=str(claim["kind"]),
                project_id=claim["project_id"],
                percent=normalized_percent,
                previous_percent=claim.get("percent"),
            )
        return cursor.rowcount == 1

    def set_log_path(
        self,
        job_id: str,
        worker_id: str,
        fence: int,
        log_path: str,
    ) -> bool:
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            if not self._authoritative_claim(
                conn,
                job_id,
                worker_id,
                fence,
            ):
                conn.commit()
                return False
            cursor = conn.execute(
                """
                UPDATE ws_jobs
                SET log_path = %s, updated_at = NOW()
                WHERE id = %s AND fence = %s AND lease_owner = %s
                  AND status = 'running'
                  AND lease_expires_at >= NOW()
                """,
                (log_path, job_id, fence, worker_id),
            )
            conn.commit()
            return cursor.rowcount == 1

    def complete(
        self,
        job_id: str,
        worker_id: str,
        fence: int,
        *,
        result_path: str | None = None,
        result_digest: str | None = None,
        message: str = "Completed",
        details: Mapping[str, Any] | None = None,
        settle: Callable[[Any], Any] | None = None,
    ) -> bool:
        return self._complete(
            job_id, worker_id, fence, result_path=result_path, result_digest=result_digest,
            message=message, details=details, settle=settle,
        )

    def publish_partial_artifact(
        self,
        job_id: str,
        worker_id: str,
        fence: int,
        artifact: Mapping[str, Any],
        *,
        stage: str,
        message: str,
        percent: float,
        details: Mapping[str, Any] | None = None,
    ) -> bool:
        """Atomically register an immutable object and advance its fenced pointer."""

        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            if not self._authoritative_claim(
                conn,
                job_id,
                worker_id,
                fence,
            ):
                conn.commit()
                return False
            artifact_id = str(uuid.uuid4())
            cursor = conn.execute(
                """
                UPDATE ws_jobs
                SET result_path = %s, result_digest = %s,
                    result_metadata = %s::jsonb, stage = %s, message = %s,
                    percent = %s, updated_at = NOW()
                WHERE id = %s AND fence = %s AND lease_owner = %s
                  AND status = 'running'
                  AND lease_expires_at >= NOW()
                """,
                (
                    artifact["object_path"],
                    artifact["digest"],
                    _json(dict(details or {})),
                    stage,
                    message,
                    max(0.0, min(100.0, float(percent))),
                    job_id,
                    fence,
                    worker_id,
                ),
            )
            if cursor.rowcount == 1:
                job_artifact_records.insert_artifact(
                    conn,
                    artifact_id,
                    artifact,
                    job_id=job_id,
                    fence=fence,
                )
                self._event(
                    conn,
                    job_id,
                    "partial_published",
                    stage=stage,
                    percent=percent,
                    details={"digest": artifact["digest"], **dict(details or {})},
                )
            conn.commit()
            return cursor.rowcount == 1

    def publish_ended_result(
        self, job_id: str, artifact: Mapping[str, Any], *, expected_digest: str, details: Mapping[str, Any]
    ) -> bool:
        """Replace an ended (``failed``/``cancelled``) job's result without a fence, for
        end hooks: only while its result is still ``expected_digest``, so once."""

        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            row = conn.execute(
                """UPDATE ws_jobs SET result_path = %s, result_digest = %s, result_metadata = %s::jsonb,
                       updated_at = NOW()
                   WHERE id = %s AND status IN ('failed', 'cancelled') AND result_digest = %s
                   RETURNING fence""",
                (artifact["object_path"], artifact["digest"], _json(dict(details)), job_id, expected_digest),
            ).fetchone()
            if row is not None:
                job_artifact_records.insert_artifact(conn, str(uuid.uuid4()), artifact, job_id=job_id, fence=int(row["fence"]))
                self._event(conn, job_id, "ended_result_published", details={"digest": artifact["digest"]})
            conn.commit()
            return row is not None

    def active_job_ids(self, kind: str, *, requested_by: str, exclude_job_id: str = "") -> list[str]:
        """Ids of the kind's queued, running or retry_wait jobs one requester asked for."""

        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            rows = conn.execute(
                """SELECT id FROM ws_jobs
                   WHERE kind = %s AND requested_by = %s AND status IN ('queued', 'running', 'retry_wait')
                     AND id <> %s
                   ORDER BY created_at""",
                (kind, requested_by, exclude_job_id),
            ).fetchall()
        return [str(row["id"]) for row in rows]

    def ended_job_ids(self, kind: str, *, result_metadata: Mapping[str, Any], limit: int = 100) -> list[str]:
        """``failed``/``cancelled`` jobs of ``kind`` whose result metadata contains ``result_metadata``."""

        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            rows = conn.execute(
                """SELECT id FROM ws_jobs WHERE kind = %s AND status IN ('failed', 'cancelled')
                   AND result_metadata @> %s::jsonb ORDER BY updated_at DESC LIMIT %s""",
                (kind, _json(dict(result_metadata)), limit),
            ).fetchall()
        return [str(row["id"]) for row in rows]

    def register_fenced_artifacts(
        self,
        job_id: str,
        worker_id: str,
        fence: int,
        artifacts: Sequence[Mapping[str, Any]],
        *,
        allowed_statuses: Sequence[str] = ("running",),
    ) -> list[str] | None:
        """Register artifact rows mid-job and return their ids, in order.

        Release Studio needs the ``ws_artifacts`` row ids *before* it writes the
        build row, because ``ws_release_builds`` references them with
        ``ON DELETE RESTRICT``.  ``publish_partial_artifact`` registers rows but
        returns only a boolean, and ``complete_artifact`` would end the job
        early, so this is the seam between the two.

        Returns ``None`` when the caller's fence is no longer authoritative --
        that is what keeps a stale worker from making its artifact the record.
        """

        self.initialize()
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            if not self._authoritative_claim(
                conn, job_id, worker_id, fence, statuses=allowed_statuses
            ):
                conn.commit()
                return None
            artifact_ids = job_artifact_records.register_artifacts(
                conn, artifacts, job_id=job_id, fence=fence
            )
            if artifact_ids is None:
                conn.rollback()
                return None
            conn.commit()
            return artifact_ids

    def complete_artifact(
        self,
        job_id: str,
        worker_id: str,
        fence: int,
        artifact: Mapping[str, Any],
        *,
        extra_artifacts: Sequence[Mapping[str, Any]] = (),
        message: str = "Completed",
        details: Mapping[str, Any] | None = None,
        settle: Callable[[Any], Any] | None = None,
    ) -> bool:
        return self._complete(
            job_id, worker_id, fence, result_path=artifact["object_path"],
            result_digest=artifact["digest"], message=message, details=details,
            settle=settle, artifacts=(artifact, *extra_artifacts),
        )

    def _complete(
        self,
        job_id: str,
        worker_id: str,
        fence: int,
        *,
        result_path: str | None,
        result_digest: str | None,
        message: str,
        details: Mapping[str, Any] | None,
        settle: Callable[[Any], Any] | None,
        artifacts: Sequence[Mapping[str, Any]] = (),
    ) -> bool:
        """The one completion transaction.

        ``settle(conn)`` runs inside it, after the job row and its artifacts,
        so a feature row the handler settles commits with the job or not at
        all; a raise rolls the completion back and propagates. A completed job
        carries no error: an earlier attempt's ``error_code`` and
        ``error_message`` are cleared.
        """

        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            claim = self._authoritative_claim(conn, job_id, worker_id, fence)
            if not claim:
                conn.commit()
                return False
            cursor = conn.execute(
                """
                UPDATE ws_jobs
                SET status = 'completed', stage = 'completed', message = %s,
                    percent = 100, result_path = %s, result_digest = %s,
                    result_metadata = %s::jsonb, completed_at = NOW(),
                    error_code = '', error_message = '',
                    heartbeat_at = NOW(), lease_owner = '',
                    lease_expires_at = NULL, updated_at = NOW()
                WHERE id = %s AND fence = %s AND lease_owner = %s
                  AND status = 'running'
                  AND lease_expires_at >= NOW()
                """,
                (message, result_path, result_digest, _json(dict(details or {})), job_id, fence, worker_id),
            )
            if cursor.rowcount == 1:
                for artifact in artifacts:
                    job_artifact_records.insert_artifact(conn, str(uuid.uuid4()), artifact, job_id=job_id, fence=fence)
                if settle is not None:
                    try:
                        settle(conn)
                    except BaseException:
                        conn.rollback()
                        raise
                job_claims.release_claims(conn, job_id, fence)
                event = dict(details or {})
                if artifacts:
                    event = {"digest": artifacts[0]["digest"], **event}
                self._event(conn, job_id, "completed", details=event)
            conn.commit()
        if cursor.rowcount == 1:
            self._record_finished(
                job_id=job_id,
                job_kind=str(claim["kind"]),
                project_id=claim["project_id"],
                state="completed",
            )
        return cursor.rowcount == 1

    def get_artifact_for_job_digest(
        self,
        job_id: str,
        digest: str,
        *,
        touch: bool = True,
    ) -> dict[str, Any] | None:
        """Resolve one registered sidecar under the job's authoritative fence."""

        self.initialize()
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            row = job_artifact_records.artifact_for_job_digest(conn, job_id, digest)
            if row and touch:
                job_artifact_records.touch_artifact(conn, row["id"])
                conn.commit()
        return _decode_artifact(row) if row else None

    def fail(
        self,
        job_id: str,
        worker_id: str,
        fence: int,
        *,
        error_code: str,
        error_message: str,
        transient: bool = False,
        retry_after_seconds: int = 5,
    ) -> str | None:
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            row = self._authoritative_claim(
                conn,
                job_id,
                worker_id,
                fence,
                statuses=("running", "cancel_requested"),
            )
            if not row:
                conn.commit()
                return None
            cancelling = str(row["status"]) == "cancel_requested"
            retry = (
                not cancelling
                and transient
                and int(row["attempt"]) < int(row["max_attempts"])
            )
            status = "cancelled" if cancelling else "retry_wait" if retry else "failed"
            conn.execute(
                """
                UPDATE ws_jobs
                SET status = %s, stage = %s, message = %s,
                    error_code = %s, error_message = %s,
                    available_at = CASE
                        WHEN %s THEN NOW() + (%s * INTERVAL '1 second')
                        ELSE available_at
                    END,
                    completed_at = CASE WHEN %s THEN NULL ELSE NOW() END,
                    lease_owner = '', lease_expires_at = NULL, updated_at = NOW()
                WHERE id = %s AND fence = %s AND lease_owner = %s
                  AND status = %s
                """,
                (
                    status,
                    status,
                    "Cancelled" if cancelling else "Retry scheduled" if retry else "Failed",
                    error_code,
                    error_message,
                    retry,
                    max(0, int(retry_after_seconds)),
                    retry,
                    job_id,
                    fence,
                    worker_id,
                    row["status"],
                ),
            )
            job_claims.release_claims(conn, job_id, fence)
            self._event(
                conn,
                job_id,
                "cancelled" if cancelling else "retry_scheduled" if retry else "failed",
                details={"error_code": error_code, "error_message": error_message},
            )
            conn.commit()
        if status in {"failed", "cancelled"}:
            self._record_finished(
                job_id=job_id,
                job_kind=str(row["kind"]),
                project_id=row["project_id"],
                state=status,
            )
        return status

    def request_cancel(self, job_id: str, *, requested_by: str = "") -> str | None:
        self.initialize()
        finished = False
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            row = conn.execute(
                "SELECT status, fence, kind, project_id FROM ws_jobs WHERE id = %s FOR UPDATE",
                (job_id,),
            ).fetchone()
            if not row:
                conn.commit()
                return None
            status = str(row["status"])
            if status in TERMINAL_STATUSES:
                conn.commit()
                return status
            if status in {"queued", "retry_wait"}:
                status = "cancelled"
                conn.execute(
                    """
                    UPDATE ws_jobs
                    SET status = 'cancelled', stage = 'cancelled',
                        message = 'Cancelled before execution',
                        cancel_requested_at = NOW(), completed_at = NOW(),
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (job_id,),
                )
                job_claims.release_claims(conn, job_id, int(row["fence"] or 0))
                event_type = "cancelled"
                finished = True
            else:
                status = "cancel_requested"
                conn.execute(
                    """
                    UPDATE ws_jobs
                    SET status = 'cancel_requested', stage = 'cancelling',
                        message = 'Cancellation requested',
                        cancel_requested_at = NOW(), updated_at = NOW()
                    WHERE id = %s AND status = 'running'
                    """,
                    (job_id,),
                )
                event_type = "cancel_requested"
            self._event(
                conn,
                job_id,
                event_type,
                details={"requested_by": requested_by},
            )
            conn.commit()
        if finished:
            self._record_finished(
                job_id=job_id,
                job_kind=str(row["kind"]),
                project_id=row["project_id"],
                state="cancelled",
            )
        return status

    def requeue(self, job_id: str, *, requested_by: str = "") -> dict[str, Any]:
        """Reset a failed or lease-expired job to ``queued`` (ADR §11, D21).

        Raises ``job_requeue.JobNotFound`` for an unknown job and
        ``job_requeue.JobNotRequeueable`` when the job's state or live lease
        forbids it. The transaction itself lives in ``job_requeue`` so this
        module stays inside its line budget.
        """

        self.initialize()
        return job_requeue.requeue(self, job_id, requested_by=requested_by)

    def finalize_cancel(
        self,
        job_id: str,
        worker_id: str,
        fence: int,
        *,
        message: str = "Cancelled",
    ) -> bool:
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            claim = self._authoritative_claim(
                conn,
                job_id,
                worker_id,
                fence,
                statuses=("running", "cancel_requested"),
            )
            if not claim:
                conn.commit()
                return False
            cursor = conn.execute(
                """
                UPDATE ws_jobs
                SET status = 'cancelled', stage = 'cancelled', message = %s,
                    completed_at = NOW(), heartbeat_at = NOW(),
                    lease_owner = '', lease_expires_at = NULL, updated_at = NOW()
                WHERE id = %s AND fence = %s AND lease_owner = %s
                  AND status IN ('running', 'cancel_requested')
                  AND lease_expires_at >= NOW()
                """,
                (message, job_id, fence, worker_id),
            )
            if cursor.rowcount == 1:
                job_claims.release_claims(conn, job_id, fence)
                self._event(conn, job_id, "cancelled")
            conn.commit()
        if cursor.rowcount == 1:
            self._record_finished(
                job_id=job_id,
                job_kind=str(claim["kind"]),
                project_id=claim["project_id"],
                state="cancelled",
            )
        return cursor.rowcount == 1

    def get(self, job_id: str) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            row = conn.execute("SELECT * FROM ws_jobs WHERE id = %s", (job_id,)).fetchone()
        return self._decode(row) if row else None

    def get_artifact_for_job(
        self,
        job_id: str,
        *,
        touch: bool = True,
    ) -> dict[str, Any] | None:
        """Return the authoritative artifact for a completed fenced execution."""

        self.initialize()
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            row = job_artifact_records.artifact_for_job(conn, job_id)
            if row and touch:
                job_artifact_records.touch_artifact(conn, row["id"])
                conn.commit()
        return _decode_artifact(row) if row else None

    def list_ready_artifacts(self, *, limit: int = 1000) -> list[dict[str, Any]]:
        """List live artifact metadata, including partials and registered sidecars."""

        self.initialize()
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            rows = job_artifact_records.list_ready_artifacts(conn, limit=limit)
        return [_decode_artifact(row) for row in rows]

    def prune_artifact_metadata(
        self,
        *,
        retention_seconds: int = 30 * 24 * 60 * 60,
        partial_retention_seconds: int = 24 * 60 * 60,
        invalid_retention_seconds: int = 24 * 60 * 60,
    ) -> int:
        """Drop expired metadata as a fenced group so filesystem GC can reclaim it."""

        self.initialize()
        with self._connect() as conn:
            self._set_workspace_search_path(conn)
            pruned = job_artifact_records.prune_artifact_metadata(
                conn,
                retention_seconds=retention_seconds,
                partial_retention_seconds=partial_retention_seconds,
                invalid_retention_seconds=invalid_retention_seconds,
            )
            conn.commit()
        return pruned

    def invalidate_artifact(self, artifact_id: str, *, reason: str) -> bool:
        """Invalidate a missing/corrupt artifact without changing its source job."""

        self.initialize()
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            invalidated = job_artifact_records.invalidate_artifact(
                conn, artifact_id, reason=reason, record_event=self._event
            )
            conn.commit()
        return invalidated

    def referenced_object_paths(self) -> set[str]:
        """Return live object paths, including indefinitely pinned artifacts."""

        self.initialize()
        with self._connect() as conn:
            self._set_workspace_search_path(conn)
            return job_artifact_records.referenced_object_paths(conn)

    def active_execution_keys(self) -> set[tuple[str, int]]:
        """Return job/fence pairs whose staging directories may still be in use."""

        self.initialize()
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            rows = conn.execute(
                """
                SELECT id, fence
                FROM ws_jobs
                WHERE status IN ('running', 'cancel_requested')
                """
            ).fetchall()
        return {(str(row["id"]), int(row["fence"] or 0)) for row in rows}

    def benchmark_snapshot(self, *, since: datetime) -> dict[str, Any]:
        """Aggregate queue and write-rate metrics without reading artifact payloads."""

        self.initialize()
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            return job_benchmark.benchmark_snapshot(conn, since=since)

    def events(self, job_id: str, *, after: int = 0, limit: int = 200) -> list[dict[str, Any]]:
        self.initialize()
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            rows = conn.execute(
                """
                SELECT id, event_type, stage, percent, details, created_at
                FROM ws_job_events
                WHERE job_id = %s AND id > %s
                ORDER BY id
                LIMIT %s
                """,
                (job_id, max(0, int(after)), max(1, min(1000, int(limit)))),
            ).fetchall()
        return [
            {
                "id": int(row["id"]),
                "event_type": row["event_type"],
                "stage": row["stage"],
                "percent": row["percent"],
                "details": _loads(row["details"], {}),
                "created_at": _timestamp(row["created_at"]),
            }
            for row in rows
        ]

    @staticmethod
    def _event(
        conn: Any,
        job_id: str,
        event_type: str,
        *,
        stage: str = "",
        percent: float | None = None,
        details: Mapping[str, Any] | None = None,
    ) -> None:
        conn.execute(
            """
            INSERT INTO ws_job_events(job_id, event_type, stage, percent, details)
            VALUES (%s, %s, %s, %s, %s::jsonb)
            """,
            (job_id, event_type, stage, percent, _json(dict(details or {}))),
        )

    _decode = staticmethod(decode_job)


jobs = JobService()
