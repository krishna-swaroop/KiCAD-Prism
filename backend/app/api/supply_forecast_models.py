"""Response models for forecasts (``supply_forecast``): a part's, and the Insights section with the track record."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import Field

from app.api.supply_models import SupplyModel
from app.api.supply_parts_models import ForecastState


class ForecastModelState(SupplyModel):
    """Where a forecast model stands: learning (not enough checks, or missing too often), shown, or paused."""

    state: ForecastState
    checks: int
    needs: int
    reason: str


class ForecastChance(SupplyModel):
    probability: float
    percent: int
    word: str


class ForecastWeek(ForecastChance):
    week: int
    date: str


class BuyState(SupplyModel):
    w4: ForecastModelState = Field(alias="4w")
    w8: ForecastModelState = Field(alias="8w")


class OutEverywhere(SupplyModel):
    w4: ForecastChance = Field(alias="4w")
    w8: ForecastChance = Field(alias="8w")


class Runout(ForecastChance):
    """A range of dates (10% to 90%) with the most likely in the middle."""

    low: str
    median: str
    high: str
    state: ForecastModelState


class BackInStock(SupplyModel):
    connector_id: str
    name: str
    provider: str
    low: str
    median: str
    high: str
    quote_days: Optional[int]
    ratio: Optional[float]
    beyond_share: float
    state: ForecastModelState


class StockBand(SupplyModel):
    day: str
    low: float
    median: float
    high: float


class StockPoint(SupplyModel):
    day: str
    median: float


class DistributorStock(SupplyModel):
    connector_id: str
    path: list[StockPoint]


class PriceAt(SupplyModel):
    date: str
    median: float
    low: float
    high: float


class DistributorPrice(SupplyModel):
    connector_id: str
    now: float
    h30: PriceAt
    h90: PriceAt


class ByDistributor(SupplyModel):
    """Each distributor's own forecast: its most likely stock by day, and its price in 30 and 90 days."""

    stock: list[DistributorStock]
    price: list[DistributorPrice]


class ForecastInputs(SupplyModel):
    span_days: int
    holders: int
    drain_known: int
    from_similar: Optional[int] = None
    outages_modelled: int
    weekly: bool


class PriceInputs(SupplyModel):
    readings: int
    span_days: int
    own_moves: int
    pooled_moves: int


class PriceHorizon(SupplyModel):
    low: float
    median: float
    high: float
    flat: bool
    date: str
    state: ForecastModelState


class PriceForecast(SupplyModel):
    now: float
    inputs: PriceInputs
    h30: PriceHorizon
    h90: PriceHorizon


class EndOfLife(SupplyModel):
    p12: ForecastChance
    p24: ForecastChance
    changes: int
    needs: int
    state: ForecastModelState


class PartForecast(SupplyModel):
    """Everything the part sheet's Forecast section and chart bands need. Nothing is saved by asking at a quantity."""

    available: bool
    reason: Optional[Literal["no_readings", "too_few_readings"]] = None
    today: str
    models: dict[str, dict[str, Any]] = Field(description="Each model's state, with what it rests on.")
    quantity: Optional[int] = None
    out_now: Optional[bool] = None
    weeks: Optional[list[ForecastWeek]] = None
    buy_state: Optional[BuyState] = None
    out_everywhere: Optional[OutEverywhere] = None
    runout: Optional[Runout] = None
    back: Optional[list[BackInStock]] = None
    path: Optional[list[StockBand]] = None
    by_distributor: Optional[ByDistributor] = None
    inputs: Optional[ForecastInputs] = None
    price: Optional[PriceForecast] = None
    end_of_life: Optional[EndOfLife] = None


# --- the Insights section -------------------------------------------------------------


class ForecastEvent(SupplyModel):
    kind: Literal["runout", "price"]
    date: str
    part_id: str
    mpn: str
    manufacturer: str
    text: str
    probability: Optional[float]


class GroupLeadTime(SupplyModel):
    kind: str
    scope: str
    now: float
    low: float
    median: float
    high: float
    direction: Literal["stretching", "easing", "flat"]
    points: int


class GroupWarning(SupplyModel):
    kind: str
    scope: str
    metric: str
    before: float
    after: float
    direction: Literal["up", "down"]
    since: str


class LikelyUp(SupplyModel):
    part_id: str
    mpn: str
    manufacturer: str
    now: float
    low: float
    median: float
    high: float
    change: float
    flat: bool


class PriceOutlook(SupplyModel):
    parts: int
    flat: int
    likeliest_up: list[LikelyUp]


class LastBuyLag(SupplyModel):
    available: bool
    cases: int
    needs: Optional[int] = None
    low: Optional[float] = None
    median: Optional[float] = None
    high: Optional[float] = None


class LifecycleOutlook(SupplyModel):
    last_buy_lag: LastBuyLag
    changes: int
    needs: int


class TrackRecordModel(SupplyModel):
    target: str
    label: str
    kind: Literal["range", "chance"]
    state: ForecastState
    checks: int
    needs: int
    score: Optional[float]
    since: Optional[str]
    reason: str


class ReliabilityBin(SupplyModel):
    said: float
    happened: float
    cases: int


class TrackRecord(SupplyModel):
    models: list[TrackRecordModel]
    reliability: dict[str, list[ReliabilityBin]]


class ForecastInsights(SupplyModel):
    """The Insights Forecasts section."""

    currency: str
    coming_up: list[ForecastEvent]
    likely_out_4w: int
    lead_times: list[GroupLeadTime]
    warnings: list[GroupWarning]
    prices: PriceOutlook
    lifecycle: LifecycleOutlook
    track_record: TrackRecord
