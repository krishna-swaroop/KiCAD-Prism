import "@typespec/json-schema";
import "./common.tsp";
import "./revision-key-a1.tsp";
import "./cli-a0.tsp";

using TypeSpec.JsonSchema;
using Prism.Contracts.Common;

/**
 * `prism.bundle.manifest.a3`: `bundle.json`, the first member of a `.prism`
 * design bundle (ADR §4.4, §5, §6). Successor of sim's `prism.bundle.manifest`
 * a1 (sim: `contracts/contracts/bundle.tsp`). The archive rules (member
 * order, compression, timestamps, limits, atomic stage rewrites, the
 * unpacked cache, readiness and reader validation) are in
 * `bundle-format.md`; the a1 → a2 mapping and the a2 → a3 change are in
 * `field-maps/bundle-manifest.md`. a3 adds `read_set` (ADR amendment K2
 * §3.4): with the source members, it is everything stage parse read, so a
 * stored bundle can serve every revision key whose tree leaves it unchanged.
 */
namespace Prism.Contracts.BundleManifestA3;

// ------------------------------------------------------------------ scalars

/**
 * Id of a board inside a bundle, used by Simulation Studio in every
 * reference (`board_id:refdes.pad`, `board_id:net`). The pattern is a1's
 * `Slug` (sim: `contracts/contracts/common.tsp:7-9`). A bundle holds one
 * board and a2 producers always write `main` (sim:
 * `src/prism-bundle/src/build.rs:34`).
 */
@pattern("^[a-z0-9][a-z0-9._-]{0,79}$")
scalar BundleManifestBoardId extends string;

// -------------------------------------------------------------------- enums

/**
 * What a member is. Every member has exactly one role, and the role fixes
 * the stage that writes it and the form of its archive path
 * (`bundle-format.md` §2). A source member's role is its category in the
 * revision key's source selection (`RevisionKeySourceCategory`,
 * revision-key-a1.tsp), mapped one to one as listed below. Files inside an
 * expanded gitlink take the role the same rules give their name. Symlinks and
 * gitlinks themselves are never members (cli-spec.md §9.1).
 */
enum BundleManifestMemberRole {
  /** A `.kicad_pro` file (category `kicad-project`); `config.project_file` is one of them. Stage parse, path `sources/<repo path>`. a1 role, unchanged. */
  sourceProject: "source-project",

  /** A `.kicad_sch` file (category `kicad-schematic`). Stage parse, path `sources/<repo path>`. a1 role, unchanged. */
  sourceSchematic: "source-schematic",

  /** A `.kicad_pcb` file as committed, before any zone refill (category `kicad-board`). Stage parse, path `sources/<repo path>`. a1 role, unchanged. */
  sourceBoard: "source-board",

  /** A `.kicad_dru` custom design-rules file (category `kicad-design-rules`). Stage parse, path `sources/<repo path>`. a1 role, unchanged. */
  sourceDesignRules: "source-design-rules",

  /** A `.kicad_wks` drawing-sheet file (category `kicad-worksheet`). Stage parse, path `sources/<repo path>`. New in a2. */
  sourceWorksheet: "source-worksheet",

  /** A `.kicad_jobset` file (category `kicad-jobset`). Stage parse, path `sources/<repo path>`. New in a2. */
  sourceJobset: "source-jobset",

  /** An `fp-lib-table` or `sym-lib-table` file (category `library-table`). Stage parse, path `sources/<repo path>`. New in a2. */
  sourceLibraryTable: "source-library-table",

  /** A symbol library: `.kicad_sym`, or a legacy `.lib` or `.dcm` (category `symbol-library`). Stage parse, path `sources/<repo path>`. New in a2. */
  sourceSymbolLibrary: "source-symbol-library",

  /** A `.kicad_mod` footprint (category `footprint`). Stage parse, path `sources/<repo path>`. New in a2. */
  sourceFootprint: "source-footprint",

  /** A 3D model file (category `model-3d`), Git LFS content hydrated. Stage parse, path `sources/<repo path>`. New in a2. */
  source3dModel: "source-3d-model",

  /** A `.prism.json` Prism settings file as committed (category `prism-settings`, `project_revision.py:178`). Stage parse, path `sources/<repo path>`. New in a2. */
  sourcePrismSettings: "source-prism-settings",

  /** `design.json`, the `kicad_monkey.design.a0` design model. Stage parse. a1 role, unchanged. */
  design: "design",

  /** A Prism projection, `projections/<name>.json` (ADR §6). Stage parse. New in a2. */
  projectionDocument: "projection",

  /** `refilled/<board file name>`: the board `config.board` names, after the backend's zone refill. Stage board; absent when `config.zone_fills` is `saved`. a1 role, unchanged. */
  refilledBoard: "refilled-board",

  /** `materialization/board.kmpack`: the analytic board in the materializer's packed encoding. Stage board. a1 role, unchanged. */
  materialization: "materialization",

  /** `viewer/models/components.glb`: component bodies exported by `kicad-cli pcb export glb --no-board-body`, timestamp normalized. Stage models. New in a2. */
  componentModels: "component-models",
}

/** A stage of the design-bundle job (ADR §4.4), in pipeline order. Each stage runs only after the one before it (`bundle-format.md` §3). */
enum BundleManifestStage {
  /** Sources, `design.json` and every projection: one parse of the revision. */
  parse,

  /** The refilled board (or the saved board, with `config.zone_fills` `saved`), the materialization and the cross-check. Runs when stage parse is `complete` or `partial`. */
  board,

  /** `viewer/models/components.glb`. Runs when stage board is `complete`. */
  models,
}

/**
 * Where a stage stands in this archive. `pending` is the only non-final
 * value. Once a stage of a stored bundle is final, its record and its members
 * never change for that bundle key: the backend never re-runs a final stage
 * (the CLI could, and would rebuild the same bytes, cli-spec.md §5.2.1).
 * `bundle-format.md` §3.1 lists which statuses each stage can reach.
 */
enum BundleManifestStageStatus {
  /** Not run yet. None of the stage's members is present. A later atomic rewrite of the archive makes the stage final. Never the status of stage parse. */
  pending,

  /** Ran to the end and wrote every member that applies to this project. */
  complete,

  /** Ran to the end, but the producer of at least one member that applies failed on this project's content; `failed_members` lists each one, and every other member is present. */
  partial,

  /** Stopped on a content error of the design, given in `error` (cli-spec.md §5.2.7). No member of the stage is present, except the source members of stage parse. */
  failed,

  /** Never runs for this bundle key, for the reason in `skip_reason`. No member of the stage is present. Never the status of stage parse. */
  skipped,
}

/** Why a stage is skipped. The values are the CLI's `CliSkipReason` (`cli-a0.tsp`). */
enum BundleManifestSkipReason {
  /** The project has no board (`config.board` is absent), so there is nothing to refill, materialize or export. */
  noBoard: "no-board",

  /** The stage before it did not allow it to run: stage parse is `failed` (for board), or stage board is not `complete` (for models). Takes precedence over `no-board`. */
  earlierStageFailed: "earlier-stage-failed",
}

/** Overall result of the cross-check. a1 values, unchanged (sim: `src/prism-bundle/src/crosscheck.rs:143-155`). */
enum BundleManifestCrossCheckStatus {
  /** Nothing was found: `warnings` and `errors` are empty. Engines accept the bundle. */
  passed,

  /** Only warnings were found: `warnings` is non-empty and `errors` is empty. Engines accept the bundle. */
  passedWithWarnings: "passed-with-warnings",

  /** An engine would join a pad to the wrong pin or net: `errors` is non-empty. Engines refuse the bundle. */
  failed,

  /** Nothing was compared because `design.json` is not a member (the project has no root schematic, or `design.json` is in `stages.parse.failed_members`). Every count is 0 and every array is empty. Engines refuse the bundle. */
  skipped,
}

/** Why the cross-check accepted two different net names as one net (sim: `src/prism-bundle/src/crosscheck.rs:29-42`). */
enum BundleManifestCrossCheckMappingKind {
  /** KiCad names a one-pin net `unconnected-(…)` on the board while the netlister names it `Net-(…)`; both sides hold exactly that one pin. */
  singlePinNetName: "single-pin-net-name",

  /** The board and the schematic name a net differently but it joins exactly the same pins on both sides; the board's name is used. */
  samePinsNetName: "same-pins-net-name",

  /** The netlister splits one board net into several, each joining only pins of that board net; every pad keeps its board net. */
  splitNet: "split-net",
}

// ------------------------------------------------------------------- models

/**
 * The revision-key entry a source member comes from (revision-key.md §12,
 * Q3). `sources/**` holds the closure the build read, and each of its
 * members names the key entry that pins its bytes.
 */
model BundleManifestSourceEntry {
  /** The file's repository path: the member's `path` without the leading `sources/`. */
  path: RepoPath;

  /** The entry kind, `regular` or `executable` (symlinks and gitlinks are never members). */
  kind: Prism.Contracts.RevisionKeyA1.RevisionKeyEntryKind;

  /** The blob id git records for the file, in the repository's object format. For a Git LFS file it is the committed pointer's blob id, as in the key, while the member holds the hydrated bytes. */
  object_id: GitObjectId;

  /**
   * For a file inside a submodule: the path of the key's gitlink entry that
   * pins it, and `object_id` is the file's blob id in the commit that gitlink
   * records. Absent otherwise, and then `path`, `kind` and `object_id` equal
   * one entry of the key (`RevisionKeyRecordA1.entries`).
   */
  gitlink?: RepoPath;

  /**
   * The `(version …)` of the committed file when K upgraded it to the worker
   * KiCad's format before stage parse (bundle-format.md §2.2): the member
   * then holds KiCad's upgrade of the blob `object_id` names. Absent when the
   * file was used as committed.
   */
  upgraded_from_version?: safeint;
}

/**
 * A suffix a listing selected by, as the revision key's name rules write
 * one: a lowercase ASCII name ending that starts with `.` (revision-key.md
 * §5.2).
 */
@pattern("^\\.[a-z0-9._-]{1,63}$")
scalar BundleManifestListingSuffix extends string;

/**
 * A path stage parse asked about without reading it: a `read` that found no
 * such file in the source set, or an existence test (ADR amendment K2 §3.1).
 */
model BundleManifestProbe {
  /** The repository path asked about. */
  path: RepoPath;

  /** Whether the path was in the source set. */
  present: boolean;
}

/**
 * One directory listing stage parse made: the source-set paths under
 * `directory`, at any depth, whose name, lowered in ASCII, ends with one of
 * `suffixes` (any name when `suffixes` is empty).
 */
model BundleManifestListing {
  /** The directory listed: a repository path, or `""` for the repository root. A path is under it when it starts with `directory` + `/`. */
  directory: RepoPath | "";

  /** The suffixes, sorted in code point order, without duplicates; empty for every name. */
  suffixes: BundleManifestListingSuffix[];

  /** The paths the listing returned, sorted in code point order. */
  paths: RepoPath[];
}

/**
 * A submodule stage parse looked into: a source member inside it, or a probe
 * or listing that reaches into it. Its commit pins every file below it, so
 * the read set holds below `path` exactly when the commit is the same.
 */
model BundleManifestGitlink {
  /** The gitlink entry's repository path. */
  path: RepoPath;

  /** The commit the gitlink records, as in the revision key's entry. */
  commit: GitObjectId;
}

/**
 * What stage parse looked at besides the files it read, which are the
 * source members (ADR amendment K2 §3.3–§3.4). A stored bundle serves another
 * revision key of the same project, configuration and generator when every
 * source member's key entry, every probe and every listing is the same in
 * that key's tree (`prism-kicad bundle reuse`, cli-spec.md §5.10). Written at
 * the end of stage parse and copied unchanged by later stages.
 */
model BundleManifestReadSet {
  /** Every probe, sorted by `path` in code point order, without duplicates. */
  probes: BundleManifestProbe[];

  /** Every listing, sorted by `directory`, then by `suffixes` (compared element by element), without duplicates. */
  listings: BundleManifestListing[];
  /** Every gitlink a source member, probe or listing reached into, sorted by `path`, without duplicates. */
  gitlinks: BundleManifestGitlink[];
}

/** One archive member other than `bundle.json` itself, which is never listed and never hashed by the manifest. */
model BundleManifestMember {
  /** Archive path, unique within the bundle. Its form is fixed by `role` (`bundle-format.md` §2). */
  path: ArchivePath;

  /** What the member is. */
  role: BundleManifestMemberRole;

  /** The stage that wrote the member: always the stage of its role. */
  stage: BundleManifestStage;

  /** SHA-256 of the member's uncompressed bytes. */
  sha256: Sha256Hex;

  /** Size of the member's uncompressed bytes. */
  bytes: ByteCount;

  /**
   * Schema id of a structured member: present exactly when `role` is
   * `design`, `materialization` or `projection`, and then equal both to the
   * `schema` value inside the member and to the id `generator.member_schemas`
   * gives for this path (for example `kicad_monkey.design.a0`,
   * `kicad_monkey.materialization.a0`, `prism.stackup.a0`). Absent for every
   * other role. Readers validate a JSON member against the JSON Schema
   * registered under this id, when there is one.
   */
  member_schema?: SchemaId;

  /** The revision-key entry of a source member. Present exactly when `role` is a `source-*` role. */
  source?: BundleManifestSourceEntry;
}

/** A member that applies to this project but whose producer failed on the project's content. */
model BundleManifestMemberFailure {
  /** Archive path the member would have had. It is not in `members`. */
  path: ArchivePath;

  /** Stable code of the failure, for example `projection-failed` (`bundle-format.md` §3.2). */
  code: DiagnosticCode;

  /** One-sentence explanation for people; its wording may change between generators. It never contains a host path. */
  @minLength(1)
  message: string;
}

/**
 * Where the zone fills of the materialized board came from. The value
 * follows `config.zone_fills`, which is in the revision key, so a bundle key
 * has exactly one (cli-spec.md §5.2.3). a1's `fill_provenance` values
 * (sim: `contracts/contracts/bundle.tsp:41-47`), unchanged.
 */
enum BundleManifestFillProvenance {
  /** The backend refilled every zone with `generator.refill_procedure` and `generator.kicad_version`; the board is the `refilled-board` member. The default (`config.zone_fills` absent). */
  refilled,

  /** The project's configuration says `zone_fills: saved`: the board is the `source-board` member as saved, no refill ran, there is no `refilled-board` member and no `fill_check`, and stage board has the warning `saved-fills-used`. */
  saved,
}

/** Saved zone fills compared with a fresh refill. a1 model, unchanged (sim: `src/prism-bundle/src/build.rs:248-268`). */
model BundleManifestFillCheck {
  /** Zone-fill operations materialized from the committed board's saved fills. */
  saved_operations: Count;

  /** Zone-fill operations materialized from the refilled board. */
  refilled_operations: Count;

  /** Zone-fill operations present in one board and not the other. */
  differing_operations: Count;

  /** True exactly when `differing_operations` is not 0; stage board then also has the warning `stale-saved-fills`. */
  stale: boolean;
}

/** Two net names the cross-check accepted as the same net. */
model BundleManifestCrossCheckMapping {
  /** Why the names are accepted as equal. */
  kind: BundleManifestCrossCheckMappingKind;

  /** The net's name in the materialized board. */
  board: NetName;

  /** The net's name in `design.json`. */
  design: NetName;
}

/**
 * The binding table of the materialization checked against `design.json`:
 * reference designators, pad numbers and the net of every pad (sim:
 * `src/prism-bundle/src/crosscheck.rs:1-45`). It never stops the build;
 * `failed` and `skipped` gate simulation only (ref:
 * `backend/app/services/project_bundle.py:149-161`, sim:
 * `src/sim-worker/src/main.rs:101-122`).
 */
model BundleManifestCrossCheck {
  /** Overall result. */
  status: BundleManifestCrossCheckStatus;

  /** Reference designators present on both the board and the design. */
  components_compared: Count;

  /** Pads on a net that were compared with their pins. */
  pads_compared: Count;

  /** Distinct board nets on the compared pads. */
  nets_compared: Count;

  /** Accepted renames, sorted by kind, then board, then design, in code point order; no two entries are equal. */
  mappings: BundleManifestCrossCheckMapping[];

  /** Findings that do not gate simulation (codes `pin-missing-from-board`, `board-only-component`, `board-net-not-in-schematic`, `schematic-net-not-on-board`), sorted by code, then message, in code point order; no two entries are equal. */
  warnings: Warning[];

  /** Findings that gate simulation (codes `component-missing-from-schematic`, `component-missing-from-board`, `pad-missing-from-schematic`, `net-mismatch`), sorted by code, then message, in code point order; no two entries are equal. Non-empty exactly when `status` is `failed`. */
  errors: Warning[];
}

/** Stage parse: the source members, `design.json` and every projection. */
model BundleManifestParseStage {
  /** `complete`, `partial` or `failed`; never `pending` or `skipped`, because an archive is first written at the end of this stage. */
  status: BundleManifestStageStatus;

  /** The content error that stopped the stage, with the source location when known (for example code `source-unparseable` at `sources/<sheet>.kicad_sch`, line and column; codes in cli-spec.md §8). Present exactly when `status` is `failed`. The CLI's build result repeats it verbatim (`CliStageState.error`). */
  error?: Prism.Contracts.CliA0.CliFinding;

  /** Non-fatal findings of the parse and of the projection producers, sorted by code, then message, in code point order; no two entries are equal. */
  warnings: Warning[];

  /** Derived members of the stage (`design.json`, projections) whose producer failed on this project (codes `design-build-failed`, `projection-failed`), sorted by path in code point order. Non-empty exactly when `status` is `partial`. */
  failed_members: BundleManifestMemberFailure[];
}

/** Stage board: the zone refill (unless the config says saved fills), the materialization and the cross-check. */
model BundleManifestBoardStage {
  /** `pending`, `complete`, `partial` (the materializer failed; the refilled board, if any, stays) or `skipped`. */
  status: BundleManifestStageStatus;

  /** Why the stage never runs. Present exactly when `status` is `skipped`. */
  skip_reason?: BundleManifestSkipReason;

  /** The content error that stopped the stage, with its location when known. Present exactly when `status` is `failed`. The CLI's build result repeats it verbatim (`CliStageState.error`). */
  error?: Prism.Contracts.CliA0.CliFinding;

  /** Where the materialized board's zone fills came from: `saved` exactly when `config.zone_fills` is `saved`, else `refilled`. Present exactly when `status` is `complete` or `partial`. */
  fill_provenance?: BundleManifestFillProvenance;

  /** The committed board's saved fills compared with the refill. Present exactly when the `materialization` member is present and `fill_provenance` is `refilled`. A refill is always made by `generator.refill_procedure` with a KiCad of `generator.kicad_version`'s major.minor; with saved fills no refill and no comparison run (cli-spec.md §5.2.3). */
  fill_check?: BundleManifestFillCheck;

  /** The binding table checked against `design.json`. Present exactly when the `materialization` member is present. */
  cross_check?: BundleManifestCrossCheck;

  /** Non-fatal findings of the stage (`stale-saved-fills`, `kicad-default-stackup`, and `saved-fills-used` exactly when `fill_provenance` is `saved`), sorted by code, then message, in code point order; no two entries are equal. The cross-check's own findings are only in `cross_check`. */
  warnings: Warning[];

  /** Members of the stage whose producer failed on this project, sorted by path in code point order; only `materialization/board.kmpack` (code `materialization-failed`) can be listed, and the refilled board, if any, stays. Non-empty exactly when `status` is `partial`. */
  failed_members: BundleManifestMemberFailure[];
}

/** Stage models: the KiCad component GLB. */
model BundleManifestModelsStage {
  /** `pending`, `complete` or `skipped`: the stage only checks, canonicalizes and copies files the backend produced, so it has no content failure in a2 (cli-spec.md §5.2.4). */
  status: BundleManifestStageStatus;

  /** Why the stage never runs. Present exactly when `status` is `skipped`. */
  skip_reason?: BundleManifestSkipReason;

  /** The content error that stopped the stage. Present exactly when `status` is `failed`, which stage models does not reach in a2; present in the model so the three stage records share one shape. */
  error?: Prism.Contracts.CliA0.CliFinding;

  /** Non-fatal findings of the stage, sorted by code, then message, in code point order; no two entries are equal. */
  warnings: Warning[];

  /** Members of the stage whose producer failed on this project, sorted by path in code point order. Always empty in a2 (see `status`); present so all three stage records share `status`, `skip_reason`, `error`, `warnings` and `failed_members`, which K's readiness code reads generically. */
  failed_members: BundleManifestMemberFailure[];
}

/** One record per stage of ADR §4.4. Readers use them to know which members exist, which will come and which never will (`bundle-format.md` §3.3). */
model BundleManifestStages {
  /** Stage parse. */
  parse: BundleManifestParseStage;

  /** Stage board. */
  board: BundleManifestBoardStage;

  /** Stage models. */
  models: BundleManifestModelsStage;
}

/**
 * `bundle.json`: the manifest of one design bundle, the first member of the
 * `.prism` archive and the only one it does not list. It records what was
 * built (generator id, revision key, bundle key, effective configuration),
 * the state of every stage, and the role, stage, schema id, size and SHA-256
 * of every other member. It is rewritten, with
 * the archive, at the end of each stage. It contains no wall-clock time,
 * duration, host path, user or machine name.
 */
@jsonSchema
@id("urn:prism:schema:prism.bundle.manifest:a3")
@extension("title", "Bundle manifest a3")
model BundleManifestA3 {
  /** Schema id of this document. a1 had `schema: "prism.bundle.manifest"` plus `version: "a1"`; a2 added the stages; a3 adds `read_set`. */
  schema: "prism.bundle.manifest.a3";

  /** The generator id: the `prism-kicad version` document, verbatim (ADR §5). Replaces a1's `created_by`, `design`, `materializer` and `kicad_cli_version`. */
  generator: Prism.Contracts.CliA0.CliVersionA0;

  /** The design revision key the bundle was built for (`RevisionKeyRecordA1.revision_key`, ADR §5), as the backend passed it with `--revision-key`; `<revision_key>` in the store path. Absent only for a bundle built without one (local and test builds, cli-spec.md §5.2.2); the backend always passes it. The archive may also serve other revision keys whose tree leaves `read_set` and the source members unchanged, through the backend's alias table (revision-key.md §10, ADR amendment K2 §3.6); this field always names the key it was built for, and a reader takes the revision it asked for from its request, never from here. */
  revision_key?: Sha256Hex;

  /** The bundle key, `SHA-256("prism.bundle_key.a0" 0x00 revision_key 0x00 generator_bytes)` (cli-spec.md §5.1.4). Present exactly when `revision_key` is. Readers check it against the key they asked for. */
  bundle_key?: Sha256Hex;

  /** The effective project configuration the build used: the `--config` document (the one the revision key hashed), or, without `--config`, the default the CLI derived by KiCad's rule (`<stem>.kicad_sch` and `<stem>.kicad_pcb` beside the project file, no excluded directories). Its `project_file`, `root_schematic` and `board` name the files the bundle is about; their members are `sources/` followed by those paths. Replaces a1's `source_board`. */
  config: Prism.Contracts.RevisionKeyA1.RevisionKeyEffectiveConfigA1;

  /** Id of the bundle's one board in Simulation Studio references; always `main`. a1 field, unchanged. */
  board_id: BundleManifestBoardId;

  /** Status and results of each stage. */
  stages: BundleManifestStages;

  /** What stage parse looked at besides the source members (ADR amendment K2 §3.4). */
  read_set: BundleManifestReadSet;

  /** Every member except `bundle.json`, sorted by path in code point order (UTF-8 byte order); the archive's entries follow `bundle.json` in this order. */
  @minItems(1)
  members: BundleManifestMember[];
}
