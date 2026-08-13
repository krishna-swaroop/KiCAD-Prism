from __future__ import annotations

import hashlib
import json
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Any, Mapping

from app.services.job_runtime import JobContext, PreparedArtifact, job_state_root


def _fsync_directory(path: Path) -> None:
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


class JobArtifactService:
    """Prepare immutable content-addressed objects on the shared local volume."""

    def __init__(self, root: Path | None = None) -> None:
        self.root = (root or job_state_root()).resolve()
        self.objects = self.root / "artifacts" / "objects" / "sha256"

    def prepare_json(
        self,
        context: JobContext,
        payload: Mapping[str, Any],
        *,
        kind: str,
        artifact_key: str,
        schema_version: str = "",
        generator_version: str = "",
        readiness: str = "ready",
    ) -> PreparedArtifact:
        context.check_cancelled()
        context.staging_dir.mkdir(parents=True, exist_ok=True)
        temporary = context.staging_dir / f"artifact-{uuid.uuid4().hex}.json"
        encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode(
            "utf-8"
        )
        with temporary.open("wb") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        return self.prepare_file(
            context,
            temporary,
            kind=kind,
            artifact_key=artifact_key,
            media_type="application/json",
            schema_version=schema_version,
            generator_version=generator_version,
            readiness=readiness,
        )

    def prepare_file(
        self,
        context: JobContext,
        source: Path,
        *,
        kind: str,
        artifact_key: str,
        media_type: str = "application/octet-stream",
        schema_version: str = "",
        generator_version: str = "",
        readiness: str = "ready",
    ) -> PreparedArtifact:
        context.check_cancelled()
        source = source.resolve()
        try:
            source.relative_to(context.staging_dir.resolve())
        except ValueError as error:
            raise ValueError("Job artifacts must be prepared inside the fenced staging directory") from error
        digest = hashlib.sha256()
        size = 0
        with source.open("rb") as handle:
            while chunk := handle.read(1024 * 1024):
                digest.update(chunk)
                size += len(chunk)
            # Callers may have populated the staging file with copy helpers rather
            # than an explicitly fsynced writer. Durability must be established
            # before the file can become the authoritative content-addressed object.
            #
            # Windows rejects fsync on a read-only handle ([Errno 9] Bad file
            # descriptor), the same platform gap _fsync_directory guards against.
            # Artifacts are content-addressed and re-derivable, so skipping the
            # flush there costs at most a rebuild after an unclean shutdown.
            if os.name != "nt":
                os.fsync(handle.fileno())
        sha = digest.hexdigest()
        destination = self.objects / sha[:2] / sha[2:4] / sha
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            source.unlink(missing_ok=True)
        else:
            os.replace(source, destination)
            _fsync_directory(destination.parent)
        return PreparedArtifact(
            kind=kind,
            artifact_key=artifact_key,
            digest=sha,
            object_path=str(destination),
            size_bytes=size,
            media_type=media_type,
            schema_version=schema_version,
            generator_version=generator_version,
            readiness=readiness,
        )

    def prepare_directory(
        self,
        context: JobContext,
        source: Path,
        *,
        kind: str,
        artifact_key: str,
        schema_version: str = "",
        generator_version: str = "",
        readiness: str = "ready",
    ) -> PreparedArtifact:
        """Package a directory deterministically before immutable publication."""

        context.check_cancelled()
        source = source.resolve()
        try:
            source.relative_to(context.staging_dir.resolve())
        except ValueError as error:
            raise ValueError("Job artifacts must be prepared inside the fenced staging directory") from error
        archive_base = context.staging_dir / f"bundle-{uuid.uuid4().hex}"
        archive = Path(
            shutil.make_archive(
                str(archive_base),
                "gztar",
                root_dir=str(source.parent),
                base_dir=source.name,
            )
        )
        return self.prepare_file(
            context,
            archive,
            kind=kind,
            artifact_key=artifact_key,
            media_type="application/gzip",
            schema_version=schema_version,
            generator_version=generator_version,
            readiness=readiness,
        )

    def reconcile_registered_artifacts(
        self,
        *,
        service: Any | None = None,
        limit: int = 10000,
    ) -> dict[str, int]:
        """Invalidate ready metadata whose immutable object disappeared."""

        if service is None:
            from app.services.job_service import jobs

            service = jobs
        checked = 0
        invalidated = 0
        object_root = self.objects.resolve()
        for artifact in service.list_ready_artifacts(limit=limit):
            checked += 1
            path = Path(str(artifact.get("object_path") or "")).resolve()
            reason = ""
            try:
                path.relative_to(object_root)
            except ValueError:
                reason = "object_path_outside_artifact_root"
            if not reason and not path.is_file():
                reason = "object_missing"
            if reason and service.invalidate_artifact(str(artifact["id"]), reason=reason):
                invalidated += 1
        return {"checked": checked, "invalidated": invalidated}

    def collect_unreferenced_objects(
        self,
        *,
        service: Any | None = None,
        grace_seconds: int = 24 * 60 * 60,
    ) -> dict[str, int]:
        """Remove only old content-addressed files with no live metadata pointer."""

        if service is None:
            from app.services.job_service import jobs

            service = jobs
        object_root = self.objects.resolve()
        referenced: set[Path] = set()
        for value in service.referenced_object_paths():
            path = Path(value).resolve()
            try:
                path.relative_to(object_root)
            except ValueError:
                continue
            referenced.add(path)

        removed = 0
        reclaimed_bytes = 0
        cutoff = time.time() - max(0, int(grace_seconds))
        if object_root.is_dir():
            for path in object_root.rglob("*"):
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
                (path for path in object_root.rglob("*") if path.is_dir()),
                key=lambda path: len(path.parts),
                reverse=True,
            ):
                try:
                    directory.rmdir()
                except OSError:
                    pass
        return {"objects_removed": removed, "bytes_reclaimed": reclaimed_bytes}

    def cleanup_stale_staging(
        self,
        *,
        service: Any | None = None,
        grace_seconds: int = 60 * 60,
    ) -> dict[str, int]:
        """Delete abandoned fenced staging directories while preserving live leases."""

        if service is None:
            from app.services.job_service import jobs

            service = jobs
        staging_root = (self.root / "staging").resolve()
        if not staging_root.is_dir():
            return {"staging_directories_removed": 0}
        active = service.active_execution_keys()
        cutoff = time.time() - max(0, int(grace_seconds))
        removed = 0
        for job_dir in list(staging_root.iterdir()):
            if not job_dir.is_dir():
                continue
            for fence_dir in list(job_dir.iterdir()):
                if not fence_dir.is_dir():
                    continue
                try:
                    fence = int(fence_dir.name)
                    modified = fence_dir.stat().st_mtime
                except (OSError, ValueError):
                    continue
                if (job_dir.name, fence) in active or modified > cutoff:
                    continue
                shutil.rmtree(fence_dir, ignore_errors=True)
                if not fence_dir.exists():
                    removed += 1
            try:
                job_dir.rmdir()
            except OSError:
                pass
        return {"staging_directories_removed": removed}


job_artifacts = JobArtifactService()
