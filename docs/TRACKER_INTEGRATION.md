# Tracker integration operations

This guide covers deployment configuration and day-two operations for Prism's
GitHub issue tracker connector. It complements the frozen contract in
[tracker-integration/CONTRACTS.md](tracker-integration/CONTRACTS.md).

Prism promotes design comments to GitHub issues, mirrors replies and edits, and
reconciles remote changes through webhooks plus polling. Tracker credentials are
never stored in PostgreSQL plaintext; they are envelope-encrypted with a root key
that stays outside the database.

## Prerequisites

| Requirement | Notes |
| --- | --- |
| PostgreSQL-backed Prism | Tracker tables live in `workspace` and `comments` schemas. |
| `AUTH_ENABLED=true` | Connector admin APIs and OAuth linking require signed-in users. |
| Stable `PUBLIC_BASE_URL` | HTTPS origin reachable by users and the forge. Required for OAuth callbacks, webhook delivery, and deep links embedded in issues. |
| Outbound HTTPS | Backend and `prism-worker` call the forge REST API. |
| Inbound HTTPS (recommended) | GitHub App webhooks need a routable URL. Polling-only operation is supported when webhooks cannot be delivered. |

## Environment variables

Set these in the deployment `.env`. Source builds use the repository root
`.env.example`; release bundles use `deploy/release/.env.example`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `TRACKER_CREDENTIAL_ROOT_KEY` | Yes, when tracker is used | 32-byte root key as 64 hex characters or standard base64. Wraps per-record data keys. |
| `TRACKER_CREDENTIAL_ROOT_KEY_ID` | Yes, when root key is set | Key id written into new envelopes (for example `v1`). Change only during rotation. |
| `TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY` | During rotation grace | Previous root key so existing envelopes remain readable until re-wrapped. |
| `TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY_ID` | During rotation grace | Id of the previous root key. Must differ from the current id. |
| `PUBLIC_BASE_URL` | Strongly recommended | Canonical public origin (for example `https://prism.example.com`). |

Generate a root key:

```bash
openssl rand -hex 32
```

`backend` and `prism-worker` must receive the same tracker variables and the
same `PUBLIC_BASE_URL`. The API encrypts credentials and serves webhooks; the
worker decrypts them for outbound writes and inbound reconciliation. A mismatch
locks credential storage on one side and produces confusing partial failures.

`catalog-worker` does not need tracker settings.

Validate Compose after editing `.env`:

```bash
docker compose --env-file .env.example -f docker-compose.yml config --quiet
```

Release bundles:

```bash
cd deploy/release
docker compose --env-file .env.example -f compose.yml config --quiet
```

## Clean-environment setup

1. Configure authentication, PostgreSQL, and the tracker root key in `.env`.
2. Start the stack and confirm `/api/health/ready` succeeds.
3. Sign in as an administrator.
4. Create a connector (Settings → Trackers, or `POST /api/admin/trackers/connectors`).
5. Paste GitHub App credentials:
   - App ID and private key PEM
   - Installation ID for the destination organization or repository
   - Webhook secret (even when polling-only; required for signature verification when webhooks arrive)
   - OAuth client ID and secret for user account linking
6. Register callback URLs at the forge (see below).
7. Run **Test connection** (`POST /api/admin/trackers/connectors/{id}/test`).
8. Configure each project's destination and publication policy.
9. Link your GitHub user account under **Connected accounts** when promotion
   requires user-scoped writes.
10. Promote a comment and confirm the issue appears. With webhooks blocked,
    expect synchronization within the polling budgets in the next section.

### Callback and webhook URLs

Derive all URLs from `PUBLIC_BASE_URL`:

| Flow | URL |
| --- | --- |
| User OAuth callback | `{PUBLIC_BASE_URL}/api/trackers/oauth/callback` |
| GitHub App webhook | `{PUBLIC_BASE_URL}/api/trackers/webhooks/github/{connectorId}` |

Register the OAuth callback on the GitHub App. Register the webhook URL on the
App or repository, matching the connector id Prism assigned.

`localhost` and `127.0.0.1` are different origins. Register the exact host your
users and GitHub reach.

### GitHub App permissions

Use a dedicated GitHub App installation for Prism bot writes. Do not reuse
`GITHUB_TOKEN` from `.env` for tracker promotion; that token is for repository
import and Release publishing only.

Minimum typical grants:

- Repository issues: read and write
- Repository metadata: read
- Organization or repository administration: read (for installation discovery)

User OAuth linking uses a separate user token with `read:user` on github.com and
the same scope on GHES.

## github.com and GHES

| Instance | `instanceKind` | API base | Notes |
| --- | --- | --- | --- |
| GitHub.com | `github.com` | `https://api.github.com` | Default. Test connection proves App installation and bot identity. |
| GitHub Enterprise Server | `ghes` | `https://{host}/api/v3` | Set `baseUrl` on the connector. Prism never contacts `api.github.com` for GHES connectors. |

Supported GHES versions follow the REST API version negotiated during **Test
connection** (`apiVersion` on connector capabilities). Validate each GHES release
in a staging connector before production promotion. Private-network GHES may
require `PRISM_FORGE_HOSTS` so outbound TLS and host allowlisting accept the
enterprise hostname.

GHES and github.com share the same Prism feature set in this release, but
capabilities are observed at runtime—not assumed from github.com defaults.

## Polling-only operation

Webhooks reduce latency but are not mandatory. When inbound webhook delivery is
impossible (air-gapped GHES, firewall rules, or a staging host), Prism still
synchronizes through scheduled poll and sweep jobs in `prism-worker`.

Default cadence (contract C7):

| Activity | Interval | Condition |
| --- | --- | --- |
| Outbox dispatch scan | 30 s | Always |
| Poll | 3 min | No recent webhook |
| Poll | 15 min | Webhook received in the last 30 min |
| Sweep | 6 h | Quiet repository |
| Sweep | 1 h | Pending ops or activity in the last 24 h |

A quiet repository with successful polls is healthy—not evidence of broken
webhooks. Connector health shows last webhook, last poll, last sweep, backlog
counts, and sanitized errors.

Tracker jobs use the `tracker_sync` resource slot (capacity 2) so they cannot
starve imports or design comparison.

## Health, pause, and recovery

### Connector health

`GET /api/admin/trackers/connectors/{id}/health` returns sanitized metrics:

- last successful webhook, poll, and sweep timestamps
- pending, sent, failed, and quarantined operation counts
- oldest pending operation age
- rate-limit resume time when throttled

Project and comment APIs expose link state (`linked`, `inaccessible`, `deleted`,
`transferred`) and pending local intent separately from observed remote status.

### Pause and resume

| Action | API | Effect |
| --- | --- | --- |
| Pause connector | `POST .../pause` | Retains durable ops; nothing new is sent until resumed. |
| Resume connector | `POST .../resume` | Re-queues work; does not bypass publication policy. |
| Revoke connector | `POST .../revoke` | Erases credentials; linked threads become inaccessible. |

Authentication or permission loss pauses the connector automatically
(`paused:auth`). Rate limits schedule retries without unlinking. Operators fix
the root cause, then resume.

### Credential rotation

**Root key rotation**

1. Generate a new 32-byte key and choose a new `TRACKER_CREDENTIAL_ROOT_KEY_ID`
   (for example `v2`).
2. Move the current key and id to `TRACKER_CREDENTIAL_PREVIOUS_*`.
3. Set the new values on `TRACKER_CREDENTIAL_ROOT_KEY` and
   `TRACKER_CREDENTIAL_ROOT_KEY_ID`.
4. Restart `backend` and `prism-worker` with the updated `.env`.
5. Re-save connector credentials or run a controlled re-wrap so envelopes use
   the new key id.
6. After all envelopes report the new id, clear `TRACKER_CREDENTIAL_PREVIOUS_*`
   and restart again.

Never store root keys in PostgreSQL backups without separate encryption. Restore
procedures in [Operations](OPERATIONS.md) apply; decrypted credentials resume
pending work only when the restored root key matches the backup.

**GitHub App key rotation**

Update the connector through `PATCH /api/admin/trackers/connectors/{id}` with
the new PEM, run **Test connection**, and confirm health returns to `ready`.

**User OAuth revocation**

Users unlink from **Connected accounts** (`DELETE /api/trackers/identities/{id}`).
Administrators can revoke all identities for a connector. Bot-backed threads
continue; user-scoped writes that require a linked account pause with a clear
error until the user links again.

## Disabled tracker or missing root key

When `TRACKER_CREDENTIAL_ROOT_KEY` is unset:

- startup logs a configuration warning;
- connector create/update and OAuth linking return `503` with
  `Tracker credential encryption is locked`;
- existing local comments remain readable;
- no promotion or sync occurs.

This is intentional: local discussion continues without silent loss, and health
surfaces the disabled encryption state.

## Publication, privacy, and permissions

- Automatic promotion applies at severity `minor` or higher, or class `task`.
  `question` and `info` stay local unless manually promoted.
- `promote_min_role` defaults to `designer`; viewers cannot publish even when
  they can comment locally. Denied publication keeps the local change and shows
  unsynced state.
- Public destination acknowledgement binds to an immutable destination
  generation. Changing a destination increments the generation; existing links
  keep writing to their acknowledged target until reconfigured.
- Unknown or newly public visibility pauses outbound writes until an
  administrator acknowledges the destination.
- Generated issue bodies escape user text and omit raw email addresses from
  attribution blocks. User-authored prose may still contain emails; strict
  deployments should train users accordingly.
- Legacy comments with unpinned anchors remain readable locally but cannot be
  promoted until anchor policy is satisfied (contract D6).

## Conflict and recovery guarantees

Prism does not advertise atomic compare-and-set on GitHub issues. Guarantees:

- Outbound writes record `sent` before provider I/O and confirm or fail in a
  separate transaction.
- Conflicting remote versions conservatively supersede stale local intent; Prism
  re-fetches after writes and adds a factual system note when superseded.
- A missing remote object after `404` is `inaccessible`, not `deleted`, until
  confirmed by complete listing or `410 Gone`.
- Duplicate webhooks dedupe on `(connector_id, delivery_id)`; hints are durable
  before `2xx`.
- Recovery never blindly resends an operation with unknown outcome; quarantined
  ops require operator review.

See [tracker-integration/CONTRACTS.md](tracker-integration/CONTRACTS.md) for
the full decision record (D1–D9).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Test connection fails | Root key set and identical on backend and worker; App installation id; PEM format; GHES `baseUrl` uses `https` and `/api/v3`. |
| OAuth callback denied | `PUBLIC_BASE_URL` matches registered callback; user still signed in; state not replayed. |
| Webhook 401 | Webhook secret matches connector; raw body signature verified. |
| Ops pending forever | Connector paused; worker healthy; `prism-worker` logs for `tracker_sync` jobs. |
| Promotion blocked | Role, visibility acknowledgement, unpinned legacy anchor, or connector `paused:auth`. |
| After restore | Same `TRACKER_CREDENTIAL_ROOT_KEY` as backup; both workers restarted. |

## Related documentation

- [Authentication and access](AUTHENTICATION_AND_ACCESS.md) — OIDC and sessions
- [Operations](OPERATIONS.md) — backup, restore, and upgrades
- [Architecture](ARCHITECTURE.md) — runtime services and schemas
- [tracker-integration/CONTRACTS.md](tracker-integration/CONTRACTS.md) — API and behavior contract
