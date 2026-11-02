---
title: Try it on your machine
description: Run a private, single-user Prism from a release bundle and import your first project.
sidebar:
  order: 2
---

This guide runs Prism on your own computer, without sign-in, so you can import
a project and look around. It takes about ten minutes plus the image download.

:::caution
This setup turns sign-in off and gives every visitor the same role. Use it only
on a machine nobody else can reach. A shared installation needs sign-in and
HTTPS: follow [Deployment](/KiCAD-Prism/admin/deployment/).
:::

## What you need

- Docker with Compose v2.
- A Linux AMD64 host, or Docker Desktop on macOS or Windows. The published
  images are AMD64 only; on Apple Silicon Docker Desktop emulates them, which
  works but is slower.
- Enough memory for KiCad's tools. Large boards take a few minutes and several
  gigabytes the first time Prism reads them.
- A KiCad project in a Git repository Prism can clone. A public repository is
  the easiest start.

## Start Prism from a release bundle

1. Open the
   [latest release](https://github.com/krishna-swaroop/KiCAD-Prism/releases/latest)
   and download `kicad-prism-<version>-linux-amd64.tar.gz` and its `.sha256`
   file.
2. Check the download:

   ```bash
   sha256sum -c kicad-prism-<version>-linux-amd64.tar.gz.sha256
   ```

3. Unpack it:

   ```bash
   tar -xzf kicad-prism-<version>-linux-amd64.tar.gz
   ```

4. Go into the folder and check its contents:

   ```bash
   cd kicad-prism-<version>-linux-amd64
   ```

   ```bash
   sha256sum -c SHA256SUMS
   ```

5. Create your settings file:

   ```bash
   cp .env.example .env
   ```

6. Edit `.env` and set these values:

   ```env
   POSTGRES_PASSWORD=<a random local password>
   AUTH_ENABLED=false
   DEV_GUEST_ROLE=designer
   ```

   `DEV_GUEST_ROLE` is the role every visitor gets. `viewer` can only look;
   `designer` can also import projects, sync them and run jobs. Release Studio
   needs a designer and a QA sign-off, so to try a whole release on your own
   set `admin`, which may sign both slots with a written override.

7. Pull the images:

   ```bash
   docker compose pull
   ```

8. Start Prism and wait for every service to report healthy:

   ```bash
   docker compose up -d --wait
   ```

9. Open [http://127.0.0.1:8080](http://127.0.0.1:8080).

The bundle publishes Prism on `127.0.0.1` only, so other machines cannot reach
it. Leave `PUBLIC_BASE_URL` empty for this trial: when it names an address
other machines can reach, Prism refuses to start without sign-in if that
address is HTTPS or the guest role is `admin`.

## Check that it is running

The bundle starts five containers: `kicad-prism-postgres`,
`kicad-prism-backend`, `kicad-prism-worker`, `kicad-prism-catalog-worker` and
`kicad-prism-frontend`.

1. List them:

   ```bash
   docker compose ps
   ```

2. Check the web server:

   ```bash
   curl -fsS http://127.0.0.1:8080/healthz
   ```

3. Check that the API and database are ready:

   ```bash
   curl -fsS http://127.0.0.1:8080/api/health/ready
   ```

## Import your first project

1. In the workspace, select **Import Project**.
2. Paste the repository's HTTPS or SSH clone URL into **Repository** and
   select **Analyze**.
3. Wait while Prism clones the repository and looks for KiCad projects.
4. Pick the **Branch**, select the projects to import, and select **Import**.
5. When the import finishes, open the project.

The project page has **Overview**, **History**, **Visualizers**,
**Workflows**, **Release Studio**, **Assets Portal** and **Documentation**.
Start with **Visualizers** for the schematic, PCB and 3D views, then try
**History** to compare two commits.

The first time a revision opens you may see **Preparing design data…** while
Prism reads it. See [Design data](/KiCAD-Prism/use/design-data/).

For a private repository, add Prism's SSH key to the Git host first. See
[Projects](/KiCAD-Prism/use/projects/).

## Stop or reset

Stop Prism and keep its data:

```bash
docker compose down
```

Imported repositories and generated files stay in `data/projects`, and Prism's
SSH key in `data/ssh`, next to the Compose file. The database lives in a Docker
volume.

:::caution
`docker compose down --volumes` deletes the database: every comment, role,
catalog component and job record. Add `--volumes` only when you mean to start
over.
:::

## Troubleshooting

### The page shows 502 Bad Gateway

The frontend is up but the API is not. Read the API and database logs:

```bash
docker compose logs --tail=200 backend postgres
```

### The backend stops at startup

With sign-in on, Prism refuses to start until a sign-in method, a session
secret and the database are configured. For this private trial, check that
`.env` sets `AUTH_ENABLED=false`.

### Pulling the images fails

Check the image references the bundle uses:

```bash
docker compose config --images
```

The bundle pins exact image digests. Don't replace them with `latest` to get
past a registry error.

### Everything is slow on a Mac

Check the architecture Docker reports:

```bash
docker info --format '{{.Architecture}}'
```

Anything other than `x86_64` means the images run under emulation. That is
fine for a trial; use an AMD64 Linux host for a team.

## Run unreleased code instead

To try what is on the `dev` branch, build from source. See
[Development setup](/KiCAD-Prism/contribute/development-setup/). Don't run `dev`
as your team's service: it changes between releases.

## Next steps

- [Concepts](/KiCAD-Prism/get-started/concepts/): what projects, revisions,
  jobs and roles mean in Prism.
- [Roll it out to a team](/KiCAD-Prism/get-started/team-adoption/).
- [Deployment](/KiCAD-Prism/admin/deployment/) for a shared installation.
