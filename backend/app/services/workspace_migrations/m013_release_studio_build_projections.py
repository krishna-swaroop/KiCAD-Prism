"""Workspace schema migration 13: release_studio_build_projections.

Frozen. Applied deployments recorded this body in ``ws_schema_migrations``;
edit nothing here, add a new migration instead.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
    """Persist per-build projection payloads for re-evaluation.

    Added after migration 8 had already landed on long-lived databases.  The
    CREATE lives in `m008_release_studio` for fresh installs; this follow-up is what
    upgrades a database whose migration 8 predated the lean-manifest change.
    Versions 9-12 remain reserved on those databases by the pre-collapse ladder,
    so this step is numbered 13.
    """

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_build_projections (
            build_id   TEXT NOT NULL
                       REFERENCES ws_release_builds(id) ON DELETE CASCADE,
            name       TEXT NOT NULL,
            digest     TEXT NOT NULL,
            payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT pk_ws_release_build_projections PRIMARY KEY (build_id, name)
        )
        """
    )
