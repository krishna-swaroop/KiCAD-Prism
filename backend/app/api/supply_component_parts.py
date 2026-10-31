"""Component parts API: a catalog component's main part and its alternates, and its local stock.

Everyone who reads supply data sees them. Designers and administrators propose alternates; QA and administrators
approve, reject or remove them.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field

from app.api import supply_connectors
from app.api.supply_call import run_supply as _run
from app.api.supply_models import StoresState
from app.core.security import AuthenticatedUser, require_supply_approver, require_supply_reader, require_supply_writer
from app.services.supply import component_parts
from app.services.supply.inventory import levels

router = APIRouter(prefix="/api/supply/components", tags=["supply"])


def _store():
    # Resolved per call so a replaced connector service (tests) brings its own store.
    return supply_connectors.service.store


class ComponentPart(BaseModel):
    part_id: str
    role: Literal["main", "alternate"]
    approval: Literal["pending", "approved", "rejected"]
    manufacturer: str
    mpn: str
    created_by: str
    created_at: datetime
    decided_by: str
    decided_at: datetime | None


class ComponentParts(BaseModel):
    component_id: str
    parts: list[ComponentPart]


class AlternateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    manufacturer: str = Field(default="", max_length=200)
    mpn: str = Field(min_length=1, max_length=120)


class DecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    approve: bool
    main_part_id: Optional[str] = Field(
        default=None, description="The main part the decider was shown (empty for none); the decision is refused (409) when it has changed since.")


def _parts(conn, component_id: str) -> ComponentParts:
    return ComponentParts(component_id=component_id, parts=[ComponentPart(**row) for row in component_parts.parts_of(conn, component_id)])


@router.get("/{component_id}/parts")
async def get_component_parts(component_id: str, _user: AuthenticatedUser = Depends(require_supply_reader)) -> ComponentParts:
    """The component's main part and alternates. The main part is brought in step with the current revision first."""

    def read() -> ComponentParts:
        with _store().connection() as conn:
            component_parts.sync_main(conn, [component_id])
            return _parts(conn, component_id)

    return await _run(read)


@router.post("/{component_id}/alternates")
async def propose_alternate(
    component_id: str, body: AlternateRequest, writer: AuthenticatedUser = Depends(require_supply_writer)
) -> ComponentParts:
    def run() -> ComponentParts:
        with _store().connection() as conn:
            component_parts.propose_alternate(conn, component_id, body.manufacturer, body.mpn, writer.email)
            return _parts(conn, component_id)

    return await _run(run)


@router.post("/{component_id}/alternates/{part_id}/decision")
async def decide_alternate(
    component_id: str, part_id: str, body: DecisionRequest, approver: AuthenticatedUser = Depends(require_supply_approver)
) -> ComponentParts:
    def run() -> ComponentParts:
        with _store().connection() as conn:
            component_parts.decide(conn, component_id, part_id, body.approve, approver.email, main_part_id=body.main_part_id)
            return _parts(conn, component_id)

    return await _run(run)


@router.delete("/{component_id}/alternates/{part_id}", status_code=204)
async def remove_alternate(
    component_id: str, part_id: str, approver: AuthenticatedUser = Depends(require_supply_approver)
) -> Response:
    def run() -> None:
        with _store().connection() as conn:
            component_parts.remove_alternate(conn, component_id, part_id, approver.email)

    await _run(run)
    return Response(status_code=204)


class LocalStockRow(BaseModel):
    # Unique per row: the source and its location key.
    key: str
    source: str
    source_id: str
    location: str
    quantity: float
    allocated: float
    status: str
    external: bool
    batch: str
    uom: str
    stale: bool
    fetched_at: str
    updated_at: str


class LocalStock(BaseModel):
    component_id: str
    stores: StoresState | None = None
    uom: str
    mixed_units: bool
    available: float | None
    held: float | None
    at_vendor: float | None
    rows: list[LocalStockRow]


@router.get("/{component_id}/local-stock")
async def get_local_stock(component_id: str, _user: AuthenticatedUser = Depends(require_supply_reader)) -> LocalStock:
    """What the local inventory holds for the component: available, held and at a vendor, per location."""

    def read() -> LocalStock:
        with _store().connection() as conn:
            state = levels.stores_state(conn, [component_id]).get(component_id)
            return LocalStock(**levels.local_stock(conn, component_id), stores=state)

    return await _run(read)
