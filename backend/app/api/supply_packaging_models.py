"""Request and response models for the packaging API (``supply_packaging``)."""

from __future__ import annotations

from typing import Optional, Union

from pydantic import BaseModel, ConfigDict, Field

from app.api.supply_models import SupplyModel
from app.services.supply import packaging_picks

Number = Union[int, float]


class PickIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    listing_id: str = Field(min_length=1, max_length=64)


class SimilarIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    connector_id: str = Field(min_length=1, max_length=64)
    packaging: str = Field(min_length=1, max_length=32)
    part_ids: list[str] = Field(max_length=packaging_picks.MAX_WAITING)


class PackagingListing(SupplyModel):
    id: str
    sku: str
    raw_mpn: str = Field(description="The number the distributor lists it under.")
    other_number: bool = Field(description="It is listed under another number than the part's.")
    packaging: str
    reel_size: Optional[int]
    packaging_inferred: bool
    moq: Optional[int]
    order_multiple: Optional[int]
    stock: Optional[int]
    lead_time_days: Optional[int]
    marketplace: bool
    currency: str
    prices: dict[str, Optional[str]] = Field(description="Unit price at 1, 100 and 1,000 pieces.")
    fetched_at: Optional[str]
    product_url: str = Field(description="The distributor's page for the listing.")


class PackagingOptions(SupplyModel):
    part_id: str
    connector_id: str
    package: str = Field(description="The case the part comes in (QFN, SOT-23, 0402); empty when no distributor lists it.")
    picked: Optional[str]
    picked_by: str = Field(description='Who picked: a person, or "auto" when Prism did.')
    note: str = Field(description="Said by Prism's pick when it fell back to a packaging next to the one asked for.")
    saves_calls_a_day: Number
    can_unpin: bool = Field(description="The viewer may take a listing off the part.")
    listings: list[PackagingListing]


class PackagingWaiting(SupplyModel):
    part_id: str
    connector_id: str
    connector: str
    mpn: str
    manufacturer: str
    listings: int
    saves_calls_a_day: Number


class PackagingSimilar(PackagingWaiting):
    listing_id: str
    sku: str


class PackagingPicked(SupplyModel):
    picked: str
    packaging: str
    similar: list[PackagingSimilar] = Field(description="Parts still waiting that the same packaging would suit; nothing applies until confirmed.")


class PackagingSeveral(SupplyModel):
    part_id: str
    connector_id: str
    connector: str
    provider: str
    mpn: str
    manufacturer: str
    listings: int
    picked_listing: Optional[str]
    picked_sku: str
    picked_by: str
    note: str
    new_since_pick: int = Field(description="Listings found after the pick was made.")
    saves_calls_a_day: Number


class PackagingProposal(SupplyModel):
    connector_id: str
    connector: str
    listing_id: str
    sku: str
    packaging: str
    note: str
    saves_calls_a_day: Number


class PackagingProposals(SupplyModel):
    items: list[PackagingProposal]
    saves_calls_a_day: Number


class PicksMade(SupplyModel):
    picked: int
