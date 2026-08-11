# Operations

This runbook covers backup, restore, upgrades, rollback, capacity, and diagnosis
for a shared KiCAD Prism installation.

Run commands from the active deployment directory containing `compose.yml` and
`.env`. Source-built installations use `docker-compose.yml` instead.

These procedures describe PostgreSQL-backed V3 installations. They do not
convert a V2 alpha SQLite data directory into V3; use a fresh V3 data location
and the release-specific re-import steps for that transition.

For an upgrade, follow [Upgrades and backups](UPGRADES.md) instead of assembling
the steps below by hand. It wraps the backup, the archive check and the schema
ladder into one ordered procedure, and `scripts/prism_backup.py` captures the
database and the component assets as a single consistent set — which the manual
`pg_dump` here does not. The sections below remain the reference for the
individual pieces, and for anything the tool does not cover.

## Record the deployed state

For a release-bundle installation:

```bash
cat VERSION
grep '^PRISM_.*_IMAGE=' .env
docker compose images
```

For a source-built legacy installation:

```bash
git rev-parse HEAD
docker compose images
```

Keep this record with every backup.

## What must be backed up

A recoverable backup contains one consistent set of:

1. the `prism-postgres-data` PostgreSQL volume;
2. `data/projects`;
3. `data/ssh`;
4. the deployed `.env`;
5. the release bundle or source revision record.

PostgreSQL alone cannot restore component assets or imported repositories.
Project storage alone cannot restore users, roles, comments, catalog metadata,
jobs, audit records, or sessions.

## Logical backup

Choose a maintenance window or otherwise ensure the database dump and filesystem
archive represent a known point in time.

Create a PostgreSQL custom-format dump:

```bash
docker compose exec -T postgres \
  pg_dump -U kicad_prism -d kicad_prism -Fc \
  > prism-postgres.dump
```

Substitute the configured PostgreSQL user and database when they differ from
the defaults.

Archive persistent files:

```bash
tar -C data -czf prism-files.tar.gz projects ssh
```

Store the dump, file archive, `.env`, release bundle, version record, and
checksums away from the Prism host. Encrypt the backup because it can contain
source repositories, component assets, tokens, and SSH private keys.

## Restore test

Test restores on an isolated AMD64 host:

1. install the recorded release bundle;
2. restore `.env` without exposing the test host;
3. restore `data/projects` and `data/ssh`;
4. start PostgreSQL only;
5. restore the database;
6. start the remaining services;
7. verify login, a project, comments, comparison, Library Manager, and Remote
   Symbol placement.

Example database restore into a fresh configured database:

```bash
docker compose up -d postgres
docker compose exec -T postgres \
  pg_restore -U kicad_prism -d kicad_prism --clean --if-exists \
  < prism-postgres.dump
```

Run `--clean` only against the isolated restore target; it replaces objects in
that database.

## Upgrade a release bundle

Release bundles use relative `data/` bind mounts and a stable Compose project
name. Upgrade the existing installation directory so it continues to reference
the same filesystem data and PostgreSQL volume.

1. Download and verify the next stable bundle and its external checksum.
2. Read the release notes.
3. Back up PostgreSQL, `data/projects`, `data/ssh`, `.env`, and the active
   deployment files.
4. Extract the new bundle to a staging directory.
5. Start from the new `.env.example`; migrate site-specific values from the old
   `.env`.
6. Keep the new `PRISM_BACKEND_IMAGE` and `PRISM_FRONTEND_IMAGE` digest values.
7. Validate the staged configuration.
8. Stop the active stack.
9. Replace `compose.yml`, `.env.example`, Caddy templates, `README.md`,
   `VERSION`, and `SHA256SUMS` in the active directory. Install the prepared
   `.env`.
10. Pull and start the new release.
11. Run the post-change checklist.

Do not copy the old `.env` wholesale: doing so also copies the old image digests.
Do not run the next bundle from a new directory unless its `data/` paths have
been deliberately mapped to the existing storage.

Validation and startup:

```bash
docker compose --env-file .env -f compose.yml config --quiet
docker compose pull
docker compose up -d --wait
docker compose logs --tail=200 postgres backend prism-worker catalog-worker
```

## Rollback

Application rollback and data rollback are separate decisions.

If no incompatible schema or data change occurred:

1. stop the current stack;
2. restore the previous bundle's deployment files and `.env` in the same active
   installation directory;
3. run `docker compose pull`;
4. start with `docker compose up -d --wait`;
5. run the verification checklist.

If the release changed data incompatibly, restore PostgreSQL, `data/projects`,
and `data/ssh` from the same pre-upgrade backup before starting the older
application.

Never move or recreate a published Git tag to perform a rollback. The previous
bundle retains the original Prism image digests.

## Upgrade a legacy source deployment

For a stable release that predates bundles:

1. back up all state;
2. fetch and check out the target stable tag;
3. compare the new `.env.example` with `.env`;
4. render Compose;
5. rebuild and start;
6. record the resulting commit and images.

```bash
docker compose --env-file .env -f docker-compose.yml config --quiet
docker compose up --build -d
```

Prefer moving to the release-bundle contract when a later stable release
provides one. Follow that release's data-migration notes explicitly; do not
assume that a V2 alpha SQLite installation can be upgraded in place.

## Post-change verification

- frontend and API health endpoints
- OIDC login and logout
- viewer and designer permissions
- repository import or synchronization
- schematic, PCB, 3D, and BOM display
- Design Comparison completion
- comment creation and resolution
- one jobset and artifact download
- catalog search and release queue
- Remote Symbol Provider discovery and placement
- backup job completion

## Logs and job diagnosis

```bash
docker compose ps
docker compose logs --tail=200 backend
docker compose logs --tail=200 prism-worker
docker compose logs --tail=200 catalog-worker
docker compose logs --tail=200 postgres
docker compose logs --tail=200 frontend
```

For a failed job, capture its job ID, type, project or component, attempt logs,
worker logs, release version, and source commit. Record evidence before retrying.

## Capacity and retention

Monitor:

- host and Docker disk usage;
- PostgreSQL volume growth;
- `data/projects/.kicad-prism` artifact growth;
- worker memory on the largest projects;
- queued and repeatedly retried jobs;
- catalog import and validation duration;
- PostgreSQL connection-pool saturation.

Use configured artifact and partial-output retention. Do not delete unknown
content inside `.kicad-prism` manually. Confirm whether it is authoritative data
or a regenerable cache first.

## Common failures

### Frontend returns 502

Inspect `/api/health/ready` and backend startup. Common causes are invalid OIDC
settings, PostgreSQL unavailability, unwritable project storage, or a startup
exception.

### A release starts with old code

Inspect `PRISM_BACKEND_IMAGE` and `PRISM_FRONTEND_IMAGE` in `.env`. Copying an
old environment file during upgrade also copies its old digest pins.

### Imported projects disappear

Verify the active installation directory and its `data/projects` mount. Then
verify project rows in PostgreSQL; both are required.

### Authentication loops

Check redirect URIs, `PUBLIC_BASE_URL`, CORS, proxy headers, cookie Secure
behavior, and the host clock.

### Jobs remain queued

Confirm both workers are healthy and use the same `PRISM_DATABASE_URL`. Inspect
leases and worker logs before restarting.

### Catalog metadata exists but placement fails

Verify released asset files in persistent storage and confirm provider metadata
advertises the correct public origin.

### Disk is full

Stop new imports and generation. Preserve PostgreSQL and authoritative assets
before removing anything. Expire known generated artifacts through a documented
retention path instead of deleting arbitrary directories.
