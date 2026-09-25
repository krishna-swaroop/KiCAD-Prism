"""Accept a project-import proposal into the catalog.

Acceptance claims the proposal, matches or creates the component under the
identity lock, copies staged files into canonical storage, links reused
assets by reference, finalizes the revision, and records where-used
observations. Everything runs on the caller's connection; nothing here commits.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any
import uuid

from app.services.catalog.asset_files import CatalogAssetFiles
from app.services.catalog.asset_links import CatalogAssetLinks
from app.services.catalog.asset_registry import CatalogAssetRegistry
from app.services.catalog.asset_types import PLACE_REQUIRED_ASSET_TYPES
from app.services.catalog.component_writer import SOURCE_EXTERNAL, CatalogComponentWriter
from app.services.catalog.locking import CatalogLockOperations
from app.services.catalog.metadata_normalization import normalize_metadata
from app.services.catalog.normalization import sha256_file, utc_now_iso
from app.services.catalog.project_import_assets import CatalogProjectImportAssets
from app.services.catalog.project_import_matching import CatalogProjectImportMatching
from app.services.catalog.revision_finalization import CatalogRevisionFinalizer
from app.services.catalog.revision_kernel import CatalogRevisionKernel
from app.services.catalog.runtime import CatalogRuntime


_COPIED_ASSET_TYPES = frozenset({"symbol", "footprint", "3dmodel", "spice"})
PROJECT_IMPORT_SYMBOL_LABEL_TO_KEY: dict[str, str] = {
    "Vendor": "vendor",
    "Vendor Part Number": "vendor_part_number",
    "Mass (g)": "mass_g",
    "RQjC (C/W)": "rqjc_c_w",
    "RQjC_top (C/W)": "rqjc_top_c_w",
    "Temp_max (C)": "temp_max_c",
    "Temp_min (C)": "temp_min_c",
    "Power Dissipation (W)": "power_dissipation_w",
    "Rate": "rate",
}


class CatalogProjectImportAcceptance:
    """Prepare import payloads, mutate proposal state, and accept proposals."""

    def __init__(
        self,
        catalog_locks: CatalogLockOperations,
        revision_kernel: CatalogRevisionKernel,
        import_assets: CatalogProjectImportAssets,
        import_matching: CatalogProjectImportMatching,
        asset_files: CatalogAssetFiles,
        asset_registry: CatalogAssetRegistry,
        asset_links: CatalogAssetLinks,
        finalizer: CatalogRevisionFinalizer,
        component_writer: CatalogComponentWriter,
    ) -> None:
        self._catalog_locks = catalog_locks
        self._revision_kernel = revision_kernel
        self._import_assets = import_assets
        self._import_matching = import_matching
        self._asset_files = asset_files
        self._asset_registry = asset_registry
        self._asset_links = asset_links
        self._finalizer = finalizer
        self._component_writer = component_writer

    # -- pure preparation ---------------------------------------------------

    @staticmethod
    def build_normalized_input(
        proposal: dict[str, Any],
        metadata_overrides: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        source_metadata = dict(proposal["metadata"])
        fields = dict(source_metadata.get("fields") or {})
        return {
            "value": source_metadata.get("value"),
            "description": source_metadata.get("description"),
            "datasheet": source_metadata.get("datasheet"),
            "manufacturer": source_metadata.get("manufacturer"),
            "manufacturer_part_number": source_metadata.get("manufacturer_part_number"),
            "package_name": source_metadata.get("footprint"),
            **{
                key: fields.get(label, "")
                for label, key in PROJECT_IMPORT_SYMBOL_LABEL_TO_KEY.items()
            },
            "extra_fields": fields,
            **(metadata_overrides or {}),
        }

    @staticmethod
    def build_import_payload(proposal: dict[str, Any]) -> dict[str, Any]:
        provenance = list(proposal["provenance"])
        provenance_source = str(provenance[0].get("source") or "project") if provenance else "project"
        import_source = "folder_snapshot" if provenance_source == "folder_snapshot" else "project"
        external_id = (
            str(provenance[0].get("snapshotId") or provenance[0].get("projectId") or "") if provenance else ""
        )
        return {
            "provenance": provenance,
            "import_source": import_source,
            "external_id": external_id,
        }

    # -- proposal state -----------------------------------------------------

    @staticmethod
    def claim_proposal(conn: Any, proposal_id: str, *, now: str) -> None:
        claimed = conn.execute(
            """
            UPDATE project_component_import_proposals
            SET status = 'accepting', updated_at = %s
            WHERE id = %s AND status = 'candidate'
            """,
            (now, proposal_id),
        )
        if claimed.rowcount == 0:
            raise ValueError("Project import proposal has already been resolved")

    @staticmethod
    def find_existing_component(conn: Any, manufacturer: str, mpn: str) -> Any | None:
        return conn.execute(
            """
            SELECT c.id
            FROM components c
            JOIN component_revisions revision ON revision.id = c.current_revision_id
            WHERE c.is_active = 1 AND lower(revision.manufacturer) = lower(%s) AND lower(revision.mpn) = lower(%s)
            ORDER BY c.created_at
            LIMIT 1
            """,
            (manufacturer, mpn),
        ).fetchone()

    @staticmethod
    def mark_proposal_accepted(
        conn: Any,
        proposal_id: str,
        component_id: str,
        *,
        now: str,
    ) -> None:
        conn.execute(
            """
            UPDATE project_component_import_proposals
            SET status = 'accepted', accepted_component_id = %s, updated_at = %s
            WHERE id = %s AND status = 'accepting'
            """,
            (component_id, now, proposal_id),
        )

    # -- acceptance ---------------------------------------------------------

    def accept(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        proposal: dict[str, Any],
        *,
        metadata_overrides: dict[str, Any] | None = None,
        asset_selections: dict[str, list[str]] | None = None,
        asset_links: dict[str, str] | None = None,
        actor: str = "",
        change_summary: str = "Import component from project",
    ) -> str:
        """Accept ``proposal`` and return the component id it resolved to.

        Validation (asset selection, reused-asset lookup, staged path
        containment) happens before the proposal is claimed, so a rejected
        request leaves the proposal a candidate.
        """
        if proposal["status"] != "candidate":
            raise ValueError("Project import proposal has already been resolved")
        proposal_id = str(proposal["id"])
        metadata = normalize_metadata(self.build_normalized_input(proposal, metadata_overrides))
        candidates_by_type = self._import_assets.group_import_assets(proposal)
        # An asset type may instead be satisfied by an existing catalog asset. That is
        # a reference, not a copy: the same assets row is linked into this revision, so
        # one shared 0603 footprint serves every part that uses it.
        requested_links = self._import_assets.normalize_import_asset_links(asset_links or {})
        linked_assets: dict[str, dict[str, Any]] = {}
        if requested_links:
            linked_assets = self._import_assets.resolve_import_asset_links(conn, requested_links)
        by_type = self._import_assets.select_import_assets(
            candidates_by_type,
            asset_selections=asset_selections,
            linked_assets=linked_assets,
            findings=proposal["findings"],
        )
        self._import_assets.validate_project_import_asset_paths(runtime.store_root, proposal, by_type)

        now = utc_now_iso()
        self.claim_proposal(conn, proposal_id, now=now)
        self._catalog_locks.lock_component_identity(conn, metadata["manufacturer"], metadata["mpn"])
        existing = self.find_existing_component(conn, metadata["manufacturer"], metadata["mpn"])
        component_id = str(existing["id"]) if existing else str(uuid.uuid4())
        import_payload = self.build_import_payload(proposal)
        provenance = import_payload["provenance"]
        import_source = import_payload["import_source"]
        change_kind = "folder_import" if import_source == "folder_snapshot" else "project_import"
        current_revision = None
        if existing:
            component_row = self._revision_kernel.component_row(conn, component_id)
            current_revision = self._revision_kernel.revision_row(conn, str(component_row["current_revision_id"]))
        no_content_change = bool(
            current_revision
            and self._import_assets.revision_matches_import(conn, current_revision, metadata, by_type)
        )
        if no_content_change and current_revision:
            revision_id = str(current_revision["id"])
        else:
            _, revision_id = self._component_writer.upsert_metadata_row(
                conn,
                runtime,
                component_id=component_id,
                metadata=metadata,
                now=now,
                existing_component_id=component_id if existing else None,
                actor=actor,
                change_summary=change_summary,
                finalize_revision=False,
                source=SOURCE_EXTERNAL,
                external_source=import_source,
                external_id=import_payload["external_id"],
                change_kind=change_kind,
            )
            self._store_staged_assets(
                conn,
                runtime,
                revision_id=revision_id,
                by_type=by_type,
                source_group=f"{import_source}:{proposal['session_id']}",
            )
            for asset_type, existing_asset in linked_assets.items():
                self._asset_links.link_asset_to_revision(
                    conn, revision_id, existing_asset, required=asset_type in PLACE_REQUIRED_ASSET_TYPES
                )
            self._finalizer.finalize_revision(
                conn,
                runtime,
                component_id=component_id,
                revision_id=revision_id,
                event_type="component.imported" if not existing else "revision.created",
                actor=actor,
                details={
                    "change_kind": change_kind,
                    "change_summary": change_summary,
                    "proposal_id": proposal_id,
                    "provenance": provenance,
                },
            )
        self._import_matching.record_component_usage(
            conn,
            component_id=component_id,
            provenance=provenance,
            observed_at=now,
            source="project_import",
        )
        self.mark_proposal_accepted(conn, proposal_id, component_id, now=now)
        return component_id

    def _store_staged_assets(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        *,
        revision_id: str,
        by_type: dict[str, list[dict[str, Any]]],
        source_group: str,
    ) -> None:
        for asset_type, candidates in by_type.items():
            for asset in candidates:
                staged_path = Path(str(asset.get("staged_path") or "")).resolve()
                # Recheck immediately before reading to close the window between
                # proposal validation and canonical storage.
                if sha256_file(staged_path) != str(asset.get("sha256") or ""):
                    raise ValueError(f"Staged {asset_type} asset has changed")
                payload = staged_path.read_bytes()
                target_library = str(asset.get("target_library") or "Prism_Imported")
                target_name = str(asset.get("target_name") or staged_path.stem)
                if asset_type not in _COPIED_ASSET_TYPES:
                    continue
                if asset_type == "symbol":
                    destination = self._asset_files.symbol_destination(runtime, target_library, target_name)
                elif asset_type == "footprint":
                    destination = self._asset_files.footprint_destination(runtime, target_library, target_name)
                else:
                    destination = self._asset_files.aux_destination(
                        runtime, asset_type, target_library, staged_path.name
                    )
                canonical_path = self._asset_files.write_canonical_file(runtime, destination, payload)
                registered = self._asset_registry.register_asset(
                    runtime,
                    conn,
                    asset_type=asset_type,
                    canonical_path=canonical_path,
                    target_library=target_library,
                    target_name=target_name,
                    source_group=source_group,
                )
                self._asset_links.link_asset_to_revision(
                    conn, revision_id, registered, required=asset_type in PLACE_REQUIRED_ASSET_TYPES
                )


__all__ = ["CatalogProjectImportAcceptance", "PROJECT_IMPORT_SYMBOL_LABEL_TO_KEY"]
