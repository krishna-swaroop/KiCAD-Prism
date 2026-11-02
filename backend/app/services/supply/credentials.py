"""Connector credentials, sealed with Prism's existing credential keyring.

Supply reuses the tracker keyring (``TRACKER_CREDENTIAL_ROOT_KEY``) so there is
one root key to manage. The context binds each envelope to its connector and
to the ``supply.connector`` domain: a blob copied onto another connector, or
onto a tracker record, will not decrypt. If the keyring is locked or missing,
credentials cannot be stored. There is no plaintext fallback.

Moving the keyring out of ``trackers`` is a separate refactor; this adapter is
the one place supply touches it.
"""

from __future__ import annotations

import json
from typing import Callable, Mapping

from app.services.trackers.secrets import CredentialKeyring, SecretStoreLocked, keyring_from_settings

KeyringFactory = Callable[[], CredentialKeyring]

DOMAIN = "supply.connector"
FIELD = "credentials"
# A person's sign-in at a distributor (``oauth.py``), sealed apart from the connector's own credentials.
GRANT_FIELD = "oauth_grant"

STATUS_NONE = "none"
STATUS_READY = "ready"
STATUS_LOCKED = "locked"


def _context(connector_id: str, field: str = FIELD) -> dict[str, str]:
    return {"domain": DOMAIN, "record": connector_id, "field": field}


def seal(keyring: CredentialKeyring, connector_id: str, credentials: Mapping[str, str], field: str = FIELD) -> str:
    payload = json.dumps(dict(credentials), sort_keys=True, separators=(",", ":"))
    return keyring.encrypt(payload, _context(connector_id, field))


def unseal(keyring: CredentialKeyring, connector_id: str, envelope: str, field: str = FIELD) -> dict[str, str]:
    raw = keyring.decrypt(envelope, _context(connector_id, field))
    return {str(key): str(value) for key, value in json.loads(raw.decode("utf-8")).items()}


def status(factory: KeyringFactory, envelope: str | None) -> str:
    """``none``, ``ready``, ``locked``, or the envelope's own problem (``unknown_key``)."""

    if not envelope:
        return STATUS_NONE
    try:
        return factory().inspect(envelope).status
    except SecretStoreLocked:
        return STATUS_LOCKED


default_keyring_factory: KeyringFactory = keyring_from_settings

__all__ = [
    "GRANT_FIELD", "KeyringFactory", "SecretStoreLocked", "STATUS_LOCKED", "STATUS_NONE", "STATUS_READY",
    "default_keyring_factory", "seal", "status", "unseal",
]
