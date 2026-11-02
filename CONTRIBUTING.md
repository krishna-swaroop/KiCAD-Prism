# Contributing to KiCAD Prism

Thank you for helping improve KiCAD Prism. Contributions should be small enough
to review, backed by the relevant checks, and honest about current product
behavior.

## Before starting

- Search [issues](https://github.com/krishna-swaroop/KiCAD-Prism/issues) and
  [discussions](https://github.com/krishna-swaroop/KiCAD-Prism/discussions).
- Report bugs with the repository issue form.
- Discuss large features, schema changes, API breaks, or workflow redesigns
  before implementation.
- If you use a coding agent, start it at [AGENTS.md](AGENTS.md). The scoped maps
  and task playbooks reduce repository-wide context loading; this contributing
  guide remains the authority for branch, test, and pull-request policy.
- During an announced feature freeze, obtain maintainer approval before starting
  behavior, schema, API, or deployment-contract changes.
- Never use a public issue for a vulnerability. Read [SECURITY.md](SECURITY.md).

## Branches and pull requests

The `dev` and `main` branches are protected. Normal changes target `dev` through
a pull request whose required quality gate passes. Only reviewed release
promotion moves tested `dev` into `main`.

Start from current `dev` and use one purpose per branch:

```bash
git switch dev
git pull --ff-only origin dev
git switch -c fix/short-description
```

Common prefixes are:

- `fix/`
- `feature/`
- `docs/`
- `ci/`
- `refactor/`
- `test/`
- `release/`

Do not combine an unrelated cleanup with a bug fix. Separate branches make
review, rollback, and alpha stabilization safer.

## Development setup

Prism uses the exact runtimes in `.python-version` and `.node-version`. Install
`uv`, select the declared Node version, and reproduce both dependency trees
from the repository locks:

```bash
python scripts/sync_dependencies.py
```

The command recreates `backend/venv` from `requirements/runtime.lock` and runs
`npm ci` for both JavaScript workspaces. Use `--python-only` or `--node-only`
when working on one side. See [Dependency identity](website/src/content/docs/contribute/dependencies.md)
before adding or updating a package.

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

Checks:

```bash
npm run lint
npm test
npm run build
npm run build:panel
```

### Backend

```bash
cd backend
uv run --no-project --python venv/bin/python --with-requirements ../requirements/test.txt \
  python -m pytest -n auto
```

This is the CI command (CI splits it over three runners with `--shard k/3`). pytest
runs the `unittest` suite in parallel, each worker on its own copy of the test
databases (`backend/tests/conftest.py`). The
test tools are pinned in `requirements/test.txt`, outside the runtime lock, so
`uv` layers them over the backend venv without changing it.

Add `--testmon` while iterating: it records which code each test runs and, on
the next run, runs only the tests affected by your changes (seconds instead of
minutes). It sees Python changes only, so run the full suite before you open a
pull request.

PostgreSQL integration tests use `TEST_POSTGRES_URL` and, for the catalog
epoch-2 cutover, `LEGACY_SURVIVOR_TEST_POSTGRES_URL`. Use disposable test
databases; do not point either suite at a production database.

Tests get their schemas and repositories from `backend/tests/support/`:
`support.postgres` hands out a scratch schema migrated by the production
ledgers (dropped after the test) plus seed rows, and `support.repo` makes Git
repositories with a fixed author. `tests/test_test_support.py` fails if a test
module writes its own `DROP SCHEMA`, copies a production table, or runs Git
with its own identity.

### Semantic viewer

```bash
cd kicad-prism-viewer
npm ci
npm run test:viewer
npm run test:harness
npm run build
```

### Native parser and design bundle (Rust)

When `native/` changed (see `native/AGENTS.md`):

```bash
cd native
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo run -p prism-kicad-codegen -- --check
cargo deny check licenses sources
scripts/rust_hygiene.sh    # size/complexity ratchet; no new violations
```

A change to a contract (`native/src/tsp/prism/`, `native/contracts/`) also runs
`node scripts/contracts/check-contract.mjs` (Node 24.22.0). A change to a bundle
member's output runs the parity checks from `native/parity/` (`python3 -m
unittest discover -s tests`, `python3 -m prism_parity selftest`, and
`node parity/validate.mjs parity/goldens` from `native/`); a deliberate output
change updates the member's golden in the same pull request. Rebuild the
analytic WASM (`npm run build:analytic-wasm` in `kicad-prism-viewer/`) when the
crates it compiles change. Rust is pinned to 1.98.0 by
`native/rust-toolchain.toml`.

### Compose configuration

```bash
docker compose --env-file .env.example -f docker-compose.yml config --quiet
docker compose --env-file .env.example \
  -f docker-compose.yml \
  -f docker-compose.proxy.yml \
  config --quiet
```

For a full local application, follow
[Getting started](website/src/content/docs/get-started/try-it.md). The supported
public source-build default is Linux AMD64.

### Release tooling

Changes to the release contract must also run:

```bash
python3 -m unittest scripts.test_release_bundle
POSTGRES_PASSWORD=ci-release-validation PRISM_ENV_FILE=.env.example \
  docker compose --env-file deploy/release/.env.example \
  -f deploy/release/compose.yml config --quiet
```

The tagged release workflow is not a developer image builder. Pull requests and
branch pushes never publish images. See [Release process](website/src/content/docs/contribute/release-process.md).

## Code changes

- Follow existing TypeScript, React, Python, and API conventions.
- Add or update tests for changed behavior.
- Derive audit identity from the authenticated user, not request-supplied names.
- Preserve compatibility intentionally and document any break.
- Avoid new direct `fetch` patterns when an existing API helper or domain client
  applies.
- Change catalog workflow stages, aliases, transitions, or role rights only in
  `backend/app/services/catalog/workflow_policy.py`, then regenerate the
  frontend contract with `python3 scripts/export_workflow_policy.py`; the
  backend suite fails while the generated module is stale.
- Keep generated assets, secrets, local databases, and private certificates out
  of Git.
- Update documentation in the same pull request when behavior or configuration
  changes.

## Documentation changes

Public user, operator, administrator and contributor documentation lives in
`website/src/content/docs/` and should describe current supported behavior;
follow `website/STYLE.md` for its structure and voice. Engineering records such
as plans, reviews, ADRs, release notes and benchmark transcripts stay under
`docs/`. Temporary plans and completed migration notes belong in issues,
discussions, pull requests, or release artifacts.

Use placeholders in examples. Verify links and commands. If a limitation matters
to a user's decision, state it directly.

## Pull-request checklist

- The branch contains one coherent change.
- The PR targets `dev`.
- The description explains the problem, solution, and user impact.
- Tests cover the changed behavior.
- Frontend, backend, viewer, native, or Compose checks relevant to the change pass.
- Documentation and configuration examples are current.
- No secrets, private design data, generated builds, or local caches are added.
- Breaking or feature-freeze changes have explicit maintainer approval.

The repository quality gate runs for pull requests and pushes targeting `dev`
or `main`. On a pull request it skips the jobs your files cannot affect
(`scripts/ci_changes.py` decides, from the changed paths and the files each
area's tests read); pushes and the nightly run always run every job. Contributor pull requests target `dev`; maintainers promote a tested
release through a separate `dev` to `main` pull request. Keep feature branches
current with `dev` before merge.

## Reporting and conduct

See [Reporting issues](website/src/content/docs/contribute/reporting-issues.md)
for useful bug reports and feature requests. Be precise, patient, and respectful. Focus review on the code
and engineering outcome.
