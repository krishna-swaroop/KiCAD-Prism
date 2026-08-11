from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any


logger = logging.getLogger(__name__)

Migration = Callable[[Any], None]


def _v3_job_foundation(conn: Any) -> None:
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


def _workspace_read_versions(conn: Any) -> None:
    """Maintain one cheap monotonic version for role-filtered bootstrap ETags."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_workspace_state (
            id SMALLINT PRIMARY KEY CHECK (id = 1),
            version BIGINT NOT NULL DEFAULT 1,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        INSERT INTO ws_workspace_state(id, version)
        VALUES (1, 1)
        ON CONFLICT (id) DO NOTHING
        """
    )
    conn.execute(
        """
        CREATE OR REPLACE FUNCTION ws_bump_workspace_version()
        RETURNS TRIGGER AS $$
        BEGIN
            UPDATE ws_workspace_state
            SET version = version + 1, updated_at = NOW()
            WHERE id = 1;
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    for table in (
        "ws_repositories",
        "ws_projects",
        "ws_folders",
        "ws_project_portfolio",
    ):
        trigger = f"trg_{table}_workspace_version"
        conn.execute(f"DROP TRIGGER IF EXISTS {trigger} ON {table}")
        conn.execute(
            f"""
            CREATE TRIGGER {trigger}
            AFTER INSERT OR UPDATE OR DELETE ON {table}
            FOR EACH STATEMENT
            EXECUTE FUNCTION ws_bump_workspace_version()
            """
        )


def _git_read_cache(conn: Any) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_git_read_cache (
            cache_key TEXT PRIMARY KEY,
            cache_kind TEXT NOT NULL,
            repository_key TEXT NOT NULL,
            resolved_ref_sha TEXT NOT NULL,
            payload JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_git_read_cache_retention
        ON ws_git_read_cache(last_accessed_at)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_git_read_cache_repository
        ON ws_git_read_cache(repository_key, cache_kind, resolved_ref_sha)
        """
    )


def _webgpu_ready_metadata(conn: Any) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_webgpu_ready (
            project_id TEXT NOT NULL,
            selector_key TEXT NOT NULL,
            generator_build TEXT NOT NULL,
            source_revision_key TEXT NOT NULL,
            bundle_url TEXT NOT NULL,
            status_payload JSONB NOT NULL,
            source_job_id TEXT NOT NULL REFERENCES ws_jobs(id) ON DELETE CASCADE,
            source_fence BIGINT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            invalidated_at TIMESTAMPTZ,
            PRIMARY KEY(project_id, selector_key, generator_build)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_webgpu_ready_source
        ON ws_webgpu_ready(project_id, source_revision_key, generator_build)
        WHERE invalidated_at IS NULL
        """
    )


def _thumbnail_metadata(conn: Any) -> None:
    conn.execute(
        """
        ALTER TABLE ws_projects
            ADD COLUMN IF NOT EXISTS thumbnail_digest TEXT,
            ADD COLUMN IF NOT EXISTS thumbnail_media_type TEXT,
            ADD COLUMN IF NOT EXISTS thumbnail_size_bytes BIGINT
        """
    )


def _thumbnail_source(conn: Any) -> None:
    """Record whether a thumbnail is committed in the repo or generated by Prism.

    Generated thumbnails moved out of the Git checkout, so `thumbnail_rel` alone
    no longer says where to read one from. Existing rows all predate the move
    and resolve inside the checkout, which is what the default describes.
    """
    conn.execute(
        """
        ALTER TABLE ws_projects
            ADD COLUMN IF NOT EXISTS thumbnail_source TEXT NOT NULL DEFAULT 'repository'
        """
    )


def _generated_thumbnail_default(conn: Any) -> None:
    """Make Prism's own render the default a project falls back to.

    A project now shows a render of its board rather than whatever image happens
    to sit in the repository. Rows already pointing at a committed image keep
    doing so until the next render replaces it, so nothing goes blank in the
    meantime; only the column default changes here.
    """
    conn.execute(
        """
        ALTER TABLE ws_projects
            ALTER COLUMN thumbnail_source SET DEFAULT 'generated'
        """
    )


MIGRATIONS: tuple[tuple[int, str, Migration], ...] = (
    (1, "v3_job_foundation", _v3_job_foundation),
    (2, "workspace_read_versions", _workspace_read_versions),
    (3, "git_read_cache", _git_read_cache),
    (4, "webgpu_ready_metadata", _webgpu_ready_metadata),
    (5, "thumbnail_metadata", _thumbnail_metadata),
    (6, "thumbnail_source", _thumbnail_source),
    (7, "generated_thumbnail_default", _generated_thumbnail_default),
)


def apply_workspace_migrations(conn: Any) -> None:
    """Apply versioned, additive workspace migrations under the caller's lock."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    applied = {
        int(row["version"])
        for row in conn.execute("SELECT version FROM ws_schema_migrations").fetchall()
    }
    for version, name, migration in MIGRATIONS:
        if version in applied:
            continue
        logger.info("Applying workspace schema migration %s (%s)", version, name)
        migration(conn)
        conn.execute(
            "INSERT INTO ws_schema_migrations(version, name) VALUES (%s, %s)",
            (version, name),
        )
