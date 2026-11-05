"""Checking a connector: does the provider accept these credentials and answer?

A test makes one real call and charges it to the connector's interactive reserve, like any
lookup a person starts. It reports in words that are safe to show: never the provider's own
message, which can carry a host or a request detail. A failure is recorded on the connector
(``last_error_code``) like any other failed call, but a test never pauses a connector; that
stays the poller's decision.
"""

from __future__ import annotations

import time
from datetime import datetime
from typing import Any, Callable

from app.services.supply import clock, ledger
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.connectors import ConnectorService
from app.services.supply.providers import registry
from app.services.supply.providers.base import ConnectionCheck, ProviderError

# A part number every distributor carries, for providers with no cheaper way to check.
SAMPLE_MPN = "LM358DR"

MESSAGES = {
    "auth_failed": "The provider rejected the credentials.",
    "rate_limited": "The provider is rate limiting this account. Try again later.",
    "unavailable": "Prism could not reach the provider.",
    "egress_denied": "This server is not allowed to reach the provider's address.",
    "response_too_large": "The provider answered with more data than Prism accepts.",
    "provider_error": "The provider answered, but not in the way Prism expects.",
}


def _result(ok: bool, code: str, message: str, started: float) -> dict[str, Any]:
    return {
        "ok": ok,
        "code": code,
        "message": message,
        "took_ms": round((time.monotonic() - started) * 1000),
        "checked_at": clock.now().isoformat(),
    }


def check_connector(
    service: ConnectorService,
    connector_id: str,
    actor: str,
    *,
    now: Callable[[], datetime] = clock.now,
) -> dict[str, Any]:
    """One call to the provider. Raises ``ConnectorNotFound`` and ``SecretStoreLocked``; reports the rest."""

    actor = actor_text(actor)
    started = time.monotonic()
    connector = service.get(connector_id)
    try:
        spec = registry.get_spec(connector["provider"])
    except registry.UnknownProvider:
        return _result(False, "unknown_provider", "This provider is not installed on the server.", started)
    if not connector["enabled"] or connector["paused_reason"]:
        return _result(False, "inactive", "The connector is disabled or paused. Resume it first.", started)
    if spec.metered and not ledger.spend_call(service.store, connector, now=now(), interactive=True, kind=ledger.KIND_TEST):
        return _result(False, "budget", "No calls are left in the interactive reserve to spend on a test.", started)

    provider = service.load_provider(connector_id)
    try:
        if isinstance(provider, ConnectionCheck):
            provider.check_connection()
        else:
            provider.lookup_mpn(SAMPLE_MPN)
    except ProviderError as exc:
        service.record_result(connector_id, exc.code)
        result = _result(False, exc.code, MESSAGES.get(exc.code, MESSAGES["provider_error"]), started)
    else:
        service.record_result(connector_id)
        result = _result(True, "ok", "The provider accepted the credentials and answered.", started)
    with service.store.connection() as conn:
        write_audit(conn, actor, "connector.test", connector_id, {"ok": result["ok"], "code": result["code"]})
    return result
