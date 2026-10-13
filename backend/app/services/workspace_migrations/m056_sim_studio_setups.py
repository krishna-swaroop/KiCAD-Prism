"""Workspace schema migration 56: sim_studio_setups.

Frozen. Applied deployments recorded this body in ``ws_schema_migrations``;
edit nothing here, add a new migration instead.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
    """Simulation Studio setups (sim-adr-0012, sim-adr-0017).

    One row per stored ``prism.sim.setup`` document. ``revision`` guards
    writes through ``If-Match``. ``source_commit`` is the revision the setup
    was drafted against; NULL means the working copy.
    """

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_sim_setups (
            setup_id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES ws_projects(id) ON DELETE CASCADE,
            kind TEXT NOT NULL,
            name TEXT NOT NULL,
            source_commit TEXT,
            project_path TEXT NOT NULL,
            document JSONB NOT NULL,
            revision BIGINT NOT NULL DEFAULT 1,
            created_by TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS ws_sim_setups_project_idx ON ws_sim_setups (project_id, updated_at DESC)"
    )
