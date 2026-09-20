"""Additive tracker schema migrations (workspace 23, comments 3).

Workspace SQL lives here so TR-12 does not add a ``workspace_migrations/m023_``
module outside the ticket allowlist. The registry line is owned by
``workspace_schema_migrations.py``. Comments SQL is registered from
``comments_schema_migrations.py``.
"""

from __future__ import annotations

from typing import Any


WORKSPACE_MIGRATION_VERSION = 23
WORKSPACE_MIGRATION_NAME = "tracker_connectors_identities_policy"


def migrate_workspace_tracker_tables(conn: Any) -> None:
    """Connectors, identities, project destinations, acks and audit (workspace)."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tracker_connectors (
            id TEXT PRIMARY KEY,
            provider TEXT NOT NULL,
            display_name TEXT NOT NULL DEFAULT '',
            instance_kind TEXT NOT NULL,
            base_url TEXT NOT NULL DEFAULT '',
            bot_forge_user_id TEXT,
            bot_login TEXT,
            credential_envelope TEXT,
            paused BOOLEAN NOT NULL DEFAULT FALSE,
            paused_reason TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS user_identities (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            connector_id TEXT NOT NULL REFERENCES tracker_connectors(id),
            provider TEXT NOT NULL,
            forge_user_id TEXT NOT NULL,
            forge_login TEXT NOT NULL,
            scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
            token_envelope TEXT,
            linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ,
            status TEXT NOT NULL DEFAULT 'active',
            UNIQUE (user_id, connector_id),
            UNIQUE (connector_id, forge_user_id)
        );

        CREATE TABLE IF NOT EXISTS project_trackers (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            connector_id TEXT NOT NULL REFERENCES tracker_connectors(id),
            container_kind TEXT NOT NULL,
            container_path TEXT NOT NULL,
            remote_container_id TEXT NOT NULL,
            destination_generation INTEGER NOT NULL DEFAULT 1
                CHECK (destination_generation >= 1),
            visibility TEXT,
            auto_min_severity TEXT NOT NULL DEFAULT 'minor',
            auto_task_class BOOLEAN NOT NULL DEFAULT TRUE,
            promote_min_role TEXT NOT NULL DEFAULT 'designer',
            labels JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (project_id)
        );

        CREATE TABLE IF NOT EXISTS destination_acks (
            id TEXT PRIMARY KEY,
            connector_id TEXT NOT NULL REFERENCES tracker_connectors(id),
            remote_container_id TEXT NOT NULL,
            observed_visibility TEXT NOT NULL,
            acknowledged_by TEXT NOT NULL,
            acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (connector_id, remote_container_id, observed_visibility)
        );

        CREATE TABLE IF NOT EXISTS tracker_audit (
            id BIGSERIAL PRIMARY KEY,
            actor_user_id TEXT,
            action TEXT NOT NULL,
            connector_id TEXT,
            project_id TEXT,
            detail JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """,
        prepare=False,
    )


def migrate_comments_tracked_links(conn: Any) -> None:
    """tracked_threads / tracked_replies in the comments schema."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tracked_threads (
            id TEXT PRIMARY KEY,
            comment_id TEXT NOT NULL REFERENCES comments(id),
            project_tracker_id TEXT NOT NULL,
            destination_generation INTEGER NOT NULL,
            connector_id TEXT NOT NULL,
            remote_container_id TEXT NOT NULL,
            external_id TEXT NOT NULL,
            external_url TEXT,
            link_state TEXT NOT NULL,
            paused_reason TEXT,
            body_authority TEXT NOT NULL DEFAULT 'prism',
            remote_state TEXT,
            remote_version JSONB,
            last_title_hash TEXT,
            pending_op_id TEXT,
            last_verified_at TIMESTAMPTZ,
            unlinked_at TIMESTAMPTZ,
            lineage JSONB NOT NULL DEFAULT '[]'::jsonb
        );
        CREATE UNIQUE INDEX IF NOT EXISTS tracked_threads_live_comment
            ON tracked_threads(comment_id) WHERE unlinked_at IS NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS tracked_threads_live_issue
            ON tracked_threads(
                project_tracker_id, connector_id, remote_container_id, external_id
            ) WHERE unlinked_at IS NULL;
        CREATE INDEX IF NOT EXISTS tracked_threads_container
            ON tracked_threads(connector_id, remote_container_id, external_id);

        CREATE TABLE IF NOT EXISTS tracked_replies (
            id TEXT PRIMARY KEY,
            tracked_thread_id TEXT NOT NULL REFERENCES tracked_threads(id),
            reply_id TEXT NOT NULL REFERENCES comment_replies(id),
            external_comment_id TEXT NOT NULL,
            external_url TEXT,
            remote_author_id TEXT,
            remote_author_login TEXT,
            UNIQUE (tracked_thread_id, external_comment_id),
            UNIQUE (reply_id)
        );
        """,
        prepare=False,
    )


# Registry callable for workspace_schema_migrations (version 23).
migrate = migrate_workspace_tracker_tables
