"""Request and response models for the supply review API (``supply_review``)."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.api.supply_models import SupplyModel
from app.api.supply_parts_models import SupplyManufacturer
from app.api.supply_tracking_models import SupplyChoice


class ConfirmAliasRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    alias_key: str = Field(min_length=1, max_length=200)
    # Map to a manufacturer that exists, or name one to create. Exactly one.
    manufacturer_id: Optional[str] = Field(default=None, max_length=64)
    new_manufacturer_name: Optional[str] = Field(default=None, min_length=1, max_length=120)

    @model_validator(mode="after")
    def exactly_one_target(self) -> "ConfirmAliasRequest":
        if (self.manufacturer_id is None) == (self.new_manufacturer_name is None):
            raise ValueError("give manufacturer_id or new_manufacturer_name, not both")
        return self


class ChoiceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1, max_length=200)


class NumbersRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    keys: list[str] = Field(min_length=1, max_length=50)


class PinRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The listing is numbered otherwise than the part: also say the part is sold under that number.
    add_number: bool = False


class RejectManyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    listing_ids: list[str] = Field(min_length=1, max_length=500)


# --- the queue ------------------------------------------------------------------------


class SupplyReviewAlias(SupplyModel):
    """A spelling a distributor used that maps to no manufacturer yet."""

    alias_key: str
    alias_text: str
    seen_at_provider: str
    first_seen_at: str
    waiting_listings: int


class ListingPart(SupplyModel):
    id: str
    mpn: str
    manufacturer: str


class SupplyReviewListing(SupplyModel):
    id: str
    connector_id: str
    connector_name: str
    provider: str
    sku: str
    raw_mpn: str
    raw_manufacturer: str
    match_state: Literal["manufacturer_unresolved", "near"]
    match_reason: str
    packaging: str
    reel_size: Optional[int]
    packaging_inferred: bool
    first_seen_at: str
    part: Optional[ListingPart] = Field(description="The part this listing is a candidate for.")


class OtherNumberListing(SupplyModel):
    id: str
    sku: str
    raw_mpn: str
    connector: str


class SupplyOtherNumberGroup(SupplyModel):
    """Listings pinned as a part although numbered otherwise."""

    part_id: str
    mpn: str
    manufacturer: str
    listings: list[OtherNumberListing]


class LearnedAlias(SupplyModel):
    alias_key: str
    alias_text: str
    manufacturer: str
    first_seen_at: str
    parts: int


class SettledPart(SupplyModel):
    part_id: str
    mpn: str
    manufacturer: str
    at: str


class SupplyMatched(SupplyModel):
    """What Prism decided by itself and a person may undo."""

    aliases: list[LearnedAlias]
    parts: list[SettledPart]


class ProposedWaiver(SupplyModel):
    id: str
    part_id: str
    mpn: str
    manufacturer: str
    check_id: str
    scope: str
    reason: str
    proposed_by: str
    proposed_at: str


class ProposedAlternate(SupplyModel):
    component_id: str
    component_name: str
    component_mpn: str
    part_id: str
    mpn: str
    manufacturer: str
    proposed_by: str
    proposed_at: str
    main_part_id: str = Field(description="The component's main part the alternate is judged against; empty when it has none. Sent back with the decision.")
    main_mpn: str


class ProposedDismissal(SupplyModel):
    id: str
    component_id: str
    component_name: str
    component_mpn: str
    reasons: list[str]
    proposed_by: str
    proposed_at: str


class ProposedMute(SupplyModel):
    id: str
    part_id: str
    mpn: str
    manufacturer: str
    kind: str
    proposed_by: str
    proposed_at: str


class SupplyToApprove(SupplyModel):
    """What QA and administrators have been asked to approve."""

    waivers: list[ProposedWaiver]
    alternates: list[ProposedAlternate]
    dismissals: list[ProposedDismissal]
    mutes: list[ProposedMute]


class ReviewCounts(SupplyModel):
    aliases: int
    unresolved: int
    near: int


class SupplyReviewQueue(SupplyModel):
    aliases: list[SupplyReviewAlias]
    listings: list[SupplyReviewListing]
    other_numbers: list[SupplyOtherNumberGroup]
    choices: list[SupplyChoice] = Field(description="Parts whose maker waits for a person.")
    matched: SupplyMatched
    to_approve: SupplyToApprove
    counts: ReviewCounts
    manufacturers: list[SupplyManufacturer]


# --- decisions -----------------------------------------------------------------------


class MakerChosen(SupplyModel):
    result: Literal["settled", "conflict"]


class NumbersCounted(SupplyModel):
    counted: int


class ListingsRejected(SupplyModel):
    rejected: int


class SettleUndone(SupplyModel):
    undone: bool


class AliasUndone(SupplyModel):
    listings: int


class AliasConfirmed(SupplyModel):
    listings_updated: int
