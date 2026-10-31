"""Request and response models for the settings API (``supply_settings``)."""

from __future__ import annotations

from typing import Dict, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.api.supply_models import SupplyModel
from app.services.supply import settings as workspace

AssessmentSeverity = Literal["ok", "warning", "error", "fatal"]


class AssessmentSettingsBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lead_time_days: int
    last_buy_error_days: int = 180
    late_hours: int = 48
    spares_mode: str = "flat"
    spares_percent: float = 0.0
    spares_small_passives: float = 2.0
    spares_others: float = 0.0
    alert_price_rise_percent: int = 20
    alert_likely_out_percent: int = 70
    base_currency: str = Field(default_factory=lambda: workspace.DEFAULTS.pricing.base_currency)
    price_quantity: int = 100
    prefer_distributors: bool = False
    distributor_order: list[str] = []
    severity: Dict[str, str]


class MakerSpellingBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    spelling: str
    group_key: Optional[str] = Field(default=None, description="The group (a maker) it joins; none starts a new one.")


class SuffixBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ending: str
    kind: str


class AssessmentSettings(SupplyModel):
    """The workspace's assessment, pricing, alerts and spares settings, as one form."""

    lead_time_days: int
    last_buy_error_days: int = Field(description="A last date to buy this many days away or less makes a last time buy an error; past it, fatal.")
    late_hours: int = Field(description="A read is late when it is this many hours past when the part's schedule wanted it.")
    spares_mode: Literal["flat", "package"] = Field(
        description='Spares a costing orders: one percent for every part ("flat"), or by kind of part ("package").')
    spares_percent: float
    spares_small_passives: float
    spares_others: float
    alert_price_rise_percent: int = Field(
        description="The price rise, and the chance of running out within four weeks, that raise an alert when a part has no rule of its own.")
    alert_likely_out_percent: int
    base_currency: str = Field(description="Prices in other currencies are converted to this one.")
    price_quantity: int = Field(description="Lists and price history price at this quantity, unless a part has its own.")
    prefer_distributors: bool = Field(description="Price the BOM at a preferred distributor with enough stock, else the cheapest.")
    distributor_order: list[str] = Field(description="Connector ids, the most preferred first.")
    severity: dict[str, AssessmentSeverity]


class AssessmentCheck(SupplyModel):
    id: str
    label: str
    area: str


class SettingsRanges(SupplyModel):
    lead_time_days: tuple[int, int]
    last_buy_error_days: tuple[int, int]
    late_hours: tuple[int, int]
    price_quantity: tuple[int, int]
    spares: tuple[int, int]
    alert_price_rise_percent: tuple[int, int]
    alert_likely_out_percent: tuple[int, int]


class AssessmentSettingsView(SupplyModel):
    settings: AssessmentSettings
    defaults: AssessmentSettings
    checks: list[AssessmentCheck]
    ranges: SettingsRanges
    currencies: list[str] = Field(description="The currencies a workspace can cost in: the euro and every one with an exchange rate.")


class MakerSpelling(SupplyModel):
    alias_key: str
    alias_text: str
    source: str


class SupplyMakerGroup(SupplyModel):
    group_key: str
    name: str
    spellings: list[MakerSpelling]


class SupplyNumberEnding(SupplyModel):
    suffix_key: str
    suffix_text: str
    kind: Literal["packaging", "grade"]
    source: str
