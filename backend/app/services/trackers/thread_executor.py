"""Outbound root update and deletion-note execution (TR-30, C4/C5/D2/D5).

Dispatches ``update_issue`` and ``post_note`` ops. Root updates preserve remote
context/marker blocks; deletion notes post as bot comments and never delete the
remote issue. GitHub REST routes use ``external_number`` (R2-H1).
"""

from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Any, Callable, Iterator, Mapping

from app.core.config import settings
from app.core.roles import Role, normalize_role
from app.services.trackers.contracts import IssuePatch, RemoteComment, RemoteIssue
from app.services.trackers.create_executor import _issue_adapter, _load_execution_context
from app.services.trackers.drafts import (
    DraftAttribution,
    DraftRenderInput,
    build_issue_draft,
)
from app.services.trackers.errors import ProviderError
from app.services.trackers.github_recovery import make_comment_page_fetcher, next_quarantine_at
from app.services.trackers.markers import build_marker
from app.services.trackers.op_store import EXECUTE_DISPATCH, RECOVERY_DISPATCH, OpStore
from app.services.trackers.promotion import DispatchPause, PublicationDenied, evaluate_dispatch
from app.services.trackers.provenance import body_hash
from app.services.trackers.store import issue_number_for_api
from app.services.trackers.thread_mutations import (
    DELETION_NOTE,
    THREAD_OPS,
    compose_outbound_issue_body,
    should_rewrite_title,
)

_mounted = False
_connect_factory: Callable[[], Any] | None = None
_original_execute: Callable[[Mapping[str, Any]], str | None] | None = None
_original_recover: Callable[..., str | None] | None = None


def set_connect_factory(factory: Callable[[], Any] | None) -> None:
    global _connect_factory
    _connect_factory = factory


@contextmanager
def _default_connect() -> Iterator[Any]:
    if _connect_factory is not None:
        with _connect_factory() as conn:
            yield conn
        return
    from app.services.postgres_database import database

    with database.connection() as conn:
        conn.execute("SET search_path TO comments, workspace, public")
        yield conn


def mount_thread_executor() -> None:
    """Patch outbound dispatch so root thread ops execute and recover."""

    global _mounted, _original_execute, _original_recover
    if _mounted:
        return

    import app.services.trackers.composition as composition
    import app.services.trackers.create_executor as create_executor

    _original_execute = create_executor.execute_claimed_op
    _original_recover = composition.TrackerRuntime._recover_op

    @wraps(_original_execute)
    def execute_claimed_op(claimed: Mapping[str, Any]) -> str | None:
        if str(claimed.get("op") or "") in THREAD_OPS:
            return execute_thread_claimed_op(claimed)
        return _original_execute(claimed)

    def _recover_op(self, conn: Any, claimed: Mapping[str, Any]) -> str | None:  # noqa: ANN001
        if str(claimed.get("op") or "") in THREAD_OPS:
            recover_thread_op(conn, claimed)
            return None
        return _original_recover(self, conn, claimed)

    create_executor.execute_claimed_op = execute_claimed_op
    composition.TrackerRuntime._recover_op = _recover_op
    _mounted = True


def unmount_thread_executor() -> None:
    global _mounted, _original_execute, _original_recover
    if not _mounted:
        return
    import app.services.trackers.composition as composition
    import app.services.trackers.create_executor as create_executor

    if _original_execute is not None:
        create_executor.execute_claimed_op = _original_execute
    if _original_recover is not None:
        composition.TrackerRuntime._recover_op = _original_recover
    _mounted = False


def execute_thread_claimed_op(claimed: Mapping[str, Any]) -> str | None:
    dispatch = str(claimed.get("dispatch") or EXECUTE_DISPATCH)
    with _default_connect() as conn:
        ops = OpStore(conn)
        op_id = str(claimed["id"])
        fresh = ops.get(op_id)
        if str(fresh.get("state") or "") == "confirmed":
            conn.commit()
            return None
        if dispatch == RECOVERY_DISPATCH:
            recover_thread_op(conn, fresh)
        else:
            _execute_thread(conn, fresh, ops)
        conn.commit()
    return None


def recover_thread_op(conn: Any, op: Mapping[str, Any]) -> None:
    ops = OpStore(conn)
    kind = str(op.get("op") or "")
    if kind == "post_note":
        _recover_post_note(conn, op, ops)
        return
    if kind == "update_issue":
        _recover_update_issue(conn, op, ops)


def _workspace_schema(conn: Any) -> str:
    row = conn.execute("SHOW search_path").fetchone()
    first = str(row["search_path"]).split(",")[0].strip().strip('"')
    if first and first not in {"$user", "public"}:
        return first
    return "workspace"


def _actor_role(_conn: Any, _actor_user_id: str | None) -> Role:
    return normalize_role("designer") or "designer"  # type: ignore[return-value]


def _policy_check(conn: Any, ctx: Any) -> None:
    try:
        evaluate_dispatch(
            conn,
            ctx.project_id,
            _actor_role(conn, ctx.op.get("actor_user_id")),
            workspace_schema=_workspace_schema(conn),
        )
    except PublicationDenied as exc:
        raise ProviderError("forbidden", str(exc), retryable=False) from exc
    except DispatchPause as exc:
        raise ProviderError("auth_lost", str(exc), retryable=False) from exc
    if int(ctx.op.get("destination_generation") or 0) != int(ctx.policy.get("destination_generation") or 0):
        raise ProviderError("invalid_request", "destination generation mismatch", retryable=False)


def _build_draft(ctx: Any) -> Any:
    return build_issue_draft(
        DraftRenderInput(
            project_id=ctx.project_id,
            comment=ctx.comment,
            connector_id=ctx.destination.connectorId,
            remote_container_id=ctx.destination.remoteContainerId,
            op_id=str(ctx.op["id"]),
            public_base_url=settings.PUBLIC_BASE_URL,
            attribution=DraftAttribution(
                display_name=str(ctx.comment.get("author") or "Unknown"),
                verified=str(ctx.comment.get("authorKind") or "") != "legacy",
            ),
        )
    )


def _mark_body_diverged(conn: Any, thread_id: str, ops: OpStore, op_id: str, fence: int) -> None:
    conn.execute(
        "UPDATE tracked_threads SET body_authority = 'forge' WHERE id = %s",
        (thread_id,),
    )
    ops.supersede(op_id, fence, reason="remote body diverged from prism blocks")


def _refresh_thread_metadata(conn: Any, thread: Mapping[str, Any]) -> dict:
    row = conn.execute(
        """
        SELECT body_authority, last_title_hash, unlinked_at
        FROM tracked_threads
        WHERE id = %s
        """,
        (str(thread["id"]),),
    ).fetchone()
    if row is None:
        return dict(thread)
    return {**dict(thread), **dict(row)}


def _execute_update_issue(conn: Any, op: Mapping[str, Any], ops: OpStore) -> None:
    ctx = _load_execution_context(conn, op)
    op_id = str(op["id"])
    fence = int(op["fence"])
    thread = _refresh_thread_metadata(conn, ctx.thread)
    thread_id = str(thread["id"])
    if thread.get("unlinked_at") is not None:
        ops.supersede(op_id, fence, reason="thread unlinked")
        return
    if str(thread.get("body_authority") or "prism") == "forge":
        ops.supersede(op_id, fence, reason="body authority is forge")
        return
    external_id = str(thread.get("external_id") or "")
    if external_id in ("", "pending"):
        return
    try:
        _policy_check(conn, ctx)
        adapter = _issue_adapter(ctx.connector)
        issue_ref = issue_number_for_api(thread)
        fetched = adapter.get_issue(ctx.destination, issue_ref, etag=None)
        if not isinstance(fetched, RemoteIssue):
            raise ProviderError("transient", "Issue fetch did not return a readable issue")
        composed = compose_outbound_issue_body(
            local_prose=str(ctx.comment.get("content") or ""),
            remote_body=fetched.body or "",
        )
        if composed is None:
            _mark_body_diverged(conn, thread_id, ops, op_id, fence)
            return
        draft = _build_draft(ctx)
        patch = IssuePatch(
            proseBlock=composed,
            labels=list(draft.labels),
            title=draft.title if should_rewrite_title(thread, fetched.title or "") else None,
        )
        updated = adapter.update_issue(ctx.destination, issue_ref, patch)
        if patch.title is not None:
            conn.execute(
                "UPDATE tracked_threads SET last_title_hash = %s WHERE id = %s",
                (body_hash(patch.title), thread_id),
            )
        conn.execute(
            """
            UPDATE tracked_threads
            SET remote_state = %s,
                remote_version = %s::jsonb,
                last_verified_at = NOW()
            WHERE id = %s
            """,
            (
                updated.state,
                json.dumps(dict(updated.version.model_dump())),
                thread_id,
            ),
        )
        ops.confirm(op_id, fence, external_result_id=str(updated.externalId))
    except ProviderError as exc:
        if str(op.get("state") or "") == "sent" and exc.class_ not in {"auth_lost", "forbidden"}:
            ops.enter_recovery(op_id, fence)
            raise
        if exc.class_ in {"auth_lost", "forbidden"}:
            ops.schedule(
                op_id,
                fence,
                next_attempt_at=datetime.now(timezone.utc) + timedelta(minutes=15),
                error=exc.to_dto(),
                consume_attempt=False,
            )
            return
        raise


def _build_deletion_note_body(
    *,
    connector_id: str,
    container_id: str,
    comment_id: str,
    op_id: str,
) -> str:
    marker = build_marker(
        connector_id=connector_id,
        container_id=container_id,
        comment_id=comment_id,
        op_id=op_id,
    )
    return f"{DELETION_NOTE}\n\n{marker}"


def _execute_post_note(conn: Any, op: Mapping[str, Any], ops: OpStore) -> None:
    ctx = _load_execution_context(conn, op)
    op_id = str(op["id"])
    fence = int(op["fence"])
    thread = ctx.thread
    external_id = str(thread.get("external_id") or "")
    if external_id in ("", "pending"):
        ops.supersede(op_id, fence, reason="thread not confirmed")
        return
    try:
        _policy_check(conn, ctx)
        from app.services.trackers.reply_executor import _comment_adapter

        adapter = _comment_adapter(ctx.connector)
        issue_ref = issue_number_for_api(thread)
        body = _build_deletion_note_body(
            connector_id=ctx.destination.connectorId,
            container_id=ctx.destination.remoteContainerId,
            comment_id=str(thread["comment_id"]),
            op_id=op_id,
        )
        remote = adapter.add_comment(
            ctx.destination,
            issue_ref,
            body,
            op_id,
            issue_id=external_id,
        )
        ops.confirm(op_id, fence, external_result_id=str(remote.externalCommentId))
    except ProviderError as exc:
        if str(op.get("state") or "") == "sent" and exc.class_ not in {"auth_lost", "forbidden"}:
            ops.enter_recovery(op_id, fence)
            raise
        if exc.class_ in {"auth_lost", "forbidden"}:
            ops.schedule(
                op_id,
                fence,
                next_attempt_at=datetime.now(timezone.utc) + timedelta(minutes=15),
                error=exc.to_dto(),
                consume_attempt=False,
            )
            return
        raise


def _execute_thread(conn: Any, op: Mapping[str, Any], ops: OpStore) -> None:
    kind = str(op.get("op") or "")
    if kind == "update_issue":
        _execute_update_issue(conn, op, ops)
        return
    if kind == "post_note":
        _execute_post_note(conn, op, ops)
        return


def _recover_post_note(conn: Any, op: Mapping[str, Any], ops: OpStore) -> None:
    ctx = _load_execution_context(conn, op)
    op_id = str(op["id"])
    fence = int(op["fence"])
    if str(op.get("state") or "") == "confirmed":
        return
    from app.services.trackers.reply_executor import _comment_adapter

    adapter = _comment_adapter(ctx.connector)
    issue_ref = issue_number_for_api(ctx.thread)
    marker_text = build_marker(
        connector_id=ctx.destination.connectorId,
        container_id=ctx.destination.remoteContainerId,
        comment_id=str(ctx.thread["comment_id"]),
        op_id=op_id,
    )
    try:
        remote = adapter.find_comment_by_marker(
            ctx.destination,
            issue_ref,
            marker_text,
            issue_id=str(ctx.thread.get("external_id") or ""),
        )
    except ProviderError:
        remote = None
    if isinstance(remote, RemoteComment):
        ops.confirm(op_id, fence, external_result_id=str(remote.externalCommentId))
        return
    sent_at = op.get("sent_at")
    if isinstance(sent_at, datetime) and sent_at.tzinfo is None:
        sent_at = sent_at.replace(tzinfo=timezone.utc)
    fetch_page = make_comment_page_fetcher(adapter, ctx.destination, issue_ref)
    cursor: str | None = None
    while True:
        try:
            items, cursor = fetch_page(cursor)
        except ProviderError:
            ops.schedule(op_id, fence, next_attempt_at=datetime.now(timezone.utc), consume_attempt=False)
            return
        for item in items:
            body = item.body or ""
            if marker_text not in body or DELETION_NOTE not in body:
                continue
            ops.confirm(op_id, fence, external_result_id=str(item.externalCommentId))
            return
        if not cursor:
            break
    if str(op.get("state") or "") == "sent":
        ops.enter_recovery(op_id, fence)
    attempt_index = max(0, int(op.get("attempts") or 1) - 1)
    resume = next_quarantine_at(attempt_index)
    ops.enter_quarantine(op_id, fence, next_attempt_at=resume)


def _recover_update_issue(conn: Any, op: Mapping[str, Any], ops: OpStore) -> None:
    op_id = str(op["id"])
    fence = int(op["fence"])
    if str(op.get("state") or "") == "confirmed":
        return
    try:
        _execute_update_issue(conn, op, ops)
    except ProviderError:
        if str(op.get("state") or "") == "sent":
            ops.enter_recovery(op_id, fence)
        attempt_index = max(0, int(op.get("attempts") or 1) - 1)
        ops.schedule(
            op_id,
            fence,
            next_attempt_at=next_quarantine_at(attempt_index),
            consume_attempt=False,
        )


__all__ = [
    "execute_thread_claimed_op",
    "mount_thread_executor",
    "recover_thread_op",
    "set_connect_factory",
    "unmount_thread_executor",
]
