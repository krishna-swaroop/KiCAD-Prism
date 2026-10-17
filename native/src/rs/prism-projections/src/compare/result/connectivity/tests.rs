//! Unit tests for the connectivity and structure changes. The end-to-end
//! parity of the tab is the C2r harness's; these pin the rules and the visual
//! targets.

use super::super::{ReviewChange, VisualRole, VisualSide, VisualStatus, VisualTarget};
use super::input::View;
use super::targets::{self, Buckets};
use super::{nets, structure};
use crate::compare::entry::{self, Entry};
use prism_kicad_contracts::generated::prism_design_compare_result_a1 as dc;
use prism_kicad_contracts::generated::prism_occurrences_a0::OccurrencesA0;
use prism_kicad_contracts::generated::prism_semantic_index_a2::SemanticIndexA2;
use serde_json::{Value, json};

// ------------------------------------------------------------------ fixtures

/// An empty semantic index with the given arrays.
fn semantic(nets: Value, terminals: Value, sheets: Value, buses: Value) -> SemanticIndexA2 {
    serde_json::from_value(json!({
        "schema": "prism.semantic_index.a2",
        "designKey": "0".repeat(64),
        "components": [],
        "nets": nets,
        "terminals": terminals,
        "sheetInstances": sheets,
        "buses": buses,
        "indexes": {
            "componentByReference": {}, "componentBySchematicUuid": {},
            "componentByPcbFootprintUuid": {}, "terminalBySchematicPinUuid": {},
            "terminalByPcbPadUuid": {}, "terminalByReferencePin": {},
            "netByName": {}, "netByNetCode": {}, "netBySchematicUuid": {},
            "netByPcbUuid": {}, "sheetInstanceByPath": {}, "busByUid": {}
        },
        "assembly": {
            "schema": "prism.assembly_state_a0",
            "catalog": [], "footprintInventory": [],
            "default": {"occurrences": {}, "components": {}, "footprints": {}},
            "variants": [], "diagnostics": []
        }
    }))
    .expect("a valid semantic index")
}

fn net(
    name: &str,
    uid: &str,
    wires: Value,
    labels: Value,
    pins: Value,
    label_count: u64,
    aliases: Value,
) -> Value {
    json!({
        "netUid": uid,
        "name": name,
        "netClass": "Default",
        "aliases": aliases,
        "schematicRefs": [{
            "sheetInstancePath": "/root",
            "sheetPath": "/",
            "page": "root.kicad_sch",
            "wireUuids": wires,
            "labelUuids": labels,
            "junctionUuids": [],
            "pinUuids": pins,
            "labelInstanceCount": label_count
        }],
        "pcbRefs": [{"trackUuids": [], "arcUuids": [], "viaUuids": [], "zoneUuids": [], "padUuids": []}],
        "webgpuRefs": []
    })
}

/// A plain net with one wire, no labels and no pins.
fn simple_net(name: &str, uid: &str) -> Value {
    net(name, uid, json!(["w1"]), json!([]), json!([]), 0, json!([]))
}

fn terminal(reference: &str, pin: &str, schematic_name: &str, pin_uuid: Option<&str>) -> Value {
    let mut terminal = json!({
        "terminalUid": format!("term:{reference}\u{1f}{pin}"),
        "componentUid": format!("cmp:{reference}"),
        "reference": reference,
        "pin": pin,
        "netUid": format!("net:{schematic_name}"),
        "netName": schematic_name,
        "schematicNetName": schematic_name
    });
    if let Some(uuid) = pin_uuid {
        terminal["schematicPinUuid"] = json!(uuid);
    }
    terminal
}

fn sheet_instance(uid: &str, path: &str, sheet_path: &str, symbol: Option<&str>) -> Value {
    json!({
        "sheetInstanceUid": uid,
        "sheetInstancePath": path,
        "sheetPath": sheet_path,
        "page": "child.kicad_sch",
        "parentSheetInstancePath": "/root",
        "sheetSymbolUuid": symbol,
        "sheetName": "Payload Interface",
        "isTopLevel": false,
        "parentPage": "root.kicad_sch"
    })
}

fn bus_wire(uid: &str, source: &str) -> Value {
    json!({
        "kind": "bus", "busUid": uid, "sourceUuid": source,
        "sheetInstancePath": "/root", "sheetPath": "/", "page": "root.kicad_sch",
        "points": [[1.0, 2.0], [3.0, 4.0]], "at": null, "size": null
    })
}

fn bus_alias(uid: &str, name: &str, members: Value) -> Value {
    json!({
        "kind": "bus_alias", "busUid": uid, "name": name, "members": members,
        "sheetInstancePath": "/root", "sheetPath": "/", "page": "root.kicad_sch"
    })
}

fn occurrences(symbols: Value) -> OccurrencesA0 {
    serde_json::from_value(json!({
        "schema": "prism.occurrences.a0",
        "sheets": [], "symbols": symbols, "footprints": [],
        "references": [], "variantDeclarations": []
    }))
    .expect("valid occurrences")
}

fn symbol(reference: &str, symbol_uuid: &str, document_path: &str, lib_id: &str) -> Value {
    json!({
        "kiidPath": format!("/root/{symbol_uuid}"),
        "sheetPath": "/root",
        "symbolUuid": symbol_uuid,
        "documentPath": document_path,
        "libId": lib_id,
        "reference": reference,
        "instanceMatched": true,
        "unit": 1,
        "dnp": false,
        "excludeFromBom": false,
        "excludeFromBoard": false,
        "excludeFromSim": false,
        "excludeFromPosFiles": false,
        "properties": {},
        "bomFields": {},
        "variants": []
    })
}

fn entries(objects: Value) -> Vec<Entry> {
    let member = json!({
        "schema": "prism.board_objects.a0",
        "documents": [{"path": "root.kicad_sch", "objects": objects, "reviewOnlyObjects": []}]
    });
    entry::build(&member, "").expect("valid board objects")
}

fn number(value: &Option<dc::BoardObjectsReviewValue>) -> Option<f64> {
    match value {
        Some(dc::BoardObjectsReviewValue::Variant1(number)) => Some(*number),
        _ => None,
    }
}

fn text(value: &Option<dc::BoardObjectsReviewValue>) -> Option<&str> {
    match value {
        Some(dc::BoardObjectsReviewValue::Variant0(text)) => Some(text),
        _ => None,
    }
}

fn net_name(value: &Option<dc::NetName>) -> Option<&str> {
    value.as_ref().map(|net| net.as_str())
}

// ---------------------------------------------------------------------- nets

/// The changes of one added net with a wire, a label, a pin terminal and a
/// component occurrence.
fn added_net() -> Vec<ReviewChange> {
    let base = semantic(json!([]), json!([]), json!([]), json!([]));
    let head = semantic(
        json!([net(
            "VCC",
            "net:vcc",
            json!(["w1"]),
            json!(["l1"]),
            json!(["p1"]),
            1,
            json!([])
        )]),
        json!([terminal("R1", "1", "VCC", Some("p1"))]),
        json!([]),
        json!([]),
    );
    let base_occurrences = occurrences(json!([]));
    let head_occurrences = occurrences(json!([symbol("R1", "s1", "root.kicad_sch", "Device:R")]));
    let base_view = View::from_parts(&base, &base_occurrences, &[]);
    let head_view = View::from_parts(&head, &head_occurrences, &[]);
    nets::diff(&base_view, &head_view)
}

#[test]
fn an_added_net_has_net_identity() {
    let changes = added_net();
    assert_eq!(changes.len(), 1);
    let change = &changes[0].change;
    assert_eq!(change.id, "sch-net-added-net:vcc");
    assert_eq!(change.kind, dc::DesignCompareChangeKind::Added);
    assert_eq!(change.category, dc::DesignCompareCategory::Nets);
    assert_eq!(
        change.classification,
        dc::DesignCompareClassification::Primary
    );
    assert_eq!(change.label, "VCC");
}

#[test]
fn an_added_net_counts_instances_and_connections() {
    let change = &added_net()[0].change;
    assert_eq!(net_name(&change.net), Some("VCC"));
    assert_eq!(change.semantic_id.as_deref(), Some("net:vcc"));
    assert_eq!(number(&change.fields.0["instances"].old), Some(0.0));
    assert_eq!(number(&change.fields.0["instances"].new), Some(1.0));
    assert_eq!(number(&change.fields.0["connections"].old), Some(0.0));
    assert_eq!(number(&change.fields.0["connections"].new), Some(1.0));
}

#[test]
fn an_added_net_has_a_head_side_only() {
    let change = &added_net()[0].change;
    assert_eq!(change.page.as_deref(), Some("root.kicad_sch"));
    assert_eq!(change.reasons, vec![dc::DesignCompareReason::ObjectAdded]);
    assert!(change.base.is_none());
    // The head side is the first labelled item.
    let head_side = change.head.as_ref().unwrap();
    assert_eq!(head_side.source_id, "w1");
    assert_eq!(head_side.document_path, "root.kicad_sch");
    assert_eq!(net_name(&head_side.net), Some("VCC"));
}

#[test]
fn an_added_net_has_bucket_and_terminal_targets() {
    let targets = added_net()[0].visual_targets.clone();
    // Bucket targets (wire, label, terminal) and the terminal target.
    assert_eq!(targets.len(), 4);
    assert_eq!(targets[0].role, VisualRole::Wire);
    assert_eq!(targets[1].role, VisualRole::Label);
    assert_eq!(targets[2].role, VisualRole::Terminal);
    assert_eq!(targets[3].role, VisualRole::Terminal);
    assert_eq!(targets[3].reference.as_deref(), Some("R1"));
    assert_eq!(targets[3].pin.as_deref(), Some("1"));
}

#[test]
fn a_removed_net_only_has_its_base_side() {
    let base = semantic(
        json!([simple_net("GND", "net:gnd")]),
        json!([]),
        json!([]),
        json!([]),
    );
    let head = semantic(json!([]), json!([]), json!([]), json!([]));
    let base_occ = occurrences(json!([]));
    let head_occ = occurrences(json!([]));
    let base_view = View::from_parts(&base, &base_occ, &[]);
    let head_view = View::from_parts(&head, &head_occ, &[]);

    let changes = nets::diff(&base_view, &head_view);
    assert_eq!(changes.len(), 1);
    let change = &changes[0].change;
    assert_eq!(change.kind, dc::DesignCompareChangeKind::Removed);
    assert_eq!(change.reasons, vec![dc::DesignCompareReason::ObjectRemoved]);
    assert_eq!(number(&change.fields.0["instances"].old), Some(1.0));
    assert_eq!(number(&change.fields.0["instances"].new), Some(0.0));
    assert!(change.head.is_none());
    assert_eq!(change.base.as_ref().unwrap().source_id, "w1");
    assert_eq!(changes[0].visual_targets[0].side, VisualSide::Reference);
    assert_eq!(changes[0].visual_targets[0].status, VisualStatus::Removed);
}

#[test]
fn a_renamed_net_is_paired_by_connectivity_not_name() {
    let base = semantic(
        json!([net(
            "OLD",
            "net:old",
            json!(["w1"]),
            json!([]),
            json!(["p1"]),
            0,
            json!([])
        )]),
        json!([terminal("R1", "1", "OLD", Some("p1"))]),
        json!([]),
        json!([]),
    );
    let head = semantic(
        json!([net(
            "NEW",
            "net:new",
            json!(["w1"]),
            json!([]),
            json!(["p1"]),
            0,
            json!([])
        )]),
        json!([terminal("R1", "1", "NEW", Some("p1"))]),
        json!([]),
        json!([]),
    );
    let base_occ = occurrences(json!([symbol("R1", "s1", "root.kicad_sch", "Device:R")]));
    let head_occ = occurrences(json!([symbol("R1", "s1", "root.kicad_sch", "Device:R")]));
    let base_view = View::from_parts(&base, &base_occ, &[]);
    let head_view = View::from_parts(&head, &head_occ, &[]);

    let changes = nets::diff(&base_view, &head_view);
    assert_eq!(changes.len(), 1);
    let change = &changes[0].change;
    assert_eq!(change.id, "sch-net-changed-net:new");
    assert_eq!(change.label, "NEW");
    assert_eq!(change.reasons, vec![dc::DesignCompareReason::NetRenamed]);
    assert_eq!(text(&change.fields.0["name"].old), Some("OLD"));
    assert_eq!(text(&change.fields.0["name"].new), Some("NEW"));
    assert!(!change.fields.0.contains_key("connections"));
}

#[test]
fn a_rewired_net_reports_connectivity_delta_and_terminal_targets() {
    let base = semantic(
        json!([net(
            "N",
            "net:n",
            json!(["w1"]),
            json!([]),
            json!(["p1"]),
            0,
            json!([])
        )]),
        json!([
            terminal("R1", "1", "N", Some("p1")),
            terminal("R2", "2", "N", Some("p2"))
        ]),
        json!([]),
        json!([]),
    );
    let head = semantic(
        json!([net(
            "N",
            "net:n",
            json!(["w1"]),
            json!([]),
            json!(["p1"]),
            0,
            json!([])
        )]),
        json!([terminal("R1", "1", "N", Some("p1"))]),
        json!([]),
        json!([]),
    );
    let base_occ = occurrences(json!([
        symbol("R1", "s1", "root.kicad_sch", "Device:R"),
        symbol("R2", "s2", "root.kicad_sch", "Device:R")
    ]));
    let head_occ = occurrences(json!([symbol("R1", "s1", "root.kicad_sch", "Device:R")]));
    let base_view = View::from_parts(&base, &base_occ, &[]);
    let head_view = View::from_parts(&head, &head_occ, &[]);

    let changes = nets::diff(&base_view, &head_view);
    assert_eq!(changes.len(), 1);
    let change = &changes[0].change;
    assert_eq!(
        change.reasons,
        vec![dc::DesignCompareReason::ConnectivityChanged]
    );
    assert_eq!(number(&change.fields.0["connections"].old), Some(2.0));
    assert_eq!(number(&change.fields.0["connections"].new), Some(1.0));
    let connectivity = change.details.connectivity.as_ref().unwrap();
    assert!(connectivity.added_terminals.is_empty());
    assert_eq!(connectivity.removed_terminals, vec!["R2.2"]);
    // A pure connectivity change highlights the removed terminal only.
    assert_eq!(changes[0].visual_targets.len(), 1);
    assert_eq!(changes[0].visual_targets[0].status, VisualStatus::Removed);
    assert_eq!(
        changes[0].visual_targets[0].reference.as_deref(),
        Some("R2")
    );
}

#[test]
fn a_label_count_change_is_reported_in_fields_and_details() {
    let base = semantic(
        json!([net(
            "N",
            "net:n",
            json!(["w1"]),
            json!(["l1"]),
            json!([]),
            1,
            json!([])
        )]),
        json!([terminal("R1", "1", "N", Some("p1"))]),
        json!([]),
        json!([]),
    );
    let head = semantic(
        json!([net(
            "N",
            "net:n",
            json!(["w1", "w2"]),
            json!(["l1", "l2"]),
            json!([]),
            2,
            json!([])
        )]),
        json!([terminal("R1", "1", "N", Some("p1"))]),
        json!([]),
        json!([]),
    );
    let base_occ = occurrences(json!([symbol("R1", "s1", "root.kicad_sch", "Device:R")]));
    let head_occ = occurrences(json!([symbol("R1", "s1", "root.kicad_sch", "Device:R")]));
    let base_view = View::from_parts(&base, &base_occ, &[]);
    let head_view = View::from_parts(&head, &head_occ, &[]);

    let changes = nets::diff(&base_view, &head_view);
    assert_eq!(changes.len(), 1);
    let change = &changes[0].change;
    assert_eq!(
        change.reasons,
        vec![dc::DesignCompareReason::LabelCountChanged]
    );
    assert_eq!(number(&change.fields.0["labelInstances"].old), Some(1.0));
    assert_eq!(number(&change.fields.0["labelInstances"].new), Some(2.0));
    assert_eq!(change.details.label_instances.as_ref().unwrap().new.0, 2);
    // The base's lone label is paired with a head label and removed, so the
    // added head label `l2` remains a target.
    assert!(
        changes[0]
            .visual_targets
            .iter()
            .any(|target| target.source_id == "l2" && target.status == VisualStatus::Added)
    );
}

#[test]
fn a_bus_membership_change_joins_and_splits_aliases() {
    let base = semantic(
        json!([net(
            "N",
            "net:n",
            json!(["w1"]),
            json!([]),
            json!([]),
            0,
            json!(["B0"])
        )]),
        json!([]),
        json!([]),
        json!([]),
    );
    let head = semantic(
        json!([net(
            "N",
            "net:n",
            json!(["w1"]),
            json!([]),
            json!([]),
            0,
            json!(["B0", "B1"])
        )]),
        json!([]),
        json!([]),
        json!([]),
    );
    let base_occ = occurrences(json!([]));
    let head_occ = occurrences(json!([]));
    let base_view = View::from_parts(&base, &base_occ, &[]);
    let head_view = View::from_parts(&head, &head_occ, &[]);

    let changes = nets::diff(&base_view, &head_view);
    assert_eq!(changes.len(), 1);
    let change = &changes[0].change;
    assert_eq!(
        change.reasons,
        vec![dc::DesignCompareReason::BusMembershipChanged]
    );
    assert_eq!(text(&change.fields.0["busMembership"].old), Some("B0"));
    assert_eq!(text(&change.fields.0["busMembership"].new), Some("B0, B1"));
}

#[test]
fn connectivity_pairs_before_names_and_disambiguates_with_the_name() {
    // Two nets with the same single terminal on both sides: equal
    // fingerprints, disambiguated by name.
    let base = semantic(
        json!([
            net(
                "B",
                "net:b",
                json!(["wb"]),
                json!([]),
                json!(["pb"]),
                0,
                json!([])
            ),
            net(
                "A",
                "net:a",
                json!(["wa"]),
                json!([]),
                json!(["pa"]),
                0,
                json!([])
            )
        ]),
        json!([
            terminal("R1", "1", "A", Some("pa")),
            terminal("R2", "2", "B", Some("pb"))
        ]),
        json!([]),
        json!([]),
    );
    let head = semantic(
        json!([
            net(
                "A",
                "net:a",
                json!(["wa"]),
                json!([]),
                json!(["pa"]),
                0,
                json!([])
            ),
            net(
                "B",
                "net:b",
                json!(["wb"]),
                json!([]),
                json!(["pb"]),
                0,
                json!([])
            )
        ]),
        json!([
            terminal("R1", "1", "A", Some("pa")),
            terminal("R2", "2", "B", Some("pb"))
        ]),
        json!([]),
        json!([]),
    );
    let base_occ = occurrences(json!([]));
    let head_occ = occurrences(json!([]));
    let base_view = View::from_parts(&base, &base_occ, &[]);
    let head_view = View::from_parts(&head, &head_occ, &[]);
    // The pairings are on connectivity; the names match, so no change remains.
    assert!(nets::diff(&base_view, &head_view).is_empty());
}

#[test]
fn terminal_names_sort_as_strings_not_pairs() {
    // `A-1.1` sorts before `A.1` (`-` < `.`), the reverse of the pair order.
    let base = semantic(
        json!([net(
            "N",
            "net:n",
            json!(["w"]),
            json!([]),
            json!([]),
            0,
            json!([])
        )]),
        json!([terminal("A-1", "1", "N", Some("p1"))]),
        json!([]),
        json!([]),
    );
    let head = semantic(
        json!([net(
            "N",
            "net:n",
            json!(["w"]),
            json!([]),
            json!([]),
            0,
            json!([])
        )]),
        json!([
            terminal("A-1", "1", "N", Some("p1")),
            terminal("A", "1", "N", Some("p2"))
        ]),
        json!([]),
        json!([]),
    );
    let base_occ = occurrences(json!([]));
    let head_occ = occurrences(json!([]));
    let base_view = View::from_parts(&base, &base_occ, &[]);
    let head_view = View::from_parts(&head, &head_occ, &[]);
    let changes = nets::diff(&base_view, &head_view);
    let connectivity = changes[0].change.details.connectivity.as_ref().unwrap();
    assert_eq!(connectivity.added_terminals, vec!["A.1"]);
}

// ----------------------------------------------------------------- structure

#[test]
fn a_changed_sheet_instance_takes_its_native_position() {
    let base = semantic(
        json!([]),
        json!([]),
        json!([sheet_instance(
            "sheet-instance:x",
            "/root/sym",
            "/Old/",
            Some("sym")
        )]),
        json!([]),
    );
    let head = semantic(
        json!([]),
        json!([]),
        json!([sheet_instance(
            "sheet-instance:x",
            "/root/sym",
            "/New/",
            Some("sym")
        )]),
        json!([]),
    );
    let base_occ = occurrences(json!([]));
    let head_occ = occurrences(json!([]));
    let base_objects = entries(json!([{
        "kind": "sheet", "uuid": "sym", "contentDigest": "d",
        "at": {"xNm": 150000000, "yNm": 40000000}
    }]));
    let head_objects = entries(json!([{
        "kind": "sheet", "uuid": "sym", "contentDigest": "d",
        "at": {"xNm": 150000000, "yNm": 40000000}
    }]));
    let base_view = View::from_parts(&base, &base_occ, &base_objects);
    let head_view = View::from_parts(&head, &head_occ, &head_objects);

    let changes = structure::diff(&base_view, &head_view);
    assert_eq!(changes.len(), 1);
    let change = &changes[0].change;
    assert_eq!(change.id, "sch-sheets-changed-sheet-instance:x");
    assert_eq!(change.category, dc::DesignCompareCategory::Sheets);
    assert_eq!(change.object_kind.as_deref(), Some("sheet"));
    assert_eq!(change.label, "Payload Interface");
    assert_eq!(change.page.as_deref(), Some("root.kicad_sch"));
    assert_eq!(change.reasons, vec![dc::DesignCompareReason::SheetChanged]);
    assert_eq!(text(&change.fields.0["sheetPath"].old), Some("/Old/"));
    assert_eq!(text(&change.fields.0["sheetPath"].new), Some("/New/"));
    // The native entry's position fills both sides.
    let at = change.base.as_ref().unwrap().at.as_ref().unwrap();
    assert_eq!((at.x_nm.0, at.y_nm.0), (150_000_000, 40_000_000));
    assert_eq!(change.base.as_ref().unwrap().source_id, "sym");
    assert_eq!(
        change.base.as_ref().unwrap().document_path,
        "root.kicad_sch"
    );
}

#[test]
fn a_root_sheet_and_a_bus_alias_manufacture_no_change() {
    // No `sheetSymbolUuid` (root) and a bus alias (no `sourceUuid`) both get no
    // target, so they stay unrepresented.
    let base = semantic(
        json!([]),
        json!([]),
        json!([sheet_instance("sheet-instance:r", "/root", "/", None)]),
        json!([bus_alias("bus-alias:a", "AL", json!(["X"]))]),
    );
    let head = semantic(
        json!([]),
        json!([]),
        json!([sheet_instance(
            "sheet-instance:r",
            "/root/other",
            "/Root/",
            None
        )]),
        json!([bus_alias("bus-alias:a", "AL", json!(["X", "Y"]))]),
    );
    let base_occ = occurrences(json!([]));
    let head_occ = occurrences(json!([]));
    let base_view = View::from_parts(&base, &base_occ, &[]);
    let head_view = View::from_parts(&head, &head_occ, &[]);
    assert!(structure::diff(&base_view, &head_view).is_empty());
}

#[test]
fn a_changed_bus_writes_its_canonical_content() {
    let base = semantic(
        json!([]),
        json!([]),
        json!([]),
        json!([bus_wire("bus:b", "w1")]),
    );
    let mut moved = bus_wire("bus:b", "w1");
    moved["points"] = json!([[9.0, 9.0], [3.0, 4.0]]);
    let head = semantic(json!([]), json!([]), json!([]), json!([moved]));
    let base_occ = occurrences(json!([]));
    let head_occ = occurrences(json!([]));
    let base_view = View::from_parts(&base, &base_occ, &[]);
    let head_view = View::from_parts(&head, &head_occ, &[]);

    let changes = structure::diff(&base_view, &head_view);
    assert_eq!(changes.len(), 1);
    let change = &changes[0].change;
    assert_eq!(change.id, "sch-nets-changed-bus:b");
    assert_eq!(change.object_kind.as_deref(), Some("bus"));
    assert_eq!(
        change.reasons,
        vec![dc::DesignCompareReason::ContentChanged]
    );
    let old = text(&change.fields.0["busContent"].old).unwrap();
    assert!(old.contains("\"busUid\":\"bus:b\""));
    assert!(old.contains("\"kind\":\"bus\""));
    assert!(old.contains("[[1.0,2.0],[3.0,4.0]]"));
    assert_eq!(change.base.as_ref().unwrap().source_id, "w1");
}

#[test]
fn a_structure_side_without_a_native_entry_falls_back_to_the_page() {
    let base = semantic(
        json!([]),
        json!([]),
        json!([sheet_instance(
            "sheet-instance:x",
            "/root/sym",
            "/Old/",
            Some("missing")
        )]),
        json!([]),
    );
    let head = semantic(
        json!([]),
        json!([]),
        json!([sheet_instance(
            "sheet-instance:x",
            "/root/sym",
            "/New/",
            Some("missing")
        )]),
        json!([]),
    );
    let base_occ = occurrences(json!([]));
    let head_occ = occurrences(json!([]));
    let base_view = View::from_parts(&base, &base_occ, &[]);
    let head_view = View::from_parts(&head, &head_occ, &[]);
    let changes = structure::diff(&base_view, &head_view);
    let side = changes[0].change.base.as_ref().unwrap();
    assert_eq!(side.document_path, "root.kicad_sch");
    assert!(side.at.is_none());
    assert!(side.parent_source_id.is_none());
}

// ------------------------------------------------------------------ targets

#[test]
fn dedupe_merges_targets_sharing_source_and_sheet() {
    let target = |source: &str, sheet: Option<&str>, reference: Option<&str>| VisualTarget {
        side: VisualSide::Comparison,
        status: VisualStatus::Modified,
        source_id: source.to_owned(),
        parent_source_id: None,
        kind: None,
        document_path: None,
        sheet_path: sheet.map(str::to_owned),
        at: None,
        role: VisualRole::Terminal,
        reference: reference.map(str::to_owned),
        pin: None,
    };
    let merged = targets::dedupe(vec![
        target("u1", Some("/a"), None),
        target("u1", Some("/a"), Some("R1")),
        target("u2", Some("/a"), None),
        target("u1", Some("/b"), Some("R2")),
        target("", None, None),
    ]);
    assert_eq!(merged.len(), 3);
    // The later non-empty reference overwrites; `u1` on `/a` and `/b` differ.
    assert_eq!(merged[0].reference.as_deref(), Some("R1"));
    assert_eq!(merged[1].source_id, "u2");
    assert_eq!(merged[2].sheet_path.as_deref(), Some("/b"));
}

#[test]
fn net_bucket_targets_keep_the_bucket_order_and_only_labels_when_asked() {
    let net: prism_kicad_contracts::generated::prism_semantic_index_a2::SemanticIndexNet =
        serde_json::from_value(net(
            "N",
            "net:n",
            json!(["w"]),
            json!(["l"]),
            json!(["p"]),
            1,
            json!([]),
        ))
        .unwrap();
    let all = targets::net_bucket_targets(
        &net,
        VisualSide::Reference,
        VisualStatus::Modified,
        Buckets::All,
    );
    assert_eq!(
        all.iter().map(|target| target.role).collect::<Vec<_>>(),
        vec![VisualRole::Wire, VisualRole::Label, VisualRole::Terminal]
    );
    assert_eq!(all[0].document_path.as_deref(), Some("root.kicad_sch"));
    assert_eq!(all[0].sheet_path.as_deref(), Some("/root"));
    let labels = targets::net_bucket_targets(
        &net,
        VisualSide::Reference,
        VisualStatus::Removed,
        Buckets::Labels,
    );
    assert_eq!(labels.len(), 1);
    assert_eq!(labels[0].source_id, "l");
}

#[test]
fn a_power_symbol_is_not_a_component() {
    let occ = occurrences(json!([
        symbol("GND", "p1", "root.kicad_sch", "power:GND"),
        symbol("R1", "s1", "root.kicad_sch", "Device:R")
    ]));
    let index = semantic(
        json!([net(
            "N",
            "net:n",
            json!(["w"]),
            json!([]),
            json!([]),
            0,
            json!([])
        )]),
        json!([terminal("R1", "1", "N", Some("p1"))]),
        json!([]),
        json!([]),
    );
    let view = View::from_parts(&index, &occ, &[]);
    assert!(view.components.contains_key("R1"));
    assert!(!view.components.contains_key("GND"));
}
