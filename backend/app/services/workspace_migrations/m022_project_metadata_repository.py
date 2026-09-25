"""Workspace schema migration 22: project_metadata_repository.

Frozen. Applied deployments recorded this body in ``ws_schema_migrations``;
edit nothing here, add a new migration instead.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
    """Store the card's repository facts alongside its file facts.

    ``/properties`` still derived ``latest_commit`` and ``latest_tag`` from Git
    on every request. That is far cheaper than the board scan removed in M21 --
    about 290 ms on our largest monorepo -- but it is per-click work that does
    not change between clicks, and ``get_releases_filtered`` counts files under
    the subproject path for every tag, so it grows with the tag list.

    Kept in its own fingerprint rather than sharing the file one: a push moves
    HEAD without touching the checked-out board, and re-running a 30 s
    ``kicad-cli`` pass because somebody tagged a release would be worse than
    the problem being solved.
    """

    conn.execute(
        """
        ALTER TABLE ws_project_metadata
            ADD COLUMN IF NOT EXISTS repository JSONB,
            ADD COLUMN IF NOT EXISTS repo_fingerprint TEXT NOT NULL DEFAULT ''
        """
    )
