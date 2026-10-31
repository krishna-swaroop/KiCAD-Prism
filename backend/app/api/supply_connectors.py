"""Distributor connector HTTP API.

Readers (admin, designer, qa) see providers and connector state. Only admins
change anything. Credentials go in and never come out: responses say which are
set. Request bodies are stripped from validation errors so a pasted key is not
echoed back.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app.api.supply_call import run_supply as _run
from app.api.supply_connectors_models import SupplyConnector, SupplyConnectorCheck, SupplyCsvResult, SupplyProvider
from app.api.supply_models import Items
from app.core.config import settings
from app.core.errors import BadRequest
from app.core.security import AuthenticatedUser, require_admin, require_supply_reader
from app.services.supply import connector_check, oauth
from app.services.supply.connectors import ConnectorService
from app.services.supply.csv_format import MAX_BYTES, TEMPLATE
from app.services.supply.csv_import_service import CsvImportService, CsvRejected
from app.services.supply.providers import registry

_PREFIX = "/api/supply"

router = APIRouter(prefix=_PREFIX, tags=["supply"])
service = ConnectorService()


class CreateSupplyConnectorInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: str = Field(min_length=1, max_length=64)
    storefront: str = Field(default="", max_length=64)
    display_name: str = Field(default="", max_length=120)
    currency: str = Field(default="", max_length=3)
    credentials: dict[str, str] = Field(default_factory=dict)
    daily_budget: Optional[int] = None
    interactive_reserve_pct: int = 10


class UpdateSupplyConnectorInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: Optional[str] = Field(default=None, max_length=120)
    storefront: Optional[str] = Field(default=None, max_length=64)
    currency: Optional[str] = Field(default=None, max_length=3)
    enabled: Optional[bool] = None
    daily_budget: Optional[int] = None
    interactive_reserve_pct: Optional[int] = None
    # Days raw samples are kept before they are rolled up. Null puts it back to the default.
    retention_days: Optional[int] = None
    # Days any history is kept, daily rows included. Null keeps it for good.
    keep_days: Optional[int] = None
    # The administrator holds the distributor's written leave to keep prices and stock of parts not in use.
    keep_unused: Optional[bool] = None
    # Read the provider's published catalogue in place of an uploaded offers file.
    catalogue: Optional[bool] = None
    # When the provider's day begins (HH:MM) and in which time zone; its budget resets then.
    reset_time: Optional[str] = Field(default=None, max_length=5)
    reset_tz: Optional[str] = Field(default=None, max_length=64)
    # The reset time was taken from what the provider reported, so its own count of calls is trusted.
    reset_from_provider: Optional[bool] = None


class CredentialsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    credentials: dict[str, str]


class PauseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str = Field(min_length=1, max_length=200)


def _actor(user: AuthenticatedUser) -> str:
    return user.email


def _provider_dto(spec) -> dict[str, Any]:
    return {
        "key": spec.key,
        "label": spec.label,
        "capabilities": sorted(spec.capabilities),
        "max_batch": spec.max_batch,
        "stock_pooling": spec.stock_pooling,
        "credential_fields": [
            {"name": item.name, "label": item.label, "secret": item.secret}
            for item in spec.credential_fields
        ],
        "storefronts": list(spec.storefronts),
        "default_daily_budget": spec.default_daily_budget,
        "metered": spec.metered,
        "csv_fed": spec.csv_fed,
    }


# `input` is what the caller sent. `ctx` can hold the exception a validator raised,
# which is not JSON, and fragments of the input.
_UNSAFE_ERROR_KEYS = frozenset({"input", "ctx"})


def _strip_validation_input(errors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{key: value for key, value in item.items() if key not in _UNSAFE_ERROR_KEYS} for item in errors]


def register_validation_redaction(app: FastAPI) -> None:
    """Strip request bodies from 422 errors under ``/api/supply``.

    Wraps the handler already installed (the tracker one), so call this after
    it. Other routes keep their existing behavior.
    """

    previous = app.exception_handlers.get(RequestValidationError, request_validation_exception_handler)

    async def handler(request, exc: RequestValidationError) -> JSONResponse:
        if not request.url.path.startswith(_PREFIX):
            return await previous(request, exc)
        return JSONResponse(status_code=422, content={"detail": _strip_validation_input(exc.errors())})

    app.add_exception_handler(RequestValidationError, handler)


@router.get("/providers", response_model=Items[SupplyProvider])
async def list_providers(_user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    include_dev = bool(settings.SUPPLY_ENABLE_SIMULATED_PROVIDER)
    return {"items": [_provider_dto(spec) for spec in registry.list_specs(include_dev=include_dev)]}


@router.get("/connectors", response_model=Items[SupplyConnector], response_model_exclude_unset=True)
async def list_supply_connectors(user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    """Every connector. An administrator also sees, on a connector whose change notices need a person's sign-in, that sign-in
    (who, until when, and the callback address the distributor's app must list)."""

    def read() -> list[dict[str, Any]]:
        items = service.list()
        if user.role != "admin":
            return items
        with service.store.connection() as conn:
            return [
                item | {"signin": oauth.status(conn, item["id"]) | {"redirect_uri": oauth.redirect_uri()}} if item["provider"] in oauth.SUPPORTED else item
                for item in items
            ]

    return {"items": await _run(read)}


@router.post("/connectors", status_code=201, response_model=SupplyConnector, response_model_exclude_unset=True)
async def create_supply_connector(
    body: CreateSupplyConnectorInput, admin: AuthenticatedUser = Depends(require_admin)
) -> dict[str, Any]:
    return await _run(lambda: service.create(actor=_actor(admin), **body.model_dump()))


@router.patch("/connectors/{connector_id}", response_model=SupplyConnector, response_model_exclude_unset=True)
async def update_supply_connector(
    connector_id: str, body: UpdateSupplyConnectorInput, admin: AuthenticatedUser = Depends(require_admin)
) -> dict[str, Any]:
    changes = body.model_dump(exclude_unset=True)
    return await _run(lambda: service.update(connector_id, actor=_actor(admin), **changes))


@router.put("/connectors/{connector_id}/credentials", response_model=SupplyConnector, response_model_exclude_unset=True)
async def set_connector_credentials(
    connector_id: str, body: CredentialsRequest, admin: AuthenticatedUser = Depends(require_admin)
) -> dict[str, Any]:
    return await _run(
        lambda: service.set_credentials(connector_id, actor=_actor(admin), credentials=body.credentials)
    )


@router.post("/connectors/{connector_id}/pause", response_model=SupplyConnector, response_model_exclude_unset=True)
async def pause_supply_connector(
    connector_id: str, body: PauseRequest, admin: AuthenticatedUser = Depends(require_admin)
) -> dict[str, Any]:
    return await _run(lambda: service.pause(connector_id, actor=_actor(admin), reason=body.reason))


@router.post("/connectors/{connector_id}/test", response_model=SupplyConnectorCheck)
async def test_connector_connection(
    connector_id: str, admin: AuthenticatedUser = Depends(require_admin)
) -> dict[str, Any]:
    """One real call to the provider. Always answers 200 with ``ok``, so a failure carries its reason."""

    return await _run(lambda: connector_check.check_connector(service, connector_id, _actor(admin)))




@router.post("/connectors/{connector_id}/resume", response_model=SupplyConnector, response_model_exclude_unset=True)
async def resume_supply_connector(
    connector_id: str, admin: AuthenticatedUser = Depends(require_admin)
) -> dict[str, Any]:
    return await _run(lambda: service.resume(connector_id, actor=_actor(admin)))


@router.delete("/connectors/{connector_id}", status_code=204)
async def delete_supply_connector(
    connector_id: str, admin: AuthenticatedUser = Depends(require_admin)
) -> Response:
    await _run(lambda: service.delete(connector_id, actor=_actor(admin)))
    return Response(status_code=204)


def _csv_service() -> CsvImportService:
    # Built per request so it follows `service`, including a replaced one in tests.
    return CsvImportService(service, store=service.store)


def _rejection(exc: CsvRejected) -> BadRequest:
    parsed = exc.parsed
    return BadRequest(
        f"The file was not imported. {parsed.error_count} problem(s) found.",
        code="csv_rejected",
        error_count=parsed.error_count,
        errors=[{"line": e.line, "column": e.column, "message": e.message} for e in parsed.errors],
        ignored_columns=list(parsed.ignored_columns),
    )


@router.get(
    "/csv-template",
    response_class=Response,
    responses={200: {"description": "The CSV template for an offers upload.", "content": {"text/csv": {}}}},
)
async def csv_template(_user: AuthenticatedUser = Depends(require_supply_reader)) -> Response:
    return Response(
        TEMPLATE,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="supply-offers-template.csv"'},
    )


@router.post("/connectors/{connector_id}/csv", response_model=SupplyCsvResult)
async def upload_offers_csv(
    connector_id: str,
    request: Request,
    filename: str = Query(default="", max_length=200),
    admin: AuthenticatedUser = Depends(require_admin),
) -> dict[str, Any]:
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="The file is too large")
    content = await request.body()
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="The file is too large")

    def load() -> dict[str, Any]:
        info, parsed = _csv_service().import_file(connector_id, content, actor=_actor(admin), filename=filename)
        return {**info.to_dto(), "ignored_columns": list(parsed.ignored_columns)}

    try:
        return await _run(load)
    except CsvRejected as exc:
        raise _rejection(exc) from exc


@router.delete("/connectors/{connector_id}/csv", status_code=204)
async def clear_offers_csv(connector_id: str, admin: AuthenticatedUser = Depends(require_admin)) -> Response:
    await _run(lambda: _csv_service().clear(connector_id, actor=_actor(admin)))
    return Response(status_code=204)
