---
title: Architecture
description: How Prism's services, storage, jobs, design data and viewers fit together, and where to read the code for each.
sidebar:
  order: 2
---

This page is the map you need before changing a service boundary, a job, a
storage path or a permission. It names the files to start from; the code and
the scoped `AGENTS.md` files next to it have the details.

## Services

Prism runs as five containers. The API and both workers are the same backend
image, which also carries KiCad's command-line tools and `prism-kicad`.

| Service | Runs | Responsible for |
| --- | --- | --- |
| `frontend` | Nginx with the React app | the web app, and the reverse proxy for everything else |
| `backend` | FastAPI under Uvicorn | requests, sign-in, permissions, the MCP server, Git over HTTPS |
| `prism-worker` | `python -m app.prism_worker` | imports, syncs, design data, comparisons, jobsets, release builds, tracker sync |
| `catalog-worker` | `python -m app.prism_worker --pool catalog` | catalog imports, checks, previews, releases and retention |
| `postgres` | PostgreSQL 17 | all collaboration and governance state |

The frontend is the only entry point users need. Nginx (`frontend/nginx.conf`)
forwards `/api/`, `/oauth/`, `/mcp`, `/git/`, `/remote-provider/` and the
`/.well-known/` discovery documents to the backend. A TLS proxy in production
points at the frontend, never at the backend.

The release bundle adds an optional Caddy proxy for HTTPS, started with the
`proxy` Compose profile.

## Storage

| Store | Holds | Code |
| --- | --- | --- |
| PostgreSQL | projects, folders, roles, sessions, tokens, comments, catalog, jobs, release records | `backend/app/services/postgres_database.py` |
| `data/projects` | Prism's Git clones, and `.kicad-prism/` with design bundles, job artifacts, catalog objects, comment attachments and exports | `KICAD_PROJECTS_ROOT` |
| `data/ssh` | Prism's Git SSH key and `known_hosts` | `backend/app/services/git_access_service.py` |

Job artifacts and catalog files share one content-addressed object store
under `.kicad-prism/artifacts/objects/sha256`
(`backend/app/services/object_store.py`). An object can be referenced by a job
and by the catalog at once, so the artifact clean-up and catalog retention
both check every owner before they remove a file.

### PostgreSQL schemas

| Schema | Holds |
| --- | --- |
| `workspace` | projects, folders, roles, sessions, service clients, tokens, tracker connectors, identities |
| `comments` | discussions, anchors and their history, tracker sync operations, attachment metadata |
| `catalog` | components, revisions, assets, validation and release data |
| `operations` | jobs, leases, logs, artifacts and runtime coordination |

Each schema changes only through its numbered migration ledger
(`backend/app/services/schema_ledger.py`). The backend brings every ledger to
its head at startup (`backend/app/services/schema_head.py`). A schema change is
a new numbered step in its ledger. Every step must be additive and safe on a
populated database: anything that removes or narrows waits for a later
release. See
[Upgrades](/KiCAD-Prism/admin/upgrades/) for what operators see.

Comment attachments are files in the projects directory, never in the project's
repository. SQLite files inside generated KiCad database libraries are
delivery artifacts, not Prism's database.

## Jobs

Anything slow is a job. A job kind is declared once, beside its handler, in
`backend/app/services/job_kinds.py`: which worker pool runs it, the resource
slots it holds, its lock, its attempts and priority, and an optional end hook.
`backend/app/services/job_handlers.py` registers the kinds.

- Workers claim jobs from PostgreSQL with leases, heartbeats and fencing
  (`backend/app/services/job_service.py`, `backend/app/services/job_runtime.py`).
- CPU-heavy kinds take their own slots (imports, comparisons, design bundles,
  jobsets, simulations, catalog KiCad work), each with its own concurrency
  setting.
- Memory-heavy kinds also reserve units of a shared `memory` slot, one unit
  per 256 MiB of their measured peak. The slot's size comes from the worker's
  memory limit (`backend/app/core/worker_memory.py`), so jobs that would
  together exceed it wait instead of being killed.
- When a job ends, its kind's end hook settles any rows the feature keeps
  beside the job, such as a release build attempt. The worker also sweeps once
  a minute for rows whose process died first.
- `/api/jobs/{id}` is authorized by what the job is about (its project, an
  import, the catalog), not by who queued it, because a second identical
  request joins the first job.

The browser follows a job only through `frontend/src/lib/jobs.ts`.

## Design data

Every feature reads a revision through its **design bundle**, never the KiCad
files directly. Prism's own Rust parser builds it.

1. `backend/app/services/design_bundle/jobs.py` queues a `design_bundle` job
   for a revision.
2. `backend/app/services/design_bundle/reuse.py` reuses an earlier bundle when
   the files it read have not changed, or builds a new one.
3. KiCad's tools upgrade older files and refill zones first
   (`backend/app/services/design_bundle/kicad_steps.py`).
4. `prism-kicad bundle build` writes the bundle in three stages, `parse`,
   `board` and `models`, rewriting the archive atomically after each.
5. Readers go through `backend/app/services/design_bundle/consumer.py`, which
   answers "pending" or "failed" when the bundle is not ready.

Bundles live in `.kicad-prism/bundles/<project>/<revision key>/`, one archive
per revision and generator, with an unpacked cache beside it that can always be
deleted. A paced background job
(`backend/app/services/design_bundle/backfill.py`) prepares the newest commits
of each branch and every tag. Bundles are a cache rebuilt from Git.

`native/` holds the Rust workspace: the KiCad parser, the bundle writer, the
comparison engine, the artwork and vendor-file generators and the WebAssembly
build the 3D viewer uses. Its contracts live in `native/contracts/`. Start at
`native/AGENTS.md`.

## Viewers

- **Schematic and PCB** render with the bundled ECAD viewer, from the source
  files in the revision's bundle. Prism adds selection identity, cross-probing,
  comment overlays and comparison presentation
  (`frontend/src/components/visualizer.tsx`).
- **3D** draws the board from geometry. The browser lowers the bundle's board
  pack with the WebAssembly build of `native/src/rs/prism-kicad-wasm` in a
  worker, and loads parts from a GLB that `kicad-cli` exported in the bundle's
  `models` stage (`backend/app/services/viewer_3d_bundle.py`,
  `kicad-prism-viewer/viewer/src/analytic-board.js`).

`kicad-prism-viewer/` is the semantic viewer's source. Its build refreshes the
served files in `frontend/public/`, and CI fails when they are stale.
`frontend/public/ecad-viewer.js` comes from the separate `ecad-viewer`
repository.

## Access control

- **One policy table.** `backend/app/core/policy.py` decides who may do what:
  each action names the roles allowed, the token scope it needs and whether a
  KiCad provider token may act. Routes ask it through the `require_*`
  dependencies; never compare roles inline. The frontend's role matrix is
  generated from it by `scripts/export_role_matrix.py`.
- **Errors.** Services raise typed errors that one handler renders as
  `{detail, code}` (`backend/app/core/errors.py`). Never put exception text in
  a response. Guarded writes take `If-Match` and answer 412 or 428
  (`backend/app/core/preconditions.py`).
- **Fail closed.** A rate limiter, auth or provider outage denies the request.

## Automation surfaces

The versioned HTTP API (`/api/v1`), personal access tokens, the MCP server and
webhooks all run in the backend and go through the same policy table and
folder visibility as the web app. Tokens can never perform a sign-off. See
[Automation overview](/KiCAD-Prism/automate/overview/).

## Trust boundaries

- The browser holds a signed, opaque session cookie after OIDC or password
  sign-in.
- Desktop KiCad uses its own OAuth flow (authorization code with PKCE) with the
  `remote_symbols.read` scope.
- Service clients and personal access tokens are scoped bearer tokens.
- Signed catalog asset URLs are short-lived bearer capabilities.
- The backend and workers clone repositories and run KiCad tools. Keep them,
  and PostgreSQL, off the public network.

## Feature traces

`AGENTS.md` in the repository root traces each main feature (import,
design data, 3D, comparison, release build and publish, catalog, comments,
trackers, variants, remote placement) from its API module to its frontend
component. Read the trace for the feature you are changing, and the scoped
`AGENTS.md` beside the code.

## Design records

The decisions behind the current architecture are recorded as ADRs in
`docs/architecture/`:

- [The Prism-native KiCad parser and the design bundle](https://github.com/krishna-swaroop/KiCAD-Prism/blob/dev/docs/architecture/adr-native-design-bundle.md),
  with its amendments in the same folder.
- [Scriptable Prism and the MCP server](https://github.com/krishna-swaroop/KiCAD-Prism/blob/dev/docs/architecture/adr-scripting-and-mcp.md).
- [Live comment transport and revision anchors](https://github.com/krishna-swaroop/KiCAD-Prism/blob/dev/docs/architecture/live-comments.md).
- [Addressing Prism](https://github.com/krishna-swaroop/KiCAD-Prism/blob/dev/docs/architecture/addressing.md):
  the project URL and `prism://` resource grammars.
