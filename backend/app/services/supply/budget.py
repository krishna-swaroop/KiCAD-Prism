"""What following a part costs a provider's daily budget. Pure; no database.

A part at tier 1 is read every day, a tier-2 part weekly or monthly. Besides reading stock and price a part costs a share
of the provider's other calls: change notices (weekly, tiers 1 and 2), substance lists (monthly, tier 1) and the search
that finds its listings (monthly at tier 1, quarterly at tier 2). Costs are calls a day for one part at one provider and
are fractions: a provider that reads ten SKUs a call charges a tenth of a call for each. Totals are rounded up.

``listings`` is how many of the part's listings are read: one once a packaging is picked, otherwise all of them, and none
for a part the provider does not carry. A provider that serves every listing of a part in one answer
(``groups_by_part``) charges for the part, not its listings.
"""

from __future__ import annotations

import math
from typing import Iterable

from app.services.supply.providers.base import CAP_PCN, CAP_SUBSTANCES, ProviderSpec

# How often each extra kind of call is made, in days.
NOTICE_EVERY_DAYS = 7
SUBSTANCE_EVERY_DAYS = 30
# How often a part is searched again, by tracking tier. ``discoverer`` reads these, so the cost model and the schedule say the same.
SEARCH_EVERY_DAYS = {1: 30, 2: 90}
# A provider that did not carry the part is asked again sooner.
SEARCH_MISSING_EVERY_DAYS = {1: 14, 2: 30}
RATE_DAYS = {"daily": 1, "weekly": 7, "monthly": 30}
# The most of a connector's day that tracking may commit; the rest is the pool for people's reads and one-off checks.
MAX_COMMITTED_PCT = 90


def committed_share_pct(reserve_pct: int) -> int:
    """The percent of the daily budget committed to tracking, given the percent held back for interactive reads."""

    return min(MAX_COMMITTED_PCT, max(0, 100 - reserve_pct))


def committed_calls(daily_budget: int, reserve_pct: int) -> int:
    return daily_budget * committed_share_pct(reserve_pct) // 100


def picks_limit_reads(spec: ProviderSpec) -> bool:
    """Whether a packaging pick limits what is read: only at a provider that pays a call for each listing and never serves a
    part's listings together. Everywhere else a listing costs a place in a batch, not a call, so every counted listing is read and
    a pick only says which one prices the part."""

    return spec.max_batch == 1 and not spec.groups_by_part


def providers_limited_by_picks() -> list[str]:
    from app.services.supply.providers import registry

    return [spec.key for spec in registry.list_specs(include_dev=True) if picks_limit_reads(spec)]


def read_cost(spec: ProviderSpec, rate: str, listings: float) -> float:
    """Calls a day to read stock and price."""

    reads_a_day = 1 / RATE_DAYS[rate]
    if spec.groups_by_part:
        # One call reads all of a part's listings, and where a call takes several parts (Arrow, 100), many parts at once.
        return reads_a_day / spec.max_batch
    return reads_a_day * listings / spec.max_batch * spec.calls_per_offers_batch


def search_cost(spec: ProviderSpec, tier: int, *, carried: bool = True) -> float:
    """Calls a day for the search that finds a part's listings, made again every month (tier 1) or quarter (tier 2), or
    every two weeks or month where the provider did not carry it."""

    days = SEARCH_EVERY_DAYS[tier] if carried else SEARCH_MISSING_EVERY_DAYS[tier]
    return 1 / days / max(spec.search_batch, 1)


def extra_cost(spec: ProviderSpec, tier: int) -> float:
    """Calls a day for notices, substances and the search that finds listings."""

    cost = search_cost(spec, tier)
    # A provider with a quota of its own for notices (DigiKey) does not pay for them from the product budget.
    if CAP_PCN in spec.capabilities and not spec.notice_daily_limit:
        cost += 1 / NOTICE_EVERY_DAYS
    if CAP_SUBSTANCES in spec.capabilities and tier == 1:
        cost += 1 / SUBSTANCE_EVERY_DAYS
    return cost


def cost(spec: ProviderSpec, tier: int, rate: str, listings: float) -> float:
    """Calls a day one part costs at one provider. Nothing for a provider that is not metered."""

    if not spec.metered:
        return 0.0
    if listings <= 0:
        # A provider that does not carry the part is still searched now and then, and nothing more.
        return search_cost(spec, tier, carried=False)
    return read_cost(spec, rate, listings) + extra_cost(spec, tier)


def total(costs: Iterable[float]) -> int:
    """A list of part costs as whole calls a day, rounded up (batches are paid for whole)."""

    return math.ceil(round(sum(costs), 9))


def pick_saving(spec: ProviderSpec, tier: int, rate: str, listings: int) -> float:
    """Calls a day a packaging pick would save: all the part's listings against one, where a pick limits what is read."""

    if not picks_limit_reads(spec):
        return 0.0
    return max(0.0, cost(spec, tier, rate, listings) - cost(spec, tier, rate, 1))
