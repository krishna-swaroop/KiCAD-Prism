---
title: Configuration reference
description: Every Prism server setting, its default and what it changes, grouped by area.
sidebar:
  order: 2
---

This page lists every setting the Prism server reads. Other pages tell you which
ones to set for a task and link here for the details.

## How settings are read

Prism reads its settings from environment variables. With Docker Compose you
put them in one environment file:

- a release bundle reads `.env` beside `compose.yml`;
- a source checkout reads `.env` at the repository root;
- an installation made with the guided installer reads `generated/.env`.

Every setting has a default, shown in the tables below. A setting that is
missing from the file, or listed with no value (`NAME=`), uses its default.

Start from the `.env.example` next to the Compose file and keep the real file
out of Git. It holds database, sign-in and Git credentials, so make it readable
only by the administrator and the backup job.

Both Compose files pass every variable in the environment file to the
`backend`, `prism-worker` and `catalog-worker` containers, so a setting does not
need its own line in the Compose file. The file is `.env` unless
`PRISM_ENV_FILE` names another one. `--env-file` on its own only fills the
`${...}` placeholders in the Compose file, so when the file is not `.env`, set
both:

```bash
PRISM_ENV_FILE=prod.env docker compose --env-file prod.env -f docker-compose.yml up -d
```

A few values are fixed by the Compose files and override the environment file:
both set `DEV_MODE=false` and `KICAD_PROJECTS_ROOT=/app/projects`. The release
bundle always builds `PRISM_DATABASE_URL` from the `POSTGRES_*` values; the
source `docker-compose.yml` does so unless you set `PRISM_DATABASE_URL`.

A changed value takes effect only when the affected containers are recreated:

```bash
docker compose up -d
```

Check the file renders before you restart. For a release bundle:

```bash
docker compose --env-file .env -f compose.yml config --quiet
```

For a source checkout:

```bash
docker compose --env-file .env -f docker-compose.yml config --quiet
```

:::note
Compose expands `$` in the environment file. Write a literal `$` as `$$`, for
example `REMOTE_PROVIDER_DESTINATION_DIR=$${KIPRJMOD}/RemoteLibrary`.
:::

Sizes are in bytes and durations in the unit the name says. Where the default
in the shipped `.env.example` differs from Prism's own default, the table says
so.

## Authentication

| Setting | Default | What it does |
| --- | --- | --- |
| `AUTH_ENABLED` | `true` | Requires sign-in. `false` serves every request as a guest with `DEV_GUEST_ROLE`. |
| `DEV_GUEST_ROLE` | `viewer` | Role of the guest when `AUTH_ENABLED=false`: `viewer`, `designer`, `qa` or `admin`. |
| `WORKSPACE_NAME` | `KiCAD Prism` | Name shown on the sign-in page. |
| `PASSWORD_AUTH_ENABLED` | `false` | Turns on email and password sign-in, alone or beside OIDC. |
| `PASSWORD_MIN_LENGTH` | `12` | Shortest accepted password, 8 to 72. |
| `BOOTSTRAP_ADMIN_USERS_STR` | empty | Comma-separated emails that are always administrators. |
| `BOOTSTRAP_ADMIN_PASSWORD` | empty | One-time password for the bootstrap administrators when password sign-in is on. They must change it at first sign-in. Clear it afterwards. |
| `ALLOWED_USERS_STR` | empty | Comma-separated emails allowed to sign in. Empty allows anyone with a role. |
| `ALLOWED_DOMAINS_STR` | empty | Comma-separated email domains allowed to sign in. Empty allows any domain. |
| `DEFAULT_VIEWER_DOMAINS_STR` | empty | Comma-separated email domains whose users get `viewer` when no role is assigned. |
| `AUTH_LOGIN_RATE_LIMIT` | `10` | Sign-in attempts allowed per client in one window. |
| `AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS` | `300` | Length of that window. |
| `DEV_MODE` | `true` | Verbose errors and a development hint on the sign-in page. Both Compose files force `false`. It does not turn off sign-in. |

`ALLOWED_USERS_STR` and `ALLOWED_DOMAINS_STR` apply to OIDC and password
sign-in alike. When both are set, a user must pass both.

### OIDC sign-in

| Setting | Default | What it does |
| --- | --- | --- |
| `OIDC_ISSUER_URL` | empty | Issuer of your identity provider. Must use `https://`. |
| `OIDC_CLIENT_ID` | empty | Client ID registered for Prism. |
| `OIDC_CLIENT_SECRET` | empty | Client secret for the code exchange. |
| `OIDC_SCOPES` | `openid profile email` | Scopes requested at sign-in. |
| `OIDC_EMAIL_CLAIM` | `email` | Claim used as the user's email. |
| `OIDC_NAME_CLAIM` | `name` | Claim used as the display name. |
| `OIDC_PICTURE_CLAIM` | `picture` | Claim used as the avatar URL. |
| `OIDC_PROVIDER_NAME` | empty | Provider name on the sign-in button. `.env.example` sets `SSO`. |
| `OIDC_TOKEN_AUTH_METHOD` | `client_secret_post` | `client_secret_post` or `client_secret_basic`. |

OIDC is on only when the issuer, client ID and client secret are all set.

### Sessions

| Setting | Default | What it does |
| --- | --- | --- |
| `SESSION_SECRET` | empty | Signs session cookies and provider tokens. Required when sign-in is on: at least 32 characters, at least 8 distinct ones, not a known placeholder. Generate it with `openssl rand -base64 48`. |
| `SESSION_TTL_HOURS` | `12` | Absolute session lifetime, 1 to 168. |
| `SESSION_IDLE_TIMEOUT_MINUTES` | `0` | Ends a session unused for this long. `0` turns idle expiry off. |
| `SESSION_REMEMBER_ME_DAYS` | `30` | Lifetime of a remember-me session, 1 to 365. |
| `SESSION_COOKIE_SECURE` | unset | Forces the cookie's `Secure` flag. Unset, the cookie is `Secure` whenever `PUBLIC_BASE_URL` starts with `https://`. |

Changing `SESSION_SECRET` signs everyone out and invalidates KiCad provider
tokens signed with the old value.

### Service and external tokens

| Setting | Default | What it does |
| --- | --- | --- |
| `OAUTH_SERVICE_TOKEN_TTL_SECONDS` | `3600` | Lifetime of access tokens issued to service clients, 300 to 86400. |
| `OAUTH_EXTERNAL_JWT_ISSUER_URL` | empty | An external OAuth issuer whose bearer JWTs Prism accepts on the API. |
| `OAUTH_EXTERNAL_JWT_AUDIENCE` | empty | Audience those JWTs must carry. Required when the issuer is set. |
| `OAUTH_EXTERNAL_JWT_ROLE_CLAIM` | `prism_role` | Claim that holds the Prism role. |
| `OAUTH_EXTERNAL_JWT_SCOPES_CLAIM` | `scope` | Claim that holds the scopes. |
| `OAUTH_EXTERNAL_JWT_CLIENT_ID_CLAIM` | `client_id` | Claim that names the calling client. |

Personal access token limits are under [Automation and MCP](#automation-and-mcp).

### Startup checks

With `AUTH_ENABLED=true`, Prism refuses to start when:

- neither OIDC nor `PASSWORD_AUTH_ENABLED=true` is configured;
- only some of the three OIDC values are set, or the issuer is not `https://`;
- `OIDC_TOKEN_AUTH_METHOD` is not one of its two values;
- `SESSION_SECRET` is missing or too weak;
- `PRISM_DATABASE_URL` is empty;
- `BOOTSTRAP_ADMIN_PASSWORD` is shorter than `PASSWORD_MIN_LENGTH` or longer than 72 bytes;
- `OAUTH_EXTERNAL_JWT_ISSUER_URL` is set without `OAUTH_EXTERNAL_JWT_AUDIENCE`;
- `CORS_ORIGINS_STR` contains `*`.

With `AUTH_ENABLED=false`, Prism refuses to start when `PUBLIC_BASE_URL` is an
`https://` address, or when it names a host other than this machine and
`DEV_GUEST_ROLE=admin`.

## Public address

| Setting | Default | What it does |
| --- | --- | --- |
| `PUBLIC_BASE_URL` | empty | The origin people use, for example `https://prism.example.com`. Every absolute URL Prism hands out uses it: OIDC and OAuth redirects, KiCad provider metadata, links in issues and webhooks, MCP. Empty uses the forwarded headers or the request address. |
| `CORS_ORIGINS_STR` | `http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8080,http://localhost:8080` | Comma-separated browser origins allowed to send credentialed requests. Set it to the same origin as `PUBLIC_BASE_URL`. Never `*`. |
| `COMMENTS_API_BASE_URL` | empty | Base for the comment REST URLs shown to KiCad. Empty uses `PUBLIC_BASE_URL`. |

Set `PUBLIC_BASE_URL` on any deployment other people reach.

## Database

| Setting | Default | What it does |
| --- | --- | --- |
| `PRISM_DATABASE_URL` | empty | PostgreSQL URL. Compose builds it from `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB`. |
| `PRISM_DATABASE_POOL_MIN_SIZE` | `1` | Connections each process keeps open. |
| `PRISM_DATABASE_POOL_MAX_SIZE` | `10` | Most connections each process opens. |
| `PRISM_DATABASE_CONNECT_TIMEOUT_SECONDS` | `10` | How long to wait for a new connection. |
| `PRISM_DATABASE_KEEPALIVE_IDLE_SECONDS` | `30` | Idle time before TCP keepalives start. Keep it below the idle timeout of any NAT or load balancer in front of the database. |
| `PRISM_DATABASE_POOL_MAX_LIFETIME_SECONDS` | `1800` | Age at which a pooled connection is replaced. |

The last three matter when PostgreSQL runs on another host. A value set in
`PRISM_DATABASE_URL` itself wins over them.

The pool size is per process. PostgreSQL must allow the sum across every API
worker process and both workers.

The bundled PostgreSQL starts with `shared_preload_libraries=pg_stat_statements`
and `pg_stat_statements.track=top`, which the slow-query diagnostic reads. A
managed database needs the same settings, or that diagnostic reports itself
unavailable. Nothing else depends on it.

## Workers and jobs

| Setting | Default | What it does |
| --- | --- | --- |
| `PRISM_WORKER_CONCURRENCY` | `4` | Jobs the general worker runs at once, 1 to 16. |
| `PRISM_WORKER_MEMORY_BUDGET_MIB` | half the container's memory, 4096 to 8192 | Memory the general worker admits heavy jobs against. See below. |
| `PRISM_WORKER_POLL_SECONDS` | `0.5` | How often the general worker checks the queue. |
| `PRISM_DESIGN_COMPARE_CONCURRENCY` | `1` | Design comparisons at once. |
| `PRISM_WORKFLOW_CONCURRENCY` | `1` | Jobset workflows at once. |
| `PRISM_IMPORT_CONCURRENCY` | `1` | Project imports at once. |
| `PRISM_SEMANTIC_COMPILE_SLOTS` | `2` | Design parses at once, shared by bundle builds and comparisons. |
| `CATALOG_WORKER_CONCURRENCY` | `2` | Library jobs the catalog worker runs at once, 1 to 8. |
| `CATALOG_KICAD_CONCURRENCY` | `1` | Library jobs that run KiCad at once. |
| `CATALOG_WORKER_POLL_SECONDS` | `1` | How often the catalog worker checks its queue. |
| `CATALOG_JOB_LEASE_SECONDS` | `120` | How long a library job is held before another worker may take it over. |
| `PRISM_JOB_LEASE_SECONDS` | `30` | The same for general jobs. |
| `PRISM_JOB_HEARTBEAT_SECONDS` | `10` | How often a running job renews its lease. |
| `PRISM_JOB_CANCEL_GRACE_SECONDS` | `10` | Time a cancelled job gets before it is killed. |

Heavy jobs reserve their measured peak memory, in 256 MiB units, against
`PRISM_WORKER_MEMORY_BUDGET_MIB`: a Release Studio build 3.25 GiB, a design
comparison 3 GiB, a design bundle build 2.25 GiB, a jobset 1.25 GiB and a
simulation 1 GiB. A job that would exceed the budget waits. The budget must fit
the heaviest job, or the worker refuses to start. Raise it only together with
the `prism-worker` container's memory limit.

The API's process count and the container limits are Compose settings; see
[Compose settings](#compose-settings).

## Storage and retention

| Setting | Default | What it does |
| --- | --- | --- |
| `KICAD_PROJECTS_ROOT` | `data/projects` in the checkout; `/app/projects` in Compose | Imported repositories and Prism's `.kicad-prism` state. |
| `PRISM_JOB_ARTIFACT_ROOT` | `<KICAD_PROJECTS_ROOT>/.kicad-prism` | Job outputs and attempt logs. |
| `PRISM_JOB_RETENTION_DAYS` | `90` | Days finished jobs, their events and logs are kept, unless something still refers to them. |
| `PRISM_ROUTINE_JOB_RETENTION_DAYS` | `7` | The same for routine jobs: tracker polls and sweeps, background fetches, source checks. |
| `PRISM_JOB_ARTIFACT_RETENTION_DAYS` | `30` | Days job output records are kept. |
| `PRISM_JOB_PARTIAL_RETENTION_HOURS` | `24` | Hours unfinished job outputs are kept. |

Changing a storage root without moving its contents gives you an installation
that looks empty.

## Git and project import

| Setting | Default | What it does |
| --- | --- | --- |
| `GITHUB_TOKEN` | empty | Used for `https://github.com/` clones and for Release Studio publishing to GitHub. |
| `PRISM_GIT_CREDENTIALS` | empty | HTTPS tokens for other Git servers, each tied to one URL prefix. See [Git credentials](#git-credentials). |
| `IMPORT_ALLOWED_HOSTS_STR` | empty | Comma-separated Git hosts projects may be imported from. Empty allows any host, and Prism logs a warning. |
| `IMPORT_ALLOW_INSECURE_HTTP` | `false` | Allows `http://` repository URLs. |
| `PRISM_AUTO_SYNC_INTERVAL_SECONDS` | `300` | How often each project fetches from its remote. `0` turns background fetch off. |
| `PRISM_GIT_FETCH_TIMEOUT_SECONDS` | `300` | Longest one fetch may take. |
| `GIT_SCAN_KNOWN_HOSTS_ON_STARTUP` | `false` | Reads the host keys of common Git hosts at startup without asking you to confirm them. Leave it off and trust hosts in **Settings → Git & SSH**. |

Prism never imports from `file://` URLs, local paths, URLs with embedded
credentials or Git remote-helper transports, whatever these settings say.

### Git credentials

To import private repositories over HTTPS from a server other than GitHub, list
a token for each server in `PRISM_GIT_CREDENTIALS`. Prism uses these tokens to
import, sync and push configuration commits, never to publish Releases; for
that, see [Release Studio](#release-studio).

Each entry names a URL prefix and the variable that holds its token:

```env
PRISM_GIT_CREDENTIALS='[{"url_prefix":"https://git.example.test/","token_name":"EXAMPLE_GIT_TOKEN"},{"url_prefix":"https://gitlab.example.test/","token_name":"EXAMPLE_GITLAB_TOKEN","username":"oauth2"}]'
EXAMPLE_GIT_TOKEN=<token with read access>
EXAMPLE_GITLAB_TOKEN=<token with read_repository scope>
```

| Field | Required | What it does |
| --- | --- | --- |
| `url_prefix` | yes | The remotes the token is for: `https://`, the host, an optional port and path, ending in `/`. |
| `token_name` | yes | The variable in the same environment file that holds the token. |
| `username` | no | Sent with the token for servers that need a user name. GitLab needs one; use `oauth2`. GitHub and Gitea do not. |

A token is sent only to remote URLs that start with its prefix exactly as
written. The scheme, host and port must all match: a token for
`https://git.example.test/` is not sent to `https://git.example.test:8443/`,
to `http://git.example.test/` or to `https://git.example.test.other.example/`.
Write the prefix the way users paste clone URLs. When several prefixes match,
the longest wins, so `https://git.example.test/team/` can carry its own token.
Prism refuses repository URLs with `.` or `..` path segments, so a URL cannot
climb out of a prefix's path. Git does not follow redirects for a prefix with a
path, so the server cannot send the token elsewhere on the same host.

`GITHUB_TOKEN` always covers `https://github.com/`, so don't list GitHub here.

Prism checks the list when the API and the workers start, and refuses to start
when a prefix lacks a scheme, host or trailing `/`, contains credentials, or
when a variable that `token_name` names is empty. Tokens are handed to Git one
command at a time, never written to disk, and left out of logs, error messages
and job messages.

An `http://` prefix needs `IMPORT_ALLOW_INSECURE_HTTP=true`. Prism then sends
the token in cleartext and logs a warning at startup and on each import from
that server.

Repository URLs that users paste must still not contain credentials.

![Settings → Git & SSH: the workspace SSH key with its fingerprint and copy button, and Check access buttons for two projects](../../../assets/screenshots/settings-git-ssh.jpg)

## KiCad tools

| Setting | Default | What it does |
| --- | --- | --- |
| `KICAD_CLI_PATH` | empty | The `kicad-cli` every KiCad job runs. Empty looks on `PATH`, then in the usual install locations. A set path is used as given. `KICAD_CLI` is accepted as an older name. |
| `PRISM_KICAD_PYTHON` | empty | KiCad's Python, used for zone refills and board upgrades. Empty uses `python.exe` beside `kicad-cli.exe` on Windows, KiCad.app's Python on macOS and `/usr/bin/python3` on Linux. |

The Docker image already has both. Set them only when you run Prism outside
Docker.

## Design bundles

A design bundle is Prism's parsed copy of one revision of a project. The
viewers, design comparison, Release Studio and Simulation Studio all read it.
The general worker builds bundles in three stages: parse, board and models.

| Setting | Default | What it does |
| --- | --- | --- |
| `PRISM_DESIGN_BUNDLE_AUTO_BUILD` | `true` | Builds a bundle for each project's newest commit after every import and sync, and prebuilds recent and tagged commits in the background. `false` builds bundles only when someone opens a revision. |
| `PRISM_DESIGN_BUNDLE_CONCURRENCY` | `1` | Bundle builds at once, 1 to 8. Raise `PRISM_DESIGN_BUNDLE_MEMORY_BUDGET_BYTES` with it. |
| `PRISM_DESIGN_BUNDLE_MEMORY_BUDGET_BYTES` | `8589934592` (8 GiB) | Memory the bundle builds may use. Concurrency × (largest stage cap + 1.25 GiB) must fit, or Prism refuses to start. Two builds need 14.5 GiB with the default caps. |
| `PRISM_DESIGN_BUNDLE_PARSE_MEMORY_BYTES` | `4294967296` (4 GiB) | Memory cap of the parse stage. |
| `PRISM_DESIGN_BUNDLE_BOARD_MEMORY_BYTES` | `6442450944` (6 GiB) | Memory cap of the board stage. |
| `PRISM_DESIGN_BUNDLE_MODELS_MEMORY_BYTES` | `2147483648` (2 GiB) | Memory cap of the models stage. |
| `PRISM_DESIGN_BUNDLE_PARSE_TIMEOUT_MS` | `300000` | Time limit of the parse stage. |
| `PRISM_DESIGN_BUNDLE_BOARD_TIMEOUT_MS` | `600000` | Time limit of the board stage. |
| `PRISM_DESIGN_BUNDLE_MODELS_TIMEOUT_MS` | `120000` | Time limit of the models stage. |
| `PRISM_DESIGN_BUNDLE_VERIFY_TIMEOUT_MS` | `300000` | Time limit for checking a finished bundle before it is stored. |
| `PRISM_DESIGN_BUNDLE_GLB_TIMEOUT_SECONDS` | `600` | Time limit of the 3D model export. |
| `PRISM_DESIGN_BUNDLE_UPGRADE_TIMEOUT_SECONDS` | `900` | Time limit for upgrading one file saved by an older KiCad. |
| `PRISM_DESIGN_BUNDLE_UPGRADE_WORKERS` | `8` | Files upgraded at once. |
| `PRISM_ZONE_REFILL_TIMEOUT_SECONDS` | `900` | Time limit of one zone refill. |
| `PRISM_DESIGN_BUNDLE_THREADS` | `4` | Threads one build uses. |
| `PRISM_DESIGN_BUNDLE_MAX_ATTEMPTS` | `3` | Attempts before a failing KiCad step fails the build. |
| `PRISM_DESIGN_BUNDLE_FAILED_RETRY_SECONDS` | `3600` | How long a failed bundle stays failed before the next request queues it again. `0` waits for a deliberate retry, such as **Regenerate** on the 3D tab. |
| `PRISM_DESIGN_BUNDLE_BACKFILL_INTERVAL_SECONDS` | `60` | Seconds between background prebuild passes. `0` turns prebuilding off. |
| `PRISM_DESIGN_BUNDLE_PREBUILD_COMMITS` | `10` | Newest commits per branch the prebuild keeps bundles for, besides every tagged commit. `0` keeps branch heads and tags only. |
| `PRISM_DESIGN_BUNDLE_REUSE_CANDIDATES` | `3` | Stored bundles a new revision is compared with to reuse unchanged parts. `0` turns reuse off. |
| `PRISM_DESIGN_BUNDLE_RETENTION_DAYS` | `30` | Days an unused bundle is kept. Bundles of prebuilt commits, of released Release Studio commits and those still referenced are always kept. |
| `PRISM_DESIGN_BUNDLE_CACHE_IDLE_DAYS` | `7` | Drops a bundle's unpacked files after this many days without a read. The bundle itself stays. `0` keeps them as long as the bundle. |
| `PRISM_DESIGN_BUNDLE_CACHE_MAX_BYTES` | `4294967296` (4 GiB) | Cap on unpacked files across all projects. Least recently used go first. `0` turns the cap off. |
| `PRISM_DESIGN_BUNDLE_CACHE_PROJECT_MAX_BYTES` | `1073741824` (1 GiB) | The same cap per project. |
| `PRISM_DESIGN_BUNDLE_CACHE_GRACE_SECONDS` | `3600` | Unpacked files touched more recently than this are never removed. |
| `PRISM_DESIGN_BUNDLE_ROOT` | `<KICAD_PROJECTS_ROOT>/.kicad-prism/bundles` | Bundle store. |
| `PRISM_DESIGN_BUNDLE_CLI_PATH` | empty | The `prism-kicad` binary. Empty uses `PATH`. |
| `PRISM_DESIGN_BUNDLE_SCHEMA_DIR` | empty | Bundle schema directory. Empty uses the one shipped with Prism. |
| `PRISM_ARTWORK_CONFIG_DIR` | empty | Assembly and test-point artwork configurations. Empty uses the ones shipped with Prism. |
| `GEOMETER_EXECUTABLE` | set by the image | Renderer for the parts' hidden-line views. Empty leaves those views out. |

The last five are for running Prism outside Docker. The image sets them.

## Design comparison

| Setting | Default | What it does |
| --- | --- | --- |
| `PRISM_DESIGN_COMPARE_CACHE` | `<temp>/prism_design_compare_cache` | Cache of parsed revisions. Compose sets `/app/projects/.kicad-prism/design-compare/revision-cache`. |
| `PRISM_DESIGN_COMPARE_JOBS` | `<temp>/prism_design_compare` | Scratch space for comparison jobs. |
| `PRISM_DESIGN_COMPARE_CACHE_MAX_BYTES` | `21474836480` (20 GiB) | Cache size cap. Least recently used revisions go first. `0` turns the cap off. |
| `PRISM_DESIGN_COMPARE_CACHE_MIN_AGE` | `900` | Seconds a cached revision is protected after its last use. |
| `PRISM_DESIGN_COMPARE_STALE_SECONDS` | `300` | Seconds without progress before a comparison is reported stalled. |
| `PRISM_DESIGN_COMPARE_MAX_REVISION_WORKERS` | `2` | Revisions prepared at once, at most 2. |
| `PRISM_DESIGN_COMPARE_MAX_INITIAL_WORKERS` | unset | Schematic-stage workers, at most 2. Unset follows `PRISM_DESIGN_COMPARE_MAX_REVISION_WORKERS`. |
| `PRISM_DESIGN_COMPARE_MAX_PCB_WORKERS` | unset | PCB-stage workers, at most 2. Unset follows `PRISM_DESIGN_COMPARE_MAX_REVISION_WORKERS`. |
| `PRISM_DESIGN_COMPARE_REVISION_PROCESSES` | `true` | Prepares the two revisions in separate processes. `false` uses one. |

## Release Studio

| Setting | Default | What it does |
| --- | --- | --- |
| `GITHUB_TOKEN` | empty | Token for publishing Releases to `github.com`. Needs `contents:write`. Also used for GitHub clones; see [Git and project import](#git-and-project-import). |
| `GITLAB_TOKEN` | empty | Token for publishing Releases to `gitlab.com` and to hosts listed in `PRISM_FORGE_HOSTS` without their own token. Needs the `api` scope. |
| `PRISM_FORGE_HOSTS` | empty | Self-managed GitLab hosts Release Studio may publish to. See below. |
| `PRISM_CAIRO_LIBRARY_DIR` | empty | macOS only, outside Docker: the directory holding `libcairo.2.dylib` for PDF pages. |

Release Studio also uses these tokens to check whether a tag already exists and
to list earlier Releases on the cover. Without a token, publishing is refused
and the cover lists only the current release. The workspace SSH key can clone
but cannot publish. The tokens belong to the workspace, not to each user.

`github.com` and `gitlab.com` are always known. List other GitLab hosts in
`PRISM_FORGE_HOSTS` by exact host name; a name that merely contains `gitlab` is
not treated as GitLab. The short form uses `GITLAB_TOKEN` for every host:

```env
PRISM_FORGE_HOSTS=git.acme.example=gitlab,git.other.example=gitlab
```

The JSON form gives each host its own API root and token. `token_name` names
another variable in the same environment file that holds the token:

```env
PRISM_FORGE_HOSTS='[{"host":"git-a.acme.example","kind":"gitlab","api_root":"https://git-a.acme.example/api/v4","token_name":"ACME_GITLAB_A_TOKEN"}]'
ACME_GITLAB_A_TOKEN=<token with api scope>
```

Each entry needs `kind` `gitlab`, an `https://` `api_root` without credentials,
query or fragment, and a valid variable name in `token_name`. Prism does not
follow redirects while it sends a token.

## Comments

| Setting | Default | What it does |
| --- | --- | --- |
| `PRISM_COMMENT_LIVE_ENABLED` | `true` | Delivers new comments to open pages over a WebSocket. `false` falls back to refreshing over HTTP. |
| `COMMENT_ATTACHMENT_ROOT` | `<KICAD_PROJECTS_ROOT>/.kicad-prism/comment-attachments` | Where pasted images and attached files are stored. |
| `COMMENT_ATTACHMENT_MAX_BYTES` | `10485760` (10 MiB) | Largest single attachment. |
| `COMMENT_ATTACHMENT_PROJECT_QUOTA_BYTES` | `2147483648` (2 GiB) | Attachment storage per project. `0` means no limit. |
| `COMMENT_ATTACHMENT_LINK_SECRET` | empty | Signs the image links Prism puts in GitHub issues, which open without a Prism session. Set the same value for `backend` and `prism-worker`. Empty sends the file name instead of the image. Generate it with `openssl rand -hex 32`. |
| `COMMENT_ATTACHMENT_LINK_TTL_DAYS` | `365` | Lifetime of those links. `0` sends a plain link that needs a Prism session. |

## Issue trackers

| Setting | Default | What it does |
| --- | --- | --- |
| `TRACKER_CREDENTIAL_ROOT_KEY` | empty | Key that encrypts code host credentials, webhook secrets and linked-account tokens. A 32-byte key as 64 hex characters or base64. Generate it with `openssl rand -hex 32`. Empty: Prism cannot store tracker credentials or outbound webhooks. |
| `TRACKER_CREDENTIAL_ROOT_KEY_ID` | `v1` | Name of the current key, 1 to 64 characters from `A-Z a-z 0-9 . _ -`. Change it only when you rotate the key. |
| `TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY` | empty | The previous key, kept while you rotate. |
| `TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY_ID` | empty | Name of the previous key. Must differ from the current one. |

`backend` and `prism-worker` need the same values. Rotation is described in
[Issue trackers](/KiCAD-Prism/admin/issue-trackers/#rotate-the-root-key).

## Library Manager

| Setting | Default | What it does |
| --- | --- | --- |
| `CATALOG_ARTIFACT_ROOT` | `<KICAD_PROJECTS_ROOT>/.kicad-prism/artifacts` | Store for component files and previews. |
| `CATALOG_RETENTION_ENABLED` | `true` | Runs daily artifact maintenance. |
| `CATALOG_DRAFT_MODEL_QUARANTINE_DAYS` | `30` | Days a replaced, never-released draft STEP file waits in quarantine before maintenance deletes it. `0` deletes it in the same run. |
| `CATALOG_IMPORT_ROOTS` | empty | Comma-separated `name=/absolute/path` folders offered as read-only sources in the import center. |
| `CATALOG_IMPORT_MAX_FILES` | `100000` | Most files in one folder snapshot. |
| `CATALOG_IMPORT_MAX_FILE_BYTES` | `2147483648` (2 GiB) | Largest file in a folder snapshot. |
| `CATALOG_IMPORT_MAX_SNAPSHOT_BYTES` | `214748364800` (200 GiB) | Largest folder snapshot. |
| `CATALOG_DBL_EXPORT_DIR` | `<KICAD_PROJECTS_ROOT>/.kicad-prism/exports/kicad-dbl` | Where KiCad database library exports are written. |
| `CATALOG_KLC_ENABLED` | `false` | Checks symbols and footprints against the KiCad Library Convention. The shipped Compose files and `.env.example` set `true`. |
| `CATALOG_KLC_RELEASE_GATE` | `warn` | What a failed check does to a release: `off`, `warn` or `block`. |
| `CATALOG_KLC_UTILS_PATH` | `/opt/kicad-library-utils` | Checkout of `kicad-library-utils` holding the checkers. |
| `CATALOG_KLC_TIMEOUT_SECONDS` | `30` | Time limit of one check. |
| `CATALOG_KLC_SYMBOL_RULES` | empty | Comma-separated symbol rules to run. Empty runs all. |
| `CATALOG_KLC_SYMBOL_EXCLUDE_RULES` | empty | Comma-separated symbol rules to skip. |
| `CATALOG_KLC_FOOTPRINT_RULES` | empty | Comma-separated footprint rules to run. Empty runs all. |
| `CATALOG_KLC_FOOTPRINT_EXCLUDE_RULES` | empty | Comma-separated footprint rules to skip. |
| `CATALOG_KLC_FOOTPRINT_LIB_DIR` | empty | Footprint library passed to the symbol checks. |

## Remote symbols and KiCad

| Setting | Default | What it does |
| --- | --- | --- |
| `REMOTE_PROVIDER_LIBRARY_PREFIX` | `remote` | Library name prefix written into placed parts. |
| `REMOTE_PROVIDER_DESTINATION_DIR` | `${KIPRJMOD}/RemoteLibrary` | Folder in the KiCad project that placed files go to. Write it as `$${KIPRJMOD}/RemoteLibrary` in a Compose environment file. |
| `REMOTE_PROVIDER_EMBED_3D_MODELS` | `true` | Embeds placed 3D models in the footprint so the board carries them. `false` copies every model to the destination folder instead. |
| `REMOTE_PROVIDER_EMBED_MAX_COMPRESSED_BYTES` | `16777216` (16 MiB) | Compressed model data one footprint may embed. A larger model is copied to the destination folder. The footprint grows by about 4/3 of the embedded data. |
| `REMOTE_PROVIDER_OAUTH_CLIENT_ID` | `kicad-prism-kicad` | OAuth client ID KiCad uses. |
| `REMOTE_PROVIDER_ACCESS_TOKEN_TTL_SECONDS` | `3600` | Lifetime of KiCad's access tokens, 300 to 86400. |
| `REMOTE_PROVIDER_REFRESH_TOKEN_TTL_SECONDS` | `604800` | Lifetime of KiCad's refresh tokens, 3600 to 2592000. |
| `AGENT_TOKEN_TTL_SECONDS` | `2592000` (30 days) | Lifetime of a KiCad plugin sign-in token, 3600 to 7776000. |
| `PRISM_PLUGIN_DOWNLOAD_URL` | the latest Prism release on GitHub | Where the KiCad plugin's update prompt sends people. Point it at your own build if you ship one. |

## Simulation Studio

Simulation Studio is experimental and off by default.

| Setting | Default | What it does |
| --- | --- | --- |
| `PRISM_SIM_STUDIO_ENABLED` | `false` | Shows **Simulation Studio** in each project and turns on its API. |
| `PRISM_SIM_BIN_DIR` | `/opt/prism-sim/bin` | Folder holding the simulation binaries. |
| `PRISM_SIM_CONCURRENCY` | `1` | Simulations one worker runs at once. |
| `PRISM_SIM_TIMEOUT_SECONDS` | `3600` | Longest a simulation may run. |
| `PRISM_SIM_ENGINE` | `dc-drop-grid` | Preferred engine. A run falls back to the first installed engine that can run its analysis. |
| `PRISM_SIM_MESHES_KEPT` | `4` | Meshes kept per project for re-runs that change only values. |
| `PRISM_SIM_SUCCEEDED_RUNS_KEPT` | `3` | Newest successful runs kept per setup. Failed and cancelled runs are deleted, except a setup's latest run. |

## Extensions

| Setting | Default | What it does |
| --- | --- | --- |
| `PRISM_EXTENSIONS_FILE` | empty | Path to an operator-managed JSON extension registry, readable by the backend. Empty installs no extensions. The backend validates the file on every extension-list request; file changes take effect on the next request, while changing this setting requires a backend restart. |

The registry is limited to 256 KiB, with at most 32 extensions and eight actions
per extension. Invalid or unreadable registries refuse extension reads rather
than serving stale entries. Keep it free of credentials. For manifest fields,
independent hosting and read-only Docker mounts, see
[Add an extension](/KiCAD-Prism/automate/extensions/).

## Automation and MCP

| Setting | Default | What it does |
| --- | --- | --- |
| `PRISM_PAT_MAX_DAYS` | `365` | Longest lifetime of a personal access token, 1 to 3650. A new token defaults to 90 days. |
| `PRISM_EVENT_RETENTION_DAYS` | `30` | Days the event log behind `GET /api/v1/events` keeps. Older events are deleted at startup. |
| `PRISM_WEBHOOK_ALLOW_PRIVATE` | `false` | Allows outbound webhooks to `http://` URLs and to private, loopback and link-local addresses. Set it only for a local test receiver. |
| `PUBLIC_BASE_URL` | empty | Must be the public origin for MCP: it is the allowed `Origin`, the base of every link in a tool result and the OAuth resource. See [Public address](#public-address). |

Outbound webhook signing secrets are encrypted with
`TRACKER_CREDENTIAL_ROOT_KEY`, so webhooks need that key too.

### MCP server

| Setting | Default | What it does |
| --- | --- | --- |
| `PRISM_MCP_ENABLED` | `false` | Turns on the MCP server at `/mcp` and its OAuth endpoints. While it is `false`, they answer `404`. |
| `PRISM_MCP_OPS_ENABLED` | `false` | Turns on administrator diagnostics: the `/api/ops` routes, the ops MCP tools and the `ops:read` and `ops:act` scopes. Only administrators can hold those scopes. |
| `PRISM_MCP_AUDIT_RETENTION_DAYS` | `365` | Days of MCP call audit records kept. Older ones are deleted at startup. |

Which projects and tools MCP clients may use is set in Prism under
**Settings → MCP**, not in the environment. See
[MCP](/KiCAD-Prism/automate/mcp/).

With diagnostics on, Prism keeps request records for 3 days and route
statistics and profiles for 7 days.

## Build identity

| Setting | Default | What it does |
| --- | --- | --- |
| `PRISM_RELEASE` | `development` | Release name shown in **Help → About KiCAD Prism**, bug reports and the health endpoints. |
| `PRISM_REVISION` | `unknown` | Source commit of the build. |
| `PRISM_BUILD_DATE` | `unknown` | Build time. |

Release images and the installer set these. For a manual source build, see
[Deployment](/KiCAD-Prism/admin/deployment/#build-from-source).

## Compose settings

These are read by the Compose files, not by Prism itself.

| Setting | Default | What it does |
| --- | --- | --- |
| `PRISM_ENV_FILE` | `.env` | Environment file passed to the backend and workers. |
| `PRISM_BACKEND_IMAGE`, `PRISM_FRONTEND_IMAGE` | pinned per release | Release bundle only. The tested image digests. Never replace them with a tag. |
| `PRISM_POSTGRES_IMAGE` | `postgres:17-alpine` | Release bundle only. PostgreSQL image. |
| `PRISM_CADDY_IMAGE` | `caddy:2` | Release bundle only. Proxy image. |
| `PRISM_HTTP_PORT` | `8080` | Release bundle only. Host port of the frontend, bound to `127.0.0.1`. |
| `PRISM_CADDY_HTTP_PORT`, `PRISM_CADDY_HTTPS_PORT` | `80`, `443` | Release bundle only. Host ports of the bundled proxy. |
| `POSTGRES_DB` | `kicad_prism` | Database name. |
| `POSTGRES_USER` | `kicad_prism` | Database user. The source `docker-compose.yml` falls back to `postgres` when unset. |
| `POSTGRES_PASSWORD` | none | Database password. Required by the release bundle. |
| `UVICORN_WORKERS` | `1` | API processes. `.env.example` sets `4`. |
| `PRISM_BACKEND_CPU_LIMIT`, `PRISM_BACKEND_MEMORY_LIMIT` | `2.0`, `4g` | Ceilings for the API container. |
| `PRISM_WORKER_CPU_LIMIT`, `PRISM_WORKER_MEMORY_LIMIT` | `6.0`, `12g` | Ceilings for the general worker. The release `.env.example` sets the CPU limit to `4.0`. |
| `CATALOG_WORKER_CPU_LIMIT`, `CATALOG_WORKER_MEMORY_LIMIT` | `4.0`, `8g` | Ceilings for the catalog worker. |
| `PRISM_WORKER_DATABASE_POOL_MAX_SIZE` | `6` | Database pool of the general worker. |
| `CATALOG_WORKER_DATABASE_POOL_MAX_SIZE` | `4` | Database pool of the catalog worker. |
| `KICAD_BASE_IMAGE` | a pinned `kicad/kicad` digest | Source build only. KiCad base image. Pass it together with `KICAD_BASE_PLATFORM`. |
| `KICAD_BASE_PLATFORM`, `DOCKER_PLATFORM` | `linux/amd64` | Source build only. Image platform. |
| `PRISM_SIM_RELEASE_TOKEN` | empty | Source build only. GitHub token that can download the Simulation Studio engines while the image builds. Empty builds without them. |

The CPU and memory values are ceilings, not reservations. Keep their sum within
what the host can give alongside PostgreSQL and the file cache.
