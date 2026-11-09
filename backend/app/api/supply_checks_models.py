"""Request and response models for the one-off checks API (``supply_checks``)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.api.supply_models import JobProgress, SupplyModel
from app.services.supply import oneoff


class CheckLine(BaseModel):
    model_config = ConfigDict(extra="forbid")

    manufacturer: str = Field(default="", max_length=200)
    mpn: str = Field(default="", max_length=200)


class NewCheck(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["bom", "component"]
    project_id: str = Field(default="", max_length=120)
    lines: list[CheckLine] = Field(max_length=oneoff.MAX_PARTS * 2)


class CheckProgress(JobProgress):
    id: str
    kind: Literal["bom", "component"]
    project_id: str
    created_at: str


class SkippedLine(SupplyModel):
    mpn: str
    reason: str


class CheckStarted(SupplyModel):
    id: str
    parts: int
    already_tracked: int
    skipped: list[SkippedLine]
    progress: CheckProgress
