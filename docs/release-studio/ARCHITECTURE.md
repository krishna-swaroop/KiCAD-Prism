# Release Studio architecture

## Immutable boundaries

Release Studio separates these identities:

| Boundary | What it binds |
| --- | --- |
| Commit and configuration snapshot | Exact Git tree, synthesized or committed configuration, variant, tag, Document Name, date, and selected KiCad paths. |
| Input closure | Repository files, submodules, LFS bytes, library resolution, environment bindings, and verified toolchain resources. Missing or host-absolute library URIs are recorded as non-hermetic. |
| Candidate and build attempt | Technical build identity plus one queued/running/succeeded/failed/cancelled execution; failed and cancelled attempts are retained. |
| Dossier | Canonical technical members, manifest, evidence references, and technical scope fingerprints. |
| Forge Release | A GitHub or GitLab Release on the imported remote, tagged at the build commit, named with the tag, with the dossier zip attached. |

The build/candidate is authoritative. Browser fields do not supply build
identity after enqueue. Every attempt remains reachable. Publishing does not
rewrite the build; it creates a forge Release that points at the same commit.

## Identity before build

Tag, Document Name, date, and release notes are entered in Identity before the
pipeline starts. The tag is the drawing revision and the forge Release name.
Prism checks tag existence on the remote during Identity; synthesis bakes these
values into the configuration snapshot that document composition consumes.

## Configuration mapping

The normal path synthesizes the configuration mapping from per-release UI
inputs (`synthesize_configuration`) rather than loading committed Git YAML.
When board and schematic are present on the job payload, synthesis
replaces the committed-configuration lookup. Committed YAML under
`.prism/release-studio/configurations/` remains a fallback when those paths are
omitted.

## Pipeline

The pipeline starts only after Identity and Manufacturing are complete. Prism
materializes the commit closure, then runs the pinned KiCad/Prism catalogue.
Cheap DRC/ERC, board facts, positions, and BOM work can overlap assembly
projections; Gerbers, drill, and schematic output
follow; document composition (including optional impedance pages and stackup
append), vendor generation, member canonicalization, and deterministic dossier
assembly complete the technical side.

Build evidence records step output and timings but does not enter the
technical manifest digest. Hermeticity is recorded; it does not gate download
or forge publish.

## Data model

Technical tables retain configurations, candidates, closure entries, builds,
members/domains, evidence, projections, scope fingerprints, artifact pins,
review decisions, and publish records. Governance tables from the archived
signed-release work remain in the schema but are unused by the running API.

## Security and trust boundaries

The technical digest never includes UI identity, candidate/build IDs, or
timestamps. Paths and closure inputs are constrained to the materialized
commit or verified resources. Forge publish uses a workspace token with write
scope; the clone SSH key is not sufficient. The same token is used for
`list_releases` and `tag_exists`.
