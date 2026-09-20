"""
Comments API for KiCAD-Prism Collaboration Feature.

Comment CRUD is backed by the PostgreSQL ``comments`` schema. Visualizer markers
are published via ecad-viewer overlay scenes (never written into KiCad sources).

Attribution is never taken from the request: every mutation is recorded under
the authenticated caller's stable actor identity (``comment_permissions``), and
what a caller may do to an existing thread is decided per object there too.
Edits name the revision they were based on; a stale one is a 409 that writes
nothing.
"""

import asyncio
import os
import re
from typing import Callable, List, Optional, TypeVar

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, model_validator

from app.api._helpers import get_project_for_role_or_404
from app.core.security import AuthenticatedUser, require_comment_writer, require_designer, require_viewer
from app.services import access_service, comment_permissions
from app.services.comment_permissions import (
    ActorIdentity,
    AuthoredObject,
    CommentAction,
    CommentPermissionError,
)
from app.services.comments_revisions import Editor, RevisionConflict
from app.services.comments_store_service import (
    COMMENT_CLASSES,
    COMMENT_SEVERITIES,
    DEFAULT_COMMENT_CLASS,
    DEFAULT_COMMENT_SEVERITY,
    comments_store,
)

router = APIRouter(dependencies=[Depends(require_viewer)])

T = TypeVar("T")


# ============================================================
# PYDANTIC MODELS
# ============================================================

class CommentLocation(BaseModel):
    x: float
    y: float
    layer: str = ""
    page: str = ""
    bounds: Optional[List[float]] = None  # [x, y, w, h] for area comments


class CreateCommentRequest(BaseModel):
    # ``author`` is no longer accepted: attribution comes from the session.
    context: str  # "PCB" or "SCH"
    location: CommentLocation
    content: str
    elementId: Optional[str] = None
    elementRef: Optional[str] = None
    elementType: Optional[str] = None
    commentClass: Optional[str] = DEFAULT_COMMENT_CLASS
    severity: Optional[str] = DEFAULT_COMMENT_SEVERITY
    mentions: Optional[List[str]] = None
    metadata: Optional[dict] = None


class CreateReplyRequest(BaseModel):
    content: str


class UpdateCommentRequest(BaseModel):
    """Root edits and status changes; anchor and location are immutable.

    ``expectedRevision`` is the revision the client displayed. Omitting it
    accepts whatever is current, which is only right for single-writer
    callers such as scripts.
    """

    content: Optional[str] = None
    severity: Optional[str] = None
    commentClass: Optional[str] = None
    mentions: Optional[List[str]] = None
    status: Optional[str] = None  # "OPEN" or "RESOLVED"
    expectedRevision: Optional[int] = None

    @model_validator(mode="before")
    @classmethod
    def reject_immutable_anchor_fields(cls, data):
        """F2.anchor_immutable_on_patch: location/revision cannot be rewritten."""
        if isinstance(data, dict):
            blocked = [name for name in ("location", "revision") if name in data]
            if blocked:
                raise ValueError("anchor fields are immutable")
        return data


class DeleteCommentRequest(BaseModel):
    expectedRevision: Optional[int] = None


class CommentAnchor(BaseModel):
    state: str = "unpinned"
    source: Optional[str] = None
    commit: Optional[str] = None
    sourceRevisionKey: Optional[str] = None
    baseCommit: Optional[str] = None
    compareCommit: Optional[str] = None


class CommentPermissions(BaseModel):
    canReply: bool = True
    canEdit: bool = False
    canDelete: bool = False
    canResolve: bool = False
    canPublish: bool = False


class CommentReply(BaseModel):
    id: str
    author: str
    authorUserId: Optional[str] = None
    authorKind: str = "legacy"
    timestamp: str
    updatedAt: str
    revision: int = 1
    content: str
    origin: str = "prism"
    deletedAt: Optional[str] = None
    permissions: Optional[CommentPermissions] = None


class Comment(BaseModel):
    id: str
    author: str
    authorUserId: Optional[str] = None
    authorKind: str = "legacy"
    timestamp: str
    updatedAt: str
    revision: int = 1
    status: str
    context: str
    location: CommentLocation
    content: str
    replies: List[CommentReply] = Field(default_factory=list)
    elementId: Optional[str] = None
    elementRef: Optional[str] = None
    elementType: Optional[str] = None
    commentClass: str = DEFAULT_COMMENT_CLASS
    severity: str = DEFAULT_COMMENT_SEVERITY
    mentions: List[str] = Field(default_factory=list)
    scope: str = "canvas"
    baseCommit: Optional[str] = None
    compareCommit: Optional[str] = None
    comparisonDomain: Optional[str] = None
    filePath: Optional[str] = None
    semanticItemId: Optional[str] = None
    anchorKind: Optional[str] = None
    anchor: CommentAnchor = Field(default_factory=CommentAnchor)
    permissions: Optional[CommentPermissions] = None
    # Reserved for future forge Issues sync (null/omitted until enabled).
    forgeProvider: Optional[str] = None
    forgeIssueId: Optional[str] = None
    forgeIssueUrl: Optional[str] = None
    forgeSyncState: Optional[str] = None


class CommentsMeta(BaseModel):
    version: str = "1.1"
    generator: str = "KiCad-Prism-Web"


class CommentsFile(BaseModel):
    meta: CommentsMeta = Field(default_factory=CommentsMeta)
    comments: List[Comment] = Field(default_factory=list)


class MentionCandidate(BaseModel):
    email: str
    role: str


class CreateComparisonCommentRequest(BaseModel):
    baseCommit: str
    compareCommit: str
    domain: str
    content: str
    filePath: Optional[str] = None
    semanticItemId: Optional[str] = None
    semanticItemRef: Optional[str] = None
    anchorKind: str = "comparison"
    commentClass: Optional[str] = DEFAULT_COMMENT_CLASS
    severity: Optional[str] = DEFAULT_COMMENT_SEVERITY
    mentions: Optional[List[str]] = None


def _actor(user: AuthenticatedUser) -> ActorIdentity:
    return comment_permissions.resolve_actor(user)


def _editor(actor: ActorIdentity) -> Editor:
    return Editor(user_id=actor.actor_id, kind=actor.actor_kind, display=actor.display_name)


def _authored(comment: dict) -> AuthoredObject:
    return AuthoredObject(
        author_user_id=comment.get("authorUserId"),
        author_kind=str(comment.get("authorKind") or comment_permissions.ACTOR_KIND_LEGACY),
    )


def _with_permissions(comment: dict, actor: ActorIdentity) -> dict:
    """Attach the caller's capabilities so the UI never re-derives policy."""
    comment["permissions"] = comment_permissions.capabilities(actor, _authored(comment))
    for reply in comment.get("replies", []):
        reply["permissions"] = comment_permissions.capabilities(actor, _authored(reply))
    return comment


def _permission_response(exc: CommentPermissionError) -> JSONResponse:
    body = {"detail": exc.detail, "code": exc.code}
    if exc.required_role:
        body["requiredRole"] = exc.required_role
    return JSONResponse(status_code=exc.status_code, content=body)


def _conflict_response(exc: RevisionConflict) -> JSONResponse:
    return JSONResponse(
        status_code=409,
        content={
            "detail": f"{exc.target_kind.capitalize()} changed since revision you edited",
            "code": "revision_conflict",
            "currentRevision": exc.current_revision,
        },
    )


async def _run_mutation(write: Callable[[], T]):
    """Run a store mutation off the event loop, translating policy outcomes.

    Permission refusals and stale revisions are expected outcomes with a
    machine-readable body, not server errors.
    """
    try:
        return await asyncio.to_thread(write)
    except CommentPermissionError as exc:
        return _permission_response(exc)
    except RevisionConflict as exc:
        return _conflict_response(exc)


def _normalize_status(value: str) -> str:
    status = value.upper().strip()
    if status not in {"OPEN", "RESOLVED"}:
        raise HTTPException(status_code=400, detail="Status must be 'OPEN' or 'RESOLVED'")
    return status


def _normalize_context(context: str) -> str:
    normalized = context.upper().strip()
    if normalized not in {"PCB", "SCH"}:
        raise HTTPException(status_code=400, detail="Context must be 'PCB' or 'SCH'")
    return normalized


def _normalize_content(content: str, *, field: str = "content") -> str:
    normalized = content.strip()
    if not normalized:
        raise HTTPException(status_code=400, detail=f"{field.capitalize()} cannot be empty")
    return normalized


def _normalize_bounds(bounds: Optional[List[float]]) -> Optional[List[float]]:
    if bounds is None:
        return None
    if len(bounds) != 4:
        raise HTTPException(status_code=400, detail="location.bounds must be [x, y, w, h]")
    try:
        x, y, w, h = (float(bounds[0]), float(bounds[1]), float(bounds[2]), float(bounds[3]))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="location.bounds must be numeric")
    if w <= 0 or h <= 0:
        raise HTTPException(status_code=400, detail="location.bounds width/height must be > 0")
    return [x, y, w, h]


def _normalize_comment_class(value: Optional[str]) -> str:
    normalized = (value or DEFAULT_COMMENT_CLASS).strip().lower()
    if normalized not in COMMENT_CLASSES:
        raise HTTPException(
            status_code=400,
            detail=f"commentClass must be one of: {', '.join(COMMENT_CLASSES)}",
        )
    return normalized


def _normalize_severity(value: Optional[str]) -> str:
    normalized = (value or DEFAULT_COMMENT_SEVERITY).strip().lower()
    if normalized not in COMMENT_SEVERITIES:
        raise HTTPException(
            status_code=400,
            detail=f"severity must be one of: {', '.join(COMMENT_SEVERITIES)}",
        )
    return normalized


def _normalize_commit(value: str, field: str) -> str:
    normalized = value.strip().lower()
    if not re.fullmatch(r"[0-9a-f]{40}", normalized):
        raise HTTPException(status_code=400, detail=f"{field} must be a full commit SHA")
    return normalized


def _normalize_anchor_kind(value: str) -> str:
    normalized = value.strip().lower()
    if normalized not in {"comparison", "file", "item", "group"}:
        raise HTTPException(
            status_code=400,
            detail="anchorKind must be comparison, file, item, or group",
        )
    return normalized


# ============================================================
# API ENDPOINTS
# ============================================================

@router.get("/{project_id}/comments/mention-candidates", response_model=List[MentionCandidate])
async def list_mention_candidates(
    project_id: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Workspace-scoped users available for @mentions in comments.
    Requires project access; list itself is instance-wide role assignments.
    """
    def read() -> List[MentionCandidate]:
        get_project_for_role_or_404(project_id, user.role)
        return [
            MentionCandidate(email=item["email"], role=item["role"])
            for item in access_service.list_role_assignments()
        ]

    return await asyncio.to_thread(read)


@router.get("/{project_id}/comments")
async def get_comments(project_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    """
    Get all comments for a project from DB snapshot.
    """
    def read():
        project = get_project_for_role_or_404(project_id, user.role)
        listing = comments_store.get_comments_file(project.id, project.path)
        actor = _read_actor(user)
        if actor is not None:
            listing["comments"] = [_with_permissions(c, actor) for c in listing["comments"]]
        return listing

    return await asyncio.to_thread(read)


def _read_actor(user: AuthenticatedUser) -> Optional[ActorIdentity]:
    """The caller as an actor, or None for identities that can never write."""
    try:
        return _actor(user)
    except CommentPermissionError:
        return None


@router.get("/{project_id}/comparison-comments")
async def get_comparison_comments(
    project_id: str,
    base: str,
    compare: str,
    domain: Optional[str] = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """List discussion threads for one immutable, explicitly ordered comparison."""
    domain_norm = _normalize_context(domain) if domain else None
    base_commit = _normalize_commit(base, "base")
    compare_commit = _normalize_commit(compare, "compare")

    def read():
        project = get_project_for_role_or_404(project_id, user.role)
        listing = comments_store.get_comparison_comments(
            project_id=project.id,
            project_path=project.path,
            base_commit=base_commit,
            compare_commit=compare_commit,
            comparison_domain=domain_norm,
        )
        actor = _read_actor(user)
        if actor is not None:
            listing["comments"] = [_with_permissions(c, actor) for c in listing["comments"]]
        return listing

    return await asyncio.to_thread(read)


@router.post(
    "/{project_id}/comparison-comments",
    dependencies=[Depends(require_comment_writer)],
)
async def create_comparison_comment(
    project_id: str,
    request: CreateComparisonCommentRequest,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """Create a comparison-, file-, group-, or semantic-item discussion."""
    domain = _normalize_context(request.domain)
    anchor_kind = _normalize_anchor_kind(request.anchorKind)
    if anchor_kind in {"item", "group"} and not request.semanticItemId:
        raise HTTPException(
            status_code=400,
            detail="semanticItemId is required for item and group comments",
        )
    content = _normalize_content(request.content)
    comment_class = _normalize_comment_class(request.commentClass)
    severity = _normalize_severity(request.severity)
    base_commit = _normalize_commit(request.baseCommit, "baseCommit")
    compare_commit = _normalize_commit(request.compareCommit, "compareCommit")

    def write():
        project = get_project_for_role_or_404(project_id, user.role)
        actor = _actor(user)
        comment_permissions.authorize(CommentAction.CREATE, actor)
        created = comments_store.create_comment(
            project_id=project.id,
            project_path=project.path,
            context=domain,
            location={"x": 0.0, "y": 0.0, "layer": "", "page": request.filePath or ""},
            content=content,
            author=actor.display_name,
            author_user_id=actor.actor_id,
            author_kind=actor.actor_kind,
            element_id=request.semanticItemId,
            element_ref=request.semanticItemRef,
            element_type=anchor_kind,
            comment_class=comment_class,
            severity=severity,
            mentions=request.mentions,
            scope="comparison",
            base_commit=base_commit,
            compare_commit=compare_commit,
            comparison_domain=domain,
            file_path=request.filePath,
            semantic_item_id=request.semanticItemId,
            anchor_kind=anchor_kind,
        )
        return _with_permissions(created, actor)

    return await _run_mutation(write)


@router.post("/{project_id}/comments", dependencies=[Depends(require_comment_writer)])
async def create_comment(
    project_id: str,
    request: CreateCommentRequest,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Create a new comment on the design.
    """
    context = _normalize_context(request.context)
    content = _normalize_content(request.content)
    location = request.location.model_dump()
    location["bounds"] = _normalize_bounds(request.location.bounds)
    comment_class = _normalize_comment_class(request.commentClass)
    severity = _normalize_severity(request.severity)

    def write():
        project = get_project_for_role_or_404(project_id, user.role)
        actor = _actor(user)
        comment_permissions.authorize(CommentAction.CREATE, actor)
        created = comments_store.create_comment(
            project_id=project.id,
            project_path=project.path,
            context=context,
            location=location,
            content=content,
            author=actor.display_name,
            author_user_id=actor.actor_id,
            author_kind=actor.actor_kind,
            element_id=request.elementId,
            element_ref=request.elementRef,
            element_type=request.elementType,
            comment_class=comment_class,
            severity=severity,
            mentions=request.mentions,
            metadata=request.metadata,
        )
        return _with_permissions(created, actor)

    return await _run_mutation(write)


@router.patch("/{project_id}/comments/{comment_id}", dependencies=[Depends(require_comment_writer)])
async def update_comment(
    project_id: str,
    comment_id: str,
    request: UpdateCommentRequest,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """Edit a root's prose/severity/class/mentions and/or change its status.

    Edits need ownership (or admin); status needs the designer role. Both
    append to the thread's history. A stale ``expectedRevision`` is a 409.
    """
    edits = {
        "content": _normalize_content(request.content) if request.content is not None else None,
        "severity": _normalize_severity(request.severity) if request.severity is not None else None,
        "comment_class": _normalize_comment_class(request.commentClass) if request.commentClass is not None else None,
        "mentions": request.mentions,
    }
    has_edit = any(value is not None for value in edits.values())
    status = _normalize_status(request.status) if request.status is not None else None
    if not has_edit and status is None:
        raise HTTPException(status_code=400, detail="No update fields provided")

    def write():
        project = get_project_for_role_or_404(project_id, user.role)
        actor = _actor(user)
        current = comments_store.get_comment(project.id, project.path, comment_id)
        if current is None:
            return None
        expected = request.expectedRevision
        if has_edit:
            comment_permissions.authorize(CommentAction.EDIT, actor, target=_authored(current))
        if status is not None:
            comment_permissions.authorize(CommentAction.RESOLVE, actor)
        updated = current
        if has_edit:
            updated = comments_store.edit_comment(
                project.id, project.path, comment_id, _editor(actor), expected_revision=expected, **edits,
            )
            expected = updated["revision"] if updated else None
        if status is not None and updated is not None:
            updated = comments_store.update_comment_status(
                project.id, project.path, comment_id, status, editor=_editor(actor), expected_revision=expected,
            )
        return _with_permissions(updated, actor) if updated else None

    updated_comment = await _run_mutation(write)
    if isinstance(updated_comment, JSONResponse):
        return updated_comment
    if not updated_comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    return updated_comment


@router.post("/{project_id}/comments/{comment_id}/replies", dependencies=[Depends(require_comment_writer)])
async def add_reply(
    project_id: str,
    comment_id: str,
    request: CreateReplyRequest,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Add a reply to an existing comment.
    """
    content = _normalize_content(request.content)

    def write():
        project = get_project_for_role_or_404(project_id, user.role)
        actor = _actor(user)
        comment_permissions.authorize(CommentAction.REPLY, actor)
        result = comments_store.add_reply(
            project_id=project.id,
            project_path=project.path,
            comment_id=comment_id,
            content=content,
            author=actor.display_name,
            author_user_id=actor.actor_id,
            author_kind=actor.actor_kind,
        )
        if not result:
            return None
        comment, reply = result
        reply["permissions"] = comment_permissions.capabilities(actor, _authored(reply))
        return {"comment": _with_permissions(comment, actor), "reply": reply}

    result = await _run_mutation(write)
    if isinstance(result, JSONResponse):
        return result
    if not result:
        raise HTTPException(status_code=404, detail="Comment not found")
    return result


@router.delete("/{project_id}/comments/{comment_id}", dependencies=[Depends(require_comment_writer)])
async def delete_comment(
    project_id: str,
    comment_id: str,
    expectedRevision: Optional[int] = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """Tombstone a root (owner or admin). History and replies are retained."""

    def write():
        project = get_project_for_role_or_404(project_id, user.role)
        actor = _actor(user)
        current = comments_store.get_comment(project.id, project.path, comment_id)
        if current is None:
            return False
        comment_permissions.authorize(CommentAction.DELETE, actor, target=_authored(current))
        return comments_store.delete_comment(
            project_id=project.id,
            project_path=project.path,
            comment_id=comment_id,
            editor=_editor(actor),
            expected_revision=expectedRevision,
        )

    deleted = await _run_mutation(write)
    if isinstance(deleted, JSONResponse):
        return deleted
    if not deleted:
        raise HTTPException(status_code=404, detail="Comment not found")

    return {"deleted": comment_id}


# ============================================================
# EXPORT ENDPOINT
# ============================================================

@router.post("/{project_id}/comments/push", dependencies=[Depends(require_designer)])
async def push_comments(project_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    """
    Export DB snapshot to comments.json artifact only.
    Git commit/push is intentionally left to the user workflow.
    """
    def export() -> str:
        project = get_project_for_role_or_404(project_id, user.role)
        comments_path = comments_store.export_comments_json(project.id, project.path)
        return os.path.relpath(comments_path, project.path)

    try:
        comments_rel_path = await asyncio.to_thread(export)

        return {
            "success": True,
            "message": "Generated comments artifact from DB snapshot.",
            "comments_path": comments_rel_path,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
