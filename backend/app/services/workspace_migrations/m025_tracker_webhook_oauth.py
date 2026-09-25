"""Workspace migration 25: tracker webhook secrets and OAuth helper tables."""

from __future__ import annotations

from typing import Any

from app.services.trackers.migrations import migrate_tracker_webhook_oauth_tables


def migrate(conn: Any) -> None:
    migrate_tracker_webhook_oauth_tables(conn)
