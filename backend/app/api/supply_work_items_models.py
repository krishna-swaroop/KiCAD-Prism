"""Request and response models for the work items API (``supply_work_items``)."""

from __future__ import annotations

from datetime import date
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.api.supply_models import SupplyModel
from app.services.supply import work_items

WorkItemAction = Literal["investigate", "alternate", "not_for_new_designs", "retire", "replace", "last_time_buy", "other"]
WorkItemState = Literal["open", "accepted", "rejected", "done"]
WorkItemSubject = Literal["component", "part"]


class NewWorkItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject_kind: WorkItemSubject
    subject_id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=work_items.MAX_TITLE)
    action: WorkItemAction
    owner: str = Field(default="", max_length=200)
    note: str = Field(default="", max_length=work_items.MAX_NOTE)
    recheck_on: Optional[date] = None


class WorkItemChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Optional[str] = Field(default=None, max_length=work_items.MAX_TITLE)
    action: Optional[WorkItemAction] = None
    owner: Optional[str] = Field(default=None, max_length=200)
    recheck_on: Optional[date] = None
    clear_recheck: bool = False
    note: str = Field(default="", max_length=work_items.MAX_NOTE)


class WorkItemDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state: WorkItemState
    note: str = Field(default="", max_length=work_items.MAX_NOTE)


class WorkItemEvidence(SupplyModel):
    text: str
    by: str
    at: str


class WorkItemProject(SupplyModel):
    project_id: str
    name: str


class SupplyWorkItem(SupplyModel):
    """An engineering decision about a component or a part: what is proposed, who owns it, the evidence, the projects it
    touches (as the caller may see them), QA's disposition and when to look again."""

    id: str
    subject_kind: WorkItemSubject
    subject_id: str
    subject_name: str
    title: str
    action: WorkItemAction
    owner: str
    state: WorkItemState
    evidence: list[WorkItemEvidence]
    projects: list[WorkItemProject]
    recheck_on: Optional[str]
    created_by: str
    created_at: str
    updated_at: str


class WorkItemEvent(SupplyModel):
    """One change in a work item's history."""

    at: str
    actor: str
    action: str
    detail: dict[str, Any]
