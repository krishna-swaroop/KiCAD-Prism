"""Workspace schema migration 4: webgpu_ready_metadata.

Frozen. Applied deployments recorded this body in ``ws_schema_migrations``;
edit nothing here, add a new migration instead.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
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
