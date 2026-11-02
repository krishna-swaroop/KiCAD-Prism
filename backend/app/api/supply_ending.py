"""Ending parts in the library: the components whose part is ending, and the decision about each.

Everyone who reads supply data sees the list. Marking a component "not for new designs", or recording that it was retired, is for QA
and administrators. Retiring itself is the catalog's own archive transition; this records that it happened.
"""

from __future__ import annotations

from functools import partial
from typing import Any, Literal

from fastapi import APIRouter, Depends, Response

from app.api import supply_connectors
from app.api.supply_access import is_approver, require_supply_editor
from app.api.supply_call import run_supply
from app.api.supply_ending_models import ComponentRestriction, DismissIn, EndingParts, RestrictionIn
from app.api.supply_models import DecisionState
from app.core.security import AuthenticatedUser, require_supply_approver, require_supply_reader
from app.services.supply import ending_parts

router = APIRouter(prefix="/api/supply/ending", tags=["supply"])
_run = partial(run_supply, invalid="invalid_restriction", missing=True)


def _store():
    # Resolved per call so a replaced connector service (tests) brings its own store.
    return supply_connectors.service.store


@router.get("", response_model=EndingParts)
async def list_ending(user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return ending_parts.queue(conn, user.role)

    return await _run(read)


@router.put("/{component_id}/restriction", response_model=ComponentRestriction)
async def set_restriction(component_id: str, body: RestrictionIn, user: AuthenticatedUser = Depends(require_supply_approver)) -> dict[str, Any]:
    def run() -> dict[str, Any]:
        with _store().connection() as conn:
            return ending_parts.set_restriction(conn, component_id, body.level, body.reason, body.replacement_component_id, user.email)

    return await _run(run)


@router.delete("/{component_id}/restriction", status_code=204)
async def clear_restriction(component_id: str, user: AuthenticatedUser = Depends(require_supply_approver)) -> Response:
    def run() -> None:
        with _store().connection() as conn:
            ending_parts.clear_restriction(conn, component_id, user.email)

    await _run(run)
    return Response(status_code=204)


@router.put("/{component_id}/dismissal", response_model=DecisionState)
async def dismiss_ending(component_id: str, body: DismissIn, user: AuthenticatedUser = Depends(require_supply_editor)) -> dict[str, str]:
    """Nothing to do about this component for now. It comes back when its part gains a new reason. An approver's dismissal stands;
    anyone else's waits in To approve."""

    def run() -> dict[str, str]:
        with _store().connection() as conn:
            return ending_parts.dismiss(conn, component_id, body.reasons, user.email, approver=is_approver(user))

    return await _run(run)


@router.post("/dismissals/{decision_id}/{verdict}", status_code=204)
async def decide_dismissal(decision_id: str, verdict: Literal["approve", "reject"], user: AuthenticatedUser = Depends(require_supply_approver)) -> Response:
    def run() -> None:
        with _store().connection() as conn:
            ending_parts.decide_dismissal(conn, decision_id, user.email, approve=verdict == "approve")

    await _run(run)
    return Response(status_code=204)
