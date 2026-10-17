//! The visual targets of a connectivity change, before hydration:
//! `_net_bucket_targets`, `_terminal_visual_target` and
//! `_dedupe_visual_targets` (`design_compare_semantics.py`).

use super::super::{VisualRole, VisualSide, VisualStatus, VisualTarget};
use super::input::{Pair, View};
use prism_kicad_contracts::generated::prism_semantic_index_a2::SemanticIndexNet;
use std::collections::HashMap;

/// Which of a net's buckets become targets (`_net_bucket_targets`'s `buckets`).
#[derive(Clone, Copy)]
pub(super) enum Buckets {
    /// Wire, label, junction and terminal buckets.
    All,
    /// Only the label bucket.
    Labels,
}

impl Buckets {
    /// Whether the bucket drawn with `role` is selected.
    fn includes(self, role: VisualRole) -> bool {
        match self {
            Self::All => true,
            Self::Labels => role == VisualRole::Label,
        }
    }
}

/// One target per item of the net's selected buckets, in
/// `_net_bucket_targets`'s order: per sheet reference, then wire, label,
/// junction, terminal, then the bucket's order.
pub(super) fn net_bucket_targets(
    net: &SemanticIndexNet,
    side: VisualSide,
    status: VisualStatus,
    buckets: Buckets,
) -> Vec<VisualTarget> {
    let mut targets = Vec::new();
    for reference in &net.schematic_refs {
        let page = non_empty(reference.page.as_ref().map(|page| page.as_str()));
        let sheet_path = non_empty(
            reference
                .sheet_instance_path
                .as_ref()
                .map(|path| path.as_str()),
        );
        let buckets_of = [
            (&reference.wire_uuids, VisualRole::Wire),
            (&reference.label_uuids, VisualRole::Label),
            (&reference.junction_uuids, VisualRole::Junction),
            (&reference.pin_uuids, VisualRole::Terminal),
        ];
        for (uuids, role) in buckets_of {
            if !buckets.includes(role) {
                continue;
            }
            for uuid in uuids {
                let source_id = uuid.as_str();
                if source_id.is_empty() {
                    continue;
                }
                targets.push(target(side, status, source_id, page, sheet_path, role));
            }
        }
    }
    targets
}

/// The terminal target for one `(reference, pin)`: the pin's symbol and the
/// component's first occurrence (`_terminal_visual_target`).
pub(super) fn terminal_visual_target(
    view: &View,
    pair: Pair,
    side: VisualSide,
    status: VisualStatus,
) -> Option<VisualTarget> {
    let terminal = view
        .terminal_by_pair
        .get(&pair)
        .map(|&index| &view.semantic.terminals[index]);
    let pin_uuid = terminal
        .and_then(|terminal| terminal.schematic_pin_uuid.as_ref())
        .map(|uuid| uuid.as_str())
        .filter(|uuid| !uuid.is_empty());
    let parent = view
        .components
        .get(pair.0)
        .and_then(|component| non_empty(Some(component.symbol_uuid)));
    let (source_id, role) = match (pin_uuid, parent) {
        (Some(uuid), _) => (uuid, VisualRole::Terminal),
        (None, Some(uuid)) => (uuid, VisualRole::Component),
        (None, None) => return None,
    };
    let page = view
        .components
        .get(pair.0)
        .and_then(|component| non_empty(Some(component.page)));
    Some(VisualTarget {
        side,
        status,
        source_id: source_id.to_owned(),
        parent_source_id: parent.map(str::to_owned),
        kind: None,
        document_path: page.map(str::to_owned),
        sheet_path: None,
        at: None,
        role,
        reference: Some(pair.0.to_owned()),
        pin: Some(pair.1.to_owned()),
    })
}

/// `_dedupe_visual_targets`: drop a target with no source id; merge later
/// targets sharing `(side, status, sourceId, sheetPath)` by letting their
/// non-empty fields overwrite.
pub(super) fn dedupe(targets: Vec<VisualTarget>) -> Vec<VisualTarget> {
    let mut result: Vec<VisualTarget> = Vec::new();
    let mut positions: HashMap<(u8, u8, String, String), usize> = HashMap::new();
    for target in targets {
        if target.source_id.is_empty() {
            continue;
        }
        let key = (
            side_rank(target.side),
            status_rank(target.status),
            target.source_id.clone(),
            target.sheet_path.clone().unwrap_or_default(),
        );
        if let Some(&index) = positions.get(&key) {
            merge(&mut result[index], target);
            continue;
        }
        positions.insert(key, result.len());
        result.push(target);
    }
    result
}

/// Let a later target's non-empty fields overwrite the existing one's.
fn merge(existing: &mut VisualTarget, target: VisualTarget) {
    existing.role = target.role;
    merge_text(&mut existing.parent_source_id, target.parent_source_id);
    merge_text(&mut existing.kind, target.kind);
    merge_text(&mut existing.document_path, target.document_path);
    merge_text(&mut existing.reference, target.reference);
    merge_text(&mut existing.pin, target.pin);
}

/// The general target builder shared by [`net_bucket_targets`].
fn target(
    side: VisualSide,
    status: VisualStatus,
    source_id: &str,
    page: Option<&str>,
    sheet_path: Option<&str>,
    role: VisualRole,
) -> VisualTarget {
    VisualTarget {
        side,
        status,
        source_id: source_id.to_owned(),
        parent_source_id: None,
        kind: None,
        document_path: page.map(str::to_owned),
        sheet_path: sheet_path.map(str::to_owned),
        at: None,
        role,
        reference: None,
        pin: None,
    }
}

/// A native role name as a drawing role (`visualTargets[].role`).
pub(super) fn role_of(name: &str) -> VisualRole {
    match name {
        "wire" => VisualRole::Wire,
        "bus" => VisualRole::Bus,
        "bus_entry" => VisualRole::BusEntry,
        "label" => VisualRole::Label,
        "junction" => VisualRole::Junction,
        "terminal" => VisualRole::Terminal,
        "sheet" => VisualRole::Sheet,
        "bus_alias" => VisualRole::Bus,
        _ => VisualRole::Other,
    }
}

fn merge_text(slot: &mut Option<String>, value: Option<String>) {
    if value.as_ref().is_some_and(|text| !text.is_empty()) {
        *slot = value;
    }
}

fn non_empty(value: Option<&str>) -> Option<&str> {
    value.filter(|text| !text.is_empty())
}

fn side_rank(side: VisualSide) -> u8 {
    match side {
        VisualSide::Reference => 0,
        VisualSide::Comparison => 1,
    }
}

fn status_rank(status: VisualStatus) -> u8 {
    match status {
        VisualStatus::Added => 0,
        VisualStatus::Removed => 1,
        VisualStatus::Modified => 2,
    }
}
