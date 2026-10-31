"""Notes on a line of a project's BOM.

A line is a manufacturer part on a project's BOM, named by the same key the BOM table uses, so a note stays with the part
whichever rows it appears on. Anyone who can read supply data can write a note; its author, or an administrator, can remove it.
Removing deletes it. Every change is audited.
"""

from __future__ import annotations

import uuid
from typing import Any

from app.services.supply.audit import actor_text, write_audit
from app.services.supply.errors import Missing, Refused

MAX_BODY = 1000
MAX_KEY = 200
MAX_PER_LINE = 200


class CommentNotFound(Missing):
    """No comment with this id on this project."""


class CommentError(Refused):
    """The change does not apply. The message is safe to show."""

    code = "invalid_comment"


def _dto(row) -> dict[str, Any]:
    return {
        "id": row["id"], "line_key": row["line_key"], "body": row["body"], "author": row["author"],
        "author_name": row["author_name"], "created_at": row["created_at"].isoformat(),
    }


def for_project(conn, project_id: str) -> list[dict[str, Any]]:
    """Every note of a project, oldest first."""

    rows = conn.execute(
        "SELECT id, line_key, body, author, author_name, created_at FROM supply_bom_comments WHERE project_id = %s ORDER BY created_at, id",
        (project_id,),
    ).fetchall()
    return [_dto(row) for row in rows]


def add(conn, project_id: str, line_key: str, body: str, actor: str, actor_name: str = "") -> dict[str, Any]:
    actor = actor_text(actor)
    line_key, body = line_key.strip(), body.strip()
    if not line_key or len(line_key) > MAX_KEY:
        raise CommentError("A comment belongs to a BOM line.")
    if not body:
        raise CommentError("Write something first.")
    if len(body) > MAX_BODY:
        raise CommentError(f"Keep a comment under {MAX_BODY} characters.")
    count = conn.execute(
        "SELECT COUNT(*) AS n FROM supply_bom_comments WHERE project_id = %s AND line_key = %s", (project_id, line_key)
    ).fetchone()["n"]
    if count >= MAX_PER_LINE:
        raise CommentError(f"A line can have at most {MAX_PER_LINE} comments.")
    comment_id = uuid.uuid4().hex
    row = conn.execute(
        """
        INSERT INTO supply_bom_comments (id, project_id, line_key, body, author, author_name) VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id, line_key, body, author, author_name, created_at
        """,
        (comment_id, project_id, line_key, body, actor, actor_name.strip()[:120]),
    ).fetchone()
    write_audit(conn, actor, "bom_comment.add", comment_id, {"project_id": project_id, "line_key": line_key}, subject_kind="bom_comment")
    return _dto(row)


def remove(conn, project_id: str, comment_id: str, actor: str, *, admin: bool) -> None:
    actor = actor_text(actor)
    row = conn.execute(
        "SELECT author, line_key FROM supply_bom_comments WHERE id = %s AND project_id = %s FOR UPDATE", (comment_id, project_id)
    ).fetchone()
    if row is None:
        raise CommentNotFound(comment_id)
    if row["author"] != actor and not admin:
        raise CommentError("Only its author or an administrator can remove a comment.")
    conn.execute("DELETE FROM supply_bom_comments WHERE id = %s", (comment_id,))
    write_audit(conn, actor, "bom_comment.remove", comment_id, {"project_id": project_id, "line_key": row["line_key"]}, subject_kind="bom_comment")
