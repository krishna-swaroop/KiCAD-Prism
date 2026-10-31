"""Alerts.

Everyone who reads supply data sees them. Acknowledging or snoozing an alert needs
write access (admin, designer). Alerts are in-app only; nothing is sent anywhere.
"""

from __future__ import annotations

from functools import partial
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query, Response

from app.api import supply_connectors
from app.api.supply_access import is_approver, require_supply_editor
from app.api.supply_alerts_models import AlertRules, PartAlertRules, RulesRequest, SnoozeRequest, SupplyAlert
from app.api.supply_call import run_supply
from app.api.supply_models import Items
from app.core.security import AuthenticatedUser, require_supply_approver, require_supply_reader, require_supply_writer
from app.services.supply import alert_rules, alerts, clock

router = APIRouter(prefix="/api/supply", tags=["supply"])
_run = partial(run_supply, invalid="decided", invalid_status=409, missing=True)


def _store():
    # Resolved per call so a replaced connector service (tests) brings its own store.
    return supply_connectors.service.store


@router.get("/alerts", response_model=Items[SupplyAlert], response_model_exclude_unset=True)
async def list_alerts(
    include_resolved: bool = Query(default=False),
    _user: AuthenticatedUser = Depends(require_supply_reader),
) -> dict[str, Any]:
    def read() -> dict[str, Any]:
        now = clock.now()
        with _store().connection() as conn:
            return {"items": alerts.list_alerts(conn, now, include_resolved=include_resolved)}

    return await _run(read)


@router.post("/alerts/{alert_id}/acknowledge", status_code=204)
async def acknowledge_alert(alert_id: int, writer: AuthenticatedUser = Depends(require_supply_writer)) -> Response:
    def run() -> None:
        with _store().connection() as conn:
            alerts.acknowledge(conn, alert_id, writer.email, clock.now())

    await _run(run)
    return Response(status_code=204)


@router.post("/alerts/{alert_id}/snooze", status_code=204)
async def snooze_alert(
    alert_id: int, body: SnoozeRequest, writer: AuthenticatedUser = Depends(require_supply_writer)
) -> Response:
    def run() -> None:
        with _store().connection() as conn:
            alerts.snooze(conn, alert_id, body.hours, writer.email, clock.now())

    await _run(run)
    return Response(status_code=204)


@router.get("/parts/{part_id}/alert-rules", response_model=PartAlertRules)
async def get_alert_rules(part_id: str, _user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    """Which alerts are muted for the part, the price rise that matters and its target price."""

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return alert_rules.get(conn, part_id).to_dto() | {"mutable": list(alert_rules.MUTABLE)}

    return await _run(read)


@router.put("/parts/{part_id}/alert-rules", response_model=AlertRules)
async def put_alert_rules(part_id: str, body: RulesRequest, editor: AuthenticatedUser = Depends(require_supply_editor)) -> dict[str, Any]:
    """Switching an alert off is an approver's; anyone else's waits in To approve (``muting``)."""

    def run() -> dict[str, Any]:
        with _store().connection() as conn:
            return alert_rules.save(conn, part_id, body.model_dump(), editor.email, approver=is_approver(editor)).to_dto()

    return await _run(run)


@router.post("/mutes/{decision_id}/{verdict}", status_code=204)
async def decide_mute(decision_id: str, verdict: Literal["approve", "reject"], approver: AuthenticatedUser = Depends(require_supply_approver)) -> Response:
    def run() -> None:
        with _store().connection() as conn:
            alert_rules.decide_mute(conn, decision_id, approver.email, approve=verdict == "approve")

    await _run(run)
    return Response(status_code=204)
