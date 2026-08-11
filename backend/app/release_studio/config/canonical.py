"""Canonical JSON encoding for Release Studio digests."""

from __future__ import annotations

import hashlib
import json
import unicodedata
from typing import Any, Mapping


def canonical_json(value: Any) -> str:
    """Serialize *value* with the Release Studio canonical JSON rules.

    Strings are NFC-normalized recursively, keys are sorted, separators are
    compact, non-ASCII is preserved, and non-finite numbers are rejected.
    """

    normalized = _normalize_for_canonical_json(value)
    return json.dumps(
        normalized,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def sha256_canonical(value: Any) -> str:
    """Return the lowercase hex SHA-256 of the canonical JSON encoding."""

    payload = canonical_json(value).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _normalize_for_canonical_json(value: Any) -> Any:
    """Copy JSON-shaped data while normalizing every string to Unicode NFC."""

    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, Mapping):
        normalized: dict[str, Any] = {}
        for key, nested in value.items():
            if not isinstance(key, str):
                raise TypeError(
                    "canonical JSON object keys must be strings, "
                    f"got {type(key).__name__}"
                )
            normalized_key = unicodedata.normalize("NFC", key)
            if normalized_key in normalized:
                raise ValueError(
                    "canonical JSON object key collision after Unicode NFC "
                    f"normalization: {key!r} -> {normalized_key!r}"
                )
            normalized[normalized_key] = _normalize_for_canonical_json(nested)
        return normalized
    if isinstance(value, (list, tuple)):
        return [_normalize_for_canonical_json(item) for item in value]
    return value
