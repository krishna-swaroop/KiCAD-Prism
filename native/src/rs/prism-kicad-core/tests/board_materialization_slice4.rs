//! Slice 4 evidence: project net classes (assignments, wildcard and regex
//! patterns, implicit and composite classes, migrations, board classes),
//! differential pairs, net ties and jumpers, pin-to-die data,
//! counterbores and countersinks, castellated pads, component bodies, and
//! the single rigid stack region. Expected values follow KiCad 10.0.6.

use prism_kicad_contracts::generated::materialization_document::MaterializationDocumentA1;
use prism_kicad_contracts::generated::materialization_request::MaterializationRequestA0;
use prism_kicad_contracts::materialization_contract::validate_materialization_document;
use prism_kicad_core::board_materialization::{
    PrepareLimits, PreparedBoard, filter_document, materialize_board, materialize_project,
};
use serde_json::{Value, json};

/// Four copper layers with known thicknesses; a counterbored via, a
/// countersunk castellated pad with die data, a net tie bridged by
/// footprint copper, a jumper footprint, and differential-pair nets.
const BOARD: &str = r#"(kicad_pcb
  (version 20241229)
  (generator pcbnew)
  (general (thickness 1.58))
  (layers (0 "F.Cu" signal) (1 "In1.Cu" signal) (2 "In2.Cu" signal) (31 "B.Cu" signal)
    (39 "F.Mask" user) (38 "B.Mask" user) (44 "Edge.Cuts" user) (49 "F.Fab" user)
    (47 "F.CrtYd" user))
  (setup
    (stackup
      (layer "F.Cu" (type "copper") (thickness 0.035))
      (layer "dielectric 1" (type "prepreg") (thickness 0.2) (material "FR4") (epsilon_r 4.5))
      (layer "In1.Cu" (type "copper") (thickness 0.035))
      (layer "dielectric 2" (type "core") (thickness 1.0) (material "FR4") (epsilon_r 4.5))
      (layer "In2.Cu" (type "copper") (thickness 0.035))
      (layer "dielectric 3" (type "prepreg") (thickness 0.2) (material "FR4") (epsilon_r 4.5))
      (layer "B.Cu" (type "copper") (thickness 0.035))
      (copper_finish "ENIG")
      (dielectric_constraints yes)
      (edge_plating yes)))
  (net 0 "")
  (net 1 "GND")
  (net 2 "VBUS")
  (net 3 "USB_D+")
  (net 4 "USB_D-")
  (net 5 "CLK_P")
  (net 6 "A")
  (net 7 "B")
  (gr_rect (start 0 0) (end 50 30) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (via (at 30 10) (size 0.8) (drill 0.4) (layers "F.Cu" "B.Cu") (net 1)
    (front_post_machining counterbore (size 1.2) (depth 0.3)) (uuid via-cb))
  (segment (start 5 5) (end 10 5) (width 0.2) (layer "F.Cu") (net 3) (uuid t-dp))
  (segment (start 5 6) (end 10 6) (width 0.2) (layer "F.Cu") (net 4) (uuid t-dn))
  (segment (start 5 7) (end 10 7) (width 0.2) (layer "F.Cu") (net 5) (uuid t-clk))
  (segment (start 5 8) (end 10 8) (width 0.5) (layer "F.Cu") (net 2) (uuid t-vbus))
  (footprint "Demo:Pin"
    (layer "F.Cu")
    (at 40 10)
    (property "Reference" "J1" (at 0 -3 0) (layer "F.Fab") (uuid ref-j1)
      (effects (font (size 1 1) (thickness 0.15))))
    (fp_rect (start -1 -1) (end 1 1) (stroke (width 0.05) (type solid)) (fill none)
      (layer "F.CrtYd") (uuid crt-j1))
    (pad "1" thru_hole circle (at 0 0) (size 1.6 1.6) (drill 0.8) (layers "*.Cu" "*.Mask")
      (net 1 "GND") (die_length 1.5) (die_delay 12.5) (property pad_prop_castellated)
      (back_post_machining countersink (size 1.0) (angle 90)) (uuid pad-j1)))
  (footprint "Demo:NetTie"
    (layer "F.Cu")
    (at 20 20)
    (property "Reference" "NT1" (at 0 -3 0) (layer "F.Fab") (uuid ref-nt1)
      (effects (font (size 1 1) (thickness 0.15))))
    (net_tie_pad_groups "1, 2")
    (fp_rect (start -0.5 -0.1) (end 0.5 0.1) (stroke (width 0) (type solid)) (fill yes)
      (layer "F.Cu") (uuid bridge))
    (fp_line (start 3 3) (end 4 3) (stroke (width 0.2) (type solid)) (layer "F.Cu")
      (uuid stray))
    (pad "1" smd rect (at -0.5 0) (size 0.6 0.6) (layers "F.Cu") (net 6 "A") (uuid nt-1))
    (pad "2" smd rect (at 0.5 0) (size 0.6 0.6) (layers "F.Cu") (net 7 "B") (uuid nt-2)))
  (footprint "Demo:Jumper"
    (layer "F.Cu")
    (at 10 20)
    (property "Reference" "JP1" (at 0 -3 0) (layer "F.Fab") (uuid ref-jp1)
      (effects (font (size 1 1) (thickness 0.15))))
    (duplicate_pad_numbers_are_jumpers yes)
    (jumper_pad_groups ("2" "3"))
    (pad "1" smd rect (at -2 0) (size 0.6 0.6) (layers "F.Cu") (uuid jp-1a))
    (pad "1" smd rect (at -1 0) (size 0.6 0.6) (layers "F.Cu") (uuid jp-1b))
    (pad "2" smd rect (at 0 0) (size 0.6 0.6) (layers "F.Cu") (uuid jp-2))
    (pad "3" smd rect (at 1 0) (size 0.6 0.6) (layers "F.Cu") (uuid jp-3)))
)
"#;

/// Version 5 net settings: an assignment, a wildcard, an anchored regex
/// naming an undefined class, and an alternation.
const PROJECT: &str = r#"{
  "meta": { "filename": "demo.kicad_pro", "version": 3 },
  "net_settings": {
    "meta": { "version": 5 },
    "classes": [
      { "name": "Default", "priority": 2147483647, "clearance": 0.2, "track_width": 0.25,
        "via_diameter": 0.6, "via_drill": 0.3, "microvia_diameter": 0.3,
        "microvia_drill": 0.1, "diff_pair_width": 0.2, "diff_pair_gap": 0.25,
        "diff_pair_via_gap": 0.25, "wire_width": 6, "bus_width": 12, "line_style": 0,
        "pcb_color": "rgba(0, 0, 0, 0.000)", "schematic_color": "rgba(0, 0, 0, 0.000)",
        "tuning_profile": "" },
      { "name": "Power", "priority": 1, "clearance": 0.3, "track_width": 0.5,
        "via_diameter": 0.8, "via_drill": 0.4, "microvia_diameter": 0.3,
        "microvia_drill": 0.1, "diff_pair_width": 0.2, "diff_pair_gap": 0.25,
        "diff_pair_via_gap": 0.25, "wire_width": 6, "bus_width": 12, "line_style": 0,
        "pcb_color": "rgba(0, 0, 0, 0.000)", "schematic_color": "rgba(0, 0, 0, 0.000)",
        "tuning_profile": "" },
      { "name": "USB", "priority": 0, "track_width": 0.3, "diff_pair_width": 0.15,
        "diff_pair_gap": 0.15, "pcb_color": "rgba(0, 0, 0, 0.000)",
        "schematic_color": "rgba(0, 0, 0, 0.000)", "tuning_profile": "" }
    ],
    "netclass_assignments": { "GND": ["Power"] },
    "netclass_patterns": [
      { "pattern": "USB_D*", "netclass": "USB" },
      { "pattern": "^G.D$", "netclass": "Ghost" },
      { "pattern": "VBUS|GND", "netclass": "Power" }
    ]
  }
}"#;

fn request(products: &[&str]) -> MaterializationRequestA0 {
    serde_json::from_value(json!({
        "type": "kicad_monkey.materialization.request",
        "version": "a0",
        "products": products,
        "tile_size_nm": 10_000_000,
        "max_source_bytes": "1048576",
        "max_operations": 1_000_000,
        "max_points": 10_000_000
    }))
    .expect("request decodes")
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

fn complete() -> (MaterializationDocumentA1, Value) {
    let document = materialize_project(BOARD, Some(PROJECT), &request(&ALL)).expect("materializes");
    validate_materialization_document(&document).expect("valid");
    let value = serde_json::to_value(&document).expect("json");
    (document, value)
}

fn class_of<'a>(value: &'a Value, net: &str) -> &'a str {
    value["nets"]
        .as_array()
        .and_then(|nets| nets.iter().find(|n| n["key"] == net))
        .and_then(|n| n["net_class"].as_str())
        .unwrap_or("<none>")
}

#[test]
fn nets_take_kicad_effective_classes() {
    let (_, value) = complete();
    assert_eq!(class_of(&value, "USB_D+"), "USB,Default");
    assert_eq!(class_of(&value, "GND"), "Power,Ghost");
    assert_eq!(class_of(&value, "VBUS"), "Power");
    assert_eq!(class_of(&value, "CLK_P"), "Default");
    assert_eq!(class_of(&value, ""), "Default");
    let classes = value["net_classes"].as_array().expect("classes");
    let names: Vec<&str> = classes.iter().filter_map(|c| c["name"].as_str()).collect();
    assert_eq!(names, ["Default", "Power", "Power,Ghost", "USB,Default"]);
    let usb = &classes[3];
    assert_eq!(usb["constituents"], json!(["USB", "Default"]));
    assert_eq!(usb["track_width_nm"], 300_000);
    assert_eq!(usb["diff_pair_gap_nm"], 150_000);
    // Rules USB leaves unset come from Default, except the pair via gap.
    assert_eq!(usb["clearance_nm"], 200_000);
    assert!(usb["diff_pair_via_gap_nm"].is_null());
    assert_eq!(value["source"]["project_bytes"], PROJECT.len().to_string());
    // Without a project, classes are unknown.
    let bare = materialize_board(BOARD, &request(&["copper"])).expect("materializes");
    assert!(bare.net_classes.is_empty() && bare.nets.iter().all(|n| n.net_class.is_none()));
}

#[test]
fn older_project_and_board_net_classes_migrate_as_kicad_does() {
    // Version 2 settings: classes list their nets and carry no priority.
    let old = r#"{ "net_settings": { "meta": { "version": 2 }, "classes": [
        { "name": "Default", "clearance": 0.2, "track_width": 0.25, "via_diameter": 0.6,
          "via_drill": 0.3, "microvia_diameter": 0.3, "microvia_drill": 0.1,
          "diff_pair_width": 0.2, "diff_pair_gap": 0.25, "wire_width": 6, "bus_width": 12 },
        { "name": "Wide", "track_width": 1.0, "nets": ["VBUS"] } ] } }"#;
    let document =
        materialize_project(BOARD, Some(old), &request(&["copper"])).expect("materializes");
    let value = serde_json::to_value(&document).expect("json");
    assert_eq!(class_of(&value, "VBUS"), "Wide,Default");
    // Board `(net_class)` forms replace the project's classes and patterns.
    let legacy = BOARD.replace(
        "  (net 0 \"\")",
        "  (net_class \"Default\" \"\" (clearance 0.15) (trace_width 0.2))\n  \
         (net_class \"HV\" \"\" (clearance 1) (trace_width 0.6) (add_net \"VBUS\"))\n  (net 0 \"\")",
    );
    let document = materialize_board(&legacy, &request(&["copper"])).expect("materializes");
    let value = serde_json::to_value(&document).expect("json");
    assert_eq!(class_of(&value, "VBUS"), "HV");
    assert_eq!(class_of(&value, "GND"), "Default");
    let hv = value["net_classes"]
        .as_array()
        .and_then(|c| c.iter().find(|c| c["name"] == "HV"))
        .expect("HV");
    assert_eq!(hv["clearance_nm"], 1_000_000);
    // Unlisted rules keep KiCad's built-in values.
    assert_eq!(hv["via_diameter_nm"], 600_000);
}

#[test]
fn differential_pairs_follow_the_suffix_rule() {
    let (document, _) = complete();
    assert_eq!(document.diff_pairs.len(), 1);
    let pair = &document.diff_pairs[0];
    assert_eq!(
        (
            pair.base_name.as_str(),
            pair.positive_net_key.as_str(),
            pair.negative_net_key.as_str()
        ),
        ("USB_D", "USB_D+", "USB_D-")
    );
}

#[test]
fn net_tie_bridges_list_their_nets_and_groups_are_recorded() {
    let (_, value) = complete();
    let binding = value["binding"].as_array().expect("binding");
    let entries = |uid: &str| -> Vec<&Value> {
        binding
            .iter()
            .filter(|entry| entry["source_uid"] == uid)
            .collect()
    };
    let bridge = entries("bridge");
    assert!(!bridge.is_empty());
    for entry in bridge {
        assert_eq!(entry["tied_net_keys"], json!(["A", "B"]));
        // KiCad gives footprint copper no net.
        assert_eq!(entry["net_key"], "");
    }
    for entry in entries("stray") {
        assert!(entry["tied_net_keys"].is_null());
    }
    let component = |refdes: &str| {
        value["components"]
            .as_array()
            .and_then(|c| c.iter().find(|c| c["refdes"] == refdes))
            .expect("component")
            .clone()
    };
    assert_eq!(
        component("NT1")["net_tie_groups"],
        json!([{ "pad_numbers": ["1", "2"] }])
    );
    assert_eq!(
        component("JP1")["jumper_groups"],
        json!([{ "pad_numbers": ["2", "3"] }, { "pad_numbers": ["1"] }])
    );
    // A board from before first-class net ties marks them by keywords.
    let legacy = BOARD
        .replace("(version 20241229)", "(version 20211014)")
        .replace(
            "    (net_tie_pad_groups \"1, 2\")\n",
            "    (tags \"net tie\")\n",
        );
    let document = materialize_board(&legacy, &request(&["components"])).expect("materializes");
    let tie = document
        .components
        .iter()
        .find(|c| c.refdes == "NT1")
        .expect("NT1");
    assert_eq!(tie.net_tie_groups.len(), 1);
    assert_eq!(tie.net_tie_groups[0].pad_numbers, ["1", "2"]);
}

#[test]
fn pins_carry_die_data_and_bodies_come_from_the_courtyard() {
    let (_, value) = complete();
    let pad = value["binding"]
        .as_array()
        .and_then(|b| b.iter().find(|e| e["source_uid"] == "pad-j1"))
        .expect("pad binding");
    assert_eq!(pad["die_length_nm"], 1_500_000);
    assert_eq!(pad["die_delay_ps"], 12.5);
    let j1 = value["components"]
        .as_array()
        .and_then(|c| c.iter().find(|c| c["refdes"] == "J1"))
        .expect("J1");
    // Bounds round outward by at most 1 nm.
    let body = &j1["body_bounds"];
    for (key, expected) in [
        ("min_x_nm", -1_000_000),
        ("min_y_nm", -1_000_000),
        ("max_x_nm", 1_000_000),
        ("max_y_nm", 1_000_000),
    ] {
        let value = body[key].as_i64().expect(key);
        assert!((value - expected).abs() <= 1, "{key}: {value}");
    }
    assert!(j1["body_height_nm"].is_null());
}

/// Diameters of the disks subtracted on each slice for `uid`.
fn cuts(value: &Value, uid: &str, material: &str) -> Vec<(String, i64)> {
    let binding = value["binding"].as_array().expect("binding");
    let mut found: Vec<(String, i64)> = value["operations"]
        .as_array()
        .expect("operations")
        .iter()
        .enumerate()
        .filter(|(index, op)| {
            op["material"] == material
                && op["action"] == "subtract"
                && binding
                    .iter()
                    .any(|e| e["operation_index"] == *index && e["source_uid"] == uid)
        })
        .filter_map(|(_, op)| {
            Some((
                op["slice_key"].as_str()?.to_owned(),
                op["shape"]["radius_nm"].as_i64()? * 2,
            ))
        })
        .collect();
    found.sort();
    found
}

#[test]
fn counterbores_and_countersinks_cut_copper_and_dielectric() {
    let (_, value) = complete();
    // Front counterbore 1.2 mm, 0.3 mm deep: F.Cu (0) and In1.Cu (0.2525 mm).
    assert_eq!(
        cuts(&value, "via-cb", "copper"),
        [
            ("copper.front".to_owned(), 1_200_000),
            ("copper.in1".to_owned(), 1_200_000)
        ]
    );
    let dielectric = cuts(&value, "via-cb", "dielectric");
    let wide: Vec<_> = dielectric.iter().filter(|(_, d)| *d == 1_200_000).collect();
    // The first prepreg (0.035 mm) and the core (0.27 mm) lie within 0.3 mm.
    assert_eq!(wide.len(), 2, "{dielectric:?}");
    // Back countersink 1.0 mm at 90 degrees runs 0.5 mm to its apex: B.Cu
    // keeps 1.0 mm and In2.Cu (0.2525 mm in) KiCad's 495001 nm
    // (GetPostMachiningKnockout), held by a disk as a 247500 nm radius.
    assert_eq!(
        cuts(&value, "pad-j1", "copper"),
        [
            ("copper.back".to_owned(), 1_000_000),
            ("copper.in2".to_owned(), 495_000)
        ]
    );
    let sunk: Vec<i64> = cuts(&value, "pad-j1", "dielectric")
        .into_iter()
        .map(|(_, d)| d)
        .filter(|d| *d != 800_000)
        .collect();
    assert_eq!(sunk, [460_000, 930_000]);
    let hole = value["operations"]
        .as_array()
        .and_then(|ops| {
            ops.iter()
                .find(|op| op["kind"] == "hole" && op["post_machining"][0]["mode"] == "countersink")
        })
        .expect("countersunk hole");
    assert_eq!(hole["castellated"], true);
    assert_eq!(hole["post_machining"][0]["side"], "back");
    assert_eq!(hole["post_machining"][0]["angle_deg"], 90.0);
}

#[test]
fn the_stack_is_one_rigid_region_with_board_flags() {
    let (document, _) = complete();
    let stack = &document.stack;
    assert_eq!(stack.regions.len(), 1);
    assert_eq!(stack.regions[0].slice_keys.len(), stack.slices.len());
    assert_eq!(stack.impedance_controlled, Some(true));
    assert_eq!(stack.edge_plating, Some(true));
}

#[test]
fn project_results_obey_rule_two_and_prepared_boards() {
    let (complete, _) = complete();
    let limits = PrepareLimits {
        max_source_bytes: 1 << 20,
        max_operations: 1_000_000,
    };
    let prepared = PreparedBoard::prepare_project(BOARD, Some(PROJECT), &limits).expect("prepares");
    for products in [
        &["copper"][..],
        &["dielectric", "holes"][..],
        &["components"][..],
    ] {
        let request = request(products);
        let selective = materialize_project(BOARD, Some(PROJECT), &request).expect("selective");
        let filtered = filter_document(&complete, &selective.scope);
        let text =
            |document: &MaterializationDocumentA1| serde_json::to_string(document).expect("json");
        assert_eq!(text(&selective), text(&filtered), "{products:?}");
        assert_eq!(
            text(&prepared.materialize(&request).expect("prepared")),
            text(&selective)
        );
    }
    let error = materialize_project(BOARD, Some("{"), &request(&ALL)).expect_err("bad project");
    assert_eq!(error.code, "project_parse");
}

#[test]
fn slice_four_records_round_trip_through_the_pack() {
    use prism_kicad_materialization_pack::{PackLimits, PackReader, encode_pack};
    let (document, _) = complete();
    let bytes = encode_pack(&document).expect("packs");
    let decoded = PackReader::open(&bytes, PackLimits::default())
        .expect("opens")
        .document()
        .expect("decodes");
    assert_eq!(
        serde_json::to_string(&decoded).expect("json"),
        serde_json::to_string(&document).expect("json")
    );
}
