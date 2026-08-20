# Authentication and access

KiCAD Prism supports OIDC for people, scoped OAuth2 for the KiCad Remote Symbol
Provider, and service credentials for automation.

## Human OIDC login

Configure:

```env
AUTH_ENABLED=true
OIDC_ISSUER_URL=https://sso.example.com/realms/engineering
OIDC_CLIENT_ID=kicad-prism
OIDC_CLIENT_SECRET=<secret>
OIDC_SCOPES=openid email profile
OIDC_EMAIL_CLAIM=email
OIDC_NAME_CLAIM=name
OIDC_PICTURE_CLAIM=picture
OIDC_PROVIDER_NAME=Company SSO
OIDC_TOKEN_AUTH_METHOD=client_secret_post
SESSION_SECRET=<random-value>
PUBLIC_BASE_URL=https://prism.example.com
CORS_ORIGINS_STR=https://prism.example.com
BOOTSTRAP_ADMIN_USERS_STR=admin@example.com
```

Use `client_secret_basic` only when required by the provider. Prism uses
authorization code, PKCE, state, nonce, issuer, audience, signature, expiry, and
subject validation. Authentication fails closed when required settings are
missing.

Register:

| Flow | Redirect URI |
| --- | --- |
| Prism browser login | `https://prism.example.com/auth/callback` |
| KiCad provider login | `https://prism.example.com/oauth/oidc/callback` |

`localhost` and `127.0.0.1` are different redirect origins. Register the exact
origin used during local testing.

## Password login

Password login is opt-in and can run instead of OIDC, or alongside it. One email
is one Prism user. Admins assign the role (and optionally a password) in
Settings. Password login never creates an account and there is no public signup.

```env
AUTH_ENABLED=true
PASSWORD_AUTH_ENABLED=true
PASSWORD_MIN_LENGTH=12
SESSION_REMEMBER_ME_DAYS=30
SESSION_SECRET=<random-value>
BOOTSTRAP_ADMIN_USERS_STR=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=<one-time-password>
```

`BOOTSTRAP_ADMIN_PASSWORD` seeds a must-change password for bootstrap admins
that do not already have one. Clear it after first sign-in; Prism will not
overwrite a real password on restart.

There is no mailer. People who know their current password can change it in
Settings → General (other sessions are revoked). A lost password is reset by an
administrator in Settings → Access as a one-time password; the account must
change it on next sign-in and all other sessions end. Login copy tells the user
to ask an administrator.

`ALLOWED_USERS_STR` and `ALLOWED_DOMAINS_STR` apply to password login and OIDC
the same way.

## Sessions

Prism stores session records in PostgreSQL and sends an opaque signed identifier
in an `HttpOnly` cookie. Users can sign out, list their sessions, and revoke
other sessions. Administrators can revoke an account's sessions. Removing a
user's role also revokes current sessions.

`SESSION_COOKIE_SECURE` is derived from an HTTPS `PUBLIC_BASE_URL` unless
explicitly overridden. Rotating `SESSION_SECRET` signs everyone out and
invalidates provider tokens signed with the old value.

## Roles

Each user currently has exactly one role:

| Role | Project access | Project mutations | Catalog access | Project releases |
| --- | --- | --- | --- | --- |
| `viewer` | browse and review | none | none | inspect |
| `designer` | browse and review | import, sync, comments, workflows, organization | create and edit drafts; Released after QA | start builds, Designer sign-off, publish after dual sign-off |
| `qa` | browse and review | none | QA review actions | QA sign-off, publish after dual sign-off |
| `admin` | full | full | full | either sign-off with a written override, publish |

This is not a composable permission model. `designer` covers both project work
and catalog authoring. Independent QA still requires a separate `qa` account.

Use `BOOTSTRAP_ADMIN_USERS_STR` only to establish initial administrators. After
first login, manage ordinary assignments in Settings. `DEFAULT_VIEWER_DOMAINS_STR`
can grant implicit viewer access to trusted domains; leave it empty when every
user must be explicitly approved.

## Guest mode

```env
AUTH_ENABLED=false
DEV_GUEST_ROLE=viewer
```

Guest mode removes the login wall and grants the selected role to every request.
Use it only for a deliberately public read-only demonstration or a private local
development instance. Never use guest `admin` on a shared network.

A single-user evaluation that must start builds **and** complete dual sign-off
should set `DEV_GUEST_ROLE=admin`. A guest `designer` cannot skip the QA slot.

`DEV_MODE` does not disable authentication.

## KiCad Remote Symbol Provider OAuth

KiCad discovers Prism's authorization metadata and uses an authorization-code
flow with PKCE. The resulting token is scoped to `remote_symbols.read` and cannot
mutate projects, catalog state, or administration settings.

Provider authentication uses the same Prism login as the browser. If a Prism
session already exists, KiCad authorize-and-done continues. If not, the user is
sent to the Prism login page (`/?next=…`) and returned to `/oauth/authorize`.
The resulting token is still scoped to `remote_symbols.read`. See
[Remote Symbol Provider](REMOTE_SYMBOL_PROVIDER.md).

## Service clients

Administrators can create service clients for PLM link-out or automation.
Secrets are displayed once and must be stored in the caller's secret manager.
Use the narrowest scope:

- `api:read` for links, lookups, and synchronization reads;
- `api:write` only for an integration that genuinely needs supported mutations.

Do not reuse KiCad provider tokens as general API credentials.

Prism can also validate externally issued JWTs when issuer, audience, role
claim, and scope claim settings are configured. Audience validation is
mandatory.

## Access review checklist

At least quarterly:

1. review bootstrap administrators and explicit role assignments;
2. remove departed accounts and confirm their sessions are revoked;
3. rotate unused service clients;
4. review OIDC redirect URIs, password-auth settings, and allowed origins;
5. confirm guest mode is disabled;
6. verify the public backend port is not directly reachable;
7. test a viewer account and each catalog role.
