"""The supply job: discover and poll one connector. And the scan that queues it.

``schedule_due_supply_jobs`` runs from prism-worker every minute. It finds the
connectors with work to do and queues one job each. The artifact key makes the
job system keep at most one per connector queued or running, so a slow
provider cannot pile up jobs.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Callable, Mapping

from app.services.supply import clock
from app.services.job_kinds import SUPPLY_RESOURCE, JobKind
from app.services.supply import (
    accounts, demand, details, ledger, library_match, notice_budget, oauth, oneoff, quota, substitutes, tasks,
)
from app.services.supply import settings as supply_settings
from app.services.supply.connectors import ConnectorService
from app.services.supply.discoverer import Discoverer, pending_parts, pending_waiting
from app.services.supply.poller import GROUP_LISTINGS, MAX_BATCHES_PER_RUN, Poller, due_listings, hold_back, spare_listings, with_siblings
from app.services.supply.providers import registry
from app.services.supply.providers.base import CAP_PCN, CAP_SEARCH, CAP_SUBSTANCES
from app.services.supply.store import SupplyStore, supply_store

POLL_JOB_KIND = "supply_poll"
TASKS_JOB_KIND = "supply_tasks"
# One tasks job at a time.
TASKS_ARTIFACT = "supply:tasks"
SUPPLY_PRIORITY = 200
SCAN_SECONDS = 60
# Housekeeping runs from the scanner too, so it goes on when every budget is used up and no poll job is queued.
SYSTEM_REQUESTER = "system:supply-scheduler"


def artifact_key(connector_id: str) -> str:
    return f"supply-poll:{connector_id}"


def _has_budget(conn, row, now: datetime) -> bool:
    """Whether a connector may spend a background call right now. Free connectors always may."""

    try:
        if not registry.get_spec(row["provider"]).metered:
            return True
    except registry.UnknownProvider:
        return False
    account = accounts.resolve(conn, row["id"])
    state = ledger.get_state(
        conn, account.ledger_id, daily_budget=account.daily_budget, reserve_pct=account.reserve_pct, now=now,
        reset_time=account.reset_time, reset_tz=account.reset_tz,
    )
    day = quota.provider_day(now, account.reset_time, account.reset_tz)
    return quota.background_allowance(
        state, now, reset_time=account.reset_time, tz=account.reset_tz,
        delay_seconds=quota.start_delay_seconds(account.ledger_id, day),
    ) > 0


def refresh_scheduled(conn, connector_id: str, now: datetime) -> None:
    """Work out what the account's scheduled work still needs today and keep it for spare spending to leave alone."""

    account = accounts.resolve(conn, connector_id)
    ledger.store_scheduled(
        conn, account.ledger_id, now, demand.scheduled_rest(conn, account, now), reset_time=account.reset_time, reset_tz=account.reset_tz
    )


def _has_spare(conn, row, now: datetime) -> bool:
    """Whether a connector has free calls to spend right now (see ``quota.free_allowance``). The figure for scheduled work is
    worked out again when it is more than 5 minutes old."""

    try:
        if not registry.get_spec(row["provider"]).metered:
            return False
    except registry.UnknownProvider:
        return False
    account = accounts.resolve(conn, row["id"])
    state = ledger.get_state(
        conn, account.ledger_id, daily_budget=account.daily_budget, reserve_pct=account.reserve_pct, now=now,
        reset_time=account.reset_time, reset_tz=account.reset_tz,
    )
    day = quota.provider_day(now, account.reset_time, account.reset_tz)
    kept = conn.execute("SELECT scheduled_at FROM supply_quota_ledger WHERE account_id = %s AND day = %s", (account.ledger_id, day)).fetchone()
    if kept is None or kept["scheduled_at"] is None or now - kept["scheduled_at"] > timedelta(minutes=5):
        refresh_scheduled(conn, row["id"], now)
    ledger_row = conn.execute(
        "SELECT scheduled_rest, scheduled_at, spare_hour, spare_hour_spent FROM supply_quota_ledger WHERE account_id = %s AND day = %s",
        (account.ledger_id, day),
    ).fetchone()
    return ledger.free_calls(conn, account.ledger_id, state, ledger_row, now, reset_time=account.reset_time, reset_tz=account.reset_tz) > 0


def _spare_work_due(conn, row, now: datetime, kinds: list[str]) -> bool:
    """Whether a connector has spare work that is due, for the kinds switched on: a part waiting for room that is due a search or a read,
    a tier-2 listing old enough to read early, a notice to read, a library part to match. Each is a single-row look. Late committed reads (``overdue``) are not
    asked here: the main "due" query queues them already."""

    cid = row["id"]
    if "waiting" in kinds and (pending_waiting(conn, cid, now, 1) or spare_listings(conn, cid, now, 1, "waiting")):
        return True
    if "tier2_early" in kinds and spare_listings(conn, cid, now, 1, "tier2_early"):
        return True
    try:
        has_notices = CAP_PCN in registry.get_spec(row["provider"]).capabilities
    except registry.UnknownProvider:
        return False
    if "notices" in kinds and has_notices and details.due(conn, cid, "notices", now, 1, untracked=True):
        return True
    return "library" in kinds and bool(library_match.pending(conn, cid, row["provider"], now, 1))


def _has_pool_or_spare(conn, row, now: datetime) -> bool:
    """Whether the pool has a call left, or spare budget is open, for a check someone asked for once."""

    try:
        if not registry.get_spec(row["provider"]).metered:
            return True
    except registry.UnknownProvider:
        return False
    account = accounts.resolve(conn, row["id"])
    state = ledger.get_state(
        conn, account.ledger_id, daily_budget=account.daily_budget, reserve_pct=account.reserve_pct, now=now,
        reset_time=account.reset_time, reset_tz=account.reset_tz,
    )
    return quota.interactive_allowance(state) > 0 or _has_spare(conn, row, now)


_warned_providers: set[str] = set()


def _warn_unknown_provider(provider: str) -> None:
    if provider not in _warned_providers:
        _warned_providers.add(provider)
        logging.getLogger(__name__).warning(
            "Supply connector provider %r is unknown to this worker; its connectors are not polled. Restart the worker.", provider
        )


def _spec(row: Mapping[str, Any]):
    try:
        return registry.get_spec(row["provider"])
    except registry.UnknownProvider:
        # The worker runs code that does not know this provider (usually: started before it was added).
        _warn_unknown_provider(row["provider"])
        return None


def _reads_due(conn, row, now: datetime, kinds: list[str]) -> bool:
    """Listings the poller would read now: its own due rule (``due_listings``), less what it keeps back to fill a batch."""

    spec = _spec(row)
    limit = (GROUP_LISTINGS * spec.max_batch if spec.groups_by_part else spec.max_batch) * MAX_BATCHES_PER_RUN
    due = due_listings(conn, row["id"], now, limit, metered=spec.metered)
    if not due or spec.max_batch <= 1:
        return bool(due)
    if spec.groups_by_part:
        due = with_siblings(conn, row["id"], due)
    batches, _held = hold_back(due, spec, now, (row["reset_time"], row["reset_tz"]))
    return bool(batches)


def _searches_due(conn, row, now: datetime, kinds: list[str]) -> bool:
    """Followed parts the discoverer would search for now (``pending_parts``)."""

    return CAP_SEARCH in _spec(row).capabilities and bool(pending_parts(conn, row["id"], now, 1))


def _details_due(conn, row, now: datetime, kinds: list[str]) -> bool:
    """Notices or substance lists due at a provider that reads them."""

    spec = _spec(row)
    return any(
        details.due(conn, row["id"], kind, now, 1)
        for capability, kind in ((CAP_PCN, "notices"), (CAP_SUBSTANCES, "substances")) if capability in spec.capabilities
    )


def _details_funded(conn, row, now: datetime) -> bool:
    """A provider with a quota of its own for notices (DigiKey) is gated by that quota and a person's sign-in; one without, by
    the product budget."""

    spec = _spec(row)
    if spec.notice_daily_limit and spec.metered:
        return oauth.status(conn, row["id"], now)["signed_in"] and notice_budget.allowed(
            conn, row["id"], spec.notice_daily_limit, now, interactive=False, spare=False, news=False
        )
    return _has_budget(conn, row, now)


def _checks_due(conn, row, now: datetime, kinds: list[str]) -> bool:
    """Checks someone asked for once with a part still to read here."""

    return row["id"] in oneoff.pending_connectors(conn)


@dataclass(frozen=True, slots=True)
class WorkSource:
    """One kind of distributor work: whether some is waiting at a connector (asked of the code that does it, so the scanner and
    the job never disagree), and whether the connector has a call it may spend on it now."""

    name: str
    due: Callable[[Any, Mapping[str, Any], datetime, list[str]], bool]
    funded: Callable[[Any, Mapping[str, Any], datetime], bool]


# In the order the poll job does them.
SOURCES: tuple[WorkSource, ...] = (
    WorkSource("reads", _reads_due, _has_budget),
    WorkSource("searches", _searches_due, _has_budget),
    WorkSource("checks", _checks_due, _has_pool_or_spare),
    WorkSource("spare", lambda conn, row, now, kinds: bool(kinds) and _spare_work_due(conn, row, now, kinds), _has_spare),
    WorkSource("details", _details_due, _details_funded),
)


def connectors_with_work(conn, now: datetime) -> list[str]:
    """Active connectors with some work due (``SOURCES``) and a call to spend on it.

    A connector whose budget for this stretch of the day is used up is left out, so a quiet budget does not queue a job a
    minute that can only find it empty.
    """

    rows = conn.execute(
        "SELECT c.id, c.provider, a.reset_time, a.reset_tz FROM supply_connectors c JOIN supply_accounts a ON a.id = c.account_id "
        "WHERE c.enabled AND c.paused_reason = '' AND (c.cooldown_until IS NULL OR c.cooldown_until <= %s) ORDER BY c.id",
        (now,),
    ).fetchall()
    kinds = supply_settings.load(conn).schedule.kinds()
    return [
        row["id"] for row in rows
        if _spec(row) is not None and any(source.due(conn, row, now, kinds) and source.funded(conn, row, now) for source in SOURCES)
    ]


def schedule_due_supply_jobs(
    *,
    job_service: Any | None = None,
    store: SupplyStore = supply_store,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    """Queue a job for each connector with work. Returns what the job service returned."""

    if job_service is None:
        from app.services.job_service import jobs as job_service
    store.initialize()
    moment = now or clock.now()
    with store.connection() as conn:
        connector_ids = connectors_with_work(conn, moment)
        tasks_due = bool(tasks.due(conn, moment))
    queued = []
    if tasks_due:
        queued.append(job_service.enqueue(
            TASKS_JOB_KIND, {}, worker_pool="prism", artifact_key=TASKS_ARTIFACT, priority=SUPPLY_PRIORITY,
            requested_by=SYSTEM_REQUESTER, max_attempts=1,
        ))
    # One job per account: connectors on the same credentials are one caller to the provider, so they take turns.
    by_account: dict[str, list[str]] = {}
    with store.connection() as conn:
        for connector_id in connector_ids:
            by_account.setdefault(accounts.resolve(conn, connector_id).ledger_id, []).append(connector_id)
    for ledger_id, members in by_account.items():
        queued.append(job_service.enqueue(
            POLL_JOB_KIND,
            {"connector_id": members[0], **({"connector_ids": members} if len(members) > 1 else {})},
            worker_pool="prism",
            artifact_key=artifact_key(ledger_id),
            priority=SUPPLY_PRIORITY,
            resources={SUPPLY_RESOURCE: 1},
            requested_by=SYSTEM_REQUESTER,
            max_attempts=2,
        ))
    return queued


def _read_details(connectors: ConnectorService, connector_id: str, provider: Any = None) -> str | None:
    """Read a few due change notices or substance lists. Best effort: a failure is recorded per listing, never the job."""

    try:
        stopped = details.run(connectors, connector_id, provider=provider).stopped
    except Exception:  # noqa: BLE001
        logging.getLogger(__name__).warning("Distributor details not read", exc_info=True)
        return "error"
    try:
        substitutes.run_due(connectors, connector_id, provider=provider)
    except Exception:  # noqa: BLE001 - substitutes are a favour; the notices and the job do not depend on them
        logging.getLogger(__name__).warning("Substitutes not asked for", exc_info=True)
    return stopped


def _spend_spare(
    connectors: ConnectorService, connector_id: str, *, poller: Poller | None = None, discoverer: Discoverer | None = None
) -> tuple[int, int]:
    """Use budget that would otherwise go unused, once all committed work is done. In order: searches and reads for parts
    late committed reads, then those waiting for room, then tier-2 parts ahead of their time, then notices, then the library pass. Best effort, and each stops where the spare allowance does.
    Returns the calls it spent and the listings it read."""

    calls = listings = 0

    try:
        with connectors.store.connection() as conn:
            kinds = supply_settings.load(conn).schedule.kinds()
        poller = poller or Poller(connectors)
        discoverer = discoverer or Discoverer(connectors)
        # Late committed reads come first, whatever the switches say: they are work the budget promised.
        late = poller.poll_connector(connector_id, spare="overdue")
        calls, listings = late.calls, late.polled
        if "waiting" in kinds:
            calls += discoverer.run(connector_id, waiting=True).searched
            waiting = poller.poll_connector(connector_id, spare="waiting")
            calls, listings = calls + waiting.calls, listings + waiting.polled
        if "tier2_early" in kinds:
            early = poller.poll_connector(connector_id, spare="tier2_early")
            calls, listings = calls + early.calls, listings + early.polled
        if "notices" in kinds:
            calls += details.run_spare(connectors, connector_id).read
        if "library" in kinds:
            calls += discoverer.run(connector_id, library=True).searched
    except Exception:  # noqa: BLE001
        logging.getLogger(__name__).warning("Spare work not done", exc_info=True)
    return calls, listings


def run_supply_poll_job(context: Any) -> Any:
    """Job handler: ask about the listings that are due, then search for new ones, so a big project's first searches never hold back the
    day's reads."""

    from app.services.job_runtime import JobResult

    connector_ids = [str(item) for item in context.payload.get("connector_ids") or [context.payload["connector_id"]]]
    connectors = ConnectorService()
    # One adapter per connector for the whole job: its session, pacing and token are reused by every read and search.
    loaded: dict[str, Any] = {}

    def provider_for(connector_id: str) -> Any:
        if connector_id not in loaded:
            loaded[connector_id] = connectors.load_provider(connector_id)
        return loaded[connector_id]

    poller, discoverer = Poller(connectors, provider_for=provider_for), Discoverer(connectors, provider_for=provider_for)
    searched = listings = calls = polled_count = gone = spare_calls = holding = 0
    discovery_stopped = poll_stopped = None
    for connector_id in connector_ids:
        try:
            with connectors.store.connection() as conn:
                refresh_scheduled(conn, connector_id, clock.now())
        except Exception:  # noqa: BLE001 - without the figure no call counts as free; the job's own work goes on
            logging.getLogger(__name__).warning("Scheduled work not counted", exc_info=True)
        context.progress(stage="supply-poll", message="Reading stock and prices", percent=10, force=True)
        polled = poller.poll_connector(connector_id)
        context.progress(stage="supply-discover", message="Searching for listings", percent=50, force=True)
        found = discoverer.run(connector_id)
        try:
            oneoff.run(discoverer, poller, connectors.store, connector_id)
        except Exception:  # noqa: BLE001 - a check that fails is tried again; it never fails the job
            logging.getLogger(__name__).warning("Check once not served", exc_info=True)
        if polled.stopped in (None, "nothing_due", "budget"):
            try:
                with connectors.store.connection() as conn:
                    refresh_scheduled(conn, connector_id, clock.now())
            except Exception:  # noqa: BLE001
                logging.getLogger(__name__).warning("Scheduled work not counted", exc_info=True)
            spare_calls += _spend_spare(connectors, connector_id, poller=poller, discoverer=discoverer)[0]
        searched, listings = searched + found.searched, listings + found.listings
        calls, polled_count, gone, holding = calls + polled.calls, polled_count + polled.polled, gone + polled.gone, holding + polled.holding
        discovery_stopped, poll_stopped = found.stopped, polled.stopped
    details_stopped = [_read_details(connectors, connector_id, provider_for(connector_id)) for connector_id in connector_ids][-1]
    if polled_count:
        tasks.run_one(connectors.store, "rollups", force=True)
    details: Mapping[str, Any] = {
        "searched": searched, "listings_found": listings, "discovery_stopped": discovery_stopped,
        "calls": calls, "spare_calls": spare_calls, "polled": polled_count, "gone": gone, "holding": holding, "poll_stopped": poll_stopped,
        "details_stopped": details_stopped,
    }
    return JobResult(
        message=f"Searched {searched} part(s), polled {polled_count} listing(s)",
        details=details,
    )


def run_supply_tasks_job(context: Any) -> Any:
    """Job handler: the periodic tasks that are due (``tasks.py``), each in its own transaction."""

    from app.services.job_runtime import JobResult

    outcome = tasks.run_due(supply_store)
    failed = sorted(name for name, worked in outcome.items() if not worked)
    return JobResult(message=f"Ran {len(outcome)} supply task(s)", details={"ran": sorted(outcome), "failed": failed})


JOB_KINDS = (
    JobKind(POLL_JOB_KIND, run_supply_poll_job, resources={SUPPLY_RESOURCE: 1}, priority=SUPPLY_PRIORITY, max_attempts=2),
    JobKind(TASKS_JOB_KIND, run_supply_tasks_job, priority=SUPPLY_PRIORITY, max_attempts=1),
)
