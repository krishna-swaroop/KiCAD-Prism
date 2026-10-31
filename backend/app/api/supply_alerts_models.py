"""Request and response models for the alerts API (``supply_alerts``)."""

from __future__ import annotations

from typing import Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field

from app.api.supply_models import SupplyModel
from app.services.supply import alerts

SupplyAlertKind = Literal[
    "out_of_stock", "below_threshold", "lifecycle", "part_lost", "rupture_soon", "price_up", "pcn",
    "target_price_missed", "assessment_worse", "likely_out",
]
SupplyAlertState = Literal["open", "acknowledged", "snoozed", "resolved"]
Number = Union[int, float]


class AlertDetail(SupplyModel):
    """The facts behind an alert; which are present depends on its kind."""

    stock: Optional[Number] = None
    threshold: Optional[Number] = None
    lifecycle: Optional[str] = None
    problem: Optional[str] = None
    dropped: Optional[bool] = None
    days_to_zero: Optional[Number] = None
    chance: Optional[Number] = None
    weeks: Optional[Number] = None
    decrease_per_day: Optional[Number] = None
    confidence: Optional[str] = None
    change_percent: Optional[Number] = None
    was: Optional[str] = None
    now: Optional[str] = None
    currency: Optional[str] = None
    days: Optional[Number] = None
    version: Optional[Number] = None
    change_summary: Optional[str] = None
    price: Optional[str] = None
    target: Optional[str] = None
    was_status: Optional[str] = None
    to: Optional[str] = None
    title: Optional[str] = None
    kind: Optional[str] = None
    kind_label: Optional[str] = None
    last_time_buy: Optional[str] = None
    last_time_ship: Optional[str] = None
    soon: Optional[bool] = None
    description: Optional[str] = None
    new: Optional[Number] = None


class SupplyAlert(SupplyModel):
    id: int
    part_id: str
    mpn: str
    manufacturer: str
    kind: SupplyAlertKind
    severity: Literal["warning", "error", "fatal"]
    state: SupplyAlertState
    detail: AlertDetail
    opened_at: Optional[str]
    last_event_at: Optional[str]
    acknowledged_by: str
    snoozed_until: Optional[str]
    resolved_at: Optional[str]


class AlertRules(SupplyModel):
    muted: list[str]
    muting: list[str] = Field(description="Kinds someone asked QA to switch off; they still raise alerts until approved.")
    price_rise_percent: Optional[int]
    likely_out_percent: Optional[int] = Field(
        description="The chance of being out within four weeks that raises the likely-to-run-out alert; null is the default, 70.")
    target_price: Optional[str]
    target_currency: str


class PartAlertRules(AlertRules):
    """A part's rules, and the kinds that can be switched off."""

    mutable: list[str]


class SnoozeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hours: int = Field(ge=1, le=alerts.MAX_SNOOZE_HOURS)


class RulesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    muted: list[str] = Field(default_factory=list, max_length=20)
    price_rise_percent: int | None = None
    likely_out_percent: int | None = None
    target_price: str | None = Field(default=None, max_length=24)
    target_currency: str = Field(default="", max_length=3)
