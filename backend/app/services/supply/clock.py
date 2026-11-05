"""Supply's one clock.

Every time supply writes or compares comes from a clock the caller passed in (a job's, a test's) or from ``now()``, never
from the database's ``NOW()``: a row stamped by one clock and compared against another (an adapter's, a test's frozen
one) goes wrong in tests and drifts in production.
"""

from __future__ import annotations

from datetime import datetime, timezone


def now() -> datetime:
    return datetime.now(timezone.utc)
