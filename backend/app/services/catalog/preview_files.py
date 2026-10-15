"""Preview files are stored gzipped beside their logical ``.svg`` path.

A preview row keeps the path, sha256 and size of the SVG itself; only the
bytes on disk are ``<path>.gz``. Previews compress 4-16x, and the catalog
holds tens of thousands of them. Files written before compression stay plain
and are read as they are.
"""

from __future__ import annotations

import gzip
import os
import uuid
from pathlib import Path

from app.services.catalog.normalization import sha256_bytes

GZIP_SUFFIX = ".gz"


def compressed_path(path: Path) -> Path:
    return path.with_name(path.name + GZIP_SUFFIX)


def stored_file(path: Path) -> tuple[Path, bool] | None:
    """The file holding ``path``'s bytes and whether it is gzipped, or None."""

    if path.is_file():
        return path, False
    packed = compressed_path(path)
    if packed.is_file():
        return packed, True
    return None


def read_preview(path: Path) -> bytes | None:
    stored = stored_file(path)
    if stored is None:
        return None
    file, packed = stored
    data = file.read_bytes()
    return gzip.decompress(data) if packed else data


def preview_sha256(path: Path) -> str | None:
    data = read_preview(path)
    return None if data is None else sha256_bytes(data)


def write_preview(path: Path, payload: bytes) -> None:
    """Store ``payload`` for the logical ``path`` (gzipped, written atomically)."""

    target = compressed_path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f".{target.name}.{uuid.uuid4().hex}.tmp")
    temporary.write_bytes(gzip.compress(payload, compresslevel=9, mtime=0))
    os.replace(temporary, target)


def compress_in_place(path: Path) -> int:
    """Replace a plain stored preview with its gzipped form; returns bytes saved."""

    if not path.is_file():
        return 0
    payload = path.read_bytes()
    write_preview(path, payload)
    saved = len(payload) - compressed_path(path).stat().st_size
    path.unlink()
    return saved


__all__ = [
    "compress_in_place",
    "compressed_path",
    "preview_sha256",
    "read_preview",
    "stored_file",
    "write_preview",
]
