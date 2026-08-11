from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from app.core.config import settings
from app.core.roles import normalize_role

SECRET_PREFIX = "kp_sc_"
PBKDF2_ITERATIONS = 260_000


def _db():
    """Lazy import to avoid circular imports at module load time."""
    from app.services.component_catalog_service import catalog_service  # noqa: PLC0415

    return catalog_service


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().isoformat()


def _now() -> int:
    return int(time.time())


def _b64_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64_decode(value: str) -> bytes:
    pad = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode((value + pad).encode("ascii"))


def _sign(message: str) -> str:
    if not settings.SESSION_SECRET:
        raise HTTPException(status_code=500, detail="SESSION_SECRET is required for OAuth2 service tokens")
    digest = hmac.new(settings.SESSION_SECRET.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).digest()
    return _b64_encode(digest)


def _encode_payload(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    encoded = _b64_encode(raw)
    return f"v1.{encoded}.{_sign(encoded)}"


def _decode_payload(token: str) -> dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3 or parts[0] != "v1":
        raise HTTPException(status_code=401, detail="Invalid service token")
    encoded, signature = parts[1], parts[2]
    if not hmac.compare_digest(signature, _sign(encoded)):
        raise HTTPException(status_code=401, detail="Invalid service token signature")
    try:
        payload = json.loads(_b64_decode(encoded).decode("utf-8"))
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=401, detail="Invalid service token payload") from exc
    if payload.get("type") != "service_access":
        raise HTTPException(status_code=401, detail="Invalid service token type")
    if int(payload.get("exp", 0)) <= _now():
        raise HTTPException(status_code=401, detail="Service token expired")
    return payload


def _hash_secret(secret: str, salt: str | None = None) -> str:
    salt_value = salt or secrets.token_urlsafe(18)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        secret.encode("utf-8"),
        salt_value.encode("utf-8"),
        PBKDF2_ITERATIONS,
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt_value}${_b64_encode(digest)}"


def _verify_secret(secret: str, stored_hash: str) -> bool:
    try:
        scheme, iterations, salt, digest = stored_hash.split("$", 3)
    except ValueError:
        return False
    if scheme != "pbkdf2_sha256" or int(iterations) != PBKDF2_ITERATIONS:
        return False
    expected = _hash_secret(secret, salt).split("$", 3)[3]
    return hmac.compare_digest(expected, digest)


def _public_client(row: dict[str, Any]) -> dict[str, Any]:
    scopes = row.get("scopes") or []
    if isinstance(scopes, str):
        try:
            scopes = json.loads(scopes)
        except json.JSONDecodeError:
            scopes = []
    return {
        "client_id": row["client_id"],
        "name": row["name"],
        "role": row["role"],
        "scopes": list(scopes),
        "enabled": bool(row["enabled"]),
        "created_at": str(row["created_at"] or ""),
        "updated_at": str(row["updated_at"] or ""),
        "last_used_at": str(row["last_used_at"]) if row.get("last_used_at") else None,
    }


def create_service_client(*, name: str, role: str, scopes: list[str]) -> dict[str, Any]:
    normalized_role = normalize_role(role)
    if not normalized_role:
        raise HTTPException(status_code=400, detail="Invalid service-client role")

    client_id = f"prism_{secrets.token_urlsafe(12)}"
    client_secret = f"{SECRET_PREFIX}{secrets.token_urlsafe(32)}"
    now = _utc_now_iso()
    with _db()._connect() as conn:  # noqa: SLF001 - shared catalog DB owns auth tables.
        conn.execute(
            """
            INSERT INTO oauth_service_clients
                (client_id, name, secret_hash, role, scopes, enabled, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, 1, %s, %s)
            """,
            (
                client_id,
                name.strip() or client_id,
                _hash_secret(client_secret),
                normalized_role,
                json.dumps(scopes, separators=(",", ":")),
                now,
                now,
            ),
        )
        row = conn.execute(
            """
            SELECT client_id, name, role, scopes, enabled, created_at, updated_at, last_used_at
            FROM oauth_service_clients
            WHERE client_id = %s
            """,
            (client_id,),
        ).fetchone()
        conn.commit()
    payload = _public_client(dict(row))
    payload["client_secret"] = client_secret
    return payload


def list_service_clients() -> list[dict[str, Any]]:
    with _db()._connect() as conn:  # noqa: SLF001
        rows = conn.execute(
            """
            SELECT client_id, name, role, scopes, enabled, created_at, updated_at, last_used_at
            FROM oauth_service_clients
            ORDER BY created_at DESC
            """
        ).fetchall()
    return [_public_client(dict(row)) for row in rows]


def rotate_service_client_secret(client_id: str) -> dict[str, Any]:
    client_secret = f"{SECRET_PREFIX}{secrets.token_urlsafe(32)}"
    now = _utc_now_iso()
    with _db()._connect() as conn:  # noqa: SLF001
        conn.execute(
            """
            UPDATE oauth_service_clients
            SET secret_hash = %s, updated_at = %s
            WHERE client_id = %s
            """,
            (_hash_secret(client_secret), now, client_id),
        )
        row = conn.execute(
            """
            SELECT client_id, name, role, scopes, enabled, created_at, updated_at, last_used_at
            FROM oauth_service_clients
            WHERE client_id = %s
            """,
            (client_id,),
        ).fetchone()
        conn.commit()
    if not row:
        raise HTTPException(status_code=404, detail="Service client not found")
    payload = _public_client(dict(row))
    payload["client_secret"] = client_secret
    return payload


def set_service_client_enabled(client_id: str, enabled: bool) -> dict[str, Any]:
    now = _utc_now_iso()
    with _db()._connect() as conn:  # noqa: SLF001
        conn.execute(
            """
            UPDATE oauth_service_clients
            SET enabled = %s, updated_at = %s
            WHERE client_id = %s
            """,
            (1 if enabled else 0, now, client_id),
        )
        row = conn.execute(
            """
            SELECT client_id, name, role, scopes, enabled, created_at, updated_at, last_used_at
            FROM oauth_service_clients
            WHERE client_id = %s
            """,
            (client_id,),
        ).fetchone()
        conn.commit()
    if not row:
        raise HTTPException(status_code=404, detail="Service client not found")
    return _public_client(dict(row))


def delete_service_client(client_id: str) -> bool:
    with _db()._connect() as conn:  # noqa: SLF001
        result = conn.execute("DELETE FROM oauth_service_clients WHERE client_id = %s", (client_id,))
        conn.commit()
    return bool(result.rowcount)


def issue_client_credentials_token(*, client_id: str, client_secret: str, requested_scope: str = "") -> dict[str, Any]:
    with _db()._connect() as conn:  # noqa: SLF001
        row = conn.execute(
            """
            SELECT client_id, name, secret_hash, role, scopes, enabled
            FROM oauth_service_clients
            WHERE client_id = %s
            """,
            (client_id,),
        ).fetchone()
        if not row or not bool(row["enabled"]) or not _verify_secret(client_secret, str(row["secret_hash"])):
            raise HTTPException(status_code=401, detail="Invalid client credentials")

        raw_scopes = row["scopes"] or "[]"
        allowed_scopes = [str(scope) for scope in json.loads(str(raw_scopes))]
        requested_scopes = requested_scope.split() if requested_scope.strip() else allowed_scopes
        if not set(requested_scopes).issubset(set(allowed_scopes)):
            raise HTTPException(status_code=403, detail="Requested scope is not allowed for this client")

        conn.execute(
            "UPDATE oauth_service_clients SET last_used_at = %s WHERE client_id = %s",
            (_utc_now_iso(), client_id),
        )
        conn.commit()

    token = _encode_payload(
        {
            "type": "service_access",
            "client_id": client_id,
            "name": str(row["name"]),
            "role": str(row["role"]),
            "scope": " ".join(requested_scopes),
            "iat": _now(),
            "exp": _now() + settings.OAUTH_SERVICE_TOKEN_TTL_SECONDS,
            "jti": secrets.token_urlsafe(12),
        }
    )
    return {
        "access_token": token,
        "token_type": "Bearer",
        "expires_in": settings.OAUTH_SERVICE_TOKEN_TTL_SECONDS,
        "scope": " ".join(requested_scopes),
    }


def validate_service_access_token(token: str) -> dict[str, Any]:
    payload = _decode_payload(token)
    client_id = str(payload.get("client_id") or "")
    with _db()._connect() as conn:  # noqa: SLF001
        row = conn.execute(
            "SELECT client_id, name, role, scopes, enabled FROM oauth_service_clients WHERE client_id = %s",
            (client_id,),
        ).fetchone()
    if not row or not bool(row["enabled"]):
        raise HTTPException(status_code=401, detail="Service client is disabled")

    role = normalize_role(str(row["role"]))
    if not role:
        raise HTTPException(status_code=403, detail="Service client has invalid role")
    scopes = str(payload.get("scope") or "").split()
    return {
        "email": f"{client_id}@service.local",
        "name": str(row["name"]),
        "picture": "",
        "role": role,
        "client_id": client_id,
        "scopes": scopes,
        "auth_type": "service_client",
    }
