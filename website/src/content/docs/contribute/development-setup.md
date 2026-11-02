---
title: Development setup
description: Get a working Prism checkout on macOS, Linux or Windows, run it, and run the checks a pull request needs.
sidebar:
  order: 1
---

This page takes you from a fresh clone to a running Prism you can change, on
macOS, Linux or Windows, and lists the checks each part of the code needs
before you open a pull request.

## Before you start

- Search the [issues](https://github.com/krishna-swaroop/KiCAD-Prism/issues)
  and [discussions](https://github.com/krishna-swaroop/KiCAD-Prism/discussions)
  for the change you have in mind.
- Discuss large features, schema changes, API breaks and workflow redesigns
  before you write them.
- During an announced feature freeze, ask a maintainer before changing
  behavior, a schema, an API or a deployment file.
- Report a vulnerability privately, never in an issue. See
  [Report a problem](/KiCAD-Prism/contribute/reporting-issues/).

If you work with a coding agent, point it at `AGENTS.md` in the repository
root. It maps the code and links task playbooks; this page stays the authority
on branches, checks and pull requests.

## Branches

`dev` and `main` are protected. Every change reaches `dev` through a pull
request whose **Quality gate** passes. `main` only moves when a maintainer
promotes a tested `dev`; see [Release process](/KiCAD-Prism/contribute/release-process/).

1. Clone the repository on `dev`:

   ```bash
   git clone --branch dev https://github.com/krishna-swaroop/KiCAD-Prism.git
   ```

2. Before each new piece of work, bring `dev` up to date:

   ```bash
   git switch dev
   ```

   ```bash
   git pull --ff-only origin dev
   ```

3. Start a branch with one purpose:

   ```bash
   git switch -c fix/short-description
   ```

Use the prefixes `fix/`, `feature/`, `docs/`, `ci/`, `refactor/`, `test/` or
`release/`. Keep a cleanup or refactor out of a bug fix: separate branches are
easier to review and to roll back.

## Install the tools

| Tool | Version | Used for |
| --- | --- | --- |
| Docker with Compose v2 | current | the full stack, PostgreSQL for tests |
| Python | exactly the one in `.python-version` | backend, workers, scripts |
| [uv](https://docs.astral.sh/uv/) | current | creates the backend environment |
| Node.js | exactly the one in `.node-version` | frontend and semantic viewer |
| npm | the `packageManager` version in `frontend/package.json` | both JavaScript workspaces |
| Rust (rustup) | pinned by `native/rust-toolchain.toml`; rustup picks it up | the KiCad parser, `native/` |
| KiCad 10 | | only for running the backend outside Docker |

Then install every dependency from the lock files:

```bash
python scripts/sync_dependencies.py
```

This recreates `backend/venv` from `requirements/runtime.lock` and runs
`npm ci` in `frontend/` and `kicad-prism-viewer/`. It stops if your Python,
Node or npm version is not the pinned one. Add `--python-only` or
`--node-only` to do one side. See
[Dependencies](/KiCAD-Prism/contribute/dependencies/) before you add or update
a package.

## Run the full stack in Docker

This is the simplest way to see your change in a real Prism, and it works the
same on every host.

1. Create your settings file:

   ```bash
   cp .env.example .env
   ```

2. Turn sign-in off for local work. In `.env`, set:

   ```env
   AUTH_ENABLED=false
   DEV_GUEST_ROLE=admin
   UVICORN_WORKERS=1
   ```

3. Build and start every service:

   ```bash
   docker compose up --build -d
   ```

4. Open [http://127.0.0.1:8080](http://127.0.0.1:8080).

The images are built for Linux AMD64 on top of the official KiCad image. On
Apple Silicon and Windows on ARM, Docker emulates AMD64, so builds and KiCad
jobs are slower.

:::caution
The source Compose file publishes the web app on port 8080 and the API on port
8000 on every network interface, not only on `127.0.0.1`. With sign-in off,
anyone who can reach your machine on those ports is an admin. Work on a
trusted network or put a firewall in front of them.
:::

Rebuild the backend after a backend change:

```bash
docker compose up --build -d backend prism-worker catalog-worker
```

Stop the stack without losing data:

```bash
docker compose down
```

## Work on the frontend with hot reload

The Vite dev server proxies `/api`, `/oauth`, `/remote-provider` and
`/.well-known` to `http://127.0.0.1:8000`, where the Docker stack's API
listens.

1. With the Docker stack running, start the dev server:

   ```bash
   cd frontend
   ```

   ```bash
   npm run dev
   ```

2. Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

The KiCad panel for the Remote Symbol Provider is a separate app:
`npm run dev:panel`. KiCad opens the panel the API serves, not the dev
server's; with the backend on your host, build it as in step 7 of
[Run the backend on your host](#run-the-backend-on-your-host).

## Run the backend on your host

Run the API and workers outside Docker when you work on design data, KiCad
tooling or the worker, or when your host is not AMD64 and emulation is too
slow. You need KiCad 10 installed, and Prism's own KiCad parser, `prism-kicad`.

:::caution
A backend running on your host uses your own `~/.ssh` directory as Prism's SSH
directory, and its Git key is `~/.ssh/id_ed25519`. Don't generate or replace
Prism's SSH key from **Settings** on a host run unless you mean to change your
own key.
:::

1. Build `prism-kicad`:

   ```bash
   cd native
   ```

   ```bash
   cargo build --release -p prism-kicad-cli
   ```

   Put `native/target/release` on your `PATH`, or set
   `PRISM_DESIGN_BUNDLE_CLI_PATH` to the binary. On Windows, see
   [Windows hosts](#windows-hosts) for the other ways to build it.

2. Start a throwaway PostgreSQL that the host can reach:

   ```bash
   docker run -d --name prism-dev-postgres -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=kicad_prism -p 127.0.0.1:5432:5432 postgres:17-alpine
   ```

3. Create `backend/.env` with at least:

   ```env
   PRISM_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kicad_prism
   AUTH_ENABLED=false
   DEV_GUEST_ROLE=admin
   ```

   The backend reads `.env` from the directory it starts in. Imported projects
   and Prism's state go to `data/projects` in the repository unless you set
   `KICAD_PROJECTS_ROOT`.

4. Start the API from `backend/`:

   ```bash
   venv/bin/python -m uvicorn app.main:app --port 8000
   ```

5. In a second terminal, start the project worker from `backend/`:

   ```bash
   venv/bin/python -m app.prism_worker
   ```

6. In a third terminal, start the catalog worker from `backend/`:

   ```bash
   venv/bin/python -m app.prism_worker --pool catalog
   ```

7. Build the Remote Symbols panel the API serves to KiCad, from `frontend/`:

   ```bash
   npm run build:panel
   ```

   Then copy the build to where the API serves it from:

   ```bash
   mkdir -p ../backend/app/static
   ```

   ```bash
   rm -rf ../backend/app/static/remote_provider
   ```

   ```bash
   cp -R dist/remote_provider ../backend/app/static/remote_provider
   ```

   The Docker image does this when it is built; a host run doesn't, and
   `/remote-provider/panel` answers 500 until the folder is there. Git ignores
   it. Build and copy again after changing the panel.

8. Start the frontend dev server as in
   [Work on the frontend with hot reload](#work-on-the-frontend-with-hot-reload).

On Windows the interpreter is `venv\Scripts\python.exe`.

### How Prism finds KiCad

| Host | `kicad-cli` | KiCad's Python (zone refill, board upgrades) |
| --- | --- | --- |
| macOS | `PATH`, then `/Applications/KiCad/KiCad.app` and `~/Applications/KiCad/KiCad.app` | the Python inside `KiCad.app` |
| Linux | `PATH`, then `/usr/bin/kicad-cli` and `/usr/local/bin/kicad-cli` | `/usr/bin/python3`, which must import `pcbnew` |
| Windows | `PATH`, then the newest `%ProgramFiles%\KiCad\<version>\bin\kicad-cli.exe` | `python.exe` next to `kicad-cli.exe` |

Set `KICAD_CLI_PATH` or `PRISM_KICAD_PYTHON` to override either. See
[Configuration](/KiCAD-Prism/admin/configuration/).

Release Studio's PDF documents need the Cairo library. On macOS, install it
with Homebrew; Prism looks in the usual Homebrew folders. On Windows Prism
loads `cairo-2.dll` from KiCad's `bin` folder. Set `PRISM_CAIRO_LIBRARY_DIR`
for any other location.

Some parts of the worker image are not on a host run unless you add them: the
Geometer runtime (`GEOMETER_EXECUTABLE`), without which design data has no
hidden-line views of the parts, and Simulation Studio's engines.

## Windows hosts

Prism runs as a development stack on Windows, either in Docker Desktop or with
the backend on the host. A few Windows behaviors matter:

- **Line endings.** Git for Windows checks files out with CRLF by default, but
  Prism's fixtures and its revision keys depend on the committed bytes. Clone
  Prism itself with LF line endings:

  ```bash
  git clone -c core.autocrlf=false --branch dev https://github.com/krishna-swaroop/KiCAD-Prism.git
  ```

  Every repository Prism clones gets `core.autocrlf=false` in its own
  configuration. When the backend starts on Windows, it checks out once more
  any project clone made with CRLF, in the background. Clones that use Git LFS
  are left alone.
- **Symbolic links.** Release Studio recreates symbolic links that are
  committed in a project. Windows only allows that with
  [Developer Mode](https://learn.microsoft.com/windows/apps/get-started/enable-your-device-for-development)
  turned on; without it the build fails and says so.
- **Stopping tools.** Prism runs KiCad and Git in their own process group and
  ends the whole tree on a timeout or cancel, so nothing outlives its job.

### Build prism-kicad.exe

There are two ways:

- **With Visual Studio Build Tools** (the MSVC toolchain), build as on any
  host: `cargo build --release -p prism-kicad-cli` in `native/`. This is the
  build the CI tests on Windows.
- **Without Visual Studio**, build the GNU target in the pinned Rust Docker
  image from Git Bash:

  ```bash
  native/scripts/windows_gnu_container.sh win cargo build --locked --release --target x86_64-pc-windows-gnu -p prism-kicad-cli
  ```

  Then copy the binary out to a folder of your choice:

  ```bash
  native/scripts/windows_gnu_container.sh export <folder>
  ```

The same script runs the native checks for Windows from any host with Docker:

| Mode | Runs |
| --- | --- |
| `linux` | the command in the Linux image, to confirm a change did not alter Linux |
| `win` | the command with the Windows GNU target installed, such as `cargo clippy --locked --target x86_64-pc-windows-gnu --all-targets -- -D warnings` |
| `wine` | the Windows test executables under Wine, such as `cargo test --locked --target x86_64-pc-windows-gnu -p prism-bundle -p prism-kicad-cli` |

The script works on a copy of the tree. The Wine run covers the file, path and
process code; tests that need a real `git.exe`, Windows job objects or console
events only run on a Windows host or in CI.

## Run the checks

The **Quality gate** runs on every pull request into `dev` or `main`. On a pull
request it skips the jobs your changed files cannot affect; pushes and the
nightly run run everything. Run the checks for the areas you changed before you
push.

### Frontend

From `frontend/`:

```bash
npm run lint
```

```bash
npm run scan:gate
```

```bash
npm test
```

```bash
npm run build
```

```bash
npm run build:panel
```

`scan:gate` compares React Doctor's findings with the committed baseline:
errors always fail, and the warning count may shrink but never grow.
`npm run build` type-checks the whole project with `tsc -b` before it bundles.

### Backend

From `backend/`, run the suite in parallel:

```bash
uv run --no-project --python venv/bin/python --with-requirements ../requirements/test.txt python -m pytest -n auto
```

The test tools are pinned in `requirements/test.txt`, outside the runtime
lock; `uv` layers them over `backend/venv` without changing it. Don't install
them into the venv.

While you iterate, add `--testmon` to run only the tests your change affects.
It sees Python changes only, so run the whole suite before you open a pull
request.

The suite needs PostgreSQL. Set `PRISM_DATABASE_URL`, plus
`TEST_POSTGRES_URL` and `LEGACY_SURVIVOR_TEST_POSTGRES_URL` for the catalog
integration suites, each pointing at its own disposable database. Each pytest
worker makes its own copy of them. Never point the tests at a database you
care about: they drop and rebuild schemas.

Tests get scratch schemas and Git repositories from `backend/tests/support/`.
A test module that drops schemas, copies a production table or runs Git with
its own identity fails `tests/test_test_support.py`.

### Semantic viewer

From `kicad-prism-viewer/`:

```bash
npm run test:viewer
```

```bash
npm run test:harness
```

```bash
npm run build
```

The build also refreshes the served copies in `frontend/public/`. Commit
them: CI fails when they don't match the source.

### Native parser (`native/`)

From `native/`:

```bash
cargo fmt --all --check
```

```bash
cargo clippy --workspace --all-targets -- -D warnings
```

```bash
cargo test --workspace
```

```bash
cargo run -p prism-kicad-codegen -- --check
```

```bash
cargo deny check licenses sources
```

```bash
scripts/rust_hygiene.sh
```

The hygiene script holds file size and complexity to a committed baseline: no
new violations.

- A change to a contract (`native/src/tsp/prism/`, `native/contracts/`) also
  runs `node scripts/contracts/check-contract.mjs` from `native/`.
- A change to what a design data member contains runs the parity checks in
  `native/parity/AGENTS.md`. A deliberate output change updates that member's
  golden in the same pull request.
- After changing a crate the 3D viewer compiles, rebuild its WebAssembly with
  `npm run build:analytic-wasm` in `kicad-prism-viewer/`.

### Compose files

From the repository root:

```bash
docker compose --env-file .env.example -f docker-compose.yml config --quiet
```

```bash
docker compose --env-file .env.example -f docker-compose.yml -f docker-compose.proxy.yml config --quiet
```

A change to the release bundle also runs:

```bash
python3 -m unittest scripts.test_release_bundle
```

```bash
POSTGRES_PASSWORD=ci-release-validation PRISM_ENV_FILE=.env.example docker compose --env-file deploy/release/.env.example -f deploy/release/compose.yml config --quiet
```

## Benchmark Supply at scale

Build a frozen, synthetic Supply library in its own database, then measure the
Supply pages and the housekeeping worker against it. The same parameters and
seed produce the same parts, listings and BOMs, with stock history relative to
the run day, so two commits can be compared.

1. Create a database whose name starts with `bench_`:

   ```bash
   psql "postgresql://ci:ci@127.0.0.1:55432/postgres" -c "CREATE DATABASE bench_supply_dev"
   ```

2. From `backend/`, seed it. The defaults are 20,000 parts and 50 projects;
   `--parts` and `--projects` make a smaller first run:

   ```bash
   PYTHONPATH=$PWD python ../scripts/benchmark_supply.py seed --database-url "postgresql://ci:ci@127.0.0.1:55432/bench_supply_dev" --parts 2000 --projects 5
   ```

3. Run the benchmark. It writes `loadtest/results/supply-benchmark.json` and
   prints a Markdown table:

   ```bash
   PYTHONPATH=$PWD python ../scripts/benchmark_supply.py run --database-url "postgresql://ci:ci@127.0.0.1:55432/bench_supply_dev" --repeats 5
   ```

4. To include browser heap and DOM size, start Prism with sign-in off, then
   pass its URL and the Chrome executable. The pages show whatever database
   that Prism reads; point it at the bench database to measure the browser at
   scale:

   ```bash
   PYTHONPATH=$PWD python ../scripts/benchmark_supply.py run --database-url "postgresql://ci:ci@127.0.0.1:55432/bench_supply_dev" --browser-url http://localhost:5173 --chrome "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
   ```

The report records the fixture parameters, the Git commit, the machine, and for
each read model the cold latency, the warm p50, p95 and max, the SQL statements
per run, and the process's peak RSS so far (it only grows, so the scenario that
raises it is the one that needed the memory). It also records the housekeeping
worker's wall time and peak RSS, and each Supply page's `JSHeapUsedSize`,
`Nodes` and `LayoutCount` when a browser URL is given.

Housekeeping writes (it compacts readings and keeps snapshots), so the worker
runs on a throwaway copy of the bench database (`CREATE DATABASE … TEMPLATE`),
dropped afterwards. The fixture stays as seeded, run after run.

Both subcommands refuse a database whose name does not start with `bench_`.
The script never signs in, and it never touches an application database.
Seeding the same database twice refuses instead of doubling the data.

## Rules for code changes

- Follow the conventions of the code around you.
- Add or update tests for the behavior you change.
- Take audit identity from the signed-in user, never from a name in the
  request.
- Decide who may do what only in `backend/app/core/policy.py`. After changing
  it, regenerate the frontend's copy with `python3 scripts/export_role_matrix.py`.
- Change catalog workflow stages, transitions or role rights only in
  `backend/app/services/catalog/workflow_policy.py`, then run
  `python3 scripts/export_workflow_policy.py`. The backend suite fails while
  the generated file is stale.
- Use the existing API helpers in the frontend rather than a new direct
  `fetch`.
- Don't edit minified or generated files by hand. `frontend/public/ecad-viewer.js`
  is built from the separate `ecad-viewer` repository.
- Keep generated files, secrets, local databases, certificates and private
  design data out of Git.
- Break compatibility only on purpose, and say so in the pull request.
- Update the documentation in the same pull request. See
  [Write documentation](/KiCAD-Prism/contribute/writing-docs/).

## Open a pull request

Check before you open it:

- The branch holds one coherent change and targets `dev`.
- The description says what the problem was, what you changed, and what users
  will notice.
- Tests cover the change, and the checks for every area you touched pass.
- Documentation and configuration examples are current.
- No secrets, private designs, builds or caches are included.
- A breaking change, or any change during a feature freeze, has a maintainer's
  approval.

Keep the branch current with `dev` until it merges. Be precise and respectful
in review, and keep the discussion on the code.
