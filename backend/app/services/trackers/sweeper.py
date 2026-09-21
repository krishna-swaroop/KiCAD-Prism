"""Verification sweeps for linked issues and tracked replies (TR-33, C6/C7/D7).

Independently walks every live link for a destination with a fair rotating
schedule. Issue ``304`` responses skip body refresh but never suppress reply
enumeration. Partial pages, uncertain absences and auth errors never tombstone
replies or mark issues deleted. Confirmed deletion requires ``410`` or two
complete absence observations at least ten minutes apart.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Mapping, Optional, Sequence

from app.services.comments_revisions import tombstone_reply
from app.services.trackers.contracts import (
    CommentRead,
    Destination,
    ForbiddenRead,
    GoneConfirmed,
    IssueRead,
    Moved,
    NotModified,
    PageCursor,
    RemoteComment,
    RemoteIssue,
    UncertainAbsence,
)
from app.services.trackers.errors import ProviderError
from app.services.trackers.executor_support import pause_connector_auth_lost
from app.services.trackers.github_updates import destination_for, format_iso8601, parse_iso8601
from app.services.trackers.link_lifecycle import apply_moved_issue
from app.services.trackers.provenance import resolve_editor
from app.services.trackers.scheduler import sweep_interval_seconds
from app.services.trackers.store import issue_number_for_api

GetIssueFn = Callable[[Destination, str, Optional[str]], IssueRead]
ListCommentsFn = Callable[
    [Destination, str, Optional[PageCursor]], tuple[Sequence[RemoteComment], Optional[PageCursor]]
]
GetCommentFn = Callable[[Destination, str, Optional[str]], CommentRead]

CHECKPOINT_KIND = "sweep"
DELETION_CONFIRM_SECONDS = 10 * 60
DEFAULT_MAX_THREADS = 8


def scope_key(connector_id: str, container_id: str) -> str:
    return f"{connector_id}:{container_id}"


@dataclass
class SweepOutcome:
    threads_checked: int = 0
    replies_checked: int = 0
    replies_tombstoned: int = 0
    issues_marked_inaccessible: int = 0
    issues_marked_deleted: int = 0
    issues_recovered: int = 0
    issues_moved: int = 0
    complete: bool = False
    retry_after_seconds: int | None = None
    error: dict[str, Any] | None = None
    details: dict[str, Any] = field(default_factory=dict)


def _cursor_payload(checkpoint: Mapping[str, Any] | None) -> dict[str, Any]:
    if not checkpoint:
        return {"schedule_index": 0}
    raw = checkpoint.get("cursor")
    if isinstance(raw, str):
        return json.loads(raw or "{}")
    if isinstance(raw, dict):
        return dict(raw)
    return {"schedule_index": 0}


def _decode_page_cursor(page_cursor: str | None) -> tuple[str | None, str | None]:
    if not page_cursor:
        return None, None
    try:
        payload = json.loads(page_cursor)
    except json.JSONDecodeError:
        return None, None
    if not isinstance(payload, dict):
        return None, None
    thread_id = str(payload.get("threadId") or "") or None
    comment_page = str(payload.get("commentPage") or "") or None
    return thread_id, comment_page


def _encode_page_cursor(thread_id: str, comment_page: str | None) -> str:
    return json.dumps({"threadId": thread_id, "commentPage": comment_page})


def _load_checkpoint(conn: Any, *, kind: str, scope: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM sync_checkpoints WHERE kind = %s AND scope_key = %s",
        (kind, scope),
    ).fetchone()
    return dict(row) if row else None


def _ensure_checkpoint(conn: Any, *, kind: str, scope: str) -> None:
    conn.execute(
        """
        INSERT INTO sync_checkpoints (kind, scope_key, cursor)
        VALUES (%s, %s, %s::jsonb)
        ON CONFLICT (kind, scope_key) DO NOTHING
        """,
        (kind, scope, json.dumps({"schedule_index": 0})),
    )


def _save_page_progress(
    conn: Any,
    *,
    kind: str,
    scope: str,
    thread_id: str,
    comment_page: str | None,
) -> None:
    conn.execute(
        """
        UPDATE sync_checkpoints
        SET page_cursor = %s,
            last_error = NULL
        WHERE kind = %s AND scope_key = %s
        """,
        (_encode_page_cursor(thread_id, comment_page), kind, scope),
    )


def _save_sweep_complete(
    conn: Any,
    *,
    kind: str,
    scope: str,
    schedule_index: int,
    connector_id: str,
    container_id: str,
) -> None:
    interval = sweep_interval_seconds(conn, connector_id, container_id)
    conn.execute(
        """
        UPDATE sync_checkpoints
        SET cursor = %s::jsonb,
            page_cursor = NULL,
            last_success_at = NOW(),
            last_error = NULL,
            next_run_at = NOW() + (%s * INTERVAL '1 second')
        WHERE kind = %s AND scope_key = %s
        """,
        (json.dumps({"schedule_index": schedule_index}), interval, kind, scope),
    )


def _save_sweep_error(
    conn: Any,
    *,
    kind: str,
    scope: str,
    error: Mapping[str, Any],
    retry_after_seconds: int,
) -> None:
    conn.execute(
        """
        UPDATE sync_checkpoints
        SET last_error = %s::jsonb,
            next_run_at = NOW() + (%s * INTERVAL '1 second')
        WHERE kind = %s AND scope_key = %s
        """,
        (json.dumps(dict(error)), retry_after_seconds, kind, scope),
    )


def _live_threads(conn: Any, *, connector_id: str, container_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT t.*, c.project_id
        FROM tracked_threads t
        JOIN comments c ON c.id = t.comment_id
        WHERE t.connector_id = %s
          AND t.remote_container_id = %s
          AND t.unlinked_at IS NULL
        ORDER BY t.last_verified_at ASC NULLS FIRST, t.id ASC
        """,
        (connector_id, container_id),
    ).fetchall()
    return [dict(row) for row in rows]


def _tracked_replies(conn: Any, thread_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT tr.*, cr.project_id, cr.deleted_at
        FROM tracked_replies tr
        JOIN comment_replies cr ON cr.id = tr.reply_id
        WHERE tr.tracked_thread_id = %s
        ORDER BY tr.id ASC
        """,
        (thread_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def _issue_etag(thread: Mapping[str, Any]) -> str | None:
    version = thread.get("remote_version")
    if isinstance(version, str):
        try:
            version = json.loads(version)
        except json.JSONDecodeError:
            return None
    if isinstance(version, dict):
        etag = version.get("etag")
        return str(etag) if etag else None
    return None


def _append_lineage(conn: Any, thread_id: str, entry: Mapping[str, Any]) -> None:
    conn.execute(
        """
        UPDATE tracked_threads
        SET lineage = lineage || %s::jsonb
        WHERE id = %s
        """,
        (json.dumps([dict(entry)]), thread_id),
    )


def _first_absence_at(lineage: Any) -> datetime | None:
    items = lineage or []
    if isinstance(items, str):
        try:
            items = json.loads(items)
        except json.JSONDecodeError:
            return None
    if not isinstance(items, list):
        return None
    for item in reversed(items):
        if not isinstance(item, dict):
            continue
        if str(item.get("kind") or "") != "sweep_issue_absence":
            continue
        at = str(item.get("at") or "")
        if not at:
            continue
        try:
            return parse_iso8601(at)
        except ValueError:
            continue
    return None


def _set_link_state(
    conn: Any,
    thread_id: str,
    *,
    link_state: str,
    paused_reason: str | None = None,
) -> None:
    conn.execute(
        """
        UPDATE tracked_threads
        SET link_state = %s,
            paused_reason = COALESCE(%s, paused_reason)
        WHERE id = %s
        """,
        (link_state, paused_reason, thread_id),
    )


def _mark_issue_recovered(conn: Any, thread: Mapping[str, Any], issue: RemoteIssue) -> None:
    conn.execute(
        """
        UPDATE tracked_threads
        SET link_state = 'linked',
            paused_reason = NULL,
            remote_state = %s,
            remote_version = %s::jsonb,
            last_verified_at = NOW()
        WHERE id = %s
        """,
        (
            issue.state,
            json.dumps(dict(issue.version.model_dump())),
            str(thread["id"]),
        ),
    )


def _mark_issue_verified(conn: Any, thread_id: str, issue: RemoteIssue) -> None:
    conn.execute(
        """
        UPDATE tracked_threads
        SET remote_state = %s,
            remote_version = %s::jsonb,
            last_verified_at = NOW()
        WHERE id = %s
        """,
        (issue.state, json.dumps(dict(issue.version.model_dump())), thread_id),
    )


def _touch_issue_verified(conn: Any, thread_id: str) -> None:
    conn.execute(
        "UPDATE tracked_threads SET last_verified_at = NOW() WHERE id = %s",
        (thread_id,),
    )


def _pause_connector_auth(conn: Any, connector_id: str, container_id: str) -> None:
    pause_connector_auth_lost(conn, connector_id, container_id)


def _handle_issue_absence(
    conn: Any,
    thread: Mapping[str, Any],
    *,
    complete_listing: bool,
    now: datetime,
) -> str:
    thread_id = str(thread["id"])
    if not complete_listing:
        _set_link_state(conn, thread_id, link_state="inaccessible")
        return "inaccessible"

    first = _first_absence_at(thread.get("lineage"))
    if first is not None and (now - first).total_seconds() >= DELETION_CONFIRM_SECONDS:
        _set_link_state(conn, thread_id, link_state="deleted")
        return "deleted"

    if first is None:
        _append_lineage(
            conn,
            thread_id,
            {"kind": "sweep_issue_absence", "at": format_iso8601(now)},
        )
    _set_link_state(conn, thread_id, link_state="inaccessible")
    return "inaccessible"


def _tombstone_missing_reply(conn: Any, link: Mapping[str, Any]) -> None:
    if link.get("deleted_at"):
        return
    editor = resolve_editor()
    tombstone_reply(
        conn,
        project_id=str(link["project_id"]),
        reply_id=str(link["reply_id"]),
        editor=editor,
        expected_revision=None,
    )


def _verify_replies(
    conn: Any,
    *,
    thread: Mapping[str, Any],
    dest: Destination,
    issue_ref: str,
    list_comments: ListCommentsFn,
    get_comment: GetCommentFn,
    start_page: str | None,
    allow_partial: bool,
) -> tuple[int, int, str | None, bool]:
    """Return replies_checked, tombstoned, resume_page, listing_complete."""

    remote_ids: set[str] = set()
    complete = True
    next_page = start_page
    while True:
        page, next_cursor = list_comments(
            dest,
            issue_ref,
            PageCursor(value=next_page, exhausted=False) if next_page else None,
        )
        for comment in page:
            remote_ids.add(str(comment.externalCommentId))
        if next_cursor is None or next_cursor.exhausted:
            break
        if not next_cursor.value:
            complete = False
            break
        next_page = next_cursor.value

    if not complete:
        if allow_partial:
            return 0, 0, _encode_page_cursor(str(thread["id"]), next_page), False
        return 0, 0, None, False

    checked = 0
    tombstoned = 0
    for link in _tracked_replies(conn, str(thread["id"])):
        if link.get("deleted_at"):
            continue
        checked += 1
        ext_id = str(link["external_comment_id"])
        if ext_id in remote_ids:
            continue
        fetched = get_comment(dest, ext_id, None)
        if isinstance(fetched, RemoteComment):
            continue
        if isinstance(fetched, ForbiddenRead):
            continue
        if isinstance(fetched, (GoneConfirmed, UncertainAbsence)):
            _tombstone_missing_reply(conn, link)
            tombstoned += 1
    return checked, tombstoned, None, True


def sweep_destination_links(
    conn: Any,
    *,
    connector_id: str,
    container_id: str,
    container_path: str,
    get_issue: GetIssueFn,
    list_comments: ListCommentsFn,
    get_comment: GetCommentFn,
    checkpoint_kind: str = CHECKPOINT_KIND,
    destination_generation: int = 1,
    max_threads: int | None = DEFAULT_MAX_THREADS,
    now: datetime | None = None,
) -> SweepOutcome:
    """Sweep one destination's linked issues and replies with durable checkpoints."""

    scope = scope_key(connector_id, container_id)
    _ensure_checkpoint(conn, kind=checkpoint_kind, scope=scope)
    checkpoint = _load_checkpoint(conn, kind=checkpoint_kind, scope=scope) or {}
    cursor_state = _cursor_payload(checkpoint)
    schedule_index = int(cursor_state.get("schedule_index") or 0)
    resume_thread_id, resume_comment_page = _decode_page_cursor(checkpoint.get("page_cursor"))

    dest = destination_for(
        connector_id=connector_id,
        container_path=container_path,
        remote_container_id=container_id,
        generation=destination_generation,
    )
    threads = _live_threads(conn, connector_id=connector_id, container_id=container_id)
    outcome = SweepOutcome()
    clock = now or datetime.now(timezone.utc)
    if clock.tzinfo is None:
        clock = clock.replace(tzinfo=timezone.utc)

    if not threads:
        _save_sweep_complete(
            conn,
            kind=checkpoint_kind,
            scope=scope,
            schedule_index=0,
            connector_id=connector_id,
            container_id=container_id,
        )
        outcome.complete = True
        return outcome

    if resume_thread_id:
        ordered = [thread for thread in threads if str(thread["id"]) == resume_thread_id]
        if not ordered:
            resume_thread_id = None
            resume_comment_page = None
    if not resume_thread_id:
        count = len(threads)
        start = schedule_index % count
        ordered = threads[start:] + threads[:start]

    limit = max_threads if max_threads is not None else len(ordered)
    processed = 0
    next_schedule_index = schedule_index

    try:
        for thread in ordered:
            if processed >= limit:
                break
            thread_id = str(thread["id"])
            issue_ref = issue_number_for_api(thread)
            outcome.threads_checked += 1

            try:
                issue_read = get_issue(dest, issue_ref, _issue_etag(thread))
            except ProviderError as exc:
                if exc.class_ == "auth_lost":
                    _pause_connector_auth(conn, connector_id, container_id)
                    outcome.issues_marked_inaccessible += len(threads)
                    outcome.details["connectorPaused"] = True
                    raise
                raise

            enumerate_replies = False
            if isinstance(issue_read, RemoteIssue):
                previous_state = str(thread.get("link_state") or "linked")
                if previous_state == "inaccessible":
                    outcome.issues_recovered += 1
                _mark_issue_recovered(conn, thread, issue_read)
                enumerate_replies = True
            elif isinstance(issue_read, NotModified):
                enumerate_replies = True
            elif isinstance(issue_read, GoneConfirmed):
                _set_link_state(conn, thread_id, link_state="deleted")
                outcome.issues_marked_deleted += 1
                conn.execute(
                    "UPDATE tracked_threads SET last_verified_at = NOW() WHERE id = %s",
                    (thread_id,),
                )
                processed += 1
                idx = next((index for index, row in enumerate(threads) if str(row["id"]) == thread_id), 0)
                next_schedule_index = (idx + 1) % len(threads)
                continue
            elif isinstance(issue_read, ForbiddenRead):
                _set_link_state(conn, thread_id, link_state="inaccessible")
                outcome.issues_marked_inaccessible += 1
                conn.execute(
                    "UPDATE tracked_threads SET last_verified_at = NOW() WHERE id = %s",
                    (thread_id,),
                )
                processed += 1
                idx = next((index for index, row in enumerate(threads) if str(row["id"]) == thread_id), 0)
                next_schedule_index = (idx + 1) % len(threads)
                continue
            elif isinstance(issue_read, UncertainAbsence):
                refreshed = conn.execute(
                    "SELECT * FROM tracked_threads WHERE id = %s", (thread_id,)
                ).fetchone()
                row = dict(refreshed) if refreshed else thread
                result = _handle_issue_absence(
                    conn,
                    row,
                    complete_listing=True,
                    now=clock,
                )
                if result == "deleted":
                    outcome.issues_marked_deleted += 1
                else:
                    outcome.issues_marked_inaccessible += 1
                conn.execute(
                    "UPDATE tracked_threads SET last_verified_at = NOW() WHERE id = %s",
                    (thread_id,),
                )
                processed += 1
                idx = next((index for index, row in enumerate(threads) if str(row["id"]) == thread_id), 0)
                next_schedule_index = (idx + 1) % len(threads)
                continue
            elif isinstance(issue_read, Moved):
                transfer = apply_moved_issue(conn, thread, issue_read)
                outcome.issues_moved += 1
                outcome.details.setdefault("movedThreads", []).append(
                    {
                        "threadId": thread_id,
                        "action": transfer.action,
                        "reason": transfer.reason,
                        "linkState": transfer.link_state,
                    }
                )
                if transfer.action == "deferred":
                    outcome.details.setdefault("deferredMoves", []).append(thread_id)
                conn.execute(
                    "UPDATE tracked_threads SET last_verified_at = NOW() WHERE id = %s",
                    (thread_id,),
                )
                processed += 1
                idx = next((index for index, row in enumerate(threads) if str(row["id"]) == thread_id), 0)
                next_schedule_index = (idx + 1) % len(threads)
                continue
            else:
                outcome.details.setdefault("skippedThreads", []).append(thread_id)
                continue

            if not enumerate_replies:
                continue

            start_page = resume_comment_page if resume_thread_id == thread_id else None
            checked, tombstoned, resume_page, listing_complete = _verify_replies(
                conn,
                thread=thread,
                dest=dest,
                issue_ref=issue_ref,
                list_comments=list_comments,
                get_comment=get_comment,
                start_page=start_page,
                allow_partial=True,
            )
            outcome.replies_checked += checked
            outcome.replies_tombstoned += tombstoned

            if resume_page:
                thread_resume, comment_page = _decode_page_cursor(resume_page)
                _save_page_progress(
                    conn,
                    kind=checkpoint_kind,
                    scope=scope,
                    thread_id=thread_resume or thread_id,
                    comment_page=comment_page,
                )
                outcome.complete = False
                outcome.details["schedule_index"] = schedule_index
                return outcome

            if listing_complete:
                if isinstance(issue_read, NotModified):
                    _touch_issue_verified(conn, thread_id)

            processed += 1
            resume_thread_id = None
            resume_comment_page = None
            idx = next((index for index, row in enumerate(threads) if str(row["id"]) == thread_id), 0)
            next_schedule_index = (idx + 1) % len(threads)

        _save_sweep_complete(
            conn,
            kind=checkpoint_kind,
            scope=scope,
            schedule_index=next_schedule_index,
            connector_id=connector_id,
            container_id=container_id,
        )
        outcome.complete = True
        outcome.details["schedule_index"] = next_schedule_index
        return outcome
    except ProviderError as exc:
        error = exc.to_dto()
        retry = _retry_seconds(exc)
        _save_sweep_error(
            conn,
            kind=checkpoint_kind,
            scope=scope,
            error=error,
            retry_after_seconds=retry,
        )
        outcome.error = error
        outcome.retry_after_seconds = retry
        outcome.details["schedule_index"] = schedule_index
        return outcome


def _retry_seconds(exc: ProviderError) -> int:
    if exc.class_ == "rate_limited":
        resume = exc.resume_at
        if resume:
            text = str(resume)
            if text.endswith("Z"):
                text = text[:-1] + "+00:00"
            try:
                parsed = datetime.fromisoformat(text)
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                delta = parsed.astimezone(timezone.utc) - datetime.now(timezone.utc)
                return max(1, int(delta.total_seconds()))
            except ValueError:
                pass
        return 60
    if exc.class_ in {"auth_lost", "forbidden"}:
        return 15 * 60
    return 3 * 60


__all__ = [
    "CHECKPOINT_KIND",
    "DELETION_CONFIRM_SECONDS",
    "SweepOutcome",
    "sweep_destination_links",
]
