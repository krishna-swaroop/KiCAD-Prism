"""GitLab webhook verification and hint parsing.

GitLab authenticates a project hook by echoing its secret token in
``X-Gitlab-Token`` (compared in constant time), names the event in
``X-Gitlab-Event`` and identifies the delivery with ``Idempotency-Key``, which
stays the same across GitLab's retries. Older instances without that header
send ``X-Gitlab-Event-UUID``; failing both, a digest of the body stands in so a
re-sent delivery still deduplicates.

Hints carry object references only, in the same shape as GitHub's: the issue
``iid`` as ``externalId`` and ``"<iid>:<note_id>"`` for notes. Authoritative
state is fetched later by the worker (C6).
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import datetime, timezone
from typing import Any, Mapping
from uuid import uuid4

from app.services.trackers.gitlab_comments import comment_id
from app.services.trackers.gitlab_issues import _BOT_USERNAME

logger = logging.getLogger(__name__)

TOKEN_HEADER = "x-gitlab-token"
EVENT_HEADER = "x-gitlab-event"
DELIVERY_HEADERS = ("idempotency-key", "x-gitlab-event-uuid")
ISSUE_EVENTS = frozenset({"Issue Hook", "Confidential Issue Hook"})
NOTE_EVENTS = frozenset({"Note Hook", "Confidential Note Hook"})
_ISSUE_ACTIONS = {"open": "created", "close": "closed", "reopen": "reopened", "update": "edited"}


def delivery_id(headers: Mapping[str, str], raw_body: bytes = b"") -> str:
    for name in DELIVERY_HEADERS:
        value = str(headers.get(name) or "").strip()
        if value:
            return value
    if raw_body:
        return "sha256:" + hashlib.sha256(raw_body).hexdigest()
    return ""


def event_type(headers: Mapping[str, str]) -> str:
    return str(headers.get(EVENT_HEADER) or "").strip()


def verify_token(headers: Mapping[str, str], raw_body: bytes, secret: str) -> bool:
    del raw_body
    offered = str(headers.get(TOKEN_HEADER) or "")
    if not offered or not secret:
        return False
    return hmac.compare_digest(offered.encode("utf-8"), secret.encode("utf-8"))


def parse_gitlab_event(
    event: str, payload: Mapping[str, Any], *, connector_id: str, delivery_id: str
) -> list[dict]:
    """Return durable hint dicts. Other events yield an empty list."""

    received_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    project = payload.get("project") if isinstance(payload.get("project"), dict) else {}
    attrs = payload.get("object_attributes") if isinstance(payload.get("object_attributes"), dict) else {}
    actor = _actor(payload.get("user"))
    if event in ISSUE_EVENTS:
        action = str(attrs.get("action") or "update")
        return [
            {
                "id": f"hint_{uuid4().hex[:12]}",
                "objectKind": "issue",
                "remoteContainerId": str(project.get("id") or attrs.get("project_id") or ""),
                "externalId": str(attrs.get("iid") or ""),
                "event": _ISSUE_ACTIONS.get(action, "edited"),
                "actor": actor,
                "receivedAt": received_at,
            }
        ]
    if event in NOTE_EVENTS:
        issue = payload.get("issue") if isinstance(payload.get("issue"), dict) else {}
        if str(attrs.get("noteable_type") or "") != "Issue" or not issue.get("iid") or attrs.get("system"):
            return []
        iid = str(issue["iid"])
        return [
            {
                "id": f"hint_{uuid4().hex[:12]}",
                "objectKind": "comment",
                "remoteContainerId": str(project.get("id") or attrs.get("project_id") or ""),
                "externalId": iid,
                "externalCommentId": comment_id(iid, attrs.get("id") or ""),
                "event": "edited" if str(attrs.get("action") or "") == "update" else "created",
                "actor": actor,
                "receivedAt": received_at,
            }
        ]
    logger.info(
        "Ignored GitLab webhook event for connector %s delivery %s: %s", connector_id, delivery_id, event
    )
    return []


def _actor(user: Any) -> dict | None:
    if not isinstance(user, dict) or not user.get("id"):
        return None
    username = str(user.get("username") or "")
    return {
        "id": str(user["id"]),
        "login": username,
        "isBot": bool(user.get("bot")) or bool(_BOT_USERNAME.match(username)),
        "displayName": str(user.get("name") or username),
    }


__all__ = ["delivery_id", "event_type", "parse_gitlab_event", "verify_token"]
