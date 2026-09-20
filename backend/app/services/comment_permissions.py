"""Who may do what to a comment thread, and as whom (tracker contracts D4/D6).

Authentication says who the caller is; this module says what that caller may
do to a specific root comment or reply, and which stable identity a mutation
is recorded under. It is deliberately free of HTTP routing and database
access so the comments router, the store and the sync engine share one
answer.

Three ideas are kept apart because the contract keeps them apart:

* **Ownership** compares the actor's stable key with the object's
  ``author_user_id``. Display names and email addresses never grant
  ownership; legacy rows (written before authorship was authenticated) have
  no owner and only admins may change them.
* **Status authority** (resolve/reopen) belongs to designers and above.
* **Publication** is the project's ``promote_min_role``. It gates every
  mutation that would make the tracker write to the forge, but it never
  blocks the local collaboration itself: a reply a viewer may not publish is
  still saved, visibly unsynced.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional, Protocol

from fastapi import HTTPException

from app.core.roles import Role, role_meets_minimum
from app.core.security import AuthenticatedUser, _has_scope
from app.services import access_service

DEFAULT_PROMOTE_MIN_ROLE: Role = "designer"
STATUS_MIN_ROLE: Role = "designer"

# Kinds of stable actor identity. ``legacy`` never describes a live actor; it
# marks rows whose author was recorded as free text before TR-01.
ACTOR_KIND_USER = "user"
ACTOR_KIND_SERVICE = "service"
ACTOR_KIND_GUEST = "guest"
ACTOR_KIND_LEGACY = "legacy"
ACTOR_KIND_REMOTE = "remote"

_PROVIDER_TOKEN_DETAIL = "KiCad remote-provider tokens cannot modify Prism resources"


class CommentAction(str, Enum):
    CREATE = "create"
    REPLY = "reply"
    EDIT = "edit"
    DELETE = "delete"
    RESOLVE = "resolve"
    PROMOTE = "promote"
    RETRY = "retry"
    SHARE = "share"


class CommentPermissionError(HTTPException):
    """A refused comment action, with a machine-readable reason.

    ``code`` and ``required_role`` let the router translate the refusal into
    the ``PublicationDeniedError`` / ``ConflictError`` shapes the frontend
    contract expects without parsing the human message.
    """

    def __init__(self, code: str, detail: str, *, required_role: Optional[Role] = None, status_code: int = 403):
        super().__init__(status_code=status_code, detail=detail)
        self.code = code
        self.required_role = required_role


@dataclass(frozen=True)
class ActorIdentity:
    """The stable key a mutation is recorded under, plus what it may do."""

    actor_id: str
    actor_kind: str
    display_name: str
    role: Role
    auth_type: str

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    def can_publish(self, promote_min_role: Role = DEFAULT_PROMOTE_MIN_ROLE) -> bool:
        """Whether this actor's changes may become forge writes on a project."""
        if self.actor_kind == ACTOR_KIND_GUEST:
            return False
        return role_meets_minimum(self.role, promote_min_role)

    @property
    def has_status_authority(self) -> bool:
        return role_meets_minimum(self.role, STATUS_MIN_ROLE)


class Authored(Protocol):
    """The two columns every root and reply exposes for ownership checks."""

    author_user_id: Optional[str]
    author_kind: str


@dataclass(frozen=True)
class AuthoredObject:
    author_user_id: Optional[str]
    author_kind: str


def is_guest(user: AuthenticatedUser) -> bool:
    """The implicit identity of an AUTH_ENABLED=false deployment.

    It shares ``auth_type="session"`` with real sign-ins; the absence of a
    session id together with the fixed local address is what marks it.
    """
    return user.auth_type == "session" and not user.session_id and user.email == "guest@local"


def resolve_actor(user: AuthenticatedUser) -> ActorIdentity:
    """Map an authenticated caller onto its stable actor identity (D6).

    Raises ``CommentPermissionError`` for callers that may never mutate
    comments (remote-provider tokens) and for session users whose identity
    cannot be resolved to a ``users`` row: recording a mutation under a
    guessed key would later grant ownership to the wrong person.
    """
    if user.auth_type == "kicad_provider":
        raise CommentPermissionError("provider_token_read_only", _PROVIDER_TOKEN_DETAIL)

    if user.auth_type in ("service_client", "external_service"):
        prefix = "service" if user.auth_type == "service_client" else "external"
        client_id = user.client_id.strip()
        if not client_id:
            raise CommentPermissionError("identity_unresolved", "Service identity is missing its client id")
        return ActorIdentity(
            actor_id=f"{prefix}:{client_id}",
            actor_kind=ACTOR_KIND_SERVICE,
            display_name=user.name or client_id,
            role=user.role,
            auth_type=user.auth_type,
        )

    if is_guest(user):
        return ActorIdentity(
            actor_id="guest:local",
            actor_kind=ACTOR_KIND_GUEST,
            display_name=user.name or "Guest",
            role=user.role,
            auth_type=user.auth_type,
        )

    user_id = user.user_id.strip()
    display_name = user.name
    if not user_id:
        # Sessions created before user ids were stored carry an empty id. The
        # users table is the only source allowed to fill it in; matching on
        # the display name would let two "Alex Chen"s edit each other's work.
        row = access_service.get_user_by_email(user.email)
        if row is None or not row.get("user_id"):
            raise CommentPermissionError(
                "identity_unresolved",
                "Your account has no user record; sign in again before commenting",
            )
        user_id = row["user_id"]
        display_name = display_name or row.get("name") or user.email
    return ActorIdentity(
        actor_id=user_id,
        actor_kind=ACTOR_KIND_USER,
        display_name=display_name or user.email,
        role=user.role,
        auth_type=user.auth_type,
    )


def require_write_scope(user: AuthenticatedUser) -> None:
    """Bearer callers need ``api:write``; session cookies carry no scopes."""
    if user.auth_type == "session":
        return
    if _has_scope(user, "api:write"):
        return
    raise CommentPermissionError("scope_required", "api:write scope required")


def is_owner(actor: ActorIdentity, target: Authored) -> bool:
    if target.author_kind == ACTOR_KIND_LEGACY or not target.author_user_id:
        return False
    return target.author_user_id == actor.actor_id


def authorize(
    action: CommentAction,
    actor: ActorIdentity,
    *,
    target: Optional[Authored] = None,
    linked: bool = False,
    promote_min_role: Role = DEFAULT_PROMOTE_MIN_ROLE,
) -> None:
    """Raise ``CommentPermissionError`` unless ``actor`` may perform ``action``.

    ``target`` is the root or reply being edited/deleted. ``linked`` says the
    thread has a tracker link, which makes status changes a publication.
    """
    if action in (CommentAction.CREATE, CommentAction.REPLY):
        return

    if action in (CommentAction.EDIT, CommentAction.DELETE):
        if target is None:
            raise ValueError(f"{action.value} needs a target")
        # D5: Prism never edits or deletes forge-origin replies, including admins.
        if target.author_kind == ACTOR_KIND_REMOTE:
            raise CommentPermissionError("remote_object_read_only", "Replies from the tracker cannot be changed in Prism")
        if actor.is_admin or is_owner(actor, target):
            return
        if target.author_kind == ACTOR_KIND_LEGACY:
            raise CommentPermissionError("legacy_admin_only", "Only an admin can change a comment written before authorship was recorded")
        raise CommentPermissionError("not_owner", "Only the author or an admin can change this comment")

    if action == CommentAction.RESOLVE:
        if actor.actor_kind == ACTOR_KIND_GUEST and linked:
            raise CommentPermissionError(
                "publication_required",
                f"Resolving a linked thread requires the {promote_min_role} role on this project",
                required_role=promote_min_role,
            )
        if not actor.has_status_authority:
            raise CommentPermissionError("status_role_required", "Designer role required to resolve or reopen", required_role=STATUS_MIN_ROLE)
        if linked and not actor.can_publish(promote_min_role):
            raise CommentPermissionError(
                "publication_required",
                f"Resolving a linked thread requires the {promote_min_role} role on this project",
                required_role=promote_min_role,
            )
        return

    if action in (CommentAction.PROMOTE, CommentAction.RETRY, CommentAction.SHARE):
        # D4/D6: guest never publishes, even when DEV_GUEST_ROLE=admin.
        if actor.actor_kind == ACTOR_KIND_GUEST:
            raise CommentPermissionError(
                "publication_required",
                "Guest identity cannot publish to the tracker",
                required_role=promote_min_role,
            )
        # D4: service/external may not Retry or Share, even with an admin role.
        if action in (CommentAction.RETRY, CommentAction.SHARE) and actor.actor_kind == ACTOR_KIND_SERVICE:
            raise CommentPermissionError(
                "publication_required",
                "Service identities cannot retry or share tracker operations",
            )
        if actor.is_admin:
            return
        if action != CommentAction.PROMOTE and not actor.has_status_authority:
            raise CommentPermissionError("status_role_required", "Designer role required", required_role=STATUS_MIN_ROLE)
        if not actor.can_publish(promote_min_role):
            raise CommentPermissionError(
                "publication_required",
                f"Sharing to the tracker requires the {promote_min_role} role on this project",
                required_role=promote_min_role,
            )
        return

    raise ValueError(f"unknown comment action {action!r}")


def allowed(action: CommentAction, actor: ActorIdentity, **kwargs) -> bool:
    try:
        authorize(action, actor, **kwargs)
    except CommentPermissionError:
        return False
    return True


def capabilities(
    actor: ActorIdentity,
    target: Authored,
    *,
    linked: bool = False,
    promote_min_role: Role = DEFAULT_PROMOTE_MIN_ROLE,
) -> dict[str, bool]:
    """The ``permissions`` block a thread or reply projection carries.

    Booleans only: the frontend renders controls from these and never
    re-derives policy from roles or names.
    """
    return {
        "canReply": True,
        "canEdit": allowed(CommentAction.EDIT, actor, target=target),
        "canDelete": allowed(CommentAction.DELETE, actor, target=target),
        "canResolve": allowed(CommentAction.RESOLVE, actor, linked=linked, promote_min_role=promote_min_role),
        # Guest-admin must not show Promote; can_publish() already denies guests
        # before any role check.
        "canPublish": actor.can_publish(promote_min_role),
    }
