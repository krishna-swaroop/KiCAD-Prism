"""Check once: read a BOM or a component at the distributors without tracking it, and follow the progress."""

from __future__ import annotations

from functools import partial
from typing import Any

from fastapi import APIRouter, Depends

from app.api import supply_connectors
from app.api.supply_call import run_supply
from app.api.supply_checks_models import CheckProgress, CheckStarted, NewCheck
from app.core.security import AuthenticatedUser, require_supply_reader, require_supply_tracker
from app.services.supply import oneoff

router = APIRouter(prefix="/api/supply/checks", tags=["supply"])
_run = partial(run_supply, missing=True)


def _store():
    return supply_connectors.service.store


@router.post("", status_code=201, response_model=CheckStarted)
async def start(body: NewCheck, user: AuthenticatedUser = Depends(require_supply_tracker)) -> dict[str, Any]:
    def run() -> dict[str, Any]:
        with _store().connection() as conn:
            made = oneoff.request(conn, body.kind, [(line.manufacturer, line.mpn) for line in body.lines], user.email, project_id=body.project_id)
            return {**made, "progress": oneoff.progress(conn, made["id"])}

    return await _run(run)


@router.get("/{request_id}", response_model=CheckProgress)
async def progress(request_id: str, _user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return oneoff.progress(conn, request_id)

    return await _run(read)
