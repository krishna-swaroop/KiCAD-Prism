"""OAuth for MCP clients: grants, authorization codes, and access tokens.

This is its own flow, separate from the KiCad remote-provider client
(``provider_auth_service``) and from agent sign-in (``agent_auth_service``). It
reuses only their signing primitives and, like both, never stores a usable
secret: authorization codes and refresh tokens are kept as SHA-256 hashes.

A grant is one client's consent to act for one person. It carries the refresh
token and is the row Settings lists and revokes. Access tokens are short-lived
signed ``v1.`` payloads naming their grant, so revoking the grant ends every
access token minted under it.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import time
from typing import Any
from urllib.parse import urlsplit

from fastapi import HTTPException
from psycopg.types.json import Jsonb

from app.core.config import settings
from app.core.roles import normalize_role
from app.services import access_service, provider_auth_service
from app.services.postgres_database import database

SCOPES_SUPPORTED: tuple[str, ...] = (
    "api:read",
    "comments:write",
    "design:write",
    "catalog:write",
)
# Never offered to an MCP client (ADR §3.5): these are person-only actions, and
# ``api:write`` would imply every one of them.
HUMAN_ONLY_SCOPES: frozenset[str] = frozenset(
    {"release:approve", "catalog:qa", "admin", "api:write"}
)
DEFAULT_SCOPE = "api:read"
# Diagnostics (ADR §11, D20): offered only while ops is on, granted only to admins.
OPS_SCOPES: tuple[str, ...] = ("ops:read", "ops:act")


def scopes_supported() -> tuple[str, ...]:
    """The scopes this server advertises and accepts right now."""
    if settings.PRISM_MCP_OPS_ENABLED:
        return (*SCOPES_SUPPORTED, *OPS_SCOPES)
    return SCOPES_SUPPORTED


def scope_for_user(scope: str, role: str) -> tuple[str, list[str]]:
    """The scope a user may grant, and the requested scopes it leaves out.

    Ops scopes need an admin. A client asking for them on someone else's
    behalf still gets the rest; the consent page names what was dropped.
    """
    requested = [value for value in (scope or "").split() if value]
    dropped = [value for value in requested if value in OPS_SCOPES and role != "admin"]
    kept = [value for value in requested if value not in dropped]
    return (" ".join(sorted(set(kept))) or DEFAULT_SCOPE), dropped

ACCESS_TOKEN_TTL_SECONDS = 3600
AUTHORIZATION_CODE_TTL_SECONDS = 600
REFRESH_TOKEN_PREFIX = "prism_mcp_rt_"
REFRESH_RANDOM_LENGTH = 40
GRANT_ID_PREFIX = "mcpg_"

_BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
_TOKEN_TYPE = "mcp"


class OAuthError(Exception):
    """An RFC 6749 error shape for the token endpoint."""

    def __init__(self, error: str, description: str, *, status_code: int = 400) -> None:
        super().__init__(description)
        self.error = error
        self.description = description
        self.status_code = status_code


def _base_url(base_url: str | None = None) -> str:
    return (base_url or settings.PUBLIC_BASE_URL or "").strip().rstrip("/")


def resource_for(base_url: str | None = None) -> str:
    """The protected resource this server is: ``<base>/mcp``."""
    root = _base_url(base_url)
    return f"{root}/mcp" if root else ""


def _audience_ok(audience: str) -> bool:
    """Whether ``audience`` names this server's MCP endpoint.

    With ``PUBLIC_BASE_URL`` set the match is exact. Without it the server has
    no fixed origin (it answers on whatever host reached it), so any
    ``<origin>/mcp`` is accepted; the signature, token type and live grant
    still bind the token to this deployment.
    """
    expected = resource_for()
    if expected:
        return audience == expected
    parsed = urlsplit(audience)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc) and parsed.path == "/mcp"


def normalize_scope(scope: str) -> str:
    """Return the requested scope set, defaulting to ``api:read`` when absent."""
    requested = [value for value in (scope or "").split() if value]
    if not requested:
        return DEFAULT_SCOPE
    for value in requested:
        if value in HUMAN_ONLY_SCOPES:
            raise OAuthError("invalid_scope", f"{value} is reserved for people signed in to Prism")
        if value not in scopes_supported():
            raise OAuthError("invalid_scope", f"Unsupported scope: {value}")
    return " ".join(sorted(set(requested)))


def _new_refresh_token() -> str:
    return REFRESH_TOKEN_PREFIX + "".join(
        secrets.choice(_BASE62) for _ in range(REFRESH_RANDOM_LENGTH)
    )


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _pkce_challenge(code_verifier: str) -> str:
    digest = hashlib.sha256(code_verifier.encode("utf-8")).digest()
    return provider_auth_service._b64_encode(digest)


def issue_authorization_code(
    *,
    client_id: str,
    client_name: str,
    redirect_uri: str,
    scope: str,
    code_challenge: str,
    user: Any,
    base_url: str,
) -> str:
    """Store a single-use code bound to the validated request (10 minutes)."""
    # Enforced here as well as on the consent page: an ops scope reaches a
    # grant only for an admin.
    normalized_scope, _dropped = scope_for_user(normalize_scope(scope), str(getattr(user, "role", "")))
    resource = resource_for(base_url)
    code = secrets.token_urlsafe(32)
    payload = {
        "client_id": client_id,
        "client_name": client_name,
        "redirect_uri": redirect_uri,
        "scope": normalized_scope,
        "code_challenge": code_challenge,
        "email": str(user.email).strip().lower(),
        "name": str(user.name),
        "picture": str(getattr(user, "picture", "") or ""),
        "resource": resource,
    }
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        connection.execute(
            """
            INSERT INTO ws_mcp_codes (code_hash, grant_payload, expires_at)
            VALUES (%s, %s, NOW() + make_interval(secs => %s))
            """,
            (hash_token(code), Jsonb(payload), AUTHORIZATION_CODE_TTL_SECONDS),
        )
        connection.commit()
    return code


def _consume_code(code: str) -> dict[str, Any] | None:
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        row = connection.execute(
            """
            UPDATE ws_mcp_codes SET used_at = NOW()
            WHERE code_hash = %s AND used_at IS NULL AND expires_at > NOW()
            RETURNING grant_payload
            """,
            (hash_token(code),),
        ).fetchone()
        connection.commit()
    return dict(row["grant_payload"]) if row else None


def _issue_access_token(
    *,
    grant_id: str,
    client_id: str,
    email: str,
    name: str,
    picture: str,
    role: str,
    scope: str,
    audience: str,
) -> str:
    now = provider_auth_service._now()
    payload = {
        "type": _TOKEN_TYPE,
        "email": email.strip().lower(),
        "name": name,
        "picture": picture,
        "role": role,
        "client_id": client_id,
        "scope": scope,
        "aud": audience,
        "jti": secrets.token_urlsafe(12),
        "grant": grant_id,
        "iat": now,
        "exp": now + ACCESS_TOKEN_TTL_SECONDS,
    }
    return provider_auth_service._encode_payload(payload)


def _current_identity(email: str) -> tuple[dict[str, Any], str]:
    """The account and its role now, never the role captured at authorization."""
    current = access_service.get_user_by_email(email)
    role = normalize_role(access_service.resolve_user_role(email) or "")
    if current is None or not role:
        raise OAuthError("invalid_grant", "The account is no longer active")
    return current, role


def _create_grant(
    *,
    client_id: str,
    client_name: str,
    email: str,
    scopes: list[str],
    refresh_token: str,
) -> str:
    grant_id = GRANT_ID_PREFIX + secrets.token_hex(12)
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        connection.execute(
            """
            INSERT INTO ws_mcp_grants
                (id, client_id, client_name, user_email, scopes, refresh_hash, last_used_at)
            VALUES (%s, %s, %s, %s, %s, %s, NOW())
            """,
            (
                grant_id,
                client_id,
                client_name,
                email.strip().lower(),
                Jsonb(scopes),
                hash_token(refresh_token),
            ),
        )
        connection.commit()
    return grant_id


def _token_response(*, access_token: str, refresh_token: str, scope: str) -> dict[str, Any]:
    return {
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": ACCESS_TOKEN_TTL_SECONDS,
        "refresh_token": refresh_token,
        "scope": scope,
    }


def exchange_authorization_code(
    *,
    code: str,
    client_id: str,
    redirect_uri: str,
    code_verifier: str,
    resource: str = "",
    base_url: str | None = None,
) -> dict[str, Any]:
    """Trade a code (plus its PKCE verifier) for an access and refresh token."""
    grant = _consume_code(code)
    if grant is None:
        raise OAuthError("invalid_grant", "Invalid or expired authorization code")
    if grant.get("client_id") != client_id:
        raise OAuthError("invalid_grant", "client_id mismatch")
    if grant.get("redirect_uri") != redirect_uri:
        raise OAuthError("invalid_grant", "redirect_uri mismatch")
    expected_challenge = str(grant.get("code_challenge") or "")
    if not hmac.compare_digest(_pkce_challenge(code_verifier or ""), expected_challenge):
        raise OAuthError("invalid_grant", "PKCE verification failed")
    audience = str(grant.get("resource") or resource_for(base_url))
    if resource and resource != audience:
        raise OAuthError("invalid_grant", "resource mismatch")

    email = str(grant.get("email") or "")
    current, role = _current_identity(email)
    scope = str(grant.get("scope") or DEFAULT_SCOPE)
    client_name = str(grant.get("client_name") or client_id)
    refresh_token = _new_refresh_token()
    grant_id = _create_grant(
        client_id=client_id,
        client_name=client_name,
        email=email,
        scopes=scope.split(),
        refresh_token=refresh_token,
    )
    access_token = _issue_access_token(
        grant_id=grant_id,
        client_id=client_id,
        email=email,
        name=str(current["name"]),
        picture=str(current.get("picture") or ""),
        role=role,
        scope=scope,
        audience=audience,
    )
    return _token_response(
        access_token=access_token,
        refresh_token=refresh_token,
        scope=scope,
    )


def refresh_access_token(
    *,
    refresh_token: str,
    client_id: str,
    scope: str = "",
    base_url: str | None = None,
) -> dict[str, Any]:
    """Rotate a refresh token; the previous secret stops working at once."""
    if not refresh_token.startswith(REFRESH_TOKEN_PREFIX):
        raise OAuthError("invalid_grant", "Invalid refresh token")
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        row = connection.execute(
            """
            SELECT id, client_id, user_email, scopes
            FROM ws_mcp_grants
            WHERE refresh_hash = %s AND revoked_at IS NULL
            """,
            (hash_token(refresh_token),),
        ).fetchone()
        if row is None or str(row["client_id"]) != client_id:
            raise OAuthError("invalid_grant", "Invalid refresh token")
        scopes = [str(value) for value in (row["scopes"] or [])]
        if scope:
            requested = normalize_scope(scope).split()
            if not set(requested).issubset(set(scopes)):
                raise OAuthError("invalid_scope", "Requested scope was not granted")
            scopes = requested
        email = str(row["user_email"])
        current, role = _current_identity(email)
        new_refresh = _new_refresh_token()
        updated = connection.execute(
            """
            UPDATE ws_mcp_grants
            SET refresh_hash = %s, last_used_at = NOW()
            WHERE id = %s AND refresh_hash = %s AND revoked_at IS NULL
            RETURNING id
            """,
            (hash_token(new_refresh), row["id"], hash_token(refresh_token)),
        ).fetchone()
        connection.commit()
    if updated is None:
        raise OAuthError("invalid_grant", "Invalid refresh token")

    scope_string = " ".join(scopes)
    audience = resource_for(base_url)
    access_token = _issue_access_token(
        grant_id=str(row["id"]),
        client_id=client_id,
        email=email,
        name=str(current["name"]),
        picture=str(current.get("picture") or ""),
        role=role,
        scope=scope_string,
        audience=audience,
    )
    return _token_response(access_token=access_token, refresh_token=new_refresh, scope=scope_string)


# ── Validation ───────────────────────────────────────────────────────────

_grant_state: dict[str, tuple[float, bool]] = {}
_grant_state_lock = threading.Lock()
GRANT_STATE_TTL_SECONDS = 30


def _forget_grant(grant_id: str) -> None:
    with _grant_state_lock:
        _grant_state.pop(grant_id, None)


def _grant_is_live(grant_id: str) -> bool:
    now = time.monotonic()
    with _grant_state_lock:
        cached = _grant_state.get(grant_id)
        if cached is not None and now - cached[0] < GRANT_STATE_TTL_SECONDS:
            return cached[1]
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        row = connection.execute(
            "SELECT revoked_at FROM ws_mcp_grants WHERE id = %s",
            (grant_id,),
        ).fetchone()
    live = row is not None and row["revoked_at"] is None
    with _grant_state_lock:
        _grant_state[grant_id] = (now, live)
    return live


def validate_access_token(token: str) -> dict[str, Any]:
    """Decode an MCP access token and refuse it if it is not live.

    ``_decode_payload`` checks the signature, expiry and the shared jti
    revocation list; this adds the token type, our audience, and the grant.
    """
    payload = provider_auth_service._decode_payload(token)
    if payload.get("type") != _TOKEN_TYPE:
        raise HTTPException(status_code=401, detail="Invalid MCP token")
    if not _audience_ok(str(payload.get("aud") or "")):
        raise HTTPException(status_code=401, detail="Invalid token audience")
    grant_id = str(payload.get("grant") or "")
    if not grant_id or not _grant_is_live(grant_id):
        raise HTTPException(status_code=401, detail="Token revoked")
    _touch_grant(grant_id)
    return payload


# A "last used" column need not be exact; write at most once a minute per grant.
_TOUCH_THROTTLE_SECONDS = 60
_TOUCH_CACHE_MAX = 4096
_last_touched: dict[str, int] = {}
_touch_lock = threading.Lock()


def _touch_store(grant_id: str) -> None:
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        connection.execute(
            "UPDATE ws_mcp_grants SET last_used_at = NOW() WHERE id = %s",
            (grant_id,),
        )
        connection.commit()


def _touch_grant(grant_id: str) -> None:
    now = int(time.time())
    with _touch_lock:
        if now - _last_touched.get(grant_id, 0) < _TOUCH_THROTTLE_SECONDS:
            return
        if len(_last_touched) >= _TOUCH_CACHE_MAX:
            stale = [
                key for key, seen in _last_touched.items()
                if now - seen >= _TOUCH_THROTTLE_SECONDS
            ]
            for key in stale:
                del _last_touched[key]
            if not stale:
                _last_touched.clear()
        _last_touched[grant_id] = now
    try:
        _touch_store(grant_id)
    except Exception:  # noqa: BLE001 - bookkeeping must not fail an authenticated request
        pass


# ── Revocation and listing ───────────────────────────────────────────────


def revoke_token(token: str, client_id: str) -> None:
    """Revoke the grant an access or refresh token belongs to (RFC 7009: always 200)."""
    grant_id = ""
    if token.startswith(REFRESH_TOKEN_PREFIX):
        with database.connection() as connection:
            connection.execute("SET search_path TO workspace, public")
            row = connection.execute(
                "SELECT id, client_id FROM ws_mcp_grants WHERE refresh_hash = %s",
                (hash_token(token),),
            ).fetchone()
        if row is not None and str(row["client_id"]) == client_id:
            grant_id = str(row["id"])
    elif token.startswith("v1."):
        try:
            payload = provider_auth_service._decode_payload(token)
        except HTTPException:
            return
        if payload.get("type") == _TOKEN_TYPE and str(payload.get("client_id") or "") == client_id:
            grant_id = str(payload.get("grant") or "")
    if not grant_id:
        return
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        connection.execute(
            """
            UPDATE ws_mcp_grants SET revoked_at = COALESCE(revoked_at, NOW())
            WHERE id = %s AND client_id = %s
            """,
            (grant_id, client_id),
        )
        connection.commit()
    _forget_grant(grant_id)


def _grant_rows(email: str) -> list[dict[str, Any]]:
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        rows = connection.execute(
            """
            SELECT id, client_id, client_name, user_email, scopes, created_at, last_used_at
            FROM ws_mcp_grants
            WHERE user_email = %s AND revoked_at IS NULL
            ORDER BY created_at DESC, id DESC
            """,
            (email.strip().lower(),),
        ).fetchall()
    return [dict(row) for row in rows]


def list_for(email: str) -> list[dict[str, Any]]:
    return _grant_rows(email)


def list_all() -> list[dict[str, Any]]:
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        rows = connection.execute(
            """
            SELECT id, client_id, client_name, user_email, scopes, created_at, last_used_at
            FROM ws_mcp_grants
            WHERE revoked_at IS NULL
            ORDER BY created_at DESC, id DESC
            """
        ).fetchall()
    return [dict(row) for row in rows]


def revoke_grant(grant_id: str, *, by_email: str, is_admin: bool) -> dict[str, Any]:
    """Revoke a grant its owner or an administrator may see."""
    with database.connection() as connection:
        connection.execute("SET search_path TO workspace, public")
        row = connection.execute(
            """
            SELECT id, client_id, client_name, user_email, scopes, created_at,
                   last_used_at, revoked_at
            FROM ws_mcp_grants WHERE id = %s
            """,
            (grant_id,),
        ).fetchone()
        if row is None or (
            not is_admin
            and str(row["user_email"]).strip().lower() != by_email.strip().lower()
        ):
            raise HTTPException(status_code=404, detail="MCP client not found")
        updated = connection.execute(
            """
            UPDATE ws_mcp_grants SET revoked_at = COALESCE(revoked_at, NOW())
            WHERE id = %s
            RETURNING id, client_id, client_name, user_email, scopes, created_at,
                      last_used_at, revoked_at
            """,
            (grant_id,),
        ).fetchone()
        connection.commit()
    _forget_grant(grant_id)
    return dict(updated)
