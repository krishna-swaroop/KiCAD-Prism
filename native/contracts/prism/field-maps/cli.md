# Field map: `prism-kicad` stdout and stderr documents (`prism.cli.*.a0`)

Root models in `tsp/prism/cli-a0.tsp`. The CLI's behaviour is in [`../cli-spec.md`](../cli-spec.md).

| Root model | Schema id | Example | Written to |
|---|---|---|---|
| `CliVersionA0` | `prism.cli.version.a0` | `examples/CliVersionA0.example.json` | stdout of `prism-kicad version`: the generator id |
| `CliDiagnosticA0` | `prism.cli.diagnostic.a0` | `examples/CliDiagnosticA0.example.json` | each stderr line of every command |
| `CliErrorA0` | `prism.cli.error.a0` | `examples/CliErrorA0.example.json` | stdout of any command, exit 1–7 |
| `CliBuildResultA0` | `prism.cli.build_result.a0` | `examples/CliBuildResultA0.example.json` | stdout of `bundle build`, exit 0 or 9 |
| `CliVerifyReportA0` | `prism.cli.verify_report.a0` | `examples/CliVerifyReportA0.example.json` | stdout of `bundle verify`, exit 0 or 8 |
| `CliExtractResultA0` | `prism.cli.extract_result.a0` | `examples/CliExtractResultA0.example.json` | stdout of `bundle extract`, exit 0 |
| `CliProjectAbsentA0` | `prism.cli.project_absent.a0` | `examples/CliProjectAbsentA0.example.json` | stdout of `revision-key` and `bundle build --stage parse`, exit 10 |

- **Written by:** WP-B, `native/src/rs/prism-kicad-cli/`. These documents are not bundle members.
- **Stages:** `CliBuildResultA0` reports one stage per invocation (parse, board or models). The other documents belong to no stage.
- **Readers:**
  - WP-K's `backend/app/services/design_bundle/` (job runner, store and readiness) and its stub (`backend/tests/support/prism_kicad_stub.py`, cli-spec.md §10);
  - WP-B's conformance tests (cli-spec.md §11);
  - later, the MCP server (ADR §10, item 5) and prism-sim-studio's tools.

**How the columns are read:**
- **Today's source** is the closest current producer: the a1 `prism-bundle` CLI, the fork's native transport or the core. "new" means nothing produces the field today.
- **Consumers** names the reader that needs the field. Each CLI document has no consumer in today's code because the CLI does not exist yet, except where a reference-branch line already reads its a1 predecessor.
- **Parity note.** The CLI's documents have no golden against today's output. Their acceptance is the conformance list of cli-spec.md §11. The column records how each field relates to its a1 predecessor.

**Shared models.** `CliLocation`, `CliLimitHit`, `CliFinding`, `CliStageState` and `CliMemberDigest` appear under several roots. Their rows are repeated under each root, as the template asks, with the same sources.

## Fields: `CliVersionA0` (`prism.cli.version.a0`)

Pointers are RFC 6901 with two extensions: `*` is every element of an array,
`{key}` is every key of a map. One row per leaf and per array/map.

| Field (JSON pointer) | Type | Unit | Order / nullability | Today's source (path:line) | Consumers (path:line) | Parity note |
|---|---|---|---|---|---|---|
| `/schema` | const `"prism.cli.version.a0"` | — | required | new; a1's version line has no schema (sim: `src/prism-bundle/src/bin/prism-bundle.rs:219-227`) | K: generator bytes and bundle key (cli-spec.md §5.1.4); the manifest contract embeds this root as the generator id | a1 → a0: a schema is added |
| `/crate_version` | `CliReleaseVersion` | — | required | sim: `prism-bundle.rs:221` (`"prism_bundle": env!("CARGO_PKG_VERSION")`) | K: generator digest in the store path (ADR §5); B's generator-pin test (cli-spec.md §5.1.2) | renamed from `prism_bundle`; same bump rule (sim: `prism-bundle.rs:18-22`) |
| `/engine_version` | `CliReleaseVersion` | — | required | sim: `prism-bundle.rs:224` (`"design_engine": kicad_monkey_core::ENGINE_VERSION`); fork: `src/rs/kicad-monkey-core/src/lib.rs:10` | K, as above | renamed from `design_engine`; `2026.9.7` today |
| `/kicad_version` | `CliReleaseVersion` | — | required | the per-bundle tool version a1 records (sim: `src/prism-bundle/src/build.rs:335`, from `--refill-tool`; ref: `backend/app/services/project_bundle.py:84`, `backend/app/sim_studio/runs.py:134-136`); the 3D GLB cache key (`kicad-prism-viewer/pipeline/topology_compiler/kicad_cli_export.py:178`) | B: `--refill-tool`/`--models-tool` must equal it (cli-spec.md §5.2.3–§5.2.4); K: passes `kicad-cli version` output; L: bumps it with the image's KiCad | a1 recorded it per bundle and did not pin it; a0 pins it in the generator |
| `/member_schemas` | `CliVersionMemberSchema[]` | — | required, ≥ 1; sorted by `path` in code point order | sim: `contracts/contracts/bundle.tsp:37-38` (`member_schema` per member), `:54-57` (materializer schema); ADR §6 member table | K: refuses a bundle whose generator it does not know; B: verify validates each listed member (cli-spec.md §5.3 check 4) | new list; a1 had only `manifest` and the materializer pin |
| `/member_schemas/*/path` | `ArchivePath` | — | required; unique | ADR §6 member paths; sim: `build.rs:28-31` (`design.json`, `materialization/board.kmpack`) | as above | — |
| `/member_schemas/*/schema` | `SchemaId` | — | required | sim: `prism-bundle.rs:222` (`"manifest": MANIFEST_VERSION`), `src/prism-bundle/src/design.rs:17` (`kicad_monkey.design.a0`), fork: `src/rs/kicad-monkey-core/src/board_materialization.rs:60` | as above | a1's `"manifest":"a1"` becomes the `bundle.json` row `prism.bundle.manifest.a2` |
| `/models_procedure` | `CliModelsProcedure` | — | required | `kicad_cli_export.py:135-143` (component export argv) | K: runs exactly this procedure (cli-spec.md §9.3) | new |
| `/pack_format_version` | `uint16` | — | required | fork: `src/rs/kicad-monkey-materialization-pack/src/lib.rs:54` (`PACK_FORMAT_VERSION: u16 = 0`); sim: `build.rs:320`, `bundle.tsp:58-59` | K, B, as above | was in a1's manifest, not in its version line |
| `/refill_procedure` | `CliRefillProcedure` | — | required | ref: `backend/app/services/zone_refill.py:21-29` (`REFILL_REVISION = "zone-refill-a0"` and the script) | K: runs exactly this procedure (cli-spec.md §9.2) | ref keyed 3D bundles on `zone-refill-a0`; a0 names the same script `pcbnew-zone-filler-a0` |

## Fields: `CliDiagnosticA0` (`prism.cli.diagnostic.a0`)

| Field (JSON pointer) | Type | Unit | Order / nullability | Today's source (path:line) | Consumers (path:line) | Parity note |
|---|---|---|---|---|---|---|
| `/schema` | const `"prism.cli.diagnostic.a0"` | — | required | new; a1 writes free text (sim: `prism-bundle.rs:145-182`) | K: job log, warnings surfaced in the UI | a1's `warning: …`/`error: …` lines become JSON |
| `/severity` | `CliSeverity` | — | required | a1's `warning:`/`error:` prefixes (sim: `prism-bundle.rs:174-179`) | K: chooses which lines reach the UI | a1's cross-check errors (`error: net-mismatch …` with exit 0) become `warning`: they do not fail the stage |
| `/code` | `DiagnosticCode` | — | required | a1's `BundleWarning.code` (sim: `src/prism-bundle/src/manifest.rs` and `build.rs:252`, `:299`); today's `source-unparseable` (`backend/app/services/variant_catalog_service.py:51`) | K, tests | codes registered in cli-spec.md §8 |
| `/message` | string, ≤ 4096 bytes | — | required | a1's messages; sexpr `Error.message` (fork: `src/rs/kicad-monkey-core/src/sexpr.rs:80-92`) | K: job log, UI | no host path, unlike a1 (`error: missing board: /Users/…`) |
| `/stage` | `CliBuildStage` | — | optional; absent outside `bundle build` stages | a1 stage labels on stderr (sim: `build.rs:375-439`, `Stopwatch` laps) | K: per-stage log grouping | new |
| `/argument` | `CliArgument` | — | optional; absent when not about one argument | fork cruncher's argument messages (fork: `packages/kicad_cruncher/src/rs/kicad-cruncher-cli/src/lib.rs:273-470`) | K: maps usage errors to its own argv builder | new; replaces echoing host paths |
| `/location` | `CliLocation` | — | optional; absent when unknown | fork sexpr `Position` (fork: `sexpr.rs:59-69`) | K: UI link to the file and line in the Schematic/PCB viewers, which read `sources/` | new; a1 had no location (observed: `schematic broken.kicad_sch is malformed: unclosed '('`) |
| `/location/path` | `ArchivePath` | — | optional | the member path of the file (cli-spec.md §3.1); a1's `MalformedSchematic.path` (sim: `src/prism-bundle/src/error.rs:38-44`) | K, as above | the bundle member path, never the host path |
| `/location/line` | `CliOneBased` | line | optional | fork: `sexpr.rs:65` (`Position.line`, one-based) | K, as above | — |
| `/location/column` | `CliOneBased` | Unicode scalar values | optional | fork: `sexpr.rs:67` (`Position.column`, one-based Unicode-scalar) | K, as above | — |
| `/location/offset` | `ByteCount` | bytes | optional | fork: `sexpr.rs:63` (`Position.offset`, zero-based) | K; the ecad-viewer source jump | — |
| `/location/pointer` | `CliJsonPointer` | — | optional | ajv `instancePath` in today's validation (`native/scripts/contracts/lib/contracts.mjs`, `describeAjvError`) | K, tests | new |
| `/location/uuid` | `KiCadUuid` | — | optional | conventions.md §8 ("skipping the object and reporting a Warning"); a1 cross-check names objects by refdes (sim: `src/prism-bundle/src/crosscheck.rs`) | K: cross-probe to the object | new |
| `/limit` | `CliLimitHit` | — | optional; present for `limit-exceeded` and `diagnostics-truncated` | fork: `NativeErrorKind::resource_limit` (fork: `src/tsp/kicad_monkey/native-transport-a0.tsp:33-39`) and its messages (fork: `src/rs/kicad-monkey-native/src/lib.rs:502-504`) | K: shows which limit to raise | new structure; the fork had text only |
| `/limit/kind` | `"bytes"` \| `"time"` \| `"count"` | — | required in `limit`; the variant tag of `CliLimitHit` (`@oneOf`), following the limit name's unit suffix | cli-spec.md §7.2 | K: which value field to read | — |
| `/limit/name` | `CliLimitName` | — | required in `limit` | cli-spec.md §7.2 | K: `--limit` override | — |
| `/limit/limit_bytes` | `ByteCount` | bytes | required when `kind` is `bytes` | the configured value: cli-spec.md §7.2 default or `--limit` | K | — |
| `/limit/observed_bytes` | `ByteCount` | bytes | optional, `bytes` only; absent when unmeasured and always for `max-memory-bytes` | the input's size: a file's length or a declared member size | K | never a measured memory value |
| `/limit/limit_ms` | `CliMilliseconds` | ms | required when `kind` is `time` | `timeout-ms` (cli-spec.md §7.3) | K | no elapsed time is reported |
| `/limit/limit_count` | `Count` | count | required when `kind` is `count` | cli-spec.md §7.2 | K | — |
| `/limit/observed_count` | `Count` | count | optional, `count` only; absent when unmeasured | the counted input, for example the selected source files | K | — |

## Fields: `CliErrorA0` (`prism.cli.error.a0`)

| Field (JSON pointer) | Type | Unit | Order / nullability | Today's source (path:line) | Consumers (path:line) | Parity note |
|---|---|---|---|---|---|---|
| `/schema` | const `"prism.cli.error.a0"` | — | required | fork: `NativeError` (`native-transport-a0.tsp:226-235`), there with `type`/`version` and on stderr | K: job outcome (cli-spec.md §4) | moves from stderr to stdout; envelope per conventions.md §4 |
| `/category` | `CliErrorCategory` | — | required | fork: `NativeErrorKind` (`native-transport-a0.tsp:33-39`); cruncher exit 2 vs 1 (fork: `kicad-cruncher-cli/src/lib.rs:557-604`) | K: `RetryableJobError` vs `PermanentJobError` (`backend/app/services/job_runtime.py:18-41`) | `request` is split into `usage`/`input`/`precondition`; `timeout`, `output-io` and `internal` are added; a1 had exit 1 only (sim: `prism-bundle.rs:241-247`) |
| `/code` | `DiagnosticCode` | — | required | a1 `BundleError` variants (sim: `src/prism-bundle/src/error.rs:7-81`) | K: job `error_code`; the stub's failure injection | codes in cli-spec.md §8 |
| `/message` | string, ≤ 4096 bytes | — | required | a1's `Display` of `BundleError`; fork `NativeError.message` | K: job `error_message` | no host path |
| `/stage` | `CliBuildStage` | — | optional | as in CliDiagnosticA0 | K: which stage failed | new |
| `/argument` | `CliArgument` | — | optional | as in CliDiagnosticA0 | K | new |
| `/location` | `CliLocation` | — | optional | as in CliDiagnosticA0 | K | new |
| `/location/path` | `ArchivePath` | — | optional | as in CliDiagnosticA0 | K | as in CliDiagnosticA0 |
| `/location/line` | `CliOneBased` | line | optional | fork: `sexpr.rs:65` | K | — |
| `/location/column` | `CliOneBased` | Unicode scalar values | optional | fork: `sexpr.rs:67` | K | — |
| `/location/offset` | `ByteCount` | bytes | optional | fork: `sexpr.rs:63` | K | — |
| `/location/pointer` | `CliJsonPointer` | — | optional | as in CliDiagnosticA0 | K | — |
| `/location/uuid` | `KiCadUuid` | — | optional | as in CliDiagnosticA0 | K | — |
| `/limit` | `CliLimitHit` | — | present exactly when `category` is `resource-limit` or `timeout` | fork `resource_limit` errors (fork: `src/rs/kicad-monkey-native/src/lib.rs:852-874`) | K | — |
| `/limit/kind` | `"bytes"` \| `"time"` \| `"count"` | — | required in `limit` | cli-spec.md §7.2 | K | — |
| `/limit/name` | `CliLimitName` | — | required in `limit` | cli-spec.md §7.2 | K | — |
| `/limit/limit_bytes` | `ByteCount` | bytes | required when `kind` is `bytes` | cli-spec.md §7.2 | K | — |
| `/limit/observed_bytes` | `ByteCount` | bytes | optional; absent for `max-memory-bytes` | file or declared member size | K | — |
| `/limit/limit_ms` | `CliMilliseconds` | ms | required when `kind` is `time` | `timeout-ms` | K: its outer timeout is this plus 30 s (cli-spec.md §7.3) | — |
| `/limit/limit_count` | `Count` | count | required when `kind` is `count` | cli-spec.md §7.2 | K | — |
| `/limit/observed_count` | `Count` | count | optional | the counted input | K | — |

## Fields: `CliBuildResultA0` (`prism.cli.build_result.a0`)

| Field (JSON pointer) | Type | Unit | Order / nullability | Today's source (path:line) | Consumers (path:line) | Parity note |
|---|---|---|---|---|---|---|
| `/schema` | const `"prism.cli.build_result.a0"` | — | required | new; a1 prints a text summary (sim: `prism-bundle.rs:159-167`) | K | — |
| `/stage` | `CliBuildStage` | — | required | ADR §4.4 stages; a1 has no stages | K: which readiness to publish | new |
| `/stages` | `CliStageState[]` | — | required; exactly 3; in stage order `parse`, `board`, `models` | ADR §4.4 ("`bundle.json` records each stage's status") | K: schedules the next stage or stops (cli-spec.md §9.1); consumers' readiness | a copy of the manifest's stage table |
| `/stages/*/stage` | `CliBuildStage` | — | required | as above | K | — |
| `/stages/*/status` | `CliStageStatus` | — | required | the manifest's stage status (bundle-format.md §3.1); a1 `cross_check.status` `skipped` (sim: `contracts/contracts/bundle.tsp:102-109`) is the nearest precedent | K: exit 0 for `complete`, 9 for `failed` or `partial`; schedules the next stage | new |
| `/stages/*/error` | `CliFinding` | — | present exactly when `status` is `failed` | a1: none (a content failure was exit 1 and no bundle, sim: `prism-bundle.rs:152-155`) | K: the stage's failure message in the UI | new: a content failure is recorded (cli-spec.md §5.2.7) |
| `/stages/*/error/code` | `DiagnosticCode` | — | required in `error` | content-failure codes (cli-spec.md §8) | K | — |
| `/stages/*/error/message` | string | — | required in `error` | sexpr `Error.message` (fork: `sexpr.rs:80-92`), materializer errors (sim: `error.rs:56-58`) | K | — |
| `/stages/*/error/location` | `CliLocation` | — | optional | fork `Position` | K | — |
| `/stages/*/error/location/path` | `ArchivePath` | — | optional | member path of the failing source | K | — |
| `/stages/*/error/location/line` | `CliOneBased` | line | optional | fork: `sexpr.rs:65` | K | — |
| `/stages/*/error/location/column` | `CliOneBased` | Unicode scalar values | optional | fork: `sexpr.rs:67` | K | — |
| `/stages/*/error/location/offset` | `ByteCount` | bytes | optional | fork: `sexpr.rs:63` | K | — |
| `/stages/*/error/location/pointer` | `CliJsonPointer` | — | optional | `.kicad_pro` JSON errors | K | — |
| `/stages/*/error/location/uuid` | `KiCadUuid` | — | optional | object-level content errors | K | — |
| `/stages/*/skip_reason` | `CliSkipReason` | — | present exactly when `status` is `skipped` | a1: a missing board fails the whole build (observed `error: missing board: …` on `backend/tests/fixtures/design_variants/sch_only`) | K: does not queue the stage | new |
| `/stages/*/failed_members` | `CliMemberFailure[]` | — | required; sorted by `path` in code point order; non-empty exactly when `status` is `partial` | the manifest's `stages.<stage>.failed_members` (bundle-format.md §3.1); a1 had no per-member failure (a projection or design-JSON error failed the build, sim: `src/prism-bundle/src/error.rs:62-64`) | K: tells consumers waiting on those members that they failed (bundle-format.md §3.3) | new |
| `/stages/*/failed_members/*/path` | `ArchivePath` | — | required; unique | fixed-path member of the stage (bundle-format.md §1) | K | — |
| `/stages/*/failed_members/*/code` | `DiagnosticCode` | — | required | `design-build-failed`, `projection-failed`, `materialization-failed` (cli-spec.md §8; bundle-format.md §3.2) | K | — |
| `/stages/*/failed_members/*/message` | string | — | required | the producer's error text | K: shown to the consumer | no host path |
| `/archive_bytes` | `ByteCount` | bytes | required | sim: `prism-bundle.rs:160-162` (`wrote {} ({} bytes, …)`) | K: store accounting (ADR §11 G2), integrity of the stored file | from a1's stderr text to a field |
| `/archive_sha256` | `Sha256Hex` | — | required | new; ref copies the archive without a digest (ref: `backend/app/services/project_bundle.py:142-146`) | K: stored-file integrity and idempotence checks; B: determinism test | new |
| `/written_members` | `CliMemberDigest[]` | — | required, ≥ 1; sorted by `path` in code point order | a1 `manifest.members` (sim: `build.rs:358-369`) | K: invalidates and extracts only the changed members of the unpacked cache (ADR §5) | only the members this invocation wrote |
| `/written_members/*/path` | `ArchivePath` | — | required; unique | sim: `build.rs:363` | K | — |
| `/written_members/*/bytes` | `ByteCount` | bytes | required | sim: `build.rs:365` | K | — |
| `/written_members/*/sha256` | `Sha256Hex` | — | required | sim: `build.rs:364` | K | — |
| `/warnings` | `Warning[]` | — | required; in manifest order | a1 `manifest.warnings` (sim: `build.rs:290-306`), printed to stderr (`prism-bundle.rs:177-179`) | K: build log and UI without unzipping `bundle.json` | the stage's own warnings only |
| `/warnings/*/code` | `DiagnosticCode` | — | required | a1: `stale-saved-fills` (sim: `build.rs:252`), `kicad-default-stackup` (`:299`); new `saved-fills-used` (stage board with `zone_fills: "saved"`, cli-spec.md §5.2.3) | K | the manifest contract owns the codes |
| `/warnings/*/message` | string | — | required | as above | K | — |

## Fields: `CliVerifyReportA0` (`prism.cli.verify_report.a0`)

| Field (JSON pointer) | Type | Unit | Order / nullability | Today's source (path:line) | Consumers (path:line) | Parity note |
|---|---|---|---|---|---|---|
| `/schema` | const `"prism.cli.verify_report.a0"` | — | required | new; a1 verify prints one text line (sim: `prism-bundle.rs:194-199`) | K: store scan, unpacked-cache repair | — |
| `/status` | `CliVerifyStatus` | — | required | a1 verify's exit 0/1 (sim: `prism-bundle.rs:186-201`) | K | exit 8 for invalid instead of 1 |
| `/manifest_schema` | `SchemaId` | — | optional; absent when `bundle.json` is unreadable or not a well-formed id | sim: `src/prism-bundle/src/reader.rs:40-46` | K: recognizes a1 `board.prism` files from the reference branch | — |
| `/generator_matches` | boolean | — | optional; absent when the manifest is not a2 | new | K: decides whether a stored bundle is current or stale (ADR §5 removes older generators) | new |
| `/stages` | `CliStageState[]` | — | required; stage order `parse`, `board`, `models`; empty when the manifest is unreadable | the manifest's stage table | K: resumes staged builds after a worker restart (ADR §4.4) | — |
| `/stages/*/stage` | `CliBuildStage` | — | required | as in CliBuildResultA0 | K | — |
| `/stages/*/status` | `CliStageStatus` | — | required | as in CliBuildResultA0 | K | — |
| `/stages/*/error` | `CliFinding` | — | present exactly when `failed` | as in CliBuildResultA0 | K | — |
| `/stages/*/error/code` | `DiagnosticCode` | — | required in `error` | as in CliBuildResultA0 | K | — |
| `/stages/*/error/message` | string | — | required in `error` | as in CliBuildResultA0 | K | — |
| `/stages/*/error/location` | `CliLocation` | — | optional | as in CliBuildResultA0 | K | — |
| `/stages/*/error/location/path` | `ArchivePath` | — | optional | member path of the failing source | K | — |
| `/stages/*/error/location/line` | `CliOneBased` | line | optional | fork: `sexpr.rs:65` | K | — |
| `/stages/*/error/location/column` | `CliOneBased` | Unicode scalar values | optional | fork: `sexpr.rs:67` | K | — |
| `/stages/*/error/location/offset` | `ByteCount` | bytes | optional | fork: `sexpr.rs:63` | K | — |
| `/stages/*/error/location/pointer` | `CliJsonPointer` | — | optional | `.kicad_pro` JSON errors | K | — |
| `/stages/*/error/location/uuid` | `KiCadUuid` | — | optional | object-level content errors | K | — |
| `/stages/*/skip_reason` | `CliSkipReason` | — | present exactly when `skipped` | as in CliBuildResultA0 | K | — |
| `/stages/*/failed_members` | `CliMemberFailure[]` | — | required; sorted by `path`; non-empty exactly when `partial` | as in CliBuildResultA0 | K | — |
| `/stages/*/failed_members/*/path` | `ArchivePath` | — | required | as in CliBuildResultA0 | K | — |
| `/stages/*/failed_members/*/code` | `DiagnosticCode` | — | required | as in CliBuildResultA0 | K | — |
| `/stages/*/failed_members/*/message` | string | — | required | as in CliBuildResultA0 | K | — |
| `/members_checked` | `Count` | members | required | sim: `prism-bundle.rs:194-196` (`{} members verified`) | K: logs; tests assert full coverage | — |
| `/findings` | `CliFinding[]` | — | required; sorted by `location.path` (absent first) in code point order, then `code`, then `message`; empty exactly when `valid` | a1's first error only (sim: `reader.rs:29-63`, `zip.rs:234-311`) | K: job log, the reason for a rebuild | all findings rather than the first |
| `/findings/*/code` | `DiagnosticCode` | — | required | cli-spec.md §8 verify codes | K | — |
| `/findings/*/message` | string | — | required | a1 `BundleError::Archive` messages (sim: `zip.rs:112-114`, `reader.rs:49-60`) | K | — |
| `/findings/*/location` | `CliLocation` | — | optional | — | K | — |
| `/findings/*/location/path` | `ArchivePath` | — | optional | the member checked | K | — |
| `/findings/*/location/line` | `CliOneBased` | line | optional | JSON parse position in a member (`manifest-invalid`, `member-schema-invalid`) | K | — |
| `/findings/*/location/column` | `CliOneBased` | Unicode scalar values | optional | as `line` | K | — |
| `/findings/*/location/offset` | `ByteCount` | bytes | optional | byte offset in the member, or of the zip record for `zip-*` findings | K | — |
| `/findings/*/location/pointer` | `CliJsonPointer` | — | optional | schema-validation instance path | K | — |
| `/findings/*/location/uuid` | `KiCadUuid` | — | optional | object-level findings | K | — |

## Fields: `CliExtractResultA0` (`prism.cli.extract_result.a0`)

| Field (JSON pointer) | Type | Unit | Order / nullability | Today's source (path:line) | Consumers (path:line) | Parity note |
|---|---|---|---|---|---|---|
| `/schema` | const `"prism.cli.extract_result.a0"` | — | required | new | K's unpacked cache; the MCP server | — |
| `/members` | `CliMemberDigest[]` | — | required, ≥ 1; sorted by `path` in code point order | ref: `backend/app/services/project_bundle.py:103-124` (unpack checks each member's SHA-256) | K: records what is in the cache directory | — |
| `/members/*/path` | `ArchivePath` | — | required; unique | ref: `project_bundle.py:109-114` | K | the path under `-o` equals the member path; ref renamed `materialization/board.kmpack` to `board.kmpack` (`:111`) |
| `/members/*/bytes` | `ByteCount` | bytes | required | manifest `members[].bytes` | K | — |
| `/members/*/sha256` | `Sha256Hex` | — | required | ref: `project_bundle.py:117-123` | K | — |

## Fields: `CliProjectAbsentA0` (`prism.cli.project_absent.a0`)

| Field (JSON pointer) | Type | Unit | Order / nullability | Today's source (path:line) | Consumers (path:line) | Parity note |
|---|---|---|---|---|---|---|
| `/schema` | const `"prism.cli.project_absent.a0"` | — | required | new | K | — |
| `/code` | const `"project-absent"` | — | required | new (conventions.md §8); the same code as the pure layer's `project-absent` (revision-key-a1.tsp, `RevisionKeyErrorCode`) | K: records the project as not present at the revision; C1–C4 render "not present at this revision" | today `find_kicad_project` raises, or falls back to another `.kicad_pro` of the directory (`backend/app/services/semantic_visualizer_service.py:115-157`; issue #681) |
| `/command` | `CliProjectAbsentCommand` | — | required | new | K (which step found it) | — |
| `/project_file` | `RepoPath` | — | required | `--project`, or `<project.kicad_pro>` relative to `--source-root` | K: the anchor that is absent | — |
| `/commit` | `GitObjectId` | — | optional; present exactly for `revision-key --commit` | `git rev-parse --verify <rev>^{commit}` (revision-key.md §3.1) | K: the commit at which the project is absent | — |

## How a golden is produced from today's code

No code produces these documents today, so there is no parity golden. WP-B's conformance suite (cli-spec.md §11) is the acceptance, and the generator vectors (cli-spec.md §5.1.5) are the cross-language check. The examples come from a prototype (described under "Example provenance") that runs today's tools and applies the spec's rules:

- **Version:** a1 `prism-bundle version` prints `{"prism_bundle":"0.1.0","manifest":"a1","materializer_revision":"b6316117901b344114385242b0ad13be45dfefae","design_engine":"2026.9.7"}` (sim `target/release/prism-bundle`, built from `src/prism-bundle/src/bin/prism-bundle.rs:219-227`). The mapping into `CliVersionA0`:
  - `prism_bundle` → `crate_version`;
  - `design_engine` → `engine_version`;
  - `manifest` → the `bundle.json` row of `member_schemas` (`prism.bundle.manifest.a3`);
  - `materializer_revision` is dropped;
  - `kicad_version` comes from `kicad-cli version` (`10.0.6` on the development machine);
  - `pack_format_version` comes from fork `PACK_FORMAT_VERSION` (0);
  - the procedures are the a0 constants.
- **Build:** `prism-bundle build <fixture>.kicad_pro -o <out> --no-refill` gives the source, design and materialization members of the a1 archive. Their bytes and SHA-256 carry over to a2: same core `b6316117`, members copied unchanged. With a refilled board, use `--refilled-board <pcb> --refill-tool 10.0.6`.
  - a1's stderr maps onto diagnostics: `warning: <msg>` → `severity: warning` with the manifest warning's code; `error: <msg>` for a cross-check finding → `warning`; `error: <BundleError>` with exit 1 → `CliErrorA0`, or a stage `error` with exit 9 when it is a content failure.
- **Verify:** a1 `prism-bundle verify` stops at the first problem and prints text. a2's report lists every finding.

## Expected divergences

| Case | Today | Bundle | Why the bundle is right | Consumer affected |
|---|---|---|---|---|
| A content failure, e.g. `backend/tests/fixtures/design_variants/malformed` | a1 exit 1, no archive, free text (`error: schematic broken.kicad_sch is malformed: unclosed '('`) | exit 9; the archive holds `sources/**` and the stage marked `failed` with code `source-unparseable` at line 1, column 1, offset 0 | the failure is deterministic per bundle key; recording it stops retry loops and gives a location (cli-spec.md §5.2.7) | K (job outcome), the Schematic/PCB viewers (still get `sources/`) |
| A projection or `design.json` fails on an otherwise parsable project | a1: `BundleError::Design`, exit 1, no archive (sim: `src/prism-bundle/src/error.rs:62-64`) | stage `parse` `partial`, the member in `failed_members`, exit 9 | the other members serve their consumers (bundle-format.md §3.2) | K readiness per member |
| A project without a board, e.g. `.../design_variants/sch_only` | a1 exit 1 `error: missing board: /Users/…/sch_only.kicad_pcb` | parse completes; `board` and `models` are `skipped`/`no-board` | the parse members do not need a board | K, Design Comparison (parse-only consumers) |
| Cross-check errors, e.g. `.../design_variants/oracle` (`component-missing-from-board: R9`) | a1 prints `error:` lines and exits 0 | `warning` diagnostics; recorded in the manifest's cross-check; exit 0 | they gate simulation only, as a1 intends (sim: `src/prism-bundle/src/lib.rs:22-24`) | Simulation Studio (C6) reads the manifest, not stderr |
| Writing `-o` | a1 `std::fs::write` (sim: `prism-bundle.rs:156-157`): a crash leaves a truncated bundle | temp file, fsync, self-verify, rename | a reader never sees a partial archive (ADR §4.4) | K, every bundle reader |
| No refill available | a1 `--no-refill`/`--kicad-cli` fallback; ref falls back to the saved fills on any refill failure, timeouts included (ref: `zone_refill.py:67-73`) | by default `--refilled-board` is required; a refill failure fails the job step, which is retried, and stage `board` stays `pending` | one bundle key, one set of bytes (ADR §7) | 3D tab, System Builder 3D and Simulation Studio wait for a successful refill (bundle-format.md §3.3) |
| Saved zone fills | a1 `--no-refill`, chosen per build (sim: `prism-bundle.rs:73`) | only when the recorded config has `zone_fills: "saved"`: no refill, `--refilled-board`/`--refill-tool` refused (exit 7, `zone-fills-mismatch`), warning `saved-fills-used`; a missing `--refilled-board` without it is the same code | the choice is a key input, so one key has one mode; it is a precondition because it depends on `--in`, not on the argv alone | K (skips the refill step, §9.1); C3, C5, C6 see saved-fill provenance |
| `components.glb` | today's 3D bundle keeps KiCad's `asset.extras.generated_at` (`kicad_cli_export.py:135-143`) | `generated_at` fixed to `1980-01-01T00:00:00` | determinism (ADR §7); observed: two exports differ only there | WP-V1 goldens compare canonicalized GLBs |
| Version line | a1 has 4 keys, no schema, and `materializer_revision` | `CliVersionA0` | canonical bytes and the bundle key need a closed, schema'd document | ref `tool_identity` (ref: `project_bundle.py:56-62`) is replaced by K's generator digest |

## Example provenance

The examples were produced on 2026-10-16 by a prototype, `proto.py` in the W0 scratch directory (not committed), that applies cli-spec.md to real outputs:
- the committed fixtures;
- KiCad 10.0.6 on macOS (`/Applications/KiCad/KiCad.app`);
- the a1 `prism-bundle` release binary of prism-sim-studio, built against fork `b6316117`.

Archive digests come from a Python stand-in writer that uses zlib, not miniz_oxide, and will differ from WP-B's. Member digests are real.

- **`CliVersionA0.example.json`**: the planned first a2 generator:
  - crate `0.1.0`, a1's crate version;
  - engine `2026.9.7`, from a1 `prism-bundle version`;
  - KiCad `10.0.6`, from `kicad-cli version`;
  - pack format 0, from fork `kicad-monkey-materialization-pack/src/lib.rs:54`;
  - the eleven member schemas of ADR §6.

  Not trimmed. Its canonical bytes give the vectors of cli-spec.md §5.1.5.
- **`CliDiagnosticA0.example.json`**: the `error` line of `bundle build --stage parse` on `backend/tests/fixtures/design_variants/malformed`. Position (1, 1, 0) is the unclosed root `(kicad_sch`, found by a paren scan that follows the fork parser's rule (fork: `src/rs/kicad-monkey-core/src/sexpr.rs:412-426` reports the open position of the innermost unclosed list at end of input). The message is the fork's text for `UnbalancedOpeningParenthesis`.
- **`CliErrorA0.example.json`**: `bundle build --stage parse` on `fixtures/release-studio/cynthion` with `--limit max-source-file-bytes=4194304`. `cynthion.kicad_pcb` is 6,257,788 bytes, which is real. The lowered limit exists only to show a real file hitting a limit.
- **`CliBuildResultA0.example.json`**: the recorded failure of `backend/tests/fixtures/design_variants/malformed`, exit 9.
  - Source member digests are the fixture files: they match `backend/tests/fixtures/design_variants/manifest.json:3841-3843`.
  - `bundle.json` and the archive digest come from the prototype.
  - `warnings` is empty because nothing warns before the parse fails.
- **`CliVerifyReportA0.example.json`**: verify of a usb-pd bundle (`fixtures/release-studio/usb-pd`, all three stages) whose `materialization/board.kmpack` was replaced after the build. The bundle's members are:
  - sources;
  - a1's `design.json`;
  - the board refilled by `pcbnew.ZONE_FILLER` with KiCad 10.0.6 (`ef71b931…`, 629,738 bytes);
  - a1's materialization of that board (`e5bc5730…`, 175,592 bytes);
  - the canonicalized GLB.

  The replacement is a1's materialization of the saved fills (`5532b16e…`, 160,312 bytes), simulating a corrupted store file. Eleven listed members are checked and one finding results: seven sources (the closure, no jobset; revision-key.md §12 Q3), `design.json`, the materialization, the refilled board and the GLB. The count was 12 with the jobset before Q3 was decided, and is adjusted by hand.
- **`CliProjectAbsentA0.example.json`**: the outcome the selection vector `error-project-absent` gives through `revision-key`: the configured `Missing.kicad_pro` is not in the listing. `commit` is left out because the vector holds a listing, not a commit id, as with `--worktree`.
- **`CliExtractResultA0.example.json`**: `bundle extract <usb-pd bundle> bundle.json sources/ -o <dir>`.
  - The seven source members are the closure the build read (revision-key.md §12, Q3): project, root and sub-sheet, board, and the three repository STEP models the board references through `${KIPRJMOD}/packages3D`. Stock `${KICAD9_3DMODEL_DIR}` models and the two `kicad-embed://` models are not repository files. The jobset of usb-pd's source set is read by no reference, so it is not a member; it was removed by hand after Q3.
  - Their digests are the fixture files'. `bundle.json`'s digest comes from the prototype, which ran before Q3 and the `source` field, and is a placeholder now.

**Also validated (not committed):**
- usb-pd's parse, board and models `CliBuildResultA0`;
- two prototype `partial` results built on usb-pd: a parse with `projections/system-interface.json` failed, and a board with `materialization/board.kmpack` failed. Both failures are invented, to exercise `failed_members`;
- a valid `CliVerifyReportA0`, and verify of the a1 `board.prism` (`manifest-unsupported` at `/version`);
- two more `CliErrorA0` cases (`option-conflict`, `stage-not-applicable`);
- the four stderr lines of the malformed run.

The manifest contract's example (`examples/BundleManifestA3.example.json`) embeds this example's generator id byte for byte. Its `bundle_key` recomputes with cli-spec.md §5.1.4.
