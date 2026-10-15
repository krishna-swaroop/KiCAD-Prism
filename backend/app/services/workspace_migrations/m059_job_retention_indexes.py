"""Workspace schema migration 59: job_retention_indexes.

Frozen. Applied deployments recorded this body in ``ws_schema_migrations``;
edit nothing here, add a new migration instead.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
    """Indexes the job retention pass needs: "is this the newest job of its
    kind and key", and "does anything still point at this job"."""

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ws_jobs_kind_key_created"
        " ON ws_jobs(kind, artifact_key, created_at DESC)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ws_artifacts_source_job ON ws_artifacts(source_job_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ws_webgpu_ready_source_job ON ws_webgpu_ready(source_job_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ws_release_builds_job ON ws_release_builds(job_id)"
    )
