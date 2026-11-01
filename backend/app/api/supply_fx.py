"""Exchange rates for supply prices. Everyone who reads supply data sees what is loaded; administrators refresh or enter rates."""

from __future__ import annotations

from functools import partial
from typing import Any

from fastapi import APIRouter, Depends

from app.api import supply_connectors
from app.api.supply_call import run_supply
from app.api.supply_fx_models import ManualRates, SupplyFxRates, SupplyFxRatesSaved
from app.core.security import AuthenticatedUser, require_admin, require_supply_reader
from app.services.supply import clock, fx

router = APIRouter(prefix="/api/supply/fx", tags=["supply"])
_run = partial(run_supply, invalid="invalid_rates", upstream="The exchange rates could not be fetched.")


def _store():
    # Resolved per call so a replaced connector service (tests) brings its own store.
    return supply_connectors.service.store


def _view(rates: fx.Rates) -> dict[str, Any]:
    today = clock.now().date()
    return {
        "day": rates.day.isoformat() if rates.day else None,
        "currencies": sorted(rates.per_eur),
        "stale": fx.is_stale(rates, today),
    }


@router.get("", response_model=SupplyFxRates)
async def current_rates(_user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return _view(fx.latest(conn))

    return await _run(read)


@router.post("/refresh", response_model=SupplyFxRatesSaved)
async def refresh_rates(_admin: AuthenticatedUser = Depends(require_admin)) -> dict[str, Any]:
    def run() -> dict[str, Any]:
        with _store().connection() as conn:
            saved = fx.refresh_from_ecb(conn)
            return {**_view(fx.latest(conn)), "saved": saved}

    return await _run(run)


@router.post("/rates", response_model=SupplyFxRatesSaved)
async def enter_rates(body: ManualRates, admin: AuthenticatedUser = Depends(require_admin)) -> dict[str, Any]:
    def run() -> dict[str, Any]:
        with _store().connection() as conn:
            saved = fx.enter_manually(conn, body.day, body.rates, admin.email)
            return {**_view(fx.latest(conn)), "saved": saved}

    return await _run(run)
