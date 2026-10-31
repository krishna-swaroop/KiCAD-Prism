"""Request and response models for the tracking API (``supply_tracking``): projects, parts and components Prism follows, and the
call budget, room and schedule that tracking spends."""

from __future__ import annotations

from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field

from app.api.supply_checks_models import SkippedLine
from app.api.supply_connectors_models import QuoteCoverage
from app.api.supply_models import JobProgress, SupplyModel
from app.api.supply_parts_models import PartTracking, WatchPackaging
from app.services.supply import usage

Number = Union[int, float]
ProjectPackaging = Literal["cut_tape", "custom_reel", "tape_reel", "tube_tray", "smallest"]


# --- requests -------------------------------------------------------------------


class ProjectIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    variants: list[str] = Field(default_factory=lambda: [""], max_length=usage.MAX_VARIANTS + 1,
                                description="The designs to follow: '' is the base design, the rest are named variants.")
    connector_ids: Optional[list[str]] = Field(default=None, max_length=50,
                                               description="The distributors the project is bought from; null means all but the assembly-only ones.")
    all_variants: bool = Field(default=False, description="Follow every design the project has, also those it gets later; variants is then ignored.")
    packaging: ProjectPackaging = Field(default="cut_tape", description="The packaging the project prefers: decides which listing is followed.")
    build_quantity: Optional[int] = Field(default=None, ge=1, le=1_000_000,
                                          description="The usual build, in boards. Null keeps the one it has (100 for a new project).")
    spares: Optional[str] = Field(default=None, max_length=12,
                                  description='What the cost is worked out with: "" the workspace setting, "auto" by package, or a percent. Null keeps it.')


class BuildIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    build_quantity: int = Field(ge=1, le=1_000_000)


class LineChoiceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    part_id: str = Field(min_length=1, max_length=64)
    manufacturer: str = Field(min_length=1, max_length=200)


class FollowIn(BaseModel):
    """How a part is followed. Only the fields sent change; a tier sent without a rate is weekly; a null threshold clears it."""

    model_config = ConfigDict(extra="forbid")

    tier: Optional[int] = None
    rate: Optional[str] = None
    threshold: Optional[int] = Field(default=None, ge=0)
    pinned: Optional[bool] = None
    packaging: Optional[WatchPackaging] = None

    def changes(self) -> dict[str, Any]:
        sent = self.model_fields_set
        found: dict[str, Any] = {name: getattr(self, name) for name in ("tier", "rate", "pinned", "packaging") if name in sent and getattr(self, name) is not None}
        if "tier" in found and "rate" not in found:
            found["rate"] = "weekly"
        if "threshold" in sent:
            found["threshold"] = self.threshold
        return found


class FollowNumberIn(FollowIn):
    manufacturer: str = Field(default="", max_length=120)
    mpn: str = Field(min_length=1, max_length=100)


class ComponentFollowIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    packaging: WatchPackaging = "any"
    tier: int = 2
    rate: str = "weekly"


class ScheduleIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    spare: dict[str, bool]


# --- projects -------------------------------------------------------------------


class TrackedProject(SupplyModel):
    project_id: str
    variants: list[str]
    all_variants: bool
    packaging: ProjectPackaging
    build_quantity: int
    spares: Optional[str]
    connector_ids: Optional[list[str]]
    tracked_by: str
    tracked_at: str


class ProjectTrackingState(SupplyModel):
    tracked: Optional[TrackedProject]
    has_usage: bool
    variants: list[str]


class LineCandidate(SupplyModel):
    part_id: str
    manufacturer: str


class TrackLine(SupplyModel):
    """A BOM line whose number several makers share: pick the part it means."""

    mpn: str
    manufacturer: str
    candidates: list[LineCandidate]


class SupplyChoiceOption(SupplyModel):
    key: str
    spelling: str
    spellings: list[str]
    connectors: list[str]
    listings: int


class SupplyChoice(SupplyModel):
    part_id: str
    mpn: str
    manufacturer: str
    kind: Literal["maker", "unlisted", "number"]
    options: list[SupplyChoiceOption]


class ProjectOpen(SupplyModel):
    """What a tracked project waits on a person for."""

    choices: list[SupplyChoice]
    lines: list[TrackLine]


class ConnectorSearches(SupplyModel):
    connector_id: str
    name: str
    total: int
    done: int


class TrackProgress(JobProgress):
    """How far the first searches of a project's parts have got, per distributor."""

    parts: int
    connectors: list[ConnectorSearches]


class BomRead(JobProgress):
    changed: Optional[bool] = Field(default=None, description="When done: whether the project's parts differ from before.")


class UsualBuild(SupplyModel):
    project_id: str
    build_quantity: int


class TierShare(SupplyModel):
    calls: int
    parts: int


class BudgetShare(SupplyModel):
    """One connector's committed share, and what a change adds to it."""

    connector_id: str
    name: str
    account: str
    capacity: int
    committed: int
    free: int
    by_tier: dict[str, TierShare] = Field(description="Committed calls a day and parts admitted, for tier 1 and tier 2.")
    admitted: int
    waiting: int
    adds_calls: Optional[int] = None
    admitted_new: Optional[int] = None
    waiting_new: Optional[int] = None


class SkippedProjectLine(SkippedLine):
    """A BOM line tracking left out: not in the library, or a number several makers share (with the parts it could mean)."""

    manufacturer: Optional[str] = None
    candidates: Optional[list[LineCandidate]] = None


class ProjectTracked(SupplyModel):
    project_id: str
    variants: list[str]
    parts_created: int
    skipped: list[SkippedProjectLine]


class TrackingPreview(SupplyModel):
    connectors: list[BudgetShare]
    fits_nowhere: bool = Field(description="Nothing the change adds fits at any connector.")


class ProjectTrackingPreview(TrackingPreview):
    tracked: ProjectTracked


# --- parts and components -------------------------------------------------------


class SupplyWatch(SupplyModel):
    part_id: str
    manufacturer: str
    mpn: str
    tier: Literal[1, 2]
    rate: Literal["daily", "weekly", "monthly"]
    threshold: Optional[int]
    pinned: bool
    packaging: WatchPackaging
    owner: str


class PartTrackingState(SupplyModel):
    tier: Optional[PartTracking]
    waiting_at: list[str] = Field(description="Connectors where the part waits for room.")
    watch: Optional[SupplyWatch]


class PartFollowed(TrackingPreview):
    tier: Optional[PartTracking]
    watch: Optional[SupplyWatch]


class NumberFollowed(SupplyModel):
    watch: SupplyWatch
    tier: Optional[PartTracking]


class SupplyComponentWatch(SupplyModel):
    component_id: str
    packaging: WatchPackaging
    tier: int
    rate: str
    owner: str


class ComponentFollow(SupplyModel):
    watch: Optional[SupplyComponentWatch]


# --- budget, room and schedule --------------------------------------------------


class Spent(SupplyModel):
    capacity: int
    spent: int


class FreeNow(SupplyModel):
    """What scheduled work still needs before the reset, what is kept for people, and what is free to spend now."""

    scheduled: int
    kept_for_people: int
    free: int


class BudgetCall(SupplyModel):
    hour: Optional[int] = None
    day: Optional[str] = None
    kind: Optional[str] = None
    purpose: str
    calls: int


class BudgetNotices(SupplyModel):
    """The change-notice quota of a provider that keeps one apart from its product calls (DigiKey)."""

    limit: int
    used: int
    parts: int
    interval_days: Number
    per_day: Number


class BudgetLibrary(SupplyModel):
    """Matching the library's parts nothing follows, from spare budget."""

    total: int
    found: int
    not_found: int
    waiting: int = Field(description="Parts due a search here now.")
    calls_a_day: Number
    days_left: Optional[Number] = Field(description="Null when no spare calls are expected.")


class ProjectCalls(SupplyModel):
    project_id: str
    project_name: str
    calls_a_day: Number


class PartCalls(SupplyModel):
    part_id: str
    mpn: str
    manufacturer: str
    tier: int
    calls_a_day: Number
    pick_saves: Number


class BudgetOwners(SupplyModel):
    projects: list[ProjectCalls]
    parts: list[PartCalls]


class BudgetConnector(SupplyModel):
    """Where a connector's call budget goes, today and over two weeks, and what tracking costs."""

    connector_id: str
    name: str
    provider: str
    enabled: bool
    shares_account: bool
    day: str
    reset_in_seconds: int
    daily_budget: int
    committed: Spent
    pool: Spent
    spare_spent: int
    free: FreeNow
    spent: int
    refused_today: int
    tracking: Optional[BudgetShare]
    hourly: list[BudgetCall]
    days: list[BudgetCall]
    notices: Optional[BudgetNotices]
    library: Optional[BudgetLibrary]
    owners: BudgetOwners
    searches_pending: int = Field(description="Tracked parts admitted here and not searched for yet.")
    quotes: QuoteCoverage = Field(description="Of the tracked parts admitted here, how many this connector gives a price for.")


class RoomFigure(SupplyModel):
    room: int
    limited_by: str


class RoomHeadline(SupplyModel):
    """The distributor that fills first, among those every part is read at."""

    daily: Optional[RoomFigure]
    weekly: Optional[RoomFigure]


class ExpectedSpend(SupplyModel):
    """What tracking was expected to spend on the provider's previous day, and what it spent (null when nothing was counted)."""

    expected: Number
    spent: Optional[Number]


class AccountRoom(SupplyModel):
    daily: Optional[int]
    weekly: Optional[int]


class TrackingRoomAccount(SupplyModel):
    connector_ids: list[str]
    name: str
    assembly_only: bool
    capacity: int
    free: int
    waiting: int
    searched: int
    carried_percent: Number
    estimated_per_day: Number
    measured_per_day: Optional[Number]
    factor: Number
    by_tier: dict[str, TierShare] = Field(description="Calls a day committed to each tier, and the parts admitted.")
    yesterday: ExpectedSpend
    room: AccountRoom


class TrackingRoom(SupplyModel):
    """How many more typical parts tracking has room for, per distributor and overall."""

    headline: RoomHeadline
    accounts: list[TrackingRoomAccount]


class SpareWork(SupplyModel):
    waiting: bool
    tier2_early: bool
    notices: bool
    library: bool


class ScheduleSettings(SupplyModel):
    """Which spare work is on. Spare budget is the calls nothing else needs, at any hour."""

    spare: SpareWork
