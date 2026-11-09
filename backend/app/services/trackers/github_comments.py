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
from typing import Any, Mapping, Optional

from app.services.trackers.capabilities import require_capability
from app.services.trackers.contracts import (
    CommentRead,
    Destination,
    ForbiddenRead,
    GoneConfirmed,
    NotModified,
    PageCursor,
    RemoteComment,
    RemoteVersion,
    assert_no_owner_repo,
)
from app.services.trackers.errors import ProviderError
from app.services.trackers.github_recovery import CommentPageFetcher, make_comment_page_fetcher
from app.services.trackers.forge_client import ForgeClient, read_outcome
from app.services.trackers.github_auth import GitHubAppAuth
from app.services.trackers.http import TrackerHttp
from app.services.trackers._shared import github_forge_user as _forge_user, github_owner_repo as _owner_repo


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
        self.client = ForgeClient(self.http, auth.installation_headers, forge="GitHub", noun="comment")
        self.bot_user_id = (bot_user_id or "").strip()
        self.bot_login = (bot_login or "").strip()

    def add_comment(
        self,
        dest: Destination,
        ext_id: str,
        body: str,
        op_id: str,
        *,
        issue_id: str | None = None,
    ) -> RemoteComment:
        del op_id
        owner, repo = _owner_repo(dest)
        response = self.client.request(
            "POST",
            self.auth.url(f"/repos/{owner}/{repo}/issues/{ext_id}/comments"),
            json_body={"body": body},
        )
        return self._comment_from(
            self.client.json_object(response),
            issue_id=issue_id,
            issue_number=str(ext_id),
            etag=response.etag,
        )

    def edit_comment(self, dest: Destination, ext_cid: str, body: str) -> RemoteComment:
        current = self._require_comment(dest, ext_cid)
        self._require_own(current, action="edit")
        require_capability(self._caps(), "canEditOwnComment")
        owner, repo = _owner_repo(dest)
        response = self.client.request(
            "PATCH",
            self.auth.url(f"/repos/{owner}/{repo}/issues/comments/{ext_cid}"),
            json_body={"body": body},
        )
        return self._comment_from(
            self.client.json_object(response),
            issue_id=current.externalId,
            issue_number=str(current.externalNumber) if current.externalNumber is not None else None,
            etag=response.etag,
        )

    def delete_comment(self, dest: Destination, ext_cid: str) -> None:
        current = self._require_comment(dest, ext_cid)
        self._require_own(current, action="delete")
        require_capability(self._caps(), "canDeleteOwnComment")
        owner, repo = _owner_repo(dest)
        self.client.request("DELETE", self.auth.url(f"/repos/{owner}/{repo}/issues/comments/{ext_cid}"))

    def get_comment(
        self, dest: Destination, ext_cid: str, etag: Optional[str] = None
    ) -> CommentRead:
        owner, repo = _owner_repo(dest)
        url = self.auth.url(f"/repos/{owner}/{repo}/issues/comments/{ext_cid}")
        try:
            response = self.client.request("GET", url, etag=etag)
        except ProviderError as exc:
            return read_outcome(exc, allow_moved=False)
        if response.status == 304:
            return NotModified(etag=response.etag or etag)
        return self._comment_from(self.client.json_object(response), etag=response.etag)

    def list_comments(
        self,
        dest: Destination,
        issue: str,
        cursor: Optional[PageCursor] = None,
        *,
        issue_id: str | None = None,
    ) -> tuple[list[RemoteComment], Optional[PageCursor]]:
        owner, repo = _owner_repo(dest)
        url = (cursor.value if cursor and cursor.value else
               self.auth.url(f"/repos/{owner}/{repo}/issues/{issue}/comments"))
        params: dict[str, Any] | None = None
        if not (cursor and cursor.value):
            params = {"per_page": 100}
        try:
            response = self.client.request("GET", url, params=params)
        except ProviderError:
            # A failed page is not an empty complete listing (C7).
            raise
        items = self.client.json_list(response)
        comments = [
            self._comment_from(
                item,
                issue_id=issue_id,
                issue_number=str(issue),
                etag=response.etag,
            )
            for item in items
            if isinstance(item, dict)
        ]
        next_page = response.next_page()
        if next_page:
            return comments, PageCursor(value=next_page, exhausted=False)
        return comments, PageCursor(value="", exhausted=True)

    def recovery_comment_pages(self, dest: Destination, issue: str) -> CommentPageFetcher:
        """Pages of the issue's comments for a reply recovery scan."""

        return make_comment_page_fetcher(self, dest, issue)

    def find_comment_by_marker(
        self,
        dest: Destination,
        issue: str,
        marker: str,
        *,
        issue_id: str | None = None,
    ) -> Optional[RemoteComment]:
        needle = (marker or "").strip()
        if not needle:
            return None
        bot_ids = {value for value in (self.bot_user_id,) if value}
        bot_logins = {value.casefold() for value in (self.bot_login,) if value}
        if not bot_ids and not bot_logins:
            raise ProviderError(
                "capability_missing",
                "GitHub bot identity is unknown; cannot scan comments by marker.",
            )
        cursor: Optional[PageCursor] = None
        seen_empty_complete = False
        while True:
            page, cursor = self.list_comments(dest, issue, cursor, issue_id=issue_id)
            for comment in page:
                if needle not in (comment.body or ""):
                    continue
                author_id = comment.author.id
                author_login = comment.author.login.casefold()
                owned = (author_id and author_id in bot_ids) or (
                    author_login and author_login in bot_logins
                )
                if owned:
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
        issue_id: str | None = None,
        issue_number: str | None = None,
        etag: str | None = None,
    ) -> RemoteComment:
        author_raw = payload.get("user") if isinstance(payload.get("user"), dict) else {}
        issue_url = str(payload.get("issue_url") or "")
        derived_number = issue_number or issue_url.rstrip("/").rsplit("/", 1)[-1]
        parsed_number = int(derived_number) if str(derived_number or "").isdigit() else None
        comment = RemoteComment(
            externalCommentId=str(payload.get("id") or ""),
            externalId=str(issue_id or ""),
            externalNumber=parsed_number,
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


__all__ = ["GitHubCommentAdapter", "comment_body_hash"]
