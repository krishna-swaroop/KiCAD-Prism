"""Derived manufacturer upload zips.

The zip is a convenience download assembled from the signed dossier (gerbers,
drill, vendor CSV) plus evidence (XLSX). It is not a new signed member and
must not enter a fingerprint.
"""

from __future__ import annotations

import io
import tarfile
from pathlib import PurePosixPath
from typing import Mapping

from app.release_studio.canonical import write_deterministic_zip

from .registry import profile_by_id


class VendorPackError(RuntimeError):
    """A vendor pack could not be assembled from stored artifacts."""


def build_vendor_pack(
    vendor_id: str,
    *,
    dossier_bytes: bytes,
    evidence_bytes: bytes | None = None,
) -> bytes:
    """Build the derived zip for *vendor_id* from stored archives."""

    try:
        profile = profile_by_id(vendor_id)
    except KeyError as exc:
        raise VendorPackError(f"unknown vendor profile: {vendor_id}") from exc

    members, archive_mtime = _pack_members(vendor_id, dossier_bytes, evidence_bytes)

    readiness = _readiness(profile, members)
    if not readiness["ready"]:
        missing = ", ".join(readiness["missing_requirements"])
        raise VendorPackError(f"{profile.title} pack is incomplete: missing {missing}")
    return write_deterministic_zip(members, mtime=archive_mtime)


def vendor_pack_readiness(
    vendor_id: str,
    *,
    dossier_bytes: bytes,
    evidence_bytes: bytes | None = None,
) -> dict[str, object]:
    """Return the same fail-closed readiness predicate used by pack download."""

    try:
        profile = profile_by_id(vendor_id)
    except KeyError as exc:
        raise VendorPackError(f"unknown vendor profile: {vendor_id}") from exc
    members, _mtime = _pack_members(vendor_id, dossier_bytes, evidence_bytes)
    return {"vendor_id": vendor_id, "title": profile.title, **_readiness(profile, members)}


def _pack_members(
    vendor_id: str, dossier_bytes: bytes, evidence_bytes: bytes | None
) -> tuple[dict[str, bytes], int]:
    members: dict[str, bytes] = {}
    dossier, dossier_mtime = _tar_members(dossier_bytes)
    evidence, evidence_mtime = _tar_members(evidence_bytes or b"")

    for path, payload in dossier.items():
        if path.startswith("fabrication/gerbers/") and _is_file(path):
            members[f"gerbers/{PurePosixPath(path).name}"] = payload
        elif path.startswith("fabrication/drill/") and _is_file(path):
            members[f"drill/{PurePosixPath(path).name}"] = payload
        elif path.startswith(f"manufacturing/vendors/{vendor_id}/") and path.endswith(".csv"):
            members[PurePosixPath(path).name] = payload
    prefix = f"raw/vendors/{vendor_id}/"
    for path, payload in evidence.items():
        if path.startswith(prefix) and _is_file(path):
            members[PurePosixPath(path).name] = payload
    return members, max(dossier_mtime, evidence_mtime)


def _readiness(profile, members: Mapping[str, bytes]) -> dict[str, object]:
    requirements = tuple(getattr(profile, "required_pack_artifacts", ("gerber", "drill")))
    present = {
        "gerber": any(name.startswith("gerbers/") for name in members),
        "drill": any(name.startswith("drill/") for name in members),
        **{name: name in members for name in requirements if name not in {"gerber", "drill"}},
    }
    missing = [name for name in requirements if not present.get(name, False)]
    return {
        "ready": not missing,
        "missing_requirements": missing,
        "required_artifacts": list(requirements),
    }


def _tar_members(payload: bytes) -> tuple[dict[str, bytes], int]:
    if not payload:
        return {}, 0
    members: dict[str, bytes] = {}
    mtime = 0
    try:
        with tarfile.open(fileobj=io.BytesIO(payload), mode="r:*") as archive:
            for info in archive.getmembers():
                if not info.isfile():
                    continue
                extracted = archive.extractfile(info)
                if extracted is None:
                    continue
                members[info.name] = extracted.read()
                mtime = max(mtime, int(info.mtime or 0))
    except tarfile.TarError as exc:
        raise VendorPackError(f"stored archive could not be read: {exc}") from exc
    return members, mtime


def _is_file(path: str) -> bool:
    return bool(path) and not path.endswith("/")


__all__ = ["VendorPackError", "build_vendor_pack", "vendor_pack_readiness"]
