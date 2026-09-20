"""Runtime composition for tracker worker and API paths (TR-62, C2/C6/C7).

Wires provider registry, inbound reducer, poll/sweep libraries and outbound
dispatch into one initialization path shared by the API and prism-worker.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Mapping, Optional

from app.services.job_runtime import JobResult
from app.services.trackers.github_recovery import (
    RecoveryKind,
    make_comment_page_fetcher,
    make_issue_page_fetcher,
    recover_op,
    recovery_since,
)
from app.services.trackers.inbound import apply_destination_hints
from app.services.trackers.jobs import DispatchExecutor
from app.services.trackers.op_store import EXECUTE_DISPATCH, RECOVERY_DISPATCH
from app.services.trackers.poller import poll_destination_updates
from app.services.trackers.provider_registry import (
    DestinationContext,
    ProviderRegistry,
    resolve_destination_context,
)
from app.services.trackers.scheduler import mount_hints_applier
from app.services.trackers.sweeper import sweep_destination_links
from app.services.trackers.store import TrackerStore

logger = logging.getLogger(__name__)

_runtime: "TrackerRuntime | None" = None
_outbound_executor: DispatchExecutor | None = None


def has_outbound_executor() -> bool:
    return _outbound_executor is not None or _try_load_tr26_executor() is not None


def mount_outbound_executor(executor: DispatchExecutor | None) -> None:
    """TR-26 registers create/reply executors; enables hint-only dispatch when set."""

    global _outbound_executor
    _outbound_executor = executor
    if executor is not None:
        _patch_hint_dispatch(True)


def _patch_hint_dispatch(enabled: bool) -> None:
    from app.services.trackers import scheduler

    def hint_dispatch_enabled() -> bool:
        return enabled and scheduler.hints_applier_mounted()

    scheduler.hint_dispatch_enabled = hint_dispatch_enabled  # type: ignore[method-assign]


def _try_load_tr26_executor() -> DispatchExecutor | None:
    try:
        from app.services.trackers.create_executor import execute_sync_op
    except ImportError:
        return None
    return execute_sync_op


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
        return JobResult(
            message="Sweep complete" if outcome.complete else "Sweep interrupted",
            details={
                "threadsChecked": outcome.threads_checked,
                "repliesChecked": outcome.replies_checked,
                "repliesTombstoned": outcome.replies_tombstoned,
                "issuesMarkedDeleted": outcome.issues_marked_deleted,
                "issuesMarkedInaccessible": outcome.issues_marked_inaccessible,
                "issuesRecovered": outcome.issues_recovered,
                "complete": outcome.complete,
                "error": outcome.error,
            },
        )

    def dispatch_executor(self, conn: Any, claimed: Mapping[str, Any]) -> str | None:
        executor = _outbound_executor or _try_load_tr26_executor()
        dispatch = str(claimed.get("dispatch") or EXECUTE_DISPATCH)
        if dispatch == EXECUTE_DISPATCH:
            if executor is None:
                return None
            return executor(claimed)
        return self._recover_op(conn, claimed)

    def _recover_op(self, conn: Any, claimed: Mapping[str, Any]) -> str | None:
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
        op_kind = str(claimed.get("op") or "")
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
    """Test helper: drop the singleton runtime."""

    global _runtime, _outbound_executor
    _runtime = None
    _outbound_executor = None
    _patch_hint_dispatch(False)


def initialize_tracker_composition() -> None:
    """Mount inbound applier and optional TR-26 outbound executor at app startup."""

    mount_hints_applier(True)
    executor = _try_load_tr26_executor()
    if executor is not None:
        mount_outbound_executor(executor)
        logger.info("Tracker outbound executor mounted from create_executor (TR-26).")
    else:
        logger.info("Tracker inbound composition mounted; outbound executor awaits TR-26.")
    get_tracker_runtime()


__all__ = [
    "TrackerRuntime",
    "get_tracker_runtime",
    "has_outbound_executor",
    "initialize_tracker_composition",
    "mount_outbound_executor",
    "reset_tracker_runtime",
]
