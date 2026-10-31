"""Packaging picks: which listing of a part is followed at each distributor.

Everyone who reads supply data sees the picks; administrators, designers and QA make them.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from app.api import supply_connectors
from app.api.supply_access import is_approver
from app.api.supply_call import run_supply as _run
from app.api.supply_models import Items
from app.api.supply_packaging_models import (
    PackagingOptions, PackagingPicked, PackagingProposals, PackagingSeveral, PickIn, PicksMade, SimilarIn,
)
from app.core.security import AuthenticatedUser, require_supply_reader, require_supply_tracker
from app.services.supply import packaging_auto, packaging_picks, parts

router = APIRouter(prefix="/api/supply/packaging", tags=["supply"])


def _store():
    return supply_connectors.service.store


@router.get("/several", response_model=Items[PackagingSeveral])
async def several(_user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    """Every tracked part with several listings at a distributor, with the pick and what it saves, for Review."""

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return {"items": packaging_picks.several(conn)}

    return await _run(read)


@router.get("/auto/{part_id}", response_model=PackagingProposals)
async def proposed(part_id: str, _user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    """The picks Prism would make for the part's distributors that wait for one, and the calls they save. Nothing changes."""

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            parts.get_part(conn, part_id)
            items = packaging_auto.propose(conn, part_id)
            return {"items": items, "saves_calls_a_day": round(sum(item["saves_calls_a_day"] for item in items), 3)}

    return await _run(read)


@router.post("/auto/{part_id}", response_model=PicksMade)
async def apply_proposed(part_id: str, user: AuthenticatedUser = Depends(require_supply_tracker)) -> dict[str, int]:
    def run() -> dict[str, int]:
        with _store().connection() as conn:
            parts.get_part(conn, part_id)
            return {"picked": packaging_auto.apply_proposals(conn, part_id, user.email)}

    return await _run(run)


@router.get("/{part_id}/{connector_id}", response_model=PackagingOptions)
async def options(part_id: str, connector_id: str, user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            # Taking a listing off the part is a decision for those who may pin one.
            return {**packaging_picks.options(conn, part_id, connector_id), "can_unpin": is_approver(user)}

    return await _run(read)


@router.put("/{part_id}/{connector_id}", response_model=PackagingPicked)
async def pick(part_id: str, connector_id: str, body: PickIn, user: AuthenticatedUser = Depends(require_supply_tracker)) -> dict[str, Any]:
    """Pick a listing. The answer offers the same packaging for the similar parts still waiting; nothing applies until confirmed."""

    def run() -> dict[str, Any]:
        with _store().connection() as conn:
            packaging_picks.pick(conn, part_id, connector_id, body.listing_id, user.email)
            chosen = next(item for item in packaging_picks.options(conn, part_id, connector_id)["listings"] if item["id"] == body.listing_id)
            return {
                "picked": body.listing_id,
                "packaging": chosen["packaging"],
                "similar": packaging_picks.similar(conn, part_id, connector_id, chosen["packaging"]),
            }

    return await _run(run)


@router.delete("/{part_id}/{connector_id}", status_code=204)
async def clear(part_id: str, connector_id: str, user: AuthenticatedUser = Depends(require_supply_tracker)) -> None:
    def run() -> None:
        with _store().connection() as conn:
            parts.get_part(conn, part_id)
            packaging_picks.clear(conn, part_id, connector_id, user.email)

    await _run(run)


@router.post("/similar", response_model=PicksMade)
async def apply_similar(body: SimilarIn, user: AuthenticatedUser = Depends(require_supply_tracker)) -> dict[str, int]:
    def run() -> dict[str, int]:
        with _store().connection() as conn:
            return {"picked": packaging_picks.apply_similar(conn, body.connector_id, body.packaging, body.part_ids, user.email)}

    return await _run(run)
