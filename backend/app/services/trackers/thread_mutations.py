"""Atomic root mutation enqueue and inbound prose application (TR-30, C4/C5/C6/D5).

Root prose/title/label updates enqueue ``update_issue`` on the caller connection.
Local promoted-root deletion enqueues an idempotent ``post_note`` then unlinks
while preserving the note op and audit lineage.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from typing import Any, Mapping, Optional

from app.services.comments_revisions import Editor, edit_root
from app.services.trackers.drafts import (
    CONTEXT_BLOCK_END,
    CONTEXT_BLOCK_START,
    PROSE_BLOCK_END,
    PROSE_BLOCK_START,
    compose_issue_body,
    strip_untrusted_tracker_markup,
)
from app.services.trackers.markers import ParsedMarker, extract_markers
from app.services.trackers.op_store import LIVE_STATES, OpStore
from app.services.trackers.promotion import (
    PromotionActor,
    PromotionResult,
    _live_thread,
    _pending_update_op,
    actor_can_publish,
    evaluate_dispatch,
    load_policy_row,
)
from app.services.trackers.provenance import (
    body_hash,
    find_body_echo,
    resolve_editor,
    stored_hash_matches,
)
from app.services.trackers.publication_policy import DispatchPause, PublicationDenied
from app.services.trackers.store import TrackerStore

THREAD_OPS = frozenset({"update_issue", "post_note"})
DELETION_NOTE = "This comment was deleted in Prism"
UNLINK_REASON = "local_root_deleted"
WORKSPACE_SCHEMA = "workspace"

_PROSE_RE = re.compile(
    rf"{re.escape(PROSE_BLOCK_START)}\s*(.*?)\s*{re.escape(PROSE_BLOCK_END)}",
    re.DOTALL,
)
_CONTEXT_RE = re.compile(
    rf"{re.escape(CONTEXT_BLOCK_START)}\s*(.*?)\s*{re.escape(CONTEXT_BLOCK_END)}",
    re.DOTALL,
)


@dataclass(frozen=True)
class IssueBodyBlocks:
    prose: str
    context: str
    marker: ParsedMarker


@dataclass(frozen=True)
class ThreadMutationResult:
    action: str
    op_id: str | None = None
    thread_id: str | None = None
    reason: str | None = None
    code: str | None = None


def _new_op_id() -> str:
    return f"op_{uuid.uuid4().hex[:12]}"


def parse_issue_body_blocks(body: str) -> IssueBodyBlocks | None:
    """Extract prose/context/marker blocks or None when the body diverged (D5)."""

    text = body or ""
    prose_match = _PROSE_RE.search(text)
    context_match = _CONTEXT_RE.search(text)
    markers = [marker for marker in extract_markers(text) if marker.comment_id]
    if prose_match is None or context_match is None or not markers:
        return None
    return IssueBodyBlocks(
        prose=prose_match.group(1).strip(),
        context=context_match.group(1).strip(),
        marker=markers[-1],
    )


def compose_outbound_issue_body(
    *,
    local_prose: str,
    remote_body: str,
) -> str | None:
    """Rewrite only the prose block; preserve context and marker from remote."""

    blocks = parse_issue_body_blocks(remote_body)
    if blocks is None:
        return None
    prose = strip_untrusted_tracker_markup(local_prose)
    return compose_issue_body(
        prose_block=prose,
        context_block=blocks.context,
        marker=blocks.marker.raw,
    )


def _thread_ready(thread: Mapping[str, Any]) -> bool:
    external_id = str(thread.get("external_id") or "")
    return external_id not in ("", "pending")


def _enqueue_update_issue(
    conn: Any,
    *,
    thread: Mapping[str, Any],
    comment: Mapping[str, Any],
    actor: PromotionActor,
    expected_body_hash: str | None = None,
) -> ThreadMutationResult:
    thread_id = str(thread["id"])
    pending = _pending_update_op(conn, thread_id)
    if pending is not None:
        return ThreadMutationResult(
            action="existing",
            op_id=str(pending["id"]),
            thread_id=thread_id,
            reason="pending_op",
        )
    op_id = _new_op_id()
    OpStore(conn).insert(
        op_id=op_id,
        tracked_thread_id=thread_id,
        op="update_issue",
        destination_generation=int(thread["destination_generation"]),
        local_revision=int(comment.get("revision") or 1),
        actor_user_id=actor.user_id,
        actor_role=actor.role,
        expected_body_hash=expected_body_hash,
    )
    return ThreadMutationResult(action="enqueued", op_id=op_id, thread_id=thread_id)


def after_root_content_edited(
    conn: Any,
    *,
    project_id: str,
    comment: Mapping[str, Any],
    actor: PromotionActor,
    workspace_schema: str = WORKSPACE_SCHEMA,
) -> ThreadMutationResult:
    """Enqueue ``update_issue`` when linked root prose changes locally."""

    thread = _live_thread(conn, str(comment["id"]))
    if thread is None or not _thread_ready(thread):
        return ThreadMutationResult(action="skipped", reason="not_linked")
    if str(thread.get("body_authority") or "prism") == "forge":
        return ThreadMutationResult(action="skipped", reason="body_authority_forge")

    policy = load_policy_row(conn, project_id, workspace_schema=workspace_schema)
    if policy is None:
        return ThreadMutationResult(action="skipped")

    if not actor_can_publish(actor, policy):
        return ThreadMutationResult(action="skipped", reason="publication_required", code="publication_required")

    try:
        evaluate_dispatch(conn, project_id, actor.role, workspace_schema=workspace_schema)
    except (PublicationDenied, DispatchPause):
        return ThreadMutationResult(action="skipped", reason="publication_paused")

    content = str(comment.get("content") or "")
    return _enqueue_update_issue(
        conn,
        thread=thread,
        comment=comment,
        actor=actor,
        expected_body_hash=body_hash(strip_untrusted_tracker_markup(content)),
    )


def _pending_post_note(conn: Any, thread_id: str) -> Optional[dict]:
    row = conn.execute(
        """
        SELECT * FROM sync_ops
        WHERE tracked_thread_id = %s
          AND op = 'post_note'
          AND state = ANY(%s)
        ORDER BY created_at ASC, id ASC
        LIMIT 1
        """,
        (thread_id, list(LIVE_STATES)),
    ).fetchone()
    return dict(row) if row else None


def unlink_preserving_deletion_note(
    conn: Any,
    thread_id: str,
    *,
    reason: str,
    actor_user_id: str | None = None,
    project_id: str | None = None,
    connector_id: str | None = None,
) -> dict[str, Any]:
    """Unlink a thread while keeping a live ``post_note`` op for the deletion note."""

    ops = OpStore(conn)
    superseded: list[str] = []
    for row in ops.list_thread(thread_id):
        # R4-M1 / D2: only cancel pending work; leave sent/recovering to recovery.
        if str(row.get("state") or "") != "pending":
            continue
        if str(row.get("op") or "") == "post_note":
            continue
        try:
            ops.supersede(str(row["id"]), int(row.get("fence") or 0), reason=f"unlink:{reason}")
            superseded.append(str(row["id"]))
        except Exception:
            continue
    store = TrackerStore(conn)
    thread = store.unlink_thread(thread_id, reason=reason)
    store.audit(
        action="thread.unlink",
        actor_user_id=actor_user_id,
        connector_id=connector_id,
        project_id=project_id,
        detail={"threadId": thread_id, "reason": reason, "supersededOps": superseded},
    )
    return {"thread": thread, "supersededOps": superseded}


def after_root_deleted(
    conn: Any,
    *,
    project_id: str,
    comment_id: str,
    actor: PromotionActor,
    workspace_schema: str = WORKSPACE_SCHEMA,
) -> PromotionResult:
    """Enqueue idempotent deletion note then unlink without deleting the remote issue."""

    thread = _live_thread(conn, comment_id)
    if thread is None or not _thread_ready(thread):
        return PromotionResult(action="skipped", reason="not_linked")

    policy = load_policy_row(conn, project_id, workspace_schema=workspace_schema)
    if policy is None:
        return PromotionResult(action="skipped")

    if not actor_can_publish(actor, policy):
        return PromotionResult(action="skipped", reason="publication_required", code="publication_required")

    try:
        evaluate_dispatch(conn, project_id, actor.role, workspace_schema=workspace_schema)
    except (PublicationDenied, DispatchPause):
        return PromotionResult(action="skipped", reason="publication_paused")

    thread_id = str(thread["id"])
    pending = _pending_post_note(conn, thread_id)
    if pending is not None:
        op_id = str(pending["id"])
        action = "existing"
    else:
        op_id = _new_op_id()
        OpStore(conn).insert(
            op_id=op_id,
            tracked_thread_id=thread_id,
            op="post_note",
            destination_generation=int(thread["destination_generation"]),
            local_revision=None,
            actor_user_id=actor.user_id,
            actor_role=actor.role,
            expected_body_hash=body_hash(DELETION_NOTE),
        )
        action = "enqueued"

    unlink_preserving_deletion_note(
        conn,
        thread_id,
        reason=UNLINK_REASON,
        actor_user_id=actor.user_id,
        project_id=project_id,
        connector_id=str(thread.get("connector_id") or ""),
    )
    return PromotionResult(action=action, op_id=op_id, thread_id=thread_id)


def apply_inbound_root_prose(
    conn: Any,
    *,
    thread: Mapping[str, Any],
    issue_body: str,
    ops: OpStore,
    project_id: str,
    comment_id: str,
    event_actor_id: str | None = None,
    event_actor_login: str | None = None,
    bot_user_id: str | None = None,
    bot_login: str | None = None,
) -> str:
    """Mirror inbound prose-block edits; never mutate anchor/severity (D5/C6)."""

    if str(thread.get("body_authority") or "prism") == "forge":
        return "skipped_forge"
    if thread.get("unlinked_at") is not None:
        return "skipped_unlinked"

    blocks = parse_issue_body_blocks(issue_body)
    if blocks is None:
        conn.execute(
            "UPDATE tracked_threads SET body_authority = 'forge' WHERE id = %s",
            (str(thread["id"]),),
        )
        return "diverged"

    thread_ops = conn.execute(
        """
        SELECT * FROM sync_ops
        WHERE tracked_thread_id = %s
        ORDER BY created_at ASC, id ASC
        """,
        (str(thread["id"]),),
    ).fetchall()
    op_rows = [dict(row) for row in thread_ops]
    echo = find_body_echo(
        op_rows,
        fetched_body=issue_body,
        bot_user_id=bot_user_id,
        bot_login=bot_login,
        event_actor_id=event_actor_id,
        event_actor_login=event_actor_login,
    )
    if echo is not None:
        row = ops.get(echo.op_id)
        fence = int(row.get("fence") or 0)
        state = str(row.get("state") or "")
        if state == "sent":
            ops.confirm(echo.op_id, fence)
        elif state == "confirmed":
            pass
        elif fence:
            ops.confirm(echo.op_id, fence)
        return "ignored_echo"

    current = conn.execute(
        "SELECT content, severity, anchor_commit FROM comments WHERE project_id = %s AND id = %s",
        (project_id, comment_id),
    ).fetchone()
    if current is None:
        return "unchanged"
    if str(current.get("content") or "") == blocks.prose:
        return "unchanged"

    editor = resolve_editor(actor_id=event_actor_id, actor_login=event_actor_login)
    edit_root(
        conn,
        project_id=project_id,
        comment_id=comment_id,
        content=blocks.prose,
        editor=editor,
        expected_revision=None,
    )
    after = conn.execute(
        "SELECT severity, anchor_commit FROM comments WHERE project_id = %s AND id = %s",
        (project_id, comment_id),
    ).fetchone()
    if after is not None:
        if str(after.get("severity") or "") != str(current.get("severity") or ""):
            raise RuntimeError("inbound prose must not mutate severity")
        if str(after.get("anchor_commit") or "") != str(current.get("anchor_commit") or ""):
            raise RuntimeError("inbound prose must not mutate anchor")
    return "applied"


def should_rewrite_title(thread: Mapping[str, Any], remote_title: str) -> bool:
    stored = str(thread.get("last_title_hash") or "").strip()
    if not stored:
        return True
    return stored_hash_matches(stored, remote_title)


__all__ = [
    "DELETION_NOTE",
    "THREAD_OPS",
    "UNLINK_REASON",
    "IssueBodyBlocks",
    "ThreadMutationResult",
    "after_root_content_edited",
    "after_root_deleted",
    "apply_inbound_root_prose",
    "compose_outbound_issue_body",
    "parse_issue_body_blocks",
    "should_rewrite_title",
    "unlink_preserving_deletion_note",
]
