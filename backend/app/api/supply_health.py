"""Supply health for administrators: calls against budget, errors and late reads per connector, and the periodic tasks' runs."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends

from app.api import supply_connectors
from app.api.supply_health_models import SupplyHealth
from app.core.security import AuthenticatedUser, require_admin
from app.services.supply import connector_health, tasks

router = APIRouter(prefix="/api/supply", tags=["supply"])


@router.get("/health", response_model=SupplyHealth)
async def supply_health(_admin: AuthenticatedUser = Depends(require_admin)) -> dict[str, Any]:
    def read() -> dict[str, Any]:
        with supply_connectors.service.store.connection() as conn:
            return {"connectors": connector_health.connector_health(conn), "tasks": tasks.state(conn)}

    return await asyncio.to_thread(read)

