# Comments foundation gate (TR-08)

This is the phase-0 acceptance record for issue [#310](https://github.com/krishna-swaroop/KiCAD-Prism/issues/310). Provider work (TR-09+) must not start until this document is accepted on `feature/tracker-integration`.

**Integration commit at gate:** `d58fc7cfde176949100b390f3c174111750acb60` (TR-07 head, stacked on merged TR-05 `3a4a9e782dfd9f1819da5dfbf76ead44bdb7be18`).

## Tickets in this phase

| Ticket | PR | Result |
|---|---|---|
| TR-00 contracts | [#311](https://github.com/krishna-swaroop/KiCAD-Prism/pull/311) | Merged |
| TR-01 identity / revisions / tombstones | [#313](https://github.com/krishna-swaroop/KiCAD-Prism/pull/313) | Merged |
| TR-02 permissions | [#312](https://github.com/krishna-swaroop/KiCAD-Prism/pull/312) | Merged |
| TR-03 root mutations | [#314](https://github.com/krishna-swaroop/KiCAD-Prism/pull/314) | Merged |
| TR-04 reply edit/delete | [#316](https://github.com/krishna-swaroop/KiCAD-Prism/pull/316) | Merged `b09ba60` |
| TR-05 immutable anchors | [#317](https://github.com/krishna-swaroop/KiCAD-Prism/pull/317) | Merged `3a4a9e7` after pin-immutability fix |
| TR-06 comment DTOs / client | [#315](https://github.com/krishna-swaroop/KiCAD-Prism/pull/315) | Merged |
| TR-07 collaboration UI | [#318](https://github.com/krishna-swaroop/KiCAD-Prism/pull/318) | Open on this stack |

## Contract checks that actually ran

- **No request-author trust on create.** `CreateCommentRequest` / `CreateComparisonCommentRequest` / `CreateReplyRequest` have no `author` field. Canvas `createComment` and comparison `createComparisonComment` rebuild the JSON from named fields. Visualizer and the discussion rail no longer send `author`. Session identity is applied in `comments.py` (`author=actor.display_name`).
- **Stable reply identity.** TR-01/TR-04 tests persist reply ids across edit/delete/tombstone. TR-06 client normalizes legacy replies to `legacy:{commentId}:{index}` for read-only lists. TR-07 keys live replies by `reply.id`.
- **Revision conflicts.** Root and reply PATCH/DELETE send `expectedRevision`. 409 `revision_conflict` reloads the thread in the UI.
- **Immutable anchors.** Displayed full SHA is stored; short/unknown SHAs 422 with no row; HEAD is not substituted. Comparison pair without `selectedSide` is still `pinned`. Admin `POST .../pin` on that row is `422 anchor_immutable` (regression in TR-05).
- **Legacy data.** Unpinned/legacy rows remain readable; mutation is admin-only (`legacy_admin_only`). Export meta stays comments.json 1.1 additive.
- **Token / guest boundaries.** Guest-admin cannot publish (`canPublish=false`). Remote-origin replies stay `remote_object_read_only`. Provider-token writes stay read-only. Unchanged from TR-02/TR-04 review.

## Suites

| Suite | Result |
|---|---|
| `test_tracker_tr_0[1-5].py` | 70 tests, 0 skipped (disposable Postgres 16) |
| Full backend `test_*.py` | 1512 tests, 42 skipped (on TR-05 tree) |
| `tr-06.test.tsx` | 8 tests |
| `tr-07.test.tsx` | 11 tests |
| Frontend `npm test` | 817 tests |
| `npm run lint` / `scan:gate` / `build` / `build:panel` | pass, 0 react-doctor warnings |

## Residuals (not blockers for this gate)

- `.github/workflows/dev-quality-gate.yml` still does not run on `feature/tracker-integration` (GitGuardian only).
- Comparison *new-thread* composer still uses the host `canComment` flag (designer/admin from the project page). Replies and edits follow API `permissions`. Viewers can create on the canvas.
- No live PCB / schematic / comparison browser screenshots in this environment (no imported project). Overlay/keyboard/dark-mode routes were covered by unit tests, not a headed browser.
- `require_comment_writer` still returns a plain-string 403 for KiCad tokens; in-body `CommentPermissionError` has `code`. Same nit as #314/#316.
- Promote / `tracked_threads` are out of scope until TR-25.

## Unlock

Phase 1 (GitHub connector, TR-09+) stays closed until a reviewer accepts this gate and merges TR-07 (#318) plus this record onto `feature/tracker-integration`.
