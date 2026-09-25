"""Filesystem paths, symbol parsing, and immutable catalog asset writes."""

from __future__ import annotations

import mimetypes
from pathlib import Path
import re
from typing import Any

from app.services.catalog.metadata_normalization import dedupe
from app.services.catalog.normalization import sanitize_name, sha256_bytes
from app.services.catalog.runtime import CatalogRuntime


STEP_SUFFIXES = frozenset({".step", ".stp"})


def discover_symbol_names_in_text(text: str) -> list[str]:
    """Top-level symbol names in a ``.kicad_sym`` payload, unit blocks excluded."""
    matches = re.findall(r'\(symbol\s+"([^"]+)"', text)
    filtered = [name for name in matches if not re.search(r"_\d+_\d+$", name)]
    return dedupe(filtered or matches)


def discover_footprint_name_in_text(text: str) -> str:
    match = re.search(r'\(footprint\s+"([^"]+)"', text)
    return match.group(1) if match else ""


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
        blocks: list[tuple[str, str]] = []
        depth = 0
        start: int | None = None
        name = ""
        in_string = False
        escape = False
        i = 0
        while i < len(text):
            ch = text[i]
            if in_string:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == '"':
                    in_string = False
                i += 1
                continue
            if ch == '"':
                in_string = True
                i += 1
                continue
            if ch == "(":
                if depth == 1 and text.startswith("(symbol", i):
                    start = i
                    j = i + len("(symbol")
                    while j < len(text) and text[j].isspace():
                        j += 1
                    if j < len(text) and text[j] == '"':
                        j += 1
                        k = j
                        escaped = False
                        chars: list[str] = []
                        while k < len(text):
                            current = text[k]
                            if escaped:
                                chars.append(current)
                                escaped = False
                            elif current == "\\":
                                escaped = True
                            elif current == '"':
                                break
                            else:
                                chars.append(current)
                            k += 1
                        name = "".join(chars)
                depth += 1
            elif ch == ")":
                depth -= 1
                if start is not None and depth == 1:
                    blocks.append((name, text[start : i + 1]))
                    start = None
                    name = ""
            i += 1
        return blocks

    @staticmethod
    def symbol_header(text: str) -> tuple[str, str]:
        version_match = re.search(r"\(version\s+([^)]+)\)", text)
        version = version_match.group(1) if version_match else "20211014"
        generator_match = re.search(r"\(generator\s+([^)]+)\)", text)
        generator = generator_match.group(1) if generator_match else '"KiCAD Prism"'
        return version, generator

    @staticmethod
    def single_symbol_payload(text: str, selected_symbol: str) -> bytes:
        blocks = CatalogAssetFiles.extract_top_level_symbol_blocks(text)
        blocks_dict = dict(blocks)
        base_block = blocks_dict.get(selected_symbol)
        if not base_block:
            raise ValueError("Selected symbol was not found in the library")

        escaped_name = re.escape(selected_symbol)
        unit_pattern = re.compile(rf"^{escaped_name}_\d+_\d+$")
        unit_blocks = [b for n, b in blocks if unit_pattern.match(n)]
        all_blocks_text = "\n  ".join([base_block] + unit_blocks)
        version, generator = CatalogAssetFiles.symbol_header(text)
        return (
            f"(kicad_symbol_lib (version {version}) (generator {generator})\n"
            f"  {all_blocks_text}\n)\n"
        ).encode("utf-8")

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

    @staticmethod
    def purge_superseded_step_files(conn: Any, runtime: CatalogRuntime) -> dict[str, Any]:
        """Purge obsolete STEP bytes while preserving immutable revision evidence.

        The asset row, hash, revision link, and audit history remain intact. A file
        is removed only when a newer current revision for that component has a
        different 3D model and no component currently uses the old asset.
        """
        rows = conn.execute(
            """
            WITH current_models AS (
                SELECT revision.component_id, link.asset_id
                FROM components component
                JOIN component_revisions revision ON revision.id = component.current_revision_id
                JOIN revision_assets link ON link.revision_id = revision.id
                WHERE link.asset_type = '3dmodel'
            ), superseded_models AS (
                SELECT DISTINCT revision.component_id, link.asset_id
                FROM component_revisions revision
                JOIN components component ON component.id = revision.component_id
                JOIN revision_assets link ON link.revision_id = revision.id
                JOIN current_models replacement
                  ON replacement.component_id = revision.component_id
                 AND replacement.asset_id <> link.asset_id
                WHERE revision.id <> component.current_revision_id
                  AND link.asset_type = '3dmodel'
            )
            SELECT DISTINCT asset.id, asset.canonical_path
            FROM superseded_models superseded
            JOIN assets asset ON asset.id = superseded.asset_id
            LEFT JOIN current_models active ON active.asset_id = superseded.asset_id
            WHERE active.asset_id IS NULL
              AND (
                lower(asset.canonical_path) LIKE %s
                OR lower(asset.canonical_path) LIKE %s
              )
            """,
            ("%.step", "%.stp"),
        ).fetchall()
        purged: list[str] = []
        for row in rows:
            path = Path(str(row["canonical_path"] or "")).resolve()
            try:
                path.relative_to(runtime.store_root)
            except ValueError:
                continue
            if path.suffix.lower() not in STEP_SUFFIXES:
                continue
            if path.is_file():
                path.unlink()
                purged.append(str(row["id"]))
        return {"purged": len(purged), "asset_ids": purged}


__all__ = [
    "CatalogAssetFiles",
    "content_type_for_asset",
    "discover_footprint_name_in_text",
    "discover_symbol_names_in_text",
]
