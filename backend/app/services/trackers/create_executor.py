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
from functools import wraps
from typing import Any, Callable, Iterator, Mapping

from app.core.config import settings
from app.core.roles import Role, normalize_role
from app.services.trackers.contracts import Destination, IssueRead, RemoteIssue
from app.services.trackers.drafts import (
    DraftAttribution,
    DraftRenderInput,
    build_issue_draft,
    render_issue_body_from_draft,
)
from app.services.trackers.errors import ProviderError
from app.services.trackers.github_comments import GitHubCommentAdapter
from app.services.trackers.github_issues import GitHubIssueAdapter
from app.services.trackers.github_recovery import (
    RecoveryKind,
    make_issue_page_fetcher,
    next_quarantine_at,
    recover_create_issue,
    recovery_since,
)
from app.services.trackers.inbound import apply_destination_hints
from app.services.trackers.op_store import EXECUTE_DISPATCH, RECOVERY_DISPATCH, OpStore
from app.services.trackers.promotion import DispatchPause, PublicationDenied, evaluate_dispatch
from app.services.trackers.scheduler import mount_hints_applier
from app.services.trackers.secrets import decrypt_secret

_mounted = False
_connect_factory: Callable[[], Any] | None = None
_original_hint_dispatch: Callable[[], bool] | None = None
_original_executor_resolver: Callable[..., Any] | None = None
_original_retain_hints: Callable[..., Any] | None = None
_original_dispatch_job: Callable[..., Any] | None = None


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
    """Wire dispatch executor, hint apply path and scheduler hint dispatch."""

    global _mounted, _original_hint_dispatch, _original_executor_resolver
    global _original_retain_hints, _original_dispatch_job
    if _mounted:
        return

    import app.services.trackers.jobs as jobs
    import app.services.trackers.scheduler as scheduler

    _original_hint_dispatch = scheduler.hint_dispatch_enabled
    _original_executor_resolver = jobs._executor
    _original_retain_hints = jobs._retain_inbound_hints
    _original_dispatch_job = jobs.run_tracker_dispatch_job

    mount_hints_applier(True)
    scheduler.hint_dispatch_enabled = lambda: True

    def _executor(context):  # noqa: ANN001
        override = context.payload.get("_executor")
        if callable(override):
            return override
        return execute_claimed_op

    def _apply_destination_hints(conn, connector_id: str, container_id: str):  # noqa: ANN001
        from app.services.job_runtime import JobResult, RetryableJobError
        from app.services.trackers.scheduler import OUTBOX_POLL_SECONDS

        if not connector_id or not container_id:
            pending = conn.execute(
                """
                SELECT connector_id, remote_container_id
                FROM remote_hints
                WHERE state = 'pending'
                ORDER BY received_at ASC, id ASC
                LIMIT 1
                """
            ).fetchone()
            if pending:
                connector_id = str(pending["connector_id"])
                container_id = str(pending["remote_container_id"])
        row = conn.execute(
            """
            SELECT 1 FROM remote_hints
            WHERE state = 'pending'
              AND connector_id = %s
              AND remote_container_id = %s
            LIMIT 1
            """,
            (connector_id, container_id),
        ).fetchone()
        if not row:
            raise RetryableJobError(
                "No due tracker operations",
                code="tracker_idle",
                retry_after_seconds=OUTBOX_POLL_SECONDS,
            )
        fetcher = _build_inbound_fetcher(conn, connector_id, container_id)
        apply_destination_hints(
            conn,
            connector_id=connector_id,
            container_id=container_id,
            fetcher=fetcher,
            bot_user_id=fetcher.bot_user_id or None,
            bot_login=fetcher.bot_login or None,
        )
        return JobResult(message="Applied inbound hints")

    @wraps(jobs.run_tracker_dispatch_job)
    def run_tracker_dispatch_job(context):  # noqa: ANN001
        from app.services.trackers.jobs import (
            _comments_connect,
            _connector_paused,
            _prepare_claimed_op,
            _run_executor_outside_txn,
        )

        context.check_cancelled()
        payload = context.payload
        connector_id = str(payload.get("connectorId") or "")
        container_id = str(payload.get("remoteContainerId") or "")
        executor = _executor(context)
        with _comments_connect(context) as conn:
            paused = _connector_paused(conn, connector_id)
            ops = OpStore(conn)
            claimed = ops.claim(context.worker_id, lease_seconds=60)
            if claimed is None:
                result = _apply_destination_hints(conn, connector_id, container_id)
                conn.commit()
                return result
            prepared = _prepare_claimed_op(
                ops, claimed, paused=paused, has_executor=executor is not None
            )
            conn.commit()
        if not prepared["run_io"]:
            return prepared["result"]
        return _run_executor_outside_txn(context, prepared["claimed"], executor)

    jobs._executor = _executor
    jobs.run_tracker_dispatch_job = run_tracker_dispatch_job
    _mounted = True


def unmount_create_executor() -> None:
    """Test helper: restore pre-TR-26 dispatch wiring."""

    global _mounted, _original_hint_dispatch, _original_executor_resolver
    global _original_retain_hints, _original_dispatch_job
    if not _mounted:
        return
    import app.services.trackers.jobs as jobs
    import app.services.trackers.scheduler as scheduler

    if _original_hint_dispatch is not None:
        scheduler.hint_dispatch_enabled = _original_hint_dispatch
    if _original_executor_resolver is not None:
        jobs._executor = _original_executor_resolver
    if _original_dispatch_job is not None:
        jobs.run_tracker_dispatch_job = _original_dispatch_job
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
    """Dispatch one claimed outbound op. Confirms in-DB when complete."""

    dispatch = str(claimed.get("dispatch") or EXECUTE_DISPATCH)
    op_kind = str(claimed.get("op") or "")
    with _default_connect() as conn:
        ops = OpStore(conn)
        op_id = str(claimed["id"])
        fence = int(claimed["fence"])
        fresh = ops.get(op_id)
        if str(fresh.get("state") or "") == "confirmed":
            conn.commit()
            return None
        if dispatch == RECOVERY_DISPATCH:
            if op_kind == "set_state":
                from app.services.trackers.state_executor import execute_set_state_op

                execute_set_state_op(fresh, conn)
            else:
                _recover_create(conn, fresh, ops)
        elif op_kind == "set_state":
            from app.services.trackers.state_executor import execute_set_state_op

            execute_set_state_op(fresh, conn)
        else:
            _execute_create(conn, fresh, ops)
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
    comment = _comment_dict_from_row(comment_row)
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
            "commit": row.get("anchor_commit"),
            "projectFile": row.get("anchor_source"),
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


def _encrypt_context(connector_id: str) -> bytes:
    return f"tracker:connector:{connector_id}".encode()


def _issue_adapter(connector: Mapping[str, Any], *, http: Any | None = None) -> GitHubIssueAdapter:
    from app.services.trackers.github_auth import GitHubAppAuth, GitHubAppCredentials

    blob = connector.get("credential_envelope")
    if not blob:
        raise ProviderError("auth_lost", "Connector has no installation credentials.")
    material = json.loads(
        decrypt_secret(blob, _encrypt_context(str(connector["id"])), settings=settings).decode()
    )
    creds = GitHubAppCredentials(
        app_id=str(material.get("appId") or material.get("app_id") or ""),
        installation_id=str(material.get("installationId") or material.get("installation_id") or ""),
        private_key_pem=str(material.get("privateKey") or material.get("private_key") or ""),
        instance_kind=str(connector.get("instance_kind") or "github.com"),
        base_url=str(connector.get("base_url") or ""),
    )
    auth = GitHubAppAuth(creds, http=http) if http is not None else GitHubAppAuth(creds)
    return GitHubIssueAdapter(
        auth,
        http=auth.http,
        bot_user_id=str(connector.get("bot_forge_user_id") or ""),
        bot_login=str(connector.get("bot_login") or ""),
    )


class _ConnectorInboundFetcher:
    def __init__(self, conn: Any, connector_id: str, container_id: str) -> None:
        row = conn.execute(
            """
            SELECT tc.*, pt.container_path
            FROM tracker_connectors tc
            JOIN project_trackers pt ON pt.connector_id = tc.id
            WHERE tc.id = %s AND pt.remote_container_id = %s
            LIMIT 1
            """,
            (connector_id, container_id),
        ).fetchone()
        if row is None:
            raise ProviderError("invalid_request", "connector destination not found for inbound fetch")
        self.bot_user_id = str(row.get("bot_forge_user_id") or "")
        self.bot_login = str(row.get("bot_login") or "")
        self._connector = dict(row)
        self._container_id = container_id
        self._issue_adapter = _issue_adapter(self._connector)
        self._comment_adapter = GitHubCommentAdapter(
            self._issue_adapter.auth,
            http=self._issue_adapter.http,
            bot_user_id=self.bot_user_id,
            bot_login=self.bot_login,
        )

    def _destination(self) -> Destination:
        return Destination(
            connectorId=str(self._connector["id"]),
            containerKind="repo",
            containerPath=str(self._connector.get("container_path") or ""),
            remoteContainerId=self._container_id,
            generation=1,
        )

    def fetch_issue(self, connector_id: str, container_id: str, external_id: str) -> IssueRead:
        return self._issue_adapter.get_issue(self._destination(), external_id, etag=None)

    def fetch_comment(self, connector_id: str, container_id: str, external_comment_id: str) -> IssueRead:
        return self._comment_adapter.get_comment(self._destination(), external_comment_id, etag=None)


def _build_inbound_fetcher(conn: Any, connector_id: str, container_id: str) -> _ConnectorInboundFetcher:
    return _ConnectorInboundFetcher(conn, connector_id, container_id)


def _actor_role(_conn: Any, _actor_user_id: str | None) -> Role:
    return normalize_role("designer") or "designer"  # type: ignore[return-value]


def _workspace_schema(conn: Any) -> str:
    row = conn.execute("SHOW search_path").fetchone()
    first = str(row["search_path"]).split(",")[0].strip().strip('"')
    if first and first not in {"$user", "public"}:
        return first
    return "workspace"


def _policy_check(conn: Any, ctx: _ExecutionContext) -> None:
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
            last_verified_at = NOW()
        WHERE id = %s
        """,
        (
            external_id,
            str(number) if number is not None else None,
            url,
            issue.state,
            json.dumps(dict(issue.version.model_dump())),
            str(thread["id"]),
        ),
    )
    ops.confirm(op_id, fence, external_result_id=external_id)


def _execute_create(conn: Any, op: Mapping[str, Any], ops: OpStore) -> None:
    ctx = _load_execution_context(conn, op)
    op_id = str(op["id"])
    fence = int(op["fence"])
    external_id = str(ctx.thread.get("external_id") or "")
    if external_id not in ("", "pending"):
        if str(op.get("state") or "") != "confirmed":
            ops.confirm(op_id, fence, external_result_id=external_id)
        return
    try:
        _policy_check(conn, ctx)
        adapter = _issue_adapter(ctx.connector)
        draft = _build_draft(ctx)
        rendered_body = render_issue_body_from_draft(draft)
        outbound = draft.model_copy(update={"proseBlock": rendered_body, "marker": ""})
        issue = adapter.create_issue(ctx.destination, outbound, op_id)
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
    _confirm_create_link(
        conn,
        ops,
        thread=ctx.thread,
        issue=issue,
        op_id=op_id,
        fence=fence,
        container_path=str(ctx.policy.get("container_path") or ""),
    )


def _recover_create(conn: Any, op: Mapping[str, Any], ops: OpStore) -> None:
    ctx = _load_execution_context(conn, op)
    op_id = str(op["id"])
    fence = int(op["fence"])
    external_id = str(ctx.thread.get("external_id") or "")
    if external_id not in ("", "pending") and str(op.get("state") or "") != "confirmed":
        ops.confirm(op_id, fence, external_result_id=external_id)
        return
    adapter = _issue_adapter(ctx.connector)
    sent_at = op.get("sent_at")
    if isinstance(sent_at, datetime) and sent_at.tzinfo is None:
        sent_at = sent_at.replace(tzinfo=timezone.utc)
    outcome = recover_create_issue(
        op,
        dest=ctx.destination,
        comment_id=str(ctx.thread["comment_id"]),
        fetch_page=make_issue_page_fetcher(
            adapter,
            ctx.destination,
            since=recovery_since(sent_at if isinstance(sent_at, datetime) else None),
        ),
        bot_user_id=str(ctx.connector.get("bot_forge_user_id") or ""),
    )
    if outcome.kind == RecoveryKind.FOUND and outcome.match is not None:
        issue = adapter.get_issue(
            ctx.destination,
            str(outcome.match.number or outcome.match.external_id),
            etag=None,
        )
        if isinstance(issue, RemoteIssue):
            _confirm_create_link(
                conn,
                ops,
                thread=ctx.thread,
                issue=issue,
                op_id=op_id,
                fence=fence,
                container_path=str(ctx.policy.get("container_path") or ""),
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
    if str(op.get("state") or "") == "sent":
        ops.enter_recovery(op_id, fence)
    attempt_index = max(0, int(op.get("attempts") or 1) - 1)
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


__all__ = [
    "execute_claimed_op",
    "github_issue_url",
    "mount_create_executor",
    "set_connect_factory",
    "unmount_create_executor",
]
