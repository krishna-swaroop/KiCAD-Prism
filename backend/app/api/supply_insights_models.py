"""Response models for the Dashboard, the Insights page and the market history (``supply_market``)."""

from __future__ import annotations

from typing import Any, Literal, Optional, Union

from pydantic import Field

from app.api.supply_alerts_models import SupplyAlert
from app.api.supply_forecast_models import ForecastEvent, ForecastModelState
from app.api.supply_models import SupplyModel, SupplyStatus
from app.api.supply_parts_models import SupplyGroupStats, SupplyLifecycle

ScopeKind = Literal["all", "manufacturer", "category"]


# --- the Dashboard ---------------------------------------------------------------------


class DashboardFigures(SupplyModel):
    watched: int
    at_risk: int
    out_of_stock: int
    lifecycle: int
    open_alerts: int
    waiting: int


class DashboardForecast(SupplyModel):
    """Parts likely out within four weeks, the model's state and the next expected events."""

    likely_out_4w: int
    state: ForecastModelState
    coming_up: list[ForecastEvent]
    part_ids_likely_out_4w: list[str]


class StatusCount(SupplyModel):
    status: SupplyStatus
    count: int


class Runway(SupplyModel):
    out_now: int
    runs_out_2w: int
    runs_out_8w: int
    runs_out_later: int
    steady: int
    few_readings: int


class Holders(SupplyModel):
    none: int
    one: int
    two: int
    three_plus: int
    unknown: int


class ProjectCost(SupplyModel):
    project_id: str
    project_name: str
    currency: str
    points: list[tuple[str, float]]


class FailingFeed(SupplyModel):
    kind: Literal["stores", "connector"]
    name: str
    since: Optional[str]


class SupplyRecentChange(SupplyModel):
    """Something that happened lately to a watched part."""

    at: str
    type: Literal[
        "alert_opened", "alert_cleared", "listing_gone", "lifecycle_changed", "normally_stocking_lost", "moq_jump", "family_member_new",
        "param_changed", "project_bom_changed",
    ]
    detail: Optional[dict[str, Any]] = Field(default=None, description="What the event recorded, for the kinds that carry figures.")
    part_id: Optional[str] = Field(description="Null for a change to a project's BOM, which names the project in detail.")
    mpn: str
    manufacturer: str
    alert: Optional[SupplyAlert] = Field(description="The alert behind an opened or cleared change.")
    sku: str = Field(description="The distributor number of a listing that went.")


class RiskRow(SupplyModel):
    lifecycle: SupplyLifecycle
    two_plus: int
    one: int
    out: int
    not_read: int


class Deadline(SupplyModel):
    part_id: str
    mpn: str
    manufacturer: str
    kind: Literal["last_time_buy", "last_time_ship", "last_buy_date"]
    date: str
    source: str
    url: str


class DashboardProject(SupplyModel):
    project_id: str
    project_name: str
    count: int
    statuses: dict[str, int]
    stats: SupplyGroupStats


class SupplyDashboard(SupplyModel):
    """The Dashboard page in one read."""

    figures: DashboardFigures
    ending_components: int = Field(description="Library components whose part is ending and nobody has decided about.")
    forecast: DashboardForecast
    figure_history: dict[str, list[int]] = Field(description="Each figure's stored values over the last 30 days, oldest first.")
    statuses: list[StatusCount]
    runway: Runway
    holders: Holders
    alerts_by_day: list[dict[str, Union[int, str]]]
    project_costs: list[ProjectCost]
    insights_ready: int
    failing_feeds: list[FailingFeed] = Field(description="Enabled feeds whose last read failed, with their last good read.")
    connectors: int = Field(description="Enabled connectors.")
    no_data: int = Field(description="Tracked parts with no reading yet.")
    recent_changes: list[SupplyRecentChange]
    risk_grid: list[RiskRow] = Field(description="Lifecycle against availability, a row per lifecycle.")
    deadlines: list[Deadline] = Field(description="Last-time-buy and last-ship dates in the next year, soonest first.")
    projects: list[DashboardProject] = Field(description="The tracked projects with their closed-row figures.")


# --- the market ------------------------------------------------------------------------


class SupplyMarketMetric(SupplyModel):
    value: float
    before: Optional[float] = Field(description="The same figure at the earlier snapshot, or null when none was stored.")


class MarketSignal(SupplyModel):
    kind: Literal["manufacturer", "category"]
    scope: str
    signal: Literal["draining", "lead_times"]
    text: str


class SupplyMarketScope(SupplyModel):
    scope: str
    kind: ScopeKind
    sample: int
    metrics: dict[str, SupplyMarketMetric]


class SupplyMarket(SupplyModel):
    day: Optional[str]
    compared_with: Optional[str] = None
    min_sample: Optional[int] = None
    signals: Optional[list[MarketSignal]] = Field(default=None, description="Groups where something is moving together.")
    scopes: list[SupplyMarketScope]


class MarketSeries(SupplyModel):
    kind: ScopeKind
    scope: str
    sample: int
    points: list[tuple[str, float]]


class SupplyMarketHistory(SupplyModel):
    """One metric over the stored days, a line per group."""

    metric: str
    series: list[MarketSeries]


# --- the Insights page -----------------------------------------------------------------


class ScatterPoint(SupplyModel):
    part_id: str
    mpn: str
    manufacturer: str
    days_to_zero: float
    lead_days: float


class ScatterMissing(SupplyModel):
    no_rate: int
    no_lead_time: int


class NamedDays(SupplyModel):
    name: str
    days: float
    parts: int


class NamedParts(SupplyModel):
    name: str
    parts: int


class ArrivalRecord(SupplyModel):
    on_time: int
    resolved: int


class StockOuts(SupplyModel):
    n: int
    median_days_out: Optional[float]


class RestockedFirst(SupplyModel):
    rounds: int
    first: Optional[float]


class Promises(SupplyModel):
    resolved: int
    kept: Optional[float]
    median_days_late: Optional[float]


class Wait(SupplyModel):
    n: int
    quoted_days: Optional[float]
    real_days: Optional[float]


class InStock(SupplyModel):
    days: int
    share: Optional[float]


class ScorecardRow(SupplyModel):
    """One distributor's record on the parts two or more distributors list. A figure is null until it rests on min_events."""

    connector_id: str
    name: str
    provider: str
    parts: int
    stock_outs: StockOuts
    restocked_first: RestockedFirst
    promises: Promises
    wait: Wait
    in_stock: InStock


class SupplyScorecard(SupplyModel):
    distributors: list[ScorecardRow]
    shared_parts: int
    min_events: int


class SupplyDistributorBehaviour(SupplyModel):
    repricing: list[NamedDays]
    leaders: list[NamedParts]
    restock_first: list[NamedParts]
    arrivals: Optional[ArrivalRecord]
    scorecard: Optional[SupplyScorecard] = None


class Coverage(SupplyModel):
    connector_id: str
    name: str
    provider: str
    tracked: int
    listed: int
    in_stock: int
    cheapest: int


class Resilience(Holders):
    not_read: int


class Sourcing(SupplyModel):
    coverage: list[Coverage]
    resilience: Resilience


class LifecycleMix(SupplyModel):
    active: int
    nrnd: int
    last_time_buy: int
    obsolete: int
    unknown: int


class Outlook(SupplyModel):
    ended: int
    ending: int
    warning_signs: int
    no_signs: int
    unknown: int


class RohsMix(SupplyModel):
    compliant: int
    not_compliant: int
    disputed: int
    not_applicable: int
    unknown: int


class ReachMix(SupplyModel):
    compliant: int
    affected: int
    not_applicable: int
    unknown: int


class ComplianceMix(SupplyModel):
    rohs: RohsMix
    reach: ReachMix


class LifecycleInsights(SupplyModel):
    mix: LifecycleMix
    outlook: Outlook
    compliance: ComplianceMix


class LeadTimeBucket(SupplyModel):
    bucket: Literal["under_2w", "2_to_8w", "8_to_16w", "16_to_26w", "over_26w", "none"]
    parts: int


class PriceMove(SupplyModel):
    part_id: str
    mpn: str
    manufacturer: str
    percent: float


class PriceMovers(SupplyModel):
    up: list[PriceMove]
    down: list[PriceMove]


class Origin(SupplyModel):
    country: str
    parts: int


class ControlMix(SupplyModel):
    controlled: int
    none: int
    disputed: int
    unknown: int


class ControlledPart(SupplyModel):
    part_id: str
    mpn: str
    manufacturer: str
    eccn: str
    state: Literal["controlled", "disputed"]
    by_person: bool


class Trade(SupplyModel):
    origins: list[Origin]
    other_origins: int
    control: ControlMix
    controlled: list[ControlledPart]


class SupplyInsightsPage(SupplyModel):
    """The Insights page: counts of findings, the runway scatter, distributors, market."""

    tracked: int
    counts: dict[str, int]
    scatter: list[ScatterPoint]
    scatter_missing: ScatterMissing
    distributors: SupplyDistributorBehaviour
    market: SupplyMarket
    market_trends: dict[str, list[float]] = Field(description="The last stored values of each market figure over all followed parts, oldest first.")
    sourcing: Sourcing
    lifecycle: LifecycleInsights
    lead_times: list[LeadTimeBucket]
    price_movers: PriceMovers
    trade: Trade
