"""Settings for the supply module (distributor connectors).

`Settings` in `app.core.config` inherits this group, so supply settings are
added here without growing `config.py`.
"""
from __future__ import annotations

import re

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


class SupplySettings(BaseSettings):
    SUPPLY_BASE_CURRENCY: str = Field(
        default="EUR",
        description=(
            "The currency a new workspace costs in, as a three-letter code such as EUR, USD or INR. "
            "Administrators can change it later in Supply settings; a workspace that saved its settings keeps its own."
        ),
    )

    SUPPLY_ENABLE_SIMULATED_PROVIDER: bool = Field(
        default=False,
        description="Allow connectors for the simulated distributor. For development, tests and demos only.",
    )

    SUPPLY_HTTPS_PROXY: str = Field(
        default="",
        description=(
            "HTTPS proxy for distributor calls, for example http://proxy.example.com:3128. "
            "Environment proxy variables are ignored on purpose. With a proxy set, the proxy resolves "
            "host names, so Prism checks the host against the allowlist but cannot check addresses itself."
        ),
    )

    SUPPLY_INVENTORY_PRIVATE_HOSTS_STR: str = Field(
        default="",
        description=(
            "Comma-separated host names of inventory servers on your own network, for example "
            "inventory.example.internal. Only these may resolve to private addresses; HTTPS and certificate "
            "checks still apply, and link-local addresses stay refused. Empty allows public addresses only."
        ),
    )

    SUPPLY_OAUTH_BASE_URL: str = Field(
        default="",
        description=(
            "Origin a distributor sign-in (DigiKey change notices) returns to, when it must differ from "
            "PUBLIC_BASE_URL, for example https://localhost while the app is registered with that address. "
            "Must be HTTPS. Empty uses PUBLIC_BASE_URL."
        ),
    )

    @field_validator("SUPPLY_BASE_CURRENCY", mode="before")
    @classmethod
    def _currency_code(cls, value: object) -> str:
        code = str(value or "EUR").strip().upper()
        if not re.fullmatch(r"[A-Z]{3}", code):
            raise ValueError("SUPPLY_BASE_CURRENCY must be a three-letter currency code, such as EUR or INR.")
        return code

    @property
    def SUPPLY_INVENTORY_PRIVATE_HOSTS(self) -> list[str]:
        return [host.strip().lower().rstrip(".") for host in self.SUPPLY_INVENTORY_PRIVATE_HOSTS_STR.split(",") if host.strip()]
