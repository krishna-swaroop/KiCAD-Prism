# Security policy

## Supported code

Security fixes are evaluated against the latest published release and the
current `dev` branch. Older deployments should first determine whether the
problem still exists in one of those versions.

## Report a vulnerability privately

Do not open a public issue or discussion for a suspected vulnerability.

Use GitHub's private vulnerability report:

<https://github.com/krishna-swaroop/KiCAD-Prism/security/advisories/new>

Include:

- affected release or commit;
- deployment and authentication mode;
- prerequisites and attack path;
- minimal reproduction steps or proof of concept;
- expected security boundary and observed result;
- potential impact;
- any suggested mitigation;
- whether the issue has been disclosed elsewhere.

Do not test against an installation you do not own or have permission to assess.
Do not include production credentials, private keys, proprietary designs, or
personal data unless a maintainer provides an approved secure transfer method.

## Response and disclosure

Maintainers will validate scope, affected versions, severity, and a remediation
path. Timelines depend on impact and maintainer availability. Coordinate public
disclosure through the private advisory so users have a reasonable opportunity
to update.

## Operational security

Operators should:

- enable OIDC for shared installations;
- use HTTPS and exact allowed origins;
- keep backend, workers, and PostgreSQL off the public network;
- use narrowly scoped Git and service credentials;
- verify SSH host keys;
- back up PostgreSQL, project storage, and SSH state;
- keep secrets and private certificates outside Git;
- review roles, sessions, and service clients regularly.

See [Deployment](docs/DEPLOYMENT.md),
[Authentication and access](docs/AUTHENTICATION_AND_ACCESS.md), and
[Operations](docs/OPERATIONS.md).
