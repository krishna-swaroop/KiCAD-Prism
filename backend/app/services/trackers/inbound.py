"""Fetch-then-apply inbound hint reducer (TR-28, C5/C6/D3).

One entry point serves webhook-enqueued hints and poll/sweep callers. Content
and state always come from a provider fetch; webhook rows carry object refs and
optional actor evidence only. Inbound application never inserts sync_ops.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Mapping, Optional, Protocol, Sequence
from uuid import uuid4

from app.services.comments_revisions import Editor, edit_reply, record_revision, tombstone_reply
from app.services.trackers.contracts import (
    CommentRead,
    GoneConfirmed,
    IssueRead,
    RemoteComment,
    RemoteIssue,
    UncertainAbsence,
)
from app.services.trackers.inbox_store import InboxStore, StaleHintFence
from app.services.trackers.markers import extract_markers, validate_marker
from app.services.trackers.op_store import OpStore
from app.services.trackers.provenance import (
    EchoMatch,
    actor_is_bot,
    classify_comment_change,
    classify_issue_state,
    remote_reply_author,
    resolve_editor,
    stored_hash_matches,
)
from app.services.trackers.store import TrackerStore, issue_number_for_api, resolve_threads_for_issue_ref

IssueFetcher = Callable[[str, str, str], IssueRead]
CommentFetcher = Callable[[str, str, str], CommentRead]
AuditFn = Callable[[str, Mapping[str, Any]], None]


class InboundFetcher(Protocol):
    def fetch_issue(self, connector_id: str, container_id: str, external_id: str) -> IssueRead:
        ...

    def fetch_comment(self, connector_id: str, container_id: str, external_comment_id: str) -> CommentRead:
        ...


@dataclass
class ApplyResult:
    hint_id: str
    outcome: str
    detail: dict[str, Any] = field(default_factory=dict)


def _sync_op_count(conn: Any) -> int:
    row = conn.execute("SELECT COUNT(*) AS n FROM sync_ops").fetchone()
    return int(row["n"] or 0)


def assert_inbound_suppresses_outbound(conn: Any, *, before: int) -> None:
    after = _sync_op_count(conn)
    if after != before:
        raise RuntimeError(f"inbound apply inserted sync_ops ({before} -> {after})")


def _threads_for_issue(
    conn: Any,
    *,
    connector_id: str,
    container_id: str,
    external_id: str,
) -> list[dict]:
    return resolve_threads_for_issue_ref(
        conn,
        connector_id=connector_id,
        container_id=container_id,
        issue_ref=external_id,
    )


def _issue_fetch_ref(threads: Sequence[Mapping[str, Any]], hint_ref: str) -> str:
    """Prefer the stored repo number for provider GET routes."""

    if threads:
        number = issue_number_for_api(threads[0])
        if number:
            return number
    return str(hint_ref or "")


def _thread_ops(conn: Any, thread_id: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT * FROM sync_ops
        WHERE tracked_thread_id = %s
        ORDER BY created_at ASC, id ASC
        """,
        (thread_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def _reply_link(
    conn: Any,
    *,
    thread_id: str,
    external_comment_id: str,
) -> Optional[dict]:
    row = conn.execute(
        """
        SELECT tr.*, cr.project_id, cr.comment_id, cr.content, cr.revision, cr.deleted_at
        FROM tracked_replies tr
        JOIN comment_replies cr ON cr.id = tr.reply_id
        WHERE tr.tracked_thread_id = %s AND tr.external_comment_id = %s
        """,
        (thread_id, str(external_comment_id)),
    ).fetchone()
    return dict(row) if row else None


def _finish_hint(
    inbox: InboxStore,
    hint: Mapping[str, Any],
    *,
    state: str,
    detail: Mapping[str, Any] | None = None,
) -> None:
    fence = int(hint.get("fence") or 0)
    if fence:
        try:
            inbox.finish_hint(str(hint["id"]), fence, state=state)
            return
        except StaleHintFence:
            pass
    conn = inbox.conn
    conn.execute(
        """
        UPDATE remote_hints
        SET state = %s, applied_at = NOW(), claimed_by = NULL, lease_expires_at = NULL,
            error = COALESCE(%s::jsonb, error)
        WHERE id = %s AND state = 'pending'
        """,
        (state, json.dumps(dict(detail or {})) if detail else None, str(hint["id"])),
    )


def _confirm_echo_op(ops: OpStore, echo: EchoMatch) -> None:
    row = ops.get(echo.op_id)
    state = str(row.get("state") or "")
    fence = int(row.get("fence") or 0)
    if state == "sent":
        ops.confirm(echo.op_id, fence)
    elif state == "confirmed":
        return
    elif fence:
        ops.confirm(echo.op_id, fence)


def _reject_marker_hints(
    body: str,
    *,
    connector_id: str,
    container_id: str,
    author_user_id: str,
    bot_user_id: str,
    audit: AuditFn | None = None,
) -> list[dict]:
    rejected: list[dict] = []
    for marker in extract_markers(body):
        validation = validate_marker(
            marker,
            connector_id=connector_id,
            container_id=container_id,
            op_id=marker.op_id,
            comment_id=marker.comment_id,
            reply_id=marker.reply_id,
            author_user_id=author_user_id,
            bot_user_id=bot_user_id,
        )
        if validation.accepted:
            continue
        detail = {
            "reason": validation.reason,
            "connectorId": connector_id,
            "containerId": container_id,
            "opId": marker.op_id,
        }
        rejected.append(detail)
        if audit is not None:
            audit("inbound_marker_rejected", detail)
    return rejected


def _complete_create_from_issue(
    conn: Any,
    *,
    thread: Mapping[str, Any],
    issue: RemoteIssue,
    ops: OpStore,
    bot_user_id: str,
    audit: AuditFn | None = None,
) -> bool:
    """Confirm an outstanding create_issue from a fetched issue + marker (D2/F5)."""

    candidates = [
        op
        for op in _thread_ops(conn, str(thread["id"]))
        if str(op.get("op") or "") == "create_issue"
        and str(op.get("state") or "") in ("sent", "recovering", "quarantine", "pending")
    ]
    if not candidates:
        return False
    op = candidates[0]
    matched = False
    for marker in extract_markers(issue.body or ""):
        validation = validate_marker(
            marker,
            connector_id=str(thread["connector_id"]),
            container_id=str(thread["remote_container_id"]),
            op_id=str(op["id"]),
            comment_id=str(thread["comment_id"]),
            author_user_id=issue.author.id,
            bot_user_id=bot_user_id,
        )
        if not validation.accepted:
            if audit is not None:
                audit(
                    "inbound_marker_rejected",
                    {
                        "reason": validation.reason,
                        "connectorId": thread["connector_id"],
                        "containerId": thread["remote_container_id"],
                        "opId": op["id"],
                    },
                )
            continue
        matched = True
        break
    if not matched:
        return False
    conn.execute(
        """
        UPDATE tracked_threads
        SET external_id = %s,
            external_number = %s,
            external_url = %s,
            remote_state = %s,
            remote_version = %s::jsonb,
            last_verified_at = NOW()
        WHERE id = %s
        """,
        (
            str(issue.externalId),
            str(issue.number) if issue.number is not None else None,
            issue.url,
            issue.state,
            json.dumps(dict(issue.version.model_dump())),
            str(thread["id"]),
        ),
    )
    fence = int(op.get("fence") or 0)
    state = str(op.get("state") or "")
    if state == "sent":
        ops.confirm(str(op["id"]), fence, external_result_id=str(issue.externalId))
    elif state in ("recovering", "quarantine", "pending"):
        if fence:
            ops.mark_sent(str(op["id"]), fence)
            refreshed = ops.get(str(op["id"]))
            ops.confirm(str(op["id"]), int(refreshed["fence"]), external_result_id=str(issue.externalId))
        else:
            ops.confirm(str(op["id"]), 0, external_result_id=str(issue.externalId))
    return True


def _apply_issue_observation(
    conn: Any,
    *,
    thread: Mapping[str, Any],
    issue: RemoteIssue,
    ops: OpStore,
    event_actor_id: str | None,
    event_actor_login: str | None,
    bot_user_id: str | None,
    bot_login: str | None,
) -> str:
    thread_ops = _thread_ops(conn, str(thread["id"]))
    _, echo = classify_issue_state(
        issue,
        thread_ops,
        event_actor_id=event_actor_id,
        event_actor_login=event_actor_login,
        bot_user_id=bot_user_id,
        bot_login=bot_login,
    )
    conn.execute(
        """
        UPDATE tracked_threads
        SET remote_state = %s,
            remote_version = %s::jsonb,
            last_verified_at = NOW()
        WHERE id = %s
        """,
        (issue.state, json.dumps(dict(issue.version.model_dump())), str(thread["id"])),
    )
    if echo is not None:
        _confirm_echo_op(ops, echo)
        return "ignored_echo"
    _follow_observed_state(conn, thread=thread, issue=issue, actor_login=event_actor_login)
    return "applied"


def _follow_observed_state(
    conn: Any,
    *,
    thread: Mapping[str, Any],
    issue: RemoteIssue,
    actor_login: str | None,
) -> None:
    """A forge close/reopen resolves/reopens the Prism root (TR-31, C6).

    Skipped while a local ``set_state`` intent is live: the state executor's
    preflight owns that reconciliation and records the supersession note.
    Recording ``remote_state`` alone left the root OPEN after a GitHub close
    (found in TR-46).
    """

    from app.services.trackers.state_mutations import (
        _pending_set_state_op,
        apply_observed_remote_state,
        remote_state_to_local_status,
    )

    if _pending_set_state_op(conn, str(thread["id"])) is not None:
        return
    project_id = str(thread.get("project_id") or "")
    comment_id = str(thread["comment_id"])
    row = conn.execute(
        "SELECT status FROM comments WHERE project_id = %s AND id = %s AND deleted_at IS NULL",
        (project_id, comment_id),
    ).fetchone()
    if row is None:
        return
    if str(row.get("status") or "OPEN").upper() == remote_state_to_local_status(issue.state):
        return
    apply_observed_remote_state(
        conn,
        thread=thread,
        issue=issue,
        project_id=project_id,
        comment_id=comment_id,
        editor=resolve_editor(actor_login=actor_login) if actor_login else None,
    )


def _insert_remote_reply(
    conn: Any,
    *,
    thread: Mapping[str, Any],
    comment: RemoteComment,
    store: TrackerStore,
) -> str:
    reply_id = f"r_{uuid4().hex[:8]}"
    author_display, author_kind, origin = remote_reply_author(comment.author)
    conn.execute(
        """
        INSERT INTO comment_replies (
            id, comment_id, project_id, author, author_kind, origin, content, revision, timestamp, updated_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, 1, NOW(), NOW())
        """,
        (
            reply_id,
            str(thread["comment_id"]),
            str(thread["project_id"]),
            author_display,
            author_kind,
            origin,
            comment.body or "",
        ),
    )
    record_revision(
        conn,
        project_id=str(thread["project_id"]),
        target_kind="reply",
        target_id=reply_id,
        revision=1,
        change_kind="create",
        editor=Editor(user_id=None, kind=author_kind, display=author_display, origin=origin),
        content=comment.body or "",
    )
    link_id = f"trl_{uuid4().hex[:8]}"
    store.insert_reply_link(
        link_id=link_id,
        tracked_thread_id=str(thread["id"]),
        reply_id=reply_id,
        external_comment_id=str(comment.externalCommentId),
        remote_author_id=comment.author.id,
        remote_author_login=comment.author.login,
    )
    return reply_id


def _marker_echo_for_link(
    body: str,
    *,
    link: Mapping[str, Any],
    thread: Mapping[str, Any],
    thread_ops: Sequence[Mapping[str, Any]],
    author_id: str,
    bot_user_id: str | None,
) -> EchoMatch | None:
    """Echo by provenance: a bot-authored body carrying an accepted marker
    for the linked reply is Prism's own comment coming back."""

    if not bot_user_id or author_id != str(bot_user_id):
        return None
    reply_id = str(link.get("reply_id") or "")
    for marker in extract_markers(body):
        if marker.reply_id != reply_id:
            continue
        validation = validate_marker(
            marker,
            connector_id=str(thread["connector_id"]),
            container_id=str(thread["remote_container_id"]),
            op_id=marker.op_id,
            comment_id=marker.comment_id,
            reply_id=marker.reply_id,
            author_user_id=author_id,
            bot_user_id=str(bot_user_id),
        )
        if not validation.accepted:
            continue
        for op in thread_ops:
            if str(op.get("id")) == marker.op_id:
                return EchoMatch(op_id=marker.op_id, op_kind=str(op.get("op") or "add_comment"), op_state=str(op.get("state") or ""))
        # Marker names an op this thread no longer has (lineage, pruning):
        # still Prism's own body, nothing left to confirm.
        return EchoMatch(op_id="", op_kind="add_comment", op_state="confirmed")
    return None


def _editor_from_hint(
    *,
    actor_id: str | None,
    actor_login: str | None,
    bot_user_id: str | None,
    bot_login: str | None,
) -> Editor:
    if actor_is_bot(
        actor_id=actor_id,
        actor_login=actor_login,
        bot_user_id=bot_user_id,
        bot_login=bot_login,
    ):
        return resolve_editor()
    return resolve_editor(actor_id=actor_id, actor_login=actor_login)


def _apply_comment_to_thread(
    conn: Any,
    *,
    thread: Mapping[str, Any],
    comment: RemoteComment,
    hint: Mapping[str, Any],
    ops: OpStore,
    store: TrackerStore,
    bot_user_id: str | None,
    bot_login: str | None,
    audit: AuditFn | None = None,
) -> str:
    event = str(hint.get("event") or "updated")
    actor_id = hint.get("actor_id") or (hint.get("actor") or {}).get("id")
    actor_login = hint.get("actor_login") or (hint.get("actor") or {}).get("login")
    link = _reply_link(conn, thread_id=str(thread["id"]), external_comment_id=str(comment.externalCommentId))
    thread_ops = _thread_ops(conn, str(thread["id"]))

    if event == "deleted":
        if link is None or link.get("deleted_at"):
            return "unchanged"
        editor = _editor_from_hint(
            actor_id=str(actor_id) if actor_id else None,
            actor_login=str(actor_login) if actor_login else None,
            bot_user_id=bot_user_id,
            bot_login=bot_login,
        )
        tombstone_reply(
            conn,
            project_id=str(thread["project_id"]),
            reply_id=str(link["reply_id"]),
            editor=editor,
            expected_revision=None,
        )
        return "applied"

    if link is not None:
        if link.get("deleted_at"):
            return "unchanged"
        current = str(link.get("content") or "")
        fetched = comment.body or ""
        marker_echo = _marker_echo_for_link(
            fetched,
            link=link,
            thread=thread,
            thread_ops=thread_ops,
            author_id=str(comment.author.id or ""),
            bot_user_id=bot_user_id,
        )
        if marker_echo is not None:
            # The bot's own rendering of this very reply: never an edit to
            # import, whatever the hash says (TR-46).
            if marker_echo.op_id:
                _confirm_echo_op(ops, marker_echo)
            return "ignored_echo"
        change_kind, echo = classify_comment_change(
            thread_ops,
            comment,
            event_actor_id=str(actor_id) if actor_id else None,
            event_actor_login=str(actor_login) if actor_login else None,
            bot_user_id=bot_user_id,
            bot_login=bot_login,
        )
        if change_kind == "echo" and echo is not None:
            _confirm_echo_op(ops, echo)
            return "ignored_echo"
        if current == fetched:
            return "unchanged"
        editor = _editor_from_hint(
            actor_id=str(actor_id) if actor_id else None,
            actor_login=str(actor_login) if actor_login else None,
            bot_user_id=bot_user_id,
            bot_login=bot_login,
        )
        edit_reply(
            conn,
            project_id=str(thread["project_id"]),
            reply_id=str(link["reply_id"]),
            content=fetched,
            editor=editor,
            expected_revision=None,
        )
        return "applied"

    rejected = _reject_marker_hints(
        comment.body or "",
        connector_id=str(thread["connector_id"]),
        container_id=str(thread["remote_container_id"]),
        author_user_id=str(comment.author.id or ""),
        bot_user_id=str(bot_user_id or ""),
        audit=audit,
    )
    if rejected:
        return "ignored_marker"

    change_kind, echo = classify_comment_change(
        thread_ops,
        comment,
        event_actor_id=str(actor_id) if actor_id else None,
        event_actor_login=str(actor_login) if actor_login else None,
        bot_user_id=bot_user_id,
        bot_login=bot_login,
    )
    if echo is not None:
        _confirm_echo_op(ops, echo)
        if not _reply_link(conn, thread_id=str(thread["id"]), external_comment_id=str(comment.externalCommentId)):
            _insert_remote_reply(conn, thread=thread, comment=comment, store=store)
        return "ignored_echo"

    _insert_remote_reply(conn, thread=thread, comment=comment, store=store)
    for op in thread_ops:
        if str(op.get("op") or "") == "add_comment" and str(op.get("state") or "") in ("sent", "confirmed"):
            if stored_hash_matches(op.get("expected_body_hash"), comment.body or ""):
                _confirm_echo_op(ops, EchoMatch(str(op["id"]), "add_comment", str(op["state"])))
                break
    return "applied"


def fetch_then_apply_hint(
    conn: Any,
    hint: Mapping[str, Any],
    *,
    fetcher: InboundFetcher,
    inbox: InboxStore | None = None,
    ops: OpStore | None = None,
    store: TrackerStore | None = None,
    bot_user_id: str | None = None,
    bot_login: str | None = None,
    audit: AuditFn | None = None,
    finish: bool = True,
) -> ApplyResult:
    """Fetch authoritative remote state and apply one durable hint."""

    inbox = inbox or InboxStore(conn)
    ops = ops or OpStore(conn)
    store = store or TrackerStore(conn)
    hint_id = str(hint["id"])
    connector_id = str(hint["connector_id"])
    container_id = str(hint["remote_container_id"])
    object_kind = str(hint.get("object_kind") or hint.get("objectKind") or "issue")
    external_id = str(hint.get("external_id") or hint.get("externalId") or "")
    external_comment_id = str(
        hint.get("external_comment_id") or hint.get("externalCommentId") or external_id
    )
    ops_before = _sync_op_count(conn)

    if object_kind == "comment":
        fetched = fetcher.fetch_comment(connector_id, container_id, external_comment_id)
        if isinstance(fetched, UncertainAbsence):
            detail = {"reason": "comment_not_found"}
            if finish:
                _finish_hint(inbox, hint, state="failed", detail=detail)
            return ApplyResult(hint_id, "failed", detail)
        if isinstance(fetched, GoneConfirmed):
            detail = {"reason": "comment_gone"}
            if finish:
                _finish_hint(inbox, hint, state="applied", detail=detail)
            return ApplyResult(hint_id, "applied", detail)
        if not isinstance(fetched, RemoteComment):
            detail = {"reason": "comment_unreadable"}
            if finish:
                _finish_hint(inbox, hint, state="failed", detail=detail)
            return ApplyResult(hint_id, "failed", detail)
        issue_id = str(fetched.externalId or external_id)
        threads = _threads_for_issue(
            conn,
            connector_id=connector_id,
            container_id=container_id,
            external_id=issue_id,
        )
        if not threads and fetched.externalNumber is not None:
            threads = _threads_for_issue(
                conn,
                connector_id=connector_id,
                container_id=container_id,
                external_id=str(fetched.externalNumber),
            )
        if not threads:
            detail = {"reason": "no_linked_thread", "externalId": issue_id}
            if finish:
                _finish_hint(inbox, hint, state="ignored", detail=detail)
            return ApplyResult(hint_id, "ignored_marker", detail)
        outcomes: list[str] = []
        for thread in threads:
            outcomes.append(
                _apply_comment_to_thread(
                    conn,
                    thread=thread,
                    comment=fetched,
                    hint=hint,
                    ops=ops,
                    store=store,
                    bot_user_id=bot_user_id,
                    bot_login=bot_login,
                    audit=audit,
                )
            )
        outcome = "applied"
        if all(item == "ignored_echo" for item in outcomes):
            outcome = "ignored_echo"
        elif all(item == "ignored_marker" for item in outcomes):
            outcome = "ignored_marker"
        elif all(item == "unchanged" for item in outcomes):
            outcome = "unchanged"
        detail = {"threadCount": len(threads), "outcomes": outcomes}
        terminal = "ignored" if outcome == "ignored_echo" else "applied"
        if finish:
            _finish_hint(inbox, hint, state=terminal, detail=detail)
        assert_inbound_suppresses_outbound(conn, before=ops_before)
        return ApplyResult(hint_id, outcome, detail)

    threads = _threads_for_issue(
        conn, connector_id=connector_id, container_id=container_id, external_id=external_id
    )
    fetch_ref = _issue_fetch_ref(threads, external_id)
    fetched_issue = fetcher.fetch_issue(connector_id, container_id, fetch_ref)
    if isinstance(fetched_issue, (UncertainAbsence, GoneConfirmed)) or not isinstance(
        fetched_issue, RemoteIssue
    ):
        detail = {"reason": "issue_unreadable"}
        if finish:
            _finish_hint(inbox, hint, state="failed", detail=detail)
        return ApplyResult(hint_id, "failed", detail)

    if not threads:
        threads = _threads_for_issue(
            conn,
            connector_id=connector_id,
            container_id=container_id,
            external_id=str(fetched_issue.externalId),
        )
    pending_threads = conn.execute(
        """
        SELECT t.*, c.project_id
        FROM tracked_threads t
        JOIN comments c ON c.id = t.comment_id
        WHERE t.connector_id = %s
          AND t.remote_container_id = %s
          AND t.external_id = 'pending'
          AND t.unlinked_at IS NULL
        ORDER BY t.id ASC
        """,
        (connector_id, container_id),
    ).fetchall()
    targets = [dict(row) for row in threads] + [dict(row) for row in pending_threads]
    if not targets:
        detail = {"reason": "no_linked_thread", "externalId": external_id}
        if finish:
            _finish_hint(inbox, hint, state="ignored", detail=detail)
        return ApplyResult(hint_id, "ignored_marker", detail)

    actor_id = hint.get("actor_id")
    actor_login = hint.get("actor_login")
    results: list[str] = []
    for thread in targets:
        if str(thread.get("external_id") or "") == "pending":
            if _complete_create_from_issue(
                conn,
                thread=thread,
                issue=fetched_issue,
                ops=ops,
                bot_user_id=str(bot_user_id or ""),
                audit=audit,
            ):
                results.append("confirmed_create")
                continue
        results.append(
            _apply_issue_observation(
                conn,
                thread=thread,
                issue=fetched_issue,
                ops=ops,
                event_actor_id=str(actor_id) if actor_id else None,
                event_actor_login=str(actor_login) if actor_login else None,
                bot_user_id=bot_user_id,
                bot_login=bot_login,
            )
        )
    outcome = "applied"
    if results and all(item == "ignored_echo" for item in results):
        outcome = "ignored_echo"
    detail = {"threadCount": len(targets), "results": results, "remoteState": fetched_issue.state}
    terminal = "ignored" if outcome == "ignored_echo" else "applied"
    if finish:
        _finish_hint(inbox, hint, state=terminal, detail=detail)
    assert_inbound_suppresses_outbound(conn, before=ops_before)
    return ApplyResult(hint_id, outcome, detail)


def apply_destination_hints(
    conn: Any,
    *,
    connector_id: str,
    container_id: str,
    fetcher: InboundFetcher,
    bot_user_id: str | None = None,
    bot_login: str | None = None,
    audit: AuditFn | None = None,
) -> list[ApplyResult]:
    """Apply every pending hint for one destination in receive order."""

    inbox = InboxStore(conn)
    ops = OpStore(conn)
    store = TrackerStore(conn)
    rows = conn.execute(
        """
        SELECT * FROM remote_hints
        WHERE state = 'pending'
          AND connector_id = %s
          AND remote_container_id = %s
        ORDER BY received_at ASC, id ASC
        """,
        (connector_id, container_id),
    ).fetchall()
    results: list[ApplyResult] = []
    for row in rows:
        results.append(
            fetch_then_apply_hint(
                conn,
                dict(row),
                fetcher=fetcher,
                inbox=inbox,
                ops=ops,
                store=store,
                bot_user_id=bot_user_id,
                bot_login=bot_login,
                audit=audit,
                finish=True,
            )
        )
    return results


class CallableFetcher:
    """Simple fetcher wrapper for tests and offline fixtures."""

    def __init__(
        self,
        *,
        issue: IssueFetcher | None = None,
        comment: CommentFetcher | None = None,
    ) -> None:
        self._issue = issue
        self._comment = comment

    def fetch_issue(self, connector_id: str, container_id: str, external_id: str) -> IssueRead:
        if self._issue is None:
            raise RuntimeError("issue fetcher not configured")
        return self._issue(connector_id, container_id, external_id)

    def fetch_comment(self, connector_id: str, container_id: str, external_comment_id: str) -> CommentRead:
        if self._comment is None:
            raise RuntimeError("comment fetcher not configured")
        return self._comment(connector_id, container_id, external_comment_id)


__all__ = [
    "ApplyResult",
    "CallableFetcher",
    "InboundFetcher",
    "apply_destination_hints",
    "assert_inbound_suppresses_outbound",
    "fetch_then_apply_hint",
]
