# AGENTS.md

Canonical, model-neutral navigation and hard rules for coding agents working in
KiCAD Prism. Keep this file short: supported product behavior belongs in public
documentation, and task procedures belong in the focused skills below. Paths
are repo-root relative and CI-verified by `scripts/check_agent_docs.py`.

**Read these before acting, not after:**

- Service topology, storage domains, PostgreSQL schemas, trust boundaries —
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Read before changing any service
  boundary, job class, or persistence path.
- Setup, check suites, branch prefixes, dependency policy —
  [CONTRIBUTING.md](CONTRIBUTING.md). Read before your first command in a fresh
  checkout, and before adding any dependency.

Deeper maps live next to the code they describe. Read the one covering your
change:

| Working in | Read |
| --- | --- |
| Release Studio | `backend/app/release_studio/AGENTS.md` |
| Catalog services | `backend/app/services/AGENTS.md` |
| Design comparison | `frontend/src/components/design-comparison/AGENTS.md` |
| Library workspace | `frontend/src/components/workspace/AGENTS.md` |

## Task skills

These are model-neutral playbooks. Agents that do not discover repository
skills automatically should open the relevant linked playbook directly.

| Task | Skill |
| --- | --- |
| Select and report verification checks | `.agents/skills/prism-quality-gate/SKILL.md` |
| Add or change an API endpoint | `.agents/skills/prism-api-endpoint/SKILL.md` |
| Change Prism catalog behavior or structure | `.agents/skills/prism-catalog-change/SKILL.md` |
| Extend design-comparison semantics | `.agents/skills/prism-comparison-change-kind/SKILL.md` |
| Rebuild the vendored ECAD viewer/parser | `.agents/skills/prism-viewer-rebuild/SKILL.md` |

## How work reaches a worker

Long-running operations use the job system. Start at
`backend/app/services/job_handlers.py`, which builds the worker registry;
catalog job kinds are delegated through the `HANDLERS` registry in
`backend/app/services/catalog_worker_tasks.py`. Jobs are claimed from PostgreSQL
with leases and fencing (`backend/app/services/job_service.py`,
`backend/app/services/job_runtime.py`) and executed by
`backend/app/prism_worker.py` or the catalog worker. The browser polls job
state.

The authenticated application has two main routes plus a catch-all, all in
`frontend/src/App.tsx`. The root route mounts
`frontend/src/components/workspace.tsx`; the project route mounts
`frontend/src/pages/ProjectDetailPage.tsx`, which lazy-loads feature tabs. Login
and the authentication callback are rendered before this router.

## Feature traces

These are trace anchors, not exhaustive call graphs. Touching a contract at one
hop usually requires checking its consumers and tests.

**Import a project from Git**
`backend/app/api/projects.py` · `backend/app/api/folders.py` →
`backend/app/services/project_import_service.py` (`run_project_analyze_job_v3`
then `run_project_import_job_v3`) → `backend/app/services/git_service.py` ·
`backend/app/services/git_access_service.py` → worker →
`frontend/src/components/import-dialog.tsx` →
`frontend/src/components/workspace.tsx`

**Compare two commits**
`backend/app/api/design_compare.py` →
`backend/app/services/design_compare_service.py` (`run_design_compare_job_v3`)
→ `backend/app/services/design_compare_nodes.py` (parse) →
`backend/app/services/design_compare_semantics.py` (grouping) →
`backend/app/services/design_compare_artifacts.py` →
`frontend/src/components/history-viewer.tsx` →
`frontend/src/components/design-comparison/design-comparison-workspace.tsx`

**Build a release**
`backend/app/api/release_studio.py` →
`backend/app/services/release_studio_service.py` →
`backend/app/services/release_studio_build_service.py`
(`run_release_studio_build_job`) → `backend/app/release_studio/pipeline.py` →
`backend/app/release_studio/steps.py` · `backend/app/release_studio/jobset.py`
→ `backend/app/release_studio/document_pipeline.py` ·
`backend/app/release_studio/documents/` →
`frontend/src/components/release-studio/ReleaseStudioPanel.tsx`

**Author and release a component**
`backend/app/api/catalog_admin.py` →
`backend/app/services/component_catalog_service.py` (runtime alias) →
`backend/app/services/component_catalog_service_postgres.py` and inherited
`backend/app/services/component_catalog_domain.py` behavior →
`backend/app/services/catalog_worker_tasks.py` (catalog worker) →
`frontend/src/components/workspace/library-component-workspace.tsx` ·
`frontend/src/components/workspace/library-release-queue.tsx`

**Comment on a project or comparison**
`backend/app/api/comments.py` →
`backend/app/services/comments_store_service.py` ·
`backend/app/services/comments_url_service.py` →
`frontend/src/components/comment-panel.tsx` →
`frontend/src/lib/comment-overlays.ts` (overlay shaping) →
`frontend/src/components/visualizer.tsx` (overlay attachment).
Live updates use `backend/app/services/comment_live_events.py` and
`backend/app/services/comment_live_broker.py`; revision binding history lives
in `backend/app/services/comment_anchor_bindings.py`. Read
`docs/architecture/live-comments.md` before changing those contracts.

**Publish a comment as a tracker issue**
`backend/app/services/trackers/promotion.py` →
`backend/app/services/trackers/op_store.py` →
`backend/app/services/trackers/jobs.py` →
`backend/app/services/trackers/provider_registry.py`. GitHub and GitLab issue
publication are available; Gitea/Forgejo is account-linking only. See
`docs/TRACKER_INTEGRATION.md` for credentials, destinations, and recovery.

**Select a design variant**
`backend/app/services/variant_catalog_service.py` →
`backend/app/services/semantic_index_variants.py` (index catalog and assembly block) →
`frontend/src/components/design-variants/variant-selection.ts` (URL owner and
resolution) →
`frontend/src/lib/design-variants.ts` (effective projection) →
`frontend/src/components/visualizer.tsx` ·
`frontend/src/components/engineering-bom-table.tsx` (viewer-side selection)

**Place a symbol from desktop KiCad**
`backend/app/api/remote_provider.py` · `backend/app/api/provider_oauth.py` →
`backend/app/services/provider_auth_service.py` →
`backend/app/services/component_catalog_domain.py` → `frontend/src/panel/`
(separate Vite build, `frontend/vite.config.panel.ts`)

## Hard rules

These are settled. Do not relitigate them in a PR.

### State hierarchy (frontend)

Source of truth, in order: **URL → server/query state → selection → local UI
state.** When a value already exists at a higher tier, derive it at the point of
use instead of mirroring it into `useState` and resynchronizing it with an
effect.

Effects remain appropriate for external or imperative lifecycles such as the
ECAD viewer, browser history, and timers. They may also initiate and cancel an
asynchronous request when no query abstraction owns that lifecycle; local state
may then hold that request's status and result, but must not mirror a loaded
record or prop that is already available. A reconciliation effect, such as
cross-domain selection re-anchoring, must name the triggering transition and
carry regression coverage. Keep dependency and cleanup contracts explicit. If
React Doctor needs a suppression, use the existing
`react-doctor-disable-next-line <rule> - <reason>` convention and explain the
invariant, not the tool workaround.

### Access control

- Never add a project lookup that ignores the caller's role.
  `backend/app/api/projects.py` carries an explicit warning: a role-blind helper
  is one import away from an access-control bypass. Use the role-aware function.
- Derive audit identity from the authenticated session, never from a
  request-supplied name.
- Never fail open. A limiter, auth, or provider outage denies the request;
  `backend/app/services/rate_limit_service.py` documents why.
- Never put exception detail in an error response. Database errors can carry
  credentials (`backend/app/api/health.py`).
- Never pin Git host keys with `accept-new`
  (`backend/app/services/project_import_service.py`).

### Scope

One purpose per change. Do not fold cleanup, refactoring, or drive-by fixes into
a behavior change — `CONTRIBUTING.md` requires separate branches, and mixing
them makes rollback during alpha stabilization unsafe. If you notice unrelated
work, report it; do not do it.

## Context hotspots

Do not treat these large modules as patterns for new work. Search by symbol and
load the relevant ranges rather than reading them end to end.

- `backend/app/services/component_catalog_domain.py` spans catalog workflow,
  imports, assets, validation, previews, and exports. Put new cohesive behavior
  behind a narrower service or helper when its boundary is clear.
- `frontend/src/components/workspace/library-component-workspace.tsx` combines
  component authoring, evidence, and release state. Prefer a sibling module for
  behavior that does not need its shared orchestration state.
- `frontend/src/components/design-comparison/comparison-presentation-shell.tsx`
  and `frontend/src/components/visualizer.tsx` coordinate imperative viewers.
  Extract pure shaping logic before splitting the orchestration blindly.
- New feature components belong in a feature directory, not loose at
  `frontend/src/components/`.

## Release and experimental boundaries

Release promotion requires reviewed `dev` to `main`, the main commit Quality
gate, and checked-in `docs/releases/<tag>.md`; see `docs/RELEASES.md`.
The next tag is `v4.0.0-alpha`, superseding the unpublished v3.1 plan.

`PRISM_PCB_GEOMETRY_BACKEND=legacy` is the supported default. Rust and
Python-copper require explicit experimental selection; never infer activation
from an installed helper or replace the published Python toolchain with a
sibling checkout. See `docs/PCB_RUST_GEOMETRY.md` and `docs/DEPENDENCIES.md`.

## Generated and vendored boundaries

Do not load minified bundles into context or edit them by hand when source is
available.

- `frontend/public/ecad-viewer.js`, `frontend/public/parser.worker.js`, and the
  parser under `scripts/vendor/` come from the sibling `ecad-viewer` checkout.
  Use `.agents/skills/prism-viewer-rebuild/SKILL.md`.
- `kicad-prism-viewer/` is Prism's semantic viewer source. Its build writes
  `kicad-prism-viewer/dist/prism-semantic-viewer.js` and synchronizes the served
  `frontend/public/prism-semantic-viewer.js` plus its digest cache key. CI fails
  when the tracked served files were not regenerated from current source.
- `frontend/public/three/` is a vendored module tree used through the import map
  in `frontend/index.html` and imports in `frontend/public/3d-viewer.js`. Do not
  classify files there as dead from first-party import search alone.
