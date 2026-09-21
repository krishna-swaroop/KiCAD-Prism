"""GitLab bot / service-account credentials (TR-47, C3, C9).

Bot writes use a dedicated bot user, service-account, or project/group access
token only. A revoked or expired bot token is ``auth_lost`` and never falls
back to a user OAuth grant. gitlab.com talks to ``https://gitlab.com/api/v4``;
self-hosted instances talk only to the connector ``base_url``.

Webhook token-auth and ``/personal_access_tokens/self`` are capability-probed.
Prism does not assume every GitLab deployment supports the same hook auth or
token-introspection features.
"""

from __future__ import annotations

import re
import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Mapping, Optional
from urllib.parse import urlsplit

from app.services.trackers.capabilities import ProviderCapabilities
from app.services.trackers.contracts import Container
from app.services.trackers.errors import ProviderError
from app.services.trackers.http import TrackerHttp

GITLAB_COM_API = "https://gitlab.com/api/v4"
GITLAB_COM_WEB = "https://gitlab.com"
TOKEN_REFRESH_SKEW = timedelta(seconds=60)
REQUIRED_WRITE_SCOPES = frozenset({"api"})
# GitLab access levels: Reporter=20, Developer=30, Maintainer=40, Owner=50.
MIN_ISSUE_WRITE_ACCESS_LEVEL = 30
AUTH_BOT = "bot"
AUTH_SERVICE_ACCOUNT = "service_account"
AUTH_PROJECT_TOKEN = "project"
AUTH_GROUP_TOKEN = "group"
_NUMERIC_ID = re.compile(r"^[0-9]+$")

Clock = Callable[[], datetime]

# Decision F10.gitlab_group_vs_project (TR-47): groups expose immutable id +
# visibility for destination selection; issue writes require a project
# container. A group alone never hosts issues.
GROUP_ISSUE_HOST = "project"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def api_root_for(*, instance_kind: str, base_url: str = "") -> str:
    """Resolve the REST root. Self-hosted never inherits gitlab.com."""

    kind = (instance_kind or "").strip().casefold()
    raw = (base_url or "").strip().rstrip("/")
    if kind in {"self_hosted", "self-hosted", "gitlab_self_managed", "gitlab-self-managed", "gits"}:
        if not raw:
            raise ProviderError(
                "invalid_request",
                "Self-hosted GitLab connectors require an https API base URL.",
            )
        parsed = urlsplit(raw)
        if parsed.scheme.casefold() != "https" or not parsed.netloc:
            raise ProviderError("invalid_request", "GitLab API base URL must be https.")
        if parsed.hostname and parsed.hostname.casefold() in {"gitlab.com", "www.gitlab.com"}:
            raise ProviderError("invalid_request", "Self-hosted base URL cannot point at gitlab.com.")
        if raw.endswith("/api/v4"):
            return raw
        return f"{raw}/api/v4"
    if kind in {"gitlab.com", "gitlab", ""}:
        return GITLAB_COM_API
    raise ProviderError("invalid_request", f"Unsupported GitLab instance kind: {instance_kind}.")


def web_root_for(*, instance_kind: str, base_url: str = "", web_url: str = "") -> str:
    """Web origin for OAuth authorize/token pages."""

    explicit = (web_url or "").strip().rstrip("/")
    if explicit:
        parsed = urlsplit(explicit)
        if parsed.scheme.casefold() != "https" or not parsed.netloc:
            raise ProviderError("invalid_request", "GitLab web URL must be https.")
        return explicit
    kind = (instance_kind or "").strip().casefold()
    if kind in {"self_hosted", "self-hosted", "gitlab_self_managed", "gitlab-self-managed", "gits"}:
        api = api_root_for(instance_kind=instance_kind, base_url=base_url)
        parsed = urlsplit(api)
        path = parsed.path.rstrip("/")
        if path.endswith("/api/v4"):
            path = path[: -len("/api/v4")]
        from urllib.parse import urlunsplit

        return urlunsplit((parsed.scheme, parsed.netloc, path, "", "")).rstrip("/") or f"{parsed.scheme}://{parsed.netloc}"
    return GITLAB_COM_WEB


def gitlab_com_capabilities(*, api_version: str = "v4") -> ProviderCapabilities:
    """Documented gitlab.com defaults. Self-hosted must not reuse blindly."""

    return ProviderCapabilities(
        provider="gitlab",
        canEditOwnComment=True,
        canDeleteOwnComment=True,
        canEditIssueBody=True,
        # resource_state_events when the instance exposes them (F10 / TR-48).
        hasStateEvents=True,
        # Project transfer identity is not claimed until a fixture proves it.
        hasTransferEvents=False,
        supportsConditionalGet=True,
        # Free tier historically one assignee; Premium may differ — do not claim 10.
        maxAssignees=1,
        apiVersion=api_version,
        instanceKind="gitlab",
    )


def self_hosted_capabilities(*, api_version: str = "v4") -> ProviderCapabilities:
    """Conservative self-hosted defaults — features are probed, not assumed."""

    return ProviderCapabilities(
        provider="gitlab",
        canEditOwnComment=True,
        canDeleteOwnComment=True,
        canEditIssueBody=True,
        hasStateEvents=False,
        hasTransferEvents=False,
        supportsConditionalGet=False,
        maxAssignees=1,
        apiVersion=api_version,
        instanceKind="gitlab",
    )


@dataclass
class GitLabBotCredentials:
    """Bot writing material. The access token never appears in repr."""

    access_token: str
    instance_kind: str = "gitlab.com"
    base_url: str = ""
    token_kind: str = AUTH_BOT
    # Optional declared expiry from admin entry; otherwise probed from GitLab.
    expires_at: Optional[datetime] = None

    def __repr__(self) -> str:
        return (
            "GitLabBotCredentials("
            f"instance_kind={self.instance_kind!r}, base_url={self.base_url!r}, "
            f"token_kind={self.token_kind!r})"
        )

    def __str__(self) -> str:
        return repr(self)

    @property
    def api_root(self) -> str:
        return api_root_for(instance_kind=self.instance_kind, base_url=self.base_url)


@dataclass
class BotToken:
    token: str
    expires_at: Optional[datetime] = None
    scopes: list[str] = field(default_factory=list)
    token_kind: str = AUTH_BOT

    def __repr__(self) -> str:
        return (
            "BotToken(redacted, "
            f"expires_at={self.expires_at.isoformat() if self.expires_at else None}, "
            f"scopes={sorted(self.scopes)}, token_kind={self.token_kind!r})"
        )

    def __str__(self) -> str:
        return repr(self)


@dataclass(frozen=True)
class GitLabAuthCapabilities:
    """Observed instance differences for F3/F10 capability fixtures."""

    supportsPersonalAccessTokenSelf: bool
    supportsWebhookTokenAuth: bool
    supportsProjectAccessTokens: bool
    supportsGroupAccessTokens: bool
    groupIssuesRequireProject: bool = True
    instanceKind: str = "gitlab.com"
    apiVersion: str = "v4"

    def to_dto(self) -> dict[str, Any]:
        return {
            "supportsPersonalAccessTokenSelf": self.supportsPersonalAccessTokenSelf,
            "supportsWebhookTokenAuth": self.supportsWebhookTokenAuth,
            "supportsProjectAccessTokens": self.supportsProjectAccessTokens,
            "supportsGroupAccessTokens": self.supportsGroupAccessTokens,
            "groupIssuesRequireProject": self.groupIssuesRequireProject,
            "groupIssueHost": GROUP_ISSUE_HOST,
            "instanceKind": self.instanceKind,
            "apiVersion": self.apiVersion,
        }


class GitLabBotAuth:
    """Bot-token credentials for gitlab.com and self-hosted GitLab."""

    def __init__(
        self,
        credentials: GitLabBotCredentials,
        *,
        http: TrackerHttp | None = None,
        forge_hosts_raw: str = "",
        clock: Clock | None = None,
        sender: Callable[..., Any] | None = None,
    ) -> None:
        self.credentials = credentials
        self._clock = clock or _utcnow
        self._lock = threading.Lock()
        self._cached: BotToken | None = None
        self._probed_caps: GitLabAuthCapabilities | None = None
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

    def bot_headers(self) -> dict[str, str]:
        token = self.token_for_write().token
        return self._headers(token)

    def token_for_write(self) -> BotToken:
        """Bot / service-account token only. User OAuth material is not accepted."""

        with self._lock:
            cached = self._cached
            if cached is not None and not self._needs_refresh(cached):
                return cached
            minted = self._materialize_token()
            self._cached = minted
            return minted

    def capabilities(self) -> ProviderCapabilities:
        kind = (self.credentials.instance_kind or "").strip().casefold()
        if kind in {"gitlab.com", "gitlab", ""}:
            return gitlab_com_capabilities()
        return self_hosted_capabilities()

    def auth_capabilities(self) -> GitLabAuthCapabilities:
        """Return last probed auth/hook capabilities, or conservative defaults."""

        if self._probed_caps is not None:
            return self._probed_caps
        kind = (self.credentials.instance_kind or "").strip().casefold()
        gitlab_com = kind in {"gitlab.com", "gitlab", ""}
        return GitLabAuthCapabilities(
            supportsPersonalAccessTokenSelf=gitlab_com,
            # Self-hosted and older CE may lack token webhook secrets / PAT self.
            supportsWebhookTokenAuth=gitlab_com,
            supportsProjectAccessTokens=True,
            supportsGroupAccessTokens=gitlab_com,
            groupIssuesRequireProject=True,
            instanceKind="gitlab.com" if gitlab_com else "self_hosted",
        )

    def get_container(
        self,
        *,
        container_kind: str,
        remote_container_id: str,
    ) -> Container:
        """Resolve project or group identity (F10.gitlab_group_vs_project)."""

        kind = (container_kind or "").strip().casefold()
        container_id = _numeric_id(remote_container_id)
        if kind == "project":
            payload = self._get_json(
                "GET",
                f"/projects/{container_id}?license=false&statistics=false",
                headers=self.bot_headers(),
            )
            return _container_from_project(payload, container_id)
        if kind == "group":
            payload = self._get_json("GET", f"/groups/{container_id}", headers=self.bot_headers())
            return _container_from_group(payload, container_id)
        raise ProviderError(
            "invalid_request",
            "GitLab container_kind must be project or group.",
        )

    def test_connection(
        self,
        *,
        remote_container_id: str | None = None,
        container_kind: str = "project",
    ) -> dict[str, Any]:
        """Probe bot identity, scopes and project/group access.

        Does not enable writes when auth, scopes or visibility fail. Never
        sends a user OAuth token.
        """

        token = self.token_for_write()
        headers = self._headers(token.token)
        user = self._get_json("GET", "/user", headers=headers)
        bot_id = str(user.get("id") or "").strip()
        if not bot_id:
            raise ProviderError("auth_lost", "GitLab bot profile was empty.")
        bot_login = str(user.get("username") or user.get("name") or "")
        bot = {
            "id": bot_id,
            "login": bot_login,
            "isBot": True,
            "displayName": str(user.get("name") or "") or None,
        }

        scopes, pat_self_ok = self._probe_token_scopes(headers)
        if not scopes:
            scopes = list(token.scopes)
        token.scopes = list(scopes)
        self._cached = token

        permissions: dict[str, Any] = {"scopes": list(scopes)}
        paused_reason = None
        scopes_ok = bool(REQUIRED_WRITE_SCOPES.intersection(scopes)) if scopes else False
        # Project/group access tokens may omit PAT self; fall back to membership.
        if not scopes and self.credentials.token_kind in {
            AUTH_PROJECT_TOKEN,
            AUTH_GROUP_TOKEN,
            AUTH_SERVICE_ACCOUNT,
            AUTH_BOT,
        }:
            scopes_ok = True  # defer to container access_level probe
        if scopes and not scopes_ok:
            paused_reason = "permissions"

        visibility = None
        container = None
        if remote_container_id:
            kind = (container_kind or "project").strip().casefold() or "project"
            container_id = _numeric_id(remote_container_id)
            try:
                if kind == "project":
                    payload = self._get_json(
                        "GET",
                        f"/projects/{container_id}?license=false&statistics=false",
                        headers=headers,
                    )
                    container = _container_from_project(payload, container_id)
                    visibility = container.visibility
                    access_level = _access_level_from_permissions(payload.get("permissions"))
                    permissions["accessLevel"] = access_level
                    permissions["issues"] = (
                        "write"
                        if access_level is not None and access_level >= MIN_ISSUE_WRITE_ACCESS_LEVEL
                        else "read"
                    )
                    if (
                        access_level is not None
                        and access_level < MIN_ISSUE_WRITE_ACCESS_LEVEL
                        and paused_reason is None
                    ):
                        paused_reason = "permissions"
                        scopes_ok = False
                elif kind == "group":
                    payload = self._get_json("GET", f"/groups/{container_id}", headers=headers)
                    container = _container_from_group(payload, container_id)
                    visibility = container.visibility
                    # Group destinations are selectable; issue writes need a project.
                    permissions["issues"] = "group_requires_project"
                    permissions["groupIssueHost"] = GROUP_ISSUE_HOST
                    access_level = _access_level_from_permissions(payload.get("permissions"))
                    if access_level is not None:
                        permissions["accessLevel"] = access_level
                else:
                    raise ProviderError(
                        "invalid_request",
                        "GitLab container_kind must be project or group.",
                    )
            except ProviderError as exc:
                if exc.class_ in {"not_found_uncertain", "forbidden", "auth_lost"}:
                    visibility = "unknown"
                    if paused_reason is None:
                        paused_reason = "visibility_unknown"
                else:
                    raise

        webhook_token_auth = self._probe_webhook_token_support(headers)
        self._probed_caps = GitLabAuthCapabilities(
            supportsPersonalAccessTokenSelf=pat_self_ok,
            supportsWebhookTokenAuth=webhook_token_auth,
            supportsProjectAccessTokens=True,
            supportsGroupAccessTokens=True,
            groupIssuesRequireProject=True,
            instanceKind=(
                "gitlab.com"
                if (self.credentials.instance_kind or "").strip().casefold() in {"gitlab.com", "gitlab", ""}
                else "self_hosted"
            ),
        )

        writes_enabled = paused_reason is None and bool(bot_id) and (
            scopes_ok or permissions.get("issues") == "write"
        )
        if permissions.get("issues") == "group_requires_project":
            # Selecting a group alone does not enable issue writes.
            writes_enabled = False
            if paused_reason is None:
                paused_reason = "group_requires_project"

        return {
            "ok": writes_enabled,
            "writesEnabled": writes_enabled,
            "pausedReason": paused_reason,
            "bot": bot,
            "permissions": permissions,
            "visibility": visibility,
            "container": container.model_dump() if container is not None else None,
            "apiRoot": self.credentials.api_root,
            "authKinds": (AUTH_BOT, self.credentials.token_kind),
            "tokenKind": self.credentials.token_kind,
            "authCapabilities": self._probed_caps.to_dto(),
            "capabilities": self.capabilities().to_dto(),
        }

    def _materialize_token(self) -> BotToken:
        raw = (self.credentials.access_token or "").strip()
        if not raw:
            raise ProviderError("auth_lost", "GitLab bot access token is missing.")
        # Reject obvious user-OAuth placeholders callers might pass by mistake.
        if raw.startswith("user-oauth:") or raw.startswith("oauth:"):
            raise ProviderError(
                "invalid_request",
                "Bot writes require a bot or service-account token, not a user OAuth grant.",
            )
        expires = self.credentials.expires_at
        if expires is not None and self._is_expired(expires):
            raise ProviderError("auth_lost", "GitLab bot token is expired.")
        return BotToken(
            token=raw,
            expires_at=expires,
            scopes=[],
            token_kind=self.credentials.token_kind or AUTH_BOT,
        )

    def _needs_refresh(self, token: BotToken) -> bool:
        if token.expires_at is None:
            return False
        return self._is_expired(token.expires_at, skew=TOKEN_REFRESH_SKEW)

    def _is_expired(self, expires_at: datetime, *, skew: timedelta = timedelta(0)) -> bool:
        now = self._clock()
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        expires = expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return expires <= now + skew

    def _probe_token_scopes(self, headers: Mapping[str, str]) -> tuple[list[str], bool]:
        """``GET /personal_access_tokens/self`` when the instance supports it."""

        response = self.http.request("GET", self.url("/personal_access_tokens/self"), headers=headers)
        try:
            body = self.http.outcome(response)
        except ProviderError as exc:
            if exc.class_ in {"not_found_uncertain", "gone_confirmed", "forbidden", "capability_missing"}:
                return [], False
            if exc.class_ == "auth_lost":
                raise ProviderError(
                    "auth_lost",
                    "GitLab bot token is expired or revoked.",
                    status=exc.status,
                    retryable=False,
                ) from exc
            # Some CE builds return 404/405 for unsupported routes.
            if exc.status in {404, 405}:
                return [], False
            raise
        payload = body.json() if body.content else {}
        if not isinstance(payload, dict):
            return [], True
        if payload.get("revoked") is True or payload.get("active") is False:
            raise ProviderError("auth_lost", "GitLab bot token is revoked.")
        expires_text = payload.get("expires_at")
        if expires_text:
            parsed = _parse_gitlab_time(expires_text, fallback=None)
            if parsed is not None and self._is_expired(parsed):
                raise ProviderError("auth_lost", "GitLab bot token is expired.")
            if self._cached is not None and parsed is not None:
                self._cached.expires_at = parsed
        scopes = [str(item) for item in list(payload.get("scopes") or []) if str(item).strip()]
        return scopes, True

    def _probe_webhook_token_support(self, headers: Mapping[str, str]) -> bool:
        """Do not assume token-based webhook auth on every deployment.

        gitlab.com documents token secrets on project hooks. Self-hosted and
        older CE builds may only support URL query secrets or none — callers
        must read ``authCapabilities.supportsWebhookTokenAuth``.
        """

        kind = (self.credentials.instance_kind or "").strip().casefold()
        if kind in {"gitlab.com", "gitlab", ""}:
            return True
        # Self-hosted: treat as unknown/unsupported until a later ticket proves it.
        del headers
        return False

    def _get_json(self, method: str, path: str, *, headers: Mapping[str, str]) -> dict:
        response = self.http.request(method, self.url(path), headers=headers)
        try:
            body = self.http.outcome(response)
        except ProviderError as exc:
            if exc.class_ in {"auth_lost", "gone_confirmed"}:
                raise ProviderError(
                    "auth_lost",
                    "GitLab bot token is expired or revoked.",
                    status=exc.status,
                    retryable=False,
                ) from exc
            raise
        payload = body.json() if body.content else {}
        return payload if isinstance(payload, dict) else {}

    def _headers(self, token: str) -> dict[str, str]:
        # Match Release Studio / forge_publish_service: PRIVATE-TOKEN for PATs.
        return {"PRIVATE-TOKEN": token, "Accept": "application/json"}


def _numeric_id(value: str) -> str:
    normalized = str(value or "").strip()
    if not _NUMERIC_ID.fullmatch(normalized):
        raise ProviderError("invalid_request", "remote_container_id must be a numeric GitLab id.")
    return normalized


def _container_from_project(payload: Mapping[str, Any], fallback_id: str) -> Container:
    return Container(
        remoteContainerId=str(payload.get("id") or fallback_id),
        path=str(payload.get("path_with_namespace") or payload.get("path") or ""),
        visibility=_visibility(payload.get("visibility")),
    )


def _container_from_group(payload: Mapping[str, Any], fallback_id: str) -> Container:
    return Container(
        remoteContainerId=str(payload.get("id") or fallback_id),
        path=str(payload.get("full_path") or payload.get("path") or ""),
        visibility=_visibility(payload.get("visibility")),
    )


def _access_level_from_permissions(value: Any) -> int | None:
    permissions = value if isinstance(value, dict) else {}
    levels: list[int] = []
    for key in ("project_access", "group_access"):
        block = permissions.get(key) if isinstance(permissions.get(key), dict) else {}
        level = block.get("access_level")
        if isinstance(level, int):
            levels.append(level)
        elif isinstance(level, str) and level.isdigit():
            levels.append(int(level))
    return max(levels) if levels else None


def _visibility(value: Any) -> str:
    text = str(value or "").strip().casefold()
    if text in {"public", "internal"}:
        # Prism destination visibility is public|private|unknown; internal ≈ private.
        return "public" if text == "public" else "private"
    if text == "private":
        return "private"
    return "unknown"


def _parse_gitlab_time(value: Any, *, fallback: datetime | None) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return fallback
    if len(text) == 10 and text[4] == "-" and text[7] == "-":
        # Date-only PAT expiry.
        text = f"{text}T23:59:59+00:00"
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return fallback
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


__all__ = [
    "AUTH_BOT",
    "AUTH_GROUP_TOKEN",
    "AUTH_PROJECT_TOKEN",
    "AUTH_SERVICE_ACCOUNT",
    "BotToken",
    "GITLAB_COM_API",
    "GITLAB_COM_WEB",
    "GROUP_ISSUE_HOST",
    "GitLabAuthCapabilities",
    "GitLabBotAuth",
    "GitLabBotCredentials",
    "api_root_for",
    "gitlab_com_capabilities",
    "self_hosted_capabilities",
    "web_root_for",
]
