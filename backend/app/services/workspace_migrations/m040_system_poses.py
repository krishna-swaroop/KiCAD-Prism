"""Workspace schema migration 40: stored instance poses (CONTRACTS_P2 §14.3, SB2-28).

Frozen once shipped. Applied deployments recorded this body in
``ws_schema_migrations``; edit nothing here, add a new migration instead.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
    """One pose per instance, in its system's frame. Absent means the default pose; a stored
    rotation is a canonical unit quaternion (x, y, z, w)."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS system_poses (
            instance_id     TEXT PRIMARY KEY REFERENCES system_instances(id) ON DELETE CASCADE,
            system_id       TEXT NOT NULL,
            translation_mm  DOUBLE PRECISION[] NOT NULL CHECK (cardinality(translation_mm) = 3),
            rotation        DOUBLE PRECISION[] NOT NULL CHECK (cardinality(rotation) = 4),
            source          TEXT NOT NULL CHECK (source IN ('auto', 'manual', 'default')),
            updated_by      TEXT NOT NULL,
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS system_poses_system ON system_poses (system_id)")
