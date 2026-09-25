"""Durable outbound sync operations (TR-13, C2/C5).

Insertion is caller-connection so a comment, its revision and the op commit
or roll back together. Claims use ``FOR UPDATE SKIP LOCKED`` plus a fence:
two workers cannot hold the same live op, a stale fence cannot confirm, and
any claim of ``sent`` / ``recovering`` / ``quarantine`` is recovery (D2).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Mapping, Optional

from app.services.trackers.errors import ProviderError
from app.services.trackers.schema import FORBIDDEN_COLUMNS

OP_KINDS = (
    "create_issue",
    "update_issue",
    "set_state",
    "add_comment",
    "edit_comment",
    "delete_comment",
    "post_note",
)
OP_STATES = (
    "pending",
    "sent",
    "recovering",
    "quarantine",
    "confirmed",
    "superseded",
    "failed",
)
LIVE_STATES = ("pending", "sent", "recovering", "quarantine")
RECOVERY_STATES = ("sent", "recovering", "quarantine")
TERMINAL_STATES = ("confirmed", "superseded", "failed")
EXECUTE_DISPATCH = "execute"
RECOVERY_DISPATCH = "recovery"


class StaleFence(RuntimeError):
    """Caller fence no longer owns the operation."""


def apply_schema(conn: Any) -> None:
    """Create ``sync_ops`` if missing. Restart-safe; no migration-number claim."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sync_ops (
            id TEXT PRIMARY KEY,
            tracked_thread_id TEXT NOT NULL REFERENCES tracked_threads(id) ON DELETE CASCADE,
            op TEXT NOT NULL,
            state TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            sent_at TIMESTAMPTZ,
            local_revision INTEGER,
            destination_generation INTEGER NOT NULL,
            actor_user_id TEXT,
            actor_role TEXT,
            expected_remote_state TEXT,
            expected_remote_version JSONB,
            expected_body_hash TEXT,
            attempts INTEGER NOT NULL DEFAULT 0,
            next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            claimed_by TEXT,
            lease_expires_at TIMESTAMPTZ,
            fence INTEGER NOT NULL DEFAULT 0,
            external_result_id TEXT,
            lineage_of TEXT,
            last_error JSONB
        );
        CREATE INDEX IF NOT EXISTS sync_ops_claim
            ON sync_ops(state, next_attempt_at, created_at, id);
        CREATE INDEX IF NOT EXISTS sync_ops_thread
            ON sync_ops(tracked_thread_id, created_at, id);
        """,
        prepare=False,
    )
    conn.execute(
        "ALTER TABLE sync_ops ADD COLUMN IF NOT EXISTS actor_role TEXT",
        prepare=False,
    )


def sanitize_error(
    class_: str,
    message: str,
    *,
    resume_at: Optional[str] = None,
    status: Optional[int] = None,
    retryable: Optional[bool] = None,
    new_ref: Optional[str] = None,
) -> dict:
    """Persistable failure payload. Tokens and raw bodies never land here."""

    return ProviderError(
        class_,
        message,
        resume_at=resume_at,
        status=status,
        retryable=retryable,
        new_ref=new_ref,
    ).to_dto()


def _dump(row: Mapping[str, Any] | None) -> Optional[dict]:
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


def _dispatch_for(state: str) -> str:
    if state == "pending":
        return EXECUTE_DISPATCH
    if state in RECOVERY_STATES:
        return RECOVERY_DISPATCH
    raise ValueError(f"op state {state!r} is not claimable")


def _with_dispatch(row: Mapping[str, Any] | None) -> Optional[dict]:
    payload = _dump(row)
    if payload is None:
        return None
    payload["dispatch"] = _dispatch_for(str(payload["state"]))
    return payload


class OpStore:
    """Caller-connection outbox. Never opens its own connection or network I/O."""

    def __init__(self, conn: Any) -> None:
        self.conn = conn

    def insert(
        self,
        *,
        op_id: str,
        tracked_thread_id: str,
        op: str,
        destination_generation: int,
        local_revision: int | None = None,
        actor_user_id: str | None = None,
        actor_role: str | None = None,
        expected_remote_state: str | None = None,
        expected_remote_version: Mapping[str, Any] | None = None,
        expected_body_hash: str | None = None,
        lineage_of: str | None = None,
    ) -> dict:
        if op not in OP_KINDS:
            raise ValueError(f"unknown op kind: {op}")
        if destination_generation < 1:
            raise ValueError("destination_generation must be >= 1")
        version = (
            json.dumps(dict(expected_remote_version))
            if expected_remote_version is not None
            else None
        )
        self.conn.execute(
            """
            INSERT INTO sync_ops (
                id, tracked_thread_id, op, state, local_revision,
                destination_generation, actor_user_id, actor_role, expected_remote_state,
                expected_remote_version, expected_body_hash, lineage_of
            ) VALUES (%s, %s, %s, 'pending', %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
            """,
            (
                op_id,
                tracked_thread_id,
                op,
                local_revision,
                destination_generation,
                actor_user_id,
                actor_role,
                expected_remote_state,
                version,
                expected_body_hash,
                lineage_of,
            ),
        )
        return self.get(op_id)

    def get(self, op_id: str) -> dict:
        row = self.conn.execute(
            "SELECT * FROM sync_ops WHERE id = %s", (op_id,)
        ).fetchone()
        payload = _dump(row)
        if payload is None:
            raise KeyError(op_id)
        return payload

    def list_thread(self, tracked_thread_id: str) -> list[dict]:
        rows = self.conn.execute(
            """
            SELECT * FROM sync_ops
            WHERE tracked_thread_id = %s
            ORDER BY created_at ASC, id ASC
            """,
            (tracked_thread_id,),
        ).fetchall()
        return [_dump(row) for row in rows]  # type: ignore[misc]

    def claim(self, worker_id: str, *, lease_seconds: int = 60) -> Optional[dict]:
        """Claim the next due op. One live lease per thread; SKIP LOCKED.

        Pending ops dispatch to execute. ``sent`` / ``recovering`` /
        ``quarantine`` dispatch to recovery and are never resent from here.
        """

        if lease_seconds < 1:
            raise ValueError("lease_seconds must be at least 1")
        row = self.conn.execute(
            """
            SELECT o.*
            FROM sync_ops o
            WHERE o.state = ANY(%s)
              AND o.next_attempt_at <= NOW()
              AND (o.claimed_by IS NULL OR o.lease_expires_at IS NULL
                   OR o.lease_expires_at < NOW())
              AND NOT EXISTS (
                SELECT 1 FROM sync_ops live
                WHERE live.tracked_thread_id = o.tracked_thread_id
                  AND live.id <> o.id
                  AND live.claimed_by IS NOT NULL
                  AND live.lease_expires_at IS NOT NULL
                  AND live.lease_expires_at >= NOW()
              )
              AND NOT EXISTS (
                SELECT 1 FROM sync_ops earlier
                WHERE earlier.tracked_thread_id = o.tracked_thread_id
                  AND earlier.state = ANY(%s)
                  AND (earlier.created_at, earlier.local_revision, earlier.id)
                      < (o.created_at, o.local_revision, o.id)
              )
              AND (
                o.op = 'create_issue'
                OR NOT EXISTS (
                    SELECT 1 FROM sync_ops waiting
                    WHERE waiting.tracked_thread_id = o.tracked_thread_id
                      AND waiting.op = 'create_issue'
                      AND waiting.state <> 'confirmed'
                )
              )
            ORDER BY o.created_at ASC, o.local_revision ASC, o.id ASC
            LIMIT 1
            FOR UPDATE OF o SKIP LOCKED
            """,
            (list(LIVE_STATES), list(LIVE_STATES)),
        ).fetchone()
        if not row:
            return None
        old_fence = int(row["fence"] or 0)
        fence = old_fence + 1
        claimed = self.conn.execute(
            """
            UPDATE sync_ops
            SET claimed_by = %s,
                lease_expires_at = NOW() + (%s * INTERVAL '1 second'),
                fence = %s
            WHERE id = %s AND fence = %s AND state = ANY(%s)
            RETURNING *
            """,
            (worker_id, lease_seconds, fence, row["id"], old_fence, list(LIVE_STATES)),
        ).fetchone()
        return _with_dispatch(claimed)

    def mark_sent(self, op_id: str, fence: int) -> dict:
        """Record ``sent`` before any provider I/O. Same fence stays valid."""

        row = self.conn.execute(
            """
            UPDATE sync_ops
            SET state = 'sent',
                sent_at = COALESCE(sent_at, NOW()),
                attempts = attempts + 1
            WHERE id = %s AND fence = %s AND state = 'pending'
            RETURNING *
            """,
            (op_id, fence),
        ).fetchone()
        if row is None:
            raise StaleFence(f"op {op_id} fence {fence} cannot mark sent")
        payload = _dump(row)
        assert payload is not None
        payload["dispatch"] = RECOVERY_DISPATCH
        return payload

    def record_expected_body_hash(self, op_id: str, fence: int, expected_body_hash: str) -> None:
        """Pin the hash of the body actually sent to the forge (D3 echo key).

        Enqueue only knows the prose; the executor renders attribution and the
        provenance marker around it. Echo detection compares the fetched
        forge body against this hash, so it must describe the rendered body.
        """

        self.conn.execute(
            """
            UPDATE sync_ops
            SET expected_body_hash = %s
            WHERE id = %s AND fence = %s
            """,
            (expected_body_hash, op_id, fence),
        )

    def retain_unsent(
        self,
        op_id: str,
        fence: int,
        *,
        next_attempt_at: datetime,
        error: Mapping[str, Any] | None = None,
    ) -> dict:
        """Return a ``sent`` op to ``pending`` when the executor stopped before any I/O.

        ``mark_sent`` precedes the executor (D2), so a policy pause raised while
        loading context would otherwise strand the op in ``sent``: every later
        claim takes the recovery path and scans for a write that never happened.
        Callers must only use this from the pre-I/O phase; the attempt that
        ``mark_sent`` counted is handed back.
        """

        payload_error = None
        if error is not None:
            payload_error = sanitize_error(
                str(error.get("class") or error.get("class_") or "transient"),
                str(error.get("message") or "retained before send"),
                resume_at=error.get("resumeAt") or error.get("resume_at"),
                status=error.get("status"),
                retryable=error.get("retryable"),
                new_ref=error.get("newRef") or error.get("new_ref"),
            )
        row = self.conn.execute(
            """
            UPDATE sync_ops
            SET state = 'pending',
                sent_at = NULL,
                attempts = GREATEST(attempts - 1, 0),
                next_attempt_at = %s,
                claimed_by = NULL,
                lease_expires_at = NULL,
                last_error = COALESCE(%s::jsonb, last_error)
            WHERE id = %s AND fence = %s AND state = 'sent'
            RETURNING *
            """,
            (
                next_attempt_at,
                json.dumps(payload_error) if payload_error is not None else None,
                op_id,
                fence,
            ),
        ).fetchone()
        if row is None:
            raise StaleFence(f"op {op_id} fence {fence} cannot be retained unsent")
        payload = _dump(row)
        assert payload is not None
        return payload

    def confirm(
        self,
        op_id: str,
        fence: int,
        *,
        external_result_id: str | None = None,
    ) -> dict:
        row = self.conn.execute(
            """
            UPDATE sync_ops
            SET state = 'confirmed',
                external_result_id = COALESCE(%s, external_result_id),
                claimed_by = NULL,
                lease_expires_at = NULL,
                last_error = NULL
            WHERE id = %s AND fence = %s AND state = ANY(%s)
            RETURNING *
            """,
            (external_result_id, op_id, fence, list(RECOVERY_STATES)),
        ).fetchone()
        if row is None:
            raise StaleFence(f"op {op_id} fence {fence} cannot confirm")
        payload = _dump(row)
        assert payload is not None
        return payload

    def supersede(self, op_id: str, fence: int, *, reason: str | None = None) -> dict:
        error = sanitize_error("invalid_request", reason or "superseded by newer local intent")
        row = self.conn.execute(
            """
            UPDATE sync_ops
            SET state = 'superseded',
                claimed_by = NULL,
                lease_expires_at = NULL,
                last_error = %s::jsonb
            WHERE id = %s AND fence = %s AND state = ANY(%s)
            RETURNING *
            """,
            (json.dumps(error), op_id, fence, list(LIVE_STATES)),
        ).fetchone()
        if row is None:
            raise StaleFence(f"op {op_id} fence {fence} cannot supersede")
        payload = _dump(row)
        assert payload is not None
        return payload

    def fail(self, op_id: str, fence: int, *, error: Mapping[str, Any]) -> dict:
        cleaned = sanitize_error(
            str(error.get("class") or error.get("class_") or "transient"),
            str(error.get("message") or "sync failed"),
            resume_at=error.get("resumeAt") or error.get("resume_at"),
            status=error.get("status"),
            retryable=error.get("retryable"),
            new_ref=error.get("newRef") or error.get("new_ref"),
        )
        row = self.conn.execute(
            """
            UPDATE sync_ops
            SET state = 'failed',
                claimed_by = NULL,
                lease_expires_at = NULL,
                last_error = %s::jsonb
            WHERE id = %s AND fence = %s AND state = ANY(%s)
            RETURNING *
            """,
            (json.dumps(cleaned), op_id, fence, list(LIVE_STATES)),
        ).fetchone()
        if row is None:
            raise StaleFence(f"op {op_id} fence {fence} cannot fail")
        payload = _dump(row)
        assert payload is not None
        return payload

    def enter_recovery(self, op_id: str, fence: int) -> dict:
        row = self.conn.execute(
            """
            UPDATE sync_ops
            SET state = 'recovering'
            WHERE id = %s AND fence = %s AND state IN ('sent', 'recovering')
            RETURNING *
            """,
            (op_id, fence),
        ).fetchone()
        if row is None:
            raise StaleFence(f"op {op_id} fence {fence} cannot enter recovery")
        payload = _dump(row)
        assert payload is not None
        payload["dispatch"] = RECOVERY_DISPATCH
        return payload

    def enter_quarantine(self, op_id: str, fence: int, *, next_attempt_at: datetime) -> dict:
        row = self.conn.execute(
            """
            UPDATE sync_ops
            SET state = 'quarantine',
                next_attempt_at = %s,
                claimed_by = NULL,
                lease_expires_at = NULL
            WHERE id = %s AND fence = %s AND state IN ('recovering', 'quarantine')
            RETURNING *
            """,
            (next_attempt_at, op_id, fence),
        ).fetchone()
        if row is None:
            raise StaleFence(f"op {op_id} fence {fence} cannot enter quarantine")
        payload = _dump(row)
        assert payload is not None
        return payload

    def schedule(
        self,
        op_id: str,
        fence: int,
        *,
        next_attempt_at: datetime,
        error: Mapping[str, Any] | None = None,
        consume_attempt: bool = False,
    ) -> dict:
        """Reschedule without advancing state. Auth/rate-limit must not burn budget."""

        payload_error = None
        if error is not None:
            payload_error = sanitize_error(
                str(error.get("class") or error.get("class_") or "transient"),
                str(error.get("message") or "scheduled retry"),
                resume_at=error.get("resumeAt") or error.get("resume_at"),
                status=error.get("status"),
                retryable=error.get("retryable"),
                new_ref=error.get("newRef") or error.get("new_ref"),
            )
        row = self.conn.execute(
            """
            UPDATE sync_ops
            SET next_attempt_at = %s,
                claimed_by = NULL,
                lease_expires_at = NULL,
                attempts = attempts + CASE WHEN %s THEN 1 ELSE 0 END,
                last_error = COALESCE(%s::jsonb, last_error)
            WHERE id = %s AND fence = %s AND state = ANY(%s)
            RETURNING *
            """,
            (
                next_attempt_at,
                consume_attempt,
                json.dumps(payload_error) if payload_error is not None else None,
                op_id,
                fence,
                list(LIVE_STATES),
            ),
        ).fetchone()
        if row is None:
            raise StaleFence(f"op {op_id} fence {fence} cannot schedule")
        payload = _dump(row)
        assert payload is not None
        return payload
