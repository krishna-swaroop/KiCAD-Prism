"""Project-import asset reads, selection, and validation."""

from __future__ import annotations

from dataclasses import dataclass
import re
from pathlib import Path
from typing import Any, Iterable

from app.services.catalog.normalization import (
    json_loads as _json_loads,
    sha256_file as _sha256_file,
)
from app.services.catalog.revision_kernel import CatalogRevisionKernel


SUPPORTED_ASSET_TYPES = ("symbol", "footprint", "3dmodel", "spice")
PLACE_REQUIRED_ASSET_TYPES = ("symbol", "footprint")
IMPORT_UNCHANGED_METADATA_FIELDS: tuple[str, ...] = (
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
    "summary",
)


@dataclass(frozen=True)
class CatalogAssetSearchPlan:
    """Prepared asset-search inputs; no catalog connection is needed to build one."""

    normalized_type: str
    term: str
    like: str
    bounded_limit: int


class CatalogProjectImportAssets:
    """Read and validate import assets using caller-owned connections and paths."""

    def __init__(self, revision_kernel: CatalogRevisionKernel) -> None:
        self._revision_kernel = revision_kernel

    @staticmethod
    def normalize_import_asset_links(
        asset_links: dict[str, str] | None,
    ) -> dict[str, str]:
        return {
            str(asset_type): str(asset_id).strip()
            for asset_type, asset_id in (asset_links or {}).items()
            if str(asset_id or "").strip()
        }

    def resolve_import_asset_links(
        self,
        conn: Any,
        asset_links: dict[str, str],
    ) -> dict[str, dict[str, Any]]:
        """Load existing catalog assets an import wants to reference by id."""
        resolved: dict[str, dict[str, Any]] = {}
        requested = self.normalize_import_asset_links(asset_links)
        for asset_type, asset_id in requested.items():
            row = conn.execute(
                "SELECT * FROM assets WHERE id = %s",
                (asset_id,),
            ).fetchone()
            if not row:
                raise ValueError(f"Linked {asset_type} asset was not found in the catalog")
            asset = dict(row)
            if str(asset["asset_type"]) != asset_type:
                raise ValueError(
                    f"Linked asset {asset_id} is a {asset['asset_type']}, not a {asset_type}"
                )
            resolved[asset_type] = asset
        return resolved

    @staticmethod
    def prepare_search_assets(
        *,
        asset_type: str,
        query: str = "",
        limit: int = 25,
    ) -> CatalogAssetSearchPlan:
        normalized_type = str(asset_type or "").strip().lower()
        if normalized_type not in SUPPORTED_ASSET_TYPES:
            raise ValueError("Unsupported asset type")
        term = re.sub(r"\s+", " ", str(query or "").strip())
        like = f"%{term.lower()}%"
        bounded_limit = max(1, min(int(limit or 25), 100))
        return CatalogAssetSearchPlan(normalized_type, term, like, bounded_limit)

    def execute_search_assets(
        self,
        conn: Any,
        plan: CatalogAssetSearchPlan,
    ) -> list[dict[str, Any]]:
        usage_count_lateral = """
            LEFT JOIN LATERAL (
                SELECT COUNT(DISTINCT c.id) AS usage_count
                FROM revision_assets ra
                JOIN component_revisions r ON r.id = ra.revision_id
                JOIN components c ON c.id = r.component_id AND c.is_active = 1
                WHERE ra.asset_id = a.id
            ) usage_stats ON true
        """

        if plan.term:
            rows = conn.execute(
                f"""
                    SELECT
                        a.id, a.asset_type, a.name, a.target_library, a.target_name,
                        a.sha256, a.size_bytes, usage_stats.usage_count
                    FROM assets a
                    {usage_count_lateral}
                    WHERE a.asset_type = %s
                      AND (
                        lower(a.name) LIKE %s
                        OR lower(a.target_name) LIKE %s
                        OR lower(a.target_library) LIKE %s
                      )
                    ORDER BY usage_stats.usage_count DESC, lower(a.target_name), a.name
                    LIMIT %s
                    """,
                (plan.normalized_type, plan.like, plan.like, plan.like, plan.bounded_limit),
            ).fetchall()
        else:
            rows = conn.execute(
                f"""
                    SELECT
                        a.id, a.asset_type, a.name, a.target_library, a.target_name,
                        a.sha256, a.size_bytes, usage_stats.usage_count
                    FROM assets a
                    {usage_count_lateral}
                    WHERE a.asset_type = %s
                    ORDER BY a.target_library, a.target_name, a.name
                    LIMIT %s
                    """,
                (plan.normalized_type, plan.bounded_limit),
            ).fetchall()

        return [
            {
                "id": str(row["id"]),
                "asset_type": str(row["asset_type"]),
                "name": str(row["name"]),
                "target_library": str(row["target_library"] or ""),
                "target_name": str(row["target_name"] or ""),
                "sha256": str(row["sha256"]),
                "size_bytes": int(row["size_bytes"] or 0),
                "usage_count": int(row["usage_count"] or 0),
            }
            for row in rows
        ]

    @staticmethod
    def group_import_assets(proposal: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
        by_type: dict[str, list[dict[str, Any]]] = {}
        for asset in list(proposal["assets"]):
            by_type.setdefault(str(asset.get("asset_type") or ""), []).append(asset)
        return by_type

    @staticmethod
    def select_import_assets(
        candidates_by_type: dict[str, list[dict[str, Any]]],
        *,
        asset_selections: dict[str, list[str]] | None = None,
        linked_assets: dict[str, dict[str, Any]] | None = None,
        findings: Iterable[dict[str, Any]] = (),
    ) -> dict[str, list[dict[str, Any]]]:
        linked = linked_assets or {}
        selected_by_type: dict[str, list[dict[str, Any]]] = {}
        requested_selections = asset_selections or {}
        for asset_type, candidates in candidates_by_type.items():
            if asset_type in linked:
                # An existing catalog reference replaces the project's candidates.
                continue
            selection_was_explicit = asset_type in requested_selections
            selected_hashes = set(requested_selections.get(asset_type) or [])
            selected = [
                candidate
                for candidate in candidates
                if str(candidate.get("sha256") or "") in selected_hashes
            ]
            if selected_hashes and len(selected) != len(selected_hashes):
                raise ValueError(f"Asset selection for {asset_type} contains an unknown content hash")
            if asset_type in PLACE_REQUIRED_ASSET_TYPES:
                effective = selected if selection_was_explicit else candidates
                if len(effective) != 1:
                    raise ValueError(f"Select exactly one {asset_type} asset before import")
                selected_by_type[asset_type] = effective
            else:
                # An explicit empty list excludes optional project-local assets.
                selected_by_type[asset_type] = selected if selection_was_explicit else candidates

        for required_type in PLACE_REQUIRED_ASSET_TYPES:
            if not selected_by_type.get(required_type) and required_type not in linked:
                raise ValueError(
                    "A symbol and footprint are required before accepting a project import"
                )
        resolved_by_link = {f"{asset_type}_not_resolved" for asset_type in linked}
        blocking = [
            finding
            for finding in findings
            if finding.get("severity") == "error"
            and not str(finding.get("code") or "").startswith("missing_metadata_")
            and not str(finding.get("code") or "").startswith("conflicting_")
            and str(finding.get("code") or "") not in resolved_by_link
        ]
        if blocking:
            raise ValueError("Resolve blocking import findings before accepting this proposal")
        return selected_by_type

    def revision_matches_import(
        self,
        conn: Any,
        revision: dict[str, Any],
        metadata: dict[str, Any],
        selected_assets: dict[str, list[dict[str, Any]]],
    ) -> bool:
        metadata_fields = IMPORT_UNCHANGED_METADATA_FIELDS
        if any(str(revision.get(field) or "") != str(metadata.get(field) or "") for field in metadata_fields):
            return False
        if _json_loads(revision.get("extra_fields"), {}) != metadata.get("extra_fields", {}):
            return False
        current_assets = {
            (
                str(asset["asset_type"]),
                str(asset["sha256"]),
                str(asset["target_library"]),
                str(asset["target_name"]),
            )
            for asset in self._revision_kernel.load_assets_for_revision(conn, str(revision["id"]))
        }
        incoming_assets = {
            (
                str(asset_type),
                str(candidate.get("sha256") or ""),
                str(candidate.get("target_library") or "Prism_Imported"),
                str(candidate.get("target_name") or Path(str(candidate.get("filename") or "asset")).stem),
            )
            for asset_type, candidates in selected_assets.items()
            for candidate in candidates
        }
        return incoming_assets.issubset(current_assets)

    @staticmethod
    def validate_project_import_asset_paths(
        store_root: Path,
        proposal: dict[str, Any],
        selected_assets: dict[str, list[dict[str, Any]]],
    ) -> None:
        imports_root = (Path(store_root) / "imports" / str(proposal["session_id"])).resolve()
        for asset_type, candidates in selected_assets.items():
            for asset in candidates:
                staged_path = Path(str(asset.get("staged_path") or "")).resolve()
                try:
                    staged_path.relative_to(imports_root)
                except ValueError as exc:
                    raise ValueError("Import proposal contains an invalid staged asset path") from exc
                if not staged_path.is_file() or _sha256_file(staged_path) != str(asset.get("sha256") or ""):
                    raise ValueError(f"Staged {asset_type} asset is missing or has changed")


__all__ = [
    "CatalogAssetSearchPlan",
    "CatalogProjectImportAssets",
    "IMPORT_UNCHANGED_METADATA_FIELDS",
]
