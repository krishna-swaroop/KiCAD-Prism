"""Bring KiCad files into the catalog store and onto component revisions.

Covers linking files that already live in the store, importing uploaded symbol
libraries and footprints, attaching auxiliary files, detaching assets, and
serving an asset's stored bytes.  Operations receive their connection and
runtime and never commit.
"""

from __future__ import annotations

import io
import logging
from pathlib import Path
import tempfile
from typing import Any
import zipfile

from app.services.catalog.asset_files import (
    CatalogAssetFiles,
    content_type_for_asset,
    discover_footprint_name_in_text,
    discover_symbol_names_in_text,
)
from app.services.catalog.asset_links import CatalogAssetLinks
from app.services.catalog.asset_registry import CatalogAssetRegistry
from app.services.catalog.asset_types import (
    AUXILIARY_ASSET_TYPES,
    PLACE_REQUIRED_ASSET_TYPES,
    SUPPORTED_ASSET_TYPES,
)
from app.services.catalog.conflicts import CatalogConflict, asset_referenced_conflict
from app.services.catalog.kicad_cli import KicadCliRunner
from app.services.catalog.normalization import sanitize_name
from app.services.catalog.revision_finalization import CatalogRevisionFinalizer
from app.services.catalog.revision_kernel import CatalogRevisionKernel
from app.services.catalog.runtime import CatalogRuntime


logger = logging.getLogger(__name__)

DEFAULT_SYMBOL_LIBRARY = "Prism_Symbols"
DEFAULT_FOOTPRINT_LIBRARY = "Prism_Footprints"
DEFAULT_AUXILIARY_LIBRARY = "Prism_Assets"

# Rows a detached asset must no longer contribute to on the new revision.
_ASSET_LINK_TABLES = (
    "revision_previews",
    "revision_preview_outputs",
    "revision_validation_evidence_links",
    "revision_assets",
)


class CatalogAssetImports:
    """Asset ingestion and detachment for component revisions."""

    def __init__(
        self,
        revision_kernel: CatalogRevisionKernel,
        asset_links: CatalogAssetLinks,
        finalizer: CatalogRevisionFinalizer,
        asset_files: CatalogAssetFiles | None = None,
        asset_registry: CatalogAssetRegistry | None = None,
    ) -> None:
        self._revision_kernel = revision_kernel
        self._asset_links = asset_links
        self._finalizer = finalizer
        self._asset_files = asset_files or CatalogAssetFiles()
        self._asset_registry = asset_registry or CatalogAssetRegistry()

    def _require_expected_revision(self, conn: Any, component_id: str, expected_revision_id: str = "") -> None:
        if not expected_revision_id:
            return
        _, current = self._revision_kernel.active_revision_row(conn, component_id, released=False)
        if not current:
            raise ValueError("Component not found")
        self._revision_kernel.assert_expected_revision(str(current["id"]), expected_revision_id)

    # -- pure upload shaping --------------------------------------------------

    @staticmethod
    def normalize_symbol_upload(runtime: CatalogRuntime, upload_name: str, payload: bytes) -> bytes:
        """Upgrade an uploaded library with ``kicad-cli``; keep the bytes when it cannot."""
        with tempfile.TemporaryDirectory(prefix="prism_sym_import_") as tmp_dir:
            input_path = Path(tmp_dir) / sanitize_name(upload_name or "uploaded", "uploaded.kicad_sym")
            output_path = Path(tmp_dir) / "normalized.kicad_sym"
            input_path.write_bytes(payload)
            success, error = KicadCliRunner.run(
                runtime,
                ["sym", "upgrade", "--force", "--output", str(output_path), str(input_path)],
            )
            if not success:
                logger.warning(
                    "Falling back to uploaded symbol payload without kicad-cli normalization: %s",
                    error,
                )
                return payload
            if not output_path.is_file():
                raise ValueError("kicad-cli sym upgrade did not produce a normalized symbol library")
            return output_path.read_bytes()

    @staticmethod
    def extract_footprints_from_upload(upload_name: str, payload: bytes) -> dict[str, bytes]:
        suffix = Path(upload_name).suffix.lower()
        if suffix == ".kicad_mod":
            text = payload.decode("utf-8", errors="ignore")
            name = discover_footprint_name_in_text(text) or Path(upload_name).stem
            return {name: payload}
        if suffix == ".zip":
            discovered: dict[str, bytes] = {}
            with zipfile.ZipFile(io.BytesIO(payload)) as archive:
                for name in archive.namelist():
                    if not name.lower().endswith(".kicad_mod"):
                        continue
                    content = archive.read(name)
                    footprint_name = (
                        discover_footprint_name_in_text(content.decode("utf-8", errors="ignore"))
                        or Path(name).stem
                    )
                    discovered[footprint_name] = content
            return discovered
        raise ValueError("Footprint upload must be a .kicad_mod file or a zipped .pretty library")

    # -- store-resident assets ----------------------------------------------

    def resolve_existing_asset(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        *,
        asset_type: str,
        file_path: str,
        target_library: str,
        target_name: str,
    ) -> dict[str, Any]:
        root = self._asset_files.asset_root(runtime, asset_type)
        path = (root / file_path).resolve()
        if not path.is_file():
            raise ValueError(f"Asset file not found: {path}")
        try:
            path.relative_to(runtime.store_root)
        except ValueError as exc:
            raise ValueError("Linked asset must already live inside the Prism canonical store") from exc

        if asset_type == "symbol":
            text = path.read_text(encoding="utf-8", errors="ignore")
            discovered = discover_symbol_names_in_text(text)
            if not target_name:
                if len(discovered) != 1:
                    raise ValueError("Symbol file contains multiple symbols; target_name is required")
                target_name = discovered[0]
            if not target_library:
                target_library = path.parent.name
            if len(discovered) != 1 or discovered[0] != target_name:
                payload = self._asset_files.single_symbol_payload(text, target_name)
                canonical = self._asset_files.write_canonical_file(
                    runtime,
                    self._asset_files.symbol_destination(runtime, target_library, target_name),
                    payload,
                )
            else:
                canonical = path
        elif asset_type == "footprint":
            if path.suffix.lower() != ".kicad_mod":
                raise ValueError("Footprint links must point to a .kicad_mod file")
            target_name = (
                target_name
                or discover_footprint_name_in_text(path.read_text(encoding="utf-8", errors="ignore"))
                or path.stem
            )
            target_library = target_library or path.parent.name.removesuffix(".pretty")
            canonical = path
        elif asset_type in AUXILIARY_ASSET_TYPES:
            target_name = target_name or path.name
            target_library = target_library or path.parent.name
            canonical = path
        else:
            raise ValueError("Unsupported asset type")

        return self._asset_registry.register_asset(
            runtime,
            conn,
            asset_type=asset_type,
            canonical_path=canonical,
            target_library=target_library,
            target_name=target_name,
        )

    def link_library_asset(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        component_id: str,
        asset_type: str,
        file_path_rel: str,
        target_library: str,
        target_name: str,
        *,
        counterpart_asset_id: str = "",
        actor: str = "",
        expected_revision_id: str = "",
    ) -> dict[str, Any]:
        if asset_type not in SUPPORTED_ASSET_TYPES:
            raise ValueError("Unsupported asset type")
        self._require_expected_revision(conn, component_id, expected_revision_id)
        asset = self.resolve_existing_asset(
            conn,
            runtime,
            asset_type=asset_type,
            file_path=file_path_rel,
            target_library=target_library,
            target_name=target_name,
        )
        self._asset_links.attach_asset_revision(
            conn,
            runtime,
            component_id=component_id,
            asset=asset,
            required=asset_type in PLACE_REQUIRED_ASSET_TYPES,
            actor=actor,
            change_summary=f"Link {asset_type} asset",
            counterpart_asset_id=counterpart_asset_id,
            expected_revision_id=expected_revision_id,
        )
        return asset

    # -- uploads ------------------------------------------------------------

    def import_symbol_library(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        component_id: str,
        *,
        upload_name: str,
        payload: bytes,
        target_library: str,
        selected_symbol: str,
        counterpart_asset_id: str = "",
        actor: str = "",
        expected_revision_id: str = "",
    ) -> dict[str, Any]:
        """Import one symbol; ``mode`` is ``selection_required`` until a symbol is chosen."""
        self._require_expected_revision(conn, component_id, expected_revision_id)
        normalized = self.normalize_symbol_upload(runtime, upload_name, payload)
        text = normalized.decode("utf-8", errors="ignore")
        discovered = discover_symbol_names_in_text(text)
        if not discovered:
            raise ValueError("No symbols were found in the uploaded library")
        if not selected_symbol and len(discovered) > 1:
            return {"mode": "selection_required", "discovered_symbols": discovered}
        chosen = selected_symbol or discovered[0]
        library = target_library or DEFAULT_SYMBOL_LIBRARY
        canonical_payload = self._asset_files.single_symbol_payload(text, chosen)
        canonical_path = self._asset_files.write_canonical_file(
            runtime,
            self._asset_files.symbol_destination(runtime, library, chosen),
            canonical_payload,
        )
        asset = self._asset_registry.register_asset(
            runtime,
            conn,
            asset_type="symbol",
            canonical_path=canonical_path,
            target_library=library,
            target_name=chosen,
        )
        self._asset_links.attach_asset_revision(
            conn,
            runtime,
            component_id=component_id,
            asset=asset,
            required=True,
            actor=actor,
            change_summary=f"Import symbol {chosen}",
            counterpart_asset_id=counterpart_asset_id,
            expected_revision_id=expected_revision_id,
        )
        return {"mode": "imported", "discovered_symbols": discovered, "selected_symbol": chosen}

    def import_footprint(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        component_id: str,
        *,
        upload_name: str,
        payload: bytes,
        target_library: str,
        selected_footprint: str,
        counterpart_asset_id: str = "",
        actor: str = "",
        expected_revision_id: str = "",
    ) -> dict[str, Any]:
        self._require_expected_revision(conn, component_id, expected_revision_id)
        discovered = self.extract_footprints_from_upload(upload_name, payload)
        names = sorted(discovered)
        if not names:
            raise ValueError("No footprints were found in the uploaded payload")
        if not selected_footprint and len(names) > 1:
            return {"mode": "selection_required", "discovered_footprints": names}
        chosen = selected_footprint or names[0]
        library = target_library or DEFAULT_FOOTPRINT_LIBRARY
        canonical_path = self._asset_files.write_canonical_file(
            runtime,
            self._asset_files.footprint_destination(runtime, library, chosen),
            discovered[chosen],
        )
        asset = self._asset_registry.register_asset(
            runtime,
            conn,
            asset_type="footprint",
            canonical_path=canonical_path,
            target_library=library,
            target_name=chosen,
        )
        self._asset_links.attach_asset_revision(
            conn,
            runtime,
            component_id=component_id,
            asset=asset,
            required=True,
            actor=actor,
            change_summary=f"Import footprint {chosen}",
            counterpart_asset_id=counterpart_asset_id,
            expected_revision_id=expected_revision_id,
        )
        return {"mode": "imported", "discovered_footprints": names, "selected_footprint": chosen}

    def attach_auxiliary_asset(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        component_id: str,
        *,
        asset_type: str,
        upload_name: str,
        payload: bytes,
        target_library: str,
        actor: str = "",
        expected_revision_id: str = "",
    ) -> dict[str, Any]:
        if asset_type not in AUXILIARY_ASSET_TYPES:
            raise ValueError("Unsupported auxiliary asset type")
        self._require_expected_revision(conn, component_id, expected_revision_id)
        library = target_library or DEFAULT_AUXILIARY_LIBRARY
        destination = self._asset_files.write_canonical_file(
            runtime,
            self._asset_files.aux_destination(runtime, asset_type, library, upload_name),
            payload,
        )
        asset = self._asset_registry.register_asset(
            runtime,
            conn,
            asset_type=asset_type,
            canonical_path=destination,
            target_library=library,
            target_name=destination.name,
        )
        self._asset_links.attach_asset_revision(
            conn,
            runtime,
            component_id=component_id,
            asset=asset,
            required=False,
            actor=actor,
            change_summary=f"Import {asset_type} asset {destination.name}",
            expected_revision_id=expected_revision_id,
        )
        return asset

    # -- detachment ---------------------------------------------------------

    def detach_asset(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        component_id: str,
        asset_type: str,
        *,
        actor: str = "",
    ) -> bool:
        """Detach every asset of one auxiliary type; return whether a revision was written."""
        if asset_type not in SUPPORTED_ASSET_TYPES:
            raise ValueError("Unsupported asset type")
        if asset_type in PLACE_REQUIRED_ASSET_TYPES:
            raise ValueError(
                "Symbol and footprint assets must be detached by asset ID after removing or reassigning their representations"
            )
        _, current = self._revision_kernel.active_revision_row(conn, component_id, released=False)
        if not current:
            raise ValueError("Component not found")
        existing = conn.execute(
            "SELECT 1 FROM revision_assets WHERE revision_id = %s AND asset_type = %s",
            (current["id"], asset_type),
        ).fetchone()
        if not existing:
            return False
        revision = self._revision_kernel.clone_revision(
            conn,
            component_id,
            actor=actor,
            change_kind="asset",
            change_summary=f"Detach {asset_type} asset",
        )
        revision_id = str(revision["id"])
        for table in _ASSET_LINK_TABLES[:-1]:
            conn.execute(
                f"""
                DELETE FROM {table}
                WHERE revision_id = %s AND asset_id IN (
                    SELECT asset_id FROM revision_assets WHERE revision_id = %s AND asset_type = %s
                )
                """,
                (revision_id, revision_id, asset_type),
            )
        conn.execute(
            "DELETE FROM revision_assets WHERE revision_id = %s AND asset_type = %s",
            (revision_id, asset_type),
        )
        self._finalizer.finalize_revision(
            conn,
            runtime,
            component_id=component_id,
            revision_id=revision_id,
            event_type="revision.created",
            actor=actor,
            details={"change_kind": "asset", "change_summary": f"Detach {asset_type} asset"},
        )
        return True

    def detach_asset_by_id(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        component_id: str,
        asset_id: str,
        *,
        expected_revision_id: str,
        actor: str = "",
    ) -> None:
        _, current = self._revision_kernel.active_revision_row(conn, component_id, released=False)
        if not current:
            raise ValueError("Component not found")
        if str(current["id"]) != expected_revision_id:
            raise CatalogConflict()
        linked = conn.execute(
            "SELECT asset_type FROM revision_assets WHERE revision_id = %s AND asset_id = %s",
            (current["id"], asset_id),
        ).fetchone()
        if not linked:
            raise ValueError("Asset is not attached to the current revision")
        referenced = conn.execute(
            """
            SELECT 1 FROM revision_representations
            WHERE revision_id = %s AND (symbol_asset_id = %s OR footprint_asset_id = %s)
            LIMIT 1
            """,
            (current["id"], asset_id, asset_id),
        ).fetchone()
        if referenced:
            raise asset_referenced_conflict()
        revision = self._revision_kernel.clone_revision(
            conn,
            component_id,
            actor=actor,
            change_kind="asset",
            change_summary=f"Detach {linked['asset_type']} asset",
            expected_revision_id=expected_revision_id,
        )
        revision_id = str(revision["id"])
        for table in _ASSET_LINK_TABLES:
            conn.execute(
                f"DELETE FROM {table} WHERE revision_id = %s AND asset_id = %s",
                (revision_id, asset_id),
            )
        self._finalizer.finalize_revision(
            conn,
            runtime,
            component_id=component_id,
            revision_id=revision_id,
            event_type="revision.created",
            actor=actor,
            details={"change_kind": "asset", "change_summary": "Detach asset", "asset_id": asset_id},
        )

    # -- reads --------------------------------------------------------------

    @staticmethod
    def asset_source(conn: Any, runtime: CatalogRuntime, asset_id: str) -> tuple[Path, str, str] | None:
        """One asset's stored bytes, as written -- not the placement rewrite.

        Returns ``(path, content_type, filename)``, or ``None`` when the asset is
        unknown or its file is missing.  The resolved path is confined to the
        store root so a row written by an older import cannot become an
        arbitrary file read.
        """
        row = conn.execute(
            "SELECT canonical_path, asset_type FROM assets WHERE id = %s",
            (asset_id,),
        ).fetchone()
        if not row:
            return None
        path = Path(str(row["canonical_path"] or "")).resolve()
        try:
            path.relative_to(runtime.store_root.resolve())
        except ValueError:
            return None
        if not path.is_file():
            return None
        return (path, content_type_for_asset(str(row["asset_type"] or ""), path), path.name)


__all__ = [
    "CatalogAssetImports",
    "DEFAULT_AUXILIARY_LIBRARY",
    "DEFAULT_FOOTPRINT_LIBRARY",
    "DEFAULT_SYMBOL_LIBRARY",
]
