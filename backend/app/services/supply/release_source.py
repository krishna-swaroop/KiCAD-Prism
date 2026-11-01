"""Where a release build's exported BOM is kept, and how to read it.

A build's dossier is a stored archive. Its BOM is the member recorded with kind ``bom`` (``assembly/bom.csv``). Reading
it checks the member's recorded digest, as every other view of a released file does: a BOM that does not match its record
is not read.
"""

from __future__ import annotations

import hashlib
import tarfile
from pathlib import Path

from app.services.supply import release_bom


class NoBuildBom(LookupError):
    """The build has no BOM to read. The message is safe to show."""


def build_bom_text(build_id: str) -> str:
    from app.services import release_studio_service as store

    build = store.get_build(build_id)
    if build is None:
        raise NoBuildBom("The build does not exist.")
    members = [item for item in store.build_members(build_id) if item.get("member_kind") == "bom" and str(item["path"]).lower().endswith(".csv")]
    if not members:
        raise NoBuildBom("This build exported no BOM file.")
    member = members[0]
    artifact = store.get_artifact(str(build.get("dossier_artifact_id") or "")) if build.get("dossier_artifact_id") else None
    if artifact is None:
        raise NoBuildBom("This build's files are no longer stored.")
    path = Path(str(artifact["object_path"]))
    if not path.is_file():
        raise NoBuildBom("This build's files are no longer stored.")
    try:
        with tarfile.open(path, mode="r:gz") as archive:
            entry = archive.getmember(member["path"])
            if entry.size > release_bom.MAX_BYTES:
                raise NoBuildBom("This build's BOM is larger than 8 MB.")
            extracted = archive.extractfile(entry)
            data = extracted.read() if extracted is not None else b""
    except (tarfile.TarError, KeyError):
        raise NoBuildBom("This build's BOM could not be read from its files.") from None
    recorded = str(member.get("released_digest") or "")
    if recorded and hashlib.sha256(data).hexdigest() != recorded:
        raise NoBuildBom("This build's BOM does not match its record.")
    return data.decode("utf-8", "replace")
