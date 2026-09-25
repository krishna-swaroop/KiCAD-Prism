"""TR-30: mirror root edits and promoted-thread deletion (F4, F8)."""

from __future__ import annotations

import json
import os
import sys
import unittest
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import comments_schema_migrations  # noqa: E402
from app.services.comments_revisions import Editor, tombstone_root  # noqa: E402
from app.services.trackers.contracts import (  # noqa: E402
    ForgeUser,
    IssueContainerRef,
    RemoteComment,
    RemoteIssue,
    RemoteVersion,
)
from app.services.trackers.create_executor import (  # noqa: E402
    github_issue_url,
    mount_create_executor,
    set_connect_factory as set_create_connect_factory,
    unmount_create_executor,
)
from app.services.trackers.drafts import (  # noqa: E402
    DraftAttribution,
    DraftRenderInput,
    build_issue_draft,
    render_issue_body_from_draft,
)
from app.services.trackers.markers import build_marker  # noqa: E402
from app.services.trackers.migrations import migrate_workspace_tracker_tables  # noqa: E402
from app.services.trackers.op_store import RECOVERY_DISPATCH, OpStore, apply_schema as apply_op_schema  # noqa: E402
from app.services.trackers.promotion import PromotionActor  # noqa: E402
from app.services.trackers.provenance import body_hash  # noqa: E402
from app.services.trackers.reply_executor import (  # noqa: E402
    mount_reply_executor,
    set_connect_factory as set_reply_connect_factory,
    unmount_reply_executor,
)
from app.services.trackers.store import TrackerStore, issue_number_for_api  # noqa: E402
from app.services.trackers.thread_executor import (  # noqa: E402
    execute_thread_claimed_op,
    mount_thread_executor,
    recover_thread_op,
    set_connect_factory as set_thread_connect_factory,
    unmount_thread_executor,
)
from app.services.trackers.thread_mutations import (  # noqa: E402
    DELETION_NOTE,
    after_root_content_edited,
    after_root_deleted,
    apply_inbound_root_prose,
    compose_outbound_issue_body,
    parse_issue_body_blocks,
)

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]

POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
APPLICATION_POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
DOCS = Path(__file__).resolve().parents[2] / "docs" / "tracker-integration"
F4 = json.loads((DOCS / "fixtures" / "F04.json").read_text(encoding="utf-8"))
F8 = json.loads((DOCS / "fixtures" / "F08.json").read_text(encoding="utf-8"))

CONNECTOR = "cn_gh1"
CONTAINER = "987654321"
REPO = "acme/openswitch"
ISSUE_ID = "198400412"
ISSUE_NUMBER = 412
BOT_ID = "199001"
BOT_LOGIN = "prism[bot]"
COMMENT_ID = "c_root"
THREAD_ID = "tt_root"
OP_UPDATE = "op_update_root"
OP_NOTE = "op_post_note"
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


def _remote_issue(*, body: str, title: str = "[MAJOR] Root — openswitch (F.Cu)") -> RemoteIssue:
    return RemoteIssue(
        externalId=ISSUE_ID,
        number=ISSUE_NUMBER,
        url=github_issue_url(REPO, ISSUE_NUMBER),
        title=title,
        body=body,
        state="open",
        labels=["prism"],
        assignees=[],
        author=ForgeUser(id=BOT_ID, login=BOT_LOGIN, isBot=True),
        version=RemoteVersion(updatedAt="2026-09-20T16:00:00Z"),
        container=IssueContainerRef(remoteContainerId=CONTAINER, path=REPO),
    )


def _build_remote_body(prose: str, *, op_id: str = "op_create") -> str:
    draft = build_issue_draft(
        DraftRenderInput(
            project_id="prj_a",
            comment={
                "id": COMMENT_ID,
                "author": "Priya",
                "authorKind": "user",
                "content": prose,
                "severity": "major",
                "commentClass": "observation",
                "context": "PCB",
                "location": {"x": 1.0, "y": 2.0, "layer": "F.Cu", "page": ""},
                "anchor": {"commit": "3f2c9a1b7e4d5c6a8b9f0e1d2c3b4a5968778695"},
            },
            connector_id=CONNECTOR,
            remote_container_id=CONTAINER,
            op_id=op_id,
            public_base_url="https://prism.example",
            attribution=DraftAttribution(display_name="Priya", verified=True),
        )
    )
    return render_issue_body_from_draft(draft)


class FixtureContractTests(unittest.TestCase):
    def test_tr30_fixture_cases_present(self) -> None:
        f8_ids = {case["id"] for case in F8["cases"]}
        self.assertIn("F8.root_prose_roundtrip", f8_ids)
        self.assertIn("F8.local_root_deleted", f8_ids)
        self.assertIn("F8.deletion_note_crash", f8_ids)
        f4_ids = {case["id"] for case in F4["cases"]}
        self.assertIn("F4.human_title_edit", f4_ids)

    def test_github_issue_url_uses_repo_number(self) -> None:
        url = github_issue_url(REPO, ISSUE_NUMBER)
        self.assertEqual(url, f"https://github.com/{REPO}/issues/{ISSUE_NUMBER}")
        self.assertNotIn(ISSUE_ID, url)


class BodyBlockTests(unittest.TestCase):
    def test_parse_and_compose_preserve_context_and_marker(self) -> None:
        remote = _build_remote_body("original prose")
        blocks = parse_issue_body_blocks(remote)
        self.assertIsNotNone(blocks)
        composed = compose_outbound_issue_body(local_prose="edited prose", remote_body=remote)
        self.assertIsNotNone(composed)
        reparsed = parse_issue_body_blocks(composed or "")
        self.assertIsNotNone(reparsed)
        self.assertEqual(reparsed.prose, "edited prose")
        self.assertEqual(reparsed.context, blocks.context)
        self.assertEqual(reparsed.marker.raw, blocks.marker.raw)

    def test_diverged_body_returns_none(self) -> None:
        self.assertIsNone(parse_issue_body_blocks("human rewrote everything"))


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class ThreadMutationPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        unmount_thread_executor()
        unmount_reply_executor()
        unmount_create_executor()
        self.schema = f"tr30_{uuid.uuid4().hex[:12]}"
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
        mount_thread_executor()

        @contextmanager
        def factory():
            conn = psycopg.connect(_dsn(), row_factory=dict_row)
            conn.execute(f'SET search_path TO "{self.schema}", public')
            try:
                yield conn
            finally:
                conn.close()

        set_thread_connect_factory(factory)
        set_reply_connect_factory(factory)
        set_create_connect_factory(factory)
        self.addCleanup(unmount_thread_executor)
        self.addCleanup(unmount_reply_executor)
        self.addCleanup(unmount_create_executor)
        self.addCleanup(lambda: set_thread_connect_factory(None))
        self.addCleanup(lambda: set_reply_connect_factory(None))
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
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                deleted_at TIMESTAMPTZ
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
                sync_state TEXT,
                deleted_at TIMESTAMPTZ
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

    def _seed_linked_thread(self, *, prose: str = "Root comment") -> None:
        self.conn.execute(
            """
            INSERT INTO comments (
                id, project_id, author, author_kind, content, severity, comment_class,
                context, location_x, location_y, location_layer, anchor_commit, anchor_state, anchor_source, revision
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                COMMENT_ID,
                "prj_a",
                "Priya",
                "user",
                prose,
                "major",
                "observation",
                "PCB",
                1.0,
                2.0,
                "F.Cu",
                "3f2c9a1b7e4d5c6a8b9f0e1d2c3b4a5968778695",
                "pinned",
                "openswitch.kicad_pro",
                2,
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

    def _comment_dict(self, *, content: str = "edited locally", revision: int = 2) -> dict:
        return {"id": COMMENT_ID, "content": content, "revision": revision}

    def test_local_root_edit_enqueues_update_issue(self) -> None:  # F8.root_prose_roundtrip
        outcome = after_root_content_edited(
            self.conn,
            project_id="prj_a",
            comment=self._comment_dict(),
            actor=DESIGNER,
            workspace_schema=self.schema,
        )
        self.assertEqual(outcome.action, "enqueued")
        row = self.conn.execute(
            "SELECT op, state FROM sync_ops WHERE id = %s",
            (outcome.op_id,),
        ).fetchone()
        self.assertEqual(row["op"], "update_issue")
        self.assertEqual(row["state"], "pending")

    def test_execute_update_issue_rewrites_only_prose_block(self) -> None:
        remote_body = _build_remote_body("remote prose")
        remote_blocks = parse_issue_body_blocks(remote_body)
        self.assertIsNotNone(remote_blocks)
        self.conn.execute(
            "UPDATE comments SET content = %s WHERE id = %s",
            ("edited locally", COMMENT_ID),
        )
        self.ops.insert(
            op_id=OP_UPDATE,
            tracked_thread_id=THREAD_ID,
            op="update_issue",
            destination_generation=2,
            local_revision=2,
            expected_body_hash=body_hash("edited locally"),
        )
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_UPDATE, int(claimed["fence"]))
        self.conn.commit()
        captured: dict[str, object] = {}

        class FakeAdapter:
            def get_issue(self, dest, issue_ref, etag=None):  # noqa: ANN001
                captured["issue_ref"] = issue_ref
                return _remote_issue(body=remote_body)

            def update_issue(self, dest, issue_ref, patch):  # noqa: ANN001
                captured["patch"] = patch
                return _remote_issue(body=patch.proseBlock or remote_body, title=patch.title or "title")

            def capabilities(self):
                return type("Caps", (), {"hasStateEvents": True})()

        with (
            patch("app.services.trackers.thread_executor._issue_adapter", return_value=FakeAdapter()),
            patch("app.services.trackers.thread_executor.settings.PUBLIC_BASE_URL", "https://prism.example"),
        ):
            execute_thread_claimed_op(self.ops.get(OP_UPDATE))

        self.assertEqual(self.ops.get(OP_UPDATE)["state"], "confirmed")
        self.assertEqual(captured["issue_ref"], str(ISSUE_NUMBER))
        issue_patch = captured["patch"]
        self.assertIn("edited locally", issue_patch.proseBlock)
        self.assertIn(remote_blocks.marker.raw, issue_patch.proseBlock)
        self.assertIn(remote_blocks.context, issue_patch.proseBlock)

    def test_inbound_prose_edit_applies_without_anchor_or_severity_change(self) -> None:
        remote_body = _build_remote_body("remote edited prose")
        thread = dict(self.conn.execute("SELECT * FROM tracked_threads WHERE id = %s", (THREAD_ID,)).fetchone())
        outcome = apply_inbound_root_prose(
            self.conn,
            thread=thread,
            issue_body=remote_body,
            ops=self.ops,
            project_id="prj_a",
            comment_id=COMMENT_ID,
            event_actor_login="human",
            bot_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
        )
        self.assertEqual(outcome, "applied")
        row = self.conn.execute(
            "SELECT content, severity, anchor_commit FROM comments WHERE id = %s",
            (COMMENT_ID,),
        ).fetchone()
        self.assertEqual(row["content"], "remote edited prose")
        self.assertEqual(row["severity"], "major")
        self.assertEqual(row["anchor_commit"], "3f2c9a1b7e4d5c6a8b9f0e1d2c3b4a5968778695")

    def test_local_root_delete_enqueues_post_note_and_unlinks(self) -> None:  # F8.local_root_deleted
        tombstone_root(
            self.conn,
            project_id="prj_a",
            comment_id=COMMENT_ID,
            editor=Editor(user_id="u_designer", kind="user", display="Priya"),
            expected_revision=2,
        )
        outcome = after_root_deleted(
            self.conn,
            project_id="prj_a",
            comment_id=COMMENT_ID,
            actor=DESIGNER,
            workspace_schema=self.schema,
        )
        self.assertIn(outcome.action, {"enqueued", "existing"})
        row = self.conn.execute(
            "SELECT op, state FROM sync_ops WHERE op = 'post_note'"
        ).fetchone()
        thread = self.conn.execute("SELECT unlinked_at, lineage FROM tracked_threads WHERE id = %s", (THREAD_ID,)).fetchone()
        self.assertEqual(row["op"], "post_note")
        self.assertIsNotNone(thread["unlinked_at"])
        self.assertTrue(thread["lineage"])

    def test_post_note_is_idempotent_when_pending(self) -> None:
        tombstone_root(
            self.conn,
            project_id="prj_a",
            comment_id=COMMENT_ID,
            editor=Editor(user_id="u_designer", kind="user", display="Priya"),
            expected_revision=2,
        )
        self.ops.insert(
            op_id=OP_NOTE,
            tracked_thread_id=THREAD_ID,
            op="post_note",
            destination_generation=2,
            expected_body_hash=body_hash(DELETION_NOTE),
        )
        outcome = after_root_deleted(
            self.conn,
            project_id="prj_a",
            comment_id=COMMENT_ID,
            actor=DESIGNER,
            workspace_schema=self.schema,
        )
        self.assertEqual(outcome.action, "existing")
        self.assertEqual(outcome.op_id, OP_NOTE)
        count = self.conn.execute("SELECT COUNT(*) AS n FROM sync_ops WHERE op = 'post_note'").fetchone()["n"]
        self.assertEqual(count, 1)

    def test_execute_post_note_posts_comment_not_delete(self) -> None:
        self.ops.insert(
            op_id=OP_NOTE,
            tracked_thread_id=THREAD_ID,
            op="post_note",
            destination_generation=2,
            expected_body_hash=body_hash(DELETION_NOTE),
        )
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_NOTE, int(claimed["fence"]))
        self.conn.commit()
        marker = build_marker(
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            comment_id=COMMENT_ID,
            op_id=OP_NOTE,
        )
        remote = RemoteComment(
            externalCommentId="9001",
            externalId=ISSUE_ID,
            externalNumber=ISSUE_NUMBER,
            url=f"https://github.com/{REPO}/issues/{ISSUE_NUMBER}#issuecomment-9001",
            body=f"{DELETION_NOTE}\n\n{marker}",
            author=ForgeUser(id=BOT_ID, login=BOT_LOGIN, isBot=True),
            version=RemoteVersion(updatedAt="2026-09-20T16:00:00Z"),
        )

        class FakeAdapter:
            deleted = False

            def add_comment(self, dest, issue_ref, body, op_id, *, issue_id=None):  # noqa: ANN001
                self.issue_ref = issue_ref
                self.body = body
                return remote

            def delete_issue(self, dest, ext_id):  # noqa: ANN001
                self.deleted = True

        fake = FakeAdapter()
        with patch("app.services.trackers.reply_executor._comment_adapter", return_value=fake):
            execute_thread_claimed_op(self.ops.get(OP_NOTE))
        self.assertFalse(fake.deleted)
        self.assertEqual(fake.issue_ref, str(ISSUE_NUMBER))
        self.assertIn(DELETION_NOTE, fake.body)
        self.assertEqual(self.ops.get(OP_NOTE)["state"], "confirmed")

    def test_deletion_note_recovery_confirms_without_duplicate(self) -> None:  # F8.deletion_note_crash
        self.ops.insert(
            op_id=OP_NOTE,
            tracked_thread_id=THREAD_ID,
            op="post_note",
            destination_generation=2,
            expected_body_hash=body_hash(DELETION_NOTE),
        )
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_NOTE, int(claimed["fence"]))
        self.conn.commit()
        marker = build_marker(
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            comment_id=COMMENT_ID,
            op_id=OP_NOTE,
        )
        remote = RemoteComment(
            externalCommentId="9002",
            externalId=ISSUE_ID,
            externalNumber=ISSUE_NUMBER,
            url=f"https://github.com/{REPO}/issues/{ISSUE_NUMBER}#issuecomment-9002",
            body=f"{DELETION_NOTE}\n\n{marker}",
            author=ForgeUser(id=BOT_ID, login=BOT_LOGIN, isBot=True),
            version=RemoteVersion(updatedAt="2026-09-20T16:00:00Z"),
        )

        class FakeAdapter:
            def find_comment_by_marker(self, dest, issue_ref, marker_text, *, issue_id=None):  # noqa: ANN001
                return remote if marker_text in (remote.body or "") else None

            def list_comments(self, dest, issue, page_cursor=None):  # noqa: ANN001
                return [remote], None

        with patch("app.services.trackers.reply_executor._comment_adapter", return_value=FakeAdapter()):
            recover_thread_op(self.conn, {**self.ops.get(OP_NOTE), "dispatch": RECOVERY_DISPATCH})
        self.assertEqual(self.ops.get(OP_NOTE)["state"], "confirmed")
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) AS n FROM sync_ops WHERE op = 'post_note'").fetchone()["n"],
            1,
        )

    def test_human_title_edit_skips_title_rewrite(self) -> None:  # F4.human_title_edit
        self.conn.execute(
            "UPDATE tracked_threads SET last_title_hash = %s WHERE id = %s",
            (body_hash("Prism title"), THREAD_ID),
        )
        remote_body = _build_remote_body("prose")
        self.ops.insert(
            op_id=OP_UPDATE,
            tracked_thread_id=THREAD_ID,
            op="update_issue",
            destination_generation=2,
            local_revision=2,
        )
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_UPDATE, int(claimed["fence"]))
        self.conn.commit()

        class FakeAdapter:
            def get_issue(self, dest, issue_ref, etag=None):  # noqa: ANN001
                return _remote_issue(body=remote_body, title="Human changed title")

            def update_issue(self, dest, issue_ref, patch):  # noqa: ANN001
                self.patch = patch
                return _remote_issue(body=patch.proseBlock or remote_body, title="Human changed title")

            def capabilities(self):
                return type("Caps", (), {"hasStateEvents": True})()

        fake = FakeAdapter()
        with (
            patch("app.services.trackers.thread_executor._issue_adapter", return_value=fake),
            patch("app.services.trackers.thread_executor.settings.PUBLIC_BASE_URL", "https://prism.example"),
        ):
            execute_thread_claimed_op(self.ops.get(OP_UPDATE))
        self.assertIsNone(fake.patch.title)  # type: ignore[attr-defined]
        self.assertEqual(self.ops.get(OP_UPDATE)["state"], "confirmed")


if __name__ == "__main__":
    unittest.main()
