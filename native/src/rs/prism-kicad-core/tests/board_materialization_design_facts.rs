//! a1's design facts on committed fixtures: zones with thermal reliefs and
//! their rules (USB-PD), a keep-out rule area (the docs oracle), pads and
//! footprints with local clearances, courtyards, the project's board rules,
//! unique zone UIDs on a board with a nil and a repeated zone UUID, and that
//! the facts add no operation.

use prism_kicad_contracts::generated::materialization_document::{
    BoardSide, DesignFacts, IslandRemoval, MaterializationDocumentA1, PadConnection, PathSegment,
    ZoneFacts,
};
use prism_kicad_contracts::generated::materialization_request::MaterializationRequestA0;
use prism_kicad_contracts::materialization_contract::validate_materialization_document;
use prism_kicad_core::board_materialization::materialize_project;
use serde_json::json;
use std::path::PathBuf;

fn repository() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../..")
}

fn read(relative: &str) -> String {
    std::fs::read_to_string(repository().join(relative)).expect(relative)
}

const USB_PD: &str = "fixtures/release-studio/usb-pd/USB-PD-Trigger-Board";
const ORACLE: &str = "native/parity/docs-oracle/board/oracle";

fn request(products: &[&str]) -> MaterializationRequestA0 {
    serde_json::from_value(json!({
        "type": "kicad_monkey.materialization.request",
        "version": "a0",
        "products": products,
        "tile_size_nm": 10_000_000,
        "max_source_bytes": "100000000",
        "max_operations": 10_000_000,
        "max_points": 500_000_000u32,
    }))
    .expect("request")
}

const ALL: [&str; 7] = [
    "components",
    "copper",
    "dielectric",
    "holes",
    "paste",
    "silkscreen",
    "solder_mask",
];

fn materialize(board: &str, project: Option<&str>, products: &[&str]) -> MaterializationDocumentA1 {
    let document = materialize_project(board, project, &request(products)).expect("materialize");
    validate_materialization_document(&document).expect("valid a1");
    document
}

fn facts(document: &MaterializationDocumentA1) -> &DesignFacts {
    document
        .design_facts
        .as_ref()
        .expect("a1 carries design facts")
}

fn zone<'a>(facts: &'a DesignFacts, uid: &str) -> &'a ZoneFacts {
    facts
        .zones
        .iter()
        .find(|zone| zone.source_uid == uid)
        .expect(uid)
}

/// `(connect_pads yes (clearance 0.127))`, priority 1, on F.Cu.
fn assert_solid_zone(facts: &DesignFacts) {
    let solid = zone(facts, "99675cdc-18a1-4553-8352-48384972912b");
    let fill = solid.fill.as_ref().expect("a copper zone");
    assert_eq!(solid.priority, 1);
    assert_eq!(solid.slice_keys, ["copper.front"]);
    assert_eq!(solid.net_key.as_deref(), Some("VCC_USB_PD_IN"));
    assert!(solid.keepout.is_none());
    assert_eq!(fill.pad_connection, PadConnection::Solid);
    assert_eq!(
        [
            fill.clearance_nm.0,
            fill.min_width_nm.0,
            fill.thermal_gap_nm.0,
            fill.thermal_spoke_width_nm.0
        ],
        [127_000, 250_000, 500_000, 500_000]
    );
    assert_eq!(fill.island_removal, IslandRemoval::Always);
}

/// The GND pour on both sides: thermal reliefs, chamfered corners.
fn assert_ground_zone(facts: &DesignFacts) {
    let ground = zone(facts, "543af3d8-6e29-4e05-b64a-17cb4a58bfb5");
    let fill = ground.fill.as_ref().expect("a copper zone");
    assert_eq!(ground.slice_keys, ["copper.front", "copper.back"]);
    assert_eq!(fill.pad_connection, PadConnection::ThermalReliefs);
    assert_eq!(fill.clearance_nm.0, 254_000);
    assert!(fill.corner_smoothing.is_some());
    assert_eq!(
        fill.corner_radius_nm.as_ref().map(|value| value.0),
        Some(127_000)
    );
    assert!(ground.outline.outer.segments.len() >= 3);
}

#[test]
fn usb_pd_zones_carry_their_fill_rules_and_the_project_its_board_rules() {
    let board = read(&format!("{USB_PD}.kicad_pcb"));
    let project = read(&format!("{USB_PD}.kicad_pro"));
    let document = materialize(&board, Some(&project), &ALL);
    assert_eq!(document.schema, "kicad_monkey.materialization.a1");
    let facts = facts(&document);
    // `max_error` 0.005 mm and `min_copper_edge_clearance` 0.5 mm.
    assert_eq!(
        facts.max_error_nm.as_ref().map(|value| value.0),
        Some(5_000)
    );
    assert_eq!(
        facts.copper_edge_clearance_nm.as_ref().map(|value| value.0),
        Some(500_000)
    );
    assert_eq!(facts.zones.len(), 3);
    assert_solid_zone(facts);
    assert_ground_zone(facts);
}

#[test]
fn usb_pd_pads_with_local_rules_are_listed_and_inheriting_pads_are_not() {
    let board = read(&format!("{USB_PD}.kicad_pcb"));
    let document = materialize(&board, None, &ALL);
    let facts = facts(&document);
    // Without the project, its board rules are unknown.
    assert!(facts.max_error_nm.is_none() && facts.copper_edge_clearance_nm.is_none());
    let local = board.matches("\n\t\t\t(clearance ").count()
        + board.matches("\n\t\t\t(zone_connect ").count();
    assert!(local > 0, "the fixture has pads with local rules");
    assert!(!facts.pad_rules.is_empty());
    let rule = |uid: &str| {
        facts
            .pad_rules
            .iter()
            .find(|rules| rules.source_uid == uid)
            .expect(uid)
    };
    // An NPTH with `(clearance 0.0762)`, and the QFN's exposed pad with
    // `(zone_connect 2)`.
    let npth = rule("8b548487-412a-429e-8f00-103464122588");
    assert_eq!(
        npth.clearance_nm.as_ref().map(|value| value.0),
        Some(76_200)
    );
    assert!(npth.pad_connection.is_none());
    let exposed = rule("73d7851c-bba2-4313-a830-e141cdb1c522");
    assert_eq!(exposed.pad_connection, Some(PadConnection::Solid));
    assert!(exposed.clearance_nm.is_none());
    let pad_uids: std::collections::BTreeSet<&str> = document
        .binding
        .iter()
        .filter(|entry| entry.pad_number.is_some())
        .map(|entry| entry.source_uid.as_str())
        .collect();
    for rules in &facts.pad_rules {
        assert!(
            pad_uids.contains(rules.source_uid.as_str()),
            "{} keys a pad's binding",
            rules.source_uid
        );
        assert!(
            rules.clearance_nm.is_some()
                || rules.pad_connection.is_some()
                || rules.thermal_gap_nm.is_some()
                || rules.thermal_spoke_width_nm.is_some()
                || rules.thermal_spoke_angle_deg.is_some()
                || !rules.layers.is_empty(),
            "a record sets something"
        );
    }
    let pads = board.matches("(pad \"").count();
    assert!(
        facts.pad_rules.len() < pads,
        "inheriting pads have no record"
    );
}

#[test]
fn the_docs_oracle_rule_area_is_a_keepout_region() {
    let board = read(&format!("{ORACLE}.kicad_pcb"));
    let project = read(&format!("{ORACLE}.kicad_pro"));
    let document = materialize(&board, Some(&project), &ALL);
    let facts = facts(&document);
    let area = facts
        .zones
        .iter()
        .find(|zone| zone.source_uid == "ff1aff6f-307b-5d46-be62-12e7481fcbf6")
        .expect("the rule area");
    let keepout = area.keepout.as_ref().expect("a rule area");
    assert!(keepout.tracks && keepout.vias && keepout.pads && keepout.copper_pour);
    assert!(!keepout.footprints);
    assert!(area.fill.is_none() && area.net_key.is_none());
    assert_eq!(area.slice_keys, ["copper.front"]);
    // The rule area draws nothing: no operation is bound to it.
    assert!(
        document
            .binding
            .iter()
            .all(|entry| entry.source_uid != area.source_uid)
    );
    let ground = facts
        .zones
        .iter()
        .find(|zone| zone.keepout.is_none())
        .expect("the GND zone");
    assert_eq!(
        ground.fill.as_ref().map(|fill| fill.island_removal),
        Some(IslandRemoval::Always)
    );
}

#[test]
fn courtyards_close_per_component_and_side_in_the_board_frame() {
    let board = read(&format!("{USB_PD}.kicad_pcb"));
    let document = materialize(&board, None, &["holes"]);
    let facts = facts(&document);
    assert!(!facts.courtyards.is_empty());
    let components = materialize(&board, None, &["components"]).components;
    for courtyard in &facts.courtyards {
        let component = components
            .iter()
            .find(|component| component.source_uid == courtyard.source_uid)
            .expect("a courtyard belongs to a component");
        if component.side == BoardSide::Front {
            assert_eq!(courtyard.side, BoardSide::Front, "{}", component.refdes);
        }
        let start = &courtyard.regions[0].outer.start_nm;
        let (x, y) = (i64::from(*start.0[0]), i64::from(*start.0[1]));
        let (cx, cy) = (
            i64::from(*component.affine.tx_nm),
            i64::from(*component.affine.ty_nm),
        );
        // A courtyard lies near its footprint, in the board frame.
        assert!(
            (x - cx).abs() < 30_000_000 && (y - cy).abs() < 30_000_000,
            "{}",
            component.refdes
        );
    }
}

#[test]
fn zone_outlines_keep_their_arcs() {
    let board = r#"(kicad_pcb (version 20241229) (generator "pcbnew")
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
  (net 0 "") (net 1 "GND")
  (zone (net 1) (net_name "GND") (layer "F.Cu") (uuid "a1a1a1a1-0000-4000-8000-000000000001")
    (connect_pads (clearance 0.2)) (min_thickness 0.2)
    (fill yes (mode hatch) (thermal_gap 0.3) (thermal_bridge_width 0.4) (hatch_thickness 0.5)
      (hatch_gap 0.6) (hatch_orientation 45) (island_removal_mode 2) (island_area_min 10))
    (polygon (pts (xy 0 0) (arc (start 10 0) (mid 15 5) (end 10 10)) (xy 0 10))))
)"#;
    let document = materialize(board, None, &["copper"]);
    let zone = &facts(&document).zones[0];
    let segments = &zone.outline.outer.segments;
    assert_eq!(segments.len(), 3);
    assert!(matches!(segments[0], PathSegment::LineSegment(_)));
    assert!(matches!(&segments[1], PathSegment::ArcSegment(arc) if *arc.mid_nm.0[0] == 15_000_000));
    let fill = zone.fill.as_ref().expect("a copper zone");
    assert_eq!(fill.island_removal, IslandRemoval::BelowArea);
    assert_eq!(fill.island_min_area_mm2, Some(10.0));
    let hatch = fill.hatch.as_ref().expect("hatched");
    assert_eq!(hatch.gap_nm.as_ref().map(|value| value.0), Some(600_000));
    assert_eq!(hatch.orientation_deg, Some(45.0));
}

/// USB-PD with its first zone's UUID given to the second and its third
/// zone's UUID nil, as a legacy board can have them.
fn usb_pd_with_legacy_zone_ids() -> String {
    read(&format!("{USB_PD}.kicad_pcb"))
        .replace(
            "d875c38b-a2b8-4177-8a95-02cfca30b464",
            "99675cdc-18a1-4553-8352-48384972912b",
        )
        .replace(
            "543af3d8-6e29-4e05-b64a-17cb4a58bfb5",
            "00000000-0000-0000-0000-000000000000",
        )
}

#[test]
fn nil_and_repeated_zone_uuids_fall_back_to_unique_offsets() {
    let board = usb_pd_with_legacy_zone_ids();
    let document = materialize(&board, None, &["copper"]);
    let uids: Vec<&str> = facts(&document)
        .zones
        .iter()
        .map(|zone| zone.source_uid.as_str())
        .collect();
    assert_eq!(uids[0], "99675cdc-18a1-4553-8352-48384972912b");
    assert!(uids[1].starts_with("zone@") && uids[2].starts_with("zone@"));
    assert_ne!(uids[1], uids[2]);
    // Fill operations are bound to the same unique UIDs.
    let bound: std::collections::BTreeSet<&str> = document
        .binding
        .iter()
        .filter(|entry| entry.source_uid.starts_with("zone@"))
        .map(|entry| entry.source_uid.as_str())
        .collect();
    assert_eq!(bound, uids[1..].iter().copied().collect());
}

#[test]
fn design_facts_add_no_operation_and_do_not_depend_on_scope() {
    let board = read(&format!("{USB_PD}.kicad_pcb"));
    let project = read(&format!("{USB_PD}.kicad_pro"));
    let complete = materialize(&board, Some(&project), &ALL);
    let copper = materialize(&board, Some(&project), &["copper"]);
    let holes = materialize(&board, Some(&project), &["holes"]);
    let text = |document: &MaterializationDocumentA1| {
        serde_json::to_string(&document.design_facts).expect("serialize")
    };
    assert_eq!(text(&complete), text(&copper));
    assert_eq!(text(&complete), text(&holes));
    // No operation is bound to a rule area.
    assert!(complete.binding.iter().all(|entry| {
        !facts(&complete)
            .zones
            .iter()
            .any(|zone| zone.keepout.is_some() && zone.source_uid == entry.source_uid)
    }));
}

#[test]
fn the_docs_oracle_footprint_rule_is_keyed_by_its_component() {
    let board = read(&format!("{ORACLE}.kicad_pcb"));
    let document = materialize(&board, None, &ALL);
    let rules = &facts(&document).footprint_rules;
    assert_eq!(rules.len(), 1);
    assert_eq!(rules[0].source_uid, "7a5f7420-6dfe-5f6d-8b84-4e2be06868d1");
    assert_eq!(rules[0].pad_connection, Some(PadConnection::ThermalReliefs));
    assert!(
        document
            .components
            .iter()
            .any(|component| component.source_uid == rules[0].source_uid)
    );
}

/// Cynthion is a KiCad 7 board (`tstamp` ids) with 66 zones, nine of them
/// rule areas, one owned by a footprint.
#[test]
fn cynthion_rule_areas_include_a_footprints_own() {
    let stem = "fixtures/release-studio/cynthion/cynthion";
    let board = read(&format!("{stem}.kicad_pcb"));
    let project = read(&format!("{stem}.kicad_pro"));
    let document = materialize(&board, Some(&project), &["copper"]);
    let facts = facts(&document);
    assert_eq!(facts.zones.len(), 66);
    assert_eq!(
        facts.max_error_nm.as_ref().map(|value| value.0),
        Some(5_000)
    );
    assert_eq!(
        facts.copper_edge_clearance_nm.as_ref().map(|value| value.0),
        Some(300_000)
    );
    let areas: Vec<_> = facts
        .zones
        .iter()
        .filter(|zone| zone.keepout.is_some())
        .collect();
    assert_eq!(areas.len(), 9);
    let owned: Vec<_> = areas
        .iter()
        .filter(|zone| zone.footprint_source_uid.is_some())
        .collect();
    assert_eq!(owned.len(), 1);
    let keepout = owned[0].keepout.as_ref().expect("a rule area");
    assert!(keepout.vias && keepout.copper_pour && keepout.footprints);
    assert!(!keepout.tracks && !keepout.pads);
    assert_eq!(facts.footprint_rules.len(), 4);
    assert!(
        facts
            .footprint_rules
            .iter()
            .all(|rules| rules.pad_connection == Some(PadConnection::Solid))
    );
}
