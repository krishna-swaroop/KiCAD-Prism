"""Canonical JSON encoding for Release Studio digests."""

from __future__ import annotations

import hashlib
import json
from typing import Any


def canonical_json(value: Any) -> str:
    """Serialize *value* with the Release Studio canonical JSON rules.

    Keys are sorted, separators are compact, and non-ASCII is preserved.
    """

    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )


def sha256_canonical(value: Any) -> str:
    """Return the lowercase hex SHA-256 of the canonical JSON encoding."""

    payload = canonical_json(value).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()
