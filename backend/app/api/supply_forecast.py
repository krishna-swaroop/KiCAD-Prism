"""Forecasts: a part's, the Insights section and the track record.

Everyone who can read supply data may look. Nothing is saved by asking, and no distributor is called: the quantity is a question.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from app.api import supply_connectors
from app.api.supply_call import run_supply as _run
from app.api.supply_forecast_models import ForecastInsights, PartForecast
from app.core.security import AuthenticatedUser, require_supply_reader
from app.services.supply import parts
from app.services.supply.forecast import views

router = APIRouter(prefix="/api/supply", tags=["supply"])


def _store():
    # Resolved per call so a replaced connector service (tests) brings its own store.
    return supply_connectors.service.store


@router.get("/parts/{part_id}/forecast", response_model=PartForecast, response_model_exclude_unset=True)
async def part_forecast(
    part_id: str, quantity: int | None = Query(default=None, ge=1, le=1_000_000), _user: AuthenticatedUser = Depends(require_supply_reader),
) -> dict[str, Any]:
    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            parts.get_part(conn, part_id)
            return views.part(conn, part_id, quantity=quantity)

    return await _run(read)


@router.get("/forecasts/insights", response_model=ForecastInsights, response_model_exclude_unset=True)
async def forecasts_insights(_user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return views.insights_page(conn)

    return await _run(read)
