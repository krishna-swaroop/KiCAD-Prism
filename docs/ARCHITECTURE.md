# Architecture

KiCAD Prism is a five-service Docker Compose application with two persistent
storage domains.

## Runtime services

| Service | Responsibility |
| --- | --- |
| `frontend` | Nginx-served React application and reverse proxy |
| `backend` | FastAPI requests, authentication, authorization, and metadata APIs |
| `prism-worker` | project import, synchronization, comparison, visualization, and jobset work |
| `catalog-worker` | catalog import, validation, preview, release, and retention work |
| `postgres` | authoritative workspace, comments, catalog, operations, and session state |

The frontend is the normal external entry point. It proxies API, OAuth, provider
metadata, and Remote Symbol Provider panel requests to the backend. A production
TLS proxy should route to the frontend instead of exposing the backend directly.

## Persistent data

The default Compose stack persists:

- PostgreSQL in the `prism-postgres-data` named volume;
- imported repositories and generated artifacts under `./data/projects`;
- the Prism-managed Git SSH key and `known_hosts` under `./data/ssh`.

Within `data/projects/.kicad-prism`, Prism stores generated comparison and
visualizer caches, job artifacts and logs, catalog asset objects, revisions,
previews, KLC evidence, and DBL exports.

All three persistence domains must be included in backup and restore procedures.
See [Operations](OPERATIONS.md).

## PostgreSQL schemas

The application separates concerns into PostgreSQL schemas:

- `workspace`: projects, folders, roles, sessions, and service clients;
- `comments`: project and comparison discussions;
- `catalog`: component metadata, revisions, assets, validation, and release data;
- `operations`: jobs, leases, logs, artifacts, and runtime coordination.

SQLite files may still appear inside generated KiCad DBL exports. Those are
delivery artifacts, not Prism's runtime database.

## Job execution

User-triggered work is recorded in PostgreSQL and claimed by workers using
leases, heartbeats, and fencing. The API returns job identifiers; the browser
polls job state and logs. Completed outputs are published into immutable job
artifact locations and surfaced through the Assets portal.

CPU-heavy job classes have separate concurrency settings so imports, design
comparison, WebGPU generation, and jobsets do not consume unbounded resources.

## Project ingestion

Prism validates remote URLs before invoking Git. Analyze and import jobs discover
KiCad projects, support monorepos, preserve the selected branch, and register
project paths without turning Prism into the source repository.

The imported checkout is server-managed. Engineers should continue to edit and
push from their normal development clones.

## Viewer architecture

Schematic and PCB content is rendered through the bundled ECAD viewer. Prism
adds semantic selection identity, cross-probe state, comment overlays, and
comparison presentation. 3D output uses generated WebGPU-friendly assets.

Generated viewer artifacts are caches and can be rebuilt, but rebuilding may be
expensive. Include them in routine backups when recovery time matters.

## Trust boundaries

- The browser receives a signed, opaque session cookie after OIDC login.
- KiCad Remote Symbol Provider access uses a separate OAuth2 authorization-code
  and PKCE flow with `remote_symbols.read`.
- Service clients use scoped bearer tokens and should be stored in a secret
  manager.
- Signed catalog asset URLs are time-limited bearer capabilities.
- The backend and workers can clone Git repositories and invoke KiCad tooling;
  keep them on a trusted network and do not expose their ports publicly.

See [Authentication and access](AUTHENTICATION_AND_ACCESS.md) and the
[Security policy](../SECURITY.md).
