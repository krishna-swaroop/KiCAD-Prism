"""GitHub webhook verification and hint parsing (TR-27, C3/C6).

Verification uses the raw request bytes. Parsed hints carry object references
only; authoritative state is fetched later by the worker. Delivery ids dedupe
through ``InboxStore`` before a 2xx is returned.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Callable, Mapping, Sequence
from uuid import uuid4

from app.core.config import Settings, settings as default_settings
from app.services.trackers.inbox_store import InboxStore, apply_schema as apply_inbox_schema
from app.services.trackers.secrets import decrypt_secret, encrypt_secret

logger = logging.getLogger(__name__)

MAX_BODY_BYTES = 256 * 1024
SIGNATURE_HEADER = "x-hub-signature-256"
DELIVERY_HEADER = "x-github-delivery"
EVENT_HEADER = "x-github-event"
SECRET_FIELD = "webhook_secret"
KNOWN_EVENTS = frozenset(
    {
        "issues",
        "issue_comment",
        "installation",
        "installation_repositories",
        "meta",
        "ping",
    }
)


class WebhookRejected(ValueError):
    """Signature, size, or routing rejected the delivery."""


def apply_webhook_schema(conn: Any) -> None:
    apply_inbox_schema(conn)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tracker_webhook_secrets (
            connector_id TEXT PRIMARY KEY,
            secret_envelope TEXT NOT NULL
        );
        """,
        prepare=False,
    )


def verify_signature(headers: Mapping[str, str], raw_body: bytes, secret: str) -> bool:
    offered = ""
    for key, value in headers.items():
        if key.casefold() == SIGNATURE_HEADER:
            offered = value
            break
    if not offered or not offered.startswith("sha256="):
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(offered, f"sha256={digest}")


def parse_github_event(event_type: str, payload: Mapping[str, Any], *, connector_id: str, delivery_id: str) -> list[dict]:
    """Return durable hint dicts. Unknown events yield an empty list."""

    received_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    if event_type == "ping":
        return []
    if event_type == "issues":
        issue = payload.get("issue") or {}
        action = str(payload.get("action") or "edited")
        repo = payload.get("repository") or {}
        return [_issue_hint(connector_id, delivery_id, issue, repo, action, received_at, payload)]
    if event_type == "issue_comment":
        comment = payload.get("comment") or {}
        issue = payload.get("issue") or {}
        action = str(payload.get("action") or "created")
        repo = payload.get("repository") or {}
        event = "deleted" if action == "deleted" else ("created" if action == "created" else "edited")
        actor = _actor(payload.get("sender"))
        return [
            {
                "id": f"hint_{uuid4().hex[:12]}",
                "objectKind": "comment",
                "remoteContainerId": str(repo.get("id") or ""),
                "externalId": str(issue.get("number") or issue.get("id") or ""),
                "externalCommentId": str(comment.get("id") or ""),
                "event": event,
                "actor": actor,
                "receivedAt": received_at,
            }
        ]
    if event_type == "installation":
        installation = payload.get("installation") or {}
        action = str(payload.get("action") or "updated")
        return [
            {
                "id": f"hint_{uuid4().hex[:12]}",
                "objectKind": "installation",
                "remoteContainerId": str(installation.get("id") or ""),
                "externalId": str(installation.get("id") or ""),
                "event": action,
                "actor": _actor(payload.get("sender")),
                "receivedAt": received_at,
            }
        ]
    if event_type == "installation_repositories":
        installation = payload.get("installation") or {}
        action = str(payload.get("action") or "added")
        hints: list[dict] = []
        key = "repositories_added" if action == "added" else "repositories_removed"
        for repo in payload.get(key) or []:
            if not isinstance(repo, dict):
                continue
            hints.append(
                {
                    "id": f"hint_{uuid4().hex[:12]}",
                    "objectKind": "repository",
                    "remoteContainerId": str(repo.get("id") or ""),
                    "externalId": str(repo.get("id") or ""),
                    "event": action,
                    "actor": _actor(payload.get("sender")),
                    "receivedAt": received_at,
                }
            )
        if not hints:
            hints.append(
                {
                    "id": f"hint_{uuid4().hex[:12]}",
                    "objectKind": "installation",
                    "remoteContainerId": str(installation.get("id") or ""),
                    "externalId": str(installation.get("id") or ""),
                    "event": f"repositories_{action}",
                    "actor": _actor(payload.get("sender")),
                    "receivedAt": received_at,
                }
            )
        return hints
    if event_type not in KNOWN_EVENTS:
        logger.info(
            "Ignored unknown GitHub webhook event for connector %s delivery %s: %s",
            connector_id,
            delivery_id,
            event_type,
        )
    return []


def _issue_hint(
    connector_id: str,
    delivery_id: str,
    issue: Mapping[str, Any],
    repo: Mapping[str, Any],
    action: str,
    received_at: str,
    payload: Mapping[str, Any],
) -> dict:
    event = action
    if action in {"opened", "created"}:
        event = "created"
    elif action in {"closed", "deleted"}:
        event = "closed" if action == "closed" else "deleted"
    elif action == "reopened":
        event = "reopened"
    elif action == "edited":
        event = "edited"
    return {
        "id": f"hint_{uuid4().hex[:12]}",
        "objectKind": "issue",
        "remoteContainerId": str(repo.get("id") or ""),
        "externalId": str(issue.get("number") or issue.get("id") or ""),
        "event": event,
        "actor": _actor(payload.get("sender")),
        "receivedAt": received_at,
    }


def _actor(sender: Any) -> dict | None:
    if not isinstance(sender, dict) or not sender.get("id"):
        return None
    return {
        "id": str(sender["id"]),
        "login": str(sender.get("login") or ""),
        "isBot": bool(sender.get("type") == "Bot"),
        "displayName": str(sender.get("name") or sender.get("login") or ""),
    }


class GitHubWebhookService:
    def __init__(
        self,
        *,
        connect: Callable[[], Any] | None = None,
        settings: Settings | None = None,
        comments_schema: str = "comments",
        workspace_schema: str = "workspace",
    ) -> None:
        self._connect = connect
        self.settings = settings or default_settings
        self.comments_schema = comments_schema
        self.workspace_schema = workspace_schema

    @contextmanager
    def connection(self):
        if self._connect is not None:
            with self._connect() as conn:
                conn.execute(f'SET search_path TO "{self.comments_schema}", "{self.workspace_schema}", public')
                apply_webhook_schema(conn)
                yield conn
            return
        from app.services.postgres_database import database

        with database.connection() as conn:
            conn.execute(f'SET search_path TO {self.comments_schema}, {self.workspace_schema}, public')
            apply_webhook_schema(conn)
            yield conn

    def configure_secret(self, connector_id: str, secret: str) -> None:
        envelope = encrypt_secret(secret, _secret_context(connector_id), settings=self.settings)
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO tracker_webhook_secrets (connector_id, secret_envelope)
                VALUES (%s, %s)
                ON CONFLICT (connector_id) DO UPDATE SET secret_envelope = EXCLUDED.secret_envelope
                """,
                (connector_id, envelope),
            )
            conn.commit()

    def ingest(self, connector_id: str, headers: Mapping[str, str], raw_body: bytes) -> dict:
        if len(raw_body) > MAX_BODY_BYTES:
            raise WebhookRejected("payload_too_large")
        normalized = {key.casefold(): value for key, value in headers.items()}
        delivery_id = normalized.get(DELIVERY_HEADER, "").strip()
        if not delivery_id:
            raise WebhookRejected("missing_delivery_id")
        event_type = normalized.get(EVENT_HEADER, "").strip()
        secret = self._secret(connector_id)
        if not verify_signature(normalized, raw_body, secret):
            raise WebhookRejected("invalid_signature")
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise WebhookRejected("invalid_json") from exc
        if not isinstance(payload, dict):
            raise WebhookRejected("invalid_json")
        hints = parse_github_event(event_type, payload, connector_id=connector_id, delivery_id=delivery_id)
        with self.connection() as conn:
            result = InboxStore(conn).enqueue(
                connector_id=connector_id,
                delivery_id=delivery_id,
                hints=hints,
            )
            conn.commit()
            return {
                "deliveryId": delivery_id,
                "event": event_type,
                "created": result["created"],
                "hintCount": len(result["hints"]),
            }

    def _secret(self, connector_id: str) -> str:
        with self.connection() as conn:
            row = conn.execute(
                "SELECT secret_envelope FROM tracker_webhook_secrets WHERE connector_id = %s",
                (connector_id,),
            ).fetchone()
            if not row:
                raise WebhookRejected("webhook_not_configured")
            return decrypt_secret(
                row["secret_envelope"],
                _secret_context(connector_id),
                settings=self.settings,
            ).decode()

def _secret_context(connector_id: str) -> dict[str, str]:
    return {"record": connector_id, "field": SECRET_FIELD}


def initialize_tracker_webhook_service() -> None:
    service = GitHubWebhookService()
    with service.connection() as conn:
        conn.commit()


__all__ = [
    "GitHubWebhookService",
    "WebhookRejected",
    "apply_webhook_schema",
    "initialize_tracker_webhook_service",
    "parse_github_event",
    "verify_signature",
]
