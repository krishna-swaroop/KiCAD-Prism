# Reporting issues

Use the repository's GitHub issue forms for reproducible bugs, feature requests,
and documentation problems. Search open and closed issues before creating a new
one.

## Bugs

Include:

- the Prism commit SHA or release tag;
- whether the installation uses a release bundle or a source build;
- the `VERSION` value and sanitized image digests for a release bundle;
- deployment architecture and operating system;
- browser and KiCad versions where relevant;
- affected project surface;
- exact steps to reproduce;
- expected and actual behavior;
- sanitized logs and job identifiers;
- whether the problem reproduces on a small public project.

Do not attach proprietary KiCad projects, credentials, tokens, private Git URLs,
database dumps, or SSH material to a public issue.

Use a minimal public reproducer when possible. If the problem requires private
design data, first report the behavior without the data and wait for a maintainer
to propose a secure transfer method.

## Feature requests

Describe the engineering workflow and the decision Prism should make easier.
Include the people involved, the current workaround, and the acceptance outcome.
Avoid prescribing a database or UI implementation before the workflow is
understood.

For major product changes, start a GitHub Discussion when available. A
maintainer can convert an agreed proposal into implementation issues.

## Documentation problems

Open a bug and select the documentation area. Include the page, the incorrect or
missing information, and the behavior you observed. Documentation corrections
are welcome as pull requests.

## Security vulnerabilities

Do not open a public issue. Follow [SECURITY.md](../SECURITY.md) and use GitHub's
private vulnerability reporting when it is enabled. Include enough information
to reproduce and assess impact without testing against systems you do not own.

## Support questions

Use GitHub Discussions for setup questions and workflow advice when available.
Issues should describe a defect or an actionable product/documentation change.

## Triage expectations

Maintainers may ask for:

- a current `dev` reproduction;
- a smaller test project;
- full sanitized stack traces;
- Compose configuration with secrets removed;
- architecture and image details;
- confirmation that the documented deployment or upgrade steps were followed.

An issue can be closed when it cannot be reproduced and the reporter cannot
provide the requested evidence. It can be reopened when new evidence is
available.
