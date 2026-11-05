# Library workspace

Two distinct concerns share this directory: **project workspace** (folders,
listing, project actions) and **component library** (catalog authoring, import,
release). Read `AGENTS.md` at the repository root first.

The split is by filename prefix, not by folder:

- `workspace-*`, `*-folder-dialog`, `*-project-dialog` — project workspace,
  mounted from `frontend/src/components/workspace.tsx`.
- `library-*` — component library, the frontend for the catalog services in
  `backend/app/services/AGENTS.md`.

## This directory is where the state rule matters most

`library-component-workspace.tsx` coordinates many independent forms and
workflows. Treat it as an orchestration hotspot, not a pattern for adding more
local state.

Before adding state here, check whether the value is already available from the
URL, the loaded component record, or the current selection. If it is, derive it.

The imperative-system case described in the root map is uncommon here. Most of
these modules are forms and grids over server data rather than viewer bridges.

## Modules

**Component authoring** — `library-component-workspace.tsx` (the coordinator:
URL ownership and current/historical selection stay here),
`library-component-chrome.tsx` (shared badges, cards, empty/loading chrome;
cards carry a title, never a description),
`library-component-assets.tsx` (the Assets tab: representation rows, files by
type, one preview of the picked representation),
`library-component-evidence.ts` (tab evidence load hooks, no store or query
library), `library-component-validation.ts` (component-scoped AbortController
and `watchPrismJob` adapter; the coordinator starts/aborts and applies the
originating component's result), `library-component-evidence-panels.tsx` (read-only revisions, review,
usage, and audit evidence), `library-component-metadata-dialog.tsx` and
`library-component-asset-dialog.tsx` (edit sessions captured at open, one
success callback), `library-component-metadata-form.ts` (definition-driven
values and storage-key PATCH mapping; required and shape verdicts come from
`frontend/src/lib/catalog-field-rules.ts` in its `editor` context, which checks
presence only),
`library-component-metadata-fields.tsx` (typed input adapters),
`library-component-asset-download.ts` (released-revision downloads through the
matching remote-provider representation, not the default placement pair),
`library-component-quick-view.tsx`,
`library-component-mates.tsx` (a part's "mates with" list and editor),
`library-component-models.tsx` (STEP → GLB status, alignment editor and Geometer preview),
`library-asset-link-picker.tsx`.

**Staged grid edits** — `use-staged-grid-edits.ts` is the one engine for both
spreadsheet grids (bulk edit and import remediation): local edits until save,
cell/fill-down/paste writes as single undo steps, undo/redo 100 steps deep in
both grids, reset on save or apply, and the undo/redo/save
hotkeys (optionally scoped to the grid's element). It sits on the pure reducer
in `use-edit-history.ts`; a grid supplies only its `writeCell`.

**Previews** — two paths that share nothing but a subject.
`library-preview-viewport.tsx` pans and zooms a stored SVG render
(`/api/catalog/previews/{id}`) with `react-zoom-pan-pinch`; the Assets tab
thumbnails and the revision visual diff use it. Everything else is live:
`library-asset-renderer.tsx` draws a `.kicad_sym` or `.kicad_mod` into a canvas
through the vendored renderer, `library-preview-inspector.tsx` pairs a symbol
with its footprint, `library-cross-probe.tsx` carries a pin↔pad probe between
the two, and `library-preview-pair.ts` decides which representation's assets a
pair draws. Navigation belongs to the viewer, not to the frame around it — see
`frontend/src/lib/ecad-renderer.ts`.

**Lists** — the catalog, release queue and bulk edit page with
`library-pager.tsx`. Section and filter switches use the studios' segmented
tabs (`frontend/src/components/ui/studio-tabs.tsx`). No helper sentences: labels, counts, and
`title` hints for the detail.

**Catalog client** — `catalog-client.ts` is the one place that knows
`/api/catalog` URLs: one function per operation over `frontend/src/lib/api.ts`.
Components call it; component tests fake it (`vi.mock("./catalog-client")`) and
`catalog-client.test.ts` pins the wire format.

**Import** — `library-import-center.tsx` (scan polling through `usePoll` in
`frontend/src/lib/server-state.ts`),
`library-import-session-proposals.ts` (proposals keyed by session ID; abort
superseded reads),
`library-import-remediation-dialog.tsx`, `library-import-remediation-grid.tsx`
(both take readiness from `frontend/src/lib/catalog-field-rules.ts`, the rules
the server enforces on accept, and edit custom field values through
`library-import-custom-fields.ts`),
`library-folder-discovery-dialog.tsx`. Import produces proposals that a human
remediates before acceptance; the grid is the remediation surface.

**Catalog and release** — `library-catalog-workspace.tsx` (its header carries
`library-catalog-file-check.tsx`, the admin's on-demand released-file disk check, and
`create-component-dialog.tsx`, the New component dialog the supply BOM drawer also opens),
`library-manager-workspace.tsx`, `library-bulk-edit-workspace.tsx`,
`library-release-queue.tsx`. Release transitions are governed on the backend —
the frontend requests a transition, it does not decide one.

**Project workspace** — `workspace-sidebar.tsx`, `workspace-list-view.tsx`,
`workspace-gallery-view.tsx`, `workspace-breadcrumbs.tsx`,
`workspace-project-toolbar.tsx`, `workspace-action-menus.tsx`,
`workspace-project-properties-sheet.tsx`, `workspace-loading-state.tsx`,
`workspace-types.ts`, and the four folder/project dialogs.

**Shared** — `async-search-picker.tsx` is the debounced remote-search control.
Its input buffer is genuinely local state; the resolved selection is not.

## Traps

- **Release status is authority-gated.** Do not derive what a user may do from
  the status alone; roles decide. See `frontend/src/lib/roles.ts`.
- **Catalog jobs are checkpointed and resumable.** A job that appears stalled
  may be mid-resume. Poll job state rather than inferring from partial results.
- **Bulk edit writes many records.** Confirm the failure mode of a partial batch
  before changing its submission path.
- `library-component-workspace.tsx` is slated for decomposition. Do not add to
  it if the work can live in a sibling module.
- **Single-editor extras stay writable.** Field definitions are admin-gated, so
  the metadata dialog always keeps the additional-extras JSON box. Designers
  can still add ad-hoc keys; defined extras render as typed controls and are
  omitted from that leftover object.
