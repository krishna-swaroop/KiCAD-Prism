"""Admin tracker connector HTTP API (TR-19)."""

from __future__ import annotations

import asyncio
from typing import Any, Callable, Optional, TypeVar

from fastapi import APIRouter, Depends, FastAPI, HTTPException
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app.core.security import AuthenticatedUser, require_admin
from app.services.trackers.connector_service import (
    ConnectorNotFound,
    ConnectorService,
)
from app.services.trackers.errors import ProviderError
from app.services.trackers.secrets import SecretStoreLocked

_CONNECTOR_PREFIX = "/api/admin/trackers/connectors"

router = APIRouter(
    prefix=_CONNECTOR_PREFIX,
    tags=["tracker-connectors"],
    dependencies=[Depends(require_admin)],
)
service = ConnectorService()

T = TypeVar("T")


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


def _strip_validation_input(errors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop request ``input`` from 422 bodies so pasted PEM is not echoed."""

    return [{key: value for key, value in item.items() if key != "input"} for item in errors]


async def _validation_exception_handler(request, exc: RequestValidationError) -> JSONResponse:
    if not request.url.path.startswith(_CONNECTOR_PREFIX):
        return await request_validation_exception_handler(request, exc)
    return JSONResponse(status_code=422, content={"detail": _strip_validation_input(exc.errors())})


def register_validation_redaction(app: FastAPI) -> None:
    """Strip request bodies from connector validation errors without touching other routes."""

    app.add_exception_handler(RequestValidationError, _validation_exception_handler)


async def _run_service(call: Callable[[], T]) -> T:
    try:
        return await asyncio.to_thread(call)
    except Exception as exc:
        raise _http_error(exc) from exc


@router.get("")
async def list_connectors(_admin: AuthenticatedUser = Depends(require_admin)) -> list[dict[str, Any]]:
    return await _run_service(service.list_connectors)


@router.post("")
async def create_connector(
    body: CreateConnectorRequest,
    admin: AuthenticatedUser = Depends(require_admin),
) -> dict[str, Any]:
    return await _run_service(
        lambda: service.create(
            actor_user_id=_actor(admin),
            provider=body.provider,
            instance_kind=body.instanceKind,
            display_name=body.displayName,
            base_url=body.baseUrl,
            credentials=body.credentials.model_dump() if body.credentials else None,
            connector_id=body.id,
        )
    )


@router.get("/{connector_id}/health")
async def connector_health(
    connector_id: str,
    _admin: AuthenticatedUser = Depends(require_admin),
) -> dict[str, Any]:
    return await _run_service(lambda: service.health(connector_id))


@router.get("/{connector_id}")
async def get_connector(
    connector_id: str,
    _admin: AuthenticatedUser = Depends(require_admin),
) -> dict[str, Any]:
    return await _run_service(lambda: service.get(connector_id))


@router.patch("/{connector_id}")
async def update_connector(
    connector_id: str,
    body: UpdateConnectorRequest,
    admin: AuthenticatedUser = Depends(require_admin),
) -> dict[str, Any]:
    return await _run_service(
        lambda: service.update(
            connector_id,
            actor_user_id=_actor(admin),
            display_name=body.displayName,
            base_url=body.baseUrl,
            instance_kind=body.instanceKind,
            credentials=body.credentials.model_dump() if body.credentials else None,
        )
    )


@router.post("/{connector_id}/pause")
async def pause_connector(
    connector_id: str,
    admin: AuthenticatedUser = Depends(require_admin),
) -> dict[str, Any]:
    return await _run_service(lambda: service.pause(connector_id, actor_user_id=_actor(admin)))


@router.post("/{connector_id}/resume")
async def resume_connector(
    connector_id: str,
    admin: AuthenticatedUser = Depends(require_admin),
) -> dict[str, Any]:
    return await _run_service(lambda: service.resume(connector_id, actor_user_id=_actor(admin)))


@router.post("/{connector_id}/revoke")
async def revoke_connector(
    connector_id: str,
    admin: AuthenticatedUser = Depends(require_admin),
) -> dict[str, Any]:
    return await _run_service(lambda: service.revoke(connector_id, actor_user_id=_actor(admin)))


@router.post("/{connector_id}/test")
async def test_connector(
    connector_id: str,
    admin: AuthenticatedUser = Depends(require_admin),
) -> dict[str, Any]:
    return await _run_service(
        lambda: service.test_connection(connector_id, actor_user_id=_actor(admin))
    )
