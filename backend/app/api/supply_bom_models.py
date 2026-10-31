"""Request and response models for the BOM lookup API (``supply_bom``) and BOM notes (``supply_bom_comments``)."""

from __future__ import annotations

from typing import Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field

from app.api.supply_ending_models import RestrictionLevel
from app.api.supply_models import StoresState, SupplyModel, SupplyStatus
from app.api.supply_parts_models import JlcClass, SupplyLifecycle
from app.api.supply_tracking_models import BudgetShare, TrackingPreview
from app.services.supply import bom_comments, bom_lookup

Number = Union[int, float]

MAX_STATUS_COMPONENTS = 200
# An uploaded BOM is at most 2 MB, the limit the upload form states.
SHEET_MAX_BYTES = 2 * 1024 * 1024


class LineIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1, max_length=200)
    manufacturer: str = Field(default="", max_length=200)
    mpn: str = Field(default="", max_length=200)
    # Fitted parts per board. A line with none fitted is not sent.
    quantity: int = Field(default=1, ge=1, le=100_000)
    # The catalog component placed on the symbol. When the catalog knows it, its manufacturer and part number win.
    prism_id: str = Field(default="", max_length=100)
    # The LCSC number on the symbol, such as C7950.
    lcsc: str = Field(default="", max_length=14, pattern=r"^(C\d{1,12})?$")
    # The symbol's value and the footprint's name, checked against the distributor's value and package.
    value: str = Field(default="", max_length=60)
    footprint: str = Field(default="", max_length=200)


class LookupRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The project the BOM is from: left out, the build and spares are its usual ones (one board, the workspace's spares, when it
    # is not tracked or there is no project).
    project_id: str = Field(default="", max_length=200)
    build_quantity: int | None = Field(default=None, ge=1, le=1_000_000)
    # Spares on top of what the boards use, as a percentage of the quantity.
    # Null asks for spares by kind of part (small passives get some, the rest none).
    attrition_percent: float | None = Field(default=0, ge=0, le=100)
    lines: list[LineIn] = Field(max_length=bom_lookup.MAX_LINES)


class WatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lines: list[LineIn] = Field(max_length=bom_lookup.MAX_WATCH_LINES)
    # Tier 1 is read daily; tier 2 weekly or monthly. A part already followed is only ever raised.
    tier: int = Field(default=2, ge=1, le=2)
    rate: str = Field(default="weekly", pattern="^(weekly|monthly)$")


class StatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Catalog components by id; the key of each line is the component id.
    components: list[LineIn] = Field(max_length=MAX_STATUS_COMPONENTS)


class SheetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    xlsx_base64: str = Field(min_length=1, max_length=SHEET_MAX_BYTES * 4 // 3 + 16)


class CommentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    line_key: str = Field(min_length=1, max_length=bom_comments.MAX_KEY)
    body: str = Field(min_length=1, max_length=bom_comments.MAX_BODY)


# --- usage ------------------------------------------------------------------------


class UsageRefreshed(SupplyModel):
    """Projects whose BOM usage was read again, left as it was, without a semantic index, and removed."""

    updated: int
    unchanged: int
    without_index: int
    removed: int


class UsageBuild(SupplyModel):
    projects: int
    missing: int = Field(description="Projects without a semantic index.")
    queued: int


# --- standing ----------------------------------------------------------------------



class SupplyComponentStanding(SupplyModel):
    """Where a catalog component stands, for the catalog table."""

    status: SupplyStatus
    stock: Optional[int] = Field(description="What the distributors hold, summed.")
    watched: bool
    unit_price: Optional[str] = Field(description="The main part's headline unit price at the distributors.")
    currency: str
    test_data: Optional[bool] = Field(default=None, description="From a simulated connector: test data, marked wherever it shows.")
    restriction: Optional[RestrictionLevel]
    local_available: Optional[float] = Field(
        default=None, description="Usable stores stock; absent when the stores hold none, null when units are mixed.")
    stores: Optional[StoresState] = None


class ComponentStandings(SupplyModel):
    items: dict[str, SupplyComponentStanding] = Field(description="By component id.")


# --- lookup ------------------------------------------------------------------------


class NextBreak(SupplyModel):
    quantity: int
    unit_price: str
    extra: str = Field(description="What buying that many costs in total against the order; negative is cheaper.")


class SupplyBomBuy(SupplyModel):
    quantity: int = Field(description="What must be ordered: the need rounded up to the minimum order and multiples.")
    unit_price: str
    currency: str
    extended: str
    in_base: Optional[str] = Field(description="The extended price in the workspace's currency, when it can be told.")
    covers: bool = Field(description="False when no offer holds enough stock; the cheapest is shown anyway.")
    connector_name: str
    provider: str
    test_data: bool
    sku: str
    product_url: str
    waste: int = Field(description="Pieces bought beyond the need, because of the smallest order and its multiples.")
    waste_cost: str
    next_break: Optional[NextBreak]
    part_id: Optional[str] = Field(description="The part bought: the line's own, or the approved alternate whose offer won.")


class SupplyBomAlternate(SupplyModel):
    """An approved alternate of a line's component. Its stock and offers count for the line."""

    part_id: str
    manufacturer: str
    mpn: str
    stock: Optional[int]
    status: SupplyStatus


class PreferredStanding(SupplyModel):
    """The distributor a person prefers for a part, and what it holds."""

    connector_id: str
    connector_name: str
    provider: str
    stock: int


class LineAssessment(SupplyModel):
    health: Number
    status: SupplyStatus
    open: int = Field(description="Findings that still count.")
    checks: list[str]


class SupplyBomLineResult(SupplyModel):
    """One line of a lookup. A line without a part has only the first fields."""

    state: Literal["no_mpn", "unknown", "ambiguous", "tracked"]
    part_id: Optional[str]
    manufacturer_match: Optional[Literal["exact", "missing", "unmatched", "lcsc"]] = Field(
        description="How the manufacturer matched: missing and unmatched mean the part number alone found it; lcsc the symbol's LCSC number.")
    in_library: Optional[bool] = Field(description="Whether a catalog component has the line; null for a line without a part number.")
    need: int
    stores: Optional[StoresState] = Field(description="The stores state of the line's catalog component.")
    watched: Optional[bool] = None
    jlc: Optional[JlcClass] = None
    status: Optional[SupplyStatus] = None
    problem: Optional[Literal["not_found", "gone"]] = None
    status_from: Optional[str] = Field(default=None, description="The alternate the status is told by, when it is better than the line's own part.")
    alternates: Optional[list[SupplyBomAlternate]] = None
    stock: Optional[int] = None
    lifecycle: Optional[SupplyLifecycle] = None
    lead_time_days: Optional[int] = None
    fetched_at: Optional[str] = None
    part_need: Optional[int] = Field(default=None, description="What the whole part needs when it is on several lines.")
    usable: Optional[int] = Field(default=None, description="Distributor stock plus available stores stock.")
    short: Optional[bool] = None
    buy: Optional[SupplyBomBuy] = None
    bought_with: Optional[str] = Field(default=None, description="On the later lines of a part: the key of the line that carries the purchase.")
    preferred: Optional[PreferredStanding] = None
    assessment: Optional[LineAssessment] = None


class SupplyBomRollup(SupplyModel):
    lines: int
    tracked: int
    not_tracked: int
    watched: int
    at_risk: int = Field(description="Parts whose status is error or fatal.")
    needs_a_look: int
    short: int
    priced: int
    lines_priced: int = Field(description="How many lines the cost covers.")
    currency: Optional[str]
    converted: bool
    test_data: bool
    rates_day: Optional[str]
    cost_build: Optional[str]
    original_costs: dict[str, str] = Field(description="Before conversion, per currency; empty when nothing was converted.")
    waste_cost: Optional[str]
    cost_per_board: Optional[str]
    can_build: Optional[int]
    limited_by: Optional[str]
    without_stock_data: int
    parts: int
    health: Optional[Number] = Field(description="0 to 10, weighted by units needed; null when nothing has data.")
    health_status: SupplyStatus


class SupplyBomLookup(SupplyModel):
    build_quantity: int
    attrition_percent: Optional[float] = Field(description="The spares it priced with, a percent; null is by kind of part.")
    attrition_by_part: Optional[dict[str, float]]
    lines: dict[str, SupplyBomLineResult]
    rollup: SupplyBomRollup


# --- watching -------------------------------------------------------------------------


class BomSkippedLine(SupplyModel):
    key: str
    reason: Literal["no_mpn", "not_in_library", "needs_choice"]


class SupplyBomWatchResult(SupplyModel):
    watched: int
    already_watched: int
    lcsc_linked: int = Field(description="LCSC numbers on the lines newly linked to their parts.")
    skipped: list[BomSkippedLine]


class BomWatchPreview(TrackingPreview):
    watched: SupplyBomWatchResult


class BomWatched(SupplyBomWatchResult):
    connectors: list[BudgetShare]
    fits_nowhere: bool


class SheetRows(SupplyModel):
    rows: list[list[str]]


# --- notes ---------------------------------------------------------------------------


class SupplyBomComment(SupplyModel):
    """A note on a line of a project's BOM."""

    id: str
    line_key: str
    body: str
    author: str
    author_name: str
    created_at: str
