"""R3-H1/H2: job_runner mounts composition; create+reply via dispatch table."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.job_handlers import get_job_handler, load_builtin_job_handlers  # noqa: E402
from app.services.trackers.composition import (  # noqa: E402
    execute_outbound_op,
    has_outbound_executor,
    initialize_tracker_composition,
    reset_tracker_runtime,
)
from app.services.trackers.jobs import _executor as jobs_executor  # noqa: E402
from app.services.trackers.op_store import OpStore  # noqa: E402
from app.services.trackers.provenance import body_hash  # noqa: E402
from app.services.trackers.reply_mutations import encode_reply_target  # noqa: E402
from app.services.trackers.scheduler import DISPATCH_KIND  # noqa: E402
from app.services.trackers.store import TrackerStore  # noqa: E402
from tracker_fault_harness import (  # noqa: E402
    COMMENT_ID,
    CONNECTOR,
    CONTAINER,
    DisposableSchema,
    EXT_COMMENT,
    ISSUE_ID,
    ISSUE_NUMBER,
    POSTGRES_URL,
    PROJECT_ID,
    REPLY_ID,
    SHARED_APPLICATION_DATABASE,
    StatefulFakeForge,
    THREAD_ID,
    install_fake_provider,
    seed_comment_row,
    seed_destination,
)

try:
    import psycopg
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]

OP_CREATE = "op_jr_create"
OP_REPLY = "op_jr_reply"


class FakeContext:
    def __init__(self, payload: dict, worker_id: str = "w-job-runner") -> None:
        self.payload = payload
        self.worker_id = worker_id
        self.job_id = "job-r3-h1"
        self.fence = 1

    def check_cancelled(self) -> None:
        return None


class JobRunnerMountUnitTests(unittest.TestCase):
    def test_job_runner_bootstraps_composition_next_to_handlers(self) -> None:
        import app.job_runner as job_runner

        source = Path(job_runner.__file__).read_text(encoding="utf-8")
        self.assertIn("load_builtin_job_handlers", source)
        self.assertIn("initialize_tracker_composition", source)
        # Mount must sit beside handler load inside execute(), not only on the API.
        execute_src = source[source.index("def execute") : source.index("def main")]
        self.assertLess(
            execute_src.index("load_builtin_job_handlers"),
            execute_src.index("initialize_tracker_composition"),
        )

    def test_unmounted_executor_returns_none(self) -> None:
        reset_tracker_runtime()
        self.assertFalse(has_outbound_executor())
        self.assertIsNone(jobs_executor(FakeContext({})))


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class JobRunnerDispatchTablePostgresTests(unittest.TestCase):
    """Import job_runner path → load handlers → mount composition → create+reply."""

    def setUp(self) -> None:
        reset_tracker_runtime()
        # Import path under test (prism_worker uses app.job_runner).
        import app.job_runner  # noqa: F401

        load_builtin_job_handlers()
        initialize_tracker_composition()
        self.assertTrue(has_outbound_executor())
        self.assertIsNotNone(jobs_executor(FakeContext({})))
        self.assertIs(jobs_executor(FakeContext({})), execute_outbound_op)

        self.schema_helper = DisposableSchema("r3h1")
        self.addCleanup(self.schema_helper.drop)
        self.conn = self.schema_helper.conn
        self.store = TrackerStore(self.conn)
        self.ops = OpStore(self.conn)
        self.traces: list[dict] = []
        self.forge = StatefulFakeForge(traces=self.traces)
        seed_destination(self.store, self.conn)
        self.conn.commit()
        self._public_base = patch.object(
            __import__("app.core.config", fromlist=["settings"]).settings,
            "PUBLIC_BASE_URL",
            "https://prism.example.com",
        )
        self._public_base.start()
        self.addCleanup(self._public_base.stop)
        self._provider_cm = install_fake_provider(self.forge, self.schema_helper.factory)
        self._provider_cm.__enter__()
        self.addCleanup(lambda: self._provider_cm.__exit__(None, None, None))
        self.addCleanup(reset_tracker_runtime)

    def _seed_pending_create(self) -> None:
        seed_comment_row(self.conn, comment_id=COMMENT_ID)
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
            op_id=OP_CREATE,
            tracked_thread_id=THREAD_ID,
            op="create_issue",
            destination_generation=2,
        )
        self.conn.commit()

    def _seed_pending_reply(self) -> None:
        self.conn.execute(
            """
            INSERT INTO comment_replies (
                id, comment_id, project_id, author, author_kind, content, revision, origin
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (REPLY_ID, COMMENT_ID, PROJECT_ID, "Priya", "user", "designer reply", 1, "prism"),
        )
        self.ops.insert(
            op_id=OP_REPLY,
            tracked_thread_id=THREAD_ID,
            op="add_comment",
            destination_generation=2,
            local_revision=1,
            expected_remote_state=encode_reply_target(REPLY_ID),
            expected_body_hash=body_hash("designer reply"),
        )
        self.conn.commit()

    def test_dispatch_handler_create_and_reply_via_job_runner_mount(self) -> None:
        handler = get_job_handler(DISPATCH_KIND)
        self.assertIsNotNone(handler)
        assert handler is not None

        self._seed_pending_create()
        create_ctx = FakeContext(
            {
                "connectorId": CONNECTOR,
                "remoteContainerId": CONTAINER,
                "_connect": self.schema_helper.factory,
            }
        )
        result = handler(create_ctx)
        self.assertEqual(result.message, "Dispatched")
        create_op = self.ops.get(OP_CREATE)
        self.assertEqual(create_op["state"], "confirmed")
        thread = self.conn.execute(
            "SELECT external_id, external_number FROM tracked_threads WHERE id = %s",
            (THREAD_ID,),
        ).fetchone()
        self.assertEqual(str(thread["external_id"]), ISSUE_ID)
        self.assertEqual(str(thread["external_number"]), str(ISSUE_NUMBER))
        self.assertTrue(any(t.get("action") == "create_issue" for t in self.traces))

        self._seed_pending_reply()
        reply_ctx = FakeContext(
            {
                "connectorId": CONNECTOR,
                "remoteContainerId": CONTAINER,
                "_connect": self.schema_helper.factory,
            }
        )
        result = handler(reply_ctx)
        self.assertEqual(result.message, "Dispatched")
        reply_op = self.ops.get(OP_REPLY)
        self.assertEqual(reply_op["state"], "confirmed")
        link = self.conn.execute(
            "SELECT external_comment_id FROM tracked_replies WHERE reply_id = %s",
            (REPLY_ID,),
        ).fetchone()
        self.assertEqual(str(link["external_comment_id"]), EXT_COMMENT)
        self.assertTrue(any(t.get("action") == "add_comment" for t in self.traces))

        # Table routes by op kind — create handler must not swallow reply ops.
        self.assertNotEqual(
            execute_outbound_op.__module__,
            "app.services.trackers.create_executor",
        )


if __name__ == "__main__":
    unittest.main()
