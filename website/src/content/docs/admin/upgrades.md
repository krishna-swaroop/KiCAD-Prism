---
title: Upgrade Prism
description: Move an installation to a newer release, roll back if it goes wrong, and read the changes each release makes to stored data.
sidebar:
  order: 10
---

This page moves a Prism installation to a newer release without losing the
component catalog, the imported projects or anything else that took work to
create.

It applies to PostgreSQL installations. Moving from the old SQLite alpha layout
means deploying fresh and importing again. Alpha releases do not promise
backward-compatible data or API contracts, so read each release's notes.

## How upgrades stay safe

An upgrade only adds to the database: new tables and columns, never removed or
narrowed ones in the same release. Older code ignores what it does not know, so
within one release line you can usually roll back by starting the previous
images, without restoring data. The release notes say when a release breaks
that rule; then a rollback needs the backup.

Prism brings its database schema up to date at startup, under a lock, before it
accepts requests. There is no separate migration command.

## Upgrade, step by step

For a release bundle, first extract the new bundle into a separate staging
directory. Do not start it. It contains this procedure as `UPGRADES.md` and the
backup tool used below.

### 1. Record what you are running

```bash
docker compose images
```

Also note `cat VERSION` for a bundle, or `git rev-parse HEAD` for a source
build. A rollback needs to know what to roll back to.

### 2. Back up

Use the backup tool from the new release, or from the one you run. For a bundle,
point it at the active installation:

```bash
python3 /path/to/staged-bundle/scripts/prism_backup.py --root /path/to/active-prism create
```

For a source checkout:

```bash
python3 scripts/prism_backup.py create
```

The tool pauses the application while it copies. Don't use `--hot` before an
upgrade. [Back up](/KiCAD-Prism/admin/operations/#back-up) explains what it
captures.

### 3. Check the backup

Run `verify` with the same copy of the tool that made the archive:

```bash
python3 /path/to/staged-bundle/scripts/prism_backup.py verify /path/to/active-prism/prism-backup-<timestamp>.tar.gz
```

### 4. Read the release notes

The bundle has them as `RELEASE_NOTES.md`. Look for anything about schema or
data, and read the matching section under [Release notes for upgrades](#release-notes-for-upgrades).
If the release changes data incompatibly, a rollback will need the backup.

### 5. Get the new release

For a release bundle:

1. In the active directory, replace `compose.yml`, `.env.example`, the Caddy
   templates, `README.md`, `VERSION`, `SHA256SUMS`, `UPGRADES.md`,
   `RELEASE_NOTES.md` and `scripts/` with the staged ones.
2. Start a new `.env` from the new `.env.example` and copy your own values into
   it. Keep the new `PRISM_BACKEND_IMAGE` and `PRISM_FRONTEND_IMAGE`.

:::caution
Do not copy the old `.env` over the new one. It carries the old image digests,
and the stack starts the old version while everything looks upgraded.
:::

Settings added by a release need no value. One that is missing, or left empty
as `NAME=`, uses the default in the
[configuration reference](/KiCAD-Prism/admin/configuration/).

Keep using the same directory, so the relative `data/` paths still point at your
data.

For a source checkout:

1. Fetch and check out the new tag:

   ```bash
   git fetch origin
   ```

   ```bash
   git checkout <tag>
   ```

2. Compare `.env` with the new `.env.example` and add what is new.
3. If you used the installer, run it again. It keeps your answers and secrets
   and picks up new defaults:

   ```bash
   ./deploy.sh
   ```

The installer writes `PRISM_ENV_FILE=generated/.env` into `generated/.env`, so
every setting reaches the containers. If you edit `generated/.env` by hand
instead, keep that line. Hand edits to `generated/Caddyfile` are overwritten;
move extra sites into `sites/` first.

### 6. Check the configuration

For a bundle:

```bash
docker compose --env-file .env -f compose.yml config --quiet
```

For a source checkout, list your own Compose files. This catches a broken merge
while the old stack still runs.

### 7. Start the new release

For a bundle:

```bash
docker compose pull
```

```bash
docker compose up -d --wait
```

A source build must rebuild, because the code is inside the image:

```bash
docker compose up -d --build --wait
```

Watch the schema changes in the backend log. Each one logs an
`Applying ... schema migration` line; a release without changes logs none:

```bash
docker compose logs -f backend
```

### 8. Verify or roll back

Sign in, open a project, view the schematic, PCB and 3D, run a comparison,
search the Library Manager and place a part in KiCad. If you use issue
trackers, run **Test connection** on each.

If something is wrong and the release changed no data incompatibly, put the
previous deployment files and environment file back and start again. The data
is untouched:

```bash
docker compose up -d --wait
```

If the release did change data incompatibly, restore the backup:

```bash
python3 scripts/prism_backup.py restore prism-backup-<timestamp>.tar.gz
```

Never move or recreate a published Git tag to roll back. The previous bundle
still pins the previous images; that is what makes it a rollback.

:::note
The bundle runs PostgreSQL from the `postgres:17-alpine` tag, not a digest.
Within version 17 that is safe, but a jump to 18 would make the existing data
unreadable. Pin `PRISM_POSTGRES_IMAGE` to a digest if you want to decide that
yourself.
:::

## Release notes for upgrades

These are the upgrades that change stored data or behaviour you may rely on.
Each says what changes once, and what, if anything, you must do.

### Unreleased development builds: System Builder data is removed

System Builder never shipped in a tagged release, so an upgrade from
v4.0.0-alpha loses nothing. An installation that ran a development build
between 2026-10-09 and 2026-10-23 did store System Builder data, and the first
start of v5.0.0-alpha deletes it without a copy (workspace migrations 123, 124
and 129; catalog migrations 13 and 16). Module, assembly and system components
are deleted with their revisions; ordinary parts are untouched. Take the backup
first if you want to keep that data. Afterwards `.kicad-prism/system-bundles/`
and `.kicad-prism/system-steps/` can be deleted.

### Replaced draft STEP files go to quarantine

From v3.0.0-alpha up to v4.0.0-alpha, daily artifact maintenance could delete
the STEP file of a released revision when a newer draft replaced it, and
deleted never-released draft models without a record. Placing such a part then
fails with a missing file. After upgrading from any release in that range:

1. Run the [library file check](/KiCAD-Prism/admin/operations/#check-library-files).
   Any `placement_broken` or `history_broken` entry is a released model that was
   lost.
2. Restore those with `--restore --search <dir> --apply` from a backup, the
   source library or users' `RemoteLibrary` folders.
3. Run the check with `--record-legacy --apply` to record the deleted draft
   models, so their components' audit history verifies again.

From this release, maintenance moves a replaced, never-released draft STEP to
quarantine and deletes it only after `CATALOG_DRAFT_MODEL_QUARANTINE_DAYS`
(catalog migration 11). Reading a quarantined model answers `404`.

### Project settings move out of the checkout

Project settings edited in Prism (name, description, paths) used to be written
into the checkout's `.prism.json`, which made the checkout dirty and stopped
**Sync** from fast-forwarding. They now live in the database (workspace
migration 55). On the first start, Prism copies any values that differ from the
committed file into the database and restores a tracked file it had changed, so
Sync works again without a manual step. Commit settings to `.prism.json` to
share them with the team.

### Release Studio pins 3D models from outside the repository

A release now hashes 3D models that live outside the repository, such as KiCad's
stock library, into its build identity (workspace migration 56). Three things
follow:

- The first build of an existing board that uses such models gets a new build
  key, even from an unchanged commit.
- A worker without the model library's variable, for example
  `KICAD9_3DMODEL_DIR`, cannot read those models, and its builds are marked
  non-hermetic. Set the variable to the same library on every worker.
- A build with a model Prism could not pin can still be approved and
  published, but each approval and the publish must acknowledge those models.
  API clients pass them as `acknowledged_models`, and get `409` listing the
  missing ones otherwise.

### Placed parts carry a catalog stamp and embed their 3D models

Parts placed in KiCad now carry two hidden symbol properties,
`Prism_Component` and `Prism_Revision`, and embed their 3D models in the
footprint. The remote provider reports version `0.4.0`.

- Every served symbol and footprint changes once, so its checksum in the
  placement manifest changes once. A client that caches by checksum downloads
  each part again.
- `prism_component` and `prism_revision` become reserved field keys. A field
  created earlier under either key keeps its values but is no longer written
  into symbols.
- A KiCad BOM that exports all fields gains two columns. A BOM preset that lists
  its fields is unaffected.
- A placed part can make the board up to about 21 MB larger. Set
  `REMOTE_PROVIDER_EMBED_3D_MODELS=false` to keep the old behaviour, or
  `REMOTE_PROVIDER_EMBED_MAX_COMPRESSED_BYTES=3145728` to keep the old cap.
- Boards placed before this are not changed.
  `scripts/report_unpinned_board_models.py` lists their unembedded models.
- After every sync, the catalog worker records which catalog revision each
  placed part uses (catalog migration 12). Existing projects are scanned at
  their next sync.

KiCad can now place an earlier released revision of a part. Clients that ignore
the new `revision` parameter keep getting the current release.

### Library exports for KiCad

- Database library exports now ship their 3D models under `3DModels/`.
  Footprints placed from an older export keep the old model paths; run
  **Update footprints from library** in KiCad once to pick up the new ones.
- Parts that share a database library key no longer get `_2`, `_3` suffixes in
  export order. The oldest part keeps the bare key and each other one gets `_`
  plus the first eight characters of its component ID. Each affected part
  changes key once. Designs that placed a part under an old suffixed key must be
  pointed at the new key: keep a copy of the old `Prism.sqlite` before the first
  new export, compare the keys, and change those symbols in KiCad.

### Bulk imports keep existing files

The overwrite options of the library import scripts no longer rewrite a file
that released revisions point to. Changed content is written under
`revisions/<sha256>/` in the catalog store instead, and the new rows point
there. The asset browser still offers the old file at its familiar path.

### Release Studio configurations in monorepo subprojects

A subproject now reads its committed Release Studio configurations only from
`<subproject>/.prism/release-studio/configurations/`, with paths relative to
the subproject. Move any configuration kept at the repository root into the
subproject and make its paths relative, or open and save it again in the
subproject's settings.

### API clients

- Every error body is `{"detail": "...", "code": "..."}`. Match on `code`.
- A bearer token needs `api:read` to read and `api:write` to write. A service
  client created with neither can no longer read; give it `api:read`.
- Comment, reply and component edits take `If-Match`. A stale value answers
  `412`, a missing one `428` where it is required.

See [API and tokens](/KiCAD-Prism/automate/api-and-tokens/).

### Catalog epoch 2

The current component catalog is a deliberate break from the earlier one. The
backend refuses to start against a populated older catalog, and leaves every
other part of the database alone. Moving across it means resetting the catalog,
keeping your own components through a survivor archive, and importing the CERN
library again. Do it in this order:

1. Take and verify a Prism backup.
2. Stop the application, leaving PostgreSQL running:

   ```bash
   docker compose stop frontend backend prism-worker catalog-worker
   ```

3. If the catalog holds anything besides CERN imports, export the survivors with
   `scripts/migrate_legacy_catalog_survivors.py export`, giving the counts you
   expect, and check the archive with its `verify` command. Write the archive
   outside `data/projects`.
4. Run `scripts/import_database_library.py --dry-run --report-json` for the CERN
   library and check the report against the archive with
   `migrate_legacy_catalog_survivors.py check-cern-report`.
5. Reset the catalog:

   ```bash
   docker compose run --rm --no-deps backend python scripts/reset_prism_catalog.py --confirm RESET-PRISM-CATALOG-EPOCH-2
   ```

6. Start the backend once to create the new catalog, wait until it is healthy,
   then stop it again.
7. Restore the survivors with `migrate_legacy_catalog_survivors.py restore`,
   first with `--dry-run`, then for real.
8. Import the CERN library again, without `--replace-catalog`, and generate
   previews.
9. Start everything, then check search and place parts in KiCad before
   people use it again.

Run the scripts in the backend image with
`docker compose run --rm --no-deps backend python <script> ...`, mounting a host
directory for the archive and reports. Each script prints its options with
`--help`. The reset removes only the catalog and its files; projects, other
database data and the environment file are kept. Rolling a populated new
catalog back to an older Prism is not supported; restore the backup instead.

To refresh only the CERN parts later:

```bash
docker compose run --rm --no-deps backend python scripts/reset_prism_catalog.py --cern-only --confirm RESET-PRISM-CERN-IMPORTS
```

Add `--dry-run` first to see the counts. Stop the backend and catalog worker
before the real run.
