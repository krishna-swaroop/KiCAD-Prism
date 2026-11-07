"""One content-addressed object store for every artifact kind Prism writes.

Job artifacts (``JobArtifactService``) and catalog artifacts
(``LocalArtifactStore``) both keep immutable sha256 objects at
``<objects>/aa/bb/<sha256>``, and with the default settings they share one
tree: ``<projects>/.kicad-prism/artifacts/objects/sha256``. An object can
therefore be owned by a job artifact, a catalog artifact, or both at once
(same digest). Anything that removes a file from that tree must ask every
owner first, which is what this module is for.

Owners are declared once, in :func:`default_reference_owners`. A table that
starts pinning objects in this tree must be added there, or the collector
will treat its objects as garbage.

The store is the local-filesystem adapter. Its interface (put, read, collect)
is kept small enough that another backend could sit behind it later.
"""

from __future__ import annotations

import hashlib
import os
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Callable, Iterable, Sequence

_CHUNK = 1024 * 1024


@dataclass(frozen=True)
class StoredObject:
    digest: str
    size_bytes: int
    path: Path


@dataclass(frozen=True)
class ReferenceOwner:
    """A table that pins objects: a name plus a reader of its live object paths."""

    name: str
    referenced_object_paths: Callable[[], Iterable[str]]


JOBS_OWNER = "jobs"
CATALOG_OWNER = "catalog"


def default_reference_owners() -> tuple[ReferenceOwner, ...]:
    """Every owner of objects in the shared tree.

    ``jobs`` covers ``ws_artifacts`` plus ``ws_artifact_release_pins``;
    ``catalog`` covers available ``catalog_artifacts`` rows. The readers are
    resolved at call time so tests can patch the service singletons.
    """

    from app.services.job_service import jobs
    from app.services.local_artifact_store import artifact_store

    return (
        ReferenceOwner(JOBS_OWNER, lambda: jobs.referenced_object_paths()),
        ReferenceOwner(CATALOG_OWNER, lambda: artifact_store.referenced_object_paths()),
    )


def fsync_directory(path: Path) -> None:
    """Flush a directory entry, where the platform allows it at all.

    Opening a directory and syncing it is how POSIX makes a rename durable.
    Windows cannot open a directory this way and offers no equivalent call, so
    the rename is left to the filesystem's own ordering there rather than
    failing the write. Artifacts are content-addressed and re-derivable, so the
    cost of the weaker guarantee is a rebuild after an unclean shutdown.

    Errors are not swallowed on platforms that do support this: a directory
    that cannot be opened there is a real fault worth surfacing.
    """

    if os.name == "nt":
        return
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


class ObjectStore:
    """Content-addressed objects on the local filesystem, collected across owners."""

    def __init__(
        self,
        objects_root: Path,
        *,
        owners: Sequence[ReferenceOwner] | None = None,
    ) -> None:
        self.root = Path(objects_root).expanduser().resolve()
        self._owners = owners

    # -- read -------------------------------------------------------------

    def path_for(self, digest: str) -> Path:
        return self.root / digest[:2] / digest[2:4] / digest

    def contains(self, path: str | Path) -> Path | None:
        """The resolved path when it lies inside this store, otherwise ``None``."""

        if not str(path or ""):
            return None
        resolved = Path(path).resolve()
        try:
            resolved.relative_to(self.root)
        except ValueError:
            return None
        return resolved

    # -- put --------------------------------------------------------------

    def put_file(self, source: Path) -> StoredObject:
        """Publish ``source`` (consumed) under its digest.

        Callers may have filled the file with copy helpers rather than an
        fsynced writer, so durability is established here before the file
        becomes the authoritative object. Windows rejects fsync on a
        read-only handle ([Errno 9]), the same gap :func:`fsync_directory`
        guards, so the flush is skipped there.
        """

        digest = hashlib.sha256()
        size = 0
        with source.open("rb") as handle:
            while chunk := handle.read(_CHUNK):
                digest.update(chunk)
                size += len(chunk)
            if os.name != "nt":
                os.fsync(handle.fileno())
        return self._publish(source, digest.hexdigest(), size)

    def put_stream(
        self,
        stream: BinaryIO,
        *,
        staging_dir: Path,
        max_bytes: int | None = None,
        expected_digest: str | None = None,
    ) -> StoredObject:
        """Copy ``stream`` through ``staging_dir`` (same filesystem) into the store.

        ``expected_digest`` rejects content that does not hash to it, before
        anything is published.
        """

        staging_dir.mkdir(parents=True, exist_ok=True)
        temp = staging_dir / f"upload-{uuid.uuid4().hex}"
        digest = hashlib.sha256()
        size = 0
        try:
            with temp.open("wb") as output:
                while chunk := stream.read(_CHUNK):
                    digest.update(chunk)
                    size += len(chunk)
                    if max_bytes is not None and size > max_bytes:
                        raise ValueError("Artifact exceeds the configured per-file size limit")
                    output.write(chunk)
                output.flush()
                os.fsync(output.fileno())
            sha = digest.hexdigest()
            if expected_digest is not None and sha != expected_digest:
                raise ValueError(f"Object content does not match digest {expected_digest}")
        except Exception:
            temp.unlink(missing_ok=True)
            raise
        return self._publish(temp, sha, size)

    def _publish(self, temp: Path, sha: str, size: int) -> StoredObject:
        destination = self.path_for(sha)
        destination.parent.mkdir(parents=True, exist_ok=True)
        # Always move the copy just hashed into place, even over an existing
        # file: one already there may be the corrupt bytes an artifact was
        # invalidated for, and keeping it would revive that artifact pointing
        # at them. The rename is atomic, and it also restarts the object's
        # grace period, as its new owner's metadata may not be committed yet
        # when the collector runs.
        os.replace(temp, destination)
        fsync_directory(destination.parent)
        return StoredObject(digest=sha, size_bytes=size, path=destination)

    # -- collect ----------------------------------------------------------

    def owners(self) -> Sequence[ReferenceOwner]:
        return default_reference_owners() if self._owners is None else self._owners

    def referenced_paths(
        self,
        *,
        owners: Sequence[ReferenceOwner] | None = None,
        exclude: str = "",
    ) -> set[Path]:
        """Paths inside this store that any owner (but ``exclude``) still pins.

        An owner that cannot be read raises: the caller must not delete on a
        partial view.
        """

        referenced: set[Path] = set()
        for owner in owners if owners is not None else self.owners():
            if owner.name == exclude:
                continue
            for value in owner.referenced_object_paths():
                path = self.contains(value)
                if path is not None:
                    referenced.add(path)
        return referenced

    def collect_unreferenced(
        self,
        *,
        grace_seconds: int,
        owners: Sequence[ReferenceOwner] | None = None,
    ) -> dict[str, int]:
        """Remove objects older than the grace period that no owner pins."""

        referenced = self.referenced_paths(owners=owners)
        removed = 0
        reclaimed_bytes = 0
        cutoff = time.time() - max(0, int(grace_seconds))
        if not self.root.is_dir():
            return {"objects_removed": 0, "bytes_reclaimed": 0}
        for path in self.root.rglob("*"):
            if not path.is_file() or path.resolve() in referenced:
                continue
            try:
                stat = path.stat()
            except OSError:
                continue
            if stat.st_mtime > cutoff:
                continue
            try:
                path.unlink()
            except OSError:
                continue
            removed += 1
            reclaimed_bytes += int(stat.st_size)
        for directory in sorted(
            (path for path in self.root.rglob("*") if path.is_dir()),
            key=lambda path: len(path.parts),
            reverse=True,
        ):
            try:
                directory.rmdir()
            except OSError:
                pass
        return {"objects_removed": removed, "bytes_reclaimed": reclaimed_bytes}
