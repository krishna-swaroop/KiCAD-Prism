"""Per-provider construction of tracker adapters.

The tracker runtime (executors, recovery, the provider registry, connector
administration and inbound webhooks) asks this module for a provider's pieces
instead of constructing a forge's classes itself. Adding an issue-capable
provider means adding one ``ProviderKit`` here; nothing else branches on the
provider name.

Imports of adapter modules stay inside the builder functions so that loading
this module does not pull every forge's HTTP stack into processes that only
need a display name.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Mapping, Optional

from app.services.trackers.contracts import Destination
from app.services.trackers.errors import ProviderError

# Display names are safe to use anywhere, including for hosts that only link
# accounts and therefore have no kit.
DISPLAY_NAMES: dict[str, str] = {
    "github": "GitHub",
    "gitlab": "GitLab",
    "gitea": "Gitea",
    "forgejo": "Forgejo",
}


def display_name(provider: str | None) -> str:
    """Human name for a provider id, e.g. ``gitlab`` -> ``GitLab``."""

    key = (provider or "").strip().casefold()
    if key == "github.com":
        key = "github"
    return DISPLAY_NAMES.get(key, key.title() or "the tracker")


@dataclass(frozen=True)
class WebhookCodec:
    """How one forge authenticates and describes a webhook delivery.

    ``verify`` gets the raw body so signatures are checked on the exact bytes
    the forge sent. ``parse`` returns durable hint dicts for ``InboxStore``.
    """

    delivery_id: Callable[[Mapping[str, str], bytes], str]
    event_type: Callable[[Mapping[str, str]], str]
    verify: Callable[[Mapping[str, str], bytes, str], bool]
    parse: Callable[..., list[dict]]


@dataclass(frozen=True)
class ProviderKit:
    """Everything the runtime needs from one issue-capable provider.

    ``credential_fields`` are the keys of the encrypted installation envelope;
    all are required once any is given. Webhook secrets and OAuth clients are
    stored separately and are not part of the envelope.
    """

    provider: str
    credential_fields: tuple[str, ...]
    credential_aliases: Mapping[str, str]
    credential_error: str
    issue_adapter: Callable[[Mapping[str, Any], Mapping[str, Any], Any], Any]
    comment_adapter: Callable[[Any, Mapping[str, Any]], Any]
    issue_page_fetcher: Callable[..., Any]
    comment_page_fetcher: Callable[[Any, Destination, str], Any]
    test_connection: Callable[[Mapping[str, Any], Mapping[str, Any]], dict[str, Any]]
    list_repositories: Callable[[Mapping[str, Any], Mapping[str, Any]], list[dict[str, Any]]]

    def credential_payload(self, credentials: Mapping[str, Any]) -> dict[str, str]:
        """Envelope fields from an admin request, accepting snake_case aliases."""

        payload: dict[str, str] = {}
        for field in self.credential_fields:
            alias = self.credential_aliases.get(field, "")
            payload[field] = str(credentials.get(field) or (credentials.get(alias) if alias else "") or "")
        return payload

    def has_credentials(self, credentials: Mapping[str, Any]) -> bool:
        return any(self.credential_payload(credentials).values())

    def require_complete(self, payload: Mapping[str, str]) -> None:
        if not all(str(payload.get(field) or "") for field in self.credential_fields):
            raise ProviderError("invalid_request", self.credential_error)


# --- GitHub -----------------------------------------------------------------


def _github_auth(connector: Mapping[str, Any], material: Mapping[str, Any], http: Any = None) -> Any:
    from app.services.trackers.github_auth import GitHubAppAuth, GitHubAppCredentials

    creds = GitHubAppCredentials(
        app_id=str(material.get("appId") or material.get("app_id") or ""),
        installation_id=str(material.get("installationId") or material.get("installation_id") or ""),
        private_key_pem=str(material.get("privateKey") or material.get("private_key") or ""),
        instance_kind=str(connector.get("instance_kind") or "github.com"),
        base_url=str(connector.get("base_url") or ""),
    )
    return GitHubAppAuth(creds, http=http) if http is not None else GitHubAppAuth(creds)


def _github_issue_adapter(connector: Mapping[str, Any], material: Mapping[str, Any], http: Any = None) -> Any:
    from app.services.trackers.github_issues import GitHubIssueAdapter

    auth = _github_auth(connector, material, http)
    return GitHubIssueAdapter(
        auth,
        http=auth.http,
        bot_user_id=str(connector.get("bot_forge_user_id") or ""),
        bot_login=str(connector.get("bot_login") or ""),
    )


def _github_comment_adapter(issue_adapter: Any, connector: Mapping[str, Any]) -> Any:
    from app.services.trackers.github_comments import GitHubCommentAdapter

    return GitHubCommentAdapter(
        issue_adapter.auth,
        http=issue_adapter.http,
        bot_user_id=str(connector.get("bot_forge_user_id") or ""),
        bot_login=str(connector.get("bot_login") or ""),
    )


def _github_issue_pages(adapter: Any, dest: Destination, *, since: str | None = None) -> Any:
    from app.services.trackers.github_recovery import make_issue_page_fetcher

    return make_issue_page_fetcher(adapter, dest, since=since)


def _github_comment_pages(adapter: Any, dest: Destination, issue: str) -> Any:
    from app.services.trackers.github_recovery import make_comment_page_fetcher

    return make_comment_page_fetcher(adapter, dest, issue)


def _github_test(connector: Mapping[str, Any], material: Mapping[str, Any]) -> dict[str, Any]:
    return _github_auth(connector, material).test_connection()


def _github_repositories(connector: Mapping[str, Any], material: Mapping[str, Any]) -> list[dict[str, Any]]:
    return _github_auth(connector, material).list_repositories()


def _github_webhook() -> WebhookCodec:
    from app.services.trackers import github_webhooks as hooks

    return WebhookCodec(
        delivery_id=lambda headers, _body: headers.get(hooks.DELIVERY_HEADER, "").strip(),
        event_type=lambda headers: headers.get(hooks.EVENT_HEADER, "").strip(),
        verify=hooks.verify_signature,
        parse=hooks.parse_github_event,
    )


GITHUB = ProviderKit(
    provider="github",
    credential_fields=("appId", "installationId", "privateKey"),
    credential_aliases={"appId": "app_id", "installationId": "installation_id", "privateKey": "private_key"},
    credential_error="GitHub App id, installation id and private key are required.",
    issue_adapter=_github_issue_adapter,
    comment_adapter=_github_comment_adapter,
    issue_page_fetcher=_github_issue_pages,
    comment_page_fetcher=_github_comment_pages,
    test_connection=_github_test,
    list_repositories=_github_repositories,
)


# --- GitLab (gitlab.com and self-managed) ------------------------------------

GITLAB_REPOSITORY_LIMIT = 1000


def _gitlab_auth(connector: Mapping[str, Any], material: Mapping[str, Any], http: Any = None) -> Any:
    from app.services.trackers.gitlab_auth import AUTH_BOT, GitLabBotAuth, GitLabBotCredentials

    creds = GitLabBotCredentials(
        access_token=str(material.get("accessToken") or material.get("access_token") or ""),
        instance_kind=str(connector.get("instance_kind") or "gitlab.com"),
        base_url=str(connector.get("base_url") or ""),
        token_kind=str(material.get("tokenKind") or AUTH_BOT),
    )
    return GitLabBotAuth(creds, http=http) if http is not None else GitLabBotAuth(creds)


def _gitlab_issue_adapter(connector: Mapping[str, Any], material: Mapping[str, Any], http: Any = None) -> Any:
    from app.services.trackers.gitlab_issues import GitLabIssueAdapter

    auth = _gitlab_auth(connector, material, http)
    return GitLabIssueAdapter(
        auth,
        http=auth.http,
        bot_user_id=str(connector.get("bot_forge_user_id") or ""),
        bot_login=str(connector.get("bot_login") or ""),
    )


def _gitlab_comment_adapter(issue_adapter: Any, connector: Mapping[str, Any]) -> Any:
    from app.services.trackers.gitlab_comments import GitLabCommentAdapter

    return GitLabCommentAdapter(
        issue_adapter.auth,
        http=issue_adapter.http,
        bot_user_id=str(connector.get("bot_forge_user_id") or ""),
        bot_login=str(connector.get("bot_login") or ""),
    )


def _gitlab_issue_pages(adapter: Any, dest: Destination, *, since: str | None = None) -> Any:
    """Recovery pages of bot-authored issues.

    The recovery scanner reads GitHub's issue fields (``body``, ``user.id``,
    ``number``, ``html_url``); each GitLab issue is presented in that shape so
    the scanner and its marker validation stay shared.
    """

    first_url, first_params = adapter.bot_issue_query(dest, since=since)

    def fetch(cursor: Optional[str]) -> Any:
        # The cursor is GitLab's next-page URL, so a scan can resume or restart.
        response = adapter._request("GET", cursor or first_url, params=None if cursor else first_params)
        page = [item for item in adapter._json_list(response) if isinstance(item, dict)]
        items = [
            {
                "id": item.get("id"),
                "number": item.get("iid"),
                "body": item.get("description") or "",
                "user": {"id": (item.get("author") or {}).get("id")},
                "html_url": item.get("web_url") or "",
            }
            for item in page
        ]
        return items, response.next_page()

    return fetch


def _gitlab_comment_pages(adapter: Any, dest: Destination, issue: str) -> Any:
    from app.services.trackers.github_recovery import make_comment_page_fetcher

    # Provider-neutral: it walks ``adapter.list_comments``.
    return make_comment_page_fetcher(adapter, dest, issue)


def _gitlab_test(connector: Mapping[str, Any], material: Mapping[str, Any]) -> dict[str, Any]:
    return _gitlab_auth(connector, material).test_connection()


def _gitlab_repositories(connector: Mapping[str, Any], material: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Projects the bot can write issues in (Reporter or above), for the picker."""

    auth = _gitlab_auth(connector, material)
    url: Optional[str] = auth.url("/projects")
    params: Optional[dict[str, Any]] = {
        "membership": "true",
        # Developer, the level the connection test requires to publish.
        "min_access_level": 30,
        "archived": "false",
        "simple": "true",
        "order_by": "path",
        "sort": "asc",
        "per_page": 100,
    }
    repositories: list[dict[str, Any]] = []
    while url and len(repositories) < GITLAB_REPOSITORY_LIMIT:
        response = auth.http.outcome(auth.http.request("GET", url, headers=auth.bot_headers(), params=params))
        params = None
        payload = response.json() if response.content else []
        for item in payload if isinstance(payload, list) else []:
            if not isinstance(item, dict) or item.get("id") is None:
                continue
            repositories.append(
                {
                    "id": str(item["id"]),
                    "fullName": str(item.get("path_with_namespace") or ""),
                    # ``simple`` omits visibility; the destination probe reports it on save.
                    "private": str(item.get("visibility") or "private") != "public",
                    "archived": bool(item.get("archived")),
                    "htmlUrl": str(item.get("web_url") or ""),
                }
            )
        url = response.next_page()
    return repositories


def _gitlab_webhook() -> WebhookCodec:
    from app.services.trackers import gitlab_webhooks as hooks

    return WebhookCodec(
        delivery_id=hooks.delivery_id,
        event_type=lambda headers: hooks.event_type(headers),
        verify=hooks.verify_token,
        parse=hooks.parse_gitlab_event,
    )


GITLAB = ProviderKit(
    provider="gitlab",
    credential_fields=("accessToken",),
    credential_aliases={"accessToken": "access_token"},
    credential_error="A GitLab bot access token is required.",
    issue_adapter=_gitlab_issue_adapter,
    comment_adapter=_gitlab_comment_adapter,
    issue_page_fetcher=_gitlab_issue_pages,
    comment_page_fetcher=_gitlab_comment_pages,
    test_connection=_gitlab_test,
    list_repositories=_gitlab_repositories,
)


# --- Registry ---------------------------------------------------------------

_KITS: dict[str, ProviderKit] = {GITHUB.provider: GITHUB, GITLAB.provider: GITLAB}
_WEBHOOK_FACTORIES: dict[str, Callable[[], WebhookCodec]] = {"github": _github_webhook, "gitlab": _gitlab_webhook}


def is_issue_provider(provider: str | None) -> bool:
    return (provider or "") in _KITS


def kit_for(provider: str | None) -> ProviderKit:
    kit = _KITS.get(provider or "")
    if kit is not None:
        return kit
    if (provider or "") in DISPLAY_NAMES:
        raise ProviderError(
            "capability_missing",
            f"Issue publishing is not available for {display_name(provider)} yet; this host is for account linking.",
        )
    raise ProviderError("invalid_request", f"Unknown tracker provider {provider!r}.")


def webhook_codec(provider: str | None) -> Optional[WebhookCodec]:
    factory = _WEBHOOK_FACTORIES.get(provider or "")
    return factory() if factory else None


def issue_adapter_for(connector: Mapping[str, Any], material: Mapping[str, Any], *, http: Any = None) -> Any:
    return kit_for(str(connector.get("provider") or "")).issue_adapter(connector, material, http)


def comment_adapter_for(connector: Mapping[str, Any], issue_adapter: Any) -> Any:
    return kit_for(str(connector.get("provider") or "")).comment_adapter(issue_adapter, connector)


# Recovery pages are read with the adapter that will act on the result, so the
# adapter's own ``kind`` picks the kit; callers cannot pair it with another forge.
def issue_page_fetcher_for(adapter: Any, dest: Destination, *, since: str | None = None) -> Any:
    return kit_for(adapter.kind).issue_page_fetcher(adapter, dest, since=since)


def comment_page_fetcher_for(adapter: Any, dest: Destination, issue: str) -> Any:
    return kit_for(adapter.kind).comment_page_fetcher(adapter, dest, issue)


__all__ = [
    "DISPLAY_NAMES",
    "GITHUB",
    "GITLAB",
    "ProviderKit",
    "WebhookCodec",
    "comment_adapter_for",
    "comment_page_fetcher_for",
    "display_name",
    "is_issue_provider",
    "issue_adapter_for",
    "issue_page_fetcher_for",
    "kit_for",
    "webhook_codec",
]
