"""Persistence for outbound webhooks and their delivery log (ADR §3.10).

An administrator's registration is one row in ``ws_webhooks``: its target, the
event kinds and projects it wants, its signing secret (an encrypted envelope from
``trackers/secrets.py``, bound to this webhook's id), and the delivery state a
pass advances. :func:`create` returns the plaintext secret exactly once; every
other read returns a view without it.

The cursor is the last event id the endpoint has settled. It moves past events
the endpoint filtered out as well as events it delivered, so a filtered event is
never reconsidered and a crashed pass resumes at the event it did not settle.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from app.core.errors import Conflict, Invalid, NotFound
from app.services import event_log
from app.services.workspace_connection import connect
from app.services.trackers.secrets import (
    SecretIntegrityError,
    SecretStoreLocked,
    decrypt_secret,
    encrypt_secret,
)
from app.services.webhooks import signing, targets

STATUSES = ("active", "failing", "disabled")
SECRET_STORE_LOCKED = "secret-store-locked"
#: ``update``'s "leave this column alone" marker; an explicit ``None`` clears one.
UNSET = object()


def create(
    *,
    url: str,
    event_kinds: list[str],
    project_ids: list[str] | None,
    created_by: str | None,
) -> tuple[dict[str, Any], str]:
    """Register an endpoint and return its view plus the one-time plaintext secret."""

    normalized_url = targets.require_target(url)
    kinds = _event_kinds(event_kinds)
    webhook_id = str(uuid.uuid4())
    secret = signing.generate_secret()
    try:
        envelope = encrypt_secret(secret, _context(webhook_id))
    except SecretStoreLocked as exc:
        raise Conflict(
            "Webhook secrets need TRACKER_CREDENTIAL_ROOT_KEY configured",
            code=SECRET_STORE_LOCKED,
        ) from exc

    with connect() as conn:
        head = conn.execute("SELECT COALESCE(MAX(id), 0) AS cursor FROM ws_events").fetchone()
        row = conn.execute(
            """
            INSERT INTO ws_webhooks
                (id, url, event_kinds, project_ids, secret_envelope, cursor, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                webhook_id,
                normalized_url,
                kinds,
                _project_ids(project_ids),
                envelope,
                int(head["cursor"]),
                created_by,
            ),
        ).fetchone()
    return view(row), secret


def list_all() -> list[dict[str, Any]]:
    """Every registration, oldest first; never carries a secret."""

    with connect() as conn:
        rows = conn.execute("SELECT * FROM ws_webhooks ORDER BY created_at ASC, id ASC").fetchall()
    return [view(row) for row in rows]


def get_row(webhook_id: str) -> dict[str, Any]:
    """The raw registration (secret envelope included), for delivery."""

    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM ws_webhooks WHERE id = %s", (_uuid(webhook_id),)
        ).fetchone()
    if row is None:
        raise NotFound("Webhook not found", code="webhook_not_found")
    return dict(row)


def get_view(webhook_id: str) -> dict[str, Any]:
    return view(get_row(webhook_id))


def update(
    webhook_id: str,
    *,
    url: str | object = UNSET,
    event_kinds: list[str] | object = UNSET,
    project_ids: list[str] | None | object = UNSET,
    status: str | object = UNSET,
) -> dict[str, Any]:
    """Edit a registration. Re-enabling a failing one clears its retry state."""

    current = get_row(webhook_id)
    assignments: list[str] = []
    values: list[Any] = []
    if url is not UNSET:
        assignments.append("url = %s")
        values.append(targets.require_target(str(url)))
    if event_kinds is not UNSET:
        assignments.append("event_kinds = %s")
        values.append(_event_kinds(list(event_kinds)))  # type: ignore[arg-type]
    if project_ids is not UNSET:
        assignments.append("project_ids = %s")
        values.append(_project_ids(project_ids))  # type: ignore[arg-type]
    if status is not UNSET:
        if status not in ("active", "disabled"):
            raise Invalid("A webhook status is active or disabled.", code="invalid_status")
        assignments.append("status = %s")
        values.append(status)
        if status == "active" and current["status"] in ("failing", "disabled"):
            assignments.extend(
                [
                    "attempts = 0",
                    "failing_since = NULL",
                    "next_attempt_at = NULL",
                ]
            )
    if not assignments:
        return view(current)

    with connect() as conn:
        row = conn.execute(
            f"UPDATE ws_webhooks SET {', '.join(assignments)} WHERE id = %s RETURNING *",
            (*values, _uuid(webhook_id)),
        ).fetchone()
    return view(row)


def delete(webhook_id: str) -> None:
    with connect() as conn:
        result = conn.execute(
            "DELETE FROM ws_webhooks WHERE id = %s", (_uuid(webhook_id),)
        )
        deleted = int(result.rowcount or 0)
    if not deleted:
        raise NotFound("Webhook not found", code="webhook_not_found")


def rotate_secret(webhook_id: str) -> tuple[dict[str, Any], str]:
    """Replace the signing secret and return the new plaintext once."""

    secret = signing.generate_secret()
    try:
        envelope = encrypt_secret(secret, _context(webhook_id))
    except SecretStoreLocked as exc:
        raise Conflict(
            "Webhook secrets need TRACKER_CREDENTIAL_ROOT_KEY configured",
            code=SECRET_STORE_LOCKED,
        ) from exc
    with connect() as conn:
        row = conn.execute(
            "UPDATE ws_webhooks SET secret_envelope = %s WHERE id = %s RETURNING *",
            (envelope, _uuid(webhook_id)),
        ).fetchone()
    if row is None:
        raise NotFound("Webhook not found", code="webhook_not_found")
    return view(row), secret


def decrypt(row: dict[str, Any]) -> str:
    """The plaintext signing secret, or ``SecretStoreLocked``."""

    try:
        return decrypt_secret(row["secret_envelope"], _context(str(row["id"]))).decode("utf-8")
    except SecretIntegrityError as exc:
        raise SecretStoreLocked("Webhook secret cannot be decrypted") from exc


def due(now: datetime | None = None) -> list[dict[str, Any]]:
    """Active registrations with no scheduled retry, or a retry that is due."""

    moment = now or datetime.now(timezone.utc)
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM ws_webhooks
            WHERE status = 'active'
              AND (next_attempt_at IS NULL OR next_attempt_at <= %s)
            ORDER BY created_at ASC, id ASC
            """,
            (moment,),
        ).fetchall()
    return [dict(row) for row in rows]


def events_after(cursor: int, *, limit: int = 50) -> list[dict[str, Any]]:
    """The next events in log order, in the shape the signing module takes."""

    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, kind, project_id, created_at, payload
            FROM ws_events
            WHERE id > %s
            ORDER BY id ASC
            LIMIT %s
            """,
            (cursor, limit),
        ).fetchall()
    return [
        {
            "id": int(row["id"]),
            "kind": row["kind"],
            "projectId": row["project_id"],
            "createdAt": row["created_at"].isoformat().replace("+00:00", "Z"),
            "payload": row["payload"] or {},
        }
        for row in rows
    ]


def save_cursor(webhook_id: str, cursor: int) -> None:
    with connect() as conn:
        conn.execute(
            "UPDATE ws_webhooks SET cursor = %s WHERE id = %s",
            (int(cursor), _uuid(webhook_id)),
        )


def record_success(
    webhook_id: str, *, event_id: int, status_code: int | None, at: datetime | None = None
) -> None:
    """Settle one delivered event: advance the cursor and clear the retry state."""

    with connect() as conn:
        conn.execute(
            """
            UPDATE ws_webhooks
            SET cursor = %s,
                attempts = 0,
                failing_since = NULL,
                next_attempt_at = NULL,
                last_status = %s,
                last_error = NULL,
                last_delivery_at = %s
            WHERE id = %s
            """,
            (
                int(event_id),
                status_code,
                at or datetime.now(timezone.utc),
                _uuid(webhook_id),
            ),
        )


def record_failure(
    webhook_id: str,
    *,
    attempts: int,
    failing_since: datetime,
    next_attempt_at: datetime,
    status: str,
    status_code: int | None,
    error: str | None,
    at: datetime | None = None,
) -> None:
    """Write the retry state after an attempt that did not settle its event."""

    with connect() as conn:
        conn.execute(
            """
            UPDATE ws_webhooks
            SET attempts = %s,
                failing_since = %s,
                next_attempt_at = %s,
                status = %s,
                last_status = %s,
                last_error = %s,
                last_delivery_at = %s
            WHERE id = %s
            """,
            (
                int(attempts),
                failing_since,
                next_attempt_at,
                status,
                status_code,
                _truncate(error),
                at or datetime.now(timezone.utc),
                _uuid(webhook_id),
            ),
        )


def record_delivery(
    webhook_id: str,
    *,
    event_id: int | None,
    status_code: int | None,
    ok: bool,
    error: str | None,
    duration_ms: int,
) -> int:
    with connect() as conn:
        row = conn.execute(
            """
            INSERT INTO ws_webhook_deliveries
                (webhook_id, event_id, status_code, ok, error, duration_ms)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                _uuid(webhook_id),
                event_id,
                status_code,
                bool(ok),
                _truncate(error),
                max(0, int(duration_ms)),
            ),
        ).fetchone()
    return int(row["id"])


def list_deliveries(webhook_id: str, *, limit: int = 50) -> list[dict[str, Any]]:
    """The newest delivery attempts for one registration."""

    get_row(webhook_id)
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, event_id, at, status_code, ok, error, duration_ms
            FROM ws_webhook_deliveries
            WHERE webhook_id = %s
            ORDER BY id DESC
            LIMIT %s
            """,
            (_uuid(webhook_id), max(1, min(500, int(limit)))),
        ).fetchall()
    return [
        {
            "id": int(row["id"]),
            "eventId": int(row["event_id"]) if row["event_id"] is not None else None,
            "at": row["at"],
            "statusCode": row["status_code"],
            "ok": bool(row["ok"]),
            "error": row["error"],
            "durationMs": row["duration_ms"],
        }
        for row in rows
    ]


def prune_deliveries(days: int = 30, *, limit: int = 1000) -> int:
    """Delete a bounded batch of delivery rows older than ``days``."""

    with connect() as conn:
        result = conn.execute(
            """
            DELETE FROM ws_webhook_deliveries
            WHERE id IN (
                SELECT id FROM ws_webhook_deliveries
                WHERE at < NOW() - (%s * INTERVAL '1 day')
                LIMIT %s
            )
            """,
            (max(0, int(days)), max(1, int(limit))),
        )
        return int(result.rowcount or 0)


def view(row: dict[str, Any]) -> dict[str, Any]:
    """A registration as the Settings API shows it: no secret, no envelope."""

    project_ids = row["project_ids"]
    return {
        "id": str(row["id"]),
        "url": row["url"],
        "eventKinds": list(row["event_kinds"] or []),
        "projectIds": list(project_ids) if project_ids is not None else None,
        "status": row["status"],
        "cursor": int(row["cursor"]),
        "attempts": int(row["attempts"] or 0),
        "failingSince": row["failing_since"],
        "nextAttemptAt": row["next_attempt_at"],
        "lastStatus": row["last_status"],
        "lastError": row["last_error"],
        "lastDeliveryAt": row["last_delivery_at"],
        "createdBy": row["created_by"],
        "createdAt": row["created_at"],
    }


def _context(webhook_id: str) -> dict[str, str]:
    return {"webhook": str(webhook_id)}


def _event_kinds(kinds: list[str]) -> list[str]:
    normalized = list(dict.fromkeys(str(kind) for kind in kinds))
    unknown = [kind for kind in normalized if kind not in event_log.EVENT_KINDS]
    if unknown:
        raise Invalid(
            f"Unknown event kind: {', '.join(unknown)}", code="unknown_event_kind"
        )
    return normalized


def _project_ids(project_ids: list[str] | None) -> list[str] | None:
    if project_ids is None:
        return None
    return list(dict.fromkeys(str(project_id) for project_id in project_ids))


def _uuid(webhook_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(webhook_id))
    except (ValueError, TypeError, AttributeError) as exc:
        raise NotFound("Webhook not found", code="webhook_not_found") from exc


def _truncate(error: str | None) -> str | None:
    return error[:500] if error else None


__all__ = [
    "SECRET_STORE_LOCKED",
    "STATUSES",
    "UNSET",
    "connect",
    "create",
    "decrypt",
    "delete",
    "due",
    "events_after",
    "get_row",
    "get_view",
    "list_all",
    "list_deliveries",
    "prune_deliveries",
    "record_delivery",
    "record_failure",
    "record_success",
    "rotate_secret",
    "save_cursor",
    "update",
    "view",
]
