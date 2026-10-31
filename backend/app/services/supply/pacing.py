"""Spacing calls to a provider the way a careful client does.

A provider's limits are a ceiling, and evenly spaced calls at the ceiling look like a script. A ``Pacer`` waits a
random gap between calls, 0.75 to 1.5 times its target, and the target is about half the published per-minute rate.
After a rate limit it doubles its gaps for a day.

One pacer belongs to an account (``accounts.py``), not a connector: connectors on the same credentials share it, so they
never call at the same moment. The registry is per process, so with a store (``use_store``) the next time to call and the slowdown
are kept in ``pace_state`` and shared by every process (the API and the worker); a slowdown then also survives a restart. Without
one, or when it cannot be reached, a pacer keeps its own time.
"""

from __future__ import annotations

import random
import threading
import time
from datetime import datetime, timedelta
from typing import Any, Callable

from app.services.supply import clock

JITTER_LOW = 0.75
JITTER_HIGH = 1.5
SLOW_FACTOR = 2.0
SLOW_FOR_SECONDS = 86400.0

# Where pacing is shared between processes; set by the code that builds providers for real use (``ConnectorService.load_provider``).
_store: Any = None


def use_store(store: Any) -> None:
    global _store
    _store = store


class Pacer:
    def __init__(
        self,
        target_seconds: float,
        *,
        monotonic: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
        rng: Callable[[], float] = random.random,
        key: str = "",
        wall: Callable[[], datetime] = clock.now,
    ) -> None:
        if target_seconds < 0:
            raise ValueError("the target gap must not be negative")
        self.target = target_seconds
        self.key = key
        self._wall = wall
        self._monotonic = monotonic
        self._sleep = sleep
        self._rng = rng
        self._next_at: float | None = None
        self._slow_until = 0.0
        self._lock = threading.Lock()

    @property
    def slowed(self) -> bool:
        return self._monotonic() < self._slow_until

    def slow_down(self, seconds: float = SLOW_FOR_SECONDS) -> None:
        """Double the gaps for a while, after the provider turned a call away."""

        self._slow_until = max(self._slow_until, self._monotonic() + seconds)

    def _gap(self) -> float:
        factor = SLOW_FACTOR if self.slowed else 1.0
        return self.target * factor * (JITTER_LOW + (JITTER_HIGH - JITTER_LOW) * self._rng())

    def _wait_shared(self) -> float:
        """Reserve the next slot in ``pace_state`` and return how long to wait for it. The row is locked only while it is worked out;
        the sleep happens after, so no connection is held."""

        now = self._wall()
        with _store.connection() as conn:
            conn.execute("INSERT INTO supply_pace_state (pace_key, next_at) VALUES (%s, %s) ON CONFLICT DO NOTHING", (self.key, now))
            row = conn.execute("SELECT next_at, slow_until FROM supply_pace_state WHERE pace_key = %s FOR UPDATE", (self.key,)).fetchone()
            start = max(now, row["next_at"])
            slowed = row["slow_until"] is not None and row["slow_until"] > now
            gap = self.target * (SLOW_FACTOR if slowed else 1.0) * (JITTER_LOW + (JITTER_HIGH - JITTER_LOW) * self._rng())
            conn.execute("UPDATE supply_pace_state SET next_at = %s WHERE pace_key = %s", (start + timedelta(seconds=gap), self.key))
        return (start - now).total_seconds()

    def wait(self) -> None:
        """Block until the next call may be made, then reserve the gap after it."""

        if _store is not None and self.key:
            try:
                delay = self._wait_shared()
            except Exception:  # noqa: BLE001 - pacing never stops a call; the process's own pacer takes over
                delay = None
            if delay is not None:
                if delay > 0:
                    self._sleep(delay)
                return
        with self._lock:
            now = self._monotonic()
            if self._next_at is not None and self._next_at > now:
                self._sleep(self._next_at - now)
                now = self._next_at
            self._next_at = now + self._gap()


_registry: dict[str, Pacer] = {}
_registry_lock = threading.Lock()


def pacer_for(
    account: str,
    target_seconds: float,
    *,
    monotonic: Callable[[], float] = time.monotonic,
    sleep: Callable[[float], None] = time.sleep,
) -> Pacer:
    """The pacer of an account, shared by every provider object built for it. With no account, one of its own."""

    if not account:
        return Pacer(target_seconds, monotonic=monotonic, sleep=sleep)
    with _registry_lock:
        pacer = _registry.get(account)
        if pacer is None or pacer.target != target_seconds:
            pacer = _registry[account] = Pacer(target_seconds, monotonic=monotonic, sleep=sleep, key=account)
        return pacer


def slow_down(account: str) -> None:
    """Slow an account's pacing for a day, in every process when pacing is shared."""

    with _registry_lock:
        pacer = _registry.get(account)
    if pacer is not None:
        pacer.slow_down()
    if _store is not None and account:
        try:
            now = pacer._wall() if pacer is not None else clock.now()
            until = now + timedelta(seconds=SLOW_FOR_SECONDS)
            with _store.connection() as conn:
                conn.execute(
                    "INSERT INTO supply_pace_state (pace_key, next_at, slow_until) VALUES (%s, %s, %s) "
                    "ON CONFLICT (pace_key) DO UPDATE SET slow_until = GREATEST(supply_pace_state.slow_until, EXCLUDED.slow_until)",
                    (account, now, until),
                )
        except Exception:  # noqa: BLE001 - the process's own slowdown above still holds
            pass
