"""The fixed ops actions: cancel, requeue, rebuild and debug logging (OPS-06).

``requeue`` is allowed only for a failed, retry-waiting, or lease-expired
running/cancelling job, and never for a running job whose worker still holds a
live lease. The requeue transaction bumps the fence, releases the old fence's
claims, keeps the attempt and records a ``requeued`` event. The routes add the
ops policy (admin plus ``ops:act``, or ``ops:read`` for the debug read) and the
tools declare honest write annotations.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.services import job_requeue  # noqa: E402
from app.services.job_service import JobService  # noqa: E402
from app.services.mcp import invoke, registry  # noqa: E402
from app.services.mcp import tools as _mcp_tools  # noqa: E402, F401
from app.services.postgres_database import database  # noqa: E402

DATABASE_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()

try:
    import starlette.testclient  # noqa: F401
    HAS_TEST_CLIENT = True
except RuntimeError:
    HAS_TEST_CLIENT = False


class ToolDefinitionTests(unittest.TestCase):
    TOOLS = {
        "cancel_job": (True, False),
        "requeue_job": (False, False),
        "rebuild_bundle": (True, False),
        "set_debug_logging": (False, True),
    }

    def test_each_tool_is_an_ops_action_with_honest_annotations(self) -> None:
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            for name, (destructive, idempotent) in self.TOOLS.items():
                with self.subTest(tool=name):
                    tool = registry.tool_named(name)
                    assert tool is not None
                    self.assertEqual(tool.action, "ops_act")
                    self.assertTrue(tool.write)
                    definition = registry.tool_definition(tool)
                    self.assertFalse(definition["annotations"]["readOnlyHint"])
                    self.assertEqual(
                        definition["annotations"]["destructiveHint"], destructive
                    )
                    self.assertEqual(
                        definition["annotations"]["idempotentHint"], idempotent
                    )
                    self.assertIn(
                        "idempotencyKey", definition["inputSchema"]["properties"]
                    )

    def test_descriptions_state_the_debug_and_requeue_limits(self) -> None:
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            debug = registry.tool_named("set_debug_logging")
            requeue = registry.tool_named("requeue_job")
        assert debug is not None and requeue is not None
        self.assertIn("thirty", debug.description)
        self.assertIn("0", debug.description)
        self.assertIn("live lease", requeue.description)
        self.assertIn("cancel it instead", requeue.description)
        self.assertEqual(debug.input_schema["properties"]["minutes"]["maximum"], 30)
        self.assertEqual(debug.input_schema["properties"]["minutes"]["minimum"], 0)


class StubApp:
    """Records the request a tool sends and answers with a fixed body."""

    def __init__(self, status: int = 200, body: dict | None = None) -> None:
        self.status = status
        self.body = json.dumps(body if body is not None else {"ok": True}).encode("utf-8")
        self.seen: dict = {}

    async def __call__(self, scope, receive, send) -> None:
        message = await receive()
        self.seen = {
            "method": scope["method"],
            "path": scope["path"],
            "headers": dict(scope["headers"]),
            "body": json.loads(message["body"]) if message["body"] else None,
        }
        await send({"type": "http.response.start", "status": self.status, "headers": []})
        await send({"type": "http.response.body", "body": self.body})


class ToolInvocationTests(unittest.TestCase):
    def call(self, name: str, arguments: dict, body: dict | None = None):
        app = StubApp(200, body if body is not None else {"ok": True})
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            tool = registry.tool_named(name)
        assert tool is not None
        result = asyncio.run(
            invoke.call_tool(app, tool, arguments, authorization="Bearer t")
        )
        self.assertFalse(result["isError"], result)
        return app

    def test_cancel_posts_the_job_route_with_the_idempotency_key(self) -> None:
        app = self.call(
            "cancel_job",
            {"job_id": "j1", "idempotencyKey": "k-1"},
            {"job_id": "j1", "status": "cancelled"},
        )
        self.assertEqual(app.seen["method"], "POST")
        self.assertEqual(app.seen["path"], "/api/v1/ops/jobs/j1/cancel")
        self.assertIsNone(app.seen["body"])
        self.assertEqual(app.seen["headers"][b"idempotency-key"], b"k-1")

    def test_rebuild_posts_only_the_commit_it_was_given(self) -> None:
        app = self.call(
            "rebuild_bundle",
            {"project_id": "p1", "commit": "a" * 40},
            {"job_id": "j1", "commit": "a" * 40},
        )
        self.assertEqual(app.seen["method"], "POST")
        self.assertEqual(app.seen["path"], "/api/v1/ops/projects/p1/rebuild-bundle")
        self.assertEqual(app.seen["body"], {"commit": "a" * 40})

    def test_debug_logging_sets_a_window_and_zero_clears_it(self) -> None:
        set_app = self.call(
            "set_debug_logging",
            {"minutes": 5, "loggers": ["app"]},
            {"until": "2026-10-26T12:05:00Z", "loggers": ["app"]},
        )
        self.assertEqual(set_app.seen["method"], "POST")
        self.assertEqual(set_app.seen["path"], "/api/v1/ops/debug-logging")
        self.assertEqual(set_app.seen["body"], {"minutes": 5, "loggers": ["app"]})

        clear_app = self.call("set_debug_logging", {"minutes": 0}, {"cleared": True})
        self.assertEqual(clear_app.seen["method"], "DELETE")
        self.assertEqual(clear_app.seen["path"], "/api/v1/ops/debug-logging")
        self.assertIsNone(clear_app.seen["body"])


@unittest.skipUnless(DATABASE_URL, "PRISM_DATABASE_URL is required")
class RequeueServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = JobService()
        self.service.initialize()
        suffix = uuid.uuid4().hex
        self.pool = f"test-ops-{suffix}"
        self.kind = f"test-ops-kind-{suffix}"
        self.resource = f"test-ops-resource-{suffix}"
        self.lock = f"test-ops-lock:{suffix}"
        self.job_ids: list[str] = []

    def tearDown(self) -> None:
        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            conn.execute("DELETE FROM ws_jobs WHERE id = ANY(%s)", (self.job_ids,))
            conn.execute(
                "DELETE FROM ws_events WHERE topic = ANY(%s)",
                ([f"job:{job_id}" for job_id in self.job_ids],),
            )
            conn.execute(
                "DELETE FROM ws_job_resource_slots WHERE resource_name = %s",
                (self.resource,),
            )
            conn.execute(
                "DELETE FROM ws_job_locks WHERE lock_key = %s", (self.lock,)
            )
            conn.commit()

    def enqueue(self, artifact_key: str, **kwargs):
        job = self.service.enqueue(
            self.kind,
            {"test": True},
            worker_pool=self.pool,
            artifact_key=f"{artifact_key}-{uuid.uuid4().hex[:6]}",
            **kwargs,
        )
        job_id = str(job["job_id"])
        self.job_ids.append(job_id)
        return job

    def row(self, job_id: str):
        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            return conn.execute(
                "SELECT * FROM ws_jobs WHERE id = %s", (job_id,)
            ).fetchone()

    def claims(self, table: str, job_id: str) -> int:
        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            return conn.execute(
                f"SELECT COUNT(*) AS n FROM {table} WHERE job_id = %s", (job_id,)
            ).fetchone()["n"]

    def expire(self, job_id: str) -> None:
        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            conn.execute(
                "UPDATE ws_jobs SET lease_expires_at = NOW() - INTERVAL '1 second' WHERE id = %s",
                (job_id,),
            )
            conn.execute(
                "UPDATE ws_job_resource_slots SET lease_expires_at = NOW() - INTERVAL '1 second' WHERE job_id = %s",
                (job_id,),
            )
            conn.execute(
                "UPDATE ws_job_locks SET lease_expires_at = NOW() - INTERVAL '1 second' WHERE job_id = %s",
                (job_id,),
            )
            conn.commit()

    def fail(self, job_id: str, *, transient: bool) -> None:
        claim = self.service.claim("worker-a", worker_pool=self.pool)
        assert claim is not None and str(claim["job_id"]) == job_id
        status = self.service.fail(
            job_id,
            "worker-a",
            int(claim["fence"]),
            error_code="test-failure",
            error_message="the test made this fail",
            transient=transient,
            retry_after_seconds=60,
        )
        self.assertEqual(status, "retry_wait" if transient else "failed")

    def test_a_failed_job_is_requeued_under_a_new_fence(self) -> None:
        job = self.enqueue("failed")
        job_id = job["job_id"]
        self.fail(job_id, transient=False)
        before = self.row(job_id)

        result = self.service.requeue(job_id, requested_by="ops@example.test")

        after = self.row(job_id)
        self.assertEqual(result["status"], "queued")
        self.assertEqual(result["previous_status"], "failed")
        self.assertEqual(result["previous_fence"], int(before["fence"]))
        self.assertEqual(result["fence"], int(before["fence"]) + 1)
        self.assertEqual(result["attempt"], int(before["attempt"]))
        self.assertEqual(after["status"], "queued")
        self.assertEqual(after["stage"], "")
        self.assertEqual(after["message"], "Requeued by ops")
        self.assertEqual(after["fence"], int(before["fence"]) + 1)
        self.assertEqual(after["attempt"], before["attempt"])
        self.assertGreaterEqual(int(after["max_attempts"]), int(after["attempt"]) + 1)
        self.assertEqual(after["lease_owner"], "")
        self.assertIsNone(after["lease_expires_at"])
        self.assertIsNone(after["heartbeat_at"])
        self.assertEqual(after["error_code"], "")
        self.assertEqual(after["error_message"], "")
        self.assertIsNone(after["completed_at"])
        self.assertIsNotNone(after["available_at"])

        events = [
            event
            for event in self.service.events(job_id)
            if event["event_type"] == "requeued"
        ]
        self.assertEqual(len(events), 1)
        self.assertEqual(
            events[0]["details"],
            {
                "requested_by": "ops@example.test",
                "previous_status": "failed",
                "previous_fence": int(before["fence"]),
            },
        )

    def test_a_retry_waiting_job_is_requeued(self) -> None:
        job = self.enqueue("retry")
        self.fail(job["job_id"], transient=True)
        self.assertEqual(self.row(job["job_id"])["status"], "retry_wait")

        result = self.service.requeue(job["job_id"], requested_by="ops@example.test")

        self.assertEqual(result["status"], "queued")
        self.assertEqual(result["previous_status"], "retry_wait")
        self.assertEqual(self.row(job["job_id"])["status"], "queued")

    def test_an_expired_running_lease_is_requeued_and_its_claims_released(self) -> None:
        self.service.configure_resource_slots({self.resource: 1})
        job = self.enqueue(
            "expired",
            resources={self.resource: 1},
            locks=[{"key": self.lock, "mode": "write"}],
        )
        claim = self.service.claim("worker-a", worker_pool=self.pool)
        assert claim is not None and str(claim["job_id"]) == job["job_id"]
        self.assertEqual(self.claims("ws_job_resource_slots", job["job_id"]), 1)
        self.assertEqual(self.claims("ws_job_locks", job["job_id"]), 1)

        self.expire(job["job_id"])
        result = self.service.requeue(job["job_id"], requested_by="ops@example.test")

        self.assertEqual(result["status"], "queued")
        self.assertEqual(result["previous_status"], "running")
        self.assertEqual(self.claims("ws_job_resource_slots", job["job_id"]), 0)
        self.assertEqual(self.claims("ws_job_locks", job["job_id"]), 0)

    def test_an_expired_cancelling_lease_is_refused(self) -> None:
        job = self.enqueue("cancelling")
        claim = self.service.claim("worker-a", worker_pool=self.pool)
        assert claim is not None
        self.assertEqual(
            self.service.request_cancel(job["job_id"], requested_by="test"),
            "cancel_requested",
        )
        self.expire(job["job_id"])

        with self.assertRaises(job_requeue.JobNotRequeueable) as raised:
            self.service.requeue(job["job_id"], requested_by="ops@example.test")

        self.assertIn("cancel was requested", raised.exception.detail)
        self.assertEqual(self.row(job["job_id"])["status"], "cancel_requested")

    def test_a_live_running_lease_is_refused_and_says_to_cancel(self) -> None:
        job = self.enqueue("live")
        self.service.claim("worker-a", worker_pool=self.pool)

        with self.assertRaises(job_requeue.JobNotRequeueable) as raised:
            self.service.requeue(job["job_id"], requested_by="ops@example.test")

        self.assertEqual(raised.exception.code, "job-not-requeueable")
        self.assertEqual(raised.exception.status_code, 409)
        self.assertIn("cancel it", raised.exception.detail)
        self.assertEqual(self.row(job["job_id"])["status"], "running")

    def test_completed_queued_and_cancelled_jobs_are_refused(self) -> None:
        completed = self.enqueue("completed")
        claim = self.service.claim("worker-a", worker_pool=self.pool)
        assert claim is not None and str(claim["job_id"]) == completed["job_id"]
        self.assertTrue(
            self.service.complete(completed["job_id"], "worker-a", int(claim["fence"]))
        )
        queued = self.enqueue("queued")
        cancelled = self.enqueue("cancelled")
        self.assertEqual(
            self.service.request_cancel(cancelled["job_id"], requested_by="test"),
            "cancelled",
        )

        for job, reason in (
            (completed, "completed successfully"),
            (queued, "already queued"),
            (cancelled, "cancelled deliberately"),
        ):
            with self.subTest(status=job["job_id"]):
                with self.assertRaises(job_requeue.JobNotRequeueable) as raised:
                    self.service.requeue(job["job_id"], requested_by="ops@example.test")
                self.assertEqual(raised.exception.code, "job-not-requeueable")
                self.assertIn(reason, raised.exception.detail)

    def test_an_unknown_job_is_not_found(self) -> None:
        with self.assertRaises(job_requeue.JobNotFound) as raised:
            self.service.requeue(f"missing-{uuid.uuid4().hex}", requested_by="ops@example.test")
        self.assertEqual(raised.exception.code, "job-not-found")
        self.assertEqual(raised.exception.status_code, 404)


@unittest.skipUnless(DATABASE_URL, "PRISM_DATABASE_URL is required")
@unittest.skipUnless(HAS_TEST_CLIENT, "starlette.testclient needs httpx")
class OpsActionRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from starlette.testclient import TestClient

        cls._patchers = [
            patch.object(settings, "AUTH_ENABLED_OVERRIDE", True),
            patch.object(settings, "PASSWORD_AUTH_ENABLED", True),
            patch.object(settings, "SESSION_SECRET", "test-secret-at-least-32-characters-long-x"),
            patch.object(settings, "PUBLIC_BASE_URL", "https://prism.test"),
        ]
        for patcher in cls._patchers:
            patcher.start()
        import app.main as main

        cls.client = TestClient(main.app)
        cls.service = JobService()
        cls.service.initialize()
        cls.suffix = uuid.uuid4().hex
        cls.pool = f"test-ops-route-{cls.suffix}"
        cls.kind = f"test-ops-route-kind-{cls.suffix}"
        cls.job_ids: list[str] = []

    @classmethod
    def tearDownClass(cls) -> None:
        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            conn.execute("DELETE FROM ws_jobs WHERE id = ANY(%s)", (cls.job_ids,))
            conn.execute(
                "DELETE FROM ws_events WHERE topic = ANY(%s)",
                ([f"job:{job_id}" for job_id in cls.job_ids],),
            )
            conn.commit()
        for patcher in cls._patchers:
            patcher.stop()

    def setUp(self) -> None:
        from app.core import runtime_logging

        runtime_logging.clear(by="ops-actions-test")
        self.addCleanup(runtime_logging.clear, "ops-actions-test")

    def _token(self, role: str, scopes: list[str]) -> dict:
        from app.services import access_service, personal_tokens

        email = f"ops-actions-{uuid.uuid4().hex[:8]}@example.test"
        access_service.upsert_user(email=email, name="ops")
        access_service.upsert_user_role(email, role, updated_by=email)
        _, token = personal_tokens.create(email, "ops", scopes, 30)
        return {"Authorization": f"Bearer {token}"}

    def _enqueue(self) -> str:
        job = self.service.enqueue(
            self.kind,
            {"test": True},
            worker_pool=self.pool,
            artifact_key=f"route-{uuid.uuid4().hex[:8]}",
        )
        job_id = str(job["job_id"])
        self.job_ids.append(job_id)
        return job_id

    def _fail(self, job_id: str) -> None:
        claim = self.service.claim("worker-a", worker_pool=self.pool)
        assert claim is not None and str(claim["job_id"]) == job_id
        self.service.fail(
            job_id,
            "worker-a",
            int(claim["fence"]),
            error_code="test-failure",
            error_message="the test made this fail",
        )

    def test_ops_routes_do_not_exist_while_the_flag_is_off(self) -> None:
        job_id = self._enqueue()
        headers = self._token("admin", ["ops:act"])
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", False):
            cancel = self.client.post(f"/api/v1/ops/jobs/{job_id}/cancel", headers=headers)
            requeue = self.client.post(f"/api/v1/ops/jobs/{job_id}/requeue", headers=headers)
            debug = self.client.post(
                "/api/v1/ops/debug-logging", json={"minutes": 5}, headers=headers
            )
            read = self.client.get("/api/v1/ops/debug-logging", headers=headers)
        for response in (cancel, requeue, debug, read):
            self.assertEqual(response.status_code, 404, response.text)

    def test_ops_read_alone_is_refused_for_an_action(self) -> None:
        job_id = self._enqueue()
        headers = self._token("admin", ["ops:read"])
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            response = self.client.post(
                f"/api/v1/ops/jobs/{job_id}/requeue", headers=headers
            )
        self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual(response.json()["code"], "forbidden")

    def test_an_admin_with_ops_act_cancels_a_queued_job(self) -> None:
        job_id = self._enqueue()
        headers = self._token("admin", ["ops:act"])
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            response = self.client.post(
                f"/api/v1/ops/jobs/{job_id}/cancel", headers=headers
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"job_id": job_id, "status": "cancelled"})

    def test_an_admin_with_ops_act_requeues_a_failed_job(self) -> None:
        job_id = self._enqueue()
        self._fail(job_id)
        headers = self._token("admin", ["ops:act"])
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            response = self.client.post(
                f"/api/v1/ops/jobs/{job_id}/requeue", headers=headers
            )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["status"], "queued")
        self.assertEqual(body["previous_status"], "failed")
        self.assertEqual(body["fence"], body["previous_fence"] + 1)

    def test_an_unknown_job_answers_job_not_found(self) -> None:
        headers = self._token("admin", ["ops:act"])
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            response = self.client.post(
                f"/api/v1/ops/jobs/missing-{uuid.uuid4().hex}/requeue", headers=headers
            )
        self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(response.json()["code"], "job-not-found")

    def test_rebuild_queues_one_commit_and_returns_its_job_id(self) -> None:
        headers = self._token("admin", ["ops:act"])
        commit = "0" * 40
        result = SimpleNamespace(
            job_id="job-rebuild-1",
            commit=commit,
            scope="commit",
            removed_bundles=1,
            removed_aliases=0,
        )
        with (
            patch.object(settings, "PRISM_MCP_OPS_ENABLED", True),
            patch("app.api.ops_actions.get_project_for_role_or_404", return_value=None),
            patch(
                "app.services.ops.actions.regenerate.regenerate", return_value=result
            ) as regenerate,
        ):
            response = self.client.post(
                "/api/v1/ops/projects/prj_1/rebuild-bundle",
                json={"commit": commit},
                headers=headers,
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["job_id"], "job-rebuild-1")
        regenerate.assert_called_once()

    def test_rebuild_rejects_a_branch_in_the_commit_field(self) -> None:
        headers = self._token("admin", ["ops:act"])
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            response = self.client.post(
                "/api/v1/ops/projects/prj_1/rebuild-bundle",
                json={"commit": "main"},
                headers=headers,
            )
        self.assertEqual(response.status_code, 422, response.text)

    def test_debug_logging_set_read_and_clear(self) -> None:
        headers = self._token("admin", ["ops:act"])
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            set_response = self.client.post(
                "/api/v1/ops/debug-logging",
                json={"minutes": 5, "loggers": ["app"]},
                headers=headers,
            )
            read_response = self.client.get("/api/v1/ops/debug-logging", headers=headers)
            clear_response = self.client.delete(
                "/api/v1/ops/debug-logging", headers=headers
            )
            after_clear = self.client.get("/api/v1/ops/debug-logging", headers=headers)
        self.assertEqual(set_response.status_code, 200, set_response.text)
        self.assertEqual(set_response.json()["loggers"], ["app"])
        self.assertEqual(read_response.status_code, 200, read_response.text)
        self.assertEqual(read_response.json()["until"], set_response.json()["until"])
        self.assertEqual(clear_response.status_code, 200, clear_response.text)
        self.assertTrue(clear_response.json()["cleared"])
        self.assertEqual(after_clear.status_code, 200, after_clear.text)
        self.assertIsNone(after_clear.json())

    def test_debug_logging_bounds_are_one_to_thirty_minutes(self) -> None:
        headers = self._token("admin", ["ops:act"])
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            zero = self.client.post(
                "/api/v1/ops/debug-logging", json={"minutes": 0}, headers=headers
            )
            too_long = self.client.post(
                "/api/v1/ops/debug-logging", json={"minutes": 31}, headers=headers
            )
        self.assertEqual(zero.status_code, 422, zero.text)
        self.assertEqual(too_long.status_code, 422, too_long.text)

    def test_debug_logging_refuses_loggers_outside_prism(self) -> None:
        headers = self._token("admin", ["ops:act"])
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            for name in ("urllib3", "psycopg", "application", "app.", ""):
                response = self.client.post(
                    "/api/v1/ops/debug-logging",
                    json={"minutes": 5, "loggers": [name]},
                    headers=headers,
                )
                self.assertEqual(response.status_code, 422, name)
            child = self.client.post(
                "/api/v1/ops/debug-logging",
                json={"minutes": 5, "loggers": ["app.services.job_service"]},
                headers=headers,
            )
            self.client.delete("/api/v1/ops/debug-logging", headers=headers)
        self.assertEqual(child.status_code, 200, child.text)

    def test_ops_act_can_read_the_debug_window(self) -> None:
        headers = self._token("admin", ["ops:act"])
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            response = self.client.get("/api/v1/ops/debug-logging", headers=headers)
        self.assertEqual(response.status_code, 200, response.text)


if __name__ == "__main__":
    unittest.main()
