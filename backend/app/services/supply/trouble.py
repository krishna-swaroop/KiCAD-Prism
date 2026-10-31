"""What to do when a provider call fails. Shared by polling and discovery.

The same reactions apply to any call, so they live in one place. A hold applies to the whole account (every connector on
the same credentials), since the provider sees one caller:

* rate limited: hold off until the provider says (15 minutes when it does not), count the refusal, and slow the pacing
  for a day
* blocked (a web page or challenge where data was expected): hold off for hours, count it, slow the pacing, and leave the
  code on the connector for an administrator to see. A provider with no credentials blocks on a stray burst and
  lets go soon after, so it rests 15 minutes, then 30, and so on up to 12 hours, and starts again from 15 after a call that worked
* credentials rejected: pause the connector so it stops spending anything
* anything else: note the error code, stop the run, and wait before the connector is tried again, longer with each
  failure in a row and with some random spread, so a dead provider is not hit on every scan
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta

from app.services.supply import accounts, ledger, limits, pacing
from app.services.supply.connectors import ConnectorService
from app.services.supply.providers import registry
from app.services.supply.providers.base import AuthError, Blocked, ProviderError, RateLimited
from app.services.supply.store import SupplyStore

RATE_LIMIT_DEFAULT = timedelta(minutes=15)
ERROR_COOLDOWN = timedelta(minutes=5)
ERROR_COOLDOWN_CAP = timedelta(hours=6)
BLOCK_COOLDOWN = timedelta(hours=12)
BLOCK_REST = timedelta(minutes=15)
# A provider's own Retry-After is believed, but not beyond this.
MAX_COOLDOWN = timedelta(hours=24)
SYSTEM_ACTOR = "system:poller"

RATE_LIMITED = "rate_limited"
AUTH_FAILED = "auth_failed"
BLOCKED = "blocked"
ERROR = "error"


def error_cooldown(streak: int, spread: float) -> timedelta:
    """5 minutes after a first failure, doubling with each one in a row up to 6 hours, plus up to half again at random."""

    base = min(ERROR_COOLDOWN * (2 ** max(streak - 1, 0)), ERROR_COOLDOWN_CAP)
    return base * (1 + 0.5 * spread)


def block_rest(streak: int, spread: float) -> timedelta:
    """The rest after the ``streak``-th block in a row at a provider with no credentials: 15 minutes doubling up to 12 hours, plus up
    to half again at random (still capped at 12 hours)."""

    return min(BLOCK_REST * (2 ** max(streak - 1, 0)) * (1 + 0.5 * spread), BLOCK_COOLDOWN)


def react(
    connectors: ConnectorService,
    store: SupplyStore,
    connector_id: str,
    error: ProviderError,
    now: datetime,
    *,
    rng=random.random,
) -> str:
    """Apply the connector-level reaction and return why the run stopped."""

    connectors.record_result(connector_id, error.code)
    if isinstance(error, AuthError):
        connectors.pause(connector_id, actor=SYSTEM_ACTOR, reason="The provider rejected the credentials.")
        return AUTH_FAILED
    with store.connection() as conn:
        account = accounts.resolve(conn, connector_id)
        row = conn.execute(
            "SELECT c.provider, a.account_key, c.error_streak, c.block_streak FROM supply_connectors c JOIN supply_accounts a ON a.id = c.account_id "
            "WHERE c.id = %s", (connector_id,)
        ).fetchone()
    slow = False
    if isinstance(error, Blocked):
        wait, reason, slow = BLOCK_COOLDOWN, BLOCKED, True
        if not registry.get_spec(row["provider"]).credential_fields:
            streak = int(row["block_streak"]) + 1
            wait = block_rest(streak, rng())
            with store.connection() as conn:
                conn.execute("UPDATE supply_connectors SET block_streak = %s WHERE id = %s", (streak, connector_id))
    elif isinstance(error, RateLimited):
        wait = min(timedelta(seconds=error.retry_after_seconds), MAX_COOLDOWN) if error.retry_after_seconds else RATE_LIMIT_DEFAULT
        reason, slow = RATE_LIMITED, True
    else:
        wait, reason = error_cooldown(int(row["error_streak"]), rng()), ERROR
    if slow:
        ledger.note_refusal(store, connector_id, now=now)
        if isinstance(error, RateLimited):
            limits.note_refused(store, connector_id, now)
        pacing.slow_down(accounts.pace_key(row["account_key"], row["provider"]))
    with store.connection() as conn:
        conn.execute("UPDATE supply_connectors SET cooldown_until = %s WHERE id = ANY(%s)", (now + wait, list(account.members)))
    return reason


def stopped_text(store: SupplyStore, connector_id: str, name: str, stopped: str | None, now: datetime, fallback: str) -> str:
    """The sentence for a person's action that was stopped. A connector resting after a refusal says for how long."""

    if stopped in ("cooling_down", BLOCKED):
        with store.connection() as conn:
            row = conn.execute("SELECT cooldown_until, last_error_code FROM supply_connectors WHERE id = %s", (connector_id,)).fetchone()
        if row and row["last_error_code"] == BLOCKED and row["cooldown_until"] and row["cooldown_until"] > now:
            minutes = max(1, -(-int((row["cooldown_until"] - now).total_seconds()) // 60))
            wait = f"{minutes} minutes" if minutes < 120 else f"{-(-minutes // 60)} hours"
            return f"{name} is resting after a refusal. Try again in {wait}."
    return f"{name} {fallback}."


def cooling_down(store: SupplyStore, connector_id: str, now: datetime) -> bool:
    with store.connection() as conn:
        until = conn.execute("SELECT cooldown_until FROM supply_connectors WHERE id = %s", (connector_id,)).fetchone()["cooldown_until"]
    return until is not None and until > now
