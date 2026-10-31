"""Polling watched listings and recording what the distributor says.

One call to ``poll_connector`` takes the listings of one connector that are due,
spends the call budget in batches, asks the provider, and records the answer.
Provider calls happen outside any database transaction.

Reactions to trouble:

* budget spent: stop quietly; the rest stay due and wait for more budget
* rate limited: hold the whole connector off until the provider says
* credentials rejected: pause the connector so it stops spending anything
* unavailable or any other provider error: stop the run, back the batch off
* a SKU missing from an answer: tolerated twice, marked gone on the third
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from typing import Callable, Sequence

from app.services.supply import clock as supply_clock
from app.services.supply import accounts, alerts, budget, ledger, persist, tiers, trouble
from app.services.supply.connectors import ConnectorService
from app.services.supply.models import Offer
from app.services.supply.providers import registry
from app.services.supply.providers.base import AuthError, Blocked, ProviderError, RateLimited, SupplyProvider, calls_made
from app.services.supply import quota
from app.services.supply.store import SupplyStore, supply_store

MAX_BATCHES_PER_RUN = 20
# A tier-2 listing read early from spare budget is not read early again for this long.
EARLY_GAP = timedelta(days=1)
# For a provider that reads a part's listings together, how many due listings a run starts from per batch (a part
# usually has two or three packagings).
GROUP_LISTINGS = 3
# A scheduled batch that is not full waits for company this long (counted from when its oldest listing came due), unless the
# provider's day is about to end or a listing in it is urgent.
HOLD_PART_BATCH = timedelta(hours=2)

STOPPED_INACTIVE = "inactive"
STOPPED_COOLING_DOWN = "cooling_down"
STOPPED_NOTHING_DUE = "nothing_due"
STOPPED_BUDGET = "budget"


@dataclass(frozen=True, slots=True)
class DueListing:
    id: str
    sku: str
    part_id: str
    error_streak: int
    missing_streak: int
    last_change_at: datetime | None
    # The part's tracking tier (2 for a part nobody tracks), which says what the read is charged to.
    tier: int = 2
    # What the last failed read said ("" when it did not fail).
    last_error_code: str = ""
    # When the listing came due (None: never read) and how urgent it is (``tiers.Urgency``).
    due_at: datetime | None = None
    urgency: int = 2


@dataclass(frozen=True, slots=True)
class PollSummary:
    connector_id: str
    calls: int = 0
    polled: int = 0
    gone: int = 0
    stopped: str | None = None
    # Listings due but kept back to fill a batch; for spare work this counts as nothing due.
    holding: int = 0


# When the budget cannot serve everything, tier 1 comes before tier 2; within a tier a listing never read goes first, then
# the most urgent (low stock, near the threshold, ending life, projected to run out), then the one waiting longest.
_SERVICE_ORDER = (
    "pt.tier, (ps.listing_id IS NOT NULL), COALESCE(ps.urgency, 0), "
    "COALESCE(ps.next_poll_at, '-infinity'::timestamptz), l.part_id, l.sku"
)


def _due(r) -> DueListing:
    return DueListing(
        r["id"], r["sku"], r["part_id"], int(r["error_streak"]), int(r["missing_streak"]), r["last_change_at"], int(r["tier"]),
        r.get("last_error_code") or "", r.get("due_at"), int(r.get("urgency", 2)),
    )


def due_listings(
    conn, connector_id: str, now: datetime, limit: int, only_part: str | Sequence[str] | None = None, *, metered: bool = True,
    fresh_since: datetime | None = None,
) -> list[DueListing]:
    """Counted listings of followed parts that have never been polled or whose time has come.

    A part is read at a connector once it is admitted there (a connector that is not metered admits everything), and
    only the listing a person picked when one is picked.

    ``only_part`` (a part id, or several) asks for the counted listings of those parts whatever their schedule, tracked or not:
    it is a person asking to read one part now. ``fresh_since`` leaves out those whose offer was fetched at or after it (a search that
    brings the offer has just read them).
    """

    if only_part is not None:
        rows = conn.execute(
            """
            SELECT l.id, l.sku, l.part_id, COALESCE(ps.error_streak, 0) AS error_streak,
                   COALESCE(ps.missing_streak, 0) AS missing_streak, ps.last_change_at,
                   COALESCE((SELECT pt.tier FROM supply_part_tiers pt WHERE pt.part_id = l.part_id), 2) AS tier
            FROM supply_listings l LEFT JOIN supply_poll_state ps ON ps.listing_id = l.id LEFT JOIN supply_offers o ON o.listing_id = l.id
            WHERE l.connector_id = %s AND l.part_id = ANY(%s) AND supply_counted(l.match_state)
              AND (%s::timestamptz IS NULL OR o.fetched_at IS NULL OR o.fetched_at < %s)
            ORDER BY l.part_id, l.sku LIMIT %s
            """,
            (connector_id, [only_part] if isinstance(only_part, str) else list(only_part), fresh_since, fresh_since, limit),
        ).fetchall()
        return [
            _due(r)
            for r in rows
        ]
    rows = conn.execute(
        f"""
        SELECT l.id, l.sku, l.part_id, COALESCE(ps.error_streak, 0) AS error_streak,
               COALESCE(ps.missing_streak, 0) AS missing_streak, ps.last_change_at, pt.tier,
               COALESCE(ps.last_error_code, '') AS last_error_code, ps.next_poll_at AS due_at, COALESCE(ps.urgency, 2) AS urgency
        FROM supply_listings l
        JOIN supply_part_tiers pt ON pt.part_id = l.part_id
        LEFT JOIN supply_admissions a ON a.part_id = l.part_id AND a.connector_id = l.connector_id
        JOIN supply_connectors c ON c.id = l.connector_id
        LEFT JOIN supply_packaging_picks pk ON pk.part_id = l.part_id AND pk.connector_id = l.connector_id AND c.provider = ANY(%s)
        LEFT JOIN supply_poll_state ps ON ps.listing_id = l.id
        WHERE l.connector_id = %s AND supply_counted(l.match_state)
          AND (NOT %s OR a.state = 'admitted')
          AND (pk.listing_id IS NULL OR pk.listing_id = l.id OR ps.listing_id IS NULL)
          AND (ps.listing_id IS NULL OR ps.next_poll_at <= %s)
        ORDER BY {_SERVICE_ORDER}
        LIMIT %s
        """,
        (budget.providers_limited_by_picks(), connector_id, metered, now, limit),
    ).fetchall()
    return [
        _due(r)
        for r in rows
    ]


def spare_listings(conn, connector_id: str, now: datetime, limit: int, kind: str) -> list[DueListing]:
    """Listings to read from spare budget.

    ``overdue``: listings admitted here whose committed read is due and was not made (the budget for committed reads ran out first,
    or a batch was held for company); spare budget goes to these before any other spare work. They are still committed work: a
    batch that is not full waits as the scheduled read does, and the calls are counted to the listings' tier.
    ``waiting``: counted listings of parts that wait for room here, not read since their rate asks.
    ``tier2_early``: tier-2 listings admitted here that are not yet due, the soonest due first, and not read in the last
    ``EARLY_GAP``: early reads make a tier-2 part fresher, never read more often than a tier-1 one.
    """

    if kind == "overdue":
        where = "a.state = 'admitted' AND ps.listing_id IS NOT NULL AND ps.next_poll_at <= %(now)s"
        order = "pt.tier, ps.next_poll_at, l.part_id, l.sku"
    elif kind == "waiting":
        where = "a.state = 'waiting' AND (ps.listing_id IS NULL OR ps.next_poll_at <= %(now)s)"
        order = "COALESCE(ps.next_poll_at, '-infinity'::timestamptz), l.sku"
    elif kind == "tier2_early":
        where = (
            "a.state = 'admitted' AND pt.tier = 2 AND ps.listing_id IS NOT NULL AND ps.next_poll_at > %(now)s"
            " AND (ps.last_polled_at IS NULL OR ps.last_polled_at <= %(early)s)"
        )
        order = "ps.next_poll_at, l.sku"
    else:
        raise ValueError(f"unknown spare work: {kind}")
    rows = conn.execute(
        f"""
        SELECT l.id, l.sku, l.part_id, COALESCE(ps.error_streak, 0) AS error_streak,
               COALESCE(ps.missing_streak, 0) AS missing_streak, ps.last_change_at, pt.tier,
               COALESCE(ps.last_error_code, '') AS last_error_code, ps.next_poll_at AS due_at, COALESCE(ps.urgency, 2) AS urgency
        FROM supply_listings l
        JOIN supply_part_tiers pt ON pt.part_id = l.part_id
        JOIN supply_admissions a ON a.part_id = l.part_id AND a.connector_id = l.connector_id
        JOIN supply_connectors c ON c.id = l.connector_id
        LEFT JOIN supply_packaging_picks pk ON pk.part_id = l.part_id AND pk.connector_id = l.connector_id AND c.provider = ANY(%(limited)s)
        LEFT JOIN supply_poll_state ps ON ps.listing_id = l.id
        WHERE l.connector_id = %(connector)s AND supply_counted(l.match_state)
          AND (pk.listing_id IS NULL OR pk.listing_id = l.id) AND {where}
        ORDER BY {order}
        LIMIT %(limit)s
        """,
        {"connector": connector_id, "now": now, "limit": limit, "early": now - EARLY_GAP, "limited": budget.providers_limited_by_picks()},
    ).fetchall()
    return [
        _due(r)
        for r in rows
    ]


def _chunks(items: Sequence[DueListing], size: int) -> list[Sequence[DueListing]]:
    return [items[i:i + size] for i in range(0, len(items), size)]


MAX_SPLIT = 6


def _worth_sending(batch: Sequence[DueListing], now: datetime, reset: tuple[str, str]) -> bool:
    """Whether a batch that is not full goes out now: a listing in it never read, urgent, or due for two hours, or the provider's
    day ending within two hours (so what is left of its budget is not lost), or listings that failed or went missing (they are retried on their own clock)."""

    if any(row.due_at is None or row.urgency <= tiers.Urgency.HOT or row.error_streak > 0 or row.missing_streak > 0 for row in batch):
        return True
    if now - min(row.due_at for row in batch) >= HOLD_PART_BATCH:
        return True
    return quota.seconds_to_reset(now, reset[0], reset[1]) < HOLD_PART_BATCH.total_seconds()


def split_into_batches(due: Sequence[DueListing], spec) -> list[Sequence[DueListing]]:
    """The calls a provider's due listings make: parts together for one that groups by part, else batches of its size."""

    return _by_part(due, spec.max_batch) if spec.groups_by_part else _batches(due, spec.max_batch)


def hold_back(due: Sequence[DueListing], spec, now: datetime, reset: tuple[str, str]) -> tuple[list[Sequence[DueListing]], int]:
    """The batches to send now and how many listings are kept back to fill a batch. Only a provider that batches (``max_batch`` over
    1) holds, and only the last, short batch (``_worth_sending``). The poller and the scanner that queues it both ask this, so the
    scanner does not queue a job the poller will only answer with "nothing due"."""

    batches = split_into_batches(due, spec)
    if spec.max_batch > 1 and batches:
        last = batches[-1]
        full = len({row.part_id for row in last}) >= spec.max_batch if spec.groups_by_part else len(last) >= spec.max_batch
        if not full and not _worth_sending(last, now, reset):
            return batches[:-1], len(last)
    return batches, 0


def _batches(items: Sequence[DueListing], size: int) -> list[Sequence[DueListing]]:
    """Batches of ``size``, except that listings whose last reads failed go in smaller ones: half the size for a second failure, a
    quarter for a third, and so on, grouped by how many times they failed. A bad listing in a batch fails it for the good ones too; this
    way the good ones split off within a few tries and the bad one ends alone. A provider that was unavailable says nothing of the
    listing, so those keep the full size."""

    levels: dict[int, list[DueListing]] = {}
    for item in items:
        level = 0 if item.error_streak < 2 or item.last_error_code == "unavailable" else min(item.error_streak - 1, MAX_SPLIT)
        levels.setdefault(level, []).append(item)
    return [chunk for level in sorted(levels) for chunk in _chunks(levels[level], max(1, size // 2 ** level))]


def _by_part(items: Sequence[DueListing], parts_per_call: int = 1) -> list[Sequence[DueListing]]:
    """Listings grouped by part, in the order each part first appears (the service order). A provider that answers for several parts
    in one call (``max_batch`` over 1, as Arrow does) gets whole parts packed together, up to ``parts_per_call`` of them."""

    groups: dict[str, list[DueListing]] = {}
    for item in items:
        groups.setdefault(item.part_id, []).append(item)
    parts = list(groups.values())
    size = max(parts_per_call, 1)
    return [[row for part in parts[start:start + size] for row in part] for start in range(0, len(parts), size)]


def with_siblings(conn, connector_id: str, due: Sequence[DueListing]) -> list[DueListing]:
    """``due`` plus the other counted listings of the same parts at this connector.

    For a provider whose one answer serves all of a part's listings, the others come for free, so they are read
    in the same call rather than later in calls of their own.
    """

    have = {item.id for item in due}
    part_ids = sorted({item.part_id for item in due})
    if not part_ids:
        return list(due)
    rows = conn.execute(
        """
        SELECT l.id, l.sku, l.part_id, COALESCE(ps.error_streak, 0) AS error_streak,
               COALESCE(ps.missing_streak, 0) AS missing_streak, ps.last_change_at,
               COALESCE((SELECT pt.tier FROM supply_part_tiers pt WHERE pt.part_id = l.part_id), 2) AS tier
        FROM supply_listings l LEFT JOIN supply_poll_state ps ON ps.listing_id = l.id
        WHERE l.connector_id = %s AND l.part_id = ANY(%s) AND supply_counted(l.match_state) AND NOT (l.id = ANY(%s))
        ORDER BY l.sku
        """,
        (connector_id, part_ids, sorted(have)),
    ).fetchall()
    extra = [
        _due(r)
        for r in rows
    ]
    return list(due) + extra


class Poller:
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
        self.now = self._clock
        # The rupture projection of a part, worked out once per poll: its listings are recorded one after another.
        # The provider's day for the connector being polled, which sets when a daily listing is next due.
        self._reset: tuple[str, str] = ("00:00", "UTC")
        # What shares the connector's budget (its account), which sets when its reads open.
        self._account = ""

    def poll_connector(
        self, connector_id: str, *, interactive: bool = False, only_part: str | Sequence[str] | None = None, spare: str | None = None,
        oneoff: bool = False, fresh_since: datetime | None = None,
    ) -> PollSummary:
        """Read what is due. With ``spare`` (a kind from ``spare_listings``) read that spare work instead, from spare budget.

        ``oneoff`` marks a check someone asked for once (``oneoff.py``): paid from the pool, and from spare budget when the
        pool is empty.
        """

        now = self._clock()
        connector = self._connectors.get(connector_id)
        if not connector["enabled"] or connector["paused_reason"] or not connector["provider_available"]:
            return PollSummary(connector_id, stopped=STOPPED_INACTIVE)
        spec = registry.get_spec(connector["provider"])
        self._reset = (connector["reset_time"], connector["reset_tz"])
        with self._store.connection() as conn:
            self._account = accounts.resolve(conn, connector_id).ledger_id
        writer = persist.Writer(account=self._account, reset=self._reset)

        if trouble.cooling_down(self._store, connector_id, now):
            return PollSummary(connector_id, stopped=STOPPED_COOLING_DOWN)
        with self._store.connection() as conn:
            limit = (GROUP_LISTINGS * spec.max_batch if spec.groups_by_part else spec.max_batch) * MAX_BATCHES_PER_RUN
            due = (
                spare_listings(conn, connector_id, now, limit, spare) if spare
                else due_listings(conn, connector_id, now, limit, only_part, metered=spec.metered, fresh_since=fresh_since)
            )
            if spec.groups_by_part:
                due = with_siblings(conn, connector_id, due)
        if not due:
            return PollSummary(connector_id, stopped=STOPPED_NOTHING_DUE)

        # Late committed reads made from spare budget wait for company too, or a held batch would go out alone right after.
        committed = spare in (None, "overdue")
        if committed and not (interactive or oneoff or only_part is not None):
            batches, holding = hold_back(due, spec, now, self._reset)
            if not batches:
                return PollSummary(connector_id, stopped=STOPPED_NOTHING_DUE, holding=holding)
        else:
            batches, holding = split_into_batches(due, spec), 0

        provider = self._provider_for(connector_id)
        calls = polled = gone = 0
        stopped: str | None = None
        for batch in batches:
            sources = (
                ledger.ONE_OFF if oneoff else (ledger.PEOPLE,) if interactive else (ledger.SPARE,) if not committed
                else (ledger.committed(min(row.tier for row in batch)),)
            )
            if spare and committed:
                # Late committed reads, paid from free calls but counted as their tier's.
                sources = (ledger.Source(sources[0].purpose, spare=True),)
            paid = ledger.fund(self._store, connector, sources, now=now, kind=ledger.KIND_OFFERS, units=spec.calls_per_offers_batch) if spec.metered else sources[0]
            if paid is None:
                stopped = STOPPED_BUDGET
                break
            purpose = paid.purpose
            calls += 1
            before = calls_made(provider)
            try:
                try:
                    offers = provider.get_offers([row.sku for row in batch])
                finally:
                    # What the batch made beyond what it paid for (a group of two products, a new token, a repeat after a
                    # refusal) is a call too, answered or not.
                    extra = calls_made(provider) - before - spec.calls_per_offers_batch
                    if extra > 0 and spec.metered:
                        ledger.record_calls(
                            self._store, connector_id, extra, now=now, interactive=interactive, kind=ledger.KIND_OFFERS, purpose=purpose
                        )
                        calls += extra
            except ProviderError as exc:
                if not isinstance(exc, (RateLimited, AuthError, Blocked)):
                    # Only a failure of this batch is the batch's fault; a rate limit or
                    # bad credentials say nothing about the listings.
                    self._record_failure(batch, now, exc.code)
                stopped = trouble.react(self._connectors, self._store, connector_id, exc, now)
                break
            with self._store.connection() as conn:
                gone += writer.record(conn, batch, offers, now)
                alerts.evaluate_parts(conn, (row.part_id for row in batch), now)
            polled += len(batch)
            self._connectors.record_result(connector_id)
        return PollSummary(connector_id, calls=calls, polled=polled, gone=gone, stopped=stopped, holding=holding)

    def record_search_offers(self, connector_id: str, items: Sequence[tuple[str, Offer]]) -> None:
        """Record offers that a search brought with its matches, as a read of those listings: for a provider whose search answer carries
        the whole offer, the first read is the search and the monthly search is a read too."""

        now = self._clock()
        connector = self._connectors.get(connector_id)
        self._reset = (connector["reset_time"], connector["reset_tz"])
        with self._store.connection() as conn:
            self._account = accounts.resolve(conn, connector_id).ledger_id
            listing_ids = [listing_id for listing_id, _offer in items]
            rows = conn.execute(
                """
                SELECT l.id, l.sku, l.part_id, COALESCE(ps.error_streak, 0) AS error_streak, COALESCE(ps.missing_streak, 0) AS missing_streak,
                       ps.last_change_at, COALESCE(pt.tier, 2) AS tier
                FROM supply_listings l LEFT JOIN supply_poll_state ps ON ps.listing_id = l.id LEFT JOIN supply_part_tiers pt ON pt.part_id = l.part_id
                WHERE l.id = ANY(%s)
                """,
                (listing_ids,),
            ).fetchall()
            batch = [_due(row) for row in rows]
            by_id = {listing_id: offer for listing_id, offer in items}
            offers = [replace(by_id[row.id], sku=row.sku) for row in batch if row.id in by_id]
            persist.Writer(account=self._account, reset=self._reset).record(conn, batch, offers, now)
            alerts.evaluate_parts(conn, (row.part_id for row in batch), now)

    # --- recording --------------------------------------------------------

    def _record_failure(self, batch: Sequence[DueListing], now: datetime, code: str) -> None:
        with self._store.connection() as conn:
            for row in batch:
                streak = row.error_streak + 1
                conn.execute(
                    """
                    INSERT INTO supply_poll_state (listing_id, tier, next_poll_at, last_polled_at, error_streak, last_error_code)
                    VALUES (%s, 'daily', %s, %s, %s, %s)
                    ON CONFLICT (listing_id) DO UPDATE SET
                        next_poll_at = EXCLUDED.next_poll_at, last_polled_at = EXCLUDED.last_polled_at,
                        error_streak = EXCLUDED.error_streak, last_error_code = EXCLUDED.last_error_code
                    """,
                    (row.id, tiers.retry_at(now, streak, key=row.id), now, streak, code[:64]),
                )
