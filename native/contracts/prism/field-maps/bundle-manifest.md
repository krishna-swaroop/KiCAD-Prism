# Field map: `bundle.json` (`prism.bundle.manifest.a3`)

Root model `BundleManifestA3` in `tsp/prism/bundle-manifest-a3.tsp`. Example `examples/BundleManifestA3.example.json`. a3 is a2 plus `read_set` (ADR amendment K2; "a2 → a3" below).
Written by: WP-B, `native/src/rs/prism-bundle/` through `prism-kicad bundle build` (cli-spec.md §5.2). Stage: all three. Stage parse writes it first and stages board and models rewrite it (`bundle-format.md` §7).

The archive rules, the member table, stage semantics, readiness and reader validation are in [`bundle-format.md`](../bundle-format.md). This map covers the fields. Lineage is sim's `prism.bundle.manifest` a1: the TypeSpec `sim: contracts/contracts/bundle.tsp`, the Rust model `sim: src/prism-bundle/src/manifest.rs`, and the builder `sim: src/prism-bundle/src/build.rs`. It was measured at sim `a714101` with the working tree's uncommitted `bin/prism-bundle.rs` and `board_refs.rs`.

Two roots of other W0 contracts are embedded and referenced by `$id`: `generator` (`CliVersionA0`, field map `field-maps/cli.md`) and `config` (`RevisionKeyEffectiveConfigA1`, revision-key contract). Only their fields that this manifest's rules or readers use are listed below. The CLI's `CliFinding` is reused for stage errors (W0 request: move it to Common as `Finding`).

## Fields

Pointers are RFC 6901 with two extensions: `*` is every element of an array, `{key}` is every key of a map. One row per leaf and per array/map.

| Field (JSON pointer) | Type | Unit | Order / nullability | Today's source (path:line) | Consumers (path:line) | Parity note |
|---|---|---|---|---|---|---|
| `/schema` | const `"prism.bundle.manifest.a3"` | — | required | a1 `schema: "prism.bundle.manifest"` + `version: "a1"` (sim: `contracts/contracts/bundle.tsp:128-129`; `src/prism-bundle/src/build.rs:310-311`) | a1 reader's version gate (sim: `src/prism-bundle/src/reader.rs:41`) → B's reader and `--in` check (cli-spec.md §5.2.1 check 1, `manifest-unsupported`); K's reader | two a1 fields become one (`conventions.md` §4) |
| `/generator` | `CliVersionA0` (by `$id`) | — | required; the `prism-kicad version` document verbatim | a1 `created_by` (sim: `build.rs:313-316`), `materializer` (`:318-325`), `design` (`:326-329`); `prism-bundle version` JSON (sim: `src/prism-bundle/src/bin/prism-bundle.rs:219-227`), which the reference branch keys bundles on (ref: `backend/app/services/project_bundle.py:42-62`) | K: bundle key and store path (cli-spec.md §5.1.4); B: `--in` generator check (`generator-mismatch`), `bundle verify` `generator_matches` | replaces four a1 fields; see the mapping below |
| `/generator/kicad_version` | `CliReleaseVersion` | — | required | a1 `kicad_cli_version` (sim: `build.rs:335`), the `--refill-tool` value (sim: `bin/prism-bundle.rs:75`; ref: `project_bundle.py:84`) | stage board's refill and stage models' export were made with it (`--refill-tool`, `--models-tool` must equal it, cli-spec.md §5.2.3–§5.2.4); C6 can show it | a1 recorded the tool that ran; a2 records the version every KiCad step must use |
| `/generator/member_schemas` | `CliVersionMemberSchema[]` | — | required; sorted by `path` in code point order | new (cli-spec.md §5.1.1) | invariant I3: each `/members/*/member_schema` equals the entry for its path (`bundle-format.md` §3.4) | — |
| `/generator/pack_format_version` | `uint16` | — | required | a1 `materializer.pack_format_version` (sim: `build.rs:320`, `kicad-monkey-materialization-pack/src/lib.rs:54`) | reader step 7 (pack preamble check, `bundle-format.md` §9); sim `prism-geometry` checks the preamble itself (sim: `src/prism-geometry/src/lib.rs:82-118`) | moved from the manifest to the generator |
| `/generator/refill_procedure`, `/generator/models_procedure` | enums | — | required | new; the refill script is the reference branch's (ref: `backend/app/services/zone_refill.py:24-29`) | K runs them (cli-spec.md §9.2–§9.3) | — |
| `/revision_key` | `Sha256Hex` | — | optional; absent only for a bundle built without `--revision-key` (local and test builds) | new. Lineage: today's semantic-index `sourceRevisionKey`, a truncated SHA-256 over project file and `(path, blob id)` pairs (`backend/app/services/semantic_index_service.py:90-104`) | K: store path `<revision_key>/…` (ADR §5), commit index, retention; `--in` assertion (`revision-key-mismatch`) | not a parity field |
| `/bundle_key` | `Sha256Hex` | — | optional; present exactly when `/revision_key` is | new: `SHA-256("prism.bundle_key.a0" 0x00 revision_key 0x00 generator_bytes)` (cli-spec.md §5.1.4) | K: dedup key, job `artifact_key`, ETag (G9); reader step 5 identity check (`bundle-format.md` §9) | — |
| `/config` | `RevisionKeyEffectiveConfigA1` (by `$id`) | — | required: `--config`, or the default the CLI derives by KiCad's stem rule | new as a document. The effective settings come from `backend/app/services/path_config_service.py:532-589` (stored settings over the committed `.prism.json`); the stem rule is a1's (sim: `src/prism-bundle/src/sources.rs:105-112`) | every reader: which files the bundle is about, the only attribution of files to the project (never by directory, `conventions.md` §8); C2/C3 KiCad-output jobs (where the project and board sit in `sources/`) | — |
| `/config/project_file` | `RepoPath` | — | required; the anchor | a1 `sources.project.path` (sim: `sources.rs:105`) | invariant I4; K and the KiCad-output jobs open `sources/<project_file>` | a1's path was project-relative; a2's is repository-relative |
| `/config/board` | `RepoPath` | — | optional; absent = the project has no board (stages board and models `skipped`, `no-board`) | a1 `source_board.path` (sim: `contracts/contracts/bundle.tsp:143`, `build.rs:307-308`); a1 failed without a board (sim: `sources.rs:106`) | invariant I4, I5; `refilled/<board name>`; browser PCB tab; C3, C4 | a1 `source_board.sha256` → the member's `sha256` |
| `/config/root_schematic` | `RepoPath` | — | optional; absent = no root schematic (no `design.json`, cross-check `skipped`) | a1 `ProjectSources::root_schematic()` (sim: `sources.rs:47-50`) | invariant I4, I9; browser schematic tab | — |
| `/config/excluded_dirs` | `RepoPath[]` | — | required; sorted by UTF-8 bytes | new (revision-key contract) | none in the manifest's own rules; recorded because the key hashed it | — |
| `/config/zone_fills` | `RevisionKeyZoneFills` | — | optional; absent = refill (the default); only `saved` is ever written | new: K's stored setting `zone_fills` (revision-key.md §4.4); a1 chose per build with `--no-refill` (sim: `bin/prism-bundle.rs:73`) | B: stage board's mode (cli-spec.md §5.2.3); invariant I8 | a1 had no config; its `fill_provenance` → `/stages/board/fill_provenance` |
| `/board_id` | `BundleManifestBoardId` | — | required; always `main` | a1 `board_id` (sim: `contracts/contracts/bundle.tsp:130-131`; `build.rs:34`, `:312`) | sim engines' references `board_id:refdes.pad` (sim: `src/sim-worker/src/main.rs:143`, `:167`; `src/sim-contracts/src/lib.rs:68`, `:269`) | unchanged |
| `/stages` | `BundleManifestStages` | — | required | new (ADR §4.4: "`bundle.json` records each stage's status") | K's readiness (`bundle-format.md` §3.3); `CliBuildResultA0.stages` repeats status, error and skip reason (cli-a0.tsp) | — |
| `/stages/parse` | `BundleManifestParseStage` | — | required | new | K readiness | — |
| `/stages/parse/status` | `BundleManifestStageStatus` | — | required; `complete`, `partial` or `failed` | new; a1 aborted the build instead (sim: `src/prism-bundle/src/error.rs`) | K: parse readiness for C1–C4 and project metadata; B: board's precondition (`stage-order`) | — |
| `/stages/parse/error` | `CliFinding` | — | optional; present exactly when status is `failed` | new; cli-spec.md §5.2.2 content-failure codes (`source-unparseable` at line, column, offset from the core's `Position`, fork `src/rs/kicad-monkey-core/src/sexpr.rs:59-69`) | UI: why a revision has no parse members; `CliBuildResultA0.stages[0].error` | — |
| `/stages/parse/error/code`, `/message` | `DiagnosticCode`, string | — | required in `error` | cli-spec.md §8 | as above | message wording is not stable |
| `/stages/parse/error/location` | `CliLocation` | — | optional; absent = the error has no location (for example a whole-project failure) | cli-a0.tsp `CliFinding.location` | UI jump-to-source | — |
| `/stages/parse/error/location/path`, `/line`, `/column`, `/offset`, `/pointer`, `/uuid` | `ArchivePath`, one-based ints, `ByteCount`, `CliJsonPointer`, `KiCadUuid` | lines and columns 1-based; offset in bytes | each optional; absent = unknown | cli-a0.tsp `CliLocation` | UI jump-to-source | — |
| `/stages/parse/warnings` | `Warning[]` | — | required; sorted by `code`, then `message`, code point order; no duplicates | new: findings of the parse and of the projection producers (`conventions.md` §8: skipped objects are reported here) | UI; G's goldens ignore them | codes owned by each projection's field map |
| `/stages/parse/warnings/*/code`, `/message` | `DiagnosticCode`, string | — | required | as above | as above | — |
| `/stages/parse/failed_members` | `BundleManifestMemberFailure[]` | — | required; sorted by `path`; non-empty exactly when status is `partial` | new | readiness rule 3 (`bundle-format.md` §3.3); C1–C4 show which projection is unavailable | — |
| `/stages/parse/failed_members/*/path` | `ArchivePath` | — | required; a fixed-path parse member that is not in `/members` | new | as above | — |
| `/stages/parse/failed_members/*/code` | `DiagnosticCode` | — | required; `design-build-failed` or `projection-failed` (cli-spec.md §8) | new | as above | — |
| `/stages/parse/failed_members/*/message` | string | — | required | new | UI | — |
| `/stages/board` | `BundleManifestBoardStage` | — | required | new | K readiness | — |
| `/stages/board/status` | `BundleManifestStageStatus` | — | required; `pending`, `complete`, `partial` or `skipped` | new | K: board readiness for C4, C5, C6; B: models' precondition | — |
| `/stages/board/skip_reason` | `BundleManifestSkipReason` | — | optional; present exactly when status is `skipped` | new; values are the CLI's (cli-a0.tsp `CliSkipReason`) | UI: "no board" vs "earlier stage failed" | — |
| `/stages/board/error` | `CliFinding` | — | optional; present exactly when status is `failed`, which a2 does not reach (materializer failures make the stage `partial`) | — | generic stage readers | — |
| `/stages/board/error/code`, `/message`, `/location`, `/location/path`, `/location/line`, `/location/column`, `/location/offset`, `/location/pointer`, `/location/uuid` | as `/stages/parse/error/…` | as there | as there | cli-a0.tsp `CliFinding` | generic stage readers | — |
| `/stages/board/fill_provenance` | `BundleManifestFillProvenance` | — | optional; present exactly when status is `complete` or `partial`; `saved` exactly when `/config/zone_fills` is `saved`, else `refilled` | a1 top-level `fill_provenance` (sim: `contracts/contracts/bundle.tsp:41-47`, set from `--no-refill`, `bin/prism-bundle.rs:73`) | C3, C5, C6: say whether the fills were refilled; invariant I8 | a1 values unchanged; moved into stage board; chosen by the config, not per build |
| `/stages/board/fill_check` | `BundleManifestFillCheck` | — | optional; present exactly when `materialization/board.kmpack` is a member and `fill_provenance` is `refilled` | a1 `fill_check` (sim: `contracts/contracts/bundle.tsp:146-147`; `build.rs:248-268`, `:292-295`) | C6: shows stale fills; sim tests (sim: `tests/bundle_build.rs:194`) | a1 had it only when refilled; so does a2 |
| `/stages/board/fill_check/saved_operations` | `Count` | operations | required | sim: `build.rs:263` (`compare_fills`, `materialize.rs`) | as above | unchanged |
| `/stages/board/fill_check/refilled_operations` | `Count` | operations | required | sim: `build.rs:264` | as above | unchanged |
| `/stages/board/fill_check/differing_operations` | `Count` | operations | required | sim: `build.rs:265` | as above | unchanged |
| `/stages/board/fill_check/stale` | boolean | — | required; true exactly when `differing_operations` is not 0 | sim: `build.rs:249`, `:266` | as above | unchanged |
| `/stages/board/cross_check` | `BundleManifestCrossCheck` | — | optional; present exactly when `materialization/board.kmpack` is a member | a1 `cross_check` (sim: `contracts/contracts/bundle.tsp:148`; `build.rs:406-409`, `:339`) | simulation gate (ref: `backend/app/services/project_bundle.py:149-161`, `backend/app/sim_studio/runs.py:174`; sim: `src/sim-worker/src/main.rs:101-122`, `:132`) → C6 | moved from `/cross_check` |
| `/stages/board/cross_check/status` | enum | — | required | sim: `crosscheck.rs:552-558`; `skipped` at `:189-199` | as above: engines accept `passed`, `passed-with-warnings` | unchanged values; `skipped` also covers a failed `design.json` |
| `/stages/board/cross_check/components_compared` | `Count` | components | required | sim: `crosscheck.rs:559-565` | CLI summary (sim: `bin/prism-bundle.rs:159-167`) | unchanged |
| `/stages/board/cross_check/pads_compared` | `Count` | pads | required | sim: `crosscheck.rs:566` | as above | unchanged |
| `/stages/board/cross_check/nets_compared` | `Count` | nets | required | sim: `crosscheck.rs:567` | as above | unchanged |
| `/stages/board/cross_check/mappings` | `BundleManifestCrossCheckMapping[]` | — | required; sorted by `kind`, then `board`, then `design`, code point order | sim: `crosscheck.rs:461-477` (a `BTreeSet` of the derived-`Ord` struct, `:132-141`), `:568` | CLI prints them (sim: `bin/prism-bundle.rs:168-173`); C6 explains renames | same order as a1 |
| `/stages/board/cross_check/mappings/*/kind` | enum | — | required | sim: `crosscheck.rs:461-477` | as above | a1 `string` → enum of the three kinds |
| `/stages/board/cross_check/mappings/*/board`, `/design` | `NetName` | — | required | as above | as above | a1 allowed `""`; a2 requires a name |
| `/stages/board/cross_check/warnings` | `Warning[]` | — | required; sorted by `code`, then `message` | sim: `crosscheck.rs:556-569` | C6 UI | a1 ordered by finding kind (`crosscheck.rs:56-74`, `:343`); a2 by code |
| `/stages/board/cross_check/warnings/*/code`, `/message` | `DiagnosticCode`, string | — | required | sim: `crosscheck.rs:76-90`, `:118-129` | as above | unchanged |
| `/stages/board/cross_check/errors` | `Warning[]` | — | required; sorted by `code`, then `message`; non-empty exactly when status is `failed` | sim: `crosscheck.rs:570` | simulation gate message (ref: `project_bundle.py:157-160`; sim: `main.rs:104-115`); CLI prints them (sim: `bin/prism-bundle.rs:174-176`) | a1 omitted the array when empty (`crosscheck.rs:182-183`); a2 always writes it |
| `/stages/board/cross_check/errors/*/code`, `/message` | `DiagnosticCode`, string | — | required | sim: `crosscheck.rs:76-90` | as above | unchanged |
| `/stages/board/warnings` | `Warning[]` | — | required; sorted by `code`, then `message` | a1 top-level `warnings` minus the cross-check's (sim: `build.rs:291-306`): `stale-saved-fills` (`:251-259`), `kicad-default-stackup` (`:297-305`); new `saved-fills-used`, exactly when `fill_provenance` is `saved` | CLI prints them (sim: `bin/prism-bundle.rs:177-179`); `CliBuildResultA0.warnings` | split from a1's top-level list |
| `/stages/board/warnings/*/code`, `/message` | `DiagnosticCode`, string | — | required | as above | as above | unchanged codes |
| `/stages/board/failed_members` | `BundleManifestMemberFailure[]` | — | required; sorted by `path`; non-empty exactly when status is `partial` (only `materialization/board.kmpack`, code `materialization-failed`) | new; a1 aborted on `BundleError::Materialization` (sim: `error.rs:56-58`) | readiness rule 3; C5, C6 explain a missing pack | — |
| `/stages/board/failed_members/*/path`, `/code`, `/message` | `ArchivePath`, `DiagnosticCode`, string | — | required in an entry; `path` is `materialization/board.kmpack`, `code` is `materialization-failed` | new | readiness rule 3 | — |
| `/stages/models` | `BundleManifestModelsStage` | — | required | new | K readiness | — |
| `/stages/models/status` | `BundleManifestStageStatus` | — | required; `pending`, `complete` or `skipped` | new | K: models readiness for C4, C5 | — |
| `/stages/models/skip_reason` | `BundleManifestSkipReason` | — | optional; present exactly when status is `skipped` | new | UI | — |
| `/stages/models/error` | `CliFinding` | — | optional; never present in a2 (models has no content failure) | — | generic stage readers | — |
| `/stages/models/error/code`, `/message`, `/location`, `/location/path`, `/location/line`, `/location/column`, `/location/offset`, `/location/pointer`, `/location/uuid` | as `/stages/parse/error/…` | as there | never present in a2 | cli-a0.tsp `CliFinding` | generic stage readers | — |
| `/stages/models/warnings` | `Warning[]` | — | required; sorted by `code`, then `message` | new | UI | — |
| `/stages/models/warnings/*/code`, `/message` | `DiagnosticCode`, string | — | required in an entry | new | UI | — |
| `/stages/models/failed_members` | `BundleManifestMemberFailure[]` | — | required; always empty in a2 | new | generic stage readers | — |
| `/stages/models/failed_members/*/path`, `/code`, `/message` | `ArchivePath`, `DiagnosticCode`, string | — | never present in a2 | new | generic stage readers | — |
| `/read_set` | `BundleManifestReadSet` | — | required | new in a3 (ADR amendment K2 §3.4); written by stage parse, copied by later stages | K2b's reuse check through `bundle reuse` (cli-spec.md §5.10); the semantic index's `designKey` (bundle-format.md §2.3) | — |
| `/read_set/probes` | `BundleManifestProbe[]` | — | required; sorted by `path`, unique (I13) | every `read` that found nothing and every `exists` of stage parse and the producers (cli-spec.md §5.2.2) | `bundle reuse` condition 5 | — |
| `/read_set/probes/*/path`, `…/present` | `RepoPath`, boolean | — | required | the path asked about; whether it was in the source set | same | — |
| `/read_set/listings` | `BundleManifestListing[]` | — | required; sorted by `directory`, then `suffixes` (I13) | every `list` call | `bundle reuse` condition 6 | — |
| `/read_set/listings/*/directory` | `RepoPath` or `""` | — | required | the directory listed; `""` is the repository root | same | — |
| `/read_set/listings/*/suffixes` | `BundleManifestListingSuffix[]` | — | required; sorted, unique; empty for every name | the suffixes, lowered ASCII | same | — |
| `/read_set/listings/*/paths` | `RepoPath[]` | — | required; sorted | the paths returned, at any depth below `directory` | same | — |
| `/read_set/gitlinks` | `BundleManifestGitlink[]` | — | required; sorted by `path`, unique (I13) | every submodule a read, probe or listing reached into, with its commit from `--key-record` | `bundle reuse` conditions 4 and 7 | — |
| `/members` | `BundleManifestMember[]` | — | required, at least one; sorted by `path` in code point order; the archive's entries after `bundle.json` in the same order | a1 `members` (sim: `contracts/contracts/bundle.tsp:135-136`; `build.rs:423`, `:358-369`) | every reader (sim: `reader.rs:47-62`; ref: `project_bundle.py:108-123`); K's extraction and readiness | unchanged order rule |
| `/members/*/path` | `ArchivePath` | — | required; unique, also after NFC and case folding | sim: `build.rs:363` (`sources/…` `:141-149`, `refilled/…` `:166-174`, `MATERIALIZATION_PATH` `:28`, `DESIGN_PATH` `:30`, `viewer/…` `:242`) | as above; ref: `project_bundle.py:109-115` (viewer prefix, pack path) | sources are repository-relative in a2 |
| `/members/*/role` | `BundleManifestMemberRole` | — | required | sim: `build.rs:362`; roles at `manifest.rs:28-48` | a1 `member_with(role)` (sim: `reader.rs:80-85`); K | a1's values kept except `viewer-asset`, which is removed (`decisions.md`); `source-worksheet`, `source-jobset`, `source-library-table`, `source-symbol-library`, `source-footprint`, `source-3d-model`, `source-prism-settings`, `projection`, `component-models` are new |
| `/members/*/stage` | `BundleManifestStage` | — | required; the stage of the role | new (ADR §6: "the stage that wrote it") | K readiness; B's `stage-inconsistent` check | — |
| `/members/*/sha256` | `Sha256Hex` | — | required; over the uncompressed bytes | sim: `build.rs:364` | sim: `reader.rs:59`; ref: `project_bundle.py:117-123`; every reader (`bundle-format.md` §9 step 6) | unchanged |
| `/members/*/bytes` | `ByteCount` | bytes | required | sim: `build.rs:365` | sim: `reader.rs:58-59`; reader steps 4 and 6 | a1 `u64` → safe integer (members ≤ 2 GiB by `max-member-bytes`) |
| `/members/*/source` | `BundleManifestSourceEntry` | — | optional; present exactly for the `source-*` roles | new (revision-key.md §12, Q3) | reader: checks each source member against the key's entries; K retention and audit | a1 recorded no git identity |
| `/members/*/source/path` | `RepoPath` | — | required; the member path without `sources/` | `RevisionKeyEntry.path` | as above | — |
| `/members/*/source/kind` | `RevisionKeyEntryKind` | — | required; `regular` or `executable` | `RevisionKeyEntry.kind` | as above | — |
| `/members/*/source/object_id` | `GitObjectId` | — | required; the committed blob id (an LFS pointer's, not the hydrated content's) | `RevisionKeyEntry.object_id` | as above | — |
| `/members/*/source/gitlink` | `RepoPath` | — | optional; present exactly for a file inside a submodule: the key's gitlink entry | the record's `gitlink` entry | as above | — |
| `/members/*/member_schema` | `SchemaId` | — | optional; present exactly for roles `design`, `materialization`, `projection` | sim: `build.rs:366`, values `design.rs:17` and fork `board_materialization.rs:60` | reader step 7; a1 consumers read `materializer.schema` instead (sim: `src/sim-worker/src/main.rs:144`) | a1 free string → `SchemaId`; now also set on projections |

Known values of `member_schema` and `role` per path are in `bundle-format.md` §2.1. Known warning and error codes are in `bundle-format.md` §3.2 and cli-spec.md §8.

## a2 → a3

| a2 | a3 | Why |
|---|---|---|
| `schema: "prism.bundle.manifest.a2"` | `schema: "prism.bundle.manifest.a3"` | the field set changed |
| — | `read_set`: probes, listings, gitlinks | with the source members, everything stage parse looked at, so a stored bundle can serve another revision key whose tree leaves it unchanged (ADR amendment K2 §3.3) |
| `revision_key`: the key the bundle is for | `revision_key`: the key it was built for; other keys may reach it through the alias table | ADR amendment K2 §3.6; readers take the revision they asked for from the request |

An a2 archive is not read: the reader rejects it (`manifest-unsupported`), and the generator bump that comes with a3 rebuilds every stored bundle anyway.

## How a golden is produced from today's code

There is no producer of a2 yet: WP-B writes it. Today's equivalent is a1, and a2 is a1 put through the mapping below plus the new fields.

1. **a1 output.** Build sim's `prism-bundle` (sim `a714101`) and run it on a materialized revision with a KiCad refill:
   ```sh
   prism-bundle build <src>/<project>.kicad_pro -o a1.prism --kicad-cli <kicad-cli>
   unzip -p a1.prism bundle.json > a1.bundle.json
   ```
   For a committed revision, materialize the source set first with `git cat-file blob` for each entry of the `prism-kicad revision-key` record. That is K's step 1 (cli-spec.md §9.1).
2. **New fields.**
   - `generator` is `prism-kicad version`, or `examples/CliVersionA0.example.json` until WP-B exists.
   - `revision_key` and `config` come from the `RevisionKeyRecordA1` of the same revision, its `revision_key` and `config`.
   - `bundle_key` is cli-spec.md §5.1.4 over those two.
   - `stages.parse` is `complete`.
   - `stages.models` is `complete` once `viewer/models/components.glb` is added: `kicad-cli pcb export glb --force --no-board-body --output <dir>/components.glb <board>`, then the `generated_at` canonicalization of cli-spec.md §5.2.4.
3. **Members.** Source members are the closure the build read (`bundle-format.md` §2.2): the entries of the record that the parse reads, at `sources/<path>`, with roles from their categories and `source` copied from the entry. Then come a1's `design.json`, `materialization/board.kmpack` and `refilled/<board name>` with their hashes unchanged, the eight projections and the GLB. Sort by path.
4. **Compare** by JSON value (`conventions.md` §14). `generator`, `revision_key`, `bundle_key` and `config` are inputs, not outputs. The determinism test compares two `prism-kicad` builds by bytes.

**a1 → a2 mapping (for WP-B).** Every a1 field, sim `contracts/contracts/bundle.tsp:123-151` and `src/prism-bundle/src/manifest.rs:139-177`:

| a1 field | a2 field | Change and reason |
|---|---|---|
| `schema: "prism.bundle.manifest"` | `/schema: "prism.bundle.manifest.a2"` | one id carries name and version (`conventions.md` §4) |
| `version: "a1"` | — (in `/schema`) | same |
| `board_id` | `/board_id` | unchanged; still always `main` |
| `created_by {name, version}` | `/generator` | the generator id (ADR §5) names the producer exactly, including the engine, KiCad and procedures |
| `created_at?` | dropped | no wall-clock time in a member (ADR §7; a1 never wrote it, sim: `build.rs:317`) |
| `members[]` | `/members[]` | same order rule (by path); entries gain `stage` |
| `members[].role` | `/members/*/role` | a1 values kept except `viewer-asset` (no a2 member); new source roles for the full source set; `projection` and `component-models` added |
| `members[].path` | `/members/*/path` | `sources/` paths become repository-relative (equal for a project at the repository root); `ArchivePath` now rejects a trailing `/` |
| `members[].sha256`, `members[].bytes` | `/members/*/sha256`, `/bytes` | unchanged |
| `members[].member_schema?` | `/members/*/member_schema?` | typed `SchemaId`; also set for projections; must equal `generator.member_schemas` |
| — | `/members/*/stage` | new (ADR §6) |
| `materializer.schema` | `/members[path=materialization/board.kmpack]/member_schema` | a1 consumers read it from `materializer` (sim: `src/sim-worker/src/main.rs:144`): **C6 updates that read** |
| `materializer.pack_format_version` | `/generator/pack_format_version` | a generator property, pinned there by the CLI contract |
| `materializer.producer {name, version}` | dropped | recorded inside the pack header (fork `materialization-a0.tsp` `MaterializationProducer`) and covered by `/generator/engine_version` |
| `materializer.repository`, `materializer.revision` | dropped | the materializer is part of Prism after WP-F1; `/generator/crate_version` is bumped for any output change (cli-spec.md §5.1.2) |
| `materializer.tile_size_nm` | dropped | fixed by the generator (the CLI has no tile option); the pack header has it (`scope.tile_size_nm`, read by sim `src/prism-geometry/src/lib.rs:195`) |
| `design {name, version}` | dropped | `design.json` carries its own `generator` (fork `design_json/mod.rs:313`); `/generator/engine_version` pins the engine |
| `fill_provenance` | `/stages/board/fill_provenance?` | same values, `refilled` or `saved`; moved to the stage that uses it. `saved` now comes only from `/config/zone_fills` (in the revision key), never from a per-build flag or a refill fallback (cli-spec.md §5.2.3); the refilled board is a member exactly when it is `refilled` |
| `kicad_cli_version?` | `/generator/kicad_version` | every KiCad step must use the generator's KiCad (`kicad-version-mismatch`) |
| `source_board {path, sha256}` | `/config/board` and that member's `sha256` | the effective config names the board; no duplicate hash |
| `refilled_board? {path, sha256}` | the member with role `refilled-board` | no duplicate hash |
| `fill_check?` | `/stages/board/fill_check?` | moved to the stage that computes it; present with the materialization when the board was refilled |
| `cross_check` | `/stages/board/cross_check?` | moved to the stage that computes it; absent while board is not `complete` or `partial` with a pack. Warnings and errors are sorted by code, then message; `errors` is always written; mapping `kind` is an enum. **C6 and the sim-worker read the new path.** |
| `warnings` | `/stages/<stage>/warnings` | per stage; the cross-check's findings are no longer copied into the top-level list (a1 did, sim: `build.rs:296`) |
| — | `/revision_key`, `/bundle_key`, `/config` | new (ADR §5, §6) |
| — | `/stages` | new (ADR §4.4) |

## Expected divergences

| Case | Today (a1) | Bundle (a2) | Why the bundle is right | Consumer affected |
|---|---|---|---|---|
| Source set | project, board, reachable sheets and `<stem>.kicad_dru`, project-relative (sim: `src/prism-bundle/src/sources.rs:91-127`) | the closure the build read (sheets, board, rules, library tables and the libraries they name, referenced worksheets, 3D models and text-path files), repository-relative, each member cross-referenced to its key entry (`source`) | maintainer decision Q3 (revision-key.md §12): the key hashes the repository-wide source set, the bundle carries what the build used | C2 overlay and C3 jobs find referenced files; a jobset or other file no reference reaches is not in the bundle |
| Project without a board | build fails, no archive (observed: `backend/tests/fixtures/design_variants/sch_only`) | parse members written; board and models `skipped` (`no-board`) | the semantic index and comparison work on schematics alone | C1, C2 gain coverage |
| Which files are the project's | a1 pairs the board with the project file by stem (sim: `sources.rs:105-112`); in multi-project repositories today's readers can pick another project's board (issue #681) | `config.project_file`, `root_schematic` and `board`, repository-relative, exactly the files parsed | files belong to a project only through its anchor and effective configuration (`conventions.md` §8) | C1–C4 read the project's files from `config`, never from a directory |
| Project absent at the revision (anchor not in the tree) | a1: `MissingSource { role: "project" }`, fatal, no archive (sim: `sources.rs:105`) | no archive and no manifest: the CLI reports `project-absent`, exit 10 (cli-spec.md §4) | an outcome, not a failure (`conventions.md` §8) | consumers show "not present at this revision" |
| Malformed schematic | build fails (observed: `design_variants/malformed`, "unclosed '('") | stage parse `failed` with a located error; sources kept | the failure is a property of the revision: record it once, keep the raw-file viewers working | UI shows the error instead of retrying |
| Projection or `design.json` producer fails | not applicable | stage parse `partial`; the other members are written | one producer's bug must not blank every consumer of a revision (W0 open question) | C1–C4 |
| Materializer fails | build fails | stage board `partial`; refilled board kept; no cross-check | the KiCad-output jobs still get the refilled board; simulation is refused | C3, C6 |
| Saved fills | `--no-refill` or no `kicad-cli` gives `fill_provenance: saved` | refilled; saved only when `/config/zone_fills` is `saved`, recorded with the warning `saved-fills-used`; a missing KiCad or a failed refill never falls back | a bundle key must give one content (cli-spec.md §5.2.3), and the config is in the key | hosts without KiCad run the stub CLI (cli-spec.md §10); C3, C5, C6 show saved-fill provenance |
| Cross-check order | warnings and errors by finding kind, then subject (sim: `crosscheck.rs:56-74`, `:343`) | by code, then message | one ordering rule for every finding array in the manifest | none: readers do not depend on order |
| `cross_check.errors` empty | omitted (`crosscheck.rs:182-183`) | `[]` | arrays are always present (`conventions.md` §10) | none |
| Top-level `warnings` | every warning, cross-check's included | per stage, cross-check's only in `cross_check` | no duplicate entries | the CLI's printout |
| `bundle.json` bytes | pretty-printed (sim: `build.rs:346`) | compact + LF | `conventions.md` §13 | none (readers parse JSON) |
| `viewer/**` | one role for all files (`viewer-asset`) | only `viewer/models/components.glb`, role `component-models`; the transitional viewer assets are not members | ADR §6: the GLB is a permanent member; the old semantic-visualizer store serves the mesh 3D tab and System Builder 3D until WP-C5 retires it (`decisions.md`) | C4, C5 |
| Fixtures in an older KiCad format | cross-check `failed` with `component-missing-from-board` for every symbol on `fixtures/release-studio/cynthion` (KiCad 7 board) and `synthetic`, whose footprints carry `fp_text reference`: the binding table has no refdes for them | same until the materializer reads `fp_text reference` | not a manifest divergence: recorded so G does not treat those goldens as manifest bugs | C6, G |

## Example provenance

- **Revision.** `/Users/Swaroop/Personal-Projects/USB-PD-Trigger-Board` (the user's repository, read only) at commit `0642b07770533173e731613a031d706c6163395e`. This is the same revision as `examples/RevisionKeyRecordA1.example.json`, whose `revision_key` and `config` the example carries. The nine source entries were materialized with `git cat-file blob <object_id>` into a scratch directory; each blob id was checked, and none is an LFS pointer. Seven of them are the closure the build read, so seven are members: `Outputs.kicad_jobset` is read by no reference, and `assets/Schematic-Page-Template.kicad_wks` is not either, because the project's drawing sheet is the embedded `kicad-embed://Schematic-Page-Template.kicad_wks`. Each member's `source` is copied from its record entry. The repository root is the project's own directory, so every path is repository-relative as it stands.
- **Real outputs.**
  - `design.json`, `materialization/board.kmpack`, `refilled/USB-PD-Trigger-Board.kicad_pcb`, `stages.board.fill_check`, `stages.board.cross_check` and `stages.board.warnings` come from sim's `prism-bundle` 0.1.0 (fork `b6316117`, engine 2026.9.7), run on that tree with KiCad 10.0.6 refilling the zones.
  - `viewer/models/components.glb` is `kicad-cli` 10.0.6 `pcb export glb --no-board-body`, canonicalized. Its hash, `ec4b495a…`, matches the value cli-spec.md §5.2.4 measured independently.
  - The source members are the materialized bytes.
- **a3 (ADR amendment K2).** `read_set` is what stage parse looks at for this revision besides the source members: its three companion files are absent (`USB-PD-Trigger-Board.kicad_dru`, `fp-lib-table`, `sym-lib-table`), the repository has no jobset, and no submodule. WP-K2a recomputes `bundle_key` for the a3 generator id when it updates `examples/CliVersionA0.example.json`.
- **Copied from other W0 examples.** `generator` is `examples/CliVersionA0.example.json`. `bundle_key` is computed from it by cli-spec.md §5.1.4; the same code reproduces the vectors of cli-spec.md §5.1.5.
- **Placeholders.** No projection producer exists yet. Each projection member's `sha256` and `bytes` are those of its W0 example document serialized compact + LF, and that example may come from another fixture. Where that example did not exist when this one was generated (`project`, `system-interface`), they are those of the minimal `{"schema":"<id>"}` + LF; regenerating the example once those land changes only these two hashes. `stages.parse.warnings` is empty because no producer ran.
- **Trimming.** None: 19 members, 292 lines.
- **Not in the example.** `BundleManifestMemberFailure`, a stage `error`, `skip_reason`, a non-empty `mappings` array and a `pending` stage cannot occur in one truthful, complete build of this revision. They are covered by prototype manifests that were built, written as archives, read back and validated during W0 (kept outside the repository):
  - `backend/tests/fixtures/system_builder/sources/mini_obc/F8`, real a1 output with refill: cross-check `failed` with a `same-pins-net-name` mapping (`PAYLOAD_IRQ#` = `PAYLOAD_INT#`) and a `net-mismatch` error; stage models `pending`;
  - `design_variants/sch_only`: no board, stages board and models `skipped` (`no-board`);
  - `design_variants/malformed`: stage parse `failed` (`source-unparseable`), board and models `skipped` (`earlier-stage-failed`), sources only;
  - two cases constructed from the usb-pd build: stage parse `partial` (`projection-failed`), and stage board `partial` (`materialization-failed`) with models `skipped`.
- **Zone fills.** The example is a refill build: `config` has no `zone_fills`, and `stages.board.fill_provenance` is `refilled` (added by hand on 2026-10-16, when the field was introduced; a1's archive recorded the same value). A saved-fills manifest (`config.zone_fills: "saved"`, `fill_provenance: saved`, no `refilled/` member, no `fill_check`, warning `saved-fills-used`) is not in the example; I8 covers it, and B's tests build one.
