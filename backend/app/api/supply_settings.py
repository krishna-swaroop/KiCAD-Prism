"""Supply settings API: what the assessment weighs, prices, alerts and spares (``supply/settings.py``).

Everyone who can read supply data sees the settings and the defaults. Changing them is for administrators.
"""

from __future__ import annotations

from functools import partial
from typing import Any

from fastapi import APIRouter, Depends

from app.api import supply_connectors
from app.api.supply_call import run_supply
from app.api.supply_models import Items
from app.api.supply_settings_models import (
    AssessmentSettingsBody, AssessmentSettingsView, MakerSpellingBody, SuffixBody, SupplyMakerGroup, SupplyNumberEnding,
)
from app.core.security import AuthenticatedUser, require_admin, require_supply_reader
from app.services.supply import fx, maker_seeds, number_suffixes
from app.services.supply import settings as workspace
from app.services.supply.assessment import settings as rules

router = APIRouter(prefix="/api/supply/settings", tags=["supply"])
_run = partial(run_supply, invalid="invalid_settings")


def _store():
    # Resolved per call so a replaced connector service (tests) brings its own store.
    return supply_connectors.service.store


def _currencies(conn, current: str) -> list[str]:
    """The currencies a workspace can cost in: the euro and every one Prism has a rate for, with the one chosen even without a rate."""

    return sorted({"EUR", current, *fx.latest(conn).per_eur})


def _view(conn, current: workspace.Settings) -> dict[str, Any]:
    return {
        "settings": workspace.to_dto(current),
        "defaults": workspace.to_dto(workspace.DEFAULTS),
        "checks": [{"id": check, "label": label, "area": rules.CHECK_AREA[check]} for check, label in rules.CHECK_LABELS.items()],
        "ranges": {"lead_time_days": list(rules.LEAD_TIME_RANGE), "last_buy_error_days": list(rules.LAST_BUY_ERROR_RANGE), "late_hours": list(rules.LATE_HOURS_RANGE),
                   "spares": list(workspace.SPARES_RANGE), "alert_price_rise_percent": list(workspace.ALERT_PRICE_RISE_RANGE),
                   "alert_likely_out_percent": list(workspace.ALERT_LIKELY_OUT_RANGE),
                   "price_quantity": list(workspace.PRICE_QUANTITY_RANGE)},
        "currencies": _currencies(conn, current.pricing.base_currency),
    }


@router.get("/makers", response_model=Items[SupplyMakerGroup])
async def get_makers(_user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return {"items": maker_seeds.groups(conn)}

    return await _run(read)


@router.post("/makers", status_code=201, response_model=Items[SupplyMakerGroup])
async def add_maker_spelling(body: MakerSpellingBody, admin: AuthenticatedUser = Depends(require_admin)) -> dict[str, Any]:
    def run() -> dict[str, Any]:
        with _store().connection() as conn:
            maker_seeds.add(conn, body.spelling, body.group_key, admin.email)
            return {"items": maker_seeds.groups(conn)}

    return await _run(run)


@router.delete("/makers/{alias_key}", status_code=204)
async def remove_maker_spelling(alias_key: str, admin: AuthenticatedUser = Depends(require_admin)) -> None:
    def run() -> None:
        with _store().connection() as conn:
            maker_seeds.remove(conn, alias_key, admin.email)

    await _run(run)


@router.get("/number-endings", response_model=Items[SupplyNumberEnding])
async def get_number_endings(_user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return {"items": number_suffixes.listing_all(conn)}

    return await _run(read)


@router.post("/number-endings", status_code=201, response_model=Items[SupplyNumberEnding])
async def add_number_ending(body: SuffixBody, admin: AuthenticatedUser = Depends(require_admin)) -> dict[str, Any]:
    def run() -> dict[str, Any]:
        with _store().connection() as conn:
            number_suffixes.add(conn, body.ending, body.kind, admin.email)
            return {"items": number_suffixes.listing_all(conn)}

    return await _run(run)


@router.delete("/number-endings/{key:path}", status_code=204)
async def remove_number_ending(key: str, admin: AuthenticatedUser = Depends(require_admin)) -> None:
    def run() -> None:
        with _store().connection() as conn:
            number_suffixes.remove(conn, key, admin.email)

    await _run(run)


@router.get("/assessment", response_model=AssessmentSettingsView)
async def get_assessment_settings(_user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return _view(conn, workspace.load(conn))

    return await _run(read)


@router.put("/assessment", response_model=AssessmentSettingsView)
async def put_assessment_settings(
    body: AssessmentSettingsBody, admin: AuthenticatedUser = Depends(require_admin)
) -> dict[str, Any]:
    def run() -> dict[str, Any]:
        with _store().connection() as conn:
            return _view(conn, workspace.save_form(conn, body.model_dump(), admin.email))

    return await _run(run)
