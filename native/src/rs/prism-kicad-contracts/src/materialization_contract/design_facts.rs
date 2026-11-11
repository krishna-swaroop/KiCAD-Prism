//! Rules of a1's `design_facts`: present exactly in a1, lengths in range,
//! zones with unique source UIDs on known conductor slices in stack order,
//! known nets, valid outlines, and exactly one of fill rules and keep-outs.

use super::shapes::validate_shape;
use super::{Keys, check_length, check_optional_length};
use crate::generated::materialization_document::{
    DesignFacts, MaterializationDocumentA1, NonNegativeNm, PadstackLayerRules, PlanarRegion2d,
    Shape2d, SliceRole, ZoneFacts,
};
use crate::{ValidationError, validation_error};
use std::collections::BTreeSet;

/// The a1 facts are present exactly when the document is a1.
pub(super) fn validate_design_facts(
    document: &MaterializationDocumentA1,
    keys: &Keys<'_>,
    a1: bool,
) -> Result<(), ValidationError> {
    let Some(facts) = &document.design_facts else {
        return if a1 {
            Err(validation_error(
                "missing_design_facts",
                "$.design_facts",
                "an a1 document carries design_facts",
            ))
        } else {
            Ok(())
        };
    };
    if !a1 {
        return Err(validation_error(
            "unexpected_design_facts",
            "$.design_facts",
            "an a0 document has no design_facts",
        ));
    }
    check_optional_length(facts.max_error_nm.as_ref(), "$.design_facts.max_error_nm")?;
    check_optional_length(
        facts.copper_edge_clearance_nm.as_ref(),
        "$.design_facts.copper_edge_clearance_nm",
    )?;
    validate_zones(facts, keys)?;
    validate_rules(facts)?;
    validate_courtyards(facts)
}

fn validate_zones(facts: &DesignFacts, keys: &Keys<'_>) -> Result<(), ValidationError> {
    let mut uids = BTreeSet::new();
    for (position, zone) in facts.zones.iter().enumerate() {
        let path = format!("$.design_facts.zones[{position}]");
        if !uids.insert(zone.source_uid.as_str()) {
            return Err(validation_error(
                "duplicate_zone",
                format!("{path}.source_uid"),
                "zone source UIDs are unique",
            ));
        }
        if zone
            .net_key
            .as_deref()
            .is_some_and(|net| !keys.nets.contains(net))
        {
            return Err(validation_error(
                "unknown_net",
                format!("{path}.net_key"),
                "a zone's net is listed in nets",
            ));
        }
        check_zone_slices(zone, keys, &path)?;
        check_region(&zone.outline, &format!("{path}.outline"))?;
        check_zone_kind(zone, &path)?;
    }
    Ok(())
}

fn check_zone_slices(zone: &ZoneFacts, keys: &Keys<'_>, path: &str) -> Result<(), ValidationError> {
    let orders = zone
        .slice_keys
        .iter()
        .map(|key| match keys.slices.get(key.as_str()) {
            Some((order, SliceRole::Conductor)) => Some(*order),
            _ => None,
        })
        .collect::<Option<Vec<u32>>>()
        .filter(|orders| !orders.is_empty() && orders.windows(2).all(|p| p[0] < p[1]));
    if orders.is_none() {
        return Err(validation_error(
            "invalid_zone_slices",
            format!("{path}.slice_keys"),
            "a zone lists known conductor slices, at least one, in stack order",
        ));
    }
    Ok(())
}

fn check_zone_kind(zone: &ZoneFacts, path: &str) -> Result<(), ValidationError> {
    match (&zone.fill, &zone.keepout) {
        (Some(fill), None) => {
            for (field, value) in [
                ("clearance_nm", &fill.clearance_nm),
                ("min_width_nm", &fill.min_width_nm),
                ("thermal_gap_nm", &fill.thermal_gap_nm),
                ("thermal_spoke_width_nm", &fill.thermal_spoke_width_nm),
            ] {
                check_length(**value, &format!("{path}.fill.{field}"))?;
            }
            check_optional_length(
                fill.corner_radius_nm.as_ref(),
                &format!("{path}.fill.corner_radius_nm"),
            )?;
            if let Some(hatch) = &fill.hatch {
                check_optional_length(hatch.thickness_nm.as_ref(), &format!("{path}.fill.hatch"))?;
                check_optional_length(hatch.gap_nm.as_ref(), &format!("{path}.fill.hatch"))?;
            }
            Ok(())
        }
        (None, Some(_)) => Ok(()),
        _ => Err(validation_error(
            "invalid_zone_kind",
            path.to_owned(),
            "a zone has fill rules or keep-outs, never both or neither",
        )),
    }
}

fn check_region(region: &PlanarRegion2d, path: &str) -> Result<(), ValidationError> {
    validate_shape(&Shape2d::PlanarRegion2d(region.clone()), path)
}

/// Pad, padstack-layer, and footprint rule lengths are in range, and each
/// record is keyed once.
fn validate_rules(facts: &DesignFacts) -> Result<(), ValidationError> {
    let mut pads = BTreeSet::new();
    for (position, pad) in facts.pad_rules.iter().enumerate() {
        let path = format!("$.design_facts.pad_rules[{position}]");
        unique(&mut pads, &pad.source_uid, &path)?;
        check_rule_lengths(
            [
                &pad.clearance_nm,
                &pad.thermal_gap_nm,
                &pad.thermal_spoke_width_nm,
            ],
            &path,
        )?;
        for (index, layer) in pad.layers.iter().enumerate() {
            check_layer(layer, &format!("{path}.layers[{index}]"))?;
        }
    }
    let mut footprints = BTreeSet::new();
    for (position, footprint) in facts.footprint_rules.iter().enumerate() {
        let path = format!("$.design_facts.footprint_rules[{position}]");
        unique(&mut footprints, &footprint.source_uid, &path)?;
        check_rule_lengths(
            [
                &footprint.clearance_nm,
                &footprint.thermal_gap_nm,
                &footprint.thermal_spoke_width_nm,
            ],
            &path,
        )?;
    }
    Ok(())
}

fn check_layer(layer: &PadstackLayerRules, path: &str) -> Result<(), ValidationError> {
    check_rule_lengths(
        [
            &layer.clearance_nm,
            &layer.thermal_gap_nm,
            &layer.thermal_spoke_width_nm,
        ],
        path,
    )
}

fn check_rule_lengths(
    values: [&Option<NonNegativeNm>; 3],
    path: &str,
) -> Result<(), ValidationError> {
    for value in values {
        check_optional_length(value.as_ref(), path)?;
    }
    Ok(())
}

fn unique<'a>(
    seen: &mut BTreeSet<&'a str>,
    uid: &'a str,
    path: &str,
) -> Result<(), ValidationError> {
    if seen.insert(uid) {
        Ok(())
    } else {
        Err(validation_error(
            "duplicate_rule_record",
            format!("{path}.source_uid"),
            "pad and footprint rule records are keyed once",
        ))
    }
}

fn validate_courtyards(facts: &DesignFacts) -> Result<(), ValidationError> {
    let mut seen = BTreeSet::new();
    for (position, courtyard) in facts.courtyards.iter().enumerate() {
        let path = format!("$.design_facts.courtyards[{position}]");
        if !seen.insert((courtyard.source_uid.as_str(), courtyard.side)) {
            return Err(validation_error(
                "duplicate_courtyard",
                path,
                "a component has at most one courtyard per side",
            ));
        }
        for (index, region) in courtyard.regions.iter().enumerate() {
            check_region(region, &format!("{path}.regions[{index}]"))?;
        }
    }
    Ok(())
}
