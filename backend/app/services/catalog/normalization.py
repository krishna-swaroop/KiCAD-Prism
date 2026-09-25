"""Shared catalog value normalization and hashing primitives."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import re
from typing import Any


def slugify(value: str, default: str = "component") -> str:
    return (
        re.sub(r"[^a-zA-Z0-9._-]+", "-", (value or "").strip().lower()).strip("._-")
        or default
    )


def sanitize_name(value: str, default: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in {"_", "-", "."} else "_" for ch in (value or "").strip())
    cleaned = cleaned.strip("._-")
    return cleaned or default


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def json_loads(value: Any, default: Any) -> Any:
    if value in (None, ""):
        return default
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(str(value))
    except json.JSONDecodeError:
        return default


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def preview_base_kind(kind: str) -> str:
    return kind.split(":unit", 1)[0]


def preview_unit(kind: str) -> int:
    match = re.search(r":unit(\d+)$", kind)
    return max(1, int(match.group(1))) if match else 1


def preview_kind(kind: str, unit: int) -> str:
    return kind if unit <= 1 else f"{kind}:unit{unit}"


def preview_unit_label(kind: str) -> str:
    unit = preview_unit(kind)
    if unit <= 26:
        return f"Unit {chr(64 + unit)}"
    return f"Unit {unit}"


__all__ = [
    "slugify",
    "sanitize_name",
    "utc_now_iso",
    "json_loads",
    "canonical_json",
    "sha256_text",
    "sha256_bytes",
    "sha256_file",
    "preview_base_kind",
    "preview_unit",
    "preview_kind",
    "preview_unit_label",
]
