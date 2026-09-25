"""Workspace schema migration 19: release_studio_project_signoff.

Frozen. Applied deployments recorded this body in ``ws_schema_migrations``;
edit nothing here, add a new migration instead.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
    """LM-shaped dual sign-off and publish records for project releases."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_review_decisions (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES ws_projects(id) ON DELETE CASCADE,
            build_id TEXT NOT NULL REFERENCES ws_release_builds(id) ON DELETE CASCADE,
            slot TEXT NOT NULL CHECK (slot IN ('designer', 'qa')),
            actor TEXT NOT NULL,
            decision TEXT NOT NULL CHECK (decision IN ('approved', 'withdrawn')),
            note TEXT NOT NULL DEFAULT '',
            dossier_digest TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_release_review_decisions_build
        ON ws_release_review_decisions(build_id, slot, created_at DESC)
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_publish_records (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES ws_projects(id) ON DELETE CASCADE,
            build_id TEXT NOT NULL REFERENCES ws_release_builds(id) ON DELETE RESTRICT,
            tag TEXT NOT NULL,
            commit_sha TEXT NOT NULL,
            dossier_digest TEXT NOT NULL,
            published_by TEXT NOT NULL,
            forge_url TEXT NOT NULL DEFAULT '',
            asset_names JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_ws_release_publish_records_tag UNIQUE (project_id, tag),
            CONSTRAINT uq_ws_release_publish_records_build UNIQUE (build_id)
        )
        """
    )
