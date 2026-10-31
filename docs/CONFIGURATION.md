# Configuration

Prism has two Compose entry points:

- a stable release bundle reads its bundle-local `.env`;
- a source build reads the repository-root `.env`.

In both cases, start from the adjacent `.env.example`. Keep deployed values in a
secret store or host-local file and never commit them.

Both Compose files pass every variable in that file to the backend and worker
containers; a setting does not need its own line in the Compose file. The file
is `.env` unless `PRISM_ENV_FILE` names another one. `--env-file` on its own
only fills the `${...}` placeholders in the Compose file, so when the
environment file is not `.env`, set both:

```bash
PRISM_ENV_FILE=prod.env docker compose --env-file prod.env -f docker-compose.yml up -d
```

Release bundles contain exact `PRISM_BACKEND_IMAGE` and
`PRISM_FRONTEND_IMAGE` digests. Preserve those values when configuring a release.
Source builds use Docker build arguments instead.

## Core groups

### Identity and browser access

| Setting | Purpose |
| --- | --- |
| `WORKSPACE_NAME` | name shown on the login page |
| `AUTH_ENABLED` | explicit authentication switch |
| `DEV_GUEST_ROLE` | role used only when authentication is disabled |
| `OIDC_*` | OIDC issuer, client, claims, scopes, and provider label |
| `PASSWORD_AUTH_ENABLED` | local email/password login (off by default) |
| `PASSWORD_MIN_LENGTH` | minimum local password length (default 12) |
| `SESSION_REMEMBER_ME_DAYS` | remember-me session lifetime |
| `BOOTSTRAP_ADMIN_PASSWORD` | one-time seed for bootstrap admins; clear after first login |
| `SESSION_SECRET` | signs session and provider tokens |
| `SESSION_TTL_HOURS` | absolute session lifetime |
| `SESSION_IDLE_TIMEOUT_MINUTES` | optional idle revocation |
| `PRISM_PAT_MAX_DAYS` | longest personal access token lifetime in days (default 365); a create request defaults to 90 |
| `PUBLIC_BASE_URL` | canonical public HTTPS origin |
| `CORS_ORIGINS_STR` | exact browser origins permitted to send credentials |
| `BOOTSTRAP_ADMIN_USERS_STR` | initial administrator emails |
| `DEFAULT_VIEWER_DOMAINS_STR` | optional implicit viewer domains |

`AUTH_ENABLED=true` fails closed if no login method is complete (OIDC or
password auth), or if required secret or database settings are incomplete.

### Database and workers

| Setting | Purpose |
| --- | --- |
| `PRISM_DATABASE_URL` | authoritative PostgreSQL connection URL |
| `PRISM_DATABASE_POOL_*` | connection pool bounds per process |
| `UVICORN_WORKERS` | API worker processes |
| `PRISM_AUTO_SYNC_INTERVAL_SECONDS` | background remote fetch interval; 300 seconds by default, 0 disables it |
| `PRISM_WORKER_CONCURRENCY` | general queued-job concurrency |
| `PRISM_WORKER_MEMORY_BUDGET_MIB` | memory the prism worker admits heavy jobs against, in MiB. Bundle builds, design comparisons, Release Studio builds, jobsets and simulations reserve their measured peak in 256 MiB units, and a job that would exceed the budget waits. Default: half the container's (or machine's) memory, clamped to 4–8 GiB. It must fit the heaviest kind (Release Studio, 3.25 GiB), or the worker refuses to start |
| `CATALOG_WORKER_CONCURRENCY` | catalog queued-job concurrency |
| `PRISM_*_CONCURRENCY` | fenced slots for heavy job classes |
| `PRISM_JOB_*` | leases, heartbeat, cancellation, and artifact retention |

Both Compose files start PostgreSQL with `shared_preload_libraries=pg_stat_statements` and `pg_stat_statements.track=top` so the ops `get_slow_queries` diagnostic can report normalised statement timings; a managed instance must set the same or that tool answers `available: false`.

Database capacity must cover all API and worker pools, not only one process.

### Git import

| Setting | Purpose |
| --- | --- |
| `GITHUB_TOKEN` | optional private GitHub HTTPS credential for clone **and** Release publish (`contents:write`) |
| `GITLAB_TOKEN` | optional private GitLab HTTPS credential for clone **and** Release publish (`api` scope) |
| `PRISM_FORGE_HOSTS` | exact self-hosted GitLab registry; legacy `host=gitlab` pairs or structured JSON with per-host API roots and token environment-variable names; see [Forge host configuration](FORGE_HOSTS.md) |
| `IMPORT_ALLOWED_HOSTS_STR` | comma-separated Git host allowlist |
| `IMPORT_ALLOW_INSECURE_HTTP` | permits plaintext HTTP remotes when explicitly required |
| `GIT_SCAN_KNOWN_HOSTS_ON_STARTUP` | optional host-key discovery during startup |
| `PRISM_GIT_FETCH_TIMEOUT_SECONDS` | hard timeout for one project fetch (default 300) |

Prism rejects `file://`, local paths, embedded URL credentials, and Git remote
helper transports regardless of allowlist settings.

### Catalog and Remote Symbol Provider

Catalog settings control artifact roots, import limits, KLC validation, release
gating, DBL export, worker concurrency, and retention. Artifact maintenance moves
a superseded never-released draft STEP file to quarantine and deletes it after
`CATALOG_DRAFT_MODEL_QUARANTINE_DAYS` (default `30`; `0` deletes it in the same
run); see [Catalog metadata exists but placement fails](OPERATIONS.md#catalog-metadata-exists-but-placement-fails). Provider settings control
the OAuth client ID, token lifetimes, library prefix, project destination
directory, and whether placed 3D models are embedded in the footprint
(`REMOTE_PROVIDER_EMBED_3D_MODELS`, default `true`) and how much compressed
model data one footprint may embed (`REMOTE_PROVIDER_EMBED_MAX_COMPRESSED_BYTES`,
default `16777216`, 16 MiB); see [3D models](REMOTE_SYMBOL_PROVIDER.md#3d-models).

In Compose environment files, preserve the KiCad project variable with:

```env
REMOTE_PROVIDER_DESTINATION_DIR=$${KIPRJMOD}/RemoteLibrary
```

The doubled dollar sign prevents Compose from expanding the value before it
reaches Prism.

### Docker and KiCad runtime

Release-bundle users do not select a KiCad base image; it is already embedded in
the tested backend image. The generated environment pins:

```env
PRISM_BACKEND_IMAGE=ghcr.io/krishna-swaroop/kicad-prism-backend@sha256:<digest>
PRISM_FRONTEND_IMAGE=ghcr.io/krishna-swaroop/kicad-prism-frontend@sha256:<digest>
```

Do not replace these with `latest`.

Source builds use:

```env
KICAD_BASE_PLATFORM=linux/amd64
DOCKER_PLATFORM=linux/amd64
```

The repository default pins `KICAD_BASE_IMAGE` in `backend/Dockerfile` to the
selected stable KiCad AMD64 manifest digest. Compose does not duplicate that
default; override at build time with
`docker compose build --build-arg KICAD_BASE_IMAGE=...`. The public
source-build and release targets are Linux AMD64.

Prism finds its KiCad tools the same way for every job (release builds,
jobsets, catalog previews, board statistics, thumbnails, fabrication
comparison, design bundle stages). The image already has them on `PATH`; set
these only for a host run or a pinned install:

```env
# kicad-cli. Empty: PATH, then the usual KiCad install locations.
# A set path is used as given, with no fallback. KICAD_CLI is a legacy name.
KICAD_CLI_PATH=
```

Each kicad-cli run gets its own temporary directory (KiCad's instance lock)
and a timeout set by the job that runs it.

### Design pipelines and build identity

These have working defaults; set them only to relocate storage or tune a
constrained host. Unless noted, an empty value means the default.

| Setting | Purpose |
| --- | --- |
| `KICAD_PROJECTS_ROOT` | root for imported projects and `.kicad-prism` state; Compose sets `/app/projects` |
| `PRISM_JOB_ARTIFACT_RETENTION_DAYS` | days job artifact metadata is kept (default 30) |
| `PRISM_JOB_RETENTION_DAYS` | days finished jobs, their events and log folders are kept, unless an artifact or a release build still points at them, or they are the newest of their kind and key (default 90) |
| `PRISM_ROUTINE_JOB_RETENTION_DAYS` | the same for tracker polls and sweeps, and background fetches (default 7) |
| `PRISM_JOB_PARTIAL_RETENTION_HOURS` | hours unfinished job artifacts are kept (default 24) |
| `PRISM_DESIGN_COMPARE_CACHE` | revision snapshot cache (default under the system temporary directory) |
| `PRISM_DESIGN_COMPARE_JOBS` | design-compare scratch root (default under the system temporary directory) |
| `PRISM_DESIGN_COMPARE_CACHE_MAX_BYTES` | revision cache cap, least recently used evicted first; 0 disables (default 20 GiB) |
| `PRISM_DESIGN_COMPARE_CACHE_MIN_AGE` | seconds a cache entry is protected after use (default 900) |
| `PRISM_DESIGN_COMPARE_STALE_SECONDS` | seconds without progress before an in-process compare is stale (default 300) |
| `PRISM_DESIGN_COMPARE_MAX_REVISION_WORKERS` | revisions built at once, at most 2 (default 2) |
| `PRISM_DESIGN_COMPARE_MAX_INITIAL_WORKERS` | schematic-stage workers, at most 2; unset follows `MAX_REVISION_WORKERS` |
| `PRISM_DESIGN_COMPARE_MAX_PCB_WORKERS` | PCB-stage workers, at most 2; unset follows `MAX_REVISION_WORKERS` |
| `PRISM_DESIGN_COMPARE_REVISION_PROCESSES` | `false` compiles both revisions in one process (default `true`) |
| `PRISM_PLUGIN_DOWNLOAD_URL` | where the KiCad plugin update prompt points; set it for a private plugin build |
| `PRISM_CAIRO_LIBRARY_DIR` | macOS hosts only: directory holding `libcairo.2.dylib` for Release Studio PDFs |
| `PRISM_RELEASE`, `PRISM_REVISION`, `PRISM_BUILD_DATE` | build identity reported by `/api/health/live`; release images set them |

### Design bundles

A design bundle is one parse of a project revision by `prism-kicad`, stored as
`KICAD_PROJECTS_ROOT/.kicad-prism/bundles/<project>/<revision key>/<generator digest>.prism`
([ADR](architecture/adr-native-design-bundle.md)). The `design_bundle` job
builds it in stages (parse, board, models) on the general worker. Every
consumer — Release Studio, the semantic index, variants, project metadata and
viewer sources, catalog import, the 3D tab, design comparison and Simulation
Studio — reads the bundle unconditionally (ADR §9.7 R1, amendment C3 F4c). A
consumer that finds no ready bundle queues one and answers *pending* (HTTP 202
with `Retry-After`); a failed build answers *failed* (HTTP 422) until it is
retried.

| Setting | Purpose |
| --- | --- |
| `PRISM_DESIGN_BUNDLE_AUTO_BUILD` | queue the HEAD bundle after every import and sync, and run the paced prebuild of each branch's newest commits and every tagged commit (ADR amendment K2 §7). Default `true` since the C2r switch; `false` builds bundles on demand only, and a comparison of a commit without one reads its source tree, the cold path |
| `PRISM_DESIGN_BUNDLE_CONCURRENCY` | bundle builds at once (default 1, at most 8); the prebuild fills every free slot. Each build also holds one `PRISM_SEMANTIC_COMPILE_SLOTS` slot, one `PRISM_WORKER_CONCURRENCY` slot and 2.25 GiB of `PRISM_WORKER_MEMORY_BUDGET_MIB`, and a build waits until all are free. Raise `PRISM_DESIGN_BUNDLE_MEMORY_BUDGET_BYTES` with it: 2 builds need 14.5 GiB with the default stage caps |
| `PRISM_DESIGN_BUNDLE_*_MEMORY_BYTES`, `_*_TIMEOUT_MS` (PARSE, BOARD, MODELS) | per-stage heap cap and wall timeout passed to `prism-kicad` (defaults 4/6/2 GiB, 300/600/120 s) |
| `PRISM_DESIGN_BUNDLE_VERIFY_TIMEOUT_MS` | `prism-kicad bundle verify` when an archive is stored (default 300 s) |
| `PRISM_DESIGN_BUNDLE_MEMORY_BUDGET_BYTES` | worker memory for the slot; startup refuses `CONCURRENCY x (largest cap + 1.25 GiB)` above it (default 8 GiB) |
| `PRISM_DESIGN_BUNDLE_THREADS`, `PRISM_DESIGN_BUNDLE_MAX_ATTEMPTS` | `prism-kicad --threads` (default 4); attempts per job before a failing KiCad step ends it (default 3) |
| `PRISM_DESIGN_BUNDLE_FAILED_RETRY_SECONDS` | how long a bundle whose job ended failed stays failed before a status read queues it again (default 3600); `0` leaves retries to Generate and Regenerate. The 3D tab shows the failure instead of waiting |
| `PRISM_DESIGN_BUNDLE_RETENTION_DAYS` | days an unused bundle or alias is kept; the prebuild's commits (branch heads, each branch's newest commits, tags), released Release Studio commits and every bundle an alias points to are always kept (default 30) |
| `PRISM_DESIGN_BUNDLE_BACKFILL_INTERVAL_SECONDS` | seconds between prebuild ticks; 0 disables (default 60). A tick aliases what it can and queues builds into the free `design_bundle` slots: every project's HEAD first, then older commits one project at a time. A full slot keys nothing it could not queue |
| `PRISM_DESIGN_BUNDLE_PREBUILD_COMMITS` | how many of each branch's newest commits (first parent) the background prebuild keeps bundles for, besides every tagged commit; 0 prebuilds branch heads and tags only (default 10) |
| `PRISM_DESIGN_BUNDLE_REUSE_CANDIDATES` | how many stored bundles a new revision is checked against with `prism-kicad bundle reuse` before it is built; 0 disables reuse (default 3) |
| `PRISM_DESIGN_BUNDLE_CACHE_GRACE_SECONDS` | how long an unpacked-cache version must be untouched before retention may remove it, so a slow reader keeps its files (default 3600) |
| `PRISM_DESIGN_BUNDLE_CACHE_IDLE_DAYS` | drop an archive's unpacked caches after this many days without a read, while the archive stays; 0 keeps them as long as the archive (default 7) |
| `PRISM_DESIGN_BUNDLE_CACHE_MAX_BYTES`, `PRISM_DESIGN_BUNDLE_CACHE_PROJECT_MAX_BYTES` | unpacked-cache caps for the whole store and per project; least recently used versions go first; 0 disables a cap (defaults 4 GiB and 1 GiB). Archives are never evicted by these caps |
| `PRISM_DESIGN_BUNDLE_GLB_TIMEOUT_SECONDS`, `PRISM_DESIGN_BUNDLE_UPGRADE_TIMEOUT_SECONDS` | the component GLB export and each source upgrade (defaults 600 and 900 s) |
| `PRISM_DESIGN_BUNDLE_UPGRADE_WORKERS` | KiCad upgrades of one older source set run at once, each file in its own scratch directory (default 8) |
| `PRISM_KICAD_PYTHON`, `PRISM_ZONE_REFILL_TIMEOUT_SECONDS` | KiCad's Python (imports `pcbnew`) for the zone refill and board upgrades (unset: found next to `kicad-cli` on Windows and macOS, `/usr/bin/python3` on Linux), and the refill's timeout (default 900 s) |
| `PRISM_DESIGN_BUNDLE_CLI_PATH`, `PRISM_DESIGN_BUNDLE_ROOT`, `PRISM_DESIGN_BUNDLE_SCHEMA_DIR` | host overrides for the binary (default `prism-kicad` on PATH), the store and the committed JSON Schema |
| `GEOMETER_EXECUTABLE`, `PRISM_ARTWORK_CONFIG_DIR` | the pinned Geometer runtime the `models` stage runs for the parts' hidden-line views (the image sets it; empty leaves that member out), and the `prism-kicad artwork` configurations (default: from the checkout or the image) |

A project's `zone_fills` setting, stored in Prism (`"saved"` or unset), builds
the board stage from the board's saved zone fills instead of a pcbnew refill.
It is part of the revision key, so changing it rebuilds the project's bundles.

### Live comments and issue trackers

`PRISM_COMMENT_LIVE_ENABLED=true` enables live comment delivery; set it to
`false` to use the HTTP refresh fallback. Set the public origin correctly in
`PUBLIC_BASE_URL` and `CORS_ORIGINS_STR` for authenticated WebSockets.

Issue publication is opt-in through an administrator-configured code host and
project destination. It requires the tracker credential root key on both API
and general workers. See [Tracker integration](TRACKER_INTEGRATION.md) for
`TRACKER_CREDENTIAL_ROOT_KEY*`, rotation, webhooks, and recovery.

### Supply chain data

Distributor connector credentials are encrypted with the tracker credential
root key (`TRACKER_CREDENTIAL_ROOT_KEY`); without it, connectors that need
credentials cannot be saved. `SUPPLY_ENABLE_SIMULATED_PROVIDER=true` allows a
simulated distributor for development and demos. Leave it unset in production.

Distributor calls ignore the `HTTPS_PROXY` environment variables on purpose.
Behind a corporate proxy, set `SUPPLY_HTTPS_PROXY` (for example
`http://proxy.example.com:3128`). The proxy then resolves host names, so Prism
still checks each host against the provider's allowlist but cannot check the
addresses itself.

An inventory server on your own network (a self-hosted InvenTree or a server that serves its API) needs
its host name in `SUPPLY_INVENTORY_PRIVATE_HOSTS_STR`; only listed hosts may
resolve to private addresses or use a port other than 443, and link-local addresses stay refused.

### MCP server

Connecting clients and what they can do: [Automating Prism](AUTOMATING_PRISM.md).

`PRISM_MCP_ENABLED` is `false` by default. While false, the MCP
server at `/mcp` and its OAuth metadata
(`/.well-known/oauth-protected-resource`,
`/.well-known/oauth-authorization-server/oauth/mcp`) answer 404. Set it to
`true` to let agents connect with a personal access token or an OAuth client.
Every tool runs through the caller's `/api/v1` routes, so their role, scopes and
folder visibility decide what they see and do.

`PRISM_MCP_OPS_ENABLED` is `false` by default. Set it to `true` to turn on admin
diagnostics: the `/api/ops` routes, the ops MCP tools, and the `ops:read` and
`ops:act` scopes. Only admins can hold or grant those scopes. The tools are
listed in [Automating Prism](AUTOMATING_PRISM.md#ops-diagnostics). Request rows
(`ws_ops_requests`) are kept 3 days, route and counter statistics 7 days, and
captured profiles 7 days.
`PUBLIC_BASE_URL` should name the deployment's public origin: it is the allowed
`Origin`, the source of every result's link, and the OAuth resource.

Administrators control what MCP clients may reach in Settings → MCP: a project
scope (all visible projects or a list) and one switch per tool. A `tools/call`
outside that policy is refused. Every call is audited in `ws_mcp_audit`;
`PRISM_MCP_AUDIT_RETENTION_DAYS` is how many days of rows are kept (default
365), and startup deletes older ones. `GET /api/admin/mcp-audit` reads them.

## Retrying writes safely

A client that retries a write can send an `Idempotency-Key` header (1-255
printable ASCII characters) on any `POST`, `PUT`, `PATCH` or `DELETE` under
`/api/`. Prism keeps the first response for 24 hours, scoped to the caller and
operation, and returns it again with `Idempotent-Replayed: true` instead of
running the write twice.

- The same key with a different body answers `422` `idempotency-key-reused`.
- A retry that arrives while the first request is still running answers `409`
  `idempotency-key-in-progress`.
- An invalid key answers `400` `idempotency-key-invalid`.
- A request whose body exceeds 1 MiB is not covered: it passes through and
  carries `Idempotency-Key-Status: skipped-large-body`.
- A `5xx` response is not stored, so the retry runs the write again.

Keys live in the workspace database (`ws_idempotency_keys`) and are swept after
24 hours.

### Event log

`GET /api/v1/events?after=<cursor>` replays the append-only event log (revision
synced, bundle built or failed, job progress and completion, comparison done,
comment changed, release candidate built or approved). `PRISM_EVENT_RETENTION_DAYS`
is how many days of events are kept (default 30); startup deletes older rows.

### Outbound webhooks

Administrators register signed HTTPS endpoints in Settings or through
`/api/settings/webhooks`; each receives the events its kinds and projects admit,
signed with Standard Webhooks (`webhook-id`, `webhook-timestamp`,
`webhook-signature`). Delivery retries with a 30-second doubling backoff up to one
hour, and an endpoint that has failed for 24 hours is marked `failing` until an
administrator re-enables it. The signing secret is encrypted with
`TRACKER_CREDENTIAL_ROOT_KEY` and is shown once, at create or rotate.

| Setting | Purpose |
| --- | --- |
| Outbound webhooks (`/api/settings/webhooks`) | one signed HTTP `POST` per new event, in log order, with retries and a 30-day delivery history |
| `PRISM_WEBHOOK_ALLOW_PRIVATE` | permits `http` and private, loopback or link-local targets for a local test receiver (default `false`; production endpoints must be `https` on a public address) |

## Project-level `.prism.json`

Place `.prism.json` in a KiCad project root when auto-detection does not find the
desired files or when the project needs a friendly name.

Example:

```json
{
  "project_name": "Power Distribution Unit",
  "description": "Primary and protected power distribution",
  "schematic": "hardware/pdu.kicad_sch",
  "pcb": "hardware/pdu.kicad_pcb",
  "documentation": "docs",
  "designOutputs": "build/design",
  "manufacturingOutputs": "build/fabrication",
  "thumbnail": "assets/thumbnail",
  "readme": "README.md",
  "jobset": "Outputs.kicad_jobset"
}
```

For compatibility, path fields can also be nested under a `paths` object.
Top-level fields take part in the same resolution.

Supported path fields:

- `schematic`
- `pcb`
- `subsheets`
- `designOutputs`
- `manufacturingOutputs`
- `documentation`
- `thumbnail`
- `readme`
- `jobset`

### Settings edited in Prism

Settings changed in Prism's project properties (paths, display name,
description) are stored in the workspace database, not written into the
checkout. Prism's checkout is a read-only mirror of the remote; a file written
into it would block every later Sync fast-forward. To share settings with the
team, commit them to `.prism.json` in the repository.

Resolution order, highest first:

1. Settings stored in Prism for the project.
2. The `.prism.json` in the checkout (`projects.<project file>` over the shared
   block).
3. Auto-detection.
4. Conventional fallbacks.

Paths are relative to the registered project root. A past revision is read with
that revision's committed `.prism.json`; design bundles also apply the stored
settings at past revisions, and attribute a board or schematic to a project only
through its project file (a glob matches only the file named like it), never by
directory. The backfill flags projects whose board or schematic no longer
resolves that way; set their paths explicitly.

The schema currently accepts `workflows`, `portfolio`, and additional fields for
forward compatibility. Arbitrary `workflows` entries are not executed as
first-class custom workflows in this alpha; the product currently exposes its
fixed workflow types.

## Safe change procedure

1. Back up the current `.env`.
2. Compare it with the new `.env.example`.
3. Preserve the new release image digests.
4. Change one setting group at a time.
5. Render Compose before restart.

For a release bundle:

```bash
docker compose --env-file .env -f compose.yml config --quiet
```

For a source build:

```bash
docker compose --env-file .env -f docker-compose.yml config --quiet
```

6. Restart and inspect backend and worker logs.
7. Verify authentication and one representative project operation.

Changing `SESSION_SECRET` revokes sessions and invalidates signed provider
tokens. Changing database or artifact roots without moving their data creates an
apparently empty installation.
