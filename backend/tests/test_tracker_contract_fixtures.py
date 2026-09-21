"""The tracker-integration contract packet stays well-formed (TR-00).

This guards ``docs/tracker-integration``: every fixture case names its owning
ticket, the decision it proves and an observable expectation, and the DTO
examples agree with the enumerations the contracts freeze. It does not test
product behaviour; the owning tickets do that.
"""

import json
import re
import unittest
from pathlib import Path

DOCS = Path(__file__).resolve().parents[2] / "docs" / "tracker-integration"
FIXTURES = DOCS / "fixtures"
CONTRACTS = DOCS / "CONTRACTS.md"
EXAMPLES = DOCS / "dto-examples.json"

EXPECTED_SETS = [f"F{n}" for n in range(1, 11)]
DECISIONS = {f"D{n}" for n in range(1, 10)} | {f"C{n}" for n in range(1, 10)}
TICKET = re.compile(r"^TR-\d{2}$")
CASE_FIELDS = {"id", "owner", "given", "when", "expect", "proves"}


def _load(path: Path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


class TrackerContractFixturesTest(unittest.TestCase):
    def setUp(self):
        self.manifests = {path.name: _load(path) for path in sorted(FIXTURES.glob("F*.json"))}
        self.contracts = CONTRACTS.read_text(encoding="utf-8")

    def test_every_fixture_set_is_present_once(self):
        sets = [m["set"] for m in self.manifests.values()]
        self.assertEqual(sets, EXPECTED_SETS)

    def test_cases_are_complete_and_unique(self):
        seen = set()
        for name, manifest in self.manifests.items():
            self.assertTrue(manifest["cases"], f"{name} has no cases")
            self.assertTrue(TICKET.match(manifest["owner"]), f"{name}: owner {manifest['owner']!r}")
            for case in manifest["cases"]:
                self.assertEqual(set(case), CASE_FIELDS, f"{name}: {case.get('id')} fields")
                self.assertTrue(case["id"].startswith(manifest["set"] + "."), f"{name}: {case['id']} prefix")
                self.assertNotIn(case["id"], seen, f"duplicate case id {case['id']}")
                seen.add(case["id"])
                self.assertTrue(TICKET.match(case["owner"]), f"{case['id']}: owner")
                self.assertIn(case["proves"], DECISIONS, f"{case['id']}: proves {case['proves']!r}")
                self.assertTrue(case["when"].strip(), f"{case['id']}: when is empty")
                for field in ("given", "expect"):
                    self.assertGreater(len(case[field]), 10, f"{case['id']}: {field} too thin")

    def test_every_decision_has_a_proving_case(self):
        proved = {case["proves"] for m in self.manifests.values() for case in m["cases"]}
        for decision in (f"D{n}" for n in range(1, 10)):
            self.assertIn(decision, proved, f"{decision} has no fixture case")

    def test_contract_sections_and_fixture_references_exist(self):
        for heading in (f"### D{n} " for n in range(1, 10)):
            self.assertIn(heading, self.contracts)
        for case_ref in re.findall(r"`(F\d+\.[a-z][a-z0-9]*_[a-z0-9_]+)`", self.contracts):
            set_name, _, case_id = case_ref.partition(".")
            manifest = self.manifests[f"F{int(set_name[1:]):02d}.json"]
            ids = {case["id"] for case in manifest["cases"]}
            self.assertIn(case_ref, ids, f"CONTRACTS.md references unknown case {case_ref}")

    def test_dto_examples_agree_with_frozen_enumerations(self):
        examples = _load(EXAMPLES)
        tracker = examples["tracker"]
        self.assertEqual(
            tracker["ProviderError_classes"],
            ["rate_limited", "auth_lost", "forbidden", "not_found_uncertain", "gone_confirmed",
             "moved", "transient", "invalid_request", "capability_missing",
             "paused", "visibility", "visibility_unknown", "connector_missing"],
        )
        self.assertIn(tracker["ProviderError"]["class"], tracker["ProviderError_classes"])
        self.assertIn(tracker["SyncOp"]["state"], tracker["SyncOp_states"])
        self.assertIn(tracker["SyncOp"]["op"], tracker["SyncOp_kinds"])
        self.assertIn(tracker["TrackedThread"]["linkState"], tracker["LinkState_values"])
        comment = examples["comments"]["Comment"]
        self.assertEqual(comment["forgeIssueId"], comment["tracker"]["externalId"])
        self.assertEqual({"userId", "displayName"}, set(examples["comments"]["Mention"]))
        marker = tracker["IssueDraft"]["marker"]
        self.assertRegex(marker, r"^<!-- prism:v1 connector=\S+ container=\S+ comment=\S+ op=\S+ -->$")
        self.assertNotIn("@", tracker["IssueDraft"]["contextBlock"]["requestedBy"].split("(")[1])

    def test_generated_output_examples_carry_no_email_addresses(self):
        text = json.dumps(_load(EXAMPLES)["tracker"])
        self.assertNotRegex(text, r"[\w.+-]+@[\w-]+\.[\w.]+")


if __name__ == "__main__":
    unittest.main()
