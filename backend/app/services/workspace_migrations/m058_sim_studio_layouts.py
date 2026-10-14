"""Workspace schema migration 58: sim_studio_layouts.

Frozen. Applied deployments recorded this body in ``ws_schema_migrations``;
edit nothing here, add a new migration instead.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
    """Where each setup's power-tree canvas places its elements.

    Kept beside the setup, not in it: moving a node must not change the
    setup's revision or hash, so a passed preflight survives a tidy-up.
    """

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_sim_setup_layouts (
            setup_id TEXT PRIMARY KEY REFERENCES ws_sim_setups(setup_id) ON DELETE CASCADE,
            layout JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
