"""Shared sliding-window rate limiting for authentication endpoints.

Backed by PostgreSQL so the limit holds across every uvicorn worker rather than
being divided among them. Only low-traffic credential endpoints use this; it is
deliberately not on the hot read path.
"""

from __future__ import annotations

import logging
import threading
from typing import Any

from fastapi import HTTPException, Request

from app.services.postgres_database import database

logger = logging.getLogger(__name__)

_init_lock = threading.Lock()
_initialized = False


def initialize_rate_limit_store() -> None:
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
                CREATE TABLE IF NOT EXISTS auth_rate_limit (
                    id BIGSERIAL PRIMARY KEY,
                    bucket TEXT NOT NULL,
                    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS auth_rate_limit_bucket_idx "
                "ON auth_rate_limit (bucket, occurred_at)"
            )
            connection.commit()
        _initialized = True


def client_fingerprint(request: Request) -> str:
    """Identify the caller for limiting purposes.

    Prism runs behind its own reverse proxy, so the left-most X-Forwarded-For entry
    is the closest available thing to a client address. It is spoofable by anyone
    who can reach the backend directly, which is why this is defence in depth
    rather than an access control.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()[:128]
    return (request.client.host if request.client else "unknown")[:128]


def enforce(bucket: str, *, limit: int, window_seconds: int) -> None:
    """Record an attempt and raise 429 once the window's limit is exceeded."""
    try:
        initialize_rate_limit_store()
        with database.connection() as connection:
            connection.execute("SET search_path TO workspace, public")
            connection.execute(
                "DELETE FROM auth_rate_limit WHERE occurred_at < NOW() - make_interval(secs => %s)",
                (window_seconds,),
            )
            row: dict[str, Any] = connection.execute(
                """
                INSERT INTO auth_rate_limit (bucket) VALUES (%s)
                RETURNING (
                    SELECT COUNT(*) FROM auth_rate_limit
                    WHERE bucket = %s AND occurred_at >= NOW() - make_interval(secs => %s)
                ) AS attempts
                """,
                (bucket, bucket, window_seconds),
            ).fetchone()
            connection.commit()
    except HTTPException:
        raise
    except Exception:
        # Fail closed. This used to allow the request so that a limiter outage
        # could not take authentication down with it, but the limiter's store is
        # the application database: if it is unreachable, sessions, users and
        # roles are unreachable too and the request was going to fail anyway.
        # Allowing it bought no availability and removed brute-force protection
        # for exactly as long as the database was unwell.
        logger.exception("Rate limit store unavailable for bucket %s; refusing the request", bucket)
        raise HTTPException(
            status_code=503,
            detail="Authentication is temporarily unavailable. Try again shortly.",
            headers={"Retry-After": "30"},
        ) from None

    if int(row["attempts"]) > limit:
        raise HTTPException(
            status_code=429,
            detail="Too many authentication attempts. Try again shortly.",
            headers={"Retry-After": str(window_seconds)},
        )


def clear(bucket: str) -> None:
    """Drop a bucket's history after a successful authentication."""
    try:
        initialize_rate_limit_store()
        with database.connection() as connection:
            connection.execute("SET search_path TO workspace, public")
            connection.execute("DELETE FROM auth_rate_limit WHERE bucket = %s", (bucket,))
            connection.commit()
    except Exception:
        logger.exception("Failed to clear rate limit bucket %s", bucket)
