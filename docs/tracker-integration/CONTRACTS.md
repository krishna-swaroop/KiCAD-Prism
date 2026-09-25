# Tracker integration — frozen contracts

**Version 1.1 · 2026-09-20 · tickets TR-00, review H3.** Source of truth for
[RFC #310 draft v2](https://github.com/krishna-swaroop/KiCAD-Prism/issues/310)
where the RFC was underspecified or promised more than the providers can give.
Every decision below names the evidence it rests on and the fixture set that
proves it. Changing a decision is a contract revision: bump the version, record
the change in §11, and re-run the affected fixture sets.

Terms: **root** = a Prism comment; **reply** = a comment reply; **thread** = a
root plus its replies; **link** = a `tracked_threads` row binding a root to one
remote issue; **op** = a durable outbound operation (`sync_ops` row); **hint** =
a durable inbound notification (`remote_hints` row) that an object may have
changed; **bot** = the connector's writing identity (GitHub App installation,
GitLab/Gitea bot user).

Inspected baseline: `KiCAD-Prism` `6e0a0ae5` (`dev` after #309); the
observations in the workpack's `EVIDENCE.md` at `4b91d214` still hold.

---

## 1. Accepted answers to the RFC's open questions

| RFC §13 question | Accepted default |
| --- | --- |
| Promote `question`-class comments at `info`? | No. Only severity ≥ `minor` or class `task` auto-promote. Manual Promote is always available (subject to §4). |
| Forge users without a Prism account commenting on a promoted issue | Rendered inline in the Prism thread with provider attribution (`login (GitHub)`), read-only, no Prism account created. |
| Severity downgrade below `minor` after promotion | Link and issue state unchanged. Prism updates its own labels and context block only. Never closes or unlinks. |
| Bot identity on GitLab/Gitea | Dedicated bot user with an access token is required. No personal-token fallback in the first release. |
| Default `promote_min_role` | `designer`. Admins may lower to `viewer` per project. |
| Issue body content | Board, layer/sheet, refdes/net, coordinates, full commit SHA, commit-pinned Prism deep link, Prism display-name attribution. No email addresses (§D8). |

---

## 2. Decisions D1–D9

### D1 — State changes: preflight, write, postflight; no atomic CAS

**Evidence.** GitHub's REST API does not honour conditional headers on unsafe
methods (`PATCH /repos/{o}/{r}/issues/{n}` ignores `If-Match`), so another
actor can change the issue between Prism's GET and PATCH. Issue timeline events
(`GET /repos/{o}/{r}/issues/{n}/events`) are returned in creation order with
`event` (`closed`, `reopened`), `actor` and `id`; that sequence is the forge's
own ordering and does not depend on any Prism clock.

**Guarantee Prism advertises.** *Prism never overwrites a forge state change it
has observed, and a change interleaved inside its own write window is detected
from the forge's event sequence and re-applied within one sync cycle.* Prism
does not claim atomic compare-and-set.

**Mechanics.**

1. A local resolve/reopen records an op with `expected_remote_state` and
   `expected_remote_version` = the `(updated_at, etag)` of the **last fetched**
   remote object at the moment the intent was recorded. Versions are opaque
   tokens compared for equality only; no timestamp arithmetic.
2. **Preflight.** The worker fetches the issue. If `(state, updated_at)`
   differs from the expectation, or the expectation is unknown, the op is
   `superseded`: the fetched state is applied locally and one system note is
   posted in the Prism thread (*"Reopened on GitHub after this thread was
   resolved in Prism"*, actor named only when the events API names one).
3. **Write.** If equal, the worker sends the PATCH.
4. **Postflight.** The worker lists timeline events after the preflight
   `updated_at`. If any state event by a non-bot actor precedes the bot's own
   event in that sequence, a human's intent was newer than Prism's: Prism
   re-applies the human's state (a second PATCH restoring it), applies it
   locally, and posts one system note. Otherwise the op is `confirmed` with the
   post-write `(updated_at, etag)` as the new observed version.
5. Two rapid local intents on the same thread are serialized by the thread's
   op queue; the second op re-reads the expectation at execution time (C5
   "older intent cannot overwrite newer local intent").

**Residual limitation (accepted).** Between postflight listing and the
restoring PATCH a third change can occur; it is caught by the next hint or
sweep with the same rule. Providers without a timeline/events API (checked by
`capabilities.has_state_events`) fall back to preflight-only; their release
gate must state that limitation explicitly.

**Fixtures.** F6 (all cases).

### D2 — Ambiguous creates: quarantine, never blind resend

**Evidence.** An HTTP timeout or worker crash after the request left the
process leaves the outcome unknown; a lease expiry cannot cancel a request
already accepted by the forge. GitHub's search API is eventually consistent;
`GET /repos/{o}/{r}/issues?creator=<bot>&state=all&since=<t>` is not, and
lists pull requests too.

**Policy.**

- An op found in `sent` with no recorded result (crash, timeout, stale lease
  claimed by another worker) enters `recovering`. Any claim of a `sent` op is
  the recovery path; there is no resend path from `sent`.
- **Recovery scan** = complete pagination of issues in the link's destination
  container filtered by `creator = bot login`, `state = all`,
  `since = op.sent_at − 10 min`, sorted by creation, pull requests dropped, **no
  label filter**. A match requires all of: `connector_id`, `remote_container_id`,
  `comment_id`, `op_id` present in the body marker **and** `issue.user.id ==
  connector.bot_forge_user_id`. Match → the op is `confirmed` against that
  object. Replies recover identically through the issue's comment list.
- A complete scan without a match is **not** proof of absence. The op enters
  `quarantine` with a re-scan schedule of 1, 5, 15, 60 min then hourly, up to
  the connector's `unknown_outcome_budget` (default 24 h). An inbound hint
  carrying the op marker at any time confirms it.
- An **incomplete** scan (error mid-page, rate limit) leaves the op in
  `recovering`; it never advances the quarantine clock.
- After the budget expires with only complete, empty scans, the op becomes
  `failed:unknown_outcome`. It is surfaced on the chip and in connector health.
  A human's *Retry* performs one more complete scan and then creates a **new**
  op with `lineage_of = <old op>`; the old op is kept.
- **Late acceptance** (the original issue appears after a retry created a
  second one): the later-created issue is closed by the bot with the comment
  *"Duplicate of #N (recovered)"*, the older issue becomes the link, and both
  ops are recorded in `tracked_threads.lineage`. Prism never deletes issues.

**No exactly-once claim.** The advertised guarantee is *at-least-once with
bounded, recorded duplicate reconciliation*.

**Fixtures.** F5 (all cases), F4 `copied_marker`, `forged_marker`.

### D3 — Author, actor, editor are three different things

**Evidence.** A fetched issue comment carries `user` (author), `created_at`,
`updated_at`; it does not carry who edited it. A webhook payload carries
`sender` for that delivery only, and only after signature verification.
Polling (`since=`) yields objects, not actors.

**Rules.**

| Concept | Source | Stored as |
| --- | --- | --- |
| Object author | fetched `user` | `tracked_replies.remote_author_{id,login}` (immutable) |
| Event actor | verified webhook `sender`, or timeline event `actor` | `remote_hints.actor_{id,login}` for that delivery |
| Editor of an edit | event actor when the hint carried one; otherwise **unknown** | revision `editor_kind = remote_actor \| remote_unknown` |

- Echo detection never uses the author. An inbound change to a known object is
  an **echo** only if an op for that object is `sent` or `confirmed` **and**
  `sha256(normalize(fetched_body)) == op.expected_body_hash` (state ops: fetched
  state equals the op's target state and the event actor is the bot).
- A bot-authored object whose fetched body hash differs from every op's hash is
  a real edit — applied as an inbound revision even though the author is the
  bot. It is never dropped.
- When actor evidence is absent, the revision and the UI say *"edited on
  GitHub"* with no name. Prism never invents an editor.
- Webhook payloads are used for **object references and actor evidence only**;
  content and state always come from a fetch.

**Fixtures.** F4 `bot_body_edited_by_human`, `unknown_editor_via_poll`,
`echo_exact_hash`, `echo_hash_mismatch`; F7 `reordered_hints`.

### D4 — Action permissions and the publication gate

Auth types (`AuthenticatedUser.auth_type`): `session` (OIDC user with role),
`kicad_provider` (KiCad remote-symbol token; read-only for Prism resources
today and stays so), `service_client` (service client with scopes),
`external_service` (external API JWT), and the guest identity returned when
`AUTH_ENABLED=false` (`auth_type` stays `session`; recognised by the absence of
a session id and the `guest@local` address). Roles: `viewer`, `qa`,
`designer`, `admin` (`qa` ranks with `viewer` for comments).

**Matrix.** "Publication" means the actor's role satisfies the project's
`promote_min_role` (default `designer`). "Owner" means the actor's stable
identity (§D6) equals the object's `author_user_id`. Legacy objects have no
owner.

| Action | viewer / qa | designer | admin | kicad_provider | service / external |
| --- | --- | --- | --- | --- | --- |
| Read thread | ✓ | ✓ | ✓ | ✓ | ✓ (`api:read`) |
| Create root (canvas or comparison) | ✓ | ✓ | ✓ | ✗ | ✓ (`api:write`, role ≥ viewer) |
| Reply on **unlinked** thread | ✓ | ✓ | ✓ | ✗ | ✓ (`api:write`) |
| Reply on **linked** thread | ✓ local; mirrored only with publication | ✓ mirrored (publication) | ✓ | ✗ | as its role |
| Edit / delete own root or reply | owner ✓; mirrored only with publication | owner ✓ | ✓ any | ✗ | owner ✓ |
| Edit / delete legacy (no owner) object | ✗ | ✗ | ✓ | ✗ | ✗ |
| Resolve / reopen unlinked thread | ✗ | ✓ | ✓ | ✗ | designer+ |
| Resolve / reopen **linked** thread | ✗ | ✓ if publication | ✓ | ✗ | designer+ and publication |
| Initial promotion (auto or manual) | publication only | publication | ✓ | ✗ | publication |
| Retry failed op / re-promote after deletion | ✗ | ✓ if publication | ✓ | ✗ | ✗ |
| Change project destination / policy / ack | ✗ | ✗ | ✓ | ✗ | ✗ |
| Link / unlink own forge account | ✓ (session only) | ✓ | ✓ (+ revoke others) | ✗ | ✗ |

**Denied publication keeps the local change.** A reply, edit or delete by an
actor without publication on a linked thread is saved locally with
`sync_state = unsynced_local` and rendered with an explicit badge (*"Not shared
to GitHub — viewer"*). It is never mirrored later automatically; a user with
publication may click *Share to GitHub*, which enqueues it with the original
author's attribution. The forge never sees it until then. Nothing is hidden:
the badge is visible to everyone who can read the thread.

**Resolve/reopen on a linked thread without publication is refused** (HTTP
403 with reason), not saved locally: status must not diverge from the forge,
which is the system of record for state.

Auto-promotion evaluates the **comment author's** role at creation time; a
viewer's `task` comment on a project whose `promote_min_role` is `designer`
stays local with the chip *"Not promoted — ask a designer"*, and any designer
may promote it later.

**Fixtures.** F1 (all), F8 `viewer_reply_on_linked`, `share_to_github`,
`viewer_resolve_refused`, F9 `role_state_matrix`.

### D5 — Field authority

| Field | Prism → forge | Forge → Prism | Notes |
| --- | --- | --- | --- |
| Anchor (location, layer, sheet, refdes/net, commit) | context block, written at creation and on class/severity change | **never** | Immutable in Prism (C1). |
| Severity, class | labels + title + context block | never (inbound label changes are displayed, not applied) | Prism re-asserts its labels only on its own next write; it never fights a human removal. |
| Title | written at creation; rewritten on severity/class change **only if** the remote title still equals the last title Prism wrote (stored hash) | never | A human-edited title is preserved. |
| Body — prose block | root content edits mirror out | prose-block edits mirror in as a root revision (`editor = actor \| unknown`) | Blocks are delimited by `<!-- prism:block:prose -->` … `<!-- /prism:block -->`. |
| Body — context block, marker block | Prism-only | never | See "diverged body" below. |
| Labels outside the `prism`, `severity:*`, `class:*`, `board:*` namespace | never touched | never applied | |
| Assignees | added from resolved mentions at creation and when local mentions change; **never removed** by Prism | displayed only | Up to the provider's limit; overflow becomes a body hint. |
| State (open/closed) | D1 | D1 | Shared; forge wins ties. |
| Prism-origin reply body | create / edit / delete as the bot's own comment | inbound edits by others apply as revisions (D3); last writer wins with full history on both sides | Bots may edit/delete their own comments on GitHub, GitLab and Gitea. |
| External-origin reply | **never** edited or deleted by Prism | create / edit / delete apply | Prism never moderates other people's remote comments. |
| Remote issue deleted | — | link `deleted`; thread kept and unlinked; Promote again offered | |
| Local root deleted | bot posts *"This comment was deleted in Prism"*, link unlinked with lineage retained | — | Never deletes the remote issue. |

**Diverged body.** If a fetched body lacks the Prism block delimiters (a human
rewrote the bot body), the link is flagged `body_authority = forge`: Prism
stops writing the body and title, keeps state/labels/replies syncing, shows
*"Issue body edited on GitHub; Prism no longer updates it"*, and relies on the
stored external id — never on the marker — for identity. Inbound prose is not
applied while diverged. An admin can *Restore Prism body* (explicit action,
overwrites, posts a note).

**Capabilities.** `IssueTracker.capabilities()` reports
`can_edit_own_comment`, `can_delete_own_comment`, `can_edit_issue_body`,
`has_state_events`, `has_transfer_events`, `supports_conditional_get`,
`max_assignees`. Adapters must prove each with a fixture; nothing implies
moderation of others' content.

**Fixtures.** F4 `manually_edited_bot_body`, `human_title_edit`,
`external_reply_edit`, F8 `root_prose_roundtrip`, `remote_issue_deleted`,
`local_root_deleted`.

### D6 — Stable actor identity and legacy data

**Stable identity.**

| Auth type | `actor_id` | `actor_kind` |
| --- | --- | --- |
| session with `session.user_id` | that id | `user` |
| session with empty `user_id` | `users.user_id` looked up by the session email in `access_service` at request time (the row exists for every role-assigned user); if none, the request is refused for mutations | `user` |
| `service_client` | `service:<client_id>` | `service` |
| `external_service` | `external:<client_id>` (the token's subject) | `service` |
| guest (auth disabled) | `guest:local` | `guest` |
| kicad_provider | — (cannot mutate) | — |

Stored on every root and reply as `author_user_id`, `author_kind`,
`author_display` (display name at write time). Ownership compares `author_user_id`
only. Display names and emails are never used to infer ownership.

**Legacy rows** (created before TR-01): `author_user_id = NULL`,
`author_kind = 'legacy'`, `author_display` = the existing `author` text. Only
admins may edit or delete them. They may be promoted if an anchor is available;
attribution renders as *Requested by: <display> (Prism, unverified)*.

**Anchors.**

- New comments must send the **displayed** revision: `revision.commit` (full
  40-hex SHA) or `revision.worktree = true` with the semantic index's
  `sourceRevisionKey`. The server validates the commit exists in the project
  repository through `project_source_snapshot.project_revision_identity` and
  stores `anchor_commit`, `anchor_revision_key`, `anchor_source = 'client'`.
  It never substitutes HEAD.
- Comparison comments keep the ordered `(base_commit, compare_commit)` pair and
  `selected_side`.
- Legacy rows and worktree-anchored rows are `anchor_state = 'unpinned'`:
  readable, visibly unpinned, and **not promotable**. An admin may pin one by
  choosing a commit explicitly (`anchor_source = 'manual'`, audited); users
  are told *"Select a committed revision to share this comment"*.
- No geometry, net, refdes or variant identity is ever fabricated for an
  unpinned comment.

**Compatibility.** `comments.json` `meta.version` becomes `1.1` (additive:
`authorUserId`, `authorKind`, `anchor`, reply `id`/`revision`). Import of 1.0
files yields legacy rows. Desktop consumers (KiCad plugin, REST source URLs)
ignore unknown fields; nothing is removed.

**Fixtures.** F1 `duplicate_display_names`, `empty_user_id_session`,
`service_identity`, `legacy_admin_only`; F2 (all).

### D7 — Publication acknowledgement is bound to a destination generation

- `project_trackers.destination_generation` increments on any change of
  connector or container. Each link stores the generation it was created
  under and keeps writing to **that** destination even after the project's
  destination changes; only new promotions use the new generation.
- An acknowledgement row is `(connector_id, remote_container_id,
  observed_visibility, acknowledged_by, acknowledged_at)`. `remote_container_id`
  is the forge's immutable numeric id, not the path. The ack is valid only while
  the observed visibility equals the acknowledged one.
- **Dispatch revalidation.** Before every outbound write the worker checks: the
  link's connector is not paused; the container visibility (cached ≤ 1 h,
  refreshed by the sweep) equals the acknowledged visibility; the actor of the
  op still satisfies publication. Any failure → `paused:<reason>`; the op is
  retained, retry budget untouched, admin health shows it.
- **Transfer.** If the issue moved to a container on the same connector that
  is an approved destination of the project (any generation with a valid ack)
  → relink automatically, note in thread. Otherwise → `link_state =
  transferred`, sync paused, admin action *Approve new destination* creates a
  new generation + ack and resumes.
- **Deletion proof.** `410 Gone` → `deleted`. A `404` while the container is
  reachable is only `deleted` after the object is absent from a **complete**
  listing (`state=all`, `since = link.created_at`) on two sweeps ≥ 10 min apart;
  until then it is `inaccessible`. A 404 with an unreachable container is
  `inaccessible`.

**Fixtures.** F3 `visibility_generations`, F7 `transfer_*`, `lost_access`,
`recovered_access`, `private_404`, `gone_410`; F8 `no_repromote_from_inaccessible`,
`public_change_while_queued`.

### D8 — Mentions and the no-email rule

- **Scope.** The rule *"no email addresses in issue bodies"* applies to
  everything Prism **generates**: attribution, assignment hints, context block,
  system notes, display names. User-authored prose is mirrored verbatim except
  for mention tokens. A user who types someone's email as ordinary prose is
  responsible for it; the UI shows the destination before every promotion.
- **Mention DTO.** `{ "userId": "<users.user_id>", "displayName": "<name>" }`.
  Content stores mentions as `@[Display Name](user:<id>)`; the legacy
  `@email` form is accepted on input and converted. Local storage is lossless.
- **Rendering to the forge.** A mention becomes `@<forge_login>` when the user
  has a linked identity on the link's connector, otherwise `**Display Name**`
  (no handle, no email). Unlinked mentions add one body line: *Assignment hint:
  Display Name (not linked)*.
- **Assignees.** Every linked mention becomes an assignee up to
  `capabilities.max_assignees`; overflow is listed in the hint line. Failure to
  assign is a warning on the op, never a failed create.

**Fixtures.** F8 `mention_linked`, `mention_unlinked`, `mention_overflow`,
`prose_email_passthrough`, `legacy_email_mention_import`.

### D9 — Provider DTOs, reply lookup, container identity, durable inbox

Frozen in [dto-examples.json](dto-examples.json). Summary:

- **Destination** `{connector_id, container_kind: repo|group|project,
  container_path, remote_container_id, generation}`. Adapters resolve
  `remote_container_id` on first use (`get_container`) and return
  `visibility: public|private|unknown`.
- **Errors** (typed, never raw provider bodies): `rate_limited{resume_at}`,
  `auth_lost`, `forbidden`, `not_found_uncertain`, `gone_confirmed`,
  `moved{new_ref}`, `transient`, `invalid_request`, `capability_missing`.
- **Reads** carry `remote_version: {updated_at, etag}`, `author`, and for
  timeline reads `actor`. `list_comments(dest, issue, cursor)` and
  `find_comment_by_marker(dest, issue, marker)` exist alongside the issue-level
  equivalents; `list_updates(dest, since_cursor)` returns `RemoteChange`
  references only.
- **Durable inbox** `remote_hints(id, connector_id, delivery_id, object_kind,
  remote_container_id, external_id, external_comment_id, event, actor_id,
  actor_login, received_at, state pending|applied|ignored|failed, applied_at,
  error)`; unique `(connector_id, delivery_id)`. The webhook endpoint verifies
  the signature on raw bytes, inserts the delivery row **and** the hints in one
  transaction, then returns 2xx.
- **Shared subscriptions, per-link fan-out.** One webhook/poll subscription per
  `(connector, remote_container_id)`. Applying a hint looks up **all** links
  whose `(connector_id, remote_container_id, external_id)` match — several
  Prism projects may share one repository — and applies to each. Dedupe is by
  delivery id only, never by object id.
- **Scheduler checkpoints** `sync_checkpoints(kind poll|sweep|recovery,
  scope_key, cursor, page_cursor, last_success_at, last_error, next_run_at,
  claimed_by, lease_expires_at)`; cursors advance only after hints are durable
  (C7).

**Fixtures.** F7 `pagination_*`, `duplicate_delivery`, `shared_repo_two_projects`;
F4 `two_projects_same_repo`.

---

## 3. Operation ordering and state machines

**Ops.** `pending → sent → confirmed | superseded | failed`, plus the recovery
sub-states `recovering` and `quarantine` reachable only from `sent` (D2).
Rules: one op executes at a time per link (thread queue, ordered by
`created_at, op_id`); `add_reply`/`edit`/`delete`/`set_state` ops wait until the
link's `create_issue` is `confirmed`; `sent` is written before I/O;
result + link + `confirmed` are written in one transaction after I/O; retry
reuses `op_id`; explicit re-promotion creates a new `op_id` with `lineage_of`.
`auth_lost`/`forbidden` → `paused` without consuming attempts;
`rate_limited` → rescheduled at `resume_at` without consuming attempts;
`transient` → exponential backoff (30 s, 2 min, 10 min, 1 h, 6 h), then
`failed` after 8 attempts with a sanitized error.

**Links.** `link_state ∈ {linked, inaccessible, deleted, transferred}`;
orthogonal flags `paused_reason`, `body_authority`, `unlinked_at` (local
unlink keeps the row for lineage). Only `deleted` enables *Promote again*.

**Hints.** `pending → applied | ignored(echo) | failed`. A failed hint is
retried with the op backoff schedule and never blocks later hints for other
objects.

**Local mutation transaction.** Root/reply write, its revision row and any
resulting op are inserted on **one connection and transaction** in the
`comments` schema; the job wake-up (`workspace.ws_jobs`) is sent after commit
and is best-effort — the worker also discovers pending ops by polling
`sync_ops`. Inbound application runs with `origin = remote` and cannot enqueue
outbound ops (loop prevention at the write boundary, not only by hashing).

---

## 4. Schema ownership and migrations

| Schema | Tables | Owner ticket |
| --- | --- | --- |
| `comments` | `comments` (+ identity/anchor columns), `comment_replies` (+ identity/revision), `comment_revisions`, `tracked_threads`, `tracked_replies`, `sync_ops`, `remote_hints`, `sync_checkpoints` | TR-01 (identity/revisions), TR-12 (links), TR-13 (store), **comments ledger v4** (`sync_ops_inbox_and_delete_cascade`) creates `sync_ops` / inbox / checkpoints at deploy time |
| `workspace` | `tracker_connectors`, `user_identities`, `project_trackers`, `destination_acks`, `tracker_audit` | TR-12 (v23); connector FK `ON DELETE CASCADE` is workspace v24 |

Comments-schema changes stay in `comments_store_service.initialize()`'s
additive, advisory-locked pattern. Workspace tables use the versioned registry
in `workspace_schema_migrations.py`; the migration number is allocated from the
integration branch at TR-12 dispatch, never from this document. All migrations
are additive and restart-safe; cross-schema references are fully qualified and
the pooled `search_path` is restored.

---

## 5. Provider error classification

| Class | HTTP / condition | Effect on op | Effect on link |
| --- | --- | --- | --- |
| `rate_limited` | 403/429 with rate-limit headers, secondary-limit body | reschedule at `resume_at` | none |
| `auth_lost` | 401, installation revoked, token refresh failure | `paused:auth` | `inaccessible` |
| `forbidden` | 403 without rate-limit headers | `paused:forbidden` | `inaccessible` |
| `not_found_uncertain` | 404 | retry/recover per D2/D7 | `inaccessible` until proven |
| `gone_confirmed` | 410 | `failed:target_gone` | `deleted` |
| `moved` | 301/307 with new location, transfer event | re-resolve, then D7 | `transferred` or relinked |
| `transient` | 5xx, timeout, connection error | backoff | none |
| `invalid_request` | 422 | `failed:invalid` with sanitized detail | none |
| `capability_missing` | adapter reports unsupported | `failed:capability` | none |

Provider error bodies are never stored verbatim; the sanitized `message` is
≤ 300 chars with tokens, PEMs and URLs with credentials redacted (reuse
`forge_publish_service._redact`).

---

## 6. Cadence and budgets (C7)

| Activity | Cadence | Notes |
| --- | --- | --- |
| Outbox drain | on wake-up; poll every 30 s | per-worker claim with 60 s lease, renewed |
| Update poll per `(connector, container)` | 15 min while a webhook was received in the last 30 min; else 3 min | window overlaps by 5 min; results deduped by object id + `updated_at` |
| Verification sweep per link | every 6 h; every 1 h while the link has pending ops or activity in the last 24 h | issue **and** all replies, complete pagination, conditional GETs |
| Recovery scans | D2 schedule | |
| Visibility refresh | with the sweep, ≤ 1 h stale before a write | |
| Staleness | link `stale` after 24 h without a successful fetch; connector `degraded` after 3 consecutive poll failures | shown in health |

Convergence is *eventual within one poll or sweep interval under normal
conditions*; during outages or throttling the health strip shows the age of the
oldest unapplied hint and oldest pending op instead of promising minutes.

---

## 7. Canonical markers

```
<!-- prism:v1 connector=<connector_id> container=<remote_container_id> comment=<comment_id> op=<op_id> -->
<!-- prism:v1 connector=<connector_id> container=<remote_container_id> reply=<reply_id> op=<op_id> -->
```

Markers are opaque identifiers, not proof of ownership (D2). Body blocks:

```
<!-- prism:block:prose -->
…user text…
<!-- /prism:block -->
<!-- prism:block:context -->
…generated context…
<!-- /prism:block -->
```

---

## 8. DTO examples

See [dto-examples.json](dto-examples.json). Backend Pydantic models and the
frontend `types/comments.ts` / `types/trackers.ts` implement these shapes
verbatim; additive fields are allowed, renames are contract revisions.

### Admin connector HTTP (frozen)

Admin-only. Secrets never appear on reads. Bot identity is a nested
`{id, login}` object, not a flat `botForgeUserId`. Test connection returns
the public `TrackerConnector` plus `test: ConnectorTestResult`.

| Method | Path | Body / result |
| --- | --- | --- |
| GET | `/api/admin/trackers/connectors` | `TrackerConnector[]` |
| POST | `/api/admin/trackers/connectors` | create → `TrackerConnector` |
| GET | `/api/admin/trackers/connectors/{connectorId}` | `TrackerConnector` |
| PATCH | `/api/admin/trackers/connectors/{connectorId}` | `TrackerConnector` |
| POST | `/api/admin/trackers/connectors/{connectorId}/pause` | `TrackerConnector` |
| POST | `/api/admin/trackers/connectors/{connectorId}/resume` | `TrackerConnector` |
| POST | `/api/admin/trackers/connectors/{connectorId}/revoke` | `TrackerConnector` |
| POST | `/api/admin/trackers/connectors/{connectorId}/test` | `TrackerConnector` + `test` |
| GET | `/api/admin/trackers/connectors/{connectorId}/health` | `ConnectorHealth` |

User OAuth identity routes stay under `/api/trackers/…` (session user, not admin).

---

## 9. Fixture sets

Manifests live in [fixtures/](fixtures/) as `F01.json` … `F10.json`. Each case
has `id`, `owner` (ticket that materializes it), `given`, `when`, `expect`, and
the decision it proves. Consumers add cases with their own ticket prefix; they
do not edit another ticket's cases.

---

## 10. Reviewer guidance

Review counterexamples, not shape: for each decision try the adversarial case
listed under its fixtures and confirm the implementation's observable outcome
matches `expect`. A skipped PostgreSQL or provider suite is an unmet gate.

---

## 11. Revision history

| Version | Date | Change |
| --- | --- | --- |
| 1.0 | 2026-09-20 | Initial frozen packet (TR-00). |
| 1.1 | 2026-09-20 | Freeze `TrackerConnector` (`bot:{id,login}`), `ConnectorTestResult`, admin connector route table, comments ledger v4 owning sync/inbox tables (review H3). |
| 1.3 | 2026-09-21 | Additive: `ProjectTrackerSettings.projectRepoPath` (`owner/name` of the project's own GitHub remote, `null` otherwise) so the destination picker can offer it as the default; `GET /api/admin/trackers/connectors/{id}/repositories` lists the installation's reachable repositories (`TrackerRepository`: `id`, `fullName`, `private`, `archived`, `htmlUrl`). A `pending:<owner/repo>` destination is resolved to its numeric id by path on save (TR-46). |
| 1.2 | 2026-09-21 | Additive: `TrackerConnector.webhookUrl` (server-derived from `PUBLIC_BASE_URL`, `null` when unset) so admins copy the forge-facing `/api/trackers/webhooks/{provider}/{connectorId}` URL rather than a browser-origin guess (TR-46). |
