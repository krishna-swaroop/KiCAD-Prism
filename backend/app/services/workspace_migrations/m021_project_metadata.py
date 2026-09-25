"""Workspace schema migration 21: project_metadata.

Frozen. Applied deployments recorded this body in ``ws_schema_migrations``;
edit nothing here, add a new migration instead.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
    """Store the project card's descriptive metadata instead of deriving it per request.

    ``/properties`` used to read both KiCad files and scan them on every open of
    the workspace preview panel. On a large board that scan saturated a core for
    minutes. The facts it produced change only when the files change, so they
    belong in a table written by the import/sync job and read by the API.

    ``source_fingerprint`` is what makes a row self-invalidating: it identifies
    the inputs the row was computed from, so a sync that changed the board is
    visible as a mismatch without needing a cache-busting call from elsewhere.
    """

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_project_metadata (
            project_id         TEXT PRIMARY KEY REFERENCES ws_projects(id) ON DELETE CASCADE,
            schematic          JSONB,
            pcb                JSONB,
            source_fingerprint TEXT NOT NULL DEFAULT '',
            board_stats_source TEXT NOT NULL DEFAULT '',
            computed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
