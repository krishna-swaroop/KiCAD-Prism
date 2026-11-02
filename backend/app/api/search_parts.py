"""Search over library components and supply parts, one row for each part (see ``supply.part_search``)."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, Query

from app.api import supply_connectors
from app.core.roles import CATALOG_READ_ROLES, SUPPLY_READ_ROLES
from app.core.security import AuthenticatedUser, require_catalog_browser
from app.services.supply import part_search

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("/parts")
async def search_parts(
    q: str = Query(default="", max_length=100),
    limit: int = Query(default=8, ge=1, le=part_search.MAX_LIMIT),
    user: AuthenticatedUser = Depends(require_catalog_browser),
) -> dict[str, Any]:
    """Each side is searched only when the caller's role may read it; a caller who may read neither gets nothing."""

    library, supply = user.role in CATALOG_READ_ROLES, user.role in SUPPLY_READ_ROLES

    def run() -> list[dict[str, Any]]:
        with supply_connectors.service.store.connection() as conn:
            return part_search.search(conn, q, limit, library=library, supply=supply)

    return {"items": await asyncio.to_thread(run) if library or supply else []}
