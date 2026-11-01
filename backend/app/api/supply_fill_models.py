"""Request and response models for fill from distributor API (``supply_fill``)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.api.supply_models import SupplyModel


class SearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mpn: str = Field(min_length=1, max_length=100)
    manufacturer: str = Field(default="", max_length=120)


class DetailsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    connector_id: str = Field(min_length=1, max_length=64)
    sku: str = Field(min_length=1, max_length=100)
    mpn: str = Field(min_length=1, max_length=100)
    manufacturer: str = Field(default="", max_length=120)


class FillCandidate(SupplyModel):
    connector_id: str
    connector: str
    provider: str = Field(description="The connector's provider key, for its colour.")
    sku: str
    mpn: str
    manufacturer: str
    description: str
    product_url: str
    manufacturer_matches: bool


class FillSkipped(SupplyModel):
    connector: str
    reason: str


class FillSearchResult(SupplyModel):
    candidates: list[FillCandidate]
    skipped: list[FillSkipped]


class FillDetails(SupplyModel):
    description: str
    datasheet_url: str
    package_name: str
    category: str
