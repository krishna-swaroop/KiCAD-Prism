from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from app.services.postgres_database import database
from app.services.workspace_service import workspace


ACTIVE_STATUSES = frozenset({"queued", "running", "retry_wait", "cancel_requested"})
TERMINAL_STATUSES = frozenset({"completed", "failed", "cancelled"})
CLAIMABLE_STATUSES = frozenset({"queued", "retry_wait", "running"})
LOCK_MODES = frozenset({"read", "write"})


def _json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def _loads(value: Any, default: Any) -> Any:
    if value is None or value == "":
        return default
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(str(value))
    except (TypeError, ValueError):
        return default


def _timestamp(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()
    return str(value)


class JobService:
    """Fenced PostgreSQL job queue shared by all Prism worker pools."""

    def initialize(self) -> None:
        workspace.initialize()

    @staticmethod
    def _connect():
        return database.connection()

    @staticmethod
    def _normalize_resources(resources: Mapping[str, int] | None) -> dict[str, int]:
        normalized: dict[str, int] = {}
        for name, count in (resources or {}).items():
            key = str(name).strip()
            value = int(count)
            if not key or value < 1:
                raise ValueError("Resource requirements must use non-empty names and positive counts")
            normalized[key] = value
        return normalized

    @staticmethod
    def _normalize_locks(
        locks: Sequence[Mapping[str, str]] | None,
    ) -> list[dict[str, str]]:
        normalized: dict[str, str] = {}
        for requirement in locks or ():
            key = str(requirement.get("key") or "").strip()
            mode = str(requirement.get("mode") or "").strip().lower()
            if not key or mode not in LOCK_MODES:
                raise ValueError("Lock requirements need a non-empty key and read/write mode")
            previous = normalized.get(key)
            normalized[key] = "write" if mode == "write" or previous == "write" else "read"
        return [{"key": key, "mode": normalized[key]} for key in sorted(normalized)]

    @staticmethod
    def _artifact_file_valid(row: Mapping[str, Any]) -> tuple[bool, str]:
        """Validate a cache pointer before returning it as an authoritative hit."""

        path = Path(str(row.get("cache_object_path") or ""))
        try:
            stat = path.stat()
        except OSError:
            return False, "object_missing"
        if not path.is_file():
            return False, "object_not_file"
        expected_size = int(row.get("cache_size_bytes") or 0)
        if stat.st_size != expected_size:
            return False, "object_size_mismatch"
        expected_digest = str(row.get("cache_digest") or "")
        if len(expected_digest) != 64:
            return False, "object_digest_missing"
        digest = hashlib.sha256()
        try:
            with path.open("rb") as handle:
                while chunk := handle.read(1024 * 1024):
                    digest.update(chunk)
        except OSError:
            return False, "object_unreadable"
        if digest.hexdigest() != expected_digest:
            return False, "object_digest_mismatch"
        return True, ""

    def configure_resource_slots(self, capacities: Mapping[str, int]) -> None:
        """Reconcile configured slot rows without evicting active leases."""

        self.initialize()
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            for resource_name, raw_capacity in sorted(capacities.items()):
                capacity = int(raw_capacity)
                if capacity < 0:
                    raise ValueError("Resource capacity cannot be negative")
                conn.execute(
                    "SELECT pg_advisory_xact_lock(hashtext(%s))",
                    (f"prism-resource:{resource_name}",),
                )
                for slot_number in range(1, capacity + 1):
                    conn.execute(
                        """
                        INSERT INTO ws_job_resource_slots(resource_name, slot_number)
                        VALUES (%s, %s)
                        ON CONFLICT (resource_name, slot_number) DO NOTHING
                        """,
                        (resource_name, slot_number),
                    )
                conn.execute(
                    """
                    DELETE FROM ws_job_resource_slots
                    WHERE resource_name = %s AND slot_number > %s AND job_id IS NULL
                    """,
                    (resource_name, capacity),
                )
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
        resource_requirements = self._normalize_resources(resources)
        lock_requirements = self._normalize_locks(locks)
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
                cached = conn.execute(
                    """
                    SELECT job.*, artifact.id AS cache_artifact_id,
                           artifact.object_path AS cache_object_path,
                           artifact.digest AS cache_digest,
                           artifact.size_bytes AS cache_size_bytes
                    FROM ws_artifacts artifact
                    JOIN ws_jobs job
                      ON job.id = artifact.source_job_id
                     AND job.fence = artifact.source_fence
                    WHERE artifact.kind = %s
                      AND artifact.artifact_key = %s
                      AND artifact.readiness = 'ready'
                      AND artifact.invalidated_at IS NULL
                      AND job.status = 'completed'
                    ORDER BY artifact.created_at DESC
                    LIMIT 1
                    """,
                    (normalized_kind, normalized_artifact),
                ).fetchone()
                if cached:
                    valid, invalid_reason = self._artifact_file_valid(cached)
                    if valid:
                        conn.execute(
                            """
                            UPDATE ws_artifacts
                            SET last_accessed_at = NOW()
                            WHERE id = %s
                            """,
                            (cached["cache_artifact_id"],),
                        )
                        self._event(
                            conn,
                            str(cached["id"]),
                            "cache_hit",
                            details={"requested_by": requested_by},
                        )
                        conn.commit()
                        result = self._decode(cached)
                        result["deduplicated"] = False
                        result["cache_hit"] = True
                        return result
                    conn.execute(
                        """
                        UPDATE ws_artifacts
                        SET invalidated_at = COALESCE(invalidated_at, NOW()),
                            readiness = 'invalid'
                        WHERE id = %s
                        """,
                        (cached["cache_artifact_id"],),
                    )
                    self._event(
                        conn,
                        str(cached["id"]),
                        "artifact_invalidated",
                        details={
                            "artifact_id": str(cached["cache_artifact_id"]),
                            "reason": invalid_reason,
                            "detected_by": "enqueue",
                        },
                    )

            row = conn.execute(
                """
                INSERT INTO ws_jobs (
                    id, kind, worker_pool, status, message, percent, payload,
                    priority, artifact_key, project_id, repository_id,
                    requested_by, max_attempts, resource_requirements,
                    lock_requirements, created_at, updated_at, available_at
                ) VALUES (
                    %s, %s, %s, 'queued', 'Queued', 0, %s::jsonb,
                    %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb,
                    NOW(), NOW(), NOW()
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
            self._finalize_expired_cancellations(conn, worker_pool)
            self._release_non_authoritative_claims(conn)
            conn.commit()
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
                resources = self._normalize_resources(
                    _loads(row["resource_requirements"], {})
                )
                locks = self._normalize_locks(_loads(row["lock_requirements"], []))
                old_status = str(row["status"])
                reclaim_job_id = job_id if old_status == "running" else None
                chosen_slots = self._find_slots(
                    conn,
                    resources,
                    reclaim_job_id=reclaim_job_id,
                )
                if chosen_slots is None or not self._locks_available(conn, job_id, locks):
                    conn.commit()
                    continue

                old_fence = int(row["fence"] or 0)
                fence = old_fence + 1
                conn.execute(
                    """
                    UPDATE ws_job_resource_slots
                    SET job_id = NULL, fence = NULL, lease_owner = '',
                        lease_expires_at = NULL, updated_at = NOW()
                    WHERE job_id = %s
                    """,
                    (job_id,),
                )
                conn.execute("DELETE FROM ws_job_locks WHERE job_id = %s", (job_id,))
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
                self._assign_slots(
                    conn,
                    chosen_slots,
                    job_id=job_id,
                    fence=fence,
                    worker_id=worker_id,
                    lease_seconds=lease_seconds,
                )
                self._assign_locks(
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

    @staticmethod
    def _find_slots(
        conn: Any,
        resources: Mapping[str, int],
        *,
        reclaim_job_id: str | None = None,
    ) -> dict[str, list[int]] | None:
        selected: dict[str, list[int]] = {}
        for resource_name, count in sorted(resources.items()):
            rows = conn.execute(
                """
                SELECT slot_number
                FROM ws_job_resource_slots
                WHERE resource_name = %s
                  AND (job_id IS NULL OR job_id = %s)
                ORDER BY slot_number
                FOR UPDATE SKIP LOCKED
                LIMIT %s
                """,
                (resource_name, reclaim_job_id, count),
            ).fetchall()
            numbers = [int(row["slot_number"]) for row in rows]
            if len(numbers) != count:
                return None
            selected[resource_name] = numbers
        return selected

    @staticmethod
    def _locks_available(
        conn: Any,
        job_id: str,
        requirements: Sequence[Mapping[str, str]],
    ) -> bool:
        for requirement in requirements:
            lock_key = str(requirement["key"])
            mode = str(requirement["mode"])
            conn.execute(
                "SELECT pg_advisory_xact_lock(hashtext(%s))",
                (f"prism-job-lock:{lock_key}",),
            )
            if mode == "read":
                conflict = conn.execute(
                    """
                    SELECT 1 FROM ws_job_locks
                    WHERE lock_key = %s AND job_id <> %s AND mode = 'write'
                    LIMIT 1
                    """,
                    (lock_key, job_id),
                ).fetchone()
            else:
                conflict = conn.execute(
                    """
                    SELECT 1 FROM ws_job_locks
                    WHERE lock_key = %s AND job_id <> %s
                    LIMIT 1
                    """,
                    (lock_key, job_id),
                ).fetchone()
            if conflict:
                return False
        return True

    @staticmethod
    def _release_non_authoritative_claims(conn: Any) -> None:
        """Release only claims whose owning job has already lost authority."""

        conn.execute(
            """
            UPDATE ws_job_resource_slots slot
            SET job_id = NULL, fence = NULL, lease_owner = '',
                lease_expires_at = NULL, updated_at = NOW()
            FROM ws_jobs job
            WHERE slot.job_id = job.id
              AND (
                job.status IN ('completed', 'failed', 'cancelled')
                OR slot.fence IS DISTINCT FROM job.fence
                OR slot.lease_owner IS DISTINCT FROM job.lease_owner
              )
            """
        )
        conn.execute(
            """
            DELETE FROM ws_job_locks lock
            USING ws_jobs job
            WHERE lock.job_id = job.id
              AND (
                job.status IN ('completed', 'failed', 'cancelled')
                OR lock.fence IS DISTINCT FROM job.fence
                OR lock.lease_owner IS DISTINCT FROM job.lease_owner
              )
            """
        )

    def _finalize_expired_cancellations(self, conn: Any, worker_pool: str) -> None:
        """Fence dead cancelling attempts so they cannot block dedup or resources."""

        rows = conn.execute(
            """
            SELECT id, fence
            FROM ws_jobs
            WHERE worker_pool = %s
              AND status = 'cancel_requested'
              AND lease_expires_at IS NOT NULL
              AND lease_expires_at < NOW()
            ORDER BY created_at, id
            FOR UPDATE SKIP LOCKED
            LIMIT 128
            """,
            (worker_pool,),
        ).fetchall()
        for row in rows:
            job_id = str(row["id"])
            old_fence = int(row["fence"] or 0)
            conn.execute(
                """
                UPDATE ws_jobs
                SET status = 'cancelled', stage = 'cancelled',
                    message = 'Cancelled after worker lease expired',
                    fence = fence + 1, completed_at = NOW(),
                    heartbeat_at = NOW(), lease_owner = '',
                    lease_expires_at = NULL, updated_at = NOW()
                WHERE id = %s AND fence = %s AND status = 'cancel_requested'
                """,
                (job_id, old_fence),
            )
            self._release_claims(conn, job_id, old_fence)
            self._event(
                conn,
                job_id,
                "cancelled_after_lease_expiry",
                details={"previous_fence": old_fence, "fence": old_fence + 1},
            )

    @staticmethod
    def _assign_slots(
        conn: Any,
        slots: Mapping[str, Iterable[int]],
        *,
        job_id: str,
        fence: int,
        worker_id: str,
        lease_seconds: int,
    ) -> None:
        for resource_name, numbers in slots.items():
            for slot_number in numbers:
                conn.execute(
                    """
                    UPDATE ws_job_resource_slots
                    SET job_id = %s, fence = %s, lease_owner = %s,
                        lease_expires_at = NOW() + (%s * INTERVAL '1 second'),
                        updated_at = NOW()
                    WHERE resource_name = %s AND slot_number = %s
                    """,
                    (job_id, fence, worker_id, lease_seconds, resource_name, slot_number),
                )

    @staticmethod
    def _assign_locks(
        conn: Any,
        requirements: Sequence[Mapping[str, str]],
        *,
        job_id: str,
        fence: int,
        worker_id: str,
        lease_seconds: int,
    ) -> None:
        for requirement in requirements:
            conn.execute(
                """
                INSERT INTO ws_job_locks(
                    lock_key, job_id, fence, mode, lease_owner, lease_expires_at
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    NOW() + (%s * INTERVAL '1 second')
                )
                """,
                (
                    requirement["key"],
                    job_id,
                    fence,
                    requirement["mode"],
                    worker_id,
                    lease_seconds,
                ),
            )

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

        resources = self._normalize_resources(
            _loads(row["resource_requirements"], {})
        )
        for resource_name, expected_count in resources.items():
            held = conn.execute(
                """
                SELECT COUNT(*) AS held
                FROM ws_job_resource_slots
                WHERE resource_name = %s
                  AND job_id = %s
                  AND fence = %s
                  AND lease_owner = %s
                  AND lease_expires_at >= NOW()
                """,
                (resource_name, job_id, fence, worker_id),
            ).fetchone()
            if int((held or {}).get("held") or 0) != expected_count:
                return None

        locks = self._normalize_locks(_loads(row["lock_requirements"], []))
        for requirement in locks:
            held = conn.execute(
                """
                SELECT 1
                FROM ws_job_locks
                WHERE lock_key = %s
                  AND job_id = %s
                  AND fence = %s
                  AND lease_owner = %s
                  AND mode = %s
                  AND lease_expires_at >= NOW()
                """,
                (
                    requirement["key"],
                    job_id,
                    fence,
                    worker_id,
                    requirement["mode"],
                ),
            ).fetchone()
            if not held:
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
                conn.execute(
                    """
                    UPDATE ws_job_resource_slots
                    SET lease_expires_at = NOW() + (%s * INTERVAL '1 second'),
                        updated_at = NOW()
                    WHERE job_id = %s AND fence = %s AND lease_owner = %s
                    """,
                    (lease_seconds, job_id, fence, worker_id),
                )
                conn.execute(
                    """
                    UPDATE ws_job_locks
                    SET lease_expires_at = NOW() + (%s * INTERVAL '1 second'),
                        updated_at = NOW()
                    WHERE job_id = %s AND fence = %s AND lease_owner = %s
                    """,
                    (lease_seconds, job_id, fence, worker_id),
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
            if not self._authoritative_claim(
                conn,
                job_id,
                worker_id,
                fence,
                statuses=("running", "cancel_requested"),
            ):
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
                SET status = 'completed', stage = 'completed', message = %s,
                    percent = 100, result_path = %s, result_digest = %s,
                    result_metadata = %s::jsonb,
                    completed_at = NOW(), heartbeat_at = NOW(),
                    lease_owner = '', lease_expires_at = NULL, updated_at = NOW()
                WHERE id = %s AND fence = %s AND lease_owner = %s
                  AND status = 'running'
                  AND lease_expires_at >= NOW()
                """,
                (
                    message,
                    result_path,
                    result_digest,
                    _json(dict(details or {})),
                    job_id,
                    fence,
                    worker_id,
                ),
            )
            if cursor.rowcount == 1:
                self._release_claims(conn, job_id, fence)
                self._event(conn, job_id, "completed", details=dict(details or {}))
            conn.commit()
            return cursor.rowcount == 1

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
                self._insert_artifact(
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
            artifact_id = str(uuid.uuid4())
            cursor = conn.execute(
                """
                UPDATE ws_jobs
                SET status = 'completed', stage = 'completed', message = %s,
                    percent = 100, result_path = %s, result_digest = %s,
                    result_metadata = %s::jsonb, completed_at = NOW(),
                    heartbeat_at = NOW(), lease_owner = '',
                    lease_expires_at = NULL, updated_at = NOW()
                WHERE id = %s AND fence = %s AND lease_owner = %s
                  AND status = 'running'
                  AND lease_expires_at >= NOW()
                """,
                (
                    message,
                    artifact["object_path"],
                    artifact["digest"],
                    _json(dict(details or {})),
                    job_id,
                    fence,
                    worker_id,
                ),
            )
            if cursor.rowcount == 1:
                self._insert_artifact(
                    conn,
                    artifact_id,
                    artifact,
                    job_id=job_id,
                    fence=fence,
                )
                for extra_artifact in extra_artifacts:
                    self._insert_artifact(
                        conn,
                        str(uuid.uuid4()),
                        extra_artifact,
                        job_id=job_id,
                        fence=fence,
                    )
                if artifact.get("kind") == "webgpu_3d":
                    self._upsert_webgpu_ready(
                        conn,
                        job_id=job_id,
                        fence=fence,
                        details=dict(details or {}),
                    )
                self._release_claims(conn, job_id, fence)
                self._event(
                    conn,
                    job_id,
                    "completed",
                    details={"digest": artifact["digest"], **dict(details or {})},
                )
            conn.commit()
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
            row = conn.execute(
                """
                SELECT artifact.*
                FROM ws_jobs job
                JOIN ws_artifacts artifact
                  ON artifact.source_job_id = job.id
                 AND artifact.source_fence = job.fence
                WHERE job.id = %s
                  AND job.status = 'completed'
                  AND artifact.digest = %s
                  AND artifact.invalidated_at IS NULL
                ORDER BY artifact.created_at DESC
                LIMIT 1
                """,
                (job_id, digest),
            ).fetchone()
            if row and touch:
                conn.execute(
                    "UPDATE ws_artifacts SET last_accessed_at = NOW() WHERE id = %s",
                    (row["id"],),
                )
                conn.commit()
        return self._decode_artifact(row) if row else None

    @staticmethod
    def _insert_artifact(
        conn: Any,
        artifact_id: str,
        artifact: Mapping[str, Any],
        *,
        job_id: str,
        fence: int,
    ) -> None:
        conn.execute(
            """
            INSERT INTO ws_artifacts (
                id, kind, artifact_key, digest, object_path, media_type,
                size_bytes, schema_version, generator_version, readiness,
                source_job_id, source_fence
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (kind, artifact_key, digest)
            DO UPDATE SET last_accessed_at = NOW(),
                readiness = EXCLUDED.readiness,
                source_job_id = EXCLUDED.source_job_id,
                source_fence = EXCLUDED.source_fence
            """,
            (
                artifact_id,
                artifact["kind"],
                artifact["artifact_key"],
                artifact["digest"],
                artifact["object_path"],
                artifact.get("media_type") or "application/octet-stream",
                int(artifact.get("size_bytes") or 0),
                artifact.get("schema_version") or "",
                artifact.get("generator_version") or "",
                artifact.get("readiness") or "ready",
                job_id,
                fence,
            ),
        )

    @staticmethod
    def _upsert_webgpu_ready(
        conn: Any,
        *,
        job_id: str,
        fence: int,
        details: Mapping[str, Any],
    ) -> None:
        project_id = str(details.get("project_id") or "")
        selector_key = str(details.get("status_selector") or "")
        generator_build = str(details.get("build_fingerprint") or "")
        source_revision_key = str(
            details.get("sourceRevisionKey")
            or details.get("source_fingerprint")
            or ""
        )
        bundle_url = str(details.get("bundle_url") or "")
        if not all(
            (
                project_id,
                selector_key,
                generator_build,
                source_revision_key,
                bundle_url,
            )
        ):
            return
        status_keys = (
            "schema",
            "project_id",
            "source_fingerprint",
            "sourceRevisionKey",
            "build_fingerprint",
            "generator",
            "artifactScope",
            "status",
            "available",
            "bundle_url",
            "readiness",
            "generated_at",
            "capabilities",
            "commit",
            "project_path",
            "source_tree_fingerprint",
        )
        status_payload = {
            key: details[key]
            for key in status_keys
            if key in details
        }
        status_payload["status_selector"] = selector_key
        conn.execute(
            """
            INSERT INTO ws_webgpu_ready(
                project_id, selector_key, generator_build,
                source_revision_key, bundle_url, status_payload,
                source_job_id, source_fence
            ) VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s)
            ON CONFLICT(project_id, selector_key, generator_build)
            DO UPDATE SET
                source_revision_key = EXCLUDED.source_revision_key,
                bundle_url = EXCLUDED.bundle_url,
                status_payload = EXCLUDED.status_payload,
                source_job_id = EXCLUDED.source_job_id,
                source_fence = EXCLUDED.source_fence,
                created_at = NOW(),
                last_accessed_at = NOW(),
                invalidated_at = NULL
            WHERE (
                    (
                        EXCLUDED.source_job_id = ws_webgpu_ready.source_job_id
                        AND EXCLUDED.source_fence >= ws_webgpu_ready.source_fence
                    )
                    OR (
                        SELECT created_at
                        FROM ws_jobs
                        WHERE id = EXCLUDED.source_job_id
                    ) > (
                        SELECT created_at
                        FROM ws_jobs
                        WHERE id = ws_webgpu_ready.source_job_id
                    )
                  )
              AND (
                    ws_webgpu_ready.invalidated_at IS NULL
                    OR (
                        SELECT created_at
                        FROM ws_jobs
                        WHERE id = EXCLUDED.source_job_id
                    ) > ws_webgpu_ready.invalidated_at
                  )
            """,
            (
                project_id,
                selector_key,
                generator_build,
                source_revision_key,
                bundle_url,
                _json(status_payload),
                job_id,
                fence,
            ),
        )

    def get_webgpu_ready(
        self,
        project_id: str,
        selector_key: str,
        generator_build: str,
    ) -> dict[str, Any] | None:
        """Read WebGPU readiness from PostgreSQL without touching bundle files."""

        self.initialize()
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            row = conn.execute(
                """
                UPDATE ws_webgpu_ready
                SET last_accessed_at = NOW()
                WHERE project_id = %s
                  AND selector_key = %s
                  AND generator_build = %s
                  AND invalidated_at IS NULL
                RETURNING status_payload
                """,
                (project_id, selector_key, generator_build),
            ).fetchone()
            conn.commit()
        if not row:
            return None
        return _loads(row["status_payload"], {})

    def upsert_webgpu_ready_status(
        self,
        *,
        job_id: str,
        fence: int,
        details: Mapping[str, Any],
    ) -> None:
        """Publish staged or completed WebGPU readiness for O(1) status reads."""

        self.initialize()
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            self._upsert_webgpu_ready(
                conn,
                job_id=job_id,
                fence=fence,
                details=details,
            )
            conn.commit()

    def find_webgpu_ready_by_commit_prefix(
        self,
        project_id: str,
        generator_build: str,
        commit_prefix: str,
    ) -> dict[str, Any] | None:
        """Resolve readiness for an abbreviated SHA without calling git."""

        normalized = commit_prefix.strip().lower()
        if not re.fullmatch(r"[0-9a-f]{7,40}", normalized):
            return None
        self.initialize()
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            row = conn.execute(
                """
                UPDATE ws_webgpu_ready
                SET last_accessed_at = NOW()
                WHERE (project_id, selector_key, generator_build) = (
                    SELECT project_id, selector_key, generator_build
                    FROM ws_webgpu_ready
                    WHERE project_id = %s
                      AND generator_build = %s
                      AND invalidated_at IS NULL
                      AND (
                        selector_key = %s
                        OR lower(COALESCE(status_payload->>'commit', '')) LIKE %s
                      )
                    ORDER BY
                        CASE WHEN selector_key = %s THEN 0 ELSE 1 END,
                        created_at DESC
                    LIMIT 1
                    FOR UPDATE
                )
                RETURNING status_payload
                """,
                (
                    project_id,
                    generator_build,
                    f"commit:{normalized}",
                    f"{normalized}%",
                    f"commit:{normalized}",
                ),
            ).fetchone()
            conn.commit()
        if not row:
            return None
        return _loads(row["status_payload"], {})

    def invalidate_webgpu_ready(
        self,
        project_id: str,
        selector_key: str,
        generator_build: str,
    ) -> bool:
        self.initialize()
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            cursor = conn.execute(
                """
                UPDATE ws_webgpu_ready
                SET invalidated_at = COALESCE(invalidated_at, NOW())
                WHERE project_id = %s
                  AND selector_key = %s
                  AND generator_build = %s
                  AND invalidated_at IS NULL
                """,
                (project_id, selector_key, generator_build),
            )
            conn.commit()
        return cursor.rowcount == 1

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
            self._release_claims(conn, job_id, fence)
            self._event(
                conn,
                job_id,
                "cancelled" if cancelling else "retry_scheduled" if retry else "failed",
                details={"error_code": error_code, "error_message": error_message},
            )
            conn.commit()
            return status

    def request_cancel(self, job_id: str, *, requested_by: str = "") -> str | None:
        self.initialize()
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            row = conn.execute(
                "SELECT status, fence FROM ws_jobs WHERE id = %s FOR UPDATE",
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
                self._release_claims(conn, job_id, int(row["fence"] or 0))
                event_type = "cancelled"
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
            return status

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
            if not self._authoritative_claim(
                conn,
                job_id,
                worker_id,
                fence,
                statuses=("running", "cancel_requested"),
            ):
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
                self._release_claims(conn, job_id, fence)
                self._event(conn, job_id, "cancelled")
            conn.commit()
            return cursor.rowcount == 1

    @staticmethod
    def _release_claims(conn: Any, job_id: str, fence: int) -> None:
        conn.execute(
            """
            UPDATE ws_job_resource_slots
            SET job_id = NULL, fence = NULL, lease_owner = '',
                lease_expires_at = NULL, updated_at = NOW()
            WHERE job_id = %s AND fence = %s
            """,
            (job_id, fence),
        )
        conn.execute(
            "DELETE FROM ws_job_locks WHERE job_id = %s AND fence = %s",
            (job_id, fence),
        )

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
            row = conn.execute(
                """
                SELECT artifact.*
                FROM ws_jobs job
                JOIN ws_artifacts artifact
                  ON artifact.source_job_id = job.id
                 AND artifact.source_fence = job.fence
                WHERE job.id = %s
                  AND job.status = 'completed'
                  AND artifact.readiness = 'ready'
                  AND artifact.invalidated_at IS NULL
                ORDER BY artifact.created_at DESC
                LIMIT 1
                """,
                (job_id,),
            ).fetchone()
            if row and touch:
                conn.execute(
                    "UPDATE ws_artifacts SET last_accessed_at = NOW() WHERE id = %s",
                    (row["id"],),
                )
                conn.commit()
        return self._decode_artifact(row) if row else None

    def list_ready_artifacts(self, *, limit: int = 1000) -> list[dict[str, Any]]:
        """List live artifact metadata, including partials and registered sidecars."""

        self.initialize()
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            rows = conn.execute(
                """
                SELECT *
                FROM ws_artifacts
                WHERE invalidated_at IS NULL
                ORDER BY last_accessed_at
                LIMIT %s
                """,
                (max(1, min(10000, int(limit))),),
            ).fetchall()
        return [self._decode_artifact(row) for row in rows]

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
            conn.execute("SET search_path TO workspace, public")
            rows = conn.execute(
                """
                DELETE FROM ws_artifacts artifact
                USING ws_jobs job
                WHERE artifact.source_job_id = job.id
                  AND (
                    (
                      artifact.invalidated_at IS NOT NULL
                      AND artifact.invalidated_at
                          < NOW() - (%s * INTERVAL '1 second')
                    )
                    OR (
                      artifact.readiness = 'partial'
                      AND job.status IN ('completed', 'failed', 'cancelled')
                      AND artifact.created_at
                          < NOW() - (%s * INTERVAL '1 second')
                    )
                    OR (
                      job.status IN ('completed', 'failed', 'cancelled')
                      AND COALESCE(job.completed_at, job.updated_at)
                          < NOW() - (%s * INTERVAL '1 second')
                      AND NOT EXISTS (
                        SELECT 1
                        FROM ws_artifacts recent
                        WHERE recent.source_job_id = artifact.source_job_id
                          AND recent.source_fence = artifact.source_fence
                          AND recent.last_accessed_at
                              >= NOW() - (%s * INTERVAL '1 second')
                      )
                    )
                  )
                RETURNING artifact.id
                """,
                (
                    max(0, int(invalid_retention_seconds)),
                    max(0, int(partial_retention_seconds)),
                    max(0, int(retention_seconds)),
                    max(0, int(retention_seconds)),
                ),
            ).fetchall()
            conn.commit()
        return len(rows)

    def invalidate_artifact(self, artifact_id: str, *, reason: str) -> bool:
        """Invalidate a missing/corrupt artifact without changing its source job."""

        self.initialize()
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            row = conn.execute(
                """
                UPDATE ws_artifacts
                SET invalidated_at = COALESCE(invalidated_at, NOW()),
                    readiness = 'invalid'
                WHERE id = %s
                  AND invalidated_at IS NULL
                RETURNING source_job_id
                """,
                (artifact_id,),
            ).fetchone()
            if row and row.get("source_job_id"):
                self._event(
                    conn,
                    str(row["source_job_id"]),
                    "artifact_invalidated",
                    details={"artifact_id": artifact_id, "reason": reason},
                )
            conn.commit()
        return row is not None

    def referenced_object_paths(self) -> set[str]:
        """Return all non-invalidated object paths for offline garbage collection."""

        self.initialize()
        with self._connect() as conn:
            conn.execute("SET search_path TO workspace, public")
            rows = conn.execute(
                """
                SELECT object_path
                FROM ws_artifacts
                WHERE invalidated_at IS NULL
                """
            ).fetchall()
        return {str(row["object_path"]) for row in rows if row.get("object_path")}

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
            summary = conn.execute(
                """
                SELECT
                  COUNT(*) AS job_count,
                  COUNT(*) FILTER (
                    WHERE status IN ('queued', 'running', 'retry_wait', 'cancel_requested')
                  ) AS active_jobs,
                  percentile_cont(0.5) WITHIN GROUP (
                    ORDER BY EXTRACT(EPOCH FROM (started_at - created_at)) * 1000
                  ) FILTER (WHERE started_at IS NOT NULL) AS claim_p50_ms,
                  percentile_cont(0.95) WITHIN GROUP (
                    ORDER BY EXTRACT(EPOCH FROM (started_at - created_at)) * 1000
                  ) FILTER (WHERE started_at IS NOT NULL) AS claim_p95_ms,
                  MAX(
                    EXTRACT(EPOCH FROM (started_at - created_at)) * 1000
                  ) FILTER (WHERE started_at IS NOT NULL) AS claim_max_ms
                FROM ws_jobs
                WHERE created_at >= %s
                """,
                (since,),
            ).fetchone()
            kinds = conn.execute(
                """
                SELECT kind, status, COUNT(*) AS count
                FROM ws_jobs
                WHERE created_at >= %s
                GROUP BY kind, status
                ORDER BY kind, status
                """,
                (since,),
            ).fetchall()
            write_rates = conn.execute(
                """
                WITH rates AS (
                  SELECT event.job_id,
                    COUNT(*)::DOUBLE PRECISION
                      / GREATEST(
                          EXTRACT(EPOCH FROM (MAX(event.created_at) - MIN(event.created_at))),
                          1
                        ) AS updates_per_second
                  FROM ws_job_events event
                  JOIN ws_jobs job ON job.id = event.job_id
                  WHERE job.created_at >= %s
                  GROUP BY event.job_id
                )
                SELECT
                  COALESCE(MAX(updates_per_second), 0) AS max_rate,
                  COALESCE(
                    percentile_cont(0.95) WITHIN GROUP (ORDER BY updates_per_second),
                    0
                  ) AS p95_rate
                FROM rates
                """,
                (since,),
            ).fetchone()

        def number(value: Any) -> float:
            return float(value) if value is not None else 0.0

        return {
            "since": since.astimezone(timezone.utc).isoformat(),
            "jobCount": int(summary.get("job_count") or 0),
            "activeJobs": int(summary.get("active_jobs") or 0),
            "claimLatencyMs": {
                "p50": number(summary.get("claim_p50_ms")),
                "p95": number(summary.get("claim_p95_ms")),
                "max": number(summary.get("claim_max_ms")),
            },
            "jobUpdateRatePerSecond": {
                "p95": number(write_rates.get("p95_rate")),
                "max": number(write_rates.get("max_rate")),
            },
            "byKindStatus": [
                {
                    "kind": str(row["kind"]),
                    "status": str(row["status"]),
                    "count": int(row["count"]),
                }
                for row in kinds
            ],
        }

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

    @staticmethod
    def _decode(row: Any) -> dict[str, Any]:
        payload = dict(row)
        payload["payload"] = _loads(payload.get("payload"), {})
        payload["resource_requirements"] = _loads(
            payload.get("resource_requirements"), {}
        )
        payload["lock_requirements"] = _loads(payload.get("lock_requirements"), [])
        payload["result_metadata"] = _loads(payload.get("result_metadata"), {})
        payload["job_id"] = str(payload.pop("id"))
        for key in (
            "lease_expires_at",
            "heartbeat_at",
            "available_at",
            "cancel_requested_at",
            "started_at",
            "completed_at",
            "created_at",
            "updated_at",
        ):
            payload[key] = _timestamp(payload.get(key))
        return payload

    @staticmethod
    def _decode_artifact(row: Any) -> dict[str, Any]:
        payload = dict(row)
        for key in ("created_at", "last_accessed_at", "invalidated_at"):
            payload[key] = _timestamp(payload.get(key))
        return payload


jobs = JobService()
