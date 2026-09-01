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
from typing import Any, Callable, Iterator
from xml.etree import ElementTree

from app.core.config import settings
from app.services.catalog.component_history import CatalogComponentHistoryReads
from app.services.catalog.component_read_models import (
    CatalogComponentReadModels,
    SUPPLY_KIND_LOCAL,
    SUPPLY_KIND_VENDOR,
    SUPPLY_LOCAL_SOURCE_NAMES,
    SUPPLY_VENDOR_SOURCE_NAMES,
    supply_source_payload as _supply_source_payload,
)
from app.services.catalog.component_queries import CatalogComponentQueries
from app.services.catalog.locking import CatalogLockOperations, NoopCatalogLocks
from app.services.catalog.metadata_batches import CatalogMetadataBatches
from app.services.catalog.metadata_batch_staging import CatalogMetadataBatchStaging
from app.services.catalog.metadata_fields import CatalogMetadataFields
from app.services.catalog.metadata_grid import CatalogMetadataGrid
from app.services.catalog.metadata_schema import (
    BUILTIN_METADATA_FIELDS,
    CatalogMetadataSchema,
    METADATA_FIELD_TYPES,
    METADATA_SCHEMA_VERSION,
    SYMBOL_METADATA_LABEL_TO_KEY,
)
from app.services.catalog.metadata_normalization import (
    IDENTITY_KIND_MPN,
    IDENTITY_KIND_PROVISIONAL_IPN,
    MPN_SOURCE_MANUFACTURER,
    MPN_SOURCE_PROVISIONAL_IPN,
    dedupe,
    metadata_keywords,
    metadata_search_document,
    normalize_identity_value,
    normalize_metadata,
)
from app.services.catalog.normalization import (
    json_loads as _json_loads,
    preview_base_kind as _preview_base_kind,
    preview_kind as _preview_kind,
    preview_unit as _preview_unit,
    preview_unit_label as _preview_unit_label,
    sha256_bytes as _sha256_bytes,
    sha256_file as _sha256_file,
)
from app.services.catalog.project_import_sessions import CatalogProjectImportSessions
from app.services.catalog.project_import_matching import CatalogProjectImportMatching
from app.services.catalog.project_import_assets import CatalogProjectImportAssets
from app.services.catalog.project_import_acceptance import CatalogProjectImportAcceptance
from app.services.catalog.revision_comparison import CatalogRevisionComparison
from app.services.catalog.revision_kernel import (
    CatalogRevisionKernel,
    LEGACY_WORKFLOW_STAGE_MAP,
    REVISION_MANIFEST_A0,
    REVISION_MANIFEST_A1,
    REVISION_MANIFEST_A2,
    REVISION_MANIFEST_A3,
    WORKFLOW_STAGES,
    normalize_workflow_stage,
)
from app.services.catalog.runtime import (
    CatalogRuntime, DBL_EXPORT_DIRNAME, DEFAULT_STORE_DIRNAME, KLC_VALIDATION_DIRNAME,
    _ASSET_BROWSE_CACHE_TTL_SECONDS,
)

logger = logging.getLogger(__name__)

PREVIEW_KIND_SYMBOL = "symbol"
PREVIEW_KIND_FOOTPRINT = "footprint"
PREVIEW_STATUS_READY = "ready"
PREVIEW_STATUS_FAILED = "failed"
PREVIEW_PIPELINE_VERSION = "prism-preview-a2-multi-unit"

SOURCE_MANUAL = "manual"
SOURCE_EXTERNAL = "external"
SUPPORTED_ASSET_TYPES = ("symbol", "footprint", "3dmodel", "spice")
PLACE_REQUIRED_ASSET_TYPES = ("symbol", "footprint")
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

CSV_SPREADSHEET_TEXT_GUARD = "\u200b"

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


def _discover_symbol_names_in_text(text: str) -> list[str]:
    matches = re.findall(r'\(symbol\s+"([^"]+)"', text)
    filtered = [name for name in matches if not re.search(r"_\d+_\d+$", name)]
    return dedupe(filtered or matches)


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
    return normalize_workflow_stage(stage)


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
    _catalog_locks: CatalogLockOperations = NoopCatalogLocks()
    _revision_kernel: CatalogRevisionKernel = CatalogRevisionKernel(_catalog_locks)
    _revision_comparison: CatalogRevisionComparison = CatalogRevisionComparison(_revision_kernel)
    _component_history_reads: CatalogComponentHistoryReads = CatalogComponentHistoryReads(_revision_kernel)
    _component_read_models: CatalogComponentReadModels = CatalogComponentReadModels(_revision_kernel)
    _component_queries: CatalogComponentQueries = CatalogComponentQueries(_component_read_models)
    _project_import_sessions: CatalogProjectImportSessions = CatalogProjectImportSessions()
    _project_import_matching: CatalogProjectImportMatching = CatalogProjectImportMatching()
    _project_import_assets: CatalogProjectImportAssets = CatalogProjectImportAssets(_revision_kernel)
    _project_import_acceptance: CatalogProjectImportAcceptance = CatalogProjectImportAcceptance()
    _metadata_schema: CatalogMetadataSchema = CatalogMetadataSchema()
    _metadata_fields: CatalogMetadataFields = CatalogMetadataFields(_metadata_schema)
    _metadata_grid: CatalogMetadataGrid = CatalogMetadataGrid()
    _metadata_batches: CatalogMetadataBatches = CatalogMetadataBatches()
    _metadata_batch_staging: CatalogMetadataBatchStaging = CatalogMetadataBatchStaging()

    def __init__(self, store_root: Path | None = None, database_url: str | None = None) -> None:
        self._catalog_runtime = CatalogRuntime(
            store_root=store_root,
            database_path=self._database_path(database_url),
        )
        self._catalog_locks: CatalogLockOperations = NoopCatalogLocks()
        self._revision_kernel = CatalogRevisionKernel(self._catalog_locks)
        self._revision_comparison = CatalogRevisionComparison(self._revision_kernel)
        self._component_history_reads = CatalogComponentHistoryReads(self._revision_kernel)
        self._component_read_models = CatalogComponentReadModels(self._revision_kernel)
        self._component_queries = CatalogComponentQueries(self._component_read_models)
        self._project_import_sessions = CatalogProjectImportSessions()
        self._project_import_matching = CatalogProjectImportMatching()
        self._project_import_assets = CatalogProjectImportAssets(self._revision_kernel)
        self._project_import_acceptance = CatalogProjectImportAcceptance()
        self._metadata_schema: CatalogMetadataSchema = CatalogMetadataSchema()
        self._metadata_fields: CatalogMetadataFields = CatalogMetadataFields(self._metadata_schema)
        self._metadata_grid: CatalogMetadataGrid = CatalogMetadataGrid()
        self._metadata_batches = CatalogMetadataBatches()
        self._metadata_batch_staging = CatalogMetadataBatchStaging()

    def _runtime_for_compat(self) -> CatalogRuntime:
        """Lazily support legacy ``__new__``-constructed test doubles."""
        runtime = self.__dict__.get("_catalog_runtime")
        if runtime is None:
            runtime = CatalogRuntime()
            self.__dict__["_catalog_runtime"] = runtime
        return runtime

    @property
    def _store_root(self) -> Path:
        return self._runtime_for_compat().store_root

    @_store_root.setter
    def _store_root(self, value: Path) -> None:
        self._runtime_for_compat().store_root = Path(value)

    @property
    def _browse_cache(self) -> dict[str, tuple[float, list[str]]]:
        return self._runtime_for_compat().browse_cache

    @_browse_cache.setter
    def _browse_cache(self, value: dict[str, tuple[float, list[str]]]) -> None:
        self._runtime_for_compat().browse_cache = value

    def _database_path(self, database_url: str | None) -> Path:
        _ = database_url
        return Path("/dev/null")

    @property
    def store_root(self) -> Path:
        return self._store_root

    @property
    def db_path(self) -> Path:
        return self._runtime_for_compat().db_path

    @property
    def export_root(self) -> Path:
        return self._runtime_for_compat().export_root

    @property
    def validation_root(self) -> Path:
        return self._runtime_for_compat().validation_root

    def initialize(self) -> None:
        raise NotImplementedError("Use ComponentCatalogPostgresService")

    def close(self) -> None:
        self._runtime_for_compat().close()

    def _ensure_storage_dirs(self) -> None:
        for path in (
            self._store_root / "symbols",
            self._store_root / "footprints",
            self._store_root / "3dmodels",
            self._store_root / "spice",
            self._store_root / "previews" / "symbols",
            self._store_root / "previews" / "footprints",
            self._store_root / "revisions",
            self.export_root,
            self.validation_root,
        ):
            path.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def _connect(self) -> Iterator[Any]:
        raise NotImplementedError("Catalog persistence must provide a PostgreSQL connection")
        yield  # pragma: no cover


    def _resolve_kicad_cli(self) -> str | None:
        runtime = self._catalog_runtime
        if runtime.kicad_cli and Path(runtime.kicad_cli).exists():
            return runtime.kicad_cli
        candidates = (
            shutil.which("kicad-cli"),
            "/usr/bin/kicad-cli",
            "/usr/local/bin/kicad-cli",
            "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli",
            os.path.expanduser("~/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli"),
        )
        for candidate in candidates:
            if candidate and Path(candidate).exists():
                runtime.kicad_cli = str(candidate)
                return runtime.kicad_cli
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
        elif self._catalog_runtime.kicad_cli_version is not None:
            version = self._catalog_runtime.kicad_cli_version
        else:
            try:
                result = subprocess.run(
                    [cli, "--version"], capture_output=True, text=True, timeout=10, check=False
                )
                version = (result.stdout or result.stderr or "unknown").strip() or "unknown"
            except (OSError, subprocess.TimeoutExpired):
                version = "unknown"
            self._catalog_runtime.kicad_cli_version = version
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

    def _unique_slug(self, conn: Any, base: str) -> str:
        self._catalog_locks.lock_slug_allocation(conn, base)
        slug = _slugify(base or "component")
        candidate = slug
        counter = 2
        while conn.execute("SELECT 1 FROM components WHERE slug = %s", (candidate,)).fetchone():
            candidate = f"{slug}-{counter}"
            counter += 1
        return candidate

    def _lock_component_identity(self, conn: Any, manufacturer: str, mpn: str) -> None:
        self._catalog_locks.lock_component_identity(conn, manufacturer, mpn)

    def _lock_component_for_mutation(self, conn: Any, component_id: str) -> None:
        self._catalog_locks.lock_component_for_mutation(conn, component_id)

    def _assert_component_identity_available(
        self,
        conn: Any,
        *,
        manufacturer: str,
        mpn: str,
        name: str = "",
        identity_kind: str = IDENTITY_KIND_MPN,
        identity_source: str = "",
        source_internal_part_number: str = "",
        component_id: str = "",
        acquire_identity_lock: bool = True,
    ) -> None:
        """Reject a second component with the same orderable or provisional identity."""
        _ = name
        normalized_manufacturer = normalize_identity_value(manufacturer)
        normalized_part_number = normalize_identity_value(
            mpn if identity_kind == IDENTITY_KIND_MPN else source_internal_part_number
        )
        if acquire_identity_lock:
            self._lock_component_identity(
                conn,
                normalized_manufacturer if identity_kind == IDENTITY_KIND_MPN else identity_source,
                normalized_part_number,
            )
        existing = conn.execute(
            """
            SELECT id
            FROM components
            WHERE identity_kind = %s
              AND normalized_manufacturer = %s
              AND normalized_part_number = %s
              AND identity_source = %s
              AND id <> %s
            LIMIT 1
            """,
            (
                identity_kind,
                normalized_manufacturer if identity_kind == IDENTITY_KIND_MPN else "",
                normalized_part_number,
                identity_source if identity_kind == IDENTITY_KIND_PROVISIONAL_IPN else "",
                component_id,
            ),
        ).fetchone()
        if existing:
            raise ValueError("A component with this manufacturer-part identity already exists")

    def _component_row(self, conn: Any, component_id: str) -> dict[str, Any] | None:
        return self._revision_kernel.component_row(conn, component_id)

    def _revision_row(self, conn: Any, revision_id: str) -> dict[str, Any] | None:
        return self._revision_kernel.revision_row(conn, revision_id)

    def _active_revision_row(
        self,
        conn: Any,
        component_id: str,
        *,
        released: bool = False,
    ) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        return self._revision_kernel.active_revision_row(conn, component_id, released=released)

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
        return self._revision_kernel.append_audit_event(
            conn,
            component_id=component_id,
            revision_id=revision_id,
            event_type=event_type,
            actor=actor,
            details=details,
        )

    def _revision_manifest_hash(self, conn: Any, revision_id: str) -> str:
        return self._revision_kernel.revision_manifest_hash(conn, revision_id)

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
        return self._revision_kernel.clone_revision(
            conn,
            component_id,
            actor=actor,
            change_kind=change_kind,
            change_summary=change_summary,
            expected_revision_id=expected_revision_id,
        )

    def _load_assets_for_revision(self, conn: Any, revision_id: str) -> list[dict[str, Any]]:
        return self._revision_kernel.load_assets_for_revision(conn, revision_id)

    def _load_representations_for_revision(
        self,
        conn: Any,
        revision_id: str,
        *,
        assets: list[dict[str, Any]] | None = None,
        previews: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        return self._component_read_models.load_representations_for_revision(
            conn, revision_id, assets=assets, previews=previews
        )

    def _local_inventory(self, conn: Any, component_id: str) -> dict[str, Any] | None:
        return self._component_read_models.local_inventory(conn, component_id)

    def _supply_sources(self, conn: Any, component_id: str) -> list[dict[str, Any]]:
        return self._component_read_models.supply_sources(conn, component_id)

    def _load_previews_for_assets(self, conn: Any, asset_ids: list[str]) -> list[dict[str, Any]]:
        return self._component_read_models.load_previews_for_assets(conn, asset_ids)

    def _load_previews_for_revision(self, conn: Any, revision_id: str) -> list[dict[str, Any]]:
        return self._component_read_models.load_previews_for_revision(conn, revision_id)

    def _load_preview_evidence_for_revision(self, conn: Any, revision_id: str) -> list[dict[str, Any]]:
        return self._revision_kernel.load_preview_evidence_for_revision(conn, revision_id)

    def _latest_validation_runs_for_assets(
        self,
        conn: Any,
        revision_id: str,
        asset_ids: list[str],
    ) -> dict[str, dict[str, Any]]:
        return self._component_read_models.latest_validation_runs_for_assets(
            conn, revision_id, asset_ids
        )

    def _validation_run_payload(self, row: dict[str, Any], *, include_findings: bool = False, conn: Any | None = None) -> dict[str, Any]:
        return self._component_read_models.validation_run_payload(
            row, include_findings=include_findings, conn=conn
        )

    def _validation_findings_payload(self, conn: Any, run_id: str) -> list[dict[str, Any]]:
        return self._component_read_models.validation_findings_payload(conn, run_id)

    def _component_validation_summary(
        self,
        conn: Any,
        revision_id: str,
        assets: list[dict[str, Any]],
        *,
        preloaded_runs: dict[str, dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        return self._component_read_models.component_validation_summary(
            conn,
            revision_id,
            assets,
            preloaded_runs=preloaded_runs,
        )

    def _availability(self, assets: list[dict[str, Any]], release_status: str, is_active: bool) -> tuple[str, list[str], bool]:
        return self._component_read_models.availability(assets, release_status, is_active)

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
        representation_id: str = "",
    ) -> dict[str, Any]:
        return self._component_read_models.component_payload(
            conn,
            component_row,
            revision_row,
            released_view=released_view,
            preloaded_assets=preloaded_assets,
            preloaded_previews=preloaded_previews,
            preloaded_validation_runs=preloaded_validation_runs,
            representation_id=representation_id,
        )

    def list_component_revisions(self, component_id: str) -> list[dict[str, Any]]:
        self.initialize()
        with self._connect() as conn:
            return self._component_history_reads.list_component_revisions(conn, component_id)

    def list_component_audit_events(self, component_id: str) -> list[dict[str, Any]]:
        self.initialize()
        with self._connect() as conn:
            return self._component_history_reads.list_component_audit_events(conn, component_id)

    def verify_component_audit_chain(self, component_id: str) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            return self._component_history_reads.verify_component_audit_chain(conn, component_id)

    def get_component_revision(self, component_id: str, revision_id: str) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            return self._component_read_models.get_component_revision(
                conn, component_id, revision_id
            )

    def compare_component_revisions(self, component_id: str, before_revision_id: str, after_revision_id: str) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            return self._revision_comparison.compare_component_revisions(
                conn,
                component_id,
                before_revision_id,
                after_revision_id,
            )

    def list_component_usage(self, component_id: str, *, include_history: bool = False) -> list[dict[str, Any]]:
        self.initialize()
        with self._connect() as conn:
            return self._component_history_reads.list_component_usage(
                conn, component_id, include_history=include_history
            )

    def list_component_review_decisions(self, component_id: str) -> list[dict[str, Any]]:
        self.initialize()
        with self._connect() as conn:
            return self._component_history_reads.list_component_review_decisions(conn, component_id)

    def list_component_release_records(self, component_id: str) -> list[dict[str, Any]]:
        self.initialize()
        with self._connect() as conn:
            return self._component_history_reads.list_component_release_records(conn, component_id)

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

    def catalog_asset_source(self, asset_id: str) -> tuple[Path, str, str] | None:
        """One asset's stored bytes, as written -- not the placement rewrite.

        ``get_asset_by_id`` returns what KiCad places: a symbol carries an
        injected footprint reference and the component's fields, a footprint
        carries rewritten 3D-model paths. Those rewrites exist for placement.
        A renderer wants the file as the library holds it, so this resolves the
        canonical path instead of materialising a payload.

        Returns ``(path, content_type, filename)``, or ``None`` when the asset
        is unknown or its file is missing.
        """
        self.initialize()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT canonical_path, asset_type FROM assets WHERE id = %s",
                (asset_id,),
            ).fetchone()
        if not row:
            return None
        path = Path(str(row["canonical_path"] or "")).resolve()
        # Every asset root is a child of the store root. Confining the resolved
        # path keeps a stored value that escaped the store -- or a row written
        # by an older import -- from turning this into an arbitrary file read.
        try:
            path.relative_to(self._store_root.resolve())
        except ValueError:
            return None
        if not path.is_file():
            return None
        return (
            path,
            _content_type_for_asset(str(row["asset_type"] or ""), path),
            path.name,
        )

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
            self._project_import_sessions.create_session(
                conn,
                session_id=session_id,
                scope=scope,
                project_id=project_id,
                project_ids=project_ids or ([project_id] if project_id else []),
                project_revisions=project_revisions or {},
                source_revision=source_revision,
                selection=selection or {},
                actor=actor,
                now=now,
            )
            conn.commit()
        return self.get_project_import_session(session_id) or {}

    def get_project_import_session(self, session_id: str) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            return self._project_import_sessions.get_session(conn, session_id)

    def list_project_import_sessions(self, *, created_by: str = "", include_all: bool = False) -> list[dict[str, Any]]:
        self.initialize()
        with self._connect() as conn:
            session_ids = self._project_import_sessions.list_session_ids(
                conn,
                created_by=created_by,
                include_all=include_all,
            )
        return [session for session_id in session_ids if (session := self.get_project_import_session(session_id)) is not None]

    def update_project_import_session(self, session_id: str, *, status: str, error_message: str = "") -> None:
        if status not in {"queued", "uploading", "scanning", "staged", "failed"}:
            raise ValueError("Unsupported project import session status")
        self.initialize()
        with self._connect() as conn:
            self._project_import_sessions.update_session(
                conn,
                session_id,
                status=status,
                error_message=error_message,
                now=_utc_now_iso(),
            )
            conn.commit()

    def stage_project_import_proposals(self, session_id: str, proposals: list[dict[str, Any]]) -> None:
        self.initialize()
        now = _utc_now_iso()
        with self._connect() as conn:
            self._project_import_sessions.stage_proposals(conn, session_id, proposals, now=now)
            conn.commit()

    def list_project_import_proposals(self, session_id: str) -> list[dict[str, Any]]:
        self.initialize()
        with self._connect() as conn:
            return self._project_import_sessions.list_proposals(conn, session_id)

    def get_project_import_proposal(self, proposal_id: str) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            return self._project_import_sessions.get_proposal(conn, proposal_id)

    def save_project_import_drafts(
        self, session_id: str, drafts: dict[str, dict[str, Any]]
    ) -> int:
        self.initialize()
        if not drafts:
            return 0
        now = _utc_now_iso()
        with self._connect() as conn:
            updated = self._project_import_sessions.save_drafts(
                conn,
                session_id,
                drafts,
                now=now,
            )
            conn.commit()
        return updated

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

        Ordering by usage means the counts have to exist before LIMIT can apply, which
        costs an aggregate over every matching asset. That is affordable once a search
        term has narrowed the set, but not for the empty query the picker fires the
        moment it opens: on a store of ~17k assets that aggregate reads the whole
        revision_assets join and took ~500ms. The unfiltered listing therefore orders
        by the columns idx_assets_kind already covers and counts usage only for the
        page it returns.
        """
        self.initialize()
        plan = self._project_import_assets.prepare_search_assets(
            asset_type=asset_type,
            query=query,
            limit=limit,
        )
        with self._connect() as conn:
            return self._project_import_assets.execute_search_assets(conn, plan)

    def index_project_component_usage(self, proposals: list[dict[str, Any]]) -> dict[str, int]:
        """Index where-used observations even when no import proposal is accepted."""
        self.initialize()
        now = _utc_now_iso()
        with self._connect() as conn:
            result = self._project_import_matching.index_project_component_usage(
                conn,
                proposals,
                observed_at=now,
            )
            conn.commit()
        return result

    def match_component_identities(self, identities: list[dict[str, str]]) -> dict[str, dict[str, Any]]:
        """Resolve manufacturer/MPN identities in one catalog query for import preflight."""
        requested = self._project_import_matching.normalize_identity_requests(identities)
        if not requested:
            return {}
        self.initialize()
        with self._connect() as conn:
            return self._project_import_matching.match_component_identities(conn, requested)

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
        normalized_input = self._project_import_acceptance.build_normalized_input(
            proposal,
            metadata_overrides,
        )
        metadata = normalize_metadata(normalized_input)
        candidates_by_type = self._project_import_assets.group_import_assets(proposal)
        # An asset type may instead be satisfied by an existing catalog asset. That is
        # a reference, not a copy: the same assets row is linked into this revision, so
        # one shared 0603 footprint serves every part that uses it.
        requested_links = self._project_import_assets.normalize_import_asset_links(asset_links or {})
        linked_assets: dict[str, dict[str, Any]] = {}
        if requested_links:
            with self._connect() as conn:
                linked_assets = self._project_import_assets.resolve_import_asset_links(conn, requested_links)
        by_type = self._project_import_assets.select_import_assets(
            candidates_by_type,
            asset_selections=asset_selections,
            linked_assets=linked_assets,
            findings=proposal["findings"],
        )
        self._project_import_assets.validate_project_import_asset_paths(
            self._store_root,
            proposal,
            by_type,
        )

        now = _utc_now_iso()
        with self._connect() as conn:
            self._project_import_acceptance.claim_proposal(
                conn,
                proposal_id,
                now=now,
            )
            self._lock_component_identity(conn, metadata["manufacturer"], metadata["mpn"])
            existing = self._project_import_acceptance.find_existing_component(
                conn,
                metadata["manufacturer"],
                metadata["mpn"],
            )
            component_id = str(existing["id"]) if existing else str(uuid.uuid4())
            import_payload = self._project_import_acceptance.build_import_payload(proposal)
            provenance = import_payload["provenance"]
            import_source = import_payload["import_source"]
            external_id = import_payload["external_id"]
            current_revision = (
                self._revision_row(conn, str(self._component_row(conn, component_id)["current_revision_id"]))
                if existing
                else None
            )
            no_content_change = bool(
                current_revision
                and self._project_import_assets.revision_matches_import(
                    conn,
                    current_revision,
                    metadata,
                    by_type,
                )
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
            self._project_import_matching.record_component_usage(
                conn,
                component_id=component_id,
                provenance=provenance,
                observed_at=now,
                source="project_import",
            )
            self._project_import_acceptance.mark_proposal_accepted(
                conn,
                proposal_id,
                component_id,
                now=now,
            )
            conn.commit()
        return {
            "proposal": self.get_project_import_proposal(proposal_id),
            "component": self.get_component(component_id),
        }

    def reject_project_import_proposal(self, proposal_id: str) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            self._project_import_sessions.reject_proposal(
                conn,
                proposal_id,
                now=_utc_now_iso(),
            )
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
            session_ids = self._project_import_sessions.list_resolved_session_ids(
                conn,
                older_than=older_than,
            )
        return self._project_import_sessions.remove_staging_directories(
            store_root=self._store_root,
            session_ids=session_ids,
        )

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
        plan = self._component_queries.prepare_list_components(
            query=query,
            source=source,
            availability_state=availability_state,
            workflow_stage=workflow_stage,
            validation_status=validation_status,
            category=category,
            include_inactive=include_inactive,
            page=page,
            page_size=page_size,
            released_only=released_only,
            lightweight=lightweight,
            sort_by=sort_by,
            sort_dir=sort_dir,
        )
        with self._connect() as conn:
            return self._component_queries.execute_list_components(conn, plan)

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
                    "identity_kind": str(row.get("identity_kind") or IDENTITY_KIND_MPN),
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
                    "place_enabled": has_symbol and has_footprint and str(row.get("identity_kind") or IDENTITY_KIND_MPN) == IDENTITY_KIND_MPN,
                    "release_status": "released",
                    "workflow_stage": "released",
                    "supply": {
                        "sources": [
                            _supply_source_payload(source)
                            for source in _json_loads(row.get("inventory_sources"), [])
                        ]
                    },
                    "default_representation_id": str(row.get("default_representation_id") or ""),
                    "representation_count": int(row.get("representation_count") or 0),
                    "symbol_variant_count": int(row.get("symbol_variant_count") or 0),
                    "footprint_variant_count": int(row.get("footprint_variant_count") or 0),
                    "representations": [],
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
        runtime = self._catalog_runtime
        if runtime.category_cache is not None and (now - runtime.category_cache_ts) < runtime.category_cache_ttl:
            return runtime.category_cache
        with self._connect() as conn:
            result = self._component_queries.list_categories(conn)
        runtime.category_cache = result
        runtime.category_cache_ts = now
        return result

    def get_component(
        self,
        component_id: str,
        *,
        include_inactive: bool = True,
        released_only: bool = False,
        representation_id: str = "",
    ) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            return self._component_read_models.get_component(
                conn,
                component_id,
                include_inactive=include_inactive,
                released_only=released_only,
                representation_id=representation_id,
            )

    def _representation_asset_id(
        self, conn: Any, revision_id: str, asset_id: str, expected_type: str
    ) -> str | None:
        value = str(asset_id or "").strip()
        if not value:
            return None
        row = conn.execute(
            """
            SELECT asset.id
            FROM revision_assets link
            JOIN assets asset ON asset.id = link.asset_id
            WHERE link.revision_id = %s AND asset.id = %s
              AND link.asset_type = %s AND asset.asset_type = %s
            """,
            (revision_id, value, expected_type, expected_type),
        ).fetchone()
        if not row:
            raise ValueError(f"{expected_type} asset is not attached to this revision")
        return value

    def create_representation(
        self,
        component_id: str,
        *,
        label: str,
        symbol_asset_id: str = "",
        footprint_asset_id: str = "",
        display_order: int = 0,
        make_default: bool = False,
        source_internal_part_number: str = "",
        provenance: dict[str, Any] | None = None,
        expected_revision_id: str,
        actor: str = "",
        change_summary: str = "Add component representation",
    ) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            revision = self._clone_revision(
                conn,
                component_id,
                actor=actor,
                change_kind="representation",
                change_summary=change_summary,
                expected_revision_id=expected_revision_id,
            )
            revision_id = str(revision["id"])
            symbol_id = self._representation_asset_id(conn, revision_id, symbol_asset_id, "symbol")
            footprint_id = self._representation_asset_id(conn, revision_id, footprint_asset_id, "footprint")
            existing_count = int(
                conn.execute(
                    "SELECT COUNT(*) AS total FROM revision_representations WHERE revision_id = %s",
                    (revision_id,),
                ).fetchone()["total"]
            )
            duplicate = conn.execute(
                """
                SELECT 1 FROM revision_representations
                WHERE revision_id = %s
                  AND symbol_asset_id IS NOT DISTINCT FROM %s
                  AND footprint_asset_id IS NOT DISTINCT FROM %s
                """,
                (revision_id, symbol_id, footprint_id),
            ).fetchone()
            if duplicate:
                raise ValueError("This symbol-footprint pair already has a representation")
            is_default = bool(make_default or existing_count == 0)
            if is_default:
                conn.execute(
                    "UPDATE revision_representations SET is_default = 0, updated_at = %s WHERE revision_id = %s",
                    (_utc_now_iso(), revision_id),
                )
            now = _utc_now_iso()
            conn.execute(
                """
                INSERT INTO revision_representations (
                    id, revision_id, label, symbol_asset_id, footprint_asset_id, is_default,
                    display_order, source_internal_part_number, provenance_json, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    str(uuid.uuid4()), revision_id, label.strip() or "Representation",
                    symbol_id, footprint_id, 1 if is_default else 0, int(display_order),
                    source_internal_part_number.strip(),
                    json.dumps(provenance or {}, sort_keys=True, separators=(",", ":")), now, now,
                ),
            )
            self._finalize_revision(
                conn,
                component_id=component_id,
                revision_id=revision_id,
                event_type="revision.created",
                actor=actor,
                details={"change_kind": "representation", "change_summary": change_summary},
            )
            conn.commit()
        return self.get_component(component_id) or {}

    def _current_representation_row(
        self, conn: Any, component_id: str, representation_id: str
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        _, revision = self._active_revision_row(conn, component_id, released=False)
        if not revision:
            raise ValueError("Component not found")
        row = conn.execute(
            "SELECT * FROM revision_representations WHERE id = %s AND revision_id = %s",
            (representation_id, revision["id"]),
        ).fetchone()
        if not row:
            raise ValueError("Representation was not found on the current revision")
        return revision, dict(row)

    def update_representation(
        self,
        component_id: str,
        representation_id: str,
        *,
        updates: dict[str, Any],
        expected_revision_id: str,
        actor: str = "",
        change_summary: str = "Update component representation",
    ) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            current, original = self._current_representation_row(conn, component_id, representation_id)
            if str(current["id"]) != expected_revision_id:
                raise ValueError("Component revision conflict: refresh the component before saving")
            revision = self._clone_revision(
                conn, component_id, actor=actor, change_kind="representation",
                change_summary=change_summary, expected_revision_id=expected_revision_id,
            )
            revision_id = str(revision["id"])
            cloned = conn.execute(
                """
                SELECT * FROM revision_representations
                WHERE revision_id = %s
                  AND symbol_asset_id IS NOT DISTINCT FROM %s
                  AND footprint_asset_id IS NOT DISTINCT FROM %s
                ORDER BY display_order, id LIMIT 1
                """,
                (revision_id, original["symbol_asset_id"], original["footprint_asset_id"]),
            ).fetchone()
            if not cloned:
                raise ValueError("Cloned representation could not be resolved")
            symbol_id = self._representation_asset_id(
                conn, revision_id, str(updates.get("symbol_asset_id", cloned["symbol_asset_id"]) or ""), "symbol"
            )
            footprint_id = self._representation_asset_id(
                conn, revision_id, str(updates.get("footprint_asset_id", cloned["footprint_asset_id"]) or ""), "footprint"
            )
            make_default = bool(updates.get("is_default", cloned["is_default"]))
            if bool(cloned["is_default"]) and "is_default" in updates and not make_default:
                raise ValueError("The default representation cannot be unset; make another representation default")
            now = _utc_now_iso()
            if make_default:
                conn.execute(
                    "UPDATE revision_representations SET is_default = 0, updated_at = %s WHERE revision_id = %s",
                    (now, revision_id),
                )
            conn.execute(
                """
                UPDATE revision_representations
                SET label = %s, symbol_asset_id = %s, footprint_asset_id = %s,
                    is_default = %s, display_order = %s, updated_at = %s
                WHERE id = %s
                """,
                (
                    str(updates.get("label", cloned["label"]) or "Representation").strip(),
                    symbol_id, footprint_id, 1 if make_default else 0,
                    int(updates.get("display_order", cloned["display_order"])), now, cloned["id"],
                ),
            )
            self._finalize_revision(
                conn, component_id=component_id, revision_id=revision_id,
                event_type="revision.created", actor=actor,
                details={"change_kind": "representation", "change_summary": change_summary},
            )
            conn.commit()
        return self.get_component(component_id) or {}

    def delete_representation(
        self,
        component_id: str,
        representation_id: str,
        *,
        expected_revision_id: str,
        actor: str = "",
    ) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            current, original = self._current_representation_row(conn, component_id, representation_id)
            if str(current["id"]) != expected_revision_id:
                raise ValueError("Component revision conflict: refresh the component before saving")
            revision = self._clone_revision(
                conn, component_id, actor=actor, change_kind="representation",
                change_summary="Delete component representation", expected_revision_id=expected_revision_id,
            )
            revision_id = str(revision["id"])
            cloned = conn.execute(
                """
                SELECT id, is_default FROM revision_representations
                WHERE revision_id = %s
                  AND symbol_asset_id IS NOT DISTINCT FROM %s
                  AND footprint_asset_id IS NOT DISTINCT FROM %s
                ORDER BY display_order, id LIMIT 1
                """,
                (revision_id, original["symbol_asset_id"], original["footprint_asset_id"]),
            ).fetchone()
            if cloned:
                was_default = bool(cloned["is_default"])
                conn.execute("DELETE FROM revision_representations WHERE id = %s", (cloned["id"],))
                if was_default:
                    replacement = conn.execute(
                        "SELECT id FROM revision_representations WHERE revision_id = %s ORDER BY display_order, id LIMIT 1",
                        (revision_id,),
                    ).fetchone()
                    if replacement:
                        conn.execute(
                            "UPDATE revision_representations SET is_default = 1, updated_at = %s WHERE id = %s",
                            (_utc_now_iso(), replacement["id"]),
                        )
            self._finalize_revision(
                conn, component_id=component_id, revision_id=revision_id,
                event_type="revision.created", actor=actor,
                details={"change_kind": "representation", "change_summary": "Delete component representation"},
            )
            conn.commit()
        return self.get_component(component_id) or {}

    def create_manual_component(self, *, actor: str = "", change_summary: str = "Create component", **payload: Any) -> dict[str, Any]:
        self.initialize()
        metadata = normalize_metadata(payload)
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
        self._metadata_schema.ensure_extra_field_definitions(
            conn,
            metadata.get("extra_fields", {}).keys(),
            actor=actor or "system:catalog",
        )
        self._assert_component_identity_available(
            conn,
            manufacturer=metadata["manufacturer"],
            mpn=metadata["mpn"],
            identity_kind=metadata["identity_kind"],
            identity_source=metadata["identity_source"],
            source_internal_part_number=metadata["source_internal_part_number"],
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
                    normalized_manufacturer = %s, normalized_mpn = %s, mpn_source = %s,
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
                    revision["id"],
                ),
            )
            conn.execute(
                """
                UPDATE components
                SET identity_kind = %s, identity_source = %s,
                    normalized_manufacturer = %s, normalized_part_number = %s,
                    updated_at = %s
                WHERE id = %s
                """,
                (
                    metadata["identity_kind"],
                    metadata["identity_source"] if metadata["identity_kind"] == IDENTITY_KIND_PROVISIONAL_IPN else "",
                    metadata["normalized_manufacturer"] if metadata["identity_kind"] == IDENTITY_KIND_MPN else "",
                    metadata["normalized_part_number"],
                    now,
                    existing_component_id,
                ),
            )
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

        slug = self._unique_slug(
            conn,
            metadata["mpn"] or metadata["source_internal_part_number"] or metadata["value"],
        )
        revision_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO components (
                id, slug, identity_kind, identity_source, normalized_manufacturer, normalized_part_number,
                source, external_source, external_id, is_active, current_revision_id,
                released_revision_id, created_at, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 1, %s, '', %s, %s)
            """,
            (
                component_id,
                slug,
                metadata["identity_kind"],
                metadata["identity_source"] if metadata["identity_kind"] == IDENTITY_KIND_PROVISIONAL_IPN else "",
                metadata["normalized_manufacturer"] if metadata["identity_kind"] == IDENTITY_KIND_MPN else "",
                metadata["normalized_part_number"],
                source,
                external_source,
                external_id,
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
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
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
                REVISION_MANIFEST_A3,
                "open",
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
            merged["identity_kind"] = str(component.get("identity_kind") or IDENTITY_KIND_MPN)
            merged["identity_source"] = str(component.get("identity_source") or "")
            if merged["identity_kind"] == IDENTITY_KIND_PROVISIONAL_IPN:
                merged["source_internal_part_number"] = str(component.get("normalized_part_number") or "")
                if target_mpn.strip():
                    merged["identity_kind"] = IDENTITY_KIND_MPN
                    merged["identity_source"] = ""
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
            metadata = normalize_metadata(merged)
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

    def list_metadata_fields(self, *, include_archived: bool = False) -> list[dict[str, Any]]:
        self.initialize()
        with self._connect() as conn:
            return self._metadata_fields.list_fields(conn, include_archived=include_archived)

    def create_metadata_field(self, payload: dict[str, Any], *, actor: str) -> dict[str, Any]:
        self.initialize()
        prepared = self._metadata_fields.prepare_create_field(payload)
        with self._connect() as conn:
            after = self._metadata_fields.create_field(conn, prepared, actor)
            conn.commit()
        return after

    def update_metadata_field(self, field_id: str, payload: dict[str, Any], *, actor: str) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            after = self._metadata_fields.update_field(conn, field_id, payload, actor)
            conn.commit()
        return after

    def set_metadata_field_archived(self, field_id: str, archived: bool, *, actor: str) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            after = self._metadata_fields.set_field_archived(conn, field_id, archived, actor)
            conn.commit()
        return after

    def get_metadata_grid_preferences(self, user_email: str) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            return self._metadata_grid.get_preferences(conn, user_email)

    def save_metadata_grid_preferences(self, user_email: str, layout: dict[str, Any]) -> dict[str, Any]:
        self.initialize()
        prepared = self._metadata_grid.prepare_preferences(user_email, layout)
        with self._connect() as conn:
            self._metadata_grid.save_preferences(conn, prepared)
            conn.commit()
        return prepared.layout

    def metadata_grid(self, *, field_keys: list[str] | None = None, **filters: Any) -> dict[str, Any]:
        fields = self.list_metadata_fields()
        if field_keys is not None:
            requested = {str(key) for key in field_keys}
            fields = [field for field in fields if str(field["key"]) in requested]
        result = self.list_components(lightweight=True, include_inactive=False, **filters)
        component_ids = [str(item["id"]) for item in result["items"]]
        if component_ids:
            prepared = self._metadata_grid.prepare_rows(component_ids, fields)
            with self._connect() as conn:
                rows = self._metadata_grid.fetch_rows(conn, prepared)
            self._metadata_grid.hydrate_rows(prepared, rows, result["items"])
        return {**result, "schema": METADATA_SCHEMA_VERSION, "fields": fields}

    def get_metadata_batch(self, batch_id: str) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            return self._metadata_batches.batch_payload(conn, batch_id)

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
            duplicate_identities = self._metadata_batch_staging.duplicate_identities(conn, items)
            self._metadata_batches.insert_batch(
                conn,
                batch_id=batch_id,
                source=source,
                status="needs_fields" if proposed_fields else "ready",
                schema_version=METADATA_SCHEMA_VERSION,
                change_summary=change_summary.strip() or "Bulk update component metadata",
                unknown_fields_json=json.dumps(proposed_fields or [], separators=(",", ":")),
                created_by=actor,
                total_items=len(items),
                created_at=now,
                updated_at=now,
            )
            for raw_item in items:
                preparation = self._metadata_batch_staging.prepare_item(
                    conn, raw_item, fields, duplicate_identities
                )
                component_id = preparation.component_id
                expected_revision_id = preparation.expected_revision_id
                normalized_patch = preparation.normalized_patch
                diff = preparation.diff
                errors = list(preparation.errors)
                if preparation.target_identity is not None:
                    target_manufacturer, target_mpn, target_name = preparation.target_identity
                    try:
                        self._assert_component_identity_available(
                            conn,
                            manufacturer=target_manufacturer,
                            mpn=target_mpn,
                            name=target_name,
                            component_id=component_id,
                            acquire_identity_lock=False,
                        )
                    except ValueError as exc:
                        errors.append(str(exc))
                status = "invalid" if errors else "valid" if diff else "noop"
                if status == "valid":
                    valid_count += 1
                self._metadata_batches.insert_batch_item(
                    conn,
                    item_id=str(uuid.uuid4()),
                    batch_id=batch_id,
                    component_id=component_id,
                    expected_revision_id=expected_revision_id,
                    patch_json=json.dumps(normalized_patch, sort_keys=True, separators=(",", ":")),
                    diff_json=json.dumps(diff, separators=(",", ":")),
                    validation_status=status,
                    error_message="; ".join(errors),
                    created_at=now,
                    updated_at=now,
                )
            self._metadata_batches.update_valid_items(conn, batch_id, valid_count)
            conn.commit()
            return self._metadata_batches.batch_payload(conn, batch_id) or {}

    def approve_metadata_batch_fields(self, batch_id: str, *, actor: str) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            proposals = self._metadata_batches.fetch_batch_field_proposals(conn, batch_id)
            if proposals is None:
                raise ValueError("Metadata batch not found")
        for proposal in proposals:
            try:
                self.create_metadata_field(proposal, actor=actor)
            except ValueError as exc:
                if "already exists" not in str(exc):
                    raise
        with self._connect() as conn:
            self._metadata_batches.mark_fields_approved(
                conn,
                batch_id,
                _utc_now_iso(),
            )
            conn.commit()
            return self._metadata_batches.batch_payload(conn, batch_id) or {}

    def _inherit_validation_evidence(self, conn: Any, parent_revision_id: str, revision_id: str) -> None:
        return self._revision_kernel.inherit_validation_evidence(
            conn,
            parent_revision_id,
            revision_id,
        )

    def apply_metadata_batch_item(self, item_id: str, *, actor: str) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            item = self._metadata_batches.fetch_item_for_apply(conn, item_id)
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
            metadata = normalize_metadata(merged)
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
            self._metadata_batches.mark_item_applied(
                conn,
                item_id,
                revision_id,
                _utc_now_iso(),
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
            batch = self._metadata_batches.fetch_batch_for_apply(conn, batch_id)
            if not batch:
                raise ValueError("Metadata batch not found")
            if str(batch["status"]) == "needs_fields":
                raise ValueError("Unknown CSV fields must be approved before applying")
            rows = self._metadata_batches.fetch_valid_item_rows(conn, batch_id)
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
                    self._metadata_batches.mark_item_conflict(
                        conn,
                        item_id,
                        str(exc),
                        _utc_now_iso(),
                    )
                    conn.commit()
            if progress_callback:
                progress_callback({"completed": index + 1, "total": len(ids), "applied": applied, "failed": failed})
        with self._connect() as conn:
            totals = self._metadata_batches.calculate_batch_totals(conn, batch_id)
            total_applied = int(totals["applied"] or 0)
            total_failed = int(totals["failed"] or 0)
            remaining = int(totals["remaining"] or 0)
            status = "completed" if total_failed == 0 and remaining == 0 else "partial"
            self._metadata_batches.finalize_batch(
                conn,
                batch_id=batch_id,
                status=status,
                valid_items=remaining,
                applied_items=total_applied,
                failed_items=total_failed,
                updated_at=_utc_now_iso(),
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
                normalized = normalize_metadata(payload)
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

    def export_inventory_csv(self) -> str:
        self.initialize()
        output = io.StringIO()
        writer = csv.DictWriter(
            output,
            fieldnames=(
                "component_id", "manufacturer", "mpn", "quantity", "uom", "inventory_status"
            ),
        )
        writer.writeheader()
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT component.id AS component_id, revision.manufacturer, revision.mpn,
                       COALESCE(SUM(inventory.quantity), 0) AS quantity,
                       COALESCE(MIN(inventory.uom), '') AS uom,
                       COALESCE(MIN(inventory.inventory_status), '') AS inventory_status
                FROM components component
                JOIN component_revisions revision ON revision.id = component.current_revision_id
                LEFT JOIN inventory_levels inventory
                  ON inventory.component_id = component.id AND inventory.source = 'csv'
                WHERE component.identity_kind = 'mpn'
                GROUP BY component.id, revision.manufacturer, revision.mpn
                ORDER BY lower(revision.manufacturer), lower(revision.mpn), component.id
                """
            ).fetchall()
        for row in rows:
            writer.writerow(dict(row))
        return output.getvalue()

    def import_inventory_csv(self, file_content: str) -> dict[str, Any]:
        self.initialize()
        reader = csv.DictReader(io.StringIO(file_content))
        if not reader.fieldnames:
            raise ValueError("CSV file is empty")
        updated = 0
        not_found = 0
        errors: list[str] = []
        with self._connect() as conn:
            for index, row in enumerate(reader, start=2):
                component_id = str(row.get("component_id") or "").strip()
                manufacturer = str(row.get("manufacturer") or "").strip()
                mpn = str(row.get("manufacturer_part_number") or row.get("mpn") or "").strip()
                if not component_id and (not manufacturer or not mpn):
                    errors.append(f"Row {index}: component_id or manufacturer+mpn is required")
                    continue
                if component_id:
                    component = conn.execute(
                        """
                        SELECT component.id, component.identity_kind,
                               component.normalized_manufacturer, component.normalized_part_number
                        FROM components component WHERE component.id = %s
                        """,
                        (component_id,),
                    ).fetchone()
                else:
                    component = conn.execute(
                        """
                        SELECT id, identity_kind, normalized_manufacturer, normalized_part_number
                        FROM components
                        WHERE identity_kind = 'mpn'
                          AND normalized_manufacturer = %s AND normalized_part_number = %s
                        """,
                        (normalize_identity_value(manufacturer), normalize_identity_value(mpn)),
                    ).fetchone()
                if not component:
                    not_found += 1
                    errors.append(f"Row {index}: component identity was not found")
                    continue
                if str(component["identity_kind"]) != IDENTITY_KIND_MPN:
                    errors.append(f"Row {index}: provisional components cannot receive MPN inventory")
                    continue
                if manufacturer and normalize_identity_value(manufacturer) != str(component["normalized_manufacturer"]):
                    errors.append(f"Row {index}: manufacturer does not match component_id")
                    continue
                if mpn and normalize_identity_value(mpn) != str(component["normalized_part_number"]):
                    errors.append(f"Row {index}: mpn does not match component_id")
                    continue
                try:
                    quantity = float(row.get("quantity") or row.get("stock_quantity") or 0)
                except (TypeError, ValueError):
                    errors.append(f"Row {index}: quantity must be numeric")
                    continue
                now = _utc_now_iso()
                conn.execute(
                    """
                    INSERT INTO inventory_levels (
                        source, component_id, location_key, source_record_id, quantity, uom,
                        inventory_status, fetch_status, fetched_at, updated_at
                    ) VALUES ('csv', %s, '', %s, %s, %s, %s, 'ok', %s, %s)
                    ON CONFLICT(source, component_id, location_key) DO UPDATE SET
                        source_record_id = EXCLUDED.source_record_id,
                        quantity = EXCLUDED.quantity,
                        uom = EXCLUDED.uom,
                        inventory_status = EXCLUDED.inventory_status,
                        fetch_status = EXCLUDED.fetch_status,
                        fetched_at = EXCLUDED.fetched_at,
                        updated_at = EXCLUDED.updated_at
                    """,
                    (
                        component["id"],
                        f"csv:{index}",
                        quantity,
                        str(row.get("uom") or row.get("stock_uom") or ""),
                        str(row.get("inventory_status") or ""),
                        now,
                        now,
                    ),
                )
                updated += 1
            conn.commit()
        return {"updated": updated, "not_found": not_found, "errors": errors}

    def _browse_cache_lock_for(self, asset_type: str) -> threading.Lock:
        return self._runtime_for_compat().browse_cache_lock_for(asset_type)

    def _invalidate_browse_cache(self) -> None:
        """Drop the stored-file listings after the store on disk changes.

        Called from the one place bytes land in the store, so the asset picker
        never offers a file that has just been rewritten elsewhere, nor hides
        one that has just arrived. Clearing every type is deliberate: the
        listings are rebuilt lazily on the next browse, and a write does not
        reliably tell us which tree it touched.
        """
        self._runtime_for_compat().invalidate_browse_cache()

    def browse_library_assets(
        self,
        asset_type: str,
        q: str = "",
        limit: int = 100,
    ) -> dict[str, Any]:
        """List stored asset files without walking the store on every request.

        The recursive walk over the symbol/footprint trees is expensive once
        libraries hold thousands of files, so the sorted listing is cached per
        asset type and reused across requests. ``q`` filters the cached listing
        and ``limit`` bounds the response so the picker never renders the whole
        store. Writes into the store drop the cache, so the TTL is a backstop
        for changes made outside this process rather than the freshness bound.
        """
        self.initialize()
        root = self._asset_root(asset_type)
        now = time.monotonic()
        with self._browse_cache_lock_for(asset_type):
            with self._catalog_runtime.browse_cache_lock:
                cached = self._browse_cache.get(asset_type)
                generation = self._catalog_runtime.browse_cache_generation
            if cached is None or now - cached[0] > _ASSET_BROWSE_CACHE_TTL_SECONDS:
                if asset_type == "symbol":
                    paths = root.rglob("*.kicad_sym")
                elif asset_type == "footprint":
                    paths = root.rglob("*.kicad_mod")
                elif asset_type == "3dmodel":
                    paths = [*root.rglob("*.step"), *root.rglob("*.stp")]
                else:
                    paths = root.rglob("*")
                files = sorted(path.relative_to(root).as_posix() for path in paths if path.is_file())
                with self._catalog_runtime.browse_cache_lock:
                    # A write that landed while this walk was running already
                    # cleared the cache. Storing the result now would reinstate a
                    # listing taken before that write and hide it for a full TTL,
                    # so leave the cache empty and let the next browse rebuild it.
                    if self._catalog_runtime.browse_cache_generation == generation:
                        self._browse_cache[asset_type] = (now, files)
                all_files = files
            else:
                all_files = cached[1]
        needle = q.strip().lower()
        matches = [path for path in all_files if needle in path.lower()] if needle else list(all_files)
        return {"files": matches[: max(1, limit)], "total": len(matches)}

    def _attach_asset_revision(
        self,
        conn: Any,
        *,
        component_id: str,
        asset: dict[str, Any],
        required: bool,
        actor: str,
        change_summary: str,
        counterpart_asset_id: str = "",
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
        if existing and bool(existing["required"]) == required and not counterpart_asset_id:
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
        self._link_asset_to_revision(
            conn,
            revision["id"],
            asset,
            required=required,
            counterpart_asset_id=counterpart_asset_id,
        )
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
            self._invalidate_browse_cache()
            return immutable_destination
        destination.write_bytes(payload)
        self._invalidate_browse_cache()
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
                [
                    "fp", "export", "svg", "--output", tmp_dir,
                    "--footprint", isolated_footprint.stem, str(isolated_library),
                ]
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

    def _link_asset_to_revision(
        self,
        conn: Any,
        revision_id: str,
        asset: dict[str, Any],
        *,
        required: bool,
        counterpart_asset_id: str = "",
    ) -> None:
        now = _utc_now_iso()
        if str(asset["asset_type"]) in PLACE_REQUIRED_ASSET_TYPES:
            kind = PREVIEW_KIND_SYMBOL if str(asset["asset_type"]) == "symbol" else PREVIEW_KIND_FOOTPRINT
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
            default_representation = conn.execute(
                "SELECT id, symbol_asset_id, footprint_asset_id FROM revision_representations "
                "WHERE revision_id = %s AND is_default = 1 LIMIT 1",
                (revision_id,),
            ).fetchone()
            if counterpart_asset_id:
                expected_type = "footprint" if str(asset["asset_type"]) == "symbol" else "symbol"
                counterpart = conn.execute(
                    """
                    SELECT linked.id
                    FROM revision_assets link
                    JOIN assets linked ON linked.id = link.asset_id
                    WHERE link.revision_id = %s AND linked.id = %s
                      AND link.asset_type = %s AND linked.asset_type = %s
                    """,
                    (revision_id, counterpart_asset_id, expected_type, expected_type),
                ).fetchone()
                if not counterpart:
                    raise ValueError("Selected counterpart asset is not attached to this revision")
            if default_representation:
                missing_symbol = not default_representation["symbol_asset_id"]
                missing_footprint = not default_representation["footprint_asset_id"]
                fills_default = (
                    str(asset["asset_type"]) == "symbol" and missing_symbol
                ) or (
                    str(asset["asset_type"]) == "footprint" and missing_footprint
                )
                default_counterpart_id = (
                    str(default_representation["footprint_asset_id"] or "")
                    if str(asset["asset_type"]) == "symbol"
                    else str(default_representation["symbol_asset_id"] or "")
                )
                if fills_default and (
                    not counterpart_asset_id or counterpart_asset_id == default_counterpart_id
                ):
                    column = (
                        "symbol_asset_id"
                        if str(asset["asset_type"]) == "symbol"
                        else "footprint_asset_id"
                    )
                    conn.execute(
                        f"UPDATE revision_representations SET {column} = %s, updated_at = %s WHERE id = %s",
                        (str(asset["id"]), now, str(default_representation["id"])),
                    )
                    return
            symbol_id = (
                str(asset["id"])
                if str(asset["asset_type"]) == "symbol"
                else counterpart_asset_id or str(default_representation["symbol_asset_id"] or "") if default_representation else counterpart_asset_id
            )
            footprint_id = (
                str(asset["id"])
                if str(asset["asset_type"]) == "footprint"
                else counterpart_asset_id or str(default_representation["footprint_asset_id"] or "") if default_representation else counterpart_asset_id
            )
            duplicate = conn.execute(
                """
                SELECT 1 FROM revision_representations
                WHERE revision_id = %s
                  AND symbol_asset_id IS NOT DISTINCT FROM %s
                  AND footprint_asset_id IS NOT DISTINCT FROM %s
                """,
                (revision_id, symbol_id or None, footprint_id or None),
            ).fetchone()
            if not duplicate:
                count = int(
                    conn.execute(
                        "SELECT COUNT(*) AS total FROM revision_representations WHERE revision_id = %s",
                        (revision_id,),
                    ).fetchone()["total"]
                )
                conn.execute(
                    """
                    INSERT INTO revision_representations (
                        id, revision_id, label, symbol_asset_id, footprint_asset_id, is_default,
                        display_order, source_internal_part_number, provenance_json, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, '', '{}', %s, %s)
                    """,
                    (
                        str(uuid.uuid4()), revision_id, str(asset.get("target_name") or asset.get("name") or "Representation"),
                        symbol_id or None, footprint_id or None, 1 if count == 0 else 0, count, now, now,
                    ),
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
        counterpart_asset_id: str = "",
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
                counterpart_asset_id=counterpart_asset_id,
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
        counterpart_asset_id: str = "",
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
                counterpart_asset_id=counterpart_asset_id,
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
        counterpart_asset_id: str = "",
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
                counterpart_asset_id=counterpart_asset_id,
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
        if asset_type in PLACE_REQUIRED_ASSET_TYPES:
            raise ValueError(
                "Symbol and footprint assets must be detached by asset ID after removing or reassigning their representations"
            )
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

    def detach_asset_by_id(
        self,
        component_id: str,
        asset_id: str,
        *,
        expected_revision_id: str,
        actor: str = "",
    ) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            _, current = self._active_revision_row(conn, component_id, released=False)
            if not current:
                raise ValueError("Component not found")
            if str(current["id"]) != expected_revision_id:
                raise ValueError("Component revision conflict: refresh the component before saving")
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
                raise ValueError("Asset is referenced by a representation; remove or reassign it first")
            revision = self._clone_revision(
                conn, component_id, actor=actor, change_kind="asset",
                change_summary=f"Detach {linked['asset_type']} asset",
                expected_revision_id=expected_revision_id,
            )
            revision_id = str(revision["id"])
            for table in (
                "revision_previews", "revision_preview_outputs",
                "revision_validation_evidence_links", "revision_assets",
            ):
                conn.execute(
                    f"DELETE FROM {table} WHERE revision_id = %s AND asset_id = %s",
                    (revision_id, asset_id),
                )
            self._finalize_revision(
                conn, component_id=component_id, revision_id=revision_id,
                event_type="revision.created", actor=actor,
                details={"change_kind": "asset", "change_summary": "Detach asset", "asset_id": asset_id},
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
        report_dir = self.validation_root / run_id
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
            path.relative_to(self.validation_root)
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
                and release_status == "done"
                and str(revision.get("created_by") or "").casefold() == actor.casefold()
                and not self_approval_override_reason.strip()
            ):
                raise ValueError("Two-person approval required: revision authors cannot approve their own revision")
            if (
                release_status in {"done", "released"}
                and str(component.get("identity_kind") or IDENTITY_KIND_MPN) != IDENTITY_KIND_MPN
            ):
                raise ValueError("Provisional components require a manufacturer part number before approval or release")

            assets = self._load_assets_for_revision(conn, revision["id"])
            validation = self._component_validation_summary(conn, str(revision["id"]), assets)
            policy_snapshot = {
                "two_person_approval": True,
                "klc_release_gate": self._klc_release_gate(),
            }
            default_representation = conn.execute(
                """
                SELECT symbol_asset_id, footprint_asset_id
                FROM revision_representations
                WHERE revision_id = %s AND is_default = 1
                LIMIT 1
                """,
                (revision["id"],),
            ).fetchone()
            if release_status == "released" and (
                not default_representation
                or not default_representation["symbol_asset_id"]
                or not default_representation["footprint_asset_id"]
            ):
                raise ValueError("Cannot release component without one complete default representation")
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

    def _placement_assets(
        self, conn: Any, revision_id: str, representation_id: str = ""
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
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
        all_assets = self._load_assets_for_revision(conn, revision_id)
        selected_ids = {str(row["symbol_asset_id"]), str(row["footprint_asset_id"])}
        assets = [
            asset
            for asset in all_assets
            if str(asset["asset_type"]) in {"3dmodel", "spice"} or str(asset["id"]) in selected_ids
        ]
        if len([asset for asset in assets if str(asset["id"]) in selected_ids]) != 2:
            raise ValueError("Selected representation references unavailable assets")
        return dict(row), assets

    def build_manifest(
        self, component_id: str, base_url: str, representation_id: str = ""
    ) -> dict[str, Any] | None:
        self.initialize()
        component = self.get_component(component_id, include_inactive=False, released_only=True)
        if not component:
            return None
        if not component["place_enabled"]:
            raise ValueError("Component is not placeable because it is not released or required files are missing")
        with self._connect() as conn:
            representation, assets = self._placement_assets(
                conn, component["revision_id"], representation_id
            )
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
                        asset["id"], component["revision_id"], base_url,
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
        self, component_id: str, representation_id: str = ""
    ) -> dict[str, Any] | None:
        self.initialize()
        component = self.get_component(component_id, include_inactive=False, released_only=True)
        if not component:
            return None
        if not component["place_enabled"]:
            raise ValueError("Component is not placeable because it is not released or required files are missing")
        with self._connect() as conn:
            representation, assets = self._placement_assets(
                conn, component["revision_id"], representation_id
            )
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
            "representation_id": str(representation["id"]),
            "library": next(str(a["target_library"]) for a in assets if a["asset_type"] == "symbol"),
            "symbol_name": next(str(a["target_name"]) for a in assets if a["asset_type"] == "symbol"),
            "compression": "NONE",
            "data": base64.b64encode(json.dumps(bundle_entries, separators=(",", ":")).encode("utf-8")).decode("ascii"),
        }

    def get_asset_by_id(
        self, asset_id: str, *, revision_id: str = "", representation_id: str = ""
    ) -> dict[str, Any] | None:
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
            if effective_revision_id and representation_id:
                _, assets_for_revision = self._placement_assets(
                    conn, effective_revision_id, representation_id
                )
            else:
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

    def build_signed_asset_url(
        self, asset_id: str, revision_id: str, base_url: str, ttl_seconds: int = 300,
        *, representation_id: str = "",
    ) -> str:
        expires_at = int(time.time()) + ttl_seconds
        signature = self._sign(f"{asset_id}:{revision_id}:{representation_id}:{expires_at}")
        return (
            f"{base_url.rstrip('/')}/api/remote-provider/assets/{asset_id}?rev={revision_id}"
            f"&representation={representation_id}&exp={expires_at}&sig={signature}"
        )

    def validate_asset_signature(
        self, asset_id: str, revision_id: str, expires_at: int, signature: str,
        representation_id: str = "",
    ) -> bool:
        if expires_at <= int(time.time()):
            return False
        return hmac.compare_digest(
            self._sign(f"{asset_id}:{revision_id}:{representation_id}:{expires_at}"), signature
        )

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
        default_representation = next(
            (item for item in component.get("representations", []) if item.get("is_default")),
            None,
        )
        symbol_asset = default_representation.get("symbol") if default_representation else None
        footprint_asset = default_representation.get("footprint") if default_representation else None
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
        _, assets = self._placement_assets(conn, component["revision_id"])
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
        export_root = self.export_root
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
