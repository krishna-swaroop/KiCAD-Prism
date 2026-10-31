from __future__ import annotations

import logging
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Iterator

from app.services.catalog.collaborators import build_catalog_collaborators
from app.services.catalog.component_history import CatalogComponentHistoryReads
from app.services.catalog.component_read_models import CatalogComponentReadModels
from app.services.catalog.component_writer import CatalogComponentWriter
from app.services.catalog.component_queries import CatalogComponentQueries
from app.services.catalog.dbl_export import CatalogDblExport
from app.services.catalog.health import CatalogHealth
from app.services.catalog.klc_validation import CatalogKlcValidation
from app.services.catalog.asset_browser import CatalogAssetBrowser
from app.services.catalog.asset_files import CatalogAssetFiles
from app.services.catalog.asset_imports import CatalogAssetImports
from app.services.catalog.asset_links import CatalogAssetLinks
from app.services.catalog.asset_registry import CatalogAssetRegistry
from app.services.catalog.asset_types import (
    PLACE_REQUIRED_ASSET_TYPES,
    SUPPORTED_ASSET_TYPES,
)
from app.services.catalog.locking import CatalogLockOperations, NoopCatalogLocks
from app.services.catalog.metadata_batch_application import CatalogMetadataBatchApplication
from app.services.catalog.metadata_batch_lifecycle import CatalogMetadataBatchLifecycle
from app.services.catalog.metadata_batches import CatalogMetadataBatches
from app.services.catalog.metadata_batch_staging import CatalogMetadataBatchStaging
from app.services.catalog.metadata_csv import CatalogMetadataCsv
from app.services.catalog.inventory_csv import CatalogInventoryCsv
from app.services.catalog.metadata_batch_workflow import CatalogMetadataBatchWorkflow
from app.services.catalog.metadata_fields import CatalogMetadataFields
from app.services.catalog.metadata_grid import CatalogMetadataGrid
from app.services.catalog.metadata_schema import (
    CatalogMetadataSchema,
    METADATA_SCHEMA_VERSION,
)
from app.services.catalog.normalization import utc_now_iso as _utc_now_iso
from app.services.catalog.project_import_sessions import CatalogProjectImportSessions
from app.services.catalog.component_identity import active_components_by_compact_number, match_part_identities
from app.services.catalog.project_import_matching import CatalogProjectImportMatching
from app.services.catalog.project_import_assets import CatalogProjectImportAssets
from app.services.catalog.provider_tokens import CatalogProviderTokens
from app.services.catalog.project_import_acceptance import CatalogProjectImportAcceptance
from app.services.catalog.placement import CatalogPlacement
from app.services.catalog.preview_pipeline import (
    CatalogPreview,
    CatalogPreviewPipeline,
)
from app.services.catalog.preview_renderer import CatalogPreviewRenderer
from app.services.catalog.preview_store import CatalogPreviewStore
from app.services.catalog.release_workflow import CatalogReleaseWorkflow
from app.services.catalog.remote_heads import CatalogRemoteHeads
from app.services.catalog.representations import CatalogRepresentations
from app.services.catalog.revision_comparison import CatalogRevisionComparison
from app.services.catalog.revision_finalization import CatalogRevisionFinalizer
from app.services.catalog.revision_kernel import CatalogRevisionKernel
from app.services.catalog.signed_urls import CatalogAssetUrlSigner
from app.services.catalog.part_relations_facade import CatalogPartRelationsFacade
from app.services.catalog.runtime import CatalogRuntime

logger = logging.getLogger(__name__)


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
            catalog_locks=catalog_locks or NoopCatalogLocks(), store_root=self._catalog_runtime.store_root,
        ).bind(self)

    def _runtime_for_compat(self) -> CatalogRuntime:
        """Lazily support legacy ``__new__``-constructed test doubles."""
        runtime = self.__dict__.get("_catalog_runtime")
        if runtime is None:
            runtime = CatalogRuntime()
            self.__dict__["_catalog_runtime"] = runtime
        return runtime

    @property
    def part_relations(self) -> CatalogPartRelationsFacade:
        """"Mates with" and model alignment (``catalog/part_relations_facade.py``)."""
        return CatalogPartRelationsFacade(
            connect=self._connect, initialize=self.initialize, runtime=self._runtime_for_compat(),
            revision_kernel=self._revision_kernel)

    def _database_path(self, database_url: str | None) -> Path:
        _ = database_url
        return Path("/dev/null")

    @property
    def store_root(self) -> Path:
        return self._runtime_for_compat().store_root

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
            result = self._project_import_matching.index_project_component_usage(conn, proposals, observed_at=now)
            conn.commit()
        return result

    def match_component_identities(self, identities: list[dict[str, str]]) -> list[dict[str, Any] | None]:
        """Resolve manufacturer/MPN identities, in order, to the active or retired holder."""
        self.initialize()
        with self._connect() as conn:
            return match_part_identities(conn, identities)

    def components_by_compact_number(self, numbers: list[str]) -> list[dict[str, str]]:
        """Active components whose part number, upper-cased without white space, underscores or dashes, is one of ``numbers``."""
        self.initialize()
        with self._connect() as conn:
            return active_components_by_compact_number(conn, numbers)

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

    def delete_project_import_session(self, session_id: str) -> None:
        self.initialize()
        with self._connect() as conn:
            self._project_import_sessions.delete_session(conn, session_id)
            conn.commit()
        self._project_import_sessions.remove_staging_directories(store_root=self.store_root, session_ids=[session_id])

    def cleanup_resolved_import_staging(self, *, older_than: str) -> dict[str, Any]:
        """Remove regenerable staged copies after every proposal is resolved."""
        self.initialize()
        with self._connect() as conn:
            session_ids = self._project_import_sessions.list_resolved_session_ids(
                conn,
                older_than=older_than,
            )
        return self._project_import_sessions.remove_staging_directories(
            store_root=self.store_root,
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

    def workflow_summary(self) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            return self._component_queries.workflow_summary(conn)

    def release_queue_summary(self) -> dict[str, int]:
        self.initialize()
        with self._connect() as conn:
            return self._component_queries.release_queue_summary(conn)

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

    def create_manual_component(self, *, actor: str = "", change_summary: str = "Create component",
                                **payload: Any) -> dict[str, Any]:
        """A new component record."""
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

    @property
    def metadata_batch_lifecycle(self) -> CatalogMetadataBatchLifecycle:
        """Stage, approve, apply and account metadata batches (``catalog/metadata_batch_lifecycle.py``)."""
        return CatalogMetadataBatchLifecycle(
            connect=self._connect, initialize=self.initialize, runtime=self._runtime_for_compat(),
            metadata_fields=self._metadata_fields, metadata_csv=self._metadata_csv,
            batches=self._metadata_batches, workflow=self._metadata_batch_workflow,
            application=self._metadata_batch_application,
        )

    def get_metadata_batch(self, batch_id: str) -> dict[str, Any] | None:
        return self.metadata_batch_lifecycle.get(batch_id)

    def stage_metadata_batch(
        self,
        items: list[dict[str, Any]],
        *,
        source: str,
        actor: str,
        change_summary: str,
        proposed_fields: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        return self.metadata_batch_lifecycle.stage(
            items, source=source, actor=actor, change_summary=change_summary, proposed_fields=proposed_fields
        )

    def approve_metadata_batch_fields(self, batch_id: str, *, actor: str) -> dict[str, Any]:
        return self.metadata_batch_lifecycle.approve_fields(batch_id, actor=actor)

    def apply_metadata_batch(
        self,
        batch_id: str,
        *,
        actor: str,
        item_ids: list[str] | None = None,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        return self.metadata_batch_lifecycle.apply(
            batch_id, actor=actor, item_ids=item_ids, progress_callback=progress_callback
        )

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
        return self.metadata_batch_lifecycle.stage_csv(file_content, actor=actor, change_summary=change_summary)

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
        root = self._asset_files.asset_root(self._runtime_for_compat(), asset_type)
        return self._asset_browser.browse(
            runtime=self._catalog_runtime,
            root=root,
            asset_type=asset_type,
            q=q,
            limit=limit,
            now=time.monotonic(),
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

    def validate_component_klc(self, component_id: str) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            component, revision, runs = self._klc_validation.validate_component(
                conn, self._runtime_for_compat(), component_id
            )
            conn.commit()
            component_payload = self._component_read_models.component_payload(conn, component, revision)
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

    def catalog_health(self, *, check_released_files: bool = False) -> dict[str, Any]:
        self.initialize()
        with self._connect() as conn:
            return self._catalog_health.report(conn, check_released_files=check_released_files)

    def regenerate_component_previews(self, component_id: str, *, actor: str = "") -> dict[str, Any]:
        _ = actor  # previews carry no actor; kept for the historical signature
        self.initialize()
        with self._connect() as conn:
            self._preview_pipeline.regenerate_component_previews(
                conn, self._runtime_for_compat(), component_id, only_missing=False
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

    def build_manifest(
        self, component_id: str, base_url: str, representation_id: str = "", revision_id: str = ""
    ) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            component = self._placement.placeable_component(conn, component_id, revision_id)
            if not component:
                return None
            return self._placement.build_manifest(conn, component, base_url, representation_id)

    def build_inline_bundle(
        self, component_id: str, representation_id: str = "", revision_id: str = ""
    ) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as conn:
            component = self._placement.placeable_component(conn, component_id, revision_id)
            if not component:
                return None
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

    def export_kicad_dbl_bundle(self) -> dict[str, Any]:
        self.initialize()
        released = self.list_components(
            page=1, page_size=10000, released_only=True, include_inactive=False
        )["items"]
        components = [
            component
            for component in released
            if component["place_enabled"] and component.get("kind", "part") == "part"
        ]
        metadata_fields = self.list_metadata_fields()
        with self._connect() as conn:
            return self._dbl_export.export_bundle(conn, self._runtime_for_compat(), components, metadata_fields)
