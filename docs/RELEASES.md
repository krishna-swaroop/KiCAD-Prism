# Release process

This document defines how KiCAD Prism moves from feature development to a stable
release. It is for maintainers; users should follow [Deployment](DEPLOYMENT.md).

## Branch policy

- Feature and fix branches target `dev` through pull requests.
- `dev` is the integration branch and always uses source builds.
- `main` contains stable, releasable code.
- Direct changes to `dev` or `main` are not part of the release process.
- Both branches require the `Quality gate`; force pushes should remain disabled.

The quality workflow runs frontend lint, tests and builds, backend tests,
semantic viewer tests and builds, source Compose validation, release Compose
validation, and release-bundle tests.

## What does not publish images

No container image is published for:

- pull requests;
- feature branches;
- pushes or merges to `dev`;
- ordinary pushes to `main`;
- manual workflow dispatch.

Contributors therefore build from source without consuming release-publishing
resources.

## Create a release

1. Freeze the intended release scope on `dev`.
2. Ensure required pull requests and the `dev` quality gate pass.
3. Open and review a `dev` to `main` pull request.
4. Merge it without bypassing `main` protection.
5. Wait for the `main` push `Quality gate` to succeed.
6. Create an immutable semantic-version tag pointing to that commit.
7. Push the tag once.

Examples:

```text
v3.0.0
v3.0.0-alpha
v3.0.0-alpha.1
```

Build metadata such as `v3.0.0+build.1` is not accepted because it is not a
valid Docker tag under this release contract.

Do not move, reuse, or delete a tag after publication.

## Validation before builds

The tag workflow performs a small validation job before building images:

1. validate the semantic version;
2. resolve the tag to its commit;
3. require that commit to be contained in `main`;
4. require a successful `Quality gate` push run for the same commit on `main`.

A tag created from unreleased `dev` or feature work fails before Docker builds.
If the tag was pushed before the `main` quality run completed, wait for that run
and rerun the failed tag workflow. Do not create another tag for the same
release.

## Build and smoke test

The release job runs on a GitHub-hosted Linux AMD64 runner. It:

1. builds one backend image and one frontend image locally;
2. starts PostgreSQL, API, general worker, catalog worker, and frontend from
   those local images;
3. waits for service health;
4. verifies API readiness, frontend health, both worker processes, embedded Git
   revision, `x86_64`, and `kicad-cli --version`;
5. tears down the test stack;
6. logs into GitHub Container Registry only after all smoke checks pass.

A smoke-test failure publishes no Prism images or GitHub Release.

## Image policy

Images:

```text
ghcr.io/krishna-swaroop/kicad-prism-backend
ghcr.io/krishna-swaroop/kicad-prism-frontend
```

For stable `v3.1.2`:

```text
3.1.2
3.1
3
latest
```

For prerelease `v3.1.2-alpha.1`:

```text
3.1.2-alpha.1
```

Prereleases never update `latest`, major, or minor tags.

Only Linux AMD64 release images are currently published. Native ARM64 support
requires a public, reproducible ARM64 KiCad base and independent native smoke
testing; it must not be represented by an AMD64 image running under emulation.

## Release assets

After image publication, automation:

1. reads the exact registry digests of the tested images;
2. renders the deployment `.env.example` with those digests;
3. creates `VERSION` and internal `SHA256SUMS`;
4. creates the AMD64 deployment archive and external archive checksum;
5. creates or updates the matching GitHub Release;
6. marks tags with a suffix as prereleases.

Stable releases become GitHub's latest release. Prereleases do not.

## Failed workflow

- Validation failure: correct the branch, quality-gate, or tag problem. Never
  move a published tag.
- Build or smoke failure: fix the source through `dev`; use a new version tag
  after promotion to `main`.
- Transient failure before publication: rerun the existing tag workflow.
- Failure after partial registry publication: investigate before rerunning and
  verify the final release bundle contains the intended image digests.

Do not manually publish substitute images under a release tag.
