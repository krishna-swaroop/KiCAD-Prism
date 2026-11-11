//! Zone and rule-area records of a1's design facts: every board zone on a
//! copper layer of the stack (copper zones and rule areas), and every rule
//! area a footprint owns, with the rules KiCad's zone filler reads and the
//! authored outline with its arcs. Nothing here becomes an operation.

use super::emit::source_uid;
use super::geometry::{footprint_affine, length, nm64, place};
use super::nets::net_key;
use super::stack::CopperStack;
use super::zone_ids::ZoneIds;
use crate::pcb::{
    PcbFootprint, PcbFootprintZone, PcbPoint, PcbZone, PcbZoneKeepout, PcbZonePolygon,
};
use prism_kicad_contracts::generated::materialization_document::{
    ArcSegment, Contour, CornerSmoothing, IslandRemoval, LineSegment, Nm, NmPoint, PadConnection,
    PathSegment, PlanarRegion2d, RuleAreaKeepouts, ZoneFacts, ZoneFillRules, ZoneHatchFill,
};

/// First board format whose footprint zones are stored in the footprint's
/// frame; before it they are in the board frame.
const FIRST_FOOTPRINT_FRAME_ZONES: i64 = 20_260_616;

/// What the zone records are made from.
pub(crate) struct ZoneInputs<'a> {
    /// Board zones on copper, in file order.
    pub zones: &'a [&'a PcbZone],
    /// Rule areas owned by footprints, in file order.
    pub footprint_zones: &'a [PcbFootprintZone],
    pub footprints: &'a [PcbFootprint],
    pub copper: &'a CopperStack,
    pub ids: &'a ZoneIds,
    pub version: i64,
}

/// Zone records in file order.
pub(crate) fn zone_facts(inputs: &ZoneInputs<'_>) -> Vec<ZoneFacts> {
    let board_frame = |point: PcbPoint| (nm64(point.x), nm64(point.y));
    let mut records: Vec<(usize, ZoneFacts)> = inputs
        .zones
        .iter()
        .filter_map(|zone| {
            let record = zone_record(zone, inputs, &board_frame)?;
            Some((zone.source_range.start, record))
        })
        .collect();
    for owned in inputs.footprint_zones {
        let Some(footprint) = inputs.footprints.get(owned.footprint_index) else {
            continue;
        };
        let affine = footprint_affine(footprint);
        let local = inputs.version >= FIRST_FOOTPRINT_FRAME_ZONES;
        let placed = |point: PcbPoint| {
            let (x, y) = board_frame(point);
            if local { place(&affine, x, y) } else { (x, y) }
        };
        if let Some(mut record) = zone_record(&owned.zone, inputs, &placed) {
            record.footprint_source_uid = Some(source_uid(
                "footprint",
                footprint.uuid.as_deref(),
                footprint.source_range.start,
            ));
            records.push((owned.zone.source_range.start, record));
        }
    }
    records.sort_by_key(|(start, _)| *start);
    records.into_iter().map(|(_, record)| record).collect()
}

fn zone_record(
    zone: &PcbZone,
    inputs: &ZoneInputs<'_>,
    place: &dyn Fn(PcbPoint) -> (i64, i64),
) -> Option<ZoneFacts> {
    let slice_keys: Vec<String> = inputs
        .copper
        .expand(&zone.layers)
        .iter()
        .filter_map(|layer| inputs.copper.key(layer).map(str::to_owned))
        .collect();
    if slice_keys.is_empty() {
        return None;
    }
    let mut contours = zone
        .polygons
        .iter()
        .filter_map(|polygon| contour(polygon, place));
    let outer = contours.next()?;
    let net = net_key(&zone.net);
    Some(ZoneFacts {
        source_uid: inputs.ids.uid(zone),
        name: zone.name.clone(),
        net_key: (!net.is_empty()).then_some(net),
        footprint_source_uid: None,
        slice_keys,
        priority: u32::try_from(zone.priority.max(0)).unwrap_or(u32::MAX),
        outline: PlanarRegion2d {
            kind: "planar_region_2d".to_owned(),
            outer,
            holes: contours.collect(),
        },
        fill: zone.keepout.is_none().then(|| fill_rules(zone)),
        keepout: zone.keepout.as_ref().map(keepouts),
    })
}

fn point((x, y): (i64, i64)) -> NmPoint {
    let clamp = |value: i64| Nm(value.clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32);
    NmPoint([clamp(x), clamp(y)])
}

/// The authored outline polygon, its arc edges kept. `None` without an edge.
fn contour(polygon: &PcbZonePolygon, place: &dyn Fn(PcbPoint) -> (i64, i64)) -> Option<Contour> {
    let (first, rest) = polygon.points.split_first()?;
    let segments: Vec<PathSegment> = rest
        .iter()
        .enumerate()
        .map(|(index, end)| {
            let end_nm = point(place(*end));
            match polygon.arcs.iter().find(|arc| arc.start_index == index) {
                Some(arc) => PathSegment::ArcSegment(ArcSegment {
                    kind: "arc".to_owned(),
                    mid_nm: point(place(arc.mid)),
                    end_nm,
                }),
                None => PathSegment::LineSegment(LineSegment {
                    kind: "line".to_owned(),
                    end_nm,
                }),
            }
        })
        .collect();
    (!segments.is_empty()).then(|| Contour {
        start_nm: point(place(*first)),
        segments,
    })
}

/// KiCad's `connect_pads` mode: none is thermal reliefs.
fn zone_connection(mode: Option<&str>) -> PadConnection {
    match mode {
        Some("yes" | "full") => PadConnection::Solid,
        Some("no") => PadConnection::None,
        Some("thru_hole_only") => PadConnection::ThruHoleOnly,
        _ => PadConnection::ThermalReliefs,
    }
}

fn island_removal(mode: Option<i64>) -> IslandRemoval {
    match mode {
        Some(1) => IslandRemoval::Never,
        Some(2) => IslandRemoval::BelowArea,
        _ => IslandRemoval::Always,
    }
}

fn fill_rules(zone: &PcbZone) -> ZoneFillRules {
    let smoothing = match zone.corner_smoothing.as_deref() {
        Some("chamfer") => Some(CornerSmoothing::Chamfer),
        Some("fillet") => Some(CornerSmoothing::Fillet),
        _ => None,
    };
    ZoneFillRules {
        clearance_nm: length(zone.connect_pads_clearance),
        min_width_nm: length(zone.min_thickness),
        pad_connection: zone_connection(zone.connect_pads_mode.as_deref()),
        thermal_gap_nm: length(zone.thermal_gap),
        thermal_spoke_width_nm: length(zone.thermal_bridge_width),
        island_removal: island_removal(zone.island_removal_mode),
        island_min_area_mm2: zone.island_area_min.filter(|area| area.is_finite()),
        corner_smoothing: smoothing,
        corner_radius_nm: smoothing.and(zone.corner_radius).map(length),
        hatch: zone.hatch_fill.as_ref().map(|hatch| ZoneHatchFill {
            thickness_nm: hatch.thickness.map(length),
            gap_nm: hatch.gap.map(length),
            orientation_deg: hatch.orientation.filter(|angle| angle.is_finite()),
        }),
    }
}

fn keepouts(keepout: &PcbZoneKeepout) -> RuleAreaKeepouts {
    let forbids = |setting: &str| setting == "not_allowed";
    RuleAreaKeepouts {
        tracks: forbids(&keepout.tracks),
        vias: forbids(&keepout.vias),
        pads: forbids(&keepout.pads),
        copper_pour: forbids(&keepout.copperpour),
        footprints: forbids(&keepout.footprints),
    }
}
