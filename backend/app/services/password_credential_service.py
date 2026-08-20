"""Local password credentials keyed by Prism ``user_id``.

Identity lives in ``access_service.users``. This module only stores a bcrypt
hash and the must-change flag. Plaintext never touches the database or a log.
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone

import bcrypt

from app.core.config import settings
from app.services import access_service
from app.services.postgres_database import database


_init_lock = threading.Lock()
_initialized = False

_MAX_PASSWORD_BYTES = 72


def _now() -> datetime:
    return datetime.now(timezone.utc)


def initialize_credential_store() -> None:
    global _initialized
    if _initialized:
        return
    with _init_lock:
        if _initialized:
            return
        access_service.initialize_role_store()
        with database.connection() as connection:
            connection.execute("CREATE SCHEMA IF NOT EXISTS workspace")
            connection.execute("SET search_path TO workspace, public")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS user_credentials (
                    user_id TEXT PRIMARY KEY REFERENCES workspace.users (user_id) ON DELETE CASCADE,
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


class NoSuchUserError(ValueError):
    """Raised when an admin tries to set a password on an email with no account."""


def validate_password_policy(password: str) -> None:
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


def _checkpw(password: bytes, hashed: bytes) -> bool:
    try:
        return bcrypt.checkpw(password, hashed)
    except ValueError:
        return False


def set_password_for_user_id(
    user_id: str,
    password: str,
    *,
    updated_by: str,
    must_change: bool = False,
) -> None:
    validate_password_policy(password)
    initialize_credential_store()
    password_hash = _hash_password(password)
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        connection.execute(
            """
            INSERT INTO user_credentials (user_id, password_hash, must_change_password, updated_by)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (user_id) DO UPDATE
                SET password_hash = EXCLUDED.password_hash,
                    must_change_password = EXCLUDED.must_change_password,
                    updated_at = NOW(),
                    updated_by = EXCLUDED.updated_by
            """,
            (user_id, password_hash, must_change, updated_by),
        )
        connection.commit()


def set_password(
    email: str,
    password: str,
    *,
    updated_by: str,
    must_change: bool = False,
    create_user: bool = False,
) -> None:
    """Create or replace a password for the Prism user with this email.

    ``create_user`` is only for bootstrap seeding. Admin reset requires an
    existing account (role assignment or prior user row).
    """
    if create_user:
        user = access_service.upsert_user(email=email)
    else:
        user = access_service.get_user_by_email(email)
        if user is None:
            raise NoSuchUserError(
                "No Prism account for this email. Assign a role first."
            )
    set_password_for_user_id(
        user["user_id"],
        password,
        updated_by=updated_by,
        must_change=must_change,
    )


def _load_credential(user_id: str) -> dict | None:
    initialize_credential_store()
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        row = connection.execute(
            """
            SELECT password_hash, must_change_password
            FROM user_credentials
            WHERE user_id = %s
            """,
            (user_id,),
        ).fetchone()
    return dict(row) if row else None


def has_credential(email: str) -> bool:
    user = access_service.get_user_by_email(email)
    if user is None:
        return False
    return _load_credential(user["user_id"]) is not None


class PasswordVerification:
    __slots__ = ("ok", "must_change", "user_id")

    def __init__(self, ok: bool, must_change: bool = False, user_id: str = "") -> None:
        self.ok = ok
        self.must_change = must_change
        self.user_id = user_id


_DUMMY_HASH = bcrypt.hashpw(b"kicad-prism-timing-equalizer", bcrypt.gensalt())


def verify_password(email: str, password: str) -> PasswordVerification:
    """Check a password in constant time for both unknown emails and misses."""
    user = access_service.get_user_by_email(email)
    encoded = password.encode("utf-8")
    if user is None:
        _checkpw(encoded, _DUMMY_HASH)
        return PasswordVerification(ok=False)
    credential = _load_credential(user["user_id"])
    if credential is None:
        _checkpw(encoded, _DUMMY_HASH)
        return PasswordVerification(ok=False)
    matched = _checkpw(encoded, credential["password_hash"].encode("ascii"))
    return PasswordVerification(
        ok=matched,
        must_change=bool(matched and credential["must_change_password"]),
        user_id=user["user_id"] if matched else "",
    )


def clear_must_change(user_id: str) -> None:
    initialize_credential_store()
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        connection.execute(
            """
            UPDATE user_credentials
            SET must_change_password = FALSE, updated_at = NOW()
            WHERE user_id = %s
            """,
            (user_id,),
        )
        connection.commit()


def delete_credential(email: str) -> bool:
    user = access_service.get_user_by_email(email)
    if user is None:
        return False
    initialize_credential_store()
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        result = connection.execute(
            "DELETE FROM user_credentials WHERE user_id = %s",
            (user["user_id"],),
        )
        connection.commit()
        return bool(result.rowcount)


def list_credentialed_emails() -> list[str]:
    initialize_credential_store()
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        rows = connection.execute(
            """
            SELECT u.email
            FROM user_credentials c
            JOIN users u ON u.user_id = c.user_id
            ORDER BY u.email
            """
        ).fetchall()
    return [str(row["email"]) for row in rows]


def seed_bootstrap_admins() -> list[str]:
    """Seed a one-time password for bootstrap admins that have none yet."""
    if not settings.PASSWORD_AUTH_ENABLED:
        return []
    seed_password = settings.BOOTSTRAP_ADMIN_PASSWORD.strip()
    if not seed_password:
        return []

    admins = [email.strip().lower() for email in settings.BOOTSTRAP_ADMIN_USERS if email.strip()]
    if not admins:
        return []

    validate_password_policy(seed_password)

    seeded: list[str] = []
    for email in admins:
        if has_credential(email):
            continue
        set_password(
            email,
            seed_password,
            updated_by="bootstrap",
            must_change=True,
            create_user=True,
        )
        seeded.append(email)
    return seeded
