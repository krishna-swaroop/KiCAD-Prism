"""Durable store for idempotent write replay (ADR scripting-and-mcp §3.4).

One row per ``(caller, operation, key)``. A request first claims a ``pending``
row; the winner runs the write and records the response, while a loser either
rejects a different request (422), waits (409), or replays the stored response.
A pending row is held for ``PENDING_LEASE_SECONDS``; one that outlives it lost
its worker and counts as absent, so a retry claims the key again. Rows older
than 24 hours count as absent and are swept, so a key becomes usable again after
the retention window.
"""

from __future__ import annotations

from typing import Any

from psycopg.types.json import Jsonb

from app.services.postgres_database import database

STATE_PENDING = "pending"
STATE_DONE = "done"
RETENTION_SECONDS = 24 * 60 * 60
# Counted from the claim, with no heartbeat or owner: a write running longer than this could be
# retried while it runs, and its later complete/release would act on the retry's claim.
PENDING_LEASE_SECONDS = 10 * 60


def _delete_expired(connection: Any, caller: str, operation: str, key: str) -> None:
    """Drop rows past retention, and pending claims whose worker never answered."""

    connection.execute("SET search_path TO workspace, public")
    connection.execute(
        """
        DELETE FROM ws_idempotency_keys
        WHERE caller = %s AND operation = %s AND key = %s
          AND (
            created_at < NOW() - make_interval(secs => %s)
            OR (state = %s AND created_at < NOW() - make_interval(secs => %s))
          )
        """,
        (caller, operation, key, RETENTION_SECONDS, STATE_PENDING, PENDING_LEASE_SECONDS),
    )


def claim(caller: str, operation: str, key: str, request_hash: str) -> bool:
    """Insert a ``pending`` row unless one exists, and report whether this call won."""

    with database.connection() as connection:
        _delete_expired(connection, caller, operation, key)
        row = connection.execute(
            """
            INSERT INTO ws_idempotency_keys (caller, operation, key, request_hash, state)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (caller, operation, key) DO NOTHING
            RETURNING 1
            """,
            (caller, operation, key, request_hash, STATE_PENDING),
        ).fetchone()
        connection.commit()
        return row is not None


def read(caller: str, operation: str, key: str) -> dict[str, Any] | None:
    """The live row for a key, or ``None`` when it is absent or past its hold."""

    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        return connection.execute(
            """
            SELECT request_hash, state, status_code, headers, body
            FROM ws_idempotency_keys
            WHERE caller = %s AND operation = %s AND key = %s
              AND created_at >= NOW() - make_interval(secs => %s)
              AND (state <> %s OR created_at >= NOW() - make_interval(secs => %s))
            """,
            (
                caller,
                operation,
                key,
                RETENTION_SECONDS,
                STATE_PENDING,
                PENDING_LEASE_SECONDS,
            ),
        ).fetchone()


def complete(
    caller: str,
    operation: str,
    key: str,
    status_code: int,
    headers: list[list[str]],
    body: bytes,
) -> None:
    """Record the winning response on its still-pending claim."""

    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        connection.execute(
            """
            UPDATE ws_idempotency_keys
            SET state = %s, status_code = %s, headers = %s, body = %s
            WHERE caller = %s AND operation = %s AND key = %s AND state = %s
            """,
            (
                STATE_DONE,
                status_code,
                Jsonb(headers),
                body,
                caller,
                operation,
                key,
                STATE_PENDING,
            ),
        )
        connection.commit()


def release(caller: str, operation: str, key: str) -> None:
    """Drop a claim so a retry runs the write again."""

    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        connection.execute(
            "DELETE FROM ws_idempotency_keys WHERE caller = %s AND operation = %s AND key = %s",
            (caller, operation, key),
        )
        connection.commit()


def sweep_expired() -> int:
    """Delete rows past the 24 hour retention window; return how many went."""

    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        deleted = connection.execute(
            "DELETE FROM ws_idempotency_keys WHERE created_at < NOW() - make_interval(secs => %s)",
            (RETENTION_SECONDS,),
        ).rowcount
        connection.commit()
        return int(deleted or 0)
