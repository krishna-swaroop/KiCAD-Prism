//! Native, source-backed views and focused edits for KiCad PCB documents.
//!
//! The board model indexes exact source spans and decodes domain records on
//! demand. It intentionally does not construct the generic compatibility tree.

#[cfg(feature = "embedded-resource-zstd")]
use crate::embedded_resource::decoded_data;
use crate::embedded_resource::{encoded_data, metadata_from_span};
use crate::sexpr::{
    Error, ErrorKind, ErrorPhase, Lexer, Patch, Position, Sexp, Token, TokenKind,
    apply_patches_with_limit, build_with_limit, decode_quoted, decode_quoted_with_limit,
    is_teardrop_numeric_key,
};
use crate::sexpr_projection::{FormSpan, ProjectionLimits, Selector, scan_form_spans_with_limits};
use crate::{KiCadPaper, KiCadTextEffects, KiCadTitleBlock};
use std::collections::BTreeMap;
use std::ops::Range;

mod counts;
mod decode;
mod document;
mod extended;
mod footprints;
mod indexing;
mod manufacturing;
mod memo;
mod pads;
mod padstacks;
mod physical;
mod scalars;
mod selection;
mod setup;
mod vias;
mod view_edits;
mod view_resources;
mod zones;
use self::{decode::*, indexing::*, scalars::*};
pub use crate::embedded_resource::{
    EmbeddedDataPresence as PcbEmbeddedDataPresence,
    EmbeddedDecodeLimits as PcbEmbeddedDecodeLimits, EmbeddedFile as PcbEmbeddedFile,
    EmbeddedFileOwner as PcbEmbeddedFileOwner,
};
pub use extended::{
    PcbBarcode, PcbBoardMetadata, PcbBoardVariant, PcbImage, PcbTable, PcbTableCell,
};
pub use footprints::{
    PcbFootprintGraphic, PcbFootprintProperty, PcbFootprintText, PcbFootprintTextBox,
    PcbFootprintZone,
};
pub use manufacturing::{
    PcbDrillLayerSpan, PcbDrillProperties, PcbPostMachiningProperties, PcbTeardropParameters,
    PcbZoneLayerConnections,
};
pub use pads::{
    PcbPad, PcbPadCustomOptions, PcbPadCustomPrimitive, PcbPadPolygonPoint, PcbPadPrimitiveGeometry,
};
pub use padstacks::{
    PcbPadstack, PcbPadstackLayer, PcbResolvedPadCopperLayer, PcbViaStack, PcbViaStackLayer,
    resolve_pad_copper_layer,
};
pub use physical::{
    PcbFootprintTransform, PcbHole, PcbHoleOwner, PcbHoleShape, PcbPadDrill, PcbProfileOwner,
    PcbProfilePrimitive, kicad_rotate,
};
pub use selection::{PcbFamily, PcbSelection};
pub use setup::{PcbSetup, PcbStackup, PcbStackupLayer, PcbStackupSublayer};
pub use vias::{PcbFrontBackOptionalBool, PcbVia};
pub use zones::{
    PcbZone, PcbZoneFilledPolygon, PcbZoneHatchFill, PcbZoneKeepout, PcbZoneLayerProperty,
    PcbZoneOutlineArc, PcbZonePlacement, PcbZonePlacementSource, PcbZonePolygon,
};

/// Resource ceilings for one native PCB read or focused edit.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PcbLimits {
    pub max_source_bytes: usize,
    pub max_output_bytes: usize,
    pub max_depth: usize,
    pub max_top_level_forms: usize,
    pub max_object_children: usize,
    pub max_setup_children: usize,
    pub max_stackup_layers: usize,
    pub max_title_block_children: usize,
    pub max_title_block_comments: usize,
    pub max_layers: usize,
    pub max_nets: usize,
    pub max_properties: usize,
    pub max_footprints: usize,
    pub max_footprint_children: usize,
    pub max_footprint_header_scalars: usize,
    pub max_footprint_attributes: usize,
    pub max_footprint_properties: usize,
    pub max_footprint_graphics: usize,
    pub max_footprint_texts: usize,
    pub max_footprint_text_boxes: usize,
    pub max_text_effect_children: usize,
    pub max_text_font_children: usize,
    pub max_text_justify_tokens: usize,
    pub max_text_box_points: usize,
    pub max_pad_header_scalars: usize,
    pub max_pad_children: usize,
    pub max_pad_chamfer_corners: usize,
    pub max_pad_custom_primitives: usize,
    pub max_pad_custom_point_forms: usize,
    pub max_pad_custom_points: usize,
    pub max_via_header_scalars: usize,
    pub max_via_children: usize,
    pub max_via_policy_children: usize,
    pub max_manufacturing_children: usize,
    pub max_teardrop_scalars: usize,
    pub max_zone_layer_connections: usize,
    pub max_model_children: usize,
    pub max_pads: usize,
    pub max_models: usize,
    pub max_segments: usize,
    pub max_vias: usize,
    pub max_zones: usize,
    pub max_zone_polygons: usize,
    pub max_zone_points: usize,
    pub max_zone_layer_properties: usize,
    pub max_arcs: usize,
    pub max_graphics: usize,
    pub max_graphic_points: usize,
    pub max_dimensions: usize,
    pub max_groups: usize,
    pub max_generated_items: usize,
    pub max_generated_children: usize,
    pub max_members: usize,
    pub max_embedded_files: usize,
    pub max_variants: usize,
    pub max_images: usize,
    pub max_image_data_parts: usize,
    pub max_barcodes: usize,
    pub max_tables: usize,
    pub max_table_cells: usize,
    pub max_table_values: usize,
}

impl PcbLimits {
    pub(crate) fn intersect(self, other: Self) -> Self {
        macro_rules! minimums {
            ($($field:ident),+ $(,)?) => {
                Self {
                    $($field: self.$field.min(other.$field),)+
                }
            };
        }
        minimums!(
            max_source_bytes,
            max_output_bytes,
            max_depth,
            max_top_level_forms,
            max_object_children,
            max_setup_children,
            max_stackup_layers,
            max_title_block_children,
            max_title_block_comments,
            max_layers,
            max_nets,
            max_properties,
            max_footprints,
            max_footprint_children,
            max_footprint_header_scalars,
            max_footprint_attributes,
            max_footprint_properties,
            max_footprint_graphics,
            max_footprint_texts,
            max_footprint_text_boxes,
            max_text_effect_children,
            max_text_font_children,
            max_text_justify_tokens,
            max_text_box_points,
            max_pad_header_scalars,
            max_pad_children,
            max_pad_chamfer_corners,
            max_pad_custom_primitives,
            max_pad_custom_point_forms,
            max_pad_custom_points,
            max_via_header_scalars,
            max_via_children,
            max_via_policy_children,
            max_manufacturing_children,
            max_teardrop_scalars,
            max_zone_layer_connections,
            max_model_children,
            max_pads,
            max_models,
            max_segments,
            max_vias,
            max_zones,
            max_zone_polygons,
            max_zone_points,
            max_zone_layer_properties,
            max_arcs,
            max_graphics,
            max_graphic_points,
            max_dimensions,
            max_groups,
            max_generated_items,
            max_generated_children,
            max_members,
            max_embedded_files,
            max_variants,
            max_images,
            max_image_data_parts,
            max_barcodes,
            max_tables,
            max_table_cells,
            max_table_values,
        )
    }
}

impl Default for PcbLimits {
    fn default() -> Self {
        Self {
            max_source_bytes: 512 * 1024 * 1024,
            max_output_bytes: 512 * 1024 * 1024,
            max_depth: 512,
            max_top_level_forms: 4_000_000,
            max_object_children: 1_000_000,
            max_setup_children: 16_384,
            max_stackup_layers: 512,
            max_title_block_children: 4_096,
            max_title_block_comments: 1_024,
            max_layers: 256,
            max_nets: 2_000_000,
            max_properties: 100_000,
            max_footprints: 1_000_000,
            max_footprint_children: 1_000_000,
            max_footprint_header_scalars: 256,
            max_footprint_attributes: 256,
            max_footprint_properties: 4_000_000,
            max_footprint_graphics: 4_000_000,
            max_footprint_texts: 4_000_000,
            max_footprint_text_boxes: 4_000_000,
            max_text_effect_children: 4_096,
            max_text_font_children: 4_096,
            max_text_justify_tokens: 1_024,
            max_text_box_points: 1_000_000,
            max_pad_header_scalars: 256,
            max_pad_children: 256,
            max_pad_chamfer_corners: 64,
            max_pad_custom_primitives: 1_000_000,
            max_pad_custom_point_forms: 4_000_000,
            max_pad_custom_points: 4_000_000,
            max_via_header_scalars: 32,
            max_via_children: 4_096,
            max_via_policy_children: 256,
            max_manufacturing_children: 4_096,
            max_teardrop_scalars: 256,
            max_zone_layer_connections: 4_096,
            max_model_children: 32,
            max_pads: 4_000_000,
            max_models: 1_000_000,
            max_segments: 8_000_000,
            max_vias: 4_000_000,
            max_zones: 1_000_000,
            max_zone_polygons: 1_000_000,
            max_zone_points: 16_000_000,
            max_zone_layer_properties: 1_000_000,
            max_arcs: 8_000_000,
            max_graphics: 4_000_000,
            max_graphic_points: 4_000_000,
            max_dimensions: 1_000_000,
            max_groups: 1_000_000,
            max_generated_items: 1_000_000,
            max_generated_children: 4_000_000,
            max_members: 4_000_000,
            max_embedded_files: 100_000,
            max_variants: 100_000,
            max_images: 100_000,
            max_image_data_parts: 1_000_000,
            max_barcodes: 100_000,
            max_tables: 100_000,
            max_table_cells: 1_000_000,
            max_table_values: 1_000_000,
        }
    }
}

/// Collection counts used to compare the lazy view with the Python model.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct PcbCounts {
    pub layers: usize,
    pub nets: usize,
    pub properties: usize,
    pub variants: usize,
    pub footprints: usize,
    pub footprint_properties: usize,
    pub pads: usize,
    pub models: usize,
    pub footprint_graphics: usize,
    pub footprint_texts: usize,
    pub footprint_text_boxes: usize,
    pub segments: usize,
    pub vias: usize,
    pub zones: usize,
    pub arcs: usize,
    pub graphics: usize,
    pub gr_texts: usize,
    pub gr_lines: usize,
    pub gr_rects: usize,
    pub gr_arcs: usize,
    pub gr_circles: usize,
    pub gr_polys: usize,
    pub gr_curves: usize,
    pub gr_text_boxes: usize,
    pub images: usize,
    pub barcodes: usize,
    pub tables: usize,
    pub table_cells: usize,
    pub groups: usize,
    pub dimensions: usize,
    pub generated_items: usize,
    pub embedded_files: usize,
    pub footprint_embedded_files: usize,
    pub unknown_top_level: usize,
}

/// One exact top-level PCB property and its editable value range.
#[derive(Clone, Debug, PartialEq)]
pub struct PcbProperty {
    pub name: String,
    pub value: String,
    pub source_range: Range<usize>,
    value_range: Range<usize>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PcbLayer {
    pub ordinal: i64,
    pub name: String,
    pub kind: String,
    pub user_name: Option<String>,
    pub source_range: Range<usize>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PcbNet {
    pub code: i64,
    pub name: String,
    pub source_range: Range<usize>,
}

/// A board-object net reference, which KiCad may encode by ordinal or name.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct PcbNetRef {
    pub ordinal: Option<i64>,
    pub name: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PcbFootprint {
    pub library_link: String,
    pub reference: Option<String>,
    pub value: Option<String>,
    pub layer: Option<String>,
    pub at_x: Option<f64>,
    pub at_y: Option<f64>,
    pub angle: Option<f64>,
    pub locked: bool,
    pub placement_path: Option<String>,
    pub placement_sheet_name: Option<String>,
    pub placement_sheet_file: Option<String>,
    pub uuid: Option<String>,
    pub description: String,
    pub tags: String,
    pub attributes: Vec<String>,
    pub component_classes: Vec<PcbComponentClassRef>,
    pub private_layers: Vec<String>,
    pub net_tie_pad_groups: Vec<PcbPadNameGroup>,
    pub embedded_fonts: bool,
    pub duplicate_pad_numbers_are_jumpers: Option<bool>,
    pub jumper_pad_groups: Vec<PcbPadNameGroup>,
    pub solder_mask_margin: Option<f64>,
    pub solder_paste_margin: Option<f64>,
    pub solder_paste_margin_ratio: Option<f64>,
    pub clearance: Option<f64>,
    pub zone_connect: Option<i64>,
    pub thermal_width: Option<f64>,
    pub thermal_gap: Option<f64>,
    pub property_count: usize,
    pub graphic_count: usize,
    pub text_count: usize,
    pub text_box_count: usize,
    pub pad_count: usize,
    pub model_count: usize,
    pub embedded_file_count: usize,
    pub source_range: Range<usize>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PcbComponentClassRef {
    pub name: String,
    pub source_range: Range<usize>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PcbPadNameGroup {
    pub pad_names: Vec<String>,
    /// Exact authored net-tie token spelling, including quotes and escapes.
    /// Jumper groups are authored as child forms and therefore use `None`.
    pub raw_token: Option<String>,
    pub source_range: Range<usize>,
}

/// Source owner for a footprint-local typed member reused by board and
/// standalone readers.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PcbFootprintMemberOwner {
    EmbeddedFootprint { footprint_index: usize },
    StandaloneFootprint,
}

/// One typed footprint 3D-model reference in board source order.
#[derive(Clone, Debug, PartialEq)]
pub struct PcbModelReference {
    pub owner: PcbFootprintMemberOwner,
    /// Compatibility index for board consumers; zero for standalone records.
    /// Prefer `owner` when distinguishing document scope.
    pub footprint_index: usize,
    pub path: String,
    pub offset: [f64; 3],
    pub scale: [f64; 3],
    pub rotate: [f64; 3],
    /// Authored hide state; absent remains distinct from explicit false.
    pub hidden: Option<bool>,
    pub opacity: Option<f64>,
    pub source_range: Range<usize>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PcbSegment {
    pub start_x: f64,
    pub start_y: f64,
    pub end_x: f64,
    pub end_y: f64,
    pub width: Option<f64>,
    pub layer: Option<String>,
    /// `(layers "F.Cu" "F.Mask")`: copper exposed through the solder mask.
    pub layers: Option<Vec<String>>,
    pub solder_mask_margin: Option<f64>,
    /// Bare `locked` header flag only; the Python oracle's `has_flag` does
    /// not honor the `(locked yes)` child form on segments.
    pub locked: bool,
    pub net: PcbNetRef,
    pub uuid: Option<String>,
    pub source_range: Range<usize>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PcbPoint {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PcbGraphicKind {
    Text,
    Line,
    Rect,
    Arc,
    Circle,
    Poly,
    Curve,
    TextBox,
}

/// Ordered source polygon elements; embedded arcs are not tessellated or omitted.
#[derive(Clone, Debug, PartialEq)]
pub enum PcbPolygonPoint {
    Xy(PcbPoint),
    Arc {
        start: PcbPoint,
        mid: PcbPoint,
        end: PcbPoint,
    },
}

/// A producer-neutral typed view of one board graphic carrier.
#[derive(Clone, Debug, PartialEq)]
pub struct PcbGraphic {
    pub kind: PcbGraphicKind,
    pub text: Option<String>,
    pub at: Option<PcbPoint>,
    pub start: Option<PcbPoint>,
    pub mid: Option<PcbPoint>,
    pub end: Option<PcbPoint>,
    pub center: Option<PcbPoint>,
    /// Compatibility projection containing only authored XY elements. Use
    /// `polygon_points` for complete polygon geometry, including embedded arcs.
    pub points: Vec<PcbPoint>,
    pub polygon_points: Vec<PcbPolygonPoint>,
    pub layer: Option<String>,
    /// Plural source selector, distinct from the singular `layer` field.
    /// `Some([])` preserves an explicitly empty `(layers)` form.
    pub layers: Option<Vec<String>>,
    /// Authored association; absent and explicit unconnected net zero differ.
    pub net: Option<PcbNetRef>,
    /// Source rectangle corner radius in millimetres.
    pub radius: Option<f64>,
    /// Local solder-mask opening margin in millimetres, without rule resolution.
    pub solder_mask_margin: Option<f64>,
    pub stroke_width: Option<f64>,
    pub stroke_kind: Option<String>,
    pub fill: Option<String>,
    /// Optional `gr_text_box` border state, including bare/empty forms.
    pub border: Option<bool>,
    /// Board graphic/text lock state. False when the source omits it.
    pub locked: bool,
    pub uuid: Option<String>,
    pub source_range: Range<usize>,
}

impl PcbGraphic {
    /// Resolve omitted shape fill using KiCad 10.0.6 `parsePCB_SHAPE` defaults.
    ///
    /// The caller supplies the resolved concrete layer; plural source selectors
    /// are intentionally not expanded here. Authored tokens (including hatch
    /// modes) are returned unchanged, and `self.fill` remains source evidence.
    /// This does not resolve the separate fallback width for unfilled shapes.
    pub fn effective_fill_for_layer(&self, layer: &str) -> &str {
        if let Some(fill) = self.fill.as_deref() {
            return fill;
        }
        // KiCad starts STROKE_PARAMS at zero and parses millimetres into integer
        // nanometres before deciding whether the legacy shape implies filling.
        let zero_width = (self.stroke_width.unwrap_or(0.0) * 1_000_000.0).round() == 0.0;
        if (matches!(self.kind, PcbGraphicKind::Rect | PcbGraphicKind::Circle) && zero_width)
            || (self.kind == PcbGraphicKind::Poly && layer != "Edge.Cuts")
        {
            "solid"
        } else {
            "none"
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct PcbRoutingArc {
    pub start: PcbPoint,
    pub mid: PcbPoint,
    pub end: PcbPoint,
    pub width: Option<f64>,
    pub layer: Option<String>,
    /// `(layers "F.Cu" "F.Mask")`: copper exposed through the solder mask.
    pub layers: Option<Vec<String>>,
    pub solder_mask_margin: Option<f64>,
    pub net: PcbNetRef,
    pub uuid: Option<String>,
    pub source_range: Range<usize>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PcbDimensionFormat {
    pub prefix: String,
    pub suffix: String,
    pub units: i64,
    pub units_format: i64,
    pub precision: i64,
    pub override_value: Option<String>,
    pub suppress_zeroes: bool,
}

impl Default for PcbDimensionFormat {
    fn default() -> Self {
        Self {
            prefix: String::new(),
            suffix: String::new(),
            units: 2,
            units_format: 1,
            precision: 4,
            override_value: None,
            suppress_zeroes: false,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct PcbDimensionStyle {
    pub thickness: f64,
    pub arrow_length: f64,
    pub text_position_mode: i64,
    pub arrow_direction: String,
    pub extension_height: f64,
    pub extension_offset: f64,
    pub keep_text_aligned: bool,
    pub text_frame: Option<i64>,
}

impl Default for PcbDimensionStyle {
    fn default() -> Self {
        Self {
            thickness: 0.2,
            arrow_length: 1.27,
            text_position_mode: 0,
            arrow_direction: "outward".to_owned(),
            extension_height: 0.58642,
            extension_offset: 0.0,
            keep_text_aligned: true,
            text_frame: None,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct PcbDimension {
    pub kind: String,
    pub layer: String,
    pub points: Vec<PcbPoint>,
    pub height: f64,
    pub leader_length: Option<f64>,
    pub orientation: Option<i64>,
    pub format: PcbDimensionFormat,
    pub style: PcbDimensionStyle,
    pub text: Option<PcbGraphic>,
    pub locked: bool,
    pub uuid: Option<String>,
    pub source_range: Range<usize>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PcbGroup {
    pub name: String,
    pub uuid: Option<String>,
    pub locked: bool,
    pub members: Vec<String>,
    pub source_range: Range<usize>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PcbGeneratedItem {
    pub kind: Option<String>,
    pub name: Option<String>,
    pub layer: Option<String>,
    pub uuid: Option<String>,
    pub locked: bool,
    pub members: Vec<String>,
    pub property_heads: Vec<String>,
    pub source_range: Range<usize>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PcbEdit {
    pub source: String,
    pub changed: bool,
}

#[derive(Clone, Debug)]
struct IndexedFootprint {
    span: FormSpan,
    property_count: usize,
    graphic_count: usize,
    text_count: usize,
    text_box_count: usize,
    pad_count: usize,
    model_count: usize,
    embedded_file_count: usize,
}

#[derive(Clone, Debug)]
struct IndexedNestedForm {
    parent_index: usize,
    span: FormSpan,
}

#[derive(Clone, Debug)]
struct IndexedEmbeddedFile {
    owner: PcbEmbeddedFileOwner,
    span: FormSpan,
}

#[derive(Clone, Debug, Default)]
struct NetResolver {
    name_by_ordinal: BTreeMap<i64, String>,
    ordinal_by_name: BTreeMap<String, i64>,
}

impl NetResolver {
    fn resolve(&self, mut net: PcbNetRef) -> PcbNetRef {
        // Python's `NetRef.resolve_name` fills any falsy name, so a
        // present-but-empty `(net_name "")` still resolves from the table.
        if net.name.as_deref().is_none_or(str::is_empty)
            && let Some(name) = net
                .ordinal
                .and_then(|ordinal| self.name_by_ordinal.get(&ordinal))
                .filter(|name| !name.is_empty())
        {
            net.name = Some(name.clone());
        }
        if net.ordinal.is_none()
            && let Some(ordinal) = net
                .name
                .as_ref()
                .and_then(|name| self.ordinal_by_name.get(name))
        {
            net.ordinal = Some(*ordinal);
        }
        net
    }
}

#[derive(Debug, Default)]
struct PcbIndex {
    layer_forms: Vec<FormSpan>,
    properties: Vec<FormSpan>,
    nets: Vec<FormSpan>,
    footprints: Vec<IndexedFootprint>,
    footprint_properties: Vec<IndexedNestedForm>,
    pads: Vec<IndexedNestedForm>,
    models: Vec<IndexedNestedForm>,
    footprint_graphics: Vec<IndexedNestedForm>,
    footprint_texts: Vec<IndexedNestedForm>,
    footprint_text_boxes: Vec<IndexedNestedForm>,
    footprint_zones: Vec<IndexedNestedForm>,
    segments: Vec<FormSpan>,
    vias: Vec<FormSpan>,
    zones: Vec<FormSpan>,
    graphics: Vec<FormSpan>,
    arcs: Vec<FormSpan>,
    dimensions: Vec<FormSpan>,
    groups: Vec<FormSpan>,
    generated_items: Vec<FormSpan>,
    embedded_files: Vec<IndexedEmbeddedFile>,
    variants: Vec<FormSpan>,
    images: Vec<FormSpan>,
    barcodes: Vec<FormSpan>,
    tables: Vec<extended::IndexedTable>,
    table_cells: Vec<IndexedNestedForm>,
    counts: PcbCounts,
}

/// A board view backed by one source buffer and exact selected form spans.
#[derive(Clone, Debug)]
pub struct PcbView<'a> {
    source: &'a str,
    root: FormSpan,
    top_level: Vec<FormSpan>,
    layer_forms: Vec<FormSpan>,
    properties: Vec<FormSpan>,
    nets: Vec<FormSpan>,
    footprints: Vec<IndexedFootprint>,
    footprint_properties: Vec<IndexedNestedForm>,
    pads: Vec<IndexedNestedForm>,
    models: Vec<IndexedNestedForm>,
    footprint_graphics: Vec<IndexedNestedForm>,
    footprint_texts: Vec<IndexedNestedForm>,
    footprint_text_boxes: Vec<IndexedNestedForm>,
    footprint_zones: Vec<IndexedNestedForm>,
    segments: Vec<FormSpan>,
    vias: Vec<FormSpan>,
    zones: Vec<FormSpan>,
    graphics: Vec<FormSpan>,
    arcs: Vec<FormSpan>,
    dimensions: Vec<FormSpan>,
    groups: Vec<FormSpan>,
    generated_items: Vec<FormSpan>,
    embedded_files: Vec<IndexedEmbeddedFile>,
    variants: Vec<FormSpan>,
    images: Vec<FormSpan>,
    barcodes: Vec<FormSpan>,
    tables: Vec<extended::IndexedTable>,
    table_cells: Vec<IndexedNestedForm>,
    net_resolver: NetResolver,
    counts: PcbCounts,
    limits: PcbLimits,
    selection: PcbSelection,
    decoded: memo::PcbDecoded,
}

impl<'a> PcbView<'a> {
    /// Validate one `kicad_pcb` root and index its major domain families.
    pub fn parse(source: &'a str, limits: PcbLimits) -> Result<Self, Error> {
        Self::parse_selected(source, limits, PcbSelection::all())
    }

    /// Validate a board and index only the requested families plus dependencies.
    pub fn parse_selected(
        source: &'a str,
        limits: PcbLimits,
        selection: PcbSelection,
    ) -> Result<Self, Error> {
        let selected_limit = limits
            .max_top_level_forms
            .checked_add(1)
            .ok_or_else(limit_error)?;
        let spans = scan_form_spans_with_limits(
            source,
            &Selector {
                min_depth: Some(0),
                max_depth: Some(1),
                ..Selector::default()
            },
            projection_limits(limits, selected_limit),
        )?;
        let roots: Vec<_> = spans.iter().filter(|span| span.depth == 0).collect();
        let [root] = roots.as_slice() else {
            return Err(source_error(
                "Expected exactly one top-level PCB form",
                Position::START,
            ));
        };
        if root.head.as_deref() != Some("kicad_pcb") {
            return Err(source_error("Expected a kicad_pcb root", root.start));
        }
        let root = (*root).clone();
        let top_level: Vec<_> = spans.into_iter().filter(|span| span.depth == 1).collect();
        if top_level.len() > limits.max_top_level_forms {
            return Err(limit_error());
        }

        let effective = selection.dependencies();
        let mut index = index_top_level(source, &top_level, limits, effective)?;
        let net_resolver = net_resolver_from_spans(source, &index.nets)?;
        index.counts.retain_selection(selection);

        Ok(Self {
            source,
            root,
            top_level,
            layer_forms: index.layer_forms,
            properties: index.properties,
            nets: index.nets,
            footprints: index.footprints,
            footprint_properties: index.footprint_properties,
            pads: index.pads,
            models: index.models,
            footprint_graphics: index.footprint_graphics,
            footprint_texts: index.footprint_texts,
            footprint_text_boxes: index.footprint_text_boxes,
            footprint_zones: index.footprint_zones,
            segments: index.segments,
            vias: index.vias,
            zones: index.zones,
            graphics: index.graphics,
            arcs: index.arcs,
            dimensions: index.dimensions,
            groups: index.groups,
            generated_items: index.generated_items,
            embedded_files: index.embedded_files,
            variants: index.variants,
            images: index.images,
            barcodes: index.barcodes,
            tables: index.tables,
            table_cells: index.table_cells,
            net_resolver,
            counts: index.counts,
            limits,
            selection,
            decoded: memo::PcbDecoded::default(),
        })
    }

    pub fn counts(&self) -> PcbCounts {
        self.counts
    }

    pub fn source(&self) -> &'a str {
        self.source
    }

    pub fn selection(&self) -> PcbSelection {
        self.selection
    }

    pub fn root_span(&self) -> &FormSpan {
        &self.root
    }

    /// Iterate exact top-level spans in source order, including unknown forms.
    pub fn top_level_forms(&self) -> impl Iterator<Item = &FormSpan> {
        self.top_level.iter()
    }

    pub fn unknown_top_level_forms(&self) -> impl Iterator<Item = &FormSpan> {
        self.top_level.iter().filter(|span| {
            span.head
                .as_deref()
                .is_none_or(|head| !is_known_top_level(head))
        })
    }
}

pub use document::PcbDocument;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) struct StandaloneFootprintCounts {
    pub properties: usize,
    pub graphics: usize,
    pub texts: usize,
    pub text_boxes: usize,
    pub pads: usize,
    pub models: usize,
    pub embedded_files: usize,
}

pub(crate) fn standalone_footprint_from_span(
    source: &str,
    span: &FormSpan,
    limits: PcbLimits,
    counts: StandaloneFootprintCounts,
) -> Result<PcbFootprint, Error> {
    footprint_from_span(
        source,
        &IndexedFootprint {
            span: span.clone(),
            property_count: counts.properties,
            graphic_count: counts.graphics,
            text_count: counts.texts,
            text_box_count: counts.text_boxes,
            pad_count: counts.pads,
            model_count: counts.models,
            embedded_file_count: counts.embedded_files,
        },
        limits,
    )
}

pub(crate) fn standalone_pad_from_span(
    source: &str,
    span: &FormSpan,
    limits: PcbLimits,
) -> Result<PcbPad, Error> {
    let mut pad = pads::pad_from_span(
        source,
        &IndexedNestedForm {
            parent_index: 0,
            span: span.clone(),
        },
        limits,
    )?;
    pad.owner = PcbFootprintMemberOwner::StandaloneFootprint;
    Ok(pad)
}

pub(crate) fn standalone_property_from_span(
    source: &str,
    span: &FormSpan,
    limits: PcbLimits,
) -> Result<PcbFootprintProperty, Error> {
    footprints::footprint_property_from_span(
        source,
        &IndexedNestedForm {
            parent_index: 0,
            span: span.clone(),
        },
        limits,
    )
}

pub(crate) fn standalone_text_from_span(
    source: &str,
    span: &FormSpan,
    limits: PcbLimits,
) -> Result<PcbFootprintText, Error> {
    footprints::footprint_text_from_span(
        source,
        &IndexedNestedForm {
            parent_index: 0,
            span: span.clone(),
        },
        limits,
    )
}

pub(crate) fn standalone_text_box_from_span(
    source: &str,
    span: &FormSpan,
    limits: PcbLimits,
) -> Result<PcbFootprintTextBox, Error> {
    footprints::footprint_text_box_from_span(
        source,
        &IndexedNestedForm {
            parent_index: 0,
            span: span.clone(),
        },
        limits,
    )
}

pub(crate) fn standalone_model_from_span(
    source: &str,
    span: &FormSpan,
    limits: PcbLimits,
) -> Result<PcbModelReference, Error> {
    let mut model = model_from_span(
        source,
        &IndexedNestedForm {
            parent_index: 0,
            span: span.clone(),
        },
        limits,
    )?;
    model.owner = PcbFootprintMemberOwner::StandaloneFootprint;
    Ok(model)
}

pub(crate) fn standalone_graphic_from_span(
    source: &str,
    span: &FormSpan,
    limits: PcbLimits,
) -> Result<PcbGraphic, Error> {
    graphic_from_span(source, span, limits)
}
