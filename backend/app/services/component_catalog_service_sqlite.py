from __future__ import annotations

import base64
import csv
import hashlib
import hmac
import io
import json
import logging
import mimetypes
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import uuid
import zipfile
from collections.abc import Callable, Iterable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

from app.core.config import settings

logger = logging.getLogger(__name__)

DEFAULT_STORE_DIRNAME = ".kicad-prism"
CATALOG_DB_FILENAME = "prism.sqlite3"
DBL_EXPORT_DIRNAME = "kicad-dbl"
KLC_VALIDATION_DIRNAME = "klc"

PREVIEW_KIND_SYMBOL = "symbol"
PREVIEW_KIND_FOOTPRINT = "footprint"
PREVIEW_STATUS_READY = "ready"
PREVIEW_STATUS_FAILED = "failed"

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

_TOP_LEVEL_PROPERTY_RE = re.compile(r'^([ \t]+)\(property "([^"]+)" ')


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
    return datetime.now(UTC)


def _utc_now_iso() -> str:
    return _utc_now().isoformat()


def _slugify(value: str, default: str = "component") -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "-", (value or "").strip().lower()).strip(
        "._-"
    )
    return cleaned or default


def _sanitize_name(value: str, default: str) -> str:
    cleaned = "".join(
        ch if ch.isalnum() or ch in {"_", "-", "."} else "_"
        for ch in (value or "").strip()
    )
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


def _symbol_property_block(
    name: str, value: str, *, indent: str = "    ", hidden: bool = True
) -> str:
    hide = " hide" if hidden else ""
    child_indent = f"{indent}  "
    return (
        f'{indent}(property "{name}" "{_escape_symbol_property_value(value)}" (at 0 0 0)\n'
        f"{child_indent}(effects (font (size 1.27 1.27)){hide})\n"
        f"{indent})\n"
    )


def _symbol_metadata_fields(component: dict[str, Any] | None) -> dict[str, str]:
    if not component:
        return {label: "" for label in SYMBOL_METADATA_FIELD_ORDER}
    return {
        label: str(component.get(key) or "")
        for label, key in SYMBOL_METADATA_LABEL_TO_KEY.items()
    }


def _extract_top_level_symbol_properties(
    header: str,
) -> tuple[str, list[tuple[str, str]], str, str]:
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


def _rewrite_symbol_payload(
    payload: bytes, footprint_ref: str | None, component: dict[str, Any] | None = None
) -> bytes:
    text = payload.decode("utf-8")
    first_symbol_index = text.find('(symbol "')
    marker_index = (
        text.find('(symbol "', first_symbol_index + 1)
        if first_symbol_index != -1
        else -1
    )
    if marker_index <= 0:
        header = text
        suffix = ""
    else:
        header = text[:marker_index]
        suffix = text[marker_index:]

    prefix, extracted_blocks, trailing, indent = _extract_top_level_symbol_properties(
        header
    )
    if not extracted_blocks:
        return payload

    existing_blocks = {name: block for name, block in extracted_blocks}
    ordered_names = [name for name, _ in extracted_blocks]
    metadata_fields = _symbol_metadata_fields(component)
    custom_blocks = {
        label: _symbol_property_block(
            label, metadata_fields[label], indent=indent, hidden=label != "Value"
        )
        for label in SYMBOL_METADATA_FIELD_ORDER
    }
    if footprint_ref:
        custom_blocks["Footprint"] = _symbol_property_block(
            "Footprint", footprint_ref, indent=indent
        )
    elif "Footprint" in existing_blocks:
        custom_blocks["Footprint"] = existing_blocks["Footprint"]

    for property_name in SYMBOL_METADATA_FIELD_ORDER:
        if property_name not in ordered_names:
            ordered_names.append(property_name)
    if "Footprint" not in ordered_names:
        ordered_names.append("Footprint")

    rebuilt_blocks = [
        custom_blocks.get(property_name, existing_blocks.get(property_name, ""))
        for property_name in ordered_names
    ]
    return (prefix + "".join(rebuilt_blocks) + trailing + suffix).encode("utf-8")


def _rewrite_footprint_payload(payload: bytes, asset: dict[str, Any]) -> bytes:
    text = payload.decode("utf-8")
    prefix = _sanitize_name(settings.REMOTE_PROVIDER_LIBRARY_PREFIX, "remote").lower()
    destination = settings.REMOTE_PROVIDER_DESTINATION_DIR.rstrip("/")
    if destination in {"/RemoteLibrary", "$/RemoteLibrary"}:
        destination = "${KIPRJMOD}/RemoteLibrary"
    target_name = asset.get("target_name") or asset.get("name") or "model.step"
    file_stem = (
        target_name[:-10]
        if str(target_name).lower().endswith(".kicad_mod")
        else str(target_name)
    )
    model_path = f"{destination}/{prefix}_3d/{file_stem}.step"
    if "(model " in text:
        text = re.sub(r'\(model\s+"[^"]+"', f'(model "{model_path}"', text)
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
    normalized = (stage or "").strip()
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


def _dbl_symbol_library_name(
    part_number: str, symbol_asset: dict[str, Any] | None
) -> str:
    if not symbol_asset:
        return ""
    raw = f"Prism_{part_number}_{symbol_asset['target_library']}_{symbol_asset['target_name']}"
    return _sanitize_name(raw, "Prism_Symbol")


class ComponentCatalogService:
    def __init__(
        self, store_root: Path | None = None, database_url: str | None = None
    ) -> None:
        prism_root = Path(settings.KICAD_PROJECTS_ROOT) / DEFAULT_STORE_DIRNAME
        self._store_root = Path(store_root or prism_root / "components").resolve()
        self._db_path = self._database_path(database_url)
        default_export_root = (
            self._store_root.parent / "exports" / DBL_EXPORT_DIRNAME
            if store_root
            else prism_root / "exports" / DBL_EXPORT_DIRNAME
        )
        self._export_root = Path(
            settings.CATALOG_DBL_EXPORT_DIR or default_export_root
        ).resolve()
        self._validation_root = (
            self._store_root.parent / "validation" / KLC_VALIDATION_DIRNAME
        ).resolve()
        self._lock = threading.Lock()
        self._initialized = False
        self._kicad_cli: str | None = None
        self._category_cache: list[dict[str, Any]] | None = None
        self._category_cache_ts: float = 0.0
        self._CATEGORY_CACHE_TTL: float = 60.0
        self._fts_available = False

    def _database_path(self, database_url: str | None) -> Path:
        configured = database_url or settings.CATALOG_SQLITE_PATH
        if configured:
            if configured.startswith("sqlite:///"):
                configured = configured.removeprefix("sqlite:///")
            return Path(configured).expanduser().resolve()
        return (
            Path(settings.KICAD_PROJECTS_ROOT)
            / DEFAULT_STORE_DIRNAME
            / CATALOG_DB_FILENAME
        ).resolve()

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
        with self._lock:
            if self._initialized:
                return
            self._ensure_storage_dirs()
            self._db_path.parent.mkdir(parents=True, exist_ok=True)
            with self._connect() as conn:
                self._create_schema(conn)
                self._migrate_workflow_stages(conn)
                self._ensure_search_index(conn)
                conn.commit()
            self._initialized = True

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
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self._db_path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
        conn.execute("PRAGMA busy_timeout = 5000")
        conn.execute("PRAGMA temp_store = MEMORY")
        conn.execute("PRAGMA cache_size = -64000")
        conn.execute("PRAGMA wal_autocheckpoint = 1000")
        try:
            yield conn
        finally:
            conn.close()

    def _create_schema(self, conn: sqlite3.Connection) -> None:
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
                search_document TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(component_id, version)
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
                PRIMARY KEY(revision_id, asset_type)
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
            CREATE INDEX IF NOT EXISTS idx_assets_kind ON assets(asset_type, target_library, target_name);
            CREATE INDEX IF NOT EXISTS idx_revision_assets_revision ON revision_assets(revision_id);
            CREATE INDEX IF NOT EXISTS idx_asset_previews_asset ON asset_previews(asset_id, kind);
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

    def _ensure_search_index(self, conn: sqlite3.Connection) -> None:
        try:
            conn.executescript(
                """
                CREATE VIRTUAL TABLE IF NOT EXISTS component_revisions_fts USING fts5(
                    name,
                    value,
                    description,
                    manufacturer,
                    mpn,
                    category,
                    package_name,
                    vendor,
                    vendor_part_number,
                    sap_code,
                    search_document,
                    content='component_revisions',
                    content_rowid='rowid',
                    tokenize='unicode61'
                );

                CREATE TRIGGER IF NOT EXISTS component_revisions_fts_ai
                AFTER INSERT ON component_revisions BEGIN
                    INSERT INTO component_revisions_fts(
                        rowid, name, value, description, manufacturer, mpn, category,
                        package_name, vendor, vendor_part_number, sap_code, search_document
                    )
                    VALUES (
                        new.rowid, new.name, new.value, new.description, new.manufacturer, new.mpn,
                        new.category, new.package_name, new.vendor, new.vendor_part_number,
                        new.sap_code, new.search_document
                    );
                END;

                CREATE TRIGGER IF NOT EXISTS component_revisions_fts_ad
                AFTER DELETE ON component_revisions BEGIN
                    INSERT INTO component_revisions_fts(
                        component_revisions_fts, rowid, name, value, description, manufacturer,
                        mpn, category, package_name, vendor, vendor_part_number, sap_code,
                        search_document
                    )
                    VALUES (
                        'delete', old.rowid, old.name, old.value, old.description, old.manufacturer,
                        old.mpn, old.category, old.package_name, old.vendor, old.vendor_part_number,
                        old.sap_code, old.search_document
                    );
                END;

                CREATE TRIGGER IF NOT EXISTS component_revisions_fts_au
                AFTER UPDATE ON component_revisions BEGIN
                    INSERT INTO component_revisions_fts(
                        component_revisions_fts, rowid, name, value, description, manufacturer,
                        mpn, category, package_name, vendor, vendor_part_number, sap_code,
                        search_document
                    )
                    VALUES (
                        'delete', old.rowid, old.name, old.value, old.description, old.manufacturer,
                        old.mpn, old.category, old.package_name, old.vendor, old.vendor_part_number,
                        old.sap_code, old.search_document
                    );
                    INSERT INTO component_revisions_fts(
                        rowid, name, value, description, manufacturer, mpn, category,
                        package_name, vendor, vendor_part_number, sap_code, search_document
                    )
                    VALUES (
                        new.rowid, new.name, new.value, new.description, new.manufacturer, new.mpn,
                        new.category, new.package_name, new.vendor, new.vendor_part_number,
                        new.sap_code, new.search_document
                    );
                END;
                """
            )
            signature_row = conn.execute(
                "SELECT COUNT(1) AS count, COALESCE(MAX(updated_at), '') AS updated_at FROM component_revisions"
            ).fetchone()
            signature = f"{int(signature_row['count'])}:{signature_row['updated_at']}"
            stored = conn.execute(
                "SELECT value FROM catalog_meta WHERE key = 'component_revisions_fts_signature'"
            ).fetchone()
            if not stored or str(stored["value"]) != signature:
                conn.execute(
                    "INSERT INTO component_revisions_fts(component_revisions_fts) VALUES ('rebuild')"
                )
                conn.execute(
                    """
                    INSERT INTO catalog_meta(key, value)
                    VALUES ('component_revisions_fts_signature', ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value
                    """,
                    (signature,),
                )
            self._fts_available = True
        except sqlite3.OperationalError as exc:
            self._fts_available = False
            logger.warning(
                "SQLite FTS5 is unavailable; falling back to LIKE catalog search: %s",
                exc,
            )

    def _migrate_workflow_stages(self, conn: sqlite3.Connection) -> None:
        for old_stage, new_stage in LEGACY_WORKFLOW_STAGE_MAP.items():
            if old_stage == new_stage:
                continue
            conn.execute(
                "UPDATE component_revisions SET release_status = ? WHERE release_status = ?",
                (new_stage, old_stage),
            )

    def _resolve_kicad_cli(self) -> str | None:
        if self._kicad_cli and Path(self._kicad_cli).exists():
            return self._kicad_cli
        from app.services import kicad_cli as kicad_cli_resolver  # noqa: PLC0415

        resolved = kicad_cli_resolver.resolve_optional()
        if resolved:
            self._kicad_cli = resolved
        return resolved

    def _run_kicad_cli(self, args: list[str]) -> tuple[bool, str]:
        cli = self._resolve_kicad_cli()
        if not cli:
            return False, "kicad-cli is not available in the backend runtime"
        try:
            result = subprocess.run(
                [cli, *args], capture_output=True, text=True, timeout=60, check=False
            )
        except subprocess.TimeoutExpired:
            return False, "kicad-cli timed out after 60 seconds"
        if result.returncode != 0:
            return False, (
                result.stderr
                or result.stdout
                or f"kicad-cli exited with code {result.returncode}"
            ).strip()
        return True, ""

    def _preview_output_path(self, asset_id: str, kind: str) -> Path:
        bucket = "symbols" if kind == PREVIEW_KIND_SYMBOL else "footprints"
        return self._store_root / "previews" / bucket / f"{asset_id}.svg"

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
        return " ".join(
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

    def _normalize_metadata(self, payload: dict[str, Any]) -> dict[str, str]:
        normalized = {
            "value": str(payload.get("value") or "").strip(),
            "description": str(payload.get("description") or "").strip(),
            "datasheet_url": str(
                payload.get("datasheet_url") or payload.get("datasheet") or ""
            ).strip(),
            "manufacturer": str(payload.get("manufacturer") or "").strip(),
            "mpn": str(
                payload.get("mpn") or payload.get("manufacturer_part_number") or ""
            ).strip(),
            "category": str(payload.get("category") or "").strip(),
            "package_name": str(payload.get("package_name") or "").strip(),
            "vendor": str(payload.get("vendor") or "").strip(),
            "vendor_part_number": str(payload.get("vendor_part_number") or "").strip(),
            "mass_g": str(payload.get("mass_g") or "").strip(),
            "rqjc_c_w": str(payload.get("rqjc_c_w") or "").strip(),
            "rqjc_top_c_w": str(payload.get("rqjc_top_c_w") or "").strip(),
            "temp_max_c": str(payload.get("temp_max_c") or "").strip(),
            "temp_min_c": str(payload.get("temp_min_c") or "").strip(),
            "power_dissipation_w": str(
                payload.get("power_dissipation_w") or ""
            ).strip(),
            "rate": str(payload.get("rate") or "").strip(),
            "sap_code": str(payload.get("sap_code") or "").strip(),
        }
        for field in ("value", "description", "datasheet_url", "manufacturer", "mpn"):
            if not normalized[field]:
                raise ValueError(f"{field} is required")
        normalized["name"] = normalized["mpn"] or normalized["value"]
        normalized["summary"] = normalized["description"]
        return normalized

    def _unique_slug(self, conn: sqlite3.Connection, base: str) -> str:
        slug = _slugify(base or "component")
        candidate = slug
        counter = 2
        while conn.execute(
            "SELECT 1 FROM components WHERE slug = ?", (candidate,)
        ).fetchone():
            candidate = f"{slug}-{counter}"
            counter += 1
        return candidate

    def _component_row(
        self, conn: sqlite3.Connection, component_id: str
    ) -> dict[str, Any] | None:
        row = conn.execute(
            "SELECT * FROM components WHERE id = ?", (component_id,)
        ).fetchone()
        return dict(row) if row else None

    def _revision_row(
        self, conn: sqlite3.Connection, revision_id: str
    ) -> dict[str, Any] | None:
        row = conn.execute(
            "SELECT * FROM component_revisions WHERE id = ?", (revision_id,)
        ).fetchone()
        return dict(row) if row else None

    def _active_revision_row(
        self,
        conn: sqlite3.Connection,
        component_id: str,
        *,
        released: bool = False,
    ) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        component = self._component_row(conn, component_id)
        if not component:
            return None, None
        revision_id = (
            component["released_revision_id"]
            if released
            else component["current_revision_id"]
        )
        if not revision_id:
            return component, None
        return component, self._revision_row(conn, str(revision_id))

    def _clone_revision(
        self, conn: sqlite3.Connection, component_id: str
    ) -> dict[str, Any]:
        component, current = self._active_revision_row(
            conn, component_id, released=False
        )
        if not component or not current:
            raise ValueError("Component not found")
        if _normalize_workflow_stage(str(current["release_status"])) == "open":
            return current

        now = _utc_now_iso()
        next_version = (
            int(
                conn.execute(
                    "SELECT COALESCE(MAX(version), 0) AS max_version FROM component_revisions WHERE component_id = ?",
                    (component_id,),
                ).fetchone()["max_version"]
            )
            + 1
        )
        revision_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO component_revisions (
                id, component_id, version, release_status, name, value, description, datasheet_url,
                manufacturer, mpn, category, package_name, vendor, vendor_part_number, mass_g,
                rqjc_c_w, rqjc_top_c_w, temp_max_c, temp_min_c, power_dissipation_w, rate, sap_code,
                summary, keywords, search_document, created_at, updated_at
            )
            SELECT
                ?, component_id, ?, 'open', name, value, description, datasheet_url,
                manufacturer, mpn, category, package_name, vendor, vendor_part_number, mass_g,
                rqjc_c_w, rqjc_top_c_w, temp_max_c, temp_min_c, power_dissipation_w, rate, sap_code,
                summary, keywords, search_document, ?, ?
            FROM component_revisions
            WHERE id = ?
            """,
            (revision_id, next_version, now, now, current["id"]),
        )
        conn.execute(
            """
            INSERT INTO revision_assets (revision_id, asset_type, asset_id, required, created_at, updated_at)
            SELECT ?, asset_type, asset_id, required, ?, ?
            FROM revision_assets
            WHERE revision_id = ?
            """,
            (revision_id, now, now, current["id"]),
        )
        conn.execute(
            "UPDATE components SET current_revision_id = ?, updated_at = ? WHERE id = ?",
            (revision_id, now, component_id),
        )
        return self._revision_row(conn, revision_id) or {}

    def _load_assets_for_revision(
        self, conn: sqlite3.Connection, revision_id: str
    ) -> list[dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT a.*, ra.required
            FROM revision_assets ra
            JOIN assets a ON a.id = ra.asset_id
            WHERE ra.revision_id = ?
            ORDER BY CASE a.asset_type
                WHEN 'symbol' THEN 1
                WHEN 'footprint' THEN 2
                WHEN '3dmodel' THEN 3
                WHEN 'spice' THEN 4
                ELSE 99
            END, a.target_library, a.target_name
            """,
            (revision_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def _load_previews_for_assets(
        self, conn: sqlite3.Connection, asset_ids: list[str]
    ) -> list[dict[str, Any]]:
        if not asset_ids:
            return []
        placeholders = ",".join("?" for _ in asset_ids)
        rows = conn.execute(
            f"SELECT * FROM asset_previews WHERE asset_id IN ({placeholders}) ORDER BY kind, updated_at DESC",  # noqa: S608
            tuple(asset_ids),
        ).fetchall()
        return [dict(row) for row in rows]

    def _latest_validation_runs_for_assets(
        self, conn: sqlite3.Connection, asset_ids: list[str]
    ) -> dict[str, dict[str, Any]]:
        if not asset_ids:
            return {}
        placeholders = ",".join("?" for _ in asset_ids)
        rows = conn.execute(
            f"""
            SELECT *
            FROM asset_validation_runs
            WHERE asset_id IN ({placeholders})
            ORDER BY asset_id, finished_at DESC, created_at DESC
            """,  # noqa: S608
            tuple(asset_ids),
        ).fetchall()
        latest: dict[str, dict[str, Any]] = {}
        for row in rows:
            asset_id = str(row["asset_id"])
            if asset_id not in latest:
                latest[asset_id] = dict(row)
        return latest

    def _validation_run_payload(
        self,
        row: dict[str, Any],
        *,
        include_findings: bool = False,
        conn: sqlite3.Connection | None = None,
    ) -> dict[str, Any]:
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

    def _validation_findings_payload(
        self, conn: sqlite3.Connection, run_id: str
    ) -> list[dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT *
            FROM asset_validation_findings
            WHERE run_id = ?
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
        conn: sqlite3.Connection,
        revision_id: str,
        assets: list[dict[str, Any]],
    ) -> dict[str, Any]:
        relevant_assets = [
            asset
            for asset in assets
            if str(asset["asset_type"]) in {"symbol", "footprint"}
        ]
        latest = self._latest_validation_runs_for_assets(
            conn, [str(asset["id"]) for asset in relevant_assets]
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
        present_required = {
            str(asset["asset_type"])
            for asset in relevant_assets
            if bool(asset.get("required", True))
        }
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

    def _availability(
        self, assets: list[dict[str, Any]], release_status: str, is_active: bool
    ) -> tuple[str, list[str], bool]:
        asset_types = {str(asset["asset_type"]) for asset in assets}
        missing = [
            asset_type
            for asset_type in PLACE_REQUIRED_ASSET_TYPES
            if asset_type not in asset_types
        ]
        if missing and len(missing) == len(PLACE_REQUIRED_ASSET_TYPES):
            state = STATE_METADATA_ONLY
        elif missing:
            state = STATE_FILES_PARTIAL
        else:
            state = STATE_PLACE_READY
        place_enabled = (
            is_active and not missing and _release_allows_remote(release_status)
        )
        return state, missing, place_enabled

    def _component_payload(
        self,
        conn: sqlite3.Connection,
        component_row: dict[str, Any],
        revision_row: dict[str, Any],
        *,
        released_view: bool = False,
        preloaded_assets: list[dict[str, Any]] | None = None,
        preloaded_previews: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        assets = (
            preloaded_assets
            if preloaded_assets is not None
            else self._load_assets_for_revision(conn, str(revision_row["id"]))
        )
        previews = (
            preloaded_previews
            if preloaded_previews is not None
            else self._load_previews_for_assets(
                conn, [str(asset["id"]) for asset in assets]
            )
        )
        availability_state, missing_assets, place_enabled = self._availability(
            assets,
            str(revision_row["release_status"]),
            bool(component_row["is_active"]),
        )
        symbol_asset = next(
            (asset for asset in assets if asset["asset_type"] == "symbol"), None
        )
        validation_summary = self._component_validation_summary(
            conn, str(revision_row["id"]), assets
        )
        preview_payloads = [
            {
                "id": str(preview["id"]),
                "kind": str(preview["kind"]),
                "status": str(preview["status"]),
                "content_type": str(preview["content_type"]),
                "file_path": str(preview["file_path"]),
                "generation_error": str(preview["generation_error"]),
                "updated_at": str(preview["updated_at"] or ""),
            }
            for preview in previews
        ]
        keywords = _json_loads(revision_row.get("keywords"), [])
        return {
            "id": str(component_row["id"]),
            "slug": str(component_row["slug"]),
            "external_source": str(component_row["external_source"]),
            "external_id": str(component_row["external_id"]),
            "external_workflow_source": str(
                component_row.get("external_workflow_source", "")
            ),
            "external_workflow_id": str(component_row.get("external_workflow_id", "")),
            "external_workflow_url": str(
                component_row.get("external_workflow_url", "")
            ),
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
            "version": f"{int(revision_row['version'])}.0.0",
            "summary": str(revision_row["summary"]),
            "library_name": str(symbol_asset["target_library"]) if symbol_asset else "",
            "symbol_name": str(symbol_asset["target_name"]) if symbol_asset else "",
            "release_status": _normalize_workflow_stage(
                str(revision_row["release_status"])
            ),
            "workflow_stage": _normalize_workflow_stage(
                str(revision_row["release_status"])
            ),
            "released_view": released_view,
            "assets": [
                {
                    "id": str(asset["id"]),
                    "asset_type": str(asset["asset_type"]),
                    "name": str(asset["name"]),
                    "target_library": str(asset["target_library"]),
                    "target_name": str(asset["target_name"]),
                    "content_type": str(asset["content_type"]),
                    "required": bool(asset["required"]),
                }
                for asset in assets
            ],
            "previews": preview_payloads,
            "validation": validation_summary,
        }

    def _component_summary_payload(
        self,
        component_row: dict[str, Any],
        revision_row: dict[str, Any],
        assets: list[dict[str, Any]],
        *,
        released_view: bool = False,
    ) -> dict[str, Any]:
        availability_state, missing_assets, place_enabled = self._availability(
            assets,
            str(revision_row["release_status"]),
            bool(component_row["is_active"]),
        )
        symbol_asset = next(
            (asset for asset in assets if asset["asset_type"] == "symbol"), None
        )
        # Lightweight payloads are used by the KiCad remote panel; avoid validation lookups on search paths.
        validation_summary = {
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
            "name": str(revision_row["name"]),
            "manufacturer": str(revision_row["manufacturer"]),
            "mpn": str(revision_row["mpn"]),
            "description": str(revision_row["description"]),
            "package_name": str(revision_row["package_name"]),
            "category": str(revision_row["category"]),
            "datasheet_url": str(revision_row["datasheet_url"]),
            "summary": str(revision_row["summary"]),
            "version": f"{int(revision_row['version'])}.0.0",
            "library_name": str(symbol_asset["target_library"]) if symbol_asset else "",
            "symbol_name": str(symbol_asset["target_name"]) if symbol_asset else "",
            "availability_state": availability_state,
            "missing_assets": missing_assets,
            "place_enabled": place_enabled,
            "stock_quantity": float(component_row["stock_quantity"]),
            "stock_uom": str(component_row["stock_uom"]),
            "inventory_status": str(component_row["inventory_status"]),
            "release_status": _normalize_workflow_stage(
                str(revision_row["release_status"])
            ),
            "workflow_stage": _normalize_workflow_stage(
                str(revision_row["release_status"])
            ),
            "released_view": released_view,
            "revision_id": str(revision_row["id"]),
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
        revision_join_column = (
            "released_revision_id" if released_only else "current_revision_id"
        )
        filters: list[str] = []
        params: list[Any] = []

        if not include_inactive:
            filters.append("c.is_active = 1")
        if source:
            filters.append("c.source = ?")
            params.append(source)
        if category is not None:
            filters.append(f"{revision_ref}.category = ?")
            params.append(category)
        normalized_workflow_stage = _normalize_workflow_stage(workflow_stage or "")
        if normalized_workflow_stage:
            if normalized_workflow_stage not in WORKFLOW_STAGES:
                raise ValueError("Unsupported workflow stage")
            filters.append(f"{revision_ref}.release_status = ?")
            params.append(normalized_workflow_stage)
        if availability_state:
            symbol_exists = (
                f"EXISTS (SELECT 1 FROM revision_assets ra_symbol "  # noqa: S608
                f"WHERE ra_symbol.revision_id = {revision_ref}.id AND ra_symbol.asset_type = 'symbol')"
            )
            footprint_exists = (
                f"EXISTS (SELECT 1 FROM revision_assets ra_footprint "  # noqa: S608
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
                f"EXISTS (SELECT 1 FROM revision_assets ra_validation_any "  # noqa: S608
                f"JOIN assets asset_validation_any ON asset_validation_any.id = ra_validation_any.asset_id "
                f"WHERE ra_validation_any.revision_id = {revision_ref}.id "
                f"AND asset_validation_any.asset_type IN ('symbol', 'footprint'))"
            )

            def latest_status_exists(status: str, suffix: str) -> str:
                return (
                    f"EXISTS (SELECT 1 FROM revision_assets ra_validation_{suffix} "  # noqa: S608
                    f"JOIN assets asset_validation_{suffix} ON asset_validation_{suffix}.id = ra_validation_{suffix}.asset_id "
                    f"WHERE ra_validation_{suffix}.revision_id = {revision_ref}.id "
                    f"AND asset_validation_{suffix}.asset_type IN ('symbol', 'footprint') "
                    f"AND COALESCE(("
                    f"SELECT avr_validation_{suffix}.status "
                    f"FROM asset_validation_runs avr_validation_{suffix} "
                    f"WHERE avr_validation_{suffix}.asset_id = asset_validation_{suffix}.id "
                    f"ORDER BY avr_validation_{suffix}.finished_at DESC, avr_validation_{suffix}.created_at DESC "
                    f"LIMIT 1"
                    f"), '{VALIDATION_STATUS_NOT_RUN}') = '{status}')"
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
                filters.append(
                    f"NOT {failed_exists} AND NOT {warning_exists} AND {skipped_exists}"
                )
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
        fts_query = (
            self._fts_query(query_text) if query_text and self._fts_available else ""
        )
        if fts_query:
            filters.append(
                f"{revision_ref}.rowid IN ("  # noqa: S608
                "SELECT rowid FROM component_revisions_fts "
                "WHERE component_revisions_fts MATCH ?"
                ")"
            )
            params.append(fts_query)
        elif query_text:
            filters.append(f"LOWER({revision_ref}.search_document) LIKE LOWER(?)")
            params.append(f"%{query_text}%")
        where_sql = f"WHERE {' AND '.join(filters)}" if filters else ""
        sort_columns = {
            "name": f"{revision_ref}.name",
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
                f"EXISTS (SELECT 1 FROM revision_assets ra_symbol_sort "  # noqa: S608
                f"WHERE ra_symbol_sort.revision_id = {revision_ref}.id AND ra_symbol_sort.asset_type = 'symbol')"
            )
            footprint_exists = (
                f"EXISTS (SELECT 1 FROM revision_assets ra_footprint_sort "  # noqa: S608
                f"WHERE ra_footprint_sort.revision_id = {revision_ref}.id AND ra_footprint_sort.asset_type = 'footprint')"
            )
            sort_column = f"CASE WHEN {symbol_exists} AND {footprint_exists} THEN 0 WHEN ({symbol_exists}) <> ({footprint_exists}) THEN 1 ELSE 2 END"

        if sort_column:
            order_sql = f"ORDER BY {sort_column} {sort_direction}, {revision_ref}.updated_at DESC"
            order_params = []
        elif query_text:
            order_sql = (
                f"ORDER BY CASE "
                f"WHEN LOWER({revision_ref}.mpn) = LOWER(?) THEN 0 "
                f"WHEN LOWER({revision_ref}.mpn) LIKE LOWER(?) THEN 1 "
                f"WHEN LOWER({revision_ref}.name) LIKE LOWER(?) THEN 2 "
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
                    """,  # noqa: S608
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
                LIMIT ? OFFSET ?
                """,  # noqa: S608
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
                placeholders = ",".join("?" for _ in revision_ids)
                revision_rows = conn.execute(
                    f"SELECT * FROM component_revisions WHERE id IN ({placeholders})",  # noqa: S608
                    tuple(revision_ids),
                ).fetchall()
                revisions_by_id = {
                    str(revision["id"]): dict(revision) for revision in revision_rows
                }

            parsed_rows = []
            for component_row, revision_id in row_pairs:
                revision = revisions_by_id.get(revision_id)
                if revision:
                    parsed_rows.append((component_row, revision))

            revision_ids = [str(rev["id"]) for _, rev in parsed_rows]
            assets_by_revision: dict[str, list[dict[str, Any]]] = {}
            all_asset_ids: list[str] = []
            if revision_ids:
                placeholders = ",".join("?" for _ in revision_ids)
                all_assets_rows = [
                    dict(r)
                    for r in conn.execute(
                        f"""
                        SELECT a.*, ra.required, ra.revision_id
                        FROM revision_assets ra
                        JOIN assets a ON a.id = ra.asset_id
                        WHERE ra.revision_id IN ({placeholders})
                        ORDER BY CASE a.asset_type
                            WHEN 'symbol' THEN 1 WHEN 'footprint' THEN 2
                            WHEN '3dmodel' THEN 3 WHEN 'spice' THEN 4 ELSE 99
                        END, a.target_library, a.target_name
                        """,  # noqa: S608
                        tuple(revision_ids),
                    ).fetchall()
                ]
                for asset_row in all_assets_rows:
                    rev_id = str(asset_row.pop("revision_id"))
                    assets_by_revision.setdefault(rev_id, []).append(asset_row)
                    all_asset_ids.append(str(asset_row["id"]))

            previews_by_asset: dict[str, list[dict[str, Any]]] = {}
            if not lightweight:
                for preview_row in self._load_previews_for_assets(conn, all_asset_ids):
                    previews_by_asset.setdefault(
                        str(preview_row["asset_id"]), []
                    ).append(preview_row)

            items = []
            for component_row, revision_row in parsed_rows:
                rev_assets = assets_by_revision.get(str(revision_row["id"]), [])
                if lightweight:
                    items.append(
                        self._component_summary_payload(
                            component_row,
                            revision_row,
                            rev_assets,
                            released_view=released_only,
                        )
                    )
                    continue
                rev_previews: list[dict[str, Any]] = []
                for asset in rev_assets:
                    rev_previews.extend(previews_by_asset.get(str(asset["id"]), []))
                items.append(
                    self._component_payload(
                        conn,
                        component_row,
                        revision_row,
                        released_view=released_only,
                        preloaded_assets=rev_assets,
                        preloaded_previews=rev_previews,
                    )
                )

        pages = max(1, (total + page_size - 1) // page_size)
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": pages,
        }

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
        return {
            "stages": [
                {"workflow_stage": stage, "count": counts[stage]}
                for stage in WORKFLOW_STAGES
            ]
        }

    def search_components(
        self, query: str, *, page: int = 1, page_size: int = 50
    ) -> dict[str, Any]:
        return self.list_components(
            query=query,
            include_inactive=False,
            page=page,
            page_size=page_size,
            released_only=True,
            lightweight=True,
        )

    def list_categories(self) -> list[dict[str, Any]]:
        self.initialize()
        now = time.monotonic()
        if (
            self._category_cache is not None
            and (now - self._category_cache_ts) < self._CATEGORY_CACHE_TTL
        ):
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
        result = [
            {"name": str(row["name"] or ""), "count": int(row["count"])} for row in rows
        ]
        self._category_cache = result
        self._category_cache_ts = now
        return result

    def get_component(
        self,
        component_id: str,
        *,
        include_inactive: bool = True,
        released_only: bool = False,
    ) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            component, revision = self._active_revision_row(
                conn, component_id, released=released_only
            )
            if not component or not revision:
                return None
            if not include_inactive and not component["is_active"]:
                return None
            if (
                released_only
                and _normalize_workflow_stage(str(revision["release_status"]))
                != "released"
            ):
                return None
            return self._component_payload(
                conn, component, revision, released_view=released_only
            )

    def create_manual_component(self, **payload: Any) -> dict[str, Any]:
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
            )
            conn.commit()
        return self.get_component(component_id) or {}

    def _upsert_component_metadata_row(
        self,
        conn: sqlite3.Connection,
        *,
        component_id: str,
        metadata: dict[str, str],
        now: str,
        existing_component_id: str | None,
    ) -> tuple[str, str]:
        if existing_component_id:
            revision = self._clone_revision(conn, existing_component_id)
            conn.execute(
                """
                UPDATE component_revisions
                SET name = ?, value = ?, description = ?, datasheet_url = ?, manufacturer = ?, mpn = ?,
                    category = ?, package_name = ?, vendor = ?, vendor_part_number = ?, mass_g = ?,
                    rqjc_c_w = ?, rqjc_top_c_w = ?, temp_max_c = ?, temp_min_c = ?,
                    power_dissipation_w = ?, rate = ?, sap_code = ?, summary = ?, keywords = ?,
                    search_document = ?, updated_at = ?
                WHERE id = ?
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
                    self._search_document(metadata),
                    now,
                    revision["id"],
                ),
            )
            conn.execute(
                "UPDATE components SET updated_at = ? WHERE id = ?",
                (now, existing_component_id),
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
            VALUES (?, ?, ?, '', '', 0, '', '', '', '', '', NULL, 1, ?, '', ?, ?)
            """,
            (component_id, slug, SOURCE_MANUAL, revision_id, now, now),
        )
        conn.execute(
            """
            INSERT INTO component_revisions (
                id, component_id, version, release_status, name, value, description, datasheet_url,
                manufacturer, mpn, category, package_name, vendor, vendor_part_number, mass_g,
                rqjc_c_w, rqjc_top_c_w, temp_max_c, temp_min_c, power_dissipation_w, rate, sap_code,
                summary, keywords, search_document, created_at, updated_at
            )
            VALUES (
                ?, ?, 1, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?
            )
            """,
            (
                revision_id,
                component_id,
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
                self._search_document(metadata),
                now,
                now,
            ),
        )
        return component_id, revision_id

    def update_component_metadata(
        self, component_id: str, updates: dict[str, Any]
    ) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            component = self._component_row(conn, component_id)
            if not component:
                return None
            revision = self._clone_revision(conn, component_id)
            merged = {**revision}
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
            metadata = self._normalize_metadata(merged)
            now = _utc_now_iso()
            self._upsert_component_metadata_row(
                conn,
                component_id=component_id,
                metadata=metadata,
                now=now,
                existing_component_id=component_id,
            )
            conn.commit()
        return self.get_component(component_id)

    def _normalize_csv_row(self, row: dict[str, str], row_index: int) -> dict[str, str]:
        normalized = {
            (_slugify(key, key).replace("-", "_")): (value or "").strip()
            for key, value in row.items()
        }
        for required in CSV_REQUIRED_COLUMNS:
            if not normalized.get(required, "").strip():
                raise ValueError(
                    f"Row {row_index}: missing required column '{required}'"
                )
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
                rows.append(
                    self._normalize_csv_row(
                        {str(k): str(v or "") for k, v in row.items()}, index
                    )
                )
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
                    WHERE cr.mpn = ?
                    LIMIT 1
                    """,
                    (mpn,),
                ).fetchone()
                asset_links = []
                if row.get("symbol_file_path"):
                    asset_links.append(
                        (
                            "symbol",
                            row["symbol_file_path"],
                            row.get("symbol_target_library", ""),
                            row.get("symbol_target_name", ""),
                        )
                    )
                if row.get("footprint_file_path"):
                    asset_links.append(
                        (
                            "footprint",
                            row["footprint_file_path"],
                            row.get("footprint_target_library", ""),
                            row.get("footprint_target_name", ""),
                        )
                    )
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
                    self._link_asset_to_revision(
                        conn,
                        revision_id,
                        asset,
                        required=asset_type in PLACE_REQUIRED_ASSET_TYPES,
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
                mpn = str(
                    row.get("manufacturer_part_number") or row.get("mpn") or ""
                ).strip()
                if not mpn:
                    errors.append(f"Row {index}: missing manufacturer_part_number")
                    continue
                component = conn.execute(
                    """
                    SELECT c.id
                    FROM components c
                    JOIN component_revisions cr ON cr.id = c.current_revision_id
                    WHERE cr.mpn = ?
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
                    SET stock_quantity = ?, stock_uom = ?, inventory_status = ?, serial_number = ?,
                        lot_number = ?, pedigree = ?, last_synced_at = ?, updated_at = ?
                    WHERE id = ?
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
        return sorted(
            path.relative_to(root).as_posix() for path in paths if path.is_file()
        )

    def _resolve_component_for_edit(
        self, conn: sqlite3.Connection, component_id: str
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        component = self._component_row(conn, component_id)
        if not component:
            raise ValueError("Component not found")
        revision = self._clone_revision(conn, component_id)
        return component, revision

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
        return f"(kicad_symbol_lib (version {version}) (generator {generator})\n  {all_blocks_text}\n)\n".encode()

    def _write_canonical_file(self, destination: Path, payload: bytes) -> Path:
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            existing = destination.read_bytes()
            if existing == payload:
                return destination
            raise ValueError(f"Canonical asset conflict at {destination}")
        destination.write_bytes(payload)
        return destination

    def _symbol_destination(self, target_library: str, target_name: str) -> Path:
        safe_library = _sanitize_name(target_library, "Prism_Symbols")
        safe_name = _sanitize_name(target_name, "symbol")
        return self._store_root / "symbols" / safe_library / f"{safe_name}.kicad_sym"

    def _footprint_destination(self, target_library: str, target_name: str) -> Path:
        safe_library = _sanitize_name(target_library, "Prism_Footprints")
        safe_name = _sanitize_name(target_name, "footprint")
        return (
            self._store_root
            / "footprints"
            / f"{safe_library}.pretty"
            / f"{safe_name}.kicad_mod"
        )

    def _aux_destination(
        self, asset_type: str, target_library: str, upload_name: str
    ) -> Path:
        safe_library = _sanitize_name(target_library, "Prism_Assets")
        safe_name = _sanitize_name(Path(upload_name).name, f"{asset_type}.bin")
        return self._asset_root(asset_type) / safe_library / safe_name

    def _asset_by_key(
        self,
        conn: sqlite3.Connection,
        asset_type: str,
        canonical_path: str,
        target_name: str,
    ) -> dict[str, Any] | None:
        row = conn.execute(
            "SELECT * FROM assets WHERE asset_type = ? AND canonical_path = ? AND target_name = ?",
            (asset_type, canonical_path, target_name),
        ).fetchone()
        return dict(row) if row else None

    def _asset_by_signature(
        self,
        conn: sqlite3.Connection,
        asset_type: str,
        sha256: str,
        target_library: str,
        target_name: str,
    ) -> dict[str, Any] | None:
        row = conn.execute(
            """
            SELECT * FROM assets
            WHERE asset_type = ? AND sha256 = ? AND target_library = ? AND target_name = ?
            LIMIT 1
            """,
            (asset_type, sha256, target_library, target_name),
        ).fetchone()
        return dict(row) if row else None

    def _register_asset(
        self,
        conn: sqlite3.Connection,
        *,
        asset_type: str,
        canonical_path: Path,
        target_library: str,
        target_name: str,
        source_group: str = "",
    ) -> dict[str, Any]:
        canonical_path = canonical_path.resolve()
        existing = self._asset_by_key(
            conn, asset_type, str(canonical_path), target_name
        )
        if existing:
            return existing
        sha256 = _sha256_file(canonical_path)
        same_content = self._asset_by_signature(
            conn, asset_type, sha256, target_library, target_name
        )
        if same_content:
            return same_content
        now = _utc_now_iso()
        asset_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO assets (
                id, asset_type, name, canonical_path, target_library, target_name, source_group,
                sha256, size_bytes, content_type, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        row = conn.execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchone()
        return dict(row)

    def _upsert_asset_preview(
        self,
        conn: sqlite3.Connection,
        *,
        asset_id: str,
        kind: str,
        status: str,
        file_path: str = "",
        generation_error: str = "",
    ) -> None:
        now = _utc_now_iso()
        existing = conn.execute(
            "SELECT id FROM asset_previews WHERE asset_id = ? AND kind = ?",
            (asset_id, kind),
        ).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE asset_previews
                SET status = ?, content_type = 'image/svg+xml', file_path = ?, generation_error = ?, updated_at = ?
                WHERE id = ?
                """,
                (status, file_path, generation_error, now, existing["id"]),
            )
            return
        conn.execute(
            """
            INSERT INTO asset_previews (id, asset_id, kind, status, content_type, file_path, generation_error, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'image/svg+xml', ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                asset_id,
                kind,
                status,
                file_path,
                generation_error,
                now,
                now,
            ),
        )

    def _generate_symbol_preview(self, asset: dict[str, Any]) -> tuple[str, str]:
        with tempfile.TemporaryDirectory(prefix="prism_symsvg_") as tmp_dir:
            success, error = self._run_kicad_cli(
                [
                    "sym",
                    "export",
                    "svg",
                    str(asset["canonical_path"]),
                    "--output",
                    tmp_dir,
                    "--symbol",
                    str(asset["target_name"]),
                ]
            )
            if not success:
                return PREVIEW_STATUS_FAILED, error
            expected = Path(tmp_dir) / f"{asset['target_name']}_unit1.svg"
            if not expected.is_file():
                candidates = sorted(Path(tmp_dir).glob("*.svg"))
                if not candidates:
                    return (
                        PREVIEW_STATUS_FAILED,
                        "symbol preview export did not produce an SVG",
                    )
                expected = candidates[0]
            destination = self._preview_output_path(
                str(asset["id"]), PREVIEW_KIND_SYMBOL
            )
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(expected, destination)
            return PREVIEW_STATUS_READY, str(destination)

    def _generate_footprint_preview(self, asset: dict[str, Any]) -> tuple[str, str]:
        with tempfile.TemporaryDirectory(prefix="prism_fpsvg_") as tmp_dir:
            footprint_source = Path(str(asset["canonical_path"]))
            target_name = str(asset["target_name"])
            isolated_library = Path(tmp_dir) / "isolated.pretty"
            isolated_library.mkdir(parents=True, exist_ok=True)
            isolated_footprint = (
                isolated_library
                / f"{_sanitize_name(target_name, footprint_source.stem)}.kicad_mod"
            )
            shutil.copy2(footprint_source, isolated_footprint)
            success, error = self._run_kicad_cli(
                [
                    "fp",
                    "export",
                    "svg",
                    "--output",
                    tmp_dir,
                    "--footprint",
                    target_name,
                    str(isolated_library),
                ]
            )
            if not success:
                return PREVIEW_STATUS_FAILED, error
            expected = Path(tmp_dir) / f"{target_name}.svg"
            if not expected.is_file():
                candidates = sorted(Path(tmp_dir).glob("*.svg"))
                if not candidates:
                    return (
                        PREVIEW_STATUS_FAILED,
                        "footprint preview export did not produce an SVG",
                    )
                expected = candidates[0]
            destination = self._preview_output_path(
                str(asset["id"]), PREVIEW_KIND_FOOTPRINT
            )
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(expected, destination)
            return PREVIEW_STATUS_READY, str(destination)

    def _ensure_asset_preview(
        self, conn: sqlite3.Connection, asset: dict[str, Any]
    ) -> None:
        asset_type = str(asset["asset_type"])
        if asset_type == "symbol":
            status, result = self._generate_symbol_preview(asset)
            self._upsert_asset_preview(
                conn,
                asset_id=str(asset["id"]),
                kind=PREVIEW_KIND_SYMBOL,
                status=status,
                file_path=result if status == PREVIEW_STATUS_READY else "",
                generation_error="" if status == PREVIEW_STATUS_READY else result,
            )
        elif asset_type == "footprint":
            status, result = self._generate_footprint_preview(asset)
            self._upsert_asset_preview(
                conn,
                asset_id=str(asset["id"]),
                kind=PREVIEW_KIND_FOOTPRINT,
                status=status,
                file_path=result if status == PREVIEW_STATUS_READY else "",
                generation_error="" if status == PREVIEW_STATUS_READY else result,
            )

    def _has_ready_preview(
        self, conn: sqlite3.Connection, asset_id: str, kind: str
    ) -> bool:
        row = conn.execute(
            """
            SELECT file_path
            FROM asset_previews
            WHERE asset_id = ? AND kind = ? AND status = ?
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (asset_id, kind, PREVIEW_STATUS_READY),
        ).fetchone()
        if not row:
            return False
        file_path = str(row["file_path"] or "")
        return bool(file_path and Path(file_path).is_file())

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
            rows = [
                dict(row)
                for row in conn.execute(
                    """
                    SELECT c.id AS component_id, a.*, ra.required
                    FROM components c
                    JOIN component_revisions cr ON cr.id = c.current_revision_id
                    JOIN revision_assets ra ON ra.revision_id = cr.id
                    JOIN assets a ON a.id = ra.asset_id
                    WHERE c.is_active = 1 AND a.asset_type IN ('symbol', 'footprint')
                    ORDER BY c.updated_at DESC, a.asset_type, a.target_library, a.target_name
                    """
                ).fetchall()
            ]
            counts["total_assets"] = len(rows)
            if progress_callback:
                progress_callback(counts.copy())

            for row in rows:
                asset = dict(row)
                component_id = str(asset.pop("component_id"))
                asset_id = str(asset["id"])
                kind = (
                    PREVIEW_KIND_SYMBOL
                    if asset["asset_type"] == "symbol"
                    else PREVIEW_KIND_FOOTPRINT
                )
                counts["scanned_assets"] += 1
                try:
                    if self._has_ready_preview(conn, asset_id, kind):
                        counts["skipped_ready"] += 1
                    else:
                        self._ensure_asset_preview(conn, asset)
                        preview = conn.execute(
                            """
                            SELECT status, generation_error
                            FROM asset_previews
                            WHERE asset_id = ? AND kind = ?
                            ORDER BY updated_at DESC
                            LIMIT 1
                            """,
                            (asset_id, kind),
                        ).fetchone()
                        if preview and str(preview["status"]) == PREVIEW_STATUS_READY:
                            counts["generated"] += 1
                        else:
                            counts["failed"] += 1
                            counts["errors"].append(
                                {
                                    "component_id": component_id,
                                    "asset_id": asset_id,
                                    "asset_type": str(asset["asset_type"]),
                                    "error": str(
                                        preview["generation_error"]
                                        if preview
                                        else "Preview generation failed"
                                    ),
                                }
                            )
                    conn.commit()
                except Exception as exc:
                    conn.rollback()
                    counts["failed"] += 1
                    counts["errors"].append(
                        {
                            "component_id": component_id,
                            "asset_id": asset_id,
                            "asset_type": str(asset["asset_type"]),
                            "error": str(exc),
                        }
                    )
                if progress_callback:
                    progress_callback(counts.copy())
        return counts

    def _link_asset_to_revision(
        self,
        conn: sqlite3.Connection,
        revision_id: str,
        asset: dict[str, Any],
        *,
        required: bool,
    ) -> None:
        now = _utc_now_iso()
        conn.execute(
            """
            INSERT INTO revision_assets (revision_id, asset_type, asset_id, required, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (revision_id, asset_type)
            DO UPDATE SET asset_id = excluded.asset_id, required = excluded.required, updated_at = excluded.updated_at
            """,
            (
                revision_id,
                asset["asset_type"],
                asset["id"],
                1 if required else 0,
                now,
                now,
            ),
        )

    def _resolve_existing_asset(
        self,
        conn: sqlite3.Connection,
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
            raise ValueError(
                "Linked asset must already live inside the Prism canonical store"
            ) from exc

        if asset_type == "symbol":
            text = path.read_text(encoding="utf-8", errors="ignore")
            discovered = _discover_symbol_names_in_text(text)
            if not target_name:
                if len(discovered) != 1:
                    raise ValueError(
                        "Symbol file contains multiple symbols; target_name is required"
                    )
                target_name = discovered[0]
            if not target_library:
                target_library = path.parent.name
            if len(discovered) != 1 or discovered[0] != target_name:
                payload = self._single_symbol_payload(text, target_name)
                canonical = self._write_canonical_file(
                    self._symbol_destination(target_library, target_name), payload
                )
            else:
                canonical = path
        elif asset_type == "footprint":
            if path.suffix.lower() != ".kicad_mod":
                raise ValueError("Footprint links must point to a .kicad_mod file")
            target_name = (
                target_name
                or _discover_footprint_name_in_text(
                    path.read_text(encoding="utf-8", errors="ignore")
                )
                or path.stem
            )
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
        self._ensure_asset_preview(conn, asset)
        return asset

    def link_library_asset(
        self,
        component_id: str,
        asset_type: str,
        file_path_rel: str,
        target_library: str,
        target_name: str,
    ) -> dict[str, Any]:
        if asset_type not in SUPPORTED_ASSET_TYPES:
            raise ValueError("Unsupported asset type")
        self.initialize()
        with self._connect() as conn:
            _, revision = self._resolve_component_for_edit(conn, component_id)
            asset = self._resolve_existing_asset(
                conn,
                asset_type=asset_type,
                file_path=file_path_rel,
                target_library=target_library,
                target_name=target_name,
            )
            self._link_asset_to_revision(
                conn,
                revision["id"],
                asset,
                required=asset_type in PLACE_REQUIRED_ASSET_TYPES,
            )
            conn.commit()
        return {"component": self.get_component(component_id)}

    def _normalize_symbol_upload(self, upload_name: str, payload: bytes) -> bytes:
        with tempfile.TemporaryDirectory(prefix="prism_sym_import_") as tmp_dir:
            input_path = Path(tmp_dir) / _sanitize_name(
                upload_name or "uploaded", "uploaded.kicad_sym"
            )
            output_path = Path(tmp_dir) / "normalized.kicad_sym"
            input_path.write_bytes(payload)
            success, error = self._run_kicad_cli(
                [
                    "sym",
                    "upgrade",
                    "--force",
                    "--output",
                    str(output_path),
                    str(input_path),
                ]
            )
            if not success:
                logger.warning(
                    "Falling back to uploaded symbol payload without kicad-cli normalization: %s",
                    error,
                )
                return payload
            if not output_path.is_file():
                raise ValueError(
                    "kicad-cli sym upgrade did not produce a normalized symbol library"
                )
            return output_path.read_bytes()

    def import_symbol_library(
        self,
        component_id: str,
        *,
        upload_name: str,
        payload: bytes,
        target_library: str,
        selected_symbol: str,
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
        canonical_path = self._write_canonical_file(
            self._symbol_destination(target_library or "Prism_Symbols", chosen),
            canonical_payload,
        )

        with self._connect() as conn:
            _, revision = self._resolve_component_for_edit(conn, component_id)
            asset = self._register_asset(
                conn,
                asset_type="symbol",
                canonical_path=canonical_path,
                target_library=target_library or "Prism_Symbols",
                target_name=chosen,
            )
            self._ensure_asset_preview(conn, asset)
            self._link_asset_to_revision(conn, revision["id"], asset, required=True)
            conn.commit()
        return {
            "mode": "imported",
            "discovered_symbols": discovered,
            "selected_symbol": chosen,
            "component": self.get_component(component_id),
        }

    def _extract_footprints_from_upload(
        self, upload_name: str, payload: bytes
    ) -> dict[str, bytes]:
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
                    footprint_name = (
                        _discover_footprint_name_in_text(
                            content.decode("utf-8", errors="ignore")
                        )
                        or Path(name).stem
                    )
                    discovered[footprint_name] = content
            return discovered
        raise ValueError(
            "Footprint upload must be a .kicad_mod file or a zipped .pretty library"
        )

    def import_footprint(
        self,
        component_id: str,
        *,
        upload_name: str,
        payload: bytes,
        target_library: str,
        selected_footprint: str,
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
            _, revision = self._resolve_component_for_edit(conn, component_id)
            asset = self._register_asset(
                conn,
                asset_type="footprint",
                canonical_path=canonical_path,
                target_library=target_library or "Prism_Footprints",
                target_name=chosen,
            )
            self._ensure_asset_preview(conn, asset)
            self._link_asset_to_revision(conn, revision["id"], asset, required=True)
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
    ) -> dict[str, Any]:
        if asset_type not in {"3dmodel", "spice"}:
            raise ValueError("Unsupported auxiliary asset type")
        self.initialize()
        destination = self._write_canonical_file(
            self._aux_destination(
                asset_type, target_library or "Prism_Assets", upload_name
            ),
            payload,
        )
        with self._connect() as conn:
            _, revision = self._resolve_component_for_edit(conn, component_id)
            asset = self._register_asset(
                conn,
                asset_type=asset_type,
                canonical_path=destination,
                target_library=target_library or "Prism_Assets",
                target_name=destination.name,
            )
            self._link_asset_to_revision(conn, revision["id"], asset, required=False)
            conn.commit()
        return {"component": self.get_component(component_id)}

    def detach_asset(self, component_id: str, asset_type: str) -> dict[str, Any]:
        if asset_type not in SUPPORTED_ASSET_TYPES:
            raise ValueError("Unsupported asset type")
        self.initialize()
        with self._connect() as conn:
            _, revision = self._resolve_component_for_edit(conn, component_id)
            conn.execute(
                "DELETE FROM revision_assets WHERE revision_id = ? AND asset_type = ?",
                (revision["id"], asset_type),
            )
            conn.commit()
        return {"component": self.get_component(component_id)}

    def _klc_release_gate(self) -> str:
        gate = settings.CATALOG_KLC_RELEASE_GATE.strip().lower()
        return gate if gate in KLC_RELEASE_GATE_VALUES else "warn"

    def _klc_utils_root(self) -> Path:
        return Path(settings.CATALOG_KLC_UTILS_PATH).expanduser().resolve()

    def _klc_checker_path(self, asset_type: str) -> Path | None:
        script = (
            "check_symbol.py"
            if asset_type == "symbol"
            else "check_footprint.py"
            if asset_type == "footprint"
            else ""
        )
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
        root = ElementTree.parse(junit_path).getroot()  # noqa: S314
        findings: list[dict[str, Any]] = []
        for testcase in root.iter("testcase"):
            object_name = (
                str(testcase.attrib.get("name", ""))
                .removesuffix(" - Errors")
                .removesuffix(" - Warnings")
            )
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
                rule_url = next(
                    (
                        line
                        for line in lines
                        if line.startswith("http://") or line.startswith("https://")
                    ),
                    "",
                )
                details = [
                    line for line in lines if line != message and line != rule_url
                ]
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
            "error_count": sum(
                1
                for finding in findings
                if finding["severity"] == VALIDATION_SEVERITY_ERROR
            ),
            "warning_count": sum(
                1
                for finding in findings
                if finding["severity"] == VALIDATION_SEVERITY_WARNING
            ),
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
        conn: sqlite3.Connection,
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
        error_count = sum(
            1
            for finding in findings
            if finding["severity"] == VALIDATION_SEVERITY_ERROR
        )
        warning_count = sum(
            1
            for finding in findings
            if finding["severity"] == VALIDATION_SEVERITY_WARNING
        )
        conn.execute(
            "DELETE FROM asset_validation_findings WHERE run_id = ?", (run_id,)
        )
        conn.execute(
            """
            INSERT INTO asset_validation_runs (
                id, component_id, revision_id, asset_id, asset_type, checker_type, status,
                error_count, warning_count, exit_code, tool_version, report_dir, stdout_path,
                stderr_path, junit_path, json_path, raw_output, created_at, finished_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        row = conn.execute(
            "SELECT * FROM asset_validation_runs WHERE id = ?", (run_id,)
        ).fetchone()
        return (
            self._validation_run_payload(dict(row), include_findings=True, conn=conn)
            if row
            else {}
        )

    def _run_klc_for_asset(
        self,
        conn: sqlite3.Connection,
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
            cmd = [
                sys.executable,
                str(checker),
                str(asset["canonical_path"]),
                "-vv",
                "--nocolor",
                "--junit",
                str(junit_path),
            ]
            cmd.extend(self._klc_rule_args(asset_type))
            if (
                asset_type == "symbol"
                and settings.CATALOG_KLC_FOOTPRINT_LIB_DIR.strip()
            ):
                cmd.extend(
                    ["--footprints", settings.CATALOG_KLC_FOOTPRINT_LIB_DIR.strip()]
                )
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
                if any(
                    finding["severity"] == VALIDATION_SEVERITY_ERROR
                    for finding in findings
                ) or result.returncode not in {0, 2, 3}:
                    status = VALIDATION_STATUS_FAILED
                elif (
                    any(
                        finding["severity"] == VALIDATION_SEVERITY_WARNING
                        for finding in findings
                    )
                    or result.returncode == 2
                ):
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
            summary = self._component_validation_summary(
                conn, str(revision["id"]), assets
            )
            run_ids = [
                str(asset["latest_run"]["id"])
                for asset in summary["assets"]
                if asset.get("latest_run")
            ]
            runs = []
            if run_ids:
                placeholders = ",".join("?" for _ in run_ids)
                rows = conn.execute(
                    f"SELECT * FROM asset_validation_runs WHERE id IN ({placeholders})",  # noqa: S608
                    tuple(run_ids),
                ).fetchall()
                runs = [
                    self._validation_run_payload(
                        dict(row), include_findings=True, conn=conn
                    )
                    for row in rows
                ]
        return {"summary": summary, "runs": runs}

    def get_validation_run(self, run_id: str) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM asset_validation_runs WHERE id = ?", (run_id,)
            ).fetchone()
            if not row:
                return None
            return self._validation_run_payload(
                dict(row), include_findings=True, conn=conn
            )

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
            row = conn.execute(
                "SELECT * FROM asset_validation_runs WHERE id = ?", (run_id,)
            ).fetchone()
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
        validation_counts = {
            status: 0
            for status in (
                VALIDATION_STATUS_PASSED,
                VALIDATION_STATUS_WARNING,
                VALIDATION_STATUS_FAILED,
                VALIDATION_STATUS_SKIPPED,
                VALIDATION_STATUS_NOT_RUN,
            )
        }
        preview_failed = 0
        place_ready = 0
        released = 0
        missing_files = 0
        total_components = 0
        page = 1
        page_size = 10000
        while True:
            result = self.list_components(
                include_inactive=False,
                page=page,
                page_size=page_size,
                lightweight=False,
            )
            components = result["items"]
            total_components = int(result["total"])
            for component in components:
                validation_counts[component["validation"]["status"]] = (
                    validation_counts.get(component["validation"]["status"], 0) + 1
                )
                if component["availability_state"] == STATE_PLACE_READY:
                    place_ready += 1
                else:
                    missing_files += 1
                if component["release_status"] == "released":
                    released += 1
                if any(
                    preview["status"] == PREVIEW_STATUS_FAILED
                    for preview in component.get("previews", [])
                ):
                    preview_failed += 1
            if page >= int(result["pages"]):
                break
            page += 1
        checker_available = bool(
            self._klc_checker_path("symbol") and self._klc_checker_path("footprint")
        )
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

    def regenerate_component_previews(self, component_id: str) -> dict[str, Any]:
        self.initialize()
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
                if asset["asset_type"] in {"symbol", "footprint"}
            ]
            if not assets:
                raise ValueError("No symbol or footprint assets are attached")
            for asset in assets:
                self._ensure_asset_preview(conn, asset)
            conn.commit()
        return self.get_component(component_id) or {}

    def set_release_status(
        self, component_id: str, release_status: str
    ) -> dict[str, Any]:
        release_status = _normalize_workflow_stage(release_status)
        if release_status not in WORKFLOW_STAGES:
            raise ValueError("Unsupported release status")
        self.initialize()
        with self._connect() as conn:
            component = self._component_row(conn, component_id)
            if not component:
                raise ValueError("Component not found")
            revision = self._revision_row(conn, str(component["current_revision_id"]))
            if not revision:
                raise ValueError("Component revision not found")
            current_status = _normalize_workflow_stage(str(revision["release_status"]))
            if current_status == "released" and release_status == "open":
                revision = self._clone_revision(conn, component_id)
                current_status = _normalize_workflow_stage(
                    str(revision["release_status"])
                )

            allowed = {
                "open": {"in_progress", "archived"},
                "in_progress": {"qa_review", "open", "archived"},
                "qa_review": {"done", "in_progress", "archived"},
                "done": {"released", "qa_review", "archived"},
                "released": {"archived", "open"},
                "archived": {"open"},
            }
            if release_status != current_status and release_status not in allowed.get(
                current_status, set()
            ):
                raise ValueError(
                    f"Cannot transition revision from {current_status} to {release_status}"
                )

            assets = self._load_assets_for_revision(conn, revision["id"])
            availability_state, missing_assets, _ = self._availability(
                assets, release_status, bool(component["is_active"])
            )
            if release_status == "released" and availability_state != STATE_PLACE_READY:
                raise ValueError(
                    f"Cannot release component while files are incomplete: missing {', '.join(missing_assets)}"
                )
            if release_status == "released" and self._klc_release_gate() == "block":
                validation = self._component_validation_summary(
                    conn, str(revision["id"]), assets
                )
                if validation["status"] in {
                    VALIDATION_STATUS_FAILED,
                    VALIDATION_STATUS_SKIPPED,
                    VALIDATION_STATUS_NOT_RUN,
                }:
                    raise ValueError(
                        "Cannot release component until required symbol and footprint assets pass KLC validation"
                    )

            now = _utc_now_iso()
            conn.execute(
                "UPDATE component_revisions SET release_status = ?, updated_at = ? WHERE id = ?",
                (release_status, now, revision["id"]),
            )
            if release_status == "released":
                conn.execute(
                    "UPDATE components SET released_revision_id = ?, updated_at = ? WHERE id = ?",
                    (revision["id"], now, component_id),
                )
            elif release_status == "archived":
                conn.execute(
                    "UPDATE components SET released_revision_id = '', updated_at = ? WHERE id = ?",
                    (now, component_id),
                )
            else:
                conn.execute(
                    "UPDATE components SET updated_at = ? WHERE id = ?",
                    (now, component_id),
                )
            conn.commit()
        return self.get_component(component_id) or {}

    def deactivate_component(self, component_id: str) -> bool:
        self.initialize()
        with self._connect() as conn:
            result = conn.execute(
                "UPDATE components SET is_active = 0, updated_at = ? WHERE id = ?",
                (_utc_now_iso(), component_id),
            )
            conn.commit()
            return result.rowcount > 0

    def delete_component(self, component_id: str) -> bool:
        self.initialize()
        with self._connect() as conn:
            result = conn.execute(
                "DELETE FROM components WHERE id = ?", (component_id,)
            )
            conn.commit()
            return result.rowcount > 0

    def _materialize_asset(
        self,
        asset: dict[str, Any],
        assets_for_revision: list[dict[str, Any]],
        component: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        path = Path(str(asset["canonical_path"]))
        payload = path.read_bytes()
        if asset["asset_type"] == "symbol":
            footprint_asset = next(
                (
                    candidate
                    for candidate in assets_for_revision
                    if candidate["asset_type"] == "footprint"
                ),
                None,
            )
            footprint_ref = None
            if footprint_asset:
                footprint_ref = f"{_remote_library_nickname(str(footprint_asset['target_library']))}:{footprint_asset['target_name']}"
            payload = _rewrite_symbol_payload(payload, footprint_ref, component)
        elif asset["asset_type"] == "footprint":
            payload = _rewrite_footprint_payload(payload, asset)
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
        component = self.get_component(
            component_id, include_inactive=False, released_only=True
        )
        if not component:
            return None
        if not component["place_enabled"]:
            raise ValueError(
                "Component is not placeable because it is not released or required files are missing"
            )
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
                    "download_url": self.build_signed_asset_url(
                        asset["id"], component["revision_id"], base_url
                    ),
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
        component = self.get_component(
            component_id, include_inactive=False, released_only=True
        )
        if not component:
            return None
        if not component["place_enabled"]:
            raise ValueError(
                "Component is not placeable because it is not released or required files are missing"
            )
        with self._connect() as conn:
            assets = self._load_assets_for_revision(conn, component["revision_id"])
        bundle_entries = []
        for raw_asset in assets:
            asset = self._materialize_asset(raw_asset, assets, component)
            bundle_entries.append(
                {
                    "type": asset["asset_type"],
                    "name": asset["target_name"] or asset["name"],
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
            "data": base64.b64encode(
                json.dumps(bundle_entries, separators=(",", ":")).encode("utf-8")
            ).decode("ascii"),
        }

    def get_asset_by_id(
        self, asset_id: str, *, revision_id: str = ""
    ) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM assets WHERE id = ?", (asset_id,)
            ).fetchone()
            if not row:
                return None
            asset = dict(row)
            effective_revision_id = revision_id
            if not effective_revision_id:
                link = conn.execute(
                    "SELECT revision_id FROM revision_assets WHERE asset_id = ? ORDER BY updated_at DESC LIMIT 1",
                    (asset_id,),
                ).fetchone()
                effective_revision_id = str(link["revision_id"]) if link else ""
            assets_for_revision = (
                self._load_assets_for_revision(conn, effective_revision_id)
                if effective_revision_id
                else [asset]
            )
            component = None
            if effective_revision_id:
                revision = self._revision_row(conn, effective_revision_id)
                if revision:
                    component_row = self._component_row(
                        conn, str(revision["component_id"])
                    )
                    if component_row:
                        component = self._component_payload(
                            conn, component_row, revision
                        )
        return self._materialize_asset(asset, assets_for_revision, component)

    def get_preview(self, preview_id: str) -> CatalogPreview | None:
        self.initialize()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM asset_previews WHERE id = ?", (preview_id,)
            ).fetchone()
        if not row:
            return None
        return CatalogPreview(
            preview_id=str(row["id"]),
            component_id=str(row["asset_id"]),
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
        return (
            base64.urlsafe_b64encode(
                hmac.new(secret, message.encode("utf-8"), hashlib.sha256).digest()
            )
            .rstrip(b"=")
            .decode("ascii")
        )

    def build_signed_asset_url(
        self, asset_id: str, revision_id: str, base_url: str, ttl_seconds: int = 300
    ) -> str:
        expires_at = int(time.time()) + ttl_seconds
        signature = self._sign(f"{asset_id}:{revision_id}:{expires_at}")
        return f"{base_url.rstrip('/')}/api/remote-provider/assets/{asset_id}?rev={revision_id}&exp={expires_at}&sig={signature}"

    def validate_asset_signature(
        self, asset_id: str, revision_id: str, expires_at: int, signature: str
    ) -> bool:
        if expires_at <= int(time.time()):
            return False
        return hmac.compare_digest(
            self._sign(f"{asset_id}:{revision_id}:{expires_at}"), signature
        )

    def store_auth_code(self, code: str, grant: dict[str, Any], exp: int) -> None:
        self.initialize()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO oauth_auth_codes (code, grant_json, exp)
                VALUES (?, ?, ?)
                ON CONFLICT (code) DO UPDATE SET grant_json = excluded.grant_json, exp = excluded.exp
                """,
                (code, json.dumps(grant, separators=(",", ":")), exp),
            )
            conn.commit()

    def consume_auth_code(self, code: str) -> dict[str, Any] | None:
        self.initialize()
        now = int(time.time())
        with self._connect() as conn:
            row = conn.execute(
                "SELECT grant_json, exp FROM oauth_auth_codes WHERE code = ?", (code,)
            ).fetchone()
            conn.execute("DELETE FROM oauth_auth_codes WHERE code = ?", (code,))
            conn.execute("DELETE FROM oauth_auth_codes WHERE exp <= ?", (now,))
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
                VALUES (?, ?)
                ON CONFLICT (jti) DO UPDATE SET exp = excluded.exp
                """,
                (jti, exp),
            )
            conn.commit()

    def is_token_revoked(self, jti: str) -> bool:
        self.initialize()
        now = int(time.time())
        with self._connect() as conn:
            conn.execute("DELETE FROM oauth_revoked_tokens WHERE exp <= ?", (now,))
            row = conn.execute(
                "SELECT 1 FROM oauth_revoked_tokens WHERE jti = ?", (jti,)
            ).fetchone()
            conn.commit()
        return bool(row)

    def _released_place_ready_components(self) -> list[dict[str, Any]]:
        return [
            component
            for component in self.list_components_flat(
                released_only=True, include_inactive=False
            )
            if component["place_enabled"]
        ]

    def _dbl_row_for_component(
        self, component: dict[str, Any], part_number: str
    ) -> dict[str, str]:
        symbol_asset = next(
            (asset for asset in component["assets"] if asset["asset_type"] == "symbol"),
            None,
        )
        footprint_asset = next(
            (
                asset
                for asset in component["assets"]
                if asset["asset_type"] == "footprint"
            ),
            None,
        )
        lib_symbol = ""
        lib_footprint = ""
        if symbol_asset:
            lib_symbol = f"{_dbl_symbol_library_name(part_number, symbol_asset)}:{symbol_asset['target_name']}"
        if footprint_asset:
            lib_footprint = (
                f"{footprint_asset['target_library']}:{footprint_asset['target_name']}"
            )
        return {
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

    def _collect_dbl_assets(
        self,
        component: dict[str, Any],
        part_number: str,
        export_root: Path,
        conn: sqlite3.Connection,
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
                destination = (
                    export_root
                    / "PcbLib"
                    / f"{asset['target_library']}.pretty"
                    / f"{asset['target_name']}.kicad_mod"
                )
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(asset["payload"])

    def _write_dbl_config(
        self,
        export_root: Path,
        *,
        filename: str,
        connection_string: str,
        libraries: list[dict[str, Any]],
    ) -> None:
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
        (export_root / filename).write_text(
            json.dumps(payload, indent=4) + "\n", encoding="utf-8"
        )

    def export_kicad_dbl_bundle(self) -> dict[str, Any]:
        self.initialize()
        export_root = self._export_root
        if export_root.exists():
            shutil.rmtree(export_root)
        (export_root / "SchLib").mkdir(parents=True, exist_ok=True)
        (export_root / "PcbLib").mkdir(parents=True, exist_ok=True)

        components = sorted(
            self._released_place_ready_components(),
            key=lambda c: (c["category"], c["mpn"], c["id"]),
        )
        db_path = export_root / "Prism.sqlite"
        used_part_numbers: set[str] = set()
        grouped_rows: dict[str, list[dict[str, str]]] = {}

        with self._connect() as catalog_conn:
            for component in components:
                base_part = _part_number_nocolon(
                    component["mpn"] or component["value"] or component["id"]
                )
                part_number = base_part
                counter = 2
                while part_number in used_part_numbers:
                    part_number = f"{base_part}_{counter}"
                    counter += 1
                used_part_numbers.add(part_number)
                category = component["category"] or "Uncategorized"
                grouped_rows.setdefault(category, []).append(
                    self._dbl_row_for_component(component, part_number)
                )
                self._collect_dbl_assets(
                    component, part_number, export_root, catalog_conn
                )

        with sqlite3.connect(db_path) as dbl_conn:
            for category, rows in sorted(grouped_rows.items()):
                table = _quote_identifier(category)
                columns_sql = ", ".join(
                    f"{_quote_identifier(column)} TEXT NOT NULL DEFAULT ''"
                    for column in DBL_COMMON_COLUMNS
                )
                dbl_conn.execute(f"CREATE TABLE {table} ({columns_sql})")
                column_names = ", ".join(
                    _quote_identifier(column) for column in DBL_COMMON_COLUMNS
                )
                placeholders = ", ".join("?" for _ in DBL_COMMON_COLUMNS)
                for row in rows:
                    dbl_conn.execute(
                        f"INSERT INTO {table} ({column_names}) VALUES ({placeholders})",  # noqa: S608
                        tuple(row.get(column, "") for column in DBL_COMMON_COLUMNS),
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
            for column in DBL_COMMON_COLUMNS
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

        symbol_libraries = sorted(
            path.stem for path in (export_root / "SchLib").glob("*.kicad_sym")
        )
        footprint_libraries = sorted(
            {
                asset["target_library"]
                for component in components
                for asset in component["assets"]
                if asset["asset_type"] == "footprint"
            }
        )
        sym_lines = [
            "(sym_lib_table",
            '  (lib (name "Prism")(type "Database")(uri "${PRISM_LIB_DIR}/Prism_Linux.kicad_dbl")(options "")(descr ""))',
        ]
        sym_lines.extend(
            f'  (lib (name "{_sexpr_string(library)}")(type "KiCad")(uri "${{PRISM_LIB_DIR}}/SchLib/{_sexpr_string(library)}.kicad_sym")(options "")(descr "")(hidden))'
            for library in symbol_libraries
        )
        sym_lines.append(")")
        (export_root / "sym-lib-table").write_text(
            "\n".join(sym_lines) + "\n", encoding="utf-8"
        )

        fp_lines = ["(fp_lib_table"]
        fp_lines.extend(
            f'  (lib (name "{_sexpr_string(library)}")(type "KiCad")(uri "${{PRISM_LIB_DIR}}/PcbLib/{_sexpr_string(library)}.pretty")(options "")(descr ""))'
            for library in footprint_libraries
        )
        fp_lines.append(")")
        (export_root / "fp-lib-table").write_text(
            "\n".join(fp_lines) + "\n", encoding="utf-8"
        )

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

    def find_asset_by_library_name(
        self,
        asset_type: str,
        target_library: str,
        target_name: str,
    ) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM assets WHERE asset_type = ? AND target_library = ? AND target_name = ? LIMIT 1",
                (asset_type, target_library, target_name),
            ).fetchone()
            return dict(row) if row else None

    def get_or_generate_preview_svg_path(
        self,
        asset_type: str,
        target_library: str,
        target_name: str,
    ) -> Path | None:
        """Return path to a ready SVG preview, generating it on demand if needed."""
        self.initialize()
        if asset_type not in {"symbol", "footprint"}:
            return None
        kind = PREVIEW_KIND_SYMBOL if asset_type == "symbol" else PREVIEW_KIND_FOOTPRINT
        with self._connect() as conn:
            asset_row = conn.execute(
                "SELECT * FROM assets WHERE asset_type = ? AND target_library = ? AND target_name = ? LIMIT 1",
                (asset_type, target_library, target_name),
            ).fetchone()
            if not asset_row:
                return None
            asset = dict(asset_row)
            # Return cached preview if it exists
            preview_row = conn.execute(
                "SELECT file_path FROM asset_previews WHERE asset_id = ? AND kind = ? AND status = ? ORDER BY updated_at DESC LIMIT 1",
                (str(asset["id"]), kind, PREVIEW_STATUS_READY),
            ).fetchone()
            if preview_row:
                p = Path(str(preview_row["file_path"] or ""))
                if p.is_file():
                    return p
            # Generate on demand
            if asset_type == "symbol":
                status, result = self._generate_symbol_preview(asset)
            else:
                status, result = self._generate_footprint_preview(asset)
            self._upsert_asset_preview(
                conn,
                asset_id=str(asset["id"]),
                kind=kind,
                status=status,
                file_path=result if status == PREVIEW_STATUS_READY else "",
                generation_error="" if status == PREVIEW_STATUS_READY else result,
            )
            if status == PREVIEW_STATUS_READY:
                return Path(result)
            return None

    def find_component_by_asset(
        self,
        asset_type: str,
        target_library: str,
        target_name: str,
    ) -> dict[str, Any] | None:
        """Return a lightweight component payload for the component that owns the given asset."""
        self.initialize()
        if asset_type not in {"symbol", "footprint"}:
            return None
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT c.id, c.is_active, r.id AS revision_id,
                       r.value, r.description, r.manufacturer, r.mpn,
                       r.category, r.package_name, r.release_status
                FROM assets a
                JOIN revision_assets ra ON ra.asset_id = a.id
                JOIN component_revisions r ON r.id = ra.revision_id
                JOIN components c ON c.current_revision_id = r.id
                WHERE a.asset_type = ? AND a.target_library = ? AND a.target_name = ?
                  AND c.is_active = 1
                LIMIT 1
                """,
                (asset_type, target_library, target_name),
            ).fetchone()
            if not row:
                return None
            row = dict(row)
            revision_id = str(row["revision_id"])
            assets = self._load_assets_for_revision(conn, revision_id)
            previews = self._load_previews_for_assets(
                conn, [str(a["id"]) for a in assets]
            )
            preview_payloads = [
                {
                    "id": str(p["id"]),
                    "kind": str(p["kind"]),
                    "status": str(p["status"]),
                    "content_type": str(p["content_type"]),
                }
                for p in previews
                if str(p["status"]) == "ready"
            ]
            return {
                "id": str(row["id"]),
                "value": str(row["value"] or ""),
                "description": str(row["description"] or ""),
                "manufacturer": str(row["manufacturer"] or ""),
                "mpn": str(row["mpn"] or ""),
                "category": str(row["category"] or ""),
                "package_name": str(row["package_name"] or ""),
                "release_status": _normalize_workflow_stage(
                    str(row["release_status"] or "")
                ),
                "workflow_stage": _normalize_workflow_stage(
                    str(row["release_status"] or "")
                ),
                "previews": preview_payloads,
            }


catalog_service = ComponentCatalogService()
