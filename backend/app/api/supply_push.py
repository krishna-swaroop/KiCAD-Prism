"""Push API: offers and stock levels sent to Prism by anything that is not a pull adapter (``services/supply/push.py``).

``POST /api/supply/connectors/{id}/offers`` feeds a file-fed connector (CSV, LCSC, JLCPCB); ``POST
/api/supply/inventory-sources/{id}/levels`` replaces a push inventory source's stock. Either takes the target's own push
token (``Authorization: Bearer prism_push_...``), which can push there and nowhere else, or an administrator. Only an
administrator issues, sees the prefix of, or revokes a token; the token itself is shown once.
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime
from decimal import Decimal
from typing import Callable, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from app.api import supply_connectors
from app.api.supply_call import run_supply as _run
from app.core.errors import BadRequest
from app.core.security import AuthenticatedUser, get_current_user, require_admin
from app.services.supply import push
from app.services.supply.csv_format import MAX_ROWS, parse_offer_records
from app.services.supply.inventory import sources

router = APIRouter(prefix="/api/supply", tags=["supply"])


class PriceTier(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quantity: int = Field(ge=1)
    unit_price: Decimal = Field(ge=0)


class PushedOffer(BaseModel):
    """One listing, with the columns of the offers file. Values are checked as a file's are."""

    model_config = ConfigDict(extra="forbid")

    sku: str = Field(min_length=1, max_length=100)
    mpn: str = Field(min_length=1, max_length=100)
    manufacturer: str = Field(min_length=1, max_length=100)
    stock: int = Field(ge=0)
    currency: str = Field(default="", max_length=3)
    moq: Optional[int] = Field(default=None, ge=1)
    order_multiple: Optional[int] = Field(default=None, ge=1)
    packaging: str = Field(default="", max_length=40)
    lead_time_days: Optional[int] = Field(default=None, ge=0)
    lifecycle: str = Field(default="", max_length=40)
    discontinued: bool = False
    rohs: Optional[bool] = None
    product_url: str = Field(default="", max_length=500)
    incoming_qty: Optional[int] = Field(default=None, ge=1)
    incoming_date: Optional[date] = None
    jlc_library: str = Field(default="", max_length=20)
    jlc_preferred: bool = False
    prices: list[PriceTier] = Field(default_factory=list, max_length=50)


class PushOffersRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    offers: list[PushedOffer] = Field(max_length=MAX_ROWS)
    # True: these are all the connector's offers, and any it held before that are not here are dropped (as an upload does).
    replace: bool = False


class PushOffersResult(BaseModel):
    received: int
    kept: int
    recorded: int
    pushed_at: datetime


class PushedLevel(BaseModel):
    """One stock record. ``part`` is the source's own id for the part; its numbers are matched to library components."""

    model_config = ConfigDict(extra="forbid")

    part: str = Field(min_length=1, max_length=100)
    name: str = Field(default="", max_length=200)
    ipn: str = Field(default="", max_length=100)
    mpn: str = Field(default="", max_length=100)
    manufacturer: str = Field(default="", max_length=100)
    sku: str = Field(default="", max_length=100)
    supplier: str = Field(default="", max_length=100)
    units: str = Field(default="", max_length=20)
    location: str = Field(default="", max_length=300)
    external: bool = False
    quantity: float = Field(ge=0)
    allocated: float = Field(default=0, ge=0)
    # Blank or "ok" is usable stock; any other word ("on hold", "quarantined") is held.
    status: str = Field(default="", max_length=40)
    batch: str = Field(default="", max_length=100)
    updated: str = Field(default="", max_length=40)


class PushLevelsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[PushedLevel] = Field(max_length=push.MAX_LEVELS)


class PushLevelsResult(BaseModel):
    matched: int
    unmatched: int
    records: int


class PushToken(BaseModel):
    prefix: str
    created_by: str
    created_at: datetime
    last_used_at: Optional[datetime]


class IssuedPushToken(BaseModel):
    # Shown once.
    token: str
    prefix: str


def _store():
    return supply_connectors.service.store


def _pusher(target_kind: str) -> Callable:
    """The caller of a push: the target's own push token, or an administrator. Returns the actor written to the audit."""

    async def resolve(request: Request) -> str:
        scheme, _, token = (request.headers.get("authorization") or "").partition(" ")
        token = token.strip()
        if scheme.casefold() == "bearer" and token.startswith(push.TOKEN_PREFIX):
            target_id = request.path_params.get("connector_id") or request.path_params.get("source_id") or ""

            def check() -> str | None:
                with _store().connection() as conn:
                    return push.check_token(conn, target_kind, target_id, token)

            prefix = await asyncio.to_thread(check)
            if prefix is None:
                raise HTTPException(status_code=401, detail="Invalid push token")
            return f"push:{prefix}"
        admin = await require_admin(await get_current_user(request))
        return admin.email

    return resolve


# --- pushes -----------------------------------------------------------------


@router.post("/connectors/{connector_id}/offers")
async def push_connector_offers(
    connector_id: str, body: PushOffersRequest, actor: str = Depends(_pusher(push.CONNECTOR)),
) -> PushOffersResult:
    """Offers for a file-fed connector. They are kept as its rows and recorded on the listings Prism already has for them."""

    def run() -> PushOffersResult:
        connector = supply_connectors.service.get(connector_id)
        push.require_file_fed(connector)
        parsed = parse_offer_records([offer.model_dump(mode="json") for offer in body.offers], default_currency=connector["currency"])
        if parsed.error_count:
            raise BadRequest(
                f"Nothing was taken. {parsed.error_count} problem(s) found.", code="offers_rejected",
                error_count=parsed.error_count,
                errors=[{"row": e.line, "field": e.column, "message": e.message} for e in parsed.errors],
            )
        done = push.push_offers(
            _store(), supply_connectors.service, connector_id, parsed.rows, actor=actor, replace=body.replace, filename="push",
        )
        return PushOffersResult(received=len(parsed.rows), kept=done["info"].row_count, recorded=done["recorded"], pushed_at=done["info"].imported_at)

    return await _run(run)


@router.post("/inventory-sources/{source_id}/levels")
async def push_inventory_levels(
    source_id: str, body: PushLevelsRequest, actor: str = Depends(_pusher(push.INVENTORY_SOURCE)),
) -> PushLevelsResult:
    """The whole stock of a push inventory source. It replaces what the source pushed before."""

    return await _run(lambda: PushLevelsResult(**push.push_levels(
        _store(), source_id, [item.model_dump() for item in body.items], actor=actor,
    )))


# --- tokens -----------------------------------------------------------------


def _target(target_kind: str, target_id: str) -> None:
    """Refuse a target that does not exist or cannot take a push."""

    if target_kind == push.CONNECTOR:
        push.require_file_fed(supply_connectors.service.get(target_id))
        return
    from app.services.supply.inventory import registry

    with _store().connection() as conn:
        row = sources.get(conn, target_id)
    if not registry.get_spec(row["kind"]).pushed:
        raise push.PushError("not_push", "Only a push inventory source takes stock levels.")


def _token_routes(path: str, target_kind: str, name: str) -> None:
    async def read_token(target_id: str, _admin: AuthenticatedUser = Depends(require_admin)) -> Optional[PushToken]:
        def run() -> Optional[PushToken]:
            _target(target_kind, target_id)
            with _store().connection() as conn:
                found = push.token_info(conn, target_kind, target_id)
            return PushToken(**found) if found else None

        return await _run(run)

    async def issue_token(target_id: str, admin: AuthenticatedUser = Depends(require_admin)) -> IssuedPushToken:
        def run() -> IssuedPushToken:
            _target(target_kind, target_id)
            with _store().connection() as conn:
                token = push.issue_token(conn, target_kind, target_id, admin.email)
            return IssuedPushToken(token=token, prefix=token[:push.DISPLAY_PREFIX_LENGTH])

        return await _run(run)

    async def revoke_token(target_id: str, admin: AuthenticatedUser = Depends(require_admin)) -> Response:
        def run() -> None:
            with _store().connection() as conn:
                push.revoke_token(conn, target_kind, target_id, admin.email)

        await _run(run)
        return Response(status_code=204)

    for function, verb in ((read_token, "get"), (issue_token, "issue"), (revoke_token, "revoke")):
        function.__name__ = f"{verb}_{name}_push_token"
    router.add_api_route(path, read_token, methods=["GET"])
    router.add_api_route(path, issue_token, methods=["POST"])
    router.add_api_route(path, revoke_token, methods=["DELETE"], status_code=204)


_token_routes("/connectors/{target_id}/push-token", push.CONNECTOR, "connector")
_token_routes("/inventory-sources/{target_id}/push-token", push.INVENTORY_SOURCE, "inventory_source")
