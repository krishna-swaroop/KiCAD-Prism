"""Request and response models for the exchange rates API (``supply_fx``)."""

from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.api.supply_models import SupplyModel


class ManualRates(BaseModel):
    model_config = ConfigDict(extra="forbid")

    day: date
    rates: dict[str, float] = Field(min_length=1, max_length=60, description="Units of the currency per euro, as the ECB quotes them.")


class SupplyFxRates(SupplyModel):
    """The rates loaded: their day, the currencies they price and whether they are too old to trust."""

    day: Optional[str]
    currencies: list[str]
    stale: bool


class SupplyFxRatesSaved(SupplyFxRates):
    saved: int = Field(description="How many rates were saved.")
