---
title: Connect GitLab
description: Import GitLab repositories, publish Release Studio releases to GitLab.com or a self-managed GitLab, and publish review comments as GitLab issues.
sidebar:
  order: 6
---

Prism talks to GitLab for three separate jobs, each with its own credential:

| Job | Credential | Where you set it |
| --- | --- | --- |
| Import and sync repositories | Prism's SSH key, or a token in `PRISM_GIT_CREDENTIALS` | **Settings → Git & SSH**, or the environment file |
| Publish Release Studio releases | A token with the `api` scope | The environment file |
| Publish comments as issues | A bot token | **Settings → Code hosts** |

Prism never posts to GitLab as a person.

## Import repositories

Add Prism's SSH key to GitLab as a deploy key or to a machine user, and trust
the GitLab host, as in
[Private Git repositories](/KiCAD-Prism/admin/deployment/#private-git-repositories).
To import over HTTPS instead, give Prism a token with the `read_repository`
scope in `PRISM_GIT_CREDENTIALS`, with `username` set to `oauth2`; see
[Git credentials](/KiCAD-Prism/admin/configuration/#git-credentials).
`GITLAB_TOKEN` is used only for publishing.

## Publish releases

Release Studio publishes a release as a GitLab Release. The SSH key can clone
but cannot create a Release, so set a token with the `api` scope.

For `gitlab.com`:

```env
GITLAB_TOKEN=<token with api scope>
```

A self-managed GitLab must be listed by its exact host name. A host name that
merely contains `gitlab` is not treated as GitLab. With one token for every
host:

```env
PRISM_FORGE_HOSTS=gitlab.example.com=gitlab
GITLAB_TOKEN=<token with api scope>
```

To give a host its own token, or an API root under a path prefix, use the JSON
form described under
[Release Studio](/KiCAD-Prism/admin/configuration/#release-studio).

## Publish comments as GitLab issues

This connects Prism to GitLab.com or a self-managed GitLab so reviewers can
publish comments as issues, with replies and status kept in step both ways.
People can link their GitLab accounts so issues credit them by @handle.

### Before you start

- Sign-in is on and you are a Prism administrator.
- `PUBLIC_BASE_URL` is the `https://` address of Prism. GitLab sends webhooks
  and sign-in redirects there.
- `TRACKER_CREDENTIAL_ROOT_KEY` is set for both `backend` and `prism-worker`.
  See [Issue trackers](/KiCAD-Prism/admin/issue-trackers/#before-you-start).
- A self-managed GitLab is reachable from the server over HTTPS. If its
  certificate comes from a private CA, set `REQUESTS_CA_BUNDLE` for `backend`
  and `prism-worker` to a bundle holding your CA and the public roots. A bundle
  with only your CA breaks every public host, GitHub included.

Below, `https://prism.example.com` stands for your `PUBLIC_BASE_URL` and
`https://gitlab.example.com` for your GitLab.

### 1. Create the bot token

| Your GitLab | Token | Where |
| --- | --- | --- |
| Self-managed, or GitLab.com Premium or Ultimate | Project access token, or a group access token for several projects | The project or group → **Settings → Access tokens** |
| GitLab.com Free | Personal access token of a dedicated user, such as `prism-bot`, added to each project as Developer | That user's **User settings → Access tokens** |

For any kind:

- **Name:** `Prism`. Issues and replies show this as their author.
- **Role:** Developer. Prism checks for it before publishing, and lists only
  projects where the bot has it.
- **Scope:** `api`.
- **Expiration:** your policy. When it expires Prism stops publishing and asks
  for a new token.

Copy the token. GitLab shows it once.

### 2. Add the connection in Prism

1. Open **Settings → Code hosts**, click **Add code host** and choose GitLab.
2. Under **Connection**, name it and choose **GitLab.com** or
   **Self-managed GitLab**. For self-managed, enter the server address, such as
   `https://gitlab.example.com`, not the `/api/v4` address.
3. Under **Bot token**, paste the token.
4. Click **Create connection**, then **Test connection**.

A successful test shows the bot user the connection publishes as, and the code
host shows **Ready**. Prism writes to GitLab only after a successful test.

| The test fails with | Fix |
| --- | --- |
| An authentication error | The token is wrong, expired or revoked. Create a new one. |
| Permissions | The token lacks the `api` scope, or the bot's role is too low. |
| A network or certificate error | The server cannot reach GitLab over HTTPS, or does not trust its certificate. |

### 3. Turn on the webhook

Without a webhook, Prism polls GitLab every few minutes. With it, changes reach
Prism within seconds. GitLab webhooks are set per project; group webhooks need
Premium.

1. Generate a secret:

   ```bash
   openssl rand -hex 32
   ```

2. In Prism, under **Webhook**, paste the secret into **Webhook secret**, copy
   the **Webhook URL** and click **Save changes**.
3. In GitLab, open the project → **Settings → Webhooks → Add new webhook** and
   set:
   - **URL:** the Webhook URL from Prism.
   - **Secret token:** the same secret.
   - **Trigger:** **Issues events** and **Comments**, plus the confidential
     variants if you use confidential issues.
   - **Enable SSL verification:** on.
4. Click **Add webhook**, then **Test → Issues events**. GitLab should report
   `HTTP 200`.

| Delivery result | Fix |
| --- | --- |
| `401` | The secrets differ. Paste the same value in both places. |
| "Requests to the local network are not allowed" | Prism has an internal address. A GitLab administrator allows it under **Admin → Settings → Network → Outbound requests**, ideally for Prism's host only. |
| Connection failed or timed out | GitLab cannot reach `PUBLIC_BASE_URL`. |

### 4. Let people link their accounts

Linking only reads the person's GitLab username.

1. In Prism, expand **Account linking** and copy the **Redirect URI**.
2. In GitLab, open **User settings → Applications**, or **Admin → Applications**
   on a self-managed instance, and add an application named `Prism` with that
   redirect URI, **Confidential** on and only the `read_user` scope.
3. Paste the **Application ID** and secret into Prism and click
   **Save changes**.
4. Each person opens **Settings → Connected accounts** and clicks **Connect**
   next to GitLab.

### 5. Turn on publishing for a project

1. Open the project and click **Issue publishing** in its header.
2. Choose GitLab Issues and, if you have several, the connection.
3. Choose the GitLab project: the project's own, or another the bot is a
   member of. Nested groups work.
4. Set the rules for what publishes automatically and who may publish the rest.
5. Click **Save**.

A public GitLab project stays paused until an administrator clicks
**Allow public issues**. Prism treats GitLab's internal visibility as private.

### How GitLab differs from GitHub

- GitLab creates labels the first time an issue uses them.
- GitLab Free allows one assignee per issue. Prism assigns the first linked
  person who is a project member.
- System notes, such as label changes, are not replies and never appear in
  Prism.
- Moving an issue to another GitLab project closes the original. Prism shows
  the thread as closed and does not follow the move.

### Check the round trip

1. Publish a comment in Prism. An issue appears in GitLab, written by the bot.
2. Comment on it in GitLab. The reply appears in Prism.
3. Reply in Prism. The reply appears in GitLab.
4. Close the issue in GitLab. The thread shows as closed in Prism.

If replies take minutes to arrive, the webhook is not delivering. Recheck step 3.

Running the connection day to day is covered in
[Issue trackers](/KiCAD-Prism/admin/issue-trackers/).
