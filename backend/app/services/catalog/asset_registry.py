"""Connection-level catalog asset lookup and registration operations."""

from __future__ import annotations

from pathlib import Path
import uuid
from typing import Any

from app.services.catalog.asset_files import content_type_for_asset
from app.services.catalog.normalization import sha256_bytes, sha256_file, utc_now_iso
from app.services.catalog.runtime import CatalogRuntime


class CatalogAssetRegistry:
    """Stateless catalog asset persistence using supplied runtime and connections."""

    @staticmethod
    def asset_by_key(
        conn: Any,
        asset_type: str,
        canonical_path: str,
        target_name: str,
    ) -> dict[str, Any] | None:
        row = conn.execute(
            "SELECT * FROM assets WHERE asset_type = %s AND canonical_path = %s AND target_name = %s",
            (asset_type, canonical_path, target_name),
        ).fetchone()
        return dict(row) if row else None

    @staticmethod
    def asset_by_signature(
        conn: Any,
        asset_type: str,
        sha256: str,
        target_library: str,
        target_name: str,
    ) -> dict[str, Any] | None:
        row = conn.execute(
            """
            SELECT * FROM assets
            WHERE asset_type = %s AND sha256 = %s AND target_library = %s AND target_name = %s
            LIMIT 1
            """,
            (asset_type, sha256, target_library, target_name),
        ).fetchone()
        return dict(row) if row else None

    @staticmethod
    def register_asset(
        runtime: CatalogRuntime,
        conn: Any,
        *,
        asset_type: str,
        canonical_path: Path,
        target_library: str,
        target_name: str,
        source_group: str = "",
    ) -> dict[str, Any]:
        canonical_path = canonical_path.resolve()
        payload = canonical_path.read_bytes()
        sha256 = sha256_bytes(payload)
        existing = CatalogAssetRegistry.asset_by_key(
            conn, asset_type, str(canonical_path), target_name
        )
        if existing:
            if str(existing.get("sha256") or "") == sha256:
                return existing
            # A path already referenced by an immutable asset was edited in place.
            # Preserve its historical database identity and ingest the observed bytes
            # at a content-addressed path for the new revision.
            try:
                relative = canonical_path.relative_to(runtime.store_root)
            except ValueError:
                relative = Path(canonical_path.name)
            immutable_path = runtime.store_root / "revisions" / sha256 / relative
            immutable_path.parent.mkdir(parents=True, exist_ok=True)
            if immutable_path.exists():
                if immutable_path.read_bytes() != payload:
                    raise ValueError(f"Immutable asset hash collision at {immutable_path}")
            else:
                immutable_path.write_bytes(payload)
            canonical_path = immutable_path.resolve()
            existing = CatalogAssetRegistry.asset_by_key(
                conn, asset_type, str(canonical_path), target_name
            )
            if existing:
                if str(existing.get("sha256") or "") != sha256:
                    raise ValueError("Immutable asset identity does not match its content hash")
                return existing
        same_content = CatalogAssetRegistry.asset_by_signature(
            conn, asset_type, sha256, target_library, target_name
        )
        if same_content:
            existing_path = Path(str(same_content["canonical_path"]))
            if not existing_path.is_file() or sha256_file(existing_path) != sha256:
                # Re-uploading identical content repairs a missing/corrupt backing file
                # without changing immutable asset identity or revision manifests.
                conn.execute(
                    """
                    UPDATE assets
                    SET name = %s, canonical_path = %s, size_bytes = %s, content_type = %s, updated_at = %s
                    WHERE id = %s
                    """,
                    (
                        canonical_path.name,
                        str(canonical_path),
                        canonical_path.stat().st_size,
                        content_type_for_asset(asset_type, canonical_path),
                        utc_now_iso(),
                        same_content["id"],
                    ),
                )
                same_content = dict(same_content)
                same_content.update(
                    {
                        "name": canonical_path.name,
                        "canonical_path": str(canonical_path),
                        "size_bytes": canonical_path.stat().st_size,
                        "content_type": content_type_for_asset(asset_type, canonical_path),
                    }
                )
            return same_content
        now = utc_now_iso()
        asset_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO assets (
                id, asset_type, name, canonical_path, target_library, target_name, source_group,
                sha256, size_bytes, content_type, created_at, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                asset_id,
                asset_type,
                canonical_path.name,
                str(canonical_path),
                target_library,
                target_name,
                source_group,
                sha256,
                canonical_path.stat().st_size,
                content_type_for_asset(asset_type, canonical_path),
                now,
                now,
            ),
        )
        row = conn.execute("SELECT * FROM assets WHERE id = %s", (asset_id,)).fetchone()
        return dict(row)


__all__ = ["CatalogAssetRegistry"]
