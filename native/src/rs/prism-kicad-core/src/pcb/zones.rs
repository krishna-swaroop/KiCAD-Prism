//! Source-backed PCB zone records.
//!
//! KiCad stores both authored outlines and cached filled polygons in a zone.
//! This module exposes those facts without running a polygon kernel or
//! constructing the generic compatibility tree.

use super::*;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PcbZoneKeepout {
    /// Effective source settings; declaration flags distinguish omitted defaults.
    pub tracks: String,
    pub vias: String,
    pub pads: String,
    pub copperpour: String,
    pub footprints: String,
    pub has_tracks: bool,
    pub has_vias: bool,
    pub has_pads: bool,
    pub has_copperpour: bool,
    pub has_footprints: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PcbZonePlacementSource {
    SheetName,
    ComponentClass,
    Group,
}

impl PcbZonePlacementSource {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::SheetName => "sheetname",
            Self::ComponentClass => "component_class",
            Self::Group => "group",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PcbZonePlacement {
    pub enabled: bool,
    /// True only when `(enabled yes|no)` was authored. An absent declaration
    /// must not be interpreted as an explicitly disabled placement rule.
    pub has_enabled: bool,
    pub source_type: PcbZonePlacementSource,
    pub source: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PcbZoneLayerProperty {
    pub layer: String,
    pub hatch_offset: PcbPoint,
    pub source_range: Range<usize>,
}

/// An authored zone outline. `points` is its vertex chain; an `(arc (start)
/// (mid) (end))` element contributes its start and end vertices, and `arcs`
/// marks the edges between them as arcs through `mid`.
#[derive(Clone, Debug, PartialEq)]
pub struct PcbZonePolygon {
    pub points: Vec<PcbPoint>,
    pub arcs: Vec<PcbZoneOutlineArc>,
    pub source_range: Range<usize>,
}

/// The outline edge from `points[start_index]` to the next vertex is an arc
/// through `mid`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PcbZoneOutlineArc {
    pub start_index: usize,
    pub mid: PcbPoint,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PcbZoneFilledPolygon {
    pub layer: String,
    pub island: bool,
    pub points: Vec<PcbPoint>,
    pub source_range: Range<usize>,
}

/// Hatched-fill settings of a zone whose fill `(mode hatch)`; values the
/// file omits stay `None`. Read-only facts: the tokens stay listed in
/// [`PcbZone::unmodeled_fill_settings`], which zone rewriters check.
#[derive(Clone, Debug, PartialEq)]
pub struct PcbZoneHatchFill {
    pub thickness: Option<f64>,
    pub gap: Option<f64>,
    pub orientation: Option<f64>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PcbZone {
    pub net: PcbNetRef,
    /// Exact optional `(net_name ...)` source value, before board-net resolution.
    pub net_name: Option<String>,
    pub has_explicit_net_name: bool,
    pub layers: Vec<String>,
    pub layers_plural: bool,
    pub locked: bool,
    pub uuid: Option<String>,
    pub name: Option<String>,
    pub hatch_style: String,
    pub hatch_pitch: f64,
    pub priority: i64,
    pub connect_pads_mode: Option<String>,
    pub connect_pads_clearance: f64,
    pub min_thickness: f64,
    pub filled_areas_thickness: bool,
    /// Whether `(filled_areas_thickness ...)` is declared. Before format
    /// 20250210, fills without it were stroked at `min_thickness`.
    pub has_filled_areas_thickness: bool,
    pub fill_enabled: bool,
    pub thermal_gap: f64,
    pub thermal_bridge_width: f64,
    pub island_removal_mode: Option<i64>,
    pub island_area_min: Option<f64>,
    /// Fill corner smoothing (`(smoothing chamfer|fillet)`) as written;
    /// `None` without the token or for `none`. Like `corner_radius` and
    /// `hatch_fill`, a read-only fact also listed in
    /// `unmodeled_fill_settings`.
    pub corner_smoothing: Option<String>,
    /// Fill corner smoothing radius (`(radius ...)`) as written.
    pub corner_radius: Option<f64>,
    /// Present when the fill is hatched (`(mode hatch)`).
    pub hatch_fill: Option<PcbZoneHatchFill>,
    /// Explicit fill children whose semantics are not represented by the
    /// promoted typed fields. Consumers that rewrite zones must reject or
    /// deliberately map these tokens rather than assuming a solid fill.
    pub unmodeled_fill_settings: Vec<String>,
    pub keepout: Option<PcbZoneKeepout>,
    pub placement: Option<PcbZonePlacement>,
    pub layer_properties: Vec<PcbZoneLayerProperty>,
    pub polygons: Vec<PcbZonePolygon>,
    pub filled_polygons: Vec<PcbZoneFilledPolygon>,
    pub source_range: Range<usize>,
}

struct ZoneCollections {
    layer_properties: Vec<PcbZoneLayerProperty>,
    polygons: Vec<PcbZonePolygon>,
    filled_polygons: Vec<PcbZoneFilledPolygon>,
}

pub(super) fn zone_from_span(
    source: &str,
    span: &FormSpan,
    limits: PcbLimits,
) -> Result<PcbZone, Error> {
    let children = direct_children(source, span, limits.max_object_children, limits)?;
    let plural_layer_values = child(&children, "layers")
        .map(|item| bounded_scalar_values(source, item, limits.max_layers))
        .transpose()?;
    let layers_plural = plural_layer_values
        .as_ref()
        .is_some_and(|values| !values.is_empty());
    let layers = if let Some(values) = plural_layer_values.filter(|values| !values.is_empty()) {
        values.iter().map(token_string).collect()
    } else if let Some(layer) = optional_child_string(source, &children, "layer")? {
        vec![layer]
    } else {
        Vec::new()
    };

    let net_name_span = child(&children, "net_name");
    let net_name = net_name_span
        .map(|item| first_string(source, item))
        .transpose()?
        .flatten()
        .or_else(|| net_name_span.map(|_| String::new()));
    let mut net = child_net_ref_or_zero(source, &children)?;
    if let Some(explicit_name) = &net_name {
        net.name = Some(explicit_name.clone());
    }

    let hatch = child(&children, "hatch");
    let hatch_values = hatch
        .map(|item| bounded_scalar_values(source, item, 2))
        .transpose()?
        .unwrap_or_default();
    let connect_pads = child(&children, "connect_pads");
    let connect_pads_mode = connect_pads
        .map(|item| first_string(source, item))
        .transpose()?
        .flatten();
    let connect_pads_clearance = nested_f64(source, connect_pads, "clearance", 0.5, limits)?;
    let fill = child(&children, "fill");
    let fill_enabled = fill
        .map(|item| bounded_scalar_values(source, item, 1))
        .transpose()?
        .and_then(|values| values.first().map(token_string))
        .is_some_and(|value| value == "yes");
    let fill_children = fill
        .map(|item| direct_children(source, item, limits.max_object_children, limits))
        .transpose()?
        .unwrap_or_default();
    let unmodeled_fill_settings = unmodeled_fill_settings(source, &fill_children)?;

    let collections = zone_collections(source, &children, limits)?;

    Ok(PcbZone {
        net,
        net_name,
        has_explicit_net_name: net_name_span.is_some(),
        layers,
        layers_plural,
        locked: child_bool(source, &children, "locked")?,
        uuid: optional_uuid(source, &children)?,
        name: optional_child_string(source, &children, "name")?.filter(|name| !name.is_empty()),
        hatch_style: hatch_values
            .first()
            .map(token_string)
            .unwrap_or_else(|| "edge".to_owned()),
        hatch_pitch: optional_f64(hatch_values.get(1), hatch.unwrap_or(span))?.unwrap_or(0.5),
        priority: optional_child_i64(source, &children, "priority")?.unwrap_or(0),
        connect_pads_mode,
        connect_pads_clearance,
        min_thickness: optional_child_f64(source, &children, "min_thickness")?.unwrap_or(0.25),
        filled_areas_thickness: optional_child_string(source, &children, "filled_areas_thickness")?
            .is_some_and(|value| value == "yes"),
        has_filled_areas_thickness: child(&children, "filled_areas_thickness").is_some(),
        fill_enabled,
        thermal_gap: optional_child_f64(source, &fill_children, "thermal_gap")?.unwrap_or(0.5),
        thermal_bridge_width: optional_child_f64(source, &fill_children, "thermal_bridge_width")?
            .unwrap_or(0.5),
        island_removal_mode: optional_child_i64(source, &fill_children, "island_removal_mode")?,
        island_area_min: optional_child_f64(source, &fill_children, "island_area_min")?,
        corner_smoothing: optional_child_string(source, &fill_children, "smoothing")?
            .filter(|mode| mode != "none"),
        corner_radius: optional_child_f64(source, &fill_children, "radius")?,
        hatch_fill: hatch_fill(source, &fill_children)?,
        unmodeled_fill_settings,
        keepout: keepout_from_children(source, &children, limits)?,
        placement: placement_from_children(source, &children, limits)?,
        layer_properties: collections.layer_properties,
        polygons: collections.polygons,
        filled_polygons: collections.filled_polygons,
        source_range: span.range.clone(),
    })
}

fn hatch_fill(source: &str, children: &[FormSpan]) -> Result<Option<PcbZoneHatchFill>, Error> {
    if optional_child_string(source, children, "mode")?.as_deref() != Some("hatch") {
        return Ok(None);
    }
    Ok(Some(PcbZoneHatchFill {
        thickness: optional_child_f64(source, children, "hatch_thickness")?,
        gap: optional_child_f64(source, children, "hatch_gap")?,
        orientation: optional_child_f64(source, children, "hatch_orientation")?,
    }))
}

fn unmodeled_fill_settings(source: &str, children: &[FormSpan]) -> Result<Vec<String>, Error> {
    let mut result = Vec::new();
    for child in children {
        let Some(head) = child.head.as_deref() else {
            continue;
        };
        match head {
            "thermal_gap" | "thermal_bridge_width" | "island_removal_mode" | "island_area_min" => {}
            "mode" => {
                let mode = first_string(source, child)?.unwrap_or_default();
                if mode != "polygon" {
                    result.push(format!("mode={mode}"));
                }
            }
            _ => result.push(head.to_owned()),
        }
    }
    Ok(result)
}

fn zone_collections(
    source: &str,
    children: &[FormSpan],
    limits: PcbLimits,
) -> Result<ZoneCollections, Error> {
    let mut result = ZoneCollections {
        layer_properties: Vec::new(),
        polygons: Vec::new(),
        filled_polygons: Vec::new(),
    };
    let mut point_count = 0usize;
    for item in children {
        match item.head.as_deref() {
            Some("property") => {
                if let Some(property) = layer_property_from_span(source, item, limits)? {
                    bounded_push(
                        &mut result.layer_properties,
                        property,
                        limits.max_zone_layer_properties,
                    )?;
                }
            }
            Some("polygon") => {
                ensure_polygon_capacity(&result, limits)?;
                let mut arcs = Vec::new();
                let points = polygon_points(source, item, limits, &mut point_count, &mut arcs)?;
                result.polygons.push(PcbZonePolygon {
                    points,
                    arcs,
                    source_range: item.range.clone(),
                });
            }
            Some("filled_polygon") => {
                ensure_polygon_capacity(&result, limits)?;
                let item_children =
                    direct_children(source, item, limits.max_object_children, limits)?;
                result.filled_polygons.push(PcbZoneFilledPolygon {
                    layer: optional_child_string(source, &item_children, "layer")?
                        .unwrap_or_default(),
                    island: child(&item_children, "island").is_some(),
                    points: polygon_points_from_children(
                        source,
                        &item_children,
                        limits,
                        &mut point_count,
                        None,
                    )?,
                    source_range: item.range.clone(),
                });
            }
            _ => {}
        }
    }
    Ok(result)
}

fn ensure_polygon_capacity(result: &ZoneCollections, limits: PcbLimits) -> Result<(), Error> {
    if result
        .polygons
        .len()
        .saturating_add(result.filled_polygons.len())
        >= limits.max_zone_polygons
    {
        Err(Error::at(
            ErrorPhase::Tree,
            ErrorKind::ResourceLimit,
            "PCB zone polygons exceed max_zone_polygons",
            Position::START,
        ))
    } else {
        Ok(())
    }
}

fn nested_f64(
    source: &str,
    parent: Option<&FormSpan>,
    head: &str,
    default: f64,
    limits: PcbLimits,
) -> Result<f64, Error> {
    let Some(parent) = parent else {
        return Ok(default);
    };
    let children = direct_children(source, parent, limits.max_object_children, limits)?;
    Ok(optional_child_f64(source, &children, head)?.unwrap_or(default))
}

fn keepout_from_children(
    source: &str,
    children: &[FormSpan],
    limits: PcbLimits,
) -> Result<Option<PcbZoneKeepout>, Error> {
    let Some(keepout) = child(children, "keepout") else {
        return Ok(None);
    };
    let values = direct_children(source, keepout, limits.max_object_children, limits)?;
    let setting = |head, default: &str| {
        optional_child_string(source, &values, head)
            .map(|value| value.unwrap_or_else(|| default.to_owned()))
    };
    // KiCad 10.0.6 parseZONE's T_keepout branch initializes pads/footprints
    // to allowed for older source files where those two tokens are absent.
    Ok(Some(PcbZoneKeepout {
        tracks: setting("tracks", "not_allowed")?,
        vias: setting("vias", "not_allowed")?,
        pads: setting("pads", "allowed")?,
        copperpour: setting("copperpour", "not_allowed")?,
        footprints: setting("footprints", "allowed")?,
        has_tracks: child(&values, "tracks").is_some(),
        has_vias: child(&values, "vias").is_some(),
        has_pads: child(&values, "pads").is_some(),
        has_copperpour: child(&values, "copperpour").is_some(),
        has_footprints: child(&values, "footprints").is_some(),
    }))
}

fn placement_from_children(
    source: &str,
    children: &[FormSpan],
    limits: PcbLimits,
) -> Result<Option<PcbZonePlacement>, Error> {
    let mut placements = children
        .iter()
        .filter(|field| field.head.as_deref() == Some("placement"));
    let Some(placement) = placements.next() else {
        return Ok(None);
    };
    if placements.next().is_some() {
        return Err(source_error(
            "Repeated placement stanzas require ordered interpretation",
            placement.start,
        ));
    }
    let values = direct_children(source, placement, limits.max_object_children, limits)?;
    let (source_type, source_value) = if let Some(value) = child(&values, "sheetname") {
        (
            PcbZonePlacementSource::SheetName,
            first_string(source, value)?.unwrap_or_default(),
        )
    } else if let Some(value) = child(&values, "component_class") {
        (
            PcbZonePlacementSource::ComponentClass,
            first_string(source, value)?.unwrap_or_default(),
        )
    } else if let Some(value) = child(&values, "group") {
        (
            PcbZonePlacementSource::Group,
            first_string(source, value)?.unwrap_or_default(),
        )
    } else {
        (PcbZonePlacementSource::SheetName, String::new())
    };
    let mut has_enabled = false;
    let mut enabled_value = false;
    for field in values
        .iter()
        .filter(|field| field.head.as_deref() == Some("enabled"))
    {
        has_enabled = true;
        // KiCad applies repeated enabled declarations in source order. Do not
        // mistake a later active value for an earlier explicitly disabled one.
        enabled_value = match first_string(source, field)?.as_deref() {
            Some("yes") => true,
            Some("no") => false,
            _ => {
                return Err(source_error(
                    "Expected placement enabled yes or no",
                    field.start,
                ));
            }
        };
    }
    Ok(Some(PcbZonePlacement {
        enabled: enabled_value,
        has_enabled,
        source_type,
        source: source_value,
    }))
}

fn layer_property_from_span(
    source: &str,
    property: &FormSpan,
    limits: PcbLimits,
) -> Result<Option<PcbZoneLayerProperty>, Error> {
    let children = direct_children(source, property, limits.max_object_children, limits)?;
    let Some(hatch) = child(&children, "hatch_position") else {
        return Ok(None);
    };
    let hatch_children = direct_children(source, hatch, limits.max_object_children, limits)?;
    let Some(xy) = child(&hatch_children, "xy") else {
        return Ok(None);
    };
    let values = bounded_scalar_values(source, xy, 2)?;
    if values.len() < 2 {
        return Ok(None);
    }
    Ok(Some(PcbZoneLayerProperty {
        layer: optional_child_string(source, &children, "layer")?.unwrap_or_default(),
        hatch_offset: PcbPoint {
            x: required_f64(values.first(), "Expected zone hatch x", xy)?,
            y: required_f64(values.get(1), "Expected zone hatch y", xy)?,
        },
        source_range: property.range.clone(),
    }))
}

fn polygon_points(
    source: &str,
    polygon: &FormSpan,
    limits: PcbLimits,
    total: &mut usize,
    arcs: &mut Vec<PcbZoneOutlineArc>,
) -> Result<Vec<PcbPoint>, Error> {
    let children = direct_children(source, polygon, limits.max_object_children, limits)?;
    polygon_points_from_children(source, &children, limits, total, Some(arcs))
}

/// Points of a `(pts ...)` list. Outlines (`arcs` given) may hold arc
/// elements, as KiCad writes for rounded outlines; stored fills never do, so
/// there anything but `xy` stays an error.
fn polygon_points_from_children(
    source: &str,
    children: &[FormSpan],
    limits: PcbLimits,
    total: &mut usize,
    mut arcs: Option<&mut Vec<PcbZoneOutlineArc>>,
) -> Result<Vec<PcbPoint>, Error> {
    let Some(points) = child(children, "pts") else {
        return Ok(Vec::new());
    };
    let remaining = limits.max_zone_points.saturating_sub(*total);
    if let Some(decoded) = xy_points_single_pass(source, points, remaining) {
        *total += decoded.len();
        return Ok(decoded);
    }
    let point_spans = direct_children(source, points, remaining, limits).map_err(|error| {
        if error.kind == ErrorKind::ResourceLimit {
            Error::at(
                ErrorPhase::Tree,
                ErrorKind::ResourceLimit,
                "PCB zone points exceed max_zone_points",
                error.position.unwrap_or(Position::START),
            )
        } else {
            error
        }
    })?;
    let mut decoded = Vec::with_capacity(point_spans.len());
    for point in point_spans {
        match (point.head.as_deref(), arcs.as_deref_mut()) {
            (Some("xy"), _) => decoded.push(zone_point(
                source,
                &point,
                ("Expected zone point x", "Expected zone point y"),
            )?),
            (Some("arc"), Some(arcs)) => {
                let parts = direct_children(source, &point, 3, limits)?;
                let part = |name: &str| {
                    child(&parts, name).ok_or_else(|| {
                        source_error("Expected zone outline arc start, mid and end", point.start)
                    })
                };
                let start = zone_point(
                    source,
                    part("start")?,
                    ("Expected zone arc start x", "Expected zone arc start y"),
                )?;
                let mid = zone_point(
                    source,
                    part("mid")?,
                    ("Expected zone arc mid x", "Expected zone arc mid y"),
                )?;
                let end = zone_point(
                    source,
                    part("end")?,
                    ("Expected zone arc end x", "Expected zone arc end y"),
                )?;
                if decoded.last() != Some(&start) {
                    decoded.push(start);
                }
                arcs.push(PcbZoneOutlineArc {
                    start_index: decoded.len() - 1,
                    mid,
                });
                decoded.push(end);
            }
            _ => {
                return Err(source_error(
                    "Zone outlines hold XY and arc elements, and filled polygons only XY elements",
                    point.start,
                ));
            }
        }
    }
    *total += decoded.len();
    Ok(decoded)
}

fn zone_point(
    source: &str,
    point: &FormSpan,
    messages: (&'static str, &'static str),
) -> Result<PcbPoint, Error> {
    let values = bounded_scalar_values(source, point, 2)?;
    Ok(PcbPoint {
        x: required_f64(values.first(), messages.0, point)?,
        y: required_f64(values.get(1), messages.1, point)?,
    })
}

/// The common `(pts (xy x y) ...)` read in one lexer pass, without a span or
/// scalar list per point. `None` for anything else (another element, other
/// tokens, nesting, more than `remaining` points, a non-finite number), so
/// the general reader then gives its exact result or error.
fn xy_points_single_pass(source: &str, pts: &FormSpan, remaining: usize) -> Option<Vec<PcbPoint>> {
    let mut lexer = Lexer::new(pts.text(source).ok()?);
    let mut next = || lexer.next()?.ok();
    let head = (next()?, next()?);
    if head.0.kind != TokenKind::Left || head.1.lexeme != "pts" {
        return None;
    }
    let mut points = Vec::new();
    loop {
        let token = next()?;
        match token.kind {
            TokenKind::Right => break,
            TokenKind::Left if points.len() < remaining => {}
            _ => return None,
        }
        let (xy, x, y, close) = (next()?, next()?, next()?, next()?);
        let number = |token: &Token<'_>| {
            matches!(token.kind, TokenKind::Integer | TokenKind::Float)
                .then(|| token.lexeme.parse::<f64>().ok())
                .flatten()
                .filter(|value| value.is_finite())
        };
        if xy.kind != TokenKind::Atom || xy.lexeme != "xy" || close.kind != TokenKind::Right {
            return None;
        }
        points.push(PcbPoint {
            x: number(&x)?,
            y: number(&y)?,
        });
    }
    next().is_none().then_some(points)
}
