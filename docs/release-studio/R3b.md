# Release Studio R3b: Migration 10 and pre-release hardening

R3b preserves the merged M8/M9 history and appends Migration 10,
`release_studio_approval_hardening`. M9 remains the historical schema
hardening migration; it is not silently rewritten. Fresh databases run M8,
M9, and M10 in order, while an already-upgraded M9 database only needs M10.

## Approval decision contract

The canonical approval decisions are:

| Decision | Meaning | Counts as an ordinary required approval? |
| --- | --- | --- |
| `approved` | The approver accepts the bound technical scope under the bound policy. | Yes |
| `rejected` | The approver rejects the candidate/release. | No |
| `changes_requested` | The approver requires changes before approval. | No |
| `emergency_override` | An exceptional, audited break-glass decision used when the normal two-person path is unavailable. | **No** |

`emergency_override` existed in the merged M9 CHECK without a written
contract. R3b retains it for compatibility, but Migration 10 requires
`self_approval_override_reason` to be nonblank whenever that decision is used.
The database CHECK provides the structural requirement; the future R16 gate
must treat the row as exceptional evidence and must not let it satisfy an
ordinary `required_approvals` entry. The reason is retained with the immutable
approval row. No existing approval row is rewritten.

Migration 10 first preflights existing `emergency_override` rows in a stable
`id` order. If one lacks a reason, it stops with a deterministic error and
leaves the M9 decision constraint unchanged. An operator must remediate the
exception under the approved governance process before retrying. This is the
intentional compatibility risk: legacy emergency rows created without a reason
will block startup until they are reviewed, while ordinary `approved`,
`rejected`, and `changes_requested` rows upgrade without data changes.

## Audit-stream precondition

M9 adds the positive-sequence and genesis/non-genesis `previous_hash` CHECKs.
Because those fields are hashed chain material, M9 does not invent a backfill
for an invalid M8 row. The precondition runs at the beginning of M9, before
M9's repair statements and before PostgreSQL validates either new CHECK. It
reports the first invalid `(project_id, config_key, sequence)` in deterministic
order and identifies the violated shape. The migration therefore fails with a
useful remediation error instead of an opaque `ALTER TABLE` failure.

M9 is expected before R11 audit writers and requires a valid or empty audit
history. A valid stream means positive sequence values, a NULL previous hash
for sequence 1, and a nonblank previous hash for later events. Repairing a
historical stream is a separate, explicitly approved data-migration exercise;
rewriting its sequence or hashes inside M9 would destroy its provenance.

## PostgreSQL immutability boundary

The approval, invalidation, and audit triggers protect application-level writes
and make accidental history mutation fail closed. They do not claim that a
PostgreSQL owner or migration role is unable to mutate rows: the migration role
can disable a trigger when a controlled schema/data repair requires it. That is
an inherent database privilege boundary, not a defect in the trigger design.

Tamper evidence at rest comes from the later audit-chain verification and the
signed attestation/offline verifier. A privileged database mutation can still
be made, but it cannot be honestly represented by the archived chain head or
the organization signature without detection. Application immutability and
cryptographic/offline integrity are separate guarantees.

## R13 rule-outcome decision

`ws_release_findings` remains a problem table. Its allowed severities are
`warning|failure|blocker`, and its statuses are `open|waived`; `unsupported`
and `info` are intentionally not added as finding values. A finding must
describe an actual problem that can be waived or resolved, not an evaluation
state.

R13 must persist one outcome per evaluated rule, including `unsupported` and
`info`, in a dedicated `ws_release_rule_outcomes` table or an equivalent
separate structure. That table should carry the evaluation/rule identity and
the per-rule outcome independently of problem findings. R3b records this
design decision but does not implement the R13 evaluator or add a premature
table with no writers.

## Validation and compatibility

The isolated PostgreSQL tests use `TEST_POSTGRES_URL` and cover:

- the full M8→M9→M10 ladder and replay idempotency;
- the M8 invalid-audit precondition before M9 CHECK validation;
- M9→M10 upgrade with a reasoned emergency decision;
- safe refusal of a legacy emergency decision with no reason; and
- real PostgreSQL CHECK, FK, trigger, and canonical vocabulary boundaries.

Static acceptance also includes Python compilation and `git diff --check`.
