"""Atomic reply mutation enqueue (TR-29, C2/C4/C5).

Authorized reply create/edit/delete ops commit on the caller connection in the
same transaction as the reply revision. Ops are keyed by ``reply:{id}`` in
``expected_remote_state`` and ordered behind root ``create_issue`` confirmation.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Mapping, Optional

from app.core.roles import Role, normalize_role, role_meets_minimum
from app.services.trackers.op_store import LIVE_STATES, OpStore
from app.services.trackers.promotion import (
    DispatchPause,
    PublicationDenied,
    PromotionActor,
    PromotionResult,
    _live_thread,
    actor_can_publish,
    evaluate_dispatch,
    load_policy_row,
)
from app.services.trackers.provenance import body_hash

REPLY_TARGET_PREFIX = "reply:"
REPLY_OPS = frozenset({"add_comment", "edit_comment", "delete_comment"})
WORKSPACE_SCHEMA = "workspace"


@dataclass(frozen=True)
class ReplyMutationResult:
    action: str
    op_id: str | None = None
    thread_id: str | None = None
    reason: str | None = None
    code: str | None = None


def encode_reply_target(reply_id: str) -> str:
    return f"{REPLY_TARGET_PREFIX}{reply_id}"


def decode_reply_target(value: str | None) -> str | None:
    text = str(value or "")
    if text.startswith(REPLY_TARGET_PREFIX):
        return text[len(REPLY_TARGET_PREFIX) :]
    return None


def _new_op_id() -> str:
    # Reply ops must sort after pending ``create_issue`` rows (``op_<hex>``) so
    # per-thread claim never deadlocks behind an earlier ``add_comment``.
    return f"op_z_{uuid.uuid4().hex[:11]}"


def _is_prism_reply(reply: Mapping[str, Any]) -> bool:
    return str(reply.get("origin") or "prism") == "prism"


def _thread_enqueueable(thread: Mapping[str, Any]) -> bool:
    """A live thread may accept reply ops while root creation is still pending."""

    return str(thread.get("external_id") or "") not in ("",)


def _thread_ready(thread: Mapping[str, Any]) -> bool:
    external_id = str(thread.get("external_id") or "")
    return external_id not in ("", "pending")


def _reply_link(conn: Any, reply_id: str) -> Optional[dict]:
    row = conn.execute(
        """
        SELECT tr.*, tt.unlinked_at, tt.link_state, tt.paused_reason
        FROM tracked_replies tr
        JOIN tracked_threads tt ON tt.id = tr.tracked_thread_id
        WHERE tr.reply_id = %s
        """,
        (reply_id,),
    ).fetchone()
    return dict(row) if row else None


def _live_reply_ops(
    conn: Any,
    thread_id: str,
    reply_id: str,
    *,
    op_kinds: tuple[str, ...] | None = None,
) -> list[dict]:
    kinds = list(op_kinds or tuple(REPLY_OPS))
    rows = conn.execute(
        """
        SELECT * FROM sync_ops
        WHERE tracked_thread_id = %s
          AND op = ANY(%s)
          AND state = ANY(%s)
          AND expected_remote_state = %s
        ORDER BY created_at ASC, id ASC
        """,
        (thread_id, kinds, list(LIVE_STATES), encode_reply_target(reply_id)),
    ).fetchall()
    return [dict(row) for row in rows]


def _supersede_stale_ops(
    conn: Any,
    *,
    thread_id: str,
    reply_id: str,
    min_revision: int,
    except_op_id: str | None = None,
) -> None:
    ops = OpStore(conn)
    for row in _live_reply_ops(conn, thread_id, reply_id):
        if except_op_id and str(row["id"]) == except_op_id:
            continue
        if int(row.get("local_revision") or 0) < min_revision:
            ops.supersede(str(row["id"]), int(row["fence"]), reason="superseded by newer local revision")


def _enqueue_reply_op(
    conn: Any,
    *,
    thread: Mapping[str, Any],
    reply: Mapping[str, Any],
    op_kind: str,
    actor: PromotionActor,
    expected_body_hash: str | None = None,
) -> ReplyMutationResult:
    if not _is_prism_reply(reply):
        return ReplyMutationResult(action="skipped", reason="remote_origin")
    thread_id = str(thread["id"])
    reply_id = str(reply["id"])
    revision = int(reply.get("revision") or 1)
    _supersede_stale_ops(conn, thread_id=thread_id, reply_id=reply_id, min_revision=revision)
    pending = _live_reply_ops(conn, thread_id, reply_id, op_kinds=(op_kind,))
    if pending:
        return ReplyMutationResult(
            action="existing",
            op_id=str(pending[0]["id"]),
            thread_id=thread_id,
            reason="pending_op",
        )
    op_id = _new_op_id()
    OpStore(conn).insert(
        op_id=op_id,
        tracked_thread_id=thread_id,
        op=op_kind,
        destination_generation=int(thread["destination_generation"]),
        local_revision=revision,
        actor_user_id=actor.user_id,
        expected_remote_state=encode_reply_target(reply_id),
        expected_body_hash=expected_body_hash,
    )
    return ReplyMutationResult(action="enqueued", op_id=op_id, thread_id=thread_id)


def after_reply_added(
    conn: Any,
    *,
    project_id: str,
    comment: Mapping[str, Any],
    reply: Mapping[str, Any],
    actor: PromotionActor,
    workspace_schema: str = WORKSPACE_SCHEMA,
) -> PromotionResult:
    thread = _live_thread(conn, str(comment["id"]))
    if thread is None or not _thread_enqueueable(thread):
        return PromotionResult(action="skipped")
    if not _is_prism_reply(reply):
        return PromotionResult(action="skipped")

    policy = load_policy_row(conn, project_id, workspace_schema=workspace_schema)
    if policy is None:
        return PromotionResult(action="skipped")

    if not actor_can_publish(actor, policy):
        return PromotionResult(action="unsynced", reason="publication_required", code="publication_required")

    try:
        evaluate_dispatch(conn, project_id, actor.role, workspace_schema=workspace_schema)
    except PublicationDenied as exc:
        return PromotionResult(action="unsynced", reason=exc.code, code=exc.code)
    except DispatchPause as exc:
        return PromotionResult(action="unsynced", reason=exc.reason, code=exc.reason)

    content = str(reply.get("content") or "")
    outcome = _enqueue_reply_op(
        conn,
        thread=thread,
        reply=reply,
        op_kind="add_comment",
        actor=actor,
        expected_body_hash=body_hash(content),
    )
    return PromotionResult(
        action=outcome.action,
        op_id=outcome.op_id,
        thread_id=outcome.thread_id,
        reason=outcome.reason,
        code=outcome.code,
    )


def share_reply(
    conn: Any,
    *,
    project_id: str,
    comment: Mapping[str, Any],
    reply: Mapping[str, Any],
    actor: PromotionActor,
    workspace_schema: str = WORKSPACE_SCHEMA,
) -> PromotionResult:
    evaluate_dispatch(conn, project_id, actor.role, workspace_schema=workspace_schema)
    thread = _live_thread(conn, str(comment["id"]))
    if thread is None or not _thread_enqueueable(thread):
        raise PublicationDenied("publication_required", "Thread is not linked to the tracker")
    content = str(reply.get("content") or "")
    outcome = _enqueue_reply_op(
        conn,
        thread=thread,
        reply=reply,
        op_kind="add_comment",
        actor=actor,
        expected_body_hash=body_hash(content),
    )
    return PromotionResult(
        action=outcome.action,
        op_id=outcome.op_id,
        thread_id=outcome.thread_id,
        reason=outcome.reason,
        code=outcome.code,
    )


def after_reply_edited(
    conn: Any,
    *,
    project_id: str,
    comment: Mapping[str, Any],
    reply: Mapping[str, Any],
    actor: PromotionActor,
    workspace_schema: str = WORKSPACE_SCHEMA,
) -> ReplyMutationResult:
    thread = _live_thread(conn, str(comment["id"]))
    if thread is None or not _thread_ready(thread):
        return ReplyMutationResult(action="skipped")
    if thread.get("unlinked_at") is not None:
        return ReplyMutationResult(action="skipped", reason="unlinked")
    if not _is_prism_reply(reply):
        return ReplyMutationResult(action="skipped", reason="remote_origin")

    link = _reply_link(conn, str(reply["id"]))
    if link is None:
        return ReplyMutationResult(action="skipped", reason="not_synced")

    policy = load_policy_row(conn, project_id, workspace_schema=workspace_schema)
    if policy is None:
        return ReplyMutationResult(action="skipped")

    if not actor_can_publish(actor, policy):
        return ReplyMutationResult(action="skipped", reason="publication_required", code="publication_required")

    try:
        evaluate_dispatch(conn, project_id, actor.role, workspace_schema=workspace_schema)
    except (PublicationDenied, DispatchPause):
        return ReplyMutationResult(action="skipped", reason="publication_paused")

    content = str(reply.get("content") or "")
    return _enqueue_reply_op(
        conn,
        thread=thread,
        reply=reply,
        op_kind="edit_comment",
        actor=actor,
        expected_body_hash=body_hash(content),
    )


def after_reply_deleted(
    conn: Any,
    *,
    project_id: str,
    comment: Mapping[str, Any],
    reply: Mapping[str, Any],
    actor: PromotionActor,
    workspace_schema: str = WORKSPACE_SCHEMA,
) -> ReplyMutationResult:
    thread = _live_thread(conn, str(comment["id"]))
    if thread is None or not _thread_ready(thread):
        return ReplyMutationResult(action="skipped")
    if thread.get("unlinked_at") is not None:
        return ReplyMutationResult(action="skipped", reason="unlinked")
    if not _is_prism_reply(reply):
        return ReplyMutationResult(action="skipped", reason="remote_origin")

    link = _reply_link(conn, str(reply["id"]))
    if link is None:
        return ReplyMutationResult(action="skipped", reason="not_synced")

    policy = load_policy_row(conn, project_id, workspace_schema=workspace_schema)
    if policy is None:
        return ReplyMutationResult(action="skipped")

    if not actor_can_publish(actor, policy):
        return ReplyMutationResult(action="skipped", reason="publication_required", code="publication_required")

    try:
        evaluate_dispatch(conn, project_id, actor.role, workspace_schema=workspace_schema)
    except (PublicationDenied, DispatchPause):
        return ReplyMutationResult(action="skipped", reason="publication_paused")

    return _enqueue_reply_op(
        conn,
        thread=thread,
        reply=reply,
        op_kind="delete_comment",
        actor=actor,
    )


__all__ = [
    "REPLY_OPS",
    "ReplyMutationResult",
    "after_reply_added",
    "after_reply_deleted",
    "after_reply_edited",
    "decode_reply_target",
    "encode_reply_target",
    "share_reply",
]
