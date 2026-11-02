# KiCAD Prism release deployment

This is the pull-only Linux AMD64 deployment bundle for the release recorded in
`VERSION`. Its generated `.env.example` pins the exact Prism backend and
frontend image digests tested by the release workflow.

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

If another service already uses port 80 or 443 on the host, the proxy fails to
start with `Ports are not available`. Set other host ports in `.env`:

```bash
PRISM_CADDY_HTTP_PORT=8081
PRISM_CADDY_HTTPS_PORT=8443
```

Include the port in the HTTPS origin, for example `https://prism.example.com:8443`.
Public ACME certificates through `Caddyfile` need ports 80 and 443 reachable from
the internet, so with other ports use `Caddyfile.internal` or `Caddyfile.dns-01`.

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

- `UPGRADES.md` in this archive
- `scripts/prism_backup.py` in this archive
- <https://krishna-swaroop.github.io/KiCAD-Prism/admin/deployment/>
- <https://krishna-swaroop.github.io/KiCAD-Prism/admin/operations/>

## Release notes and experimental settings

Read `RELEASE_NOTES.md` and `UPGRADES.md` before replacing a running deployment.
They are included in `SHA256SUMS`. A pre-epoch-2 catalog requires the documented
catalog cutover; do not start the new API against it before preparing backups
and survivor archives.

Changing an environment value requires recreating the affected containers. `PRISM_COMMENT_LIVE_ENABLED=false` disables live
comment sockets while retaining HTTP comment refresh.
