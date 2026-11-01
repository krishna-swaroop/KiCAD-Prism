# KiCAD Prism documentation

Stable operators should start from the latest GitHub Release. Contributors and
testers of unreleased behavior work from `dev`.

## Release notes

- [v5.2.0-alpha](releases/v5.2.0-alpha.md) is the latest alpha: catalog
  authoring over MCP and the documentation website.
- Earlier: [v5.1.0-alpha](releases/v5.1.0-alpha.md),
  [v5.0.2-alpha](releases/v5.0.2-alpha.md),
  [v5.0.1-alpha](releases/v5.0.1-alpha.md),
  [v5.0.0-alpha](releases/v5.0.0-alpha.md),
  [v4.0.0-alpha](releases/v4.0.0-alpha.md).

## Evaluate Prism

- [Platform overview](https://krishna-swaroop.github.io/KiCAD-Prism/get-started/what-is-prism/)
  explains capabilities and current boundaries.
- [Getting started](https://krishna-swaroop.github.io/KiCAD-Prism/get-started/try-it/)
  covers stable-bundle and source-based private evaluations.
- [Architecture](https://krishna-swaroop.github.io/KiCAD-Prism/contribute/architecture/)
  describes services, persistence, jobs, and trust boundaries.
- [Team adoption](https://krishna-swaroop.github.io/KiCAD-Prism/get-started/team-adoption/)
  proposes a staged team rollout.

## Install and operate Prism

- [Deployment](https://krishna-swaroop.github.io/KiCAD-Prism/admin/deployment/)
  covers the digest-pinned stable release bundle, OIDC, TLS, storage, sizing,
  and legacy source fallback.
- [Configuration](CONFIGURATION.md) explains release and source environment
  settings plus project-level `.prism.json`.
- [Authentication and access](https://krishna-swaroop.github.io/KiCAD-Prism/admin/authentication/)
  covers OIDC, sessions, roles, and service clients.
- [Connect Prism to GitHub](https://krishna-swaroop.github.io/KiCAD-Prism/admin/github/)
  and [Connect Prism to GitLab](https://krishna-swaroop.github.io/KiCAD-Prism/admin/gitlab/)
  walk through setting up the connection that publishes comments as issues.
- [Tracker integration](https://krishna-swaroop.github.io/KiCAD-Prism/admin/issue-trackers/)
  covers the issue tracker's environment, webhooks, polling, credential
  rotation, and recovery.
- [Operations](https://krishna-swaroop.github.io/KiCAD-Prism/admin/operations/)
  covers backup, restore, bundle upgrades, rollback, capacity, and diagnosis.
- [Upgrades and backups](https://krishna-swaroop.github.io/KiCAD-Prism/admin/upgrades/)
  is the step-by-step upgrade procedure, the `prism_backup.py` archive tool, and
  the rules a schema migration follows.
- [Release process](https://krishna-swaroop.github.io/KiCAD-Prism/contribute/release-process/)
  documents `dev` to `main` promotion, tag validation, image policy, and release
  assets.

## Use Prism

- [Project workflows](https://krishna-swaroop.github.io/KiCAD-Prism/use/projects/)
  covers import, synchronization, browser review, comments, comparisons,
  jobsets, and assets.
- [Library Manager](https://krishna-swaroop.github.io/KiCAD-Prism/use/library-manager/)
  covers component import, revisions, QA, release, KLC checks, and DBL export.
- [Supply chain data](SUPPLY.md) covers distributor connectors, watching parts, BOM
  stock and cost, assessment and alerts.
- [Remote Symbol Provider](REMOTE_SYMBOL_PROVIDER.md) covers connecting desktop
  KiCad and placing released components.
- [Design variants](https://krishna-swaroop.github.io/KiCAD-Prism/use/variants-and-bom/)
  describes assembly selection, effective BOM data, and DNP visibility.
- [PCB review tools](https://krishna-swaroop.github.io/KiCAD-Prism/use/viewing-designs/#change-what-the-board-shows)
  covers labels, multiple highlighted nets, and routing statistics.
- [Insets](https://krishna-swaroop.github.io/KiCAD-Prism/use/viewing-designs/#open-insets)
  covers live PCB and schematic views opened from a pin or pad, chained insets,
  and their keys.
- [Live comments](architecture/live-comments.md) describes revision anchors,
  reconnect behavior, and transport rollback.
- [Release Studio](release-studio/README.md) covers committed-revision
  manufacturing documents, dual sign-off, and GitHub/GitLab publish.
- [Design data](https://krishna-swaroop.github.io/KiCAD-Prism/use/design-data/)
  explains how Prism prepares each revision, and what *Preparing design data…*
  and *could not be built* mean.
- [Simulation Studio](https://krishna-swaroop.github.io/KiCAD-Prism/use/simulation-studio/)
  (experimental, off by default) covers DC IR-drop setups, runs and results.
- [Automating Prism](https://krishna-swaroop.github.io/KiCAD-Prism/automate/overview/)
  covers personal access tokens, the `/api/v1` API, the Python SDK and `prism`
  CLI, and connecting AI assistants over MCP.

## Contributor references

- [System Builder](system-builder/README.md) was removed on 2026-10-23 and is
  being re-scoped on its own branch.

- [Native design bundle ADR](architecture/adr-native-design-bundle.md) and its
  amendments record why Prism parses KiCad in Rust, once per revision; the
  contracts are in `native/contracts/prism/` and the parity records in
  `native/parity/`.
- [Scripting and MCP ADR](architecture/adr-scripting-and-mcp.md)
  records how Prism becomes scriptable: the versioned API, tokens and scopes,
  and the MCP server.
- [Addressing](architecture/addressing.md) lists the `/project/:projectId`
  query parameters and the `prism://` resource URI grammar.
- [Dependency identity](https://krishna-swaroop.github.io/KiCAD-Prism/contribute/dependencies/)
  covers Python, JavaScript, and native pins.
- [Design comparison](design-comparison/README.md) maps comparison contracts.

## Participate

- [Contributing](../CONTRIBUTING.md) explains development branches, checks, and
  pull requests.
- [Reporting issues](https://krishna-swaroop.github.io/KiCAD-Prism/contribute/reporting-issues/)
  covers bugs, features, documentation, and security reports.
- [Security policy](../SECURITY.md) explains private vulnerability reporting.

## Documentation policy

These files describe supported user, contributor, and operator behavior.
Temporary plans, benchmark transcripts, conference notes, and completed
migration records belong in an issue, discussion, pull request, or release
artifact where their date and status remain clear.

Update documentation in the same pull request as behavior or configuration.
Examples must use placeholders rather than credentials, internal hostnames, or
production data.
