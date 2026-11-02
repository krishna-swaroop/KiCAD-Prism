---
title: Dependencies
description: How Prism pins its Python, JavaScript, Rust and binary dependencies, and how to add or update one.
sidebar:
  order: 5
---

Prism resolves every dependency once and installs exactly that everywhere:
on your machine, in CI and in the Docker images. This page says where each
kind of dependency is declared and how to change one.

| Kind | Declared in | Locked in |
| --- | --- | --- |
| Python runtime version | `.python-version` | |
| Node.js version | `.node-version` | |
| npm version | `packageManager` and `engines` in each `package.json` | |
| Python packages | `requirements/runtime.in` | `requirements/runtime.lock` |
| Python test tools | `requirements/test.txt` | the same file, pinned |
| Frontend packages | `frontend/package.json` | `frontend/package-lock.json` |
| Semantic viewer packages | `kicad-prism-viewer/package.json` | `kicad-prism-viewer/package-lock.json` |
| Rust toolchain | `native/rust-toolchain.toml` | |
| Rust crates | `native/Cargo.toml` and the crates' manifests | `native/Cargo.lock` |
| Binary tools in the worker image | `backend/Dockerfile`, `backend/sim-engines.lock.json` | version and SHA-256 in the same files |

## Check your environment

After selecting the pinned Python and Node versions, run:

```bash
python scripts/sync_dependencies.py
```

It rebuilds `backend/venv` from the lock and runs `npm ci` in both JavaScript
workspaces. It refuses to run with the wrong Node version.

To check an existing environment without changing it:

```bash
backend/venv/bin/python scripts/verify_dependency_identity.py
```

It fails on the wrong Python, Node or npm version, and on any Python package
that is missing, at a different version, or not in the lock.

## Python

`requirements/runtime.in` is the only place to add a direct Python dependency.
`requirements/runtime.lock` is the complete resolved graph that the API, the
workers and Release Studio all use. `backend/requirements.txt` only points at
the lock; never add packages to it.

Test tools such as pytest, pytest-xdist and pytest-testmon are pinned in
`requirements/test.txt`, outside the runtime lock. `uv` layers them over the
venv when you run the tests; don't install them into `backend/venv`.

### Update every package

1. Re-resolve the lock with the newest allowed versions and rebuild the venv:

   ```bash
   python scripts/sync_dependencies.py --update-lock --python-only
   ```

2. Review the lock diff, especially the `kicad-monkey` version.
3. Run the backend and semantic viewer tests.

### Add one package

`--update-lock` upgrades every package in the lock. To add a package without
moving the others:

1. Add it to `requirements/runtime.in`, with a comment saying why Prism needs
   it.
2. Re-resolve the lock without upgrading, using the Python version in
   `.python-version`:

   ```bash
   uv pip compile requirements/runtime.in --output-file requirements/runtime.lock --python-version "$(cat .python-version)" --universal --custom-compile-command "python scripts/sync_dependencies.py --update-lock"
   ```

3. Rebuild the venv from the new lock:

   ```bash
   python scripts/sync_dependencies.py --python-only
   ```

4. Check that the lock diff adds only your package and what it needs.

The sync always recreates `backend/venv`, so a package you installed by hand
never survives it.

### Native libraries

Release Studio's PDF documents need the Cairo library. On macOS, install it
with Homebrew; Prism finds the standard Apple Silicon and Intel Homebrew
folders. On Windows it uses `cairo-2.dll` from KiCad's `bin` folder. Set
`PRISM_CAIRO_LIBRARY_DIR` for any other location.

### kicad-monkey

The published `kicad-monkey` package reads the catalog's library files
(`.kicad_sym`, `.kicad_mod`). Project revisions are read by Prism's own parser,
`prism-kicad`, not by `kicad-monkey`. Prism never picks up a neighboring
checkout of it.

To test unreleased `kicad-monkey` work in the image, point the local override
at a `kicad_monkey` monorepo checkout:

```bash
KICAD_TOOLCHAIN_CONTEXT=/absolute/path/to/kicad_monkey docker compose -f docker-compose.yml -f docker-compose.local-kicad-monkey.yml build backend
```

The build reinstalls `kicad-monkey` from that checkout and validates the
dependency graph. An old standalone checkout fails the build instead of being
mixed with the published package.

## JavaScript

`frontend/` and `kicad-prism-viewer/` each own their `package.json` and
`package-lock.json`. Install with `npm ci`, never by relying on whatever is
already in `node_modules`:

```bash
python scripts/sync_dependencies.py --node-only
```

Review a major framework upgrade in its own pull request, separate from routine
lock refreshes.

## Rust

`native/` is Prism's KiCad parser and design-data tool, `prism-kicad`.

- `native/rust-toolchain.toml` pins the Rust version. The image's build stage
  uses the same version.
- `native/Cargo.lock` is the complete crate graph. The image build fails if it
  would build any crate version that is not already in the lock.
- `cargo deny check licenses sources` (configured in `native/deny.toml`) runs
  in CI and rejects crates with a disallowed licence or source.
- `geometer-client` is vendored in `native/third_party/`, so building the
  workspace clones nothing.

## Binary tools in the worker image

The worker image installs these beside `prism-kicad`, each pinned by version
and SHA-256:

- **the Geometer runtime** (pinned in `backend/Dockerfile`), which the design data's `models` stage runs for
  the parts' hidden-line views;
- **Simulation Studio's engines**, from a private release pinned in
  `backend/sim-engines.lock.json`. The build reads a
  token from the BuildKit secret `prism_sim_release_token`, which Compose
  takes from `PRISM_SIM_RELEASE_TOKEN`. Without a token the image builds
  without the engines; Simulation Studio is off by default anyway.

The KiCad base image itself is pinned by digest in `docker-compose.yml` and
`backend/Dockerfile`.
