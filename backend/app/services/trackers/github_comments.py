"""GitHub issue-comment adapter (TR-17, C3/C6/C7).

Create/edit/delete/read and complete comment enumeration. GitHub lets an
installation edit or delete only comments it authored (D5); attempting to
mutate another origin returns ``capability_missing`` rather than a silent
moderation write. Fetched comments expose author and version; the editor is
absent unless a caller supplies event evidence. A failed or truncated page is
never returned as a complete empty listing.
"""

from __future__ import annotations

import hashlib
from typing import Any, Mapping, Optional, Sequence

from app.services.trackers.capabilities import require_capability
from app.services.trackers.contracts import (
    CommentRead,
    Destination,
    ForbiddenRead,
    ForgeUser,
    GoneConfirmed,
    NotModified,
    PageCursor,
    RemoteComment,
    RemoteVersion,
    UncertainAbsence,
    assert_no_owner_repo,
)
from app.services.trackers.errors import ProviderError
from app.services.trackers.github_auth import GitHubAppAuth
from app.services.trackers.http import ForgeHttpResponse, TrackerHttp


def comment_body_hash(body: str) -> str:
    """Stable SHA-256 of the remote comment body. Used for echo detection (D3)."""

    return hashlib.sha256((body or "").encode("utf-8")).hexdigest()


class GitHubCommentAdapter:
    """Bot-credential comment operations. Does not use user OAuth tokens."""

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

    def add_comment(self, dest: Destination, ext_id: str, body: str, op_id: str) -> RemoteComment:
        del op_id
        owner, repo = _owner_repo(dest)
        response = self._request(
            "POST",
            self.auth.url(f"/repos/{owner}/{repo}/issues/{ext_id}/comments"),
            json_body={"body": body},
        )
        return self._comment_from(self._json_object(response), issue_ref=str(ext_id), etag=response.etag)

    def edit_comment(self, dest: Destination, ext_cid: str, body: str) -> RemoteComment:
        current = self._require_comment(dest, ext_cid)
        self._require_own(current, action="edit")
        require_capability(self._caps(), "canEditOwnComment")
        owner, repo = _owner_repo(dest)
        response = self._request(
            "PATCH",
            self.auth.url(f"/repos/{owner}/{repo}/issues/comments/{ext_cid}"),
            json_body={"body": body},
        )
        return self._comment_from(
            self._json_object(response),
            issue_ref=current.externalId,
            etag=response.etag,
        )

    def delete_comment(self, dest: Destination, ext_cid: str) -> None:
        current = self._require_comment(dest, ext_cid)
        self._require_own(current, action="delete")
        require_capability(self._caps(), "canDeleteOwnComment")
        owner, repo = _owner_repo(dest)
        self._request("DELETE", self.auth.url(f"/repos/{owner}/{repo}/issues/comments/{ext_cid}"))

    def get_comment(
        self, dest: Destination, ext_cid: str, etag: Optional[str] = None
    ) -> CommentRead:
        owner, repo = _owner_repo(dest)
        url = self.auth.url(f"/repos/{owner}/{repo}/issues/comments/{ext_cid}")
        try:
            response = self._request("GET", url, etag=etag)
        except ProviderError as exc:
            return _read_from_error(exc)
        if response.status == 304:
            return NotModified(etag=response.etag or etag)
        return self._comment_from(self._json_object(response), etag=response.etag)

    def list_comments(
        self, dest: Destination, issue: str, cursor: Optional[PageCursor] = None
    ) -> tuple[list[RemoteComment], Optional[PageCursor]]:
        owner, repo = _owner_repo(dest)
        url = (cursor.value if cursor and cursor.value else
               self.auth.url(f"/repos/{owner}/{repo}/issues/{issue}/comments"))
        params: dict[str, Any] | None = None
        if not (cursor and cursor.value):
            params = {"per_page": 100}
        try:
            response = self._request("GET", url, params=params)
        except ProviderError:
            # A failed page is not an empty complete listing (C7).
            raise
        items = self._json_list(response)
        comments = [
            self._comment_from(item, issue_ref=str(issue), etag=response.etag)
            for item in items
            if isinstance(item, dict)
        ]
        next_page = response.next_page()
        if next_page:
            return comments, PageCursor(value=next_page, exhausted=False)
        return comments, PageCursor(value="", exhausted=True)

    def find_comment_by_marker(
        self, dest: Destination, issue: str, marker: str
    ) -> Optional[RemoteComment]:
        needle = (marker or "").strip()
        if not needle:
            return None
        cursor: Optional[PageCursor] = None
        seen_empty_complete = False
        while True:
            page, cursor = self.list_comments(dest, issue, cursor)
            for comment in page:
                if needle in (comment.body or ""):
                    return comment
            if cursor is None or cursor.exhausted:
                seen_empty_complete = True
                break
            if not cursor.value:
                break
        if not seen_empty_complete and cursor and not cursor.exhausted:
            raise ProviderError("transient", "Comment listing was incomplete.")
        return None

    def comment_hash(self, comment: RemoteComment) -> str:
        return comment_body_hash(comment.body)

    def _require_comment(self, dest: Destination, ext_cid: str) -> RemoteComment:
        result = self.get_comment(dest, ext_cid)
        if isinstance(result, RemoteComment):
            return result
        if isinstance(result, NotModified):
            raise ProviderError("invalid_request", "Comment etag preflight is not a body.")
        if isinstance(result, GoneConfirmed):
            raise ProviderError("gone_confirmed", "Comment is gone.", status=410)
        if isinstance(result, ForbiddenRead):
            raise ProviderError("forbidden", "Comment is not readable.", status=result.status)
        raise ProviderError("not_found_uncertain", "Comment was not found.", status=404)

    def _require_own(self, comment: RemoteComment, *, action: str) -> None:
        bot_ids = {value for value in (self.bot_user_id,) if value}
        bot_logins = {value.casefold() for value in (self.bot_login,) if value}
        if not bot_ids and not bot_logins:
            raise ProviderError(
                "capability_missing",
                f"GitHub bot identity is unknown; refuse to {action} a remote comment.",
            )
        author_id = comment.author.id
        author_login = comment.author.login.casefold()
        owned = (author_id and author_id in bot_ids) or (author_login and author_login in bot_logins)
        if owned:
            return
        raise ProviderError(
            "capability_missing",
            f"GitHub bot cannot {action} a comment authored by {comment.author.login or 'another user'}.",
        )

    def _caps(self):
        from app.services.trackers.capabilities import github_com_capabilities
        from app.services.trackers.github_auth import API_VERSION

        kind = (self.auth.credentials.instance_kind or "").strip().casefold()
        caps = github_com_capabilities(api_version=API_VERSION)
        if kind in {"ghes", "github_enterprise", "github-enterprise"}:
            caps = caps.model_copy(update={"instanceKind": "ghes"})
        return caps

    def _comment_from(
        self,
        payload: Mapping[str, Any],
        *,
        issue_ref: str | None = None,
        etag: str | None = None,
    ) -> RemoteComment:
        author_raw = payload.get("user") if isinstance(payload.get("user"), dict) else {}
        issue_url = str(payload.get("issue_url") or "")
        derived_issue = issue_ref or issue_url.rstrip("/").rsplit("/", 1)[-1]
        comment = RemoteComment(
            externalCommentId=str(payload.get("id") or ""),
            externalId=str(derived_issue or ""),
            url=str(payload.get("html_url") or payload.get("url") or ""),
            body=str(payload.get("body") or ""),
            author=_forge_user(author_raw),
            version=RemoteVersion(
                updatedAt=str(payload.get("updated_at") or "") or None,
                etag=etag,
            ),
            createdAt=str(payload.get("created_at") or "") or None,
            actor=None,
        )
        assert_no_owner_repo(comment)
        return comment

    def _request(
        self,
        method: str,
        url: str,
        *,
        json_body: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        etag: str | None = None,
    ) -> ForgeHttpResponse:
        response = self.http.request(
            method,
            url,
            headers=self.auth.installation_headers(),
            json_body=json_body,
            params=params,
            etag=etag,
        )
        return self.http.outcome(response)

    def _json_object(self, response: ForgeHttpResponse) -> dict[str, Any]:
        payload = response.json() if response.content else {}
        if not isinstance(payload, dict):
            raise ProviderError("transient", "GitHub returned a non-object comment payload.")
        return payload

    def _json_list(self, response: ForgeHttpResponse) -> list[Any]:
        payload = response.json() if response.content else []
        if not isinstance(payload, list):
            raise ProviderError(
                "transient",
                "GitHub comment listing was not a complete page.",
            )
        return payload


def _read_from_error(exc: ProviderError) -> CommentRead:
    if exc.class_ == "not_found_uncertain":
        return UncertainAbsence(status=exc.status or 404)
    if exc.class_ == "gone_confirmed":
        return GoneConfirmed(status=exc.status or 410)
    if exc.class_ == "forbidden":
        return ForbiddenRead(status=exc.status or 403)
    raise exc


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


__all__ = ["GitHubCommentAdapter", "comment_body_hash"]
