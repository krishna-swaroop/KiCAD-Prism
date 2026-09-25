"""Connection-level component revision comparison for the catalog."""

from __future__ import annotations

from typing import Any

from app.services.catalog.normalization import (
    json_loads,
    preview_base_kind,
    preview_unit,
    preview_unit_label,
)
from app.services.catalog.revision_kernel import CatalogRevisionKernel


REVISION_DIFF_METADATA_FIELDS: tuple[str, ...] = (
    "name",
    "value",
    "description",
    "datasheet_url",
    "manufacturer",
    "mpn",
    "category",
    "package_name",
    "vendor",
    "vendor_part_number",
    "mass_g",
    "rqjc_c_w",
    "rqjc_top_c_w",
    "temp_max_c",
    "temp_min_c",
    "power_dissipation_w",
    "rate",
    "sap_code",
)


class CatalogRevisionComparison:
    """Compare revisions using a caller-supplied connection."""

    def __init__(self, revision_kernel: CatalogRevisionKernel) -> None:
        self._revision_kernel = revision_kernel

    def _load_previews_for_revision(self, conn: Any, revision_id: str) -> list[dict[str, Any]]:
        output_rows = conn.execute(
            """
            SELECT preview.*
            FROM revision_preview_outputs link
            JOIN asset_preview_versions preview ON preview.id = link.preview_id
            JOIN revision_assets ra
              ON ra.revision_id = link.revision_id AND ra.asset_id = link.asset_id
            WHERE link.revision_id = %s
            """,
            (revision_id,),
        ).fetchall()
        evidence_rows = conn.execute(
            """
            SELECT preview.*
            FROM revision_previews link
            JOIN asset_preview_versions preview ON preview.id = link.preview_id
            JOIN revision_assets ra
              ON ra.revision_id = link.revision_id AND ra.asset_id = link.asset_id
            WHERE link.revision_id = %s
            """,
            (revision_id,),
        ).fetchall()
        # Preview outputs are regenerated derived data while revision_previews
        # are immutable legacy evidence. Compare their semantic (asset, kind,
        # unit) identity rather than their raw kind: old records may encode
        # Unit A as `symbol`, while regenerated records use `symbol:unit1`.
        # Returning both made the UI show two Unit A tabs.
        previews = {
            (str(row["asset_id"]), preview_base_kind(str(row["kind"])), preview_unit(str(row["kind"]))): dict(row)
            for row in evidence_rows
        }
        previews.update({
            (str(row["asset_id"]), preview_base_kind(str(row["kind"])), preview_unit(str(row["kind"]))): dict(row)
            for row in output_rows
        })
        return sorted(previews.values(), key=lambda row: (str(row["kind"]), str(row["asset_id"]), str(row["created_at"]), str(row["id"])))

    def compare_component_revisions(
        self,
        conn: Any,
        component_id: str,
        before_revision_id: str,
        after_revision_id: str,
    ) -> dict[str, Any]:
        component = self._revision_kernel.component_row(conn, component_id)
        before = self._revision_kernel.revision_row(conn, before_revision_id)
        after = self._revision_kernel.revision_row(conn, after_revision_id)
        if not component or not before or not after:
            raise ValueError("Component revision not found")
        if str(before["component_id"]) != component_id or str(after["component_id"]) != component_id:
            raise ValueError("Component revision does not belong to this component")
        fixed_fields = REVISION_DIFF_METADATA_FIELDS
        before_metadata = {field: str(before.get(field) or "") for field in fixed_fields}
        after_metadata = {field: str(after.get(field) or "") for field in fixed_fields}
        before_extra = json_loads(before.get("extra_fields"), {})
        after_extra = json_loads(after.get("extra_fields"), {})
        for field in sorted(set(before_extra) | set(after_extra)):
            before_metadata[f"field:{field}"] = str(before_extra.get(field) or "")
            after_metadata[f"field:{field}"] = str(after_extra.get(field) or "")
        metadata_changes = []
        for field in sorted(set(before_metadata) | set(after_metadata)):
            old_value = before_metadata.get(field, "")
            new_value = after_metadata.get(field, "")
            status = "unchanged" if old_value == new_value else "added" if not old_value else "removed" if not new_value else "modified"
            metadata_changes.append({"field": field, "before": old_value, "after": new_value, "status": status})

        def asset_map(revision_id: str) -> dict[str, dict[str, Any]]:
            # 3D and SPICE files remain immutable, hashed revision assets, but
            # comparison intentionally focuses on the authoring surfaces where a
            # reviewer can make a meaningful visual/semantic decision today.
            assets = [
                asset
                for asset in self._revision_kernel.load_assets_for_revision(conn, revision_id)
                if str(asset["asset_type"]) in {"symbol", "footprint"}
            ]
            previews = self._load_previews_for_revision(conn, revision_id)
            previews_by_asset: dict[str, list[dict[str, Any]]] = {}
            for preview in previews:
                previews_by_asset.setdefault(str(preview["asset_id"]), []).append(preview)
            result: dict[str, dict[str, Any]] = {}
            for asset in assets:
                key = f"{asset['asset_type']}:{asset['target_library']}:{asset['target_name']}"
                asset_previews = sorted(
                    previews_by_asset.get(str(asset["id"]), []),
                    key=lambda item: (preview_unit(str(item["kind"])), str(item["id"])),
                )
                preview = asset_previews[0] if asset_previews else None
                preview_payloads = [
                    {
                        "previewId": str(item["id"]),
                        "previewStatus": str(item["status"]),
                        "previewSha256": str(item["sha256"]),
                        "previewGeneratorFingerprint": str(item["generator_fingerprint"]),
                        "unit": preview_unit(str(item["kind"])),
                        "unitLabel": preview_unit_label(str(item["kind"])),
                    }
                    for item in asset_previews
                ]
                result[key] = {
                    "assetId": str(asset["id"]),
                    "assetType": str(asset["asset_type"]),
                    "targetLibrary": str(asset["target_library"]),
                    "targetName": str(asset["target_name"]),
                    "sha256": str(asset["sha256"]),
                    "sizeBytes": int(asset["size_bytes"]),
                    "previewId": str(preview["id"]) if preview else "",
                    "previewStatus": str(preview["status"]) if preview else "",
                    "previewSha256": str(preview["sha256"]) if preview else "",
                    "previewGeneratorFingerprint": str(preview["generator_fingerprint"]) if preview else "",
                    "previews": preview_payloads,
                }
            return result

        before_assets = asset_map(before_revision_id)
        after_assets = asset_map(after_revision_id)
        asset_changes = []
        for key in sorted(set(before_assets) | set(after_assets)):
            old_asset = before_assets.get(key)
            new_asset = after_assets.get(key)
            status = (
                "added"
                if old_asset is None
                else "removed"
                if new_asset is None
                else "unchanged"
                # Preview bytes are derived and may be regenerated with
                # nondeterministic SVG metadata. The immutable CAD asset hash
                # is the authoring identity; preview churn is never a design
                # modification on its own.
                if old_asset["sha256"] == new_asset["sha256"]
                else "modified"
            )
            asset_changes.append({"key": key, "before": old_asset, "after": new_asset, "status": status})
        changed_metadata = sum(change["status"] != "unchanged" for change in metadata_changes)
        changed_assets = sum(change["status"] != "unchanged" for change in asset_changes)

        def representation_map(revision_id: str) -> dict[str, dict[str, Any]]:
            rows = conn.execute(
                "SELECT * FROM revision_representations WHERE revision_id = %s ORDER BY display_order, id",
                (revision_id,),
            ).fetchall()
            return {
                f"{row['symbol_asset_id'] or ''}:{row['footprint_asset_id'] or ''}": {
                    "label": str(row["label"]),
                    "symbolAssetId": str(row["symbol_asset_id"] or ""),
                    "footprintAssetId": str(row["footprint_asset_id"] or ""),
                    "isDefault": bool(row["is_default"]),
                    "displayOrder": int(row["display_order"]),
                    "sourceInternalPartNumber": str(row["source_internal_part_number"] or ""),
                    "provenance": json_loads(row.get("provenance_json"), {}),
                }
                for row in rows
            }

        before_representations = representation_map(before_revision_id)
        after_representations = representation_map(after_revision_id)
        representation_changes = []
        for key in sorted(set(before_representations) | set(after_representations)):
            old_representation = before_representations.get(key)
            new_representation = after_representations.get(key)
            status = (
                "added" if old_representation is None else
                "removed" if new_representation is None else
                "unchanged" if old_representation == new_representation else
                "modified"
            )
            representation_changes.append(
                {"key": key, "before": old_representation, "after": new_representation, "status": status}
            )
        changed_representations = sum(
            change["status"] != "unchanged" for change in representation_changes
        )
        return {
            "componentId": component_id,
            "before": {"revisionId": before_revision_id, "version": int(before["version"]), "manifestHash": str(before["manifest_hash"])},
            "after": {"revisionId": after_revision_id, "version": int(after["version"]), "manifestHash": str(after["manifest_hash"])},
            "summary": {"metadataChanges": changed_metadata, "assetChanges": changed_assets, "representationChanges": changed_representations},
            "metadataChanges": metadata_changes,
            "assetChanges": asset_changes,
            "representationChanges": representation_changes,
        }


__all__ = ["CatalogRevisionComparison", "REVISION_DIFF_METADATA_FIELDS"]
