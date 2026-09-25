# Release Studio operations

## Executor and CI

Release execution is pinned to the KiCad executor image declared in
`backend/Dockerfile`. The built image writes the exact OCI reference used by
`FROM` to `/etc/prism/kicad-base-image`; runtime release work identifies that
same value through `PRISM_RELEASE_EXECUTOR_IMAGE`. The live contract requires
a lowercase SHA-256 image digest and KiCad `10.0.4`.

The image, CI, and host tools all install `requirements/runtime.lock`. The lock
contains the coordinated published `kicad-monkey` and `kicad-cruncher` pair;
`scripts/verify_dependency_identity.py` rejects a runtime whose Python or
toolchain versions differ. The optional local image replaces both packages
from one modern upstream monorepo checkout and never overlays a lone local
Monkey on an unrelated published Cruncher.

The live release suite runs `kicad-cli` with argument vectors, not shell
interpolation. The required quality gate on the core merge paths builds the
pinned AMD64 image and fails on zero tests, skips, failures, or errors.

## Live build console

While a build runs, the Build stage tails job stdout through
`/api/jobs/{id}/logs` (same endpoint as 3D asset generation). Output appears in
**ObserveBuildStep** as the worker progresses. Finished runs do not replay this
stream; archived diagnostics remain in build evidence.

**Cancel build** requests fenced cancellation and remains available after a
reload when the attempt has a persisted job identity.

## Forge tokens

Prism's workspace SSH key can clone; it cannot create a GitHub or GitLab
Release. Set workspace environment:

```text
GITHUB_TOKEN=<token with contents:write>
GITLAB_TOKEN=<token with api scope>
```

Use GitHub's token for `github.com` remotes and GitLab's token for GitLab
hosts. The tokens are also required to:

- check whether a tag already exists (`GET .../tags/{tag}`);
- list prior Releases for cover revision history; and
- publish the dossier zip.

Without write scope, publish returns HTTP 403 with copy that asks for write
scope. Without any token, tag-existence checks and release history degrade
gracefully (Identity may allow progress; history shows the current row only).
Tokens are workspace-level, not per-user OAuth.

## Retention and garbage collection

Release pins are indefinite liveness markers for the artifacts referenced by
dossiers and evidence. Metadata pruning excludes pinned artifacts. Unpinned
artifacts remain subject to ordinary retention. Pins have no TTL.

## Troubleshooting

- A failed or cancelled build: open the retained attempt and inspect its
  archived diagnostics. Neither status can be published; start a new attempt.
- A running build: use the live console on the Build stage. **Cancel build**
  remains available after a reload when the attempt has a persisted job
  identity.
- A tag clash at Identity: choose an unused tag. Tags are never overwritten.
- A tag clash at Publish after an API outage during Identity: the forge refused
  the Release; start a new build with a different tag.
- A missing source file: confirm board and schematic paths at the
  selected commit. Use Source discovery or fix the KiCad project layout.
- A missing vendor pack: confirm the selected profile's complete artifact set;
  for JLCPCB, Gerbers, drill, `bom.csv`, `cpl.csv`, `bom.xlsx`, and `cpl.xlsx`
  are all required.
- A publish refusal: confirm `GITHUB_TOKEN` / `GITLAB_TOKEN` has write scope,
  the remote is GitHub or GitLab, and the tag is unused.
- Host-absolute `fp-lib-table` URIs: these are warnings. They do not fail the
  build. Footprints already in the `.kicad_pcb` still export.

## Backup and restore

Back up PostgreSQL release records, configuration-owning Git repositories, and
the artifact object store together. A restore is incomplete if database
metadata is restored without the dossiers it addresses.
