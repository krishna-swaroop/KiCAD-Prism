"""TR-03: authenticated root-comment mutations (F1, F8).

Route functions are exercised directly with the project lookup patched and,
for the PostgreSQL cases, the production store pointed at a disposable
schema so the route → permission → store → history path is real.
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.responses import JSONResponse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import comments as comments_api  # noqa: E402
from app.core.security import AuthenticatedUser  # noqa: E402
from tests.test_tracker_tr_01 import (  # noqa: E402
    POSTGRES_URL,
    SHARED_APPLICATION_DATABASE,
    DisposableSchemaStore,
    psycopg,
)


def session(role="viewer", *, user_id="u_1", name="Priya"):
    return AuthenticatedUser(email=f"{user_id}@example.com", name=name, role=role, session_id="sid", user_id=user_id)


PROJECT = SimpleNamespace(id="prj_test", path="")


def run(coro):
    return asyncio.run(coro)


def body(response: JSONResponse) -> dict:
    return json.loads(response.body)


def seed_two_commit_board(root: str) -> tuple[str, str]:
    """TR-05 deviation: comparison SHAs must exist in the project repository."""
    path = Path(root)
    (path / "board.kicad_pro").write_text("{}\n")
    (path / "board.kicad_pcb").write_text("(kicad_pcb (version 20240101) A)\n")
    subprocess.run(["git", "init", "-b", "main"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "add", "."], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "A"], cwd=root, check=True, capture_output=True)
    sha_a = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    (path / "board.kicad_pcb").write_text("(kicad_pcb (version 20240101) B)\n")
    subprocess.run(["git", "add", "."], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "B"], cwd=root, check=True, capture_output=True)
    sha_b = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    return sha_a, sha_b


class RequestModelTests(unittest.TestCase):
    def test_author_is_not_a_request_field(self) -> None:  # F1.request_author_ignored
        request = comments_api.CreateCommentRequest(
            context="PCB", location={"x": 1, "y": 2}, content="hi", author="Mallory",
        )
        self.assertFalse(hasattr(request, "author"))
        reply = comments_api.CreateReplyRequest(content="x", author="Mallory")
        self.assertFalse(hasattr(reply, "author"))
        comparison = comments_api.CreateComparisonCommentRequest(
            baseCommit="a" * 40, compareCommit="b" * 40, domain="PCB", content="c", author="Mallory",
        )
        self.assertFalse(hasattr(comparison, "author"))

    def test_patch_without_fields_is_rejected_before_any_lookup(self) -> None:
        with patch.object(comments_api, "get_project_for_role_or_404") as lookup:
            with self.assertRaises(HTTPException) as ctx:
                run(comments_api.update_comment("p", "c", comments_api.UpdateCommentRequest(), session("designer")))
        self.assertEqual(ctx.exception.status_code, 400)
        lookup.assert_not_called()

    def test_patch_rejects_location_and_revision_fields(self) -> None:  # F2.anchor_immutable_on_patch
        from pydantic import ValidationError

        with self.assertRaises(ValidationError) as loc:
            comments_api.UpdateCommentRequest(content="x", location={"x": 1, "y": 2})
        self.assertTrue(any("immutable" in str(err).lower() or "location" in str(err) for err in loc.exception.errors()))
        with self.assertRaises(ValidationError) as rev:
            comments_api.UpdateCommentRequest(revision={"commit": "a" * 40})
        self.assertTrue(any("immutable" in str(err).lower() or "revision" in str(err) for err in rev.exception.errors()))

    def test_permission_and_conflict_bodies_are_machine_readable(self) -> None:
        from app.services.comment_permissions import CommentPermissionError
        from app.services.comments_revisions import RevisionConflict

        refused = comments_api._permission_response(CommentPermissionError("publication_required", "no", required_role="designer"))
        self.assertEqual((refused.status_code, body(refused)), (403, {"detail": "no", "code": "publication_required", "requiredRole": "designer"}))
        conflict = comments_api._conflict_response(RevisionConflict("root", "c_1", 3))
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(body(conflict)["code"], "revision_conflict")
        self.assertEqual(body(conflict)["currentRevision"], 3)


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for comments route tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class RootMutationRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"comments_tr03_{uuid.uuid4().hex[:12]}"
        self.store = DisposableSchemaStore(self.schema)
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.project = SimpleNamespace(id="prj_test", path=self.tempdir.name)
        patches = [
            patch.object(comments_api, "comments_store", self.store),
            patch.object(comments_api, "get_project_for_role_or_404", return_value=self.project),
        ]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)
        self.addCleanup(self._drop_schema)

    def _drop_schema(self) -> None:
        with self.store._connect() as conn:
            conn.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
            conn.commit()

    def _create(self, user, **overrides):
        payload = {"context": "PCB", "location": {"x": 1, "y": 2, "layer": "F.Cu"}, "content": "root", "severity": "major"}
        payload.update(overrides)
        return run(comments_api.create_comment("prj_test", comments_api.CreateCommentRequest(**payload), user))

    def test_viewer_creates_canvas_and_comparison_roots_under_session_identity(self) -> None:  # F1.viewer_creates_root
        viewer = session("viewer", user_id="u_v", name="Mira")
        created = self._create(viewer, author="Mallory")
        self.assertEqual((created["author"], created["authorUserId"], created["authorKind"]), ("Mira", "u_v", "user"))
        self.assertEqual(created["permissions"], {"canReply": True, "canEdit": True, "canDelete": True, "canResolve": False, "canPublish": False})

        sha_a, sha_b = seed_two_commit_board(self.project.path)
        self.project.project_file = "board.kicad_pro"
        comparison = run(comments_api.create_comparison_comment(
            "prj_test",
            comments_api.CreateComparisonCommentRequest(baseCommit=sha_a, compareCommit=sha_b, domain="PCB", content="cmp", author="Mallory"),
            viewer,
        ))
        self.assertEqual((comparison["author"], comparison["authorUserId"], comparison["scope"]), ("Mira", "u_v", "comparison"))
        self.assertEqual(comparison["anchor"]["baseCommit"], sha_a)
        self.assertEqual(comparison["anchor"]["compareCommit"], sha_b)

    def test_provider_token_cannot_create_even_as_designer(self) -> None:  # F1.kicad_provider_read_only
        plugin = AuthenticatedUser(email="p@x", name="Plugin", role="designer", auth_type="kicad_provider")
        response = self._create(plugin)
        self.assertIsInstance(response, JSONResponse)
        self.assertEqual((response.status_code, body(response)["code"]), (403, "provider_token_read_only"))
        self.assertEqual(self.store.get_comments_file("prj_test", self.project.path)["comments"], [])

    def test_owner_edits_and_stale_revision_conflicts_without_writing(self) -> None:  # F2.stale_revision_conflict
        priya = session("designer", user_id="u_priya", name="Priya")
        created = self._create(priya)
        updated = run(comments_api.update_comment(
            "prj_test", created["id"],
            comments_api.UpdateCommentRequest(content="edited", severity="critical", commentClass="task", expectedRevision=1),
            priya,
        ))
        self.assertEqual((updated["revision"], updated["content"], updated["severity"], updated["commentClass"]), (2, "edited", "critical", "task"))

        stale = run(comments_api.update_comment(
            "prj_test", created["id"], comments_api.UpdateCommentRequest(content="stale", expectedRevision=1), priya,
        ))
        self.assertIsInstance(stale, JSONResponse)
        self.assertEqual((stale.status_code, body(stale)["code"], body(stale)["currentRevision"]), (409, "revision_conflict", 2))
        current = self.store.get_comment("prj_test", self.project.path, created["id"])
        self.assertEqual((current["content"], current["revision"]), ("edited", 2))

    def test_non_owner_cannot_edit_but_admin_can(self) -> None:  # F1.duplicate_display_names
        alex1 = session("designer", user_id="u_1", name="Alex Chen")
        alex2 = session("designer", user_id="u_2", name="Alex Chen")
        created = self._create(alex1)
        refused = run(comments_api.update_comment("prj_test", created["id"], comments_api.UpdateCommentRequest(content="x"), alex2))
        self.assertEqual((refused.status_code, body(refused)["code"]), (403, "not_owner"))
        admin = session("admin", user_id="u_a", name="Admin")
        updated = run(comments_api.update_comment("prj_test", created["id"], comments_api.UpdateCommentRequest(content="admin edit"), admin))
        self.assertEqual(updated["content"], "admin edit")
        history = self.store.get_history("prj_test", "root", created["id"])
        self.assertEqual([(h["revision"], h["editorUserId"]) for h in history], [(1, "u_1"), (2, "u_a")])

    def test_status_needs_designer_and_edit_plus_status_append_two_revisions(self) -> None:  # F1.qa_ranks_as_viewer
        viewer = session("viewer", user_id="u_v")
        created = self._create(viewer)
        refused = run(comments_api.update_comment("prj_test", created["id"], comments_api.UpdateCommentRequest(status="RESOLVED"), viewer))
        self.assertEqual((refused.status_code, body(refused)["code"], body(refused)["requiredRole"]), (403, "status_role_required", "designer"))

        designer = session("designer", user_id="u_d")
        resolved = run(comments_api.update_comment(
            "prj_test", created["id"], comments_api.UpdateCommentRequest(status="resolved", expectedRevision=1), designer,
        ))
        self.assertEqual((resolved["status"], resolved["revision"]), ("RESOLVED", 2))

        admin = session("admin", user_id="u_a")
        both = run(comments_api.update_comment(
            "prj_test", created["id"], comments_api.UpdateCommentRequest(content="and reopened", status="OPEN", expectedRevision=2), admin,
        ))
        self.assertEqual((both["status"], both["content"], both["revision"]), ("OPEN", "and reopened", 4))

    def test_delete_is_owner_or_admin_and_keeps_history(self) -> None:  # F8.local_root_deleted analogue
        priya = session("designer", user_id="u_priya")
        other = session("designer", user_id="u_other")
        created = self._create(priya)
        run(comments_api.add_reply("prj_test", created["id"], comments_api.CreateReplyRequest(content="r"), other))

        refused = run(comments_api.delete_comment("prj_test", created["id"], None, other))
        self.assertEqual((refused.status_code, body(refused)["code"]), (403, "not_owner"))

        self.assertEqual(run(comments_api.delete_comment("prj_test", created["id"], 1, priya)), {"deleted": created["id"]})
        with self.assertRaises(HTTPException) as ctx:
            run(comments_api.delete_comment("prj_test", created["id"], None, priya))
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(self.store.get_comments_file("prj_test", self.project.path)["comments"], [])
        with self.store._connect() as conn:
            rows = conn.execute("SELECT COUNT(*) AS n FROM comment_replies WHERE deleted_at IS NOT NULL").fetchone()
        self.assertEqual(rows["n"], 1)
        self.assertEqual([h["changeKind"] for h in self.store.get_history("prj_test", "root", created["id"])], ["create", "delete"])

    def test_reply_is_attributed_to_the_session_and_carries_an_id(self) -> None:
        viewer = session("viewer", user_id="u_v", name="Mira")
        created = self._create(session("designer", user_id="u_d"))
        result = run(comments_api.add_reply("prj_test", created["id"], comments_api.CreateReplyRequest(content="reply", author="Mallory"), viewer))
        self.assertEqual((result["reply"]["author"], result["reply"]["authorUserId"]), ("Mira", "u_v"))
        self.assertTrue(result["reply"]["id"].startswith("r_"))
        self.assertTrue(result["reply"]["permissions"]["canEdit"])
        self.assertFalse(result["comment"]["permissions"]["canEdit"], "the viewer does not own the root")

    def test_legacy_rows_are_admin_only_and_listings_carry_permissions(self) -> None:  # F1.legacy_admin_only
        self.store.initialize()
        legacy = self.store.create_comment("prj_test", self.project.path, "PCB", {"x": 0, "y": 0}, "old", author="swaroop")
        designer = session("designer", user_id="u_d")
        refused = run(comments_api.update_comment("prj_test", legacy["id"], comments_api.UpdateCommentRequest(content="x"), designer))
        self.assertEqual(body(refused)["code"], "legacy_admin_only")
        listing = run(comments_api.get_comments("prj_test", designer))
        [row] = listing["comments"]
        self.assertEqual(row["permissions"], {"canReply": True, "canEdit": False, "canDelete": False, "canResolve": True, "canPublish": True})
        plugin = AuthenticatedUser(email="p@x", name="Plugin", role="designer", auth_type="kicad_provider")
        listing = run(comments_api.get_comments("prj_test", plugin))
        self.assertNotIn("permissions", listing["comments"][0], "read-only identities get no capability block")


if __name__ == "__main__":
    unittest.main()
