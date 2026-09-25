# Deployment

This guide covers the supported shared deployment path for KiCAD Prism:
the digest-pinned deployment bundle attached to a stable GitHub Release.

Feature development and source testing happen on `dev`. Stable code is promoted
to `main`, tagged, built, smoke-tested, and published by the release workflow.
Operators should not deploy a moving branch.

## Supported deployment contract

The public release target is a Linux AMD64 Docker host. A successful release
contains:

```text
kicad-prism-vX.Y.Z-linux-amd64.tar.gz
├── compose.yml
├── .env.example
├── Caddyfile
├── Caddyfile.internal
├── Caddyfile.dns-01
├── Dockerfile.caddy-dns
├── README.md
├── VERSION
└── SHA256SUMS
```

The generated `.env.example` pins the Prism backend and frontend images by
registry digest. The backend image is reused by the API, general worker, and
catalog worker. The Compose file has no source checkout or `build:` directive.

Docker Desktop can emulate AMD64 containers on other host architectures, but
native ARM64 release images are not currently published. Emulated deployments
are not the supported production target.

## Prerequisites

Prepare:

- a Linux AMD64 host with Docker Engine and Docker Compose v2;
- local SSD or NVMe storage sized for repositories and generated artifacts;
- a DNS name and TLS termination for a shared deployment;
- an OIDC client;
- a durable backup destination;
- enough CPU and memory for the selected worker concurrency.

Allow outbound HTTPS to the configured Git hosts, OIDC provider, GitHub
Container Registry, Docker Hub, and any other registries selected in `.env`.

## 1. Obtain and verify a stable release

Open the
[latest stable GitHub Release](https://github.com/krishna-swaroop/KiCAD-Prism/releases/latest)
and download:

- `kicad-prism-vX.Y.Z-linux-amd64.tar.gz`
- `kicad-prism-vX.Y.Z-linux-amd64.tar.gz.sha256`

Verify and extract:

```bash
sha256sum -c kicad-prism-vX.Y.Z-linux-amd64.tar.gz.sha256
tar -xzf kicad-prism-vX.Y.Z-linux-amd64.tar.gz
cd kicad-prism-vX.Y.Z-linux-amd64
sha256sum -c SHA256SUMS
```

Use a stable installation directory and keep it for future upgrades. Relative
paths in `compose.yml` deliberately keep project and SSH state under that
directory.

```text
/srv/kicad-prism/
├── compose.yml
├── .env
├── Caddyfile
├── VERSION
├── certs/
└── data/
    ├── projects/
    └── ssh/
```

For the first installation, move the extracted bundle contents into the chosen
directory before starting Prism.

## 2. Configure the environment

### Guided installer

`deploy.sh` (or `deploy.ps1` on Windows) asks which HTTPS scheme applies,
collects the settings it cannot derive, and writes a complete configuration
into `generated/`. It does not modify anything else in the checkout.

```bash
./deploy.sh
```

```powershell
.\deploy.ps1
```

It generates `.env`, the proxy `Caddyfile`, a Compose overlay that binds the
frontend and backend to loopback, a redacted record of the run, and a
`NEXT_STEPS.md` listing what remains manual. For DNS-01 it also builds the
Caddy image with the provider module.

Before starting anything it verifies the Compose version, container egress to
the ACME and DNS provider endpoints, whether container DNS answers match the
host's, the OIDC discovery document, and the generated Caddy and Compose
configuration. Network probes run inside a container: a filtering appliance
that leaves the host alone while intercepting container traffic is a common
cause of issuance failures that look like certificate problems.

```bash
./deploy.sh --dry-run                              # render and print, write nothing
./deploy.sh --fresh                                # ignore any existing configuration
./deploy.sh --answers answers.json --non-interactive
./deploy.sh --start                                # bring the stack up when checks pass
./deploy.sh --promote                              # staging CA -> production, in place
```

`--promote` rewrites the proxy configuration for the production endpoint,
discards the staging ACME account, and restarts, without re-asking anything.
Secrets are read back from the generated `.env`, so the database password and
session secret are preserved.

`generated/` contains live credentials and is excluded from Git. Back it up
with the rest of the deployment state.

The remainder of this section describes the same configuration by hand, which
is still supported and is what the installer produces.

### Manual configuration

```bash
cp .env.example .env
mkdir -p data/projects data/ssh certs
```

Do not replace `PRISM_BACKEND_IMAGE` or `PRISM_FRONTEND_IMAGE` with mutable tags.
They are the tested image digests for this release.

At minimum, configure:

```env
POSTGRES_DB=kicad_prism
POSTGRES_USER=kicad_prism
POSTGRES_PASSWORD=<random-database-password>

AUTH_ENABLED=true
WORKSPACE_NAME=Engineering ECAD
OIDC_ISSUER_URL=https://sso.example.com/realms/engineering
OIDC_CLIENT_ID=kicad-prism
OIDC_CLIENT_SECRET=<oidc-client-secret>
OIDC_PROVIDER_NAME=Company SSO
SESSION_SECRET=<random-value-of-at-least-32-characters>
BOOTSTRAP_ADMIN_USERS_STR=admin@example.com

PUBLIC_BASE_URL=https://prism.example.com
CORS_ORIGINS_STR=https://prism.example.com
```

Generate secrets independently:

```bash
openssl rand -base64 48
```

Keep `.env` readable only by the deployment administrator and backup process.
It contains database, OIDC, session, and optional Git credentials.

See [Configuration](CONFIGURATION.md) for the remaining settings.

## 3. Configure OIDC

Register both redirect URIs with the identity provider:

```text
https://prism.example.com/auth/callback
https://prism.example.com/oauth/oidc/callback
```

The issuer must use HTTPS and provide standard OIDC discovery metadata.
`AUTH_ENABLED=true` fails closed if no login method is complete (OIDC or
`PASSWORD_AUTH_ENABLED=true`), or if the session secret or database
configuration is incomplete.

Password-only deployments can leave the `OIDC_*` values empty and set
`PASSWORD_AUTH_ENABLED=true`. Seed the first admin with
`BOOTSTRAP_ADMIN_USERS_STR` and `BOOTSTRAP_ADMIN_PASSWORD`, then clear the seed
password after first sign-in. See [Authentication and access](AUTHENTICATION_AND_ACCESS.md).

Use `BOOTSTRAP_ADMIN_USERS_STR` only to establish the first administrators.
After first login, verify explicit roles and keep at least two administrator
accounts.

Read [Authentication and access](AUTHENTICATION_AND_ACCESS.md) before onboarding
the team.

## 4. Configure HTTPS

The request path is:

```text
client -> TLS reverse proxy -> frontend:80 -> backend:8000
```

The release Compose file publishes the frontend only on
`127.0.0.1:${PRISM_HTTP_PORT:-8080}`. It does not publish the backend.

### Bundled Caddy

Edit `Caddyfile`, replace `prism.example.com`, point DNS to the host, and allow
inbound ports 80 and 443:

```bash
docker compose --profile proxy pull
docker compose --profile proxy up -d --wait
```

For a private CA or custom certificate:

1. replace `Caddyfile` with `Caddyfile.internal`;
2. place `prism.crt` and `prism.key` in `certs/`;
3. distribute the issuing root CA to browsers and KiCad workstations;
4. start the same `proxy` profile.

### Tailscale

If the team already uses Tailscale, this is the least work of any option. A
sidecar joins the tailnet, Tailscale Serve terminates TLS under the node's
MagicDNS name, and the certificate is issued and renewed for you.

There is no public DNS record to create, no inbound firewall rule to open, no
ACME credential to scope, and nothing to renew. Only devices on the tailnet can
reach the service, and access is governed by tailnet ACLs in addition to Prism's
own roles.

Requirements, both on the DNS page of the Tailscale admin console:

- **MagicDNS** enabled;
- **HTTPS Certificates** enabled.

There are two ways to attach, and the installer detects which applies:

**The host is already on the tailnet.** Nothing extra runs and no auth key is
needed. Point Serve at the frontend once; it persists across reboots:

```bash
tailscale serve --bg 8080
```

**The host is not a tailnet member.** A sidecar joins it. The installer asks for
the node's MagicDNS name and a reusable auth key, then writes a Serve
configuration alongside the Compose overlay:

```json
{
  "TCP": {"443": {"HTTPS": true}},
  "Web": {"${TS_CERT_DOMAIN}:443": {"Handlers": {"/": {"Proxy": "http://frontend:80"}}}}
}
```

The sidecar runs with `TS_USERSPACE=true`, so it needs neither `/dev/net/tun`
nor `NET_ADMIN`. Node state persists in a named volume: without it the node
re-authenticates on restart and may be renamed, which would change the
certificate domain.

Leave the key's *Ephemeral* option off for the same reason.

### Public certificates without inbound exposure (ACME DNS-01)

Use this when Prism must present a publicly trusted certificate but the host
must not accept inbound connections from the internet. The HTTP-01 challenge
above requires the CA to reach port 80 from outside. DNS-01 instead proves
domain control by publishing a TXT record, so ports 80 and 443 stay closed to
the internet, the A record may exist only in internal DNS and resolve to a
private address, and no root CA has to be distributed to KiCad workstations.

The cost is a DNS credential on the deployment host and a custom proxy image.

#### 1. Build a Caddy image with a DNS provider

The stock `caddy:2` image cannot solve DNS-01. Providers are Go modules linked
into the binary, not runtime plugins:

```bash
docker build -f deploy/Dockerfile.caddy-dns \
  --build-arg DNS_PROVIDER_MODULE=github.com/caddy-dns/cloudflare \
  -t kicad-prism-caddy-dns:2 .
docker run --rm kicad-prism-caddy-dns:2 caddy list-modules | grep dns.providers
```

The `grep` must return a line. Providers are listed at
<https://github.com/caddy-dns>.

#### 2. Obtain a scoped DNS credential

Request the narrowest credential the provider supports. For Cloudflare that is
an API token — not the Global API Key — with `Zone / DNS / Edit` on the single
zone, and IP filtering restricted to the host's egress address.

That credential can still rewrite any record in the zone, including MX and SPF.
Where the DNS team will not accept that, delegate only the challenge record:

```text
_acme-challenge.prism.example.com.  CNAME  prism.acme-delegation.example.
```

The target lives in a separate zone whose credentials are held only by this
deployment. ACME follows the CNAME, so Caddy needs no access to the main zone.
This is one static record, created once.

#### 3. Configure and start

Copy `deploy/Caddyfile.dns-01` over `Caddyfile`, set the hostname and provider
directive, and uncomment the staging `ca` line for the first run.

Set `PRISM_CADDY_IMAGE=kicad-prism-caddy-dns:2` in `.env`, and pass the
provider credential to the proxy with a Compose override so the shipped file
stays untouched:

```yaml
# docker-compose.dns-01.yml
services:
  caddy:
    environment:
      - CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN in .env}
```

Check the configuration before starting anything. This resolves the provider
module and the credential, so it catches a missing module, an unset variable,
and a malformed token in one step:

```bash
docker run --rm -e CLOUDFLARE_API_TOKEN \
  -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" \
  kicad-prism-caddy-dns:2 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

```bash
docker compose -f compose.yml -f docker-compose.dns-01.yml --profile proxy up -d --wait
docker compose -f compose.yml -f docker-compose.dns-01.yml logs -f caddy
```

Confirm success from the proxy logs rather than a browser. Prism sends
`Strict-Transport-Security` with a one-year `max-age`, so once a hostname has
served a trusted certificate, browsers will not offer an exception for the
untrusted staging one.

Confirm the challenge succeeds against staging, then promote:

```bash
./deploy.sh --promote
```

That rewrites the configuration, discards the staging ACME account, and
restarts. The certificate is issued when `/data/caddy/certificates` appears.

#### Operational notes

Egress must reach the ACME directory and the DNS provider API. Both are
frequently miscategorised by filtering appliances, and the resulting failure is
misleading: the ACME client reports a TLS verification error against
`acme-v02.api.letsencrypt.org` rather than a block. Confirm from inside the
container, not from the host, because container DNS often resolves through a
different path:

```bash
docker compose exec caddy nslookup acme-v02.api.letsencrypt.org
```

An address outside the CA's published ranges means DNS interception. Pinning
`dns:` on the proxy service works around it; exempting the hostnames from
filtering is the durable fix, because a pinned resolver breaks silently when
the host's network changes and the failure only surfaces at renewal.

Every issued certificate is published to Certificate Transparency logs, so the
hostname becomes publicly enumerable within minutes even though the service is
internal. Treat that as a decision to record, not a surprise. A wildcard
certificate hides the label at the cost of concentrating risk in one key.

Renewal is automatic at roughly 30 days remaining and needs no scheduled task,
but it depends on the DNS credential still being valid. Track the credential's
expiry alongside the certificate's.

### Plain HTTP, for evaluation only

The installer offers a fifth scheme that runs Prism without TLS. It exists to
try the product on a laptop or an isolated host, and it is not a way to operate
it.

The **Remote Symbol Provider is not supported** on this scheme. HTTPS with a
certificate the workstation already trusts is a prerequisite, and without a TLS
terminator Prism advertises `http://` origins in its provider metadata, which
[Remote Symbol Provider](REMOTE_SYMBOL_PROVIDER.md) treats as a misconfiguration
to correct. Do not build a datasource package against such an origin.

Single sign-on usually fails too, because most identity providers reject
non-HTTPS redirect URIs. The installer therefore offers to disable
authentication, which serves every request as an unauthenticated guest; it
defaults that guest to `viewer` rather than `admin`, and defaults the published
port to loopback.

Everything else -- import, comparison, workflows, the Library Manager, and the
browser viewer -- behaves normally.

### Existing reverse proxy

Start Prism without the proxy profile and route the host proxy to
`http://127.0.0.1:8080`.

The proxy must preserve `Host` and forward the public protocol. Keep
`PUBLIC_BASE_URL` and `CORS_ORIGINS_STR` set to the exact external HTTPS origin.

## 5. Start and verify

Pulling by digest verifies that the registry content matches the bundle:

```bash
docker compose pull
docker compose up -d --wait
docker compose ps
```

Inspect startup:

```bash
docker compose logs --tail=100 postgres backend prism-worker catalog-worker frontend
```

Verify health through the frontend:

```bash
curl -fsS https://prism.example.com/healthz
curl -fsS https://prism.example.com/api/health/live
curl -fsS https://prism.example.com/api/health/ready
```

The readiness endpoint verifies PostgreSQL and writable project storage. It
returns HTTP 503 until both are available.

Verify public metadata:

```bash
curl -fsS https://prism.example.com/api/auth/config
curl -fsS https://prism.example.com/.well-known/kicad-remote-provider
curl -fsS https://prism.example.com/oauth/.well-known/oauth-authorization-server
```

Every advertised absolute URL must use the public HTTPS origin.

Sign in as a bootstrap administrator, assign roles, import a small test
repository, complete one comparison or workflow, and place one released
component before onboarding the wider team.

## Persistent state

A complete installation contains three persistence domains:

| Location | Contents |
| --- | --- |
| Docker volume `prism-postgres-data` | users, roles, sessions, projects, comments, catalog, jobs, and audit records |
| `data/projects` | Git checkouts, catalog assets, generated artifacts, caches, and exports |
| `data/ssh` | Prism Git identity and known-host state |

All three are required for complete recovery. Do not place them on ephemeral
container storage.

## Private Git hosting

For SSH:

1. sign in as an administrator;
2. open Settings and obtain Prism's SSH public key;
3. install it as a read-only deploy key or machine-user key;
4. verify and pin the Git host key;
5. test repository access before importing.

Automatic `ssh-keyscan` is disabled by default. Do not accept an unverified host
key simply to make import succeed.

For private GitHub HTTPS access, `GITHUB_TOKEN` is supported. Use a narrowly
scoped credential and store it only in the deployment secret store.

## Worker sizing

KiCad rendering, comparison, and catalog validation are CPU- and memory-heavy.
Start conservatively:

| Installation | Suggested starting point |
| --- | --- |
| Private evaluation | 4 vCPU, 16 GB RAM, one API worker, one general job, one catalog job |
| Small team | 8 vCPU, 32 GB RAM, two API workers, two general jobs, one catalog job |
| Larger or complex designs | benchmark representative projects before increasing concurrency |

The CPU and memory settings in `.env.example` are service ceilings. They are not
reservations and their sum should not exceed what the host can sustain alongside
PostgreSQL and filesystem cache.

Increase one concurrency class at a time. Monitor worker memory, job duration,
queue depth, PostgreSQL connections, and disk growth before raising it again.

## Releases without a deployment bundle

Releases created before this contract must be built from their tagged source:

```bash
git clone https://github.com/krishna-swaroop/KiCAD-Prism.git
cd KiCAD-Prism
git checkout <stable-release-tag>
cp .env.example .env
docker compose up --build -d
```

Record the tag, commit SHA, and rendered Compose configuration. This is also the
development path, but it is not preferred when a release bundle exists.

## Production readiness

Before declaring the service ready:

- authentication fails closed when OIDC credentials are removed and password auth is not enabled;
- browsers and KiCad workstations trust HTTPS;
- only the intended frontend or proxy ports are reachable;
- Prism image references remain digest-pinned;
- PostgreSQL, project data, SSH state, and `.env` are backed up;
- a restore has succeeded on an isolated host;
- the upgrade and rollback procedure has been rehearsed;
- disk-full and worker-failure behavior is understood;
- at least two administrators can access the workspace.

Continue with [Operations](OPERATIONS.md).
