"""Durable, per-project ordering for comment change notifications.

Call ``record_change`` inside the same transaction as the comment mutation.
PostgreSQL NOTIFY only wakes listeners; ``comment_change_events`` is the replay
source after a disconnected client or API worker resumes.
"""

from __future__ import annotations

import json
from typing import Any


CHANNEL = "prism_comment_changes"


def apply_schema(conn: Any) -> None:
    """Create the stream tables in the caller-selected comments schema."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS comment_stream_heads (
            project_id TEXT PRIMARY KEY,
            cursor BIGINT NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS comment_change_events (
            project_id TEXT NOT NULL,
            cursor BIGINT NOT NULL,
            comment_id TEXT NOT NULL,
            scope TEXT NOT NULL,
            base_commit TEXT,
            compare_commit TEXT,
            change_kind TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (project_id, cursor)
        );
        CREATE INDEX IF NOT EXISTS idx_comment_change_events_thread
            ON comment_change_events(project_id, comment_id, cursor);
        """,
        prepare=False,
    )


def current_cursor(conn: Any, project_id: str) -> int:
    row = conn.execute(
        "SELECT cursor FROM comment_stream_heads WHERE project_id = %s",
        (project_id,),
    ).fetchone()
    return int(row["cursor"]) if row else 0


def record_change(
    conn: Any,
    *,
    project_id: str,
    comment_id: str,
    scope: str,
    change_kind: str,
    base_commit: str | None = None,
    compare_commit: str | None = None,
) -> int:
    """Append a committed-change hint, ordered with all writers to this project.

    Incrementing one project row serializes concurrent writers: a later writer
    cannot obtain its cursor until the earlier writer commits or rolls back.
    The caller owns the transaction and must not acknowledge its mutation first.
    """
    if not project_id or not comment_id:
        raise ValueError("project_id and comment_id are required")
    if scope not in {"canvas", "comparison"}:
        raise ValueError("unsupported comment scope")
    if scope == "comparison" and not (base_commit and compare_commit):
        raise ValueError("comparison events require both commits")
    if scope == "canvas" and (base_commit or compare_commit):
        raise ValueError("canvas events cannot carry comparison commits")
    if change_kind not in {"upsert", "delete", "projection", "anchor"}:
        raise ValueError("unsupported comment change kind")

    conn.execute(
        "INSERT INTO comment_stream_heads(project_id) VALUES (%s) ON CONFLICT DO NOTHING",
        (project_id,),
    )
    row = conn.execute(
        """
        UPDATE comment_stream_heads
        SET cursor = cursor + 1
        WHERE project_id = %s
        RETURNING cursor
        """,
        (project_id,),
    ).fetchone()
    cursor = int(row["cursor"])
    conn.execute(
        """
        INSERT INTO comment_change_events
            (project_id, cursor, comment_id, scope, base_commit, compare_commit, change_kind)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (project_id, cursor, comment_id, scope, base_commit, compare_commit, change_kind),
    )
    conn.execute(
        "SELECT pg_notify(%s, %s)",
        (CHANNEL, json.dumps({"projectId": project_id, "cursor": cursor}, separators=(",", ":"))),
    )
    return cursor


def changes_after(conn: Any, project_id: str, after: int, *, limit: int = 200) -> list[dict[str, Any]]:
    if after < 0 or not 1 <= limit <= 500:
        raise ValueError("invalid comment change cursor or limit")
    rows = conn.execute(
        """
        SELECT cursor, comment_id, scope, base_commit, compare_commit, change_kind, created_at
        FROM comment_change_events
        WHERE project_id = %s AND cursor > %s
        ORDER BY cursor ASC
        LIMIT %s
        """,
        (project_id, after, limit),
    ).fetchall()
    return [
        {
            "cursor": int(row["cursor"]),
            "commentId": row["comment_id"],
            "scope": row["scope"],
            "baseCommit": row["base_commit"],
            "compareCommit": row["compare_commit"],
            "changeKind": row["change_kind"],
            "createdAt": row["created_at"].isoformat().replace("+00:00", "Z"),
        }
        for row in rows
    ]
