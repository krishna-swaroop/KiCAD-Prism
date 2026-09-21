"""TR-14: tracker jobs and durable scheduling (F5, F7)."""

from __future__ import annotations

import json
import os
import sys
import unittest
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import comments_schema_migrations  # noqa: E402
from app.services.job_handlers import (  # noqa: E402
    get_job_handler,
    load_builtin_job_handlers,
    registered_job_kinds,
)
from app.services.job_runtime import JobCancelled, RetryableJobError  # noqa: E402
from app.services.trackers.inbox_store import InboxStore, apply_schema as apply_inbox_schema  # noqa: E402
from app.services.trackers.errors import ProviderError  # noqa: E402
from app.services.trackers.jobs import (  # noqa: E402
    _handle_claimed_op,
    _record_executor_outcome,
    run_tracker_dispatch_job,
)
from app.services.trackers.migrations import migrate_workspace_tracker_tables  # noqa: E402
from app.services.trackers.op_store import (  # noqa: E402
    EXECUTE_DISPATCH,
    RECOVERY_DISPATCH,
    OpStore,
    StaleFence,
    apply_schema as apply_op_schema,
)
from app.services.trackers.scheduler import (  # noqa: E402
    DISPATCH_KIND,
    OUTBOX_POLL_SECONDS,
    POLL_KIND,
    POLL_QUIET_SECONDS,
    POLL_WHILE_WEBHOOK_FRESH_SECONDS,
    SWEEP_KIND,
    SWEEP_QUIET_SECONDS,
    SWEEP_WHILE_ACTIVE_SECONDS,
    TRACKER_PRIORITY,
    TRACKER_RESOURCE,
    TRACKER_RESOURCE_CAPACITY,
    artifact_key,
    poll_interval_seconds,
    mount_hints_applier,
    reset_scheduler_throttle,
    schedule_due_tracker_jobs,
    sweep_interval_seconds,
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


class FakeJobs:
    def __init__(self) -> None:
        self.rows: list[dict] = []

    def enqueue(self, kind, payload=None, **kwargs):  # noqa: ANN001
        key = kwargs.get("artifact_key")
        for row in self.rows:
            if (
                row["kind"] == kind
                and row["artifact_key"] == key
                and row["status"] in {"queued", "running", "retry_wait"}
            ):
                return {**row, "deduplicated": True}
        job = {
            "kind": kind,
            "payload": dict(payload or {}),
            "artifact_key": key,
            "priority": kwargs.get("priority"),
            "resources": dict(kwargs.get("resources") or {}),
            "status": "queued",
            "deduplicated": False,
        }
        self.rows.append(job)
        return job


class FakeContext:
    def __init__(self, payload: dict, worker_id: str = "w1", *, cancelled: bool = False) -> None:
        self.payload = payload
        self.worker_id = worker_id
        self.job_id = "job-1"
        self.fence = 1
        self._cancelled = cancelled

    def check_cancelled(self) -> None:
        if self._cancelled:
            raise JobCancelled("Cancellation requested")


class RegistrationTests(unittest.TestCase):
    def test_handlers_register_and_worker_budget_is_bounded(self) -> None:
        from app import prism_worker

        load_builtin_job_handlers()
        kinds = registered_job_kinds()
        self.assertIn(DISPATCH_KIND, kinds)
        self.assertIn(POLL_KIND, kinds)
        self.assertIn(SWEEP_KIND, kinds)
        capacities = prism_worker.PrismWorker.resource_capacities()
        self.assertEqual(capacities[TRACKER_RESOURCE], TRACKER_RESOURCE_CAPACITY)
        self.assertLess(TRACKER_RESOURCE_CAPACITY, capacities["prism_worker"])
        worker = prism_worker.PrismWorker("prism")
        catalog = prism_worker.PrismWorker("catalog")
        with mock.patch("app.services.trackers.scheduler.schedule_due_tracker_jobs") as sched:
            worker.schedule_tracker_jobs()
            catalog.schedule_tracker_jobs()
        sched.assert_called_once()

    def test_fixture_cases_are_present(self) -> None:
        ids = {case["id"] for case in F5["cases"]}
        self.assertIn("F5.duplicate_workers", ids)
        self.assertIn("F5.stale_lease_on_sent", ids)
        self.assertIn("F5.claim_of_sent_is_recovery", ids)
        self.assertIn("F7.throttling", {case["id"] for case in F7["cases"]})


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class TrackerSchedulerPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_scheduler_throttle()
        mount_hints_applier(False)
        self.schema = f"tr14_{uuid.uuid4().hex[:12]}"
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
        self.conn.commit()
        self.store = TrackerStore(self.conn)
        self.ops = OpStore(self.conn)
        self.inbox = InboxStore(self.conn)
        self.jobs = FakeJobs()

    def _cleanup(self) -> None:
        try:
            self.conn.rollback()
            self.conn.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
            self.conn.commit()
        finally:
            self.conn.close()

    def _connect(self):
        conn = psycopg.connect(_dsn(), row_factory=dict_row)
        conn.execute(f'SET search_path TO "{self.schema}", public')
        return conn

    @contextmanager
    def _factory(self):
        conn = self._connect()
        try:
            yield conn
        finally:
            conn.close()

    def _seed(self, *, op_id: str = "op_1", paused: bool = False) -> None:
        self.store.upsert_connector(
            connector_id="cn_gh1", provider="github", instance_kind="github.com"
        )
        if paused:
            self.conn.execute(
                "UPDATE tracker_connectors SET paused = TRUE, paused_reason = 'admin' WHERE id = 'cn_gh1'"
            )
        self.store.set_project_tracker(
            project_tracker_id="pt_a",
            project_id="prj_a",
            connector_id="cn_gh1",
            container_kind="repo",
            container_path="acme/openswitch",
            remote_container_id="111",
            generation=2,
        )
        self.conn.execute(
            "INSERT INTO comments(id, project_id, author, content) VALUES (%s,%s,%s,%s)",
            ("c_1", "prj_a", "Priya", "stub"),
        )
        self.store.insert_thread(
            thread_id="tt_1",
            comment_id="c_1",
            project_tracker_id="pt_a",
            destination_generation=2,
            connector_id="cn_gh1",
            remote_container_id="111",
            external_id="pending",
        )
        self.ops.insert(
            op_id=op_id,
            tracked_thread_id="tt_1",
            op="create_issue",
            destination_generation=2,
        )
        self.conn.commit()

    def test_restart_schedules_due_ops_without_api_wakeup(self) -> None:
        self._seed()
        scheduled = schedule_due_tracker_jobs(
            job_service=self.jobs,
            connect=self._factory,
            comments_schema=self.schema,
            workspace_schema=self.schema,
            force=True,
        )
        dispatch = [row for row in scheduled if row["kind"] == DISPATCH_KIND]
        self.assertEqual(len(dispatch), 1)
        self.assertEqual(dispatch[0]["priority"], TRACKER_PRIORITY)
        self.assertEqual(dispatch[0]["resources"], {TRACKER_RESOURCE: 1})
        self.assertEqual(
            dispatch[0]["artifact_key"],
            artifact_key(DISPATCH_KIND, "cn_gh1", "111"),
        )
        again = schedule_due_tracker_jobs(
            job_service=self.jobs,
            connect=self._factory,
            comments_schema=self.schema,
            workspace_schema=self.schema,
            force=True,
        )
        dispatch_again = [row for row in again if row["kind"] == DISPATCH_KIND]
        self.assertTrue(dispatch_again[0]["deduplicated"])
        self.assertEqual(len([row for row in self.jobs.rows if row["kind"] == DISPATCH_KIND]), 1)

    def test_paused_connector_retains_ops_without_scheduling(self) -> None:
        self._seed(paused=True)
        scheduled = schedule_due_tracker_jobs(
            job_service=self.jobs,
            connect=self._factory,
            comments_schema=self.schema,
            workspace_schema=self.schema,
            force=True,
        )
        self.assertEqual(scheduled, [])
        row = self.ops.get("op_1")
        self.assertEqual(row["state"], "pending")
        self.assertEqual(row["attempts"], 0)

    def test_rate_limited_op_waits_without_tight_loop(self) -> None:
        self._seed()
        resume = datetime.now(timezone.utc) + timedelta(minutes=10)
        self.conn.execute(
            """
            UPDATE sync_ops
            SET last_error = %s::jsonb, next_attempt_at = %s
            WHERE id = 'op_1'
            """,
            (
                json.dumps({"class": "rate_limited", "message": "retry later", "resumeAt": resume.isoformat(), "retryable": True}),
                resume,
            ),
        )
        self.conn.commit()
        scheduled = schedule_due_tracker_jobs(
            job_service=self.jobs,
            connect=self._factory,
            comments_schema=self.schema,
            workspace_schema=self.schema,
            force=True,
        )
        self.assertEqual([row for row in scheduled if row["kind"] == DISPATCH_KIND], [])

    def test_duplicate_workers_one_claim(self) -> None:  # F5.duplicate_workers
        self._seed()
        a = self._connect()
        b = self._connect()
        try:
            first = OpStore(a).claim("worker-a")
            a.commit()
            second = OpStore(b).claim("worker-b")
            b.commit()
        finally:
            a.close()
            b.close()
        self.assertIsNotNone(first)
        self.assertIsNone(second)
        self.assertEqual(first["dispatch"], EXECUTE_DISPATCH)

    def test_claim_of_sent_is_recovery_and_stale_fence_cannot_confirm(self) -> None:
        self._seed()
        claimed = self.ops.claim("worker-a")
        sent = self.ops.mark_sent("op_1", int(claimed["fence"]))
        self.conn.execute(
            "UPDATE sync_ops SET claimed_by = NULL, lease_expires_at = NOW() - INTERVAL '1 second' WHERE id = 'op_1'"
        )
        self.conn.commit()
        recovered = self.ops.claim("worker-b")
        self.assertEqual(recovered["dispatch"], RECOVERY_DISPATCH)
        self.assertNotEqual(recovered["dispatch"], EXECUTE_DISPATCH)
        with self.assertRaises(StaleFence):
            self.ops.confirm("op_1", int(sent["fence"]), external_result_id="412")
        before = self.ops.get("op_1")
        result = _handle_claimed_op(self.ops, recovered, paused=False, executor=None)
        self.assertIn("Recovery", result.message)
        after = self.ops.get("op_1")
        self.assertEqual(after["state"], "sent")
        self.assertEqual(after["attempts"], before["attempts"])

    def test_handler_honors_cancellation(self) -> None:
        self._seed()
        context = FakeContext({"connectorId": "cn_gh1", "_connect": self._factory}, cancelled=True)
        with self.assertRaises(JobCancelled):
            run_tracker_dispatch_job(context)

    def test_hint_only_destinations_dispatch_once_applier_mounted(self) -> None:
        self.store.upsert_connector(
            connector_id="cn_gh1", provider="github", instance_kind="github.com"
        )
        self.conn.commit()
        self.inbox.enqueue(
            connector_id="cn_gh1",
            delivery_id="del_1",
            hints=[{"objectKind": "issue", "remoteContainerId": "111", "externalId": "412", "event": "edited"}],
        )
        self.conn.commit()
        scheduled = schedule_due_tracker_jobs(
            job_service=self.jobs,
            connect=self._factory,
            comments_schema=self.schema,
            workspace_schema=self.schema,
            force=True,
        )
        self.assertEqual(scheduled, [])
        mount_hints_applier(True)
        scheduled = schedule_due_tracker_jobs(
            job_service=self.jobs,
            connect=self._factory,
            comments_schema=self.schema,
            workspace_schema=self.schema,
            force=True,
        )
        self.assertEqual(
            [(row["kind"], row["payload"]["connectorId"], row["payload"]["remoteContainerId"]) for row in scheduled],
            [(DISPATCH_KIND, "cn_gh1", "111")],
        )

    def test_h2_sent_is_durable_before_executor_io(self) -> None:
        self._seed()
        seen: dict[str, object] = {}

        def executor(_claimed):  # noqa: ANN001
            other = self._connect()
            try:
                row = other.execute("SELECT state, sent_at FROM sync_ops WHERE id = 'op_1'").fetchone()
                seen["state"] = row["state"]
                seen["sent_at"] = row["sent_at"]
            finally:
                other.close()

        context = FakeContext(
            {"connectorId": "cn_gh1", "remoteContainerId": "111", "_connect": self._factory, "_executor": executor}
        )
        result = run_tracker_dispatch_job(context)
        self.assertEqual(result.message, "Dispatched")
        self.assertEqual(seen["state"], "sent")
        self.assertIsNotNone(seen["sent_at"])
        after = self.ops.get("op_1")
        self.assertEqual(after["state"], "sent")

    def test_m3_dispatch_does_not_ignore_inbound_hints(self) -> None:
        self.store.upsert_connector(connector_id="cn_gh1", provider="github", instance_kind="github.com")
        self.conn.commit()
        self.inbox.enqueue(
            connector_id="cn_gh1",
            delivery_id="del_keep",
            hints=[{"objectKind": "issue", "remoteContainerId": "111", "externalId": "412", "event": "edited"}],
        )
        self.conn.commit()
        context = FakeContext({"connectorId": "cn_gh1", "remoteContainerId": "111", "_connect": self._factory})
        with self.assertRaises(RetryableJobError) as caught:
            run_tracker_dispatch_job(context)
        self.assertEqual(caught.exception.code, "tracker_hints_deferred")
        self.assertEqual(caught.exception.retry_after_seconds, OUTBOX_POLL_SECONDS)
        row = self.conn.execute("SELECT state FROM remote_hints WHERE delivery_id = 'del_keep'").fetchone()
        self.assertEqual(row["state"], "pending")

    def test_m4_poll_and_sweep_follow_contract_cadence(self) -> None:
        self._seed()
        self.assertEqual(poll_interval_seconds(self.conn, "cn_gh1"), POLL_QUIET_SECONDS)
        self.inbox.enqueue(
            connector_id="cn_gh1",
            delivery_id="del_hook",
            hints=[{"objectKind": "issue", "remoteContainerId": "111", "externalId": "412", "event": "edited"}],
        )
        self.conn.commit()
        self.assertEqual(poll_interval_seconds(self.conn, "cn_gh1"), POLL_WHILE_WEBHOOK_FRESH_SECONDS)
        self.assertEqual(sweep_interval_seconds(self.conn, "cn_gh1", "111"), SWEEP_WHILE_ACTIVE_SECONDS)
        self.conn.execute("UPDATE sync_ops SET state = 'confirmed', claimed_by = NULL WHERE id = 'op_1'")
        self.conn.commit()
        # Recent hint still counts as 24h activity.
        self.assertEqual(sweep_interval_seconds(self.conn, "cn_gh1", "111"), SWEEP_WHILE_ACTIVE_SECONDS)
        self.conn.execute("UPDATE remote_hints SET received_at = NOW() - INTERVAL '25 hours'")
        self.conn.execute("UPDATE remote_deliveries SET received_at = NOW() - INTERVAL '25 hours'")
        self.conn.commit()
        self.assertEqual(poll_interval_seconds(self.conn, "cn_gh1"), POLL_QUIET_SECONDS)
        self.assertEqual(sweep_interval_seconds(self.conn, "cn_gh1", "111"), SWEEP_QUIET_SECONDS)
        self.conn.execute("UPDATE remote_hints SET state = 'applied'")
        self.conn.commit()
        scheduled = schedule_due_tracker_jobs(
            job_service=self.jobs,
            connect=self._factory,
            comments_schema=self.schema,
            workspace_schema=self.schema,
            force=True,
        )
        kinds = {row["kind"] for row in scheduled}
        self.assertIn(POLL_KIND, kinds)
        self.assertIn(SWEEP_KIND, kinds)

    def test_scheduler_scan_is_throttled_to_30_seconds(self) -> None:
        self._seed()
        first = schedule_due_tracker_jobs(
            job_service=self.jobs,
            connect=self._factory,
            comments_schema=self.schema,
            workspace_schema=self.schema,
        )
        self.assertEqual(len([row for row in first if row["kind"] == DISPATCH_KIND]), 1)
        second = schedule_due_tracker_jobs(
            job_service=self.jobs,
            connect=self._factory,
            comments_schema=self.schema,
            workspace_schema=self.schema,
        )
        self.assertEqual(second, [])

    def test_executor_timeout_after_sent_enters_quarantine_not_fail(self) -> None:
        self._seed()
        claimed = self.ops.claim("worker-a")
        sent = self.ops.mark_sent("op_1", int(claimed["fence"]))
        self.conn.commit()
        timeout = ProviderError(
            "transient",
            "Request timed out; outcome unknown.",
            retryable=False,
        )
        _record_executor_outcome(
            self.ops,
            "op_1",
            int(sent["fence"]),
            timeout,
            dispatch=EXECUTE_DISPATCH,
        )
        row = self.ops.get("op_1")
        self.assertEqual(row["state"], "quarantine")
        self.assertNotEqual(row["state"], "failed")

    def test_invalid_request_on_execute_dispatch_fails_immediately(self) -> None:
        self._seed()
        claimed = self.ops.claim("worker-a")
        sent = self.ops.mark_sent("op_1", int(claimed["fence"]))
        self.conn.commit()
        bad_request = ProviderError("invalid_request", "Forge rejected the request.")
        _record_executor_outcome(
            self.ops,
            "op_1",
            int(sent["fence"]),
            bad_request,
            dispatch=EXECUTE_DISPATCH,
        )
        row = self.ops.get("op_1")
        self.assertEqual(row["state"], "failed")
        self.assertEqual(row["last_error"]["class"], "invalid_request")

    def test_executor_confirm_uses_returned_external_id(self) -> None:
        self._seed()

        def executor(_claimed):  # noqa: ANN001
            return "412"

        context = FakeContext(
            {
                "connectorId": "cn_gh1",
                "remoteContainerId": "111",
                "_connect": self._factory,
                "_executor": executor,
            }
        )
        result = run_tracker_dispatch_job(context)
        self.assertEqual(result.message, "Dispatched")
        row = self.ops.get("op_1")
        self.assertEqual(row["state"], "confirmed")
        self.assertEqual(row["external_result_id"], "412")


if __name__ == "__main__":
    unittest.main()
