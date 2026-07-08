#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
for candidate in (REPO_ROOT / "backend", REPO_ROOT):
    if (candidate / "app").is_dir():
        sys.path.insert(0, str(candidate))
        break

ComponentCatalogService: Any = None
_discover_footprint_name_in_text: Callable[[str], str]
_discover_symbol_names_in_text: Callable[[str], list[str]]
_sanitize_name: Callable[[str, str], str]


STEP_EXTENSIONS = {".step", ".stp", ".wrl"}
SPICE_EXTENSIONS = {".lib", ".mod", ".mdl", ".cir", ".sub", ".subckt", ".spice"}

# KiCad environment variable placeholders used in 3D model paths
_KICAD_3D_VARS = {
    "${KICAD6_3DMODEL_DIR}",
    "${KICAD7_3DMODEL_DIR}",
    "${KICAD8_3DMODEL_DIR}",
    "${KICAD9_3DMODEL_DIR}",
    "${KISYS3DMOD}",
    "${KICAD_3RD_PARTY}",
    "${KICAD3DLIBS}",
}


def _load_catalog_runtime() -> None:
    global ComponentCatalogService
    global _discover_footprint_name_in_text
    global _discover_symbol_names_in_text
    global _sanitize_name

    try:
        from app.services.component_catalog_service_sqlite import (  # noqa: PLC0415
            ComponentCatalogService as LoadedComponentCatalogService,
            _discover_footprint_name_in_text as loaded_discover_footprint_name,
            _discover_symbol_names_in_text as loaded_discover_symbol_names,
            _sanitize_name as loaded_sanitize_name,
        )
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Backend Python dependencies are not available. Run this with the backend virtualenv "
            "or inside the backend container, for example: "
            "KiCAD-Prism-remote-datasource/backend/.venv/bin/python "
            "KiCAD-Prism-remote-datasource/scripts/import_kicad_library_assets.py --help"
        ) from exc

    ComponentCatalogService = LoadedComponentCatalogService
    _discover_footprint_name_in_text = loaded_discover_footprint_name
    _discover_symbol_names_in_text = loaded_discover_symbol_names
    _sanitize_name = loaded_sanitize_name


@dataclass
class ImportStats:
    symbol_libraries_seen: int = 0
    symbols_written: int = 0
    footprints_written: int = 0
    models_written: int = 0
    spice_written: int = 0
    component_csv_rows: int = 0
    component_csv_required_placeholders: int = 0
    assets_indexed: int = 0
    previews_attempted: int = 0
    reused_existing_files: int = 0
    skipped_files: int = 0
    errors: list[str] = field(default_factory=list)


def _merge_stats(target: ImportStats, source: ImportStats) -> None:
    target.symbol_libraries_seen += source.symbol_libraries_seen
    target.symbols_written += source.symbols_written
    target.footprints_written += source.footprints_written
    target.models_written += source.models_written
    target.spice_written += source.spice_written
    target.component_csv_rows += source.component_csv_rows
    target.component_csv_required_placeholders += (
        source.component_csv_required_placeholders
    )
    target.assets_indexed += source.assets_indexed
    target.previews_attempted += source.previews_attempted
    target.reused_existing_files += source.reused_existing_files
    target.skipped_files += source.skipped_files
    target.errors.extend(source.errors)


@dataclass
class ComponentCsvRow:
    value: str
    datasheet: str
    description: str
    manufacturer: str
    manufacturer_part_number: str
    category: str
    package_name: str = ""
    vendor: str = ""
    vendor_part_number: str = ""
    mass_g: str = ""
    rqjc_c_w: str = ""
    rqjc_top_c_w: str = ""
    temp_max_c: str = ""
    temp_min_c: str = ""
    power_dissipation_w: str = ""
    rate: str = ""
    sap_code: str = ""
    symbol_file_path: str = ""
    symbol_target_library: str = ""
    symbol_target_name: str = ""
    footprint_file_path: str = ""
    footprint_target_library: str = ""
    footprint_target_name: str = ""
    model_3d_file_path: str = ""
    spice_file_path: str = ""


CSV_FIELDNAMES = [
    "value",
    "datasheet",
    "description",
    "manufacturer",
    "manufacturer_part_number",
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
    "symbol_file_path",
    "symbol_target_library",
    "symbol_target_name",
    "footprint_file_path",
    "footprint_target_library",
    "footprint_target_name",
    "model_3d_file_path",
    "spice_file_path",
]


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def _same_bytes(path: Path, payload: bytes) -> bool:
    return path.is_file() and path.read_bytes() == payload


def _write_canonical_file(
    destination: Path,
    payload: bytes,
    *,
    dry_run: bool,
    overwrite: bool,
    stats: ImportStats,
) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if _same_bytes(destination, payload):
            stats.reused_existing_files += 1
            return destination
        if not overwrite:
            raise ValueError(f"Canonical asset conflict at {destination}")
    if not dry_run:
        destination.write_bytes(payload)
    return destination


def _copy_canonical_file(
    source: Path,
    destination: Path,
    *,
    dry_run: bool,
    overwrite: bool,
    stats: ImportStats,
) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if source.read_bytes() == destination.read_bytes():
            stats.reused_existing_files += 1
            return destination
        if not overwrite:
            raise ValueError(f"Canonical asset conflict at {destination}")
    if not dry_run:
        shutil.copy2(source, destination)
    return destination


def _unique_destination(destination: Path) -> Path:
    if not destination.exists():
        return destination
    stem = destination.stem
    suffix = destination.suffix
    for index in range(2, 10_000):
        candidate = destination.with_name(f"{stem}_{index}{suffix}")
        if not candidate.exists():
            return candidate
    raise ValueError(f"Could not find an unused destination near {destination}")


def _library_from_symbol_file(symbol_file: Path) -> str:
    return _sanitize_name(symbol_file.stem, "Prism_Symbols")


def _library_from_footprint_file(footprint_file: Path, footprints_root: Path) -> str:
    for parent in [footprint_file.parent, *footprint_file.parents]:
        if parent == footprints_root.parent:
            break
        if parent.suffix.lower() == ".pretty":
            return _sanitize_name(
                parent.name.removesuffix(".pretty"), "Prism_Footprints"
            )
    return _sanitize_name(
        footprint_file.parent.name.removesuffix(".pretty"), "Prism_Footprints"
    )


def _relative_library_name(file_path: Path, root: Path, default: str) -> str:
    try:
        relative_parent = file_path.parent.relative_to(root)
    except ValueError:
        return _sanitize_name(file_path.parent.name, default)
    if not relative_parent.parts:
        return default
    return _sanitize_name("_".join(relative_parent.parts), default)


def _decode_symbol_property_value(value: str) -> str:
    return value.replace(r"\"", '"').replace(r"\\", "\\")


def _symbol_properties(symbol_block: str) -> dict[str, str]:
    properties: dict[str, str] = {}
    for match in re_finditer_property(symbol_block):
        properties[match[0]] = _decode_symbol_property_value(match[1])
    return properties


def re_finditer_property(symbol_block: str) -> list[tuple[str, str]]:
    import re

    pattern = re.compile(r'\(property\s+"((?:\\.|[^"])*)"\s+"((?:\\.|[^"])*)"')
    return [
        (match.group(1), match.group(2)) for match in pattern.finditer(symbol_block)
    ]


def _property_first(properties: dict[str, str], names: tuple[str, ...]) -> str:
    lowered = {
        key.lower().replace(" ", "_"): value for key, value in properties.items()
    }
    for name in names:
        if name in properties and properties[name].strip():
            return properties[name].strip()
        normalized = name.lower().replace(" ", "_")
        if lowered.get(normalized, "").strip():
            return lowered[normalized].strip()
    return ""


def _infer_category(library: str) -> str:
    category = library
    for prefix in ("Prism_",):
        if category.startswith(prefix):
            category = category[len(prefix) :]
    return category.replace("_", " ").strip() or library


def _csv_path(
    path: Path, *, csv_store_root: Path | None, service_store_root: Path
) -> str:
    if not csv_store_root:
        return str(path.resolve())
    relative = path.resolve().relative_to(service_store_root.resolve())
    return str((csv_store_root / relative).as_posix())


def _fill_required(value: str, fallback: str, stats: ImportStats) -> str:
    if value.strip():
        return value.strip()
    stats.component_csv_required_placeholders += 1
    return fallback


def _component_row_from_symbol(
    *,
    symbol_name: str,
    library: str,
    symbol_block: str,
    symbol_path: Path,
    csv_store_root: Path | None,
    service_store_root: Path,
    stats: ImportStats,
) -> tuple[ComponentCsvRow, str]:
    properties = _symbol_properties(symbol_block)
    value = _property_first(properties, ("Value",)) or symbol_name
    footprint_ref = _property_first(properties, ("Footprint", "ki_fp_filters"))
    manufacturer = _property_first(
        properties, ("Manufacturer", "Manufacturer_Name", "Manufacturer Name")
    )
    mpn = _property_first(
        properties,
        (
            "Manufacturer Part Number",
            "Manufacturer_Part_Number",
            "ManufacturerPartNumber",
            "MPN",
            "Part Number",
        ),
    )
    vendor_part = _property_first(
        properties, ("Mouser Part Number", "Arrow Part Number", "Vendor Part Number")
    )
    vendor = (
        "Mouser"
        if properties.get("Mouser Part Number")
        else ("Arrow" if properties.get("Arrow Part Number") else "")
    )
    row = ComponentCsvRow(
        value=_fill_required(value, symbol_name, stats),
        datasheet=_fill_required(
            _property_first(properties, ("Datasheet",)), "TBD", stats
        ),
        description=_fill_required(
            _property_first(properties, ("Description",)), value or symbol_name, stats
        ),
        manufacturer=_fill_required(manufacturer, "TBD", stats),
        manufacturer_part_number=_fill_required(mpn, f"{library}:{symbol_name}", stats),
        category=_infer_category(library),
        package_name="",
        vendor=vendor,
        vendor_part_number=vendor_part,
        symbol_file_path=_csv_path(
            symbol_path,
            csv_store_root=csv_store_root,
            service_store_root=service_store_root,
        ),
        symbol_target_library=library,
        symbol_target_name=symbol_name,
    )
    return row, footprint_ref


def _single_symbol_payload_from_parsed_blocks(
    service: ComponentCatalogService,
    text: str,
    blocks: list[tuple[str, str]],
    selected_symbol: str,
) -> bytes:
    blocks_dict = dict(blocks)
    base_block = blocks_dict.get(selected_symbol)
    if not base_block:
        raise ValueError("Selected symbol was not found in the library")

    escaped_name = re.escape(selected_symbol)
    unit_pattern = re.compile(rf"^{escaped_name}_\d+_\d+$")
    unit_blocks = [block for name, block in blocks if unit_pattern.match(name)]
    version, generator = service._symbol_header(text)  # type: ignore[attr-defined]
    all_blocks_text = "\n  ".join([base_block] + unit_blocks)
    return f"(kicad_symbol_lib (version {version}) (generator {generator})\n  {all_blocks_text}\n)\n".encode(
        "utf-8"
    )


def _register_asset(
    service: ComponentCatalogService,
    conn: Any | None,
    *,
    asset_type: str,
    canonical_path: Path,
    target_library: str,
    target_name: str,
    source_group: str = "",
    generate_previews: bool,
    stats: ImportStats,
) -> None:
    if conn is None:
        return
    asset = service._register_asset(  # type: ignore[attr-defined]
        conn,
        asset_type=asset_type,
        canonical_path=canonical_path,
        target_library=target_library,
        target_name=target_name,
        source_group=source_group,
    )
    stats.assets_indexed += 1
    if generate_previews and asset_type in {"symbol", "footprint"}:
        stats.previews_attempted += 1
        service._ensure_asset_preview(conn, asset)  # type: ignore[attr-defined]


def _import_symbols(
    source_root: Path,
    service: ComponentCatalogService,
    conn: Any | None,
    *,
    dry_run: bool,
    overwrite: bool,
    skip_upgrade: bool,
    generate_previews: bool,
    csv_store_root: Path | None,
    component_rows: list[tuple[ComponentCsvRow, str]],
    stats: ImportStats,
    jobs: int = 1,
) -> None:
    symbols_root = source_root / "symbols"
    if not symbols_root.is_dir():
        return

    symbol_files = sorted(symbols_root.rglob("*.kicad_sym"))

    def process_symbol_file(
        symbol_file: Path, worker_conn: Any | None
    ) -> tuple[ImportStats, list[tuple[ComponentCsvRow, str]]]:
        local_stats = ImportStats(symbol_libraries_seen=1)
        local_rows: list[tuple[ComponentCsvRow, str]] = []
        library = _library_from_symbol_file(symbol_file)
        print(f"Processing symbol library: {symbol_file.name} ({library}) ...")
        try:
            payload = symbol_file.read_bytes()
            if skip_upgrade:
                normalized = payload
            else:
                normalized = service._normalize_symbol_upload(symbol_file.name, payload)  # type: ignore[attr-defined]
            text = normalized.decode("utf-8", errors="ignore")
            symbols = _discover_symbol_names_in_text(text)
            parsed_blocks = service._extract_top_level_symbol_blocks(text)  # type: ignore[attr-defined]
            blocks = dict(parsed_blocks)
            if not symbols:
                local_stats.skipped_files += 1
                local_stats.errors.append(f"No symbols found in {symbol_file}")
                return local_stats, local_rows

            for symbol_name in symbols:
                try:
                    print(f"  -> Extracting symbol: {symbol_name}")
                    canonical_payload = _single_symbol_payload_from_parsed_blocks(
                        service, text, parsed_blocks, symbol_name
                    )
                    destination = service._symbol_destination(library, symbol_name)  # type: ignore[attr-defined]
                    if (
                        destination.exists()
                        and not _same_bytes(destination, canonical_payload)
                        and not overwrite
                    ):
                        destination = _unique_destination(destination)
                    canonical = _write_canonical_file(
                        destination,
                        canonical_payload,
                        dry_run=dry_run,
                        overwrite=overwrite,
                        stats=local_stats,
                    )
                    local_stats.symbols_written += 1
                    if symbol_name in blocks:
                        local_rows.append(
                            _component_row_from_symbol(
                                symbol_name=symbol_name,
                                library=library,
                                symbol_block=blocks[symbol_name],
                                symbol_path=canonical,
                                csv_store_root=csv_store_root,
                                service_store_root=service.store_root,
                                stats=local_stats,
                            )
                        )
                    _register_asset(
                        service,
                        worker_conn,
                        asset_type="symbol",
                        canonical_path=canonical,
                        target_library=library,
                        target_name=symbol_name,
                        source_group=symbol_file.name,
                        generate_previews=generate_previews,
                        stats=local_stats,
                    )
                except Exception as exc:  # noqa: BLE001
                    local_stats.errors.append(f"{symbol_file}::{symbol_name}: {exc}")
        except Exception as exc:  # noqa: BLE001
            local_stats.errors.append(f"{symbol_file}: {exc}")
        return local_stats, local_rows

    if jobs > 1 and conn is None:
        with ThreadPoolExecutor(max_workers=jobs) as executor:
            futures = [
                executor.submit(process_symbol_file, symbol_file, None)
                for symbol_file in symbol_files
            ]
            for future in as_completed(futures):
                local_stats, local_rows = future.result()
                _merge_stats(stats, local_stats)
                component_rows.extend(local_rows)
        component_rows.sort(
            key=lambda item: (
                item[0].category,
                item[0].manufacturer_part_number,
                item[0].symbol_target_name,
            )
        )
        return

    for symbol_file in symbol_files:
        local_stats, local_rows = process_symbol_file(symbol_file, conn)
        _merge_stats(stats, local_stats)
        component_rows.extend(local_rows)


def _import_footprints(
    source_root: Path,
    service: ComponentCatalogService,
    conn: Any | None,
    *,
    dry_run: bool,
    overwrite: bool,
    generate_previews: bool,
    stats: ImportStats,
    jobs: int = 1,
) -> dict[str, tuple[Path, str, str]]:
    footprint_index: dict[str, tuple[Path, str, str]] = {}
    footprints_root = source_root / "footprints"
    if not footprints_root.is_dir():
        return footprint_index

    footprint_files = sorted(footprints_root.rglob("*.kicad_mod"))

    def process_footprint_file(
        footprint_file: Path, worker_conn: Any | None
    ) -> tuple[ImportStats, tuple[str, tuple[Path, str, str]] | None]:
        local_stats = ImportStats()
        try:
            print(f"Processing footprint: {footprint_file.name} ...")
            library = _library_from_footprint_file(footprint_file, footprints_root)
            text = _read_text(footprint_file)
            footprint_name = (
                _discover_footprint_name_in_text(text) or footprint_file.stem
            )
            destination = service._footprint_destination(library, footprint_name)  # type: ignore[attr-defined]
            if (
                destination.exists()
                and footprint_file.read_bytes() != destination.read_bytes()
                and not overwrite
            ):
                destination = _unique_destination(destination)
            canonical = _copy_canonical_file(
                footprint_file,
                destination,
                dry_run=dry_run,
                overwrite=overwrite,
                stats=local_stats,
            )
            local_stats.footprints_written += 1
            _register_asset(
                service,
                worker_conn,
                asset_type="footprint",
                canonical_path=canonical,
                target_library=library,
                target_name=footprint_name,
                generate_previews=generate_previews,
                stats=local_stats,
            )
            return local_stats, (footprint_name, (canonical, library, footprint_name))
        except Exception as exc:  # noqa: BLE001
            local_stats.errors.append(f"{footprint_file}: {exc}")
            return local_stats, None

    if jobs > 1 and conn is None:
        with ThreadPoolExecutor(max_workers=jobs) as executor:
            futures = [
                executor.submit(process_footprint_file, footprint_file, None)
                for footprint_file in footprint_files
            ]
            for future in as_completed(futures):
                local_stats, indexed = future.result()
                _merge_stats(stats, local_stats)
                if indexed is not None:
                    footprint_index.setdefault(indexed[0], indexed[1])
        return footprint_index

    for footprint_file in footprint_files:
        local_stats, indexed = process_footprint_file(footprint_file, conn)
        _merge_stats(stats, local_stats)
        if indexed is not None:
            footprint_index.setdefault(indexed[0], indexed[1])
    return footprint_index


def _resolve_footprint_reference(
    footprint_ref: str,
    footprint_index: dict[str, tuple[Path, str, str]],
) -> tuple[Path, str, str] | None:
    ref = (footprint_ref or "").strip()
    if not ref:
        return None
    if ":" in ref:
        library, name = ref.rsplit(":", 1)
        found = footprint_index.get(name)
        if found and found[1] == library:
            return found
        if found:
            return found
        return None
    return footprint_index.get(ref)


def _write_component_csv(
    output_path: Path,
    rows_with_footprints: list[tuple[ComponentCsvRow, str]],
    footprint_index: dict[str, tuple[Path, str, str]],
    *,
    csv_store_root: Path | None,
    service_store_root: Path,
    stats: ImportStats,
) -> None:
    print(f"Generating component metadata CSV at {output_path} ...")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDNAMES)
        writer.writeheader()
        for row, footprint_ref in rows_with_footprints:
            resolved = _resolve_footprint_reference(footprint_ref, footprint_index)
            if resolved:
                footprint_path, footprint_library, footprint_name = resolved
                row.footprint_file_path = _csv_path(
                    footprint_path,
                    csv_store_root=csv_store_root,
                    service_store_root=service_store_root,
                )
                row.footprint_target_library = footprint_library
                row.footprint_target_name = footprint_name
            writer.writerow(asdict(row))
            stats.component_csv_rows += 1


def _discover_3d_search_dirs(source_root: Path) -> list[Path]:
    """Return all directories under source_root that may contain 3D model files.

    Looks for:
    - A ``3D/`` or ``3d/`` subdirectory at the root (standard Prism layout)
    - Any ``*.3dshapes`` directory anywhere in the tree (EasyEDA / Snapeda exports)
    - Any directory whose name starts with ``3rd`` (e.g. "3rd Party Libraries")
    """
    found: list[Path] = []
    # Standard layout
    for name in ("3D", "3d"):
        candidate = source_root / name
        if candidate.is_dir():
            found.append(candidate)
    # Walk the whole tree looking for .3dshapes and 3rd* directories
    try:
        for dirpath in source_root.rglob("*"):
            if not dirpath.is_dir():
                continue
            n = dirpath.name
            if n.endswith(".3dshapes") or n.lower().startswith("3rd"):
                found.append(dirpath)
    except PermissionError:
        pass
    return found


def _build_3d_model_index(search_dirs: list[Path]) -> dict[str, Path]:
    """Return a filename → absolute Path mapping for all 3D model files found."""
    index: dict[str, Path] = {}
    for d in search_dirs:
        try:
            for f in d.rglob("*"):
                if f.is_file() and f.suffix.lower() in STEP_EXTENSIONS:
                    # Index by bare filename; last writer wins (prefer first found)
                    if f.name not in index:
                        index[f.name] = f
        except PermissionError:
            pass
    return index


def _extract_3d_refs_from_footprint(footprint_text: str) -> list[str]:
    """Return the raw model path strings referenced in a .kicad_mod file."""
    import re as _re

    return _re.findall(r'\(model\s+"([^"]+)"', footprint_text) + _re.findall(
        r'\(model\s+([^\s")\n]+)', footprint_text
    )


def _resolve_3d_ref(ref: str, model_index: dict[str, Path]) -> Path | None:
    """Try to resolve a KiCad 3D model reference to a real file.

    Strips any ``${VAR}`` prefix and resolves the remaining relative path
    against the filename index built from the source tree.
    """
    ref = ref.strip().replace("\\", "/")
    # Strip leading ${VAR}/ placeholder
    for var in _KICAD_3D_VARS:
        if ref.startswith(var):
            ref = ref[len(var) :].lstrip("/")
            break
    if not ref:
        return None
    # Try the exact relative path stem by basename
    basename = ref.split("/")[-1]
    return model_index.get(basename)


def _import_auxiliary_files(
    source_root: Path,
    service: ComponentCatalogService,
    conn: Any | None,
    *,
    dry_run: bool,
    overwrite: bool,
    stats: ImportStats,
) -> None:
    # ── 3D models ──────────────────────────────────────────────────────────
    search_dirs = _discover_3d_search_dirs(source_root)
    model_index = _build_3d_model_index(search_dirs)
    print(f"3D model search dirs: {[str(d) for d in search_dirs]}")
    print(f"3D model index: {len(model_index)} file(s) found")

    # Collect which models are actually referenced by the imported footprints
    referenced_models: dict[str, Path] = {}  # filename -> source path
    footprints_root = source_root / "footprints"
    if footprints_root.is_dir():
        for fp_file in footprints_root.rglob("*.kicad_mod"):
            try:
                text = _read_text(fp_file)
                for ref in _extract_3d_refs_from_footprint(text):
                    resolved = _resolve_3d_ref(ref, model_index)
                    if resolved and resolved.name not in referenced_models:
                        referenced_models[resolved.name] = resolved
            except Exception:  # noqa: BLE001
                pass

    # Also import everything found in a conventional 3D/ dir even if not referenced
    for d in search_dirs:
        if d.name in ("3D", "3d"):
            for f in d.rglob("*"):
                if (
                    f.is_file()
                    and f.suffix.lower() in STEP_EXTENSIONS
                    and f.name not in referenced_models
                ):
                    referenced_models[f.name] = f

    if referenced_models:
        print(
            f"Importing {len(referenced_models)} 3D model(s) referenced by footprints ..."
        )
    else:
        print("No 3D models found or referenced.")

    for model_name, model_file in sorted(referenced_models.items()):
        try:
            print(f"Processing 3D model: {model_name} ...")
            # Group by parent directory name (e.g. "EasyEDA.3dshapes" → library name)
            parent_name = model_file.parent.name.removesuffix(".3dshapes") or "Models"
            library = _sanitize_name(parent_name, "Prism_Models")
            destination = (
                service._asset_root("3dmodel")
                / library
                / _sanitize_name(model_name, "model.step")
            )  # type: ignore[attr-defined]
            canonical = _copy_canonical_file(
                model_file,
                destination,
                dry_run=dry_run,
                overwrite=overwrite,
                stats=stats,
            )
            stats.models_written += 1
            _register_asset(
                service,
                conn,
                asset_type="3dmodel",
                canonical_path=canonical,
                target_library=library,
                target_name=canonical.name,
                generate_previews=False,
                stats=stats,
            )
        except Exception as exc:  # noqa: BLE001
            stats.errors.append(f"{model_file}: {exc}")

    spice_root = source_root / "spice"
    if spice_root.is_dir():
        for spice_file in sorted(spice_root.rglob("*")):
            if (
                not spice_file.is_file()
                or spice_file.suffix.lower() not in SPICE_EXTENSIONS
            ):
                continue
            try:
                print(f"Processing SPICE file: {spice_file.name} ...")
                library = _relative_library_name(spice_file, spice_root, "Prism_SPICE")
                destination = (
                    service._asset_root("spice")
                    / library
                    / _sanitize_name(spice_file.name, "model.lib")
                )  # type: ignore[attr-defined]
                canonical = _copy_canonical_file(
                    spice_file,
                    destination,
                    dry_run=dry_run,
                    overwrite=overwrite,
                    stats=stats,
                )
                stats.spice_written += 1
                _register_asset(
                    service,
                    conn,
                    asset_type="spice",
                    canonical_path=canonical,
                    target_library=library,
                    target_name=canonical.name,
                    generate_previews=False,
                    stats=stats,
                )
            except Exception as exc:  # noqa: BLE001
                stats.errors.append(f"{spice_file}: {exc}")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Import existing KiCad libraries into Prism canonical storage. "
            "Packed symbol libraries are split into one .kicad_sym file per symbol."
        )
    )
    parser.add_argument(
        "source_root",
        type=Path,
        help="Existing library root containing symbols/, footprints/, and 3D/",
    )
    parser.add_argument(
        "--store-root",
        type=Path,
        default=None,
        help="Prism canonical store root. Defaults to backend settings KICAD_PROJECTS_ROOT/.kicad-prism/components.",
    )
    parser.add_argument(
        "--database-url",
        default=os.environ.get("CATALOG_SQLITE_PATH", ""),
        help="SQLite catalog path used to index reusable asset rows. Defaults to CATALOG_SQLITE_PATH.",
    )
    parser.add_argument(
        "--no-index-db",
        action="store_true",
        help="Only write files; do not create/update SQLite catalog asset rows.",
    )
    parser.add_argument(
        "--no-previews",
        action="store_true",
        help="Skip symbol/footprint preview generation.",
    )
    parser.add_argument(
        "--skip-symbol-upgrade",
        action="store_true",
        help="Do not run kicad-cli sym upgrade before splitting symbols.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite conflicting canonical files instead of writing suffixed names.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would be imported without writing files or DB rows.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero when any asset fails to import.",
    )
    parser.add_argument(
        "--jobs",
        type=int,
        default=1,
        help=(
            "Parallel file workers for symbol splitting and footprint copying. "
            "Parallelism is used only when --no-index-db or --dry-run keeps DB writes disabled."
        ),
    )
    parser.add_argument(
        "--report-json",
        type=Path,
        default=None,
        help="Optional path for a JSON import report.",
    )
    parser.add_argument(
        "--component-csv",
        type=Path,
        default=None,
        help="Optional output CSV for Prism component metadata import, with canonical asset link columns.",
    )
    parser.add_argument(
        "--csv-store-root",
        type=Path,
        default=None,
        help=(
            "Store root to use when writing asset paths into --component-csv. "
            "Use /app/projects/.kicad-prism/components when the CSV will be uploaded to the Docker backend."
        ),
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

    service = ComponentCatalogService(
        store_root=args.store_root, database_url=args.database_url or None
    )
    stats = ImportStats()
    component_rows: list[tuple[ComponentCsvRow, str]] = []
    jobs = max(1, int(args.jobs or 1))

    conn = None
    conn_context = None
    fatal_error = False
    try:
        if args.dry_run:
            service._ensure_storage_dirs()  # type: ignore[attr-defined]
        elif args.no_index_db:
            service._ensure_storage_dirs()  # type: ignore[attr-defined]
        else:
            service.initialize()
            conn_context = service._connect()  # type: ignore[attr-defined]
            conn = conn_context.__enter__()
            if jobs > 1:
                print(
                    "--jobs is ignored while indexing DB rows directly; use --no-index-db for parallel file import.",
                    file=sys.stderr,
                )
                jobs = 1

        _import_symbols(
            source_root,
            service,
            conn,
            dry_run=args.dry_run,
            overwrite=args.overwrite,
            skip_upgrade=args.skip_symbol_upgrade,
            generate_previews=not args.no_previews and not args.dry_run,
            csv_store_root=args.csv_store_root,
            component_rows=component_rows,
            stats=stats,
            jobs=jobs,
        )
        footprint_index = _import_footprints(
            source_root,
            service,
            conn,
            dry_run=args.dry_run,
            overwrite=args.overwrite,
            generate_previews=not args.no_previews and not args.dry_run,
            stats=stats,
            jobs=jobs,
        )
        if args.component_csv:
            _write_component_csv(
                args.component_csv,
                component_rows,
                footprint_index,
                csv_store_root=args.csv_store_root,
                service_store_root=service.store_root,
                stats=stats,
            )
        _import_auxiliary_files(
            source_root,
            service,
            conn,
            dry_run=args.dry_run,
            overwrite=args.overwrite,
            stats=stats,
        )

        if conn is not None:
            if args.dry_run:
                conn.rollback()
            else:
                conn.commit()
    except Exception as exc:  # noqa: BLE001
        fatal_error = True
        if conn is not None:
            conn.rollback()
        stats.errors.append(str(exc))
    finally:
        if conn_context is not None:
            conn_context.__exit__(None, None, None)

    report = asdict(stats)
    report["source_root"] = str(source_root)
    report["store_root"] = str(service.store_root)
    report["indexed_db"] = bool(not args.no_index_db and not args.dry_run)
    report["previews_enabled"] = bool(not args.no_previews and not args.dry_run)
    report["jobs"] = jobs

    if args.report_json:
        args.report_json.parent.mkdir(parents=True, exist_ok=True)
        args.report_json.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(json.dumps(report, indent=2))
    return 1 if fatal_error or (args.strict and stats.errors) else 0


if __name__ == "__main__":
    raise SystemExit(main())
