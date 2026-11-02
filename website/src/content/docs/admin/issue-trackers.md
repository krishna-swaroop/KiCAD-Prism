---
title: Run issue tracker connections
description: Prepare the server for GitHub and GitLab issue publishing, then monitor, pause, rotate and recover the connections.
sidebar:
  order: 7
---

Prism can publish review comments as GitHub or GitLab issues and keep replies,
edits and status in step both ways. This page covers what the server needs and
how to run the connections. Setting up a connection step by step is in
[Connect GitHub](/KiCAD-Prism/admin/github/) and
[Connect GitLab](/KiCAD-Prism/admin/gitlab/). How reviewers use it is in
[Comments](/KiCAD-Prism/use/comments/).

Credentials are never stored in plain text. Prism encrypts them with a root key
that lives only in the environment file, outside the database.

## Before you start

- Sign-in is on. Connections and account linking need signed-in users.
- `PUBLIC_BASE_URL` is the stable `https://` address of Prism, reachable by
  your users and, for webhooks, by the code host.
- The server can make outbound HTTPS calls to the code host.
- A root key is set:

  1. Generate it:

     ```bash
     openssl rand -hex 32
     ```

  2. Add it to the environment file:

     ```env
     TRACKER_CREDENTIAL_ROOT_KEY=<the key>
     TRACKER_CREDENTIAL_ROOT_KEY_ID=v1
     ```

  3. Recreate the containers:

     ```bash
     docker compose up -d
     ```

`backend` and `prism-worker` must get the same root key and the same
`PUBLIC_BASE_URL`. The API stores credentials and receives webhooks; the worker
uses them to write to the code host. A mismatch fails in confusing, partial
ways. `catalog-worker` needs neither.

For images in GitHub issues, also set `COMMENT_ATTACHMENT_LINK_SECRET` for both
services. The settings are described under
[Issue trackers](/KiCAD-Prism/admin/configuration/#issue-trackers) and
[Comments](/KiCAD-Prism/admin/configuration/#comments).

Webhooks are optional. Without them Prism polls the code host, so a server the
code host cannot reach still works, just more slowly.

## Addresses to register

All of them derive from `PUBLIC_BASE_URL`:

| Use | Address |
| --- | --- |
| Account linking callback | `https://prism.example.com/api/trackers/oauth/callback` |
| GitHub webhook | `https://prism.example.com/api/trackers/webhooks/github/<connection id>` |
| GitLab webhook | `https://prism.example.com/api/trackers/webhooks/gitlab/<connection id>` |

The connection's settings show the exact webhook URL to copy.

## How often Prism synchronises

| Activity | Interval | When |
| --- | --- | --- |
| Send queued changes | 30 s | Always |
| Poll the code host | 3 min | No webhook received in the last 30 min |
| Poll the code host | 15 min | A webhook arrived in the last 30 min |
| Full sweep | 6 h | Quiet repository |
| Full sweep | 1 h | Pending changes or activity in the last 24 h |

A quiet repository with recent successful polls is healthy; it does not mean
webhooks are broken. Tracker jobs run on `prism-worker` and use at most two of
its job slots.

## Monitor a connection

**Settings → Code hosts** shows each connection's status:

| Status | Meaning |
| --- | --- |
| **Ready** | Tested, bot identity known, not paused. Publishing works. For a Gitea or Forgejo host, account linking works. |
| **Needs a connection test** | New or changed credentials, or a failed test. Click **Test connection**. |
| **Paused** | Paused by an administrator, by a failed permission check, or because the destination's visibility is unknown. |
| **Credentials revoked** | Credentials were revoked or the code host rejected them. |
| **Needs OAuth app** | A Gitea or Forgejo host without its OAuth application yet. |

For details, `GET /api/admin/trackers/connectors/{id}/health` returns the last
webhook, poll and sweep times, the number of pending, sent, failed and
quarantined changes, the oldest pending change and any rate-limit wait.

## Pause, resume and revoke

Open the connection under **Settings → Code hosts**:

- **Pause** stops sending. Queued changes are kept.
- **Resume** sends them. It does not bypass the publishing rules.
- **Revoke credentials** (hold to confirm) erases the credentials. Linked
  threads become inaccessible until you set up the connection again.

Prism pauses a connection by itself when the code host rejects its credentials
or a permission check fails. Rate limits only delay changes. Fix the cause, then
click **Resume**.

To replace a GitHub App key or a GitLab token, paste the new one into the
connection, save, and click **Test connection**.

## Rotate the root key

1. Generate a new key and choose a new name for it, for example `v2`.
2. Move the current key and name to the previous-key settings:

   ```env
   TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY=<old key>
   TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY_ID=v1
   TRACKER_CREDENTIAL_ROOT_KEY=<new key>
   TRACKER_CREDENTIAL_ROOT_KEY_ID=v2
   ```

3. Recreate `backend` and `prism-worker`.
4. Save each connection's credentials again, so they are encrypted with the new
   key.
5. When every connection uses the new key, remove the two previous-key settings
   and recreate the containers again.

Keep the root key out of database backups unless those are encrypted
separately. A database restored without its matching root key cannot decrypt
its credentials; see [Operations](/KiCAD-Prism/admin/operations/#restore-tracker-connections).

## When the root key is missing or wrong

- Prism logs a configuration warning at startup.
- Creating or changing a connection, and linking an account, answer `503` with
  "Tracker credential encryption is locked".
- Local comments stay readable.
- Nothing is published or synchronised.
- Encrypted credentials stay in the database, untouched, until the right key
  returns.

Outbound webhooks also need the root key; see
[Webhooks](/KiCAD-Prism/automate/webhooks/).

## Publishing rules and privacy

- By default, comments of severity `minor` or higher, and tasks, publish
  automatically. Questions and notes stay local unless someone publishes them.
- By default only `designer` and above may publish. A viewer's comment stays
  local and shows as unsynced.
- A public or newly public destination pauses publishing until an
  administrator clicks **Allow public issues**. Changing the destination asks
  again.
- Issue bodies escape the comment text and leave email addresses out of the
  attribution. Text people write themselves is published as written.
- Attachments travel with published threads. GitLab receives each file through
  its uploads API. GitHub has no attachment API, so Prism links each file with a
  signed, expiring URL that opens without a Prism session. Anyone who can read
  the issue can open those files until the link expires, and GitHub's image
  proxy must be able to reach `PUBLIC_BASE_URL`. Without
  `COMMENT_ATTACHMENT_LINK_SECRET`, the issue shows the file name instead.

## What Prism guarantees on conflicts

- Duplicate webhook deliveries are ignored.
- After a write, Prism reads the issue back. If the code host changed it in the
  meantime, the code host's version wins and Prism adds a note to the thread.
- An issue that answers `404` is treated as inaccessible, not deleted, until
  Prism can confirm it is gone.
- A change whose outcome is unknown is never resent blindly. It is quarantined
  for an administrator to review.

## Account linking on Gitea and Forgejo

Gitea and Forgejo servers, Codeberg included, can be added under
**Settings → Code hosts** so people can link their accounts. Issue publishing
to them is not available.

Register Prism on the server as a confidential OAuth2 application under
**User settings → Applications → OAuth2 applications**, with the redirect URI
the setup screen shows. When `PUBLIC_BASE_URL` is unset, that URI follows the
address the browser used, so register the address people actually open.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| **Test connection** fails | The root key is set and identical on both services; the App and installation IDs; the key or token; for Enterprise Server, an `https://.../api/v3` base URL. |
| Account linking is refused | `PUBLIC_BASE_URL` matches the registered callback, and the person is still signed in. |
| Webhook answers `401` | The webhook secret in Prism matches the code host's. |
| Changes stay pending | The connection is not paused, `prism-worker` is healthy, and its log shows tracker jobs. |
| Publishing is blocked | The person's role, the public destination acknowledgement, or a revoked connection. |
| Nothing works after a restore | The root key matches the backup, and both services were restarted. |
