"""Workspace schema migration 24: cascade tracker FKs on connector delete."""

from __future__ import annotations

from typing import Any

from app.services.trackers.migrations import cascade_workspace_tracker_fks


def migrate(conn: Any) -> None:
    """``project_trackers.connector_id`` (and sibling FKs) gain ON DELETE CASCADE.

    Version 23 created the tables without ON DELETE. Deleting a connector then
    left project destinations and identities behind. Restart-safe: drop/re-add.
    """

    cascade_workspace_tracker_fks(conn)
