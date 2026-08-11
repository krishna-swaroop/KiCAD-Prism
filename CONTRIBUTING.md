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
python3 -m venv venv
source venv/bin/activate
python -m pip install -r requirements.txt
python -m unittest discover -s tests -p 'test_*.py'
```

PostgreSQL integration tests use `TEST_POSTGRES_URL`. Use a disposable test
database; do not point the suite at a production database.

### Semantic viewer

```bash
cd kicad-prism-viewer
npm ci
npm run test:gltf
npm run test:viewer
npm run build
```

### Compose configuration

```bash
docker compose --env-file .env.example -f docker-compose.yml config --quiet
docker compose --env-file .env.example \
  -f docker-compose.yml \
  -f docker-compose.proxy.yml \
  config --quiet
```

For a full local application, follow
[Getting started](docs/GETTING_STARTED.md). The supported public source-build
default is Linux AMD64.

### Release tooling

Changes to the release contract must also run:

```bash
python3 -m unittest scripts.test_release_bundle
POSTGRES_PASSWORD=ci-release-validation PRISM_ENV_FILE=.env.example \
  docker compose --env-file deploy/release/.env.example \
  -f deploy/release/compose.yml config --quiet
```

The tagged release workflow is not a developer image builder. Pull requests and
branch pushes never publish images. See [Release process](docs/RELEASES.md).

## Code changes

- Follow existing TypeScript, React, Python, and API conventions.
- Add or update tests for changed behavior.
- Derive audit identity from the authenticated user, not request-supplied names.
- Preserve compatibility intentionally and document any break.
- Avoid new direct `fetch` patterns when an existing API helper or domain client
  applies.
- Keep generated assets, secrets, local databases, and private certificates out
  of Git.
- Update documentation in the same pull request when behavior or configuration
  changes.

## Documentation changes

Public documentation belongs under `docs/` and should describe current supported
behavior. Temporary plans, benchmark transcripts, and completed migration notes
belong in issues, discussions, pull requests, or release artifacts.

Use placeholders in examples. Verify relative links and commands. If a limitation
matters to a user's decision, state it directly.

## Pull-request checklist

- The branch contains one coherent change.
- The PR targets `dev`.
- The description explains the problem, solution, and user impact.
- Tests cover the changed behavior.
- Frontend, backend, viewer, or Compose checks relevant to the change pass.
- Documentation and configuration examples are current.
- No secrets, private design data, generated builds, or local caches are added.
- Breaking or feature-freeze changes have explicit maintainer approval.

The repository quality gate runs for pull requests and pushes targeting `dev`
or `main`. Contributor pull requests target `dev`; maintainers promote a tested
release through a separate `dev` to `main` pull request. Keep feature branches
current with `dev` before merge.

## Reporting and conduct

See [Reporting issues](docs/REPORTING_ISSUES.md) for useful bug reports and
feature requests. Be precise, patient, and respectful. Focus review on the code
and engineering outcome.
