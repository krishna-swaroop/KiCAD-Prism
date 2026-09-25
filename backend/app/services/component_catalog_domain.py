from __future__ import annotations

import json
import logging
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterator

from app.services.catalog.collaborators import build_catalog_collaborators
from app.services.catalog.component_history import CatalogComponentHistoryReads
from app.services.catalog.component_read_models import (
    CatalogComponentReadModels,
    SUPPLY_KIND_LOCAL,
    SUPPLY_KIND_VENDOR,
    SUPPLY_LOCAL_SOURCE_NAMES,
    SUPPLY_VENDOR_SOURCE_NAMES,
    supply_source_payload as _supply_source_payload,
)
from app.services.catalog.component_writer import SOURCE_EXTERNAL, SOURCE_MANUAL, CatalogComponentWriter
from app.services.catalog.component_queries import CatalogComponentQueries
from app.services.catalog.dbl_export import (
    DBL_COMMON_COLUMNS,
    CatalogDblExport,
    dbl_row_for_component,
    dbl_symbol_library_name as _dbl_symbol_library_name,
    part_number_nocolon as _part_number_nocolon,
    quote_identifier as _quote_identifier,
    sexpr_string as _sexpr_string,
    write_dbl_config,
)
from app.services.catalog.health import CatalogHealth
from app.services.catalog.klc_validation import (
    VALIDATION_SEVERITY_ERROR,
    VALIDATION_SEVERITY_INFO,
    VALIDATION_SEVERITY_WARNING,
    CatalogKlcValidation,
)
from app.services.catalog.asset_browser import CatalogAssetBrowser
from app.services.catalog.asset_files import (
    CatalogAssetFiles,
    content_type_for_asset as _content_type_for_asset,
    discover_footprint_name_in_text as _discover_footprint_name_in_text,
    discover_symbol_names_in_text as _discover_symbol_names_in_text,
)
from app.services.catalog.asset_imports import CatalogAssetImports
from app.services.catalog.asset_links import CatalogAssetLinks
from app.services.catalog.asset_registry import CatalogAssetRegistry
from app.services.catalog.asset_types import (
    PLACE_REQUIRED_ASSET_TYPES,
    PREVIEW_KIND_FOOTPRINT,
    PREVIEW_KIND_SYMBOL,
    SUPPORTED_ASSET_TYPES,
)
from app.services.catalog.kicad_cli import KicadCliRunner
from app.services.catalog.locking import CatalogLockOperations, NoopCatalogLocks
from app.services.catalog.metadata_batch_application import CatalogMetadataBatchApplication
from app.services.catalog.metadata_batches import CatalogMetadataBatches
from app.services.catalog.metadata_batch_staging import CatalogMetadataBatchStaging
from app.services.catalog.metadata_csv import (
    CSV_ASSET_COLUMNS,
    CSV_REQUIRED_COLUMNS,
    CSV_SPREADSHEET_TEXT_GUARD,
    CatalogMetadataCsv,
)
from app.services.catalog.inventory_csv import CatalogInventoryCsv
from app.services.catalog.metadata_batch_workflow import CatalogMetadataBatchWorkflow
from app.services.catalog.metadata_csv_import import CatalogMetadataCsvImporter
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
    sanitize_name as _sanitize_name,
    slugify as _slugify,
    utc_now_iso as _utc_now_iso,
)
from app.services.catalog.project_import_sessions import CatalogProjectImportSessions
from app.services.catalog.project_import_matching import CatalogProjectImportMatching
from app.services.catalog.project_import_assets import CatalogProjectImportAssets
from app.services.catalog.provider_tokens import CatalogProviderTokens
from app.services.catalog.project_import_acceptance import CatalogProjectImportAcceptance
from app.services.catalog.placement import CatalogPlacement
from app.services.catalog.placement_payloads import (
    SYMBOL_METADATA_FIELD_ORDER,
    extract_top_level_symbol_properties as _extract_top_level_symbol_properties,
    materialize_asset,
    remote_library_nickname as _remote_library_nickname,
    rewrite_footprint_payload as _rewrite_footprint_payload,
    rewrite_symbol_payload as _rewrite_symbol_payload,
    symbol_metadata_fields as _symbol_metadata_fields,
    symbol_property_block as _symbol_property_block,
)
from app.services.catalog.preview_pipeline import (
    CatalogPreview,
    CatalogPreviewPipeline,
    PREVIEW_PIPELINE_VERSION,
)
from app.services.catalog.preview_renderer import (
    CatalogPreviewRenderer,
    PREVIEW_STATUS_FAILED,
    PREVIEW_STATUS_READY,
)
from app.services.catalog.preview_store import CatalogPreviewStore
from app.services.catalog.release_workflow import CatalogReleaseWorkflow
from app.services.catalog.remote_heads import CatalogRemoteHeads
from app.services.catalog.representations import CatalogRepresentations
from app.services.catalog.revision_comparison import CatalogRevisionComparison
from app.services.catalog.revision_finalization import CatalogRevisionFinalizer
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
from app.services.catalog.signed_urls import CatalogAssetUrlSigner
from app.services.catalog.runtime import (
    CatalogRuntime, DBL_EXPORT_DIRNAME, DEFAULT_STORE_DIRNAME, KLC_VALIDATION_DIRNAME,
    _ASSET_BROWSE_CACHE_TTL_SECONDS,
)

logger = logging.getLogger(__name__)

RELEASE_STATES = WORKFLOW_STAGES

STATE_METADATA_ONLY = "metadata_only"
STATE_FILES_PARTIAL = "files_partial"
STATE_PLACE_READY = "place_ready"

VALIDATION_STATUS_PASSED = "passed"
VALIDATION_STATUS_WARNING = "warning"
VALIDATION_STATUS_FAILED = "failed"
VALIDATION_STATUS_SKIPPED = "skipped"
VALIDATION_STATUS_NOT_RUN = "not_run"
KLC_RELEASE_GATE_VALUES = {"off", "warn", "block"}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)









def _release_allows_remote(release_status: str) -> bool:
    return release_status == "released"


def _normalize_workflow_stage(stage: str) -> str:
    return normalize_workflow_stage(stage)






class ComponentCatalogDomainService:
    _catalog_locks: CatalogLockOperations
    _revision_kernel: CatalogRevisionKernel
    _revision_comparison: CatalogRevisionComparison
    _component_history_reads: CatalogComponentHistoryReads
    _component_read_models: CatalogComponentReadModels
    _component_queries: CatalogComponentQueries
    _asset_browser: CatalogAssetBrowser
    _asset_files: CatalogAssetFiles
    _asset_registry: CatalogAssetRegistry
    _preview_renderer: CatalogPreviewRenderer
    _preview_store: CatalogPreviewStore
    _preview_pipeline: CatalogPreviewPipeline
    _revision_finalizer: CatalogRevisionFinalizer
    _asset_links: CatalogAssetLinks
    _asset_imports: CatalogAssetImports
    _representations: CatalogRepresentations
    _component_writer: CatalogComponentWriter
    _klc_validation: CatalogKlcValidation
    _release_workflow: CatalogReleaseWorkflow
    _catalog_health: CatalogHealth
    _placement: CatalogPlacement
    _dbl_export: CatalogDblExport
    _provider_tokens: CatalogProviderTokens
    _remote_heads: CatalogRemoteHeads
    _project_import_sessions: CatalogProjectImportSessions
    _project_import_matching: CatalogProjectImportMatching
    _project_import_assets: CatalogProjectImportAssets
    _project_import_acceptance: CatalogProjectImportAcceptance
    _metadata_schema: CatalogMetadataSchema
    _metadata_fields: CatalogMetadataFields
    _metadata_grid: CatalogMetadataGrid
    _metadata_csv: CatalogMetadataCsv
    _inventory_csv: CatalogInventoryCsv
    _metadata_batches: CatalogMetadataBatches
    _metadata_batch_staging: CatalogMetadataBatchStaging
    _metadata_batch_application: CatalogMetadataBatchApplication
    _metadata_batch_workflow: CatalogMetadataBatchWorkflow
    _metadata_csv_importer: CatalogMetadataCsvImporter

    def __init__(
        self,
        store_root: Path | None = None,
        database_url: str | None = None,
        *,
        catalog_locks: CatalogLockOperations | None = None,
    ) -> None:
        self._catalog_runtime = CatalogRuntime(
            store_root=store_root,
            database_path=self._database_path(database_url),
        )
        build_catalog_collaborators(
            catalog_locks=catalog_locks or NoopCatalogLocks(),
        ).bind(self)

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
        self._runtime_for_compat().ensure_storage_dirs()

    @contextmanager
    def _connect(self) -> Iterator[Any]:
        raise NotImplementedError("Catalog persistence must provide a PostgreSQL connection")
        yield  # pragma: no cover

    @contextmanager
    def connection(self) -> Iterator[Any]:
        """Supported connection scope for maintenance scripts and repository callers.

        The caller owns the transaction: commit or roll back before leaving the
        block.  Package collaborators accept this connection alongside
        ``runtime`` so scripts do not need the service's private helpers.
        """
        with self._connect() as conn:
            yield conn

    @property
    def runtime(self) -> CatalogRuntime:
        """Paths and process-local caches shared with the catalog package."""
        return self._runtime_for_compat()

    @property
    def revisions(self) -> CatalogRevisionKernel:
        return self._revision_kernel

    @property
    def asset_files(self) -> CatalogAssetFiles:
        return self._asset_files

    @property
    def asset_registry(self) -> CatalogAssetRegistry:
        return self._asset_registry

    @property
    def previews(self) -> CatalogPreviewPipeline:
        return self._preview_pipeline

    def _resolve_kicad_cli(self) -> str | None:
        return KicadCliRunner.resolve(self._runtime_for_compat())

    def _run_kicad_cli(self, args: list[str]) -> tuple[bool, str]:
        return KicadCliRunner.run(self._runtime_for_compat(), args)

    def _preview_output_path(self, asset_id: str, kind: str) -> Path:
        return self._preview_pipeline.preview_output_path(self._runtime_for_compat(), asset_id, kind)

    def _preview_version_path(self, asset_id: str, kind: str, sha256: str) -> Path:
        return self._preview_pipeline.preview_version_path(
            self._runtime_for_compat(), asset_id, kind, sha256
        )

    def _preview_generator_identity(self, kind: str) -> dict[str, str]:
        return self._preview_pipeline.generator_identity(self._runtime_for_compat(), kind)

    def _asset_root(self, asset_type: str) -> Path:
        return self._asset_files.asset_root(self._runtime_for_compat(), asset_type)

    def _unique_slug(self, conn: Any, base: str) -> str:
        return self._component_writer.unique_slug(conn, base)

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
        _ = name
        self._component_writer.assert_identity_available(
            conn,
            manufacturer=manufacturer,
            mpn=mpn,
            identity_kind=identity_kind,
            identity_source=identity_source,
            source_internal_part_number=source_internal_part_number,
            component_id=component_id,
            acquire_identity_lock=acquire_identity_lock,
        )

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
        self._revision_finalizer.finalize_revision(
            conn,
            self._runtime_for_compat(),
            component_id=component_id,
            revision_id=revision_id,
            event_type=event_type,
            actor=actor,
            details=details,
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
            return self._preview_pipeline.preview_path(conn, self._runtime_for_compat(), preview_id)

    def catalog_asset_source(self, asset_id: str) -> tuple[Path, str, str] | None:
        """One asset's stored bytes, as written -- not the placement rewrite.

        ``get_asset_by_id`` returns what KiCad places: a symbol carries an
        injected footprint reference and the component's fields, a footprint
        carries rewritten 3D-model paths. Those rewrites exist for placement.
        A renderer wants the file as the library holds it, so this resolves the
        canonical path instead of materialising a payload.
        """
        self.initialize()
        with self._connect() as conn:
            return self._asset_imports.asset_source(conn, self._runtime_for_compat(), asset_id)

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
        with self._connect() as conn:
            component_id = self._project_import_acceptance.accept(
                conn,
                self._runtime_for_compat(),
                proposal,
                metadata_overrides=metadata_overrides,
                asset_selections=asset_selections,
                asset_links=asset_links,
                actor=actor,
                change_summary=change_summary,
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
        """Purge obsolete STEP bytes while preserving immutable revision evidence."""
        self.initialize()
        with self._connect() as conn:
            return self._asset_files.purge_superseded_step_files(conn, self._runtime_for_compat())

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
            return self._component_queries.workflow_summary(conn)

    def release_queue_summary(self) -> dict[str, int]:
        self.initialize()
        with self._connect() as conn:
            return self._component_queries.release_queue_summary(conn)

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
        with self._connect() as conn:
            return self._remote_heads.list_heads(
                conn,
                query=query,
                category=category,
                page=page,
                page_size=page_size,
                include_total=include_total,
            )

    def list_remote_categories(self) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            return self._remote_heads.list_categories(conn)

    def remote_projection_version(self) -> str:
        self.initialize()
        with self._connect() as conn:
            return self._remote_heads.projection_version(conn)

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
        return self._representations.representation_asset_id(conn, revision_id, asset_id, expected_type)

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
            self._representations.create_representation(
                conn,
                self._runtime_for_compat(),
                component_id,
                label=label,
                symbol_asset_id=symbol_asset_id,
                footprint_asset_id=footprint_asset_id,
                display_order=display_order,
                make_default=make_default,
                source_internal_part_number=source_internal_part_number,
                provenance=provenance,
                expected_revision_id=expected_revision_id,
                actor=actor,
                change_summary=change_summary,
            )
            conn.commit()
        return self.get_component(component_id) or {}

    def _current_representation_row(
        self, conn: Any, component_id: str, representation_id: str
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        return self._representations.current_representation_row(conn, component_id, representation_id)

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
            self._representations.update_representation(
                conn,
                self._runtime_for_compat(),
                component_id,
                representation_id,
                updates=updates,
                expected_revision_id=expected_revision_id,
                actor=actor,
                change_summary=change_summary,
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
            self._representations.delete_representation(
                conn,
                self._runtime_for_compat(),
                component_id,
                representation_id,
                expected_revision_id=expected_revision_id,
                actor=actor,
            )
            conn.commit()
        return self.get_component(component_id) or {}

    def create_manual_component(self, *, actor: str = "", change_summary: str = "Create component", **payload: Any) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            component_id = self._component_writer.create_component(
                conn,
                self._runtime_for_compat(),
                payload,
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
        return self._component_writer.upsert_metadata_row(
            conn,
            self._runtime_for_compat(),
            component_id=component_id,
            metadata=metadata,
            now=now,
            existing_component_id=existing_component_id,
            actor=actor,
            change_summary=change_summary,
            expected_revision_id=expected_revision_id,
            finalize_revision=finalize_revision,
            source=source,
            external_source=external_source,
            external_id=external_id,
            change_kind=change_kind,
        )

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
            revision_id = self._component_writer.update_metadata(
                conn,
                self._runtime_for_compat(),
                component_id,
                updates,
                actor=actor,
                change_summary=change_summary,
                expected_revision_id=expected_revision_id,
            )
            if revision_id is None:
                return None
            if revision_id:
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
        with self._connect() as conn:
            batch_id = self._metadata_batch_workflow.stage(
                conn,
                items,
                source=source,
                actor=actor,
                change_summary=change_summary,
                proposed_fields=proposed_fields,
            )
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
            result = self._metadata_batch_workflow.apply_item(
                conn, self._runtime_for_compat(), item_id, actor=actor
            )
            conn.commit()
        return result

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
        selection = self._metadata_batch_application.select_valid_item_ids(rows, item_ids)
        ids = list(selection.ids)
        if selection.selected and not ids:
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
            accounting = self._metadata_batch_application.account_batch(
                batch_id, totals, applied, failed, errors
            )
            self._metadata_batches.finalize_batch(
                conn,
                batch_id=batch_id,
                status=accounting.status,
                valid_items=accounting.remaining,
                applied_items=accounting.total_applied,
                failed_items=accounting.total_failed,
                updated_at=_utc_now_iso(),
            )
            conn.commit()
        return accounting.result

    def export_metadata_csv(self, field_keys: list[str] | None = None) -> str:
        return "".join(self.iter_metadata_csv(field_keys=field_keys))

    def iter_metadata_csv(self, field_keys: list[str] | None = None) -> Iterator[str]:
        self.initialize()
        fields = self.list_metadata_fields()
        prepared = self._metadata_csv.prepare_export(
            fields,
            field_keys,
            schema_version=METADATA_SCHEMA_VERSION,
        )

        def generate() -> Iterator[str]:
            yield self._metadata_csv.render_header(prepared)

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
                    yield self._metadata_csv.render_row(prepared, row)

        return generate()

    def preview_metadata_csv(self, file_content: str, *, actor: str, change_summary: str = "Import component metadata from CSV") -> dict[str, Any]:
        self.initialize()
        fields = {field["key"]: field for field in self.list_metadata_fields(include_archived=True)}
        parsed = self._metadata_csv.parse_preview(file_content, list(fields.values()))

        with self._connect() as conn:
            current_rows = {
                str(row["component_id"]): dict(row)
                for row in conn.execute(
                    "SELECT c.id AS component_id, cr.* FROM components c "
                    "JOIN component_revisions cr ON cr.id = c.current_revision_id WHERE c.is_active = 1"
                ).fetchall()
            }

        changes = self._metadata_csv.filter_preview_changes(
            parsed.parsed_rows,
            current_rows,
            fields,
            parsed.proposed_fields,
        )
        batch = self.stage_metadata_batch(
            changes.items,
            source="csv",
            actor=actor,
            change_summary=change_summary,
            proposed_fields=changes.used_proposals,
        )
        return {
            **batch,
            "source_rows": len(parsed.parsed_rows),
            "skipped_unchanged_rows": changes.skipped_unchanged_rows,
        }

    def import_metadata_csv(self, file_content: str) -> dict[str, Any]:
        self.initialize()
        parsed = self._metadata_csv.parse_import(file_content)
        with self._connect() as conn:
            result = self._metadata_csv_importer.import_rows(conn, self._runtime_for_compat(), parsed)
            conn.commit()
        return result

    def export_inventory_csv(self) -> str:
        self.initialize()
        with self._connect() as conn:
            rows = self._inventory_csv.fetch_export_rows(conn)
        return self._inventory_csv.render_export(rows)

    def import_inventory_csv(self, file_content: str) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            result = self._inventory_csv.import_file(conn, file_content)
            conn.commit()
        return result

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
        return self._asset_browser.browse(
            runtime=self._catalog_runtime,
            root=root,
            asset_type=asset_type,
            q=q,
            limit=limit,
            now=time.monotonic(),
        )

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
        return self._asset_links.attach_asset_revision(
            conn,
            self._runtime_for_compat(),
            component_id=component_id,
            asset=asset,
            required=required,
            actor=actor,
            change_summary=change_summary,
            counterpart_asset_id=counterpart_asset_id,
        )

    def _extract_top_level_symbol_blocks(self, text: str) -> list[tuple[str, str]]:
        return self._asset_files.extract_top_level_symbol_blocks(text)

    def _symbol_header(self, text: str) -> tuple[str, str]:
        return self._asset_files.symbol_header(text)

    def _single_symbol_payload(self, text: str, selected_symbol: str) -> bytes:
        return self._asset_files.single_symbol_payload(text, selected_symbol)

    def _write_canonical_file(self, destination: Path, payload: bytes) -> Path:
        return self._asset_files.write_canonical_file(
            self._runtime_for_compat(), destination, payload
        )

    def _symbol_destination(self, target_library: str, target_name: str) -> Path:
        return self._asset_files.symbol_destination(
            self._runtime_for_compat(), target_library, target_name
        )

    def _footprint_destination(self, target_library: str, target_name: str) -> Path:
        return self._asset_files.footprint_destination(
            self._runtime_for_compat(), target_library, target_name
        )

    def _aux_destination(self, asset_type: str, target_library: str, upload_name: str) -> Path:
        return self._asset_files.aux_destination(
            self._runtime_for_compat(), asset_type, target_library, upload_name
        )

    def _asset_by_key(self, conn: Any, asset_type: str, canonical_path: str, target_name: str) -> dict[str, Any] | None:
        return self._asset_registry.asset_by_key(
            conn, asset_type, canonical_path, target_name
        )

    def _asset_by_signature(
        self,
        conn: Any,
        asset_type: str,
        sha256: str,
        target_library: str,
        target_name: str,
    ) -> dict[str, Any] | None:
        return self._asset_registry.asset_by_signature(
            conn, asset_type, sha256, target_library, target_name
        )

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
        return self._asset_registry.register_asset(
            self._runtime_for_compat(),
            conn,
            asset_type=asset_type,
            canonical_path=canonical_path,
            target_library=target_library,
            target_name=target_name,
            source_group=source_group,
        )

    def _generate_symbol_preview(self, asset: dict[str, Any]) -> tuple[str, bytes | str]:
        """Compatibility single-unit renderer used by existing test/custom adapters."""
        return self._preview_renderer.generate_symbol_preview(asset, self._run_kicad_cli)

    def _generate_symbol_preview_units(
        self,
        asset: dict[str, Any],
    ) -> tuple[str, list[tuple[int, bytes]] | str]:
        return self._preview_renderer.generate_symbol_preview_units(asset, self._run_kicad_cli)

    def _generate_footprint_preview(self, asset: dict[str, Any]) -> tuple[str, bytes | str]:
        return self._preview_renderer.generate_footprint_preview(asset, self._run_kicad_cli)

    def _store_preview_version(
        self,
        conn: Any,
        *,
        asset: dict[str, Any],
        kind: str,
        payload: bytes,
    ) -> dict[str, Any]:
        return self._preview_pipeline.store_preview_version(
            conn, self._runtime_for_compat(), asset=asset, kind=kind, payload=payload
        )

    def _ensure_asset_previews(self, conn: Any, asset: dict[str, Any]) -> list[dict[str, Any]]:
        return self._preview_pipeline.ensure_asset_previews(conn, self._runtime_for_compat(), asset)

    def _ensure_asset_preview(self, conn: Any, asset: dict[str, Any]) -> dict[str, Any]:
        """Compatibility wrapper returning the first generated preview."""
        previews = self._ensure_asset_previews(conn, asset)
        return previews[0] if previews else {}

    def _has_ready_preview(self, conn: Any, asset_id: str, kind: str) -> bool:
        return self._preview_pipeline.has_ready_preview(conn, self._runtime_for_compat(), asset_id, kind)

    def _refresh_revision_preview_outputs_in_conn(
        self,
        conn: Any,
        revision_id: str,
        *,
        only_missing: bool = False,
    ) -> dict[str, Any]:
        return self._preview_pipeline.refresh_revision_preview_outputs(
            conn, self._runtime_for_compat(), revision_id, only_missing=only_missing
        )

    def _regenerate_component_previews_in_conn(
        self,
        conn: Any,
        component_id: str,
        *,
        actor: str,
        only_missing: bool = False,
    ) -> dict[str, Any]:
        _ = actor
        return self._preview_pipeline.regenerate_component_previews(
            conn, self._runtime_for_compat(), component_id, only_missing=only_missing
        )

    def generate_missing_component_previews(
        self,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            return self._preview_pipeline.generate_missing_component_previews(
                conn, self._runtime_for_compat(), progress_callback
            )

    def _link_asset_to_revision(
        self,
        conn: Any,
        revision_id: str,
        asset: dict[str, Any],
        *,
        required: bool,
        counterpart_asset_id: str = "",
    ) -> None:
        self._asset_links.link_asset_to_revision(
            conn, revision_id, asset, required=required, counterpart_asset_id=counterpart_asset_id
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
        return self._asset_imports.resolve_existing_asset(
            conn,
            self._runtime_for_compat(),
            asset_type=asset_type,
            file_path=file_path,
            target_library=target_library,
            target_name=target_name,
        )

    def link_library_asset(
        self,
        component_id: str,
        asset_type: str,
        file_path_rel: str,
        target_library: str,
        target_name: str,
        *,
        counterpart_asset_id: str = "",
        actor: str = "", expected_revision_id: str = "",
    ) -> dict[str, Any]:
        if asset_type not in SUPPORTED_ASSET_TYPES:
            raise ValueError("Unsupported asset type")
        self.initialize()
        with self._connect() as conn:
            self._asset_imports.link_library_asset(
                conn,
                self._runtime_for_compat(),
                component_id,
                asset_type,
                file_path_rel,
                target_library,
                target_name,
                counterpart_asset_id=counterpart_asset_id,
                actor=actor, expected_revision_id=expected_revision_id,
            )
            conn.commit()
        return {"component": self.get_component(component_id)}

    def _normalize_symbol_upload(self, upload_name: str, payload: bytes) -> bytes:
        return self._asset_imports.normalize_symbol_upload(
            self._runtime_for_compat(), upload_name, payload
        )

    def import_symbol_library(
        self,
        component_id: str,
        *,
        upload_name: str,
        payload: bytes,
        target_library: str,
        selected_symbol: str,
        counterpart_asset_id: str = "",
        actor: str = "", expected_revision_id: str = "",
    ) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            result = self._asset_imports.import_symbol_library(
                conn,
                self._runtime_for_compat(),
                component_id,
                upload_name=upload_name,
                payload=payload,
                target_library=target_library,
                selected_symbol=selected_symbol,
                counterpart_asset_id=counterpart_asset_id,
                actor=actor, expected_revision_id=expected_revision_id,
            )
            if result["mode"] == "imported":
                conn.commit()
        if result["mode"] == "imported":
            result["component"] = self.get_component(component_id)
        return result

    def _extract_footprints_from_upload(self, upload_name: str, payload: bytes) -> dict[str, bytes]:
        return self._asset_imports.extract_footprints_from_upload(upload_name, payload)

    def import_footprint(
        self,
        component_id: str,
        *,
        upload_name: str,
        payload: bytes,
        target_library: str,
        selected_footprint: str,
        counterpart_asset_id: str = "",
        actor: str = "", expected_revision_id: str = "",
    ) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            result = self._asset_imports.import_footprint(
                conn,
                self._runtime_for_compat(),
                component_id,
                upload_name=upload_name,
                payload=payload,
                target_library=target_library,
                selected_footprint=selected_footprint,
                counterpart_asset_id=counterpart_asset_id,
                actor=actor, expected_revision_id=expected_revision_id,
            )
            if result["mode"] == "imported":
                conn.commit()
        if result["mode"] == "imported":
            result["component"] = self.get_component(component_id)
        return result

    def attach_auxiliary_asset(
        self,
        component_id: str,
        *,
        asset_type: str,
        upload_name: str,
        payload: bytes,
        target_library: str,
        actor: str = "", expected_revision_id: str = "",
    ) -> dict[str, Any]:
        if asset_type not in {"3dmodel", "spice"}:
            raise ValueError("Unsupported auxiliary asset type")
        self.initialize()
        with self._connect() as conn:
            self._asset_imports.attach_auxiliary_asset(
                conn,
                self._runtime_for_compat(),
                component_id,
                asset_type=asset_type,
                upload_name=upload_name,
                payload=payload,
                target_library=target_library,
                actor=actor, expected_revision_id=expected_revision_id,
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
            if self._asset_imports.detach_asset(
                conn, self._runtime_for_compat(), component_id, asset_type, actor=actor
            ):
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
            self._asset_imports.detach_asset_by_id(
                conn,
                self._runtime_for_compat(),
                component_id,
                asset_id,
                expected_revision_id=expected_revision_id,
                actor=actor,
            )
            conn.commit()
        return {"component": self.get_component(component_id)}

    def _klc_release_gate(self) -> str:
        return self._klc_validation.release_gate()

    def _klc_utils_root(self) -> Path:
        return self._klc_validation.utils_root()

    def _klc_checker_path(self, asset_type: str) -> Path | None:
        return self._klc_validation.checker_path(asset_type)

    def _klc_tool_version(self) -> str:
        return self._klc_validation.tool_version()

    def _klc_rule_args(self, asset_type: str) -> list[str]:
        return self._klc_validation.rule_args(asset_type)

    def _parse_klc_junit(self, junit_path: Path) -> list[dict[str, Any]]:
        return self._klc_validation.parse_klc_junit(junit_path)

    def _write_validation_report_json(self, path: Path, *, run_id: str, asset: dict[str, Any], status: str, exit_code: int | None, findings: list[dict[str, Any]], stdout: str, stderr: str, tool_version: str, created_at: str, finished_at: str) -> None:
        self._klc_validation.write_validation_report_json(path, run_id=run_id, asset=asset, status=status, exit_code=exit_code, findings=findings, stdout=stdout, stderr=stderr, tool_version=tool_version, created_at=created_at, finished_at=finished_at)

    def _store_validation_run(self, conn: Any, *, run_id: str, component_id: str, revision_id: str, asset: dict[str, Any], status: str, exit_code: int | None, findings: list[dict[str, Any]], report_dir: Path, stdout_path: Path, stderr_path: Path, junit_path: Path, json_path: Path, raw_output: str, tool_version: str, created_at: str, finished_at: str) -> dict[str, Any]:
        return self._klc_validation.store_validation_run(conn, run_id=run_id, component_id=component_id, revision_id=revision_id, asset=asset, status=status, exit_code=exit_code, findings=findings, report_dir=report_dir, stdout_path=stdout_path, stderr_path=stderr_path, junit_path=junit_path, json_path=json_path, raw_output=raw_output, tool_version=tool_version, created_at=created_at, finished_at=finished_at)

    def _run_klc_for_asset(
        self,
        conn: Any,
        *,
        component_id: str,
        revision_id: str,
        asset: dict[str, Any],
    ) -> dict[str, Any]:
        return self._klc_validation.run_klc_for_asset(
            conn,
            self._runtime_for_compat(),
            component_id=component_id,
            revision_id=revision_id,
            asset=asset,
        )

    def validate_component_klc(self, component_id: str) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            component, revision, runs = self._klc_validation.validate_component(
                conn, self._runtime_for_compat(), component_id
            )
            conn.commit()
            component_payload = self._component_payload(conn, component, revision)
        return {"component": component_payload, "runs": runs}

    def get_component_validation(self, component_id: str) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            return self._klc_validation.component_validation(conn, component_id)

    def get_validation_run(self, run_id: str) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            return self._klc_validation.validation_run(conn, run_id)

    def validation_report_path(self, run_id: str, report_name: str) -> Path | None:
        self.initialize()
        with self._connect() as conn:
            return self._klc_validation.report_path(conn, self._runtime_for_compat(), run_id, report_name)

    def catalog_health(self) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            return self._catalog_health.report(conn)

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
        self.initialize()
        with self._connect() as conn:
            self._release_workflow.set_release_status(
                conn,
                self._runtime_for_compat(),
                component_id,
                release_status,
                actor=actor,
                self_approval_override_reason=self_approval_override_reason,
                review_note=review_note,
                actor_role=actor_role,
                expected_revision_id=expected_revision_id,
                expected_manifest_hash=expected_manifest_hash,
            )
            conn.commit()
        return self.get_component(component_id) or {}

    def deactivate_component(self, component_id: str, *, actor: str = "", reason: str = "") -> bool:
        self.initialize()
        with self._connect() as conn:
            deactivated = self._release_workflow.deactivate_component(
                conn, component_id, actor=actor, reason=reason
            )
            conn.commit()
            return deactivated

    def delete_component(self, component_id: str, *, actor: str = "", reason: str = "") -> bool:
        # Component identity, revisions, releases, usage, and audit evidence are never
        # hard-deleted. The legacy DELETE contract now performs an auditable tombstone
        # so existing callers retain their UX while compliance history remains intact.
        return self.deactivate_component(component_id, actor=actor, reason=reason)

    def _materialize_asset(
        self,
        asset: dict[str, Any],
        assets_for_revision: list[dict[str, Any]],
        component: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return materialize_asset(asset, assets_for_revision, component)

    def _placement_assets(
        self, conn: Any, revision_id: str, representation_id: str = ""
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        return self._placement.placement_assets(conn, revision_id, representation_id)

    def build_manifest(
        self, component_id: str, base_url: str, representation_id: str = ""
    ) -> dict[str, Any] | None:
        self.initialize()
        component = self.get_component(component_id, include_inactive=False, released_only=True)
        if not component:
            return None
        with self._connect() as conn:
            return self._placement.build_manifest(conn, component, base_url, representation_id)

    def build_inline_bundle(
        self, component_id: str, representation_id: str = ""
    ) -> dict[str, Any] | None:
        self.initialize()
        component = self.get_component(component_id, include_inactive=False, released_only=True)
        if not component:
            return None
        with self._connect() as conn:
            return self._placement.build_inline_bundle(conn, component, representation_id)

    def get_asset_by_id(
        self, asset_id: str, *, revision_id: str = "", representation_id: str = ""
    ) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            return self._placement.asset_by_id(
                conn, asset_id, revision_id=revision_id, representation_id=representation_id
            )

    def get_preview(self, preview_id: str) -> CatalogPreview | None:
        self.initialize()
        with self._connect() as conn:
            return self._preview_pipeline.preview_record(conn, preview_id)

    def _sign(self, message: str) -> str:
        return CatalogAssetUrlSigner.sign(message)

    def build_signed_asset_url(
        self, asset_id: str, revision_id: str, base_url: str, ttl_seconds: int = 300,
        *, representation_id: str = "",
    ) -> str:
        return CatalogAssetUrlSigner.build_signed_asset_url(
            asset_id, revision_id, base_url, ttl_seconds, representation_id=representation_id
        )

    def validate_asset_signature(
        self, asset_id: str, revision_id: str, expires_at: int, signature: str,
        representation_id: str = "",
    ) -> bool:
        return CatalogAssetUrlSigner.validate_asset_signature(
            asset_id, revision_id, expires_at, signature, representation_id
        )

    def store_auth_code(self, code: str, grant: dict[str, Any], exp: int) -> None:
        self.initialize()
        with self._connect() as conn:
            self._provider_tokens.store_auth_code(conn, code, grant, exp)
            conn.commit()

    def consume_auth_code(self, code: str) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            grant = self._provider_tokens.consume_auth_code(conn, code, now=int(time.time()))
            conn.commit()
        return grant

    def add_revoked_token(self, jti: str, exp: int) -> None:
        self.initialize()
        with self._connect() as conn:
            self._provider_tokens.add_revoked_token(conn, jti, exp)
            conn.commit()

    def is_token_revoked(self, jti: str) -> bool:
        self.initialize()
        with self._connect() as conn:
            revoked = self._provider_tokens.is_token_revoked(conn, jti, now=int(time.time()))
            conn.commit()
        return revoked

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
        return dbl_row_for_component(component, part_number, custom_fields)

    def _collect_dbl_assets(
        self,
        component: dict[str, Any],
        part_number: str,
        export_root: Path,
        conn: Any,
    ) -> None:
        self._dbl_export.collect_dbl_assets(conn, component, part_number, export_root)

    def _write_dbl_config(
        self, export_root: Path, *, filename: str, connection_string: str, libraries: list[dict[str, Any]]
    ) -> None:
        write_dbl_config(export_root, filename=filename, connection_string=connection_string, libraries=libraries)

    def export_kicad_dbl_bundle(self) -> dict[str, Any]:
        self.initialize()
        components = self._released_place_ready_components()
        metadata_fields = self.list_metadata_fields()
        with self._connect() as conn:
            return self._dbl_export.export_bundle(conn, self._runtime_for_compat(), components, metadata_fields)
