"""Response models for the parts API (``supply_parts``): the parts list and its rows."""

from __future__ import annotations

from typing import Literal, Optional, Union

from pydantic import Field

from app.api.supply_models import Items, Page, PartStanding, SupplyModel, SupplyStatus
from app.api.supply_pcn_models import ConnectorProblem

Number = Union[int, float]
SupplyLifecycle = Literal["active", "nrnd", "last_time_buy", "obsolete", "unknown"]
SupplyProblem = Literal["not_found", "gone"]
SupplyTier = Literal["daily", "weekly", "monthly"]
PriceKind = Literal["orderable", "backorder", "last_seen", "listed"]
ForecastState = Literal["learning", "shown", "paused"]
WatchPackaging = Literal["any", "cut_tape", "custom_reel", "tape_reel", "tray", "tube", "bulk"]
PriceBreak = tuple[int, str]


class SupplyWatchSummary(SupplyModel):
    threshold: Optional[int]
    pinned: bool
    owner: str
    packaging: WatchPackaging


class TrackingReason(SupplyModel):
    """Why Prism follows a part: a project, a person or a component (``kind``), and which (``ref``)."""

    kind: Literal["project", "person", "component", "legacy"]
    ref: str
    variant: Optional[str] = None


class PartTracking(SupplyModel):
    """How Prism follows a part: tier 1 is read daily, tier 2 weekly or monthly. Tier 3 (not followed) is null."""

    tier: Literal[1, 2]
    rate: Literal["daily", "weekly", "monthly"]
    reasons: list[TrackingReason]


class JlcClass(SupplyModel):
    library: Optional[Literal["Basic", "Extended"]]
    preferred: bool


class PriceRange(SupplyModel):
    """Lowest, highest and median over the distributors that price it."""

    low: str
    high: str
    median: str
    sellers: int


class NativePrice(SupplyModel):
    price: str
    currency: str


class PartSummary(PartStanding):
    """What a part's counted offers add up to, and its assessment: the kept summary every part list reads."""

    listings: int
    dropped: bool = Field(description="Every distributor that lists it has stopped selling it.")
    unit_price: Optional[str] = Field(description="In the base currency, at the part's price quantity.")
    currency: str
    price_quantity: int = Field(description="The quantity the price is quoted at.")
    price_kind: Optional[PriceKind] = Field(
        description="orderable: bought now; backorder: nothing in stock, with a lead time; last_seen: the price when it was last in stock; "
                    "listed: list price only.")
    price_lead_days: Optional[int]
    price_range: Optional[PriceRange] = Field(description="Lowest, highest and median over the distributors that price it; null with fewer than two.")
    price_native: Optional[NativePrice] = Field(description="What the price was before it was converted, when it was.")
    price_seen_day: Optional[str]
    price_unrated: list[str] = Field(description="Currencies priced by a distributor that have no exchange rate, so were left out.")
    price_test_data: bool = Field(description="The price comes from a simulated connector.")
    dated_by: str
    tier: Optional[SupplyTier]
    health: Number
    changes_at: Optional[str]
    priced_with: str


class RowDistributor(SupplyModel):
    """A distributor that lists the part: stock above zero is filled."""

    connector_id: str
    provider: str
    name: str
    stock: int
    price: Optional[str]
    currency: str


class SupplyRowOffer(SupplyModel):
    """One distributor's offer: stock, smallest order, packaging and price breaks as [from quantity, price]."""

    connector_id: str
    provider: str
    name: str
    sku: str
    skus: list[str] = Field(description="Every number this line stands for: cut tape and its custom reel are one line.")
    also_packaging: list[str] = Field(description="Other packagings the same line is sold in, with the same terms.")
    followed: bool = Field(description="The listing Prism follows at this distributor: the preferred one, else the smallest order in stock.")
    stock: int
    moq: int
    packaging: str
    reel_size: Optional[int] = Field(description="Pieces on a full reel, when known.")
    packaging_inferred: bool = Field(description="The packaging was guessed, not stated.")
    product_url: str = Field(description="The distributor's page for this number.")
    currency: str
    price_breaks: list[PriceBreak]
    base_currency: str = Field(description="The workspace currency.")
    base_price_breaks: Optional[list[PriceBreak]] = Field(description="The prices in the workspace currency; null when this line's currency has no rate.")


class RunoutForecast(SupplyModel):
    median_date: str
    low_date: str
    high_date: str
    p: Number


class RowForecast(SupplyModel):
    """The kept forecast: when it likely runs out and the chance of being out within four and eight weeks."""

    made_on: str
    available: Optional[bool] = None
    out_now: Optional[bool] = None
    runout: Optional[RunoutForecast] = None
    p_out_4w: Optional[Number] = None
    p_out_8w: Optional[Number] = None
    can_buy_4w: Optional[Number] = None
    can_buy_8w: Optional[Number] = None


class SupplyPartRow(PartSummary):
    id: str
    mpn: str
    manufacturer: str
    manufacturer_provisional: bool = Field(description="The maker is as written and no distributor has confirmed it yet.")
    watch: Optional[SupplyWatchSummary]
    tracking: Optional[PartTracking] = Field(description="Why and how often Prism follows it.")
    used_in: int = Field(description="How many projects' BOMs carry this part, among those whose BOM Prism has read.")
    jlc: Optional[JlcClass]
    spark: Optional[list[int]] = Field(default=None, description="The last 30 days of counted stock.")
    runs_out_days: Optional[int] = Field(default=None, description="The days until it is projected to run out.")
    project_names: list[str] = Field(description="The first two projects using it, by name.")
    distributors: list[RowDistributor]
    offers: list[SupplyRowOffer]
    preferred_connector_id: Optional[str]
    price_change_percent: Optional[Number] = Field(description="Cheapest price over 30 days, in percent.")
    forecast: Optional[RowForecast]
    lead_days: Optional[int] = Field(description="The shortest lead time quoted, in days.")
    flags: list[str] = Field(description="Problems the row shows as icons: waiting, rohs, reach, ncnr, not_stocked.")


class SupplyPartsPage(Page[SupplyPartRow]):
    forecast_state: dict[str, ForecastState] = Field(description="The state of the forecast models the rows' forecasts come from.")


# --- the part sheet -------------------------------------------------------------


class PartName(SupplyModel):
    id: str
    mpn: str
    manufacturer: str
    first_seen: Optional[str]


class PackagingPickedBy(SupplyModel):
    by: str
    note: str


class PackagingNeedsPick(SupplyModel):
    connector_id: str
    connector: str
    listings: int


class PartPackaging(SupplyModel):
    """Picks made on this part, and the distributors where it still waits for one."""

    picks: dict[str, str]
    picked_by: dict[str, PackagingPickedBy] = Field(description='Who picked at each distributor (a person, or "auto" for Prism) and its note.')
    needs_pick: list[PackagingNeedsPick]


class TradeMark(SupplyModel):
    control: Literal["controlled", "none"]
    eccn: str
    set_by: str
    set_at: str


class PartTrade(SupplyModel):
    """Export control: what distributors state, and a person's mark that wins over it."""

    control: Literal["controlled", "none", "disputed", "unknown"]
    eccn: list[str]
    stated: str
    stated_eccn: list[str]
    mark: Optional[TradeMark]


class ConnectorStock(SupplyModel):
    connector_id: str
    connector_name: str
    provider: str
    stock: int


class SupplyOffer(SupplyModel):
    fetched_at: str
    stock: int
    incoming: list[tuple[int, Optional[str]]]
    moq: int
    order_multiple: int
    price_breaks: list[PriceBreak]
    currency: str
    lead_time_days: Optional[int]
    lifecycle: SupplyLifecycle
    discontinued: bool
    rohs: Optional[bool]
    reach_affected: Optional[bool]
    marketplace: bool
    product_url: str


class ListingPoll(SupplyModel):
    tier: SupplyTier
    next_poll_at: Optional[str]
    last_polled_at: Optional[str]
    error_streak: int
    last_error_code: str


class SupplyListing(SupplyModel):
    id: str
    connector_id: str
    connector_name: str
    provider: str = Field(description="The connector's provider key, for its colour.")
    test_data: bool = Field(description="From a simulated connector: test data, marked wherever it shows.")
    sku: str
    packaging: str
    reel_size: Optional[int] = Field(description="Pieces on a full reel, when the distributor says.")
    packaging_inferred: bool = Field(description="The packaging was guessed, not stated.")
    match_state: str
    raw_mpn: str = Field(description="What the distributor calls the part.")
    raw_manufacturer: str = Field(description="What the distributor calls its maker.")
    match_reason: str = Field(description="Why it matched, or did not.")
    page_url: str = Field(description="The distributor's page for it, even before it has been read.")
    counted: bool = Field(description="Only counted listings feed stock and price.")
    offer: Optional[SupplyOffer]
    poll: Optional[ListingPoll]


class StockDay(SupplyModel):
    day: str
    stock: int
    listings: int = Field(description="How many listings stood behind the day, so a jump from a new one is not read as a restock.")


class HistoryConnector(SupplyModel):
    connector_id: str
    name: str
    provider: str
    last_read: Optional[str]
    stale: bool = Field(description="Not read for longer than the part's rate allows.")
    stock: list[tuple[str, int]]
    price: list[tuple[str, Number]]


class HistoryEvent(SupplyModel):
    day: str
    kind: Literal["restock", "notice"]
    text: str


class PartHistory(SupplyModel):
    """Stock and price a line per distributor over the last ``days`` days."""

    days: int
    currency: str
    connectors: list[HistoryConnector]
    total: list[tuple[str, int]]
    events: list[HistoryEvent] = Field(description="Days worth marking on the axis: a restock, or a product change notice.")


class PriceDay(SupplyModel):
    day: str
    price: Number


class PriceTrend(SupplyModel):
    currency: str
    was: str
    now: str
    change_percent: Number
    days: int


class SupplyHeadlinePrice(SupplyModel):
    unit_price: Optional[str]
    currency: str
    price_quantity: int
    price_kind: Optional[PriceKind]
    price_lead_days: Optional[int]
    price_range: Optional[PriceRange]
    price_native: Optional[NativePrice]
    price_seen_day: Optional[str]
    price_unrated: list[str]
    price_test_data: bool = Field(description="The figure comes from a simulated connector.")


class PartPrice(SupplyModel):
    """The cheapest counted unit price per day. ``trend`` is the move over the last 30 days, or null when there is too little to read one."""

    currency: str
    history: list[PriceDay]
    trend: Optional[PriceTrend]
    quantity: int = Field(description="The quantity the part is priced at.")
    default: int = Field(description="The workspace default price quantity.")
    own: bool = Field(description="Whether the part has its own price quantity.")
    headline: SupplyHeadlinePrice


class SupplyParameter(SupplyModel):
    name: str
    raw: str
    key: Optional[str]
    unit: str
    value: Optional[str]
    sources: list[str]


class OutlookSignal(SupplyModel):
    text: str
    source: str
    weight: Literal["hard", "watch", "soft"]


class SupplyOutlook(SupplyModel):
    """A rule-based band with every signal behind it."""

    band: Literal["ended", "ending", "warning_signs", "no_signs", "unknown"]
    label: str
    method: Literal["rule-based"]
    signals: list[OutlookSignal]


class PartUse(SupplyModel):
    project_id: str
    project_name: str
    quantity: int
    references: str
    only_in_variants: list[str]


class Leadership(SupplyModel):
    changes: int
    followed: int
    followed_share: Number
    leader: Optional[str]
    led: dict[str, int]


class ExchangeMove(SupplyModel):
    currency: str
    from_: str = Field(alias="from")
    to: str
    in_base_percent: Number
    local_percent: Number
    exchange_percent: Number


class RestockOrder(SupplyModel):
    rounds: int
    first: str
    firsts: dict[str, int]


class Arrivals(SupplyModel):
    announced: int
    open: int
    arrived: int
    slipped: int
    on_time: Optional[int]
    on_time_share: Optional[Number]
    median_delay_days: Optional[Number]


class MarketBehaviour(SupplyModel):
    repricing: dict[str, Number] = Field(description="Median days between a distributor's price changes.")
    leadership: Optional[Leadership]
    exchange: dict[str, ExchangeMove]
    restock_order: Optional[RestockOrder]
    arrivals: Optional[Arrivals]


class OpenRestock(SupplyModel):
    kind: Literal["lead_time", "dated"]
    expected: str
    quoted_lead_days: Optional[int] = None
    quantity: Optional[int] = None
    late: bool


class RestockRecord(SupplyModel):
    connector_id: str
    name: str
    provider: str
    open: Optional[OpenRestock]
    kept: int
    resolved: int
    stock_outs: int


class StockAnomaly(SupplyModel):
    day: str
    from_: int = Field(alias="from")
    to: int


class Seasonality(SupplyModel):
    index: dict[str, Number]
    peak: int
    trough: int


class LeadTimeTrend(SupplyModel):
    before: int
    after: int
    since: str


class InsightInputs(SupplyModel):
    points: int
    span_days: int
    points_in_run: int
    current: Optional[int]


class SupplyInsight(SupplyModel):
    confidence: Literal["none", "low", "medium", "high"]
    trend: Optional[Literal["falling", "rising", "steady"]]
    decrease_per_day: Optional[Number] = Field(description="Observed net decrease, pieces a day. Not consumption: transfers and caps look the same.")
    days_to_zero: Optional[int]
    days_to_threshold: Optional[int]
    pace: Optional[Literal["accelerating", "steady", "slowing"]] = Field(
        description="Falling faster in the later half of the readings: the later rate and the days to zero at it.")
    recent_decrease_per_day: Optional[Number]
    days_to_zero_recent: Optional[int]
    beyond_year: bool = Field(description="The drain is too slow to run out within a year, for a part that is still made and restocked.")
    restocks: int
    restock_interval_days: Optional[int]
    restock_expected_in_days: Optional[int] = Field(description="Negative when a regular restock is overdue.")
    zero_share: Optional[Number] = Field(description="Share of the history's days at zero stock.")
    restock_latency_days: Optional[int] = Field(description="Median days at zero before stock came back.")
    volatility: Optional[Number] = Field(description="Spread of daily stock against its average.")
    sources_change: Optional[int] = Field(description="Distributors holding stock, last day against the first.")
    concentration: Optional[Number] = Field(description="1 when all the stock is at one distributor.")
    anomalies: list[StockAnomaly] = Field(description="Days on which stock collapsed in one step, newest first.")
    seasonality: Optional[Seasonality] = Field(description="How stock runs by month of the year, once there is more than a year of history.")
    inputs: InsightInputs
    lead_gap_days: Optional[int] = Field(description="Days by which stock is expected to run out before a new order could arrive.")
    lead_time_trend: Optional[LeadTimeTrend] = Field(description="The quoted lead time, early in the last 90 days against late.")


class SupplyPartDetail(PartStanding):
    """The part sheet in one read."""

    part: PartName
    watch: Optional[SupplyWatchSummary]
    tracking: Optional[PartTracking] = Field(description="Why and how often Prism follows the part; null when nobody does.")
    packaging: PartPackaging
    preferred_connector_id: Optional[str] = Field(description="The distributor a person prefers for this part: shown first.")
    trade: PartTrade
    problem_text: str
    stock_by_connector: list[ConnectorStock]
    listings: list[SupplyListing]
    history: list[StockDay]
    distributor_history: PartHistory = Field(description="Stock and price a line per distributor over the last 90 days: what the sheet's charts draw.")
    price: PartPrice
    parameters: list[SupplyParameter]
    outlook: SupplyOutlook
    used_in: list[PartUse]
    jlc: Optional[JlcClass]
    market_behaviour: MarketBehaviour
    restock_record: list[RestockRecord]
    insight: SupplyInsight


# --- smaller part routes ----------------------------------------------------------


class PartLookup(SupplyModel):
    """The part Prism knows for a manufacturer and number, and whether it follows it."""

    part_id: Optional[str]
    followed: bool


class LibraryComponentOf(SupplyModel):
    component_id: Optional[str] = Field(description="The catalog component the part counts for; null when the library has none.")


class SupplyManufacturer(SupplyModel):
    id: str
    name: str
    part_count: int


class PriceQuantity(SupplyModel):
    quantity: int
    default: int
    own: bool


class PartReadOnView(SupplyModel):
    read: int


class SupplyReadNow(SupplyModel):
    read: int
    connectors: int
    problems: list[ConnectorProblem]


# --- part groups and alternatives -------------------------------------------------


class SupplyGroupStats(SupplyModel):
    """What a project row shows closed: the counts that need a look, and for a tracked project its cost, boards, BOM age and alerts."""

    at_risk: int
    out: int
    end_of_life: int
    one_distributor: int
    runs_out_soon: int
    bom_read_at: Optional[str] = None
    variants: Optional[list[str]] = None
    all_variants: Optional[bool] = None
    packaging: Optional[str] = None
    cost_per_board: Optional[str] = None
    currency: Optional[str] = None
    boards: Optional[int] = None
    build_quantity: Optional[int] = Field(default=None, description="The usual build the cost and boards are worked out for.")
    unchecked: Optional[int] = Field(default=None, description="BOM lines no stock figure checks: the boards count is unconfirmed while any is.")
    test_data: Optional[bool] = Field(default=None, description="Some of the cost comes from a simulated connector.")
    lines: Optional[int] = Field(default=None, description="BOM lines of the usual build.")
    lines_priced: Optional[int] = Field(default=None, description="BOM lines the cost covers: under `lines`, the cost is a subtotal.")
    cost_change_percent: Optional[Number] = None
    alerts: Optional[int] = None


class SupplyPartGroup(SupplyModel):
    project_id: str
    project_name: str
    tracked: bool
    count: int
    statuses: dict[str, int] = Field(description="How many parts have each status.")
    stats: SupplyGroupStats


class SupplyPartGroups(Items[SupplyPartGroup]):
    """The matching parts grouped by the projects that use them, tracked projects first."""

    total: int


class AlternativeCandidate(PartStanding):
    part_id: str
    manufacturer: str
    mpn: str
    grade: Literal["ratings_met", "similar", "other_package", "fails"] = Field(
        description='None claims the parts are interchangeable: "ratings_met" is every listed rating known and met, in the same package.')
    grade_label: str
    same: list[str]
    differs: list[str]
    unknown: list[str] = Field(description="Ratings the part lists and the candidate doesn't, so they can't be judged.")


class SuggestionSource(SupplyModel):
    provider: str
    name: str


class DistributorSuggestion(SupplyModel):
    """A number distributors suggest in place of the part, with every distributor that said it. Not compared with the part."""

    manufacturer: str
    mpn: str
    sku: str
    notes: list[str] = Field(description="Their words: the package, or how close DigiKey says it is.")
    sources: list[SuggestionSource]
    asked: bool = Field(description="Asked for from DigiKey, not seen in an offer read.")
    part_id: Optional[str] = Field(description="The part in Prism, when it is one.")
    stock: Optional[int]
    status: Optional[SupplyStatus]
    tracked: bool


class CrossReference(SupplyModel):
    candidates: list[AlternativeCandidate]
    suggested_by_distributors: list[str] = Field(description="Replacements distributors name for the part, as written.")
    suggestions: list[DistributorSuggestion]
    judged_on: list[str] = Field(description="The parameters the comparison rested on.")
