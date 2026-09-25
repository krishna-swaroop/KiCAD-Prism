"""Gitea / Forgejo user OAuth identity adapter.

Same contract as the GitHub and GitLab adapters: authorize / exchange /
refresh / whoami with PKCE S256. Gitea and Forgejo (including Codeberg) are
always addressed by an https base URL; there is no default public instance.
The stable person is the numeric user id; a username rename is not a new
identity. Only ``read:user`` is requested, which Gitea 1.20+ understands and
older servers ignore.
"""

from __future__ import annotations

import base64
import hashlib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Mapping
from urllib.parse import urlencode, urlsplit

from app.services.trackers.contracts import ForgeUser, IdentityToken
from app.services.trackers.errors import ProviderError
from app.services.trackers.http import TrackerHttp

ACCEPT = "application/json"
DEFAULT_SCOPES: tuple[str, ...] = ("read:user",)


def web_root_for(base_url: str) -> str:
    """The instance origin (plus sub-path), which serves both OAuth and ``/api/v1``."""

    raw = (base_url or "").strip().rstrip("/")
    if not raw:
        raise ProviderError("invalid_request", "Gitea connectors require an https base URL.")
    parsed = urlsplit(raw)
    if parsed.scheme.casefold() != "https" or not parsed.netloc:
        raise ProviderError("invalid_request", "Gitea base URL must be https.")
    if parsed.query or parsed.fragment:
        raise ProviderError("invalid_request", "Gitea base URL must not carry a query or fragment.")
    if raw.endswith("/api/v1"):
        raw = raw[: -len("/api/v1")]
    return raw


@dataclass(frozen=True)
class GiteaOAuthApp:
    """OAuth2 application registered on the instance. The secret never appears in repr."""

    client_id: str
    client_secret: str
    base_url: str
    redirect_uri: str = ""
    scopes: tuple[str, ...] = DEFAULT_SCOPES

    def __repr__(self) -> str:
        return f"GiteaOAuthApp(client_id={self.client_id!r}, base_url={self.base_url!r}, scopes={self.scopes!r})"

    def __str__(self) -> str:
        return repr(self)


class GiteaIdentityAdapter:
    """``IdentityProvider`` implementation for Gitea and Forgejo."""

    kind = "gitea"

    def __init__(
        self,
        app: GiteaOAuthApp,
        *,
        http: TrackerHttp | None = None,
        forge_hosts_raw: str = "",
        sender: Callable[..., Any] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.app = app
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self.web_root = web_root_for(app.base_url)
        self.api_root = f"{self.web_root}/api/v1"
        host = urlsplit(self.web_root).hostname
        self.http = http or TrackerHttp(
            forge_hosts_raw=forge_hosts_raw,
            extra_hosts=(host,) if host else (),
            sender=sender,
        )

    def granted_scopes(self) -> list[str]:
        return list(self.app.scopes or DEFAULT_SCOPES)

    def authorize_url(self, state: str, pkce_challenge: str) -> str:
        if not (state or "").strip():
            raise ProviderError("invalid_request", "OAuth state is required.")
        if not (pkce_challenge or "").strip():
            raise ProviderError("invalid_request", "PKCE code_challenge is required.")
        params = {
            "client_id": self.app.client_id,
            "response_type": "code",
            "state": state,
            "code_challenge": pkce_challenge,
            "code_challenge_method": "S256",
            "scope": " ".join(self.granted_scopes()),
        }
        if self.app.redirect_uri:
            params["redirect_uri"] = self.app.redirect_uri
        return f"{self.web_root}/login/oauth/authorize?{urlencode(params)}"

    def exchange(self, code: str, pkce_verifier: str) -> IdentityToken:
        if not (code or "").strip():
            raise ProviderError("invalid_request", "OAuth authorization code is required.")
        if not (pkce_verifier or "").strip():
            raise ProviderError("invalid_request", "PKCE code_verifier is required.")
        payload = {
            "client_id": self.app.client_id,
            "client_secret": self.app.client_secret,
            "code": code,
            "code_verifier": pkce_verifier,
            "grant_type": "authorization_code",
        }
        if self.app.redirect_uri:
            payload["redirect_uri"] = self.app.redirect_uri
        return self._token_request(payload)

    def refresh(self, token: IdentityToken) -> IdentityToken:
        refresh = (token.refreshToken or "").strip()
        if not refresh:
            raise ProviderError("auth_lost", "Gitea refresh token is missing.")
        return self._token_request({
            "client_id": self.app.client_id,
            "client_secret": self.app.client_secret,
            "grant_type": "refresh_token",
            "refresh_token": refresh,
        })

    def whoami(self, token: IdentityToken) -> ForgeUser:
        access = (token.accessToken or "").strip()
        if not access:
            raise ProviderError("auth_lost", "Gitea access token is missing.")
        response = self.http.request(
            "GET",
            f"{self.api_root}/user",
            headers={"Authorization": f"Bearer {access}", "Accept": ACCEPT},
        )
        try:
            body = self.http.outcome(response)
        except ProviderError as exc:
            if exc.class_ in {"auth_lost", "gone_confirmed"}:
                raise ProviderError(
                    "auth_lost", "Gitea user grant is expired or revoked.",
                    status=exc.status, retryable=False,
                ) from exc
            raise
        payload = body.json() if body.content else {}
        if not isinstance(payload, dict) or not payload.get("id"):
            raise ProviderError("auth_lost", "Gitea user profile was empty.")
        login = str(payload.get("login") or payload.get("username") or "")
        display = str(payload.get("full_name") or "").strip() or login
        return ForgeUser(id=str(payload["id"]), login=login, isBot=False, displayName=display or None)

    def pkce_challenge_s256(self, verifier: str) -> str:
        digest = hashlib.sha256(verifier.encode("ascii")).digest()
        return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")

    def _token_request(self, payload: Mapping[str, str]) -> IdentityToken:
        response = self.http.request(
            "POST",
            f"{self.web_root}/login/oauth/access_token",
            headers={"Accept": ACCEPT},
            json_body=dict(payload),
        )
        try:
            body = self.http.outcome(response)
        except ProviderError as exc:
            raise ProviderError(
                exc.class_, "Gitea OAuth token request failed.",
                status=exc.status, retryable=exc.retryable, resume_at=exc.resume_at,
            ) from exc
        data = body.json() if body.content else {}
        if not isinstance(data, dict):
            raise ProviderError("invalid_request", "Gitea token endpoint returned a non-object.")
        if data.get("error"):
            grant_error = str(data["error"]) in {"invalid_grant", "invalid_client", "unauthorized_client"}
            raise ProviderError(
                "auth_lost" if grant_error else "invalid_request", "Gitea OAuth token request failed.",
            )
        access = str(data.get("access_token") or "")
        if not access:
            raise ProviderError("auth_lost", "Gitea OAuth access token was empty.")
        expires_at = None
        if data.get("expires_in"):
            try:
                expires_at = (self._clock() + timedelta(seconds=int(data["expires_in"]))).isoformat()
            except (TypeError, ValueError):
                expires_at = None
        scope = data.get("scope")
        scopes = [part for part in str(scope or "").replace(",", " ").split() if part]
        return IdentityToken(
            accessToken=access,
            refreshToken=str(data.get("refresh_token") or "") or None,
            tokenType=str(data.get("token_type") or "bearer"),
            expiresAt=expires_at,
            scopes=scopes or self.granted_scopes(),
        )


__all__ = ["DEFAULT_SCOPES", "GiteaIdentityAdapter", "GiteaOAuthApp", "web_root_for"]
