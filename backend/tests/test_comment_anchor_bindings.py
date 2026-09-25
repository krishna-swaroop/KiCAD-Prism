"""Ancestry rules for commit-effective comment reattachments."""

import unittest

from app.services.comment_anchor_bindings import select_binding


class AnchorBindingSelectionTests(unittest.TestCase):
    def setUp(self) -> None:
        # a branches to b/c, then merges at d.
        self.ancestors = {
            "a": {"a"}, "b": {"a", "b"}, "c": {"a", "c"},
            "d": {"a", "b", "c", "d"},
        }
        self.is_ancestor = lambda older, newer: older in self.ancestors[newer]

    def test_unique_ancestral_object_binding_follows_new_commit(self) -> None:
        bindings = [
            {"commit": "a", "elementId": "old", "sequence": 0},
            {"commit": "b", "elementId": "new", "sequence": 1},
        ]
        self.assertEqual(select_binding(bindings, "b", self.is_ancestor)["binding"]["elementId"], "new")
        self.assertEqual(select_binding(bindings, "c", self.is_ancestor)["binding"]["elementId"], "old")

    def test_independent_branch_attachments_are_ambiguous_at_merge(self) -> None:
        bindings = [
            {"commit": "b", "elementId": "left", "sequence": 1},
            {"commit": "c", "elementId": "right", "sequence": 2},
        ]
        self.assertEqual(select_binding(bindings, "d", self.is_ancestor), {
            "state": "unresolved", "reason": "ambiguous_merge",
        })

    def test_freehand_area_does_not_silently_follow_new_revision(self) -> None:
        binding = {"commit": "a", "elementId": None, "sequence": 0}
        self.assertEqual(select_binding([binding], "a", self.is_ancestor)["state"], "candidate")
        self.assertEqual(select_binding([binding], "b", self.is_ancestor)["reason"], "coordinate_review")


if __name__ == "__main__":
    unittest.main()
