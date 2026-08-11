"""Canonical JSON used by Release Studio digests and signed records.

This encoder is deliberately separate from :meth:`JobArtifactService.prepare_json`.
Job artifacts preserve mapping insertion order for backwards compatibility, while
Release Studio manifests and attestations need one byte representation regardless
of how their dictionaries were assembled.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any


CANONICAL_JSON_OPTIONS = {
    "sort_keys": True,
    "separators": (",", ":"),
    "ensure_ascii": False,
}


def canonical_json(value: Any) -> str:
    """Return the canonical JSON text for a manifest or attestation."""

    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )


def canonical_json_bytes(value: Any) -> bytes:
    """Return canonical JSON encoded as UTF-8 bytes."""

    return canonical_json(value).encode("utf-8")


def sha256_canonical(value: Any) -> str:
    """Hash the canonical UTF-8 JSON representation of ``value``."""

    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()
