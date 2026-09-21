"""Runtime composition for tracker worker and API paths (TR-62, C2/C6/C7).

Wires provider registry, inbound reducer, poll/sweep libraries and outbound
dispatch into one initialization path shared by the API and prism-worker.

Outbound ops are routed by an explicit op-kind dispatch table (R3-H1/H2).
There is no create→reply→thread @wraps monkey-patch chain and no import-time
mount from ``comments_store_service``.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Mapping, MutableMapping, Optional

from app.services.job_runtime import JobResult
from app.services.trackers.github_recovery import (
    RecoveryKind,
    make_comment_page_fetcher,
    make_issue_page_fetcher,
    recover_op,
    recovery_since,
)
from app.services.trackers.inbound import apply_destination_hints
from app.services.trackers.op_store import EXECUTE_DISPATCH, OpStore
from app.services.trackers.poller import poll_destination_updates
from app.services.trackers.provider_registry import (
    DestinationContext,
    ProviderRegistry,
    resolve_destination_context,
)
from app.services.trackers.scheduler import mount_hints_applier
from app.services.trackers.sweeper import sweep_destination_links

logger = logging.getLogger(__name__)

DispatchExecutor = Callable[[Mapping[str, Any]], str | None]
RecoverExecutor = Callable[[Any, Mapping[str, Any]], None]

_runtime: "TrackerRuntime | None" = None
_outbound_mounted = False
_EXECUTE_BY_OP: MutableMapping[str, DispatchExecutor] = {}
_RECOVER_BY_OP: MutableMapping[str, RecoverExecutor] = {}


def has_outbound_executor() -> bool:
    return bool(_outbound_mounted)


def execute_outbound_op(claimed: Mapping[str, Any]) -> str | None:
    """Dispatch one claimed outbound op by ``op`` kind via the composition table."""

    op_kind = str(claimed.get("op") or "")
    handler = _EXECUTE_BY_OP.get(op_kind)
    if handler is None:
        return None
    return handler(claimed)


def register_outbound_op(
    op_kind: str,
    *,
    execute: DispatchExecutor,
    recover: RecoverExecutor | None = None,
) -> None:
    """Register (or replace) one op-kind handler in the composition table."""

    _EXECUTE_BY_OP[str(op_kind)] = execute
    if recover is not None:
        _RECOVER_BY_OP[str(op_kind)] = recover


def unregister_outbound_ops(*op_kinds: str) -> None:
    for kind in op_kinds:
        _EXECUTE_BY_OP.pop(str(kind), None)
        _RECOVER_BY_OP.pop(str(kind), None)


def _register_default_outbound_handlers() -> None:
    from app.services.trackers.create_executor import execute_claimed_op
    from app.services.trackers.reply_executor import execute_reply_claimed_op, recover_reply_op
    from app.services.trackers.reply_mutations import REPLY_OPS
    from app.services.trackers.thread_executor import execute_thread_claimed_op, recover_thread_op
    from app.services.trackers.thread_mutations import THREAD_OPS

    register_outbound_op("create_issue", execute=execute_claimed_op)
    register_outbound_op("set_state", execute=execute_claimed_op)
    for kind in REPLY_OPS:
        register_outbound_op(kind, execute=execute_reply_claimed_op, recover=recover_reply_op)
    for kind in THREAD_OPS:
        register_outbound_op(kind, execute=execute_thread_claimed_op, recover=recover_thread_op)


def mount_outbound_executor() -> None:
    """Mark outbound dispatch mounted so ``jobs._executor`` returns the table dispatcher."""

    global _outbound_mounted
    mount_hints_applier(True)
    _outbound_mounted = True


def unmount_outbound_executor() -> None:
    """Test helper: clear the op table and restore pre-mount dispatch wiring."""

    global _outbound_mounted
    _EXECUTE_BY_OP.clear()
    _RECOVER_BY_OP.clear()
    _outbound_mounted = False
    # Keep per-module mount flags consistent after a full teardown.
    try:
        import app.services.trackers.create_executor as create_executor

        create_executor._mounted = False
    except Exception:
        pass
    try:
        import app.services.trackers.reply_executor as reply_executor

        reply_executor._mounted = False
    except Exception:
        pass
    try:
        import app.services.trackers.thread_executor as thread_executor

        thread_executor._mounted = False
    except Exception:
        pass


class TrackerRuntime:
    def __init__(self, registry: ProviderRegistry | None = None) -> None:
        self.registry = registry or ProviderRegistry()

    def destination_context(
        self,
        conn: Any,
        *,
        connector_id: str,
        remote_container_id: str,
    ) -> Optional[DestinationContext]:
        return resolve_destination_context(
            conn,
            connector_id=connector_id,
            remote_container_id=remote_container_id,
        )

    def apply_pending_hints(
        self,
        conn: Any,
        *,
        connector_id: str,
        remote_container_id: str,
    ) -> int:
        ctx = self.destination_context(conn, connector_id=connector_id, remote_container_id=remote_container_id)
        if ctx is None or ctx.paused:
            return 0
        fetcher = self.registry.inbound_fetcher(conn, ctx)
        if fetcher is None:
            return 0
        bundle = self.registry.bundle_for_connector(conn, connector_id)
        if bundle is None:
            return 0
        results = apply_destination_hints(
            conn,
            connector_id=connector_id,
            container_id=remote_container_id,
            fetcher=fetcher,
            bot_user_id=bundle.bot_user_id or None,
            bot_login=bundle.bot_login or None,
        )
        return len(results)

    def run_poll(
        self,
        conn: Any,
        *,
        connector_id: str,
        remote_container_id: str,
    ) -> JobResult:
        ctx = self.destination_context(conn, connector_id=connector_id, remote_container_id=remote_container_id)
        if ctx is None:
            return JobResult(message="Unknown connector")
        if ctx.paused:
            return JobResult(message="Paused connector skipped poll")
        bundle = self.registry.bundle_for_connector(conn, connector_id)
        if bundle is None or not ctx.container_path:
            return JobResult(message="Provider unavailable; poll skipped")
        outcome = poll_destination_updates(
            conn,
            connector_id=connector_id,
            container_id=remote_container_id,
            container_path=ctx.container_path,
            list_updates=bundle.list_updates,
            destination_generation=ctx.destination_generation,
        )
        applied = 0
        if outcome.hints_enqueued > 0:
            applied = self.apply_pending_hints(
                conn,
                connector_id=connector_id,
                remote_container_id=remote_container_id,
            )
        message = "Poll complete" if outcome.complete else "Poll interrupted"
        return JobResult(
            message=message,
            details={
                "hintsEnqueued": outcome.hints_enqueued,
                "hintsDeduplicated": outcome.hints_deduplicated,
                "hintsApplied": applied,
                "pagesFetched": outcome.pages_fetched,
                "complete": outcome.complete,
                "error": outcome.error,
            },
        )

    def run_sweep(
        self,
        conn: Any,
        *,
        connector_id: str,
        remote_container_id: str,
    ) -> JobResult:
        ctx = self.destination_context(conn, connector_id=connector_id, remote_container_id=remote_container_id)
        if ctx is None:
            return JobResult(message="Unknown connector")
        if ctx.paused:
            return JobResult(message="Paused connector skipped sweep")
        bundle = self.registry.bundle_for_connector(conn, connector_id)
        if bundle is None or not ctx.container_path:
            return JobResult(message="Provider unavailable; sweep skipped")
        dest = bundle.destination(ctx)
        outcome = sweep_destination_links(
            conn,
            connector_id=connector_id,
            container_id=remote_container_id,
            container_path=ctx.container_path,
            get_issue=bundle.issue.get_issue,
            list_comments=bundle.comment.list_comments,
            get_comment=bundle.comment.get_comment,
            destination_generation=ctx.destination_generation,
        )
        applied = 0
        if outcome.reply_hints_enqueued > 0:
            applied = self.apply_pending_hints(
                conn,
                connector_id=connector_id,
                remote_container_id=remote_container_id,
            )
        return JobResult(
            message="Sweep complete" if outcome.complete else "Sweep interrupted",
            details={
                "threadsChecked": outcome.threads_checked,
                "repliesChecked": outcome.replies_checked,
                "repliesTombstoned": outcome.replies_tombstoned,
                "replyHintsEnqueued": outcome.reply_hints_enqueued,
                "hintsApplied": applied,
                "issuesMarkedDeleted": outcome.issues_marked_deleted,
                "issuesMarkedInaccessible": outcome.issues_marked_inaccessible,
                "issuesRecovered": outcome.issues_recovered,
                "complete": outcome.complete,
                "error": outcome.error,
            },
        )

    def dispatch_executor(self, conn: Any, claimed: Mapping[str, Any]) -> str | None:
        dispatch = str(claimed.get("dispatch") or EXECUTE_DISPATCH)
        if dispatch == EXECUTE_DISPATCH:
            if not has_outbound_executor():
                return None
            return execute_outbound_op(claimed)
        return self._recover_op(conn, claimed)

    def _recover_op(self, conn: Any, claimed: Mapping[str, Any]) -> str | None:
        op_kind = str(claimed.get("op") or "")
        recoverer = _RECOVER_BY_OP.get(op_kind)
        if recoverer is not None:
            recoverer(conn, claimed)
            return None

        thread_id = str(claimed.get("tracked_thread_id") or "")
        if not thread_id:
            return None
        thread = conn.execute(
            "SELECT * FROM tracked_threads WHERE id = %s",
            (thread_id,),
        ).fetchone()
        if not thread:
            return None
        thread_row = dict(thread)
        connector_id = str(thread_row.get("connector_id") or "")
        container_id = str(thread_row.get("remote_container_id") or "")
        ctx = self.destination_context(conn, connector_id=connector_id, remote_container_id=container_id)
        if ctx is None:
            return None
        bundle = self.registry.bundle_for_connector(conn, connector_id)
        if bundle is None or not ctx.container_path:
            return None
        dest = bundle.destination(ctx)
        comment_id = str(thread_row.get("comment_id") or "")
        reply_id = None
        if op_kind == "add_comment":
            link = conn.execute(
                """
                SELECT reply_id FROM tracked_replies
                WHERE tracked_thread_id = %s
                ORDER BY created_at ASC, id ASC
                LIMIT 1
                """,
                (thread_id,),
            ).fetchone()
            if link:
                reply_id = str(link["reply_id"])
        sent_at = claimed.get("sent_at")
        since = recovery_since(sent_at) if sent_at is not None else None
        issue_fetch = make_issue_page_fetcher(bundle.issue, dest, since=since)
        comment_fetch = None
        if op_kind == "add_comment":
            issue_ref = str(thread_row.get("external_number") or thread_row.get("external_id") or "")
            if issue_ref:
                comment_fetch = make_comment_page_fetcher(bundle.comment, dest, issue_ref)
        outcome = recover_op(
            claimed,
            dest=dest,
            comment_id=comment_id,
            reply_id=reply_id,
            issue_fetch_page=issue_fetch,
            comment_fetch_page=comment_fetch,
            bot_user_id=bundle.bot_user_id,
        )
        if outcome.kind == RecoveryKind.FOUND and outcome.match is not None:
            return str(outcome.match.external_id)
        return None


def get_tracker_runtime() -> TrackerRuntime:
    global _runtime
    if _runtime is None:
        _runtime = TrackerRuntime()
    return _runtime


def reset_tracker_runtime() -> None:
    """Test helper: drop the singleton runtime and unmount outbound dispatch."""

    global _runtime
    unmount_outbound_executor()
    _runtime = None


def initialize_tracker_composition() -> None:
    """Mount poll/sweep runtime and the outbound op-kind dispatch table at startup."""

    mount_hints_applier(True)
    get_tracker_runtime()
    _register_default_outbound_handlers()
    mount_outbound_executor()
    logger.info("Tracker composition mounted (poll/sweep runtime + outbound dispatch table).")


__all__ = [
    "TrackerRuntime",
    "execute_outbound_op",
    "get_tracker_runtime",
    "has_outbound_executor",
    "initialize_tracker_composition",
    "mount_outbound_executor",
    "register_outbound_op",
    "reset_tracker_runtime",
    "unmount_outbound_executor",
    "unregister_outbound_ops",
]
