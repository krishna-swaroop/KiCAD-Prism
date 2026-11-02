"""JLCPCB (assembly) through an uploaded offers file.

Prism does not call JLCPCB's website, so its connector is fed like the
generic CSV one: an administrator uploads the offers
file and the connector reads its own rows. The key, the label and the colour
are unchanged.

Its stock is for JLCPCB's own assembly, never for sale, so every offer it
produces is marked marketplace: shown on its own line and never added to a
part's total, status or checks. The file's optional ``jlc_library``
(``basic`` or ``extended``) and ``jlc_preferred`` (yes or no) columns become
facts, which the parts list, BOM line and part sheet show as B. E and a star.
"""

from __future__ import annotations

from app.services.supply.providers import csv_provider
from app.services.supply.providers.base import ProviderSpec

KEY = "jlcpcb"


SPEC = ProviderSpec(
    key=KEY,
    label="JLCPCB (assembly)",
    capabilities=csv_provider.SPEC.capabilities,
    max_batch=csv_provider.SPEC.max_batch,
    stock_pooling="separate",
    credential_fields=(),
    factory=lambda config: csv_provider.CsvProvider(config, provider_key=KEY, marketplace=True),
    default_daily_budget=0,
    metered=False,
    assembly_only=True,
    csv_fed=True,
    catalogue_url="https://yaqwsx.github.io/jlcparts/data/",
)
