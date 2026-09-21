"""Project-scoped tracker sync status, history, retry and health (TR-35)."""

from __future__ import annotations

import asyncio
from typing import Any, Callable, TypeVar

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from app.api._helpers import get_project_for_role_or_404
from app.core.security import AuthenticatedUser, require_comment_writer, require_viewer
from app.services import comment_permissions
from app.services.comment_permissions import ActorIdentity, CommentAction, CommentPermissionError
from app.services.comments_store_service import comments_store
from app.services.trackers.health import aggregate_project_health
from app.services.trackers.projections import list_thread_history, load_thread_status, retry_thread_sync
from app.services.trackers.promotion import load_policy_row
from app.services.trackers.publication_policy import DispatchPause, PublicationDenied

router = APIRouter(prefix="/api/projects", tags=["tracker-sync"])

T = TypeVar("T")


async def _run(call: Callable[[], T]) -> T:
    return await asyncio.to_thread(call)


def _actor(user: AuthenticatedUser) -> ActorIdentity:
    return comment_permissions.resolve_actor(user)


def _promote_min_role(project_id: str) -> str:
    with comments_store._connect() as conn:
        conn.execute("SET search_path TO workspace, public")
        row = load_policy_row(conn, project_id)
    if row and row.get("promote_min_role"):
        return str(row["promote_min_role"])
    return "designer"


def _permission_response(exc: CommentPermissionError) -> JSONResponse:
    body = {"detail": exc.detail, "code": exc.code}
    if exc.required_role:
        body["requiredRole"] = exc.required_role
    return JSONResponse(status_code=exc.status_code, content=body)


def _publication_response(exc: PublicationDenied) -> JSONResponse:
    return JSONResponse(
        status_code=403,
        content={
            "detail": str(exc),
            "code": exc.code,
            "requiredRole": exc.required_role,
        },
    )


def _dispatch_response(exc: DispatchPause) -> JSONResponse:
    return JSONResponse(
        status_code=409,
        content={"detail": str(exc), "code": exc.reason, "pausedReason": exc.reason},
    )


def _live_thread_for_comment(conn, project_id: str, comment_id: str) -> dict | None:
    row = conn.execute(
        """
        SELECT t.*
        FROM tracked_threads t
        JOIN comments c ON c.id = t.comment_id
        WHERE c.project_id = %s AND c.id = %s AND c.deleted_at IS NULL AND t.unlinked_at IS NULL
        ORDER BY t.id DESC
        LIMIT 1
        """,
        (project_id, comment_id),
    ).fetchone()
    return dict(row) if row else None


@router.get("/{project_id}/tracker/health")
async def project_tracker_health(
    project_id: str,
    user: AuthenticatedUser = Depends(require_viewer),
) -> dict[str, Any]:
    get_project_for_role_or_404(project_id, user.role)

    def read() -> dict[str, Any]:
        with comments_store._connect() as conn:
            try:
                return aggregate_project_health(conn, project_id)
            except KeyError as exc:
                raise HTTPException(status_code=404, detail="Project tracker settings not found") from exc

    return await _run(read)


@router.get("/{project_id}/comments/{comment_id}/tracker")
async def thread_sync_status(
    project_id: str,
    comment_id: str,
    user: AuthenticatedUser = Depends(require_viewer),
) -> dict[str, Any]:
    get_project_for_role_or_404(project_id, user.role)

    def read() -> dict[str, Any]:
        with comments_store._connect() as conn:
            try:
                return load_thread_status(conn, project_id=project_id, comment_id=comment_id)
            except KeyError as exc:
                raise HTTPException(status_code=404, detail="Comment not found") from exc

    return await _run(read)


@router.get("/{project_id}/comments/{comment_id}/tracker/history")
async def thread_sync_history(
    project_id: str,
    comment_id: str,
    user: AuthenticatedUser = Depends(require_viewer),
) -> dict[str, Any]:
    get_project_for_role_or_404(project_id, user.role)

    def read() -> dict[str, Any]:
        with comments_store._connect() as conn:
            comment = conn.execute(
                "SELECT id FROM comments WHERE project_id = %s AND id = %s AND deleted_at IS NULL",
                (project_id, comment_id),
            ).fetchone()
            if comment is None:
                raise HTTPException(status_code=404, detail="Comment not found")
            thread = _live_thread_for_comment(conn, project_id, comment_id)
            if thread is None:
                return {"commentId": comment_id, "trackedThreadId": None, "operations": []}
            return {
                "commentId": comment_id,
                "trackedThreadId": str(thread["id"]),
                "operations": list_thread_history(conn, str(thread["id"])),
            }

    return await _run(read)


@router.post(
    "/{project_id}/comments/{comment_id}/tracker/retry",
    dependencies=[Depends(require_comment_writer)],
)
async def retry_comment_sync(
    project_id: str,
    comment_id: str,
    user: AuthenticatedUser = Depends(require_viewer),
) -> dict[str, Any]:
    def write() -> dict[str, Any]:
        project = get_project_for_role_or_404(project_id, user.role)
        actor = _actor(user)
        promote_min_role = _promote_min_role(project.id)
        with comments_store._connect() as conn:
            try:
                tracker = retry_thread_sync(
                    conn,
                    project_id=project.id,
                    comment_id=comment_id,
                    actor=actor,
                    promote_min_role=promote_min_role,
                )
            except CommentPermissionError as exc:
                return _permission_response(exc)  # type: ignore[return-value]
            except PublicationDenied as exc:
                return _publication_response(exc)  # type: ignore[return-value]
            except DispatchPause as exc:
                return _dispatch_response(exc)  # type: ignore[return-value]
            except KeyError as exc:
                raise HTTPException(status_code=404, detail="Comment not found") from exc
            return tracker

    result = await _run(write)
    if isinstance(result, JSONResponse):
        return result
    return result
