#!/usr/bin/env python3
"""Import a symbol-less KiCad library (footprints plus 3D models) into Prism.

`import_database_library.py` needs a symbol library and a metadata database, and
`import_kicad_library_assets.py` only produces components for libraries that ship
`.kicad_sym` files. A house library that has drawn its footprints but not yet its
symbols has neither, so it cannot be imported by either path even though the
catalog itself supports footprint-only parts: `remote_component_heads` derives
`has_symbol` from a LEFT JOIN, so such a component projects as
`availability_state = files_partial` with `missing_assets = ["symbol"]`. It is
browsable, searchable and previewable in the Remote Symbol Panel, and simply not
placeable until a symbol is attached.

This script creates exactly those components: one released component per
`.kicad_mod`, with the footprint linked as a required asset and any resolvable
STEP model linked alongside it. No placeholder symbols are invented — a synthetic
symbol would carry pin numbers with no pin functions, which is worse than a
declared gap.

Run it inside the backend container (or with the backend virtualenv) so the
catalog runtime and canonical store paths match the running service.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import time
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
_slugify: Any = None
_utc_now_iso: Any = None

REVISION_MANIFEST_A2 = "prism.revision_manifest_a2"
MAX_REPORTED_ERRORS = 100
MODEL_EXTENSIONS = {".step", ".stp", ".wrl"}

DESCR_RE = re.compile(r'\(descr\s+"((?:\\.|[^"])*)"')
TAGS_RE = re.compile(r'\(tags\s+"((?:\\.|[^"])*)"')
MODEL_REF_RE = re.compile(r'\(model\s+"([^"]+)"')
PROPERTY_RE = re.compile(r'\(property\s+"((?:\\.|[^"])*)"\s+"((?:\\.|[^"])*)"')

# Only these families are treated as package suffixes. Anything else stays part of
# the manufacturer part number: a wrong split silently corrupts the field users
# search on, while a missed split just leaves package_name to the fallbacks below.
PACKAGE_FAMILIES = (
    "SOIC", "SOICN", "SOP", "PSOP", "TSOP", "TSSOP", "HTSSOP", "SSOP", "VSSOP", "MSOP", "QSOP",
    "QFN", "VQFN", "WQFN", "UQFN", "HVQFN", "DFN", "WDFN", "UDFN", "SON", "WSON", "USON",
    "QFP", "LQFP", "TQFP", "PQFP", "CQFP", "JCQFP", "CFP", "MQFP",
    "BGA", "FBGA", "VFBGA", "CBGA", "PBGA", "WLCSP", "CSP",
    "DIP", "CDIP", "PDIP", "CERDIP", "SIP", "SBDIP",
    "TO", "SOT", "SC", "LGA", "PLCC", "LCC", "MLF", "SMD", "SMT", "SIL",
    "DPAK", "D2PAK", "POWERPAD", "PWRPAD", "FLATPACK",
)
_FAMILY_ALTERNATION = "|".join(sorted(PACKAGE_FAMILIES, key=len, reverse=True))
# "VSSOP8", "SOT23-5", "TO252-3", "CQFP132", "DFN2"
PACKAGE_TOKEN_RE = re.compile(
    rf"^(?:{_FAMILY_ALTERNATION})(?:[-_ ]?[A-Z0-9]{{1,6}})*$", re.IGNORECASE
)
# "8-SOIC", "132-CQFP" — the leading-package spelling used by a few files.
PACKAGE_HINT_RE = re.compile(
    rf"(?:^|[-_ ])(?:{_FAMILY_ALTERNATION})(?:[-_ ]|[0-9]|$)", re.IGNORECASE
)
# "TSOP, 14-Leads, Body 5.00x4.40mm, ..." — the IPC descr wording used by KiCad's
# footprint generators, which is the only structured package data most of these
# files carry.
DESCR_PACKAGE_RE = re.compile(r"^\s*([A-Za-z][A-Za-z0-9+]*)\s*,\s*(\d+)\s*-?\s*Leads", re.IGNORECASE)


def _load_catalog_runtime() -> None:
    global ComponentCatalogService
    global _discover_footprint_name_in_text
    global _sanitize_name
    global _slugify
    global _utc_now_iso

    try:
        from app.services.component_catalog_domain import (  # noqa: PLC0415
            _discover_footprint_name_in_text as loaded_discover_footprint_name,
            _sanitize_name as loaded_sanitize_name,
            _slugify as loaded_slugify,
            _utc_now_iso as loaded_utc_now_iso,
        )
        from app.services.component_catalog_service_postgres import (  # noqa: PLC0415
            ComponentCatalogPostgresService,
        )
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Backend Python dependencies are not available. Run this with the backend virtualenv "
            "or inside the backend container."
        ) from exc

    ComponentCatalogService = ComponentCatalogPostgresService
    _discover_footprint_name_in_text = loaded_discover_footprint_name
    _sanitize_name = loaded_sanitize_name
    _slugify = loaded_slugify
    _utc_now_iso = loaded_utc_now_iso


@dataclass
class ImportStats:
    footprint_files_seen: int = 0
    footprints_registered: int = 0
    models_registered: int = 0
    models_unresolved: int = 0
    components_created: int = 0
    components_released: int = 0
    components_skipped_existing: int = 0
    previews_generated: int = 0
    previews_failed: int = 0
    skipped_files: int = 0
    errors: list[str] = field(default_factory=list)


@dataclass
class FootprintPlan:
    source_path: Path
    relative_path: str
    target_library: str
    target_name: str
    model_path: Path | None
    model_reference: str
    metadata: dict[str, Any]


def _record_error(stats: ImportStats, message: str) -> None:
    if len(stats.errors) < MAX_REPORTED_ERRORS:
        stats.errors.append(message)


def _resolve_child_dir(root: Path, name: str) -> Path | None:
    """Resolve a child directory case-insensitively.

    The library ships `Footprints/` and `3D/`, but the import usually runs inside
    the Linux backend container where the bind mount preserves that casing and
    lookups are case-sensitive. Matching on the casefolded name keeps one command
    working from Windows, macOS and the container alike.
    """
    direct = root / name
    if direct.is_dir():
        return direct
    wanted = name.casefold()
    for child in sorted(root.iterdir()):
        if child.is_dir() and child.name.casefold() == wanted:
            return child
    return None


def _properties(text: str) -> dict[str, str]:
    return {
        key.replace(r"\"", '"').replace(r"\\", "\\"): value.replace(r"\"", '"').replace(r"\\", "\\")
        for key, value in PROPERTY_RE.findall(text)
    }


def _first_group(pattern: re.Pattern[str], text: str) -> str:
    match = pattern.search(text)
    return match.group(1).strip() if match else ""


def _split_mpn_and_package(stem: str, *, mode: str) -> tuple[str, str]:
    cleaned = " ".join(stem.split()).strip()
    if mode == "full" or not cleaned:
        return cleaned, ""
    for separator in ("_", " ", "-"):
        # Hyphens appear inside real part numbers ("BAT54LPS-7", "LM4050WG2-5RLQV"),
        # so a hyphen-separated tail must also carry a lead/size digit before it is
        # believed to be a package. Underscores and spaces are only ever separators here.
        needs_digit = separator == "-"
        head, found, tail = cleaned.rpartition(separator)
        head, tail = head.strip(" _-"), tail.strip(" _-")
        if found and head and tail and PACKAGE_TOKEN_RE.match(tail):
            if not needs_digit or any(character.isdigit() for character in tail):
                return head, tail
        # "TLV3011BQDBVRQ1_SOT23_6", "ISOS141FDBQTSEP-SSOP-16": the pin count is its
        # own trailing token.
        if found and head and tail.isdigit():
            head_2, found_2, tail_2 = head.rpartition(separator)
            head_2, tail_2 = head_2.strip(" _-"), tail_2.strip(" _-")
            if found_2 and head_2 and PACKAGE_TOKEN_RE.match(tail_2):
                return head_2, f"{tail_2}-{tail}"
    head, found, tail = cleaned.partition("_")
    head, tail = head.strip(" _"), tail.strip(" _")
    if found and head and tail and PACKAGE_HINT_RE.search(head) and not PACKAGE_HINT_RE.search(tail):
        return tail, head
    return cleaned, ""


def _package_from_descr(descr: str) -> str:
    match = DESCR_PACKAGE_RE.match(descr)
    if not match:
        return ""
    family, leads = match.group(1), match.group(2)
    if not PACKAGE_HINT_RE.search(family):
        return ""
    return f"{family.upper()}-{leads}"


def _category_from_library(library: str, strip_prefix: str) -> str:
    category = library
    if strip_prefix and category.casefold().startswith(strip_prefix.casefold()):
        category = category[len(strip_prefix):]
    return category.replace("_", " ").strip() or library


def _index_models(models_root: Path | None) -> dict[str, Path]:
    """Index STEP/WRL files by file name and by stem, both casefolded.

    Footprints in this library reference absolute Windows authoring paths, so the
    only usable part of a `(model ...)` reference is its file name.
    """
    index: dict[str, Path] = {}
    if models_root is None:
        return index
    for path in sorted(models_root.rglob("*")):
        if not path.is_file() or path.suffix.casefold() not in MODEL_EXTENSIONS:
            continue
        index.setdefault(path.name.casefold(), path)
        index.setdefault(path.stem.casefold(), path)
    return index


def _resolve_model(reference: str, model_index: dict[str, Path]) -> Path | None:
    if not reference:
        return None
    name = re.split(r"[\\/]", reference.strip())[-1]
    if not name:
        return None
    return model_index.get(name.casefold()) or model_index.get(Path(name).stem.casefold())


def _build_plan(
    footprint_file: Path,
    footprints_root: Path,
    *,
    model_index: dict[str, Path],
    mpn_mode: str,
    strip_prefix: str,
    default_manufacturer: str,
    default_vendor: str,
) -> FootprintPlan:
    text = footprint_file.read_text(encoding="utf-8", errors="ignore")
    relative_path = footprint_file.relative_to(footprints_root).as_posix()

    raw_library = footprint_file.parent.name.removesuffix(".pretty")
    target_library = _sanitize_name(raw_library, "Prism_Footprints")
    target_name = _discover_footprint_name_in_text(text) or footprint_file.stem

    properties = _properties(text)
    descr = _first_group(DESCR_RE, text)
    tags = _first_group(TAGS_RE, text)

    mpn, package = _split_mpn_and_package(footprint_file.stem, mode=mpn_mode)
    if not package:
        candidate = properties.get("Value", "").strip()
        if candidate and candidate != footprint_file.stem and PACKAGE_HINT_RE.search(candidate):
            package = candidate
    if not package:
        package = _package_from_descr(descr)

    description = properties.get("Description", "").strip() or descr
    model_reference = _first_group(MODEL_REF_RE, text)
    model_path = _resolve_model(model_reference, model_index)

    extra_fields = {
        "source_library": raw_library,
        "source_file": relative_path,
        "footprint_library": target_library,
        "footprint_name": target_name,
    }
    if tags:
        extra_fields["footprint_tags"] = tags
    if model_path is not None:
        extra_fields["model_3d"] = model_path.name

    metadata = {
        "name": mpn,
        "value": mpn,
        "description": description,
        "datasheet_url": properties.get("Datasheet", "").strip(),
        "manufacturer": properties.get("Manufacturer", "").strip() or default_manufacturer,
        "mpn": mpn,
        "category": _category_from_library(raw_library, strip_prefix),
        "package_name": package,
        "vendor": properties.get("Vendor", "").strip() or default_vendor,
        "vendor_part_number": properties.get("Manufacturer Part Number", "").strip(),
        "mass_g": "",
        "rqjc_c_w": "",
        "rqjc_top_c_w": "",
        "temp_max_c": "",
        "temp_min_c": "",
        "power_dissipation_w": "",
        "rate": "",
        "sap_code": "",
        "summary": description[:200],
        "extra_fields": extra_fields,
    }
    return FootprintPlan(
        source_path=footprint_file,
        relative_path=relative_path,
        target_library=target_library,
        target_name=target_name,
        model_path=model_path,
        model_reference=model_reference,
        metadata=metadata,
    )


def _collect_plans(
    footprints_root: Path,
    *,
    model_index: dict[str, Path],
    mpn_mode: str,
    strip_prefix: str,
    default_manufacturer: str,
    default_vendor: str,
    include_libraries: list[str],
    limit: int,
    stats: ImportStats,
) -> list[FootprintPlan]:
    wanted = {name.casefold() for name in include_libraries}
    plans: list[FootprintPlan] = []
    for footprint_file in sorted(footprints_root.rglob("*.kicad_mod")):
        stats.footprint_files_seen += 1
        raw_library = footprint_file.parent.name.removesuffix(".pretty")
        if wanted and raw_library.casefold() not in wanted:
            continue
        try:
            plans.append(
                _build_plan(
                    footprint_file,
                    footprints_root,
                    model_index=model_index,
                    mpn_mode=mpn_mode,
                    strip_prefix=strip_prefix,
                    default_manufacturer=default_manufacturer,
                    default_vendor=default_vendor,
                )
            )
        except Exception as exc:  # noqa: BLE001
            stats.skipped_files += 1
            _record_error(stats, f"{footprint_file}: {exc}")
        if limit and len(plans) >= limit:
            break
    return plans


def _runtime_path(local_path: Path, local_store_root: Path, runtime_store_root: Path | None) -> str:
    if runtime_store_root is None:
        return str(local_path.resolve())
    relative = local_path.resolve().relative_to(local_store_root.resolve())
    return str((runtime_store_root / relative).as_posix())


def _same_bytes(path: Path, payload: bytes) -> bool:
    return path.is_file() and path.read_bytes() == payload


def _write_or_copy(destination: Path, source: Path, *, overwrite: bool) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    payload = source.read_bytes()
    if destination.exists():
        if _same_bytes(destination, payload):
            return destination
        if not overwrite:
            raise ValueError(f"Canonical asset conflict at {destination}")
    shutil.copy2(source, destination)
    return destination


def _register_asset(
    service: Any,
    conn: Any,
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
    runtime_canonical_path = _runtime_path(local_path, service.store_root, runtime_store_root)
    if str(asset["canonical_path"]) != runtime_canonical_path:
        conn.execute(
            "UPDATE assets SET canonical_path = %s WHERE id = %s",
            (runtime_canonical_path, asset["id"]),
        )
        asset = dict(asset)
        asset["canonical_path"] = runtime_canonical_path
    return asset


def _enable_catalog_migration(conn: Any) -> None:
    conn.execute("SET LOCAL prism.catalog_migration = 'on'")


def _begin_import_transaction(conn: Any) -> None:
    # SET LOCAL is scoped to the transaction, so this must be reissued after every
    # commit or the immutability guards on revision_previews reject the next batch.
    _enable_catalog_migration(conn)


def _find_existing_component(conn: Any, mpn: str, package_name: str) -> str | None:
    row = conn.execute(
        """
        SELECT c.id
        FROM components c
        JOIN component_revisions cr ON cr.id = c.current_revision_id
        WHERE cr.mpn = %s AND cr.package_name = %s
        LIMIT 1
        """,
        (mpn, package_name),
    ).fetchone()
    return str(row["id"]) if row else None


def _unique_slug(conn: Any, used_slugs: set[str], base: str) -> str:
    slug = _slugify(base or "component")
    candidate = slug
    counter = 2
    while True:
        if candidate not in used_slugs:
            row = conn.execute("SELECT 1 FROM components WHERE slug = %s LIMIT 1", (candidate,)).fetchone()
            if not row:
                used_slugs.add(candidate)
                return candidate
            used_slugs.add(candidate)
        candidate = f"{slug}-{counter}"
        counter += 1


def _insert_component(
    service: Any,
    conn: Any,
    *,
    metadata: dict[str, Any],
    slug: str,
    now: str,
) -> tuple[str, str]:
    component_id = str(uuid.uuid4())
    revision_id = str(uuid.uuid4())
    conn.execute(
        """
        INSERT INTO components (
            id, slug, source, external_source, external_id, stock_quantity, stock_uom, inventory_status,
            serial_number, lot_number, pedigree, last_synced_at, is_active, current_revision_id,
            released_revision_id, created_at, updated_at
        )
        VALUES (%s, %s, %s, %s, %s, 0, '', '', '', '', '', NULL, 1, %s, '', %s, %s)
        """,
        (component_id, slug, "import", "", "", revision_id, now, now),
    )
    conn.execute(
        """
        INSERT INTO component_revisions (
            id, component_id, version, parent_revision_id, change_kind, change_summary, created_by,
            manifest_hash, manifest_schema, release_status, name, value, description, datasheet_url,
            manufacturer, mpn, category, package_name, vendor, vendor_part_number, mass_g,
            rqjc_c_w, rqjc_top_c_w, temp_max_c, temp_min_c, power_dissipation_w, rate, sap_code,
            summary, keywords, extra_fields, search_document, created_at, updated_at
        )
        VALUES (
            %s, %s, 1, '', 'import', 'Imported from footprint library', 'system:import_footprint_library',
            '', %s, 'open', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s
        )
        """,
        (
            revision_id,
            component_id,
            REVISION_MANIFEST_A2,
            metadata["name"],
            metadata["value"],
            metadata["description"],
            metadata["datasheet_url"],
            metadata["manufacturer"],
            metadata["mpn"],
            metadata["category"],
            metadata["package_name"],
            metadata["vendor"],
            metadata["vendor_part_number"],
            metadata["mass_g"],
            metadata["rqjc_c_w"],
            metadata["rqjc_top_c_w"],
            metadata["temp_max_c"],
            metadata["temp_min_c"],
            metadata["power_dissipation_w"],
            metadata["rate"],
            metadata["sap_code"],
            metadata["summary"],
            json.dumps(service._keywords(metadata), separators=(",", ":")),  # type: ignore[attr-defined]
            json.dumps(metadata["extra_fields"], sort_keys=True, separators=(",", ":")),
            service._search_document(metadata),  # type: ignore[attr-defined]
            now,
            now,
        ),
    )
    return component_id, revision_id


def _link_asset(conn: Any, revision_id: str, asset: dict[str, Any], *, required: bool, now: str) -> None:
    conn.execute(
        """
        INSERT INTO revision_assets (revision_id, asset_type, asset_id, required, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (revision_id, asset_id)
        DO UPDATE SET required = excluded.required, updated_at = excluded.updated_at
        """,
        (revision_id, asset["asset_type"], asset["id"], 1 if required else 0, now, now),
    )


def _bind_preview(conn: Any, revision_id: str, asset_id: str, preview: dict[str, Any], now: str) -> None:
    """Bind a generated preview to the revision on both preview tables.

    `revision_preview_outputs` is what the catalog UI reads, but the
    `remote_component_heads` projection resolves `footprint_preview_id` from
    `revision_previews`. Writing only one leaves the preview missing from either
    the workspace or the KiCad Remote Symbol Panel.
    """
    preview_id = str(preview["id"])
    kind = str(preview["kind"])
    conn.execute(
        """
        INSERT INTO revision_preview_outputs (revision_id, asset_id, kind, preview_id, generated_at)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (revision_id, asset_id, kind)
        DO UPDATE SET preview_id = excluded.preview_id, generated_at = excluded.generated_at
        """,
        (revision_id, asset_id, kind, preview_id, now),
    )
    conn.execute(
        """
        INSERT INTO revision_previews (revision_id, asset_id, kind, preview_id, created_at)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (revision_id, asset_id, kind) DO NOTHING
        """,
        (revision_id, asset_id, kind, preview_id, now),
    )


def _release_component(
    service: Any,
    conn: Any,
    *,
    component_id: str,
    revision_id: str,
    now: str,
) -> None:
    manifest_hash = service._revision_manifest_hash(conn, revision_id)  # type: ignore[attr-defined]
    conn.execute(
        """
        UPDATE component_revisions
        SET manifest_hash = %s, release_status = 'released', updated_at = %s
        WHERE id = %s
        """,
        (manifest_hash, now, revision_id),
    )
    conn.execute(
        "UPDATE components SET released_revision_id = %s, updated_at = %s WHERE id = %s",
        (revision_id, now, component_id),
    )


def _import_plans(
    plans: list[FootprintPlan],
    *,
    service: Any,
    conn: Any,
    stats: ImportStats,
    runtime_store_root: Path | None,
    overwrite_assets: bool,
    generate_previews: bool,
    release_imported: bool,
    commit_batch: int,
) -> None:
    used_slugs: set[str] = set()
    # The registered asset is kept next to the local file that was written for it:
    # _register_asset may rewrite canonical_path to the runtime mount or to an
    # immutable revisions path, and preview generation has to read a real local file.
    footprint_assets: dict[tuple[str, str], tuple[dict[str, Any], Path]] = {}
    model_assets: dict[Path, dict[str, Any]] = {}
    pending = 0
    started = time.perf_counter()

    def commit_batch_now(force: bool = False) -> None:
        nonlocal pending
        if not force and pending < max(1, commit_batch):
            return
        if pending <= 0:
            return
        conn.commit()
        _begin_import_transaction(conn)
        pending = 0
        elapsed = max(time.perf_counter() - started, 0.001)
        print(
            f"Committed: {stats.components_created} created, "
            f"{stats.components_skipped_existing} already present, "
            f"{stats.skipped_files} skipped ({stats.components_created / elapsed:.1f} components/s)",
            flush=True,
        )

    def recover() -> None:
        nonlocal pending
        conn.rollback()
        _begin_import_transaction(conn)
        pending = 0
        footprint_assets.clear()
        model_assets.clear()

    for plan in plans:
        try:
            metadata = plan.metadata
            existing = _find_existing_component(conn, metadata["mpn"], metadata["package_name"])
            if existing:
                stats.components_skipped_existing += 1
                continue

            now = _utc_now_iso()
            footprint_key = (plan.target_library, plan.target_name)
            cached = footprint_assets.get(footprint_key)
            if cached is None:
                destination = service._footprint_destination(*footprint_key)  # type: ignore[attr-defined]
                local_footprint = _write_or_copy(destination, plan.source_path, overwrite=overwrite_assets)
                footprint_asset = _register_asset(
                    service,
                    conn,
                    asset_type="footprint",
                    canonical_path=local_footprint,
                    target_library=plan.target_library,
                    target_name=plan.target_name,
                    source_group=plan.source_path.parent.name,
                    runtime_store_root=runtime_store_root,
                )
                footprint_assets[footprint_key] = (footprint_asset, local_footprint)
                stats.footprints_registered += 1
            else:
                footprint_asset, local_footprint = cached

            model_asset = None
            if plan.model_path is not None:
                model_asset = model_assets.get(plan.model_path)
                if model_asset is None:
                    destination = service._aux_destination(  # type: ignore[attr-defined]
                        "3dmodel", plan.target_library, plan.model_path.name
                    )
                    canonical = _write_or_copy(destination, plan.model_path, overwrite=overwrite_assets)
                    model_asset = _register_asset(
                        service,
                        conn,
                        asset_type="3dmodel",
                        canonical_path=canonical,
                        target_library=plan.target_library,
                        target_name=plan.model_path.stem,
                        source_group=plan.model_path.parent.name,
                        runtime_store_root=runtime_store_root,
                    )
                    model_assets[plan.model_path] = model_asset
                    stats.models_registered += 1
            elif plan.model_reference:
                stats.models_unresolved += 1
                _record_error(
                    stats,
                    f"{plan.relative_path}: 3D model reference not found in the model directory: "
                    f"{plan.model_reference}",
                )

            slug_base = f"{metadata['mpn']} {metadata['package_name']}".strip() or plan.target_name
            slug = _unique_slug(conn, used_slugs, slug_base)
            component_id, revision_id = _insert_component(
                service, conn, metadata=metadata, slug=slug, now=now
            )
            stats.components_created += 1

            _link_asset(conn, revision_id, footprint_asset, required=True, now=now)
            if model_asset is not None:
                _link_asset(conn, revision_id, model_asset, required=False, now=now)

            if generate_previews:
                preview_asset = dict(footprint_asset)
                preview_asset["canonical_path"] = str(local_footprint)
                preview = service._ensure_asset_preview(conn, preview_asset)  # type: ignore[attr-defined]
                if preview and str(preview.get("status") or "") == "ready" and preview.get("id"):
                    _bind_preview(conn, revision_id, str(footprint_asset["id"]), preview, now)
                    stats.previews_generated += 1
                else:
                    stats.previews_failed += 1
                    _record_error(
                        stats,
                        f"{plan.relative_path}: footprint preview failed: "
                        f"{(preview or {}).get('generation_error') or 'no preview produced'}",
                    )

            if release_imported:
                _release_component(
                    service, conn, component_id=component_id, revision_id=revision_id, now=now
                )
                stats.components_released += 1

            pending += 1
            commit_batch_now()
        except Exception as exc:  # noqa: BLE001
            stats.skipped_files += 1
            _record_error(stats, f"{plan.relative_path}: {exc}")
            recover()

    commit_batch_now(force=True)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Import a KiCad library that has footprints and 3D models but no symbols. "
            "Each footprint becomes a released, footprint-only Prism component."
        )
    )
    parser.add_argument("source_root", type=Path, help="Library root, for example a KiCad-Lib checkout.")
    parser.add_argument("--footprints-dir", default="Footprints", help="Footprint directory name under source_root.")
    parser.add_argument("--models-dir", default="3D", help="3D model directory name under source_root. Empty disables model linking.")
    parser.add_argument("--store-root", type=Path, default=None, help="Local Prism canonical component store root.")
    parser.add_argument("--runtime-store-root", type=Path, default=None, help="Canonical store root written into DB paths, e.g. /app/projects/.kicad-prism/components.")
    parser.add_argument("--database-url", default=os.environ.get("PRISM_DATABASE_URL", ""), help="Target Prism PostgreSQL URL.")
    parser.add_argument("--include-library", action="append", default=[], help="Import only this source library folder. Can be repeated.")
    parser.add_argument("--category-prefix", default="Pixxel_", help="Library name prefix stripped when deriving the component category.")
    parser.add_argument("--manufacturer", default="", help="Manufacturer applied when a footprint carries no Manufacturer property.")
    parser.add_argument("--vendor", default="", help="Vendor applied when a footprint carries no Vendor property.")
    parser.add_argument(
        "--mpn-mode",
        choices=("strip", "full"),
        default="strip",
        help=(
            "strip: split a recognised trailing package token off the file name to derive the MPN. "
            "full: use the whole file name as the MPN and leave package_name to the other fallbacks."
        ),
    )
    parser.add_argument("--overwrite-assets", action="store_true", help="Overwrite canonical asset files when content differs.")
    parser.add_argument("--no-previews", action="store_true", help="Skip footprint SVG preview generation. Much faster; previews can be backfilled later.")
    parser.add_argument("--no-release", action="store_true", help="Keep imported components open instead of releasing them.")
    parser.add_argument("--dry-run", action="store_true", help="Resolve footprints and report what would be imported without writing anything.")
    parser.add_argument("--strict", action="store_true", help="Exit non-zero when any footprint fails.")
    parser.add_argument("--limit", type=int, default=0, help="Import at most this many footprints.")
    parser.add_argument("--commit-batch", type=int, default=100, help="Commit PostgreSQL changes every N imported components.")
    parser.add_argument("--report-json", type=Path, default=None, help="Optional JSON report path.")
    return parser


def main() -> int:
    args = _build_parser().parse_args()
    source_root = args.source_root.expanduser().resolve()
    if not source_root.is_dir():
        print(f"Source root does not exist: {source_root}", file=sys.stderr)
        return 2

    footprints_root = _resolve_child_dir(source_root, args.footprints_dir)
    if footprints_root is None:
        print(f"Footprint directory not found under {source_root}: {args.footprints_dir}", file=sys.stderr)
        return 2

    models_root = _resolve_child_dir(source_root, args.models_dir) if args.models_dir else None
    if args.models_dir and models_root is None:
        print(f"Warning: 3D model directory not found under {source_root}: {args.models_dir}", file=sys.stderr)

    try:
        _load_catalog_runtime()
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    stats = ImportStats()
    model_index = _index_models(models_root)
    plans = _collect_plans(
        footprints_root,
        model_index=model_index,
        mpn_mode=args.mpn_mode,
        strip_prefix=args.category_prefix,
        default_manufacturer=args.manufacturer,
        default_vendor=args.vendor,
        include_libraries=args.include_library,
        limit=max(0, int(args.limit or 0)),
        stats=stats,
    )

    service = ComponentCatalogService(store_root=args.store_root, database_url=args.database_url or None)
    fatal_error = False
    conn_context = None
    try:
        if args.dry_run:
            for plan in plans:
                print(
                    f"{plan.relative_path} -> mpn={plan.metadata['mpn']!r} "
                    f"package={plan.metadata['package_name']!r} "
                    f"category={plan.metadata['category']!r} "
                    f"footprint={plan.target_library}:{plan.target_name} "
                    f"model={plan.model_path.name if plan.model_path else '-'}"
                )
                if plan.model_path is None and plan.model_reference:
                    stats.models_unresolved += 1
        else:
            service.initialize()
            conn_context = service._connect()  # type: ignore[attr-defined]
            conn = conn_context.__enter__()
            _begin_import_transaction(conn)
            _import_plans(
                plans,
                service=service,
                conn=conn,
                stats=stats,
                runtime_store_root=args.runtime_store_root,
                overwrite_assets=args.overwrite_assets,
                generate_previews=not args.no_previews,
                release_imported=not args.no_release,
                commit_batch=max(1, int(args.commit_batch or 1)),
            )
            conn.commit()
    except Exception as exc:  # noqa: BLE001
        fatal_error = True
        _record_error(stats, str(exc))
    finally:
        if conn_context is not None:
            conn_context.__exit__(None, None, None)
        service.close()

    report = asdict(stats)
    report["source_root"] = str(source_root)
    report["footprints_root"] = str(footprints_root)
    report["models_root"] = str(models_root) if models_root else ""
    report["store_root"] = str(service.store_root)
    report["planned"] = len(plans)
    report["dry_run"] = bool(args.dry_run)
    report["released"] = bool(not args.no_release and not args.dry_run)
    report["previews_enabled"] = bool(not args.no_previews and not args.dry_run)

    if args.report_json:
        args.report_json.parent.mkdir(parents=True, exist_ok=True)
        args.report_json.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(json.dumps(report, indent=2))
    return 1 if fatal_error or (args.strict and stats.errors) else 0


if __name__ == "__main__":
    raise SystemExit(main())
