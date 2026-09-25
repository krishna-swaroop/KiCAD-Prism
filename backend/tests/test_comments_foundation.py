"""Focused provider-neutral comment persistence and authorization checks."""

from __future__ import annotations

import asyncio
import os
import tempfile
import unittest
import uuid
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.api import comments as comments_api
from app.core.security import AuthenticatedUser, require_comment_writer
from app.services.comment_permissions import (
    ActorIdentity,
    AuthoredObject,
    CommentAction,
    CommentPermissionError,
    authorize,
)
from app.services.comments_revisions import Editor, RevisionConflict
from app.services.comments_store_service import CommentsStoreService


TEST_DSN = os.environ.get("TEST_POSTGRES_URL", "")


class CommentPermissionsTests(unittest.TestCase):
    def test_owner_admin_and_status_authority(self) -> None:
        owner = ActorIdentity("user:one", "user", "Owner", "viewer", "session")
        other = ActorIdentity("user:two", "user", "Other", "viewer", "session")
        admin = ActorIdentity("admin", "user", "Admin", "admin", "session")
        target = AuthoredObject("user:one", "user")
        authorize(CommentAction.EDIT, owner, target=target)
        authorize(CommentAction.DELETE, admin, target=target)
        with self.assertRaises(CommentPermissionError):
            authorize(CommentAction.EDIT, other, target=target)
        with self.assertRaises(CommentPermissionError):
            authorize(CommentAction.RESOLVE, owner)

    def test_comment_writer_refuses_read_only_provider_and_unscoped_bearer(self) -> None:
        viewer = AuthenticatedUser(email="viewer@example.test", name="Viewer", role="viewer")
        self.assertIs(asyncio.run(require_comment_writer(viewer)), viewer)
        provider = viewer.model_copy(update={"auth_type": "kicad_provider"})
        with self.assertRaises(HTTPException):
            asyncio.run(require_comment_writer(provider))
        bearer = viewer.model_copy(update={"auth_type": "service_client", "client_id": "test"})
        with self.assertRaises(HTTPException):
            asyncio.run(require_comment_writer(bearer))
        scoped = bearer.model_copy(update={"scopes": ["api:write"]})
        self.assertIs(asyncio.run(require_comment_writer(scoped)), scoped)

    def test_api_ignores_claimed_author(self) -> None:
        user = AuthenticatedUser(email="real@example.test", name="Real Name", role="designer", user_id="real-id")
        request = comments_api.CreateCommentRequest(
            context="PCB", location=comments_api.CommentLocation(x=1, y=2),
            content="Review this", author="Impersonated",
        )
        project = SimpleNamespace(id="p1", path="/unused")
        with patch.object(comments_api, "get_project_for_role_or_404", return_value=project), \
             patch.object(comments_api.comments_store, "create_comment", return_value={
                 "id": "c1", "authorUserId": "real-id", "authorKind": "user", "replies": [],
             }) as create:
            asyncio.run(comments_api.create_comment("p1", request, user))
        self.assertEqual(create.call_args.kwargs["author"], "Real Name")
        self.assertEqual(create.call_args.kwargs["author_user_id"], "real-id")


@unittest.skipUnless(TEST_DSN, "TEST_POSTGRES_URL is required for disposable PostgreSQL tests")
class CommentStorePostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        import psycopg
        from psycopg.rows import dict_row

        self._psycopg = psycopg
        self._dict_row = dict_row
        self.schema = "test_comments_" + uuid.uuid4().hex[:16]
        self.store = CommentsStoreService()
        self.store.schema = self.schema

        @contextmanager
        def connect():
            with psycopg.connect(TEST_DSN, row_factory=dict_row) as conn:
                conn.execute(f'SET search_path TO "{self.schema}", public')
                yield conn

        self.store._connect = connect
        self.project_id = "p_" + uuid.uuid4().hex[:12]
        self.path = tempfile.TemporaryDirectory()

    def tearDown(self) -> None:
        with self._psycopg.connect(TEST_DSN) as conn:
            conn.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
        self.path.cleanup()

    def test_thread_survives_revision_and_records_history(self) -> None:
        sha = "a" * 40
        created = self.store.create_comment(
            self.project_id, self.path.name, "PCB", {"x": 1, "y": 2}, "Original", "Author",
            author_user_id="user:author", author_kind="user", anchor_commit=sha,
            anchor_source="client", element_id="source-uuid",
        )
        cid = created["id"]
        self.assertEqual(created["anchor"]["commit"], sha)
        self.assertEqual(created["revision"], 1)
        self.assertEqual(created["authorUserId"], "user:author")

        editor = Editor("user:author", "user", "Author")
        updated = self.store.edit_comment(
            self.project_id, self.path.name, cid, editor, expected_revision=1, content="Edited",
        )
        self.assertEqual(updated["revision"], 2)
        self.assertEqual(updated["anchor"]["commit"], sha)
        with self.assertRaises(RevisionConflict):
            self.store.edit_comment(
                self.project_id, self.path.name, cid, editor, expected_revision=1, content="Stale",
            )

        result = self.store.add_reply(
            self.project_id, self.path.name, cid, "Reply", "Author",
            author_user_id="user:author", author_kind="user",
        )
        self.assertIsNotNone(result)
        rid = result[1]["id"]
        self.assertEqual(len(self.store.get_history(self.project_id, "root", cid)), 2)
        self.assertEqual(len(self.store.get_history(self.project_id, "reply", rid)), 1)
        self.assertEqual(len(self.store.get_comments_file(self.project_id, self.path.name)["comments"]), 1)

        self.assertTrue(self.store.delete_comment(self.project_id, self.path.name, cid, editor, expected_revision=2))
        self.assertEqual(self.store.get_comments_file(self.project_id, self.path.name)["comments"], [])
        self.assertEqual(len(self.store.get_history(self.project_id, "root", cid)), 3)
        self.assertEqual(len(self.store.get_history(self.project_id, "reply", rid)), 2)

    def test_legacy_import_retains_id_without_claiming_owner(self) -> None:
        import json
        from pathlib import Path

        source = Path(self.path.name) / ".comments"
        source.mkdir()
        (source / "comments.json").write_text(json.dumps({"comments": [
            {"id": "c_existing", "author": "Legacy", "content": "Old", "location": {"x": 1, "y": 1},
             "replies": [{"id": "r_existing", "author": "Old reply", "content": "Old reply"}]},
        ]}), encoding="utf-8")
        comments = self.store.get_comments_file(self.project_id, self.path.name)["comments"]
        self.assertEqual(comments[0]["id"], "c_existing")
        self.assertEqual(comments[0]["authorKind"], "legacy")
        self.assertIsNone(comments[0]["authorUserId"])
        self.assertEqual(comments[0]["anchor"]["state"], "unpinned")
        self.assertEqual(comments[0]["replies"][0]["id"], "r_existing")
        self.assertEqual(len(self.store.get_history(self.project_id, "root", "c_existing")), 1)

    def test_combined_edit_and_status_is_atomic(self) -> None:
        created = self.store.create_comment(
            self.project_id, self.path.name, "SCH", {"x": 0, "y": 0}, "Before", "Author",
            author_user_id="author-id", author_kind="user",
        )
        editor = Editor("author-id", "user", "Author")
        updated = self.store.patch_comment(
            self.project_id, self.path.name, created["id"], editor,
            expected_revision=1, content="After", status="RESOLVED",
        )
        self.assertEqual((updated["content"], updated["status"], updated["revision"]),
                         ("After", "RESOLVED", 3))
        with self.assertRaises(RevisionConflict):
            self.store.patch_comment(
                self.project_id, self.path.name, created["id"], editor,
                expected_revision=1, content="Stale", status="OPEN",
            )
        current = self.store.get_comment(self.project_id, self.path.name, created["id"])
        self.assertEqual((current["content"], current["status"], current["revision"]),
                         ("After", "RESOLVED", 3))

    def test_existing_database_rows_migrate_additively_once(self) -> None:
        with self._psycopg.connect(TEST_DSN) as conn:
            conn.execute(f'CREATE SCHEMA "{self.schema}"')
            conn.execute(f'SET search_path TO "{self.schema}", public')
            conn.execute("""
                CREATE TABLE comments (
                    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, author TEXT NOT NULL,
                    timestamp TIMESTAMPTZ NOT NULL, status TEXT NOT NULL, context TEXT NOT NULL,
                    location_x REAL NOT NULL, location_y REAL NOT NULL,
                    location_layer TEXT NOT NULL DEFAULT '', location_page TEXT NOT NULL DEFAULT '',
                    content TEXT NOT NULL
                );
                CREATE TABLE comment_replies (
                    id TEXT PRIMARY KEY, comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
                    project_id TEXT NOT NULL, author TEXT NOT NULL, timestamp TIMESTAMPTZ NOT NULL,
                    content TEXT NOT NULL
                );
            """, prepare=False)
            conn.execute("""
                INSERT INTO comments(id, project_id, author, timestamp, status, context,
                    location_x, location_y, content)
                VALUES('c_old', %s, 'Old author', NOW(), 'OPEN', 'PCB', 1, 2, 'Original')
            """, (self.project_id,))
            conn.execute("""
                INSERT INTO comment_replies(id, comment_id, project_id, author, timestamp, content)
                VALUES('r_old', 'c_old', %s, 'Old reply author', NOW(), 'Reply')
            """, (self.project_id,))
        self.store.initialize()
        migrated = self.store.get_comment(self.project_id, self.path.name, "c_old")
        self.assertEqual(migrated["authorKind"], "legacy")
        self.assertIsNone(migrated["authorUserId"])
        self.assertEqual(migrated["anchor"]["state"], "unpinned")
        self.assertEqual(migrated["replies"][0]["id"], "r_old")
        self.assertEqual(len(self.store.get_history(self.project_id, "root", "c_old")), 1)
        self.store._initialized = False
        self.store.initialize()
        self.assertEqual(len(self.store.get_history(self.project_id, "root", "c_old")), 1)


if __name__ == "__main__":
    unittest.main()
