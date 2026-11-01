"""A project's parts page: the chips count over every line and agree with the list they filter (B7), the reference search, the
project's own sort columns, and the lines no part matches. ``parts_view.list_parts`` is stubbed: its SQL is tested on its own."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply import project_parts  # noqa: E402


def line(key: str, part_id: str | None, **extra) -> dict:
    return {
        "key": key, "part_id": part_id, "quantity": 1, "need": 100, "stock": 1000, "state": "tracked", "status": "ok", "short": False,
        "lifecycle": "active", "alerts": 0, "unit_price": "0.10", "line_cost": "10", "notes": 0, "references": key, **extra,
    }


class ProjectPartsTests(unittest.TestCase):
    def page(self, lines: list[dict], **kwargs) -> tuple[dict, dict]:
        asked: dict = {}

        def listed(conn, **query):
            asked.update(query)
            wanted = query["part_ids"]
            ids = [part for part in dict.fromkeys(item["part_id"] for item in lines if item["part_id"]) if wanted is None or part in wanted]
            if query["order_ids"] is not None:
                ids = sorted(ids, key=lambda part: query["order_ids"].index(part) if part in query["order_ids"] else len(ids))
            return {"items": [{"id": part} for part in ids], "total": len(ids), "offset": query["offset"]}

        with mock.patch.object(project_parts.project_supply, "project_lines", return_value=lines), \
                mock.patch.object(project_parts.parts_view, "list_parts", side_effect=listed):
            return project_parts.page(None, "prj", **kwargs), asked

    def test_a_chip_counts_every_part_of_the_project_not_only_a_first_page(self) -> None:
        lines = [line(f"R{n}", f"p{n}", stock=0 if n % 3 == 0 else 1000) for n in range(1, 301)]
        result, asked = self.page(lines, chip="out", limit=50)
        self.assertEqual({chip["key"]: chip["count"] for chip in result["chips"]}["out"], 100)
        self.assertEqual(len(asked["part_ids"]), 100, "the list is asked for exactly the parts the chip counts")
        self.assertEqual(result["total"], 100)

    def test_a_part_on_two_lines_is_one_row_with_both_lines(self) -> None:
        lines = [line("C1", "p1", quantity=2, need=200, references="C1 C2"), line("C9", "p1", quantity=1, need=100, line_cost=None, references="C9")]
        result, _ = self.page(lines)
        merged = result["items"][0]["line"]
        self.assertEqual((merged["quantity"], merged["need"], merged["references"], merged["line_cost"]), (3, 300, "C1 C2 C9", "10"))

    def test_limiting_is_judged_on_what_both_lines_need(self) -> None:
        lines = [line("A", "p1", stock=150, need=100), line("B", "p1", stock=150, need=100), line("C", "p2", stock=120, need=100)]
        self.assertEqual(project_parts.limiting_keys(lines), {"A", "B"})

    def test_a_reference_search_finds_its_line_and_not_a_longer_reference(self) -> None:
        lines = [line("C8", "p8", references="C8"), line("C80", "p80", references="C80"), line("U1", None, references="U1")]
        result, asked = self.page(lines, query="c8")
        self.assertEqual((asked["part_ids"], asked["query"]), (["p8"], ""))
        self.assertEqual(result["unmatched"], [])
        found, _ = self.page(lines, query="U1")
        self.assertEqual([item["key"] for item in found["unmatched"]], ["U1"])

    def test_a_project_column_sorts_over_the_whole_project(self) -> None:
        lines = [line("A", "p1", quantity=1), line("B", "p2", quantity=8), line("C", "p3", quantity=2)]
        result, asked = self.page(lines, sort="per_board:desc")
        self.assertEqual((asked["order_ids"], asked["sort"]), (["p2", "p3", "p1"], ""))
        self.assertEqual([item["id"] for item in result["items"]], ["p2", "p3", "p1"])

    def test_lines_no_part_matches_show_unless_something_else_narrows(self) -> None:
        lines = [line("A", "p1"), line("X1", None, state="unknown", status=None)]
        self.assertEqual(len(self.page(lines)[0]["unmatched"]), 1)
        self.assertEqual(len(self.page(lines, chip="unchecked")[0]["unmatched"]), 1)
        self.assertEqual(self.page(lines, chip="out")[0]["unmatched"], [])
        self.assertEqual(self.page(lines, offset=100)[0]["unmatched"], [], "only the first page carries them")

    def test_an_unknown_chip_is_refused(self) -> None:
        with self.assertRaises(ValueError):
            self.page([line("A", "p1")], chip="nope")


if __name__ == "__main__":
    unittest.main()
