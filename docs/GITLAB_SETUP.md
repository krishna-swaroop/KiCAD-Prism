# Connect Prism to GitLab

This guide connects Prism to GitLab.com or a self-managed GitLab so project
comments can be published as GitLab issues, with replies and status synced both
ways. People can also link their GitLab accounts so issues credit them by
@handle. Prism never posts as a person.

Environment variables, polling, credential rotation and recovery are in
[Tracker integration operations](TRACKER_INTEGRATION.md). The GitHub equivalent
of this guide is [Connect Prism to GitHub](GITHUB_APP_SETUP.md).

## Before you start

- Prism runs with sign-in enabled (`AUTH_ENABLED=true`) and you are a
  workspace admin.
- `PUBLIC_BASE_URL` is the HTTPS address people use to open Prism, for example
  `https://prism.example.com`. GitLab sends webhooks and sign-in redirects
  there.
- `TRACKER_CREDENTIAL_ROOT_KEY` and `TRACKER_CREDENTIAL_ROOT_KEY_ID` are set on
  both `backend` and `prism-worker`.
- Self-managed GitLab is reachable from the Prism server over HTTPS. If its
  certificate comes from a private CA, point `REQUESTS_CA_BUNDLE` on `backend`
  and `prism-worker` at a bundle that contains your CA **and** the public roots
  (for example, `certifi`'s bundle with your CA appended), or GitHub and other
  public hosts stop working.

Below, `https://prism.example.com` stands for your `PUBLIC_BASE_URL` and
`https://gitlab.example.com` for your GitLab.

## 1. Create the bot token

Prism publishes as a bot. Pick one:

| Where | Token | How |
| --- | --- | --- |
| Self-managed, or GitLab.com Premium/Ultimate | **Project access token** (one project) | Project → **Settings → Access tokens → Add new token** |
| Same, several projects | **Group access token** | Group → **Settings → Access tokens → Add new token** |
| GitLab.com Free | **Personal access token of a dedicated user** | Create a user such as `prism-bot`, add it to each project as Developer, then its **User settings → Access tokens** |

For every kind:

- **Name:** `Prism`. Issues and replies show this bot as their author.
- **Role:** Developer. Prism checks for it before publishing, and the project
  picker lists only projects where the bot has it.
- **Scope:** `api`.
- **Expiration:** your policy. Prism stops publishing and asks for a new token
  when it expires.

Copy the token; GitLab shows it once.

## 2. Add the connection in Prism

1. Open **Settings → Code hosts → Add code host → GitLab**.
2. Under **Connection**, give it a name and pick **GitLab.com** or
   **Self-managed GitLab**. For self-managed, enter the server address, for
   example `https://gitlab.example.com` (not the `/api/v4` URL).
3. Under **Bot token**, paste the token.
4. Click **Create connection**, then **Test connection**.

A successful test reads "Connected · publishes as `<bot username>`" and the code
host shows **Ready**. Prism only writes to GitLab after a successful test.

| Test fails with | Fix |
| --- | --- |
| An authentication error | The token is wrong, expired or revoked. Create a new one and paste it. |
| Permissions | The token lacks the `api` scope, or the bot's role is below Reporter. |
| A network or certificate error | The Prism server cannot reach the GitLab address over HTTPS, or does not trust its certificate (see "Before you start"). |

## 3. Turn on the webhook (recommended)

Without a webhook Prism polls GitLab every few minutes. With it, issue edits,
comments and closes reach Prism within seconds. GitLab webhooks are set per
project (group webhooks need Premium).

1. Generate a secret:

   ```bash
   openssl rand -hex 32
   ```

2. In Prism, under **Webhook**, paste the secret into **Webhook secret**, copy
   the **Webhook URL**, and click **Save changes**.
3. In GitLab, open the project → **Settings → Webhooks → Add new webhook**:
   - **URL:** the Webhook URL from Prism.
   - **Secret token:** the same secret.
   - **Trigger:** **Issues events** and **Comments**. Add **Confidential issues
     events** and **Confidential comments** if you use confidential issues.
   - **Enable SSL verification:** on.
4. Click **Add webhook**, then **Test → Issues events**. GitLab should report
   `HTTP 200`.

Save the secret in Prism before testing; until then Prism answers `401`.

| Delivery result | Fix |
| --- | --- |
| `401` | The secrets differ. Paste the same value in both places. |
| "Requests to the local network are not allowed" | Prism is on an internal address. A GitLab admin allows it under **Admin → Settings → Network → Outbound requests** ("Allow requests to the local network from webhooks and integrations"), ideally for Prism's host only. |
| Connection failed or timed out | `PUBLIC_BASE_URL` is not reachable from GitLab. |

## 4. Let people link their GitLab accounts (optional)

Linking lets published issues and replies credit people by @handle. It only
reads their username.

1. In Prism, expand **Account linking** and copy the **Redirect URI**.
2. In GitLab, open **User settings → Applications** (or, on self-managed, **Admin
   → Applications** for an instance-wide application) and add an application:
   - **Name:** `Prism`
   - **Redirect URI:** the one from Prism.
   - **Confidential:** on.
   - **Scopes:** `read_user` only.
3. Paste the **Application ID** and **Secret** into Prism and click **Save
   changes**.
4. Each person opens **Settings → Connected accounts** and clicks **Connect**
   next to GitLab.

## 5. Turn on issue publishing for a project

1. Open the project and click **Issue publishing** in its header.
2. **Tracker:** GitLab Issues. If you have more than one GitLab connection, pick
   one.
3. **Project:** the project's own GitLab project, or another project the bot is
   a member of. Nested groups (`hardware/boards/openswitch`) work.
4. **Rules:** which comments publish automatically, and who may publish the
   rest.
5. Click **Save**.

Public projects stay paused until an admin clicks **Allow public issues**.
Prism treats GitLab's **internal** visibility (every signed-in user of the
instance) as private.

## How GitLab differs from GitHub

- **Labels** are created by GitLab the first time an issue uses them.
- **Assignees:** GitLab Free allows one assignee per issue; Prism assigns the
  first linked person who is a project member.
- **System notes** (label changes, closes, mentions) are not replies and never
  appear in Prism.
- **Moved issues:** moving an issue to another GitLab project closes the
  original; Prism shows the thread as closed and does not follow the move.

## Check the round trip

1. Promote a comment in Prism. An issue appears in GitLab, authored by the bot.
2. Comment on the issue in GitLab. The reply appears in the Prism thread.
3. Reply in Prism. The reply appears on the GitLab issue.
4. Close the issue in GitLab. The Prism thread shows it as closed.

If replies arrive only after a few minutes, the webhook is not delivering;
recheck step 3.
