# Release Studio

Release Studio turns a KiCad revision into inspectable manufacturing documents
and a zip attached to a GitHub or GitLab Release.

The GitHub or GitLab tag is the drawing revision. It is named before the build
so PDFs bake it in.

## Start here

- [User guide](USER_GUIDE.md) — Source through Publish.
- [Release inputs](CONFIGURATION.md) — per-release identity, manufacturing, and
  discovered KiCad paths.
- [Artifacts](ARTIFACTS.md) — dossiers, vendor packs, and canonicalization.
- [Operations](OPERATIONS.md) — executor, tokens, live logs, and diagnosis.
- [Architecture](ARCHITECTURE.md) — immutable build identity and publish sink.
- [Testing](TESTING.md) — automated checks and live KiCad coverage.

Signed policy evaluation, cryptographic attestations, Prism waivers, and
offline verify are frozen on `feature/release-studio-governance`. They are not
part of the running product. See [GOVERNANCE.md](GOVERNANCE.md). Project
releases use Library Manager-shaped dual sign-off bound to the dossier digest,
then a GitHub or GitLab Release as the public record.

## Canonical flow

1. **Source** — pick the Git revision, board, schematic, variant, and
   KiCad BOM preset. Prism discovers candidates from the imported project at
   the selected commit. No Prism YAML and no Save & publish. A full 40-character
   SHA may be pasted when it is older than the recent-commit list.
2. **Identity** — enter tag, Document Name, date, and release notes. The tag
   becomes the drawing revision and the forge Release name. If the tag already
   exists on the remote, Identity blocks here.
3. **Manufacturing** — per-release build inputs: IPC classes, board finish
   colours, via treatment, manufacturer packs, optional stackup PDF, optional
   impedance CSV.
4. **Build** — starts only after Identity and Manufacturing are complete.
   Materialize the commit, run the KiCad pipeline, and store documents,
   members, evidence, and a dossier. Live job stdout streams to the Build
   stage while the worker runs.
5. **Outputs** — inspect composed PDFs and dossier members. Designer and QA
   sign off here; decisions bind to this dossier digest. Unwaived DRC/ERC
   errors block designer/QA sign-off; an admin can override with a written
   note. Warnings do not block.
6. **Publish** — confirm only after both slots are approved and every selected
   vendor pack is ready. Prism attaches the dossier zip plus those packs. The
   Release name is the tag.

Host-absolute library table URIs and missing `.pretty` entries are recorded as
warnings. They do not block the build or the forge publish.
