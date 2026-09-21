"""TR-62: compose tracker services and register worker execution paths (F3, F5, F7)."""

from __future__ import annotations

import json
import os
import sys
import unittest
import uuid
from contextlib import contextmanager
from pathlib import Path
from unittest import mock
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import comments_schema_migrations  # noqa: E402
from app.services.job_handlers import load_builtin_job_handlers, registered_job_kinds  # noqa: E402
from app.services.job_runtime import RetryableJobError  # noqa: E402
from app.services.trackers.composition import (  # noqa: E402
    TrackerRuntime,
    get_tracker_runtime,
    has_outbound_executor,
    initialize_tracker_composition,
    reset_tracker_runtime,
)
from app.services.trackers.create_executor import set_connect_factory, unmount_create_executor  # noqa: E402
from app.services.trackers.contracts import RemoteChange, UpdateCursor  # noqa: E402
from app.services.trackers.inbox_store import InboxStore, apply_schema as apply_inbox_schema  # noqa: E402
from app.services.trackers.jobs import run_tracker_dispatch_job, run_tracker_poll_job, run_tracker_sweep_job  # noqa: E402
from app.services.trackers.migrations import migrate_workspace_tracker_tables  # noqa: E402
from app.services.trackers.op_store import OpStore, apply_schema as apply_op_schema  # noqa: E402
from app.services.trackers import scheduler as tracker_scheduler  # noqa: E402
from app.services.trackers.scheduler import (  # noqa: E402
    DISPATCH_KIND,
    POLL_KIND,
    SWEEP_KIND,
    hints_applier_mounted,
    mount_hints_applier,
    reset_scheduler_throttle,
)
from app.services.trackers.store import TrackerStore  # noqa: E402
from test_tracker_tr_28 import (  # noqa: E402
    BOT_ID,
    BOT_LOGIN,
    COMMENT_ID,
    CONNECTOR,
    CONTAINER,
    ISSUE,
    ISSUE_ID,
    ISSUE_NUMBER,
    _remote_issue,
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
F3 = json.loads((DOCS / "fixtures" / "F03.json").read_text(encoding="utf-8"))
F5 = json.loads((DOCS / "fixtures" / "F05.json").read_text(encoding="utf-8"))
F7 = json.loads((DOCS / "fixtures" / "F07.json").read_text(encoding="utf-8"))


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


class FakeContext:
    def __init__(self, payload: dict, worker_id: str = "w1") -> None:
        self.payload = payload
        self.worker_id = worker_id
        self.job_id = "job-tr62"
        self.fence = 1

    def check_cancelled(self) -> None:
        return None


class CompositionUnitTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_tracker_runtime()
        reset_scheduler_throttle()
        mount_hints_applier(False)

    def test_fixture_catalog_present(self) -> None:
        self.assertIn("F3.bot_identity_captured", {case["id"] for case in F3["cases"]})
        self.assertIn("F5.claim_of_sent_is_recovery", {case["id"] for case in F5["cases"]})
        self.assertIn("F7.throttling", {case["id"] for case in F7["cases"]})

    def test_initialize_mounts_runtime_and_handlers(self) -> None:
        initialize_tracker_composition()
        self.assertTrue(hints_applier_mounted())
        self.assertTrue(tracker_scheduler.hint_dispatch_enabled())
        self.assertTrue(has_outbound_executor())
        self.assertIsNotNone(get_tracker_runtime())
        kinds = registered_job_kinds()
        if DISPATCH_KIND not in kinds:
            load_builtin_job_handlers()
            kinds = registered_job_kinds()
        self.assertIn(DISPATCH_KIND, kinds)
        self.assertIn(POLL_KIND, kinds)
        self.assertIn(SWEEP_KIND, kinds)

    def test_reset_unmounts_create_executor(self) -> None:
        initialize_tracker_composition()
        self.assertTrue(has_outbound_executor())
        reset_tracker_runtime()
        self.assertFalse(has_outbound_executor())

    def test_main_registers_composition_bootstrap(self) -> None:
        source = (Path(__file__).resolve().parents[1] / "app" / "main.py").read_text(encoding="utf-8")
        self.assertIn("initialize_tracker_composition", source)

    def test_job_runner_registers_composition_bootstrap(self) -> None:
        source = (Path(__file__).resolve().parents[1] / "app" / "job_runner.py").read_text(encoding="utf-8")
        self.assertIn("initialize_tracker_composition", source)
        self.assertIn("load_builtin_job_handlers", source)


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class TrackerCompositionPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_tracker_runtime()
        reset_scheduler_throttle()
        initialize_tracker_composition()
        self.schema = f"tr62_{uuid.uuid4().hex[:12]}"
        self.conn = psycopg.connect(_dsn(), row_factory=dict_row)
        self.addCleanup(self._cleanup)
        self.conn.execute(f'CREATE SCHEMA "{self.schema}"')
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
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
        comments_schema_migrations.apply_comments_migrations(self.conn)
        migrate_workspace_tracker_tables(self.conn)
        apply_op_schema(self.conn)
        apply_inbox_schema(self.conn)
        self.conn.execute("CREATE SCHEMA IF NOT EXISTS workspace")
        self.conn.execute("SET search_path TO workspace, public")
        migrate_workspace_tracker_tables(self.conn)
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        self.conn.commit()
        self.store = TrackerStore(self.conn)
        self.ops = OpStore(self.conn)
        self.inbox = InboxStore(self.conn)
        set_connect_factory(self._factory)
        self.addCleanup(lambda: set_connect_factory(None))

    def _cleanup(self) -> None:
        try:
            self.conn.rollback()
            self.conn.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
            self.conn.execute("DROP SCHEMA IF EXISTS workspace CASCADE")
            self.conn.commit()
        finally:
            self.conn.close()

    @contextmanager
    def _factory(self):
        yield self.conn

    def _seed_destination(self, *, paused: bool = False, with_credentials: bool = False) -> None:
        self.store.upsert_connector(
            connector_id=CONNECTOR,
            provider="github",
            instance_kind="github.com",
            bot_forge_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
            credential_envelope="env:fake" if with_credentials else None,
        )
        if paused:
            self.conn.execute(
                "UPDATE tracker_connectors SET paused = TRUE, paused_reason = 'admin' WHERE id = %s",
                (CONNECTOR,),
            )
        self.store.set_project_tracker(
            project_tracker_id="pt_tr62",
            project_id="proj_tr62",
            connector_id=CONNECTOR,
            container_kind="repo",
            container_path="acme/widget",
            remote_container_id=CONTAINER,
            generation=1,
        )
        self._mirror_project_tracker_to_workspace()
        self.conn.commit()

    def _mirror_project_tracker_to_workspace(self) -> None:
        connector = self.conn.execute(
            "SELECT * FROM tracker_connectors WHERE id = %s",
            (CONNECTOR,),
        ).fetchone()
        if connector is not None:
            self.conn.execute(
                """
                INSERT INTO workspace.tracker_connectors (
                    id, provider, instance_kind, bot_forge_user_id, bot_login,
                    credential_envelope, paused, paused_reason
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    provider = EXCLUDED.provider,
                    instance_kind = EXCLUDED.instance_kind,
                    bot_forge_user_id = EXCLUDED.bot_forge_user_id,
                    bot_login = EXCLUDED.bot_login,
                    credential_envelope = EXCLUDED.credential_envelope,
                    paused = EXCLUDED.paused,
                    paused_reason = EXCLUDED.paused_reason
                """,
                (
                    connector["id"],
                    connector["provider"],
                    connector["instance_kind"],
                    connector.get("bot_forge_user_id"),
                    connector.get("bot_login"),
                    connector.get("credential_envelope"),
                    connector.get("paused", False),
                    connector.get("paused_reason"),
                ),
            )
        row = self.conn.execute(
            """
            SELECT id, project_id, connector_id, container_kind, container_path,
                   remote_container_id, destination_generation, visibility
            FROM project_trackers
            WHERE id = %s
            """,
            ("pt_tr62",),
        ).fetchone()
        if row is None:
            return
        self.conn.execute(
            """
            INSERT INTO workspace.project_trackers (
                id, project_id, connector_id, container_kind, container_path,
                remote_container_id, destination_generation, visibility
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (project_id) DO UPDATE SET
                connector_id = EXCLUDED.connector_id,
                container_kind = EXCLUDED.container_kind,
                container_path = EXCLUDED.container_path,
                remote_container_id = EXCLUDED.remote_container_id,
                destination_generation = EXCLUDED.destination_generation,
                visibility = EXCLUDED.visibility
            """,
            (
                row["id"],
                row["project_id"],
                row["connector_id"],
                row["container_kind"],
                row["container_path"],
                row["remote_container_id"],
                row["destination_generation"],
                row["visibility"],
            ),
        )

    def test_poll_job_enqueues_and_applies_hints(self) -> None:
        self._seed_destination()
        changes = [
            RemoteChange(
                objectKind="issue",
                remoteContainerId=CONTAINER,
                externalId=ISSUE_ID,
                observedUpdatedAt="2026-09-20T16:05:00Z",
            )
        ]

        def list_updates(_dest, _cursor):
            return changes, UpdateCursor(since="2026-09-20T16:05:00Z")

        bundle = mock.Mock()
        bundle.list_updates = list_updates
        bundle.bot_user_id = BOT_ID
        bundle.bot_login = BOT_LOGIN
        bundle.destination = mock.Mock(return_value=mock.Mock())
        fetcher = mock.Mock()
        fetcher.fetch_issue.return_value = _remote_issue(body="issue body")
        registry = mock.Mock()
        registry.bundle_for_connector.return_value = bundle
        registry.inbound_fetcher.return_value = fetcher

        with mock.patch("app.services.trackers.composition.get_tracker_runtime") as get_runtime:
            runtime = TrackerRuntime(registry=registry)
            get_runtime.return_value = runtime
            context = FakeContext(
                {
                    "connectorId": CONNECTOR,
                    "remoteContainerId": CONTAINER,
                    "_connect": self._factory,
                }
            )
            result = run_tracker_poll_job(context)
        self.assertIn("Poll", result.message)
        self.assertGreaterEqual(result.details.get("hintsEnqueued", 0), 1)
        row = self.conn.execute(
            "SELECT state FROM remote_hints WHERE connector_id = %s",
            (CONNECTOR,),
        ).fetchone()
        self.assertIn(row["state"], {"applied", "ignored", "pending"})

    def test_sweep_job_runs_without_provider_credentials(self) -> None:
        self._seed_destination(with_credentials=False)
        self.conn.execute(
            "INSERT INTO comments(id, project_id, author, content) VALUES (%s,%s,%s,%s)",
            (COMMENT_ID, "proj_tr62", "Priya", "local only"),
        )
        self.store.insert_thread(
            thread_id="thr_tr62",
            comment_id=COMMENT_ID,
            project_tracker_id="pt_tr62",
            destination_generation=1,
            connector_id=CONNECTOR,
            remote_container_id=CONTAINER,
            external_id=ISSUE_ID,
            external_number=ISSUE_NUMBER,
        )
        self.conn.commit()
        context = FakeContext(
            {
                "connectorId": CONNECTOR,
                "remoteContainerId": CONTAINER,
                "_connect": self._factory,
            }
        )
        result = run_tracker_sweep_job(context)
        self.assertIn("sweep", result.message.casefold())

    def test_dispatch_without_credentials_surfaces_provider_error(self) -> None:
        self._seed_destination(with_credentials=False)
        self.conn.execute(
            "INSERT INTO comments(id, project_id, author, content) VALUES (%s,%s,%s,%s)",
            (COMMENT_ID, "proj_tr62", "Priya", "needs forge"),
        )
        self.store.insert_thread(
            thread_id="thr_tr62_dispatch",
            comment_id=COMMENT_ID,
            project_tracker_id="pt_tr62",
            destination_generation=1,
            connector_id=CONNECTOR,
            remote_container_id=CONTAINER,
            external_id="pending",
        )
        self.ops.insert(
            op_id="op_tr62",
            tracked_thread_id="thr_tr62_dispatch",
            op="create_issue",
            destination_generation=1,
        )
        self.conn.commit()
        context = FakeContext(
            {
                "connectorId": CONNECTOR,
                "remoteContainerId": CONTAINER,
                "_connect": self._factory,
            }
        )
        result = run_tracker_dispatch_job(context)
        self.assertEqual(result.message, "Dispatched")
        row = self.ops.get("op_tr62")
        self.assertEqual(row["last_error"]["class"], "auth_lost")

    def test_dispatch_defers_hints_when_create_executor_unmounted(self) -> None:
        unmount_create_executor()
        self._seed_destination(with_credentials=False)
        self.inbox.enqueue(
            connector_id=CONNECTOR,
            delivery_id="del_tr62_unmounted",
            hints=[
                {
                    "objectKind": "issue",
                    "remoteContainerId": CONTAINER,
                    "externalId": ISSUE,
                    "event": "edited",
                }
            ],
        )
        self.conn.commit()
        context = FakeContext(
            {
                "connectorId": CONNECTOR,
                "remoteContainerId": CONTAINER,
                "_connect": self._factory,
            }
        )
        with self.assertRaises(RetryableJobError) as caught:
            run_tracker_dispatch_job(context)
        self.assertEqual(caught.exception.code, "tracker_hints_deferred")

    def test_paused_connector_skips_poll_without_error(self) -> None:
        self._seed_destination(paused=True)
        context = FakeContext(
            {
                "connectorId": CONNECTOR,
                "remoteContainerId": CONTAINER,
                "_connect": self._factory,
            }
        )
        result = run_tracker_poll_job(context)
        self.assertIn("Paused", result.message)


if __name__ == "__main__":
    unittest.main()
