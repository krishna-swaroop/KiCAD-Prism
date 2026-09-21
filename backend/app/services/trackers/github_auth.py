"""GitHub App JWT and installation tokens (TR-15, C3).

Bot writes use installation credentials only. A revoked installation is
``auth_lost`` and never falls back to a user OAuth token. github.com talks to
``https://api.github.com``; GHES talks only to the connector ``base_url``.
"""

from __future__ import annotations

import re
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Mapping, Optional
from urllib.parse import urlsplit

import jwt

from app.services.trackers.errors import ProviderError
from app.services.trackers.http import TrackerHttp

GITHUB_COM_API = "https://api.github.com"
JWT_LIFETIME = timedelta(minutes=9)
JWT_IAT_SKEW = timedelta(seconds=30)
TOKEN_REFRESH_SKEW = timedelta(seconds=60)
REQUIRED_ISSUE_PERMISSIONS = frozenset({"write", "admin"})
AUTH_APP = "app"
AUTH_INSTALLATION = "installation"
ACCEPT = "application/vnd.github+json"
API_VERSION = "2022-11-28"
_NUMERIC_REPOSITORY_ID = re.compile(r"^[0-9]+$")

Clock = Callable[[], datetime]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def api_root_for(*, instance_kind: str, base_url: str = "") -> str:
    """Resolve the REST root. GHES never inherits api.github.com."""

    kind = (instance_kind or "").strip().casefold()
    raw = (base_url or "").strip().rstrip("/")
    if kind in {"ghes", "github_enterprise", "github-enterprise"}:
        if not raw:
            raise ProviderError("invalid_request", "GHES connectors require an https API base URL.")
        parsed = urlsplit(raw)
        if parsed.scheme.casefold() != "https" or not parsed.netloc:
            raise ProviderError("invalid_request", "GHES API base URL must be https.")
        if parsed.hostname and parsed.hostname.casefold() in {"github.com", "api.github.com"}:
            raise ProviderError("invalid_request", "GHES base URL cannot point at github.com.")
        return raw
    if kind in {"github.com", "github", ""}:
        return GITHUB_COM_API
    raise ProviderError("invalid_request", f"Unsupported GitHub instance kind: {instance_kind}.")


@dataclass
class GitHubAppCredentials:
    """Installation-bound App material. PEM and tokens never appear in repr."""

    app_id: str
    installation_id: str
    private_key_pem: str
    instance_kind: str = "github.com"
    base_url: str = ""

    def __repr__(self) -> str:
        return (
            "GitHubAppCredentials("
            f"app_id={self.app_id!r}, installation_id={self.installation_id!r}, "
            f"instance_kind={self.instance_kind!r}, base_url={self.base_url!r})"
        )

    def __str__(self) -> str:
        return repr(self)

    @property
    def api_root(self) -> str:
        return api_root_for(instance_kind=self.instance_kind, base_url=self.base_url)


@dataclass
class InstallationToken:
    token: str
    expires_at: datetime
    permissions: dict[str, str]
    repository_selection: str = "selected"

    def __repr__(self) -> str:
        return (
            "InstallationToken(redacted, "
            f"expires_at={self.expires_at.isoformat()}, "
            f"permissions={sorted(self.permissions)})"
        )

    def __str__(self) -> str:
        return repr(self)


class GitHubAppAuth:
    """Mint App JWTs and cache installation tokens under a process lock."""

    def __init__(
        self,
        credentials: GitHubAppCredentials,
        *,
        http: TrackerHttp | None = None,
        forge_hosts_raw: str = "",
        clock: Clock | None = None,
        sender: Callable[..., Any] | None = None,
    ) -> None:
        self.credentials = credentials
        self._clock = clock or _utcnow
        self._lock = threading.Lock()
        self._cached: InstallationToken | None = None
        host = urlsplit(credentials.api_root).hostname or ""
        self.http = http or TrackerHttp(
            forge_hosts_raw=forge_hosts_raw,
            extra_hosts=(host,) if host else (),
            sender=sender,
        )

    def url(self, path: str) -> str:
        root = self.credentials.api_root.rstrip("/")
        suffix = path if path.startswith("/") else f"/{path}"
        return f"{root}{suffix}"

    def mint_jwt(self) -> str:
        now = self._clock()
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        payload = {
            "iss": str(self.credentials.app_id),
            "iat": int((now - JWT_IAT_SKEW).timestamp()),
            "exp": int((now + JWT_LIFETIME).timestamp()),
        }
        try:
            return jwt.encode(
                payload,
                self.credentials.private_key_pem,
                algorithm="RS256",
            )
        except Exception as exc:  # pragma: no cover - PyJWT type surface
            raise ProviderError("invalid_request", "GitHub App private key is unusable.") from exc

    def app_headers(self) -> dict[str, str]:
        return self._headers(self.mint_jwt())

    def installation_headers(self) -> dict[str, str]:
        return self._headers(self.installation_token().token)

    def token_for_write(self) -> InstallationToken:
        """Installation token only. User OAuth material is not accepted here."""

        return self.installation_token()

    def installation_token(self) -> InstallationToken:
        with self._lock:
            cached = self._cached
            if cached is not None and not self._needs_refresh(cached):
                return cached
            minted = self._mint_installation_token()
            self._cached = minted
            return minted

    def test_connection(
        self,
        *,
        remote_container_id: str | None = None,
    ) -> dict[str, Any]:
        """Probe installation coverage, permissions, bot identity and visibility.

        Does not enable writes when auth, permissions or visibility fail.
        """

        app = self._get_json("GET", "/app", headers=self.app_headers())
        slug = str(app.get("slug") or "").strip()
        installation = self._get_json(
            "GET",
            f"/app/installations/{self.credentials.installation_id}",
            headers=self.app_headers(),
        )
        if installation.get("suspended_at"):
            raise ProviderError(
                "auth_lost",
                "GitHub App installation is suspended.",
                status=401,
            )
        token = self.installation_token()
        bot = {"id": "", "login": "", "isBot": True}
        if slug:
            # The App JWT is only accepted on /app* routes; GitHub answers 401
            # "Bad credentials" to /users/* with it. Resolve the bot identity
            # with the installation token instead.
            user = self._get_json("GET", f"/users/{slug}[bot]", headers=self.installation_headers())
            bot = {
                "id": str(user.get("id") or ""),
                "login": str(user.get("login") or f"{slug}[bot]"),
                "isBot": True,
            }
        permissions_ok = token.permissions.get("issues") in REQUIRED_ISSUE_PERMISSIONS
        visibility = None
        paused_reason = None
        if not permissions_ok:
            paused_reason = "permissions"
        if remote_container_id:
            repo_id = _numeric_repository_id(remote_container_id)
            visibility = self._container_visibility(repo_id, token)
            if visibility == "unknown" and paused_reason is None:
                paused_reason = "visibility_unknown"
        writes_enabled = paused_reason is None and bool(bot["id"])
        return {
            "ok": writes_enabled,
            "writesEnabled": writes_enabled,
            "pausedReason": paused_reason,
            "bot": bot,
            "installationId": str(self.credentials.installation_id),
            "permissions": dict(token.permissions),
            "repositorySelection": token.repository_selection,
            "visibility": visibility,
            "apiRoot": self.credentials.api_root,
            "authKinds": (AUTH_APP, AUTH_INSTALLATION),
        }

    def list_repositories(self, *, max_pages: int = 5) -> list[dict[str, Any]]:
        """Repositories this installation can reach, for the destination picker.

        Bounded pagination: an installation covering hundreds of repositories
        still answers, and the picker falls back to a manual id past the bound.
        """

        repositories: list[dict[str, Any]] = []
        headers = self.installation_headers()
        for page in range(1, max_pages + 1):
            response = self.http.request(
                "GET",
                self.url(f"/installation/repositories?per_page=100&page={page}"),
                headers=headers,
            )
            body = self.http.outcome(response)
            payload = body.json() if body.content else {}
            items = payload.get("repositories") if isinstance(payload, dict) else None
            if not isinstance(items, list) or not items:
                break
            for item in items:
                if not isinstance(item, dict) or not item.get("id"):
                    continue
                repositories.append(
                    {
                        "id": str(item.get("id")),
                        "fullName": str(item.get("full_name") or ""),
                        "private": bool(item.get("private")),
                        "archived": bool(item.get("archived")),
                        "htmlUrl": str(item.get("html_url") or ""),
                    }
                )
            if len(items) < 100:
                break
        repositories.sort(key=lambda item: item["fullName"].casefold())
        return repositories

    def _needs_refresh(self, token: InstallationToken) -> bool:
        now = self._clock()
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        expires = token.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return expires <= now + TOKEN_REFRESH_SKEW

    def _mint_installation_token(self) -> InstallationToken:
        response = self.http.request(
            "POST",
            self.url(f"/app/installations/{self.credentials.installation_id}/access_tokens"),
            headers=self.app_headers(),
            json_body={},
        )
        try:
            body = self.http.outcome(response)
        except ProviderError as exc:
            if exc.class_ in {"auth_lost", "not_found_uncertain", "gone_confirmed"}:
                self._cached = None
                raise ProviderError(
                    "auth_lost",
                    "GitHub App installation was revoked or is not visible.",
                    status=exc.status,
                    retryable=False,
                ) from exc
            if exc.class_ == "forbidden":
                self._cached = None
                raise ProviderError(
                    "forbidden",
                    "GitHub App installation lacks required permissions.",
                    status=exc.status,
                    retryable=False,
                ) from exc
            raise
        payload = body.json() if body.content else {}
        token = str(payload.get("token") or "")
        if not token:
            raise ProviderError("auth_lost", "GitHub App installation token was empty.")
        expires_at = _parse_github_time(payload.get("expires_at"), fallback=self._clock() + timedelta(hours=1))
        permissions = {
            str(key): str(value)
            for key, value in dict(payload.get("permissions") or {}).items()
        }
        return InstallationToken(
            token=token,
            expires_at=expires_at,
            permissions=permissions,
            repository_selection=str(payload.get("repository_selection") or "selected"),
        )

    def _container_visibility(self, remote_container_id: str, token: InstallationToken) -> str:
        repo_id = _numeric_repository_id(remote_container_id)
        response = self.http.request(
            "GET",
            self.url(f"/repositories/{repo_id}"),
            headers=self._headers(token.token),
        )
        try:
            body = self.http.outcome(response)
        except ProviderError as exc:
            if exc.class_ in {"not_found_uncertain", "forbidden", "auth_lost"}:
                return "unknown"
            raise
        payload = body.json() if body.content else {}
        if "private" not in payload:
            return "unknown"
        return "private" if payload.get("private") else "public"

    def _get_json(self, method: str, path: str, *, headers: Mapping[str, str]) -> dict:
        response = self.http.request(method, self.url(path), headers=headers)
        try:
            body = self.http.outcome(response)
        except ProviderError as exc:
            if exc.class_ in {"auth_lost", "not_found_uncertain", "gone_confirmed"}:
                raise ProviderError(
                    "auth_lost",
                    "GitHub App installation was revoked or is not visible.",
                    status=exc.status,
                    retryable=False,
                ) from exc
            raise
        payload = body.json() if body.content else {}
        return payload if isinstance(payload, dict) else {}

    def _headers(self, bearer: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {bearer}",
            "Accept": ACCEPT,
            "X-GitHub-Api-Version": API_VERSION,
        }


def _numeric_repository_id(value: str) -> str:
    normalized = str(value or "").strip()
    if not _NUMERIC_REPOSITORY_ID.fullmatch(normalized):
        raise ProviderError("invalid_request", "remote_container_id must be a numeric repository id.")
    return normalized


def _parse_github_time(value: Any, *, fallback: datetime) -> datetime:
    text = str(value or "").strip()
    if not text:
        return fallback
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return fallback
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)
