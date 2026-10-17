//! Bus and sheet-instance changes of the Schematic tab
//! (`design_compare_semantics.py` `_semantic_structure_changes`): first-class
//! tier-1 changes for buses (net category) and concrete sheet instances
//! (sheets category). A structure with no native selectable object stays
//! indexed but manufactures no change.

use super::super::{ReviewChange, VisualRole, VisualSide, VisualStatus, VisualTarget};
use super::Kind;
use super::fields::{Fields, count_delta, optional_text_delta, text_delta};
use super::input::View;
use super::targets::role_of;
use prism_kicad_contracts::generated::prism_design_compare_result_a1 as dc;
use prism_kicad_contracts::generated::prism_semantic_index_a2::{
    SemanticIndexBus, SemanticIndexSheetInstance,
};
use std::collections::{BTreeMap, BTreeSet};

/// Bus changes, then sheet-instance changes.
pub(super) fn diff(base: &View, head: &View) -> Vec<ReviewChange> {
    let mut changes = bus_changes(base, head);
    changes.extend(sheet_changes(base, head));
    changes
}

// ---------------------------------------------------------------------- buses

fn bus_changes(base: &View, head: &View) -> Vec<ReviewChange> {
    let old = by_uid(&base.semantic.buses, bus_uid);
    let new = by_uid(&head.semantic.buses, bus_uid);
    let mut changes = Vec::new();
    for uid in uids(&old, &new) {
        let before = old.get(uid).map(|&index| &base.semantic.buses[index]);
        let after = new.get(uid).map(|&index| &head.semantic.buses[index]);
        if bus_equal(before, after) {
            continue;
        }
        if let Some(change) = bus_change(base, head, uid, before, after) {
            changes.push(change);
        }
    }
    changes
}

fn bus_change(
    base: &View,
    head: &View,
    uid: &str,
    before: Option<&SemanticIndexBus>,
    after: Option<&SemanticIndexBus>,
) -> Option<ReviewChange> {
    let kind = Kind::of(before.is_some(), after.is_some());
    let targets = bus_targets(before, after, kind);
    let page = first_page(&targets);
    if targets.is_empty() {
        return None;
    }
    let active = after.or(before)?;
    let fields = bus_fields(before, after, kind);
    let base_side = structure_side(base, bus_source_id(before), kind, true, page.as_deref());
    let head_side = structure_side(head, bus_source_id(after), kind, false, page.as_deref());
    let change = dc::DesignCompareChange {
        id: format!("sch-nets-{}-{}", kind.as_str(), uid),
        domain: dc::DesignCompareDomain::Schematic,
        kind: kind.as_dc(),
        category: dc::DesignCompareCategory::Nets,
        classification: dc::DesignCompareClassification::Primary,
        label: bus_label(active),
        object_kind: Some(bus_kind(active).replace('_', "-")),
        reference: None,
        net: None,
        semantic_id: Some(uid.to_owned()),
        page,
        reasons: vec![reason_for(kind, false)],
        fields: dc::RecordDesignCompareFieldDelta(fields),
        details: dc::DesignCompareChangeDetails::default(),
        base: base_side,
        head: head_side,
    };
    Some(ReviewChange {
        visual_targets: targets,
        change,
    })
}

fn bus_fields(
    before: Option<&SemanticIndexBus>,
    after: Option<&SemanticIndexBus>,
    kind: Kind,
) -> Fields {
    let mut fields = Fields::new();
    if kind == Kind::Changed {
        let old = canonical_json(before.expect("a changed bus has a base"));
        let new = canonical_json(after.expect("a changed bus has a head"));
        fields.insert("busContent".to_owned(), text_delta(&old, &new));
    } else {
        fields.insert(
            "instances".to_owned(),
            count_delta(u64::from(before.is_some()), u64::from(after.is_some())),
        );
    }
    fields
}

/// The bus targets, in `emit_collection`'s order: the base side first.
fn bus_targets(
    before: Option<&SemanticIndexBus>,
    after: Option<&SemanticIndexBus>,
    kind: Kind,
) -> Vec<VisualTarget> {
    let mut targets = Vec::new();
    if kind != Kind::Added {
        let status = if kind == Kind::Removed {
            VisualStatus::Removed
        } else {
            VisualStatus::Modified
        };
        if let Some(target) = bus_target(before, VisualSide::Reference, status) {
            targets.push(target);
        }
    }
    if kind != Kind::Removed {
        let status = if kind == Kind::Added {
            VisualStatus::Added
        } else {
            VisualStatus::Modified
        };
        if let Some(target) = bus_target(after, VisualSide::Comparison, status) {
            targets.push(target);
        }
    }
    targets
}

/// One bus target; a bus alias has no `sourceUuid`, so it has no target.
fn bus_target(
    bus: Option<&SemanticIndexBus>,
    side: VisualSide,
    status: VisualStatus,
) -> Option<VisualTarget> {
    let bus = bus?;
    let source = bus_source_id(Some(bus))?;
    Some(VisualTarget {
        side,
        status,
        source_id: source.to_owned(),
        parent_source_id: None,
        kind: Some(bus_kind(bus).to_owned()),
        document_path: text_option(Some(bus_page(bus))),
        sheet_path: text_option(Some(bus_sheet_path(bus))),
        at: None,
        role: role_of(bus_kind(bus)),
        reference: None,
        pin: None,
    })
}

fn bus_label(bus: &SemanticIndexBus) -> String {
    match bus {
        SemanticIndexBus::Alias(alias) if !alias.name.is_empty() => alias.name.clone(),
        _ => bus_kind(bus).to_owned(),
    }
}

fn bus_kind(bus: &SemanticIndexBus) -> &str {
    match bus {
        SemanticIndexBus::Wire(wire) => wire.kind.as_str(),
        SemanticIndexBus::Entry(entry) => entry.kind.as_str(),
        SemanticIndexBus::Alias(alias) => alias.kind.as_str(),
    }
}

fn bus_uid(bus: &SemanticIndexBus) -> &str {
    match bus {
        SemanticIndexBus::Wire(wire) => wire.bus_uid.as_str(),
        SemanticIndexBus::Entry(entry) => entry.bus_uid.as_str(),
        SemanticIndexBus::Alias(alias) => alias.bus_uid.as_str(),
    }
}

fn bus_page(bus: &SemanticIndexBus) -> &str {
    match bus {
        SemanticIndexBus::Wire(wire) => wire.page.as_str(),
        SemanticIndexBus::Entry(entry) => entry.page.as_str(),
        SemanticIndexBus::Alias(alias) => alias.page.as_str(),
    }
}

fn bus_sheet_path(bus: &SemanticIndexBus) -> &str {
    match bus {
        SemanticIndexBus::Wire(wire) => wire.sheet_instance_path.as_str(),
        SemanticIndexBus::Entry(entry) => entry.sheet_instance_path.as_str(),
        SemanticIndexBus::Alias(alias) => alias.sheet_instance_path.as_str(),
    }
}

/// A bus's `sourceUuid`; `None` on an alias (`emit_collection`'s target).
fn bus_source_id(bus: Option<&SemanticIndexBus>) -> Option<&str> {
    match bus? {
        SemanticIndexBus::Wire(wire) => Some(wire.source_uuid.as_str()),
        SemanticIndexBus::Entry(entry) => Some(entry.source_uuid.as_str()),
        SemanticIndexBus::Alias(_) => None,
    }
}

fn bus_equal(before: Option<&SemanticIndexBus>, after: Option<&SemanticIndexBus>) -> bool {
    match (before, after) {
        (Some(before), Some(after)) => bus_value(before) == bus_value(after),
        _ => false,
    }
}

fn bus_value(bus: &SemanticIndexBus) -> serde_json::Value {
    serde_json::to_value(bus).unwrap_or(serde_json::Value::Null)
}

fn canonical_json(bus: &SemanticIndexBus) -> String {
    crate::compare::canonical::canonical(&bus_value(bus))
}

// ------------------------------------------------------------ sheet instances

fn sheet_changes(base: &View, head: &View) -> Vec<ReviewChange> {
    let old = by_uid(&base.semantic.sheet_instances, sheet_uid);
    let new = by_uid(&head.semantic.sheet_instances, sheet_uid);
    let mut changes = Vec::new();
    for uid in uids(&old, &new) {
        let before = old
            .get(uid)
            .map(|&index| &base.semantic.sheet_instances[index]);
        let after = new
            .get(uid)
            .map(|&index| &head.semantic.sheet_instances[index]);
        if sheet_equal(before, after) {
            continue;
        }
        if let Some(change) = sheet_change(base, head, uid, before, after) {
            changes.push(change);
        }
    }
    changes
}

fn sheet_change(
    base: &View,
    head: &View,
    uid: &str,
    before: Option<&SemanticIndexSheetInstance>,
    after: Option<&SemanticIndexSheetInstance>,
) -> Option<ReviewChange> {
    let kind = Kind::of(before.is_some(), after.is_some());
    let targets = sheet_targets(before, after, kind);
    let page = first_page(&targets);
    if targets.is_empty() {
        return None;
    }
    let active = after.or(before)?;
    let base_side = structure_side(base, sheet_source(before), kind, true, page.as_deref());
    let head_side = structure_side(head, sheet_source(after), kind, false, page.as_deref());
    let change = dc::DesignCompareChange {
        id: format!("sch-sheets-{}-{}", kind.as_str(), uid),
        domain: dc::DesignCompareDomain::Schematic,
        kind: kind.as_dc(),
        category: dc::DesignCompareCategory::Sheets,
        classification: dc::DesignCompareClassification::Primary,
        label: sheet_label(active, uid),
        object_kind: Some("sheet".to_owned()),
        reference: None,
        net: None,
        semantic_id: Some(uid.to_owned()),
        page,
        reasons: vec![reason_for(kind, true)],
        fields: dc::RecordDesignCompareFieldDelta(sheet_fields(before, after)),
        details: dc::DesignCompareChangeDetails::default(),
        base: base_side,
        head: head_side,
    };
    Some(ReviewChange {
        visual_targets: targets,
        change,
    })
}

fn sheet_fields(
    before: Option<&SemanticIndexSheetInstance>,
    after: Option<&SemanticIndexSheetInstance>,
) -> Fields {
    let mut fields = Fields::new();
    for name in ["sheetPath", "sheetInstancePath", "page"] {
        let old = before.map(|instance| sheet_field(instance, name));
        let new = after.map(|instance| sheet_field(instance, name));
        if old != new {
            fields.insert(name.to_owned(), optional_text_delta(old, new));
        }
    }
    fields
}

fn sheet_field<'a>(instance: &'a SemanticIndexSheetInstance, name: &str) -> &'a str {
    match name {
        "sheetPath" => instance.sheet_path.as_str(),
        "sheetInstancePath" => instance.sheet_instance_path.as_str(),
        _ => instance.page.as_str(),
    }
}

fn sheet_targets(
    before: Option<&SemanticIndexSheetInstance>,
    after: Option<&SemanticIndexSheetInstance>,
    kind: Kind,
) -> Vec<VisualTarget> {
    let mut targets = Vec::new();
    if kind != Kind::Added
        && let Some(target) = sheet_target(before, kind, VisualSide::Reference)
    {
        targets.push(target);
    }
    if kind != Kind::Removed
        && let Some(target) = sheet_target(after, kind, VisualSide::Comparison)
    {
        targets.push(target);
    }
    targets
}

/// One sheet-instance target; the root sheet has no `sheetSymbolUuid`.
fn sheet_target(
    instance: Option<&SemanticIndexSheetInstance>,
    kind: Kind,
    side: VisualSide,
) -> Option<VisualTarget> {
    let instance = instance?;
    let source = sheet_source(Some(instance))?;
    let status = match kind {
        Kind::Added => VisualStatus::Added,
        Kind::Removed => VisualStatus::Removed,
        Kind::Changed => VisualStatus::Modified,
    };
    Some(VisualTarget {
        side,
        status,
        source_id: source.to_owned(),
        parent_source_id: None,
        kind: Some("sheet".to_owned()),
        document_path: text_option(instance.parent_page.as_ref().map(|page| page.as_str())),
        sheet_path: text_option(
            instance
                .parent_sheet_instance_path
                .as_ref()
                .map(|path| path.as_str()),
        ),
        at: None,
        role: VisualRole::Sheet,
        reference: None,
        pin: None,
    })
}

/// The sheet symbol that places the instance; `None` on the root sheet.
fn sheet_source(instance: Option<&SemanticIndexSheetInstance>) -> Option<&str> {
    instance?
        .sheet_symbol_uuid
        .as_ref()
        .map(|uuid| uuid.as_str())
        .filter(|uuid| !uuid.is_empty())
}

fn sheet_label(instance: &SemanticIndexSheetInstance, uid: &str) -> String {
    if instance.sheet_name.is_empty() {
        uid.to_owned()
    } else {
        instance.sheet_name.clone()
    }
}

fn sheet_equal(
    before: Option<&SemanticIndexSheetInstance>,
    after: Option<&SemanticIndexSheetInstance>,
) -> bool {
    match (before, after) {
        (Some(before), Some(after)) => {
            serde_json::to_value(before).unwrap_or(serde_json::Value::Null)
                == serde_json::to_value(after).unwrap_or(serde_json::Value::Null)
        }
        _ => false,
    }
}

fn sheet_uid(instance: &SemanticIndexSheetInstance) -> &str {
    instance.sheet_instance_uid.as_str()
}

// ------------------------------------------------------------------- shared

/// Positions by uid; a later duplicate overwrites (Python's dict comprehension).
fn by_uid<T>(items: &[T], uid: fn(&T) -> &str) -> BTreeMap<&str, usize> {
    let mut index = BTreeMap::new();
    for (position, item) in items.iter().enumerate() {
        index.insert(uid(item), position);
    }
    index
}

/// The union of both sides' uids, sorted in code point order.
fn uids<'a>(old: &BTreeMap<&'a str, usize>, new: &BTreeMap<&'a str, usize>) -> Vec<&'a str> {
    let mut uids: BTreeSet<&str> = old.keys().copied().collect();
    uids.extend(new.keys().copied());
    uids.into_iter().collect()
}

/// A structure change's side: the native entry when it exists (today's
/// converter fallback), else the change's page and no position.
fn structure_side(
    view: &View,
    source: Option<&str>,
    kind: Kind,
    base: bool,
    page: Option<&str>,
) -> Option<dc::DesignCompareChangeSide> {
    let source = source?;
    if (base && kind == Kind::Added) || (!base && kind == Kind::Removed) {
        return None;
    }
    let entry = view.native.get(source).copied();
    let document_path = entry
        .map(|entry| entry.document_path.as_str())
        .filter(|path| !path.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| page.unwrap_or("").to_owned());
    Some(dc::DesignCompareChangeSide {
        source_id: source.to_owned(),
        parent_source_id: entry
            .and_then(|entry| entry.parent_uuid.as_deref())
            .filter(|id| !id.is_empty())
            .map(|id| dc::KiCadUuid(id.to_owned())),
        document_path,
        layer: None,
        layers: Vec::new(),
        at: entry.and_then(|entry| entry.at).map(point_nm),
        reference: None,
        net: None,
    })
}

/// The reason of a structure change.
fn reason_for(kind: Kind, sheet_instance: bool) -> dc::DesignCompareReason {
    match kind {
        Kind::Added => dc::DesignCompareReason::ObjectAdded,
        Kind::Removed => dc::DesignCompareReason::ObjectRemoved,
        Kind::Changed if sheet_instance => dc::DesignCompareReason::SheetChanged,
        Kind::Changed => dc::DesignCompareReason::ContentChanged,
    }
}

/// The change's page: the first target's document.
fn first_page(targets: &[VisualTarget]) -> Option<String> {
    targets
        .iter()
        .find_map(|target| target.document_path.clone())
}

fn point_nm(at: [f64; 2]) -> dc::PointNm {
    dc::PointNm {
        x_nm: dc::Nanometres(nanometres(at[0])),
        y_nm: dc::Nanometres(nanometres(at[1])),
    }
}

fn nanometres(millimetres: f64) -> i64 {
    (millimetres * 1e6 + 0.5).floor() as i64
}

fn text_option(value: Option<&str>) -> Option<String> {
    value.filter(|text| !text.is_empty()).map(str::to_owned)
}
