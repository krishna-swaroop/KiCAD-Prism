"""Build the catalog collaborator graph once per service instance.

Class-level wiring shared one lock/kernel graph across instances and forced the
PostgreSQL subclass to reconstruct writers after ``super().__init__``. Callers
pass named dependencies; the returned object binds onto a service instance.
"""

from __future__ import annotations

from dataclasses import dataclass, fields

from app.services.catalog.asset_browser import CatalogAssetBrowser
from app.services.catalog.asset_files import CatalogAssetFiles
from app.services.catalog.asset_imports import CatalogAssetImports
from app.services.catalog.asset_links import CatalogAssetLinks
from app.services.catalog.asset_registry import CatalogAssetRegistry
from app.services.catalog.component_history import CatalogComponentHistoryReads
from app.services.catalog.component_queries import CatalogComponentQueries
from app.services.catalog.component_read_models import CatalogComponentReadModels
from app.services.catalog.component_writer import CatalogComponentWriter
from app.services.catalog.dbl_export import CatalogDblExport
from app.services.catalog.health import CatalogHealth
from app.services.catalog.inventory_csv import CatalogInventoryCsv
from app.services.catalog.klc_validation import CatalogKlcValidation
from app.services.catalog.locking import CatalogLockOperations
from app.services.catalog.metadata_batch_application import CatalogMetadataBatchApplication
from app.services.catalog.metadata_batch_staging import CatalogMetadataBatchStaging
from app.services.catalog.metadata_batch_workflow import CatalogMetadataBatchWorkflow
from app.services.catalog.metadata_batches import CatalogMetadataBatches
from app.services.catalog.metadata_csv import CatalogMetadataCsv
from app.services.catalog.metadata_csv_import import CatalogMetadataCsvImporter
from app.services.catalog.metadata_fields import CatalogMetadataFields
from app.services.catalog.metadata_grid import CatalogMetadataGrid
from app.services.catalog.metadata_schema import CatalogMetadataSchema
from app.services.catalog.placement import CatalogPlacement
from app.services.catalog.preview_pipeline import CatalogPreviewPipeline
from app.services.catalog.preview_renderer import CatalogPreviewRenderer
from app.services.catalog.preview_store import CatalogPreviewStore
from app.services.catalog.project_import_acceptance import CatalogProjectImportAcceptance
from app.services.catalog.project_import_assets import CatalogProjectImportAssets
from app.services.catalog.project_import_matching import CatalogProjectImportMatching
from app.services.catalog.project_import_sessions import CatalogProjectImportSessions
from app.services.catalog.provider_tokens import CatalogProviderTokens
from app.services.catalog.release_workflow import CatalogReleaseWorkflow
from app.services.catalog.remote_heads import CatalogRemoteHeads
from app.services.catalog.representations import CatalogRepresentations
from app.services.catalog.revision_comparison import CatalogRevisionComparison
from app.services.catalog.revision_finalization import CatalogRevisionFinalizer
from app.services.catalog.revision_kernel import CatalogRevisionKernel


@dataclass(frozen=True)
class CatalogCollaborators:
    """Collaborators owned by one catalog service instance."""

    catalog_locks: CatalogLockOperations
    revision_kernel: CatalogRevisionKernel
    revision_comparison: CatalogRevisionComparison
    component_history_reads: CatalogComponentHistoryReads
    component_read_models: CatalogComponentReadModels
    component_queries: CatalogComponentQueries
    asset_browser: CatalogAssetBrowser
    asset_files: CatalogAssetFiles
    asset_registry: CatalogAssetRegistry
    preview_renderer: CatalogPreviewRenderer
    preview_store: CatalogPreviewStore
    preview_pipeline: CatalogPreviewPipeline
    revision_finalizer: CatalogRevisionFinalizer
    asset_links: CatalogAssetLinks
    asset_imports: CatalogAssetImports
    representations: CatalogRepresentations
    component_writer: CatalogComponentWriter
    klc_validation: CatalogKlcValidation
    release_workflow: CatalogReleaseWorkflow
    catalog_health: CatalogHealth
    placement: CatalogPlacement
    dbl_export: CatalogDblExport
    provider_tokens: CatalogProviderTokens
    remote_heads: CatalogRemoteHeads
    project_import_sessions: CatalogProjectImportSessions
    project_import_matching: CatalogProjectImportMatching
    project_import_assets: CatalogProjectImportAssets
    project_import_acceptance: CatalogProjectImportAcceptance
    metadata_schema: CatalogMetadataSchema
    metadata_fields: CatalogMetadataFields
    metadata_grid: CatalogMetadataGrid
    metadata_csv: CatalogMetadataCsv
    inventory_csv: CatalogInventoryCsv
    metadata_batches: CatalogMetadataBatches
    metadata_batch_staging: CatalogMetadataBatchStaging
    metadata_batch_application: CatalogMetadataBatchApplication
    metadata_batch_workflow: CatalogMetadataBatchWorkflow
    metadata_csv_importer: CatalogMetadataCsvImporter

    def bind(self, target: object) -> None:
        declared = _declared_annotation_names(type(target))
        missing = [
            f"_{field.name}" for field in fields(self) if f"_{field.name}" not in declared
        ]
        if missing:
            raise AttributeError(
                f"{type(target).__name__} is missing collaborator annotations: "
                + ", ".join(missing)
            )
        for field in fields(self):
            setattr(target, f"_{field.name}", getattr(self, field.name))


def _declared_annotation_names(cls: type) -> set[str]:
    names: set[str] = set()
    for base in cls.__mro__:
        names.update(getattr(base, "__annotations__", {}))
    return names


def build_catalog_collaborators(
    *,
    catalog_locks: CatalogLockOperations,
    preview_renderer: CatalogPreviewRenderer | None = None,
    preview_store: CatalogPreviewStore | None = None,
    asset_files: CatalogAssetFiles | None = None,
    asset_registry: CatalogAssetRegistry | None = None,
    metadata_schema: CatalogMetadataSchema | None = None,
) -> CatalogCollaborators:
    """Construct an independent collaborator graph around ``catalog_locks``."""

    preview_renderer = preview_renderer or CatalogPreviewRenderer()
    preview_store = preview_store or CatalogPreviewStore()
    asset_files = asset_files or CatalogAssetFiles()
    asset_registry = asset_registry or CatalogAssetRegistry()
    metadata_schema = metadata_schema or CatalogMetadataSchema()
    revision_kernel = CatalogRevisionKernel(catalog_locks)
    revision_comparison = CatalogRevisionComparison(revision_kernel)
    component_history_reads = CatalogComponentHistoryReads(revision_kernel)
    component_read_models = CatalogComponentReadModels(revision_kernel)
    component_queries = CatalogComponentQueries(component_read_models)
    asset_browser = CatalogAssetBrowser()
    preview_pipeline = CatalogPreviewPipeline(
        catalog_locks, revision_kernel, component_read_models, preview_renderer, preview_store
    )
    revision_finalizer = CatalogRevisionFinalizer(revision_kernel, preview_pipeline)
    asset_links = CatalogAssetLinks(revision_kernel, preview_pipeline, revision_finalizer)
    asset_imports = CatalogAssetImports(
        revision_kernel, asset_links, revision_finalizer, asset_files, asset_registry
    )
    representations = CatalogRepresentations(revision_kernel, revision_finalizer)
    component_writer = CatalogComponentWriter(
        catalog_locks, revision_kernel, revision_finalizer, metadata_schema
    )
    klc_validation = CatalogKlcValidation(revision_kernel, component_read_models)
    release_workflow = CatalogReleaseWorkflow(
        catalog_locks, revision_kernel, component_read_models, revision_finalizer, klc_validation
    )
    catalog_health = CatalogHealth(component_queries, klc_validation)
    placement = CatalogPlacement(revision_kernel, component_read_models)
    dbl_export = CatalogDblExport(placement)
    provider_tokens = CatalogProviderTokens()
    remote_heads = CatalogRemoteHeads()
    project_import_sessions = CatalogProjectImportSessions()
    project_import_matching = CatalogProjectImportMatching()
    project_import_assets = CatalogProjectImportAssets(revision_kernel)
    project_import_acceptance = CatalogProjectImportAcceptance(
        catalog_locks,
        revision_kernel,
        project_import_assets,
        project_import_matching,
        asset_files,
        asset_registry,
        asset_links,
        revision_finalizer,
        component_writer,
    )
    metadata_fields = CatalogMetadataFields(metadata_schema)
    metadata_grid = CatalogMetadataGrid()
    metadata_csv = CatalogMetadataCsv()
    inventory_csv = CatalogInventoryCsv()
    metadata_batches = CatalogMetadataBatches()
    metadata_batch_staging = CatalogMetadataBatchStaging()
    metadata_batch_application = CatalogMetadataBatchApplication()
    metadata_batch_workflow = CatalogMetadataBatchWorkflow(
        catalog_locks,
        revision_kernel,
        revision_finalizer,
        component_writer,
        metadata_fields,
        metadata_batches,
        metadata_batch_staging,
        metadata_batch_application,
    )
    metadata_csv_importer = CatalogMetadataCsvImporter(
        component_writer, asset_imports, asset_links, revision_finalizer
    )
    return CatalogCollaborators(
        catalog_locks=catalog_locks,
        revision_kernel=revision_kernel,
        revision_comparison=revision_comparison,
        component_history_reads=component_history_reads,
        component_read_models=component_read_models,
        component_queries=component_queries,
        asset_browser=asset_browser,
        asset_files=asset_files,
        asset_registry=asset_registry,
        preview_renderer=preview_renderer,
        preview_store=preview_store,
        preview_pipeline=preview_pipeline,
        revision_finalizer=revision_finalizer,
        asset_links=asset_links,
        asset_imports=asset_imports,
        representations=representations,
        component_writer=component_writer,
        klc_validation=klc_validation,
        release_workflow=release_workflow,
        catalog_health=catalog_health,
        placement=placement,
        dbl_export=dbl_export,
        provider_tokens=provider_tokens,
        remote_heads=remote_heads,
        project_import_sessions=project_import_sessions,
        project_import_matching=project_import_matching,
        project_import_assets=project_import_assets,
        project_import_acceptance=project_import_acceptance,
        metadata_schema=metadata_schema,
        metadata_fields=metadata_fields,
        metadata_grid=metadata_grid,
        metadata_csv=metadata_csv,
        inventory_csv=inventory_csv,
        metadata_batches=metadata_batches,
        metadata_batch_staging=metadata_batch_staging,
        metadata_batch_application=metadata_batch_application,
        metadata_batch_workflow=metadata_batch_workflow,
        metadata_csv_importer=metadata_csv_importer,
    )
