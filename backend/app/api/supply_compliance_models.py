"""Request and response models for the compliance API (``supply_compliance``)."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.api.supply_models import SupplyModel
from app.services.supply import compliance


class LoadList(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_name: str = Field(default="", max_length=200)
    csv: str = Field(default="", max_length=compliance.MAX_LIST_BYTES, description="The list as CSV text; or send xlsx_base64.")
    xlsx_base64: str = Field(default="", max_length=compliance.MAX_LIST_BYTES * 4 // 3 + 16, description="The list as an Excel file, base64.")


class Declaration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cas: str = Field(min_length=1, max_length=20)
    note: str = Field(default="", max_length=200)


class SupplySvhcList(SupplyModel):
    """The ECHA Candidate List Prism holds."""

    loaded: bool
    substances: int
    loaded_at: Optional[str]
    loaded_by: str
    source_name: str


class SupplyComplianceState(SupplyModel):
    state: str
    reason: str


class DeclaredSubstance(SupplyModel):
    cas: str
    note: str
    declared_by: str = Field(description="A person's address, or a distributor when from_distributor.")
    declared_at: str
    listed_as: Optional[str]
    from_distributor: bool


class RohsExemption(SupplyModel):
    """A RoHS exemption a person named from the manufacturer's declaration."""

    code: str
    note: str
    declared_by: str


class FactSource(SupplyModel):
    provider: str
    source: str
    value: str
    observed_at: str


class SupplyFact(SupplyModel):
    """One thing distributors state about a part (RoHS wording, tariff code, last date to buy...), per source."""

    name: str
    label: str
    sources: list[FactSource]
    disagree: bool = Field(description="True when two sources say different things.")


class SupplyCompliance(SupplyModel):
    """RoHS and REACH of a part, and the substances a supplier declared for it."""

    rohs: SupplyComplianceState
    reach: SupplyComplianceState
    substances: list[DeclaredSubstance]
    exemptions: list[RohsExemption]
    facts: list[SupplyFact]
    list: SupplySvhcList
