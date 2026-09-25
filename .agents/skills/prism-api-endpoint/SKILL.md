---
name: prism-api-endpoint
description: Add or modify a KiCAD Prism FastAPI endpoint, including authorization, service boundaries, schemas, jobs, and tests. Use for changes under backend/app/api/.
---

# Change a Prism API endpoint

Read the access-control rules in the root `AGENTS.md` first. Inspect the target
router and its tests before choosing a pattern; Prism has public, authenticated,
admin-only, project-scoped, and OAuth endpoints with different dependencies.

## Route and registration

- Prefer an existing router when the endpoint belongs to that domain. Create a
  new router only for a genuinely new boundary, then register it in
  `backend/app/main.py`.
- Shared project/path helpers live in `backend/app/api/_helpers.py`.
- Keep request handling in the router and domain behavior in
  `backend/app/services/`. Avoid calling another service's private methods.

## Authorization and identity

- For project-scoped routes, use the role-aware lookup in
  `backend/app/api/_helpers.py`. Do not reintroduce a role-blind project helper.
- Use the router's appropriate `require_*` dependency and still authorize the
  requested resource; authentication alone is not object authorization.
- Derive audit identity from `AuthenticatedUser` or the authenticated service
  client. Never accept attribution from a request field.

## Input and output contracts

- Follow the target domain's existing Pydantic convention. Many routers keep
  route-local models beside the endpoint; `backend/app/schemas/` is for models
  shared across modules. Do not move models merely for consistency.
- Keep request models narrow and make validation failures actionable without
  exposing exception or database detail.
- Preserve established domain errors where the caller can act on them. Follow
  the target router's error-translation pattern, and never expose unexpected
  exception detail to the caller.

## Long-running operations

Git operations, KiCad processes, large parses, and release work belong in the
PostgreSQL job system. Register a worker handler through
`backend/app/services/job_handlers.py` (or the catalog `HANDLERS` registry),
return a job id, and use the existing browser polling client. Make retry,
cancellation, and idempotency behavior explicit.

## Tests and verification

Add focused tests under `backend/tests/`. Cover the lowest permitted role and
at least one forbidden role for protected routes, plus validation and service
failure behavior. If a new router was added, test that the application exposes
it. Finish with `.agents/skills/prism-quality-gate/SKILL.md` and report any
PostgreSQL paths skipped because `TEST_POSTGRES_URL` was unavailable.
