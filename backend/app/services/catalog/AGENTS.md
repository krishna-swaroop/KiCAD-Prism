# Catalog package

This package holds the decomposed catalog implementation. The running service
is still composed outside it: `backend/app/services/component_catalog_service.py`
is the stable singleton root, `backend/app/services/component_catalog_service_postgres.py`
owns the PostgreSQL connection and lock implementation, and
`backend/app/services/component_catalog_domain.py` is the compatibility facade
that keeps the historical callable surface by explicit delegation. Callers
outside `backend/app/services/` use the facade; new behavior lives here.

## Layers

Modules depend downward only. Nothing here may import the three legacy catalog
modules, directly or relatively. No mixins, no `__getattr__` delegation, no
collaborator that holds a reference back to the facade.

| Layer | Modules |
| --- | --- |
| Foundation (pure) | `normalization.py`, `metadata_normalization.py`, `metadata_descriptors.py`, `metadata_schema.py`, `asset_types.py`, `runtime.py` (paths and process-local caches), `kicad_cli.py`, `signed_urls.py`, `placement_payloads.py`, `metadata_csv.py`, `inventory_csv.py` (parsing), `inventory_policy.py`, `conflicts.py` |
| Persistence (PostgreSQL) | `postgres_runtime.py`, `postgres_schema.py`, `postgres_projections.py`, `postgres_integrity.py`, `locking.py`, `revision_kernel.py`, `asset_registry.py`, `asset_files.py`, `preview_store.py`, `metadata_fields.py`, `metadata_grid.py`, `metadata_batches.py`, `project_import_matching.py`, `provider_tokens.py` |
| Domain operations | components: `component_writer.py`, `component_read_models.py`, `component_queries.py`, `component_history.py`, `revision_comparison.py`, `revision_finalization.py`, `representations.py`, `remote_heads.py` · assets: `asset_browser.py`, `asset_links.py`, `asset_imports.py`, `preview_renderer.py`, `preview_pipeline.py` · metadata: `metadata_batch_staging.py`, `metadata_batch_application.py`, `metadata_batch_workflow.py`, `metadata_csv_import.py` · imports: `project_import_sessions.py`, `project_import_assets.py`, `project_import_acceptance.py` · validation and release: `klc_validation.py`, `release_workflow.py`, `health.py` · provider: `placement.py`, `dbl_export.py` |
| Wiring | `collaborators.py` (one named graph per service instance; does not import the facade) |

Collaborators take `conn` (and `runtime` where files are touched) as explicit
parameters and never commit; the facade owns transactions. The exception is
batch preview generation, which commits per component for durability and says
so at the call site.

## Compatibility-facade size waiver

The alpha-lifecycle compatibility facade is explicitly grandfathered at 2,014
physical lines, above the 500-line target for new facades and orchestrators.
Its size comes from explicit, signature-preserving forwarding methods and
the transaction scopes around them. It may contain no domain implementation,
may not grow, and its architecture ceiling can only decrease. New behavior
belongs in this package; dynamic delegation, mixins, and collaborators that
depend back on the facade remain prohibited. The retirement conditions and
rationale are recorded in `docs/CATALOG_DECOMPOSITION_HANDOFF.md`.

## Contracts that must not move

- Revision manifest hashes, audit-chain hashes, and preview fingerprints
  (`revision_kernel.py`, `preview_pipeline.py`).
- Placement manifests, inline bundles, and signed-URL messages
  (`placement.py`, `placement_payloads.py`, `signed_urls.py`); outputs are
  byte-stable for identical inputs.
- DBL bundle layout, column order, and file names (`dbl_export.py`).
- Release gating is fail-closed and review/release records are append-only
  (`release_workflow.py`).
- Canonical asset paths under the store root (`asset_files.py`, `runtime.py`).

## Navigation

Start from `backend/app/api/catalog_admin.py` and
`backend/app/api/remote_provider.py`, then follow the facade method into its
collaborator. Worker dispatch is in `backend/app/services/catalog_worker_tasks.py`.
Characterization coverage is `backend/tests/test_component_catalog_postgres_integration.py`;
focused unit coverage sits in `backend/tests/test_catalog_*.py`. Private-caller
and module-size ratchets are enforced by `scripts/check_catalog_architecture.py`
and `backend/tests/test_catalog_architecture.py`; run the script with
`--update-baseline` only to record reductions.
