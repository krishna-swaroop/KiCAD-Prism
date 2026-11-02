"""The merged search: a part found in the library and in supply is one row. No database."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply import part_search  # noqa: E402

LM358 = {"id": "c1", "name": "LM358", "mpn": "LM358DR", "manufacturer": "Texas Instruments", "workflow_stage": "released"}
LM358_DRAFT = {"id": "c2", "name": "LM358 draft", "mpn": "LM358DR", "manufacturer": "TI", "workflow_stage": "open"}
NE5532 = {"id": "c3", "name": "NE5532", "mpn": "NE5532P", "manufacturer": "Texas Instruments", "workflow_stage": "released"}


def hit(part_id: str, mpn: str, maker: str = "Texas Instruments", rank: int = 1) -> dict:
    return {"part_id": part_id, "mpn": mpn, "manufacturer": maker, "rank": rank}


def info(*ids: str, tracked: bool = False) -> dict:
    return {part_id: {"part_id": part_id, "status": "ok", "stock": 100, "lifecycle": "active", "tracked": tracked} for part_id in ids}


def merge(library, supply, *, supply_of=None, component_of=None, known=(), query="LM358"):
    return part_search.merge(
        query, library, supply, supply_of or (lambda maker, mpn: None), component_of or (lambda maker, mpn: None),
        info(*known),
    )


class MergeTests(unittest.TestCase):
    def test_a_component_and_its_supply_part_are_one_row_with_both_badges(self) -> None:
        rows = merge([LM358], [hit("p1", "LM358DR")], supply_of=lambda maker, mpn: "p1", known=["p1"])
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0]["library"]["component_id"], rows[0]["supply"]["part_id"], rows[0]["label"]), ("c1", "p1", "LM358DR"))

    def test_a_supply_part_a_component_has_is_merged_even_when_the_library_search_missed_it(self) -> None:
        rows = merge([LM358], [hit("p1", "LM358DR")], component_of=lambda maker, mpn: "c1", known=["p1"])
        self.assertEqual(len(rows), 1, "found by the supply search and claimed by a component")
        self.assertEqual(rows[0]["supply"]["part_id"], "p1")

    def test_a_supply_part_no_component_has_is_a_supply_only_row(self) -> None:
        rows = merge([], [hit("p9", "LM358X")], known=["p9"])
        self.assertEqual([(row["key"], row["library"]) for row in rows], [("part:p9", None)])

    def test_a_component_with_no_supply_part_is_a_library_only_row(self) -> None:
        rows = merge([LM358], [])
        self.assertEqual([(row["key"], row["supply"]) for row in rows], [("component:c1", None)])

    def test_two_components_with_one_number_stay_two_rows_and_the_part_goes_to_the_first(self) -> None:
        rows = merge([LM358, LM358_DRAFT], [hit("p1", "LM358DR")], supply_of=lambda maker, mpn: "p1", known=["p1"])
        self.assertEqual(sorted(row["key"] for row in rows), ["component:c1", "component:c2"])
        self.assertEqual([row["key"] for row in rows if row["supply"]], ["component:c1"], "the supply badge is on one row, not both")

    def test_an_exact_number_comes_first_then_released_then_tracked(self) -> None:
        rows = merge(
            [LM358_DRAFT, LM358, NE5532], [hit("p3", "LM358-LONG", rank=1), hit("p4", "LM358DR", rank=0)],
            supply_of=lambda maker, mpn: {"LM358DR": "p4"}.get(mpn), known=["p3", "p4"], query="LM358DR",
        )
        self.assertEqual(rows[0]["supply"]["part_id"], "p4", "the exact number leads")
        self.assertEqual(rows[0]["library"]["stage"], "released", "released before draft")

    def test_rank_is_exact_then_prefix_then_the_rest(self) -> None:
        self.assertEqual([part_search._rank("lm358-dr", "LM358DR"), part_search._rank("LM35", "LM358DR"), part_search._rank("DR", "LM358DR")], [0, 1, 2])


if __name__ == "__main__":
    unittest.main()
