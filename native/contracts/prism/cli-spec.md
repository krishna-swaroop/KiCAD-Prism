# `prism-kicad` command-line specification (a0)

- **Status:** W0 draft for maintainer review. It is frozen with the other W0 contracts. After that it changes only by an ADR amendment.
- **Parent:** [`../adr-native-design-bundle.md`](../../../docs/architecture/adr-native-design-bundle.md), §2.1, §4.4, §5, §6, §7, §9.3 and §11 (G8).
- **JSON contracts:** [`tsp/prism/cli-a0.tsp`](../../src/tsp/prism/cli-a0.tsp), namespace `Prism.Contracts.CliA0`. Field map: [`field-maps/cli.md`](field-maps/cli.md). One example per root in `examples/`.
- **Companion specs.** This spec owns the command line: arguments, streams, exit codes, the generator id and bundle key, CLI limits, and how the backend calls the CLI. Two other specs own the rest:
  - [`bundle-format.md`](bundle-format.md), the manifest contract, owns the archive: member layout, stage records, readiness, the unpacked cache;
  - [`revision-key.md`](revision-key.md) owns the revision key, its source-set selection and the effective configuration.
- **Implemented by:** WP-B, in `native/src/rs/prism-kicad-cli/` (binary `prism-kicad`).
- **Called by:**
  - WP-K: the `design_bundle` job in `backend/app/services/design_bundle/`;
  - later, the MCP server (ADR §10, item 5) and prism-sim-studio's tools.

Citations follow [`conventions.md`](conventions.md): a bare path is in this repository, `fork:` is kicad_monkey at `b6316117`, `sim:` is prism-sim-studio, `ref:` is `feature/analytic-pack-spike`.

| Root model | Schema id | Written to | Example |
|---|---|---|---|
| `CliVersionA0` | `prism.cli.version.a0` | stdout of `version`: **the generator id** | `examples/CliVersionA0.example.json` |
| `CliBuildResultA0` | `prism.cli.build_result.a0` | stdout of `bundle build`, exit 0 or 9 | `examples/CliBuildResultA0.example.json` |
| `CliVerifyReportA0` | `prism.cli.verify_report.a0` | stdout of `bundle verify`, exit 0 or 8 | `examples/CliVerifyReportA0.example.json` |
| `CliExtractResultA0` | `prism.cli.extract_result.a0` | stdout of `bundle extract`, exit 0 | `examples/CliExtractResultA0.example.json` |
| `CliReuseResultA0` | `prism.cli.reuse_result.a0` | stdout of `bundle reuse`, exit 0 (§5.10) | `examples/CliReuseResultA0.example.json` |
| `CliErrorA0` | `prism.cli.error.a0` | stdout of any command, exit 1–7 | `examples/CliErrorA0.example.json` |
| `CliProjectAbsentA0` | `prism.cli.project_absent.a0` | stdout of `revision-key` and `bundle build --stage parse`, exit 10: the project is absent at this revision | `examples/CliProjectAbsentA0.example.json` |
| `CliCompareResultA0` | `prism.cli.compare_result.a0` | stdout of `compare`, exit 0 | `examples/CliCompareResultA0.example.json` |
| `CompareObjectDeltaA0` | `prism.compare.object_delta.a0` | `-o` of `compare` (§5.6); TypeSpec `tsp/prism/compare-a0.tsp` | `examples/CompareObjectDeltaA0.example.json` |
| `CliArtworkResultA0` | `prism.cli.artwork_result.a0` | stdout of `artwork` (§5.7) | `examples/CliArtworkResultA0.example.json` |
| `CliVendorListA0`, `CliVendorRunResultA0` | `prism.cli.vendor_list.a0`, `prism.cli.vendor_run_result.a0` | stdout of `vendor list` / `vendor run` (§5.8) | one example each |
| `CliStrokeTextResultA0`, `CliStrokeFontMetricsA0`, `CliDrawingSheetResultA0` | `prism.cli.stroke_text_result.a0`, `prism.cli.stroke_font_metrics.a0`, `prism.cli.drawing_sheet_result.a0` | stdout of `stroke-text` / `drawing-sheet` (§5.9) | one example each |
| `StrokeTextRequestA0`, `DrawingSheetRequestA0`, `ArtworkConfigA0`, `VendorJlcpcbConfigA0` | `prism.stroke_text.request.a0`, `prism.drawing_sheet.request.a0`, `prism.artwork.config.a0`, `prism.vendor.jlcpcb.config.a0` | inputs of §5.7–§5.9 | one example each |
| `AssemblyHlrA0` | `prism.assembly_hlr.a0` | bundle member `models/assembly-hlr.json`, stage `models` (§5.2.4) | `examples/AssemblyHlrA0.example.json` |
| `CliDiagnosticA0` | `prism.cli.diagnostic.a0` | every stderr line of every command | `examples/CliDiagnosticA0.example.json` |
| `RevisionKeyRecordA1` | `prism.revision_key.record.a1` | stdout of `revision-key`, exit 0 | revision-key contract, not defined here |

`--config` takes a `RevisionKeyEffectiveConfigA1` (`prism.revision_key.effective_config.a1`), the effective project configuration. This spec refers to it and to `RevisionKeyRecordA1` by name only. Both are defined in `tsp/prism/revision-key-a1.tsp`.

## 0. Decisions in brief

1. **One stdout document, JSON Lines on stderr, a fixed exit-code table.** stdout holds one document, chosen by the exit code (§3, §4). Callers decide from the exit code and stdout, never from stderr.
2. **Stages chain through `--in`.** `--stage parse` takes `<project.kicad_pro>`. `--stage board` and `--stage models` take `--in <bundle>` and accept no project. `-o` may name the same file as `--in`. Each invocation rewrites the archive atomically: temp file in the same directory, fsync, self-verify, rename (§5.2).
3. **`models` is a third value of `--stage`.** It adds `viewer/models/components.glb` from `--models-glb` (ADR §4.4 step 5). §9.3 of the ADR lists only `parse|board`; §12 asks to amend it.
4. **The CLI never runs KiCad.** The backend produces the KiCad inputs by procedures that this spec pins and the generator id names (§9):
   - the refilled board, by `pcbnew` ZONE_FILLER, unless the effective configuration says `zone_fills: "saved"` (§5.2.3);
   - the GLB, by `kicad-cli pcb export glb`.

   `--refill-tool` and `--models-tool` must have the generator id's `kicad_version` major.minor; patch releases are tolerated (maintainer decision). A failing KiCad step is retried by the backend and never recorded, and never replaced by the saved fills.
5. **The design's own content is recorded, not lost.** When the design's content fails a stage or one of its members, the CLI still writes the archive, records the outcome in the manifest and exits **9**:
   - a malformed file, a missing sheet or an unsupported format gives stage `failed`;
   - a failing projection, `design.json` or materializer gives stage `partial`.

   Every other failure leaves `-o` untouched (§5.2.7).
6. **The generator id has a canonical byte form**: `schema` first, every other key in code point order, compact ASCII JSON. The **bundle key** is `SHA-256("prism.bundle_key.a0" 0x00 ‖ revision-key-hex ‖ 0x00 ‖ generator-bytes)`. Test vectors are in §5.1.5.
7. **Limits are explicit, named and overridable** with `--limit <name>=<value>`. Hitting one is never recorded in a bundle. Every invocation also has:
   - a wall timeout, enforced inside the CLI;
   - a heap cap, enforced by a counting allocator.

   The backend bounds concurrency with a `design_bundle` resource slot sized against the worker's memory (§7).
8. **No host paths, clock times or measured durations in any document.** Files are named by their bundle member path and arguments by `CliArgument`. The same inputs therefore give byte-identical stdout.

## 1. Lineage

| Tool | Convention | What `prism-kicad` keeps or changes |
|---|---|---|
| fork `kicad-monkey-native` | One JSON document on stdout. On failure, a `NativeError` JSON on stderr and exit 1 (fork: `src/rs/kicad-monkey-native/src/main.rs:37-60`). Error kinds `request`, `path`, `io`, `resource_limit` and `core` (fork: `src/tsp/kicad_monkey/native-transport-a0.tsp:33-39`). The error document is capped at 64 KiB (fork: `src/rs/kicad-monkey-native/src/lib.rs:81`, `:532-549`). | Keeps the single stdout document and the 64 KiB line cap. The error document moves to stdout, so stdout always holds the one document. The categories split `request` into `usage`, `input` and `precondition`, and add `timeout`, `output-io` and `internal`. |
| fork `kicad-cruncher` | Exit 2 for argument errors, 1 for failures (fork: `packages/kicad_cruncher/src/rs/kicad-cruncher-cli/src/lib.rs:557-604`). `--version` and `version` (`:235`). Transactional output: staged beside the destination, then renamed (fork: `.../src/design_bundle.rs:340-475`). | Keeps exit 2 for usage and the stage-then-rename pattern. Its human-text stdout becomes JSON. |
| sim `prism-bundle` (a1) | `version` prints one JSON line that hosts key bundles on (sim: `src/prism-bundle/src/bin/prism-bundle.rs:18-22`, `:219-227`). `build` exits 0 whenever it writes a bundle, cross-check failures included (`:24-25`). Every failure is exit 1 with free text on stderr (`:241-247`). `-o` is written with `std::fs::write`, which is not atomic (`:156-157`). Messages contain host paths (observed: `error: missing board: /Users/…/sch_only.kicad_pcb`). | `version` stays the generator id, now with a schema and a canonical form. "Exit 0 means a bundle was written" becomes "exit 0 or 9". Writes become atomic, stderr becomes structured, and host paths go. |

## 2. Invocation

### 2.1 Synopsis

```text
prism-kicad version

prism-kicad bundle build <project.kicad_pro> --stage parse -o <out.prism>
            [--source-root <dir>] [--revision-key <hex>] [--key-record <record.json>]
            [--upgraded <path>=<version>]... [--config <effective.json>] [COMMON]
prism-kicad bundle build --stage board  --in <bundle.prism> -o <out.prism>
            --refilled-board <board.kicad_pcb> --refill-tool <kicad-version>
            [--revision-key <hex>] [--config <effective.json>] [COMMON]
prism-kicad bundle build --stage models --in <bundle.prism> -o <out.prism>
            --models-glb <components.glb> --models-tool <kicad-version>
            [--revision-key <hex>] [--config <effective.json>] [COMMON]

prism-kicad bundle verify <bundle.prism> [COMMON]
prism-kicad bundle extract <bundle.prism> <member>... -o <dir> [COMMON]
prism-kicad bundle reuse --in <bundle.prism> --key-record <record.json> [COMMON]

prism-kicad revision-key <repo> (--commit <rev> | --worktree) --project <rel> [--config <effective.json>] [COMMON]

prism-kicad compare --base <base.prism> --head <head.prism>
            --base-revision-key <hex> --head-revision-key <hex> -o <result.json> [COMMON]
prism-kicad compare --base-src <project.kicad_pro> --head-src <project.kicad_pro>
            --base-revision-key <hex> --head-revision-key <hex>
            [--base-source-root <dir>] [--head-source-root <dir>]
            [--base-upgraded <path>=<version>]... [--head-upgraded <path>=<version>]...
            [--config <effective.json>] -o <result.json> [COMMON]

prism-kicad artwork --in <bundle.prism> --config <artwork.json> --view <name>... -o <dir> [--variant <name>] [COMMON]
prism-kicad vendor list [COMMON]
prism-kicad vendor run <vendor-id> --in <bundle.prism> --config <cfg.json> -o <dir> [--variant <name>] [COMMON]
prism-kicad stroke-text (--request <runs.json> | --metrics) [COMMON]
prism-kicad drawing-sheet --request <sheet.json> [COMMON]

COMMON: [--limit <name>=<value>]... [--threads <n>] [--quiet]
```

### 2.2 Argument rules

- **Options**
  - Options may appear anywhere after the command words.
  - An option takes its value as the next argument (`--stage parse`). The `--name=value` form is not accepted.
  - `-o` is short for `--output`.
  - No option may be given twice, except `--limit` with different names and `--upgraded` with different paths.
- **Positional arguments** are `<project.kicad_pro>`, `<bundle.prism>`, `<member>` and `<repo>`.
- **Paths** are host paths, absolute or relative to the working directory, and must be valid UTF-8. They are never echoed in any output. An error about an argument names it with `CliArgument`, for example `argument: "refilled-board"`.
- **Value syntax** is checked before any work. A violation is exit 2, `usage`.
  - `--revision-key`: 64 lowercase hex digits (`Sha256Hex`).
  - `--refill-tool` and `--models-tool`: a `CliReleaseVersion`, such as `10.0.6`.
  - `--stage`: `parse`, `board` or `models`.
  - `--threads`: 1 to 64, the range of kicad-cruncher's `--workers` (fork: `.../kicad-cruncher-cli/src/lib.rs:413-424`). The default is min(available parallelism, 4). Output never depends on it.
  - `--upgraded`: `<path>=<version>`, where `<path>` is a `RepoPath` ending in `.kicad_pcb` or `.kicad_sch` and `<version>` is the file's original `(version N)`, a decimal integer (§9.4).
  - `--limit`: `<name>=<value>`, where `<name>` is a `CliLimitName` and `<value>` a decimal integer from 0 to the limit's hard bound (§7.2).
  - `--quiet` drops `info` diagnostics.
- **Combinations.** A violation is exit 2, `option-conflict`.
  - `<project.kicad_pro>`, `--source-root`, `--key-record` and `--upgraded` only with `--stage parse`; `--key-record` requires `--revision-key`.
  - `--in` is required with `board` and `models`, and refused with `parse`.
  - `--refilled-board` and `--refill-tool` together, only with `board`. Whether stage `board` requires or refuses them depends on the configuration recorded in `--in`, so that check is a precondition (§5.2.3, `zone-fills-mismatch`), not a usage error.
  - `--models-glb` and `--models-tool` together, only with `models`, and required there.
  - `extract` needs at least one `<member>`.
  - `revision-key` needs exactly one of `--commit` and `--worktree` (revision-key.md §11).
- **stdin** is never read. The backend passes `/dev/null` (`backend/app/services/kicad_tools.py:268-280`).
- **Help.** `-h`/`--help` prints human-readable text to stdout and exits 0. It is not part of the contract and has no schema. `--version` is the same as `version`.

### 2.3 Environment

- `prism-kicad` reads no environment variable that changes its output. Its stdout and its archives do not depend on:
  - locale, time zone or working directory;
  - thread count, user or host;
  - the order in which the file system lists directories.
- It never touches the network. It runs no other program, except `git` for `revision-key` (§5.5).
- It is not a long-running service. One invocation is one request (ADR §2, item 6), like the fork's native transport (fork: `src/rs/kicad-monkey-native/src/main.rs:10-35`).

## 3. Output streams

### 3.1 stdout

Exactly one document goes to stdout:
- compact (`serde_json::to_writer`), UTF-8, followed by one LF;
- written once, after all other work, and for `bundle build` after the rename.

The exit code fixes which document it is:

| Command | Exit 0 | Exit 9 | Exit 8 | Exit 10 | Exit 1–7 |
|---|---|---|---|---|---|
| `version` | `CliVersionA0` | — | — | — | `CliErrorA0` |
| `bundle build` | `CliBuildResultA0` (stage `complete`) | `CliBuildResultA0` (stage `failed` or `partial`) | — | `CliProjectAbsentA0` (`--stage parse`) | `CliErrorA0` |
| `bundle verify` | `CliVerifyReportA0` (`valid`) | — | `CliVerifyReportA0` (`invalid`) | — | `CliErrorA0` |
| `bundle extract` | `CliExtractResultA0` | — | — | — | `CliErrorA0` |
| `revision-key` | `RevisionKeyRecordA1` | — | — | `CliProjectAbsentA0` | `CliErrorA0` |
| `compare` | `CliCompareResultA0`; `-o` holds `CompareObjectDeltaA0` | — | — | — | `CliErrorA0` |
| `artwork` | `CliArtworkResultA0` | — | — | — | `CliErrorA0` |
| `vendor list` / `vendor run` | `CliVendorListA0` / `CliVendorRunResultA0` | — | — | — | `CliErrorA0` |
| `stroke-text` | `CliStrokeTextResultA0` (`--request`) or `CliStrokeFontMetricsA0` (`--metrics`) | — | — | — | `CliErrorA0` |
| `drawing-sheet` | `CliDrawingSheetResultA0` | — | — | — | `CliErrorA0` |

Two cases leave stdout empty:
- a process killed by a signal;
- exit 6 `stdout-write-failed`, where stdout itself is the output that failed.

A reader treats an empty stdout as "no document".

No document contains a host path, a wall-clock time or a measured duration (conventions.md §4).
- A file is named by its bundle member path, in `CliLocation.path`:
  - `sources/<RepoPath>` for a source;
  - `refilled/<board file name>` for `--refilled-board` (absent with `zone_fills: "saved"`, which has no refilled member);
  - `viewer/models/components.glb` for `--models-glb`;
  - the member path for a member of an existing bundle.
- An argument is named by `CliArgument`.
- A host path or a time in a message is a defect.

### 3.2 stderr

**JSON Lines.** Every line is one compact `CliDiagnosticA0` followed by LF, in the order the findings occur.
- `message` is at most 4096 bytes. A longer message is cut at a character boundary and ends with `…`.
- A line is at most 64 KiB, the fork's `MAX_ERROR_BYTES` (fork: `src/rs/kicad-monkey-native/src/lib.rs:81`).
- After `max-diagnostic-lines` lines (default 10,000), one `warning` line `diagnostics-truncated` is written, and nothing more.

Severities:
- `info` for progress: `stage-started`, `sources-selected`, `stage-finished`, `archive-written`.
- `warning` for every warning the command records: the manifest's warnings and the cross-check findings.
- `error` for what fails the command, the stage or a member. A failing invocation's last `error` line carries the same `code` and `message` as its stdout `CliErrorA0`, or as the failed stage's `error`.

**Readers** (WP-K):
- copy every line into the job log;
- may surface `warning` and `error` lines;
- never decide anything from stderr;
- keep a line that is not valid JSON verbatim and do not fail on it. Such a line can only be a Rust runtime message printed before the CLI's panic hook is installed.

stderr is not covered by the determinism guarantee: with more than one thread, lines may come out in a different order.

### 3.3 Determinism

The same command, the same input bytes and the same generator give byte-identical stdout. For `bundle build` they also give a byte-identical archive (ADR §7, conventions.md §9 and §14). This holds whatever the:
- paths and working directory;
- time and user;
- thread count;
- earlier contents of `-o`.

Across CPU architectures (maintainer decision, conventions.md §14): every parse-stage JSON member and the stdout documents are byte-identical on linux arm64, linux amd64 and macOS builds. `materialization/board.kmpack`, the refilled board and the GLB are byte-identical only for the same binary and KiCad on the same architecture. §11 item 2 tests the parse-stage identity once WP-L builds both images.

## 4. Exit codes

| Exit | Category (`CliErrorA0.category`) | Meaning | stdout | `-o` afterwards | WP-K's job outcome |
|---|---|---|---|---|---|
| 0 | — | success; for `bundle build`, the stage ended `complete` | the command's result | `bundle build`: the new archive | stage complete; queue the next stage |
| 1 | `internal` | a defect: a panic, a broken invariant, a failed self-verify (§5.2.5) | `CliErrorA0` if the CLI could write it | unchanged | `RetryableJobError` (`backend/app/services/job_runtime.py:18-28`), bounded by the kind's `max_attempts` (`backend/app/services/job_kinds.py:108`) |
| 2 | `usage` | bad arguments (§2.2) | `CliErrorA0` | unchanged | `PermanentJobError` (`job_runtime.py:31-41`): a K defect |
| 3 | `input` | an argument's file cannot be used: missing, not a regular file, wrong format, outside the source root, not valid against its schema; an `--in` bundle that fails validation | `CliErrorA0` | unchanged | `PermanentJobError` |
| 4 | `resource-limit` | a limit of §7 was exceeded, the memory cap included | `CliErrorA0` with `limit` | unchanged | `PermanentJobError` for these limits; a rebuild needs a raised limit and an explicit retry |
| 5 | `timeout` | `timeout-ms` elapsed | `CliErrorA0` with `limit` | unchanged | `RetryableJobError`, because load can cause it |
| 6 | `output-io` | an output could not be written: `-o`'s directory is missing or read-only, the disk is full, or stdout failed | `CliErrorA0`, or nothing when stdout failed | unchanged, except after `stdout-write-failed`, when `-o` already holds the new archive | `RetryableJobError` |
| 7 | `precondition` | the inputs do not fit together: stage order, generator, revision key, config, zone-fill mode, KiCad version, refilled-board identity, `-o` changed under the build, a missing member, an extract collision | `CliErrorA0` | unchanged | `PermanentJobError`: a K orchestration defect or a stale `--in` |
| 8 | — | `bundle verify`: the bundle is invalid | `CliVerifyReportA0` | — | delete the stored bundle and rebuild it (bundle-format.md §9) |
| 9 | — | `bundle build`: the stage ended `failed` or `partial` on the design's content, and the outcome is recorded in the written archive (§5.2.7) | `CliBuildResultA0` | the new archive | job continues per `stages`; nothing recorded is retried (deterministic) |
| 10 | — | `revision-key`, `bundle build --stage parse`: the project is absent at this revision, its anchor not in the tree (§5.2.2, §5.5; conventions.md §8). An outcome, not a failure | `CliProjectAbsentA0` | unchanged | job complete: K records the project as absent at that revision (no key, no bundle, no retry) |
| ≥128, or negative in Python | — | killed by a signal: SIGKILL by the worker after its grace period (`backend/app/prism_worker.py:454-459`), or an OOM kill | empty | unchanged; a stale temporary file may remain (§5.2.5) | `RetryableJobError` |

- A panic is caught at the top of `main`, written as `CliErrorA0` with category `internal` and code `panic`, and exits 1. The release profile must keep `panic = "unwind"`.
- An abort, such as a stack overflow, ends with SIGABRT and is handled as "killed by a signal".
- K treats any exit code not in this table as `internal`.
- **Project absent (exit 10).** A project whose anchor is not in a revision's tree is not present at that revision, which is a definite answer, not an error. K stores it as such, and consumers render "not present at this revision" for that project rather than failing, retrying or falling back to another project file in the same directory.

## 5. Commands

### 5.1 `version`: the generator id

`prism-kicad version` takes no arguments and prints `CliVersionA0`. It never fails, except as `internal`. Its value is compiled into the binary.

#### 5.1.1 Fields

| Field | Today's source | Why it is in the id |
|---|---|---|
| `crate_version` | a1's `prism_bundle` (sim: `src/prism-bundle/src/bin/prism-bundle.rs:221`, `env!("CARGO_PKG_VERSION")`) | the explicit bump knob (§5.1.2) |
| `engine_version` | a1's `design_engine` (sim: `prism-bundle.rs:224`), `kicad_monkey_core::ENGINE_VERSION` (fork: `src/rs/kicad-monkey-core/src/lib.rs:10`) | the core that parses everything |
| `kicad_file_formats` | measured from KiCad 10.0.6 output (board `20260206`, schematic `20260306`; maintainer decision) | the parser reads only these formats, since older sources are upgraded to them first (§9.4), so they decide every parsed member's bytes |
| `kicad_version` | a1 records the refill tool's version per bundle (sim: `src/prism-bundle/src/build.rs:335`); ref passes `kicad-cli version` (ref: `backend/app/sim_studio/runs.py:134-136`); the 3D GLB cache key uses it (`kicad-prism-viewer/pipeline/topology_compiler/kicad_cli_export.py:178`) | ADR §5: the KiCad version of the KiCad-produced members, which also pins the stock 3D models (G3) |
| `member_schemas` | a1 lists `member_schema` per member (sim: `contracts/contracts/bundle.tsp:37-38`) and pins the materializer schema (`:54-57`) | ADR §5: "manifest version and projection schema versions"; checked by bundle-format.md invariant I3 |
| `models_procedure` | today's component export argv (`kicad_cli_export.py:135-143`) | the GLB is a member, and its procedure decides its bytes (§9.3) |
| `pack_format_version` | a1's `materializer.pack_format_version` (sim: `bundle.tsp:58-59`; fork: `src/rs/kicad-monkey-materialization-pack/src/lib.rs:54`, `u16`) | the pack encoding is not pinned by its schema id |
| `refill_procedure` | ref's `REFILL_REVISION = "zone-refill-a0"` and its script (ref: `backend/app/services/zone_refill.py:21-29`) | the refilled board is a member, and its procedure decides its bytes (§9.2) |
| `upgrade_procedure` | new (maintainer decision) | sources older than `kicad_version`'s file format are upgraded by it before parse, and their member bytes are its output (§9.4) |

a1's `materializer_revision` was a git SHA of the materializer crates (sim: `prism-bundle.rs:223`). It has no successor: after WP-F1 the materializer is part of this repository and is covered by `crate_version`.

#### 5.1.2 Bumping

The generator id is bumped explicitly, never derived from binary or source bytes (ADR §5).

- `crate_version` is raised in the same commit as any change that could change, for the same inputs, a member's bytes or a recorded stage outcome. That covers:
  - the core;
  - a projection producer;
  - the manifest writer;
  - the archive writer, including a `miniz_oxide` update that changes its output (bundle-format.md §4.3);
  - the GLB canonicalization;
  - an output-affecting constant such as the materialization tile size.
- `kicad_version` is raised with the worker image's KiCad (WP-L), in the same PR, and `kicad_file_formats` with it, to the `(version N)` that KiCad writes.
- `member_schemas` is updated with every new member schema version.

**Enforcement (WP-B).** `native/src/rs/prism-kicad-cli/tests/generator_pin.rs` builds every committed fixture through all stages. It compares each member's SHA-256 with a committed table keyed by the generator digest, so a changed member under an unchanged digest fails CI. The KiCad-produced inputs come from committed recordings, so the test needs no KiCad.

#### 5.1.3 Canonical bytes

The **generator bytes** are the stdout of `prism-kicad version` without its final LF. They are canonical by construction:
- `schema` comes first, then every other key in code point order, at every nesting level. `CliVersionA0` declares its fields in that order, so serde's field order is the canonical order.
- The JSON is compact, with no whitespace.
- Every value is an ASCII string matched by a pattern, an enum value or an integer. There are no floats and no escapes.

A reader may hold the document as data; for example, `bundle.json` embeds it as `generator`. Such a reader recomputes the bytes without relying on key order (conventions.md §13):

```python
def generator_bytes(doc: dict) -> bytes:
    def order(v):
        if isinstance(v, dict):
            return {k: order(v[k]) for k in sorted(v)}
        if isinstance(v, list):
            return [order(x) for x in v]
        return v
    top = {"schema": doc["schema"], **{k: order(doc[k]) for k in sorted(doc) if k != "schema"}}
    return json.dumps(top, separators=(",", ":"), ensure_ascii=True).encode("ascii")
```

WP-B's test asserts `generator_bytes(json.loads(stdout)) == stdout[:-1]`.

#### 5.1.4 Generator digest, bundle key, storage path

```text
generator_digest = lowercase_hex(SHA-256(generator_bytes))
bundle_key       = lowercase_hex(SHA-256(
                     "prism.bundle_key.a0"          19 ASCII bytes
                     0x00
                     revision_key                   64 ASCII bytes, lowercase hex (RevisionKeyRecordA1.revision_key)
                     0x00
                     generator_bytes))
```

- The domain prefix is versioned. A change of framing uses `prism.bundle_key.a1` and needs an ADR amendment.
- The revision key has a fixed length, so the framing is unambiguous. The second `0x00` keeps it readable.
- When `--revision-key` is given, the CLI writes the revision key and the bundle key into the manifest (`revision_key`, `bundle_key`; bundle-format.md invariant I11). Readers check the bundle key (bundle-format.md §9 step 5).
- **Storage path** (ADR §5, bundle-format.md §8): `.kicad-prism/bundles/<project_id>/<revision_key>/<generator_digest>.prism`. The bundle key names the bundle wherever one name is needed: the job's `artifact_key` and ETags. It identifies content, not a project, while storage is per project, so K's job dedup key is `<project_id>:<bundle_key>` (maintainer decision): two projects with identical sources build and store their own bundles.
- Shell recipe (bash), for tests: `{ printf 'prism.bundle_key.a0\0%s\0' "$rk"; prism-kicad version | head -c -1; } | sha256sum`.

#### 5.1.5 Test vectors

The vectors use the generator id in `examples/CliVersionA0.example.json`:
- crate 0.1.0;
- engine 2026.9.7;
- KiCad 10.0.6, with file formats board `20260206` and schematic `20260306`;
- pack format 0;
- all three procedures at a0;
- the eleven member schemas of ADR §6.

Its generator bytes are 1122 bytes long. Its `generator_digest` is `d32ccf9dccfc4084e4b9f9ab7dea77ef0e1b69f51cacddd9466db8ad735fb82c`.

| revision_key | bundle_key |
|---|---|
| `0000000000000000000000000000000000000000000000000000000000000000` | `e6ab4edd790af8cbb4afd150db63aa6df5f4a087778dce00597c19035fdb5069` |
| `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `775106309b02f0b095de315ee7c9a79ff349a21bfb01c58a0d3e2d6a16556524` |
| `42e41c598a193d09f6917ee92b7c71e52e9e15a251a63b7a955ef41beb841f34` | `bf3d0663c4bf8eb7cbea4e251b30d910198f43b0d4d4da05d537665ae46b7e24` |

Changing only `kicad_version`, to `10.0.7`:
- `generator_digest` becomes `46d03769928b812a78dff62e01945649b668b76b6fd512ec9efd0a403fd1d960`;
- the all-zero revision key gives `55c345ad04d8f55eb120f8f61291519f70fd3377aad74811da7a44bac717ffc4`.

These values were computed by the Python above and checked with the shell recipe. WP-B (Rust) and WP-K (Python) both reproduce them, the same acceptance as the revision-key vectors (ADR §9.3).

### 5.2 `bundle build`

#### 5.2.1 Stages and chaining

| Stage | Takes | Requires in `--in` | Adds members | Final statuses (bundle-format.md §3.1) |
|---|---|---|---|---|
| `parse` | `<project.kicad_pro>`, `--source-root` | — (no `--in`) | `sources/**`; `design.json` when there is a root schematic; every `projections/*.json`, in its empty form when its inputs are absent | `complete`, `partial` or `failed`. It marks `board` and `models` `pending`, or `skipped` (`no-board` or `earlier-stage-failed`). |
| `board` | `--in`, `--refilled-board`, `--refill-tool`; with `zone_fills: "saved"`, `--in` only | `parse` `complete` or `partial`, and `board` not `skipped` | `refilled/<board file name>` (not with `zone_fills: "saved"`), `materialization/board.kmpack` | `complete` or `partial`. It marks `models` `pending`, or `skipped`/`earlier-stage-failed` when `board` is `partial`. |
| `models` | `--in`, `--models-glb`, `--models-tool` | `board` `complete` | `viewer/models/components.glb` | `complete` |

The member paths, roles and stage-record rules belong to the manifest contract (bundle-format.md §2–§3).

**Chaining uses an explicit `--in`, not an implicit `-o`.** A later stage reads the earlier archive from `--in <bundle>`, and `-o` may name the same file. The backend passes the stored bundle as both, so the archive is replaced atomically after each stage, as ADR §4.4 requires. Readers that hold the old file open keep reading the old inode (POSIX rename). Reading an existing `-o` implicitly was rejected for three reasons:
- the same flag would mean "input" for one stage and "fresh output" for another;
- a stale or foreign file at `-o` would be built upon silently;
- a stage could not write somewhere else, which tests and the MCP server want.

**Re-running a stage** is allowed. It gives the same result as running the chain again up to that stage:
- the members and records of earlier stages are copied byte-identical;
- the stage's own members and record are replaced;
- the members of later stages are dropped, and those stages go back to `pending`.

The final archive of `parse → board → models` is therefore the same whatever was re-run on the way. K never re-runs a stage on a stored bundle: for K, a stage only moves from `pending` to final (bundle-format.md §3.3).

**Checks on `--in`**, before any other work:
1. `bundle.json` declares `prism.bundle.manifest.a3`; otherwise exit 7, `manifest-unsupported`. An a2 bundle, or an a1 `board.prism` from the reference branch, is rejected here.
2. It passes every other reader check (§6.2; bundle-format.md §9 steps 1–4 and 6); otherwise exit 3, `bundle-invalid`, with the first finding's location.
3. Its generator id equals this binary's, compared as canonical bytes; otherwise exit 7, `generator-mismatch`. The bundle key covers the generator, so stages of two generators never mix.
4. Its stage states allow the requested stage (table above); otherwise exit 7:
   - `stage-order` when a prerequisite is not met;
   - `stage-not-applicable` when the stage is `skipped`.
5. If `--revision-key` or `--config` is given, it must equal what `--in` records; otherwise exit 7, `revision-key-mismatch` or `config-mismatch`. Both are recorded once, by `parse`; later stages accept them only as assertions.

#### 5.2.2 Stage `parse`

**Inputs:**
- `<project.kicad_pro>` is the project file, a regular file inside the source root.
  - When nothing exists at that path and the path lies inside the source root, the project is absent: exit 10, `project-absent`, stdout `CliProjectAbsentA0` with the path relative to the source root, after the argument and `--config` checks below and before any source is read. `-o` is unchanged. No other file in its directory stands in for it.
- `--source-root <dir>` is the directory that stands for the repository root. It defaults to the project file's directory. In the job, it is the directory where K materialized the source set (§9.1). Every source's `RepoPath` is its path relative to it.
- `--config <effective.json>` is the `RevisionKeyEffectiveConfigA1`, validated against its schema; an invalid one is exit 3, `config-invalid`.
  - Its `project_file` must equal the project's `RepoPath`; otherwise exit 7, `config-mismatch`.
  - Its `root_schematic` and `board` choose what is parsed, and its `excluded_dirs` limit the selection (revision-key.md §4, §14). Today's equivalent is `backend/app/services/path_config_service.py:92-106` (ADR §11 G6).
  - Without `--config`, the CLI uses the default configuration of revision-key.md §4.3: KiCad's own pairing of `<stem>.kicad_sch` and `<stem>.kicad_pcb` beside the project file. The manifest records the configuration either way.
- `--revision-key <hex>` is recorded verbatim in the manifest, together with the bundle key (§5.1.4).
  - The CLI cannot recompute it from a materialized tree. LFS files are hydrated there, while the key uses pointer blob ids; submodules are expanded, while the key uses gitlink commit ids (ADR §5).
  - K passes the key of the commit it materialized.
  - Without it, the manifest records neither key (bundle-format.md, `revision_key`), which is for local and test use only.

**Source selection.** `parse` bundles the closure the build read, exactly as bundle-format.md §2.2 defines it (revision-key.md §12, Q3).
- **Selector.** It uses the same Rust selector as `revision-key --worktree` (revision-key.md, "Selection"), applied to the files under the source root with the effective configuration's `excluded_dirs`, to find the source set the parse may read. A materialized submodule's files are selected like any other file, by name, while the key holds only the gitlink.
- **Members.** Each file of the source set that the parse reads becomes the member `sources/<RepoPath>`, with its bytes unchanged. A selected file no reference reaches is not a member.
- **Recording** (ADR amendment K2 §3.1). Stage parse and every producer reach the source set only through three queries, and each call is recorded:
  - *read* a path: a file it returns becomes a member; a path not in the source set is recorded as a probe, absent;
  - *exists*: a probe, present or absent;
  - *list* a directory by suffixes: the source-set paths at any depth below it whose ASCII-lowered name ends with one of the suffixes (every name when none are given), in code point order, recorded with the paths returned.

  No producer may see the source set as a whole. A query that reaches into a materialized submodule also records that gitlink with its commit, taken from `--key-record`. The manifest writes the recording as `read_set` (bundle-format.md §2.3), sorted and without duplicates, whatever order the parallel producers called in.
- **Key entries.** `--key-record <record.json>` is the `RevisionKeyRecordA1` of the revision, as `revision-key` printed it; one that is not valid against its schema is exit 3, `key-record-invalid`. Its `revision_key` must equal `--revision-key` and its `config` the effective configuration; otherwise exit 7, `revision-key-mismatch` or `config-mismatch`. Each member's `source` (`path`, `kind`, `object_id`) is copied from its entry, or from the gitlink entry above it plus the file's blob id in the submodule. A member with neither is exit 7, `revision-key-mismatch`. Without `--key-record` (local and test builds), `kind` comes from the executable bit and `object_id` is the SHA-1 blob id of the bytes as `git hash-object --no-filters` computes it, which matches the key only when no clean filter or LFS applies.
- **Upgrades.** Each `--upgraded <path>=<version>` names a source K upgraded before the parse (§9.4). The member `sources/<path>` records `upgraded_from_version: <version>` (bundle-format.md §2.2), and its `source` keeps the committed blob's key entry. A path that is not a member, or a version not older than `kicad_file_formats` for its kind, is exit 3, `upgrade-record-invalid`. The CLI does not compare the member's bytes with the version: they are already upgraded.
- **Links.** The selector never follows a symbolic link. A link or special file under the source root is exit 3, `source-not-regular-file`. K does not materialize symlink entries (bundle-format.md §2.2).
- **Other exit-3 failures:**
  - `source-outside-root`: the project file, or a file a source references, resolves outside the source root. For example, a sheet at `../common/x.kicad_sch` under the default root. With the repository root as source root, as in the job, this means a reference that leaves the repository.
  - `source-path-invalid`: a path that is not valid UTF-8, holds a control character, or breaks `RepoPath` or the length rules (bundle-format.md §5).
  - `source-path-collision`: two paths equal after NFC normalization and Unicode simple case folding. They could not be extracted on a case-insensitive file system.
- **Source limits** apply before any parsing: `max-source-files`, `max-source-file-bytes`, `max-total-source-bytes` and `max-path-bytes` (exit 4).

**Parse.** One parse of the selected sources gives `design.json` and every projection (ADR §4.4: "ONE parse").
- Without a root schematic there is no `design.json`.
- A projection whose inputs are absent is written in its empty form (bundle-format.md §2.1).
- Without a board, `board` and `models` are marked `skipped` with `no-board`.

**Recorded outcomes** (exit 9; §5.2.7, bundle-format.md §3.2):

| Outcome | Status | Code |
|---|---|---|
| an s-expression or JSON syntax error, with line, column and offset from the core's `Position` (fork: `src/rs/kicad-monkey-core/src/sexpr.rs:59-69`) | `failed` | `source-unparseable` |
| a source that is not UTF-8 | `failed` | `source-not-utf8` |
| a file format version or token the core does not read, for example `backend/tests/fixtures/design_variants/kicad11_tokens` | `failed` | `source-format-unsupported` |
| a sheet, or the configuration's root schematic or board, that resolves inside the source root but is not in the source set; located at the referencing file and line | `failed` | `source-missing` |
| a repository 3D model reference whose target is a key entry but absent under the source root, because K could not materialize it (bundle-format.md §2.2) | not a failure: a stage-parse warning, the reference's target not a member | `model-unavailable` |
| the design-JSON builder rejects the model | `partial`, `design.json` in `failed_members` | `design-build-failed` |
| a projection producer rejects the model; the message names the projection | `partial`, that projection in `failed_members` | `projection-failed` |

A source over a parser limit (`max-sexpr-depth`, `max-sexpr-nodes`, `max-sexpr-string-bytes`, `max-json-depth`, `max-json-nodes`) is exit 4, not a recorded outcome (§5.2.7). The same applies to a derived member over `max-member-bytes`.

#### 5.2.3 Stage `board`

**Zone-fill mode.** The effective configuration recorded in `--in` (`config.zone_fills`, revision-key.md §4) fixes how the stage gets its fills. It is part of the revision key, so a bundle key has exactly one mode.
- **Refill** (`zone_fills` absent, the default): `--refilled-board` and `--refill-tool` are required, as below. Without them, exit 7, `zone-fills-mismatch`, `argument: "refilled-board"`.
- **Saved** (`zone_fills: "saved"`): `--refilled-board` and `--refill-tool` are refused. Given, exit 7, `zone-fills-mismatch`, with the argument. The stage builds from the source board as saved.

**Inputs** (refill mode):
- `--refilled-board <pcb>` is the board after the backend's zone refill (§9.2).
  - It is limited by `max-source-file-bytes`, must be a regular UTF-8 file, and must parse as a `.kicad_pcb`. Otherwise exit 3, `refilled-board-invalid`, with the parse position.
  - **Identity check.** Its footprint UUIDs, as a set, must equal those of the source board in `--in`. Otherwise exit 7, `refilled-board-mismatch`.
  - A refill changes zone fills and the file-format version only. `pcbnew.SaveBoard` upgrades a KiCad 9 board to the running KiCad's format, as observed on `fixtures/release-studio/usb-pd`: `(version 20241229)` became `(version 20260206)`.
- `--refill-tool <ver>` must have the major.minor of the generator id's `kicad_version` (`10.0.7` is accepted for `10.0.6`). Otherwise exit 7, `kicad-version-mismatch`.

**Work:**
1. Materialize the refilled board with the source `.kicad_pro`, as a1 does (sim: `src/prism-bundle/src/build.rs:390-397`). In saved mode, materialize `sources/<config.board>` from `--in` instead. A board without a stated stackup takes KiCad's default and warns `kicad-default-stackup`, as a1 does (`build.rs:296-306`).
2. Refill mode: compare the saved fills with the refill, and warn `stale-saved-fills` when they differ (sim: `build.rs:248-266`). Saved mode: no fill check runs. The stage records `fill_provenance: saved` and the warning `saved-fills-used` (bundle-format.md §3.1).
3. Cross-check the materialization against `design.json` and record the result in the stage's `cross_check`. A cross-check failure does not fail the stage. It gates simulation only, as in a1 (sim: `src/prism-bundle/src/lib.rs:22-24`; ref: `backend/app/services/project_bundle.py:149-161`).

Saved fills are a per-project choice, never a fallback (maintainer decision, decisions.md "CLI" item 1). a1's `--no-refill` flag (sim: `prism-bundle.rs:73`) has no successor: the mode comes from the configuration, which is in the revision key, not from an option K picks per build. a1's `fill_provenance: saved` (sim: `contracts/contracts/bundle.tsp:41-47`) survives as the stage's provenance in saved mode. Two builds of one bundle key must give the same bytes, so in refill mode a refill that fails is retried by the backend, never replaced by the saved fills (§9.2).

**Recorded outcome** (exit 9): the materializer or the pack encoder rejects the board. Examples are a board without copper layers, or a1's `BundleError::Materialization` (sim: `src/prism-bundle/src/error.rs:56-58`).
- The stage ends `partial`, with `materialization/board.kmpack` in `failed_members` and code `materialization-failed`.
- The refilled board stays a member, for the KiCad-output jobs (refill mode; saved mode has none).
- There is no cross-check, and `models` is `skipped`/`earlier-stage-failed`.

#### 5.2.4 Stage `models`

**Inputs:**
- `--models-glb <glb>` (§9.3) is limited by `max-models-glb-bytes`. It must be a glTF 2.0 binary, otherwise exit 3, `models-glb-invalid`:
  - magic `glTF`;
  - version 2;
  - a header length equal to the file size;
  - a first chunk of type `JSON` that parses.
- `--models-tool <ver>` must have the major.minor of `kicad_version`. Otherwise exit 7, `kicad-version-mismatch`.
- **No viewer input.** a1's transitional viewer assets (role `viewer-asset`, sim: `src/prism-bundle/src/build.rs:193-246`) are not bundle members (maintainer decision, decisions.md). The mesh 3D tab and System Builder 3D keep reading the semantic-visualizer store until WP-C5 retires it.

**Canonicalization.** `kicad-cli pcb export glb` is not deterministic. KiCad 10.0.6 writes:
- `asset.extras.generated_at` as the wall-clock time;
- `asset.extras.pcb_name` and `source_pcb_file`, taken from the output file name.

On `fixtures/release-studio/usb-pd`, two exports to the same file name a second apart differ only in `generated_at` (`83d55350…` vs `52d1506e…`). Their binary chunks are identical.

The CLI therefore:
1. Requires `asset.extras.source_pcb_file`, when present, to be `components.glb`. Otherwise exit 7, `models-glb-name`. The backend always exports to that file name.
2. Replaces, in place, the 19 characters of a `generated_at` value of the form `YYYY-MM-DDTHH:MM:SS` with `1980-01-01T00:00:00`, the zip writer's fixed time. Chunk and file lengths stay unchanged, and nothing else is touched.
3. Rejects any other form of `generated_at` with exit 3, `models-glb-invalid`.

Both observed exports canonicalize to the same bytes, `ec4b495a…` (1,360,412 bytes). The rule belongs to `crate_version` (§5.1.2).

The stage only checks, canonicalizes and copies files the backend produced, so it ends `complete` or fails without writing. A failing GLB export is the backend's, retried and never recorded (§9.3).

**Assembly HLR (amendment C3, §3.1; implemented with chunk D).** Stage `models` also writes `models/assembly-hlr.json` (`AssemblyHlrA0`):
- **Extra inputs:**
  - `--geometer <exe>`, the pinned Geometer runtime. Its version must be the one `hlr_procedure` names, else exit 7, `geometer-version-mismatch`; if it cannot be started, exit 1, `geometer-unavailable`, which K retries.
  - `--model-dir <VAR>=<dir>`, repeatable, the KiCad stock 3D model library the generator id's KiCad version pins.
  - `--hlr-cache <dir>`, optional.
- **Model resolution:** for each footprint, its first `.step`/`.stp` model: from `sources/` (repository), through `--model-dir` (`kicad-library`), or from embedded files (`kicad-embed://`).
- **The CLI runs Geometer here.** That is the one external program it runs: §0 item 4 still holds for KiCad. A per-footprint failure (`model-unavailable`, `model-not-step`, `projection-failed`) is recorded in the member and does not fail the stage.
- **Cache:** keyed by the STEP bytes' sha256, the pose's rotation and scale, the HLR options and the runtime version. Its entries are reused after board translation and rotation about the board normal.
- **Generator id:** gains `hlr_procedure` (runtime version and options), so changing either is a generator bump.

#### 5.2.5 Atomicity

1. **Temp file.** The CLI creates `<dir>/.<name>.prism-kicad-<pid>-<n>.tmp` in `-o`'s directory with `O_CREAT|O_EXCL`, so the final rename never crosses a file system. This is the cruncher's pattern, applied to a file instead of a directory (fork: `.../kicad-cruncher-cli/src/design_bundle.rs:453-475`). If `-o`'s directory is missing, it is exit 6, `output-write-failed`. The CLI does not create directories.
2. **Write.** The archive is streamed into the temp file, so memory never holds the whole archive. a1 built it in a `Vec<u8>` (sim: `src/prism-bundle/src/zip.rs:155-198`).
3. **Self-verify.** The CLI fsyncs the temp file, re-reads it, and runs `bundle verify` checks 1–3 and 5 (§5.3): structure, manifest, every member's size and SHA-256, the manifest invariants.
   - Check 4, member schema validation, is left to the tests and to `bundle verify`, to stay within ADR §7's stage budget.
   - A failure is exit 1, `self-verify-failed`, and the temp file is removed.
   - A file at `-o` is therefore always a valid archive with correct digests.
4. **Compare.** When `-o` exists and is also this invocation's `--in`, its `bundle.json` must still have the SHA-256 the CLI read at the start. Otherwise the result is exit 7, `output-changed`, and the CLI's work is discarded.
5. **Rename** over `-o` with `rename(2)`, then fsync the directory.
6. **Then stdout** (§3.1).

**Failures and signals:**
- On any failure before the rename, and on SIGTERM, SIGINT or SIGHUP, the CLI removes its temp file and leaves `-o` unchanged. After a signal it exits 128+n without a document.
- The timeout watchdog removes the temp file before it exits 5.
- Under SIGKILL or power loss, a stale temp file can remain. Its name is hidden and unique, so it never shadows a bundle. K's store sweeper deletes `.*.prism-kicad-*.tmp` files older than one hour.

The CLI takes no lock. Callers serialize the stages of one bundle, and K dedups jobs on the bundle key (ADR §4.4, bundle-format.md §7).

#### 5.2.6 Idempotence

`bundle build` is a pure function of:
- the argument values other than paths;
- the bytes of the selected sources;
- the bytes of `--in`, `--refilled-board`, `--models-glb` and `--config`;
- the generator.

Running it again writes byte-identical archive bytes and stdout. The file's mtime and inode change; nothing else does. A caller may compare `archive_sha256` instead of rereading the file.

#### 5.2.7 Behaviour on failure

| Failure | Exit | `-o` | What is recorded |
|---|---|---|---|
| The design's own content fails the running stage (§5.2.2–§5.2.3) | 9 | replaced | stage `failed` with `error` (`CliFinding`). The archive holds the earlier stages' members, plus `sources/**` for `parse`. Every later stage is `skipped`/`earlier-stage-failed`. |
| The design's own content fails one of the stage's members (§5.2.2–§5.2.3) | 9 | replaced | stage `partial`. Each failed member is in `failed_members` with its code; the stage's other members are written. Later stages are `pending` or `skipped` (bundle-format.md §3.1). |
| Any other failure: usage, input, resource limit, timeout, output I/O, precondition, internal, signal | 1–7, ≥128 | unchanged | nothing; only the stdout `CliErrorA0` and the stderr diagnostics |

Content outcomes are recorded because they are a deterministic property of the revision and the generator: the two things the bundle key names.
- Recording caches the answer. Consumers waiting on a member get a definite "failed: … at `sources/x.kicad_sch` line 1" instead of a retry loop.
- The browser viewers still have `sources/` to show (ADR §2.1).

Limits, timeouts and the memory cap are not recorded. They depend on configured values and on load, which the bundle key does not cover. Recording them would freeze a configuration-dependent answer into a content-addressed file.

`examples/CliBuildResultA0.example.json` is the recorded failure of `backend/tests/fixtures/design_variants/malformed`, whose `broken.kicad_sch` has an unclosed root list at line 1, column 1, offset 0.

### 5.3 `bundle verify`

`prism-kicad bundle verify <bundle.prism>` reads the archive and writes `CliVerifyReportA0`. It writes no file. Its checks implement bundle-format.md §9 and §3.4.

Checks, in order:
1. **Archive structure, path and size rules** (§6.2; bundle-format.md §9 steps 1–2). A structural failure stops the checks.
2. **Manifest** (bundle-format.md §9 step 3). `bundle.json` is the first member, valid JSON within `max-json-depth`/`max-json-nodes`. It declares `prism.bundle.manifest.a3` (else `manifest-unsupported`) and validates against that schema (else `manifest-invalid`, with `pointer`).
3. **Members** (bundle-format.md §9 steps 4 and 6):
   - The archive's members and the manifest's member list are the same set, in the same order: `member-missing`, `member-unlisted`, `member-order`.
   - Each member's size, CRC-32 and SHA-256 match: `member-digest-mismatch`, `zip-size-mismatch`, `zip-crc-mismatch`.
   - Every member is checked; `members_checked` counts them.
4. **Structured members** (bundle-format.md §9 step 7).
   - Every JSON member with a schema id in `member_schemas` validates against that schema: `member-schema-invalid`, with `pointer`.
   - `materialization/board.kmpack` opens with the pack reader and its header validates, as a1's verify does (sim: `prism-bundle.rs:186-201`); otherwise `member-unreadable`.
   - `design.json` has no published JSON Schema in the fork (fork: `contracts/generated/schema/` holds none), so only its `schema` field is checked.
5. **Stage states and invariants** (bundle-format.md §3.4, I1–I13; I14 is stage parse's own check): `stage-inconsistent`, with the invariant's number in the message. For example:
   - `board` `complete` requires `materialization/board.kmpack`;
   - a `failed` stage has none of its members;
   - `bundle_key` recomputes from `revision_key` and `generator` (I11).
6. **`generator_matches`** compares the manifest's generator id with this binary's. A mismatch is not a finding: a bundle from an older generator can be valid.

Bundle-format.md §9 step 5, the bundle key the caller expected, is the caller's to check against `bundle_key`.

**Exit:**
- 0 when there is no finding, 8 otherwise.
- A `<bundle.prism>` that does not exist or is not a regular file is exit 3, `input-not-found` or `input-not-regular-file`, with `CliErrorA0`.
- Exceeding the memory cap or the timeout is exit 4 or 5.

Verify does not re-parse the sources or rebuild projections. The determinism test (§11) does that.

### 5.4 `bundle extract`

`prism-kicad bundle extract <bundle.prism> <member>... -o <dir>`

- **Selection.**
  - Each `<member>` is either an exact member path or a directory prefix ending in `/` (such as `sources/`), which selects every member below it.
  - `bundle.json` can be selected.
  - A `<member>` that selects nothing is exit 7, `member-not-found`.
- **Checks before writing.**
  - Archive structure (§6.2) and the manifest (§5.3, checks 1–2) are checked first.
  - Each selected member's size, CRC-32 and SHA-256 are checked while it is streamed.
  - The other members are not inflated.
  - A failure is exit 3, `bundle-invalid`.
- **Writing.** `<dir>` must exist and be a directory; otherwise exit 6, `output-not-directory`. Each member is written to `<dir>/<path>`, creating parent directories.
  - **Containment.** The CLI opens `<dir>` once and works relative to it. It creates subdirectories itself and opens every component with `O_NOFOLLOW`, so it never follows a symbolic link below `<dir>`. This is the fork's contained-read pattern, used for writing (fork: `src/rs/kicad-monkey-native/src/lib.rs:847-931`, `cap_std::fs::Dir`).
  - **Atomic files.** Each file is written to a temp file beside its target and renamed into place.
  - **Existing files.** A file already at the path with the member's exact bytes is left as it is. With other bytes, or with a link or non-directory in the way, the result is exit 7, `archive-path-collision`, and nothing is overwritten (bundle-format.md §8). This also catches two member paths that a case-insensitive file system folds together.
  - **Modes.** Files get mode `0644` and directories `0755`. No attribute from the archive is applied.
- **Atomicity** is per file, not per invocation. On failure, the files already in place are complete and verified, and nothing else has changed. Running the same command again completes the set, which K's unpacked cache relies on (bundle-format.md §8).
- **Idempotence.** The same bundle and selection give the same files and a byte-identical `CliExtractResultA0`.
- **Prior art and users.** The reference branch's Python unpack makes comparable checks (ref: `backend/app/services/project_bundle.py:103-139`). `extract` exists for hosts without their own zip safety: the MCP server, the sim tools, and K if it chooses.

### 5.5 `revision-key`

`prism-kicad revision-key <repo> (--commit <rev> | --worktree) --project <rel> [--config <effective.json>]` prints `RevisionKeyRecordA1`.

The semantics are revision-key.md §11's:
- exactly one of `--commit` and `--worktree`;
- no parse and no KiCad file read;
- selection by name.

This spec fixes only the process contract:
- stdout as in §3.1 and exit codes as in §4;
- the limits `timeout-ms`, `max-memory-bytes`, `max-config-bytes`, `max-source-files` (selected entries) and `max-path-bytes`;
- exit 3 with `repo-not-found`, `commit-not-found` or `config-invalid`;
- exit 7 with `config-mismatch`;
- exit 10 with `project-absent` and stdout `CliProjectAbsentA0` when the project file is not a project file of the listing (revision-key.md §5.3, §11).

`git` runs with an environment of `PATH`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_TERMINAL_PROMPT=0`, and `HOME` set to an empty temp directory.
- It runs in its own process group, so `timeout-ms` kills it too.
- The repository's own config is read: clean filters for `--worktree` are part of the key's definition (revision-key.md §6).

### 5.6 `compare`

`prism-kicad compare` computes every Design Comparison tab except fabrication between two revisions, as `DesignCompareResultA1` (`prism.design_compare.result.a1`; field map `field-maps/design-compare.md`), with ecad-viewer's `KiCadProjectDiffBundleV1` inside it (ADR amendment C2r, [`adr-native-design-bundle-amendment-c2r.md`](../../../docs/architecture/adr-native-design-bundle-amendment-c2r.md); its checks and keys come from amendment C2, [`adr-native-design-bundle-amendment-c2.md`](../../../docs/architecture/adr-native-design-bundle-amendment-c2.md)). It is a pure function of its two revisions: no repository, no host path and no clock reaches the output.

- **Arguments.** Each side is a bundle or a source tree:
  - `--base <bundle.prism>` / `--head <bundle.prism>`: a stored bundle. The two may name the same file, which gives no changes.
  - `--base-revision-key <hex>` / `--head-revision-key <hex>`, required in both modes: each side's revision key, the result's identity. A bundle may serve several revision keys (ADR amendment K2 §3.6), so `compare` never takes the identity from the archive's `revision_key`; with these arguments, a bundle and a source tree of the same revision give the same result, apart from the side's `bundleKey`.
  - `--base-src <project.kicad_pro>` / `--head-src …`: a source tree, for a commit with no bundle yet. It takes optionally `--<side>-source-root`, `--<side>-config` and `--<side>-upgraded <path>=<version>`, with `bundle build --stage parse`'s meaning. `compare` runs the parse stage's own code with only the five producers it reads (`board-objects`, `semantic-index`, `occurrences`, `stackup`, `route-metrics`), in memory: no archive, no deflate, no verify. Of `design.json` it builds only the `components` and `nets` the semantic index reads. A source tree and its bundle give the same result, apart from the side's `bundleKey`.
  - `--include-unchanged` lists unchanged BOM rows too.
  - `-o <result.json>` is required.
- **Checks, in order.**
  1. Each bundle passes the reader checks (§6.2) and manifest checks 1–2 (§5.3). Only the five members and `sources/<project dir>/.prism.json` are inflated, and each is checked for size, CRC-32 and SHA-256 while it streams. A failure is exit 3, `bundle-invalid`, with `argument` `base` or `head`. A source tree fails as `bundle build --stage parse` does.
  2. The two sides name the same generator id, byte for byte in canonical form (a source tree's is the running CLI's). Otherwise exit 7, `generator-mismatch`: members of two producers are not comparable, and the backend rebuilds the stale bundle.
  3. Both sides' `config.project_file` lie in the same directory. Otherwise exit 7, `anchor-mismatch`. Object keys and document paths are relative to that directory, so two project files in one directory share a key space and compare.
  4. Each side holds the five members: stage `parse` is `complete`, or `partial` without the member in `failed_members`. Otherwise exit 7, `member-not-found`, with `argument` `base` or `head`.
- **Output.** `-o` receives one `DesignCompareResultA1`, compact UTF-8 JSON with one trailing LF, streamed and written atomically: a temp file in the same directory, fsync, rename (§5.2.5, without the self-verify). stdout receives `CliCompareResultA0` after the rename: each side's revision key, bundle key (absent for a source tree) and object count, and the object diff's counts.
- **Rules fixed here:**
  - document paths and object keys are relative to the directory of the project file (C2 D1);
  - changes are sorted by `id`, and every map's keys in code point order (C2 D2, divergence `compare-1`);
  - the BOM columns are the head revision's `.prism.json` `bom.fields`, else `Reference`, `Value`, `Footprint`, `Datasheet`.
- **Exit codes.** 0, or 1–7 as in §4.
- **Limits.** The reader limits of §7.2 bound the inputs. `max-memory-bytes` and `timeout-ms` have `compare` defaults; when either side is a source tree, the command takes the parse stage's defaults instead, since it runs that stage.
- **Idempotence.** The same two sides give byte-identical `-o` and stdout.

### 5.7 `artwork`

Release Studio's assembly and testpoint views (amendment C3 §3.2), a port of Cruncher 2026.9.7 `pcb-svg` (`kicad_cruncher_cmd_pcb_svg.py`, `kicad_cruncher_pcb_svg_compositor.py`).

- **Input:**
  - the board: `refilled/<stem>.kicad_pcb` when the bundle has it, else `sources/` (saved fills), parsed once by the core;
  - body outlines from `models/assembly-hlr.json`;
  - designators and variants from `placements` and `occurrences`;
  - `--config` is an `ArtworkConfigA0`; each `--view` must name one of its views, else exit 2, `view-unknown`.
- **Stages required:** `parse`, `board` (or saved fills) and `models`, else exit 7, `stage-order`.
- **Output:** `<dir>/<view>.svg` per view, written atomically, and `CliArtworkResultA0` on stdout: per view, the file's sha256, the footprints drawn, the designators placed, and the footprints without a body outline.
- **Rules:**
  - footprint selection by `selector_overrides`;
  - layer tokens and styles from the config;
  - designators by region fitting inside the HLR outline, else the hole envelope, else the pad envelope;
  - the canvas from `global.canvas` (`board_outline` plus `margin_mm`).
- **Idempotence:** the same bundle, config, views and generator give byte-identical files and stdout.

### 5.8 `vendor`

- **`vendor list`** prints `CliVendorListA0`: each vendor's `id`, name, outputs (file kind, format, version) and config schema id. The list is fixed by the binary.
- **`vendor run <vendor-id>`** reads `projections/occurrences.json` and `projections/placements.json`; `placements` a1 provides the aux origin. It writes the vendor's files to `<dir>` atomically and prints `CliVendorRunResultA0` (files, sha256, row counts, and any components it excluded and why).
  - An unknown id is exit 2, `vendor-unknown`.
  - `--config` is the vendor's config schema; for JLCPCB, `VendorJlcpcbConfigA0`.
- **JLCPCB:**
  - BOM columns `Comment, Designator, Footprint, JLCPCB Part #` and CPL columns `Designator, Layer, Mid X, Mid Y, Rotation`;
  - Cruncher 2026.9.7's grouping, order and decimal rules, and its coordinates relative to the aux origin with y negated;
  - CSV and XLSX output.
- **Parity:** CSVs byte-identical and XLSX cell-identical to Cruncher's on the fixtures (amendment C3 §4).

### 5.9 `stroke-text` and `drawing-sheet`

- **`stroke-text --request <runs.json>`** takes a `StrokeTextRequestA0`, a batch of runs, each `{text, x_mm, y_mm, size_mm, h_align, v_align}`. It prints `CliStrokeTextResultA0`: per run, the NewStroke polylines in mm, the advance width and the code points the font lacks.
- **`stroke-text --metrics`** prints `CliStrokeFontMetricsA0`, the per-glyph advance table, so layout can measure text without a process per string.
- **`drawing-sheet --request <sheet.json>`** takes a `DrawingSheetRequestA0`: page size in nm, paper name, title block, comments 1–4, sheet index and count, file name, sheet path and name, and KiCad version. It prints `CliDrawingSheetResultA0`, the default worksheet's operations: lines, rectangles, polylines and text runs with their stroke-text geometry.
- **Parity:** equal to Python kicad_monkey's `kicad_stroke_font` and `drawing_sheet_to_ops(load_default_drawing_sheet(), …)` within 1e-9 mm (amendment C3 §4).

### 5.10 `bundle reuse`

`prism-kicad bundle reuse --in <bundle.prism> --key-record <record.json>` answers whether a stored bundle serves another revision key of its project (ADR amendment K2 §3.3). It reads only `bundle.json` and the key record: no source, no blob, no member other than the manifest. It writes no file.

- **Inputs.** `--in` passes the reader checks and manifest checks 1–2 of §5.3; otherwise exit 3, `bundle-invalid`. `--key-record` is a `RevisionKeyRecordA1` valid against its schema; otherwise exit 3, `key-record-invalid`.
- **Conditions,** checked in this order. The first that fails is the result's `failure`, with the first failing path in code point order:
  1. `config`: the record's `config_digest` equals the digest of the bundle's `config` (revision-key.md §8);
  2. `generator`: the bundle's generator id is this binary's, byte for byte in canonical form;
  3. `model-unavailable`: stage parse recorded no `model-unavailable` warning;
  4. `read`: every source member's `source` is an entry of the record with the same `path`, `kind` and `object_id`, or, for a file inside a submodule, its `gitlink` is an entry of the record;
  5. `probe`: each probe's path is the path of a record entry of kind `regular` or `executable` exactly when the probe says `present`; a probe below a gitlink of the read set is not evaluated here (condition 7 covers it);
  6. `listing`: each listing, evaluated on the record's `regular` and `executable` entries, returns exactly its `paths`, apart from paths below a gitlink of the read set;
  7. `gitlink`: every gitlink of the read set is an entry of the record with the same commit, and no gitlink entry of the record lies below a listing's `directory` unless the read set lists it.
- **Output.** stdout is `CliReuseResultA0`: `holds`, the bundle's `bundle_key`, the record's `revision_key`, and `failure` when it does not hold. Exit 0 in both cases: not holding is an answer, not an error.
- **Budget.** ≤ 0.2 s on EDA-04903's bundle and key record (ADR amendment K2 §3.3).
- **Idempotence.** The same two inputs give byte-identical stdout.

## 6. Archive rules

The archive format belongs to bundle-format.md (§4–§9). The CLI implements it for writing, for `--in`, and for `verify` and `extract`. This section states the rules the CLI enforces, with their finding codes.

### 6.1 Writer

The writer follows a1's deterministic zip (sim: `src/prism-bundle/src/zip.rs:1-10`, `:127-198`):
- zip version 2.0;
- every member, `bundle.json` included, deflated with miniz_oxide at level 6, or stored when deflate does not shrink it;
- fixed DOS time 1980-01-01 00:00:00;
- general-purpose flags `0x0800` (UTF-8), nothing else;
- no extra fields, no comments;
- version made by and version needed both 20; external attributes 0;
- no directory entries;
- a CRC-32 per member;
- a canonical, contiguous layout (bundle-format.md §4.2).

Member order: `bundle.json` first, then every other member by path in code point order (sim: `build.rs:423`). `bundle.json` is compact serde JSON plus LF (conventions.md §13); a1 pretty-printed it (sim: `build.rs:346`).

There is no zip64 (sim: `zip.rs:185-196`). A bundle that would exceed `max-archive-bytes` or `max-archive-members` is exit 4, `limit-exceeded`.

### 6.2 Reader (`verify`, `extract`, `--in`)

The reader accepts exactly the writer's subset. Every rejection is a verify finding. For `extract` and `--in`, it is exit 3, `bundle-invalid`, with the first finding's location.

| Check | Finding code |
|---|---|
| The end-of-central-directory record is the last 22 bytes: no comment, no trailing data. Disk numbers are 0 and both entry counts are equal. There are no zip64 records. | `zip-malformed` / `zip-unsupported` |
| Layout is canonical: the first local header is at offset 0, each entry's data is followed directly by the next local header, and the central directory follows the last entry's data directly (bundle-format.md §4.2) | `zip-malformed` |
| Every header has versions 20, flags exactly `0x0800`, method 0 or 8, time `0x0000`, date `0x0021`, extra and comment lengths 0, and attributes 0. This rules out encryption and data descriptors (sim: `zip.rs:243-247`). | `zip-unsupported` |
| Every local header repeats its central record's method, flags, time, date, CRC, both sizes and exact name bytes | `zip-malformed` |
| Every name is valid UTF-8 and a valid `ArchivePath` (`check_member_name`, sim: `zip.rs:103-117`). It has no control characters (U+0000–U+001F, U+007F), is at most `max-path-bytes`, and has no segment over 255 bytes. | `zip-path-invalid` |
| No two names are equal (sim: `zip.rs:301-306`), or equal after NFC normalization and Unicode simple case folding | `zip-duplicate-member` / `zip-path-collision` |
| Member count ≤ `max-archive-members`; file size ≤ `max-archive-bytes` | `limit-exceeded` |
| Each declared uncompressed size ≤ `max-member-bytes`, and their sum ≤ `max-total-unpacked-bytes`. Checked from the central directory before anything is inflated. | `limit-exceeded` |
| For a member over 1 MiB uncompressed, floor(uncompressed ÷ compressed) ≤ `max-compression-ratio` | `zip-ratio-exceeded` |
| Inflation is streamed and bounded by the declared size, as a1 bounds it (sim: `zip.rs:275`). The inflated size equals the declared size exactly, and the CRC-32 matches. | `zip-size-mismatch` / `zip-crc-mismatch` |

**Measured ratios.** The highest ratio among the real members built for this spec is 7.2, for `viewer/models/components.glb` of usb-pd. Next come `design.json` at 6.8, the schematics at 6.2 and the STEP models at 5.8.
- A limit of 200 leaves a factor of 28 over these, while deflate's ceiling is about 1032.
- The limit applies only above 1 MiB, so small, highly regular files never trip it.

## 7. Resource limits and timeouts (ADR §11 G8)

### 7.1 What the core already bounds

The core has no wall-clock bound anywhere: there is no deadline or timeout in `src/rs/kicad-monkey-core`. Its size and count limits:

| Core limit | Default | Where |
|---|---|---|
| s-expression `max_source_bytes`, `max_depth`, `max_nodes`, `max_decoded_string_bytes` | 512 MiB, 512, 16,000,000, 64 MiB | fork: `src/rs/kicad-monkey-core/src/sexpr.rs:144-166` |
| `PcbLimits`: `max_source_bytes`, `max_depth`, per-family counts (footprints 1M, pads 4M, segments 8M, zone points 16M, …) | 512 MiB, 512, … | fork: `src/rs/kicad-monkey-core/src/pcb.rs:74-279` |
| `SchematicBundleLimits`: `max_source_bytes`, `max_depth`, per-family counts, `max_decoded_string_bytes` | 512 MiB, 512, …, 64 MiB | fork: `src/rs/kicad-monkey-core/src/schematic_bundle_limits.rs:48-80` |
| `ProjectLimits` (`.kicad_pro` JSON): `max_source_bytes`, `max_json_nodes`, `max_json_depth` | 64 MiB, 8,000,000, 256 | fork: `src/rs/kicad-monkey-core/src/project.rs:34-50` |
| `SourceBundleLimits`: `max_sources`, `max_source_bytes`, `max_total_bytes`, `max_path_bytes` | 1,000,000, 512 MiB, 4 GiB, 32 KiB | fork: `src/rs/kicad-monkey-core/src/source_bundle.rs:14-31` |
| `KiCadDesignJsonLimits`: `max_derived_items`, `max_materialized_bytes`, `max_output_bytes` | 256M, 2 GiB, 2 GiB | fork: `src/rs/kicad-monkey-core/src/design_json/mod.rs:148-177` |
| materializer `PrepareLimits` and request limits: `max_source_bytes`, `max_operations`, `max_points` | no default. a1 passes 4 GiB, `u32::MAX`, `u32::MAX`: effectively unbounded. | fork: `.../board_materialization/prepared.rs:21-27`; sim: `src/prism-bundle/src/materialize.rs:28-38` |
| the native transport's fixed ceilings: 4096 sources, 64 MiB per source, 256 MiB total, 4096-byte paths | — | fork: `src/rs/kicad-monkey-native/src/lib.rs:73-77` |

### 7.2 The CLI's limits

The CLI passes these values to the core explicitly. The core's limit structs (`sexpr::Limits`, `PcbLimits`, `SchematicBundleLimits`, `ProjectLimits`, `SourceBundleLimits`) are parameters. A core limit without a CLI counterpart keeps its core default. Every default below is at or under the core's default, except `max-sexpr-nodes`.

Every limit can be set with `--limit <name>=<value>`, up to its hard bound. Hitting a limit is exit 4 and is never recorded in a bundle (§5.2.7, bundle-format.md §3.2).

| `CliLimitName` | Default | Hard bound | Applies to | Basis |
|---|---|---|---|---|
| `max-source-files` | 16,384 | — | selected source files; `revision-key` entries | Covers sheets, libraries and repository 3D models with margin. The native transport's 4096 is too tight once models are sources (ADR §5). |
| `max-source-file-bytes` | 134,217,728 (128 MiB) | — | each source file, `--refilled-board` | 2.2× EDA-04903's 57 MB board, the largest known (ADR §1). Under the core's 512 MiB. |
| `max-total-source-bytes` | 2,147,483,648 (2 GiB) | — | sum of the selected sources | Sources include STEP models; this leaves room in the 4 GiB archive (§6.1). |
| `max-path-bytes` | 4,096 | 65,535 | every `RepoPath` and archive path (plus 255 per segment, fixed) | the native transport's limit (fork: `lib.rs:76`); bundle-format.md §5 |
| `max-sexpr-depth` | 128 | 512 | each KiCad file | The deepest nesting in the 80 KiCad files measured is 9 (release-studio fixtures, System Builder fixtures, USB-PD-Trigger-Board). 128 keeps recursion far below stack limits; the core allows 512. |
| `max-sexpr-nodes` | 24,000,000 | — | each KiCad file | Measured density is 0.10–0.15 nodes per byte (`cynthion.kicad_pcb`: 793,831 nodes in 6.26 MB). 128 MiB at 0.18 gives 24M. The core's 16M default would cap tree-parsed files near 100 MB, under `max-source-file-bytes`. |
| `max-sexpr-string-bytes` | 67,108,864 (64 MiB) | — | one decoded string (embedded files) | the core default |
| `max-json-depth` | 256 | — | `.kicad_pro`, `--config`, `bundle.json` | `ProjectLimits` default |
| `max-json-nodes` | 8,000,000 | — | `.kicad_pro`, `--config`, `bundle.json`. Other JSON members being verified are bounded by `max-member-bytes`, because a large board's `design.json` can exceed 8M values. | `ProjectLimits` default |
| `max-config-bytes` | 1,048,576 | — | `--config` | An effective configuration is a few hundred bytes. |
| `max-models-glb-bytes` | 1,073,741,824 (1 GiB) | — | `--models-glb` | usb-pd's GLB is 1.36 MB for 37 parts; large boards reach hundreds of MB. |
| `max-materialization-operations` | 4,294,967,295 | 4,294,967,295 | materializer | a1's value (`u32::MAX`). The memory cap and the timeout are the effective guard. |
| `max-member-bytes` | 2,147,483,648 (2 GiB) | 4,294,967,295 | each member written or read, uncompressed | the core's design-JSON `max_output_bytes`; under zip32's 4 GiB |
| `max-archive-bytes` | 4,294,967,295 | 4,294,967,295 | archive written or read | zip32 |
| `max-archive-members` | 32,768 | 65,535 | archive written or read | `max-source-files` plus derived members, under zip32's 65,535 |
| `max-total-unpacked-bytes` | 8,589,934,592 (8 GiB) | — | sum of declared member sizes when reading | bounds CPU and extract disk use for an untrusted archive |
| `max-compression-ratio` | 200 | — | each member over 1 MiB when reading | §6.2 |
| `max-diagnostic-lines` | 10,000 | — | stderr | §3.2 |
| `max-findings` | 1,000 | — | `bundle verify` findings | §5.3 |
| `max-memory-bytes` | parse 4 GiB, board 6 GiB, models 2 GiB, verify/extract 2 GiB, revision-key 2 GiB, compare 2 GiB | — | heap (§7.4) | ADR §7's stage `parse` budget is 1.5 GB on EDA-04903, so 4 GiB gives 2.7× headroom. Board is provisional until WP-B measures it. |
| `timeout-ms` | parse 300,000; board 600,000; models 120,000; verify 600,000; extract 600,000; revision-key 300,000; compare 120,000 | — | wall clock from process start (§7.3) | ADR §7: `parse` ≤ 30 s on EDA-04903, so 10×. Board: ADR §4.4's 1–2 min, 5×. Models only copies and canonicalizes. |

`limit` (`CliLimitHit`) has one variant per unit: `bytes` (`limit_bytes`, `observed_bytes?`), `time` (`limit_ms`) and `count` (`limit_count`, `observed_count?`). The variant follows the name's suffix. An observed value is present only for input sizes and counts, which are deterministic. It is absent for `max-memory-bytes`, and `timeout-ms` has none, so no measured value reaches a document.

WP-B checks the defaults on EDA-04903 in the worker image, wanting at least 2× headroom on every input limit, and reports the measured peak and time per stage. A default changes only by an amendment to this spec.

### 7.3 Wall timeout

**In the CLI.** A watchdog thread starts with the process. At `timeout-ms` it:
1. removes the temp file (§5.2.5);
2. writes `CliErrorA0` (category `timeout`, `limit: {kind: "time", name: "timeout-ms", limit_ms}`) and the matching diagnostic;
3. exits 5 with `_exit`.

One invocation runs one stage, so this is ADR §11 G8's per-build timeout, per stage. a1 had none; it relied on the caller's `subprocess.run(timeout=…)` (ref: `backend/app/services/project_bundle.py:87-89`).

**In the backend.**
- K runs the CLI through a `KicadTool`-style adapter (`backend/app/services/kicad_tools.py:182-255`), with `timeout=` set to the CLI's `timeout-ms` plus 30 s.
- `_run_process` kills the process when that time passes (`kicad_tools.py:299-317`), and K's cancel check is polled every second (`:309-313`).
- The worker kills the whole job process group after `PRISM_JOB_CANCEL_GRACE_SECONDS` (`backend/app/prism_worker.py:313-318`, `:454-459`; `backend/app/core/config.py:522-527`).

So the CLI's own timeout normally fires first, and K gets a clean `CliErrorA0`.

### 7.4 Memory cap

**In the CLI:**
1. **Counting allocator.** A global allocator tracks live heap bytes. It refuses any allocation that would take them over `max-memory-bytes`. Each thread takes its count from the shared total in 1 MiB steps and keeps at most 2 MiB spare, so threads that allocate at once (the parse stage runs its producers in parallel) do not contend on one counter; the total runs ahead of the real heap by at most 2 MiB per thread. Before refusing, it:
   - writes a fixed, pre-serialized `CliErrorA0` to stdout (category `resource-limit`, code `limit-exceeded`, `limit: {kind: "bytes", name: "max-memory-bytes", limit_bytes}`) and a diagnostic to stderr, using raw `write(2)` with no allocation;
   - calls `_exit(4)`.

   Nothing else has been written to stdout at that point (§3.1).
2. **Linux backstop.** At startup the CLI sets `RLIMIT_AS` to `max-memory-bytes` + 1 GiB + 128 MiB × threads. The margin covers stacks, the binary and allocator overhead. Hitting the backstop aborts (SIGABRT), which K treats as killed. macOS has no backstop; it is a development platform only.

**In the backend.** Today's resource slots count concurrency, not bytes (`backend/app/services/job_kinds.py:29-41`). The worker container has a cgroup memory limit (`docker-compose.yml:253-254`: 6 CPUs, 12 GiB). The memory bound comes from three things together:
1. **A `design_bundle` slot**, as ADR §4.4 names it, with capacity `C` (K's setting, default 1). The `design_bundle` job kind holds `{"prism_worker": 1, "design_bundle": 1}`. The paced backfill uses the same slot (ADR §8).
2. **A per-invocation cap `M`**, passed as `--limit max-memory-bytes=M`. K's settings validate that C × (M + 1.25 GiB backstop overhead) ≤ the worker memory budget minus what the other slots can hold.
   - With 12 GiB, C = 1 and M = 6 GiB for `board` leave about 4.75 GiB.
   - Today's Python index alone peaks at 2.6 GB on EDA-04903 (ADR §1), and two `semantic_compile` slots exist by default (`backend/app/core/config.py:594`).
   - So while legacy consumers still run, the `design_bundle` kind also holds one `semantic_compile` unit. Bundle builds then share the legacy memory budget instead of adding to it. Wave 4 removes that unit together with the legacy index.
3. **The container's cgroup limit** is the last resort. On an OOM kill, K sees SIGKILL and retries within `max_attempts`.

K records each invocation's peak resident memory and wall time in the job details. Peak memory comes from `os.wait4`'s `ru_maxrss`. ADR §7's budgets are checked against these numbers, which stay out of the CLI's documents (§3.1).

### 7.5 Not covered

- **Fuzzing.** A fuzzing target for the readers (s-expression, `.kicad_pro` JSON, zip, GLB header) is follow-up work (ADR §11 G8).
- **Sandboxing.** No seccomp or namespace isolation is specified. The CLI opens only its arguments and the files under the source root and `--in`. It runs no program, except `git` for `revision-key`.

## 8. Code registry

Codes are `DiagnosticCode` (kebab-case). A code never changes meaning; a new meaning gets a new code. Messages are free text.

| Code | Where | Category / exit | Meaning |
|---|---|---|---|
| `usage` | error | usage / 2 | generic argument error: unknown option, missing value, bad value syntax, a `--limit` value over its hard bound |
| `unknown-command` | error | usage / 2 | the command words are not one of §2.1 |
| `option-conflict` | error | usage / 2 | options that exclude or require each other (§2.2) |
| `input-not-found` | error | input / 3 | a path argument does not exist; a missing `<project.kicad_pro>` inside the source root is `project-absent` instead |
| `input-not-regular-file` | error | input / 3 | a path argument is a directory, link or special file where a file is expected |
| `project-not-kicad-pro` | error | input / 3 | `<project.kicad_pro>` does not end in `.kicad_pro` |
| `config-invalid` | error | input / 3 | `--config` is not a valid `RevisionKeyEffectiveConfigA1` |
| `key-record-invalid` | error | input / 3 | `--key-record` is not a valid `RevisionKeyRecordA1` |
| `upgrade-record-invalid` | error | input / 3 | an `--upgraded` names a path that is not a member, or a version not older than `kicad_file_formats` for its kind (§5.2.2) |
| `source-outside-root` | error | input / 3 | the project, or a file a source references, resolves outside the source root |
| `source-not-regular-file` | error | input / 3 | a symbolic link or special file under the source root |
| `source-path-invalid` | error | input / 3 | a source path is not UTF-8, holds a control character, or breaks `RepoPath` or the length rules |
| `source-path-collision` | error | input / 3 | two source paths collide under NFC and case folding |
| `bundle-invalid` | error | input / 3 | `--in`, the bundle given to `extract`, or `--base`/`--head` of `compare` fails a reader check |
| `refilled-board-invalid` | error | input / 3 | `--refilled-board` is not a parsable `.kicad_pcb` |
| `models-glb-invalid` | error | input / 3 | `--models-glb` is not a glTF 2.0 binary as §5.2.4 requires |
| `repo-not-found`, `commit-not-found` | error | input / 3 | `revision-key` (§5.5) |
| `project-absent` | `CliProjectAbsentA0` | — / 10 | the project is absent at this revision: the project file is not a project file of the listing (`revision-key`; the pure layer's code too, revision-key.md §5.3), or nothing is at `<project.kicad_pro>` under the source root (`bundle build`). Not a failure (§4) |
| `limit-exceeded` | error, verify finding | resource-limit / 4 | a limit of §7.2 was hit; `limit` names it |
| `timeout` | error | timeout / 5 | `timeout-ms` elapsed |
| `output-write-failed` | error | output-io / 6 | the temp file or the rename failed: missing directory, permissions, full disk |
| `output-not-directory` | error | output-io / 6 | `extract`'s `-o` is not an existing directory |
| `stdout-write-failed` | stderr only | output-io / 6 | stdout could not be written; for `bundle build`, `-o` already holds the new archive |
| `manifest-unsupported` | error, verify finding | precondition / 7 | `bundle.json` is not `prism.bundle.manifest.a3`, for example a2 or a1 |
| `generator-mismatch` | error | precondition / 7 | `--in` was written by another generator id; for `compare`, `--base` and `--head` were written by different generator ids |
| `stage-order` | error | precondition / 7 | a prerequisite stage of `--in` is not in the required status |
| `stage-not-applicable` | error | precondition / 7 | the requested stage is `skipped` in `--in` |
| `revision-key-mismatch`, `config-mismatch` | error | precondition / 7 | an assertion of §5.2.1 check 5 failed, or `--config` names another project file, or `--key-record` disagrees with `--revision-key`, `--config` or a member (§5.2.2). For `revision-key`, `--project` ≠ `config.project_file`. |
| `kicad-version-mismatch` | error | precondition / 7 | `--refill-tool` or `--models-tool` has another major.minor than `kicad_version` |
| `refilled-board-mismatch` | error | precondition / 7 | the refilled board's footprint UUID set differs from the source board's |
| `zone-fills-mismatch` | error | precondition / 7 | stage `board`: `--refilled-board`/`--refill-tool` given although `--in` records `zone_fills: "saved"`, or missing although it does not (§5.2.3) |
| `models-glb-name` | error | precondition / 7 | the GLB was not exported as `components.glb` |
| `output-changed` | error | precondition / 7 | `-o` changed between reading `--in` and the rename (§5.2.5) |
| `member-not-found` | error | precondition / 7 | an `extract` `<member>` selects nothing; for `compare`, a bundle has no `projections/board-objects.json` (§5.6) |
| `anchor-mismatch` | error | precondition / 7 | `compare`: the two bundles' project files are in different directories (§5.6) |
| `view-unknown`, `vendor-unknown` | error | usage / 2 | `artwork --view` names no view of the config; `vendor run` names no registered vendor (§5.7, §5.8) |
| `geometer-version-mismatch` | error | precondition / 7 | stage `models`: `--geometer` is not the runtime `hlr_procedure` names (§5.2.4) |
| `geometer-unavailable` | error | internal / 1 | stage `models`: the Geometer runtime could not be started; K retries (§5.2.4) |
| `model-not-step`, `projection-failed` | `models/assembly-hlr.json` per footprint | — | the footprint's first model is not STEP, or Geometer could not project it (§5.2.4); with `model-unavailable`, these are recorded, not failures |
| `archive-path-collision` | error | precondition / 7 | `extract` would overwrite different bytes, or a link or non-directory is in the way |
| `panic`, `internal-error`, `self-verify-failed` | error | internal / 1 | defects |
| `model-unavailable` | stage-parse warning in the manifest; warning diagnostic | — | a repository 3D model the worker could not materialize (bundle-format.md §2.2); the bundle is built without it |
| `source-unparseable`, `source-not-utf8`, `source-format-unsupported`, `source-missing` | stage `error` in the manifest; error diagnostic | — / 9 | recorded stage failures (§5.2.2). `source-unparseable` is today's code for the same condition (`backend/app/services/variant_catalog_service.py:51`). |
| `design-build-failed`, `projection-failed`, `materialization-failed` | `failed_members` in the manifest; error diagnostic | — / 9 | recorded member failures (§5.2.2, §5.2.3) |
| `zip-malformed`, `zip-unsupported`, `zip-path-invalid`, `zip-duplicate-member`, `zip-path-collision`, `zip-ratio-exceeded`, `zip-size-mismatch`, `zip-crc-mismatch`, `manifest-invalid`, `member-missing`, `member-unlisted`, `member-order`, `member-digest-mismatch`, `member-schema-invalid`, `member-unreadable`, `stage-inconsistent`, `findings-truncated` | verify finding | — / 8 | §5.3, §6.2 |
| `stage-started`, `sources-selected`, `stage-finished`, `archive-written` | info diagnostic | — | progress |
| `diagnostics-truncated` | warning diagnostic | — | §3.2 |
| every manifest warning code: a1's `stale-saved-fills` and `kicad-default-stackup`, `saved-fills-used`, the cross-check codes such as `net-mismatch` and `component-missing-from-board`, and the projection producers' codes | warning diagnostic, `CliBuildResultA0.warnings` | — | owned by the manifest contract and the projection field maps, which this list mirrors without redefining |

## 9. Backend integration (WP-K)

### 9.1 The job

The CLI never runs KiCad. The `design_bundle` job (ADR §4.4) runs the KiCad steps itself and hands their outputs in. One job runs all stages of one bundle key, in order. It holds `{"prism_worker": 1, "design_bundle": 1}` (§7.4) and the repository read lock, as the semantic-index kind does (`backend/app/services/project_service.py:631-636`).

The commands below use three names:
- `$B` is `prism-kicad`, located like the other tools (`backend/app/services/kicad_tools.py:137-158`). WP-L puts it on `PATH`.
- `$STORE` is the stored archive, `.kicad-prism/bundles/<project_id>/<revision_key>/<generator_digest>.prism`.
- `$JOB` is the job's scratch directory.

```text
0. generator       $B version                                -> generator bytes, generator_digest, bundle key (§5.1)
                   (the revision key comes from the commit index or `$B revision-key`, revision-key.md §10–§11)
1. materialize     the source set into $JOB/src at repository paths: git cat-file, LFS hydrated, gitlinks
                   expanded, regular files only (symlink entries skipped; bundle-format.md §2.2). A design
                   source that cannot be materialized fails the job (retried); an unavailable 3D model is
                   left out and stage parse warns `model-unavailable`;
                   then every .kicad_pcb and .kicad_sch of the closure older than kicad_version's
                   format is upgraded in place by `upgrade_procedure` (§9.4);
                   the RevisionKeyEffectiveConfigA1 into $JOB/effective.json, the key's
                   RevisionKeyRecordA1 into $JOB/key-record.json
2. stage parse     $B bundle build $JOB/src/<project RepoPath> --stage parse --source-root $JOB/src \
                     -o $STORE --revision-key <rk> --key-record $JOB/key-record.json \
                     --config $JOB/effective.json --limit max-memory-bytes=<M_parse> --limit timeout-ms=<T_parse> --threads <n>
3. zone refill     §9.2 -> $JOB/refill/<board file name>       (skipped when the config has zone_fills "saved")
4. stage board     $B bundle build --stage board --in $STORE -o $STORE \
                     --refilled-board $JOB/refill/<board file name> --refill-tool <kicad_version> \
                     --revision-key <rk> --limit max-memory-bytes=<M_board> --limit timeout-ms=<T_board>
                   (with zone_fills "saved": the same without --refilled-board and --refill-tool)
5. models          §9.3 -> $JOB/models/components.glb (cached)
6. stage models    $B bundle build --stage models --in $STORE -o $STORE \
                     --models-glb $JOB/models/components.glb --models-tool <kicad_version> \
                     --revision-key <rk> --limit timeout-ms=<T_models>
```

**Running each step:**
- **Later stages run on the archive's sources** (ADR amendment K2 §3.5). Before step 3, K replaces `$JOB/src` with the archive's own `sources/`, extracted with `bundle extract`, so the refill and the GLB export read exactly the files stage parse read. They are the upgraded bytes (§9.4), which is what step 1 left in `$JOB/src` before. Steps 4 and 6 run on the archive as stored, with the `--revision-key` it records: the key it was built for, also when the job runs for another key that reaches it through an alias (revision-key.md §10).
- **Zone fills.** K reads `zone_fills` from the effective configuration it wrote in step 1 (revision-key.md §4.4). With `"saved"`, it skips step 3 and runs step 4 without `--refilled-board` and `--refill-tool`. Otherwise it runs step 3, and a refill failure follows §9.2 step 4: retried, then the board stage stays `pending`; K never switches to saved mode itself.
- Before each later step, K reads `stages` from the previous `CliBuildResultA0`. It skips a step whose stage is `skipped`, and stops when no later stage can run.
- After every exit 0 or 9, K re-reads `bundle.json` and publishes readiness (bundle-format.md §3.3). Consumers that need only `parse` members proceed after step 2 (ADR §4.4).
- Exit codes are handled as in §4. Exit 10 from `revision-key` ends the job before step 1: the project is absent at that revision, and nothing is built.
- K treats stdout as authoritative and validates it against `generated/schema/` before using it.

**Where the KiCad-produced inputs come from:**

| Input | Produced by | Run by | Today |
|---|---|---|---|
| `--refilled-board` (refill mode only) | `pcbnew.ZONE_FILLER` on a scratch copy (`refill_procedure`, §9.2) | K, with KiCad's Python (`PRISM_KICAD_PYTHON`, ref: `backend/app/core/pipeline_config.py:92-95`) | ref: `backend/app/services/zone_refill.py:24-75`, passed to `prism-bundle build --refilled-board … --refill-tool` (ref: `backend/app/services/project_bundle.py:81-86`) |
| `--models-glb` | `kicad-cli pcb export glb --no-board-body` (`models_procedure`, §9.3) | K, through `kicad_tools.kicad_cli()` with isolated temp and runtime directories (`kicad_tools.py:166-177`, `:333-336`) | `kicad-prism-viewer/pipeline/topology_compiler/kicad_cli_export.py:135-143`, cached by board hash and CLI version (`:178`) |

### 9.2 `pcbnew-zone-filler-a0`

1. **Copy the board and its settings.** Copy the source board, the project's `.kicad_pro` and its `.kicad_dru` (when present) from `$JOB/src` into an empty `$JOB/refill`. Name the project and rules files after the **board's** stem, so pcbnew finds them (as a1 does, sim: `src/prism-bundle/src/refill.rs:149-172`).
2. **Run the script.** Run `PRISM_KICAD_PYTHON -I -c <script> $JOB/refill/<board>` with the environment of `kicad_tools.isolated_env` and a timeout. The reference branch's `PRISM_ZONE_REFILL_TIMEOUT_SECONDS` defaults to 900 s (ref: `pipeline_config.py:96`). The script is exactly the reference branch's (ref: `zone_refill.py:24-29`):
   ```python
   import sys, pcbnew
   board = pcbnew.LoadBoard(sys.argv[1])
   pcbnew.ZONE_FILLER(board).Fill(board.Zones())
   pcbnew.SaveBoard(sys.argv[1], board)
   ```
3. **Hand in only the `.kicad_pcb`.** `SaveBoard` also rewrites the `.kicad_pro` and creates a `.kicad_prl` beside it; on usb-pd the `.kicad_pro` grew from 15,577 to 17,080 bytes. Neither file may reach the bundle: the bundle's project file comes from `sources/`.
4. **Handle failures.** A refill failure or timeout fails the job step and is retried (`RetryableJobError`). There is **no fallback to the saved fills**, unlike the reference branch (ref: `zone_refill.py:67-73`), because two builds of one bundle key must give the same bytes. After `max_attempts`, the board stage stays `pending` in the archive and the job ends failed with the refill error (bundle-format.md §3.1, §3.3). Saved fills are used only when the project's configuration says `zone_fills: "saved"`, which is a different revision key; this procedure then does not run (§9.1).

Two refills of usb-pd with KiCad 10.0.6 on one host gave byte-identical boards (`ef71b931…`, 629,738 bytes). Identity across CPU architectures is not established (W0 report).

### 9.3 `kicad-cli-glb-a0`

1. **Export.** In `$JOB/src`, run:
   ```text
   kicad-cli pcb export glb --force --no-board-body --output $JOB/models/components.glb $JOB/src/<board RepoPath>
   ```
   - Models resolve through `${KIPRJMOD}` to the bundled repository models, and through `KICAD*_3DMODEL_DIR` to the image's stock library (G3).
   - The output file name is always `components.glb` (§5.2.4).
2. **Cache.** Cache the result by the bundle key. The archive pins the board and every repository model file the export can resolve, and the generator pins `kicad_version` and `models_procedure` (ADR §4.4, ADR amendment K2 §3.5).
3. **Handle failures.** A failure is retried like the refill. After `max_attempts`, stage `models` stays `pending` and the job ends failed (bundle-format.md §3.1).

### 9.4 `kicad-seeded-upgrade-a0`

Maintainer decision: the parser and every contract handle only the current file format of the worker's KiCad (`kicad_version`). Older sources are upgraded by KiCad itself, which handles backwards compatibility.

1. **Select.** Every `.kicad_pcb` and `.kicad_sch` in `$JOB/src` that the closure reads and whose `(version N)` is older than the generator id's `kicad_file_formats` for its kind. A file in the current format is not touched. A file newer than it is left alone, and stage parse records `source-format-unsupported`.
2. **Boards.** Copy the board, and its `.kicad_pro` named after the board's stem, into an empty scratch directory. Run with KiCad's Python (`PRISM_KICAD_PYTHON -I`), under `kicad_tools.isolated_env`, with a timeout:
   ```python
   import sys, pcbnew
   pcbnew.KIID.SeedGenerator(0x50524953)
   board = pcbnew.LoadBoard(sys.argv[1])
   pcbnew.SaveBoard(sys.argv[1], board)
   ```
   Copy only the `.kicad_pcb` back over the file in `$JOB/src`. The seed makes the ids KiCad creates for items the old file lacked identical on every run. Without it, `kicad-cli pcb upgrade` gives a KiCad 7 board about 1,600 random UUIDs per run (measured on cynthion).
3. **Schematics.** `kicad-cli sch upgrade <file>` in place, with the same environment and timeout. It is byte-deterministic on cynthion's 19 KiCad 7 sheets.
4. **Record.** K passes one `--upgraded <path>=<version>` per upgraded file, with its original `(version N)`, to stage parse, and the manifest records `upgraded_from_version` on each such member (§5.2.2, bundle-format.md §2.2). The revision key is unaffected: it covers the committed blobs, not the upgraded bytes.
5. **Failures.** These fail the job step, which is retried like the refill; nothing is recorded. After `max_attempts` there is no archive and the job ends failed.

Measured on EDA-04903 (57 MB, KiCad 8 format): 8.2 s and 0.8 GB peak. It runs only for old files, and outside the CLI's parse budget (ADR §7).

### 9.5 Agreement with the ADR

| ADR text | This spec | Agrees? |
|---|---|---|
| §2.1: the zone refill and the GLB export are "real KiCad outputs" run outside the parser | The CLI never runs KiCad. K runs both and hands the outputs in. | yes |
| §4.4 steps 3–4: "zone refill pcbnew ZONE_FILLER", then `bundle build --stage board` | §9.2, `--refilled-board`; skipped for a project configured `zone_fills: "saved"` (§5.2.3) | refines |
| §4.4 step 5: `kicad-cli pcb export glb --no-board-body` → `viewer/models/components.glb`, stage `models` | `--stage models --models-glb` | **no in §9.3**, which lists only `--stage parse\|board` and `[--models-glb <glb>]` without a stage. Amendment requested (§12). |
| §9.3: `bundle build <project.kicad_pro> -o <out.prism> --stage parse\|board …` | The project is positional for `parse` only; later stages take `--in`. | **no**: amendment requested (§12) |
| §7: "the same inputs give a byte-identical bundle" | Holds only with the GLB canonicalization of §5.2.4, because kicad-cli writes a wall-clock `generated_at` | **gap**: amendment requested (§12) |
| §4.4 step 6, "store `<bundle key>.prism`", versus §5, `…/<revision_key>/<generator>.prism` | §5.1.4 uses §5's path, with `<generator>` = the generator digest | The ADR is inconsistent; §5's layout is used. |
| §5: bundle key = sha256(revision key, generator id) | the framing in §5.1.4 | refines |
| §4.4: "builds run under a `design_bundle` resource slot (memory-bounded)" | §7.4: slot capacity × per-invocation heap cap ≤ worker budget | refines; the slot itself is a count, as all slots are today |
| §11 G8: "parser limits (already in the core), a per-build timeout and memory cap in the CLI spec, zip path checks on read" | §6.2, §7 | yes |

## 10. Stub CLI for WP-K's tests

K's tests run a stub, `backend/tests/support/prism_kicad_stub.py` (owned by K), wherever the real binary is not installed. It is put on `PATH` as `prism-kicad`, or passed as the tool path.

**What the stub must do:**
1. **Grammar.** Accept exactly the grammar of §2. It answers `version`, the three `bundle build` stages, `bundle verify`, `bundle extract` and `revision-key`. A grammar violation is exit 2 with a `CliErrorA0` of category `usage`.
2. **`version`** prints `examples/CliVersionA0.example.json` in canonical bytes (§5.1.3), so K's bundle-key tests use the vectors of §5.1.5.
3. **`bundle build`** writes a real archive by the rules of §6.1, atomically by §5.2.5:
   - `bundle.json` comes from the manifest contract's example, with `stages`, `members`, `config`, `revision_key`, `bundle_key` and the generator filled in.
   - `parse` adds `sources/**`. It selects `*.kicad_pro`, `*.kicad_sch`, `*.kicad_pcb`, `*.kicad_dru`, `*.kicad_wks`, `*.kicad_jobset`, `fp-lib-table`, `sym-lib-table` and `.prism.json` under `--source-root`, and does not resolve models. It adds each projection member as a copy of its contract's `examples/<Root>.example.json`, and `design.json` as `{"schema":"kicad_monkey.design.a0"}`.
   - `board` adds the `--refilled-board` bytes as `refilled/<name>`, and a fixed 16-byte placeholder as `materialization/board.kmpack`. With `zone_fills: "saved"` in `--in`'s config, it adds only the placeholder, records `fill_provenance: saved` with the warning `saved-fills-used`, and refuses `--refilled-board`/`--refill-tool` with exit 7 `zone-fills-mismatch`; without it, it requires them the same way.
   - `models` adds the GLB bytes unchanged.
   - It prints `CliBuildResultA0` with the real archive digest. It checks `--in` as §5.2.1 does, without content checks.
4. **`bundle verify`** checks only the zip, the manifest member list and the digests (§5.3 checks 1–3), and prints `CliVerifyReportA0`.
5. **`bundle extract`** follows §5.4, without the `O_NOFOLLOW` containment.
6. **`revision-key`** prints the revision-key contract's example record.
7. **Failure injection.** The stub reads `PRISM_KICAD_STUB_MODE`, a comma-separated list of `<command>[:<stage>]=<mode>` entries. Only the stub reads it. The modes:
   - `exit:<n>` prints `CliErrorA0` with the category of exit `n` (1–7), exits `n`, and leaves `-o` untouched;
   - `failed` writes the archive with the stage `failed`, code `source-unparseable` at `sources/<config.root_schematic>` line 1, and exits 9;
   - `partial` writes the archive with the stage `partial`, with the stage's first fixed-path member in `failed_members`, and exits 9;
   - `absent` (for `revision-key` and `bundle build:parse`) prints `CliProjectAbsentA0` for the given project file, exits 10, and leaves `-o` untouched;
   - `hang` sleeps until killed, to test K's outer timeout;
   - `crash` exits 101 with empty stdout. The real CLI catches panics (exit 1), so 101 is an exit code outside §4's table, which K must treat as `internal`;
   - `garbage-stderr` writes a non-JSON stderr line first.
8. **Invocation log.** When `PRISM_KICAD_STUB_LOG` is set, every invocation appends one JSON line `{"argv": [...], "exit": n}` to it, with paths as given. Tests use it to assert the argv of §9.1.
9. **Self-check.** Every stdout document and every `bundle.json` the stub writes validates against `generated/schema/`. K's test suite asserts that for every mode.

**What K may rely on**, for the stub and the real binary alike:
- §3.1's document for each exit code;
- `-o` changes only on exit 0 or 9, or with `stdout-write-failed`;
- `--in` may equal `-o`;
- `CliBuildResultA0.stages`;
- the generator bytes and the bundle key.

**What K must not rely on:**
- the stub's archive bytes, which differ from the real CLI's;
- stderr content;
- message wording.

Once WP-B lands, recordings of the real binary can replace the stub test by test, in the style of `backend/app/services/kicad_tool_replay.py:1-18`.

## 11. Conformance checklist (WP-B)

1. **Schemas.** Every stdout document and every stderr line of the test suite validates against `generated/schema/`. A test covers every exit path of §4.
2. **Determinism.**
   - Building every committed fixture twice gives byte-identical archives and stdout. The two builds use different `-o` directories, different working directories, and `--threads 1` against `--threads 8`.
   - parse → board → models gives the same archive as parse → board → board → models.
   - On WP-L's arm64 and amd64 images, the same build gives byte-identical parse-stage members (§3.3).
3. **Atomicity.** A test kills the process (SIGKILL) at random points during `bundle build`, with `-o` = `--in`. `-o` is always either the old or the new archive and always passes `verify`.
4. **Limits.** Each `CliLimitName` has a test that sets it just below a fixture's need, then expects exit 4 with that `limit.name` and an unchanged `-o`. The memory cap and the timeout are tested with deliberately small values.
5. **Hostile archives.** Hand-made archives for every row of §6.2 are rejected with the stated code. They include:
   - a zip bomb: a 4 KiB member declaring 4 GiB;
   - a `../` name;
   - a case-colliding pair;
   - a trailing comment;
   - zip64 records;
   - local and central headers that disagree;
   - a gap between entries.
6. **Generator.** `generator_bytes(json.loads(stdout)) == stdout[:-1]` holds. The vectors of §5.1.5 pass in Rust, and so does the generator-pin test of §5.1.2.
7. **GLB.** Canonicalizing the two committed recordings of usb-pd's `components.glb` gives the same bytes.
8. **Budget.** Stage `parse` on EDA-04903 in the worker image takes ≤ 30 s, with a peak ≤ 1.5 GB (ADR §7), measured outside the CLI.

## 12. Requested ADR amendments

1. **§9.3, CLI synopsis.** Replace the `bundle build` line with the three lines of §2.1:
   - the project is positional for `--stage parse` only;
   - `board` and `models` take `--in`;
   - `--stage` gains `models`;
   - `--models-tool` and `--source-root` are added; a1's viewer assets are not inputs (decisions.md);
   - `revision-key` requires `--commit` or `--worktree`.
2. **§7, Determinism.** Add: "KiCad-produced members are canonicalized by `prism-kicad`: the GLB's `asset.extras.generated_at` is fixed (cli-spec.md §5.2.4). The refill and GLB procedures are pinned in the generator id."
3. **§4.4, step 6.** The store path is §5's `…/<revision_key>/<generator_digest>.prism`. The bundle key is defined in cli-spec.md §5.1.4.
4. **§5, Generator id.** Add the refill and GLB procedures (`refill_procedure`, `models_procedure`) and the pack format version.
5. **§6, the `bundle.json` row.** Each stage records `{status, error?, skip_reason?, failed_members, …}`, shared with `CliStageState`. A content failure of a stage (`failed`) or of a member (`partial`) is recorded in the bundle (cli-spec.md §5.2.7, bundle-format.md §3.2).
6. **§9.3 and §9.6, `compare` (amendment C2, 2026-10-17, accepted).** The CLI synopsis gains `compare` (§5.6); C2's row produces the object diff with it. Applied to the ADR in the same change, with the rationale in [`adr-native-design-bundle-amendment-c2.md`](../../../docs/architecture/adr-native-design-bundle-amendment-c2.md).
7. **§9.6 and §10 item 7, Design Comparison in Rust (amendment C2r, 2026-10-17, accepted).** `compare` computes every tab except fabrication, from bundles or source trees; ecad-viewer's input is unchanged; the backend validates member schemas once per stored archive (bundle-format.md §9). Applied to the ADR in the same change, with the rationale in [`adr-native-design-bundle-amendment-c2r.md`](../../../docs/architecture/adr-native-design-bundle-amendment-c2r.md).
8. **§2.1, §6, §9.3, §9.6, §10 item 4 and R2: Release Studio without Cruncher (amendment C3, 2026-10-17, accepted).** New §5.7–§5.9 and the HLR part of §5.2.4. Applied to the ADR in the same change; rationale in [`adr-native-design-bundle-amendment-c3.md`](../../../docs/architecture/adr-native-design-bundle-amendment-c3.md).
