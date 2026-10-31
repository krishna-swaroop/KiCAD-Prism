"""Request and response models for the change notices API (``supply_pcn``)."""

from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.api.supply_models import SupplyModel
from app.services.supply import pcn

SupplyNoticeKind = Literal["end_of_life", "nrnd", "last_time_buy", "change"]


class NoticePart(BaseModel):
    model_config = ConfigDict(extra="forbid")

    manufacturer: str = Field(min_length=1, max_length=120)
    mpn: str = Field(min_length=1, max_length=100)


class NoticeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=pcn.MAX_TITLE)
    kind: str
    parts: list[NoticePart] = Field(min_length=1, max_length=pcn.MAX_PARTS)
    notice_url: str = Field(default="", max_length=500)
    last_time_buy: Optional[date] = None
    last_time_ship: Optional[date] = None
    notes: str = Field(default="", max_length=pcn.MAX_NOTES)


class SupplyNotice(SupplyModel):
    id: str
    title: str
    kind: SupplyNoticeKind
    kind_label: str
    notice_url: str
    last_time_buy: Optional[str]
    last_time_ship: Optional[str]
    notes: str
    state: Literal["open", "closed"]
    created_by: str
    created_at: str
    parts: int
    source: str = Field(description='"manual" when a person entered it, else the distributor it was read from.')
    source_label: str
    published_on: Optional[str] = Field(description="The date the distributor gives for the notice.")


class NoticeAdded(SupplyModel):
    id: str


class ConnectorProblem(SupplyModel):
    connector: str
    reason: str


class SupplyNoticeCheck(SupplyModel):
    read: int
    new: int
    connectors: int
    problems: list[ConnectorProblem]


class SubstitutesAsked(SupplyModel):
    asked: int
    found: int
    resolved: int
    problems: list[ConnectorProblem]
