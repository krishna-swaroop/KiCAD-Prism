//! Correctness rule 1: the producer reads a projected view (only the source
//! families it selects) and must give exactly what a full-model view gives.

use super::{Emitted, emit_view, selection};
use crate::pcb::{PcbLimits, PcbView};
use prism_kicad_contracts::generated::materialization_document::MaterialProduct;

/// A board touching every product: a stackup with a sub-layer, routing,
/// vias, a footprint with pads, text, and graphics, copper and silkscreen
/// zones, board text on copper and silkscreen, and families the producer
/// does not select (a dimension, a group, a property, an image-free
/// target).
const BOARD: &str = r#"(kicad_pcb
  (version 20241229)
  (generator pcbnew)
  (general (thickness 1.6))
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (35 "F.Paste" user) (36 "B.SilkS" user)
    (37 "F.SilkS" user) (38 "B.Mask" user) (39 "F.Mask" user) (44 "Edge.Cuts" user)
    (49 "F.Fab" user))
  (setup
    (stackup
      (layer "F.SilkS" (type "Top Silk Screen"))
      (layer "F.Paste" (type "Top Solder Paste"))
      (layer "F.Mask" (type "Top Solder Mask") (thickness 0.01))
      (layer "F.Cu" (type "copper") (thickness 0.035))
      (layer "dielectric 1" (type "core") (thickness 0.5) (material "FR4") (epsilon_r 4.5)
        addsublayer (thickness 0.9) (material "PP") (epsilon_r 3.8))
      (layer "B.Cu" (type "copper") (thickness 0.035))
      (layer "B.Mask" (type "Bottom Solder Mask") (thickness 0.01))
      (layer "B.SilkS" (type "Bottom Silk Screen")))
    (pad_to_mask_clearance 0.05))
  (property "Project" "rule-one")
  (net 0 "")
  (net 1 "GND")
  (net 2 "VCC")
  (gr_rect (start 0 0) (end 60 40) (stroke (width 0.05) (type solid)) (layer "Edge.Cuts"))
  (gr_text "CU" (at 10 5 0) (layer "F.Cu") (uuid cu-text)
    (effects (font (size 1.5 1.5) (thickness 0.25))))
  (gr_text "SILK" (at 10 35 0) (layer "F.SilkS") (uuid silk-text)
    (effects (font (size 1 1) (thickness 0.15))))
  (gr_line (start 2 2) (end 20 2) (stroke (width 0.15) (type solid)) (layer "F.SilkS")
    (uuid silk-line))
  (dimension (type aligned) (layer "F.Fab") (uuid dim-1)
    (pts (xy 0 50) (xy 60 50)) (height 2)
    (format (units 2) (units_format 1) (precision 2))
    (style (thickness 0.1) (arrow_length 1.27) (text_position_mode 0) (extension_height 0.58)
      (extension_offset 0.5)))
  (footprint "Demo:U"
    (layer "F.Cu")
    (uuid fp-u1)
    (at 20 20 90)
    (property "Reference" "U1" (at 0 -4 90) (layer "F.SilkS") (uuid ref-u1)
      (effects (font (size 1 1) (thickness 0.15))))
    (fp_line (start -3 -2) (end 3 -2) (stroke (width 0.12) (type solid)) (layer "F.SilkS")
      (uuid fp-line))
    (pad "1" smd roundrect (at -2 0 90) (size 1 1.6) (roundrect_rratio 0.25)
      (layers "F.Cu" "F.Mask" "F.Paste") (net 1 "GND") (uuid pad-1))
    (pad "2" thru_hole circle (at 2 0 90) (size 1.6 1.6) (drill 0.8)
      (layers "*.Cu" "*.Mask") (net 2 "VCC") (uuid pad-2)))
  (segment (start 30 10) (end 50 10) (width 0.25) (layer "F.Cu") (net 1) (uuid seg-1))
  (arc (start 30 15) (mid 35 12) (end 40 15) (width 0.25) (layer "B.Cu") (net 2) (uuid arc-1))
  (via (at 50 10) (size 0.8) (drill 0.4) (layers "F.Cu" "B.Cu") (net 1) (uuid via-1))
  (zone (net 1) (net_name "GND") (layer "B.Cu") (uuid zone-cu) (hatch edge 0.5)
    (connect_pads (clearance 0.5)) (min_thickness 0.25) (filled_areas_thickness no)
    (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.5))
    (polygon (pts (xy 42 20) (xy 58 20) (xy 58 38) (xy 42 38)))
    (filled_polygon (layer "B.Cu") (pts (xy 42 20) (xy 58 20) (xy 58 38) (xy 42 38))))
  (zone (net 0) (net_name "") (layer "F.SilkS") (uuid zone-silk) (hatch edge 0.5)
    (connect_pads (clearance 0)) (min_thickness 0.25) (filled_areas_thickness no)
    (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.5))
    (polygon (pts (xy 2 30) (xy 6 30) (xy 6 33) (xy 2 33)))
    (filled_polygon (layer "F.SilkS") (pts (xy 2 30) (xy 6 30) (xy 6 33) (xy 2 33))))
  (group "" (uuid group-1) (members silk-line silk-text))
  (target plus (at 55 5) (size 2) (width 0.1) (layer "F.Fab") (uuid target-1))
)
"#;

const ALL: [MaterialProduct; 7] = [
    MaterialProduct::Copper,
    MaterialProduct::Holes,
    MaterialProduct::Dielectric,
    MaterialProduct::SolderMask,
    MaterialProduct::Paste,
    MaterialProduct::Silkscreen,
    MaterialProduct::Components,
];

fn serialized(emitted: &Emitted) -> [String; 7] {
    let json = |value: serde_json::Result<String>| value.expect("serialize");
    [
        json(serde_json::to_string(&emitted.stack)),
        json(serde_json::to_string(&emitted.nets)),
        json(serde_json::to_string(&emitted.components)),
        json(serde_json::to_string(&emitted.emitter.operations)),
        json(serde_json::to_string(&emitted.emitter.binding)),
        json(serde_json::to_string(&emitted.emitter.diagnostics)),
        json(serde_json::to_string(&emitted.design_facts)),
    ]
}

#[test]
fn a_projected_view_and_a_full_model_view_give_the_same_result() {
    let projected =
        PcbView::parse_selected(BOARD, PcbLimits::default(), selection()).expect("projected");
    let full = PcbView::parse(BOARD, PcbLimits::default()).expect("full model");
    for products in [
        &ALL[..],
        &[MaterialProduct::Copper][..],
        &[MaterialProduct::Silkscreen][..],
    ] {
        let from_projection =
            emit_view(BOARD, Default::default(), &projected, products, None).expect("projected");
        let from_full = emit_view(BOARD, Default::default(), &full, products, None).expect("full");
        assert!(
            !from_full.emitter.operations.is_empty(),
            "the board materializes something for {products:?}"
        );
        assert_eq!(
            serialized(&from_projection),
            serialized(&from_full),
            "rule 1 for {products:?}"
        );
    }
}
