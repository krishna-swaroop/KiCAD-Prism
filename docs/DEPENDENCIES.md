# Dependency identity

Prism deliberately has one Python runtime identity and two independently
locked JavaScript workspaces. Hosts, CI, and Docker must not resolve different
versions from the same source declarations.

## Runtime versions

- `.python-version` selects the exact Python patch release used by host tools,
  CI, and Docker.
- `.node-version` selects the exact Node patch release used by both JavaScript
  workspaces and Docker.
- `frontend/package.json` and `kicad-prism-viewer/package.json` record the npm
  version and reject unsupported runtime lines.

Run the identity check after selecting those runtimes. It rejects an incorrect
Python, Node, or npm version and any missing, mismatched, or extra distribution
in the Python environment:

```bash
backend/venv/bin/python scripts/verify_dependency_identity.py
```

## Python ownership

`requirements/runtime.in` is the only place to add a direct Python runtime
dependency. `requirements/runtime.lock` is the complete, resolved graph used by
the API, workers, Release Studio, and semantic viewer.

The historical `backend/requirements.txt` and
`kicad-prism-viewer/requirements-runtime.txt` files are compatibility aliases
to that same lock. They must not contain their own packages or pins.

To update and reproduce the Python graph:

```bash
python scripts/sync_dependencies.py --update-lock --python-only
```

Review the lock diff, especially the coordinated `kicad-monkey` and
`kicad-cruncher` versions, then run backend and semantic-viewer tests. The sync
recreates `backend/venv`; this is intentional so an older host environment
cannot retain undeclared packages.

Release Studio's PDF conversion also needs the native Cairo library. On macOS,
install it with Homebrew. Prism locates the normal Apple Silicon and Intel
Homebrew paths for uv's portable Python; set `PRISM_CAIRO_LIBRARY_DIR` only for
a nonstandard installation.

## JavaScript ownership

Each JavaScript workspace owns its `package.json` and `package-lock.json`. Use
the Node version in `.node-version` and npm version in each package manifest.
Install with `npm ci`; do not depend on packages left in an existing
`node_modules` directory.

```bash
python scripts/sync_dependencies.py --node-only
```

Major framework upgrades are reviewed separately from routine lock refreshes.

## Local KiCad toolchain development

The normal image always uses the published Monkey/Cruncher pair in the Python
lock. To test unpublished upstream work, provide a modern `kicad_monkey`
monorepo checkout containing both the root Monkey package and
`packages/kicad_cruncher`:

```bash
KICAD_TOOLCHAIN_CONTEXT=/absolute/path/to/kicad_monkey \
  docker compose -f docker-compose.yml \
  -f docker-compose.local-kicad-monkey.yml build backend
```

The local target reinstalls both packages together, validates their dependency
graph, and records `PRISM_KICAD_MONKEY_SOURCE=local-monorepo`. Older standalone
Monkey checkouts fail the image preflight instead of silently combining their
code with whichever Cruncher happens to be installed.

Python source discovery is explicit. `KICAD_MONKEY_PYTHONPATH` may be used for
specialized host experiments, but Prism no longer searches adjacent checkouts
or legacy `references/` directories automatically.

## Native PCB geometry helper

The optional Rust PCB backend is a separate, source-built runtime identity.
`kicad-prism-viewer/native/prism-kicad-native/rust-toolchain.toml` pins Rust,
`Cargo.toml` pins the exact `kicad_monkey` Git revision, and `Cargo.lock` pins
the complete Rust graph. Docker builds it with `cargo build --release --locked`
and copies only the helper binary into the final worker image.

Do not replace the Git revision with a branch, depend on an unpromoted packaged
Linux provider, or copy an unverified local binary into Docker. See
`docs/PCB_RUST_GEOMETRY.md` for the contract and rollback policy.
