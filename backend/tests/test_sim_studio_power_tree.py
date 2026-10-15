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
    "X1": ("Oscillator:ASE-xxxMHz", "25MHz"),
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
    ("X1", "1", "VDD", "POWER_IN", "+3V3"), ("X1", "2", "OUT", "OUTPUT", "CLK25"), ("X1", "3", "GND", "POWER_IN", "GND"),
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
        self.assertEqual(loads, {("3v3", "main:U1"), ("3v3", "main:X1"), ("3v3", "main:FB1"), ("1v8", "main:R7")})
        self.assertTrue(all(l["current_a"] == 0 for l in self.tree.loads))

    def test_filtered_and_linked_branches_fold_into_the_parent(self) -> None:
        self.assertNotIn("vdd_io_1v8", [r["id"] for r in self.tree.rails])
        codes = sorted((n["code"], n["refs"][0]) for n in self.tree.notes)
        self.assertEqual(codes, [("filtered-branch", "main:VDDA"), ("filtered-branch", "main:VDD_IO_1V8")])


if __name__ == "__main__":
    unittest.main()


class CandidatesTest(unittest.TestCase):
    """What the canvas offers per element kind, from the same rules as ``infer``."""

    def setUp(self) -> None:
        from app.sim_studio.power_tree import candidates

        self.found = candidates(board())

    def test_rails_are_power_nets_only(self) -> None:
        nets = [rail["net"] for rail in self.found["rails"]]
        # Named rails by voltage, then the ferrite-fed supply; no ground, switch node, FB or signal.
        self.assertEqual(nets, ["+12V", "+3V3", "+1V8", "VDD_IO_1V8", "VDDA"])
        vdda = self.found["rails"][-1]
        self.assertIsNone(vdda["voltage_v"])
        self.assertIn("through FB1", vdda["reason"])
        self.assertEqual(self.found["rails"][1]["fed_by"], ["U5"])

    def test_converters_carry_their_rails(self) -> None:
        rows = {row["component"]: row for row in self.found["converters"]}
        # Not the oscillator, whose clock pin is named OUT.
        self.assertEqual(set(rows), {"U2", "U5"})
        self.assertEqual((rows["U5"]["input_net"], rows["U5"]["output_net"], rows["U5"]["kind"]), ("+12V", "+3V3", "switching"))
        self.assertEqual((rows["U2"]["input_net"], rows["U2"]["output_net"], rows["U2"]["kind"]), ("+3V3", "+1V8", "linear"))

    def test_sources_are_connectors_on_rails_not_test_points(self) -> None:
        self.assertEqual([(row["component"], row["net"], row["fed"]) for row in self.found["sources"]], [("J1", "+12V", False)])

    def test_loads_are_part_and_rail_pairs_without_converter_inputs_or_sources(self) -> None:
        pairs = [(row["component"], row["net"]) for row in self.found["loads"]]
        self.assertEqual(pairs, [("U1", "+3V3"), ("U1", "VDDA"), ("U3", "VDD_IO_1V8"), ("X1", "+3V3")])
        self.assertEqual(self.found["loads"][0]["power_in"], 2)


# Edge cases found running inference over real boards: PMIC phase pins,
# mis-typed LDO outputs, logic buffers named OUT, level-shifted lines and
# enables named for a voltage, off-rail modules, diode-OR inputs, pi
# filters, split grounds, and supplies whose name gives no voltage.
_EDGE_PARTS = {
    "J1": ("Connector:USB_C", "USB-C"),
    "J2": ("Connector:RJ45", "RJ45"),
    "JFB1": ("Vendor:HARWIN_M22", "M22"),
    "U1": ("Regulators:IRPS5401", "IRPS5401", "Flexible Power Management Unit (switching regulators)"),
    "U2": ("Standard Logic:74HCT1G125", "74HCT1G125"),
    "U3": ("Logic:Shift_Register", "74LVC594"),
    "U4": ("Clock:SI5340", "SI5340"),
    "PS1": ("q-lab:PSU_poe", "poe-12v"),
    "U5": ("MCU:Chip", "MCU"),
    "D1": ("Device:D_Schottky", "SS14"),
    "D2": ("Device:D_Schottky", "SS14"),
    "D3": ("Device:D_Zener", "5V6"),
    "L1": ("Device:L", "2.2uH"),
    "L2": ("Device:FerriteBead", "BLM21"),
    "L3": ("Device:FerriteBead", "BLM21"),
    "C1": ("Device:C", "22uF"),
    "U6": ("Logic:Buffer", "74LVC1G"),
}
_EDGE_PINS = (
    ("J1", "1", "VBUS", "PASSIVE", "USB_VBUS"), ("J1", "2", "GND", "PASSIVE", "GND"),
    ("D1", "1", "K", "PASSIVE", "+5V"), ("D1", "2", "A", "PASSIVE", "USB_VBUS"),
    ("D2", "1", "K", "PASSIVE", "+5V"), ("D2", "2", "A", "PASSIVE", "Net-(D2-A)"),
    ("D3", "1", "K", "PASSIVE", "+5V"), ("D3", "2", "A", "PASSIVE", "GND"),
    ("U1", "1", "VIN_C", "INPUT", "+5V"), ("U1", "2", "PHASE_C", "INPUT", "Net-(U1-PHASE_C)"),
    ("U1", "3", "VO_LDO", "POWER_IN", "V0P9"), ("U1", "4", "PG_C", "OUTPUT", "P1V8_EN"), ("U1", "5", "GND", "POWER_IN", "GND"),
    ("L1", "1", "1", "PASSIVE", "Net-(U1-PHASE_C)"), ("L1", "2", "2", "PASSIVE", "P1V8"),
    ("U5", "1", "VDD", "POWER_IN", "P1V8"), ("U5", "2", "VDDA", "POWER_IN", "V0P9"), ("U5", "3", "VSS", "POWER_IN", "GND"),
    ("U5", "4", "IOVDD", "POWER_IN", "V3P3"), ("U5", "5", "VSSA", "POWER_IN", "GND_XTAL"),
    ("U2", "1", "VCC", "POWER_IN", "FP_VDD"), ("U2", "2", "OUT", "TRI_STATE", "LED_DIN_5V"), ("U2", "3", "GND", "POWER_IN", "GND"),
    ("JFB1", "1", "1", "PASSIVE", "FP_VDD"), ("JFB1", "2", "2", "PASSIVE", "LED_DIN_5V"), ("JFB1", "3", "3", "PASSIVE", "GND"),
    ("U6", "1", "Y", "OUTPUT", "CK_3V3"), ("U6", "2", "VCC", "POWER_IN", "P1V8"), ("U6", "3", "GND", "POWER_IN", "GND"),
    ("U3", "1", "SHCP", "INPUT", "CK_3V3"), ("U3", "2", "VCC", "POWER_IN", "P1V8"), ("U3", "3", "GND", "POWER_IN", "GND"),
    ("L2", "1", "1", "PASSIVE", "P1V8"), ("L2", "2", "2", "PASSIVE", "Net-(C1-Pad2)"),
    ("C1", "1", "1", "PASSIVE", "GND"), ("C1", "2", "2", "PASSIVE", "Net-(C1-Pad2)"),
    ("L3", "1", "1", "PASSIVE", "Net-(C1-Pad2)"), ("L3", "2", "2", "PASSIVE", "P1V8_CLK"),
    ("U4", "1", "VDD", "POWER_IN", "P1V8_CLK"), ("U4", "2", "VDD", "POWER_IN", "P1V8_CLK"),
    ("U4", "3", "GND", "POWER_IN", "GND"), ("U4", "4", "GND", "POWER_IN", "GND_XTAL"),
    ("J2", "1", "P0", "PASSIVE", "Net-(J2-P0)"), ("J2", "2", "P1", "PASSIVE", "Net-(J2-P1)"),
    ("PS1", "1", "P0", "PASSIVE", "Net-(J2-P0)"), ("PS1", "2", "P1", "PASSIVE", "Net-(J2-P1)"),
    ("PS1", "3", "+3V3", "POWER_OUT", "V3P3"), ("PS1", "4", "GND", "PASSIVE", "GND"),
)


def edge_board():
    def part(ref, spec):
        lib, value, *description = spec
        return {"reference": ref, "pcbRefs": [{}], "libraryRef": lib, "value": value,
                "fields": {"Description": description[0]} if description else {}}

    return from_semantic_index({
        "components": [part(ref, spec) for ref, spec in _EDGE_PARTS.items()],
        "nets": [{"name": name} for name in {pin[4] for pin in _EDGE_PINS}],
        "terminals": [
            {"reference": ref, "pin": pin, "pinName": name, "pinType": kind, "netName": net, "pcbPadUuid": f"{ref}-{pin}"}
            for ref, pin, name, kind, net in _EDGE_PINS
        ],
    })


class EdgeCaseTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tree = infer(edge_board())
        self.rails = {r["id"]: r["voltage_v"] for r in self.tree.rails}
        self.notes = {n["code"]: n for n in self.tree.notes}

    def terminal(self, terminal_id: str) -> dict:
        return next(t for t in self.tree.terminals if t["id"] == terminal_id)

    def test_signals_named_for_a_voltage_are_not_rails(self) -> None:
        # P1V8_EN is a power-good line, LED_DIN_5V a buffered data line, CK_3V3 a shifted clock.
        # (P1V8_CLK is a rail, but filtered off P1V8, so it is a load there instead.)
        self.assertEqual(set(self.rails), {"5v", "p1v8", "v0p9", "v3p3"})
        self.assertEqual(self.rails["v3p3"], 3.3)
        self.assertEqual(self.rails["v0p9"], 0.9)

    def test_pmic_phase_and_ldo_pins_are_converter_outputs(self) -> None:
        kinds = {c["id"]: (c["input_rail"], c["kind"]) for c in self.tree.converters}
        self.assertEqual(kinds, {"u1-p1v8": ("5v", "switching"), "u1-v0p9": ("5v", "linear")})

    def test_a_logic_buffer_named_out_is_not_a_converter(self) -> None:
        self.assertFalse(any(c["component"] == "main:U2" for c in self.tree.converters))

    def test_an_off_rail_module_is_its_rails_source(self) -> None:
        source = next(s for s in self.tree.sources if s["rail"] == "v3p3")
        self.assertEqual(source["component"], "main:PS1")
        self.assertIn("converter-as-source", self.notes)

    def test_a_diode_or_feeds_the_rail_at_its_cathodes_but_a_zener_does_not(self) -> None:
        source = next(s for s in self.tree.sources if s["rail"] == "5v")
        self.assertEqual(self.terminal(source["terminal"])["positive"], ["main:D1.1", "main:D2.1"])
        self.assertIn("diode-or-source", self.notes)

    def test_a_pi_filter_is_one_load_on_the_parent_rail(self) -> None:
        self.assertNotIn("p1v8_clk", self.tree.analysis_rails)
        branch = next(l for l in self.tree.loads if l["component"] == "main:L2")
        self.assertEqual(branch["rail"], "p1v8")
        self.assertIn("U4", self.notes["filtered-branch"]["message"])

    def test_return_pads_stay_on_one_ground(self) -> None:
        # U5 has a pin on GND_XTAL, a ground joined to GND by a net tie; its returns use GND only.
        for load in (l for l in self.tree.loads if l["component"] == "main:U5"):
            self.assertEqual(self.terminal(load["terminal"])["reference"], ["main:U5.3"])

    def test_a_supply_with_no_voltage_in_its_name_is_noted(self) -> None:
        self.assertIn("FP_VDD", self.notes["rail-voltage-unknown"]["message"])
        self.assertIn("JFB1", self.notes["rail-voltage-unknown"]["message"])


class RailVoltageTest(unittest.TestCase):
    def test_names(self) -> None:
        from app.sim_studio.drafting import rail_voltage

        cases = {
            "+3V3": 3.3, "V3P3": 3.3, "3P3V": 3.3, "/pwr/VDD_1P8": 1.8, "MGT_0V85": 0.85, "+12V_POE": 12.0,
            "P3V3_EN": None, "/x/P1V8AUX_PG": None, "/LED_IO_DIN_5V": None, "P3V3_CLK": 3.3, "GND": None,
        }
        self.assertEqual({name: rail_voltage(name) for name in cases}, cases)
