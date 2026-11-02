"""Market indices for readers of supply data: how the followed parts do as a group, by manufacturer and by category."""

from __future__ import annotations

import asyncio
from typing import Any, Literal

from fastapi import APIRouter, Depends, Response

from app.api import supply_connectors
from app.api.supply_insights_models import SupplyDashboard, SupplyInsightsPage, SupplyMarketHistory
from app.core.security import AuthenticatedUser, require_supply_reader
from app.services.supply import dashboard, insights_page, market

router = APIRouter(prefix="/api/supply", tags=["supply"])


@router.get("/dashboard", response_model=SupplyDashboard, response_model_exclude_unset=True)
async def dashboard_figures(user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    def read() -> dict[str, Any]:
        with supply_connectors.service.store.connection() as conn:
            return dashboard.build(conn, role=user.role)

    return await asyncio.to_thread(read)


@router.get("/insights", response_model=SupplyInsightsPage, response_model_exclude_unset=True)
async def insights_overview(_user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    def read() -> dict[str, Any]:
        with supply_connectors.service.store.connection() as conn:
            return insights_page.build(conn)

    return await asyncio.to_thread(read)


@router.get(
    "/insights/risk.csv",
    response_class=Response,
    responses={200: {"description": "Every tracked part with its risk figures.", "content": {"text/csv": {}}}},
)
async def insights_risk_csv(_user: AuthenticatedUser = Depends(require_supply_reader)) -> Response:
    def read() -> str:
        with supply_connectors.service.store.connection() as conn:
            return insights_page.risk_csv(conn)

    content = await asyncio.to_thread(read)
    return Response(content=content, media_type="text/csv; charset=utf-8", headers={"Content-Disposition": 'attachment; filename="supply-risk-by-part.csv"'})


@router.get("/market/history", response_model=SupplyMarketHistory)
async def market_history(
    metric: Literal["out_of_stock", "lifecycle_risk", "dropped", "median_lead_time_days", "price_index"],
    _user: AuthenticatedUser = Depends(require_supply_reader),
) -> dict[str, Any]:
    def read() -> dict[str, Any]:
        with supply_connectors.service.store.connection() as conn:
            return market.history(conn, metric)

    return await asyncio.to_thread(read)
