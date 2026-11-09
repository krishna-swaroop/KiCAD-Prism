"""Sign-in for the KiCad desktop agent: loopback OAuth with PKCE.

A new user on an auth-enabled server has no way to give the agent a bearer
token today. This issues one through the browser the user already trusts: the
agent opens a loopback listener, sends the user to Prism to log in normally, and
receives a one-time authorization code on ``127.0.0.1`` that it exchanges -- with
its PKCE verifier, over a back-channel POST -- for a scoped, revocable user
token.

Deliberately kept separate from ``provider_auth_service``: that flow is bound to
one machine client (the remote-symbol provider) and one scope, and loosening it
to also serve the agent would risk that path. This reuses the low-level token
and authorization-code primitives but owns its own client identity, scopes, and
token ``type`` so the two flows cannot interfere.

The token is a signed ``v1.`` payload with ``type == "agent"``; it carries the
logged-in user's identity and role, an API scope set, and a ``jti`` so it can be
revoked. Validation runs through the shared revocation list, so revoking a token
takes effect immediately.
"""

from __future__ import annotations

import hmac
import secrets
import threading
from contextlib import contextmanager
from typing import Any, Iterator
from urllib.parse import urlparse

from fastapi import HTTPException

from app.core.config import settings
from app.core.b64url import pkce_challenge as _pkce_challenge
from app.core.roles import Role, normalize_role
from app.services import provider_auth_service
from app.services.auth_service import ResolvedSessionUser
from app.services.catalog.agent_tokens import CatalogAgentTokens

# The agent identifies itself as its own OAuth client so its codes and tokens
# never collide with the remote-provider client.
AGENT_CLIENT_ID = "kicad-agent"

# The agent only ever needs to read projects and submit merge decisions; it must
# never receive a wildcard or a raw admin session. These mirror the scope
# vocabulary the bearer-scope checks already understand.
AGENT_SCOPES = ("api:read", "api:write")
_AGENT_SCOPE_STRING = " ".join(AGENT_SCOPES)

_TOKEN_TYPE = "agent"


def agent_auth_enabled() -> bool:
    """Whether sign-in is available. When auth is off the agent stays a guest."""
    return settings.AUTH_ENABLED and bool(settings.SESSION_SECRET)


def _now() -> int:
    return provider_auth_service._now()


def _db():
    return provider_auth_service._db()


@contextmanager
def _registry() -> Iterator[Any]:
    """A catalog connection for the agent-token registry; commits on success."""
    db = _db()
    db.initialize()
    with db.connection() as conn:
        yield conn
        conn.commit()


def get_agent_token(jti: str) -> dict[str, Any] | None:
    with _registry() as conn:
        return CatalogAgentTokens.get(conn, jti=jti)


def list_agent_tokens(*, email: str | None) -> list[dict[str, Any]]:
    with _registry() as conn:
        return CatalogAgentTokens.list_for(conn, email=email, now=_now())


def _touch_registry(jti: str, when: str) -> None:
    with _registry() as conn:
        CatalogAgentTokens.touch(conn, jti=jti, when=when)


def normalize_agent_scope(scope: str) -> str:
    """Accept only the agent's fixed scope set; empty means the full set."""
    requested = {value for value in scope.split() if value}
    if not requested:
        return _AGENT_SCOPE_STRING
    if not requested.issubset(set(AGENT_SCOPES)):
        raise HTTPException(status_code=400, detail="Unsupported agent scope")
    return " ".join(sorted(requested))


def validate_authorization_request(
    *,
    redirect_uri: str,
    response_type: str,
    state: str,
    scope: str,
    code_challenge: str,
    code_challenge_method: str,
) -> None:
    """Reject anything that would let a code leak or a downgrade slip through.

    The redirect must be loopback only -- accepting an arbitrary one would turn
    this into an open redirector that hands the code to an attacker's host. PKCE
    is required (never optional): without it any local process that can see the
    loopback callback could redeem a stolen code.
    """
    if not agent_auth_enabled():
        raise HTTPException(status_code=400, detail="Sign-in is not required on this server")
    if response_type != "code":
        raise HTTPException(status_code=400, detail="Unsupported response_type")

    parsed = urlparse(redirect_uri)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "http" or host not in {"127.0.0.1", "::1"}:
        raise HTTPException(status_code=400, detail="redirect_uri must be a loopback URL")
    if not state.strip():
        raise HTTPException(status_code=400, detail="Missing state")
    normalize_agent_scope(scope)
    if not code_challenge.strip():
        raise HTTPException(status_code=400, detail="Missing code_challenge")
    if code_challenge_method != "S256":
        raise HTTPException(status_code=400, detail="Only S256 PKCE is supported")


def issue_authorization_code(
    user: ResolvedSessionUser,
    *,
    redirect_uri: str,
    scope: str,
    code_challenge: str,
    agent_label: str = "",
) -> str:
    """Mint a short-lived, single-use code bound to this user and PKCE challenge."""
    code = secrets.token_urlsafe(24)
    exp = _now() + 300
    grant = {
        "flow": "agent",
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
        "role": user.role,
        "client_id": AGENT_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "scope": normalize_agent_scope(scope),
        "code_challenge": code_challenge,
        "agent_label": agent_label[:200],
    }
    _db().store_auth_code(code, grant, exp)
    return code


def exchange_authorization_code(
    *,
    code: str,
    redirect_uri: str,
    code_verifier: str,
) -> dict[str, object]:
    """Verify the code and PKCE, then return a scoped user token.

    The grant is consumed on read (single-use). A mismatched client, redirect,
    or PKCE verifier fails closed -- a stolen code without the verifier the
    agent kept is worthless.
    """
    grant = _db().consume_auth_code(code)
    if not grant or grant.get("flow") != "agent":
        raise HTTPException(status_code=401, detail="Invalid or expired authorization code")
    if grant.get("client_id") != AGENT_CLIENT_ID:
        raise HTTPException(status_code=401, detail="client_id mismatch")
    if grant.get("redirect_uri") != redirect_uri:
        raise HTTPException(status_code=401, detail="redirect_uri mismatch")
    if not hmac.compare_digest(_pkce_challenge(code_verifier), str(grant.get("code_challenge") or "")):
        raise HTTPException(status_code=401, detail="PKCE verification failed")

    token = _issue_agent_token(
        email=str(grant["email"]),
        name=str(grant["name"]),
        picture=str(grant.get("picture") or ""),
        role=str(grant["role"]),
        scope=str(grant.get("scope") or _AGENT_SCOPE_STRING),
        label=str(grant.get("agent_label") or ""),
    )
    return {
        "access_token": token,
        "token_type": "Bearer",
        "scope": str(grant.get("scope") or _AGENT_SCOPE_STRING),
        "expires_in": settings.AGENT_TOKEN_TTL_SECONDS,
    }


def _issue_agent_token(
    *,
    email: str,
    name: str,
    picture: str,
    role: Role | str,
    scope: str,
    label: str = "",
) -> str:
    normalized_role = normalize_role(str(role))
    if not normalized_role:
        raise HTTPException(status_code=500, detail="Unable to resolve user role")
    now = _now()
    jti = secrets.token_urlsafe(12)
    exp = now + settings.AGENT_TOKEN_TTL_SECONDS
    payload = {
        "type": _TOKEN_TYPE,
        "email": email.strip().lower(),
        "name": name,
        "picture": picture,
        "role": normalized_role,
        "scope": scope,
        "client_id": AGENT_CLIENT_ID,
        "jti": jti,
        "iat": now,
        "exp": exp,
    }
    # Record the token in the registry so the user (or an admin) can see and
    # revoke it later. The token value itself is never stored.
    with _registry() as conn:
        CatalogAgentTokens.record(
            conn,
            jti=jti,
            email=email,
            label=label,
            scopes=scope.split(),
            created_at=_iso(now),
            expires_at=exp,
        )
    return provider_auth_service._encode_payload(payload)


def _iso(epoch: int) -> str:
    import datetime

    return datetime.datetime.fromtimestamp(epoch, datetime.timezone.utc).isoformat()


def validate_agent_token(token: str) -> dict[str, object]:
    """Decode and verify an agent token; raise 401 if it is not a valid one.

    ``_decode_payload`` already checks the signature, expiry, and revocation, so
    this only has to assert the token is ours.
    """
    payload = provider_auth_service._decode_payload(token)
    if payload.get("type") != _TOKEN_TYPE or payload.get("client_id") != AGENT_CLIENT_ID:
        raise HTTPException(status_code=401, detail="Invalid agent token")
    return payload


def revoke_agent_token_by_jti(jti: str) -> bool:
    """Revoke by registry id (a user or admin revoking from the web console).

    Returns False if no active token with that jti belongs to the registry, so
    the caller can 404. The revocation list needs an expiry; the registry row
    carries it.
    """
    row = get_agent_token(jti)
    if not row or not jti:
        return False
    _revoke_jti(jti, int(row.get("expires_at") or 0))
    return True


def _revoke_jti(jti: str, exp: int) -> None:
    if not jti:
        return
    now = _now()
    if exp > now:
        _db().add_revoked_token(jti, exp)
    with _registry() as conn:
        CatalogAgentTokens.mark_revoked(conn, jti=jti, when=_iso(now))


# How stale the "last used" timestamp is allowed to get before a validation refreshes
# it. A write on every request would put a database round-trip in the hot path of every
# agent call; once every few minutes keeps the column meaningful without that cost.
_TOUCH_THROTTLE_SECONDS = 300
# The in-process throttle memory. Bounded so a long-lived server that sees many tokens
# does not grow this without limit; when it fills, entries older than the throttle
# window (which no longer suppress anything) are dropped first. Guarded by a lock
# because the app serves requests concurrently.
_TOUCH_CACHE_MAX = 4096
_last_touched: dict[str, int] = {}
_touch_lock = threading.Lock()


def touch_agent_token(payload: dict[str, object]) -> None:
    """Record that a token was just used, for the "last used" column.

    Throttled per jti (see _TOUCH_THROTTLE_SECONDS): the timestamp only needs to be
    roughly right, and a DB write on every request would tax the whole agent API. Best
    effort, a failed touch must never break a request that had already authenticated.
    """
    jti = str(payload.get("jti") or "")
    if not jti:
        return
    now = _now()
    with _touch_lock:
        if now - _last_touched.get(jti, 0) < _TOUCH_THROTTLE_SECONDS:
            return
        if len(_last_touched) >= _TOUCH_CACHE_MAX:
            # Drop entries whose throttle window has lapsed; they no longer suppress a
            # write, so forgetting them only costs one extra DB touch if that token
            # returns. If none have lapsed, clear the lot rather than grow unbounded.
            stale = [
                k for k, t in _last_touched.items()
                if now - t >= _TOUCH_THROTTLE_SECONDS
            ]
            for k in stale:
                del _last_touched[k]
            if not stale:
                _last_touched.clear()
        _last_touched[jti] = now
    try:
        _touch_registry(jti, _iso(now))
    except Exception:  # noqa: BLE001 - a bookkeeping write must not fail a request
        pass
