# Upgrades and backups

How to move a Prism installation to a newer release without losing the component
catalog, the imported projects, or anything else that took work to create.

[Operations](OPERATIONS.md) is the general runbook. This document is the
narrower thing: the exact sequence for an upgrade, what protects you at each
step, and what to do when a step goes wrong.

> **Scope:** This procedure applies to PostgreSQL-backed V3 installations and
> later releases that use the same storage model. It is not a migration from
> the V2 alpha SQLite layout to V3 PostgreSQL. For that transition, deploy V3
> into a fresh data location and re-import the projects and component sources
> as described in the V3 release notes. Alpha releases do not promise
> backwards-compatible data or API contracts.

## The rule the whole scheme rests on

> **An upgrade may only add.** Anything that removes or narrows waits for a
> later release, once the version that needed it is out of support.

Within that PostgreSQL release line, a rollback can normally use the previous
application images without restoring data: new columns and tables are designed
to be ignored by older code. This is an application and schema convention, not
a general alpha compatibility guarantee. Read the release notes for the exact
release before relying on an image-only rollback; if the release changed data
incompatibly, restoring the matching backup is required.

Prism enforces its half of this. Both schemas carry numbered ledgers applied at
startup under an advisory lock:

| Schema | Ledger | Migrations |
| --- | --- | --- |
| `workspace` | `workspace.ws_schema_migrations` | [`workspace_schema_migrations.py`](../backend/app/services/workspace_schema_migrations.py) |
| `catalog` | `catalog.catalog_schema_versions` | [`catalog_schema_migrations.py`](../backend/app/services/catalog_schema_migrations.py) |

Derived state sits outside those ledgers on purpose. Component-head projections,
search indexes and integrity guards are rebuilt whenever their definition version
changes, which a run-once ledger cannot express. They rebuild from authoritative
data, so they are not schema-migrated and are omitted from the standard
`prism_backup.py` archive. Include them separately when faster recovery is worth
the additional storage.

## What is authoritative, and what is not

Four things hold state you cannot recreate:

| | Where | Why it matters |
| --- | --- | --- |
| PostgreSQL | the `prism-postgres-data` volume | users, roles, projects, comments, jobs, audit records, catalog rows |
| Component assets | `data/projects/.kicad-prism/components` | the symbol, footprint, 3D model and revision files the catalog rows point at |
| Project storage | the rest of `data/projects` | imported repositories and checkouts |
| Git identity | `data/ssh` | the keys your Git host has authorised |

**A database dump on its own is not a backup of Prism.** Restore it without the
component store and every component in the catalog exists, with a broken
reference to its files. The two have to travel together.

Everything else under `.kicad-prism` — job artifacts, semantic 3D bundles,
KiCad database-library exports, validation runs — rebuilds on demand. On a
working installation that is most of the bytes, and `prism_backup.py` leaves it
out.

---

# The upgrade, step by step

Run everything from the deployment directory: the one holding `compose.yml`
(release bundle) or `docker-compose.yml` (source build).

Release-bundle users should first extract the next bundle into a separate
staging directory. Do not replace the active deployment or start the new images
yet. The staged bundle contains this runbook and the backup tool used below.

## 1. Record what you are running

```bash
docker compose images
```

Add `cat VERSION` for a release bundle, or `git rev-parse HEAD` for a source
build. Keep this with the backup — a rollback needs to know what to roll back
*to*, and "the previous one" is not an answer at 6pm.

## 2. Take a backup

Release bundle, before replacing the active files:

```bash
python3 /path/to/staged-bundle/scripts/prism_backup.py \
  --root /path/to/active-prism create
```

Source checkout:

```bash
python3 scripts/prism_backup.py create
```

This stops `frontend`, `backend`, `prism-worker` and `catalog-worker`, leaves
PostgreSQL running, then captures the dump and the files as one set and restarts
the application. The pause is what makes the database and the filesystem
describe the same moment. It usually costs under a minute.

`--hot` skips the pause. Use it for a routine off-hours snapshot, not before an
upgrade: the whole point of this backup is that you may need it.

The archive contains the dump, project storage, `data/ssh`, the `.env`, and a
manifest recording the Prism images, both schema ledger versions, and a SHA-256
of every payload.

> **The archive contains secrets.** Repositories, tokens, and SSH private keys,
> plus the `.env` verbatim. Encrypt it and store it off this host.

## 3. Check that the backup is real

Use the same copy of `prism_backup.py` that created the archive. For a release
bundle staged outside the active deployment, that is:

```bash
python3 /path/to/staged-bundle/scripts/prism_backup.py verify \
  /path/to/active-prism/prism-backup-<timestamp>.tar.gz
```

For a source checkout:

```bash
python3 scripts/prism_backup.py verify prism-backup-<timestamp>.tar.gz
```

Every payload is re-hashed against the manifest. An untested backup is a
rumour; this is thirty seconds against the possibility of finding out during a
restore.

## 4. Read the release notes

Specifically, whether the release says anything about schema or data. If it
announces a breaking change, the rollback path in step 8 needs the backup rather
than just the old images.

## 5. Get the new code

Source build:

```bash
git fetch origin
git checkout <tag>
```

Release bundle: extract the new bundle to a staging directory, then replace
`compose.yml`, `.env.example`, the Caddy templates, `VERSION` and `SHA256SUMS`
in the active directory.

**Do not copy the old `.env` over the new one.** It carries the old image
digests, and the stack will start on the old code while everything appears to
have upgraded. Start from the new `.env.example` and carry your site values
across. If you deployed with the installer, it does that for you:

```bash
python3 -m scripts.prism_deploy
```

It reads your existing answers, keeps your secrets, and takes the new defaults.

## 6. Validate before you switch

```bash
docker compose --env-file .env -f compose.yml config --quiet
```

Substitute your own file list. This catches a broken merge while the old stack
is still serving.

## 7. Start the new release

```bash
docker compose pull            # release bundle
docker compose up -d --wait
```

Source builds need `--build` instead of `pull`, because the application code is
baked into the image at build time:

```bash
docker compose up -d --build --wait
```

Migrations run during startup, inside the advisory lock, before the service
accepts traffic. Watch them:

```bash
docker compose logs -f backend | grep -i "schema migration"
```

You should see one line per migration, or silence if there were none.

## 8. Verify, or roll back

Work through the checklist in [Operations](OPERATIONS.md#post-change-verification).
The short version: log in, open a project, view schematic / PCB / 3D, search the
catalog, place a Remote Symbol.

If it is wrong and the release changed nothing incompatibly, put the previous
deployment files and `.env` back and start again — the data is untouched:

```bash
docker compose up -d --wait
```

If the release did change data incompatibly, restore instead:

```bash
python3 scripts/prism_backup.py restore prism-backup-<timestamp>.tar.gz
```

When both schema ledgers can be read, restore refuses an archive newer than the
build receiving it, because that would leave the database below the schema
version its contents assume. On an empty or otherwise unreadable database it
warns that this comparison could not run; stop and investigate before
continuing. Restore replaces the database, project storage and SSH keys in
place, and asks before it does.

Never move or recreate a published Git tag to roll back. The previous bundle
still pins the original image digests; that is what makes it a rollback.

---

# Restore onto a fresh host

The same archive rebuilds an installation from nothing — for disaster recovery,
or to rehearse one.

1. Install the recorded release into an empty directory.
2. Extract the archive's `env` and adapt it to the new host. Do not reuse a
   hostname or certificate that still belongs to the live installation.
3. Bring up PostgreSQL alone: `docker compose up -d postgres`.
4. `python3 scripts/prism_backup.py restore <archive>`.
5. Start everything: `docker compose up -d --wait`.
6. Run the verification checklist.

Rehearse this on an isolated host **before** you need it. A restore you have
never performed is not a recovery plan.

---

# Adding a migration

For contributors changing the schema.

Append to `MIGRATIONS` in the relevant module. Never renumber, never edit a
migration that has shipped — an installation that already applied version 4 will
never run it again, so changing it only affects databases that have not seen it,
and the two diverge silently.

```python
def _thing_that_was_added(conn: Any) -> None:
    """Say what this is for and why, not what the SQL says."""
    conn.execute(
        "ALTER TABLE ws_projects ADD COLUMN IF NOT EXISTS thing TEXT NOT NULL DEFAULT ''"
    )


MIGRATIONS = (
    ...
    (8, "thing_that_was_added", _thing_that_was_added),
)
```

Requirements:

- **Additive only.** `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`. No `DROP`, no `NOT NULL` without a default, no
  narrowing type change.
- **Idempotent.** It may run against a database that partly has the change.
- **Fast, or deliberately not.** `ALTER COLUMN ... TYPE` rewrites the whole
  table and holds a lock for the duration. If a migration will take minutes on a
  real catalog, say so in the release notes.

To drop something, ship the code that stops using it first. Remove the column a
release later.

## Why the catalog gate is gone

Until [`catalog_schema_migrations.py`](../backend/app/services/catalog_schema_migrations.py)
existed, the catalog carried a single version string, and a database that did
not match it raised at startup:

> Catalog schema predates the PostgreSQL reset architecture. Run
> `scripts/reset_prism_postgres.py` with destructive confirmation.

The documented remedy for a catalog schema change was to wipe the catalog. It
had never fired, because the version had never been bumped — so the first
release to change a catalog table would have discovered it on somebody's
production database, mid-upgrade, after the old stack had been stopped.

The ladder replaced it. The legacy version row is still written on every startup
so that an older Prism, which treats that row as a hard precondition, can still
open a database a newer V3 build has touched. That preserves the catalog
rollback convention; it does not make a V2 SQLite installation or arbitrary
alpha API changes backwards-compatible.

## Catalog epoch 2 cutover

The component-as-part catalog is an intentional destructive catalog boundary.
The backend refuses a populated pre-epoch-2 catalog and leaves every
non-catalog PostgreSQL schema untouched. Use this rollout order:

1. Create and verify a Prism backup, then rotate any exposed InvenTree token.
2. Stop the backend and catalog workers.
3. If the legacy catalog contains non-CERN work, export and verify the survivor
   archive described below.
4. Run `import_database_library.py --dry-run --report-json …` and archive the report.
5. Check that report against the survivor archive before deleting anything.
6. Run the catalog-only reset below.
7. Start the new backend once to create epoch 2.
8. Restore the survivor archive before importing CERN.
9. Re-import CERN without `--replace-catalog`, then generate previews.
10. Rebuild project usage if the deployment requires it.
11. Run catalog acceptance queries and default/non-default KiCad placement smoke tests before reopening access.

### Run the catalog tools from the release bundle

The release bundle deliberately keeps backend dependencies inside the
digest-pinned backend image. After the verified backup, replace the deployment
files with the new bundle, carry site values into its `.env`, pull the new
backend image, and stop every catalog writer while leaving PostgreSQL running:

```bash
docker compose pull backend
docker compose stop frontend backend prism-worker catalog-worker
```

Choose an absolute host directory outside `data/projects` for migration
archives and reports, then define the command used by the examples below:

```bash
mkdir -p /absolute/host/migration
run_catalog_tool() {
  docker compose run --rm --no-deps \
    --volume /absolute/host/migration:/migration \
    backend python "$@"
}
```

This one-off container uses the active deployment's PostgreSQL network and
`data/projects` mount without starting the backend service. Source checkouts
with the backend dependencies installed can use the same examples with:

```bash
run_catalog_tool() { python3 "$@"; }
```

After the catalog-only reset, initialize epoch 2 once with
`docker compose up -d backend`, wait for it to become healthy, then stop it
again before restoring survivors. Do not start the workers until restoration
and the CERN import have completed.

### Preserving non-CERN work from a legacy catalog

Pre-epoch-2 CERN imports did not carry the newer `external_source` marker. Their
immutable first revision did use `system:import_database_library`, which is the
one-time classifier used by `migrate_legacy_catalog_survivors.py`. Everything
whose first revision has a different creator is archived as a survivor,
including manually created components and footprint-library imports.

Run the export with deployment-specific expected counts so an unexpected row is
a hard stop. Write the archive outside
`data/projects/.kicad-prism/components`, because the full reset removes that
component store:

```bash
run_catalog_tool scripts/migrate_legacy_catalog_survivors.py export \
  --output /migration/prism-legacy-survivors.zip \
  --expect-survivors <survivor-count> \
  --expect-librarian <librarian-impacted-count> \
  --expect-excluded-cern <legacy-cern-count>

run_catalog_tool scripts/migrate_legacy_catalog_survivors.py verify \
  /migration/prism-legacy-survivors.zip
```

The archive contains the complete legacy component, revision, audit, review,
release, usage, and asset rows plus checksum-verified asset payloads. Epoch 2
restores the active current/released snapshots as new A3 representations while
the complete historical evidence remains in the archive. A provisional or
incomplete legacy revision that cannot satisfy epoch-2 release invariants is
restored as an open draft and listed in the restore report rather than silently
being treated as released.

After producing the CERN importer dry-run report, require a clean identity
comparison:

```bash
run_catalog_tool scripts/migrate_legacy_catalog_survivors.py check-cern-report \
  /migration/prism-legacy-survivors.zip \
  /migration/cern-preflight.json
```

Only after the backup, archive verification, importer preflight, and collision
check all pass should the full reset run. Start the new backend once to create
epoch 2, stop catalog writers again, and preflight then execute restoration:

```bash
run_catalog_tool scripts/migrate_legacy_catalog_survivors.py restore \
  /migration/prism-legacy-survivors.zip \
  --expect-components <survivor-count> \
  --confirm RESTORE-PRISM-LEGACY-SURVIVORS-EPOCH-2 \
  --dry-run

run_catalog_tool scripts/migrate_legacy_catalog_survivors.py restore \
  /migration/prism-legacy-survivors.zip \
  --expect-components <survivor-count> \
  --confirm RESTORE-PRISM-LEGACY-SURVIVORS-EPOCH-2
```

Restore preserves component IDs, current metadata attribution, active assets,
and component-usage rows. It refuses corrupt payloads, duplicate survivor
identities, existing destination IDs/slugs/identities, ambiguous legacy asset
pairing, a non-epoch-2 destination, or a CERN preflight identity collision.
Keep the verified archive with the full Prism backup; neither is replaced by
the other.

The reset command is:

```bash
run_catalog_tool scripts/reset_prism_catalog.py \
  --confirm RESET-PRISM-CATALOG-EPOCH-2
```

After an epoch-2 CERN import, later refreshes can remove only components carrying
the importer's explicit CERN origin marker. Non-CERN components and assets still
referenced by them are preserved:

```bash
run_catalog_tool scripts/reset_prism_catalog.py \
  --cern-only \
  --confirm RESET-PRISM-CERN-IMPORTS
```

Add `--dry-run` to preview the CERN-scoped component and orphan-asset counts.
Stop the backend and catalog workers before executing the non-dry-run form; the
reset temporarily disables named catalog immutability triggers inside its locked
transaction and restores them before commit.

The command removes only the `catalog` schema and catalog component,
preview, KLC-validation, and DBL artifact roots. Project repositories, database
volumes, environment files, other PostgreSQL schemas, and unrelated derived data
are preserved. Rolling a populated epoch-2 catalog back to a pre-epoch-2 backend
is unsupported; restore the backup instead.

---

# Reference

## Commands

```bash
python3 scripts/prism_backup.py create --help
```

| Command | Purpose |
| --- | --- |
| `create` | write an archive; `--hot` to skip the pause, `--output` to choose the path |
| `verify` | re-hash every payload against the manifest |
| `restore` | replace this deployment's data with an archive; `--yes` to skip the prompt |

Global: `--root` for the deployment directory, `--env-file` and `--compose-file`
when detection needs help.

## Manifest

```json
{
  "schema": "prism.backup.a1",
  "created_at": "20260727T101500Z",
  "hot": false,
  "postgres": { "user": "kicad_prism", "database": "kicad_prism" },
  "images": { "PRISM_BACKEND_IMAGE": "ghcr.io/…@sha256:…" },
  "versions": { "workspace_schema": "7", "catalog_schema": "2" },
  "checksums": { "postgres.dump": "…", "projects.tar.gz": "…" }
}
```

The manifest itself holds no secrets, so it is safe to keep alongside an
inventory of backups. The archive it describes is not.

## Known gaps

- **PostgreSQL runs on a floating tag.** Every Prism image is digest-pinned;
  `postgres:17-alpine` is not. Within major 17 that is safe by PostgreSQL
  policy, but a move to 18 would leave `PGDATA` unreadable and the container
  crash-looping, discovered right after `docker compose pull`. Pin
  `PRISM_POSTGRES_IMAGE` to a digest if you want that decision to be yours.
- **Restore has no CI coverage yet.** The archive format and the refusal rules
  are tested; restoring a previous release's dump into the current build is not.
  Until it is, rehearse restores yourself.
