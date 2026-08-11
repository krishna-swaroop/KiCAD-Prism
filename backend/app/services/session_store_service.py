"""Revocable server-side browser sessions.

The session cookie carries only an opaque session id. Identity, expiry, and
revocation live in PostgreSQL, so signing out actually terminates a session and
an administrator can terminate someone else's.

Only a SHA-256 digest of the session id is persisted. A database dump therefore
does not yield usable cookies.
"""

from __future__ import annotations

import hashlib
import secrets
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.config import settings
from app.services.postgres_database import database

_init_lock = threading.Lock()
_initialized = False

# Writing last_seen_at on every request would add a write per API call. A session
# is only touched when its recorded activity is older than this.
_TOUCH_INTERVAL_SECONDS = 60


@dataclass(frozen=True)
class SessionRecord:
    session_id: str
    email: str
    name: str
    picture: str
    created_at: datetime
    expires_at: datetime
    last_seen_at: datetime


def _now() -> datetime:
    return datetime.now(timezone.utc)


def session_id_digest(session_id: str) -> str:
    return hashlib.sha256(session_id.encode("utf-8")).hexdigest()


def initialize_session_store() -> None:
    global _initialized
    if _initialized:
        return
    with _init_lock:
        if _initialized:
            return
        with database.connection() as connection:
            connection.execute("CREATE SCHEMA IF NOT EXISTS workspace")
            connection.execute("SET search_path TO workspace, public")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS user_sessions (
                    session_digest TEXT PRIMARY KEY,
                    email TEXT NOT NULL,
                    name TEXT NOT NULL DEFAULT '',
                    picture TEXT NOT NULL DEFAULT '',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    expires_at TIMESTAMPTZ NOT NULL,
                    revoked_at TIMESTAMPTZ,
                    revoked_reason TEXT NOT NULL DEFAULT '',
                    user_agent TEXT NOT NULL DEFAULT '',
                    client_ip TEXT NOT NULL DEFAULT ''
                )
                """
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS user_sessions_email_idx ON user_sessions (email)"
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS user_sessions_expires_idx ON user_sessions (expires_at)"
            )
            connection.commit()
        _initialized = True


def _row_to_record(row: dict[str, Any], session_id: str) -> SessionRecord:
    return SessionRecord(
        session_id=session_id,
        email=str(row["email"]),
        name=str(row["name"] or ""),
        picture=str(row["picture"] or ""),
        created_at=row["created_at"],
        expires_at=row["expires_at"],
        last_seen_at=row["last_seen_at"],
    )


def create_session(
    *,
    email: str,
    name: str,
    picture: str,
    user_agent: str = "",
    client_ip: str = "",
) -> tuple[str, SessionRecord]:
    """Mint a new session and return its secret id alongside the stored record."""
    initialize_session_store()
    session_id = secrets.token_urlsafe(32)
    expires_at = _now() + timedelta(hours=settings.SESSION_TTL_HOURS)

    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        row = connection.execute(
            """
            INSERT INTO user_sessions
                (session_digest, email, name, picture, expires_at, user_agent, client_ip)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING email, name, picture, created_at, last_seen_at, expires_at
            """,
            (
                session_id_digest(session_id),
                email.strip().lower(),
                name,
                picture,
                expires_at,
                user_agent[:512],
                client_ip[:128],
            ),
        ).fetchone()
        connection.commit()

    return session_id, _row_to_record(row, session_id)


def load_session(session_id: str) -> SessionRecord | None:
    """Return the live session for this id, or None when it must not authenticate."""
    if not session_id:
        return None
    initialize_session_store()

    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        row = connection.execute(
            """
            SELECT email, name, picture, created_at, last_seen_at, expires_at, revoked_at
            FROM user_sessions
            WHERE session_digest = %s
            """,
            (session_id_digest(session_id),),
        ).fetchone()

        if row is None or row["revoked_at"] is not None:
            return None

        now = _now()
        if row["expires_at"] <= now:
            return None

        idle_minutes = settings.SESSION_IDLE_TIMEOUT_MINUTES
        if idle_minutes and row["last_seen_at"] + timedelta(minutes=idle_minutes) <= now:
            connection.execute(
                """
                UPDATE user_sessions
                SET revoked_at = NOW(), revoked_reason = 'idle_timeout'
                WHERE session_digest = %s AND revoked_at IS NULL
                """,
                (session_id_digest(session_id),),
            )
            connection.commit()
            return None

        if (now - row["last_seen_at"]).total_seconds() >= _TOUCH_INTERVAL_SECONDS:
            connection.execute(
                "UPDATE user_sessions SET last_seen_at = NOW() WHERE session_digest = %s",
                (session_id_digest(session_id),),
            )
            connection.commit()

        return _row_to_record(row, session_id)


def revoke_session(session_id: str, *, reason: str = "logout") -> bool:
    if not session_id:
        return False
    initialize_session_store()
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        cursor = connection.execute(
            """
            UPDATE user_sessions
            SET revoked_at = NOW(), revoked_reason = %s
            WHERE session_digest = %s AND revoked_at IS NULL
            """,
            (reason, session_id_digest(session_id)),
        )
        connection.commit()
        return cursor.rowcount > 0


def revoke_sessions_for_email(email: str, *, reason: str = "revoked", keep_session_id: str = "") -> int:
    """Terminate every session for an account, optionally sparing the caller's own."""
    initialize_session_store()
    keep_digest = session_id_digest(keep_session_id) if keep_session_id else ""
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        cursor = connection.execute(
            """
            UPDATE user_sessions
            SET revoked_at = NOW(), revoked_reason = %s
            WHERE email = %s AND revoked_at IS NULL AND session_digest <> %s
            """,
            (reason, email.strip().lower(), keep_digest),
        )
        connection.commit()
        return cursor.rowcount


def list_sessions(email: str) -> list[dict[str, Any]]:
    initialize_session_store()
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        rows = connection.execute(
            """
            SELECT session_digest, created_at, last_seen_at, expires_at, user_agent, client_ip
            FROM user_sessions
            WHERE email = %s AND revoked_at IS NULL AND expires_at > NOW()
            ORDER BY last_seen_at DESC
            """,
            (email.strip().lower(),),
        ).fetchall()

    return [
        {
            # The digest is safe to expose; the secret id never leaves the cookie.
            "id": str(row["session_digest"])[:16],
            "created_at": row["created_at"].isoformat(),
            "last_seen_at": row["last_seen_at"].isoformat(),
            "expires_at": row["expires_at"].isoformat(),
            "user_agent": str(row["user_agent"] or ""),
            "client_ip": str(row["client_ip"] or ""),
        }
        for row in rows
    ]


def prune_expired_sessions(*, retain_days: int = 30) -> int:
    """Delete rows that can no longer authenticate and are past their audit window."""
    initialize_session_store()
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        cursor = connection.execute(
            """
            DELETE FROM user_sessions
            WHERE expires_at < NOW() - make_interval(days => %s)
               OR (revoked_at IS NOT NULL AND revoked_at < NOW() - make_interval(days => %s))
            """,
            (retain_days, retain_days),
        )
        connection.commit()
        return cursor.rowcount
