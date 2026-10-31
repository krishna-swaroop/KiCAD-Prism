"""Assessment API: how a part stands, and the waivers that accept its findings.

Everyone who can read supply data sees assessments. Proposing a waiver needs write or approval
access (admin, designer, qa); approving and rejecting follow catalog QA (admin, qa).
"""

from __future__ import annotations

from functools import partial
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, ConfigDict, Field

from app.api import supply_connectors
from app.api.supply_assessment_models import SupplyAssessment, WaiverProposed
from app.api.supply_access import is_approver, require_supply_editor
from app.api.supply_call import run_supply
from app.core.security import AuthenticatedUser, require_supply_approver, require_supply_reader
from app.services.supply import parts
from app.services.supply.assessment import service, waivers
from app.services.supply.assessment.checks import Finding
from app.services.supply.vocabulary import Status

router = APIRouter(prefix="/api/supply", tags=["supply"])
_run = partial(run_supply, invalid="waiver_error")


class ProposeWaiverRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    check: str = Field(min_length=1, max_length=64)
    reason: str = Field(min_length=1, max_length=waivers.MAX_REASON)
    quantity: Optional[int] = Field(default=None, ge=1, le=10_000_000)


def _store():
    # Resolved per call so a replaced connector service (tests) brings its own store.
    return supply_connectors.service.store


@router.get("/parts/{part_id}/assessment", response_model=SupplyAssessment)
async def get_assessment(
    part_id: str,
    quantity: Optional[int] = Query(default=None, ge=1, le=10_000_000),
    _user: AuthenticatedUser = Depends(require_supply_reader),
) -> dict[str, Any]:
    """How a part stands. ``quantity`` is the units a build needs, to compare stock with."""

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            parts.get_part(conn, part_id)
            return service.assess_parts(conn, [part_id], {part_id: quantity})[part_id]

    return await _run(read)


@router.post("/parts/{part_id}/waivers", status_code=201, response_model=WaiverProposed)
async def propose_waiver(
    part_id: str, body: ProposeWaiverRequest, editor: AuthenticatedUser = Depends(require_supply_editor)
) -> dict[str, str]:
    def run() -> dict[str, str]:
        with _store().connection() as conn:
            parts.get_part(conn, part_id)
            current = service.assess_parts(conn, [part_id], {part_id: body.quantity})[part_id]
            finding = next((f for f in current["findings"] if f["check"] == body.check), None)
            # The finding the waiver is tied to, as the assessment says it stands now.
            raised = Finding(finding["check"], Status(finding["severity"]), finding["text"], finding["scope"]) if finding else None
            return waivers.propose(conn, part_id, raised, body.reason, editor.email, approver=is_approver(editor))

    return await _run(run)


@router.post("/waivers/{waiver_id}/approve", status_code=204)
async def approve_waiver(waiver_id: str, approver: AuthenticatedUser = Depends(require_supply_approver)) -> Response:
    def run() -> None:
        with _store().connection() as conn:
            waivers.decide(conn, waiver_id, approver.email, approve=True)

    await _run(run)
    return Response(status_code=204)


@router.post("/waivers/{waiver_id}/reject", status_code=204)
async def reject_waiver(waiver_id: str, approver: AuthenticatedUser = Depends(require_supply_approver)) -> Response:
    def run() -> None:
        with _store().connection() as conn:
            waivers.decide(conn, waiver_id, approver.email, approve=False)

    await _run(run)
    return Response(status_code=204)


@router.delete("/waivers/{waiver_id}", status_code=204)
async def revoke_waiver(waiver_id: str, editor: AuthenticatedUser = Depends(require_supply_editor)) -> Response:
    def run() -> None:
        with _store().connection() as conn:
            waivers.revoke(conn, waiver_id, editor.email, approver=is_approver(editor))

    await _run(run)
    return Response(status_code=204)
