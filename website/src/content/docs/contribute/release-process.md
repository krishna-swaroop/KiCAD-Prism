---
title: Release process
description: How a tested dev branch becomes a tagged Prism release with published images and a deployment bundle.
sidebar:
  order: 4
---

This page is for maintainers cutting a Prism release. Operators installing one
should follow [Deployment](/KiCAD-Prism/admin/deployment/) and
[Upgrades](/KiCAD-Prism/admin/upgrades/).

## Branches

- Feature and fix branches merge into `dev` through pull requests.
- `dev` is the integration branch for the next release. It is always built
  from source.
- `main` holds released code. It only moves through a reviewed pull request
  from `dev`.
- Both branches require the **Quality gate**. Nobody pushes to them directly,
  and force pushes stay disabled.

The **Quality gate** covers frontend lint, tests and builds, the backend suite,
the semantic viewer's tests and build, the Rust workspace (format, clippy,
generated contracts, licence and source policy, tests on Linux, macOS and
Windows, the WebAssembly build, hygiene) with projection parity, the source and
release Compose files, and the release-bundle tests.

## What never publishes images

Pull requests, feature branches, pushes and merges to `dev`, ordinary pushes
to `main` and manual workflow runs publish nothing. Only a version tag on
`main` does.

## Cut a release

1. Freeze the release scope on `dev`.
2. Wait for every pull request in scope to merge and for the `dev`
   **Quality gate** to pass.
3. Write the release notes as `docs/releases/<tag>.md`, for example
   `docs/releases/v5.2.0.md`, and merge them into `dev`. The file must not be
   empty: it becomes the GitHub Release text and `RELEASE_NOTES.md` in the
   deployment bundle.
4. Open a pull request from `dev` to `main` and get it reviewed and approved.
5. Merge it without bypassing `main`'s protection.
6. Wait for the **Quality gate** run on the `main` push to succeed.
7. Create the tag on that `main` commit:

   ```bash
   git tag v5.2.0 <main commit>
   ```

8. Push the tag, once:

   ```bash
   git push origin v5.2.0
   ```

Tags are `v<major>.<minor>.<patch>`, optionally with a prerelease suffix:
`v5.2.0`, `v5.2.0-alpha`, `v5.2.0-alpha.1`. Build metadata such as
`v5.2.0+build.1` is refused, because it is not a valid Docker tag.

:::caution
Never move, reuse or delete a tag once it is published. Fix problems with a new
version.
:::

## What the tag workflow does

The **Tagged release images** workflow runs on every `v*` tag.

### Validation

Before any build, it checks that:

1. the tag is a valid version;
2. `docs/releases/<tag>.md` exists and is not empty;
3. the tagged commit is on `main`;
4. that commit has a successful **Quality gate** push run on `main`.

A tag made from `dev` or a feature branch fails here. If you pushed the tag
before the `main` run finished, wait for the run and re-run the failed tag
workflow; don't create another tag.

### Build and smoke test

On a GitHub-hosted Linux AMD64 runner, it:

1. builds the backend and frontend images locally;
2. starts PostgreSQL, the API, both workers and the frontend from them;
3. waits for every service to be healthy;
4. checks API readiness, frontend health, both worker processes, the embedded
   Git revision, the `x86_64` architecture, and `kicad-cli --version` and
   `prism-kicad --version` in the API and the worker;
5. tears the test stack down.

Only after every check passes does it sign in to the GitHub Container Registry.
A failed smoke test publishes nothing.

### Images

| Image | |
| --- | --- |
| `ghcr.io/krishna-swaroop/kicad-prism-backend` | API and both workers |
| `ghcr.io/krishna-swaroop/kicad-prism-frontend` | web app and proxy |

A stable tag such as `v5.2.0` publishes `5.2.0`, `5.2`, `5` and `latest`. A
prerelease such as `v5.2.0-alpha.1` publishes only `5.2.0-alpha.1`, never the
floating tags.

Only Linux AMD64 images are published. ARM64 images need a public,
reproducible ARM64 KiCad base and their own native smoke test; an AMD64 image
running under emulation does not count.

### Deployment bundle

After publishing the images, the workflow:

1. reads the exact registry digests of the images it tested;
2. writes the bundle's `.env.example` with those digests;
3. adds `VERSION`, `RELEASE_NOTES.md` and a `SHA256SUMS` file over the bundle;
4. packs `kicad-prism-<tag>-linux-amd64.tar.gz` and its `.sha256` checksum;
5. creates or updates the GitHub Release for the tag.

A tag with a prerelease suffix is marked as a prerelease. A stable release
becomes GitHub's latest release; a prerelease does not.

## When the workflow fails

| Failure | What to do |
| --- | --- |
| validation | fix the branch, the quality gate run or the notes file, and re-run. Never move the tag. |
| build or smoke test | fix it through `dev`, promote to `main` again, and use a new version tag |
| a transient error before publishing | re-run the same tag workflow |
| after some images were published | investigate before re-running, and check the final bundle holds the digests you intended |

Never publish substitute images under a release tag by hand.

## Other release workflows

These are separate from the server release and run on their own:

- **Native release** builds the `prism-kicad` binaries and the WebAssembly
  package. It runs manually (a dry run unless you choose to publish) or on a
  `prism-kicad-v<version>` tag.
- **Build KiCad Plugin** builds the desktop plugin for macOS, Linux and
  Windows. It runs only manually, and can attach the result to a GitHub
  Release.
