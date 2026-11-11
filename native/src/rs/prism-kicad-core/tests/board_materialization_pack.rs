//! Producer output through the packed encoding: exact round trips, chunk
//! seeking, determinism, and fail-closed decoding of damaged packs.

use prism_kicad_contracts::generated::materialization_document::MaterializationDocumentA1;
use prism_kicad_contracts::generated::materialization_request::MaterializationRequestA0;
use prism_kicad_core::board_materialization::materialize_board;
use prism_kicad_materialization_pack::{PackLimits, PackReader, encode_pack};
use serde_json::json;

/// Every shape kind, protected and back-drilled holes, knockout text (group
/// keys), and grown mask openings (offsets).
const BOARD: &str = r#"(kicad_pcb
  (version 20241229)
  (generator pcbnew)
  (general (thickness 1.6))
  (layers (0 "F.Cu" signal) (1 "In1.Cu" signal) (2 "In2.Cu" signal) (31 "B.Cu" signal)
    (35 "F.Paste" user) (37 "F.SilkS" user) (38 "B.Mask" user) (39 "F.Mask" user)
    (44 "Edge.Cuts" user))
  (setup (pad_to_mask_clearance 0.05) (tenting (front no) (back no)))
  (net 0 "")
  (net 1 "GND")
  (net 2 "SIG")
  (gr_line (start 0 0) (end 40 0) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_arc (start 40 0) (mid 45 15) (end 40 30) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_line (start 40 30) (end 0 30) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_line (start 0 30) (end 0 0) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_circle (center 35 25) (end 36 25) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_text "KO" (at 20 25 0) (layer "F.SilkS" knockout) (uuid ko)
    (effects (font (size 1 1) (thickness 0.15))))
  (gr_curve (pts (xy 2 20) (xy 4 18) (xy 6 22) (xy 8 20)) (stroke (width 0.2) (type solid))
    (layer "F.SilkS") (uuid curve))
  (footprint "Demo:U"
    (layer "F.Cu")
    (at 10 10 30)
    (property "Reference" "U1" (at 0 -3 30) (layer "F.SilkS") (uuid ref-u1)
      (effects (font (size 1 1) (thickness 0.15))))
    (pad "1" smd rect (at -2 0) (size 1 2) (layers "F.Cu" "F.Mask" "F.Paste") (net 1 "GND") (uuid p1))
    (pad "2" smd roundrect (at 0 0) (size 1 2) (roundrect_rratio 0.25) (layers "F.Cu" "F.Mask")
      (net 1 "GND") (uuid p2))
    (pad "3" smd roundrect (at 2 0) (size 1 2) (chamfer_ratio 0.2) (chamfer top_left)
      (layers "F.Cu" "F.Mask") (net 1 "GND") (uuid p3))
    (pad "4" smd trapezoid (at 4 0) (size 1 2) (rect_delta 0 0.4) (layers "F.Cu" "F.Mask")
      (net 2 "SIG") (uuid p4))
    (pad "5" thru_hole oval (at 6 0) (size 1.2 2) (drill oval 0.6 1.2) (layers "*.Cu" "*.Mask")
      (net 2 "SIG") (uuid p5))
    (pad "6" smd custom (at 8 0) (size 0.5 0.5) (layers "F.Cu" "F.Mask") (net 1 "GND")
      (options (clearance outline) (anchor circle))
      (primitives (gr_poly (pts (xy 0 0) (xy 1 0) (xy 1 1) (xy 0 1)) (width 0) (fill yes)))
      (uuid p6)))
  (segment (start 20 5) (end 30 5) (width 0.25) (layer "F.Cu") (net 2) (uuid t1))
  (arc (start 20 8) (mid 25 6) (end 30 8) (width 0.25) (layer "B.Cu") (net 2) (uuid a1))
  (via (at 32 5) (size 0.8) (drill 0.4) (layers "F.Cu" "B.Cu") (net 2)
    (tenting (front yes) (back no)) (filling yes)
    (backdrill (size 0.6) (layers "B.Cu" "In2.Cu")) (uuid v1))
  (zone (net 1) (net_name "GND") (layer "In1.Cu") (uuid z1) (hatch edge 0.5)
    (connect_pads (clearance 0.5)) (min_thickness 0.25) (filled_areas_thickness no)
    (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.5))
    (polygon (pts (xy 2 2) (xy 18 2) (xy 18 18) (xy 2 18)))
    (filled_polygon (layer "In1.Cu") (pts (xy 2 2) (xy 18 2) (xy 18 18) (xy 2 18))))
)
"#;

fn request(products: &[&str], tile: i64) -> MaterializationRequestA0 {
    serde_json::from_value(json!({
        "type": "kicad_monkey.materialization.request",
        "version": "a0",
        "products": products,
        "tile_size_nm": tile,
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

fn json(document: &MaterializationDocumentA1) -> String {
    serde_json::to_string(document).expect("serialize")
}

#[test]
fn producer_documents_round_trip_through_the_pack() {
    // Small tiles give many chunks.
    for (products, tile) in [
        (&ALL[..], 10_000_000),
        (&ALL[..], 2_000_000),
        (&["copper"][..], 5_000_000),
    ] {
        let document = materialize_board(BOARD, &request(products, tile)).expect("materializes");
        let bytes = encode_pack(&document).expect("packs");
        assert_eq!(
            encode_pack(&document).expect("again"),
            bytes,
            "deterministic"
        );
        let reader = PackReader::open(&bytes, PackLimits::default()).expect("opens");
        assert_eq!(json(&reader.document().expect("decodes")), json(&document));
        // Each chunk decodes on its own to exactly its operations.
        for (position, chunk) in reader.header().chunks.iter().enumerate() {
            let first = usize::try_from(chunk.first_operation_index).expect("index");
            let count = usize::try_from(chunk.operation_count).expect("count");
            let expected = &document.operations[first..first + count];
            let decoded = reader.chunk(position).expect("chunk");
            assert_eq!(
                serde_json::to_value(&decoded).expect("json"),
                serde_json::to_value(expected).expect("json")
            );
        }
    }
}

#[test]
fn every_shape_kind_and_hole_detail_is_exercised() {
    let document = materialize_board(BOARD, &request(&ALL, 10_000_000)).expect("materializes");
    let value = serde_json::to_value(&document).expect("json");
    let kinds: std::collections::BTreeSet<&str> = value["operations"]
        .as_array()
        .expect("operations")
        .iter()
        .filter_map(|op| op["shape"]["kind"].as_str())
        .collect();
    for kind in [
        "disk_2d",
        "rect_2d",
        "rounded_rect_2d",
        "chamfered_rect_2d",
        "trapezoid_2d",
        "capsule_2d",
        "swept_path_2d",
        "planar_region_2d",
    ] {
        assert!(kinds.contains(kind), "{kind} in {kinds:?}");
    }
    let ops = value["operations"].as_array().expect("operations");
    assert!(ops.iter().any(|op| op["group_key"].is_string()));
    assert!(ops.iter().any(|op| op["offset_nm"].is_number()));
    assert!(
        ops.iter()
            .any(|op| op["backdrills"].as_array().is_some_and(|b| !b.is_empty()))
    );
    assert!(ops.iter().any(|op| op["protection"].is_object()));
}

#[test]
fn damaged_producer_packs_fail_closed() {
    let document = materialize_board(BOARD, &request(&ALL, 10_000_000)).expect("materializes");
    let bytes = encode_pack(&document).expect("packs");
    let decode = |bytes: &[u8]| PackReader::open(bytes, PackLimits::default())?.document();
    for cut in (0..bytes.len()).step_by(13) {
        assert!(decode(&bytes[..cut]).is_err(), "truncated at {cut}");
    }
    for position in (16..bytes.len()).step_by(7) {
        let mut damaged = bytes.clone();
        damaged[position] ^= 0x5a;
        // Anything but a panic; a successful decode is a valid document.
        let _ = decode(&damaged);
    }
}
