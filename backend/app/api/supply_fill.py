"""Fill from distributor API. Looking a part up needs write access (admin, designer).

It reads from the distributors and writes nothing; the person saves the result through the
catalog's metadata edit.
"""

from __future__ import annotations

from functools import partial
from typing import Any

from fastapi import APIRouter, Depends

from app.api import supply_connectors
from app.api.supply_call import run_supply
from app.api.supply_fill_models import DetailsRequest, FillDetails, FillSearchResult, SearchRequest
from app.core.security import AuthenticatedUser, require_supply_writer
from app.services.supply import fill

router = APIRouter(prefix="/api/supply/fill", tags=["supply"])
_run = partial(run_supply, missing=True)


def _service() -> fill.FillService:
    # Built per call so a replaced connector service (tests) is the one used.
    return fill.FillService(supply_connectors.service)


@router.post("/search", response_model=FillSearchResult)
async def search(body: SearchRequest, _user: AuthenticatedUser = Depends(require_supply_writer)) -> dict[str, Any]:
    return await _run(lambda: _service().search(body.mpn, body.manufacturer))


@router.post("/details", response_model=FillDetails)
async def details(body: DetailsRequest, _user: AuthenticatedUser = Depends(require_supply_writer)) -> dict[str, Any]:
    return await _run(lambda: _service().details(body.connector_id, body.sku, body.mpn, body.manufacturer))
