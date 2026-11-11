//! A prepared board answers every request exactly as a direct
//! materialization does, results and errors alike.

use prism_kicad_contracts::generated::materialization_document::MaterializationDocumentA1;
use prism_kicad_contracts::generated::materialization_request::MaterializationRequestA0;
use prism_kicad_core::board_materialization::{
    MaterializationError, PrepareLimits, PreparedBoard, materialize_board,
};
use serde_json::{Value, json};

/// Every product, holes spanning sub-ranges, two nets, and a footprint.
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

const LIMITS: PrepareLimits = PrepareLimits {
    max_source_bytes: 1 << 20,
    max_operations: 1_000_000,
};

fn request(products: &[&str], extra: Value) -> MaterializationRequestA0 {
    let mut value = json!({
        "type": "kicad_monkey.materialization.request",
        "version": "a0",
        "products": products,
        "tile_size_nm": 10_000_000,
        "max_source_bytes": "1048576",
        "max_operations": 1_000_000,
        "max_points": 10_000_000
    });
    if let (Some(target), Some(fields)) = (value.as_object_mut(), extra.as_object()) {
        target.extend(fields.clone());
    }
    serde_json::from_value(value).expect("request decodes")
}

fn text(result: &Result<MaterializationDocumentA1, MaterializationError>) -> String {
    match result {
        Ok(document) => serde_json::to_string(document).expect("serialize"),
        Err(error) => format!("error {error}"),
    }
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

#[test]
fn prepared_results_equal_direct_results() {
    let prepared = PreparedBoard::prepare(BOARD, &LIMITS).expect("prepares");
    let region =
        json!({"min_x_nm": 0, "min_y_nm": 0, "max_x_nm": 12_000_000, "max_y_nm": 12_000_000});
    let requests = [
        request(&ALL, json!({})),
        request(&ALL, json!({"tile_size_nm": 2_000_000})),
        request(&["copper"], json!({})),
        request(&["holes", "dielectric"], json!({})),
        request(&["components", "silkscreen"], json!({})),
        request(&["copper", "holes"], json!({"slice_keys": ["copper.in2"]})),
        request(&["holes"], json!({"slice_keys": ["copper.back"]})),
        request(&ALL, json!({"net_keys": ["GND"]})),
        request(&["copper", "solder_mask"], json!({"region": region})),
        request(&ALL, json!({"slice_keys": ["no.such.slice"]})),
        // Errors: limits, and an invalid request.
        request(&ALL, json!({"max_operations": 3})),
        request(&ALL, json!({"max_points": 5})),
        request(&ALL, json!({"max_source_bytes": "10"})),
        request(&ALL, json!({"tile_size_nm": 0})),
        request(&ALL, json!({"version": "a1"})),
    ];
    let mut operations = Vec::new();
    for request in &requests {
        let direct = materialize_board(BOARD, request);
        operations.push(
            direct
                .as_ref()
                .map_or(0, |document| document.operations.len()),
        );
        assert_eq!(text(&prepared.materialize(request)), text(&direct));
    }
    // Every filter selects something but not everything; errors stay errors.
    let all = operations[0];
    assert!(
        operations[2..9]
            .iter()
            .all(|count| (1..all).contains(count)),
        "{operations:?}"
    );
    assert_eq!(operations[9..], [0; 6]);
}

#[test]
fn preparation_reports_source_errors_and_limits() {
    let error = |source: &str, limits: &PrepareLimits| {
        PreparedBoard::prepare(source, limits)
            .err()
            .expect("fails")
            .code
    };
    assert_eq!(error("(kicad_pcb", &LIMITS), "source_parse");
    assert_eq!(
        error(
            BOARD,
            &PrepareLimits {
                max_source_bytes: 100,
                ..LIMITS
            }
        ),
        "source_too_large"
    );
    assert_eq!(
        error(
            BOARD,
            &PrepareLimits {
                max_operations: 4,
                ..LIMITS
            }
        ),
        "too_many_operations"
    );
}

#[test]
fn a_prepared_board_is_shared_across_threads() {
    let prepared = PreparedBoard::prepare(BOARD, &LIMITS).expect("prepares");
    let expected = text(&materialize_board(BOARD, &request(&["copper"], json!({}))));
    std::thread::scope(|threads| {
        for _ in 0..4 {
            threads.spawn(|| {
                assert_eq!(
                    text(&prepared.materialize(&request(&["copper"], json!({})))),
                    expected
                );
            });
        }
    });
}
