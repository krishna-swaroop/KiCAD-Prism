#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sqlite3
import sys
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
for candidate in (REPO_ROOT / "backend", REPO_ROOT):
    if (candidate / "app").is_dir():
        sys.path.insert(0, str(candidate))
        break

from app.services.catalog.metadata_normalization import metadata_keywords, metadata_search_document, normalize_metadata  # noqa: E402
from app.services.catalog.metadata_schema import CatalogMetadataSchema  # noqa: E402

ComponentCatalogService: Any = None
_discover_footprint_name_in_text: Any = None
_sanitize_name: Any = None
_utc_now_iso: Any = None
_slugify: Any = None
REVISION_MANIFEST_A3 = "prism.revision_manifest_a3"
MAX_REPORTED_ERRORS = 100


def _load_catalog_runtime() -> None:
    global ComponentCatalogService
    global _discover_footprint_name_in_text
    global _sanitize_name
    global _utc_now_iso

    global _slugify

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
class ImportRowPlan:
    table: str
    rowid: int
    part_number: str
    import_name: str
    metadata: dict[str, Any]
    symbol_library: SymbolLibrary | None
    symbol_name: str
    footprint_asset: FootprintAsset | None
    symbol_error: str = ""
    footprint_error: str = ""

    @property
    def stable_order(self) -> tuple[str, int, str]:
        return (self.table, self.rowid, self.part_number.casefold())

    @property
    def is_alternate(self) -> bool:
        return "[alt]" in self.part_number.casefold() or "[alt]" in self.import_name.casefold()


@dataclass
class RepresentationPlan:
    label: str
    symbol_library: SymbolLibrary | None
    symbol_name: str
    footprint_asset: FootprintAsset | None
    source_ipns: list[str]
    provenance: list[dict[str, Any]]
    stable_order: tuple[str, int, str]
    is_default: bool = False


@dataclass
class ComponentGroupPlan:
    key: tuple[str, str, str]
    identity_kind: str
    identity_source: str
    metadata: dict[str, Any]
    rows: list[ImportRowPlan]
    representations: list[RepresentationPlan]
    warnings: list[str] = field(default_factory=list)


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
    mpn_recovered: int = 0
    mpn_fallback: int = 0
    component_groups: int = 0
    representation_groups: int = 0
    provisional_groups: int = 0
    hard_conflicts: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


# Actor recorded on revisions this importer creates. Downstream tooling uses it
# to tell components that came from a database library apart from components
# that merely share a name with one.
DATABASE_LIBRARY_IMPORT_ACTOR = "system:import_database_library"
CERN_EXTERNAL_SOURCE = "cern-database-library"

# The database library carries the real manufacturer part number in its own
# column; the "Part Number" column is the library's internal part number. Older
# imports wrote the internal number into `mpn`, which made every component
# unqueryable against a distributor. Keep the internal number in `name` (and in
# `extra_fields` under a label a librarian recognises) and give `mpn` the real
# manufacturer part number.
IPN_COLUMNS = ("Part Number", "Part Number Nocolon")
MPN_COLUMNS = ("Manufacturer Part Number",)

# Internal-part-number label used in extra_fields. Also the field a librarian
# searches by, so it must survive into the search document.
IPN_FIELD_LABEL = "Internal Part Number"
MPN_SOURCE_FIELD_LABEL = "MPN Source"

# Provenance of the `mpn` column, recorded per row so the supply sync can skip
# rows whose `mpn` is really an internal number and would burn distributor
# quota on a guaranteed miss.
MPN_SOURCE_DATABASE = "database"
MPN_SOURCE_PROVISIONAL = "provisional_ipn"

# Database-library columns with no first-class catalog column that are still
# worth keeping. Anything the importer maps onto a real column (Value, Comment,
# Part Description, Manufacturer, Datasheet, HelpURL, PackageDescription, Power,
# SCEM, LibSymbol, LibFootprint, Database Table Name) is deliberately absent, as
# are the source-bookkeeping columns (Database Name, Part Number Nocolon).
EXTRA_FIELD_COLUMNS = (
    "Component Kind",
    "Component Type",
    "Case",
    "ComponentHeight",
    "Tolerance",
    "TC",
    "Voltage",
    "Resistance",
    "Pin Count",
    "Bonding",
    "Device",
    "Family",
    "Mounted",
    "Socket",
    "SMD",
    "PressFit",
    "Sense",
    "Sense Comment",
    "Status",
    "Status Comment",
    "Manufacturer1 Part Number",
    "Manufacturer1 Example",
    "ComponentLink1URL",
    "ComponentLink1Description",
    "ComponentLink2URL",
    "ComponentLink2Description",
    "Author",
    "CreateDate",
    "LatestRevisionDate",
)

# Placeholder values seen across the CERN export. A cell echoing its own column
# name is an export artefact, and "None" is how the source spells an unset
# status rather than a status a librarian would want to read.
EXTRA_FIELD_PLACEHOLDERS = frozenset({"none", "n/a", "na", "--", "-"})


def _clean_extra_value(column: str, value: str) -> str:
    """Drop export artefacts so they do not reach the catalog as real values."""
    cleaned = value.strip()
    if not cleaned:
        return ""
    if cleaned.casefold() == column.casefold():
        return ""
    if cleaned.casefold() in EXTRA_FIELD_PLACEHOLDERS:
        return ""
    return cleaned


# Truncate order is irrelevant under CASCADE; list every catalog table that holds
# imported component/asset state so --replace-catalog clears the Postgres schema.
CATALOG_TRUNCATE_TABLES = (
    "asset_validation_findings",
    "asset_validation_runs",
    "revision_validation_evidence_links",
    "revision_preview_outputs",
    "revision_previews",
    "asset_preview_versions",
    "asset_previews",
    "revision_assets",
    "revision_representations",
    "inventory_levels",
    "component_release_records",
    "component_review_decisions",
    "catalog_audit_events",
    "catalog_metadata_batch_items",
    "catalog_metadata_batches",
    "component_usage",
    "project_component_import_proposals",
    "project_component_import_sessions",
    "component_heads",
    "component_revisions",
    "components",
    "assets",
    "catalog_meta",
)


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def _same_bytes(path: Path, payload: bytes) -> bool:
    return path.is_file() and path.read_bytes() == payload


def _write_or_copy(destination: Path, source: Path | None, payload: bytes | None, *, overwrite: bool) -> Path:
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


def _table_column_maps(conn: sqlite3.Connection, tables: list[str]) -> dict[str, dict[str, str]]:
    maps: dict[str, dict[str, str]] = {}
    for table in tables:
        maps[table] = {
            str(row["name"]).lower().replace(" ", "_"): str(row["name"])
            for row in conn.execute(f'PRAGMA table_info("{table}")')
        }
    return maps


def _row_get_cached(row: sqlite3.Row, column_map: dict[str, str], *names: str) -> str:
    for name in names:
        if name in row.keys():
            value = row[name]
            return "" if value is None else str(value).strip()
        key = column_map.get(name.lower().replace(" ", "_"))
        if key:
            value = row[key]
            return "" if value is None else str(value).strip()
    return ""


def _record_error(stats: ImportStats, message: str) -> None:
    if len(stats.errors) < MAX_REPORTED_ERRORS:
        stats.errors.append(message)


def _unique_slug_local(used_slugs: set[str], base: str) -> str:
    slug = _slugify(base or "component")
    candidate = slug
    counter = 2
    while candidate in used_slugs:
        candidate = f"{slug}-{counter}"
        counter += 1
    used_slugs.add(candidate)
    return candidate


def _symbol_payload_cached(
    cache: dict[tuple[str, str], bytes],
    library: SymbolLibrary,
    selected_symbol: str,
) -> bytes:
    key = (library.target_library, selected_symbol)
    payload = cache.get(key)
    if payload is None:
        payload = _symbol_payload_from_index(library, selected_symbol)
        cache[key] = payload
    return payload


def _link_asset_fast(conn: Any, revision_id: str, asset: dict[str, Any], *, required: bool, now: str) -> None:
    conn.execute(
        """
        INSERT INTO revision_assets (revision_id, asset_type, asset_id, required, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (revision_id, asset_id)
        DO UPDATE SET required = excluded.required, updated_at = excluded.updated_at
        """,
        (revision_id, asset["asset_type"], asset["id"], 1 if required else 0, now, now),
    )
    if asset["asset_type"] in {"symbol", "footprint"}:
        conn.execute(
            """
            INSERT INTO revision_preview_outputs (revision_id, asset_id, kind, preview_id, generated_at)
            SELECT %s, latest.asset_id, latest.kind, latest.id, %s
            FROM (
                SELECT DISTINCT ON (asset_id, kind) id, asset_id, kind
                FROM asset_preview_versions
                WHERE asset_id = %s AND status = 'ready'
                ORDER BY asset_id, kind, created_at DESC, id DESC
            ) latest
            ON CONFLICT (revision_id, asset_id, kind)
            DO UPDATE SET preview_id = EXCLUDED.preview_id, generated_at = EXCLUDED.generated_at
            """,
            (revision_id, now, asset["id"]),
        )


def _release_component_fast(
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
    conn.execute(
        """
        INSERT INTO component_release_records (
            id, component_id, revision_id, release_label, manifest_hash, released_by,
            approval_decision_id, validation_json, policy_json, created_at
        ) VALUES (%s, %s, %s, %s, %s, %s, '', '{}', %s, %s)
        ON CONFLICT(component_id, revision_id, manifest_hash) DO NOTHING
        """,
        (
            str(uuid.uuid4()), component_id, revision_id, "database-library-import",
            manifest_hash, DATABASE_LIBRARY_IMPORT_ACTOR,
            json.dumps({"trusted_import": True}, sort_keys=True, separators=(",", ":")), now,
        ),
    )
    service._append_audit_event(  # type: ignore[attr-defined]
        conn,
        component_id=component_id,
        revision_id=revision_id,
        event_type="component.released",
        actor=DATABASE_LIBRARY_IMPORT_ACTOR,
        details={"manifest_hash": manifest_hash, "trusted_import": True},
    )


def _finalize_import_component_fast(
    service: Any,
    conn: Any,
    *,
    component_id: str,
    revision_id: str,
    now: str,
) -> str:
    manifest_hash = service._revision_manifest_hash(conn, revision_id)  # type: ignore[attr-defined]
    conn.execute(
        "UPDATE component_revisions SET manifest_hash = %s, updated_at = %s WHERE id = %s",
        (manifest_hash, now, revision_id),
    )
    service._append_audit_event(  # type: ignore[attr-defined]
        conn,
        component_id=component_id,
        revision_id=revision_id,
        event_type="component.created",
        actor=DATABASE_LIBRARY_IMPORT_ACTOR,
        details={
            "change_kind": "import",
            "change_summary": "Imported grouped database-library component",
            "manifest_hash": manifest_hash,
        },
    )
    return manifest_hash


def _insert_import_component(
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
            id, slug, identity_kind, identity_source, normalized_manufacturer,
            normalized_part_number, source, external_source, external_id, is_active, current_revision_id,
            released_revision_id, created_at, updated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, 'import', %s, %s, 1, %s, '', %s, %s)
        """,
        (
            component_id,
            slug,
            metadata["identity_kind"],
            metadata["identity_source"] if metadata["identity_kind"] == "provisional_ipn" else "",
            metadata["normalized_manufacturer"] if metadata["identity_kind"] == "mpn" else "",
            metadata["normalized_part_number"],
            CERN_EXTERNAL_SOURCE,
            metadata["import_source_namespace"],
            revision_id,
            now,
            now,
        ),
    )
    conn.execute(
        """
        INSERT INTO component_revisions (
            id, component_id, version, parent_revision_id, change_kind, change_summary, created_by,
            manifest_hash, manifest_schema, release_status, name, value, description, datasheet_url,
            manufacturer, mpn, normalized_manufacturer, normalized_mpn, mpn_source,
            category, package_name, vendor, vendor_part_number, mass_g,
            rqjc_c_w, rqjc_top_c_w, temp_max_c, temp_min_c, power_dissipation_w, rate, sap_code,
            summary, keywords, extra_fields, search_document, created_at, updated_at
        )
        VALUES (
            %s, %s, 1, '', 'import', 'Imported from database library', %s,
            '', %s, 'open', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s
        )
        """,
        (
            revision_id,
            component_id,
            DATABASE_LIBRARY_IMPORT_ACTOR,
            REVISION_MANIFEST_A3,
            metadata["name"],
            metadata["value"],
            metadata["description"],
            metadata["datasheet_url"],
            metadata["manufacturer"],
            metadata["mpn"],
            metadata["normalized_manufacturer"],
            metadata["normalized_mpn"],
            metadata["mpn_source"],
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
            json.dumps(metadata_keywords(metadata), separators=(",", ":")),
            json.dumps(metadata["extra_fields"], sort_keys=True, separators=(",", ":")),
            metadata_search_document(metadata),
            now,
            now,
        ),
    )
    return component_id, revision_id


def _collect_import_plans(
    source_conn: sqlite3.Connection,
    tables: list[str],
    *,
    symbol_libraries: dict[str, SymbolLibrary],
    footprint_index: dict[str, dict[str, FootprintAsset | None]],
    service: Any,
    stats: ImportStats,
    allow_missing_assets: bool,
    limit: int,
    source_namespace: str,
) -> list[ImportRowPlan]:
    column_maps = _table_column_maps(source_conn, tables)
    plans: list[ImportRowPlan] = []

    for table in tables:
        rows = source_conn.execute(
            f'SELECT rowid AS __prism_rowid__, * FROM "{table}" ORDER BY rowid'
        )
        column_map = column_maps[table]
        for row in rows:
            stats.database_rows_seen += 1
            if limit and stats.rows_selected >= limit:
                return plans

            part_number = _row_get_cached(row, column_map, *IPN_COLUMNS)
            symbol_ref = _row_get_cached(row, column_map, "LibSymbol")
            footprint_ref = _row_get_cached(row, column_map, "LibFootprint")
            if not part_number:
                stats.skipped_rows += 1
                _record_error(stats, f"{table}: row without Part Number")
                continue

            import_name = part_number

            symbol_library_ref, symbol_name_ref = _split_library_ref(symbol_ref)
            footprint_library_ref, footprint_name_ref = _split_library_ref(footprint_ref)
            symbol_library, symbol_name, symbol_error = _resolve_symbol(
                symbol_libraries, symbol_library_ref, symbol_name_ref
            )
            footprint_asset, footprint_error = _resolve_footprint(
                footprint_index, footprint_library_ref, footprint_name_ref
            )

            if symbol_error == "ambiguous":
                stats.ambiguous_symbol_refs += 1
                _record_error(stats, f"{table}:{part_number}: ambiguous symbol '{symbol_ref}'")
            elif symbol_error:
                stats.missing_symbol_refs += 1
                _record_error(
                    stats,
                    f"{table}:{part_number}: unresolved symbol '{symbol_ref}' ({symbol_error})",
                )
            if footprint_error == "ambiguous":
                stats.ambiguous_footprint_refs += 1
                _record_error(stats, f"{table}:{part_number}: ambiguous footprint '{footprint_ref}'")
            elif footprint_error:
                stats.missing_footprint_refs += 1
                _record_error(
                    stats,
                    f"{table}:{part_number}: unresolved footprint '{footprint_ref}' ({footprint_error})",
                )

            if (symbol_error or footprint_error) and not allow_missing_assets:
                stats.skipped_rows += 1
                continue

            stats.rows_selected += 1
            metadata = normalize_metadata(
                _metadata_from_row_cached(
                    row, table, import_name, column_map, source_namespace
                )
            )
            metadata["import_source_namespace"] = source_namespace
            if metadata["extra_fields"].get(MPN_SOURCE_FIELD_LABEL) == MPN_SOURCE_DATABASE:
                stats.mpn_recovered += 1
            else:
                stats.mpn_fallback += 1
            plans.append(
                ImportRowPlan(
                    table=table,
                    rowid=int(row["__prism_rowid__"]),
                    part_number=part_number,
                    import_name=import_name,
                    metadata=metadata,
                    symbol_library=symbol_library,
                    symbol_name=symbol_name,
                    footprint_asset=footprint_asset,
                    symbol_error=symbol_error,
                    footprint_error=footprint_error,
                )
            )
    return plans


def _asset_pair_key(plan: ImportRowPlan) -> tuple[str, str, str, str]:
    symbol_library = plan.symbol_library.target_library if plan.symbol_library else ""
    footprint_library = plan.footprint_asset.target_library if plan.footprint_asset else ""
    footprint_name = plan.footprint_asset.target_name if plan.footprint_asset else ""
    return (symbol_library, plan.symbol_name, footprint_library, footprint_name)


def _group_import_plans(
    plans: list[ImportRowPlan], *, stats: ImportStats
) -> list[ComponentGroupPlan]:
    grouped: dict[tuple[str, str, str], list[ImportRowPlan]] = {}
    for plan in sorted(plans, key=lambda item: item.stable_order):
        metadata = plan.metadata
        if metadata["identity_kind"] == "mpn":
            key = (
                "mpn",
                str(metadata["manufacturer"]).strip().casefold(),
                str(metadata["mpn"]).strip().casefold(),
            )
        else:
            key = (
                "provisional_ipn",
                str(metadata["identity_source"]).strip().casefold(),
                plan.part_number.strip().casefold(),
            )
        grouped.setdefault(key, []).append(plan)

    result: list[ComponentGroupPlan] = []
    for key in sorted(grouped):
        rows = sorted(grouped[key], key=lambda item: item.stable_order)
        canonical = next((row for row in rows if not row.is_alternate), rows[0])
        metadata = dict(canonical.metadata)
        metadata["name"] = canonical.part_number
        metadata["extra_fields"] = dict(metadata.get("extra_fields") or {})
        all_ipns = list(dict.fromkeys(row.part_number for row in rows))
        metadata["extra_fields"][IPN_FIELD_LABEL] = canonical.part_number
        metadata["extra_fields"]["Alternate Internal Part Numbers"] = ", ".join(
            ipn for ipn in all_ipns if ipn != canonical.part_number
        )

        warnings: list[str] = []
        for field_name in ("description", "value", "datasheet_url", "category"):
            values = sorted(
                {
                    str(row.metadata.get(field_name) or "").strip()
                    for row in rows
                    if str(row.metadata.get(field_name) or "").strip()
                },
                key=str.casefold,
            )
            if len(values) > 1:
                warnings.append(f"{field_name} differs across {len(values)} source values")
        stats.warnings.extend(f"{key}: {warning}" for warning in warnings)

        pair_groups: dict[tuple[str, str, str, str], list[ImportRowPlan]] = {}
        for row in rows:
            pair_groups.setdefault(_asset_pair_key(row), []).append(row)
        representations: list[RepresentationPlan] = []
        for pair_rows in pair_groups.values():
            pair_rows.sort(key=lambda item: item.stable_order)
            representative = pair_rows[0]
            packages_by_ipn: dict[str, set[str]] = {}
            for row in pair_rows:
                package_name = str(row.metadata.get("package_name") or "").strip()
                if package_name:
                    packages_by_ipn.setdefault(row.part_number.casefold(), set()).add(package_name)
            for source_ipn, package_names in packages_by_ipn.items():
                if len(package_names) > 1:
                    stats.hard_conflicts.append(
                        f"{key} pair {_asset_pair_key(representative)} source IPN {source_ipn!r}: "
                        f"conflicting package names: {', '.join(sorted(package_names, key=str.casefold))}"
                    )
            source_ipns = list(dict.fromkeys(row.part_number for row in pair_rows))
            provenance = [
                {
                    "table": row.table,
                    "rowid": row.rowid,
                    "internal_part_number": row.part_number,
                    "category": row.metadata.get("category", ""),
                    "datasheet_url": row.metadata.get("datasheet_url", ""),
                    "package_name": row.metadata.get("package_name", ""),
                }
                for row in pair_rows
            ]
            label_parts = [
                representative.symbol_name,
                representative.footprint_asset.target_name if representative.footprint_asset else "",
            ]
            representations.append(
                RepresentationPlan(
                    label=" / ".join(part for part in label_parts if part) or representative.part_number,
                    symbol_library=representative.symbol_library,
                    symbol_name=representative.symbol_name,
                    footprint_asset=representative.footprint_asset,
                    source_ipns=source_ipns,
                    provenance=provenance,
                    stable_order=representative.stable_order,
                )
            )
        representation_packages = sorted(
            {
                str(row.metadata.get("package_name") or "").strip()
                for row in rows
                if str(row.metadata.get("package_name") or "").strip()
            },
            key=str.casefold,
        )
        if len(representation_packages) > 1:
            warning = (
                f"package_name differs across {len(representation_packages)} source values"
            )
            warnings.append(warning)
            stats.warnings.append(f"{key}: {warning}")
        representations.sort(
            key=lambda item: (
                all("[alt]" in ipn.casefold() for ipn in item.source_ipns),
                item.stable_order,
            )
        )
        if representations:
            representations[0].is_default = True
        result.append(
            ComponentGroupPlan(
                key=key,
                identity_kind=str(metadata["identity_kind"]),
                identity_source=str(metadata["identity_source"]),
                metadata=metadata,
                rows=rows,
                representations=representations,
                warnings=warnings,
            )
        )

    stats.component_groups = len(result)
    stats.representation_groups = sum(len(group.representations) for group in result)
    stats.provisional_groups = sum(
        group.identity_kind == "provisional_ipn" for group in result
    )
    stats.duplicate_part_numbers = len(plans) - len(result)
    return result


def _metadata_from_row_cached(
    row: sqlite3.Row,
    table: str,
    import_name: str,
    column_map: dict[str, str],
    source_namespace: str,
) -> dict[str, str]:
    value = _row_get_cached(row, column_map, "Value", "Comment") or import_name
    description = _row_get_cached(row, column_map, "Part Description", "Description", "Comment") or import_name
    manufacturer = _row_get_cached(row, column_map, "Manufacturer") or "TBD"
    datasheet = _row_get_cached(row, column_map, "Datasheet", "HelpURL") or "TBD"
    category = _row_get_cached(row, column_map, "Database Table Name") or table
    mpn, mpn_source = _resolve_mpn(
        _row_get_cached(row, column_map, *MPN_COLUMNS), import_name
    )
    extra_fields = _extra_fields_from_row(
        lambda column: _row_get_cached(row, column_map, column),
        import_name=import_name,
        mpn_source=mpn_source,
    )
    identity_kind = "mpn" if mpn else "provisional_ipn"
    return {
        "name": import_name,
        "value": value,
        "description": description,
        "datasheet_url": datasheet,
        "manufacturer": manufacturer,
        "mpn": mpn,
        "identity_kind": identity_kind,
        "identity_source": source_namespace if identity_kind == "provisional_ipn" else "manufacturer_mpn",
        "import_source_namespace": source_namespace,
        "category": category,
        "package_name": _row_get_cached(row, column_map, "PackageDescription", "Case"),
        "vendor": "",
        "vendor_part_number": "",
        "mass_g": "",
        "rqjc_c_w": "",
        "rqjc_top_c_w": "",
        "temp_max_c": "",
        "temp_min_c": "",
        "power_dissipation_w": _row_get_cached(row, column_map, "Power"),
        "rate": "",
        "sap_code": _row_get_cached(row, column_map, "SCEM"),
        "extra_fields": extra_fields,
    }


def _resolve_mpn(database_mpn: str, import_name: str) -> tuple[str, str]:
    """Return a real MPN or mark the row provisional without contaminating MPN."""
    cleaned = database_mpn.strip()
    if cleaned:
        return cleaned, MPN_SOURCE_DATABASE
    _ = import_name
    return "", MPN_SOURCE_PROVISIONAL


def _extra_fields_from_row(
    read: Callable[[str], str],
    *,
    import_name: str,
    mpn_source: str,
) -> dict[str, str]:
    """Preserve database columns the catalog has no dedicated column for."""
    extra_fields = {
        IPN_FIELD_LABEL: import_name,
        MPN_SOURCE_FIELD_LABEL: mpn_source,
    }
    for column in EXTRA_FIELD_COLUMNS:
        cleaned = _clean_extra_value(column, read(column))
        if cleaned:
            extra_fields[column] = cleaned
    return extra_fields


def _register_planned_assets(
    plans: list[ImportRowPlan],
    *,
    service: Any,
    target_conn: Any,
    stats: ImportStats,
    overwrite_assets: bool,
    generate_previews: bool,
    runtime_store_root: Path | None,
    symbol_payload_cache: dict[tuple[str, str], bytes],
    symbol_asset_cache: dict[tuple[str, str], dict[str, Any]],
    footprint_asset_cache: dict[tuple[str, str], dict[str, Any]],
    commit_batch: int,
) -> None:
    symbol_jobs: dict[tuple[str, str], SymbolLibrary] = {}
    footprint_jobs: dict[tuple[str, str], FootprintAsset] = {}
    for plan in plans:
        if plan.symbol_library and plan.symbol_name:
            symbol_jobs[(plan.symbol_library.target_library, plan.symbol_name)] = plan.symbol_library
        if plan.footprint_asset:
            footprint_jobs[(plan.footprint_asset.target_library, plan.footprint_asset.target_name)] = plan.footprint_asset

    pending = 0
    started = time.perf_counter()

    def _commit_asset_batch(label: str) -> None:
        nonlocal pending
        if pending <= 0:
            return
        target_conn.commit()
        _begin_import_transaction(target_conn)
        elapsed = max(time.perf_counter() - started, 0.001)
        print(
            f"{label}: registered {stats.symbol_assets_registered} symbols, "
            f"{stats.footprint_assets_registered} footprints "
            f"({(stats.symbol_assets_registered + stats.footprint_assets_registered) / elapsed:.1f} assets/s)",
            flush=True,
        )
        pending = 0

    for (target_library, symbol_name), library in sorted(symbol_jobs.items()):
        key = (target_library, symbol_name)
        if key in symbol_asset_cache:
            continue
        payload = _symbol_payload_cached(symbol_payload_cache, library, symbol_name)
        destination = service._symbol_destination(target_library, symbol_name)  # type: ignore[attr-defined]
        canonical = _write_or_copy(destination, None, payload, overwrite=overwrite_assets)
        asset = _register_asset(
            service,
            target_conn,
            asset_type="symbol",
            canonical_path=canonical,
            target_library=target_library,
            target_name=symbol_name,
            source_group=library.path.name,
            runtime_store_root=runtime_store_root,
        )
        if generate_previews:
            preview_asset = dict(asset)
            preview_asset["canonical_path"] = str(canonical)
            service._ensure_asset_preview(target_conn, preview_asset)  # type: ignore[attr-defined]
        symbol_asset_cache[key] = asset
        stats.symbol_assets_registered += 1
        pending += 1
        if pending >= commit_batch:
            _commit_asset_batch("Asset batch")

    for (target_library, target_name), footprint in sorted(footprint_jobs.items()):
        key = (target_library, target_name)
        if key in footprint_asset_cache:
            continue
        destination = service._footprint_destination(target_library, target_name)  # type: ignore[attr-defined]
        canonical = _write_or_copy(destination, footprint.path, None, overwrite=overwrite_assets)
        asset = _register_asset(
            service,
            target_conn,
            asset_type="footprint",
            canonical_path=canonical,
            target_library=target_library,
            target_name=target_name,
            source_group=footprint.path.parent.name,
            runtime_store_root=runtime_store_root,
        )
        if generate_previews:
            preview_asset = dict(asset)
            preview_asset["canonical_path"] = str(canonical)
            service._ensure_asset_preview(target_conn, preview_asset)  # type: ignore[attr-defined]
        footprint_asset_cache[key] = asset
        stats.footprint_assets_registered += 1
        pending += 1
        if pending >= commit_batch:
            _commit_asset_batch("Asset batch")

    _commit_asset_batch("Asset registration complete")


def _import_groups(
    groups: list[ComponentGroupPlan],
    *,
    service: Any,
    target_conn: Any,
    stats: ImportStats,
    symbol_asset_cache: dict[tuple[str, str], dict[str, Any]],
    footprint_asset_cache: dict[tuple[str, str], dict[str, Any]],
    release_imported: bool,
    commit_batch: int,
) -> None:
    used_slugs: set[str] = set()
    imported_since_commit = 0
    started = time.perf_counter()

    def _commit_import_batch(force: bool = False) -> None:
        nonlocal imported_since_commit
        if not force and imported_since_commit < max(1, commit_batch):
            return
        target_conn.commit()
        _begin_import_transaction(target_conn)
        imported_since_commit = 0
        elapsed = max(time.perf_counter() - started, 0.001)
        print(
            f"Committed batch: {stats.components_created} created, "
            f"{stats.components_released} released, {stats.skipped_rows} skipped "
            f"({stats.components_created / elapsed:.1f} components/s)",
            flush=True,
        )

    def _recover_import_transaction() -> None:
        nonlocal imported_since_commit
        target_conn.rollback()
        _begin_import_transaction(target_conn)
        imported_since_commit = 0

    # Components are inserted with raw SQL, which bypasses the service path that
    # normally registers discovered fields. Register them once up front so the
    # preserved database columns appear as labelled fields rather than as opaque
    # keys in the extra-fields blob.
    discovered_keys = {
        key
        for group in groups
        for key in group.metadata.get("extra_fields", {})
    }
    if discovered_keys:
        CatalogMetadataSchema().ensure_extra_field_definitions(
            target_conn,
            sorted(discovered_keys),
            actor=DATABASE_LIBRARY_IMPORT_ACTOR,
        )

    for group in groups:
        try:
            now = _utc_now_iso()
            slug = _unique_slug_local(
                used_slugs,
                group.metadata["mpn"]
                or group.metadata["name"]
                or group.metadata["value"],
            )
            component_id, revision_id = _insert_import_component(
                service,
                target_conn,
                metadata=group.metadata,
                slug=slug,
                now=now,
            )
            stats.components_created += 1

            default_complete = False
            for display_order, representation in enumerate(group.representations):
                symbol_asset = None
                footprint_asset = None
                if representation.symbol_library and representation.symbol_name:
                    symbol_asset = symbol_asset_cache[
                        (representation.symbol_library.target_library, representation.symbol_name)
                    ]
                    _link_asset_fast(target_conn, revision_id, symbol_asset, required=True, now=now)
                    stats.symbol_links_created += 1
                if representation.footprint_asset:
                    footprint_asset = footprint_asset_cache[
                        (
                            representation.footprint_asset.target_library,
                            representation.footprint_asset.target_name,
                        )
                    ]
                    _link_asset_fast(target_conn, revision_id, footprint_asset, required=True, now=now)
                    stats.footprint_links_created += 1
                target_conn.execute(
                    """
                    INSERT INTO revision_representations (
                        id, revision_id, label, symbol_asset_id, footprint_asset_id, is_default,
                        display_order, source_internal_part_number, provenance_json, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        str(uuid.uuid4()),
                        revision_id,
                        representation.label,
                        symbol_asset["id"] if symbol_asset else None,
                        footprint_asset["id"] if footprint_asset else None,
                        1 if representation.is_default else 0,
                        display_order,
                        representation.source_ipns[0] if representation.source_ipns else "",
                        json.dumps(
                            {
                                "source_ipns": representation.source_ipns,
                                "rows": representation.provenance,
                            },
                            sort_keys=True,
                            separators=(",", ":"),
                        ),
                        now,
                        now,
                    ),
                )
                if representation.is_default:
                    default_complete = bool(symbol_asset and footprint_asset)

            _finalize_import_component_fast(
                service,
                target_conn,
                component_id=component_id,
                revision_id=revision_id,
                now=now,
            )

            if (
                release_imported
                and group.identity_kind == "mpn"
                and default_complete
            ):
                _release_component_fast(
                    service,
                    target_conn,
                    component_id=component_id,
                    revision_id=revision_id,
                    now=now,
                )
                stats.components_released += 1

            imported_since_commit += 1
            _commit_import_batch()
        except Exception as exc:  # noqa: BLE001
            stats.skipped_rows += 1
            _record_error(stats, f"{group.key}: {exc}")
            _recover_import_transaction()

    _commit_import_batch(force=True)


def _autodiscover_database(source_root: Path) -> Path:
    preferred = [source_root / "CERN.sqlite", source_root / "library.sqlite", source_root / "database.sqlite"]
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
    raise ValueError(f"Multiple SQLite databases found; pass --database explicitly: {', '.join(str(path) for path in matches)}")


def _database_tables(conn: sqlite3.Connection, include_tables: set[str]) -> list[str]:
    tables = [
        str(row[0])
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    ]
    selected: list[str] = []
    for table in tables:
        if include_tables and table not in include_tables:
            continue
        columns = {str(row["name"]) for row in conn.execute(f'PRAGMA table_info("{table}")')}
        if "Part Number" in columns and ("LibSymbol" in columns or "LibFootprint" in columns):
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
        raise ValueError(f"Selected symbol was not found in {library.path.name}: {selected_symbol}")
    escaped_name = re.escape(selected_symbol)
    unit_pattern = re.compile(rf"^{escaped_name}_\d+_\d+$")
    unit_blocks = [block for name, block in library.block_items if unit_pattern.match(name)]
    all_blocks_text = "\n  ".join([base_block] + unit_blocks)
    return (
        f"(kicad_symbol_lib (version {library.version}) (generator {library.generator})\n"
        f"  {all_blocks_text}\n"
        f")\n"
    ).encode("utf-8")


def _build_footprint_index(footprints_root: Path) -> dict[str, dict[str, FootprintAsset | None]]:
    index: dict[str, dict[str, FootprintAsset | None]] = {}
    for footprint_file in sorted(footprints_root.rglob("*.kicad_mod")):
        pretty_dir = next((parent for parent in [footprint_file.parent, *footprint_file.parents] if parent.suffix.lower() == ".pretty"), None)
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
    row: sqlite3.Row,
    table: str,
    import_name: str,
    source_namespace: str = "database-library",
) -> dict[str, str]:
    value = _row_get(row, "Value", "Comment") or import_name
    description = _row_get(row, "Part Description", "Description", "Comment") or import_name
    manufacturer = _row_get(row, "Manufacturer") or "TBD"
    datasheet = _row_get(row, "Datasheet", "HelpURL") or "TBD"
    category = _row_get(row, "Database Table Name") or table
    mpn, mpn_source = _resolve_mpn(_row_get(row, *MPN_COLUMNS), import_name)
    identity_kind = "mpn" if mpn else "provisional_ipn"
    return {
        "name": import_name,
        "value": value,
        "description": description,
        "datasheet_url": datasheet,
        "manufacturer": manufacturer,
        "mpn": mpn,
        "identity_kind": identity_kind,
        "identity_source": source_namespace if identity_kind == "provisional_ipn" else "manufacturer_mpn",
        "import_source_namespace": source_namespace,
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
        "extra_fields": _extra_fields_from_row(
            lambda column: _row_get(row, column),
            import_name=import_name,
            mpn_source=mpn_source,
        ),
    }


def _runtime_path(local_path: Path, local_store_root: Path, runtime_store_root: Path | None) -> str:
    if runtime_store_root is None:
        return str(local_path.resolve())
    relative = local_path.resolve().relative_to(local_store_root.resolve())
    return str((runtime_store_root / relative).as_posix())


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


def _clear_catalog(conn: Any) -> None:
    tables = ", ".join(f'"{table}"' for table in CATALOG_TRUNCATE_TABLES)
    conn.execute(f"TRUNCATE TABLE {tables} RESTART IDENTITY CASCADE")


def _enable_catalog_migration(conn: Any) -> None:
    conn.execute("SET LOCAL prism.catalog_migration = 'on'")


def _begin_import_transaction(conn: Any) -> None:
    _enable_catalog_migration(conn)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Import a KiCad database library into Prism. The source root should contain a SQLite "
            "database with component rows plus KiCad symbol and footprint library folders."
        )
    )
    parser.add_argument("source_root", type=Path, help="Library root, for example a CERN library checkout.")
    parser.add_argument("--database", type=Path, default=None, help="Source SQLite database. Defaults to autodiscovery in source_root.")
    parser.add_argument("--symbols-dir", default="SchLib", help="Symbol library directory name under source_root.")
    parser.add_argument("--footprints-dir", default="PcbLib", help="Footprint library directory name under source_root.")
    parser.add_argument("--include-table", action="append", default=[], help="Import only this source table. Can be repeated.")
    parser.add_argument("--store-root", type=Path, default=None, help="Local Prism canonical component store root.")
    parser.add_argument("--runtime-store-root", type=Path, default=None, help="Canonical store root to write into DB paths, e.g. /app/projects/.kicad-prism/components.")
    parser.add_argument("--database-url", default=os.environ.get("PRISM_DATABASE_URL", ""), help="Target Prism PostgreSQL URL.")
    parser.add_argument("--replace-catalog", action="store_true", help="Delete existing Prism catalog component/asset rows before importing.")
    parser.add_argument("--overwrite-assets", action="store_true", help="Overwrite canonical asset files when content differs.")
    parser.add_argument("--allow-missing-assets", action="store_true", help="Create metadata rows even when symbol or footprint refs cannot be resolved.")
    parser.add_argument("--no-release", action="store_true", help="Keep imported rows open instead of directly marking complete rows released.")
    parser.add_argument("--generate-previews", action="store_true", help="Generate symbol and footprint SVG previews. This can be slow for large libraries.")
    parser.add_argument("--dry-run", action="store_true", help="Resolve rows and report counts without writing files or DB rows.")
    parser.add_argument("--strict", action="store_true", help="Exit non-zero when any row fails or is skipped.")
    parser.add_argument("--limit", type=int, default=0, help="Import at most this many database rows after filtering.")
    parser.add_argument("--commit-batch", type=int, default=500, help="Commit PostgreSQL changes every N imported rows/assets.")
    parser.add_argument("--report-json", type=Path, default=None, help="Optional JSON report path.")
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

    database_path = (args.database.expanduser().resolve() if args.database else _autodiscover_database(source_root))
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

    service = ComponentCatalogService(store_root=args.store_root, database_url=args.database_url or None)
    stats = ImportStats()
    runtime_store_root = args.runtime_store_root
    include_tables = set(args.include_table or [])

    print(f"Indexing symbol libraries from {symbols_root} ...", flush=True)
    symbol_libraries = _build_symbol_index(service, symbols_root)
    print(f"Indexing footprint libraries from {footprints_root} ...", flush=True)
    footprint_index = _build_footprint_index(footprints_root)

    source_conn = sqlite3.connect(f"file:{database_path}?mode=ro", uri=True)
    source_conn.row_factory = sqlite3.Row
    source_conn.execute("PRAGMA query_only = ON")
    source_conn.execute("PRAGMA temp_store = MEMORY")
    source_conn.execute("PRAGMA cache_size = -64000")
    tables = _database_tables(source_conn, include_tables)
    stats.database_tables_seen = len(tables)

    print(f"Scanning {stats.database_tables_seen} source tables ...", flush=True)
    plans = _collect_import_plans(
        source_conn,
        tables,
        symbol_libraries=symbol_libraries,
        footprint_index=footprint_index,
        service=service,
        stats=stats,
        allow_missing_assets=args.allow_missing_assets,
        limit=args.limit,
        source_namespace=f"cern:{database_path.stem}",
    )
    groups = _group_import_plans(plans, stats=stats)
    print(
        f"Prepared {len(plans)} source rows as {len(groups)} components and "
        f"{stats.representation_groups} representations "
        f"({stats.skipped_rows} skipped during scan)",
        flush=True,
    )
    print(
        f"Manufacturer part numbers: {stats.mpn_recovered} from the source database, "
        f"{stats.mpn_fallback} provisional by source internal part number",
        flush=True,
    )

    symbol_payload_cache: dict[tuple[str, str], bytes] = {}
    symbol_asset_cache: dict[tuple[str, str], dict[str, Any]] = {}
    footprint_asset_cache: dict[tuple[str, str], dict[str, Any]] = {}
    fatal_error = False

    target_conn_context = None
    target_conn = None
    try:
        if stats.hard_conflicts:
            fatal_error = True
            for conflict in stats.hard_conflicts:
                _record_error(stats, conflict)
        elif not args.dry_run:
            service.initialize()
            target_conn_context = service._connect()  # type: ignore[attr-defined]
            target_conn = target_conn_context.__enter__()
            _begin_import_transaction(target_conn)
            if args.replace_catalog:
                print("Clearing existing Prism catalog rows ...", flush=True)
                _clear_catalog(target_conn)
                target_conn.commit()
                _begin_import_transaction(target_conn)

            print("Registering canonical symbol and footprint assets ...", flush=True)
            _register_planned_assets(
                plans,
                service=service,
                target_conn=target_conn,
                stats=stats,
                overwrite_assets=args.overwrite_assets,
                generate_previews=args.generate_previews,
                runtime_store_root=runtime_store_root,
                symbol_payload_cache=symbol_payload_cache,
                symbol_asset_cache=symbol_asset_cache,
                footprint_asset_cache=footprint_asset_cache,
                commit_batch=max(50, args.commit_batch),
            )

            print("Importing component metadata and release records ...", flush=True)
            _import_groups(
                groups,
                service=service,
                target_conn=target_conn,
                stats=stats,
                symbol_asset_cache=symbol_asset_cache,
                footprint_asset_cache=footprint_asset_cache,
                release_imported=not args.no_release,
                commit_batch=max(50, args.commit_batch),
            )
            if stats.components_created != len(groups):
                fatal_error = True
                _record_error(
                    stats,
                    f"Component import incomplete: created {stats.components_created} of {len(groups)} groups",
                )
    except Exception as exc:  # noqa: BLE001
        fatal_error = True
        if target_conn is not None:
            target_conn.rollback()
        _record_error(stats, str(exc))
    finally:
        source_conn.close()
        if target_conn_context is not None:
            target_conn_context.__exit__(None, None, None)

    report = asdict(stats)
    report["groups"] = [
        {
            "key": list(group.key),
            "identity_kind": group.identity_kind,
            "canonical_internal_part_number": group.metadata["name"],
            "manufacturer": group.metadata["manufacturer"],
            "mpn": group.metadata["mpn"],
            "source_internal_part_numbers": [row.part_number for row in group.rows],
            "representations": [
                {
                    "label": representation.label,
                    "symbol": (
                        f"{representation.symbol_library.target_library}:{representation.symbol_name}"
                        if representation.symbol_library and representation.symbol_name
                        else ""
                    ),
                    "footprint": (
                        f"{representation.footprint_asset.target_library}:{representation.footprint_asset.target_name}"
                        if representation.footprint_asset
                        else ""
                    ),
                    "source_internal_part_numbers": representation.source_ipns,
                    "default": representation.is_default,
                }
                for representation in group.representations
            ],
            "warnings": group.warnings,
        }
        for group in groups
    ]
    report.update(
        {
            "source_root": str(source_root),
            "source_database": str(database_path),
            "symbols_root": str(symbols_root),
            "footprints_root": str(footprints_root),
            "target_database": "postgresql:catalog",
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

    if args.report_json:
        print(
            json.dumps(
                {
                    key: value
                    for key, value in report.items()
                    if key != "groups"
                },
                indent=2,
            )
        )
        print(f"Detailed group report written to {args.report_json}")
    else:
        print(json.dumps(report, indent=2))
    return 1 if fatal_error or (args.strict and (stats.errors or stats.skipped_rows)) else 0


if __name__ == "__main__":
    raise SystemExit(main())
