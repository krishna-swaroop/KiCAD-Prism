"""Placement bundles for desktop KiCad: manifests, inline bundles, asset fetches.

A placement is always anchored to one representation (a symbol/footprint pair)
on a released revision. Auxiliary 3D/SPICE assets ride along with whichever
representation is selected.
"""

from __future__ import annotations

import base64
import json
from typing import Any

from app.services.catalog.asset_types import AUXILIARY_ASSET_TYPES
from app.services.catalog.component_read_models import CatalogComponentReadModels
from app.services.catalog.placement_payloads import materialize_asset
from app.services.catalog.revision_kernel import CatalogRevisionKernel
from app.services.catalog.signed_urls import CatalogAssetUrlSigner


NOT_PLACEABLE_MESSAGE = "Component is not placeable because it is not released or required files are missing"


class CatalogPlacement:
    """Resolve representation assets and shape them for remote placement."""

    def __init__(
        self,
        revision_kernel: CatalogRevisionKernel,
        read_models: CatalogComponentReadModels,
        signer: type[CatalogAssetUrlSigner] = CatalogAssetUrlSigner,
    ) -> None:
        self._revision_kernel = revision_kernel
        self._read_models = read_models
        self._signer = signer

    def placement_assets(
        self,
        conn: Any,
        revision_id: str,
        representation_id: str = "",
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        """Return ``(representation_row, assets)`` for the chosen or default pair."""
        if representation_id:
            row = conn.execute(
                "SELECT * FROM revision_representations WHERE id = %s AND revision_id = %s",
                (representation_id, revision_id),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT * FROM revision_representations WHERE revision_id = %s AND is_default = 1 LIMIT 1",
                (revision_id,),
            ).fetchone()
        if not row:
            raise ValueError("Representation was not found on this revision")
        if not row["symbol_asset_id"] or not row["footprint_asset_id"]:
            raise ValueError("Selected representation is incomplete")
        all_assets = self._revision_kernel.load_assets_for_revision(conn, revision_id)
        selected_ids = {str(row["symbol_asset_id"]), str(row["footprint_asset_id"])}
        assets = [
            asset
            for asset in all_assets
            if str(asset["asset_type"]) in AUXILIARY_ASSET_TYPES or str(asset["id"]) in selected_ids
        ]
        if len([asset for asset in assets if str(asset["id"]) in selected_ids]) != 2:
            raise ValueError("Selected representation references unavailable assets")
        return dict(row), assets

    @staticmethod
    def _require_placeable(component: dict[str, Any]) -> None:
        if not component["place_enabled"]:
            raise ValueError(NOT_PLACEABLE_MESSAGE)

    def build_manifest(
        self,
        conn: Any,
        component: dict[str, Any],
        base_url: str,
        representation_id: str = "",
    ) -> dict[str, Any]:
        self._require_placeable(component)
        representation, assets = self.placement_assets(conn, component["revision_id"], representation_id)
        manifest_assets = []
        for raw_asset in assets:
            asset = materialize_asset(raw_asset, assets, component)
            manifest_assets.append(
                {
                    "asset_type": asset["asset_type"],
                    "name": asset["name"],
                    "target_library": asset["target_library"],
                    "target_name": asset["target_name"],
                    "content_type": asset["content_type"],
                    "size_bytes": asset["size_bytes"],
                    "sha256": asset["sha256"],
                    "required": bool(raw_asset["required"]),
                    "download_url": self._signer.build_signed_asset_url(
                        asset["id"],
                        component["revision_id"],
                        base_url,
                        representation_id=str(representation["id"]),
                    ),
                }
            )
        return {
            "part_id": component["id"],
            "display_name": component["name"],
            "summary": component["summary"] or component["description"],
            "license": "Managed in KiCAD Prism",
            "representation_id": str(representation["id"]),
            "library_name": next(str(a["target_library"]) for a in assets if a["asset_type"] == "symbol"),
            "symbol_name": next(str(a["target_name"]) for a in assets if a["asset_type"] == "symbol"),
            "assets": manifest_assets,
        }

    def build_inline_bundle(
        self,
        conn: Any,
        component: dict[str, Any],
        representation_id: str = "",
    ) -> dict[str, Any]:
        self._require_placeable(component)
        representation, assets = self.placement_assets(conn, component["revision_id"], representation_id)
        bundle_entries = []
        for raw_asset in assets:
            asset = materialize_asset(raw_asset, assets, component)
            bundle_entries.append(
                {
                    "type": asset["asset_type"],
                    "name": (
                        asset["name"]
                        if asset["asset_type"] == "3dmodel"
                        else asset["target_name"] or asset["name"]
                    ),
                    "compression": "NONE",
                    "content": base64.b64encode(asset["payload"]).decode("ascii"),
                    "checksum": asset["sha256"],
                }
            )
        return {
            "part_id": component["id"],
            "display_name": component["name"],
            "representation_id": str(representation["id"]),
            "library": next(str(a["target_library"]) for a in assets if a["asset_type"] == "symbol"),
            "symbol_name": next(str(a["target_name"]) for a in assets if a["asset_type"] == "symbol"),
            "compression": "NONE",
            "data": base64.b64encode(
                json.dumps(bundle_entries, separators=(",", ":")).encode("utf-8")
            ).decode("ascii"),
        }

    def asset_by_id(
        self,
        conn: Any,
        asset_id: str,
        *,
        revision_id: str = "",
        representation_id: str = "",
    ) -> dict[str, Any] | None:
        """Materialize one asset in the context of a revision and representation.

        Without an explicit revision the asset's most recently linked revision is
        used so the symbol rewrite still sees its footprint and metadata.
        """
        row = conn.execute("SELECT * FROM assets WHERE id = %s", (asset_id,)).fetchone()
        if not row:
            return None
        asset = dict(row)
        effective_revision_id = revision_id
        if not effective_revision_id:
            link = conn.execute(
                "SELECT revision_id FROM revision_assets WHERE asset_id = %s ORDER BY updated_at DESC LIMIT 1",
                (asset_id,),
            ).fetchone()
            effective_revision_id = str(link["revision_id"]) if link else ""
        if effective_revision_id and representation_id:
            _, assets_for_revision = self.placement_assets(conn, effective_revision_id, representation_id)
        elif effective_revision_id:
            assets_for_revision = self._revision_kernel.load_assets_for_revision(conn, effective_revision_id)
        else:
            assets_for_revision = [asset]
        component = None
        if effective_revision_id:
            revision = self._revision_kernel.revision_row(conn, effective_revision_id)
            if revision:
                component_row = self._revision_kernel.component_row(conn, str(revision["component_id"]))
                if component_row:
                    component = self._read_models.component_payload(conn, component_row, revision)
        return materialize_asset(asset, assets_for_revision, component)


__all__ = ["NOT_PLACEABLE_MESSAGE", "CatalogPlacement"]
