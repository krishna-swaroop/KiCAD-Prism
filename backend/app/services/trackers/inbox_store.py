"""Durable inbound hint inbox and scheduler checkpoints (TR-13, C6/C7/D9).

A delivery id row plus its hints commit together. Duplicate deliveries are
idempotent: the unique ``(connector_id, delivery_id)`` insert is the receipt,
so a crash after commit cannot drop hints and a retry cannot invent a second
inbox. Hint claims use the same lease/fence pattern as ops.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Mapping, Optional, Sequence
from uuid import uuid4

from app.services.trackers.schema import FORBIDDEN_COLUMNS

HINT_STATES = ("pending", "applied", "ignored", "failed")
CHECKPOINT_KINDS = ("poll", "sweep", "recovery")


class StaleHintFence(RuntimeError):
    """Caller fence no longer owns the hint or checkpoint."""


def apply_schema(conn: Any) -> None:
    """Create inbox and checkpoint tables if missing. Restart-safe."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS remote_deliveries (
            connector_id TEXT NOT NULL,
            delivery_id TEXT NOT NULL,
            received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (connector_id, delivery_id)
        );
        CREATE TABLE IF NOT EXISTS remote_hints (
            id TEXT PRIMARY KEY,
            connector_id TEXT NOT NULL,
            delivery_id TEXT NOT NULL,
            object_kind TEXT NOT NULL,
            remote_container_id TEXT NOT NULL,
            external_id TEXT,
            external_comment_id TEXT,
            event TEXT NOT NULL,
            actor_id TEXT,
            actor_login TEXT,
            received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            state TEXT NOT NULL DEFAULT 'pending',
            applied_at TIMESTAMPTZ,
            error JSONB,
            claimed_by TEXT,
            lease_expires_at TIMESTAMPTZ,
            fence INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (connector_id, delivery_id)
                REFERENCES remote_deliveries (connector_id, delivery_id)
        );
        CREATE INDEX IF NOT EXISTS remote_hints_pending
            ON remote_hints(state, received_at, id);
        CREATE INDEX IF NOT EXISTS remote_hints_delivery
            ON remote_hints(connector_id, delivery_id);
        CREATE TABLE IF NOT EXISTS sync_checkpoints (
            kind TEXT NOT NULL,
            scope_key TEXT NOT NULL,
            cursor JSONB,
            page_cursor TEXT,
            last_success_at TIMESTAMPTZ,
            last_error JSONB,
            next_run_at TIMESTAMPTZ,
            claimed_by TEXT,
            lease_expires_at TIMESTAMPTZ,
            fence INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (kind, scope_key)
        );
        """,
        prepare=False,
    )


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


class InboxStore:
    """Caller-connection inbound inbox. Delivery + hints are one transaction."""

    def __init__(self, conn: Any) -> None:
        self.conn = conn

    def enqueue(
        self,
        *,
        connector_id: str,
        delivery_id: str,
        hints: Sequence[Mapping[str, Any]],
    ) -> dict:
        """Persist a verified delivery and its hints atomically.

        ``created`` is True only for the first receipt of this delivery id.
        """

        inserted = self.conn.execute(
            """
            INSERT INTO remote_deliveries (connector_id, delivery_id)
            VALUES (%s, %s)
            ON CONFLICT (connector_id, delivery_id) DO NOTHING
            RETURNING delivery_id
            """,
            (connector_id, delivery_id),
        ).fetchone()
        if inserted is None:
            return {
                "created": False,
                "hints": self.list_delivery(connector_id, delivery_id),
            }
        stored: list[dict] = []
        for hint in hints:
            hint_id = str(hint.get("id") or f"hint_{uuid4().hex[:12]}")
            actor = hint.get("actor") or {}
            self.conn.execute(
                """
                INSERT INTO remote_hints (
                    id, connector_id, delivery_id, object_kind, remote_container_id,
                    external_id, external_comment_id, event, actor_id, actor_login
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    hint_id,
                    connector_id,
                    delivery_id,
                    str(hint.get("objectKind") or hint.get("object_kind") or "issue"),
                    str(hint.get("remoteContainerId") or hint.get("remote_container_id") or ""),
                    hint.get("externalId") or hint.get("external_id"),
                    hint.get("externalCommentId") or hint.get("external_comment_id"),
                    str(hint.get("event") or "updated"),
                    actor.get("id") or hint.get("actor_id"),
                    actor.get("login") or hint.get("actor_login"),
                ),
            )
            stored.append(self.get_hint(hint_id))
        return {"created": True, "hints": stored}

    def list_delivery(self, connector_id: str, delivery_id: str) -> list[dict]:
        rows = self.conn.execute(
            """
            SELECT * FROM remote_hints
            WHERE connector_id = %s AND delivery_id = %s
            ORDER BY received_at ASC, id ASC
            """,
            (connector_id, delivery_id),
        ).fetchall()
        return [_dump(row) for row in rows]  # type: ignore[misc]

    def get_hint(self, hint_id: str) -> dict:
        row = self.conn.execute(
            "SELECT * FROM remote_hints WHERE id = %s", (hint_id,)
        ).fetchone()
        payload = _dump(row)
        if payload is None:
            raise KeyError(hint_id)
        return payload

    def claim_hint(self, worker_id: str, *, lease_seconds: int = 60) -> Optional[dict]:
        if lease_seconds < 1:
            raise ValueError("lease_seconds must be at least 1")
        row = self.conn.execute(
            """
            SELECT *
            FROM remote_hints
            WHERE state = 'pending'
              AND (claimed_by IS NULL OR lease_expires_at IS NULL OR lease_expires_at < NOW())
            ORDER BY received_at ASC, id ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
            """,
        ).fetchone()
        if not row:
            return None
        old_fence = int(row["fence"] or 0)
        fence = old_fence + 1
        claimed = self.conn.execute(
            """
            UPDATE remote_hints
            SET claimed_by = %s,
                lease_expires_at = NOW() + (%s * INTERVAL '1 second'),
                fence = %s
            WHERE id = %s AND fence = %s AND state = 'pending'
            RETURNING *
            """,
            (worker_id, lease_seconds, fence, row["id"], old_fence),
        ).fetchone()
        return _dump(claimed)

    def finish_hint(self, hint_id: str, fence: int, *, state: str) -> dict:
        if state not in ("applied", "ignored", "failed"):
            raise ValueError(f"invalid hint terminal state: {state}")
        row = self.conn.execute(
            """
            UPDATE remote_hints
            SET state = %s,
                applied_at = NOW(),
                claimed_by = NULL,
                lease_expires_at = NULL
            WHERE id = %s AND fence = %s AND state = 'pending'
            RETURNING *
            """,
            (state, hint_id, fence),
        ).fetchone()
        if row is None:
            raise StaleHintFence(f"hint {hint_id} fence {fence} cannot become {state}")
        payload = _dump(row)
        assert payload is not None
        return payload

    def upsert_checkpoint(
        self,
        *,
        kind: str,
        scope_key: str,
        cursor: Mapping[str, Any] | None = None,
        page_cursor: str | None = None,
    ) -> dict:
        if kind not in CHECKPOINT_KINDS:
            raise ValueError(f"unknown checkpoint kind: {kind}")
        self.conn.execute(
            """
            INSERT INTO sync_checkpoints (kind, scope_key, cursor, page_cursor, last_success_at)
            VALUES (%s, %s, %s::jsonb, %s, NOW())
            ON CONFLICT (kind, scope_key) DO UPDATE SET
                cursor = COALESCE(EXCLUDED.cursor, sync_checkpoints.cursor),
                page_cursor = COALESCE(EXCLUDED.page_cursor, sync_checkpoints.page_cursor),
                last_success_at = NOW()
            """,
            (kind, scope_key, json.dumps(dict(cursor or {})), page_cursor),
        )
        row = self.conn.execute(
            "SELECT * FROM sync_checkpoints WHERE kind = %s AND scope_key = %s",
            (kind, scope_key),
        ).fetchone()
        payload = _dump(row)
        assert payload is not None
        return payload

    def claim_checkpoint(
        self,
        *,
        kind: str,
        scope_key: str,
        worker_id: str,
        lease_seconds: int = 60,
    ) -> Optional[dict]:
        if kind not in CHECKPOINT_KINDS:
            raise ValueError(f"unknown checkpoint kind: {kind}")
        self.conn.execute(
            """
            INSERT INTO sync_checkpoints (kind, scope_key)
            VALUES (%s, %s)
            ON CONFLICT (kind, scope_key) DO NOTHING
            """,
            (kind, scope_key),
        )
        row = self.conn.execute(
            """
            SELECT *
            FROM sync_checkpoints
            WHERE kind = %s AND scope_key = %s
              AND (claimed_by IS NULL OR lease_expires_at IS NULL OR lease_expires_at < NOW())
            FOR UPDATE SKIP LOCKED
            """,
            (kind, scope_key),
        ).fetchone()
        if not row:
            return None
        old_fence = int(row["fence"] or 0)
        fence = old_fence + 1
        claimed = self.conn.execute(
            """
            UPDATE sync_checkpoints
            SET claimed_by = %s,
                lease_expires_at = NOW() + (%s * INTERVAL '1 second'),
                fence = %s
            WHERE kind = %s AND scope_key = %s AND fence = %s
            RETURNING *
            """,
            (worker_id, lease_seconds, fence, kind, scope_key, old_fence),
        ).fetchone()
        return _dump(claimed)
