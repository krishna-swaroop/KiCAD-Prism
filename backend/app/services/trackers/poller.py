"""Destination poll with durable cursors (TR-32, C6/C7/D9).

One poll runs per ``(connector_id, remote_container_id)`` regardless of how
many Prism projects share the repository. Hints are durably enqueued before the
checkpoint ``since`` cursor advances. ``page_cursor`` resumes interrupted
pagination without re-fetching completed pages or duplicating hints.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Mapping, Optional, Sequence

from app.services.trackers.contracts import Destination, RemoteChange, UpdateCursor
from app.services.trackers.errors import ProviderError
from app.services.trackers.github_updates import (
    DEFAULT_SINCE,
    change_delivery_id,
    change_to_hint,
    cursor_from_checkpoint,
    destination_for,
    format_iso8601,
)
from app.services.trackers.inbox_store import InboxStore
from app.services.trackers.scheduler import poll_interval_seconds

ListUpdatesFn = Callable[[Destination, UpdateCursor], tuple[Sequence[RemoteChange], UpdateCursor]]
CHECKPOINT_KIND = "poll"


@dataclass
class PollOutcome:
    hints_enqueued: int = 0
    hints_deduplicated: int = 0
    pages_fetched: int = 0
    complete: bool = False
    retry_after_seconds: int | None = None
    error: dict[str, Any] | None = None
    details: dict[str, Any] = field(default_factory=dict)


def scope_key(connector_id: str, container_id: str) -> str:
    return f"{connector_id}:{container_id}"


def _cursor_payload(checkpoint: Mapping[str, Any] | None) -> dict[str, Any]:
    if not checkpoint:
        return {"since": DEFAULT_SINCE}
    raw = checkpoint.get("cursor")
    if isinstance(raw, str):
        return json.loads(raw or "{}")
    if isinstance(raw, dict):
        return dict(raw)
    return {"since": DEFAULT_SINCE}


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
        (kind, scope, json.dumps({"since": DEFAULT_SINCE})),
    )


def _save_page_progress(
    conn: Any,
    *,
    kind: str,
    scope: str,
    page_cursor: str,
) -> None:
    conn.execute(
        """
        UPDATE sync_checkpoints
        SET page_cursor = %s,
            last_error = NULL
        WHERE kind = %s AND scope_key = %s
        """,
        (page_cursor, kind, scope),
    )


def _save_poll_complete(
    conn: Any,
    *,
    kind: str,
    scope: str,
    since: str,
    connector_id: str,
) -> None:
    interval = poll_interval_seconds(conn, connector_id)
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
        (json.dumps({"since": since}), interval, kind, scope),
    )


def _save_poll_error(
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


def _enqueue_changes(
    inbox: InboxStore,
    *,
    connector_id: str,
    container_id: str,
    changes: Sequence[RemoteChange],
) -> tuple[int, int]:
    created = 0
    deduped = 0
    for change in changes:
        delivery_id = change_delivery_id(
            connector_id=connector_id,
            container_id=container_id,
            change=change,
        )
        result = inbox.enqueue(
            connector_id=connector_id,
            delivery_id=delivery_id,
            hints=[change_to_hint(change, connector_id=connector_id)],
        )
        if result.get("created"):
            created += 1
        else:
            deduped += 1
    return created, deduped


def poll_destination_updates(
    conn: Any,
    *,
    connector_id: str,
    container_id: str,
    container_path: str,
    list_updates: ListUpdatesFn,
    inbox: InboxStore | None = None,
    checkpoint_kind: str = CHECKPOINT_KIND,
    destination_generation: int = 1,
    max_pages: int | None = None,
) -> PollOutcome:
    """Poll one destination, enqueue durable hints, and advance cursors safely."""

    inbox = inbox or InboxStore(conn)
    scope = scope_key(connector_id, container_id)
    _ensure_checkpoint(conn, kind=checkpoint_kind, scope=scope)
    checkpoint = _load_checkpoint(conn, kind=checkpoint_kind, scope=scope)
    cursor_state = _cursor_payload(checkpoint)
    committed_since = str(cursor_state.get("since") or DEFAULT_SINCE)
    provider_cursor = cursor_from_checkpoint(checkpoint)
    dest = destination_for(
        connector_id=connector_id,
        container_path=container_path,
        remote_container_id=container_id,
        generation=destination_generation,
    )

    outcome = PollOutcome()
    latest_since = committed_since
    pages = 0

    try:
        while True:
            if max_pages is not None and pages >= max_pages:
                break
            changes, next_cursor = list_updates(dest, provider_cursor)
            pages += 1
            outcome.pages_fetched = pages
            created, deduped = _enqueue_changes(
                inbox,
                connector_id=connector_id,
                container_id=container_id,
                changes=changes,
            )
            outcome.hints_enqueued += created
            outcome.hints_deduplicated += deduped

            if next_cursor.since and next_cursor.since > latest_since:
                latest_since = next_cursor.since

            if next_cursor.page:
                _save_page_progress(
                    conn,
                    kind=checkpoint_kind,
                    scope=scope,
                    page_cursor=str(next_cursor.page),
                )
                provider_cursor = UpdateCursor(
                    since=provider_cursor.since,
                    page=next_cursor.page,
                )
                continue

            _save_poll_complete(
                conn,
                kind=checkpoint_kind,
                scope=scope,
                since=latest_since,
                connector_id=connector_id,
            )
            outcome.complete = True
            outcome.details["since"] = latest_since
            break
    except ProviderError as exc:
        error = exc.to_dto()
        retry = _retry_seconds(exc)
        _save_poll_error(
            conn,
            kind=checkpoint_kind,
            scope=scope,
            error=error,
            retry_after_seconds=retry,
        )
        outcome.error = error
        outcome.retry_after_seconds = retry
        outcome.details["since"] = committed_since
        return outcome

    outcome.details["since"] = latest_since if outcome.complete else committed_since
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
    return poll_interval_seconds_from_error(exc)


def poll_interval_seconds_from_error(exc: ProviderError) -> int:
    if exc.class_ in {"auth_lost", "forbidden"}:
        return 15 * 60
    return 3 * 60


__all__ = [
    "CHECKPOINT_KIND",
    "PollOutcome",
    "poll_destination_updates",
    "scope_key",
]
