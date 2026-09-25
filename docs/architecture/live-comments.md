# Live comment transport and revision anchors

Prism's PostgreSQL `comments` schema is the source of truth. Tracker issues are
optional projections: a forge outage must not prevent local comments from
being saved or read. The `comment_schema_migrations` ledger applies additive
identity/history, change-stream, and binding-history migrations while the API
starts, before WebSockets accept connections. Back up the `comments` schema
before enabling a new release. Rollback is code-first: keep the additive tables
and old HTTP listing available; do not drop history or tombstones.

## Transport contract

`GET /api/projects/{id}/comments` returns `{meta, comments, cursor}`. The
optional `revision=<full commit SHA>` adds an `anchorResolution` to every
thread without changing the original anchor. A failed read is an error, never
an empty successful comment list. Comparison snapshots use
`GET /api/projects/{id}/comparison-comments?base=…&compare=…` and the same
project cursor.

`GET /api/projects/{id}/comments/changes?after=<cursor>` returns ordered
metadata-only changes, the last delivered cursor, and `hasMore`. The WebSocket
`/api/projects/{id}/comments/live?after=<cursor>` replays the same changes as
`{type:"change",cursor,commentId,scope,baseCommit,compareCommit,changeKind}`
frames. `resync` requires a full HTTP snapshot. Clients must not treat a
WebSocket frame as comment content or write comments through the socket; they
refetch authorized HTTP state and deduplicate by cursor. All mutations, local
and tracker-origin, must append a change event **inside the same database
transaction** as the comment update. `NOTIFY` wakes workers; the event table
is the replay source. Each API process has one PostgreSQL listener and one
five-second durable-cursor check per subscribed project, not per viewer. Each
socket has a bounded wake queue and replays its own missing events after a
wake; the periodic access check also runs if no event arrives.

Cookie sockets require an allowed `Origin` from `CORS_ORIGINS_STR` or
`PUBLIC_BASE_URL`; neither `Host` nor forwarded headers extend that allowlist.
Startup warns when live comments are enabled but only loopback origins are
configured. Set the exact externally visible origin before deploying; a
rejected browser socket falls back to delayed HTTP refresh.
Role and project access are checked on connection and periodically afterward.
Remote-symbol tokens are not comment credentials. Browser clients retain the
last good snapshot on read failure, reconnect with backoff, and poll HTTP
while live delivery is unavailable. `PRISM_COMMENT_LIVE_ENABLED=false` disables
the socket gateway for a staged rollback while preserving HTTP comments.
Admin benchmark metrics include connection count, listener reconnects,
delivery lag, and replay failures.

## Anchor contract

A canvas thread has immutable creation-commit provenance. A manual reattach
appends a binding effective on its exact commit and descendants, with an
optimistic comment revision check. It never overwrites the origin. At a merge
with incomparable branch bindings, resolution is ambiguous until a reviewer
reattaches on the merge. A source UUID is a candidate, not a proven marker:
the loaded ECAD viewer reports `resolved`, `missing`, or `not-loaded`. A missing
UUID never falls back to an old world point. Where captured, a normalized
object-relative point follows the object's new bounds. Coordinate-only areas
stay in the rail but require review after their binding commit. The rail also
keeps unpinned legacy threads and provides a route to the creation revision.

Future KiCad V11 clients should use these authenticated HTTP/WS and anchor
contracts; the browser overlay API is a presentation detail, not a second
comment store. Forge webhooks remain separate inbound issue mechanisms.

## Optional issue publication

Prism comments remain authoritative after a reviewer publishes a thread to a
configured tracker. The protected promotion endpoint queues an idempotent
outbound operation; it does not wait for a forge HTTP request. A tracker link,
operation state, or linked-reply change appends a `projection` event in the
same PostgreSQL transaction through triggers on the tracker tables. Ordinary
worker heartbeats and verification timestamps do not generate comment events.
The browser then refetches authorized comment state and shows the issue link or
retry state. GitHub and GitLab issue adapters are shipped behind the same provider-neutral
tracker contracts. Gitea/Forgejo currently supports account linking only. A webhook is an
inbound hint, not a replacement for the outbound queue or the Prism comment DB.

## Rollout gate

Enable the new backend/migrations before the new frontend bundle. Verify two
authenticated viewers on different API workers, reconnect/replay after a
worker restart, role revocation, branch divergence, deleted objects, and
comparison scope. Measure DB-commit-to-visible p95 under the target deployment
load; the local two-listener test proves cross-process signaling but is not a
browser latency benchmark. Project deletion remains permanent after explicit
confirmation.
