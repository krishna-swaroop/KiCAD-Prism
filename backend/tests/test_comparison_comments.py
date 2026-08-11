import unittest

from fastapi import HTTPException

from app.api import comments as comments_api
from app.services.comments_store_service import _row_to_comment_dict


class ComparisonCommentTests(unittest.TestCase):
    def test_comparison_scope_is_projected_without_changing_canvas_shape(self) -> None:
        row = {
            "id": "c_1",
            "author": "reviewer",
            "timestamp": "2026-07-18T00:00:00Z",
            "status": "OPEN",
            "context": "PCB",
            "location_x": 0,
            "location_y": 0,
            "location_layer": "",
            "location_page": "board.kicad_pcb",
            "content": "Check this reroute",
            "area_x": None,
            "area_y": None,
            "area_w": None,
            "area_h": None,
            "element_id": "grp:route",
            "element_ref": "VCC",
            "element_type": "group",
            "comment_class": "general",
            "severity": "major",
            "mentions": [],
            "metadata": {},
            "scope": "comparison",
            "base_commit": "a" * 40,
            "compare_commit": "b" * 40,
            "comparison_domain": "PCB",
            "file_path": "board.kicad_pcb",
            "semantic_item_id": "grp:route",
            "anchor_kind": "group",
            "forge_provider": None,
            "forge_issue_id": None,
            "forge_issue_url": None,
            "forge_sync_state": None,
        }
        comment = _row_to_comment_dict(row, [])
        self.assertEqual(comment["scope"], "comparison")
        self.assertEqual(comment["semanticItemId"], "grp:route")
        self.assertEqual(comment["baseCommit"], "a" * 40)

    def test_comparison_contract_requires_full_shas_and_known_anchors(self) -> None:
        self.assertEqual(comments_api._normalize_commit("A" * 40, "base"), "a" * 40)
        self.assertEqual(comments_api._normalize_anchor_kind("group"), "group")
        with self.assertRaises(HTTPException):
            comments_api._normalize_commit("abc1234", "base")
        with self.assertRaises(HTTPException):
            comments_api._normalize_anchor_kind("canvas")


if __name__ == "__main__":
    unittest.main()
