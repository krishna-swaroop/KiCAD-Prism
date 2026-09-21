"""Local resolve/reopen intent and observed-state separation (TR-31, C5/C6/D1).

Enqueue ``set_state`` ops atomically with comment status changes. Observed
remote state lives on ``tracked_threads``; pending intent is the durable op.
"""

from __future__ import annotations

import json
import uuid
from typing import Any, Mapping, Optional

from app.services.comments_revisions import (
    CHANGE_CREATE,
    Editor,
    record_revision,
    set_root_status,
)
from app.services.trackers.contracts import RemoteIssue, RemoteVersion
from app.services.trackers.op_store import LIVE_STATES, OpStore
from app.services.trackers.promotion import (
    PromotionActor,
    PromotionResult,
    _live_thread,
    _lock_comment,
    _new_op_id,
    evaluate_dispatch,
    load_policy_row,
)
from app.services.trackers.publication_policy import DispatchPause, PublicationDenied
from app.services.trackers.provenance import resolve_editor

WORKSPACE_SCHEMA = "workspace"
_SYSTEM_EDITOR = Editor(user_id=None, kind="system", display="System")
_STATE_EVENTS = frozenset({"closed", "reopened"})


def local_status_to_remote_state(status: str) -> str:
    normalized = str(status or "OPEN").strip().upper()
    return "closed" if normalized == "RESOLVED" else "open"


def remote_state_to_local_status(state: str) -> str:
    return "RESOLVED" if str(state or "").casefold() == "closed" else "OPEN"


def version_payload(version: RemoteVersion | Mapping[str, Any] | None) -> dict[str, Any]:
    if version is None:
        return {}
    if isinstance(version, RemoteVersion):
        return dict(version.model_dump())
    if isinstance(version, Mapping):
        return dict(version)
    if isinstance(version, str):
        try:
            parsed = json.loads(version)
        except json.JSONDecodeError:
            return {}
        return dict(parsed) if isinstance(parsed, dict) else {}
    return {}


def versions_match(
    expected: Mapping[str, Any] | None,
    observed: RemoteVersion | Mapping[str, Any] | None,
) -> bool:
    """Same remote version?  ``updatedAt`` is authoritative when both sides
    carry it: GitHub ETags vary with the requesting identity and the response
    representation, so two reads of an unchanged issue can disagree on ETag
    alone (TR-46). ETag equality is only the fallback when a side lacks a
    timestamp."""

    if not expected:
        return False
    left = version_payload(expected)
    right = version_payload(observed)
    left_at, right_at = left.get("updatedAt"), right.get("updatedAt")
    if left_at and right_at:
        return left_at == right_at
    return bool(left.get("etag")) and left.get("etag") == right.get("etag")


def observed_snapshot(thread: Mapping[str, Any]) -> tuple[str | None, dict[str, Any] | None]:
    state = thread.get("remote_state")
    version = thread.get("remote_version")
    if isinstance(version, str):
        try:
            version = json.loads(version)
        except json.JSONDecodeError:
            version = None
    return (str(state) if state not in (None, "") else None, version if isinstance(version, dict) else None)


def preflight_mismatch(thread: Mapping[str, Any], issue: RemoteIssue) -> bool:
    """True when the fetched issue diverges from the link's observed snapshot."""

    observed_state, observed_version = observed_snapshot(thread)
    if observed_version is None:
        return True
    if not versions_match(observed_version, issue.version):
        return True
    if observed_state and observed_state.casefold() != issue.state.casefold():
        return True
    return False


def target_state_for_local_status(conn: Any, project_id: str, comment_id: str) -> str:
    row = conn.execute(
        "SELECT status FROM comments WHERE project_id = %s AND id = %s AND deleted_at IS NULL",
        (project_id, comment_id),
    ).fetchone()
    if row is None:
        raise ValueError("comment missing")
    return local_status_to_remote_state(str(row.get("status") or "OPEN"))


def target_state_for_op(
    conn: Any,
    *,
    project_id: str,
    comment_id: str,
    local_revision: int | None,
) -> str:
    """Resolve the intended remote state from the op's recorded local revision (C5)."""

    if local_revision:
        row = conn.execute(
            """
            SELECT status FROM comment_revisions
            WHERE project_id = %s AND target_kind = 'root' AND target_id = %s AND revision = %s
            """,
            (project_id, comment_id, int(local_revision)),
        ).fetchone()
        if row is not None and row.get("status"):
            return local_status_to_remote_state(str(row["status"]))
    return target_state_for_local_status(conn, project_id, comment_id)


def append_system_note(conn: Any, *, project_id: str, comment_id: str, content: str) -> str:
    reply_id = f"r_{uuid.uuid4().hex[:8]}"
    conn.execute(
        """
        INSERT INTO comment_replies (
            id, comment_id, project_id, author, author_kind, origin, content, revision,
            timestamp, updated_at
        ) VALUES (%s, %s, %s, %s, 'system', 'prism', %s, 1, NOW(), NOW())
        """,
        (reply_id, comment_id, project_id, "System", content),
    )
    record_revision(
        conn,
        project_id=project_id,
        target_kind="reply",
        target_id=reply_id,
        revision=1,
        change_kind=CHANGE_CREATE,
        editor=_SYSTEM_EDITOR,
        content=content,
    )
    return reply_id


def supersession_message(
    *,
    remote_state: str,
    local_intent_state: str,
    actor_login: str | None = None,
) -> str:
    remote_label = "closed" if remote_state.casefold() == "closed" else "open"
    local_label = "resolved" if local_intent_state == "closed" else "reopened"
    if actor_login:
        return (
            f"{remote_label.capitalize()} on GitHub by {actor_login} after this thread was "
            f"{local_label} in Prism"
        )
    if remote_state.casefold() == "open" and local_intent_state == "closed":
        return "Reopened on GitHub after this thread was resolved in Prism"
    if remote_state.casefold() == "closed" and local_intent_state == "open":
        return "Closed on GitHub after this thread was reopened in Prism"
    return f"Issue is {remote_label} on GitHub; the local {local_label} intent was not applied"


def apply_observed_remote_state(
    conn: Any,
    *,
    thread: Mapping[str, Any],
    issue: RemoteIssue,
    project_id: str,
    comment_id: str,
    note: str | None = None,
    editor: Editor | None = None,
) -> None:
    conn.execute(
        """
        UPDATE tracked_threads
        SET remote_state = %s,
            remote_version = %s::jsonb,
            pending_op_id = NULL,
            last_verified_at = NOW()
        WHERE id = %s
        """,
        (
            issue.state,
            json.dumps(version_payload(issue.version)),
            str(thread["id"]),
        ),
    )
    local_status = remote_state_to_local_status(issue.state)
    set_root_status(
        conn,
        project_id=project_id,
        comment_id=comment_id,
        status=local_status,
        editor=editor or _SYSTEM_EDITOR,
        expected_revision=None,
    )
    if note:
        append_system_note(conn, project_id=project_id, comment_id=comment_id, content=note)


def _pending_set_state_op(conn: Any, thread_id: str) -> Optional[dict]:
    row = conn.execute(
        """
        SELECT * FROM sync_ops
        WHERE tracked_thread_id = %s
          AND op = 'set_state'
          AND state = ANY(%s)
        ORDER BY created_at ASC, id ASC
        LIMIT 1
        """,
        (thread_id, list(LIVE_STATES)),
    ).fetchone()
    return dict(row) if row else None


def enqueue_set_state(
    conn: Any,
    *,
    project_id: str,
    comment_id: str,
    actor: PromotionActor,
    local_revision: int,
    workspace_schema: str = WORKSPACE_SCHEMA,
) -> PromotionResult:
    """Record a durable ``set_state`` op for a linked thread after a local status change."""

    if not _lock_comment(conn, project_id, comment_id):
        return PromotionResult(action="skipped", reason="comment_missing")
    thread = _live_thread(conn, comment_id)
    if thread is None or str(thread.get("external_id") or "") in ("", "pending"):
        return PromotionResult(action="skipped", reason="not_linked")
    try:
        evaluate_dispatch(conn, project_id, actor.role, workspace_schema=workspace_schema)
    except PublicationDenied:
        raise
    except DispatchPause:
        # A paused connector or unacknowledged visibility must not lose the
        # intent: the op is recorded and the executor's own policy check
        # holds it (retain_unsent) until the pause lifts (TR-46). Only a role
        # denial refuses the local change outright.
        pass

    thread_id = str(thread["id"])
    observed_state, observed_version = observed_snapshot(thread)
    target_state = target_state_for_local_status(conn, project_id, comment_id)
    live_state_ops = conn.execute(
        """
        SELECT COUNT(*) AS n FROM sync_ops
        WHERE tracked_thread_id = %s
          AND op = 'set_state'
          AND state = ANY(%s)
        """,
        (thread_id, list(LIVE_STATES)),
    ).fetchone()
    if int((live_state_ops or {}).get("n") or 0) == 0:
        if observed_state and observed_state.casefold() == target_state.casefold():
            return PromotionResult(action="skipped", reason="already_matched")

    op_id = _new_op_id()
    OpStore(conn).insert(
        op_id=op_id,
        tracked_thread_id=thread_id,
        op="set_state",
        destination_generation=int(thread["destination_generation"]),
        local_revision=local_revision,
        actor_user_id=actor.user_id,
        actor_role=actor.role,
        expected_remote_state=observed_state,
        expected_remote_version=observed_version,
    )
    conn.execute(
        "UPDATE tracked_threads SET pending_op_id = %s WHERE id = %s",
        (op_id, thread_id),
    )
    return PromotionResult(action="enqueued", op_id=op_id, thread_id=thread_id)


def _event_to_remote_state(event_name: str) -> str:
    return "closed" if str(event_name or "").casefold() == "closed" else "open"


def analyze_state_events(
    events: list,
    *,
    bot_user_id: str | None,
    bot_login: str | None,
    observed_updated_at: str | None = None,
) -> tuple[str, Optional[Editor], Optional[str]]:
    """Order state events by list position (D1); timestamps are not used to order.

    ``observed_updated_at`` is the remote version the preflight just matched.
    Human state events at or before it are already reflected locally (that is
    what the local intent is answering), so only events after it can be the
    race the postflight exists to catch. Without it, a Prism reopen of an issue
    a human closed earlier would be "superseded" by that older close (TR-46).
    """

    from app.services.trackers.provenance import actor_is_bot

    relevant = [event for event in events if str(getattr(event, "event", "") or "") in _STATE_EVENTS]
    if observed_updated_at:
        relevant = [
            event
            for event in relevant
            if not str(getattr(event, "createdAt", "") or "")
            or str(getattr(event, "createdAt", "")) > str(observed_updated_at)
        ]
    if not relevant:
        return "confirmed", None, None

    bot_index: int | None = None
    for index, event in enumerate(relevant):
        actor = getattr(event, "actor", None)
        actor_id = getattr(actor, "id", None) if actor is not None else None
        actor_login = getattr(actor, "login", None) if actor is not None else None
        if actor_is_bot(
            actor_id=str(actor_id) if actor_id else None,
            actor_login=str(actor_login) if actor_login else None,
            bot_user_id=bot_user_id,
            bot_login=bot_login,
        ):
            bot_index = index
            break

    if bot_index is None:
        return "confirmed", None, None

    # The human's *latest* transition before ours is the state to restore; an
    # earlier one they already reversed themselves must not win.
    human_event = None
    for index, event in enumerate(relevant):
        if index >= bot_index:
            break
        actor = getattr(event, "actor", None)
        actor_id = getattr(actor, "id", None) if actor is not None else None
        actor_login = getattr(actor, "login", None) if actor is not None else None
        if not actor_is_bot(
            actor_id=str(actor_id) if actor_id else None,
            actor_login=str(actor_login) if actor_login else None,
            bot_user_id=bot_user_id,
            bot_login=bot_login,
        ):
            human_event = event

    if human_event is None:
        return "confirmed", None, None

    actor = getattr(human_event, "actor", None)
    actor_login = getattr(actor, "login", None) if actor is not None else None
    return (
        "human_precedes",
        resolve_editor(actor_login=str(actor_login) if actor_login else None),
        _event_to_remote_state(str(getattr(human_event, "event", "") or "")),
    )


__all__ = [
    "analyze_state_events",
    "append_system_note",
    "apply_observed_remote_state",
    "enqueue_set_state",
    "local_status_to_remote_state",
    "preflight_mismatch",
    "remote_state_to_local_status",
    "supersession_message",
    "target_state_for_local_status",
    "target_state_for_op",
    "version_payload",
    "versions_match",
]
