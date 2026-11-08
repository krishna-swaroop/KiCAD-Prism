"""``ws_artifacts`` rows: immutable objects registered under a job's fence.

Every function runs on the caller's connection (search_path already set to
the workspace schema) inside the caller's transaction; none commits or
rolls back. Object files themselves belong to ``job_artifact_service``.
"""

from __future__ import annotations

import hashlib
import uuid
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

RecordEvent = Callable[..., None]


def artifact_file_valid(row: Mapping[str, Any]) -> tuple[bool, str]:
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


def reuse_cached_completion(
    conn: Any,
    kind: str,
    artifact_key: str,
    *,
    requested_by: str,
    record_event: RecordEvent,
) -> Mapping[str, Any] | None:
    """The completed job whose ready artifact still answers ``(kind, artifact_key)``.

    A hit is touched and recorded as ``cache_hit``. A cached pointer whose
    object no longer validates is invalidated (and recorded) instead, and
    ``None`` is returned so the caller queues a fresh job.
    """

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
        (kind, artifact_key),
    ).fetchone()
    if not cached:
        return None
    valid, invalid_reason = artifact_file_valid(cached)
    if valid:
        conn.execute(
            """
            UPDATE ws_artifacts
            SET last_accessed_at = NOW()
            WHERE id = %s
            """,
            (cached["cache_artifact_id"],),
        )
        record_event(
            conn,
            str(cached["id"]),
            "cache_hit",
            details={"requested_by": requested_by},
        )
        return cached
    conn.execute(
        """
        UPDATE ws_artifacts
        SET invalidated_at = COALESCE(invalidated_at, NOW()),
            readiness = 'invalid'
        WHERE id = %s
        """,
        (cached["cache_artifact_id"],),
    )
    record_event(
        conn,
        str(cached["id"]),
        "artifact_invalidated",
        details={
            "artifact_id": str(cached["cache_artifact_id"]),
            "reason": invalid_reason,
            "detected_by": "enqueue",
        },
    )
    return None


def insert_artifact(
    conn: Any,
    artifact_id: str,
    artifact: Mapping[str, Any],
    *,
    job_id: str,
    fence: int,
) -> None:
    """Register ``artifact``, reviving a row whose earlier copy was invalidated.

    A retried job may re-produce a digest that was invalidated (for a missing or
    corrupt object). The object store has just rewritten the object from the
    verified copy, so the upsert clears ``invalidated_at`` and readers serve it.
    """

    conn.execute(
        """
        INSERT INTO ws_artifacts (
            id, kind, artifact_key, digest, object_path, media_type,
            size_bytes, schema_version, generator_version, readiness,
            source_job_id, source_fence
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (kind, artifact_key, digest)
        DO UPDATE SET last_accessed_at = NOW(),
            invalidated_at = NULL,
            readiness = EXCLUDED.readiness,
            object_path = EXCLUDED.object_path,
            size_bytes = EXCLUDED.size_bytes,
            media_type = EXCLUDED.media_type,
            schema_version = EXCLUDED.schema_version,
            generator_version = EXCLUDED.generator_version,
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


def register_artifacts(
    conn: Any,
    artifacts: Sequence[Mapping[str, Any]],
    *,
    job_id: str,
    fence: int,
) -> list[str] | None:
    """Insert ``artifacts`` and return their row ids in order.

    ``None`` means a row could not be read back; the caller rolls back.
    """

    artifact_ids: list[str] = []
    for artifact in artifacts:
        insert_artifact(
            conn,
            str(uuid.uuid4()),
            artifact,
            job_id=job_id,
            fence=fence,
        )
        # `insert_artifact` upserts on (kind, artifact_key, digest), so
        # a retried build reuses the existing row rather than orphaning
        # the id we just generated.
        row = conn.execute(
            """
            SELECT id FROM ws_artifacts
            WHERE kind = %s AND artifact_key = %s AND digest = %s
            """,
            (
                artifact["kind"],
                artifact["artifact_key"],
                artifact["digest"],
            ),
        ).fetchone()
        if row is None:
            return None
        artifact_ids.append(str(row["id"]))
    return artifact_ids


def touch_artifact(conn: Any, artifact_id: Any) -> None:
    conn.execute(
        "UPDATE ws_artifacts SET last_accessed_at = NOW() WHERE id = %s",
        (artifact_id,),
    )


def artifact_for_job_digest(conn: Any, job_id: str, digest: str) -> Mapping[str, Any] | None:
    """Resolve one registered sidecar under the job's authoritative fence."""

    return conn.execute(
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


def artifact_for_job(conn: Any, job_id: str) -> Mapping[str, Any] | None:
    """Return the authoritative artifact for a completed fenced execution."""

    return conn.execute(
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


def list_ready_artifacts(conn: Any, *, limit: int) -> list[Mapping[str, Any]]:
    """List live artifact metadata, including partials and registered sidecars."""

    return conn.execute(
        """
        SELECT *
        FROM ws_artifacts
        WHERE invalidated_at IS NULL
        ORDER BY last_accessed_at
        LIMIT %s
        """,
        (max(1, min(10000, int(limit))),),
    ).fetchall()


def prune_artifact_metadata(
    conn: Any,
    *,
    retention_seconds: int,
    partial_retention_seconds: int,
    invalid_retention_seconds: int,
) -> int:
    """Drop expired metadata as a fenced group so filesystem GC can reclaim it."""

    rows = conn.execute(
        """
        DELETE FROM ws_artifacts artifact
        USING ws_jobs job
        WHERE artifact.source_job_id = job.id
          AND NOT EXISTS (
            SELECT 1
            FROM ws_artifact_release_pins pin
            WHERE pin.artifact_id = artifact.id
          )
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
    return len(rows)


def invalidate_artifact(
    conn: Any, artifact_id: str, *, reason: str, record_event: RecordEvent
) -> bool:
    """Invalidate a missing/corrupt artifact without changing its source job."""

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
        record_event(
            conn,
            str(row["source_job_id"]),
            "artifact_invalidated",
            details={"artifact_id": artifact_id, "reason": reason},
        )
    return row is not None


def referenced_object_paths(conn: Any) -> set[str]:
    """Return live object paths, including indefinitely pinned artifacts."""

    rows = conn.execute(
        """
        SELECT object_path
        FROM ws_artifacts artifact
        WHERE artifact.invalidated_at IS NULL
           OR EXISTS (
                SELECT 1
                FROM ws_artifact_release_pins pin
                WHERE pin.artifact_id = artifact.id
           )
        """
    ).fetchall()
    return {str(row["object_path"]) for row in rows if row.get("object_path")}
