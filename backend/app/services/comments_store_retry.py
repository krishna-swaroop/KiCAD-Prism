"""Deadlock retry for comments store transactions."""

from __future__ import annotations

import functools
import time

_DEADLOCK_ATTEMPTS = 3


def _retry_on_deadlock(method):
    """Re-run a whole store transaction that PostgreSQL chose as a deadlock victim.

    Comment writes take the project's stream-head row lock in ``record_change``
    and may then touch tracker rows; tracker triggers take the same head lock
    after their row lock. No single lock order covers every HTTP and worker
    path, so the victim retries. Each wrapped method owns one transaction and
    has no side effect outside it, which makes the retry safe.
    """

    @functools.wraps(method)
    def wrapper(*args, **kwargs):
        from psycopg import errors

        for attempt in range(_DEADLOCK_ATTEMPTS):
            try:
                return method(*args, **kwargs)
            except (errors.DeadlockDetected, errors.SerializationFailure):
                if attempt == _DEADLOCK_ATTEMPTS - 1:
                    raise
                time.sleep(0.05 * (attempt + 1))

    return wrapper
