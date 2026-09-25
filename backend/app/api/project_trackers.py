"""Project tracker destination and publication settings (TR-23)."""

from __future__ import annotations

import asyncio
from typing import Any, Callable, Optional, TypeVar

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.api._helpers import get_project_for_role_or_404
from app.core.security import AuthenticatedUser, require_admin, require_viewer
from app.services.trackers.publication_policy import (
    DispatchPause,
    ProjectTrackerNotFound,
    PublicationDenied,
    PublicationPolicyService,
)

router = APIRouter(prefix="/api/projects", tags=["project-trackers"])
service = PublicationPolicyService()

T = TypeVar("T")


async def _run_service(call: Callable[[], T]) -> T:
    return await asyncio.to_thread(call)


class DestinationBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    containerKind: str = "repo"
    containerPath: str
    remoteContainerId: str
    generation: Optional[int] = None
    visibility: Optional[str] = None


class LabelsBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    base: str = "prism"
    severityPrefix: str = "severity:"
    classPrefix: str = "class:"
    boardPrefix: str = "board:"


class UpdateProjectTrackerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    connectorId: str
    destination: DestinationBody
    autoMinSeverity: Optional[str] = None
    autoTaskClass: Optional[bool] = None
    promoteMinRole: Optional[str] = None
    labels: Optional[LabelsBody] = None


class AcknowledgeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    visibility: str


def _actor(user: AuthenticatedUser) -> str:
    return user.user_id or user.email


def _http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, ProjectTrackerNotFound):
        return HTTPException(status_code=404, detail="Project tracker settings not found")
    if isinstance(exc, PublicationDenied):
        return HTTPException(
            status_code=403,
            detail={
                "detail": str(exc),
                "code": exc.code,
                "requiredRole": exc.required_role,
            },
        )
    if isinstance(exc, DispatchPause):
        return HTTPException(
            status_code=409,
            detail={"detail": str(exc), "code": "visibility_ack_required", "pausedReason": exc.reason},
        )
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    raise exc


async def _with_project_repo(settings_payload: dict[str, Any], repo_url: str | None) -> dict[str, Any]:
    """Attach the project's own repository path on the connection's host, so the
    destination picker can offer it (TR-46)."""

    connector_id = str(settings_payload.get("connectorId") or "")
    settings_payload["projectRepoPath"] = (
        await _run_service(lambda: service.project_repo_path(repo_url, connector_id)) if connector_id else None
    )
    return settings_payload


@router.get("/{project_id}/tracker")
async def get_project_tracker(
    project_id: str,
    user: AuthenticatedUser = Depends(require_viewer),
) -> dict[str, Any]:
    project = get_project_for_role_or_404(project_id, user.role)
    try:
        payload = await _run_service(lambda: service.get_settings(project_id))
    except ProjectTrackerNotFound:
        payload = await _run_service(
            lambda: service.get_or_default(project_id, repo_url=project.repo_url)
        )
    return await _with_project_repo(payload, project.repo_url)


@router.put("/{project_id}/tracker")
async def update_project_tracker(
    project_id: str,
    body: UpdateProjectTrackerRequest,
    admin: AuthenticatedUser = Depends(require_admin),
) -> dict[str, Any]:
    project = get_project_for_role_or_404(project_id, admin.role)
    try:
        payload = await _run_service(
            lambda: service.update_settings(
                project_id,
                actor_user_id=_actor(admin),
                connector_id=body.connectorId,
                destination=body.destination.model_dump(),
                auto_min_severity=body.autoMinSeverity,
                auto_task_class=body.autoTaskClass,
                promote_min_role=body.promoteMinRole,
                labels=body.labels.model_dump() if body.labels else None,
            )
        )
    except Exception as exc:
        raise _http_error(exc) from exc
    return await _with_project_repo(payload, project.repo_url)


@router.post("/{project_id}/tracker/acknowledge")
async def acknowledge_project_tracker(
    project_id: str,
    body: AcknowledgeRequest,
    admin: AuthenticatedUser = Depends(require_admin),
) -> dict[str, Any]:
    get_project_for_role_or_404(project_id, admin.role)
    try:
        return await _run_service(
            lambda: service.acknowledge(
                project_id,
                actor_user_id=_actor(admin),
                visibility=body.visibility,
            )
        )
    except Exception as exc:
        raise _http_error(exc) from exc
