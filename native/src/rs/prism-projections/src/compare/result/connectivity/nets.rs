//! The net changes of the Schematic tab (`design_compare_semantics.py`
//! `_diff_nets`): nets matched by connectivity, then by name, classified as
//! renamed, rewired, relabelled or bus-membership changes.

use super::super::{ReviewChange, VisualSide, VisualStatus, VisualTarget};
use super::Kind;
use super::fields::{Fields, count_delta, text_delta};
use super::input::{Fingerprint, Pair, View, terminal_name};
use super::pairing::{self, NetPair};
use super::targets::{self, Buckets};
use prism_kicad_contracts::generated::prism_design_compare_result_a1 as dc;
use prism_kicad_contracts::generated::prism_semantic_index_a2::SemanticIndexNet;
use std::collections::BTreeSet;

/// Why a net change counts, in classification order.
type Reasons = Vec<dc::DesignCompareReason>;

/// One review change per net pairing that carries a difference.
pub(super) fn diff(base: &View, head: &View) -> Vec<ReviewChange> {
    pairing::pair_nets(base, head)
        .into_iter()
        .filter_map(|pair| change(base, head, &pair))
        .collect()
}

fn change(base: &View, head: &View, pair: &NetPair) -> Option<ReviewChange> {
    let old = pair.base.map(|index| &base.semantic.nets[index]);
    let new = pair.head.map(|index| &head.semantic.nets[index]);
    let active = new.or(old)?;
    let old_pairs = pair
        .base
        .map_or_else(Fingerprint::new, |index| base.fingerprint(index));
    let new_pairs = pair
        .head
        .map_or_else(Fingerprint::new, |index| head.fingerprint(index));
    let (mut fields, mut reasons) = (Fields::new(), Reasons::new());
    let mut details = dc::DesignCompareChangeDetails::default();
    match (old, new) {
        (Some(old), Some(new)) => {
            if !matched(
                &mut fields,
                &mut reasons,
                &mut details,
                old,
                new,
                &old_pairs,
                &new_pairs,
            ) {
                return None;
            }
        }
        _ => instances(&mut fields, &mut reasons, pair, &old_pairs, &new_pairs),
    }
    let targets = visual_targets(base, head, pair, &old_pairs, &new_pairs, &reasons);
    let page = targets
        .iter()
        .find_map(|target| target.document_path.clone());
    let name = active.name.as_str();
    let kind = Kind::of(pair.base.is_some(), pair.head.is_some());
    let base_source = old.and_then(|net| net_source_id(base, net));
    let head_source = new.and_then(|net| net_source_id(head, net));
    let change = dc::DesignCompareChange {
        id: change_id(kind, active.net_uid.as_str(), name),
        domain: dc::DesignCompareDomain::Schematic,
        kind: kind.as_dc(),
        category: dc::DesignCompareCategory::Nets,
        classification: dc::DesignCompareClassification::Primary,
        label: name.to_owned(),
        object_kind: None,
        reference: None,
        net: name.parse().ok(),
        semantic_id: Some(active.net_uid.as_str().to_owned()),
        base: side(base_source, name, page.as_deref(), kind, true),
        head: side(head_source, name, page.as_deref(), kind, false),
        page,
        reasons,
        fields: dc::RecordDesignCompareFieldDelta(fields),
        details,
    };
    Some(ReviewChange {
        visual_targets: targets,
        change,
    })
}

/// The reasons, fields and details of a matched pair; `false` when nothing
/// changed (today's `continue`).
fn matched(
    fields: &mut Fields,
    reasons: &mut Reasons,
    details: &mut dc::DesignCompareChangeDetails,
    old: &SemanticIndexNet,
    new: &SemanticIndexNet,
    old_pairs: &Fingerprint,
    new_pairs: &Fingerprint,
) -> bool {
    if old.name.as_str() != new.name.as_str() {
        fields.insert(
            "name".to_owned(),
            text_delta(old.name.as_str(), new.name.as_str()),
        );
        reasons.push(dc::DesignCompareReason::NetRenamed);
    }
    if old_pairs != new_pairs {
        fields.insert(
            "connections".to_owned(),
            count_delta(old_pairs.len() as u64, new_pairs.len() as u64),
        );
        reasons.push(dc::DesignCompareReason::ConnectivityChanged);
        details.connectivity = Some(dc::DesignCompareConnectivity {
            added_terminals: terminal_names(new_pairs.difference(old_pairs).copied()),
            removed_terminals: terminal_names(old_pairs.difference(new_pairs).copied()),
        });
    }
    let old_labels = net_label_count(old);
    let new_labels = net_label_count(new);
    if old_labels != new_labels {
        fields.insert(
            "labelInstances".to_owned(),
            count_delta(old_labels, new_labels),
        );
        reasons.push(dc::DesignCompareReason::LabelCountChanged);
        details.label_instances = Some(dc::DesignCompareCountDelta {
            old: dc::Count(old_labels),
            new: dc::Count(new_labels),
        });
    }
    let old_aliases = sorted_aliases(old);
    let new_aliases = sorted_aliases(new);
    if old_aliases != new_aliases {
        fields.insert(
            "busMembership".to_owned(),
            text_delta(&old_aliases.join(", "), &new_aliases.join(", ")),
        );
        reasons.push(dc::DesignCompareReason::BusMembershipChanged);
    }
    !reasons.is_empty()
}

/// The fields and reasons of an added or removed net.
fn instances(
    fields: &mut Fields,
    reasons: &mut Reasons,
    pair: &NetPair,
    old_pairs: &Fingerprint,
    new_pairs: &Fingerprint,
) {
    match (pair.base, pair.head) {
        (None, Some(_)) => {
            fields.insert("instances".to_owned(), count_delta(0, 1));
            if !new_pairs.is_empty() {
                fields.insert(
                    "connections".to_owned(),
                    count_delta(0, new_pairs.len() as u64),
                );
            }
            reasons.push(dc::DesignCompareReason::ObjectAdded);
        }
        (Some(_), None) => {
            fields.insert("instances".to_owned(), count_delta(1, 0));
            if !old_pairs.is_empty() {
                fields.insert(
                    "connections".to_owned(),
                    count_delta(old_pairs.len() as u64, 0),
                );
            }
            reasons.push(dc::DesignCompareReason::ObjectRemoved);
        }
        _ => {}
    }
}

// -------------------------------------------------------------- visual targets

fn visual_targets(
    base: &View,
    head: &View,
    pair: &NetPair,
    old_pairs: &Fingerprint,
    new_pairs: &Fingerprint,
    reasons: &[dc::DesignCompareReason],
) -> Vec<VisualTarget> {
    let old = pair.base.map(|index| &base.semantic.nets[index]);
    let new = pair.head.map(|index| &head.semantic.nets[index]);
    let mut targets = Vec::new();
    match (pair.base, pair.head) {
        (None, _) => added_targets(head, new, new_pairs, &mut targets),
        (_, None) => removed_targets(base, old, old_pairs, &mut targets),
        _ => matched_targets(
            base,
            head,
            pair,
            old_pairs,
            new_pairs,
            reasons,
            &mut targets,
        ),
    }
    let mut targets = targets::dedupe(targets);
    if targets.is_empty() {
        fallback_targets(old, new, &mut targets);
        targets = targets::dedupe(targets);
    }
    targets
}

fn added_targets(
    head: &View,
    new: Option<&SemanticIndexNet>,
    new_pairs: &Fingerprint,
    targets: &mut Vec<VisualTarget>,
) {
    if let Some(net) = new {
        targets.extend(targets::net_bucket_targets(
            net,
            VisualSide::Comparison,
            VisualStatus::Added,
            Buckets::All,
        ));
    }
    targets.extend(new_pairs.iter().copied().filter_map(|pair| {
        targets::terminal_visual_target(head, pair, VisualSide::Comparison, VisualStatus::Added)
    }));
}

fn removed_targets(
    base: &View,
    old: Option<&SemanticIndexNet>,
    old_pairs: &Fingerprint,
    targets: &mut Vec<VisualTarget>,
) {
    if let Some(net) = old {
        targets.extend(targets::net_bucket_targets(
            net,
            VisualSide::Reference,
            VisualStatus::Removed,
            Buckets::All,
        ));
    }
    targets.extend(old_pairs.iter().copied().filter_map(|pair| {
        targets::terminal_visual_target(base, pair, VisualSide::Reference, VisualStatus::Removed)
    }));
}

fn matched_targets(
    base: &View,
    head: &View,
    pair: &NetPair,
    old_pairs: &Fingerprint,
    new_pairs: &Fingerprint,
    reasons: &[dc::DesignCompareReason],
    out: &mut Vec<VisualTarget>,
) {
    let old = pair.base.map(|index| &base.semantic.nets[index]);
    let new = pair.head.map(|index| &head.semantic.nets[index]);
    if reasons.contains(&dc::DesignCompareReason::NetRenamed) {
        modified_buckets(old, new, out);
    }
    if reasons.contains(&dc::DesignCompareReason::ConnectivityChanged) {
        out.extend(old_pairs.difference(new_pairs).copied().filter_map(|pair| {
            targets::terminal_visual_target(
                base,
                pair,
                VisualSide::Reference,
                VisualStatus::Removed,
            )
        }));
        out.extend(new_pairs.difference(old_pairs).copied().filter_map(|pair| {
            targets::terminal_visual_target(head, pair, VisualSide::Comparison, VisualStatus::Added)
        }));
    }
    if reasons.contains(&dc::DesignCompareReason::LabelCountChanged) {
        label_targets(old, new, out);
    }
    if reasons.contains(&dc::DesignCompareReason::BusMembershipChanged) {
        modified_buckets(old, new, out);
    }
}

fn modified_buckets(
    old: Option<&SemanticIndexNet>,
    new: Option<&SemanticIndexNet>,
    out: &mut Vec<VisualTarget>,
) {
    if let Some(net) = old {
        out.extend(targets::net_bucket_targets(
            net,
            VisualSide::Reference,
            VisualStatus::Modified,
            Buckets::All,
        ));
    }
    if let Some(net) = new {
        out.extend(targets::net_bucket_targets(
            net,
            VisualSide::Comparison,
            VisualStatus::Modified,
            Buckets::All,
        ));
    }
}

/// The labels only one side has (`label-count-changed`'s pairing subset).
fn label_targets(
    old: Option<&SemanticIndexNet>,
    new: Option<&SemanticIndexNet>,
    out: &mut Vec<VisualTarget>,
) {
    let old_labels = old.map_or_else(Vec::new, |net| {
        targets::net_bucket_targets(
            net,
            VisualSide::Reference,
            VisualStatus::Removed,
            Buckets::Labels,
        )
    });
    let new_labels = new.map_or_else(Vec::new, |net| {
        targets::net_bucket_targets(
            net,
            VisualSide::Comparison,
            VisualStatus::Added,
            Buckets::Labels,
        )
    });
    let new_ids: BTreeSet<String> = new_labels
        .iter()
        .map(|item| item.source_id.clone())
        .collect();
    let old_ids: BTreeSet<String> = old_labels
        .iter()
        .map(|item| item.source_id.clone())
        .collect();
    out.extend(
        old_labels
            .into_iter()
            .filter(|item| !new_ids.contains(&item.source_id)),
    );
    out.extend(
        new_labels
            .into_iter()
            .filter(|item| !old_ids.contains(&item.source_id)),
    );
}

fn fallback_targets(
    old: Option<&SemanticIndexNet>,
    new: Option<&SemanticIndexNet>,
    out: &mut Vec<VisualTarget>,
) {
    modified_buckets(old, new, out);
}

// ------------------------------------------------------------------- lookups

/// A native paint identity so net-owned geometry enters PROJECT_DIFF
/// (`_net_source_id`).
fn net_source_id<'a>(view: &'a View, net: &'a SemanticIndexNet) -> Option<&'a str> {
    for reference in &net.schematic_refs {
        let buckets = [
            &reference.wire_uuids,
            &reference.label_uuids,
            &reference.pin_uuids,
            &reference.junction_uuids,
        ];
        for bucket in buckets {
            for uuid in bucket {
                if !uuid.as_str().is_empty() {
                    return Some(uuid.as_str());
                }
            }
        }
    }
    for &index in &view.terminals {
        let terminal = &view.semantic.terminals[index];
        if terminal_name(terminal) == net.name.as_str()
            && let Some(uuid) = &terminal.schematic_pin_uuid
            && !uuid.as_str().is_empty()
        {
            return Some(uuid.as_str());
        }
    }
    None
}

/// The number of a net's labels (`_net_label_count`).
fn net_label_count(net: &SemanticIndexNet) -> u64 {
    net.schematic_refs
        .iter()
        .map(|reference| reference.label_instance_count.0)
        .sum()
}

/// A net's aliases, sorted in code point order.
fn sorted_aliases(net: &SemanticIndexNet) -> Vec<&str> {
    let mut aliases: Vec<&str> = net.aliases.as_ref().map_or_else(Vec::new, |aliases| {
        aliases.iter().map(|alias| alias.as_str()).collect()
    });
    aliases.sort_unstable();
    aliases
}

// --------------------------------------------------------------------- fields

/// `<reference>.<pin>` names, sorted in code point order (`_terminal_names`).
fn terminal_names<'a>(pairs: impl Iterator<Item = Pair<'a>>) -> Vec<String> {
    let mut names: Vec<String> = pairs
        .map(|(reference, pin)| format!("{reference}.{pin}"))
        .collect();
    names.sort_unstable();
    names
}

// ---------------------------------------------------------------------- ids

/// `sch-net-<kind>-<semanticId or name>`.
fn change_id(kind: Kind, semantic_id: &str, name: &str) -> String {
    let suffix = if semantic_id.is_empty() {
        name
    } else {
        semantic_id
    };
    format!("sch-net-{}-{}", kind.as_str(), suffix)
}

/// One net side (`_native_item` then the converter's `side`): the identity is
/// the net's source id, its page the change's, its net the name.
fn side(
    source: Option<&str>,
    name: &str,
    page: Option<&str>,
    kind: Kind,
    base: bool,
) -> Option<dc::DesignCompareChangeSide> {
    if source.is_none() || (base && kind == Kind::Added) || (!base && kind == Kind::Removed) {
        return None;
    }
    Some(dc::DesignCompareChangeSide {
        source_id: source?.to_owned(),
        parent_source_id: None,
        document_path: page.unwrap_or("").to_owned(),
        layer: None,
        layers: Vec::new(),
        at: None,
        reference: None,
        net: name.parse().ok(),
    })
}
