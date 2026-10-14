"""Workspace schema migration 57: sim_studio_runs.

Frozen. Applied deployments recorded this body in ``ws_schema_migrations``;
edit nothing here, add a new migration instead.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
    """Simulation Studio runs: one analysis of a frozen setup revision.

    ``setup_document`` is the setup exactly as submitted, so a run stays
    reproducible after the setup is edited. ``result`` is the engine's
    ``prism.sim.result`` manifest once the run ends.
    """

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_sim_runs (
            run_id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES ws_projects(id) ON DELETE CASCADE,
            setup_id TEXT NOT NULL,
            setup_revision BIGINT NOT NULL,
            setup_sha256 TEXT NOT NULL,
            setup_document JSONB NOT NULL,
            analysis_id TEXT NOT NULL,
            source_commit TEXT,
            project_path TEXT NOT NULL,
            job_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued',
            message TEXT,
            bundle_sha256 TEXT,
            result JSONB,
            created_by TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS ws_sim_runs_project_idx ON ws_sim_runs (project_id, created_at DESC)"
    )
