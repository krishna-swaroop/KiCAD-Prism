# Release Studio R3a: Migration 9 schema hardening

R3a defines the reviewed hardening that temporarily follows Migration 8 as
Migration 9, `release_studio_hardening`. Fresh databases apply M8 and then
M9; direct replay is idempotent. R3c records the pre-development policy that
will fold this ordered body back into M8 before the feature branch merges to
`dev`.

## Canonical vocabulary

Migration 9 installs these evaluator and approval values:

| Column | Vocabulary |
| --- | --- |
| `ws_release_evaluations.outcome` | `pass`, `warning`, `failure`, `blocker`, `unsupported`, `waived` |
| `ws_release_findings.severity` | `warning`, `failure`, `blocker` |
| `ws_release_findings.status` | `open`, `waived` |
| `ws_release_approvals.decision` | `approved`, `rejected`, `changes_requested` |

M9 converts the old development-only evaluation values `warn` → `warning`,
`block` → `blocker`, and `error` → `failure` before
adding the canonical CHECK. The old aggregate vocabulary is not retained.

Approval exceptions are separate from the decision. `exception_kind` is NULL or
`self_approval`, `emergency`, or
`self_approval_and_emergency`; `exception_reason` must be nonblank exactly
when a kind is present. R16 decides when an exception is legal, and an
emergency exception never satisfies an ordinary required approval.

## Data-shape and provenance contracts

`rules` and `evidence` use `[]::jsonb` as their defaults. Existing exact
empty objects are converted to empty arrays; non-empty JSON is preserved.

Policy versions gain nullable `published_at` and `published_by`. Draft rows
must leave both NULL. Published and retired rows must have a timestamp and a
nonblank actor. Existing published/retired rows are backfilled from
`created_at` and `created_by`; a blank creator uses the deterministic actor
`release-studio-migration-9`. Once published, provenance and content are immutable.
The only lifecycle transition is a content-preserving published-to-retired
update with valid retirement metadata.

Release signatures remain optional until the later signing migration, but
`signature` and `signing_key_id` must be both NULL or both present.

## History and relationship protections

Approval project/candidate/build references, waiver project references, and
finding waiver references are explicit `RESTRICT` foreign keys with stable
names. Release supersession uses a composite foreign key over
`(project_id, config_key, superseded_by)` to the target's
`(project_id, config_key, id)`, preserving `RESTRICT` and the no-self
check.

Audit sequence numbers are positive and scoped by `(project_id, config_key)`.
Sequence 1 requires `previous_hash IS NULL`; later events require a nonblank
previous hash. Immediately before adding those CHECKs, M9 runs the deterministic
audit-shape precondition. It reports the first invalid row in stable order and
does not rewrite sequence or hash fields. It checks only positive sequence,
genesis-null previous hash, and non-genesis-nonblank previous hash; it does not
check contiguity, exactly one genesis event, or previous-hash linkage. R11's
walking verifier is the component that decides whether a stream is a valid
chain.

The redundant leading-key indexes on closure inputs, members, scope
fingerprints, and audit events are removed. All existing application
immutability guarantees remain, with the PostgreSQL privilege boundary and
offline tamper-evidence distinction documented in R3c.

## R13 and retention

`ws_release_findings` remains a problem table for actual findings. R13 must
persist per-rule outcomes, including `unsupported` and `info`, in a
dedicated `ws_release_rule_outcomes` structure rather than overloading the
finding table. R3c records this decision without prematurely implementing R13.

The R9 retention test uses the real Release Studio migration helper to create
`ws_artifact_release_pins` in a UUID-named disposable PostgreSQL schema; it
does not hand-define the pin table.

## Validation

The focused migration test applies a disposable PostgreSQL schema through M9,
replays M9 directly, inspects `information_schema`/`pg_catalog`, checks
M8-shaped upgrade data, and probes the FK, CHECK, provenance, supersession,
signature, audit, and trigger boundaries. It uses `TEST_POSTGRES_URL` only and
skips when that isolated URL is missing or aliases `PRISM_DATABASE_URL`.
