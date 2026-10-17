import "@typespec/json-schema";
import "./common.tsp";

using TypeSpec.JsonSchema;
using Prism.Contracts.Common;

/**
 * JSON documents of the `prism-kicad` command-line tool (cli-spec.md). The
 * family is `prism.cli`, not `kicad_cli`, so nothing is confused with KiCad's
 * own `kicad-cli`.
 *
 * Every command writes exactly one document to stdout (a result, a report,
 * CliProjectAbsentA0 or CliErrorA0, as cli-spec.md §3 assigns them to exit
 * codes) and zero or more
 * CliDiagnosticA0 lines to stderr. Field names are snake_case (bundle
 * machinery, conventions.md §5). No document carries a host path, a
 * wall-clock time or a measured duration: files are named by the path they
 * have as bundle members, so the same inputs give byte-identical stdout.
 */
namespace Prism.Contracts.CliA0;

// ------------------------------------------------------------------ scalars

/**
 * A release version of three dot-separated decimal numbers without leading
 * zeros, for example `0.1.0` (SemVer), `2026.9.7` (the fork's CalVer) or
 * `10.0.6` (KiCad, as `kicad-cli version` prints it). Printable ASCII only,
 * which keeps the generator id's canonical form unambiguous (cli-spec.md §5.1).
 */
@pattern("^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$")
scalar CliReleaseVersion extends string;

/** A one-based line or column number. */
@minValue(1)
scalar CliOneBased extends safeint;

/**
 * A JSON Pointer (RFC 6901) into a JSON file: empty for the whole document,
 * otherwise `/`-separated reference tokens with `~0` for `~` and `~1` for `/`.
 */
@pattern("^(/([^~/]|~[01])*)*$")
scalar CliJsonPointer extends string;

/** A duration in integer milliseconds (conventions.md §6, CLI limits). */
@minValue(0)
scalar CliMilliseconds extends safeint;

// -------------------------------------------------------------------- enums

/** How serious a stderr diagnostic is. */
enum CliSeverity {
  /** Progress or a note; the command is unaffected. */
  info,

  /** A finding the command records and continues past, for example a manifest warning. */
  warning,

  /** A finding that makes the command fail, or the stage it belongs to fail. */
  error,
}

/**
 * Why a command failed. Each category has exactly one exit code
 * (cli-spec.md §4); a caller may switch on either.
 */
enum CliErrorCategory {
  /** Exit 1: a defect in prism-kicad itself (a panic or a broken invariant). */
  internal,

  /** Exit 2: the arguments are wrong: unknown command or option, missing or repeated value, conflicting options. */
  usage,

  /** Exit 3: an input file named by an argument cannot be used: missing, not a regular file, not the expected format, or an input bundle that fails verification. */
  input,

  /** Exit 4: a resource limit was exceeded, including the memory cap. The limit is named in `limit`. */
  resourceLimit: "resource-limit",

  /** Exit 5: the command ran past its wall-clock timeout (`timeout-ms`). */
  timeout,

  /** Exit 6: an output could not be written: the output directory is missing or unwritable, the disk is full, or stdout failed. */
  outputIo: "output-io",

  /** Exit 7: the inputs are individually valid but do not fit together: wrong stage order, generator, revision key, KiCad version or a missing member. */
  precondition,
}

/**
 * A stage of `bundle build`, in the order the stages run (ADR §4.4). The
 * same three stages are recorded in the bundle manifest.
 */
enum CliBuildStage {
  /** One parse of the sources: `sources/**`, `design.json` and every `projections/*.json`. */
  parse,

  /** The board and its materialization: `refilled/<board file name>` and `materialization/board.kmpack`, or only the materialization of the saved board when the config has `zone_fills: "saved"` (cli-spec.md §5.2.3). */
  board,

  /** The component bodies exported by KiCad: `viewer/models/components.glb`. */
  models,
}

/** The state of one stage in a bundle. */
enum CliStageStatus {
  /** Not run yet. The only status that is not final; for a stored bundle a stage only moves from `pending` to a final status (bundle-format.md §3.3). */
  pending,

  /** Ran to the end and wrote every member that applies to the project. */
  complete,

  /** Ran to the end, but the producer of at least one member failed on the design's content; `failed_members` lists each such member and the others are in the bundle. */
  partial,

  /** Stopped on an error in the design's content, given in `error`. None of the stage's members are in the bundle, except the source members of stage `parse`. */
  failed,

  /** Will never run for this bundle; `skip_reason` says why. */
  skipped,
}

/** Why a stage is skipped. */
enum CliSkipReason {
  /** The effective configuration names no board (`board` absent), so there is nothing to refill, materialize or export. */
  noBoard: "no-board",

  /** The stage before it did not allow it to run: stage `parse` is `failed` (for `board`), or stage `board` is not `complete` (for `models`). Takes precedence over `no-board`. */
  earlierStageFailed: "earlier-stage-failed",
}

/** Outcome of `bundle verify`. */
enum CliVerifyStatus {
  /** Every check passed; `findings` is empty. */
  valid,

  /** At least one check failed; `findings` lists them. */
  invalid,
}

/** A command that can find the project absent at a revision (CliProjectAbsentA0). */
enum CliProjectAbsentCommand {
  /** `revision-key`: the listing has no entry at the project file. */
  revisionKey: "revision-key",

  /** `bundle build --stage parse`: nothing is at `<project.kicad_pro>` under the source root. */
  bundleBuild: "bundle build",
}

/**
 * A command-line argument a diagnostic or error is about, named as the usage
 * text names it: an option by its long name without the leading `--`, a
 * positional argument by its placeholder. Used instead of echoing the
 * argument's value, which may be a host path.
 */
enum CliArgument {
  /** The command word itself (`bundle build`, `version`, ...). */
  command,

  /** `<project.kicad_pro>` of `bundle build --stage parse`. */
  projectFile: "project-file",

  /** `<bundle>` of `bundle verify` and `bundle extract`. */
  bundle,

  /** A `<member>` of `bundle extract`. */
  member,

  /** `<repo>` of `revision-key`. */
  repo,

  /** `-o`/`--output`. */
  output,

  /** `--in`. */
  in,

  /** `--stage`. */
  stage,

  /** `--source-root`. */
  sourceRoot: "source-root",

  /** `--refilled-board`; required by stage `board` in refill mode and refused with `zone_fills: "saved"` (`zone-fills-mismatch`). */
  refilledBoard: "refilled-board",

  /** `--refill-tool`; given exactly when `--refilled-board` is. */
  refillTool: "refill-tool",

  /** `--models-glb`. */
  modelsGlb: "models-glb",

  /** `--models-tool`. */
  modelsTool: "models-tool",

  /** `--revision-key`. */
  revisionKey: "revision-key",

  /** `--key-record` of `bundle build --stage parse`. */
  keyRecord: "key-record",

  /** An `--upgraded` of `bundle build --stage parse`: a source the backend upgraded from an older KiCad file format (cli-spec.md §9.4). */
  upgraded,

  /** `--config`. */
  config,

  /** `--commit` of `revision-key`. */
  commit,

  /** `--worktree` of `revision-key`. */
  worktree,

  /** `--project` of `revision-key`. */
  project,

  /** `--limit`. */
  limit,

  /** `--threads`. */
  threads,

  /** `--quiet`. */
  quiet,

  /** `--base` of `compare` (cli-spec.md §5.6). */
  base,

  /** `--head` of `compare` (cli-spec.md §5.6). */
  head,

  /** `--base-src` of `compare`: the base revision's `<project.kicad_pro>` in a source tree (amendment C2r §3). */
  baseSrc: "base-src",

  /** `--head-src` of `compare`: the head revision's `<project.kicad_pro>` in a source tree. */
  headSrc: "head-src",

  /** `--base-source-root` of `compare`, as `--source-root` of `bundle build`. */
  baseSourceRoot: "base-source-root",

  /** `--head-source-root` of `compare`. */
  headSourceRoot: "head-source-root",

  /** `--base-config` of `compare`, as `--config` of `bundle build`. */
  baseConfig: "base-config",

  /** `--head-config` of `compare`. */
  headConfig: "head-config",

  /** `--base-revision-key` of `compare`: the base source tree's revision key. */
  baseRevisionKey: "base-revision-key",

  /** `--head-revision-key` of `compare`. */
  headRevisionKey: "head-revision-key",

  /** `--base-upgraded` of `compare`, as `--upgraded` of `bundle build`. */
  baseUpgraded: "base-upgraded",

  /** `--head-upgraded` of `compare`. */
  headUpgraded: "head-upgraded",

  /** `--include-unchanged` of `compare`: list unchanged BOM rows too. */
  includeUnchanged: "include-unchanged",

  /** `--view` of `artwork`: the name of a view of the `ArtworkConfigA0`. */
  view,

  /** `--variant` of `vendor run` and `artwork`: the variant whose occurrences the run applies. */
  variant,

  /** `<vendor-id>` of `vendor run`. */
  vendor,

  /** `--request` of `stroke-text` and `drawing-sheet`. */
  request,

  /** `--metrics` of `stroke-text`. */
  metrics,

  /** `--geometer` of `bundle build --stage models`: the pinned Geometer runtime (cli-spec.md §5.2.4). */
  geometer,

  /** `--model-dir` of `bundle build --stage models`: a KiCad stock 3D model library (cli-spec.md §5.2.4). */
  modelDir: "model-dir",

  /** `--hlr-cache` of `bundle build --stage models`: the HLR projection cache (cli-spec.md §5.2.4). */
  hlrCache: "hlr-cache",
}

/**
 * A resource limit (cli-spec.md §7.2). The suffix gives the unit: `-bytes` is
 * bytes, `-ms` is milliseconds, anything else is a count. Every limit can be
 * set with `--limit <name>=<value>`, up to its hard bound. Hitting one is
 * never recorded in a bundle: limits are configuration, not part of the
 * bundle key.
 */
enum CliLimitName {
  /** Most files in the selected source set. */
  maxSourceFiles: "max-source-files",

  /** Largest single source file; also applies to `--refilled-board`. */
  maxSourceFileBytes: "max-source-file-bytes",

  /** Largest sum of the selected source files' sizes. */
  maxTotalSourceBytes: "max-total-source-bytes",

  /** Longest repository or archive path in UTF-8 bytes (bundle-format.md §5; each segment is at most 255 bytes regardless). */
  maxPathBytes: "max-path-bytes",

  /** Deepest s-expression list nesting in one KiCad file, the root list at depth 0. */
  maxSexprDepth: "max-sexpr-depth",

  /** Most s-expression nodes (lists plus atoms) in one KiCad file. */
  maxSexprNodes: "max-sexpr-nodes",

  /** Longest decoded quoted string in one KiCad file. */
  maxSexprStringBytes: "max-sexpr-string-bytes",

  /** Deepest JSON nesting in `.kicad_pro`, `--config` or `bundle.json`. */
  maxJsonDepth: "max-json-depth",

  /** Most JSON values in `.kicad_pro`, `--config` or `bundle.json`. Other JSON members being verified are bounded by `max-member-bytes` instead: a large board's `design.json` can exceed 8M values. */
  maxJsonNodes: "max-json-nodes",

  /** Largest `--config` file. */
  maxConfigBytes: "max-config-bytes",

  /** Largest `--models-glb` file. */
  maxModelsGlbBytes: "max-models-glb-bytes",

  /** Most operations the materializer may emit for one board. */
  maxMaterializationOperations: "max-materialization-operations",

  /** Largest uncompressed archive member, written or read. */
  maxMemberBytes: "max-member-bytes",

  /** Largest archive file, written or read. */
  maxArchiveBytes: "max-archive-bytes",

  /** Most members in one archive, `bundle.json` included. */
  maxArchiveMembers: "max-archive-members",

  /** Largest sum of uncompressed member sizes in one archive. */
  maxTotalUnpackedBytes: "max-total-unpacked-bytes",

  /** Highest uncompressed-to-compressed size ratio of one member larger than 1 MiB, rounded down. */
  maxCompressionRatio: "max-compression-ratio",

  /** Most stderr diagnostic lines one invocation writes before `diagnostics-truncated`. */
  maxDiagnosticLines: "max-diagnostic-lines",

  /** Most findings one `bundle verify` report lists before `findings-truncated`. */
  maxFindings: "max-findings",

  /** Most heap memory the process may hold at once. */
  maxMemoryBytes: "max-memory-bytes",

  /** Wall-clock time one invocation may run, from process start. */
  timeoutMs: "timeout-ms",
}

/**
 * The source-upgrade procedure the backend runs before stage `parse`
 * (cli-spec.md §9.4). Pinned in the generator id because its output is the
 * bytes of upgraded source members.
 */
enum CliUpgradeProcedure {
  /** Boards: `pcbnew.KIID.SeedGenerator(0x50524953)`, then `pcbnew.LoadBoard` and `pcbnew.SaveBoard` on a scratch copy beside its `.kicad_pro`, keeping only the `.kicad_pcb`. Schematics: `kicad-cli sch upgrade`. Only files whose `(version …)` is older than the KiCad's format are upgraded. */
  kicadSeededUpgradeA0: "kicad-seeded-upgrade-a0",
}

/**
 * The zone-refill procedure the backend runs before stage `board`
 * (cli-spec.md §9.2). Pinned in the generator id because its output is a
 * bundle member.
 */
enum CliRefillProcedure {
  /** `pcbnew.ZONE_FILLER(board).Fill(board.Zones())` then `pcbnew.SaveBoard`, on a scratch copy of the board beside its `.kicad_pro` and `.kicad_dru`, run by KiCad's Python. */
  pcbnewZoneFillerA0: "pcbnew-zone-filler-a0",
}

/**
 * The component-model export the backend runs before stage `models`
 * (cli-spec.md §9.3). Pinned in the generator id because its output is a
 * bundle member.
 */
enum CliModelsProcedure {
  /** `kicad-cli pcb export glb --force --no-board-body --output <dir>/components.glb <board>` on the source board. */
  kicadCliGlbA0: "kicad-cli-glb-a0",
}

// ------------------------------------------------------------- small models

/**
 * Where a finding is. Every field is optional; a field is present only when
 * it is known. The field names are single words so the model can move to
 * common.tsp unchanged and serve camelCase documents too.
 */
model CliLocation {
  /**
   * The file, named by the path it has as a bundle member, whether or not a
   * bundle has been written yet: `sources/<RepoPath>` for a source file,
   * `refilled/<board file name>` for the `--refilled-board` input (refill mode only),
   * `viewer/models/components.glb` for the `--models-glb` input,
   * the member path itself for a member of an existing bundle. Absent when the finding
   * is about an argument file that is not a member (`--config`) or about no
   * file at all.
   */
  path?: ArchivePath;

  /** One-based line of the finding in a text file. */
  line?: CliOneBased;

  /** One-based column, counted in Unicode scalar values, on `line`. */
  column?: CliOneBased;

  /** Zero-based byte offset of the finding from the start of the file. */
  offset?: ByteCount;

  /** JSON Pointer to the value in a JSON file (a `.kicad_pro`, `--config`, or a JSON member). */
  pointer?: CliJsonPointer;

  /** UUID of the KiCad object the finding is about, as written in the file. */
  uuid?: KiCadUuid;
}

/** A size limit that was hit: a limit whose name ends in `-bytes`. */
model CliByteLimitHit {
  /** Variant tag: the limit is a size in bytes. */
  kind: "bytes";

  /** Which limit. */
  name: CliLimitName;

  /** The limit's value for this invocation, its default or the `--limit` override. */
  limit_bytes: ByteCount;

  /** The size that exceeded it, when the input's size was known before reading it (a file or a declared member size). Absent when the work stopped at the limit without knowing the total, and always for `max-memory-bytes`. */
  observed_bytes?: ByteCount;
}

/** A time limit that was hit: `timeout-ms`. */
model CliTimeLimitHit {
  /** Variant tag: the limit is a duration. */
  kind: "time";

  /** Which limit. */
  name: CliLimitName;

  /** The limit's value for this invocation. No elapsed time is reported: documents carry no measured durations. */
  limit_ms: CliMilliseconds;
}

/** A count limit that was hit: a limit whose name ends neither in `-bytes` nor in `-ms`. */
model CliCountLimitHit {
  /** Variant tag: the limit is a count. */
  kind: "count";

  /** Which limit. */
  name: CliLimitName;

  /** The limit's value for this invocation, its default or the `--limit` override. */
  limit_count: Count;

  /** The count that exceeded it, when it was known before stopping (for example the number of selected source files). Absent otherwise. */
  observed_count?: Count;
}

/**
 * The limit a resource-limit or timeout error, or a diagnostic, hit. The
 * variant follows the limit name's unit suffix.
 */
@oneOf
union CliLimitHit {
  /** A size limit. */
  bytes: CliByteLimitHit,

  /** The wall-clock limit. */
  time: CliTimeLimitHit,

  /** A count limit. */
  count: CliCountLimitHit,
}

/** A finding with a stable code, a message for people and an optional location. */
model CliFinding {
  /** Stable code (cli-spec.md §8) that tools and tests match on. */
  code: DiagnosticCode;

  /** One-sentence explanation for people. It never contains a host path; its wording may change between versions. */
  @minLength(1)
  message: string;

  /** Where the finding is, when known. */
  location?: CliLocation;
}

/** A member a stage could not write, and why. */
model CliMemberFailure {
  /** The member's archive path, for example `projections/system-interface.json`. */
  path: ArchivePath;

  /** Stable code (cli-spec.md §8), for example `projection-failed`. */
  code: DiagnosticCode;

  /** One-sentence explanation for people. It never contains a host path. */
  @minLength(1)
  message: string;
}

/**
 * The state of one build stage: the status, error, skip reason and failed
 * members of the stage's record in the bundle manifest, copied verbatim. The
 * manifest's other per-stage fields (warnings, fill check, cross-check) are
 * not repeated.
 */
model CliStageState {
  /** The stage. */
  stage: CliBuildStage;

  /** Its state. */
  status: CliStageStatus;

  /** The content error that failed the stage. Present exactly when `status` is `failed`. */
  error?: CliFinding;

  /** Why the stage will never run. Present exactly when `status` is `skipped`. */
  skip_reason?: CliSkipReason;

  /** The members the stage could not write, sorted by `path` in code point order. Non-empty exactly when `status` is `partial`. */
  failed_members: CliMemberFailure[];
}

/** One archive member and its digest. */
model CliMemberDigest {
  /** The member's archive path. */
  path: ArchivePath;

  /** Its uncompressed size in bytes. */
  bytes: ByteCount;

  /** SHA-256 of its uncompressed bytes. */
  sha256: Sha256Hex;
}

/** One member the generator writes with a schema, and that schema's id. */
model CliVersionMemberSchema {
  /** The member's archive path, for example `projections/stackup.json`. */
  path: ArchivePath;

  /** The schema id the member's content follows, for example `prism.stackup.a0`. */
  schema: SchemaId;
}

// --------------------------------------------------------------------- roots

/** KiCad's current `(version N)` per source format, declared in code point order. */
model CliKicadFileFormats {
  /** `.kicad_pcb`, for example `20260206`. */
  @minValue(20000000)
  @maxValue(99991231)
  board: safeint;

  /** `.kicad_sch`, for example `20260306`. */
  @minValue(20000000)
  @maxValue(99991231)
  schematic: safeint;
}

/**
 * The generator id: the stdout of `prism-kicad version`. It states everything
 * that decides the bytes of a bundle besides the sources (ADR §5), and is
 * bumped explicitly, never derived from binary or source bytes.
 *
 * Fields are declared in canonical order: `schema` first, then the other keys
 * in code point order, which is also the order inside every nested object.
 * The canonical bytes (cli-spec.md §5.1) are that compact serialization; the
 * generator digest and the bundle key are SHA-256 over them.
 */
@jsonSchema
@id("urn:prism:schema:prism.cli.version:a0")
@extension("title", "prism-kicad version a0")
model CliVersionA0 {
  /** Document schema id. */
  schema: "prism.cli.version.a0";

  /**
   * Version of the `prism-kicad-cli` crate. Bumped whenever any member's
   * bytes or any recorded stage outcome could change for the same inputs:
   * the core, a projection producer, the manifest or archive writer, or the
   * GLB canonicalization (cli-spec.md §5.1.2).
   */
  crate_version: CliReleaseVersion;

  /** Version of the parser core crate (`ENGINE_VERSION`, the fork's `kicad-monkey-core`, `prism-kicad-core` after WP-F2). */
  engine_version: CliReleaseVersion;

  /**
   * The current file formats of `kicad_version`: the `(version N)` KiCad
   * writes. Sources older than them are upgraded before stage `parse`
   * (cli-spec.md §9.4), and the parser reads only these formats, so they
   * decide every parsed member's bytes. Raised with `kicad_version`.
   */
  kicad_file_formats: CliKicadFileFormats;

  /**
   * KiCad version of the KiCad-produced members (the refilled board and
   * `components.glb`), exactly as `kicad-cli version` prints it. It also
   * pins KiCad's stock 3D model library. `--refill-tool` and
   * `--models-tool` must have its major.minor; patch releases are tolerated.
   */
  kicad_version: CliReleaseVersion;

  /**
   * Every member this generator writes with a schema (`bundle.json`,
   * `design.json`, the materialization and every projection) and its schema
   * id, sorted by `path` in code point order.
   */
  @minItems(1)
  member_schemas: CliVersionMemberSchema[];

  /** The procedure the backend must use to produce `--models-glb`. */
  models_procedure: CliModelsProcedure;

  /** Format version of the packed materialization encoding (`PACK_FORMAT_VERSION` of the materialization-pack crate), which the materialization schema id does not pin. */
  pack_format_version: uint16;

  /** The procedure the backend must use to produce `--refilled-board`. */
  refill_procedure: CliRefillProcedure;

  /** The procedure the backend must use to upgrade sources older than `kicad_version`'s file format before stage `parse` (cli-spec.md §9.4). */
  upgrade_procedure: CliUpgradeProcedure;
}

/**
 * One stderr line. stderr is JSON Lines: every line is one compact
 * CliDiagnosticA0 followed by LF, in the order the findings happen. It is a
 * log for people and the job log; callers never take control decisions from
 * it, only from the exit code and stdout.
 */
@jsonSchema
@id("urn:prism:schema:prism.cli.diagnostic:a0")
@extension("title", "prism-kicad diagnostic a0")
model CliDiagnosticA0 {
  /** Document schema id. */
  schema: "prism.cli.diagnostic.a0";

  /** How serious the finding is. */
  severity: CliSeverity;

  /** Stable code (cli-spec.md §8). */
  code: DiagnosticCode;

  /** One-sentence explanation for people, at most 4096 bytes. It never contains a host path. */
  @minLength(1)
  message: string;

  /** The `bundle build` stage the finding belongs to. Absent for other commands and for findings outside a stage (argument parsing). */
  stage?: CliBuildStage;

  /** The command-line argument the finding is about, when it is about one. */
  argument?: CliArgument;

  /** Where the finding is, when known. */
  location?: CliLocation;

  /** The limit that was hit, for `limit-exceeded` and `diagnostics-truncated`. */
  limit?: CliLimitHit;
}

/**
 * stdout of a command that failed with exit code 1 to 7 (cli-spec.md §4).
 * When it is written, the command wrote nothing else: `-o` is unchanged.
 */
@jsonSchema
@id("urn:prism:schema:prism.cli.error:a0")
@extension("title", "prism-kicad error a0")
model CliErrorA0 {
  /** Document schema id. */
  schema: "prism.cli.error.a0";

  /** Why the command failed; equivalent to the exit code. */
  category: CliErrorCategory;

  /** Stable code (cli-spec.md §8). */
  code: DiagnosticCode;

  /** One-sentence explanation for people, at most 4096 bytes. It never contains a host path. */
  @minLength(1)
  message: string;

  /** The `bundle build` stage that was running. Absent for other commands and for failures before a stage starts. */
  stage?: CliBuildStage;

  /** The command-line argument the failure is about, when it is about one. */
  argument?: CliArgument;

  /** Where the failure is, when known. */
  location?: CliLocation;

  /** The limit that was hit. Present exactly when `category` is `resource-limit` or `timeout`. */
  limit?: CliLimitHit;
}

/**
 * stdout of `bundle build` when it wrote `-o`: exit 0 when the stage ended
 * `complete`, exit 9 when it ended `failed` or `partial`. In both cases the
 * outcome is recorded in the written bundle.
 */
@jsonSchema
@id("urn:prism:schema:prism.cli.build_result:a0")
@extension("title", "prism-kicad bundle build result a0")
model CliBuildResultA0 {
  /** Document schema id. */
  schema: "prism.cli.build_result.a0";

  /** The stage this invocation ran. */
  stage: CliBuildStage;

  /**
   * Every stage's state in the written bundle, exactly as its manifest
   * records it, in stage order: `parse`, `board`, `models`.
   */
  @minItems(3)
  @maxItems(3)
  stages: CliStageState[];

  /** Size of the written archive file in bytes. */
  archive_bytes: ByteCount;

  /** SHA-256 of the written archive file. */
  archive_sha256: Sha256Hex;

  /**
   * The members whose bytes this invocation wrote, sorted by `path` in code
   * point order: every member for stage `parse`; `bundle.json` and the
   * stage's own members for a later stage. Members copied unchanged from
   * `--in` are not listed.
   */
  @minItems(1)
  written_members: CliMemberDigest[];

  /** The warnings this stage added to the manifest, in the order the manifest lists them. */
  warnings: Warning[];
}

/** stdout of `bundle verify`: exit 0 when `status` is `valid`, exit 8 when it is `invalid`. */
@jsonSchema
@id("urn:prism:schema:prism.cli.verify_report:a0")
@extension("title", "prism-kicad bundle verify report a0")
model CliVerifyReportA0 {
  /** Document schema id. */
  schema: "prism.cli.verify_report.a0";

  /** Whether the bundle passed every check. */
  status: CliVerifyStatus;

  /** The `schema` that `bundle.json` declares, when `bundle.json` could be read and declares a well-formed schema id. */
  manifest_schema?: SchemaId;

  /** Whether the manifest's generator id equals this binary's, byte for byte in canonical form. Absent when the manifest could not be read as `prism.bundle.manifest.a3`. A bundle of another generator can be valid. */
  generator_matches?: boolean;

  /** Every stage's state as the manifest records it, in stage order (`parse`, `board`, `models`); empty when the manifest could not be read. */
  stages: CliStageState[];

  /** How many members' sizes and SHA-256 digests were checked against the manifest. */
  members_checked: Count;

  /**
   * Every failed check, sorted by `location.path` in code point order
   * (findings without a path first), then by `code`, then by `message`.
   * Empty exactly when `status` is `valid`. At most `max-findings` entries
   * plus one `findings-truncated`.
   */
  findings: CliFinding[];
}

/** The condition of `bundle reuse` that failed first (cli-spec.md §5.10, ADR amendment K2 §3.3). */
enum CliReuseCondition {
  /** The key's effective configuration digest differs from the bundle's. */
  config,

  /** The bundle's generator is not this binary's. */
  generator,

  /** The bundle's stage parse recorded `model-unavailable`, so it depends on which objects a worker could fetch. */
  `model-unavailable`,

  /** A source member's entry (path, kind, object id) is not in the key, or a submodule it lies in records another commit. */
  read,

  /** A probe's path is selected in the key when the probe found it absent, or the reverse. */
  probe,

  /** A listing evaluated on the key returns other paths. */
  listing,

  /** A gitlink of the read set is absent from the key or records another commit. */
  gitlink,
}

/** Why a read set does not hold. */
model CliReuseFailure {
  /** The first condition, in the order of this enum, that failed. */
  condition: CliReuseCondition;

  /** The repository path the condition failed on, the first in code point order; absent for `config`, `generator` and `model-unavailable`. */
  path?: RepoPath;

  /** One sentence for logs. */
  message: string;
}

/** stdout of `bundle reuse` (exit 0 whether or not the read set holds; cli-spec.md §5.10). */
@jsonSchema
@id("urn:prism:schema:prism.cli.reuse_result:a0")
@extension("title", "prism-kicad bundle reuse result a0")
model CliReuseResultA0 {
  /** Document schema id. */
  schema: "prism.cli.reuse_result.a0";

  /** Whether the bundle serves the key: every condition of cli-spec.md §5.10 holds. */
  holds: boolean;

  /** The bundle's own key, `bundle_key` of its manifest: what the backend's alias row points to. */
  bundle_key: Sha256Hex;

  /** The revision key asked about, `revision_key` of the `--key-record`. */
  revision_key: Sha256Hex;

  /** The first failing condition. Present exactly when `holds` is false. */
  failure?: CliReuseFailure;
}

/** stdout of `bundle extract` (exit 0). */
@jsonSchema
@id("urn:prism:schema:prism.cli.extract_result:a0")
@extension("title", "prism-kicad bundle extract result a0")
model CliExtractResultA0 {
  /** Document schema id. */
  schema: "prism.cli.extract_result.a0";

  /**
   * Every member extracted, which is every member the `<member>` arguments
   * selected, sorted by `path` in code point order. Each was written to
   * `<output>/<path>` and its size and SHA-256 checked against the manifest.
   */
  @minItems(1)
  members: CliMemberDigest[];
}

/**
 * stdout of `revision-key` and of `bundle build --stage parse` when the
 * project is absent at this revision: its anchor, the project file, is not
 * in the tree (exit 10, cli-spec.md §4). This is an outcome, not a failure
 * (conventions.md §8): the revision has no such project, so it has no
 * revision key and no bundle, nothing is retried, and consumers show "not
 * present at this revision". Nothing is written to `-o`.
 */
@jsonSchema
@id("urn:prism:schema:prism.cli.project_absent:a0")
@extension("title", "prism-kicad project absent a0")
model CliProjectAbsentA0 {
  /** Document schema id. */
  schema: "prism.cli.project_absent.a0";

  /** Stable code of the outcome (cli-spec.md §8), equivalent to exit 10. */
  code: "project-absent";

  /** The command that found the project absent. */
  command: CliProjectAbsentCommand;

  /** The absent anchor, repository-relative: `--project` of `revision-key`, or `<project.kicad_pro>` of `bundle build` relative to the source root. */
  project_file: RepoPath;

  /** The full commit id the revision resolved to, for `revision-key --commit`. Absent for `--worktree` and for `bundle build`. */
  commit?: GitObjectId;
}

/** One side of a `compare` (cli-spec.md §5.6). */
model CliCompareSide {
  /** The side's revision key: the bundle manifest's, or `--<side>-revision-key` for a source tree (amendment C2r §3). */
  revision_key: Sha256Hex;

  /** The bundle key of the side's bundle (cli-spec.md §5.1.4), computed from its manifest's revision key and generator id. Absent for a source tree. */
  bundle_key?: Sha256Hex;

  /** How many objects the side's `projections/board-objects.json` holds, review-only objects included: today's `objects`. */
  objects: Count;
}

/** The object diff's counts of a `compare`: the board-objects objects added, removed, modified, unchanged and ignored. */
model CliCompareCounts {
  /** Objects only in `--head`. */
  added: Count;

  /** Objects only in `--base`. */
  removed: Count;

  /** Objects in both whose content differs. */
  modified: Count;

  /** Objects in both with equal content, the ignored ones included. */
  unchanged: Count;

  /** Objects matched across a UUID change or with only generated content changed. */
  ignored: Count;

  /** Objects in `--base`. */
  base_objects: Count;

  /** Objects in `--head`. */
  head_objects: Count;
}

/**
 * stdout of `compare` (exit 0), written after `-o` holds the
 * `CompareObjectDeltaA0` document (cli-spec.md §5.6).
 */
@jsonSchema
@id("urn:prism:schema:prism.cli.compare_result:a0")
@extension("title", "prism-kicad compare result a0")
model CliCompareResultA0 {
  /** Document schema id. */
  schema: "prism.cli.compare_result.a0";

  /** The `--base` side. */
  base: CliCompareSide;

  /** The `--head` side. */
  head: CliCompareSide;

  /** The object diff's counts. */
  counts: CliCompareCounts;
}

// ----------------------------------------------------------- artwork (§5.7)

/** One rendered artwork view and what it drew. */
model CliArtworkView {
  /** The view's name, as the `ArtworkConfigA0` gives it and `--view` names it. */
  name: string;

  /** The SVG's path relative to the output directory, `<view>.svg`. */
  file: ArchivePath;

  /** SHA-256 of the SVG file's bytes. */
  sha256: Sha256Hex;

  /** How many footprints the view drew a body region for. */
  footprints_drawn: Count;

  /** How many reference designators the view placed. */
  designators_placed: Count;

  /**
   * Every footprint the view has no body outline for, `<RepoPath>#<KiCadUuid>`,
   * sorted in code point order: the footprints drawn from the hole envelope or
   * the pad envelope instead, or with no body region at all.
   */
  footprints_without_outline: ObjectRef[];
}

/** stdout of `artwork` (exit 0). */
@jsonSchema
@id("urn:prism:schema:prism.cli.artwork_result:a0")
@extension("title", "prism-kicad artwork result a0")
model CliArtworkResultA0 {
  /** Document schema id. */
  schema: "prism.cli.artwork_result.a0";

  /** One entry per rendered view, sorted by `name` in code point order. */
  views: CliArtworkView[];
}

// ------------------------------------------------------------ vendor (§5.8)

/** What a vendor output file holds. */
enum CliVendorOutputKind {
  /** A bill of materials: the components to place. */
  bom,

  /** A pick-and-place list: where each component goes. */
  cpl,
}

/** The file format of a vendor output. */
enum CliVendorOutputFormat {
  /** Comma-separated values. */
  csv,

  /** An Office Open XML spreadsheet. */
  xlsx,
}

/** One file a vendor writes: its kind, format and format version. */
model CliVendorOutput {
  /** What the file holds. */
  kind: CliVendorOutputKind;

  /** The file's format. */
  format: CliVendorOutputFormat;

  /** The format's version, raised when the file's layout changes (cli-spec.md §5.8). */
  version: CliReleaseVersion;
}

/** One registered vendor and its outputs. */
model CliVendor {
  /** The vendor's id, the `<vendor-id>` of `vendor run` (`jlcpcb`). */
  id: string;

  /** The vendor's human name. */
  name: string;

  /** The files the vendor writes, sorted by `kind`, then `format`, each in code point order. */
  outputs: CliVendorOutput[];

  /** The schema id of the vendor's configuration, for example `prism.vendor.jlcpcb.config.a0`. */
  config_schema: SchemaId;
}

/** stdout of `vendor list` (exit 0). */
@jsonSchema
@id("urn:prism:schema:prism.cli.vendor_list:a0")
@extension("title", "prism-kicad vendor list a0")
model CliVendorListA0 {
  /** Document schema id. */
  schema: "prism.cli.vendor_list.a0";

  /** Every registered vendor, sorted by `id` in code point order. */
  vendors: CliVendor[];
}

/** One file a vendor run wrote. */
model CliVendorFile {
  /** The file's path relative to the output directory. */
  path: ArchivePath;

  /** SHA-256 of the file's bytes. */
  sha256: Sha256Hex;
}

/** One component a vendor run left out of an output, and why. */
model CliVendorExcludedComponent {
  /** The component's identity, `<RepoPath>#<KiCadUuid>`. */
  key: ObjectRef;

  /** Its reference designator, as written. Absent when it has none or it is empty. */
  reference?: Refdes;

  /** Stable reason code, for example `excluded-from-bom` or `excluded-from-position`. */
  code: DiagnosticCode;

  /** One-sentence explanation for people. It never contains a host path. */
  @minLength(1)
  message: string;
}

/** stdout of `vendor run` (exit 0). */
@jsonSchema
@id("urn:prism:schema:prism.cli.vendor_run_result:a0")
@extension("title", "prism-kicad vendor run result a0")
model CliVendorRunResultA0 {
  /** Document schema id. */
  schema: "prism.cli.vendor_run_result.a0";

  /** The vendor that ran, its id (`jlcpcb`). */
  vendor: string;

  /** Every file the run wrote, sorted by `path` in code point order. */
  files: CliVendorFile[];

  /**
   * How many rows each of the vendor's tables holds; the keys are the vendor's
   * table names, for example `bom` and `cpl`, serialized in code point order.
   */
  rows: Record<Count>;

  /** Every component the run left out, sorted by `key` in code point order. */
  excluded: CliVendorExcludedComponent[];
}

// ---------------------------------------------- stroke text and sheet (§5.9)

/** A point in millimetres, `[x, y]` in that order, as the renderer returns it. */
@minItems(2)
@maxItems(2)
model CliMmPoint is float64[];

/** One polyline in millimetres: its points in stroke order. */
model CliMmPolyline is CliMmPoint[];

/** One rendered text run. */
model CliStrokeTextRun {
  /** The run's polylines in millimetres, in the order the renderer returns them; each polyline is one stroke. */
  polylines_mm: CliMmPolyline[];

  /** The run's advance width in millimetres: `_calculate_text_width(text) × size_mm`. */
  advance_mm: float64;

  /**
   * The code points the NewStroke font has no glyph for, so the run drew them
   * as nothing (`fonts.unsupported_codepoints`), in ascending numeric order.
   * Empty when every code point is present.
   */
  missing_codepoints: Count[];
}

/** stdout of `stroke-text --request` (exit 0). */
@jsonSchema
@id("urn:prism:schema:prism.cli.stroke_text_result:a0")
@extension("title", "prism-kicad stroke-text result a0")
model CliStrokeTextResultA0 {
  /** Document schema id. */
  schema: "prism.cli.stroke_text_result.a0";

  /** One entry per run of the request, in the request's run order. */
  runs: CliStrokeTextRun[];
}

/**
 * stdout of `stroke-text --metrics` (exit 0): the NewStroke advance table, so
 * layout can measure text without a process per string.
 *
 * The advance of a string in the renderer's normalized units is the sum, left
 * to right over the string's Unicode scalar values, of each value below, added
 * as IEEE-754 doubles; the width in millimetres is that sum times the run's
 * nominal size. A U+0020 space contributes `space_width`; any other code point
 * contributes `advances[<decimal code point>]` when present and `0` when
 * absent (the renderer skips a code point it has no glyph for). This
 * reproduces kicad_monkey 2026.9.7's
 * `KiCadStrokeFontRenderer._calculate_text_width` exactly.
 *
 * For text containing KiCad markup (`~{}`, `^{}`, `_{}`), the plain-text
 * contributions inside a `^{}` or `_{}` span are multiplied by
 * `super_sub_size_multiplier`; a `~{}` span's are not (kicad_monkey's
 * `_markup_nodes_width` with `styled` false).
 */
@jsonSchema
@id("urn:prism:schema:prism.cli.stroke_font_metrics:a0")
@extension("title", "prism-kicad stroke font metrics a0")
model CliStrokeFontMetricsA0 {
  /** Document schema id. */
  schema: "prism.cli.stroke_font_metrics.a0";

  /** The advance of one U+0020 space, in the renderer's normalized units. */
  space_width: float64;

  /** The scale a `^{}`/`_{}` span's glyphs are measured and drawn at (`0.8`). */
  super_sub_size_multiplier: float64;

  /**
   * The per-glyph advance table: the keys are the decimal Unicode code points
   * `"32"` to `"11263"` that the font has a glyph for, serialized in code
   * point order, and each value is that glyph's advance in the renderer's
   * normalized units (U+0020 included; the formula uses `space_width` for it).
   */
  advances: Record<float64>;
}

/** Horizontal alignment of a drawn text run, KiCad's spelling. */
enum CliDrawingSheetHAlign {
  /** `GR_TEXT_H_ALIGN_LEFT`. */
  left: "GR_TEXT_H_ALIGN_LEFT",

  /** `GR_TEXT_H_ALIGN_CENTER`. */
  center: "GR_TEXT_H_ALIGN_CENTER",

  /** `GR_TEXT_H_ALIGN_RIGHT`. */
  right: "GR_TEXT_H_ALIGN_RIGHT",
}

/** Vertical alignment of a drawn text run, KiCad's spelling. */
enum CliDrawingSheetVAlign {
  /** `GR_TEXT_V_ALIGN_TOP`. */
  top: "GR_TEXT_V_ALIGN_TOP",

  /** `GR_TEXT_V_ALIGN_CENTER`. */
  center: "GR_TEXT_V_ALIGN_CENTER",

  /** `GR_TEXT_V_ALIGN_BOTTOM`. */
  bottom: "GR_TEXT_V_ALIGN_BOTTOM",
}

/** How a drawn polygon or rectangle is filled, KiCad's spelling. */
enum CliDrawingSheetFill {
  /** `NO_FILL`. */
  noFill: "NO_FILL",

  /** `FILLED_SHAPE`. */
  filledShape: "FILLED_SHAPE",

  /** `FILLED_WITH_BG_BODYCOLOR`. */
  filledWithBgBodyColor: "FILLED_WITH_BG_BODYCOLOR",
}

/** A point in nanometres in KiCad's board frame (+x right, +y down). */
model CliPointNm {
  /** X coordinate in nanometres. */
  x_nm: Nanometres;

  /** Y coordinate in nanometres. */
  y_nm: Nanometres;
}

/**
 * One drawn polyline. A polyline of exactly two points is a line
 * (`worksheet.py:84-92`).
 */
model CliDrawingSheetPoly {
  /** Variant tag: a polyline. */
  kind: "poly";

  /** The polyline's vertices, in draw order, board frame. */
  points: CliPointNm[];

  /** How the shape is filled, KiCad's token. */
  fill: CliDrawingSheetFill;

  /** Stroke width in nanometres. */
  width_nm: NonNegativeNanometres;

  /** Stroke colour, `#RRGGBB` or `#RRGGBBAA`. */
  stroke_color: string;
}

/** One drawn rectangle. */
model CliDrawingSheetRect {
  /** Variant tag: a rectangle. */
  kind: "rect";

  /** X of the first corner in nanometres. */
  x1_nm: Nanometres;

  /** Y of the first corner in nanometres. */
  y1_nm: Nanometres;

  /** X of the opposite corner in nanometres. */
  x2_nm: Nanometres;

  /** Y of the opposite corner in nanometres. */
  y2_nm: Nanometres;

  /** Corner radius in nanometres. */
  corner_radius_nm: NonNegativeNanometres;

  /** How the shape is filled, KiCad's token. */
  fill: CliDrawingSheetFill;

  /** Stroke width in nanometres. */
  width_nm: NonNegativeNanometres;

  /** Stroke colour, `#RRGGBB` or `#RRGGBBAA`. */
  stroke_color: string;
}

/**
 * One drawn text run. Its glyph geometry is `stroke-text`'s: draw the run's
 * `text` at (`x_nm`, `y_nm`) with the NewStroke polylines of a
 * `StrokeTextRequestA0` run whose size is `size_x_nm`/1e6 mm, aligned by
 * `h_align`/`v_align`.
 */
model CliDrawingSheetText {
  /** Variant tag: a text run. */
  kind: "text";

  /** X of the run's alignment point in nanometres. */
  x_nm: Nanometres;

  /** Y of the run's alignment point in nanometres. */
  y_nm: Nanometres;

  /** The run's text, exactly as it is to be drawn. */
  text: string;

  /** Text colour, `#RRGGBB` or `#RRGGBBAA`. */
  color: string;

  /** Rotation in degrees as written, 0 for the default sheet's horizontal text. */
  orient_deg: Degrees;

  /** Nominal width of one glyph in nanometres. */
  size_x_nm: NonNegativeNanometres;

  /** Nominal height of one glyph in nanometres. */
  size_y_nm: NonNegativeNanometres;

  /** Pen width in nanometres. */
  pen_width_nm: NonNegativeNanometres;

  /** Horizontal alignment about `x_nm`, KiCad's spelling. */
  h_align: CliDrawingSheetHAlign;

  /** Vertical alignment about `y_nm`, KiCad's spelling. */
  v_align: CliDrawingSheetVAlign;

  /** True when the text is italic. */
  italic: boolean;

  /** True when the text is bold. */
  bold: boolean;

  /** True when the text may span several lines. */
  multiline: boolean;

  /** The text's font face, for example `Arial`. */
  font_face: string;
}

/** One operation of the default drawing sheet, discriminated by `kind`. */
@oneOf
union CliDrawingSheetOp {
  /** A polyline. */
  poly: CliDrawingSheetPoly,

  /** A rectangle. */
  rect: CliDrawingSheetRect,

  /** A text run. */
  text: CliDrawingSheetText,
}

/** stdout of `drawing-sheet` (exit 0): the default worksheet's draw operations. */
@jsonSchema
@id("urn:prism:schema:prism.cli.drawing_sheet_result:a0")
@extension("title", "prism-kicad drawing-sheet result a0")
model CliDrawingSheetResultA0 {
  /** Document schema id. */
  schema: "prism.cli.drawing_sheet_result.a0";

  /**
   * The draw operations, in the order `drawing_sheet_to_ops` returns them: the
   * default worksheet's on-disk element order, with every repeat expanded in
   * place. The frame's rectangles, lines and title-block text therefore
   * interleave as the worksheet file lists them, not grouped by kind.
   */
  ops: CliDrawingSheetOp[];
}
