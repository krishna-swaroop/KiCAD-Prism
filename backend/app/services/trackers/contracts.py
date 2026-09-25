"""Provider-neutral tracker protocols and frozen DTOs (RFC §6, D3, D9).

This module is the adapter boundary. GitHub/GitLab/Gitea implementations
live in later tickets and must depend on these types, not the other way
around. Persistence identity is a ``Destination`` (connector + immutable
container id + generation). ``owner`` / ``repo`` are never fields here;
``containerPath`` is a display path that can change on transfer.

Adapters can implement the three protocols with in-process fakes — they
must not import ``app.api`` or frontend modules.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional, Protocol, Sequence, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.trackers.capabilities import ProviderCapabilities
from app.services.trackers.errors import ProviderError

CONTAINER_KINDS = ("repo", "group", "project")
VISIBILITIES = ("public", "private", "unknown")
OBJECT_KINDS = ("issue", "comment")
HINT_EVENTS = ("created", "edited", "deleted", "reopened", "closed", "transferred", "labeled")

_FORBIDDEN_PERSISTENCE_KEYS = frozenset(
    {"owner", "repo", "ownerRepo", "owner_repo", "fullName", "full_name"}
)


class _FrozenDto(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Destination(_FrozenDto):
    """Where a linked thread lives. The numeric container id is the identity."""

    connectorId: str
    containerKind: Literal["repo", "group", "project"]
    containerPath: str
    remoteContainerId: str
    generation: int = Field(ge=1)
    visibility: Optional[Literal["public", "private", "unknown"]] = None

    @field_validator("connectorId", "containerPath", "remoteContainerId")
    @classmethod
    def _non_empty(cls, value: str) -> str:
        text = (value or "").strip()
        if not text:
            raise ValueError("destination identity fields cannot be empty")
        return text


class Container(_FrozenDto):
    """Resolved remote container from ``IssueTracker.get_container``."""

    remoteContainerId: str
    path: str
    visibility: Literal["public", "private", "unknown"]
    transferredFromId: Optional[str] = None


class ForgeUser(_FrozenDto):
    """Fetched object author or verified event actor. Never inferred."""

    id: str
    login: str
    isBot: bool = False
    displayName: Optional[str] = None


class IdentityToken(_FrozenDto):
    """User OAuth token returned by ``IdentityProvider``. Not a persistence row."""

    accessToken: str
    refreshToken: Optional[str] = None
    tokenType: str = "bearer"
    expiresAt: Optional[str] = None
    scopes: list[str] = Field(default_factory=list)

    def __repr__(self) -> str:
        return "IdentityToken(redacted)"

    def __str__(self) -> str:
        return "IdentityToken(redacted)"


class RemoteVersion(_FrozenDto):
    updatedAt: Optional[str] = None
    etag: Optional[str] = None


class RemoteAssignee(_FrozenDto):
    id: str
    login: str


class IssueContainerRef(_FrozenDto):
    remoteContainerId: str
    path: str


class RemoteIssue(_FrozenDto):
    externalId: str
    url: str
    number: Optional[int] = None
    title: str
    body: str
    state: Literal["open", "closed"]
    labels: list[str] = Field(default_factory=list)
    assignees: list[RemoteAssignee] = Field(default_factory=list)
    author: ForgeUser
    version: RemoteVersion
    container: IssueContainerRef
    actor: Optional[ForgeUser] = None


class RemoteComment(_FrozenDto):
    externalCommentId: str
    externalId: str
    externalNumber: Optional[int] = None
    url: str
    body: str
    author: ForgeUser
    version: RemoteVersion
    createdAt: Optional[str] = None
    actor: Optional[ForgeUser] = None


class RemoteHint(_FrozenDto):
    """Object reference only. State is always re-fetched before apply (C6)."""

    connectorId: str
    deliveryId: str
    objectKind: Literal["issue", "comment"]
    remoteContainerId: str
    externalId: str
    event: str
    receivedAt: str
    externalCommentId: Optional[str] = None
    actor: Optional[ForgeUser] = None


class RemoteChange(_FrozenDto):
    objectKind: Literal["issue", "comment"]
    remoteContainerId: str
    externalId: str
    observedUpdatedAt: Optional[str] = None
    externalCommentId: Optional[str] = None


class RemoteEvent(_FrozenDto):
    """Timeline event. ``actor`` is nullable when the forge did not name one."""

    externalId: str
    eventId: str
    event: str
    createdAt: str
    actor: Optional[ForgeUser] = None


class IssueContextBlock(_FrozenDto):
    board: Optional[str] = None
    context: Optional[str] = None
    layer: Optional[str] = None
    sheet: Optional[str] = None
    net: Optional[str] = None
    refdes: Optional[str] = None
    coordinatesMm: Optional[list[float]] = None
    commit: Optional[str] = None
    prismUrl: Optional[str] = None
    requestedBy: Optional[str] = None
    assignmentHints: list[str] = Field(default_factory=list)


class IssueDraft(_FrozenDto):
    title: str
    proseBlock: str
    contextBlock: IssueContextBlock
    labels: list[str] = Field(default_factory=list)
    assignees: list[str] = Field(default_factory=list)
    marker: str


class IssuePatch(_FrozenDto):
    title: Optional[str] = None
    proseBlock: Optional[str] = None
    labels: Optional[list[str]] = None
    assignees: Optional[list[str]] = None


class PageCursor(_FrozenDto):
    """Opaque pagination cursor. Advance only after hints are durable (C7)."""

    value: str
    exhausted: bool = False


class UpdateCursor(_FrozenDto):
    since: str
    page: Optional[str] = None


# ---------------------------------------------------------------------------
# Read outcomes. These are distinct types so a 304 / 404 / 410 / transfer
# cannot be stored as if the object arrived.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class NotModified:
    kind: str = "not_modified"
    etag: Optional[str] = None


@dataclass(frozen=True)
class UncertainAbsence:
    """404 or incomplete listing. Not proof of deletion (D2, D7)."""

    kind: str = "not_found_uncertain"
    status: int = 404


@dataclass(frozen=True)
class GoneConfirmed:
    kind: str = "gone_confirmed"
    status: int = 410


@dataclass(frozen=True)
class Moved:
    kind: str = "moved"
    new_ref: str = ""
    new_container_id: Optional[str] = None


@dataclass(frozen=True)
class ForbiddenRead:
    kind: str = "forbidden"
    status: int = 403


IssueRead = Union[RemoteIssue, NotModified, UncertainAbsence, GoneConfirmed, Moved, ForbiddenRead]
CommentRead = Union[RemoteComment, NotModified, UncertainAbsence, GoneConfirmed, ForbiddenRead]


def assert_no_owner_repo(model: BaseModel) -> None:
    """Persistence-shaped DTOs must not grow GitHub owner/repo columns."""

    names = set(type(model).model_fields)
    leaked = names & _FORBIDDEN_PERSISTENCE_KEYS
    if leaked:
        raise ValueError(f"owner/repo shape leaked into {type(model).__name__}: {sorted(leaked)}")
    dumped = model.model_dump()
    leaked_values = [key for key in dumped if key in _FORBIDDEN_PERSISTENCE_KEYS]
    if leaked_values:
        raise ValueError(f"owner/repo keys present on {type(model).__name__}: {leaked_values}")


# Shared adapter conformance cases (F4 / F7). Adapters import this tuple and
# drive their HTTP fixtures through the same expected kinds.
PROTOCOL_CONFORMANCE_CASES: tuple[dict, ...] = (
    {
        "id": "F7.conditional_304",
        "status": 304,
        "retry_after": False,
        "expect_kind": "not_modified",
    },
    {
        "id": "F7.private_404",
        "status": 404,
        "retry_after": False,
        "expect_kind": "not_found_uncertain",
    },
    {
        "id": "F7.gone_410",
        "status": 410,
        "retry_after": False,
        "expect_kind": "gone_confirmed",
    },
    {
        "id": "F7.throttling",
        "status": 403,
        "retry_after": True,
        "expect_kind": "rate_limited",
    },
    {
        "id": "F7.unauthorized_401",
        "status": 401,
        "retry_after": False,
        "expect_kind": "auth_lost",
    },
    {
        "id": "F7.transfer_to_approved_container",
        "status": 301,
        "retry_after": False,
        "expect_kind": "moved",
    },
    {
        "id": "F4.unknown_editor_via_poll",
        "status": 200,
        "retry_after": False,
        "expect_kind": "ok",
        "expect_actor": None,
    },
)


class IdentityProvider(Protocol):
    """Account linking. Bot installation tokens are a different credential."""

    def authorize_url(self, state: str, pkce_challenge: str) -> str:
        ...

    def exchange(self, code: str, pkce_verifier: str) -> IdentityToken:
        ...

    def refresh(self, token: IdentityToken) -> IdentityToken:
        ...

    def whoami(self, token: IdentityToken) -> ForgeUser:
        ...


class WebhookTransport(Protocol):
    """Inbound hints. ``verify`` runs on the raw bytes, not re-serialized JSON."""

    def register(self, dest: Destination, url: str, secret: str) -> str:
        ...

    def verify(self, headers: dict[str, str], raw_body: bytes, secret: str) -> bool:
        ...

    def parse(self, headers: dict[str, str], body: bytes) -> list[RemoteHint]:
        ...


class IssueTracker(Protocol):
    """Bot task operations against one destination generation."""

    kind: str

    def capabilities(self) -> ProviderCapabilities:
        ...

    def get_container(self, dest: Destination) -> Container:
        ...

    def create_issue(self, dest: Destination, draft: IssueDraft, op_id: str) -> RemoteIssue:
        ...

    def find_by_marker(
        self, dest: Destination, marker: str, since: Optional[str] = None
    ) -> Optional[RemoteIssue]:
        ...

    def get_issue(
        self, dest: Destination, ext_id: str, etag: Optional[str] = None
    ) -> IssueRead:
        ...

    def update_issue(self, dest: Destination, ext_id: str, patch: IssuePatch) -> RemoteIssue:
        ...

    def set_state(self, dest: Destination, ext_id: str, state: str, note: str) -> RemoteIssue:
        ...

    def add_comment(self, dest: Destination, ext_id: str, body: str, op_id: str) -> RemoteComment:
        ...

    def edit_comment(self, dest: Destination, ext_cid: str, body: str) -> RemoteComment:
        ...

    def delete_comment(self, dest: Destination, ext_cid: str) -> None:
        ...

    def get_comment(self, dest: Destination, ext_cid: str, etag: Optional[str] = None) -> CommentRead:
        ...

    def list_comments(
        self, dest: Destination, issue: str, cursor: Optional[PageCursor] = None
    ) -> tuple[list[RemoteComment], Optional[PageCursor]]:
        ...

    def find_comment_by_marker(
        self, dest: Destination, issue: str, marker: str
    ) -> Optional[RemoteComment]:
        ...

    def list_updates(
        self, dest: Destination, since_cursor: UpdateCursor
    ) -> tuple[list[RemoteChange], UpdateCursor]:
        ...

    def list_events(self, dest: Destination, ext_id: str) -> Sequence[RemoteEvent]:
        ...

    def ensure_labels(self, dest: Destination, labels: Sequence[str]) -> None:
        ...

    def can_assign(self, dest: Destination, forge_login: str) -> bool:
        ...


__all__ = [
    "CONTAINER_KINDS",
    "CommentRead",
    "Container",
    "Destination",
    "ForbiddenRead",
    "ForgeUser",
    "GoneConfirmed",
    "HINT_EVENTS",
    "IdentityProvider",
    "IdentityToken",
    "IssueContextBlock",
    "IssueDraft",
    "IssuePatch",
    "IssueRead",
    "IssueTracker",
    "Moved",
    "NotModified",
    "OBJECT_KINDS",
    "PROTOCOL_CONFORMANCE_CASES",
    "PageCursor",
    "ProviderCapabilities",
    "ProviderError",
    "RemoteAssignee",
    "RemoteChange",
    "RemoteComment",
    "RemoteEvent",
    "RemoteHint",
    "RemoteIssue",
    "RemoteVersion",
    "UncertainAbsence",
    "UpdateCursor",
    "VISIBILITIES",
    "WebhookTransport",
    "assert_no_owner_repo",
]
