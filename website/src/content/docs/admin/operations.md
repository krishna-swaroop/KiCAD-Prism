---
title: Operate Prism
description: Back up and restore a Prism installation, watch its capacity, and diagnose failed jobs and common faults.
sidebar:
  order: 9
---

This page is the day-to-day runbook: backups, restores, disk and memory, logs
and the faults you are most likely to meet. Upgrades have their own page,
[Upgrade Prism](/KiCAD-Prism/admin/upgrades/).

Run every command from the deployment directory, the one holding `compose.yml`
(release bundle) or `docker-compose.yml` (source build).

## What to keep

Four things hold work you cannot recreate:

| What | Where | Holds |
| --- | --- | --- |
| PostgreSQL | Docker volume `prism-postgres-data` | Users, roles, projects, comments, jobs, audit records and the component catalog. |
| Component files | `data/projects/.kicad-prism/components` | The symbols, footprints and 3D models the catalog points to. |
| Project storage | the rest of `data/projects` | Imported repositories. |
| Git identity | `data/ssh` | The SSH key your Git hosts trust. |

Also keep the environment file, the Caddy data volume (certificate authority
account and certificates; public authorities rate-limit reissuing), the
installer's `generated/` and `sites/`, and `data/secrets` on a source
deployment.

A database dump on its own is not a backup of Prism. Restored without the
component files, every part in the catalog points at a file that is not there.

Everything else under `.kicad-prism` (job outputs, design bundles, library
exports, validation runs) is rebuilt on demand. It is most of the bytes, and the
backup tool leaves it out.

## Back up

`scripts/prism_backup.py` captures everything above as one consistent set. It is
in the release bundle and in the source checkout, and needs only Python 3 and
Docker.

1. Create the archive:

   ```bash
   python3 scripts/prism_backup.py create
   ```

2. Check every file in it against its recorded checksum:

   ```bash
   python3 scripts/prism_backup.py verify prism-backup-<timestamp>.tar.gz
   ```

3. Encrypt the archive and move it off the host.

`create` stops `frontend`, `backend`, `prism-worker` and `catalog-worker`, leaves
PostgreSQL running, dumps the database and packs the files, then starts the
application again before it writes the final archive. The pause makes the
database and the files describe the same moment. It lasts as long as packing
project storage takes: seconds on a small installation, about 2 minutes per GB
of `data/projects` on Windows with Docker Desktop. Schedule it.

| Option | Effect |
| --- | --- |
| `--output <path>` | Where to write the archive. Files are staged beside it, so that disk needs about twice the archive's size free. |
| `--hot` | Skips the pause. Fine for a routine nightly copy, not before an upgrade. |
| `--root <dir>` | The deployment directory, when you run the tool from elsewhere. |
| `--env-file`, `--compose-file` | The environment and Compose files, when the tool cannot find them. |

The tool reads where `data/projects` and `data/ssh` really are from your Compose
files. They must be separate bind mounts inside the deployment directory; a
named volume, a mount elsewhere or one directory inside the other stops the
backup before anything is written.

The archive's manifest records the running images, the Prism release and
commit, the schema versions and a checksum of every file. The manifest holds no
secrets.

:::caution
The archive contains source repositories, SSH private keys, tokens and the
environment file as it is. Encrypt it and store it away from the host.
:::

On Windows, set `PYTHONUTF8=1` for full output. Docker Desktop keeps volumes
inside its own disk image, so check free space there as well as beside
`--output`.

## Restore

Practise a restore on an isolated host before you need one.

1. Install the release recorded in the backup into an empty directory.
2. Take the `env` file out of the archive and adapt it to the new host. Do not
   reuse a host name or certificate that the live installation still uses.
3. Start PostgreSQL alone:

   ```bash
   docker compose up -d postgres
   ```

4. Restore the archive:

   ```bash
   python3 scripts/prism_backup.py restore prism-backup-<timestamp>.tar.gz
   ```

5. Start everything:

   ```bash
   docker compose up -d --wait
   ```

6. Sign in, open a project, check comments and a comparison, search the
   Library Manager and place a part in KiCad.

`restore` replaces the database, project storage and SSH keys, and asks before
it does. It also puts back `data/secrets` and the Caddy data volume when the
archive has them. It leaves the environment file, `generated/` and `sites/`
alone unless you add `--with-config`, which writes the archived `generated/`
and `sites/` over yours. Leave that off when the new host needs a different
name or certificate, and run the installer again instead. `--yes` skips the
question.

`restore` refuses an archive whose schema is newer than the build you restore
into. On an empty database it cannot compare and warns instead; stop and check
before you continue. It unpacks into the deployment directory first, so that
disk needs room for the unpacked archive as well as the data it replaces.

### Restore tracker connections

Code host credentials are stored in the database, encrypted with
`TRACKER_CREDENTIAL_ROOT_KEY`, which lives only in the environment file. A
restored database can decrypt them only with the same key.

1. Put back the environment file from the same backup, or at least the same
   root key and key name, before you start `backend` and `prism-worker`.
2. After the restore, open each connection under **Settings → Code hosts** and
   click **Test connection**.
3. Check that each one shows **Ready** before people publish again.

With a wrong or missing key, local comments stay readable, the encrypted
credentials stay in the database, and the connection settings answer `503`
until the right key is back. Do not delete those credentials or reset the
database to get past it.

Changes that were already being sent when the backup was taken are never resent
blindly. Prism quarantines any whose outcome it cannot confirm, so a restore
does not create duplicate issues.

## Check the logs

```bash
docker compose ps
```

```bash
docker compose logs --tail=200 backend prism-worker catalog-worker
```

For a failed job, note its ID, kind, project or component and attempt logs,
along with the worker log, the Prism release and the project's commit, before
you retry it.

If an import finished but its thumbnail or project details did not, a
`designer` can retry just those steps:

```text
POST /api/projects/{project_id}/import-follow-ups/retry
```

It does not import the project again, and reuses work that is still running.

## Watch capacity

Watch:

- free disk on the host and in Docker;
- growth of the PostgreSQL volume and of `data/projects/.kicad-prism`;
- worker memory on your largest projects;
- jobs that stay queued or keep retrying;
- PostgreSQL connections against its limit.

### Design bundles

Every viewer reads a project's design bundle. An hourly pass on `prism-worker`
keeps the bundles of branch heads, each branch's newest commits, every tagged
commit and every released Release Studio commit, and removes the rest after
`PRISM_DESIGN_BUNDLE_RETENTION_DAYS` without use. It also trims the unpacked
copies to their size caps. Each pass logs a `Design bundle retention:` line with
its counts. The settings are under
[Design bundles](/KiCAD-Prism/admin/configuration/#design-bundles).

Plan about 47 MB per bundled revision of a large board (about 55 MB of
`.kicad_pcb`): twenty prebuilt revisions of one such design take about 1 GB,
plus its unpacked copy.

After a first deployment the worker does not rebuild every project at once. It
queues bundles as slots free up, newest commits first, one project at a time.

A bundle that fails in a KiCad step (zone refill, 3D export, upgrading an older
file) is retried, then marked failed. Viewers show the failure instead of
waiting. The next request after `PRISM_DESIGN_BUNDLE_FAILED_RETRY_SECONDS`
queues it again, and **Regenerate** on the 3D tab retries at once.

If a project's board or schematic can no longer be found through its project
file, set the paths in the project's settings. The next build picks them up.

Do not delete files under `.kicad-prism` by hand. Lower the retention settings
instead.

## Check library files

`scripts/check_catalog_asset_files.py` lists every component file that is
missing or whose content no longer matches the catalog:

```bash
docker compose run --rm --no-deps backend python scripts/check_catalog_asset_files.py
```

It groups problems as `placement_broken` (the released version of an active
part; KiCad placement fails), `history_broken` (older releases and retired
parts) and `draft_only`, and exits `1` while `placement_broken` is not empty.

To recover missing files, add `--restore` and one `--search <dir>` for each
place an exact copy may be, such as a volume backup, the source library or a
KiCad project's `RemoteLibrary` folder. Mount those directories into the
container. The command only reports until you add `--apply`. It writes only
inside the catalog store and never overwrites an existing file.

Daily maintenance moves a replaced, never-released draft STEP file to
`quarantine/` in the catalog store instead of deleting it, and deletes it after
`CATALOG_DRAFT_MODEL_QUARANTINE_DAYS`. Until then, `--restore --apply` moves it
back. Back up `quarantine/` with the rest of the store.

`scripts/report_unpinned_board_models.py` lists board footprints whose 3D model
still points at the shared remote-library folder instead of being embedded, so
a fresh clone of that project opens without it. It only reads. Place such a part
again in KiCad to embed its model.

## Common faults

### The frontend answers 502

Check `/api/health/ready` and the backend log. Usual causes: an invalid OIDC or
session setting (the log names it), PostgreSQL unreachable, or project storage
not writable.

### A release starts with the old version

Check `PRISM_BACKEND_IMAGE` and `PRISM_FRONTEND_IMAGE` in `.env`. Copying an old
environment file during an upgrade copies its old image digests too.

### Imported projects have disappeared

Check that you are in the right deployment directory and that `data/projects`
is mounted. Both the files and the database rows must be there.

### Sign-in loops

Check the OIDC redirect URIs, `PUBLIC_BASE_URL`, `CORS_ORIGINS_STR`, the proxy's
`Host` and `X-Forwarded-Proto` headers, and the server's clock.

### Jobs stay queued

Check that both workers are healthy and reach the same database. Read the worker
logs before you restart anything.

### Issue publishing has stopped

See [Troubleshooting](/KiCAD-Prism/admin/issue-trackers/#troubleshooting) for
issue trackers.

### Release Studio refuses to publish

Check that `GITHUB_TOKEN` or `GITLAB_TOKEN` is set with write access, that the
repository's remote is GitHub or a known GitLab host, and that the tag is not
already used. Tags are never overwritten. See
[Release Studio](/KiCAD-Prism/admin/configuration/#release-studio).

### A part cannot be placed in KiCad

Run the library file check above, and check that
`/.well-known/kicad-remote-provider` shows your public `https://` address.

### The disk is full

Stop imports and generation. Back up PostgreSQL and the component files before
you remove anything. Lower the retention settings rather than deleting
directories.
