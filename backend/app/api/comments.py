"""
Comments API for KiCAD-Prism Collaboration Feature.

Comment CRUD is backed by the PostgreSQL ``comments`` schema. Visualizer markers
are published via ecad-viewer overlay scenes (never written into KiCad sources).
"""

import asyncio
import math
import os
import re
from typing import Callable, List, Optional, TypeVar

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, model_validator

from app.api._helpers import get_project_for_role_or_404
from app.core.security import AuthenticatedUser, require_comment_writer, require_designer, require_viewer
from app.core.roles import normalize_role
from app.services import access_service, comment_permissions
from app.services.comment_anchor_service import (
    AnchorValidationError,
    resolve_canvas_anchor,
    resolve_comparison_anchor,
    resolve_manual_pin,
    resolve_displayed_bindings,
)
from app.services.comment_permissions import ActorIdentity, AuthoredObject, CommentAction, CommentPermissionError
from app.services.comments_revisions import Editor, RevisionConflict
from app.services.comments_store_service import (
    COMMENT_CLASSES,
    COMMENT_SEVERITIES,
    DEFAULT_COMMENT_CLASS,
    DEFAULT_COMMENT_SEVERITY,
    comments_store,
)
from app.services.trackers.projections import can_retry_projection
from app.services.trackers.promotion import PromotionActor
from app.services.trackers.publication_policy import PublicationDenied

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


class CreateDisplayedRevision(BaseModel):
    commit: Optional[str] = None
    worktree: bool = False
    sourceRevisionKey: Optional[str] = None


class CreateCommentRequest(BaseModel):
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
    revision: Optional[CreateDisplayedRevision] = None


class CreateReplyRequest(BaseModel):
    content: str


class UpdateReplyRequest(BaseModel):
    content: str
    expectedRevision: Optional[int] = None


class UpdateCommentRequest(BaseModel):
    status: Optional[str] = None  # "OPEN" or "RESOLVED"
    content: Optional[str] = None
    severity: Optional[str] = None
    commentClass: Optional[str] = None
    mentions: Optional[List[str]] = None
    expectedRevision: Optional[int] = None

    @model_validator(mode="before")
    @classmethod
    def reject_immutable_anchor_fields(cls, data):
        if isinstance(data, dict) and any(key in data for key in ("location", "revision", "anchor")):
            raise ValueError("anchor fields are immutable")
        return data


class PinCommentRequest(BaseModel):
    commit: str
    expectedRevision: Optional[int] = None


class ReattachCommentRequest(BaseModel):
    commit: str
    location: CommentLocation
    elementId: Optional[str] = None
    relativePoint: Optional[List[float]] = None
    expectedRevision: int = Field(ge=1)


class CommentAnchor(BaseModel):
    state: str = "unpinned"
    source: Optional[str] = None
    commit: Optional[str] = None
    sourceRevisionKey: Optional[str] = None
    baseCommit: Optional[str] = None
    compareCommit: Optional[str] = None
    selectedSide: Optional[str] = None
    projectFile: Optional[str] = None


class CommentPermissions(BaseModel):
    canReply: bool = True
    canEdit: bool = False
    canDelete: bool = False
    canResolve: bool = False
    canPublish: bool = False


class CommentReply(BaseModel):
    id: Optional[str] = None
    author: str
    authorUserId: Optional[str] = None
    authorKind: str = "legacy"
    timestamp: str
    updatedAt: Optional[str] = None
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
    updatedAt: Optional[str] = None
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
    # Reserved for future forge Issues sync (null/omitted until enabled).
    forgeProvider: Optional[str] = None
    forgeIssueId: Optional[str] = None
    forgeIssueUrl: Optional[str] = None
    forgeSyncState: Optional[str] = None
    anchor: CommentAnchor = Field(default_factory=CommentAnchor)
    permissions: Optional[CommentPermissions] = None


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
    selectedSide: Optional[str] = None


def _actor(user: AuthenticatedUser) -> ActorIdentity:
    return comment_permissions.resolve_actor(user)


def _read_actor(user: AuthenticatedUser) -> Optional[ActorIdentity]:
    try:
        return _actor(user)
    except CommentPermissionError:
        return None


def _editor(actor: ActorIdentity) -> Editor:
    return Editor(user_id=actor.actor_id, kind=actor.actor_kind, display=actor.display_name)


def _promotion_actor(actor: ActorIdentity) -> PromotionActor:
    """The actor whose role decides whether a linked thread's change reaches the forge."""
    return PromotionActor(user_id=actor.actor_id, role=actor.role, kind=actor.actor_kind)


def _authored(value: dict) -> AuthoredObject:
    return AuthoredObject(
        author_user_id=value.get("authorUserId"),
        author_kind=str(value.get("authorKind") or comment_permissions.ACTOR_KIND_LEGACY),
    )


def _with_permissions(comment: dict, actor: ActorIdentity) -> dict:
    tracker = comment.get("tracker") or {}
    promote_role = normalize_role(tracker.get("promoteMinRole")) or "designer"
    linked = bool(tracker.get("linkState"))
    capabilities = comment_permissions.capabilities(
        actor, _authored(comment), linked=linked, promote_min_role=promote_role,
    )
    capabilities["canPublish"] = (
        bool(tracker.get("promoteMinRole"))
        and not linked
        and (comment.get("anchor") or {}).get("state") == "pinned"
        and comment_permissions.allowed(
            CommentAction.PROMOTE, actor, promote_min_role=promote_role,
        )
    )
    capabilities["canRetry"] = can_retry_projection(tracker) and comment_permissions.allowed(
        CommentAction.RETRY, actor, linked=linked, promote_min_role=promote_role,
    )
    comment["permissions"] = capabilities
    can_share = linked and comment_permissions.allowed(
        CommentAction.SHARE, actor, promote_min_role=promote_role,
    )
    for reply in comment.get("replies", []):
        reply_caps = comment_permissions.capabilities(actor, _authored(reply))
        reply_caps["canPublish"] = False
        reply_caps["canShare"] = can_share and (reply.get("sync") or {}).get("state") == "unsynced_local"
        reply["permissions"] = reply_caps
    return comment


def _permission_response(exc: CommentPermissionError) -> JSONResponse:
    body = {"detail": exc.detail, "code": exc.code}
    if exc.required_role:
        body["requiredRole"] = exc.required_role
    return JSONResponse(status_code=exc.status_code, content=body)


def _conflict_response(exc: RevisionConflict) -> JSONResponse:
    return JSONResponse(
        status_code=409,
        content={"detail": "Comment changed since the revision you edited", "code": "revision_conflict",
                 "currentRevision": exc.current_revision},
    )


async def _run_mutation(write: Callable[[], T]):
    try:
        return await asyncio.to_thread(write)
    except CommentPermissionError as exc:
        return _permission_response(exc)
    except PublicationDenied as exc:
        # A ValueError subclass: map it before the generic ValueError branch.
        body = {"detail": str(exc), "code": exc.code}
        if exc.required_role:
            body["requiredRole"] = exc.required_role
        return JSONResponse(status_code=403, content=body)
    except RevisionConflict as exc:
        return _conflict_response(exc)
    except AnchorValidationError as exc:
        return JSONResponse(status_code=422, content={"detail": exc.detail, "code": exc.code})
    except ValueError as exc:
        if "immutable" in str(exc).lower():
            return JSONResponse(status_code=422, content={"detail": str(exc), "code": "anchor_immutable"})
        raise


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
async def get_comments(
    project_id: str,
    user: AuthenticatedUser = Depends(require_viewer),
    revision: Optional[str] = None,
):
    """
    Get all comments for a project from DB snapshot.
    """
    def read():
        project = get_project_for_role_or_404(project_id, user.role)
        listing = comments_store.get_comments_file(project.id, project.path)
        if revision:
            displayed = _normalize_commit(revision, "revision")
            bindings = comments_store.get_anchor_bindings(
                project.id, [comment["id"] for comment in listing["comments"]],
            )
            listing["comments"] = resolve_displayed_bindings(
                project, listing["comments"], displayed, bindings,
            )
        actor = _read_actor(user)
        if actor is not None:
            listing["comments"] = [_with_permissions(comment, actor) for comment in listing["comments"]]
        return listing

    try:
        return await asyncio.to_thread(read)
    except AnchorValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.detail) from exc


@router.get("/{project_id}/comments/{comment_id}/thread")
async def get_comment_thread(
    project_id: str,
    comment_id: str,
    user: AuthenticatedUser = Depends(require_viewer),
    revision: Optional[str] = None,
):
    """One thread, shaped like a listing entry, for applying a live change.

    Returns ``{"comment": null}`` when the thread no longer exists. ``revision``
    resolves a canvas anchor exactly as the listing does.
    """
    def read():
        project = get_project_for_role_or_404(project_id, user.role)
        comment, cursor = comments_store.get_thread(project.id, project.path, comment_id)
        if comment is not None and revision and comment.get("scope") != "comparison":
            displayed = _normalize_commit(revision, "revision")
            bindings = comments_store.get_anchor_bindings(project.id, [comment_id])
            [comment] = resolve_displayed_bindings(project, [comment], displayed, bindings)
        actor = _read_actor(user)
        if comment is not None and actor is not None:
            comment = _with_permissions(comment, actor)
        return {"comment": comment, "cursor": cursor}

    try:
        return await asyncio.to_thread(read)
    except AnchorValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.detail) from exc


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
            listing["comments"] = [_with_permissions(comment, actor) for comment in listing["comments"]]
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

    def write():
        project = get_project_for_role_or_404(project_id, user.role)
        actor = _actor(user)
        comment_permissions.authorize(CommentAction.CREATE, actor)
        anchor = resolve_comparison_anchor(
            project, base_commit=request.baseCommit, compare_commit=request.compareCommit,
            selected_side=request.selectedSide, file_path=request.filePath, context=domain,
        )
        created = comments_store.create_comment(
            project_id=project.id,
            project_path=project.path,
            context=domain,
            location={"x": 0.0, "y": 0.0, "layer": "", "page": request.filePath or ""},
            content=content,
            author=actor.display_name,
            author_user_id=actor.actor_id,
            author_kind=actor.actor_kind,
            promotion_actor=_promotion_actor(actor),
            element_id=request.semanticItemId,
            element_ref=request.semanticItemRef,
            element_type=anchor_kind,
            comment_class=comment_class,
            severity=severity,
            mentions=request.mentions,
            scope="comparison",
            base_commit=anchor.base_commit,
            compare_commit=anchor.compare_commit,
            comparison_domain=domain,
            file_path=anchor.file_path,
            semantic_item_id=request.semanticItemId,
            anchor_kind=anchor_kind,
            anchor_commit=anchor.commit,
            anchor_revision_key=anchor.source_revision_key,
            anchor_source=anchor.source,
            selected_side=anchor.selected_side,
            project_relative_path=anchor.project_relative_path,
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
    metadata = dict(request.metadata or {})
    relative_point = metadata.get("anchorRelativePoint")
    if relative_point is not None and (
        not request.elementId
        or not isinstance(relative_point, list)
        or len(relative_point) != 2
        or any(
            not isinstance(value, (int, float)) or isinstance(value, bool)
            or not math.isfinite(value) or value < 0 or value > 1
            for value in relative_point
        )
    ):
        raise HTTPException(status_code=400, detail="anchorRelativePoint requires an object and two values between 0 and 1")

    def write():
        project = get_project_for_role_or_404(project_id, user.role)
        actor = _actor(user)
        comment_permissions.authorize(CommentAction.CREATE, actor)
        anchor = resolve_canvas_anchor(
            project, revision=request.revision.model_dump() if request.revision else None,
            context=context,
        )
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
            metadata=metadata,
            file_path=anchor.file_path,
            anchor_commit=anchor.commit,
            anchor_revision_key=anchor.source_revision_key,
            anchor_source=anchor.source,
            project_relative_path=anchor.project_relative_path,
            promotion_actor=_promotion_actor(actor),
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
    """Edit content or status using optimistic comment revisions."""
    has_edit = any(value is not None for value in (
        request.content, request.severity, request.commentClass, request.mentions,
    ))
    if request.status is None and not has_edit:
        raise HTTPException(status_code=400, detail="No update fields provided")

    status = request.status.upper() if request.status is not None else None
    if status is not None and status not in {"OPEN", "RESOLVED"}:
        raise HTTPException(status_code=400, detail="Status must be 'OPEN' or 'RESOLVED'")
    content = _normalize_content(request.content) if request.content is not None else None
    severity = _normalize_severity(request.severity) if request.severity is not None else None
    comment_class = _normalize_comment_class(request.commentClass) if request.commentClass is not None else None

    def write():
        project = get_project_for_role_or_404(project_id, user.role)
        actor = _actor(user)
        current = comments_store.get_comment(project.id, project.path, comment_id)
        if current is None:
            return None
        if has_edit:
            comment_permissions.authorize(CommentAction.EDIT, actor, target=_authored(current))
        if status is not None:
            comment_permissions.authorize(CommentAction.RESOLVE, actor)
        updated = comments_store.patch_comment(
            project.id, project.path, comment_id, _editor(actor),
            expected_revision=request.expectedRevision, content=content, severity=severity,
            comment_class=comment_class, mentions=request.mentions, status=status,
            promotion_actor=_promotion_actor(actor),
        )
        return _with_permissions(updated, actor) if updated else None

    updated_comment = await _run_mutation(write)
    if isinstance(updated_comment, JSONResponse):
        return updated_comment

    if not updated_comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    return updated_comment


@router.post("/{project_id}/comments/{comment_id}/pin", dependencies=[Depends(require_comment_writer)])
async def pin_comment(
    project_id: str,
    comment_id: str,
    request: PinCommentRequest,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """An admin may pin a legacy or worktree comment once, to an exact commit."""
    def write():
        project = get_project_for_role_or_404(project_id, user.role)
        actor = _actor(user)
        if not actor.is_admin:
            raise CommentPermissionError("legacy_admin_only", "Only an admin can pin a comment")
        current = comments_store.get_comment(project.id, project.path, comment_id)
        if current is None:
            return None
        anchor = resolve_manual_pin(project, commit=request.commit, context=current["context"])
        updated = comments_store.pin_comment_anchor(
            project.id, project.path, comment_id, _editor(actor), commit=anchor.commit or request.commit,
            source_revision_key=anchor.source_revision_key, file_path=anchor.file_path,
            project_relative_path=anchor.project_relative_path, expected_revision=request.expectedRevision,
        )
        return _with_permissions(updated, actor) if updated else None

    result = await _run_mutation(write)
    if isinstance(result, JSONResponse):
        return result
    if result is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    return result


@router.post("/{project_id}/comments/{comment_id}/reattach", dependencies=[Depends(require_comment_writer)])
async def reattach_comment(
    project_id: str,
    comment_id: str,
    request: ReattachCommentRequest,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """Append a binding for this commit's descendants; preserve the origin."""
    location = request.location.model_dump()
    if not all(math.isfinite(float(location[key])) for key in ("x", "y")):
        raise HTTPException(status_code=400, detail="Comment location must be finite")
    location["bounds"] = _normalize_bounds(location.get("bounds"))
    relative_point = request.relativePoint
    if relative_point is not None and (
        len(relative_point) != 2
        or any(not math.isfinite(value) or value < 0 or value > 1 for value in relative_point)
        or not request.elementId
    ):
        raise HTTPException(status_code=400, detail="relativePoint requires an object and two values between 0 and 1")

    def write():
        project = get_project_for_role_or_404(project_id, user.role)
        actor = _actor(user)
        current = comments_store.get_comment(project.id, project.path, comment_id)
        if current is None or current.get("scope") != "canvas":
            return None
        comment_permissions.authorize(CommentAction.EDIT, actor, target=_authored(current))
        anchor = resolve_canvas_anchor(
            project, revision={"commit": request.commit}, context=current["context"],
        )
        updated = comments_store.reattach_comment(
            project.id, project.path, comment_id,
            commit=anchor.commit or request.commit, location=location,
            element_id=request.elementId, relative_point=relative_point, file_path=anchor.file_path,
            editor=_editor(actor), expected_revision=request.expectedRevision,
        )
        return _with_permissions(updated, actor) if updated else None

    result = await _run_mutation(write)
    if isinstance(result, JSONResponse):
        return result
    if result is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    return result


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
            promotion_actor=_promotion_actor(actor),
        )
        if result is None:
            return None
        comment, reply = result
        comment = _with_permissions(comment, actor)
        reply_caps = comment_permissions.capabilities(actor, _authored(reply))
        reply_caps["canPublish"] = False
        reply["permissions"] = reply_caps
        return {"comment": comment, "reply": reply}

    result = await _run_mutation(write)
    if isinstance(result, JSONResponse):
        return result

    if not result:
        raise HTTPException(status_code=404, detail="Comment not found")

    return result


@router.patch("/{project_id}/comments/{comment_id}/replies/{reply_id}", dependencies=[Depends(require_comment_writer)])
async def update_reply(
    project_id: str,
    comment_id: str,
    reply_id: str,
    request: UpdateReplyRequest,
    user: AuthenticatedUser = Depends(require_viewer),
):
    content = _normalize_content(request.content)

    def write():
        project = get_project_for_role_or_404(project_id, user.role)
        actor = _actor(user)
        current = comments_store.get_reply(project.id, comment_id, reply_id)
        if current is None:
            return None
        comment_permissions.authorize(CommentAction.EDIT, actor, target=_authored(current))
        updated = comments_store.edit_reply(
            project.id, project.path, comment_id, reply_id, content, _editor(actor),
            expected_revision=request.expectedRevision, promotion_actor=_promotion_actor(actor),
        )
        return _with_permissions(updated, actor) if updated else None

    result = await _run_mutation(write)
    if isinstance(result, JSONResponse):
        return result
    if result is None:
        raise HTTPException(status_code=404, detail="Reply not found")
    return result


@router.delete("/{project_id}/comments/{comment_id}/replies/{reply_id}", dependencies=[Depends(require_comment_writer)])
async def delete_reply(
    project_id: str,
    comment_id: str,
    reply_id: str,
    expectedRevision: Optional[int] = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    def write():
        project = get_project_for_role_or_404(project_id, user.role)
        actor = _actor(user)
        current = comments_store.get_reply(project.id, comment_id, reply_id)
        if current is None:
            return None
        comment_permissions.authorize(CommentAction.DELETE, actor, target=_authored(current))
        updated = comments_store.delete_reply(
            project.id, project.path, comment_id, reply_id, _editor(actor),
            expected_revision=expectedRevision, promotion_actor=_promotion_actor(actor),
        )
        return _with_permissions(updated, actor) if updated else None

    result = await _run_mutation(write)
    if isinstance(result, JSONResponse):
        return result
    if result is None:
        raise HTTPException(status_code=404, detail="Reply not found")
    return result


@router.delete("/{project_id}/comments/{comment_id}", dependencies=[Depends(require_comment_writer)])
async def delete_comment(
    project_id: str,
    comment_id: str,
    expectedRevision: Optional[int] = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Delete a comment.
    """
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
            promotion_actor=_promotion_actor(actor),
        )

    deleted = await _run_mutation(write)
    if isinstance(deleted, JSONResponse):
        return deleted

    if not deleted:
        raise HTTPException(status_code=404, detail="Comment not found")

    return {"deleted": comment_id}


@router.get("/{project_id}/comments/{comment_id}/history")
async def get_comment_history(
    project_id: str,
    comment_id: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    def read():
        project = get_project_for_role_or_404(project_id, user.role)
        return comments_store.get_history(project.id, "root", comment_id)

    return await asyncio.to_thread(read)


@router.get("/{project_id}/comments/{comment_id}/replies/{reply_id}/history")
async def get_reply_history(
    project_id: str,
    comment_id: str,
    reply_id: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    def read():
        project = get_project_for_role_or_404(project_id, user.role)
        return comments_store.get_history(project.id, "reply", reply_id)

    return await asyncio.to_thread(read)


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
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to export comments") from exc
