"""Response models for the connectors API (``supply_connectors``)."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import Field

from app.api.supply_models import SupplyModel

SupplyCredentialStatus = Literal["none", "ready", "locked", "unknown_key"]


class SupplyCredentialField(SupplyModel):
    name: str
    label: str
    secret: bool


class SupplyProvider(SupplyModel):
    key: str
    label: str
    capabilities: list[str]
    max_batch: int
    stock_pooling: Literal["pooled", "separate"]
    credential_fields: list[SupplyCredentialField]
    storefronts: list[str]
    default_daily_budget: int
    metered: bool = Field(description="False when calls cost nothing (local data), so no call budget applies.")
    csv_fed: bool = Field(description="The provider's offers come from an uploaded file, not from calls to the distributor.")


class SupplySignin(SupplyModel):
    signed_in: bool
    state: Literal["none", "ok", "expired", "refused"]
    granted_by: str
    granted_at: Optional[str]
    expires_at: Optional[str]
    redirect_uri: str = Field(description="The address the DigiKey app must list as its callback.")


class SigninStarted(SupplyModel):
    url: str = Field(description="Where the administrator signs in at the provider.")


class SupplyCsvImport(SupplyModel):
    filename: str
    imported_by: str
    imported_at: str
    row_count: int


class SupplyCsvResult(SupplyCsvImport):
    ignored_columns: list[str]


class CallsToday(SupplyModel):
    spent: int
    interactive_spent: int


class ResetSuggestion(SupplyModel):
    """When the provider's day seems to reset (UTC), once readings from different days agree."""

    from_: str = Field(alias="from")
    to: str
    suggested: str
    tz: str
    windows: int


class SupplyConnector(SupplyModel):
    signin: SupplySignin = Field(
        default=None, description="For an administrator, on a connector whose change notices need a person's sign-in: that sign-in.")
    id: str
    provider: str
    provider_label: str
    provider_available: bool
    storefront: str
    display_name: str
    currency: str
    enabled: bool
    paused_reason: str
    daily_budget: int
    interactive_reserve_pct: int
    retention_days: Optional[int] = Field(description="Days raw samples are kept before they are rolled into daily rows; null is the default (60).")
    keep_days: Optional[int] = Field(description="Days any history is kept, daily rows included; null keeps it for good.")
    keep_unused: bool = Field(description="The administrator holds the distributor's written leave to keep them.")
    limits_storage: bool = Field(description="The distributor's terms limit storage: prices of parts not in use are kept only for a day after a read.")
    catalogue: bool = Field(description="Offers come from the provider's published catalogue (jlcparts) instead of an uploaded file.")
    catalogue_available: bool
    reset_time: str = Field(description="When the provider's day begins, and in which time zone.")
    reset_tz: str
    metered: bool
    csv_fed: bool = Field(description="The connector's offers come from an uploaded file.")
    assembly_only: bool = Field(description="Read only for a project that names it (JLCPCB: stock that feeds its own assembly).")
    usage_today: CallsToday
    csv_import: Optional[SupplyCsvImport]
    credentials: dict[str, bool] = Field(description="Which credentials are set. Values are never returned.")
    credentials_status: SupplyCredentialStatus
    rate_limits: dict[str, dict[str, str]] = Field(
        description="Rate-limit headers the provider sent with its last answer, per API, by lower-case name.")
    reset_from_provider: bool = Field(description="The reset time was taken from what the provider reported, so its own count of calls is trusted.")
    reset_suggestion: Optional[ResetSuggestion]
    rate_limits_at: Optional[str]
    last_ok_at: Optional[str]
    last_error_code: str
    last_error_at: Optional[str]
    cooldown_until: Optional[str] = Field(description="The connector rests, making no calls, until this time (after a refusal, a rate limit or errors in a row).")
    block_streak: int = Field(description="Refusals in a row at a provider with no credentials; each rests longer.")
    slow_until: Optional[str] = Field(description="Calls are spaced twice as far apart until this time, after a refusal.")
    created_by: str
    created_at: Optional[str]
    updated_at: Optional[str]


class QuoteCoverage(SupplyModel):
    parts: int
    of: int




class SupplyConnectorCheck(SupplyModel):
    ok: bool
    code: str = Field(description='"ok", a provider error code, or "inactive" / "budget" / "unknown_provider".')
    message: str
    took_ms: int
    checked_at: str
