//! Solder mask, paste, and silkscreen products.
//!
//! - Solder mask: per side, the closed board profile is added; pad openings
//!   grown by the resolved margin, untented via openings, and mask-layer
//!   graphics, text, and zones are subtracted.
//! - Paste: per side, pad apertures after the resolved margin and ratio,
//!   plus paste-layer graphics, text, and zones.
//! - Silkscreen: per side, silkscreen graphics, text, and zones as
//!   authored. Clipping silkscreen by mask openings is a fabrication step
//!   and is left to consumers.
//!
//! Copper-layer text from the same plot-document walk is emitted here too,
//! as unconnected copper.

use super::apertures::{
    BoardMargins, aperture, mask_margin, on_layer, paste_margin, via_opening_nm,
};
use super::emit::{Emitter, Material, Origin, source_uid};
use super::geometry::nm;
use super::geometry::{
    footprint_affine, identity, origin as zero, place, placement_affine, rotation_translation,
};
use super::graphics::{Drawn, TextSpec, closed_stroke, operation_shapes, text_anchor, text_shapes};
use super::nets::net_key;
use super::pads::reference;
use super::pads::{pad_shapes, place_pad};
use super::routing::Route;
use super::routing::{fill_offset_nm, polyline_contour};
use super::source_graphics::{graphic_layers, graphic_shapes};
use super::stack::CopperStack;
use super::zone_ids::ZoneIds;
use crate::board_plotter_ir::{
    BoardDimensionOperation, BoardFootprintOperation, BoardFootprintRecord, BoardPlotDocument,
    BoardPlotRecord, BoardTableOperation, BoardTextBoxOperation, BoardTextOperation,
};
use crate::pcb::{
    PcbFootprint, PcbFootprintGraphic, PcbGraphic, PcbPad, PcbVia, PcbZone,
    resolve_pad_copper_layer,
};
use crate::plotter_types::PlotterOperation;
use prism_kicad_contracts::generated::materialization_document::{
    Affine2D, BindingSourceKind, Disk2d, MaterialAction, MaterialProduct, NonNegativeNm,
    PlanarRegion2d, Shape2d, Stack, SurfaceMaterial,
};
use std::collections::{HashMap, HashSet};

/// Technical layers in KiCad naming, front then back.
pub(crate) const TECHNICAL_LAYERS: [&str; 6] = [
    "F.SilkS", "B.SilkS", "F.Mask", "B.Mask", "F.Paste", "B.Paste",
];

/// One side of one technical product.
struct Side {
    layer: &'static str,
    slice: &'static str,
    copper: &'static str,
    front: bool,
}

fn sides(product: MaterialProduct) -> [Side; 2] {
    let (front_layer, back_layer, front_slice, back_slice) = match product {
        MaterialProduct::SolderMask => ("F.Mask", "B.Mask", "mask.front", "mask.back"),
        MaterialProduct::Paste => ("F.Paste", "B.Paste", "paste.front", "paste.back"),
        _ => ("F.SilkS", "B.SilkS", "silkscreen.front", "silkscreen.back"),
    };
    [
        Side {
            layer: front_layer,
            slice: front_slice,
            copper: "F.Cu",
            front: true,
        },
        Side {
            layer: back_layer,
            slice: back_slice,
            copper: "B.Cu",
            front: false,
        },
    ]
}

fn surface_of(product: MaterialProduct) -> SurfaceMaterial {
    match product {
        MaterialProduct::SolderMask => SurfaceMaterial::SolderMask,
        MaterialProduct::Paste => SurfaceMaterial::Paste,
        _ => SurfaceMaterial::Silkscreen,
    }
}

fn material(product: MaterialProduct, action: MaterialAction) -> Material {
    Material {
        material: surface_of(product),
        action,
        net_key: None,
        group_key: None,
    }
}

/// Graphics, text, and zone shapes on technical layers, drawn once per
/// board and shared by every technical product.
pub(crate) struct PlacedGraphic {
    pub layer: String,
    pub origin: Origin,
    pub affine: Affine2D,
    pub drawn: Drawn,
    /// Round offset applied to every shape (copper-shape mask openings).
    pub offset_nm: i32,
}

fn unbound(kind: BindingSourceKind, uid: String) -> Origin {
    Origin::routed(kind, uid, String::new())
}

fn record_uid(kind: &str, uuid: &str, position: usize) -> String {
    if uuid.is_empty() {
        format!("{kind}#{position}")
    } else {
        uuid.to_owned()
    }
}

fn technical(layer: &str) -> bool {
    TECHNICAL_LAYERS.contains(&layer)
}

fn push(
    out: &mut Vec<PlacedGraphic>,
    layer: &str,
    origin: Origin,
    affine: Affine2D,
    draw: impl FnOnce(&mut Drawn),
) {
    let mut drawn = Drawn::default();
    draw(&mut drawn);
    out.push(PlacedGraphic {
        layer: layer.to_owned(),
        origin,
        affine,
        drawn,
        offset_nm: 0,
    });
}

/// Board facts that footprint stroke text placement depends on.
pub(crate) struct TextContext {
    /// Board file format version (`(version ...)`).
    pub version: i64,
    /// Source facts of footprint texts and properties, by UUID.
    pub texts: HashMap<String, FootprintTextFacts>,
    /// UUIDs of board texts authored as knockout.
    pub board_knockout: HashSet<String>,
}

/// What KiCad needs from a footprint text's source to place stroke glyphs.
pub(crate) struct FootprintTextFacts {
    pub unlocked: bool,
    pub justify: Vec<String>,
    pub knockout: bool,
}

/// First format version whose footprint text angles are footprint-relative;
/// older files store the board-frame angle (`FIRST_FP_AFFINE_TRANSFORM`).
const FIRST_FP_AFFINE_TRANSFORM: i64 = 20_260_616;

/// Footprint text without a render cache, placed in the board frame.
fn footprint_stroke_text(
    operation: &BoardTextOperation,
    record: &BoardFootprintRecord,
    facts: Option<&FootprintTextFacts>,
    context: &TextContext,
    drawn: &mut Drawn,
) {
    let (board_x, board_y) = board_anchor(operation, record);
    let placement = &record.placement;
    let text_angle = if context.version < FIRST_FP_AFFINE_TRANSFORM {
        operation.orient_deg
    } else {
        operation.orient_deg + placement.angle_deg
    };
    let spec = TextSpec::from_board(operation)
        .format(context.version)
        .on_board(
            board_x,
            board_y,
            text_angle,
            facts.is_some_and(|facts| facts.unlocked),
        )
        .justified(facts.map_or(&[][..], |facts| &facts.justify))
        .knockout(facts.is_some_and(|facts| facts.knockout));
    text_shapes(&spec, drawn);
}

/// Text-box text in a footprint, placed as core's text-box layout does:
/// the anchor moves with the footprint, the angle adds the footprint's, and
/// the box's own alignment is kept (it is never kept upright).
fn footprint_box_text(
    operation: &BoardTextOperation,
    record: &BoardFootprintRecord,
    context: &TextContext,
    drawn: &mut Drawn,
) {
    let (x, y) = board_anchor(operation, record);
    let angle = (operation.orient_deg + record.placement.angle_deg).rem_euclid(360.0);
    let spec = TextSpec::from_board(operation)
        .format(context.version)
        .on_board(x, y, angle, true);
    text_shapes(&spec, drawn);
}

/// A footprint-local text anchor in the board frame.
fn board_anchor(operation: &BoardTextOperation, record: &BoardFootprintRecord) -> (i64, i64) {
    let [x, y] = text_anchor(operation);
    place(&placement_affine(&record.placement), x, y)
}

/// Layers a plot-document walk keeps.
pub(crate) type LayerFilter<'a> = &'a dyn Fn(&str) -> bool;

fn footprint_graphics(
    record: &BoardFootprintRecord,
    context: &TextContext,
    keep: LayerFilter<'_>,
    out: &mut Vec<PlacedGraphic>,
) {
    let placement = placement_affine(&record.placement);
    for (position, operation) in record.operations.iter().enumerate() {
        let (metadata, kind) = match operation {
            BoardFootprintOperation::Text { metadata, .. } => {
                (metadata, BindingSourceKind::FootprintText)
            }
            // Text-box borders are the only footprint geometry the parsed
            // source graphics do not cover.
            BoardFootprintOperation::Geometry { metadata, .. }
                if metadata.data_ref == "fp_text_box" =>
            {
                (metadata, BindingSourceKind::FootprintGraphic)
            }
            _ => continue,
        };
        let Some(layer) = metadata
            .extra_attrs
            .layer_name
            .as_deref()
            .filter(|layer| keep(layer))
        else {
            continue;
        };
        let uid = if metadata.data_uuid.is_empty() {
            format!("{}#{position}", record.uuid)
        } else {
            metadata.data_uuid.clone()
        };
        let mut origin = unbound(kind, uid);
        origin.refdes = Some(record.reference.clone());
        push(
            out,
            layer,
            origin,
            placement.clone(),
            |drawn| match operation {
                BoardFootprintOperation::Geometry { operation, .. } => {
                    operation_shapes(operation, drawn);
                }
                BoardFootprintOperation::Text { operation, .. }
                    if operation.render_cache.is_some() =>
                {
                    let spec = TextSpec::from_board(operation).format(context.version);
                    text_shapes(&spec, drawn);
                }
                BoardFootprintOperation::Text {
                    operation,
                    metadata,
                } if metadata.data_ref == "fp_text_box" => {
                    footprint_box_text(operation, record, context, drawn);
                }
                BoardFootprintOperation::Text { operation, .. } => {
                    let facts = context.texts.get(&metadata.data_uuid);
                    footprint_stroke_text(operation, record, facts, context, drawn);
                }
                _ => {}
            },
        );
    }
}

/// One plot operation of a text box, dimension, or table record.
enum Part<'a> {
    Geometry(&'a PlotterOperation),
    Text(&'a BoardTextOperation),
    /// A closed outline of this stroke width (a rotated text-box border).
    Outline(&'a [[i64; 2]], i64),
}

/// Draw a record made of geometry and text parts on `layer`.
fn mixed(
    out: &mut Vec<PlacedGraphic>,
    layer: &str,
    origin: Origin,
    parts: Vec<Part<'_>>,
    version: i64,
) {
    push(out, layer, origin, identity(), |drawn| {
        for part in parts {
            match part {
                Part::Geometry(op) => operation_shapes(op, drawn),
                Part::Text(op) => text_shapes(&TextSpec::from_board(op).format(version), drawn),
                Part::Outline(points, width) => {
                    drawn.shapes.extend(closed_stroke(points, width));
                }
            }
        }
    });
}

/// The technical layer, UID prefix, and parts of a text box, dimension, or
/// table record.
fn mixed_parts<'a>(
    record: &'a BoardPlotRecord,
    keep: LayerFilter<'_>,
) -> Option<(&'a str, &'a str, &'a str, Vec<Part<'a>>)> {
    match record {
        BoardPlotRecord::TextBox(value) if keep(&value.layer) => {
            // KiCad strokes a polygon box's own outline.
            let parts = value
                .operations
                .iter()
                .map(|op| match (op, &value.kicad_border) {
                    (BoardTextBoxOperation::Border(PlotterOperation::Rect(rect)), Some(points)) => {
                        Part::Outline(points, rect.width_nm)
                    }
                    (BoardTextBoxOperation::Border(op), _) => Part::Geometry(op),
                    (BoardTextBoxOperation::Text(op), _) => Part::Text(op),
                });
            Some((
                value.layer.as_str(),
                "text_box",
                value.uuid.as_str(),
                parts.collect(),
            ))
        }
        BoardPlotRecord::Dimension(value) => {
            let layer = value.layers.iter().find(|layer| keep(layer))?;
            let parts = value.operations.iter().map(|op| match op {
                BoardDimensionOperation::Geometry(op) => Part::Geometry(op),
                BoardDimensionOperation::Text(op) => Part::Text(op),
            });
            Some((
                layer.as_str(),
                "dimension",
                value.uuid.as_str(),
                parts.collect(),
            ))
        }
        BoardPlotRecord::Table(value) => {
            let layer = value.layers.iter().find(|layer| keep(layer))?;
            let parts = value
                .operations
                .iter()
                .enumerate()
                .filter(|(index, _)| !value.kicad_hidden_segments.contains(index))
                .map(|(_, op)| match op {
                    BoardTableOperation::Segment(op) => Part::Geometry(op),
                    BoardTableOperation::Text(op) => Part::Text(op),
                });
            Some((
                layer.as_str(),
                "table",
                value.uuid.as_str(),
                parts.collect(),
            ))
        }
        _ => None,
    }
}

fn board_graphics(
    record: &BoardPlotRecord,
    position: usize,
    context: &TextContext,
    keep: LayerFilter<'_>,
    out: &mut Vec<PlacedGraphic>,
) {
    match record {
        BoardPlotRecord::Text(value) if keep(&value.layer) => {
            let uid = record_uid("text", &value.uuid, position);
            let origin = unbound(BindingSourceKind::BoardText, uid);
            let knockout = context.board_knockout.contains(&value.uuid);
            push(out, &value.layer, origin, identity(), |drawn| {
                for op in &value.operations {
                    let spec = TextSpec::from_board(op)
                        .format(context.version)
                        .knockout(knockout);
                    text_shapes(&spec, drawn);
                }
            });
        }
        BoardPlotRecord::Footprint(value) => footprint_graphics(value, context, keep, out),
        _ => {
            if let Some((layer, kind, uuid, parts)) = mixed_parts(record, keep) {
                let source = if kind == "text_box" {
                    BindingSourceKind::BoardText
                } else {
                    BindingSourceKind::BoardGraphic
                };
                let origin = unbound(source, record_uid(kind, uuid, position));
                mixed(out, layer, origin, parts, context.version);
            }
        }
    }
}

/// Stored fills of zones on technical layers, grown as legacy fills are.
fn zone_graphics(zones: &[&PcbZone], ids: &ZoneIds, version: i64, out: &mut Vec<PlacedGraphic>) {
    for &zone in zones {
        let uid = ids.uid(zone);
        let offset_nm = fill_offset_nm(zone, version);
        for polygon in &zone.filled_polygons {
            let layer = match (polygon.layer.is_empty(), zone.layers.as_slice()) {
                (true, [only]) => only.as_str(),
                _ => polygon.layer.as_str(),
            };
            if !technical(layer) {
                continue;
            }
            let points = polygon
                .points
                .iter()
                .map(|p| super::geometry::pcb_point(*p));
            let origin =
                Origin::routed(BindingSourceKind::ZoneFill, uid.clone(), net_key(&zone.net));
            push(out, layer, origin, identity(), |drawn| {
                if let Some(contour) = polyline_contour(points.collect()) {
                    drawn.shapes.push(Shape2d::PlanarRegion2d(PlanarRegion2d {
                        kind: "planar_region_2d".to_owned(),
                        outer: contour,
                        holes: Vec::new(),
                    }));
                }
            });
            if let Some(last) = out.last_mut() {
                last.offset_nm = offset_nm;
            }
        }
    }
}

/// Parsed board and footprint graphics, the source of every non-text
/// technical shape.
pub(crate) struct SourceGraphics<'a> {
    pub board: &'a [PcbGraphic],
    pub footprint: &'a [PcbFootprintGraphic],
    pub footprints: &'a [PcbFootprint],
    pub zones: &'a [&'a PcbZone],
    pub zone_ids: &'a ZoneIds,
    /// Board solder-mask expansion for copper shapes without their own.
    pub mask_margin_nm: i64,
}

/// Mask side of an outer copper layer.
fn mask_of(layer: &str) -> Option<&'static str> {
    match layer {
        "F.Cu" => Some("F.Mask"),
        "B.Cu" => Some("B.Mask"),
        _ => None,
    }
}

/// One graphic on its technical layers. An outer-copper shape that is also
/// on its mask layer opens the mask once,
/// grown by its own margin or else the board's (`PCB_SHAPE::
/// GetSolderMaskExpansion`); its raw mask-layer copy is not drawn again.
fn source_graphic(
    graphic: &PcbGraphic,
    origin: &Origin,
    affine: &Affine2D,
    mask_margin_nm: i64,
    out: &mut Vec<PlacedGraphic>,
) {
    let layers = graphic_layers(graphic);
    // KiCad exposes a copper shape only when it is also on the mask layer
    // (`PCB_SHAPE::IsOnLayer`); `solder_mask_margin` alone only sizes it.
    let exposes = |mask: &str| {
        layers.iter().any(|layer| mask_of(layer) == Some(mask)) && layers.contains(&mask)
    };
    for &layer in &layers {
        if technical(layer) && !(layer.ends_with(".Mask") && exposes(layer)) {
            push(out, layer, origin.clone(), affine.clone(), |drawn| {
                graphic_shapes(graphic, layer, drawn);
            });
        }
        let Some(mask) = mask_of(layer).filter(|mask| exposes(mask)) else {
            continue;
        };
        let margin = graphic
            .solder_mask_margin
            .map_or(mask_margin_nm, |value| i64::from(nm(value)));
        let mut drawn = Drawn::default();
        graphic_shapes(graphic, layer, &mut drawn);
        out.push(PlacedGraphic {
            layer: mask.to_owned(),
            origin: origin.clone(),
            affine: affine.clone(),
            drawn,
            offset_nm: i32::try_from(margin.clamp(i64::from(i32::MIN), i64::from(i32::MAX)))
                .unwrap_or_default(),
        });
    }
}

fn source_graphics(graphics: &SourceGraphics<'_>, out: &mut Vec<PlacedGraphic>) {
    for (position, graphic) in graphics.board.iter().enumerate() {
        let uid = record_uid(
            "graphic",
            graphic.uuid.as_deref().unwrap_or_default(),
            position,
        );
        let origin = unbound(BindingSourceKind::BoardGraphic, uid);
        source_graphic(graphic, &origin, &identity(), graphics.mask_margin_nm, out);
    }
    for (position, owned) in graphics.footprint.iter().enumerate() {
        let Some(footprint) = graphics.footprints.get(owned.footprint_index) else {
            continue;
        };
        let graphic = &owned.graphic;
        let uid = record_uid(
            "footprint_graphic",
            graphic.uuid.as_deref().unwrap_or_default(),
            position,
        );
        let mut origin = unbound(BindingSourceKind::FootprintGraphic, uid);
        origin.refdes = Some(reference(footprint));
        let affine = footprint_affine(footprint);
        source_graphic(graphic, &origin, &affine, graphics.mask_margin_nm, out);
    }
}

/// Every technical-layer graphic of the board: source graphics, then plot
/// document text, then zones.
pub(crate) fn technical_graphics(
    graphics: &SourceGraphics<'_>,
    document: Option<&BoardPlotDocument>,
    context: &TextContext,
) -> Vec<PlacedGraphic> {
    let mut out = Vec::new();
    source_graphics(graphics, &mut out);
    out.extend(document_graphics(document, context, &technical));
    zone_graphics(graphics.zones, graphics.zone_ids, context.version, &mut out);
    out
}

/// Text, text boxes, dimensions, and tables of the plot document on the
/// layers `keep` accepts. Other geometry comes from the parsed source.
pub(crate) fn document_graphics(
    document: Option<&BoardPlotDocument>,
    context: &TextContext,
    keep: LayerFilter<'_>,
) -> Vec<PlacedGraphic> {
    let mut out = Vec::new();
    for (position, record) in document
        .into_iter()
        .flat_map(|doc| doc.records.iter().enumerate())
    {
        board_graphics(record, position, context, keep, &mut out);
    }
    out
}

/// Emit one graphic: its shapes with `action`, and knockout cuts removed
/// from its own adds through a shared `group_key`. On the mask, where
/// graphics are openings, a knockout would invert, so it is reported
/// instead.
fn emit_graphic(
    graphic: &PlacedGraphic,
    surface: SurfaceMaterial,
    action: MaterialAction,
    slice: &str,
    emitter: &mut Emitter,
) {
    let drawn = &graphic.drawn;
    for (code, message) in &drawn.unsupported {
        emitter.warn(code, message.clone(), Some(graphic.origin.uid.clone()));
    }
    let has_cuts = !drawn.cuts.is_empty() || !drawn.board_cuts.is_empty();
    if has_cuts && action == MaterialAction::Subtract {
        emitter.warn(
            "knockout_on_mask_not_materialized",
            "knockout text on a solder-mask layer is not materialized".to_owned(),
            Some(graphic.origin.uid.clone()),
        );
        return;
    }
    let board = identity();
    let local = |shapes: &'_ [Shape2d]| -> Vec<(Shape2d, Affine2D)> {
        shapes
            .iter()
            .map(|shape| (shape.clone(), graphic.affine.clone()))
            .collect()
    };
    let global = |shapes: &'_ [Shape2d]| -> Vec<(Shape2d, Affine2D)> {
        shapes
            .iter()
            .map(|shape| (shape.clone(), board.clone()))
            .collect()
    };
    let passes = [
        (action, local(&drawn.shapes)),
        (action, global(&drawn.board_shapes)),
        (MaterialAction::Subtract, local(&drawn.cuts)),
        (MaterialAction::Subtract, global(&drawn.board_cuts)),
    ];
    // Knockout cuts remove only this item's own box, not other material.
    let group_key = has_cuts.then(|| graphic.origin.uid.clone());
    for (action, shapes) in passes {
        for (shape, affine) in shapes {
            let material = Material {
                material: surface,
                action,
                // Copper text is unconnected copper; other materials have
                // no net.
                net_key: (surface == SurfaceMaterial::Copper)
                    .then(|| graphic.origin.net_key.clone()),
                group_key: group_key.clone(),
            };
            emitter.offset_surface(
                &graphic.origin,
                slice,
                material,
                shape,
                affine,
                graphic.offset_nm,
            );
        }
    }
}

/// Inputs shared by the technical products of one board.
pub(crate) struct TechnicalBoard<'a> {
    pub stack: &'a Stack,
    pub regions: &'a [PlanarRegion2d],
    pub margins: &'a BoardMargins,
    pub footprints: &'a [PcbFootprint],
    pub pads: &'a [PcbPad],
    pub vias: &'a [PcbVia],
    pub routes: &'a [Route],
    pub graphics: &'a [PlacedGraphic],
    /// Whether board and footprint text could be plotted.
    pub text_plotted: bool,
}

impl TechnicalBoard<'_> {
    fn has_slice(&self, key: &str) -> bool {
        self.stack.slices.iter().any(|slice| slice.key == key)
    }

    /// Emit `product` for both sides.
    pub(crate) fn emit(&self, product: MaterialProduct, emitter: &mut Emitter) {
        emitter.product = Some(product);
        if product == MaterialProduct::SolderMask && self.margins.mask_min_width_nm > 0 {
            emitter.warn(
                "mask_min_width_not_applied",
                format!(
                    "solder_mask_min_width {} nm is a fabrication step; webs are not merged",
                    self.margins.mask_min_width_nm
                ),
                None,
            );
        }
        if !self.text_plotted {
            emitter.warn(
                "text_not_plotted",
                "board text could not be plotted; text is not materialized".to_owned(),
                None,
            );
        }
        for side in sides(product) {
            if !self.has_slice(side.slice) {
                emitter.warn(
                    "slice_absent",
                    format!("the stack has no {} slice", side.slice),
                    None,
                );
                continue;
            }
            self.emit_side(product, &side, emitter);
        }
    }

    fn emit_side(&self, product: MaterialProduct, side: &Side, emitter: &mut Emitter) {
        if product == MaterialProduct::SolderMask {
            self.profile(side, emitter);
        }
        self.pad_openings(product, side, emitter);
        if product == MaterialProduct::SolderMask {
            self.via_openings(side, emitter);
            self.track_openings(side, emitter);
        }
        let action = if product == MaterialProduct::SolderMask {
            MaterialAction::Subtract
        } else {
            MaterialAction::Add
        };
        for graphic in self.graphics {
            if graphic.layer == side.layer {
                emit_graphic(graphic, surface_of(product), action, side.slice, emitter);
            }
        }
    }

    fn profile(&self, side: &Side, emitter: &mut Emitter) {
        for (position, region) in self.regions.iter().enumerate() {
            let origin = unbound(
                BindingSourceKind::Profile,
                format!("board_profile#{position}"),
            );
            emitter.surface(
                &origin,
                side.slice,
                material(MaterialProduct::SolderMask, MaterialAction::Add),
                Shape2d::PlanarRegion2d(region.clone()),
                identity(),
            );
        }
    }

    fn pad_openings(&self, product: MaterialProduct, side: &Side, emitter: &mut Emitter) {
        let mask = product == MaterialProduct::SolderMask;
        let action = if mask {
            MaterialAction::Subtract
        } else {
            MaterialAction::Add
        };
        for pad in self
            .pads
            .iter()
            .filter(|pad| on_layer(&pad.layers, side.layer))
        {
            let Some(placed) = place_pad(pad, self.footprints, emitter) else {
                continue;
            };
            let resolved = match resolve_pad_copper_layer(pad, side.copper) {
                Ok(resolved) => resolved,
                Err(cause) => {
                    emitter.warn(
                        "unsupported_padstack",
                        format!("pad layer {}: {cause}", side.copper),
                        Some(placed.origin.uid.clone()),
                    );
                    continue;
                }
            };
            let margin = match product {
                MaterialProduct::SolderMask => {
                    mask_margin(pad, placed.footprint, &resolved, self.margins)
                }
                MaterialProduct::Paste => {
                    paste_margin(pad, placed.footprint, &resolved, self.margins)
                }
                // A pad listing a silkscreen layer is printed as its shape.
                _ => (0, 0),
            };
            let Some(opening) = aperture(&resolved, margin) else {
                continue;
            };
            let shapes = pad_shapes(&opening.resolved, &placed.origin, side.slice, emitter);
            if opening.primitive_offset_nm < 0 && !shapes.primitives.is_empty() {
                emitter.warn(
                    "custom_pad_eroded_per_primitive",
                    "a negative margin erodes each custom-pad primitive separately".to_owned(),
                    Some(placed.origin.uid.clone()),
                );
            }
            let affine = placed
                .frame
                .affine(opening.resolved.offset.x, opening.resolved.offset.y);
            let base = shapes.base.map(|shape| (shape, opening.base_offset_nm));
            let primitives = shapes
                .primitives
                .into_iter()
                .map(|shape| (shape, opening.primitive_offset_nm));
            for (shape, offset) in base.into_iter().chain(primitives) {
                emitter.offset_surface(
                    &placed.origin,
                    side.slice,
                    material(product, action),
                    shape,
                    affine.clone(),
                    offset,
                );
            }
        }
    }

    /// Tracks exposed through the mask (`(layers "F.Cu" "F.Mask")`) open
    /// it by their width plus twice the local or board expansion, never
    /// below zero width (`PCB_TRACK::GetSolderMaskExpansion`).
    fn track_openings(&self, side: &Side, emitter: &mut Emitter) {
        for route in self
            .routes
            .iter()
            .filter(|route| route.exposed == Some(side.layer))
        {
            if route.width_mm <= 0.0 {
                continue;
            }
            let margin_mm = route
                .mask_margin
                .unwrap_or(self.margins.mask_nm as f64 / 1_000_000.0)
                .max(-route.width_mm / 2.0);
            emitter.surface(
                &route.origin,
                side.slice,
                material(MaterialProduct::SolderMask, MaterialAction::Subtract),
                route.shape(margin_mm),
                identity(),
            );
        }
    }

    fn via_openings(&self, side: &Side, emitter: &mut Emitter) {
        for via in self.vias {
            let Some(diameter) = via_opening_nm(via, side.front, self.margins) else {
                continue;
            };
            let uid = source_uid("via", via.uuid.as_deref(), via.source_range.start);
            let origin = Origin::routed(BindingSourceKind::Via, uid, net_key(&via.net));
            emitter.surface(
                &origin,
                side.slice,
                material(MaterialProduct::SolderMask, MaterialAction::Subtract),
                Shape2d::Disk2d(Disk2d {
                    kind: "disk_2d".to_owned(),
                    center_nm: zero(),
                    radius_nm: NonNegativeNm(diameter / 2),
                }),
                rotation_translation(0.0, via.at_x, via.at_y),
            );
        }
    }
}

/// Copper-layer text, text boxes, dimensions, and tables, as unconnected
/// copper; knockout cuts stay within their own item.
pub(crate) fn emit_copper_text(
    graphics: &[PlacedGraphic],
    copper: &CopperStack,
    emitter: &mut Emitter,
) {
    for graphic in graphics {
        if let Some(slice) = copper.key(&graphic.layer) {
            emit_graphic(
                graphic,
                SurfaceMaterial::Copper,
                MaterialAction::Add,
                slice,
                emitter,
            );
        }
    }
}
