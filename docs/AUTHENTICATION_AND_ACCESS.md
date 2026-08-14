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

## Local password login

For teams without an SSO provider, Prism can authenticate with an email and
password. It coexists with OIDC: a deployment can enable either, or both.

```env
AUTH_ENABLED=true
PASSWORD_AUTH_ENABLED=true
PASSWORD_MIN_LENGTH=12          # default; the bcrypt limit of 72 bytes is enforced
SESSION_REMEMBER_ME_DAYS=30    # lifetime of a "remember me" session
SESSION_SECRET=<random-value>
BOOTSTRAP_ADMIN_USERS_STR=admin@example.com
```

When `AUTH_ENABLED=true`, at least one method must be configured: OIDC (all three
of issuer, client id, secret) or `PASSWORD_AUTH_ENABLED=true`. A half-configured
OIDC still fails closed. Password and OIDC share the same role model
(`ALLOWED_USERS_STR`, `ALLOWED_DOMAINS_STR`, role assignments) and the same
session machinery.

Accounts are provisioned by administrators, not self-registered. In Settings →
Access, an admin assigns a role and sets a password. Admin-set passwords must be
changed by the user on next sign-in and are stored only as bcrypt hashes.
Resetting or removing a role revokes the user's sessions.

### First login on a password-only deployment

Without OIDC there is no external identity to seed the first admin, so
`BOOTSTRAP_ADMIN_USERS` alone grants the admin role but leaves no way to sign
in. Set a one-time bootstrap password to break that cycle:

```env
PASSWORD_AUTH_ENABLED=true
BOOTSTRAP_ADMIN_USERS_STR=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=<a strong one-time value>
```

On first startup Prism seeds this password for each bootstrap admin that has no
credential yet, always flagged must-change. The admin signs in, is forced to set
a real password, and then provisions everyone else. It never overwrites an
existing password, so a restart cannot reset a changed one. Remove
`BOOTSTRAP_ADMIN_PASSWORD` from the environment afterwards; the backend warns at
startup while it is still set.

Users can change their own password (which revokes their other sessions), and
tick "Remember me" to extend their session to `SESSION_REMEMBER_ME_DAYS`. A
failed sign-in returns a single generic error and is rate limited, so responses
never reveal whether an email has an account.

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

| Role | Project access | Project mutations | Catalog access |
| --- | --- | --- | --- |
| `viewer` | browse and review | none | none |
| `designer` | browse and review | import, sync, comments, workflows, organization | read |
| `component_designer` | browse and review | none | create and edit drafts |
| `component_qa` | browse and review | none | QA and release actions |
| `admin` | full | full | full |

This is not yet a composable permission model. A person who must both import
projects and author catalog components needs `admin` today. Account for that
constraint when assigning responsibilities.

Use `BOOTSTRAP_ADMIN_USERS_STR` only to establish initial administrators. After
first login, manage ordinary assignments in Settings. `DEFAULT_VIEWER_DOMAINS_STR`
can grant implicit viewer access to trusted domains; leave it empty when every
user must be explicitly approved.

## Restricting who can sign in

Two settings gate which addresses are allowed to authenticate at all. They apply
to both OIDC and password login on identical terms, so setting them once covers
every method.

```env
ALLOWED_DOMAINS_STR=example.com,example.org   # only these email domains may sign in
ALLOWED_USERS_STR=alice@example.com           # only these exact addresses may sign in
```

Each is empty by default, meaning no restriction. When set, an address must be in
`ALLOWED_USERS_STR` if that list is non-empty, and its domain must be in
`ALLOWED_DOMAINS_STR` if that list is non-empty; both apply together. A login that
fails either check is rejected before any role is considered.

This is a gate, not a grant. Passing it only lets the login proceed; the account
still needs a role (an explicit assignment, or an implicit viewer role from
`DEFAULT_VIEWER_DOMAINS_STR`) or access is denied. To let anyone from a trusted
domain in as a viewer automatically, use `DEFAULT_VIEWER_DOMAINS_STR`; to allow a
domain to sign in but still require an explicit role, use `ALLOWED_DOMAINS_STR`.

## Guest mode

```env
AUTH_ENABLED=false
DEV_GUEST_ROLE=viewer
```

Guest mode removes the login wall and grants the selected role to every request.
Use it only for a deliberately public read-only demonstration or a private local
development instance. Never use guest `admin` on a shared network.

`DEV_MODE` does not disable authentication.

## KiCad Remote Symbol Provider OAuth

KiCad discovers Prism's authorization metadata and uses an authorization-code
flow with PKCE. The resulting token is scoped to `remote_symbols.read` and cannot
mutate projects, catalog state, or administration settings.

Provider authentication depends on the same OIDC identity provider but uses a
separate Prism authorization server and redirect URI. See
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
4. review OIDC redirect URIs and allowed origins;
5. confirm guest mode is disabled;
6. verify the public backend port is not directly reachable;
7. test a viewer account and each catalog role.
