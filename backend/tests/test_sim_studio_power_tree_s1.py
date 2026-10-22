"""The System One power-tree spike: the records it builds and how it reads answers."""

from __future__ import annotations

import unittest

from app.sim_studio import power_tree_s1
from tests.test_sim_studio_power_tree import board


class _Fake(power_tree_s1.SystemOne):
    """Answers every choice with its first option, and records what it was asked."""

    def __init__(self) -> None:
        super().__init__("http://unused")
        self.asked: list[tuple[object, dict]] = []

    def ask(self, state, questions):
        self.asked.append((state, questions))
        out = {}
        for qid, q in questions.items():
            names = list(q["criteria"])
            out[qid] = {"choice": names[0], "confidence": 0.5,
                        "probabilities": {n: (0.6 if i == 0 else 0.4 / (len(names) - 1)) for i, n in enumerate(names)}}
        return out


class RecordTest(unittest.TestCase):
    def setUp(self) -> None:
        self.facts = board()
        self.index = power_tree_s1._Index(self.facts)

    def test_a_net_lists_active_pins_with_counts_and_passives_by_kind(self) -> None:
        state = power_tree_s1.net_state(self.index, "+3V3")
        self.assertEqual(state["net"], "+3V3")
        self.assertIn("U1 MCU [MCU:Chip]: VDD (power_in) x2", state["pins"])
        self.assertIn("FB1 600R@100MHz to VDDA", state["FB parts"])

    def test_a_part_groups_its_pins_by_net(self) -> None:
        state = power_tree_s1.part_state(self.index, "U5")
        self.assertEqual(state["value"], "TPS54338")
        self.assertIn("SW (power_out) -> Net-(U5-SW)", state["pins"])

    def test_candidates_skip_passives_and_single_pad_nets(self) -> None:
        self.assertNotIn("R8", power_tree_s1.candidate_parts(self.facts))
        self.assertIn("U5", power_tree_s1.candidate_parts(self.facts))
        self.assertNotIn("Net-(U5-FB)", power_tree_s1.candidate_nets(self.facts))
        self.assertIn("+3V3", power_tree_s1.candidate_nets(self.facts))


class ClassifyTest(unittest.TestCase):
    def test_one_question_per_subject_with_confidence_kept(self) -> None:
        fake = _Fake()
        result = power_tree_s1.classify(board(), fake)
        facts = board()
        self.assertEqual(len(fake.asked), len(power_tree_s1.candidate_nets(facts)) + len(power_tree_s1.candidate_parts(facts)))
        first = result["nets"][0]
        self.assertEqual(first.answer, "supply_rail")
        self.assertEqual(first.confidence, 0.5)
        self.assertEqual(result["parts"][0].answer, "switching_regulator")


if __name__ == "__main__":
    unittest.main()
