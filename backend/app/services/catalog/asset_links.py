"""Attach registered assets to component revisions."""

from __future__ import annotations

from typing import Any
import uuid

from app.services.catalog.asset_types import (
    PLACE_REQUIRED_ASSET_TYPES,
    preview_kind_for_asset_type,
)
from app.services.catalog.normalization import utc_now_iso
from app.services.catalog.preview_pipeline import CatalogPreviewPipeline
from app.services.catalog.revision_finalization import CatalogRevisionFinalizer
from app.services.catalog.revision_kernel import CatalogRevisionKernel
from app.services.catalog.runtime import CatalogRuntime


class CatalogAssetLinks:
    """Revision-asset linking and the representation bookkeeping it implies."""

    def __init__(
        self,
        revision_kernel: CatalogRevisionKernel,
        preview_pipeline: CatalogPreviewPipeline,
        finalizer: CatalogRevisionFinalizer,
    ) -> None:
        self._revision_kernel = revision_kernel
        self._preview_pipeline = preview_pipeline
        self._finalizer = finalizer

    @staticmethod
    def link_asset_to_revision(
        conn: Any,
        revision_id: str,
        asset: dict[str, Any],
        *,
        required: bool,
        counterpart_asset_id: str = "",
    ) -> None:
        now = utc_now_iso()
        asset_type = str(asset["asset_type"])
        asset_id = str(asset["id"])
        conn.execute(
            """
            INSERT INTO revision_assets (revision_id, asset_type, asset_id, required, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (revision_id, asset_id)
            DO UPDATE SET required = excluded.required, updated_at = excluded.updated_at
            """,
            (revision_id, asset["asset_type"], asset["id"], 1 if required else 0, now, now),
        )
        if asset_type not in PLACE_REQUIRED_ASSET_TYPES:
            return
        kind = preview_kind_for_asset_type(asset_type)
        preview_rows = conn.execute(
            """
            SELECT id, kind FROM asset_preview_versions
            WHERE asset_id = %s AND (kind = %s OR kind LIKE %s) AND status = 'ready'
            ORDER BY created_at DESC, id DESC
            """,
            (asset_id, kind, f"{kind}:unit%"),
        ).fetchall()
        latest_by_kind: dict[str, dict[str, Any]] = {}
        for preview in preview_rows:
            latest_by_kind.setdefault(str(preview["kind"]), dict(preview))
        for preview_kind, preview in latest_by_kind.items():
            conn.execute(
                """
                INSERT INTO revision_preview_outputs (revision_id, asset_id, kind, preview_id, generated_at)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (revision_id, asset_id, kind)
                DO UPDATE SET preview_id = excluded.preview_id, generated_at = excluded.generated_at
                """,
                (revision_id, asset_id, preview_kind, str(preview["id"]), now),
            )
        default_representation = conn.execute(
            "SELECT id, symbol_asset_id, footprint_asset_id FROM revision_representations "
            "WHERE revision_id = %s AND is_default = 1 LIMIT 1",
            (revision_id,),
        ).fetchone()
        if counterpart_asset_id:
            expected_type = "footprint" if asset_type == "symbol" else "symbol"
            counterpart = conn.execute(
                """
                SELECT linked.id
                FROM revision_assets link
                JOIN assets linked ON linked.id = link.asset_id
                WHERE link.revision_id = %s AND linked.id = %s
                  AND link.asset_type = %s AND linked.asset_type = %s
                """,
                (revision_id, counterpart_asset_id, expected_type, expected_type),
            ).fetchone()
            if not counterpart:
                raise ValueError("Selected counterpart asset is not attached to this revision")
        if default_representation:
            missing_symbol = not default_representation["symbol_asset_id"]
            missing_footprint = not default_representation["footprint_asset_id"]
            fills_default = (asset_type == "symbol" and missing_symbol) or (
                asset_type == "footprint" and missing_footprint
            )
            default_counterpart_id = (
                str(default_representation["footprint_asset_id"] or "")
                if asset_type == "symbol"
                else str(default_representation["symbol_asset_id"] or "")
            )
            if fills_default and (
                not counterpart_asset_id or counterpart_asset_id == default_counterpart_id
            ):
                column = "symbol_asset_id" if asset_type == "symbol" else "footprint_asset_id"
                conn.execute(
                    f"UPDATE revision_representations SET {column} = %s, updated_at = %s WHERE id = %s",
                    (asset_id, now, str(default_representation["id"])),
                )
                return
        symbol_id = (
            asset_id
            if asset_type == "symbol"
            else counterpart_asset_id or str(default_representation["symbol_asset_id"] or "")
            if default_representation
            else counterpart_asset_id
        )
        footprint_id = (
            asset_id
            if asset_type == "footprint"
            else counterpart_asset_id or str(default_representation["footprint_asset_id"] or "")
            if default_representation
            else counterpart_asset_id
        )
        duplicate = conn.execute(
            """
            SELECT 1 FROM revision_representations
            WHERE revision_id = %s
              AND symbol_asset_id IS NOT DISTINCT FROM %s
              AND footprint_asset_id IS NOT DISTINCT FROM %s
            """,
            (revision_id, symbol_id or None, footprint_id or None),
        ).fetchone()
        if duplicate:
            return
        count = int(
            conn.execute(
                "SELECT COUNT(*) AS total FROM revision_representations WHERE revision_id = %s",
                (revision_id,),
            ).fetchone()["total"]
        )
        conn.execute(
            """
            INSERT INTO revision_representations (
                id, revision_id, label, symbol_asset_id, footprint_asset_id, is_default,
                display_order, source_internal_part_number, provenance_json, created_at, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, '', '{}', %s, %s)
            """,
            (
                str(uuid.uuid4()),
                revision_id,
                str(asset.get("target_name") or asset.get("name") or "Representation"),
                symbol_id or None,
                footprint_id or None,
                1 if count == 0 else 0,
                count,
                now,
                now,
            ),
        )

    def attach_asset_revision(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        *,
        component_id: str,
        asset: dict[str, Any],
        required: bool,
        actor: str,
        change_summary: str,
        counterpart_asset_id: str = "",
        expected_revision_id: str = "",
    ) -> dict[str, Any]:
        """Attach ``asset`` to the component's current draft, cloning when needed.

        Re-attaching an identical link only refreshes preview outputs when a newer
        ready preview exists, so an unchanged revision keeps its manifest hash.
        """
        _, current = self._revision_kernel.active_revision_row(conn, component_id, released=False)
        if not current:
            raise ValueError("Component not found")
        current_id = str(current["id"])
        self._revision_kernel.assert_expected_revision(current_id, expected_revision_id)
        asset_type = str(asset["asset_type"])
        asset_id = str(asset["id"])
        existing = conn.execute(
            "SELECT asset_id, required FROM revision_assets WHERE revision_id = %s AND asset_type = %s AND asset_id = %s",
            (current["id"], asset["asset_type"], asset["id"]),
        ).fetchone()
        preview_changed = False
        if asset_type in PLACE_REQUIRED_ASSET_TYPES:
            kind = preview_kind_for_asset_type(asset_type)
            current_previews = conn.execute(
                "SELECT kind, preview_id FROM revision_preview_outputs WHERE revision_id = %s AND asset_id = %s AND (kind = %s OR kind LIKE %s)",
                (current_id, asset_id, kind, f"{kind}:unit%"),
            ).fetchall()
            latest_preview_rows = conn.execute(
                """
                SELECT id, kind FROM asset_preview_versions
                WHERE asset_id = %s AND (kind = %s OR kind LIKE %s) AND status = 'ready'
                ORDER BY kind, created_at DESC, id DESC
                """,
                (asset_id, kind, f"{kind}:unit%"),
            ).fetchall()
            current_by_kind = {str(row["kind"]): str(row["preview_id"]) for row in current_previews}
            latest_by_kind: dict[str, str] = {}
            for row in latest_preview_rows:
                latest_by_kind.setdefault(str(row["kind"]), str(row["id"]))
            preview_changed = bool(latest_by_kind and latest_by_kind != current_by_kind)
        if existing and bool(existing["required"]) == required and not counterpart_asset_id:
            if preview_changed:
                self._preview_pipeline.refresh_revision_preview_outputs(conn, runtime, current_id)
            return current
        revision = self._revision_kernel.clone_revision(
            conn,
            component_id,
            actor=actor,
            change_kind="asset",
            change_summary=change_summary,
            expected_revision_id=expected_revision_id,
        )
        self.link_asset_to_revision(
            conn,
            revision["id"],
            asset,
            required=required,
            counterpart_asset_id=counterpart_asset_id,
        )
        self._finalizer.finalize_revision(
            conn,
            runtime,
            component_id=component_id,
            revision_id=str(revision["id"]),
            event_type="revision.created",
            actor=actor,
            details={
                "change_kind": "asset",
                "change_summary": change_summary,
                "asset_type": asset_type,
                "asset_sha256": str(asset["sha256"]),
            },
        )
        return revision


__all__ = ["CatalogAssetLinks"]
