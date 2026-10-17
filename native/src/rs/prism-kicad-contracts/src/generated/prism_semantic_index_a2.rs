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
/**KiCad KIID path: one or more `/<uuid>` steps, no trailing `/`. Two forms
exist and every field of this type states which one it holds: the
schematic form, which starts at the root sheet's UUID (a symbol's
`(instances (project … (path …)))` entry, plus the symbol UUID for an
occurrence); and the board form, which omits the root sheet (a footprint's
`(path …)`).*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "KiCad KIID path: one or more `/<uuid>` steps, no trailing `/`. Two forms\nexist and every field of this type states which one it holds: the\nschematic form, which starts at the root sheet's UUID (a symbol's\n`(instances (project … (path …)))` entry, plus the symbol UUID for an\noccurrence); and the board form, which omits the root sheet (a footprint's\n`(path …)`).",
///  "type": "string"
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize, ::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd,
)]
#[serde(transparent)]
pub struct KiidPath(pub ::std::string::String);
impl ::std::ops::Deref for KiidPath {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<KiidPath> for ::std::string::String {
    fn from(value: KiidPath) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::string::String> for KiidPath {
    fn from(value: ::std::string::String) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for KiidPath {
    type Err = ::std::convert::Infallible;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.to_string()))
    }
}
impl ::std::fmt::Display for KiidPath {
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
///`RecordBoolean`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "object",
///  "additionalProperties": {
///    "type": "boolean"
///  }
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct RecordBoolean(pub ::std::collections::BTreeMap<::std::string::String, bool>);
impl ::std::ops::Deref for RecordBoolean {
    type Target = ::std::collections::BTreeMap<::std::string::String, bool>;
    fn deref(&self) -> &::std::collections::BTreeMap<::std::string::String, bool> {
        &self.0
    }
}
impl ::std::convert::From<RecordBoolean>
    for ::std::collections::BTreeMap<::std::string::String, bool>
{
    fn from(value: RecordBoolean) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::collections::BTreeMap<::std::string::String, bool>>
    for RecordBoolean
{
    fn from(value: ::std::collections::BTreeMap<::std::string::String, bool>) -> Self {
        Self(value)
    }
}
///`RecordSemanticIndexAssemblyOverride`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "object",
///  "additionalProperties": {
///    "$ref": "#/$defs/SemanticIndexAssemblyOverride"
///  }
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct RecordSemanticIndexAssemblyOverride(
    pub ::std::collections::BTreeMap<::std::string::String, SemanticIndexAssemblyOverride>,
);
impl ::std::ops::Deref for RecordSemanticIndexAssemblyOverride {
    type Target =
        ::std::collections::BTreeMap<::std::string::String, SemanticIndexAssemblyOverride>;
    fn deref(
        &self,
    ) -> &::std::collections::BTreeMap<::std::string::String, SemanticIndexAssemblyOverride> {
        &self.0
    }
}
impl ::std::convert::From<RecordSemanticIndexAssemblyOverride>
    for ::std::collections::BTreeMap<::std::string::String, SemanticIndexAssemblyOverride>
{
    fn from(value: RecordSemanticIndexAssemblyOverride) -> Self {
        value.0
    }
}
impl
    ::std::convert::From<
        ::std::collections::BTreeMap<::std::string::String, SemanticIndexAssemblyOverride>,
    > for RecordSemanticIndexAssemblyOverride
{
    fn from(
        value: ::std::collections::BTreeMap<::std::string::String, SemanticIndexAssemblyOverride>,
    ) -> Self {
        Self(value)
    }
}
///`RecordSemanticIndexComponentDefault`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "object",
///  "additionalProperties": {
///    "$ref": "#/$defs/SemanticIndexComponentDefault"
///  }
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct RecordSemanticIndexComponentDefault(
    pub ::std::collections::BTreeMap<::std::string::String, SemanticIndexComponentDefault>,
);
impl ::std::ops::Deref for RecordSemanticIndexComponentDefault {
    type Target =
        ::std::collections::BTreeMap<::std::string::String, SemanticIndexComponentDefault>;
    fn deref(
        &self,
    ) -> &::std::collections::BTreeMap<::std::string::String, SemanticIndexComponentDefault> {
        &self.0
    }
}
impl ::std::convert::From<RecordSemanticIndexComponentDefault>
    for ::std::collections::BTreeMap<::std::string::String, SemanticIndexComponentDefault>
{
    fn from(value: RecordSemanticIndexComponentDefault) -> Self {
        value.0
    }
}
impl
    ::std::convert::From<
        ::std::collections::BTreeMap<::std::string::String, SemanticIndexComponentDefault>,
    > for RecordSemanticIndexComponentDefault
{
    fn from(
        value: ::std::collections::BTreeMap<::std::string::String, SemanticIndexComponentDefault>,
    ) -> Self {
        Self(value)
    }
}
///`RecordSemanticIndexFootprintDefault`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "object",
///  "additionalProperties": {
///    "$ref": "#/$defs/SemanticIndexFootprintDefault"
///  }
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct RecordSemanticIndexFootprintDefault(
    pub ::std::collections::BTreeMap<::std::string::String, SemanticIndexFootprintDefault>,
);
impl ::std::ops::Deref for RecordSemanticIndexFootprintDefault {
    type Target =
        ::std::collections::BTreeMap<::std::string::String, SemanticIndexFootprintDefault>;
    fn deref(
        &self,
    ) -> &::std::collections::BTreeMap<::std::string::String, SemanticIndexFootprintDefault> {
        &self.0
    }
}
impl ::std::convert::From<RecordSemanticIndexFootprintDefault>
    for ::std::collections::BTreeMap<::std::string::String, SemanticIndexFootprintDefault>
{
    fn from(value: RecordSemanticIndexFootprintDefault) -> Self {
        value.0
    }
}
impl
    ::std::convert::From<
        ::std::collections::BTreeMap<::std::string::String, SemanticIndexFootprintDefault>,
    > for RecordSemanticIndexFootprintDefault
{
    fn from(
        value: ::std::collections::BTreeMap<::std::string::String, SemanticIndexFootprintDefault>,
    ) -> Self {
        Self(value)
    }
}
///`RecordSemanticIndexFootprintOverride`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "object",
///  "additionalProperties": {
///    "$ref": "#/$defs/SemanticIndexFootprintOverride"
///  }
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct RecordSemanticIndexFootprintOverride(
    pub ::std::collections::BTreeMap<::std::string::String, SemanticIndexFootprintOverride>,
);
impl ::std::ops::Deref for RecordSemanticIndexFootprintOverride {
    type Target =
        ::std::collections::BTreeMap<::std::string::String, SemanticIndexFootprintOverride>;
    fn deref(
        &self,
    ) -> &::std::collections::BTreeMap<::std::string::String, SemanticIndexFootprintOverride> {
        &self.0
    }
}
impl ::std::convert::From<RecordSemanticIndexFootprintOverride>
    for ::std::collections::BTreeMap<::std::string::String, SemanticIndexFootprintOverride>
{
    fn from(value: RecordSemanticIndexFootprintOverride) -> Self {
        value.0
    }
}
impl
    ::std::convert::From<
        ::std::collections::BTreeMap<::std::string::String, SemanticIndexFootprintOverride>,
    > for RecordSemanticIndexFootprintOverride
{
    fn from(
        value: ::std::collections::BTreeMap<::std::string::String, SemanticIndexFootprintOverride>,
    ) -> Self {
        Self(value)
    }
}
///`RecordSemanticIndexOccurrenceDefault`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "object",
///  "additionalProperties": {
///    "$ref": "#/$defs/SemanticIndexOccurrenceDefault"
///  }
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct RecordSemanticIndexOccurrenceDefault(
    pub ::std::collections::BTreeMap<::std::string::String, SemanticIndexOccurrenceDefault>,
);
impl ::std::ops::Deref for RecordSemanticIndexOccurrenceDefault {
    type Target =
        ::std::collections::BTreeMap<::std::string::String, SemanticIndexOccurrenceDefault>;
    fn deref(
        &self,
    ) -> &::std::collections::BTreeMap<::std::string::String, SemanticIndexOccurrenceDefault> {
        &self.0
    }
}
impl ::std::convert::From<RecordSemanticIndexOccurrenceDefault>
    for ::std::collections::BTreeMap<::std::string::String, SemanticIndexOccurrenceDefault>
{
    fn from(value: RecordSemanticIndexOccurrenceDefault) -> Self {
        value.0
    }
}
impl
    ::std::convert::From<
        ::std::collections::BTreeMap<::std::string::String, SemanticIndexOccurrenceDefault>,
    > for RecordSemanticIndexOccurrenceDefault
{
    fn from(
        value: ::std::collections::BTreeMap<::std::string::String, SemanticIndexOccurrenceDefault>,
    ) -> Self {
        Self(value)
    }
}
///`RecordSemanticIndexPosition`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "object",
///  "additionalProperties": {
///    "$ref": "#/$defs/SemanticIndexPosition"
///  }
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct RecordSemanticIndexPosition(
    pub ::std::collections::BTreeMap<::std::string::String, SemanticIndexPosition>,
);
impl ::std::ops::Deref for RecordSemanticIndexPosition {
    type Target = ::std::collections::BTreeMap<::std::string::String, SemanticIndexPosition>;
    fn deref(&self) -> &::std::collections::BTreeMap<::std::string::String, SemanticIndexPosition> {
        &self.0
    }
}
impl ::std::convert::From<RecordSemanticIndexPosition>
    for ::std::collections::BTreeMap<::std::string::String, SemanticIndexPosition>
{
    fn from(value: RecordSemanticIndexPosition) -> Self {
        value.0
    }
}
impl
    ::std::convert::From<::std::collections::BTreeMap<::std::string::String, SemanticIndexPosition>>
    for RecordSemanticIndexPosition
{
    fn from(
        value: ::std::collections::BTreeMap<::std::string::String, SemanticIndexPosition>,
    ) -> Self {
        Self(value)
    }
}
///`RecordString`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "object",
///  "additionalProperties": {
///    "type": "string"
///  }
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct RecordString(
    pub ::std::collections::BTreeMap<::std::string::String, ::std::string::String>,
);
impl ::std::ops::Deref for RecordString {
    type Target = ::std::collections::BTreeMap<::std::string::String, ::std::string::String>;
    fn deref(&self) -> &::std::collections::BTreeMap<::std::string::String, ::std::string::String> {
        &self.0
    }
}
impl ::std::convert::From<RecordString>
    for ::std::collections::BTreeMap<::std::string::String, ::std::string::String>
{
    fn from(value: RecordString) -> Self {
        value.0
    }
}
impl
    ::std::convert::From<::std::collections::BTreeMap<::std::string::String, ::std::string::String>>
    for RecordString
{
    fn from(
        value: ::std::collections::BTreeMap<::std::string::String, ::std::string::String>,
    ) -> Self {
        Self(value)
    }
}
/**Reference designator as KiCad resolves it for one symbol instance or
footprint, for example `R1`, `U3`, `#PWR01` or `R?`. Always a string. A
contract states whether it includes virtual (`#`) and unannotated (`?`)
references.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Reference designator as KiCad resolves it for one symbol instance or\nfootprint, for example `R1`, `U3`, `#PWR01` or `R?`. Always a string. A\ncontract states whether it includes virtual (`#`) and unannotated (`?`)\nreferences.",
///  "type": "string",
///  "minLength": 1
///}
/// ```
/// </details>
#[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct Refdes(::std::string::String);
impl ::std::ops::Deref for Refdes {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<Refdes> for ::std::string::String {
    fn from(value: Refdes) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for Refdes {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for Refdes {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for Refdes {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for Refdes {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for Refdes {
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
/**`projections/semantic-index.json`, written at stage `parse`. Read by the
identity endpoint (streamed as is), the inspector, search, BOM table,
variants UI and API, component import, Release Studio, Design Comparison
and Simulation Studio board facts.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "$id": "urn:prism:schema:prism.semantic_index:a2",
///  "title": "SemanticIndexA2",
///  "description": "`projections/semantic-index.json`, written at stage `parse`. Read by the\nidentity endpoint (streamed as is), the inspector, search, BOM table,\nvariants UI and API, component import, Release Studio, Design Comparison\nand Simulation Studio board facts.",
///  "type": "object",
///  "required": [
///    "assembly",
///    "buses",
///    "components",
///    "designKey",
///    "indexes",
///    "nets",
///    "schema",
///    "sheetInstances",
///    "terminals"
///  ],
///  "properties": {
///    "assembly": {
///      "description": "Effective default and per-variant assembly state.",
///      "$ref": "#/$defs/SemanticIndexAssembly"
///    },
///    "buses": {
///      "description": "Bus objects, per sheet instance in `sheetInstances` order: that\ninstance's bus wires, then bus entries, then bus aliases, each in file\norder.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/SemanticIndexBus"
///      }
///    },
///    "components": {
///      "description": "Every component, in design-netlist component order (`design.json` `components[]`), skipping entries with no reference.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/SemanticIndexComponent"
///      }
///    },
///    "designKey": {
///      "description": "The design key (ADR amendment K2 §3.6): lowercase hex SHA-256 over\n`\"prism.design_key.a0\" NUL config_digest NUL R`, where `R` is the bundle's\ncanonical read set (bundle-format.md §2.3). It is the same for every\nrevision whose tree gives the same configuration and leaves the read set\nunchanged, and for every build of it, so readers use it as the identity of\nthe design content: the cross-probe guard, comment anchors and the ETag.\nIt is not a revision key, and no member carries one: the revision a user\nasked for comes from the request. Replaces a1's `sourceRevisionKey`.",
///      "$ref": "#/$defs/Sha256Hex"
///    },
///    "indexes": {
///      "description": "Lookup maps into the arrays above.",
///      "$ref": "#/$defs/SemanticIndexIndexes"
///    },
///    "nets": {
///      "description": "Every net: schematic nets in design-netlist net order (`design.json`\n`nets[]`, skipping unnamed ones), then nets only the board names, in the\norder the board pass meets them (footprint pads in file order, then\nsegments, arcs, vias, zones); nets absorbed by the split-net\nreconciliation are removed and the rest keep their relative order.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/SemanticIndexNet"
///      }
///    },
///    "schema": {
///      "description": "Schema id. a0 was `prism.semantic_index_a0`; a1 carried `sourceRevisionKey`; a2 carries `designKey`.",
///      "type": "string",
///      "const": "prism.semantic_index.a2"
///    },
///    "sheetInstances": {
///      "description": "Every sheet instance, in hierarchy walk order: the root first, then depth-first pre-order, a sheet's child sheets in the order its file places them.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/SemanticIndexSheetInstance"
///      }
///    },
///    "terminals": {
///      "description": "Every terminal: per schematic net in netlist order, the terminals\n`design.json` lists for it (sorted by designator, then pin, in code point\norder; a repeated (designator, pin) keeps its first position), then pins\nonly the net's graphical pin list has, in that list's order; then\nboard-only terminals in board pad order (footprints in file order, each\nfootprint's pads in file order).",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/SemanticIndexTerminal"
///      }
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexA2 {
    ///Schema id. a0 was `prism.semantic_index_a0`; a1 carried `sourceRevisionKey`; a2 carries `designKey`.
    pub schema: ::std::string::String,
    /**The design key (ADR amendment K2 §3.6): lowercase hex SHA-256 over
    `"prism.design_key.a0" NUL config_digest NUL R`, where `R` is the bundle's
    canonical read set (bundle-format.md §2.3). It is the same for every
    revision whose tree gives the same configuration and leaves the read set
    unchanged, and for every build of it, so readers use it as the identity of
    the design content: the cross-probe guard, comment anchors and the ETag.
    It is not a revision key, and no member carries one: the revision a user
    asked for comes from the request. Replaces a1's `sourceRevisionKey`.*/
    #[serde(rename = "designKey")]
    pub design_key: Sha256Hex,
    ///Every component, in design-netlist component order (`design.json` `components[]`), skipping entries with no reference.
    pub components: ::std::vec::Vec<SemanticIndexComponent>,
    /**Every net: schematic nets in design-netlist net order (`design.json`
    `nets[]`, skipping unnamed ones), then nets only the board names, in the
    order the board pass meets them (footprint pads in file order, then
    segments, arcs, vias, zones); nets absorbed by the split-net
    reconciliation are removed and the rest keep their relative order.*/
    pub nets: ::std::vec::Vec<SemanticIndexNet>,
    /**Every terminal: per schematic net in netlist order, the terminals
    `design.json` lists for it (sorted by designator, then pin, in code point
    order; a repeated (designator, pin) keeps its first position), then pins
    only the net's graphical pin list has, in that list's order; then
    board-only terminals in board pad order (footprints in file order, each
    footprint's pads in file order).*/
    pub terminals: ::std::vec::Vec<SemanticIndexTerminal>,
    ///Every sheet instance, in hierarchy walk order: the root first, then depth-first pre-order, a sheet's child sheets in the order its file places them.
    #[serde(rename = "sheetInstances")]
    pub sheet_instances: ::std::vec::Vec<SemanticIndexSheetInstance>,
    /**Bus objects, per sheet instance in `sheetInstances` order: that
    instance's bus wires, then bus entries, then bus aliases, each in file
    order.*/
    pub buses: ::std::vec::Vec<SemanticIndexBus>,
    ///Lookup maps into the arrays above.
    pub indexes: SemanticIndexIndexes,
    ///Effective default and per-variant assembly state.
    pub assembly: SemanticIndexAssembly,
}
/**Effective default and per-variant assembly state (contract packet v1.0
§3.2; `semantic_index_variants.py:752-903`, `:948-1071`).*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Effective default and per-variant assembly state (contract packet v1.0\n§3.2; `semantic_index_variants.py:752-903`, `:948-1071`).",
///  "type": "object",
///  "required": [
///    "catalog",
///    "default",
///    "diagnostics",
///    "footprintInventory",
///    "schema",
///    "variants"
///  ],
///  "properties": {
///    "catalog": {
///      "description": "Every variant name in the design, in catalog order: project registry\nnames, then board-header-only, schematic-only and footprint-only names,\neach in first-seen order (packet §2.1). Empty when the design has none.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/SemanticIndexVariantCatalogEntry"
///      }
///    },
///    "default": {
///      "description": "The effective default state.",
///      "$ref": "#/$defs/SemanticIndexAssemblyDefault"
///    },
///    "diagnostics": {
///      "description": "Findings, in emission order: catalog diagnostics; then source-file\ndiagnostics (schematic files in hierarchy order, then the board); then\noccurrence and component-projection diagnostics (default, then each\nvariant in catalog order); then `duplicate-reference-footprints`,\n`alternate-footprints-both-populated` and `source-state-mismatch`\n(variants, then default); then index-join `reference-collision`s sorted\nby reference in code point order.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/SemanticIndexAssemblyDiagnostic"
///      }
///    },
///    "footprintInventory": {
///      "description": "Every board footprint, in board file order (empty without a board).",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/SemanticIndexFootprintInventoryEntry"
///      }
///    },
///    "schema": {
///      "description": "The block's own schema id, unchanged from a0.",
///      "type": "string",
///      "const": "prism.assembly_state_a0"
///    },
///    "variants": {
///      "description": "One entry per catalog name, in catalog order.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/SemanticIndexAssemblyVariant"
///      }
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexAssembly {
    ///The block's own schema id, unchanged from a0.
    pub schema: ::std::string::String,
    /**Every variant name in the design, in catalog order: project registry
    names, then board-header-only, schematic-only and footprint-only names,
    each in first-seen order (packet §2.1). Empty when the design has none.*/
    pub catalog: ::std::vec::Vec<SemanticIndexVariantCatalogEntry>,
    ///Every board footprint, in board file order (empty without a board).
    #[serde(rename = "footprintInventory")]
    pub footprint_inventory: ::std::vec::Vec<SemanticIndexFootprintInventoryEntry>,
    ///The effective default state.
    pub default: SemanticIndexAssemblyDefault,
    ///One entry per catalog name, in catalog order.
    pub variants: ::std::vec::Vec<SemanticIndexAssemblyVariant>,
    /**Findings, in emission order: catalog diagnostics; then source-file
    diagnostics (schematic files in hierarchy order, then the board); then
    occurrence and component-projection diagnostics (default, then each
    variant in catalog order); then `duplicate-reference-footprints`,
    `alternate-footprints-both-populated` and `source-state-mismatch`
    (variants, then default); then index-join `reference-collision`s sorted
    by reference in code point order.*/
    pub diagnostics: ::std::vec::Vec<SemanticIndexAssemblyDiagnostic>,
}
///The effective default assembly, differential against the all-false neutral state.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "The effective default assembly, differential against the all-false neutral state.",
///  "type": "object",
///  "required": [
///    "components",
///    "footprints",
///    "occurrences"
///  ],
///  "properties": {
///    "components": {
///      "description": "Keys: `componentUid`, or the reference when no single index component has it. Only components with a true flag.",
///      "$ref": "#/$defs/RecordSemanticIndexComponentDefault"
///    },
///    "footprints": {
///      "description": "Keys: footprint identity (SemanticIndexFootprintId; may be empty). Only footprints with a true flag.",
///      "$ref": "#/$defs/RecordSemanticIndexFootprintDefault"
///    },
///    "occurrences": {
///      "description": "Keys: occurrence id, schematic-form KiidPath `<sheetInstancePath>/<symbolUuid>`. Only occurrences with a true flag.",
///      "$ref": "#/$defs/RecordSemanticIndexOccurrenceDefault"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexAssemblyDefault {
    ///Keys: occurrence id, schematic-form KiidPath `<sheetInstancePath>/<symbolUuid>`. Only occurrences with a true flag.
    pub occurrences: RecordSemanticIndexOccurrenceDefault,
    ///Keys: `componentUid`, or the reference when no single index component has it. Only components with a true flag.
    pub components: RecordSemanticIndexComponentDefault,
    ///Keys: footprint identity (SemanticIndexFootprintId; may be empty). Only footprints with a true flag.
    pub footprints: RecordSemanticIndexFootprintDefault,
}
/**A finding of the variant catalog or resolver (contract packet v1.0 §3.2).
Which optional fields are present depends on `code` (see
SemanticIndexDiagnosticCode).*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A finding of the variant catalog or resolver (contract packet v1.0 §3.2).\nWhich optional fields are present depends on `code` (see\nSemanticIndexDiagnosticCode).",
///  "type": "object",
///  "required": [
///    "code",
///    "message",
///    "severity"
///  ],
///  "properties": {
///    "code": {
///      "description": "Stable code.",
///      "$ref": "#/$defs/SemanticIndexDiagnosticCode"
///    },
///    "componentUid": {
///      "description": "The index component with `reference`, when exactly one has it (set by the join).",
///      "$ref": "#/$defs/SemanticIndexComponentUid"
///    },
///    "detail": {
///      "description": "Code-specific detail; for the two map-shaped variants the keys are listed on SemanticIndexDiagnosticDetail.",
///      "$ref": "#/$defs/SemanticIndexDiagnosticDetail"
///    },
///    "footprintUuids": {
///      "description": "Footprints the finding is about, in board file order.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/SemanticIndexFootprintId"
///      },
///      "minItems": 1
///    },
///    "message": {
///      "description": "One-sentence explanation; its wording may change.",
///      "type": "string",
///      "minLength": 1
///    },
///    "occurrenceId": {
///      "description": "The occurrence the finding is about, schematic-form KiidPath.",
///      "$ref": "#/$defs/KiidPath"
///    },
///    "path": {
///      "description": "The source file, repository-relative (file-level diagnostics).",
///      "$ref": "#/$defs/RepoPath"
///    },
///    "reference": {
///      "description": "The reference the finding is about; empty for footprints with no `Reference` property.",
///      "type": "string"
///    },
///    "severity": {
///      "description": "Severity, fixed per code.",
///      "$ref": "#/$defs/SemanticIndexDiagnosticSeverity"
///    },
///    "source": {
///      "description": "The source file kind (catalog diagnostics only).",
///      "$ref": "#/$defs/SemanticIndexDiagnosticSource"
///    },
///    "variant": {
///      "description": "The variant the finding is about; absent for the default design.",
///      "type": "string"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexAssemblyDiagnostic {
    ///Stable code.
    pub code: SemanticIndexDiagnosticCode,
    ///Severity, fixed per code.
    pub severity: SemanticIndexDiagnosticSeverity,
    ///The source file kind (catalog diagnostics only).
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub source: ::std::option::Option<SemanticIndexDiagnosticSource>,
    ///The source file, repository-relative (file-level diagnostics).
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub path: ::std::option::Option<RepoPath>,
    ///The variant the finding is about; absent for the default design.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub variant: ::std::option::Option<::std::string::String>,
    ///The reference the finding is about; empty for footprints with no `Reference` property.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub reference: ::std::option::Option<::std::string::String>,
    ///The occurrence the finding is about, schematic-form KiidPath.
    #[serde(
        rename = "occurrenceId",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub occurrence_id: ::std::option::Option<KiidPath>,
    ///One-sentence explanation; its wording may change.
    pub message: SemanticIndexAssemblyDiagnosticMessage,
    ///Code-specific detail; for the two map-shaped variants the keys are listed on SemanticIndexDiagnosticDetail.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub detail: ::std::option::Option<SemanticIndexDiagnosticDetail>,
    ///Footprints the finding is about, in board file order.
    #[serde(
        rename = "footprintUuids",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub footprint_uuids: ::std::option::Option<::std::vec::Vec<SemanticIndexFootprintId>>,
    ///The index component with `reference`, when exactly one has it (set by the join).
    #[serde(
        rename = "componentUid",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub component_uid: ::std::option::Option<SemanticIndexComponentUid>,
}
///One-sentence explanation; its wording may change.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "One-sentence explanation; its wording may change.",
///  "type": "string",
///  "minLength": 1
///}
/// ```
/// </details>
#[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct SemanticIndexAssemblyDiagnosticMessage(::std::string::String);
impl ::std::ops::Deref for SemanticIndexAssemblyDiagnosticMessage {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SemanticIndexAssemblyDiagnosticMessage> for ::std::string::String {
    fn from(value: SemanticIndexAssemblyDiagnosticMessage) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for SemanticIndexAssemblyDiagnosticMessage {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for SemanticIndexAssemblyDiagnosticMessage {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SemanticIndexAssemblyDiagnosticMessage {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SemanticIndexAssemblyDiagnosticMessage {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for SemanticIndexAssemblyDiagnosticMessage {
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
/**A variant's difference from the default state of one occurrence or
component: only what differs is present; booleans are explicit
(contract packet v1.0 §2.7).*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A variant's difference from the default state of one occurrence or\ncomponent: only what differs is present; booleans are explicit\n(contract packet v1.0 §2.7).",
///  "type": "object",
///  "properties": {
///    "dnp": {
///      "description": "DNP in this variant, when it differs from the default.",
///      "type": "boolean"
///    },
///    "excludeFromBoard": {
///      "description": "Excluded from the board in this variant, when it differs.",
///      "type": "boolean"
///    },
///    "excludeFromBom": {
///      "description": "Excluded from the BOM in this variant, when it differs.",
///      "type": "boolean"
///    },
///    "excludeFromPosFiles": {
///      "description": "Excluded from position files in this variant, when it differs.",
///      "type": "boolean"
///    },
///    "excludeFromSim": {
///      "description": "Excluded from simulation in this variant, when it differs.",
///      "type": "boolean"
///    },
///    "fields": {
///      "description": "Keys: raw KiCad field names whose effective text differs from the default (for example `Value`, `Footprint`, `MPN`); values are the variant's text, possibly empty. Absent when no field differs.",
///      "$ref": "#/$defs/RecordString"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexAssemblyOverride {
    ///DNP in this variant, when it differs from the default.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub dnp: ::std::option::Option<bool>,
    ///Excluded from the BOM in this variant, when it differs.
    #[serde(
        rename = "excludeFromBom",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub exclude_from_bom: ::std::option::Option<bool>,
    ///Excluded from the board in this variant, when it differs.
    #[serde(
        rename = "excludeFromBoard",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub exclude_from_board: ::std::option::Option<bool>,
    ///Excluded from simulation in this variant, when it differs.
    #[serde(
        rename = "excludeFromSim",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub exclude_from_sim: ::std::option::Option<bool>,
    ///Excluded from position files in this variant, when it differs.
    #[serde(
        rename = "excludeFromPosFiles",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub exclude_from_pos_files: ::std::option::Option<bool>,
    ///Keys: raw KiCad field names whose effective text differs from the default (for example `Value`, `Footprint`, `MPN`); values are the variant's text, possibly empty. Absent when no field differs.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub fields: ::std::option::Option<RecordString>,
}
impl ::std::default::Default for SemanticIndexAssemblyOverride {
    fn default() -> Self {
        Self {
            dnp: Default::default(),
            exclude_from_board: Default::default(),
            exclude_from_bom: Default::default(),
            exclude_from_pos_files: Default::default(),
            exclude_from_sim: Default::default(),
            fields: Default::default(),
        }
    }
}
///One named variant, differential against the effective default.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "One named variant, differential against the effective default.",
///  "type": "object",
///  "required": [
///    "components",
///    "footprints",
///    "name",
///    "occurrences"
///  ],
///  "properties": {
///    "components": {
///      "description": "Keys: `componentUid`, or the reference when no single index component has it. Only components that differ.",
///      "$ref": "#/$defs/RecordSemanticIndexAssemblyOverride"
///    },
///    "footprints": {
///      "description": "Keys: footprint identity (SemanticIndexFootprintId; may be empty). Only footprints that differ.",
///      "$ref": "#/$defs/RecordSemanticIndexFootprintOverride"
///    },
///    "name": {
///      "description": "The variant name, as in the catalog.",
///      "type": "string",
///      "minLength": 1
///    },
///    "occurrences": {
///      "description": "Keys: occurrence id (schematic-form KiidPath). Only occurrences that differ from the default.",
///      "$ref": "#/$defs/RecordSemanticIndexAssemblyOverride"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexAssemblyVariant {
    ///The variant name, as in the catalog.
    pub name: SemanticIndexAssemblyVariantName,
    ///Keys: occurrence id (schematic-form KiidPath). Only occurrences that differ from the default.
    pub occurrences: RecordSemanticIndexAssemblyOverride,
    ///Keys: `componentUid`, or the reference when no single index component has it. Only components that differ.
    pub components: RecordSemanticIndexAssemblyOverride,
    ///Keys: footprint identity (SemanticIndexFootprintId; may be empty). Only footprints that differ.
    pub footprints: RecordSemanticIndexFootprintOverride,
}
///The variant name, as in the catalog.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "The variant name, as in the catalog.",
///  "type": "string",
///  "minLength": 1
///}
/// ```
/// </details>
#[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct SemanticIndexAssemblyVariantName(::std::string::String);
impl ::std::ops::Deref for SemanticIndexAssemblyVariantName {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SemanticIndexAssemblyVariantName> for ::std::string::String {
    fn from(value: SemanticIndexAssemblyVariantName) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for SemanticIndexAssemblyVariantName {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for SemanticIndexAssemblyVariantName {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SemanticIndexAssemblyVariantName {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SemanticIndexAssemblyVariantName {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for SemanticIndexAssemblyVariantName {
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
///A bus object: a wire, an entry or an alias.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A bus object: a wire, an entry or an alias.",
///  "oneOf": [
///    {
///      "$ref": "#/$defs/SemanticIndexBusWire"
///    },
///    {
///      "$ref": "#/$defs/SemanticIndexBusEntry"
///    },
///    {
///      "$ref": "#/$defs/SemanticIndexBusAlias"
///    }
///  ]
///}
/// ```
/// </details>
#[derive(::serde::Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum SemanticIndexBus {
    Wire(SemanticIndexBusWire),
    Entry(SemanticIndexBusEntry),
    Alias(SemanticIndexBusAlias),
}
impl ::std::convert::From<SemanticIndexBusWire> for SemanticIndexBus {
    fn from(value: SemanticIndexBusWire) -> Self {
        Self::Wire(value)
    }
}
impl ::std::convert::From<SemanticIndexBusEntry> for SemanticIndexBus {
    fn from(value: SemanticIndexBusEntry) -> Self {
        Self::Entry(value)
    }
}
impl ::std::convert::From<SemanticIndexBusAlias> for SemanticIndexBus {
    fn from(value: SemanticIndexBusAlias) -> Self {
        Self::Alias(value)
    }
}
///A bus alias defined on one sheet instance (`semantic_index_service.py:692-708`).
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A bus alias defined on one sheet instance (`semantic_index_service.py:692-708`).",
///  "type": "object",
///  "required": [
///    "busUid",
///    "kind",
///    "members",
///    "name",
///    "page",
///    "sheetInstancePath",
///    "sheetPath"
///  ],
///  "properties": {
///    "busUid": {
///      "description": "Stable alias id, from the sheet instance and `name`.",
///      "$ref": "#/$defs/SemanticIndexBusAliasUid"
///    },
///    "kind": {
///      "description": "Discriminator.",
///      "type": "string",
///      "const": "bus_alias"
///    },
///    "members": {
///      "description": "The alias members as written, sorted in code point order (repeats kept, empty ones dropped).",
///      "type": "array",
///      "items": {
///        "type": "string"
///      }
///    },
///    "name": {
///      "description": "The alias name, for example `JTAG`.",
///      "type": "string"
///    },
///    "page": {
///      "description": "The sheet's `.kicad_sch`, repository-relative.",
///      "$ref": "#/$defs/RepoPath"
///    },
///    "sheetInstancePath": {
///      "description": "The sheet instance that defines it, schematic-form KiidPath.",
///      "$ref": "#/$defs/KiidPath"
///    },
///    "sheetPath": {
///      "description": "That instance's human sheet path.",
///      "$ref": "#/$defs/SemanticIndexSheetNamePath"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexBusAlias {
    ///Discriminator.
    pub kind: ::std::string::String,
    ///Stable alias id, from the sheet instance and `name`.
    #[serde(rename = "busUid")]
    pub bus_uid: SemanticIndexBusAliasUid,
    ///The alias name, for example `JTAG`.
    pub name: ::std::string::String,
    ///The alias members as written, sorted in code point order (repeats kept, empty ones dropped).
    pub members: ::std::vec::Vec<::std::string::String>,
    ///The sheet instance that defines it, schematic-form KiidPath.
    #[serde(rename = "sheetInstancePath")]
    pub sheet_instance_path: KiidPath,
    ///That instance's human sheet path.
    #[serde(rename = "sheetPath")]
    pub sheet_path: SemanticIndexSheetNamePath,
    ///The sheet's `.kicad_sch`, repository-relative.
    pub page: RepoPath,
}
/**Bus alias id: `bus-alias:` followed by the first 20 hex digits of the
SHA-256 of `<sheetInstancePath>\u001f<name>` (UTF-8)
(`semantic_index_service.py:696`).*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Bus alias id: `bus-alias:` followed by the first 20 hex digits of the\nSHA-256 of `<sheetInstancePath>\\u001f<name>` (UTF-8)\n(`semantic_index_service.py:696`).",
///  "type": "string"
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize, ::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd,
)]
#[serde(transparent)]
pub struct SemanticIndexBusAliasUid(pub ::std::string::String);
impl ::std::ops::Deref for SemanticIndexBusAliasUid {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SemanticIndexBusAliasUid> for ::std::string::String {
    fn from(value: SemanticIndexBusAliasUid) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::string::String> for SemanticIndexBusAliasUid {
    fn from(value: ::std::string::String) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for SemanticIndexBusAliasUid {
    type Err = ::std::convert::Infallible;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.to_string()))
    }
}
impl ::std::fmt::Display for SemanticIndexBusAliasUid {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
///A bus entry on one sheet instance (`semantic_index_service.py:647-690`).
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A bus entry on one sheet instance (`semantic_index_service.py:647-690`).",
///  "type": "object",
///  "required": [
///    "at",
///    "busUid",
///    "kind",
///    "page",
///    "points",
///    "sheetInstancePath",
///    "sheetPath",
///    "size",
///    "sourceUuid"
///  ],
///  "properties": {
///    "at": {
///      "description": "The entry's `(at x y)`, schematic millimetres, in the order `[x, y]`.",
///      "$ref": "#/$defs/SemanticIndexMmPair"
///    },
///    "busUid": {
///      "description": "Stable bus id, from the kind, sheet instance and `sourceUuid`.",
///      "$ref": "#/$defs/SemanticIndexBusUid"
///    },
///    "kind": {
///      "description": "Discriminator.",
///      "type": "string",
///      "const": "bus_entry"
///    },
///    "page": {
///      "description": "The sheet's `.kicad_sch`, repository-relative.",
///      "$ref": "#/$defs/RepoPath"
///    },
///    "points": {
///      "description": "Always empty on a bus entry (it has no `pts`); array order is moot.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/SemanticIndexMmPair"
///      },
///      "maxItems": 0
///    },
///    "sheetInstancePath": {
///      "description": "The sheet instance it is drawn on, schematic-form KiidPath.",
///      "$ref": "#/$defs/KiidPath"
///    },
///    "sheetPath": {
///      "description": "That instance's human sheet path.",
///      "$ref": "#/$defs/SemanticIndexSheetNamePath"
///    },
///    "size": {
///      "description": "The entry's `(size w h)`, schematic millimetres, in the order `[width, height]`.",
///      "$ref": "#/$defs/SemanticIndexMmPair"
///    },
///    "sourceUuid": {
///      "description": "The bus entry's UUID in the schematic.",
///      "$ref": "#/$defs/KiCadUuid"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexBusEntry {
    ///Discriminator.
    pub kind: ::std::string::String,
    ///Stable bus id, from the kind, sheet instance and `sourceUuid`.
    #[serde(rename = "busUid")]
    pub bus_uid: SemanticIndexBusUid,
    ///The bus entry's UUID in the schematic.
    #[serde(rename = "sourceUuid")]
    pub source_uuid: KiCadUuid,
    ///The sheet instance it is drawn on, schematic-form KiidPath.
    #[serde(rename = "sheetInstancePath")]
    pub sheet_instance_path: KiidPath,
    ///That instance's human sheet path.
    #[serde(rename = "sheetPath")]
    pub sheet_path: SemanticIndexSheetNamePath,
    ///The sheet's `.kicad_sch`, repository-relative.
    pub page: RepoPath,
    ///Always empty on a bus entry (it has no `pts`); array order is moot.
    pub points: ::std::vec::Vec<SemanticIndexMmPair>,
    ///The entry's `(at x y)`, schematic millimetres, in the order `[x, y]`.
    pub at: SemanticIndexMmPair,
    ///The entry's `(size w h)`, schematic millimetres, in the order `[width, height]`.
    pub size: SemanticIndexMmPair,
}
/**Bus wire or bus entry id: `bus:` followed by the first 20 hex digits of
the SHA-256 of `<kind>\u001f<sheetInstancePath>\u001f<sourceUuid>` (UTF-8),
where kind is `bus` or `bus_entry` (`semantic_index_service.py:656-661`).*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Bus wire or bus entry id: `bus:` followed by the first 20 hex digits of\nthe SHA-256 of `<kind>\\u001f<sheetInstancePath>\\u001f<sourceUuid>` (UTF-8),\nwhere kind is `bus` or `bus_entry` (`semantic_index_service.py:656-661`).",
///  "type": "string"
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize, ::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd,
)]
#[serde(transparent)]
pub struct SemanticIndexBusUid(pub ::std::string::String);
impl ::std::ops::Deref for SemanticIndexBusUid {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SemanticIndexBusUid> for ::std::string::String {
    fn from(value: SemanticIndexBusUid) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::string::String> for SemanticIndexBusUid {
    fn from(value: ::std::string::String) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for SemanticIndexBusUid {
    type Err = ::std::convert::Infallible;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.to_string()))
    }
}
impl ::std::fmt::Display for SemanticIndexBusUid {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
///A bus wire on one sheet instance (`semantic_index_service.py:647-690`).
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A bus wire on one sheet instance (`semantic_index_service.py:647-690`).",
///  "type": "object",
///  "required": [
///    "at",
///    "busUid",
///    "kind",
///    "page",
///    "points",
///    "sheetInstancePath",
///    "sheetPath",
///    "size",
///    "sourceUuid"
///  ],
///  "properties": {
///    "at": {
///      "description": "Always `null` on a bus wire (a bus wire has no `at`).",
///      "type": "null"
///    },
///    "busUid": {
///      "description": "Stable bus id, from the kind, sheet instance and `sourceUuid`.",
///      "$ref": "#/$defs/SemanticIndexBusUid"
///    },
///    "kind": {
///      "description": "Discriminator.",
///      "type": "string",
///      "const": "bus"
///    },
///    "page": {
///      "description": "The sheet's `.kicad_sch`, repository-relative.",
///      "$ref": "#/$defs/RepoPath"
///    },
///    "points": {
///      "description": "The wire's `(pts …)` in file order, schematic millimetres (KiCad writes two).",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/SemanticIndexMmPair"
///      }
///    },
///    "sheetInstancePath": {
///      "description": "The sheet instance it is drawn on, schematic-form KiidPath.",
///      "$ref": "#/$defs/KiidPath"
///    },
///    "sheetPath": {
///      "description": "That instance's human sheet path.",
///      "$ref": "#/$defs/SemanticIndexSheetNamePath"
///    },
///    "size": {
///      "description": "Always `null` on a bus wire (a bus wire has no `size`).",
///      "type": "null"
///    },
///    "sourceUuid": {
///      "description": "The bus wire's UUID in the schematic.",
///      "$ref": "#/$defs/KiCadUuid"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexBusWire {
    ///Discriminator.
    pub kind: ::std::string::String,
    ///Stable bus id, from the kind, sheet instance and `sourceUuid`.
    #[serde(rename = "busUid")]
    pub bus_uid: SemanticIndexBusUid,
    ///The bus wire's UUID in the schematic.
    #[serde(rename = "sourceUuid")]
    pub source_uuid: KiCadUuid,
    ///The sheet instance it is drawn on, schematic-form KiidPath.
    #[serde(rename = "sheetInstancePath")]
    pub sheet_instance_path: KiidPath,
    ///That instance's human sheet path.
    #[serde(rename = "sheetPath")]
    pub sheet_path: SemanticIndexSheetNamePath,
    ///The sheet's `.kicad_sch`, repository-relative.
    pub page: RepoPath,
    ///The wire's `(pts …)` in file order, schematic millimetres (KiCad writes two).
    pub points: ::std::vec::Vec<SemanticIndexMmPair>,
    ///Always `null` on a bus wire (a bus wire has no `at`).
    pub at: (),
    ///Always `null` on a bus wire (a bus wire has no `size`).
    pub size: (),
}
/**One component: one netlist reference (`semantic_index_service.py:879-910`),
with the board footprints that carry the reference.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "One component: one netlist reference (`semantic_index_service.py:879-910`),\nwith the board footprints that carry the reference.",
///  "type": "object",
///  "required": [
///    "componentUid",
///    "fields",
///    "footprint",
///    "libraryRef",
///    "pcbRefs",
///    "reference",
///    "schematicRefs",
///    "value",
///    "webgpuRefs"
///  ],
///  "properties": {
///    "componentUid": {
///      "description": "Stable component id, from the reference and `symbolUuid`.",
///      "$ref": "#/$defs/SemanticIndexComponentUid"
///    },
///    "fields": {
///      "description": "The component's fields. Keys: the 17 canonical names (`Value`, `DNP`,\n`In BOM`, `Description`, `Datasheet`, `Manufacturer`,\n`Manufacturer Part Number`, `Vendor`, `Vendor Part Number`, `Footprint`,\n`Mass (g)`, `RQjC (C/W)`, `RQjC_top (C/W)`, `Temp_max (C)`,\n`Temp_min (C)`, `Power Dissipation (W)`, `Rate`), always present, plus\nevery other netlist parameter and placed-symbol property by its KiCad\nname, including kicad_monkey's `_source_cad` and `kicad_*` parameters\n(`_canonical_fields`, `semantic_index_service.py:467-513`). `DNP` and\n`In BOM` are `Yes` or `No`: from the default assembly state when the\ncomponent has a true default flag (`semantic_index_variants.py:997-1003`),\nelse as `_canonical_fields` resolves them\n(`semantic_index_service.py:441-464`, `:488-492`).\nValues are strings, possibly empty. Serialized with keys in code point\norder.",
///      "$ref": "#/$defs/RecordString"
///    },
///    "footprint": {
///      "description": "The symbol's `Footprint` field as written (a LibId or empty).",
///      "type": "string"
///    },
///    "libraryRef": {
///      "description": "Added in a1 (ADR §6). The symbol's library identifier as the netlist's\n`libsource` names it: `<lib>:<part>` when both are known, else whichever\none is, else empty (kicad_monkey `_library_ref`; ref:\n`backend/app/services/semantic_index_service.py:887`).",
///      "type": "string"
///    },
///    "pcbRefs": {
///      "description": "Footprints whose `Reference` property equals this reference, in board\nfile order. Empty without a board or a matching footprint.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/SemanticIndexComponentPcbRef"
///      }
///    },
///    "reference": {
///      "description": "Reference designator as the design netlist resolves it (never empty,\nnever a `#` power symbol; may be unannotated, `R?`).",
///      "$ref": "#/$defs/Refdes"
///    },
///    "schematicRefs": {
///      "description": "Where the component's symbol is: one entry, or none when the netlist\ngives the component no symbol UUID. In netlist order (at most one).",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/SemanticIndexComponentSchematicRef"
///      }
///    },
///    "value": {
///      "description": "The symbol's `Value` as the netlist resolves it (text variables expanded); empty when it has none.",
///      "type": "string"
///    },
///    "webgpuRefs": {
///      "description": "Always empty (reserved); array order is moot.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/SemanticIndexWebGpuRef"
///      },
///      "maxItems": 0
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexComponent {
    ///Stable component id, from the reference and `symbolUuid`.
    #[serde(rename = "componentUid")]
    pub component_uid: SemanticIndexComponentUid,
    /**Reference designator as the design netlist resolves it (never empty,
    never a `#` power symbol; may be unannotated, `R?`).*/
    pub reference: Refdes,
    ///The symbol's `Value` as the netlist resolves it (text variables expanded); empty when it has none.
    pub value: ::std::string::String,
    ///The symbol's `Footprint` field as written (a LibId or empty).
    pub footprint: ::std::string::String,
    /**Added in a1 (ADR §6). The symbol's library identifier as the netlist's
    `libsource` names it: `<lib>:<part>` when both are known, else whichever
    one is, else empty (kicad_monkey `_library_ref`; ref:
    `backend/app/services/semantic_index_service.py:887`).*/
    #[serde(rename = "libraryRef")]
    pub library_ref: ::std::string::String,
    /**The component's fields. Keys: the 17 canonical names (`Value`, `DNP`,
    `In BOM`, `Description`, `Datasheet`, `Manufacturer`,
    `Manufacturer Part Number`, `Vendor`, `Vendor Part Number`, `Footprint`,
    `Mass (g)`, `RQjC (C/W)`, `RQjC_top (C/W)`, `Temp_max (C)`,
    `Temp_min (C)`, `Power Dissipation (W)`, `Rate`), always present, plus
    every other netlist parameter and placed-symbol property by its KiCad
    name, including kicad_monkey's `_source_cad` and `kicad_*` parameters
    (`_canonical_fields`, `semantic_index_service.py:467-513`). `DNP` and
    `In BOM` are `Yes` or `No`: from the default assembly state when the
    component has a true default flag (`semantic_index_variants.py:997-1003`),
    else as `_canonical_fields` resolves them
    (`semantic_index_service.py:441-464`, `:488-492`).
    Values are strings, possibly empty. Serialized with keys in code point
    order.*/
    pub fields: RecordString,
    /**Where the component's symbol is: one entry, or none when the netlist
    gives the component no symbol UUID. In netlist order (at most one).*/
    #[serde(rename = "schematicRefs")]
    pub schematic_refs: ::std::vec::Vec<SemanticIndexComponentSchematicRef>,
    /**Footprints whose `Reference` property equals this reference, in board
    file order. Empty without a board or a matching footprint.*/
    #[serde(rename = "pcbRefs")]
    pub pcb_refs: ::std::vec::Vec<SemanticIndexComponentPcbRef>,
    ///Always empty (reserved); array order is moot.
    #[serde(rename = "webgpuRefs")]
    pub webgpu_refs: ::std::vec::Vec<SemanticIndexWebGpuRef>,
}
///Default state of one component (multi-unit projection); present only when a flag is true, and only true flags are present.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Default state of one component (multi-unit projection); present only when a flag is true, and only true flags are present.",
///  "type": "object",
///  "properties": {
///    "dnp": {
///      "description": "DNP. Present only when true.",
///      "type": "boolean",
///      "const": true
///    },
///    "excludeFromBoard": {
///      "description": "Excluded from the board. Present only when true.",
///      "type": "boolean",
///      "const": true
///    },
///    "excludeFromBom": {
///      "description": "Excluded from the BOM. Present only when true.",
///      "type": "boolean",
///      "const": true
///    },
///    "excludeFromPosFiles": {
///      "description": "Excluded from position files. Present only when true.",
///      "type": "boolean",
///      "const": true
///    },
///    "excludeFromSim": {
///      "description": "Excluded from simulation. Present only when true.",
///      "type": "boolean",
///      "const": true
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexComponentDefault {
    ///DNP. Present only when true.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub dnp: ::std::option::Option<bool>,
    ///Excluded from the BOM. Present only when true.
    #[serde(
        rename = "excludeFromBom",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub exclude_from_bom: ::std::option::Option<bool>,
    ///Excluded from the board. Present only when true.
    #[serde(
        rename = "excludeFromBoard",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub exclude_from_board: ::std::option::Option<bool>,
    ///Excluded from simulation. Present only when true.
    #[serde(
        rename = "excludeFromSim",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub exclude_from_sim: ::std::option::Option<bool>,
    ///Excluded from position files. Present only when true.
    #[serde(
        rename = "excludeFromPosFiles",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub exclude_from_pos_files: ::std::option::Option<bool>,
}
impl ::std::default::Default for SemanticIndexComponentDefault {
    fn default() -> Self {
        Self {
            dnp: Default::default(),
            exclude_from_board: Default::default(),
            exclude_from_bom: Default::default(),
            exclude_from_pos_files: Default::default(),
            exclude_from_sim: Default::default(),
        }
    }
}
///A footprint on the board that carries this component's reference.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A footprint on the board that carries this component's reference.",
///  "type": "object",
///  "required": [
///    "footprintUuid"
///  ],
///  "properties": {
///    "footprintUuid": {
///      "description": "The footprint's UUID, its `(uuid …)`.",
///      "$ref": "#/$defs/KiCadUuid"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexComponentPcbRef {
    ///The footprint's UUID, its `(uuid …)`.
    #[serde(rename = "footprintUuid")]
    pub footprint_uuid: KiCadUuid,
}
/**Where a component's symbol is in the schematic hierarchy
(`semantic_index_service.py:895-901`). Unlike a net's schematic ref, both
path fields hold the human sheet path.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Where a component's symbol is in the schematic hierarchy\n(`semantic_index_service.py:895-901`). Unlike a net's schematic ref, both\npath fields hold the human sheet path.",
///  "type": "object",
///  "required": [
///    "page",
///    "sheetInstancePath",
///    "symbolUuid"
///  ],
///  "properties": {
///    "occurrenceId": {
///      "description": "Occurrence id of that unit, schematic-form KiidPath\n`<sheetInstancePath>/<symbolUuid>` (contract packet v1.0 §2.2), set by the\nassembly join (`semantic_index_variants.py:997-1009`). Absent when the\njoin found no placement of the symbol on that human sheet path.",
///      "$ref": "#/$defs/KiidPath"
///    },
///    "page": {
///      "description": "The same human sheet path again (`hierarchy.sheet`, which kicad_monkey\nsets to `sheet_path_names` too); the empty string when kicad_monkey\nreports no sheet path. Not a file name, unlike a net's `page`.",
///      "type": "string"
///    },
///    "sheetInstancePath": {
///      "description": "The component's human sheet path, kicad_monkey's `sheet_path_names`\n(for example `/` or `/Power/`). Despite its name this is not a KIID path;\nthe KIID form is in `occurrenceId`.",
///      "$ref": "#/$defs/SemanticIndexSheetNamePath"
///    },
///    "symbolUuid": {
///      "description": "UUID of the symbol the design netlist names for this component (the\nnetlist component's instance UUID; for a multi-unit part, the unit the\nnetlist picks).",
///      "$ref": "#/$defs/KiCadUuid"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexComponentSchematicRef {
    /**The component's human sheet path, kicad_monkey's `sheet_path_names`
    (for example `/` or `/Power/`). Despite its name this is not a KIID path;
    the KIID form is in `occurrenceId`.*/
    #[serde(rename = "sheetInstancePath")]
    pub sheet_instance_path: SemanticIndexSheetNamePath,
    /**The same human sheet path again (`hierarchy.sheet`, which kicad_monkey
    sets to `sheet_path_names` too); the empty string when kicad_monkey
    reports no sheet path. Not a file name, unlike a net's `page`.*/
    pub page: ::std::string::String,
    /**UUID of the symbol the design netlist names for this component (the
    netlist component's instance UUID; for a multi-unit part, the unit the
    netlist picks).*/
    #[serde(rename = "symbolUuid")]
    pub symbol_uuid: KiCadUuid,
    /**Occurrence id of that unit, schematic-form KiidPath
    `<sheetInstancePath>/<symbolUuid>` (contract packet v1.0 §2.2), set by the
    assembly join (`semantic_index_variants.py:997-1009`). Absent when the
    join found no placement of the symbol on that human sheet path.*/
    #[serde(
        rename = "occurrenceId",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub occurrence_id: ::std::option::Option<KiidPath>,
}
/**Component id: `cmp:` followed by the first 20 hex digits of the SHA-256 of
`<reference>\u001f<symbolUuid>` (UTF-8), as
`_stable_uid("cmp", reference, symbol_uuid)` computes it
(`semantic_index_service.py:358-361`, `:890`).
A terminal or assembly entry whose reference has no component uses
`_stable_uid("cmp", reference)`: the hash of `<reference>` alone.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Component id: `cmp:` followed by the first 20 hex digits of the SHA-256 of\n`<reference>\\u001f<symbolUuid>` (UTF-8), as\n`_stable_uid(\"cmp\", reference, symbol_uuid)` computes it\n(`semantic_index_service.py:358-361`, `:890`).\nA terminal or assembly entry whose reference has no component uses\n`_stable_uid(\"cmp\", reference)`: the hash of `<reference>` alone.",
///  "type": "string"
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize, ::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd,
)]
#[serde(transparent)]
pub struct SemanticIndexComponentUid(pub ::std::string::String);
impl ::std::ops::Deref for SemanticIndexComponentUid {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SemanticIndexComponentUid> for ::std::string::String {
    fn from(value: SemanticIndexComponentUid) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::string::String> for SemanticIndexComponentUid {
    fn from(value: ::std::string::String) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for SemanticIndexComponentUid {
    type Err = ::std::convert::Infallible;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.to_string()))
    }
}
impl ::std::fmt::Display for SemanticIndexComponentUid {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
///`detail` of `reference-collision` from the join onto index components.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "`detail` of `reference-collision` from the join onto index components.",
///  "type": "object",
///  "required": [
///    "componentUids"
///  ],
///  "properties": {
///    "componentUids": {
///      "description": "The index components sharing the reference, in `components` order.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/SemanticIndexComponentUid"
///      },
///      "minItems": 2
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexComponentUidsDetail {
    ///The index components sharing the reference, in `components` order.
    #[serde(rename = "componentUids")]
    pub component_uids: ::std::vec::Vec<SemanticIndexComponentUid>,
}
/**Stable code of an assembly diagnostic (contract packet v1.0 §3.2; emitted
by `variant_catalog_service.py:50-51` and `semantic_index_variants.py`).*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Stable code of an assembly diagnostic (contract packet v1.0 §3.2; emitted\nby `variant_catalog_service.py:50-51` and `semantic_index_variants.py`).",
///  "type": "string",
///  "enum": [
///    "catalog-name-case-mismatch",
///    "source-unparseable",
///    "occurrence-instance-missing",
///    "multi-unit-conflict",
///    "reference-collision",
///    "source-state-mismatch",
///    "duplicate-reference-footprints",
///    "alternate-footprints-both-populated",
///    "rule-area-flags-unsupported",
///    "legacy-in-bom-semantics",
///    "unsupported-variant-token"
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
pub enum SemanticIndexDiagnosticCode {
    #[serde(rename = "catalog-name-case-mismatch")]
    CatalogNameCaseMismatch,
    #[serde(rename = "source-unparseable")]
    SourceUnparseable,
    #[serde(rename = "occurrence-instance-missing")]
    OccurrenceInstanceMissing,
    #[serde(rename = "multi-unit-conflict")]
    MultiUnitConflict,
    #[serde(rename = "reference-collision")]
    ReferenceCollision,
    #[serde(rename = "source-state-mismatch")]
    SourceStateMismatch,
    #[serde(rename = "duplicate-reference-footprints")]
    DuplicateReferenceFootprints,
    #[serde(rename = "alternate-footprints-both-populated")]
    AlternateFootprintsBothPopulated,
    #[serde(rename = "rule-area-flags-unsupported")]
    RuleAreaFlagsUnsupported,
    #[serde(rename = "legacy-in-bom-semantics")]
    LegacyInBomSemantics,
    #[serde(rename = "unsupported-variant-token")]
    UnsupportedVariantToken,
}
impl ::std::fmt::Display for SemanticIndexDiagnosticCode {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::CatalogNameCaseMismatch => f.write_str("catalog-name-case-mismatch"),
            Self::SourceUnparseable => f.write_str("source-unparseable"),
            Self::OccurrenceInstanceMissing => f.write_str("occurrence-instance-missing"),
            Self::MultiUnitConflict => f.write_str("multi-unit-conflict"),
            Self::ReferenceCollision => f.write_str("reference-collision"),
            Self::SourceStateMismatch => f.write_str("source-state-mismatch"),
            Self::DuplicateReferenceFootprints => f.write_str("duplicate-reference-footprints"),
            Self::AlternateFootprintsBothPopulated => {
                f.write_str("alternate-footprints-both-populated")
            }
            Self::RuleAreaFlagsUnsupported => f.write_str("rule-area-flags-unsupported"),
            Self::LegacyInBomSemantics => f.write_str("legacy-in-bom-semantics"),
            Self::UnsupportedVariantToken => f.write_str("unsupported-variant-token"),
        }
    }
}
impl ::std::str::FromStr for SemanticIndexDiagnosticCode {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "catalog-name-case-mismatch" => Ok(Self::CatalogNameCaseMismatch),
            "source-unparseable" => Ok(Self::SourceUnparseable),
            "occurrence-instance-missing" => Ok(Self::OccurrenceInstanceMissing),
            "multi-unit-conflict" => Ok(Self::MultiUnitConflict),
            "reference-collision" => Ok(Self::ReferenceCollision),
            "source-state-mismatch" => Ok(Self::SourceStateMismatch),
            "duplicate-reference-footprints" => Ok(Self::DuplicateReferenceFootprints),
            "alternate-footprints-both-populated" => Ok(Self::AlternateFootprintsBothPopulated),
            "rule-area-flags-unsupported" => Ok(Self::RuleAreaFlagsUnsupported),
            "legacy-in-bom-semantics" => Ok(Self::LegacyInBomSemantics),
            "unsupported-variant-token" => Ok(Self::UnsupportedVariantToken),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SemanticIndexDiagnosticCode {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SemanticIndexDiagnosticCode {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SemanticIndexDiagnosticCode {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
/**`detail` of an assembly diagnostic. Its shape depends on `code`; the shapes
are mutually exclusive, so exactly one matches. Two are maps because their
keys are not camelCase field names (conventions.md §5; field map, open
questions).*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "`detail` of an assembly diagnostic. Its shape depends on `code`; the shapes\nare mutually exclusive, so exactly one matches. Two are maps because their\nkeys are not camelCase field names (conventions.md §5; field map, open\nquestions).",
///  "oneOf": [
///    {
///      "description": "`legacy-in-bom-semantics`.",
///      "$ref": "#/$defs/SemanticIndexVersionDetail"
///    },
///    {
///      "description": "`unsupported-variant-token`.",
///      "$ref": "#/$defs/SemanticIndexTokensDetail"
///    },
///    {
///      "description": "`reference-collision` (occurrence projection).",
///      "$ref": "#/$defs/SemanticIndexOccurrenceIdsDetail"
///    },
///    {
///      "description": "`reference-collision` (component join).",
///      "$ref": "#/$defs/SemanticIndexComponentUidsDetail"
///    },
///    {
///      "description": "`catalog-name-case-mismatch`: keys exactly `found` (the board-side name)\nand `folded_into` (the catalog name it folded into).",
///      "$ref": "#/$defs/RecordString"
///    },
///    {
///      "description": "`rule-area-flags-unsupported`: keys are the rule area's KiCad tokens\nthat were set, each with the constant value it implies: `dnp` true,\n`in_bom` false, `on_board` false, `exclude_from_sim` true.",
///      "$ref": "#/$defs/RecordBoolean"
///    },
///    {
///      "description": "`multi-unit-conflict`: keys are the flag names (`dnp`,\n`excludeFromBom`, …) and raw field names that disagree; each value maps\noccurrence ids to that unit's value, a boolean for a flag and a string\nfor a field.",
///      "type": "object",
///      "additionalProperties": {
///        "type": "object",
///        "additionalProperties": {
///          "oneOf": [
///            {
///              "type": "boolean"
///            },
///            {
///              "type": "string"
///            }
///          ]
///        }
///      }
///    }
///  ]
///}
/// ```
/// </details>
#[derive(::serde::Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum SemanticIndexDiagnosticDetail {
    SemanticIndexVersionDetail(SemanticIndexVersionDetail),
    SemanticIndexTokensDetail(SemanticIndexTokensDetail),
    SemanticIndexOccurrenceIdsDetail(SemanticIndexOccurrenceIdsDetail),
    SemanticIndexComponentUidsDetail(SemanticIndexComponentUidsDetail),
    RecordString(RecordString),
    RecordBoolean(RecordBoolean),
    Object(
        ::std::collections::BTreeMap<
            ::std::string::String,
            ::std::collections::BTreeMap<
                ::std::string::String,
                SemanticIndexDiagnosticDetailObjectValueValue,
            >,
        >,
    ),
}
impl ::std::convert::From<SemanticIndexVersionDetail> for SemanticIndexDiagnosticDetail {
    fn from(value: SemanticIndexVersionDetail) -> Self {
        Self::SemanticIndexVersionDetail(value)
    }
}
impl ::std::convert::From<SemanticIndexTokensDetail> for SemanticIndexDiagnosticDetail {
    fn from(value: SemanticIndexTokensDetail) -> Self {
        Self::SemanticIndexTokensDetail(value)
    }
}
impl ::std::convert::From<SemanticIndexOccurrenceIdsDetail> for SemanticIndexDiagnosticDetail {
    fn from(value: SemanticIndexOccurrenceIdsDetail) -> Self {
        Self::SemanticIndexOccurrenceIdsDetail(value)
    }
}
impl ::std::convert::From<SemanticIndexComponentUidsDetail> for SemanticIndexDiagnosticDetail {
    fn from(value: SemanticIndexComponentUidsDetail) -> Self {
        Self::SemanticIndexComponentUidsDetail(value)
    }
}
impl ::std::convert::From<RecordString> for SemanticIndexDiagnosticDetail {
    fn from(value: RecordString) -> Self {
        Self::RecordString(value)
    }
}
impl ::std::convert::From<RecordBoolean> for SemanticIndexDiagnosticDetail {
    fn from(value: RecordBoolean) -> Self {
        Self::RecordBoolean(value)
    }
}
impl
    ::std::convert::From<
        ::std::collections::BTreeMap<
            ::std::string::String,
            ::std::collections::BTreeMap<
                ::std::string::String,
                SemanticIndexDiagnosticDetailObjectValueValue,
            >,
        >,
    > for SemanticIndexDiagnosticDetail
{
    fn from(
        value: ::std::collections::BTreeMap<
            ::std::string::String,
            ::std::collections::BTreeMap<
                ::std::string::String,
                SemanticIndexDiagnosticDetailObjectValueValue,
            >,
        >,
    ) -> Self {
        Self::Object(value)
    }
}
///`SemanticIndexDiagnosticDetailObjectValueValue`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "oneOf": [
///    {
///      "type": "boolean"
///    },
///    {
///      "type": "string"
///    }
///  ]
///}
/// ```
/// </details>
#[derive(::serde::Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum SemanticIndexDiagnosticDetailObjectValueValue {
    Boolean(bool),
    String(::std::string::String),
}
impl ::std::fmt::Display for SemanticIndexDiagnosticDetailObjectValueValue {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match self {
            Self::Boolean(x) => x.fmt(f),
            Self::String(x) => x.fmt(f),
        }
    }
}
impl ::std::convert::From<bool> for SemanticIndexDiagnosticDetailObjectValueValue {
    fn from(value: bool) -> Self {
        Self::Boolean(value)
    }
}
///How serious an assembly diagnostic is.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "How serious an assembly diagnostic is.",
///  "type": "string",
///  "enum": [
///    "info",
///    "warning",
///    "error"
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
pub enum SemanticIndexDiagnosticSeverity {
    #[serde(rename = "info")]
    Info,
    #[serde(rename = "warning")]
    Warning,
    #[serde(rename = "error")]
    Error,
}
impl ::std::fmt::Display for SemanticIndexDiagnosticSeverity {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Info => f.write_str("info"),
            Self::Warning => f.write_str("warning"),
            Self::Error => f.write_str("error"),
        }
    }
}
impl ::std::str::FromStr for SemanticIndexDiagnosticSeverity {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "info" => Ok(Self::Info),
            "warning" => Ok(Self::Warning),
            "error" => Ok(Self::Error),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SemanticIndexDiagnosticSeverity {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SemanticIndexDiagnosticSeverity {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SemanticIndexDiagnosticSeverity {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///Source file kind a catalog diagnostic is about.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Source file kind a catalog diagnostic is about.",
///  "type": "string",
///  "enum": [
///    "project",
///    "schematic",
///    "pcb"
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
pub enum SemanticIndexDiagnosticSource {
    #[serde(rename = "project")]
    Project,
    #[serde(rename = "schematic")]
    Schematic,
    #[serde(rename = "pcb")]
    Pcb,
}
impl ::std::fmt::Display for SemanticIndexDiagnosticSource {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Project => f.write_str("project"),
            Self::Schematic => f.write_str("schematic"),
            Self::Pcb => f.write_str("pcb"),
        }
    }
}
impl ::std::str::FromStr for SemanticIndexDiagnosticSource {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "project" => Ok(Self::Project),
            "schematic" => Ok(Self::Schematic),
            "pcb" => Ok(Self::Pcb),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SemanticIndexDiagnosticSource {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SemanticIndexDiagnosticSource {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SemanticIndexDiagnosticSource {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///Default state of one footprint from its `attr` flags; present only when a flag is true, and only true flags are present.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Default state of one footprint from its `attr` flags; present only when a flag is true, and only true flags are present.",
///  "type": "object",
///  "required": [
///    "componentUid",
///    "reference"
///  ],
///  "properties": {
///    "componentUid": {
///      "description": "The index component with this reference; `null` when no single component has it (a board-only part or an ambiguous reference).",
///      "oneOf": [
///        {
///          "$ref": "#/$defs/SemanticIndexComponentUid"
///        },
///        {
///          "type": "null"
///        }
///      ]
///    },
///    "dnp": {
///      "description": "`attr dnp`. Present only when true.",
///      "type": "boolean",
///      "const": true
///    },
///    "excludeFromBom": {
///      "description": "`attr exclude_from_bom`. Present only when true.",
///      "type": "boolean",
///      "const": true
///    },
///    "excludeFromPosFiles": {
///      "description": "`attr exclude_from_pos_files`. Present only when true.",
///      "type": "boolean",
///      "const": true
///    },
///    "reference": {
///      "description": "The footprint's resolved reference; empty when the board has no `Reference` property for it.",
///      "type": "string"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexFootprintDefault {
    ///The footprint's resolved reference; empty when the board has no `Reference` property for it.
    pub reference: ::std::string::String,
    ///`attr dnp`. Present only when true.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub dnp: ::std::option::Option<bool>,
    ///`attr exclude_from_bom`. Present only when true.
    #[serde(
        rename = "excludeFromBom",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub exclude_from_bom: ::std::option::Option<bool>,
    ///`attr exclude_from_pos_files`. Present only when true.
    #[serde(
        rename = "excludeFromPosFiles",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub exclude_from_pos_files: ::std::option::Option<bool>,
    ///The index component with this reference; `null` when no single component has it (a board-only part or an ambiguous reference).
    #[serde(rename = "componentUid")]
    pub component_uid: ::std::option::Option<SemanticIndexComponentUid>,
}
/**Footprint identity in the assembly block: the footprint's KiCadUuid, or the
empty string for a footprint the parser read no UUID for. Today's Python
parser reads only `(uuid …)`, so every footprint of a KiCad 7 board is
`""`. The bundle parses only the current format (sources older than the worker KiCad's format are upgraded by KiCad before parse, bundle-format.md §2.2), so every footprint has its
`(uuid …)` (field map, "Expected divergences").*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Footprint identity in the assembly block: the footprint's KiCadUuid, or the\nempty string for a footprint the parser read no UUID for. Today's Python\nparser reads only `(uuid …)`, so every footprint of a KiCad 7 board is\n`\"\"`. The bundle parses only the current format (sources older than the worker KiCad's format are upgraded by KiCad before parse, bundle-format.md §2.2), so every footprint has its\n`(uuid …)` (field map, \"Expected divergences\").",
///  "type": "string"
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize, ::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd,
)]
#[serde(transparent)]
pub struct SemanticIndexFootprintId(pub ::std::string::String);
impl ::std::ops::Deref for SemanticIndexFootprintId {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SemanticIndexFootprintId> for ::std::string::String {
    fn from(value: SemanticIndexFootprintId) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::string::String> for SemanticIndexFootprintId {
    fn from(value: ::std::string::String) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for SemanticIndexFootprintId {
    type Err = ::std::convert::Infallible;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.to_string()))
    }
}
impl ::std::fmt::Display for SemanticIndexFootprintId {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
///One board footprint's identity, including footprints with no variant state.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "One board footprint's identity, including footprints with no variant state.",
///  "type": "object",
///  "required": [
///    "reference",
///    "uuid"
///  ],
///  "properties": {
///    "reference": {
///      "description": "The footprint's `Reference` property as the variant resolver reads it; empty when the board has none.",
///      "type": "string"
///    },
///    "uuid": {
///      "description": "The footprint's identity: its UUID, or empty (see the scalar).",
///      "$ref": "#/$defs/SemanticIndexFootprintId"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexFootprintInventoryEntry {
    ///The footprint's identity: its UUID, or empty (see the scalar).
    pub uuid: SemanticIndexFootprintId,
    ///The footprint's `Reference` property as the variant resolver reads it; empty when the board has none.
    pub reference: ::std::string::String,
}
///A variant's difference from the default state of one footprint; only what differs is present.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A variant's difference from the default state of one footprint; only what differs is present.",
///  "type": "object",
///  "properties": {
///    "dnp": {
///      "description": "DNP in this variant, when it differs from the default.",
///      "type": "boolean"
///    },
///    "excludeFromBom": {
///      "description": "Excluded from the BOM in this variant, when it differs.",
///      "type": "boolean"
///    },
///    "excludeFromPosFiles": {
///      "description": "Excluded from position files in this variant, when it differs.",
///      "type": "boolean"
///    },
///    "fields": {
///      "description": "Keys: footprint property names whose effective text differs from the default; values are the variant's text. Absent when no property differs.",
///      "$ref": "#/$defs/RecordString"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexFootprintOverride {
    ///DNP in this variant, when it differs from the default.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub dnp: ::std::option::Option<bool>,
    ///Excluded from the BOM in this variant, when it differs.
    #[serde(
        rename = "excludeFromBom",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub exclude_from_bom: ::std::option::Option<bool>,
    ///Excluded from position files in this variant, when it differs.
    #[serde(
        rename = "excludeFromPosFiles",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub exclude_from_pos_files: ::std::option::Option<bool>,
    ///Keys: footprint property names whose effective text differs from the default; values are the variant's text. Absent when no property differs.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub fields: ::std::option::Option<RecordString>,
}
impl ::std::default::Default for SemanticIndexFootprintOverride {
    fn default() -> Self {
        Self {
            dnp: Default::default(),
            exclude_from_bom: Default::default(),
            exclude_from_pos_files: Default::default(),
            fields: Default::default(),
        }
    }
}
/**The twelve lookup maps (`semantic_index_service.py:853-875`). Every value
is a zero-based position in `components`, `terminals`, `nets`,
`sheetInstances` or `buses`. Where two elements share a key, the later
element wins (the map is filled in array order), except `netByName`
aliases, which never displace a name.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "The twelve lookup maps (`semantic_index_service.py:853-875`). Every value\nis a zero-based position in `components`, `terminals`, `nets`,\n`sheetInstances` or `buses`. Where two elements share a key, the later\nelement wins (the map is filled in array order), except `netByName`\naliases, which never displace a name.",
///  "type": "object",
///  "required": [
///    "busByUid",
///    "componentByPcbFootprintUuid",
///    "componentByReference",
///    "componentBySchematicUuid",
///    "netByName",
///    "netByNetCode",
///    "netByPcbUuid",
///    "netBySchematicUuid",
///    "sheetInstanceByPath",
///    "terminalByPcbPadUuid",
///    "terminalByReferencePin",
///    "terminalBySchematicPinUuid"
///  ],
///  "properties": {
///    "busByUid": {
///      "description": "Keys: a bus object's `busUid`. Value: position in `buses`.",
///      "$ref": "#/$defs/RecordSemanticIndexPosition"
///    },
///    "componentByPcbFootprintUuid": {
///      "description": "Keys: a footprint UUID in some component's `pcbRefs`. Value: position in `components`.",
///      "$ref": "#/$defs/RecordSemanticIndexPosition"
///    },
///    "componentByReference": {
///      "description": "Keys: component reference. Value: position in `components`.",
///      "$ref": "#/$defs/RecordSemanticIndexPosition"
///    },
///    "componentBySchematicUuid": {
///      "description": "Keys: a component's `schematicRefs[0].symbolUuid`. Value: position in `components`.",
///      "$ref": "#/$defs/RecordSemanticIndexPosition"
///    },
///    "netByName": {
///      "description": "Keys: every net `name`, and the `aliases` of a board net that absorbed schematic nets. Value: position in `nets`.",
///      "$ref": "#/$defs/RecordSemanticIndexPosition"
///    },
///    "netByNetCode": {
///      "description": "Keys: a `netCode` in decimal. Value: position in `nets`.",
///      "$ref": "#/$defs/RecordSemanticIndexPosition"
///    },
///    "netByPcbUuid": {
///      "description": "Keys: every UUID in a net's `pcbRefs` (pads, tracks, arcs, vias, zones). Value: position in `nets`.",
///      "$ref": "#/$defs/RecordSemanticIndexPosition"
///    },
///    "netBySchematicUuid": {
///      "description": "Keys: every UUID in a net's `schematicRefs` (wires, labels, junctions, pins). Value: position in `nets`.",
///      "$ref": "#/$defs/RecordSemanticIndexPosition"
///    },
///    "sheetInstanceByPath": {
///      "description": "Keys: a sheet instance's `sheetInstancePath`. Value: position in `sheetInstances`.",
///      "$ref": "#/$defs/RecordSemanticIndexPosition"
///    },
///    "terminalByPcbPadUuid": {
///      "description": "Keys: a terminal's `pcbPadUuid`. Value: position in `terminals`.",
///      "$ref": "#/$defs/RecordSemanticIndexPosition"
///    },
///    "terminalByReferencePin": {
///      "description": "Keys: `<reference>:<pin>` of every terminal. Value: position in `terminals`.",
///      "$ref": "#/$defs/RecordSemanticIndexPosition"
///    },
///    "terminalBySchematicPinUuid": {
///      "description": "Keys: a terminal's `schematicPinUuid`. Value: position in `terminals`.",
///      "$ref": "#/$defs/RecordSemanticIndexPosition"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexIndexes {
    ///Keys: component reference. Value: position in `components`.
    #[serde(rename = "componentByReference")]
    pub component_by_reference: RecordSemanticIndexPosition,
    ///Keys: a component's `schematicRefs[0].symbolUuid`. Value: position in `components`.
    #[serde(rename = "componentBySchematicUuid")]
    pub component_by_schematic_uuid: RecordSemanticIndexPosition,
    ///Keys: a footprint UUID in some component's `pcbRefs`. Value: position in `components`.
    #[serde(rename = "componentByPcbFootprintUuid")]
    pub component_by_pcb_footprint_uuid: RecordSemanticIndexPosition,
    ///Keys: a terminal's `schematicPinUuid`. Value: position in `terminals`.
    #[serde(rename = "terminalBySchematicPinUuid")]
    pub terminal_by_schematic_pin_uuid: RecordSemanticIndexPosition,
    ///Keys: a terminal's `pcbPadUuid`. Value: position in `terminals`.
    #[serde(rename = "terminalByPcbPadUuid")]
    pub terminal_by_pcb_pad_uuid: RecordSemanticIndexPosition,
    ///Keys: `<reference>:<pin>` of every terminal. Value: position in `terminals`.
    #[serde(rename = "terminalByReferencePin")]
    pub terminal_by_reference_pin: RecordSemanticIndexPosition,
    ///Keys: every net `name`, and the `aliases` of a board net that absorbed schematic nets. Value: position in `nets`.
    #[serde(rename = "netByName")]
    pub net_by_name: RecordSemanticIndexPosition,
    ///Keys: a `netCode` in decimal. Value: position in `nets`.
    #[serde(rename = "netByNetCode")]
    pub net_by_net_code: RecordSemanticIndexPosition,
    ///Keys: every UUID in a net's `schematicRefs` (wires, labels, junctions, pins). Value: position in `nets`.
    #[serde(rename = "netBySchematicUuid")]
    pub net_by_schematic_uuid: RecordSemanticIndexPosition,
    ///Keys: every UUID in a net's `pcbRefs` (pads, tracks, arcs, vias, zones). Value: position in `nets`.
    #[serde(rename = "netByPcbUuid")]
    pub net_by_pcb_uuid: RecordSemanticIndexPosition,
    ///Keys: a sheet instance's `sheetInstancePath`. Value: position in `sheetInstances`.
    #[serde(rename = "sheetInstanceByPath")]
    pub sheet_instance_by_path: RecordSemanticIndexPosition,
    ///Keys: a bus object's `busUid`. Value: position in `buses`.
    #[serde(rename = "busByUid")]
    pub bus_by_uid: RecordSemanticIndexPosition,
}
/**A point or size in schematic millimetres, `[x, y]` (or `[width, height]`),
as the schematic file writes it and kicad_monkey parses it (a double), +y
down. Today's unit, kept because this is a parity document.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A point or size in schematic millimetres, `[x, y]` (or `[width, height]`),\nas the schematic file writes it and kicad_monkey parses it (a double), +y\ndown. Today's unit, kept because this is a parity document.",
///  "type": "array",
///  "items": {
///    "type": "number"
///  },
///  "maxItems": 2,
///  "minItems": 2
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct SemanticIndexMmPair(pub [f64; 2usize]);
impl ::std::ops::Deref for SemanticIndexMmPair {
    type Target = [f64; 2usize];
    fn deref(&self) -> &[f64; 2usize] {
        &self.0
    }
}
impl ::std::convert::From<SemanticIndexMmPair> for [f64; 2usize] {
    fn from(value: SemanticIndexMmPair) -> Self {
        value.0
    }
}
impl ::std::convert::From<[f64; 2usize]> for SemanticIndexMmPair {
    fn from(value: [f64; 2usize]) -> Self {
        Self(value)
    }
}
/**One net (`semantic_index_service.py:929-961`, `:1043-1066`,
`semantic_index_nets.py`). The board names the net when the board and the
schematic netlist disagree; see the field map.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "One net (`semantic_index_service.py:929-961`, `:1043-1066`,\n`semantic_index_nets.py`). The board names the net when the board and the\nschematic netlist disagree; see the field map.",
///  "type": "object",
///  "required": [
///    "name",
///    "netClass",
///    "netUid",
///    "pcbRefs",
///    "schematicRefs",
///    "webgpuRefs"
///  ],
///  "properties": {
///    "aliases": {
///      "description": "Other names of this net. On a schematic net: the netlist's aliases,\nsorted in code point order. On a board net that absorbed schematic nets:\neach absorbed name followed by its own aliases, in the order the board\npass met them, without repeats. Absent on a board-only net that absorbed\nnothing.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/NetName"
///      }
///    },
///    "name": {
///      "description": "KiCad full net name: the design netlist's name for a schematic net; the\nboard's name for a net only the board has, including one that absorbed\nschematic nets in the split-net reconciliation.",
///      "$ref": "#/$defs/NetName"
///    },
///    "netClass": {
///      "description": "Net class name from the netlist (`Default` when unassigned); empty for a board-only net with no absorbed schematic net.",
///      "type": "string"
///    },
///    "netCode": {
///      "description": "The board's net number, from the last board item on this net that\ncarries one. Absent when no board item on the net carries a number (a\nschematic-only net, a KiCad 10 board, which names nets without numbers,\nor no board). `null` on a net only the board has (created by the board\npass) whose items carry no number.",
///      "oneOf": [
///        {
///          "$ref": "#/$defs/SemanticIndexNetCode"
///        },
///        {
///          "type": "null"
///        }
///      ]
///    },
///    "netUid": {
///      "description": "Stable net id, from `name`.",
///      "$ref": "#/$defs/SemanticIndexNetUid"
///    },
///    "pcbRefs": {
///      "description": "Exactly one entry holding the net's board items, empty lists without a board; array order is moot.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/SemanticIndexNetPcbRef"
///      },
///      "maxItems": 1,
///      "minItems": 1
///    },
///    "schematicRefs": {
///      "description": "The net's schematic items grouped by sheet instance, in first-seen order\n(walking wires, then labels, then junctions); the unplaced entry, if any,\ncomes last. A schematic net always has at least one entry (an empty\nunplaced entry when it has no item); a board-only net has none, unless it\nabsorbed schematic nets, whose entries it then lists in absorption order.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/SemanticIndexNetSchematicRef"
///      }
///    },
///    "sourceSheets": {
///      "description": "Netlist sheet paths of the net's terminals. On a schematic net: sorted\nin code point order, without repeats. On a board net that absorbed\nschematic nets: their sheet paths in absorption order, without repeats.\nAbsent on a board-only net that absorbed nothing.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/SemanticIndexNetlistSheetPath"
///      }
///    },
///    "webgpuRefs": {
///      "description": "Always empty (reserved); array order is moot.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/SemanticIndexWebGpuRef"
///      },
///      "maxItems": 0
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexNet {
    ///Stable net id, from `name`.
    #[serde(rename = "netUid")]
    pub net_uid: SemanticIndexNetUid,
    /**KiCad full net name: the design netlist's name for a schematic net; the
    board's name for a net only the board has, including one that absorbed
    schematic nets in the split-net reconciliation.*/
    pub name: NetName,
    ///Net class name from the netlist (`Default` when unassigned); empty for a board-only net with no absorbed schematic net.
    #[serde(rename = "netClass")]
    pub net_class: ::std::string::String,
    /**Other names of this net. On a schematic net: the netlist's aliases,
    sorted in code point order. On a board net that absorbed schematic nets:
    each absorbed name followed by its own aliases, in the order the board
    pass met them, without repeats. Absent on a board-only net that absorbed
    nothing.*/
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub aliases: ::std::option::Option<::std::vec::Vec<NetName>>,
    /**Netlist sheet paths of the net's terminals. On a schematic net: sorted
    in code point order, without repeats. On a board net that absorbed
    schematic nets: their sheet paths in absorption order, without repeats.
    Absent on a board-only net that absorbed nothing.*/
    #[serde(
        rename = "sourceSheets",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub source_sheets: ::std::option::Option<::std::vec::Vec<SemanticIndexNetlistSheetPath>>,
    /**The net's schematic items grouped by sheet instance, in first-seen order
    (walking wires, then labels, then junctions); the unplaced entry, if any,
    comes last. A schematic net always has at least one entry (an empty
    unplaced entry when it has no item); a board-only net has none, unless it
    absorbed schematic nets, whose entries it then lists in absorption order.*/
    #[serde(rename = "schematicRefs")]
    pub schematic_refs: ::std::vec::Vec<SemanticIndexNetSchematicRef>,
    ///Exactly one entry holding the net's board items, empty lists without a board; array order is moot.
    #[serde(rename = "pcbRefs")]
    pub pcb_refs: [SemanticIndexNetPcbRef; 1usize],
    ///Always empty (reserved); array order is moot.
    #[serde(rename = "webgpuRefs")]
    pub webgpu_refs: ::std::vec::Vec<SemanticIndexWebGpuRef>,
    /**The board's net number, from the last board item on this net that
    carries one. Absent when no board item on the net carries a number (a
    schematic-only net, a KiCad 10 board, which names nets without numbers,
    or no board). `null` on a net only the board has (created by the board
    pass) whose items carry no number.*/
    #[serde(
        rename = "netCode",
        default,
        deserialize_with = "crate::deserialize_present_nullable",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub net_code: ::std::option::Option<::std::option::Option<SemanticIndexNetCode>>,
}
/**KiCad net number (`(net <n> "<name>")`) from a board that has a net table,
KiCad 9 format and earlier; 0 is KiCad's "no net" and never appears.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "KiCad net number (`(net <n> \"<name>\")`) from a board that has a net table,\nKiCad 9 format and earlier; 0 is KiCad's \"no net\" and never appears.",
///  "type": "integer",
///  "maximum": 2147483647.0,
///  "minimum": 1.0
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct SemanticIndexNetCode(pub ::std::num::NonZeroU64);
impl ::std::ops::Deref for SemanticIndexNetCode {
    type Target = ::std::num::NonZeroU64;
    fn deref(&self) -> &::std::num::NonZeroU64 {
        &self.0
    }
}
impl ::std::convert::From<SemanticIndexNetCode> for ::std::num::NonZeroU64 {
    fn from(value: SemanticIndexNetCode) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::num::NonZeroU64> for SemanticIndexNetCode {
    fn from(value: ::std::num::NonZeroU64) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for SemanticIndexNetCode {
    type Err = <::std::num::NonZeroU64 as ::std::str::FromStr>::Err;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.parse()?))
    }
}
impl ::std::convert::TryFrom<&str> for SemanticIndexNetCode {
    type Error = <::std::num::NonZeroU64 as ::std::str::FromStr>::Err;
    fn try_from(value: &str) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<String> for SemanticIndexNetCode {
    type Error = <::std::num::NonZeroU64 as ::std::str::FromStr>::Err;
    fn try_from(value: String) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::fmt::Display for SemanticIndexNetCode {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
/**A net's board items, by kind (`semantic_index_service.py:950`,
`:1084-1086`, `:1113-1127`). Board items with no net or no UUID are not
listed.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A net's board items, by kind (`semantic_index_service.py:950`,\n`:1084-1086`, `:1113-1127`). Board items with no net or no UUID are not\nlisted.",
///  "type": "object",
///  "required": [
///    "arcUuids",
///    "padUuids",
///    "trackUuids",
///    "viaUuids",
///    "zoneUuids"
///  ],
///  "properties": {
///    "arcUuids": {
///      "description": "UUIDs of the net's arc tracks, in board file order.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/KiCadUuid"
///      }
///    },
///    "padUuids": {
///      "description": "UUIDs of the net's pads, in board file order (footprints in file order, each footprint's pads in file order).",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/KiCadUuid"
///      }
///    },
///    "trackUuids": {
///      "description": "UUIDs of the net's track segments, in board file order.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/KiCadUuid"
///      }
///    },
///    "viaUuids": {
///      "description": "UUIDs of the net's vias, in board file order.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/KiCadUuid"
///      }
///    },
///    "zoneUuids": {
///      "description": "UUIDs of the net's zones, in board file order.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/KiCadUuid"
///      }
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexNetPcbRef {
    ///UUIDs of the net's track segments, in board file order.
    #[serde(rename = "trackUuids")]
    pub track_uuids: ::std::vec::Vec<KiCadUuid>,
    ///UUIDs of the net's arc tracks, in board file order.
    #[serde(rename = "arcUuids")]
    pub arc_uuids: ::std::vec::Vec<KiCadUuid>,
    ///UUIDs of the net's vias, in board file order.
    #[serde(rename = "viaUuids")]
    pub via_uuids: ::std::vec::Vec<KiCadUuid>,
    ///UUIDs of the net's zones, in board file order.
    #[serde(rename = "zoneUuids")]
    pub zone_uuids: ::std::vec::Vec<KiCadUuid>,
    ///UUIDs of the net's pads, in board file order (footprints in file order, each footprint's pads in file order).
    #[serde(rename = "padUuids")]
    pub pad_uuids: ::std::vec::Vec<KiCadUuid>,
}
/**A net's schematic items on one sheet instance (`_group_schematic_refs`,
`semantic_index_service.py:721-781`). The three location fields are
present together, or all absent on the one "unplaced" entry that collects
items with no known sheet instance.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A net's schematic items on one sheet instance (`_group_schematic_refs`,\n`semantic_index_service.py:721-781`). The three location fields are\npresent together, or all absent on the one \"unplaced\" entry that collects\nitems with no known sheet instance.",
///  "type": "object",
///  "required": [
///    "junctionUuids",
///    "labelInstanceCount",
///    "labelUuids",
///    "pinUuids",
///    "wireUuids"
///  ],
///  "properties": {
///    "junctionUuids": {
///      "description": "UUIDs of the net's junctions, then sheet entries, on this sheet instance; each group in the order the net lists it, without repeats.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/KiCadUuid"
///      }
///    },
///    "labelInstanceCount": {
///      "description": "Number of local labels (not global, hierarchical or power) counted on\nthis sheet instance; on the unplaced entry, the net's total local-label\ncount when any item is unplaced, else 0.",
///      "$ref": "#/$defs/Count"
///    },
///    "labelUuids": {
///      "description": "UUIDs of the net's local labels, then global and hierarchical labels\n(`ports`), then power symbols (`power_ports`) on this sheet instance; each\ngroup in the order the net lists it, without repeats.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/KiCadUuid"
///      }
///    },
///    "page": {
///      "description": "The sheet's `.kicad_sch`, repository-relative. Absent on the unplaced entry.",
///      "$ref": "#/$defs/RepoPath"
///    },
///    "pinUuids": {
///      "description": "`schematicPinUuid`s of the net's terminals on this sheet instance (the\nfirst entry when the pin's sheet instance is unknown), in terminal\norder, without repeats.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/KiCadUuid"
///      }
///    },
///    "sheetInstancePath": {
///      "description": "The sheet instance, schematic-form KiidPath (starts at the root sheet's UUID). Absent on the unplaced entry.",
///      "$ref": "#/$defs/KiidPath"
///    },
///    "sheetPath": {
///      "description": "The sheet instance's human sheet path. Absent on the unplaced entry.",
///      "$ref": "#/$defs/SemanticIndexSheetNamePath"
///    },
///    "wireUuids": {
///      "description": "UUIDs of the net's wires on this sheet instance, in the order the net lists them (sorted by kicad_monkey), without repeats.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/KiCadUuid"
///      }
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexNetSchematicRef {
    ///The sheet instance, schematic-form KiidPath (starts at the root sheet's UUID). Absent on the unplaced entry.
    #[serde(
        rename = "sheetInstancePath",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub sheet_instance_path: ::std::option::Option<KiidPath>,
    ///The sheet instance's human sheet path. Absent on the unplaced entry.
    #[serde(
        rename = "sheetPath",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub sheet_path: ::std::option::Option<SemanticIndexSheetNamePath>,
    ///The sheet's `.kicad_sch`, repository-relative. Absent on the unplaced entry.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub page: ::std::option::Option<RepoPath>,
    ///UUIDs of the net's wires on this sheet instance, in the order the net lists them (sorted by kicad_monkey), without repeats.
    #[serde(rename = "wireUuids")]
    pub wire_uuids: ::std::vec::Vec<KiCadUuid>,
    /**UUIDs of the net's local labels, then global and hierarchical labels
    (`ports`), then power symbols (`power_ports`) on this sheet instance; each
    group in the order the net lists it, without repeats.*/
    #[serde(rename = "labelUuids")]
    pub label_uuids: ::std::vec::Vec<KiCadUuid>,
    ///UUIDs of the net's junctions, then sheet entries, on this sheet instance; each group in the order the net lists it, without repeats.
    #[serde(rename = "junctionUuids")]
    pub junction_uuids: ::std::vec::Vec<KiCadUuid>,
    /**`schematicPinUuid`s of the net's terminals on this sheet instance (the
    first entry when the pin's sheet instance is unknown), in terminal
    order, without repeats.*/
    #[serde(rename = "pinUuids")]
    pub pin_uuids: ::std::vec::Vec<KiCadUuid>,
    /**Number of local labels (not global, hierarchical or power) counted on
    this sheet instance; on the unplaced entry, the net's total local-label
    count when any item is unplaced, else 0.*/
    #[serde(rename = "labelInstanceCount")]
    pub label_instance_count: Count,
}
/**Net id: `net:` followed by the first 20 hex digits of the SHA-256 of the
net's full name (UTF-8), `_stable_uid("net", name)`
(`semantic_index_service.py:936`, `:1050`).*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Net id: `net:` followed by the first 20 hex digits of the SHA-256 of the\nnet's full name (UTF-8), `_stable_uid(\"net\", name)`\n(`semantic_index_service.py:936`, `:1050`).",
///  "type": "string"
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize, ::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd,
)]
#[serde(transparent)]
pub struct SemanticIndexNetUid(pub ::std::string::String);
impl ::std::ops::Deref for SemanticIndexNetUid {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SemanticIndexNetUid> for ::std::string::String {
    fn from(value: SemanticIndexNetUid) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::string::String> for SemanticIndexNetUid {
    fn from(value: ::std::string::String) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for SemanticIndexNetUid {
    type Err = ::std::convert::Infallible;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.to_string()))
    }
}
impl ::std::fmt::Display for SemanticIndexNetUid {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
/**Sheet path in the netlist's UUID form: `/` for the root sheet, else the
sheet symbols' UUIDs from below the root down, each followed by `/`, for
example `/c33f383d-e37a-5ee0-b3d2-b1d64b3f8476/`. It omits the root sheet's
own UUID and ends in `/`, unlike Common.KiidPath.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Sheet path in the netlist's UUID form: `/` for the root sheet, else the\nsheet symbols' UUIDs from below the root down, each followed by `/`, for\nexample `/c33f383d-e37a-5ee0-b3d2-b1d64b3f8476/`. It omits the root sheet's\nown UUID and ends in `/`, unlike Common.KiidPath.",
///  "type": "string"
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize, ::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd,
)]
#[serde(transparent)]
pub struct SemanticIndexNetlistSheetPath(pub ::std::string::String);
impl ::std::ops::Deref for SemanticIndexNetlistSheetPath {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SemanticIndexNetlistSheetPath> for ::std::string::String {
    fn from(value: SemanticIndexNetlistSheetPath) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::string::String> for SemanticIndexNetlistSheetPath {
    fn from(value: ::std::string::String) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for SemanticIndexNetlistSheetPath {
    type Err = ::std::convert::Infallible;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.to_string()))
    }
}
impl ::std::fmt::Display for SemanticIndexNetlistSheetPath {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
/**Default state of one schematic occurrence: present only when at least one
flag is true, and only true flags are present (contract packet v1.0 §2.7).*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Default state of one schematic occurrence: present only when at least one\nflag is true, and only true flags are present (contract packet v1.0 §2.7).",
///  "type": "object",
///  "required": [
///    "reference"
///  ],
///  "properties": {
///    "componentUid": {
///      "description": "The index component with this reference; absent when no single component has it.",
///      "$ref": "#/$defs/SemanticIndexComponentUid"
///    },
///    "dnp": {
///      "description": "DNP in the default design, after the sheet fold. Present only when true.",
///      "type": "boolean",
///      "const": true
///    },
///    "excludeFromBoard": {
///      "description": "Excluded from the board, after the sheet fold. Present only when true.",
///      "type": "boolean",
///      "const": true
///    },
///    "excludeFromBom": {
///      "description": "Excluded from the BOM, after the sheet fold. Present only when true.",
///      "type": "boolean",
///      "const": true
///    },
///    "excludeFromPosFiles": {
///      "description": "Excluded from position files (never folded from sheets). Present only when true.",
///      "type": "boolean",
///      "const": true
///    },
///    "excludeFromSim": {
///      "description": "Excluded from simulation, after the sheet fold. Present only when true.",
///      "type": "boolean",
///      "const": true
///    },
///    "reference": {
///      "description": "The occurrence's resolved reference.",
///      "$ref": "#/$defs/Refdes"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexOccurrenceDefault {
    ///The occurrence's resolved reference.
    pub reference: Refdes,
    ///DNP in the default design, after the sheet fold. Present only when true.
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub dnp: ::std::option::Option<bool>,
    ///Excluded from the BOM, after the sheet fold. Present only when true.
    #[serde(
        rename = "excludeFromBom",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub exclude_from_bom: ::std::option::Option<bool>,
    ///Excluded from the board, after the sheet fold. Present only when true.
    #[serde(
        rename = "excludeFromBoard",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub exclude_from_board: ::std::option::Option<bool>,
    ///Excluded from simulation, after the sheet fold. Present only when true.
    #[serde(
        rename = "excludeFromSim",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub exclude_from_sim: ::std::option::Option<bool>,
    ///Excluded from position files (never folded from sheets). Present only when true.
    #[serde(
        rename = "excludeFromPosFiles",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub exclude_from_pos_files: ::std::option::Option<bool>,
    ///The index component with this reference; absent when no single component has it.
    #[serde(
        rename = "componentUid",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub component_uid: ::std::option::Option<SemanticIndexComponentUid>,
}
///`detail` of `reference-collision` from the occurrence projection.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "`detail` of `reference-collision` from the occurrence projection.",
///  "type": "object",
///  "required": [
///    "occurrenceIds"
///  ],
///  "properties": {
///    "occurrenceIds": {
///      "description": "The colliding occurrences' ids (schematic-form KiidPath), sorted in code point order.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/KiidPath"
///      },
///      "minItems": 2
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexOccurrenceIdsDetail {
    ///The colliding occurrences' ids (schematic-form KiidPath), sorted in code point order.
    #[serde(rename = "occurrenceIds")]
    pub occurrence_ids: ::std::vec::Vec<KiidPath>,
}
///A pin or pad number as written (Common.PadNumber), never empty.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A pin or pad number as written (Common.PadNumber), never empty.",
///  "type": "string",
///  "minLength": 1
///}
/// ```
/// </details>
#[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct SemanticIndexPinNumber(::std::string::String);
impl ::std::ops::Deref for SemanticIndexPinNumber {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SemanticIndexPinNumber> for ::std::string::String {
    fn from(value: SemanticIndexPinNumber) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for SemanticIndexPinNumber {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for SemanticIndexPinNumber {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SemanticIndexPinNumber {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SemanticIndexPinNumber {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for SemanticIndexPinNumber {
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
/**Electrical type of a schematic pin, as kicad_monkey's design JSON writes
it: KiCad's pin type token in upper case (`_pin_type_json`,
kicad_monkey 2026.9.7 `kicad_design_json.py:708-710`). A pin with no type
is `PASSIVE`; the pre-2021 token `unconnected` reads as `NO_CONNECT`.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Electrical type of a schematic pin, as kicad_monkey's design JSON writes\nit: KiCad's pin type token in upper case (`_pin_type_json`,\nkicad_monkey 2026.9.7 `kicad_design_json.py:708-710`). A pin with no type\nis `PASSIVE`; the pre-2021 token `unconnected` reads as `NO_CONNECT`.",
///  "type": "string",
///  "enum": [
///    "INPUT",
///    "OUTPUT",
///    "BIDIRECTIONAL",
///    "TRI_STATE",
///    "PASSIVE",
///    "FREE",
///    "UNSPECIFIED",
///    "POWER_IN",
///    "POWER_OUT",
///    "OPEN_COLLECTOR",
///    "OPEN_EMITTER",
///    "NO_CONNECT"
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
pub enum SemanticIndexPinType {
    #[serde(rename = "INPUT")]
    Input,
    #[serde(rename = "OUTPUT")]
    Output,
    #[serde(rename = "BIDIRECTIONAL")]
    Bidirectional,
    #[serde(rename = "TRI_STATE")]
    TriState,
    #[serde(rename = "PASSIVE")]
    Passive,
    #[serde(rename = "FREE")]
    Free,
    #[serde(rename = "UNSPECIFIED")]
    Unspecified,
    #[serde(rename = "POWER_IN")]
    PowerIn,
    #[serde(rename = "POWER_OUT")]
    PowerOut,
    #[serde(rename = "OPEN_COLLECTOR")]
    OpenCollector,
    #[serde(rename = "OPEN_EMITTER")]
    OpenEmitter,
    #[serde(rename = "NO_CONNECT")]
    NoConnect,
}
impl ::std::fmt::Display for SemanticIndexPinType {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Input => f.write_str("INPUT"),
            Self::Output => f.write_str("OUTPUT"),
            Self::Bidirectional => f.write_str("BIDIRECTIONAL"),
            Self::TriState => f.write_str("TRI_STATE"),
            Self::Passive => f.write_str("PASSIVE"),
            Self::Free => f.write_str("FREE"),
            Self::Unspecified => f.write_str("UNSPECIFIED"),
            Self::PowerIn => f.write_str("POWER_IN"),
            Self::PowerOut => f.write_str("POWER_OUT"),
            Self::OpenCollector => f.write_str("OPEN_COLLECTOR"),
            Self::OpenEmitter => f.write_str("OPEN_EMITTER"),
            Self::NoConnect => f.write_str("NO_CONNECT"),
        }
    }
}
impl ::std::str::FromStr for SemanticIndexPinType {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "INPUT" => Ok(Self::Input),
            "OUTPUT" => Ok(Self::Output),
            "BIDIRECTIONAL" => Ok(Self::Bidirectional),
            "TRI_STATE" => Ok(Self::TriState),
            "PASSIVE" => Ok(Self::Passive),
            "FREE" => Ok(Self::Free),
            "UNSPECIFIED" => Ok(Self::Unspecified),
            "POWER_IN" => Ok(Self::PowerIn),
            "POWER_OUT" => Ok(Self::PowerOut),
            "OPEN_COLLECTOR" => Ok(Self::OpenCollector),
            "OPEN_EMITTER" => Ok(Self::OpenEmitter),
            "NO_CONNECT" => Ok(Self::NoConnect),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SemanticIndexPinType {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SemanticIndexPinType {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SemanticIndexPinType {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///Zero-based position of an element in the array an index map names.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Zero-based position of an element in the array an index map names.",
///  "type": "integer",
///  "minimum": 0.0
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct SemanticIndexPosition(pub u64);
impl ::std::ops::Deref for SemanticIndexPosition {
    type Target = u64;
    fn deref(&self) -> &u64 {
        &self.0
    }
}
impl ::std::convert::From<SemanticIndexPosition> for u64 {
    fn from(value: SemanticIndexPosition) -> Self {
        value.0
    }
}
impl ::std::convert::From<u64> for SemanticIndexPosition {
    fn from(value: u64) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for SemanticIndexPosition {
    type Err = <u64 as ::std::str::FromStr>::Err;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.parse()?))
    }
}
impl ::std::convert::TryFrom<&str> for SemanticIndexPosition {
    type Error = <u64 as ::std::str::FromStr>::Err;
    fn try_from(value: &str) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<String> for SemanticIndexPosition {
    type Error = <u64 as ::std::str::FromStr>::Err;
    fn try_from(value: String) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::fmt::Display for SemanticIndexPosition {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
/**One placement of a schematic sheet in the hierarchy
(`semantic_index_service.py:591-629`, `:710-716`). A reused sheet file has
one entry per instance.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "One placement of a schematic sheet in the hierarchy\n(`semantic_index_service.py:591-629`, `:710-716`). A reused sheet file has\none entry per instance.",
///  "type": "object",
///  "required": [
///    "isTopLevel",
///    "page",
///    "parentPage",
///    "parentSheetInstancePath",
///    "sheetInstancePath",
///    "sheetInstanceUid",
///    "sheetName",
///    "sheetPath",
///    "sheetSymbolUuid"
///  ],
///  "properties": {
///    "isTopLevel": {
///      "description": "True for the root sheet only.",
///      "type": "boolean"
///    },
///    "page": {
///      "description": "The sheet's `.kicad_sch`, repository-relative.",
///      "$ref": "#/$defs/RepoPath"
///    },
///    "parentPage": {
///      "description": "The parent instance's `page`; `null` for the root sheet.",
///      "oneOf": [
///        {
///          "$ref": "#/$defs/RepoPath"
///        },
///        {
///          "type": "null"
///        }
///      ]
///    },
///    "parentSheetInstancePath": {
///      "description": "The parent instance's `sheetInstancePath`; `null` for the root sheet.",
///      "oneOf": [
///        {
///          "$ref": "#/$defs/KiidPath"
///        },
///        {
///          "type": "null"
///        }
///      ]
///    },
///    "sheetInstancePath": {
///      "description": "The instance's KIID path, schematic form (starts at the root sheet's UUID).",
///      "$ref": "#/$defs/KiidPath"
///    },
///    "sheetInstanceUid": {
///      "description": "Stable sheet instance id, from `sheetInstancePath` and `page`.",
///      "$ref": "#/$defs/SemanticIndexSheetInstanceUid"
///    },
///    "sheetName": {
///      "description": "The sheet's name (the root sheet's is the schematic file's stem).",
///      "type": "string"
///    },
///    "sheetPath": {
///      "description": "The instance's human sheet path.",
///      "$ref": "#/$defs/SemanticIndexSheetNamePath"
///    },
///    "sheetSymbolUuid": {
///      "description": "UUID of the sheet symbol that places this instance; `null` for the root sheet.",
///      "oneOf": [
///        {
///          "$ref": "#/$defs/KiCadUuid"
///        },
///        {
///          "type": "null"
///        }
///      ]
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexSheetInstance {
    ///Stable sheet instance id, from `sheetInstancePath` and `page`.
    #[serde(rename = "sheetInstanceUid")]
    pub sheet_instance_uid: SemanticIndexSheetInstanceUid,
    ///The instance's KIID path, schematic form (starts at the root sheet's UUID).
    #[serde(rename = "sheetInstancePath")]
    pub sheet_instance_path: KiidPath,
    ///The instance's human sheet path.
    #[serde(rename = "sheetPath")]
    pub sheet_path: SemanticIndexSheetNamePath,
    ///The sheet's `.kicad_sch`, repository-relative.
    pub page: RepoPath,
    ///The parent instance's `sheetInstancePath`; `null` for the root sheet.
    #[serde(rename = "parentSheetInstancePath")]
    pub parent_sheet_instance_path: ::std::option::Option<KiidPath>,
    ///UUID of the sheet symbol that places this instance; `null` for the root sheet.
    #[serde(rename = "sheetSymbolUuid")]
    pub sheet_symbol_uuid: ::std::option::Option<KiCadUuid>,
    ///The sheet's name (the root sheet's is the schematic file's stem).
    #[serde(rename = "sheetName")]
    pub sheet_name: ::std::string::String,
    ///True for the root sheet only.
    #[serde(rename = "isTopLevel")]
    pub is_top_level: bool,
    ///The parent instance's `page`; `null` for the root sheet.
    #[serde(rename = "parentPage")]
    pub parent_page: ::std::option::Option<RepoPath>,
}
/**Sheet instance id: `sheet-instance:` followed by the first 20 hex digits of
the SHA-256 of `<sheetInstancePath>\u001f<page>` (UTF-8)
(`semantic_index_service.py:616-620`).*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Sheet instance id: `sheet-instance:` followed by the first 20 hex digits of\nthe SHA-256 of `<sheetInstancePath>\\u001f<page>` (UTF-8)\n(`semantic_index_service.py:616-620`).",
///  "type": "string"
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize, ::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd,
)]
#[serde(transparent)]
pub struct SemanticIndexSheetInstanceUid(pub ::std::string::String);
impl ::std::ops::Deref for SemanticIndexSheetInstanceUid {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SemanticIndexSheetInstanceUid> for ::std::string::String {
    fn from(value: SemanticIndexSheetInstanceUid) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::string::String> for SemanticIndexSheetInstanceUid {
    fn from(value: ::std::string::String) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for SemanticIndexSheetInstanceUid {
    type Err = ::std::convert::Infallible;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.to_string()))
    }
}
impl ::std::fmt::Display for SemanticIndexSheetInstanceUid {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
/**Human (name) sheet path as kicad_monkey spells it: `/` for the root sheet,
else each sheet name from the root down, each followed by `/`, for example
`/Power/` or `/Wireless/Antenna/`. Not a KIID path.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Human (name) sheet path as kicad_monkey spells it: `/` for the root sheet,\nelse each sheet name from the root down, each followed by `/`, for example\n`/Power/` or `/Wireless/Antenna/`. Not a KIID path.",
///  "type": "string"
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize, ::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd,
)]
#[serde(transparent)]
pub struct SemanticIndexSheetNamePath(pub ::std::string::String);
impl ::std::ops::Deref for SemanticIndexSheetNamePath {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SemanticIndexSheetNamePath> for ::std::string::String {
    fn from(value: SemanticIndexSheetNamePath) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::string::String> for SemanticIndexSheetNamePath {
    fn from(value: ::std::string::String) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for SemanticIndexSheetNamePath {
    type Err = ::std::convert::Infallible;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.to_string()))
    }
}
impl ::std::fmt::Display for SemanticIndexSheetNamePath {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
/**One (reference, pin) on one net (`semantic_index_service.py:963-1023`,
`:1087-1111`). Terminals the schematic netlist lists carry `pinName`,
`pinType`, `schematicNetName` and `schematicPinUuid`; terminals only the
board has (a pad with no schematic pin) carry none of them.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "One (reference, pin) on one net (`semantic_index_service.py:963-1023`,\n`:1087-1111`). Terminals the schematic netlist lists carry `pinName`,\n`pinType`, `schematicNetName` and `schematicPinUuid`; terminals only the\nboard has (a pad with no schematic pin) carry none of them.",
///  "type": "object",
///  "required": [
///    "componentUid",
///    "netName",
///    "netUid",
///    "pin",
///    "reference",
///    "terminalUid"
///  ],
///  "properties": {
///    "componentUid": {
///      "description": "The component this pin belongs to: its `componentUid`, or the reference-only uid when no component has this reference.",
///      "$ref": "#/$defs/SemanticIndexComponentUid"
///    },
///    "netName": {
///      "description": "The terminal's net, pad-resolved: the board net of the terminal's pad when\nthe pad has one; otherwise the schematic netlist's net (or the board net\nthat absorbed it in the split-net reconciliation). `null` on a\nboard-only terminal whose pad has no net.",
///      "oneOf": [
///        {
///          "$ref": "#/$defs/NetName"
///        },
///        {
///          "type": "null"
///        }
///      ]
///    },
///    "netUid": {
///      "description": "`netUid` of the net named by `netName`; `null` on a board-only terminal whose pad has no net.",
///      "oneOf": [
///        {
///          "$ref": "#/$defs/SemanticIndexNetUid"
///        },
///        {
///          "type": "null"
///        }
///      ]
///    },
///    "pcbPadUuid": {
///      "description": "UUID of the board pad with this reference and number. Absent when no pad matches.",
///      "$ref": "#/$defs/KiCadUuid"
///    },
///    "pin": {
///      "description": "Pin (pad) number as written, never empty.",
///      "$ref": "#/$defs/SemanticIndexPinNumber"
///    },
///    "pinName": {
///      "description": "Added in a1 (ADR §6). The schematic pin's name (KiCad `pinfunction`) as\nthe library symbol writes it, possibly empty or `~`; for stacked pins\n`<name>_<number>`. Absent on a terminal the netlist did not list with its\npin record (board-only or graphical-pin-only terminals).",
///      "type": "string"
///    },
///    "pinType": {
///      "description": "Added in a1 (ADR §6). The schematic pin's electrical type. Absent where\n`pinName` is.",
///      "$ref": "#/$defs/SemanticIndexPinType"
///    },
///    "reference": {
///      "description": "Reference designator.",
///      "$ref": "#/$defs/Refdes"
///    },
///    "schematicNetName": {
///      "description": "Added in a1 (ADR §6). The name of the schematic netlist net that lists\nthis terminal, before the board pass and the reconciliation rewrite\n`netName`. Absent on a board-only terminal.",
///      "$ref": "#/$defs/NetName"
///    },
///    "schematicPinUuid": {
///      "description": "UUID of the placed symbol's pin (`(pin \"<n>\" (uuid …))`), or of the\nsymbol when the pin has no drawable element. Absent on a board-only\nterminal.",
///      "$ref": "#/$defs/KiCadUuid"
///    },
///    "terminalUid": {
///      "description": "Stable terminal id, from the reference and pin.",
///      "$ref": "#/$defs/SemanticIndexTerminalUid"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexTerminal {
    ///Stable terminal id, from the reference and pin.
    #[serde(rename = "terminalUid")]
    pub terminal_uid: SemanticIndexTerminalUid,
    ///The component this pin belongs to: its `componentUid`, or the reference-only uid when no component has this reference.
    #[serde(rename = "componentUid")]
    pub component_uid: SemanticIndexComponentUid,
    ///Reference designator.
    pub reference: Refdes,
    ///Pin (pad) number as written, never empty.
    pub pin: SemanticIndexPinNumber,
    /**Added in a1 (ADR §6). The schematic pin's name (KiCad `pinfunction`) as
    the library symbol writes it, possibly empty or `~`; for stacked pins
    `<name>_<number>`. Absent on a terminal the netlist did not list with its
    pin record (board-only or graphical-pin-only terminals).*/
    #[serde(
        rename = "pinName",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub pin_name: ::std::option::Option<::std::string::String>,
    /**Added in a1 (ADR §6). The schematic pin's electrical type. Absent where
    `pinName` is.*/
    #[serde(
        rename = "pinType",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub pin_type: ::std::option::Option<SemanticIndexPinType>,
    ///`netUid` of the net named by `netName`; `null` on a board-only terminal whose pad has no net.
    #[serde(rename = "netUid")]
    pub net_uid: ::std::option::Option<SemanticIndexNetUid>,
    /**The terminal's net, pad-resolved: the board net of the terminal's pad when
    the pad has one; otherwise the schematic netlist's net (or the board net
    that absorbed it in the split-net reconciliation). `null` on a
    board-only terminal whose pad has no net.*/
    #[serde(rename = "netName")]
    pub net_name: ::std::option::Option<NetName>,
    /**Added in a1 (ADR §6). The name of the schematic netlist net that lists
    this terminal, before the board pass and the reconciliation rewrite
    `netName`. Absent on a board-only terminal.*/
    #[serde(
        rename = "schematicNetName",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub schematic_net_name: ::std::option::Option<NetName>,
    /**UUID of the placed symbol's pin (`(pin "<n>" (uuid …))`), or of the
    symbol when the pin has no drawable element. Absent on a board-only
    terminal.*/
    #[serde(
        rename = "schematicPinUuid",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub schematic_pin_uuid: ::std::option::Option<KiCadUuid>,
    ///UUID of the board pad with this reference and number. Absent when no pad matches.
    #[serde(
        rename = "pcbPadUuid",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub pcb_pad_uuid: ::std::option::Option<KiCadUuid>,
}
/**Terminal id: `term:` followed by the first 20 hex digits of the SHA-256 of
`<reference>\u001f<pin>` (UTF-8), `_stable_uid("term", reference, pin)`
(`semantic_index_service.py:995`, `:1092`).*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Terminal id: `term:` followed by the first 20 hex digits of the SHA-256 of\n`<reference>\\u001f<pin>` (UTF-8), `_stable_uid(\"term\", reference, pin)`\n(`semantic_index_service.py:995`, `:1092`).",
///  "type": "string"
///}
/// ```
/// </details>
#[derive(
    ::serde::Deserialize, ::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd,
)]
#[serde(transparent)]
pub struct SemanticIndexTerminalUid(pub ::std::string::String);
impl ::std::ops::Deref for SemanticIndexTerminalUid {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SemanticIndexTerminalUid> for ::std::string::String {
    fn from(value: SemanticIndexTerminalUid) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::string::String> for SemanticIndexTerminalUid {
    fn from(value: ::std::string::String) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for SemanticIndexTerminalUid {
    type Err = ::std::convert::Infallible;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.to_string()))
    }
}
impl ::std::fmt::Display for SemanticIndexTerminalUid {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
///`detail` of `unsupported-variant-token`.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "`detail` of `unsupported-variant-token`.",
///  "type": "object",
///  "required": [
///    "tokens"
///  ],
///  "properties": {
///    "tokens": {
///      "description": "The KiCad 11 tokens found, in first-seen order, without repeats.",
///      "type": "array",
///      "items": {
///        "type": "string"
///      },
///      "minItems": 1
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexTokensDetail {
    ///The KiCad 11 tokens found, in first-seen order, without repeats.
    pub tokens: ::std::vec::Vec<::std::string::String>,
}
///One design variant name and where it was found (contract packet v1.0 §2.1, §3.2).
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "One design variant name and where it was found (contract packet v1.0 §2.1, §3.2).",
///  "type": "object",
///  "required": [
///    "description",
///    "name",
///    "sources"
///  ],
///  "properties": {
///    "description": {
///      "description": "The project registry's description, else the board header's; `null` when neither has one.",
///      "oneOf": [
///        {
///          "type": "string"
///        },
///        {
///          "type": "null"
///        }
///      ]
///    },
///    "name": {
///      "description": "The variant name, exact (never empty, never `< Default >`).",
///      "type": "string",
///      "minLength": 1
///    },
///    "sources": {
///      "description": "Every source that names this variant, in the order they were met (project, pcb, schematic, footprint scans), without repeats.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/SemanticIndexVariantSource"
///      },
///      "minItems": 1
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexVariantCatalogEntry {
    ///The variant name, exact (never empty, never `< Default >`).
    pub name: SemanticIndexVariantCatalogEntryName,
    ///The project registry's description, else the board header's; `null` when neither has one.
    pub description: ::std::option::Option<::std::string::String>,
    ///Every source that names this variant, in the order they were met (project, pcb, schematic, footprint scans), without repeats.
    pub sources: ::std::vec::Vec<SemanticIndexVariantSource>,
}
///The variant name, exact (never empty, never `< Default >`).
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "The variant name, exact (never empty, never `< Default >`).",
///  "type": "string",
///  "minLength": 1
///}
/// ```
/// </details>
#[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct SemanticIndexVariantCatalogEntryName(::std::string::String);
impl ::std::ops::Deref for SemanticIndexVariantCatalogEntryName {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SemanticIndexVariantCatalogEntryName> for ::std::string::String {
    fn from(value: SemanticIndexVariantCatalogEntryName) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for SemanticIndexVariantCatalogEntryName {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for SemanticIndexVariantCatalogEntryName {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SemanticIndexVariantCatalogEntryName {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SemanticIndexVariantCatalogEntryName {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for SemanticIndexVariantCatalogEntryName {
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
///Source file kind that named a design variant (contract packet v1.0 §2.1).
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Source file kind that named a design variant (contract packet v1.0 §2.1).",
///  "type": "string",
///  "enum": [
///    "project",
///    "pcb",
///    "schematic",
///    "footprint"
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
pub enum SemanticIndexVariantSource {
    #[serde(rename = "project")]
    Project,
    #[serde(rename = "pcb")]
    Pcb,
    #[serde(rename = "schematic")]
    Schematic,
    #[serde(rename = "footprint")]
    Footprint,
}
impl ::std::fmt::Display for SemanticIndexVariantSource {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Project => f.write_str("project"),
            Self::Pcb => f.write_str("pcb"),
            Self::Schematic => f.write_str("schematic"),
            Self::Footprint => f.write_str("footprint"),
        }
    }
}
impl ::std::str::FromStr for SemanticIndexVariantSource {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "project" => Ok(Self::Project),
            "pcb" => Ok(Self::Pcb),
            "schematic" => Ok(Self::Schematic),
            "footprint" => Ok(Self::Footprint),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SemanticIndexVariantSource {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SemanticIndexVariantSource {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SemanticIndexVariantSource {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///`detail` of `legacy-in-bom-semantics`.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "`detail` of `legacy-in-bom-semantics`.",
///  "type": "object",
///  "required": [
///    "version"
///  ],
///  "properties": {
///    "version": {
///      "description": "The root schematic's `(version N)`, a KiCad file-format date such as 20260101.",
///      "type": "integer",
///      "maximum": 2147483647.0,
///      "minimum": -2147483648.0
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexVersionDetail {
    ///The root schematic's `(version N)`, a KiCad file-format date such as 20260101.
    pub version: i32,
}
/**Reserved for WebGPU scene references. No producer writes one: every
`webgpuRefs` array is empty today (`semantic_index_service.py:903`, `:951`,
`:1056`) and in a1.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Reserved for WebGPU scene references. No producer writes one: every\n`webgpuRefs` array is empty today (`semantic_index_service.py:903`, `:951`,\n`:1056`) and in a1.",
///  "type": "object",
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SemanticIndexWebGpuRef {}
impl ::std::default::Default for SemanticIndexWebGpuRef {
    fn default() -> Self {
        Self {}
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
impl<'de> ::serde::Deserialize<'de> for SemanticIndexBus {
    #[allow(
        clippy::too_many_lines,
        reason = "generated: one dispatch arm per union variant"
    )]
    fn deserialize<D: ::serde::Deserializer<'de>>(
        deserializer: D,
    ) -> ::std::result::Result<Self, D::Error> {
        let value = <::serde_json::Value as ::serde::Deserialize>::deserialize(deserializer)?;
        if value.get("kind").and_then(::serde_json::Value::as_str) == Some("bus") {
            return ::serde_json::from_value::<SemanticIndexBusWire>(value)
                .map(Self::Wire)
                .map_err(<D::Error as ::serde::de::Error>::custom);
        }
        if value.get("kind").and_then(::serde_json::Value::as_str) == Some("bus_entry") {
            return ::serde_json::from_value::<SemanticIndexBusEntry>(value)
                .map(Self::Entry)
                .map_err(<D::Error as ::serde::de::Error>::custom);
        }
        if value.get("kind").and_then(::serde_json::Value::as_str) == Some("bus_alias") {
            return ::serde_json::from_value::<SemanticIndexBusAlias>(value)
                .map(Self::Alias)
                .map_err(<D::Error as ::serde::de::Error>::custom);
        }
        Err(<D::Error as ::serde::de::Error>::custom(
            "data did not match any variant of untagged enum SemanticIndexBus",
        ))
    }
}
impl<'de> ::serde::Deserialize<'de> for SemanticIndexDiagnosticDetail {
    #[allow(
        clippy::too_many_lines,
        reason = "generated: one dispatch arm per union variant"
    )]
    fn deserialize<D: ::serde::Deserializer<'de>>(
        deserializer: D,
    ) -> ::std::result::Result<Self, D::Error> {
        let value = <::serde_json::Value as ::serde::Deserialize>::deserialize(deserializer)?;
        if let Ok(inner) = ::serde_json::from_value::<SemanticIndexVersionDetail>(value.clone()) {
            return Ok(Self::SemanticIndexVersionDetail(inner));
        }
        if let Ok(inner) = ::serde_json::from_value::<SemanticIndexTokensDetail>(value.clone()) {
            return Ok(Self::SemanticIndexTokensDetail(inner));
        }
        if let Ok(inner) =
            ::serde_json::from_value::<SemanticIndexOccurrenceIdsDetail>(value.clone())
        {
            return Ok(Self::SemanticIndexOccurrenceIdsDetail(inner));
        }
        if let Ok(inner) =
            ::serde_json::from_value::<SemanticIndexComponentUidsDetail>(value.clone())
        {
            return Ok(Self::SemanticIndexComponentUidsDetail(inner));
        }
        if let Ok(inner) = ::serde_json::from_value::<RecordString>(value.clone()) {
            return Ok(Self::RecordString(inner));
        }
        if let Ok(inner) = ::serde_json::from_value::<RecordBoolean>(value.clone()) {
            return Ok(Self::RecordBoolean(inner));
        }
        if let Ok(inner) = ::serde_json::from_value::<
            ::std::collections::BTreeMap<
                ::std::string::String,
                ::std::collections::BTreeMap<
                    ::std::string::String,
                    SemanticIndexDiagnosticDetailObjectValueValue,
                >,
            >,
        >(value.clone())
        {
            return Ok(Self::Object(inner));
        }
        Err(<D::Error as ::serde::de::Error>::custom(
            "data did not match any variant of untagged enum SemanticIndexDiagnosticDetail",
        ))
    }
}
impl<'de> ::serde::Deserialize<'de> for SemanticIndexDiagnosticDetailObjectValueValue {
    #[allow(
        clippy::too_many_lines,
        reason = "generated: one dispatch arm per union variant"
    )]
    fn deserialize<D: ::serde::Deserializer<'de>>(
        deserializer: D,
    ) -> ::std::result::Result<Self, D::Error> {
        let value = <::serde_json::Value as ::serde::Deserialize>::deserialize(deserializer)?;
        if let Ok(inner) = ::serde_json::from_value::<bool>(value.clone()) {
            return Ok(Self::Boolean(inner));
        }
        if let Ok(inner) = ::serde_json::from_value::<::std::string::String>(value.clone()) {
            return Ok(Self::String(inner));
        }
        Err(<D::Error as ::serde::de::Error>::custom(
            "data did not match any variant of untagged enum SemanticIndexDiagnosticDetailObjectValueValue",
        ))
    }
}
