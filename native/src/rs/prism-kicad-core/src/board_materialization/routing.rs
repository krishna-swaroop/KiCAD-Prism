//! Routed copper: tracks, track arcs, via lands, and stored zone fills.

use super::emit::{Emitter, Material, Origin, source_uid};
use super::flash::FlashLayers;
use super::geometry::{circumcircle, identity, nm, nm_point, origin, pcb_point};
use super::nets::net_key;
use super::stack::CopperStack;
use super::zone_ids::ZoneIds;
use crate::pcb::{PcbRoutingArc, PcbSegment, PcbVia, PcbZone};
use prism_kicad_contracts::generated::materialization_document::{
    ArcSegment, BindingSourceKind, Contour, Disk2d, LineSegment, MaterialAction, NmPoint,
    NonNegativeNm, PathCap, PathJoin, PathSegment, PlanarRegion2d, Shape2d, SurfaceMaterial,
    SweptPath2d,
};

fn swept(start: NmPoint, segment: PathSegment, width_mm: f64) -> Shape2d {
    Shape2d::SweptPath2d(SweptPath2d {
        kind: "swept_path_2d".to_owned(),
        start_nm: start,
        segments: vec![segment],
        width_nm: NonNegativeNm(i64::from(nm(width_mm))),
        cap: PathCap::Round,
        join: PathJoin::Round,
    })
}

fn line(end: NmPoint) -> PathSegment {
    PathSegment::LineSegment(LineSegment {
        kind: "line".to_owned(),
        end_nm: end,
    })
}

/// One routed track or track arc: its copper layer, centreline, width, and
/// solder-mask exposure. Built once and shared by the copper product and
/// the solder-mask product.
pub(crate) struct Route {
    pub origin: Origin,
    /// Copper layer: `(layer ...)`, or the copper entry of `(layers ...)`.
    pub layer: Option<String>,
    pub width_mm: f64,
    pub start: NmPoint,
    pub segment: PathSegment,
    /// The mask layer this track is exposed through, if any.
    pub exposed: Option<&'static str>,
    /// Local mask expansion, in millimetres.
    pub mask_margin: Option<f64>,
    /// A collinear arc drawn as a straight path.
    pub degenerate: bool,
}

/// The copper layer and mask exposure of a track's layer selectors.
fn route_layers(
    layer: Option<&str>,
    layers: Option<&[String]>,
) -> (Option<String>, Option<&'static str>) {
    let names = layers.unwrap_or_default();
    let copper = layer
        .map(str::to_owned)
        .or_else(|| names.iter().find(|name| name.ends_with(".Cu")).cloned());
    let exposed = match copper.as_deref() {
        Some("F.Cu") if names.iter().any(|name| name == "F.Mask") => Some("F.Mask"),
        Some("B.Cu") if names.iter().any(|name| name == "B.Mask") => Some("B.Mask"),
        _ => None,
    };
    (copper, exposed)
}

/// Tracks and track arcs in source order.
pub(crate) fn routes(segments: &[PcbSegment], arcs: &[PcbRoutingArc]) -> Vec<Route> {
    let tracks = segments.iter().map(|segment| {
        let uid = source_uid("track", segment.uuid.as_deref(), segment.source_range.start);
        let (layer, exposed) = route_layers(segment.layer.as_deref(), segment.layers.as_deref());
        Route {
            origin: Origin::routed(BindingSourceKind::Track, uid, net_key(&segment.net)),
            layer,
            width_mm: segment.width.unwrap_or(0.0),
            start: nm_point(segment.start_x, segment.start_y),
            segment: line(nm_point(segment.end_x, segment.end_y)),
            exposed,
            mask_margin: segment.solder_mask_margin,
            degenerate: false,
        }
    });
    let track_arcs = arcs.iter().map(|arc| {
        let uid = source_uid("track_arc", arc.uuid.as_deref(), arc.source_range.start);
        let (layer, exposed) = route_layers(arc.layer.as_deref(), arc.layers.as_deref());
        let (start, mid, end) = (pcb_point(arc.start), pcb_point(arc.mid), pcb_point(arc.end));
        let degenerate = circumcircle(&start, &mid, &end).is_none();
        let segment = if degenerate {
            line(end)
        } else {
            PathSegment::ArcSegment(ArcSegment {
                kind: "arc".to_owned(),
                mid_nm: mid,
                end_nm: end,
            })
        };
        Route {
            origin: Origin::routed(BindingSourceKind::TrackArc, uid, net_key(&arc.net)),
            layer,
            width_mm: arc.width.unwrap_or(0.0),
            start,
            segment,
            exposed,
            mask_margin: arc.solder_mask_margin,
            degenerate,
        }
    });
    tracks.chain(track_arcs).collect()
}

impl Route {
    /// The track's swept shape, widened by `grow_mm` on each side.
    pub(crate) fn shape(&self, grow_mm: f64) -> Shape2d {
        swept(
            self.start.clone(),
            self.segment.clone(),
            self.width_mm + 2.0 * grow_mm,
        )
    }
}

/// Copper of every track and track arc.
pub(crate) fn route_copper(routes: &[Route], stack: &CopperStack, emitter: &mut Emitter) {
    for route in routes {
        let uid = route.origin.uid.clone();
        let Some(layer) = route.layer.as_deref() else {
            emitter.warn(
                "track_layer_not_decoded",
                "track has no copper layer and is not materialized".to_owned(),
                Some(uid),
            );
            continue;
        };
        let Some(slice) = stack.key(layer) else {
            emitter.unknown_layers(&[layer], &uid);
            continue;
        };
        if route.width_mm <= 0.0 {
            emitter.warn(
                "track_without_width",
                "track has no positive width and is not materialized".to_owned(),
                Some(uid),
            );
            continue;
        }
        if route.degenerate {
            emitter.warn(
                "degenerate_arc",
                "collinear routing arc materialized as a straight path".to_owned(),
                Some(uid),
            );
        }
        emitter.copper(&route.origin, slice, route.shape(0.0), identity());
    }
}

/// Land diameter of a via on `layer`, honouring a per-layer via padstack.
fn via_diameter(via: &PcbVia, layer: &str) -> f64 {
    let Some(stack) = via.padstack.as_ref() else {
        return via.size;
    };
    let inner =
        stack.mode.as_deref() == Some("front_inner_back") && !matches!(layer, "F.Cu" | "B.Cu");
    let selector = if inner { "Inner" } else { layer };
    stack
        .layers
        .iter()
        .find(|row| row.layer == selector)
        .and_then(|row| row.size)
        .unwrap_or(via.size)
}

pub(crate) fn via_lands(
    vias: &[PcbVia],
    stack: &CopperStack,
    flash: &FlashLayers,
    emitter: &mut Emitter,
) {
    for via in vias {
        let uid = source_uid("via", via.uuid.as_deref(), via.source_range.start);
        let unknown = stack.unknown(&via.layers);
        if !unknown.is_empty() {
            emitter.unknown_layers(&unknown, &uid);
            continue;
        }
        let layers = flash
            .vias
            .get(&uid)
            .cloned()
            .unwrap_or_else(|| stack.expand(&via.layers));
        let source = Origin::routed(BindingSourceKind::Via, uid, net_key(&via.net));
        for layer in layers {
            let (Some(slice), diameter) = (stack.key(&layer), via_diameter(via, &layer)) else {
                continue;
            };
            if diameter <= 0.0 {
                continue;
            }
            let shape = Shape2d::Disk2d(Disk2d {
                kind: "disk_2d".to_owned(),
                center_nm: origin(),
                radius_nm: NonNegativeNm(i64::from(nm(diameter / 2.0))),
            });
            let affine = super::geometry::rotation_translation(0.0, via.at_x, via.at_y);
            emitter.copper(&source, slice, shape, affine);
        }
    }
}

/// First format whose stored zone fills are final. Older fills were
/// stroked at `min_thickness` unless `(filled_areas_thickness no)` says
/// otherwise, and KiCad grows them by half of it when loading.
const FIRST_UNSTROKED_FILLS: i64 = 20_250_210;

/// Round offset KiCad applies to the stored fills of `zone`.
pub(crate) fn fill_offset_nm(zone: &PcbZone, version: i64) -> i32 {
    let stroked = version < FIRST_UNSTROKED_FILLS
        && zone.keepout.is_none()
        && (!zone.has_filled_areas_thickness || zone.filled_areas_thickness);
    if stroked {
        nm(zone.min_thickness).max(0) / 2
    } else {
        0
    }
}

/// Stored zone fills, one planar region per filled polygon, grown as
/// [`fill_offset_nm`] says.
pub(crate) fn zone_fills(
    zones: &[&PcbZone],
    ids: &ZoneIds,
    stack: &CopperStack,
    version: i64,
    emitter: &mut Emitter,
) {
    for &zone in zones {
        let offset_nm = fill_offset_nm(zone, version);
        let uid = ids.uid(zone);
        let origin = Origin::routed(BindingSourceKind::ZoneFill, uid, net_key(&zone.net));
        for polygon in &zone.filled_polygons {
            let layer = match (polygon.layer.is_empty(), zone.layers.as_slice()) {
                (true, [only]) => only.as_str(),
                _ => polygon.layer.as_str(),
            };
            let Some(slice) = stack.key(layer) else {
                if layer.ends_with(".Cu") {
                    emitter.unknown_layers(&[layer], &origin.uid);
                }
                continue;
            };
            let points: Vec<_> = polygon
                .points
                .iter()
                .map(|point| pcb_point(*point))
                .collect();
            let Some(contour) = polyline_contour(points) else {
                continue;
            };
            let shape = Shape2d::PlanarRegion2d(PlanarRegion2d {
                kind: "planar_region_2d".to_owned(),
                outer: contour,
                holes: Vec::new(),
            });
            let material = Material {
                material: SurfaceMaterial::Copper,
                action: MaterialAction::Add,
                net_key: Some(origin.net_key.clone()),
                group_key: None,
            };
            emitter.offset_surface(&origin, slice, material, shape, identity(), offset_nm);
        }
    }
}

/// Closed contour of straight segments; consecutive duplicates and a
/// repeated closing point are dropped. `None` below three distinct points.
pub(crate) fn polyline_contour(mut points: Vec<NmPoint>) -> Option<Contour> {
    let raw = |point: &NmPoint| (*point.0[0], *point.0[1]);
    points.dedup_by(|a, b| raw(a) == raw(b));
    if points.len() > 1 && points.first().map(raw) == points.last().map(raw) {
        points.pop();
    }
    if points.len() < 3 {
        return None;
    }
    let mut iter = points.into_iter();
    let start = iter.next()?;
    Some(Contour {
        start_nm: start,
        segments: iter.map(line).collect(),
    })
}
