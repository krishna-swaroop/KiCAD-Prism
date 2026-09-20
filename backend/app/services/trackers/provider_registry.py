"""Provider registry for tracker runtime composition (TR-62, C3).

Builds GitHub adapters and inbound fetchers from admin connector records.
Credentials stay in encrypted envelopes; this module never logs tokens or PEMs.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Callable, Mapping, Optional

from app.core.config import Settings, settings as default_settings
from app.services.trackers.contracts import CommentRead, Destination, IssueRead
from app.services.trackers.errors import ProviderError
from app.services.trackers.github_auth import GitHubAppAuth, GitHubAppCredentials
from app.services.trackers.github_comments import GitHubCommentAdapter
from app.services.trackers.github_issues import GitHubIssueAdapter
from app.services.trackers.github_updates import destination_for, list_destination_updates
from app.services.trackers.inbound import InboundFetcher
from app.services.trackers.secrets import decrypt_secret

CREDENTIAL_FIELD = "github_app"


@dataclass(frozen=True)
class DestinationContext:
    connector_id: str
    remote_container_id: str
    container_path: str
    destination_generation: int
    paused: bool
    provider: str
    writes_enabled: bool


@dataclass(frozen=True)
class TrackerProviderBundle:
    """Concrete provider adapters for one connector."""

    connector_id: str
    provider: str
    issue: GitHubIssueAdapter
    comment: GitHubCommentAdapter
    bot_user_id: str
    bot_login: str

    def destination(self, ctx: DestinationContext) -> Destination:
        return destination_for(
            connector_id=ctx.connector_id,
            container_path=ctx.container_path,
            remote_container_id=ctx.remote_container_id,
            generation=ctx.destination_generation,
        )

    def list_updates(self, dest: Destination, since_cursor):
        return list_destination_updates(self.issue, dest, since_cursor)


class ContextInboundFetcher(InboundFetcher):
    """Inbound fetcher bound to one destination."""

    def __init__(self, bundle: TrackerProviderBundle, ctx: DestinationContext) -> None:
        self._bundle = bundle
        self._ctx = ctx

    def fetch_issue(self, connector_id: str, container_id: str, external_id: str) -> IssueRead:
        del connector_id, container_id
        return self._bundle.issue.get_issue(self._bundle.destination(self._ctx), external_id, etag=None)

    def fetch_comment(self, connector_id: str, container_id: str, external_comment_id: str) -> CommentRead:
        del connector_id, container_id
        return self._bundle.comment.get_comment(
            self._bundle.destination(self._ctx),
            external_comment_id,
            etag=None,
        )


def _context(connector_id: str) -> dict[str, str]:
    return {"record": connector_id, "field": CREDENTIAL_FIELD}


def _load_connector(conn: Any, connector_id: str) -> Optional[dict[str, Any]]:
    row = conn.execute(
        "SELECT * FROM tracker_connectors WHERE id = %s",
        (connector_id,),
    ).fetchone()
    return dict(row) if row else None


def resolve_destination_context(
    conn: Any,
    *,
    connector_id: str,
    remote_container_id: str,
    workspace_schema: str = "workspace",
) -> Optional[DestinationContext]:
    connector = _load_connector(conn, connector_id)
    if connector is None:
        return None
    qual = f'"{workspace_schema}".project_trackers' if workspace_schema.replace("_", "").isalnum() else "project_trackers"
    row = conn.execute(
        f"""
        SELECT container_path, destination_generation
        FROM {qual}
        WHERE connector_id = %s AND remote_container_id = %s
        ORDER BY destination_generation DESC, created_at DESC NULLS LAST, id ASC
        LIMIT 1
        """,
        (connector_id, remote_container_id),
    ).fetchone()
    container_path = str((row or {}).get("container_path") or "")
    generation = int((row or {}).get("destination_generation") or 1)
    paused = bool(connector.get("paused"))
    credential_configured = bool(connector.get("credentialConfigured") or connector.get("credential_envelope"))
    bot_id = str(connector.get("bot_forge_user_id") or "")
    writes_enabled = (
        not paused
        and credential_configured
        and bool(bot_id)
        and str(connector.get("paused_reason") or "") not in {"revoked", "permissions", "test_failed", "auth_lost"}
    )
    return DestinationContext(
        connector_id=connector_id,
        remote_container_id=remote_container_id,
        container_path=container_path,
        destination_generation=generation,
        paused=paused,
        provider=str(connector.get("provider") or "github"),
        writes_enabled=writes_enabled,
    )


def build_github_bundle(
    connector: Mapping[str, Any],
    material: Mapping[str, Any],
    *,
    settings: Settings | None = None,
) -> TrackerProviderBundle:
    creds = GitHubAppCredentials(
        app_id=str(material.get("appId") or material.get("app_id") or ""),
        installation_id=str(material.get("installationId") or material.get("installation_id") or ""),
        private_key_pem=str(material.get("privateKey") or material.get("private_key") or ""),
        instance_kind=str(connector.get("instance_kind") or "github.com"),
        base_url=str(connector.get("base_url") or ""),
    )
    auth = GitHubAppAuth(creds)
    bot_user_id = str(connector.get("bot_forge_user_id") or "")
    bot_login = str(connector.get("bot_login") or "")
    issue = GitHubIssueAdapter(auth, http=auth.http, bot_user_id=bot_user_id, bot_login=bot_login)
    comment = GitHubCommentAdapter(auth, http=auth.http, bot_user_id=bot_user_id, bot_login=bot_login)
    return TrackerProviderBundle(
        connector_id=str(connector["id"]),
        provider="github",
        issue=issue,
        comment=comment,
        bot_user_id=bot_user_id,
        bot_login=bot_login,
    )


class ProviderRegistry:
    """Resolve connector credentials into concrete provider adapters."""

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        loader: Callable[[Mapping[str, Any], Mapping[str, Any]], TrackerProviderBundle] | None = None,
    ) -> None:
        self.settings = settings or default_settings
        self._loader = loader or build_github_bundle

    def bundle_for_connector(self, conn: Any, connector_id: str) -> Optional[TrackerProviderBundle]:
        connector = _load_connector(conn, connector_id)
        if connector is None:
            return None
        provider = str(connector.get("provider") or "")
        if provider != "github":
            return None
        envelope = connector.get("credential_envelope")
        if not envelope:
            return None
        try:
            material = json.loads(
                decrypt_secret(envelope, _context(connector_id), settings=self.settings).decode()
            )
        except Exception:
            return None
        if not material:
            return None
        try:
            return self._loader(connector, material, settings=self.settings)
        except ProviderError:
            return None

    def inbound_fetcher(
        self,
        conn: Any,
        ctx: DestinationContext,
    ) -> Optional[InboundFetcher]:
        bundle = self.bundle_for_connector(conn, ctx.connector_id)
        if bundle is None:
            return None
        return ContextInboundFetcher(bundle, ctx)


__all__ = [
    "ContextInboundFetcher",
    "DestinationContext",
    "ProviderRegistry",
    "TrackerProviderBundle",
    "build_github_bundle",
    "resolve_destination_context",
]
