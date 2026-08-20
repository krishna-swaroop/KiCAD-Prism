from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace

from pipeline.topology_compiler import compile_topology
from pipeline.topology_compiler.native_clipper import (
    DECIMAL_PRECISION,
    PROTOCOL_VERSION,
    A2_PROTOCOL_VERSION,
    A2_RESPONSE_MAGIC,
    A2_RESPONSE_SCHEMA,
    COORDINATE_SCALE_NM_PER_MM,
    RESPONSE_MAGIC,
    RESPONSE_SCHEMA,
    NativeClipperError,
    _Writer,
    _tiles_for_bounds,
    build_clip_jobs,
    build_native_clip_response,
    decode_batch_a2_response,
    decode_batch_response,
    encode_batch_a2_request,
    encode_batch_request,
    validate_preclipped_response,
)
from pipeline.topology_compiler.prism_clipper2 import (
    PrismClipper2Error,
    PrismClipper2Library,
    prism_clipper2_library_info,
    resolve_prism_clipper2_library_path,
)
from pipeline.topology_compiler.context import PrismCompilationContext
from pipeline.topology_compiler.pcb_extract import _board_bbox, _declared_layers, _stackup_metadata_from_pcb_file
from pipeline.topology_compiler.pcb_extract import compile_pcb_artifacts, extract_pcb_metadata_light
from pipeline.topology_compiler.pcb_geometry import extract_pad_holes
from pipeline.topology_compiler.kicad_cli_export import (
    BOARD_CONTEXT_CACHE_VERSION,
    _board_context_export_args,
    _component_nodes,
)
from pipeline.topology_compiler.copper_geometry import (
    copper_emit_enabled,
    extract_pcb_metadata_from_copper,
    is_copper_geometry_document,
)
from pipeline.topology_compiler.semantic_gltf import (
    SemanticGltfBuilder,
    _native_backend_for_semantic_mode,
    _semantic_clipper_backend,
)
from pipeline.topology_compiler.__main__ import (
    _resolve_semantic_tile_size,
    write_artifact_manifest,
)


class TopologyCompilerTests(unittest.TestCase):
    def test_auto_tile_size_uses_one_power_of_two_tile_for_small_boards(self) -> None:
        self.assertEqual(
            _resolve_semantic_tile_size("auto", {"bbox_mm": [22.0, 15.0, 154.0, 105.0]}),
            160.0,
        )
        self.assertEqual(
            _resolve_semantic_tile_size("auto", {"bbox_mm": [0.0, 0.0, 39.0, 25.0]}),
            40.0,
        )
        self.assertEqual(_resolve_semantic_tile_size("80", {"bbox_mm": []}), 80.0)

    def test_semantic_clipper_defaults_to_auto(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(_semantic_clipper_backend(), "auto")

    def test_auto_clipper_uses_native_when_available_and_js_otherwise(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with patch(
                "pipeline.topology_compiler.semantic_gltf.prism_clipper2_library_info",
                return_value={"a2Support": True},
            ):
                self.assertEqual(_native_backend_for_semantic_mode("auto"), "clipper2")
            with patch(
                "pipeline.topology_compiler.semantic_gltf.prism_clipper2_library_info",
                return_value={"a2Support": False},
            ):
                self.assertEqual(_native_backend_for_semantic_mode("auto"), "js")

    def sample_design(self) -> dict:
        return {
            "schema": "kicad_monkey.design.a0",
            "project": {"filename": "unit.kicad_pro"},
            "components": [
                {"designator": "U1", "value": "MCU", "footprint": "QFN"},
                {"designator": "J1", "value": "USB", "footprint": "USB-C"},
            ],
            "nets": [
                {
                    "uid": "net_vbus",
                    "name": "VBUS",
                    "terminals": [
                        {"designator": "U1", "pin": "1", "svg_id": "u1_pin_1"},
                        {"designator": "J1", "pin": "A4", "svg_id": "j1_pin_a4"},
                    ],
                    "graphical": {"wires": ["wire_vbus"], "pins": ["u1_pin_1", "j1_pin_a4"]},
                }
            ],
        }

    def semantic_topology(self) -> dict:
        topology = compile_topology(self.sample_design())
        topology["board"] = {"thickness_mm": 1.6}
        topology["layers"] = [
            {"name": "Board", "role": "dielectric", "z_mm": 0.0, "thickness_mm": 1.6},
            {"name": "F.Cu", "role": "copper", "z_mm": 0.8, "thickness_mm": 0.035},
            {"name": "In1.Cu", "role": "copper", "z_mm": 0.2, "thickness_mm": 0.035},
            {"name": "B.Cu", "role": "copper", "z_mm": -0.8, "thickness_mm": 0.035},
        ]
        return topology

    def test_compile_topology_contract(self) -> None:
        topology = compile_topology(self.sample_design())
        self.assertEqual(topology["schema"], "prism.topology_model_a0")
        self.assertEqual(len(topology["components"]), 2)
        self.assertEqual(len(topology["nets"]), 1)
        self.assertEqual(len(topology["terminals"]), 2)
        self.assertEqual(topology["indexes"]["net_name_to_net"]["VBUS"], "net_vbus")

    def test_physical_stackup_keeps_paste_and_real_dielectric(self) -> None:
        class ItemType:
            def __init__(self, value: str) -> None:
                self.value = value

        def layer(
            name: str,
            role: str,
            thickness: float,
            type_name: str = "",
            epsilon_r: float | None = None,
            loss_tangent: float | None = None,
        ) -> SimpleNamespace:
            return SimpleNamespace(
                name=name,
                type_name=type_name,
                thickness=thickness,
                material="FR4" if role == "dielectric" else "",
                color="",
                epsilon_r=epsilon_r,
                loss_tangent=loss_tangent,
                get_item_type=lambda: ItemType(role),
            )

        pcb = SimpleNamespace(
            thickness=1.6,
            stackup=SimpleNamespace(
                layers=[
                    layer("F.SilkS", "silkscreen", 0.0, "Top Silk Screen"),
                    layer("F.Paste", "solderpaste", 0.0, "Top Solder Paste"),
                    layer("F.Mask", "soldermask", 0.01, "Top Solder Mask"),
                    layer("F.Cu", "copper", 0.035, "copper"),
                    layer("dielectric 1", "dielectric", 1.51, "core", 4.2, 0.018),
                    layer("B.Cu", "copper", 0.035, "copper"),
                    layer("B.Mask", "soldermask", 0.01, "Bottom Solder Mask"),
                    layer("B.Paste", "solderpaste", 0.0, "Bottom Solder Paste"),
                    layer("B.SilkS", "silkscreen", 0.0, "Bottom Silk Screen"),
                ]
            ),
        )
        extracted = _declared_layers(pcb)
        self.assertEqual([item["name"] for item in extracted], [
            "F.SilkS",
            "F.Paste",
            "F.Mask",
            "F.Cu",
            "dielectric 1",
            "B.Cu",
            "B.Mask",
            "B.Paste",
            "B.SilkS",
        ])
        self.assertEqual(extracted[1]["role"], "paste")
        self.assertEqual(extracted[7]["role"], "paste")
        self.assertEqual([item["stack_index"] for item in extracted], list(range(9)))
        self.assertEqual(extracted[3]["color"], "#df342b")
        self.assertEqual(extracted[5]["color"], "#245fd3")
        self.assertEqual(extracted[4]["epsilon_r"], 4.2)
        self.assertEqual(extracted[4]["loss_tangent"], 0.018)

        topology = compile_topology(
            self.sample_design(),
            pcb_metadata={
                "board": {
                    "bbox_mm": [0, 0, 10, 10],
                    "thickness_mm": 1.6,
                    "stackup": {
                        "present": True,
                        "layers": extracted,
                        "copper_finish": "ENIG",
                        "edge_connector": True,
                        "castellated_pads": True,
                        "edge_plating": False,
                    },
                }
            },
        )
        self.assertNotIn("Board", [item["name"] for item in topology["layers"]])
        dielectric = next(item for item in topology["layers"] if item["name"] == "dielectric 1")
        self.assertEqual(dielectric["epsilon_r"], 4.2)
        self.assertEqual(dielectric["loss_tangent"], 0.018)
        self.assertEqual(topology["board"]["stackup"]["copper_finish"], "ENIG")
        self.assertTrue(topology["board"]["stackup"]["edge_connector"])
        self.assertTrue(topology["board"]["stackup"]["castellated_pads"])
        self.assertFalse(topology["board"]["stackup"]["edge_plating"])
        self.assertAlmostEqual(
            sum(item["thickness_mm"] for item in topology["layers"] if item["role"] in {"copper", "dielectric", "paste", "soldermask", "silkscreen"}),
            1.6,
        )

    def test_physical_stackup_falls_back_to_kicad_pcb_stackup_block(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pcb_file = Path(tmp) / "unit.kicad_pcb"
            pcb_file.write_text(
                """(kicad_pcb
                  (setup
                    (stackup
                      (layer "F.SilkS" (type "Top Silk Screen"))
                      (layer "F.Paste" (type "Top Solder Paste"))
                      (layer "F.Mask" (type "Top Solder Mask") (thickness 0.01))
                      (layer "F.Cu" (type "copper") (thickness 0.035))
                      (layer "dielectric 1" (type "core") (thickness 1.51) (material "FR4") (epsilon_r 4.1) (loss_tangent 0.017))
                      (layer "B.Cu" (type "copper") (thickness 0.035))
                      (layer "B.Mask" (type "Bottom Solder Mask") (thickness 0.01))
                      (layer "B.Paste" (type "Bottom Solder Paste"))
                      (layer "B.SilkS" (type "Bottom Silk Screen"))
                      (copper_finish "ENIG")
                      (edge_connector "bevelled")
                      (castellated_pads yes)
                      (edge_plating no)
                    )
                  )
                )""",
                encoding="utf-8",
            )
            pcb = SimpleNamespace(thickness=1.6, stackup=SimpleNamespace(layers=[]), layers=[])
            extracted = _declared_layers(pcb, pcb_file)
            stackup_metadata = _stackup_metadata_from_pcb_file(pcb_file)

        self.assertEqual([item["name"] for item in extracted], [
            "F.SilkS",
            "F.Paste",
            "F.Mask",
            "F.Cu",
            "dielectric 1",
            "B.Cu",
            "B.Mask",
            "B.Paste",
            "B.SilkS",
        ])
        self.assertEqual(extracted[1]["thickness_mm"], 0.0)
        self.assertEqual(extracted[7]["thickness_mm"], 0.0)
        self.assertEqual([item["stack_index"] for item in extracted], list(range(9)))
        self.assertEqual(extracted[3]["color"], "#df342b")
        self.assertEqual(extracted[5]["color"], "#245fd3")
        self.assertEqual(extracted[4]["epsilon_r"], 4.1)
        self.assertEqual(extracted[4]["loss_tangent"], 0.017)
        self.assertEqual(stackup_metadata["copper_finish"], "ENIG")
        self.assertTrue(stackup_metadata["edge_connector"])
        self.assertTrue(stackup_metadata["castellated_pads"])
        self.assertFalse(stackup_metadata["edge_plating"])
        self.assertAlmostEqual(sum(item["thickness_mm"] for item in extracted), 1.6)

    def test_stackup_metadata_defaults_without_stackup_block(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pcb_file = Path(tmp) / "unit.kicad_pcb"
            pcb_file.write_text(
                """(kicad_pcb
                  (setup
                    (pad_to_mask_clearance 0)
                  )
                )""",
                encoding="utf-8",
            )
            stackup_metadata = _stackup_metadata_from_pcb_file(pcb_file)

        self.assertEqual(stackup_metadata["copper_finish"], "None")
        self.assertFalse(stackup_metadata["edge_connector"])
        self.assertFalse(stackup_metadata["castellated_pads"])
        self.assertFalse(stackup_metadata["edge_plating"])

    def test_layer_list_fallback_keeps_total_thickness_without_stackup(self) -> None:
        def layer(name: str) -> SimpleNamespace:
            return SimpleNamespace(canonical_name=name, layer_type=SimpleNamespace(value=""))

        pcb = SimpleNamespace(
            thickness=1.6,
            stackup=SimpleNamespace(layers=[]),
            layers=[
                layer("F.SilkS"),
                layer("F.Paste"),
                layer("F.Mask"),
                layer("F.Cu"),
                layer("B.Cu"),
                layer("B.Mask"),
                layer("B.Paste"),
                layer("B.SilkS"),
            ],
        )
        extracted = _declared_layers(pcb)
        self.assertEqual([item["name"] for item in extracted], [
            "F.SilkS",
            "F.Paste",
            "F.Mask",
            "F.Cu",
            "Board",
            "B.Cu",
            "B.Mask",
            "B.Paste",
            "B.SilkS",
        ])
        self.assertEqual([item["stack_index"] for item in extracted], list(range(9)))
        by_name = {item["name"]: item for item in extracted}
        self.assertEqual(by_name["F.Cu"]["color"], "#df342b")
        self.assertEqual(by_name["B.Cu"]["color"], "#245fd3")
        self.assertEqual(by_name["F.Paste"]["thickness_mm"], 0.0)
        self.assertEqual(by_name["F.SilkS"]["thickness_mm"], 0.0)
        self.assertAlmostEqual(by_name["Board"]["thickness_mm"], 1.51)
        self.assertAlmostEqual(sum(item["thickness_mm"] for item in extracted), 1.6)
        topology = compile_topology(
            self.sample_design(),
            pcb_metadata={
                "board": {
                    "bbox_mm": [0, 0, 10, 10],
                    "thickness_mm": 1.6,
                    "stackup": {"present": True, "layers": extracted},
                }
            },
        )
        self.assertEqual([item["name"] for item in sorted(topology["layers"], key=lambda item: item["stack_index"])], [
            "F.SilkS",
            "F.Paste",
            "F.Mask",
            "F.Cu",
            "Board",
            "B.Cu",
            "B.Mask",
            "B.Paste",
            "B.SilkS",
        ])
        by_topology_name = {item["name"]: item for item in topology["layers"]}
        self.assertAlmostEqual(by_topology_name["F.Cu"]["z_mm"], 0.8175)
        self.assertAlmostEqual(by_topology_name["B.Cu"]["z_mm"], -0.8175)

    def test_board_bbox_accepts_outline_items_without_get_bounds(self) -> None:
        rect = SimpleNamespace(
            get_corners=lambda: [
                (108.575, 95.575),
                (146.625, 95.575),
                (146.625, 125.525),
                (108.575, 125.525),
            ]
        )
        pcb = SimpleNamespace(top_level_outline_items=lambda layer_name: [rect])
        self.assertEqual(_board_bbox(pcb), [108.575, 95.575, 146.625, 125.525])

    def test_light_pcb_metadata_uses_pad_bboxes_without_contours(self) -> None:
        class Bounds:
            def __init__(self, min_x: float, min_y: float, max_x: float, max_y: float) -> None:
                self.min_x = min_x
                self.min_y = min_y
                self.max_x = max_x
                self.max_y = max_y

            def is_valid(self) -> bool:
                return True

        pad = SimpleNamespace(
            number="1",
            layers=["F.Cu"],
            net=SimpleNamespace(name="VBUS"),
            uuid="pad-1",
            drill=0.3,
            drill_width=0.3,
            drill_height=0.3,
            plated=True,
            get_bounds=lambda: Bounds(-0.5, -0.5, 0.5, 0.5),
        )
        footprint = SimpleNamespace(
            pads=[pad],
            uuid="fp-1",
            at_x=10.0,
            at_y=20.0,
            at_angle=0.0,
            layer="F.Cu",
            get_property_value=lambda name, default="": "U1" if name == "Reference" else default,
            get_bounds=lambda: Bounds(9.0, 19.0, 11.0, 21.0),
        )
        pcb = SimpleNamespace(
            thickness=1.6,
            stackup=SimpleNamespace(layers=[]),
            layers=[],
            footprints=[footprint],
            segments=[],
            vias=[],
            zones=[],
            top_level_outline_items=lambda layer_name: [],
            get_bounds=lambda: Bounds(0, 0, 25, 25),
        )
        with patch("pipeline.topology_compiler.pcb_extract._pad_contours", side_effect=AssertionError("contours")):
            metadata = extract_pcb_metadata_light(pcb, Path("unit.kicad_pro"))
        self.assertEqual(metadata["mode"], "light")
        self.assertEqual(metadata["physical_objects"], [])
        self.assertEqual(metadata["terminal_pad_links"][0]["object_uid"], metadata["pads"][0]["uid"])
        self.assertEqual(metadata["components"][0]["designator"], "U1")

    def test_unified_board_compilation_matches_legacy_topology_and_pad_holes(self) -> None:
        pcb_text = """(kicad_pcb
  (version 20240108)
  (generator "kicad")
  (generator_version "10.0.3")
  (general (thickness 1.6))
  (paper "A4")
  (layers
    (0 "F.Cu" signal)
    (31 "B.Cu" signal)
    (44 "Edge.Cuts" user))
  (setup
    (stackup
      (layer "F.Cu" (type "copper") (thickness 0.035))
      (layer "dielectric 1" (type "core") (thickness 1.53))
      (layer "B.Cu" (type "copper") (thickness 0.035))))
  (net 0 "")
  (net 1 "/A")
  (gr_line (start 0 0) (end 25 0) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_line (start 25 0) (end 25 25) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_line (start 25 25) (end 0 25) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_line (start 0 25) (end 0 0) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (footprint "Device:R" (layer "F.Cu") (at 10 12 0) (uuid "fp-r1")
    (property "Reference" "R1" (at 0 0 0) (layer "F.SilkS"))
    (property "Value" "10k" (at 0 1 0) (layer "F.Fab"))
    (pad "1" thru_hole circle (at 0 0) (size 1 1) (drill 0.4) (layers "*.Cu" "*.Mask") (net 1 "/A") (uuid "pad-r1-1"))
    (pad "2" smd rect (at 1 0) (size 1 1) (layers "F.Cu") (net 1 "/A") (uuid "pad-r1-2"))
    (pad "" np_thru_hole circle (at 2 0) (size 0.5 0.5) (drill 0.5) (layers "*.Cu" "*.Mask") (uuid "pad-r1-hole")))
  (segment (start 10 12) (end 11 12) (width 0.1) (layer "F.Cu") (net 1) (uuid "seg1"))
  (via (at 11 12) (size 0.4) (drill 0.2) (layers "F.Cu" "B.Cu") (net 1) (uuid "via1"))
)
"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            project = root / "unified-parity.kicad_pro"
            board_path = root / "unified-parity.kicad_pcb"
            project.write_text("{}", encoding="utf-8")
            board_path.write_text(pcb_text, encoding="utf-8")

            from kicad_monkey import KiCadPcb

            pcb = KiCadPcb.from_file(board_path)
            legacy = extract_pcb_metadata_light(pcb, project)
            pcb_ir = pcb.to_ir(source_path=str(board_path)).to_dict()
            unified, unified_holes = compile_pcb_artifacts(pcb, project, pcb_ir)
            legacy_holes = extract_pad_holes(pcb)

        design_payload = {
            "components": [{"designator": "R1", "value": "10k", "footprint": "Device:R"}],
            "nets": [{
                "uid": "net-a",
                "name": "/A",
                "terminals": [
                    {"designator": "R1", "pin": "1"},
                    {"designator": "R1", "pin": "2"},
                ],
            }],
        }
        self.assertEqual(unified["mode"], "unified")
        self.assertNotIn("pads", unified)
        self.assertEqual(unified["board"], legacy["board"])
        self.assertEqual(unified["terminal_pad_links"], legacy["terminal_pad_links"])
        self.assertEqual(unified["stats"], legacy["stats"])
        self.assertEqual(unified_holes, legacy_holes)
        self.assertEqual(
            compile_topology(design_payload, [], unified, {}),
            compile_topology(design_payload, [], legacy, {}),
        )

    def test_board_compilation_is_cached_across_all_consumers(self) -> None:
        calls = {"ir": 0, "payload": 0, "artifacts": 0}

        class IrDocument:
            def to_dict(self):
                calls["payload"] += 1
                return {"records": []}

        pcb = object()

        def to_pcb_ir():
            calls["ir"] += 1
            return IrDocument()

        context = PrismCompilationContext(Path("unit.kicad_pro"))
        context._design = SimpleNamespace(pcb=pcb, to_pcb_ir=to_pcb_ir)

        def compile_artifacts(actual_pcb, project_file, ir_payload, profile_callback=None):
            calls["artifacts"] += 1
            self.assertIs(actual_pcb, pcb)
            self.assertEqual(ir_payload, {"records": []})
            return {"mode": "unified"}, {"pad": {"drill_mm": 0.3}}

        with patch(
            "pipeline.topology_compiler.context.compile_pcb_artifacts",
            side_effect=compile_artifacts,
        ):
            self.assertEqual(context.pcb_metadata["mode"], "unified")
            self.assertEqual(context.pcb_ir, {"records": []})
            self.assertIn("pad", context.pad_holes)

        self.assertEqual(calls, {"ir": 1, "payload": 1, "artifacts": 1})

    def test_copper_board_compilation_never_hydrates_full_pcb(self) -> None:
        document = SimpleNamespace(
            schema="kicad.copper_geometry.a0",
            bounds_nm=(0, 0, 10_000_000, 8_000_000),
            layers=(SimpleNamespace(index=0, name="F.Cu"), SimpleNamespace(index=1, name="B.Cu")),
            nets=(SimpleNamespace(index=0, name="VBUS"),),
            features=(
                SimpleNamespace(
                    kind="pad",
                    source_uid="pad-1",
                    net_index=0,
                    layer_indexes=(0, 1),
                    outer_nm=((0, 0), (1_000_000, 0), (1_000_000, 1_000_000), (0, 1_000_000)),
                    holes_nm=(),
                    footprint_uid="fp-1",
                    component_ref="U1",
                    pad_number="1",
                ),
            ),
            drills=(),
            stats={"tracks": 2, "track_arcs": 0, "vias": 1, "pads": 1, "zone_fills": 0},
        )

        class ExplodingDesign:
            pcb_path = Path("unit.kicad_pcb")

            @property
            def pcb(self):
                raise AssertionError("full KiCadPcb hydration must not run on copper path")

        context = PrismCompilationContext(Path("unit.kicad_pro"))
        context._design = ExplodingDesign()

        with patch.dict(os.environ, {"PRISM_COPPER_EMIT_ENABLED": "1"}):
            self.assertTrue(copper_emit_enabled())
            with patch(
                "pipeline.topology_compiler.context.copper_emit_available",
                return_value=True,
            ), patch(
                "pipeline.topology_compiler.context.emit_copper_geometry",
                return_value=document,
            ), patch(
                "pipeline.topology_compiler.context.extract_pcb_metadata_from_copper",
                wraps=extract_pcb_metadata_from_copper,
            ) as metadata_spy:
                compilation = context.board_compilation

        self.assertIs(compilation.copper_geometry, document)
        self.assertIsNone(compilation.pcb_ir)
        self.assertEqual(compilation.metadata["mode"], "copper")
        self.assertEqual(compilation.metadata["bbox_mm"], [0.0, 0.0, 10.0, 8.0])
        self.assertEqual(compilation.metadata["components"][0]["designator"], "U1")
        metadata_spy.assert_called_once()

    def test_artifact_manifest_is_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "topology.json").write_text("{}", encoding="utf-8")
            (root / "viewer.html").write_text("<html></html>", encoding="utf-8")
            first = write_artifact_manifest(root)
            second = write_artifact_manifest(root)
            self.assertEqual(first, second)
            self.assertEqual(first["schema"], "prism.artifact_manifest_a0")
            total = sum(item["bytes"] for item in first["files"])
            self.assertEqual(first["totalBytes"], total)
            self.assertEqual(first["totalsByFamily"]["topology"]["files"], 1)
            self.assertEqual(first["totalsByFamily"]["viewer"]["files"], 1)

    def test_component_nodes_preserve_designator(self) -> None:
        gltf = {
            "asset": {"version": "2.0"},
            "scene": 0,
            "scenes": [{"nodes": [0]}],
            "nodes": [{"children": [1]}, {"name": "U1", "children": [2]}, {"mesh": 0}],
            "meshes": [{"name": "Body", "primitives": []}],
        }
        payload = json.dumps(gltf).encode("utf-8")
        payload += b" " * ((4 - len(payload) % 4) % 4)
        total = 12 + 8 + len(payload)
        glb = b"glTF" + (2).to_bytes(4, "little") + total.to_bytes(4, "little")
        glb += len(payload).to_bytes(4, "little") + b"JSON" + payload
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "components.glb"
            path.write_bytes(glb)
            components = _component_nodes(path)
        self.assertEqual(components, [{"designator": "U1", "node_index": 1, "mesh_names": ["Body"]}])

    def test_board_context_export_excludes_duplicate_pad_geometry(self) -> None:
        args = _board_context_export_args(Path("geometry"), Path("unit.kicad_pcb"))
        self.assertIn("--include-soldermask", args)
        self.assertIn("--include-silkscreen", args)
        self.assertIn("--no-components", args)
        self.assertNotIn("--include-pads", args)
        self.assertIn("no-pads", BOARD_CONTEXT_CACHE_VERSION)

    def test_via_caps_and_barrel_share_one_source_feature(self) -> None:
        builder = SemanticGltfBuilder(self.semantic_topology())
        builder.add_pcb_ir(
            {
                "records": [
                    {
                        "uuid": "via-1",
                        "kind": "via",
                        "net_name": "VBUS",
                        "layers": ["F.Cu", "B.Cu"],
                        "drill": 0.3,
                        "operations": [
                            {
                                "kind": "FlashPadCircle",
                                "x": 10_000_000,
                                "y": 20_000_000,
                                "diameter_nm": 600_000,
                            }
                        ],
                    }
                ]
            }
        )
        via_objects = [item for item in builder.objects if item["kindId"] == 5]
        self.assertEqual(len(via_objects), 3)
        self.assertEqual(len({item["objectFeatureId"] for item in via_objects}), 1)
        barrel = builder.barrels[0]
        self.assertEqual(barrel["layerIds"], [2, 3, 4])
        self.assertEqual(barrel["startLayerId"], 2)
        self.assertEqual(barrel["endLayerId"], 4)
        self.assertEqual(barrel["netId"], 1)
        self.assertGreater(barrel["startZMm"], barrel["endZMm"])
        self.assertGreater(barrel["outerWidthMm"], barrel["drillWidthMm"])

    def test_copper_emit_via_uses_topology_layers_and_shared_feature(self) -> None:
        builder = SemanticGltfBuilder(self.semantic_topology())
        document = SimpleNamespace(
            schema="kicad.copper_geometry.a0",
            layers=(
                SimpleNamespace(index=0, name="F.Cu"),
                SimpleNamespace(index=1, name="In1.Cu"),
                SimpleNamespace(index=2, name="B.Cu"),
            ),
            nets=(SimpleNamespace(index=0, name="VBUS"),),
            features=(
                SimpleNamespace(
                    source_uid="via-emit-1",
                    kind="via",
                    net_index=0,
                    layer_indexes=(0, 1, 2),
                    outer_nm=(
                        (9_700_000, 20_000_000),
                        (10_000_000, 19_700_000),
                        (10_300_000, 20_000_000),
                        (10_000_000, 20_300_000),
                    ),
                    holes_nm=(),
                ),
            ),
            drills=(
                SimpleNamespace(
                    source_uid="via-emit-1",
                    kind="via",
                    center_nm=(10_000_000, 20_000_000),
                    width_nm=300_000,
                    height_nm=300_000,
                    plated=True,
                    layer_indexes=(0, 1, 2),
                ),
            ),
        )

        self.assertTrue(is_copper_geometry_document(document))
        builder.add_copper_geometry(document)

        self.assertEqual(len(builder.objects), 3)
        self.assertEqual(len(builder.barrels), 1)
        self.assertEqual(len(builder.object_features), 2)
        feature_id = builder.object_features[1]["id"]
        self.assertTrue(all(item["objectFeatureId"] == feature_id for item in builder.objects))
        self.assertEqual(builder.barrels[0]["objectFeatureId"], feature_id)
        self.assertEqual(builder.barrels[0]["layerMask"], 0b111)
        self.assertEqual(builder.barrels[0]["netId"], 1)

    def test_plated_pad_barrel_uses_pad_feature_and_layer_mask(self) -> None:
        builder = SemanticGltfBuilder(self.semantic_topology())
        builder.add_pcb_ir(
            {
                "records": [
                    {
                        "kind": "footprint",
                        "placement": {"x_nm": 0, "y_nm": 0, "angle_deg": 0},
                        "operations": [
                            {
                                "kind": "StartBlock",
                                "data_ref": "pad",
                                "data_uuid": "pad-1",
                                "extra_attrs": {"net": "VBUS"},
                            },
                            {
                                "kind": "FlashPadCircle",
                                "x": 5_000_000,
                                "y": 6_000_000,
                                "diameter_nm": 900_000,
                                "layers": ["*.Cu"],
                            },
                            {"kind": "EndBlock"},
                        ],
                    }
                ]
            },
            pad_holes={
                "pad-1": {
                    "drill_mm": 0.4,
                    "drill_width_mm": 0.4,
                    "drill_height_mm": 0.4,
                    "plated": True,
                }
            },
        )
        barrel = builder.barrels[0]
        feature_id = barrel["objectFeatureId"]
        self.assertTrue(all(item["objectFeatureId"] == feature_id for item in builder.objects))
        self.assertEqual(barrel["layerMask"], 0b111)
        self.assertEqual(barrel["kind"], "plated_pad")

    def test_ir_pad_turns_with_the_footprint_that_carries_it(self) -> None:
        """A pad that is unrotated in the library still turns with its placement.

        ``pcb_footprint_to_record`` reports ``orient_deg`` footprint-local, so
        this oval reads 0 even though the board file stores 90 on the pad. The
        placement supplies the rotation exactly once, leaving the 0.875 mm axis
        lying along X.
        """
        builder = SemanticGltfBuilder(self.semantic_topology())
        builder.add_pcb_ir(
            {
                "records": [
                    {
                        "kind": "footprint",
                        "placement": {
                            "x_nm": 55_187_000,
                            "y_nm": 77_750_000,
                            "angle_deg": 90.0,
                        },
                        "operations": [
                            {
                                "kind": "StartBlock",
                                "data_ref": "pad",
                                "data_uuid": "pad-u9-24",
                                "extra_attrs": {"net": "VR5510_AMUX"},
                            },
                            {
                                "kind": "FlashPadOval",
                                "x": 1_250_000,
                                "y": 3_963_000,
                                "size_x_nm": 250_000,
                                "size_y_nm": 875_000,
                                "orient_deg": 0.0,
                                "layers": ["F.Cu"],
                            },
                            {"kind": "EndBlock"},
                        ],
                    }
                ]
            }
        )
        pad_objects = [item for item in builder.objects if item.get("layerName") == "F.Cu"]
        self.assertEqual(len(pad_objects), 1)
        outer = pad_objects[0]["polygons"][0]["outer"]
        xs = [point[0] for point in outer]
        ys = [point[1] for point in outer]
        width = max(xs) - min(xs)
        height = max(ys) - min(ys)
        self.assertGreater(width, height)
        self.assertAlmostEqual(width, 0.875, delta=0.02)
        self.assertAlmostEqual(height, 0.25, delta=0.02)
        self.assertAlmostEqual((max(xs) + min(xs)) / 2.0, 59.15, delta=0.02)
        self.assertAlmostEqual((max(ys) + min(ys)) / 2.0, 76.5, delta=0.02)

    def test_ir_rect_pad_follows_a_rotated_footprint(self) -> None:
        """The board-space counterpart of the oval case, on a footprint at -90."""
        builder = SemanticGltfBuilder(self.semantic_topology())
        builder.add_pcb_ir(
            {
                "records": [
                    {
                        "kind": "footprint",
                        "placement": {
                            "x_nm": 30_063_443,
                            "y_nm": 42_758_365,
                            "angle_deg": -90.0,
                        },
                        "operations": [
                            {
                                "kind": "StartBlock",
                                "data_ref": "pad",
                                "data_uuid": "pad-r121-2",
                                "extra_attrs": {"net": "Net-(U10-FB+)"},
                            },
                            {
                                "kind": "FlashPadRect",
                                "x": 540_000,
                                "y": 0,
                                "size_x_nm": 600_000,
                                "size_y_nm": 800_000,
                                "orient_deg": 0.0,
                                "layers": ["F.Cu"],
                            },
                            {"kind": "EndBlock"},
                        ],
                    }
                ]
            }
        )
        pad_objects = [item for item in builder.objects if item.get("layerName") == "F.Cu"]
        self.assertEqual(len(pad_objects), 1)
        outer = pad_objects[0]["polygons"][0]["outer"]
        xs = [point[0] for point in outer]
        ys = [point[1] for point in outer]
        width = max(xs) - min(xs)
        height = max(ys) - min(ys)
        self.assertGreater(width, height)
        self.assertAlmostEqual(width, 0.8, delta=0.02)
        self.assertAlmostEqual(height, 0.6, delta=0.02)
        self.assertAlmostEqual((max(xs) + min(xs)) / 2.0, 30.063, delta=0.02)
        self.assertAlmostEqual((max(ys) + min(ys)) / 2.0, 43.298, delta=0.02)

    def test_both_pad_paths_agree_with_board_stored_pad_angles(self) -> None:
        """Pin both pad pipelines to KiCad's board-file convention.

        ``pad.at_angle`` is written in board space: a footprint placed at 90
        degrees stamps 90 onto a pad that sits unrotated in the library. The
        Plotter IR path and the ``KiCadPcb`` path recover the footprint-local
        shape independently, and both have double-counted the placement at some
        point -- in opposite directions, so neither caught the other.
        """
        from kicad_monkey import KiCadPcb
        from kicad_monkey.kicad_pcb_to_ir import pcb_footprint_to_record

        from pipeline.topology_compiler.pcb_extract import _pad_contours
        from pipeline.topology_compiler.pcb_geometry import pad_rings, point_nm, transform

        board = """(kicad_pcb
  (version 20240108)
  (generator pcbnew)
  (layers (0 "F.Cu" signal))
  (footprint "Lib:R_0402"
    (layer "F.Cu")
    (at 50 50 {placement})
    (pad "1" smd rect (at -0.5175 0 {pad_angle}) (size 0.54 0.64) (layers "F.Cu") (uuid "p1"))
    (pad "2" smd trapezoid (at 0.5175 0 {skewed_pad_angle}) (size 0.9 1.4) (rect_delta 0.5 0)
      (layers "F.Cu") (uuid "p2"))
  )
)
"""

        def bounds(points):
            xs = [point[0] for point in points]
            ys = [point[1] for point in points]
            return min(xs), min(ys), max(xs), max(ys)

        def ir_ring_points(record, operations):
            placement_extras = record.extras["placement"]
            origin = point_nm(placement_extras["x_nm"], placement_extras["y_nm"])
            angle = -float(placement_extras["angle_deg"])
            return [
                transform(point, origin, angle)
                for operation in operations
                for ring in pad_rings({**operation.payload, "kind": str(operation.kind.value)})
                for point in ring
            ]

        with tempfile.TemporaryDirectory() as tmp:
            for placement, expected in (
                (0.0, (0.54, 0.64, 49.4825, 50.0)),
                (90.0, (0.64, 0.54, 50.0, 50.5175)),
                (-90.0, (0.64, 0.54, 50.0, 49.4825)),
                (180.0, (0.54, 0.64, 50.5175, 50.0)),
            ):
                with self.subTest(placement=placement):
                    path = Path(tmp) / f"pad-angle-{placement}.kicad_pcb"
                    # What KiCad itself would write: the library-local angle
                    # plus the placement, resolved into board space.
                    path.write_text(
                        board.format(
                            placement=placement,
                            pad_angle=placement % 360,
                            skewed_pad_angle=(placement + 45.0) % 360,
                        ),
                        encoding="utf-8",
                    )
                    pcb = KiCadPcb.from_file(path)
                    footprint = pcb.footprints[0]
                    record = pcb_footprint_to_record(footprint, board=pcb)
                    flashes = [
                        operation
                        for operation in record.operations
                        if str(operation.kind.value).startswith("FlashPad")
                    ]
                    self.assertEqual(len(flashes), 2)

                    # The rectangular pad is unrotated in the library, so its
                    # board-space outline is fully determined by the placement.
                    width, height, center_x, center_y = expected
                    rect_paths = {
                        "plotter ir": ir_ring_points(record, flashes[:1]),
                        "kicad model": [
                            point
                            for contour in _pad_contours(footprint.pads[0], footprint)
                            for point in contour
                        ],
                    }
                    for label, points in rect_paths.items():
                        min_x, min_y, max_x, max_y = bounds(points)
                        self.assertAlmostEqual(max_x - min_x, width, delta=1e-6, msg=label)
                        self.assertAlmostEqual(max_y - min_y, height, delta=1e-6, msg=label)
                        self.assertAlmostEqual((min_x + max_x) / 2.0, center_x, delta=1e-6, msg=label)
                        self.assertAlmostEqual((min_y + max_y) / 2.0, center_y, delta=1e-6, msg=label)

                    # The trapezoid is asymmetric and sits at 45 degrees inside
                    # the footprint, so it pins the direction of rotation that a
                    # rectangle cannot distinguish from its own mirror.
                    ir_corners = sorted(
                        (round(x, 9), round(y, 9)) for x, y in ir_ring_points(record, flashes[1:])
                    )
                    model_corners = sorted(
                        (round(x, 9), round(y, 9))
                        for contour in _pad_contours(footprint.pads[1], footprint)
                        for x, y in contour
                    )
                    self.assertEqual(len(ir_corners), 4)
                    for expected_corner, actual_corner in zip(model_corners, ir_corners):
                        self.assertAlmostEqual(expected_corner[0], actual_corner[0], delta=1e-6)
                        self.assertAlmostEqual(expected_corner[1], actual_corner[1], delta=1e-6)

    def test_build_input_contains_coordinate_bounds_and_component_features(self) -> None:
        builder = SemanticGltfBuilder(self.semantic_topology())
        builder.add_component_nodes([{"designator": "U1", "node_index": 4, "mesh_names": ["Body"]}])
        builder.add_pcb_ir(
            {
                "records": [
                    {
                        "uuid": "track-1",
                        "kind": "segment",
                        "layer": "F.Cu",
                        "net_name": "VBUS",
                        "operations": [
                            {
                                "kind": "ThickSegment",
                                "start_x": 0,
                                "start_y": 0,
                                "end_x": 10_000_000,
                                "end_y": 0,
                                "width_nm": 250_000,
                            }
                        ],
                    }
                ]
            }
        )
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "input.json"
            payload = builder.write_input(path)
        self.assertEqual(payload["schema"], "prism.semantic_gltf_build_a0")
        self.assertEqual(payload["coordinateSystem"]["runtime"]["gltfToRuntime"], ["x", "-z", "y"])
        self.assertIsNotNone(payload["nets"][1]["boundsMm"])
        self.assertEqual(payload["components"][0]["nodeIndex"], 4)
        self.assertGreater(payload["components"][0]["featureId"], 0)

    def native_fixture_input(self) -> dict:
        return {
            "schema": "prism.semantic_gltf_build_a0",
            "geometryRevision": "compiled-fixture",
            "sourceGeometryRevision": "source-fixture",
            "tileSizeMm": 20,
            "coordinateSystem": {"source": {"units": "millimetres"}},
            "objects": [
                {
                    "layerId": 1,
                    "layerName": "F.Cu",
                    "zMm": 0,
                    "thicknessMm": 0.035,
                    "netId": 2,
                    "objectFeatureId": 3,
                    "polygons": [
                        {
                            "sourcePolygonRecordId": "poly-1",
                            "sourceOrder": 7,
                            "outer": [[0, 0], [25, 0], [25, 5], [0, 5]],
                            "holes": [],
                        }
                    ],
                }
            ],
        }

    def native_response_bytes(self, jobs, digest: str = "digest", omit_last: bool = False) -> bytes:
        writer = _Writer()
        writer.raw(RESPONSE_MAGIC)
        writer.u32(PROTOCOL_VERSION)
        writer.string(RESPONSE_SCHEMA)
        writer.string(digest)
        writer.string("source-fixture")
        writer.u32(DECIMAL_PRECISION)
        writer.f64(20)
        writer.string("test-native")
        writer.u32(20260708)
        for _ in range(5):
            writer.f64(0)
        encoded_jobs = jobs[:-1] if omit_last else jobs
        writer.u32(len(encoded_jobs))
        writer.u32(0)
        for job in encoded_jobs:
            writer.string(job.job_id)
            writer.string(job.source_polygon_record_id)
            writer.u32(job.source_order)
            writer.i32(job.tile_x)
            writer.i32(job.tile_y)
            writer.u32(0)
            writer.string("")
            writer.string("")
            writer.u32(1)
            writer.ring(job.clip)
            writer.u32(0)
        return bytes(writer.data)

    def native_a2_response_bytes(self, jobs, digest: str = "digest", omit_last: bool = False) -> bytes:
        writer = _Writer()
        writer.raw(A2_RESPONSE_MAGIC)
        writer.u32(A2_PROTOCOL_VERSION)
        writer.string(A2_RESPONSE_SCHEMA)
        writer.string(digest)
        writer.string("source-fixture")
        writer.u32(COORDINATE_SCALE_NM_PER_MM)
        writer.i64(20 * COORDINATE_SCALE_NM_PER_MM)
        writer.string("test-native")
        writer.u32(20260708)
        writer.f64(0)
        writer.f64(0)
        writer.u32(1)
        writer.u32(len(jobs))
        writer.i64(4)
        writer.f64(0)
        writer.f64(0)
        writer.f64(0)
        writer.i64(128)
        writer.i64(256)
        encoded_jobs = jobs[:-1] if omit_last else jobs
        writer.u32(len(encoded_jobs))
        writer.u32(0)
        for job in encoded_jobs:
            writer.string(job.job_id)
            writer.string(job.source_polygon_record_id)
            writer.i32(job.tile_x)
            writer.i32(job.tile_y)
            writer.u32(0)
            writer.string("")
            writer.string("")
            writer.u32(1)
            writer.ring_i64_nm(job.clip)
            writer.u32(0)
        return bytes(writer.data)

    def test_prism_clipper2_info_reports_packaged_library(self) -> None:
        info = prism_clipper2_library_info()
        if resolve_prism_clipper2_library_path() is None:
            self.skipTest("packaged Prism Clipper2 library is not built")
        self.assertEqual(info["backend"], "clipper2")
        self.assertTrue(info["a2Support"])
        self.assertEqual(info["batchSymbol"], "prism_clipper2_batch_a2_bytes")
        self.assertEqual(info["protocolVersion"], 2)
        self.assertEqual(info["manifestMatch"], True)
        self.assertRegex(info["librarySha256"], r"^[0-9a-f]{64}$")

    def test_prism_clipper2_rejects_missing_library(self) -> None:
        missing = Path(tempfile.gettempdir()) / "missing-libprism_clipper2.dylib"
        with self.assertRaisesRegex(PrismClipper2Error, "does not exist"):
            PrismClipper2Library(missing)

    def test_prism_clipper2_rejects_missing_symbol(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fake_library = Path(tmp) / "libprism_clipper2.dylib"
            fake_library.write_bytes(b"not a real dynamic library")
            with patch("pipeline.topology_compiler.prism_clipper2.ctypes.CDLL", return_value=SimpleNamespace()):
                with self.assertRaisesRegex(PrismClipper2Error, "missing required C ABI symbol"):
                    PrismClipper2Library(fake_library)

    def test_prism_clipper2_rejects_packaged_manifest_sha_mismatch(self) -> None:
        packaged = resolve_prism_clipper2_library_path()
        if packaged is None:
            self.skipTest("packaged Prism Clipper2 library is not built")
        manifest = {
            "schema": "prism.clipper2_bundle_a0",
            "version": "0.1.0",
            "abi": 20260708,
            "protocols": ["a2"],
            "libraries": {
                packaged.parent.name: {
                    "path": str(packaged.relative_to(packaged.parents[1])),
                    "sha256": "0" * 64,
                }
            },
        }
        with patch("pipeline.topology_compiler.prism_clipper2._manifest_library_info", return_value=manifest):
            info = prism_clipper2_library_info(packaged)
        self.assertFalse(info["a2Support"])
        self.assertIn("SHA-256 does not match manifest", info["error"])

    def test_clip_job_tile_enumeration_matches_bounds_helper(self) -> None:
        payload = self.native_fixture_input()
        jobs, direct, stats = build_clip_jobs(payload, tile_size=20)
        expected_tiles: set[tuple[int, int]] = set()
        for obj in payload["objects"]:
            for polygon in obj["polygons"]:
                outer = polygon["outer"]
                holes = polygon.get("holes", [])
                points = [point for ring in [outer, *holes] for point in ring]
                bounds = (
                    min(point[0] for point in points),
                    min(point[1] for point in points),
                    max(point[0] for point in points),
                    max(point[1] for point in points),
                )
                expected_tiles.update(tuple(tile) for tile in _tiles_for_bounds(bounds, 20))
        actual_tiles = {(job.tile_x, job.tile_y) for job in jobs}
        actual_tiles.update(tuple(entry["tile"]) for entry in direct)
        self.assertEqual(actual_tiles, expected_tiles)
        self.assertIn("source_bounds_ms", stats)
        self.assertIn("tile_job_generation_ms", stats)

    def test_native_response_valid_fixture_is_accepted(self) -> None:
        payload = self.native_fixture_input()
        jobs, _direct, _stats = build_clip_jobs(payload, tile_size=20)
        _request, digest = encode_batch_request(payload, jobs, tile_size=20)
        decoded = decode_batch_response(
            self.native_response_bytes(jobs, digest),
            expected_jobs=jobs,
            expected_request_digest=digest,
            expected_geometry_revision="source-fixture",
            expected_tile_size=20,
        )
        self.assertEqual(decoded["schema"], RESPONSE_SCHEMA)
        self.assertEqual(len(decoded["results"]), 2)

    def test_native_a2_request_is_factorized_and_response_is_accepted(self) -> None:
        payload = self.native_fixture_input()
        jobs, _direct, _stats = build_clip_jobs(payload, tile_size=20)
        request, digest, request_stats = encode_batch_a2_request(payload, jobs, tile_size=20)
        self.assertIn(b"prism.clipper2_batch_request_a2", request)
        self.assertEqual(request_stats["subject_count"], 1)
        self.assertEqual(request_stats["job_count"], len(jobs))
        self.assertLess(
            request_stats["unique_subject_vertices"],
            request_stats["a1_equivalent_repeated_vertices"],
        )
        decoded = decode_batch_a2_response(
            self.native_a2_response_bytes(jobs, digest),
            expected_jobs=jobs,
            expected_request_digest=digest,
            expected_geometry_revision="source-fixture",
            expected_tile_size=20,
        )
        self.assertEqual(decoded["schema"], A2_RESPONSE_SCHEMA)
        self.assertEqual(decoded["timings"]["subject_count"], 1)
        self.assertEqual(len(decoded["results"]), len(jobs))

    def test_prism_clipper2_native_a2_response_is_accepted(self) -> None:
        if resolve_prism_clipper2_library_path() is None:
            self.skipTest("packaged Prism Clipper2 library is not built")
        payload = self.native_fixture_input()
        response, timings = build_native_clip_response(
            payload,
            library=PrismClipper2Library(),
            protocol="a2",
        )
        self.assertEqual(response["clipper"]["backend"], "clipper2")
        self.assertEqual(response["clipper"]["batchSymbol"], "prism_clipper2_batch_a2_bytes")
        self.assertEqual(response["native"]["batchSymbol"], "prism_clipper2_batch_a2_bytes")
        self.assertEqual(response["stats"]["native_boolean_jobs"], 2)
        self.assertEqual(len(response["clippedTiles"]), 2)
        self.assertGreaterEqual(response["stats"]["clipped_regions"], 1)
        self.assertIn("native_batch_call_ms", timings)
        validate_preclipped_response(
            payload,
            response,
            expected_jobs=build_clip_jobs(payload, tile_size=20, include_direct_entries=False, include_clip_rings=False, clean_geometry=False)[0],
        )

    def test_native_response_rejects_wrong_request_digest(self) -> None:
        payload = self.native_fixture_input()
        jobs, _direct, _stats = build_clip_jobs(payload, tile_size=20)
        _request, digest = encode_batch_request(payload, jobs, tile_size=20)
        with self.assertRaisesRegex(NativeClipperError, "request digest"):
            decode_batch_response(
                self.native_response_bytes(jobs, "wrong"),
                expected_jobs=jobs,
                expected_request_digest=digest,
                expected_geometry_revision="source-fixture",
                expected_tile_size=20,
            )

    def test_native_response_rejects_incomplete_job_accounting(self) -> None:
        payload = self.native_fixture_input()
        jobs, _direct, _stats = build_clip_jobs(payload, tile_size=20)
        _request, digest = encode_batch_request(payload, jobs, tile_size=20)
        with self.assertRaisesRegex(NativeClipperError, "omitted job"):
            decode_batch_response(
                self.native_response_bytes(jobs, digest, omit_last=True),
                expected_jobs=jobs,
                expected_request_digest=digest,
                expected_geometry_revision="source-fixture",
                expected_tile_size=20,
            )

    def test_native_response_rejects_malformed_bytes(self) -> None:
        payload = self.native_fixture_input()
        jobs, _direct, _stats = build_clip_jobs(payload, tile_size=20)
        with self.assertRaisesRegex(NativeClipperError, "invalid magic"):
            decode_batch_response(
                b"not-a-native-response",
                expected_jobs=jobs,
                expected_request_digest="digest",
                expected_geometry_revision="source-fixture",
                expected_tile_size=20,
            )

    def test_native_preclip_rejects_direct_entries(self) -> None:
        payload = self.native_fixture_input()
        jobs, _direct, _stats = build_clip_jobs(payload, tile_size=20)
        response = {
            "schema": RESPONSE_SCHEMA,
            "protocolVersion": PROTOCOL_VERSION,
            "sourceGeometryRevision": "source-fixture",
            "tileSizeMm": 20,
            "coordinateSystem": payload["coordinateSystem"],
            "precisionDecimalPlaces": DECIMAL_PRECISION,
            "clippedTiles": [
                {
                    "jobId": "direct:poly-1:0:0",
                    "sourcePolygonRecordId": "poly-1",
                    "sourceOrder": 7,
                    "tile": [0, 0],
                    "regions": [{"outer": [[0, 0], [1, 0], [1, 1], [0, 1]], "holes": []}],
                }
            ],
        }
        with self.assertRaisesRegex(NativeClipperError, "must not include direct"):
            validate_preclipped_response(payload, response, expected_jobs=jobs)

    def test_native_preclip_rejects_missing_a2_identity(self) -> None:
        payload = self.native_fixture_input()
        jobs, _direct, _stats = build_clip_jobs(payload, tile_size=20)
        response = {
            "schema": RESPONSE_SCHEMA,
            "protocolVersion": PROTOCOL_VERSION,
            "sourceGeometryRevision": "source-fixture",
            "tileSizeMm": 20,
            "coordinateSystem": payload["coordinateSystem"],
            "precisionDecimalPlaces": DECIMAL_PRECISION,
            "native": {"protocol": "a2", "version": "2026.7.8"},
            "clippedTiles": [],
        }
        with self.assertRaisesRegex(NativeClipperError, "missing identity"):
            validate_preclipped_response(payload, response, expected_jobs=jobs)


if __name__ == "__main__":
    unittest.main()
