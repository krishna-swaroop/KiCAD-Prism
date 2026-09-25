---
name: prism-quality-gate
description: Select, run, and report the KiCAD Prism checks required by a change, then compare coverage with the dev quality gate. Use before declaring work complete or opening a pull request.
---

# Verify a Prism change

`CONTRIBUTING.md` documents supported local commands;
`.github/workflows/dev-quality-gate.yml` is the authority for required CI. Run
focused tests while iterating, then the complete suites for every affected
area. Do not describe a scoped run as the full quality gate.

If dependencies are missing, run `python scripts/sync_dependencies.py` rather
than installing ad hoc versions.

## Agent guidance

When an `AGENTS.md`, `CLAUDE.md`, `SKILL.md`, or referenced path changed:

```bash
python3 scripts/check_agent_docs.py
```

## Backend

```bash
backend/venv/bin/python -m compileall -q backend/app
backend/venv/bin/python -m unittest discover -s backend/tests -p 'test_*.py'
```

PostgreSQL integration tests require `TEST_POSTGRES_URL` pointing to a
disposable database distinct from the application database. They can skip when
it is absent, so record whether they actually ran.

## Frontend

```bash
cd frontend
npm run lint
npm run scan:gate
npm test
npm run build
npm run build:panel
```

`build:panel` is the separate Remote Symbol Provider build. React Doctor's
baseline is enforced by `scan:gate`; raw `npm run scan` is diagnostic only.

## Semantic viewer

When `kicad-prism-viewer/` or its shared runtime dependencies changed:

```bash
cd kicad-prism-viewer
npm run test:gltf
npm run test:viewer
../backend/venv/bin/python -m unittest discover -s tests -p 'test_*.py'
npm run build
```

The semantic viewer build synchronizes
`kicad-prism-viewer/dist/prism-semantic-viewer.js` into the served
`frontend/public/prism-semantic-viewer.js` and updates its digest cache key in
`frontend/index.html`. Include both tracked changes when the generated output
moves; CI rejects a build that leaves either file dirty.

The vendored ECAD viewer in `frontend/public/ecad-viewer.js` is a different
subsystem. Use `.agents/skills/prism-viewer-rebuild/SKILL.md` for it.

## Deployment and release contracts

For Compose, deployment, installer, backup, or release-bundle changes, run the
matching commands in `CONTRIBUTING.md` and compare them with the
`deployment-config` job in `.github/workflows/dev-quality-gate.yml`; that CI job
checks more overlays than the common two-command local smoke test.

For dependency or runtime identity changes, reproduce the `dependency-identity`
job. For Release Studio executor changes, the containerized live-KiCad job is
the acceptance gate and may be left to CI if the required image is unavailable
locally.

## Report coverage

Report each suite as passed, failed, or not run, with the reason. Mention missing
database, Docker, KiCad, or sibling-repository coverage explicitly. The PR is
merge-ready only when the required GitHub quality gate passes; local results do
not replace it.
