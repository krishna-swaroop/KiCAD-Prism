"""Workspace schema migration 1: v3_job_foundation.

Frozen. Applied deployments recorded this body in ``ws_schema_migrations``;
edit nothing here, add a new migration instead.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
    """Upgrade the legacy status-only workspace job table in place."""

    conn.execute(
        """
        ALTER TABLE ws_jobs
            ADD COLUMN IF NOT EXISTS worker_pool TEXT NOT NULL DEFAULT 'prism',
            ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100,
            ADD COLUMN IF NOT EXISTS artifact_key TEXT,
            ADD COLUMN IF NOT EXISTS project_id TEXT,
            ADD COLUMN IF NOT EXISTS repository_id TEXT,
            ADD COLUMN IF NOT EXISTS requested_by TEXT NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS result_path TEXT,
            ADD COLUMN IF NOT EXISTS result_digest TEXT,
            ADD COLUMN IF NOT EXISTS result_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS log_path TEXT,
            ADD COLUMN IF NOT EXISTS error_code TEXT NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS error_message TEXT NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS fence BIGINT NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS lease_owner TEXT NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS attempt INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3,
            ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS resource_requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS lock_requirements JSONB NOT NULL DEFAULT '[]'::jsonb
        """
    )
    conn.execute(
        """
        UPDATE ws_jobs
        SET available_at = COALESCE(available_at, created_at, NOW()),
            started_at = CASE
                WHEN status = 'running' THEN COALESCE(started_at, created_at)
                ELSE started_at
            END,
            completed_at = CASE
                WHEN status IN ('completed', 'failed', 'cancelled')
                THEN COALESCE(completed_at, updated_at)
                ELSE completed_at
            END
        """
    )
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_ws_jobs_active_artifact
        ON ws_jobs(kind, artifact_key)
        WHERE artifact_key IS NOT NULL
          AND artifact_key <> ''
          AND status IN ('queued', 'running', 'retry_wait', 'cancel_requested')
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_jobs_claim_v3
        ON ws_jobs(worker_pool, status, available_at, priority, created_at)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_jobs_project_created
        ON ws_jobs(project_id, created_at DESC)
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_job_events (
            id BIGSERIAL PRIMARY KEY,
            job_id TEXT NOT NULL REFERENCES ws_jobs(id) ON DELETE CASCADE,
            event_type TEXT NOT NULL,
            stage TEXT NOT NULL DEFAULT '',
            percent REAL,
            details JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_job_events_job_id
        ON ws_job_events(job_id, id)
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_job_resource_slots (
            resource_name TEXT NOT NULL,
            slot_number INTEGER NOT NULL,
            job_id TEXT REFERENCES ws_jobs(id) ON DELETE SET NULL,
            fence BIGINT,
            lease_owner TEXT NOT NULL DEFAULT '',
            lease_expires_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY(resource_name, slot_number)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_job_resource_slots_lease
        ON ws_job_resource_slots(resource_name, lease_expires_at)
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_job_locks (
            lock_key TEXT NOT NULL,
            job_id TEXT NOT NULL REFERENCES ws_jobs(id) ON DELETE CASCADE,
            fence BIGINT NOT NULL,
            mode TEXT NOT NULL CHECK (mode IN ('read', 'write')),
            lease_owner TEXT NOT NULL,
            lease_expires_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY(lock_key, job_id)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_job_locks_lease
        ON ws_job_locks(lock_key, lease_expires_at)
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_artifacts (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            artifact_key TEXT NOT NULL,
            digest TEXT NOT NULL,
            object_path TEXT NOT NULL,
            media_type TEXT NOT NULL DEFAULT 'application/octet-stream',
            size_bytes BIGINT NOT NULL DEFAULT 0,
            schema_version TEXT NOT NULL DEFAULT '',
            generator_version TEXT NOT NULL DEFAULT '',
            readiness TEXT NOT NULL DEFAULT 'ready',
            source_job_id TEXT REFERENCES ws_jobs(id) ON DELETE SET NULL,
            source_fence BIGINT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            invalidated_at TIMESTAMPTZ,
            UNIQUE(kind, artifact_key, digest)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_artifacts_lookup
        ON ws_artifacts(kind, artifact_key, readiness, created_at DESC)
        WHERE invalidated_at IS NULL
        """
    )
