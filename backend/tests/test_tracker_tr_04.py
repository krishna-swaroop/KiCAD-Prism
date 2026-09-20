"""TR-04: ID-addressed reply edit and delete endpoints (F1, F8).

Routes are exercised the same way as TR-03: lookup patched, production
store pointed at a disposable schema so permission → store → history is
real. A skipped PostgreSQL class is an unmet gate, not a pass.
"""

from __future__ import annotations

import asyncio
import json
import os
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
from app.services import comments_revisions  # noqa: E402
from tests.test_tracker_tr_01 import (  # noqa: E402
    POSTGRES_URL,
    SHARED_APPLICATION_DATABASE,
    DisposableSchemaStore,
    psycopg,
)


def session(role="viewer", *, user_id="u_1", name="Priya"):
    return AuthenticatedUser(email=f"{user_id}@example.com", name=name, role=role, session_id="sid", user_id=user_id)


def run(coro):
    return asyncio.run(coro)


def body(response: JSONResponse) -> dict:
    return json.loads(response.body)


class RequestModelTests(unittest.TestCase):
    def test_author_is_not_a_reply_edit_field(self) -> None:  # F1.request_author_ignored
        request = comments_api.UpdateReplyRequest(content="edited", author="Mallory")
        self.assertFalse(hasattr(request, "author"))
        self.assertEqual(request.content, "edited")

    def test_empty_content_is_rejected_before_any_lookup(self) -> None:
        with patch.object(comments_api, "get_project_for_role_or_404") as lookup:
            with self.assertRaises(HTTPException) as ctx:
                run(comments_api.update_reply(
                    "p", "c", "r", comments_api.UpdateReplyRequest(content="  "), session("designer"),
                ))
        self.assertEqual(ctx.exception.status_code, 400)
        lookup.assert_not_called()


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for comments route tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class ReplyMutationRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"comments_tr04_{uuid.uuid4().hex[:12]}"
        self.store = DisposableSchemaStore(self.schema)
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.project = SimpleNamespace(id="prj_test", path=self.tempdir.name)
        self.other = SimpleNamespace(id="prj_other", path=self.tempdir.name)

        def lookup(project_id, role):
            return self.other if project_id == "prj_other" else self.project

        patches = [
            patch.object(comments_api, "comments_store", self.store),
            patch.object(comments_api, "get_project_for_role_or_404", side_effect=lookup),
        ]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)
        self.addCleanup(self._drop_schema)

    def _drop_schema(self) -> None:
        with self.store._connect() as conn:
            conn.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
            conn.commit()

    def _create_root(self, user, **overrides):
        payload = {"context": "PCB", "location": {"x": 1, "y": 2, "layer": "F.Cu"}, "content": "root"}
        payload.update(overrides)
        return run(comments_api.create_comment("prj_test", comments_api.CreateCommentRequest(**payload), user))

    def _reply(self, comment_id, user, content="reply"):
        return run(comments_api.add_reply("prj_test", comment_id, comments_api.CreateReplyRequest(content=content), user))

    def test_create_edit_delete_read_restart_keeps_one_reply_identity(self) -> None:
        owner = session("viewer", user_id="u_v", name="Mira")
        root = self._create_root(session("designer", user_id="u_d"))
        created = self._reply(root["id"], owner, "first")
        reply_id = created["reply"]["id"]
        self.assertTrue(reply_id.startswith("r_"))
        self.assertEqual(created["reply"]["revision"], 1)

        edited = run(comments_api.update_reply(
            "prj_test", root["id"], reply_id,
            comments_api.UpdateReplyRequest(content="first (edited)", expectedRevision=1, author="Mallory"),
            owner,
        ))
        [live] = edited["replies"]
        self.assertEqual((live["id"], live["content"], live["revision"], live["authorUserId"]), (reply_id, "first (edited)", 2, "u_v"))
        self.assertTrue(live["permissions"]["canEdit"])
        self.assertEqual(edited["revision"], 1, "reply edits do not bump the root")

        restarted = DisposableSchemaStore(self.schema)
        with patch.object(comments_api, "comments_store", restarted):
            listing = run(comments_api.get_comments("prj_test", owner))
        [again] = listing["comments"][0]["replies"]
        self.assertEqual((again["id"], again["content"], again["revision"]), (reply_id, "first (edited)", 2))

        after_delete = run(comments_api.delete_reply("prj_test", root["id"], reply_id, 2, owner))
        self.assertEqual(after_delete["replies"], [])
        self.assertEqual(after_delete["id"], root["id"])

        listing = run(comments_api.get_comments("prj_test", owner))
        self.assertEqual(listing["comments"][0]["replies"], [])
        history = self.store.get_history("prj_test", comments_revisions.REPLY, reply_id)
        self.assertEqual([(h["revision"], h["changeKind"], h["editorUserId"]) for h in history], [
            (1, "create", "u_v"), (2, "edit", "u_v"), (3, "delete", "u_v"),
        ])

    def test_stale_revision_conflicts_without_writing(self) -> None:  # F2.stale_revision_conflict analogue
        owner = session("designer", user_id="u_priya")
        root = self._create_root(owner)
        created = self._reply(root["id"], owner, "v1")
        reply_id = created["reply"]["id"]
        run(comments_api.update_reply(
            "prj_test", root["id"], reply_id, comments_api.UpdateReplyRequest(content="v2", expectedRevision=1), owner,
        ))
        stale = run(comments_api.update_reply(
            "prj_test", root["id"], reply_id, comments_api.UpdateReplyRequest(content="v3-stale", expectedRevision=1), owner,
        ))
        self.assertIsInstance(stale, JSONResponse)
        self.assertEqual((stale.status_code, body(stale)["code"], body(stale)["currentRevision"]), (409, "revision_conflict", 2))
        current = self.store.get_reply("prj_test", root["id"], reply_id)
        self.assertEqual((current["content"], current["revision"]), ("v2", 2))

    def test_other_author_rejected_admin_can_edit_same_display_name(self) -> None:  # F1.duplicate_display_names
        alex1 = session("designer", user_id="u_1", name="Alex Chen")
        alex2 = session("designer", user_id="u_2", name="Alex Chen")
        root = self._create_root(session("designer", user_id="u_root"))
        created = self._reply(root["id"], alex1)
        refused = run(comments_api.update_reply(
            "prj_test", root["id"], created["reply"]["id"], comments_api.UpdateReplyRequest(content="hijack"), alex2,
        ))
        self.assertEqual((refused.status_code, body(refused)["code"]), (403, "not_owner"))
        deleted = run(comments_api.delete_reply("prj_test", root["id"], created["reply"]["id"], 1, alex2))
        self.assertEqual((deleted.status_code, body(deleted)["code"]), (403, "not_owner"))

        admin = session("admin", user_id="u_a", name="Admin")
        updated = run(comments_api.update_reply(
            "prj_test", root["id"], created["reply"]["id"], comments_api.UpdateReplyRequest(content="admin"), admin,
        ))
        self.assertEqual(updated["replies"][0]["content"], "admin")
        history = self.store.get_history("prj_test", comments_revisions.REPLY, created["reply"]["id"])
        self.assertEqual([(h["revision"], h["editorUserId"]) for h in history], [(1, "u_1"), (2, "u_a")])

    def test_cross_project_and_wrong_parent_are_not_found(self) -> None:
        owner = session("designer", user_id="u_priya")
        root = self._create_root(owner)
        created = self._reply(root["id"], owner)
        reply_id = created["reply"]["id"]

        with self.assertRaises(HTTPException) as other_project:
            run(comments_api.update_reply(
                "prj_other", root["id"], reply_id, comments_api.UpdateReplyRequest(content="x"), owner,
            ))
        self.assertEqual(other_project.exception.status_code, 404)

        with self.assertRaises(HTTPException) as wrong_parent:
            run(comments_api.delete_reply("prj_test", "c_missing", reply_id, 1, owner))
        self.assertEqual(wrong_parent.exception.status_code, 404)
        self.assertEqual(self.store.get_reply("prj_test", root["id"], reply_id)["content"], "reply")

    def test_remote_origin_reply_is_read_only_even_for_admin(self) -> None:  # D5
        designer = session("designer", user_id="u_d")
        root = self._create_root(designer)
        self.store.initialize()
        _, remote = self.store.add_reply(
            "prj_test", self.project.path, root["id"], "from github", "arjun-gh",
            author_user_id="github:arjun", author_kind="remote", origin=comments_revisions.ORIGIN_REMOTE,
        )
        admin = session("admin", user_id="u_a")
        refused = run(comments_api.update_reply(
            "prj_test", root["id"], remote["id"], comments_api.UpdateReplyRequest(content="no"), admin,
        ))
        self.assertEqual((refused.status_code, body(refused)["code"]), (403, "remote_object_read_only"))
        deleted = run(comments_api.delete_reply("prj_test", root["id"], remote["id"], 1, admin))
        self.assertEqual((deleted.status_code, body(deleted)["code"]), (403, "remote_object_read_only"))
        self.assertEqual(self.store.get_reply("prj_test", root["id"], remote["id"])["content"], "from github")

    def test_provider_token_cannot_edit_or_delete_replies(self) -> None:  # F1.kicad_provider_read_only
        owner = session("designer", user_id="u_d")
        root = self._create_root(owner)
        created = self._reply(root["id"], owner)
        plugin = AuthenticatedUser(email="p@x", name="Plugin", role="designer", auth_type="kicad_provider")
        edited = run(comments_api.update_reply(
            "prj_test", root["id"], created["reply"]["id"], comments_api.UpdateReplyRequest(content="x"), plugin,
        ))
        self.assertEqual((edited.status_code, body(edited)["code"]), (403, "provider_token_read_only"))
        deleted = run(comments_api.delete_reply("prj_test", root["id"], created["reply"]["id"], 1, plugin))
        self.assertEqual((deleted.status_code, body(deleted)["code"]), (403, "provider_token_read_only"))

    def test_legacy_reply_is_admin_only(self) -> None:  # F1.legacy_admin_only
        designer = session("designer", user_id="u_d")
        root = self._create_root(designer)
        self.store.initialize()
        _, legacy = self.store.add_reply(
            "prj_test", self.project.path, root["id"], "old reply", "swaroop",
        )
        refused = run(comments_api.update_reply(
            "prj_test", root["id"], legacy["id"], comments_api.UpdateReplyRequest(content="x"), designer,
        ))
        self.assertEqual(body(refused)["code"], "legacy_admin_only")
        admin = session("admin", user_id="u_a")
        updated = run(comments_api.update_reply(
            "prj_test", root["id"], legacy["id"], comments_api.UpdateReplyRequest(content="admin"), admin,
        ))
        self.assertEqual(updated["replies"][-1]["content"], "admin")
        self.assertEqual(updated["replies"][-1]["authorKind"], "legacy")

    def test_delete_is_a_tombstone_that_survives_export_and_root_lifecycle(self) -> None:  # F8.local_reply_delete analogue
        owner = session("designer", user_id="u_priya")
        other = session("designer", user_id="u_other")
        root = self._create_root(owner)
        created = self._reply(root["id"], other, "keep me")
        reply_id = created["reply"]["id"]

        after_delete = run(comments_api.delete_reply("prj_test", root["id"], reply_id, 1, other))
        self.assertEqual(after_delete["replies"], [])
        with self.assertRaises(HTTPException) as second:
            run(comments_api.delete_reply("prj_test", root["id"], reply_id, None, other))
        self.assertEqual(second.exception.status_code, 404)

        exported_path = self.store.export_comments_json("prj_test", self.project.path)
        exported = json.loads(Path(exported_path).read_text())
        self.assertEqual(exported["meta"]["version"], "1.1")
        self.assertEqual(exported["comments"][0]["replies"], [])

        with self.store._connect() as conn:
            row = conn.execute(
                "SELECT deleted_at IS NOT NULL AS gone, deleted_by FROM comment_replies WHERE id = %s",
                (reply_id,),
            ).fetchone()
        self.assertTrue(row["gone"])
        self.assertEqual(row["deleted_by"], "u_other")
        self.assertEqual(
            [h["changeKind"] for h in self.store.get_history("prj_test", comments_revisions.REPLY, reply_id)],
            ["create", "delete"],
        )

        run(comments_api.delete_comment("prj_test", root["id"], 1, owner))
        with self.store._connect() as conn:
            replies = conn.execute(
                "SELECT id, deleted_at IS NOT NULL AS gone FROM comment_replies WHERE id = %s",
                (reply_id,),
            ).fetchone()
            history = conn.execute(
                "SELECT COUNT(*) AS n FROM comment_revisions WHERE target_kind = 'reply' AND target_id = %s",
                (reply_id,),
            ).fetchone()
        self.assertTrue(replies["gone"])
        self.assertEqual(history["n"], 2)


if __name__ == "__main__":
    unittest.main()
