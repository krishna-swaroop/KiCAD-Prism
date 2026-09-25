# KiCAD Prism documentation

Stable operators should start from the latest GitHub Release. Contributors and
testers of unreleased behavior work from `dev`.

## Release notes

- [v4.0.0-alpha](releases/v4.0.0-alpha.md) covers the next major alpha and its
  catalog migration requirements; it supersedes the unpublished v3.1 plan.

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
- [Connect Prism to GitHub](GITHUB_APP_SETUP.md) and
  [Connect Prism to GitLab](GITLAB_SETUP.md) walk through setting up the
  connection that publishes comments as issues.
- [Tracker integration](TRACKER_INTEGRATION.md) covers the issue tracker's
  environment, webhooks, polling, credential rotation, and recovery.
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
- [Design variants](PROJECT_WORKFLOWS.md#design-variants) describes assembly
  selection, effective BOM data, and DNP visibility.
- [PCB review tools](PROJECT_WORKFLOWS.md#pcb-labels-and-net-review) covers
  labels, multiple highlighted nets, and routing statistics.
- [Live comments](architecture/live-comments.md) describes revision anchors,
  reconnect behavior, and transport rollback.
- [Release Studio](release-studio/README.md) covers committed-revision
  manufacturing documents, dual sign-off, and GitHub/GitLab publish.

## Contributor references

- [Dependency identity](DEPENDENCIES.md) covers Python, JavaScript, and native pins.
- [Experimental Rust PCB geometry](PCB_RUST_GEOMETRY.md) covers explicit
  opt-in, limitations, verification, and rollback.
- [Design comparison](design-comparison/README.md) maps comparison contracts.

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
