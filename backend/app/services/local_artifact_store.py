from __future__ import annotations

import gzip
import hashlib
import json
import os
import shutil
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, BinaryIO

from app.core.config import settings
from app.services.postgres_database import database


@dataclass(frozen=True)
class StoredArtifact:
    sha256: str
    size_bytes: int
    path: Path


class LocalArtifactStore:
    """Local content-addressed storage with PostgreSQL ownership metadata."""

    def __init__(self, root: Path | None = None) -> None:
        default = Path(settings.KICAD_PROJECTS_ROOT) / ".kicad-prism" / "artifacts"
        self.root = (root or Path(settings.CATALOG_ARTIFACT_ROOT or default)).expanduser().resolve()
        self.objects = self.root / "objects" / "sha256"
        self.archive = self.root / "archive" / "sha256"
        self.staging = self.root / "staging"
        self.quarantine = self.root / "quarantine"
        self._initialized = False

    @contextmanager
    def _connect(self):
        with database.connection() as connection:
            connection.execute("SET search_path TO operations, catalog, public")
            yield connection

    def initialize(self) -> None:
        if self._initialized:
            return
        for directory in (self.objects, self.archive, self.staging, self.quarantine):
            directory.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute("CREATE SCHEMA IF NOT EXISTS operations")
            conn.execute("SET search_path TO operations, catalog, public")
            conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("prism-artifacts-schema",))
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS catalog_artifacts (
                    sha256 TEXT PRIMARY KEY,
                    size_bytes BIGINT NOT NULL,
                    media_type TEXT NOT NULL DEFAULT 'application/octet-stream',
                    artifact_kind TEXT NOT NULL DEFAULT 'source',
                    storage_state TEXT NOT NULL DEFAULT 'available',
                    object_path TEXT NOT NULL,
                    archived_path TEXT NOT NULL DEFAULT '',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    quarantined_at TIMESTAMPTZ,
                    purged_at TIMESTAMPTZ
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS catalog_artifact_references (
                    id TEXT PRIMARY KEY,
                    artifact_sha256 TEXT NOT NULL REFERENCES catalog_artifacts(sha256),
                    owner_type TEXT NOT NULL,
                    owner_id TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT '',
                    released BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    removed_at TIMESTAMPTZ,
                    UNIQUE(artifact_sha256, owner_type, owner_id, role)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS catalog_import_snapshots (
                    id TEXT PRIMARY KEY,
                    source_type TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    source_locator TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'uploading',
                    manifest_sha256 TEXT NOT NULL DEFAULT '',
                    file_count INTEGER NOT NULL DEFAULT 0,
                    size_bytes BIGINT NOT NULL DEFAULT 0,
                    created_by TEXT NOT NULL DEFAULT '',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    completed_at TIMESTAMPTZ
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS catalog_import_snapshot_files (
                    snapshot_id TEXT NOT NULL REFERENCES catalog_import_snapshots(id) ON DELETE CASCADE,
                    relative_path TEXT NOT NULL,
                    artifact_sha256 TEXT NOT NULL REFERENCES catalog_artifacts(sha256),
                    size_bytes BIGINT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY(snapshot_id, relative_path)
                )
                """
            )
            # The catalog's common read path is revision -> asset. Retention needs
            # the reverse lookup and should not scan every revision link.
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_revision_assets_asset "
                "ON revision_assets(asset_id, revision_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_artifact_refs_active "
                "ON catalog_artifact_references(artifact_sha256, removed_at, released)"
            )
            conn.commit()
        self._initialized = True

    def object_path(self, digest: str) -> Path:
        return self.objects / digest[:2] / digest[2:4] / digest

    def put_stream(
        self,
        stream: BinaryIO,
        *,
        media_type: str = "application/octet-stream",
        artifact_kind: str = "source",
        max_bytes: int | None = None,
    ) -> StoredArtifact:
        self.initialize()
        temp = self.staging / f"upload-{uuid.uuid4().hex}"
        digest = hashlib.sha256()
        size = 0
        try:
            with temp.open("wb") as output:
                while chunk := stream.read(1024 * 1024):
                    digest.update(chunk)
                    size += len(chunk)
                    if max_bytes is not None and size > max_bytes:
                        raise ValueError("Artifact exceeds the configured per-file size limit")
                    output.write(chunk)
                output.flush()
                os.fsync(output.fileno())
        except Exception:
            temp.unlink(missing_ok=True)
            raise
        sha = digest.hexdigest()
        destination = self.object_path(sha)
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            temp.unlink(missing_ok=True)
        else:
            os.replace(temp, destination)
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO catalog_artifacts (
                    sha256, size_bytes, media_type, artifact_kind, object_path
                ) VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (sha256) DO UPDATE SET last_accessed_at = NOW()
                """,
                (sha, size, media_type, artifact_kind, str(destination)),
            )
            conn.commit()
        return StoredArtifact(sha256=sha, size_bytes=size, path=destination)

    def put_file(self, path: Path, **kwargs: Any) -> StoredArtifact:
        with path.open("rb") as stream:
            return self.put_stream(stream, **kwargs)

    def add_reference(
        self,
        sha256: str,
        *,
        owner_type: str,
        owner_id: str,
        role: str = "",
        released: bool = False,
    ) -> None:
        self.initialize()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO catalog_artifact_references (
                    id, artifact_sha256, owner_type, owner_id, role, released
                ) VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (artifact_sha256, owner_type, owner_id, role)
                DO UPDATE SET removed_at = NULL, released = EXCLUDED.released
                """,
                (str(uuid.uuid4()), sha256, owner_type, owner_id, role, released),
            )
            conn.commit()

    def create_snapshot(
        self,
        *,
        source_type: str,
        display_name: str,
        created_by: str,
        source_locator: str = "",
    ) -> dict[str, Any]:
        self.initialize()
        snapshot_id = str(uuid.uuid4())
        with self._connect() as conn:
            row = conn.execute(
                """
                INSERT INTO catalog_import_snapshots (
                    id, source_type, display_name, source_locator, created_by
                ) VALUES (%s, %s, %s, %s, %s) RETURNING *
                """,
                (snapshot_id, source_type, display_name.strip() or "KiCad libraries", source_locator, created_by),
            ).fetchone()
            conn.commit()
        return dict(row)

    @staticmethod
    def normalize_relative_path(value: str) -> str:
        normalized = value.replace("\\", "/").strip().lstrip("/")
        path = Path(normalized)
        if not normalized or path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
            raise ValueError("Invalid snapshot relative path")
        return path.as_posix()

    def add_snapshot_file(self, snapshot_id: str, relative_path: str, artifact: StoredArtifact) -> None:
        relative_path = self.normalize_relative_path(relative_path)
        with self._connect() as conn:
            status = conn.execute(
                "SELECT status FROM catalog_import_snapshots WHERE id = %s FOR UPDATE",
                (snapshot_id,),
            ).fetchone()
            if not status:
                raise ValueError("Import snapshot not found")
            if status["status"] != "uploading":
                raise ValueError("Import snapshot is already immutable")
            previous = conn.execute(
                "SELECT artifact_sha256, size_bytes FROM catalog_import_snapshot_files "
                "WHERE snapshot_id = %s AND relative_path = %s",
                (snapshot_id, relative_path),
            ).fetchone()
            totals = conn.execute(
                "SELECT COUNT(*) AS file_count, COALESCE(SUM(size_bytes), 0) AS size_bytes "
                "FROM catalog_import_snapshot_files WHERE snapshot_id = %s",
                (snapshot_id,),
            ).fetchone()
            resulting_count = int(totals["file_count"] or 0) + (0 if previous else 1)
            resulting_size = (
                int(totals["size_bytes"] or 0)
                - (int(previous["size_bytes"]) if previous else 0)
                + artifact.size_bytes
            )
            if resulting_count > settings.CATALOG_IMPORT_MAX_FILES:
                raise ValueError("Folder snapshot exceeds the configured file-count limit")
            if resulting_size > settings.CATALOG_IMPORT_MAX_SNAPSHOT_BYTES:
                raise ValueError("Folder snapshot exceeds the configured aggregate size limit")
            if previous and str(previous["artifact_sha256"]) != artifact.sha256:
                conn.execute(
                    "UPDATE catalog_artifact_references SET removed_at = NOW() "
                    "WHERE artifact_sha256 = %s AND owner_type = 'import_snapshot' "
                    "AND owner_id = %s AND role = %s AND removed_at IS NULL",
                    (previous["artifact_sha256"], snapshot_id, relative_path),
                )
            conn.execute(
                """
                INSERT INTO catalog_import_snapshot_files (
                    snapshot_id, relative_path, artifact_sha256, size_bytes
                ) VALUES (%s, %s, %s, %s)
                ON CONFLICT (snapshot_id, relative_path) DO UPDATE SET
                    artifact_sha256 = EXCLUDED.artifact_sha256,
                    size_bytes = EXCLUDED.size_bytes,
                    created_at = NOW()
                """,
                (snapshot_id, relative_path, artifact.sha256, artifact.size_bytes),
            )
            conn.execute(
                """
                INSERT INTO catalog_artifact_references (
                    id, artifact_sha256, owner_type, owner_id, role
                ) VALUES (%s, %s, 'import_snapshot', %s, %s)
                ON CONFLICT (artifact_sha256, owner_type, owner_id, role)
                DO UPDATE SET removed_at = NULL
                """,
                (str(uuid.uuid4()), artifact.sha256, snapshot_id, relative_path),
            )
            conn.commit()

    def complete_snapshot(self, snapshot_id: str) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            snapshot = conn.execute(
                "SELECT * FROM catalog_import_snapshots WHERE id = %s FOR UPDATE", (snapshot_id,)
            ).fetchone()
            if not snapshot:
                raise ValueError("Import snapshot not found")
            if snapshot["status"] == "ready":
                conn.commit()
                return self.get_snapshot(snapshot_id) or {}
            if snapshot["status"] != "uploading":
                raise ValueError("Import snapshot cannot be completed")
            files = conn.execute(
                "SELECT relative_path, artifact_sha256, size_bytes FROM catalog_import_snapshot_files "
                "WHERE snapshot_id = %s ORDER BY relative_path",
                (snapshot_id,),
            ).fetchall()
            if not files and snapshot["source_type"] == "browser":
                raise ValueError("The selected directory did not upload any files")
            manifest = json.dumps([dict(row) for row in files], sort_keys=True, separators=(",", ":"))
            digest = hashlib.sha256(manifest.encode("utf-8")).hexdigest()
            conn.execute(
                """
                UPDATE catalog_import_snapshots SET status = 'ready',
                    manifest_sha256 = %s, file_count = %s, size_bytes = %s,
                    completed_at = NOW() WHERE id = %s
                """,
                (digest, len(files), sum(int(row["size_bytes"]) for row in files), snapshot_id),
            )
            conn.commit()
        return self.get_snapshot(snapshot_id) or {}

    def get_snapshot(self, snapshot_id: str) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM catalog_import_snapshots WHERE id = %s", (snapshot_id,)
            ).fetchone()
        return dict(row) if row else None

    def snapshot_files(self, snapshot_id: str) -> list[dict[str, Any]]:
        self.initialize()
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT file.relative_path, file.artifact_sha256 AS sha256,
                       file.size_bytes, artifact.object_path
                FROM catalog_import_snapshot_files file
                JOIN catalog_artifacts artifact ON artifact.sha256 = file.artifact_sha256
                WHERE file.snapshot_id = %s ORDER BY file.relative_path
                """,
                (snapshot_id,),
            ).fetchall()
        decoded: list[dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            item["object_path"] = str(self.ensure_available(str(item["sha256"])))
            decoded.append(item)
        return decoded

    def ensure_available(self, sha256: str) -> Path:
        destination = self.object_path(sha256)
        if destination.is_file():
            return destination
        with self._connect() as conn:
            row = conn.execute(
                "SELECT storage_state, archived_path FROM catalog_artifacts WHERE sha256 = %s",
                (sha256,),
            ).fetchone()
            if not row or row["storage_state"] != "archived":
                raise ValueError(f"Artifact {sha256} is unavailable")
            archived = Path(str(row["archived_path"] or ""))
            if not archived.is_file():
                raise ValueError(f"Archived artifact {sha256} is unavailable")
            destination.parent.mkdir(parents=True, exist_ok=True)
            with gzip.open(archived, "rb") as input_file, destination.open("wb") as output:
                shutil.copyfileobj(input_file, output)
            if hashlib.sha256(destination.read_bytes()).hexdigest() != sha256:
                destination.unlink(missing_ok=True)
                raise ValueError(f"Archived artifact {sha256} failed integrity verification")
            conn.execute(
                "UPDATE catalog_artifacts SET storage_state = 'available', object_path = %s, "
                "last_accessed_at = NOW() WHERE sha256 = %s",
                (str(destination), sha256),
            )
            conn.commit()
        return destination

    def materialize(self, sha256: str, destination: Path) -> Path:
        source = self.ensure_available(sha256)
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            if hashlib.sha256(destination.read_bytes()).hexdigest() == sha256:
                return destination
            raise ValueError(f"Staged artifact collision at {destination}")
        try:
            os.link(source, destination)
        except OSError:
            shutil.copyfile(source, destination)
        return destination

    def archive_unreleased_before(self, cutoff: datetime) -> int:
        """Compress old, unreferenced source objects. Released refs always win."""
        self.initialize()
        archived = 0
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT artifact.* FROM catalog_artifacts artifact
                WHERE artifact.storage_state = 'available'
                  AND artifact.artifact_kind = 'source'
                  AND artifact.created_at < %s
                  AND NOT EXISTS (
                    SELECT 1 FROM catalog_artifact_references ref
                    WHERE ref.artifact_sha256 = artifact.sha256
                      AND ref.removed_at IS NULL AND ref.released
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM catalog_artifact_references step_ref
                    WHERE step_ref.artifact_sha256 = artifact.sha256
                      AND lower(step_ref.role) ~ '\\.(step|stp)$'
                  )
                """,
                (cutoff,),
            ).fetchall()
            for row in rows:
                source = Path(row["object_path"])
                if not source.is_file() or source.suffix.lower() in {".step", ".stp"}:
                    continue
                destination = self.archive / row["sha256"][:2] / f"{row['sha256']}.gz"
                destination.parent.mkdir(parents=True, exist_ok=True)
                with source.open("rb") as input_file, gzip.open(destination, "wb", compresslevel=6) as output:
                    shutil.copyfileobj(input_file, output)
                source.unlink()
                conn.execute(
                    "UPDATE catalog_artifacts SET storage_state = 'archived', archived_path = %s, "
                    "object_path = '' WHERE sha256 = %s",
                    (str(destination), row["sha256"]),
                )
                archived += 1
            conn.commit()
        return archived

    def quarantine_unreferenced_before(self, cutoff: datetime) -> int:
        self.initialize()
        moved = 0
        run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT artifact.* FROM catalog_artifacts artifact
                WHERE artifact.storage_state = 'available'
                  AND artifact.created_at < %s
                  AND NOT EXISTS (
                    SELECT 1 FROM catalog_artifact_references ref
                    WHERE ref.artifact_sha256 = artifact.sha256 AND ref.removed_at IS NULL
                  )
                """,
                (cutoff,),
            ).fetchall()
            for row in rows:
                source = Path(str(row["object_path"] or ""))
                if not source.is_file():
                    continue
                destination = self.quarantine / run_id / str(row["sha256"])
                destination.parent.mkdir(parents=True, exist_ok=True)
                os.replace(source, destination)
                conn.execute(
                    "UPDATE catalog_artifacts SET storage_state = 'quarantined', "
                    "object_path = %s, quarantined_at = NOW() WHERE sha256 = %s",
                    (str(destination), row["sha256"]),
                )
                moved += 1
            conn.commit()
        return moved

    def release_resolved_snapshot_references(self, cutoff: datetime) -> int:
        """Make old reviewed snapshot uploads eligible for quarantine."""
        self.initialize()
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT snapshot.id
                FROM catalog_import_snapshots snapshot
                WHERE snapshot.completed_at < %s
                  AND NOT EXISTS (
                    SELECT 1
                    FROM project_component_import_sessions session
                    JOIN project_component_import_proposals proposal
                      ON proposal.session_id = session.id
                    WHERE session.selection_json::jsonb ->> 'snapshot_id' = snapshot.id
                      AND proposal.status IN ('candidate', 'accepting')
                  )
                """,
                (cutoff,),
            ).fetchall()
            snapshot_ids = [str(row["id"]) for row in rows]
            for snapshot_id in snapshot_ids:
                conn.execute(
                    "UPDATE catalog_artifact_references SET removed_at = COALESCE(removed_at, NOW()) "
                    "WHERE owner_type = 'import_snapshot' AND owner_id = %s",
                    (snapshot_id,),
                )
            conn.commit()
        return len(snapshot_ids)

    def delete_expired_quarantine(self, cutoff: datetime) -> int:
        self.initialize()
        deleted = 0
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT sha256, object_path FROM catalog_artifacts "
                "WHERE storage_state = 'quarantined' AND quarantined_at < %s",
                (cutoff,),
            ).fetchall()
            for row in rows:
                Path(str(row["object_path"] or "")).unlink(missing_ok=True)
                conn.execute(
                    "UPDATE catalog_artifacts SET storage_state = 'purged', object_path = '', "
                    "purged_at = NOW() WHERE sha256 = %s",
                    (row["sha256"],),
                )
                deleted += 1
            conn.commit()
        return deleted

    def run_retention(self) -> dict[str, int]:
        now = datetime.now(timezone.utc)
        released_snapshots = self.release_resolved_snapshot_references(now - timedelta(days=30))
        return {
            "released_snapshots": released_snapshots,
            "archived": self.archive_unreleased_before(now - timedelta(days=90)),
            "quarantined": self.quarantine_unreferenced_before(now - timedelta(days=30)),
            "purged": self.delete_expired_quarantine(now - timedelta(days=14)),
        }


artifact_store = LocalArtifactStore()
