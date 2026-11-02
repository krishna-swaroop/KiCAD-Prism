"""The supply audit trail. Identity always comes from the session, never a payload."""

from __future__ import annotations

import json
from typing import Any, Mapping


def actor_text(value: str | None) -> str:
    """The acting user, stripped. Raises if there is none."""

    text = (value or "").strip()
    if not text:
        raise ValueError("actor is required")
    return text


def write_audit(
    conn,
    actor: str,
    action: str,
    subject_id: str,
    detail: Mapping[str, Any] | None = None,
    *,
    subject_kind: str = "connector",
) -> None:
    """Record one event. Never put credentials or file contents in ``detail``."""

    conn.execute(
        "INSERT INTO supply_audit_events (actor, action, subject_kind, subject_id, detail) "
        "VALUES (%s, %s, %s, %s, %s::jsonb)",
        (actor_text(actor), action, subject_kind, subject_id, json.dumps(dict(detail or {}))),
    )
