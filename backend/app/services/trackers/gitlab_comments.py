"""GitLab issue-note adapter (gitlab.com and self-managed).

Mirrors ``GitHubCommentAdapter``. The one structural difference: GitLab reaches
a note only through its issue (``/projects/:id/issues/:iid/notes/:note_id``),
while the runtime identifies a remote reply by one string. GitLab reply ids are
therefore ``"<iid>:<note_id>"`` everywhere: in stored links, webhook hints,
listings and recovery. System notes (label changes, closes, mentions) are not
replies and are never listed.

The bot may edit or delete only notes it authored (D5), exactly as on GitHub.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional

from app.services.trackers.capabilities import require_capability
from app.services.trackers.contracts import (
    CommentRead,
    Destination,
    ForbiddenRead,
    GoneConfirmed,
    PageCursor,
    RemoteComment,
    RemoteVersion,
    UncertainAbsence,
    assert_no_owner_repo,
)
from app.services.trackers.errors import ProviderError
from app.services.trackers.github_comments import comment_body_hash
from app.services.trackers.gitlab_auth import GitLabBotAuth, web_root_for
from app.services.trackers.gitlab_issues import _forge_user, project_ref
from app.services.trackers.http import ForgeHttpResponse, TrackerHttp


def comment_id(iid: str | int, note_id: str | int) -> str:
    return f"{iid}:{note_id}"


def split_comment_id(value: str) -> tuple[str, str]:
    iid, sep, note = str(value or "").partition(":")
    if not sep or not iid.isdigit() or not note.isdigit():
        raise ProviderError("invalid_request", "GitLab reply ids have the form <issue iid>:<note id>.")
    return iid, note


class GitLabCommentAdapter:
    """Bot-token note operations. Does not use user OAuth tokens."""

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
        response = self._request("POST", self._notes_url(dest, ext_id), json_body={"body": body})
        return self._comment_from(self._json_object(response), dest, iid=str(ext_id), issue_id=issue_id)

    def edit_comment(self, dest: Destination, ext_cid: str, body: str) -> RemoteComment:
        current = self._require_comment(dest, ext_cid)
        self._require_own(current, action="edit")
        require_capability(self.auth.capabilities(), "canEditOwnComment")
        iid, note = split_comment_id(ext_cid)
        response = self._request("PUT", self._notes_url(dest, iid, note), json_body={"body": body})
        return self._comment_from(self._json_object(response), dest, iid=iid, issue_id=current.externalId or None)

    def delete_comment(self, dest: Destination, ext_cid: str) -> None:
        current = self._require_comment(dest, ext_cid)
        self._require_own(current, action="delete")
        require_capability(self.auth.capabilities(), "canDeleteOwnComment")
        iid, note = split_comment_id(ext_cid)
        self._request("DELETE", self._notes_url(dest, iid, note))

    def get_comment(self, dest: Destination, ext_cid: str, etag: Optional[str] = None) -> CommentRead:
        del etag
        iid, note = split_comment_id(ext_cid)
        try:
            response = self._request("GET", self._notes_url(dest, iid, note))
        except ProviderError as exc:
            return _read_from_error(exc)
        payload = self._json_object(response)
        if payload.get("system"):
            # A system note is not a reply; to the runtime it does not exist.
            return UncertainAbsence(status=404)
        return self._comment_from(payload, dest, iid=iid)

    def list_comments(
        self,
        dest: Destination,
        issue: str,
        cursor: Optional[PageCursor] = None,
        *,
        issue_id: str | None = None,
    ) -> tuple[list[RemoteComment], Optional[PageCursor]]:
        if cursor and cursor.value:
            url, params = cursor.value, None
        else:
            url = self._notes_url(dest, issue)
            params = {"sort": "asc", "order_by": "created_at", "per_page": 100}
        # A failed page raises; it is never an empty complete listing (C7).
        response = self._request("GET", url, params=params)
        comments = [
            self._comment_from(item, dest, iid=str(issue), issue_id=issue_id)
            for item in self._json_list(response)
            if isinstance(item, dict) and not item.get("system")
        ]
        next_page = response.next_page()
        if next_page:
            return comments, PageCursor(value=next_page, exhausted=False)
        return comments, PageCursor(value="", exhausted=True)

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
        if not self.bot_user_id and not self.bot_login:
            raise ProviderError("capability_missing", "GitLab bot identity is unknown; cannot scan notes by marker.")
        cursor: Optional[PageCursor] = None
        while True:
            page, cursor = self.list_comments(dest, issue, cursor, issue_id=issue_id)
            for comment in page:
                if needle in (comment.body or "") and self._owned(comment):
                    return comment
            if cursor is None or cursor.exhausted or not cursor.value:
                return None

    def comment_hash(self, comment: RemoteComment) -> str:
        return comment_body_hash(comment.body)

    def _require_comment(self, dest: Destination, ext_cid: str) -> RemoteComment:
        result = self.get_comment(dest, ext_cid)
        if isinstance(result, RemoteComment):
            return result
        if isinstance(result, GoneConfirmed):
            raise ProviderError("gone_confirmed", "Note is gone.", status=410)
        if isinstance(result, ForbiddenRead):
            raise ProviderError("forbidden", "Note is not readable.", status=result.status)
        raise ProviderError("not_found_uncertain", "Note was not found.", status=404)

    def _owned(self, comment: RemoteComment) -> bool:
        if self.bot_user_id and comment.author.id == self.bot_user_id:
            return True
        return bool(self.bot_login) and comment.author.login.casefold() == self.bot_login.casefold()

    def _require_own(self, comment: RemoteComment, *, action: str) -> None:
        if not self.bot_user_id and not self.bot_login:
            raise ProviderError("capability_missing", f"GitLab bot identity is unknown; refuse to {action} a note.")
        if not self._owned(comment):
            raise ProviderError(
                "capability_missing",
                f"GitLab bot cannot {action} a note authored by {comment.author.login or 'another user'}.",
            )

    def _comment_from(
        self,
        payload: Mapping[str, Any],
        dest: Destination,
        *,
        iid: str,
        issue_id: str | None = None,
    ) -> RemoteComment:
        author = payload.get("author") if isinstance(payload.get("author"), dict) else {}
        note_id = str(payload.get("id") or "")
        comment = RemoteComment(
            externalCommentId=comment_id(iid, note_id),
            externalId=str(issue_id or payload.get("noteable_id") or ""),
            externalNumber=int(iid) if str(iid).isdigit() else None,
            url=f"{self._web_root()}/{dest.containerPath.strip('/')}/-/issues/{iid}#note_{note_id}",
            body=str(payload.get("body") or ""),
            author=_forge_user(author),
            version=RemoteVersion(updatedAt=str(payload.get("updated_at") or "") or None, etag=None),
            createdAt=str(payload.get("created_at") or "") or None,
            actor=None,
        )
        assert_no_owner_repo(comment)
        return comment

    def _web_root(self) -> str:
        creds = self.auth.credentials
        return web_root_for(instance_kind=creds.instance_kind, base_url=creds.base_url)

    def _notes_url(self, dest: Destination, iid: str, note: str | None = None) -> str:
        ref = str(iid or "").strip()
        if not ref.isdigit():
            raise ProviderError("invalid_request", "GitLab issues are addressed by their numeric iid.")
        suffix = f"/notes/{note}" if note else "/notes"
        return self.auth.url(f"/projects/{project_ref(dest)}/issues/{ref}{suffix}")

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
            raise ProviderError("transient", "GitLab returned a non-object note payload.")
        return payload

    def _json_list(self, response: ForgeHttpResponse) -> list[Any]:
        payload = response.json() if response.content else []
        if not isinstance(payload, list):
            raise ProviderError("transient", "GitLab note listing was not a complete page.")
        return payload


def _read_from_error(exc: ProviderError) -> CommentRead:
    if exc.class_ == "not_found_uncertain":
        return UncertainAbsence(status=exc.status or 404)
    if exc.class_ == "gone_confirmed":
        return GoneConfirmed(status=exc.status or 410)
    if exc.class_ == "forbidden":
        return ForbiddenRead(status=exc.status or 403)
    raise exc


__all__ = ["GitLabCommentAdapter", "comment_id", "split_comment_id"]
