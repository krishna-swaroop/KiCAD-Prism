"""Local username/password credentials.

Identity (does this person hold the password?) is stored here; authorization
(what may they do?) stays in ``access_service`` keyed by the same email, exactly
as it is for OIDC. So a password login and an OIDC login for the same address
resolve to the same role and the same session machinery.

Passwords are stored only as bcrypt hashes. Plaintext never touches the database
or a log line, and verification is constant-time by construction.
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone

import bcrypt

from app.core.config import settings
from app.services.postgres_database import database


_init_lock = threading.Lock()
_initialized = False

# bcrypt truncates silently at 72 bytes; refuse longer inputs rather than let two
# distinct long passwords collide on their first 72 bytes.
_MAX_PASSWORD_BYTES = 72


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def initialize_credential_store() -> None:
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
                CREATE TABLE IF NOT EXISTS user_credentials (
                    email TEXT PRIMARY KEY,
                    password_hash TEXT NOT NULL,
                    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_by TEXT NOT NULL
                )
                """
            )
            connection.commit()
        _initialized = True


class PasswordPolicyError(ValueError):
    """Raised when a proposed password does not meet the configured policy."""


def validate_password_policy(password: str) -> None:
    """Enforce the server-side minimums. Raises PasswordPolicyError on failure."""
    if len(password.encode("utf-8")) > _MAX_PASSWORD_BYTES:
        raise PasswordPolicyError(
            f"Password must be at most {_MAX_PASSWORD_BYTES} bytes long."
        )
    minimum = int(settings.PASSWORD_MIN_LENGTH)
    if len(password) < minimum:
        raise PasswordPolicyError(
            f"Password must be at least {minimum} characters long."
        )


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def set_password(
    email: str,
    password: str,
    *,
    updated_by: str,
    must_change: bool = False,
) -> None:
    """Create or replace a user's password credential.

    ``must_change`` forces a change on the user's next login, used when an admin
    sets or resets a password so the admin's chosen value is never a lasting
    secret.
    """
    normalized = _normalize_email(email)
    if not normalized:
        raise PasswordPolicyError("An email address is required.")
    validate_password_policy(password)

    initialize_credential_store()
    password_hash = _hash_password(password)
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        connection.execute(
            """
            INSERT INTO user_credentials (email, password_hash, must_change_password, updated_by)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (email) DO UPDATE
                SET password_hash = EXCLUDED.password_hash,
                    must_change_password = EXCLUDED.must_change_password,
                    updated_at = NOW(),
                    updated_by = EXCLUDED.updated_by
            """,
            (normalized, password_hash, must_change, updated_by),
        )
        connection.commit()


def _load_credential(normalized_email: str) -> dict | None:
    initialize_credential_store()
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        row = connection.execute(
            """
            SELECT password_hash, must_change_password
            FROM user_credentials
            WHERE email = %s
            """,
            (normalized_email,),
        ).fetchone()
    return dict(row) if row else None


def has_credential(email: str) -> bool:
    return _load_credential(_normalize_email(email)) is not None


class PasswordVerification:
    """Result of verifying a password: whether it matched and whether a change is due."""

    __slots__ = ("ok", "must_change")

    def __init__(self, ok: bool, must_change: bool = False) -> None:
        self.ok = ok
        self.must_change = must_change


# A fixed bcrypt hash of a random value, used to spend the same work verifying a
# password for an email that has no credential as for one that does. Without it,
# the absence of a row is observable through timing and leaks which emails exist.
_DUMMY_HASH = bcrypt.hashpw(b"kicad-prism-timing-equalizer", bcrypt.gensalt())


def verify_password(email: str, password: str) -> PasswordVerification:
    """Check a password against the stored hash in constant time.

    Returns ok=False for both an unknown email and a wrong password, and takes
    the same time in both cases, so the response cannot be used to enumerate
    which addresses have credentials.
    """
    credential = _load_credential(_normalize_email(email))
    encoded = password.encode("utf-8")
    if credential is None:
        # Still spend the hashing cost so the timing matches a real check.
        bcrypt.checkpw(encoded, _DUMMY_HASH)
        return PasswordVerification(ok=False)
    matched = bcrypt.checkpw(encoded, credential["password_hash"].encode("utf-8"))
    return PasswordVerification(
        ok=matched,
        must_change=bool(matched and credential["must_change_password"]),
    )


def clear_must_change(email: str) -> None:
    normalized = _normalize_email(email)
    initialize_credential_store()
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        connection.execute(
            "UPDATE user_credentials SET must_change_password = FALSE, updated_at = NOW() WHERE email = %s",
            (normalized,),
        )
        connection.commit()


def delete_credential(email: str) -> bool:
    normalized = _normalize_email(email)
    initialize_credential_store()
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        result = connection.execute(
            "DELETE FROM user_credentials WHERE email = %s",
            (normalized,),
        )
        connection.commit()
        return bool(result.rowcount)


def list_credentialed_emails() -> list[str]:
    """Every email that has a local password, for the admin user list."""
    initialize_credential_store()
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        rows = connection.execute(
            "SELECT email FROM user_credentials ORDER BY email"
        ).fetchall()
    return [str(row["email"]) for row in rows]
