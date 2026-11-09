"""Shared supply response models (ADR scripting-and-mcp §3.2, supply decision D4).

They describe the JSON supply routes already return. Every model allows extras,
so a key a model misses still reaches the client. ``scripts/export_supply_types.py``
writes the models supply routes declare as the frontend's TypeScript types.
"""

from __future__ import annotations

from typing import Generic, Literal, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


#: A part's status, best to worst; ``unknown`` until something that counts has been read.
SupplyStatus = Literal["ok", "warning", "error", "fatal", "unknown"]


class SupplyModel(BaseModel):
    model_config = ConfigDict(extra="allow")


class Items(SupplyModel, Generic[T]):
    """A list answer. Every supply list is ``{"items": [...]}``, so a field can join it later."""

    items: list[T]


class Page(Items[T], Generic[T]):
    """One page of a long list: ``total`` matches in all, and where the next page starts (null at the end)."""

    total: int
    limit: int
    offset: int
    next_offset: Optional[int]


class JobProgress(SupplyModel):
    """How far a supply job has got. Every supply job answers this shape (``progress.job_progress``)."""

    state: Literal["running", "done", "failed", "none"]
    done: int
    total: int
    failed: int
    reason: str


class PartStanding(SupplyModel):
    """How a part stands, the same fields wherever a part is shown: its status, why it has no stock when it should, the counted stock,
    its lifecycle and when the stock was read. A shape that shows a part derives from this, so the names and types cannot drift."""

    status: SupplyStatus
    problem: Optional[Literal["not_found", "gone"]] = Field(
        description="Why a part has no counted stock when it should: no distributor carries it, or every listing disappeared.")
    stock: Optional[int] = Field(description="The counted stock; null until something that counts has been read.")
    lifecycle: Literal["active", "nrnd", "last_time_buy", "obsolete", "unknown"]
    fetched_at: Optional[str] = Field(description="As old as the oldest read the stock rests on.")


class StoresState(SupplyModel):
    """What the stores hold of a component: the same four states on every screen."""

    state: Literal["stock", "none", "not_connected", "down"]
    available: Optional[float] = Field(description="Usable now (OK, at our locations, less allocated); null when none is held or units are mixed.")
    since: Optional[str] = Field(description="The last good read of a feed that is down.")


class DecisionState(SupplyModel):
    """A decision someone asked for: an approver's stands (``approved``), anyone else's waits for one (``proposed``)."""

    id: str
    state: Literal["approved", "proposed"]
