"""The CSV provider: offers from an uploaded file instead of an API.

For installs with no internet, for distributors without an API, and for
distributors whose own service Prism may not call (LCSC, JLCPCB): their
connectors are fed the same way, under their own provider key. Calls cost
nothing, so the provider is unmetered. Unlike the network providers it reads
its own import table; it never writes, and uploading is the import service's
job.
"""

from __future__ import annotations

from typing import Sequence

from app.services.supply.csv_offers import PROVIDER_KEY, CsvOfferStore
from app.services.supply.models import Offer, PartData, PartMatch
from app.services.supply.providers.base import (
    CAP_BATCH,
    CAP_INCOMING,
    CAP_LIFECYCLE,
    CAP_OFFERS,
    CAP_SEARCH,
    ProviderConfig,
    ProviderSpec,
)
from app.services.supply.store import SupplyStore, supply_store


class CsvProvider:
    def __init__(
        self,
        config: ProviderConfig,
        *,
        store: SupplyStore = supply_store,
        offers: CsvOfferStore | None = None,
        provider_key: str = PROVIDER_KEY,
        marketplace: bool = False,
    ) -> None:
        self._connector_id = config.connector_id
        self._store = store
        self._offers = offers or CsvOfferStore(provider_key=provider_key, marketplace=marketplace)

    def lookup_mpn(self, mpn: str, manufacturer: str | None = None) -> list[PartMatch]:
        with self._store.connection() as conn:
            return self._offers.matches_for_mpn(conn, self._connector_id, mpn, manufacturer)

    def get_offers(self, skus: Sequence[str]) -> list[Offer]:
        with self._store.connection() as conn:
            return self._offers.offers_for_skus(conn, self._connector_id, list(skus))

    def get_part_data(self, match: PartMatch) -> PartData:
        # A file carries stock and price, not descriptions or parameters.
        return PartData(match=match)


SPEC = ProviderSpec(
    key=PROVIDER_KEY,
    label="CSV import",
    capabilities=frozenset({CAP_SEARCH, CAP_OFFERS, CAP_LIFECYCLE, CAP_INCOMING, CAP_BATCH}),
    max_batch=1000,
    stock_pooling="separate",
    credential_fields=(),
    factory=lambda config: CsvProvider(config),
    default_daily_budget=0,
    metered=False,
    csv_fed=True,
)
