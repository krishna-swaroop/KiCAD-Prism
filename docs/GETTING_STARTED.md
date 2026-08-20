# Getting started

This guide covers a private evaluation of KiCAD Prism. Shared installations must
use OIDC and HTTPS and follow [Deployment](DEPLOYMENT.md).

## Choose an evaluation path

Use:

- a stable release bundle when the selected GitHub Release provides one;
- a source build from `dev` when contributing or evaluating unreleased work;
- a source build from a stable tag only for releases that predate deployment
  bundles.

The supported public runtime target is Linux AMD64. Docker Desktop may emulate
AMD64 on other host architectures, but native ARM64 release images are not
currently provided.

## Stable release bundle

Download the archive and checksum from the
[latest stable release](https://github.com/krishna-swaroop/KiCAD-Prism/releases/latest),
then verify and extract them:

```bash
sha256sum -c kicad-prism-vX.Y.Z-linux-amd64.tar.gz.sha256
tar -xzf kicad-prism-vX.Y.Z-linux-amd64.tar.gz
cd kicad-prism-vX.Y.Z-linux-amd64
sha256sum -c SHA256SUMS
cp .env.example .env
```

For a private, single-user evaluation, edit `.env`:

```env
POSTGRES_PASSWORD=<random-local-password>
AUTH_ENABLED=false
DEV_GUEST_ROLE=viewer
UVICORN_WORKERS=1
PRISM_WORKER_CONCURRENCY=1
CATALOG_WORKER_CONCURRENCY=1
```

This grants every visitor the guest role. `viewer` is enough to inspect.
To start Release Studio builds and complete dual sign-off as one person, set
`DEV_GUEST_ROLE=admin`. A guest `designer` cannot skip the QA slot. Use guest
mode only on a private machine with the frontend bound to loopback.

Start the digest-pinned images:

```bash
docker compose pull
docker compose up -d --wait
docker compose ps
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080).

## Source development from `dev`

Contributors and testers of unreleased behavior build the root Compose project
from source:

```bash
git clone --branch dev https://github.com/krishna-swaroop/KiCAD-Prism.git
cd KiCAD-Prism
cp .env.example .env
```

Set the same private evaluation posture:

```env
AUTH_ENABLED=false
DEV_GUEST_ROLE=viewer
UVICORN_WORKERS=1
```

`DEV_GUEST_ROLE=viewer` is enough to inspect projects. To start Release Studio
builds and complete dual sign-off as one person, set `DEV_GUEST_ROLE=admin`.
A guest `designer` cannot skip the QA slot.

The root configuration defaults to the pinned stable AMD64 KiCad base:

```env
KICAD_BASE_PLATFORM=linux/amd64
DOCKER_PLATFORM=linux/amd64
```

Build and start:

```bash
docker compose up --build -d
docker compose ps
```

Do not deploy `dev` as the stable team service. It is the integration branch and
can contain alpha changes between releases.

## Verify the evaluation

All five application services should be running:

- `kicad-prism-postgres`
- `kicad-prism-backend`
- `kicad-prism-worker`
- `kicad-prism-catalog-worker`
- `kicad-prism-frontend`

Check:

```bash
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8080/api/health/ready
docker compose logs --tail=100 backend prism-worker catalog-worker
```

## Import a project

1. Select **Import Project**.
2. Paste an HTTPS or SSH clone URL.
3. Wait for repository analysis.
4. Select the discovered project paths to register.
5. Start import and wait for its queued job.
6. Open the project and inspect Overview, Visualizers, History, Workflows,
   Assets, and Documentation.

For private repositories, configure SSH in Settings or provide an appropriate
Git credential. See [Project workflows](PROJECT_WORKFLOWS.md).

## Stop or reset

Stop without removing PostgreSQL:

```bash
docker compose down
```

Do not add `--volumes` unless database deletion is intentional.
`data/projects` and `data/ssh` are bind-mounted and remain after `down`.

## Troubleshooting

### Image pull fails

Confirm registry access and inspect the configured image reference:

```bash
docker compose config --images
docker compose pull
```

Release bundles use exact Prism image digests. Do not replace them with `latest`
to work around a registry or permission failure.

### Source build cannot resolve the KiCad base

Confirm the pinned public AMD64 image is reachable:

```bash
docker pull --platform linux/amd64 kicad/kicad:10.0.4
docker run --rm --platform linux/amd64 \
  kicad/kicad:10.0.4 kicad-cli --version
```

### Host architecture differs

The supported public image architecture is AMD64:

```bash
docker info --format '{{.Architecture}}'
```

Docker Desktop may emulate it on Apple Silicon, but the backend and KiCad tooling
will not run natively.

### Frontend returns 502

The frontend is running but the API is unavailable:

```bash
docker compose logs --tail=200 backend postgres
curl -i http://127.0.0.1:8080/api/health/ready
```

### Authentication startup fails

`AUTH_ENABLED=true` fails closed when identity (OIDC or password auth), session,
or database settings are incomplete. Use guest mode only for a private
evaluation or complete [Authentication and access](AUTHENTICATION_AND_ACCESS.md).

## Next

- [Deployment](DEPLOYMENT.md)
- [Team adoption](TEAM_ADOPTION.md)
- [Configuration](CONFIGURATION.md)
- [Release process](RELEASES.md)
