# KiCAD Prism release deployment

This is the pull-only Linux AMD64 deployment bundle for the release recorded in
`VERSION`. Its generated `.env.example` pins the exact Prism backend and
frontend image digests tested by the release workflow.

## Before upgrading

Read `RELEASE_NOTES.md` and `UPGRADES.md` from this archive before replacing a
running installation. A populated pre-epoch-2 V3 catalog cannot be started by
v3.1.0-alpha until its backup, survivor export, CERN preflight, catalog-only
reset, and survivor restore have completed.

The bundle includes the host-side backup tool. Extract the new bundle to a
staging directory and back up the active deployment before replacing its files:

```bash
python3 /path/to/staged-bundle/scripts/prism_backup.py \
  --root /path/to/active-prism create
```

Verify the resulting archive before continuing. `UPGRADES.md` gives the exact
cutover order and the one-off backend-container commands for the catalog tools.

## Configure

```bash
sha256sum -c SHA256SUMS
cp .env.example .env
mkdir -p data/projects data/ssh certs
```

Set a random PostgreSQL password and session secret, then configure OIDC,
bootstrap administrators, `PUBLIC_BASE_URL`, and `CORS_ORIGINS_STR`.

Do not replace `PRISM_BACKEND_IMAGE` or `PRISM_FRONTEND_IMAGE` with mutable
tags.

For a private single-user evaluation only, set:

```env
AUTH_ENABLED=false
DEV_GUEST_ROLE=admin
UVICORN_WORKERS=1
PRISM_WORKER_CONCURRENCY=1
CATALOG_WORKER_CONCURRENCY=1
```

Never expose guest administrator mode to other users.

## Start

Direct local HTTP:

```bash
docker compose pull
docker compose up -d --wait
```

The frontend binds to `127.0.0.1:8080` by default. The backend is available only
through the frontend proxy.

Public HTTPS with the bundled Caddy service:

1. replace `prism.example.com` in `Caddyfile`;
2. set the same HTTPS origin in `.env`;
3. point DNS to the host and allow ports 80 and 443;
4. start the proxy profile:

```bash
docker compose --profile proxy pull
docker compose --profile proxy up -d --wait
```

For an internal CA or custom certificate, replace `Caddyfile` with
`Caddyfile.internal` and place `prism.crt` and `prism.key` in `certs/`.

For a publicly trusted certificate on a host that must not accept inbound
connections from the internet, replace `Caddyfile` with `Caddyfile.dns-01`,
build a proxy image from `Dockerfile.caddy-dns`, and set `PRISM_CADDY_IMAGE`.
Ports 80 and 443 then stay closed to the internet. See the Deployment guide.

## Verify

```bash
docker compose ps
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8080/api/health/ready
```

## Persistent state

- `prism-postgres-data` stores PostgreSQL.
- `data/projects` stores repositories, generated assets, and caches.
- `data/ssh` stores Git SSH identity and known hosts.
- `.env` stores deployment secrets and release image digests.

Back up all four before an upgrade. Upgrade the files in this same installation
directory so relative `data/` paths continue to reference existing state. Start
from the next release's `.env.example` and migrate site values; copying the old
`.env` wholesale would retain old image digests.

Full guides:

- `RELEASE_NOTES.md` in this archive
- `UPGRADES.md` in this archive
- <https://github.com/krishna-swaroop/KiCAD-Prism/blob/main/docs/DEPLOYMENT.md>
- <https://github.com/krishna-swaroop/KiCAD-Prism/blob/main/docs/OPERATIONS.md>
