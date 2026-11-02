"""Filesystem paths and immutable catalog asset writes.

KiCad text is read by ``app.services.kicad_library_reader``; the symbol helpers
here keep the catalog's historical names for it.
"""

from __future__ import annotations

import mimetypes
from pathlib import Path
from typing import Any

from app.services import kicad_library_reader
from app.services.catalog.conflicts import CatalogConflict
from app.services.catalog.normalization import sanitize_name, sha256_bytes, sha256_file
from app.services.catalog.runtime import CatalogRuntime


STEP_SUFFIXES = frozenset({".step", ".stp"})


# The database clock as the catalog's ISO-8601 text, so purge times never
# depend on a worker's clock.
DATABASE_NOW_ISO_SQL = """to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"')"""


# A revision whose STEP bytes the purge must keep (aliases ``revision`` and
# ``component``): a head, a released revision, or one that was ever released.
PROTECTED_REVISION_SQL = """
    revision.id = component.current_revision_id
    OR revision.id = component.released_revision_id
    OR revision.release_status = 'released'
    OR EXISTS (SELECT 1 FROM component_release_records record WHERE record.revision_id = revision.id)
"""


ASSET_BYTES_MISSING_CODE = "asset_bytes_missing"


def asset_bytes_lock_key(sha256: str) -> str:
    """The advisory-lock key that serializes the STEP purge with linking an asset.

    One lock per content hash (``hashtext('catalog-asset:' || sha256)``), so
    asset rows sharing bytes share the lock. A linker takes it shared until it
    commits, so linkers never wait for each other and cannot deadlock however
    many models one transaction links, in whatever order. The purge only tries
    it exclusively, so it never waits either.
    """
    return f"catalog-asset:{sha256}"


def lock_and_check_asset_bytes(conn: Any, asset_id: str, *, local_path: Path | None = None) -> None:
    """Before linking a 3D model, wait out a running purge and require its bytes.

    The file is written before any lock is taken, so a purge can delete it
    between the write and the link. Once this holds the asset's lock, the
    purge has either already unlinked the file (so refuse) or cannot take the
    lock until this commits (and will then see this link and keep the file).
    The hash is streamed, so a large STEP is never read into memory.

    ``local_path`` is where this process sees the file, for an importer whose
    row records the running service's path (``--runtime-store-root``).
    """
    row = conn.execute("SELECT canonical_path, sha256 FROM assets WHERE id = %s", (asset_id,)).fetchone()
    if row is None:
        return
    sha256 = str(row["sha256"])
    conn.execute("SELECT pg_advisory_xact_lock_shared(hashtext(%s))", (asset_bytes_lock_key(sha256),)).fetchone()
    path = local_path or Path(str(row["canonical_path"] or ""))
    if not path.is_file() or sha256_file(path) != sha256:
        raise CatalogConflict(
            "The 3D model file is missing from the catalog store; upload it again",
            code=ASSET_BYTES_MISSING_CODE,
        )


def discover_symbol_names_in_text(text: str) -> list[str]:
    """Top-level symbol names in a ``.kicad_sym`` payload, unit blocks excluded."""
    return kicad_library_reader.symbol_names(text)


def discover_footprint_name_in_text(text: str) -> str:
    """The footprint's declared name (``footprint`` or legacy ``module``), or ``""``."""
    return kicad_library_reader.footprint_name(text)


def content_type_for_asset(asset_type: str, file_path: Path) -> str:
    if asset_type == "symbol":
        return "application/x-kicad-symbol"
    if asset_type == "footprint":
        return "application/x-kicad-footprint"
    if asset_type == "3dmodel":
        return "model/step"
    if asset_type == "spice":
        if file_path.suffix.lower() in {".lib", ".mod", ".mdl"}:
            return "application/x-spice"
        return "application/octet-stream"
    guessed, _ = mimetypes.guess_type(file_path.name)
    return guessed or "application/octet-stream"


class CatalogAssetFiles:
    """Stateless catalog asset filesystem operations.

    Runtime state is supplied by callers for path resolution and cache
    invalidation. Symbol parsing does not need a runtime and remains pure.
    """

    @staticmethod
    def asset_root(runtime: CatalogRuntime, asset_type: str) -> Path:
        mapping = {
            "symbol": runtime.store_root / "symbols",
            "footprint": runtime.store_root / "footprints",
            "3dmodel": runtime.store_root / "3dmodels",
            "spice": runtime.store_root / "spice",
        }
        if asset_type not in mapping:
            raise ValueError("Unsupported asset type")
        return mapping[asset_type]

    @staticmethod
    def extract_top_level_symbol_blocks(text: str) -> list[tuple[str, str]]:
        return kicad_library_reader.top_level_symbol_blocks(text)

    @staticmethod
    def symbol_header(text: str) -> tuple[str, str]:
        return kicad_library_reader.library_header(text)

    @staticmethod
    def single_symbol_payload(text: str, selected_symbol: str) -> bytes:
        """``selected_symbol`` alone, as a library that loads on its own.

        A derived symbol (``extends``) is stored flattened with its parents'
        pins and graphics, the way KiCad caches it in a schematic: kept with
        only its ``extends`` line it names a parent the file does not hold, and
        KiCad refuses to load the library.
        """
        # Imported here: the project-bundle module pulls in the project import graph.
        from app.services.project_component_bundle_assets import flatten_symbol_definition

        blocks = kicad_library_reader.top_level_symbol_blocks(text)
        if any(name == selected_symbol and "(extends" in block for name, block in blocks):
            flattened = flatten_symbol_definition(text, selected_symbol)
            if flattened is None:
                raise ValueError(
                    f"Symbol {selected_symbol} extends a symbol that is not in the uploaded library"
                )
            blocks = [(name, flattened if name == selected_symbol else block) for name, block in blocks]
        return kicad_library_reader.single_symbol_library(text, selected_symbol, blocks)

    @staticmethod
    def write_canonical_file(runtime: CatalogRuntime, destination: Path, payload: bytes) -> Path:
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            existing = destination.read_bytes()
            if existing == payload:
                return destination
            digest = sha256_bytes(payload)
            try:
                relative = destination.resolve().relative_to(runtime.store_root)
            except ValueError:
                relative = Path(destination.name)
            immutable_destination = runtime.store_root / "revisions" / digest / relative
            immutable_destination.parent.mkdir(parents=True, exist_ok=True)
            if immutable_destination.exists():
                if immutable_destination.read_bytes() != payload:
                    raise ValueError(f"Immutable asset hash collision at {immutable_destination}")
                return immutable_destination
            immutable_destination.write_bytes(payload)
            runtime.invalidate_browse_cache()
            return immutable_destination
        destination.write_bytes(payload)
        runtime.invalidate_browse_cache()
        return destination

    @staticmethod
    def symbol_destination(runtime: CatalogRuntime, target_library: str, target_name: str) -> Path:
        safe_library = sanitize_name(target_library, "Prism_Symbols")
        safe_name = sanitize_name(target_name, "symbol")
        return runtime.store_root / "symbols" / safe_library / f"{safe_name}.kicad_sym"

    @staticmethod
    def footprint_destination(runtime: CatalogRuntime, target_library: str, target_name: str) -> Path:
        safe_library = sanitize_name(target_library, "Prism_Footprints")
        safe_name = sanitize_name(target_name, "footprint")
        return runtime.store_root / "footprints" / f"{safe_library}.pretty" / f"{safe_name}.kicad_mod"

    @staticmethod
    def aux_destination(runtime: CatalogRuntime, asset_type: str, target_library: str, upload_name: str) -> Path:
        safe_library = sanitize_name(target_library, "Prism_Assets")
        safe_name = sanitize_name(Path(upload_name).name, f"{asset_type}.bin")
        return CatalogAssetFiles.asset_root(runtime, asset_type) / safe_library / safe_name


__all__ = [
    "ASSET_BYTES_MISSING_CODE",
    "DATABASE_NOW_ISO_SQL",
    "PROTECTED_REVISION_SQL",
    "STEP_SUFFIXES",
    "asset_bytes_lock_key",
    "CatalogAssetFiles",
    "content_type_for_asset",
    "discover_footprint_name_in_text",
    "discover_symbol_names_in_text",
    "lock_and_check_asset_bytes",
]
