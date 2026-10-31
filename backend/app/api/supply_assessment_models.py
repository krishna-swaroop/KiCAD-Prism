"""Response models for a part's assessment and its waivers (``supply_assessment``)."""

from __future__ import annotations

from typing import Any, Literal, Optional, Union

from pydantic import Field

from app.api.supply_models import SupplyModel, SupplyStatus
from app.api.supply_settings_models import AssessmentSeverity


class SupplyWaiver(SupplyModel):
    id: str
    state: Literal["proposed", "approved"]
    reason: str
    proposed_by: str
    decided_by: Optional[str]
    holds: bool = Field(description="Approved for the condition the part has now.")
    outdated: bool = Field(description="Approved for a condition the part no longer has.")


class SupplyFinding(SupplyModel):
    check: str
    severity: AssessmentSeverity
    text: str
    scope: str
    waiver: Optional[SupplyWaiver]
    detail: dict[str, Any]


class SupplySubScore(SupplyModel):
    name: Literal["lifecycle", "sourcing", "inventory", "market", "compliance"]
    score: Union[int, float] = Field(description="1 is good, 5 is bad.")
    reasons: list[str]


class SupplyAssessment(SupplyModel):
    part_id: str
    health: Union[int, float]
    status: SupplyStatus
    need: Optional[int]
    findings: list[SupplyFinding]
    sub_scores: list[SupplySubScore]
    changes_at: Optional[str] = Field(description="When the clock alone changes the answer.")


class WaiverProposed(SupplyModel):
    id: str
    state: Literal["proposed", "approved"]
