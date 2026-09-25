# Connect Prism to GitHub

This guide registers a GitHub App for Prism so project comments can be
published as GitHub issues, with replies and status synced both ways. Follow it
once per Prism deployment. It takes about ten minutes.

The App publishes as its own bot account (for example `prism-acme[bot]`). People
can optionally link their personal GitHub accounts so issues credit them by
@handle; Prism never posts as a person.

Environment variables, polling budgets, credential rotation and recovery are in
[Tracker integration operations](TRACKER_INTEGRATION.md).

## Before you start

- Prism runs with sign-in enabled (`AUTH_ENABLED=true`) and you are a
  workspace admin.
- `PUBLIC_BASE_URL` is the HTTPS address people use to open Prism, for example
  `https://prism.example.com`. GitHub sends webhooks and sign-in redirects there,
  so it must be reachable from the internet (or from your GitHub Enterprise
  Server).
- `TRACKER_CREDENTIAL_ROOT_KEY` and `TRACKER_CREDENTIAL_ROOT_KEY_ID` are set on
  both `backend` and `prism-worker`. Prism refuses to store GitHub credentials
  without them.

Below, `https://prism.example.com` stands for your `PUBLIC_BASE_URL`.

## 1. Register the GitHub App

Open the registration page for the account that owns your repositories:

| Owner | Page |
| --- | --- |
| Organization | `https://github.com/organizations/<org>/settings/apps/new` |
| Personal account | `https://github.com/settings/apps/new` |
| GitHub Enterprise Server | Same paths on your GHES host |

Fill in the form:

| Field | Value |
| --- | --- |
| GitHub App name | A name for the bot, for example `Prism Acme`. Issues show as `prism-acme[bot]`. |
| Homepage URL | `https://prism.example.com` |
| Callback URL | `https://prism.example.com/api/trackers/oauth/callback` |
| Expire user authorization tokens | Leave on. |
| Request user authorization (OAuth) during installation | Off |
| Enable Device Flow | Off |
| Setup URL | Leave empty. |
| Webhook → Active | **Off for now.** You turn it on in step 4, once Prism has the secret. |
| Repository permissions → Issues | Read and write |
| Repository permissions → Metadata | Read-only (GitHub selects this automatically) |
| All other permissions | No access |
| Where can this GitHub App be installed? | Only on this account |

Click **Create GitHub App**. On the App's **General** page:

1. Note the **App ID**.
2. Under **Private keys**, click **Generate a private key**. GitHub downloads a
   `.pem` file. Keep it safe; you paste it into Prism in step 3.

## 2. Install the App on your repositories

1. On the App's page, open **Install App** and click **Install** next to your
   organization or account.
2. Choose **Only select repositories** and pick the repositories whose projects
   will publish issues. Add a dedicated issues repository too, if you use one.
3. Click **Install**.

GitHub opens the installation page. Its address ends in the **Installation
ID**:

```text
https://github.com/organizations/<org>/settings/installations/12345678
                                                             ^^^^^^^^
```

To add repositories later, return to this page and change **Repository access**.
A project whose repository the App cannot see stays paused with "Prism can't see
this repository".

## 3. Add the connection in Prism

1. In Prism, open **Settings → Code hosts → Add code host → GitHub**.
2. Under **Connection**, give it a name and pick **github.com** or **GitHub
   Enterprise Server** (for GHES, also enter the API base URL,
   `https://<host>/api/v3`).
3. Under **GitHub App**, enter the **App ID**, the **Installation ID**, and the
   full contents of the `.pem` file.
4. Click **Create connection**, then **Test connection**.

A successful test reads "Connected · publishes as `<app>[bot]`" and the code host
shows **Ready**. Prism only writes to GitHub after a successful test.

| Test fails with | Fix |
| --- | --- |
| An authentication error | The App ID and private key belong to different Apps, or the key was deleted on GitHub. Generate a new key and paste it. |
| Not found | The Installation ID is wrong, or the App was uninstalled. Copy it again from step 2. |
| Permissions | The App lacks **Issues: Read and write**. Change it under **Permissions & events**, then approve the new permissions on the installation page (GitHub asks the owner to accept them). |
| A network error | The Prism server has no outbound HTTPS to `api.github.com` (or your GHES host). |

## 4. Turn on the webhook (recommended)

Without a webhook Prism polls GitHub every few minutes. With it, issue edits,
comments and closes reach Prism within seconds.

1. Generate a secret:

   ```bash
   openssl rand -hex 32
   ```

2. In Prism, under **Webhook**, paste the secret into **Webhook secret**, copy
   the **Webhook URL**, and click **Save changes**.
3. On GitHub, open the App's **General** page. Under **Webhook**, tick
   **Active**, paste the Webhook URL and the same secret, and click **Save
   changes**.
4. Open **Permissions & events**. Under **Subscribe to events**, tick **Issues**
   and **Issue comment**, then **Save changes**.
5. Check **Advanced → Recent Deliveries**. The `ping` delivery should show
   `200`.

Save the secret in Prism before activating the webhook. GitHub sends `ping`
immediately, and Prism answers `401` until it knows the secret.

| Delivery status | Fix |
| --- | --- |
| `401` | The secrets differ. Paste the same value in both places. |
| Connection failed or timed out | `PUBLIC_BASE_URL` is not reachable from GitHub. |
| `404` | The Webhook URL was copied from a different connection. |

## 5. Let people link their GitHub accounts (optional)

Linking lets published issues and replies credit people by @handle. It only
reads their username.

1. On the App's **General** page, note the **Client ID** and click **Generate a
   new client secret**.
2. In Prism, expand **Account linking**. Check that **Callback URL** matches the
   App's Callback URL from step 1, paste the **OAuth Client ID** and **OAuth
   Client Secret**, and click **Save changes**.
3. Each person opens **Settings → Connected accounts** and clicks **Connect**
   next to GitHub.

If GitHub reports "The redirect_uri is not associated with this application",
the App's Callback URL differs from the one Prism shows. They must match
exactly, including `https://` and the host name.

## 6. Turn on issue publishing for a project

1. Open the project and click **Issue publishing** in its header.
2. **Tracker:** GitHub Issues. If you have more than one GitHub connection, pick
   one.
3. **Repository:** the project's own repository, or another repository the App
   is installed on.
4. **Rules:** which comments publish automatically, and who may publish the
   rest.
5. Click **Save**.

If the repository is public, publishing stays paused until an admin clicks
**Allow public issues**. Changing the repository asks for the same confirmation
again.

## Check the round trip

1. Promote a comment in Prism. An issue appears on GitHub, created by the App's
   bot.
2. Reply on GitHub. The reply appears in the Prism thread.
3. Reply in Prism. The reply appears on the GitHub issue.
4. Close the issue on GitHub. The Prism thread shows it as closed.

If replies arrive only after a few minutes, the webhook is not delivering;
recheck step 4.
