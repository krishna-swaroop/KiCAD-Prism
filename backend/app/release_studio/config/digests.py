"""Technical-domain digests for release configurations."""

from __future__ import annotations

from typing import Any, Mapping

from app.release_studio.canonical import sha256_canonical
from .errors import ConfigSchemaError

# Keep these sets explicit. A new configuration key must be classified here
# before it can participate in a technical digest.
_TECHNICAL_KEYS = frozenset(
    {
        "schema",
        "title",
        "board",
        "schematic",
        "jobset",
        "default_variant",
        "fields",
        "notes",
        "document_number",
        "revision",
        "variants",
        "template",
        "sheets",
    }
)
_GOVERNANCE_KEYS = frozenset({"policy"})


def technical_config_payload(config: Mapping[str, Any]) -> dict[str, Any]:
    """Return the explicitly classified technical slice of a configuration.

    ``technical_config_digest = H(canonical(technical configuration))``.
    Governance-only changes, such as the policy binding, must not change this
    payload. Every future key must be classified explicitly as technical or
    governance before it is accepted here.
    """

    unclassified = [
        key
        for key in config
        if key not in _TECHNICAL_KEYS and key not in _GOVERNANCE_KEYS
    ]
    if unclassified:
        names = ", ".join(repr(key) for key in sorted(unclassified, key=repr))
        raise ConfigSchemaError(
            f"unclassified release configuration key(s): {names}"
        )
    return {key: config[key] for key in config if key in _TECHNICAL_KEYS}


def technical_config_digest(config: Mapping[str, Any]) -> str:
    """Hash the technical slice of a parsed release configuration."""

    return sha256_canonical(technical_config_payload(config))
