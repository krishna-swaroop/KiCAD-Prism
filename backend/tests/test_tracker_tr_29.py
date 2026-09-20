"""TR-29: mirror outbound reply create, edit and delete (F5, F8)."""

from __future__ import annotations

import json
import os
import sys
import unittest
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import comments_schema_migrations  # noqa: E402
from app.services.comments_revisions import history  # noqa: E402
from app.services.trackers.contracts import (  # noqa: E402
    ForgeUser,
    RemoteComment,
    RemoteVersion,
)
from app.services.trackers.create_executor import (  # noqa: E402
    github_issue_url,
    mount_create_executor,
    set_connect_factory as set_create_connect_factory,
    unmount_create_executor,
)
from app.services.trackers.github_recovery import RecoveryKind, recover_add_comment  # noqa: E402
from app.services.trackers.markers import build_marker  # noqa: E402
from app.services.trackers.migrations import migrate_workspace_tracker_tables  # noqa: E402
from app.services.trackers.op_store import RECOVERY_DISPATCH, OpStore, apply_schema as apply_op_schema  # noqa: E402
from app.services.trackers.promotion import PromotionActor  # noqa: E402
from app.services.trackers.provenance import body_hash  # noqa: E402
from app.services.trackers.reply_executor import (  # noqa: E402
    execute_reply_claimed_op,
    github_comment_url,
    mount_reply_executor,
    set_connect_factory,
    unmount_reply_executor,
)
from app.services.trackers.reply_mutations import (  # noqa: E402
    after_reply_added,
    after_reply_deleted,
    after_reply_edited,
    encode_reply_target,
)
from app.services.trackers.store import TrackerStore, issue_number_for_api  # noqa: E402

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]

POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
APPLICATION_POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
DOCS = Path(__file__).resolve().parents[2] / "docs" / "tracker-integration"
F5 = json.loads((DOCS / "fixtures" / "F05.json").read_text(encoding="utf-8"))
F8 = json.loads((DOCS / "fixtures" / "F08.json").read_text(encoding="utf-8"))

CONNECTOR = "cn_gh1"
CONTAINER = "987654321"
REPO = "acme/openswitch"
ISSUE_ID = "198400412"
ISSUE_NUMBER = 412
BOT_ID = "199001"
BOT_LOGIN = "prism[bot]"
COMMENT_ID = "c_8f3a1b2c"
THREAD_ID = "tt_a"
REPLY_ID = "r_91a4c0de"
OP_CREATE = "op_create_412"
OP_REPLY = "op_add_reply"
EXT_COMMENT = "2211003"
DESIGNER = PromotionActor(user_id="u_designer", role="designer")


def _identity(url: str):
    parsed = urlsplit(url)
    return (parsed.username or "", (parsed.hostname or "").lower(), parsed.port, parsed.path.lstrip("/"))


SHARED_APPLICATION_DATABASE = bool(
    POSTGRES_URL
    and APPLICATION_POSTGRES_URL
    and _identity(POSTGRES_URL) == _identity(APPLICATION_POSTGRES_URL)
)


def _dsn() -> str:
    return POSTGRES_URL.replace("postgresql+psycopg://", "postgresql://", 1)


def _remote_comment(*, body: str) -> RemoteComment:
    return RemoteComment(
        externalCommentId=EXT_COMMENT,
        externalId=ISSUE_ID,
        externalNumber=ISSUE_NUMBER,
        url=github_comment_url(REPO, ISSUE_NUMBER, EXT_COMMENT),
        body=body,
        author=ForgeUser(id=BOT_ID, login=BOT_LOGIN, isBot=True),
        version=RemoteVersion(updatedAt="2026-09-20T16:00:00Z"),
    )


class FixtureContractTests(unittest.TestCase):
    def test_tr29_fixture_cases_present(self) -> None:
        f5_ids = {case["id"] for case in F5["cases"]}
        self.assertIn("F5.reply_recovery", f5_ids)
        f8_ids = {case["id"] for case in F8["cases"]}
        self.assertIn("F8.local_reply_edit_mirrors", f8_ids)
        self.assertIn("F8.local_reply_delete_mirrors", f8_ids)

    def test_github_comment_url_uses_repo_number(self) -> None:
        url = github_comment_url(REPO, ISSUE_NUMBER, EXT_COMMENT)
        self.assertEqual(url, f"https://github.com/{REPO}/issues/{ISSUE_NUMBER}#issuecomment-{EXT_COMMENT}")
        self.assertNotIn(ISSUE_ID, url)


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class ReplyExecutorPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        unmount_reply_executor()
        unmount_create_executor()
        self.schema = f"tr29_{uuid.uuid4().hex[:12]}"
        self.conn = psycopg.connect(_dsn(), row_factory=dict_row)
        self.addCleanup(self._cleanup)
        self.conn.execute(f'CREATE SCHEMA "{self.schema}"')
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        self._create_comments_foundation()
        comments_schema_migrations.apply_comments_migrations(self.conn)
        migrate_workspace_tracker_tables(self.conn)
        apply_op_schema(self.conn)
        self.store = TrackerStore(self.conn)
        self.ops = OpStore(self.conn)
        self._seed_destination()
        self._seed_linked_thread()
        mount_create_executor()
        mount_reply_executor()

        @contextmanager
        def factory():
            conn = psycopg.connect(_dsn(), row_factory=dict_row)
            conn.execute(f'SET search_path TO "{self.schema}", public')
            try:
                yield conn
            finally:
                conn.close()

        set_connect_factory(factory)
        set_create_connect_factory(factory)
        self.addCleanup(unmount_reply_executor)
        self.addCleanup(unmount_create_executor)
        self.addCleanup(lambda: set_connect_factory(None))
        self.addCleanup(lambda: set_create_connect_factory(None))

    def _cleanup(self) -> None:
        try:
            self.conn.rollback()
            self.conn.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
            self.conn.commit()
        finally:
            self.conn.close()

    def _create_comments_foundation(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE comments (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                author TEXT NOT NULL DEFAULT '',
                author_kind TEXT NOT NULL DEFAULT 'user',
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                status TEXT NOT NULL DEFAULT 'OPEN',
                context TEXT NOT NULL DEFAULT 'PCB',
                location_x REAL NOT NULL DEFAULT 0,
                location_y REAL NOT NULL DEFAULT 0,
                location_layer TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                comment_class TEXT NOT NULL DEFAULT 'general',
                severity TEXT NOT NULL DEFAULT 'info',
                scope TEXT NOT NULL DEFAULT 'canvas',
                anchor_commit TEXT,
                anchor_state TEXT NOT NULL DEFAULT 'unpinned',
                anchor_source TEXT,
                revision INTEGER NOT NULL DEFAULT 1,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb
            );
            CREATE TABLE comment_replies (
                id TEXT PRIMARY KEY,
                comment_id TEXT NOT NULL REFERENCES comments(id),
                project_id TEXT NOT NULL,
                author TEXT NOT NULL DEFAULT '',
                author_kind TEXT NOT NULL DEFAULT 'user',
                origin TEXT NOT NULL DEFAULT 'prism',
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                content TEXT NOT NULL DEFAULT '',
                revision INTEGER NOT NULL DEFAULT 1,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                sync_state TEXT
            );
            """,
            prepare=False,
        )

    def _seed_destination(self) -> None:
        self.store.upsert_connector(
            connector_id=CONNECTOR,
            provider="github",
            instance_kind="github.com",
            bot_forge_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
            credential_envelope="test-envelope",
        )
        self.store.set_project_tracker(
            project_tracker_id="pt_a",
            project_id="prj_a",
            connector_id=CONNECTOR,
            container_kind="repo",
            container_path=REPO,
            remote_container_id=CONTAINER,
            generation=2,
            visibility="private",
        )
        self.store.acknowledge_destination(
            ack_id="ack_priv",
            connector_id=CONNECTOR,
            remote_container_id=CONTAINER,
            visibility="private",
            acknowledged_by="u_admin",
        )

    def _seed_linked_thread(self) -> None:
        self.conn.execute(
            """
            INSERT INTO comments (
                id, project_id, author, author_kind, content, severity, comment_class,
                context, location_x, location_y, location_layer, anchor_commit, anchor_state, anchor_source
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                COMMENT_ID,
                "prj_a",
                "Priya",
                "user",
                "Root comment",
                "major",
                "observation",
                "PCB",
                1.0,
                2.0,
                "F.Cu",
                "3f2c9a1b7e4d5c6a8b9f0e1d2c3b4a5968778695",
                "pinned",
                "openswitch.kicad_pro",
            ),
        )
        self.store.insert_thread(
            thread_id=THREAD_ID,
            comment_id=COMMENT_ID,
            project_tracker_id="pt_a",
            destination_generation=2,
            connector_id=CONNECTOR,
            remote_container_id=CONTAINER,
            external_id=ISSUE_ID,
            external_number=str(ISSUE_NUMBER),
            external_url=github_issue_url(REPO, ISSUE_NUMBER),
            link_state="linked",
        )

    def _insert_reply(self, *, content: str = "designer reply", revision: int = 1) -> None:
        self.conn.execute(
            """
            INSERT INTO comment_replies (
                id, comment_id, project_id, author, author_kind, origin, content, revision, timestamp, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
            """,
            (REPLY_ID, COMMENT_ID, "prj_a", "Priya", "user", "prism", content, revision),
        )

    def _comment_dict(self) -> dict:
        return {
            "id": COMMENT_ID,
            "revision": 1,
            "replies": [{"id": REPLY_ID, "revision": 1, "content": "designer reply", "origin": "prism"}],
        }

    def _reply_dict(self, *, revision: int = 1, content: str = "designer reply") -> dict:
        return {
            "id": REPLY_ID,
            "revision": revision,
            "content": content,
            "origin": "prism",
            "author": "Priya",
        }

    def test_enqueue_add_comment_orders_behind_pending_create(self) -> None:
        self._insert_reply()
        self.ops.insert(
            op_id=OP_CREATE,
            tracked_thread_id=THREAD_ID,
            op="create_issue",
            destination_generation=2,
        )
        self.conn.execute(
            "UPDATE tracked_threads SET external_id = 'pending', external_number = NULL WHERE id = %s",
            (THREAD_ID,),
        )
        comment = self._comment_dict()
        outcome = after_reply_added(
            self.conn,
            project_id="prj_a",
            comment=comment,
            reply=self._reply_dict(),
            actor=DESIGNER,
            workspace_schema=self.schema,
        )
        self.assertEqual(outcome.action, "enqueued")
        ops = {
            row["op"]
            for row in self.conn.execute("SELECT op FROM sync_ops").fetchall()
        }
        self.assertEqual(ops, {"create_issue", "add_comment"})
        claimed = self.ops.claim("worker-a")
        self.assertIsNotNone(claimed)
        self.assertEqual(claimed["op"], "create_issue")
        self.conn.commit()

    def test_execute_add_comment_links_reply_with_external_number(self) -> None:
        self._insert_reply()
        body = "designer reply"
        self.ops.insert(
            op_id=OP_REPLY,
            tracked_thread_id=THREAD_ID,
            op="add_comment",
            destination_generation=2,
            local_revision=1,
            expected_remote_state=encode_reply_target(REPLY_ID),
            expected_body_hash=body_hash(body),
        )
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_REPLY, int(claimed["fence"]))
        self.conn.commit()
        remote = _remote_comment(body=f"*{ 'Priya' }* (via Prism)\n\n{body}\n\n{build_marker(connector_id=CONNECTOR, container_id=CONTAINER, reply_id=REPLY_ID, op_id=OP_REPLY)}")

        class FakeAdapter:
            def add_comment(self, dest, issue_ref, body_text, op_id, *, issue_id=None):  # noqa: ANN001
                self.issue_ref = issue_ref
                return remote

        with patch("app.services.trackers.reply_executor._comment_adapter", return_value=FakeAdapter()):
            execute_reply_claimed_op(self.ops.get(OP_REPLY))

        thread = self.conn.execute("SELECT * FROM tracked_threads WHERE id = %s", (THREAD_ID,)).fetchone()
        link = self.conn.execute(
            "SELECT * FROM tracked_replies WHERE reply_id = %s",
            (REPLY_ID,),
        ).fetchone()
        op = self.ops.get(OP_REPLY)
        self.assertEqual(op["state"], "confirmed")
        self.assertEqual(issue_number_for_api(dict(thread)), str(ISSUE_NUMBER))
        self.assertEqual(link["external_comment_id"], EXT_COMMENT)
        self.assertEqual(link["external_url"], github_comment_url(REPO, ISSUE_NUMBER, EXT_COMMENT))

    def test_recovery_after_sent_finds_reply_by_marker(self) -> None:
        self._insert_reply()
        marker = build_marker(
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            reply_id=REPLY_ID,
            op_id=OP_REPLY,
        )
        body = f"recovered\n{marker}"
        self.ops.insert(
            op_id=OP_REPLY,
            tracked_thread_id=THREAD_ID,
            op="add_comment",
            destination_generation=2,
            local_revision=1,
            expected_remote_state=encode_reply_target(REPLY_ID),
            expected_body_hash=body_hash("designer reply"),
        )
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_REPLY, int(claimed["fence"]))
        self.conn.commit()
        sent = self.ops.get(OP_REPLY)
        sent["dispatch"] = RECOVERY_DISPATCH
        remote = _remote_comment(body=body)

        class FakeAdapter:
            def find_comment_by_marker(self, dest, issue_ref, marker_text, *, issue_id=None):  # noqa: ANN001
                return remote if marker_text in (remote.body or "") else None

            def get_comment(self, dest, ext_cid, etag=None):  # noqa: ANN001
                return remote

        def fetch_page(cursor):  # noqa: ANN001
            return ([remote], None)

        with patch("app.services.trackers.reply_executor._comment_adapter", return_value=FakeAdapter()):
            with patch(
                "app.services.trackers.reply_executor.make_comment_page_fetcher",
                return_value=fetch_page,
            ):
                execute_reply_claimed_op(sent)

        self.assertEqual(self.ops.get(OP_REPLY)["state"], "confirmed")
        link = self.conn.execute(
            "SELECT external_comment_id FROM tracked_replies WHERE reply_id = %s",
            (REPLY_ID,),
        ).fetchone()
        self.assertEqual(link["external_comment_id"], EXT_COMMENT)

    def test_local_reply_edit_enqueues_edit_comment(self) -> None:
        self._insert_reply(content="v1")
        self.store.insert_reply_link(
            link_id="trl_1",
            tracked_thread_id=THREAD_ID,
            reply_id=REPLY_ID,
            external_comment_id=EXT_COMMENT,
        )
        self.conn.execute(
            "UPDATE comment_replies SET revision = 2, content = 'v2' WHERE id = %s",
            (REPLY_ID,),
        )
        outcome = after_reply_edited(
            self.conn,
            project_id="prj_a",
            comment=self._comment_dict(),
            reply=self._reply_dict(revision=2, content="v2"),
            actor=DESIGNER,
            workspace_schema=self.schema,
        )
        self.assertEqual(outcome.action, "enqueued")
        row = self.conn.execute(
            "SELECT op, expected_body_hash, expected_remote_state FROM sync_ops WHERE id = %s",
            (outcome.op_id,),
        ).fetchone()
        self.assertEqual(row["op"], "edit_comment")
        self.assertEqual(row["expected_remote_state"], encode_reply_target(REPLY_ID))
        self.assertEqual(row["expected_body_hash"], body_hash("v2"))

    def test_local_reply_delete_enqueues_delete_comment(self) -> None:
        self._insert_reply()
        self.store.insert_reply_link(
            link_id="trl_1",
            tracked_thread_id=THREAD_ID,
            reply_id=REPLY_ID,
            external_comment_id=EXT_COMMENT,
        )
        outcome = after_reply_deleted(
            self.conn,
            project_id="prj_a",
            comment=self._comment_dict(),
            reply=self._reply_dict(),
            actor=DESIGNER,
            workspace_schema=self.schema,
        )
        self.assertEqual(outcome.action, "enqueued")
        row = self.conn.execute(
            "SELECT op FROM sync_ops WHERE id = %s",
            (outcome.op_id,),
        ).fetchone()
        self.assertEqual(row["op"], "delete_comment")

    def test_rapid_edit_supersedes_stale_pending_op(self) -> None:
        self._insert_reply(content="v1")
        self.store.insert_reply_link(
            link_id="trl_1",
            tracked_thread_id=THREAD_ID,
            reply_id=REPLY_ID,
            external_comment_id=EXT_COMMENT,
        )
        first = after_reply_edited(
            self.conn,
            project_id="prj_a",
            comment=self._comment_dict(),
            reply=self._reply_dict(revision=2, content="v2"),
            actor=DESIGNER,
            workspace_schema=self.schema,
        )
        second = after_reply_edited(
            self.conn,
            project_id="prj_a",
            comment=self._comment_dict(),
            reply=self._reply_dict(revision=3, content="v3"),
            actor=DESIGNER,
            workspace_schema=self.schema,
        )
        self.assertEqual(first.action, "enqueued")
        self.assertEqual(second.action, "enqueued")
        self.assertEqual(self.ops.get(first.op_id)["state"], "superseded")
        self.assertEqual(self.ops.get(second.op_id)["state"], "pending")

    def test_remote_origin_reply_skips_enqueue(self) -> None:
        self._insert_reply()
        outcome = after_reply_edited(
            self.conn,
            project_id="prj_a",
            comment=self._comment_dict(),
            reply=self._reply_dict() | {"origin": "remote"},
            actor=DESIGNER,
            workspace_schema=self.schema,
        )
        self.assertEqual(outcome.action, "skipped")
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) AS n FROM sync_ops").fetchone()["n"],
            0,
        )


class RecoveryScanUnitTests(unittest.TestCase):
    def test_reply_recovery_empty_then_found(self) -> None:
        from app.services.trackers.contracts import Destination

        marker = build_marker(
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            reply_id=REPLY_ID,
            op_id=OP_REPLY,
        )
        dest = Destination(
            connectorId=CONNECTOR,
            containerKind="repo",
            containerPath=REPO,
            remoteContainerId=CONTAINER,
            generation=2,
        )
        op = {
            "id": OP_REPLY,
            "op": "add_comment",
            "sent_at": datetime(2026, 9, 20, 15, 0, tzinfo=timezone.utc),
        }
        remote = _remote_comment(body=f"x\n{marker}")
        first = recover_add_comment(
            op,
            dest=dest,
            reply_id=REPLY_ID,
            fetch_page=lambda _cursor: ([], None),
            bot_user_id=BOT_ID,
        )
        self.assertEqual(first.kind, RecoveryKind.NOT_FOUND)
        second = recover_add_comment(
            op,
            dest=dest,
            reply_id=REPLY_ID,
            fetch_page=lambda _cursor: ([remote], None),
            bot_user_id=BOT_ID,
        )
        self.assertEqual(second.kind, RecoveryKind.FOUND)
        self.assertEqual(second.match.external_id, ISSUE_ID)


if __name__ == "__main__":
    unittest.main()
