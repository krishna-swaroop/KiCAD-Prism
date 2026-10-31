"""Parts API.

Everyone who can read supply data sees parts, stock and history. Following a part is ``supply_tracking``.
"""

from __future__ import annotations

from functools import partial
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field

from app.api import supply_connectors
from app.api.supply_call import run_supply
from app.api.supply_models import Items
from app.api.supply_parts_models import (
    CrossReference, LibraryComponentOf, PartHistory, PartLookup, PartReadOnView, PriceQuantity, SupplyManufacturer, SupplyPartDetail,
    SupplyPartGroups, SupplyPartsPage, SupplyReadNow,
)
from app.core.security import AuthenticatedUser, require_supply_reader, require_supply_tracker, require_supply_writer
from app.services.supply import catalog_read, component_parts, cross_reference, part_history, parts, parts_view, preferences, price_quantity, trade_marks, refresh, review

router = APIRouter(prefix="/api/supply", tags=["supply"])
_run = partial(run_supply, invalid="invalid_request")


def _store():
    # Resolved per call so a replaced connector service (tests) brings its own store.
    return supply_connectors.service.store


@router.get("/parts", response_model=SupplyPartsPage, response_model_exclude_unset=True)
async def list_parts(
    scope: Literal["watched", "followed", "in_use", "all", "tier1", "tier2", "waiting", "pick"] = "watched",
    only: str = Query(default="", max_length=120, pattern=r"^[A-Za-z0-9_]*(:[^\x00-\x1f]{1,100})?$"),
    q: str = Query(default="", max_length=100),
    limit: int = Query(default=100, ge=1, le=parts_view.MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    project_id: str = Query(default="", max_length=100),
    vendor: str = Query(default="", max_length=100),
    sort: str = Query(default="", pattern=r"^(runout|(part|stock|price):(asc|desc))?$"),
    user: AuthenticatedUser = Depends(require_supply_reader),
) -> dict[str, Any]:
    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return parts_view.list_parts(
                conn, scope=scope, query=q, limit=limit, role=user.role, only=only, offset=offset, project_id=project_id, vendor=vendor, sort=sort,
            )

    return await _run(read)


@router.get("/part-groups", response_model=SupplyPartGroups, response_model_exclude_unset=True)
async def part_groups(
    scope: Literal["watched", "followed", "in_use", "all", "tier1", "tier2", "waiting", "pick"] = "watched",
    only: str = Query(default="", max_length=120, pattern=r"^[A-Za-z0-9_]*(:[^\x00-\x1f]{1,100})?$"),
    q: str = Query(default="", max_length=100),
    vendor: str = Query(default="", max_length=100),
    user: AuthenticatedUser = Depends(require_supply_reader),
) -> dict[str, Any]:
    """The matching parts grouped by the projects that use them, tracked projects first."""

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            grouped = parts_view.part_groups(conn, scope=scope, query=q, role=user.role, only=only, vendor=vendor)
            return {"items": grouped["groups"], "total": grouped["total"]}

    return await _run(read)


@router.get("/part-lookup", response_model=PartLookup)
async def find_part(
    mpn: str = Query(min_length=1, max_length=100),
    manufacturer: str = Query(default="", max_length=120),
    _user: AuthenticatedUser = Depends(require_supply_reader),
) -> dict[str, Any]:
    """The part Prism knows for a manufacturer and number, and whether it follows it. A blank manufacturer finds a number only one part has.
    Creates nothing."""

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            record = parts.find_part(conn, manufacturer, mpn)
            if record is None:
                return {"part_id": None, "followed": False}
            followed = conn.execute("SELECT 1 FROM supply_part_tiers WHERE part_id = %s", (record.id,)).fetchone() is not None
            return {"part_id": record.id, "followed": followed}

    return await _run(read)


@router.get("/parts/{part_id}", response_model=SupplyPartDetail, response_model_exclude_unset=True)
async def get_part(part_id: str, user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return parts_view.part_detail(conn, part_id, role=user.role)

    return await _run(read)


@router.get("/parts/{part_id}/history", response_model=PartHistory)
async def get_part_history(
    part_id: str, days: int = Query(part_history.DEFAULT_DAYS, ge=1, le=part_history.MAX_DAYS), user: AuthenticatedUser = Depends(require_supply_reader)
) -> dict[str, Any]:
    """Stock and price per distributor over the last ``days`` days."""

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return part_history.build(conn, part_id, days=days)

    return await _run(read)


class PreferredIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    connector_id: str = Field(min_length=1, max_length=64)


@router.put("/parts/{part_id}/preferred", status_code=204)
async def set_preferred(part_id: str, body: PreferredIn, user: AuthenticatedUser = Depends(require_supply_tracker)) -> None:
    def run() -> None:
        with _store().connection() as conn:
            preferences.set_preferred(conn, part_id, body.connector_id, user.email)

    await _run(run)


@router.delete("/parts/{part_id}/preferred", status_code=204)
async def clear_preferred(part_id: str, user: AuthenticatedUser = Depends(require_supply_tracker)) -> None:
    def run() -> None:
        with _store().connection() as conn:
            parts.get_part(conn, part_id)
            preferences.clear(conn, part_id, user.email)

    await _run(run)


class PriceQuantityIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Null takes the part back to the workspace default.
    quantity: Optional[int] = Field(default=None, ge=1, le=1_000_000)


@router.put("/parts/{part_id}/price-quantity", response_model=PriceQuantity)
async def set_price_quantity(part_id: str, body: PriceQuantityIn, user: AuthenticatedUser = Depends(require_supply_tracker)) -> dict[str, Any]:
    """The quantity this part is priced at in lists and its price history; null uses the workspace default."""

    def run() -> dict[str, Any]:
        with _store().connection() as conn:
            return price_quantity.set_for_part(conn, part_id, body.quantity, user.email)

    return await _run(run)


class TradeMarkIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    control: Literal["controlled", "none"]
    eccn: str = Field(default="", max_length=trade_marks.MAX_ECCN)


@router.put("/parts/{part_id}/trade-mark", status_code=204)
async def set_trade_mark(part_id: str, body: TradeMarkIn, user: AuthenticatedUser = Depends(require_supply_tracker)) -> None:
    """A person's word on whether the part is export controlled; it wins over what distributors state."""

    def run() -> None:
        with _store().connection() as conn:
            trade_marks.set_mark(conn, part_id, body.control, body.eccn, user.email)

    await _run(run)


@router.delete("/parts/{part_id}/trade-mark", status_code=204)
async def clear_trade_mark(part_id: str, user: AuthenticatedUser = Depends(require_supply_tracker)) -> None:
    def run() -> None:
        with _store().connection() as conn:
            parts.get_part(conn, part_id)
            trade_marks.clear_mark(conn, part_id, user.email)

    await _run(run)


@router.get("/parts/{part_id}/cross-reference", response_model=CrossReference)
async def cross_reference_of(part_id: str, _user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    """Alternatives to the part, graded by how close they are."""

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            parts.get_part(conn, part_id)
            return cross_reference.candidates(conn, part_id)

    return await _run(read)


@router.get("/parts/{part_id}/library-component", response_model=LibraryComponentOf)
async def library_component_of(part_id: str, _user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    """The catalog component the part counts for (its main part first, then one it is an approved alternate of), so a part link
    can open it. None when the library has none."""

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            part = parts.get_part(conn, part_id)
            held = component_parts.components_holding(conn, [part_id]).get(part_id) or []
        return {"component_id": held[0]["id"] if held else catalog_read.component_for(part.manufacturer_name, part.mpn)}

    return await _run(read)


@router.post("/parts/{part_id}/view-read", response_model=PartReadOnView)
async def read_part_on_view(part_id: str, reader: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    """Read a part someone opened, when nothing follows it and its prices are older than the read window. Once every 15 minutes per part."""

    return await _run(lambda: refresh.read_on_view(supply_connectors.service, [part_id], reader.email))


@router.post("/parts/{part_id}/refresh", response_model=SupplyReadNow)
async def read_part_now(part_id: str, writer: AuthenticatedUser = Depends(require_supply_writer)) -> dict[str, Any]:
    """Read one part from its distributors now, from the interactive reserve. Once every 15 minutes per person and part."""

    return await _run(lambda: refresh.read_now(supply_connectors.service, part_id, writer.email))


@router.get("/manufacturers", response_model=Items[SupplyManufacturer])
async def list_manufacturers(_user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return {"items": review.manufacturers(conn)}

    return await _run(read)
