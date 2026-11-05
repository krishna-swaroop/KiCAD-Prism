"""A deterministic simulated market.

For tests, local development without API keys, and the public demo. The same
MPN and clock always give the same answer, so insight and polling tests can
walk a fake clock forward and know what the market did.

Stock follows a sawtooth: it drains over a per-part period, then jumps back.
An MPN prefix picks a scenario:

    OOS-    out of stock, long lead time
    NRND-   not recommended for new designs
    EOL-    obsolete, small leftover stock
    DRAIN-  drains to zero and does not restock
    NONE-   not found
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Callable, Sequence

from app.services.supply import clock as supply_clock
from app.services.supply.models import Incoming, Offer, PartData, PartMatch, PriceBreak
from app.services.supply.providers.base import (
    CAP_BATCH,
    CAP_INCOMING,
    CAP_LIFECYCLE,
    CAP_OFFERS,
    CAP_SEARCH,
    ProviderConfig,
    ProviderSpec,
)
from app.services.supply.vocabulary import Lifecycle, Packaging

KEY = "fake"
_ANCHOR = datetime(2026, 1, 1, tzinfo=timezone.utc)
_SKU_PREFIX = "FAKE-"
_PACKAGING_SUFFIX = {"-CT": Packaging.CUT_TAPE, "-RL": Packaging.TAPE_REEL}
_DISCOUNTS = ((1, "1.00"), (10, "0.85"), (100, "0.60"), (1000, "0.45"))


def _key(mpn: str) -> str:
    return "".join(mpn.split()).upper()


def _seed(key: str) -> int:
    return int(hashlib.sha256(key.encode()).hexdigest()[:8], 16)


def _split_sku(sku: str) -> tuple[str, Packaging] | None:
    if not sku.startswith(_SKU_PREFIX):
        return None
    body = sku[len(_SKU_PREFIX):]
    for suffix, packaging in _PACKAGING_SUFFIX.items():
        if body.endswith(suffix) and len(body) > len(suffix):
            return body[: -len(suffix)], packaging
    return None


class FakeProvider:
    def __init__(
        self,
        config: ProviderConfig,
        *,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._currency = (config.currency or "USD").upper()
        self._clock = clock or supply_clock.now

    def lookup_mpn(self, mpn: str, manufacturer: str | None = None) -> list[PartMatch]:
        key = _key(mpn)
        if not key or key.startswith("NONE-"):
            return []
        return [self._match(key, mpn.strip(), manufacturer)]

    def get_offers(self, skus: Sequence[str]) -> list[Offer]:
        now = self._clock()
        offers = []
        for sku in skus:
            parsed = _split_sku(sku)
            if parsed is None or parsed[0].startswith("NONE-"):
                continue
            offers.append(self._offer(sku, parsed[0], parsed[1], now))
        return offers

    def get_part_data(self, match: PartMatch) -> PartData:
        return PartData(
            match=match,
            description=f"Simulated part {match.mpn}",
            datasheet_url=f"https://example.invalid/datasheets/{match.mpn}.pdf",
            package_name="0603",
            category="Simulated",
            parameters=(("Package", "0603"), ("Tolerance", "1%")),
        )

    def _match(self, key: str, mpn: str, manufacturer: str | None) -> PartMatch:
        sku = f"{_SKU_PREFIX}{key}-CT"
        return PartMatch(
            provider=KEY,
            sku=sku,
            mpn=mpn,
            manufacturer=manufacturer or "Acme",
            description=f"Simulated part {mpn}",
            product_url=f"https://example.invalid/p/{sku}",
        )

    def _offer(self, sku: str, key: str, packaging: Packaging, now: datetime) -> Offer:
        seed = _seed(key)
        base = 500 + seed % 50_000
        days = (now - _ANCHOR).total_seconds() / 86400
        lifecycle = Lifecycle.ACTIVE
        lead_time: int | None = None

        if key.startswith("OOS-"):
            stock, lead_time = 0, 112
        elif key.startswith("EOL-"):
            stock, lifecycle = base // 20, Lifecycle.OBSOLETE
        elif key.startswith("DRAIN-"):
            days_to_empty = 30 + seed % 30
            stock = max(0, int(base * (1 - days / days_to_empty))) if days < days_to_empty else 0
        else:
            period = 14 + seed % 28
            phase = (days % period) / period
            stock = int(base * (1 - 0.8 * phase))
            if key.startswith("NRND-"):
                lifecycle = Lifecycle.NRND
        if stock == 0 and lead_time is None:
            lead_time = 84

        incoming: tuple[Incoming, ...] = ()
        if stock < base // 4:
            incoming = (Incoming(base // 2, (now + timedelta(days=10)).date()),)

        unit = (Decimal("0.05") + Decimal(seed % 900) / 100).quantize(Decimal("0.0001"), ROUND_HALF_UP)
        reel = packaging is Packaging.TAPE_REEL
        breaks = tuple(
            PriceBreak(qty, (unit * Decimal(factor) * (Decimal("0.9") if reel else 1)).quantize(Decimal("0.0001"), ROUND_HALF_UP))
            for qty, factor in _DISCOUNTS
        )
        return Offer(
            provider=KEY,
            sku=sku,
            mpn=key,
            manufacturer="Acme",
            stock=stock,
            fetched_at=now,
            incoming=incoming,
            moq=1000 if reel else 1,
            order_multiple=1000 if reel else 1,
            packaging=packaging,
            price_breaks=breaks,
            currency=self._currency,
            lead_time_days=lead_time,
            lifecycle=lifecycle,
            product_url=f"https://example.invalid/p/{sku}",
        )


SPEC = ProviderSpec(
    key=KEY,
    label="Simulated market",
    capabilities=frozenset({CAP_SEARCH, CAP_OFFERS, CAP_LIFECYCLE, CAP_BATCH, CAP_INCOMING}),
    max_batch=50,
    stock_pooling="pooled",
    credential_fields=(),
    factory=lambda config: FakeProvider(config),
    default_daily_budget=100_000,
    dev_only=True,
)
