"""Outbound reply create/edit/delete execution and recovery (TR-29, C4/C5/D2).

Dispatches ``add_comment``, ``edit_comment`` and ``delete_comment`` ops via the
provider comment adapter. Recovery scans issue comments by reply marker and
bot identity. GitHub REST routes use ``external_number`` (R2-H1).

Handlers register on the composition op-kind dispatch table (R3-H2); there is
no @wraps monkey-patch of ``create_executor.execute_claimed_op``.
"""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Iterator, Mapping

from app.core.config import settings
from app.core.roles import Role, normalize_role
from app.services.trackers.contracts import Destination, RemoteComment
from app.services.trackers.errors import ProviderError
from app.services.trackers.github_comments import GitHubCommentAdapter
from app.services.trackers.github_recovery import (
    RecoveryKind,
    make_comment_page_fetcher,
    next_quarantine_at,
    recover_add_comment,
    recovery_since,
)
from app.services.trackers.markers import build_marker
from app.services.trackers.op_store import EXECUTE_DISPATCH, RECOVERY_DISPATCH, OpStore
from app.services.trackers.promotion import DispatchPause, PublicationDenied, evaluate_dispatch
from app.services.trackers.provenance import body_hash, stored_hash_matches
from app.services.trackers.reply_mutations import REPLY_OPS, decode_reply_target
from app.services.trackers.store import TrackerStore, issue_number_for_api

_mounted = False
_connect_factory: Callable[[], Any] | None = None


def github_comment_url(
    container_path: str,
    issue_number: int | str,
    comment_id: int | str,
) -> str:
    """Human-facing GitHub comment URL keyed by repo issue number (R2-H1)."""

    path = (container_path or "").strip().strip("/")
    if path.count("/") != 1:
        raise ValueError("container_path must be owner/repo")
    owner, repo = path.split("/", 1)
    return f"https://github.com/{owner}/{repo}/issues/{issue_number}#issuecomment-{comment_id}"


@dataclass(frozen=True)
class _ReplyContext:
    op: dict
    thread: dict
    reply: dict
    reply_id: str
    project_id: str
    policy: dict
    connector: dict
    destination: Destination


def build_reply_body(
    *,
    content: str,
    connector_id: str,
    container_id: str,
    reply_id: str,
    op_id: str,
    attribution: str | None = None,
) -> str:
    marker = build_marker(
        connector_id=connector_id,
        container_id=container_id,
        reply_id=reply_id,
        op_id=op_id,
    )
    blocks: list[str] = []
    if attribution:
        blocks.append(attribution)
    blocks.append(content)
    blocks.append(marker)
    return "\n\n".join(blocks)


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


def _clear_mount_flag() -> None:
    global _mounted
    _mounted = False


def mount_reply_executor() -> None:
    """Register reply ops on the composition dispatch table."""

    global _mounted
    if _mounted:
        return
    from app.services.trackers.composition import mount_outbound_executor, register_outbound_op

    for kind in REPLY_OPS:
        register_outbound_op(kind, execute=execute_reply_claimed_op, recover=recover_reply_op)
    mount_outbound_executor()
    _mounted = True


def unmount_reply_executor() -> None:
    global _mounted
    if not _mounted:
        return
    from app.services.trackers.composition import unregister_outbound_ops

    unregister_outbound_ops(*REPLY_OPS)
    _mounted = False


def execute_reply_claimed_op(claimed: Mapping[str, Any]) -> str | None:
    """Dispatch one claimed reply op. Confirms in-DB when complete."""

    dispatch = str(claimed.get("dispatch") or EXECUTE_DISPATCH)
    with _default_connect() as conn:
        ops = OpStore(conn)
        op_id = str(claimed["id"])
        fence = int(claimed["fence"])
        fresh = ops.get(op_id)
        if str(fresh.get("state") or "") == "confirmed":
            conn.commit()
            return None
        if dispatch == RECOVERY_DISPATCH:
            recover_reply_op(conn, fresh)
        else:
            _execute_reply(conn, fresh, ops)
        conn.commit()
    return None


def recover_reply_op(conn: Any, op: Mapping[str, Any]) -> None:
    ops = OpStore(conn)
    op_id = str(op["id"])
    fence = int(op["fence"])
    if str(op.get("state") or "") == "confirmed":
        return
    kind = str(op.get("op") or "")
    if kind == "add_comment":
        _recover_add(conn, op, ops)
        return
    if kind == "edit_comment":
        _recover_edit(conn, op, ops)
        return
    if kind == "delete_comment":
        _recover_delete(conn, op, ops)
        return


def _encrypt_context(connector_id: str) -> bytes:
    return f"tracker:connector:{connector_id}".encode()


def _comment_adapter(connector: Mapping[str, Any], *, http: Any | None = None) -> GitHubCommentAdapter:
    from app.services.trackers.create_executor import _issue_adapter

    issue_adapter = _issue_adapter(connector, http=http)
    return GitHubCommentAdapter(
        issue_adapter.auth,
        http=issue_adapter.http,
        bot_user_id=str(connector.get("bot_forge_user_id") or ""),
        bot_login=str(connector.get("bot_login") or ""),
    )


def _workspace_schema(conn: Any) -> str:
    row = conn.execute("SHOW search_path").fetchone()
    first = str(row["search_path"]).split(",")[0].strip().strip('"')
    if first and first not in {"$user", "public"}:
        return first
    return "workspace"


def _actor_role(_conn: Any, _actor_user_id: str | None) -> Role:
    return normalize_role("designer") or "designer"  # type: ignore[return-value]


def _load_reply_context(conn: Any, op: Mapping[str, Any]) -> _ReplyContext:
    reply_id = decode_reply_target(op.get("expected_remote_state"))
    if not reply_id:
        raise ProviderError("invalid_request", "reply op is missing reply target", retryable=False)
    op_row = conn.execute("SELECT * FROM sync_ops WHERE id = %s", (str(op["id"]),)).fetchone()
    if op_row is None:
        raise ProviderError("invalid_request", "reply op is missing")
    thread_row = conn.execute(
        "SELECT * FROM tracked_threads WHERE id = %s",
        (str(op_row["tracked_thread_id"]),),
    ).fetchone()
    if thread_row is None:
        raise ProviderError("invalid_request", "tracked thread is missing")
    if thread_row.get("unlinked_at") is not None:
        raise ProviderError("invalid_request", "thread is unlinked", retryable=False)
    reply_row = conn.execute(
        """
        SELECT * FROM comment_replies
        WHERE id = %s AND comment_id = %s
        """,
        (reply_id, str(thread_row["comment_id"])),
    ).fetchone()
    if reply_row is None:
        raise ProviderError("invalid_request", "reply is missing", retryable=False)
    comment_row = conn.execute(
        "SELECT * FROM comments WHERE id = %s",
        (str(thread_row["comment_id"]),),
    ).fetchone()
    if comment_row is None:
        raise ProviderError("invalid_request", "comment is missing")
    meta = conn.execute(
        """
        SELECT pt.*, tc.provider, tc.instance_kind, tc.base_url, tc.credential_envelope,
               tc.bot_forge_user_id, tc.bot_login, tc.paused AS connector_paused
        FROM project_trackers pt
        JOIN tracker_connectors tc ON tc.id = pt.connector_id
        WHERE pt.id = %s
        """,
        (str(thread_row["project_tracker_id"]),),
    ).fetchone()
    if meta is None:
        raise ProviderError("invalid_request", "project tracker is missing")
    destination = Destination(
        connectorId=str(thread_row["connector_id"]),
        containerKind=str(meta.get("container_kind") or "repo"),  # type: ignore[arg-type]
        containerPath=str(meta.get("container_path") or ""),
        remoteContainerId=str(thread_row["remote_container_id"]),
        generation=int(meta.get("destination_generation") or 1),
        visibility=str(meta.get("visibility") or "unknown"),  # type: ignore[arg-type]
    )
    policy = {
        "connector_id": str(thread_row["connector_id"]),
        "remote_container_id": str(thread_row["remote_container_id"]),
        "container_path": str(meta.get("container_path") or ""),
        "container_kind": str(meta.get("container_kind") or "repo"),
        "destination_generation": int(meta.get("destination_generation") or 1),
        "visibility": str(meta.get("visibility") or "unknown"),
        "promote_min_role": str(meta.get("promote_min_role") or "designer"),
        "connector_paused": bool(meta.get("connector_paused")),
        "connector_provider": str(meta.get("provider") or "github"),
    }
    thread = {
        "id": str(thread_row["id"]),
        "comment_id": str(thread_row["comment_id"]),
        "project_tracker_id": str(thread_row["project_tracker_id"]),
        "destination_generation": int(thread_row.get("destination_generation") or 1),
        "connector_id": str(thread_row["connector_id"]),
        "remote_container_id": str(thread_row["remote_container_id"]),
        "external_id": str(thread_row.get("external_id") or ""),
        "external_number": thread_row.get("external_number"),
        "external_url": thread_row.get("external_url"),
        "link_state": thread_row.get("link_state"),
    }
    reply = {
        "id": str(reply_row["id"]),
        "content": reply_row.get("content") or "",
        "revision": int(reply_row.get("revision") or 1),
        "author": reply_row.get("author") or "",
        "origin": reply_row.get("origin") or "prism",
        "deleted_at": reply_row.get("deleted_at"),
    }
    return _ReplyContext(
        op=dict(op_row),
        thread=thread,
        reply=reply,
        reply_id=reply_id,
        project_id=str(comment_row["project_id"]),
        policy=policy,
        connector={
            "id": str(thread_row["connector_id"]),
            "provider": str(meta.get("provider") or "github"),
            "instance_kind": str(meta.get("instance_kind") or "github.com"),
            "base_url": str(meta.get("base_url") or ""),
            "credential_envelope": meta.get("credential_envelope"),
            "bot_forge_user_id": str(meta.get("bot_forge_user_id") or ""),
            "bot_login": str(meta.get("bot_login") or ""),
        },
        destination=destination,
    )


def _policy_check(conn: Any, ctx: _ReplyContext) -> None:
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


def _stale_intent(conn: Any, ctx: _ReplyContext, ops: OpStore) -> bool:
    current = conn.execute(
        "SELECT revision, deleted_at FROM comment_replies WHERE id = %s",
        (ctx.reply_id,),
    ).fetchone()
    if current is None:
        ops.supersede(str(ctx.op["id"]), int(ctx.op["fence"]), reason="reply missing")
        return True
    op_revision = int(ctx.op.get("local_revision") or 0)
    live_revision = int(current.get("revision") or 0)
    if op_revision < live_revision:
        ops.supersede(str(ctx.op["id"]), int(ctx.op["fence"]), reason="stale local revision")
        return True
    op_kind = str(ctx.op.get("op") or "")
    if op_kind in {"add_comment", "edit_comment"} and current.get("deleted_at") is not None:
        ops.supersede(str(ctx.op["id"]), int(ctx.op["fence"]), reason="reply tombstoned")
        return True
    return False


def _reply_attribution(reply: Mapping[str, Any]) -> str | None:
    author = str(reply.get("author") or "").strip()
    if not author:
        return None
    return f"*{author}* (via Prism)"


def _confirm_reply_link(
    conn: Any,
    store: TrackerStore,
    *,
    thread_id: str,
    reply_id: str,
    remote: RemoteComment,
    op_id: str,
    fence: int,
    ops: OpStore,
    container_path: str,
    issue_number: str,
) -> None:
    existing = conn.execute(
        "SELECT id FROM tracked_replies WHERE reply_id = %s",
        (reply_id,),
    ).fetchone()
    if existing is None:
        store.insert_reply_link(
            link_id=f"trl_{uuid.uuid4().hex[:8]}",
            tracked_thread_id=thread_id,
            reply_id=reply_id,
            external_comment_id=str(remote.externalCommentId),
            remote_author_id=remote.author.id,
            remote_author_login=remote.author.login,
        )
    url = remote.url or github_comment_url(
        container_path,
        issue_number,
        remote.externalCommentId,
    )
    conn.execute(
        """
        UPDATE tracked_replies
        SET external_url = %s
        WHERE reply_id = %s
        """,
        (url, reply_id),
    )
    conn.execute(
        "UPDATE comment_replies SET sync_state = NULL WHERE id = %s",
        (reply_id,),
    )
    ops.confirm(op_id, fence, external_result_id=str(remote.externalCommentId))


def _execute_reply(conn: Any, op: Mapping[str, Any], ops: OpStore) -> None:
    ctx = _load_reply_context(conn, op)
    op_id = str(op["id"])
    fence = int(op["fence"])
    if _stale_intent(conn, ctx, ops):
        return
    external_id = str(ctx.thread.get("external_id") or "")
    if external_id in ("", "pending"):
        return
    kind = str(ctx.op.get("op") or "")
    link = conn.execute(
        "SELECT external_comment_id FROM tracked_replies WHERE reply_id = %s",
        (ctx.reply_id,),
    ).fetchone()
    if kind == "add_comment" and link is not None:
        ops.confirm(op_id, fence, external_result_id=str(link["external_comment_id"]))
        return
    try:
        _policy_check(conn, ctx)
        adapter = _comment_adapter(ctx.connector)
        issue_ref = issue_number_for_api(ctx.thread)
        if kind == "add_comment":
            body = build_reply_body(
                content=str(ctx.reply.get("content") or ""),
                connector_id=ctx.destination.connectorId,
                container_id=ctx.destination.remoteContainerId,
                reply_id=ctx.reply_id,
                op_id=op_id,
                attribution=_reply_attribution(ctx.reply),
            )
            remote = adapter.add_comment(
                ctx.destination,
                issue_ref,
                body,
                op_id,
                issue_id=external_id,
            )
            _confirm_reply_link(
                conn,
                TrackerStore(conn),
                thread_id=str(ctx.thread["id"]),
                reply_id=ctx.reply_id,
                remote=remote,
                op_id=op_id,
                fence=fence,
                ops=ops,
                container_path=str(ctx.policy.get("container_path") or ""),
                issue_number=issue_ref,
            )
            return
        if link is None:
            ops.fail(op_id, fence, error={"class": "invalid_request", "message": "reply is not linked"})
            return
        ext_cid = str(link["external_comment_id"])
        if kind == "edit_comment":
            body = build_reply_body(
                content=str(ctx.reply.get("content") or ""),
                connector_id=ctx.destination.connectorId,
                container_id=ctx.destination.remoteContainerId,
                reply_id=ctx.reply_id,
                op_id=op_id,
                attribution=_reply_attribution(ctx.reply),
            )
            remote = adapter.edit_comment(ctx.destination, ext_cid, body)
            ops.confirm(op_id, fence, external_result_id=str(remote.externalCommentId))
            return
        if kind == "delete_comment":
            adapter.delete_comment(ctx.destination, ext_cid)
            ops.confirm(op_id, fence, external_result_id=ext_cid)
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


def _recover_add(conn: Any, op: Mapping[str, Any], ops: OpStore) -> None:
    ctx = _load_reply_context(conn, op)
    op_id = str(op["id"])
    fence = int(op["fence"])
    link = conn.execute(
        "SELECT external_comment_id FROM tracked_replies WHERE reply_id = %s",
        (ctx.reply_id,),
    ).fetchone()
    if link is not None:
        ops.confirm(op_id, fence, external_result_id=str(link["external_comment_id"]))
        return
    adapter = _comment_adapter(ctx.connector)
    issue_ref = issue_number_for_api(ctx.thread)
    marker_text = build_marker(
        connector_id=ctx.destination.connectorId,
        container_id=ctx.destination.remoteContainerId,
        reply_id=ctx.reply_id,
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
        _confirm_reply_link(
            conn,
            TrackerStore(conn),
            thread_id=str(ctx.thread["id"]),
            reply_id=ctx.reply_id,
            remote=remote,
            op_id=op_id,
            fence=fence,
            ops=ops,
            container_path=str(ctx.policy.get("container_path") or ""),
            issue_number=issue_ref,
        )
        return
    sent_at = op.get("sent_at")
    if isinstance(sent_at, datetime) and sent_at.tzinfo is None:
        sent_at = sent_at.replace(tzinfo=timezone.utc)
    outcome = recover_add_comment(
        op,
        dest=ctx.destination,
        reply_id=ctx.reply_id,
        fetch_page=make_comment_page_fetcher(adapter, ctx.destination, issue_ref),
        bot_user_id=str(ctx.connector.get("bot_forge_user_id") or ""),
    )
    if outcome.kind == RecoveryKind.FOUND and outcome.match is not None:
        fallback = adapter.get_comment(ctx.destination, str(outcome.match.external_id), etag=None)
        if isinstance(fallback, RemoteComment):
            _confirm_reply_link(
                conn,
                TrackerStore(conn),
                thread_id=str(ctx.thread["id"]),
                reply_id=ctx.reply_id,
                remote=fallback,
                op_id=op_id,
                fence=fence,
                ops=ops,
                container_path=str(ctx.policy.get("container_path") or ""),
                issue_number=issue_ref,
            )
        return
    if outcome.kind == RecoveryKind.INCOMPLETE:
        ops.schedule(op_id, fence, next_attempt_at=datetime.now(timezone.utc), consume_attempt=False)
        return
    if str(op.get("state") or "") == "sent":
        ops.enter_recovery(op_id, fence)
    attempt_index = max(0, int(op.get("attempts") or 1) - 1)
    resume = next_quarantine_at(attempt_index)
    ops.enter_quarantine(op_id, fence, next_attempt_at=resume)
    detail = (
        "ambiguous reply recovery scan"
        if outcome.kind == RecoveryKind.AMBIGUOUS
        else "reply not found during recovery scan"
    )
    ops.schedule(
        op_id,
        fence,
        next_attempt_at=resume,
        error={"class": "transient", "message": detail, "retryable": True},
        consume_attempt=False,
    )


def _recover_edit(conn: Any, op: Mapping[str, Any], ops: OpStore) -> None:
    ctx = _load_reply_context(conn, op)
    op_id = str(op["id"])
    fence = int(op["fence"])
    if _stale_intent(conn, ctx, ops):
        return
    link = conn.execute(
        "SELECT external_comment_id FROM tracked_replies WHERE reply_id = %s",
        (ctx.reply_id,),
    ).fetchone()
    if link is None:
        ops.fail(op_id, fence, error={"class": "invalid_request", "message": "reply is not linked"})
        return
    adapter = _comment_adapter(ctx.connector)
    result = adapter.get_comment(ctx.destination, str(link["external_comment_id"]), etag=None)
    if isinstance(result, RemoteComment):
        expected = str(op.get("expected_body_hash") or "")
        if stored_hash_matches(expected, result.body or ""):
            ops.confirm(op_id, fence, external_result_id=str(result.externalCommentId))
            return
    if str(op.get("state") or "") == "sent":
        ops.enter_recovery(op_id, fence)
    attempt_index = max(0, int(op.get("attempts") or 1) - 1)
    resume = next_quarantine_at(attempt_index)
    ops.enter_quarantine(op_id, fence, next_attempt_at=resume)
    ops.schedule(
        op_id,
        fence,
        next_attempt_at=resume,
        error={"class": "transient", "message": "edit not yet visible on provider", "retryable": True},
        consume_attempt=False,
    )


def _recover_delete(conn: Any, op: Mapping[str, Any], ops: OpStore) -> None:
    ctx = _load_reply_context(conn, op)
    op_id = str(op["id"])
    fence = int(op["fence"])
    link = conn.execute(
        "SELECT external_comment_id FROM tracked_replies WHERE reply_id = %s",
        (ctx.reply_id,),
    ).fetchone()
    if link is None:
        ops.confirm(op_id, fence)
        return
    adapter = _comment_adapter(ctx.connector)
    result = adapter.get_comment(ctx.destination, str(link["external_comment_id"]), etag=None)
    from app.services.trackers.contracts import GoneConfirmed

    if isinstance(result, GoneConfirmed):
        ops.confirm(op_id, fence, external_result_id=str(link["external_comment_id"]))
        return
    if str(op.get("state") or "") == "sent":
        ops.enter_recovery(op_id, fence)
    attempt_index = max(0, int(op.get("attempts") or 1) - 1)
    resume = next_quarantine_at(attempt_index)
    ops.enter_quarantine(op_id, fence, next_attempt_at=resume)
    ops.schedule(
        op_id,
        fence,
        next_attempt_at=resume,
        error={"class": "transient", "message": "delete not yet visible on provider", "retryable": True},
        consume_attempt=False,
    )


__all__ = [
    "build_reply_body",
    "execute_reply_claimed_op",
    "github_comment_url",
    "mount_reply_executor",
    "recover_reply_op",
    "set_connect_factory",
    "unmount_reply_executor",
]
