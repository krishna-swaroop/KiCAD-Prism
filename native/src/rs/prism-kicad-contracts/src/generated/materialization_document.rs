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
/**One fully composed local-to-board transform. A shape's local coordinates
map to board coordinates as x' = m11*x + m12*y + tx_nm and
y' = m21*x + m22*y + ty_nm. Reflection, rotation, and non-uniform scale are
ordinary cases of the same matrix.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "One fully composed local-to-board transform. A shape's local coordinates\nmap to board coordinates as x' = m11*x + m12*y + tx_nm and\ny' = m21*x + m22*y + ty_nm. Reflection, rotation, and non-uniform scale are\nordinary cases of the same matrix.",
///  "type": "object",
///  "required": [
///    "m11",
///    "m12",
///    "m21",
///    "m22",
///    "tx_nm",
///    "ty_nm"
///  ],
///  "properties": {
///    "m11": {
///      "type": "number"
///    },
///    "m12": {
///      "type": "number"
///    },
///    "m21": {
///      "type": "number"
///    },
///    "m22": {
///      "type": "number"
///    },
///    "tx_nm": {
///      "$ref": "#/$defs/Nm"
///    },
///    "ty_nm": {
///      "$ref": "#/$defs/Nm"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Affine2D {
    pub m11: f64,
    pub m12: f64,
    pub m21: f64,
    pub m22: f64,
    pub tx_nm: Nm,
    pub ty_nm: Nm,
}
///`Annulus2d`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "object",
///  "required": [
///    "center_nm",
///    "inner_radius_nm",
///    "kind",
///    "outer_radius_nm"
///  ],
///  "properties": {
///    "center_nm": {
///      "$ref": "#/$defs/NmPoint"
///    },
///    "inner_radius_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "kind": {
///      "type": "string",
///      "const": "annulus_2d"
///    },
///    "outer_radius_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Annulus2d {
    pub center_nm: NmPoint,
    pub inner_radius_nm: NonNegativeNm,
    #[serde(deserialize_with = "crate::materialization_contract::deserialize_annulus_2d_kind")]
    pub kind: ::std::string::String,
    pub outer_radius_nm: NonNegativeNm,
}
///Circular arc segment through `mid_nm` to `end_nm`, the form KiCad stores.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Circular arc segment through `mid_nm` to `end_nm`, the form KiCad stores.",
///  "type": "object",
///  "required": [
///    "end_nm",
///    "kind",
///    "mid_nm"
///  ],
///  "properties": {
///    "end_nm": {
///      "$ref": "#/$defs/NmPoint"
///    },
///    "kind": {
///      "type": "string",
///      "const": "arc"
///    },
///    "mid_nm": {
///      "$ref": "#/$defs/NmPoint"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ArcSegment {
    pub end_nm: NmPoint,
    #[serde(deserialize_with = "crate::materialization_contract::deserialize_arc_segment_kind")]
    pub kind: ::std::string::String,
    pub mid_nm: NmPoint,
}
///Controlled-depth removal of barrel plating from one side.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Controlled-depth removal of barrel plating from one side.",
///  "type": "object",
///  "required": [
///    "side"
///  ],
///  "properties": {
///    "diameter_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "side": {
///      "$ref": "#/$defs/BoardSide"
///    },
///    "until_slice_key": {
///      "type": "string"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Backdrill {
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub diameter_nm: ::std::option::Option<NonNegativeNm>,
    pub side: BoardSide,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub until_slice_key: ::std::option::Option<::std::string::String>,
}
///Fold line of a flexible region, for 3D views; flat analyses ignore it.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Fold line of a flexible region, for 3D views; flat analyses ignore it.",
///  "type": "object",
///  "required": [
///    "angle_deg",
///    "end_nm",
///    "radius_nm",
///    "start_nm"
///  ],
///  "properties": {
///    "angle_deg": {
///      "type": "number"
///    },
///    "end_nm": {
///      "$ref": "#/$defs/NmPoint"
///    },
///    "radius_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "start_nm": {
///      "$ref": "#/$defs/NmPoint"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct BendLine {
    pub angle_deg: f64,
    pub end_nm: NmPoint,
    pub radius_nm: NonNegativeNm,
    pub start_nm: NmPoint,
}
/**Links one operation to the KiCad object that produced it. Required for
simulation and picking; geometry consumers may ignore it.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Links one operation to the KiCad object that produced it. Required for\nsimulation and picking; geometry consumers may ignore it.",
///  "type": "object",
///  "required": [
///    "operation_index",
///    "source_kind",
///    "source_uid"
///  ],
///  "properties": {
///    "die_delay_ps": {
///      "description": "Pad-to-die delay of the pad's pin, in picoseconds.",
///      "type": "number"
///    },
///    "die_length_nm": {
///      "description": "Pad-to-die length of the pad's pin.",
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "net_key": {
///      "type": "string"
///    },
///    "operation_index": {
///      "type": "integer",
///      "maximum": 4294967295.0,
///      "minimum": 0.0
///    },
///    "pad_number": {
///      "type": "string"
///    },
///    "refdes": {
///      "type": "string"
///    },
///    "source_kind": {
///      "$ref": "#/$defs/BindingSourceKind"
///    },
///    "source_uid": {
///      "type": "string"
///    },
///    "tied_net_keys": {
///      "description": "Nets a net-tie bridge joins: the nets of the net-tie pads its copper\ntouches. The nets stay separate; consumers decide whether to join them.",
///      "type": "array",
///      "items": {
///        "type": "string"
///      }
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct BindingEntry {
    ///Pad-to-die delay of the pad's pin, in picoseconds.
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub die_delay_ps: ::std::option::Option<f64>,
    ///Pad-to-die length of the pad's pin.
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub die_length_nm: ::std::option::Option<NonNegativeNm>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub net_key: ::std::option::Option<::std::string::String>,
    pub operation_index: u32,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub pad_number: ::std::option::Option<::std::string::String>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub refdes: ::std::option::Option<::std::string::String>,
    pub source_kind: BindingSourceKind,
    pub source_uid: ::std::string::String,
    /**Nets a net-tie bridge joins: the nets of the net-tie pads its copper
    touches. The nets stay separate; consumers decide whether to join them.*/
    #[serde(default, skip_serializing_if = "::std::vec::Vec::is_empty")]
    pub tied_net_keys: ::std::vec::Vec<::std::string::String>,
}
///`BindingSourceKind`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "string",
///  "enum": [
///    "track",
///    "track_arc",
///    "via",
///    "pad",
///    "zone_fill",
///    "board_graphic",
///    "footprint_graphic",
///    "board_text",
///    "footprint_text",
///    "profile",
///    "derived"
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
pub enum BindingSourceKind {
    #[serde(rename = "track")]
    Track,
    #[serde(rename = "track_arc")]
    TrackArc,
    #[serde(rename = "via")]
    Via,
    #[serde(rename = "pad")]
    Pad,
    #[serde(rename = "zone_fill")]
    ZoneFill,
    #[serde(rename = "board_graphic")]
    BoardGraphic,
    #[serde(rename = "footprint_graphic")]
    FootprintGraphic,
    #[serde(rename = "board_text")]
    BoardText,
    #[serde(rename = "footprint_text")]
    FootprintText,
    #[serde(rename = "profile")]
    Profile,
    #[serde(rename = "derived")]
    Derived,
}
impl ::std::fmt::Display for BindingSourceKind {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Track => f.write_str("track"),
            Self::TrackArc => f.write_str("track_arc"),
            Self::Via => f.write_str("via"),
            Self::Pad => f.write_str("pad"),
            Self::ZoneFill => f.write_str("zone_fill"),
            Self::BoardGraphic => f.write_str("board_graphic"),
            Self::FootprintGraphic => f.write_str("footprint_graphic"),
            Self::BoardText => f.write_str("board_text"),
            Self::FootprintText => f.write_str("footprint_text"),
            Self::Profile => f.write_str("profile"),
            Self::Derived => f.write_str("derived"),
        }
    }
}
impl ::std::str::FromStr for BindingSourceKind {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "track" => Ok(Self::Track),
            "track_arc" => Ok(Self::TrackArc),
            "via" => Ok(Self::Via),
            "pad" => Ok(Self::Pad),
            "zone_fill" => Ok(Self::ZoneFill),
            "board_graphic" => Ok(Self::BoardGraphic),
            "footprint_graphic" => Ok(Self::FootprintGraphic),
            "board_text" => Ok(Self::BoardText),
            "footprint_text" => Ok(Self::FootprintText),
            "profile" => Ok(Self::Profile),
            "derived" => Ok(Self::Derived),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for BindingSourceKind {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for BindingSourceKind {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for BindingSourceKind {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///`BoardSide`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "string",
///  "enum": [
///    "front",
///    "back"
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
pub enum BoardSide {
    #[serde(rename = "front")]
    Front,
    #[serde(rename = "back")]
    Back,
}
impl ::std::fmt::Display for BoardSide {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Front => f.write_str("front"),
            Self::Back => f.write_str("back"),
        }
    }
}
impl ::std::str::FromStr for BoardSide {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "front" => Ok(Self::Front),
            "back" => Ok(Self::Back),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for BoardSide {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for BoardSide {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for BoardSide {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///Stadium between two centres with a common radius.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Stadium between two centres with a common radius.",
///  "type": "object",
///  "required": [
///    "end_nm",
///    "kind",
///    "radius_nm",
///    "start_nm"
///  ],
///  "properties": {
///    "end_nm": {
///      "$ref": "#/$defs/NmPoint"
///    },
///    "kind": {
///      "type": "string",
///      "const": "capsule_2d"
///    },
///    "radius_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "start_nm": {
///      "$ref": "#/$defs/NmPoint"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Capsule2d {
    pub end_nm: NmPoint,
    #[serde(deserialize_with = "crate::materialization_contract::deserialize_capsule_2d_kind")]
    pub kind: ::std::string::String,
    pub radius_nm: NonNegativeNm,
    pub start_nm: NmPoint,
}
///Rectangle with the listed corners chamfered; unlisted corners keep `radius_nm`.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Rectangle with the listed corners chamfered; unlisted corners keep `radius_nm`.",
///  "type": "object",
///  "required": [
///    "center_nm",
///    "chamfer_nm",
///    "chamfered_corners",
///    "height_nm",
///    "kind",
///    "radius_nm",
///    "width_nm"
///  ],
///  "properties": {
///    "center_nm": {
///      "$ref": "#/$defs/NmPoint"
///    },
///    "chamfer_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "chamfered_corners": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/RectCorner"
///      }
///    },
///    "height_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "kind": {
///      "type": "string",
///      "const": "chamfered_rect_2d"
///    },
///    "radius_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "width_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ChamferedRect2d {
    pub center_nm: NmPoint,
    pub chamfer_nm: NonNegativeNm,
    pub chamfered_corners: ::std::vec::Vec<RectCorner>,
    pub height_nm: NonNegativeNm,
    #[serde(
        deserialize_with = "crate::materialization_contract::deserialize_chamfered_rect_2d_kind"
    )]
    pub kind: ::std::string::String,
    pub radius_nm: NonNegativeNm,
    pub width_nm: NonNegativeNm,
}
/**Operations of one (slice, tile) occupy a contiguous index range. An
operation belongs to the tile containing the centre of its bounds (floor
division by `tile_size_nm`); the chunk bounds cover every operation in it.
Chunks are non-empty, start at operation 0, follow each other without
gaps, and are ordered by slice order, tile row, then tile column.
`net_keys` are the distinct nets of the chunk's operations, sorted.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Operations of one (slice, tile) occupy a contiguous index range. An\noperation belongs to the tile containing the centre of its bounds (floor\ndivision by `tile_size_nm`); the chunk bounds cover every operation in it.\nChunks are non-empty, start at operation 0, follow each other without\ngaps, and are ordered by slice order, tile row, then tile column.\n`net_keys` are the distinct nets of the chunk's operations, sorted.",
///  "type": "object",
///  "required": [
///    "bounds",
///    "first_operation_index",
///    "net_keys",
///    "operation_count",
///    "slice_key",
///    "tile_x",
///    "tile_y"
///  ],
///  "properties": {
///    "bounds": {
///      "$ref": "#/$defs/NmBounds"
///    },
///    "first_operation_index": {
///      "type": "integer",
///      "maximum": 4294967295.0,
///      "minimum": 0.0
///    },
///    "net_keys": {
///      "type": "array",
///      "items": {
///        "type": "string"
///      }
///    },
///    "operation_count": {
///      "type": "integer",
///      "maximum": 4294967295.0,
///      "minimum": 0.0
///    },
///    "slice_key": {
///      "type": "string"
///    },
///    "tile_x": {
///      "type": "integer",
///      "maximum": 2147483647.0,
///      "minimum": -2147483648.0
///    },
///    "tile_y": {
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
pub struct ChunkEntry {
    pub bounds: NmBounds,
    pub first_operation_index: u32,
    pub net_keys: ::std::vec::Vec<::std::string::String>,
    pub operation_count: u32,
    pub slice_key: ::std::string::String,
    pub tile_x: i32,
    pub tile_y: i32,
}
///`Component`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "object",
///  "required": [
///    "affine",
///    "footprint",
///    "jumper_groups",
///    "net_tie_groups",
///    "refdes",
///    "side",
///    "source_uid"
///  ],
///  "properties": {
///    "affine": {
///      "$ref": "#/$defs/Affine2D"
///    },
///    "body_bounds": {
///      "description": "Body extent in footprint-local coordinates, from courtyard or fabrication outline.",
///      "$ref": "#/$defs/NmBounds"
///    },
///    "body_height_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "footprint": {
///      "type": "string"
///    },
///    "jumper_groups": {
///      "description": "Jumper pad groups, connected inside the part without board copper.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/PadGroup"
///      }
///    },
///    "net_tie_groups": {
///      "description": "Net-tie pad groups: copper in the footprint may join these pads' nets.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/PadGroup"
///      }
///    },
///    "refdes": {
///      "type": "string"
///    },
///    "side": {
///      "$ref": "#/$defs/BoardSide"
///    },
///    "source_uid": {
///      "type": "string"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Component {
    pub affine: Affine2D,
    ///Body extent in footprint-local coordinates, from courtyard or fabrication outline.
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub body_bounds: ::std::option::Option<NmBounds>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub body_height_nm: ::std::option::Option<NonNegativeNm>,
    pub footprint: ::std::string::String,
    ///Jumper pad groups, connected inside the part without board copper.
    pub jumper_groups: ::std::vec::Vec<PadGroup>,
    ///Net-tie pad groups: copper in the footprint may join these pads' nets.
    pub net_tie_groups: ::std::vec::Vec<PadGroup>,
    pub refdes: ::std::string::String,
    pub side: BoardSide,
    pub source_uid: ::std::string::String,
}
/**Closed contour of line, arc, and cubic segments starting at `start_nm`.
When the last segment does not end at `start_nm`, a straight closing
segment back to it is implied.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Closed contour of line, arc, and cubic segments starting at `start_nm`.\nWhen the last segment does not end at `start_nm`, a straight closing\nsegment back to it is implied.",
///  "type": "object",
///  "required": [
///    "segments",
///    "start_nm"
///  ],
///  "properties": {
///    "segments": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/PathSegment"
///      },
///      "minItems": 1
///    },
///    "start_nm": {
///      "$ref": "#/$defs/NmPoint"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Contour {
    pub segments: ::std::vec::Vec<PathSegment>,
    pub start_nm: NmPoint,
}
///Corner smoothing KiCad applies to a zone's fill (`smoothing`).
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Corner smoothing KiCad applies to a zone's fill (`smoothing`).",
///  "type": "string",
///  "enum": [
///    "chamfer",
///    "fillet"
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
pub enum CornerSmoothing {
    #[serde(rename = "chamfer")]
    Chamfer,
    #[serde(rename = "fillet")]
    Fillet,
}
impl ::std::fmt::Display for CornerSmoothing {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Chamfer => f.write_str("chamfer"),
            Self::Fillet => f.write_str("fillet"),
        }
    }
}
impl ::std::str::FromStr for CornerSmoothing {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "chamfer" => Ok(Self::Chamfer),
            "fillet" => Ok(Self::Fillet),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CornerSmoothing {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for CornerSmoothing {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CornerSmoothing {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
/**A component's courtyard on one side, closed as KiCad closes it, in the
board frame: the graphics on `F.CrtYd` (front) or `B.CrtYd` (back),
chained end to end within 0.01 mm.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A component's courtyard on one side, closed as KiCad closes it, in the\nboard frame: the graphics on `F.CrtYd` (front) or `B.CrtYd` (back),\nchained end to end within 0.01 mm.",
///  "type": "object",
///  "required": [
///    "regions",
///    "side",
///    "source_uid"
///  ],
///  "properties": {
///    "regions": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/PlanarRegion2d"
///      },
///      "minItems": 1
///    },
///    "side": {
///      "$ref": "#/$defs/BoardSide"
///    },
///    "source_uid": {
///      "description": "The component's `source_uid`.",
///      "type": "string"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Courtyard {
    pub regions: ::std::vec::Vec<PlanarRegion2d>,
    pub side: BoardSide,
    ///The component's `source_uid`.
    pub source_uid: ::std::string::String,
}
/**Cubic Bézier segment from the previous point through two control points
to `end_nm`, the form KiCad stores for curves.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Cubic Bézier segment from the previous point through two control points\nto `end_nm`, the form KiCad stores for curves.",
///  "type": "object",
///  "required": [
///    "control1_nm",
///    "control2_nm",
///    "end_nm",
///    "kind"
///  ],
///  "properties": {
///    "control1_nm": {
///      "$ref": "#/$defs/NmPoint"
///    },
///    "control2_nm": {
///      "$ref": "#/$defs/NmPoint"
///    },
///    "end_nm": {
///      "$ref": "#/$defs/NmPoint"
///    },
///    "kind": {
///      "type": "string",
///      "const": "cubic"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CubicSegment {
    pub control1_nm: NmPoint,
    pub control2_nm: NmPoint,
    pub end_nm: NmPoint,
    #[serde(deserialize_with = "crate::materialization_contract::deserialize_cubic_segment_kind")]
    pub kind: ::std::string::String,
}
/**Design rules and regions that are not material: they draw nothing and
are not operations. Board facts like `nets`: every document of a board
holds all of them whatever its scope. Arrays are in file order.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Design rules and regions that are not material: they draw nothing and\nare not operations. Board facts like `nets`: every document of a board\nholds all of them whatever its scope. Arrays are in file order.",
///  "type": "object",
///  "required": [
///    "courtyards",
///    "footprint_rules",
///    "pad_rules",
///    "zones"
///  ],
///  "properties": {
///    "copper_edge_clearance_nm": {
///      "description": "Minimum copper-to-board-edge clearance (`min_copper_edge_clearance`) from the project file.",
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "courtyards": {
///      "description": "By component in file order, front before back.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/Courtyard"
///      }
///    },
///    "footprint_rules": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/FootprintRules"
///      }
///    },
///    "max_error_nm": {
///      "description": "KiCad's arc-approximation error (`max_error`) from the project file.",
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "pad_rules": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/PadRules"
///      }
///    },
///    "zones": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/ZoneFacts"
///      }
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct DesignFacts {
    ///Minimum copper-to-board-edge clearance (`min_copper_edge_clearance`) from the project file.
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub copper_edge_clearance_nm: ::std::option::Option<NonNegativeNm>,
    ///By component in file order, front before back.
    pub courtyards: ::std::vec::Vec<Courtyard>,
    pub footprint_rules: ::std::vec::Vec<FootprintRules>,
    ///KiCad's arc-approximation error (`max_error`) from the project file.
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub max_error_nm: ::std::option::Option<NonNegativeNm>,
    pub pad_rules: ::std::vec::Vec<PadRules>,
    pub zones: ::std::vec::Vec<ZoneFacts>,
}
///`DiagnosticSeverity`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
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
pub enum DiagnosticSeverity {
    #[serde(rename = "info")]
    Info,
    #[serde(rename = "warning")]
    Warning,
    #[serde(rename = "error")]
    Error,
}
impl ::std::fmt::Display for DiagnosticSeverity {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Info => f.write_str("info"),
            Self::Warning => f.write_str("warning"),
            Self::Error => f.write_str("error"),
        }
    }
}
impl ::std::str::FromStr for DiagnosticSeverity {
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
impl ::std::convert::TryFrom<&str> for DiagnosticSeverity {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for DiagnosticSeverity {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for DiagnosticSeverity {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
/**How a dielectric slice is built: a cured `core` laminate or a `prepreg`
bonding ply (KiCad's stackup layer `type`).*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "How a dielectric slice is built: a cured `core` laminate or a `prepreg`\nbonding ply (KiCad's stackup layer `type`).",
///  "type": "string",
///  "enum": [
///    "core",
///    "prepreg"
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
pub enum DielectricKind {
    #[serde(rename = "core")]
    Core,
    #[serde(rename = "prepreg")]
    Prepreg,
}
impl ::std::fmt::Display for DielectricKind {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Core => f.write_str("core"),
            Self::Prepreg => f.write_str("prepreg"),
        }
    }
}
impl ::std::str::FromStr for DielectricKind {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "core" => Ok(Self::Core),
            "prepreg" => Ok(Self::Prepreg),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for DielectricKind {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for DielectricKind {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for DielectricKind {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
/**Two nets paired by KiCad's suffix rule: after any trailing digits and
underscores, `+` or `P` marks the positive net and `-` or `N` the
negative one, and both nets exist.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Two nets paired by KiCad's suffix rule: after any trailing digits and\nunderscores, `+` or `P` marks the positive net and `-` or `N` the\nnegative one, and both nets exist.",
///  "type": "object",
///  "required": [
///    "base_name",
///    "negative_net_key",
///    "positive_net_key"
///  ],
///  "properties": {
///    "base_name": {
///      "type": "string"
///    },
///    "negative_net_key": {
///      "type": "string"
///    },
///    "positive_net_key": {
///      "type": "string"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct DiffPair {
    pub base_name: ::std::string::String,
    pub negative_net_key: ::std::string::String,
    pub positive_net_key: ::std::string::String,
}
///`Disk2d`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "object",
///  "required": [
///    "center_nm",
///    "kind",
///    "radius_nm"
///  ],
///  "properties": {
///    "center_nm": {
///      "$ref": "#/$defs/NmPoint"
///    },
///    "kind": {
///      "type": "string",
///      "const": "disk_2d"
///    },
///    "radius_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Disk2d {
    pub center_nm: NmPoint,
    #[serde(deserialize_with = "crate::materialization_contract::deserialize_disk_2d_kind")]
    pub kind: ::std::string::String,
    pub radius_nm: NonNegativeNm,
}
/**A footprint's zone rules for its pads, keyed by the component's
`source_uid`. Present only for values it sets; a footprint that sets
nothing has no record.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A footprint's zone rules for its pads, keyed by the component's\n`source_uid`. Present only for values it sets; a footprint that sets\nnothing has no record.",
///  "type": "object",
///  "required": [
///    "source_uid"
///  ],
///  "properties": {
///    "clearance_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "pad_connection": {
///      "$ref": "#/$defs/PadConnection"
///    },
///    "source_uid": {
///      "type": "string"
///    },
///    "thermal_gap_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "thermal_spoke_width_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct FootprintRules {
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub clearance_nm: ::std::option::Option<NonNegativeNm>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub pad_connection: ::std::option::Option<PadConnection>,
    pub source_uid: ::std::string::String,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub thermal_gap_nm: ::std::option::Option<NonNegativeNm>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub thermal_spoke_width_nm: ::std::option::Option<NonNegativeNm>,
}
/**Drilled or milled hole spanning the conductor slices `start_slice_key` to
`end_slice_key` inclusive, in either order.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Drilled or milled hole spanning the conductor slices `start_slice_key` to\n`end_slice_key` inclusive, in either order.",
///  "type": "object",
///  "required": [
///    "affine",
///    "backdrills",
///    "bounds",
///    "end_slice_key",
///    "index",
///    "kind",
///    "plating",
///    "post_machining",
///    "shape",
///    "start_slice_key"
///  ],
///  "properties": {
///    "affine": {
///      "$ref": "#/$defs/Affine2D"
///    },
///    "backdrills": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/Backdrill"
///      }
///    },
///    "bounds": {
///      "$ref": "#/$defs/NmBounds"
///    },
///    "castellated": {
///      "description": "The hole belongs to a castellated pad, cut by the board edge in fabrication.",
///      "type": "boolean"
///    },
///    "end_slice_key": {
///      "type": "string"
///    },
///    "index": {
///      "type": "integer",
///      "maximum": 4294967295.0,
///      "minimum": 0.0
///    },
///    "kind": {
///      "type": "string",
///      "const": "hole"
///    },
///    "net_key": {
///      "type": "string"
///    },
///    "plating": {
///      "$ref": "#/$defs/HolePlating"
///    },
///    "plating_thickness_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "post_machining": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/PostMachining"
///      }
///    },
///    "protection": {
///      "$ref": "#/$defs/HoleProtection"
///    },
///    "shape": {
///      "$ref": "#/$defs/Shape2d"
///    },
///    "start_slice_key": {
///      "type": "string"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct HoleOperation {
    pub affine: Affine2D,
    pub backdrills: ::std::vec::Vec<Backdrill>,
    pub bounds: NmBounds,
    ///The hole belongs to a castellated pad, cut by the board edge in fabrication.
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub castellated: ::std::option::Option<bool>,
    pub end_slice_key: ::std::string::String,
    pub index: u32,
    #[serde(deserialize_with = "crate::materialization_contract::deserialize_hole_operation_kind")]
    pub kind: ::std::string::String,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub net_key: ::std::option::Option<::std::string::String>,
    pub plating: HolePlating,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub plating_thickness_nm: ::std::option::Option<NonNegativeNm>,
    pub post_machining: ::std::vec::Vec<PostMachining>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub protection: ::std::option::Option<HoleProtection>,
    pub shape: Shape2d,
    pub start_slice_key: ::std::string::String,
}
///`HolePlating`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "string",
///  "enum": [
///    "plated",
///    "unplated"
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
pub enum HolePlating {
    #[serde(rename = "plated")]
    Plated,
    #[serde(rename = "unplated")]
    Unplated,
}
impl ::std::fmt::Display for HolePlating {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Plated => f.write_str("plated"),
            Self::Unplated => f.write_str("unplated"),
        }
    }
}
impl ::std::str::FromStr for HolePlating {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "plated" => Ok(Self::Plated),
            "unplated" => Ok(Self::Unplated),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for HolePlating {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for HolePlating {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for HolePlating {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///`HoleProtection`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "object",
///  "required": [
///    "back",
///    "capped",
///    "filled",
///    "front"
///  ],
///  "properties": {
///    "back": {
///      "$ref": "#/$defs/SideProtection"
///    },
///    "capped": {
///      "$ref": "#/$defs/ProtectionState"
///    },
///    "filled": {
///      "$ref": "#/$defs/ProtectionState"
///    },
///    "front": {
///      "$ref": "#/$defs/SideProtection"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct HoleProtection {
    pub back: SideProtection,
    pub capped: ProtectionState,
    pub filled: ProtectionState,
    pub front: SideProtection,
}
/**KiCad's island removal (`island_removal_mode`): 0 `always`, 1 `never`,
2 `below_area` (islands smaller than `island_min_area_mm2`). Without the
token KiCad removes every island.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "KiCad's island removal (`island_removal_mode`): 0 `always`, 1 `never`,\n2 `below_area` (islands smaller than `island_min_area_mm2`). Without the\ntoken KiCad removes every island.",
///  "type": "string",
///  "enum": [
///    "always",
///    "never",
///    "below_area"
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
pub enum IslandRemoval {
    #[serde(rename = "always")]
    Always,
    #[serde(rename = "never")]
    Never,
    #[serde(rename = "below_area")]
    BelowArea,
}
impl ::std::fmt::Display for IslandRemoval {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Always => f.write_str("always"),
            Self::Never => f.write_str("never"),
            Self::BelowArea => f.write_str("below_area"),
        }
    }
}
impl ::std::str::FromStr for IslandRemoval {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "always" => Ok(Self::Always),
            "never" => Ok(Self::Never),
            "below_area" => Ok(Self::BelowArea),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for IslandRemoval {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for IslandRemoval {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for IslandRemoval {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///Straight path segment to `end_nm`.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Straight path segment to `end_nm`.",
///  "type": "object",
///  "required": [
///    "end_nm",
///    "kind"
///  ],
///  "properties": {
///    "end_nm": {
///      "$ref": "#/$defs/NmPoint"
///    },
///    "kind": {
///      "type": "string",
///      "const": "line"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct LineSegment {
    pub end_nm: NmPoint,
    #[serde(deserialize_with = "crate::materialization_contract::deserialize_line_segment_kind")]
    pub kind: ::std::string::String,
}
///`MaterialAction`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "string",
///  "enum": [
///    "add",
///    "subtract"
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
pub enum MaterialAction {
    #[serde(rename = "add")]
    Add,
    #[serde(rename = "subtract")]
    Subtract,
}
impl ::std::fmt::Display for MaterialAction {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Add => f.write_str("add"),
            Self::Subtract => f.write_str("subtract"),
        }
    }
}
impl ::std::str::FromStr for MaterialAction {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "add" => Ok(Self::Add),
            "subtract" => Ok(Self::Subtract),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for MaterialAction {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for MaterialAction {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for MaterialAction {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///`MaterialOperation`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "oneOf": [
///    {
///      "$ref": "#/$defs/SurfaceOperation"
///    },
///    {
///      "$ref": "#/$defs/HoleOperation"
///    }
///  ]
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum MaterialOperation {
    SurfaceOperation(SurfaceOperation),
    HoleOperation(HoleOperation),
}
impl ::std::convert::From<SurfaceOperation> for MaterialOperation {
    fn from(value: SurfaceOperation) -> Self {
        Self::SurfaceOperation(value)
    }
}
impl ::std::convert::From<HoleOperation> for MaterialOperation {
    fn from(value: HoleOperation) -> Self {
        Self::HoleOperation(value)
    }
}
/**Selectable products. Every operation belongs to exactly one product. The
board profile has no product of its own: it is the add operation of every
dielectric and solder-mask slice, with cutouts subtracted there.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Selectable products. Every operation belongs to exactly one product. The\nboard profile has no product of its own: it is the add operation of every\ndielectric and solder-mask slice, with cutouts subtracted there.",
///  "type": "string",
///  "enum": [
///    "copper",
///    "holes",
///    "dielectric",
///    "solder_mask",
///    "paste",
///    "silkscreen",
///    "components"
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
pub enum MaterialProduct {
    #[serde(rename = "copper")]
    Copper,
    #[serde(rename = "holes")]
    Holes,
    #[serde(rename = "dielectric")]
    Dielectric,
    #[serde(rename = "solder_mask")]
    SolderMask,
    #[serde(rename = "paste")]
    Paste,
    #[serde(rename = "silkscreen")]
    Silkscreen,
    #[serde(rename = "components")]
    Components,
}
impl ::std::fmt::Display for MaterialProduct {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Copper => f.write_str("copper"),
            Self::Holes => f.write_str("holes"),
            Self::Dielectric => f.write_str("dielectric"),
            Self::SolderMask => f.write_str("solder_mask"),
            Self::Paste => f.write_str("paste"),
            Self::Silkscreen => f.write_str("silkscreen"),
            Self::Components => f.write_str("components"),
        }
    }
}
impl ::std::str::FromStr for MaterialProduct {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "copper" => Ok(Self::Copper),
            "holes" => Ok(Self::Holes),
            "dielectric" => Ok(Self::Dielectric),
            "solder_mask" => Ok(Self::SolderMask),
            "paste" => Ok(Self::Paste),
            "silkscreen" => Ok(Self::Silkscreen),
            "components" => Ok(Self::Components),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for MaterialProduct {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for MaterialProduct {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for MaterialProduct {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///`MaterializationCoordinateSystem`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "object",
///  "required": [
///    "unit",
///    "x_axis",
///    "y_axis"
///  ],
///  "properties": {
///    "unit": {
///      "type": "string",
///      "const": "nm"
///    },
///    "x_axis": {
///      "type": "string",
///      "const": "board_right"
///    },
///    "y_axis": {
///      "type": "string",
///      "const": "board_down"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct MaterializationCoordinateSystem {
    pub unit: ::std::string::String,
    pub x_axis: ::std::string::String,
    pub y_axis: ::std::string::String,
}
///A finding of the producer. `product` scopes it so selective results filter it like operations.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A finding of the producer. `product` scopes it so selective results filter it like operations.",
///  "type": "object",
///  "required": [
///    "code",
///    "message",
///    "severity"
///  ],
///  "properties": {
///    "code": {
///      "type": "string"
///    },
///    "message": {
///      "type": "string"
///    },
///    "product": {
///      "$ref": "#/$defs/MaterialProduct"
///    },
///    "severity": {
///      "$ref": "#/$defs/DiagnosticSeverity"
///    },
///    "source_uid": {
///      "type": "string"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct MaterializationDiagnostic {
    pub code: ::std::string::String,
    pub message: ::std::string::String,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub product: ::std::option::Option<MaterialProduct>,
    pub severity: DiagnosticSeverity,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub source_uid: ::std::option::Option<::std::string::String>,
}
/**Analytic materialization a1: a0 plus `design_facts`. The material is
unchanged; a1 adds facts in the header only. An a1 reader also reads a0
documents, which have no `design_facts`.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "$id": "urn:wavenumber:schema:kicad_monkey.materialization.document:a1",
///  "title": "Materialization document a1",
///  "description": "Analytic materialization a1: a0 plus `design_facts`. The material is\nunchanged; a1 adds facts in the header only. An a1 reader also reads a0\ndocuments, which have no `design_facts`.",
///  "type": "object",
///  "required": [
///    "binding",
///    "chunks",
///    "components",
///    "coordinate_system",
///    "diagnostics",
///    "diff_pairs",
///    "net_classes",
///    "nets",
///    "operations",
///    "producer",
///    "schema",
///    "scope",
///    "source",
///    "stack",
///    "type",
///    "version"
///  ],
///  "properties": {
///    "binding": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/BindingEntry"
///      }
///    },
///    "chunks": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/ChunkEntry"
///      }
///    },
///    "components": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/Component"
///      }
///    },
///    "coordinate_system": {
///      "$ref": "#/$defs/MaterializationCoordinateSystem"
///    },
///    "design_facts": {
///      "description": "Present in every a1 document. Optional only so that an a1 reader can\nhold an a0 document in this model: absent means a0, whose producer did\nnot report these facts.",
///      "$ref": "#/$defs/DesignFacts"
///    },
///    "diagnostics": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/MaterializationDiagnostic"
///      }
///    },
///    "diff_pairs": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/DiffPair"
///      }
///    },
///    "net_classes": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/NetClass"
///      }
///    },
///    "nets": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/Net"
///      }
///    },
///    "operations": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/MaterialOperation"
///      }
///    },
///    "producer": {
///      "$ref": "#/$defs/MaterializationProducer"
///    },
///    "schema": {
///      "type": "string",
///      "const": "kicad_monkey.materialization.a1"
///    },
///    "scope": {
///      "$ref": "#/$defs/MaterializationScope"
///    },
///    "source": {
///      "$ref": "#/$defs/MaterializationSource"
///    },
///    "stack": {
///      "$ref": "#/$defs/Stack"
///    },
///    "type": {
///      "type": "string",
///      "const": "kicad_monkey.materialization.document"
///    },
///    "version": {
///      "type": "string",
///      "const": "a1"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct MaterializationDocumentA1 {
    pub binding: ::std::vec::Vec<BindingEntry>,
    pub chunks: ::std::vec::Vec<ChunkEntry>,
    pub components: ::std::vec::Vec<Component>,
    pub coordinate_system: MaterializationCoordinateSystem,
    /**Present in every a1 document. Optional only so that an a1 reader can
    hold an a0 document in this model: absent means a0, whose producer did
    not report these facts.*/
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub design_facts: ::std::option::Option<DesignFacts>,
    pub diagnostics: ::std::vec::Vec<MaterializationDiagnostic>,
    pub diff_pairs: ::std::vec::Vec<DiffPair>,
    pub net_classes: ::std::vec::Vec<NetClass>,
    pub nets: ::std::vec::Vec<Net>,
    pub operations: ::std::vec::Vec<MaterialOperation>,
    pub producer: MaterializationProducer,
    pub schema: ::std::string::String,
    pub scope: MaterializationScope,
    pub source: MaterializationSource,
    pub stack: Stack,
    #[serde(rename = "type")]
    pub type_: ::std::string::String,
    pub version: ::std::string::String,
}
///`MaterializationProducer`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "object",
///  "required": [
///    "name",
///    "version"
///  ],
///  "properties": {
///    "name": {
///      "type": "string"
///    },
///    "version": {
///      "type": "string"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct MaterializationProducer {
    pub name: ::std::string::String,
    pub version: ::std::string::String,
}
/**What a document holds. It is canonical: products are distinct and in
`MaterialProduct` declaration order, and slice and net keys are distinct
and sorted by byte value. Every operation, component, and product-tagged
diagnostic lies within it: a named product, a listed slice (a hole spans
one), a listed net, and bounds meeting `region`.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "What a document holds. It is canonical: products are distinct and in\n`MaterialProduct` declaration order, and slice and net keys are distinct\nand sorted by byte value. Every operation, component, and product-tagged\ndiagnostic lies within it: a named product, a listed slice (a hole spans\none), a listed net, and bounds meeting `region`.",
///  "type": "object",
///  "required": [
///    "complete",
///    "products",
///    "tile_size_nm"
///  ],
///  "properties": {
///    "complete": {
///      "description": "True exactly when every product is named and there is no slice, net, or region filter.",
///      "type": "boolean"
///    },
///    "net_keys": {
///      "description": "Absent means every net.",
///      "type": "array",
///      "items": {
///        "type": "string"
///      }
///    },
///    "products": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/MaterialProduct"
///      }
///    },
///    "region": {
///      "$ref": "#/$defs/NmBounds"
///    },
///    "slice_keys": {
///      "description": "Absent means every slice.",
///      "type": "array",
///      "items": {
///        "type": "string"
///      }
///    },
///    "tile_size_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct MaterializationScope {
    ///True exactly when every product is named and there is no slice, net, or region filter.
    pub complete: bool,
    ///Absent means every net.
    #[serde(default, skip_serializing_if = "::std::vec::Vec::is_empty")]
    pub net_keys: ::std::vec::Vec<::std::string::String>,
    pub products: ::std::vec::Vec<MaterialProduct>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub region: ::std::option::Option<NmBounds>,
    ///Absent means every slice.
    #[serde(default, skip_serializing_if = "::std::vec::Vec::is_empty")]
    pub slice_keys: ::std::vec::Vec<::std::string::String>,
    pub tile_size_nm: NonNegativeNm,
}
/**The board file, and the project file when one was given: net classes come
only from the project.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "The board file, and the project file when one was given: net classes come\nonly from the project.",
///  "type": "object",
///  "required": [
///    "sha256",
///    "source_bytes"
///  ],
///  "properties": {
///    "project_bytes": {
///      "type": "string"
///    },
///    "project_sha256": {
///      "type": "string"
///    },
///    "sha256": {
///      "type": "string"
///    },
///    "source_bytes": {
///      "type": "string"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct MaterializationSource {
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub project_bytes: ::std::option::Option<::std::string::String>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub project_sha256: ::std::option::Option<::std::string::String>,
    pub sha256: ::std::string::String,
    pub source_bytes: ::std::string::String,
}
///Resolved electrical net. The empty key is the no-net assignment.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Resolved electrical net. The empty key is the no-net assignment.",
///  "type": "object",
///  "required": [
///    "key",
///    "name"
///  ],
///  "properties": {
///    "key": {
///      "type": "string"
///    },
///    "name": {
///      "type": "string"
///    },
///    "net_class": {
///      "type": "string"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Net {
    pub key: ::std::string::String,
    pub name: ::std::string::String,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub net_class: ::std::option::Option<::std::string::String>,
}
/**Effective design rules of a KiCad net class. A net matched by several
classes gets a composite class: `constituents` are the matched classes by
priority, with `Default` last when it supplied a value, `name` joins them
with commas, and each rule comes from the first constituent that sets it.
A single class lists only itself.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Effective design rules of a KiCad net class. A net matched by several\nclasses gets a composite class: `constituents` are the matched classes by\npriority, with `Default` last when it supplied a value, `name` joins them\nwith commas, and each rule comes from the first constituent that sets it.\nA single class lists only itself.",
///  "type": "object",
///  "required": [
///    "constituents",
///    "name"
///  ],
///  "properties": {
///    "clearance_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "constituents": {
///      "type": "array",
///      "items": {
///        "type": "string"
///      },
///      "minItems": 1
///    },
///    "diff_pair_gap_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "diff_pair_via_gap_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "diff_pair_width_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "microvia_diameter_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "microvia_drill_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "name": {
///      "type": "string"
///    },
///    "track_width_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "via_diameter_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "via_drill_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct NetClass {
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub clearance_nm: ::std::option::Option<NonNegativeNm>,
    pub constituents: ::std::vec::Vec<::std::string::String>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub diff_pair_gap_nm: ::std::option::Option<NonNegativeNm>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub diff_pair_via_gap_nm: ::std::option::Option<NonNegativeNm>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub diff_pair_width_nm: ::std::option::Option<NonNegativeNm>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub microvia_diameter_nm: ::std::option::Option<NonNegativeNm>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub microvia_drill_nm: ::std::option::Option<NonNegativeNm>,
    pub name: ::std::string::String,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub track_width_nm: ::std::option::Option<NonNegativeNm>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub via_diameter_nm: ::std::option::Option<NonNegativeNm>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub via_drill_nm: ::std::option::Option<NonNegativeNm>,
}
/**Board-frame length in integer nanometres. The range matches KiCad's own
32-bit internal-unit limit, so the packed encoding stores it losslessly.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Board-frame length in integer nanometres. The range matches KiCad's own\n32-bit internal-unit limit, so the packed encoding stores it losslessly.",
///  "type": "integer",
///  "maximum": 2147483647.0,
///  "minimum": -2147483648.0
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct Nm(pub i32);
impl ::std::ops::Deref for Nm {
    type Target = i32;
    fn deref(&self) -> &i32 {
        &self.0
    }
}
impl ::std::convert::From<Nm> for i32 {
    fn from(value: Nm) -> Self {
        value.0
    }
}
impl ::std::convert::From<i32> for Nm {
    fn from(value: i32) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for Nm {
    type Err = <i32 as ::std::str::FromStr>::Err;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.parse()?))
    }
}
impl ::std::convert::TryFrom<&str> for Nm {
    type Error = <i32 as ::std::str::FromStr>::Err;
    fn try_from(value: &str) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<String> for Nm {
    type Error = <i32 as ::std::str::FromStr>::Err;
    fn try_from(value: String) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::fmt::Display for Nm {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
///Axis-aligned bounds in the board frame, inclusive.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Axis-aligned bounds in the board frame, inclusive.",
///  "type": "object",
///  "required": [
///    "max_x_nm",
///    "max_y_nm",
///    "min_x_nm",
///    "min_y_nm"
///  ],
///  "properties": {
///    "max_x_nm": {
///      "$ref": "#/$defs/Nm"
///    },
///    "max_y_nm": {
///      "$ref": "#/$defs/Nm"
///    },
///    "min_x_nm": {
///      "$ref": "#/$defs/Nm"
///    },
///    "min_y_nm": {
///      "$ref": "#/$defs/Nm"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct NmBounds {
    pub max_x_nm: Nm,
    pub max_y_nm: Nm,
    pub min_x_nm: Nm,
    pub min_y_nm: Nm,
}
///Point in KiCad's board frame: X to the right, Y down, in nanometres.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Point in KiCad's board frame: X to the right, Y down, in nanometres.",
///  "type": "array",
///  "items": {
///    "$ref": "#/$defs/Nm"
///  },
///  "maxItems": 2,
///  "minItems": 2
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NmPoint(pub [Nm; 2usize]);
impl ::std::ops::Deref for NmPoint {
    type Target = [Nm; 2usize];
    fn deref(&self) -> &[Nm; 2usize] {
        &self.0
    }
}
impl ::std::convert::From<NmPoint> for [Nm; 2usize] {
    fn from(value: NmPoint) -> Self {
        value.0
    }
}
impl ::std::convert::From<[Nm; 2usize]> for NmPoint {
    fn from(value: [Nm; 2usize]) -> Self {
        Self(value)
    }
}
///Non-negative length in integer nanometres.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Non-negative length in integer nanometres.",
///  "type": "integer",
///  "maximum": 2147483647.0,
///  "minimum": 0.0
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NonNegativeNm(pub i64);
impl ::std::ops::Deref for NonNegativeNm {
    type Target = i64;
    fn deref(&self) -> &i64 {
        &self.0
    }
}
impl ::std::convert::From<NonNegativeNm> for i64 {
    fn from(value: NonNegativeNm) -> Self {
        value.0
    }
}
impl ::std::convert::From<i64> for NonNegativeNm {
    fn from(value: i64) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for NonNegativeNm {
    type Err = <i64 as ::std::str::FromStr>::Err;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.parse()?))
    }
}
impl ::std::convert::TryFrom<&str> for NonNegativeNm {
    type Error = <i64 as ::std::str::FromStr>::Err;
    fn try_from(value: &str) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<String> for NonNegativeNm {
    type Error = <i64 as ::std::str::FromStr>::Err;
    fn try_from(value: String) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::fmt::Display for NonNegativeNm {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
/**How copper joins the zone fills of its net: KiCad's `ZONE_CONNECTION`.
A zone's `(connect_pads)` without a mode is `thermal_reliefs`; `yes` and
`full` are `solid`, `no` is `none`. A pad's `(zone_connect N)` is 0
`none`, 1 `thermal_reliefs`, 2 `solid`, 3 `thru_hole_only`.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "How copper joins the zone fills of its net: KiCad's `ZONE_CONNECTION`.\nA zone's `(connect_pads)` without a mode is `thermal_reliefs`; `yes` and\n`full` are `solid`, `no` is `none`. A pad's `(zone_connect N)` is 0\n`none`, 1 `thermal_reliefs`, 2 `solid`, 3 `thru_hole_only`.",
///  "type": "string",
///  "enum": [
///    "none",
///    "thermal_reliefs",
///    "solid",
///    "thru_hole_only"
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
pub enum PadConnection {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "thermal_reliefs")]
    ThermalReliefs,
    #[serde(rename = "solid")]
    Solid,
    #[serde(rename = "thru_hole_only")]
    ThruHoleOnly,
}
impl ::std::fmt::Display for PadConnection {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::None => f.write_str("none"),
            Self::ThermalReliefs => f.write_str("thermal_reliefs"),
            Self::Solid => f.write_str("solid"),
            Self::ThruHoleOnly => f.write_str("thru_hole_only"),
        }
    }
}
impl ::std::str::FromStr for PadConnection {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "none" => Ok(Self::None),
            "thermal_reliefs" => Ok(Self::ThermalReliefs),
            "solid" => Ok(Self::Solid),
            "thru_hole_only" => Ok(Self::ThruHoleOnly),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PadConnection {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PadConnection {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PadConnection {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///Pad numbers of one footprint that KiCad connects as a group.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Pad numbers of one footprint that KiCad connects as a group.",
///  "type": "object",
///  "required": [
///    "pad_numbers"
///  ],
///  "properties": {
///    "pad_numbers": {
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
pub struct PadGroup {
    pub pad_numbers: ::std::vec::Vec<::std::string::String>,
}
/**A pad's own zone rules, keyed by the pad's binding `source_uid`. A value
is present only when the pad sets it instead of inheriting it; a pad that
sets nothing has no record.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "A pad's own zone rules, keyed by the pad's binding `source_uid`. A value\nis present only when the pad sets it instead of inheriting it; a pad that\nsets nothing has no record.",
///  "type": "object",
///  "required": [
///    "layers",
///    "source_uid"
///  ],
///  "properties": {
///    "clearance_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "layers": {
///      "description": "Padstack layers that set a rule, in file order.",
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/PadstackLayerRules"
///      }
///    },
///    "pad_connection": {
///      "$ref": "#/$defs/PadConnection"
///    },
///    "source_uid": {
///      "type": "string"
///    },
///    "thermal_gap_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "thermal_spoke_angle_deg": {
///      "type": "number"
///    },
///    "thermal_spoke_width_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PadRules {
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub clearance_nm: ::std::option::Option<NonNegativeNm>,
    ///Padstack layers that set a rule, in file order.
    pub layers: ::std::vec::Vec<PadstackLayerRules>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub pad_connection: ::std::option::Option<PadConnection>,
    pub source_uid: ::std::string::String,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub thermal_gap_nm: ::std::option::Option<NonNegativeNm>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub thermal_spoke_angle_deg: ::std::option::Option<f64>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub thermal_spoke_width_nm: ::std::option::Option<NonNegativeNm>,
}
/**Zone rules a padstack layer sets for itself (`(padstack (layer ...))`).
`kicad_layer` is the selector as written: a copper layer name, or `Inner`
for every inner layer in KiCad's front/inner/back mode.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Zone rules a padstack layer sets for itself (`(padstack (layer ...))`).\n`kicad_layer` is the selector as written: a copper layer name, or `Inner`\nfor every inner layer in KiCad's front/inner/back mode.",
///  "type": "object",
///  "required": [
///    "kicad_layer"
///  ],
///  "properties": {
///    "clearance_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "kicad_layer": {
///      "type": "string"
///    },
///    "pad_connection": {
///      "$ref": "#/$defs/PadConnection"
///    },
///    "thermal_gap_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "thermal_spoke_angle_deg": {
///      "type": "number"
///    },
///    "thermal_spoke_width_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PadstackLayerRules {
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub clearance_nm: ::std::option::Option<NonNegativeNm>,
    pub kicad_layer: ::std::string::String,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub pad_connection: ::std::option::Option<PadConnection>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub thermal_gap_nm: ::std::option::Option<NonNegativeNm>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub thermal_spoke_angle_deg: ::std::option::Option<f64>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub thermal_spoke_width_nm: ::std::option::Option<NonNegativeNm>,
}
///`PathCap`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "string",
///  "enum": [
///    "round",
///    "flat"
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
pub enum PathCap {
    #[serde(rename = "round")]
    Round,
    #[serde(rename = "flat")]
    Flat,
}
impl ::std::fmt::Display for PathCap {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Round => f.write_str("round"),
            Self::Flat => f.write_str("flat"),
        }
    }
}
impl ::std::str::FromStr for PathCap {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "round" => Ok(Self::Round),
            "flat" => Ok(Self::Flat),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PathCap {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PathCap {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PathCap {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///`PathJoin`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "string",
///  "enum": [
///    "round",
///    "miter"
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
pub enum PathJoin {
    #[serde(rename = "round")]
    Round,
    #[serde(rename = "miter")]
    Miter,
}
impl ::std::fmt::Display for PathJoin {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Round => f.write_str("round"),
            Self::Miter => f.write_str("miter"),
        }
    }
}
impl ::std::str::FromStr for PathJoin {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "round" => Ok(Self::Round),
            "miter" => Ok(Self::Miter),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PathJoin {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PathJoin {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PathJoin {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///`PathSegment`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "oneOf": [
///    {
///      "$ref": "#/$defs/LineSegment"
///    },
///    {
///      "$ref": "#/$defs/ArcSegment"
///    },
///    {
///      "$ref": "#/$defs/CubicSegment"
///    }
///  ]
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum PathSegment {
    LineSegment(LineSegment),
    ArcSegment(ArcSegment),
    CubicSegment(CubicSegment),
}
impl ::std::convert::From<LineSegment> for PathSegment {
    fn from(value: LineSegment) -> Self {
        Self::LineSegment(value)
    }
}
impl ::std::convert::From<ArcSegment> for PathSegment {
    fn from(value: ArcSegment) -> Self {
        Self::ArcSegment(value)
    }
}
impl ::std::convert::From<CubicSegment> for PathSegment {
    fn from(value: CubicSegment) -> Self {
        Self::CubicSegment(value)
    }
}
///One analytic outer contour with optional hole contours.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "One analytic outer contour with optional hole contours.",
///  "type": "object",
///  "required": [
///    "holes",
///    "kind",
///    "outer"
///  ],
///  "properties": {
///    "holes": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/Contour"
///      }
///    },
///    "kind": {
///      "type": "string",
///      "const": "planar_region_2d"
///    },
///    "outer": {
///      "$ref": "#/$defs/Contour"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PlanarRegion2d {
    pub holes: ::std::vec::Vec<Contour>,
    #[serde(
        deserialize_with = "crate::materialization_contract::deserialize_planar_region_2d_kind"
    )]
    pub kind: ::std::string::String,
    pub outer: Contour,
}
/**Counterbore or countersink machined from one side. A countersink's
`angle_deg` is the full included cone angle. Without `depth_nm`, a
countersink runs to its cone apex.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Counterbore or countersink machined from one side. A countersink's\n`angle_deg` is the full included cone angle. Without `depth_nm`, a\ncountersink runs to its cone apex.",
///  "type": "object",
///  "required": [
///    "mode",
///    "side"
///  ],
///  "properties": {
///    "angle_deg": {
///      "type": "number"
///    },
///    "depth_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "diameter_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "mode": {
///      "$ref": "#/$defs/PostMachiningMode"
///    },
///    "side": {
///      "$ref": "#/$defs/BoardSide"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PostMachining {
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub angle_deg: ::std::option::Option<f64>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub depth_nm: ::std::option::Option<NonNegativeNm>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub diameter_nm: ::std::option::Option<NonNegativeNm>,
    pub mode: PostMachiningMode,
    pub side: BoardSide,
}
///`PostMachiningMode`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "string",
///  "enum": [
///    "counterbore",
///    "countersink"
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
pub enum PostMachiningMode {
    #[serde(rename = "counterbore")]
    Counterbore,
    #[serde(rename = "countersink")]
    Countersink,
}
impl ::std::fmt::Display for PostMachiningMode {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Counterbore => f.write_str("counterbore"),
            Self::Countersink => f.write_str("countersink"),
        }
    }
}
impl ::std::str::FromStr for PostMachiningMode {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "counterbore" => Ok(Self::Counterbore),
            "countersink" => Ok(Self::Countersink),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PostMachiningMode {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PostMachiningMode {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PostMachiningMode {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///KiCad's tri-state for a protection option: set, cleared, or left to the board default.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "KiCad's tri-state for a protection option: set, cleared, or left to the board default.",
///  "type": "string",
///  "enum": [
///    "yes",
///    "no",
///    "unspecified"
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
pub enum ProtectionState {
    #[serde(rename = "yes")]
    Yes,
    #[serde(rename = "no")]
    No,
    #[serde(rename = "unspecified")]
    Unspecified,
}
impl ::std::fmt::Display for ProtectionState {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Yes => f.write_str("yes"),
            Self::No => f.write_str("no"),
            Self::Unspecified => f.write_str("unspecified"),
        }
    }
}
impl ::std::str::FromStr for ProtectionState {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "yes" => Ok(Self::Yes),
            "no" => Ok(Self::No),
            "unspecified" => Ok(Self::Unspecified),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ProtectionState {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ProtectionState {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ProtectionState {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///`Rect2d`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "object",
///  "required": [
///    "center_nm",
///    "height_nm",
///    "kind",
///    "width_nm"
///  ],
///  "properties": {
///    "center_nm": {
///      "$ref": "#/$defs/NmPoint"
///    },
///    "height_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "kind": {
///      "type": "string",
///      "const": "rect_2d"
///    },
///    "width_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Rect2d {
    pub center_nm: NmPoint,
    pub height_nm: NonNegativeNm,
    #[serde(deserialize_with = "crate::materialization_contract::deserialize_rect_2d_kind")]
    pub kind: ::std::string::String,
    pub width_nm: NonNegativeNm,
}
///`RectCorner`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "string",
///  "enum": [
///    "top_left",
///    "top_right",
///    "bottom_left",
///    "bottom_right"
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
pub enum RectCorner {
    #[serde(rename = "top_left")]
    TopLeft,
    #[serde(rename = "top_right")]
    TopRight,
    #[serde(rename = "bottom_left")]
    BottomLeft,
    #[serde(rename = "bottom_right")]
    BottomRight,
}
impl ::std::fmt::Display for RectCorner {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::TopLeft => f.write_str("top_left"),
            Self::TopRight => f.write_str("top_right"),
            Self::BottomLeft => f.write_str("bottom_left"),
            Self::BottomRight => f.write_str("bottom_right"),
        }
    }
}
impl ::std::str::FromStr for RectCorner {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "top_left" => Ok(Self::TopLeft),
            "top_right" => Ok(Self::TopRight),
            "bottom_left" => Ok(Self::BottomLeft),
            "bottom_right" => Ok(Self::BottomRight),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for RectCorner {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for RectCorner {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for RectCorner {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///`RoundedRect2d`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "object",
///  "required": [
///    "center_nm",
///    "height_nm",
///    "kind",
///    "radius_nm",
///    "width_nm"
///  ],
///  "properties": {
///    "center_nm": {
///      "$ref": "#/$defs/NmPoint"
///    },
///    "height_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "kind": {
///      "type": "string",
///      "const": "rounded_rect_2d"
///    },
///    "radius_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "width_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct RoundedRect2d {
    pub center_nm: NmPoint,
    pub height_nm: NonNegativeNm,
    #[serde(
        deserialize_with = "crate::materialization_contract::deserialize_rounded_rect_2d_kind"
    )]
    pub kind: ::std::string::String,
    pub radius_nm: NonNegativeNm,
    pub width_nm: NonNegativeNm,
}
///What a rule area forbids: each flag is true where KiCad's keep-out says `not_allowed`.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "What a rule area forbids: each flag is true where KiCad's keep-out says `not_allowed`.",
///  "type": "object",
///  "required": [
///    "copper_pour",
///    "footprints",
///    "pads",
///    "tracks",
///    "vias"
///  ],
///  "properties": {
///    "copper_pour": {
///      "type": "boolean"
///    },
///    "footprints": {
///      "type": "boolean"
///    },
///    "pads": {
///      "type": "boolean"
///    },
///    "tracks": {
///      "type": "boolean"
///    },
///    "vias": {
///      "type": "boolean"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct RuleAreaKeepouts {
    pub copper_pour: bool,
    pub footprints: bool,
    pub pads: bool,
    pub tracks: bool,
    pub vias: bool,
}
///Closed analytic shape vocabulary. Lowering is a consumer operation.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Closed analytic shape vocabulary. Lowering is a consumer operation.",
///  "oneOf": [
///    {
///      "$ref": "#/$defs/Disk2d"
///    },
///    {
///      "$ref": "#/$defs/Rect2d"
///    },
///    {
///      "$ref": "#/$defs/RoundedRect2d"
///    },
///    {
///      "$ref": "#/$defs/ChamferedRect2d"
///    },
///    {
///      "$ref": "#/$defs/Trapezoid2d"
///    },
///    {
///      "$ref": "#/$defs/Capsule2d"
///    },
///    {
///      "$ref": "#/$defs/Annulus2d"
///    },
///    {
///      "$ref": "#/$defs/SweptPath2d"
///    },
///    {
///      "$ref": "#/$defs/PlanarRegion2d"
///    }
///  ]
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum Shape2d {
    Disk2d(Disk2d),
    Rect2d(Rect2d),
    RoundedRect2d(RoundedRect2d),
    ChamferedRect2d(ChamferedRect2d),
    Trapezoid2d(Trapezoid2d),
    Capsule2d(Capsule2d),
    Annulus2d(Annulus2d),
    SweptPath2d(SweptPath2d),
    PlanarRegion2d(PlanarRegion2d),
}
impl ::std::convert::From<Disk2d> for Shape2d {
    fn from(value: Disk2d) -> Self {
        Self::Disk2d(value)
    }
}
impl ::std::convert::From<Rect2d> for Shape2d {
    fn from(value: Rect2d) -> Self {
        Self::Rect2d(value)
    }
}
impl ::std::convert::From<RoundedRect2d> for Shape2d {
    fn from(value: RoundedRect2d) -> Self {
        Self::RoundedRect2d(value)
    }
}
impl ::std::convert::From<ChamferedRect2d> for Shape2d {
    fn from(value: ChamferedRect2d) -> Self {
        Self::ChamferedRect2d(value)
    }
}
impl ::std::convert::From<Trapezoid2d> for Shape2d {
    fn from(value: Trapezoid2d) -> Self {
        Self::Trapezoid2d(value)
    }
}
impl ::std::convert::From<Capsule2d> for Shape2d {
    fn from(value: Capsule2d) -> Self {
        Self::Capsule2d(value)
    }
}
impl ::std::convert::From<Annulus2d> for Shape2d {
    fn from(value: Annulus2d) -> Self {
        Self::Annulus2d(value)
    }
}
impl ::std::convert::From<SweptPath2d> for Shape2d {
    fn from(value: SweptPath2d) -> Self {
        Self::SweptPath2d(value)
    }
}
impl ::std::convert::From<PlanarRegion2d> for Shape2d {
    fn from(value: PlanarRegion2d) -> Self {
        Self::PlanarRegion2d(value)
    }
}
///`SideProtection`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "object",
///  "required": [
///    "covered",
///    "plugged",
///    "tented"
///  ],
///  "properties": {
///    "covered": {
///      "$ref": "#/$defs/ProtectionState"
///    },
///    "plugged": {
///      "$ref": "#/$defs/ProtectionState"
///    },
///    "tented": {
///      "$ref": "#/$defs/ProtectionState"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SideProtection {
    pub covered: ProtectionState,
    pub plugged: ProtectionState,
    pub tented: ProtectionState,
}
/**Physical role of a slice. `coverlay`, `adhesive`, and `stiffener` occur
only in flexible or stiffened stack regions.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Physical role of a slice. `coverlay`, `adhesive`, and `stiffener` occur\nonly in flexible or stiffened stack regions.",
///  "type": "string",
///  "enum": [
///    "conductor",
///    "dielectric",
///    "solder_mask",
///    "paste",
///    "silkscreen",
///    "coverlay",
///    "adhesive",
///    "stiffener"
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
pub enum SliceRole {
    #[serde(rename = "conductor")]
    Conductor,
    #[serde(rename = "dielectric")]
    Dielectric,
    #[serde(rename = "solder_mask")]
    SolderMask,
    #[serde(rename = "paste")]
    Paste,
    #[serde(rename = "silkscreen")]
    Silkscreen,
    #[serde(rename = "coverlay")]
    Coverlay,
    #[serde(rename = "adhesive")]
    Adhesive,
    #[serde(rename = "stiffener")]
    Stiffener,
}
impl ::std::fmt::Display for SliceRole {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Conductor => f.write_str("conductor"),
            Self::Dielectric => f.write_str("dielectric"),
            Self::SolderMask => f.write_str("solder_mask"),
            Self::Paste => f.write_str("paste"),
            Self::Silkscreen => f.write_str("silkscreen"),
            Self::Coverlay => f.write_str("coverlay"),
            Self::Adhesive => f.write_str("adhesive"),
            Self::Stiffener => f.write_str("stiffener"),
        }
    }
}
impl ::std::str::FromStr for SliceRole {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "conductor" => Ok(Self::Conductor),
            "dielectric" => Ok(Self::Dielectric),
            "solder_mask" => Ok(Self::SolderMask),
            "paste" => Ok(Self::Paste),
            "silkscreen" => Ok(Self::Silkscreen),
            "coverlay" => Ok(Self::Coverlay),
            "adhesive" => Ok(Self::Adhesive),
            "stiffener" => Ok(Self::Stiffener),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SliceRole {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SliceRole {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SliceRole {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
///`Stack`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "object",
///  "required": [
///    "regions",
///    "slices"
///  ],
///  "properties": {
///    "board_thickness_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "copper_finish": {
///      "type": "string"
///    },
///    "edge_plating": {
///      "description": "KiCad's board-level plated-edge flag (`edge_plating`). KiCad stores no\nplated-edge geometry; fabrication plates the profile.",
///      "type": "boolean"
///    },
///    "impedance_controlled": {
///      "description": "KiCad's board-level impedance-control flag (`dielectric_constraints`).",
///      "type": "boolean"
///    },
///    "regions": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/StackRegion"
///      },
///      "minItems": 1
///    },
///    "slices": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/StackSlice"
///      }
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Stack {
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub board_thickness_nm: ::std::option::Option<NonNegativeNm>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub copper_finish: ::std::option::Option<::std::string::String>,
    /**KiCad's board-level plated-edge flag (`edge_plating`). KiCad stores no
    plated-edge geometry; fabrication plates the profile.*/
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub edge_plating: ::std::option::Option<bool>,
    ///KiCad's board-level impedance-control flag (`dielectric_constraints`).
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub impedance_controlled: ::std::option::Option<bool>,
    pub regions: ::std::vec::Vec<StackRegion>,
    pub slices: ::std::vec::Vec<StackSlice>,
}
/**Part of the board with its own build-up. `slice_keys` lists the slices
present there in stack order. A slice that only one region lists exists
only in that region. Without `boundary` the region is the whole board
profile. A rigid board has exactly one rigid region holding every slice.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Part of the board with its own build-up. `slice_keys` lists the slices\npresent there in stack order. A slice that only one region lists exists\nonly in that region. Without `boundary` the region is the whole board\nprofile. A rigid board has exactly one rigid region holding every slice.",
///  "type": "object",
///  "required": [
///    "bend_lines",
///    "key",
///    "kind",
///    "slice_keys"
///  ],
///  "properties": {
///    "bend_lines": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/BendLine"
///      }
///    },
///    "boundary": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/PlanarRegion2d"
///      }
///    },
///    "key": {
///      "type": "string"
///    },
///    "kind": {
///      "$ref": "#/$defs/StackRegionKind"
///    },
///    "slice_keys": {
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
pub struct StackRegion {
    pub bend_lines: ::std::vec::Vec<BendLine>,
    #[serde(default, skip_serializing_if = "::std::vec::Vec::is_empty")]
    pub boundary: ::std::vec::Vec<PlanarRegion2d>,
    pub key: ::std::string::String,
    pub kind: StackRegionKind,
    pub slice_keys: ::std::vec::Vec<::std::string::String>,
}
///`StackRegionKind`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "string",
///  "enum": [
///    "rigid",
///    "flex"
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
pub enum StackRegionKind {
    #[serde(rename = "rigid")]
    Rigid,
    #[serde(rename = "flex")]
    Flex,
}
impl ::std::fmt::Display for StackRegionKind {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Rigid => f.write_str("rigid"),
            Self::Flex => f.write_str("flex"),
        }
    }
}
impl ::std::str::FromStr for StackRegionKind {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "rigid" => Ok(Self::Rigid),
            "flex" => Ok(Self::Flex),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for StackRegionKind {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for StackRegionKind {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for StackRegionKind {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
/**One physical slice of the rigid board stack. `order` is zero at the front
outermost slice and increases toward the back. Z positions are derived
from the ordered thicknesses and are never stored. Absent values are
unknown, never defaulted.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "One physical slice of the rigid board stack. `order` is zero at the front\noutermost slice and increases toward the back. Z positions are derived\nfrom the ordered thicknesses and are never stored. Absent values are\nunknown, never defaulted.",
///  "type": "object",
///  "required": [
///    "key",
///    "order",
///    "role"
///  ],
///  "properties": {
///    "dielectric_kind": {
///      "description": "A dielectric's construction, when the stackup states it.",
///      "$ref": "#/$defs/DielectricKind"
///    },
///    "key": {
///      "type": "string"
///    },
///    "kicad_layer": {
///      "type": "string"
///    },
///    "loss_tangent": {
///      "type": "number"
///    },
///    "material_name": {
///      "type": "string"
///    },
///    "order": {
///      "type": "integer",
///      "maximum": 4294967295.0,
///      "minimum": 0.0
///    },
///    "relative_permittivity": {
///      "type": "number"
///    },
///    "role": {
///      "$ref": "#/$defs/SliceRole"
///    },
///    "side": {
///      "$ref": "#/$defs/BoardSide"
///    },
///    "thickness_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct StackSlice {
    ///A dielectric's construction, when the stackup states it.
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub dielectric_kind: ::std::option::Option<DielectricKind>,
    pub key: ::std::string::String,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub kicad_layer: ::std::option::Option<::std::string::String>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub loss_tangent: ::std::option::Option<f64>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub material_name: ::std::option::Option<::std::string::String>,
    pub order: u32,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub relative_permittivity: ::std::option::Option<f64>,
    pub role: SliceRole,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub side: ::std::option::Option<BoardSide>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub thickness_nm: ::std::option::Option<NonNegativeNm>,
}
///`SurfaceMaterial`
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "type": "string",
///  "enum": [
///    "copper",
///    "dielectric",
///    "solder_mask",
///    "paste",
///    "silkscreen"
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
pub enum SurfaceMaterial {
    #[serde(rename = "copper")]
    Copper,
    #[serde(rename = "dielectric")]
    Dielectric,
    #[serde(rename = "solder_mask")]
    SolderMask,
    #[serde(rename = "paste")]
    Paste,
    #[serde(rename = "silkscreen")]
    Silkscreen,
}
impl ::std::fmt::Display for SurfaceMaterial {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Copper => f.write_str("copper"),
            Self::Dielectric => f.write_str("dielectric"),
            Self::SolderMask => f.write_str("solder_mask"),
            Self::Paste => f.write_str("paste"),
            Self::Silkscreen => f.write_str("silkscreen"),
        }
    }
}
impl ::std::str::FromStr for SurfaceMaterial {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "copper" => Ok(Self::Copper),
            "dielectric" => Ok(Self::Dielectric),
            "solder_mask" => Ok(Self::SolderMask),
            "paste" => Ok(Self::Paste),
            "silkscreen" => Ok(Self::Silkscreen),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SurfaceMaterial {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SurfaceMaterial {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SurfaceMaterial {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
/**Add or remove one shape of material on one slice whose role matches the
material (copper on conductor slices, and so on). Conductive material
always carries `net_key`; operations on different nets are never merged.

Operations combine without regard to order. Per slice and material
(and per net for conductive material), operations that share a
`group_key` form one item whose subtracts remove only that item's own
adds; the material is then the union of the ungrouped adds and every
group's result, minus the union of the ungrouped subtracts.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Add or remove one shape of material on one slice whose role matches the\nmaterial (copper on conductor slices, and so on). Conductive material\nalways carries `net_key`; operations on different nets are never merged.\n\nOperations combine without regard to order. Per slice and material\n(and per net for conductive material), operations that share a\n`group_key` form one item whose subtracts remove only that item's own\nadds; the material is then the union of the ungrouped adds and every\ngroup's result, minus the union of the ungrouped subtracts.",
///  "type": "object",
///  "required": [
///    "action",
///    "affine",
///    "bounds",
///    "index",
///    "kind",
///    "material",
///    "shape",
///    "slice_key"
///  ],
///  "properties": {
///    "action": {
///      "$ref": "#/$defs/MaterialAction"
///    },
///    "affine": {
///      "$ref": "#/$defs/Affine2D"
///    },
///    "bounds": {
///      "description": "Board-frame bounds holding the whole shape after `affine` and any growing offset.",
///      "$ref": "#/$defs/NmBounds"
///    },
///    "group_key": {
///      "description": "Item that this operation's subtracts are confined to, such as one\nknockout text whose glyph strokes are cut from its own box. It is the\nitem's source UID, so it survives filtering unchanged.",
///      "type": "string"
///    },
///    "index": {
///      "type": "integer",
///      "maximum": 4294967295.0,
///      "minimum": 0.0
///    },
///    "kind": {
///      "type": "string",
///      "const": "surface"
///    },
///    "material": {
///      "$ref": "#/$defs/SurfaceMaterial"
///    },
///    "net_key": {
///      "type": "string"
///    },
///    "offset_nm": {
///      "description": "Signed offset of `shape` in its local frame, before `affine`: the\nMinkowski sum with a disk of this radius when positive, or the erosion\nby it when negative, with round corners. It is present only where the\noffset shape has no closed form in this vocabulary: KiCad's polygonal\ninflation of trapezoid, chamfered, and custom pad openings, and the\nmask opening of a copper graphic grown by its margin. Never zero.",
///      "$ref": "#/$defs/Nm"
///    },
///    "shape": {
///      "$ref": "#/$defs/Shape2d"
///    },
///    "slice_key": {
///      "type": "string"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SurfaceOperation {
    pub action: MaterialAction,
    pub affine: Affine2D,
    ///Board-frame bounds holding the whole shape after `affine` and any growing offset.
    pub bounds: NmBounds,
    /**Item that this operation's subtracts are confined to, such as one
    knockout text whose glyph strokes are cut from its own box. It is the
    item's source UID, so it survives filtering unchanged.*/
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub group_key: ::std::option::Option<::std::string::String>,
    pub index: u32,
    #[serde(
        deserialize_with = "crate::materialization_contract::deserialize_surface_operation_kind"
    )]
    pub kind: ::std::string::String,
    pub material: SurfaceMaterial,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub net_key: ::std::option::Option<::std::string::String>,
    /**Signed offset of `shape` in its local frame, before `affine`: the
    Minkowski sum with a disk of this radius when positive, or the erosion
    by it when negative, with round corners. It is present only where the
    offset shape has no closed form in this vocabulary: KiCad's polygonal
    inflation of trapezoid, chamfered, and custom pad openings, and the
    mask opening of a copper graphic grown by its margin. Never zero.*/
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub offset_nm: ::std::option::Option<Nm>,
    pub shape: Shape2d,
    pub slice_key: ::std::string::String,
}
///Open centreline of line, arc, and cubic segments swept by a constant width.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Open centreline of line, arc, and cubic segments swept by a constant width.",
///  "type": "object",
///  "required": [
///    "cap",
///    "join",
///    "kind",
///    "segments",
///    "start_nm",
///    "width_nm"
///  ],
///  "properties": {
///    "cap": {
///      "$ref": "#/$defs/PathCap"
///    },
///    "join": {
///      "$ref": "#/$defs/PathJoin"
///    },
///    "kind": {
///      "type": "string",
///      "const": "swept_path_2d"
///    },
///    "segments": {
///      "type": "array",
///      "items": {
///        "$ref": "#/$defs/PathSegment"
///      },
///      "minItems": 1
///    },
///    "start_nm": {
///      "$ref": "#/$defs/NmPoint"
///    },
///    "width_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SweptPath2d {
    pub cap: PathCap,
    pub join: PathJoin,
    #[serde(deserialize_with = "crate::materialization_contract::deserialize_swept_path_2d_kind")]
    pub kind: ::std::string::String,
    pub segments: ::std::vec::Vec<PathSegment>,
    pub start_nm: NmPoint,
    pub width_nm: NonNegativeNm,
}
///KiCad trapezoid: a rectangle whose opposite edges are widened or narrowed by the deltas.
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "KiCad trapezoid: a rectangle whose opposite edges are widened or narrowed by the deltas.",
///  "type": "object",
///  "required": [
///    "center_nm",
///    "delta_x_nm",
///    "delta_y_nm",
///    "height_nm",
///    "kind",
///    "width_nm"
///  ],
///  "properties": {
///    "center_nm": {
///      "$ref": "#/$defs/NmPoint"
///    },
///    "delta_x_nm": {
///      "$ref": "#/$defs/Nm"
///    },
///    "delta_y_nm": {
///      "$ref": "#/$defs/Nm"
///    },
///    "height_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "kind": {
///      "type": "string",
///      "const": "trapezoid_2d"
///    },
///    "width_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Trapezoid2d {
    pub center_nm: NmPoint,
    pub delta_x_nm: Nm,
    pub delta_y_nm: Nm,
    pub height_nm: NonNegativeNm,
    #[serde(deserialize_with = "crate::materialization_contract::deserialize_trapezoid_2d_kind")]
    pub kind: ::std::string::String,
    pub width_nm: NonNegativeNm,
}
/**One zone or rule area on copper, as drawn. `outline` is the authored
outline in the board frame with its arcs: KiCad reads the first
`(polygon)` as the outline and later ones as holes in it. Exactly one of
`fill` (a copper zone) and `keepout` (a rule area) is present.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "One zone or rule area on copper, as drawn. `outline` is the authored\noutline in the board frame with its arcs: KiCad reads the first\n`(polygon)` as the outline and later ones as holes in it. Exactly one of\n`fill` (a copper zone) and `keepout` (a rule area) is present.",
///  "type": "object",
///  "required": [
///    "outline",
///    "priority",
///    "slice_keys",
///    "source_uid"
///  ],
///  "properties": {
///    "fill": {
///      "$ref": "#/$defs/ZoneFillRules"
///    },
///    "footprint_source_uid": {
///      "description": "The owning footprint's component `source_uid`, for a footprint's rule area.",
///      "type": "string"
///    },
///    "keepout": {
///      "$ref": "#/$defs/RuleAreaKeepouts"
///    },
///    "name": {
///      "type": "string"
///    },
///    "net_key": {
///      "description": "Absent for no net.",
///      "type": "string"
///    },
///    "outline": {
///      "$ref": "#/$defs/PlanarRegion2d"
///    },
///    "priority": {
///      "type": "integer",
///      "maximum": 4294967295.0,
///      "minimum": 0.0
///    },
///    "slice_keys": {
///      "description": "Conductor slices of the zone's copper layers, in stack order.",
///      "type": "array",
///      "items": {
///        "type": "string"
///      },
///      "minItems": 1
///    },
///    "source_uid": {
///      "description": "The zone's binding `source_uid`: its UUID, or `zone@<offset>` when the UUID is nil or repeats an earlier zone's.",
///      "type": "string"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ZoneFacts {
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub fill: ::std::option::Option<ZoneFillRules>,
    ///The owning footprint's component `source_uid`, for a footprint's rule area.
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub footprint_source_uid: ::std::option::Option<::std::string::String>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub keepout: ::std::option::Option<RuleAreaKeepouts>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub name: ::std::option::Option<::std::string::String>,
    ///Absent for no net.
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub net_key: ::std::option::Option<::std::string::String>,
    pub outline: PlanarRegion2d,
    pub priority: u32,
    ///Conductor slices of the zone's copper layers, in stack order.
    pub slice_keys: ::std::vec::Vec<::std::string::String>,
    ///The zone's binding `source_uid`: its UUID, or `zone@<offset>` when the UUID is nil or repeats an earlier zone's.
    pub source_uid: ::std::string::String,
}
/**Fill rules of a copper zone, as KiCad's zone filler reads them. Values
KiCad's parser defaults when the file omits them carry that default.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Fill rules of a copper zone, as KiCad's zone filler reads them. Values\nKiCad's parser defaults when the file omits them carry that default.",
///  "type": "object",
///  "required": [
///    "clearance_nm",
///    "island_removal",
///    "min_width_nm",
///    "pad_connection",
///    "thermal_gap_nm",
///    "thermal_spoke_width_nm"
///  ],
///  "properties": {
///    "clearance_nm": {
///      "description": "Zone-to-other-net clearance (`connect_pads (clearance)`).",
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "corner_radius_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "corner_smoothing": {
///      "$ref": "#/$defs/CornerSmoothing"
///    },
///    "hatch": {
///      "description": "Present when the zone fills with a hatch instead of solid copper.",
///      "$ref": "#/$defs/ZoneHatchFill"
///    },
///    "island_min_area_mm2": {
///      "description": "Island area threshold as written, in mm².",
///      "type": "number"
///    },
///    "island_removal": {
///      "$ref": "#/$defs/IslandRemoval"
///    },
///    "min_width_nm": {
///      "description": "Minimum fill width (`min_thickness`).",
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "pad_connection": {
///      "$ref": "#/$defs/PadConnection"
///    },
///    "thermal_gap_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "thermal_spoke_width_nm": {
///      "description": "Thermal spoke width (`thermal_bridge_width`).",
///      "$ref": "#/$defs/NonNegativeNm"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ZoneFillRules {
    ///Zone-to-other-net clearance (`connect_pads (clearance)`).
    pub clearance_nm: NonNegativeNm,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub corner_radius_nm: ::std::option::Option<NonNegativeNm>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub corner_smoothing: ::std::option::Option<CornerSmoothing>,
    ///Present when the zone fills with a hatch instead of solid copper.
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub hatch: ::std::option::Option<ZoneHatchFill>,
    ///Island area threshold as written, in mm².
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub island_min_area_mm2: ::std::option::Option<f64>,
    pub island_removal: IslandRemoval,
    ///Minimum fill width (`min_thickness`).
    pub min_width_nm: NonNegativeNm,
    pub pad_connection: PadConnection,
    pub thermal_gap_nm: NonNegativeNm,
    ///Thermal spoke width (`thermal_bridge_width`).
    pub thermal_spoke_width_nm: NonNegativeNm,
}
/**Hatched fill (`(mode hatch)`). Absent values are not in the file; KiCad's
defaults then apply.*/
///
/// <details><summary>JSON schema</summary>
///
/// ```json
///{
///  "description": "Hatched fill (`(mode hatch)`). Absent values are not in the file; KiCad's\ndefaults then apply.",
///  "type": "object",
///  "properties": {
///    "gap_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    },
///    "orientation_deg": {
///      "type": "number"
///    },
///    "thickness_nm": {
///      "$ref": "#/$defs/NonNegativeNm"
///    }
///  },
///  "additionalProperties": false
///}
/// ```
/// </details>
#[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ZoneHatchFill {
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub gap_nm: ::std::option::Option<NonNegativeNm>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub orientation_deg: ::std::option::Option<f64>,
    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nonnull",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub thickness_nm: ::std::option::Option<NonNegativeNm>,
}
impl ::std::default::Default for ZoneHatchFill {
    fn default() -> Self {
        Self {
            gap_nm: Default::default(),
            orientation_deg: Default::default(),
            thickness_nm: Default::default(),
        }
    }
}
