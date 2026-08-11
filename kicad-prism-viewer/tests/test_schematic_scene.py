from __future__ import annotations

import json
import unittest
from pathlib import Path

from pipeline.topology_compiler.schematic_scene import (
    SCHEMA,
    _inset_label_text_primitive,
    _operation_to_primitive,
    _operation_descriptors,
    _pin_lookup_indexes,
    _polyline_bounds,
    _page_chunks,
    _record_feature,
    _symbol_owner_features,
    _native_preview_svg,
    _native_overlay_svg,
    _visual_regression_page_report,
    _apply_text_length_adjust,
    _schematic_text_length_mm,
    deterministic_feature_ids,
    stable_feature_key,
)


class FakeOperation:
    def __init__(self, payload):
        self.payload = payload

    def to_dict(self):
        return self.payload


class FakeRecord:
    kind = "wire"
    uuid = "wire-uuid"
    object_id = ""
    extras = {}

    def __init__(self, operations):
        self.operations = operations


class FakeSymbolRecord:
    kind = "symbol_instance"
    uuid = "symbol-uuid"
    object_id = "Device:R"

    def __init__(self, operations, extras=None):
        self.operations = operations
        self.extras = extras or {
            "reference": "R1",
            "value": "10k",
            "lib_id": "Device:R",
            "unit": 1,
            "convert": 1,
            "at_angle_deg": 90,
            "mirror": "x",
        }


class SchematicSceneSchemaTests(unittest.TestCase):
    def test_feature_key_is_instance_scoped(self):
        source_uuid = "6c5c5ef1-1559-49e2-a41a-c02fb7de5678"

        first = stable_feature_key("/root/channel_a", source_uuid, 1, "wire", 0)
        second = stable_feature_key("/root/channel_b", source_uuid, 1, "wire", 0)

        self.assertNotEqual(first, second)
        self.assertEqual(
            first,
            "/root/channel_a | 6c5c5ef1-1559-49e2-a41a-c02fb7de5678 | 1 | wire | 0",
        )

    def test_schema_is_vector_a0(self):
        self.assertEqual(SCHEMA, "prism.schematic_vector_a0")

    def test_feature_ids_are_sorted_and_reserve_zero(self):
        ids = deterministic_feature_ids({"z-key", "a-key", "m-key"})

        self.assertEqual(ids, {"a-key": 1, "m-key": 2, "z-key": 3})
        self.assertNotIn(0, ids.values())

    def test_operation_primitive_converts_nm_to_mm(self):
        primitive, unsupported = _operation_to_primitive(
            FakeOperation(
                {
                    "kind": "Line",
                    "x1": 1_000_000,
                    "y1": 2_000_000,
                    "x2": 4_000_000,
                    "y2": 6_000_000,
                    "width_nm": 150_000,
                }
            ),
            feature_id=42,
        )

        self.assertIsNone(unsupported)
        self.assertEqual(primitive["featureId"], 42)
        self.assertEqual(primitive["kind"], "line")
        self.assertEqual(primitive["x1Mm"], 1.0)
        self.assertEqual(primitive["y2Mm"], 6.0)
        self.assertEqual(primitive["widthMm"], 0.15)

    def test_operation_without_geometry_is_reported(self):
        primitive, unsupported = _operation_to_primitive(FakeOperation({"kind": "Unsupported"}), 7)

        self.assertIsNone(primitive)
        self.assertEqual(unsupported, "Unsupported")

    def test_arc_three_point_is_tessellated_at_build_time(self):
        primitive, unsupported = _operation_to_primitive(
            FakeOperation(
                {
                    "kind": "ArcThreePoint",
                    "start_x": 0,
                    "start_y": 0,
                    "mid_x": 1_000_000,
                    "mid_y": -1_000_000,
                    "end_x": 2_000_000,
                    "end_y": 0,
                    "width_nm": 152_400,
                    "stroke_color": "#840000FF",
                    "line_style": "DASH",
                }
            ),
            7,
        )

        self.assertIsNone(unsupported)
        self.assertTrue(primitive["tessellated"])
        self.assertGreater(len(primitive["pointsMm"]), 3)
        self.assertEqual(primitive["lineStyle"], "DASH")
        self.assertEqual(primitive["color"], "#840000FF")

    def test_thick_segment_preserves_start_end_and_color(self):
        primitive, unsupported = _operation_to_primitive(
            FakeOperation(
                {
                    "kind": "ThickSegment",
                    "start_x": 1_000_000,
                    "start_y": 2_000_000,
                    "end_x": 3_000_000,
                    "end_y": 4_000_000,
                    "width_nm": 457_200,
                    "stroke_color": "#DC090DD9",
                }
            ),
            7,
        )

        self.assertIsNone(unsupported)
        self.assertEqual(primitive["start_xMm"], 1.0)
        self.assertEqual(primitive["end_yMm"], 4.0)
        self.assertEqual(primitive["widthMm"], 0.4572)
        self.assertEqual(primitive["color"], "#DC090DD9")

    def test_filled_plot_polygon_is_triangulated_at_build_time(self):
        primitive, unsupported = _operation_to_primitive(
            FakeOperation(
                {
                    "kind": "PlotPoly",
                    "points": [
                        [0, 0],
                        [4_000_000, 0],
                        [4_000_000, 1_000_000],
                        [2_000_000, 500_000],
                        [0, 1_000_000],
                    ],
                    "fill": "FILLED_SHAPE",
                    "fill_color": "#123456FF",
                }
            ),
            7,
        )

        self.assertIsNone(unsupported)
        self.assertIn(primitive["triangulation"], {"earcut", "earclip-simple"})
        self.assertGreaterEqual(len(primitive["trianglesMm"]), 3)
        self.assertEqual(primitive["fillColor"], "#123456FF")

    def test_filled_polygon_with_hole_uses_build_time_triangulation(self):
        primitive, unsupported = _operation_to_primitive(
            FakeOperation(
                {
                    "kind": "PlotPoly",
                    "contours": [
                        [[0, 0], [6_000_000, 0], [6_000_000, 6_000_000], [0, 6_000_000]],
                        [[2_000_000, 2_000_000], [4_000_000, 2_000_000], [4_000_000, 4_000_000], [2_000_000, 4_000_000]],
                    ],
                    "fill": "FILLED_SHAPE",
                }
            ),
            7,
        )

        self.assertIsNone(unsupported)
        self.assertEqual(primitive.get("contourCount"), 2)
        self.assertEqual(primitive.get("triangulation"), "earcut")
        self.assertGreaterEqual(len(primitive["trianglesMm"]), 4)

    def test_plot_image_becomes_native_image_primitive(self):
        primitive, unsupported = _operation_to_primitive(
            FakeOperation(
                {
                    "kind": "PlotImage",
                    "x": 1_000_000,
                    "y": 2_000_000,
                    "width_nm": 3_000_000,
                    "height_nm": 4_000_000,
                    "image_data_b64": "iVBORw0KGgo=",
                    "image_format": "png",
                }
            ),
            7,
        )

        self.assertIsNone(unsupported)
        self.assertEqual(primitive["kind"], "plotimage")
        self.assertEqual(primitive["centerXMm"], 1.0)
        self.assertEqual(primitive["centerYMm"], 2.0)
        self.assertEqual(primitive["boundsMm"], [-0.5, 0.0, 2.5, 4.0])
        self.assertEqual(primitive["imageFormat"], "png")

    def test_render_block_markers_are_ignored(self):
        primitive, unsupported = _operation_to_primitive(FakeOperation({"kind": "StartBlock"}), 7)

        self.assertIsNone(primitive)
        self.assertIsNone(unsupported)

    def test_empty_text_is_ignored_not_reported_unsupported(self):
        primitive, unsupported = _operation_to_primitive(FakeOperation({"kind": "TextEmpty"}), 7)

        self.assertIsNone(primitive)
        self.assertIsNone(unsupported)

    def _text_primitive(self, **overrides):
        payload = {
            "kind": "Text",
            "text": "R1",
            "x": 10_000_000,
            "y": 20_000_000,
            "size_x_nm": 1_270_000,
            "size_y_nm": 1_270_000,
            "h_align": "left",
            "v_align": "bottom",
        }
        payload.update(overrides)
        primitive, unsupported = _operation_to_primitive(FakeOperation(payload), 7)
        self.assertIsNone(unsupported)
        self.assertEqual(primitive["featureId"], 7)
        self.assertEqual(primitive["kind"], "text_strokes")
        self.assertEqual(primitive["provider"], "newstroke")
        self.assertEqual(primitive["style"]["provider"], "newstroke")
        self.assertGreater(len(primitive["polylinesMm"]), 0)
        return primitive

    def test_uncached_text_uses_newstroke_provider(self):
        primitive, unsupported = _operation_to_primitive(
            FakeOperation({"kind": "Text", "text": "R1", "x": 0, "y": 0}),
            7,
        )

        self.assertIsNone(unsupported)
        self.assertEqual(primitive["provider"], "newstroke")
        self.assertGreater(primitive["widthMm"], 0)
        self.assertEqual(primitive["text"], "R1")

    def test_render_cache_text_is_preferred_over_newstroke(self):
        primitive, unsupported = _operation_to_primitive(
            FakeOperation(
                {
                    "kind": "Text",
                    "text": "R1",
                    "render_cache_polygons": [
                        [[0, 0], [1_000_000, 0], [1_000_000, 1_000_000]],
                    ],
                }
            ),
            7,
        )

        self.assertIsNone(unsupported)
        self.assertEqual(primitive["kind"], "text_contours")
        self.assertEqual(primitive["provider"], "render_cache")
        self.assertNotIn("polylinesMm", primitive)

    def test_newstroke_accepts_kicad_alignment_enum_values(self):
        primitive = self._text_primitive(
            h_align="GR_TEXT_H_ALIGN_CENTER",
            v_align="GR_TEXT_V_ALIGN_TOP",
        )

        self.assertEqual(primitive["style"]["hAlign"], "center")
        self.assertEqual(primitive["style"]["vAlign"], "top")

    def test_newstroke_horizontal_alignment_affects_bounds(self):
        left = self._text_primitive(h_align="left")
        center = self._text_primitive(h_align="center")
        right = self._text_primitive(h_align="right")

        left_bounds = _polyline_bounds(left["polylinesMm"])
        center_bounds = _polyline_bounds(center["polylinesMm"])
        right_bounds = _polyline_bounds(right["polylinesMm"])

        self.assertGreater(left_bounds[0], center_bounds[0])
        self.assertGreater(center_bounds[0], right_bounds[0])

    def test_newstroke_vertical_alignment_affects_bounds(self):
        top = self._text_primitive(v_align="top")
        center = self._text_primitive(v_align="center")
        bottom = self._text_primitive(v_align="bottom")

        top_bounds = _polyline_bounds(top["polylinesMm"])
        center_bounds = _polyline_bounds(center["polylinesMm"])
        bottom_bounds = _polyline_bounds(bottom["polylinesMm"])

        self.assertGreater(top_bounds[1], center_bounds[1])
        self.assertGreater(center_bounds[1], bottom_bounds[1])

    def test_newstroke_cardinal_rotations_emit_geometry(self):
        bounds_by_angle = {}
        for angle in (0, 90, 180, 270):
            primitive = self._text_primitive(orient_deg=angle)
            bounds_by_angle[angle] = _polyline_bounds(primitive["polylinesMm"])
            self.assertEqual(primitive["style"]["orientDeg"], angle)

        width_0 = bounds_by_angle[0][2] - bounds_by_angle[0][0]
        height_0 = bounds_by_angle[0][3] - bounds_by_angle[0][1]
        width_90 = bounds_by_angle[90][2] - bounds_by_angle[90][0]
        height_90 = bounds_by_angle[90][3] - bounds_by_angle[90][1]
        self.assertAlmostEqual(width_0, height_90, delta=0.12)
        self.assertAlmostEqual(height_0, width_90, delta=0.12)

    def test_newstroke_mirror_and_italic_are_recorded_and_change_geometry(self):
        normal = self._text_primitive(text="ABC")
        mirrored = self._text_primitive(text="ABC", mirror=True)
        italic = self._text_primitive(text="ABC", italic=True)

        self.assertTrue(mirrored["style"]["mirror"])
        self.assertTrue(italic["style"]["italic"])
        self.assertNotEqual(normal["polylinesMm"][0][0], mirrored["polylinesMm"][0][0])
        self.assertNotEqual(normal["polylinesMm"][0][0], italic["polylinesMm"][0][0])

    def test_newstroke_italic_uses_y_down_compensation(self):
        primitive = self._text_primitive(text="ABC", italic=True)
        normal = self._text_primitive(text="ABC", italic=False)

        self.assertEqual(len(primitive["polylinesMm"]), len(normal["polylinesMm"]))
        self.assertGreater(
            primitive["polylinesMm"][0][0][0],
            normal["polylinesMm"][0][0][0],
        )

    def test_newstroke_multiline_emits_multiple_lines(self):
        single = self._text_primitive(text="R1")
        multi = self._text_primitive(text="R1\nC2")

        self.assertGreater(len(multi["polylinesMm"]), len(single["polylinesMm"]))
        self.assertTrue(multi["style"]["multiline"])
        self.assertEqual(multi["style"]["lineCount"], 2)

    def test_label_text_inset_moves_left_aligned_hierarchical_text_inward(self):
        primitive = self._text_primitive(text="SDA", h_align="left")
        before = primitive["boundsMm"][0]

        _inset_label_text_primitive(primitive, "hierarchical_label")

        self.assertGreater(primitive["boundsMm"][0], before)

    def test_global_label_text_keeps_plotter_position(self):
        primitive = self._text_primitive(text="SDA", h_align="left")
        before = list(primitive["boundsMm"])

        _inset_label_text_primitive(primitive, "global_label")

        self.assertEqual(primitive["boundsMm"], before)

    def test_newstroke_text_length_matches_kicad_svg_metric(self):
        primitive = self._text_primitive(text="PFE_MAC2_RXD3", h_align="left")
        bounds = _polyline_bounds(primitive["polylinesMm"])
        target_width = _schematic_text_length_mm("PFE_MAC2_RXD3", 1_270_000)

        self.assertAlmostEqual(bounds[2] - bounds[0], target_width, delta=0.12)
        self.assertEqual(primitive["style"]["lengthAdjust"], "spacingAndGlyphs")

    def test_text_length_adjust_scales_height_with_width(self):
        adjusted = _apply_text_length_adjust(
            [[(0.0, 0.0), (10.0, 0.0), (10.0, 2.0), (0.0, 2.0)]],
            target_length_mm=5.0,
            angle_deg=0,
            h_align="left",
            v_align="bottom",
        )
        bounds = _polyline_bounds([[[x, y] for x, y in polyline] for polyline in adjusted])

        self.assertAlmostEqual(bounds[2] - bounds[0], 5.0)
        self.assertAlmostEqual(bounds[3] - bounds[1], 1.0)

    def test_text_feature_ids_are_deterministic(self):
        key = stable_feature_key("/root/repeated", "text-source", 3, "text", 0)
        ids = deterministic_feature_ids({key, "z"})

        primitive, unsupported = _operation_to_primitive(
            FakeOperation({"kind": "Text", "text": "CLK", "x": 0, "y": 0}),
            ids[key],
        )

        self.assertIsNone(unsupported)
        self.assertEqual(primitive["featureId"], ids[key])

    def test_newstroke_provider_parity_with_existing_svg_polyline_path(self):
        primitive = self._text_primitive(text="R1", x=0, y=0)

        from kicad_monkey.kicad_sch_svg_renderer import (  # type: ignore
            KiCadSvgRenderContext,
            KiCadSvgRenderOptions,
            svg_text_poly,
        )

        ctx = KiCadSvgRenderContext(
            options=KiCadSvgRenderOptions(text_polyline_per_segment=False)
        )
        svg = svg_text_poly(
            0,
            0,
            "R1",
            ctx=ctx,
            size_x_nm=1_270_000,
            size_y_nm=1_270_000,
            h_align="GR_TEXT_H_ALIGN_LEFT",
            v_align="GR_TEXT_V_ALIGN_BOTTOM",
        )

        self.assertEqual(svg.count("<polyline"), len(primitive["polylinesMm"]))

    def test_page_chunks_create_primitive_sub_features(self):
        page = {
            "id": "page-0001",
            "name": "Root",
            "sheetInstancePath": "/root",
            "sourceWidthMm": 100,
            "sourceHeightMm": 80,
        }
        feature = {
            "id": 12,
            "stableKey": "/root | wire-uuid | 0 | record | 0",
            "pageId": "page-0001",
            "sheetInstancePath": "/root",
            "sourceId": "wire-uuid",
            "uuid": "wire-uuid",
            "objectId": "",
            "kind": "wire",
            "boundsMm": [1, 2, 9, 2],
            "netUid": "net-1",
            "netName": "VCC",
        }
        record = FakeRecord(
            [
                FakeOperation(
                    {
                        "kind": "Line",
                        "x1": 1_000_000,
                        "y1": 2_000_000,
                        "x2": 9_000_000,
                        "y2": 2_000_000,
                        "width_nm": 150_000,
                    }
                )
            ]
        )

        _, _, lod2, unsupported, primitive_features = _page_chunks(
            page,
            [record],
            [feature],
            feature_id_by_key={
                "/root | wire-uuid | 1 | wire | 0": 50,
            },
        )

        self.assertEqual(unsupported, [])
        self.assertEqual(lod2["primitives"][0]["featureId"], 50)
        self.assertEqual(primitive_features[0]["parentFeatureId"], 12)
        self.assertEqual(primitive_features[0]["stableKey"], "/root | wire-uuid | 1 | wire | 0")
        self.assertEqual(primitive_features[0]["netUid"], "net-1")

    def test_symbol_owner_features_create_body_and_pin_records(self):
        page = {"id": "page-0001", "sheetInstancePath": "/root"}
        parent = {
            "id": 10,
            "stableKey": "/root | symbol-uuid | 0 | record | 0",
            "pageId": "page-0001",
            "sheetInstancePath": "/root",
            "sourceId": "symbol-uuid",
            "uuid": "symbol-uuid",
            "objectId": "Device:R",
            "kind": "symbol_instance",
            "reference": "R1",
            "value": "10k",
        }
        design_payload = {
            "components": [{"designator": "R1", "svg_id": "symbol-uuid", "value": "10k"}],
            "nets": [{
                "uid": "net-1",
                "name": "VCC",
                "terminals": [{"designator": "R1", "pin": "1", "pin_name": "A"}],
                "graphical": {"pins": [{"designator": "R1", "pin": "1", "svg_id": "pin-uuid"}]},
            }],
        }
        topology = {
            "components": [{"uid": "cmp-1", "designator": "R1", "value": "10k"}],
            "terminals": [{"uid": "term-1", "component_uid": "cmp-1", "pin": "1", "net_uid": "net-1", "pcb_pad_id": "pad-r1-1"}],
        }
        components = {"R1": {"componentUid": "cmp-1", "componentDesignator": "R1"}}
        pin_lookup = _pin_lookup_indexes(design_payload, topology, components)
        record = FakeSymbolRecord([
            FakeOperation({"kind": "PlotPoly", "points": [[0, 0], [1_000_000, 0], [1_000_000, 1_000_000]]}),
            FakeOperation({
                "kind": "StartBlock",
                "data_ref": "symbol_pin",
                "data_uuid": "pin-uuid",
                "extra_attrs": {"primitive": "pin", "object-type": "pin", "pin": "1", "designator": "R1", "symbol-uuid": "symbol-uuid"},
            }),
            FakeOperation({"kind": "Line", "x1": 0, "y1": 0, "x2": 2_000_000, "y2": 0}),
            FakeOperation({"kind": "Text", "text": "1", "x": 0, "y": 0}),
            FakeOperation({"kind": "Text", "text": "A", "x": 0, "y": 500_000}),
            FakeOperation({"kind": "EndBlock"}),
        ])

        owners = _symbol_owner_features(
            page["id"], page["sheetInstancePath"], record, 1, parent, pin_lookup, components
        )
        by_kind = {feature["kind"]: feature for feature in owners}

        self.assertEqual(by_kind["symbol_body"]["parentStableKey"], parent["stableKey"])
        self.assertEqual(by_kind["pin"]["netUid"], "net-1")
        self.assertEqual(by_kind["pin"]["pcbPadId"], "pad-r1-1")
        self.assertEqual(by_kind["pin"]["componentUid"], "cmp-1")

        dnp_record = FakeSymbolRecord(
            [FakeOperation({"kind": "Line", "x1": 0, "y1": 0, "x2": 1_000_000, "y2": 1_000_000})],
            extras={"reference": "R1", "value": "10k", "dnp": True},
        )
        dnp_owners = _symbol_owner_features(
            page["id"], page["sheetInstancePath"], dnp_record, 1, parent, pin_lookup, components
        )
        self.assertTrue(next(feature for feature in dnp_owners if feature["kind"] == "symbol_body")["dnp"])

    def test_symbol_operation_descriptors_assign_pin_subfeatures(self):
        page = {"id": "page-0001", "sheetInstancePath": "/root", "sourceWidthMm": 50, "sourceHeightMm": 30}
        parent = {
            "id": 10,
            "stableKey": "/root | symbol-uuid | 0 | record | 0",
            "pageId": "page-0001",
            "sheetInstancePath": "/root",
            "sourceId": "symbol-uuid",
            "uuid": "symbol-uuid",
            "objectId": "Device:R",
            "kind": "symbol_instance",
            "reference": "R1",
            "value": "10k",
        }
        pin_lookup = {
            "bySvgId": {"pin-uuid": {"netUid": "net-1", "netName": "VCC", "pinName": "A"}},
            "byDesignatorPin": {("R1", "1"): {"netUid": "net-1", "netName": "VCC", "pinName": "A"}},
        }
        record = FakeSymbolRecord([
            FakeOperation({"kind": "Text", "text": "R1", "x": 0, "y": 0}),
            FakeOperation({"kind": "Text", "text": "10k", "x": 0, "y": 1_000_000}),
            FakeOperation({
                "kind": "StartBlock",
                "data_ref": "symbol_pin",
                "data_uuid": "pin-uuid",
                "extra_attrs": {"primitive": "pin", "object-type": "pin", "pin": "1", "designator": "R1", "symbol-uuid": "symbol-uuid"},
            }),
            FakeOperation({"kind": "Line", "x1": 0, "y1": 0, "x2": 2_000_000, "y2": 0}),
            FakeOperation({"kind": "Text", "text": "1", "x": 0, "y": 0}),
            FakeOperation({"kind": "Text", "text": "A", "x": 0, "y": 500_000}),
            FakeOperation({"kind": "EndBlock"}),
        ])

        descriptors = _operation_descriptors(page, record, 1, parent, pin_lookup, {"R1": {"componentUid": "cmp-1"}})
        roles = [descriptor["semanticRole"] for descriptor in descriptors]

        self.assertEqual(roles, ["symbol_reference", "symbol_value", "pin_body", "pin_number", "pin_name"])
        self.assertEqual(descriptors[2]["sourceId"], "pin-uuid")
        self.assertEqual(descriptors[2]["parentStableKey"], "/root | pin-uuid | 0 | pin | 0")
        self.assertEqual(descriptors[2]["metadata"]["netName"], "VCC")

    def test_dnp_metadata_propagates_to_symbol_subfeatures(self):
        page = {"id": "page-0001", "sheetInstancePath": "/root", "sourceWidthMm": 50, "sourceHeightMm": 30}
        parent = {
            "id": 10,
            "stableKey": "/root | symbol-uuid | 0 | record | 0",
            "pageId": "page-0001",
            "sheetInstancePath": "/root",
            "sourceId": "symbol-uuid",
            "uuid": "symbol-uuid",
            "objectId": "Device:R",
            "kind": "symbol_instance",
            "reference": "R1",
            "value": "10k",
            "dnp": True,
        }
        record = FakeSymbolRecord([FakeOperation({"kind": "Text", "text": "R1", "x": 0, "y": 0})])

        descriptors = _operation_descriptors(page, record, 1, parent, {"bySvgId": {}, "byDesignatorPin": {}}, {})

        self.assertTrue(descriptors[0]["metadata"]["dnp"])

    def test_vr5510_dnp_passives_keep_cross_as_a_top_layer_feature(self):
        """Regression for issue #86 using sanitized R106/R108/C111 IR.

        The fixture contains only the body and DNP-marker operations parsed
        from the reported schematic; no project fields or net data are copied.
        """
        fixture_path = Path(__file__).parent / "fixtures" / "vr5510_dnp_passives.json"
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
        page = {
            "id": "page-vr5510",
            "name": "VR5510_PMIC",
            "sheetInstancePath": "/root/vr5510",
            "sourceWidthMm": 420,
            "sourceHeightMm": 297,
        }

        for item in fixture["symbols"]:
            with self.subTest(reference=item["reference"]):
                record = FakeSymbolRecord(
                    [FakeOperation(operation) for operation in [*item["body"], *item["marker"]]],
                    extras={
                        "reference": item["reference"],
                        "lib_id": item["libId"],
                        "dnp": True,
                        "in_bom": True,
                        "on_board": True,
                    },
                )
                record.uuid = f"fixture-{item['reference'].lower()}"
                parent = _record_feature(
                    page["id"],
                    page["sheetInstancePath"],
                    record,
                    1,
                    0,
                    {},
                )
                self.assertTrue(parent["dnp"])

                owners = _symbol_owner_features(
                    page["id"],
                    page["sheetInstancePath"],
                    record,
                    1,
                    parent,
                    {"bySvgId": {}, "byDesignatorPin": {}},
                    {},
                )
                body = next(feature for feature in owners if feature["kind"] == "symbol_body")
                marker = next(feature for feature in owners if feature["kind"] == "dnp_marker")
                self.assertTrue(marker["dnp"])
                self.assertLess(body["boundsMm"][0], body["boundsMm"][2])
                self.assertLess(marker["boundsMm"][0], body["boundsMm"][0])
                self.assertGreater(marker["boundsMm"][2], body["boundsMm"][2])

                feature_ids = deterministic_feature_ids(
                    {parent["stableKey"], *(feature["stableKey"] for feature in owners)}
                )
                parent["id"] = feature_ids[parent["stableKey"]]
                for feature in owners:
                    feature["id"] = feature_ids[feature["stableKey"]]
                _, _, lod2, unsupported, primitive_features = _page_chunks(
                    page,
                    [record],
                    [parent, *owners],
                    feature_ids,
                )

                self.assertEqual(unsupported, [])
                marker_primitives = [
                    primitive
                    for primitive in lod2["primitives"]
                    if primitive["semanticRole"] == "dnp_marker"
                ]
                self.assertEqual(len(marker_primitives), 2)
                self.assertEqual(
                    {primitive["featureId"] for primitive in marker_primitives},
                    {marker["id"]},
                )
                self.assertEqual(
                    [primitive["semanticRole"] for primitive in lod2["primitives"][-2:]],
                    ["dnp_marker", "dnp_marker"],
                )
                self.assertTrue(
                    all(feature["kind"] == "dnp_marker" for feature in primitive_features[-2:])
                )

    def test_repeated_hierarchy_symbol_and_pin_keys_are_instance_scoped(self):
        symbol_uuid = "same-symbol"
        pin_uuid = "same-pin"

        first_symbol = stable_feature_key("/root/channel_a", symbol_uuid, 0, "symbol_body", 0)
        second_symbol = stable_feature_key("/root/channel_b", symbol_uuid, 0, "symbol_body", 0)
        first_pin = stable_feature_key("/root/channel_a", pin_uuid, 0, "pin", 0)
        second_pin = stable_feature_key("/root/channel_b", pin_uuid, 0, "pin", 0)

        self.assertNotEqual(first_symbol, second_symbol)
        self.assertNotEqual(first_pin, second_pin)

    def test_page_chunks_preserve_pin_parent_and_net(self):
        page = {"id": "page-0001", "name": "Root", "sheetInstancePath": "/root", "sourceWidthMm": 50, "sourceHeightMm": 30}
        record_feature = {
            "id": 10,
            "stableKey": "/root | symbol-uuid | 0 | record | 0",
            "pageId": "page-0001",
            "sheetInstancePath": "/root",
            "sourceId": "symbol-uuid",
            "uuid": "symbol-uuid",
            "objectId": "Device:R",
            "kind": "symbol_instance",
            "reference": "R1",
            "value": "10k",
            "boundsMm": [0, 0, 8, 4],
        }
        pin_feature = {
            "id": 11,
            "stableKey": "/root | pin-uuid | 0 | pin | 0",
            "pageId": "page-0001",
            "sheetInstancePath": "/root",
            "sourceId": "pin-uuid",
            "uuid": "pin-uuid",
            "objectId": "pin-uuid",
            "kind": "pin",
            "reference": "R1",
            "pinNumber": "1",
            "netUid": "net-1",
            "netName": "VCC",
        }
        record = FakeSymbolRecord([
            FakeOperation({
                "kind": "StartBlock",
                "data_ref": "symbol_pin",
                "data_uuid": "pin-uuid",
                "extra_attrs": {"primitive": "pin", "object-type": "pin", "pin": "1", "designator": "R1", "symbol-uuid": "symbol-uuid"},
            }),
            FakeOperation({"kind": "Line", "x1": 0, "y1": 0, "x2": 2_000_000, "y2": 0, "width_nm": 150_000}),
            FakeOperation({"kind": "EndBlock"}),
        ])

        _, _, lod2, _, primitive_features = _page_chunks(
            page,
            [record],
            [record_feature, pin_feature],
            feature_id_by_key={"/root | pin-uuid | 2 | pin_body | 0": 42, "/root | pin-uuid | 0 | pin | 0": 11},
            pin_lookup={"bySvgId": {"pin-uuid": {"netUid": "net-1", "netName": "VCC"}}, "byDesignatorPin": {}},
        )

        self.assertEqual(lod2["primitives"][0]["featureId"], 11)
        self.assertEqual(primitive_features[0]["kind"], "pin")
        self.assertEqual(primitive_features[0]["parentFeatureId"], 11)
        self.assertEqual(primitive_features[0]["netUid"], "net-1")

    def test_native_preview_svg_renders_vectors_images_and_fills(self):
        page = {
            "id": "page-0001",
            "name": "Root",
            "svg": "pages/0001-Root.svg",
            "sourceWidthMm": 100,
            "sourceHeightMm": 80,
        }
        preview = _native_preview_svg(
            page,
            [
                {
                    "featureId": 1,
                    "kind": "line",
                    "x1Mm": 1,
                    "y1Mm": 2,
                    "x2Mm": 9,
                    "y2Mm": 2,
                    "widthMm": 0.15,
                    "color": "#008000FF",
                },
                {
                    "featureId": 2,
                    "kind": "plotpoly",
                    "trianglesMm": [[[0, 0], [1, 0], [0, 1]]],
                    "fillColor": "#840000FF",
                },
                {
                    "featureId": 3,
                    "kind": "plotimage",
                    "xMm": 10,
                    "yMm": 12,
                    "widthMm": 20,
                    "heightMm": 8,
                    "image": {"path": "images/demo.png"},
                },
            ],
        )

        self.assertIn("<line", preview)
        self.assertIn("<polygon", preview)
        self.assertIn('<image href="../images/demo.png"', preview)

    def test_native_overlay_references_source_svg_and_preview(self):
        page = {
            "id": "page-0001",
            "name": "Root",
            "svg": "pages/0001-Root.svg",
            "sourceWidthMm": 100,
            "sourceHeightMm": 80,
        }
        overlay = _native_overlay_svg(page, [{"featureId": 1, "kind": "line", "x1Mm": 0, "y1Mm": 0, "x2Mm": 1, "y2Mm": 1}])

        self.assertIn('<image href="../pages/0001-Root.svg"', overlay)
        self.assertIn('id="native-vector-preview"', overlay)

    def test_visual_regression_report_is_deterministic_and_counts_coverage(self):
        page = {
            "id": "page-0001",
            "name": "Root",
            "svg": "pages/0001-Root.svg",
            "sourceWidthMm": 100,
            "sourceHeightMm": 80,
        }
        primitives = [
            {"featureId": 2, "kind": "text_strokes", "semanticRole": "label", "boundsMm": [1, 1, 3, 2]},
            {"featureId": 1, "kind": "line", "semanticRole": "wire", "boundsMm": [0, 0, 5, 0]},
        ]
        unsupported = [{"operationKind": "BezierCurve", "recordKind": "graphic"}]
        svg = '<svg><path d="M0 0"/><text>R1</text></svg>'

        first = _visual_regression_page_report(page, primitives, unsupported, svg)
        second = _visual_regression_page_report(page, primitives, unsupported, svg)

        self.assertEqual(first, second)
        self.assertEqual(first["nativePrimitiveCount"], 2)
        self.assertEqual(first["nativePrimitiveCounts"], {"line": 1, "text_strokes": 1})
        self.assertEqual(first["nativeSemanticCounts"], {"label": 1, "wire": 1})
        self.assertEqual(first["sourceSvgTagCounts"]["path"], 1)
        self.assertEqual(first["unsupportedCounts"], {"BezierCurve": 1})
        self.assertEqual(first["nativeBoundsMm"], [0, 0, 5, 2])


if __name__ == "__main__":
    unittest.main()
