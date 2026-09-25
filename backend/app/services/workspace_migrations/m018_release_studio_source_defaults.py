"""Workspace schema migration 18: release_studio_source_defaults.

Frozen. Applied deployments recorded this body in ``ws_schema_migrations``;
edit nothing here, add a new migration instead.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
    """Remember last Source picks per project so a new release reuses them.

    These are convenience defaults, not build identity. Discovery still lists
    what exists at the selected commit; a saved path is used only when that
    file is still in the tree.
    """

    conn.execute(
        """
        ALTER TABLE ws_projects
            ADD COLUMN IF NOT EXISTS release_studio_defaults JSONB NOT NULL DEFAULT '{}'::jsonb
        """
    )
