"""Author, actor, editor separation and echo detection (TR-28, D3/C6).

Fetched object authors are immutable reply metadata. Webhook/poll actors are
event evidence only. Echoes match expected op body/state hashes — never the
author field.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Optional, Sequence

from app.services.comments_revisions import ORIGIN_REMOTE, Editor
from app.services.trackers.contracts import ForgeUser, RemoteComment, RemoteIssue
from app.services.trackers.github_comments import comment_body_hash
from app.services.trackers.providers import display_name

ECHO_STATES = ("sent", "confirmed")
BODY_OPS = ("add_comment", "edit_comment", "update_issue", "post_note")
STATE_OPS = ("set_state",)


def normalize_body(body: str) -> str:
    """Stable normalization before hashing (D3)."""

    return (body or "").replace("\r\n", "\n").replace("\r", "\n")


def body_hash(body: str) -> str:
    return comment_body_hash(normalize_body(body))


def stored_hash_matches(expected: str | None, fetched_body: str) -> bool:
    if not expected:
        return False
    actual = body_hash(fetched_body)
    needle = (expected or "").strip()
    if needle.startswith("sha256:"):
        needle = needle.split(":", 1)[1]
    return actual == needle or f"sha256:{actual}" == expected


def actor_is_bot(
    *,
    actor_id: str | None,
    actor_login: str | None,
    bot_user_id: str | None,
    bot_login: str | None,
) -> bool:
    if bot_user_id and actor_id and str(actor_id) == str(bot_user_id):
        return True
    if bot_login and actor_login:
        return actor_login.casefold() == bot_login.casefold()
    return False


def resolve_editor(
    *,
    actor_id: str | None = None,
    actor_login: str | None = None,
    provider: str = "github",
) -> Editor:
    """Map event actor evidence to a revision editor (D3)."""

    name = display_name(provider)
    login = (actor_login or "").strip()
    if login:
        return Editor(
            user_id=None,
            kind="remote_actor",
            display=f"{login} ({name})",
            origin=ORIGIN_REMOTE,
        )
    return Editor(
        user_id=None,
        kind="remote_unknown",
        display=f"edited on {name}",
        origin=ORIGIN_REMOTE,
    )


def remote_reply_author(user: ForgeUser, *, provider: str = "github") -> tuple[str, str, str]:
    """Return author display, author_kind and origin for a fetched remote user."""

    login = (user.login or "").strip() or "unknown"
    display = login
    if user.displayName and user.displayName.strip():
        display = user.displayName.strip()
    return display, "remote", ORIGIN_REMOTE


@dataclass(frozen=True)
class EchoMatch:
    op_id: str
    op_kind: str
    op_state: str


def find_body_echo(
    ops: Sequence[Mapping[str, Any]],
    *,
    fetched_body: str,
    bot_user_id: str | None = None,
    bot_login: str | None = None,
    event_actor_id: str | None = None,
    event_actor_login: str | None = None,
) -> EchoMatch | None:
    """Return the first matching echo op, if any (D3)."""

    for op in ops:
        state = str(op.get("state") or "")
        if state not in ECHO_STATES:
            continue
        kind = str(op.get("op") or "")
        if kind not in BODY_OPS:
            continue
        if not stored_hash_matches(op.get("expected_body_hash"), fetched_body):
            continue
        if kind in STATE_OPS:
            continue
        return EchoMatch(op_id=str(op["id"]), op_kind=kind, op_state=state)
    return None


def find_state_echo(
    ops: Sequence[Mapping[str, Any]],
    *,
    fetched_state: str,
    bot_user_id: str | None,
    bot_login: str | None,
    event_actor_id: str | None,
    event_actor_login: str | None,
) -> EchoMatch | None:
    for op in ops:
        state = str(op.get("state") or "")
        if state not in ECHO_STATES:
            continue
        if str(op.get("op") or "") != "set_state":
            continue
        expected = str(op.get("expected_remote_state") or "").casefold()
        if expected and expected != fetched_state.casefold():
            continue
        if not actor_is_bot(
            actor_id=event_actor_id,
            actor_login=event_actor_login,
            bot_user_id=bot_user_id,
            bot_login=bot_login,
        ):
            continue
        return EchoMatch(op_id=str(op["id"]), op_kind="set_state", op_state=state)
    return None


def classify_comment_change(
    ops: Sequence[Mapping[str, Any]],
    comment: RemoteComment,
    *,
    event_actor_id: str | None,
    event_actor_login: str | None,
    bot_user_id: str | None,
    bot_login: str | None,
) -> tuple[str, EchoMatch | None]:
    """Classify a fetched comment as echo, edit or unchanged."""

    body = comment.body or ""
    echo = find_body_echo(
        ops,
        fetched_body=body,
        bot_user_id=bot_user_id,
        bot_login=bot_login,
        event_actor_id=event_actor_id,
        event_actor_login=event_actor_login,
    )
    if echo is not None:
        return "echo", echo
    return "edit", None


def classify_issue_state(
    issue: RemoteIssue,
    ops: Sequence[Mapping[str, Any]],
    *,
    event_actor_id: str | None,
    event_actor_login: str | None,
    bot_user_id: str | None,
    bot_login: str | None,
) -> tuple[str, EchoMatch | None]:
    echo = find_state_echo(
        ops,
        fetched_state=issue.state,
        bot_user_id=bot_user_id,
        bot_login=bot_login,
        event_actor_id=event_actor_id,
        event_actor_login=event_actor_login,
    )
    if echo is not None:
        return "echo", echo
    return "observed", None


__all__ = [
    "EchoMatch",
    "body_hash",
    "classify_comment_change",
    "classify_issue_state",
    "find_body_echo",
    "find_state_echo",
    "normalize_body",
    "remote_reply_author",
    "resolve_editor",
    "stored_hash_matches",
]
