"""Atomic promotion enqueue with comment mutations (TR-25, C2/C4/C5).

Policy evaluation and durable ``sync_ops`` insertion run on the caller's
PostgreSQL connection inside the same transaction as the comment/revision
write. ``jobs.enqueue()`` is never used here; workers discover pending rows
from the outbox directly.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Mapping, Optional

from app.core.roles import Role, normalize_role, role_meets_minimum
from app.services.trackers.op_store import LIVE_STATES, OpStore
from app.services.trackers.publication_policy import (
    DEFAULT_AUTO_MIN_SEVERITY,
    DEFAULT_PROMOTE_MIN_ROLE,
    DispatchPause,
    PublicationDenied,
)
from app.services.trackers.store import TrackerStore

SEVERITY_RANK = {"info": 0, "minor": 1, "major": 2, "critical": 3}
LIVE_CREATE_STATES = tuple(LIVE_STATES)
WORKSPACE_SCHEMA = "workspace"


@dataclass(frozen=True)
class PromotionActor:
    user_id: str | None
    role: Role
    kind: str = "user"


@dataclass(frozen=True)
class PromotionResult:
    action: str
    op_id: str | None = None
    thread_id: str | None = None
    reason: str | None = None
    code: str | None = None


def _qual(schema: str, table: str) -> str:
    return f'"{schema}"."{table}"'


def _severity_rank(value: str | None) -> int:
    return SEVERITY_RANK.get(str(value or "info").strip().lower(), 0)


def severity_meets_auto(severity: str | None, auto_min: str | None) -> bool:
    return _severity_rank(severity) >= _severity_rank(auto_min or DEFAULT_AUTO_MIN_SEVERITY)


def should_auto_promote(comment: Mapping[str, Any], policy: Mapping[str, Any]) -> bool:
    if not is_anchor_promotable(comment):
        return False
    if severity_meets_auto(str(comment.get("severity")), str(policy.get("auto_min_severity"))):
        return True
    if bool(policy.get("auto_task_class", True)) and str(comment.get("commentClass") or "") == "task":
        return True
    return False


def is_anchor_promotable(comment: Mapping[str, Any]) -> bool:
    anchor = comment.get("anchor")
    anchor_map = anchor if isinstance(anchor, Mapping) else {}
    state = str(anchor_map.get("state") or "unpinned")
    if state == "pinned":
        return True
    return bool(anchor_map.get("baseCommit") and anchor_map.get("compareCommit"))


def load_policy_row(conn: Any, project_id: str, *, workspace_schema: str = WORKSPACE_SCHEMA) -> Optional[dict]:
    from psycopg.errors import InvalidCatalogName, UndefinedTable

    try:
        with conn.transaction():
            row = conn.execute(
                f"""
                SELECT pt.*, tc.paused AS connector_paused, tc.provider AS connector_provider
                FROM {_qual(workspace_schema, "project_trackers")} pt
                LEFT JOIN {_qual(workspace_schema, "tracker_connectors")} tc ON tc.id = pt.connector_id
                WHERE pt.project_id = %s
                """,
                (project_id,),
            ).fetchone()
    except (UndefinedTable, InvalidCatalogName):
        return None
    return dict(row) if row else None


def _acknowledged(conn: Any, *, connector_id: str, remote_container_id: str, visibility: str,
                  workspace_schema: str = WORKSPACE_SCHEMA) -> bool:
    row = conn.execute(
        f"""
        SELECT 1 FROM {_qual(workspace_schema, "destination_acks")}
        WHERE connector_id = %s AND remote_container_id = %s AND observed_visibility = %s
        """,
        (connector_id, remote_container_id, visibility),
    ).fetchone()
    return row is not None


def evaluate_dispatch(conn: Any, project_id: str, actor_role: Role, *,
                      workspace_schema: str = WORKSPACE_SCHEMA) -> None:
    """Raise when publication must not proceed (D4/D7)."""

    row = load_policy_row(conn, project_id, workspace_schema=workspace_schema)
    if row is None:
        raise PublicationDenied("publication_required", "Project tracker destination is not configured")
    promote_min_role = normalize_role(str(row.get("promote_min_role") or DEFAULT_PROMOTE_MIN_ROLE)) or DEFAULT_PROMOTE_MIN_ROLE
    if not role_meets_minimum(actor_role, promote_min_role):
        raise PublicationDenied(
            "publication_required",
            f"Sharing to the tracker requires the {promote_min_role} role on this project",
            required_role=promote_min_role,
        )
    if row.get("connector_paused"):
        raise DispatchPause("paused", "Tracker connector is paused")
    visibility = str(row.get("visibility") or "unknown")
    if visibility == "unknown":
        raise DispatchPause("visibility_unknown", "Destination visibility is unknown")
    if visibility == "public" and not _acknowledged(
        conn,
        connector_id=str(row["connector_id"]),
        remote_container_id=str(row["remote_container_id"]),
        visibility=visibility,
        workspace_schema=workspace_schema,
    ):
        raise DispatchPause("visibility", "Public destination acknowledgement is required")


def actor_can_publish(actor: PromotionActor, policy: Mapping[str, Any]) -> bool:
    if actor.kind == "guest":
        return False
    promote_min_role = normalize_role(str(policy.get("promote_min_role") or DEFAULT_PROMOTE_MIN_ROLE)) or DEFAULT_PROMOTE_MIN_ROLE
    return role_meets_minimum(actor.role, promote_min_role)


def _lock_comment(conn: Any, project_id: str, comment_id: str) -> bool:
    return bool(conn.execute(
        """
        SELECT 1 FROM comments
        WHERE project_id = %s AND id = %s AND deleted_at IS NULL
        FOR UPDATE
        """,
        (project_id, comment_id),
    ).fetchone())


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


def _active_create_op(conn: Any, thread_id: str) -> Optional[dict]:
    row = conn.execute(
        """
        SELECT * FROM sync_ops
        WHERE tracked_thread_id = %s
          AND op = 'create_issue'
          AND state = ANY(%s)
        ORDER BY created_at ASC, id ASC
        LIMIT 1
        """,
        (thread_id, list(LIVE_CREATE_STATES)),
    ).fetchone()
    return dict(row) if row else None


def _pending_update_op(conn: Any, thread_id: str) -> Optional[dict]:
    row = conn.execute(
        """
        SELECT * FROM sync_ops
        WHERE tracked_thread_id = %s
          AND op = 'update_issue'
          AND state = ANY(%s)
        ORDER BY created_at ASC, id ASC
        LIMIT 1
        """,
        (thread_id, list(LIVE_CREATE_STATES)),
    ).fetchone()
    return dict(row) if row else None


def _new_op_id() -> str:
    return f"op_{uuid.uuid4().hex[:12]}"


def _new_thread_id() -> str:
    return f"tt_{uuid.uuid4().hex[:12]}"


def enqueue_create_issue(
    conn: Any,
    *,
    project_id: str,
    comment: Mapping[str, Any],
    actor: PromotionActor,
    workspace_schema: str = WORKSPACE_SCHEMA,
) -> PromotionResult:
    """Idempotent root promotion: one live create_issue per thread/generation."""

    comment_id = str(comment["id"])
    if not _lock_comment(conn, project_id, comment_id):
        return PromotionResult(action="skipped", reason="comment_missing")
    if not is_anchor_promotable(comment):
        return PromotionResult(action="denied", reason="unpinned_anchor", code="unpinned_anchor")

    policy = load_policy_row(conn, project_id, workspace_schema=workspace_schema)
    if policy is None:
        return PromotionResult(action="denied", reason="no_destination", code="publication_required")

    thread = _live_thread(conn, comment_id)
    if thread is not None and str(thread.get("external_id") or "") not in ("", "pending"):
        existing = _active_create_op(conn, str(thread["id"]))
        return PromotionResult(
            action="existing",
            op_id=str(existing["id"]) if existing else None,
            thread_id=str(thread["id"]),
            reason="already_linked",
        )

    try:
        evaluate_dispatch(conn, project_id, actor.role, workspace_schema=workspace_schema)
    except PublicationDenied as exc:
        return PromotionResult(action="denied", reason=exc.args[0], code=exc.code)
    except DispatchPause as exc:
        return PromotionResult(action="denied", reason=exc.reason, code=exc.reason)

    store = TrackerStore(conn)
    ops = OpStore(conn)
    generation = int(policy["destination_generation"])
    project_tracker_id = str(policy["id"])
    connector_id = str(policy["connector_id"])
    remote_container_id = str(policy["remote_container_id"])

    if thread is None:
        thread_id = _new_thread_id()
        store.insert_thread(
            thread_id=thread_id,
            comment_id=comment_id,
            project_tracker_id=project_tracker_id,
            destination_generation=generation,
            connector_id=connector_id,
            remote_container_id=remote_container_id,
            external_id="pending",
            link_state="linked",
        )
        thread = {"id": thread_id}
    else:
        thread_id = str(thread["id"])
        active = _active_create_op(conn, thread_id)
        if active is not None:
            return PromotionResult(action="existing", op_id=str(active["id"]), thread_id=thread_id)

    op_id = _new_op_id()
    ops.insert(
        op_id=op_id,
        tracked_thread_id=thread_id,
        op="create_issue",
        destination_generation=generation,
        local_revision=int(comment.get("revision") or 1),
        actor_user_id=actor.user_id,
    )
    conn.execute(
        "UPDATE tracked_threads SET pending_op_id = %s WHERE id = %s",
        (op_id, thread_id),
    )
    return PromotionResult(action="enqueued", op_id=op_id, thread_id=thread_id)


def maybe_auto_promote_root(
    conn: Any,
    *,
    project_id: str,
    comment: Mapping[str, Any],
    actor: PromotionActor,
    workspace_schema: str = WORKSPACE_SCHEMA,
) -> PromotionResult:
    policy = load_policy_row(conn, project_id, workspace_schema=workspace_schema)
    if policy is None or not should_auto_promote(comment, policy):
        return PromotionResult(action="skipped")
    if not actor_can_publish(actor, policy):
        return PromotionResult(action="denied", reason="publication_required", code="publication_required")
    return enqueue_create_issue(
        conn,
        project_id=project_id,
        comment=comment,
        actor=actor,
        workspace_schema=workspace_schema,
    )


def manual_promote_root(
    conn: Any,
    *,
    project_id: str,
    comment: Mapping[str, Any],
    actor: PromotionActor,
    workspace_schema: str = WORKSPACE_SCHEMA,
) -> PromotionResult:
    return enqueue_create_issue(
        conn,
        project_id=project_id,
        comment=comment,
        actor=actor,
        workspace_schema=workspace_schema,
    )


def enqueue_issue_metadata_update(
    conn: Any,
    *,
    project_id: str,
    comment: Mapping[str, Any],
    actor: PromotionActor,
    workspace_schema: str = WORKSPACE_SCHEMA,
) -> PromotionResult:
    """Downgrade/label refresh on a linked thread never unlinks or closes."""

    comment_id = str(comment["id"])
    thread = _live_thread(conn, comment_id)
    if thread is None or str(thread.get("external_id") or "") in ("", "pending"):
        return PromotionResult(action="skipped")
    thread_id = str(thread["id"])
    pending = _pending_update_op(conn, thread_id)
    if pending is not None:
        return PromotionResult(action="existing", op_id=str(pending["id"]), thread_id=thread_id)

    policy = load_policy_row(conn, project_id, workspace_schema=workspace_schema)
    if policy is None:
        return PromotionResult(action="skipped")

    try:
        evaluate_dispatch(conn, project_id, actor.role, workspace_schema=workspace_schema)
    except (PublicationDenied, DispatchPause):
        return PromotionResult(action="skipped")

    op_id = _new_op_id()
    OpStore(conn).insert(
        op_id=op_id,
        tracked_thread_id=thread_id,
        op="update_issue",
        destination_generation=int(thread["destination_generation"]),
        local_revision=int(comment.get("revision") or 1),
        actor_user_id=actor.user_id,
    )
    return PromotionResult(action="enqueued", op_id=op_id, thread_id=thread_id)


def after_root_severity_change(
    conn: Any,
    *,
    project_id: str,
    comment: Mapping[str, Any],
    previous_severity: str,
    actor: PromotionActor,
    workspace_schema: str = WORKSPACE_SCHEMA,
) -> PromotionResult:
    thread = _live_thread(conn, str(comment["id"]))
    if thread is None:
        policy = load_policy_row(conn, project_id, workspace_schema=workspace_schema)
        if policy is None:
            return PromotionResult(action="skipped")
        new_rank = _severity_rank(str(comment.get("severity")))
        old_rank = _severity_rank(previous_severity)
        if new_rank > old_rank and should_auto_promote(comment, policy):
            if actor_can_publish(actor, policy):
                return enqueue_create_issue(
                    conn, project_id=project_id, comment=comment, actor=actor,
                    workspace_schema=workspace_schema,
                )
            return PromotionResult(action="denied", reason="publication_required", code="publication_required")
        return PromotionResult(action="skipped")
    return enqueue_issue_metadata_update(
        conn, project_id=project_id, comment=comment, actor=actor, workspace_schema=workspace_schema,
    )


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
    if thread is None or str(thread.get("external_id") or "") in ("", "pending"):
        return PromotionResult(action="skipped")
    if str(reply.get("origin") or "prism") != "prism":
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

    thread_id = str(thread["id"])
    op_id = _new_op_id()
    OpStore(conn).insert(
        op_id=op_id,
        tracked_thread_id=thread_id,
        op="add_comment",
        destination_generation=int(thread["destination_generation"]),
        local_revision=int(reply.get("revision") or 1),
        actor_user_id=actor.user_id,
    )
    return PromotionResult(action="enqueued", op_id=op_id, thread_id=thread_id)


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
    if thread is None or str(thread.get("external_id") or "") in ("", "pending"):
        raise PublicationDenied("publication_required", "Thread is not linked to the tracker")
    thread_id = str(thread["id"])
    op_id = _new_op_id()
    OpStore(conn).insert(
        op_id=op_id,
        tracked_thread_id=thread_id,
        op="add_comment",
        destination_generation=int(thread["destination_generation"]),
        local_revision=int(reply.get("revision") or 1),
        actor_user_id=actor.user_id,
    )
    return PromotionResult(action="enqueued", op_id=op_id, thread_id=thread_id)


__all__ = [
    "PromotionActor",
    "PromotionResult",
    "after_reply_added",
    "after_root_severity_change",
    "enqueue_create_issue",
    "evaluate_dispatch",
    "is_anchor_promotable",
    "load_policy_row",
    "manual_promote_root",
    "maybe_auto_promote_root",
    "share_reply",
    "should_auto_promote",
]
