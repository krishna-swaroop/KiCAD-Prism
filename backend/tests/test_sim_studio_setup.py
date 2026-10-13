"""Simulation Studio setup logic: contract projection, JSON Patch, drafting and validation."""

from __future__ import annotations

import copy
import json
import unittest
from pathlib import Path

from pydantic import ValidationError

from app.sim_studio import drafting, validation
from app.sim_studio.board_facts import BoardFacts, from_semantic_index
from app.sim_studio.json_patch import PatchError, apply_patch
from app.sim_studio.models import CatalogEntry, SetupIssue, SimSetup
from app.sim_studio.service import InvalidSetup, canonical_sha256, parse_setup

VECTORS = Path(__file__).parent / "fixtures" / "sim_studio_contract"


def vector(name: str) -> dict:
    return json.loads((VECTORS / name).read_text(encoding="utf-8"))


def facts() -> BoardFacts:
    index = {
        "components": [{"reference": ref, "pcbRefs": [{}]} for ref in ("U1", "U5", "J1", "TP3", "R12")],
        "nets": [{"name": name} for name in ("+3V3", "+12V", "GND", "SDA", "VDD_1V8")],
        "terminals": [
            {"reference": ref, "pin": pin, "netName": net, "pcbPadUuid": f"{ref}-{pin}"}
            for ref, pin, net in (
                ("U5", "1", "+12V"), ("U5", "2", "+3V3"), ("U5", "3", "GND"),
                ("U1", "12", "+3V3"), ("U1", "30", "+3V3"), ("U1", "13", "GND"), ("U1", "7", "SDA"),
                ("J1", "1", "+12V"), ("J1", "2", "GND"), ("TP3", "1", "+3V3"), ("R12", "1", "VDD_1V8"),
            )
        ],
    }
    return from_semantic_index(index)


def single_net_setup() -> dict:
    return {
        "schema": "prism.sim.setup", "version": "a0", "name": "3V3 single load",
        "bundle": {"board_id": "main"}, "materials": {"slices": {}}, "components": {},
        "rails": [{"id": "3v3", "net": "main:+3V3", "voltage_v": 3.3}],
        "terminals": [
            {"id": "vrm", "positive": ["main:U5.2"], "reference": ["main:U5.3"]},
            {"id": "mcu", "positive": ["main:U1.12", "main:U1.30"], "reference": ["main:U1.13"]},
        ],
        "sources": [{"id": "vrm", "rail": "3v3", "terminal": "vrm"}],
        "loads": [{"id": "mcu", "rail": "3v3", "terminal": "mcu", "current_a": 0.5, "distribution": "uniform"}],
        "converters": [], "probes": [],
        "analyses": [{"id": "dc", "kind": "dc-drop", "rails": ["3v3"]}],
    }


def codes(items: list[SetupIssue], severity: str = "error") -> set[str]:
    return {item.code for item in items if item.severity == severity}


class ContractProjectionTest(unittest.TestCase):
    """The Pydantic models accept and refuse what the TypeSpec contract does."""

    def test_setup_vectors(self) -> None:
        SimSetup.model_validate(vector("SimSetup.valid.json"))
        with self.assertRaises(ValidationError):
            SimSetup.model_validate(vector("SimSetup.invalid.json"))

    def test_report_and_catalog_vectors(self) -> None:
        for issue in vector("SetupReport.valid.json")["issues"]:
            SetupIssue.model_validate(issue)
        with self.assertRaises(ValidationError):
            for issue in vector("SetupReport.invalid.json")["issues"]:
                SetupIssue.model_validate(issue)
        for entry in vector("SimCatalog.valid.json")["entries"]:
            CatalogEntry.model_validate(entry)
        with self.assertRaises(ValidationError):
            for entry in vector("SimCatalog.invalid.json")["entries"]:
                CatalogEntry.model_validate(entry)

    def test_round_trip_keeps_the_contract_shape(self) -> None:
        document = vector("SimSetup.valid.json")
        self.assertEqual(SimSetup.model_validate(document).document(), document)

    def test_unknown_fields_are_refused_with_a_pointer(self) -> None:
        document = single_net_setup()
        document["loads"][0]["amps"] = 2
        with self.assertRaises(InvalidSetup) as caught:
            parse_setup(document)
        self.assertIn("/loads/0/amps", str(caught.exception))

    def test_canonical_hash_ignores_key_order(self) -> None:
        document = single_net_setup()
        reordered = json.loads(json.dumps(document, sort_keys=True))
        self.assertEqual(canonical_sha256(document), canonical_sha256(reordered))


class JsonPatchTest(unittest.TestCase):
    def test_rfc6902_operations(self) -> None:
        document = {"a": [1, 2], "b": {"c": 1}}
        patched = apply_patch(document, [
            {"op": "add", "path": "/a/-", "value": 3},
            {"op": "add", "path": "/a/0", "value": 0},
            {"op": "replace", "path": "/b/c", "value": 2},
            {"op": "copy", "from": "/b", "path": "/d"},
            {"op": "move", "from": "/d/c", "path": "/e"},
            {"op": "remove", "path": "/a/1"},
            {"op": "test", "path": "/e", "value": 2},
            {"op": "add", "path": "/k~1v", "value": None},
        ])
        self.assertEqual(patched, {"a": [0, 2, 3], "b": {"c": 2}, "d": {}, "e": 2, "k/v": None})
        self.assertEqual(document, {"a": [1, 2], "b": {"c": 1}})

    def test_failures_are_atomic_and_named(self) -> None:
        document = {"a": [1]}
        for operations, fragment in (
            ([{"op": "replace", "path": "/missing", "value": 1}], "does not exist"),
            ([{"op": "add", "path": "/a/5", "value": 1}], "out of range"),
            ([{"op": "test", "path": "/a/0", "value": 2}], "test failed"),
            ([{"op": "add", "path": "/a/-"}], "'value' is required"),
            ([{"op": "move", "from": "/a", "path": "/a/0"}], "own child"),
            ([{"op": "add", "path": "a", "value": 1}], "must start with '/'"),
            ({"op": "add"}, "array of operations"),
        ):
            with self.subTest(fragment=fragment), self.assertRaises(PatchError) as caught:
                apply_patch(document, operations)
            self.assertIn(fragment, str(caught.exception))
        self.assertEqual(document, {"a": [1]})


class DraftingTest(unittest.TestCase):
    def test_rail_voltage_from_net_names(self) -> None:
        for name, volts in (("+3V3", 3.3), ("3V3", 3.3), ("VDD_1V8", 1.8), ("+12V", 12.0), ("VBUS_5V", 5.0),
                            ("P5V0", 5.0), ("+3.3V", 3.3), ("1V0_CORE", 1.0)):
            with self.subTest(name=name):
                self.assertEqual(drafting.rail_voltage(name), volts)
        for name in ("GND", "SDA", "AGND", "VSS", "USB_D+", "LED1", "3V3_TO_5V", "/Regulators/LX_0V9",
                     "/Regulators/PG_3V3", "EN_1V8", "FB_1V2", "SW-5V"):
            with self.subTest(name=name):
                self.assertIsNone(drafting.rail_voltage(name))

    def test_draft_proposes_rails_and_nothing_it_cannot_know(self) -> None:
        document = drafting.draft("dc-drop", "Max load", facts())
        setup = SimSetup.model_validate(document)
        # VDD_1V8 reaches one pad only, so it is not proposed.
        self.assertEqual([(rail.id, rail.net, rail.voltage_v, rail.inferred) for rail in setup.rails],
                         [("12v", "main:+12V", 12.0, True), ("3v3", "main:+3V3", 3.3, True)])
        self.assertEqual((setup.sources, setup.loads, setup.terminals), ([], [], []))
        report = validation.validate(setup, facts())
        self.assertEqual(codes(report), {"analysis-without-rails"})

    def test_other_kinds_have_no_flow_yet(self) -> None:
        with self.assertRaises(ValueError):
            drafting.draft("ac-pdn", "x", facts())


class ValidationTest(unittest.TestCase):
    def check(self, document: dict, *, stage: str = "validate") -> list[SetupIssue]:
        run = validation.preflight if stage == "preflight" else validation.validate
        return run(SimSetup.model_validate(document), facts())

    def test_a_complete_single_net_setup_passes(self) -> None:
        self.assertEqual(self.check(single_net_setup()), [])
        issues = self.check(single_net_setup(), stage="preflight")
        self.assertEqual(codes(issues), set())
        self.assertEqual(codes(issues, "warning"), {"connectivity-not-checked"})

    def test_board_references(self) -> None:
        document = single_net_setup()
        document["terminals"][1]["positive"].append("main:U1.99")
        document["terminals"][1]["positive"].append("main:U1.7")
        document["rails"].append({"id": "x", "net": "main:NOPE", "voltage_v": 1})
        document["components"]["main:U42"] = {"source": "ignored"}
        document["loads"][0]["component"] = "other:U1"
        issues = self.check(document)
        self.assertEqual(codes(issues), {"unknown-pin", "terminal-not-on-rail", "unknown-net",
                                         "unknown-component", "unknown-board"})
        pin = next(item for item in issues if item.code == "unknown-pin")
        self.assertEqual((pin.path, pin.refs), ("/terminals/1/positive/2", ["main:U1.99"]))

    def test_definitions_must_resolve(self) -> None:
        document = single_net_setup()
        document["loads"][0]["terminal"] = "nowhere"
        document["sources"].append({"id": "vrm", "rail": "5v", "terminal": "vrm"})
        document["probes"].append({"id": "p", "terminal": "gone"})
        document["analyses"][0]["rails"].append("1v8")
        document["terminals"][0]["reference"] = ["main:U5.2"]
        self.assertEqual(codes(self.check(document)), {"unknown-terminal", "unknown-rail", "duplicate-id",
                                                       "reference-on-positive-net"})

    def test_preflight_checks_the_power_tree(self) -> None:
        document = single_net_setup()
        document["rails"].append({"id": "12v", "net": "main:+12V", "voltage_v": 12})
        document["terminals"].append({"id": "vin", "positive": ["main:U5.1"], "reference": ["main:U5.3"]})
        document["components"]["main:U5"] = {"source": "assumed", "model": {"kind": "regulator"}}
        document["converters"].append({"id": "buck", "component": "main:U5", "input_rail": "12v",
                                       "input_terminal": "vin", "output_source": "vrm", "efficiency": 0.9})
        issues = self.check(document, stage="preflight")
        self.assertEqual(codes(issues), set())
        self.assertIn("converter-input-not-solved", codes(issues, "warning"))
        both = copy.deepcopy(document)
        both["analyses"][0]["rails"] = ["3v3", "12v"]
        self.assertIn("rail-without-source", codes(self.check(both, stage="preflight")))

    def test_report_shape(self) -> None:
        report = validation.report("validate", "a" * 64, self.check(single_net_setup()))
        self.assertEqual(report["ok"], True)
        self.assertEqual(report["schema"], "prism.sim.setup-report")


if __name__ == "__main__":
    unittest.main()
