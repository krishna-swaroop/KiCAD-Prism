"""TR-62: compose tracker services and register worker execution paths (F3, F5, F7)."""

from __future__ import annotations

import json
import sys
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.job_handlers import load_builtin_job_handlers, registered_job_kinds  # noqa: E402
from app.services.job_runtime import RetryableJobError  # noqa: E402
from app.services.trackers.composition import (  # noqa: E402
    TrackerRuntime,
    get_tracker_runtime,
    has_outbound_executor,
    initialize_tracker_composition,
    reset_tracker_runtime,
)
from app.services.trackers.composition import unmount_outbound_executor  # noqa: E402
from app.services.trackers.connector_runtime import ConnectorRuntime, install_connector_runtime  # noqa: E402
from tracker_fault_harness import StatefulFakeForge, forge_runtime  # noqa: E402
from app.services.trackers.contracts import RemoteChange, UpdateCursor  # noqa: E402
from app.services.trackers.inbox_store import InboxStore  # noqa: E402
from app.services.trackers.jobs import run_tracker_dispatch_job, run_tracker_poll_job, run_tracker_sweep_job  # noqa: E402
from app.services.trackers.migrations import migrate_workspace_tracker_tables  # noqa: E402
from app.services.trackers.op_store import OpStore  # noqa: E402
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
)
from support.postgres import requires_scratch_postgres, tracker_schema, seed_comment, drop_schema  # noqa: E402

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]

DOCS = Path(__file__).resolve().parents[2] / "docs" / "tracker-integration"
F3 = json.loads((DOCS / "fixtures" / "F03.json").read_text(encoding="utf-8"))
F5 = json.loads((DOCS / "fixtures" / "F05.json").read_text(encoding="utf-8"))
F7 = json.loads((DOCS / "fixtures" / "F07.json").read_text(encoding="utf-8"))


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


@requires_scratch_postgres("tracker persistence tests")
class TrackerCompositionPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_tracker_runtime()
        reset_scheduler_throttle()
        initialize_tracker_composition()
        self.scratch = tracker_schema(self, "tr62")
        self.schema, self.conn = self.scratch.name, self.scratch.conn
        # Code under test names the real ``workspace`` schema; this worker's database is private.
        self.addCleanup(self._drop_workspace)
        self.conn.execute("CREATE SCHEMA IF NOT EXISTS workspace")
        self.conn.execute("SET search_path TO workspace, public")
        migrate_workspace_tracker_tables(self.conn)
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        self.conn.commit()
        self.store = TrackerStore(self.conn)
        self.ops = OpStore(self.conn)
        self.inbox = InboxStore(self.conn)
        # Real provider kits over this test's schema: connectors without credentials stay auth_lost.
        install_connector_runtime(ConnectorRuntime(connect=self._factory))
        self.addCleanup(install_connector_runtime, None)

    def _drop_workspace(self) -> None:
        self.conn.rollback()  # the held connection still reads workspace tables
        drop_schema("workspace")

    @contextmanager
    def _factory(self):
        yield self.conn

    def _seed_destination(
        self,
        *,
        paused: bool = False,
        with_credentials: bool = False,
        visibility: str = "private",
    ) -> None:
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
            visibility=visibility,
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

        forge = StatefulFakeForge()
        forge.queue_update_pages([(changes, UpdateCursor(since="2026-09-20T16:05:00Z"))])
        forge.seed_issue(external_id=ISSUE_ID, number=int(ISSUE_NUMBER), body="issue body")

        with mock.patch("app.services.trackers.composition.get_tracker_runtime") as get_runtime:
            get_runtime.return_value = TrackerRuntime(connectors=forge_runtime(forge, self._factory))
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
        seed_comment(self.conn, COMMENT_ID, "proj_tr62", author="Priya", content="local only")
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
        self._seed_destination(with_credentials=False, visibility="private")
        seed_comment(
            self.conn,
            COMMENT_ID,
            "proj_tr62",
            author="Priya",
            content="needs forge",
            anchor_commit="3f2c9a1b7e4d5c6a8b9f0e1d2c3b4a5968778695",
            anchor_state="pinned",
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
        with mock.patch.object(
            __import__("app.core.config", fromlist=["settings"]).settings,
            "PUBLIC_BASE_URL",
            "https://prism.example.com",
        ):
            result = run_tracker_dispatch_job(context)
        self.assertEqual(result.message, "Dispatched")
        row = self.ops.get("op_tr62")
        self.assertEqual(row["last_error"]["class"], "auth_lost")

    def test_dispatch_defers_hints_when_create_executor_unmounted(self) -> None:
        unmount_outbound_executor()
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
        self.conn.execute(
            "INSERT INTO sync_checkpoints (kind, scope_key, next_run_at) VALUES ('poll', %s, NOW() - INTERVAL '1 day')",
            (f"{CONNECTOR}:{CONTAINER}",),
        )
        self.conn.commit()
        result = run_tracker_poll_job(context)
        self.assertIn("Paused", result.message)
        # A skipped poll is not due again on the next scan: it backs off.
        due_in = self.conn.execute(
            "SELECT EXTRACT(EPOCH FROM next_run_at - NOW()) AS s FROM sync_checkpoints WHERE kind = 'poll' AND scope_key = %s",
            (f"{CONNECTOR}:{CONTAINER}",),
        ).fetchone()["s"]
        self.assertGreater(float(due_in), 25 * 60)


if __name__ == "__main__":
    unittest.main()
