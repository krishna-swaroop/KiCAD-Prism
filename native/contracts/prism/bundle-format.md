# Design bundle archive format (`.prism`, manifest a3)

- **Status:** W0 draft for maintainer review. Once accepted it changes only by an ADR amendment, like the contracts.
- **Parent:** [`../adr-native-design-bundle.md`](../../../docs/architecture/adr-native-design-bundle.md) §4.4, §5, §6, §7 and §11 (G2, G8).
- **Manifest:** `bundle.json`, schema `prism.bundle.manifest.a3`, root `BundleManifestA3` in [`tsp/prism/bundle-manifest-a3.tsp`](../../src/tsp/prism/bundle-manifest-a3.tsp). a3 adds the read set (§2.3, ADR amendment K2). Field-by-field traceability and the a1 → a2 mapping are in [`field-maps/bundle-manifest.md`](field-maps/bundle-manifest.md).
- **Companion:** [`cli-spec.md`](cli-spec.md) specifies the `prism-kicad` process that writes and checks bundles: stage chaining (§5.2), atomic writes (§5.2.5), what is recorded on failure (§5.2.7), the reader's zip checks (§6.2) and the limits (§7). This document owns the archive layout, the member set, the stage semantics a reader relies on, the unpacked cache, and the reader's manifest-level checks. Where both say the same thing they must agree; §11 lists the points where the two W0 drafts still differ.
- **Implemented by:** WP-B (`prism-bundle` writer and reader, `prism-kicad bundle verify`), WP-K (`backend/app/services/design_bundle/` reader, store, unpacked cache, job). Every other WP reads members only through those two.
- **Lineage:** a1's writer and reader (sim: `src/prism-bundle/src/zip.rs`, `reader.rs`, `build.rs`) and the reference branch's unpacker (ref: `backend/app/services/project_bundle.py:103-146`). Citations follow `conventions.md`: a bare path is in this repository, `sim:` is prism-sim-studio, `ref:` is `feature/analytic-pack-spike`, `fork:` is kicad_monkey at `b6316117`.

A bundle is one zip file per (revision key, generator id) (ADR §5). It holds the revision's sources, `design.json`, every projection, the refilled board (unless the project uses its saved zone fills), the materialization and the component GLB, plus `bundle.json`, which lists and hashes all of them. It is written at the end of stage `parse` and rewritten, atomically, at the end of stages `board` and `models`.

## 1. Terms

- **Member:** one file in the archive. `bundle.json` is a member; every other member is listed in its `members`.
- **Final stage:** a stage whose status is `complete`, `partial`, `failed` or `skipped`. Only `pending` is not final.
- **Fixed-path member:** a member whose path is known before its stage runs: `design.json`, the eight projections, `refilled/<board name>`, `materialization/board.kmpack` and `viewer/models/components.glb`. Sources are a *variable set*.
- **Config:** the manifest's `config`, the effective project configuration (`RevisionKeyEffectiveConfigA1`). Its `project_file`, `board` and `root_schematic` are the files the bundle is about, each a `RepoPath`: the anchor and exactly the root schematic and board that stage parse parsed. They are the bundle's only project attribution. A consumer takes the project's files from here and never picks one by its directory, such as "the `.kicad_pcb` beside the project file"; two projects may share a directory (`conventions.md` §8). `<board name>` is the last segment of `config.board`.
- **Code point order:** compare strings by Unicode scalar values, which for UTF-8 is byte order (`conventions.md` §9): Rust `str::cmp`, Python `sorted()` on `str`; not JavaScript's default `sort()`.

## 2. Members

### 2.1 What each member is

| Archive path | Role | Stage | `member_schema` | Present when | Written by | Read by |
|---|---|---|---|---|---|---|
| `bundle.json` | (not listed) | every stage | its own `schema`, `prism.bundle.manifest.a3` | always, the first entry | B | every reader (K) |
| `sources/<repo path>` | `source-*` (§2.2) | parse | — | always, also when stage parse failed | K materializes the source set; the CLI copies the closure the build read (§2.2, cli-spec.md §5.2.2) | browser viewers (C2 overlay, Schematic/PCB tabs), KiCad-output jobs (C3, C4 STEP), the job's refill and GLB export, C7 |
| `design.json` | `design` | parse | `kicad_monkey.design.a0` | stage parse `complete` or `partial`, `config.root_schematic` present, and not in `failed_members` | B (fork core `design_json`) | Simulation Studio engines (C6), the cross-check |
| `projections/semantic-index.json` | `projection` | parse | `prism.semantic_index.a2` | stage parse `complete`, or `partial` and not in `failed_members` | P1 | C1, C3, C6 |
| `projections/board-objects.json` | `projection` | parse | `prism.board_objects.a0` | same | P2 | C2 |
| `projections/occurrences.json` | `projection` | parse | `prism.occurrences.a0` | same | P2 | C2, C3, C4, C7 |
| `projections/stackup.json` | `projection` | parse | `prism.stackup.a0` | same | P3 | C2, C3, C4, C5, C6 |
| `projections/route-metrics.json` | `projection` | parse | `prism.route_metrics.a0` | same | P2 | C2 |
| `projections/placements.json` | `projection` | parse | `prism.placements.a0` | same | P3 | C3, C4, C7 |
| `projections/project.json` | `projection` | parse | `prism.project.a0` | same | P4 | project metadata, C3, C5 |
| `projections/system-interface.json` | `projection` | parse | `prism.system_interface.v1` | same | P5 | C4 |
| `refilled/<board name>` | `refilled-board` | board | — | stage board `complete` or `partial`, and `config.zone_fills` absent | the job's refill (`generator.refill_procedure`, cli-spec.md §9.2); the CLI checks and copies it | the materializer, C3 |
| `materialization/board.kmpack` | `materialization` | board | `kicad_monkey.materialization.a0` | stage board `complete` | B (fork materializer and pack) | C4, C5, C6 (sim: `prism-geometry`) |
| `viewer/models/components.glb` | `component-models` | models | — | stage models `complete` | the job's export (`generator.models_procedure`, cli-spec.md §9.3); the CLI canonicalizes and copies it (§4.5) | C4, C5 |

Rules that follow from the table:

- **Every projection is written whenever stage parse succeeds.** A projection whose inputs are missing (no board, no root schematic) is written in the empty form its own contract defines; it is never left out as "not applicable". Only `design.json` is not applicable, when `config.root_schematic` is absent: the fork's design JSON needs a root schematic, and a1 left it out the same way (sim: `src/prism-bundle/src/build.rs:399-404`).
- **The refilled board is there with a materialized board, unless the project uses its saved fills.** By default the backend always refills, with the generator's KiCad and procedure (cli-spec.md §5.2.3, §9.2), and a refill failure is never replaced by the saved fills. A project whose effective configuration says `zone_fills: "saved"` (part of the revision key, revision-key.md §4) has no `refilled/` member: stage board materializes `sources/<config.board>` as saved and records `fill_provenance: saved` with the warning `saved-fills-used` (§3.1).
- **The transitional viewer assets are not members** (maintainer decision, `decisions.md`). a1 copied a host-given viewer directory under `viewer/` (sim: `src/prism-bundle/src/build.rs:419-422`); a2 has no such input and no `viewer-asset` role. The mesh 3D tab and System Builder 3D keep reading the old semantic-visualizer store until WP-C5 retires it. `viewer/models/components.glb` is the only `viewer/` member, and the old store's own documents (`prism.visualizer_bundle.a0`, `backend/app/services/semantic_visualizer_service.py:21`, and the topology compiler's `_a0` files) never appear in a bundle.
- **`member_schema`** is present exactly for roles `design`, `materialization` and `projection`. It equals the `schema` value inside the member (for the pack, inside its header) and the entry for the same path in `generator.member_schemas` (`cli-a0.tsp`, `CliVersionMemberSchema`). A projection version bump therefore changes the generator, not the manifest version.

**`design.json` has no TypeSpec and no JSON Schema** in the fork. It is assembled as an untyped `serde_json::Value`: the id and generator at fork `src/rs/kicad-monkey-core/src/design_json/mod.rs:23-24`, the top-level keys at `:311-370` (`schema`, `generator`, `project`, `variants`, `options`, `sheets`, `components`, `schematic_hierarchy`, `nets`, `compiled_schematic_graph`, and when present `pnp`, `net_classes`, `net_name_to_classes`, `indexes`). Only its `compiled_schematic_graph` value has a contract (fork: `src/tsp/kicad_monkey/compiled-schematic-graph-a0.tsp`). Readers check only that its `schema` is `kicad_monkey.design.a0`. A TypeSpec and JSON Schema for `kicad_monkey.design.a0` are owed: WP-C6, its first deep reader, adds them, or B earlier if the cross-check needs them, through an ADR amendment (ADR §11 G16, `decisions.md`).

### 2.2 Source members

- **Path:** `sources/` followed by the file's `RepoPath`, its path relative to the repository root as `git ls-tree` prints it. a1 used the project-relative path (sim: `src/prism-bundle/src/build.rs:141-149`). a2 uses the repository path because every bundle path is repository-relative (`conventions.md` §8), the closure can reach files outside the project directory (libraries, 3D models, other projects' files), and `ArchivePath` has no `..`. For a project at the repository root both spell the same.
- **Set:** the closure the build read (maintainer decision Q3, revision-key.md §12), not the whole source set. K materializes the revision key's source set (cli-spec.md §9.1 step 1): every regular and executable entry of `RevisionKeyRecordA1.entries`, and the files inside each gitlink (submodule), expanded at the commit the gitlink records and selected by the same rules; no symlink entry (K skips them, and the CLI refuses a link under `--source-root`). Of those files, the members are the ones stage parse reads: the effective configuration's project file, root schematic and board, and every file the project member's "Scanning" reaches from them (field-maps/project.md: sheets, library tables and the libraries they name, drawing sheets), plus every `repository` target with `inSources` true of a reference of `projections/project.json` (3D models, text paths). When stage parse fails, the members are the files read before it stopped, and always the project file, root schematic and board that exist. Another project's files are members only when a reference reaches them. Every `kicad-jobset` entry of the key is also always a member (maintainer decision): no KiCad file references a jobset, but Release Studio runs jobsets on the bundle's sources. Jobsets are small, and carrying one attributes nothing.
- **Key entry:** each source member's `source` names the key entry its bytes come from: `path` (the member path without `sources/`), `kind` and `object_id`, equal to one entry of the key, or, for a file inside a submodule, the key's `gitlink` entry plus the file's blob id in that commit (bundle-manifest-a2.tsp, `BundleManifestSourceEntry`). The CLI copies them from the `--key-record` K passes (cli-spec.md §5.2.2).
- **Upgrade** (maintainer decision): before stage parse, K upgrades every `.kicad_pcb` and `.kicad_sch` of the closure whose `(version …)` is older than `generator.kicad_file_formats` for its kind, in `$JOB/src`, by `generator.upgrade_procedure` (cli-spec.md §9.4). Boards go through pcbnew with a fixed `KIID.SeedGenerator` seed, so the ids KiCad creates for items the old file lacked (for example the default `Datasheet` property of a KiCad 7 footprint) are the same on every build; only the `.kicad_pcb` is kept. Schematics go through `kicad-cli sch upgrade`. Both are byte-deterministic (measured on cynthion, KiCad 7 format: two upgrades give identical bytes; EDA-04903, 57 MB KiCad 8 board: 8.2 s, 0.8 GB peak). The member holds the upgraded bytes, which are what the parse read; its `source` keeps the committed blob's key entry and records `upgraded_from_version`, which K passes as `--upgraded` (cli-spec.md §5.2.2). A file already in the current format is not touched.
- **Bytes:** what KiCad reads. A Git LFS pointer is hydrated, so the member's `sha256` equals the LFS `oid` and `bytes` the pointer's `size` (the check Release Studio makes, `backend/app/release_studio/closure.py:740-767`); the key keeps the pointer's blob id (ADR §5).
- **Failure** (maintainer decision). K materializes LFS objects and initialized submodules: Prism's sync initializes submodules recursively and fetches their LFS objects, and the worker image has `git-lfs` (WP-K, WP-L).
  - **A design source that cannot be materialized** (any category except `model-3d`: the project, sheets, board, rules, worksheets, library tables, libraries, `.prism.json`) means no archive is written. K records the job failure outside the bundle and retries. A bundle key never names a partial set of design sources.
  - **A 3D model that cannot be materialized** (an LFS object or a submodule commit that is not available on the worker) does not block the bundle. K leaves the file out of `$JOB/src`. Stage parse records the warning `model-unavailable` for each repository model reference whose target is a key entry but absent under the source root, and the GLB export builds without that body, as KiCad does with a missing model. Parse-stage consumers are unaffected. Example: a board whose models live in an uninitialized `kicad-libraries` submodule still gets every parse member.
- **Role:** the entry's category (revision-key-a1.tsp, `RevisionKeySourceCategory`), one to one. Files inside a gitlink take the category their name gives.

| Category | Role |
|---|---|
| `kicad-project` | `source-project` |
| `kicad-schematic` | `source-schematic` |
| `kicad-board` | `source-board` |
| `kicad-design-rules` | `source-design-rules` |
| `kicad-worksheet` | `source-worksheet` |
| `kicad-jobset` | `source-jobset` |
| `library-table` | `source-library-table` |
| `symbol-library` | `source-symbol-library` |
| `footprint` | `source-footprint` |
| `model-3d` | `source-3d-model` |
| `prism-settings` | `source-prism-settings` |
| `symlink`, `gitlink` | no member |

  The ADR §5 kinds are a subset. dev already checks out the same KiCad kinds for comparisons (`COMPARE_INPUTS`, `backend/app/services/project_revision.py:264-270`), and Release Studio lists the model suffixes (`backend/app/release_studio/closure_models.py:47-49`). The closure normally holds one `source-project` member, `config.project_file`; a reference into another project's directory can add more. `config` says which one the bundle is about.

### 2.3 The read set

Stage parse reads the source set only through three recorded queries (cli-spec.md §5.2.2, ADR amendment K2 §3.1): read a path, test that a path exists, and list a directory by suffix. What it read is the set of source members. Everything else it looked at is `bundle.json` `read_set`:
- **probes:** every path it asked about without reading, `present` or not: a read that found no such file in the source set, or an existence test;
- **listings:** every listing, as `directory` (`""` for the repository root), sorted `suffixes` (lowered ASCII, as the revision key's name rules; empty for every name) and the `paths` it returned, at any depth below `directory`;
- **gitlinks:** every submodule a source member, probe or listing reached into, with the commit its gitlink records.

The recording is a set: producers run in parallel, so `read_set` is sorted and free of duplicates (I13), never a log in call order. Stages board and models copy it unchanged.

**Why it is there.** Stage parse is deterministic in its inputs (ADR §7), and its inputs are the source members' bytes, the configuration and the generator. A stored bundle therefore serves any revision key of the same project, configuration digest and generator whose tree gives every source member the same key entry, every probe the same answer and every listing the same paths (`prism-kicad bundle reuse`, cli-spec.md §5.10). Stages board and models run on the archive's own `sources/` (cli-spec.md §9.1), so the rule covers all three stages.

**Canonical form `R`** (the design key's input, `prism.semantic_index.a2` `designKey`). The concatenation, with `HT` = 0x09 and `NUL` = 0x00:
1. for each source member in `members` order: `"read" HT path HT kind HT object_id NUL`, with `gitlink HT` + the gitlink path inserted before `NUL` for a file inside a submodule;
2. for each probe in order: `"probe" HT path HT ("present" | "absent") NUL`;
3. for each listing in order: `"list" HT directory HT suffixes joined by "," HT paths joined by HT NUL`;
4. for each gitlink in order: `"gitlink" HT path HT commit NUL`.

`designKey` = lowercase hex SHA-256 of `"prism.design_key.a0" NUL config_digest NUL R`, where `config_digest` is the revision key's (revision-key.md §8). A build without `--key-record` has no `config_digest`; it hashes the canonical config bytes (§4.2 there) instead, which give the same digest.

## 3. Stages

### 3.1 Records and statuses

`bundle.json` has one record per stage under `stages` (ADR §4.4: "`bundle.json` records each stage's status"). All three records share `status`, `skip_reason`, `error`, `warnings` and `failed_members`; stage board adds `fill_provenance`, `fill_check` and `cross_check`. There are no durations or times: they would break determinism (ADR §7). K keeps timings in its job record (cli-spec.md §7.4).

| Status | Meaning | Members of the stage | `skip_reason` | `error` | `failed_members` |
|---|---|---|---|---|---|
| `pending` | not run yet; a later rewrite makes it final | none | absent | absent | empty |
| `complete` | ran; every member that applies is present | all that apply | absent | absent | empty |
| `partial` | ran; the producer of some members failed on the project's content | all others | absent | absent | non-empty |
| `failed` | stopped on a content error of the design | none (stage parse keeps its sources) | absent | present (`CliFinding`) | empty |
| `skipped` | never runs for this bundle key | none | present | absent | empty |

What each stage can reach, and when the next one runs:

- **parse:** `complete`, `partial` or `failed`. Never `pending` or `skipped`: no archive exists before stage parse ends.
  - `failed`: the project cannot be parsed (`source-unparseable`, `source-not-utf8`, `source-format-unsupported`, `source-missing`; cli-spec.md §5.2.2). The archive holds `bundle.json` and the sources, which still serve the raw-file viewers and the KiCad-output jobs: ERC, DRC and Gerbers run KiCad on `sources/` (ADR §2.1).
  - `partial`: the model was built but a producer failed on it: `design.json` (`design-build-failed`) or one projection (`projection-failed`). Every other member is written.
- **board:** runs when parse is `complete` or `partial`. Otherwise `skipped` with `earlier-stage-failed`; with no board (`config.board` absent), `skipped` with `no-board`; `earlier-stage-failed` wins, as in the CLI (`cli-a0.tsp`, `CliSkipReason`). It is `complete`, or `partial` when the materializer fails on the board (`materialization-failed`): the refilled board, if any, stays, for the KiCad-output jobs, and there is no cross-check, so simulation is refused.
- **models:** runs when board is `complete`; otherwise `skipped` (`no-board` when board was skipped for `no-board`, else `earlier-stage-failed`). It only checks, canonicalizes and copies files the backend produced, so it is `complete` or `skipped`, never `partial` or `failed`, in a2. The component GLB and its readers (C4, C5) need the materialization anyway.
- **Backend steps** (the zone refill before board, unless `config.zone_fills` is `saved`; the GLB export before models) that fail are retried by K and never recorded: the stage stays `pending`, and after K's last attempt the job ends failed (cli-spec.md §9.2 step 4). A deterministic KiCad failure therefore leaves the stage pending with a failed job; see §3.3 and the open question in the W0 report.

Stage-specific fields of stage board:
- `fill_provenance` is present exactly when board is `complete` or `partial`: `saved` exactly when `config.zone_fills` is `saved`, else `refilled`. With `saved`, the stage's `warnings` hold `saved-fills-used` (the materialized fills were not refilled and may be stale) and no `stale-saved-fills`.
- `cross_check` is present exactly when `materialization/board.kmpack` is; `fill_check` exactly when it is and `fill_provenance` is `refilled`. A refill is always made by `generator.refill_procedure` with a KiCad of `generator.kicad_version`'s major.minor.

A `pending` or `skipped` stage has empty `warnings` and no optional field except `skip_reason`.

### 3.2 What is recorded and what is not

A stage record must be a pure function of the inputs and the generator, because the bundle key promises that. cli-spec.md §5.2.7 draws the line: content failures of the design are recorded (exit 9); usage, input, limit, timeout, I/O, precondition and internal failures are not, and leave the stored archive unchanged.

| Outcome (a1 error where there was one, sim: `src/prism-bundle/src/error.rs`) | a2 |
|---|---|
| I/O error, timeout, memory cap, killed process (`Io`, `Json`) | not recorded; archive unchanged; the job retries |
| A limit of cli-spec.md §7.2 hit, a derived member over `max-member-bytes` included | not recorded (limits are configuration, not part of the bundle key) |
| Source set cannot be materialized (LFS, gitlink) | no archive; the job retries |
| Malformed schematic or board, missing sheet, source not UTF-8, unsupported format (`MalformedSchematic`, `MissingSource`, `BadSheetReference`, `NotText`) | stage parse `failed`, `error` with the CLI's code and the source location |
| Project has no board (a1: `MissingSource { role: "board" }`, fatal) | not an error: `config.board` absent, stages board and models `skipped` with `no-board` |
| Project absent at the revision: the anchor is not in the tree | not a failure, and no archive: there is no revision key and nothing to bundle. `revision-key` and `bundle build` report `project-absent` (exit 10, cli-spec.md §4); K records it, and consumers show "not present at this revision" (`conventions.md` §8) |
| `design.json` builder fails (`Design`) | stage parse `partial`, `design.json` in `failed_members` (`design-build-failed`); cross-check `skipped` |
| One projection producer fails | stage parse `partial`, that projection in `failed_members` (`projection-failed`) |
| Materializer or pack fails (`Materialization`, `Pack`) | stage board `partial`, `materialization/board.kmpack` in `failed_members` (`materialization-failed`); models `skipped` (`earlier-stage-failed`) |
| Zone refill or GLB export fails in the backend | not recorded; the stage stays `pending`; the job retries (§3.1) |
| The cross-check finds errors | not a stage failure: stage board `complete`, `cross_check.status: failed` (a1 behaviour, sim: `src/prism-bundle/src/build.rs:4-6`) |

A failed, partial or skipped stage is final for its bundle key. A fix that changes the outcome is a new generator, hence a new bundle key (ADR §5).

**Codes.** Stage errors and member-failure codes are the CLI's (cli-spec.md §8). Warning codes are the manifest's: a1's `stale-saved-fills` and `kicad-default-stackup` (sim: `src/prism-bundle/src/build.rs:251-305`) and `saved-fills-used` (§3.1) in stage board, the eight cross-check codes (sim: `src/prism-bundle/src/crosscheck.rs:76-90`) in `cross_check`, and each projection producer's own codes in stage parse, documented in that projection's field map (`conventions.md` §8).

### 3.3 Readiness: how a consumer knows what it can read

A consumer declares the member paths it needs (ADR §4.4). For each path `p`, with `S` the stage that writes `p` (§2.1):

1. `p` is in `members` → **ready**. Read it and check its size and SHA-256 (§9).
2. `S.status` is `pending` → **not yet**. If K's `design_bundle` job for this bundle key is queued or running, wait for its next stage event, or poll `bundle.json`. If the job has ended failed (a backend step kept failing), the member is **unavailable for now**: show the job's error; K retries on the next sync or request.
3. `S` is final and `p` is not in `members` → **never, for this bundle key**:
   - `p` in `S.failed_members` → failed: show its `message`;
   - `S.status` is `failed` → failed: show `S.error`;
   - `S.status` is `skipped` → not available, for `S.skip_reason`;
   - otherwise not applicable (§2.1): `design.json` without a root schematic.

Consequences for the ADR's consumers:

- **Stage-parse consumers** (semantic index C1, Design Comparison C2, Release Studio C3, System Builder interface C4, project metadata) are ready when stage parse is final. They never wait for board or models.
- **Simulation Studio** (C6) needs `materialization/board.kmpack` and `stages.board.cross_check.status` in `passed`, `passed-with-warnings`. That is a1's gate (ref: `backend/app/services/project_bundle.py:149-161`, sim: `src/sim-worker/src/main.rs:101-122`) reading `stages.board.cross_check` instead of `cross_check`.
- **3D tab** (C5) and **System Builder 3D** (C4) need the materialization and `viewer/models/components.glb`. Until C5, the mesh 3D tab and System Builder 3D read the old semantic-visualizer store, not the bundle.

For a stored bundle a stage only ever moves from `pending` to final. The CLI can re-run a stage, which resets the later ones to `pending` and rebuilds the same bytes (cli-spec.md §5.2.1); K never does that to a stored bundle. A reader that has seen a final status may cache it.

### 3.4 Invariants (what `bundle verify` checks beyond the JSON Schema)

WP-B's `bundle verify` checks all of them (cli-spec.md §5.3 check 5, `stage-inconsistent`); WP-K's reader checks I1 on open and the rest in its tests.

- **I1** `members` is sorted by `path` in code point order, without duplicates. The archive's entries are `bundle.json` followed by exactly the `members` paths, in that order.
- **I2** Each member's `stage` is its role's stage, and its `path` has its role's form (§2.1). A source member's role is the one §2.2 gives its file name.
- **I3** `member_schema` is present exactly for roles `design`, `materialization` and `projection`, and equals the `generator.member_schemas` entry for the same path. `generator.member_schemas` lists `bundle.json` with `prism.bundle.manifest.a3`.
- **I4** `sources/` + `config.project_file` is a `source-project` member. `sources/` + `config.board` and `sources/` + `config.root_schematic`, when present, are `source-board` and `source-schematic` members.
- **I5** Statuses and `skip_reason` follow §3.1: parse is `complete`, `partial` or `failed`; board is `skipped` exactly when parse `failed` (`earlier-stage-failed`) or else `config.board` is absent (`no-board`); models is `pending` while board is `pending`, `skipped` when board is `skipped` (same reason) or `partial` (`earlier-stage-failed`), and never `partial` or `failed`.
- **I6** For each stage: `error` is present exactly when the status is `failed`, `skip_reason` exactly when it is `skipped`, and `failed_members` is non-empty exactly when it is `partial`. A `pending` or `skipped` stage has empty `warnings`. Every `failed_members` path is a fixed-path member of that stage and is not in `members`.
- **I7** In a `complete` stage every fixed-path member that applies (§2.1) is in `members`; in a `partial` stage each is in `members` or in `failed_members`; a `pending`, `failed` or `skipped` stage has no member, except stage parse's sources.
- **I8** `fill_provenance` is present exactly when board is `complete` or `partial`, and is `saved` exactly when `config.zone_fills` is `saved`. `refilled/<board name>` is a member exactly when `fill_provenance` is `refilled`. `cross_check` is present exactly when `materialization/board.kmpack` is a member; `fill_check` exactly when that member is present and `fill_provenance` is `refilled`. Stage board's `warnings` hold a `saved-fills-used` entry exactly when `fill_provenance` is `saved`, and then no `stale-saved-fills`.
- **I9** `cross_check`: `passed` has empty `warnings` and `errors`; `passed-with-warnings` has non-empty `warnings` and empty `errors`; `failed` has non-empty `errors`; `skipped` has every count 0 and every array empty, and occurs exactly when `design.json` is not a member.
- **I10** Every stage `warnings`, `cross_check.warnings` and `cross_check.errors` is sorted by `code`, then `message`, in code point order, without equal entries; `mappings` by `kind`, then `board`, then `design`; `failed_members` by `path`, without duplicates.
- **I11** `bundle_key` is present exactly when `revision_key` is, and equals `SHA-256("prism.bundle_key.a0" 0x00 revision_key 0x00 generator_bytes)` over the generator's canonical bytes (cli-spec.md §5.1.3–§5.1.4).
- **I12** `source` is present exactly on the `source-*` members, and its `path` is the member's `path` without `sources/`.
- **I13** `read_set.probes` is sorted by `path`, `read_set.listings` by `directory` and then `suffixes` (element by element), and `read_set.gitlinks` by `path`, each in code point order and without duplicates. Each listing's `suffixes` and `paths` are sorted and free of duplicates, and every listed path lies below its `directory`. No probe names a source member's path.
- **I14** The read set holds in the build's own key record: `bundle reuse` of the archive against the `--key-record` stage parse was given holds (cli-spec.md §5.10). Stage parse checks it before it writes the archive; a violation is a defect (exit 1, `internal`). `bundle verify` has no key record and does not check it.

## 4. Zip encoding

The writer is a1's (sim: `src/prism-bundle/src/zip.rs`); cli-spec.md §6.1 states the same rules. The result is a plain zip that `unzip`, Python `zipfile` and any zip library can read.

### 4.1 Order

1. `bundle.json`, always the first entry (a1: sim `src/prism-bundle/src/reader.rs:34-39`).
2. Every other member in `members` order: by path in code point order (UTF-8 byte order).

There are no directory entries.

### 4.2 Each entry

Local file header and central directory record, little-endian, fields as in APPNOTE 6.3:

| Field | Value |
|---|---|
| version made by (central only) | `20` (0x0014: zip 2.0, host 0 = MS-DOS) |
| version needed to extract | `20` |
| general purpose flags | `0x0800` (bit 11: the name is UTF-8). Every other bit is clear: no encryption (bit 0), no data descriptor (bit 3) |
| compression method | `0` stored or `8` deflated (§4.3) |
| last modified time, date | `0x0000`, `0x0021`: 1980-01-01 00:00:00, for every entry |
| CRC-32 | IEEE 802.3 CRC of the uncompressed bytes |
| compressed and uncompressed size | the real sizes; never `0xFFFFFFFF` (no zip64) |
| file name | the member path, UTF-8 |
| extra field length | `0` |
| file comment length (central) | `0` |
| disk number start, internal attributes, external attributes (central) | `0`, `0`, `0` |
| relative offset of local header (central) | where the entry starts |

External attributes `0` with host MS-DOS store no Unix mode, so extractors apply their defaults; the unpacked cache sets modes itself (§8).

End of central directory: disk numbers `0`, both entry counts equal to the number of entries, the central directory's size and offset, comment length `0`. Nothing follows it.

**The layout is canonical.** The first local header is at offset 0. Each entry's data is followed directly by the next local header. The central directory follows the last entry's data directly and lists the entries in the same order. The end record follows it and ends the file. A reader can check the whole layout in one pass (§9).

### 4.3 Compression

Every member, `bundle.json` included, is deflated (method 8, raw DEFLATE) with `miniz_oxide` at level 6, and stored instead when deflating does not make it strictly smaller, as a1 does (sim: `src/prism-bundle/src/zip.rs:143-152`). Empty members are stored.

The compressor is pinned by `Cargo.lock`. Member bytes and SHA-256s never depend on it; archive bytes do. A `miniz_oxide` upgrade that changes its output is a generator change (`crate_version`, cli-spec.md §5.1.2).

### 4.4 JSON members written by `prism-kicad`

`bundle.json`, `design.json` and the projections are UTF-8 without BOM, `serde_json` compact, keys in TypeSpec declaration order (maps in code point order), followed by exactly one LF (`conventions.md` §13). a1 pretty-printed `bundle.json` (sim: `src/prism-bundle/src/build.rs:346`); a2 does not.

### 4.5 Determinism

ADR §7: the same inputs and the same generator give byte-identical members and a byte-identical archive. In detail:

- `bundle.json` holds no time, duration, host path, user or machine name; a1's optional `created_at` is gone.
- The archive bytes depend only on the final set of members and on `bundle.json`, not on how many stage rewrites produced them (§7).
- Sources, `design.json`, the projections, the refilled board and the materialization are reproducible. Measured for this spec: three a1 builds of `fixtures/release-studio/usb-pd` with a KiCad 10.0.6 refill gave byte-identical archives (`f56b65d2…`), refilled boards (`ef71b931…`) and packs.
- **`viewer/models/components.glb` needs canonicalizing.** `kicad-cli pcb export glb` (10.0.6) writes the wall-clock time into `asset.extras.generated_at`, and the output file's name into `asset.extras.pcb_name` and `source_pcb_file`; `SOURCE_DATE_EPOCH` is ignored. The backend exports to a file named `components.glb`, and the CLI rewrites `generated_at` in place to `1980-01-01T00:00:00` (cli-spec.md §5.2.4). Measured: two exports of USB-PD-Trigger-Board a second apart differ only in that value, and both canonicalize to `ec4b495a…` (1,360,412 bytes), the member in this contract's example.

## 5. Paths

Every member path is an `ArchivePath` (`tsp/prism/common.tsp`): `/`-separated, relative, no empty, `.` or `..` segment, no leading or trailing `/`, no `\` and no `:`. It is a1's `check_member_name` (sim: `src/prism-bundle/src/zip.rs:102-117`) as a regex, and stricter than a1's TypeSpec pattern, which allowed a trailing `/`.

Additional rules, checked by the writer and the reader (G8):

- valid UTF-8, without C0 control characters (U+0000–U+001F) or U+007F. (A W0 request asks to put this into Common's `ArchivePath` and `RepoPath`.)
- at most `max-path-bytes` (4,096) UTF-8 bytes in all (cli-spec.md §7.2), and at most 255 bytes per segment, the `NAME_MAX` of Linux and macOS file systems, so every member can be extracted;
- unique, also after NFC normalization and Unicode simple case folding, so the archive extracts on a case-insensitive file system (cli-spec.md §5.2.2 `source-path-collision`, §6.2 `zip-path-collision`).

A source whose repository path breaks a rule cannot be bundled: the build fails without an archive (cli-spec.md §5.2.2, exit 3).

## 6. Limits

The limits are the CLI's (cli-spec.md §7.2), with the same names and defaults, applied by every writer and reader:

| Limit | Default | Hard bound |
|---|---|---|
| `max-archive-bytes` | 4,294,967,295 | zip32: 32-bit offsets |
| `max-archive-members` (entries, `bundle.json` included) | 32,768 | zip32: 65,535 |
| `max-member-bytes` (one member, uncompressed) | 2,147,483,648 | zip32: 4,294,967,295 |
| `max-total-unpacked-bytes` (sum of `bytes`, checked before anything is inflated) | 8,589,934,592 | — |
| `max-compression-ratio` (members over 1 MiB) | 200 | — |
| `max-path-bytes` | 4,096 | zip: 65,535 |
| `max-json-depth`, `max-json-nodes` (`bundle.json`) | 256, 8,000,000 | — |

A writer that would exceed one fails without writing (exit 4, not recorded, §3.2). A reader rejects the archive before reading further.

## 7. Atomic rewrite per stage

ADR §4.4: "the bundle archive is rewritten atomically at the end of each stage". The CLI does the file operations (cli-spec.md §5.2.5: temp file in the target's directory, fsync, self-verify, `rename(2)`, fsync the directory). The rules a reader relies on:

1. **Stage parse** writes the first archive: `bundle.json` with parse final and board and models `pending` (or `skipped` per §3.1), the sources and the parse members.
2. **Stages board and models** read the stored archive (`--in`), fully validated (§9), with their stage `pending`. Every existing member is copied byte-identical. The stage adds its own members. The new `bundle.json` differs from the old one only in that stage's record, and in `members` by the added entries. Earlier stage records and members never change.
3. **Readers never see a partly written archive.** A reader that opened the old file keeps reading the old version (POSIX `rename`). It takes `bundle.json` and every member from **one** open file, or checks each extracted file against the manifest it read; it never mixes two versions. To see a newer stage it opens the path again.
4. **One writer per bundle key.** The CLI takes no lock; K runs all stages of one bundle key in one job and dedups jobs on the bundle key (ADR §4.4, cli-spec.md §9.1).

Because members and their order never change between rewrites, the archive after parse → board → models is byte-identical to the archive any other run of the same stages would give.

## 8. Storage and the unpacked cache

**Archive** (ADR §5, cli-spec.md §5.1.4): `.kicad-prism/bundles/<project_id>/<revision_key>/<generator_digest>.prism`, where `<revision_key>` is the key in lowercase hex and `<generator_digest>` is the SHA-256 hex of the generator's canonical bytes.

**Unpacked cache.** It sits beside the archive, as the reference branch's did (ref: `backend/app/services/project_bundle.py:65-68`), with one directory per archive version:

```text
.kicad-prism/bundles/<project_id>/<revision_key>/
  <generator_digest>.prism                   the archive, rewritten per stage (§7)
  <generator_digest>/                        unpacked cache; can always be deleted
    <manifest_sha256>/                       one archive version: SHA-256 of that version's bundle.json bytes
      bundle.json                            byte copy of that bundle.json, written first
      <member path>                          members extracted at their archive paths, all or a subset
```

- **Which version.** A reader reads `bundle.json` from the archive, hashes it and uses `<generator_digest>/<that hash>/`. Each stage rewrite changes `bundle.json`, so it gets a new directory, and no reader sees a half-updated tree. The reference branch replaced the directory with `rmtree` and `rename`, which leaves a moment with no directory (ref: `project_bundle.py:127-139`).
- **Lazy, verified extraction.** A reader extracts only the members it needs, with `prism-kicad bundle extract` (cli-spec.md §5.4) or its own reader. Each file is written to a temp file beside its target, checked for size and SHA-256, then renamed into place. A file in a version directory is therefore always verified, and files are never modified after the rename. Two readers extracting the same file race harmlessly: same bytes.
- **Reuse.** A member with the same path and `sha256` as in the previous version may be hard-linked from that version's directory instead of extracted again.
- **Modes.** Regular files `0644`, directories `0755`. No symlinks, devices or other special files are ever created; nothing from the archive's attributes is applied.
- **Path safety.** Extraction never follows a symbolic link below the version directory and opens new files exclusively (cli-spec.md §5.4 containment). A file in the way with other bytes is an error, never overwritten.
- **Shared archives** (ADR amendment K2 §3.6). An archive stays at the path of the revision key it was built for. Other revision keys it serves reach it through the commit index's alias table (revision-key.md §10); no copy is made. Retention keeps an archive while an alias row references it.
- **Clean-up.** K's retention removes version directories that are not the current archive's after a grace period, and the whole `<generator_digest>/` when the archive goes (ADR §5: older generators of a revision are removed when a new one is stored).

## 9. Reader validation

Every reader (WP-B's Rust reader, `bundle verify`, `bundle extract` and `--in`; WP-K's Python reader) runs steps 1–5 when it opens an archive and steps 6–7 for each member it reads. `bundle verify` runs every step on every member, plus §3.4.

1. **Container** (G8). The file is at most `max-archive-bytes`. The end record is the last 22 bytes (comment length 0, nothing after it); its disk numbers are 0; its two counts are equal and at most `max-archive-members`.
2. **Central directory and local headers.** Every check of cli-spec.md §6.2, plus the canonical layout of §4.2: versions `20`, flags `0x0800`, time `0x0000` and date `0x0021` in both headers; extra and comment lengths 0; entry *i*'s local header starts where entry *i−1*'s data ends, and the central directory starts where the last entry's data ends; the local header repeats the central record's method, flags, time, date, CRC, both sizes and exact name bytes. Names pass §5. Declared sizes respect §6.
3. **Manifest.** The first entry is `bundle.json`. It inflates within `max-member-bytes`, parses as UTF-8 JSON without BOM within `max-json-depth` and `max-json-nodes`, and validates against `generated/schema/BundleManifestA3.json` with every schema of `generated/schema/` registered, so the embedded generator and effective-config roots resolve by `$id`. A document whose `schema` is not `prism.bundle.manifest.a3` is rejected (`manifest-unsupported`): an a2 bundle, or an a1 `board.prism` (`schema: "prism.bundle.manifest"`, `version: "a1"`), needs a rebuild, which the generator bump of a3 makes happen anyway.
4. **Listing.** The remaining entry names equal `members`' paths one to one and in order. Each entry's uncompressed size equals the member's `bytes`; their sum is within `max-total-unpacked-bytes`.
5. **Identity.** `bundle_key` equals the key the reader asked for: K knows it from the store path and the commit index. A mismatch means the file is in the wrong place.
6. **Member bytes.** Inflate with an output limit of `bytes` (a1 does this: sim `src/prism-bundle/src/zip.rs:275`); the result must be exactly `bytes` long, match the CRC-32 and match `sha256`. A reader that streams to disk hashes while writing and deletes the file on mismatch (as ref `project_bundle.py:117-123` does).
7. **Structured members.** For a member with `member_schema`:
   - a `prism.*` id: parse the JSON and validate it against the schema registered under that id in `generated/schema/`;
   - `kicad_monkey.design.a0`: parse the JSON and check that its `schema` equals the id (no JSON Schema exists, §2.1);
   - `kicad_monkey.materialization.a0`: check the pack preamble (magic `KMMATPK\0` and a supported pack format version equal to `generator.pack_format_version`: fork `src/rs/kicad-monkey-materialization-pack/src/lib.rs:51-54`) and validate the header with the pack reader, as `prism-geometry` does (sim: `src/prism-geometry/src/lib.rs:82-118`).
   A reader that does not know an id cannot read that member; it treats it as missing and does not reject the bundle.

   **K's reader runs step 7 once per stored archive** (amendment C2r §2 item 9). When it stores an archive it runs `prism-kicad bundle verify`, every step on every member, and records the outcome with the archive. Its later reads of that archive run steps 1–6 only: the SHA-256 of step 6 ties the bytes read to the bytes that were validated. An archive whose verify failed is treated as rejected. The Rust reader, `bundle verify`, `extract` and `--in` are unchanged.

A reader that fails steps 1–5 rejects the whole archive. K treats a rejected archive like a missing one: it deletes it and queues a rebuild, as the reference branch does with a damaged unpack (ref: `backend/app/services/semantic_visualizer_service.py:410-416`).

## 10. Differences from a1 at archive level

| a1 | a2 | Why |
|---|---|---|
| `bundle.json` pretty-printed | compact + LF | `conventions.md` §13 |
| sources at `sources/<project-relative path>`: only the project, board, sheets and `<stem>.kicad_dru` (sim: `src/prism-bundle/src/sources.rs:91-127`) | `sources/<repo path>` for the closure the build read (§2.2), gitlink files included, symlinks left out, each member cross-referenced to its key entry (`source`) | KiCad-output jobs and viewers need the referenced worksheets, library tables, libraries and repository 3D models; files can sit outside the project directory (decision Q3, revision-key.md §12) |
| no board: the build fails (sim: `sources.rs:106`) | no board: stages board and models `skipped` (`no-board`) | schematic-only projects (`backend/tests/fixtures/design_variants/sch_only`) still get the parse members |
| malformed schematic: the build fails | stage parse `failed`, sources kept | recorded once per bundle key instead of retried; the raw-file viewers still work (`backend/tests/fixtures/design_variants/malformed`) |
| `--no-refill`: saved fills materialized, chosen per build | refilled by the backend, or saved fills only when the project's configuration says `zone_fills: "saved"`, which is in the revision key; never a fallback | two builds of one bundle key give the same bytes (cli-spec.md §5.2.3) |
| one archive, written once | written after parse, rewritten after board and models | staged readiness (ADR §4.4) |
| `viewer/**`: any files (`viewer-asset`) | only `viewer/models/components.glb` (`component-models`); no `viewer-asset` role | the GLB outlives the transitional viewer, whose assets stay in the old store until WP-C5 (ADR §6, `decisions.md`) |
| reader: names checked, CRC, sizes, SHA-256 (sim: `src/prism-bundle/src/reader.rs:29-63`) | adds the canonical-layout, header-agreement, flag, extra-field, control-character, collision, limit and identity checks of §9 | G8: bundles are built from untrusted repositories |

## 11. Agreement with cli-spec.md

The points on which the two W0 drafts first differed are resolved in this document's favour, and cli-spec.md now states the same rules:
- a failing projection, `design.json` or materializer gives stage `partial` (exit 9), not `failed`;
- every projection is written, in its empty form when its inputs are absent;
- readers require exactly the writer's flags, time, date and versions, and the canonical gap-free layout (cli-spec.md §6.2);
- path segments are at most 255 bytes.
