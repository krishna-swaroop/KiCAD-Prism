"""Transaction-aware edit, status and tombstone helpers for comment threads.

Every function takes the caller's open connection and runs inside the
caller's transaction, so a root edit, its ``comment_revisions`` row and any
sync operation the tracker adds later commit or roll back together (contract
C2). Nothing here opens a connection or talks to the network.

Optimistic concurrency: a mutation names the revision it was based on and
the ``UPDATE ... WHERE revision = %s`` plus the unique
``(target_kind, target_id, revision)`` history row make two concurrent edits
of the same revision impossible to both succeed. The loser gets
``RevisionConflict`` carrying the current revision.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.services import comment_live_events

ROOT = "root"
REPLY = "reply"

CHANGE_CREATE = "create"
CHANGE_EDIT = "edit"
CHANGE_STATUS = "status"
CHANGE_DELETE = "delete"
CHANGE_REATTACH = "reattach"

ORIGIN_PRISM = "prism"
ORIGIN_REMOTE = "remote"


class RevisionConflict(Exception):
    """The target moved on since the revision the caller edited."""

    def __init__(self, target_kind: str, target_id: str, current_revision: Optional[int]):
        super().__init__(f"{target_kind} {target_id} is at revision {current_revision}")
        self.target_kind = target_kind
        self.target_id = target_id
        self.current_revision = current_revision


@dataclass(frozen=True)
class Editor:
    """Who is making the change and through which door.

    ``user_id`` is the stable actor key (``None`` for remote or system
    edits), ``kind`` one of ``user``/``service``/``guest``/``remote_actor``/
    ``remote_unknown``/``system`` and ``display`` the name shown in history.
    """

    user_id: Optional[str]
    kind: str
    display: str
    origin: str = ORIGIN_PRISM


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def ensure_create_revision(
    conn,
    *,
    project_id: str,
    target_kind: str,
    table: str,
    target_id: str,
) -> None:
    """If this object has no history, snapshot its current row as a create.

    Covers JSON imports and any pre-identity row whose upgrade backfill
    was skipped. Uses only columns every comments/replies table has after
    migration 1.
    """
    existing = conn.execute(
        "SELECT 1 FROM comment_revisions WHERE target_kind = %s AND target_id = %s LIMIT 1",
        (target_kind, target_id),
    ).fetchone()
    if existing:
        return
    if target_kind == ROOT:
        row = conn.execute(
            """
            SELECT content, status, author, author_user_id, author_kind, revision
            FROM comments WHERE project_id = %s AND id = %s
            """,
            (project_id, target_id),
        ).fetchone()
        if not row:
            return
        record_revision(
            conn, project_id=project_id, target_kind=ROOT, target_id=target_id,
            revision=int(row["revision"] or 1), change_kind=CHANGE_CREATE,
            editor=Editor(
                user_id=row.get("author_user_id"),
                kind=row.get("author_kind") or "legacy",
                display=row.get("author") or "",
            ),
            content=row["content"], status=row.get("status"), emit_change=False,
        )
        return
    row = conn.execute(
        """
        SELECT content, author, author_user_id, author_kind, revision, origin
        FROM comment_replies WHERE project_id = %s AND id = %s
        """,
        (project_id, target_id),
    ).fetchone()
    if not row:
        return
    record_revision(
        conn, project_id=project_id, target_kind=REPLY, target_id=target_id,
        revision=int(row["revision"] or 1), change_kind=CHANGE_CREATE,
        editor=Editor(
            user_id=row.get("author_user_id"),
            kind=row.get("author_kind") or "legacy",
            display=row.get("author") or "",
            origin=row.get("origin") or ORIGIN_PRISM,
        ),
        content=row["content"], emit_change=False,
    )


def record_revision(
    conn,
    *,
    project_id: str,
    target_kind: str,
    target_id: str,
    revision: int,
    change_kind: str,
    editor: Editor,
    content: Optional[str] = None,
    severity: Optional[str] = None,
    comment_class: Optional[str] = None,
    status: Optional[str] = None,
    mentions: Optional[List] = None,
    emit_change: bool = True,
) -> None:
    conn.execute(
        """
        INSERT INTO comment_revisions(
            project_id, target_kind, target_id, revision, change_kind,
            content, severity, comment_class, status, mentions,
            editor_user_id, editor_kind, editor_display, origin
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s)
        """,
        (
            project_id, target_kind, target_id, revision, change_kind,
            content, severity, comment_class, status,
            json.dumps(mentions) if mentions is not None else None,
            editor.user_id, editor.kind, editor.display, editor.origin,
        ),
    )
    if emit_change:
        if target_kind == ROOT:
            root = conn.execute(
                "SELECT id, scope, base_commit, compare_commit FROM comments WHERE project_id = %s AND id = %s",
                (project_id, target_id),
            ).fetchone()
        elif target_kind == REPLY:
            root = conn.execute(
                """SELECT c.id, c.scope, c.base_commit, c.compare_commit
                   FROM comments c JOIN comment_replies r ON r.comment_id = c.id
                   WHERE r.project_id = %s AND r.id = %s AND c.project_id = %s""",
                (project_id, target_id, project_id),
            ).fetchone()
        else:
            raise ValueError(f"Unknown comment target kind: {target_kind}")
        if root is None:
            raise ValueError(f"Comment root missing for {target_kind} {target_id}")
        comment_live_events.record_change(
            conn, project_id=project_id, comment_id=root["id"],
            scope=root["scope"], base_commit=root["base_commit"],
            compare_commit=root["compare_commit"],
            change_kind="delete" if change_kind == CHANGE_DELETE and target_kind == ROOT else "upsert",
        )


def _current_revision(conn, table: str, project_id: str, target_id: str) -> Optional[int]:
    row = conn.execute(
        f"SELECT revision FROM {table} WHERE project_id = %s AND id = %s AND deleted_at IS NULL",
        (project_id, target_id),
    ).fetchone()
    return int(row["revision"]) if row else None


def _bump(
    conn,
    table: str,
    *,
    project_id: str,
    target_id: str,
    expected_revision: Optional[int],
    assignments: Dict[str, object],
    target_kind: str,
) -> int:
    """Apply ``assignments`` and advance the revision, or raise RevisionConflict.

    Returns the new revision. With ``expected_revision=None`` the caller
    accepts whatever the current revision is (used by cascades and by
    inbound remote changes, which have no local expectation).
    """
    now = _now()
    columns = ", ".join(f"{name} = %s" for name in assignments)
    params: List[object] = list(assignments.values()) + [now, project_id, target_id]
    guard = ""
    if expected_revision is not None:
        guard = " AND revision = %s"
        params.append(expected_revision)
    row = conn.execute(
        f"""
        UPDATE {table}
        SET {columns}, revision = revision + 1, updated_at = %s
        WHERE project_id = %s AND id = %s AND deleted_at IS NULL{guard}
        RETURNING revision
        """,
        tuple(params),
    ).fetchone()
    if row is None:
        raise RevisionConflict(target_kind, target_id, _current_revision(conn, table, project_id, target_id))
    return int(row["revision"])


def edit_root(
    conn,
    *,
    project_id: str,
    comment_id: str,
    editor: Editor,
    expected_revision: Optional[int],
    content: Optional[str] = None,
    severity: Optional[str] = None,
    comment_class: Optional[str] = None,
    mentions: Optional[List] = None,
) -> int:
    assignments: Dict[str, object] = {}
    if content is not None:
        assignments["content"] = content
    if severity is not None:
        assignments["severity"] = severity
    if comment_class is not None:
        assignments["comment_class"] = comment_class
    if mentions is not None:
        assignments["mentions"] = json.dumps(mentions)
    if not assignments:
        raise ValueError("edit_root needs at least one field")
    ensure_create_revision(
        conn, project_id=project_id, target_kind=ROOT, table="comments", target_id=comment_id,
    )
    revision = _bump(
        conn, "comments", project_id=project_id, target_id=comment_id,
        expected_revision=expected_revision, assignments=assignments, target_kind=ROOT,
    )
    record_revision(
        conn, project_id=project_id, target_kind=ROOT, target_id=comment_id, revision=revision,
        change_kind=CHANGE_EDIT, editor=editor, content=content, severity=severity,
        comment_class=comment_class, mentions=mentions,
    )
    return revision


def set_root_status(
    conn,
    *,
    project_id: str,
    comment_id: str,
    status: str,
    editor: Editor,
    expected_revision: Optional[int],
) -> int:
    ensure_create_revision(
        conn, project_id=project_id, target_kind=ROOT, table="comments", target_id=comment_id,
    )
    revision = _bump(
        conn, "comments", project_id=project_id, target_id=comment_id,
        expected_revision=expected_revision, assignments={"status": status}, target_kind=ROOT,
    )
    record_revision(
        conn, project_id=project_id, target_kind=ROOT, target_id=comment_id, revision=revision,
        change_kind=CHANGE_STATUS, editor=editor, status=status,
    )
    return revision


def edit_reply(
    conn,
    *,
    project_id: str,
    reply_id: str,
    content: str,
    editor: Editor,
    expected_revision: Optional[int],
) -> int:
    ensure_create_revision(
        conn, project_id=project_id, target_kind=REPLY, table="comment_replies", target_id=reply_id,
    )
    revision = _bump(
        conn, "comment_replies", project_id=project_id, target_id=reply_id,
        expected_revision=expected_revision, assignments={"content": content}, target_kind=REPLY,
    )
    record_revision(
        conn, project_id=project_id, target_kind=REPLY, target_id=reply_id, revision=revision,
        change_kind=CHANGE_EDIT, editor=editor, content=content,
    )
    return revision


def tombstone_reply(
    conn,
    *,
    project_id: str,
    reply_id: str,
    editor: Editor,
    expected_revision: Optional[int],
) -> int:
    ensure_create_revision(
        conn, project_id=project_id, target_kind=REPLY, table="comment_replies", target_id=reply_id,
    )
    revision = _bump(
        conn, "comment_replies", project_id=project_id, target_id=reply_id,
        expected_revision=expected_revision,
        assignments={"deleted_at": _now(), "deleted_by": editor.user_id or editor.kind}, target_kind=REPLY,
    )
    record_revision(
        conn, project_id=project_id, target_kind=REPLY, target_id=reply_id, revision=revision,
        change_kind=CHANGE_DELETE, editor=editor,
    )
    return revision


def tombstone_root(
    conn,
    *,
    project_id: str,
    comment_id: str,
    editor: Editor,
    expected_revision: Optional[int],
) -> int:
    """Tombstone a root and every live reply under it, keeping all history."""
    ensure_create_revision(
        conn, project_id=project_id, target_kind=ROOT, table="comments", target_id=comment_id,
    )
    revision = _bump(
        conn, "comments", project_id=project_id, target_id=comment_id,
        expected_revision=expected_revision,
        assignments={"deleted_at": _now(), "deleted_by": editor.user_id or editor.kind}, target_kind=ROOT,
    )
    record_revision(
        conn, project_id=project_id, target_kind=ROOT, target_id=comment_id, revision=revision,
        change_kind=CHANGE_DELETE, editor=editor,
    )
    live_replies = conn.execute(
        "SELECT id FROM comment_replies WHERE project_id = %s AND comment_id = %s AND deleted_at IS NULL",
        (project_id, comment_id),
    ).fetchall()
    for row in live_replies:
        tombstone_reply(conn, project_id=project_id, reply_id=row["id"], editor=editor, expected_revision=None)
    return revision


def history(conn, *, project_id: str, target_kind: str, target_id: str) -> List[Dict]:
    rows = conn.execute(
        """
        SELECT revision, change_kind, content, severity, comment_class, status, mentions,
               editor_user_id, editor_kind, editor_display, origin, created_at
        FROM comment_revisions
        WHERE project_id = %s AND target_kind = %s AND target_id = %s
        ORDER BY revision ASC
        """,
        (project_id, target_kind, target_id),
    ).fetchall()
    return [
        {
            "targetKind": target_kind,
            "targetId": target_id,
            "revision": int(row["revision"]),
            "changeKind": row["change_kind"],
            "content": row["content"],
            "severity": row["severity"],
            "commentClass": row["comment_class"],
            "status": row["status"],
            "mentions": row["mentions"],
            "editorUserId": row["editor_user_id"],
            "editorKind": row["editor_kind"],
            "editorDisplay": row["editor_display"],
            "origin": row["origin"],
            "editedAt": row["created_at"].isoformat().replace("+00:00", "Z") if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
        }
        for row in rows
    ]
