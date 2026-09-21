"""Shared adversarial forge + disposable Postgres schema for TR-45 (F5–F8)."""

from __future__ import annotations

import json
import os
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterator, Mapping, Optional, Sequence
from unittest.mock import patch
from urllib.parse import urlsplit

from app.services import comments_schema_migrations
from app.services.trackers.capabilities import ProviderCapabilities
from app.services.trackers.contracts import (
    Container,
    Destination,
    ForbiddenRead,
    ForgeUser,
    GoneConfirmed,
    IssueContainerRef,
    NotModified,
    PageCursor,
    RemoteChange,
    RemoteComment,
    RemoteEvent,
    RemoteIssue,
    RemoteVersion,
    UncertainAbsence,
    UpdateCursor,
)
from app.services.trackers.create_executor import (
    github_issue_url,
    mount_create_executor,
    set_connect_factory as set_create_connect_factory,
    unmount_create_executor,
)
from app.services.trackers.errors import ProviderError
from app.services.trackers.inbox_store import apply_schema as apply_inbox_schema
from app.services.trackers.migrations import migrate_workspace_tracker_tables
from app.services.trackers.op_store import apply_schema as apply_op_schema
from app.services.trackers.reply_executor import (
    github_comment_url,
    mount_reply_executor,
    set_connect_factory as set_reply_connect_factory,
    unmount_reply_executor,
)
from app.services.trackers.thread_executor import (
    mount_thread_executor,
    set_connect_factory as set_thread_connect_factory,
    unmount_thread_executor,
)

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]

DOCS = Path(__file__).resolve().parents[2] / "docs" / "tracker-integration"
FIXTURE_SETS = ("F05", "F06", "F07", "F08")

CONNECTOR = "cn_gh1"
CONTAINER = "987654321"
REPO = "acme/openswitch"
BOT_ID = "199001"
BOT_LOGIN = "prism[bot]"
HUMAN_ID = "5550001"
HUMAN_LOGIN = "arjun-gh"
ISSUE_ID = "198400412"
ISSUE_NUMBER = 412
COMMENT_ID = "c_8f3a1b2c"
THREAD_ID = "tt_a"
REPLY_ID = "r_91a4c0de"
EXT_COMMENT = "2211003"
COMMIT = "3f2c9a1b7e4d5c6a8b9f0e1d2c3b4a5968778695"
PROJECT_ID = "prj_a"
PT_ID = "pt_a"

POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
APPLICATION_POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()


def _identity(url: str):
    parsed = urlsplit(url)
    return (parsed.username or "", (parsed.hostname or "").lower(), parsed.port, parsed.path.lstrip("/"))


SHARED_APPLICATION_DATABASE = bool(
    POSTGRES_URL
    and APPLICATION_POSTGRES_URL
    and _identity(POSTGRES_URL) == _identity(APPLICATION_POSTGRES_URL)
)


def require_test_postgres() -> None:
    if not POSTGRES_URL:
        raise RuntimeError("TEST_POSTGRES_URL is required for tracker adversarial tests")
    if SHARED_APPLICATION_DATABASE:
        raise RuntimeError("TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
    if psycopg is None:
        raise RuntimeError("psycopg is required for tracker adversarial tests")


def dsn() -> str:
    require_test_postgres()
    return POSTGRES_URL.replace("postgresql+psycopg://", "postgresql://", 1)


def load_fixture_cases(set_name: str) -> list[dict]:
    path = DOCS / "fixtures" / f"{set_name}.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    return list(payload["cases"])


def all_fixture_case_ids() -> list[str]:
    ids: list[str] = []
    for name in FIXTURE_SETS:
        ids.extend(case["id"] for case in load_fixture_cases(name))
    return ids


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _bot() -> ForgeUser:
    return ForgeUser(id=BOT_ID, login=BOT_LOGIN, isBot=True)


def _human() -> ForgeUser:
    return ForgeUser(id=HUMAN_ID, login=HUMAN_LOGIN, isBot=False)


COMMENTS_FOUNDATION_DDL = """
CREATE TABLE comments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    author_kind TEXT NOT NULL DEFAULT 'user',
    author_user_id TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'OPEN',
    context TEXT NOT NULL DEFAULT 'PCB',
    location_x REAL NOT NULL DEFAULT 0,
    location_y REAL NOT NULL DEFAULT 0,
    location_layer TEXT NOT NULL DEFAULT '',
    location_page TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    comment_class TEXT NOT NULL DEFAULT 'general',
    severity TEXT NOT NULL DEFAULT 'info',
    scope TEXT NOT NULL DEFAULT 'canvas',
    anchor_commit TEXT,
    anchor_state TEXT NOT NULL DEFAULT 'pinned',
    anchor_source TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE comment_replies (
    id TEXT PRIMARY KEY,
    comment_id TEXT NOT NULL REFERENCES comments(id),
    project_id TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    author_kind TEXT NOT NULL DEFAULT 'user',
    author_user_id TEXT,
    origin TEXT NOT NULL DEFAULT 'prism',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    content TEXT NOT NULL DEFAULT '',
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sync_state TEXT,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT
);
"""


def bootstrap_tracker_schema(conn: Any) -> None:
    conn.execute(COMMENTS_FOUNDATION_DDL, prepare=False)
    comments_schema_migrations.apply_comments_migrations(conn)
    migrate_workspace_tracker_tables(conn)
    apply_op_schema(conn)
    apply_inbox_schema(conn)


class DisposableSchema:
    """Unique search_path schema + connect factory for concurrent workers."""

    def __init__(self, prefix: str = "tr45") -> None:
        require_test_postgres()
        self.schema = f"{prefix}_{uuid.uuid4().hex[:12]}"
        self.conn = psycopg.connect(dsn(), row_factory=dict_row)
        self.conn.execute(f'CREATE SCHEMA "{self.schema}"')
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        bootstrap_tracker_schema(self.conn)
        self.conn.commit()

    def connect(self):
        conn = psycopg.connect(dsn(), row_factory=dict_row)
        conn.execute(f'SET search_path TO "{self.schema}", public')
        return conn

    @contextmanager
    def factory(self) -> Iterator[Any]:
        conn = self.connect()
        try:
            yield conn
        finally:
            conn.close()

    def drop(self) -> None:
        try:
            try:
                self.conn.rollback()
            except Exception:
                pass
            try:
                self.conn.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
                self.conn.commit()
            except Exception:
                try:
                    fresh = psycopg.connect(dsn(), row_factory=dict_row)
                    try:
                        fresh.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
                        fresh.commit()
                    finally:
                        fresh.close()
                except Exception:
                    pass
        finally:
            try:
                self.conn.close()
            except Exception:
                pass


class FakeJobs:
    def __init__(self) -> None:
        self.rows: list[dict] = []

    def enqueue(self, kind, payload=None, **kwargs):  # noqa: ANN001
        job = {
            "kind": kind,
            "payload": dict(payload or {}),
            "artifact_key": kwargs.get("artifact_key"),
            "deduplicated": False,
        }
        self.rows.append(job)
        return job


class FakeContext:
    def __init__(self, payload: dict, worker_id: str = "w1") -> None:
        self.payload = payload
        self.worker_id = worker_id
        self.job_id = "job-1"
        self.fence = 1

    def check_cancelled(self) -> None:
        return None


class StatefulFakeForge:
    """Mutable IssueTracker-ish provider with fault injection and JSON traces."""

    kind = "fake"

    def __init__(self, traces: list[dict] | None = None) -> None:
        self.traces: list[dict] = traces if traces is not None else []
        self.issues: dict[str, RemoteIssue] = {}
        self.comments: dict[str, RemoteComment] = {}
        self.comments_by_issue: dict[str, list[str]] = {}
        self.events: dict[str, list[RemoteEvent]] = {}
        self.containers: dict[str, Container] = {
            CONTAINER: Container(remoteContainerId=CONTAINER, path=REPO, visibility="private")
        }
        self._next_issue_id = 198400412
        self._next_issue_number = 412
        self._next_comment_id = 2211003
        self._next_event_id = 1
        self.has_state_events = True
        self.timeout_on_create = False
        self.delay_accept_until_scan_n = 0
        self._pending_creates: dict[str, dict[str, Any]] = {}
        self._scan_count = 0
        self.mid_page_502 = False
        self._page_fault_armed = False
        self.force_statuses: dict[str, Any] = {}
        self.visibility: dict[str, str] = {CONTAINER: "private"}
        self.dropped_labels: set[str] = set()
        self.update_pages: list[tuple[list[RemoteChange], UpdateCursor]] = []
        self.update_calls: list[UpdateCursor] = []
        self.deliveries: list[dict[str, Any]] = []
        self.set_state_calls: list[str] = []
        self.create_calls: list[str] = []
        self.comment_calls: list[str] = []
        self.throttled_until: str | None = None
        self.auth_lost = False
        self.list_issues_pages: list[tuple[list[dict], Optional[str]]] | None = None
        self._list_issues_call = 0
        self.closed_as_duplicate: list[str] = []

    def trace(self, action: str, **detail: Any) -> None:
        entry = {"action": action, "at": _now_iso(), **detail}
        self.traces.append(entry)

    def reset_faults(self) -> None:
        self.timeout_on_create = False
        self.delay_accept_until_scan_n = 0
        self.mid_page_502 = False
        self._page_fault_armed = False
        self.auth_lost = False
        self.throttled_until = None
        self.force_statuses.clear()
        self.dropped_labels.clear()
        self.update_pages.clear()
        self.update_calls.clear()
        self.list_issues_pages = None
        self._list_issues_call = 0
        self._scan_count = 0
        self._pending_creates.clear()

    # --- fault controls -------------------------------------------------

    def force_status(self, ext_id: str, status: int, *, retry_after: bool = False) -> None:
        self.force_statuses[str(ext_id)] = {"status": status, "retry_after": retry_after}
        self.trace("force_status", extId=str(ext_id), status=status, retryAfter=retry_after)

    def set_visibility(self, container_id: str, visibility: str) -> None:
        self.visibility[container_id] = visibility
        if container_id in self.containers:
            self.containers[container_id] = self.containers[container_id].model_copy(
                update={"visibility": visibility}  # type: ignore[arg-type]
            )
        self.trace("set_visibility", containerId=container_id, visibility=visibility)

    def transfer(self, ext_id: str, *, new_container_id: str, new_path: str, new_external_id: str | None = None) -> RemoteIssue:
        issue = self._require_issue(ext_id)
        new_id = new_external_id or str(int(issue.externalId) + 1000)
        new_number = (issue.number or 0) + 100
        moved = issue.model_copy(
            update={
                "externalId": new_id,
                "number": new_number,
                "url": github_issue_url(new_path, new_number),
                "container": IssueContainerRef(remoteContainerId=new_container_id, path=new_path),
            }
        )
        self._forget_issue(issue)
        self._store_issue(moved)
        if new_container_id not in self.containers:
            self.containers[new_container_id] = Container(
                remoteContainerId=new_container_id,
                path=new_path,
                visibility="private",
            )
        self.trace(
            "transfer",
            fromExt=str(ext_id),
            toExt=new_id,
            containerId=new_container_id,
            path=new_path,
        )
        return moved

    def reorder_deliveries(self, order: Sequence[str]) -> None:
        by_id = {str(item.get("delivery_id") or item.get("id")): item for item in self.deliveries}
        self.deliveries = [by_id[key] for key in order if key in by_id]
        self.trace("reorder_deliveries", order=list(order))

    def drop_labels(self, ext_id: str) -> None:
        key = str(ext_id)
        self.dropped_labels.add(key)
        issue = self._lookup_issue(key)
        if issue is not None:
            cleaned = issue.model_copy(update={"labels": []})
            self._store_issue(cleaned)
        self.trace("drop_labels", extId=key)

    def queue_update_pages(self, pages: list[tuple[list[RemoteChange], UpdateCursor]]) -> None:
        self.update_pages = list(pages)
        self.trace("queue_update_pages", pages=len(pages))

    def enqueue_delivery(self, delivery: Mapping[str, Any]) -> None:
        self.deliveries.append(dict(delivery))
        self.trace("enqueue_delivery", deliveryId=delivery.get("delivery_id") or delivery.get("id"))

    def materialize_pending_creates(self) -> None:
        for op_id, pending in list(self._pending_creates.items()):
            issue = self._materialize_create(
                pending["dest"],
                pending["draft"],
                op_id,
                body=pending.get("body"),
            )
            self.trace("delayed_accept", opId=op_id, externalId=issue.externalId, number=issue.number)
        self._pending_creates.clear()

    def close_as_duplicate(self, ext_id: str, *, canonical_ext_id: str) -> None:
        note = f"Duplicate of #{canonical_ext_id}; closed by bot"
        issue = self.set_state(None, ext_id, "closed", note)  # type: ignore[arg-type]
        self.closed_as_duplicate.append(str(ext_id))
        self.add_comment(None, str(issue.number or ext_id), note, op_id=f"dup_{ext_id}")  # type: ignore[arg-type]
        self.trace("close_as_duplicate", extId=str(ext_id), canonical=canonical_ext_id)

    # --- IssueTracker methods -------------------------------------------

    def capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            provider="github",
            canEditOwnComment=True,
            canDeleteOwnComment=True,
            canEditIssueBody=True,
            hasStateEvents=self.has_state_events,
            hasTransferEvents=True,
            supportsConditionalGet=True,
            maxAssignees=10,
            apiVersion="2022-11-28",
            instanceKind="github.com",
        )

    def get_container(self, dest: Destination) -> Container:
        container = self.containers.get(dest.remoteContainerId)
        if container is None:
            raise ProviderError("not_found_uncertain", "container missing", status=404)
        visibility = self.visibility.get(dest.remoteContainerId, container.visibility)
        return container.model_copy(update={"visibility": visibility})  # type: ignore[arg-type]

    def create_issue(self, dest: Destination, draft: Any, op_id: str) -> RemoteIssue:
        self.create_calls.append(str(op_id))
        body = getattr(draft, "proseBlock", None) or getattr(draft, "body", None) or ""
        marker = getattr(draft, "marker", None) or ""
        full_body = f"{body}\n\n{marker}".strip() if marker else str(body)
        self.trace("create_issue", opId=str(op_id), bodyLen=len(full_body))
        if self.timeout_on_create:
            self._pending_creates[str(op_id)] = {
                "dest": dest,
                "draft": draft,
                "body": full_body,
            }
            raise ProviderError("transient", "request timed out", status=504, retryable=True)
        return self._materialize_create(dest, draft, op_id, body=full_body)

    def find_by_marker(self, dest: Destination, marker: str, since: Optional[str] = None) -> Optional[RemoteIssue]:
        del since
        for issue in self.issues.values():
            if issue.container.remoteContainerId != dest.remoteContainerId:
                continue
            if marker in (issue.body or ""):
                return issue
        return None

    def get_issue(self, dest: Destination, ext_id: str, etag: Optional[str] = None):  # noqa: ANN001
        del dest
        key = str(ext_id)
        forced = self.force_statuses.get(key)
        if forced is None and self.auth_lost:
            raise ProviderError("auth_lost", "installation revoked", status=401)
        if forced is not None:
            return self._read_outcome(forced)
        if self.throttled_until:
            raise ProviderError(
                "rate_limited",
                "secondary rate limit",
                status=403,
                resume_at=self.throttled_until,
                retryable=True,
            )
        issue = self._lookup_issue(key)
        if issue is None:
            return UncertainAbsence(status=404)
        if etag and issue.version.etag and etag == issue.version.etag:
            return NotModified(etag=etag)
        self.trace("get_issue", extId=key, state=issue.state)
        return issue

    def update_issue(self, dest: Destination, ext_id: str, patch: Any) -> RemoteIssue:
        issue = self._require_issue(ext_id)
        updates: dict[str, Any] = {
            "version": RemoteVersion(updatedAt=_now_iso(), etag=f"W/{uuid.uuid4().hex[:6]}"),
        }
        if getattr(patch, "title", None) is not None:
            updates["title"] = patch.title
        if getattr(patch, "body", None) is not None:
            updates["body"] = patch.body
        if getattr(patch, "proseBlock", None) is not None:
            updates["body"] = patch.proseBlock
        if getattr(patch, "labels", None) is not None:
            updates["labels"] = list(patch.labels)
        if getattr(patch, "assignees", None) is not None:
            updates["assignees"] = list(patch.assignees)
        updated = issue.model_copy(update=updates)
        self._store_issue(updated)
        self.trace("update_issue", extId=str(ext_id))
        return updated

    def set_state(self, dest: Destination, ext_id: str, state: str, note: str) -> RemoteIssue:
        del dest, note
        self.set_state_calls.append(state)
        current = self._require_issue(ext_id)
        next_version = RemoteVersion(
            updatedAt=f"2026-09-20T16:0{len(self.set_state_calls)}:00Z",
            etag=f"W/{len(self.set_state_calls)}",
        )
        updated = current.model_copy(update={"state": state, "version": next_version})
        self._store_issue(updated)
        event = RemoteEvent(
            externalId=str(updated.number or updated.externalId),
            eventId=f"e{self._next_event_id}",
            event="closed" if state == "closed" else "reopened",
            createdAt=next_version.updatedAt or _now_iso(),
            actor=_bot(),
        )
        self._next_event_id += 1
        key = str(updated.number or updated.externalId)
        self.events.setdefault(key, []).append(event)
        self.trace("set_state", extId=str(ext_id), state=state)
        return updated

    def add_comment(
        self,
        dest: Destination,
        ext_id: str,
        body: str,
        op_id: str,
        *,
        issue_id: str | None = None,
    ) -> RemoteComment:
        del issue_id
        issue = self._require_issue(ext_id)
        cid = str(self._next_comment_id)
        self._next_comment_id += 1
        comment = RemoteComment(
            externalCommentId=cid,
            externalId=issue.externalId,
            externalNumber=issue.number,
            url=github_comment_url(
                issue.container.path,
                int(issue.number or 0),
                cid,
            ),
            body=body,
            author=_bot(),
            version=RemoteVersion(updatedAt=_now_iso()),
            createdAt=_now_iso(),
        )
        self.comments[cid] = comment
        issue_key = str(issue.number or issue.externalId)
        self.comments_by_issue.setdefault(issue_key, []).append(cid)
        self.comments_by_issue.setdefault(str(issue.externalId), []).append(cid)
        self.comment_calls.append(str(op_id))
        self.trace("add_comment", opId=str(op_id), commentId=cid, issue=issue_key)
        return comment

    def edit_comment(self, dest: Destination, ext_cid: str, body: str) -> RemoteComment:
        del dest
        comment = self.comments.get(str(ext_cid))
        if comment is None:
            raise ProviderError("not_found_uncertain", "comment missing", status=404)
        updated = comment.model_copy(
            update={"body": body, "version": RemoteVersion(updatedAt=_now_iso())}
        )
        self.comments[str(ext_cid)] = updated
        self.trace("edit_comment", commentId=str(ext_cid))
        return updated

    def delete_comment(self, dest: Destination, ext_cid: str) -> None:
        del dest
        cid = str(ext_cid)
        self.comments.pop(cid, None)
        for issue_key, ids in list(self.comments_by_issue.items()):
            self.comments_by_issue[issue_key] = [item for item in ids if item != cid]
        self.trace("delete_comment", commentId=cid)

    def get_comment(self, dest: Destination, ext_cid: str, etag: Optional[str] = None):  # noqa: ANN001
        del dest
        key = str(ext_cid)
        forced = self.force_statuses.get(key)
        if forced is not None:
            return self._read_outcome(forced)
        comment = self.comments.get(key)
        if comment is None:
            return GoneConfirmed()
        if etag and comment.version.etag and etag == comment.version.etag:
            return NotModified(etag=etag)
        return comment

    def list_comments(
        self,
        dest: Destination,
        issue: str,
        cursor: Optional[PageCursor] = None,
        *,
        issue_id: str | None = None,
    ) -> tuple[list[RemoteComment], Optional[PageCursor]]:
        del dest, issue_id
        if self.mid_page_502 and cursor is not None and not cursor.exhausted:
            self.trace("list_comments_502", issue=str(issue))
            raise ProviderError("transient", "mid-page 502", status=502, retryable=True)
        ids = list(self.comments_by_issue.get(str(issue), []))
        comments = [self.comments[cid] for cid in ids if cid in self.comments]
        self.trace("list_comments", issue=str(issue), count=len(comments))
        return comments, PageCursor(value="", exhausted=True)

    def find_comment_by_marker(
        self,
        dest: Destination,
        issue: str,
        marker: str,
        *,
        issue_id: str | None = None,
    ) -> Optional[RemoteComment]:
        del issue_id
        comments, _ = self.list_comments(dest, issue, None)
        for comment in comments:
            if marker not in (comment.body or ""):
                continue
            if comment.author.id == BOT_ID or comment.author.login == BOT_LOGIN:
                return comment
        return None

    def list_updates(
        self, dest: Destination, since_cursor: UpdateCursor
    ) -> tuple[list[RemoteChange], UpdateCursor]:
        del dest
        self.update_calls.append(since_cursor)
        if self.mid_page_502 and since_cursor.page:
            self.trace("list_updates_502", page=since_cursor.page)
            raise ProviderError("transient", "page 2 failed", status=502, retryable=True)
        if not self.update_pages:
            empty = UpdateCursor(since=since_cursor.since, page=None)
            self.trace("list_updates", changes=0)
            return [], empty
        page, nxt = self.update_pages.pop(0)
        self.trace("list_updates", changes=len(page), nextPage=nxt.page)
        return page, nxt

    def list_events(self, dest: Destination, ext_id: str) -> Sequence[RemoteEvent]:
        del dest
        key = str(ext_id)
        events = list(self.events.get(key, []))
        # Also accept ISSUE_NUMBER / ISSUE_ID aliases.
        if not events:
            issue = self._lookup_issue(key)
            if issue is not None:
                events = list(self.events.get(str(issue.number or ""), []))
                if not events:
                    events = list(self.events.get(str(issue.externalId), []))
        self.trace("list_events", extId=key, count=len(events))
        return events

    def ensure_labels(self, dest: Destination, labels: Sequence[str]) -> None:
        del dest
        self.trace("ensure_labels", labels=list(labels))

    def can_assign(self, dest: Destination, forge_login: str) -> bool:
        del dest
        return bool(forge_login)

    # --- recovery page fetchers -----------------------------------------

    def issue_page_fetcher(
        self, dest: Destination, *, since: str | None = None
    ) -> Callable[[Optional[str]], tuple[list[dict], Optional[str]]]:
        del since

        def fetch(cursor: Optional[str]) -> tuple[list[dict], Optional[str]]:
            self._scan_count += 1
            self.trace("issue_page_scan", scan=self._scan_count, cursor=cursor)
            if self.delay_accept_until_scan_n and self._scan_count >= self.delay_accept_until_scan_n:
                self.materialize_pending_creates()
            if self.list_issues_pages is not None:
                if self._list_issues_call >= len(self.list_issues_pages):
                    return [], None
                page = self.list_issues_pages[self._list_issues_call]
                self._list_issues_call += 1
                if self.mid_page_502 and page[1] is not None and self._list_issues_call == 1:
                    # First page ok; next call raises.
                    self._page_fault_armed = True
                    return page
                if self._page_fault_armed:
                    self._page_fault_armed = False
                    raise ProviderError("transient", "mid-page 502", status=502, retryable=True)
                return page
            if self.mid_page_502 and cursor is not None:
                raise ProviderError("transient", "mid-page 502", status=502, retryable=True)
            items: list[dict] = []
            for issue in self._unique_issues():
                if issue.container.remoteContainerId != dest.remoteContainerId:
                    continue
                if issue.author.id != BOT_ID:
                    continue
                labels = [] if str(issue.externalId) in self.dropped_labels or str(issue.number) in self.dropped_labels else list(issue.labels)
                items.append(
                    {
                        "id": int(issue.externalId),
                        "number": issue.number,
                        "body": issue.body,
                        "html_url": issue.url,
                        "labels": [{"name": name} for name in labels],
                        "user": {"id": int(BOT_ID), "login": BOT_LOGIN},
                    }
                )
            if self.mid_page_502 and cursor is None and items:
                # Simulate multi-page: first page returns a next cursor.
                return items[:1], "page-2"
            return items, None

        return fetch

    def comment_page_fetcher(
        self, dest: Destination, issue: str
    ) -> Callable[[Optional[str]], tuple[list[RemoteComment], Optional[str]]]:
        def fetch(cursor: Optional[str]) -> tuple[list[RemoteComment], Optional[str]]:
            self.trace("comment_page_scan", issue=str(issue), cursor=cursor)
            if self.mid_page_502 and cursor is not None:
                raise ProviderError("transient", "mid-page 502", status=502, retryable=True)
            comments, _ = self.list_comments(dest, issue, None)
            if self.mid_page_502 and cursor is None and comments:
                return comments[:1], "page-2"
            return list(comments), None

        return fetch

    def seed_issue(
        self,
        *,
        external_id: str = ISSUE_ID,
        number: int = ISSUE_NUMBER,
        body: str = "body",
        state: str = "open",
        labels: Sequence[str] | None = None,
        updated_at: str = "2026-09-20T15:42:11Z",
        etag: str = "W/1",
        container_id: str = CONTAINER,
        path: str = REPO,
        author: ForgeUser | None = None,
    ) -> RemoteIssue:
        issue = RemoteIssue(
            externalId=str(external_id),
            url=github_issue_url(path, number),
            number=number,
            title="[MAJOR] adversarial",
            body=body,
            state=state,  # type: ignore[arg-type]
            labels=list(labels) if labels is not None else ["prism"],
            assignees=[],
            author=author or _bot(),
            version=RemoteVersion(updatedAt=updated_at, etag=etag),
            container=IssueContainerRef(remoteContainerId=container_id, path=path),
        )
        self._store_issue(issue)
        self._next_issue_id = max(self._next_issue_id, int(external_id) + 1)
        self._next_issue_number = max(self._next_issue_number, number + 1)
        self.trace("seed_issue", externalId=str(external_id), number=number)
        return issue

    def seed_comment(
        self,
        *,
        external_comment_id: str = EXT_COMMENT,
        issue_external_id: str = ISSUE_ID,
        issue_number: int = ISSUE_NUMBER,
        body: str = "comment",
        path: str = REPO,
    ) -> RemoteComment:
        comment = RemoteComment(
            externalCommentId=str(external_comment_id),
            externalId=str(issue_external_id),
            externalNumber=issue_number,
            url=github_comment_url(path, issue_number, external_comment_id),
            body=body,
            author=_bot(),
            version=RemoteVersion(updatedAt=_now_iso()),
            createdAt=_now_iso(),
        )
        self.comments[str(external_comment_id)] = comment
        self.comments_by_issue.setdefault(str(issue_number), []).append(str(external_comment_id))
        self.comments_by_issue.setdefault(str(issue_external_id), []).append(str(external_comment_id))
        self._next_comment_id = max(self._next_comment_id, int(external_comment_id) + 1)
        self.trace("seed_comment", commentId=str(external_comment_id))
        return comment

    def set_events(self, ext_id: str, events: Sequence[RemoteEvent]) -> None:
        self.events[str(ext_id)] = list(events)
        self.trace("set_events", extId=str(ext_id), count=len(events))

    # --- internals ------------------------------------------------------

    def _materialize_create(
        self, dest: Destination, draft: Any, op_id: str, *, body: str | None = None
    ) -> RemoteIssue:
        number = self._next_issue_number
        external_id = str(self._next_issue_id)
        self._next_issue_number += 1
        self._next_issue_id += 1
        title = getattr(draft, "title", None) or "created"
        labels = list(getattr(draft, "labels", None) or ["prism"])
        full_body = body if body is not None else str(getattr(draft, "proseBlock", "") or "")
        issue = RemoteIssue(
            externalId=external_id,
            url=github_issue_url(dest.containerPath or REPO, number),
            number=number,
            title=title,
            body=full_body,
            state="open",
            labels=labels,
            assignees=[],
            author=_bot(),
            version=RemoteVersion(updatedAt=_now_iso(), etag=f"W/{number}"),
            container=IssueContainerRef(
                remoteContainerId=dest.remoteContainerId,
                path=dest.containerPath or REPO,
            ),
        )
        self._store_issue(issue)
        self.trace("materialize_create", opId=str(op_id), externalId=external_id, number=number)
        return issue

    def _store_issue(self, issue: RemoteIssue) -> None:
        self.issues[str(issue.externalId)] = issue
        if issue.number is not None:
            self.issues[str(issue.number)] = issue

    def _forget_issue(self, issue: RemoteIssue) -> None:
        self.issues.pop(str(issue.externalId), None)
        if issue.number is not None:
            self.issues.pop(str(issue.number), None)

    def _lookup_issue(self, key: str) -> RemoteIssue | None:
        return self.issues.get(str(key))

    def _require_issue(self, ext_id: str) -> RemoteIssue:
        issue = self._lookup_issue(str(ext_id))
        if issue is None:
            raise ProviderError("not_found_uncertain", f"issue {ext_id} missing", status=404)
        return issue

    def _unique_issues(self) -> list[RemoteIssue]:
        seen: set[str] = set()
        out: list[RemoteIssue] = []
        for issue in self.issues.values():
            if issue.externalId in seen:
                continue
            seen.add(issue.externalId)
            out.append(issue)
        return out

    def _read_outcome(self, forced: Mapping[str, Any]):
        status = int(forced["status"])
        if status == 304:
            return NotModified(etag="forced")
        if status == 401:
            raise ProviderError("auth_lost", "unauthorized", status=401)
        if status == 403 and forced.get("retry_after"):
            raise ProviderError(
                "rate_limited",
                "secondary rate limit",
                status=403,
                resume_at=forced.get("resume_at") or _now_iso(),
                retryable=True,
            )
        if status == 403:
            return ForbiddenRead(status=403)
        if status == 404:
            return UncertainAbsence(status=404)
        if status == 410:
            return GoneConfirmed(status=410)
        if status in (301, 302, 307, 308):
            from app.services.trackers.contracts import Moved

            return Moved(new_ref=str(forced.get("new_ref") or ""), new_container_id=forced.get("new_container_id"))
        raise ProviderError("transient", f"forced status {status}", status=status, retryable=True)


@contextmanager
def install_fake_provider(
    forge: StatefulFakeForge,
    connect_factory: Callable[[], Any],
) -> Iterator[StatefulFakeForge]:
    """Patch executor adapters + recovery page fetchers; mount create/reply/thread."""

    def _adapter(_connector, http=None):  # noqa: ANN001, ARG001
        return forge

    def _issue_pages(adapter, dest, since=None):  # noqa: ANN001, ARG001
        return forge.issue_page_fetcher(dest, since=since)

    def _comment_pages(adapter, dest, issue):  # noqa: ANN001, ARG001
        return forge.comment_page_fetcher(dest, issue)

    patches = [
        patch("app.services.trackers.create_executor._issue_adapter", _adapter),
        patch("app.services.trackers.reply_executor._comment_adapter", _adapter),
        patch("app.services.trackers.state_executor._issue_adapter", _adapter),
        patch("app.services.trackers.thread_executor._issue_adapter", _adapter),
        patch("app.services.trackers.create_executor.make_issue_page_fetcher", _issue_pages),
        patch("app.services.trackers.reply_executor.make_comment_page_fetcher", _comment_pages),
        patch("app.services.trackers.thread_executor.make_comment_page_fetcher", _comment_pages),
    ]
    for item in patches:
        item.start()
    mount_create_executor()
    mount_reply_executor()
    mount_thread_executor()
    set_create_connect_factory(connect_factory)
    set_reply_connect_factory(connect_factory)
    set_thread_connect_factory(connect_factory)
    try:
        yield forge
    finally:
        unmount_thread_executor()
        unmount_reply_executor()
        unmount_create_executor()
        set_create_connect_factory(None)
        set_reply_connect_factory(None)
        set_thread_connect_factory(None)
        for item in reversed(patches):
            item.stop()


def seed_destination(store: Any, conn: Any, *, visibility: str = "private") -> None:
    store.upsert_connector(
        connector_id=CONNECTOR,
        provider="github",
        instance_kind="github.com",
        bot_forge_user_id=BOT_ID,
        bot_login=BOT_LOGIN,
        credential_envelope="test-envelope",
    )
    store.set_project_tracker(
        project_tracker_id=PT_ID,
        project_id=PROJECT_ID,
        connector_id=CONNECTOR,
        container_kind="repo",
        container_path=REPO,
        remote_container_id=CONTAINER,
        generation=2,
        visibility=visibility,
    )
    store.acknowledge_destination(
        ack_id="ack_priv",
        connector_id=CONNECTOR,
        remote_container_id=CONTAINER,
        visibility=visibility,
        acknowledged_by="u_admin",
    )
    conn.execute(
        """
        UPDATE project_trackers
        SET promote_min_role = 'designer', visibility = %s
        WHERE project_id = %s
        """,
        (visibility, PROJECT_ID),
    )


def seed_comment_row(
    conn: Any,
    *,
    comment_id: str = COMMENT_ID,
    project_id: str = PROJECT_ID,
    content: str = "Stub on MGMT.D0_P",
    status: str = "OPEN",
    comment_class: str = "observation",
    author_user_id: str | None = "u_designer",
) -> None:
    conn.execute(
        """
        INSERT INTO comments (
            id, project_id, author, author_kind, author_user_id, content, severity, comment_class,
            context, location_x, location_y, location_layer, anchor_commit, anchor_state, anchor_source,
            status, revision
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1)
        ON CONFLICT (id) DO NOTHING
        """,
        (
            comment_id,
            project_id,
            "Priya",
            "user",
            author_user_id,
            content,
            "major",
            comment_class,
            "PCB",
            1.0,
            2.0,
            "F.Cu",
            COMMIT,
            "pinned",
            "openswitch.kicad_pro",
            status,
        ),
    )


__all__ = [
    "BOT_ID",
    "BOT_LOGIN",
    "COMMENT_ID",
    "COMMIT",
    "CONNECTOR",
    "CONTAINER",
    "DisposableSchema",
    "EXT_COMMENT",
    "FakeContext",
    "FakeJobs",
    "HUMAN_ID",
    "HUMAN_LOGIN",
    "ISSUE_ID",
    "ISSUE_NUMBER",
    "POSTGRES_URL",
    "PROJECT_ID",
    "PT_ID",
    "REPO",
    "REPLY_ID",
    "SHARED_APPLICATION_DATABASE",
    "StatefulFakeForge",
    "THREAD_ID",
    "all_fixture_case_ids",
    "bootstrap_tracker_schema",
    "dsn",
    "install_fake_provider",
    "load_fixture_cases",
    "require_test_postgres",
    "seed_comment_row",
    "seed_destination",
]
