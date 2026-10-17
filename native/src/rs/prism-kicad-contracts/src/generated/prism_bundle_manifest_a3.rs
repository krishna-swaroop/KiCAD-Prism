/// Error types.
pub mod error {
    /// Error from a `TryFrom` or `FromStr` implementation.
    pub struct ConversionError(::std::borrow::Cow<'static, str>);
    impl ::std::error::Error for ConversionError {}
    impl ::std::fmt::Display for ConversionError {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> Result<(), ::std::fmt::Error> {
            ::std::fmt::Display::fmt(&self.0, f)
        }
    }
    impl ::std::fmt::Debug for ConversionError {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> Result<(), ::std::fmt::Error> {
            ::std::fmt::Debug::fmt(&self.0, f)
        }
    }
    impl From<&'static str> for ConversionError {
        fn from(value: &'static str) -> Self {
            Self(value.into())
        }
    }
    impl From<String> for ConversionError {
        fn from(value: String) -> Self {
            Self(value.into())
        }
    }
}
/**Path of a member inside a `.prism` bundle archive: `/`-separated, relative,
no empty, `.` or `..` segment, no leading or trailing `/`, no backslash and
no `:`. The same rule as manifest a1's ArchivePath and prism-bundle's
`check_member_name`, without lookaround.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Path of a member inside a `.prism` bundle archive: `/`-separated, relative,\nno empty, `.` or `..` segment, no leading or trailing `/`, no backslash and\nno `:`. The same rule as manifest a1's ArchivePath and prism-bundle's\n`check_member_name`, without lookaround.",
///  "type": "string"
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize, ::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd,
)]
#[serde(transparent)]
pub struct ArchivePath(pub ::std::string::String);
impl ::std::ops::Deref for ArchivePath {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ArchivePath> for ::std::string::String {
    fn from(value: ArchivePath) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::string::String> for ArchivePath {
    fn from(value: ::std::string::String) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for ArchivePath {
    type Err = ::std::convert::Infallible;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.to_string()))
    }
}
impl ::std::fmt::Display for ArchivePath {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
/**`bundle.json`: the manifest of one design bundle, the first member of the
`.prism` archive and the only one it does not list. It records what was
built (generator id, revision key, bundle key, effective configuration),
the state of every stage, and the role, stage, schema id, size and SHA-256
of every other member. It is rewritten, with
the archive, at the end of each stage. It contains no wall-clock time,
duration, host path, user or machine name.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "$id": "urn:prism:schema:prism.bundle.manifest:a3",
///  "title": "BundleManifestA3",
///  "description": "`bundle.json`: the manifest of one design bundle, the first member of the\n`.prism` archive and the only one it does not list. It records what was\nbuilt (generator id, revision key, bundle key, effective configuration),\nthe state of every stage, and the role, stage, schema id, size and SHA-256\nof every other member. It is rewritten, with\nthe archive, at the end of each stage. It contains no wall-clock time,\nduration, host path, user or machine name.",
///  "type": "object",
///  "required": [
///    "board_id",
///    "config",
///    "generator",
///    "members",
///    "read_set",
///    "schema",
///    "stages"
///  ],
///  "properties": {
///    "board_id": {
///      "description": "Id of the bundle's one board in Simulation Studio references; always `main`. a1 field, unchanged.",
///      "$ref": "#/$defs/BundleManifestBoardId"
///    },
///    "bundle_key": {
///      "description": "The bundle key, `SHA-256(\"prism.bundle_key.a0\" 0x00 revision_key 0x00 generator_bytes)` (cli-spec.md §5.1.4). Present exactly when `revision_key` is. Readers check it against the key they asked for.",
///      "$ref": "#/$defs/Sha256Hex"
///    },
///    "config": {
///      "description": "The effective project configuration the build used: the `--config` document (the one the revision key hashed), or, without `--config`, the default the CLI derived by KiCad's rule (`<stem>.kicad_sch` and `<stem>.kicad_pcb` beside the project file, no excluded directories). Its `project_file`, `root_schematic` and `board` name the files the bundle is about; their members are `sources/` followed by those paths. Replaces a1's `source_board`.",
///      "$ref": "#/$defs/RevisionKeyEffectiveConfigA1"
///    },
///    "generator": {
///      "description": "The generator id: the `prism-kicad version` document, verbatim (ADR §5). Replaces a1's `created_by`, `design`, `materializer` and `kicad_cli_version`.",
///      "$ref": "#/$defs/CliVersionA0"
///    },
///    "members": {
///      "description": "Every member except `bundle.json`, sorted by path in code point order (UTF-8 byte order); the archive's entries follow `bundle.json` in this order.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/BundleManifestMember"
///      },
///      "minItems": 1
///    },
///    "read_set": {
///      "description": "What stage parse looked at besides the source members (ADR amendment K2 §3.4).",
///      "$ref": "#/$defs/BundleManifestReadSet"
///    },
///    "revision_key": {
///      "description": "The design revision key the bundle was built for (`RevisionKeyRecordA1.revision_key`, ADR §5), as the backend passed it with `--revision-key`; `<revision_key>` in the store path. Absent only for a bundle built without one (local and test builds, cli-spec.md §5.2.2); the backend always passes it. The archive may also serve other revision keys whose tree leaves `read_set` and the source members unchanged, through the backend's alias table (revision-key.md §10, ADR amendment K2 §3.6); this field always names the key it was built for, and a reader takes the revision it asked for from its request, never from here.",
///      "$ref": "#/$defs/Sha256Hex"
///    },
///    "schema": {
///      "description": "Schema id of this document. a1 had `schema: \"prism.bundle.manifest\"` plus `version: \"a1\"`; a2 added the stages; a3 adds `read_set`.",
///      "type": "string",
///      "const": "prism.bundle.manifest.a3"
///    },
///    "stages": {
///      "description": "Status and results of each stage.",
///      "$ref": "#/$defs/BundleManifestStages"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct BundleManifestA3 {
    ///Schema id of this document. a1 had `schema: "prism.bundle.manifest"` plus `version: "a1"`; a2 added the stages; a3 adds `read_set`.
    pub schema: ::std::string::String,
    ///The generator id: the `prism-kicad version` document, verbatim (ADR §5). Replaces a1's `created_by`, `design`, `materializer` and `kicad_cli_version`.
    pub generator: CliVersionA0,
    ///The design revision key the bundle was built for (`RevisionKeyRecordA1.revision_key`, ADR §5), as the backend passed it with `--revision-key`; `<revision_key>` in the store path. Absent only for a bundle built without one (local and test builds, cli-spec.md §5.2.2); the backend always passes it. The archive may also serve other revision keys whose tree leaves `read_set` and the source members unchanged, through the backend's alias table (revision-key.md §10, ADR amendment K2 §3.6); this field always names the key it was built for, and a reader takes the revision it asked for from its request, never from here.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub revision_key: ::std::option::Option<Sha256Hex>,
    ///The bundle key, `SHA-256("prism.bundle_key.a0" 0x00 revision_key 0x00 generator_bytes)` (cli-spec.md §5.1.4). Present exactly when `revision_key` is. Readers check it against the key they asked for.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub bundle_key: ::std::option::Option<Sha256Hex>,
    ///The effective project configuration the build used: the `--config` document (the one the revision key hashed), or, without `--config`, the default the CLI derived by KiCad's rule (`<stem>.kicad_sch` and `<stem>.kicad_pcb` beside the project file, no excluded directories). Its `project_file`, `root_schematic` and `board` name the files the bundle is about; their members are `sources/` followed by those paths. Replaces a1's `source_board`.
    pub config: RevisionKeyEffectiveConfigA1,
    ///Id of the bundle's one board in Simulation Studio references; always `main`. a1 field, unchanged.
    pub board_id: BundleManifestBoardId,
    ///Status and results of each stage.
    pub stages: BundleManifestStages,
    ///What stage parse looked at besides the source members (ADR amendment K2 §3.4).
    pub read_set: BundleManifestReadSet,
    ///Every member except `bundle.json`, sorted by path in code point order (UTF-8 byte order); the archive's entries follow `bundle.json` in this order.
    pub members: ::std::vec::Vec<BundleManifestMember>,
}
/**Id of a board inside a bundle, used by Simulation Studio in every
reference (`board_id:refdes.pad`, `board_id:net`). The pattern is a1's
`Slug` (sim: `contracts/contracts/common.tsp:7-9`). A bundle holds one
board and a2 producers always write `main` (sim:
`src/prism-bundle/src/build.rs:34`).*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Id of a board inside a bundle, used by Simulation Studio in every\nreference (`board_id:refdes.pad`, `board_id:net`). The pattern is a1's\n`Slug` (sim: `contracts/contracts/common.tsp:7-9`). A bundle holds one\nboard and a2 producers always write `main` (sim:\n`src/prism-bundle/src/build.rs:34`).",
///  "type": "string"
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize, ::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd,
)]
#[serde(transparent)]
pub struct BundleManifestBoardId(pub ::std::string::String);
impl ::std::ops::Deref for BundleManifestBoardId {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<BundleManifestBoardId> for ::std::string::String {
    fn from(value: BundleManifestBoardId) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::string::String> for BundleManifestBoardId {
    fn from(value: ::std::string::String) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for BundleManifestBoardId {
    type Err = ::std::convert::Infallible;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.to_string()))
    }
}
impl ::std::fmt::Display for BundleManifestBoardId {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
///Stage board: the zone refill (unless the config says saved fills), the materialization and the cross-check.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Stage board: the zone refill (unless the config says saved fills), the materialization and the cross-check.",
///  "type": "object",
///  "required": [
///    "failed_members",
///    "status",
///    "warnings"
///  ],
///  "properties": {
///    "cross_check": {
///      "description": "The binding table checked against `design.json`. Present exactly when the `materialization` member is present.",
///      "$ref": "#/$defs/BundleManifestCrossCheck"
///    },
///    "error": {
///      "description": "The content error that stopped the stage, with its location when known. Present exactly when `status` is `failed`. The CLI's build result repeats it verbatim (`CliStageState.error`).",
///      "$ref": "#/$defs/CliFinding"
///    },
///    "failed_members": {
///      "description": "Members of the stage whose producer failed on this project, sorted by path in code point order; only `materialization/board.kmpack` (code `materialization-failed`) can be listed, and the refilled board, if any, stays. Non-empty exactly when `status` is `partial`.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/BundleManifestMemberFailure"
///      }
///    },
///    "fill_check": {
///      "description": "The committed board's saved fills compared with the refill. Present exactly when the `materialization` member is present and `fill_provenance` is `refilled`. A refill is always made by `generator.refill_procedure` with a KiCad of `generator.kicad_version`'s major.minor; with saved fills no refill and no comparison run (cli-spec.md §5.2.3).",
///      "$ref": "#/$defs/BundleManifestFillCheck"
///    },
///    "fill_provenance": {
///      "description": "Where the materialized board's zone fills came from: `saved` exactly when `config.zone_fills` is `saved`, else `refilled`. Present exactly when `status` is `complete` or `partial`.",
///      "$ref": "#/$defs/BundleManifestFillProvenance"
///    },
///    "skip_reason": {
///      "description": "Why the stage never runs. Present exactly when `status` is `skipped`.",
///      "$ref": "#/$defs/BundleManifestSkipReason"
///    },
///    "status": {
///      "description": "`pending`, `complete`, `partial` (the materializer failed; the refilled board, if any, stays) or `skipped`.",
///      "$ref": "#/$defs/BundleManifestStageStatus"
///    },
///    "warnings": {
///      "description": "Non-fatal findings of the stage (`stale-saved-fills`, `kicad-default-stackup`, and `saved-fills-used` exactly when `fill_provenance` is `saved`), sorted by code, then message, in code point order; no two entries are equal. The cross-check's own findings are only in `cross_check`.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/Warning"
///      }
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct BundleManifestBoardStage {
    ///`pending`, `complete`, `partial` (the materializer failed; the refilled board, if any, stays) or `skipped`.
    pub status: BundleManifestStageStatus,
    ///Why the stage never runs. Present exactly when `status` is `skipped`.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub skip_reason: ::std::option::Option<BundleManifestSkipReason>,
    ///The content error that stopped the stage, with its location when known. Present exactly when `status` is `failed`. The CLI's build result repeats it verbatim (`CliStageState.error`).
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub error: ::std::option::Option<CliFinding>,
    ///Where the materialized board's zone fills came from: `saved` exactly when `config.zone_fills` is `saved`, else `refilled`. Present exactly when `status` is `complete` or `partial`.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub fill_provenance: ::std::option::Option<BundleManifestFillProvenance>,
    ///The committed board's saved fills compared with the refill. Present exactly when the `materialization` member is present and `fill_provenance` is `refilled`. A refill is always made by `generator.refill_procedure` with a KiCad of `generator.kicad_version`'s major.minor; with saved fills no refill and no comparison run (cli-spec.md §5.2.3).
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub fill_check: ::std::option::Option<BundleManifestFillCheck>,
    ///The binding table checked against `design.json`. Present exactly when the `materialization` member is present.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub cross_check: ::std::option::Option<BundleManifestCrossCheck>,
    ///Non-fatal findings of the stage (`stale-saved-fills`, `kicad-default-stackup`, and `saved-fills-used` exactly when `fill_provenance` is `saved`), sorted by code, then message, in code point order; no two entries are equal. The cross-check's own findings are only in `cross_check`.
    pub warnings: ::std::vec::Vec<Warning>,
    ///Members of the stage whose producer failed on this project, sorted by path in code point order; only `materialization/board.kmpack` (code `materialization-failed`) can be listed, and the refilled board, if any, stays. Non-empty exactly when `status` is `partial`.
    pub failed_members: ::std::vec::Vec<BundleManifestMemberFailure>,
}
/**The binding table of the materialization checked against `design.json`:
reference designators, pad numbers and the net of every pad (sim:
`src/prism-bundle/src/crosscheck.rs:1-45`). It never stops the build;
`failed` and `skipped` gate simulation only (ref:
`backend/app/services/project_bundle.py:149-161`, sim:
`src/sim-worker/src/main.rs:101-122`).*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "The binding table of the materialization checked against `design.json`:\nreference designators, pad numbers and the net of every pad (sim:\n`src/prism-bundle/src/crosscheck.rs:1-45`). It never stops the build;\n`failed` and `skipped` gate simulation only (ref:\n`backend/app/services/project_bundle.py:149-161`, sim:\n`src/sim-worker/src/main.rs:101-122`).",
///  "type": "object",
///  "required": [
///    "components_compared",
///    "errors",
///    "mappings",
///    "nets_compared",
///    "pads_compared",
///    "status",
///    "warnings"
///  ],
///  "properties": {
///    "components_compared": {
///      "description": "Reference designators present on both the board and the design.",
///      "$ref": "#/$defs/Count"
///    },
///    "errors": {
///      "description": "Findings that gate simulation (codes `component-missing-from-schematic`, `component-missing-from-board`, `pad-missing-from-schematic`, `net-mismatch`), sorted by code, then message, in code point order; no two entries are equal. Non-empty exactly when `status` is `failed`.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/Warning"
///      }
///    },
///    "mappings": {
///      "description": "Accepted renames, sorted by kind, then board, then design, in code point order; no two entries are equal.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/BundleManifestCrossCheckMapping"
///      }
///    },
///    "nets_compared": {
///      "description": "Distinct board nets on the compared pads.",
///      "$ref": "#/$defs/Count"
///    },
///    "pads_compared": {
///      "description": "Pads on a net that were compared with their pins.",
///      "$ref": "#/$defs/Count"
///    },
///    "status": {
///      "description": "Overall result.",
///      "$ref": "#/$defs/BundleManifestCrossCheckStatus"
///    },
///    "warnings": {
///      "description": "Findings that do not gate simulation (codes `pin-missing-from-board`, `board-only-component`, `board-net-not-in-schematic`, `schematic-net-not-on-board`), sorted by code, then message, in code point order; no two entries are equal.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/Warning"
///      }
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct BundleManifestCrossCheck {
    ///Overall result.
    pub status: BundleManifestCrossCheckStatus,
    ///Reference designators present on both the board and the design.
    pub components_compared: Count,
    ///Pads on a net that were compared with their pins.
    pub pads_compared: Count,
    ///Distinct board nets on the compared pads.
    pub nets_compared: Count,
    ///Accepted renames, sorted by kind, then board, then design, in code point order; no two entries are equal.
    pub mappings: ::std::vec::Vec<BundleManifestCrossCheckMapping>,
    ///Findings that do not gate simulation (codes `pin-missing-from-board`, `board-only-component`, `board-net-not-in-schematic`, `schematic-net-not-on-board`), sorted by code, then message, in code point order; no two entries are equal.
    pub warnings: ::std::vec::Vec<Warning>,
    ///Findings that gate simulation (codes `component-missing-from-schematic`, `component-missing-from-board`, `pad-missing-from-schematic`, `net-mismatch`), sorted by code, then message, in code point order; no two entries are equal. Non-empty exactly when `status` is `failed`.
    pub errors: ::std::vec::Vec<Warning>,
}
///Two net names the cross-check accepted as the same net.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Two net names the cross-check accepted as the same net.",
///  "type": "object",
///  "required": [
///    "board",
///    "design",
///    "kind"
///  ],
///  "properties": {
///    "board": {
///      "description": "The net's name in the materialized board.",
///      "$ref": "#/$defs/NetName"
///    },
///    "design": {
///      "description": "The net's name in `design.json`.",
///      "$ref": "#/$defs/NetName"
///    },
///    "kind": {
///      "description": "Why the names are accepted as equal.",
///      "$ref": "#/$defs/BundleManifestCrossCheckMappingKind"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct BundleManifestCrossCheckMapping {
    ///Why the names are accepted as equal.
    pub kind: BundleManifestCrossCheckMappingKind,
    ///The net's name in the materialized board.
    pub board: NetName,
    ///The net's name in `design.json`.
    pub design: NetName,
}
///Why the cross-check accepted two different net names as one net (sim: `src/prism-bundle/src/crosscheck.rs:29-42`).
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Why the cross-check accepted two different net names as one net (sim: `src/prism-bundle/src/crosscheck.rs:29-42`).",
///  "type": "string",
///  "enum": [
///    "single-pin-net-name",
///    "same-pins-net-name",
///    "split-net"
///  ]
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize,
    ::serde::Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum BundleManifestCrossCheckMappingKind {
    #[serde(rename = "single-pin-net-name")]
    SinglePinNetName,
    #[serde(rename = "same-pins-net-name")]
    SamePinsNetName,
    #[serde(rename = "split-net")]
    SplitNet,
}
impl ::std::fmt::Display for BundleManifestCrossCheckMappingKind {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::SinglePinNetName => f.write_str("single-pin-net-name"),
            Self::SamePinsNetName => f.write_str("same-pins-net-name"),
            Self::SplitNet => f.write_str("split-net"),
        }
    }
}
impl ::std::str::FromStr for BundleManifestCrossCheckMappingKind {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "single-pin-net-name" => Ok(Self::SinglePinNetName),
            "same-pins-net-name" => Ok(Self::SamePinsNetName),
            "split-net" => Ok(Self::SplitNet),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for BundleManifestCrossCheckMappingKind {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for BundleManifestCrossCheckMappingKind {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for BundleManifestCrossCheckMappingKind {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///Overall result of the cross-check. a1 values, unchanged (sim: `src/prism-bundle/src/crosscheck.rs:143-155`).
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Overall result of the cross-check. a1 values, unchanged (sim: `src/prism-bundle/src/crosscheck.rs:143-155`).",
///  "type": "string",
///  "enum": [
///    "passed",
///    "passed-with-warnings",
///    "failed",
///    "skipped"
///  ]
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize,
    ::serde::Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum BundleManifestCrossCheckStatus {
    #[serde(rename = "passed")]
    Passed,
    #[serde(rename = "passed-with-warnings")]
    PassedWithWarnings,
    #[serde(rename = "failed")]
    Failed,
    #[serde(rename = "skipped")]
    Skipped,
}
impl ::std::fmt::Display for BundleManifestCrossCheckStatus {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Passed => f.write_str("passed"),
            Self::PassedWithWarnings => f.write_str("passed-with-warnings"),
            Self::Failed => f.write_str("failed"),
            Self::Skipped => f.write_str("skipped"),
        }
    }
}
impl ::std::str::FromStr for BundleManifestCrossCheckStatus {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "passed" => Ok(Self::Passed),
            "passed-with-warnings" => Ok(Self::PassedWithWarnings),
            "failed" => Ok(Self::Failed),
            "skipped" => Ok(Self::Skipped),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for BundleManifestCrossCheckStatus {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for BundleManifestCrossCheckStatus {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for BundleManifestCrossCheckStatus {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///Saved zone fills compared with a fresh refill. a1 model, unchanged (sim: `src/prism-bundle/src/build.rs:248-268`).
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Saved zone fills compared with a fresh refill. a1 model, unchanged (sim: `src/prism-bundle/src/build.rs:248-268`).",
///  "type": "object",
///  "required": [
///    "differing_operations",
///    "refilled_operations",
///    "saved_operations",
///    "stale"
///  ],
///  "properties": {
///    "differing_operations": {
///      "description": "Zone-fill operations present in one board and not the other.",
///      "$ref": "#/$defs/Count"
///    },
///    "refilled_operations": {
///      "description": "Zone-fill operations materialized from the refilled board.",
///      "$ref": "#/$defs/Count"
///    },
///    "saved_operations": {
///      "description": "Zone-fill operations materialized from the committed board's saved fills.",
///      "$ref": "#/$defs/Count"
///    },
///    "stale": {
///      "description": "True exactly when `differing_operations` is not 0; stage board then also has the warning `stale-saved-fills`.",
///      "type": "boolean"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct BundleManifestFillCheck {
    ///Zone-fill operations materialized from the committed board's saved fills.
    pub saved_operations: Count,
    ///Zone-fill operations materialized from the refilled board.
    pub refilled_operations: Count,
    ///Zone-fill operations present in one board and not the other.
    pub differing_operations: Count,
    ///True exactly when `differing_operations` is not 0; stage board then also has the warning `stale-saved-fills`.
    pub stale: bool,
}
/**Where the zone fills of the materialized board came from. The value
follows `config.zone_fills`, which is in the revision key, so a bundle key
has exactly one (cli-spec.md §5.2.3). a1's `fill_provenance` values
(sim: `contracts/contracts/bundle.tsp:41-47`), unchanged.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Where the zone fills of the materialized board came from. The value\nfollows `config.zone_fills`, which is in the revision key, so a bundle key\nhas exactly one (cli-spec.md §5.2.3). a1's `fill_provenance` values\n(sim: `contracts/contracts/bundle.tsp:41-47`), unchanged.",
///  "type": "string",
///  "enum": [
///    "refilled",
///    "saved"
///  ]
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize,
    ::serde::Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum BundleManifestFillProvenance {
    #[serde(rename = "refilled")]
    Refilled,
    #[serde(rename = "saved")]
    Saved,
}
impl ::std::fmt::Display for BundleManifestFillProvenance {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Refilled => f.write_str("refilled"),
            Self::Saved => f.write_str("saved"),
        }
    }
}
impl ::std::str::FromStr for BundleManifestFillProvenance {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "refilled" => Ok(Self::Refilled),
            "saved" => Ok(Self::Saved),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for BundleManifestFillProvenance {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for BundleManifestFillProvenance {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for BundleManifestFillProvenance {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
/**A submodule stage parse looked into: a source member inside it, or a probe
or listing that reaches into it. Its commit pins every file below it, so
the read set holds below `path` exactly when the commit is the same.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A submodule stage parse looked into: a source member inside it, or a probe\nor listing that reaches into it. Its commit pins every file below it, so\nthe read set holds below `path` exactly when the commit is the same.",
///  "type": "object",
///  "required": [
///    "commit",
///    "path"
///  ],
///  "properties": {
///    "commit": {
///      "description": "The commit the gitlink records, as in the revision key's entry.",
///      "$ref": "#/$defs/GitObjectId"
///    },
///    "path": {
///      "description": "The gitlink entry's repository path.",
///      "$ref": "#/$defs/RepoPath"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct BundleManifestGitlink {
    ///The gitlink entry's repository path.
    pub path: RepoPath,
    ///The commit the gitlink records, as in the revision key's entry.
    pub commit: GitObjectId,
}
/**One directory listing stage parse made: the source-set paths under
`directory`, at any depth, whose name, lowered in ASCII, ends with one of
`suffixes` (any name when `suffixes` is empty).*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "One directory listing stage parse made: the source-set paths under\n`directory`, at any depth, whose name, lowered in ASCII, ends with one of\n`suffixes` (any name when `suffixes` is empty).",
///  "type": "object",
///  "required": [
///    "directory",
///    "paths",
///    "suffixes"
///  ],
///  "properties": {
///    "directory": {
///      "description": "The directory listed: a repository path, or `\"\"` for the repository root. A path is under it when it starts with `directory` + `/`.",
///      "oneOf": [
///        {
///          "$ref": "#/$defs/RepoPath"
///        },
///        {
///          "type": "string",
///          "const": ""
///        }
///      ]
///    },
///    "paths": {
///      "description": "The paths the listing returned, sorted in code point order.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/RepoPath"
///      }
///    },
///    "suffixes": {
///      "description": "The suffixes, sorted in code point order, without duplicates; empty for every name.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/BundleManifestListingSuffix"
///      }
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct BundleManifestListing {
    ///The directory listed: a repository path, or `""` for the repository root. A path is under it when it starts with `directory` + `/`.
    pub directory: BundleManifestListingDirectory,
    ///The suffixes, sorted in code point order, without duplicates; empty for every name.
    pub suffixes: ::std::vec::Vec<BundleManifestListingSuffix>,
    ///The paths the listing returned, sorted in code point order.
    pub paths: ::std::vec::Vec<RepoPath>,
}
///The directory listed: a repository path, or `""` for the repository root. A path is under it when it starts with `directory` + `/`.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "The directory listed: a repository path, or `\"\"` for the repository root. A path is under it when it starts with `directory` + `/`.",
///  "oneOf": [
///    {
///      "$ref": "#/$defs/RepoPath"
///    },
///    {
///      "type": "string",
///      "const": ""
///    }
///  ]
///}
/// ```
/// </details>
#[derive(::serde::Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum BundleManifestListingDirectory {
    RepoPath(RepoPath),
    String(::std::string::String),
}
impl ::std::fmt::Display for BundleManifestListingDirectory {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match self {
            Self::RepoPath(x) => x.fmt(f),
            Self::String(x) => x.fmt(f),
        }
    }
}
impl ::std::convert::From<RepoPath> for BundleManifestListingDirectory {
    fn from(value: RepoPath) -> Self {
        Self::RepoPath(value)
    }
}
/**A suffix a listing selected by, as the revision key's name rules write
one: a lowercase ASCII name ending that starts with `.` (revision-key.md
§5.2).*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A suffix a listing selected by, as the revision key's name rules write\none: a lowercase ASCII name ending that starts with `.` (revision-key.md\n§5.2).",
///  "type": "string"
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize, ::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd,
)]
#[serde(transparent)]
pub struct BundleManifestListingSuffix(pub ::std::string::String);
impl ::std::ops::Deref for BundleManifestListingSuffix {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<BundleManifestListingSuffix> for ::std::string::String {
    fn from(value: BundleManifestListingSuffix) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::string::String> for BundleManifestListingSuffix {
    fn from(value: ::std::string::String) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for BundleManifestListingSuffix {
    type Err = ::std::convert::Infallible;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.to_string()))
    }
}
impl ::std::fmt::Display for BundleManifestListingSuffix {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
///One archive member other than `bundle.json` itself, which is never listed and never hashed by the manifest.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "One archive member other than `bundle.json` itself, which is never listed and never hashed by the manifest.",
///  "type": "object",
///  "required": [
///    "bytes",
///    "path",
///    "role",
///    "sha256",
///    "stage"
///  ],
///  "properties": {
///    "bytes": {
///      "description": "Size of the member's uncompressed bytes.",
///      "$ref": "#/$defs/ByteCount"
///    },
///    "member_schema": {
///      "description": "Schema id of a structured member: present exactly when `role` is\n`design`, `materialization` or `projection`, and then equal both to the\n`schema` value inside the member and to the id `generator.member_schemas`\ngives for this path (for example `kicad_monkey.design.a0`,\n`kicad_monkey.materialization.a0`, `prism.stackup.a0`). Absent for every\nother role. Readers validate a JSON member against the JSON Schema\nregistered under this id, when there is one.",
///      "$ref": "#/$defs/SchemaId"
///    },
///    "path": {
///      "description": "Archive path, unique within the bundle. Its form is fixed by `role` (`bundle-format.md` §2).",
///      "$ref": "#/$defs/ArchivePath"
///    },
///    "role": {
///      "description": "What the member is.",
///      "$ref": "#/$defs/BundleManifestMemberRole"
///    },
///    "sha256": {
///      "description": "SHA-256 of the member's uncompressed bytes.",
///      "$ref": "#/$defs/Sha256Hex"
///    },
///    "source": {
///      "description": "The revision-key entry of a source member. Present exactly when `role` is a `source-*` role.",
///      "$ref": "#/$defs/BundleManifestSourceEntry"
///    },
///    "stage": {
///      "description": "The stage that wrote the member: always the stage of its role.",
///      "$ref": "#/$defs/BundleManifestStage"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct BundleManifestMember {
    ///Archive path, unique within the bundle. Its form is fixed by `role` (`bundle-format.md` §2).
    pub path: ArchivePath,
    ///What the member is.
    pub role: BundleManifestMemberRole,
    ///The stage that wrote the member: always the stage of its role.
    pub stage: BundleManifestStage,
    ///SHA-256 of the member's uncompressed bytes.
    pub sha256: Sha256Hex,
    ///Size of the member's uncompressed bytes.
    pub bytes: ByteCount,
    /**Schema id of a structured member: present exactly when `role` is
    `design`, `materialization` or `projection`, and then equal both to the
    `schema` value inside the member and to the id `generator.member_schemas`
    gives for this path (for example `kicad_monkey.design.a0`,
    `kicad_monkey.materialization.a0`, `prism.stackup.a0`). Absent for every
    other role. Readers validate a JSON member against the JSON Schema
    registered under this id, when there is one.*/
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub member_schema: ::std::option::Option<SchemaId>,
    ///The revision-key entry of a source member. Present exactly when `role` is a `source-*` role.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub source: ::std::option::Option<BundleManifestSourceEntry>,
}
///A member that applies to this project but whose producer failed on the project's content.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A member that applies to this project but whose producer failed on the project's content.",
///  "type": "object",
///  "required": [
///    "code",
///    "message",
///    "path"
///  ],
///  "properties": {
///    "code": {
///      "description": "Stable code of the failure, for example `projection-failed` (`bundle-format.md` §3.2).",
///      "$ref": "#/$defs/DiagnosticCode"
///    },
///    "message": {
///      "description": "One-sentence explanation for people; its wording may change between generators. It never contains a host path.",
///      "type": "string",
///      "minLength": 1
///    },
///    "path": {
///      "description": "Archive path the member would have had. It is not in `members`.",
///      "$ref": "#/$defs/ArchivePath"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct BundleManifestMemberFailure {
    ///Archive path the member would have had. It is not in `members`.
    pub path: ArchivePath,
    ///Stable code of the failure, for example `projection-failed` (`bundle-format.md` §3.2).
    pub code: DiagnosticCode,
    ///One-sentence explanation for people; its wording may change between generators. It never contains a host path.
    pub message: BundleManifestMemberFailureMessage,
}
///One-sentence explanation for people; its wording may change between generators. It never contains a host path.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "One-sentence explanation for people; its wording may change between generators. It never contains a host path.",
///  "type": "string",
///  "minLength": 1
///}
/// ```
/// </details>
#[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct BundleManifestMemberFailureMessage(::std::string::String);
impl ::std::ops::Deref for BundleManifestMemberFailureMessage {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<BundleManifestMemberFailureMessage> for ::std::string::String {
    fn from(value: BundleManifestMemberFailureMessage) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for BundleManifestMemberFailureMessage {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for BundleManifestMemberFailureMessage {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for BundleManifestMemberFailureMessage {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for BundleManifestMemberFailureMessage {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for BundleManifestMemberFailureMessage {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
/**What a member is. Every member has exactly one role, and the role fixes
the stage that writes it and the form of its archive path
(`bundle-format.md` §2). A source member's role is its category in the
revision key's source selection (`RevisionKeySourceCategory`,
revision-key-a1.tsp), mapped one to one as listed below. Files inside an
expanded gitlink take the role the same rules give their name. Symlinks and
gitlinks themselves are never members (cli-spec.md §9.1).*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "What a member is. Every member has exactly one role, and the role fixes\nthe stage that writes it and the form of its archive path\n(`bundle-format.md` §2). A source member's role is its category in the\nrevision key's source selection (`RevisionKeySourceCategory`,\nrevision-key-a1.tsp), mapped one to one as listed below. Files inside an\nexpanded gitlink take the role the same rules give their name. Symlinks and\ngitlinks themselves are never members (cli-spec.md §9.1).",
///  "type": "string",
///  "enum": [
///    "source-project",
///    "source-schematic",
///    "source-board",
///    "source-design-rules",
///    "source-worksheet",
///    "source-jobset",
///    "source-library-table",
///    "source-symbol-library",
///    "source-footprint",
///    "source-3d-model",
///    "source-prism-settings",
///    "design",
///    "projection",
///    "refilled-board",
///    "materialization",
///    "component-models"
///  ]
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize,
    ::serde::Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum BundleManifestMemberRole {
    #[serde(rename = "source-project")]
    SourceProject,
    #[serde(rename = "source-schematic")]
    SourceSchematic,
    #[serde(rename = "source-board")]
    SourceBoard,
    #[serde(rename = "source-design-rules")]
    SourceDesignRules,
    #[serde(rename = "source-worksheet")]
    SourceWorksheet,
    #[serde(rename = "source-jobset")]
    SourceJobset,
    #[serde(rename = "source-library-table")]
    SourceLibraryTable,
    #[serde(rename = "source-symbol-library")]
    SourceSymbolLibrary,
    #[serde(rename = "source-footprint")]
    SourceFootprint,
    #[serde(rename = "source-3d-model")]
    Source3dModel,
    #[serde(rename = "source-prism-settings")]
    SourcePrismSettings,
    #[serde(rename = "design")]
    Design,
    #[serde(rename = "projection")]
    Projection,
    #[serde(rename = "refilled-board")]
    RefilledBoard,
    #[serde(rename = "materialization")]
    Materialization,
    #[serde(rename = "component-models")]
    ComponentModels,
}
impl ::std::fmt::Display for BundleManifestMemberRole {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::SourceProject => f.write_str("source-project"),
            Self::SourceSchematic => f.write_str("source-schematic"),
            Self::SourceBoard => f.write_str("source-board"),
            Self::SourceDesignRules => f.write_str("source-design-rules"),
            Self::SourceWorksheet => f.write_str("source-worksheet"),
            Self::SourceJobset => f.write_str("source-jobset"),
            Self::SourceLibraryTable => f.write_str("source-library-table"),
            Self::SourceSymbolLibrary => f.write_str("source-symbol-library"),
            Self::SourceFootprint => f.write_str("source-footprint"),
            Self::Source3dModel => f.write_str("source-3d-model"),
            Self::SourcePrismSettings => f.write_str("source-prism-settings"),
            Self::Design => f.write_str("design"),
            Self::Projection => f.write_str("projection"),
            Self::RefilledBoard => f.write_str("refilled-board"),
            Self::Materialization => f.write_str("materialization"),
            Self::ComponentModels => f.write_str("component-models"),
        }
    }
}
impl ::std::str::FromStr for BundleManifestMemberRole {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "source-project" => Ok(Self::SourceProject),
            "source-schematic" => Ok(Self::SourceSchematic),
            "source-board" => Ok(Self::SourceBoard),
            "source-design-rules" => Ok(Self::SourceDesignRules),
            "source-worksheet" => Ok(Self::SourceWorksheet),
            "source-jobset" => Ok(Self::SourceJobset),
            "source-library-table" => Ok(Self::SourceLibraryTable),
            "source-symbol-library" => Ok(Self::SourceSymbolLibrary),
            "source-footprint" => Ok(Self::SourceFootprint),
            "source-3d-model" => Ok(Self::Source3dModel),
            "source-prism-settings" => Ok(Self::SourcePrismSettings),
            "design" => Ok(Self::Design),
            "projection" => Ok(Self::Projection),
            "refilled-board" => Ok(Self::RefilledBoard),
            "materialization" => Ok(Self::Materialization),
            "component-models" => Ok(Self::ComponentModels),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for BundleManifestMemberRole {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for BundleManifestMemberRole {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for BundleManifestMemberRole {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///Stage models: the KiCad component GLB.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Stage models: the KiCad component GLB.",
///  "type": "object",
///  "required": [
///    "failed_members",
///    "status",
///    "warnings"
///  ],
///  "properties": {
///    "error": {
///      "description": "The content error that stopped the stage. Present exactly when `status` is `failed`, which stage models does not reach in a2; present in the model so the three stage records share one shape.",
///      "$ref": "#/$defs/CliFinding"
///    },
///    "failed_members": {
///      "description": "Members of the stage whose producer failed on this project, sorted by path in code point order. Always empty in a2 (see `status`); present so all three stage records share `status`, `skip_reason`, `error`, `warnings` and `failed_members`, which K's readiness code reads generically.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/BundleManifestMemberFailure"
///      }
///    },
///    "skip_reason": {
///      "description": "Why the stage never runs. Present exactly when `status` is `skipped`.",
///      "$ref": "#/$defs/BundleManifestSkipReason"
///    },
///    "status": {
///      "description": "`pending`, `complete` or `skipped`: the stage only checks, canonicalizes and copies files the backend produced, so it has no content failure in a2 (cli-spec.md §5.2.4).",
///      "$ref": "#/$defs/BundleManifestStageStatus"
///    },
///    "warnings": {
///      "description": "Non-fatal findings of the stage, sorted by code, then message, in code point order; no two entries are equal.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/Warning"
///      }
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct BundleManifestModelsStage {
    ///`pending`, `complete` or `skipped`: the stage only checks, canonicalizes and copies files the backend produced, so it has no content failure in a2 (cli-spec.md §5.2.4).
    pub status: BundleManifestStageStatus,
    ///Why the stage never runs. Present exactly when `status` is `skipped`.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub skip_reason: ::std::option::Option<BundleManifestSkipReason>,
    ///The content error that stopped the stage. Present exactly when `status` is `failed`, which stage models does not reach in a2; present in the model so the three stage records share one shape.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub error: ::std::option::Option<CliFinding>,
    ///Non-fatal findings of the stage, sorted by code, then message, in code point order; no two entries are equal.
    pub warnings: ::std::vec::Vec<Warning>,
    ///Members of the stage whose producer failed on this project, sorted by path in code point order. Always empty in a2 (see `status`); present so all three stage records share `status`, `skip_reason`, `error`, `warnings` and `failed_members`, which K's readiness code reads generically.
    pub failed_members: ::std::vec::Vec<BundleManifestMemberFailure>,
}
///Stage parse: the source members, `design.json` and every projection.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Stage parse: the source members, `design.json` and every projection.",
///  "type": "object",
///  "required": [
///    "failed_members",
///    "status",
///    "warnings"
///  ],
///  "properties": {
///    "error": {
///      "description": "The content error that stopped the stage, with the source location when known (for example code `source-unparseable` at `sources/<sheet>.kicad_sch`, line and column; codes in cli-spec.md §8). Present exactly when `status` is `failed`. The CLI's build result repeats it verbatim (`CliStageState.error`).",
///      "$ref": "#/$defs/CliFinding"
///    },
///    "failed_members": {
///      "description": "Derived members of the stage (`design.json`, projections) whose producer failed on this project (codes `design-build-failed`, `projection-failed`), sorted by path in code point order. Non-empty exactly when `status` is `partial`.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/BundleManifestMemberFailure"
///      }
///    },
///    "status": {
///      "description": "`complete`, `partial` or `failed`; never `pending` or `skipped`, because an archive is first written at the end of this stage.",
///      "$ref": "#/$defs/BundleManifestStageStatus"
///    },
///    "warnings": {
///      "description": "Non-fatal findings of the parse and of the projection producers, sorted by code, then message, in code point order; no two entries are equal.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/Warning"
///      }
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct BundleManifestParseStage {
    ///`complete`, `partial` or `failed`; never `pending` or `skipped`, because an archive is first written at the end of this stage.
    pub status: BundleManifestStageStatus,
    ///The content error that stopped the stage, with the source location when known (for example code `source-unparseable` at `sources/<sheet>.kicad_sch`, line and column; codes in cli-spec.md §8). Present exactly when `status` is `failed`. The CLI's build result repeats it verbatim (`CliStageState.error`).
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub error: ::std::option::Option<CliFinding>,
    ///Non-fatal findings of the parse and of the projection producers, sorted by code, then message, in code point order; no two entries are equal.
    pub warnings: ::std::vec::Vec<Warning>,
    ///Derived members of the stage (`design.json`, projections) whose producer failed on this project (codes `design-build-failed`, `projection-failed`), sorted by path in code point order. Non-empty exactly when `status` is `partial`.
    pub failed_members: ::std::vec::Vec<BundleManifestMemberFailure>,
}
/**A path stage parse asked about without reading it: a `read` that found no
such file in the source set, or an existence test (ADR amendment K2 §3.1).*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A path stage parse asked about without reading it: a `read` that found no\nsuch file in the source set, or an existence test (ADR amendment K2 §3.1).",
///  "type": "object",
///  "required": [
///    "path",
///    "present"
///  ],
///  "properties": {
///    "path": {
///      "description": "The repository path asked about.",
///      "$ref": "#/$defs/RepoPath"
///    },
///    "present": {
///      "description": "Whether the path was in the source set.",
///      "type": "boolean"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct BundleManifestProbe {
    ///The repository path asked about.
    pub path: RepoPath,
    ///Whether the path was in the source set.
    pub present: bool,
}
/**What stage parse looked at besides the files it read, which are the
source members (ADR amendment K2 §3.3–§3.4). A stored bundle serves another
revision key of the same project, configuration and generator when every
source member's key entry, every probe and every listing is the same in
that key's tree (`prism-kicad bundle reuse`, cli-spec.md §5.10). Written at
the end of stage parse and copied unchanged by later stages.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "What stage parse looked at besides the files it read, which are the\nsource members (ADR amendment K2 §3.3–§3.4). A stored bundle serves another\nrevision key of the same project, configuration and generator when every\nsource member's key entry, every probe and every listing is the same in\nthat key's tree (`prism-kicad bundle reuse`, cli-spec.md §5.10). Written at\nthe end of stage parse and copied unchanged by later stages.",
///  "type": "object",
///  "required": [
///    "gitlinks",
///    "listings",
///    "probes"
///  ],
///  "properties": {
///    "gitlinks": {
///      "description": "Every gitlink a source member, probe or listing reached into, sorted by `path`, without duplicates.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/BundleManifestGitlink"
///      }
///    },
///    "listings": {
///      "description": "Every listing, sorted by `directory`, then by `suffixes` (compared element by element), without duplicates.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/BundleManifestListing"
///      }
///    },
///    "probes": {
///      "description": "Every probe, sorted by `path` in code point order, without duplicates.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/BundleManifestProbe"
///      }
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct BundleManifestReadSet {
    ///Every probe, sorted by `path` in code point order, without duplicates.
    pub probes: ::std::vec::Vec<BundleManifestProbe>,
    ///Every listing, sorted by `directory`, then by `suffixes` (compared element by element), without duplicates.
    pub listings: ::std::vec::Vec<BundleManifestListing>,
    ///Every gitlink a source member, probe or listing reached into, sorted by `path`, without duplicates.
    pub gitlinks: ::std::vec::Vec<BundleManifestGitlink>,
}
///Why a stage is skipped. The values are the CLI's `CliSkipReason` (`cli-a0.tsp`).
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Why a stage is skipped. The values are the CLI's `CliSkipReason` (`cli-a0.tsp`).",
///  "type": "string",
///  "enum": [
///    "no-board",
///    "earlier-stage-failed"
///  ]
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize,
    ::serde::Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum BundleManifestSkipReason {
    #[serde(rename = "no-board")]
    NoBoard,
    #[serde(rename = "earlier-stage-failed")]
    EarlierStageFailed,
}
impl ::std::fmt::Display for BundleManifestSkipReason {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::NoBoard => f.write_str("no-board"),
            Self::EarlierStageFailed => f.write_str("earlier-stage-failed"),
        }
    }
}
impl ::std::str::FromStr for BundleManifestSkipReason {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "no-board" => Ok(Self::NoBoard),
            "earlier-stage-failed" => Ok(Self::EarlierStageFailed),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for BundleManifestSkipReason {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for BundleManifestSkipReason {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for BundleManifestSkipReason {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "The revision-key entry a source member comes from (revision-key.md §12,\nQ3). `sources/**` holds the closure the build read, and each of its\nmembers names the key entry that pins its bytes."]
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "The revision-key entry a source member comes from (revision-key.md §12,\nQ3). `sources/**` holds the closure the build read, and each of its\nmembers names the key entry that pins its bytes.",
///  "type": "object",
///  "required": [
///    "kind",
///    "object_id",
///    "path"
///  ],
///  "properties": {
///    "gitlink": {
///      "description": "For a file inside a submodule: the path of the key's gitlink entry that\npins it, and `object_id` is the file's blob id in the commit that gitlink\nrecords. Absent otherwise, and then `path`, `kind` and `object_id` equal\none entry of the key (`RevisionKeyRecordA1.entries`).",
///      "$ref": "#/$defs/RepoPath"
///    },
///    "kind": {
///      "description": "The entry kind, `regular` or `executable` (symlinks and gitlinks are never members).",
///      "$ref": "#/$defs/RevisionKeyEntryKind"
///    },
///    "object_id": {
///      "description": "The blob id git records for the file, in the repository's object format. For a Git LFS file it is the committed pointer's blob id, as in the key, while the member holds the hydrated bytes.",
///      "$ref": "#/$defs/GitObjectId"
///    },
///    "path": {
///      "description": "The file's repository path: the member's `path` without the leading `sources/`.",
///      "$ref": "#/$defs/RepoPath"
///    },
///    "upgraded_from_version": {
///      "description": "The `(version …)` of the committed file when K upgraded it to the worker\nKiCad's format before stage parse (bundle-format.md §2.2): the member\nthen holds KiCad's upgrade of the blob `object_id` names. Absent when the\nfile was used as committed.",
///      "type": "integer"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct BundleManifestSourceEntry {
    ///The file's repository path: the member's `path` without the leading `sources/`.
    pub path: RepoPath,
    ///The entry kind, `regular` or `executable` (symlinks and gitlinks are never members).
    pub kind: RevisionKeyEntryKind,
    ///The blob id git records for the file, in the repository's object format. For a Git LFS file it is the committed pointer's blob id, as in the key, while the member holds the hydrated bytes.
    pub object_id: GitObjectId,
    /**For a file inside a submodule: the path of the key's gitlink entry that
    pins it, and `object_id` is the file's blob id in the commit that gitlink
    records. Absent otherwise, and then `path`, `kind` and `object_id` equal
    one entry of the key (`RevisionKeyRecordA1.entries`).*/
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub gitlink: ::std::option::Option<RepoPath>,
    /**The `(version …)` of the committed file when K upgraded it to the worker
    KiCad's format before stage parse (bundle-format.md §2.2): the member
    then holds KiCad's upgrade of the blob `object_id` names. Absent when the
    file was used as committed.*/
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub upgraded_from_version: ::std::option::Option<i64>,
}
///A stage of the design-bundle job (ADR §4.4), in pipeline order. Each stage runs only after the one before it (`bundle-format.md` §3).
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A stage of the design-bundle job (ADR §4.4), in pipeline order. Each stage runs only after the one before it (`bundle-format.md` §3).",
///  "type": "string",
///  "enum": [
///    "parse",
///    "board",
///    "models"
///  ]
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize,
    ::serde::Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum BundleManifestStage {
    #[serde(rename = "parse")]
    Parse,
    #[serde(rename = "board")]
    Board,
    #[serde(rename = "models")]
    Models,
}
impl ::std::fmt::Display for BundleManifestStage {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Parse => f.write_str("parse"),
            Self::Board => f.write_str("board"),
            Self::Models => f.write_str("models"),
        }
    }
}
impl ::std::str::FromStr for BundleManifestStage {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "parse" => Ok(Self::Parse),
            "board" => Ok(Self::Board),
            "models" => Ok(Self::Models),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for BundleManifestStage {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for BundleManifestStage {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for BundleManifestStage {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
/**Where a stage stands in this archive. `pending` is the only non-final
value. Once a stage of a stored bundle is final, its record and its members
never change for that bundle key: the backend never re-runs a final stage
(the CLI could, and would rebuild the same bytes, cli-spec.md §5.2.1).
`bundle-format.md` §3.1 lists which statuses each stage can reach.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Where a stage stands in this archive. `pending` is the only non-final\nvalue. Once a stage of a stored bundle is final, its record and its members\nnever change for that bundle key: the backend never re-runs a final stage\n(the CLI could, and would rebuild the same bytes, cli-spec.md §5.2.1).\n`bundle-format.md` §3.1 lists which statuses each stage can reach.",
///  "type": "string",
///  "enum": [
///    "pending",
///    "complete",
///    "partial",
///    "failed",
///    "skipped"
///  ]
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize,
    ::serde::Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum BundleManifestStageStatus {
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "complete")]
    Complete,
    #[serde(rename = "partial")]
    Partial,
    #[serde(rename = "failed")]
    Failed,
    #[serde(rename = "skipped")]
    Skipped,
}
impl ::std::fmt::Display for BundleManifestStageStatus {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Pending => f.write_str("pending"),
            Self::Complete => f.write_str("complete"),
            Self::Partial => f.write_str("partial"),
            Self::Failed => f.write_str("failed"),
            Self::Skipped => f.write_str("skipped"),
        }
    }
}
impl ::std::str::FromStr for BundleManifestStageStatus {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "pending" => Ok(Self::Pending),
            "complete" => Ok(Self::Complete),
            "partial" => Ok(Self::Partial),
            "failed" => Ok(Self::Failed),
            "skipped" => Ok(Self::Skipped),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for BundleManifestStageStatus {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for BundleManifestStageStatus {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for BundleManifestStageStatus {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///One record per stage of ADR §4.4. Readers use them to know which members exist, which will come and which never will (`bundle-format.md` §3.3).
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "One record per stage of ADR §4.4. Readers use them to know which members exist, which will come and which never will (`bundle-format.md` §3.3).",
///  "type": "object",
///  "required": [
///    "board",
///    "models",
///    "parse"
///  ],
///  "properties": {
///    "board": {
///      "description": "Stage board.",
///      "$ref": "#/$defs/BundleManifestBoardStage"
///    },
///    "models": {
///      "description": "Stage models.",
///      "$ref": "#/$defs/BundleManifestModelsStage"
///    },
///    "parse": {
///      "description": "Stage parse.",
///      "$ref": "#/$defs/BundleManifestParseStage"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct BundleManifestStages {
    ///Stage parse.
    pub parse: BundleManifestParseStage,
    ///Stage board.
    pub board: BundleManifestBoardStage,
    ///Stage models.
    pub models: BundleManifestModelsStage,
}
///A size in bytes: a non-negative safe integer.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A size in bytes: a non-negative safe integer.",
///  "type": "integer",
///  "minimum": 0.0
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct ByteCount(pub u64);
impl ::std::ops::Deref for ByteCount {
    type Target = u64;
    fn deref(&self) -> &u64 {
        &self.0
    }
}
impl ::std::convert::From<ByteCount> for u64 {
    fn from(value: ByteCount) -> Self {
        value.0
    }
}
impl ::std::convert::From<u64> for ByteCount {
    fn from(value: u64) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for ByteCount {
    type Err = <u64 as ::std::str::FromStr>::Err;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.parse()?))
    }
}
impl ::std::convert::TryFrom<&str> for ByteCount {
    type Error = <u64 as ::std::str::FromStr>::Err;
    fn try_from(value: &str) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<String> for ByteCount {
    type Error = <u64 as ::std::str::FromStr>::Err;
    fn try_from(value: String) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::fmt::Display for ByteCount {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
///A finding with a stable code, a message for people and an optional location.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A finding with a stable code, a message for people and an optional location.",
///  "type": "object",
///  "required": [
///    "code",
///    "message"
///  ],
///  "properties": {
///    "code": {
///      "description": "Stable code (cli-spec.md §8) that tools and tests match on.",
///      "$ref": "#/$defs/DiagnosticCode"
///    },
///    "location": {
///      "description": "Where the finding is, when known.",
///      "$ref": "#/$defs/CliLocation"
///    },
///    "message": {
///      "description": "One-sentence explanation for people. It never contains a host path; its wording may change between versions.",
///      "type": "string",
///      "minLength": 1
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CliFinding {
    ///Stable code (cli-spec.md §8) that tools and tests match on.
    pub code: DiagnosticCode,
    ///One-sentence explanation for people. It never contains a host path; its wording may change between versions.
    pub message: CliFindingMessage,
    ///Where the finding is, when known.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub location: ::std::option::Option<CliLocation>,
}
///One-sentence explanation for people. It never contains a host path; its wording may change between versions.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "One-sentence explanation for people. It never contains a host path; its wording may change between versions.",
///  "type": "string",
///  "minLength": 1
///}
/// ```
/// </details>
#[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct CliFindingMessage(::std::string::String);
impl ::std::ops::Deref for CliFindingMessage {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<CliFindingMessage> for ::std::string::String {
    fn from(value: CliFindingMessage) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for CliFindingMessage {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for CliFindingMessage {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for CliFindingMessage {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CliFindingMessage {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for CliFindingMessage {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
/**A JSON Pointer (RFC 6901) into a JSON file: empty for the whole document,
otherwise `/`-separated reference tokens with `~0` for `~` and `~1` for `/`.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A JSON Pointer (RFC 6901) into a JSON file: empty for the whole document,\notherwise `/`-separated reference tokens with `~0` for `~` and `~1` for `/`.",
///  "type": "string"
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize, ::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd,
)]
#[serde(transparent)]
pub struct CliJsonPointer(pub ::std::string::String);
impl ::std::ops::Deref for CliJsonPointer {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<CliJsonPointer> for ::std::string::String {
    fn from(value: CliJsonPointer) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::string::String> for CliJsonPointer {
    fn from(value: ::std::string::String) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for CliJsonPointer {
    type Err = ::std::convert::Infallible;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.to_string()))
    }
}
impl ::std::fmt::Display for CliJsonPointer {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
///KiCad's current `(version N)` per source format, declared in code point order.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "KiCad's current `(version N)` per source format, declared in code point order.",
///  "type": "object",
///  "required": [
///    "board",
///    "schematic"
///  ],
///  "properties": {
///    "board": {
///      "description": "`.kicad_pcb`, for example `20260206`.",
///      "type": "integer",
///      "maximum": 99991231.0,
///      "minimum": 20000000.0
///    },
///    "schematic": {
///      "description": "`.kicad_sch`, for example `20260306`.",
///      "type": "integer",
///      "maximum": 99991231.0,
///      "minimum": 20000000.0
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CliKicadFileFormats {
    ///`.kicad_pcb`, for example `20260206`.
    pub board: i64,
    ///`.kicad_sch`, for example `20260306`.
    pub schematic: i64,
}
/**Where a finding is. Every field is optional; a field is present only when
it is known. The field names are single words so the model can move to
common.tsp unchanged and serve camelCase documents too.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Where a finding is. Every field is optional; a field is present only when\nit is known. The field names are single words so the model can move to\ncommon.tsp unchanged and serve camelCase documents too.",
///  "type": "object",
///  "properties": {
///    "column": {
///      "description": "One-based column, counted in Unicode scalar values, on `line`.",
///      "$ref": "#/$defs/CliOneBased"
///    },
///    "line": {
///      "description": "One-based line of the finding in a text file.",
///      "$ref": "#/$defs/CliOneBased"
///    },
///    "offset": {
///      "description": "Zero-based byte offset of the finding from the start of the file.",
///      "$ref": "#/$defs/ByteCount"
///    },
///    "path": {
///      "description": "The file, named by the path it has as a bundle member, whether or not a\nbundle has been written yet: `sources/<RepoPath>` for a source file,\n`refilled/<board file name>` for the `--refilled-board` input (refill mode only),\n`viewer/models/components.glb` for the `--models-glb` input,\nthe member path itself for a member of an existing bundle. Absent when the finding\nis about an argument file that is not a member (`--config`) or about no\nfile at all.",
///      "$ref": "#/$defs/ArchivePath"
///    },
///    "pointer": {
///      "description": "JSON Pointer to the value in a JSON file (a `.kicad_pro`, `--config`, or a JSON member).",
///      "$ref": "#/$defs/CliJsonPointer"
///    },
///    "uuid": {
///      "description": "UUID of the KiCad object the finding is about, as written in the file.",
///      "$ref": "#/$defs/KiCadUuid"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CliLocation {
    /**The file, named by the path it has as a bundle member, whether or not a
    bundle has been written yet: `sources/<RepoPath>` for a source file,
    `refilled/<board file name>` for the `--refilled-board` input (refill mode only),
    `viewer/models/components.glb` for the `--models-glb` input,
    the member path itself for a member of an existing bundle. Absent when the finding
    is about an argument file that is not a member (`--config`) or about no
    file at all.*/
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub path: ::std::option::Option<ArchivePath>,
    ///One-based line of the finding in a text file.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub line: ::std::option::Option<CliOneBased>,
    ///One-based column, counted in Unicode scalar values, on `line`.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub column: ::std::option::Option<CliOneBased>,
    ///Zero-based byte offset of the finding from the start of the file.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub offset: ::std::option::Option<ByteCount>,
    ///JSON Pointer to the value in a JSON file (a `.kicad_pro`, `--config`, or a JSON member).
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub pointer: ::std::option::Option<CliJsonPointer>,
    ///UUID of the KiCad object the finding is about, as written in the file.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub uuid: ::std::option::Option<KiCadUuid>,
}
impl ::std::default::Default for CliLocation {
    fn default() -> Self {
        Self {
            column: Default::default(),
            line: Default::default(),
            offset: Default::default(),
            path: Default::default(),
            pointer: Default::default(),
            uuid: Default::default(),
        }
    }
}
/**The component-model export the backend runs before stage `models`
(cli-spec.md §9.3). Pinned in the generator id because its output is a
bundle member.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "The component-model export the backend runs before stage `models`\n(cli-spec.md §9.3). Pinned in the generator id because its output is a\nbundle member.",
///  "type": "string",
///  "enum": [
///    "kicad-cli-glb-a0"
///  ]
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize,
    ::serde::Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum CliModelsProcedure {
    #[serde(rename = "kicad-cli-glb-a0")]
    KicadCliGlbA0,
}
impl ::std::fmt::Display for CliModelsProcedure {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::KicadCliGlbA0 => f.write_str("kicad-cli-glb-a0"),
        }
    }
}
impl ::std::str::FromStr for CliModelsProcedure {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "kicad-cli-glb-a0" => Ok(Self::KicadCliGlbA0),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CliModelsProcedure {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for CliModelsProcedure {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CliModelsProcedure {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///A one-based line or column number.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A one-based line or column number.",
///  "type": "integer",
///  "minimum": 1.0
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct CliOneBased(pub ::std::num::NonZeroU64);
impl ::std::ops::Deref for CliOneBased {
    type Target = ::std::num::NonZeroU64;
    fn deref(&self) -> &::std::num::NonZeroU64 {
        &self.0
    }
}
impl ::std::convert::From<CliOneBased> for ::std::num::NonZeroU64 {
    fn from(value: CliOneBased) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::num::NonZeroU64> for CliOneBased {
    fn from(value: ::std::num::NonZeroU64) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for CliOneBased {
    type Err = <::std::num::NonZeroU64 as ::std::str::FromStr>::Err;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.parse()?))
    }
}
impl ::std::convert::TryFrom<&str> for CliOneBased {
    type Error = <::std::num::NonZeroU64 as ::std::str::FromStr>::Err;
    fn try_from(value: &str) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<String> for CliOneBased {
    type Error = <::std::num::NonZeroU64 as ::std::str::FromStr>::Err;
    fn try_from(value: String) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::fmt::Display for CliOneBased {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
/**The zone-refill procedure the backend runs before stage `board`
(cli-spec.md §9.2). Pinned in the generator id because its output is a
bundle member.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "The zone-refill procedure the backend runs before stage `board`\n(cli-spec.md §9.2). Pinned in the generator id because its output is a\nbundle member.",
///  "type": "string",
///  "enum": [
///    "pcbnew-zone-filler-a0"
///  ]
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize,
    ::serde::Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum CliRefillProcedure {
    #[serde(rename = "pcbnew-zone-filler-a0")]
    PcbnewZoneFillerA0,
}
impl ::std::fmt::Display for CliRefillProcedure {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::PcbnewZoneFillerA0 => f.write_str("pcbnew-zone-filler-a0"),
        }
    }
}
impl ::std::str::FromStr for CliRefillProcedure {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "pcbnew-zone-filler-a0" => Ok(Self::PcbnewZoneFillerA0),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CliRefillProcedure {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for CliRefillProcedure {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CliRefillProcedure {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
/**A release version of three dot-separated decimal numbers without leading
zeros, for example `0.1.0` (SemVer), `2026.9.7` (the fork's CalVer) or
`10.0.6` (KiCad, as `kicad-cli version` prints it). Printable ASCII only,
which keeps the generator id's canonical form unambiguous (cli-spec.md §5.1).*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A release version of three dot-separated decimal numbers without leading\nzeros, for example `0.1.0` (SemVer), `2026.9.7` (the fork's CalVer) or\n`10.0.6` (KiCad, as `kicad-cli version` prints it). Printable ASCII only,\nwhich keeps the generator id's canonical form unambiguous (cli-spec.md §5.1).",
///  "type": "string"
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize, ::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd,
)]
#[serde(transparent)]
pub struct CliReleaseVersion(pub ::std::string::String);
impl ::std::ops::Deref for CliReleaseVersion {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<CliReleaseVersion> for ::std::string::String {
    fn from(value: CliReleaseVersion) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::string::String> for CliReleaseVersion {
    fn from(value: ::std::string::String) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for CliReleaseVersion {
    type Err = ::std::convert::Infallible;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.to_string()))
    }
}
impl ::std::fmt::Display for CliReleaseVersion {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
/**The source-upgrade procedure the backend runs before stage `parse`
(cli-spec.md §9.4). Pinned in the generator id because its output is the
bytes of upgraded source members.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "The source-upgrade procedure the backend runs before stage `parse`\n(cli-spec.md §9.4). Pinned in the generator id because its output is the\nbytes of upgraded source members.",
///  "type": "string",
///  "enum": [
///    "kicad-seeded-upgrade-a0"
///  ]
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize,
    ::serde::Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum CliUpgradeProcedure {
    #[serde(rename = "kicad-seeded-upgrade-a0")]
    KicadSeededUpgradeA0,
}
impl ::std::fmt::Display for CliUpgradeProcedure {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::KicadSeededUpgradeA0 => f.write_str("kicad-seeded-upgrade-a0"),
        }
    }
}
impl ::std::str::FromStr for CliUpgradeProcedure {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "kicad-seeded-upgrade-a0" => Ok(Self::KicadSeededUpgradeA0),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CliUpgradeProcedure {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for CliUpgradeProcedure {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CliUpgradeProcedure {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
/**The generator id: the stdout of `prism-kicad version`. It states everything
that decides the bytes of a bundle besides the sources (ADR §5), and is
bumped explicitly, never derived from binary or source bytes.

Fields are declared in canonical order: `schema` first, then the other keys
in code point order, which is also the order inside every nested object.
The canonical bytes (cli-spec.md §5.1) are that compact serialization; the
generator digest and the bundle key are SHA-256 over them.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "title": "prism-kicad version a0",
///  "description": "The generator id: the stdout of `prism-kicad version`. It states everything\nthat decides the bytes of a bundle besides the sources (ADR §5), and is\nbumped explicitly, never derived from binary or source bytes.\n\nFields are declared in canonical order: `schema` first, then the other keys\nin code point order, which is also the order inside every nested object.\nThe canonical bytes (cli-spec.md §5.1) are that compact serialization; the\ngenerator digest and the bundle key are SHA-256 over them.",
///  "type": "object",
///  "required": [
///    "crate_version",
///    "engine_version",
///    "kicad_file_formats",
///    "kicad_version",
///    "member_schemas",
///    "models_procedure",
///    "pack_format_version",
///    "refill_procedure",
///    "schema",
///    "upgrade_procedure"
///  ],
///  "properties": {
///    "crate_version": {
///      "description": "Version of the `prism-kicad-cli` crate. Bumped whenever any member's\nbytes or any recorded stage outcome could change for the same inputs:\nthe core, a projection producer, the manifest or archive writer, or the\nGLB canonicalization (cli-spec.md §5.1.2).",
///      "$ref": "#/$defs/CliReleaseVersion"
///    },
///    "engine_version": {
///      "description": "Version of the parser core crate (`ENGINE_VERSION`, the fork's `kicad-monkey-core`, `prism-kicad-core` after WP-F2).",
///      "$ref": "#/$defs/CliReleaseVersion"
///    },
///    "kicad_file_formats": {
///      "description": "The current file formats of `kicad_version`: the `(version N)` KiCad\nwrites. Sources older than them are upgraded before stage `parse`\n(cli-spec.md §9.4), and the parser reads only these formats, so they\ndecide every parsed member's bytes. Raised with `kicad_version`.",
///      "$ref": "#/$defs/CliKicadFileFormats"
///    },
///    "kicad_version": {
///      "description": "KiCad version of the KiCad-produced members (the refilled board and\n`components.glb`), exactly as `kicad-cli version` prints it. It also\npins KiCad's stock 3D model library. `--refill-tool` and\n`--models-tool` must have its major.minor; patch releases are tolerated.",
///      "$ref": "#/$defs/CliReleaseVersion"
///    },
///    "member_schemas": {
///      "description": "Every member this generator writes with a schema (`bundle.json`,\n`design.json`, the materialization and every projection) and its schema\nid, sorted by `path` in code point order.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/CliVersionMemberSchema"
///      },
///      "minItems": 1
///    },
///    "models_procedure": {
///      "description": "The procedure the backend must use to produce `--models-glb`.",
///      "$ref": "#/$defs/CliModelsProcedure"
///    },
///    "pack_format_version": {
///      "description": "Format version of the packed materialization encoding (`PACK_FORMAT_VERSION` of the materialization-pack crate), which the materialization schema id does not pin.",
///      "type": "integer",
///      "maximum": 65535.0,
///      "minimum": 0.0
///    },
///    "refill_procedure": {
///      "description": "The procedure the backend must use to produce `--refilled-board`.",
///      "$ref": "#/$defs/CliRefillProcedure"
///    },
///    "schema": {
///      "description": "Document schema id.",
///      "type": "string",
///      "const": "prism.cli.version.a0"
///    },
///    "upgrade_procedure": {
///      "description": "The procedure the backend must use to upgrade sources older than `kicad_version`'s file format before stage `parse` (cli-spec.md §9.4).",
///      "$ref": "#/$defs/CliUpgradeProcedure"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CliVersionA0 {
    ///Document schema id.
    pub schema: ::std::string::String,
    /**Version of the `prism-kicad-cli` crate. Bumped whenever any member's
    bytes or any recorded stage outcome could change for the same inputs:
    the core, a projection producer, the manifest or archive writer, or the
    GLB canonicalization (cli-spec.md §5.1.2).*/
    pub crate_version: CliReleaseVersion,
    ///Version of the parser core crate (`ENGINE_VERSION`, the fork's `kicad-monkey-core`, `prism-kicad-core` after WP-F2).
    pub engine_version: CliReleaseVersion,
    /**The current file formats of `kicad_version`: the `(version N)` KiCad
    writes. Sources older than them are upgraded before stage `parse`
    (cli-spec.md §9.4), and the parser reads only these formats, so they
    decide every parsed member's bytes. Raised with `kicad_version`.*/
    pub kicad_file_formats: CliKicadFileFormats,
    /**KiCad version of the KiCad-produced members (the refilled board and
    `components.glb`), exactly as `kicad-cli version` prints it. It also
    pins KiCad's stock 3D model library. `--refill-tool` and
    `--models-tool` must have its major.minor; patch releases are tolerated.*/
    pub kicad_version: CliReleaseVersion,
    /**Every member this generator writes with a schema (`bundle.json`,
    `design.json`, the materialization and every projection) and its schema
    id, sorted by `path` in code point order.*/
    pub member_schemas: ::std::vec::Vec<CliVersionMemberSchema>,
    ///The procedure the backend must use to produce `--models-glb`.
    pub models_procedure: CliModelsProcedure,
    ///Format version of the packed materialization encoding (`PACK_FORMAT_VERSION` of the materialization-pack crate), which the materialization schema id does not pin.
    pub pack_format_version: u16,
    ///The procedure the backend must use to produce `--refilled-board`.
    pub refill_procedure: CliRefillProcedure,
    ///The procedure the backend must use to upgrade sources older than `kicad_version`'s file format before stage `parse` (cli-spec.md §9.4).
    pub upgrade_procedure: CliUpgradeProcedure,
}
///One member the generator writes with a schema, and that schema's id.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "One member the generator writes with a schema, and that schema's id.",
///  "type": "object",
///  "required": [
///    "path",
///    "schema"
///  ],
///  "properties": {
///    "path": {
///      "description": "The member's archive path, for example `projections/stackup.json`.",
///      "$ref": "#/$defs/ArchivePath"
///    },
///    "schema": {
///      "description": "The schema id the member's content follows, for example `prism.stackup.a0`.",
///      "$ref": "#/$defs/SchemaId"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CliVersionMemberSchema {
    ///The member's archive path, for example `projections/stackup.json`.
    pub path: ArchivePath,
    ///The schema id the member's content follows, for example `prism.stackup.a0`.
    pub schema: SchemaId,
}
///A count of things: a non-negative safe integer.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A count of things: a non-negative safe integer.",
///  "type": "integer",
///  "minimum": 0.0
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct Count(pub u64);
impl ::std::ops::Deref for Count {
    type Target = u64;
    fn deref(&self) -> &u64 {
        &self.0
    }
}
impl ::std::convert::From<Count> for u64 {
    fn from(value: Count) -> Self {
        value.0
    }
}
impl ::std::convert::From<u64> for Count {
    fn from(value: u64) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for Count {
    type Err = <u64 as ::std::str::FromStr>::Err;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.parse()?))
    }
}
impl ::std::convert::TryFrom<&str> for Count {
    type Error = <u64 as ::std::str::FromStr>::Err;
    fn try_from(value: &str) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<String> for Count {
    type Error = <u64 as ::std::str::FromStr>::Err;
    fn try_from(value: String) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::fmt::Display for Count {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
/**Stable machine-readable code of a finding, in lowercase kebab-case, for
example `stale-saved-fills` or `net-mismatch`. A code never changes meaning
once published; a new meaning gets a new code.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Stable machine-readable code of a finding, in lowercase kebab-case, for\nexample `stale-saved-fills` or `net-mismatch`. A code never changes meaning\nonce published; a new meaning gets a new code.",
///  "type": "string"
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize, ::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd,
)]
#[serde(transparent)]
pub struct DiagnosticCode(pub ::std::string::String);
impl ::std::ops::Deref for DiagnosticCode {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<DiagnosticCode> for ::std::string::String {
    fn from(value: DiagnosticCode) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::string::String> for DiagnosticCode {
    fn from(value: ::std::string::String) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for DiagnosticCode {
    type Err = ::std::convert::Infallible;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.to_string()))
    }
}
impl ::std::fmt::Display for DiagnosticCode {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
/**Git object id in lowercase hexadecimal: 40 characters in a SHA-1
repository, 64 in a SHA-256 repository. Used for commit ids and blob ids.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Git object id in lowercase hexadecimal: 40 characters in a SHA-1\nrepository, 64 in a SHA-256 repository. Used for commit ids and blob ids.",
///  "type": "string"
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize, ::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd,
)]
#[serde(transparent)]
pub struct GitObjectId(pub ::std::string::String);
impl ::std::ops::Deref for GitObjectId {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<GitObjectId> for ::std::string::String {
    fn from(value: GitObjectId) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::string::String> for GitObjectId {
    fn from(value: ::std::string::String) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for GitObjectId {
    type Err = ::std::convert::Infallible;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.to_string()))
    }
}
impl ::std::fmt::Display for GitObjectId {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
/**KiCad object UUID in the canonical form KiCad writes (`KIID::AsString`):
lowercase hexadecimal, 8-4-4-4-12. Copied from the file, never generated
or re-cased.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "KiCad object UUID in the canonical form KiCad writes (`KIID::AsString`):\nlowercase hexadecimal, 8-4-4-4-12. Copied from the file, never generated\nor re-cased.",
///  "type": "string"
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize, ::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd,
)]
#[serde(transparent)]
pub struct KiCadUuid(pub ::std::string::String);
impl ::std::ops::Deref for KiCadUuid {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<KiCadUuid> for ::std::string::String {
    fn from(value: KiCadUuid) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::string::String> for KiCadUuid {
    fn from(value: ::std::string::String) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for KiCadUuid {
    type Err = ::std::convert::Infallible;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.to_string()))
    }
}
impl ::std::fmt::Display for KiCadUuid {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
/**KiCad full net name as KiCad resolves it, including the sheet path prefix
of a local net (`/Power/VBUS`), a global name (`GND`) or a generated name
(`Net-(R1-Pad2)`, `unconnected-(U1-PA0-Pad3)`). "No net" is expressed by
omitting the field, never by an empty name.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "KiCad full net name as KiCad resolves it, including the sheet path prefix\nof a local net (`/Power/VBUS`), a global name (`GND`) or a generated name\n(`Net-(R1-Pad2)`, `unconnected-(U1-PA0-Pad3)`). \"No net\" is expressed by\nomitting the field, never by an empty name.",
///  "type": "string",
///  "minLength": 1
///}
/// ```
/// </details>
#[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct NetName(::std::string::String);
impl ::std::ops::Deref for NetName {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<NetName> for ::std::string::String {
    fn from(value: NetName) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for NetName {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for NetName {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for NetName {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for NetName {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for NetName {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
/**Repository-relative POSIX path, exactly as `git ls-tree` names the entry:
`/`-separated, case preserved, no leading `/`, no empty, `.` or `..`
segment, no backslash and no `:`. The same character rule as ArchivePath.
It is the only path type in bundle documents: a file has one spelling
whichever project in the repository refers to it, and a file outside the
project directory needs no `..`.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Repository-relative POSIX path, exactly as `git ls-tree` names the entry:\n`/`-separated, case preserved, no leading `/`, no empty, `.` or `..`\nsegment, no backslash and no `:`. The same character rule as ArchivePath.\nIt is the only path type in bundle documents: a file has one spelling\nwhichever project in the repository refers to it, and a file outside the\nproject directory needs no `..`.",
///  "type": "string"
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize, ::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd,
)]
#[serde(transparent)]
pub struct RepoPath(pub ::std::string::String);
impl ::std::ops::Deref for RepoPath {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<RepoPath> for ::std::string::String {
    fn from(value: RepoPath) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::string::String> for RepoPath {
    fn from(value: ::std::string::String) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for RepoPath {
    type Err = ::std::convert::Infallible;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.to_string()))
    }
}
impl ::std::fmt::Display for RepoPath {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
/**The effective project configuration: everything outside the source files
that changes which files are the project or how they are read. Prism
resolves it (stored settings over the committed `.prism.json` over
detection), by the same function for a commit and for a working tree; the
CLI only validates and hashes it. Its canonical bytes, hashed into the key,
are the compact JSON of exactly these fields in this order with absent
optional fields omitted (revision-key.md, "Canonical config bytes"). All
paths are repository-relative.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "title": "Revision key effective config a1",
///  "description": "The effective project configuration: everything outside the source files\nthat changes which files are the project or how they are read. Prism\nresolves it (stored settings over the committed `.prism.json` over\ndetection), by the same function for a commit and for a working tree; the\nCLI only validates and hashes it. Its canonical bytes, hashed into the key,\nare the compact JSON of exactly these fields in this order with absent\noptional fields omitted (revision-key.md, \"Canonical config bytes\"). All\npaths are repository-relative.",
///  "type": "object",
///  "required": [
///    "excluded_dirs",
///    "project_file",
///    "schema"
///  ],
///  "properties": {
///    "board": {
///      "description": "The board the build parses (ends in `.kicad_pcb`). Absent when the\nproject has none or Prism resolved none. Must be a blob entry of the\nlisting when present.",
///      "$ref": "#/$defs/RepoPath"
///    },
///    "excluded_dirs": {
///      "description": "Directories whose entries are never selected: Prism's resolved\ndesign-output and manufacturing-output directories, whether or not they\nexist at this revision. Sorted by UTF-8 bytes, strictly increasing; no\nelement lies under another; none contains `project_file`,\n`root_schematic` or `board`. Empty when nothing is excluded.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/RepoPath"
///      }
///    },
///    "project_file": {
///      "description": "The project anchor: the resolved `.kicad_pro` (its last segment ends in\n`.kicad_pro`, ASCII case-insensitive). Its directory is KiCad's\n`KIPRJMOD`. Must be a blob entry of the listing.",
///      "$ref": "#/$defs/RepoPath"
///    },
///    "root_schematic": {
///      "description": "The root schematic the build parses (ends in `.kicad_sch`). Absent when\nthe project has none or Prism resolved none. Must be a blob entry of the\nlisting when present.",
///      "$ref": "#/$defs/RepoPath"
///    },
///    "schema": {
///      "description": "Document schema id.",
///      "type": "string",
///      "const": "prism.revision_key.effective_config.a1"
///    },
///    "zone_fills": {
///      "description": "Zone-fill handling of the board stage, from Prism's stored project\nsetting `zoneFills`. Absent means `refill`; the only value ever written\nis `saved`, and an explicit `refill` is `config-invalid`, so each config\nhas one spelling. Last in the canonical key order, so a config without it\nkeeps its canonical bytes.",
///      "$ref": "#/$defs/RevisionKeyZoneFills"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct RevisionKeyEffectiveConfigA1 {
    ///Document schema id.
    pub schema: ::std::string::String,
    /**The project anchor: the resolved `.kicad_pro` (its last segment ends in
    `.kicad_pro`, ASCII case-insensitive). Its directory is KiCad's
    `KIPRJMOD`. Must be a blob entry of the listing.*/
    pub project_file: RepoPath,
    /**The root schematic the build parses (ends in `.kicad_sch`). Absent when
    the project has none or Prism resolved none. Must be a blob entry of the
    listing when present.*/
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub root_schematic: ::std::option::Option<RepoPath>,
    /**The board the build parses (ends in `.kicad_pcb`). Absent when the
    project has none or Prism resolved none. Must be a blob entry of the
    listing when present.*/
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub board: ::std::option::Option<RepoPath>,
    /**Directories whose entries are never selected: Prism's resolved
    design-output and manufacturing-output directories, whether or not they
    exist at this revision. Sorted by UTF-8 bytes, strictly increasing; no
    element lies under another; none contains `project_file`,
    `root_schematic` or `board`. Empty when nothing is excluded.*/
    pub excluded_dirs: ::std::vec::Vec<RepoPath>,
    /**Zone-fill handling of the board stage, from Prism's stored project
    setting `zoneFills`. Absent means `refill`; the only value ever written
    is `saved`, and an explicit `refill` is `config-invalid`, so each config
    has one spelling. Last in the canonical key order, so a config without it
    keeps its canonical bytes.*/
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub zone_fills: ::std::option::Option<RevisionKeyZoneFills>,
}
/**Kind of a source-set entry, fixed by its git tree mode and object type. The
hashed framing spells each kind as git does (revision-key.md, "Hashing").*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Kind of a source-set entry, fixed by its git tree mode and object type. The\nhashed framing spells each kind as git does (revision-key.md, \"Hashing\").",
///  "type": "string",
///  "enum": [
///    "regular",
///    "executable",
///    "symlink",
///    "gitlink"
///  ]
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize,
    ::serde::Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum RevisionKeyEntryKind {
    #[serde(rename = "regular")]
    Regular,
    #[serde(rename = "executable")]
    Executable,
    #[serde(rename = "symlink")]
    Symlink,
    #[serde(rename = "gitlink")]
    Gitlink,
}
impl ::std::fmt::Display for RevisionKeyEntryKind {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Regular => f.write_str("regular"),
            Self::Executable => f.write_str("executable"),
            Self::Symlink => f.write_str("symlink"),
            Self::Gitlink => f.write_str("gitlink"),
        }
    }
}
impl ::std::str::FromStr for RevisionKeyEntryKind {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "regular" => Ok(Self::Regular),
            "executable" => Ok(Self::Executable),
            "symlink" => Ok(Self::Symlink),
            "gitlink" => Ok(Self::Gitlink),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for RevisionKeyEntryKind {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for RevisionKeyEntryKind {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for RevisionKeyEntryKind {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
/**How the board stage obtains zone fills (revision-key.md §4; cli-spec.md
§5.2.3). The config writes only `saved`: the default is spelled by
omitting the field, and an explicit `refill` is `config-invalid`.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "How the board stage obtains zone fills (revision-key.md §4; cli-spec.md\n§5.2.3). The config writes only `saved`: the default is spelled by\nomitting the field, and an explicit `refill` is `config-invalid`.",
///  "type": "string",
///  "enum": [
///    "refill",
///    "saved"
///  ]
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize,
    ::serde::Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum RevisionKeyZoneFills {
    #[serde(rename = "refill")]
    Refill,
    #[serde(rename = "saved")]
    Saved,
}
impl ::std::fmt::Display for RevisionKeyZoneFills {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Refill => f.write_str("refill"),
            Self::Saved => f.write_str("saved"),
        }
    }
}
impl ::std::str::FromStr for RevisionKeyZoneFills {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "refill" => Ok(Self::Refill),
            "saved" => Ok(Self::Saved),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for RevisionKeyZoneFills {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for RevisionKeyZoneFills {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for RevisionKeyZoneFills {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
/**Id of a JSON document schema, `<family>.<name>.<version>`: for example
`prism.stackup.a0`, `prism.bundle.manifest.a2`, `prism.system_interface.v1`
or `kicad_monkey.design.a0`. Lowercase, dot-separated, ending in the
version (`a<N>` while pre-stable, `v<N>` once stable).*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Id of a JSON document schema, `<family>.<name>.<version>`: for example\n`prism.stackup.a0`, `prism.bundle.manifest.a2`, `prism.system_interface.v1`\nor `kicad_monkey.design.a0`. Lowercase, dot-separated, ending in the\nversion (`a<N>` while pre-stable, `v<N>` once stable).",
///  "type": "string"
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize, ::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd,
)]
#[serde(transparent)]
pub struct SchemaId(pub ::std::string::String);
impl ::std::ops::Deref for SchemaId {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SchemaId> for ::std::string::String {
    fn from(value: SchemaId) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::string::String> for SchemaId {
    fn from(value: ::std::string::String) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for SchemaId {
    type Err = ::std::convert::Infallible;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.to_string()))
    }
}
impl ::std::fmt::Display for SchemaId {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
///Lowercase hexadecimal SHA-256 digest: exactly 64 characters, no prefix such as `sha256:`.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Lowercase hexadecimal SHA-256 digest: exactly 64 characters, no prefix such as `sha256:`.",
///  "type": "string"
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize, ::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd,
)]
#[serde(transparent)]
pub struct Sha256Hex(pub ::std::string::String);
impl ::std::ops::Deref for Sha256Hex {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<Sha256Hex> for ::std::string::String {
    fn from(value: Sha256Hex) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::string::String> for Sha256Hex {
    fn from(value: ::std::string::String) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for Sha256Hex {
    type Err = ::std::convert::Infallible;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.to_string()))
    }
}
impl ::std::fmt::Display for Sha256Hex {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
/**A finding with a stable code and a human-readable message. Whether it is a
warning or an error is given by the array that holds it. Field names are
the same in snake_case and camelCase documents.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A finding with a stable code and a human-readable message. Whether it is a\nwarning or an error is given by the array that holds it. Field names are\nthe same in snake_case and camelCase documents.",
///  "type": "object",
///  "required": [
///    "code",
///    "message"
///  ],
///  "properties": {
///    "code": {
///      "description": "Stable code that tools and tests match on.",
///      "$ref": "#/$defs/DiagnosticCode"
///    },
///    "message": {
///      "description": "One-sentence explanation for people; its wording may change between versions.",
///      "type": "string",
///      "minLength": 1
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Warning {
    ///Stable code that tools and tests match on.
    pub code: DiagnosticCode,
    ///One-sentence explanation for people; its wording may change between versions.
    pub message: WarningMessage,
}
///One-sentence explanation for people; its wording may change between versions.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "One-sentence explanation for people; its wording may change between versions.",
///  "type": "string",
///  "minLength": 1
///}
/// ```
/// </details>
#[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct WarningMessage(::std::string::String);
impl ::std::ops::Deref for WarningMessage {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<WarningMessage> for ::std::string::String {
    fn from(value: WarningMessage) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for WarningMessage {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for WarningMessage {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for WarningMessage {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for WarningMessage {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for WarningMessage {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
impl<'de> ::serde::Deserialize<'de> for BundleManifestListingDirectory {
    #[allow(
        clippy::too_many_lines,
        reason = "generated: one dispatch arm per union variant"
    )]
    fn deserialize<D: ::serde::Deserializer<'de>>(
        deserializer: D,
    ) -> ::std::result::Result<Self, D::Error> {
        let value = <::serde_json::Value as ::serde::Deserialize>::deserialize(deserializer)?;
        if let Ok(inner) = ::serde_json::from_value::<RepoPath>(value.clone()) {
            return Ok(Self::RepoPath(inner));
        }
        if let Ok(inner) = ::serde_json::from_value::<::std::string::String>(value.clone()) {
            return Ok(Self::String(inner));
        }
        Err(<D::Error as ::serde::de::Error>::custom(
            "data did not match any variant of untagged enum BundleManifestListingDirectory",
        ))
    }
}
