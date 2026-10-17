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
///The condition of `bundle reuse` that failed first (cli-spec.md §5.10, ADR amendment K2 §3.3).
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "The condition of `bundle reuse` that failed first (cli-spec.md §5.10, ADR amendment K2 §3.3).",
///  "type": "string",
///  "enum": [
///    "config",
///    "generator",
///    "model-unavailable",
///    "read",
///    "probe",
///    "listing",
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
pub enum CliReuseCondition {
    #[serde(rename = "config")]
    Config,
    #[serde(rename = "generator")]
    Generator,
    #[serde(rename = "model-unavailable")]
    ModelUnavailable,
    #[serde(rename = "read")]
    Read,
    #[serde(rename = "probe")]
    Probe,
    #[serde(rename = "listing")]
    Listing,
    #[serde(rename = "gitlink")]
    Gitlink,
}
impl ::std::fmt::Display for CliReuseCondition {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Config => f.write_str("config"),
            Self::Generator => f.write_str("generator"),
            Self::ModelUnavailable => f.write_str("model-unavailable"),
            Self::Read => f.write_str("read"),
            Self::Probe => f.write_str("probe"),
            Self::Listing => f.write_str("listing"),
            Self::Gitlink => f.write_str("gitlink"),
        }
    }
}
impl ::std::str::FromStr for CliReuseCondition {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "config" => Ok(Self::Config),
            "generator" => Ok(Self::Generator),
            "model-unavailable" => Ok(Self::ModelUnavailable),
            "read" => Ok(Self::Read),
            "probe" => Ok(Self::Probe),
            "listing" => Ok(Self::Listing),
            "gitlink" => Ok(Self::Gitlink),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CliReuseCondition {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for CliReuseCondition {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CliReuseCondition {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///Why a read set does not hold.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Why a read set does not hold.",
///  "type": "object",
///  "required": [
///    "condition",
///    "message"
///  ],
///  "properties": {
///    "condition": {
///      "description": "The first condition, in the order of this enum, that failed.",
///      "$ref": "#/$defs/CliReuseCondition"
///    },
///    "message": {
///      "description": "One sentence for logs.",
///      "type": "string"
///    },
///    "path": {
///      "description": "The repository path the condition failed on, the first in code point order; absent for `config`, `generator` and `model-unavailable`.",
///      "$ref": "#/$defs/RepoPath"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CliReuseFailure {
    ///The first condition, in the order of this enum, that failed.
    pub condition: CliReuseCondition,
    ///The repository path the condition failed on, the first in code point order; absent for `config`, `generator` and `model-unavailable`.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub path: ::std::option::Option<RepoPath>,
    ///One sentence for logs.
    pub message: ::std::string::String,
}
///stdout of `bundle reuse` (exit 0 whether or not the read set holds; cli-spec.md §5.10).
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "$id": "urn:prism:schema:prism.cli.reuse_result:a0",
///  "title": "CliReuseResultA0",
///  "description": "stdout of `bundle reuse` (exit 0 whether or not the read set holds; cli-spec.md §5.10).",
///  "type": "object",
///  "required": [
///    "bundle_key",
///    "holds",
///    "revision_key",
///    "schema"
///  ],
///  "properties": {
///    "bundle_key": {
///      "description": "The bundle's own key, `bundle_key` of its manifest: what the backend's alias row points to.",
///      "$ref": "#/$defs/Sha256Hex"
///    },
///    "failure": {
///      "description": "The first failing condition. Present exactly when `holds` is false.",
///      "$ref": "#/$defs/CliReuseFailure"
///    },
///    "holds": {
///      "description": "Whether the bundle serves the key: every condition of cli-spec.md §5.10 holds.",
///      "type": "boolean"
///    },
///    "revision_key": {
///      "description": "The revision key asked about, `revision_key` of the `--key-record`.",
///      "$ref": "#/$defs/Sha256Hex"
///    },
///    "schema": {
///      "description": "Document schema id.",
///      "type": "string",
///      "const": "prism.cli.reuse_result.a0"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CliReuseResultA0 {
    ///Document schema id.
    pub schema: ::std::string::String,
    ///Whether the bundle serves the key: every condition of cli-spec.md §5.10 holds.
    pub holds: bool,
    ///The bundle's own key, `bundle_key` of its manifest: what the backend's alias row points to.
    pub bundle_key: Sha256Hex,
    ///The revision key asked about, `revision_key` of the `--key-record`.
    pub revision_key: Sha256Hex,
    ///The first failing condition. Present exactly when `holds` is false.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub failure: ::std::option::Option<CliReuseFailure>,
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
