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
| Foundation (pure) | `workflow_policy.py`, `field_rules.py`, `normalization.py`, `metadata_normalization.py`, `metadata_descriptors.py`, `metadata_schema.py`, `asset_types.py`, `runtime.py` (paths and process-local caches), `signed_urls.py`, `placement_payloads.py`, `placement_stamp.py` (reads the placed-revision stamp from schematics), `kicad_embedded_files.py`, `embedded_model_copies.py` (kept compressed model copies), `metadata_csv.py`, `inventory_csv.py` (parsing), `inventory_policy.py`, `conflicts.py` |
| Persistence (PostgreSQL) | `postgres_runtime.py`, `postgres_schema.py`, `postgres_projections.py`, `postgres_integrity.py`, `locking.py`, `revision_kernel.py`, `asset_registry.py`, `asset_files.py`, `step_quarantine.py`, `preview_store.py`, `metadata_fields.py`, `metadata_grid.py`, `metadata_batches.py`, `component_identity.py`, `project_import_matching.py`, `project_placements.py` (which revision a project commit placed), `provider_tokens.py` |
| Domain operations | components: `component_writer.py`, `component_read_models.py`, `component_queries.py`, `component_history.py`, `revision_comparison.py`, `revision_finalization.py`, `representations.py`, `remote_heads.py` · assets: `asset_browser.py`, `asset_links.py`, `asset_imports.py`, `preview_renderer.py`, `preview_pipeline.py`, `staged_uploads.py` (signed one-write upload slots on disk), `draft_checks.py` (read, KLC-check and render a file that is not stored) · metadata: `metadata_batch_staging.py`, `metadata_batch_application.py`, `metadata_batch_workflow.py` · imports: `project_import_sessions.py`, `project_import_assets.py`, `project_import_acceptance.py`, `library_import_writer.py` (the writes behind the bulk library-import CLIs in `scripts/`) · validation and release: `klc_validation.py`, `release_workflow.py`, `health.py` · provider: `placement.py`, `dbl_export.py` |
| Wiring | `collaborators.py` (one named graph per service instance; does not import the facade) |
| Facades | `part_relations_facade.py`: "mates with" and model alignment. Exposed as `catalog_service.part_relations`; owns its transactions over the shared revision kernel, and takes a connection factory rather than the compatibility facade. `metadata_batch_lifecycle.py`: one metadata batch from staging through field approval and application to its accounting, one transaction per step. Exposed as `catalog_service.metadata_batch_lifecycle`; the facade's batch methods forward to it. |

Collaborators take `conn` (and `runtime` where files are touched) as explicit
parameters and never commit; the facade, or one of the facades above, owns
transactions. The exception is batch preview generation, which commits per
component for durability and says so at the call site.

## Compatibility-facade size waiver

The alpha-lifecycle compatibility facade is explicitly grandfathered at 1,222
physical lines (2,014 before AC-19 removed the forwarders nothing called),
above the 500-line target for new facades and orchestrators. Its size comes
from explicit, signature-preserving forwarding methods for the surface that
still has callers, and the transaction scopes around them. Tests reach
collaborators through `runtime`, `asset_files`, `connection()` and
`build_catalog_collaborators(...)`, not facade privates; the private-use
baseline is empty and must stay so. It may contain no domain implementation,
may not grow, and its architecture ceiling can only decrease. New behavior
belongs in this package; dynamic delegation, mixins, and collaborators that
depend back on the facade remain prohibited. The retirement conditions and
rationale are recorded in `docs/CATALOG_DECOMPOSITION_HANDOFF.md`.

## Contracts that must not move

- Revision manifest hashes, audit-chain hashes, and preview fingerprints
  (`revision_kernel.py`, `preview_pipeline.py`).
- Placement manifests, inline bundles, and signed-URL messages
  (`placement.py`, `placement_payloads.py`, `signed_urls.py`); outputs are
  byte-stable for identical inputs. Remote placement stamps symbols with
  hidden `Prism_Component`/`Prism_Revision` properties; those two names are
  reserved through `metadata_normalization.is_reserved_stamp_key`
  (custom-field key canonicalization), and unstamped output (DBL) is
  unchanged.
- DBL bundle layout, column order, and file names (`dbl_export.py`).
- Release gating is fail-closed and review/release records are append-only
  (`release_workflow.py`). Bulk library imports release only through its
  trusted-import path (`release_trusted_import`), which applies the same gates,
  and take slugs and identities under the component writer's locks
  (`library_import_writer.py`).
- Workflow stages, legacy aliases, transitions, and role rights have one
  definition (`workflow_policy.py`). The API, release workflow, and revision
  kernel import it; the frontend's offered transitions are generated from it
  into `frontend/src/lib/catalog-workflow-policy.generated.ts` and
  `backend/tests/test_workflow_policy.py` fails on drift.
- Field validity and import readiness have one definition (`field_rules.py`):
  which fields are required for an identity kind, which contexts check value
  shape, and which import findings block. Batch staging, import scans,
  import acceptance and the single-component PATCH call it (the last two
  enforce custom required fields server-side); the frontend renders the same verdicts from
  `frontend/src/lib/catalog-field-rules.generated.ts` through
  `frontend/src/lib/catalog-field-rules.ts`, and
  `backend/tests/test_catalog_field_rules.py` fails on drift. Both test suites
  run the hand-written case table `frontend/src/lib/catalog-field-rules.cases.json`.
- Component identity is normalized and looked up in one place
  (`component_identity.py`): the writer's uniqueness check, import acceptance,
  folder discovery and usage indexing all see active and retired holders alike.
- Write-conflict classification is `CatalogConflict.code` (`conflicts.py`). A
  stale revision is 412 `revision_conflict` (with the current `ETag`); referential and manifest conflicts are 409. Bodies are the app's one
  flat shape `{"detail", "code"}` (`backend/app/core/errors.py`). Single-component
  writes take the component ETag (`"component:<id>:<revision id>"`) as `If-Match`.
  Two body guards stay by decision (D38, D39): metadata batches carry a per-row
  `expected_revision_id` (a stale row fails that item), and the workflow
  transition also checks `expected_manifest_hash` (409 `manifest_conflict`).
- Canonical asset paths under the store root (`asset_files.py`, `runtime.py`).
- Paginated catalog and remote-head lists end `ORDER BY` with immutable
  component identity (`component_queries.py`, `remote_heads.py`). This is a
  stable-dataset total order, not snapshot isolation across concurrent writes.

## Navigation

Start from `backend/app/api/catalog_admin.py` and
`backend/app/api/remote_provider.py`, then follow the facade method into its
collaborator. Worker dispatch is in `backend/app/services/catalog_worker_tasks.py`.
Characterization coverage is `backend/tests/test_component_catalog_postgres_integration.py`;
focused unit coverage sits in `backend/tests/test_catalog_*.py`. Private-caller
and module-size ratchets are enforced by `scripts/check_catalog_architecture.py`
and `backend/tests/test_catalog_architecture.py`; run the script with
`--update-baseline` only to record reductions.
