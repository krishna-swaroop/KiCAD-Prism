# Catalog decomposition: status and handoff

Updated: 2026-09-16, Asia/Kolkata. Earlier versions of this file described the
program while it was in flight; that text is kept below under
[Historical program record](#historical-program-record-2026-08-31) and is not
current instruction.

## Current status

**The catalog decomposition program is complete and merged into `dev`.**
`backend/app/services/catalog/` is the implemented package (58 modules across
the foundation, persistence, domain-operation, and wiring layers described in
`backend/app/services/catalog/AGENTS.md`), not an empty marker. Do not restart
the PR sequence below; new catalog behaviour goes into that package, and the
architecture checker and characterization suites already gate it in CI.

Merged sequence (all into `dev`):

| Step | PR | Merged | Scope |
| --- | --- | --- | --- |
| PR 1 | #197 | 2026-09-01 | characterization gates, architecture ratchet, agent navigation, CI job |
| PR 2 | #211 | 2026-09-01 | runtime and PostgreSQL foundation |
| PR 3 | #213 | 2026-09-01 | revision kernel and component reads |
| PR 4 | #214 | 2026-09-01 | project and folder imports |
| PR 5 | #216 | 2026-09-01 | metadata and inventory workflows |
| PR 6 | #217 | 2026-09-01 | asset and preview services |
| PR 7 | #219 | 2026-09-01 | validation, release workflow, and health |
| PR 8 | #220 | 2026-09-02 | placement, provider tokens, signed URLs, DBL export |
| close-out | #221 | 2026-09-02 | remaining catalog logic moved out of the domain facade |

Follow-on work from the 2026-09 refactoring audit landed on the same package
and its consumers: #231 (availability from the default representation), #233
(collaborators constructed once per service instance), #234 (built-in
metadata descriptors), #235 (batched list hydration), #236 (inventory
aggregation), #238 (deterministic list tie-breaks), #239/#240 (component
workspace evidence panels and edit sessions), #254 (permanent job-failure
classification), and #269 (one workflow policy definition with a generated
frontend contract).

Current gate output on `dev` at the time of this update:

```text
Catalog architecture OK: 0 legacy-import violations, 15 private-use keys,
219 production modules checked, 16 grandfathered ceilings
```

`component_catalog_service.py` remains the stable composition root and
`component_catalog_domain.py` the compatibility facade under the waiver below.
Callers outside `backend/app/services/` use the facade; new behaviour lives in
the package. Dynamic `__getattr__`, mixins, and collaborators that depend back
on the facade remain prohibited.

## Durable checkpoint state

Retain until the compatibility facade is retired:

- `kicad_prism_catalog_checkpoint_ea95799` — durable behavioral checkpoint;
  **never drop or modify this database**
- ignored fixture directory `data/catalog-checkpoints/ea95799`
- database dump SHA-256:
  `abfb8378722f9e8729ad2512ad6e115d5a8f7c3fa6edcbc2f65b7b0e41235fa7`
- component ID: `f3fc82c9-2bc1-4d57-8c7d-b39edcca66ee`
- revision ID: `e69ed89e-be61-4e73-b3b5-abe98f2ce67d`
- manifest hash:
  `2026fddbaad92ceccbf967db444a893e3e2d9e05e1e6f27c5d23347d509fdc9c`

The disposable PR 1 databases (`kicad_prism_catalog_pr1_oracle_20260828`,
`kicad_prism_backend_pr1_20260828`) were to be dropped after that merge and are
not needed by anything current.

`Prism.sqlite` is not Prism's runtime database. PostgreSQL remains the catalog
source of truth. `Prism.sqlite` is a generated compatibility artifact inside the
KiCad Database Library export bundle, alongside the `.kicad_dbl` files.

## Historical program record (2026-08-31)

Everything below is the handoff as written on 2026-08-31, while PR 1 was still
pending on `refactor/catalog-characterization-gates-resume`. Branch names,
commit hashes, gate counts, and the "remaining program" list are historical;
every step in that list has since merged (see the table above). It is kept so
the pinned digests, verification record, and design constraints stay
inspectable.

### Objective

Implement the KiCAD Prism god-module decomposition program as sequential,
behavior-preserving pull requests. The primary agent owns architecture, review,
verification, commits, pushes, and pull requests.

### Repository and immutable reference

- Repository: `/Users/Swaroop/Personal-Projects/KiCAD-Platform/KiCAD-Prism`
- PR 1 resume branch: `refactor/catalog-characterization-gates-resume`
- PR 1 base: `origin/dev` at
  `2e841016263b3e8b9d3cc68c005a7c1e54ade6ea`
- Reference commit before decomposition:
  `2575dce chore(agent): harden navigation and generated-artifact contracts`
- Checkpoint PR: GitHub PR #192, merged into `dev` as
  `ea95799b19fd7d7d45723e2b7cdc60291982001a`.

### PR 1 contents

- `.github/workflows/dev-quality-gate.yml` — `catalog-architecture` job with
  event-correct base-ref selection
- `AGENTS.md` and `scripts/check_agent_docs.py` — catalog-change skill in the
  task table
- `.agents/skills/prism-catalog-change/SKILL.md` and Claude discovery shim
- `backend/app/services/catalog/` — empty package marker plus navigation
- `scripts/check_catalog_architecture.py` and
  `scripts/catalog_architecture_baseline.json`
- `backend/tests/test_catalog_architecture.py`
- `backend/tests/test_component_catalog_postgres_integration.py`
- this handoff

No existing production catalog implementation changed.

### PR 1 retained work

#### Contract characterization

`backend/tests/test_component_catalog_postgres_integration.py` extends the
existing PostgreSQL integration suite without increasing its test count (15
tests, zero skips). It covers component payload ordering, import results,
revision ordering, audit-chain validity, placement manifests, signed asset
URLs, inline bundles, metadata CSV, inventory CSV, KiCad DBL export, release
records, and concurrency behavior.

Field-aware `_normalize_contract` keeps a `path: tuple[str, ...]` and wipes only
`manifest_hash`. Asset `sha256` values and preview generator fingerprints are
retained. The focused round-trip test installs a deterministic preview renderer
so GitHub Actions (no `kicad-cli`) and local/Docker KiCad versions cannot move
the goldens. Preview evidence asserts status, content type, kind, fixture
fingerprint/version, backing-file digest, and normalized path shape.

Pinned payload digests:

- imported symbol:
  `f87747920ef3d3738bcfca4a863c33f0a082648918e2dbed490281bb163b1a96`
- imported footprint:
  `b4cf02c20db047eddfca50c222256738bc4637237d69ca8638f5069f4854aae3`
- released:
  `c858b4c019e64b9b346674489c07215d0b025f44cadff56492f4a410b9710603`

DBL export still excludes raw `Prism.sqlite` bytes, asserts the 12-column
schema, and queries the target row by manufacturer part number for the full
normalized 12-tuple. Signed URLs assert `https`, netloc `prism.example`, empty
fragment, and query keys exactly `{rev, representation, exp, sig}`.

#### Architecture ratchets

`scripts/check_catalog_architecture.py` is a standard-library AST checker. It:

- rejects imports from the new catalog package back into the three legacy
  catalog modules;
- inventories external calls to private catalog members, including intrafile
  factory returns, factory aliases, and `super()._private()` on catalog
  subclasses;
- enforces a monotonic private-call baseline;
- enforces a 1,200-line limit for new production modules;
- enforces a 500-line limit for catalog facades/orchestrators;
- grandfathered 16 existing oversized modules at their exact current lengths;
- supports safe baseline reductions/removals;
- compares the checked-in baseline with a trusted Git base ref.

Current resume-branch scan:

```text
Catalog architecture OK: 0 legacy-import violations, 80 private-use keys,
151 production modules checked, 16 grandfathered ceilings
```

`backend/app/services/service_client_service.py::_connect` is in the baseline
with count 7. Architecture unit tests: 17 passed.

#### Agent navigation

- Model-neutral `prism-catalog-change` skill and Claude discovery shim
- Skill listed in the root `AGENTS.md` task table
- `scripts/check_agent_docs.py` requires every canonical skill directory in
  that table
- Catalog package navigation and layering rules

```text
Agent guidance OK (247 paths, 5 model-neutral skill shims).
```

#### CI

The quality workflow has a `catalog-architecture` job running the checker,
agent-document validation, checker tests, and compilation. The job is included
in the aggregate `quality-gate` dependency and success checks.

Base-ref selection:

- pull request: `${{ github.event.pull_request.base.sha }}`
- push: `${{ github.event.before }}`
- all-zero push `before`, missing parent, or candidate equal to HEAD: try
  `HEAD^`, otherwise explicit bootstrap without `--base-ref`
- schedule/workflow_dispatch: `HEAD^` when available, otherwise bootstrap

### Current resume verification

- `git diff --check`
- Python compilation of backend application, tests, and scripts
- architecture unit suite: 17 tests passed
- architecture scan: 80 private-use keys, 151 production modules, 16 ceilings
- agent navigation: 247 checked paths, 5 model-neutral shims
- catalog PostgreSQL integration: 15 tests passed, zero skips
- focused contract rerun on a fresh disposable database retained identical
  payload and generated-file goldens
- complete backend suite: 1,082 tests passed with 4 existing conditional skips,
  using fresh disposable PostgreSQL databases and a same-filesystem ephemeral
  `PRISM_JOB_ARTIFACT_ROOT`
- earlier checkpoint upgrade smoke: restored the pre-refactor dump into another
  database and matched component payload, manifest, inline bundle, metadata CSV,
  five catalog files, and seven DBL files
- earlier fixed-dataset performance comparison: no material median regression

### Remaining catalog program (as planned on 2026-08-31; all merged since)

Each branch starts from `dev` after the preceding PR merges.

1. PR 2 — runtime and PostgreSQL foundation: explicit runtime, paths/caches,
   connection ownership, schema/projections/indexes/triggers/advisory locks, and
   explicit repository locking operations.
2. PR 3 — revision kernel and component reads: revision cloning/finalization,
   audit/manifests/inherited evidence, payload/list/search/history/usage/release
   reads.
3. PR 4 — project and folder imports: sessions, proposals, drafts, identity and
   asset resolution, acceptance/rejection, usage indexing, cleanup, retries,
   idempotency, and public replacement for maintenance-script private calls.
4. PR 5 — metadata and inventory: field definitions, grid preferences, batch
   operations, CSV, spreadsheet guards, column ordering, approval behavior.
5. PR 6 — assets and previews: file store, KiCad parsing, registration/linking,
   browse caching, preview generation, paths/hashes/fingerprints/concurrency.
6. PR 7 — validation and release: KLC, reports, release gates/transitions,
   deactivation, health, fail-closed and immutable evidence behavior.
7. PR 8 — provider, placement, and exports: bundles, materialization, OAuth
   codes/tokens/revocation, signed URLs, DBL export, compatibility facade, and
   removal of all in-repository private-method callers.

Target package layers remain foundation, persistence, domain operations, and an
explicit compatibility facade. `component_catalog_service.py` remains the
stable composition root/singleton. Dynamic `__getattr__`, mixins, circular
dependencies, or collaborators depending back on the facade are prohibited.

After Catalog PR 8, continue the planned waves for catalog API/UI, design
comparison, viewer UI, jobs/ingestion, Release Studio, fabrication/document
tooling, and finally mechanical migration-file separation.

## Approved compatibility-facade size exception

The completed decomposition retains `component_catalog_domain.py` as a 2,014
line compatibility facade for the alpha lifecycle. This is an explicit waiver
from the original 500-line facade/orchestrator target, not permission for a new
god module. The stable historical surface has 183 forwarding signatures, and
preserving them explicitly keeps runtime callers, tests, maintenance tooling,
and third-party integrations inspectable without the prohibited alternatives
of mixins or dynamic `__getattr__` delegation.

The exception has these hard bounds:

- the facade contains transaction and connection scopes plus explicit
  delegation, but no domain implementation;
- new catalog behavior must be implemented in `backend/app/services/catalog/`;
- the checked-in 2,014-line architecture ceiling may only shrink and must never
  increase;
- collaborators must not import or retain a reference to the facade; and
- after the alpha compatibility window, callers should migrate to supported
  narrow services so forwarding methods and their ceiling can be retired.

This exception does not relax the 500-line limit for any new catalog facade,
composition root, or orchestrator.
