"""Outbound set_state execution with D1 preflight/postflight (TR-31)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Mapping

from app.services.trackers.contracts import Destination, RemoteEvent, RemoteIssue
from app.services.trackers.errors import ProviderError
from app.services.trackers.github_issues import GitHubIssueAdapter
from app.services.trackers.op_store import OpStore
from app.services.trackers.state_mutations import (
    analyze_state_events,
    apply_observed_remote_state,
    append_system_note,
    observed_snapshot,
    preflight_mismatch,
    remote_state_to_local_status,
    supersession_message,
    target_state_for_op,
    version_payload,
)
from app.services.trackers.create_executor import (
    _issue_adapter,
    _load_execution_context,
)


@dataclass(frozen=True)
class PostflightOutcome:
    status: str
    postflight: str
    restore_state: str | None = None
    note: str | None = None


def _event_to_state(event_name: str) -> str:
    return "closed" if str(event_name or "").casefold() == "closed" else "open"


def execute_set_state_op(op: Mapping[str, Any], conn: Any) -> None:
    """Run one claimed ``set_state`` op inside the caller connection."""

    ctx = _load_execution_context(conn, op)
    ops = OpStore(conn)
    op_id = str(op["id"])
    fence = int(op["fence"])
    thread = ctx.thread
    thread_id = str(thread["id"])
    comment_id = str(thread["comment_id"])
    project_id = str(ctx.project_id)
    target_state = target_state_for_op(
        conn,
        project_id=project_id,
        comment_id=comment_id,
        local_revision=op.get("local_revision"),
    )

    adapter = _issue_adapter(ctx.connector)
    caps = adapter.capabilities()
    issue_ref = str(thread.get("external_number") or thread.get("external_id") or "")
    fetched = adapter.get_issue(ctx.destination, issue_ref, etag=None)
    if not isinstance(fetched, RemoteIssue):
        raise ProviderError("transient", "Issue fetch did not return a readable issue")

    if preflight_mismatch(thread, fetched):
        _supersede_preflight(
            conn,
            ops,
            op_id=op_id,
            fence=fence,
            thread=thread,
            issue=fetched,
            project_id=project_id,
            comment_id=comment_id,
            local_intent_state=target_state,
        )
        return

    patched = adapter.set_state(ctx.destination, issue_ref, target_state, note="")
    if not isinstance(patched, RemoteIssue):
        raise ProviderError("transient", "Issue state patch did not return a readable issue")

    _observed_state, observed_version = observed_snapshot(thread)
    postflight = _run_postflight(
        adapter,
        ctx.destination,
        issue_ref,
        target_state=target_state,
        has_state_events=bool(caps.hasStateEvents),
        bot_user_id=str(ctx.connector.get("bot_forge_user_id") or ""),
        bot_login=str(ctx.connector.get("bot_login") or ""),
        observed_updated_at=str((observed_version or {}).get("updatedAt") or "") or None,
    )

    if postflight.status == "human_precedes" and postflight.restore_state:
        restored = adapter.set_state(ctx.destination, issue_ref, postflight.restore_state, note="")
        if not isinstance(restored, RemoteIssue):
            raise ProviderError("transient", "Failed to restore remote state after postflight conflict")
        apply_observed_remote_state(
            conn,
            thread=thread,
            issue=restored,
            project_id=project_id,
            comment_id=comment_id,
        )
        if postflight.note:
            append_system_note(conn, project_id=project_id, comment_id=comment_id, content=postflight.note)
        ops.supersede(op_id, fence, reason="postflight detected newer remote state")
        return

    if postflight.status == "unsupported":
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
                patched.state,
                json.dumps(version_payload(patched.version)),
                thread_id,
            ),
        )
        ops.confirm(op_id, fence, external_result_id=str(patched.externalId))
        conn.execute(
            """
            UPDATE sync_ops
            SET last_error = %s::jsonb
            WHERE id = %s AND fence = %s
            """,
            (
                json.dumps(
                    {
                        "class": "invalid_request",
                        "message": "postflight=unsupported",
                        "retryable": False,
                    }
                ),
                op_id,
                fence,
            ),
        )
        return

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
            patched.state,
            json.dumps(version_payload(patched.version)),
            thread_id,
        ),
    )
    ops.confirm(op_id, fence, external_result_id=str(patched.externalId))


def _supersede_preflight(
    conn: Any,
    ops: OpStore,
    *,
    op_id: str,
    fence: int,
    thread: Mapping[str, Any],
    issue: RemoteIssue,
    project_id: str,
    comment_id: str,
    local_intent_state: str,
) -> None:
    note = supersession_message(
        remote_state=issue.state,
        local_intent_state=local_intent_state,
    )
    apply_observed_remote_state(
        conn,
        thread=thread,
        issue=issue,
        project_id=project_id,
        comment_id=comment_id,
        note=note,
    )
    ops.supersede(op_id, fence, reason="preflight mismatch with observed remote state")


def _run_postflight(
    adapter: GitHubIssueAdapter,
    dest: Destination,
    issue_ref: str,
    *,
    target_state: str,
    has_state_events: bool,
    bot_user_id: str,
    bot_login: str,
    observed_updated_at: str | None = None,
) -> PostflightOutcome:
    if not has_state_events:
        return PostflightOutcome(status="unsupported", postflight="unsupported")

    events = list(adapter.list_events(dest, issue_ref))
    outcome, editor, human_state = analyze_state_events(
        events,
        bot_user_id=bot_user_id or None,
        bot_login=bot_login or None,
        observed_updated_at=observed_updated_at,
    )
    if outcome != "human_precedes" or human_state is None:
        return PostflightOutcome(status="confirmed", postflight="events")

    actor_login = None
    if editor is not None and editor.display:
        actor_login = editor.display.split(" (", 1)[0]
    note = supersession_message(
        remote_state=human_state,
        local_intent_state=target_state,
        actor_login=actor_login,
    )
    return PostflightOutcome(
        status="human_precedes",
        postflight="events",
        restore_state=human_state,
        note=note,
    )


__all__ = ["PostflightOutcome", "execute_set_state_op"]
