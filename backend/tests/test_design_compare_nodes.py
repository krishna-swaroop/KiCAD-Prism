"""Parser-level object changes: their taxonomy, and how they group."""

import unittest
from unittest import mock

from app.services import bom_diff_service, design_compare_service
from tests.design_compare_fixtures import component, design, net


class SemanticFixtures:
    """Adapts the shared builders onto the `self._design(...)` call style the
    tests were written in, so moving them between files changes only imports."""

    _design = staticmethod(design)
    _component = staticmethod(component)
    _net = staticmethod(net)


class DesignCompareNodesTests(SemanticFixtures, unittest.TestCase):
    def test_node_change_routes_native_identity_without_geometry(self) -> None:
        change = design_compare_service._node_change(
            {
                "key": "board.kicad_pcb#u1",
                "status": "modified",
                "reasons": ["moved", "rotated"],
                "positionDelta": {"dx": 3, "dy": 4, "distance": 5},
                "base": {
                    "uuid": "u1",
                    "kind": "footprint",
                    "documentPath": "board.kicad_pcb",
                    "at": [10, 20],
                    "rotation": 0,
                    "refdes": "U1",
                },
                "compare": {
                    "uuid": "u1",
                    "kind": "footprint",
                    "documentPath": "board.kicad_pcb",
                    "at": [13, 24],
                    "rotation": 90,
                    "refdes": "U1",
                },
            }
        )

        self.assertEqual(change["kind"], "changed")
        self.assertEqual(change["page"], "board.kicad_pcb")
        self.assertEqual(change["object_kind"], "footprint")
        self.assertEqual(change["position_base"], [10, 20])
        self.assertEqual(change["position_compare"], [13, 24])
        self.assertEqual(change["reference"], "U1")
        self.assertEqual(
            change["details"]["visualTargets"][0]["reference"],
            "U1",
        )
        self.assertNotIn("geometry", change)
        self.assertNotIn("oldGeometry", change)
    def test_node_change_normalizes_structured_parser_layers(self) -> None:
        change = design_compare_service._node_change(
            {
                "key": "board.kicad_pcb#graphic-1",
                "status": "modified",
                "base": {
                    "uuid": "graphic-1",
                    "kind": "drawing",
                    "documentPath": "board.kicad_pcb",
                    "layer": {"name": "F.SilkS", "knockout": False},
                },
                "compare": {
                    "uuid": "graphic-1",
                    "kind": "drawing",
                    "documentPath": "board.kicad_pcb",
                    "layer": {"name": "B.SilkS", "knockout": False},
                    "layers": [{"canonical_name": "User.Drawings"}],
                },
            }
        )

        self.assertEqual(
            change["layers"],
            ["B.SilkS", "F.SilkS", "User.Drawings"],
        )
        self.assertEqual(change["base_item"]["layer"], "F.SilkS")
        self.assertEqual(change["compare_item"]["layer"], "B.SilkS")
        self.assertEqual(change["base_item"]["layers"], ["F.SilkS"])
        self.assertEqual(
            change["compare_item"]["layers"],
            ["B.SilkS", "User.Drawings"],
        )
    def test_node_change_keeps_via_span_per_revision(self) -> None:
        """A focused routing review shows each pane only the copper that
        revision carries, so the span endpoints cannot be merged."""
        change = design_compare_service._node_change(
            {
                "key": "board.kicad_pcb#via-1",
                "status": "modified",
                "reasons": ["layer-changed"],
                "base": {
                    "uuid": "via-1",
                    "kind": "via",
                    "documentPath": "board.kicad_pcb",
                    "layer": "F.Cu",
                    "layers": ["F.Cu", "In1.Cu"],
                    "net": "USB_DP",
                },
                "compare": {
                    "uuid": "via-1",
                    "kind": "via",
                    "documentPath": "board.kicad_pcb",
                    "layer": "F.Cu",
                    "layers": ["F.Cu", "B.Cu"],
                    "net": "USB_DP",
                },
            }
        )

        self.assertEqual(change["base_item"]["layers"], ["F.Cu", "In1.Cu"])
        self.assertEqual(change["compare_item"]["layers"], ["B.Cu", "F.Cu"])
        self.assertEqual(change["layers"], ["B.Cu", "F.Cu", "In1.Cu"])
    def test_node_change_uses_reviewer_taxonomy_for_exact_objects(self) -> None:
        cases = [
            ("no_connect", "root.kicad_sch", None, "nets", "primary"),
            ("bus_entry", "root.kicad_sch", None, "nets", "primary"),
            ("sheet_pin", "root.kicad_sch", None, "nets", "primary"),
            ("sheet", "root.kicad_sch", None, "sheets", "primary"),
            ("zone", "board.kicad_pcb", "F.Cu", "zones", "primary"),
            ("pad", "board.kicad_pcb", "F.Cu", "components", "primary"),
            ("drawing", "board.kicad_pcb", "Edge.Cuts", "graphics", "primary"),
            ("footprint_graphic", "board.kicad_pcb", "F.Fab", "graphics", "primary"),
            ("drawing", "board.kicad_pcb", "Dwgs.User", "graphics", "secondary"),
            ("group", "board.kicad_pcb", None, "other", "secondary"),
            ("net_class", "board.kicad_pro", None, "rules", "primary"),
            ("board_constraint", "board.kicad_pro", None, "rules", "primary"),
            ("drc_exclusion", "board.kicad_pro", None, "rules", "primary"),
            ("erc_pin_rule", "board.kicad_pro", None, "rules", "primary"),
            ("fabrication_output", "board.kicad_pcb", None, "rules", "primary"),
            ("custom_rule", "board.kicad_dru", None, "rules", "primary"),
            ("routing_preset", "board.kicad_pro", None, "rules", "secondary"),
            ("project_metadata", "board.kicad_pro", None, "text", "secondary"),
        ]
        for index, (kind, document, layer, category, classification) in enumerate(cases):
            with self.subTest(kind=kind, layer=layer):
                native = {
                    "uuid": f"native-{index}",
                    "kind": kind,
                    "documentPath": document,
                    "layer": layer,
                }
                change = design_compare_service._node_change({
                    "key": f"{document}#{native['uuid']}",
                    "status": "added",
                    "compare": native,
                })
                self.assertEqual(change["category"], category)
                self.assertEqual(change["classification"], classification)

        erc_change = design_compare_service._node_change({
            "key": "board.kicad_pro#erc-pin-rule",
            "status": "modified",
            "compare": {
                "uuid": "erc-pin-rule",
                "kind": "erc_pin_rule",
                "documentPath": "board.kicad_pro",
            },
        })
        self.assertEqual(erc_change["domain"], "schematic")
    def test_net_class_change_is_structured_without_fake_canvas_geometry(self) -> None:
        before = {
            "uuid": "net-class-usb",
            "kind": "net_class",
            "name": "USB",
            "documentPath": "board.kicad_pro",
            "reviewOnly": True,
        }
        change = design_compare_service._node_change({
            "key": "board.kicad_pro#net-class-usb",
            "status": "modified",
            "base": before,
            "compare": before,
            "properties": [{"name": "Track width", "from": 0.18, "to": 0.2}],
        })

        self.assertEqual(change["domain"], "pcb")
        self.assertEqual(change["label"], "USB")
        self.assertEqual(
            change["fields"]["Track width"],
            {"old": 0.18, "new": 0.2},
        )
        self.assertEqual(change["details"]["visualTargets"], [])
        self.assertTrue(change["details"]["reviewOnly"])
    def test_pad_and_zone_remain_independent_of_parent_and_net_groups(self) -> None:
        pad = {
            "uuid": "pad-3",
            "kind": "pad",
            "documentPath": "board.kicad_pcb",
            "parentUuid": "footprint-u1",
            "refdes": "U1",
            "number": "3",
            "net": "VCC",
            "layer": "F.Cu",
        }
        zone = {
            "uuid": "zone-vcc",
            "kind": "zone",
            "documentPath": "board.kicad_pcb",
            "name": "VCC plane",
            "net": "VCC",
            "layer": "F.Cu",
        }
        pad_change = design_compare_service._node_change({
            "key": "board.kicad_pcb#pad-3",
            "status": "modified",
            "base": pad,
            "compare": pad,
        })
        zone_change = design_compare_service._node_change({
            "key": "board.kicad_pcb#zone-vcc",
            "status": "modified",
            "base": zone,
            "compare": zone,
        })

        self.assertEqual(pad_change["label"], "U1 pad 3")
        self.assertTrue(pad_change["semantic_id"].startswith("obj:"))
        self.assertNotEqual(
            pad_change["semantic_id"],
            design_compare_service.semantic_index_service._stable_uid("cmp", "U1"),
        )
        self.assertEqual(zone_change["category"], "zones")
        self.assertEqual(zone_change["label"], "VCC plane")
        self.assertTrue(zone_change["semantic_id"].startswith("obj:"))

        groups = design_compare_service._group_changes([zone_change])
        self.assertEqual(groups[0]["category"], "zones")
    def test_native_target_hydration_uses_document_parent_and_centroid(self) -> None:
        change = {
            "reasons": ["connectivity-changed"],
            "details": {
                "visualTargets": [
                    {
                        "side": "comparison",
                        "status": "modified",
                        "sourceId": "pin-a1",
                        "parentSourceId": "symbol-u1",
                        "page": "/Power/",
                        "role": "terminal",
                    }
                ]
            },
        }
        design_compare_service._hydrate_native_targets(
            [change],
            {"nativeObjects": []},
            {
                "nativeObjects": [
                    {
                        "uuid": "symbol-u1",
                        "kind": "symbol",
                        "documentPath": "Sheets/Power.kicad_sch",
                        "at": [10, 20],
                    }
                ]
            },
        )

        target = change["details"]["visualTargets"][0]
        self.assertEqual(target["page"], "Sheets/Power.kicad_sch")
        self.assertEqual(target["sheetPath"], "/Power/")
        self.assertEqual(target["kind"], "symbol")
        self.assertEqual(target["at"], [10, 20])
    def test_modified_parser_segment_is_a_two_sided_native_track(self) -> None:
        base = {
            "uuid": "track-1",
            "kind": "segment",
            "documentPath": "board.kicad_pcb",
            "layer": "B.Cu",
            "net": "/Expansion/PMOD_A7",
            "at": [10, 20],
        }
        compare = {
            **base,
            "net": "/Expansion/PMOD_A10",
        }

        change = design_compare_service._node_change({
            "key": "board.kicad_pcb#track-1",
            "status": "modified",
            "base": base,
            "compare": compare,
            "properties": [{
                "name": "Net",
                "from": "/Expansion/PMOD_A7",
                "to": "/Expansion/PMOD_A10",
            }],
            "reasons": ["net-changed"],
        })

        self.assertEqual(change["object_kind"], "track")
        self.assertEqual(change["layers"], ["B.Cu"])
        self.assertEqual(
            [
                (target["side"], target["sourceId"], target["role"])
                for target in change["details"]["visualTargets"]
            ],
            [
                ("reference", "track-1", "track"),
                ("comparison", "track-1", "track"),
            ],
        )
    def test_group_details_retain_every_revision_visual_target(self) -> None:
        members = []
        for source_id in ("track-1", "track-2"):
            members.append({
                "id": source_id,
                "kind": "changed",
                "domain": "pcb",
                "category": "nets",
                "classification": "primary",
                "label": "PMOD_A4",
                "net": "PMOD_A4",
                "semantic_id": "net:pmod-a4",
                "details": {
                    "visualTargets": [
                        {
                            "side": side,
                            "status": "modified",
                            "sourceId": source_id,
                            "role": "track",
                        }
                        for side in ("reference", "comparison")
                    ]
                },
                "fields": {},
                "reasons": ["net-changed"],
            })

        group = design_compare_service._group_changes(members)[0]

        self.assertEqual(len(group["details"]["visualTargets"]), 4)
        self.assertEqual(
            {
                (target["side"], target["sourceId"])
                for target in group["details"]["visualTargets"]
            },
            {
                ("reference", "track-1"),
                ("comparison", "track-1"),
                ("reference", "track-2"),
                ("comparison", "track-2"),
            },
        )
    def test_parser_components_drive_bom_projection(self) -> None:
        components = design_compare_service._parser_components(
            {
                "componentObjects": [
                    {
                        "uuid": "symbol-u1",
                        "kind": "symbol",
                        "documentPath": "root.kicad_sch",
                        "refdes": "U1",
                        "instances": [{"reference": "U1", "path": "/symbol-u1"}],
                        "properties": [
                            {"name": "Value", "value": "MCU"},
                            {"name": "Footprint", "value": "Package:QFN"},
                        ],
                    },
                    {
                        "uuid": "footprint-u1",
                        "kind": "footprint",
                        "documentPath": "board.kicad_pcb",
                        "refdes": "U1",
                    },
                ]
            }
        )

        self.assertEqual(len(components), 1)
        self.assertEqual(components[0]["reference"], "U1")
        self.assertEqual(
            components[0]["pcbRefs"],
            [{"footprintUuid": "footprint-u1"}],
        )
        self.assertEqual(
            design_compare_service._semantic_bom_rows({"components": components})[0][
                "Value"
            ],
            "MCU",
        )
    def test_power_symbols_are_connectivity_not_components(self) -> None:
        power = {
            "uuid": "power-flag",
            "kind": "symbol",
            "documentPath": "root.kicad_sch",
            "libId": "power:PWR_FLAG",
            "refdes": "#FLG01",
            "properties": [{"name": "Value", "value": "PWR_FLAG"}],
        }
        self.assertEqual(
            design_compare_service._parser_components(
                {"componentObjects": [power]}
            ),
            [],
        )

        change = design_compare_service._node_change(
            {
                "key": "root.kicad_sch#power-flag",
                "status": "added",
                **power,
                "compare": power,
            }
        )
        self.assertEqual(change["category"], "nets")
        self.assertEqual(change["net"], "PWR_FLAG")
        self.assertIsNone(change["reference"])
        self.assertEqual(change["details"]["visualTargets"][0]["role"], "label")

        stale_semantic_group = design_compare_service._group_changes([{
            "id": "legacy-power-component",
            "kind": "changed",
            "domain": "schematic",
            "category": "components",
            "classification": "primary",
            "label": "#PWR0118",
            "reference": "#PWR0118",
        }])
        self.assertEqual(stale_semantic_group[0]["category"], "nets")
    def test_property_attribute_deltas_survive_the_python_adapter(self) -> None:
        change = design_compare_service._node_change(
            {
                "key": "root.kicad_sch#u1",
                "status": "modified",
                "base": {
                    "uuid": "u1",
                    "kind": "symbol",
                    "documentPath": "root.kicad_sch",
                    "refdes": "U1",
                },
                "compare": {
                    "uuid": "u1",
                    "kind": "symbol",
                    "documentPath": "root.kicad_sch",
                    "refdes": "U1",
                },
                "properties": [{
                    "name": "Value",
                    "from": "MCU",
                    "to": "MCU",
                    "attributesChanged": True,
                    "fromAttributes": {"at": [1, 2], "hide": False},
                    "toAttributes": {"at": [3, 4], "hide": True},
                }],
            }
        )
        self.assertNotIn("Value", change["fields"])
        self.assertEqual(
            change["fields"]["Value attributes"],
            {
                "old": {"at": [1, 2]},
                "new": {"at": [3, 4], "hide": True},
            },
        )
    def test_route_metrics_finish_compact_parser_aggregates(self) -> None:
        metrics = design_compare_service._route_metrics_from_digest(
            {
                "routeMetrics": {
                    "VCC": {
                        "routeLengthMm": 6.570796,
                        "viaCount": 1,
                        "usedLayers": ["F.Cu", "B.Cu"],
                        "viaSpans": {"F.Cu|B.Cu": 1},
                    }
                }
            },
            {
                "layers": [
                    {"name": "F.Cu", "thickness": 0.035},
                    {"name": "dielectric", "thickness": 1.53},
                    {"name": "B.Cu", "thickness": 0.035},
                ]
            },
        )["VCC"]

        self.assertEqual(metrics["centerline_length_mm"], 6.5708)
        self.assertEqual(metrics["via_count"], 1)
        self.assertEqual(metrics["via_barrel_length_mm"], 1.6)
        self.assertIsNone(metrics["propagation_delay"])
    def test_groups_keep_secondary_graphics_but_classify_them(self) -> None:
        changes = [
            {
                "id": "graphic-a",
                "kind": "added",
                "category": "graphics",
                "classification": "secondary",
                "label": "Dwgs.User line",
            },
            {
                "id": "component-a",
                "kind": "changed",
                "category": "components",
                "classification": "primary",
                "label": "U1",
                "semantic_id": "cmp:u1",
            },
        ]
        groups = design_compare_service._group_changes(changes)
        self.assertEqual({group["classification"] for group in groups}, {"primary", "secondary"})
        self.assertTrue(all(group["id"].startswith("grp:") for group in groups))
    def test_groups_include_position_delta_and_geometry_bounds(self) -> None:
        groups = design_compare_service._group_changes([{
            "id": "pcb-changed-u1",
            "kind": "changed",
            "domain": "pcb",
            "category": "components",
            "classification": "primary",
            "label": "U1",
            "semantic_id": "cmp:u1",
            "position_base": [10.0, 20.0],
            "position_compare": [13.0, 24.0],
        }])
        self.assertEqual(
            groups[0]["position_delta"],
            {"dx": 3.0, "dy": 4.0, "distance": 5.0},
        )
        self.assertEqual(groups[0]["geometry_bounds"], {"base": [], "compare": []})
