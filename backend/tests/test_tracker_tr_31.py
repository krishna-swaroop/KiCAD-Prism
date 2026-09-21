"""TR-31: observed state and pending-intent reconciliation (F6, D1)."""

from __future__ import annotations

import json
import os
import sys
import unittest
import uuid
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import comments_schema_migrations  # noqa: E402
from app.services.comments_revisions import Editor, set_root_status  # noqa: E402
from app.services.trackers.capabilities import ProviderCapabilities  # noqa: E402
from app.services.trackers.contracts import (  # noqa: E402
    ForgeUser,
    IssueContainerRef,
    RemoteEvent,
    RemoteIssue,
    RemoteVersion,
)
from app.services.trackers.migrations import migrate_workspace_tracker_tables  # noqa: E402
from app.services.trackers.op_store import OpStore, apply_schema as apply_op_schema  # noqa: E402
from app.services.trackers.promotion import PromotionActor  # noqa: E402
from app.services.trackers.publication_policy import PublicationDenied  # noqa: E402
from app.services.trackers.state_mutations import (  # noqa: E402
    analyze_state_events,
    enqueue_set_state,
    preflight_mismatch,
    versions_match,
)
from app.services.trackers.state_executor import execute_set_state_op  # noqa: E402
from app.services.trackers.store import TrackerStore  # noqa: E402
from app.services.trackers.create_executor import (  # noqa: E402
    execute_claimed_op,
    mount_create_executor,
    set_connect_factory,
    unmount_create_executor,
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
F6 = json.loads((DOCS / "fixtures" / "F06.json").read_text(encoding="utf-8"))

CONNECTOR = "cn_gh1"
CONTAINER = "987654321"
REPO = "acme/openswitch"
ISSUE_ID = "198400412"
ISSUE_NUMBER = 412
BOT_ID = "199001"
BOT_LOGIN = "prism[bot]"
HUMAN_LOGIN = "arjun-gh"
HUMAN_ID = "5550001"
COMMENT_ID = "c_8f3a1b2c"
THREAD_ID = "tt_a"


def _identity(url: str):
    from urllib.parse import urlsplit

    parsed = urlsplit(url)
    return (parsed.username or "", (parsed.hostname or "").lower(), parsed.port, parsed.path.lstrip("/"))


SHARED_APPLICATION_DATABASE = bool(
    POSTGRES_URL
    and APPLICATION_POSTGRES_URL
    and _identity(POSTGRES_URL) == _identity(APPLICATION_POSTGRES_URL)
)


def _dsn() -> str:
    return POSTGRES_URL.replace("postgresql+psycopg://", "postgresql://", 1)


def _issue(
    *,
    state: str = "open",
    updated_at: str = "2026-09-20T15:42:11Z",
    etag: str = "W/1",
) -> RemoteIssue:
    return RemoteIssue(
        externalId=ISSUE_ID,
        url=f"https://github.com/{REPO}/issues/{ISSUE_NUMBER}",
        number=ISSUE_NUMBER,
        title="State fixture",
        body="body",
        state=state,  # type: ignore[arg-type]
        labels=["prism"],
        assignees=[],
        author=ForgeUser(id=BOT_ID, login=BOT_LOGIN, isBot=True),
        version=RemoteVersion(updatedAt=updated_at, etag=etag),
        container=IssueContainerRef(remoteContainerId=CONTAINER, path=REPO),
    )


class FakeIssueAdapter:
    def __init__(self, *, has_state_events: bool = True) -> None:
        self.has_state_events = has_state_events
        self.issues: dict[str, RemoteIssue] = {}
        self.events: list[RemoteEvent] = []
        self.set_state_calls: list[str] = []

    def capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            provider="github",
            canEditOwnComment=True,
            canDeleteOwnComment=True,
            canEditIssueBody=True,
            hasStateEvents=self.has_state_events,
            hasTransferEvents=True,
            supportsConditionalGet=True,
            maxAssignees=10,
            apiVersion="2022-11-28",
            instanceKind="github.com",
        )

    def get_issue(self, _dest, _ext_id, etag=None):  # noqa: ANN001
        key = str(_ext_id)
        issue = self.issues.get(key) or self.issues.get(str(ISSUE_NUMBER)) or _issue()
        return issue

    def set_state(self, _dest, _ext_id, state, note):  # noqa: ANN001
        del note
        self.set_state_calls.append(state)
        current = self.get_issue(_dest, _ext_id, etag=None)
        assert isinstance(current, RemoteIssue)
        next_version = RemoteVersion(
            updatedAt=f"2026-09-20T16:0{len(self.set_state_calls)}:00Z",
            etag=f"W/{len(self.set_state_calls)}",
        )
        updated = current.model_copy(update={"state": state, "version": next_version})
        self.issues[str(_ext_id)] = updated
        self.issues[str(ISSUE_NUMBER)] = updated
        return updated

    def list_events(self, _dest, _ext_id):  # noqa: ANN001
        return list(self.events)


class FixtureContractTests(unittest.TestCase):
    def test_f6_cases_present(self) -> None:
        ids = {case["id"] for case in F6["cases"]}
        for case_id in (
            "F6.close_vs_remote_reopen_preflight",
            "F6.clean_close",
            "F6.remote_edit_between_get_and_patch",
            "F6.same_state_remote_transition",
            "F6.equal_coarse_timestamps",
            "F6.clock_skew",
            "F6.two_rapid_local_intents",
            "F6.unknown_expectation",
            "F6.no_events_capability",
        ):
            self.assertIn(case_id, ids)


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class StateReconciliationPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        unmount_create_executor()
        self.schema = f"tr31_{uuid.uuid4().hex[:12]}"
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
        self.adapter = FakeIssueAdapter()
        self._seed_destination()
        mount_create_executor()

        @contextmanager
        def factory():
            conn = psycopg.connect(_dsn(), row_factory=dict_row)
            conn.execute(f'SET search_path TO "{self.schema}", public')
            try:
                yield conn
            finally:
                conn.close()

        set_connect_factory(factory)
        self.addCleanup(unmount_create_executor)
        self.addCleanup(lambda: set_connect_factory(None))
        self._issue_patch = patch(
            "app.services.trackers.state_executor._issue_adapter",
            lambda _connector, http=None: self.adapter,  # noqa: ARG005
        )
        self._issue_patch.start()
        self.addCleanup(self._issue_patch.stop)

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
                location_page TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                comment_class TEXT NOT NULL DEFAULT 'general',
                severity TEXT NOT NULL DEFAULT 'info',
                scope TEXT NOT NULL DEFAULT 'canvas',
                anchor_commit TEXT,
                anchor_state TEXT NOT NULL DEFAULT 'pinned',
                revision INTEGER NOT NULL DEFAULT 1
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
                revision INTEGER NOT NULL DEFAULT 1
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

    def _seed_linked_thread(
        self,
        *,
        status: str = "OPEN",
        remote_state: str = "open",
        remote_version: dict | None = None,
    ) -> None:
        version = remote_version or {"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"}
        self.conn.execute(
            """
            INSERT INTO comments(id, project_id, author, content, status, anchor_commit, revision)
            VALUES (%s, %s, %s, %s, %s, %s, 1)
            """,
            (COMMENT_ID, "prj_a", "Priya", "root", status, "abc123"),
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
            external_url=f"https://github.com/{REPO}/issues/{ISSUE_NUMBER}",
            link_state="linked",
        )
        self.conn.execute(
            """
            UPDATE tracked_threads
            SET remote_state = %s, remote_version = %s::jsonb
            WHERE id = %s
            """,
            (remote_state, json.dumps(version), THREAD_ID),
        )
        self.adapter.issues[str(ISSUE_NUMBER)] = _issue(state=remote_state, updated_at=version["updatedAt"], etag=version["etag"])

    def _insert_set_state_op(self, *, expected_state: str | None, expected_version: dict | None) -> dict:
        op_id = f"op_state_{uuid.uuid4().hex[:8]}"
        self.ops.insert(
            op_id=op_id,
            tracked_thread_id=THREAD_ID,
            op="set_state",
            destination_generation=2,
            local_revision=2,
            actor_user_id="u_designer",
            expected_remote_state=expected_state,
            expected_remote_version=expected_version,
        )
        claimed = self.ops.claim("worker-a")
        self.assertIsNotNone(claimed)
        self.ops.mark_sent(claimed["id"], claimed["fence"])
        self.conn.commit()
        return claimed

    def test_f6_clean_close(self) -> None:
        self._seed_linked_thread(status="RESOLVED", remote_state="open")
        self.adapter.events = [
            RemoteEvent(
                externalId=str(ISSUE_NUMBER),
                eventId="e1",
                event="closed",
                createdAt="2026-09-20T16:00:00Z",
                actor=ForgeUser(id=BOT_ID, login=BOT_LOGIN, isBot=True),
            )
        ]
        claimed = self._insert_set_state_op(
            expected_state="open",
            expected_version={"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"},
        )
        execute_claimed_op(claimed)
        self.conn.commit()
        op = self.ops.get(claimed["id"])
        thread = self.conn.execute("SELECT remote_state, remote_version FROM tracked_threads WHERE id = %s", (THREAD_ID,)).fetchone()
        self.assertEqual(op["state"], "confirmed")
        self.assertEqual(thread["remote_state"], "closed")
        self.assertEqual(self.adapter.set_state_calls, ["closed"])

    def test_f6_close_vs_remote_reopen_preflight(self) -> None:
        self._seed_linked_thread(
            status="RESOLVED",
            remote_state="open",
            remote_version={"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"},
        )
        self.adapter.issues[str(ISSUE_NUMBER)] = _issue(
            state="open",
            updated_at="2026-09-20T16:05:00Z",
            etag="W/3",
        )
        # Fixture: remote reopened→closed→reopened since the snapshot.
        self.adapter.events = [
                RemoteEvent(
                    externalId=str(ISSUE_NUMBER),
                    eventId="e1",
                    event="reopened",
                    createdAt="2026-09-20T15:50:00Z",
                    actor=ForgeUser(id=HUMAN_ID, login=HUMAN_LOGIN, isBot=False),
                ),
                RemoteEvent(
                    externalId=str(ISSUE_NUMBER),
                    eventId="e2",
                    event="closed",
                    createdAt="2026-09-20T15:55:00Z",
                    actor=ForgeUser(id=HUMAN_ID, login=HUMAN_LOGIN, isBot=False),
                ),
                RemoteEvent(
                    externalId=str(ISSUE_NUMBER),
                    eventId="e3",
                    event="reopened",
                    createdAt="2026-09-20T16:05:00Z",
                    actor=ForgeUser(id=HUMAN_ID, login=HUMAN_LOGIN, isBot=False),
                ),
        ]
        claimed = self._insert_set_state_op(
            expected_state="open",
            expected_version={"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"},
        )
        execute_claimed_op(claimed)
        self.conn.commit()
        comment = self.conn.execute("SELECT status FROM comments WHERE id = %s", (COMMENT_ID,)).fetchone()
        notes = self.conn.execute(
            "SELECT content FROM comment_replies WHERE comment_id = %s AND author_kind = 'system'",
            (COMMENT_ID,),
        ).fetchall()
        self.assertEqual(self.ops.get(claimed["id"])["state"], "superseded")
        self.assertEqual(comment["status"], "OPEN")
        self.assertEqual(len(notes), 1)
        self.assertEqual(self.adapter.set_state_calls, [])

    def test_f6_same_state_remote_transition(self) -> None:
        self._seed_linked_thread(
            status="RESOLVED",
            remote_state="closed",
            remote_version={"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"},
        )
        self.adapter.issues[str(ISSUE_NUMBER)] = _issue(
            state="closed",
            updated_at="2026-09-20T16:05:00Z",
            etag="W/3",
        )
        # Fixture: remote reopened then closed again (v3) — a human transition.
        self.adapter.events = [
                RemoteEvent(
                    externalId=str(ISSUE_NUMBER),
                    eventId="e1",
                    event="reopened",
                    createdAt="2026-09-20T15:50:00Z",
                    actor=ForgeUser(id=HUMAN_ID, login=HUMAN_LOGIN, isBot=False),
                ),
                RemoteEvent(
                    externalId=str(ISSUE_NUMBER),
                    eventId="e2",
                    event="closed",
                    createdAt="2026-09-20T16:05:00Z",
                    actor=ForgeUser(id=HUMAN_ID, login=HUMAN_LOGIN, isBot=False),
                ),
        ]
        claimed = self._insert_set_state_op(
            expected_state="closed",
            expected_version={"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"},
        )
        execute_claimed_op(claimed)
        self.conn.commit()
        thread = self.conn.execute("SELECT remote_version FROM tracked_threads WHERE id = %s", (THREAD_ID,)).fetchone()
        self.assertEqual(self.ops.get(claimed["id"])["state"], "superseded")
        self.assertEqual(thread["remote_version"]["etag"], "W/3")
        self.assertEqual(self.adapter.set_state_calls, [])

    def test_f6_own_comment_bumps_version_without_state_change(self) -> None:  # TR-46 live
        # Prism's reply landed after the snapshot (updated_at moved) but the
        # state is unchanged and no human touched it: the intent must proceed.
        self._seed_linked_thread(
            status="RESOLVED",
            remote_state="open",
            remote_version={"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"},
        )
        self.adapter.issues[str(ISSUE_NUMBER)] = _issue(
            state="open",
            updated_at="2026-09-20T16:05:00Z",
            etag="W/3",
        )
        self.adapter.events = [
            RemoteEvent(
                externalId=str(ISSUE_NUMBER),
                eventId="e-old",
                event="reopened",
                createdAt="2026-09-20T15:00:00Z",
                actor=ForgeUser(id=HUMAN_ID, login=HUMAN_LOGIN, isBot=False),
            ),
        ]
        claimed = self._insert_set_state_op(
            expected_state="open",
            expected_version={"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"},
        )
        execute_claimed_op(claimed)
        self.conn.commit()
        self.assertEqual(self.ops.get(claimed["id"])["state"], "confirmed")
        self.assertEqual(self.adapter.set_state_calls, ["closed"])
        notes = self.conn.execute(
            "SELECT content FROM comment_replies WHERE comment_id = %s AND author_kind = 'system'",
            (COMMENT_ID,),
        ).fetchall()
        self.assertEqual(notes, [])

    def test_f6_remote_edit_between_get_and_patch(self) -> None:
        self._seed_linked_thread(status="RESOLVED", remote_state="open")
        self.adapter.events = [
            RemoteEvent(
                externalId=str(ISSUE_NUMBER),
                eventId="e-human",
                event="reopened",
                createdAt="2026-09-20T16:00:00Z",
                actor=ForgeUser(id=HUMAN_ID, login=HUMAN_LOGIN),
            ),
            RemoteEvent(
                externalId=str(ISSUE_NUMBER),
                eventId="e-bot",
                event="closed",
                createdAt="2026-09-20T16:00:00Z",
                actor=ForgeUser(id=BOT_ID, login=BOT_LOGIN, isBot=True),
            ),
        ]
        claimed = self._insert_set_state_op(
            expected_state="open",
            expected_version={"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"},
        )
        execute_claimed_op(claimed)
        self.conn.commit()
        comment = self.conn.execute("SELECT status FROM comments WHERE id = %s", (COMMENT_ID,)).fetchone()
        notes = self.conn.execute(
            "SELECT content FROM comment_replies WHERE comment_id = %s AND author_kind = 'system'",
            (COMMENT_ID,),
        ).fetchall()
        self.assertEqual(comment["status"], "OPEN")
        self.assertEqual(self.adapter.set_state_calls, ["closed", "open"])
        self.assertEqual(len(notes), 1)
        self.assertIn(HUMAN_LOGIN, notes[0]["content"])

    def test_f6_unknown_expectation(self) -> None:
        self._seed_linked_thread(status="RESOLVED", remote_state="open")
        self.conn.execute(
            "UPDATE tracked_threads SET remote_version = NULL, remote_state = 'open' WHERE id = %s",
            (THREAD_ID,),
        )
        claimed = self._insert_set_state_op(expected_state=None, expected_version=None)
        execute_claimed_op(claimed)
        self.conn.commit()
        self.assertEqual(self.ops.get(claimed["id"])["state"], "superseded")
        self.assertEqual(self.adapter.set_state_calls, [])

    def test_f6_no_events_capability(self) -> None:
        self.adapter.has_state_events = False
        self._seed_linked_thread(status="RESOLVED", remote_state="open")
        claimed = self._insert_set_state_op(
            expected_state="open",
            expected_version={"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"},
        )
        execute_claimed_op(claimed)
        self.conn.commit()
        op = self.ops.get(claimed["id"])
        self.assertEqual(op["state"], "confirmed")
        last_error = op["last_error"]
        if isinstance(last_error, str):
            last_error = json.loads(last_error)
        self.assertEqual(last_error["message"], "postflight=unsupported")

    def test_f6_two_rapid_local_intents(self) -> None:
        self._seed_linked_thread(status="OPEN", remote_state="open")
        actor = PromotionActor(user_id="u_designer", role="designer")
        close_revision = set_root_status(
            self.conn,
            project_id="prj_a",
            comment_id=COMMENT_ID,
            status="RESOLVED",
            editor=Editor(user_id="u_designer", kind="user", display="Designer"),
            expected_revision=1,
        )
        enqueue_set_state(
            self.conn,
            project_id="prj_a",
            comment_id=COMMENT_ID,
            actor=actor,
            local_revision=close_revision,
            workspace_schema=self.schema,
        )
        open_revision = set_root_status(
            self.conn,
            project_id="prj_a",
            comment_id=COMMENT_ID,
            status="OPEN",
            editor=Editor(user_id="u_designer", kind="user", display="Designer"),
            expected_revision=close_revision,
        )
        enqueue_set_state(
            self.conn,
            project_id="prj_a",
            comment_id=COMMENT_ID,
            actor=actor,
            local_revision=open_revision,
            workspace_schema=self.schema,
        )
        self.conn.commit()
        first = self.ops.claim("worker-a")
        self.assertIsNotNone(first)
        self.ops.mark_sent(first["id"], first["fence"])
        self.conn.commit()
        execute_claimed_op(first)
        self.conn.commit()
        second = self.ops.claim("worker-a")
        self.assertIsNotNone(second)
        self.ops.mark_sent(second["id"], second["fence"])
        self.conn.commit()
        execute_claimed_op(second)
        self.conn.commit()
        notes = self.conn.execute(
            "SELECT COUNT(*) AS n FROM comment_replies WHERE comment_id = %s AND author_kind = 'system'",
            (COMMENT_ID,),
        ).fetchone()
        self.assertEqual(self.ops.get(first["id"])["state"], "confirmed")
        self.assertEqual(self.ops.get(second["id"])["state"], "confirmed")
        self.assertEqual(self.adapter.set_state_calls, ["closed", "open"])
        self.assertEqual(notes["n"], 0)

    def test_f6_equal_coarse_timestamps_use_event_order(self) -> None:
        events = [
            RemoteEvent(
                externalId=str(ISSUE_NUMBER),
                eventId="e-human",
                event="reopened",
                createdAt="2026-09-20T16:00:00Z",
                actor=ForgeUser(id=HUMAN_ID, login=HUMAN_LOGIN),
            ),
            RemoteEvent(
                externalId=str(ISSUE_NUMBER),
                eventId="e-bot",
                event="closed",
                createdAt="2026-09-20T16:00:00Z",
                actor=ForgeUser(id=BOT_ID, login=BOT_LOGIN, isBot=True),
            ),
        ]
        outcome, editor, human_state = analyze_state_events(
            events,
            bot_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
        )
        self.assertEqual((outcome, human_state), ("human_precedes", "open"))
        self.assertIn(HUMAN_LOGIN, editor.display if editor else "")

    def test_f6_clock_skew_does_not_use_timestamps(self) -> None:
        thread = {
            "remote_state": "open",
            "remote_version": {"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"},
        }
        fetched = _issue(state="open", updated_at="2026-09-20T05:42:11Z", etag="W/3")
        self.assertTrue(preflight_mismatch(thread, fetched))
        self.assertFalse(versions_match(thread["remote_version"], fetched.version))

    def test_f6_viewer_resolve_refused(self) -> None:
        self._seed_linked_thread()
        actor = PromotionActor(user_id="u_viewer", role="viewer")
        with self.assertRaises(PublicationDenied):
            enqueue_set_state(
                self.conn,
                project_id="prj_a",
                comment_id=COMMENT_ID,
                actor=actor,
                local_revision=2,
                workspace_schema=self.schema,
            )

    def test_versions_match_is_opaque_equality(self) -> None:
        left = {"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"}
        right = RemoteVersion(updatedAt="2026-09-20T15:42:11Z", etag="W/1")
        self.assertTrue(versions_match(left, right))


if __name__ == "__main__":
    unittest.main()
