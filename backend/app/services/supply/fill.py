"""Fill from distributor: look a part up at the connected distributors, to fill catalog fields.

Two steps, so a lookup costs what it must. ``search`` asks every usable connector once for the
part number. ``details`` asks one connector for one candidate's description and datasheet, once
the person has picked it. Calls spend the interactive reserve, never the polling budget.

Nothing here writes to the catalog. The person reviews the suggested fields and saves them
through the normal metadata edit, which makes a new revision.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Callable

from app.services.supply import clock as supply_clock
from app.services.supply import ledger, trouble
from app.services.supply.connectors import ConnectorService
from app.services.supply.identity import match_key
from app.services.supply.makers import same_maker
from app.services.supply.models import PartMatch
from app.services.supply.providers import registry
from app.services.supply.providers.base import CAP_SEARCH, ProviderError, SupplyProvider
from app.services.supply.errors import Refused

MAX_CANDIDATES_PER_CONNECTOR = 5


class FillError(Refused):
    """The request cannot be served. The message is safe to show."""

    code = "fill_error"


def _unusable(connector: dict[str, Any], now: datetime, service: ConnectorService) -> str | None:
    """Why this connector cannot be asked, or None."""

    if not connector["enabled"]:
        return "disabled"
    if connector["paused_reason"]:
        return "paused"
    if not connector["provider_available"]:
        return "provider missing"
    if CAP_SEARCH not in registry.get_spec(connector["provider"]).capabilities:
        return "cannot search"
    if trouble.cooling_down(service.store, connector["id"], now):
        return "cooling down"
    return None


class FillService:
    def __init__(
        self,
        connectors: ConnectorService,
        *,
        provider_for: Callable[[str], SupplyProvider] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._connectors = connectors
        self._provider_for = provider_for or connectors.load_provider
        self._clock = clock or supply_clock.now

    def search(self, mpn: str, manufacturer: str = "") -> dict[str, Any]:
        mpn = mpn.strip()
        if not mpn:
            raise FillError("Enter a manufacturer part number to look up.")
        wanted = match_key(mpn)
        now = self._clock()
        candidates: list[dict[str, Any]] = []
        skipped: list[dict[str, str]] = []
        for connector in self._connectors.list():
            name = connector["display_name"]
            reason = _unusable(connector, now, self._connectors)
            if reason:
                skipped.append({"connector": name, "reason": reason})
                continue
            if not self._spend(connector, now):
                skipped.append({"connector": name, "reason": "daily lookup allowance used"})
                continue
            try:
                matches = self._provider_for(connector["id"]).lookup_mpn(mpn, manufacturer or None)
            except ProviderError as exc:
                trouble.react(self._connectors, self._connectors.store, connector["id"], exc, now)
                skipped.append({"connector": name, "reason": "the distributor did not answer"})
                continue
            # A distributor's own number (an LCSC "C7950") finds the part too, whatever its manufacturer number is.
            exact = [m for m in matches if wanted in (match_key(m.mpn), match_key(m.sku))][:MAX_CANDIDATES_PER_CONNECTOR]
            candidates += [_candidate(connector, m, manufacturer) for m in exact]
            if not exact:
                skipped.append({"connector": name, "reason": "no match"})
        # Stable: the same manufacturer first, the rest in connector order.
        candidates.sort(key=lambda item: not item["manufacturer_matches"])
        return {"candidates": candidates, "skipped": skipped}

    def details(self, connector_id: str, sku: str, mpn: str, manufacturer: str) -> dict[str, Any]:
        now = self._clock()
        connector = self._connectors.get(connector_id)
        reason = _unusable(connector, now, self._connectors)
        if reason:
            raise FillError(f"{connector['display_name']} cannot be asked now ({reason}).")
        if not self._spend(connector, now):
            raise FillError(f"The daily lookup allowance for {connector['display_name']} is used.")
        match = PartMatch(provider=connector["provider"], sku=sku, mpn=mpn, manufacturer=manufacturer)
        try:
            data = self._provider_for(connector_id).get_part_data(match)
        except ProviderError as exc:
            trouble.react(self._connectors, self._connectors.store, connector_id, exc, now)
            raise FillError(f"{connector['display_name']} did not answer.") from exc
        return {
            "description": data.description,
            "datasheet_url": data.datasheet_url,
            "package_name": data.package_name,
            "category": data.category,
        }

    def _spend(self, connector: dict[str, Any], now: datetime) -> bool:
        if not connector["metered"]:
            return True
        return ledger.spend_call(self._connectors.store, connector, now=now, interactive=True, kind=ledger.KIND_SEARCH)


def _candidate(connector: dict[str, Any], match: PartMatch, asked_manufacturer: str) -> dict[str, Any]:
    asked = asked_manufacturer.strip().casefold()
    return {
        "connector_id": connector["id"],
        "connector": connector["display_name"],
        "provider": connector["provider"],
        "sku": match.sku,
        "mpn": match.mpn,
        "manufacturer": match.manufacturer,
        "description": match.description,
        "product_url": match.product_url,
        "manufacturer_matches": bool(asked) and same_maker(asked_manufacturer, match.manufacturer),
    }
