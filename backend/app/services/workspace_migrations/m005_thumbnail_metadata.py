"""Workspace schema migration 5: thumbnail_metadata.

Frozen. Applied deployments recorded this body in ``ws_schema_migrations``;
edit nothing here, add a new migration instead.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
    conn.execute(
        """
        ALTER TABLE ws_projects
            ADD COLUMN IF NOT EXISTS thumbnail_digest TEXT,
            ADD COLUMN IF NOT EXISTS thumbnail_media_type TEXT,
            ADD COLUMN IF NOT EXISTS thumbnail_size_bytes BIGINT
        """
    )
