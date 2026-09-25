"""Wire-format tracker projections, retry and sync history (TR-35, C5/C7/C8).

Builds comment-embedded ``tracker`` objects plus sanitized sync-op history.
Observed remote state, pending local intent and link existence stay separate
fields so the UI never collapses inaccessible/deleted/transferred/paused/failed
into one ambiguous badge.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Mapping, Optional

from app.services.comment_permissions import (
    ActorIdentity,
    CommentAction,
    CommentPermissionError,
    authorize,
)
from app.services.trackers.errors import PROVIDER_ERROR_CLASSES
from app.services.trackers.op_store import LIVE_STATES
from app.services.trackers.promotion import (
    WORKSPACE_SCHEMA,
    is_anchor_promotable,
    load_policy_row,
)
from app.services.trackers.publication_policy import DispatchPause, PublicationDenied

LIVE_OP_STATES = tuple(LIVE_STATES)
RETRYABLE_OP_STATES = ("failed", "quarantine")
SECRET_HISTORY_KEYS = frozenset(
    {
        "claimed_by",
        "expected_remote_version",
        "expected_body_hash",
        "lineage_of",
    }
)


def _qual(schema: str, table: str) -> str:
    return f'"{schema}"."{table}"'


def _iso8601(dt: Any) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        value = dt.astimezone(timezone.utc)
        return value.isoformat().replace("+00:00", "Z")
    return str(dt)


def _remote_updated_at(thread: Mapping[str, Any]) -> str | None:
    version = thread.get("remote_version")
    if isinstance(version, str):
        try:
            version = json.loads(version)
        except json.JSONDecodeError:
            return None
    if isinstance(version, Mapping):
        updated = version.get("updatedAt") or version.get("updated_at")
        return _iso8601(updated) if updated else None
    return None


def _wire_provider_error(raw: Any) -> dict | None:
    if raw is None:
        return None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return None
    if not isinstance(raw, Mapping):
        return None
    class_ = str(raw.get("class") or raw.get("class_") or "transient")
    if class_ not in PROVIDER_ERROR_CLASSES:
        class_ = "transient"
    message = str(raw.get("message") or "sync failed")
    return {
        "class": class_,
        "message": message[:300],
        "resumeAt": raw.get("resumeAt") or raw.get("resume_at"),
        "status": raw.get("status"),
        "retryable": bool(raw.get("retryable", class_ in {"rate_limited", "transient"})),
        "newRef": raw.get("newRef") or raw.get("new_ref"),
    }


def _pending_intent(op: Mapping[str, Any]) -> str:
    kind = str(op.get("op") or "")
    if kind == "set_state":
        target = op.get("expected_remote_state")
        if target:
            return f"set_state:{target}"
    return kind


def _sync_state(*, live_op: Mapping[str, Any] | None, failed_op: Mapping[str, Any] | None, linked: bool) -> str:
    if live_op is not None:
        state = str(live_op.get("state") or "pending")
        if state in {"sent", "recovering"}:
            return "sent"
        if state == "quarantine":
            return "quarantine"
        return "pending"
    if failed_op is not None:
        return "failed"
    if linked:
        return "confirmed"
    return "pending"


def _reply_sync_from_link(link: Mapping[str, Any]) -> dict:
    return {
        "state": "confirmed",
        "externalCommentId": str(link["external_comment_id"]),
        "externalUrl": link.get("external_url"),
    }


def _unsynced_local_sync() -> dict:
    return {"state": "unsynced_local", "reason": "publication_required"}


def _reply_is_unsynced_local(reply: Mapping[str, Any], *, unsynced_reply_ids: Optional[set[str]] = None) -> bool:
    reply_id = str(reply.get("id") or "")
    if unsynced_reply_ids and reply_id in unsynced_reply_ids:
        return True
    return str(reply.get("syncState") or "") == "unsynced_local"


class _ListingProjectionContext:
    __slots__ = (
        "policy",
        "threads_by_comment",
        "live_by_thread",
        "failed_by_thread",
        "links_by_reply",
    )

    def __init__(
        self,
        *,
        policy: Optional[dict],
        threads_by_comment: dict[str, dict],
        live_by_thread: dict[str, dict],
        failed_by_thread: dict[str, dict],
        links_by_reply: dict[str, dict],
    ) -> None:
        self.policy = policy
        self.threads_by_comment = threads_by_comment
        self.live_by_thread = live_by_thread
        self.failed_by_thread = failed_by_thread
        self.links_by_reply = links_by_reply


def _load_listing_projection_context(
    conn: Any,
    project_id: str,
    comments: list[dict],
    *,
    workspace_schema: str = WORKSPACE_SCHEMA,
) -> _ListingProjectionContext:
    policy = load_policy_row(conn, project_id, workspace_schema=workspace_schema)
    comment_ids = [str(comment["id"]) for comment in comments if is_anchor_promotable(comment)]
    threads_by_comment: dict[str, dict] = {}
    if comment_ids:
        rows = conn.execute(
            """
            SELECT DISTINCT ON (comment_id) *
            FROM tracked_threads
            WHERE comment_id = ANY(%s) AND unlinked_at IS NULL
            ORDER BY comment_id, id DESC
            """,
            (comment_ids,),
        ).fetchall()
        for row in rows:
            threads_by_comment[str(row["comment_id"])] = dict(row)

    thread_ids = [str(thread["id"]) for thread in threads_by_comment.values()]
    live_by_thread: dict[str, dict] = {}
    failed_by_thread: dict[str, dict] = {}
    if thread_ids:
        live_rows = conn.execute(
            """
            SELECT DISTINCT ON (tracked_thread_id) *
            FROM sync_ops
            WHERE tracked_thread_id = ANY(%s) AND state = ANY(%s)
            ORDER BY tracked_thread_id, created_at ASC, id ASC
            """,
            (thread_ids, list(LIVE_OP_STATES)),
        ).fetchall()
        for row in live_rows:
            live_by_thread[str(row["tracked_thread_id"])] = dict(row)

        failed_rows = conn.execute(
            """
            SELECT DISTINCT ON (tracked_thread_id) *
            FROM sync_ops
            WHERE tracked_thread_id = ANY(%s) AND state = ANY(%s)
            ORDER BY tracked_thread_id, created_at DESC, id DESC
            """,
            (thread_ids, list(RETRYABLE_OP_STATES)),
        ).fetchall()
        for row in failed_rows:
            failed_by_thread[str(row["tracked_thread_id"])] = dict(row)

    reply_ids = [
        str(reply.get("id"))
        for comment in comments
        for reply in comment.get("replies", [])
        if reply.get("id")
    ]
    links_by_reply: dict[str, dict] = {}
    if reply_ids:
        rows = conn.execute(
            """
            SELECT reply_id, external_comment_id, external_url
            FROM tracked_replies
            WHERE reply_id = ANY(%s)
            """,
            (reply_ids,),
        ).fetchall()
        for row in rows:
            links_by_reply[str(row["reply_id"])] = dict(row)

    return _ListingProjectionContext(
        policy=policy,
        threads_by_comment=threads_by_comment,
        live_by_thread=live_by_thread,
        failed_by_thread=failed_by_thread,
        links_by_reply=links_by_reply,
    )


def _attach_one_tracker_projection(
    comment: dict,
    ctx: _ListingProjectionContext,
    *,
    unsynced_reply_ids: Optional[set[str]] = None,
) -> dict:
    if not is_anchor_promotable(comment):
        comment["tracker"] = {"linkState": None, "notPromotableReason": "unpinned_anchor"}
        return comment

    policy = ctx.policy
    thread = ctx.threads_by_comment.get(str(comment["id"]))
    if thread is None:
        tracker: dict[str, Any] = {
            "linkState": None,
            "promoteMinRole": str(policy.get("promote_min_role") or "designer") if policy else None,
            "provider": str(policy.get("connector_provider") or "github") if policy else None,
        }
        if policy is not None:
            from app.services.trackers.promotion import should_auto_promote

            if not should_auto_promote(comment, policy):
                tracker["notPromotableReason"] = "below_auto_threshold"
        comment["tracker"] = tracker
        for reply in comment.get("replies", []):
            if _reply_is_unsynced_local(reply, unsynced_reply_ids=unsynced_reply_ids):
                reply["sync"] = _unsynced_local_sync()
        return comment

    thread_id = str(thread["id"])
    live_op = ctx.live_by_thread.get(thread_id)
    failed_op = ctx.failed_by_thread.get(thread_id)
    external_id = str(thread.get("external_id") or "")
    external_number = thread.get("external_number")
    linked = external_id not in ("", "pending")
    link_state = str(thread.get("link_state") or "linked")
    error_source = live_op or failed_op
    last_error = _wire_provider_error((error_source or {}).get("last_error"))
    sync_state = _sync_state(live_op=live_op, failed_op=failed_op, linked=linked)

    comment["tracker"] = {
        "linkState": link_state,
        "promoteMinRole": str(policy.get("promote_min_role") or "designer") if policy else None,
        "provider": str(policy.get("connector_provider") or "github") if policy else None,
        "externalId": external_id if linked else None,
        "externalNumber": str(external_number) if linked and external_number not in (None, "") else None,
        "externalUrl": thread.get("external_url"),
        "destination": {
            "connectorId": str(thread.get("connector_id") or ""),
            "containerPath": str(policy.get("container_path") or "") if policy else "",
            "containerKind": str(policy.get("container_kind") or "repo") if policy else "repo",
            "generation": int(thread.get("destination_generation") or 1),
        },
        "remoteState": thread.get("remote_state"),
        "remoteUpdatedAt": _remote_updated_at(thread),
        "pendingIntent": _pending_intent(live_op) if live_op else None,
        "syncState": sync_state,
        "pausedReason": thread.get("paused_reason"),
        "bodyAuthority": str(thread.get("body_authority") or "prism"),
        "lastError": last_error,
    }
    if linked and policy:
        comment["forgeProvider"] = str(policy.get("connector_provider") or "github")
        comment["forgeIssueId"] = external_id
        comment["forgeIssueUrl"] = thread.get("external_url")
        comment["forgeSyncState"] = sync_state

    for reply in comment.get("replies", []):
        if _reply_is_unsynced_local(reply, unsynced_reply_ids=unsynced_reply_ids):
            reply["sync"] = _unsynced_local_sync()
            continue
        link = ctx.links_by_reply.get(str(reply.get("id") or ""))
        if link:
            reply["sync"] = _reply_sync_from_link(link)
    return comment


def attach_tracker_projections(
    conn: Any,
    project_id: str,
    comments: list[dict],
    *,
    workspace_schema: str = WORKSPACE_SCHEMA,
    unsynced_reply_ids: Optional[set[str]] = None,
) -> list[dict]:
    if not comments:
        return comments
    ctx = _load_listing_projection_context(
        conn, project_id, comments, workspace_schema=workspace_schema,
    )
    for comment in comments:
        _attach_one_tracker_projection(comment, ctx, unsynced_reply_ids=unsynced_reply_ids)
    return comments


def attach_tracker_projection(
    conn: Any,
    project_id: str,
    comment: dict,
    *,
    workspace_schema: str = WORKSPACE_SCHEMA,
    unsynced_reply_ids: Optional[set[str]] = None,
) -> dict:
    return attach_tracker_projections(
        conn,
        project_id,
        [comment],
        workspace_schema=workspace_schema,
        unsynced_reply_ids=unsynced_reply_ids,
    )[0]


def wire_sync_op(row: Mapping[str, Any]) -> dict:
    """Sanitized SyncOp DTO for history responses."""

    payload = {
        "opId": str(row.get("id") or ""),
        "trackedThreadId": str(row.get("tracked_thread_id") or ""),
        "op": str(row.get("op") or ""),
        "state": str(row.get("state") or ""),
        "createdAt": _iso8601(row.get("created_at")),
        "sentAt": _iso8601(row.get("sent_at")),
        "localRevision": row.get("local_revision"),
        "destinationGeneration": int(row.get("destination_generation") or 1),
        "actorUserId": row.get("actor_user_id"),
        "expectedRemoteState": row.get("expected_remote_state"),
        "attempts": int(row.get("attempts") or 0),
        "nextAttemptAt": _iso8601(row.get("next_attempt_at")),
        "externalResultId": row.get("external_result_id"),
        "lastError": _wire_provider_error(row.get("last_error")),
    }
    return payload


def can_retry_projection(tracker: Mapping[str, Any] | None) -> bool:
    if not tracker:
        return False
    link_state = str(tracker.get("linkState") or "")
    if link_state != "linked":
        return False
    sync_state = str(tracker.get("syncState") or "")
    if sync_state in {"failed", "quarantine"}:
        return True
    last_error = tracker.get("lastError")
    return isinstance(last_error, Mapping) and bool(last_error.get("retryable"))


def _comment_for_projection(conn: Any, project_id: str, comment_id: str) -> dict:
    row = conn.execute(
        """
        SELECT id, anchor_state, anchor_commit
        FROM comments
        WHERE project_id = %s AND id = %s AND deleted_at IS NULL
        """,
        (project_id, comment_id),
    ).fetchone()
    if row is None:
        raise KeyError("comment_not_found")
    row = dict(row)
    anchor: dict[str, Any] = {
        "state": row.get("anchor_state") or "unpinned",
        "commit": row.get("anchor_commit"),
    }
    return {"id": comment_id, "replies": [], "anchor": anchor}


def _live_thread(conn: Any, comment_id: str) -> Optional[dict]:
    row = conn.execute(
        """
        SELECT * FROM tracked_threads
        WHERE comment_id = %s AND unlinked_at IS NULL
        ORDER BY id DESC
        LIMIT 1
        """,
        (comment_id,),
    ).fetchone()
    return dict(row) if row else None


def _retryable_op(conn: Any, thread_id: str) -> Optional[dict]:
    row = conn.execute(
        """
        SELECT * FROM sync_ops
        WHERE tracked_thread_id = %s AND state = ANY(%s)
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (thread_id, list(RETRYABLE_OP_STATES)),
    ).fetchone()
    return dict(row) if row else None


def list_thread_history(conn: Any, thread_id: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT * FROM sync_ops
        WHERE tracked_thread_id = %s
        ORDER BY created_at ASC, id ASC
        """,
        (thread_id,),
    ).fetchall()
    return [wire_sync_op(row) for row in rows]


def retry_thread_sync(
    conn: Any,
    *,
    project_id: str,
    comment_id: str,
    actor: ActorIdentity,
    promote_min_role: str,
) -> dict:
    """Idempotent human retry of the same op_id (C5). Revalidates publication policy."""

    authorize(
        CommentAction.RETRY,
        actor,
        linked=True,
        promote_min_role=promote_min_role,  # type: ignore[arg-type]
    )
    from app.services.trackers.promotion import evaluate_dispatch

    evaluate_dispatch(conn, project_id, actor.role)

    thread = _live_thread(conn, comment_id)
    if thread is None:
        raise KeyError("thread_not_found")

    link_state = str(thread.get("link_state") or "")
    if link_state != "linked":
        raise PublicationDenied("retry_not_allowed", f"Cannot retry while link is {link_state}")

    op = _retryable_op(conn, str(thread["id"]))
    if op is None:
        live = conn.execute(
            """
            SELECT * FROM sync_ops
            WHERE tracked_thread_id = %s AND state = ANY(%s)
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """,
            (thread["id"], list(LIVE_OP_STATES)),
        ).fetchone()
        if live is not None:
            return attach_tracker_projection(
                conn, project_id, _comment_for_projection(conn, project_id, comment_id),
            )["tracker"]
        raise PublicationDenied("retry_not_allowed", "No failed operation to retry")

    op_id = str(op["id"])
    updated = conn.execute(
        """
        UPDATE sync_ops
        SET state = 'pending',
            next_attempt_at = NOW(),
            claimed_by = NULL,
            lease_expires_at = NULL
        WHERE id = %s AND state = ANY(%s)
        RETURNING id
        """,
        (op_id, list(RETRYABLE_OP_STATES)),
    ).fetchone()
    if updated is None:
        raise PublicationDenied("retry_not_allowed", "Operation is no longer retryable")

    comment = conn.execute(
        "SELECT id FROM comments WHERE project_id = %s AND id = %s AND deleted_at IS NULL",
        (project_id, comment_id),
    ).fetchone()
    if comment is None:
        raise KeyError("comment_not_found")
    return attach_tracker_projection(
        conn, project_id, _comment_for_projection(conn, project_id, comment_id),
    )["tracker"]


def unlink_thread_sync(
    conn: Any,
    *,
    project_id: str,
    comment_id: str,
    actor: ActorIdentity,
    promote_min_role: str,
    reason: str = "manual_unlink",
    workspace_schema: str = WORKSPACE_SCHEMA,
) -> dict:
    """Local unlink via TR-34 lifecycle — supersede live ops and retain lineage."""

    authorize(
        CommentAction.PROMOTE,
        actor,
        linked=True,
        promote_min_role=promote_min_role,  # type: ignore[arg-type]
    )
    comment = conn.execute(
        "SELECT id FROM comments WHERE project_id = %s AND id = %s AND deleted_at IS NULL",
        (project_id, comment_id),
    ).fetchone()
    if comment is None:
        raise KeyError("comment_not_found")
    thread = _live_thread(conn, comment_id)
    if thread is None:
        raise KeyError("thread_not_found")

    from app.services.trackers.link_lifecycle import unlink_thread_lifecycle

    unlink_thread_lifecycle(
        conn,
        str(thread["id"]),
        reason=reason,
        actor_user_id=actor.actor_id,
        project_id=project_id,
        connector_id=str(thread.get("connector_id") or "") or None,
        workspace_schema=workspace_schema,
    )
    return attach_tracker_projection(
        conn, project_id, _comment_for_projection(conn, project_id, comment_id),
    )["tracker"]


def repromote_thread_sync(
    conn: Any,
    *,
    project_id: str,
    comment_id: str,
    actor: ActorIdentity,
    promote_min_role: str,
    workspace_schema: str = WORKSPACE_SCHEMA,
) -> dict:
    """Re-promote only from confirmed deleted state (TR-34 / F8)."""

    authorize(
        CommentAction.PROMOTE,
        actor,
        linked=True,
        promote_min_role=promote_min_role,  # type: ignore[arg-type]
    )
    comment_row = conn.execute(
        """
        SELECT id, revision, anchor_state, anchor_commit, content
        FROM comments
        WHERE project_id = %s AND id = %s AND deleted_at IS NULL
        """,
        (project_id, comment_id),
    ).fetchone()
    if comment_row is None:
        raise KeyError("comment_not_found")
    comment = dict(comment_row)
    comment["anchor"] = {
        "state": comment.get("anchor_state") or "unpinned",
        "commit": comment.get("anchor_commit"),
    }

    from app.services.trackers.link_lifecycle import repromote_deleted_thread
    from app.services.trackers.promotion import PromotionActor

    result = repromote_deleted_thread(
        conn,
        project_id=project_id,
        comment=comment,
        actor=PromotionActor(user_id=actor.actor_id, role=actor.role, kind=actor.actor_kind),
        workspace_schema=workspace_schema,
    )
    if result.action == "denied":
        code = result.code or "not_repromotable"
        if code in {"publication_required", "unpinned_anchor"}:
            raise PublicationDenied(code, result.reason or code)
        if result.reason in {
            "visibility",
            "visibility_unknown",
            "paused",
            "connector_missing",
            "destination_generation",
        }:
            raise DispatchPause(result.reason or code, result.reason or code)
        raise PublicationDenied(code, result.reason or "Re-promotion is not allowed")
    return attach_tracker_projection(
        conn, project_id, _comment_for_projection(conn, project_id, comment_id),
    )["tracker"]


def load_thread_status(
    conn: Any,
    *,
    project_id: str,
    comment_id: str,
) -> dict:
    comment = conn.execute(
        "SELECT id FROM comments WHERE project_id = %s AND id = %s AND deleted_at IS NULL",
        (project_id, comment_id),
    ).fetchone()
    if comment is None:
        raise KeyError("comment_not_found")
    thread = _live_thread(conn, comment_id)
    projection = attach_tracker_projection(
        conn, project_id, _comment_for_projection(conn, project_id, comment_id),
    )
    tracker = projection.get("tracker") or {}
    history_count = 0
    if thread is not None:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM sync_ops WHERE tracked_thread_id = %s",
            (thread["id"],),
        ).fetchone()
        history_count = int((row or {}).get("n") or 0)
    return {
        "commentId": comment_id,
        "trackedThreadId": str(thread["id"]) if thread else None,
        "tracker": tracker,
        "historyCount": history_count,
    }


__all__ = [
    "attach_tracker_projection",
    "attach_tracker_projections",
    "can_retry_projection",
    "list_thread_history",
    "load_thread_status",
    "repromote_thread_sync",
    "retry_thread_sync",
    "unlink_thread_sync",
    "wire_sync_op",
]
