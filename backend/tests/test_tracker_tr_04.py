"""TR-04: reply edit and delete by stable id (F1, F8).

Route functions are exercised directly with the project lookup patched and
the production store pointed at a disposable schema, so the route →
permission → store → history path is the real one. A second store instance
stands in for a process restart.
"""

from __future__ import annotations

import asyncio
import json
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


def run(coro):
    return asyncio.run(coro)


def body(response: JSONResponse) -> dict:
    return json.loads(response.body)


class RequestModelTests(unittest.TestCase):
    def test_reply_edit_request_has_no_author_and_needs_content(self) -> None:  # F1.request_author_ignored
        request = comments_api.UpdateReplyRequest(content="x", author="Mallory", expectedRevision=2)
        self.assertFalse(hasattr(request, "author"))
        self.assertEqual(request.expectedRevision, 2)
        with self.assertRaises(Exception):
            comments_api.UpdateReplyRequest()

    def test_blank_reply_edit_is_rejected_before_any_lookup(self) -> None:
        with patch.object(comments_api, "get_project_for_role_or_404") as lookup:
            with self.assertRaises(HTTPException) as ctx:
                run(comments_api.update_reply("p", "c", "r", comments_api.UpdateReplyRequest(content="   "), session()))
        self.assertEqual(ctx.exception.status_code, 400)
        lookup.assert_not_called()


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for reply route tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class ReplyMutationRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"comments_tr04_{uuid.uuid4().hex[:12]}"
        self.store = DisposableSchemaStore(self.schema)
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.project = SimpleNamespace(id="prj_test", path=self.tempdir.name)
        self.lookup = patch.object(comments_api, "get_project_for_role_or_404", return_value=self.project)
        for item in (patch.object(comments_api, "comments_store", self.store), self.lookup):
            item.start()
            self.addCleanup(item.stop)
        self.addCleanup(self._drop_schema)

    def _drop_schema(self) -> None:
        self._drop_named_schema(self.store)

    @staticmethod
    def _drop_named_schema(store) -> None:
        with store._connect() as conn:
            conn.execute(f'DROP SCHEMA IF EXISTS "{store.schema}" CASCADE')
            conn.commit()

    def _thread(self, root_user, reply_user, content="first"):
        payload = {"context": "PCB", "location": {"x": 1, "y": 2, "layer": "F.Cu"}, "content": "root"}
        root = run(comments_api.create_comment("prj_test", comments_api.CreateCommentRequest(**payload), root_user))
        result = run(comments_api.add_reply("prj_test", root["id"], comments_api.CreateReplyRequest(content=content), reply_user))
        return root, result["reply"]

    def _edit(self, user, comment_id, reply_id, content, expected=None):
        return run(comments_api.update_reply(
            "prj_test", comment_id, reply_id, comments_api.UpdateReplyRequest(content=content, expectedRevision=expected), user,
        ))

    def _delete(self, user, comment_id, reply_id, expected=None):
        return run(comments_api.delete_reply("prj_test", comment_id, reply_id, expected, user))

    def _reply_row(self, reply_id):
        with self.store._connect() as conn:
            return conn.execute(
                "SELECT id, revision, content, deleted_at, deleted_by FROM comment_replies WHERE id = %s", (reply_id,),
            ).fetchone()

    def test_edit_keeps_one_reply_identity_across_a_restart(self) -> None:  # F8.local_reply_edit_mirrors
        arjun = session("viewer", user_id="u_7f2a", name="Arjun Mehta")
        root, reply = self._thread(session("designer", user_id="u_priya"), arjun)
        self.assertEqual((reply["revision"], reply["origin"]), (1, "prism"))

        updated = self._edit(arjun, root["id"], reply["id"], "first (edited)", expected=1)
        [edited] = updated["replies"]
        self.assertEqual((edited["id"], edited["revision"], edited["content"]), (reply["id"], 2, "first (edited)"))
        self.assertEqual(edited["authorUserId"], "u_7f2a", "editing never changes the author")
        self.assertGreater(edited["updatedAt"], edited["timestamp"])
        self.assertTrue(edited["permissions"]["canEdit"])

        restarted = DisposableSchemaStore(self.schema)
        with patch.object(comments_api, "comments_store", restarted):
            listing = run(comments_api.get_comments("prj_test", arjun))
        [thread] = listing["comments"]
        self.assertEqual([(r["id"], r["revision"], r["content"]) for r in thread["replies"]], [(reply["id"], 2, "first (edited)")])
        self.assertEqual(
            [(h["revision"], h["changeKind"], h["editorUserId"]) for h in restarted.get_history("prj_test", "reply", reply["id"])],
            [(1, "create", "u_7f2a"), (2, "edit", "u_7f2a")],
        )

    def test_other_authors_are_refused_and_admins_are_not(self) -> None:  # F1.duplicate_display_names
        alex1 = session("designer", user_id="u_1", name="Alex Chen")
        alex2 = session("designer", user_id="u_2", name="Alex Chen")
        root, reply = self._thread(alex2, alex1)

        refused = self._edit(alex2, root["id"], reply["id"], "not mine")
        self.assertEqual((refused.status_code, body(refused)["code"]), (403, "not_owner"))
        refused = self._delete(alex2, root["id"], reply["id"])
        self.assertEqual((refused.status_code, body(refused)["code"]), (403, "not_owner"))
        self.assertEqual(self._reply_row(reply["id"])["content"], "first")

        admin = session("admin", user_id="u_a", name="Admin")
        updated = self._edit(admin, root["id"], reply["id"], "admin edit", expected=1)
        self.assertEqual(updated["replies"][0]["content"], "admin edit")
        history = self.store.get_history("prj_test", "reply", reply["id"])
        self.assertEqual([(h["revision"], h["editorUserId"]) for h in history], [(1, "u_1"), (2, "u_a")])

    def test_reply_ids_are_not_reachable_across_projects_or_threads(self) -> None:
        priya = session("designer", user_id="u_priya")
        root, reply = self._thread(priya, priya)
        other_root = run(comments_api.create_comment(
            "prj_test", comments_api.CreateCommentRequest(context="PCB", location={"x": 0, "y": 0}, content="other"), priya,
        ))

        with self.assertRaises(HTTPException) as ctx:
            self._edit(priya, other_root["id"], reply["id"], "wrong thread")
        self.assertEqual(ctx.exception.status_code, 404)

        elsewhere = SimpleNamespace(id="prj_other", path=self.tempdir.name)
        with patch.object(comments_api, "get_project_for_role_or_404", return_value=elsewhere):
            with self.assertRaises(HTTPException) as ctx:
                self._edit(priya, root["id"], reply["id"], "wrong project")
            self.assertEqual(ctx.exception.status_code, 404)
            with self.assertRaises(HTTPException) as ctx:
                self._delete(priya, root["id"], reply["id"])
            self.assertEqual(ctx.exception.status_code, 404)

        row = self._reply_row(reply["id"])
        self.assertEqual((row["content"], row["revision"], row["deleted_at"]), ("first", 1, None))

    def test_concurrent_edits_conflict_and_the_loser_writes_nothing(self) -> None:  # F2.stale_revision_conflict
        arjun = session("viewer", user_id="u_7f2a")
        root, reply = self._thread(session("designer", user_id="u_priya"), arjun)

        first = self._edit(arjun, root["id"], reply["id"], "tab one", expected=1)
        self.assertEqual(first["replies"][0]["revision"], 2)
        second = self._edit(arjun, root["id"], reply["id"], "tab two", expected=1)
        self.assertIsInstance(second, JSONResponse)
        self.assertEqual((second.status_code, body(second)["code"], body(second)["currentRevision"]), (409, "revision_conflict", 2))
        self.assertEqual(self._reply_row(reply["id"])["content"], "tab one")

        stale_delete = self._delete(arjun, root["id"], reply["id"], expected=1)
        self.assertEqual((stale_delete.status_code, body(stale_delete)["code"]), (409, "revision_conflict"))
        self.assertIsNone(self._reply_row(reply["id"])["deleted_at"])
        self.assertEqual(len(self.store.get_history("prj_test", "reply", reply["id"])), 2)

    def test_delete_tombstones_with_attribution_and_keeps_history(self) -> None:  # F8.local_reply_delete_mirrors
        arjun = session("viewer", user_id="u_7f2a", name="Arjun Mehta")
        root, reply = self._thread(session("designer", user_id="u_priya"), arjun)

        after = self._delete(arjun, root["id"], reply["id"], expected=1)
        self.assertEqual(after["id"], root["id"])
        self.assertEqual(after["replies"], [])
        row = self._reply_row(reply["id"])
        self.assertIsNotNone(row["deleted_at"])
        self.assertEqual((row["deleted_by"], row["revision"]), ("u_7f2a", 2))
        self.assertEqual(
            [h["changeKind"] for h in self.store.get_history("prj_test", "reply", reply["id"])], ["create", "delete"],
        )

        with self.assertRaises(HTTPException) as ctx:
            self._delete(arjun, root["id"], reply["id"])
        self.assertEqual(ctx.exception.status_code, 404, "a tombstone is not a live reply")
        with self.assertRaises(HTTPException):
            self._edit(arjun, root["id"], reply["id"], "ghost")

        exported = json.loads(Path(self.store.export_comments_json("prj_test", self.project.path)).read_text())
        self.assertEqual(exported["meta"]["version"], "1.1")
        self.assertEqual(exported["comments"][0]["replies"], [])

    def test_tombstones_survive_root_deletion_and_export_keeps_reply_ids(self) -> None:
        priya = session("designer", user_id="u_priya")
        arjun = session("viewer", user_id="u_7f2a")
        root, reply = self._thread(priya, arjun)
        self._edit(arjun, root["id"], reply["id"], "edited before the root goes", expected=1)
        kept_root, kept_reply = self._thread(priya, arjun, content="kept")

        run(comments_api.delete_comment("prj_test", root["id"], None, priya))
        row = self._reply_row(reply["id"])
        self.assertIsNotNone(row["deleted_at"])
        self.assertEqual((row["content"], row["revision"]), ("edited before the root goes", 3))
        self.assertEqual(
            [h["changeKind"] for h in self.store.get_history("prj_test", "reply", reply["id"])],
            ["create", "edit", "delete"],
        )

        exported_path = self.store.export_comments_json("prj_test", self.project.path)
        exported = json.loads(Path(exported_path).read_text())
        self.assertEqual([c["id"] for c in exported["comments"]], [kept_root["id"]])
        self.assertEqual([r["id"] for r in exported["comments"][0]["replies"]], [kept_reply["id"]])

        # A fresh deployment importing that 1.1 file keeps the same reply ids
        # (ids are global primary keys, so the import goes to its own schema).
        fresh_store = DisposableSchemaStore(f"{self.schema}_import")
        self.addCleanup(lambda: self._drop_named_schema(fresh_store))
        with tempfile.TemporaryDirectory() as fresh:
            target = Path(fresh) / ".comments"
            target.mkdir()
            (target / "comments.json").write_text(json.dumps(exported))
            imported = fresh_store.get_comments_file("prj_fresh", fresh)
        self.assertEqual([r["id"] for r in imported["comments"][0]["replies"]], [kept_reply["id"]])
        self.assertEqual(imported["comments"][0]["replies"][0]["authorKind"], "legacy", "a file is not an identity source")

    def test_remote_and_provider_identities_cannot_change_replies(self) -> None:  # F8.remote_reply_delete precondition
        priya = session("designer", user_id="u_priya")
        root, _ = self._thread(priya, priya)
        self.store.initialize()
        _, remote = self.store.add_reply(
            "prj_test", self.project.path, root["id"], "from GitHub", author="arjun-gh",
            author_user_id=None, author_kind="remote", origin="remote",
        )
        refused = self._edit(priya, root["id"], remote["id"], "rewrite")
        self.assertEqual((refused.status_code, body(refused)["code"]), (403, "remote_object_read_only"))
        listing = run(comments_api.get_comments("prj_test", priya))
        remote_view = next(r for r in listing["comments"][0]["replies"] if r["id"] == remote["id"])
        self.assertEqual((remote_view["origin"], remote_view["permissions"]["canEdit"]), ("remote", False))

        plugin = AuthenticatedUser(email="p@x", name="Plugin", role="designer", auth_type="kicad_provider")
        refused = self._edit(plugin, root["id"], remote["id"], "x")
        self.assertEqual((refused.status_code, body(refused)["code"]), (403, "provider_token_read_only"))


if __name__ == "__main__":
    unittest.main()
