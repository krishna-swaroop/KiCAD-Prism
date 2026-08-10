# Release Studio R3a: Migration 9 schema hardening

R3a appends Migration 9, `release_studio_hardening`, to repair databases that
already applied Migration 8. Migration 8 remains historical state; fresh
databases still run M8 and then M9. The migration is safe to replay directly.

## Stage 1 vocabulary

The database now deliberately accepts only these evaluator and approval
values:

| Column | Vocabulary |
| --- | --- |
| `ws_release_evaluations.outcome` | `pass`, `warning`, `failure`, `blocker`, `unsupported`, `waived` |
| `ws_release_findings.severity` | `warning`, `failure`, `blocker` |
| `ws_release_findings.status` | `open`, `waived` |
| `ws_release_approvals.decision` | `approved`, `changes_requested`, `emergency_override` |

Migration 9 converts the old development-only evaluation values
`warn` → `warning`, `block` → `blocker`, and `error` → `failure` before adding
the canonical CHECK. The old aggregate vocabulary is not retained.

## Data-shape and provenance contracts

`rules` and `evidence` use `[]::jsonb` as their defaults. Existing exact empty
objects are converted to empty arrays; non-empty JSON is preserved.

Policy versions gain nullable `published_at` and `published_by`. Draft rows
must leave both NULL. Published and retired rows must have a timestamp and a
nonblank actor. Existing published/retired rows are backfilled from
`created_at` and `created_by`; a blank creator uses the deterministic actor
`release-studio-migration-9`. Once published, provenance and content are
immutable. The only lifecycle transition is a content-preserving
`published` → `retired` update with valid retirement metadata.

Release signatures remain optional until the later signing migration, but
`signature` and `signing_key_id` must be both NULL or both present.

## History and relationship protections

Approval project/candidate/build references, waiver project references, and
finding waiver references are explicit `RESTRICT` foreign keys with stable
names. This prevents a parent cascade from attempting to delete immutable
history. Release supersession uses a composite foreign key over
`(project_id, config_key, superseded_by)` to the target's
`(project_id, config_key, id)`, preserving `RESTRICT` and the no-self check.

Audit sequence numbers are positive and scoped by `(project_id, config_key)`.
Sequence 1 is the genesis event and requires `previous_hash IS NULL`; later
events require a nonblank previous hash. Canonical hashing represents that
genesis value as JSON `null`, never as an empty string.

The redundant leading-key indexes on closure inputs, members, scope
fingerprints, and audit events are removed. The member-domain build index is
retained because its leading key is not supplied by a standalone constraint.

All existing immutability guarantees remain: approvals, approval invalidations,
and audit events cannot be updated or deleted; waivers cannot be deleted but
remain lifecycle-updateable; and release records may update only
`superseded_by`.

## Validation

`backend/tests/test_release_studio_schema_migration.py` applies a disposable
PostgreSQL schema through M9, replays M9 directly, inspects
`information_schema`/`pg_catalog`, checks v8-shaped upgrade data, and probes
the FK, CHECK, provenance, supersession, signature, audit, and trigger
boundaries. It uses `TEST_POSTGRES_URL` only and skips when that isolated URL
is not provided or aliases `PRISM_DATABASE_URL`.

Migration ordering that the upgrade path depends on:

1. Drop the Migration 8 evaluation outcome CHECK before rewriting
   `warn|block|error` to the canonical vocabulary.
2. Disable `trg_ws_release_policy_versions_guard` while normalizing `rules` and
   backfilling `published_at`/`published_by` on published/retired rows, then
   re-enable it before installing the replacement guard function.

Isolated acceptance run:

```text
Ran 12 tests in 1.966s
OK
```