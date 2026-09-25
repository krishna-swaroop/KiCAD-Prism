"""Immutable catalog preview-version persistence and readiness checks."""

from __future__ import annotations

import os
from pathlib import Path
import uuid
from typing import Any, Mapping

from app.services.catalog.normalization import sha256_bytes, sha256_file, utc_now_iso


class CatalogPreviewStore:
    """Stateless preview persistence using explicitly supplied dependencies."""

    @staticmethod
    def store_preview_version(
        conn: Any,
        *,
        asset: Mapping[str, Any],
        kind: str,
        payload: bytes,
        generator_identity: Mapping[str, str],
        destination: Path,
    ) -> dict[str, Any]:
        sha256 = sha256_bytes(payload)
        existing = conn.execute(
            """
            SELECT * FROM asset_preview_versions
            WHERE asset_id = %s AND kind = %s AND sha256 = %s AND generator_fingerprint = %s
            """,
            (str(asset["id"]), kind, sha256, generator_identity["generator_fingerprint"]),
        ).fetchone()
        if existing:
            path = Path(str(existing["file_path"])).resolve()
            if not path.is_file() or sha256_file(path) != sha256:
                raise ValueError(f"Immutable preview backing file is missing or corrupt: {path}")
            return dict(existing)

        destination = destination.resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            if destination.read_bytes() != payload:
                raise ValueError(f"Immutable preview hash collision at {destination}")
        else:
            temporary = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.tmp")
            temporary.write_bytes(payload)
            os.replace(temporary, destination)
        now = utc_now_iso()
        preview_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO asset_preview_versions (
                id, asset_id, kind, status, content_type, file_path, sha256, size_bytes,
                generator_name, generator_version, pipeline_version, generator_fingerprint,
                generation_error, created_at
            ) VALUES (%s, %s, %s, 'ready', 'image/svg+xml', %s, %s, %s, %s, %s, %s, %s, '', %s)
            """,
            (
                preview_id,
                str(asset["id"]),
                kind,
                str(destination),
                sha256,
                len(payload),
                generator_identity["generator_name"],
                generator_identity["generator_version"],
                generator_identity["pipeline_version"],
                generator_identity["generator_fingerprint"],
                now,
            ),
        )
        row = conn.execute("SELECT * FROM asset_preview_versions WHERE id = %s", (preview_id,)).fetchone()
        return dict(row)

    @staticmethod
    def has_ready_preview(
        conn: Any,
        asset_id: str,
        kind: str,
        generator_fingerprint: str,
    ) -> bool:
        row = conn.execute(
            """
            SELECT file_path, sha256
            FROM asset_preview_versions
            WHERE asset_id = %s AND kind = %s AND status = %s AND generator_fingerprint = %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (asset_id, kind, "ready", generator_fingerprint),
        ).fetchone()
        if not row:
            return False
        file_path = str(row["file_path"] or "")
        return bool(
            file_path
            and Path(file_path).is_file()
            and sha256_file(Path(file_path)) == str(row["sha256"])
        )


__all__ = ["CatalogPreviewStore"]
