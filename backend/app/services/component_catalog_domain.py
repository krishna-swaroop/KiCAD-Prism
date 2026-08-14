from __future__ import annotations

import base64
import csv
from decimal import Decimal, InvalidOperation
import hashlib
import hmac
import io
import json
import logging
import mimetypes
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
import zipfile
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Iterator
from urllib.parse import urlparse
from xml.etree import ElementTree

from app.core.config import settings

logger = logging.getLogger(__name__)

DEFAULT_STORE_DIRNAME = ".kicad-prism"
DBL_EXPORT_DIRNAME = "kicad-dbl"
KLC_VALIDATION_DIRNAME = "klc"

PREVIEW_KIND_SYMBOL = "symbol"
PREVIEW_KIND_FOOTPRINT = "footprint"
PREVIEW_STATUS_READY = "ready"
PREVIEW_STATUS_FAILED = "failed"
PREVIEW_PIPELINE_VERSION = "prism-preview-a2-multi-unit"
REVISION_MANIFEST_A0 = "prism.revision_manifest_a0"
REVISION_MANIFEST_A1 = "prism.revision_manifest_a1"
REVISION_MANIFEST_A2 = "prism.revision_manifest_a2"

SOURCE_MANUAL = "manual"
SOURCE_EXTERNAL = "external"
SUPPORTED_ASSET_TYPES = ("symbol", "footprint", "3dmodel", "spice")
PLACE_REQUIRED_ASSET_TYPES = ("symbol", "footprint")
WORKFLOW_STAGES = ("open", "in_progress", "qa_review", "done", "released", "archived")
LEGACY_WORKFLOW_STAGE_MAP = {
    "draft": "open",
    "in_review": "qa_review",
    "qa_approved": "done",
    "released": "released",
    "deprecated": "archived",
}
RELEASE_STATES = WORKFLOW_STAGES

STATE_METADATA_ONLY = "metadata_only"
STATE_FILES_PARTIAL = "files_partial"
STATE_PLACE_READY = "place_ready"

VALIDATION_STATUS_PASSED = "passed"
VALIDATION_STATUS_WARNING = "warning"
VALIDATION_STATUS_FAILED = "failed"
VALIDATION_STATUS_SKIPPED = "skipped"
VALIDATION_STATUS_NOT_RUN = "not_run"
VALIDATION_SEVERITY_ERROR = "error"
VALIDATION_SEVERITY_WARNING = "warning"
VALIDATION_SEVERITY_INFO = "info"
KLC_RELEASE_GATE_VALUES = {"off", "warn", "block"}

SYMBOL_METADATA_FIELD_ORDER: tuple[str, ...] = (
    "Value",
    "Description",
    "Datasheet",
    "Manufacturer",
    "Manufacturer Part Number",
    "Vendor",
    "Vendor Part Number",
    "Mass (g)",
    "RQjC (C/W)",
    "RQjC_top (C/W)",
    "Temp_max (C)",
    "Temp_min (C)",
    "Power Dissipation (W)",
    "Rate",
    "SAP Code",
)

SYMBOL_METADATA_LABEL_TO_KEY = {
    "Value": "value",
    "Description": "description",
    "Datasheet": "datasheet_url",
    "Manufacturer": "manufacturer",
    "Manufacturer Part Number": "mpn",
    "Vendor": "vendor",
    "Vendor Part Number": "vendor_part_number",
    "Mass (g)": "mass_g",
    "RQjC (C/W)": "rqjc_c_w",
    "RQjC_top (C/W)": "rqjc_top_c_w",
    "Temp_max (C)": "temp_max_c",
    "Temp_min (C)": "temp_min_c",
    "Power Dissipation (W)": "power_dissipation_w",
    "Rate": "rate",
    "SAP Code": "sap_code",
}

CSV_REQUIRED_COLUMNS = (
    "value",
    "datasheet",
    "description",
    "manufacturer",
    "manufacturer_part_number",
)

CSV_ASSET_COLUMNS = (
    "symbol_file_path",
    "symbol_target_library",
    "symbol_target_name",
    "footprint_file_path",
    "footprint_target_library",
    "footprint_target_name",
    "model_3d_file_path",
    "spice_file_path",
)

DBL_COMMON_COLUMNS: tuple[str, ...] = (
    "Part Number",
    "Part Number Nocolon",
    "Comment",
    "Value",
    "Manufacturer",
    "Manufacturer Part Number",
    "PackageDescription",
    "Status",
    "Part Description",
    "Datasheet",
    "LibSymbol",
    "LibFootprint",
)

METADATA_SCHEMA_VERSION = "prism.component_metadata_a1"
METADATA_FIELD_TYPES = {"text", "number", "url", "boolean", "enum"}
CSV_SPREADSHEET_TEXT_GUARD = "\u200b"
BUILTIN_METADATA_FIELDS: tuple[dict[str, Any], ...] = (
    {"key": "value", "label": "Value", "group": "core", "type": "text", "required": True},
    {"key": "category", "label": "Category", "group": "core", "type": "text"},
    {"key": "description", "label": "Description", "group": "core", "type": "text", "required": True},
    {"key": "datasheet_url", "label": "Datasheet", "group": "core", "type": "url", "required": True},
    {"key": "manufacturer", "label": "Manufacturer", "group": "core", "type": "text", "required": True},
    {"key": "mpn", "label": "Manufacturer Part Number", "group": "core", "type": "text", "required": True},
    {"key": "vendor", "label": "Vendor", "group": "core", "type": "text"},
    {"key": "vendor_part_number", "label": "Vendor Part Number", "group": "core", "type": "text"},
    {"key": "package_name", "label": "Package / Footprint", "group": "core", "type": "text"},
    {"key": "mass_g", "label": "Mass", "group": "engineering", "type": "number", "unit": "g"},
    {"key": "rqjc_c_w", "label": "RQjC", "group": "engineering", "type": "number", "unit": "C/W"},
    {"key": "rqjc_top_c_w", "label": "RQjC top", "group": "engineering", "type": "number", "unit": "C/W"},
    {"key": "temp_max_c", "label": "Maximum temperature", "group": "engineering", "type": "number", "unit": "C"},
    {"key": "temp_min_c", "label": "Minimum temperature", "group": "engineering", "type": "number", "unit": "C"},
    {"key": "power_dissipation_w", "label": "Power dissipation", "group": "engineering", "type": "number", "unit": "W"},
    {"key": "rate", "label": "Rate", "group": "engineering", "type": "number"},
    {"key": "sap_code", "label": "SAP Code", "group": "core", "type": "text"},
)

_TOP_LEVEL_PROPERTY_RE = re.compile(r'^([ \t]+)\(property "([^"]+)" ')


def _preview_base_kind(kind: str) -> str:
    return kind.split(":unit", 1)[0]


def _preview_unit(kind: str) -> int:
    match = re.search(r":unit(\d+)$", kind)
    return max(1, int(match.group(1))) if match else 1


def _preview_kind(kind: str, unit: int) -> str:
    return kind if unit <= 1 else f"{kind}:unit{unit}"


def _preview_unit_label(kind: str) -> str:
    unit = _preview_unit(kind)
    if unit <= 26:
        return f"Unit {chr(64 + unit)}"
    return f"Unit {unit}"


@dataclass
class CatalogPreview:
    preview_id: str
    component_id: str
    kind: str
    status: str
    content_type: str
    file_path: str
    generation_error: str

    @property
    def id(self) -> str:
        return self.preview_id


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().isoformat()


def _slugify(value: str, default: str = "component") -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "-", (value or "").strip().lower()).strip("._-")
    return cleaned or default


def _sanitize_name(value: str, default: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in {"_", "-", "."} else "_" for ch in (value or "").strip())
    cleaned = cleaned.strip("._-")
    return cleaned or default


def _remote_library_nickname(library_name: str) -> str:
    prefix = _sanitize_name(settings.REMOTE_PROVIDER_LIBRARY_PREFIX, "remote").lower()
    library = _sanitize_name(library_name, "library").lower()
    return f"{prefix}_{library}"


def _escape_symbol_property_value(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _sha256_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _symbol_property_block(name: str, value: str, *, indent: str = "    ", hidden: bool = True) -> str:
    hide = " hide" if hidden else ""
    child_indent = f"{indent}  "
    return (
        f'{indent}(property "{name}" "{_escape_symbol_property_value(value)}" (at 0 0 0)\n'
        f'{child_indent}(effects (font (size 1.27 1.27)){hide})\n'
        f"{indent})\n"
    )


def _symbol_metadata_fields(component: dict[str, Any] | None) -> dict[str, str]:
    if not component:
        return {label: "" for label in SYMBOL_METADATA_FIELD_ORDER}
    fields = {label: str(component.get(key) or "") for label, key in SYMBOL_METADATA_LABEL_TO_KEY.items()}
    for key, value in sorted(dict(component.get("extra_fields") or {}).items()):
        normalized_key = str(key).strip()
        if normalized_key and normalized_key not in fields and normalized_key not in {"Reference", "Footprint"}:
            fields[normalized_key] = str(value or "")
    return fields


def _extract_top_level_symbol_properties(header: str) -> tuple[str, list[tuple[str, str]], str, str]:
    lines = header.splitlines(keepends=True)
    prefix_parts: list[str] = []
    property_blocks: list[tuple[str, str]] = []
    trailing = ""
    first_indent = ""
    index = 0

    while index < len(lines):
        line = lines[index]
        match = _TOP_LEVEL_PROPERTY_RE.match(line)
        if not match:
            if property_blocks:
                trailing = "".join(lines[index:])
                break
            prefix_parts.append(line)
            index += 1
            continue

        indent = match.group(1)
        if not first_indent:
            first_indent = indent
        name = match.group(2)
        depth = line.count("(") - line.count(")")
        block_lines = [line]
        index += 1

        while depth > 0 and index < len(lines):
            block_line = lines[index]
            block_lines.append(block_line)
            depth += block_line.count("(") - block_line.count(")")
            index += 1

        property_blocks.append((name, "".join(block_lines)))

    return "".join(prefix_parts), property_blocks, trailing, first_indent or "    "


def _rewrite_symbol_payload(payload: bytes, footprint_ref: str | None, component: dict[str, Any] | None = None) -> bytes:
    text = payload.decode("utf-8")
    first_symbol_index = text.find('(symbol "')
    marker_index = text.find('(symbol "', first_symbol_index + 1) if first_symbol_index != -1 else -1
    if marker_index <= 0:
        header = text
        suffix = ""
    else:
        header = text[:marker_index]
        suffix = text[marker_index:]

    prefix, extracted_blocks, trailing, indent = _extract_top_level_symbol_properties(header)
    if not extracted_blocks:
        return payload

    existing_blocks = {name: block for name, block in extracted_blocks}
    ordered_names = [name for name, _ in extracted_blocks]
    metadata_fields = _symbol_metadata_fields(component)
    custom_blocks = {
        label: _symbol_property_block(label, value, indent=indent, hidden=label != "Value")
        for label, value in metadata_fields.items()
    }
    if footprint_ref:
        custom_blocks["Footprint"] = _symbol_property_block("Footprint", footprint_ref, indent=indent)
    elif "Footprint" in existing_blocks:
        custom_blocks["Footprint"] = existing_blocks["Footprint"]

    for property_name in SYMBOL_METADATA_FIELD_ORDER:
        if property_name not in ordered_names:
            ordered_names.append(property_name)
    for property_name in sorted(set(metadata_fields) - set(SYMBOL_METADATA_FIELD_ORDER)):
        if property_name not in ordered_names:
            ordered_names.append(property_name)
    if "Footprint" not in ordered_names:
        ordered_names.append("Footprint")

    rebuilt_blocks = [
        custom_blocks.get(property_name, existing_blocks.get(property_name, ""))
        for property_name in ordered_names
    ]
    return (prefix + "".join(rebuilt_blocks) + trailing + suffix).encode("utf-8")


def _rewrite_footprint_payload(
    payload: bytes,
    asset: dict[str, Any],
    model_assets: list[dict[str, Any]] | None = None,
) -> bytes:
    text = payload.decode("utf-8")
    models = list(model_assets or [])
    if not models or "(model " not in text:
        return payload
    prefix = _sanitize_name(settings.REMOTE_PROVIDER_LIBRARY_PREFIX, "remote").lower()
    destination = settings.REMOTE_PROVIDER_DESTINATION_DIR.rstrip("/")
    if destination in {"/RemoteLibrary", "$/RemoteLibrary"}:
        destination = "${KIPRJMOD}/RemoteLibrary"
    model_index = 0

    def replace_model(match: re.Match[str]) -> str:
        nonlocal model_index
        if model_index >= len(models):
            return match.group(0)
        model = models[model_index]
        model_index += 1
        model_name = Path(str(model.get("canonical_path") or model.get("name") or "model.step")).name
        model_path = f"{destination}/{prefix}_3d/{model_name}"
        return f'(model "{model_path}"'

    text = re.sub(r'\(model\s+"[^"]+"', replace_model, text)
    return text.encode("utf-8")


def _dedupe(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            ordered.append(value)
    return ordered


def _discover_symbol_names_in_text(text: str) -> list[str]:
    matches = re.findall(r'\(symbol\s+"([^"]+)"', text)
    filtered = [name for name in matches if not re.search(r"_\d+_\d+$", name)]
    return _dedupe(filtered or matches)


def _discover_footprint_name_in_text(text: str) -> str:
    match = re.search(r'\(footprint\s+"([^"]+)"', text)
    return match.group(1) if match else ""


def _content_type_for_asset(asset_type: str, file_path: Path) -> str:
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


def _release_allows_remote(release_status: str) -> bool:
    return release_status == "released"


def _normalize_workflow_stage(stage: str) -> str:
    normalized = (stage or "").strip().lower()
    return LEGACY_WORKFLOW_STAGE_MAP.get(normalized, normalized)


def _json_loads(value: Any, default: Any) -> Any:
    if value in (None, ""):
        return default
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(str(value))
    except json.JSONDecodeError:
        return default


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _sexpr_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _part_number_nocolon(value: str) -> str:
    cleaned = re.sub(r":+", "_", value.strip())
    cleaned = re.sub(r"\s+", "_", cleaned)
    return cleaned or "PART"


def _dbl_symbol_library_name(part_number: str, symbol_asset: dict[str, Any] | None) -> str:
    if not symbol_asset:
        return ""
    raw = f"Prism_{part_number}_{symbol_asset['target_library']}_{symbol_asset['target_name']}"
    return _sanitize_name(raw, "Prism_Symbol")


class ComponentCatalogDomainService:
    def __init__(self, store_root: Path | None = None, database_url: str | None = None) -> None:
        prism_root = Path(settings.KICAD_PROJECTS_ROOT) / DEFAULT_STORE_DIRNAME
        self._store_root = Path(store_root or prism_root / "components").resolve()
        self._db_path = self._database_path(database_url)
        default_export_root = self._store_root.parent / "exports" / DBL_EXPORT_DIRNAME if store_root else prism_root / "exports" / DBL_EXPORT_DIRNAME
        self._export_root = Path(settings.CATALOG_DBL_EXPORT_DIR or default_export_root).resolve()
        self._validation_root = (self._store_root.parent / "validation" / KLC_VALIDATION_DIRNAME).resolve()
        self._lock = threading.Lock()
        self._initialized = False
        self._kicad_cli: str | None = None
        self._kicad_cli_version: str | None = None
        self._category_cache: list[dict[str, Any]] | None = None
        self._category_cache_ts: float = 0.0
        self._CATEGORY_CACHE_TTL: float = 60.0
        self._fts_available = False

    def _database_path(self, database_url: str | None) -> Path:
        _ = database_url
        return Path("/dev/null")

    @property
    def store_root(self) -> Path:
        return self._store_root

    @property
    def db_path(self) -> Path:
        return self._db_path

    @property
    def export_root(self) -> Path:
        return self._export_root

    @property
    def validation_root(self) -> Path:
        return self._validation_root

    def initialize(self) -> None:
        raise NotImplementedError("Use ComponentCatalogPostgresService")

    def close(self) -> None:
        with self._lock:
            self._initialized = False

    def _ensure_storage_dirs(self) -> None:
        for path in (
            self._store_root / "symbols",
            self._store_root / "footprints",
            self._store_root / "3dmodels",
            self._store_root / "spice",
            self._store_root / "previews" / "symbols",
            self._store_root / "previews" / "footprints",
            self._store_root / "revisions",
            self._export_root,
            self._validation_root,
        ):
            path.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def _connect(self) -> Iterator[Any]:
        raise NotImplementedError("Catalog persistence must provide a PostgreSQL connection")
        yield  # pragma: no cover

    def _create_schema(self, conn: Any) -> None:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS components (
                id TEXT PRIMARY KEY,
                slug TEXT NOT NULL UNIQUE,
                source TEXT NOT NULL DEFAULT 'manual',
                external_source TEXT NOT NULL DEFAULT '',
                external_id TEXT NOT NULL DEFAULT '',
                external_workflow_source TEXT NOT NULL DEFAULT '',
                external_workflow_id TEXT NOT NULL DEFAULT '',
                external_workflow_url TEXT NOT NULL DEFAULT '',
                external_url TEXT NOT NULL DEFAULT '',
                external_payload_json TEXT NOT NULL DEFAULT '{}',
                external_updated_at TEXT,
                sync_status TEXT NOT NULL DEFAULT '',
                sync_error TEXT NOT NULL DEFAULT '',
                stock_quantity REAL NOT NULL DEFAULT 0,
                stock_uom TEXT NOT NULL DEFAULT '',
                inventory_status TEXT NOT NULL DEFAULT '',
                serial_number TEXT NOT NULL DEFAULT '',
                lot_number TEXT NOT NULL DEFAULT '',
                pedigree TEXT NOT NULL DEFAULT '',
                last_synced_at TEXT,
                is_active INTEGER NOT NULL DEFAULT 1,
                current_revision_id TEXT NOT NULL DEFAULT '',
                released_revision_id TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS component_revisions (
                id TEXT PRIMARY KEY,
                component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
                version INTEGER NOT NULL,
                parent_revision_id TEXT NOT NULL DEFAULT '',
                change_kind TEXT NOT NULL DEFAULT 'create',
                change_summary TEXT NOT NULL DEFAULT '',
                created_by TEXT NOT NULL DEFAULT '',
                manifest_hash TEXT NOT NULL DEFAULT '',
                manifest_schema TEXT NOT NULL DEFAULT 'prism.revision_manifest_a0',
                release_status TEXT NOT NULL DEFAULT 'open',
                name TEXT NOT NULL,
                value TEXT NOT NULL,
                description TEXT NOT NULL,
                datasheet_url TEXT NOT NULL,
                manufacturer TEXT NOT NULL,
                mpn TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT '',
                package_name TEXT NOT NULL DEFAULT '',
                vendor TEXT NOT NULL DEFAULT '',
                vendor_part_number TEXT NOT NULL DEFAULT '',
                mass_g TEXT NOT NULL DEFAULT '',
                rqjc_c_w TEXT NOT NULL DEFAULT '',
                rqjc_top_c_w TEXT NOT NULL DEFAULT '',
                temp_max_c TEXT NOT NULL DEFAULT '',
                temp_min_c TEXT NOT NULL DEFAULT '',
                power_dissipation_w TEXT NOT NULL DEFAULT '',
                rate TEXT NOT NULL DEFAULT '',
                sap_code TEXT NOT NULL DEFAULT '',
                summary TEXT NOT NULL DEFAULT '',
                keywords TEXT NOT NULL DEFAULT '[]',
                extra_fields TEXT NOT NULL DEFAULT '{}',
                search_document TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(component_id, version)
            );

            CREATE TABLE IF NOT EXISTS catalog_audit_events (
                id TEXT PRIMARY KEY,
                component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
                sequence INTEGER NOT NULL DEFAULT 0,
                revision_id TEXT NOT NULL DEFAULT '',
                event_type TEXT NOT NULL,
                actor TEXT NOT NULL DEFAULT '',
                details_json TEXT NOT NULL DEFAULT '{}',
                previous_hash TEXT NOT NULL DEFAULT '',
                event_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS project_component_import_sessions (
                id TEXT PRIMARY KEY,
                scope TEXT NOT NULL,
                project_id TEXT NOT NULL DEFAULT '',
                project_ids_json TEXT NOT NULL DEFAULT '[]',
                project_revisions_json TEXT NOT NULL DEFAULT '{}',
                source_revision TEXT NOT NULL DEFAULT '',
                selection_json TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'queued',
                error_message TEXT NOT NULL DEFAULT '',
                created_by TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS project_component_import_proposals (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES project_component_import_sessions(id) ON DELETE CASCADE,
                dedupe_key TEXT NOT NULL,
                component_uid TEXT NOT NULL DEFAULT '',
                reference TEXT NOT NULL DEFAULT '',
                metadata_json TEXT NOT NULL DEFAULT '{}',
                assets_json TEXT NOT NULL DEFAULT '[]',
                provenance_json TEXT NOT NULL DEFAULT '[]',
                findings_json TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'candidate',
                accepted_component_id TEXT NOT NULL DEFAULT '',
                draft_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(session_id, dedupe_key)
            );

            CREATE TABLE IF NOT EXISTS component_usage (
                id TEXT PRIMARY KEY,
                component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
                project_id TEXT NOT NULL,
                source_revision TEXT NOT NULL DEFAULT '',
                references_json TEXT NOT NULL DEFAULT '[]',
                details_json TEXT NOT NULL DEFAULT '[]',
                source TEXT NOT NULL DEFAULT 'project_import',
                is_current INTEGER NOT NULL DEFAULT 1,
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                UNIQUE(component_id, project_id, source_revision)
            );

            CREATE TABLE IF NOT EXISTS component_review_decisions (
                id TEXT PRIMARY KEY,
                component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
                revision_id TEXT NOT NULL REFERENCES component_revisions(id) ON DELETE CASCADE,
                reviewer TEXT NOT NULL DEFAULT '',
                reviewer_role TEXT NOT NULL DEFAULT '',
                decision TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                manifest_hash TEXT NOT NULL DEFAULT '',
                validation_json TEXT NOT NULL DEFAULT '{}',
                policy_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS component_release_records (
                id TEXT PRIMARY KEY,
                component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
                revision_id TEXT NOT NULL REFERENCES component_revisions(id) ON DELETE CASCADE,
                release_label TEXT NOT NULL,
                manifest_hash TEXT NOT NULL,
                released_by TEXT NOT NULL DEFAULT '',
                approval_decision_id TEXT NOT NULL DEFAULT '',
                validation_json TEXT NOT NULL DEFAULT '{}',
                policy_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                UNIQUE(component_id, revision_id, manifest_hash)
            );

            CREATE TABLE IF NOT EXISTS assets (
                id TEXT PRIMARY KEY,
                asset_type TEXT NOT NULL,
                name TEXT NOT NULL,
                canonical_path TEXT NOT NULL,
                target_library TEXT NOT NULL DEFAULT '',
                target_name TEXT NOT NULL DEFAULT '',
                source_group TEXT NOT NULL DEFAULT '',
                sha256 TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                content_type TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(asset_type, canonical_path, target_name)
            );

            CREATE TABLE IF NOT EXISTS revision_assets (
                revision_id TEXT NOT NULL REFERENCES component_revisions(id) ON DELETE CASCADE,
                asset_type TEXT NOT NULL,
                asset_id TEXT NOT NULL REFERENCES assets(id),
                required INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(revision_id, asset_id)
            );

            CREATE TABLE IF NOT EXISTS asset_previews (
                id TEXT PRIMARY KEY,
                asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                kind TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'failed',
                content_type TEXT NOT NULL DEFAULT 'image/svg+xml',
                file_path TEXT NOT NULL DEFAULT '',
                generation_error TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(asset_id, kind)
            );

            CREATE TABLE IF NOT EXISTS asset_preview_versions (
                id TEXT PRIMARY KEY,
                asset_id TEXT NOT NULL REFERENCES assets(id),
                kind TEXT NOT NULL,
                status TEXT NOT NULL,
                content_type TEXT NOT NULL DEFAULT 'image/svg+xml',
                file_path TEXT NOT NULL DEFAULT '',
                sha256 TEXT NOT NULL DEFAULT '',
                size_bytes INTEGER NOT NULL DEFAULT 0,
                generator_name TEXT NOT NULL DEFAULT '',
                generator_version TEXT NOT NULL DEFAULT '',
                pipeline_version TEXT NOT NULL DEFAULT '',
                generator_fingerprint TEXT NOT NULL DEFAULT '',
                generation_error TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                UNIQUE(asset_id, kind, sha256, generator_fingerprint)
            );

            CREATE TABLE IF NOT EXISTS revision_previews (
                revision_id TEXT NOT NULL REFERENCES component_revisions(id) ON DELETE CASCADE,
                asset_id TEXT NOT NULL REFERENCES assets(id),
                kind TEXT NOT NULL,
                preview_id TEXT NOT NULL REFERENCES asset_preview_versions(id),
                created_at TEXT NOT NULL,
                PRIMARY KEY(revision_id, asset_id, kind)
            );

            CREATE TABLE IF NOT EXISTS revision_preview_outputs (
                revision_id TEXT NOT NULL REFERENCES component_revisions(id) ON DELETE CASCADE,
                asset_id TEXT NOT NULL REFERENCES assets(id),
                kind TEXT NOT NULL,
                preview_id TEXT NOT NULL REFERENCES asset_preview_versions(id),
                generated_at TEXT NOT NULL,
                PRIMARY KEY(revision_id, asset_id, kind)
            );

            CREATE TABLE IF NOT EXISTS asset_validation_runs (
                id TEXT PRIMARY KEY,
                component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
                revision_id TEXT NOT NULL REFERENCES component_revisions(id) ON DELETE CASCADE,
                asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                asset_type TEXT NOT NULL,
                checker_type TEXT NOT NULL,
                status TEXT NOT NULL,
                error_count INTEGER NOT NULL DEFAULT 0,
                warning_count INTEGER NOT NULL DEFAULT 0,
                exit_code INTEGER,
                tool_version TEXT NOT NULL DEFAULT '',
                report_dir TEXT NOT NULL DEFAULT '',
                stdout_path TEXT NOT NULL DEFAULT '',
                stderr_path TEXT NOT NULL DEFAULT '',
                junit_path TEXT NOT NULL DEFAULT '',
                json_path TEXT NOT NULL DEFAULT '',
                raw_output TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                finished_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS asset_validation_findings (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL REFERENCES asset_validation_runs(id) ON DELETE CASCADE,
                severity TEXT NOT NULL,
                rule_code TEXT NOT NULL DEFAULT '',
                rule_url TEXT NOT NULL DEFAULT '',
                message TEXT NOT NULL,
                details_json TEXT NOT NULL DEFAULT '[]',
                object_name TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS oauth_auth_codes (
                code TEXT PRIMARY KEY,
                grant_json TEXT NOT NULL,
                exp INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS oauth_revoked_tokens (
                jti TEXT PRIMARY KEY,
                exp INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS oauth_service_clients (
                client_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                secret_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'viewer',
                scopes TEXT NOT NULL DEFAULT '[]',
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_used_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_components_active ON components(is_active);
            CREATE INDEX IF NOT EXISTS idx_components_source ON components(source, external_source, external_id);
            CREATE INDEX IF NOT EXISTS idx_revisions_component ON component_revisions(component_id, version DESC);
            CREATE INDEX IF NOT EXISTS idx_revisions_status ON component_revisions(release_status);
            CREATE INDEX IF NOT EXISTS idx_revisions_category ON component_revisions(category);
            CREATE INDEX IF NOT EXISTS idx_revisions_search ON component_revisions(search_document);
            CREATE INDEX IF NOT EXISTS idx_revisions_mpn ON component_revisions(mpn);
            CREATE INDEX IF NOT EXISTS idx_revisions_updated ON component_revisions(updated_at);
            CREATE INDEX IF NOT EXISTS idx_audit_component ON catalog_audit_events(component_id, created_at, id);
            CREATE INDEX IF NOT EXISTS idx_project_import_status ON project_component_import_sessions(status, created_at);
            CREATE INDEX IF NOT EXISTS idx_project_import_proposals ON project_component_import_proposals(session_id, status, created_at);
            CREATE INDEX IF NOT EXISTS idx_component_usage_component ON component_usage(component_id, last_seen_at DESC);
            CREATE INDEX IF NOT EXISTS idx_component_usage_project ON component_usage(project_id, last_seen_at DESC);
            CREATE INDEX IF NOT EXISTS idx_component_reviews_revision ON component_review_decisions(component_id, revision_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_component_releases_component ON component_release_records(component_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_assets_kind ON assets(asset_type, target_library, target_name);
            CREATE INDEX IF NOT EXISTS idx_revision_assets_revision ON revision_assets(revision_id);
            CREATE INDEX IF NOT EXISTS idx_asset_previews_asset ON asset_previews(asset_id, kind);
            CREATE INDEX IF NOT EXISTS idx_asset_preview_versions_asset ON asset_preview_versions(asset_id, kind, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_revision_previews_revision ON revision_previews(revision_id, kind);
            CREATE INDEX IF NOT EXISTS idx_revision_preview_outputs_revision ON revision_preview_outputs(revision_id, kind);
            CREATE INDEX IF NOT EXISTS idx_asset_validation_runs_asset ON asset_validation_runs(asset_id, finished_at DESC);
            CREATE INDEX IF NOT EXISTS idx_asset_validation_runs_component ON asset_validation_runs(component_id, revision_id);
            CREATE INDEX IF NOT EXISTS idx_asset_validation_findings_run ON asset_validation_findings(run_id);
            CREATE INDEX IF NOT EXISTS idx_oauth_service_clients_enabled ON oauth_service_clients(enabled);

            CREATE TABLE IF NOT EXISTS catalog_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """
        )

    def _ensure_metadata_schema(self, conn: Any) -> None:
        """Create the metadata-editing registry and durable batch tables.

        The DDL stays beside the catalog invariants while PostgreSQL initialization
        applies it behind the versioned schema fence.
        """
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS catalog_field_definitions (
                id TEXT PRIMARY KEY,
                field_key TEXT NOT NULL UNIQUE,
                label TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                field_group TEXT NOT NULL DEFAULT 'custom',
                field_type TEXT NOT NULL DEFAULT 'text',
                unit TEXT NOT NULL DEFAULT '',
                enum_values_json TEXT NOT NULL DEFAULT '[]',
                storage_kind TEXT NOT NULL DEFAULT 'extra',
                storage_key TEXT NOT NULL,
                built_in INTEGER NOT NULL DEFAULT 0,
                required INTEGER NOT NULL DEFAULT 0,
                display_order INTEGER NOT NULL DEFAULT 0,
                archived INTEGER NOT NULL DEFAULT 0,
                created_by TEXT NOT NULL DEFAULT '',
                updated_by TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS catalog_field_definition_events (
                id TEXT PRIMARY KEY,
                field_id TEXT NOT NULL REFERENCES catalog_field_definitions(id),
                event_type TEXT NOT NULL,
                actor TEXT NOT NULL DEFAULT '',
                before_json TEXT NOT NULL DEFAULT '{}',
                after_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS catalog_grid_preferences (
                user_email TEXT PRIMARY KEY,
                layout_json TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS catalog_metadata_batches (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                schema_version TEXT NOT NULL,
                change_summary TEXT NOT NULL DEFAULT '',
                unknown_fields_json TEXT NOT NULL DEFAULT '[]',
                created_by TEXT NOT NULL DEFAULT '',
                total_items INTEGER NOT NULL DEFAULT 0,
                valid_items INTEGER NOT NULL DEFAULT 0,
                applied_items INTEGER NOT NULL DEFAULT 0,
                failed_items INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS catalog_metadata_batch_items (
                id TEXT PRIMARY KEY,
                batch_id TEXT NOT NULL REFERENCES catalog_metadata_batches(id) ON DELETE CASCADE,
                component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
                expected_revision_id TEXT NOT NULL,
                patch_json TEXT NOT NULL DEFAULT '{}',
                diff_json TEXT NOT NULL DEFAULT '[]',
                validation_status TEXT NOT NULL DEFAULT 'valid',
                error_message TEXT NOT NULL DEFAULT '',
                applied_revision_id TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(batch_id, component_id)
            );

            CREATE TABLE IF NOT EXISTS revision_validation_evidence_links (
                revision_id TEXT NOT NULL REFERENCES component_revisions(id) ON DELETE CASCADE,
                asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                source_run_id TEXT NOT NULL REFERENCES asset_validation_runs(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                PRIMARY KEY(revision_id, asset_id)
            );

            CREATE INDEX IF NOT EXISTS idx_catalog_fields_order ON catalog_field_definitions(archived, display_order, field_key);
            CREATE INDEX IF NOT EXISTS idx_metadata_batches_actor ON catalog_metadata_batches(created_by, created_at);
            CREATE INDEX IF NOT EXISTS idx_metadata_batch_items_batch ON catalog_metadata_batch_items(batch_id, validation_status);
            """
        )
        now = _utc_now_iso()
        for index, field in enumerate(BUILTIN_METADATA_FIELDS):
            field_id = f"builtin:{field['key']}"
            conn.execute(
                """
                INSERT INTO catalog_field_definitions (
                    id, field_key, label, description, field_group, field_type, unit,
                    enum_values_json, storage_kind, storage_key, built_in, required,
                    display_order, archived, created_by, updated_by, created_at, updated_at
                ) VALUES (%s, %s, %s, '', %s, %s, %s, '[]', 'column', %s, 1, %s, %s, 0, 'system', 'system', %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (
                    field_id,
                    field["key"],
                    field["label"],
                    field["group"],
                    field["type"],
                    field.get("unit", ""),
                    field["key"],
                    int(bool(field.get("required"))),
                    index,
                    now,
                    now,
                ),
            )
        legacy_keys: set[str] = set()
        for row in conn.execute(
            "SELECT cr.extra_fields FROM components c "
            "JOIN component_revisions cr ON cr.id = c.current_revision_id WHERE c.is_active = 1"
        ).fetchall():
            legacy_keys.update(str(key) for key in _json_loads(row["extra_fields"], {}) if str(key).strip())
        self._ensure_extra_field_definitions(conn, legacy_keys, actor="system:migration")

    def _ensure_extra_field_definitions(
        self,
        conn: Any,
        storage_keys: Iterable[str],
        *,
        actor: str,
    ) -> None:
        reserved = {
            "reference", "footprint", "lib_id", "ki_keywords", "ki_description",
            *(str(field["key"]).casefold() for field in BUILTIN_METADATA_FIELDS),
            *(str(label).casefold() for label in SYMBOL_METADATA_LABEL_TO_KEY),
        }
        existing_rows = [dict(row) for row in conn.execute("SELECT * FROM catalog_field_definitions").fetchall()]
        existing_storage = {
            str(row["storage_key"]): row for row in existing_rows if str(row["storage_kind"]) == "extra"
        }
        used_keys = {str(row["field_key"]) for row in existing_rows}
        order_row = conn.execute("SELECT COALESCE(MAX(display_order), -1) AS value FROM catalog_field_definitions").fetchone()
        next_order = int(order_row["value"] if order_row and order_row["value"] is not None else -1) + 1
        now = _utc_now_iso()
        for raw_key in sorted({str(key).strip() for key in storage_keys if str(key).strip()}, key=str.casefold):
            if raw_key in existing_storage or raw_key.casefold() in reserved:
                continue
            base_key = re.sub(r"[^a-z0-9_]+", "_", raw_key.casefold()).strip("_") or "field"
            field_key = base_key
            if field_key in used_keys:
                field_key = f"{base_key}_{hashlib.sha256(raw_key.encode('utf-8')).hexdigest()[:8]}"
            while field_key in used_keys:
                field_key = f"{field_key}_2"
            field_id = f"discovered:{hashlib.sha256(raw_key.encode('utf-8')).hexdigest()[:24]}"
            conn.execute(
                """
                INSERT INTO catalog_field_definitions (
                    id, field_key, label, description, field_group, field_type, unit,
                    enum_values_json, storage_kind, storage_key, built_in, required,
                    display_order, archived, created_by, updated_by, created_at, updated_at
                ) VALUES (%s, %s, %s, 'Discovered from existing KiCad component metadata', 'custom',
                          'text', '', '[]', 'extra', %s, 0, 0, %s, 0, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (field_id, field_key, raw_key, raw_key, next_order, actor, actor, now, now),
            )
            row = conn.execute("SELECT * FROM catalog_field_definitions WHERE id = %s", (field_id,)).fetchone()
            if row:
                payload = self._metadata_field_payload(dict(row))
                self._append_field_event(conn, field_id, "created", actor, None, payload)
                existing_storage[raw_key] = dict(row)
                used_keys.add(field_key)
                next_order += 1

    def _resolve_kicad_cli(self) -> str | None:
        if self._kicad_cli and Path(self._kicad_cli).exists():
            return self._kicad_cli
        candidates = (
            shutil.which("kicad-cli"),
            "/usr/bin/kicad-cli",
            "/usr/local/bin/kicad-cli",
            "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli",
            os.path.expanduser("~/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli"),
        )
        for candidate in candidates:
            if candidate and Path(candidate).exists():
                self._kicad_cli = str(candidate)
                return self._kicad_cli
        return None

    def _run_kicad_cli(self, args: list[str]) -> tuple[bool, str]:
        cli = self._resolve_kicad_cli()
        if not cli:
            return False, "kicad-cli is not available in the backend runtime"
        try:
            result = subprocess.run([cli, *args], capture_output=True, text=True, timeout=60, check=False)
        except subprocess.TimeoutExpired:
            return False, "kicad-cli timed out after 60 seconds"
        if result.returncode != 0:
            return False, (result.stderr or result.stdout or f"kicad-cli exited with code {result.returncode}").strip()
        return True, ""

    def _preview_output_path(self, asset_id: str, kind: str) -> Path:
        bucket = "symbols" if kind == PREVIEW_KIND_SYMBOL else "footprints"
        return self._store_root / "previews" / bucket / f"{asset_id}.svg"

    def _preview_version_path(self, asset_id: str, kind: str, sha256: str) -> Path:
        bucket = "symbols" if _preview_base_kind(kind) == PREVIEW_KIND_SYMBOL else "footprints"
        return self._store_root / "previews" / "versions" / bucket / asset_id / f"{sha256}.svg"

    def _preview_generator_identity(self, kind: str) -> dict[str, str]:
        cli = self._resolve_kicad_cli()
        if not cli:
            version = "unavailable"
        elif self._kicad_cli_version is not None:
            version = self._kicad_cli_version
        else:
            try:
                result = subprocess.run(
                    [cli, "--version"], capture_output=True, text=True, timeout=10, check=False
                )
                version = (result.stdout or result.stderr or "unknown").strip() or "unknown"
            except (OSError, subprocess.TimeoutExpired):
                version = "unknown"
            self._kicad_cli_version = version
        canonical = json.dumps(
            {
                "generator_name": "kicad-cli",
                "generator_version": version,
                "pipeline_version": PREVIEW_PIPELINE_VERSION,
                "kind": kind,
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        return {
            "generator_name": "kicad-cli",
            "generator_version": version,
            "pipeline_version": PREVIEW_PIPELINE_VERSION,
            "generator_fingerprint": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
        }

    def _asset_root(self, asset_type: str) -> Path:
        mapping = {
            "symbol": self._store_root / "symbols",
            "footprint": self._store_root / "footprints",
            "3dmodel": self._store_root / "3dmodels",
            "spice": self._store_root / "spice",
        }
        if asset_type not in mapping:
            raise ValueError("Unsupported asset type")
        return mapping[asset_type]

    def _search_document(self, payload: dict[str, Any]) -> str:
        fixed = " ".join(
            str(payload.get(key) or "")
            for key in (
                "name",
                "value",
                "description",
                "manufacturer",
                "mpn",
                "package_name",
                "category",
                "vendor",
                "vendor_part_number",
                "sap_code",
            )
        ).strip()
        extra_fields = payload.get("extra_fields") or {}
        extra = " ".join(f"{key} {value}" for key, value in dict(extra_fields).items())
        return f"{fixed} {extra}".strip()

    def _fts_query(self, query: str) -> str:
        tokens = re.findall(r"[A-Za-z0-9_]+", query.strip().lower())
        return " ".join(f"{token}*" for token in tokens[:8])

    def _keywords(self, payload: dict[str, Any]) -> list[str]:
        return _dedupe(
            [
                str(payload.get("value") or ""),
                str(payload.get("manufacturer") or ""),
                str(payload.get("mpn") or ""),
                str(payload.get("package_name") or ""),
                str(payload.get("category") or ""),
                str(payload.get("vendor") or ""),
            ]
        )

    def _normalize_metadata(self, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = {
            "value": str(payload.get("value") or "").strip(),
            "description": str(payload.get("description") or "").strip(),
            "datasheet_url": str(payload.get("datasheet_url") or payload.get("datasheet") or "").strip(),
            "manufacturer": str(payload.get("manufacturer") or "").strip(),
            "mpn": str(payload.get("mpn") or payload.get("manufacturer_part_number") or "").strip(),
            "category": str(payload.get("category") or "").strip(),
            "package_name": str(payload.get("package_name") or "").strip(),
            "vendor": str(payload.get("vendor") or "").strip(),
            "vendor_part_number": str(payload.get("vendor_part_number") or "").strip(),
            "mass_g": str(payload.get("mass_g") or "").strip(),
            "rqjc_c_w": str(payload.get("rqjc_c_w") or "").strip(),
            "rqjc_top_c_w": str(payload.get("rqjc_top_c_w") or "").strip(),
            "temp_max_c": str(payload.get("temp_max_c") or "").strip(),
            "temp_min_c": str(payload.get("temp_min_c") or "").strip(),
            "power_dissipation_w": str(payload.get("power_dissipation_w") or "").strip(),
            "rate": str(payload.get("rate") or "").strip(),
            "sap_code": str(payload.get("sap_code") or "").strip(),
        }
        for field in ("value", "description", "datasheet_url", "manufacturer", "mpn"):
            if not normalized[field]:
                raise ValueError(f"{field} is required")
        normalized["name"] = normalized["mpn"] or normalized["value"]
        normalized["summary"] = normalized["description"]
        raw_extra_fields = payload.get("extra_fields") or payload.get("fields") or {}
        normalized["extra_fields"] = {
            str(key): str(value or "")
            for key, value in dict(raw_extra_fields).items()
            if str(key).strip()
        }
        return normalized

    def _unique_slug(self, conn: Any, base: str) -> str:
        slug = _slugify(base or "component")
        candidate = slug
        counter = 2
        while conn.execute("SELECT 1 FROM components WHERE slug = %s", (candidate,)).fetchone():
            candidate = f"{slug}-{counter}"
            counter += 1
        return candidate

    def _lock_component_identity(self, conn: Any, manufacturer: str, mpn: str) -> None:
        # Persistence adapters provide their transaction-level identity lock.
        _ = (conn, manufacturer, mpn)

    def _lock_component_for_mutation(self, conn: Any, component_id: str) -> None:
        # Persistence adapters provide their row-level component lock.
        _ = (conn, component_id)

    def _assert_component_identity_available(
        self,
        conn: Any,
        *,
        manufacturer: str,
        mpn: str,
        component_id: str = "",
        acquire_identity_lock: bool = True,
    ) -> None:
        if acquire_identity_lock:
            self._lock_component_identity(conn, manufacturer, mpn)
        existing = conn.execute(
            """
            SELECT component.id
            FROM components component
            JOIN component_revisions revision ON revision.id = component.current_revision_id
            WHERE component.is_active = 1
              AND lower(trim(revision.manufacturer)) = lower(trim(%s))
              AND lower(trim(revision.mpn)) = lower(trim(%s))
              AND component.id <> %s
            LIMIT 1
            """,
            (manufacturer, mpn, component_id),
        ).fetchone()
        if existing:
            raise ValueError(
                "A component with this manufacturer and manufacturer part number already exists"
            )

    def _component_row(self, conn: Any, component_id: str) -> dict[str, Any] | None:
        row = conn.execute("SELECT * FROM components WHERE id = %s", (component_id,)).fetchone()
        return dict(row) if row else None

    def _revision_row(self, conn: Any, revision_id: str) -> dict[str, Any] | None:
        row = conn.execute("SELECT * FROM component_revisions WHERE id = %s", (revision_id,)).fetchone()
        return dict(row) if row else None

    def _active_revision_row(
        self,
        conn: Any,
        component_id: str,
        *,
        released: bool = False,
    ) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        component = self._component_row(conn, component_id)
        if not component:
            return None, None
        revision_id = component["released_revision_id"] if released else component["current_revision_id"]
        if not revision_id:
            return component, None
        return component, self._revision_row(conn, str(revision_id))

    def _append_audit_event(
        self,
        conn: Any,
        *,
        component_id: str,
        revision_id: str,
        event_type: str,
        actor: str = "",
        details: dict[str, Any] | None = None,
    ) -> None:
        previous = conn.execute(
            "SELECT sequence, event_hash FROM catalog_audit_events WHERE component_id = %s ORDER BY sequence DESC LIMIT 1",
            (component_id,),
        ).fetchone()
        previous_hash = str(previous["event_hash"]) if previous else ""
        sequence = int(previous["sequence"] or 0) + 1 if previous else 1
        created_at = _utc_now_iso()
        event_id = str(uuid.uuid4())
        details_json = json.dumps(details or {}, sort_keys=True, separators=(",", ":"))
        canonical = json.dumps(
            {
                "id": event_id,
                "component_id": component_id,
                "revision_id": revision_id,
                "event_type": event_type,
                "actor": actor,
                "details": json.loads(details_json),
                "previous_hash": previous_hash,
                "created_at": created_at,
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        event_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        conn.execute(
            """
            INSERT INTO catalog_audit_events (
                id, component_id, sequence, revision_id, event_type, actor, details_json,
                previous_hash, event_hash, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                event_id,
                component_id,
                sequence,
                revision_id,
                event_type,
                actor,
                details_json,
                previous_hash,
                event_hash,
                created_at,
            ),
        )
        conn.execute(
            "INSERT INTO catalog_meta (key, value) VALUES (%s, %s) "
            "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            (f"audit_head:{component_id}", event_hash),
        )

    def _revision_manifest_hash(self, conn: Any, revision_id: str) -> str:
        revision = self._revision_row(conn, revision_id)
        if not revision:
            return ""
        excluded = {
            "id",
            "component_id",
            "release_status",
            "manifest_hash",
            "manifest_schema",
            "created_at",
            "updated_at",
            "version",
            "parent_revision_id",
            "change_kind",
            "change_summary",
            "created_by",
        }
        metadata = {key: revision[key] for key in sorted(revision) if key not in excluded}
        assets = [
            {
                "asset_type": str(asset["asset_type"]),
                "sha256": str(asset["sha256"]),
                "target_library": str(asset["target_library"]),
                "target_name": str(asset["target_name"]),
                "required": bool(asset["required"]),
            }
            for asset in self._load_assets_for_revision(conn, revision_id)
        ]
        manifest_schema = str(revision.get("manifest_schema") or REVISION_MANIFEST_A0)
        payload: dict[str, Any] = {"metadata": metadata, "assets": assets}
        if manifest_schema == REVISION_MANIFEST_A1:
            payload = {
                "schema": REVISION_MANIFEST_A1,
                **payload,
                "previews": [
                    {
                        "asset_id": str(preview["asset_id"]),
                        "kind": str(preview["kind"]),
                        "sha256": str(preview["sha256"]),
                        "generator_fingerprint": str(preview["generator_fingerprint"]),
                    }
                    for preview in self._load_preview_evidence_for_revision(conn, revision_id)
                    if str(preview["status"]) == PREVIEW_STATUS_READY
                ],
            }
        elif manifest_schema == REVISION_MANIFEST_A2:
            payload = {"schema": REVISION_MANIFEST_A2, **payload}
        elif manifest_schema != REVISION_MANIFEST_A0:
            raise ValueError(f"Unsupported revision manifest schema: {manifest_schema}")
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def _finalize_revision(
        self,
        conn: Any,
        *,
        component_id: str,
        revision_id: str,
        event_type: str,
        actor: str = "",
        details: dict[str, Any] | None = None,
    ) -> None:
        self._refresh_revision_preview_outputs_in_conn(conn, revision_id)
        manifest_hash = self._revision_manifest_hash(conn, revision_id)
        conn.execute(
            "UPDATE component_revisions SET manifest_hash = %s, updated_at = %s WHERE id = %s",
            (manifest_hash, _utc_now_iso(), revision_id),
        )
        self._append_audit_event(
            conn,
            component_id=component_id,
            revision_id=revision_id,
            event_type=event_type,
            actor=actor,
            details={**(details or {}), "manifest_hash": manifest_hash},
        )

    def _clone_revision(
        self,
        conn: Any,
        component_id: str,
        *,
        actor: str = "",
        change_kind: str = "edit",
        change_summary: str = "",
        expected_revision_id: str = "",
    ) -> dict[str, Any]:
        component, current = self._active_revision_row(conn, component_id, released=False)
        if not component or not current:
            raise ValueError("Component not found")
        if expected_revision_id and str(current["id"]) != expected_revision_id:
            raise ValueError("Component revision conflict: refresh the component before saving")

        now = _utc_now_iso()
        next_version = int(
            conn.execute(
                "SELECT COALESCE(MAX(version), 0) AS max_version FROM component_revisions WHERE component_id = %s",
                (component_id,),
            ).fetchone()["max_version"]
        ) + 1
        parent_status = _normalize_workflow_stage(str(current["release_status"]))
        # Preserve in-flight workflow across asset/metadata clones. Only branch
        # back to open when starting new work from a released/archived revision.
        if change_kind == "new_draft" or parent_status in {"released", "archived"}:
            next_status = "open"
        elif parent_status == "done":
            next_status = "in_progress"
        else:
            next_status = parent_status if parent_status in WORKFLOW_STAGES else "open"
        revision_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO component_revisions (
                id, component_id, version, parent_revision_id, change_kind, change_summary, created_by,
                manifest_hash, manifest_schema, release_status, name, value, description, datasheet_url,
                manufacturer, mpn, category, package_name, vendor, vendor_part_number, mass_g,
                rqjc_c_w, rqjc_top_c_w, temp_max_c, temp_min_c, power_dissipation_w, rate, sap_code,
                summary, keywords, extra_fields, search_document, created_at, updated_at
            )
            SELECT
                %s, component_id, %s, id, %s, %s, %s, '', %s, %s, name, value, description, datasheet_url,
                manufacturer, mpn, category, package_name, vendor, vendor_part_number, mass_g,
                rqjc_c_w, rqjc_top_c_w, temp_max_c, temp_min_c, power_dissipation_w, rate, sap_code,
                summary, keywords, extra_fields, search_document, %s, %s
            FROM component_revisions
            WHERE id = %s
            """,
            (
                revision_id,
                next_version,
                change_kind,
                change_summary,
                actor,
                REVISION_MANIFEST_A2,
                next_status,
                now,
                now,
                current["id"],
            ),
        )
        conn.execute(
            """
            INSERT INTO revision_assets (revision_id, asset_type, asset_id, required, created_at, updated_at)
            SELECT %s, asset_type, asset_id, required, %s, %s
            FROM revision_assets
            WHERE revision_id = %s
            """,
            (revision_id, now, now, current["id"]),
        )
        conn.execute(
            """
            INSERT INTO revision_previews (revision_id, asset_id, kind, preview_id, created_at)
            SELECT %s, asset_id, kind, preview_id, %s
            FROM revision_previews
            WHERE revision_id = %s
            """,
            (revision_id, now, current["id"]),
        )
        conn.execute(
            """
            INSERT INTO revision_preview_outputs (revision_id, asset_id, kind, preview_id, generated_at)
            SELECT %s, asset_id, kind, preview_id, %s
            FROM revision_preview_outputs
            WHERE revision_id = %s
            """,
            (revision_id, now, current["id"]),
        )
        conn.execute(
            "UPDATE components SET current_revision_id = %s, updated_at = %s WHERE id = %s",
            (revision_id, now, component_id),
        )
        self._inherit_validation_evidence(conn, str(current["id"]), revision_id)
        return self._revision_row(conn, revision_id) or {}

    def _load_assets_for_revision(self, conn: Any, revision_id: str) -> list[dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT a.*, ra.required
            FROM revision_assets ra
            JOIN assets a ON a.id = ra.asset_id
            WHERE ra.revision_id = %s
            ORDER BY CASE a.asset_type
                WHEN 'symbol' THEN 1
                WHEN 'footprint' THEN 2
                WHEN '3dmodel' THEN 3
                WHEN 'spice' THEN 4
                ELSE 99
            END, a.target_library, a.target_name, a.sha256
            """,
            (revision_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def _load_previews_for_assets(self, conn: Any, asset_ids: list[str]) -> list[dict[str, Any]]:
        if not asset_ids:
            return []
        placeholders = ",".join("%s" for _ in asset_ids)
        rows = conn.execute(
            f"SELECT * FROM asset_previews WHERE asset_id IN ({placeholders}) ORDER BY kind, updated_at DESC",
            tuple(asset_ids),
        ).fetchall()
        return [dict(row) for row in rows]

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
            (str(row["asset_id"]), _preview_base_kind(str(row["kind"])), _preview_unit(str(row["kind"]))): dict(row)
            for row in evidence_rows
        }
        previews.update({
            (str(row["asset_id"]), _preview_base_kind(str(row["kind"])), _preview_unit(str(row["kind"]))): dict(row)
            for row in output_rows
        })
        return sorted(previews.values(), key=lambda row: (str(row["kind"]), str(row["asset_id"]), str(row["created_at"]), str(row["id"])))

    def _load_preview_evidence_for_revision(self, conn: Any, revision_id: str) -> list[dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT preview.*
            FROM revision_previews link
            JOIN asset_preview_versions preview ON preview.id = link.preview_id
            WHERE link.revision_id = %s
            ORDER BY preview.kind, preview.asset_id, preview.created_at, preview.id
            """,
            (revision_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def _load_previews_for_revisions(self, conn: Any, revision_ids: list[str]) -> list[dict[str, Any]]:
        if not revision_ids:
            return []
        placeholders = ",".join("%s" for _ in revision_ids)
        output_rows = conn.execute(
            f"""
            SELECT preview.*, link.revision_id
            FROM revision_preview_outputs link
            JOIN asset_preview_versions preview ON preview.id = link.preview_id
            JOIN revision_assets ra
              ON ra.revision_id = link.revision_id AND ra.asset_id = link.asset_id
            WHERE link.revision_id IN ({placeholders})
            """,
            tuple(revision_ids),
        ).fetchall()
        evidence_rows = conn.execute(
            f"""
            SELECT preview.*, link.revision_id
            FROM revision_previews link
            JOIN asset_preview_versions preview ON preview.id = link.preview_id
            JOIN revision_assets ra
              ON ra.revision_id = link.revision_id AND ra.asset_id = link.asset_id
            WHERE link.revision_id IN ({placeholders})
            """,
            tuple(revision_ids),
        ).fetchall()
        previews = {
            (str(row["revision_id"]), str(row["asset_id"]), _preview_base_kind(str(row["kind"])), _preview_unit(str(row["kind"]))): dict(row)
            for row in evidence_rows
        }
        previews.update({
            (str(row["revision_id"]), str(row["asset_id"]), _preview_base_kind(str(row["kind"])), _preview_unit(str(row["kind"]))): dict(row)
            for row in output_rows
        })
        return sorted(previews.values(), key=lambda row: (str(row["revision_id"]), str(row["kind"]), str(row["asset_id"]), str(row["created_at"]), str(row["id"])))

    def _latest_validation_runs_for_assets(
        self,
        conn: Any,
        revision_id: str,
        asset_ids: list[str],
    ) -> dict[str, dict[str, Any]]:
        if not asset_ids:
            return {}
        placeholders = ",".join("%s" for _ in asset_ids)
        rows = conn.execute(
            f"""
            SELECT *
            FROM asset_validation_runs
            WHERE revision_id = %s AND asset_id IN ({placeholders})
            ORDER BY asset_id, finished_at DESC, created_at DESC
            """,
            (revision_id, *asset_ids),
        ).fetchall()
        latest: dict[str, dict[str, Any]] = {}
        for row in rows:
            asset_id = str(row["asset_id"])
            if asset_id not in latest:
                latest[asset_id] = dict(row)
        missing_asset_ids = [asset_id for asset_id in asset_ids if asset_id not in latest]
        if missing_asset_ids:
            inherited_placeholders = ",".join("%s" for _ in missing_asset_ids)
            inherited_rows = conn.execute(
                f"""
                SELECT run.*, run.revision_id AS inherited_from_revision_id,
                       link.revision_id AS inherited_for_revision_id
                FROM revision_validation_evidence_links link
                JOIN asset_validation_runs run ON run.id = link.source_run_id
                WHERE link.revision_id = %s AND link.asset_id IN ({inherited_placeholders})
                """,
                (revision_id, *missing_asset_ids),
            ).fetchall()
            for row in inherited_rows:
                latest[str(row["asset_id"])] = dict(row)
        return latest

    def _validation_run_payload(self, row: dict[str, Any], *, include_findings: bool = False, conn: Any | None = None) -> dict[str, Any]:
        run_id = str(row["id"])
        payload = {
            "id": run_id,
            "component_id": str(row["component_id"]),
            "revision_id": str(row["revision_id"]),
            "asset_id": str(row["asset_id"]),
            "asset_type": str(row["asset_type"]),
            "checker_type": str(row["checker_type"]),
            "status": str(row["status"]),
            "error_count": int(row["error_count"] or 0),
            "warning_count": int(row["warning_count"] or 0),
            "exit_code": row["exit_code"],
            "tool_version": str(row["tool_version"] or ""),
            "created_at": str(row["created_at"] or ""),
            "finished_at": str(row["finished_at"] or ""),
            "inherited": bool(row.get("inherited_for_revision_id")),
            "inherited_from_revision_id": str(row.get("inherited_from_revision_id") or ""),
            "reports": {
                "summary": f"/api/catalog/validation/runs/{run_id}",
                "json": f"/api/catalog/validation/runs/{run_id}/report.json",
                "junit": f"/api/catalog/validation/runs/{run_id}/report.junit.xml",
                "stdout": f"/api/catalog/validation/runs/{run_id}/stdout",
                "stderr": f"/api/catalog/validation/runs/{run_id}/stderr",
            },
        }
        if include_findings and conn is not None:
            payload["findings"] = self._validation_findings_payload(conn, run_id)
        return payload

    def _validation_findings_payload(self, conn: Any, run_id: str) -> list[dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT *
            FROM asset_validation_findings
            WHERE run_id = %s
            ORDER BY CASE severity WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, rule_code, message
            """,
            (run_id,),
        ).fetchall()
        return [
            {
                "id": str(row["id"]),
                "run_id": str(row["run_id"]),
                "severity": str(row["severity"]),
                "rule_code": str(row["rule_code"]),
                "rule_url": str(row["rule_url"]),
                "message": str(row["message"]),
                "details": _json_loads(row["details_json"], []),
                "object_name": str(row["object_name"] or ""),
                "created_at": str(row["created_at"]),
            }
            for row in rows
        ]

    def _component_validation_summary(
        self,
        conn: Any,
        revision_id: str,
        assets: list[dict[str, Any]],
        *,
        preloaded_runs: dict[str, dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        relevant_assets = [asset for asset in assets if str(asset["asset_type"]) in {"symbol", "footprint"}]
        latest = (
            preloaded_runs
            if preloaded_runs is not None
            else self._latest_validation_runs_for_assets(
                conn,
                revision_id,
                [str(asset["id"]) for asset in relevant_assets],
            )
        )
        asset_payloads: list[dict[str, Any]] = []
        error_count = 0
        warning_count = 0
        statuses: list[str] = []
        for asset in relevant_assets:
            asset_id = str(asset["id"])
            run = latest.get(asset_id)
            validation = self._validation_run_payload(run) if run else None
            status = str(run["status"]) if run else VALIDATION_STATUS_NOT_RUN
            statuses.append(status)
            if run:
                error_count += int(run["error_count"] or 0)
                warning_count += int(run["warning_count"] or 0)
            asset_payloads.append(
                {
                    "asset_id": asset_id,
                    "asset_type": str(asset["asset_type"]),
                    "asset_name": str(asset["name"]),
                    "target_library": str(asset["target_library"]),
                    "target_name": str(asset["target_name"]),
                    "status": status,
                    "latest_run": validation,
                }
            )

        if not relevant_assets:
            status = VALIDATION_STATUS_NOT_RUN
        elif VALIDATION_STATUS_FAILED in statuses:
            status = VALIDATION_STATUS_FAILED
        elif VALIDATION_STATUS_WARNING in statuses:
            status = VALIDATION_STATUS_WARNING
        elif VALIDATION_STATUS_SKIPPED in statuses:
            status = VALIDATION_STATUS_SKIPPED
        elif VALIDATION_STATUS_NOT_RUN in statuses:
            status = VALIDATION_STATUS_NOT_RUN
        else:
            status = VALIDATION_STATUS_PASSED

        required = set(PLACE_REQUIRED_ASSET_TYPES)
        present_required = {str(asset["asset_type"]) for asset in relevant_assets if bool(asset.get("required", True))}
        missing_required = sorted(required - present_required)
        return {
            "status": status,
            "enabled": bool(settings.CATALOG_KLC_ENABLED),
            "release_gate": self._klc_release_gate(),
            "revision_id": revision_id,
            "error_count": error_count,
            "warning_count": warning_count,
            "missing_required_assets": missing_required,
            "assets": asset_payloads,
        }

    def _availability(self, assets: list[dict[str, Any]], release_status: str, is_active: bool) -> tuple[str, list[str], bool]:
        asset_types = {str(asset["asset_type"]) for asset in assets}
        missing = [asset_type for asset_type in PLACE_REQUIRED_ASSET_TYPES if asset_type not in asset_types]
        if missing and len(missing) == len(PLACE_REQUIRED_ASSET_TYPES):
            state = STATE_METADATA_ONLY
        elif missing:
            state = STATE_FILES_PARTIAL
        else:
            state = STATE_PLACE_READY
        place_enabled = is_active and not missing and _release_allows_remote(release_status)
        return state, missing, place_enabled

    def _component_payload(
        self,
        conn: Any,
        component_row: dict[str, Any],
        revision_row: dict[str, Any],
        *,
        released_view: bool = False,
        preloaded_assets: list[dict[str, Any]] | None = None,
        preloaded_previews: list[dict[str, Any]] | None = None,
        preloaded_validation_runs: dict[str, dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        assets = preloaded_assets if preloaded_assets is not None else self._load_assets_for_revision(conn, str(revision_row["id"]))
        previews = preloaded_previews if preloaded_previews is not None else self._load_previews_for_revision(conn, str(revision_row["id"]))
        availability_state, missing_assets, place_enabled = self._availability(
            assets,
            str(revision_row["release_status"]),
            bool(component_row["is_active"]),
        )
        symbol_asset = next((asset for asset in assets if asset["asset_type"] == "symbol"), None)
        validation_summary = self._component_validation_summary(
            conn,
            str(revision_row["id"]),
            assets,
            preloaded_runs=preloaded_validation_runs,
        )
        preview_payloads = [
            {
                "id": str(preview["id"]),
                "asset_id": str(preview["asset_id"]),
                "kind": _preview_base_kind(str(preview["kind"])),
                "preview_key": str(preview["kind"]),
                "unit": _preview_unit(str(preview["kind"])),
                "unit_label": _preview_unit_label(str(preview["kind"])),
                "status": str(preview["status"]),
                "content_type": str(preview["content_type"]),
                "file_path": str(preview["file_path"]),
                "generation_error": str(preview["generation_error"]),
                "sha256": str(preview.get("sha256") or ""),
                "generator_fingerprint": str(preview.get("generator_fingerprint") or ""),
                "generator_version": str(preview.get("generator_version") or ""),
                "updated_at": str(preview.get("updated_at") or preview.get("created_at") or ""),
            }
            for preview in previews
        ]
        keywords = _json_loads(revision_row.get("keywords"), [])
        return {
            "id": str(component_row["id"]),
            "slug": str(component_row["slug"]),
            "external_source": str(component_row["external_source"]),
            "external_id": str(component_row["external_id"]),
            "external_workflow_source": str(component_row.get("external_workflow_source", "")),
            "external_workflow_id": str(component_row.get("external_workflow_id", "")),
            "external_workflow_url": str(component_row.get("external_workflow_url", "")),
            "external_url": str(component_row.get("external_url", "")),
            "external_payload": _json_loads(component_row.get("external_payload_json"), {}),
            "external_updated_at": str(component_row.get("external_updated_at") or ""),
            "sync_status": str(component_row.get("sync_status", "")),
            "sync_error": str(component_row.get("sync_error", "")),
            "source": str(component_row["source"]),
            "name": str(revision_row["name"]),
            "value": str(revision_row["value"]),
            "manufacturer": str(revision_row["manufacturer"]),
            "mpn": str(revision_row["mpn"]),
            "description": str(revision_row["description"]),
            "package_name": str(revision_row["package_name"]),
            "category": str(revision_row["category"]),
            "datasheet_url": str(revision_row["datasheet_url"]),
            "vendor": str(revision_row["vendor"]),
            "vendor_part_number": str(revision_row["vendor_part_number"]),
            "mass_g": str(revision_row["mass_g"]),
            "rqjc_c_w": str(revision_row["rqjc_c_w"]),
            "rqjc_top_c_w": str(revision_row["rqjc_top_c_w"]),
            "temp_max_c": str(revision_row["temp_max_c"]),
            "temp_min_c": str(revision_row["temp_min_c"]),
            "power_dissipation_w": str(revision_row["power_dissipation_w"]),
            "rate": str(revision_row["rate"]),
            "sap_code": str(revision_row["sap_code"]),
            "keywords": list(keywords),
            "extra_fields": _json_loads(revision_row.get("extra_fields"), {}),
            "availability_state": availability_state,
            "missing_assets": missing_assets,
            "place_enabled": place_enabled,
            "stock_quantity": float(component_row["stock_quantity"]),
            "stock_uom": str(component_row["stock_uom"]),
            "inventory_status": str(component_row["inventory_status"]),
            "serial_number": str(component_row["serial_number"]),
            "lot_number": str(component_row["lot_number"]),
            "pedigree": str(component_row["pedigree"]),
            "last_synced_at": str(component_row["last_synced_at"] or ""),
            "is_active": bool(component_row["is_active"]),
            "revision_id": str(revision_row["id"]),
            "revision": int(revision_row["version"]),
            "version": f"{int(revision_row['version'])}.0.0",
            "parent_revision_id": str(revision_row.get("parent_revision_id", "")),
            "change_kind": str(revision_row.get("change_kind", "")),
            "change_summary": str(revision_row.get("change_summary", "")),
            "created_by": str(revision_row.get("created_by", "")),
            "manifest_hash": str(revision_row.get("manifest_hash", "")),
            "component_created_at": str(component_row.get("created_at", "")),
            "component_updated_at": str(component_row.get("updated_at", "")),
            "revision_created_at": str(revision_row.get("created_at", "")),
            "revision_updated_at": str(revision_row.get("updated_at", "")),
            "current_revision_id": str(component_row.get("current_revision_id", "")),
            "released_revision_id": str(component_row.get("released_revision_id", "")),
            "is_historical_revision": str(revision_row["id"]) != str(component_row.get("current_revision_id", "")),
            "summary": str(revision_row["summary"]),
            "library_name": str(symbol_asset["target_library"]) if symbol_asset else "",
            "symbol_name": str(symbol_asset["target_name"]) if symbol_asset else "",
            "release_status": _normalize_workflow_stage(str(revision_row["release_status"])),
            "workflow_stage": _normalize_workflow_stage(str(revision_row["release_status"])),
            "released_view": released_view,
            "assets": [
                {
                    "id": str(asset["id"]),
                    "asset_type": str(asset["asset_type"]),
                    "name": str(asset["name"]),
                    "target_library": str(asset["target_library"]),
                    "target_name": str(asset["target_name"]),
                    "source_group": str(asset["source_group"]),
                    "sha256": str(asset["sha256"]),
                    "size_bytes": int(asset["size_bytes"]),
                    "content_type": str(asset["content_type"]),
                    "required": bool(asset["required"]),
                }
                for asset in assets
            ],
            "previews": preview_payloads,
            "validation": validation_summary,
        }

    def list_component_revisions(self, component_id: str) -> list[dict[str, Any]]:
        self.initialize()
        with self._connect() as conn:
            if not self._component_row(conn, component_id):
                raise ValueError("Component not found")
            rows = conn.execute(
                """
                SELECT id, component_id, version, parent_revision_id, change_kind, change_summary,
                       created_by, manifest_hash, release_status, created_at, updated_at
                FROM component_revisions
                WHERE component_id = %s
                ORDER BY version DESC
                """,
                (component_id,),
            ).fetchall()
            return [
                {
                    **dict(row),
                    "release_status": _normalize_workflow_stage(str(row["release_status"])),
                    "workflow_stage": _normalize_workflow_stage(str(row["release_status"])),
                }
                for row in rows
            ]

    def list_component_audit_events(self, component_id: str) -> list[dict[str, Any]]:
        self.initialize()
        with self._connect() as conn:
            if not self._component_row(conn, component_id):
                raise ValueError("Component not found")
            rows = conn.execute(
                """
                SELECT id, component_id, sequence, revision_id, event_type, actor, details_json,
                       previous_hash, event_hash, created_at
                FROM catalog_audit_events
                WHERE component_id = %s
                ORDER BY sequence DESC
                """,
                (component_id,),
            ).fetchall()
            return [
                {**dict(row), "details": _json_loads(row["details_json"], {})}
                for row in rows
            ]

    def verify_component_audit_chain(self, component_id: str) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            if not self._component_row(conn, component_id):
                raise ValueError("Component not found")
            rows = conn.execute(
                """
                SELECT id, component_id, sequence, revision_id, event_type, actor, details_json,
                       previous_hash, event_hash, created_at
                FROM catalog_audit_events
                WHERE component_id = %s
                ORDER BY sequence
                """,
                (component_id,),
            ).fetchall()
            if not rows:
                return {
                    "valid": False,
                    "coverage": "missing",
                    "reason": "missing_audit_events",
                    "event_count": 0,
                    "verified_count": 0,
                    "first_invalid_event_id": "",
                    "head_hash": "",
                }
            coverage = (
                "legacy_snapshot"
                if any(str(row["event_type"]) == "audit.migrated" for row in rows)
                else "complete"
            )
            previous_hash = ""
            for index, row in enumerate(rows):
                expected_sequence = index + 1
                if int(row["sequence"] or 0) != expected_sequence:
                    return {
                        "valid": False,
                        "coverage": coverage,
                        "reason": "audit_sequence_gap",
                        "event_count": len(rows),
                        "verified_count": index,
                        "first_invalid_event_id": str(row["id"]),
                        "head_hash": previous_hash,
                    }
                details = _json_loads(row["details_json"], {})
                canonical = json.dumps(
                    {
                        "id": str(row["id"]),
                        "component_id": str(row["component_id"]),
                        "revision_id": str(row["revision_id"]),
                        "event_type": str(row["event_type"]),
                        "actor": str(row["actor"]),
                        "details": details,
                        "previous_hash": str(row["previous_hash"]),
                        "created_at": str(row["created_at"]),
                    },
                    sort_keys=True,
                    separators=(",", ":"),
                )
                expected_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
                if str(row["previous_hash"]) != previous_hash or str(row["event_hash"]) != expected_hash:
                    return {
                        "valid": False,
                        "coverage": coverage,
                        "reason": "audit_hash_mismatch",
                        "event_count": len(rows),
                        "verified_count": index,
                        "first_invalid_event_id": str(row["id"]),
                        "head_hash": previous_hash,
                    }
                previous_hash = expected_hash

            anchor = conn.execute(
                "SELECT value FROM catalog_meta WHERE key = %s",
                (f"audit_head:{component_id}",),
            ).fetchone()
            anchored_head = str(anchor["value"]) if anchor else ""
            if anchored_head != previous_hash:
                return {
                    "valid": False,
                    "coverage": coverage,
                    "reason": "audit_head_mismatch",
                    "event_count": len(rows),
                    "verified_count": len(rows),
                    "first_invalid_event_id": "",
                    "head_hash": previous_hash,
                    "anchored_head_hash": anchored_head,
                }

            revisions = conn.execute(
                "SELECT id, manifest_hash FROM component_revisions WHERE component_id = %s ORDER BY version",
                (component_id,),
            ).fetchall()
            for revision in revisions:
                revision_id = str(revision["id"])
                expected_manifest = self._revision_manifest_hash(conn, revision_id)
                if str(revision["manifest_hash"]) != expected_manifest:
                    return {
                        "valid": False,
                        "coverage": coverage,
                        "reason": "revision_manifest_mismatch",
                        "event_count": len(rows),
                        "verified_count": len(rows),
                        "first_invalid_event_id": "",
                        "first_invalid_revision_id": revision_id,
                        "head_hash": previous_hash,
                    }

            assets = conn.execute(
                """
                SELECT DISTINCT asset.id, asset.canonical_path, asset.sha256
                FROM revision_assets link
                JOIN component_revisions revision ON revision.id = link.revision_id
                JOIN assets asset ON asset.id = link.asset_id
                WHERE revision.component_id = %s
                """,
                (component_id,),
            ).fetchall()
            for asset in assets:
                path = Path(str(asset["canonical_path"]))
                if not path.is_file() or _sha256_file(path) != str(asset["sha256"]):
                    return {
                        "valid": False,
                        "coverage": coverage,
                        "reason": "asset_content_mismatch",
                        "event_count": len(rows),
                        "verified_count": len(rows),
                        "first_invalid_event_id": "",
                        "first_invalid_asset_id": str(asset["id"]),
                        "head_hash": previous_hash,
                    }

            return {
                "valid": True,
                "coverage": coverage,
                "reason": "",
                "event_count": len(rows),
                "verified_count": len(rows),
                "revision_count": len(revisions),
                "asset_count": len(assets),
                "first_invalid_event_id": "",
                "head_hash": previous_hash,
                "anchored_head_hash": anchored_head,
            }

    def get_component_revision(self, component_id: str, revision_id: str) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            component = self._component_row(conn, component_id)
            revision = self._revision_row(conn, revision_id)
            if not component or not revision or str(revision["component_id"]) != component_id:
                return None
            return self._component_payload(conn, component, revision)

    def compare_component_revisions(self, component_id: str, before_revision_id: str, after_revision_id: str) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            component = self._component_row(conn, component_id)
            before = self._revision_row(conn, before_revision_id)
            after = self._revision_row(conn, after_revision_id)
            if not component or not before or not after:
                raise ValueError("Component revision not found")
            if str(before["component_id"]) != component_id or str(after["component_id"]) != component_id:
                raise ValueError("Component revision does not belong to this component")
            fixed_fields = (
                "name", "value", "description", "datasheet_url", "manufacturer", "mpn", "category",
                "package_name", "vendor", "vendor_part_number", "mass_g", "rqjc_c_w", "rqjc_top_c_w",
                "temp_max_c", "temp_min_c", "power_dissipation_w", "rate", "sap_code",
            )
            before_metadata = {field: str(before.get(field) or "") for field in fixed_fields}
            after_metadata = {field: str(after.get(field) or "") for field in fixed_fields}
            before_extra = _json_loads(before.get("extra_fields"), {})
            after_extra = _json_loads(after.get("extra_fields"), {})
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
                    for asset in self._load_assets_for_revision(conn, revision_id)
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
                        key=lambda item: (_preview_unit(str(item["kind"])), str(item["id"])),
                    )
                    preview = asset_previews[0] if asset_previews else None
                    preview_payloads = [
                        {
                            "previewId": str(item["id"]),
                            "previewStatus": str(item["status"]),
                            "previewSha256": str(item["sha256"]),
                            "previewGeneratorFingerprint": str(item["generator_fingerprint"]),
                            "unit": _preview_unit(str(item["kind"])),
                            "unitLabel": _preview_unit_label(str(item["kind"])),
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
            return {
                "componentId": component_id,
                "before": {"revisionId": before_revision_id, "version": int(before["version"]), "manifestHash": str(before["manifest_hash"])},
                "after": {"revisionId": after_revision_id, "version": int(after["version"]), "manifestHash": str(after["manifest_hash"])},
                "summary": {"metadataChanges": changed_metadata, "assetChanges": changed_assets},
                "metadataChanges": metadata_changes,
                "assetChanges": asset_changes,
            }

    def list_component_usage(self, component_id: str, *, include_history: bool = False) -> list[dict[str, Any]]:
        self.initialize()
        with self._connect() as conn:
            if not self._component_row(conn, component_id):
                raise ValueError("Component not found")
            rows = conn.execute(
                """
                SELECT *
                FROM component_usage
                WHERE component_id = %s AND (%s = 1 OR is_current = 1)
                ORDER BY last_seen_at DESC, project_id, source_revision
                """,
                (component_id, 1 if include_history else 0),
            ).fetchall()
            return [
                {
                    **dict(row),
                    "references": _json_loads(row["references_json"], []),
                    "details": _json_loads(row["details_json"], []),
                    "is_current": bool(row["is_current"]),
                }
                for row in rows
            ]

    def list_component_review_decisions(self, component_id: str) -> list[dict[str, Any]]:
        self.initialize()
        with self._connect() as conn:
            if not self._component_row(conn, component_id):
                raise ValueError("Component not found")
            rows = conn.execute(
                "SELECT * FROM component_review_decisions WHERE component_id = %s ORDER BY created_at DESC, id DESC",
                (component_id,),
            ).fetchall()
            return [
                {
                    **dict(row),
                    "validation": _json_loads(row["validation_json"], {}),
                    "policy": _json_loads(row["policy_json"], {}),
                }
                for row in rows
            ]

    def list_component_release_records(self, component_id: str) -> list[dict[str, Any]]:
        self.initialize()
        with self._connect() as conn:
            if not self._component_row(conn, component_id):
                raise ValueError("Component not found")
            rows = conn.execute(
                "SELECT * FROM component_release_records WHERE component_id = %s ORDER BY created_at DESC, id DESC",
                (component_id,),
            ).fetchall()
            return [
                {
                    **dict(row),
                    "validation": _json_loads(row["validation_json"], {}),
                    "policy": _json_loads(row["policy_json"], {}),
                }
                for row in rows
            ]

    def catalog_preview_path(self, preview_id: str) -> tuple[Path, str] | None:
        self.initialize()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT file_path, content_type FROM asset_preview_versions WHERE id = %s AND status = %s",
                (preview_id, PREVIEW_STATUS_READY),
            ).fetchone()
            if not row:
                row = conn.execute(
                    "SELECT file_path, content_type FROM asset_previews WHERE id = %s AND status = %s",
                    (preview_id, PREVIEW_STATUS_READY),
                ).fetchone()
        if not row:
            return None
        path = Path(str(row["file_path"] or "")).resolve()
        try:
            path.relative_to((self._store_root / "previews").resolve())
        except ValueError:
            return None
        return (path, str(row["content_type"] or "image/svg+xml")) if path.is_file() else None

    def create_project_import_session(
        self,
        *,
        scope: str,
        project_id: str = "",
        project_ids: list[str] | None = None,
        project_revisions: dict[str, str] | None = None,
        source_revision: str = "",
        selection: dict[str, Any] | None = None,
        actor: str = "",
    ) -> dict[str, Any]:
        if scope not in {"component", "project", "all-projects", "folder"}:
            raise ValueError("Unsupported project import scope")
        if scope in {"component", "project"} and not project_id:
            raise ValueError("project_id is required for this import scope")
        if scope == "component" and not selection:
            raise ValueError("selection is required for component import")
        self.initialize()
        now = _utc_now_iso()
        session_id = str(uuid.uuid4())
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO project_component_import_sessions (
                    id, scope, project_id, project_ids_json, project_revisions_json,
                    source_revision, selection_json, status,
                    created_by, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'queued', %s, %s, %s)
                """,
                (
                    session_id,
                    scope,
                    project_id,
                    json.dumps(sorted(set(project_ids or ([project_id] if project_id else []))), separators=(",", ":")),
                    json.dumps(project_revisions or {}, sort_keys=True, separators=(",", ":")),
                    source_revision,
                    json.dumps(selection or {}, sort_keys=True, separators=(",", ":")),
                    actor,
                    now,
                    now,
                ),
            )
            conn.commit()
        return self.get_project_import_session(session_id) or {}

    def get_project_import_session(self, session_id: str) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM project_component_import_sessions WHERE id = %s",
                (session_id,),
            ).fetchone()
            if not row:
                return None
            payload = dict(row)
            payload["selection"] = _json_loads(payload.pop("selection_json"), {})
            payload["project_ids"] = _json_loads(payload.pop("project_ids_json"), [])
            payload["project_revisions"] = _json_loads(payload.pop("project_revisions_json"), {})
            count = conn.execute(
                "SELECT COUNT(1) AS count FROM project_component_import_proposals WHERE session_id = %s",
                (session_id,),
            ).fetchone()
            payload["proposal_count"] = int(count["count"] if count else 0)
            return payload

    def list_project_import_sessions(self, *, created_by: str = "", include_all: bool = False) -> list[dict[str, Any]]:
        self.initialize()
        with self._connect() as conn:
            if include_all:
                rows = conn.execute(
                    "SELECT id FROM project_component_import_sessions ORDER BY created_at DESC LIMIT 100"
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT id FROM project_component_import_sessions
                    WHERE created_by = %s ORDER BY created_at DESC LIMIT 100
                    """,
                    (created_by,),
                ).fetchall()
        return [session for row in rows if (session := self.get_project_import_session(str(row["id"]))) is not None]

    def update_project_import_session(self, session_id: str, *, status: str, error_message: str = "") -> None:
        if status not in {"queued", "uploading", "scanning", "staged", "failed"}:
            raise ValueError("Unsupported project import session status")
        self.initialize()
        with self._connect() as conn:
            result = conn.execute(
                "UPDATE project_component_import_sessions SET status = %s, error_message = %s, updated_at = %s WHERE id = %s",
                (status, error_message, _utc_now_iso(), session_id),
            )
            if result.rowcount == 0:
                raise ValueError("Project import session not found")
            conn.commit()

    def stage_project_import_proposals(self, session_id: str, proposals: list[dict[str, Any]]) -> None:
        self.initialize()
        now = _utc_now_iso()
        with self._connect() as conn:
            if not conn.execute(
                "SELECT 1 FROM project_component_import_sessions WHERE id = %s",
                (session_id,),
            ).fetchone():
                raise ValueError("Project import session not found")
            conn.execute("DELETE FROM project_component_import_proposals WHERE session_id = %s", (session_id,))
            for proposal in proposals:
                conn.execute(
                    """
                    INSERT INTO project_component_import_proposals (
                        id, session_id, dedupe_key, component_uid, reference, metadata_json, assets_json,
                        provenance_json, findings_json, status, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'candidate', %s, %s)
                    """,
                    (
                        str(uuid.uuid4()),
                        session_id,
                        str(proposal["dedupe_key"]),
                        str(proposal.get("component_uid") or ""),
                        str(proposal.get("reference") or ""),
                        json.dumps(proposal.get("metadata") or {}, sort_keys=True, separators=(",", ":")),
                        json.dumps(proposal.get("assets") or [], sort_keys=True, separators=(",", ":")),
                        json.dumps(proposal.get("provenance") or [], sort_keys=True, separators=(",", ":")),
                        json.dumps(proposal.get("findings") or [], sort_keys=True, separators=(",", ":")),
                        now,
                        now,
                    ),
                )
            conn.execute(
                "UPDATE project_component_import_sessions SET status = 'staged', updated_at = %s WHERE id = %s",
                (now, session_id),
            )
            conn.commit()

    def list_project_import_proposals(self, session_id: str) -> list[dict[str, Any]]:
        self.initialize()
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM project_component_import_proposals WHERE session_id = %s ORDER BY reference, id",
                (session_id,),
            ).fetchall()
            proposals: list[dict[str, Any]] = []
            for row in rows:
                proposal = dict(row)
                proposal["metadata"] = _json_loads(proposal.pop("metadata_json"), {})
                proposal["assets"] = _json_loads(proposal.pop("assets_json"), [])
                proposal["provenance"] = _json_loads(proposal.pop("provenance_json"), [])
                proposal["findings"] = _json_loads(proposal.pop("findings_json"), [])
                proposal["draft"] = _json_loads(proposal.pop("draft_json", "{}"), {})
                proposals.append(proposal)
            return proposals

    def get_project_import_proposal(self, proposal_id: str) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM project_component_import_proposals WHERE id = %s",
                (proposal_id,),
            ).fetchone()
            if not row:
                return None
            proposal = dict(row)
            proposal["metadata"] = _json_loads(proposal.pop("metadata_json"), {})
            proposal["assets"] = _json_loads(proposal.pop("assets_json"), [])
            proposal["provenance"] = _json_loads(proposal.pop("provenance_json"), [])
            proposal["findings"] = _json_loads(proposal.pop("findings_json"), [])
            proposal["draft"] = _json_loads(proposal.pop("draft_json", "{}"), {})
            return proposal

    def save_project_import_drafts(
        self, session_id: str, drafts: dict[str, dict[str, Any]]
    ) -> int:
        """Persist unaccepted grid edits so remediation survives a reload.

        A large import is rarely resolved in one sitting. Keeping the edits on the
        proposal, rather than in browser state, also lets a second reviewer pick up
        where the first stopped.
        """
        self.initialize()
        if not drafts:
            return 0
        now = _utc_now_iso()
        with self._connect() as conn:
            updated = 0
            for proposal_id, draft in drafts.items():
                cursor = conn.execute(
                    """
                    UPDATE project_component_import_proposals
                    SET draft_json = %s, updated_at = %s
                    WHERE id = %s AND session_id = %s AND status = 'candidate'
                    """,
                    (json.dumps(draft or {}, separators=(",", ":")), now, proposal_id, session_id),
                )
                updated += cursor.rowcount
            conn.commit()
        return updated

    def _resolve_import_asset_links(self, asset_links: dict[str, str]) -> dict[str, dict[str, Any]]:
        """Load existing catalog assets an import wants to reference by id."""
        resolved: dict[str, dict[str, Any]] = {}
        requested = {
            str(asset_type): str(asset_id).strip()
            for asset_type, asset_id in (asset_links or {}).items()
            if str(asset_id or "").strip()
        }
        if not requested:
            return resolved

        with self._connect() as conn:
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

    def library_asset_presence(
        self,
        *,
        asset_type: str,
        target_library: str = "",
        target_name: str = "",
    ) -> dict[str, Any]:
        """Report whether an asset with this identity already exists in the library.

        Name-based for now: a footprint EasyEDA:CAP-SMD matches an asset whose
        target_library/target_name are those, falling back to the asset name when
        the library qualifier is absent. It answers "is something by this name in
        the library"; a content-hash upgrade would answer "is this exact file in
        the library". Returns the matching assets so the caller can show which.
        """
        self.initialize()
        normalized_type = str(asset_type or "").strip().lower()
        if normalized_type not in {"symbol", "footprint", "3dmodel", "spice"}:
            raise ValueError("Unsupported asset type")

        library = str(target_library or "").strip().lower()
        name = str(target_name or "").strip().lower()
        if not name:
            return {"assetType": normalized_type, "inLibrary": False, "matches": []}

        # A 3D model is referenced by file name, and the same model exists in
        # different formats (a project's .wrl vs a catalog .step). Match on the
        # name without its extension so those line up. Other asset types keep
        # their exact library:name identity.
        if normalized_type == "3dmodel":
            stem = re.sub(r"\.(wrl|step|stp|stpz|igs|iges|x3d)$", "", name)
            like = f"{stem}.%"
            with self._connect() as conn:
                rows = conn.execute(
                    """
                    SELECT a.id, a.name, a.target_library, a.target_name, a.sha256
                    FROM assets a
                    WHERE a.asset_type = '3dmodel'
                      AND (
                        lower(a.target_name) = %s OR lower(a.name) = %s
                        OR lower(a.target_name) LIKE %s OR lower(a.name) LIKE %s
                      )
                    LIMIT 10
                    """,
                    (stem, stem, like, like),
                ).fetchall()
        elif library:
            with self._connect() as conn:
                rows = conn.execute(
                    """
                    SELECT a.id, a.name, a.target_library, a.target_name, a.sha256
                    FROM assets a
                    WHERE a.asset_type = %s
                      AND lower(a.target_library) = %s
                      AND (lower(a.target_name) = %s OR lower(a.name) = %s)
                    LIMIT 10
                    """,
                    (normalized_type, library, name, name),
                ).fetchall()
        else:
            with self._connect() as conn:
                rows = conn.execute(
                    """
                    SELECT a.id, a.name, a.target_library, a.target_name, a.sha256
                    FROM assets a
                    WHERE a.asset_type = %s
                      AND (lower(a.target_name) = %s OR lower(a.name) = %s)
                    LIMIT 10
                    """,
                    (normalized_type, name, name),
                ).fetchall()

        matches = [
            {
                "id": str(row["id"]),
                "name": str(row["name"]),
                "target_library": str(row["target_library"] or ""),
                "target_name": str(row["target_name"] or ""),
                "sha256": str(row["sha256"]),
            }
            for row in rows
        ]
        return {
            "assetType": normalized_type,
            "inLibrary": bool(matches),
            "matches": matches,
        }

    def search_assets(
        self,
        *,
        asset_type: str,
        query: str = "",
        limit: int = 25,
    ) -> list[dict[str, Any]]:
        """Find existing catalog assets so an import can reuse one instead of copying it.

        `revision_assets` is a join table onto content-addressed `assets`, so linking
        an existing row is a genuine reference: one 0603 footprint is shared by every
        component that uses it rather than duplicated per import.
        """
        self.initialize()
        normalized_type = str(asset_type or "").strip().lower()
        if normalized_type not in {"symbol", "footprint", "3dmodel", "spice"}:
            raise ValueError("Unsupported asset type")

        term = re.sub(r"\s+", " ", str(query or "").strip())
        like = f"%{term.lower()}%"
        bounded_limit = max(1, min(int(limit or 25), 100))

        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT
                    a.id,
                    a.asset_type,
                    a.name,
                    a.target_library,
                    a.target_name,
                    a.sha256,
                    a.size_bytes,
                    COUNT(DISTINCT c.id) AS usage_count
                FROM assets a
                LEFT JOIN revision_assets ra ON ra.asset_id = a.id
                LEFT JOIN component_revisions r ON r.id = ra.revision_id
                LEFT JOIN components c ON c.id = r.component_id AND c.is_active = 1
                WHERE a.asset_type = %s
                  AND (
                    %s = ''
                    OR lower(a.name) LIKE %s
                    OR lower(a.target_name) LIKE %s
                    OR lower(a.target_library) LIKE %s
                  )
                GROUP BY a.id, a.asset_type, a.name, a.target_library, a.target_name,
                         a.sha256, a.size_bytes
                ORDER BY usage_count DESC, lower(a.target_name), a.name
                LIMIT %s
                """,
                (normalized_type, term.lower(), like, like, like, bounded_limit),
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

    def _record_component_usage(
        self,
        conn: Any,
        *,
        component_id: str,
        provenance: list[dict[str, Any]],
        observed_at: str,
        source: str = "semantic_scan",
    ) -> int:
        grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}
        for raw_source in provenance:
            project_id = str(raw_source.get("projectId") or "")
            source_revision = str(raw_source.get("sourceRevision") or "")
            if not project_id:
                continue
            detail = {
                str(key): value
                for key, value in raw_source.items()
                if value not in (None, "", [], {})
            }
            grouped.setdefault((project_id, source_revision), []).append(detail)

        for (project_id, source_revision), details in grouped.items():
            conn.execute(
                """
                UPDATE component_usage
                SET is_current = 0, last_seen_at = %s
                WHERE component_id = %s AND project_id = %s AND source_revision <> %s AND is_current = 1
                """,
                (observed_at, component_id, project_id, source_revision),
            )
            references = sorted(
                {
                    str(detail.get("reference") or "")
                    for detail in details
                    if str(detail.get("reference") or "")
                }
            )
            conn.execute(
                """
                INSERT INTO component_usage (
                    id, component_id, project_id, source_revision, references_json, details_json,
                    source, is_current, first_seen_at, last_seen_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, 1, %s, %s)
                ON CONFLICT(component_id, project_id, source_revision)
                DO UPDATE SET references_json = excluded.references_json,
                              details_json = excluded.details_json,
                              source = excluded.source,
                              is_current = 1,
                              last_seen_at = excluded.last_seen_at
                """,
                (
                    str(uuid.uuid4()),
                    component_id,
                    project_id,
                    source_revision,
                    json.dumps(references, separators=(",", ":")),
                    json.dumps(details, sort_keys=True, separators=(",", ":")),
                    source,
                    observed_at,
                    observed_at,
                ),
            )
        return len(grouped)

    def index_project_component_usage(self, proposals: list[dict[str, Any]]) -> dict[str, int]:
        """Index where-used observations even when no import proposal is accepted."""
        self.initialize()
        matched_components: set[str] = set()
        observations = 0
        now = _utc_now_iso()
        with self._connect() as conn:
            for proposal in proposals:
                metadata = dict(proposal.get("metadata") or {})
                manufacturer = str(metadata.get("manufacturer") or "").strip()
                mpn = str(metadata.get("manufacturer_part_number") or metadata.get("mpn") or "").strip()
                if not manufacturer or not mpn:
                    continue
                component = conn.execute(
                    """
                    SELECT component.id
                    FROM components component
                    JOIN component_revisions revision ON revision.id = component.current_revision_id
                    WHERE component.is_active = 1
                      AND lower(revision.manufacturer) = lower(%s)
                      AND lower(revision.mpn) = lower(%s)
                    ORDER BY component.created_at
                    LIMIT 1
                    """,
                    (manufacturer, mpn),
                ).fetchone()
                if not component:
                    continue
                component_id = str(component["id"])
                matched_components.add(component_id)
                observations += self._record_component_usage(
                    conn,
                    component_id=component_id,
                    provenance=list(proposal.get("provenance") or []),
                    observed_at=now,
                    source="semantic_scan",
                )
            conn.commit()
        return {"matched_components": len(matched_components), "observations": observations}

    def match_component_identities(self, identities: list[dict[str, str]]) -> dict[str, dict[str, Any]]:
        """Resolve manufacturer/MPN identities in one catalog query for import preflight."""
        requested = {
            (str(item.get("manufacturer") or "").strip().casefold(), str(item.get("mpn") or "").strip().casefold())
            for item in identities
            if str(item.get("manufacturer") or "").strip() and str(item.get("mpn") or "").strip()
        }
        if not requested:
            return {}
        self.initialize()
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT component.id, revision.name, revision.manufacturer, revision.mpn,
                       revision.id AS revision_id, revision.version
                FROM components component
                JOIN component_revisions revision ON revision.id = component.current_revision_id
                WHERE component.is_active = 1
                """
            ).fetchall()
        matches: dict[str, dict[str, Any]] = {}
        for row in rows:
            key = (str(row["manufacturer"] or "").strip().casefold(), str(row["mpn"] or "").strip().casefold())
            if key not in requested:
                continue
            matches["\0".join(key)] = {
                "component_id": str(row["id"]),
                "revision_id": str(row["revision_id"]),
                "version": int(row["version"] or 0),
                "name": str(row["name"] or row["mpn"] or ""),
                "manufacturer": str(row["manufacturer"] or ""),
                "manufacturer_part_number": str(row["mpn"] or ""),
            }
        return matches

    def _revision_matches_import(
        self,
        conn: Any,
        revision: dict[str, Any],
        metadata: dict[str, Any],
        selected_assets: dict[str, list[dict[str, Any]]],
    ) -> bool:
        metadata_fields = (
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
            for asset in self._load_assets_for_revision(conn, str(revision["id"]))
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

    def _validate_project_import_asset_paths(
        self,
        proposal: dict[str, Any],
        selected_assets: dict[str, list[dict[str, Any]]],
    ) -> None:
        imports_root = (self._store_root / "imports" / str(proposal["session_id"])).resolve()
        for asset_type, candidates in selected_assets.items():
            for asset in candidates:
                staged_path = Path(str(asset.get("staged_path") or "")).resolve()
                try:
                    staged_path.relative_to(imports_root)
                except ValueError as exc:
                    raise ValueError("Import proposal contains an invalid staged asset path") from exc
                if not staged_path.is_file() or _sha256_file(staged_path) != str(asset.get("sha256") or ""):
                    raise ValueError(f"Staged {asset_type} asset is missing or has changed")

    def accept_project_import_proposal(
        self,
        proposal_id: str,
        *,
        metadata_overrides: dict[str, Any] | None = None,
        asset_selections: dict[str, list[str]] | None = None,
        asset_links: dict[str, str] | None = None,
        actor: str = "",
        change_summary: str = "Import component from project",
    ) -> dict[str, Any]:
        self.initialize()
        proposal = self.get_project_import_proposal(proposal_id)
        if not proposal:
            raise ValueError("Import proposal not found")
        if proposal["status"] != "candidate":
            raise ValueError("Project import proposal has already been resolved")
        source_metadata = dict(proposal["metadata"])
        fields = dict(source_metadata.get("fields") or {})
        normalized_input: dict[str, Any] = {
            "value": source_metadata.get("value"),
            "description": source_metadata.get("description"),
            "datasheet": source_metadata.get("datasheet"),
            "manufacturer": source_metadata.get("manufacturer"),
            "manufacturer_part_number": source_metadata.get("manufacturer_part_number"),
            "package_name": source_metadata.get("footprint"),
            "vendor": fields.get("Vendor", ""),
            "vendor_part_number": fields.get("Vendor Part Number", ""),
            "mass_g": fields.get("Mass (g)", ""),
            "rqjc_c_w": fields.get("RQjC (C/W)", ""),
            "rqjc_top_c_w": fields.get("RQjC_top (C/W)", ""),
            "temp_max_c": fields.get("Temp_max (C)", ""),
            "temp_min_c": fields.get("Temp_min (C)", ""),
            "power_dissipation_w": fields.get("Power Dissipation (W)", ""),
            "rate": fields.get("Rate", ""),
            "extra_fields": fields,
            **(metadata_overrides or {}),
        }
        metadata = self._normalize_metadata(normalized_input)
        assets = list(proposal["assets"])
        by_type: dict[str, list[dict[str, Any]]] = {}
        for asset in assets:
            by_type.setdefault(str(asset.get("asset_type") or ""), []).append(asset)
        # An asset type may instead be satisfied by an existing catalog asset. That is
        # a reference, not a copy: the same assets row is linked into this revision, so
        # one shared 0603 footprint serves every part that uses it.
        linked_assets = self._resolve_import_asset_links(asset_links or {})

        selected_by_type: dict[str, list[dict[str, Any]]] = {}
        requested_selections = asset_selections or {}
        for asset_type, candidates in by_type.items():
            if asset_type in linked_assets:
                # The reviewer chose an existing catalog asset; the project's own
                # candidates for this type are deliberately not imported.
                continue
            selection_was_explicit = asset_type in requested_selections
            selected_hashes = set(requested_selections.get(asset_type) or [])
            selected = [candidate for candidate in candidates if str(candidate.get("sha256") or "") in selected_hashes]
            if selected_hashes and len(selected) != len(selected_hashes):
                raise ValueError(f"Asset selection for {asset_type} contains an unknown content hash")
            if asset_type in PLACE_REQUIRED_ASSET_TYPES:
                effective = selected if selection_was_explicit else candidates
                if len(effective) != 1:
                    raise ValueError(f"Select exactly one {asset_type} asset before import")
                selected_by_type[asset_type] = effective
            else:
                # An explicit empty list means "do not import optional assets". This
                # distinction matters for teams that intentionally exclude project-local
                # simulation or mechanical files from the managed library.
                selected_by_type[asset_type] = selected if selection_was_explicit else candidates
        by_type = selected_by_type
        for required_type in PLACE_REQUIRED_ASSET_TYPES:
            if not by_type.get(required_type) and required_type not in linked_assets:
                raise ValueError(
                    "A symbol and footprint are required before accepting a project import"
                )
        # "<asset_type>_not_resolved" means the extractor could not find that asset in
        # the project. Linking an existing catalog asset is exactly the remedy, so a
        # supplied link clears the finding it answers.
        resolved_by_link = {f"{asset_type}_not_resolved" for asset_type in linked_assets}
        blocking = [
            finding
            for finding in proposal["findings"]
            if finding.get("severity") == "error"
            and not str(finding.get("code") or "").startswith("missing_metadata_")
            and not str(finding.get("code") or "").startswith("conflicting_")
            and str(finding.get("code") or "") not in resolved_by_link
        ]
        if blocking:
            raise ValueError("Resolve blocking import findings before accepting this proposal")
        self._validate_project_import_asset_paths(proposal, by_type)

        now = _utc_now_iso()
        with self._connect() as conn:
            claimed = conn.execute(
                """
                UPDATE project_component_import_proposals
                SET status = 'accepting', updated_at = %s
                WHERE id = %s AND status = 'candidate'
                """,
                (now, proposal_id),
            )
            if claimed.rowcount == 0:
                raise ValueError("Project import proposal has already been resolved")
            self._lock_component_identity(conn, metadata["manufacturer"], metadata["mpn"])
            existing = conn.execute(
                """
                SELECT c.id
                FROM components c
                JOIN component_revisions revision ON revision.id = c.current_revision_id
                WHERE c.is_active = 1 AND lower(revision.manufacturer) = lower(%s) AND lower(revision.mpn) = lower(%s)
                ORDER BY c.created_at
                LIMIT 1
                """,
                (metadata["manufacturer"], metadata["mpn"]),
            ).fetchone()
            component_id = str(existing["id"]) if existing else str(uuid.uuid4())
            provenance = list(proposal["provenance"])
            provenance_source = str(provenance[0].get("source") or "project") if provenance else "project"
            import_source = "folder_snapshot" if provenance_source == "folder_snapshot" else "project"
            external_id = (
                str(provenance[0].get("snapshotId") or provenance[0].get("projectId") or "")
                if provenance
                else ""
            )
            current_revision = (
                self._revision_row(conn, str(self._component_row(conn, component_id)["current_revision_id"]))
                if existing
                else None
            )
            no_content_change = bool(
                current_revision
                and self._revision_matches_import(conn, current_revision, metadata, by_type)
            )
            if no_content_change and current_revision:
                revision_id = str(current_revision["id"])
            else:
                _, revision_id = self._upsert_component_metadata_row(
                    conn,
                    component_id=component_id,
                    metadata=metadata,
                    now=now,
                    existing_component_id=component_id if existing else None,
                    actor=actor,
                    change_summary=change_summary,
                    finalize_revision=False,
                    source=SOURCE_EXTERNAL,
                    external_source=import_source,
                    external_id=external_id,
                    change_kind="folder_import" if import_source == "folder_snapshot" else "project_import",
                )
                for asset_type, candidates in by_type.items():
                    for asset in candidates:
                        staged_path = Path(str(asset.get("staged_path") or "")).resolve()
                        # Recheck immediately before reading to close the window between
                        # proposal validation and canonical storage.
                        if _sha256_file(staged_path) != str(asset.get("sha256") or ""):
                            raise ValueError(f"Staged {asset_type} asset has changed")
                        payload = staged_path.read_bytes()
                        target_library = str(asset.get("target_library") or "Prism_Imported")
                        target_name = str(asset.get("target_name") or staged_path.stem)
                        if asset_type == "symbol":
                            destination = self._symbol_destination(target_library, target_name)
                        elif asset_type == "footprint":
                            destination = self._footprint_destination(target_library, target_name)
                        elif asset_type in {"3dmodel", "spice"}:
                            destination = self._aux_destination(asset_type, target_library, staged_path.name)
                        else:
                            continue
                        canonical_path = self._write_canonical_file(destination, payload)
                        registered = self._register_asset(
                            conn,
                            asset_type=asset_type,
                            canonical_path=canonical_path,
                            target_library=target_library,
                            target_name=target_name,
                            source_group=f"{import_source}:{proposal['session_id']}",
                        )
                        self._link_asset_to_revision(
                            conn,
                            revision_id,
                            registered,
                            required=asset_type in PLACE_REQUIRED_ASSET_TYPES,
                        )
                for asset_type, existing_asset in linked_assets.items():
                    self._link_asset_to_revision(
                        conn,
                        revision_id,
                        existing_asset,
                        required=asset_type in PLACE_REQUIRED_ASSET_TYPES,
                    )
                self._finalize_revision(
                    conn,
                    component_id=component_id,
                    revision_id=revision_id,
                    event_type="component.imported" if not existing else "revision.created",
                    actor=actor,
                    details={
                        "change_kind": "folder_import" if import_source == "folder_snapshot" else "project_import",
                        "change_summary": change_summary,
                        "proposal_id": proposal_id,
                        "provenance": provenance,
                    },
                )
            self._record_component_usage(
                conn,
                component_id=component_id,
                provenance=provenance,
                observed_at=now,
                source="project_import",
            )
            conn.execute(
                """
                UPDATE project_component_import_proposals
                SET status = 'accepted', accepted_component_id = %s, updated_at = %s
                WHERE id = %s AND status = 'accepting'
                """,
                (component_id, now, proposal_id),
            )
            conn.commit()
        return {
            "proposal": self.get_project_import_proposal(proposal_id),
            "component": self.get_component(component_id),
        }

    def reject_project_import_proposal(self, proposal_id: str) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            result = conn.execute(
                """
                UPDATE project_component_import_proposals
                SET status = 'rejected', updated_at = %s
                WHERE id = %s AND status = 'candidate'
                """,
                (_utc_now_iso(), proposal_id),
            )
            if result.rowcount == 0:
                raise ValueError("Project import proposal was not found or has already been resolved")
            conn.commit()
        return self.get_project_import_proposal(proposal_id) or {}

    def purge_superseded_step_files(self) -> dict[str, Any]:
        """Purge obsolete STEP bytes while preserving immutable revision evidence.

        The asset row, hash, revision link, and audit history remain intact. A file
        is removed only when a newer current revision for that component has a
        different 3D model and no component currently uses the old asset.
        """
        self.initialize()
        with self._connect() as conn:
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
                path.relative_to(self._store_root)
            except ValueError:
                continue
            if path.suffix.lower() not in {".step", ".stp"}:
                continue
            if path.is_file():
                path.unlink()
                purged.append(str(row["id"]))
        return {"purged": len(purged), "asset_ids": purged}

    def cleanup_resolved_import_staging(self, *, older_than: str) -> dict[str, Any]:
        """Remove regenerable staged copies after every proposal is resolved."""
        self.initialize()
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT session.id
                FROM project_component_import_sessions session
                WHERE session.updated_at < %s
                  AND NOT EXISTS (
                    SELECT 1 FROM project_component_import_proposals proposal
                    WHERE proposal.session_id = session.id
                      AND proposal.status IN ('candidate', 'accepting')
                  )
                """,
                (older_than,),
            ).fetchall()
        removed: list[str] = []
        imports_root = (self._store_root / "imports").resolve()
        for row in rows:
            session_id = str(row["id"])
            path = (imports_root / session_id).resolve()
            try:
                path.relative_to(imports_root)
            except ValueError:
                continue
            if path.is_dir():
                shutil.rmtree(path)
                removed.append(session_id)
        return {"removed": len(removed), "session_ids": removed}

    def _component_summary_payload(
        self,
        component_row: dict[str, Any],
        revision_row: dict[str, Any],
        assets: list[dict[str, Any]],
        *,
        released_view: bool = False,
        validation_summary: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        availability_state, missing_assets, place_enabled = self._availability(
            assets,
            str(revision_row["release_status"]),
            bool(component_row["is_active"]),
        )
        symbol_asset = next((asset for asset in assets if asset["asset_type"] == "symbol"), None)
        # Lightweight payloads are used by the KiCad remote panel; avoid validation lookups on search paths.
        validation_summary = validation_summary or {
            "status": VALIDATION_STATUS_NOT_RUN,
            "enabled": bool(settings.CATALOG_KLC_ENABLED),
            "release_gate": self._klc_release_gate(),
            "revision_id": str(revision_row["id"]),
            "error_count": 0,
            "warning_count": 0,
            "missing_required_assets": [],
            "assets": [],
        }
        return {
            "id": str(component_row["id"]),
            "slug": str(component_row["slug"]),
            "source": str(component_row["source"]),
            "name": str(revision_row["name"]),
            "value": str(revision_row["value"]),
            "manufacturer": str(revision_row["manufacturer"]),
            "mpn": str(revision_row["mpn"]),
            "description": str(revision_row["description"]),
            "package_name": str(revision_row["package_name"]),
            "category": str(revision_row["category"]),
            "datasheet_url": str(revision_row["datasheet_url"]),
            "vendor": str(revision_row["vendor"]),
            "vendor_part_number": str(revision_row["vendor_part_number"]),
            "mass_g": str(revision_row["mass_g"]),
            "rqjc_c_w": str(revision_row["rqjc_c_w"]),
            "rqjc_top_c_w": str(revision_row["rqjc_top_c_w"]),
            "temp_max_c": str(revision_row["temp_max_c"]),
            "temp_min_c": str(revision_row["temp_min_c"]),
            "power_dissipation_w": str(revision_row["power_dissipation_w"]),
            "rate": str(revision_row["rate"]),
            "sap_code": str(revision_row["sap_code"]),
            "extra_fields": _json_loads(revision_row.get("extra_fields"), {}),
            "summary": str(revision_row["summary"]),
            "revision": int(revision_row["version"]),
            "version": f"{int(revision_row['version'])}.0.0",
            "library_name": str(symbol_asset["target_library"]) if symbol_asset else "",
            "symbol_name": str(symbol_asset["target_name"]) if symbol_asset else "",
            "availability_state": availability_state,
            "missing_assets": missing_assets,
            "place_enabled": place_enabled,
            "stock_quantity": float(component_row["stock_quantity"]),
            "stock_uom": str(component_row["stock_uom"]),
            "inventory_status": str(component_row["inventory_status"]),
            "release_status": _normalize_workflow_stage(str(revision_row["release_status"])),
            "workflow_stage": _normalize_workflow_stage(str(revision_row["release_status"])),
            "released_view": released_view,
            "revision_id": str(revision_row["id"]),
            "revision_updated_at": str(revision_row["updated_at"]),
            # Who authored the current revision. Stored all along, but omitted here,
            # so every catalog row rendered as "Unknown author".
            "created_by": str(revision_row.get("created_by") or ""),
            "component_updated_at": str(component_row["updated_at"]),
            "assets": [],
            "previews": [],
            "validation": validation_summary,
        }

    def list_components(
        self,
        *,
        query: str = "",
        source: str | None = None,
        availability_state: str | None = None,
        workflow_stage: str | None = None,
        validation_status: str | None = None,
        category: str | None = None,
        include_inactive: bool = False,
        page: int = 1,
        page_size: int = 50,
        released_only: bool = False,
        lightweight: bool = False,
        sort_by: str = "",
        sort_dir: str = "asc",
    ) -> dict[str, Any]:
        self.initialize()
        offset = (page - 1) * page_size
        revision_ref = "rr" if released_only else "cr"
        revision_join_column = "released_revision_id" if released_only else "current_revision_id"
        filters: list[str] = []
        params: list[Any] = []

        if not include_inactive:
            filters.append("c.is_active = 1")
        if source:
            filters.append("c.source = %s")
            params.append(source)
        if category is not None:
            filters.append(f"{revision_ref}.category = %s")
            params.append(category)
        requested_workflow_stages = _dedupe(
            [
                normalized
                for raw_stage in str(workflow_stage or "").split(",")
                if (normalized := _normalize_workflow_stage(raw_stage.strip()))
            ]
        )
        if requested_workflow_stages:
            unsupported_stages = [
                stage for stage in requested_workflow_stages if stage not in WORKFLOW_STAGES
            ]
            if unsupported_stages:
                raise ValueError("Unsupported workflow stage")
            placeholders = ",".join("%s" for _ in requested_workflow_stages)
            filters.append(f"{revision_ref}.release_status IN ({placeholders})")
            params.extend(requested_workflow_stages)
        if availability_state:
            symbol_exists = (
                f"EXISTS (SELECT 1 FROM revision_assets ra_symbol "
                f"WHERE ra_symbol.revision_id = {revision_ref}.id AND ra_symbol.asset_type = 'symbol')"
            )
            footprint_exists = (
                f"EXISTS (SELECT 1 FROM revision_assets ra_footprint "
                f"WHERE ra_footprint.revision_id = {revision_ref}.id AND ra_footprint.asset_type = 'footprint')"
            )
            if availability_state == STATE_PLACE_READY:
                filters.append(f"{symbol_exists} AND {footprint_exists}")
            elif availability_state == STATE_METADATA_ONLY:
                filters.append(f"NOT {symbol_exists} AND NOT {footprint_exists}")
            elif availability_state == STATE_FILES_PARTIAL:
                filters.append(f"(({symbol_exists}) <> ({footprint_exists}))")
            else:
                raise ValueError("Unsupported availability state")
        if validation_status:
            supported_validation_statuses = {
                VALIDATION_STATUS_PASSED,
                VALIDATION_STATUS_WARNING,
                VALIDATION_STATUS_FAILED,
                VALIDATION_STATUS_SKIPPED,
                VALIDATION_STATUS_NOT_RUN,
            }
            if validation_status not in supported_validation_statuses:
                raise ValueError("Unsupported validation status")

            relevant_assets_exist = (
                f"EXISTS (SELECT 1 FROM revision_assets ra_validation_any "
                f"JOIN assets asset_validation_any ON asset_validation_any.id = ra_validation_any.asset_id "
                f"WHERE ra_validation_any.revision_id = {revision_ref}.id "
                f"AND asset_validation_any.asset_type IN ('symbol', 'footprint'))"
            )

            def latest_status_exists(status: str, suffix: str) -> str:
                # Scope runs to the revision (direct or inherited evidence). Matching
                # by asset_id alone incorrectly picks status from unrelated revisions.
                return (
                    f"EXISTS (SELECT 1 FROM revision_assets ra_validation_{suffix} "
                    f"JOIN assets asset_validation_{suffix} ON asset_validation_{suffix}.id = ra_validation_{suffix}.asset_id "
                    f"WHERE ra_validation_{suffix}.revision_id = {revision_ref}.id "
                    f"AND asset_validation_{suffix}.asset_type IN ('symbol', 'footprint') "
                    f"AND COALESCE(("
                    f"SELECT avr_validation_{suffix}.status "
                    f"FROM asset_validation_runs avr_validation_{suffix} "
                    f"WHERE avr_validation_{suffix}.revision_id = {revision_ref}.id "
                    f"AND avr_validation_{suffix}.asset_id = asset_validation_{suffix}.id "
                    f"ORDER BY avr_validation_{suffix}.finished_at DESC, avr_validation_{suffix}.created_at DESC "
                    f"LIMIT 1"
                    f"), COALESCE(("
                    f"SELECT inherited_run_{suffix}.status "
                    f"FROM revision_validation_evidence_links inherited_link_{suffix} "
                    f"JOIN asset_validation_runs inherited_run_{suffix} "
                    f"  ON inherited_run_{suffix}.id = inherited_link_{suffix}.source_run_id "
                    f"WHERE inherited_link_{suffix}.revision_id = {revision_ref}.id "
                    f"AND inherited_link_{suffix}.asset_id = asset_validation_{suffix}.id "
                    f"LIMIT 1"
                    f"), '{VALIDATION_STATUS_NOT_RUN}')) = '{status}')"
                )

            failed_exists = latest_status_exists(VALIDATION_STATUS_FAILED, "failed")
            warning_exists = latest_status_exists(VALIDATION_STATUS_WARNING, "warning")
            skipped_exists = latest_status_exists(VALIDATION_STATUS_SKIPPED, "skipped")
            not_run_exists = latest_status_exists(VALIDATION_STATUS_NOT_RUN, "not_run")

            if validation_status == VALIDATION_STATUS_FAILED:
                filters.append(failed_exists)
            elif validation_status == VALIDATION_STATUS_WARNING:
                filters.append(f"NOT {failed_exists} AND {warning_exists}")
            elif validation_status == VALIDATION_STATUS_SKIPPED:
                filters.append(f"NOT {failed_exists} AND NOT {warning_exists} AND {skipped_exists}")
            elif validation_status == VALIDATION_STATUS_NOT_RUN:
                filters.append(
                    f"(NOT {relevant_assets_exist} OR "
                    f"(NOT {failed_exists} AND NOT {warning_exists} AND NOT {skipped_exists} AND {not_run_exists}))"
                )
            elif validation_status == VALIDATION_STATUS_PASSED:
                filters.append(
                    f"{relevant_assets_exist} AND NOT {failed_exists} AND NOT {warning_exists} "
                    f"AND NOT {skipped_exists} AND NOT {not_run_exists}"
                )
        if released_only:
            filters.append("c.released_revision_id <> ''")
            filters.append("rr.release_status = 'released'")
        query_text = query.strip()
        # Postgres catalog search uses search_document (+ optional pg_trgm). The
        # legacy SQLite FTS branch is intentionally disabled to avoid rowid MATCH.
        if query_text:
            filters.append(
                f"(LOWER({revision_ref}.search_document) LIKE LOWER(%s) "
                f"OR LOWER({revision_ref}.created_by) LIKE LOWER(%s))"
            )
            params.extend([f"%{query_text}%", f"%{query_text}%"])
        where_sql = f"WHERE {' AND '.join(filters)}" if filters else ""
        sort_columns = {
            "name": f"{revision_ref}.name",
            "mpn": f"{revision_ref}.mpn",
            "manufacturer": f"{revision_ref}.manufacturer",
            "category": f"{revision_ref}.category",
            "package_name": f"{revision_ref}.package_name",
            "workflow_stage": f"{revision_ref}.release_status",
            "release_status": f"{revision_ref}.release_status",
            "updated_at": f"{revision_ref}.updated_at",
        }
        sort_direction = "DESC" if sort_dir.lower() == "desc" else "ASC"
        sort_column = sort_columns.get(sort_by)
        if sort_by == "availability_state":
            symbol_exists = (
                f"EXISTS (SELECT 1 FROM revision_assets ra_symbol_sort "
                f"WHERE ra_symbol_sort.revision_id = {revision_ref}.id AND ra_symbol_sort.asset_type = 'symbol')"
            )
            footprint_exists = (
                f"EXISTS (SELECT 1 FROM revision_assets ra_footprint_sort "
                f"WHERE ra_footprint_sort.revision_id = {revision_ref}.id AND ra_footprint_sort.asset_type = 'footprint')"
            )
            sort_column = f"CASE WHEN {symbol_exists} AND {footprint_exists} THEN 0 WHEN ({symbol_exists}) <> ({footprint_exists}) THEN 1 ELSE 2 END"

        if sort_column:
            order_sql = f"ORDER BY {sort_column} {sort_direction}, {revision_ref}.updated_at DESC"
            order_params = []
        elif query_text:
            order_sql = (
                f"ORDER BY CASE "
                f"WHEN LOWER({revision_ref}.mpn) = LOWER(%s) THEN 0 "
                f"WHEN LOWER({revision_ref}.mpn) LIKE LOWER(%s) THEN 1 "
                f"WHEN LOWER({revision_ref}.name) LIKE LOWER(%s) THEN 2 "
                f"ELSE 3 END, {revision_ref}.updated_at DESC"
            )
            order_params: list[Any] = [query_text, f"{query_text}%", f"{query_text}%"]
        else:
            order_sql = f"ORDER BY {revision_ref}.updated_at DESC"
            order_params = []

        with self._connect() as conn:
            total = int(
                conn.execute(
                    f"""
                    SELECT COUNT(1) AS total
                    FROM components c
                    JOIN component_revisions {revision_ref} ON {revision_ref}.id = c.{revision_join_column}
                    {where_sql}
                    """,
                    tuple(params),
                ).fetchone()["total"]
            )
            rows = conn.execute(
                f"""
                SELECT c.*, {revision_ref}.id AS revision_id
                FROM components c
                JOIN component_revisions {revision_ref} ON {revision_ref}.id = c.{revision_join_column}
                {where_sql}
                {order_sql}
                LIMIT %s OFFSET %s
                """,
                tuple(params + order_params + [page_size, offset]),
            ).fetchall()
            row_pairs: list[tuple[dict[str, Any], str]] = []
            for row in rows:
                component_row = dict(row)
                revision_id = str(component_row.pop("revision_id"))
                row_pairs.append((component_row, revision_id))

            revision_ids = [revision_id for _, revision_id in row_pairs]
            revisions_by_id: dict[str, dict[str, Any]] = {}
            if revision_ids:
                placeholders = ",".join("%s" for _ in revision_ids)
                revision_rows = conn.execute(
                    f"SELECT * FROM component_revisions WHERE id IN ({placeholders})",
                    tuple(revision_ids),
                ).fetchall()
                revisions_by_id = {str(revision["id"]): dict(revision) for revision in revision_rows}

            parsed_rows = []
            for component_row, revision_id in row_pairs:
                revision = revisions_by_id.get(revision_id)
                if revision:
                    parsed_rows.append((component_row, revision))

            revision_ids = [str(rev["id"]) for _, rev in parsed_rows]
            assets_by_revision: dict[str, list[dict[str, Any]]] = {}
            all_asset_ids: list[str] = []
            if revision_ids:
                placeholders = ",".join("%s" for _ in revision_ids)
                all_assets_rows = [
                    dict(r) for r in conn.execute(
                        f"""
                        SELECT a.*, ra.required, ra.revision_id
                        FROM revision_assets ra
                        JOIN assets a ON a.id = ra.asset_id
                        WHERE ra.revision_id IN ({placeholders})
                        ORDER BY CASE a.asset_type
                            WHEN 'symbol' THEN 1 WHEN 'footprint' THEN 2
                            WHEN '3dmodel' THEN 3 WHEN 'spice' THEN 4 ELSE 99
                        END, a.target_library, a.target_name
                        """,
                        tuple(revision_ids),
                    ).fetchall()
                ]
                for asset_row in all_assets_rows:
                    rev_id = str(asset_row.pop("revision_id"))
                    assets_by_revision.setdefault(rev_id, []).append(asset_row)
                    all_asset_ids.append(str(asset_row["id"]))

            previews_by_revision: dict[str, list[dict[str, Any]]] = {}
            validation_by_revision: dict[str, dict[str, dict[str, Any]]] = {}
            if not lightweight:
                for preview_row in self._load_previews_for_revisions(conn, revision_ids):
                    preview_revision_id = str(preview_row.pop("revision_id"))
                    previews_by_revision.setdefault(preview_revision_id, []).append(preview_row)
            if revision_ids:
                placeholders = ",".join("%s" for _ in revision_ids)
                validation_rows = conn.execute(
                    f"""
                    SELECT *
                    FROM asset_validation_runs
                    WHERE revision_id IN ({placeholders})
                    ORDER BY revision_id, asset_id, finished_at DESC, created_at DESC
                    """,
                    tuple(revision_ids),
                ).fetchall()
                for validation_row in validation_rows:
                    revision_id = str(validation_row["revision_id"])
                    asset_id = str(validation_row["asset_id"])
                    revision_runs = validation_by_revision.setdefault(revision_id, {})
                    if asset_id not in revision_runs:
                        revision_runs[asset_id] = dict(validation_row)
                inherited_rows = conn.execute(
                    f"""
                    SELECT run.*, run.revision_id AS inherited_from_revision_id,
                           link.revision_id AS inherited_for_revision_id, link.asset_id AS linked_asset_id
                    FROM revision_validation_evidence_links link
                    JOIN asset_validation_runs run ON run.id = link.source_run_id
                    WHERE link.revision_id IN ({placeholders})
                    """,
                    tuple(revision_ids),
                ).fetchall()
                for inherited_row in inherited_rows:
                    revision_id = str(inherited_row["inherited_for_revision_id"])
                    asset_id = str(inherited_row["linked_asset_id"])
                    revision_runs = validation_by_revision.setdefault(revision_id, {})
                    if asset_id not in revision_runs:
                        revision_runs[asset_id] = dict(inherited_row)

            items = []
            for component_row, revision_row in parsed_rows:
                rev_assets = assets_by_revision.get(str(revision_row["id"]), [])
                if lightweight:
                    validation = self._component_validation_summary(
                        conn,
                        str(revision_row["id"]),
                        rev_assets,
                        preloaded_runs=validation_by_revision.get(str(revision_row["id"]), {}),
                    )
                    items.append(
                        self._component_summary_payload(
                            component_row,
                            revision_row,
                            rev_assets,
                            released_view=released_only,
                            validation_summary=validation,
                        )
                    )
                    continue
                rev_previews = previews_by_revision.get(str(revision_row["id"]), [])
                items.append(
                    self._component_payload(
                        conn,
                        component_row,
                        revision_row,
                        released_view=released_only,
                        preloaded_assets=rev_assets,
                        preloaded_previews=rev_previews,
                        preloaded_validation_runs=validation_by_revision.get(str(revision_row["id"]), {}),
                    )
                )

        pages = max(1, (total + page_size - 1) // page_size)
        return {"items": items, "total": total, "page": page, "page_size": page_size, "pages": pages}

    def list_components_flat(self, **kwargs: Any) -> list[dict[str, Any]]:
        return self.list_components(page=1, page_size=10000, **kwargs)["items"]

    def workflow_summary(self) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT cr.release_status AS workflow_stage, COUNT(1) AS count
                FROM components c
                JOIN component_revisions cr ON cr.id = c.current_revision_id
                WHERE c.is_active = 1
                GROUP BY cr.release_status
                """
            ).fetchall()
        counts = {stage: 0 for stage in WORKFLOW_STAGES}
        for row in rows:
            stage = _normalize_workflow_stage(str(row["workflow_stage"]))
            if stage in counts:
                counts[stage] += int(row["count"])
        return {"stages": [{"workflow_stage": stage, "count": counts[stage]} for stage in WORKFLOW_STAGES]}

    def release_queue_summary(self) -> dict[str, int]:
        """Return queue-wide counters without materializing component payloads.

        The release workspace is server paginated, so its header metrics must be
        computed independently from the visible page. A blocker is either missing
        required CAD or a failed validation run for the exact current revision.
        """

        self.initialize()
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT
                    SUM(CASE WHEN cr.release_status = 'qa_review' THEN 1 ELSE 0 END) AS qa_review,
                    SUM(CASE WHEN cr.release_status = 'done' THEN 1 ELSE 0 END) AS done,
                    SUM(
                        CASE WHEN
                            NOT EXISTS (
                                SELECT 1 FROM revision_assets ra_symbol
                                WHERE ra_symbol.revision_id = cr.id
                                  AND ra_symbol.asset_type = 'symbol'
                            )
                            OR NOT EXISTS (
                                SELECT 1 FROM revision_assets ra_footprint
                                WHERE ra_footprint.revision_id = cr.id
                                  AND ra_footprint.asset_type = 'footprint'
                            )
                            OR EXISTS (
                                SELECT 1
                                FROM revision_assets ra_validation
                                JOIN assets validation_asset
                                  ON validation_asset.id = ra_validation.asset_id
                                WHERE ra_validation.revision_id = cr.id
                                  AND validation_asset.asset_type IN ('symbol', 'footprint')
                                  AND COALESCE((
                                      SELECT validation_run.status
                                      FROM asset_validation_runs validation_run
                                      WHERE validation_run.revision_id = cr.id
                                        AND validation_run.asset_id = validation_asset.id
                                      ORDER BY validation_run.finished_at DESC,
                                               validation_run.created_at DESC
                                      LIMIT 1
                                  ), 'not_run') = 'failed'
                            )
                        THEN 1 ELSE 0 END
                    ) AS blocked
                FROM components c
                JOIN component_revisions cr ON cr.id = c.current_revision_id
                WHERE c.is_active = 1
                  AND cr.release_status IN ('qa_review', 'done')
                """
            ).fetchone()
        return {
            "qa_review": int(row["qa_review"] or 0),
            "done": int(row["done"] or 0),
            "blocked": int(row["blocked"] or 0),
        }

    def search_components(self, query: str, *, page: int = 1, page_size: int = 50) -> dict[str, Any]:
        return self.list_components(
            query=query,
            include_inactive=False,
            page=page,
            page_size=page_size,
            released_only=True,
            lightweight=True,
        )

    def list_remote_component_heads(
        self,
        *,
        query: str = "",
        category: str | None = None,
        page: int = 1,
        page_size: int = 50,
        include_total: bool = True,
    ) -> dict[str, Any]:
        """Read the released KiCad-provider projection without hydrating revisions."""

        self.initialize()
        normalized_page = max(1, int(page))
        normalized_size = max(1, min(200, int(page_size)))
        offset = (normalized_page - 1) * normalized_size
        filters: list[str] = []
        params: list[Any] = []
        query_text = query.strip()
        if category is not None:
            filters.append("category = %s")
            params.append(category)
        if query_text:
            filters.append(
                "(LOWER(search_document) LIKE LOWER(%s) "
                "OR LOWER(mpn) LIKE LOWER(%s) "
                "OR LOWER(name) LIKE LOWER(%s))"
            )
            wildcard = f"%{query_text}%"
            params.extend([wildcard, wildcard, wildcard])
        where_sql = f"WHERE {' AND '.join(filters)}" if filters else ""
        if query_text:
            order_sql = (
                "ORDER BY CASE "
                "WHEN LOWER(mpn) = LOWER(%s) THEN 0 "
                "WHEN LOWER(mpn) LIKE LOWER(%s) THEN 1 "
                "WHEN LOWER(name) LIKE LOWER(%s) THEN 2 "
                "ELSE 3 END, updated_at DESC"
            )
            order_params: list[Any] = [
                query_text,
                f"{query_text}%",
                f"{query_text}%",
            ]
        else:
            order_sql = "ORDER BY updated_at DESC"
            order_params = []

        with self._connect() as conn:
            total: int | None = None
            if include_total:
                total = int(
                    conn.execute(
                        f"SELECT COUNT(1) AS total FROM remote_component_heads {where_sql}",
                        tuple(params),
                    ).fetchone()["total"]
                )
            rows = conn.execute(
                f"""
                SELECT *
                FROM remote_component_heads
                {where_sql}
                {order_sql}
                LIMIT %s OFFSET %s
                """,
                tuple(params + order_params + [normalized_size + 1, offset]),
            ).fetchall()
            version_row = conn.execute(
                "SELECT value FROM catalog_meta "
                "WHERE key = 'remote_component_heads_version'"
            ).fetchone()

        has_more = len(rows) > normalized_size
        if has_more:
            rows = rows[:normalized_size]
        if total is not None:
            has_more = offset + len(rows) < total
        items: list[dict[str, Any]] = []
        for raw in rows:
            row = dict(raw)
            has_symbol = bool(row.get("has_symbol"))
            has_footprint = bool(row.get("has_footprint"))
            missing_assets = [
                kind
                for kind, present in (
                    ("symbol", has_symbol),
                    ("footprint", has_footprint),
                )
                if not present
            ]
            if has_symbol and has_footprint:
                availability_state = STATE_PLACE_READY
            elif has_symbol or has_footprint:
                availability_state = STATE_FILES_PARTIAL
            else:
                availability_state = STATE_METADATA_ONLY
            assets: list[dict[str, Any]] = []
            if has_symbol:
                assets.append(
                    {
                        "asset_type": "symbol",
                        "target_library": str(row.get("symbol_library") or ""),
                        "target_name": str(row.get("symbol_name") or ""),
                    }
                )
            if has_footprint:
                assets.append({"asset_type": "footprint"})
            previews: list[dict[str, Any]] = []
            for kind in ("symbol", "footprint"):
                preview_id = str(row.get(f"{kind}_preview_id") or "")
                if preview_id:
                    previews.append(
                        {
                            "id": preview_id,
                            "kind": kind,
                            "status": PREVIEW_STATUS_READY,
                            "file_path": "projected",
                            "generation_error": "",
                        }
                    )
            items.append(
                {
                    "id": str(row["component_id"]),
                    "slug": str(row["slug"]),
                    "name": str(row["name"]),
                    "manufacturer": str(row["manufacturer"]),
                    "mpn": str(row["mpn"]),
                    "description": str(row["description"]),
                    "package_name": str(row["package_name"]),
                    "category": str(row["category"]),
                    "datasheet_url": str(row["datasheet_url"]),
                    "summary": str(row["summary"]),
                    "version": f"{int(row['version'])}.0.0",
                    "library_name": str(row.get("symbol_library") or ""),
                    "symbol_name": str(row.get("symbol_name") or ""),
                    "assets": assets,
                    "previews": previews,
                    "availability_state": availability_state,
                    "missing_assets": missing_assets,
                    "place_enabled": has_symbol and has_footprint,
                    "release_status": "released",
                    "workflow_stage": "released",
                    "stock_quantity": float(row["stock_quantity"]),
                    "stock_uom": str(row["stock_uom"]),
                    "inventory_status": str(row["inventory_status"]),
                    "extra_fields": _json_loads(row.get("extra_fields"), {}),
                }
            )
        return {
            "items": items,
            "total": total,
            "has_more": has_more,
            "page": normalized_page,
            "page_size": normalized_size,
            "pages": (
                max(1, (total + normalized_size - 1) // normalized_size)
                if total is not None
                else None
            ),
            "projection_version": (
                str(version_row["value"])
                if version_row
                else "0"
            ),
        }

    def list_remote_categories(self) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT category AS name, COUNT(1) AS count
                FROM remote_component_heads
                GROUP BY category
                ORDER BY category
                """
            ).fetchall()
            version_row = conn.execute(
                "SELECT value FROM catalog_meta "
                "WHERE key = 'remote_component_heads_version'"
            ).fetchone()
        return {
            "categories": [
                {
                    "name": str(row["name"] or ""),
                    "count": int(row["count"]),
                }
                for row in rows
            ],
            "projection_version": (
                str(version_row["value"])
                if version_row
                else "0"
            ),
        }

    def remote_projection_version(self) -> str:
        self.initialize()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT value FROM catalog_meta "
                "WHERE key = 'remote_component_heads_version'"
            ).fetchone()
        return str(row["value"]) if row else "0"

    def list_categories(self) -> list[dict[str, Any]]:
        self.initialize()
        now = time.monotonic()
        if self._category_cache is not None and (now - self._category_cache_ts) < self._CATEGORY_CACHE_TTL:
            return self._category_cache
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT rr.category AS name, COUNT(1) AS count
                FROM components c
                JOIN component_revisions rr ON rr.id = c.released_revision_id
                WHERE c.is_active = 1 AND c.released_revision_id <> '' AND rr.release_status = 'released'
                GROUP BY rr.category
                ORDER BY rr.category
                """
            ).fetchall()
        result = [{"name": str(row["name"] or ""), "count": int(row["count"])} for row in rows]
        self._category_cache = result
        self._category_cache_ts = now
        return result

    def get_component(self, component_id: str, *, include_inactive: bool = True, released_only: bool = False) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            component, revision = self._active_revision_row(conn, component_id, released=released_only)
            if not component or not revision:
                return None
            if not include_inactive and not component["is_active"]:
                return None
            if released_only and _normalize_workflow_stage(str(revision["release_status"])) != "released":
                return None
            return self._component_payload(conn, component, revision, released_view=released_only)

    def create_manual_component(self, *, actor: str = "", change_summary: str = "Create component", **payload: Any) -> dict[str, Any]:
        self.initialize()
        metadata = self._normalize_metadata(payload)
        now = _utc_now_iso()
        component_id = str(uuid.uuid4())
        with self._connect() as conn:
            self._upsert_component_metadata_row(
                conn,
                component_id=component_id,
                metadata=metadata,
                now=now,
                existing_component_id=None,
                actor=actor,
                change_summary=change_summary,
            )
            conn.commit()
        return self.get_component(component_id) or {}

    def _upsert_component_metadata_row(
        self,
        conn: Any,
        *,
        component_id: str,
        metadata: dict[str, Any],
        now: str,
        existing_component_id: str | None,
        actor: str = "",
        change_summary: str = "Update component metadata",
        expected_revision_id: str = "",
        finalize_revision: bool = True,
        source: str = SOURCE_MANUAL,
        external_source: str = "",
        external_id: str = "",
        change_kind: str = "metadata",
    ) -> tuple[str, str]:
        self._ensure_extra_field_definitions(
            conn,
            metadata.get("extra_fields", {}).keys(),
            actor=actor or "system:catalog",
        )
        self._assert_component_identity_available(
            conn,
            manufacturer=metadata["manufacturer"],
            mpn=metadata["mpn"],
            component_id=existing_component_id or "",
        )
        if existing_component_id:
            revision = self._clone_revision(
                conn,
                existing_component_id,
                actor=actor,
                change_kind=change_kind,
                change_summary=change_summary,
                expected_revision_id=expected_revision_id,
            )
            conn.execute(
                """
                UPDATE component_revisions
                SET name = %s, value = %s, description = %s, datasheet_url = %s, manufacturer = %s, mpn = %s,
                    category = %s, package_name = %s, vendor = %s, vendor_part_number = %s, mass_g = %s,
                    rqjc_c_w = %s, rqjc_top_c_w = %s, temp_max_c = %s, temp_min_c = %s,
                    power_dissipation_w = %s, rate = %s, sap_code = %s, summary = %s, keywords = %s, extra_fields = %s,
                    search_document = %s, updated_at = %s
                WHERE id = %s
                """,
                (
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
                    json.dumps(self._keywords(metadata), separators=(",", ":")),
                    json.dumps(metadata["extra_fields"], sort_keys=True, separators=(",", ":")),
                    self._search_document(metadata),
                    now,
                    revision["id"],
                ),
            )
            conn.execute("UPDATE components SET updated_at = %s WHERE id = %s", (now, existing_component_id))
            if finalize_revision:
                self._finalize_revision(
                    conn,
                    component_id=existing_component_id,
                    revision_id=str(revision["id"]),
                    event_type="revision.created",
                    actor=actor,
                    details={"change_kind": change_kind, "change_summary": change_summary},
                )
            return existing_component_id, str(revision["id"])

        slug = self._unique_slug(conn, metadata["mpn"] or metadata["value"])
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
            (component_id, slug, source, external_source, external_id, revision_id, now, now),
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
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            """,
            (
                revision_id,
                component_id,
                1,
                "",
                "create" if source == SOURCE_MANUAL else change_kind,
                change_summary,
                actor,
                "",
                REVISION_MANIFEST_A2,
                "open",
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
                json.dumps(self._keywords(metadata), separators=(",", ":")),
                json.dumps(metadata["extra_fields"], sort_keys=True, separators=(",", ":")),
                self._search_document(metadata),
                now,
                now,
            ),
        )
        if finalize_revision:
            self._finalize_revision(
                conn,
                component_id=component_id,
                revision_id=revision_id,
                event_type="component.created",
                actor=actor,
                details={"change_kind": "create", "change_summary": change_summary},
            )
        return component_id, revision_id

    def update_component_metadata(
        self,
        component_id: str,
        updates: dict[str, Any],
        *,
        actor: str = "",
        change_summary: str = "Update component metadata",
        expected_revision_id: str = "",
    ) -> dict[str, Any] | None:
        if not expected_revision_id.strip():
            raise ValueError("expected_revision_id is required when updating component metadata")
        self.initialize()
        with self._connect() as conn:
            component = self._component_row(conn, component_id)
            if not component:
                return None
            _, revision = self._active_revision_row(conn, component_id, released=False)
            if not revision:
                return None
            # Keep advisory-lock ordering consistent with project imports and creates:
            # identity first, component row second. Once the component lock is held,
            # reload the head before merging any client patch.
            target_manufacturer = str(updates.get("manufacturer", revision.get("manufacturer") or ""))
            target_mpn = str(updates.get("mpn", revision.get("mpn") or ""))
            self._lock_component_identity(conn, target_manufacturer, target_mpn)
            self._lock_component_for_mutation(conn, component_id)
            component = self._component_row(conn, component_id)
            if not component:
                return None
            _, revision = self._active_revision_row(conn, component_id, released=False)
            if not revision:
                return None
            if str(revision["id"]) != expected_revision_id:
                raise ValueError("Component revision conflict: refresh the component before saving")
            merged = {**revision}
            merged["extra_fields"] = _json_loads(revision.get("extra_fields"), {})
            field_map = {
                "datasheet_url": "datasheet_url",
                "mpn": "mpn",
                "value": "value",
                "description": "description",
                "manufacturer": "manufacturer",
                "category": "category",
                "package_name": "package_name",
                "vendor": "vendor",
                "vendor_part_number": "vendor_part_number",
                "mass_g": "mass_g",
                "rqjc_c_w": "rqjc_c_w",
                "rqjc_top_c_w": "rqjc_top_c_w",
                "temp_max_c": "temp_max_c",
                "temp_min_c": "temp_min_c",
                "power_dissipation_w": "power_dissipation_w",
                "rate": "rate",
                "sap_code": "sap_code",
            }
            for key, column in field_map.items():
                if key in updates:
                    merged[column] = str(updates[key] or "")
            if "extra_fields" in updates:
                merged["extra_fields"] = dict(updates["extra_fields"] or {})
            metadata = self._normalize_metadata(merged)
            unchanged = all(
                (
                    _json_loads(revision.get(key), {}) == metadata[key]
                    if key == "extra_fields"
                    else str(revision.get(key) or "") == str(metadata[key])
                )
                for key in metadata
            )
            if unchanged:
                return self.get_component(component_id)
            now = _utc_now_iso()
            self._upsert_component_metadata_row(
                conn,
                component_id=component_id,
                metadata=metadata,
                now=now,
                existing_component_id=component_id,
                actor=actor,
                change_summary=change_summary,
                expected_revision_id=expected_revision_id,
            )
            conn.commit()
        return self.get_component(component_id)

    # ── Metadata field registry and auditable bulk editing ──────────────────

    def _metadata_field_payload(self, row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "key": str(row["field_key"]),
            "label": str(row["label"]),
            "description": str(row.get("description") or ""),
            "group": str(row.get("field_group") or "custom"),
            "type": str(row.get("field_type") or "text"),
            "unit": str(row.get("unit") or ""),
            "enum_values": _json_loads(row.get("enum_values_json"), []),
            "storage_kind": str(row.get("storage_kind") or "extra"),
            "storage_key": str(row.get("storage_key") or row["field_key"]),
            "built_in": bool(row.get("built_in")),
            "required": bool(row.get("required")),
            "display_order": int(row.get("display_order") or 0),
            "archived": bool(row.get("archived")),
            "created_by": str(row.get("created_by") or ""),
            "updated_by": str(row.get("updated_by") or ""),
            "created_at": str(row.get("created_at") or ""),
            "updated_at": str(row.get("updated_at") or ""),
        }

    def list_metadata_fields(self, *, include_archived: bool = False) -> list[dict[str, Any]]:
        self.initialize()
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM catalog_field_definitions "
                + ("" if include_archived else "WHERE archived = 0 ")
                + "ORDER BY display_order, field_key"
            ).fetchall()
        return [self._metadata_field_payload(dict(row)) for row in rows]

    def _append_field_event(
        self,
        conn: Any,
        field_id: str,
        event_type: str,
        actor: str,
        before: dict[str, Any] | None,
        after: dict[str, Any] | None,
    ) -> None:
        conn.execute(
            "INSERT INTO catalog_field_definition_events "
            "(id, field_id, event_type, actor, before_json, after_json, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (
                str(uuid.uuid4()), field_id, event_type, actor,
                json.dumps(before or {}, sort_keys=True, separators=(",", ":")),
                json.dumps(after or {}, sort_keys=True, separators=(",", ":")),
                _utc_now_iso(),
            ),
        )

    def create_metadata_field(self, payload: dict[str, Any], *, actor: str) -> dict[str, Any]:
        self.initialize()
        field_key = re.sub(r"[^a-z0-9_]+", "_", str(payload.get("key") or payload.get("label") or "").strip().casefold()).strip("_")
        if not field_key or field_key in {str(field["key"]) for field in BUILTIN_METADATA_FIELDS}:
            raise ValueError("Custom field key is empty or reserved")
        field_type = str(payload.get("type") or "text")
        if field_type not in METADATA_FIELD_TYPES:
            raise ValueError("Unsupported metadata field type")
        enum_values = _dedupe([str(value).strip() for value in payload.get("enum_values") or [] if str(value).strip()])
        if field_type == "enum" and not enum_values:
            raise ValueError("Enum fields require at least one option")
        now = _utc_now_iso()
        field_id = str(uuid.uuid4())
        with self._connect() as conn:
            exists = conn.execute("SELECT 1 FROM catalog_field_definitions WHERE field_key = %s", (field_key,)).fetchone()
            if exists:
                raise ValueError(f"Metadata field '{field_key}' already exists")
            order_row = conn.execute("SELECT COALESCE(MAX(display_order), -1) AS value FROM catalog_field_definitions").fetchone()
            conn.execute(
                """
                INSERT INTO catalog_field_definitions (
                    id, field_key, label, description, field_group, field_type, unit,
                    enum_values_json, storage_kind, storage_key, built_in, required,
                    display_order, archived, created_by, updated_by, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, 'custom', %s, %s, %s, 'extra', %s, 0, %s, %s, 0, %s, %s, %s, %s)
                """,
                (
                    field_id, field_key, str(payload.get("label") or field_key).strip(),
                    str(payload.get("description") or "").strip(), field_type,
                    str(payload.get("unit") or "").strip(), json.dumps(enum_values), field_key,
                    int(bool(payload.get("required"))), int(order_row["value"] or 0) + 1,
                    actor, actor, now, now,
                ),
            )
            row = dict(conn.execute("SELECT * FROM catalog_field_definitions WHERE id = %s", (field_id,)).fetchone())
            after = self._metadata_field_payload(row)
            self._append_field_event(conn, field_id, "created", actor, None, after)
            conn.commit()
        return after

    def update_metadata_field(self, field_id: str, payload: dict[str, Any], *, actor: str) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            raw = conn.execute("SELECT * FROM catalog_field_definitions WHERE id = %s", (field_id,)).fetchone()
            if not raw:
                raise ValueError("Metadata field not found")
            before = self._metadata_field_payload(dict(raw))
            field_type = str(payload.get("type", before["type"]))
            if field_type not in METADATA_FIELD_TYPES:
                raise ValueError("Unsupported metadata field type")
            if before["built_in"] and field_type != before["type"]:
                raise ValueError("Built-in field types cannot be changed")
            enum_values = _dedupe([str(value).strip() for value in payload.get("enum_values", before["enum_values"]) if str(value).strip()])
            if field_type == "enum" and not enum_values:
                raise ValueError("Enum fields require at least one option")
            next_required = bool(payload.get("required", before["required"]))
            if before["built_in"] and next_required != before["required"]:
                raise ValueError("Built-in field requirements cannot be changed")
            if not before["built_in"] and (
                field_type != before["type"] or enum_values != before["enum_values"] or next_required != before["required"]
            ):
                rows = conn.execute(
                    "SELECT extra_fields FROM component_revisions cr JOIN components c ON c.current_revision_id = cr.id WHERE c.is_active = 1"
                ).fetchall()
                invalid = 0
                candidate = {**before, "type": field_type, "enum_values": enum_values, "required": next_required}
                for row in rows:
                    value = str(_json_loads(row["extra_fields"], {}).get(before["key"], ""))
                    if self._validate_metadata_value(candidate, value):
                        invalid += 1
                if invalid:
                    raise ValueError(f"Field schema change would invalidate {invalid} current component value(s)")
            now = _utc_now_iso()
            display_order = before["display_order"] if payload.get("display_order") is None else int(payload["display_order"])
            conn.execute(
                """
                UPDATE catalog_field_definitions SET label = %s, description = %s, field_type = %s, unit = %s,
                    enum_values_json = %s, required = %s, display_order = %s, updated_by = %s, updated_at = %s
                WHERE id = %s
                """,
                (
                    str(payload.get("label", before["label"])).strip() or before["label"],
                    str(payload.get("description", before["description"])).strip(), field_type,
                    str(payload.get("unit", before["unit"])).strip(), json.dumps(enum_values),
                    int(next_required),
                    display_order, actor, now, field_id,
                ),
            )
            after = self._metadata_field_payload(dict(conn.execute("SELECT * FROM catalog_field_definitions WHERE id = %s", (field_id,)).fetchone()))
            self._append_field_event(conn, field_id, "updated", actor, before, after)
            conn.commit()
        return after

    def set_metadata_field_archived(self, field_id: str, archived: bool, *, actor: str) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            raw = conn.execute("SELECT * FROM catalog_field_definitions WHERE id = %s", (field_id,)).fetchone()
            if not raw:
                raise ValueError("Metadata field not found")
            before = self._metadata_field_payload(dict(raw))
            if before["built_in"]:
                raise ValueError("Built-in fields cannot be archived")
            conn.execute(
                "UPDATE catalog_field_definitions SET archived = %s, updated_by = %s, updated_at = %s WHERE id = %s",
                (int(archived), actor, _utc_now_iso(), field_id),
            )
            after = self._metadata_field_payload(dict(conn.execute("SELECT * FROM catalog_field_definitions WHERE id = %s", (field_id,)).fetchone()))
            self._append_field_event(conn, field_id, "archived" if archived else "restored", actor, before, after)
            conn.commit()
        return after

    def get_metadata_grid_preferences(self, user_email: str) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            row = conn.execute("SELECT layout_json FROM catalog_grid_preferences WHERE user_email = %s", (user_email.casefold(),)).fetchone()
        return _json_loads(row["layout_json"], {}) if row else {}

    def save_metadata_grid_preferences(self, user_email: str, layout: dict[str, Any]) -> dict[str, Any]:
        self.initialize()
        normalized = {
            "visible": [str(value) for value in layout.get("visible") or []],
            "order": [str(value) for value in layout.get("order") or []],
            "widths": {str(key): max(80, min(600, int(value))) for key, value in dict(layout.get("widths") or {}).items()},
            "pinned": [str(value) for value in layout.get("pinned") or []],
        }
        now = _utc_now_iso()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO catalog_grid_preferences (user_email, layout_json, updated_at) VALUES (%s, %s, %s)
                ON CONFLICT(user_email) DO UPDATE SET layout_json = excluded.layout_json, updated_at = excluded.updated_at
                """,
                (user_email.casefold(), json.dumps(normalized, separators=(",", ":")), now),
            )
            conn.commit()
        return normalized

    def metadata_grid(self, *, field_keys: list[str] | None = None, **filters: Any) -> dict[str, Any]:
        fields = self.list_metadata_fields()
        if field_keys is not None:
            requested = {str(key) for key in field_keys}
            fields = [field for field in fields if str(field["key"]) in requested]
        result = self.list_components(lightweight=True, include_inactive=False, **filters)
        component_ids = [str(item["id"]) for item in result["items"]]
        if component_ids:
            column_keys = sorted({
                str(field["storage_key"])
                for field in fields
                if field["storage_kind"] == "column"
            })
            needs_extras = any(field["storage_kind"] == "extra" for field in fields)
            selected_columns = ["component_id", "revision_id", *column_keys]
            if needs_extras:
                selected_columns.append("extra_fields")
            placeholders = ",".join("%s" for _ in component_ids)
            with self._connect() as conn:
                rows = conn.execute(
                    f"SELECT {', '.join(selected_columns)} FROM component_heads "
                    f"WHERE component_id IN ({placeholders})",
                    tuple(component_ids),
                ).fetchall()
            by_component = {str(row["component_id"]): dict(row) for row in rows}
            for item in result["items"]:
                head = by_component.get(str(item["id"]), {})
                for key in column_keys:
                    if key in head:
                        item[key] = str(head[key] or "")
                if needs_extras:
                    item["extra_fields"] = _json_loads(head.get("extra_fields"), {})
        return {**result, "schema": METADATA_SCHEMA_VERSION, "fields": fields}

    def _validate_metadata_value(self, field: dict[str, Any], value: str) -> str:
        value = str(value or "").strip()
        if not value:
            return "Value is required" if field.get("required") else ""
        field_type = str(field.get("type") or "text")
        if field_type == "number":
            try:
                float(value)
            except ValueError:
                return "Enter a valid number"
        elif field_type == "url":
            parsed = urlparse(value)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                return "Enter a valid HTTP(S) URL"
        elif field_type == "boolean" and value.casefold() not in {"true", "false", "1", "0", "yes", "no"}:
            return "Enter true or false"
        elif field_type == "enum" and value not in field.get("enum_values", []):
            return "Choose a configured enum value"
        return ""

    def _metadata_batch_payload(self, conn: Any, batch_id: str) -> dict[str, Any] | None:
        batch = conn.execute("SELECT * FROM catalog_metadata_batches WHERE id = %s", (batch_id,)).fetchone()
        if not batch:
            return None
        items = conn.execute(
            "SELECT item.*, cr.name, cr.mpn FROM catalog_metadata_batch_items item "
            "JOIN components c ON c.id = item.component_id "
            "JOIN component_revisions cr ON cr.id = c.current_revision_id "
            "WHERE item.batch_id = %s ORDER BY cr.manufacturer, cr.mpn, item.id",
            (batch_id,),
        ).fetchall()
        return {
            "id": str(batch["id"]), "source": str(batch["source"]), "status": str(batch["status"]),
            "schema_version": str(batch["schema_version"]), "change_summary": str(batch["change_summary"]),
            "unknown_fields": _json_loads(batch["unknown_fields_json"], []),
            "created_by": str(batch["created_by"]), "total_items": int(batch["total_items"]),
            "valid_items": int(batch["valid_items"]), "applied_items": int(batch["applied_items"]),
            "failed_items": int(batch["failed_items"]), "created_at": str(batch["created_at"]),
            "updated_at": str(batch["updated_at"]),
            "items": [
                {
                    "id": str(item["id"]), "component_id": str(item["component_id"]),
                    "expected_revision_id": str(item["expected_revision_id"]), "name": str(item["name"]),
                    "mpn": str(item["mpn"]), "patch": _json_loads(item["patch_json"], {}),
                    "diff": _json_loads(item["diff_json"], []), "validation_status": str(item["validation_status"]),
                    "error_message": str(item["error_message"]), "applied_revision_id": str(item["applied_revision_id"]),
                }
                for item in items
            ],
        }

    def get_metadata_batch(self, batch_id: str) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            return self._metadata_batch_payload(conn, batch_id)

    def stage_metadata_batch(
        self,
        items: list[dict[str, Any]],
        *,
        source: str,
        actor: str,
        change_summary: str,
        proposed_fields: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        self.initialize()
        component_ids = [str(item.get("component_id") or "") for item in items]
        if len(component_ids) != len(set(component_ids)):
            raise ValueError("Each component may appear only once in a metadata batch")
        batch_id = str(uuid.uuid4())
        now = _utc_now_iso()
        fields = {field["key"]: field for field in self.list_metadata_fields()}
        for proposal in proposed_fields or []:
            fields[str(proposal["key"])] = {**proposal, "storage_kind": "extra", "storage_key": proposal["key"], "archived": False}
        valid_count = 0
        with self._connect() as conn:
            identity_counts: dict[tuple[str, str], int] = {}
            for raw_item in items:
                component_id = str(raw_item.get("component_id") or "")
                component = conn.execute(
                    "SELECT cr.manufacturer, cr.mpn FROM components c "
                    "JOIN component_revisions cr ON cr.id = c.current_revision_id "
                    "WHERE c.id = %s AND c.is_active = 1",
                    (component_id,),
                ).fetchone()
                if not component:
                    continue
                patch = dict(raw_item.get("patch") or {})
                manufacturer = str(patch.get("manufacturer", component["manufacturer"]) or "").strip().casefold()
                mpn = str(patch.get("mpn", component["mpn"]) or "").strip().casefold()
                if manufacturer and mpn:
                    identity = (manufacturer, mpn)
                    identity_counts[identity] = identity_counts.get(identity, 0) + 1
            duplicate_identities = {identity for identity, count in identity_counts.items() if count > 1}
            conn.execute(
                """
                INSERT INTO catalog_metadata_batches (
                    id, source, status, schema_version, change_summary, unknown_fields_json, created_by,
                    total_items, valid_items, applied_items, failed_items, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 0, 0, 0, %s, %s)
                """,
                (
                    batch_id, source, "needs_fields" if proposed_fields else "ready", METADATA_SCHEMA_VERSION,
                    change_summary.strip() or "Bulk update component metadata",
                    json.dumps(proposed_fields or [], separators=(",", ":")), actor, len(items), now, now,
                ),
            )
            for raw_item in items:
                component_id = str(raw_item.get("component_id") or "")
                expected_revision_id = str(raw_item.get("expected_revision_id") or "")
                component = conn.execute(
                    "SELECT c.is_active, cr.* FROM components c JOIN component_revisions cr ON cr.id = c.current_revision_id WHERE c.id = %s",
                    (component_id,),
                ).fetchone()
                errors: list[str] = []
                diff: list[dict[str, str]] = []
                normalized_patch: dict[str, str] = {}
                if not component or not bool(component["is_active"]):
                    errors.append("Component was not found or is inactive")
                elif str(component["id"]) != expected_revision_id:
                    errors.append("Component revision conflict: refresh or re-export before applying")
                else:
                    extras = _json_loads(component["extra_fields"], {})
                    for field_key, raw_value in dict(raw_item.get("patch") or {}).items():
                        field = fields.get(str(field_key))
                        if not field or field.get("archived"):
                            errors.append(f"Unknown or archived field: {field_key}")
                            continue
                        value = str(raw_value or "").strip()
                        validation_error = self._validate_metadata_value(field, value)
                        if validation_error:
                            errors.append(f"{field['label']}: {validation_error}")
                            continue
                        before = str(component[field["storage_key"]] or "") if field["storage_kind"] == "column" else str(extras.get(field["storage_key"], ""))
                        if before != value:
                            normalized_patch[str(field_key)] = value
                            diff.append({"field": str(field_key), "label": str(field["label"]), "before": before, "after": value})
                    for field_key, field in fields.items():
                        if not field.get("required") or field.get("archived"):
                            continue
                        if field["storage_kind"] == "column":
                            resulting = normalized_patch.get(field_key, str(component[field["storage_key"]] or ""))
                        else:
                            resulting = normalized_patch.get(field_key, str(extras.get(field["storage_key"], "")))
                        required_error = self._validate_metadata_value(field, resulting)
                        if required_error:
                            errors.append(f"{field['label']}: {required_error}")
                    target_manufacturer = normalized_patch.get("manufacturer", str(component["manufacturer"] or ""))
                    target_mpn = normalized_patch.get("mpn", str(component["mpn"] or ""))
                    if (target_manufacturer.strip().casefold(), target_mpn.strip().casefold()) in duplicate_identities:
                        errors.append("Multiple rows in this batch resolve to the same manufacturer and manufacturer part number")
                    try:
                        self._assert_component_identity_available(
                            conn,
                            manufacturer=target_manufacturer,
                            mpn=target_mpn,
                            component_id=component_id,
                            acquire_identity_lock=False,
                        )
                    except ValueError as exc:
                        errors.append(str(exc))
                status = "invalid" if errors else "valid" if diff else "noop"
                if status == "valid":
                    valid_count += 1
                conn.execute(
                    """
                    INSERT INTO catalog_metadata_batch_items (
                        id, batch_id, component_id, expected_revision_id, patch_json, diff_json,
                        validation_status, error_message, applied_revision_id, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, '', %s, %s)
                    """,
                    (
                        str(uuid.uuid4()), batch_id, component_id, expected_revision_id,
                        json.dumps(normalized_patch, sort_keys=True, separators=(",", ":")),
                        json.dumps(diff, separators=(",", ":")), status, "; ".join(errors), now, now,
                    ),
                )
            conn.execute("UPDATE catalog_metadata_batches SET valid_items = %s WHERE id = %s", (valid_count, batch_id))
            conn.commit()
            return self._metadata_batch_payload(conn, batch_id) or {}

    def approve_metadata_batch_fields(self, batch_id: str, *, actor: str) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            batch = conn.execute("SELECT * FROM catalog_metadata_batches WHERE id = %s", (batch_id,)).fetchone()
            if not batch:
                raise ValueError("Metadata batch not found")
            proposals = _json_loads(batch["unknown_fields_json"], [])
        for proposal in proposals:
            try:
                self.create_metadata_field(proposal, actor=actor)
            except ValueError as exc:
                if "already exists" not in str(exc):
                    raise
        with self._connect() as conn:
            conn.execute(
                "UPDATE catalog_metadata_batches SET status = 'ready', unknown_fields_json = '[]', updated_at = %s WHERE id = %s",
                (_utc_now_iso(), batch_id),
            )
            conn.commit()
            return self._metadata_batch_payload(conn, batch_id) or {}

    def _inherit_validation_evidence(self, conn: Any, parent_revision_id: str, revision_id: str) -> None:
        # Inherit only for assets still attached to the child revision so replaced
        # or detached CAD does not keep stale validation evidence links.
        assets = conn.execute(
            "SELECT asset_id FROM revision_assets WHERE revision_id = %s AND asset_type IN ('symbol', 'footprint')",
            (revision_id,),
        ).fetchall()
        for asset in assets:
            run = conn.execute(
                "SELECT id FROM asset_validation_runs WHERE revision_id = %s AND asset_id = %s ORDER BY finished_at DESC, created_at DESC LIMIT 1",
                (parent_revision_id, asset["asset_id"]),
            ).fetchone()
            if not run:
                run = conn.execute(
                    "SELECT source_run_id AS id FROM revision_validation_evidence_links WHERE revision_id = %s AND asset_id = %s",
                    (parent_revision_id, asset["asset_id"]),
                ).fetchone()
            if run:
                conn.execute(
                    """
                    INSERT INTO revision_validation_evidence_links (revision_id, asset_id, source_run_id, created_at)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT(revision_id, asset_id) DO UPDATE SET
                        source_run_id = excluded.source_run_id, created_at = excluded.created_at
                    """,
                    (revision_id, asset["asset_id"], run["id"], _utc_now_iso()),
                )

    def apply_metadata_batch_item(self, item_id: str, *, actor: str) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            item = conn.execute(
                "SELECT item.*, batch.change_summary, batch.id AS metadata_batch_id FROM catalog_metadata_batch_items item "
                "JOIN catalog_metadata_batches batch ON batch.id = item.batch_id WHERE item.id = %s",
                (item_id,),
            ).fetchone()
            if not item:
                raise ValueError("Metadata batch item not found")
            if str(item["validation_status"]) == "applied":
                return {"item_id": item_id, "status": "applied", "revision_id": str(item["applied_revision_id"])}
            if str(item["validation_status"]) != "valid":
                raise ValueError("Metadata batch item is not valid")
            component_id = str(item["component_id"])
            self._lock_component_for_mutation(conn, component_id)
            component, revision = self._active_revision_row(conn, component_id, released=False)
            if not component or not revision:
                raise ValueError("Component not found")
            if str(revision["id"]) != str(item["expected_revision_id"]):
                raise ValueError("Component revision conflict: current revision changed after preview")
            definitions = {field["key"]: field for field in self.list_metadata_fields()}
            patch = _json_loads(item["patch_json"], {})
            merged = {**revision, "extra_fields": _json_loads(revision.get("extra_fields"), {})}
            for field_key, value in patch.items():
                field = definitions.get(field_key)
                if not field:
                    raise ValueError(f"Metadata field {field_key} is unavailable")
                if field["storage_kind"] == "column":
                    merged[field["storage_key"]] = value
                else:
                    merged["extra_fields"][field["storage_key"]] = value
            metadata = self._normalize_metadata(merged)
            self._lock_component_identity(conn, metadata["manufacturer"], metadata["mpn"])
            parent_revision_id = str(revision["id"])
            _, revision_id = self._upsert_component_metadata_row(
                conn,
                component_id=component_id,
                metadata=metadata,
                now=_utc_now_iso(),
                existing_component_id=component_id,
                actor=actor,
                change_summary=str(item["change_summary"]),
                expected_revision_id=parent_revision_id,
                finalize_revision=False,
                change_kind="metadata_bulk",
            )
            conn.execute("UPDATE component_revisions SET release_status = 'qa_review' WHERE id = %s", (revision_id,))
            self._inherit_validation_evidence(conn, parent_revision_id, revision_id)
            self._finalize_revision(
                conn,
                component_id=component_id,
                revision_id=revision_id,
                event_type="revision.created",
                actor=actor,
                details={
                    "change_kind": "metadata_bulk", "change_summary": str(item["change_summary"]),
                    "metadata_batch_id": str(item["metadata_batch_id"]),
                    "changed_fields": sorted(patch), "workflow_stage": "qa_review",
                },
            )
            conn.execute(
                "UPDATE catalog_metadata_batch_items SET validation_status = 'applied', applied_revision_id = %s, updated_at = %s WHERE id = %s",
                (revision_id, _utc_now_iso(), item_id),
            )
            conn.commit()
        return {"item_id": item_id, "status": "applied", "revision_id": revision_id}

    def apply_metadata_batch(
        self,
        batch_id: str,
        *,
        actor: str,
        item_ids: list[str] | None = None,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            batch = conn.execute("SELECT * FROM catalog_metadata_batches WHERE id = %s", (batch_id,)).fetchone()
            if not batch:
                raise ValueError("Metadata batch not found")
            if str(batch["status"]) == "needs_fields":
                raise ValueError("Unknown CSV fields must be approved before applying")
            rows = conn.execute(
                "SELECT id FROM catalog_metadata_batch_items WHERE batch_id = %s AND validation_status = 'valid' ORDER BY id",
                (batch_id,),
            ).fetchall()
        selected = set(item_ids or [])
        ids = [str(row["id"]) for row in rows if not selected or str(row["id"]) in selected]
        if selected and not ids:
            raise ValueError("None of the selected metadata batch items are valid")
        applied = 0
        failed = 0
        errors: list[dict[str, str]] = []
        for index, item_id in enumerate(ids):
            try:
                self.apply_metadata_batch_item(item_id, actor=actor)
                applied += 1
            except ValueError as exc:
                failed += 1
                errors.append({"item_id": item_id, "error": str(exc)})
                with self._connect() as conn:
                    conn.execute(
                        "UPDATE catalog_metadata_batch_items SET validation_status = 'conflict', error_message = %s, updated_at = %s WHERE id = %s",
                        (str(exc), _utc_now_iso(), item_id),
                    )
                    conn.commit()
            if progress_callback:
                progress_callback({"completed": index + 1, "total": len(ids), "applied": applied, "failed": failed})
        with self._connect() as conn:
            totals = conn.execute(
                "SELECT SUM(CASE WHEN validation_status = 'applied' THEN 1 ELSE 0 END) AS applied, "
                "SUM(CASE WHEN validation_status IN ('invalid', 'conflict') THEN 1 ELSE 0 END) AS failed, "
                "SUM(CASE WHEN validation_status = 'valid' THEN 1 ELSE 0 END) AS remaining "
                "FROM catalog_metadata_batch_items WHERE batch_id = %s",
                (batch_id,),
            ).fetchone()
            total_applied = int(totals["applied"] or 0)
            total_failed = int(totals["failed"] or 0)
            remaining = int(totals["remaining"] or 0)
            status = "completed" if total_failed == 0 and remaining == 0 else "partial"
            conn.execute(
                "UPDATE catalog_metadata_batches SET status = %s, valid_items = %s, applied_items = %s, failed_items = %s, updated_at = %s WHERE id = %s",
                (status, remaining, total_applied, total_failed, _utc_now_iso(), batch_id),
            )
            conn.commit()
        return {"batch_id": batch_id, "status": status, "applied": applied, "failed": failed, "errors": errors}

    def export_metadata_csv(self, field_keys: list[str] | None = None) -> str:
        return "".join(self.iter_metadata_csv(field_keys=field_keys))

    def iter_metadata_csv(self, field_keys: list[str] | None = None) -> Iterator[str]:
        self.initialize()
        fields = self.list_metadata_fields()
        if field_keys is not None:
            requested = {str(key) for key in field_keys}
            known = {str(field["key"]) for field in fields}
            unknown = sorted(requested - known)
            if unknown:
                raise ValueError(f"Unknown or archived metadata field(s): {', '.join(unknown)}")
            fields = [field for field in fields if str(field["key"]) in requested]
        custom = [field for field in fields if field["storage_kind"] == "extra"]
        fixed = [field for field in fields if field["storage_kind"] == "column"]
        headers = ["_prism_schema_version", "component_id", "expected_revision_id", "revision", "workflow_stage"]
        headers.extend(field["key"] for field in fixed)
        headers.extend(f"custom:{field['key']}" for field in custom)

        def generate() -> Iterator[str]:
            header_output = io.StringIO()
            csv.DictWriter(header_output, fieldnames=headers, extrasaction="ignore").writeheader()
            yield header_output.getvalue()

            def render_row(row: Any) -> str:
                extras = _json_loads(row["extra_fields"], {})
                payload = {
                    "_prism_schema_version": METADATA_SCHEMA_VERSION,
                    "component_id": str(row["component_id"]), "expected_revision_id": str(row["id"]),
                    "revision": str(row["version"]), "workflow_stage": str(row["release_status"]),
                }
                payload.update({
                    field["key"]: self._metadata_csv_export_value(field, str(row[field["storage_key"]] or ""))
                    for field in fixed
                })
                payload.update({
                    f"custom:{field['key']}": self._metadata_csv_export_value(
                        field, str(extras.get(field["storage_key"], "")),
                    )
                    for field in custom
                })
                output = io.StringIO()
                csv.DictWriter(output, fieldnames=headers, extrasaction="ignore").writerow(payload)
                return output.getvalue()

            with self._connect() as conn:
                sql = (
                    "SELECT c.id AS component_id, cr.* FROM components c "
                    "JOIN component_revisions cr ON cr.id = c.current_revision_id "
                    "WHERE c.is_active = 1 ORDER BY cr.manufacturer, cr.mpn, c.id"
                )
                if hasattr(conn, "iter_rows"):
                    rows = conn.iter_rows(sql, batch_size=500)
                else:
                    rows = iter(conn.execute(sql).fetchall())
                for row in rows:
                    yield render_row(row)

        return generate()

    def _metadata_csv_export_value(self, field: dict[str, Any], value: str) -> str:
        # CSV has no type information and spreadsheet applications aggressively
        # coerce text such as 0207, TRUE, dates, and long part numbers. An invisible
        # text marker survives spreadsheet save/export and is removed on re-import.
        if value and str(field.get("type") or "text") in {"text", "enum"}:
            return f"{CSV_SPREADSHEET_TEXT_GUARD}{value}"
        return value

    def _metadata_csv_import_value(self, field: dict[str, Any] | None, value: str) -> str:
        normalized = str(value or "").removeprefix(CSV_SPREADSHEET_TEXT_GUARD).strip()
        if field and str(field.get("type") or "text") == "boolean":
            lowered = normalized.casefold()
            if lowered in {"true", "1", "yes"}:
                return "true"
            if lowered in {"false", "0", "no"}:
                return "false"
        return normalized

    def _metadata_csv_values_equal(self, field: dict[str, Any] | None, before: str, after: str) -> bool:
        if before == after:
            return True
        field_type = str((field or {}).get("type") or "text")
        before_folded = before.casefold()
        after_folded = after.casefold()
        boolean_tokens = {"true": True, "1": True, "yes": True, "false": False, "0": False, "no": False}
        if field_type == "boolean":
            return boolean_tokens.get(before_folded) == boolean_tokens.get(after_folded)
        if before_folded in {"true", "false"} and after_folded in {"true", "false"}:
            return before_folded == after_folded
        if field_type == "number":
            try:
                return Decimal(before) == Decimal(after)
            except InvalidOperation:
                return False
        return False

    def preview_metadata_csv(self, file_content: str, *, actor: str, change_summary: str = "Import component metadata from CSV") -> dict[str, Any]:
        self.initialize()
        reader = csv.DictReader(io.StringIO(file_content.lstrip("\ufeff")))
        if not reader.fieldnames:
            raise ValueError("CSV file is empty")
        reserved = {"_prism_schema_version", "component_id", "expected_revision_id", "revision", "workflow_stage"}
        fields = {field["key"]: field for field in self.list_metadata_fields(include_archived=True)}
        proposed: list[dict[str, Any]] = []
        header_to_key: dict[str, str] = {}
        for header in reader.fieldnames:
            if header in reserved:
                continue
            key = header.removeprefix("custom:")
            if key not in fields:
                proposed_key = re.sub(r"[^a-z0-9_]+", "_", key.casefold()).strip("_")
                if not proposed_key:
                    continue
                proposal = {"key": proposed_key, "label": key, "description": "Imported from CSV", "type": "text", "enum_values": []}
                if proposed_key not in {item["key"] for item in proposed}:
                    proposed.append(proposal)
                header_to_key[header] = proposed_key
            else:
                header_to_key[header] = key
        parsed_rows: list[tuple[int, str, str, dict[str, str]]] = []
        for index, row in enumerate(reader, start=2):
            component_id = str(row.get("component_id") or "").strip()
            revision_id = str(row.get("expected_revision_id") or "").strip()
            if not component_id or not revision_id:
                raise ValueError(f"Row {index}: component_id and expected_revision_id are required")
            patch = {
                field_key: self._metadata_csv_import_value(
                    fields.get(field_key) or next((field for field in proposed if field["key"] == field_key), None),
                    str(row.get(header) or ""),
                )
                for header, field_key in header_to_key.items()
            }
            parsed_rows.append((index, component_id, revision_id, patch))

        with self._connect() as conn:
            current_rows = {
                str(row["component_id"]): dict(row)
                for row in conn.execute(
                    "SELECT c.id AS component_id, cr.* FROM components c "
                    "JOIN component_revisions cr ON cr.id = c.current_revision_id WHERE c.is_active = 1"
                ).fetchall()
            }

        proposed_by_key = {str(field["key"]): field for field in proposed}
        items: list[dict[str, Any]] = []
        skipped_unchanged = 0
        for _, component_id, revision_id, patch in parsed_rows:
            current = current_rows.get(component_id)
            if not current:
                # Preserve missing/inactive rows so the staged review can explain them.
                items.append({"component_id": component_id, "expected_revision_id": revision_id, "patch": patch})
                continue
            extras = _json_loads(current.get("extra_fields"), {})
            changed_patch: dict[str, str] = {}
            for field_key, value in patch.items():
                field = fields.get(field_key) or proposed_by_key.get(field_key)
                if not field:
                    changed_patch[field_key] = value
                    continue
                storage_kind = str(field.get("storage_kind") or "extra")
                storage_key = str(field.get("storage_key") or field_key)
                before = str(current.get(storage_key) or "") if storage_kind == "column" else str(extras.get(storage_key, ""))
                if not self._metadata_csv_values_equal(field, before, value):
                    changed_patch[field_key] = value
            if changed_patch:
                items.append({
                    "component_id": component_id,
                    "expected_revision_id": revision_id,
                    "patch": changed_patch,
                })
            else:
                skipped_unchanged += 1

        used_field_keys = {field_key for item in items for field_key in item["patch"]}
        used_proposals = [field for field in proposed if str(field["key"]) in used_field_keys]
        batch = self.stage_metadata_batch(
            items,
            source="csv",
            actor=actor,
            change_summary=change_summary,
            proposed_fields=used_proposals,
        )
        return {
            **batch,
            "source_rows": len(parsed_rows),
            "skipped_unchanged_rows": skipped_unchanged,
        }

    def _normalize_csv_row(self, row: dict[str, str], row_index: int) -> dict[str, str]:
        normalized = {(_slugify(key, key).replace("-", "_")): (value or "").strip() for key, value in row.items()}
        for required in CSV_REQUIRED_COLUMNS:
            if not normalized.get(required, "").strip():
                raise ValueError(f"Row {row_index}: missing required column '{required}'")
        return normalized

    def import_metadata_csv(self, file_content: str) -> dict[str, Any]:
        self.initialize()
        reader = csv.DictReader(io.StringIO(file_content))
        if not reader.fieldnames:
            raise ValueError("CSV file is empty")

        rows: list[dict[str, str]] = []
        errors: list[str] = []
        for index, row in enumerate(reader, start=2):
            try:
                rows.append(self._normalize_csv_row({str(k): str(v or "") for k, v in row.items()}, index))
            except ValueError as exc:
                errors.append(str(exc))
        if errors:
            raise ValueError("\n".join(errors))

        created = 0
        updated = 0
        with self._connect() as conn:
            now = _utc_now_iso()
            for row in rows:
                mpn = row["manufacturer_part_number"]
                existing = conn.execute(
                    """
                    SELECT c.id
                    FROM components c
                    JOIN component_revisions cr ON cr.id = c.current_revision_id
                    WHERE cr.mpn = %s
                    LIMIT 1
                    """,
                    (mpn,),
                ).fetchone()
                asset_links = []
                if row.get("symbol_file_path"):
                    asset_links.append(("symbol", row["symbol_file_path"], row.get("symbol_target_library", ""), row.get("symbol_target_name", "")))
                if row.get("footprint_file_path"):
                    asset_links.append(("footprint", row["footprint_file_path"], row.get("footprint_target_library", ""), row.get("footprint_target_name", "")))
                if row.get("model_3d_file_path"):
                    asset_links.append(("3dmodel", row["model_3d_file_path"], "", ""))
                if row.get("spice_file_path"):
                    asset_links.append(("spice", row["spice_file_path"], "", ""))

                payload = {
                    "value": row["value"],
                    "description": row["description"],
                    "datasheet_url": row["datasheet"],
                    "manufacturer": row["manufacturer"],
                    "mpn": row["manufacturer_part_number"],
                    "category": row.get("category", ""),
                    "package_name": row.get("package_name", ""),
                    "vendor": row.get("vendor", ""),
                    "vendor_part_number": row.get("vendor_part_number", ""),
                    "mass_g": row.get("mass_g", ""),
                    "rqjc_c_w": row.get("rqjc_c_w", ""),
                    "rqjc_top_c_w": row.get("rqjc_top_c_w", ""),
                    "temp_max_c": row.get("temp_max_c", ""),
                    "temp_min_c": row.get("temp_min_c", ""),
                    "power_dissipation_w": row.get("power_dissipation_w", ""),
                    "rate": row.get("rate", ""),
                    "sap_code": row.get("sap_code", ""),
                }
                normalized = self._normalize_metadata(payload)
                if existing:
                    component_id, revision_id = self._upsert_component_metadata_row(
                        conn,
                        component_id=str(existing["id"]),
                        metadata=normalized,
                        now=now,
                        existing_component_id=str(existing["id"]),
                        actor="csv-import",
                        finalize_revision=False,
                    )
                    updated += 1
                else:
                    component_id = str(uuid.uuid4())
                    component_id, revision_id = self._upsert_component_metadata_row(
                        conn,
                        component_id=component_id,
                        metadata=normalized,
                        now=now,
                        existing_component_id=None,
                        actor="csv-import",
                        finalize_revision=False,
                    )
                    created += 1

                for asset_type, file_path, target_library, target_name in asset_links:
                    asset = self._resolve_existing_asset(
                        conn,
                        asset_type=asset_type,
                        file_path=file_path,
                        target_library=target_library,
                        target_name=target_name,
                    )
                    self._link_asset_to_revision(conn, revision_id, asset, required=asset_type in PLACE_REQUIRED_ASSET_TYPES)
                self._finalize_revision(
                    conn,
                    component_id=component_id,
                    revision_id=revision_id,
                    event_type="revision.created" if existing else "component.created",
                    actor="csv-import",
                    details={
                        "change_kind": "csv_import",
                        "change_summary": "Import component metadata and assets from CSV",
                    },
                )
            conn.commit()
        return {"created": created, "updated": updated, "errors": []}

    def import_stock_csv(self, file_content: str) -> dict[str, Any]:
        self.initialize()
        reader = csv.DictReader(io.StringIO(file_content))
        if not reader.fieldnames:
            raise ValueError("CSV file is empty")
        updated = 0
        not_found = 0
        errors: list[str] = []
        with self._connect() as conn:
            for index, row in enumerate(reader, start=2):
                mpn = str(row.get("manufacturer_part_number") or row.get("mpn") or "").strip()
                if not mpn:
                    errors.append(f"Row {index}: missing manufacturer_part_number")
                    continue
                component = conn.execute(
                    """
                    SELECT c.id
                    FROM components c
                    JOIN component_revisions cr ON cr.id = c.current_revision_id
                    WHERE cr.mpn = %s
                    LIMIT 1
                    """,
                    (mpn,),
                ).fetchone()
                if not component:
                    not_found += 1
                    continue
                now = _utc_now_iso()
                conn.execute(
                    """
                    UPDATE components
                    SET stock_quantity = %s, stock_uom = %s, inventory_status = %s, serial_number = %s,
                        lot_number = %s, pedigree = %s, last_synced_at = %s, updated_at = %s
                    WHERE id = %s
                    """,
                    (
                        float(row.get("stock_quantity") or 0),
                        str(row.get("stock_uom") or ""),
                        str(row.get("inventory_status") or ""),
                        str(row.get("serial_number") or ""),
                        str(row.get("lot_number") or ""),
                        str(row.get("pedigree") or ""),
                        now,
                        now,
                        component["id"],
                    ),
                )
                updated += 1
            conn.commit()
        return {"updated": updated, "not_found": not_found, "errors": errors}

    def browse_library_assets(self, asset_type: str) -> list[str]:
        self.initialize()
        root = self._asset_root(asset_type)
        if asset_type == "symbol":
            paths = root.rglob("*.kicad_sym")
        elif asset_type == "footprint":
            paths = root.rglob("*.kicad_mod")
        elif asset_type == "3dmodel":
            paths = [*root.rglob("*.step"), *root.rglob("*.stp")]
        else:
            paths = root.rglob("*")
        return sorted(path.relative_to(root).as_posix() for path in paths if path.is_file())

    def _attach_asset_revision(
        self,
        conn: Any,
        *,
        component_id: str,
        asset: dict[str, Any],
        required: bool,
        actor: str,
        change_summary: str,
    ) -> dict[str, Any]:
        _, current = self._active_revision_row(conn, component_id, released=False)
        if not current:
            raise ValueError("Component not found")
        existing = conn.execute(
            "SELECT asset_id, required FROM revision_assets WHERE revision_id = %s AND asset_type = %s AND asset_id = %s",
            (current["id"], asset["asset_type"], asset["id"]),
        ).fetchone()
        preview_changed = False
        if str(asset["asset_type"]) in PLACE_REQUIRED_ASSET_TYPES:
            kind = PREVIEW_KIND_SYMBOL if str(asset["asset_type"]) == "symbol" else PREVIEW_KIND_FOOTPRINT
            current_previews = conn.execute(
                "SELECT kind, preview_id FROM revision_preview_outputs WHERE revision_id = %s AND asset_id = %s AND (kind = %s OR kind LIKE %s)",
                (str(current["id"]), str(asset["id"]), kind, f"{kind}:unit%"),
            ).fetchall()
            latest_preview_rows = conn.execute(
                """
                SELECT id, kind FROM asset_preview_versions
                WHERE asset_id = %s AND (kind = %s OR kind LIKE %s) AND status = 'ready'
                ORDER BY kind, created_at DESC, id DESC
                """,
                (str(asset["id"]), kind, f"{kind}:unit%"),
            ).fetchall()
            current_by_kind = {str(row["kind"]): str(row["preview_id"]) for row in current_previews}
            latest_by_kind: dict[str, str] = {}
            for row in latest_preview_rows:
                latest_by_kind.setdefault(str(row["kind"]), str(row["id"]))
            preview_changed = bool(latest_by_kind and latest_by_kind != current_by_kind)
        if existing and bool(existing["required"]) == required:
            if preview_changed:
                self._refresh_revision_preview_outputs_in_conn(conn, str(current["id"]))
            return current
        revision = self._clone_revision(
            conn,
            component_id,
            actor=actor,
            change_kind="asset",
            change_summary=change_summary,
        )
        self._link_asset_to_revision(conn, revision["id"], asset, required=required)
        effective_change_kind = "asset"
        self._finalize_revision(
            conn,
            component_id=component_id,
            revision_id=str(revision["id"]),
            event_type="revision.created",
            actor=actor,
            details={
                "change_kind": effective_change_kind,
                "change_summary": change_summary,
                "asset_type": str(asset["asset_type"]),
                "asset_sha256": str(asset["sha256"]),
            },
        )
        return revision

    def _extract_top_level_symbol_blocks(self, text: str) -> list[tuple[str, str]]:
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

    def _symbol_header(self, text: str) -> tuple[str, str]:
        version_match = re.search(r"\(version\s+([^)]+)\)", text)
        version = version_match.group(1) if version_match else "20211014"
        generator_match = re.search(r"\(generator\s+([^)]+)\)", text)
        generator = generator_match.group(1) if generator_match else '"KiCAD Prism"'
        return version, generator

    def _single_symbol_payload(self, text: str, selected_symbol: str) -> bytes:
        blocks = self._extract_top_level_symbol_blocks(text)
        blocks_dict = dict(blocks)
        base_block = blocks_dict.get(selected_symbol)
        if not base_block:
            raise ValueError("Selected symbol was not found in the library")

        escaped_name = re.escape(selected_symbol)
        unit_pattern = re.compile(rf"^{escaped_name}_\d+_\d+$")
        unit_blocks = [b for n, b in blocks if unit_pattern.match(n)]
        all_blocks_text = "\n  ".join([base_block] + unit_blocks)
        version, generator = self._symbol_header(text)
        return f"(kicad_symbol_lib (version {version}) (generator {generator})\n  {all_blocks_text}\n)\n".encode("utf-8")

    def _write_canonical_file(self, destination: Path, payload: bytes) -> Path:
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            existing = destination.read_bytes()
            if existing == payload:
                return destination
            digest = hashlib.sha256(payload).hexdigest()
            try:
                relative = destination.resolve().relative_to(self._store_root)
            except ValueError:
                relative = Path(destination.name)
            immutable_destination = self._store_root / "revisions" / digest / relative
            immutable_destination.parent.mkdir(parents=True, exist_ok=True)
            if immutable_destination.exists():
                if immutable_destination.read_bytes() != payload:
                    raise ValueError(f"Immutable asset hash collision at {immutable_destination}")
                return immutable_destination
            immutable_destination.write_bytes(payload)
            return immutable_destination
        destination.write_bytes(payload)
        return destination

    def _symbol_destination(self, target_library: str, target_name: str) -> Path:
        safe_library = _sanitize_name(target_library, "Prism_Symbols")
        safe_name = _sanitize_name(target_name, "symbol")
        return self._store_root / "symbols" / safe_library / f"{safe_name}.kicad_sym"

    def _footprint_destination(self, target_library: str, target_name: str) -> Path:
        safe_library = _sanitize_name(target_library, "Prism_Footprints")
        safe_name = _sanitize_name(target_name, "footprint")
        return self._store_root / "footprints" / f"{safe_library}.pretty" / f"{safe_name}.kicad_mod"

    def _aux_destination(self, asset_type: str, target_library: str, upload_name: str) -> Path:
        safe_library = _sanitize_name(target_library, "Prism_Assets")
        safe_name = _sanitize_name(Path(upload_name).name, f"{asset_type}.bin")
        return self._asset_root(asset_type) / safe_library / safe_name

    def _asset_by_key(self, conn: Any, asset_type: str, canonical_path: str, target_name: str) -> dict[str, Any] | None:
        row = conn.execute(
            "SELECT * FROM assets WHERE asset_type = %s AND canonical_path = %s AND target_name = %s",
            (asset_type, canonical_path, target_name),
        ).fetchone()
        return dict(row) if row else None

    def _asset_by_signature(
        self,
        conn: Any,
        asset_type: str,
        sha256: str,
        target_library: str,
        target_name: str,
    ) -> dict[str, Any] | None:
        row = conn.execute(
            """
            SELECT * FROM assets
            WHERE asset_type = %s AND sha256 = %s AND target_library = %s AND target_name = %s
            LIMIT 1
            """,
            (asset_type, sha256, target_library, target_name),
        ).fetchone()
        return dict(row) if row else None

    def _register_asset(
        self,
        conn: Any,
        *,
        asset_type: str,
        canonical_path: Path,
        target_library: str,
        target_name: str,
        source_group: str = "",
    ) -> dict[str, Any]:
        canonical_path = canonical_path.resolve()
        payload = canonical_path.read_bytes()
        sha256 = hashlib.sha256(payload).hexdigest()
        existing = self._asset_by_key(conn, asset_type, str(canonical_path), target_name)
        if existing:
            if str(existing.get("sha256") or "") == sha256:
                return existing
            # A path already referenced by an immutable asset was edited in place.
            # Preserve its historical database identity and ingest the observed bytes
            # at a content-addressed path for the new revision.
            try:
                relative = canonical_path.relative_to(self._store_root)
            except ValueError:
                relative = Path(canonical_path.name)
            immutable_path = self._store_root / "revisions" / sha256 / relative
            immutable_path.parent.mkdir(parents=True, exist_ok=True)
            if immutable_path.exists():
                if immutable_path.read_bytes() != payload:
                    raise ValueError(f"Immutable asset hash collision at {immutable_path}")
            else:
                immutable_path.write_bytes(payload)
            canonical_path = immutable_path.resolve()
            existing = self._asset_by_key(conn, asset_type, str(canonical_path), target_name)
            if existing:
                if str(existing.get("sha256") or "") != sha256:
                    raise ValueError("Immutable asset identity does not match its content hash")
                return existing
        same_content = self._asset_by_signature(conn, asset_type, sha256, target_library, target_name)
        if same_content:
            existing_path = Path(str(same_content["canonical_path"]))
            if not existing_path.is_file() or _sha256_file(existing_path) != sha256:
                # Re-uploading identical content repairs a missing/corrupt backing file
                # without changing immutable asset identity or revision manifests.
                conn.execute(
                    """
                    UPDATE assets
                    SET name = %s, canonical_path = %s, size_bytes = %s, content_type = %s, updated_at = %s
                    WHERE id = %s
                    """,
                    (
                        canonical_path.name,
                        str(canonical_path),
                        canonical_path.stat().st_size,
                        _content_type_for_asset(asset_type, canonical_path),
                        _utc_now_iso(),
                        same_content["id"],
                    ),
                )
                same_content = dict(same_content)
                same_content.update(
                    {
                        "name": canonical_path.name,
                        "canonical_path": str(canonical_path),
                        "size_bytes": canonical_path.stat().st_size,
                        "content_type": _content_type_for_asset(asset_type, canonical_path),
                    }
                )
            return same_content
        now = _utc_now_iso()
        asset_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO assets (
                id, asset_type, name, canonical_path, target_library, target_name, source_group,
                sha256, size_bytes, content_type, created_at, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                asset_id,
                asset_type,
                canonical_path.name,
                str(canonical_path),
                target_library,
                target_name,
                source_group,
                sha256,
                canonical_path.stat().st_size,
                _content_type_for_asset(asset_type, canonical_path),
                now,
                now,
            ),
        )
        row = conn.execute("SELECT * FROM assets WHERE id = %s", (asset_id,)).fetchone()
        return dict(row)

    def _generate_symbol_preview(self, asset: dict[str, Any]) -> tuple[str, bytes | str]:
        """Compatibility single-unit renderer used by existing test/custom adapters."""
        with tempfile.TemporaryDirectory(prefix="prism_symsvg_") as tmp_dir:
            success, error = self._run_kicad_cli(
                ["sym", "export", "svg", str(asset["canonical_path"]), "--output", tmp_dir, "--symbol", str(asset["target_name"])]
            )
            if not success:
                return PREVIEW_STATUS_FAILED, error
            expected = Path(tmp_dir) / f"{asset['target_name']}_unit1.svg"
            if not expected.is_file():
                candidates = sorted(Path(tmp_dir).glob("*.svg"))
                if not candidates:
                    return PREVIEW_STATUS_FAILED, "symbol preview export did not produce an SVG"
                expected = candidates[0]
            return PREVIEW_STATUS_READY, expected.read_bytes()

    def _generate_symbol_preview_units(
        self,
        asset: dict[str, Any],
    ) -> tuple[str, list[tuple[int, bytes]] | str]:
        # Preserve custom render adapters that implemented the original single-preview hook.
        if type(self)._generate_symbol_preview is not ComponentCatalogDomainService._generate_symbol_preview:
            status, result = self._generate_symbol_preview(asset)
            if status != PREVIEW_STATUS_READY or not isinstance(result, bytes):
                return status, str(result)
            return PREVIEW_STATUS_READY, [(1, result)]

        with tempfile.TemporaryDirectory(prefix="prism_symsvg_units_") as tmp_dir:
            success, error = self._run_kicad_cli(
                ["sym", "export", "svg", str(asset["canonical_path"]), "--output", tmp_dir, "--symbol", str(asset["target_name"])]
            )
            if not success:
                return PREVIEW_STATUS_FAILED, error
            candidates = sorted(Path(tmp_dir).glob("*.svg"))
            if not candidates:
                return PREVIEW_STATUS_FAILED, "symbol preview export did not produce an SVG"
            units: dict[int, bytes] = {}
            for index, candidate in enumerate(candidates, start=1):
                match = re.search(r"_unit(\d+)(?:[^0-9].*)?\.svg$", candidate.name, flags=re.IGNORECASE)
                unit = int(match.group(1)) if match else index
                units.setdefault(unit, candidate.read_bytes())
            return PREVIEW_STATUS_READY, sorted(units.items())

    def _generate_footprint_preview(self, asset: dict[str, Any]) -> tuple[str, bytes | str]:
        with tempfile.TemporaryDirectory(prefix="prism_fpsvg_") as tmp_dir:
            footprint_source = Path(str(asset["canonical_path"]))
            target_name = str(asset["target_name"])
            isolated_library = Path(tmp_dir) / "isolated.pretty"
            isolated_library.mkdir(parents=True, exist_ok=True)
            isolated_footprint = isolated_library / f"{_sanitize_name(target_name, footprint_source.stem)}.kicad_mod"
            shutil.copy2(footprint_source, isolated_footprint)
            success, error = self._run_kicad_cli(
                ["fp", "export", "svg", "--output", tmp_dir, "--footprint", target_name, str(isolated_library)]
            )
            if not success:
                return PREVIEW_STATUS_FAILED, error
            expected = Path(tmp_dir) / f"{target_name}.svg"
            if not expected.is_file():
                candidates = sorted(Path(tmp_dir).glob("*.svg"))
                if not candidates:
                    return PREVIEW_STATUS_FAILED, "footprint preview export did not produce an SVG"
                expected = candidates[0]
            return PREVIEW_STATUS_READY, expected.read_bytes()

    def _store_preview_version(
        self,
        conn: Any,
        *,
        asset: dict[str, Any],
        kind: str,
        payload: bytes,
    ) -> dict[str, Any]:
        identity = self._preview_generator_identity(kind)
        sha256 = _sha256_bytes(payload)
        existing = conn.execute(
            """
            SELECT * FROM asset_preview_versions
            WHERE asset_id = %s AND kind = %s AND sha256 = %s AND generator_fingerprint = %s
            """,
            (str(asset["id"]), kind, sha256, identity["generator_fingerprint"]),
        ).fetchone()
        if existing:
            path = Path(str(existing["file_path"])).resolve()
            if not path.is_file() or _sha256_file(path) != sha256:
                raise ValueError(f"Immutable preview backing file is missing or corrupt: {path}")
            return dict(existing)
        destination = self._preview_version_path(str(asset["id"]), kind, sha256).resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            if destination.read_bytes() != payload:
                raise ValueError(f"Immutable preview hash collision at {destination}")
        else:
            temporary = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.tmp")
            temporary.write_bytes(payload)
            os.replace(temporary, destination)
        now = _utc_now_iso()
        preview_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO asset_preview_versions (
                id, asset_id, kind, status, content_type, file_path, sha256, size_bytes,
                generator_name, generator_version, pipeline_version, generator_fingerprint,
                generation_error, created_at
            ) VALUES (%s, %s, %s, 'ready', 'image/svg+xml', %s, %s, %s, %s, %s, %s, %s, '', %s)
            """,
            (
                preview_id,
                str(asset["id"]),
                kind,
                str(destination),
                sha256,
                len(payload),
                identity["generator_name"],
                identity["generator_version"],
                identity["pipeline_version"],
                identity["generator_fingerprint"],
                now,
            ),
        )
        row = conn.execute("SELECT * FROM asset_preview_versions WHERE id = %s", (preview_id,)).fetchone()
        return dict(row)

    def _ensure_asset_previews(self, conn: Any, asset: dict[str, Any]) -> list[dict[str, Any]]:
        compatibility_override = self.__dict__.get("_ensure_asset_preview")
        if callable(compatibility_override):
            preview = compatibility_override(conn, asset)
            return [preview] if preview else []
        asset_type = str(asset["asset_type"])
        if asset_type == "symbol":
            status, result = self._generate_symbol_preview_units(asset)
            if status != PREVIEW_STATUS_READY or not isinstance(result, list):
                return [{
                    "asset_id": str(asset["id"]),
                    "kind": PREVIEW_KIND_SYMBOL,
                    "status": PREVIEW_STATUS_FAILED,
                    "generation_error": str(result),
                }]
            return [
                self._store_preview_version(
                    conn,
                    asset=asset,
                    kind=_preview_kind(PREVIEW_KIND_SYMBOL, unit),
                    payload=payload,
                )
                for unit, payload in result
            ]
        elif asset_type == "footprint":
            status, result = self._generate_footprint_preview(asset)
            kind = PREVIEW_KIND_FOOTPRINT
        else:
            return []
        if status != PREVIEW_STATUS_READY or not isinstance(result, bytes):
            return [{
                "asset_id": str(asset["id"]),
                "kind": kind,
                "status": PREVIEW_STATUS_FAILED,
                "generation_error": str(result),
            }]
        return [self._store_preview_version(conn, asset=asset, kind=kind, payload=result)]

    def _ensure_asset_preview(self, conn: Any, asset: dict[str, Any]) -> dict[str, Any]:
        """Compatibility wrapper returning the first generated preview."""
        previews = self._ensure_asset_previews(conn, asset)
        return previews[0] if previews else {}

    def _has_ready_preview(self, conn: Any, asset_id: str, kind: str) -> bool:
        generator_fingerprint = self._preview_generator_identity(kind)["generator_fingerprint"]
        row = conn.execute(
            """
            SELECT file_path, sha256
            FROM asset_preview_versions
            WHERE asset_id = %s AND kind = %s AND status = %s AND generator_fingerprint = %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (asset_id, kind, PREVIEW_STATUS_READY, generator_fingerprint),
        ).fetchone()
        if not row:
            return False
        file_path = str(row["file_path"] or "")
        return bool(
            file_path
            and Path(file_path).is_file()
            and _sha256_file(Path(file_path)) == str(row["sha256"])
        )

    def _refresh_revision_preview_outputs_in_conn(
        self,
        conn: Any,
        revision_id: str,
        *,
        only_missing: bool = False,
    ) -> dict[str, Any]:
        assets = [
            asset
            for asset in self._load_assets_for_revision(conn, revision_id)
            if str(asset["asset_type"]) in PLACE_REQUIRED_ASSET_TYPES
        ]
        changed_assets: set[str] = set()
        failures: list[dict[str, str]] = []
        skipped = 0
        existing_previews = self._load_previews_for_revision(conn, revision_id)
        existing_by_asset: dict[str, list[dict[str, Any]]] = {}
        for preview in existing_previews:
            existing_by_asset.setdefault(str(preview["asset_id"]), []).append(preview)
        for asset in assets:
            kind = PREVIEW_KIND_SYMBOL if str(asset["asset_type"]) == "symbol" else PREVIEW_KIND_FOOTPRINT
            existing_rows = [
                preview
                for preview in existing_by_asset.get(str(asset["id"]), [])
                if str(preview["kind"]) == kind or str(preview["kind"]).startswith(f"{kind}:unit")
            ]
            existing_by_kind = {str(row["kind"]): row for row in existing_rows}
            if only_missing and existing_by_kind and all(
                self._has_ready_preview(conn, str(asset["id"]), preview_kind)
                for preview_kind in existing_by_kind
            ):
                skipped += 1
                continue
            try:
                previews = self._ensure_asset_previews(conn, asset)
            except Exception as exc:
                logger.warning("preview regeneration failed for asset %s: %s", asset["id"], exc)
                failures.append({"asset_id": str(asset["id"]), "kind": kind, "error": str(exc)})
                continue
            ready_previews = [preview for preview in previews if str(preview.get("status")) == PREVIEW_STATUS_READY]
            failed_previews = [preview for preview in previews if str(preview.get("status")) != PREVIEW_STATUS_READY]
            for preview in failed_previews:
                failures.append({
                    "asset_id": str(asset["id"]),
                    "kind": str(preview.get("kind") or kind),
                    "error": str(preview.get("generation_error") or "Preview generation failed"),
                })
            generated_kinds = {str(preview["kind"]) for preview in ready_previews}
            preview_set_changed = bool(ready_previews) and (generated_kinds != set(existing_by_kind) or any(
                str(existing_by_kind.get(str(preview["kind"]), {}).get("id") or "") != str(preview["id"])
                for preview in ready_previews
            ))
            if preview_set_changed:
                changed_assets.add(str(asset["id"]))
                conn.execute(
                    "DELETE FROM revision_preview_outputs WHERE revision_id = %s AND asset_id = %s AND (kind = %s OR kind LIKE %s)",
                    (revision_id, str(asset["id"]), kind, f"{kind}:unit%"),
                )
                now = _utc_now_iso()
                for preview in ready_previews:
                    conn.execute(
                        """
                        INSERT INTO revision_preview_outputs (revision_id, asset_id, kind, preview_id, generated_at)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (revision_id, asset_id, kind)
                        DO UPDATE SET preview_id = excluded.preview_id, generated_at = excluded.generated_at
                        """,
                        (revision_id, str(asset["id"]), str(preview["kind"]), str(preview["id"]), now),
                    )
            else:
                skipped += 1
        return {
            "revision_id": revision_id,
            "changed": len(changed_assets),
            "skipped": skipped,
            "failures": failures,
        }

    def _regenerate_component_previews_in_conn(
        self,
        conn: Any,
        component_id: str,
        *,
        actor: str,
        only_missing: bool = False,
    ) -> dict[str, Any]:
        _ = actor
        self._lock_component_for_mutation(conn, component_id)
        component = self._component_row(conn, component_id)
        if not component:
            raise ValueError("Component not found")
        revision_id = str(component["current_revision_id"])
        if not self._revision_row(conn, revision_id):
            raise ValueError("Component revision not found")
        if not any(
            str(asset["asset_type"]) in PLACE_REQUIRED_ASSET_TYPES
            for asset in self._load_assets_for_revision(conn, revision_id)
        ):
            raise ValueError("No symbol or footprint assets are attached")
        return self._refresh_revision_preview_outputs_in_conn(conn, revision_id, only_missing=only_missing)

    def generate_missing_component_previews(
        self,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        self.initialize()
        counts: dict[str, Any] = {
            "scanned_assets": 0,
            "generated": 0,
            "skipped_ready": 0,
            "failed": 0,
            "errors": [],
        }
        with self._connect() as conn:
            component_rows = conn.execute(
                """
                SELECT c.id, COUNT(a.id) AS asset_count
                FROM components c
                JOIN component_revisions cr ON cr.id = c.current_revision_id
                JOIN revision_assets ra ON ra.revision_id = cr.id
                JOIN assets a ON a.id = ra.asset_id
                WHERE c.is_active = 1 AND a.asset_type IN ('symbol', 'footprint')
                GROUP BY c.id, c.updated_at
                ORDER BY c.updated_at DESC, c.id
                """
            ).fetchall()
            counts["total_assets"] = sum(int(row["asset_count"]) for row in component_rows)
            if progress_callback:
                progress_callback(counts.copy())
            for row in component_rows:
                component_id = str(row["id"])
                asset_count = int(row["asset_count"])
                counts["scanned_assets"] += asset_count
                try:
                    result = self._regenerate_component_previews_in_conn(
                        conn,
                        component_id,
                        actor="preview-generator",
                        only_missing=True,
                    )
                    counts["generated"] += int(result["changed"])
                    counts["skipped_ready"] += int(result["skipped"])
                    counts["failed"] += len(result["failures"])
                    counts["errors"].extend(
                        {"component_id": component_id, **failure}
                        for failure in result["failures"]
                    )
                    conn.commit()
                except Exception as exc:
                    conn.rollback()
                    counts["failed"] += asset_count
                    counts["errors"].append(
                        {
                            "component_id": component_id,
                            "error": str(exc),
                        }
                    )
                if progress_callback:
                    progress_callback(counts.copy())
        return counts

    def _link_asset_to_revision(self, conn: Any, revision_id: str, asset: dict[str, Any], *, required: bool) -> None:
        now = _utc_now_iso()
        if str(asset["asset_type"]) in PLACE_REQUIRED_ASSET_TYPES:
            kind = PREVIEW_KIND_SYMBOL if str(asset["asset_type"]) == "symbol" else PREVIEW_KIND_FOOTPRINT
            conn.execute(
                "DELETE FROM revision_preview_outputs WHERE revision_id = %s AND (kind = %s OR kind LIKE %s) AND asset_id <> %s",
                (revision_id, kind, f"{kind}:unit%", asset["id"]),
            )
            conn.execute(
                """
                DELETE FROM revision_validation_evidence_links
                WHERE revision_id = %s AND asset_id IN (
                    SELECT asset_id FROM revision_assets
                    WHERE revision_id = %s AND asset_type = %s AND asset_id <> %s
                )
                """,
                (revision_id, revision_id, asset["asset_type"], asset["id"]),
            )
            conn.execute(
                "DELETE FROM revision_assets WHERE revision_id = %s AND asset_type = %s AND asset_id <> %s",
                (revision_id, asset["asset_type"], asset["id"]),
            )
        conn.execute(
            """
            INSERT INTO revision_assets (revision_id, asset_type, asset_id, required, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (revision_id, asset_id)
            DO UPDATE SET required = excluded.required, updated_at = excluded.updated_at
            """,
            (revision_id, asset["asset_type"], asset["id"], 1 if required else 0, now, now),
        )
        if str(asset["asset_type"]) in PLACE_REQUIRED_ASSET_TYPES:
            preview_rows = conn.execute(
                """
                SELECT id, kind FROM asset_preview_versions
                WHERE asset_id = %s AND (kind = %s OR kind LIKE %s) AND status = 'ready'
                ORDER BY created_at DESC, id DESC
                """,
                (str(asset["id"]), kind, f"{kind}:unit%"),
            ).fetchall()
            latest_by_kind: dict[str, dict[str, Any]] = {}
            for preview in preview_rows:
                latest_by_kind.setdefault(str(preview["kind"]), dict(preview))
            for preview_kind, preview in latest_by_kind.items():
                conn.execute(
                    """
                    INSERT INTO revision_preview_outputs (revision_id, asset_id, kind, preview_id, generated_at)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (revision_id, asset_id, kind)
                    DO UPDATE SET preview_id = excluded.preview_id, generated_at = excluded.generated_at
                    """,
                    (revision_id, str(asset["id"]), preview_kind, str(preview["id"]), now),
                )

    def _resolve_existing_asset(
        self,
        conn: Any,
        *,
        asset_type: str,
        file_path: str,
        target_library: str,
        target_name: str,
    ) -> dict[str, Any]:
        root = self._asset_root(asset_type)
        path = (root / file_path).resolve()
        if not path.is_file():
            raise ValueError(f"Asset file not found: {path}")
        try:
            path.relative_to(self._store_root)
        except ValueError as exc:
            raise ValueError("Linked asset must already live inside the Prism canonical store") from exc

        if asset_type == "symbol":
            text = path.read_text(encoding="utf-8", errors="ignore")
            discovered = _discover_symbol_names_in_text(text)
            if not target_name:
                if len(discovered) != 1:
                    raise ValueError("Symbol file contains multiple symbols; target_name is required")
                target_name = discovered[0]
            if not target_library:
                target_library = path.parent.name
            if len(discovered) != 1 or discovered[0] != target_name:
                payload = self._single_symbol_payload(text, target_name)
                canonical = self._write_canonical_file(self._symbol_destination(target_library, target_name), payload)
            else:
                canonical = path
        elif asset_type == "footprint":
            if path.suffix.lower() != ".kicad_mod":
                raise ValueError("Footprint links must point to a .kicad_mod file")
            target_name = target_name or _discover_footprint_name_in_text(path.read_text(encoding="utf-8", errors="ignore")) or path.stem
            target_library = target_library or path.parent.name.removesuffix(".pretty")
            canonical = path
        elif asset_type == "3dmodel":
            target_name = target_name or path.name
            target_library = target_library or path.parent.name
            canonical = path
        elif asset_type == "spice":
            target_name = target_name or path.name
            target_library = target_library or path.parent.name
            canonical = path
        else:
            raise ValueError("Unsupported asset type")

        asset = self._register_asset(
            conn,
            asset_type=asset_type,
            canonical_path=canonical,
            target_library=target_library,
            target_name=target_name,
        )
        return asset

    def link_library_asset(
        self,
        component_id: str,
        asset_type: str,
        file_path_rel: str,
        target_library: str,
        target_name: str,
        *,
        actor: str = "",
    ) -> dict[str, Any]:
        if asset_type not in SUPPORTED_ASSET_TYPES:
            raise ValueError("Unsupported asset type")
        self.initialize()
        with self._connect() as conn:
            asset = self._resolve_existing_asset(
                conn,
                asset_type=asset_type,
                file_path=file_path_rel,
                target_library=target_library,
                target_name=target_name,
            )
            self._attach_asset_revision(
                conn,
                component_id=component_id,
                asset=asset,
                required=asset_type in PLACE_REQUIRED_ASSET_TYPES,
                actor=actor,
                change_summary=f"Link {asset_type} asset",
            )
            conn.commit()
        return {"component": self.get_component(component_id)}

    def _normalize_symbol_upload(self, upload_name: str, payload: bytes) -> bytes:
        with tempfile.TemporaryDirectory(prefix="prism_sym_import_") as tmp_dir:
            input_path = Path(tmp_dir) / _sanitize_name(upload_name or "uploaded", "uploaded.kicad_sym")
            output_path = Path(tmp_dir) / "normalized.kicad_sym"
            input_path.write_bytes(payload)
            success, error = self._run_kicad_cli(["sym", "upgrade", "--force", "--output", str(output_path), str(input_path)])
            if not success:
                logger.warning("Falling back to uploaded symbol payload without kicad-cli normalization: %s", error)
                return payload
            if not output_path.is_file():
                raise ValueError("kicad-cli sym upgrade did not produce a normalized symbol library")
            return output_path.read_bytes()

    def import_symbol_library(
        self,
        component_id: str,
        *,
        upload_name: str,
        payload: bytes,
        target_library: str,
        selected_symbol: str,
        actor: str = "",
    ) -> dict[str, Any]:
        self.initialize()
        normalized = self._normalize_symbol_upload(upload_name, payload)
        text = normalized.decode("utf-8", errors="ignore")
        discovered = _discover_symbol_names_in_text(text)
        if not discovered:
            raise ValueError("No symbols were found in the uploaded library")
        if not selected_symbol and len(discovered) > 1:
            return {"mode": "selection_required", "discovered_symbols": discovered}
        chosen = selected_symbol or discovered[0]
        canonical_payload = self._single_symbol_payload(text, chosen)
        canonical_path = self._write_canonical_file(self._symbol_destination(target_library or "Prism_Symbols", chosen), canonical_payload)

        with self._connect() as conn:
            asset = self._register_asset(
                conn,
                asset_type="symbol",
                canonical_path=canonical_path,
                target_library=target_library or "Prism_Symbols",
                target_name=chosen,
            )
            self._attach_asset_revision(
                conn,
                component_id=component_id,
                asset=asset,
                required=True,
                actor=actor,
                change_summary=f"Import symbol {chosen}",
            )
            conn.commit()
        return {
            "mode": "imported",
            "discovered_symbols": discovered,
            "selected_symbol": chosen,
            "component": self.get_component(component_id),
        }

    def _extract_footprints_from_upload(self, upload_name: str, payload: bytes) -> dict[str, bytes]:
        suffix = Path(upload_name).suffix.lower()
        if suffix == ".kicad_mod":
            text = payload.decode("utf-8", errors="ignore")
            name = _discover_footprint_name_in_text(text) or Path(upload_name).stem
            return {name: payload}
        if suffix == ".zip":
            discovered: dict[str, bytes] = {}
            with zipfile.ZipFile(io.BytesIO(payload)) as archive:
                for name in archive.namelist():
                    if not name.lower().endswith(".kicad_mod"):
                        continue
                    content = archive.read(name)
                    footprint_name = _discover_footprint_name_in_text(content.decode("utf-8", errors="ignore")) or Path(name).stem
                    discovered[footprint_name] = content
            return discovered
        raise ValueError("Footprint upload must be a .kicad_mod file or a zipped .pretty library")

    def import_footprint(
        self,
        component_id: str,
        *,
        upload_name: str,
        payload: bytes,
        target_library: str,
        selected_footprint: str,
        actor: str = "",
    ) -> dict[str, Any]:
        self.initialize()
        discovered = self._extract_footprints_from_upload(upload_name, payload)
        names = sorted(discovered)
        if not names:
            raise ValueError("No footprints were found in the uploaded payload")
        if not selected_footprint and len(names) > 1:
            return {"mode": "selection_required", "discovered_footprints": names}
        chosen = selected_footprint or names[0]
        canonical_path = self._write_canonical_file(
            self._footprint_destination(target_library or "Prism_Footprints", chosen),
            discovered[chosen],
        )
        with self._connect() as conn:
            asset = self._register_asset(
                conn,
                asset_type="footprint",
                canonical_path=canonical_path,
                target_library=target_library or "Prism_Footprints",
                target_name=chosen,
            )
            self._attach_asset_revision(
                conn,
                component_id=component_id,
                asset=asset,
                required=True,
                actor=actor,
                change_summary=f"Import footprint {chosen}",
            )
            conn.commit()
        return {
            "mode": "imported",
            "discovered_footprints": names,
            "selected_footprint": chosen,
            "component": self.get_component(component_id),
        }

    def attach_auxiliary_asset(
        self,
        component_id: str,
        *,
        asset_type: str,
        upload_name: str,
        payload: bytes,
        target_library: str,
        actor: str = "",
    ) -> dict[str, Any]:
        if asset_type not in {"3dmodel", "spice"}:
            raise ValueError("Unsupported auxiliary asset type")
        self.initialize()
        destination = self._write_canonical_file(
            self._aux_destination(asset_type, target_library or "Prism_Assets", upload_name),
            payload,
        )
        with self._connect() as conn:
            asset = self._register_asset(
                conn,
                asset_type=asset_type,
                canonical_path=destination,
                target_library=target_library or "Prism_Assets",
                target_name=destination.name,
            )
            self._attach_asset_revision(
                conn,
                component_id=component_id,
                asset=asset,
                required=False,
                actor=actor,
                change_summary=f"Import {asset_type} asset {destination.name}",
            )
            conn.commit()
        return {"component": self.get_component(component_id)}

    def detach_asset(self, component_id: str, asset_type: str, *, actor: str = "") -> dict[str, Any]:
        if asset_type not in SUPPORTED_ASSET_TYPES:
            raise ValueError("Unsupported asset type")
        self.initialize()
        with self._connect() as conn:
            _, current = self._active_revision_row(conn, component_id, released=False)
            if not current:
                raise ValueError("Component not found")
            existing = conn.execute(
                "SELECT 1 FROM revision_assets WHERE revision_id = %s AND asset_type = %s",
                (current["id"], asset_type),
            ).fetchone()
            if not existing:
                return {"component": self.get_component(component_id)}
            revision = self._clone_revision(
                conn,
                component_id,
                actor=actor,
                change_kind="asset",
                change_summary=f"Detach {asset_type} asset",
            )
            conn.execute(
                """
                DELETE FROM revision_previews
                WHERE revision_id = %s AND asset_id IN (
                    SELECT asset_id FROM revision_assets WHERE revision_id = %s AND asset_type = %s
                )
                """,
                (revision["id"], revision["id"], asset_type),
            )
            conn.execute(
                """
                DELETE FROM revision_preview_outputs
                WHERE revision_id = %s AND asset_id IN (
                    SELECT asset_id FROM revision_assets WHERE revision_id = %s AND asset_type = %s
                )
                """,
                (revision["id"], revision["id"], asset_type),
            )
            conn.execute(
                """
                DELETE FROM revision_validation_evidence_links
                WHERE revision_id = %s AND asset_id IN (
                    SELECT asset_id FROM revision_assets WHERE revision_id = %s AND asset_type = %s
                )
                """,
                (revision["id"], revision["id"], asset_type),
            )
            conn.execute("DELETE FROM revision_assets WHERE revision_id = %s AND asset_type = %s", (revision["id"], asset_type))
            self._finalize_revision(
                conn,
                component_id=component_id,
                revision_id=str(revision["id"]),
                event_type="revision.created",
                actor=actor,
                details={"change_kind": "asset", "change_summary": f"Detach {asset_type} asset"},
            )
            conn.commit()
        return {"component": self.get_component(component_id)}

    def _klc_release_gate(self) -> str:
        gate = settings.CATALOG_KLC_RELEASE_GATE.strip().lower()
        return gate if gate in KLC_RELEASE_GATE_VALUES else "warn"

    def _klc_utils_root(self) -> Path:
        return Path(settings.CATALOG_KLC_UTILS_PATH).expanduser().resolve()

    def _klc_checker_path(self, asset_type: str) -> Path | None:
        script = "check_symbol.py" if asset_type == "symbol" else "check_footprint.py" if asset_type == "footprint" else ""
        if not script:
            return None
        path = self._klc_utils_root() / "klc-check" / script
        return path if path.is_file() else None

    def _klc_tool_version(self) -> str:
        root = self._klc_utils_root()
        if not root.exists():
            return ""
        try:
            result = subprocess.run(
                ["git", "-C", str(root), "rev-parse", "--short", "HEAD"],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
            if result.returncode == 0:
                return result.stdout.strip()
        except (OSError, subprocess.SubprocessError):
            return ""
        return ""

    def _klc_rule_args(self, asset_type: str) -> list[str]:
        if asset_type == "symbol":
            rules = settings.CATALOG_KLC_SYMBOL_RULES.strip()
            excludes = settings.CATALOG_KLC_SYMBOL_EXCLUDE_RULES.strip()
        else:
            rules = settings.CATALOG_KLC_FOOTPRINT_RULES.strip()
            excludes = settings.CATALOG_KLC_FOOTPRINT_EXCLUDE_RULES.strip()
        args: list[str] = []
        if rules:
            args.extend(["--rule", rules])
        if excludes:
            args.extend(["--exclude", excludes])
        return args

    def _parse_klc_junit(self, junit_path: Path) -> list[dict[str, Any]]:
        if not junit_path.is_file():
            return []
        root = ElementTree.parse(junit_path).getroot()
        findings: list[dict[str, Any]] = []
        for testcase in root.iter("testcase"):
            object_name = str(testcase.attrib.get("name", "")).removesuffix(" - Errors").removesuffix(" - Warnings")
            testcase_type = str(testcase.attrib.get("type", ""))
            for failure in testcase.findall("failure"):
                raw_type = str(failure.attrib.get("type", testcase_type)).upper()
                if raw_type == "WARNING" or testcase_type == "Warnings":
                    severity = VALIDATION_SEVERITY_WARNING
                elif raw_type == "INFO" or testcase_type == "Info":
                    severity = VALIDATION_SEVERITY_INFO
                else:
                    severity = VALIDATION_SEVERITY_ERROR
                message = str(failure.attrib.get("message") or "").strip()
                rule_code = message.split(":", 1)[0].strip() if ":" in message else ""
                text = (failure.text or "").strip()
                lines = [line.strip() for line in text.splitlines() if line.strip()]
                rule_url = next((line for line in lines if line.startswith("http://") or line.startswith("https://")), "")
                details = [line for line in lines if line != message and line != rule_url]
                findings.append(
                    {
                        "severity": severity,
                        "rule_code": rule_code,
                        "rule_url": rule_url,
                        "message": message or text or "KLC finding",
                        "details": details,
                        "object_name": object_name,
                    }
                )
        return findings

    def _write_validation_report_json(
        self,
        path: Path,
        *,
        run_id: str,
        asset: dict[str, Any],
        status: str,
        exit_code: int | None,
        findings: list[dict[str, Any]],
        stdout: str,
        stderr: str,
        tool_version: str,
        created_at: str,
        finished_at: str,
    ) -> None:
        payload = {
            "run_id": run_id,
            "asset_id": str(asset["id"]),
            "asset_type": str(asset["asset_type"]),
            "asset_name": str(asset["name"]),
            "target_library": str(asset["target_library"]),
            "target_name": str(asset["target_name"]),
            "status": status,
            "exit_code": exit_code,
            "error_count": sum(1 for finding in findings if finding["severity"] == VALIDATION_SEVERITY_ERROR),
            "warning_count": sum(1 for finding in findings if finding["severity"] == VALIDATION_SEVERITY_WARNING),
            "tool_version": tool_version,
            "created_at": created_at,
            "finished_at": finished_at,
            "stdout": stdout,
            "stderr": stderr,
            "findings": findings,
        }
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _store_validation_run(
        self,
        conn: Any,
        *,
        run_id: str,
        component_id: str,
        revision_id: str,
        asset: dict[str, Any],
        status: str,
        exit_code: int | None,
        findings: list[dict[str, Any]],
        report_dir: Path,
        stdout_path: Path,
        stderr_path: Path,
        junit_path: Path,
        json_path: Path,
        raw_output: str,
        tool_version: str,
        created_at: str,
        finished_at: str,
    ) -> dict[str, Any]:
        error_count = sum(1 for finding in findings if finding["severity"] == VALIDATION_SEVERITY_ERROR)
        warning_count = sum(1 for finding in findings if finding["severity"] == VALIDATION_SEVERITY_WARNING)
        conn.execute("DELETE FROM asset_validation_findings WHERE run_id = %s", (run_id,))
        conn.execute(
            """
            INSERT INTO asset_validation_runs (
                id, component_id, revision_id, asset_id, asset_type, checker_type, status,
                error_count, warning_count, exit_code, tool_version, report_dir, stdout_path,
                stderr_path, junit_path, json_path, raw_output, created_at, finished_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                run_id,
                component_id,
                revision_id,
                asset["id"],
                asset["asset_type"],
                f"klc_{asset['asset_type']}",
                status,
                error_count,
                warning_count,
                exit_code,
                tool_version,
                str(report_dir),
                str(stdout_path),
                str(stderr_path),
                str(junit_path),
                str(json_path),
                raw_output[-20000:],
                created_at,
                finished_at,
            ),
        )
        for finding in findings:
            conn.execute(
                """
                INSERT INTO asset_validation_findings (
                    id, run_id, severity, rule_code, rule_url, message, details_json, object_name, created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    str(uuid.uuid4()),
                    run_id,
                    finding["severity"],
                    finding.get("rule_code", ""),
                    finding.get("rule_url", ""),
                    finding["message"],
                    json.dumps(finding.get("details", [])),
                    finding.get("object_name", ""),
                    finished_at,
                ),
            )
        row = conn.execute("SELECT * FROM asset_validation_runs WHERE id = %s", (run_id,)).fetchone()
        return self._validation_run_payload(dict(row), include_findings=True, conn=conn) if row else {}

    def _run_klc_for_asset(
        self,
        conn: Any,
        *,
        component_id: str,
        revision_id: str,
        asset: dict[str, Any],
    ) -> dict[str, Any]:
        asset_type = str(asset["asset_type"])
        if asset_type not in {"symbol", "footprint"}:
            raise ValueError("KLC validation only supports symbol and footprint assets")
        run_id = str(uuid.uuid4())
        created_at = _utc_now_iso()
        report_dir = self._validation_root / run_id
        report_dir.mkdir(parents=True, exist_ok=True)
        stdout_path = report_dir / "stdout.txt"
        stderr_path = report_dir / "stderr.txt"
        junit_path = report_dir / "report.junit.xml"
        json_path = report_dir / "report.json"
        checker = self._klc_checker_path(asset_type)
        tool_version = self._klc_tool_version()
        findings: list[dict[str, Any]] = []
        stdout = ""
        stderr = ""
        exit_code: int | None = None

        if checker is None:
            status = VALIDATION_STATUS_SKIPPED
            stderr = f"KLC checker unavailable under {self._klc_utils_root()}"
        else:
            cmd = ["python3", str(checker), str(asset["canonical_path"]), "-vv", "--nocolor", "--junit", str(junit_path)]
            cmd.extend(self._klc_rule_args(asset_type))
            if asset_type == "symbol" and settings.CATALOG_KLC_FOOTPRINT_LIB_DIR.strip():
                cmd.extend(["--footprints", settings.CATALOG_KLC_FOOTPRINT_LIB_DIR.strip()])
            try:
                result = subprocess.run(
                    cmd,
                    cwd=str(checker.parent),
                    capture_output=True,
                    text=True,
                    timeout=settings.CATALOG_KLC_TIMEOUT_SECONDS,
                    check=False,
                )
                stdout = result.stdout or ""
                stderr = result.stderr or ""
                exit_code = result.returncode
                try:
                    findings = self._parse_klc_junit(junit_path)
                except ElementTree.ParseError as exc:
                    findings = [
                        {
                            "severity": VALIDATION_SEVERITY_ERROR,
                            "rule_code": "",
                            "rule_url": "",
                            "message": f"Could not parse KLC JUnit report: {exc}",
                            "details": [],
                            "object_name": str(asset["target_name"] or asset["name"]),
                        }
                    ]
                if any(finding["severity"] == VALIDATION_SEVERITY_ERROR for finding in findings) or result.returncode not in {0, 2, 3}:
                    status = VALIDATION_STATUS_FAILED
                elif any(finding["severity"] == VALIDATION_SEVERITY_WARNING for finding in findings) or result.returncode == 2:
                    status = VALIDATION_STATUS_WARNING
                else:
                    status = VALIDATION_STATUS_PASSED
            except subprocess.TimeoutExpired as exc:
                status = VALIDATION_STATUS_FAILED
                stdout = exc.stdout if isinstance(exc.stdout, str) else ""
                stderr = f"KLC validation timed out after {settings.CATALOG_KLC_TIMEOUT_SECONDS}s"
                exit_code = None
            except OSError as exc:
                status = VALIDATION_STATUS_FAILED
                stderr = str(exc)
                exit_code = None

        finished_at = _utc_now_iso()
        stdout_path.write_text(stdout, encoding="utf-8")
        stderr_path.write_text(stderr, encoding="utf-8")
        if not junit_path.exists():
            junit_path.write_text("<testsuites />\n", encoding="utf-8")
        self._write_validation_report_json(
            json_path,
            run_id=run_id,
            asset=asset,
            status=status,
            exit_code=exit_code,
            findings=findings,
            stdout=stdout,
            stderr=stderr,
            tool_version=tool_version,
            created_at=created_at,
            finished_at=finished_at,
        )
        return self._store_validation_run(
            conn,
            run_id=run_id,
            component_id=component_id,
            revision_id=revision_id,
            asset=asset,
            status=status,
            exit_code=exit_code,
            findings=findings,
            report_dir=report_dir,
            stdout_path=stdout_path,
            stderr_path=stderr_path,
            junit_path=junit_path,
            json_path=json_path,
            raw_output=f"{stdout}\n{stderr}",
            tool_version=tool_version,
            created_at=created_at,
            finished_at=finished_at,
        )

    def validate_component_klc(self, component_id: str) -> dict[str, Any]:
        self.initialize()
        if not settings.CATALOG_KLC_ENABLED:
            raise ValueError("KLC validation is disabled")
        with self._connect() as conn:
            component = self._component_row(conn, component_id)
            if not component:
                raise ValueError("Component not found")
            revision = self._revision_row(conn, str(component["current_revision_id"]))
            if not revision:
                raise ValueError("Component revision not found")
            assets = [
                asset
                for asset in self._load_assets_for_revision(conn, str(revision["id"]))
                if str(asset["asset_type"]) in {"symbol", "footprint"}
            ]
            if not assets:
                raise ValueError("No symbol or footprint assets are attached")
            runs = [
                self._run_klc_for_asset(
                    conn,
                    component_id=component_id,
                    revision_id=str(revision["id"]),
                    asset=asset,
                )
                for asset in assets
            ]
            conn.commit()
            component_payload = self._component_payload(conn, component, revision)
        return {"component": component_payload, "runs": runs}

    def get_component_validation(self, component_id: str) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            component = self._component_row(conn, component_id)
            if not component:
                raise ValueError("Component not found")
            revision = self._revision_row(conn, str(component["current_revision_id"]))
            if not revision:
                raise ValueError("Component revision not found")
            assets = self._load_assets_for_revision(conn, str(revision["id"]))
            summary = self._component_validation_summary(conn, str(revision["id"]), assets)
            run_ids = [
                str(asset["latest_run"]["id"])
                for asset in summary["assets"]
                if asset.get("latest_run")
            ]
            inherited_by_run = {
                str(asset["latest_run"]["id"]): dict(asset["latest_run"])
                for asset in summary["assets"]
                if asset.get("latest_run") and asset["latest_run"].get("inherited")
            }
            runs = []
            if run_ids:
                placeholders = ",".join("%s" for _ in run_ids)
                rows = conn.execute(
                    f"SELECT * FROM asset_validation_runs WHERE id IN ({placeholders})",
                    tuple(run_ids),
                ).fetchall()
                for row in rows:
                    payload = self._validation_run_payload(dict(row), include_findings=True, conn=conn)
                    inherited = inherited_by_run.get(payload["id"])
                    if inherited:
                        payload["inherited"] = True
                        payload["inherited_from_revision_id"] = inherited.get("inherited_from_revision_id", "")
                    runs.append(payload)
        return {"summary": summary, "runs": runs}

    def get_validation_run(self, run_id: str) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM asset_validation_runs WHERE id = %s", (run_id,)).fetchone()
            if not row:
                return None
            return self._validation_run_payload(dict(row), include_findings=True, conn=conn)

    def validation_report_path(self, run_id: str, report_name: str) -> Path | None:
        allowed = {
            "report.json": "json_path",
            "report.junit.xml": "junit_path",
            "stdout": "stdout_path",
            "stderr": "stderr_path",
        }
        column = allowed.get(report_name)
        if not column:
            return None
        self.initialize()
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM asset_validation_runs WHERE id = %s", (run_id,)).fetchone()
            if not row:
                return None
            path = Path(str(row[column])).resolve()
        try:
            path.relative_to(self._validation_root)
        except ValueError:
            return None
        return path if path.is_file() else None

    def catalog_health(self) -> dict[str, Any]:
        self.initialize()
        validation_counts = {status: 0 for status in (VALIDATION_STATUS_PASSED, VALIDATION_STATUS_WARNING, VALIDATION_STATUS_FAILED, VALIDATION_STATUS_SKIPPED, VALIDATION_STATUS_NOT_RUN)}
        place_ready = 0
        released = 0
        missing_files = 0
        total_components = 0
        page = 1
        page_size = 10000
        while True:
            # Lightweight payloads avoid hydrating preview graphs for every component.
            result = self.list_components(include_inactive=False, page=page, page_size=page_size, lightweight=True)
            components = result["items"]
            total_components = int(result["total"])
            for component in components:
                validation_counts[component["validation"]["status"]] = validation_counts.get(component["validation"]["status"], 0) + 1
                if component["availability_state"] == STATE_PLACE_READY:
                    place_ready += 1
                else:
                    missing_files += 1
                if component["release_status"] == "released":
                    released += 1
            if page >= int(result["pages"]):
                break
            page += 1
        with self._connect() as conn:
            preview_failed_row = conn.execute(
                """
                SELECT COUNT(*) AS count
                FROM revision_preview_outputs rpo
                JOIN components c ON c.current_revision_id = rpo.revision_id
                JOIN asset_preview_versions apv ON apv.id = rpo.preview_id
                WHERE c.is_active = 1 AND apv.status = %s
                """,
                (PREVIEW_STATUS_FAILED,),
            ).fetchone()
            preview_failed = int(preview_failed_row["count"] if preview_failed_row else 0)
        checker_available = bool(self._klc_checker_path("symbol") and self._klc_checker_path("footprint"))
        return {
            "enabled": bool(settings.CATALOG_KLC_ENABLED),
            "checker_available": checker_available,
            "checker_path": str(self._klc_utils_root()),
            "release_gate": self._klc_release_gate(),
            "total_components": total_components,
            "released": released,
            "place_ready": place_ready,
            "missing_files": missing_files,
            "preview_failed": preview_failed,
            "validation": validation_counts,
        }

    def regenerate_component_previews(self, component_id: str, *, actor: str = "") -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            self._regenerate_component_previews_in_conn(
                conn,
                component_id,
                actor=actor or "preview-generator",
            )
            conn.commit()
        return self.get_component(component_id) or {}

    def set_release_status(
        self,
        component_id: str,
        release_status: str,
        *,
        actor: str = "",
        self_approval_override_reason: str = "",
        review_note: str = "",
        actor_role: str = "",
        expected_revision_id: str = "",
        expected_manifest_hash: str = "",
    ) -> dict[str, Any]:
        release_status = _normalize_workflow_stage(release_status)
        if release_status not in WORKFLOW_STAGES:
            raise ValueError("Unsupported release status")
        self.initialize()
        with self._connect() as conn:
            self._lock_component_for_mutation(conn, component_id)
            component = self._component_row(conn, component_id)
            if not component:
                raise ValueError("Component not found")
            revision = self._revision_row(conn, str(component["current_revision_id"]))
            if not revision:
                raise ValueError("Component revision not found")
            if expected_revision_id and str(revision["id"]) != expected_revision_id:
                raise ValueError("Component revision conflict: refresh the component before changing workflow")
            if expected_manifest_hash and str(revision.get("manifest_hash") or "") != expected_manifest_hash:
                raise ValueError("Component manifest conflict: refresh the component before changing workflow")
            current_status = _normalize_workflow_stage(str(revision["release_status"]))
            if current_status == "released" and release_status == "open":
                revision = self._clone_revision(
                    conn,
                    component_id,
                    actor=actor,
                    change_kind="new_draft",
                    change_summary="Create draft from released revision",
                )
                self._finalize_revision(
                    conn,
                    component_id=component_id,
                    revision_id=str(revision["id"]),
                    event_type="revision.created",
                    actor=actor,
                    details={
                        "change_kind": "new_draft",
                        "change_summary": "Create draft from released revision",
                    },
                )
                revision = self._revision_row(conn, str(revision["id"])) or revision
                current_status = _normalize_workflow_stage(str(revision["release_status"]))

            allowed = {
                "open": {"in_progress", "archived"},
                "in_progress": {"qa_review", "open", "archived"},
                "qa_review": {"done", "in_progress", "archived"},
                "done": {"released", "qa_review", "archived"},
                "released": {"archived", "open"},
                "archived": {"open"},
            }
            if release_status != current_status and release_status not in allowed.get(current_status, set()):
                raise ValueError(f"Cannot transition revision from {current_status} to {release_status}")
            if actor and current_status == "qa_review" and release_status == "in_progress" and not review_note.strip():
                raise ValueError("A review note is required when requesting changes")
            if (
                actor
                and release_status in {"done", "released"}
                and str(revision.get("created_by") or "").casefold() == actor.casefold()
                and not self_approval_override_reason.strip()
            ):
                raise ValueError("Two-person approval required: revision authors cannot approve or release their own revision")

            assets = self._load_assets_for_revision(conn, revision["id"])
            validation = self._component_validation_summary(conn, str(revision["id"]), assets)
            policy_snapshot = {
                "two_person_approval": True,
                "klc_release_gate": self._klc_release_gate(),
            }
            availability_state, missing_assets, _ = self._availability(assets, release_status, bool(component["is_active"]))
            if release_status == "released" and availability_state != STATE_PLACE_READY:
                raise ValueError(f"Cannot release component while files are incomplete: missing {', '.join(missing_assets)}")
            if release_status == "released" and self._klc_release_gate() == "block":
                if validation["status"] in {VALIDATION_STATUS_FAILED, VALIDATION_STATUS_SKIPPED, VALIDATION_STATUS_NOT_RUN}:
                    raise ValueError(
                        "Cannot release component until required symbol and footprint assets pass KLC validation"
                    )

            approval_decision = None
            if release_status == "released":
                approval_decision = conn.execute(
                    """
                    SELECT *
                    FROM component_review_decisions
                    WHERE component_id = %s AND revision_id = %s AND manifest_hash = %s
                      AND decision IN ('approved', 'emergency_override')
                    ORDER BY created_at DESC, id DESC
                    LIMIT 1
                    """,
                    (component_id, str(revision["id"]), str(revision.get("manifest_hash") or "")),
                ).fetchone()
                if actor and not approval_decision:
                    raise ValueError("Cannot release component without approval evidence for this exact revision")

            now = _utc_now_iso()
            conn.execute(
                "UPDATE component_revisions SET release_status = %s, updated_at = %s WHERE id = %s",
                (release_status, now, revision["id"]),
            )
            if release_status == "released":
                conn.execute(
                    "UPDATE components SET released_revision_id = %s, updated_at = %s WHERE id = %s",
                    (revision["id"], now, component_id),
                )
            elif release_status == "archived":
                if str(component.get("released_revision_id") or "") == str(revision["id"]):
                    conn.execute(
                        "UPDATE components SET released_revision_id = '', updated_at = %s WHERE id = %s",
                        (now, component_id),
                    )
                else:
                    conn.execute("UPDATE components SET updated_at = %s WHERE id = %s", (now, component_id))
            else:
                conn.execute("UPDATE components SET updated_at = %s WHERE id = %s", (now, component_id))
            if release_status != current_status:
                decision = ""
                if current_status == "qa_review" and release_status == "done":
                    decision = "emergency_override" if self_approval_override_reason.strip() else "approved"
                elif current_status == "qa_review" and release_status == "in_progress":
                    decision = "changes_requested"
                elif current_status == "done" and release_status == "released":
                    decision = "released"
                elif release_status == "archived":
                    decision = "archived"
                if decision:
                    conn.execute(
                        """
                        INSERT INTO component_review_decisions (
                            id, component_id, revision_id, reviewer, reviewer_role, decision, note,
                            manifest_hash, validation_json, policy_json, created_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            str(uuid.uuid4()),
                            component_id,
                            str(revision["id"]),
                            actor,
                            actor_role,
                            decision,
                            self_approval_override_reason.strip() or review_note.strip(),
                            str(revision.get("manifest_hash") or ""),
                            json.dumps(validation, sort_keys=True, separators=(",", ":")),
                            json.dumps(policy_snapshot, sort_keys=True, separators=(",", ":")),
                            now,
                        ),
                    )
                if release_status == "released":
                    conn.execute(
                        """
                        INSERT INTO component_release_records (
                            id, component_id, revision_id, release_label, manifest_hash, released_by,
                            approval_decision_id, validation_json, policy_json, created_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT(component_id, revision_id, manifest_hash) DO NOTHING
                        """,
                        (
                            str(uuid.uuid4()),
                            component_id,
                            str(revision["id"]),
                            f"r{int(revision['version'])}",
                            str(revision.get("manifest_hash") or ""),
                            actor,
                            str(approval_decision["id"]) if approval_decision else "",
                            json.dumps(validation, sort_keys=True, separators=(",", ":")),
                            json.dumps(policy_snapshot, sort_keys=True, separators=(",", ":")),
                            now,
                        ),
                    )
                self._append_audit_event(
                    conn,
                    component_id=component_id,
                    revision_id=str(revision["id"]),
                    event_type="workflow.transitioned",
                    actor=actor,
                    details={
                        "from": current_status,
                        "to": release_status,
                        "self_approval_override_reason": self_approval_override_reason.strip(),
                        "review_note": review_note.strip(),
                    },
                )
            conn.commit()
        return self.get_component(component_id) or {}

    def deactivate_component(self, component_id: str, *, actor: str = "", reason: str = "") -> bool:
        self.initialize()
        with self._connect() as conn:
            component = self._component_row(conn, component_id)
            if not component:
                return False
            if not bool(component["is_active"]):
                return True
            result = conn.execute(
                "UPDATE components SET is_active = 0, updated_at = %s WHERE id = %s",
                (_utc_now_iso(), component_id),
            )
            self._append_audit_event(
                conn,
                component_id=component_id,
                revision_id=str(component.get("current_revision_id") or ""),
                event_type="component.retired",
                actor=actor,
                details={"reason": reason.strip() or "Removed from the active component catalog"},
            )
            conn.commit()
            return result.rowcount > 0

    def delete_component(self, component_id: str, *, actor: str = "", reason: str = "") -> bool:
        # Component identity, revisions, releases, usage, and audit evidence are never
        # hard-deleted. The legacy DELETE contract now performs an auditable tombstone
        # so existing callers retain their UX while compliance history remains intact.
        return self.deactivate_component(component_id, actor=actor, reason=reason)

    def _materialize_asset(self, asset: dict[str, Any], assets_for_revision: list[dict[str, Any]], component: dict[str, Any] | None = None) -> dict[str, Any]:
        path = Path(str(asset["canonical_path"]))
        payload = path.read_bytes()
        if asset["asset_type"] == "symbol":
            footprint_asset = next((candidate for candidate in assets_for_revision if candidate["asset_type"] == "footprint"), None)
            footprint_ref = None
            if footprint_asset:
                footprint_ref = f"{_remote_library_nickname(str(footprint_asset['target_library']))}:{footprint_asset['target_name']}"
            payload = _rewrite_symbol_payload(payload, footprint_ref, component)
        elif asset["asset_type"] == "footprint":
            payload = _rewrite_footprint_payload(
                payload,
                asset,
                [candidate for candidate in assets_for_revision if candidate["asset_type"] == "3dmodel"],
            )
        content_type = _content_type_for_asset(str(asset["asset_type"]), path)
        return {
            **asset,
            "payload": payload,
            "content_type": content_type,
            "size_bytes": len(payload),
            "sha256": _sha256_bytes(payload),
            "name": path.name,
        }

    def build_manifest(self, component_id: str, base_url: str) -> dict[str, Any] | None:
        self.initialize()
        component = self.get_component(component_id, include_inactive=False, released_only=True)
        if not component:
            return None
        if not component["place_enabled"]:
            raise ValueError("Component is not placeable because it is not released or required files are missing")
        with self._connect() as conn:
            assets = self._load_assets_for_revision(conn, component["revision_id"])
        manifest_assets = []
        for raw_asset in assets:
            asset = self._materialize_asset(raw_asset, assets, component)
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
                    "download_url": self.build_signed_asset_url(asset["id"], component["revision_id"], base_url),
                }
            )
        return {
            "part_id": component["id"],
            "display_name": component["name"],
            "summary": component["summary"] or component["description"],
            "license": "Managed in KiCAD Prism",
            "library_name": component["library_name"],
            "symbol_name": component["symbol_name"],
            "assets": manifest_assets,
        }

    def build_inline_bundle(self, component_id: str) -> dict[str, Any] | None:
        self.initialize()
        component = self.get_component(component_id, include_inactive=False, released_only=True)
        if not component:
            return None
        if not component["place_enabled"]:
            raise ValueError("Component is not placeable because it is not released or required files are missing")
        with self._connect() as conn:
            assets = self._load_assets_for_revision(conn, component["revision_id"])
        bundle_entries = []
        for raw_asset in assets:
            asset = self._materialize_asset(raw_asset, assets, component)
            bundle_entries.append(
                {
                    "type": asset["asset_type"],
                    "name": asset["name"] if asset["asset_type"] == "3dmodel" else asset["target_name"] or asset["name"],
                    "compression": "NONE",
                    "content": base64.b64encode(asset["payload"]).decode("ascii"),
                    "checksum": asset["sha256"],
                }
            )
        return {
            "part_id": component["id"],
            "display_name": component["name"],
            "library": component["library_name"],
            "symbol_name": component["symbol_name"],
            "compression": "NONE",
            "data": base64.b64encode(json.dumps(bundle_entries, separators=(",", ":")).encode("utf-8")).decode("ascii"),
        }

    def get_asset_by_id(self, asset_id: str, *, revision_id: str = "") -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM assets WHERE id = %s", (asset_id,)).fetchone()
            if not row:
                return None
            asset = dict(row)
            effective_revision_id = revision_id
            if not effective_revision_id:
                link = conn.execute("SELECT revision_id FROM revision_assets WHERE asset_id = %s ORDER BY updated_at DESC LIMIT 1", (asset_id,)).fetchone()
                effective_revision_id = str(link["revision_id"]) if link else ""
            assets_for_revision = self._load_assets_for_revision(conn, effective_revision_id) if effective_revision_id else [asset]
            component = None
            if effective_revision_id:
                revision = self._revision_row(conn, effective_revision_id)
                if revision:
                    component_row = self._component_row(conn, str(revision["component_id"]))
                    if component_row:
                        component = self._component_payload(conn, component_row, revision)
        return self._materialize_asset(asset, assets_for_revision, component)

    def get_preview(self, preview_id: str) -> CatalogPreview | None:
        self.initialize()
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM asset_preview_versions WHERE id = %s", (preview_id,)).fetchone()
            if not row:
                row = conn.execute("SELECT * FROM asset_previews WHERE id = %s", (preview_id,)).fetchone()
            if not row:
                return None
            component_row = conn.execute(
                """
                SELECT c.id AS component_id
                FROM revision_preview_outputs rpo
                JOIN components c ON c.current_revision_id = rpo.revision_id
                WHERE rpo.preview_id = %s
                LIMIT 1
                """,
                (preview_id,),
            ).fetchone()
            if not component_row:
                component_row = conn.execute(
                    """
                    SELECT c.id AS component_id
                    FROM revision_assets ra
                    JOIN components c ON c.current_revision_id = ra.revision_id
                    WHERE ra.asset_id = %s
                    LIMIT 1
                    """,
                    (str(row["asset_id"]),),
                ).fetchone()
            component_id = str(component_row["component_id"]) if component_row else ""
        return CatalogPreview(
            preview_id=str(row["id"]),
            component_id=component_id,
            kind=str(row["kind"]),
            status=str(row["status"]),
            content_type=str(row["content_type"]),
            file_path=str(row["file_path"]),
            generation_error=str(row["generation_error"]),
        )

    def _sign(self, message: str) -> str:
        if not settings.SESSION_SECRET:
            raise RuntimeError("SESSION_SECRET is required to sign catalog asset URLs")
        secret = settings.SESSION_SECRET.encode("utf-8")
        return base64.urlsafe_b64encode(hmac.new(secret, message.encode("utf-8"), hashlib.sha256).digest()).rstrip(b"=").decode("ascii")

    def build_signed_asset_url(self, asset_id: str, revision_id: str, base_url: str, ttl_seconds: int = 300) -> str:
        expires_at = int(time.time()) + ttl_seconds
        signature = self._sign(f"{asset_id}:{revision_id}:{expires_at}")
        return f"{base_url.rstrip('/')}/api/remote-provider/assets/{asset_id}?rev={revision_id}&exp={expires_at}&sig={signature}"

    def validate_asset_signature(self, asset_id: str, revision_id: str, expires_at: int, signature: str) -> bool:
        if expires_at <= int(time.time()):
            return False
        return hmac.compare_digest(self._sign(f"{asset_id}:{revision_id}:{expires_at}"), signature)

    def store_auth_code(self, code: str, grant: dict[str, Any], exp: int) -> None:
        self.initialize()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO oauth_auth_codes (code, grant_json, exp)
                VALUES (%s, %s, %s)
                ON CONFLICT (code) DO UPDATE SET grant_json = excluded.grant_json, exp = excluded.exp
                """,
                (code, json.dumps(grant, separators=(",", ":")), exp),
            )
            conn.commit()

    def consume_auth_code(self, code: str) -> dict[str, Any] | None:
        self.initialize()
        now = int(time.time())
        with self._connect() as conn:
            row = conn.execute("SELECT grant_json, exp FROM oauth_auth_codes WHERE code = %s", (code,)).fetchone()
            conn.execute("DELETE FROM oauth_auth_codes WHERE code = %s", (code,))
            conn.execute("DELETE FROM oauth_auth_codes WHERE exp <= %s", (now,))
            conn.commit()
        if not row or int(row["exp"]) <= now:
            return None
        return dict(_json_loads(row["grant_json"], {}))

    def add_revoked_token(self, jti: str, exp: int) -> None:
        self.initialize()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO oauth_revoked_tokens (jti, exp)
                VALUES (%s, %s)
                ON CONFLICT (jti) DO UPDATE SET exp = excluded.exp
                """,
                (jti, exp),
            )
            conn.commit()

    def is_token_revoked(self, jti: str) -> bool:
        self.initialize()
        now = int(time.time())
        with self._connect() as conn:
            conn.execute("DELETE FROM oauth_revoked_tokens WHERE exp <= %s", (now,))
            row = conn.execute("SELECT 1 FROM oauth_revoked_tokens WHERE jti = %s", (jti,)).fetchone()
            conn.commit()
        return bool(row)

    def _released_place_ready_components(self) -> list[dict[str, Any]]:
        return [
            component
            for component in self.list_components_flat(released_only=True, include_inactive=False)
            if component["place_enabled"]
        ]

    def _dbl_row_for_component(
        self,
        component: dict[str, Any],
        part_number: str,
        custom_fields: list[dict[str, Any]],
    ) -> dict[str, str]:
        symbol_asset = next((asset for asset in component["assets"] if asset["asset_type"] == "symbol"), None)
        footprint_asset = next((asset for asset in component["assets"] if asset["asset_type"] == "footprint"), None)
        lib_symbol = ""
        lib_footprint = ""
        if symbol_asset:
            lib_symbol = f"{_dbl_symbol_library_name(part_number, symbol_asset)}:{symbol_asset['target_name']}"
        if footprint_asset:
            lib_footprint = f"{footprint_asset['target_library']}:{footprint_asset['target_name']}"
        row = {
            "Part Number": part_number,
            "Part Number Nocolon": part_number,
            "Comment": component["value"] or component["name"],
            "Value": component["value"],
            "Manufacturer": component["manufacturer"],
            "Manufacturer Part Number": component["mpn"],
            "PackageDescription": component["package_name"],
            "Status": component["workflow_stage"],
            "Part Description": component["description"],
            "Datasheet": component["datasheet_url"],
            "LibSymbol": lib_symbol,
            "LibFootprint": lib_footprint,
        }
        extras = dict(component.get("extra_fields") or {})
        row.update({field["key"]: str(extras.get(field["storage_key"], "")) for field in custom_fields})
        return row

    def _collect_dbl_assets(
        self,
        component: dict[str, Any],
        part_number: str,
        export_root: Path,
        conn: Any,
    ) -> None:
        assets = self._load_assets_for_revision(conn, component["revision_id"])
        for raw_asset in assets:
            if raw_asset["asset_type"] not in {"symbol", "footprint"}:
                continue
            asset = self._materialize_asset(raw_asset, assets, component)
            if raw_asset["asset_type"] == "symbol":
                library_name = _dbl_symbol_library_name(part_number, asset)
                destination = export_root / "SchLib" / f"{library_name}.kicad_sym"
            else:
                destination = export_root / "PcbLib" / f"{asset['target_library']}.pretty" / f"{asset['target_name']}.kicad_mod"
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(asset["payload"])

    def _write_dbl_config(self, export_root: Path, *, filename: str, connection_string: str, libraries: list[dict[str, Any]]) -> None:
        payload = {
            "meta": {"version": 0},
            "name": "KiCAD Prism Database Library",
            "description": "KiCAD Prism released component database library",
            "source": {
                "type": "odbc",
                "dsn": "",
                "username": "",
                "password": "",
                "timeout_seconds": 2,
                "connection_string": connection_string,
            },
            "cache": {"max_age": 28800},
            "libraries": libraries,
        }
        (export_root / filename).write_text(json.dumps(payload, indent=4) + "\n", encoding="utf-8")

    def export_kicad_dbl_bundle(self) -> dict[str, Any]:
        # The generated KiCad database-library bundle intentionally uses SQLite as
        # an interchange artifact. Prism's runtime state is PostgreSQL-only.
        import sqlite3 as sqlite_export

        self.initialize()
        export_root = self._export_root
        if export_root.exists():
            shutil.rmtree(export_root)
        (export_root / "SchLib").mkdir(parents=True, exist_ok=True)
        (export_root / "PcbLib").mkdir(parents=True, exist_ok=True)

        components = sorted(self._released_place_ready_components(), key=lambda c: (c["category"], c["mpn"], c["id"]))
        custom_fields = [
            field for field in self.list_metadata_fields()
            if field["storage_kind"] == "extra" and field["key"] not in DBL_COMMON_COLUMNS
        ]
        custom_columns = [field["key"] for field in custom_fields]
        effective_columns = (*DBL_COMMON_COLUMNS, *custom_columns)
        db_path = export_root / "Prism.sqlite"
        used_part_numbers: set[str] = set()
        grouped_rows: dict[str, list[dict[str, str]]] = {}

        with self._connect() as catalog_conn:
            for component in components:
                base_part = _part_number_nocolon(component["mpn"] or component["value"] or component["id"])
                part_number = base_part
                counter = 2
                while part_number in used_part_numbers:
                    part_number = f"{base_part}_{counter}"
                    counter += 1
                used_part_numbers.add(part_number)
                category = component["category"] or "Uncategorized"
                grouped_rows.setdefault(category, []).append(self._dbl_row_for_component(component, part_number, custom_fields))
                self._collect_dbl_assets(component, part_number, export_root, catalog_conn)

        with sqlite_export.connect(db_path) as dbl_conn:
            for category, rows in sorted(grouped_rows.items()):
                table = _quote_identifier(category)
                columns_sql = ", ".join(f"{_quote_identifier(column)} TEXT NOT NULL DEFAULT ''" for column in effective_columns)
                dbl_conn.execute(f"CREATE TABLE {table} ({columns_sql})")
                column_names = ", ".join(_quote_identifier(column) for column in effective_columns)
                placeholders = ", ".join("?" for _ in effective_columns)
                for row in rows:
                    dbl_conn.execute(
                        f"INSERT INTO {table} ({column_names}) VALUES ({placeholders})",
                        tuple(row.get(column, "") for column in effective_columns),
                    )

        fields = [
            {
                "column": column,
                "name": column,
                "visible_on_add": False,
                "visible_in_chooser": column not in {"LibSymbol", "LibFootprint"},
                "show_name": True,
                "inherit_properties": True,
            }
            for column in effective_columns
            if column not in {"Part Number Nocolon"}
        ]
        libraries = [
            {
                "name": category,
                "table": category,
                "key": "Part Number Nocolon",
                "symbols": "LibSymbol",
                "footprints": "LibFootprint",
                "fields": fields,
            }
            for category in sorted(grouped_rows)
        ]
        self._write_dbl_config(
            export_root,
            filename="Prism_Linux.kicad_dbl",
            connection_string="Driver={SQLite3};Database=${CWD}/Prism.sqlite;",
            libraries=libraries,
        )
        self._write_dbl_config(
            export_root,
            filename="Prism_Windows.kicad_dbl",
            connection_string="Driver={SQLite3 ODBC Driver};Database=${CWD}/Prism.sqlite;",
            libraries=libraries,
        )

        symbol_libraries = sorted(path.stem for path in (export_root / "SchLib").glob("*.kicad_sym"))
        footprint_libraries = sorted({asset["target_library"] for component in components for asset in component["assets"] if asset["asset_type"] == "footprint"})
        sym_lines = [
            '(sym_lib_table',
            '  (lib (name "Prism")(type "Database")(uri "${PRISM_LIB_DIR}/Prism_Linux.kicad_dbl")(options "")(descr ""))',
        ]
        sym_lines.extend(
            f'  (lib (name "{_sexpr_string(library)}")(type "KiCad")(uri "${{PRISM_LIB_DIR}}/SchLib/{_sexpr_string(library)}.kicad_sym")(options "")(descr "")(hidden))'
            for library in symbol_libraries
        )
        sym_lines.append(")")
        (export_root / "sym-lib-table").write_text("\n".join(sym_lines) + "\n", encoding="utf-8")

        fp_lines = ["(fp_lib_table"]
        fp_lines.extend(
            f'  (lib (name "{_sexpr_string(library)}")(type "KiCad")(uri "${{PRISM_LIB_DIR}}/PcbLib/{_sexpr_string(library)}.pretty")(options "")(descr ""))'
            for library in footprint_libraries
        )
        fp_lines.append(")")
        (export_root / "fp-lib-table").write_text("\n".join(fp_lines) + "\n", encoding="utf-8")

        return {
            "export_root": str(export_root),
            "component_count": len(components),
            "category_count": len(grouped_rows),
            "sqlite_path": str(db_path),
            "linux_dbl": str(export_root / "Prism_Linux.kicad_dbl"),
            "windows_dbl": str(export_root / "Prism_Windows.kicad_dbl"),
            "sym_lib_table": str(export_root / "sym-lib-table"),
            "fp_lib_table": str(export_root / "fp-lib-table"),
        }
