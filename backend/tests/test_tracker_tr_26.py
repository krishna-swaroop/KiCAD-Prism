"""TR-26: execute and recover outbound issue creation (F5, F8)."""

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
from app.services.trackers.contracts import (  # noqa: E402
    ForgeUser,
    IssueContainerRef,
    RemoteIssue,
    RemoteVersion,
)
from app.services.trackers.github_recovery import RecoveryKind, recover_create_issue  # noqa: E402
from app.services.trackers.inbox_store import InboxStore, apply_schema as apply_inbox_schema  # noqa: E402
from app.services.trackers import jobs as tracker_jobs  # noqa: E402
from app.services.trackers.markers import build_marker  # noqa: E402
from app.services.trackers.migrations import migrate_workspace_tracker_tables  # noqa: E402
from app.services.trackers.op_store import RECOVERY_DISPATCH, OpStore, apply_schema as apply_op_schema  # noqa: E402
from app.services.trackers.scheduler import (  # noqa: E402
    DISPATCH_KIND,
    reset_scheduler_throttle,
    schedule_due_tracker_jobs,
)
from app.services.trackers.store import TrackerStore  # noqa: E402
from app.services.trackers.create_executor import (  # noqa: E402
    execute_claimed_op,
    github_issue_url,
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
OP_ID = "op_create_412"
COMMIT = "3f2c9a1b7e4d5c6a8b9f0e1d2c3b4a5968778695"


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


def _remote_issue(*, body: str) -> RemoteIssue:
    return RemoteIssue(
        externalId=ISSUE_ID,
        url=github_issue_url(REPO, ISSUE_NUMBER),
        number=ISSUE_NUMBER,
        title="[MAJOR] promote me",
        body=body,
        state="open",
        labels=["prism"],
        assignees=[],
        author=ForgeUser(id=BOT_ID, login=BOT_LOGIN, isBot=True),
        version=RemoteVersion(updatedAt="2026-09-20T15:42:11Z"),
        container=IssueContainerRef(remoteContainerId=CONTAINER, path=REPO),
    )


class FakeJobs:
    def __init__(self) -> None:
        self.rows: list[dict] = []

    def enqueue(self, kind, payload=None, **kwargs):  # noqa: ANN001
        job = {
            "kind": kind,
            "payload": dict(payload or {}),
            "artifact_key": kwargs.get("artifact_key"),
            "deduplicated": False,
        }
        self.rows.append(job)
        return job


class FakeContext:
    def __init__(self, payload: dict, worker_id: str = "w1") -> None:
        self.payload = payload
        self.worker_id = worker_id
        self.job_id = "job-1"
        self.fence = 1

    def check_cancelled(self) -> None:
        return None


class FixtureContractTests(unittest.TestCase):
    def test_fixture_cases_are_present(self) -> None:
        f5_ids = {case["id"] for case in F5["cases"]}
        self.assertIn("F5.crash_after_acceptance_before_confirm", f5_ids)
        self.assertIn("F5.webhook_before_response", f5_ids)
        self.assertIn("F5.timeout_then_late_acceptance", f5_ids)
        f8_ids = {case["id"] for case in F8["cases"]}
        self.assertIn("F8.public_change_while_queued", f8_ids)

    def test_github_issue_url_uses_repo_number(self) -> None:
        self.assertEqual(
            github_issue_url(REPO, ISSUE_NUMBER),
            f"https://github.com/{REPO}/issues/{ISSUE_NUMBER}",
        )
        self.assertNotIn(ISSUE_ID, github_issue_url(REPO, ISSUE_NUMBER))


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class CreateExecutorPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_scheduler_throttle()
        self._public_base = patch.object(
            __import__("app.core.config", fromlist=["settings"]).settings,
            "PUBLIC_BASE_URL",
            "https://prism.example.com",
        )
        self._public_base.start()
        self.addCleanup(self._public_base.stop)
        self.schema = f"tr26_{uuid.uuid4().hex[:12]}"
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
        self.jobs = FakeJobs()
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
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                content TEXT NOT NULL DEFAULT ''
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
        self.conn.execute(
            """
            UPDATE project_trackers
            SET promote_min_role = 'designer', visibility = 'private'
            WHERE project_id = 'prj_a'
            """
        )

    def _seed_pending_create(self) -> str:
        marker = build_marker(
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            comment_id=COMMENT_ID,
            op_id=OP_ID,
        )
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
                "Stub on MGMT.D0_P",
                "major",
                "observation",
                "PCB",
                1.0,
                2.0,
                "F.Cu",
                COMMIT,
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
            external_id="pending",
            link_state="linked",
        )
        self.ops.insert(
            op_id=OP_ID,
            tracked_thread_id=THREAD_ID,
            op="create_issue",
            destination_generation=2,
        )
        self.conn.commit()
        return marker

    def test_execute_create_links_thread_with_external_number(self) -> None:
        marker = self._seed_pending_create()
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_ID, int(claimed["fence"]))
        self.conn.commit()

        fake_issue = _remote_issue(body=f"prose\n\n{marker}")

        class FakeAdapter:
            def create_issue(self, dest, draft, op_id):  # noqa: ANN001
                return fake_issue

        with patch("app.services.trackers.create_executor._issue_adapter", return_value=FakeAdapter()):
            execute_claimed_op(self.ops.get(OP_ID))

        row = self.conn.execute(
            "SELECT external_id, external_number, external_url FROM tracked_threads WHERE id = %s",
            (THREAD_ID,),
        ).fetchone()
        op = self.ops.get(OP_ID)
        self.assertEqual(op["state"], "confirmed")
        self.assertEqual(row["external_id"], ISSUE_ID)
        self.assertEqual(row["external_number"], str(ISSUE_NUMBER))
        self.assertEqual(row["external_url"], f"https://github.com/{REPO}/issues/{ISSUE_NUMBER}")

    def test_recovery_after_sent_finds_issue_by_marker(self) -> None:
        marker = self._seed_pending_create()
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_ID, int(claimed["fence"]))
        self.conn.commit()
        sent = self.ops.get(OP_ID)
        sent["dispatch"] = RECOVERY_DISPATCH

        payload = _remote_issue(body=f"created\n{marker}")

        class FakeAdapter:
            def get_issue(self, dest, ext_id, etag=None):  # noqa: ANN001
                return payload

        def fetch_page(cursor):  # noqa: ANN001
            return (
                [
                    {
                        "id": int(ISSUE_ID),
                        "number": ISSUE_NUMBER,
                        "body": payload.body,
                        "html_url": payload.url,
                        "user": {"id": int(BOT_ID), "login": BOT_LOGIN},
                    }
                ],
                None,
            )

        with patch("app.services.trackers.create_executor._issue_adapter", return_value=FakeAdapter()):
            with patch(
                "app.services.trackers.create_executor.make_issue_page_fetcher",
                return_value=fetch_page,
            ):
                execute_claimed_op(sent)

        self.assertEqual(self.ops.get(OP_ID)["state"], "confirmed")
        thread = self.conn.execute(
            "SELECT external_id, external_number FROM tracked_threads WHERE id = %s",
            (THREAD_ID,),
        ).fetchone()
        self.assertEqual(thread["external_id"], ISSUE_ID)
        self.assertEqual(thread["external_number"], str(ISSUE_NUMBER))

    def test_empty_recovery_scan_enters_quarantine(self) -> None:
        self._seed_pending_create()
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_ID, int(claimed["fence"]))
        self.ops.enter_recovery(OP_ID, int(claimed["fence"]))
        self.conn.commit()
        sent = self.ops.get(OP_ID)
        sent["dispatch"] = RECOVERY_DISPATCH

        with patch("app.services.trackers.create_executor._issue_adapter", return_value=object()):
            with patch(
                "app.services.trackers.create_executor.make_issue_page_fetcher",
                return_value=lambda _cursor: ([], None),
            ):
                execute_claimed_op(sent)

        row = self.ops.get(OP_ID)
        self.assertEqual(row["state"], "quarantine")
        self.assertIsNotNone(row.get("next_attempt_at"))

    def test_webhook_before_response_then_execute_is_idempotent(self) -> None:
        marker = self._seed_pending_create()
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_ID, int(claimed["fence"]))
        issue = _remote_issue(body=f"body\n{marker}")
        from app.services.trackers.inbound import CallableFetcher, fetch_then_apply_hint

        hint = self.inbox.enqueue(
            connector_id=CONNECTOR,
            delivery_id=f"del_{uuid.uuid4().hex[:8]}",
            hints=[
                {
                    "objectKind": "issue",
                    "remoteContainerId": CONTAINER,
                    "externalId": str(ISSUE_NUMBER),
                    "event": "opened",
                }
            ],
        )["hints"][0]
        fetcher = CallableFetcher(issue=lambda *_args: issue)
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
        self.assertEqual(self.ops.get(OP_ID)["state"], "confirmed")

        class FakeAdapter:
            def create_issue(self, dest, draft, op_id):  # noqa: ANN001
                raise AssertionError("create_issue must not run after webhook confirmation")

        with patch("app.services.trackers.create_executor._issue_adapter", return_value=FakeAdapter()):
            execute_claimed_op({**self.ops.get(OP_ID), "dispatch": RECOVERY_DISPATCH})
        self.assertEqual(self.ops.get(OP_ID)["state"], "confirmed")

    def test_hint_dispatch_schedules_when_mounted(self) -> None:
        self.inbox.enqueue(
            connector_id=CONNECTOR,
            delivery_id=f"del_{uuid.uuid4().hex[:8]}",
            hints=[
                {
                    "objectKind": "issue",
                    "remoteContainerId": CONTAINER,
                    "externalId": str(ISSUE_NUMBER),
                    "event": "opened",
                }
            ],
        )
        self.conn.commit()
        scheduled = schedule_due_tracker_jobs(
            job_service=self.jobs,
            connect=lambda: self._connect_ctx(),
            comments_schema=self.schema,
            workspace_schema=self.schema,
            force=True,
        )
        kinds = {row["kind"] for row in scheduled}
        self.assertIn(DISPATCH_KIND, kinds)

    @contextmanager
    def _connect_ctx(self):
        conn = psycopg.connect(_dsn(), row_factory=dict_row)
        conn.execute(f'SET search_path TO "{self.schema}", public')
        try:
            yield conn
        finally:
            conn.close()

    def test_dispatch_applies_pending_hints_when_no_ops(self) -> None:
        marker = self._seed_pending_create()
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_ID, int(claimed["fence"]))
        self.ops.schedule(
            OP_ID,
            int(claimed["fence"]),
            next_attempt_at=datetime.now(timezone.utc) + timedelta(hours=1),
            consume_attempt=False,
        )
        issue = _remote_issue(body=f"hint\n{marker}")
        self.inbox.enqueue(
            connector_id=CONNECTOR,
            delivery_id=f"del_{uuid.uuid4().hex[:8]}",
            hints=[
                {
                    "objectKind": "issue",
                    "remoteContainerId": CONTAINER,
                    "externalId": str(ISSUE_NUMBER),
                    "event": "opened",
                }
            ],
        )
        self.conn.commit()

        class Fetcher:
            bot_user_id = BOT_ID
            bot_login = BOT_LOGIN

            def fetch_issue(self, connector_id, container_id, external_id):  # noqa: ANN001
                return issue

            def fetch_comment(self, connector_id, container_id, external_comment_id):  # noqa: ANN001
                raise RuntimeError("not used")

        with patch(
            "app.services.trackers.create_executor._build_inbound_fetcher",
            return_value=Fetcher(),
        ):
            context = FakeContext(
                {
                    "connectorId": CONNECTOR,
                    "remoteContainerId": CONTAINER,
                    "_connect": self._connect_ctx,
                }
            )
            result = tracker_jobs.run_tracker_dispatch_job(context)
        self.assertEqual(result.message, "Applied inbound hints")
        self.assertEqual(self.ops.get(OP_ID)["state"], "confirmed")

    def test_public_visibility_without_ack_pauses_execute(self) -> None:
        marker = self._seed_pending_create()
        self.conn.execute(
            "UPDATE project_trackers SET visibility = 'public' WHERE project_id = 'prj_a'"
        )
        self.conn.commit()
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_ID, int(claimed["fence"]))
        self.conn.commit()

        class FakeAdapter:
            def create_issue(self, dest, draft, op_id):  # noqa: ANN001
                raise AssertionError("must not create without public ack")

        with patch("app.services.trackers.create_executor._issue_adapter", return_value=FakeAdapter()):
            execute_claimed_op(self.ops.get(OP_ID))
        row = self.ops.get(OP_ID)
        self.assertEqual(row["state"], "sent")
        self.assertEqual((row.get("last_error") or {}).get("class"), "auth_lost")


class RecoveryScanUnitTests(unittest.TestCase):
    def test_delayed_acceptance_empty_then_found(self) -> None:
        marker = build_marker(
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            comment_id=COMMENT_ID,
            op_id=OP_ID,
        )
        from app.services.trackers.contracts import Destination

        dest = Destination(
            connectorId=CONNECTOR,
            containerKind="repo",
            containerPath=REPO,
            remoteContainerId=CONTAINER,
            generation=2,
        )
        op = {
            "id": OP_ID,
            "op": "create_issue",
            "sent_at": datetime(2026, 9, 20, 15, 0, tzinfo=timezone.utc),
        }
        first = recover_create_issue(
            op,
            dest=dest,
            comment_id=COMMENT_ID,
            fetch_page=lambda _cursor: ([], None),
            bot_user_id=BOT_ID,
        )
        self.assertEqual(first.kind, RecoveryKind.NOT_FOUND)
        second = recover_create_issue(
            op,
            dest=dest,
            comment_id=COMMENT_ID,
            fetch_page=lambda _cursor: (
                [
                    {
                        "id": int(ISSUE_ID),
                        "number": ISSUE_NUMBER,
                        "body": f"x\n{marker}",
                        "user": {"id": int(BOT_ID)},
                    }
                ],
                None,
            ),
            bot_user_id=BOT_ID,
        )
        self.assertEqual(second.kind, RecoveryKind.FOUND)


if __name__ == "__main__":
    unittest.main()
