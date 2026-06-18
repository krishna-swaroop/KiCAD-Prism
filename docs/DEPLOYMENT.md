# Deployment Guide

This document covers the current KiCAD Prism deployment model for Docker hosting and local development.

## Runtime Overview

KiCAD Prism runs as two services:

- `backend`: FastAPI API server on port `8000`
- `frontend`: production Vite bundle served by Nginx on port `8080`

In Docker, the frontend proxies `/api/*`, `/oauth/*`, `/.well-known/kicad-remote-provider`, and `/remote-provider/*` requests to the backend over the Compose network. The backend stores component metadata, release workflow state, KiCad OAuth state, and local service-client metadata in SQLite under the mounted project data directory. KiCad symbol, footprint, 3D model, SPICE, preview, DBL export, and revision files are stored on disk under the same project data directory.

Default local endpoints:
- UI: [http://127.0.0.1:8080](http://127.0.0.1:8080)
- API: [http://127.0.0.1:8000](http://127.0.0.1:8000)

## Docker Hosting

### Prerequisites

- Docker Engine or Docker Desktop
- Docker Compose support
- enough disk space for imported repositories and generated outputs

### 1. Clone the repository

```bash
git clone https://github.com/krishna-swaroop/KiCAD-Prism.git
cd KiCAD-Prism
```

### 2. Create the root `.env`

Docker Compose reads the repository root `.env` automatically.

```bash
cp .env.example .env
```

Baseline authenticated configuration:

```env
WORKSPACE_NAME=KiCAD Prism
AUTH_ENABLED=true
OIDC_ISSUER_URL=https://sso.example.com/realms/engineering
OIDC_CLIENT_ID=kicad-prism
OIDC_CLIENT_SECRET=
SESSION_SECRET=
SESSION_TTL_HOURS=12
SESSION_COOKIE_SECURE=false
ALLOWED_USERS_STR=
ALLOWED_DOMAINS_STR=
BOOTSTRAP_ADMIN_USERS_STR=admin@example.com
DEFAULT_VIEWER_DOMAINS_STR=
GITHUB_TOKEN=
DEV_MODE=false
CATALOG_SQLITE_PATH=
CATALOG_DBL_EXPORT_DIR=
CATALOG_KLC_ENABLED=false
CATALOG_KLC_RELEASE_GATE=warn
```

Generate a session secret with:

```bash
python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(48))
PY
```

Important:
- `SESSION_SECRET` is required whenever auth is effectively enabled.
- `DEFAULT_VIEWER_DOMAINS_STR` can stay empty. Set it only if every user from one or more trusted email domains should get implicit viewer access.
- `CATALOG_SQLITE_PATH` can stay empty for the bundled Compose stack. Docker defaults to `/app/projects/.kicad-prism/prism.sqlite3`.
- `CATALOG_DBL_EXPORT_DIR` can stay empty for the bundled Compose stack. Docker defaults to `/app/projects/.kicad-prism/exports/kicad-dbl`.
- `CATALOG_KLC_ENABLED=false` keeps KiCad Library Convention checks optional. Set it to `true` to enable Library Manager health validation.
- `CATALOG_KLC_RELEASE_GATE=warn` surfaces validation issues without blocking release. Use `block` only if your team wants KLC errors or missing KLC reports to prevent release.
- `SESSION_COOKIE_SECURE=true` should be used only behind HTTPS.
- `DEV_MODE` should stay `false` in Docker hosting.

### 3. Start the stack

```bash
docker compose up --build -d
```

Open the UI at [http://127.0.0.1:8080](http://127.0.0.1:8080).

### 4. Stop the stack

```bash
docker compose down
```

## Docker Volumes and Persistence

Current Compose mounts:

- `./data/projects` -> `/app/projects`
- `./data/ssh` -> `/root/.ssh`

Persisted data includes:
- SQLite workspace/project/folder metadata, background job state, component catalog, KiCad OAuth state, and service-client metadata at `data/projects/.kicad-prism/prism.sqlite3`
- imported repositories
- canonical KiCad component library files under `data/projects/.kicad-prism/components`
- generated CERN-style DBL bundles under `data/projects/.kicad-prism/exports/kicad-dbl`
- generated symbol and footprint previews
- `.rbac_roles.json`
- exported comments JSON inside repos when generated
- SSH keys and `known_hosts`

The backend creates `data/projects/.kicad-prism` automatically during startup. The catalog initializer also creates the canonical component subdirectories:

- `symbols/`
- `footprints/`
- `3dmodels/`
- `spice/`
- `previews/symbols/`
- `previews/footprints/`
- `revisions/`

You do not need to create these directories manually for a normal deployment.

## Authentication Modes

### Guest Mode

```env
AUTH_ENABLED=false
OIDC_CLIENT_ID=
SESSION_SECRET=
DEV_MODE=false
```

Behavior:
- login wall is disabled
- backend serves a guest admin session
- all visitors have full admin/designer/viewer access while auth is disabled

### OIDC Login + Session Auth

```env
AUTH_ENABLED=true
OIDC_ISSUER_URL=https://sso.example.com/realms/engineering
OIDC_CLIENT_ID=kicad-prism
OIDC_CLIENT_SECRET=
OIDC_SCOPES=openid email profile
OIDC_EMAIL_CLAIM=email
OIDC_NAME_CLAIM=name
OIDC_PICTURE_CLAIM=picture
OIDC_PROVIDER_NAME=SSO
OIDC_TOKEN_AUTH_METHOD=client_secret_post
SESSION_SECRET=
CORS_ORIGINS_STR=https://your-domain.example
DEFAULT_VIEWER_DOMAINS_STR=
DEV_MODE=false
```

Behavior:
- frontend shows the configured SSO sign-in screen
- backend exchanges the OIDC authorization code, verifies signed `id_token`s with JWKS, validates nonce, and reads user profile claims
- backend issues an `HttpOnly` signed session cookie
- RBAC role resolution uses stored assignments plus bootstrap admins
- if `DEFAULT_VIEWER_DOMAINS_STR` is set, users from those domains get implicit `viewer` access when no explicit role is stored
- on first successful login, those implicit viewers are written into `.rbac_roles.json` so admins can promote them later

Google Sign-In uses this same generic OIDC path with
`OIDC_ISSUER_URL=https://accounts.google.com`. For Docker frontend testing, Google must allow the
exact redirect URI `http://127.0.0.1:8080/auth/callback`. The KiCad remote-provider callback is a
separate backend callback and does not replace the frontend login callback.

### Local Dev Bypass

```env
AUTH_ENABLED=true
OIDC_CLIENT_ID=
SESSION_SECRET=
DEV_MODE=true
```

Behavior:
- auth is effectively disabled because the backend only enables auth when `AUTH_ENABLED=true`, OIDC client settings are set, and `DEV_MODE=false`
- this is convenient for local backend/frontend development

## OIDC/OAuth Setup

Create an OIDC client in your identity provider and add the frontend origins and redirect URIs you actually use.

Typical origins:
- local frontend dev: `http://127.0.0.1:5173`
- local Docker frontend: `http://127.0.0.1:8080`
- production: `https://your-domain.example`

Typical redirect URIs:
- local frontend dev: `http://127.0.0.1:5173/auth/callback`
- local Docker frontend: `http://127.0.0.1:8080/auth/callback`
- production: `https://your-domain.example/auth/callback`
- KiCad remote-symbol login: `https://your-domain.example/oauth/oidc/callback`

Use the issuer URL in `OIDC_ISSUER_URL`, the client ID in `OIDC_CLIENT_ID`, and the client secret in `OIDC_CLIENT_SECRET`.
Most providers work with `OIDC_SCOPES=openid email profile` and claim names `email`, `name`, and
`picture`. If your provider requires HTTP Basic authentication at the token endpoint, set
`OIDC_TOKEN_AUTH_METHOD=client_secret_basic`; otherwise keep the default `client_secret_post`.

Google Sign-In through the generic OIDC path:

```env
OIDC_ISSUER_URL=https://accounts.google.com
OIDC_SCOPES=openid email profile
OIDC_EMAIL_CLAIM=email
OIDC_NAME_CLAIM=name
OIDC_PICTURE_CLAIM=picture
OIDC_PROVIDER_NAME=Google
OIDC_TOKEN_AUTH_METHOD=client_secret_post
```

Register the frontend callback URLs above in Google Cloud Console when using Google. For local
Docker, the required URI is exactly `http://127.0.0.1:8080/auth/callback`; `localhost` and
`127.0.0.1` are not interchangeable for Google redirect matching.

Set `CORS_ORIGINS_STR` to the exact browser origins that should be allowed to send credentialed
requests to the API. For local Docker the default includes `http://127.0.0.1:8080`; for production
use your HTTPS origin and do not use `*`.

If your production deployment is HTTPS, also set:

```env
SESSION_COOKIE_SECURE=true
```

## Reverse Proxy for Office/VPN Hosting

For an internal workstation deployment such as `http://kicad-prism.example.internal`, keep the SQLite
database and `.kicad-prism/components` asset directory on the workstation's local SSD/NVMe. Do not
place either path on NFS/SMB/network storage; SQLite WAL mode is designed for local filesystems.

If the external reverse proxy points at the frontend container, the bundled frontend Nginx config
already forwards KiCad/API paths to the backend. If the external reverse proxy routes directly to
individual containers, use these path rules:

- `/` to the frontend container
- `/api/*` to the backend container
- `/oauth/*` to the backend container
- `/.well-known/kicad-remote-provider` to the backend container
- `/remote-provider/*` to the backend container

For plain internal HTTP:

```env
CORS_ORIGINS_STR=http://kicad-prism.example.internal
SESSION_COOKIE_SECURE=false
```

For HTTPS, use the HTTPS origin and set `SESSION_COOKIE_SECURE=true`.

The proxy must preserve the original `Host` header so provider metadata advertises the public
office/VPN URL instead of the backend container name. Enable gzip or Brotli compression at the
proxy for JSON responses and static panel assets.

## Private Repository Access

KiCAD Prism supports two normal approaches.

### SSH

Recommended for long-lived hosted deployments.

- SSH material persists under `./data/ssh`
- backend startup ensures `~/.ssh` exists and scans common Git hosts into `known_hosts`
- add the generated or mounted public key to your Git host account

By default, startup does not scan Git host keys because network DNS during startup can slow down local Docker boot. If you want the backend to run `ssh-keyscan` for common Git hosts at startup, set:

```env
GIT_SCAN_KNOWN_HOSTS_ON_STARTUP=true
```

### GitHub Personal Access Token

If you use HTTPS cloning for private GitHub repositories, set:

```env
GITHUB_TOKEN=
```

The backend configures Git URL rewriting at startup so GitHub HTTPS operations can use the token.

## Local Development Hosting

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Notes:
- backend settings also support a backend-local `.env`
- if nothing is configured, local dev defaults generally keep auth off because `DEV_MODE=true`
- local backend development uses SQLite by default at `data/projects/.kicad-prism/prism.sqlite3`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend dev URL:
- [http://127.0.0.1:5173](http://127.0.0.1:5173)

### Remote Symbols Panel Bundle

The Remote Symbols panel source lives in the dedicated frontend app under `frontend/src/panel`. The backend still serves the panel at `/remote-provider/panel`, but `backend/app/static/remote_provider` is generated output and is intentionally not committed.

For Docker deployments, the backend Dockerfile builds the panel with `npm run build:panel` and copies `frontend/dist/remote_provider` into the backend image at `/app/app/static/remote_provider`.

For local development of the panel UI:

```bash
cd frontend
npm install
npm run dev:panel
```

For local backend testing without Docker, build the panel and copy the output into the backend static path before starting Uvicorn:

```bash
cd frontend
npm run build:panel
mkdir -p ../backend/app/static/remote_provider
cp -R dist/remote_provider/. ../backend/app/static/remote_provider/
```

Then start or rebuild the stack as usual:

```bash
docker compose up --build -d
```

## Component Library Deployment

The component catalog has two storage layers:

- SQLite stores component metadata, revisions, reusable asset rows, release workflow state, OAuth state, service-client metadata, and preview status.
- Disk storage under `data/projects/.kicad-prism/components` stores canonical KiCad files.
- Disk storage under `data/projects/.kicad-prism/exports/kicad-dbl` stores generated KiCad DBL compatibility bundles.
- Disk storage under `data/projects/.kicad-prism/validation/klc` stores durable KLC report artifacts.

Canonical disk layout:

- `symbols/`
- `footprints/`
- `3dmodels/`
- `spice/`
- `previews/`
- `revisions/`
- `validation/klc/`

Back up the full `data/projects/.kicad-prism` directory. A database backup without the canonical asset directory is not enough to restore placeable components.

Only components in the `Released` workflow stage and with both symbol and footprint assets attached are visible/placeable through the KiCad Remote Symbols panel.

### Optional KLC Validation

The backend image includes a pinned checkout of KiCad's `kicad-library-utils` under `/opt/kicad-library-utils`. When `CATALOG_KLC_ENABLED=true`, Library Manager admins can run KLC checks against a component's attached symbol and footprint assets.

Prism stores every run as:

- SQLite summary and normalized findings for fast dashboard queries.
- `stdout.txt`, `stderr.txt`, `report.junit.xml`, and `report.json` under `data/projects/.kicad-prism/validation/klc/{run_id}/`.

Useful settings:

```env
CATALOG_KLC_ENABLED=true
CATALOG_KLC_UTILS_PATH=/opt/kicad-library-utils
CATALOG_KLC_RELEASE_GATE=warn
CATALOG_KLC_TIMEOUT_SECONDS=30
CATALOG_KLC_SYMBOL_RULES=
CATALOG_KLC_SYMBOL_EXCLUDE_RULES=
CATALOG_KLC_FOOTPRINT_RULES=
CATALOG_KLC_FOOTPRINT_EXCLUDE_RULES=
CATALOG_KLC_FOOTPRINT_LIB_DIR=
```

The release gate modes are:

- `off`: validation is available but never affects release.
- `warn`: validation issues are shown in Library Manager but release remains allowed.
- `block`: release requires current required symbol and footprint assets to have non-failing KLC runs.

Prism never invokes KLC `--fix` or `--fixmore`; validation is read-only.

To generate a CERN-style KiCad DBL bundle from released/place-ready parts, call the admin API:

```bash
curl -X POST http://127.0.0.1:8000/api/catalog/exports/kicad-dbl
```

The export writes `Prism.sqlite`, `Prism_Linux.kicad_dbl`, `Prism_Windows.kicad_dbl`, `sym-lib-table`, `fp-lib-table`, `SchLib/`, and `PcbLib/`. Symbols are exported as one `.kicad_sym` file per DBL symbol library entry, which matches the KiCad v10 DBL lookup model while avoiding packed generated symbol libraries.

For migrating existing KiCad libraries, see [Import Existing KiCad Libraries](IMPORT_EXISTING_KICAD_LIBRARIES.md).

## Production Tuning

Docker defaults favor the workstation/VPN deployment profile:

```env
UVICORN_WORKERS=4
```

For constrained development machines, lower this to one worker if startup speed matters more than
concurrent request handling:

```env
UVICORN_WORKERS=1
```

SQLite uses one local database file with WAL enabled and automatic WAL checkpoints. Background import,
workflow, and visual-diff job status is persisted in SQLite so polling remains reliable across
multiple Uvicorn worker processes. Keep write-heavy catalog imports as explicit admin operations.

Remote-symbol search uses SQLite FTS5 when available. The backend maintains the FTS index with
SQLite triggers and falls back to `LIKE` search only if the runtime SQLite build does not include
FTS5. The KiCad panel also fetches slim list payloads for search/category views and loads full
asset/preview details only when a part is opened.

Signed asset URLs are valid for a short time and are not bound to a specific user session. Anyone
who receives a signed asset URL can download that single asset until the URL expires, so keep Prism
behind the office network/VPN as planned.

For a workstation-class host with local NVMe and 10-15 concurrent users, expected server-side
latency at a CERN-scale catalog size is:

- component search, first 50 results: usually below `100 ms`
- category browsing, first 200-500 results: usually below `100 ms`
- part manifest or inline placement bundle: usually below `20 ms` plus file read time

Perceived latency over office LAN/VPN is mostly network RTT. A healthy same-site VPN should keep
search in the `100-300 ms` range; slow or cross-region VPN links can push that higher without
indicating a database bottleneck.

## Operational Notes

### Rebuild after env or frontend changes

```bash
docker compose up --build -d
```

### Inspect logs

```bash
docker compose logs --tail=100 frontend
docker compose logs --tail=100 backend
```

### Session behavior

- changing `SESSION_SECRET` invalidates all existing sessions
- secure cookies require HTTPS and will not work correctly on plain HTTP if `SESSION_COOKIE_SECURE=true`

## Troubleshooting

### Blank page with frontend bundle errors

If the browser shows a blank page, open DevTools and check the first JavaScript error.

A previously observed production issue came from unsafe manual chunk splitting. If a bundle regression returns, rebuild and verify that:
- `/assets/index-*.js` loads successfully
- `/api/auth/config` returns `200`
- the first console error is captured before reloading again

### `SESSION_SECRET is not configured`

Cause:
- auth is enabled but `SESSION_SECRET` is empty

Fix:
- set `SESSION_SECRET` in the root `.env`
- rebuild/restart the stack

### SSO sign-in not appearing

Check:
- `AUTH_ENABLED=true`
- OIDC client settings are set
- `DEV_MODE=false`
- browser origin is listed in the identity provider OAuth/OIDC configuration

### `/api/auth/config` returns `502 Bad Gateway`

Cause:
- the frontend is running, but the backend is unavailable or restarting

Fix:
- inspect `docker compose logs --tail=100 backend`
- if the catalog database is corrupt during local testing, stop the stack and move `data/projects/.kicad-prism/prism.sqlite3` aside before restarting:

```bash
docker compose down
mv data/projects/.kicad-prism/prism.sqlite3 "data/projects/.kicad-prism/prism.sqlite3.bak.$(date +%Y%m%d%H%M%S)"
docker compose up --build -d
```

### Login works but API requests fail after deploy

Check:
- `SESSION_COOKIE_SECURE` matches your transport mode
- HTTPS termination is configured correctly if using secure cookies
- browser is not blocking cookies for the deployed origin

### Imported repositories disappear after restart

Check that `./data/projects` is mounted and writable on the host.

## Related Docs

- [../README.md](../README.md)
- [./KICAD-PRJ-REPO-STRUCTURE.md](./KICAD-PRJ-REPO-STRUCTURE.md)
- [./PATH-MAPPING.md](./PATH-MAPPING.md)
