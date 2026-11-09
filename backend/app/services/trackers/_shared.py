"""Helpers shared across the tracker services."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Mapping, Optional

from app.services.trackers.contracts import Destination, ForgeUser, IssueDraft
from app.services.trackers.errors import ProviderError
from app.services.trackers.schema import FORBIDDEN_COLUMNS


def qual_checked(schema: str, table: str) -> str:
    if not schema.replace("_", "").isalnum():
        raise ValueError("invalid schema name")
    return f'"{schema}".{table}'


def qual_quoted(schema: str, table: str) -> str:
    return f'"{schema}"."{table}"'


def new_op_id() -> str:
    return f"op_{uuid.uuid4().hex[:12]}"


def thread_ready(thread: Mapping[str, Any]) -> bool:
    external_id = str(thread.get("external_id") or "")
    return external_id not in ("", "pending")


def dump_row(row: Mapping[str, Any] | None) -> Optional[dict]:
    if row is None:
        return None
    leaked = set(row) & FORBIDDEN_COLUMNS
    if leaked:
        raise ValueError(f"owner/repo column leaked: {sorted(leaked)}")
    out = {}
    for key, value in row.items():
        if isinstance(value, datetime):
            out[key] = value.astimezone(timezone.utc)
        else:
            out[key] = value
    return out


def live_thread(conn: Any, comment_id: str) -> Optional[dict]:
    row = conn.execute(
        """
        SELECT * FROM tracked_threads
        WHERE comment_id = %s AND unlinked_at IS NULL
        ORDER BY id DESC
        LIMIT 1
        """,
        (comment_id,),
    ).fetchone()
    return dict(row) if row else None


def append_lineage(conn: Any, thread_id: str, entry: Mapping[str, Any]) -> None:
    conn.execute(
        """
        UPDATE tracked_threads
        SET lineage = lineage || %s::jsonb
        WHERE id = %s
        """,
        (json.dumps([dict(entry)]), thread_id),
    )


def load_checkpoint(conn: Any, *, kind: str, scope: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM sync_checkpoints WHERE kind = %s AND scope_key = %s",
        (kind, scope),
    ).fetchone()
    return dict(row) if row else None


def save_checkpoint_error(
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


def github_owner_repo(dest: Destination) -> tuple[str, str]:
    path = (dest.containerPath or "").strip().strip("/")
    if path.count("/") != 1:
        raise ProviderError("invalid_request", "GitHub destination path must be owner/repo.")
    owner, repo = path.split("/", 1)
    if not owner or not repo:
        raise ProviderError("invalid_request", "GitHub destination path must be owner/repo.")
    return owner, repo


def github_forge_user(payload: Mapping[str, Any]) -> ForgeUser:
    login = str(payload.get("login") or "")
    user_type = str(payload.get("type") or "")
    is_bot = user_type.casefold() == "bot" or login.endswith("[bot]")
    return ForgeUser(
        id=str(payload.get("id") or ""),
        login=login,
        isBot=is_bot,
        displayName=str(payload.get("name") or "") or None,
    )


def split_scopes(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    text = str(value or "").strip()
    if not text:
        return []
    return [part for part in text.replace(",", " ").split() if part]


def compose_body(draft: IssueDraft) -> str:
    parts = [draft.proseBlock.rstrip(), draft.marker.strip()]
    return "\n\n".join(part for part in parts if part)
