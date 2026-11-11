use prism_kicad_core::{ErrorKind, PcbLimits, PcbPoint, PcbView, PcbZone, PcbZonePlacementSource};

const ZONES: &str = r#"(kicad_pcb
  (net 1 "GND")
  (zone (net 1) (net_name "GND") (locked yes) (layers "F.Cu" "B.Cu")
    (uuid zone-copper) (name "Power") (hatch edge 0.6) (priority 3)
    (placement (enabled yes) (component_class "RF"))
    (connect_pads (clearance 0.7))
    (min_thickness 0.3) (filled_areas_thickness yes)
    (fill yes (thermal_gap 0.4) (thermal_bridge_width 0.6)
      (island_removal_mode 2) (island_area_min 5))
    (property (layer "F.Cu") (hatch_position (xy 1 2)))
    (property (future_setting yes))
    (polygon (pts (xy 0 0) (xy 10 0) (xy 10 10)))
    (filled_polygon (layer "F.Cu") (island)
      (pts (xy 0 0) (xy 10 0) (xy 10 10) (xy 0 10))))
  (zone (net 0) (net_name "") (layer "F.Cu") (uuid zone-keepout)
    (keepout (tracks allowed) (vias not_allowed))
    (polygon (pts (xy 1 1) (xy 2 1) (xy 2 2))))
)"#;

#[test]
fn zones_expose_authored_and_filled_source_semantics() {
    let view = PcbView::parse(ZONES, PcbLimits::default()).expect("board");
    let zones = view.zones().collect::<Result<Vec<_>, _>>().expect("zones");
    assert_eq!(zones.len(), 2);

    let copper = &zones[0];
    assert_copper_identity(copper);
    assert_copper_fill(copper);
    assert_copper_geometry(copper);
    assert_keepout(&zones[1]);
    let explicit = ZONES.replace(
        "(keepout (tracks allowed) (vias not_allowed))",
        "(keepout (tracks allowed) (vias not_allowed) (pads not_allowed) (footprints allowed) (copperpour allowed))",
    );
    let explicit_view = PcbView::parse(&explicit, PcbLimits::default()).expect("explicit board");
    let explicit_zone = explicit_view.zones().nth(1).unwrap().unwrap();
    let settings = explicit_zone.keepout.unwrap();
    assert_eq!(settings.pads, "not_allowed");
    assert_eq!(settings.footprints, "allowed");
    assert_eq!(settings.copperpour, "allowed");
    assert!(settings.has_tracks && settings.has_vias && settings.has_pads);
    assert!(settings.has_footprints && settings.has_copperpour);
    assert_placement_declaration_fidelity();
}

#[test]
fn zones_surface_fill_settings_that_a_rewriter_must_not_drop() {
    let source = r#"(kicad_pcb
      (zone (net 0) (layer "F.Cu") (hatch edge 0.5)
        (connect_pads (clearance 0.2)) (min_thickness 0.1)
        (fill yes (mode hatch) (hatch_thickness 0.2) (hatch_gap 0.3)
          (hatch_orientation 45) (hatch_smoothing_level 1)
          (hatch_smoothing_value 0.1) (hatch_border_algorithm hatch_thickness)
          (hatch_min_hole_area 0.4) (smoothing fillet) (radius 0.25)
          (arc_segments 16) (thermal_gap 0.2) (thermal_bridge_width 0.3))
        (polygon (pts (xy 0 0) (xy 10 0) (xy 10 10)))))"#;
    let view = PcbView::parse(source, PcbLimits::default()).unwrap();
    let zone = view.zones().next().unwrap().unwrap();
    assert_eq!(
        zone.unmodeled_fill_settings,
        [
            "mode=hatch",
            "hatch_thickness",
            "hatch_gap",
            "hatch_orientation",
            "hatch_smoothing_level",
            "hatch_smoothing_value",
            "hatch_border_algorithm",
            "hatch_min_hole_area",
            "smoothing",
            "radius",
            "arc_segments",
        ]
    );
    assert_eq!(zone.corner_smoothing.as_deref(), Some("fillet"));
    assert_eq!(zone.corner_radius, Some(0.25));
    let hatch = zone.hatch_fill.expect("hatched fill");
    assert_eq!(
        (hatch.thickness, hatch.gap, hatch.orientation),
        (Some(0.2), Some(0.3), Some(45.0))
    );
}

fn assert_placement_declaration_fidelity() {
    for (declaration, enabled, present) in [
        ("(enabled yes)", true, true),
        ("(enabled no)", false, true),
        ("(enabled no) (enabled yes)", true, true),
        ("(enabled yes) (enabled no)", false, true),
        ("", false, false),
    ] {
        let source = format!(
            "(kicad_pcb (zone (keepout) (placement {declaration} (sheetname \"/TOP_LEVEL_IO/\"))))"
        );
        let view = PcbView::parse(&source, PcbLimits::default()).unwrap();
        let placement = view.zones().next().unwrap().unwrap().placement.unwrap();
        assert_eq!(
            (placement.enabled, placement.has_enabled),
            (enabled, present)
        );
        assert_eq!(placement.source_type, PcbZonePlacementSource::SheetName);
        assert_eq!(placement.source, "/TOP_LEVEL_IO/");
    }
    for declaration in ["(enabled)", "(enabled perhaps)"] {
        let source = format!("(kicad_pcb (zone (placement {declaration})))");
        let view = PcbView::parse(&source, PcbLimits::default()).unwrap();
        assert!(view.zones().next().unwrap().is_err());
    }
}

fn assert_copper_identity(copper: &PcbZone) {
    assert_eq!(copper.net.ordinal, Some(1));
    assert_eq!(copper.net.name.as_deref(), Some("GND"));
    assert_eq!(copper.net_name.as_deref(), Some("GND"));
    assert!(copper.has_explicit_net_name);
    assert_eq!(copper.layers, ["F.Cu", "B.Cu"]);
    assert!(copper.layers_plural);
    assert!(copper.locked);
    assert_eq!(copper.uuid.as_deref(), Some("zone-copper"));
    assert_eq!(copper.name.as_deref(), Some("Power"));
    assert_eq!(copper.hatch_style, "edge");
    assert_eq!(copper.hatch_pitch, 0.6);
    assert_eq!(copper.priority, 3);
}

fn assert_copper_fill(copper: &PcbZone) {
    assert_eq!(copper.connect_pads_clearance, 0.7);
    assert_eq!(copper.min_thickness, 0.3);
    assert!(copper.filled_areas_thickness);
    assert!(copper.fill_enabled);
    assert_eq!(copper.thermal_gap, 0.4);
    assert_eq!(copper.thermal_bridge_width, 0.6);
    assert_eq!(copper.island_removal_mode, Some(2));
    assert_eq!(copper.island_area_min, Some(5.0));
    assert!(copper.keepout.is_none());

    let placement = copper.placement.as_ref().expect("placement");
    assert!(placement.enabled);
    assert!(placement.has_enabled);
    assert_eq!(
        placement.source_type,
        PcbZonePlacementSource::ComponentClass
    );
    assert_eq!(placement.source_type.as_str(), "component_class");
    assert_eq!(placement.source, "RF");
}

fn assert_copper_geometry(copper: &PcbZone) {
    assert_eq!(copper.layer_properties.len(), 1);
    assert_eq!(copper.layer_properties[0].layer, "F.Cu");
    assert_eq!(
        copper.layer_properties[0].hatch_offset,
        PcbPoint { x: 1.0, y: 2.0 }
    );
    assert_eq!(copper.polygons.len(), 1);
    assert_eq!(copper.polygons[0].points.len(), 3);
    assert_eq!(copper.filled_polygons.len(), 1);
    assert_eq!(copper.filled_polygons[0].layer, "F.Cu");
    assert!(copper.filled_polygons[0].island);
    assert_eq!(copper.filled_polygons[0].points.len(), 4);
    assert!(ZONES[copper.source_range.clone()].starts_with("(zone"));
}

fn assert_keepout(keepout: &PcbZone) {
    assert_eq!(keepout.net.ordinal, Some(0));
    assert_eq!(keepout.net.name.as_deref(), Some(""));
    assert_eq!(keepout.net_name.as_deref(), Some(""));
    assert!(keepout.has_explicit_net_name);
    assert!(!keepout.layers_plural);
    let settings = keepout.keepout.as_ref().expect("keepout");
    assert_eq!(settings.tracks, "allowed");
    assert_eq!(settings.vias, "not_allowed");
    assert_eq!(settings.pads, "allowed");
    assert_eq!(settings.copperpour, "not_allowed");
    assert_eq!(settings.footprints, "allowed");
    assert!(settings.has_tracks && settings.has_vias);
    assert!(!settings.has_pads && !settings.has_footprints && !settings.has_copperpour);
}

#[test]
fn absent_zone_fields_match_python_defaults() {
    let source = "(kicad_pcb (zone (layers) (property)))";
    let view = PcbView::parse(source, PcbLimits::default()).expect("board");
    let zone = view.zones().next().expect("zone").expect("decoded");
    assert_eq!(zone.net.ordinal, Some(0));
    assert_default_zone_scalars(&zone);
    assert_default_zone_collections(&zone);
}

fn assert_default_zone_scalars(zone: &PcbZone) {
    assert_eq!(zone.layers, Vec::<String>::new());
    assert!(!zone.layers_plural);
    assert!(!zone.locked);
    assert_eq!(zone.hatch_style, "edge");
    assert_eq!(zone.hatch_pitch, 0.5);
    assert_eq!(zone.priority, 0);
    assert_eq!(zone.connect_pads_clearance, 0.5);
    assert_eq!(zone.min_thickness, 0.25);
    assert!(!zone.filled_areas_thickness);
    assert!(!zone.fill_enabled);
    assert_eq!(zone.thermal_gap, 0.5);
    assert_eq!(zone.thermal_bridge_width, 0.5);
    assert!(zone.island_removal_mode.is_none());
    assert!(zone.island_area_min.is_none());
}

fn assert_default_zone_collections(zone: &PcbZone) {
    assert!(zone.keepout.is_none());
    assert!(zone.placement.is_none());
    assert!(zone.layer_properties.is_empty());
    assert!(zone.polygons.is_empty());
    assert!(zone.filled_polygons.is_empty());
}

#[test]
fn zone_collection_limits_are_lazy_and_fail_closed() {
    for limits in [
        PcbLimits {
            max_zone_polygons: 1,
            ..PcbLimits::default()
        },
        PcbLimits {
            max_zone_points: 6,
            ..PcbLimits::default()
        },
        PcbLimits {
            max_zone_layer_properties: 0,
            ..PcbLimits::default()
        },
    ] {
        let view = PcbView::parse(ZONES, limits).expect("index remains lazy");
        assert_eq!(
            view.zones()
                .next()
                .expect("zone")
                .expect_err("zone limit")
                .kind,
            ErrorKind::ResourceLimit
        );
    }
    // Outlines carry arcs (never shortened); stored fills are XY only, and no
    // reader claims an unknown future element was converted.
    for (carrier, element, decodes) in [
        ("polygon", "(arc (start 1 0) (mid 2 1) (end 1 2))", true),
        ("polygon", "(future_point 1 2)", false),
        (
            "filled_polygon",
            "(arc (start 1 0) (mid 2 1) (end 1 2))",
            false,
        ),
        ("filled_polygon", "(future_point 1 2)", false),
    ] {
        let source =
            format!("(kicad_pcb (zone ({carrier} (pts (xy 0 0) (xy 1 0) {element} (xy 0 2)))))");
        let view = PcbView::parse(&source, PcbLimits::default()).unwrap();
        let zone = view.zones().next().unwrap();
        assert_eq!(zone.is_ok(), decodes, "{carrier} with {element}");
        if let Ok(zone) = zone {
            assert_eq!(zone.polygons[0].points.len(), 4, "the arc keeps both ends");
            assert_eq!(zone.polygons[0].arcs[0].start_index, 1);
        }
    }
}

#[test]
fn exact_zone_point_and_polygon_limits_are_accepted() {
    let view = PcbView::parse(
        ZONES,
        PcbLimits {
            max_zone_polygons: 2,
            max_zone_points: 7,
            max_zone_layer_properties: 1,
            ..PcbLimits::default()
        },
    )
    .expect("board");
    let zone = view.zones().next().expect("zone").expect("exact limits");
    assert_eq!(zone.polygons[0].points.len(), 3);
    assert_eq!(zone.filled_polygons[0].points.len(), 4);
}

#[test]
fn zone_outlines_with_arcs_keep_their_fills() {
    // KiCad writes rounded outlines as arc elements; the stored fills stay XY.
    let source = r#"(kicad_pcb
      (net 1 "GND")
      (zone (net 1) (net_name "GND") (layers "In1.Cu" "In4.Cu") (uuid rounded)
        (polygon (pts
          (arc (start 221 150.3) (mid 223.828427 149.128427) (end 225 146.3))
          (xy 225 42.3)
          (arc (start 225 42.3) (mid 223.828427 39.471573) (end 221 38.3))
          (xy 119 38.3)))
        (filled_polygon (layer "In1.Cu") (pts (xy 0 0) (xy 10 0) (xy 10 10)))
        (filled_polygon (layer "In4.Cu") (pts (xy 0 0) (xy 10 0) (xy 10 10)))))"#;
    let view = PcbView::parse(source, PcbLimits::default()).unwrap();
    let zone = view
        .zones()
        .next()
        .unwrap()
        .expect("a rounded outline decodes");
    let outline = &zone.polygons[0];
    let point = |x, y| PcbPoint { x, y };
    assert_eq!(
        outline.points,
        [
            point(221.0, 150.3),
            point(225.0, 146.3),
            point(225.0, 42.3),
            point(221.0, 38.3),
            point(119.0, 38.3),
        ]
    );
    assert_eq!(outline.arcs.len(), 2);
    assert_eq!(
        (outline.arcs[0].start_index, outline.arcs[1].start_index),
        (0, 2)
    );
    assert_eq!(outline.arcs[1].mid, point(223.828427, 39.471573));
    assert_eq!(zone.filled_polygons.len(), 2);

    // Stored fills still accept only XY elements.
    let arc_fill = source.replace(
        r#"(filled_polygon (layer "In4.Cu") (pts (xy 0 0)"#,
        r#"(filled_polygon (layer "In4.Cu") (pts (arc (start 0 0) (mid 1 1) (end 2 0))"#,
    );
    let view = PcbView::parse(&arc_fill, PcbLimits::default()).unwrap();
    assert!(view.zones().next().unwrap().is_err());
}
