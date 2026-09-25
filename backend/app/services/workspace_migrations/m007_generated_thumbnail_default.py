"""Workspace schema migration 7: generated_thumbnail_default.

Frozen. Applied deployments recorded this body in ``ws_schema_migrations``;
edit nothing here, add a new migration instead.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
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
