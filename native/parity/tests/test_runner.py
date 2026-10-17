"""Unit tests of the parity runner (stdlib only: ``python3 -m unittest discover -s tests`` from native/parity)."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from prism_parity import compare, divergences as dv, jsonvalue  # noqa: E402
from prism_parity.bundle import Bundle, find_bundles  # noqa: E402
from prism_parity.members import MEMBERS  # noqa: E402


class ValueEquality(unittest.TestCase):
    def test_numbers_are_doubles(self):
        self.assertTrue(jsonvalue.equal(1, 1.0))
        self.assertTrue(jsonvalue.equal(json.loads("1e-05"), json.loads("1e-5")))
        self.assertFalse(jsonvalue.equal(0.1 + 0.2, 0.3))
        self.assertTrue(jsonvalue.equal(2**53, 2**53 + 1))  # identical as IEEE-754 doubles

    def test_booleans_are_not_numbers(self):
        self.assertFalse(jsonvalue.equal(True, 1))
        self.assertFalse(jsonvalue.equal(0, False))
        self.assertTrue(jsonvalue.equal(None, None))
        self.assertFalse(jsonvalue.equal(None, False))

    def test_objects_are_key_sets(self):
        self.assertTrue(jsonvalue.equal({"a": 1, "b": 2}, {"b": 2, "a": 1}))
        diffs = list(jsonvalue.diff({"a": None}, {}))
        self.assertEqual([(d.pointer, d.kind) for d in diffs], [("/a", "missing")])
        diffs = list(jsonvalue.diff({}, {"a": None}))
        self.assertEqual([(d.pointer, d.kind) for d in diffs], [("/a", "extra")])

    def test_arrays_in_order(self):
        self.assertFalse(jsonvalue.equal([1, 2], [2, 1]))
        diffs = list(jsonvalue.diff([1, 2, 3], [1, 5]))
        self.assertEqual([(d.pointer, d.kind) for d in diffs], [("", "length"), ("/1", "value")])

    def test_strings_by_code_point(self):
        self.assertFalse(jsonvalue.equal("\u00e9", "e\u0301"))  # NFC vs NFD are different code points
        self.assertTrue(jsonvalue.equal("\u03a9", "\u03a9"))

    def test_pointer_escaping(self):
        diffs = list(jsonvalue.diff({"a/b": {"m~n": 1}}, {"a/b": {"m~n": 2}}))
        self.assertEqual(diffs[0].pointer, "/a~1b/m~0n")

    def test_type_mismatch(self):
        diffs = list(jsonvalue.diff({"a": "1"}, {"a": 1}))
        self.assertEqual(diffs[0].kind, "type")


class Patterns(unittest.TestCase):
    def test_remove_wildcard(self):
        doc = {"documents": [{"objects": [{"uuid": "a", "contentDigest": "x"}, {"uuid": "b", "contentDigest": "y"}]}]}
        self.assertEqual(jsonvalue.remove_pattern(doc, "/documents/*/objects/*/contentDigest"), 2)
        self.assertEqual(doc, {"documents": [{"objects": [{"uuid": "a"}, {"uuid": "b"}]}]})

    def test_remove_array_elements_keeps_order(self):
        doc = {"a": [0, 1, 2, 3]}
        jsonvalue.remove_pattern(doc, "/a/*")
        self.assertEqual(doc, {"a": []})

    def test_patches(self):
        doc = {"a": [1, 2], "b": {"c": 1}}
        jsonvalue.apply_patch(doc, {"op": "add", "path": "/a/-", "value": 3})
        jsonvalue.apply_patch(doc, {"op": "replace", "path": "/b/c", "value": 2})
        jsonvalue.apply_patch(doc, {"op": "remove", "path": "/a/0"})
        self.assertEqual(doc, {"a": [2, 3], "b": {"c": 2}})
        with self.assertRaises(KeyError):
            jsonvalue.apply_patch(doc, {"op": "replace", "path": "/b/zz", "value": 0})


class Divergences(unittest.TestCase):
    def test_patch_ignore_and_cases(self):
        entries = [
            dv.Divergence("D1", "", ["case-a"], patches=[{"case": "case-a", "op": "replace", "path": "/x", "value": 2}]),
            dv.Divergence("D2", "", ["*"], ignore=["/noise"]),
            dv.Divergence("D3", "", ["case-b"], patches=[{"op": "replace", "path": "/x", "value": 9}]),
        ]
        expected, actual, applied = dv.apply(entries, "case-a", {"x": 1, "noise": 1}, {"x": 2, "noise": 5}, {})
        self.assertEqual(expected, {"x": 2})
        self.assertEqual(actual, {"x": 2})
        self.assertEqual([(a.id, a.effect) for a in applied], [("D1", "changed-golden"), ("D2", "ignored-fields")])

    def test_route_metrics_d7_rule(self):
        golden = {"schema": "prism.route_metrics.a0", "nets": [
            {"netName": "A", "routeLengthNm": 1, "viaCount": 1, "usedLayers": ["B.Cu", "F.Cu"],
             "viaSpans": [{"startLayer": "F.Cu", "stopLayer": "B.Cu", "viaCount": 1}]},
            {"netName": "B", "routeLengthNm": 1, "viaCount": 0, "usedLayers": ["F.Cu"], "viaSpans": []},
        ]}
        stackup = {"copperLayers": ["F.Cu", "In1.Cu", "In2.Cu", "B.Cu"]}
        out = dv.RULES["route-metrics/via-spans-used-layers"](golden, {"stackup": stackup})
        self.assertEqual(out["nets"][0]["usedLayers"], ["B.Cu", "F.Cu", "In1.Cu", "In2.Cu"])
        self.assertEqual(out["nets"][1]["usedLayers"], ["F.Cu"])

    def test_semantic_index_envelope_a2_rule(self):
        rule = dv.RULES["semantic-index/envelope-a2"]
        self.assertEqual(rule({"schema": "prism.semantic_index.a1", "nets": []}, {}),
                         {"schema": "prism.semantic_index.a2", "nets": []})
        self.assertEqual(rule({"schema": "prism.semantic_index.a2"}, {}), {"schema": "prism.semantic_index.a2"})


class MemberChecks(unittest.TestCase):
    def test_non_semantic_field_is_ignored(self):
        member = MEMBERS["semantic-index"]
        report = compare.compare_member(member, "c", {"sourceRevisionKey": "a", "x": 1}, {"sourceRevisionKey": "b", "x": 1}, [], {}, 5)
        self.assertEqual(report.status, "equal")

    def test_content_digest_check(self):
        member = MEMBERS["board-objects"]
        golden = {"documents": [{"path": "a.kicad_pcb", "objects": [{"uuid": "u", "contentDigest": "1"}]}]}
        same = json.loads(json.dumps(golden))
        self.assertEqual(compare.compare_member(member, "c", golden, same, [], {}, 5).status, "equal")
        other = json.loads(json.dumps(golden))
        other["documents"][0]["objects"][0]["contentDigest"] = "2"
        report = compare.compare_member(member, "c", golden, other, [], {}, 5)
        self.assertEqual(report.status, "differs")
        self.assertEqual(report.differences, 0)  # excluded from value equality, caught by the check
        self.assertEqual(report.checks[0]["mismatched"], 1)

    def test_system_interface_digest_self(self):
        member = MEMBERS["system-interface"]
        body = {"schema": "prism.system_interface.v1", "components": []}
        doc = dict(body, digest=compare.system_interface_digest(body))
        self.assertEqual(compare.compare_member(member, "c", doc, dict(doc), [], {}, 5).status, "equal")
        stale = dict(doc, components=[1])
        report = compare.compare_member(member, "c", doc, stale, [], {}, 5)
        self.assertEqual(report.status, "differs")
        self.assertEqual(report.checks[0]["result"], "differs")


class Refusals(unittest.TestCase):
    def test_expected_refusal(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "goldens" / "bad").mkdir(parents=True)
            (root / "goldens" / "bad" / "capture.json").write_text(json.dumps(
                {"inputs": [], "members": {"stackup": {"status": "today-failed", "reason": "SexprTreeError"}}}))
            (root / "b" / "projections").mkdir(parents=True)
            goldens = compare.Goldens(root / "goldens")
            report = compare.compare_case("bad", root / "b", goldens, [MEMBERS["stackup"]], root / "none")
            self.assertEqual(report.members[0].status, "expected-refusal")
            self.assertFalse(report.failed(require_all=True))
            (root / "b" / "projections" / "stackup.json").write_text("{}")
            report = compare.compare_case("bad", root / "b", goldens, [MEMBERS["stackup"]], root / "none")
            self.assertEqual(report.members[0].status, "unexpected-member")
            self.assertTrue(report.failed(require_all=False))


class Bundles(unittest.TestCase):
    def test_archive_and_directory_forms(self):
        doc = {"schema": "prism.stackup.a0", "present": False}
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with zipfile.ZipFile(root / "a.prism", "w") as archive:
                archive.writestr("bundle.json", json.dumps({"members": [{"path": "sources/x.kicad_pcb", "sha256": "0" * 64}]}))
                archive.writestr("projections/stackup.json", json.dumps(doc))
            (root / "b" / "projections").mkdir(parents=True)
            (root / "b" / "projections" / "stackup.json").write_text(json.dumps(doc))
            (root / "c").mkdir()
            (root / "c" / "stackup.json").write_text(json.dumps(doc))
            found = find_bundles(root)
            self.assertEqual(sorted(found), ["a", "b", "c"])
            for name in found:
                bundle = Bundle(found[name])
                self.assertEqual(bundle.member(MEMBERS["stackup"]), doc)
                self.assertIsNone(bundle.member(MEMBERS["placements"]))
                bundle.close()
            bundle = Bundle(found["a"])
            warnings = compare.check_bundle_inputs(bundle, {"inputs": [{"path": "x.kicad_pcb", "sha256": "1" * 64}]})
            self.assertEqual(len(warnings), 1)
            bundle.close()


if __name__ == "__main__":
    unittest.main()
