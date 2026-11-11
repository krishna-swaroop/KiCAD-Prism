//! Slice-4 record rules: effective net classes, binding pin and net-tie
//! facts, component pad groups, and hole post-machining.

use super::{Keys, check_optional_length, strictly_ascending};
use crate::generated::materialization_document::{
    Component, HoleOperation, MaterializationDocumentA1, PostMachiningMode,
};
use crate::{ValidationError, validation_error};
use std::collections::BTreeSet;

/// Class names are unique; a class lists its constituents, and a composite
/// is named by joining them with commas; every rule is a 32-bit length.
pub(super) fn validate_net_classes(
    document: &MaterializationDocumentA1,
) -> Result<(), ValidationError> {
    let mut names = BTreeSet::new();
    for (position, class) in document.net_classes.iter().enumerate() {
        let path = format!("$.net_classes[{position}]");
        if !names.insert(class.name.as_str()) {
            return Err(validation_error(
                "duplicate_net_class",
                format!("{path}.name"),
                "net class names are unique",
            ));
        }
        if class.constituents.is_empty() || class.constituents.join(",") != class.name {
            return Err(validation_error(
                "invalid_net_class_constituents",
                format!("{path}.constituents"),
                "a net class is named by its constituents joined with commas",
            ));
        }
        for (field, value) in [
            ("diff_pair_via_gap_nm", &class.diff_pair_via_gap_nm),
            ("microvia_diameter_nm", &class.microvia_diameter_nm),
            ("microvia_drill_nm", &class.microvia_drill_nm),
        ] {
            check_optional_length(value.as_ref(), &format!("{path}.{field}"))?;
        }
    }
    Ok(())
}

/// Tied nets are known, sorted, and distinct; pin facts are in range.
pub(super) fn validate_binding_records(
    document: &MaterializationDocumentA1,
    keys: &Keys<'_>,
) -> Result<(), ValidationError> {
    for (position, entry) in document.binding.iter().enumerate() {
        let path = format!("$.binding[{position}]");
        let known = entry
            .tied_net_keys
            .iter()
            .all(|key| keys.nets.contains(key.as_str()));
        if !known || !strictly_ascending(&entry.tied_net_keys) {
            return Err(validation_error(
                "invalid_tied_nets",
                format!("{path}.tied_net_keys"),
                "tied nets are known nets, sorted and distinct",
            ));
        }
        check_optional_length(
            entry.die_length_nm.as_ref(),
            &format!("{path}.die_length_nm"),
        )?;
        if entry
            .die_delay_ps
            .is_some_and(|delay| !delay.is_finite() || delay < 0.0)
        {
            return Err(validation_error(
                "invalid_die_delay",
                format!("{path}.die_delay_ps"),
                "a die delay is a finite, non-negative number of picoseconds",
            ));
        }
    }
    Ok(())
}

/// Each pad group lists distinct pad numbers.
pub(super) fn validate_pad_groups(
    component: &Component,
    path: &str,
) -> Result<(), ValidationError> {
    let groups = [
        ("net_tie_groups", &component.net_tie_groups),
        ("jumper_groups", &component.jumper_groups),
    ];
    for (field, list) in groups {
        for (position, group) in list.iter().enumerate() {
            let distinct: BTreeSet<&String> = group.pad_numbers.iter().collect();
            if group.pad_numbers.is_empty() || distinct.len() != group.pad_numbers.len() {
                return Err(validation_error(
                    "invalid_pad_group",
                    format!("{path}.{field}[{position}]"),
                    "a pad group lists distinct pad numbers, at least one",
                ));
            }
        }
    }
    Ok(())
}

/// Machining lengths are 32-bit lengths; a countersink angle lies strictly
/// between 0 and 180 degrees, and a counterbore has none; one entry per
/// side.
pub(super) fn validate_post_machining(
    hole: &HoleOperation,
    path: &str,
) -> Result<(), ValidationError> {
    let mut sides = BTreeSet::new();
    for (position, machining) in hole.post_machining.iter().enumerate() {
        let entry = format!("{path}.post_machining[{position}]");
        check_optional_length(
            machining.diameter_nm.as_ref(),
            &format!("{entry}.diameter_nm"),
        )?;
        check_optional_length(machining.depth_nm.as_ref(), &format!("{entry}.depth_nm"))?;
        let angle_ok = match (machining.mode, machining.angle_deg) {
            (_, None) => true,
            (PostMachiningMode::Countersink, Some(angle)) => angle > 0.0 && angle < 180.0,
            (PostMachiningMode::Counterbore, Some(_)) => false,
        };
        if !angle_ok || !sides.insert(machining.side as u8) {
            return Err(validation_error(
                "invalid_post_machining",
                entry,
                "one machining per side; only a countersink has an angle, between 0 and 180 \
                 degrees",
            ));
        }
    }
    Ok(())
}
