"""Versioned, additive migrations for the ``comments`` schema.

``CommentsStoreService.initialize()`` creates the base tables with
``CREATE TABLE IF NOT EXISTS`` and then applies these in order under the
schema advisory lock, recording each in ``comment_schema_migrations`` so a
restart never re-runs or skips one. Every step must be safe to apply to a
populated database and safe to apply twice: ``ADD COLUMN IF NOT EXISTS``,
backfills guarded by ``WHERE ... IS NULL``, indexes ``IF NOT EXISTS``.

Table names are unqualified on purpose; the caller has already set the
search path to the comments schema (or a disposable test schema).
"""

from __future__ import annotations

import logging
from typing import Callable, List, Tuple

from app.services import comment_live_events
from app.services.trackers.inbox_store import apply_schema as apply_inbox_schema
from app.services.trackers.migrations import (
    cascade_comments_tracker_fks,
    migrate_comments_tracked_links,
    migrate_tracked_threads_container_path,
    migrate_tracked_threads_external_number,
)
from app.services.trackers.op_store import apply_schema as apply_op_schema
from app.services.trackers.projection_events import apply_schema as apply_tracker_projection_events

logger = logging.getLogger(__name__)

LEDGER_TABLE = "comment_schema_migrations"


def _m001_identity_revisions_tombstones(conn) -> None:
    """Stable authorship, edit revisions, tombstones and anchor provenance.

    Rows that exist before this migration were written with free-text
    authors and no pinned revision: they become ``author_kind='legacy'`` and
    ``anchor_state='unpinned'`` by the column defaults, exactly the D6
    reading. New writes set both explicitly.
    """
    conn.execute(
        ";\n".join((
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_user_id TEXT",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_kind TEXT NOT NULL DEFAULT 'legacy'",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS deleted_by TEXT",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS anchor_commit TEXT",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS anchor_revision_key TEXT",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS anchor_source TEXT",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS anchor_state TEXT NOT NULL DEFAULT 'unpinned'",
            "ALTER TABLE comment_replies ADD COLUMN IF NOT EXISTS author_user_id TEXT",
            "ALTER TABLE comment_replies ADD COLUMN IF NOT EXISTS author_kind TEXT NOT NULL DEFAULT 'legacy'",
            "ALTER TABLE comment_replies ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1",
            "ALTER TABLE comment_replies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ",
            "ALTER TABLE comment_replies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ",
            "ALTER TABLE comment_replies ADD COLUMN IF NOT EXISTS deleted_by TEXT",
            "ALTER TABLE comment_replies ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'prism'",
        )),
        prepare=False,
    )
    conn.execute("UPDATE comments SET updated_at = timestamp WHERE updated_at IS NULL")
    conn.execute("UPDATE comment_replies SET updated_at = timestamp WHERE updated_at IS NULL")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS comment_revisions (
            id BIGSERIAL PRIMARY KEY,
            project_id TEXT NOT NULL,
            target_kind TEXT NOT NULL,
            target_id TEXT NOT NULL,
            revision INTEGER NOT NULL,
            change_kind TEXT NOT NULL,
            content TEXT,
            severity TEXT,
            comment_class TEXT,
            status TEXT,
            mentions JSONB,
            editor_user_id TEXT,
            editor_kind TEXT NOT NULL,
            editor_display TEXT NOT NULL DEFAULT '',
            origin TEXT NOT NULL DEFAULT 'prism',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (target_kind, target_id, revision)
        );
        CREATE INDEX IF NOT EXISTS idx_comment_revisions_target
            ON comment_revisions(project_id, target_kind, target_id, revision);
        CREATE INDEX IF NOT EXISTS idx_comments_project_live
            ON comments(project_id, deleted_at);
        """,
        prepare=False,
    )


def _m002_backfill_create_revisions(conn) -> None:
    """Snapshot pre-identity rows into history so a later edit cannot erase them.

    Idempotent: skips any target that already has a revision row. Uses only
    columns the identity migration guarantees (content/status/author), because
    older databases may not yet have severity or class.
    """
    conn.execute(
        """
        INSERT INTO comment_revisions (
            project_id, target_kind, target_id, revision, change_kind,
            content, status, editor_user_id, editor_kind, editor_display, origin
        )
        SELECT
            c.project_id, 'root', c.id, COALESCE(c.revision, 1), 'create',
            c.content, c.status, c.author_user_id,
            COALESCE(NULLIF(c.author_kind, ''), 'legacy'), COALESCE(c.author, ''), 'prism'
        FROM comments c
        WHERE NOT EXISTS (
            SELECT 1 FROM comment_revisions r
            WHERE r.target_kind = 'root' AND r.target_id = c.id
        )
        """
    )
    conn.execute(
        """
        INSERT INTO comment_revisions (
            project_id, target_kind, target_id, revision, change_kind,
            content, editor_user_id, editor_kind, editor_display, origin
        )
        SELECT
            r.project_id, 'reply', r.id, COALESCE(r.revision, 1), 'create',
            r.content, r.author_user_id,
            COALESCE(NULLIF(r.author_kind, ''), 'legacy'), COALESCE(r.author, ''), 'prism'
        FROM comment_replies r
        WHERE NOT EXISTS (
            SELECT 1 FROM comment_revisions h
            WHERE h.target_kind = 'reply' AND h.target_id = r.id
        )
        """
    )


def _m004_sync_ops_inbox_and_delete_cascade(conn) -> None:
    apply_op_schema(conn)
    apply_inbox_schema(conn)
    cascade_comments_tracker_fks(conn)


def _m006_reply_sync_state(conn) -> None:
    conn.execute("ALTER TABLE comment_replies ADD COLUMN IF NOT EXISTS sync_state TEXT", prepare=False)


def _m009_anchor_binding_history(conn) -> None:
    """Append-only reattachments; original provenance remains on comments."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS comment_anchor_bindings (
            id BIGSERIAL PRIMARY KEY,
            project_id TEXT NOT NULL,
            comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
            effective_commit TEXT NOT NULL,
            element_id TEXT,
            file_path TEXT,
            location_x DOUBLE PRECISION NOT NULL,
            location_y DOUBLE PRECISION NOT NULL,
            location_layer TEXT NOT NULL DEFAULT '',
            location_page TEXT NOT NULL DEFAULT '',
            area_bounds JSONB,
            relative_point JSONB,
            editor_user_id TEXT,
            editor_kind TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_comment_anchor_bindings_thread
            ON comment_anchor_bindings(project_id, comment_id, id);
        """,
        prepare=False,
    )


def _m011_comment_scope_columns(conn) -> None:
    """Keep standalone schema migrations compatible with pre-comparison rows.

    The main store also adds these columns during initialization, but tracker
    workers and migration callers must not depend on that ordering.
    """
    conn.execute(
        ";\n".join((
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'canvas'",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS base_commit TEXT",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS compare_commit TEXT",
        )),
        prepare=False,
    )


MIGRATIONS: List[Tuple[int, str, Callable[[object], None]]] = [
    (1, "identity_revisions_tombstones", _m001_identity_revisions_tombstones),
    (2, "backfill_create_revisions", _m002_backfill_create_revisions),
    (3, "tracked_threads_and_replies", migrate_comments_tracked_links),
    (4, "sync_ops_inbox_and_delete_cascade", _m004_sync_ops_inbox_and_delete_cascade),
    (5, "tracked_threads_external_number", migrate_tracked_threads_external_number),
    (6, "reply_sync_state", _m006_reply_sync_state),
    (7, "tracked_threads_container_path", migrate_tracked_threads_container_path),
    (8, "durable_comment_change_stream", comment_live_events.apply_schema),
    (9, "anchor_binding_history", _m009_anchor_binding_history),
    (10, "tracker_projection_change_stream", apply_tracker_projection_events),
    (11, "comment_scope_columns", _m011_comment_scope_columns),
    # Re-installs the v10 trigger function without retry-bookkeeping columns.
    (12, "tracker_projection_ignores_retry_bookkeeping", apply_tracker_projection_events),
]


def applied_versions(conn) -> set[int]:
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {LEDGER_TABLE} (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    return {int(row["version"]) for row in conn.execute(f"SELECT version FROM {LEDGER_TABLE}").fetchall()}


def apply_comments_migrations(conn) -> List[int]:
    """Apply every pending migration in order; return the versions applied.

    Runs inside the caller's transaction and advisory lock, so a crash in the
    middle of a step rolls the step and its ledger row back together.
    """
    applied = applied_versions(conn)
    newly: List[int] = []
    for version, name, migration in MIGRATIONS:
        if version in applied:
            continue
        logger.info("Applying comments schema migration %s (%s)", version, name)
        migration(conn)
        conn.execute(
            f"INSERT INTO {LEDGER_TABLE}(version, name) VALUES (%s, %s)",
            (version, name),
        )
        newly.append(version)
    return newly
