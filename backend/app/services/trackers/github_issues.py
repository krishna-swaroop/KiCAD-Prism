"""GitHub issue, destination and label adapter (TR-16, C3/C4).

Maps GitHub REST issue objects onto the frozen tracker DTOs. The immutable
issue identity is GitHub's numeric ``id``; ``number`` and ``html_url`` are
separate and can change on transfer. Conditional headers are used on GET
only — GitHub ignores ``If-Match`` on PATCH, so this adapter never claims
compare-and-set writes (D1). Pull requests that leak through the issues API
are dropped. Assignment failures do not fail issue creation.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional, Sequence
from urllib.parse import urlsplit

from app.services.trackers.capabilities import ProviderCapabilities, github_com_capabilities
from app.services.trackers.contracts import (
    PROTOCOL_CONFORMANCE_CASES,
    Container,
    Destination,
    ForbiddenRead,
    ForgeUser,
    GoneConfirmed,
    IssueDraft,
    IssuePatch,
    IssueRead,
    Moved,
    NotModified,
    PageCursor,
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
from app.services.trackers.github_auth import API_VERSION, GitHubAppAuth
from app.services.trackers.http import ForgeHttpResponse, TrackerHttp

# Fresh poll checkpoints start here; never sent to GitHub as ``since`` (see list_updates).
DEFAULT_SINCE = "1970-01-01T00:00:00Z"
GITHUB_COM_INSTANCE = "github.com"
GHES_INSTANCE = "ghes"
ISSUE_ACCEPT = "application/vnd.github+json"


class GitHubIssueAdapter:
    """Bot-credential issue operations against one GitHub App installation."""

    kind = "github"

    def __init__(
        self,
        auth: GitHubAppAuth,
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
        kind = _instance_kind(self.auth.credentials.instance_kind)
        caps = github_com_capabilities(api_version=API_VERSION)
        if kind == GHES_INSTANCE:
            caps = caps.model_copy(update={"instanceKind": GHES_INSTANCE})
        # GET supports If-None-Match. PATCH /issues does not honour If-Match.
        return caps

    def get_container(self, dest: Destination) -> Container:
        response = self._request("GET", self.auth.url(f"/repositories/{dest.remoteContainerId}"))
        payload = self._json_object(response)
        path = str(payload.get("full_name") or dest.containerPath)
        visibility = "unknown"
        if "private" in payload:
            visibility = "private" if payload.get("private") else "public"
        transferred = payload.get("parent") or {}
        transferred_from = None
        if isinstance(transferred, dict) and transferred.get("id"):
            transferred_from = str(transferred["id"])
        container = Container(
            remoteContainerId=str(payload.get("id") or dest.remoteContainerId),
            path=path,
            visibility=visibility,  # type: ignore[arg-type]
            transferredFromId=transferred_from,
        )
        assert_no_owner_repo(container)
        return container

    def create_issue(self, dest: Destination, draft: IssueDraft, op_id: str) -> RemoteIssue:
        del op_id
        owner, repo = _owner_repo(dest)
        self.ensure_labels(dest, draft.labels)
        body = _compose_body(draft)
        payload: dict[str, Any] = {"title": draft.title, "body": body}
        if draft.labels:
            payload["labels"] = list(draft.labels)
        response = self._request(
            "POST",
            self.auth.url(f"/repos/{owner}/{repo}/issues"),
            json_body=payload,
        )
        created = self._json_object(response)
        issue = self._issue_from(created, dest, etag=response.etag)
        if draft.assignees:
            self._try_assign(dest, issue, draft.assignees)
            try:
                refreshed = self.get_issue(dest, str(created.get("number") or issue.number), etag=None)
                if isinstance(refreshed, RemoteIssue):
                    return refreshed
            except ProviderError:
                return issue
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
                "GitHub bot identity is unknown; cannot scan issues by marker.",
            )
        cursor: Optional[str] = None
        params: dict[str, Any] = {"state": "all", "per_page": 100}
        if self.bot_login:
            params["creator"] = self.bot_login
        if since:
            params["since"] = since
        owner, repo = _owner_repo(dest)
        while True:
            url = cursor or self.auth.url(f"/repos/{owner}/{repo}/issues")
            response = self._request("GET", url, params=None if cursor else params)
            items = self._json_list(response)
            for item in items:
                if _is_pull_request(item):
                    continue
                if needle not in str(item.get("body") or ""):
                    continue
                if not self._authored_by_bot(item):
                    continue
                return self._issue_from(item, dest, etag=response.etag)
            cursor = response.next_page()
            if not cursor:
                return None

    def get_issue(
        self, dest: Destination, ext_id: str, etag: Optional[str] = None
    ) -> IssueRead:
        owner, repo = _owner_repo(dest)
        url = self.auth.url(f"/repos/{owner}/{repo}/issues/{ext_id}")
        try:
            response = self._request("GET", url, etag=etag)
        except ProviderError as exc:
            return _read_from_error(exc)
        if response.status == 304:
            return NotModified(etag=response.etag or etag)
        payload = self._json_object(response)
        if _is_pull_request(payload):
            return UncertainAbsence(status=404)
        return self._issue_from(payload, dest, etag=response.etag)

    def update_issue(self, dest: Destination, ext_id: str, patch: IssuePatch) -> RemoteIssue:
        owner, repo = _owner_repo(dest)
        body: dict[str, Any] = {}
        if patch.title is not None:
            body["title"] = patch.title
        if patch.proseBlock is not None:
            body["body"] = patch.proseBlock
        if patch.labels is not None:
            self.ensure_labels(dest, patch.labels)
            body["labels"] = list(patch.labels)
        headers = self._headers()
        # D1: GitHub PATCH /issues does not honour If-Match. Never send it.
        headers.pop("If-Match", None)
        response = self._request(
            "PATCH",
            self.auth.url(f"/repos/{owner}/{repo}/issues/{ext_id}"),
            json_body=body,
            headers=headers,
        )
        return self._issue_from(self._json_object(response), dest, etag=response.etag)

    def set_state(self, dest: Destination, ext_id: str, state: str, note: str) -> RemoteIssue:
        del note
        if state not in {"open", "closed"}:
            raise ProviderError("invalid_request", "Issue state must be open or closed.")
        owner, repo = _owner_repo(dest)
        body: dict[str, Any] = {"state": state}
        if state == "closed":
            body["state_reason"] = "completed"
        response = self._request(
            "PATCH",
            self.auth.url(f"/repos/{owner}/{repo}/issues/{ext_id}"),
            json_body=body,
        )
        return self._issue_from(self._json_object(response), dest, etag=response.etag)

    def list_updates(
        self, dest: Destination, since_cursor: UpdateCursor
    ) -> tuple[list[RemoteChange], UpdateCursor]:
        owner, repo = _owner_repo(dest)
        params: dict[str, Any] = {"state": "all", "per_page": 100, "sort": "updated", "direction": "asc"}
        # Live github.com answers an epoch ``since`` with an empty list, so a
        # fresh checkpoint (DEFAULT_SINCE) never sees anything and never
        # advances. Send ``since`` only once the cursor is a real timestamp.
        if since_cursor.since and since_cursor.since > DEFAULT_SINCE:
            params["since"] = since_cursor.since
        url = since_cursor.page or self.auth.url(f"/repos/{owner}/{repo}/issues")
        response = self._request("GET", url, params=None if since_cursor.page else params)
        items = self._json_list(response)
        changes: list[RemoteChange] = []
        latest = since_cursor.since
        for item in items:
            if _is_pull_request(item):
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
            if updated > latest:
                latest = updated
        next_page = response.next_page()
        cursor = UpdateCursor(since=latest or since_cursor.since, page=next_page)
        return changes, cursor

    def list_events(self, dest: Destination, ext_id: str) -> Sequence[RemoteEvent]:
        owner, repo = _owner_repo(dest)
        events: list[RemoteEvent] = []
        url: Optional[str] = self.auth.url(f"/repos/{owner}/{repo}/issues/{ext_id}/events")
        params: dict[str, Any] | None = {"per_page": 100}
        while url:
            response = self._request("GET", url, params=params)
            params = None
            for item in self._json_list(response):
                actor_raw = item.get("actor")
                actor = _forge_user(actor_raw) if isinstance(actor_raw, dict) else None
                events.append(
                    RemoteEvent(
                        externalId=str(ext_id),
                        eventId=str(item.get("id") or ""),
                        event=str(item.get("event") or ""),
                        createdAt=str(item.get("created_at") or ""),
                        actor=actor,
                    )
                )
            url = response.next_page()
        return events

    def ensure_labels(self, dest: Destination, labels: Sequence[str]) -> None:
        owner, repo = _owner_repo(dest)
        for name in labels:
            label = str(name or "").strip()
            if not label:
                continue
            url = self.auth.url(f"/repos/{owner}/{repo}/labels/{label}")
            try:
                self._request("GET", url)
                continue
            except ProviderError as exc:
                if exc.class_ not in {"not_found_uncertain", "gone_confirmed"}:
                    raise
            self._request(
                "POST",
                self.auth.url(f"/repos/{owner}/{repo}/labels"),
                json_body={"name": label, "color": "ededed"},
            )

    def can_assign(self, dest: Destination, forge_login: str) -> bool:
        login = (forge_login or "").strip()
        if not login:
            return False
        owner, repo = _owner_repo(dest)
        try:
            self._request("GET", self.auth.url(f"/repos/{owner}/{repo}/assignees/{login}"))
            return True
        except ProviderError as exc:
            if exc.class_ in {"not_found_uncertain", "forbidden", "gone_confirmed"}:
                return False
            raise

    def _try_assign(self, dest: Destination, issue: RemoteIssue, logins: Sequence[str]) -> None:
        owner, repo = _owner_repo(dest)
        number = issue.number if issue.number is not None else issue.externalId
        allowed = [login for login in logins if self.can_assign(dest, login)]
        if not allowed:
            return
        try:
            self._request(
                "POST",
                self.auth.url(f"/repos/{owner}/{repo}/issues/{number}/assignees"),
                json_body={"assignees": allowed},
            )
        except ProviderError:
            return

    def _issue_from(self, payload: Mapping[str, Any], dest: Destination, *, etag: str | None) -> RemoteIssue:
        author_raw = payload.get("user") if isinstance(payload.get("user"), dict) else {}
        repository = payload.get("repository") if isinstance(payload.get("repository"), dict) else {}
        container_id = str(repository.get("id") or dest.remoteContainerId)
        container_path = str(repository.get("full_name") or dest.containerPath)
        labels = []
        for item in payload.get("labels") or []:
            if isinstance(item, dict) and item.get("name"):
                labels.append(str(item["name"]))
            elif isinstance(item, str):
                labels.append(item)
        assignees = []
        for item in payload.get("assignees") or []:
            if isinstance(item, dict) and item.get("id") is not None:
                assignees.append(
                    RemoteAssignee(id=str(item["id"]), login=str(item.get("login") or ""))
                )
        issue = RemoteIssue(
            externalId=str(payload.get("id") or ""),
            url=str(payload.get("html_url") or payload.get("url") or ""),
            number=int(payload["number"]) if payload.get("number") is not None else None,
            title=str(payload.get("title") or ""),
            body=str(payload.get("body") or ""),
            state="closed" if str(payload.get("state") or "") == "closed" else "open",
            labels=labels,
            assignees=assignees,
            author=_forge_user(author_raw),
            version=RemoteVersion(
                updatedAt=str(payload.get("updated_at") or "") or None,
                etag=etag,
            ),
            container={"remoteContainerId": container_id, "path": container_path},
            actor=None,
        )
        assert_no_owner_repo(issue)
        return issue

    def _authored_by_bot(self, payload: Mapping[str, Any]) -> bool:
        user = payload.get("user") if isinstance(payload.get("user"), dict) else {}
        author_id = str(user.get("id") or "")
        author_login = str(user.get("login") or "")
        if self.bot_user_id and author_id != self.bot_user_id:
            return False
        if self.bot_login and author_login.casefold() != self.bot_login.casefold():
            return False
        return bool(self.bot_user_id or self.bot_login)

    def _request(
        self,
        method: str,
        url: str,
        *,
        json_body: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        etag: str | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> ForgeHttpResponse:
        hdrs = dict(headers or self._headers())
        response = self.http.request(
            method,
            url,
            headers=hdrs,
            json_body=json_body,
            params=params,
            etag=etag,
        )
        return self.http.outcome(response)

    def _headers(self) -> dict[str, str]:
        return dict(self.auth.installation_headers())

    def _json_object(self, response: ForgeHttpResponse) -> dict[str, Any]:
        payload = response.json() if response.content else {}
        if not isinstance(payload, dict):
            raise ProviderError("transient", "GitHub returned a non-object issue payload.")
        return payload

    def _json_list(self, response: ForgeHttpResponse) -> list[Any]:
        payload = response.json() if response.content else []
        if not isinstance(payload, list):
            raise ProviderError("transient", "GitHub returned a non-list payload.")
        return payload


def conformance_kind(status: int, *, retry_after: bool = False) -> str:
    """Map PROTOCOL_CONFORMANCE_CASES onto adapter outcomes."""

    from app.services.trackers.errors import classify_read_status

    return classify_read_status(status, retry_after=retry_after)


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


def _owner_repo(dest: Destination) -> tuple[str, str]:
    path = (dest.containerPath or "").strip().strip("/")
    if path.count("/") != 1:
        raise ProviderError("invalid_request", "GitHub destination path must be owner/repo.")
    owner, repo = path.split("/", 1)
    if not owner or not repo:
        raise ProviderError("invalid_request", "GitHub destination path must be owner/repo.")
    return owner, repo


def _forge_user(payload: Mapping[str, Any]) -> ForgeUser:
    login = str(payload.get("login") or "")
    user_type = str(payload.get("type") or "")
    is_bot = user_type.casefold() == "bot" or login.endswith("[bot]")
    return ForgeUser(
        id=str(payload.get("id") or ""),
        login=login,
        isBot=is_bot,
        displayName=str(payload.get("name") or "") or None,
    )


def _is_pull_request(payload: Mapping[str, Any]) -> bool:
    return bool(payload.get("pull_request"))


def _instance_kind(raw: str) -> str:
    kind = (raw or "").strip().casefold()
    if kind in {"ghes", "github_enterprise", "github-enterprise"}:
        return GHES_INSTANCE
    return GITHUB_COM_INSTANCE


# Imported by tests so the frozen conformance table stays the adapter's source.
ADAPTER_CONFORMANCE_CASES = PROTOCOL_CONFORMANCE_CASES

__all__ = [
    "ADAPTER_CONFORMANCE_CASES",
    "GitHubIssueAdapter",
    "conformance_kind",
]
