#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sqlite3
import sys
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
for candidate in (REPO_ROOT / "backend", REPO_ROOT):
    if (candidate / "app").is_dir():
        sys.path.insert(0, str(candidate))
        break

ComponentCatalogService: Any = None
_discover_footprint_name_in_text: Any = None
_sanitize_name: Any = None
_utc_now_iso: Any = None


def _load_catalog_runtime() -> None:
    global ComponentCatalogService
    global _discover_footprint_name_in_text
    global _sanitize_name
    global _utc_now_iso

    try:
        from app.services.component_catalog_service_sqlite import (  # noqa: PLC0415
            ComponentCatalogService as LoadedComponentCatalogService,
            _discover_footprint_name_in_text as loaded_discover_footprint_name,
            _sanitize_name as loaded_sanitize_name,
            _utc_now_iso as loaded_utc_now_iso,
        )
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Backend Python dependencies are not available. Run this with the backend virtualenv "
            "or inside the backend container."
        ) from exc

    ComponentCatalogService = LoadedComponentCatalogService
    _discover_footprint_name_in_text = loaded_discover_footprint_name
    _sanitize_name = loaded_sanitize_name
    _utc_now_iso = loaded_utc_now_iso


@dataclass
class SymbolLibrary:
    raw_library: str
    target_library: str
    path: Path
    text: str
    version: str
    generator: str
    block_items: list[tuple[str, str]]
    blocks: dict[str, str]
    aliases: dict[str, str]


@dataclass
class FootprintAsset:
    raw_library: str
    target_library: str
    target_name: str
    path: Path


@dataclass
class ImportStats:
    database_tables_seen: int = 0
    database_rows_seen: int = 0
    rows_selected: int = 0
    components_created: int = 0
    components_updated: int = 0
    components_released: int = 0
    symbol_assets_registered: int = 0
    footprint_assets_registered: int = 0
    symbol_links_created: int = 0
    footprint_links_created: int = 0
    duplicate_part_numbers: int = 0
    skipped_rows: int = 0
    missing_symbol_refs: int = 0
    missing_footprint_refs: int = 0
    ambiguous_symbol_refs: int = 0
    ambiguous_footprint_refs: int = 0
    errors: list[str] = field(default_factory=list)


CATALOG_DELETE_ORDER = (
    "asset_validation_findings",
    "asset_validation_runs",
    "asset_previews",
    "revision_assets",
    "component_revisions",
    "components",
    "assets",
    "catalog_meta",
)


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def _same_bytes(path: Path, payload: bytes) -> bool:
    return path.is_file() and path.read_bytes() == payload


def _write_or_copy(
    destination: Path, source: Path | None, payload: bytes | None, *, overwrite: bool
) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    data = payload if payload is not None else source.read_bytes() if source else b""
    if destination.exists():
        if _same_bytes(destination, data):
            return destination
        if not overwrite:
            raise ValueError(f"Canonical asset conflict at {destination}")
    if payload is not None:
        destination.write_bytes(payload)
    elif source is not None:
        shutil.copy2(source, destination)
    else:
        destination.write_bytes(data)
    return destination


def _normalize_lookup(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def _alias_values(value: str) -> list[str]:
    values = [
        value,
        _sanitize_name(value, value or "asset"),
        _normalize_lookup(value),
    ]
    seen: set[str] = set()
    aliases: list[str] = []
    for item in values:
        if item and item not in seen:
            seen.add(item)
            aliases.append(item)
    return aliases


def _add_alias(alias_map: dict[str, str | None], alias: str, target: str) -> None:
    if not alias:
        return
    existing = alias_map.get(alias)
    if existing is None and alias in alias_map:
        return
    if existing and existing != target:
        alias_map[alias] = None
        return
    alias_map[alias] = target


def _split_library_ref(value: str) -> tuple[str, str]:
    ref = (value or "").strip()
    if not ref:
        return "", ""
    if ":" in ref:
        library, name = ref.rsplit(":", 1)
        return library.strip(), name.strip()
    return "", ref


def _row_get(row: sqlite3.Row, *names: str) -> str:
    by_normalized = {str(key).lower().replace(" ", "_"): key for key in row.keys()}
    for name in names:
        if name in row.keys():
            value = row[name]
            return "" if value is None else str(value).strip()
        key = by_normalized.get(name.lower().replace(" ", "_"))
        if key:
            value = row[key]
            return "" if value is None else str(value).strip()
    return ""


def _autodiscover_database(source_root: Path) -> Path:
    preferred = [
        source_root / "CERN.sqlite",
        source_root / "library.sqlite",
        source_root / "database.sqlite",
    ]
    for candidate in preferred:
        if candidate.is_file():
            return candidate
    matches = sorted(
        path
        for pattern in ("*.sqlite", "*.sqlite3", "*.db")
        for path in source_root.glob(pattern)
        if path.is_file()
    )
    if len(matches) == 1:
        return matches[0]
    if not matches:
        raise ValueError(f"No SQLite database found in {source_root}")
    raise ValueError(
        f"Multiple SQLite databases found; pass --database explicitly: {', '.join(str(path) for path in matches)}"
    )


def _database_tables(conn: sqlite3.Connection, include_tables: set[str]) -> list[str]:
    tables = [
        str(row[0])
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
    ]
    selected: list[str] = []
    for table in tables:
        if include_tables and table not in include_tables:
            continue
        columns = {
            str(row["name"]) for row in conn.execute(f'PRAGMA table_info("{table}")')
        }
        if "Part Number" in columns and (
            "LibSymbol" in columns or "LibFootprint" in columns
        ):
            selected.append(table)
    return selected


def _build_symbol_index(service: Any, symbols_root: Path) -> dict[str, SymbolLibrary]:
    libraries: dict[str, SymbolLibrary] = {}
    for symbol_file in sorted(symbols_root.glob("*.kicad_sym")):
        raw_library = symbol_file.stem
        target_library = _sanitize_name(raw_library, "Prism_Symbols")
        text = _read_text(symbol_file)
        blocks_list = service._extract_top_level_symbol_blocks(text)  # type: ignore[attr-defined]
        version, generator = service._symbol_header(text)  # type: ignore[attr-defined]
        blocks = {name: block for name, block in blocks_list}
        aliases: dict[str, str | None] = {}
        for symbol_name in blocks:
            for alias in _alias_values(symbol_name):
                _add_alias(aliases, alias, symbol_name)
        libraries[target_library] = SymbolLibrary(
            raw_library=raw_library,
            target_library=target_library,
            path=symbol_file,
            text=text,
            version=version,
            generator=generator,
            block_items=blocks_list,
            blocks=blocks,
            aliases={key: value for key, value in aliases.items() if value},
        )
    return libraries


def _symbol_payload_from_index(library: SymbolLibrary, selected_symbol: str) -> bytes:
    base_block = library.blocks.get(selected_symbol)
    if not base_block:
        raise ValueError(
            f"Selected symbol was not found in {library.path.name}: {selected_symbol}"
        )
    escaped_name = re.escape(selected_symbol)
    unit_pattern = re.compile(rf"^{escaped_name}_\d+_\d+$")
    unit_blocks = [
        block for name, block in library.block_items if unit_pattern.match(name)
    ]
    all_blocks_text = "\n  ".join([base_block] + unit_blocks)
    return (
        f"(kicad_symbol_lib (version {library.version}) (generator {library.generator})\n"
        f"  {all_blocks_text}\n"
        f")\n"
    ).encode("utf-8")


def _build_footprint_index(
    footprints_root: Path,
) -> dict[str, dict[str, FootprintAsset | None]]:
    index: dict[str, dict[str, FootprintAsset | None]] = {}
    for footprint_file in sorted(footprints_root.rglob("*.kicad_mod")):
        pretty_dir = next(
            (
                parent
                for parent in [footprint_file.parent, *footprint_file.parents]
                if parent.suffix.lower() == ".pretty"
            ),
            None,
        )
        if not pretty_dir:
            continue
        raw_library = pretty_dir.name.removesuffix(".pretty")
        target_library = _sanitize_name(raw_library, "Prism_Footprints")
        text = _read_text(footprint_file)
        target_name = _discover_footprint_name_in_text(text) or footprint_file.stem
        asset = FootprintAsset(
            raw_library=raw_library,
            target_library=target_library,
            target_name=target_name,
            path=footprint_file,
        )
        aliases = index.setdefault(target_library, {})
        for alias in [*_alias_values(target_name), *_alias_values(footprint_file.stem)]:
            existing = aliases.get(alias)
            if existing is None and alias in aliases:
                continue
            if existing and existing.path != asset.path:
                aliases[alias] = None
            else:
                aliases[alias] = asset
    return index


def _resolve_symbol(
    libraries: dict[str, SymbolLibrary],
    raw_library: str,
    raw_name: str,
) -> tuple[SymbolLibrary | None, str, str]:
    if not raw_library:
        matches: list[tuple[SymbolLibrary, str]] = []
        for library in libraries.values():
            for alias in _alias_values(raw_name):
                target = library.aliases.get(alias)
                if target:
                    matches.append((library, target))
                    break
        if len(matches) == 1:
            return matches[0][0], matches[0][1], ""
        if len(matches) > 1:
            return None, "", "ambiguous"
        return None, "", "missing_symbol"

    target_library = _sanitize_name(raw_library, "Prism_Symbols")
    library = libraries.get(target_library)
    if not library:
        return None, "", "missing_library"
    for alias in _alias_values(raw_name):
        target = library.aliases.get(alias)
        if target:
            return library, target, ""
    return library, "", "missing_symbol"


def _resolve_footprint(
    index: dict[str, dict[str, FootprintAsset | None]],
    raw_library: str,
    raw_name: str,
) -> tuple[FootprintAsset | None, str]:
    if not raw_library:
        matches: list[FootprintAsset] = []
        ambiguous = False
        for aliases in index.values():
            for alias in _alias_values(raw_name):
                if alias not in aliases:
                    continue
                asset = aliases[alias]
                if asset:
                    matches.append(asset)
                else:
                    ambiguous = True
                break
        unique = {asset.path: asset for asset in matches}
        if len(unique) == 1:
            return next(iter(unique.values())), ""
        if len(unique) > 1 or ambiguous:
            return None, "ambiguous"
        return None, "missing_footprint"

    target_library = _sanitize_name(raw_library, "Prism_Footprints")
    aliases = index.get(target_library)
    if not aliases:
        return None, "missing_library"
    ambiguous = False
    for alias in _alias_values(raw_name):
        if alias not in aliases:
            continue
        asset = aliases[alias]
        if asset:
            return asset, ""
        ambiguous = True
    return None, "ambiguous" if ambiguous else "missing_footprint"


def _metadata_from_row(
    row: sqlite3.Row, table: str, import_name: str
) -> dict[str, str]:
    value = _row_get(row, "Value", "Comment") or import_name
    description = (
        _row_get(row, "Part Description", "Description", "Comment") or import_name
    )
    manufacturer = _row_get(row, "Manufacturer") or "TBD"
    datasheet = _row_get(row, "Datasheet", "HelpURL") or "TBD"
    category = _row_get(row, "Database Table Name") or table
    return {
        "value": value,
        "description": description,
        "datasheet_url": datasheet,
        "manufacturer": manufacturer,
        "mpn": import_name,
        "category": category,
        "package_name": _row_get(row, "PackageDescription", "Case"),
        "vendor": "",
        "vendor_part_number": "",
        "mass_g": "",
        "rqjc_c_w": "",
        "rqjc_top_c_w": "",
        "temp_max_c": "",
        "temp_min_c": "",
        "power_dissipation_w": _row_get(row, "Power"),
        "rate": "",
        "sap_code": _row_get(row, "SCEM"),
    }


def _runtime_path(
    local_path: Path, local_store_root: Path, runtime_store_root: Path | None
) -> str:
    if runtime_store_root is None:
        return str(local_path.resolve())
    relative = local_path.resolve().relative_to(local_store_root.resolve())
    return str((runtime_store_root / relative).as_posix())


def _register_asset(
    service: Any,
    conn: sqlite3.Connection,
    *,
    asset_type: str,
    canonical_path: Path,
    target_library: str,
    target_name: str,
    source_group: str,
    runtime_store_root: Path | None,
) -> dict[str, Any]:
    local_path = canonical_path.resolve()
    asset = service._register_asset(  # type: ignore[attr-defined]
        conn,
        asset_type=asset_type,
        canonical_path=local_path,
        target_library=target_library,
        target_name=target_name,
        source_group=source_group,
    )
    runtime_canonical_path = _runtime_path(
        local_path, service.store_root, runtime_store_root
    )
    if str(asset["canonical_path"]) != runtime_canonical_path:
        conn.execute(
            "UPDATE assets SET canonical_path = ? WHERE id = ?",
            (runtime_canonical_path, asset["id"]),
        )
        asset = dict(asset)
        asset["canonical_path"] = runtime_canonical_path
    return asset


def _find_existing_component(conn: sqlite3.Connection, mpn: str) -> str | None:
    row = conn.execute(
        """
        SELECT c.id
        FROM components c
        JOIN component_revisions cr ON cr.id = c.current_revision_id
        WHERE cr.mpn = ?
        LIMIT 1
        """,
        (mpn,),
    ).fetchone()
    return str(row["id"]) if row else None


def _clear_catalog(conn: sqlite3.Connection) -> None:
    conn.execute("PRAGMA foreign_keys = OFF")
    for table in CATALOG_DELETE_ORDER:
        conn.execute(f'DELETE FROM "{table}"')
    conn.execute("PRAGMA foreign_keys = ON")


def _rebuild_fts(conn: sqlite3.Connection) -> None:
    conn.execute(
        "INSERT INTO component_revisions_fts(component_revisions_fts) VALUES ('rebuild')"
    )
    signature_row = conn.execute(
        "SELECT COUNT(1) AS count, COALESCE(MAX(updated_at), '') AS updated_at FROM component_revisions"
    ).fetchone()
    signature = f"{int(signature_row['count'])}:{signature_row['updated_at']}"
    conn.execute(
        """
        INSERT INTO catalog_meta(key, value)
        VALUES ('component_revisions_fts_signature', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (signature,),
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Import a KiCad database library into Prism. The source root should contain a SQLite "
            "database with component rows plus KiCad symbol and footprint library folders."
        )
    )
    parser.add_argument(
        "source_root",
        type=Path,
        help="Library root, for example a CERN library checkout.",
    )
    parser.add_argument(
        "--database",
        type=Path,
        default=None,
        help="Source SQLite database. Defaults to autodiscovery in source_root.",
    )
    parser.add_argument(
        "--symbols-dir",
        default="SchLib",
        help="Symbol library directory name under source_root.",
    )
    parser.add_argument(
        "--footprints-dir",
        default="PcbLib",
        help="Footprint library directory name under source_root.",
    )
    parser.add_argument(
        "--include-table",
        action="append",
        default=[],
        help="Import only this source table. Can be repeated.",
    )
    parser.add_argument(
        "--store-root",
        type=Path,
        default=None,
        help="Local Prism canonical component store root.",
    )
    parser.add_argument(
        "--runtime-store-root",
        type=Path,
        default=None,
        help="Canonical store root to write into DB paths, e.g. /app/projects/.kicad-prism/components.",
    )
    parser.add_argument(
        "--database-url",
        default=os.environ.get("CATALOG_SQLITE_PATH", ""),
        help="Target Prism catalog SQLite path.",
    )
    parser.add_argument(
        "--replace-catalog",
        action="store_true",
        help="Delete existing Prism catalog component/asset rows before importing.",
    )
    parser.add_argument(
        "--overwrite-assets",
        action="store_true",
        help="Overwrite canonical asset files when content differs.",
    )
    parser.add_argument(
        "--allow-missing-assets",
        action="store_true",
        help="Create metadata rows even when symbol or footprint refs cannot be resolved.",
    )
    parser.add_argument(
        "--no-release",
        action="store_true",
        help="Keep imported rows open instead of directly marking complete rows released.",
    )
    parser.add_argument(
        "--generate-previews",
        action="store_true",
        help="Generate symbol and footprint SVG previews. This can be slow for large libraries.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Resolve rows and report counts without writing files or DB rows.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero when any row fails or is skipped.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Import at most this many database rows after filtering.",
    )
    parser.add_argument(
        "--report-json", type=Path, default=None, help="Optional JSON report path."
    )
    return parser


def main() -> int:
    args = _build_parser().parse_args()
    source_root = args.source_root.expanduser().resolve()
    if not source_root.is_dir():
        print(f"Source root does not exist: {source_root}", file=sys.stderr)
        return 2

    try:
        _load_catalog_runtime()
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    database_path = (
        args.database.expanduser().resolve()
        if args.database
        else _autodiscover_database(source_root)
    )
    symbols_root = (source_root / args.symbols_dir).resolve()
    footprints_root = (source_root / args.footprints_dir).resolve()
    if not database_path.is_file():
        print(f"Source database does not exist: {database_path}", file=sys.stderr)
        return 2
    if not symbols_root.is_dir():
        print(f"Symbol directory does not exist: {symbols_root}", file=sys.stderr)
        return 2
    if not footprints_root.is_dir():
        print(f"Footprint directory does not exist: {footprints_root}", file=sys.stderr)
        return 2

    service = ComponentCatalogService(
        store_root=args.store_root, database_url=args.database_url or None
    )
    stats = ImportStats()
    runtime_store_root = args.runtime_store_root
    include_tables = set(args.include_table or [])

    print(f"Indexing symbol libraries from {symbols_root} ...")
    symbol_libraries = _build_symbol_index(service, symbols_root)
    print(f"Indexing footprint libraries from {footprints_root} ...")
    footprint_index = _build_footprint_index(footprints_root)

    part_occurrences: dict[str, int] = {}
    seen_symbol_asset_ids: set[str] = set()
    seen_footprint_asset_ids: set[str] = set()
    symbol_asset_cache: dict[tuple[str, str], dict[str, Any]] = {}
    footprint_asset_cache: dict[tuple[str, str], dict[str, Any]] = {}
    fatal_error = False

    source_conn = sqlite3.connect(database_path)
    source_conn.row_factory = sqlite3.Row
    tables = _database_tables(source_conn, include_tables)
    stats.database_tables_seen = len(tables)

    target_conn_context = None
    target_conn = None
    try:
        if not args.dry_run:
            service.initialize()
            target_conn_context = service._connect()  # type: ignore[attr-defined]
            target_conn = target_conn_context.__enter__()
            if args.replace_catalog:
                print("Clearing existing Prism catalog rows ...")
                _clear_catalog(target_conn)

        for table in tables:
            rows = source_conn.execute(f'SELECT * FROM "{table}"')
            for row in rows:
                stats.database_rows_seen += 1
                if args.limit and stats.rows_selected >= args.limit:
                    break

                part_number = _row_get(row, "Part Number", "Part Number Nocolon")
                symbol_ref = _row_get(row, "LibSymbol")
                footprint_ref = _row_get(row, "LibFootprint")
                if not part_number:
                    stats.skipped_rows += 1
                    stats.errors.append(f"{table}: row without Part Number")
                    continue

                occurrence = part_occurrences.get(part_number, 0) + 1
                part_occurrences[part_number] = occurrence
                import_name = (
                    part_number
                    if occurrence == 1
                    else f"{part_number}__ALT{occurrence:03d}"
                )
                if occurrence > 1:
                    stats.duplicate_part_numbers += 1

                symbol_library_ref, symbol_name_ref = _split_library_ref(symbol_ref)
                footprint_library_ref, footprint_name_ref = _split_library_ref(
                    footprint_ref
                )
                symbol_library, symbol_name, symbol_error = _resolve_symbol(
                    symbol_libraries, symbol_library_ref, symbol_name_ref
                )
                footprint_asset, footprint_error = _resolve_footprint(
                    footprint_index, footprint_library_ref, footprint_name_ref
                )

                if symbol_error == "ambiguous":
                    stats.ambiguous_symbol_refs += 1
                    stats.errors.append(
                        f"{table}:{part_number}: ambiguous symbol '{symbol_ref}'"
                    )
                elif symbol_error:
                    stats.missing_symbol_refs += 1
                    stats.errors.append(
                        f"{table}:{part_number}: unresolved symbol '{symbol_ref}' ({symbol_error})"
                    )
                if footprint_error == "ambiguous":
                    stats.ambiguous_footprint_refs += 1
                    stats.errors.append(
                        f"{table}:{part_number}: ambiguous footprint '{footprint_ref}'"
                    )
                elif footprint_error:
                    stats.missing_footprint_refs += 1
                    stats.errors.append(
                        f"{table}:{part_number}: unresolved footprint '{footprint_ref}' ({footprint_error})"
                    )

                if (symbol_error or footprint_error) and not args.allow_missing_assets:
                    stats.skipped_rows += 1
                    continue

                stats.rows_selected += 1
                if args.dry_run:
                    continue
                assert target_conn is not None

                try:
                    metadata = service._normalize_metadata(
                        _metadata_from_row(row, table, import_name)
                    )  # type: ignore[attr-defined]
                    existing_component_id = _find_existing_component(
                        target_conn, import_name
                    )
                    if existing_component_id:
                        component_id, revision_id = (
                            service._upsert_component_metadata_row(  # type: ignore[attr-defined]
                                target_conn,
                                component_id=existing_component_id,
                                metadata=metadata,
                                now=_utc_now_iso(),
                                existing_component_id=existing_component_id,
                            )
                        )
                        stats.components_updated += 1
                    else:
                        component_id, revision_id = (
                            service._upsert_component_metadata_row(  # type: ignore[attr-defined]
                                target_conn,
                                component_id=str(uuid.uuid4()),
                                metadata=metadata,
                                now=_utc_now_iso(),
                                existing_component_id=None,
                            )
                        )
                        stats.components_created += 1

                    linked_symbol = False
                    linked_footprint = False
                    if symbol_library and symbol_name:
                        symbol_key = (symbol_library.target_library, symbol_name)
                        asset = symbol_asset_cache.get(symbol_key)
                        if not asset:
                            payload = _symbol_payload_from_index(
                                symbol_library, symbol_name
                            )
                            destination = service._symbol_destination(
                                symbol_library.target_library, symbol_name
                            )  # type: ignore[attr-defined]
                            canonical = _write_or_copy(
                                destination,
                                None,
                                payload,
                                overwrite=args.overwrite_assets,
                            )
                            asset = _register_asset(
                                service,
                                target_conn,
                                asset_type="symbol",
                                canonical_path=canonical,
                                target_library=symbol_library.target_library,
                                target_name=symbol_name,
                                source_group=symbol_library.path.name,
                                runtime_store_root=runtime_store_root,
                            )
                            if args.generate_previews:
                                preview_asset = dict(asset)
                                preview_asset["canonical_path"] = str(canonical)
                                service._ensure_asset_preview(
                                    target_conn, preview_asset
                                )  # type: ignore[attr-defined]
                            symbol_asset_cache[symbol_key] = asset
                        service._link_asset_to_revision(
                            target_conn, revision_id, asset, required=True
                        )  # type: ignore[attr-defined]
                        if str(asset["id"]) not in seen_symbol_asset_ids:
                            seen_symbol_asset_ids.add(str(asset["id"]))
                            stats.symbol_assets_registered += 1
                        stats.symbol_links_created += 1
                        linked_symbol = True

                    if footprint_asset:
                        footprint_key = (
                            footprint_asset.target_library,
                            footprint_asset.target_name,
                        )
                        asset = footprint_asset_cache.get(footprint_key)
                        if not asset:
                            destination = service._footprint_destination(
                                footprint_asset.target_library,
                                footprint_asset.target_name,
                            )  # type: ignore[attr-defined]
                            canonical = _write_or_copy(
                                destination,
                                footprint_asset.path,
                                None,
                                overwrite=args.overwrite_assets,
                            )
                            asset = _register_asset(
                                service,
                                target_conn,
                                asset_type="footprint",
                                canonical_path=canonical,
                                target_library=footprint_asset.target_library,
                                target_name=footprint_asset.target_name,
                                source_group=footprint_asset.path.parent.name,
                                runtime_store_root=runtime_store_root,
                            )
                            if args.generate_previews:
                                preview_asset = dict(asset)
                                preview_asset["canonical_path"] = str(canonical)
                                service._ensure_asset_preview(
                                    target_conn, preview_asset
                                )  # type: ignore[attr-defined]
                            footprint_asset_cache[footprint_key] = asset
                        service._link_asset_to_revision(
                            target_conn, revision_id, asset, required=True
                        )  # type: ignore[attr-defined]
                        if str(asset["id"]) not in seen_footprint_asset_ids:
                            seen_footprint_asset_ids.add(str(asset["id"]))
                            stats.footprint_assets_registered += 1
                        stats.footprint_links_created += 1
                        linked_footprint = True

                    if not args.no_release and linked_symbol and linked_footprint:
                        now = _utc_now_iso()
                        target_conn.execute(
                            "UPDATE component_revisions SET release_status = 'released', updated_at = ? WHERE id = ?",
                            (now, revision_id),
                        )
                        target_conn.execute(
                            "UPDATE components SET released_revision_id = ?, updated_at = ? WHERE id = ?",
                            (revision_id, now, component_id),
                        )
                        stats.components_released += 1
                except Exception as exc:  # noqa: BLE001
                    stats.skipped_rows += 1
                    stats.errors.append(f"{table}:{part_number}: {exc}")

            if args.limit and stats.rows_selected >= args.limit:
                break

        if target_conn is not None:
            _rebuild_fts(target_conn)
            target_conn.commit()
    except Exception as exc:  # noqa: BLE001
        fatal_error = True
        if target_conn is not None:
            target_conn.rollback()
        stats.errors.append(str(exc))
    finally:
        source_conn.close()
        if target_conn_context is not None:
            target_conn_context.__exit__(None, None, None)

    report = asdict(stats)
    report.update(
        {
            "source_root": str(source_root),
            "source_database": str(database_path),
            "symbols_root": str(symbols_root),
            "footprints_root": str(footprints_root),
            "target_database": str(service.db_path),
            "store_root": str(service.store_root),
            "runtime_store_root": str(runtime_store_root) if runtime_store_root else "",
            "dry_run": bool(args.dry_run),
            "replace_catalog": bool(args.replace_catalog),
            "release_imported": bool(not args.no_release),
        }
    )

    if args.report_json:
        args.report_json.parent.mkdir(parents=True, exist_ok=True)
        args.report_json.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(json.dumps(report, indent=2))
    return (
        1
        if fatal_error or (args.strict and (stats.errors or stats.skipped_rows))
        else 0
    )


if __name__ == "__main__":
    raise SystemExit(main())
