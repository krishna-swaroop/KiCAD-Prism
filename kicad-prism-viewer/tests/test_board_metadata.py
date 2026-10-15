"""Board metadata parity: the same board through every backend's adapter."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from pipeline.topology_compiler.copper_geometry import (
    NativeSemanticMeshPack,
    extract_pcb_metadata_from_copper,
    extract_pcb_metadata_from_mesh_pack,
)
from pipeline.topology_compiler.pcb_extract import compile_pcb_artifacts, extract_pcb_metadata_light

# A rotated footprint with pads and a courtyard, a padless footprint on the
# back, manufacturing flags in the stackup, and net classes in the project.
BOARD = """(kicad_pcb
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
      (layer "B.Cu" (type "copper") (thickness 0.035))
      (copper_finish "ENIG")
      (dielectric_constraints no)
      (edge_connector yes)
      (castellated_pads yes)))
  (net 0 "")
  (net 1 "/A")
  (net 2 "GND")
  (gr_line (start 0 0) (end 25 0) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_line (start 25 0) (end 25 25) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_line (start 25 25) (end 0 25) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_line (start 0 25) (end 0 0) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (footprint "Device:R" (layer "F.Cu") (at 10 12 90) (uuid "fp-r1")
    (property "Reference" "R1" (at 0 0 0) (layer "F.SilkS"))
    (property "Value" "10k" (at 0 1 0) (layer "F.Fab"))
    (pad "1" smd rect (at -1 0 90) (size 1 1) (layers "F.Cu") (net 1 "/A") (uuid "pad-r1-1"))
    (pad "2" smd rect (at 1 0 90) (size 1 1) (layers "F.Cu") (net 2 "GND") (uuid "pad-r1-2"))
    (fp_rect (start -1.6 -0.6) (end 1.6 0.6) (stroke (width 0.05) (type solid)) (layer "F.CrtYd")))
  (footprint "Logo:Mark" (layer "B.Cu") (at 20 5 45) (uuid "fp-logo")
    (property "Reference" "G1" (at 0 0 0) (layer "B.SilkS"))
    (fp_line (start -1 0) (end 1 0) (stroke (width 0.1) (type solid)) (layer "B.SilkS")))
)
"""

PROJECT = {
    "net_settings": {
        "classes": [
            {"name": "Default", "track_width": 0.25, "clearance": 0.2, "via_diameter": 0.6, "via_drill": 0.3},
            {"name": "Power", "track_width": 0.5, "clearance": 0.2, "via_diameter": 0.8, "via_drill": 0.4},
        ]
    }
}


def _pad(source_uid: str, number: str, net: int, x: float, y: float) -> dict:
    return {"source_uid": source_uid, "number": number, "net": net, "bbox": [x - 0.5, y - 0.5, x + 0.5, y + 0.5]}


# R1 at (10, 12) turned 90 degrees: its pads at local x -1 and +1 land at y 13 and 11.
PADS = [_pad("pad-r1-1", "1", 1, 10.0, 13.0), _pad("pad-r1-2", "2", 2, 10.0, 11.0)]
NETS = {1: "/A", 2: "GND"}


def _mesh_pack_payload() -> dict:
    """The board's facts as the Rust lane's mesh pack states them."""

    return {
        "schema": "prism.semantic_mesh_pack.v1",
        "geometryRevision": "fixture",
        "board": {
            "thicknessMm": 1.6,
            "bboxMm": [0.0, 0.0, 25.0, 25.0],
            "auxAxisOriginMm": [0.0, 0.0],
            "copperFinish": "ENIG",
            "edgeConnector": "yes",
            "edgePlating": False,
        },
        "layers": [
            {"id": 1, "name": "F.Cu", "role": "copper", "thicknessMm": 0.035, "stackIndex": 0},
            {"id": 2, "name": "dielectric 1", "role": "dielectric", "thicknessMm": 1.53, "stackIndex": 1},
            {"id": 3, "name": "B.Cu", "role": "copper", "thicknessMm": 0.035, "stackIndex": 2},
        ],
        "nets": [{"id": 0, "name": ""}, *({"id": key, "name": name} for key, name in NETS.items())],
        "objectFeatures": [
            {"id": 0, "kind": "none"},
            *(
                {
                    "id": index,
                    "kind": "pad",
                    "sourceUid": pad["source_uid"],
                    "netId": pad["net"],
                    "layerIds": [1],
                    "footprintUid": "fp-r1",
                    "componentRef": "R1",
                    "padNumber": pad["number"],
                    "boundsMm": [pad["bbox"][0], pad["bbox"][1], 1.6, pad["bbox"][2], pad["bbox"][3], 1.635],
                }
                for index, pad in enumerate(PADS, start=1)
            ),
        ],
        "footprints": [
            {
                "uid": "fp-r1",
                "reference": "R1",
                "layer": "F.Cu",
                "positionMm": [10.0, 12.0],
                "angleDeg": 90.0,
                # The courtyard turned with the footprint: 3.2 x 1.2 becomes 1.2 x 3.2.
                "bodyBboxMm": [9.4, 10.4, 10.6, 13.6],
            },
            {"uid": "fp-logo", "reference": "G1", "layer": "B.Cu", "positionMm": [20.0, 5.0], "angleDeg": 45.0},
        ],
        "stats": {"pads": 2, "tracks": 0, "vias": 0, "zone_fills": 0},
    }


def _copper_document() -> SimpleNamespace:
    """The board's facts as the copper geometry document states them (no footprints)."""

    return SimpleNamespace(
        schema="kicad.copper_geometry.a0",
        bounds_nm=(0, 0, 25_000_000, 25_000_000),
        board={"thickness_mm": 1.6, "copper_finish": "ENIG", "edge_connector": "yes"},
        layers=(SimpleNamespace(index=0, name="F.Cu"), SimpleNamespace(index=1, name="B.Cu")),
        nets=tuple(SimpleNamespace(index=key, name=name) for key, name in NETS.items()),
        features=tuple(
            SimpleNamespace(
                kind="pad",
                source_uid=pad["source_uid"],
                net_index=pad["net"],
                layer_indexes=(0,),
                component_ref="R1",
                footprint_uid="fp-r1",
                pad_number=pad["number"],
                outer_nm=tuple(
                    (round(x * 1e6), round(y * 1e6))
                    for x, y in ((pad["bbox"][0], pad["bbox"][1]), (pad["bbox"][2], pad["bbox"][3]))
                ),
            )
            for pad in PADS
        ),
        stats={"pads": 2},
    )


def _board_facts(metadata: dict) -> dict:
    stackup = metadata["board"]["stackup"]
    return {
        "flags": {
            key: stackup[key] for key in ("copper_finish", "edge_connector", "castellated_pads", "edge_plating")
        },
        "net_classes": [item["name"] for item in metadata["board"]["net_classes"]],
        "links": sorted(
            (link["designator"], link["pin"], link["net_name"], link["object_uid"], link["source_uid"])
            for link in metadata["terminal_pad_links"]
        ),
    }


def _bodies(metadata: dict) -> list[tuple]:
    return sorted(
        (component["designator"], tuple(round(value, 6) for value in component.get("body_bbox_mm") or ()))
        for component in metadata["components"]
    )


def _layer_looks(metadata: dict) -> list[tuple]:
    return [(layer["name"], layer["material"], layer["color"]) for layer in metadata["board"]["stackup"]["layers"]]


def _placements(metadata: dict) -> list[tuple]:
    return sorted(
        (
            component["designator"],
            component["unique_id"],
            component["layer"],
            round(component["x_mm"], 6),
            round(component["y_mm"], 6),
            component["angle_deg"],
        )
        for component in metadata["components"]
    )


class BoardMetadataParityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from kicad_monkey import KiCadPcb

        cls._tmp = tempfile.TemporaryDirectory()
        root = Path(cls._tmp.name)
        cls.project = root / "parity.kicad_pro"
        cls.board = root / "parity.kicad_pcb"
        cls.project.write_text(json.dumps(PROJECT), encoding="utf-8")
        cls.board.write_text(BOARD, encoding="utf-8")
        pcb = KiCadPcb.from_file(cls.board)
        cls.adapters = {
            "light": extract_pcb_metadata_light(pcb, cls.project),
            "unified": compile_pcb_artifacts(pcb, cls.project, pcb.to_ir(source_path=str(cls.board)).to_dict())[0],
            "copper": extract_pcb_metadata_from_copper(cls.project, _copper_document()),
            "rust": extract_pcb_metadata_from_mesh_pack(
                cls.project,
                NativeSemanticMeshPack(root=root, metadata_path=root / "mesh-pack.json", payload=_mesh_pack_payload()),
            ),
        }

    @classmethod
    def tearDownClass(cls) -> None:
        cls._tmp.cleanup()

    def test_every_adapter_states_the_same_board_facts(self) -> None:
        expected = {
            "flags": {"copper_finish": "ENIG", "edge_connector": True, "castellated_pads": True, "edge_plating": False},
            "net_classes": ["Default", "Power"],
        }
        reference = _board_facts(self.adapters["unified"])
        self.assertEqual({key: reference[key] for key in expected}, expected)
        self.assertEqual(len(reference["links"]), 2)
        for name, metadata in self.adapters.items():
            with self.subTest(name):
                self.assertEqual(_board_facts(metadata), reference)

    def test_backends_with_footprints_place_every_component_as_kicad_does(self) -> None:
        reference = _placements(self.adapters["unified"])
        self.assertEqual(
            reference,
            [("G1", "fp-logo", "B.Cu", 20.0, 5.0, 45.0), ("R1", "fp-r1", "F.Cu", 10.0, 12.0, 90.0)],
        )
        for name in ("light", "rust"):
            with self.subTest(name):
                self.assertEqual(_placements(self.adapters[name]), reference)

    def test_rust_states_courtyards_and_layer_looks_as_the_ir_path_does(self) -> None:
        reference = self.adapters["unified"]
        self.assertEqual(_bodies(reference), [("G1", ()), ("R1", (9.4, 10.4, 10.6, 13.6))])
        self.assertEqual(_bodies(self.adapters["rust"]), _bodies(reference))
        self.assertEqual(_layer_looks(self.adapters["rust"]), _layer_looks(reference))

    def test_the_copper_document_places_components_by_their_pads(self) -> None:
        # Its contract carries no footprint records: a padless footprint has no
        # component, and placement is the pads' centre without rotation.
        self.assertEqual(_placements(self.adapters["copper"]), [("R1", "fp-r1", "F.Cu", 10.0, 12.0, 0.0)])

    @unittest.skipUnless(
        os.access(os.environ.get("PRISM_KICAD_NATIVE_PATH", ""), os.X_OK),
        "set PRISM_KICAD_NATIVE_PATH to a built prism-kicad-native to check its real output",
    )
    def test_the_rust_helper_states_what_the_rust_fixture_says(self) -> None:
        output = Path(self._tmp.name) / "native"
        subprocess.run(
            [os.environ["PRISM_KICAD_NATIVE_PATH"], "compile-semantic", "--pcb", str(self.board),
             "--output", str(output), "--tile-size", "500"],
            check=True,
            capture_output=True,
        )
        payload = json.loads((output / "mesh-pack.json").read_text(encoding="utf-8"))
        metadata = extract_pcb_metadata_from_mesh_pack(
            self.project, NativeSemanticMeshPack(root=output, metadata_path=output / "mesh-pack.json", payload=payload)
        )
        self.assertEqual(_board_facts(metadata), _board_facts(self.adapters["unified"]))
        self.assertEqual(_placements(metadata), _placements(self.adapters["unified"]))
        self.assertEqual(_bodies(metadata), _bodies(self.adapters["unified"]))
        self.assertEqual(_layer_looks(metadata), _layer_looks(self.adapters["unified"]))
        # KiCad's board-edges box: the outline grown by half its stroke.
        for reference in ([-0.05, -0.05, 25.05, 25.05], self.adapters["unified"]["board"]["bbox_mm"]):
            for actual, expected in zip(metadata["board"]["bbox_mm"], reference, strict=True):
                self.assertAlmostEqual(actual, expected, places=6)


if __name__ == "__main__":
    unittest.main()
