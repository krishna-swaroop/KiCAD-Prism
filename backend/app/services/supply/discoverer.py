"""Finding listings for followed parts, on a schedule.

A followed part has no listings until a distributor has been asked about it. A part is searched at a connector once it
is admitted there (``admission.py``), the first time from the pool the budget keeps for one-off work (a person's
reads), and again from the committed share: where it was found, every month at tier 1 and every quarter at tier 2;
where nothing was found, every two weeks at tier 1 and every month at tier 2, so a distributor that starts stocking a part
is noticed. A search
costs a call like any other, so it spends the budget and stops when the budget does. A provider that can look up
several numbers in one call (``search_batch``) is asked for a group of parts at once. Parts a distributor does not
carry are recorded as searched, so they are not searched on every scan.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Callable

from app.services.supply import clock as supply_clock
from app.services.supply import admission, budget, ledger, library_match, parts, trouble
from app.services.supply.connectors import ConnectorService
from app.services.supply.discovery import DiscoveryService
from app.services.supply.identity import match_key
from app.services.supply.providers import registry
from app.services.supply.providers.base import CAP_SEARCH, BatchSearch, CallCounting, FamilySearch, ProviderError, SupplyProvider, calls_made
from app.services.supply.store import SupplyStore, supply_store

# How long after a search a part is searched again, by tracking tier: where it was found, and where nothing was (``budget.py`` has the days).
RESEARCH_AFTER = {tier: timedelta(days=days) for tier, days in budget.SEARCH_EVERY_DAYS.items()}
RESEARCH_MISSING_AFTER = {tier: timedelta(days=days) for tier, days in budget.SEARCH_MISSING_EVERY_DAYS.items()}
MAX_PER_RUN = 10

STOPPED_INACTIVE = "inactive"
STOPPED_COOLING_DOWN = "cooling_down"
STOPPED_UNSUPPORTED = "unsupported"
STOPPED_BUDGET = "budget"


@dataclass(frozen=True, slots=True)
class DiscoverySummary:
    connector_id: str
    searched: int = 0
    listings: int = 0
    stopped: str | None = None


# Which followed parts are due a search at connector ``c``: admitted there, and never searched or searched longer ago than
# their tier waits (``%(tier1)s`` and ``%(tier2)s`` are the cut-off times); a connector that costs nothing needs no
# admission (``%(free)s`` lists those providers). Aliases: c connectors, pt part_tiers, a admissions, d discovery_runs.
# Shared with the job scheduler.
DUE_SEARCH = """
    (a.state = 'admitted' OR c.provider = ANY(%(free)s)) AND (d.part_id IS NULL OR d.last_run_at <= CASE
        WHEN d.found = 0 AND pt.tier = 1 THEN %(missing1)s::timestamptz
        WHEN d.found = 0 THEN %(missing2)s::timestamptz
        WHEN pt.tier = 1 THEN %(tier1)s::timestamptz ELSE %(tier2)s::timestamptz END)
"""


def cutoffs(now: datetime) -> dict[str, Any]:
    return {
        "tier1": now - RESEARCH_AFTER[1], "tier2": now - RESEARCH_AFTER[2],
        "missing1": now - RESEARCH_MISSING_AFTER[1], "missing2": now - RESEARCH_MISSING_AFTER[2],
        "free": [spec.key for spec in registry.list_specs(include_dev=True) if not spec.metered],
    }


@dataclass(frozen=True, slots=True)
class PendingPart:
    part_id: str
    tier: int
    first: bool


def pending_waiting(conn, connector_id: str, now: datetime, limit: int) -> list[PendingPart]:
    """Parts that wait for room here and are due a search: never searched, or searched longer ago than a part admitted here would be
    (the found and not-found cadences). Their searches come from spare budget."""

    rows = conn.execute(
        """
        SELECT pt.part_id, pt.tier, (d.part_id IS NULL) AS first FROM supply_part_tiers pt
        JOIN supply_admissions a ON a.part_id = pt.part_id AND a.connector_id = %(connector)s AND a.state = 'waiting'
        LEFT JOIN supply_discovery_runs d ON d.part_id = pt.part_id AND d.connector_id = a.connector_id
        WHERE d.part_id IS NULL OR d.last_run_at <= CASE
            WHEN d.found = 0 AND pt.tier = 1 THEN %(missing1)s::timestamptz
            WHEN d.found = 0 THEN %(missing2)s::timestamptz
            WHEN pt.tier = 1 THEN %(tier1)s::timestamptz ELSE %(tier2)s::timestamptz END
        ORDER BY (d.part_id IS NULL) DESC, pt.tier, COALESCE(d.last_run_at, '-infinity'::timestamptz), pt.part_id LIMIT %(limit)s
        """,
        {"connector": connector_id, "limit": limit, **cutoffs(now)},
    ).fetchall()
    return [PendingPart(row["part_id"], int(row["tier"]), bool(row["first"])) for row in rows]


def pending_parts(conn, connector_id: str, now: datetime, limit: int) -> list[PendingPart]:
    """Followed parts to search for at this connector: those never searched first, then the longest waiting."""

    rows = conn.execute(
        f"""
        SELECT pt.part_id, pt.tier, (d.part_id IS NULL) AS first
        FROM supply_part_tiers pt
        JOIN supply_connectors c ON c.id = %(connector)s
        LEFT JOIN supply_admissions a ON a.part_id = pt.part_id AND a.connector_id = c.id
        LEFT JOIN supply_discovery_runs d ON d.part_id = pt.part_id AND d.connector_id = c.id
        WHERE {DUE_SEARCH}
        ORDER BY (d.part_id IS NULL) DESC, pt.tier, COALESCE(d.last_run_at, '-infinity'::timestamptz), pt.part_id
        LIMIT %(limit)s
        """,
        {"connector": connector_id, "limit": limit, **cutoffs(now)},
    ).fetchall()
    return [PendingPart(row["part_id"], int(row["tier"]), bool(row["first"])) for row in rows]


def cut_groups(conn, part_ids: list[str], size: int) -> list[list[str]]:
    """Groups of parts whose numbers (each part's own and the others it is searched as) fit one call of ``size`` numbers, in order.
    A part with more numbers than that is a group of its own and the search charges its further calls."""

    if size <= 1:
        return [[part_id] for part_id in part_ids]
    groups: list[list[str]] = []
    asked: set[str] = set()
    for part_id in part_ids:
        part = parts.get_part(conn, part_id)
        numbers = set(dict.fromkeys([part.mpn, *parts.searched_numbers(conn, part_id)]))
        if groups and len(asked | numbers) <= size:
            groups[-1].append(part_id)
            asked |= numbers
        else:
            groups.append([part_id])
            asked = numbers
    return groups


class Discoverer:
    def __init__(
        self,
        connectors: ConnectorService,
        *,
        store: SupplyStore = supply_store,
        provider_for: Callable[[str], SupplyProvider] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._connectors = connectors
        self._store = store
        self._provider_for = provider_for or connectors.load_provider
        self._clock = clock or supply_clock.now

    def run(self, connector_id: str, *, limit: int = MAX_PER_RUN, waiting: bool = False, library: bool = False) -> DiscoverySummary:
        """Search for the parts due one. With ``waiting``, search for the parts that wait for room; with ``library``, the library
        parts nothing follows (``library_match``). Both from spare budget only."""

        now = self._clock()
        connector = self._connectors.get(connector_id)
        if not connector["enabled"] or connector["paused_reason"] or not connector["provider_available"]:
            return DiscoverySummary(connector_id, stopped=STOPPED_INACTIVE)
        spec = registry.get_spec(connector["provider"])
        if CAP_SEARCH not in spec.capabilities:
            return DiscoverySummary(connector_id, stopped=STOPPED_UNSUPPORTED)
        if trouble.cooling_down(self._store, connector_id, now):
            return DiscoverySummary(connector_id, stopped=STOPPED_COOLING_DOWN)
        group_size = max(spec.search_batch, 1)
        with self._store.connection() as conn:
            if library:
                # Searched at the slowest tier's terms; spare budget pays, so the tier only names the work.
                pending = [PendingPart(part_id, 2, True) for part_id in library_match.pending(conn, connector_id, spec.key, now, limit * group_size)]
            elif waiting:
                pending = pending_waiting(conn, connector_id, now, limit * group_size)
            else:
                pending = pending_parts(conn, connector_id, now, limit * group_size)
        if not pending:
            return DiscoverySummary(connector_id)

        provider = self._provider_for(connector_id)
        service = self._service(provider, connector_id, spec)
        searched = listings = 0
        stopped: str | None = None
        # Asked once, before searching: the listings the searches find are read by the next job, not ahead of what was due already.
        reads_due = any(item.first for item in pending) and self._read_is_due(connector_id, now)
        # A first search is scheduled work, paid from the background allowance unless a read is due, then the pool; a repeat comes from the committed share.
        for first in (True, False):
            todo = [item for item in pending if item.first is first]
            with self._store.connection() as conn:
                by_id = {item.part_id: item for item in todo}
                groups = [[by_id[part_id] for part_id in ids] for ids in cut_groups(conn, list(by_id), group_size)]
            for group in groups:
                paid = (ledger.PURPOSE_ONE_OFF, True)
                if spec.metered:
                    paid = self._spend(connector, first, min(item.tier for item in group), reads_due=reads_due, spare_only=waiting or library)
                    if paid is None:
                        stopped = STOPPED_BUDGET
                        break
                try:
                    results = self._search(
                        service, provider, [item.part_id for item in group], connector_id, batched=group_size > 1,
                        charge=lambda extra, paid=paid: self._charge_extra(connector_id, extra, paid[0], interactive=paid[1]),
                    )
                except ProviderError as exc:
                    return DiscoverySummary(
                        connector_id, searched=searched, listings=listings, stopped=trouble.react(self._connectors, self._store, connector_id, exc, now)
                    )
                for part_id, result in results.items():
                    searched += 1
                    listings += result.total
                    with self._store.connection() as conn:
                        conn.execute(
                            "INSERT INTO supply_discovery_runs (part_id, connector_id, last_run_at, found) VALUES (%s, %s, %s, %s) "
                            "ON CONFLICT (part_id, connector_id) DO UPDATE SET last_run_at = EXCLUDED.last_run_at, found = EXCLUDED.found",
                            (part_id, connector_id, now, result.total),
                        )
        searched_ids = [part_id for part_id in {item.part_id for item in pending} if part_id]
        if isinstance(provider, FamilySearch) and searched_ids:
            self._follow_up(service, connector_id, searched_ids)
        if searched:
            # What the searches found replaces the estimate admission was made on.
            with self._store.connection() as conn:
                admission.sync(conn)
        return DiscoverySummary(connector_id, searched=searched, listings=listings, stopped=stopped)

    def search_parts(self, connector_id: str, part_ids: list[str]) -> tuple[int, str | None]:
        """Search for these parts now, for a check someone asked for once: paid from the pool, then from spare budget.

        Returns how many were searched and why it stopped early, if it did. Parts already searched are not searched again.
        """

        now = self._clock()
        connector = self._connectors.get(connector_id)
        spec = registry.get_spec(connector["provider"])
        if (not connector["enabled"] or connector["paused_reason"] or not connector["provider_available"]
                or CAP_SEARCH not in spec.capabilities):
            return 0, STOPPED_INACTIVE
        if trouble.cooling_down(self._store, connector_id, now):
            return 0, STOPPED_COOLING_DOWN
        with self._store.connection() as conn:
            done = {r["part_id"] for r in conn.execute(
                "SELECT part_id FROM supply_discovery_runs WHERE connector_id = %s AND part_id = ANY(%s)", (connector_id, part_ids)).fetchall()}
        todo = [part_id for part_id in part_ids if part_id not in done]
        provider = self._provider_for(connector_id)
        service = self._service(provider, connector_id, spec)
        size = max(spec.search_batch, 1)
        searched = 0
        with self._store.connection() as conn:
            groups = cut_groups(conn, todo, size)
        for group in groups:
            if spec.metered and ledger.fund(self._store, connector, ledger.ONE_OFF, now=now, kind=ledger.KIND_SEARCH) is None:
                return searched, STOPPED_BUDGET
            try:
                results = self._search(
                    service, provider, group, connector_id, batched=size > 1,
                    charge=lambda extra: self._charge_extra(connector_id, extra, ledger.PURPOSE_ONE_OFF, interactive=True),
                )
            except ProviderError as exc:
                return searched, trouble.react(self._connectors, self._store, connector_id, exc, now)
            for part_id, result in results.items():
                searched += 1
                with self._store.connection() as conn:
                    conn.execute(
                        "INSERT INTO supply_discovery_runs (part_id, connector_id, last_run_at, found) VALUES (%s, %s, %s, %s) "
                        "ON CONFLICT (part_id, connector_id) DO UPDATE SET last_run_at = EXCLUDED.last_run_at, found = EXCLUDED.found",
                        (part_id, connector_id, now, result.total),
                    )
        return searched, None

    def _service(self, provider: SupplyProvider, connector_id: str, spec) -> DiscoveryService:
        """The search service. For a provider whose search answer is also a read, the offers it brings are recorded as that read."""

        service = DiscoveryService(lambda _id: provider, self._store, self._clock)
        if spec.search_reads_offers:
            from app.services.supply import poller

            reader = poller.Poller(self._connectors, store=self._store, provider_for=lambda _id: provider, clock=self._clock)
            service.record_offers = reader.record_search_offers
        return service

    def _read_is_due(self, connector_id: str, now: datetime) -> bool:
        from app.services.supply import poller

        with self._store.connection() as conn:
            return bool(poller.due_listings(conn, connector_id, now, 1, metered=True))

    def _spend(self, connector, first: bool, tier: int, *, reads_due: bool = False, spare_only: bool = False) -> tuple[str, bool] | None:
        """Pay for one search. A first search is scheduled work: while no committed read is due (``reads_due``) it is paid from the background allowance
        (counted as the tier's tracking), else from the pool (half of which stays for people), then from free calls; a repeat from the
        committed share. Returns what paid, as (purpose, from the pool), or None when nothing could."""

        sources = (
            (ledger.SPARE,) if spare_only else (ledger.committed(tier),) if not first else ledger.first_search(tier, reads_due=reads_due)
        )
        paid = ledger.fund(self._store, connector, sources, now=self._clock(), kind=ledger.KIND_SEARCH)
        return None if paid is None else (paid.purpose, paid.interactive)

    def _charge_extra(self, connector_id: str, extra: int, purpose: str, *, interactive: bool) -> None:
        """Calls a search made beyond the one it paid for are counted, so the day's figure stays the provider's."""

        connector = self._connectors.get(connector_id)
        if registry.get_spec(connector["provider"]).metered:
            ledger.record_calls(self._store, connector_id, extra, now=self._clock(), interactive=interactive, kind=ledger.KIND_SEARCH, purpose=purpose)

    def _search(
        self, service: DiscoveryService, provider: SupplyProvider, group: list[str], connector_id: str, *, batched: bool,
        charge: Callable[[int], None] | None = None,
    ):
        """One search call for ``group``; the result for each part, keyed by part id. A group that asks more numbers than one call
        takes (a part with several numbers, alone) makes more calls, which ``charge`` counts."""

        before, paid = calls_made(provider), [1]

        def spend() -> bool:
            granted = self._spend_extra(connector_id)
            paid[0] += granted
            return granted

        if not batched:
            try:
                return {group[0]: service.discover(group[0], connector_id, spend=spend)}
            finally:
                # What the search made beyond what it paid for (a new token, a repeat after a refusal) is a call too, answered or not.
                extra = calls_made(provider) - before - paid[0]
                if charge and extra > 0:
                    charge(extra)
        with self._store.connection() as conn:
            found = [parts.get_part(conn, part_id) for part_id in group]
            extra = {part.id: parts.searched_numbers(conn, part.id) for part in found}
        asked = list(dict.fromkeys([part.mpn for part in found] + [number for numbers in extra.values() for number in numbers]))
        if not isinstance(provider, BatchSearch):
            raise ProviderError("this provider cannot search several numbers in one call")
        try:
            answers = provider.lookup_mpns(asked)
        finally:
            # More numbers than one call takes, a new token or a repeat: each call beyond the one paid for is charged.
            calls = calls_made(provider) - before
            if not isinstance(provider, CallCounting):
                calls = -(-len(asked) // max(registry.get_spec(self._connectors.get(connector_id)["provider"]).search_batch, 1))
            if charge and calls > 1:
                charge(calls - 1)
        results = {}
        for part in found:
            matches = list(answers.get(match_key(part.mpn), []))
            for number in extra[part.id]:
                matches += [match for match in answers.get(match_key(number), []) if match.sku not in {m.sku for m in matches}]
            results[part.id] = service.apply(part, matches, connector_id)
        return results

    def _follow_up(self, service: DiscoveryService, connector_id: str, part_ids: list[str]) -> None:
        """For parts searched here that still have no counted listing anywhere, one looser search for their longer numbers, from
        spare budget, once (again when the part's numbers change). A failure leaves it for the next scan."""

        with self._store.connection() as conn:
            due = [row["part_id"] for row in conn.execute(
                """
                SELECT d.part_id FROM supply_discovery_runs d
                WHERE d.connector_id = %s AND d.part_id = ANY(%s) AND NOT d.family_done
                  AND NOT EXISTS (SELECT 1 FROM supply_listings l WHERE l.part_id = d.part_id AND supply_counted(l.match_state))
                """,
                (connector_id, part_ids),
            ).fetchall()]
        for part_id in due:
            if not self._spend_extra(connector_id):
                return
            try:
                service.discover_family(part_id, connector_id)
            except ProviderError:
                return
            with self._store.connection() as conn:
                conn.execute("UPDATE supply_discovery_runs SET family_done = TRUE WHERE part_id = %s AND connector_id = %s", (part_id, connector_id))

    def _spend_extra(self, connector_id: str) -> bool:
        """One more search call for a part's other number, from spare budget only: the cost model does not count it, so it never
        takes from the committed share."""

        connector = self._connectors.get(connector_id)
        if not registry.get_spec(connector["provider"]).metered:
            return True
        now = self._clock()
        return ledger.spend_call(self._store, connector, now=now, kind=ledger.KIND_SEARCH, purpose=ledger.PURPOSE_SPARE, spare=True)
