# KiCAD Prism documentation

Stable operators should start from the latest GitHub Release. Contributors and
testers of unreleased behavior work from `dev`.

## Evaluate Prism

- [Platform overview](OVERVIEW.md) explains capabilities and current boundaries.
- [Getting started](GETTING_STARTED.md) covers stable-bundle and source-based
  private evaluations.
- [Architecture](ARCHITECTURE.md) describes services, persistence, jobs, and
  trust boundaries.
- [Team adoption](TEAM_ADOPTION.md) proposes a staged team rollout.

## Install and operate Prism

- [Deployment](DEPLOYMENT.md) covers the digest-pinned stable release bundle,
  OIDC, TLS, storage, sizing, and legacy source fallback.
- [Configuration](CONFIGURATION.md) explains release and source environment
  settings plus project-level `.prism.json`.
- [Authentication and access](AUTHENTICATION_AND_ACCESS.md) covers OIDC,
  sessions, roles, and service clients.
- [Operations](OPERATIONS.md) covers backup, restore, bundle upgrades, rollback,
  capacity, and diagnosis.
- [Upgrades and backups](UPGRADES.md) is the step-by-step upgrade procedure,
  the `prism_backup.py` archive tool, and the rules a schema migration follows.
- [Release process](RELEASES.md) documents `dev` to `main` promotion, tag
  validation, image policy, and release assets.

## Use Prism

- [Project workflows](PROJECT_WORKFLOWS.md) covers import, synchronization,
  browser review, comments, comparisons, jobsets, and assets.
- [Library Manager](LIBRARY_MANAGER.md) covers component import, revisions, QA,
  release, KLC checks, and DBL export.
- [Remote Symbol Provider](REMOTE_SYMBOL_PROVIDER.md) covers connecting desktop
  KiCad and placing released components.

## Participate

- [Contributing](../CONTRIBUTING.md) explains development branches, checks, and
  pull requests.
- [Reporting issues](REPORTING_ISSUES.md) covers bugs, features, documentation,
  and security reports.
- [Security policy](../SECURITY.md) explains private vulnerability reporting.

## Documentation policy

These files describe supported user, contributor, and operator behavior.
Temporary plans, benchmark transcripts, conference notes, and completed
migration records belong in an issue, discussion, pull request, or release
artifact where their date and status remain clear.

Update documentation in the same pull request as behavior or configuration.
Examples must use placeholders rather than credentials, internal hostnames, or
production data.
