# Configuration

Prism has two Compose entry points:

- a stable release bundle reads its bundle-local `.env`;
- a source build reads the repository-root `.env`.

In both cases, start from the adjacent `.env.example`. Keep deployed values in a
secret store or host-local file and never commit them.

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
| `CATALOG_WORKER_CONCURRENCY` | catalog queued-job concurrency |
| `PRISM_*_CONCURRENCY` | fenced slots for heavy job classes |
| `PRISM_JOB_*` | leases, heartbeat, cancellation, and artifact retention |

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

Prism rejects `file://`, local paths, embedded URL credentials, and Git remote
helper transports regardless of allowlist settings.

### Catalog and Remote Symbol Provider

Catalog settings control artifact roots, import limits, KLC validation, release
gating, DBL export, worker concurrency, and retention. Provider settings control
the OAuth client ID, token lifetimes, library prefix, and project destination
directory.

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

### Experimental PCB geometry

`PRISM_PCB_GEOMETRY_BACKEND=legacy` is the normal release and source default.
The image containing a Rust helper does not activate it. Select `rust` only
for a deliberate experiment; `python-copper` is also experimental. Rust rejects
missing helpers, identity mismatches, unsupported geometry, and helper errors
instead of silently falling back. Set `PRISM_KICAD_NATIVE_TIMEOUT_SECONDS` to
bound helper execution (default 300 seconds).

Rollback by setting the backend to `legacy` and recreating the API and general
worker containers so they receive the new environment. Direct host experiments
should also unset the old `PRISM_COPPER_EMIT_ENABLED` compatibility switch.
See [Rust geometry](PCB_RUST_GEOMETRY.md) for build identity and coverage limits.

### Live comments and issue trackers

`PRISM_COMMENT_LIVE_ENABLED=true` enables live comment delivery; set it to
`false` to use the HTTP refresh fallback. Set the public origin correctly in
`PUBLIC_BASE_URL` and `CORS_ORIGINS_STR` for authenticated WebSockets.

Issue publication is opt-in through an administrator-configured code host and
project destination. It requires the tracker credential root key on both API
and general workers. See [Tracker integration](TRACKER_INTEGRATION.md) for
`TRACKER_CREDENTIAL_ROOT_KEY*`, rotation, webhooks, and recovery.

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

Resolution order is explicit `.prism.json`, auto-detection, then conventional
fallbacks. Paths are relative to the registered project root.

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
