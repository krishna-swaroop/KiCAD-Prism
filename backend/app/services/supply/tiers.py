"""When a listing is asked about next, and which comes first. Pure rules; no database.

How often a followed part is read is decided by its tracking tier (``tracking.py``): tier 1 daily, tier 2 weekly or
monthly. A listing's ``poll_state.tier`` holds that schedule. Here are the rules around it:

* ``next_poll_at``: reads come due together, so a batch goes out full. A daily read falls when the account's next provider day
  opens (after its start delay); a weekly or monthly one on a day slot of its part, so the parts of one slot are due at once and a
  part's listings share a slot
* ``stretch``: a listing whose reading has not changed for ``CALM_READS`` of its intervals, and that no rule marks urgent,
  is read at half its rate (``MAX_STRETCH``): every two days at tier 1, so a stable part costs half. Any change, or anything
  that makes it urgent (low stock, a threshold, an ending lifecycle, a projected run-out), puts it back on its rate at once.
* ``urgency``: which listing to read first when the day's budget cannot cover them all (low stock, near the threshold,
  not recommended for new designs, projected to run out). It sets the order, never the rate.

Failures back off on their own schedule (``retry_at``), whatever the schedule says, so a broken credential or a dead
provider cannot burn the daily budget.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import IntEnum

from app.services.supply import quota
from app.services.supply.vocabulary import ENDING_LIFECYCLES, Lifecycle

SCHEDULES = ("daily", "weekly", "monthly")
INTERVAL = {"daily": timedelta(days=1), "weekly": timedelta(days=7), "monthly": timedelta(days=30)}
# A weekly read waits at least this long before its day slot comes round (so 4 to 10 days, a week on average), a monthly one
# the same over 30 slots (15 to 44 days).
SLOTS = {"weekly": 7, "monthly": 30}
MIN_WAIT_DAYS = {"weekly": 4, "monthly": 15}


class Urgency(IntEnum):
    """Lower is first."""

    HOT = 0
    WARM = 1
    NORMAL = 2



RECENT_CHANGE = timedelta(hours=24)
# How close to the threshold counts as "approaching it", as a multiple.
APPROACH_FACTOR = 3
# Days until stock is projected to hit zero (see ``insights.rupture_expected_within``): under the first, hot; inside the horizon, warm.
RUPTURE_HOT_DAYS = 14
JITTER_SHARE = 0.10
BACKOFF_BASE = timedelta(minutes=5)
BACKOFF_CAP = timedelta(hours=24)
CALM_READS = 7
MAX_STRETCH = 2


@dataclass(frozen=True, slots=True)
class UrgencyInputs:
    now: datetime
    pinned: bool = False
    lifecycle: Lifecycle = Lifecycle.UNKNOWN
    total_stock: int | None = None
    threshold: int | None = None
    last_change_at: datetime | None = None
    # Days to a believable projected rupture, or None when none is expected.
    rupture_days: int | None = None


def urgency(inputs: UrgencyInputs) -> Urgency:
    """The most urgent rank any rule asks for."""

    asked: list[Urgency] = [Urgency.NORMAL]
    if inputs.pinned:
        asked.append(Urgency.HOT)
    if inputs.total_stock is not None:
        if inputs.total_stock == 0:
            asked.append(Urgency.HOT)
        if inputs.threshold is not None:
            if inputs.total_stock <= inputs.threshold:
                asked.append(Urgency.HOT)
            elif inputs.total_stock < inputs.threshold * APPROACH_FACTOR:
                asked.append(Urgency.WARM)
    if inputs.rupture_days is not None:
        asked.append(Urgency.HOT if inputs.rupture_days <= RUPTURE_HOT_DAYS else Urgency.WARM)
    if inputs.lifecycle in ENDING_LIFECYCLES:
        asked.append(Urgency.WARM)
    if inputs.last_change_at is not None and inputs.now - inputs.last_change_at < RECENT_CHANGE:
        asked.append(Urgency.WARM)
    return min(asked)


def backoff(error_streak: int) -> timedelta:
    """5 minutes after the first failure, doubling, capped at a day."""

    if error_streak < 1:
        return timedelta(0)
    return min(BACKOFF_BASE * (2 ** (error_streak - 1)), BACKOFF_CAP)


def _spread(key: str) -> float:
    """A stable number in [0, 1) for this key."""

    return int(hashlib.sha256(key.encode()).hexdigest()[:8], 16) % 1000 / 1000


def interval(schedule: str) -> timedelta:
    return INTERVAL[schedule]


def stretch(schedule: str, urgency: Urgency, last_change_at: datetime | None, now: datetime) -> int:
    """How many of its intervals a listing waits: ``MAX_STRETCH`` when it is calm (no change for ``CALM_READS`` intervals and
    nothing urgent), else 1."""

    if urgency != Urgency.NORMAL or last_change_at is None or now - last_change_at < INTERVAL[schedule] * CALM_READS:
        return 1
    return MAX_STRETCH


def next_poll_at(
    now: datetime, schedule: str, *, part_key: str = "", account_key: str = "", reset_time: str = quota.DEFAULT_RESET_TIME,
    tz: str = quota.DEFAULT_RESET_TZ, stretch: int = 1,
) -> datetime:
    """When to ask again after an answer.

    Reads come due together so a provider that takes a batch gets full ones. A daily listing is next due as the provider's next
    day opens, plus the account's start delay for that day (``quota.start_delay_seconds``, 5 to 30 minutes), the moment the day's
    budget starts to open. A weekly or monthly one is due on its part's day slot (``part_key``): the first provider day of that slot
    at least ``MIN_WAIT_DAYS`` ahead, at the same time of day. Spreading the calls over the day is the budget's job
    (``quota.background_allowance``). ``stretch`` multiplies the wait (see ``stretch``).
    """

    today = quota.provider_day(now, reset_time, tz)
    day = today + timedelta(days=(1 if schedule == "daily" else MIN_WAIT_DAYS[schedule]) * max(stretch, 1))
    if schedule != "daily":
        slots = SLOTS[schedule]
        slot = int(hashlib.sha256(part_key.encode()).hexdigest()[:8], 16) % slots
        day += timedelta(days=(slot - day.toordinal()) % slots)
    # Midday of that day, so a clock change cannot move it into the day before or after.
    midday = quota.day_bounds(now, reset_time, tz)[0] + timedelta(days=(day - today).days, hours=12)
    return quota.day_bounds(midday, reset_time, tz)[0] + timedelta(seconds=quota.start_delay_seconds(account_key, day))


def retry_at(now: datetime, error_streak: int, *, key: str = "") -> datetime:
    """When to try again after a failure.

    This is its own schedule and ignores the rate. A listing that was due daily is retried in minutes at first, so a
    brief outage costs little; one that keeps failing is retried less and less often, up to a day.
    """

    return now + backoff(max(error_streak, 1)) * (1 + JITTER_SHARE * _spread(key))
