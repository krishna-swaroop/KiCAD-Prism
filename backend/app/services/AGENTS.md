# Backend services

This map focuses on the catalog subsystem, whose public surface spans several
large modules. Read `AGENTS.md` at the repository root first.

## Catalog layering

Three files, and the names do not tell you which to use:

| File | Role |
| --- | --- |
| `component_catalog_service.py` | Compatibility import and runtime singleton. |
| `component_catalog_service_postgres.py` | Concrete PostgreSQL connection, schema initialization, and database-specific overrides. |
| `component_catalog_domain.py` | Compatibility facade: the historical callable surface, delegating to collaborators in `catalog/`. |

`ComponentCatalogPostgresService` inherits `ComponentCatalogDomainService`,
owns PostgreSQL connection and schema setup, and passes PostgreSQL locks into
the shared collaborator graph in `catalog/collaborators.py`. The compatibility
facade owns transaction boundaries. The
behavior itself lives in `backend/app/services/catalog/`; read
`backend/app/services/catalog/AGENTS.md` for the layer map. To find where a
facade method lands, search the facade for the method name and follow the
`self._<collaborator>.` call. Public reads generally begin with `list_`,
`get_`, or `search_`.

Metadata batches (bulk grid edits and CSV imports) go stage → approve proposed
fields → apply → accounting in `catalog/metadata_batch_lifecycle.py`, which owns
one transaction per step. The facade's batch methods, which the API and the
`catalog_metadata_batch` worker call, forward to it through
`catalog_service.metadata_batch_lifecycle`.

Do not extend the inheritance split casually. When adding a cohesive capability,
first consider a narrow collaborator with a public API that both workers and
HTTP handlers can use; avoid creating another caller of private catalog methods.

## Schema migrations

Every PostgreSQL schema changes only through a numbered ledger.
`schema_ledger.py` is the one runner (ledger table, lock, renumbering, legacy
adoption, pending report); `schema_head.py` lists the ledgers in dependency
order and is what startup calls. Steps live per schema:
`workspace_schema_migrations.py` (bodies in `workspace_migrations/`),
`auth_schema_migrations.py`, `comments_schema_migrations.py`,
`catalog_schema_migrations.py` (its `supply_tables` step creates the supply
module's `supply_*` tables), `artifact_schema_migrations.py`. Add a step
rather than DDL in a service (see `website/src/content/docs/admin/upgrades.md`). The catalog baseline is
its step 0 and the catalog is forward-only: a new built-in metadata field or a
base-table change is a new step. Only the epoch guard and derived state
(projection versions, search indexes, integrity guards) run on every start, from
`ComponentCatalogPostgresService.initialize`.

## Catalog jobs

`catalog_worker_tasks.py` holds the `HANDLERS` table and declares one catalog
`JobKind` per entry (`CATALOG_JOB_KINDS`):

`catalog_validation`, `catalog_preview_generation`, `project_component_import`,
`folder_library_import`, `artifact_maintenance`, `catalog_metadata_batch`,
`catalog_model_glb` (catalog STEP → GLB with Geometer), `project_catalog_usage`
(which catalog revision a synced commit placed; `project_catalog_usage_service.py`
over `catalog/project_placements.py`, queued after each sync).

Each task takes the `JobContext` and records resumable state with
`context.save_checkpoint(checkpoint=..., result=...)`; a retried attempt reads
`context.checkpoint` and `context.partial_result`. Tasks that checkpoint must
therefore tolerate resumption and must not duplicate completed work after a
lease is reclaimed. `catalog_job_service.py` shows a job in the catalog API's
shape.

## Rules that live here

- **Fail closed.** `rate_limit_service.py` explains why the limiter denies on
  outage rather than allowing. Do not invert it for convenience.
- **Host keys are pinned.** `git_remote_access.py` documents why
  `accept-new` was removed. Do not restore it.
- **Role-aware lookups only.** See the access-control section in the root
  `AGENTS.md`.
- **Audit identity comes from the session**, never from the request payload.

## A project at a revision

`project_revision.py` is the one place that decides where a project sits in its
repository (`locate`, `locate_id`), resolves a ref (`resolve_commit`), and
materializes files at a commit (`checkout`, `materialize`, with the
`FULL_TREE`, `KICAD_SOURCES` and `COMPARE_INPUTS` source sets). It reads Git
objects rather than `git archive`, and keeps only symlinks that resolve inside
the checkout. Do not add another `rev-parse --show-toplevel`, `.git` walk-up or
`git archive | tar` next to a caller. Remote transport (credentials, pinned host
keys, ls-remote) is `git_remote_access.py`.

Which files of a revision are design sources is one rule,
`project_revision.is_generated` (it builds on `kicad_noise_service.is_noise`,
which the desktop agent loads by path, so that module stays stdlib-only). Source
sets, the design-compare file list, the semantic-index cache key and its
schematic field overlay all apply it; do not add another suffix or autosave
filter next to a reader.

A project's commit history is `project_history_scope.py` (issue #681): the
commits that change its directory, less the files another project owns there
(KiCad's stem rule) and registered projects nested inside it, from the commit
that added its project file. `project_outputs.history_context` builds it for a
project; the History list and the card's latest commit both use it. Do not
filter history by directory alone.

Project settings edited in Prism live in the workspace database
(`project_settings_service.py`) and win over the committed .prism.json file;
nothing writes into a checkout, because Sync fast-forwards only a clean tree.

## KiCad tools

`kicad_tools.py` is the only place that locates or starts `kicad-cli`
(Settings `KICAD_CLI_PATH`). Callers take a `KicadTool` and state a timeout; do
not add `subprocess` calls or path lookups for them elsewhere.
`kicad_tool_replay.py` records and replays runs for tests.

## KiCad library text

`kicad_library_reader.py` reads KiCad text without parsing geometry: form
ends, top-level symbol blocks and properties, footprint names (`footprint` and
legacy `module`), model references, and folder link resolution with an explicit
`ambiguous` outcome. Catalog uploads (`catalog/asset_files.py`), folder
discovery (`kicad_library_discovery.py`), folder import
(`library_folder_import_service.py`, built from the discovery result), project
component extraction and the semantic index use it. Do not add another
balancer or property regex.

## Project component import

`project_component_import_service.py` scans one session's projects into catalog
proposals. `project_component_bundle_assets.py` is the only asset index (R1):
it joins a component through the bundle's occurrences and placements
projections, sources the symbol and footprint from the project's own symbol and
footprint library tables, and resolves 3D models from the bundle's project
projection. A member that is still building raises `DesignDataPending` and the
import session retries. `project_component_asset_extractor.py` keeps the shared
text helpers (`footprint_land_pattern`, `ContentAddressedAssetStager`,
`sanitize_board_footprint`) for the bundle index; its checkout walk
(`ProjectAssetSnapshotIndex`, `build_project_asset_index`) is gone with R1, and
the catalog's library-file readers are the allow-listed tool uses (R2).

## Viewer sources

`project_viewer_sources_bundle.py` maps the viewer-source routes
(`backend/app/api/project_viewer_sources.py`) onto a revision's bundle: the
bundle manifest's effective configuration names the project file, root
schematic and board, and its project projection lists the hierarchy's
schematics and their resolved drawing sheets. A request without a commit reads
the checkout's HEAD. It never reads a `.kicad_pro` or scans a directory, and it
declines (404) rather than approximating when the bundle has no answer. The
`/3d-model` route stays legacy: it serves a committed design-output model, which
the bundle does not carry.

## 3D tab

`viewer_3d_bundle.py` serves the 3D tab from the design bundle (ADR amendment
V2): the status the tab already reads, built from the pack's and the parts
GLB's readiness (opening the revision queues its `design_bundle` build), the
viewer's `prism.viewer_3d.analytic.a0` document, and the pack, stackup and GLB
members by revision key under the asset route's design-bundle prefix
(`backend/app/api/project_viewer_3d.py`). There is no mesh path; it went at
System Builder v2's stage 0.

## Design variants

`variant_catalog_service.py` reads the ordered catalog from the bundle's
semantic-index member (a2): `assembly.catalog` is the catalog and the member's
own diagnostics are the catalog's, with bundle paths mapped back to
project-relative spelling. There is one path — no source scanner and no
`bundle_only` switch (WP-X). A member that is
building raises `DesignDataPending` and one that failed `DesignDataFailed`;
Release Studio's Source step treats either as best-effort and offers only the
explicit default. `project_source_snapshot.py` keeps only the revision-identity
seam (`project_revision_identity`, `_anchor_source`) that comment anchors use;
its checkout snapshot and catalog cache went with WP-X.
The `assembly` block (default and per-variant occurrence, component and
footprint state) comes from the bundle's semantic-index member (a2), built by
`prism-kicad`; the Python resolver (`semantic_index_variants`) and the
Python index build are gone (WP-R2). Resolver semantics belong to the frozen
design-variant contract packet (issue #169), not to this file.
`semantic_index_service` is a reader: every public function serves the bundle's
semantic-index member (a2), a request without a commit reading HEAD. A member
that is building raises `DesignDataPending` and one that failed
`DesignDataFailed`. Its remaining cache-key helpers (`_revision_identity`,
`_revision_key`, `_source_entries_*`, `source_revision_key_for_project_file`)
are shared with the catalog, comment anchors and Sim Studio; they read Git
listings only. `generator_cache_tag()` names the design-bundle generator
contract for catalog provenance.

## Design comparison

Design Comparison has one path (R1): `design_compare_bundle_path.py` (§9 step
5). Each side comes from its bundle, or from its source tree materialized as
the `design_bundle` job does (`design_bundle/jobs.py` `prepare_sources`);
`prism-kicad compare` computes every tab but fabrication; fabrication stays
`kicad-cli`, cached by bundle key; the artifact is the
`prism.design_compare_bundle_v2` manifest. `design_compare_service.py` keeps
the revision cache, the fabrication plot, the render sidecars and the job
status reads; the staged legacy pipeline, its Node parser and the
`design_compare_nodes`/`occurrences`/`semantics`/`net_pairing`/`sources`/
`document_diff_service`/`bom_diff_service` modules were deleted with R1.

Settled (D24, D25): a change kind's category and primary/secondary stay on the
backend (in `prism-kicad compare`, `compare/result/objects.rs`); the frontend
kind table holds domain, noun and traits only. There are two component ids on
purpose: the project semantic index keys a component by `(reference, symbol
UUID)`, design comparison keys a review row by designator
(`component_uid(reference)`), because a comparison matches parts across
revisions where symbol UUIDs may change. Unifying them would change every
cached index's `componentUid` and the variant join.

One backend rule: the viewer must never infer the old route from the comparison
object. Each revision carries its own geometry (amendment C2r).

## Superseded stores

`superseded_store_cleanup.py` runs once from the API lifespan (WP-R4, ADR §8):
it removes the old `semantic-index` and `semantic-visualizer` directories under
the data root's `.kicad-prism`, both retired with their readers, and the 3D
commit index they carried (the per-project commit index file) goes with the
latter. It logs the bytes reclaimed and records a marker beside them so a
restart does nothing. It refuses symlinks and never removes anything outside
the configured data root. `system_interface_artifacts` and
`system_bundle_frames` were dropped by workspace migration 123. The Design
Comparison revision cache is deliberately not part of this: source-tree
comparisons and the fabrication plot cached by bundle key still use it.

## System Builder

Removed on 2026-10-23 (`docs/system-builder/README.md`). No service here
belongs to it.

## Comments and issue publication

Every root and reply write goes through `comments_store_writes.py`: given the
caller's `ActorIdentity` it authorizes inside the write's transaction
(`comment_permissions.py`), mutates, records the revision and the change event,
and returns the thread with the actor's capabilities (`comment_capabilities.py`),
promote and share included. Routes only translate HTTP; the expected revision
comes from `If-Match` (`comments_revisions.etag`). Every reply is stamped with
the transaction's `NOW()`. Row writes shared with the tracker (inbound replies,
system notes, reply `sync_state`) are `comment_write.py`; edits, status and
tombstones are `comments_revisions.py`, which streams through
`comment_live_events.record_thread_change`. Do not write `comments` or
`comment_replies` anywhere else (`backend/tests/test_comment_write.py` enforces it).
`comments_store_service.py` holds reads, JSON import/export and project
deletion; `comment_anchor_bindings.py` preserves binding history.
`comment_live_events.py` appends durable metadata in the same transaction as a
mutation (tracker tables stream through the trigger in
`trackers/projection_events.py`); `comment_live_broker.py` wakes socket readers. Keep HTTP snapshots as
content authority and never let a tracker failure prevent local discussion.

`trackers/connector_runtime.py` turns a connector into its one status and its
adapters (and hands executors their database connection);
`trackers/providers.py` holds one kit per host with everything provider-specific
(instances, account linking, web URLs, issue and comment adapters, recovery
listing); `trackers/forge_client.py` is the adapters' shared HTTP helper.
Promotion, reply/thread/state executors, webhook inboxes, and polling live under
`trackers/`; provider-specific operations belong in a kit, never in generic
handlers. Tests plug `backend/tests/tracker_fault_harness.py` `StatefulFakeForge` in at
the runtime seam (`install_fake_provider`), not by patching executor privates. Read `website/src/content/docs/admin/issue-trackers.md` and
`docs/tracker-integration/CONTRACTS.md` before changing credential, idempotency,
remote recovery, or authorization behavior.

## Fabrication viewer

`fabrication_view_service.py` turns a set of Gerber and drill files into a view
model and one SVG per layer; `placement_service.py` parses a position file and a
BOM and checks one against the other. Both are pure: files in, view out, and
both refuse with typed errors (`FabricationViewError` is a 404,
`PlacementError` a 422). The routes that feed them are all in
`backend/app/api/fabrication_view.py`: a Release Studio build's dossier, and a
folder of committed outputs. A build's members are read through
`BuildArchives.released_members` (`release_studio_publish_service.py`), the
same digest-checked read as Release Studio's member download; never open the
dossier tarball yourself. A folder's files come through `project_outputs.py`,
which the project routes and the viewer sources share: where a project's output
folders are, and a file or listing out of one at a commit.

The parsing and drawing belong to `fabrication_compare_service.py`, which is
grandfathered at its current length and must not grow. New behavior goes in the
new modules; use its public functions (`board_outline`, `layer_bounds`,
`safe_name`, `svg_number` ...) rather than copying them.

Rules that are easy to break:

- **Gerber and position files are Y-up; the board frame is Y-down.** The flip is
  done once, in the SVG renderer and in `placement_service.build_view`. Do not
  flip again downstream.
- **A declared layer function wins.** File names are read only for files with no
  Gerber X2 function (`fabrication_view_service._classify_by_name`).
- **An output folder's package reaches three levels down** (`_MAX_DEPTH` in
  `backend/app/api/fabrication_view.py`, `PACKAGE_DEPTH` in
  `frontend/src/components/fabrication-viewer/sources.ts`), and shows **one
  export** (`fabrication_view_service.nearest_export`): the shallowest folder of
  Gerbers with its own subfolders, plus drill files outside every other export.
  Another folder of Gerbers in reach (a vendor pack, an older revision) is left
  out and opens on its own; the file limits measure the export shown. Files are
  laid out flat by name for discovery; on a name clash the file nearest the top
  wins. Position files and the BOM are found anywhere in reach, each parsed once;
  a top and a bottom position file are read together
  (`placement_service.position_files`); a second export of the same board is not.
- **Drill maps are not layers** (`fabrication_view_service.is_drill_map`): their
  legend would set the board's extent.
- **Layer names are for reading** (`display_names`). Drill programs are named by
  plating; a name that is still ambiguous drops the board name the package's files
  share before falling back to the whole file name.
- **Match columns by meaning, not by name.** KiCad and the JLCPCB plugin name the
  same columns differently, and a JLCPCB BOM has a `Designator` column, so a
  position file is recognised by having coordinates, not by its name.
- **A layer SVG is its colour, fully opaque, where plotted and transparent elsewhere.**
  A layer with nothing cleared (most of them) is drawn in its colour directly. Only a
  layer with clear polarity, or an aperture with a hole, is drawn white-on-black as a
  mask with the colour filled through it, so the cut shows what is behind instead of
  painting black. A mask costs the browser a second drawing, so it is used only then.
  The viewer stacks the layers; nothing is blended, and no SVG carries `opacity`.
- **Bump `RENDER_VERSION` whenever `svg()` draws differently.** Build layers and
  layers at a pinned commit are cached by the browser for a year as immutable, and
  the viewer puts the version in every layer URL. Without the bump, a browser keeps
  the old drawing: after the switch to opaque stacking, cached SVGs with a black
  background hid every layer under the last one painted. Changing which files make
  a package counts: every layer is drawn on the package's extent, so leaving drill
  maps out (version 4) moved every layer.
- **A drawn line is at least 1.5 screen pixels wide.** `with_minimum_stroke` adds a
  `width` media-query ladder to each layer SVG: an image SVG evaluates those against
  its own rendered width, so the SVG can size its minimum line to the zoom without
  the viewer telling it. Without it a 0.1 mm silkscreen or outline line is under a
  pixel at fit zoom and renders dimmer than its swatch. Only polylines (and drill
  circles) are widened; pads, vias and aperture-macro lines keep their true size.
