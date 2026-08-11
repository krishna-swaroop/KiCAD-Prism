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
