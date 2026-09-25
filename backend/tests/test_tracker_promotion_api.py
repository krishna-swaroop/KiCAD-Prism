"""A comment can be promoted without weakening the Prism permission boundary."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.api import tracker_sync
from app.api.comments import _with_permissions
from app.core.security import AuthenticatedUser
from app.services.comment_permissions import ActorIdentity
from app.services.trackers.publication_policy import PublicationDenied


class TrackerPromotionApiTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.user = AuthenticatedUser(
            email="reviewer@example.test", name="Reviewer", role="designer",
            auth_type="session", scopes=[],
        )
        self.project = SimpleNamespace(id="project-1", path="/tmp/test-project")
        self.actor = ActorIdentity(
            actor_id="user-1", actor_kind="user", display_name="Reviewer",
            role="designer", auth_type="session",
        )

    async def test_promotion_uses_stable_actor_and_returns_the_queued_projection(self) -> None:
        projection = {"id": "comment-1", "tracker": {"syncState": "pending"}}
        with patch.object(tracker_sync, "get_project_for_role_or_404", return_value=self.project), \
             patch.object(tracker_sync, "_actor", return_value=self.actor), \
             patch.object(tracker_sync, "_promote_min_role", return_value="designer"), \
             patch.object(tracker_sync.comments_store, "promote_comment", return_value=projection) as promote:
            result = await tracker_sync.promote_comment_to_tracker("project-1", "comment-1", self.user)
        self.assertEqual(result, projection)
        args = promote.call_args.args
        self.assertEqual(args[:3], ("project-1", "/tmp/test-project", "comment-1"))
        self.assertEqual((args[3].user_id, args[3].role, args[3].kind), ("user-1", "designer", "user"))

    async def test_guest_cannot_queue_forge_writes(self) -> None:
        guest = ActorIdentity(
            actor_id="guest:local", actor_kind="guest", display_name="Guest",
            role="admin", auth_type="session",
        )
        with patch.object(tracker_sync, "get_project_for_role_or_404", return_value=self.project), \
             patch.object(tracker_sync, "_actor", return_value=guest), \
             patch.object(tracker_sync, "_promote_min_role", return_value="designer"), \
             patch.object(tracker_sync.comments_store, "promote_comment") as promote:
            response = await tracker_sync.promote_comment_to_tracker("project-1", "comment-1", self.user)
        self.assertEqual(response.status_code, 403)
        promote.assert_not_called()

    async def test_missing_thread_is_not_silently_acknowledged(self) -> None:
        with patch.object(tracker_sync, "get_project_for_role_or_404", return_value=self.project), \
             patch.object(tracker_sync, "_actor", return_value=self.actor), \
             patch.object(tracker_sync, "_promote_min_role", return_value="designer"), \
             patch.object(tracker_sync.comments_store, "promote_comment", return_value=None):
            with self.assertRaises(HTTPException) as raised:
                await tracker_sync.promote_comment_to_tracker("project-1", "missing", self.user)
        self.assertEqual(raised.exception.status_code, 404)

    async def test_unconfigured_destination_reports_actionable_denial(self) -> None:
        with patch.object(tracker_sync, "get_project_for_role_or_404", return_value=self.project), \
             patch.object(tracker_sync, "_actor", return_value=self.actor), \
             patch.object(tracker_sync, "_promote_min_role", return_value="designer"), \
             patch.object(tracker_sync.comments_store, "promote_comment", side_effect=PublicationDenied(
                 "publication_required", "Choose a tracker destination first",
             )):
            response = await tracker_sync.promote_comment_to_tracker("project-1", "comment-1", self.user)
        self.assertEqual(response.status_code, 403)
        self.assertIn(b"publication_required", response.body)

    async def test_publish_control_follows_anchor_destination_and_role(self) -> None:
        comment = {
            "id": "comment-1", "authorUserId": "user-1", "authorKind": "user",
            "anchor": {"state": "pinned"}, "replies": [],
            "tracker": {"linkState": None, "promoteMinRole": "designer"},
        }
        self.assertTrue(_with_permissions(dict(comment), self.actor)["permissions"]["canPublish"])
        unpinned = {**comment, "anchor": {"state": "unpinned"}}
        self.assertFalse(_with_permissions(unpinned, self.actor)["permissions"]["canPublish"])
        linked = {**comment, "tracker": {"linkState": "linked", "promoteMinRole": "designer"}}
        self.assertFalse(_with_permissions(linked, self.actor)["permissions"]["canPublish"])


if __name__ == "__main__":
    unittest.main()
