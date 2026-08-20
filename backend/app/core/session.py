import base64
import hashlib
import hmac
import json
import time
from typing import Any, TypedDict

from fastapi import Response

from app.core.config import settings

SESSION_COOKIE_NAME = "kicad_prism_session"
SESSION_COOKIE_SAMESITE = "lax"

# Holds the OIDC state/nonce/PKCE verifier between the authorization redirect and
# the callback. HttpOnly so page scripts cannot read or forge it, and short-lived
# because an authorization round trip takes seconds, not hours.
OIDC_TRANSACTION_COOKIE_NAME = "kicad_prism_oidc_txn"
OIDC_TRANSACTION_TTL_SECONDS = 600


class SessionPayload(TypedDict):
    sid: str
    iat: int
    exp: int


class OidcTransaction(TypedDict):
    state: str
    nonce: str
    code_verifier: str
    redirect_uri: str
    exp: int


def _b64_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64_decode(value: str) -> bytes:
    pad = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode((value + pad).encode("ascii"))


def _sign(message: str, *, purpose: str) -> str:
    """Domain-separated HMAC so a session token can never be replayed as a transaction."""
    secret = settings.SESSION_SECRET.encode("utf-8")
    digest = hmac.new(secret, f"{purpose}:{message}".encode("utf-8"), hashlib.sha256).digest()
    return _b64_encode(digest)


def _encode(payload: dict[str, Any], *, purpose: str, version: str) -> str:
    encoded = _b64_encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    return f"{version}.{encoded}.{_sign(encoded, purpose=purpose)}"


def _decode(token: str, *, purpose: str, version: str) -> dict[str, Any] | None:
    if not token or not settings.SESSION_SECRET:
        return None

    parts = token.split(".")
    if len(parts) != 3 or parts[0] != version:
        return None

    _, encoded_payload, signature = parts
    if not hmac.compare_digest(signature, _sign(encoded_payload, purpose=purpose)):
        return None

    try:
        data = json.loads(_b64_decode(encoded_payload).decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    if int(data.get("exp", 0)) <= int(time.time()):
        return None
    return data


def create_session_token(session_id: str, *, ttl_seconds: int | None = None) -> str:
    """Wrap an opaque session id in a signed, expiring envelope.

    Identity and revocation live in the session store; this token only proves the
    cookie was minted by this deployment and has not been tampered with.
    ``ttl_seconds`` overrides the default lifetime for a remember-me session.
    """
    now = int(time.time())
    lifetime = ttl_seconds if ttl_seconds else settings.SESSION_TTL_HOURS * 3600
    payload: SessionPayload = SessionPayload(
        sid=session_id,
        iat=now,
        exp=now + lifetime,
    )
    return _encode(dict(payload), purpose="session", version="v2")


def decode_session_token(token: str) -> SessionPayload | None:
    data = _decode(token, purpose="session", version="v2")
    if data is None:
        return None
    session_id = str(data.get("sid") or "")
    if not session_id:
        return None
    return SessionPayload(sid=session_id, iat=int(data.get("iat", 0)), exp=int(data["exp"]))


def create_oidc_transaction_token(
    *, state: str, nonce: str, code_verifier: str, redirect_uri: str
) -> str:
    payload: OidcTransaction = OidcTransaction(
        state=state,
        nonce=nonce,
        code_verifier=code_verifier,
        redirect_uri=redirect_uri,
        exp=int(time.time()) + OIDC_TRANSACTION_TTL_SECONDS,
    )
    return _encode(dict(payload), purpose="oidc-txn", version="t1")


def decode_oidc_transaction_token(token: str) -> OidcTransaction | None:
    data = _decode(token, purpose="oidc-txn", version="t1")
    if data is None:
        return None
    try:
        return OidcTransaction(
            state=str(data["state"]),
            nonce=str(data["nonce"]),
            code_verifier=str(data["code_verifier"]),
            redirect_uri=str(data["redirect_uri"]),
            exp=int(data["exp"]),
        )
    except (KeyError, TypeError, ValueError):
        return None


def set_session_cookie(response: Response, token: str, *, max_age_seconds: int | None = None) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite=SESSION_COOKIE_SAMESITE,
        max_age=max_age_seconds if max_age_seconds else settings.SESSION_TTL_HOURS * 3600,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        httponly=True,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite=SESSION_COOKIE_SAMESITE,
        path="/",
    )


def set_oidc_transaction_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=OIDC_TRANSACTION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite=SESSION_COOKIE_SAMESITE,
        max_age=OIDC_TRANSACTION_TTL_SECONDS,
        path="/",
    )


def clear_oidc_transaction_cookie(response: Response) -> None:
    response.delete_cookie(
        key=OIDC_TRANSACTION_COOKIE_NAME,
        httponly=True,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite=SESSION_COOKIE_SAMESITE,
        path="/",
    )
