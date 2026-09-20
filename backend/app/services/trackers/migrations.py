"""Additive tracker schema migrations (workspace 23–24, comments 3–4).

Workspace SQL lives here so TR-12 does not add a ``workspace_migrations/m023_``
module outside the ticket allowlist. The registry line is owned by
``workspace_schema_migrations.py``. Comments SQL is registered from
``comments_schema_migrations.py``.
"""

from __future__ import annotations

import re
from typing import Any


WORKSPACE_MIGRATION_VERSION = 23
WORKSPACE_MIGRATION_NAME = "tracker_connectors_identities_policy"
WORKSPACE_FK_CASCADE_VERSION = 24
WORKSPACE_FK_CASCADE_NAME = "tracker_connector_delete_cascade"
WORKSPACE_WEBHOOK_OAUTH_VERSION = 25
WORKSPACE_WEBHOOK_OAUTH_NAME = "tracker_webhook_oauth_tables"

_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def set_foreign_key_cascade(conn: Any, table: str, column: str, ref_table: str, ref_column: str) -> None:
    """Drop and re-add a single-column FK with ON DELETE CASCADE. Restart-safe."""

    for name in (table, column, ref_table, ref_column):
        if not _IDENT.match(name):
            raise ValueError(f"invalid SQL identifier: {name!r}")
    constraint = f"{table}_{column}_fkey"
    conn.execute(f'ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint}', prepare=False)
    conn.execute(
        f"ALTER TABLE {table} ADD CONSTRAINT {constraint} "
        f"FOREIGN KEY ({column}) REFERENCES {ref_table}({ref_column}) ON DELETE CASCADE",
        prepare=False,
    )


def cascade_comments_tracker_fks(conn: Any) -> None:
    """Hard-delete of a comment/reply must take tracker links and ops with it."""

    set_foreign_key_cascade(conn, "tracked_threads", "comment_id", "comments", "id")
    set_foreign_key_cascade(conn, "tracked_replies", "tracked_thread_id", "tracked_threads", "id")
    set_foreign_key_cascade(conn, "tracked_replies", "reply_id", "comment_replies", "id")
    set_foreign_key_cascade(conn, "sync_ops", "tracked_thread_id", "tracked_threads", "id")


def cascade_workspace_tracker_fks(conn: Any) -> None:
    """Deleting a connector must not leave project_trackers / identities dangling."""

    set_foreign_key_cascade(conn, "user_identities", "connector_id", "tracker_connectors", "id")
    set_foreign_key_cascade(conn, "project_trackers", "connector_id", "tracker_connectors", "id")
    set_foreign_key_cascade(conn, "destination_acks", "connector_id", "tracker_connectors", "id")


def migrate_tracker_webhook_oauth_tables(conn: Any) -> None:
    """Webhook signing secrets, OAuth state, and per-connector OAuth apps (workspace)."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tracker_webhook_secrets (
            connector_id TEXT PRIMARY KEY REFERENCES tracker_connectors(id) ON DELETE CASCADE,
            secret_envelope TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tracker_oauth_states (
            state_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            connector_id TEXT NOT NULL,
            pkce_verifier TEXT NOT NULL,
            callback_url TEXT NOT NULL,
            return_to TEXT NOT NULL DEFAULT '/',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            consumed_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS tracker_oauth_states_expiry
            ON tracker_oauth_states(expires_at)
            WHERE consumed_at IS NULL;

        CREATE TABLE IF NOT EXISTS tracker_oauth_clients (
            connector_id TEXT PRIMARY KEY REFERENCES tracker_connectors(id) ON DELETE CASCADE,
            client_id TEXT NOT NULL,
            client_secret_envelope TEXT NOT NULL
        );
        """,
        prepare=False,
    )


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
            connector_id TEXT NOT NULL REFERENCES tracker_connectors(id) ON DELETE CASCADE,
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
            connector_id TEXT NOT NULL REFERENCES tracker_connectors(id) ON DELETE CASCADE,
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
            connector_id TEXT NOT NULL REFERENCES tracker_connectors(id) ON DELETE CASCADE,
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
            comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
            project_tracker_id TEXT NOT NULL,
            destination_generation INTEGER NOT NULL,
            connector_id TEXT NOT NULL,
            remote_container_id TEXT NOT NULL,
            external_id TEXT NOT NULL,
            external_number TEXT,
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
        CREATE INDEX IF NOT EXISTS tracked_threads_container_number
            ON tracked_threads(connector_id, remote_container_id, external_number);

        CREATE TABLE IF NOT EXISTS tracked_replies (
            id TEXT PRIMARY KEY,
            tracked_thread_id TEXT NOT NULL REFERENCES tracked_threads(id) ON DELETE CASCADE,
            reply_id TEXT NOT NULL REFERENCES comment_replies(id) ON DELETE CASCADE,
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


def migrate_tracked_threads_external_number(conn: Any) -> None:
    """Split immutable issue id from repo-scoped issue number (R2-H1)."""

    conn.execute(
        """
        ALTER TABLE tracked_threads ADD COLUMN IF NOT EXISTS external_number TEXT;
        CREATE INDEX IF NOT EXISTS tracked_threads_container_number
            ON tracked_threads(connector_id, remote_container_id, external_number);
        UPDATE tracked_threads
        SET external_number = external_id
        WHERE external_number IS NULL
          AND external_id IS NOT NULL
          AND external_id NOT IN ('', 'pending');
        """,
        prepare=False,
    )


# Registry callable for workspace_schema_migrations (version 23).
migrate = migrate_workspace_tracker_tables
