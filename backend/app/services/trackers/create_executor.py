"""Outbound create_issue execution and recovery (TR-26, C4/C5/D2).

Claims pending ``create_issue`` ops, records ``sent`` before provider I/O (via
jobs), re-checks publication policy, renders the TR-24 draft and creates the
remote issue. Recovery scans never resend. Inbound hints for a destination are
applied when dispatch finds no due ops. Mounting enables hint-only scheduler
dispatch (R2-M5).
"""

from __future__ import annotations

import json
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Iterator, Mapping

from app.core.config import settings
from app.services.trackers.contracts import Destination, IssueRead, RemoteIssue
from app.services.trackers.drafts import (
    DraftAttribution,
    DraftRenderInput,
    build_issue_draft,
    render_issue_body_from_draft,
)
from app.services.trackers.errors import ProviderError
from app.services.trackers.executor_support import (
    NON_CONSUMING_ERROR_CLASSES,
    apply_provider_error,
    policy_check,
)
from app.services.trackers.github_recovery import (
    RecoveryKind,
    next_quarantine_at,
    recover_create_issue,
    recovery_since,
)
from app.services.trackers.op_store import EXECUTE_DISPATCH, RECOVERY_DISPATCH, OpStore
from app.services.trackers.providers import issue_adapter_for, issue_page_fetcher_for
from app.services.trackers.secrets import decrypt_secret

_mounted = False
_connect_factory: Callable[[], Any] | None = None


def github_issue_url(container_path: str, issue_number: int | str) -> str:
    """Human-facing GitHub issue URL keyed by repo number (R2-H1)."""

    path = (container_path or "").strip().strip("/")
    if path.count("/") != 1:
        raise ValueError("container_path must be owner/repo")
    owner, repo = path.split("/", 1)
    return f"https://github.com/{owner}/{repo}/issues/{issue_number}"


@dataclass(frozen=True)
class _ExecutionContext:
    op: dict
    thread: dict
    comment: dict
    project_id: str
    policy: dict
    connector: dict
    destination: Destination


def mount_create_executor() -> None:
    """Register create/set_state handlers on the composition dispatch table."""

    global _mounted
    if _mounted:
        return
    from app.services.trackers.composition import mount_outbound_executor, register_outbound_op

    register_outbound_op("create_issue", execute=execute_claimed_op)
    register_outbound_op("set_state", execute=execute_claimed_op)
    mount_outbound_executor()
    _mounted = True


def unmount_create_executor() -> None:
    """Test helper: tear down outbound composition mount (create path entrypoint)."""

    global _mounted
    from app.services.trackers.composition import unmount_outbound_executor

    unmount_outbound_executor()
    _mounted = False


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


def execute_claimed_op(claimed: Mapping[str, Any]) -> str | None:
    """Dispatch one claimed outbound op. Confirms in-DB when complete.

    DB work stops before provider I/O (R3-M3); the fence protects the confirm write.
    """

    dispatch = str(claimed.get("dispatch") or EXECUTE_DISPATCH)
    op_kind = str(claimed.get("op") or "")
    prepared: dict[str, Any] | None = None
    with _default_connect() as conn:
        ops = OpStore(conn)
        op_id = str(claimed["id"])
        fence = int(claimed["fence"])
        fresh = ops.get(op_id)
        if str(fresh.get("state") or "") == "confirmed":
            conn.commit()
            return None
        if op_kind == "set_state":
            from app.services.trackers.state_executor import execute_set_state_op

            execute_set_state_op(fresh, conn)
            conn.commit()
            return None
        if dispatch == RECOVERY_DISPATCH:
            prepared = _prepare_recover_create(conn, fresh, ops)
        else:
            prepared = _prepare_execute_create(conn, fresh, ops)
        conn.commit()

    if prepared is None or prepared.get("done"):
        return None

    try:
        result = _run_create_io(prepared)
    except ProviderError as exc:
        with _default_connect() as conn:
            apply_provider_error(
                conn,
                OpStore(conn),
                op=prepared["op"],
                fence=int(prepared["fence"]),
                exc=exc,
                connector_id=str(prepared["connector"]["id"]),
                remote_container_id=str(prepared["destination"].remoteContainerId),
            )
            conn.commit()
        return None

    with _default_connect() as conn:
        _finish_create(conn, prepared, result)
        conn.commit()
    return None


def _load_execution_context(conn: Any, op: Mapping[str, Any]) -> _ExecutionContext:
    op_row = conn.execute("SELECT * FROM sync_ops WHERE id = %s", (str(op["id"]),)).fetchone()
    if op_row is None:
        raise ProviderError("invalid_request", "create_issue op is missing")
    thread_row = conn.execute(
        "SELECT * FROM tracked_threads WHERE id = %s",
        (str(op_row["tracked_thread_id"]),),
    ).fetchone()
    if thread_row is None:
        raise ProviderError("invalid_request", "tracked thread is missing")
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
    # R4-M1: prefer the path snapshotted on the thread so recovery after a
    # project destination change still targets the forge repo that owns the issue.
    container_path = str(thread_row.get("container_path") or meta.get("container_path") or "")
    comment = _comment_dict_from_row(comment_row)
    destination = Destination(
        connectorId=str(thread_row["connector_id"]),
        containerKind=str(meta.get("container_kind") or "repo"),  # type: ignore[arg-type]
        containerPath=container_path,
        remoteContainerId=str(thread_row["remote_container_id"]),
        generation=int(thread_row.get("destination_generation") or meta.get("destination_generation") or 1),
        visibility=str(meta.get("visibility") or "unknown"),  # type: ignore[arg-type]
    )
    policy = {
        "connector_id": str(thread_row["connector_id"]),
        "remote_container_id": str(thread_row["remote_container_id"]),
        "container_path": container_path,
        "container_kind": str(meta.get("container_kind") or "repo"),
        "destination_generation": int(thread_row.get("destination_generation") or meta.get("destination_generation") or 1),
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
        "container_path": container_path,
        "external_id": str(thread_row.get("external_id") or ""),
        "external_number": thread_row.get("external_number"),
        "external_url": thread_row.get("external_url"),
        "link_state": thread_row.get("link_state"),
        "remote_state": thread_row.get("remote_state"),
        "remote_version": thread_row.get("remote_version"),
        "pending_op_id": thread_row.get("pending_op_id"),
    }
    return _ExecutionContext(
        op=dict(op_row),
        thread=thread,
        comment=comment,
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


def _comment_dict_from_row(row: Mapping[str, Any]) -> dict:
    metadata = row.get("metadata")
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except json.JSONDecodeError:
            metadata = {}
    if not isinstance(metadata, dict):
        metadata = {}
    return {
        "id": str(row.get("id") or row.get("comment_id") or ""),
        "author": row.get("author") or "",
        "authorKind": row.get("author_kind") or "legacy",
        "context": row.get("context") or "PCB",
        "scope": row.get("scope") or "canvas",
        "severity": row.get("severity") or "info",
        "commentClass": row.get("comment_class") or "general",
        "content": row.get("content") or "",
        "location": {
            "x": row.get("location_x", 0),
            "y": row.get("location_y", 0),
            "layer": row.get("location_layer") or "",
            "page": row.get("location_page") or "",
        },
        "anchor": {
            "state": row.get("anchor_state") or "unpinned",
            "source": row.get("anchor_source"),
            "commit": row.get("anchor_commit"),
            # Same key the comments store exposes: the project-relative .kicad_pro
            # that names the board. anchor_source is the anchor's origin ("client").
            "projectFile": row.get("project_relative_path"),
            "baseCommit": row.get("base_commit"),
            "compareCommit": row.get("compare_commit"),
            "selectedSide": row.get("selected_side"),
        },
        "revision": int(row.get("revision") or 1),
        "elementRef": row.get("element_ref"),
        "elementType": row.get("element_type"),
        "elementId": row.get("element_id"),
        "metadata": metadata,
    }


def _encrypt_context(connector_id: str) -> dict[str, str]:
    """AAD binding for the installation envelope; must equal the one the admin API wrote with."""

    from app.services.trackers.connector_service import _context

    return _context(connector_id)


def _issue_adapter(connector: Mapping[str, Any], *, http: Any | None = None) -> Any:
    """The connector provider's issue adapter, built from its decrypted envelope."""

    blob = connector.get("credential_envelope")
    if not blob:
        raise ProviderError("auth_lost", "Connector has no installation credentials.")
    material = json.loads(
        decrypt_secret(blob, _encrypt_context(str(connector["id"])), settings=settings).decode()
    )
    return issue_adapter_for(connector, material, http=http)


def _policy_check(conn: Any, ctx: _ExecutionContext) -> None:
    policy_check(
        conn,
        project_id=ctx.project_id,
        op=ctx.op,
        destination_generation=int(ctx.policy.get("destination_generation") or 0),
    )


def _build_draft(ctx: _ExecutionContext) -> Any:
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


def _confirm_create_link(
    conn: Any,
    ops: OpStore,
    *,
    thread: Mapping[str, Any],
    issue: RemoteIssue,
    op_id: str,
    fence: int,
    container_path: str,
) -> None:
    external_id = str(issue.externalId)
    number = issue.number
    url = issue.url or github_issue_url(container_path, number or external_id)
    conn.execute(
        """
        UPDATE tracked_threads
        SET external_id = %s,
            external_number = %s,
            external_url = %s,
            remote_state = %s,
            remote_version = %s::jsonb,
            pending_op_id = NULL,
            last_verified_at = NOW(),
            container_path = COALESCE(NULLIF(container_path, ''), %s)
        WHERE id = %s
        """,
        (
            external_id,
            str(number) if number is not None else None,
            url,
            issue.state,
            json.dumps(dict(issue.version.model_dump())),
            container_path or None,
            str(thread["id"]),
        ),
    )
    ops.confirm(op_id, fence, external_result_id=external_id)


def _prepare_execute_create(conn: Any, op: Mapping[str, Any], ops: OpStore) -> dict[str, Any] | None:
    """Load context and evaluate policy; caller must commit before provider I/O."""

    ctx = _load_execution_context(conn, op)
    op_id = str(op["id"])
    fence = int(op["fence"])
    external_id = str(ctx.thread.get("external_id") or "")
    if external_id not in ("", "pending"):
        if str(op.get("state") or "") != "confirmed":
            ops.confirm(op_id, fence, external_result_id=external_id)
        return {"done": True}
    try:
        _policy_check(conn, ctx)
    except ProviderError as exc:
        apply_provider_error(
            conn,
            ops,
            op=op,
            fence=fence,
            exc=exc,
            connector_id=str(ctx.connector["id"]),
            remote_container_id=str(ctx.destination.remoteContainerId),
            pre_io=True,
        )
        return {"done": True}
    draft = _build_draft(ctx)
    rendered_body = render_issue_body_from_draft(draft)
    outbound = draft.model_copy(update={"proseBlock": rendered_body, "marker": ""})
    return {
        "mode": "create",
        "op": dict(op),
        "fence": fence,
        "thread": ctx.thread,
        "connector": ctx.connector,
        "destination": ctx.destination,
        "outbound": outbound,
        "container_path": str(ctx.policy.get("container_path") or ""),
        "op_id": op_id,
    }


def _prepare_recover_create(conn: Any, op: Mapping[str, Any], ops: OpStore) -> dict[str, Any] | None:
    ctx = _load_execution_context(conn, op)
    op_id = str(op["id"])
    fence = int(op["fence"])
    external_id = str(ctx.thread.get("external_id") or "")
    if external_id not in ("", "pending") and str(op.get("state") or "") != "confirmed":
        ops.confirm(op_id, fence, external_result_id=external_id)
        return {"done": True}
    sent_at = op.get("sent_at")
    if isinstance(sent_at, datetime) and sent_at.tzinfo is None:
        sent_at = sent_at.replace(tzinfo=timezone.utc)
    return {
        "mode": "recover",
        "op": dict(op),
        "fence": fence,
        "thread": ctx.thread,
        "connector": ctx.connector,
        "destination": ctx.destination,
        "container_path": str(ctx.policy.get("container_path") or ""),
        "op_id": op_id,
        "sent_at": sent_at if isinstance(sent_at, datetime) else None,
        "attempts": int(op.get("attempts") or 1),
        "state": str(op.get("state") or ""),
    }


def _run_create_io(prepared: Mapping[str, Any]) -> Any:
    adapter = _issue_adapter(prepared["connector"])
    if prepared["mode"] == "create":
        return adapter.create_issue(prepared["destination"], prepared["outbound"], prepared["op_id"])
    outcome = recover_create_issue(
        prepared["op"],
        dest=prepared["destination"],
        comment_id=str(prepared["thread"]["comment_id"]),
        fetch_page=issue_page_fetcher_for(
            adapter,
            prepared["destination"],
            since=recovery_since(prepared.get("sent_at")),
        ),
        bot_user_id=str(prepared["connector"].get("bot_forge_user_id") or ""),
    )
    issue = None
    if outcome.kind == RecoveryKind.FOUND and outcome.match is not None:
        fetched = adapter.get_issue(
            prepared["destination"],
            str(outcome.match.number or outcome.match.external_id),
            etag=None,
        )
        if isinstance(fetched, RemoteIssue):
            issue = fetched
    return {"outcome": outcome, "issue": issue}


def _finish_create(conn: Any, prepared: Mapping[str, Any], result: Any) -> None:
    ops = OpStore(conn)
    op_id = str(prepared["op_id"])
    fence = int(prepared["fence"])
    if prepared["mode"] == "create":
        _confirm_create_link(
            conn,
            ops,
            thread=prepared["thread"],
            issue=result,
            op_id=op_id,
            fence=fence,
            container_path=str(prepared["container_path"]),
        )
        return
    outcome = result["outcome"]
    issue = result["issue"]
    if outcome.kind == RecoveryKind.FOUND and issue is not None:
        _confirm_create_link(
            conn,
            ops,
            thread=prepared["thread"],
            issue=issue,
            op_id=op_id,
            fence=fence,
            container_path=str(prepared["container_path"]),
        )
        return
    if outcome.kind == RecoveryKind.INCOMPLETE:
        ops.schedule(
            op_id,
            fence,
            next_attempt_at=datetime.now(timezone.utc),
            consume_attempt=False,
        )
        return
    if prepared.get("state") == "sent":
        ops.enter_recovery(op_id, fence)
    attempt_index = max(0, int(prepared.get("attempts") or 1) - 1)
    resume = next_quarantine_at(attempt_index)
    ops.enter_quarantine(op_id, fence, next_attempt_at=resume)
    detail = (
        "ambiguous recovery scan"
        if outcome.kind == RecoveryKind.AMBIGUOUS
        else "issue not found during recovery scan"
    )
    ops.schedule(
        op_id,
        fence,
        next_attempt_at=resume,
        error={"class": "transient", "message": detail, "retryable": True},
        consume_attempt=False,
    )


def _execute_create(conn: Any, op: Mapping[str, Any], ops: OpStore) -> None:
    """Test helper: prepare + I/O + finish while reusing the caller's connection for DB only."""

    prepared = _prepare_execute_create(conn, op, ops)
    if prepared is None or prepared.get("done"):
        return
    conn.commit()
    try:
        result = _run_create_io(prepared)
    except ProviderError as exc:
        apply_provider_error(
            conn,
            ops,
            op=prepared["op"],
            fence=int(prepared["fence"]),
            exc=exc,
            connector_id=str(prepared["connector"]["id"]),
            remote_container_id=str(prepared["destination"].remoteContainerId),
        )
        return
    _finish_create(conn, prepared, result)


def _recover_create(conn: Any, op: Mapping[str, Any], ops: OpStore) -> None:
    """Test helper: recovery prepare + I/O + finish with caller's connection for DB only."""

    prepared = _prepare_recover_create(conn, op, ops)
    if prepared is None or prepared.get("done"):
        return
    conn.commit()
    try:
        result = _run_create_io(prepared)
    except ProviderError as exc:
        apply_provider_error(
            conn,
            ops,
            op=prepared["op"],
            fence=int(prepared["fence"]),
            exc=exc,
            connector_id=str(prepared["connector"]["id"]),
            remote_container_id=str(prepared["destination"].remoteContainerId),
        )
        return
    _finish_create(conn, prepared, result)


__all__ = [
    "execute_claimed_op",
    "github_issue_url",
    "mount_create_executor",
    "set_connect_factory",
    "unmount_create_executor",
]
