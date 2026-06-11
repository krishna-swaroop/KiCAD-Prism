from app.services.pcb_sexpr_service import strip_zone_fills, edge_cuts_bbox

SAMPLE_PCB = '''(kicad_pcb
  (version 20240108)
  (footprint "Package_SO:SOIC-8"
    (property "Value" "OPAMP (dual)")
    (property "Note" "escaped \\" quote and ) paren")
  )
  (zone
    (net 1)
    (net_name "GND")
    (layer "F.Cu")
    (polygon
      (pts (xy 0 0) (xy 10 0) (xy 10 10) (xy 0 10))
    )
    (filled_polygon
      (layer "F.Cu")
      (pts (xy 0.1 0.1) (xy 9.9 0.1) (xy 9.9 9.9) (xy 0.1 9.9))
    )
    (filled_polygon
      (layer "F.Cu")
      (pts (xy 1 1) (xy 2 1) (xy 2 2))
    )
  )
  (zone
    (net 2)
    (layer "B.Cu")
    (polygon
      (pts (xy 0 0) (xy 5 0) (xy 5 5))
    )
    (filled_segments
      (layer "B.Cu")
      (pts (xy 0 0) (xy 1 1))
    )
  )
)
'''


def _paren_balance(text: str) -> int:
    """Count parens outside double-quoted strings."""
    depth = 0
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == '"':
            i += 1
            while i < len(text):
                if text[i] == '\\':
                    i += 2
                    continue
                if text[i] == '"':
                    break
                i += 1
        elif ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        i += 1
    return depth


def test_removes_all_fill_blocks():
    result = strip_zone_fills(SAMPLE_PCB)
    assert "filled_polygon" not in result
    assert "filled_segments" not in result


def test_preserves_balance_and_outlines():
    result = strip_zone_fills(SAMPLE_PCB)
    assert _paren_balance(result) == 0
    # Zone outlines and zone count untouched
    assert result.count("(zone") == 2
    assert result.count("(polygon") == 2
    # Quoted strings with parens/escapes survive intact
    assert '"OPAMP (dual)"' in result
    assert '"escaped \\" quote and ) paren"' in result


def test_idempotent():
    once = strip_zone_fills(SAMPLE_PCB)
    assert strip_zone_fills(once) == once


def test_no_zones_unchanged():
    text = '(kicad_pcb (version 20240108) (footprint "R_0603" (property "Value" "10k")))\n'
    assert strip_zone_fills(text) == text


def test_unbalanced_input_returned_safely():
    # Truncated file: stripper must not crash or drop the remainder
    text = '(kicad_pcb (zone (filled_polygon (pts (xy 0 0)'
    assert strip_zone_fills(text) == text


OUTLINE_PCB = '''(kicad_pcb
  (gr_line (start 10 20) (end 110 20) (layer "Edge.Cuts") (width 0.1))
  (gr_line (start 110 20) (end 110 80) (layer "Edge.Cuts") (width 0.1))
  (gr_arc (start 110 80) (mid 60 95) (end 10 80) (layer "Edge.Cuts") (width 0.1))
  (gr_line (start 10 80) (end 10 20) (layer "Edge.Cuts") (width 0.1))
  (gr_line (start 0 0) (end 300 0) (layer "Dwgs.User") (width 0.1))
  (segment (start -5 -5) (end 400 400) (layer "F.Cu"))
)
'''


def test_edge_cuts_bbox_basic():
    bbox = edge_cuts_bbox(OUTLINE_PCB)
    assert bbox is not None
    min_x, min_y, max_x, max_y = bbox
    # Arc mid (60, 95) extends the bbox below the straight edges;
    # non-Edge.Cuts geometry (Dwgs.User drawing, F.Cu segment) is ignored
    assert (min_x, min_y) == (10.0, 20.0)
    assert (max_x, max_y) == (110.0, 95.0)


def test_edge_cuts_bbox_circle():
    text = '(kicad_pcb (gr_circle (center 50 50) (end 70 50) (layer "Edge.Cuts")))'
    assert edge_cuts_bbox(text) == (30.0, 30.0, 70.0, 70.0)


def test_edge_cuts_bbox_none_without_outline():
    text = '(kicad_pcb (gr_line (start 0 0) (end 10 10) (layer "F.SilkS")))'
    assert edge_cuts_bbox(text) is None
    assert edge_cuts_bbox("(kicad_pcb)") is None


def test_edge_cuts_bbox_ignores_footprint_graphics():
    # fp_line on Edge.Cuts would need the footprint transform; it is ignored
    text = '(kicad_pcb (footprint "X" (at 100 100) (fp_line (start 0 0) (end 5 5) (layer "Edge.Cuts"))))'
    assert edge_cuts_bbox(text) is None
