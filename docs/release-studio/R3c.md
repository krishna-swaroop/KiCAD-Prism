# Release Studio R3c: pre-development schema correction

R3c is the final pre-development correction for the Release Studio schema.
No Release Studio rows or databases have shipped. The implementation therefore
amends the unshipped M8/M9 schema contract instead of adding another migration.

## Migration policy

The migration ledger remains ordered from 1 through 9:

1. M8 creates the Release Studio tables, including nullable
   `exception_kind` and `exception_reason` on `ws_release_approvals`.
2. M9 applies the reviewed data-shape, relationship, audit-shape, and approval
   hardening in a deterministic order.

The transient M8–M10 ladder is removed. Development databases that recorded
that transient ladder must be reset; no compatibility DDL is provided for
those pre-release databases.

The already-merged migration number and order are preserved, while the
pre-release implementation of M9 is amended. Any database that recorded a
prior Release Studio M8/M9/M10 implementation must be reset; only fresh
schemas are supported before the development merge. Before
`feature/release-studio` merges to `dev`, R23 must fold the ordered M9 body
into M8 and remove the temporary M9 ledger boundary. Append-only migration
discipline begins at that development merge.

## Approval contract

`ws_release_approvals.decision` uses only the plan vocabulary:
`approved`, `rejected`, or `changes_requested`. `emergency` is an exception
kind, never a decision value.

The unshipped M8 columns are:

| Column | Contract |
| --- | --- |
| `exception_kind` | NULL, `self_approval`, `emergency`, or `self_approval_and_emergency` |
| `exception_reason` | Nullable text that must be nonblank whenever an exception kind is present |

The M9 exception-pair CHECK requires both columns to be NULL together or
requires an allowed kind with a nonblank reason. R16 decides when each
exception is legally allowed. An emergency exception is exceptional evidence
and must never satisfy an ordinary required approval.

## Audit-shape precondition

Immediately before adding the M9 audit CHECKs, M9 checks the existing M8 audit
table for only these shapes:

- a positive sequence;
- a NULL `previous_hash` for sequence 1; and
- a nonblank `previous_hash` for every non-genesis sequence.

This is an audit-shape precondition, not a chain verifier. It does not check
sequence contiguity, exactly one genesis event, or previous-hash linkage. R11's
walking verifier is responsible for deciding whether an audit stream is a
valid chain. M9 requires a shape-compliant or empty audit history before R11
writers land and never fabricates a sequence or hash backfill.

Invalid M8-shaped data fails with a deterministic named error before M9
rewrites ordinary data or validates the new CHECKs. The four PostgreSQL
regressions cover nonpositive sequence, non-NULL genesis previous hash, NULL
non-genesis previous hash, and blank non-genesis previous hash; each confirms
the stored chain fields remain unchanged.

## PostgreSQL boundary

The application immutability triggers protect ordinary application writes and
fail closed on accidental history mutation. A PostgreSQL owner or migration
role can disable those triggers, so the schema does not claim that privileged
database operators are unable to mutate rows.

Tamper evidence and offline integrity come from the later audit-chain
verification, signed attestation, and offline verifier. Database trigger
immutability and cryptographic/offline integrity are separate guarantees.

## R13 rule outcomes

`ws_release_findings` remains a problem table. Findings continue to represent
actual problems only; `unsupported` and `info` are rule outcomes, not finding
severity or status values.

R13 must persist one outcome per evaluated rule, including `unsupported` and
`info`, in a dedicated `ws_release_rule_outcomes` table or equivalent separate
structure. It must not overload `ws_release_findings`. R3c records that design
decision but does not implement the full R13 evaluator or add a table without
its writers.

## R9 retention test fidelity

The focused R9 PostgreSQL test creates a UUID-named disposable schema with the
small pre-existing workspace base tables, then applies the real Release Studio
migration helper through M9. `ws_artifact_release_pins` is therefore created
by the production schema rather than hand-defined in the test. The fixture
passes that exact schema to its test database service, sets it on every
connection, and drops only that schema after each test, so pin-table/query
drift is detected without touching another test or application schema.
