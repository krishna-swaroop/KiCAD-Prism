"""Workspace schema migration 16: release_studio_append_only_evaluations.

Frozen. Applied deployments recorded this body in ``ws_schema_migrations``;
edit nothing here, add a new migration instead.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
    """Make every evaluation a historical fact and bind it to waiver state."""

    conn.execute(
        "ALTER TABLE ws_release_evaluations "
        "ADD COLUMN IF NOT EXISTS waiver_binding_digest TEXT NOT NULL DEFAULT ''"
    )
    conn.execute(
        "ALTER TABLE ws_release_evaluations "
        "DROP CONSTRAINT IF EXISTS uq_ws_release_evaluations_identity"
    )
