# Tracker integration

Prism review comments become issues on the team's Git provider, with two-way
replies, edits, deletions and open/closed state. The product design is
[issue #310](https://github.com/krishna-swaroop/KiCAD-Prism/issues/310)
(RFC draft v2). This folder holds the **frozen contracts** that turn the RFC
into dispatchable work; it is the authority whenever the RFC and an
implementation disagree.

| Document | Purpose |
| --- | --- |
| [CONTRACTS.md](CONTRACTS.md) | Accepted decisions D1–D9, action-permission and field-authority matrices, operation ordering, provider error classification, cadence budgets. Versioned; changes need a coordinator-reviewed revision. |
| [dto-examples.json](dto-examples.json) | Canonical request/response/DTO examples the backend and frontend implement verbatim. |
| [fixtures/](fixtures/) | Synthetic adversarial fixture manifests F1–F10: named cases with inputs and expected outcomes. Owning tickets materialize the HTTP bodies and database rows; consumers add ticket-local cases only. |
| [foundation-gate.md](foundation-gate.md) | TR-08 acceptance of TR-01–TR-07 before provider work. |

## Delivery

Work lands on the integration branch `feature/tracker-integration` (cut from
`dev`), one pull request per ticket (`feature/tracker-tr-NN`). The ticket board,
dispatch packets and acceptance evidence live in the local workpack
`Tracker-Integration-Workpack-2026-09-20`; product code and these contracts
live here. Order of delivery:

1. Comments foundation (TR-01 … TR-08): authenticated authorship, reply
   identity, immutable anchors, revisions and tombstones.
2. GitHub end to end (TR-09 … TR-46): connector, identities, promotion, durable
   operations, two-way sync, webhooks, polling, verification sweeps,
   publication policy, UI, deployment.
3. GitLab (TR-47 … TR-50): shipped for GitLab.com and self-managed GitLab.
   Then Gitea/Forgejo (TR-51 … TR-53).
4. Personal dashboard (TR-54 … TR-57).
5. Deferred: Jira, Linear, marker-crop images, KiCad plugin.

`backend/tests/test_tracker_contract_fixtures.py` keeps the fixture manifests
and DTO examples well-formed; it does not test product behaviour.
