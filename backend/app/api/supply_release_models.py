"""Response models for a project's supply page and its release checks (``supply_release``)."""

from __future__ import annotations

from typing import Literal, Optional, Union

from pydantic import Field

from app.api.supply_bom_models import SupplyBomAlternate, SupplyBomComment, SupplyBomRollup
from app.api.supply_models import StoresState, SupplyModel, SupplyStatus
from app.api.supply_parts_models import SupplyLifecycle, SupplyPartRow, SupplyPartsPage
from app.api.supply_settings_models import AssessmentSeverity

Number = Union[int, float]
LineState = Literal["no_mpn", "unknown", "ambiguous", "tracked"]


# --- the project's page -----------------------------------------------------------


class ProjectSupplyPart(SupplyModel):
    """One line of a project's stored BOM, as the project's Supply tab lists it."""

    key: str
    manufacturer: str
    mpn: str
    quantity: int
    references: str
    part_id: Optional[str]
    state: LineState
    status: Optional[SupplyStatus]
    stock: Optional[int]
    lifecycle: Optional[SupplyLifecycle]
    short: bool
    unit_price: Optional[str] = Field(description="In the offer's currency, unit_currency.")
    unit_currency: Optional[str]
    unit_price_in_total: Optional[str] = Field(description="The unit price in the total's currency; null when it cannot be converted.")
    buy_quantity: Optional[int] = Field(description="Pieces the line's purchase buys: the need rounded to the offer's minimum and multiple.")
    test_data: bool
    notes: int
    need: Optional[int] = Field(description="Pieces the build needs, spares included.")
    line_cost: Optional[str] = Field(description="What the line costs for the build, in the total's currency; null when bought with another line or not priced.")
    alerts: int = Field(description="Open alerts on the part.")
    prism_id: str = Field(description="The catalog component the symbol places; empty when none.")
    in_library: Optional[bool]
    alternates: list[SupplyBomAlternate]
    status_from: Optional[str]
    stores: Optional[StoresState]


class ProjectCostPoint(SupplyModel):
    boards: int
    cost_per_board: Optional[str]
    cost_build: Optional[str]
    currency: Optional[str]
    short: int = Field(description="Parts the stock cannot cover at this size.")
    lines_priced: int
    lines: int


class MoneyLine(SupplyModel):
    key: str
    part_id: Optional[str]
    mpn: str
    manufacturer: str
    cost: str
    share: float


class MoneyOther(SupplyModel):
    count: int
    cost: str
    share: float


class ProjectMoney(SupplyModel):
    """The lines that cost the most for the build, with their share, and what all the others cost."""

    lines: list[MoneyLine]
    other: MoneyOther
    total: str


class CostDay(SupplyModel):
    day: str
    cost_per_board: str
    currency: str
    boards: int


class ChangedPart(SupplyModel):
    part_id: str
    manufacturer: str
    mpn: str
    was: Optional[SupplyStatus]
    now: SupplyStatus


class ProjectSupplyRelease(SupplyModel):
    build_id: str
    tag: str
    created_at: str
    health: Optional[float]
    status: SupplyStatus
    parts: int
    needing_a_look: int
    changed_since: list[ChangedPart] = Field(description="Parts that were fine when it was published and are not today.")


class ProjectSupply(SupplyModel):
    """How a project stands in supply, from its stored BOM. Without a BOM read, only ``available``, the variants, releases and notes."""

    available: bool
    variant: str
    variants: list[str]
    build_quantity: Optional[int] = Field(default=None, description="The boards the page is worked out for.")
    usual_build: Optional[int] = Field(default=None, description="The tracked project's usual build; null when it is not tracked.")
    attrition_percent: Optional[float] = Field(default=None, description="The spares, in percent; null is by kind of part.")
    usual_spares: Optional[str] = Field(default=None, description="The tracked project's own spares: auto or a percent.")
    rollup: Optional[SupplyBomRollup] = None
    parts: Optional[list[ProjectSupplyPart]] = None
    cost_curve: Optional[list[ProjectCostPoint]] = Field(default=None, description="The cost at 1 to 10,000 boards and the chosen size.")
    money: Optional[ProjectMoney] = None
    cost_history: Optional[list[CostDay]] = Field(default=None, description="The cost of one board a day, oldest first.")
    cost_history_left_out: Optional[list[CostDay]] = Field(default=None, description="The days left out because one price was read wrong.")
    releases: list[ProjectSupplyRelease]
    notes: list[SupplyBomComment]


class ProjectChip(SupplyModel):
    key: Literal["unchecked", "out", "short", "limiting", "not_priced", "end_of_life", "alerts"]
    count: int


class ProjectPartRow(SupplyPartRow):
    line: Optional[ProjectSupplyPart] = Field(description="The part's BOM lines, merged.")


class ProjectPartsPage(SupplyPartsPage):
    """A project's parts, a page at a time, each with its BOM lines; the chips count over the whole project."""

    items: list[ProjectPartRow]
    unmatched: list[ProjectSupplyPart] = Field(description="Lines no part matches; on the first page only.")
    chips: list[ProjectChip]


# --- release checks ------------------------------------------------------------------


class ReleaseFinding(SupplyModel):
    check: str
    severity: AssessmentSeverity
    text: str


class ReleaseCheckLine(SupplyModel):
    manufacturer: str
    mpn: str
    quantity: int
    state: LineState
    part_id: Optional[str]
    health: Optional[Number]
    status: Optional[SupplyStatus]
    findings: list[ReleaseFinding]
    waived: int
    alternates: list[str] = Field(description="The approved alternates the line may be built with.")
    status_from: Optional[str] = Field(description="The alternate the status is told by, when it is better than the line's own part.")


class ReleaseAssessment(SupplyModel):
    health: Optional[Number]
    status: SupplyStatus
    parts: int
    tracked: int
    not_tracked: int
    needing_a_look: int
    attention: list[ReleaseCheckLine]
    lines: list[ReleaseCheckLine]
    without_number: int = Field(description="Rows of the BOM that name no part number, which the check cannot look at.")


class ReleaseCheckResult(ReleaseAssessment):
    available: Literal[True]


class ReleaseCheckUnavailable(SupplyModel):
    available: Literal[False]
    reason: str


ReleaseCheck = Union[ReleaseCheckResult, ReleaseCheckUnavailable]


class ReleaseBomKept(SupplyModel):
    stored: bool
    parts: int
    without_number: int


class DraftPart(SupplyModel):
    manufacturer: str
    mpn: str
    quantity: int
    references: str
    rohs: str
    reach: str
    on_candidate_list: list[str]
    gaps: list[str]
    exemptions: list[str]
    rohs_stated: str
    reach_stated: str
    svhc_stated: str


class DraftSummary(SupplyModel):
    parts: int
    with_gaps: int
    rohs_unknown: int
    reach_unknown: int
    candidate_list_loaded: bool
    note: str


class ComplianceDraft(SupplyModel):
    """The draft RoHS and REACH declaration of a BOM: a working document, not a declaration."""

    parts: list[DraftPart]
    summary: DraftSummary


class ReleaseCompliance(SupplyModel):
    tag: str
    created_at: str
    draft: ComplianceDraft


class ReleaseSnapshot(SupplyModel):
    """The supply check frozen when a release was published."""

    id: str
    project_id: str
    build_id: str
    tag: str
    commit_sha: str
    created_by: str
    created_at: str
    health: Optional[float]
    status: SupplyStatus
    assessment: ReleaseAssessment
    compliance: Optional[ComplianceDraft]
