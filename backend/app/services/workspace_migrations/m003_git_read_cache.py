"""Workspace schema migration 3: git_read_cache.

Frozen. Applied deployments recorded this body in ``ws_schema_migrations``;
edit nothing here, add a new migration instead.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_git_read_cache (
            cache_key TEXT PRIMARY KEY,
            cache_kind TEXT NOT NULL,
            repository_key TEXT NOT NULL,
            resolved_ref_sha TEXT NOT NULL,
            payload JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_git_read_cache_retention
        ON ws_git_read_cache(last_accessed_at)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_git_read_cache_repository
        ON ws_git_read_cache(repository_key, cache_kind, resolved_ref_sha)
        """
    )
