---
title: Deploy Prism
description: Install Prism on a Docker host from a release bundle, with the guided installer, or from source.
sidebar:
  order: 1
---

This page takes you from an empty Docker host to a running Prism that your team
can sign in to.

## Choose how to install

| Path | Use it when | What runs |
| --- | --- | --- |
| [Release bundle](#deploy-a-release-bundle) | You run Prism for a team. This is the supported path. | Images pulled by digest from a tagged release. |
| [Guided installer](#deploy-with-the-guided-installer) | You want the HTTPS setup, sizing and secrets written for you. | Images built from a source checkout. |
| [Source build](#build-from-source) | You develop Prism, or need a release that has no bundle. | Images built from a source checkout. |

Every path runs the same five containers: `postgres`, `backend` (the API),
`prism-worker` (design jobs), `catalog-worker` (Library Manager jobs) and
`frontend` (the web app and the proxy to the API). PostgreSQL starts with the
`pg_stat_statements` extension preloaded, which the slow-query diagnostic
reads.

## Requirements

- A Linux AMD64 host with Docker Engine and Docker Compose v2. Native ARM64
  images are not published; emulating AMD64 works for a trial but is not a
  supported production target.
- Local SSD or NVMe storage for repositories and generated files.
- For a shared deployment: a DNS name, a way to terminate HTTPS, and an OIDC
  client or a plan to use password sign-in.
- A backup destination off the host.
- Outbound HTTPS to your Git hosts, your identity provider, GitHub Container
  Registry and Docker Hub.

See [Sizing](#sizing) for CPU and memory.

## Deploy a release bundle

Each stable release on GitHub carries a deployment bundle,
`kicad-prism-vX.Y.Z-linux-amd64.tar.gz`. It holds `compose.yml`, an
`.env.example` that pins the tested backend and frontend images by digest, the
Caddy proxy templates, the backup tool, `UPGRADES.md`, the release notes,
`VERSION` and `SHA256SUMS`. Nothing is built on your host.

### 1. Download and verify

1. Download `kicad-prism-vX.Y.Z-linux-amd64.tar.gz` and its `.sha256` file from
   the [latest release](https://github.com/krishna-swaroop/KiCAD-Prism/releases/latest).
2. Check the archive:

   ```bash
   sha256sum -c kicad-prism-vX.Y.Z-linux-amd64.tar.gz.sha256
   ```

3. Extract it into the directory Prism will live in, for example
   `/srv/kicad-prism`, and check its contents:

   ```bash
   sha256sum -c SHA256SUMS
   ```

Keep this directory for the life of the installation. `compose.yml` keeps
project and SSH state in `data/` beside it, and upgrades replace files in place.

### 2. Configure

1. Create the environment file and the data folders:

   ```bash
   cp .env.example .env
   ```

   ```bash
   mkdir -p data/projects data/ssh certs
   ```

2. Generate a database password and a session secret, one at a time:

   ```bash
   openssl rand -base64 48
   ```

3. Set at least these values in `.env`:

   ```env
   POSTGRES_PASSWORD=<random value>
   SESSION_SECRET=<random value, at least 32 characters>

   AUTH_ENABLED=true
   WORKSPACE_NAME=Engineering ECAD
   OIDC_ISSUER_URL=https://sso.example.com/realms/engineering
   OIDC_CLIENT_ID=kicad-prism
   OIDC_CLIENT_SECRET=<client secret>
   OIDC_PROVIDER_NAME=Company SSO
   BOOTSTRAP_ADMIN_USERS_STR=admin@example.com

   PUBLIC_BASE_URL=https://prism.example.com
   CORS_ORIGINS_STR=https://prism.example.com
   ```

4. Make `.env` readable only by you and the backup job:

   ```bash
   chmod 600 .env
   ```

Leave `PRISM_BACKEND_IMAGE` and `PRISM_FRONTEND_IMAGE` as they are. They are the
image digests this release was tested with.

To use passwords instead of OIDC, see
[Authentication](/KiCAD-Prism/admin/authentication/). Every other setting is in
the [configuration reference](/KiCAD-Prism/admin/configuration/).

### 3. Set up HTTPS

The release `compose.yml` publishes only the frontend, on
`127.0.0.1:8080`. The API is reachable only through the frontend. Put an HTTPS
proxy in front of it: the bundle includes Caddy as the `proxy` profile, or you
can use your own. Follow [HTTPS](/KiCAD-Prism/admin/https/) to pick one.

### 4. Start

With the bundled proxy:

```bash
docker compose --profile proxy pull
```

```bash
docker compose --profile proxy up -d --wait
```

With your own proxy, leave out `--profile proxy`.

### 5. Verify

1. Check that every container is up and healthy:

   ```bash
   docker compose ps
   ```

2. Read the startup logs:

   ```bash
   docker compose logs --tail=100 postgres backend prism-worker catalog-worker frontend
   ```

3. Check the health endpoints through your public address:

   ```bash
   curl -fsS https://prism.example.com/healthz
   ```

   ```bash
   curl -fsS https://prism.example.com/api/health/ready
   ```

   `/api/health/ready` answers `503` until PostgreSQL is reachable and project
   storage is writable.

4. Check that the public metadata names your HTTPS address:

   ```bash
   curl -fsS https://prism.example.com/.well-known/kicad-remote-provider
   ```

5. Sign in as a bootstrap administrator, assign roles, import a small
   repository and open it.

## Deploy with the guided installer

The installer runs from a source checkout. It asks how Prism will be reached,
writes a complete configuration into `generated/`, and checks the host before
anything starts. It changes nothing outside `generated/` and `sites/`.

1. Clone the repository and check out a release tag:

   ```bash
   git clone https://github.com/krishna-swaroop/KiCAD-Prism.git
   ```

   ```bash
   git -C KiCAD-Prism checkout <release tag>
   ```

2. Run the installer from the checkout. It needs Python 3.9 or newer.

   ```bash
   ./deploy.sh
   ```

   On Windows, run `.\deploy.ps1`. It uses a native Python, or WSL2 when none is
   installed.

3. Answer the questions: the HTTPS scheme, the host name, a sizing preset, and
   your OIDC client unless the scheme is plain HTTP.
4. Complete the manual steps listed in `generated/NEXT_STEPS.md`: DNS records,
   firewall rules and the OIDC redirect URIs.
5. Start the stack with the command the installer prints, or run the installer
   again with `--start`.

The installer writes:

- `generated/.env`, with new secrets and the chosen preset;
- `generated/docker-compose.generated.yml`, which binds the API and frontend to
  loopback and adds the proxy;
- `generated/Caddyfile` or `generated/tailscale-serve.json`, depending on the
  scheme;
- `generated/deploy-plan.json`, a record of your answers with secrets masked;
- `generated/NEXT_STEPS.md`.

Before it starts anything it checks the Compose version, the generated Caddy and
Compose files, the OIDC discovery document and, from inside a container, access
to the certificate authority and DNS provider. A network filter that leaves the
host alone but intercepts container traffic is a common cause of certificate
failures, which is why these checks run in a container.

The schemes are described in [HTTPS](/KiCAD-Prism/admin/https/). The sizing
presets are:

| Preset | Host | API processes | General jobs | Library jobs | Bundle builds |
| --- | --- | --- | --- | --- | --- |
| Private evaluation | 4 vCPU, 16 GB | 1 | 2 | 1 | 1 |
| Small team | 8 vCPU, 32 GB | 2 | 4 | 2 | 1 |
| Larger installation | 16 vCPU, 64 GB | 4 | 8 | 3 | 2 |

Each preset also sets the container limits and the matching memory budgets.

Run the installer again at any time. It keeps your secrets and every value you
changed in `generated/.env`, and backs up the files it replaces. Options:

| Option | Effect |
| --- | --- |
| `--dry-run` | Prints the files with secrets masked and writes nothing. |
| `--fresh` | Ignores the existing configuration. |
| `--answers answers.json --non-interactive` | Runs unattended from a JSON answers file. |
| `--start` | Starts the stack when the checks pass, building any image that does not exist yet. |
| `--promote` | Moves a Let's Encrypt deployment from the staging to the production authority. |
| `--skip-preflight`, `--skip-network-checks` | Skips all checks, or only the network ones. |
| `--yes` | Does not ask for confirmation. |

:::caution
`generated/` holds live credentials. It is excluded from Git and from the Docker
build, but back it up as carefully as `.env`.
:::

The installer does not work on a release bundle. A bundle has no source to build
and keeps its settings in `.env`.

### Serve other sites from the same Caddy

The installer rewrites `generated/Caddyfile` each time it runs. Put any other
site in `sites/<name>.caddy` instead. The generated Caddyfile imports every file
there, in name order, before Prism's own site, so the first file may start with
a global options block.

```caddyfile
wiki.example.com {
	reverse_proxy wiki:3000
}
```

Reload Caddy after you edit a site:

```bash
docker compose --env-file generated/.env -f docker-compose.yml -f docker-compose.proxy.yml -f generated/docker-compose.generated.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
```

## Build from source

Use this for development, or for a release that has no bundle.

1. Clone the repository and check out a release tag, as above.
2. Create the environment file from the checkout's template and fill it in as
   for a bundle:

   ```bash
   cp .env.example .env
   ```

3. Build and start, telling the build which commit it came from:

   ```bash
   PRISM_RELEASE="$(git describe --tags --always --dirty)" PRISM_REVISION="$(git rev-parse HEAD)" PRISM_BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" docker compose up --build -d
   ```

Without those three variables, **Help → About KiCAD Prism** and bug reports show
`development` and `unknown`. The installer sets them for you.

The source `docker-compose.yml` publishes the frontend on port `8080` and the
API on port `8000` on every interface. Bind them to loopback, as the installer
does, before you expose the host to a network.

The image builds without Simulation Studio engines unless `PRISM_SIM_RELEASE_TOKEN`
is set; see [Compose settings](/KiCAD-Prism/admin/configuration/#compose-settings).

## Persistent state

| Location | Holds |
| --- | --- |
| Docker volume `prism-postgres-data` | Users, roles, sessions, projects, comments, the component catalog, jobs and audit records. |
| `data/projects` | Git checkouts, component files, generated files and caches. |
| `data/ssh` | Prism's Git SSH key and trusted host keys. |
| `.env` (or `generated/.env`) | Secrets and, for a bundle, the image digests. |

Also keep, where you have them: the Caddy data volume (certificate authority
account and issued certificates), `generated/` and `sites/`, and `data/secrets`
on a source deployment. None of these may sit on temporary container storage.
[Operations](/KiCAD-Prism/admin/operations/#back-up) covers backing them up.

## Private Git repositories

To import over SSH:

1. Open **Settings → Git & SSH** as an administrator and click **Generate key**.
2. Add the public key to your Git host as a read-only deploy key or to a
   machine user.
3. Under **Trusted Git hosts**, enter the host and click **Read host key**.
4. Compare the fingerprints with the ones your Git host publishes, then click
   **Fingerprint matches — trust host**.
5. Import a test repository.

Prism does not trust a host key it has not been told to trust.

For private `https://github.com/` repositories you can set `GITHUB_TOKEN`
instead; see [Git and project import](/KiCAD-Prism/admin/configuration/#git-and-project-import).
For HTTPS tokens on other Git servers, set `PRISM_GIT_CREDENTIALS`; see
[Git credentials](/KiCAD-Prism/admin/configuration/#git-credentials).
Set `IMPORT_ALLOWED_HOSTS_STR` to the Git hosts this installation should reach,
so users cannot make the server clone from internal addresses.

## Sizing

KiCad rendering, design comparison and library checks need CPU and memory.
Start with the preset that matches your host and benchmark your own largest
projects before raising concurrency.

The general worker admits heavy jobs against a memory budget, by default half of
its container's memory. A Release Studio build reserves 3.25 GiB, a design
comparison 3 GiB, a design bundle build 2.25 GiB. Jobs that do not fit wait
rather than fail. On an 8 GB worker container, one heavy job runs at a time.

A cold design bundle for a large board, about 55 MB of `.kicad_pcb`, takes 2 to
2.5 minutes and peaks around 2.2 GB. After the first deployment or a bulk
import, the worker builds bundles for every project's recent commits one at a
time, so expect it to stay busy for a while. Plan about 50 MB of disk per
bundled revision of such a board.

Raise one concurrency setting at a time, and watch worker memory, job duration,
queue length, database connections and disk use before the next change. The
settings are in [Workers and jobs](/KiCAD-Prism/admin/configuration/#workers-and-jobs).

## Before you onboard the team

- Sign-in fails closed: removing the OIDC settings stops Prism from starting
  unless password sign-in is on.
- Browsers and KiCad workstations trust the HTTPS certificate.
- Only the proxy ports are reachable from the network.
- The bundle's image references are still digests.
- A backup has run and a restore has succeeded on another host.
- You have rehearsed an [upgrade and a rollback](/KiCAD-Prism/admin/upgrades/).
- At least two people hold the `admin` role.
