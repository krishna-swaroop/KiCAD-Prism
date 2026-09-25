"""GitHub destination update listing for poll paths (TR-32, C7).

Wraps any issue adapter's ``list_updates`` with overlap windows and stable
hint identity. Poll actors are absent; authoritative state is fetched later by
the inbound reducer (D3/C6).
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping, Optional

from app.services.trackers.contracts import Destination, RemoteChange, UpdateCursor
from app.services.trackers.github_issues import DEFAULT_SINCE

POLL_OVERLAP_SECONDS = 5 * 60


def parse_iso8601(value: str) -> datetime:
    text = (value or "").strip()
    if not text:
        return datetime.fromtimestamp(0, tz=timezone.utc)
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def format_iso8601(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def overlap_since(since: str, *, overlap_seconds: int = POLL_OVERLAP_SECONDS) -> str:
    """Rewind ``since`` by the C7 overlap window."""

    anchor = parse_iso8601(since or DEFAULT_SINCE)
    return format_iso8601(anchor - timedelta(seconds=max(0, overlap_seconds)))


def destination_for(
    *,
    connector_id: str,
    container_path: str,
    remote_container_id: str,
    generation: int = 1,
) -> Destination:
    return Destination(
        connectorId=connector_id,
        containerKind="repo",
        containerPath=container_path,
        remoteContainerId=remote_container_id,
        generation=generation,
    )


def cursor_from_checkpoint(
    checkpoint: Mapping[str, Any] | None,
    *,
    overlap_seconds: int = POLL_OVERLAP_SECONDS,
) -> UpdateCursor:
    """Build the next provider cursor from a durable checkpoint row."""

    payload = checkpoint or {}
    cursor = payload.get("cursor") or {}
    if isinstance(cursor, str):
        import json

        cursor = json.loads(cursor)
    since = str((cursor or {}).get("since") or DEFAULT_SINCE)
    page = payload.get("page_cursor") or None
    page_text = str(page).strip() if page else ""
    return UpdateCursor(
        since=overlap_since(since, overlap_seconds=overlap_seconds),
        page=page_text or None,
    )


def change_delivery_id(
    *,
    connector_id: str,
    container_id: str,
    change: RemoteChange,
) -> str:
    """Stable poll delivery id deduped by object identity and ``updated_at``."""

    parts = [
        connector_id,
        container_id,
        change.objectKind,
        change.externalId,
        change.observedUpdatedAt or "",
    ]
    if change.externalCommentId:
        parts.append(change.externalCommentId)
    digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:32]
    return f"poll:{digest}"


def change_to_hint(change: RemoteChange, *, connector_id: str) -> dict[str, Any]:
    """Map a provider change onto a durable inbox hint (no actor evidence)."""

    event = "updated"
    external_id = str(change.externalId or "")
    hint: dict[str, Any] = {
        "objectKind": change.objectKind,
        "remoteContainerId": change.remoteContainerId,
        "externalId": external_id,
        "event": event,
    }
    if change.objectKind == "comment":
        hint["externalCommentId"] = str(change.externalCommentId or external_id)
        hint["externalId"] = external_id
    return hint


def list_destination_updates(
    adapter: Any,
    dest: Destination,
    since_cursor: UpdateCursor,
) -> tuple[list[RemoteChange], UpdateCursor]:
    """Fetch one page of issue updates for a destination."""

    return adapter.list_updates(dest, since_cursor)


__all__ = [
    "DEFAULT_SINCE",
    "POLL_OVERLAP_SECONDS",
    "change_delivery_id",
    "change_to_hint",
    "cursor_from_checkpoint",
    "destination_for",
    "format_iso8601",
    "list_destination_updates",
    "overlap_since",
    "parse_iso8601",
]
