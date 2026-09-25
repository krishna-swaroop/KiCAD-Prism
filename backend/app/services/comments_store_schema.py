"""Base tables and additive columns of the comments schema.

Numbered changes live in ``comments_schema_migrations``; this is the
idempotent baseline they build on. The caller holds the schema advisory lock
and has set ``search_path`` to the comments schema.
"""

from __future__ import annotations


def create_base_tables(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS comments (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            author TEXT NOT NULL,
            timestamp TIMESTAMPTZ NOT NULL,
            status TEXT NOT NULL,
            context TEXT NOT NULL,
            location_x REAL NOT NULL,
            location_y REAL NOT NULL,
            location_layer TEXT NOT NULL DEFAULT '',
            location_page TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS comment_replies (
            id TEXT PRIMARY KEY,
            comment_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            author TEXT NOT NULL,
            timestamp TIMESTAMPTZ NOT NULL,
            content TEXT NOT NULL,
            FOREIGN KEY(comment_id) REFERENCES comments(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS project_comment_state (
            project_id TEXT PRIMARY KEY,
            imported_from_json BOOLEAN NOT NULL DEFAULT FALSE,
            imported_at TIMESTAMPTZ,
            last_exported_at TIMESTAMPTZ,
            last_export_commit TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_comments_project
            ON comments(project_id, timestamp, id);
        CREATE INDEX IF NOT EXISTS idx_replies_project_comment
            ON comment_replies(project_id, comment_id, timestamp, id);
        """,
        prepare=False,
    )
    # Keep the additive migration idempotent while paying one remote
    # database round trip instead of one for every column.
    conn.execute(
        ";\n".join((
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS area_x REAL",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS area_y REAL",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS area_w REAL",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS area_h REAL",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS element_id TEXT",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS element_ref TEXT",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS element_type TEXT",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS comment_class TEXT NOT NULL DEFAULT 'general'",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info'",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]'::jsonb",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'canvas'",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS base_commit TEXT",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS compare_commit TEXT",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS comparison_domain TEXT",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS file_path TEXT",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS semantic_item_id TEXT",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS anchor_kind TEXT",
            # Reserved for future GitHub/GitLab Issues projection (unused today).
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS forge_provider TEXT",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS forge_issue_id TEXT",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS forge_issue_url TEXT",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS forge_sync_state TEXT",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS selected_side TEXT",
            "ALTER TABLE comments ADD COLUMN IF NOT EXISTS project_relative_path TEXT",
        )),
        prepare=False,
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_comments_comparison
        ON comments(
            project_id, scope, base_commit, compare_commit,
            comparison_domain, semantic_item_id
        )
        """
    )
