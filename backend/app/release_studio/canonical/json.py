"""Canonical JSON used by Release Studio digests and signed records.

This encoder is deliberately separate from :meth:`JobArtifactService.prepare_json`.
Job artifacts preserve mapping insertion order for backwards compatibility, while
the Release Studio canonical boundary needs one normalized byte representation
regardless of how its dictionaries were assembled.
"""

from __future__ import annotations

import hashlib
import json
import unicodedata
from typing import Any


def canonical_json(value: Any) -> str:
    """Return normalized canonical JSON text for a Release Studio record."""

    return json.dumps(
        _normalize_nfc(value),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def canonical_json_bytes(value: Any) -> bytes:
    """Return canonical JSON encoded as UTF-8 bytes."""

    return canonical_json(value).encode("utf-8")


def sha256_canonical(value: Any) -> str:
    """Hash the canonical UTF-8 JSON representation of ``value``."""

    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def _normalize_nfc(value: Any) -> Any:
    """Normalize JSON strings recursively and reject normalized key clashes."""

    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, list):
        return [_normalize_nfc(item) for item in value]
    if isinstance(value, tuple):
        return tuple(_normalize_nfc(item) for item in value)
    if isinstance(value, dict):
        normalized: dict[str, Any] = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise TypeError(
                    "canonical JSON object keys must be strings; "
                    f"found {type(key).__name__} key {key!r}"
                )
            normalized_key = unicodedata.normalize("NFC", key)
            if normalized_key in normalized:
                raise ValueError(
                    "NFC-normalized JSON object key collision: "
                    f"{key!r} conflicts with {normalized_key!r}"
                )
            normalized[normalized_key] = _normalize_nfc(item)
        return normalized
    return value
