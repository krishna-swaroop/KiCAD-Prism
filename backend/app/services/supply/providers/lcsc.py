"""LCSC through an uploaded offers file.

Prism does not call LCSC's website, so its connector is fed like the generic
CSV one: an administrator uploads the offers file and the connector
reads its own rows. The key, the label and the colour are unchanged, so
listings, BOM links and preferences already saved keep pointing at it.
"""

from __future__ import annotations

from app.services.supply.providers import csv_provider
from app.services.supply.providers.base import ProviderSpec

KEY = "lcsc"


SPEC = ProviderSpec(
    key=KEY,
    label="LCSC",
    capabilities=csv_provider.SPEC.capabilities,
    max_batch=csv_provider.SPEC.max_batch,
    stock_pooling="separate",
    credential_fields=(),
    factory=lambda config: csv_provider.CsvProvider(config, provider_key=KEY),
    default_daily_budget=0,
    metered=False,
    csv_fed=True,
    standard_packaging=True,
)
