//! Review batch 4 evidence (on an a0 document, which the a1 validator reads): the validator enforces schema ranges and
//! lengths, slice roles, the canonical scope, scope membership, chunk order,
//! tiles, and nets, and bounds that hold their shape; the header check holds
//! without operations. Slice 4 adds stack regions.

use prism_kicad_contracts::generated::materialization_document::MaterializationDocumentA1;
use prism_kicad_contracts::materialization_contract::{
    validate_materialization_document, validate_materialization_header,
};
use serde_json::{Value, json};

const TILE: i64 = 10_000_000;

/// One edit of the base document.
type Edit = Box<dyn Fn(&mut Value)>;

fn affine(tx: i64, ty: i64) -> Value {
    json!({ "m11": 1.0, "m12": 0.0, "m21": 0.0, "m22": 1.0, "tx_nm": tx, "ty_nm": ty })
}

fn bounds(min_x: i64, min_y: i64, max_x: i64, max_y: i64) -> Value {
    json!({ "min_x_nm": min_x, "min_y_nm": min_y, "max_x_nm": max_x, "max_y_nm": max_y })
}

/// Copper and mask on the front, a dielectric, copper on the back. One GND
/// pad on the front, one VCC track on the back, one plated hole, one mask
/// opening, a component, and a copper diagnostic.
fn base() -> Value {
    json!({
        "schema": "kicad_monkey.materialization.a0",
        "type": "kicad_monkey.materialization.document",
        "version": "a0",
        "producer": { "name": "validation-test", "version": "0" },
        "source": { "sha256": "0".repeat(64), "source_bytes": "0" },
        "coordinate_system": { "unit": "nm", "x_axis": "board_right", "y_axis": "board_down" },
        "scope": { "products": ["copper", "holes", "dielectric", "solder_mask", "paste",
                                "silkscreen", "components"],
                   "tile_size_nm": TILE, "complete": true },
        "stack": { "slices": [
            { "key": "mask.front", "role": "solder_mask", "order": 0, "thickness_nm": 10_000 },
            { "key": "copper.front", "role": "conductor", "order": 1, "thickness_nm": 35_000 },
            { "key": "dielectric.1", "role": "dielectric", "order": 2, "thickness_nm": 1_500_000 },
            { "key": "copper.back", "role": "conductor", "order": 3 }
        ], "regions": [ { "key": "rigid", "kind": "rigid",
                          "slice_keys": ["mask.front", "copper.front", "dielectric.1",
                                         "copper.back"], "bend_lines": [] } ],
        "board_thickness_nm": 1_600_000, "impedance_controlled": false },
        "nets": [ { "key": "GND", "name": "GND" }, { "key": "VCC", "name": "VCC" } ],
        "net_classes": [], "diff_pairs": [],
        "components": [ { "refdes": "U1", "footprint": "Demo:U", "side": "front",
                          "affine": affine(1_000_000, 1_000_000), "source_uid": "fp-u1",
                          "net_tie_groups": [], "jumper_groups": [] } ],
        "operations": [
            { "kind": "surface", "index": 0, "action": "subtract", "material": "solder_mask",
              "slice_key": "mask.front",
              "shape": { "kind": "rect_2d", "center_nm": [0, 0], "width_nm": 1_000_000,
                         "height_nm": 2_000_000 },
              "affine": affine(1_000_000, 1_000_000),
              "bounds": bounds(500_000, 0, 1_500_000, 2_000_000) },
            { "kind": "surface", "index": 1, "action": "add", "material": "copper",
              "slice_key": "copper.front", "net_key": "GND",
              "shape": { "kind": "chamfered_rect_2d", "center_nm": [0, 0], "width_nm": 1_000_000,
                         "height_nm": 2_000_000, "chamfer_nm": 200_000,
                         "chamfered_corners": ["top_left"], "radius_nm": 0 },
              "affine": affine(1_000_000, 1_000_000),
              "bounds": bounds(500_000, 0, 1_500_000, 2_000_000) },
            { "kind": "hole", "index": 2, "plating": "plated",
              "start_slice_key": "copper.front", "end_slice_key": "copper.back",
              "net_key": "GND", "plating_thickness_nm": 25_000, "backdrills": [],
              "post_machining": [],
              "shape": { "kind": "disk_2d", "center_nm": [0, 0], "radius_nm": 200_000 },
              "affine": affine(3_000_000, 1_000_000),
              "bounds": bounds(2_800_000, 800_000, 3_200_000, 1_200_000) },
            { "kind": "surface", "index": 3, "action": "add", "material": "copper",
              "slice_key": "copper.back", "net_key": "VCC",
              "shape": { "kind": "swept_path_2d", "start_nm": [0, 0],
                         "segments": [ { "kind": "line", "end_nm": [4_000_000, 0] } ],
                         "width_nm": 250_000, "cap": "round", "join": "round" },
              "affine": affine(1_000_000, 5_000_000),
              "bounds": bounds(875_000, 4_875_000, 5_125_000, 5_125_000) }
        ],
        "binding": [
            { "operation_index": 1, "source_kind": "pad", "source_uid": "pad-1",
              "refdes": "U1", "pad_number": "1", "net_key": "GND" },
            { "operation_index": 3, "source_kind": "track", "source_uid": "track-1",
              "net_key": "VCC" }
        ],
        "chunks": [
            { "slice_key": "mask.front", "tile_x": 0, "tile_y": 0,
              "bounds": bounds(500_000, 0, 1_500_000, 2_000_000), "net_keys": [],
              "first_operation_index": 0, "operation_count": 1 },
            { "slice_key": "copper.front", "tile_x": 0, "tile_y": 0,
              "bounds": bounds(500_000, 0, 3_200_000, 2_000_000), "net_keys": ["GND"],
              "first_operation_index": 1, "operation_count": 2 },
            { "slice_key": "copper.back", "tile_x": 0, "tile_y": 0,
              "bounds": bounds(875_000, 4_875_000, 5_125_000, 5_125_000), "net_keys": ["VCC"],
              "first_operation_index": 3, "operation_count": 1 }
        ],
        "diagnostics": [ { "severity": "warning", "code": "demo", "message": "demo",
                           "product": "copper" } ]
    })
}

fn decode(value: Value) -> MaterializationDocumentA1 {
    serde_json::from_value(value).expect("decodes against the a1 types")
}

/// Code of the first rule `edit` breaks, or `None` when it stays valid.
fn code_after(edit: impl FnOnce(&mut Value)) -> Option<&'static str> {
    let mut value = base();
    edit(&mut value);
    validate_materialization_document(&decode(value))
        .err()
        .map(|error| error.code)
}

/// Make the scope a filtered one, keeping `complete` consistent.
fn filtered(value: &mut Value, slices: Value, nets: Value) {
    value["scope"]["slice_keys"] = slices;
    value["scope"]["net_keys"] = nets;
    value["scope"]["complete"] = json!(false);
}

#[test]
fn the_base_document_and_its_header_are_valid() {
    let document = decode(base());
    validate_materialization_document(&document).expect("valid");
    let mut header = document.clone();
    header.operations.clear();
    validate_materialization_header(&header).expect("header valid without operations");
}

#[test]
fn every_non_negative_length_is_a_32_bit_value() {
    let negative = [
        "/operations/1/shape/chamfer_nm",
        "/operations/1/shape/radius_nm",
        "/operations/3/shape/width_nm",
        "/operations/2/plating_thickness_nm",
        "/stack/slices/0/thickness_nm",
        "/stack/board_thickness_nm",
    ];
    for pointer in negative {
        let code = code_after(|value| *value.pointer_mut(pointer).expect(pointer) = json!(-1));
        assert_eq!(code, Some("invalid_length"), "{pointer}");
    }
    let huge = code_after(|value| {
        value["components"][0]["body_height_nm"] = json!(i64::from(i32::MAX) + 1);
    });
    assert_eq!(huge, Some("invalid_length"));
    let drill = code_after(|value| {
        value["operations"][2]["backdrills"] = json!([{ "side": "back", "diameter_nm": -5 }]);
    });
    assert_eq!(drill, Some("invalid_length"));
}

#[test]
fn paths_and_contours_have_segments() {
    let swept = code_after(|value| value["operations"][3]["shape"]["segments"] = json!([]));
    assert_eq!(swept, Some("empty_path"));
    let hole = code_after(|value| {
        value["operations"][2]["shape"] = json!({
            "kind": "planar_region_2d",
            "outer": { "start_nm": [-100, -100], "segments": [
                { "kind": "line", "end_nm": [100, -100] }, { "kind": "line", "end_nm": [100, 100] } ] },
            "holes": [ { "start_nm": [0, 0], "segments": [] } ]
        });
    });
    assert_eq!(hole, Some("empty_path"));
}

#[test]
fn the_scope_is_canonical_and_complete_exactly_when_unfiltered() {
    let unsorted = code_after(|value| {
        value["scope"]["products"] = json!([
            "holes",
            "copper",
            "dielectric",
            "solder_mask",
            "paste",
            "silkscreen",
            "components"
        ]);
    });
    assert_eq!(unsorted, Some("noncanonical_scope"));
    let duplicate_net = code_after(|value| filtered(value, json!([]), json!(["GND", "GND"])));
    assert_eq!(duplicate_net, Some("noncanonical_scope"));
    let understated = code_after(|value| value["scope"]["complete"] = json!(false));
    assert_eq!(understated, Some("inconsistent_scope"));
    let overstated = code_after(|value| {
        value["scope"]["products"] = json!([
            "copper",
            "holes",
            "dielectric",
            "solder_mask",
            "paste",
            "silkscreen"
        ]);
        value["components"] = json!([]);
    });
    assert_eq!(overstated, Some("inconsistent_scope"));
}

#[test]
fn material_lies_on_a_slice_of_its_role() {
    let copper_on_mask =
        code_after(|value| value["operations"][1]["slice_key"] = json!("mask.front"));
    assert_eq!(copper_on_mask, Some("wrong_slice_role"));
    let hole_into_dielectric =
        code_after(|value| value["operations"][2]["end_slice_key"] = json!("dielectric.1"));
    assert_eq!(hole_into_dielectric, Some("wrong_slice_role"));
}

#[test]
fn records_stay_within_the_recorded_scope() {
    let without_holes = code_after(|value| {
        value["scope"]["products"] = json!([
            "copper",
            "dielectric",
            "solder_mask",
            "paste",
            "silkscreen",
            "components"
        ]);
        value["scope"]["complete"] = json!(false);
    });
    assert_eq!(without_holes, Some("out_of_scope"));
    let without_components = code_after(|value| {
        value["scope"]["products"] = json!([
            "copper",
            "holes",
            "dielectric",
            "solder_mask",
            "paste",
            "silkscreen"
        ]);
        value["scope"]["complete"] = json!(false);
    });
    assert_eq!(without_components, Some("out_of_scope"));
    let net_filter = code_after(|value| filtered(value, json!([]), json!(["GND"])));
    assert_eq!(
        net_filter,
        Some("out_of_scope"),
        "the mask opening has no net"
    );
    let back_only = code_after(|value| filtered(value, json!(["copper.back"]), json!([])));
    assert_eq!(
        back_only,
        Some("out_of_scope"),
        "front copper is outside the slice filter"
    );
    let region = code_after(|value| {
        value["scope"]["region"] = bounds(0, 0, 10, 10);
        value["scope"]["complete"] = json!(false);
    });
    assert_eq!(region, Some("out_of_scope"));
}

#[test]
fn chunks_are_ordered_tiled_and_carry_their_nets() {
    let swapped = code_after(|value| {
        let chunks = value["chunks"].as_array_mut().expect("chunks");
        chunks.swap(1, 2);
    });
    assert_eq!(swapped, Some("invalid_chunk_order"));
    let wrong_tile = code_after(|value| value["chunks"][2]["tile_x"] = json!(1));
    assert_eq!(wrong_tile, Some("invalid_chunk_member"));
    let missing_net = code_after(|value| value["chunks"][1]["net_keys"] = json!([]));
    assert_eq!(missing_net, Some("invalid_chunk_nets"));
    let unknown_net = code_after(|value| value["chunks"][1]["net_keys"] = json!(["GND", "X"]));
    assert_eq!(unknown_net, Some("invalid_chunk_nets"));
}

#[test]
fn bounds_hold_the_whole_shape() {
    let short = code_after(|value| {
        value["operations"][3]["bounds"] = bounds(875_000, 4_875_000, 3_000_000, 5_125_000);
        value["chunks"][2]["bounds"] = bounds(875_000, 4_875_000, 3_000_000, 5_125_000);
    });
    assert_eq!(short, Some("bounds_exclude_shape"));
    let eroded = code_after(|value| {
        value["operations"][0]["offset_nm"] = json!(-100_000);
        value["operations"][0]["bounds"] = bounds(600_000, 100_000, 1_400_000, 1_900_000);
        value["chunks"][0]["bounds"] = bounds(600_000, 100_000, 1_400_000, 1_900_000);
    });
    assert_eq!(eroded, None, "an eroded opening may have tighter bounds");
}

#[test]
fn the_header_check_needs_no_operations() {
    let mut header = base();
    header["operations"] = json!([]);
    header["binding"][1]["operation_index"] = json!(4);
    let error = validate_materialization_header(&decode(header)).expect_err("binding past end");
    assert_eq!(error.code, "invalid_binding");
    let mut unknown = base();
    unknown["operations"] = json!([]);
    unknown["chunks"][0]["slice_key"] = json!("paste.front");
    let error = validate_materialization_header(&decode(unknown)).expect_err("unknown slice");
    assert_eq!(error.code, "unknown_slice");
}

#[test]
fn stack_regions_cover_every_slice_in_stack_order() {
    let region = |value: &mut Value| value["stack"]["regions"][0].clone();
    let cases: [(&str, Edit); 7] = [
        (
            "missing_stack_region",
            Box::new(|v| v["stack"]["regions"] = json!([])),
        ),
        (
            "invalid_region_slices",
            Box::new(|v| {
                v["stack"]["regions"][0]["slice_keys"] = json!(["copper.front", "mask.front"]);
            }),
        ),
        (
            "invalid_region_slices",
            Box::new(|v| {
                v["stack"]["regions"][0]["slice_keys"][0] = json!("no.such.slice");
            }),
        ),
        (
            "uncovered_slice",
            Box::new(|v| {
                v["stack"]["regions"][0]["slice_keys"] = json!(["copper.front", "copper.back"]);
            }),
        ),
        (
            "duplicate_stack_region",
            Box::new(move |v| {
                let copy = region(v);
                v["stack"]["regions"]
                    .as_array_mut()
                    .expect("regions")
                    .push(copy);
            }),
        ),
        (
            "missing_region_boundary",
            Box::new(move |v| {
                let mut copy = region(v);
                copy["key"] = json!("flex");
                v["stack"]["regions"]
                    .as_array_mut()
                    .expect("regions")
                    .push(copy);
            }),
        ),
        (
            "rigid_region_bends",
            Box::new(|v| {
                v["stack"]["regions"][0]["bend_lines"] = json!([{ "start_nm": [0, 0],
                "end_nm": [1, 0], "radius_nm": 100, "angle_deg": 90.0 }]);
            }),
        ),
    ];
    for (expected, edit) in cases {
        assert_eq!(code_after(|value| edit(value)), Some(expected));
    }
    // A flexible region may bend.
    assert_eq!(
        code_after(|v| {
            v["stack"]["regions"][0]["kind"] = json!("flex");
            v["stack"]["regions"][0]["bend_lines"] = json!([{ "start_nm": [0, 0],
                "end_nm": [1, 0], "radius_nm": 100, "angle_deg": 90.0 }]);
        }),
        None
    );
}

#[test]
fn slice_four_records_are_checked() {
    let class =
        |name: &str, constituents: Value| json!({ "name": name, "constituents": constituents });
    let cases: Vec<(&str, Edit)> = vec![
        (
            "invalid_net_class_constituents",
            Box::new(move |v| {
                v["net_classes"] = json!([class("HS,Default", json!(["HS"]))]);
            }),
        ),
        (
            "duplicate_net_class",
            Box::new(move |v| {
                v["net_classes"] = json!([class("HS", json!(["HS"])), class("HS", json!(["HS"]))]);
            }),
        ),
        (
            "invalid_tied_nets",
            Box::new(|v| {
                v["binding"][0]["tied_net_keys"] = json!(["VCC", "GND"]);
            }),
        ),
        (
            "invalid_tied_nets",
            Box::new(|v| {
                v["binding"][0]["tied_net_keys"] = json!(["NOPE"]);
            }),
        ),
        (
            "invalid_length",
            Box::new(|v| v["binding"][0]["die_length_nm"] = json!(-5)),
        ),
        (
            "invalid_die_delay",
            Box::new(|v| v["binding"][0]["die_delay_ps"] = json!(-1.0)),
        ),
        (
            "invalid_pad_group",
            Box::new(|v| {
                v["components"][0]["jumper_groups"] = json!([{ "pad_numbers": ["1", "1"] }]);
            }),
        ),
        (
            "invalid_post_machining",
            Box::new(|v| {
                v["operations"][2]["post_machining"] = json!([{ "side": "front",
                "mode": "counterbore", "diameter_nm": 600_000, "angle_deg": 90.0 }]);
            }),
        ),
        (
            "invalid_post_machining",
            Box::new(|v| {
                let entry = json!({ "side": "back", "mode": "countersink", "angle_deg": 90.0 });
                v["operations"][2]["post_machining"] = json!([entry.clone(), entry]);
            }),
        ),
    ];
    for (expected, edit) in cases {
        assert_eq!(code_after(|value| edit(value)), Some(expected));
    }
    // A valid composite class, tied nets, pin facts, groups, and machining.
    assert_eq!(
        code_after(|v| {
            v["net_classes"] = json!([class("HS,Default", json!(["HS", "Default"]))]);
            v["nets"][0]["net_class"] = json!("HS,Default");
            v["binding"][0]["tied_net_keys"] = json!(["GND", "VCC"]);
            v["binding"][0]["die_length_nm"] = json!(1_200_000);
            v["binding"][0]["die_delay_ps"] = json!(12.5);
            v["components"][0]["net_tie_groups"] = json!([{ "pad_numbers": ["1", "2"] }]);
            v["operations"][2]["post_machining"] = json!([{ "side": "front",
                "mode": "countersink", "diameter_nm": 600_000, "angle_deg": 90.0 }]);
            v["operations"][2]["castellated"] = json!(true);
        }),
        None
    );
}

/// The a1 facts: one copper zone, one rule area, a pad rule, a courtyard,
/// a footprint's pads.
fn design_facts() -> Value {
    let square = json!({ "kind": "planar_region_2d",
        "outer": { "start_nm": [0, 0], "segments": [
            { "kind": "line", "end_nm": [1_000_000, 0] },
            { "kind": "arc", "mid_nm": [1_500_000, 500_000], "end_nm": [1_000_000, 1_000_000] },
            { "kind": "line", "end_nm": [0, 1_000_000] } ] },
        "holes": [] });
    json!({
        "max_error_nm": 5_000,
        "zones": [
            { "source_uid": "zone-gnd", "net_key": "GND", "slice_keys": ["copper.front", "copper.back"],
              "priority": 0, "outline": square.clone(),
              "fill": { "clearance_nm": 200_000, "min_width_nm": 250_000,
                        "pad_connection": "thermal_reliefs", "thermal_gap_nm": 500_000,
                        "thermal_spoke_width_nm": 500_000, "island_removal": "always" } },
            { "source_uid": "zone@120", "slice_keys": ["copper.front"], "priority": 0,
              "outline": square.clone(),
              "keepout": { "tracks": true, "vias": true, "pads": false, "copper_pour": true,
                           "footprints": false } }
        ],
        "pad_rules": [ { "source_uid": "pad-1", "clearance_nm": 100_000, "layers": [] } ],
        "footprint_rules": [],
        "courtyards": [ { "source_uid": "fp-u1", "side": "front", "regions": [square] } ],
        "footprint_pads": [ { "source_uid": "fp-u1", "pads": [
            { "source_uid": "pad-1", "number": "1", "net_key": "GND" },
            { "source_uid": "pad@300", "number": "" } ] } ]
    })
}

fn a1() -> Value {
    let mut value = base();
    value["schema"] = json!("kicad_monkey.materialization.a1");
    value["version"] = json!("a1");
    value["design_facts"] = design_facts();
    value
}

fn a1_code_after(edit: impl FnOnce(&mut Value)) -> Option<&'static str> {
    let mut value = a1();
    edit(&mut value);
    validate_materialization_document(&decode(value))
        .err()
        .map(|error| error.code)
}

#[test]
fn a0_documents_are_read_without_design_facts_and_a1_documents_need_them() {
    assert_eq!(code_after(|_| {}), None, "an a0 document stays valid");
    assert_eq!(
        code_after(|value| value["design_facts"] = design_facts()),
        Some("unexpected_design_facts")
    );
    assert_eq!(a1_code_after(|_| {}), None);
    assert_eq!(
        a1_code_after(|value| {
            value.as_object_mut().unwrap().remove("design_facts");
        }),
        Some("missing_design_facts")
    );
    assert_eq!(
        a1_code_after(|value| value["version"] = json!("a0")),
        Some("unsupported_contract")
    );
    assert_eq!(
        a1_code_after(|value| value["schema"] = json!("kicad_monkey.materialization.a2")),
        Some("unsupported_contract")
    );
}

#[test]
fn design_facts_are_checked() {
    let zone =
        |edit: fn(&mut Value)| a1_code_after(|value| edit(&mut value["design_facts"]["zones"][0]));
    assert_eq!(
        zone(|zone| zone["slice_keys"] = json!(["copper.back", "copper.front"])),
        Some("invalid_zone_slices")
    );
    assert_eq!(
        zone(|zone| zone["slice_keys"] = json!(["dielectric.1"])),
        Some("invalid_zone_slices")
    );
    assert_eq!(
        zone(|zone| zone["net_key"] = json!("NOPE")),
        Some("unknown_net")
    );
    assert_eq!(
        zone(|zone| zone["source_uid"] = json!("zone@120")),
        Some("duplicate_zone")
    );
    assert_eq!(
        zone(|zone| {
            zone.as_object_mut().unwrap().remove("fill");
        }),
        Some("invalid_zone_kind")
    );
    assert_eq!(
        zone(|zone| zone["fill"]["clearance_nm"] = json!(i64::from(i32::MAX) + 1)),
        Some("invalid_length")
    );
    assert_eq!(
        a1_code_after(|value| {
            let rules = value["design_facts"]["pad_rules"][0].clone();
            value["design_facts"]["pad_rules"]
                .as_array_mut()
                .unwrap()
                .push(rules);
        }),
        Some("duplicate_rule_record")
    );
    assert_eq!(
        a1_code_after(|value| {
            value["design_facts"]["courtyards"][0]["regions"][0]["outer"]["segments"] = json!([]);
        }),
        Some("empty_path")
    );
    assert_eq!(
        a1_code_after(|value| {
            value["design_facts"]["footprint_pads"][0]["pads"][0]["net_key"] = json!("NOPE");
        }),
        Some("unknown_net")
    );
    assert_eq!(
        a1_code_after(|value| value["design_facts"]["footprint_pads"][0]["pads"] = json!([])),
        Some("empty_footprint_pads")
    );
}
