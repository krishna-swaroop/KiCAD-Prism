---
name: prism-catalog-change
description: Change KiCAD Prism catalog behavior or structure while preserving public payload, hash, file, signed-URL, import, and concurrency contracts.
---

# Change the Prism catalog

Read the repository and service maps first: `AGENTS.md` and
`backend/app/services/AGENTS.md`. The stable composition root is
`backend/app/services/component_catalog_service.py`; it exposes the runtime
singleton used by `backend/app/api/catalog_admin.py`,
`backend/app/api/remote_provider.py`, and
`backend/app/services/catalog_worker_tasks.py`. Trace one public request or
worker payload through that root to the relevant service methods and tests
before editing.

## Contract gates

- Preserve component payload identity and ordering, revision history, audit
  chain validity, revision manifest hashes, placement manifests, inline bundle
  bytes, and signed asset URL expiry/signature validation.
- Preserve CSV column order and bytes, KiCad DBL generated files and digests,
  and import-session/proposal behavior. The authoritative project/folder import
  suites are `backend/tests/test_project_component_import_service.py` and
  `backend/tests/test_library_folder_import_service.py`; add only a focused
  cross-contract assertion when needed.
- Identity locking, concurrent revision/audit serialization, and QA approval
  already have coverage in
  `backend/tests/test_component_catalog_postgres_integration.py`. Do not
  duplicate those tests or weaken the dedicated PostgreSQL zero-skip gate.
- Use public service APIs in new tests. Do not add private catalog callers;
  private-member counts are enforced by the architecture ratchet.
- New modules under `backend/app/services/catalog/` must not import
  `backend/app/services/component_catalog_service.py`,
  `backend/app/services/component_catalog_service_postgres.py`, or
  `backend/app/services/component_catalog_domain.py`. Keep composition outside
  the package or use explicit dependency injection; do not add dynamic
  `__getattr__` delegation or mixins.

## Verification

Quick checks from the repository root:

```bash
python3 scripts/check_catalog_architecture.py
python3 scripts/check_agent_docs.py
python3 -m unittest backend.tests.test_catalog_architecture -v
python3 -m compileall -q backend/app scripts/check_catalog_architecture.py
git diff --check
```

Full backend checks:

```bash
backend/venv/bin/python -m unittest discover -s backend/tests -p 'test_*.py'
TEST_POSTGRES_URL=postgresql://.../dedicated_catalog_test \
  backend/venv/bin/python -m unittest backend.tests.test_component_catalog_postgres_integration -v
```

The PostgreSQL command must use a disposable database distinct from
`PRISM_DATABASE_URL`; a skipped integration suite is a failed gate, not a
passing result. Report exact counts and any unavailable Docker/KiCad/database
checks rather than calling a focused run the full quality gate.
