"""Local inventory sources API: InvenTree-compatible servers, and sources that push their stock, filling the catalog (D15).

Administrators add, change, check, read and remove sources. Everyone who reads supply data sees which parts a source
could not match; QA and administrators link them to a component in Supply > Review.
"""

from __future__ import annotations

from datetime import datetime
from functools import partial
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, ConfigDict, Field

from app.api import supply_connectors
from app.api.supply_call import run_supply
from app.core.security import AuthenticatedUser, require_admin, require_supply_approver, require_supply_reader
from app.services.supply.inventory import sources, sync
from app.services.supply.inventory.inventree import InvenTreeClient

router = APIRouter(prefix="/api/supply/inventory-sources", tags=["supply"])
_run = partial(run_supply, upstream=True)


def _store():
    # Resolved per call so a replaced connector service (tests) brings its own store and keyring.
    return supply_connectors.service.store


def _keyring():
    return supply_connectors.service.keyring()


class InventorySource(BaseModel):
    id: str
    kind: Literal["inventree", "push"]
    display_name: str
    base_url: str
    category_id: Optional[int]
    enabled: bool
    interval_hours: int
    has_token: bool
    server: str
    api_version: Optional[int]
    last_sync_at: Optional[str]
    last_status: str
    last_error: str
    matched: int
    unmatched: int


class CreateSourceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # "push": the source sends its stock itself (``POST /api/supply/inventory-sources/{id}/levels``) and has no server.
    kind: Literal["inventree", "push"] = "inventree"
    display_name: str = Field(min_length=1, max_length=sources.MAX_NAME)
    base_url: str = Field(default="", max_length=500)
    token: str = Field(default="", max_length=500)
    category_id: Optional[int] = None
    interval_hours: int = Field(default=24, ge=1, le=168)


class UpdateSourceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: Optional[str] = Field(default=None, min_length=1, max_length=sources.MAX_NAME)
    base_url: Optional[str] = Field(default=None, min_length=1, max_length=500)
    # An empty string removes the token.
    token: Optional[str] = Field(default=None, max_length=500)
    category_id: Optional[int] = None
    interval_hours: Optional[int] = Field(default=None, ge=1, le=168)
    enabled: Optional[bool] = None


class ServerCategory(BaseModel):
    pk: int
    name: str
    pathstring: str
    parent: Optional[int]


class ServerCheck(BaseModel):
    server: str
    api_version: int
    instance: str
    categories: list[ServerCategory]


class SyncResult(BaseModel):
    status: Literal["ok", "error"]
    error: str
    matched: int
    unmatched: int
    records: int


def _synced(source_id: str) -> SyncResult:
    """Read the source now. A read that failed matched nothing."""

    return SyncResult(**{"error": "", "matched": 0, "unmatched": 0, "records": 0, **sync.sync(_store(), _keyring(), source_id)})


class UnmatchedPart(BaseModel):
    remote_part: str
    ipn: str
    mpn: str
    manufacturer: str
    name: str
    quantity: float
    records: int
    reason: Literal["no_component", "sap_code_shared", "mpn_shared"]
    seen_at: datetime
    # Set once a person linked the part; the row stays until a read lands its stock on the component.
    linked_component_id: Optional[str] = None
    linked_mpn: str = ""
    linked_name: str = ""
    linked_at: Optional[datetime] = None


@router.get("")
async def list_inventory_sources(_user: AuthenticatedUser = Depends(require_supply_reader)) -> list[InventorySource]:
    def read() -> list[InventorySource]:
        with _store().connection() as conn:
            return [InventorySource(**sources.dto(row)) for row in sources.list_sources(conn)]

    return await _run(read)


@router.post("", status_code=201)
async def create_inventory_source(body: CreateSourceRequest, admin: AuthenticatedUser = Depends(require_admin)) -> InventorySource:
    def run() -> InventorySource:
        with _store().connection() as conn:
            row = sources.create(
                conn, _keyring(), admin.email, display_name=body.display_name, url=body.base_url, token=body.token,
                category_id=body.category_id, interval_hours=body.interval_hours, kind=body.kind,
            )
            return InventorySource(**sources.dto(row))

    return await _run(run)


@router.patch("/{source_id}")
async def update_inventory_source(source_id: str, body: UpdateSourceRequest, admin: AuthenticatedUser = Depends(require_admin)) -> InventorySource:
    changes = {("url" if key == "base_url" else key): value for key, value in body.model_dump(exclude_unset=True).items()}

    def run() -> InventorySource:
        with _store().connection() as conn:
            return InventorySource(**sources.dto(sources.update(conn, _keyring(), source_id, admin.email, **changes)))

    return await _run(run)


@router.delete("/{source_id}", status_code=204)
async def delete_inventory_source(source_id: str, admin: AuthenticatedUser = Depends(require_admin)) -> Response:
    def run() -> None:
        with _store().connection() as conn:
            sources.delete(conn, source_id, admin.email)

    await _run(run)
    return Response(status_code=204)


@router.post("/{source_id}/check")
async def check_inventory_source(source_id: str, _admin: AuthenticatedUser = Depends(require_admin)) -> ServerCheck:
    """Ask the server who it is and which categories it has, with the stored token. Changes nothing."""

    def run() -> ServerCheck:
        with _store().connection() as conn:
            row = sources.get(conn, source_id)
        client = InvenTreeClient(row["base_url"], sources.token_of(_keyring(), row))
        try:
            info = client.server()
            categories = [ServerCategory(pk=c.pk, name=c.name, pathstring=c.pathstring, parent=c.parent) for c in client.categories()]
        finally:
            client.close()
        return ServerCheck(server=info.server, api_version=info.api_version, instance=info.instance, categories=categories)

    return await _run(run)


@router.post("/{source_id}/sync")
async def sync_inventory_source(source_id: str, _admin: AuthenticatedUser = Depends(require_admin)) -> SyncResult:
    """Read the source now. A failed read keeps the stock it had, marked stale."""

    return await run_supply(lambda: _synced(source_id), upstream=True)


@router.get("/{source_id}/unmatched")
async def list_unmatched_parts(
    source_id: str,
    q: str = Query("", max_length=100),
    limit: int | None = Query(None, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    group: str = Query("", max_length=32),
    _user: AuthenticatedUser = Depends(require_supply_reader),
) -> list[UnmatchedPart]:
    """The source's unmatched parts, waiting ones first and largest first; ``q`` searches IPN, MPN, maker and name, ``limit`` and
    ``offset`` page them, ``group`` narrows to one of waiting, a reason, linked or ignored. Without ``limit``, every one."""

    def read() -> list[UnmatchedPart]:
        with _store().connection() as conn:
            sources.get(conn, source_id)
            return [UnmatchedPart(**row) for row in sync.unmatched(conn, source_id, query=q, limit=limit, offset=offset, group=group)]

    return await _run(read)


class LinkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    component_id: str = Field(min_length=1, max_length=200)


class UnmatchedCounts(BaseModel):
    """How many of a source's unmatched parts wait (in all and per reason), are linked, or were set aside."""

    waiting: int
    no_component: int
    sap_code_shared: int
    mpn_shared: int
    linked: int
    ignored: int


class UnmatchedChanged(BaseModel):
    changed: int


@router.get("/{source_id}/unmatched/counts", response_model=UnmatchedCounts)
async def count_unmatched_parts(source_id: str, _user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, int]:
    """How many of the source's unmatched parts wait (in all and per reason), are linked, or were set aside."""

    def read() -> dict[str, int]:
        with _store().connection() as conn:
            sources.get(conn, source_id)
            return sync.unmatched_counts(conn, source_id)

    return await _run(read)


class IgnoreRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    remote_parts: list[str] = Field(min_length=1, max_length=sync.MAX_AT_ONCE)
    ignore: bool


@router.post("/{source_id}/unmatched/ignore", response_model=UnmatchedChanged)
async def ignore_unmatched_parts(
    source_id: str, body: IgnoreRequest, approver: AuthenticatedUser = Depends(require_supply_approver),
) -> dict[str, int]:
    """Set unmatched parts aside (stock that will never be a library component), or bring them back."""

    def run() -> dict[str, int]:
        with _store().connection() as conn:
            return {"changed": sync.set_ignored(conn, source_id, body.remote_parts, body.ignore, approver.email)}

    return await _run(run)


@router.post("/{source_id}/unmatched/{remote_part}/link")
async def link_unmatched_part(
    source_id: str, remote_part: str, body: LinkRequest, approver: AuthenticatedUser = Depends(require_supply_approver),
) -> SyncResult:
    """Say which component a server part is, then read the source again so its stock lands there now."""

    def run() -> SyncResult:
        with _store().connection() as conn:
            sync.link(conn, source_id, remote_part, body.component_id, approver.email)
        return _synced(source_id)

    return await _run(run)
