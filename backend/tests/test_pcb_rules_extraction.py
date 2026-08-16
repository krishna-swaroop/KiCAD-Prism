from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import pcb_rules_service as rs  # noqa: E402


class PcbRulesExtractionTests(unittest.TestCase):
    """Extraction is read-only and needs no database."""

    def setUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        self.base = Path(self._dir.name) / "board"

    def tearDown(self) -> None:
        self._dir.cleanup()

    def _pcb(self, *, pcb: str = "(kicad_pcb)\n", pro: dict | None = None, dru: str | None = None) -> str:
        pcb_path = self.base.with_suffix(".kicad_pcb")
        pcb_path.write_text(pcb, encoding="utf-8")
        if pro is not None:
            self.base.with_suffix(".kicad_pro").write_text(json.dumps(pro), encoding="utf-8")
        if dru is not None:
            self.base.with_suffix(".kicad_dru").write_text(dru, encoding="utf-8")
        return str(pcb_path)

    def test_reads_rules_from_kicad_pro(self) -> None:
        pro = {"board": {"design_settings": {"rules": {
            "min_track_width": 0.1,
            "min_clearance": 0.1,
            "min_via_diameter": 0.4,
            "min_resolved_spokes": 2,
            "allow_microvias": False,
            "min_connection": 0.0,  # placeholder 0 -> dropped
        }}}}
        rules = rs.extract_pcb_rules(self._pcb(pro=pro))
        self.assertEqual(rules["min_track_width"], 0.1)
        self.assertEqual(rules["min_via_diameter"], 0.4)
        self.assertEqual(rules["min_resolved_spokes"], 2)
        self.assertIsInstance(rules["min_resolved_spokes"], int)
        self.assertFalse(rules["allow_microvias"])
        self.assertNotIn("min_connection", rules)  # the 0 is "no constraint"

    def test_copper_finish_comes_from_the_board_setup(self) -> None:
        pcb = '(kicad_pcb (setup (stackup (copper_finish "ENIG"))))\n'
        rules = rs.extract_pcb_rules(self._pcb(pcb=pcb, pro={"board": {"design_settings": {"rules": {}}}}))
        self.assertEqual(rules["copper_finish"], "ENIG")

    def test_dru_fills_gaps_the_pro_did_not_carry(self) -> None:
        # pro carries clearance; dru carries track width; both should appear.
        pro = {"board": {"design_settings": {"rules": {"min_clearance": 0.15}}}}
        dru = "(version 1)\n(rule x (constraint track_width (min 0.13mm)))\n"
        rules = rs.extract_pcb_rules(self._pcb(pro=pro, dru=dru))
        self.assertEqual(rules["min_clearance"], 0.15)
        self.assertEqual(rules["min_track_width"], 0.13)

    def test_pro_wins_over_dru_for_the_same_key(self) -> None:
        pro = {"board": {"design_settings": {"rules": {"min_track_width": 0.1}}}}
        dru = "(rule x (constraint track_width (min 0.2mm)))\n"
        rules = rs.extract_pcb_rules(self._pcb(pro=pro, dru=dru))
        self.assertEqual(rules["min_track_width"], 0.1)

    def test_rules_survive_a_board_with_no_pro(self) -> None:
        # No .kicad_pro; only a stackup finish is readable.
        pcb = '(kicad_pcb (setup (stackup (copper_finish "HASL"))))\n'
        rules = rs.extract_pcb_rules(self._pcb(pcb=pcb))
        self.assertEqual(rules, {"copper_finish": "HASL"})

    def test_missing_board_returns_empty(self) -> None:
        self.assertEqual(rs.extract_pcb_rules(str(self.base) + "-nope.kicad_pcb"), {})

    def test_rule_fields_are_well_formed(self) -> None:
        keys = {f["key"] for f in rs.PCB_RULE_FIELDS}
        self.assertIn("min_track_width", keys)
        self.assertIn("copper_finish", keys)
        for f in rs.PCB_RULE_FIELDS:
            self.assertIn(f["type"], ("number", "int", "bool", "text"))
            self.assertTrue(f["label"])


if __name__ == "__main__":
    unittest.main()
