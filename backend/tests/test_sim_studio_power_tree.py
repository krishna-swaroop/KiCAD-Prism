"""Power-tree inference from pin types, names and series parts."""

from __future__ import annotations

import unittest

from app.sim_studio.board_facts import from_semantic_index
from app.sim_studio.power_tree import infer

_PARTS = {
    "J1": ("Connector:Conn_01x02", "CONN"),
    "U5": ("Regulator_Switching:TPS54338", "TPS54338"),
    "U2": ("Regulator_Linear:LP5912", "LP5912"),
    "U1": ("MCU:Chip", "MCU"),
    "U3": ("Memory:Flash", "FLASH"),
    "L1": ("Device:L", "4.7uH"),
    "FB1": ("Device:FerriteBead_Small", "600R@100MHz"),
    "R7": ("Device:R", "0R"),
    "R8": ("Device:R", "10k"),
    "TP3": ("Connector:TestPoint", "TP"),
}
_PINS = (
    ("J1", "1", "1", "PASSIVE", "+12V"), ("J1", "2", "2", "PASSIVE", "GND"),
    ("U5", "1", "VIN", "POWER_IN", "+12V"), ("U5", "2", "SW", "POWER_OUT", "Net-(U5-SW)"),
    ("U5", "3", "GND", "POWER_IN", "GND"), ("U5", "4", "FB", "INPUT", "Net-(U5-FB)"),
    ("L1", "1", "1", "PASSIVE", "Net-(U5-SW)"), ("L1", "2", "2", "PASSIVE", "+3V3"),
    ("U2", "1", "IN", "POWER_IN", "+3V3"), ("U2", "2", "OUT", "POWER_OUT", "+1V8"), ("U2", "3", "GND", "POWER_IN", "GND"),
    ("U1", "1", "VDD", "POWER_IN", "+3V3"), ("U1", "2", "VDD", "POWER_IN", "+3V3"), ("U1", "3", "VSS", "POWER_IN", "GND"),
    ("U1", "4", "VDDA", "POWER_IN", "VDDA"), ("U1", "5", "SDA", "BIDIRECTIONAL", "SDA"),
    ("FB1", "1", "1", "PASSIVE", "+3V3"), ("FB1", "2", "2", "PASSIVE", "VDDA"),
    ("R7", "1", "1", "PASSIVE", "+1V8"), ("R7", "2", "2", "PASSIVE", "VDD_IO_1V8"),
    ("R8", "1", "1", "PASSIVE", "+3V3"), ("R8", "2", "2", "PASSIVE", "SDA"),
    ("U3", "1", "VCC", "POWER_IN", "VDD_IO_1V8"), ("U3", "2", "GND", "POWER_IN", "GND"),
    ("TP3", "1", "1", "PASSIVE", "+3V3"),
)


def board():
    return from_semantic_index({
        "components": [
            {"reference": ref, "pcbRefs": [{}], "libraryRef": lib, "value": value}
            for ref, (lib, value) in _PARTS.items()
        ],
        "nets": [{"name": name} for name in {pin[4] for pin in _PINS}],
        "terminals": [
            {"reference": ref, "pin": pin, "pinName": name, "pinType": kind, "netName": net, "pcbPadUuid": f"{ref}-{pin}"}
            for ref, pin, name, kind, net in _PINS
        ],
    })


class PowerTreeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tree = infer(board())

    def test_rails_and_analysis_order_from_the_top(self) -> None:
        self.assertEqual([r["id"] for r in self.tree.rails], ["12v", "3v3", "1v8"])
        self.assertEqual(self.tree.analysis_rails, ["12v", "3v3", "1v8"])

    def test_connector_feeds_the_unfed_rail(self) -> None:
        source = next(s for s in self.tree.sources if s["rail"] == "12v")
        self.assertEqual(source["component"], "main:J1")
        terminal = next(t for t in self.tree.terminals if t["id"] == source["terminal"])
        self.assertEqual((terminal["positive"], terminal["reference"]), (["main:J1.1"], ["main:J1.2"]))

    def test_converters_switching_through_the_inductor_and_linear_direct(self) -> None:
        kinds = {c["component"]: (c["input_rail"], c["kind"]) for c in self.tree.converters}
        self.assertEqual(kinds, {"main:U5": ("12v", "switching"), "main:U2": ("3v3", "linear")})
        buck = next(c for c in self.tree.converters if c["component"] == "main:U5")
        out = next(s for s in self.tree.sources if s["id"] == buck["output_source"])
        terminal = next(t for t in self.tree.terminals if t["id"] == out["terminal"])
        self.assertEqual((out["rail"], terminal["positive"], terminal["reference"]), ("3v3", ["main:L1.2"], ["main:U5.3"]))
        self.assertNotIn("efficiency", buck)

    def test_loads_skip_regulators_passives_and_test_points(self) -> None:
        loads = {(l["rail"], l["component"]) for l in self.tree.loads}
        self.assertEqual(loads, {("3v3", "main:U1"), ("3v3", "main:FB1"), ("1v8", "main:R7")})
        self.assertTrue(all(l["current_a"] == 0 for l in self.tree.loads))

    def test_filtered_and_linked_branches_fold_into_the_parent(self) -> None:
        self.assertNotIn("vdd_io_1v8", [r["id"] for r in self.tree.rails])
        codes = sorted((n["code"], n["refs"][0]) for n in self.tree.notes)
        self.assertEqual(codes, [("filtered-branch", "main:VDDA"), ("filtered-branch", "main:VDD_IO_1V8")])


if __name__ == "__main__":
    unittest.main()
