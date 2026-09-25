from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import time
from dataclasses import dataclass
from threading import RLock
from typing import Any
from urllib.parse import urlencode

import jwt
import requests
from fastapi import HTTPException
from jwt import PyJWKClient
from requests.auth import HTTPBasicAuth

from app.core.config import settings
from app.core.roles import Role, normalize_role
from app.services import access_service, password_credential_service

logger = logging.getLogger(__name__)

# Tolerance for clock drift between Prism and the identity provider.
_CLOCK_SKEW_LEEWAY_SECONDS = 60


@dataclass(frozen=True)
class ResolvedSessionUser:
    email: str
    name: str
    picture: str
    role: Role
    user_id: str = ""


_metadata_lock = RLock()
_metadata_cache: dict[str, Any] = {"issuer": "", "payload": None, "expires_at": 0.0}
_external_metadata_cache: dict[str, dict[str, Any]] = {}
_jwks_clients: dict[str, PyJWKClient] = {}


def _now() -> float:
    return time.time()


def _oidc_issuer() -> str:
    return settings.EFFECTIVE_OIDC_ISSUER_URL.rstrip("/")


def oidc_enabled() -> bool:
    return bool(
        settings.EFFECTIVE_OIDC_ISSUER_URL
        and settings.EFFECTIVE_OIDC_CLIENT_ID
        and settings.EFFECTIVE_OIDC_CLIENT_SECRET
    )


def get_oidc_metadata() -> dict[str, Any]:
    issuer = _oidc_issuer()
    if not issuer:
        raise HTTPException(status_code=500, detail="OIDC issuer is not configured")

    with _metadata_lock:
        if (
            _metadata_cache["issuer"] == issuer
            and _metadata_cache["payload"]
            and float(_metadata_cache["expires_at"]) > _now()
        ):
            return dict(_metadata_cache["payload"])

    try:
        response = requests.get(f"{issuer}/.well-known/openid-configuration", timeout=10)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        logger.exception("Failed to fetch OIDC discovery metadata")
        raise HTTPException(status_code=502, detail="Failed to fetch OIDC discovery metadata") from exc

    with _metadata_lock:
        _metadata_cache.update({"issuer": issuer, "payload": payload, "expires_at": _now() + 3600})
    return dict(payload)


def oidc_public_config() -> dict[str, str]:
    if not oidc_enabled():
        return {
            "issuer_url": "",
            "authorization_endpoint": "",
            "client_id": "",
            "scopes": "",
            "provider_name": "",
        }

    metadata = get_oidc_metadata()
    return {
        "issuer_url": _oidc_issuer(),
        "authorization_endpoint": str(metadata.get("authorization_endpoint") or ""),
        "client_id": settings.EFFECTIVE_OIDC_CLIENT_ID,
        "scopes": settings.EFFECTIVE_OIDC_SCOPES,
        "provider_name": settings.OIDC_PROVIDER_NAME.strip() or "SSO",
    }


def pkce_code_challenge(code_verifier: str) -> str:
    """S256 challenge, matching the inbound provider flow in provider_auth_service."""
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def build_oidc_authorization_url(
    *, redirect_uri: str, state: str, nonce: str, code_verifier: str
) -> str:
    metadata = get_oidc_metadata()
    authorization_endpoint = str(metadata.get("authorization_endpoint") or "")
    if not authorization_endpoint:
        raise HTTPException(status_code=500, detail="OIDC authorization endpoint is not available")

    params = {
        "client_id": settings.EFFECTIVE_OIDC_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": settings.EFFECTIVE_OIDC_SCOPES,
        "state": state,
        "nonce": nonce,
        "code_challenge": pkce_code_challenge(code_verifier),
        "code_challenge_method": "S256",
    }
    return f"{authorization_endpoint}?{urlencode(params)}"


def _exchange_oidc_code(code: str, redirect_uri: str, code_verifier: str) -> dict[str, Any]:
    metadata = get_oidc_metadata()
    token_endpoint = str(metadata.get("token_endpoint") or "")
    if not token_endpoint:
        raise HTTPException(status_code=500, detail="OIDC token endpoint is not available")

    data = {
        "client_id": settings.EFFECTIVE_OIDC_CLIENT_ID,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
        "code_verifier": code_verifier,
    }
    auth = None
    token_auth_method = settings.OIDC_TOKEN_AUTH_METHOD.strip().lower()
    if token_auth_method == "client_secret_basic":
        auth = HTTPBasicAuth(settings.EFFECTIVE_OIDC_CLIENT_ID, settings.EFFECTIVE_OIDC_CLIENT_SECRET)
    elif token_auth_method == "client_secret_post":
        data["client_secret"] = settings.EFFECTIVE_OIDC_CLIENT_SECRET
    else:
        raise HTTPException(status_code=500, detail="Unsupported OIDC_TOKEN_AUTH_METHOD")

    try:
        response = requests.post(
            token_endpoint,
            headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
            data=data,
            auth=auth,
            timeout=10,
        )
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.exception("OIDC token exchange failed")
        raise HTTPException(status_code=502, detail="Failed to exchange OIDC authorization code") from exc

    if response.status_code >= 400:
        logger.warning("OIDC token exchange rejected: %s", payload.get("error") or payload)
        raise HTTPException(status_code=401, detail="OIDC token exchange failed")

    return payload


def _verify_jwt(token: str, *, issuer: str, audience: str) -> dict[str, Any]:
    if not audience:
        # An unverified audience means any token that issuer minted for any relying
        # party would authenticate here. Refuse rather than degrade.
        raise HTTPException(status_code=500, detail="JWT audience verification is not configured")

    metadata = get_oidc_metadata() if issuer.rstrip("/") == _oidc_issuer() else _fetch_external_issuer_metadata(issuer)
    jwks_uri = str(metadata.get("jwks_uri") or "")
    if not jwks_uri:
        raise HTTPException(status_code=500, detail="OIDC JWKS URI is not available")

    try:
        signing_key = _jwks_client(jwks_uri).get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "RS384", "RS512", "ES256", "ES384"],
            audience=audience,
            issuer=issuer.rstrip("/"),
            leeway=_CLOCK_SKEW_LEEWAY_SECONDS,
            options={
                "verify_aud": True,
                "verify_exp": True,
                "verify_iat": True,
                "verify_iss": True,
                "require": ["exp", "iat", "iss", "aud", "sub"],
            },
        )
    except Exception as exc:  # noqa: BLE001 - PyJWT raises several concrete exception classes.
        raise HTTPException(status_code=401, detail="Invalid bearer JWT") from exc

    # When a token lists several audiences, the authorized party must be us.
    raw_audience = payload.get("aud")
    if isinstance(raw_audience, list) and len(raw_audience) > 1:
        if str(payload.get("azp") or "") != audience:
            raise HTTPException(status_code=401, detail="Invalid bearer JWT authorized party")
    return payload


def _fetch_external_issuer_metadata(issuer: str) -> dict[str, Any]:
    issuer = issuer.rstrip("/")
    with _metadata_lock:
        cached = _external_metadata_cache.get(issuer)
        if cached and float(cached["expires_at"]) > _now():
            return dict(cached["payload"])

    try:
        response = requests.get(f"{issuer}/.well-known/openid-configuration", timeout=10)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="Failed to fetch external OAuth issuer metadata") from exc

    with _metadata_lock:
        _external_metadata_cache[issuer] = {"payload": payload, "expires_at": _now() + 3600}
    return dict(payload)


def _jwks_client(jwks_uri: str) -> PyJWKClient:
    with _metadata_lock:
        client = _jwks_clients.get(jwks_uri)
        if not client:
            client = PyJWKClient(jwks_uri)
            _jwks_clients[jwks_uri] = client
        return client


def _fetch_userinfo(access_token: str) -> dict[str, Any]:
    metadata = get_oidc_metadata()
    userinfo_endpoint = str(metadata.get("userinfo_endpoint") or "")
    if not userinfo_endpoint:
        return {}

    try:
        response = requests.get(
            userinfo_endpoint,
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
            timeout=10,
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as exc:
        logger.exception("OIDC userinfo request failed")
        raise HTTPException(status_code=502, detail="Failed to fetch OIDC user profile") from exc


def _validate_allowed_user(email: str) -> str:
    normalized_email = email.strip().casefold()
    if not normalized_email:
        raise HTTPException(status_code=401, detail="OIDC profile did not include an email address")
    _enforce_user_allowlist(normalized_email)
    return normalized_email


def _enforce_user_allowlist(normalized_email: str) -> None:
    """Apply ALLOWED_USERS / ALLOWED_DOMAINS to every human login method."""
    allowed_users = {user.strip().casefold() for user in settings.ALLOWED_USERS if user.strip()}
    if allowed_users and normalized_email not in allowed_users:
        raise HTTPException(status_code=403, detail="Access denied. Your email is not in the allowed users list.")

    allowed_domains = {domain.strip().casefold() for domain in settings.ALLOWED_DOMAINS if domain.strip()}
    if allowed_domains:
        domain = normalized_email.split("@")[-1]
        if domain not in allowed_domains:
            raise HTTPException(status_code=403, detail="Access denied. Your email domain is not allowed.")


def _resolve_session_user(profile: dict[str, Any]) -> ResolvedSessionUser:
    email = _validate_allowed_user(str(profile.get(settings.OIDC_EMAIL_CLAIM) or profile.get("email") or ""))
    access_service.ensure_default_viewer_assignment(email)
    role = access_service.resolve_user_role(email)
    if not role:
        raise HTTPException(status_code=403, detail="Access denied. No role assignment found for your account.")

    name = str(profile.get(settings.OIDC_NAME_CLAIM) or profile.get("name") or email.split("@")[0])
    picture = str(profile.get(settings.OIDC_PICTURE_CLAIM) or profile.get("picture") or "")
    user = access_service.upsert_user(email=email, name=name, picture=picture)
    return ResolvedSessionUser(
        email=email,
        name=user["name"] or name,
        picture=user["picture"] or picture,
        role=role,
        user_id=user["user_id"],
    )


@dataclass(frozen=True)
class PasswordAuthResult:
    user: ResolvedSessionUser
    must_change_password: bool


def password_auth_enabled() -> bool:
    return bool(settings.PASSWORD_AUTH_ENABLED)


def authenticate_password(email: str, password: str) -> PasswordAuthResult:
    """Verify a local password and resolve the same session user OIDC would.

    Password login never creates an account. After the password matches, missing
    role assignment is a 403. Unknown emails and wrong passwords share one 401.
    """
    normalized_email = email.strip().casefold()
    if not normalized_email or not password:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    verification = password_credential_service.verify_password(normalized_email, password)
    if not verification.ok:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    _enforce_user_allowlist(normalized_email)
    role = access_service.resolve_user_role(normalized_email)
    if not role:
        raise HTTPException(status_code=403, detail="Access denied. No role assignment found for your account.")

    user_row = access_service.get_user_by_email(normalized_email)
    name = (user_row or {}).get("name") or normalized_email.split("@")[0]
    picture = (user_row or {}).get("picture") or ""
    user = ResolvedSessionUser(
        email=normalized_email,
        name=name,
        picture=picture,
        role=role,
        user_id=verification.user_id,
    )
    return PasswordAuthResult(user=user, must_change_password=verification.must_change)


def authenticate_oidc_auth_code(
    *, code: str, redirect_uri: str, expected_nonce: str, code_verifier: str
) -> ResolvedSessionUser:
    if not oidc_enabled():
        raise HTTPException(status_code=500, detail="OIDC client credentials are not configured")
    if not expected_nonce or not code_verifier:
        # Both are minted server-side and returned in the transaction cookie. Missing
        # values mean the callback did not originate from a Prism-initiated login.
        raise HTTPException(status_code=400, detail="OIDC login transaction is missing or expired")

    token_payload = _exchange_oidc_code(code, redirect_uri, code_verifier)
    access_token = str(token_payload.get("access_token") or "")
    id_token = str(token_payload.get("id_token") or "")
    if not id_token:
        raise HTTPException(status_code=401, detail="OIDC provider did not return an id_token")

    id_payload = _verify_jwt(
        id_token,
        issuer=_oidc_issuer(),
        audience=settings.EFFECTIVE_OIDC_CLIENT_ID,
    )
    if not hmac.compare_digest(str(id_payload.get("nonce") or ""), expected_nonce):
        raise HTTPException(status_code=401, detail="Invalid OIDC nonce")

    profile: dict[str, Any] = dict(id_payload)
    if access_token:
        userinfo = _fetch_userinfo(access_token)
        # OpenID Connect Core 5.3.2: a userinfo response whose subject differs from
        # the id_token's must be discarded, otherwise it can substitute an identity.
        if userinfo and str(userinfo.get("sub") or "") != str(id_payload.get("sub") or ""):
            raise HTTPException(status_code=401, detail="OIDC userinfo subject mismatch")
        profile.update(userinfo)

    return _resolve_session_user(profile)


def validate_external_api_jwt(token: str) -> dict[str, Any] | None:
    issuer = settings.OAUTH_EXTERNAL_JWT_ISSUER_URL.strip().rstrip("/")
    if not issuer:
        return None

    payload = _verify_jwt(token, issuer=issuer, audience=settings.OAUTH_EXTERNAL_JWT_AUDIENCE.strip())
    role = normalize_role(str(payload.get(settings.OAUTH_EXTERNAL_JWT_ROLE_CLAIM) or "viewer"))
    if not role:
        raise HTTPException(status_code=403, detail="External OAuth token did not include a valid Prism role")

    scopes_value = payload.get(settings.OAUTH_EXTERNAL_JWT_SCOPES_CLAIM) or ""
    if isinstance(scopes_value, list):
        scopes = [str(scope) for scope in scopes_value]
    else:
        scopes = str(scopes_value).split()

    client_id = str(
        payload.get(settings.OAUTH_EXTERNAL_JWT_CLIENT_ID_CLAIM)
        or payload.get("azp")
        or payload.get("sub")
        or "external-client"
    )
    return {
        "email": f"{client_id}@external.oauth",
        "name": client_id,
        "picture": "",
        "role": role,
        "client_id": client_id,
        "scopes": scopes,
        "auth_type": "external_service",
    }
