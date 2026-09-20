"""Admin tracker connector HTTP API (TR-19)."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.core.security import AuthenticatedUser, require_admin
from app.services.trackers.connector_service import (
    ConnectorNotFound,
    ConnectorService,
)
from app.services.trackers.errors import ProviderError
from app.services.trackers.secrets import SecretStoreLocked

router = APIRouter(
    prefix="/api/admin/trackers/connectors",
    tags=["tracker-connectors"],
    dependencies=[Depends(require_admin)],
)
service = ConnectorService()


class ConnectorCredentials(BaseModel):
    model_config = ConfigDict(extra="forbid")

    appId: str = ""
    installationId: str = ""
    privateKey: str = ""


class CreateConnectorRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Optional[str] = None
    provider: str = "github"
    instanceKind: str = "github.com"
    displayName: str = ""
    baseUrl: str = ""
    credentials: Optional[ConnectorCredentials] = None


class UpdateConnectorRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    displayName: Optional[str] = None
    baseUrl: Optional[str] = None
    instanceKind: Optional[str] = None
    credentials: Optional[ConnectorCredentials] = None


def _actor(user: AuthenticatedUser) -> str:
    return user.user_id or user.email


def _http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, ConnectorNotFound):
        return HTTPException(status_code=404, detail="Connector not found")
    if isinstance(exc, SecretStoreLocked):
        return HTTPException(status_code=503, detail="Tracker credential encryption is locked")
    if isinstance(exc, ProviderError):
        status = 403 if exc.class_ in {"forbidden", "auth_lost", "capability_missing"} else 400
        if exc.class_ == "auth_lost":
            status = 409
        return HTTPException(
            status_code=status,
            detail={"class": exc.class_, "message": exc.message, "retryable": exc.retryable},
        )
    raise exc


@router.get("/")
async def list_connectors(_admin: AuthenticatedUser = Depends(require_admin)) -> list[dict[str, Any]]:
    return service.list_connectors()


@router.post("/")
async def create_connector(
    body: CreateConnectorRequest,
    admin: AuthenticatedUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        return service.create(
            actor_user_id=_actor(admin),
            provider=body.provider,
            instance_kind=body.instanceKind,
            display_name=body.displayName,
            base_url=body.baseUrl,
            credentials=body.credentials.model_dump() if body.credentials else None,
            connector_id=body.id,
        )
    except Exception as exc:
        raise _http_error(exc) from exc


@router.get("/{connector_id}/health")
async def connector_health(
    connector_id: str,
    _admin: AuthenticatedUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        return service.health(connector_id)
    except Exception as exc:
        raise _http_error(exc) from exc


@router.get("/{connector_id}")
async def get_connector(
    connector_id: str,
    _admin: AuthenticatedUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        return service.get(connector_id)
    except Exception as exc:
        raise _http_error(exc) from exc


@router.patch("/{connector_id}")
async def update_connector(
    connector_id: str,
    body: UpdateConnectorRequest,
    admin: AuthenticatedUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        return service.update(
            connector_id,
            actor_user_id=_actor(admin),
            display_name=body.displayName,
            base_url=body.baseUrl,
            instance_kind=body.instanceKind,
            credentials=body.credentials.model_dump() if body.credentials else None,
        )
    except Exception as exc:
        raise _http_error(exc) from exc


@router.post("/{connector_id}/pause")
async def pause_connector(
    connector_id: str,
    admin: AuthenticatedUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        return service.pause(connector_id, actor_user_id=_actor(admin))
    except Exception as exc:
        raise _http_error(exc) from exc


@router.post("/{connector_id}/resume")
async def resume_connector(
    connector_id: str,
    admin: AuthenticatedUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        return service.resume(connector_id, actor_user_id=_actor(admin))
    except Exception as exc:
        raise _http_error(exc) from exc


@router.post("/{connector_id}/revoke")
async def revoke_connector(
    connector_id: str,
    admin: AuthenticatedUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        return service.revoke(connector_id, actor_user_id=_actor(admin))
    except Exception as exc:
        raise _http_error(exc) from exc


@router.post("/{connector_id}/test")
async def test_connector(
    connector_id: str,
    admin: AuthenticatedUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        return service.test_connection(connector_id, actor_user_id=_actor(admin))
    except Exception as exc:
        raise _http_error(exc) from exc
