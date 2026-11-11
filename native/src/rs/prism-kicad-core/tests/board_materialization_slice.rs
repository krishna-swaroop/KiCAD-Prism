//! Slice 0 evidence for `kicad_monkey.materialization.a0`: contract decode
//! and validation, debug-view determinism, the shared chunking rule, the
//! selective-equals-filtered oracle, and the request boundary.

use prism_kicad_contracts::generated::materialization_document::{
    DielectricKind, MaterialProduct, MaterializationDocumentA1, MaterializationScope, NonNegativeNm,
};
use prism_kicad_contracts::generated::materialization_request::MaterializationRequestA0;
use prism_kicad_contracts::materialization_contract::{
    decode_materialization_document, validate_materialization_document,
};
use prism_kicad_core::board_materialization::{
    chunk_operations, filter_document, materialization_sexpr, materialize_board,
};
use serde_json::{Value, json};
use std::collections::BTreeMap;

const TILE: i64 = 10_000_000;

fn slice(key: &str, role: &str, order: u32) -> Value {
    json!({ "key": key, "role": role, "order": order })
}

fn affine(m11: f64, m12: f64, m21: f64, m22: f64, tx: i32, ty: i32) -> Value {
    json!({ "m11": m11, "m12": m12, "m21": m21, "m22": m22, "tx_nm": tx, "ty_nm": ty })
}

fn bounds(min_x: i32, min_y: i32, max_x: i32, max_y: i32) -> Value {
    json!({ "min_x_nm": min_x, "min_y_nm": min_y, "max_x_nm": max_x, "max_y_nm": max_y })
}

/// The issue #20 worked example: a rotated rounded-rectangle GND land on
/// front copper and a plated GND hole through the board, plus back copper and
/// a front mask opening so filters have something to remove.
fn example_operations() -> Value {
    json!([
        {
            "kind": "surface", "index": 0, "action": "add", "material": "copper",
            "slice_key": "copper.front", "net_key": "GND",
            "shape": { "kind": "rounded_rect_2d", "center_nm": [0, 0],
                       "width_nm": 2_400_000, "height_nm": 1_200_000, "radius_nm": 200_000 },
            "affine": affine(0.0, 1.0, -1.0, 0.0, 17_000_000, 8_000_000),
            "bounds": bounds(16_400_000, 6_800_000, 17_600_000, 9_200_000)
        },
        {
            "kind": "hole", "index": 1, "plating": "plated",
            "start_slice_key": "copper.front", "end_slice_key": "copper.back",
            "net_key": "GND", "backdrills": [], "post_machining": [],
            "shape": { "kind": "disk_2d", "center_nm": [0, 0], "radius_nm": 300_000 },
            "affine": affine(1.0, 0.0, 0.0, 1.0, 17_000_000, 8_000_000),
            "bounds": bounds(16_700_000, 7_700_000, 17_300_000, 8_300_000)
        },
        {
            "kind": "surface", "index": 2, "action": "add", "material": "copper",
            "slice_key": "copper.back", "net_key": "VCC",
            "shape": { "kind": "swept_path_2d", "start_nm": [0, 0],
                       "segments": [ { "kind": "line", "end_nm": [5_000_000, 0] },
                                     { "kind": "arc", "mid_nm": [6_000_000, 1_000_000],
                                       "end_nm": [5_000_000, 2_000_000] } ],
                       "width_nm": 250_000, "cap": "round", "join": "round" },
            "affine": affine(1.0, 0.0, 0.0, 1.0, 30_000_000, 2_000_000),
            "bounds": bounds(29_875_000, 1_875_000, 36_125_000, 4_125_000)
        },
        {
            "kind": "surface", "index": 3, "action": "subtract", "material": "solder_mask",
            "slice_key": "mask.front",
            "shape": { "kind": "rect_2d", "center_nm": [0, 0],
                       "width_nm": 2_500_000, "height_nm": 1_300_000 },
            "affine": affine(0.0, 1.0, -1.0, 0.0, 17_000_000, 8_000_000),
            "bounds": bounds(16_350_000, 6_750_000, 17_650_000, 9_250_000)
        }
    ])
}

fn example_document() -> MaterializationDocumentA1 {
    let value = json!({
        "schema": "kicad_monkey.materialization.a0",
        "type": "kicad_monkey.materialization.document",
        "version": "a0",
        "producer": { "name": "slice0-test", "version": "0" },
        "source": { "sha256": "0".repeat(64), "source_bytes": "0" },
        "coordinate_system": { "unit": "nm", "x_axis": "board_right", "y_axis": "board_down" },
        "scope": { "products": ["copper", "holes", "dielectric", "solder_mask", "paste",
                                "silkscreen", "components"],
                   "tile_size_nm": TILE, "complete": true },
        "stack": { "slices": [
            slice("mask.front", "solder_mask", 0),
            slice("copper.front", "conductor", 1),
            slice("dielectric.core", "dielectric", 2),
            slice("copper.back", "conductor", 3)
        ], "regions": [ { "key": "rigid", "kind": "rigid", "bend_lines": [],
                          "slice_keys": ["mask.front", "copper.front", "dielectric.core",
                                         "copper.back"] } ] },
        "nets": [ { "key": "", "name": "" }, { "key": "GND", "name": "GND" },
                  { "key": "VCC", "name": "VCC" } ],
        "net_classes": [], "diff_pairs": [], "components": [],
        "operations": example_operations(),
        "binding": [
            { "operation_index": 0, "source_kind": "pad", "source_uid": "pad-uuid",
              "refdes": "U1", "pad_number": "1", "net_key": "GND" },
            { "operation_index": 1, "source_kind": "pad", "source_uid": "pad-uuid",
              "refdes": "U1", "pad_number": "1", "net_key": "GND" },
            { "operation_index": 2, "source_kind": "track", "source_uid": "track-uuid",
              "net_key": "VCC" }
        ],
        "chunks": [], "diagnostics": []
    });
    let mut document: MaterializationDocumentA1 =
        serde_json::from_value(value).expect("example decodes against the a0 contract");
    rechunk(&mut document);
    document
}

/// Apply the shared chunking rule and remap the binding table.
fn rechunk(document: &mut MaterializationDocumentA1) {
    let order: BTreeMap<String, u32> = document
        .stack
        .slices
        .iter()
        .map(|slice| (slice.key.clone(), slice.order))
        .collect();
    let chunked = chunk_operations(std::mem::take(&mut document.operations), &order, TILE);
    for entry in &mut document.binding {
        let input = usize::try_from(entry.operation_index).expect("index fits usize");
        entry.operation_index = chunked.new_index_of_input[input];
    }
    document.binding.sort_by_key(|entry| entry.operation_index);
    document.operations = chunked.operations;
    document.chunks = chunked.chunks;
}

fn scope(products: &[MaterialProduct], slices: &[&str], nets: &[&str]) -> MaterializationScope {
    MaterializationScope {
        products: products.to_vec(),
        slice_keys: slices.iter().map(|key| (*key).to_owned()).collect(),
        net_keys: nets.iter().map(|key| (*key).to_owned()).collect(),
        region: None,
        tile_size_nm: NonNegativeNm(TILE),
        complete: false,
    }
}

#[test]
fn example_decodes_validates_and_round_trips_json() {
    let document = example_document();
    validate_materialization_document(&document).expect("example is a valid a0 document");
    let first = serde_json::to_string(&document).expect("serialize");
    let decoded = decode_materialization_document(first.as_bytes()).expect("decode");
    let second = serde_json::to_string(&decoded).expect("serialize again");
    assert_eq!(
        first, second,
        "JSON debug view is byte-stable across a round trip"
    );
}

#[test]
fn chunking_orders_by_slice_then_tile_and_covers_every_operation() {
    let document = example_document();
    let slices: Vec<&str> = document
        .chunks
        .iter()
        .map(|chunk| chunk.slice_key.as_str())
        .collect();
    assert_eq!(slices, ["mask.front", "copper.front", "copper.back"]);
    let covered: u32 = document
        .chunks
        .iter()
        .map(|chunk| chunk.operation_count)
        .sum();
    assert_eq!(covered, 4);
    let front = &document.chunks[1];
    assert_eq!(
        front.net_keys,
        ["GND"],
        "land and hole share front copper chunk"
    );
    assert_eq!((front.tile_x, front.tile_y), (1, 0));
    assert_eq!(document.binding[0].refdes.as_deref(), Some("U1"));
}

#[test]
fn sexpr_view_is_deterministic_and_matches_the_issue_sketch() {
    let document = example_document();
    let view = materialization_sexpr(&document);
    assert_eq!(view, materialization_sexpr(&document));
    assert!(view.starts_with("(pcb_analytic_materialization"));
    assert!(view.contains("(affine 0 1 -1 0 17000000 8000000)"));
    assert!(view.contains("(rounded_rect_2d"));
    assert!(view.contains("(center_nm 0 0)"));
    assert!(view.contains("(radius_nm 200000)"));
    assert!(view.contains("(net_key \"GND\")"));
}

#[test]
fn filtering_reindexes_rechunks_and_stays_valid() {
    let complete = example_document();
    let copper = filter_document(&complete, &scope(&[MaterialProduct::Copper], &[], &[]));
    validate_materialization_document(&copper).expect("filtered document is valid");
    assert_eq!(copper.operations.len(), 2);
    assert_eq!(
        copper.binding.len(),
        2,
        "hole binding is dropped with the hole"
    );

    let back = filter_document(
        &complete,
        &scope(
            &[MaterialProduct::Holes, MaterialProduct::Copper],
            &["copper.back"],
            &[],
        ),
    );
    validate_materialization_document(&back).expect("slice-filtered document is valid");
    assert_eq!(
        back.operations.len(),
        2,
        "back trace plus the hole crossing the back slice"
    );

    let gnd = filter_document(&complete, &scope(&[MaterialProduct::Holes], &[], &["GND"]));
    assert_eq!(gnd.operations.len(), 1);
}

#[test]
fn filtering_is_idempotent() {
    let complete = example_document();
    let wanted = scope(
        &[MaterialProduct::Copper, MaterialProduct::Holes],
        &[],
        &["GND"],
    );
    let once = filter_document(&complete, &wanted);
    let twice = filter_document(&once, &wanted);
    assert_eq!(
        serde_json::to_value(&once).expect("serialize"),
        serde_json::to_value(&twice).expect("serialize")
    );
}

#[test]
fn validator_rejects_copper_without_a_net() {
    let mut value = serde_json::to_value(example_document()).expect("serialize");
    let operation = value["operations"]
        .as_array_mut()
        .and_then(|operations| {
            operations
                .iter_mut()
                .find(|operation| operation["material"] == "copper")
        })
        .expect("a copper operation");
    operation
        .as_object_mut()
        .expect("operation object")
        .remove("net_key");
    let document: MaterializationDocumentA1 = serde_json::from_value(value).expect("decode");
    let error = validate_materialization_document(&document).expect_err("copper needs a net");
    assert_eq!(error.code, "missing_net");
}

#[test]
fn decoding_rejects_a_mislabelled_shape_kind() {
    let mut value = serde_json::to_value(example_document()).expect("serialize");
    let shape = value["operations"]
        .as_array_mut()
        .and_then(|operations| {
            operations
                .iter_mut()
                .find(|operation| operation["shape"]["kind"] == "disk_2d")
        })
        .expect("a disk");
    shape["shape"]["kind"] = json!("annulus_2d");
    assert!(serde_json::from_value::<MaterializationDocumentA1>(value).is_err());
}

fn request(products: &[&str], max_source_bytes: &str) -> MaterializationRequestA0 {
    serde_json::from_value(json!({
        "type": "kicad_monkey.materialization.request",
        "version": "a0",
        "products": products,
        "tile_size_nm": TILE,
        "max_source_bytes": max_source_bytes,
        "max_operations": 1_000_000,
        "max_points": 10_000_000
    }))
    .expect("request decodes")
}

/// Three-layer board: a rotated footprint with an SMD rect pad and a plated
/// round through-hole pad, a track, a track arc, a through via, and a stored
/// zone fill.
const BOARD: &str = r#"(kicad_pcb
  (version 20240108)
  (generator pcbnew)
  (general (thickness 1.6))
  (layers
    (0 "F.Cu" signal)
    (1 "In1.Cu" signal)
    (31 "B.Cu" signal)
    (36 "B.SilkS" user "b.silkscreen"))
  (net 0 "")
  (net 1 "GND")
  (net 2 "VCC")
  (footprint "Demo:Part"
    (layer "F.Cu")
    (at 10 20 90)
    (property "Reference" "U1")
    (uuid fp-u1)
    (pad "1" smd rect (at 1 0 90) (size 1 0.5) (layers "F.Cu" "F.Paste" "F.Mask") (net 1 "GND")
      (uuid pad-u1-1))
    (pad "2" thru_hole circle (at -1 0 90) (size 1.2 1.2) (drill 0.6) (layers "*.Cu" "*.Mask")
      (net 2 "VCC") (uuid pad-u1-2)))
  (segment (start 1 2) (end 3 2) (width 0.25) (layer "F.Cu") (net 1) (uuid trk-1))
  (arc (start 0 0) (mid 1 1) (end 2 0) (width 0.2) (layer "B.Cu") (net 2) (uuid arc-1))
  (via (at 5 6) (size 0.8) (drill 0.4) (layers "F.Cu" "B.Cu") (net 1) (uuid via-1))
  (zone (net 1) (net_name "GND") (layers "In1.Cu") (uuid zone-1)
    (polygon (pts (xy 0 0) (xy 20 0) (xy 20 20) (xy 0 20)))
    (filled_polygon (layer "In1.Cu") (pts (xy 0 0) (xy 20 0) (xy 20 20) (xy 0 20))))
)
"#;

fn complete_request() -> MaterializationRequestA0 {
    request(
        &[
            "components",
            "copper",
            "dielectric",
            "holes",
            "paste",
            "silkscreen",
            "solder_mask",
        ],
        "1048576",
    )
}

#[test]
fn producer_materializes_copper_holes_nets_and_binding() {
    let document = materialize_board(BOARD, &complete_request()).expect("board materializes");
    validate_materialization_document(&document).expect("producer output is valid");
    assert!(document.scope.complete);
    let slices: Vec<&str> = document
        .stack
        .slices
        .iter()
        .map(|slice| slice.key.as_str())
        .collect();
    assert_eq!(
        slices,
        [
            "silkscreen.front",
            "paste.front",
            "mask.front",
            "copper.front",
            "dielectric.1",
            "copper.in1",
            "dielectric.2",
            "copper.back",
            "mask.back",
            "paste.back",
            "silkscreen.back"
        ],
        "no stackup: explicit default stack"
    );
    assert!(
        document
            .stack
            .slices
            .iter()
            .all(|slice| slice.thickness_nm.is_none())
    );
    let nets: Vec<&str> = document.nets.iter().map(|net| net.key.as_str()).collect();
    assert_eq!(nets, ["", "GND", "VCC"]);

    let value = serde_json::to_value(&document).expect("serialize");
    let operations = value["operations"].as_array().expect("operations");
    let count = |kind: &str, field: &str| {
        operations
            .iter()
            .filter(|operation| operation["kind"] == kind && operation["shape"]["kind"] == field)
            .filter(|operation| kind == "hole" || operation["material"] == "copper")
            .count()
    };
    // track + arc are swept paths; the via lands on 3 slices; the TH pad on 3.
    assert_eq!(count("surface", "swept_path_2d"), 2);
    assert_eq!(count("surface", "disk_2d"), 3 + 3);
    assert_eq!(count("surface", "rect_2d"), 1);
    assert_eq!(count("surface", "planar_region_2d"), 1);
    assert_eq!(count("hole", "disk_2d"), 2);
    assert_eq!(
        document.binding.len(),
        operations.len(),
        "every operation is bound"
    );
    assert_eq!(document.components.len(), 1);
    let mut codes: Vec<&str> = document
        .diagnostics
        .iter()
        .map(|d| d.code.as_str())
        .collect();
    codes.sort_unstable();
    assert_eq!(
        codes,
        // The missing outline is reported for the dielectric and the mask.
        ["outline_absent", "outline_absent", "stackup_absent"]
    );
}

#[test]
fn pads_compose_the_footprint_transform_and_bind_to_their_pins() {
    let document = materialize_board(BOARD, &complete_request()).expect("board materializes");
    let value = serde_json::to_value(&document).expect("serialize");
    let smd = value["operations"]
        .as_array()
        .and_then(|operations| {
            operations.iter().find(|operation| {
                operation["shape"]["kind"] == "rect_2d" && operation["material"] == "copper"
            })
        })
        .expect("the SMD land");
    // Local (1, 0) rotated by -90 degrees about the footprint at (10, 20).
    assert_eq!(smd["affine"]["tx_nm"], 10_000_000);
    assert_eq!(smd["affine"]["ty_nm"], 19_000_000);
    assert_eq!(smd["slice_key"], "copper.front");
    assert_eq!(smd["net_key"], "GND");
    let index = smd["index"].as_u64().expect("index");
    let entry = document
        .binding
        .iter()
        .find(|entry| u64::from(entry.operation_index) == index)
        .expect("binding entry");
    assert_eq!(entry.refdes.as_deref(), Some("U1"));
    assert_eq!(entry.pad_number.as_deref(), Some("1"));

    let hole = value["operations"]
        .as_array()
        .and_then(|operations| {
            operations
                .iter()
                .find(|operation| operation["kind"] == "hole" && operation["net_key"] == "VCC")
        })
        .expect("the plated pad hole");
    assert_eq!(hole["start_slice_key"], "copper.front");
    assert_eq!(hole["end_slice_key"], "copper.back");
    assert_eq!(hole["plating"], "plated");
}

#[test]
fn selective_materialization_equals_the_filtered_complete_one() {
    let complete = materialize_board(BOARD, &complete_request()).expect("complete");
    for (products, slices, nets) in [
        (vec!["copper"], vec![], vec![]),
        (vec!["copper", "holes"], vec!["copper.back"], vec![]),
        (vec!["holes"], vec![], vec!["GND"]),
        (
            vec!["copper", "components"],
            vec!["copper.in1"],
            vec!["GND"],
        ),
    ] {
        let mut wanted = request(&products, "1048576");
        wanted.slice_keys = slices.iter().map(|key| (*key).to_owned()).collect();
        wanted.net_keys = nets.iter().map(|key| (*key).to_owned()).collect();
        let selective = materialize_board(BOARD, &wanted).expect("selective");
        validate_materialization_document(&selective).expect("selective output is valid");
        let filtered = filter_document(&complete, &selective.scope);
        assert_eq!(
            serde_json::to_value(&selective).expect("serialize"),
            serde_json::to_value(&filtered).expect("serialize"),
            "rule 2 for products {products:?}, slices {slices:?}, nets {nets:?}"
        );
    }
}

#[test]
fn producer_output_is_byte_deterministic() {
    let first = materialize_board(BOARD, &complete_request()).expect("first");
    let second = materialize_board(BOARD, &complete_request()).expect("second");
    assert_eq!(
        serde_json::to_string(&first).expect("serialize"),
        serde_json::to_string(&second).expect("serialize")
    );
}

#[test]
fn producer_rejects_a_board_without_copper_layers() {
    let error = materialize_board("(kicad_pcb (version 20240108))", &complete_request())
        .expect_err("no copper layers");
    assert_eq!(error.code, "no_copper_layers");
}

#[test]
fn producer_enforces_the_source_limit() {
    let error = materialize_board("(kicad_pcb)", &request(&["copper"], "4"))
        .expect_err("source exceeds the limit");
    assert_eq!(error.code, "source_too_large");
}

/// Custom pad whose only primitive is a cubic Bézier stroke with control
/// points at y = +2 mm and -2 mm. The curve itself only reaches
/// y = ±(1/√3) mm ≈ 0.577 mm at t = (3 ∓ √3) / 6.
const BEZIER_PAD: &str = r#"(kicad_pcb
  (version 20240108)
  (generator pcbnew)
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
  (net 0 "")
  (footprint "Demo:Curve"
    (layer "F.Cu")
    (at 10 20)
    (property "Reference" "J1")
    (pad "1" smd custom (at 0 0) (size 0.1 0.1) (layers "F.Cu")
      (options (clearance outline) (anchor circle))
      (primitives (gr_curve (pts (xy 0 0) (xy 1 2) (xy 2 -2) (xy 3 0)) (width 0.2)))
      (uuid pad-j1-1)))
)
"#;

#[test]
fn bezier_strokes_stay_one_exact_cubic_segment() {
    let document =
        materialize_board(BEZIER_PAD, &request(&["copper"], "1048576")).expect("materializes");
    validate_materialization_document(&document).expect("valid");
    let value = serde_json::to_value(&document).expect("serialize");
    let stroke = value["operations"]
        .as_array()
        .and_then(|operations| {
            operations
                .iter()
                .find(|operation| operation["shape"]["kind"] == "swept_path_2d")
        })
        .expect("the curve stroke");
    let segments = stroke["shape"]["segments"].as_array().expect("segments");
    assert_eq!(segments.len(), 1);
    assert_eq!(segments[0]["kind"], "cubic");
    assert_eq!(segments[0]["control1_nm"], json!([1_000_000, 2_000_000]));
    // Half width 0.1 mm plus the 1 nm stroke guard, around the true extreme.
    let extreme = 1_000_000.0 / 3f64.sqrt();
    let expected_max_y = 20_000_000.0 + extreme + 100_001.0;
    let max_y = stroke["bounds"]["max_y_nm"].as_f64().expect("max y");
    let min_y = stroke["bounds"]["min_y_nm"].as_f64().expect("min y");
    assert!((max_y - expected_max_y).abs() <= 2.0, "max_y {max_y}");
    assert!(
        (min_y - (40_000_000.0 - expected_max_y)).abs() <= 2.0,
        "min_y {min_y}"
    );
}

#[test]
fn decoding_rejects_a_mislabelled_cubic_segment() {
    let with_segment = |kind: &str| {
        let mut value = serde_json::to_value(example_document()).expect("serialize");
        let operations = value["operations"].as_array_mut().expect("operations");
        let path = operations
            .iter_mut()
            .find(|operation| operation["shape"]["kind"] == "swept_path_2d")
            .expect("a path");
        path["shape"]["segments"] = json!([{
            "kind": kind, "control1_nm": [1, 1], "control2_nm": [2, 2], "end_nm": [3, 3]
        }]);
        value.to_string()
    };
    assert!(decode_materialization_document(with_segment("arc").as_bytes()).is_err());
    assert!(decode_materialization_document(with_segment("cubic").as_bytes()).is_ok());
}

/// Two-layer board with a full stackup, an outline drawn as two board lines,
/// one board arc, and one footprint-owned line (edges deliberately out of
/// order and direction), a circular cutout, a tented and back-drilled via,
/// and a plated pad hole.
const STACKED: &str = r#"(kicad_pcb
  (version 20240108)
  (generator pcbnew)
  (general (thickness 1.6))
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user))
  (setup
    (stackup
      (layer "F.SilkS" (type "Top Silk Screen"))
      (layer "F.Paste" (type "Top Solder Paste"))
      (layer "F.Mask" (type "Top Solder Mask") (thickness 0.01) (material "LPI") (epsilon_r 3.3))
      (layer "F.Cu" (type "copper") (thickness 0.035))
      (layer "dielectric 1" (type "core") (thickness 1.51) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02))
      (layer "B.Cu" (type "copper") (thickness 0.035))
      (layer "B.Mask" (type "Bottom Solder Mask") (thickness 0.01))
      (layer "B.Paste" (type "Bottom Solder Paste"))
      (layer "B.SilkS" (type "Bottom Silk Screen"))
      (copper_finish "ENIG")))
  (net 0 "")
  (net 1 "GND")
  (footprint "Demo:Edge"
    (layer "F.Cu")
    (at 30 0)
    (property "Reference" "X1")
    (fp_line (start 0 20) (end 0 0) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
    (pad "1" thru_hole circle (at -5 10) (size 1.5 1.5) (drill 0.8) (layers "*.Cu") (net 1 "GND")
      (uuid pad-x1-1)))
  (gr_line (start 0 0) (end 30 0) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_arc (start 0 20) (mid -5 10) (end 0 0) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_line (start 30 20) (end 0 20) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_circle (center 10 10) (end 11 10) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (via (at 20 5) (size 0.8) (drill 0.4) (layers "F.Cu" "B.Cu") (net 1)
    (tenting (front yes) (back no))
    (filling yes)
    (backdrill (size 0.6) (layers "B.Cu" "F.Cu"))
    (uuid via-x))
)
"#;

#[test]
fn full_stack_comes_from_the_kicad_stackup() {
    let document = materialize_board(STACKED, &complete_request()).expect("materializes");
    validate_materialization_document(&document).expect("valid");
    let slices: Vec<(&str, Option<i64>)> = document
        .stack
        .slices
        .iter()
        .map(|slice| {
            (
                slice.key.as_str(),
                slice.thickness_nm.as_ref().map(|value| **value),
            )
        })
        .collect();
    assert_eq!(
        slices,
        [
            ("silkscreen.front", None),
            ("paste.front", None),
            ("mask.front", Some(10_000)),
            ("copper.front", Some(35_000)),
            ("dielectric.1", Some(1_510_000)),
            ("copper.back", Some(35_000)),
            ("mask.back", Some(10_000)),
            ("paste.back", None),
            ("silkscreen.back", None),
        ]
    );
    let core = &document.stack.slices[4];
    assert_eq!(core.material_name.as_deref(), Some("FR4"));
    assert_eq!(core.relative_permittivity, Some(4.5));
    assert_eq!(core.dielectric_kind, Some(DielectricKind::Core));
    assert_eq!(core.loss_tangent, Some(0.02));
    assert_eq!(document.stack.copper_finish.as_deref(), Some("ENIG"));
    assert_eq!(
        document
            .stack
            .board_thickness_nm
            .as_ref()
            .map(|value| **value),
        Some(1_600_000)
    );
    assert!(
        !document
            .diagnostics
            .iter()
            .any(|d| d.code.starts_with("stackup"))
    );
}

#[test]
fn outline_closes_across_board_and_footprint_edges_with_a_cutout() {
    let request = request(&["dielectric"], "1048576");
    let document = materialize_board(STACKED, &request).expect("materializes");
    validate_materialization_document(&document).expect("valid");
    assert!(
        document.diagnostics.is_empty(),
        "{:?}",
        document.diagnostics
    );
    let value = serde_json::to_value(&document).expect("serialize");
    let operations = value["operations"].as_array().expect("operations");
    let adds: Vec<&Value> = operations
        .iter()
        .filter(|op| op["action"] == "add")
        .collect();
    assert_eq!(adds.len(), 1, "one region on the one dielectric slice");
    let region = &adds[0]["shape"];
    assert_eq!(region["kind"], "planar_region_2d");
    assert_eq!(
        region["outer"]["segments"].as_array().map(Vec::len),
        Some(4)
    );
    assert_eq!(
        region["holes"].as_array().map(Vec::len),
        Some(1),
        "circular cutout"
    );
    assert_eq!(adds[0]["slice_key"], "dielectric.1");
    // Bounds include the arc bulging to x = -5 mm.
    assert_eq!(adds[0]["bounds"]["min_x_nm"], -5_000_000);
    let subtracts = operations
        .iter()
        .filter(|op| op["action"] == "subtract")
        .count();
    assert_eq!(
        subtracts, 3,
        "the via, its full-depth back-drill bore, and the plated pad hole cross the core"
    );
}

#[test]
fn via_protection_and_backdrill_are_carried_on_the_hole() {
    let document = materialize_board(STACKED, &request(&["holes"], "1048576")).expect("ok");
    let value = serde_json::to_value(&document).expect("serialize");
    let via = value["operations"]
        .as_array()
        .and_then(|operations| operations.iter().find(|op| op["protection"].is_object()))
        .expect("the via hole");
    assert_eq!(via["protection"]["front"]["tented"], "yes");
    assert_eq!(via["protection"]["back"]["tented"], "no");
    // Sides the via leaves unstated follow the board, here unprotected.
    assert_eq!(via["protection"]["front"]["covered"], "no");
    assert_eq!(via["protection"]["filled"], "yes");
    assert_eq!(via["protection"]["capped"], "no");
    assert_eq!(
        via["backdrills"],
        json!([{ "side": "back", "diameter_nm": 600_000, "until_slice_key": "copper.front" }])
    );
}

#[test]
fn a_vias_unstated_protection_follows_the_board() {
    let board = STACKED
        .replace("(version 20240108)", "(version 20250324)")
        .replace(
            "      (copper_finish \"ENIG\")))",
            "      (copper_finish \"ENIG\"))\n    (tenting front) (covering (back yes)) (plugging front) (capping yes))",
        )
        .replace(
            "    (tenting (front yes) (back no))\n    (filling yes)\n",
            "    (plugging (back yes))\n",
        );
    assert_ne!(board, STACKED, "the fixture was rewritten");
    let protection_of = |board: &str| {
        let document = materialize_board(board, &request(&["holes"], "1048576")).expect("ok");
        let value = serde_json::to_value(&document).expect("serialize");
        value["operations"]
            .as_array()
            .and_then(|operations| operations.iter().find(|op| op["protection"].is_object()))
            .expect("the via hole")["protection"]
            .clone()
    };
    let protection = &protection_of(&board);
    assert_eq!(protection["front"]["tented"], "yes");
    assert_eq!(protection["back"]["tented"], "no");
    assert_eq!(protection["front"]["covered"], "no");
    assert_eq!(protection["back"]["covered"], "yes");
    // The via states its back plug and leaves the front to the board.
    assert_eq!(protection["front"]["plugged"], "yes");
    assert_eq!(protection["back"]["plugged"], "yes");
    assert_eq!(protection["filled"], "no");
    assert_eq!(protection["capped"], "yes");
    // Before format 20250228 an absent cover, plug, fill or cap is off;
    // tenting still follows the board.
    let older = protection_of(&board.replace("(version 20250324)", "(version 20250101)"));
    assert_eq!(older["front"]["tented"], "yes");
    assert_eq!(older["back"]["covered"], "no");
    assert_eq!(older["front"]["plugged"], "no");
    assert_eq!(older["back"]["plugged"], "yes");
    assert_eq!(older["capped"], "no");
}

#[test]
fn dielectric_is_selectable_and_rule_two_holds() {
    let complete = materialize_board(STACKED, &complete_request()).expect("complete");
    for (products, slices) in [
        (vec!["dielectric"], vec![]),
        (vec!["dielectric", "holes"], vec!["dielectric.1"]),
        (vec!["copper", "dielectric"], vec!["copper.back"]),
    ] {
        let mut wanted = request(&products, "1048576");
        wanted.slice_keys = slices.iter().map(|key| (*key).to_owned()).collect();
        let selective = materialize_board(STACKED, &wanted).expect("selective");
        let filtered = filter_document(&complete, &selective.scope);
        assert_eq!(
            serde_json::to_value(&selective).expect("serialize"),
            serde_json::to_value(&filtered).expect("serialize"),
            "rule 2 for {products:?} on {slices:?}"
        );
    }
}

/// Four copper layers, no stackup: a via back-drilled from the back to In2
/// and a second back-drill with no end layer on the board.
const BACKDRILLED: &str = r#"(kicad_pcb
  (version 20240108)
  (generator pcbnew)
  (general (thickness 1.6))
  (layers (0 "F.Cu" signal) (1 "In1.Cu" signal) (2 "In2.Cu" signal) (31 "B.Cu" signal)
    (44 "Edge.Cuts" user))
  (net 0 "")
  (net 1 "SIG")
  (gr_rect (start 0 0) (end 10 10) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (via (at 5 5) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1)
    (backdrill (size 0.5) (layers "B.Cu" "In2.Cu"))
    (uuid via-bd))
  (via (at 2 2) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1)
    (backdrill (size 0.5) (layers "B.Cu" "User.1"))
    (uuid via-nowhere))
)
"#;

#[test]
fn backdrill_bores_cut_only_the_dielectric_they_cross() {
    let document =
        materialize_board(BACKDRILLED, &request(&["dielectric"], "1048576")).expect("ok");
    validate_materialization_document(&document).expect("valid");
    let value = serde_json::to_value(&document).expect("serialize");
    let mut cuts: Vec<(String, String, i64)> = value["operations"]
        .as_array()
        .expect("operations")
        .iter()
        .filter(|op| op["action"] == "subtract")
        .map(|op| {
            let uid = value["binding"]
                .as_array()
                .and_then(|binding| {
                    binding
                        .iter()
                        .find(|entry| entry["operation_index"] == op["index"])
                })
                .and_then(|entry| entry["source_uid"].as_str())
                .expect("bound");
            (
                op["slice_key"].as_str().expect("slice").to_owned(),
                uid.to_owned(),
                op["shape"]["radius_nm"].as_i64().expect("disk"),
            )
        })
        .collect();
    cuts.sort();
    let mut expected = Vec::new();
    for slice in ["dielectric.1", "dielectric.2", "dielectric.3"] {
        expected.push((slice.to_owned(), "via-bd".to_owned(), 150_000));
        expected.push((slice.to_owned(), "via-nowhere".to_owned(), 150_000));
    }
    expected.push(("dielectric.3".to_owned(), "via-bd".to_owned(), 250_000));
    expected.sort();
    assert_eq!(cuts, expected, "the bore reaches only the In2-B.Cu core");
    let warnings: Vec<(&str, Option<&str>)> = document
        .diagnostics
        .iter()
        .filter(|d| d.code == "backdrill_not_cut")
        .map(|d| (d.code.as_str(), d.source_uid.as_deref()))
        .collect();
    assert_eq!(warnings, [("backdrill_not_cut", Some("via-nowhere"))]);
}

#[test]
fn backdrill_bores_keep_rule_two() {
    let complete = materialize_board(BACKDRILLED, &complete_request()).expect("complete");
    for slices in [vec!["dielectric.3"], vec!["dielectric.1", "copper.back"]] {
        let mut wanted = request(&["dielectric", "holes"], "1048576");
        wanted.slice_keys = slices.iter().map(|key| (*key).to_owned()).collect();
        let selective = materialize_board(BACKDRILLED, &wanted).expect("selective");
        let filtered = filter_document(&complete, &selective.scope);
        assert_eq!(
            serde_json::to_value(&selective).expect("serialize"),
            serde_json::to_value(&filtered).expect("serialize"),
            "rule 2 on {slices:?}"
        );
    }
}
