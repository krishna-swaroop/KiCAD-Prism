//! a1's design facts: rules and regions the producer has parsed that are not
//! material. They go into the document header, never into operations, so
//! viewers draw nothing new and fill comparisons count nothing new.
//!
//! - board rules from the project file: the arc-approximation error
//!   (`max_error`) and the copper-to-edge clearance;
//! - zones and rule areas ([`super::design_zones`]);
//! - pad and footprint zone rules where they differ from inheriting;
//! - courtyards per component and side, closed as the board profile is.

use super::design_zones::{ZoneInputs, zone_facts};
use super::emit::{Emitter, source_uid};
use super::geometry::length;
use super::profile::close_profile;
use super::source_graphics::graphic_layers;
use super::{MaterializationError, error};
use crate::pcb::{
    PcbFootprint, PcbFootprintGraphic, PcbPad, PcbPadstackLayer, PcbProfileOwner,
    PcbProfilePrimitive,
};
use crate::project::{ProjectDocument, ProjectLimits};
use prism_kicad_contracts::generated::materialization_document::{
    BoardSide, Courtyard, DesignFacts, FootprintRules, NonNegativeNm, PadConnection, PadRules,
    PadstackLayerRules,
};
use serde_json::Value;

/// Board rules read from the project file.
#[derive(Clone, Default)]
pub(crate) struct ProjectRules {
    max_error_nm: Option<NonNegativeNm>,
    copper_edge_clearance_nm: Option<NonNegativeNm>,
}

impl ProjectRules {
    /// `board.design_settings.rules` of a `.kicad_pro`: values the file
    /// does not state stay absent.
    pub(crate) fn from_project(source: &str) -> Result<Self, MaterializationError> {
        let document = ProjectDocument::parse(source.to_owned(), ProjectLimits::default())
            .map_err(|cause| error("project_parse", cause.to_string()))?;
        let view = document.view();
        let rule = |name: &str| {
            view.get_path(&format!("board.design_settings.rules.{name}"))
                .and_then(Value::as_f64)
                .filter(|value| value.is_finite() && *value >= 0.0)
                .map(length)
        };
        Ok(Self {
            max_error_nm: rule("max_error"),
            copper_edge_clearance_nm: rule("min_copper_edge_clearance"),
        })
    }
}

/// What the design facts are made from.
pub(crate) struct FactInputs<'a> {
    pub rules: &'a ProjectRules,
    pub zones: ZoneInputs<'a>,
    pub pads: &'a [PcbPad],
    pub graphics: &'a [PcbFootprintGraphic],
}

/// The design facts of one board. Courtyards that do not close are
/// reported on `emitter`.
pub(crate) fn design_facts(inputs: &FactInputs<'_>, emitter: &mut Emitter) -> DesignFacts {
    let footprints = inputs.zones.footprints;
    DesignFacts {
        max_error_nm: inputs.rules.max_error_nm.clone(),
        copper_edge_clearance_nm: inputs.rules.copper_edge_clearance_nm.clone(),
        zones: zone_facts(&inputs.zones),
        pad_rules: inputs.pads.iter().filter_map(pad_rules).collect(),
        footprint_rules: footprints.iter().filter_map(footprint_rules).collect(),
        courtyards: courtyards(footprints, inputs.graphics, emitter),
    }
}

/// KiCad's pad `zone_connect`: -1 (inherit) and unknown values are absent.
fn pad_connection(value: Option<i64>) -> Option<PadConnection> {
    match value? {
        0 => Some(PadConnection::None),
        1 => Some(PadConnection::ThermalReliefs),
        2 => Some(PadConnection::Solid),
        3 => Some(PadConnection::ThruHoleOnly),
        _ => None,
    }
}

fn finite(value: Option<f64>) -> Option<f64> {
    value.filter(|value| value.is_finite())
}

fn optional_length(value: Option<f64>) -> Option<NonNegativeNm> {
    finite(value).map(length)
}

fn layer_rules(layer: &PcbPadstackLayer) -> Option<PadstackLayerRules> {
    let rules = PadstackLayerRules {
        kicad_layer: layer.layer.clone(),
        clearance_nm: optional_length(layer.clearance),
        pad_connection: pad_connection(layer.zone_connect),
        thermal_gap_nm: optional_length(layer.thermal_gap),
        thermal_spoke_width_nm: optional_length(layer.thermal_bridge_width),
        thermal_spoke_angle_deg: finite(layer.thermal_bridge_angle),
    };
    let sets = rules.clearance_nm.is_some()
        || rules.pad_connection.is_some()
        || rules.thermal_gap_nm.is_some()
        || rules.thermal_spoke_width_nm.is_some()
        || rules.thermal_spoke_angle_deg.is_some();
    sets.then_some(rules)
}

/// The pad's own zone rules, `None` when it inherits every one.
fn pad_rules(pad: &PcbPad) -> Option<PadRules> {
    let layers: Vec<PadstackLayerRules> = pad
        .padstack
        .iter()
        .flat_map(|padstack| &padstack.layers)
        .filter_map(layer_rules)
        .collect();
    let rules = PadRules {
        source_uid: source_uid("pad", pad.uuid.as_deref(), pad.source_range.start),
        clearance_nm: optional_length(pad.clearance),
        pad_connection: pad_connection(pad.zone_connect),
        thermal_gap_nm: optional_length(pad.thermal_gap),
        thermal_spoke_width_nm: optional_length(pad.thermal_bridge_width),
        thermal_spoke_angle_deg: finite(pad.thermal_bridge_angle),
        layers,
    };
    let sets = rules.clearance_nm.is_some()
        || rules.pad_connection.is_some()
        || rules.thermal_gap_nm.is_some()
        || rules.thermal_spoke_width_nm.is_some()
        || rules.thermal_spoke_angle_deg.is_some()
        || !rules.layers.is_empty();
    sets.then_some(rules)
}

/// The footprint's zone rules for its pads, `None` when it sets none.
fn footprint_rules(footprint: &PcbFootprint) -> Option<FootprintRules> {
    let rules = FootprintRules {
        source_uid: source_uid(
            "footprint",
            footprint.uuid.as_deref(),
            footprint.source_range.start,
        ),
        clearance_nm: optional_length(footprint.clearance),
        pad_connection: pad_connection(footprint.zone_connect),
        thermal_gap_nm: optional_length(footprint.thermal_gap),
        thermal_spoke_width_nm: optional_length(footprint.thermal_width),
    };
    let sets = rules.clearance_nm.is_some()
        || rules.pad_connection.is_some()
        || rules.thermal_gap_nm.is_some()
        || rules.thermal_spoke_width_nm.is_some();
    sets.then_some(rules)
}

const COURTYARD_LAYERS: [(BoardSide, &str); 2] =
    [(BoardSide::Front, "F.CrtYd"), (BoardSide::Back, "B.CrtYd")];

/// Courtyards by component in file order, front before back.
fn courtyards(
    footprints: &[PcbFootprint],
    graphics: &[PcbFootprintGraphic],
    emitter: &mut Emitter,
) -> Vec<Courtyard> {
    let mut owned: Vec<Vec<&PcbFootprintGraphic>> = vec![Vec::new(); footprints.len()];
    for graphic in graphics {
        if let Some(list) = owned.get_mut(graphic.footprint_index) {
            list.push(graphic);
        }
    }
    let product = emitter.product.take();
    let mut result = Vec::new();
    for (index, (footprint, drawn)) in footprints.iter().zip(&owned).enumerate() {
        let uid = source_uid(
            "footprint",
            footprint.uuid.as_deref(),
            footprint.source_range.start,
        );
        for (side, layer) in COURTYARD_LAYERS {
            let primitives: Vec<PcbProfilePrimitive> = drawn
                .iter()
                .filter(|owned| graphic_layers(&owned.graphic).contains(&layer))
                .map(|owned| PcbProfilePrimitive {
                    owner: PcbProfileOwner::Footprint {
                        footprint_index: index,
                    },
                    graphic: owned.graphic.clone(),
                })
                .collect();
            if primitives.is_empty() {
                continue;
            }
            let closed = close_profile(&primitives, footprints);
            if closed.unclosed_edges > 0 || closed.regions.is_empty() {
                emitter.warn(
                    "courtyard_not_closed",
                    format!("{layer} of this footprint does not close into a loop"),
                    Some(uid.clone()),
                );
            }
            if !closed.regions.is_empty() {
                result.push(Courtyard {
                    source_uid: uid.clone(),
                    side,
                    regions: closed.regions,
                });
            }
        }
    }
    emitter.product = product;
    result
}
