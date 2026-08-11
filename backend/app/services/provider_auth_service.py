from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any
from urllib.parse import urlparse

from fastapi import HTTPException

from app.core.config import settings
from app.core.roles import Role, normalize_role
from app.core.session import create_oidc_transaction_token, decode_oidc_transaction_token
from app.services.auth_service import ResolvedSessionUser, authenticate_oidc_auth_code, build_oidc_authorization_url

REMOTE_SYMBOL_SCOPE = "remote_symbols.read"


def _db():
    """Lazy import to avoid circular imports at module load time."""
    from app.services.component_catalog_service import catalog_service  # noqa: PLC0415
    return catalog_service


def _now() -> int:
    return int(time.time())


def _b64_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64_decode(value: str) -> bytes:
    pad = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode((value + pad).encode("ascii"))


def _sign(message: str) -> str:
    if not settings.SESSION_SECRET:
        raise HTTPException(status_code=500, detail="SESSION_SECRET is required")
    secret = settings.SESSION_SECRET.encode("utf-8")
    digest = hmac.new(secret, message.encode("utf-8"), hashlib.sha256).digest()
    return _b64_encode(digest)


def _encode_payload(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    encoded = _b64_encode(raw)
    return f"v1.{encoded}.{_sign(encoded)}"


def _decode_payload(token: str) -> dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3 or parts[0] != "v1":
        raise HTTPException(status_code=401, detail="Invalid token")

    encoded = parts[1]
    signature = parts[2]
    expected = _sign(encoded)

    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Invalid token signature")

    try:
        payload = json.loads(_b64_decode(encoded).decode("utf-8"))
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=401, detail="Invalid token payload") from exc

    if int(payload.get("exp", 0)) <= _now():
        raise HTTPException(status_code=401, detail="Token expired")

    token_id = str(payload.get("jti") or "")
    if token_id and _db().is_token_revoked(token_id):
        raise HTTPException(status_code=401, detail="Token revoked")

    return payload


def provider_auth_enabled() -> bool:
    return settings.AUTH_ENABLED and bool(settings.SESSION_SECRET)


def provider_client_id() -> str:
    return settings.REMOTE_PROVIDER_OAUTH_CLIENT_ID


def build_oauth_metadata(base_url: str) -> dict[str, str]:
    root = base_url.rstrip("/")
    return {
        "issuer": root,
        "authorization_endpoint": f"{root}/oauth/authorize",
        "token_endpoint": f"{root}/oauth/token",
        "revocation_endpoint": f"{root}/oauth/revoke",
    }


def build_oidc_login_url(base_url: str, return_to: str) -> tuple[str, str]:
    """Return the IdP redirect plus a transaction token the caller must set as a cookie.

    The PKCE verifier deliberately never travels in the `state` parameter. State is
    visible to anyone who can observe the redirect URL, and a verifier disclosed
    alongside its own authorization code would make PKCE pointless.
    """
    redirect_uri = f"{base_url.rstrip('/')}/oauth/oidc/callback"
    nonce = secrets.token_urlsafe(32)
    code_verifier = secrets.token_urlsafe(64)
    state = _encode_payload(
        {
            "type": "provider_oidc_state",
            "return_to": return_to,
            "jti": secrets.token_urlsafe(8),
            "exp": _now() + 600,
        }
    )
    authorization_url = build_oidc_authorization_url(
        redirect_uri=redirect_uri,
        state=state,
        nonce=nonce,
        code_verifier=code_verifier,
    )
    transaction_token = create_oidc_transaction_token(
        state=state,
        nonce=nonce,
        code_verifier=code_verifier,
        redirect_uri=redirect_uri,
    )
    return authorization_url, transaction_token


def resolve_oidc_callback(
    code: str,
    state_token: str,
    transaction_token: str,
    base_url: str,
    callback_path: str = "/oauth/oidc/callback",
) -> tuple[ResolvedSessionUser, str]:
    state = _decode_payload(state_token)
    if state.get("type") != "provider_oidc_state":
        raise HTTPException(status_code=401, detail="Invalid OAuth state")

    transaction = decode_oidc_transaction_token(transaction_token)
    if not transaction:
        raise HTTPException(status_code=400, detail="Login session expired. Please sign in again.")
    if not hmac.compare_digest(transaction["state"], state_token):
        raise HTTPException(status_code=400, detail="Invalid login state. Please sign in again.")

    redirect_uri = f"{base_url.rstrip('/')}{callback_path}"
    if transaction["redirect_uri"] != redirect_uri:
        raise HTTPException(status_code=400, detail="Login redirect mismatch. Please sign in again.")

    session_user = authenticate_oidc_auth_code(
        code=code,
        redirect_uri=redirect_uri,
        expected_nonce=transaction["nonce"],
        code_verifier=transaction["code_verifier"],
    )
    return session_user, str(state["return_to"])


def normalize_provider_scope(scope: str) -> str:
    requested = {value for value in scope.split() if value}
    if not requested:
        return REMOTE_SYMBOL_SCOPE
    if requested != {REMOTE_SYMBOL_SCOPE}:
        raise HTTPException(status_code=400, detail="Unsupported remote-provider OAuth scope")
    return REMOTE_SYMBOL_SCOPE


def validate_authorization_request(
    *,
    client_id: str,
    redirect_uri: str,
    response_type: str,
    state: str,
    scope: str,
    code_challenge: str,
    code_challenge_method: str,
) -> None:
    parsed_redirect = urlparse(redirect_uri)
    redirect_host = (parsed_redirect.hostname or "").lower()

    if not provider_auth_enabled():
        raise HTTPException(status_code=400, detail="Provider auth is disabled")
    if client_id != provider_client_id():
        raise HTTPException(status_code=400, detail="Unknown client_id")
    if response_type != "code":
        raise HTTPException(status_code=400, detail="Unsupported response_type")
    if parsed_redirect.scheme != "http" or redirect_host not in {"127.0.0.1", "localhost", "::1"}:
        raise HTTPException(status_code=400, detail="redirect_uri must be a loopback URL")
    if not state.strip():
        raise HTTPException(status_code=400, detail="Missing state")
    normalize_provider_scope(scope)
    if not code_challenge.strip():
        raise HTTPException(status_code=400, detail="Missing code_challenge")
    if code_challenge_method != "S256":
        raise HTTPException(status_code=400, detail="Only S256 PKCE is supported")


def issue_authorization_code(
    user: ResolvedSessionUser,
    *,
    client_id: str,
    redirect_uri: str,
    scope: str,
    nonce: str,
    code_challenge: str,
) -> str:
    code = secrets.token_urlsafe(24)
    exp = _now() + 300
    grant = {
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
        "role": user.role,
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": normalize_provider_scope(scope),
        "nonce": nonce,
        "code_challenge": code_challenge,
    }
    _db().store_auth_code(code, grant, exp)
    return code


def _pkce_challenge(code_verifier: str) -> str:
    digest = hashlib.sha256(code_verifier.encode("utf-8")).digest()
    return _b64_encode(digest)


def exchange_authorization_code(
    *,
    code: str,
    client_id: str,
    redirect_uri: str,
    code_verifier: str,
) -> dict[str, Any]:
    grant = _db().consume_auth_code(code)
    if not grant:
        raise HTTPException(status_code=401, detail="Invalid or expired authorization code")
    if grant["client_id"] != client_id:
        raise HTTPException(status_code=401, detail="client_id mismatch")
    if grant["redirect_uri"] != redirect_uri:
        raise HTTPException(status_code=401, detail="redirect_uri mismatch")
    if _pkce_challenge(code_verifier) != grant["code_challenge"]:
        raise HTTPException(status_code=401, detail="PKCE verification failed")

    access_token = issue_token(
        token_type="access",
        email=grant["email"],
        name=grant["name"],
        picture=grant["picture"],
        role=grant["role"],
        scope=grant["scope"],
        ttl_seconds=settings.REMOTE_PROVIDER_ACCESS_TOKEN_TTL_SECONDS,
    )
    refresh_token = issue_token(
        token_type="refresh",
        email=grant["email"],
        name=grant["name"],
        picture=grant["picture"],
        role=grant["role"],
        scope=grant["scope"],
        ttl_seconds=settings.REMOTE_PROVIDER_REFRESH_TOKEN_TTL_SECONDS,
    )
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "Bearer",
        "scope": grant["scope"],
        "expires_in": settings.REMOTE_PROVIDER_ACCESS_TOKEN_TTL_SECONDS,
    }


def refresh_access_token(*, refresh_token: str, client_id: str) -> dict[str, Any]:
    payload = _decode_payload(refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if payload.get("client_id") != client_id:
        raise HTTPException(status_code=401, detail="client_id mismatch")

    access_token = issue_token(
        token_type="access",
        email=str(payload["email"]),
        name=str(payload["name"]),
        picture=str(payload.get("picture") or ""),
        role=str(payload["role"]),
        scope=str(payload.get("scope") or ""),
        ttl_seconds=settings.REMOTE_PROVIDER_ACCESS_TOKEN_TTL_SECONDS,
    )
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "Bearer",
        "scope": str(payload.get("scope") or ""),
        "expires_in": settings.REMOTE_PROVIDER_ACCESS_TOKEN_TTL_SECONDS,
    }


def revoke_token(token: str) -> None:
    payload = _decode_payload(token)
    token_id = str(payload.get("jti") or "")
    exp = int(payload.get("exp", 0))
    if token_id and exp > _now():
        _db().add_revoked_token(token_id, exp)


def issue_token(
    *,
    token_type: str,
    email: str,
    name: str,
    picture: str,
    role: Role | str,
    scope: str,
    ttl_seconds: int,
) -> str:
    normalized_role = normalize_role(str(role))
    if not normalized_role:
        raise HTTPException(status_code=500, detail="Unable to resolve user role")

    now = _now()
    payload = {
        "type": token_type,
        "email": email.strip().lower(),
        "name": name,
        "picture": picture,
        "role": normalized_role,
        "scope": scope,
        "client_id": provider_client_id(),
        "jti": secrets.token_urlsafe(12),
        "iat": now,
        "exp": now + ttl_seconds,
    }
    return _encode_payload(payload)


def validate_access_token(token: str) -> dict[str, Any]:
    payload = _decode_payload(token)
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid access token")
    return payload


def build_bootstrap_nonce_url(base_url: str, access_token: str, next_url: str) -> str:
    payload = validate_access_token(access_token)
    token = _encode_payload(
        {
            "type": "bootstrap",
            "email": payload["email"],
            "name": payload["name"],
            "picture": payload.get("picture", ""),
            "role": payload["role"],
            "next_url": next_url,
            "jti": secrets.token_urlsafe(12),
            "exp": _now() + 120,
        }
    )
    return f"{base_url.rstrip('/')}/oauth/bootstrap?token={token}"


def consume_bootstrap_token(token: str) -> dict[str, Any]:
    payload = _decode_payload(token)
    if payload.get("type") != "bootstrap":
        raise HTTPException(status_code=401, detail="Invalid bootstrap token")
    token_id = str(payload.get("jti") or "")
    exp = int(payload.get("exp", 0))
    if token_id and exp > _now():
        _db().add_revoked_token(token_id, exp)
    return payload
