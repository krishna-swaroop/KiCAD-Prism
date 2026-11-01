"""A part's datasheet address: where a person opens the manufacturer's datasheet.

Prism keeps the address a distributor gives and downloads nothing.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import Field

from app.api import supply_connectors
from app.api.supply_call import run_supply as _run
from app.api.supply_models import SupplyModel
from app.core.security import AuthenticatedUser, require_supply_reader
from app.services.supply import parts

router = APIRouter(prefix="/api/supply", tags=["supply"])


class Datasheet(SupplyModel):
    url: Optional[str] = Field(description="The address a distributor gave; null when none did.")


def _store():
    # Resolved per call so a replaced connector service (tests) brings its own store.
    return supply_connectors.service.store


@router.get("/parts/{part_id}/datasheet", response_model=Datasheet)
async def get_datasheet(part_id: str, _user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            part = parts.get_part(conn, part_id)
            return {"url": conn.execute("SELECT datasheet_url FROM supply_parts WHERE id = %s", (part.id,)).fetchone()["datasheet_url"]}

    return await _run(read)
