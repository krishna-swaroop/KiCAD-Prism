# Release Studio artifacts

## What a build retains

A successful build retains an immutable technical dossier, a separate build-
evidence archive, member metadata, domain fingerprints, projections, and logs.
The dossier contains canonical release bytes, including:

- `manifest.json` with sorted member paths, canonicalizer identities, released
  digests, media types, member kinds, domains, and technical digest graph;
- fabrication material such as Gerbers and Excellon drill files;
- assembly material such as BOM and component-position/CPL files;
- documentation PDFs (cover, fabrication, assembly, testpoint, drill,
  schematic, and BOM); and
- `manifest.json` references to the technical digest graph and projection
  digests, rather than the full projection payload.

The separate build-evidence archive retains full board facts, DRC/ERC reports,
per-step logs, timings, and raw pre-canonical material. Those payloads are
excluded from the dossier and its manifest digest so wall-clock data does not
change the released technical identity.

## Documentation PDFs

**Cover** — title block with DOCUMENT, REVISION (tag), DATE, COMMIT, VARIANT;
revision history (this release, then prior forge Releases when the API
succeeds); board characteristics; manufacturing and assembly spec from IPC
fields.

**Fabrication** — Prism layer plots, then optional controlled-impedance table
pages when an impedance CSV was uploaded, then an optional vendor stackup PDF
appended unchanged.

**BOM** — release BOM CSV from the selected KiCad preset, plus a typeset BOM
PDF derived from that CSV. The JLCPCB vendor pack keeps its own vendor BOM
separate from the release BOM.

## Live build logs

While a build runs, job stdout streams to the Build stage through
`/api/jobs/{id}/logs`. This is the same tail mechanism as 3D asset generation.
Live logs are not persisted for the UI; reopening a finished run shows step
status on the pipeline rail but does not replay live.log. Archived per-step
logs remain in build evidence.

## Canonicalization invariants

Canonical JSON sorts keys, emits compact UTF-8 JSON, NFC-normalizes strings,
rejects non-string keys/NFC collisions and non-finite numbers. Artifact
canonicalizers remove only recognized, non-manufacturing volatile metadata:
KiCad creation dates in Gerber/Excellon/job JSON/report outputs, known CSV
generation headers, STEP timestamps, SVG metadata/date comments, PDF metadata,
and board-stat timestamps.

Deterministic archives use sorted POSIX-safe member names and stable ownership,
timestamps, and gzip metadata. Equivalent exports at different wall-clock times
must yield identical released bytes, while their raw digests may differ.

## Vendor readiness and packs

A vendor upload pack is a derived convenience archive assembled from the
dossier plus profile-specific evidence. It does not replace the dossier
members.

Selected profiles must produce all artifacts their profile promises before they
are considered ready. For JLCPCB that means Gerbers, drill, `bom.csv`,
`cpl.csv`, `bom.xlsx`, and `cpl.xlsx`.

## Forge zip

**Publish** repacks dossier members into a zip (`{project}-{tag}.zip`) and
attaches it to a GitHub or GitLab Release. The Release name is the tag. The zip
is the same files as the stored dossier, in a forge-friendly container. Signed
attestation archives are not produced by the running product; that format lives
on `feature/release-studio-governance`.
