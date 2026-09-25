"""Preview generation orchestration for catalog revisions.

The pipeline renders symbol/footprint SVGs through ``kicad-cli``, persists them
as immutable preview versions, and keeps ``revision_preview_outputs`` pointed at
the newest ready preview for every placement asset on a revision.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import logging
from pathlib import Path
from typing import Any, Callable

from app.services.catalog.asset_types import (
    PLACE_REQUIRED_ASSET_TYPES,
    PREVIEW_KIND_FOOTPRINT,
    PREVIEW_KIND_SYMBOL,
    preview_kind_for_asset_type,
)
from app.services.catalog.component_read_models import CatalogComponentReadModels
from app.services.catalog.kicad_cli import KicadCliRunner
from app.services.catalog.locking import CatalogLockOperations
from app.services.catalog.normalization import (
    canonical_json,
    preview_base_kind,
    preview_kind,
    sha256_bytes,
    utc_now_iso,
)
from app.services.catalog.preview_renderer import (
    PREVIEW_STATUS_FAILED,
    PREVIEW_STATUS_READY,
    CatalogPreviewRenderer,
)
from app.services.catalog.preview_store import CatalogPreviewStore
from app.services.catalog.revision_kernel import CatalogRevisionKernel
from app.services.catalog.runtime import CatalogRuntime


logger = logging.getLogger(__name__)

PREVIEW_PIPELINE_VERSION = "prism-preview-a2-multi-unit"
PREVIEW_GENERATOR_NAME = "kicad-cli"


@dataclass
class CatalogPreview:
    preview_id: str
    component_id: str
    kind: str
    status: str
    content_type: str
    file_path: str
    generation_error: str

    @property
    def id(self) -> str:
        return self.preview_id


class CatalogPreviewPipeline:
    """Render, persist, and attach previews using explicitly supplied state.

    Every operation receives its connection and runtime.  Only
    ``generate_missing_component_previews`` commits, and it does so once per
    component so a long maintenance sweep checkpoints durable progress.
    """

    def __init__(
        self,
        catalog_locks: CatalogLockOperations,
        revision_kernel: CatalogRevisionKernel,
        read_models: CatalogComponentReadModels,
        renderer: CatalogPreviewRenderer | None = None,
        store: CatalogPreviewStore | None = None,
    ) -> None:
        self._catalog_locks = catalog_locks
        self._revision_kernel = revision_kernel
        self._read_models = read_models
        self._renderer = renderer or CatalogPreviewRenderer()
        self._store = store or CatalogPreviewStore()

    # -- paths and identity -------------------------------------------------

    @staticmethod
    def preview_output_path(runtime: CatalogRuntime, asset_id: str, kind: str) -> Path:
        bucket = "symbols" if kind == PREVIEW_KIND_SYMBOL else "footprints"
        return runtime.store_root / "previews" / bucket / f"{asset_id}.svg"

    @staticmethod
    def preview_version_path(runtime: CatalogRuntime, asset_id: str, kind: str, sha256: str) -> Path:
        bucket = "symbols" if preview_base_kind(kind) == PREVIEW_KIND_SYMBOL else "footprints"
        return runtime.store_root / "previews" / "versions" / bucket / asset_id / f"{sha256}.svg"

    @staticmethod
    def generator_identity(runtime: CatalogRuntime, kind: str) -> dict[str, str]:
        version = KicadCliRunner.version(runtime)
        canonical = canonical_json(
            {
                "generator_name": PREVIEW_GENERATOR_NAME,
                "generator_version": version,
                "pipeline_version": PREVIEW_PIPELINE_VERSION,
                "kind": kind,
            }
        )
        return {
            "generator_name": PREVIEW_GENERATOR_NAME,
            "generator_version": version,
            "pipeline_version": PREVIEW_PIPELINE_VERSION,
            "generator_fingerprint": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
        }

    # -- rendering ----------------------------------------------------------

    def render_symbol_units(
        self,
        runtime: CatalogRuntime,
        asset: dict[str, Any],
    ) -> tuple[str, list[tuple[int, bytes]] | str]:
        return self._renderer.generate_symbol_preview_units(
            asset, lambda args: KicadCliRunner.run(runtime, args)
        )

    def render_footprint(
        self,
        runtime: CatalogRuntime,
        asset: dict[str, Any],
    ) -> tuple[str, bytes | str]:
        return self._renderer.generate_footprint_preview(
            asset, lambda args: KicadCliRunner.run(runtime, args)
        )

    # -- persistence --------------------------------------------------------

    def store_preview_version(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        *,
        asset: dict[str, Any],
        kind: str,
        payload: bytes,
    ) -> dict[str, Any]:
        identity = self.generator_identity(runtime, kind)
        sha256 = sha256_bytes(payload)
        destination = self.preview_version_path(runtime, str(asset["id"]), kind, sha256).resolve()
        return self._store.store_preview_version(
            conn,
            asset=asset,
            kind=kind,
            payload=payload,
            generator_identity=identity,
            destination=destination,
        )

    def has_ready_preview(self, conn: Any, runtime: CatalogRuntime, asset_id: str, kind: str) -> bool:
        fingerprint = self.generator_identity(runtime, kind)["generator_fingerprint"]
        return self._store.has_ready_preview(conn, asset_id, kind, fingerprint)

    def ensure_asset_previews(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        asset: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """Render and persist every preview for one placement asset.

        Failures are reported as rows with ``status`` ``failed`` rather than
        raised so a revision refresh can continue with its other assets.
        """
        asset_type = str(asset["asset_type"])
        if asset_type == "symbol":
            status, result = self.render_symbol_units(runtime, asset)
            if status != PREVIEW_STATUS_READY or not isinstance(result, list):
                return [_failed_preview(asset, PREVIEW_KIND_SYMBOL, result)]
            return [
                self.store_preview_version(
                    conn,
                    runtime,
                    asset=asset,
                    kind=preview_kind(PREVIEW_KIND_SYMBOL, unit),
                    payload=payload,
                )
                for unit, payload in result
            ]
        if asset_type == "footprint":
            status, result = self.render_footprint(runtime, asset)
            if status != PREVIEW_STATUS_READY or not isinstance(result, bytes):
                return [_failed_preview(asset, PREVIEW_KIND_FOOTPRINT, result)]
            return [
                self.store_preview_version(
                    conn, runtime, asset=asset, kind=PREVIEW_KIND_FOOTPRINT, payload=result
                )
            ]
        return []

    # -- revision outputs ---------------------------------------------------

    def refresh_revision_preview_outputs(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        revision_id: str,
        *,
        only_missing: bool = False,
    ) -> dict[str, Any]:
        assets = [
            asset
            for asset in self._revision_kernel.load_assets_for_revision(conn, revision_id)
            if str(asset["asset_type"]) in PLACE_REQUIRED_ASSET_TYPES
        ]
        changed_assets: set[str] = set()
        failures: list[dict[str, str]] = []
        skipped = 0
        existing_by_asset: dict[str, list[dict[str, Any]]] = {}
        for preview in self._read_models.load_previews_for_revision(conn, revision_id):
            existing_by_asset.setdefault(str(preview["asset_id"]), []).append(preview)
        for asset in assets:
            asset_id = str(asset["id"])
            kind = preview_kind_for_asset_type(asset["asset_type"])
            existing_rows = [
                preview
                for preview in existing_by_asset.get(asset_id, [])
                if str(preview["kind"]) == kind or str(preview["kind"]).startswith(f"{kind}:unit")
            ]
            existing_by_kind = {str(row["kind"]): row for row in existing_rows}
            if only_missing and existing_by_kind and all(
                self.has_ready_preview(conn, runtime, asset_id, existing_kind)
                for existing_kind in existing_by_kind
            ):
                skipped += 1
                continue
            try:
                previews = self.ensure_asset_previews(conn, runtime, asset)
            except Exception as exc:  # noqa: BLE001 - one asset must not abort the revision refresh
                logger.warning("preview regeneration failed for asset %s: %s", asset_id, exc)
                failures.append({"asset_id": asset_id, "kind": kind, "error": str(exc)})
                continue
            ready_previews = [p for p in previews if str(p.get("status")) == PREVIEW_STATUS_READY]
            for preview in previews:
                if str(preview.get("status")) != PREVIEW_STATUS_READY:
                    failures.append(
                        {
                            "asset_id": asset_id,
                            "kind": str(preview.get("kind") or kind),
                            "error": str(preview.get("generation_error") or "Preview generation failed"),
                        }
                    )
            generated_kinds = {str(preview["kind"]) for preview in ready_previews}
            preview_set_changed = bool(ready_previews) and (
                generated_kinds != set(existing_by_kind)
                or any(
                    str(existing_by_kind.get(str(preview["kind"]), {}).get("id") or "") != str(preview["id"])
                    for preview in ready_previews
                )
            )
            if not preview_set_changed:
                skipped += 1
                continue
            changed_assets.add(asset_id)
            replace_revision_preview_outputs(conn, revision_id, asset_id, kind, ready_previews)
        return {
            "revision_id": revision_id,
            "changed": len(changed_assets),
            "skipped": skipped,
            "failures": failures,
        }

    def regenerate_component_previews(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        component_id: str,
        *,
        only_missing: bool = False,
    ) -> dict[str, Any]:
        self._catalog_locks.lock_component_for_mutation(conn, component_id)
        component = self._revision_kernel.component_row(conn, component_id)
        if not component:
            raise ValueError("Component not found")
        revision_id = str(component["current_revision_id"])
        if not self._revision_kernel.revision_row(conn, revision_id):
            raise ValueError("Component revision not found")
        if not any(
            str(asset["asset_type"]) in PLACE_REQUIRED_ASSET_TYPES
            for asset in self._revision_kernel.load_assets_for_revision(conn, revision_id)
        ):
            raise ValueError("No symbol or footprint assets are attached")
        return self.refresh_revision_preview_outputs(conn, runtime, revision_id, only_missing=only_missing)

    def generate_missing_component_previews(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        """Sweep active components and commit each one's preview refresh separately."""
        counts: dict[str, Any] = {
            "scanned_assets": 0,
            "generated": 0,
            "skipped_ready": 0,
            "failed": 0,
            "errors": [],
        }
        component_rows = conn.execute(
            """
            SELECT c.id, COUNT(a.id) AS asset_count
            FROM components c
            JOIN component_revisions cr ON cr.id = c.current_revision_id
            JOIN revision_assets ra ON ra.revision_id = cr.id
            JOIN assets a ON a.id = ra.asset_id
            WHERE c.is_active = 1 AND a.asset_type IN ('symbol', 'footprint')
            GROUP BY c.id, c.updated_at
            ORDER BY c.updated_at DESC, c.id
            """
        ).fetchall()
        counts["total_assets"] = sum(int(row["asset_count"]) for row in component_rows)
        if progress_callback:
            progress_callback(counts.copy())
        for row in component_rows:
            component_id = str(row["id"])
            asset_count = int(row["asset_count"])
            counts["scanned_assets"] += asset_count
            try:
                result = self.regenerate_component_previews(
                    conn, runtime, component_id, only_missing=True
                )
                counts["generated"] += int(result["changed"])
                counts["skipped_ready"] += int(result["skipped"])
                counts["failed"] += len(result["failures"])
                counts["errors"].extend(
                    {"component_id": component_id, **failure} for failure in result["failures"]
                )
                conn.commit()
            except Exception as exc:  # noqa: BLE001 - record and continue the sweep
                conn.rollback()
                counts["failed"] += asset_count
                counts["errors"].append({"component_id": component_id, "error": str(exc)})
            if progress_callback:
                progress_callback(counts.copy())
        return counts

    # -- reads ----------------------------------------------------------------

    @staticmethod
    def preview_path(conn: Any, runtime: CatalogRuntime, preview_id: str) -> tuple[Path, str] | None:
        """Resolve a ready preview to its confined file path and content type."""
        row = conn.execute(
            "SELECT file_path, content_type FROM asset_preview_versions WHERE id = %s AND status = %s",
            (preview_id, PREVIEW_STATUS_READY),
        ).fetchone()
        if not row:
            row = conn.execute(
                "SELECT file_path, content_type FROM asset_previews WHERE id = %s AND status = %s",
                (preview_id, PREVIEW_STATUS_READY),
            ).fetchone()
        if not row:
            return None
        path = Path(str(row["file_path"] or "")).resolve()
        try:
            path.relative_to((runtime.store_root / "previews").resolve())
        except ValueError:
            return None
        return (path, str(row["content_type"] or "image/svg+xml")) if path.is_file() else None

    @staticmethod
    def preview_record(conn: Any, preview_id: str) -> CatalogPreview | None:
        row = conn.execute("SELECT * FROM asset_preview_versions WHERE id = %s", (preview_id,)).fetchone()
        if not row:
            row = conn.execute("SELECT * FROM asset_previews WHERE id = %s", (preview_id,)).fetchone()
        if not row:
            return None
        component_row = conn.execute(
            """
            SELECT c.id AS component_id
            FROM revision_preview_outputs rpo
            JOIN components c ON c.current_revision_id = rpo.revision_id
            WHERE rpo.preview_id = %s
            LIMIT 1
            """,
            (preview_id,),
        ).fetchone()
        if not component_row:
            component_row = conn.execute(
                """
                SELECT c.id AS component_id
                FROM revision_assets ra
                JOIN components c ON c.current_revision_id = ra.revision_id
                WHERE ra.asset_id = %s
                LIMIT 1
                """,
                (str(row["asset_id"]),),
            ).fetchone()
        return CatalogPreview(
            preview_id=str(row["id"]),
            component_id=str(component_row["component_id"]) if component_row else "",
            kind=str(row["kind"]),
            status=str(row["status"]),
            content_type=str(row["content_type"]),
            file_path=str(row["file_path"]),
            generation_error=str(row["generation_error"]),
        )


def replace_revision_preview_outputs(
    conn: Any,
    revision_id: str,
    asset_id: str,
    kind: str,
    ready_previews: list[dict[str, Any]],
) -> None:
    """Point a revision's outputs for one asset kind at the given ready previews."""
    conn.execute(
        "DELETE FROM revision_preview_outputs WHERE revision_id = %s AND asset_id = %s AND (kind = %s OR kind LIKE %s)",
        (revision_id, asset_id, kind, f"{kind}:unit%"),
    )
    now = utc_now_iso()
    for preview in ready_previews:
        conn.execute(
            """
            INSERT INTO revision_preview_outputs (revision_id, asset_id, kind, preview_id, generated_at)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (revision_id, asset_id, kind)
            DO UPDATE SET preview_id = excluded.preview_id, generated_at = excluded.generated_at
            """,
            (revision_id, asset_id, str(preview["kind"]), str(preview["id"]), now),
        )


def _failed_preview(asset: dict[str, Any], kind: str, error: object) -> dict[str, Any]:
    return {
        "asset_id": str(asset["id"]),
        "kind": kind,
        "status": PREVIEW_STATUS_FAILED,
        "generation_error": str(error),
    }


__all__ = [
    "CatalogPreview",
    "CatalogPreviewPipeline",
    "PREVIEW_GENERATOR_NAME",
    "PREVIEW_PIPELINE_VERSION",
    "replace_revision_preview_outputs",
]
