"""Technical-domain digests for release configurations."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Mapping

from .canonical import sha256_canonical

# Governance-only keys excluded from technical_config_digest.
_POLICY_KEYS = frozenset({"policy"})


def technical_config_payload(config: Mapping[str, Any]) -> dict[str, Any]:
    """Return the release configuration minus the policy reference.

    ``technical_config_digest = H(canonical(release configuration MINUS
    the policy reference))``. Changing only the policy binding must not
    change this payload.
    """

    return {
        key: deepcopy(value)
        for key, value in config.items()
        if key not in _POLICY_KEYS
    }


def technical_config_digest(config: Mapping[str, Any]) -> str:
    """Hash the technical slice of a parsed release configuration."""

    return sha256_canonical(technical_config_payload(config))
