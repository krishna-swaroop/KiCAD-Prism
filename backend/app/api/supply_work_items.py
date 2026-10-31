"""Work items: engineering decisions about a component or a part, with an owner, evidence, QA's disposition and a recheck date.

Everyone who reads supply sees them. Those who follow supply (designers, QA, administrators) open and edit them; QA and
administrators accept, reject or reopen them; the owner, whoever opened one, or QA marks it done.
"""

from __future__ import annotations

from datetime import date
from functools import partial
from typing import Any

from fastapi import APIRouter, Depends, Query

from app.api import supply_connectors
from app.api.supply_access import is_approver
from app.api.supply_call import run_supply
from app.api.supply_models import Items
from app.api.supply_work_items_models import NewWorkItem, SupplyWorkItem, WorkItemChange, WorkItemDecision, WorkItemEvent
from app.core.security import AuthenticatedUser, require_supply_reader, require_supply_tracker
from app.services.supply import work_items

router = APIRouter(prefix="/api/supply/work-items", tags=["supply"])
_run = partial(run_supply, missing=True)


def _store():
    # Resolved per call so a replaced connector service (tests) brings its own store.
    return supply_connectors.service.store


@router.get("", response_model=Items[SupplyWorkItem])
async def list_work_items(
    state: str = Query("live", max_length=16),
    subject_kind: str = Query("", max_length=16),
    subject_id: str = Query("", max_length=100),
    user: AuthenticatedUser = Depends(require_supply_reader),
) -> dict[str, Any]:
    """Work items, soonest recheck first: ``live`` (open or accepted), ``mine``, ``due`` or one state; optionally about one subject."""

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return {"items": work_items.listed(conn, role=user.role, actor=user.email, state=state, subject_kind=subject_kind, subject_id=subject_id)}

    return await _run(read)


@router.post("", status_code=201, response_model=SupplyWorkItem)
async def create_work_item(body: NewWorkItem, user: AuthenticatedUser = Depends(require_supply_tracker)) -> dict[str, Any]:
    def run() -> dict[str, Any]:
        with _store().connection() as conn:
            item = work_items.create(conn, **body.model_dump(), actor=user.email)
            return work_items.shown(conn, item, user.role)

    return await _run(run)


@router.patch("/{item_id}", response_model=SupplyWorkItem)
async def update_work_item(item_id: str, body: WorkItemChange, user: AuthenticatedUser = Depends(require_supply_tracker)) -> dict[str, Any]:
    def run() -> dict[str, Any]:
        recheck: date | None | str = None if body.clear_recheck else (body.recheck_on if body.recheck_on is not None else "unchanged")
        with _store().connection() as conn:
            item = work_items.update(conn, item_id, actor=user.email, approver=is_approver(user), title=body.title, action=body.action, owner=body.owner,
                                     recheck_on=recheck, note=body.note)
            return work_items.shown(conn, item, user.role)

    return await _run(run)


@router.post("/{item_id}/state", response_model=SupplyWorkItem)
async def decide_work_item(item_id: str, body: WorkItemDecision, user: AuthenticatedUser = Depends(require_supply_tracker)) -> dict[str, Any]:
    def run() -> dict[str, Any]:
        with _store().connection() as conn:
            item = work_items.decide(conn, item_id, body.state, actor=user.email, approver=is_approver(user), note=body.note)
            return work_items.shown(conn, item, user.role)

    return await _run(run)


@router.get("/{item_id}/history", response_model=Items[WorkItemEvent])
async def work_item_history(item_id: str, _user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return {"items": work_items.history(conn, item_id)}

    return await _run(read)
