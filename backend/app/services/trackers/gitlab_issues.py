"""GitLab issue, destination and label adapter (gitlab.com and self-managed).

Maps GitLab REST v4 issues onto the frozen tracker DTOs, mirroring
``GitHubIssueAdapter``:

- ``externalId`` is GitLab's global issue ``id`` (immutable); ``number`` is the
  project-scoped ``iid`` and addresses the issue in every REST route.
- The container is a project, addressed by numeric id, or by its URL-encoded
  ``path_with_namespace`` while a new destination still carries the
  ``pending:<path>`` placeholder.
- GitLab creates missing labels when an issue names them, so ``ensure_labels``
  has nothing to do.
- Close/reopen history comes from ``resource_state_events``.
- Conditional reads are not claimed: the REST API does not promise
  ``If-None-Match`` handling, so every read returns a body.
"""

from __future__ import annotations

import re
from typing import Any, Mapping, Optional, Sequence
from urllib.parse import quote

from app.services.trackers.capabilities import ProviderCapabilities
from app.services.trackers.contracts import (
    Container,
    Destination,
    ForbiddenRead,
    ForgeUser,
    GoneConfirmed,
    IssueDraft,
    IssuePatch,
    IssueRead,
    Moved,
    RemoteAssignee,
    RemoteChange,
    RemoteEvent,
    RemoteIssue,
    RemoteVersion,
    UncertainAbsence,
    UpdateCursor,
    assert_no_owner_repo,
)
from app.services.trackers.errors import ProviderError
from app.services.trackers.github_updates import parse_iso8601
from app.services.trackers.gitlab_auth import GitLabBotAuth, _visibility
from app.services.trackers.http import ForgeHttpResponse, TrackerHttp

# Fresh poll checkpoints start here and are never sent as ``updated_after``.
DEFAULT_SINCE = "1970-01-01T00:00:00Z"
PENDING_PREFIX = "pending:"
# Project and group access tokens act as generated bot users.
_BOT_USERNAME = re.compile(r"^(project|group)_\d+_bot(_[0-9a-f]+)?$", re.IGNORECASE)


class GitLabIssueAdapter:
    """Bot-token issue operations against one GitLab project."""

    kind = "gitlab"

    def __init__(
        self,
        auth: GitLabBotAuth,
        *,
        http: TrackerHttp | None = None,
        bot_user_id: str | None = None,
        bot_login: str | None = None,
    ) -> None:
        self.auth = auth
        self.http = http or auth.http
        self.bot_user_id = (bot_user_id or "").strip()
        self.bot_login = (bot_login or "").strip()

    def capabilities(self) -> ProviderCapabilities:
        return self.auth.capabilities()

    # --- containers -----------------------------------------------------------

    def get_container(self, dest: Destination) -> Container:
        payload = self._json_object(
            self._request("GET", self._project_url(dest), params={"license": "false", "statistics": "false"})
        )
        container = Container(
            remoteContainerId=str(payload.get("id") or dest.remoteContainerId),
            path=str(payload.get("path_with_namespace") or dest.containerPath),
            visibility=_visibility(payload.get("visibility")),  # type: ignore[arg-type]
        )
        assert_no_owner_repo(container)
        return container

    # --- issues ---------------------------------------------------------------

    def create_issue(self, dest: Destination, draft: IssueDraft, op_id: str) -> RemoteIssue:
        del op_id
        payload: dict[str, Any] = {"title": draft.title, "description": _compose_body(draft)}
        if draft.labels:
            payload["labels"] = ",".join(draft.labels)
        response = self._request("POST", self._project_url(dest, "/issues"), json_body=payload)
        issue = self._issue_from(self._json_object(response), dest)
        if draft.assignees:
            assigned = self._try_assign(dest, issue, draft.assignees)
            if assigned is not None:
                return assigned
        return issue

    def find_by_marker(
        self, dest: Destination, marker: str, since: Optional[str] = None
    ) -> Optional[RemoteIssue]:
        needle = (marker or "").strip()
        if not needle:
            return None
        if not self.bot_user_id and not self.bot_login:
            raise ProviderError(
                "capability_missing",
                "GitLab bot identity is unknown; cannot scan issues by marker.",
            )
        for page in self.bot_issue_pages(dest, since=since):
            for item in page:
                if needle in str(item.get("description") or "") and self._authored_by_bot(item):
                    return self._issue_from(item, dest)
        return None

    def get_issue(self, dest: Destination, ext_id: str, etag: Optional[str] = None) -> IssueRead:
        del etag
        try:
            response = self._request("GET", self._issue_url(dest, ext_id))
        except ProviderError as exc:
            return _read_from_error(exc)
        return self._issue_from(self._json_object(response), dest)

    def update_issue(self, dest: Destination, ext_id: str, patch: IssuePatch) -> RemoteIssue:
        body: dict[str, Any] = {}
        if patch.title is not None:
            body["title"] = patch.title
        if patch.proseBlock is not None:
            body["description"] = patch.proseBlock
        if patch.labels is not None:
            body["labels"] = ",".join(patch.labels)
        response = self._request("PUT", self._issue_url(dest, ext_id), json_body=body)
        return self._issue_from(self._json_object(response), dest)

    def set_state(self, dest: Destination, ext_id: str, state: str, note: str) -> RemoteIssue:
        del note
        if state not in {"open", "closed"}:
            raise ProviderError("invalid_request", "Issue state must be open or closed.")
        event = "close" if state == "closed" else "reopen"
        response = self._request("PUT", self._issue_url(dest, ext_id), json_body={"state_event": event})
        return self._issue_from(self._json_object(response), dest)

    def list_updates(
        self, dest: Destination, since_cursor: UpdateCursor
    ) -> tuple[list[RemoteChange], UpdateCursor]:
        params: dict[str, Any] = {"order_by": "updated_at", "sort": "asc", "per_page": 100, "scope": "all"}
        if since_cursor.since and since_cursor.since > DEFAULT_SINCE:
            params["updated_after"] = since_cursor.since
        url = since_cursor.page or self._project_url(dest, "/issues")
        response = self._request("GET", url, params=None if since_cursor.page else params)
        changes: list[RemoteChange] = []
        latest = since_cursor.since
        for item in self._json_list(response):
            if not isinstance(item, dict):
                continue
            updated = str(item.get("updated_at") or "")
            changes.append(
                RemoteChange(
                    objectKind="issue",
                    remoteContainerId=dest.remoteContainerId,
                    externalId=str(item.get("id") or ""),
                    observedUpdatedAt=updated or None,
                )
            )
            # Compare as times: GitLab's millisecond stamps do not sort as text
            # against second-precision cursors ("…59.092Z" < "…59Z").
            if updated and (not latest or parse_iso8601(updated) > parse_iso8601(latest)):
                latest = updated
        return changes, UpdateCursor(since=latest or since_cursor.since, page=response.next_page())

    def list_events(self, dest: Destination, ext_id: str) -> Sequence[RemoteEvent]:
        events: list[RemoteEvent] = []
        url: Optional[str] = self._issue_url(dest, ext_id, "/resource_state_events")
        params: dict[str, Any] | None = {"per_page": 100}
        while url:
            response = self._request("GET", url, params=params)
            params = None
            for item in self._json_list(response):
                if not isinstance(item, dict):
                    continue
                user = item.get("user")
                events.append(
                    RemoteEvent(
                        externalId=str(ext_id),
                        eventId=str(item.get("id") or ""),
                        # GitLab records "closed" / "reopened", the same names
                        # the state executor compares GitHub events by.
                        event=str(item.get("state") or ""),
                        createdAt=str(item.get("created_at") or ""),
                        actor=_forge_user(user) if isinstance(user, dict) else None,
                    )
                )
            url = response.next_page()
        return events

    def ensure_labels(self, dest: Destination, labels: Sequence[str]) -> None:
        """GitLab creates a project label the first time an issue names it."""

        del dest, labels

    def can_assign(self, dest: Destination, forge_login: str) -> bool:
        return self._member_id(dest, forge_login) is not None

    # --- recovery -------------------------------------------------------------

    def bot_issue_query(self, dest: Destination, *, since: Optional[str] = None) -> tuple[str, dict[str, Any]]:
        """First-page URL and parameters for issues the bot authored, oldest update first."""

        params: dict[str, Any] = {"scope": "all", "order_by": "updated_at", "sort": "asc", "per_page": 100}
        if self.bot_user_id:
            params["author_id"] = self.bot_user_id
        elif self.bot_login:
            params["author_username"] = self.bot_login
        if since:
            params["updated_after"] = since
        return self._project_url(dest, "/issues"), params

    def bot_issue_pages(self, dest: Destination, *, since: Optional[str] = None):
        """Yield pages of issues the bot authored, oldest update first."""

        url, params = self.bot_issue_query(dest, since=since)
        while url:
            response = self._request("GET", url, params=params)
            params = None
            yield [item for item in self._json_list(response) if isinstance(item, dict)]
            url = response.next_page()

    # --- helpers --------------------------------------------------------------

    def _try_assign(self, dest: Destination, issue: RemoteIssue, logins: Sequence[str]) -> Optional[RemoteIssue]:
        ids = [member for member in (self._member_id(dest, login) for login in logins) if member]
        if not ids:
            return None
        try:
            response = self._request(
                "PUT",
                self._issue_url(dest, str(issue.number)),
                json_body={"assignee_ids": ids[: self.capabilities().maxAssignees or 1]},
            )
        except ProviderError:
            # Assignment never fails issue creation.
            return None
        return self._issue_from(self._json_object(response), dest)

    def _member_id(self, dest: Destination, forge_login: str) -> Optional[int]:
        login = (forge_login or "").strip()
        if not login:
            return None
        try:
            response = self._request("GET", self._project_url(dest, "/members/all"), params={"query": login})
        except ProviderError as exc:
            if exc.class_ in {"not_found_uncertain", "forbidden", "gone_confirmed"}:
                return None
            raise
        for member in self._json_list(response):
            if isinstance(member, dict) and str(member.get("username") or "").casefold() == login.casefold():
                # Guests cannot be assigned issues.
                if int(member.get("access_level") or 0) >= 20 and member.get("id") is not None:
                    return int(member["id"])
        return None

    def _issue_from(self, payload: Mapping[str, Any], dest: Destination) -> RemoteIssue:
        author = payload.get("author") if isinstance(payload.get("author"), dict) else {}
        labels = [str(item) for item in payload.get("labels") or [] if isinstance(item, str)]
        labels += [
            str(item["name"]) for item in payload.get("labels") or [] if isinstance(item, dict) and item.get("name")
        ]
        assignees = [
            RemoteAssignee(id=str(item["id"]), login=str(item.get("username") or ""))
            for item in payload.get("assignees") or []
            if isinstance(item, dict) and item.get("id") is not None
        ]
        issue = RemoteIssue(
            externalId=str(payload.get("id") or ""),
            url=str(payload.get("web_url") or ""),
            number=int(payload["iid"]) if payload.get("iid") is not None else None,
            title=str(payload.get("title") or ""),
            body=str(payload.get("description") or ""),
            state="closed" if str(payload.get("state") or "") == "closed" else "open",
            labels=labels,
            assignees=assignees,
            author=_forge_user(author),
            version=RemoteVersion(updatedAt=str(payload.get("updated_at") or "") or None, etag=None),
            container={
                "remoteContainerId": str(payload.get("project_id") or dest.remoteContainerId),
                "path": dest.containerPath,
            },
            actor=None,
        )
        assert_no_owner_repo(issue)
        return issue

    def _authored_by_bot(self, payload: Mapping[str, Any]) -> bool:
        author = payload.get("author") if isinstance(payload.get("author"), dict) else {}
        if self.bot_user_id and str(author.get("id") or "") != self.bot_user_id:
            return False
        if self.bot_login and str(author.get("username") or "").casefold() != self.bot_login.casefold():
            return False
        return bool(self.bot_user_id or self.bot_login)

    def _project_url(self, dest: Destination, suffix: str = "") -> str:
        return self.auth.url(f"/projects/{project_ref(dest)}{suffix}")

    def _issue_url(self, dest: Destination, iid: str, suffix: str = "") -> str:
        ref = str(iid or "").strip()
        if not ref.isdigit():
            raise ProviderError("invalid_request", "GitLab issues are addressed by their numeric iid.")
        return self._project_url(dest, f"/issues/{ref}{suffix}")

    def _request(
        self,
        method: str,
        url: str,
        *,
        json_body: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> ForgeHttpResponse:
        response = self.http.request(
            method, url, headers=self.auth.bot_headers(), json_body=json_body, params=params
        )
        return self.http.outcome(response)

    def _json_object(self, response: ForgeHttpResponse) -> dict[str, Any]:
        payload = response.json() if response.content else {}
        if not isinstance(payload, dict):
            raise ProviderError("transient", "GitLab returned a non-object issue payload.")
        return payload

    def _json_list(self, response: ForgeHttpResponse) -> list[Any]:
        payload = response.json() if response.content else []
        if not isinstance(payload, list):
            raise ProviderError("transient", "GitLab returned a non-list payload.")
        return payload


def project_ref(dest: Destination) -> str:
    """Numeric project id, or the URL-encoded path while the id is pending."""

    remote_id = str(dest.remoteContainerId or "").strip()
    if remote_id.isdigit():
        return remote_id
    path = remote_id[len(PENDING_PREFIX):] if remote_id.startswith(PENDING_PREFIX) else dest.containerPath
    path = (path or "").strip().strip("/")
    if not path or "/" not in path:
        raise ProviderError("invalid_request", "GitLab destination path must be group/project.")
    return quote(path, safe="")


def _read_from_error(exc: ProviderError) -> IssueRead:
    if exc.class_ == "not_found_uncertain":
        return UncertainAbsence(status=exc.status or 404)
    if exc.class_ == "gone_confirmed":
        return GoneConfirmed(status=exc.status or 410)
    if exc.class_ == "moved":
        return Moved(new_ref=exc.new_ref or "", new_container_id=None)
    if exc.class_ == "forbidden":
        return ForbiddenRead(status=exc.status or 403)
    raise exc


def _compose_body(draft: IssueDraft) -> str:
    parts = [draft.proseBlock.rstrip(), draft.marker.strip()]
    return "\n\n".join(part for part in parts if part)


def _forge_user(payload: Mapping[str, Any]) -> ForgeUser:
    login = str(payload.get("username") or "")
    return ForgeUser(
        id=str(payload.get("id") or ""),
        login=login,
        isBot=bool(payload.get("bot")) or bool(_BOT_USERNAME.match(login)),
        displayName=str(payload.get("name") or "") or None,
    )


__all__ = ["DEFAULT_SINCE", "GitLabIssueAdapter", "project_ref"]
