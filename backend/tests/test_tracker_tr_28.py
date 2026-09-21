"""TR-28: authoritative inbound hints and echo detection (F4, F5, F7, F8)."""

from __future__ import annotations

import json
import os
import sys
import unittest
import uuid
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import comments_schema_migrations  # noqa: E402
from app.services.comments_revisions import history  # noqa: E402
from app.services.trackers.contracts import (  # noqa: E402
    ForgeUser,
    RemoteComment,
    RemoteIssue,
    RemoteVersion,
)
from app.services.trackers.inbound import (  # noqa: E402
    CallableFetcher,
    apply_destination_hints,
    assert_inbound_suppresses_outbound,
    fetch_then_apply_hint,
)
from app.services.trackers.inbox_store import InboxStore, apply_schema as apply_inbox_schema  # noqa: E402
from app.services.trackers.markers import build_marker  # noqa: E402
from app.services.trackers.migrations import migrate_workspace_tracker_tables  # noqa: E402
from app.services.trackers.op_store import OpStore, apply_schema as apply_op_schema  # noqa: E402
from app.services.trackers.provenance import (  # noqa: E402
    body_hash,
    classify_comment_change,
    find_body_echo,
    resolve_editor,
    stored_hash_matches,
)
from app.services.trackers.store import TrackerStore  # noqa: E402

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
F5 = json.loads((DOCS / "fixtures" / "F05.json").read_text(encoding="utf-8"))
F7 = json.loads((DOCS / "fixtures" / "F07.json").read_text(encoding="utf-8"))
F8 = json.loads((DOCS / "fixtures" / "F08.json").read_text(encoding="utf-8"))

CONNECTOR = "cn_gh1"
CONTAINER = "111"
ISSUE_ID = "198400412"
ISSUE_NUMBER = "412"
ISSUE = ISSUE_NUMBER
BOT_ID = "199001"
BOT_LOGIN = "prism[bot]"
HUMAN_LOGIN = "arjun-gh"
HUMAN_ID = "5550001"
COMMENT_ID = "c_8f3a1b2c"
REPLY_ID = "r_91a4c0de"
OP_CREATE = "op_create_412"
OP_REPLY = "op_add_reply"
EXT_COMMENT = "2211003"


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


def _forge_user(*, user_id: str, login: str, is_bot: bool = False) -> ForgeUser:
    return ForgeUser(id=user_id, login=login, isBot=is_bot)


def _remote_comment(*, body: str, author: ForgeUser | None = None) -> RemoteComment:
    return RemoteComment(
        externalCommentId=EXT_COMMENT,
        externalId=ISSUE_ID,
        externalNumber=int(ISSUE_NUMBER),
        url=f"https://github.com/acme/openswitch/issues/{ISSUE_NUMBER}#issuecomment-{EXT_COMMENT}",
        body=body,
        author=author or _forge_user(user_id=HUMAN_ID, login=HUMAN_LOGIN),
        version=RemoteVersion(updatedAt="2026-09-20T16:00:00Z"),
    )


def _remote_issue(*, body: str, state: str = "open", author: ForgeUser | None = None) -> RemoteIssue:
    from app.services.trackers.contracts import IssueContainerRef

    return RemoteIssue(
        externalId=ISSUE_ID,
        url=f"https://github.com/acme/openswitch/issues/{ISSUE_NUMBER}",
        number=int(ISSUE_NUMBER),
        title="Tracker fixture",
        body=body,
        state=state,  # type: ignore[arg-type]
        author=author or _forge_user(user_id=BOT_ID, login=BOT_LOGIN, is_bot=True),
        version=RemoteVersion(updatedAt="2026-09-20T16:00:00Z"),
        container=IssueContainerRef(remoteContainerId=CONTAINER, path="acme/openswitch"),
    )


class FixtureContractTests(unittest.TestCase):
    def test_tr28_fixture_cases_present(self) -> None:
        f4_ids = {case["id"] for case in F4["cases"]}
        self.assertIn("F4.external_author_reply", f4_ids)
        self.assertIn("F4.bot_body_edited_by_human", f4_ids)
        self.assertIn("F4.echo_exact_hash", f4_ids)
        self.assertIn("F4.echo_hash_mismatch", f4_ids)
        self.assertIn("F4.two_projects_same_repo", f4_ids)
        f5_ids = {case["id"] for case in F5["cases"]}
        self.assertIn("F5.webhook_before_response", f5_ids)
        f7_ids = {case["id"] for case in F7["cases"]}
        self.assertIn("F7.reordered_hints", f7_ids)
        f8_ids = {case["id"] for case in F8["cases"]}
        self.assertIn("F8.inbound_never_enqueues", f8_ids)


class ProvenanceUnitTests(unittest.TestCase):
    def test_echo_hash_match_and_mismatch(self) -> None:
        body = "Hello from Prism"
        digest = body_hash(body)
        op_match = {"id": "op_1", "op": "add_comment", "state": "sent", "expected_body_hash": digest}
        op_other = {"id": "op_2", "op": "add_comment", "state": "sent", "expected_body_hash": "deadbeef"}
        self.assertTrue(stored_hash_matches(digest, body))
        self.assertIsNotNone(find_body_echo([op_match], fetched_body=body))
        self.assertIsNone(find_body_echo([op_other], fetched_body=body))

    def test_editor_resolution(self) -> None:
        named = resolve_editor(actor_login=HUMAN_LOGIN)
        self.assertEqual(named.kind, "remote_actor")
        self.assertIn(HUMAN_LOGIN, named.display)
        unknown = resolve_editor()
        self.assertEqual(unknown.kind, "remote_unknown")
        self.assertEqual(unknown.display, "edited on GitHub")

    def test_bot_edit_with_mismatch_is_real_edit(self) -> None:
        original = "bot body v1"
        edited = "bot body v2 edited by human"
        op = {
            "id": OP_REPLY,
            "op": "edit_comment",
            "state": "confirmed",
            "expected_body_hash": body_hash(original),
        }
        comment = _remote_comment(body=edited, author=_forge_user(user_id=BOT_ID, login=BOT_LOGIN, is_bot=True))
        kind, echo = classify_comment_change(
            [op],
            comment,
            event_actor_id=HUMAN_ID,
            event_actor_login=HUMAN_LOGIN,
            bot_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
        )
        self.assertEqual(kind, "edit")
        self.assertIsNone(echo)


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class InboundPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"tr28_{uuid.uuid4().hex[:12]}"
        self.conn = psycopg.connect(_dsn(), row_factory=dict_row)
        self.addCleanup(self._cleanup)
        self.conn.execute(f'CREATE SCHEMA "{self.schema}"')
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        self._create_comments_foundation()
        comments_schema_migrations.apply_comments_migrations(self.conn)
        migrate_workspace_tracker_tables(self.conn)
        apply_op_schema(self.conn)
        apply_inbox_schema(self.conn)
        self.store = TrackerStore(self.conn)
        self.ops = OpStore(self.conn)
        self.inbox = InboxStore(self.conn)
        self.audit_events: list[tuple[str, dict]] = []
        self.store.upsert_connector(
            connector_id=CONNECTOR,
            provider="github",
            instance_kind="github.com",
            bot_forge_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
        )
        self.conn.commit()

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
                author TEXT NOT NULL,
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                status TEXT NOT NULL DEFAULT 'OPEN',
                context TEXT NOT NULL DEFAULT 'PCB',
                location_x REAL NOT NULL DEFAULT 0,
                location_y REAL NOT NULL DEFAULT 0,
                location_layer TEXT NOT NULL DEFAULT '',
                location_page TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE comment_replies (
                id TEXT PRIMARY KEY,
                comment_id TEXT NOT NULL REFERENCES comments(id),
                project_id TEXT NOT NULL,
                author TEXT NOT NULL,
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                content TEXT NOT NULL DEFAULT ''
            );
            """,
            prepare=False,
        )

    def _seed_project(
        self,
        *,
        project_id: str,
        comment_id: str,
        thread_id: str,
        external_id: str = ISSUE_ID,
        external_number: str | None = ISSUE_NUMBER,
    ) -> None:
        self.store.set_project_tracker(
            project_tracker_id=f"pt_{project_id}",
            project_id=project_id,
            connector_id=CONNECTOR,
            container_kind="repo",
            container_path="acme/openswitch",
            remote_container_id=CONTAINER,
            generation=2,
        )
        self.conn.execute(
            "INSERT INTO comments(id, project_id, author, content) VALUES (%s, %s, %s, %s)",
            (comment_id, project_id, "Priya", "root content"),
        )
        self.store.insert_thread(
            thread_id=thread_id,
            comment_id=comment_id,
            project_tracker_id=f"pt_{project_id}",
            destination_generation=2,
            connector_id=CONNECTOR,
            remote_container_id=CONTAINER,
            external_id=external_id,
            external_number=external_number,
            external_url=f"https://github.com/acme/openswitch/issues/{external_number or external_id}",
        )

    def _seed_prism_reply(self, *, thread_id: str, body: str) -> None:
        self.conn.execute(
            """
            INSERT INTO comment_replies (
                id, comment_id, project_id, author, author_kind, origin, content, revision
            ) VALUES (%s, %s, %s, %s, 'user', 'prism', %s, 1)
            """,
            (REPLY_ID, COMMENT_ID, "prj_a", "Priya", body),
        )
        self.store.insert_reply_link(
            link_id="trl_1",
            tracked_thread_id=thread_id,
            reply_id=REPLY_ID,
            external_comment_id=EXT_COMMENT,
            remote_author_id=BOT_ID,
            remote_author_login=BOT_LOGIN,
        )

    def _enqueue_hint(self, **fields) -> dict:
        payload = {
            "objectKind": "comment",
            "remoteContainerId": CONTAINER,
            "externalId": ISSUE,
            "externalCommentId": EXT_COMMENT,
            "event": "edited",
            **fields,
        }
        result = self.inbox.enqueue(
            connector_id=CONNECTOR,
            delivery_id=f"del_{uuid.uuid4().hex[:8]}",
            hints=[payload],
        )
        self.conn.commit()
        return result["hints"][0]

    def _audit(self, action: str, detail: dict) -> None:
        self.audit_events.append((action, detail))

    def test_f4_external_author_reply(self) -> None:
        self._seed_project(project_id="prj_a", comment_id=COMMENT_ID, thread_id="tt_a")
        body = "Also fixed the N side."
        fetcher = CallableFetcher(
            comment=lambda *_args: _remote_comment(body=body, author=_forge_user(user_id=HUMAN_ID, login=HUMAN_LOGIN)),
        )
        hint = self._enqueue_hint(event="created")
        before = self.conn.execute("SELECT COUNT(*) AS n FROM sync_ops").fetchone()["n"]
        result = fetch_then_apply_hint(
            self.conn,
            hint,
            fetcher=fetcher,
            inbox=self.inbox,
            ops=self.ops,
            store=self.store,
            bot_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
        )
        self.assertEqual(result.outcome, "applied")
        row = self.conn.execute(
            "SELECT author_kind, origin, author FROM comment_replies WHERE origin = 'remote'"
        ).fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row["author_kind"], "remote")
        self.assertEqual(row["origin"], "remote")
        self.assertEqual(row["author"], HUMAN_LOGIN)
        assert_inbound_suppresses_outbound(self.conn, before=before)

    def test_f4_bot_body_edited_by_human(self) -> None:
        self._seed_project(project_id="prj_a", comment_id=COMMENT_ID, thread_id="tt_a")
        original = "bot mirrored body"
        edited = "bot mirrored body + human fix"
        self._seed_prism_reply(thread_id="tt_a", body=original)
        self.ops.insert(
            op_id=OP_REPLY,
            tracked_thread_id="tt_a",
            op="edit_comment",
            destination_generation=2,
            expected_body_hash=body_hash(original),
        )
        self.conn.commit()
        fetcher = CallableFetcher(
            comment=lambda *_args: _remote_comment(
                body=edited,
                author=_forge_user(user_id=BOT_ID, login=BOT_LOGIN, is_bot=True),
            ),
        )
        hint = self._enqueue_hint(actor_id=HUMAN_ID, actor_login=HUMAN_LOGIN)
        result = fetch_then_apply_hint(
            self.conn,
            hint,
            fetcher=fetcher,
            inbox=self.inbox,
            ops=self.ops,
            store=self.store,
            bot_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
        )
        self.assertEqual(result.outcome, "applied")
        self.assertEqual(
            self.conn.execute("SELECT content FROM comment_replies WHERE id = %s", (REPLY_ID,)).fetchone()["content"],
            edited,
        )
        revisions = [
            row
            for row in history(self.conn, project_id="prj_a", target_kind="reply", target_id=REPLY_ID)
            if row["changeKind"] == "edit"
        ]
        self.assertEqual(len(revisions), 1)
        self.assertEqual(revisions[0]["editorKind"], "remote_actor")
        self.assertIn(HUMAN_LOGIN, revisions[0]["editorDisplay"])

    def test_f4_echo_exact_hash(self) -> None:
        self._seed_project(project_id="prj_a", comment_id=COMMENT_ID, thread_id="tt_a")
        body = "exact echo body"
        self._seed_prism_reply(thread_id="tt_a", body=body)
        inserted = self.ops.insert(
            op_id=OP_REPLY,
            tracked_thread_id="tt_a",
            op="add_comment",
            destination_generation=2,
            expected_body_hash=body_hash(body),
        )
        self.ops.mark_sent(OP_REPLY, int(inserted["fence"]))
        self.conn.commit()
        fetcher = CallableFetcher(
            comment=lambda *_args: _remote_comment(
                body=body,
                author=_forge_user(user_id=BOT_ID, login=BOT_LOGIN, is_bot=True),
            ),
        )
        hint = self._enqueue_hint(actor_id=BOT_ID, actor_login=BOT_LOGIN)
        result = fetch_then_apply_hint(
            self.conn,
            hint,
            fetcher=fetcher,
            inbox=self.inbox,
            ops=self.ops,
            store=self.store,
            bot_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
        )
        self.assertEqual(result.outcome, "ignored_echo")
        self.assertEqual(self.ops.get(OP_REPLY)["state"], "confirmed")
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) AS n FROM comment_revisions WHERE target_id = %s", (REPLY_ID,)).fetchone()["n"],
            0,
        )
        finished = self.inbox.get_hint(hint["id"])
        self.assertEqual(finished["state"], "ignored")

    def test_f4_echo_hash_mismatch_treated_as_edit(self) -> None:
        self._seed_project(project_id="prj_a", comment_id=COMMENT_ID, thread_id="tt_a")
        original = "expected body"
        edited = "different body"
        self._seed_prism_reply(thread_id="tt_a", body=original)
        self.ops.insert(
            op_id=OP_REPLY,
            tracked_thread_id="tt_a",
            op="add_comment",
            destination_generation=2,
            expected_body_hash=body_hash(original),
        )
        self.conn.commit()
        fetcher = CallableFetcher(
            comment=lambda *_args: _remote_comment(
                body=edited,
                author=_forge_user(user_id=BOT_ID, login=BOT_LOGIN, is_bot=True),
            ),
        )
        hint = self._enqueue_hint(actor_id=BOT_ID, actor_login=BOT_LOGIN)
        result = fetch_then_apply_hint(
            self.conn,
            hint,
            fetcher=fetcher,
            inbox=self.inbox,
            ops=self.ops,
            store=self.store,
            bot_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
        )
        self.assertEqual(result.outcome, "applied")
        revisions = [
            row
            for row in history(self.conn, project_id="prj_a", target_kind="reply", target_id=REPLY_ID)
            if row["changeKind"] == "edit"
        ]
        self.assertEqual(len(revisions), 1)
        self.assertEqual(revisions[0]["editorKind"], "remote_unknown")

    def test_f4_two_projects_same_repo(self) -> None:
        self._seed_project(project_id="prj_a", comment_id="c_a", thread_id="tt_a")
        self._seed_project(project_id="prj_b", comment_id="c_b", thread_id="tt_b")
        fetcher = CallableFetcher(
            comment=lambda *_args: _remote_comment(body="shared repo comment"),
        )
        hint = self._enqueue_hint(event="created")
        fetch_then_apply_hint(
            self.conn,
            hint,
            fetcher=fetcher,
            inbox=self.inbox,
            ops=self.ops,
            store=self.store,
            bot_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
        )
        self.conn.commit()
        count_a = self.conn.execute(
            "SELECT COUNT(*) AS n FROM comment_replies WHERE comment_id = 'c_a'"
        ).fetchone()["n"]
        count_b = self.conn.execute(
            "SELECT COUNT(*) AS n FROM comment_replies WHERE comment_id = 'c_b'"
        ).fetchone()["n"]
        self.assertEqual(count_a, 1)
        self.assertEqual(count_b, 1)

    def test_f5_webhook_before_response_confirms_create(self) -> None:
        self._seed_project(project_id="prj_a", comment_id=COMMENT_ID, thread_id="tt_a", external_id="pending")
        marker = build_marker(
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            comment_id=COMMENT_ID,
            op_id=OP_CREATE,
        )
        inserted = self.ops.insert(
            op_id=OP_CREATE,
            tracked_thread_id="tt_a",
            op="create_issue",
            destination_generation=2,
        )
        self.ops.mark_sent(OP_CREATE, int(inserted["fence"]))
        issue = _remote_issue(body=f"Issue body\n{marker}")
        fetcher = CallableFetcher(issue=lambda *_args: issue)
        hint = self.inbox.enqueue(
            connector_id=CONNECTOR,
            delivery_id=f"del_{uuid.uuid4().hex[:8]}",
            hints=[
                {
                    "objectKind": "issue",
                    "remoteContainerId": CONTAINER,
                    "externalId": ISSUE,
                    "event": "created",
                }
            ],
        )["hints"][0]
        self.conn.commit()
        result = fetch_then_apply_hint(
            self.conn,
            hint,
            fetcher=fetcher,
            inbox=self.inbox,
            ops=self.ops,
            store=self.store,
            bot_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
        )
        self.assertEqual(result.outcome, "applied")
        self.assertEqual(self.ops.get(OP_CREATE)["state"], "confirmed")
        thread = self.conn.execute(
            "SELECT external_id, external_number FROM tracked_threads WHERE id = 'tt_a'"
        ).fetchone()
        self.assertEqual(thread["external_id"], ISSUE_ID)
        self.assertEqual(thread["external_number"], ISSUE_NUMBER)

    def test_f7_reordered_issue_hints_converge_on_fetch(self) -> None:
        self._seed_project(project_id="prj_a", comment_id=COMMENT_ID, thread_id="tt_a")
        states = iter(["closed", "open"])

        def issue_fetcher(*_args):
            return _remote_issue(body="state sync", state=next(states))

        fetcher = CallableFetcher(issue=issue_fetcher)
        first = self.inbox.enqueue(
            connector_id=CONNECTOR,
            delivery_id=f"del_{uuid.uuid4().hex[:8]}",
            hints=[{"objectKind": "issue", "remoteContainerId": CONTAINER, "externalId": ISSUE, "event": "closed"}],
        )["hints"][0]
        second = self.inbox.enqueue(
            connector_id=CONNECTOR,
            delivery_id=f"del_{uuid.uuid4().hex[:8]}",
            hints=[{"objectKind": "issue", "remoteContainerId": CONTAINER, "externalId": ISSUE, "event": "reopened"}],
        )["hints"][0]
        self.conn.commit()
        apply_destination_hints(
            self.conn,
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            fetcher=fetcher,
            bot_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
        )
        self.conn.commit()
        row = self.conn.execute("SELECT remote_state FROM tracked_threads WHERE id = 'tt_a'").fetchone()
        self.assertEqual(row["remote_state"], "open")
        self.assertEqual(self.inbox.get_hint(first["id"])["state"], "applied")
        self.assertEqual(self.inbox.get_hint(second["id"])["state"], "applied")

    def test_forge_close_and_reopen_follow_into_root_status(self) -> None:
        """TR-46: a GitHub close must resolve the Prism root, and a reopen must reopen it.

        Recording ``remote_state`` alone left the root OPEN after a forge close.
        """

        self._seed_project(project_id="prj_a", comment_id=COMMENT_ID, thread_id="tt_a")

        def closed(*_args):
            return _remote_issue(body="state sync", state="closed")

        self.inbox.enqueue(
            connector_id=CONNECTOR,
            delivery_id=f"del_{uuid.uuid4().hex[:8]}",
            hints=[{"objectKind": "issue", "remoteContainerId": CONTAINER, "externalId": ISSUE, "event": "closed",
                    "actor": {"id": HUMAN_ID, "login": HUMAN_LOGIN}}],
        )
        self.conn.commit()
        apply_destination_hints(
            self.conn, connector_id=CONNECTOR, container_id=CONTAINER,
            fetcher=CallableFetcher(issue=closed), bot_user_id=BOT_ID, bot_login=BOT_LOGIN,
        )
        self.conn.commit()
        row = self.conn.execute("SELECT status FROM comments WHERE id = %s", (COMMENT_ID,)).fetchone()
        self.assertEqual(row["status"], "RESOLVED")
        self.assertEqual(
            self.conn.execute("SELECT remote_state FROM tracked_threads WHERE id = 'tt_a'").fetchone()["remote_state"],
            "closed",
        )
        # Inbound never enqueues an outbound op for the state it just observed.
        ops = self.conn.execute("SELECT COUNT(*) AS n FROM sync_ops WHERE op = 'set_state'").fetchone()["n"]
        self.assertEqual(ops, 0)

        def reopened(*_args):
            return _remote_issue(body="state sync", state="open")

        self.inbox.enqueue(
            connector_id=CONNECTOR,
            delivery_id=f"del_{uuid.uuid4().hex[:8]}",
            hints=[{"objectKind": "issue", "remoteContainerId": CONTAINER, "externalId": ISSUE, "event": "reopened"}],
        )
        self.conn.commit()
        apply_destination_hints(
            self.conn, connector_id=CONNECTOR, container_id=CONTAINER,
            fetcher=CallableFetcher(issue=reopened), bot_user_id=BOT_ID, bot_login=BOT_LOGIN,
        )
        self.conn.commit()
        row = self.conn.execute("SELECT status FROM comments WHERE id = %s", (COMMENT_ID,)).fetchone()
        self.assertEqual(row["status"], "OPEN")

    def test_f8_inbound_never_enqueues(self) -> None:
        self._seed_project(project_id="prj_a", comment_id=COMMENT_ID, thread_id="tt_a")
        before = self.conn.execute("SELECT COUNT(*) AS n FROM sync_ops").fetchone()["n"]
        fetcher = CallableFetcher(comment=lambda *_args: _remote_comment(body="remote only"))
        hint = self._enqueue_hint(event="created")
        fetch_then_apply_hint(
            self.conn,
            hint,
            fetcher=fetcher,
            inbox=self.inbox,
            ops=self.ops,
            store=self.store,
            bot_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
        )
        assert_inbound_suppresses_outbound(self.conn, before=before)

    def test_copied_marker_does_not_authorize_link(self) -> None:
        self._seed_project(project_id="prj_a", comment_id=COMMENT_ID, thread_id="tt_a")
        marker = build_marker(
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            comment_id="c_other",
            op_id="op_copied",
        )
        fetcher = CallableFetcher(
            comment=lambda *_args: _remote_comment(
                body=f"copied marker\n{marker}",
                author=_forge_user(user_id=HUMAN_ID, login=HUMAN_LOGIN),
            ),
        )
        hint = self._enqueue_hint(event="created")
        result = fetch_then_apply_hint(
            self.conn,
            hint,
            fetcher=fetcher,
            inbox=self.inbox,
            ops=self.ops,
            store=self.store,
            bot_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
            audit=self._audit,
        )
        self.assertEqual(result.outcome, "ignored_marker")
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) AS n FROM comment_replies").fetchone()["n"],
            0,
        )
        self.assertTrue(any(event[0] == "inbound_marker_rejected" for event in self.audit_events))


if __name__ == "__main__":
    unittest.main()
