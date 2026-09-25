"""Legacy metadata CSV import: create or update components by MPN and link assets.

Rows are matched on the exact MPN of the current revision. Each row yields one
finalized revision whether the component was created or updated. Nothing here
commits.
"""

from __future__ import annotations

from typing import Any
import uuid

from app.services.catalog.asset_imports import CatalogAssetImports
from app.services.catalog.asset_links import CatalogAssetLinks
from app.services.catalog.asset_types import PLACE_REQUIRED_ASSET_TYPES
from app.services.catalog.component_writer import CatalogComponentWriter
from app.services.catalog.metadata_csv import ParsedMetadataCsvImport
from app.services.catalog.metadata_normalization import normalize_metadata
from app.services.catalog.normalization import utc_now_iso
from app.services.catalog.revision_finalization import CatalogRevisionFinalizer
from app.services.catalog.runtime import CatalogRuntime


CSV_IMPORT_ACTOR = "csv-import"


class CatalogMetadataCsvImporter:
    """Apply parsed CSV rows as component revisions with linked assets."""

    def __init__(
        self,
        component_writer: CatalogComponentWriter,
        asset_imports: CatalogAssetImports,
        asset_links: CatalogAssetLinks,
        finalizer: CatalogRevisionFinalizer,
    ) -> None:
        self._component_writer = component_writer
        self._asset_imports = asset_imports
        self._asset_links = asset_links
        self._finalizer = finalizer

    def import_rows(self, conn: Any, runtime: CatalogRuntime, parsed: ParsedMetadataCsvImport) -> dict[str, Any]:
        created = 0
        updated = 0
        now = utc_now_iso()
        for prepared_row in parsed.rows:
            row = prepared_row.row
            existing = conn.execute(
                """
                SELECT c.id
                FROM components c
                JOIN component_revisions cr ON cr.id = c.current_revision_id
                WHERE cr.mpn = %s
                LIMIT 1
                """,
                (row["manufacturer_part_number"],),
            ).fetchone()
            normalized = normalize_metadata(prepared_row.payload)
            component_id, revision_id = self._component_writer.upsert_metadata_row(
                conn,
                runtime,
                component_id=str(existing["id"]) if existing else str(uuid.uuid4()),
                metadata=normalized,
                now=now,
                existing_component_id=str(existing["id"]) if existing else None,
                actor=CSV_IMPORT_ACTOR,
                finalize_revision=False,
            )
            if existing:
                updated += 1
            else:
                created += 1

            for asset_type, file_path, target_library, target_name in prepared_row.asset_links:
                asset = self._asset_imports.resolve_existing_asset(
                    conn,
                    runtime,
                    asset_type=asset_type,
                    file_path=file_path,
                    target_library=target_library,
                    target_name=target_name,
                )
                self._asset_links.link_asset_to_revision(
                    conn, revision_id, asset, required=asset_type in PLACE_REQUIRED_ASSET_TYPES
                )
            self._finalizer.finalize_revision(
                conn,
                runtime,
                component_id=component_id,
                revision_id=revision_id,
                event_type="revision.created" if existing else "component.created",
                actor=CSV_IMPORT_ACTOR,
                details={
                    "change_kind": "csv_import",
                    "change_summary": "Import component metadata and assets from CSV",
                },
            )
        return {"created": created, "updated": updated, "errors": []}


__all__ = ["CSV_IMPORT_ACTOR", "CatalogMetadataCsvImporter"]
