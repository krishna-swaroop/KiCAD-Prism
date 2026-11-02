"""Short-lived staged uploads: a file an agent sends once, then names by id.

An MCP client cannot send multipart form data, and a STEP model is too large to
travel inside a tool call's arguments. So a writer asks for an upload slot, the
client ``PUT``s the bytes to the slot's signed URL (``curl -T`` works), and a
later JSON call attaches or checks the file by its ``upload_id``.

A slot belongs to the person who opened it, takes one write, expires after
``UPLOAD_TTL_SECONDS`` and is deleted when it is consumed. Nothing here touches
the database: a slot is a directory under the catalog store's ``uploads`` root
holding ``meta.json`` and, once written, ``payload``.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import hmac
import json
from pathlib import Path
import re
import shutil
import time
from typing import Any, BinaryIO
import uuid

from app.core.errors import DomainError
from app.services.catalog.kicad_embedded_files import EMBED_MAX_RAW_MODEL_BYTES
from app.services.catalog.normalization import sanitize_name
from app.services.catalog.signed_urls import CatalogAssetUrlSigner

UPLOAD_TTL_SECONDS = 15 * 60
# Matches the largest model Prism will embed in a footprint; symbols and
# footprints are far smaller.
UPLOAD_MAX_BYTES = EMBED_MAX_RAW_MODEL_BYTES
_CHUNK_BYTES = 1024 * 1024
_UPLOAD_ID = re.compile(r"^upl_[0-9a-f]{32}$")


class StagedUploadError(DomainError):
    """A slot that is unknown, expired, already written, too large or not the caller's.

    A ``DomainError``, so a route lets it through and the app's handler answers
    with its status and message.
    """

    code = "upload_refused"


@dataclass(frozen=True)
class StagedFile:
    upload_id: str
    file_name: str
    payload: bytes
    sha256: str


def _signature(upload_id: str, expires_at: int) -> str:
    return CatalogAssetUrlSigner.sign(f"catalog-upload:{upload_id}:{expires_at}")


class StagedUploads:
    """Open, fill, read and consume upload slots under ``root``."""

    def __init__(self, root: Path) -> None:
        self._root = Path(root)

    def _slot(self, upload_id: str) -> Path:
        if not _UPLOAD_ID.match(upload_id or ""):
            raise StagedUploadError("Unknown upload", status_code=404)
        return self._root / upload_id

    def _meta(self, upload_id: str) -> dict[str, Any]:
        path = self._slot(upload_id) / "meta.json"
        if not path.is_file():
            raise StagedUploadError("Unknown upload", status_code=404)
        return json.loads(path.read_text(encoding="utf-8"))

    def purge_expired(self, *, now: float | None = None) -> None:
        current = time.time() if now is None else now
        if not self._root.is_dir():
            return
        for slot in self._root.iterdir():
            meta_path = slot / "meta.json"
            try:
                expires_at = json.loads(meta_path.read_text(encoding="utf-8"))["expires_at"]
            except (OSError, ValueError, KeyError):
                expires_at = 0
            if expires_at <= current:
                shutil.rmtree(slot, ignore_errors=True)

    def open(self, *, owner: str, file_name: str) -> dict[str, Any]:
        """A new empty slot for ``owner``: its id, expiry and signature."""

        self.purge_expired()
        upload_id = f"upl_{uuid.uuid4().hex}"
        expires_at = int(time.time()) + UPLOAD_TTL_SECONDS
        slot = self._slot(upload_id)
        slot.mkdir(parents=True)
        meta = {
            "upload_id": upload_id,
            "owner": owner,
            "file_name": sanitize_name(file_name, "upload.bin"),
            "expires_at": expires_at,
        }
        (slot / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
        return {**meta, "signature": _signature(upload_id, expires_at), "max_bytes": UPLOAD_MAX_BYTES}

    def write(self, upload_id: str, *, expires_at: int, signature: str, stream: BinaryIO) -> dict[str, Any]:
        """Store the slot's bytes once; the signed URL is the only credential."""

        if expires_at <= int(time.time()) or not hmac.compare_digest(
            _signature(upload_id, expires_at), signature
        ):
            raise StagedUploadError("Invalid or expired upload signature", status_code=403)
        meta = self._meta(upload_id)
        if int(meta["expires_at"]) != expires_at:
            raise StagedUploadError("Invalid or expired upload signature", status_code=403)
        slot = self._slot(upload_id)
        payload_path = slot / "payload"
        partial = slot / "payload.partial"
        if payload_path.exists():
            raise StagedUploadError("This upload was already written", status_code=409)
        digest = hashlib.sha256()
        size = 0
        with partial.open("wb") as handle:
            while chunk := stream.read(_CHUNK_BYTES):
                size += len(chunk)
                if size > UPLOAD_MAX_BYTES:
                    handle.close()
                    partial.unlink(missing_ok=True)
                    raise StagedUploadError(
                        f"Upload is larger than {UPLOAD_MAX_BYTES} bytes", status_code=413
                    )
                digest.update(chunk)
                handle.write(chunk)
        if size == 0:
            partial.unlink(missing_ok=True)
            raise StagedUploadError("Upload was empty")
        partial.rename(payload_path)
        return {"upload_id": upload_id, "size_bytes": size, "sha256": digest.hexdigest()}

    def read(self, upload_id: str, *, owner: str) -> StagedFile:
        """The written file, for the person who opened the slot."""

        meta = self._meta(upload_id)
        if meta.get("owner") != owner:
            raise StagedUploadError("Unknown upload", status_code=404)
        if int(meta["expires_at"]) <= int(time.time()):
            raise StagedUploadError("This upload has expired", status_code=410)
        payload_path = self._slot(upload_id) / "payload"
        if not payload_path.is_file():
            raise StagedUploadError("Nothing has been uploaded to this slot yet", status_code=409)
        payload = payload_path.read_bytes()
        return StagedFile(
            upload_id=upload_id,
            file_name=str(meta["file_name"]),
            payload=payload,
            sha256=hashlib.sha256(payload).hexdigest(),
        )

    def discard(self, upload_id: str) -> None:
        shutil.rmtree(self._slot(upload_id), ignore_errors=True)


__all__ = [
    "StagedFile",
    "StagedUploadError",
    "StagedUploads",
    "UPLOAD_MAX_BYTES",
    "UPLOAD_TTL_SECONDS",
]
