"""GitLab user OAuth identity adapter (TR-47, C3, C9).

Authorize / exchange / refresh / whoami with PKCE S256. The stable person is
GitLab's numeric user id; a username rename is not a new identity. User
tokens never substitute for bot/service-account write credentials, and bot
tokens are never sent on these endpoints.

Self-hosted base paths come from the connector; gitlab.com never inherits a
self-hosted root. Granted scopes are documented as actually requested
(``read_user`` by default — identity linking only).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Mapping
from urllib.parse import urlencode, urlsplit

from app.services.trackers.contracts import ForgeUser, IdentityToken
from app.services.trackers.errors import ProviderError
from app.services.trackers.gitlab_auth import api_root_for, web_root_for
from app.services.trackers.http import TrackerHttp

ACCEPT = "application/json"
DEFAULT_SCOPES: tuple[str, ...] = ("read_user",)
SELF_HOSTED_DEFAULT_SCOPES: tuple[str, ...] = ("read_user",)
AUTH_USER = "user"


@dataclass(frozen=True)
class GitLabOAuthApp:
    """Public OAuth App registration. Client secret never appears in repr."""

    client_id: str
    client_secret: str
    instance_kind: str = "gitlab.com"
    base_url: str = ""
    web_url: str = ""
    redirect_uri: str = ""
    scopes: tuple[str, ...] = DEFAULT_SCOPES

    def __repr__(self) -> str:
        return (
            "GitLabOAuthApp("
            f"client_id={self.client_id!r}, instance_kind={self.instance_kind!r}, "
            f"base_url={self.base_url!r}, web_url={self.web_url!r}, "
            f"scopes={self.scopes!r})"
        )

    def __str__(self) -> str:
        return repr(self)


class GitLabIdentityAdapter:
    """``IdentityProvider`` implementation for gitlab.com and self-hosted GitLab."""

    kind = "gitlab"

    def __init__(
        self,
        app: GitLabOAuthApp,
        *,
        http: TrackerHttp | None = None,
        forge_hosts_raw: str = "",
        sender: Callable[..., Any] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.app = app
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self.api_root = api_root_for(instance_kind=app.instance_kind, base_url=app.base_url)
        self.web_root = web_root_for(
            instance_kind=app.instance_kind,
            base_url=app.base_url,
            web_url=app.web_url,
        )
        hosts = []
        for url in (self.api_root, self.web_root):
            host = urlsplit(url).hostname
            if host:
                hosts.append(host)
        self.http = http or TrackerHttp(
            forge_hosts_raw=forge_hosts_raw,
            extra_hosts=tuple(hosts),
            sender=sender,
        )

    def granted_scopes(self) -> list[str]:
        """Documented grant actually requested. Self-hosted uses the same user-read scope."""

        if self.app.scopes:
            return list(self.app.scopes)
        kind = (self.app.instance_kind or "").strip().casefold()
        if kind in {"self_hosted", "self-hosted", "gitlab_self_managed", "gitlab-self-managed", "gits"}:
            return list(SELF_HOSTED_DEFAULT_SCOPES)
        return list(DEFAULT_SCOPES)

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
        return f"{self.web_root}/oauth/authorize?{urlencode(params)}"

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
            raise ProviderError("auth_lost", "GitLab user refresh token is missing.")
        payload = {
            "client_id": self.app.client_id,
            "client_secret": self.app.client_secret,
            "grant_type": "refresh_token",
            "refresh_token": refresh,
        }
        return self._token_request(payload)

    def whoami(self, token: IdentityToken) -> ForgeUser:
        access = (token.accessToken or "").strip()
        if not access:
            raise ProviderError("auth_lost", "GitLab user access token is missing.")
        # OAuth access tokens use Bearer; never send a bot PRIVATE-TOKEN here.
        response = self.http.request(
            "GET",
            f"{self.api_root.rstrip('/')}/user",
            headers={
                "Authorization": f"Bearer {access}",
                "Accept": ACCEPT,
            },
        )
        try:
            body = self.http.outcome(response)
        except ProviderError as exc:
            if exc.class_ in {"auth_lost", "gone_confirmed"}:
                raise ProviderError(
                    "auth_lost",
                    "GitLab user grant is expired or revoked.",
                    status=exc.status,
                    retryable=False,
                ) from exc
            raise
        payload = body.json() if body.content else {}
        if not isinstance(payload, dict) or not payload.get("id"):
            raise ProviderError("auth_lost", "GitLab user profile was empty.")
        login = str(payload.get("username") or "")
        display = str(payload.get("name") or "") or login
        return ForgeUser(
            id=str(payload["id"]),
            login=login,
            isBot=False,
            displayName=display or None,
        )

    def pkce_challenge_s256(self, verifier: str) -> str:
        digest = hashlib.sha256(verifier.encode("ascii")).digest()
        import base64

        return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")

    def _token_request(self, payload: Mapping[str, str]) -> IdentityToken:
        url = f"{self.web_root}/oauth/token"
        response = self.http.request(
            "POST",
            url,
            headers={"Accept": ACCEPT},
            json_body=dict(payload),
        )
        try:
            body = self.http.outcome(response)
        except ProviderError as exc:
            raise _redact_token_error(exc) from exc
        data = body.json() if body.content else {}
        if not isinstance(data, dict):
            raise ProviderError("invalid_request", "GitLab token endpoint returned a non-object.")
        error = str(data.get("error") or "")
        if error:
            raise ProviderError(
                "auth_lost"
                if error
                in {
                    "invalid_grant",
                    "invalid_client",
                    "unauthorized_client",
                }
                else "invalid_request",
                "GitLab OAuth token request failed.",
            )
        access = str(data.get("access_token") or "")
        if not access:
            raise ProviderError("auth_lost", "GitLab OAuth access token was empty.")
        scopes = _split_scopes(data.get("scope") or data.get("scopes"))
        expires_in = data.get("expires_in")
        expires_at = None
        if expires_in:
            try:
                expires_at = (self._clock() + timedelta(seconds=int(expires_in))).isoformat()
            except (TypeError, ValueError):
                expires_at = None
        return IdentityToken(
            accessToken=access,
            refreshToken=str(data.get("refresh_token") or "") or None,
            tokenType=str(data.get("token_type") or "bearer"),
            expiresAt=expires_at,
            scopes=scopes,
        )


def _split_scopes(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    text = str(value or "").strip()
    if not text:
        return []
    return [part for part in text.replace(",", " ").split() if part]


def _redact_token_error(exc: ProviderError) -> ProviderError:
    return ProviderError(
        exc.class_,
        "GitLab OAuth token request failed.",
        status=exc.status,
        retryable=exc.retryable,
        resume_at=exc.resume_at,
    )


__all__ = [
    "AUTH_USER",
    "DEFAULT_SCOPES",
    "SELF_HOSTED_DEFAULT_SCOPES",
    "GitLabIdentityAdapter",
    "GitLabOAuthApp",
]
