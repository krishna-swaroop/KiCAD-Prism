"""Request and response models for the ending parts API (``supply_ending``)."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.api.supply_models import PartStanding, SupplyModel
from app.services.supply import ending_parts

RestrictionLevel = Literal["not_for_new_designs", "retired"]


class RestrictionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    level: RestrictionLevel
    reason: str = Field(default="", max_length=ending_parts.MAX_REASON)
    replacement_component_id: str = Field(default="", max_length=100, description="The component that takes its place, when there is one.")


class DismissIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reasons: list[str] = Field(min_length=1, max_length=10, description="The reason kinds shown when it was dismissed; a new one brings it back.")


class ComponentRestriction(SupplyModel):
    level: RestrictionLevel
    reason: str
    replacement_component_id: Optional[str]
    set_by: str
    set_at: str


class EndingComponent(SupplyModel):
    id: str
    name: str
    mpn: str
    manufacturer: str
    stage: str


class EndingReason(SupplyModel):
    kind: str
    text: str
    source: str


class LastBuy(SupplyModel):
    source: str
    value: str


class EndingProject(SupplyModel):
    project_id: str
    name: str
    quantity: int


class EndingPart(PartStanding):
    component: EndingComponent
    part_id: str
    reasons: list[EndingReason]
    last_buy: list[LastBuy]
    projects: list[EndingProject]
    restriction: Optional[ComponentRestriction]
    dismissed: bool = Field(description="Someone dismissed it for the reasons it has now.")
    dismissal_waiting: bool = Field(description="Someone asked QA to dismiss it for the reasons it has now.")
    role: Literal["main", "alternate"] = Field(description="Whether the ending part is the component's main part or an approved alternate.")
    healthy: int = Field(description="The component's other approved parts that are not ending; retiring is offered only when none is left.")


class EndingParts(SupplyModel):
    """Components whose part is ending, worst first."""

    items: list[EndingPart]
    tracked: int
    more: int = Field(description="Ending parts beyond the ones listed.")
