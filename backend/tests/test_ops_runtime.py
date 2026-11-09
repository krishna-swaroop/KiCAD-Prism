"""Runtime diagnostics behind the ops tools (ADR scripting-and-mcp §11, OPS-04c).

``PoolAndWorkersTests``, ``CacheStatsTests`` and ``EventAndWebhookHealthTests``
run the real SQL against a scratch schema and temporary cache directories.
``RouteTests`` drives the authenticated routes, including the flag and the
admin-only ops scope. Webhook URLs are assembled at run time so the source
holds no credential-shaped literal.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core import redaction  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.services import access_service, personal_tokens  # noqa: E402
from app.services.mcp import registry  # noqa: E402
from app.services.ops import caches, event_health, runtime, workers  # noqa: E402
from app.services.workspace_schema_migrations import WORKSPACE_LEDGER  # noqa: E402
from support.postgres import (  # noqa: E402
    requires_scratch_postgres,
    scratch_schema,
    seed_job,
    seed_project,
    seed_repository,
)

DATABASE_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
HEX64 = "a" * 64

try:
    import starlette.testclient  # noqa: F401
    HAS_TEST_CLIENT = True
except RuntimeError:
    HAS_TEST_CLIENT = False


def _now() -> datetime:
    return datetime.now(timezone.utc)


@requires_scratch_postgres("ops runtime tests")
class PoolAndWorkersTests(unittest.TestCase):
    def setUp(self) -> None:
        self.scratch = scratch_schema(self, "ops_runtime", ledgers=(WORKSPACE_LEDGER,))
        for module in (runtime, workers):
            patcher = patch.object(module, "connect", self.scratch.connection)
            patcher.start()
            self.addCleanup(patcher.stop)

        patcher = patch.object(
            runtime.database,
            "metrics_snapshot",
            return_value={
                "connectionWaitCount": 4,
                "connectionWaitMeanMs": 1.5,
                "connectionWaitMaxMs": 9.0,
                "pool": {"pool_size": 2, "pool_available": 1},
            },
        )
        patcher.start()
        self.addCleanup(patcher.stop)

        patcher = patch.object(
            runtime,
            "resource_capacities",
            return_value={"prism_worker": 2, "design_bundle": 1, "memory": 8},
        )
        patcher.start()
        self.addCleanup(patcher.stop)

        patcher = patch.object(settings, "PRISM_WORKER_MEMORY_BUDGET_MIB", 4096)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _seed(self) -> None:
        now = _now()
        with self.scratch.connect() as conn:
            seed_job(conn, "job-queued", "design_bundle", "queued", worker_pool="prism",
                     created_at=now - timedelta(minutes=3))
            seed_job(conn, "job-running", "design_compare", "running", worker_pool="prism",
                     created_at=now - timedelta(minutes=2))
            seed_job(conn, "job-done", "design_bundle", "completed", worker_pool="prism")
            seed_job(conn, "job-catalog", "catalog_validation", "queued", worker_pool="catalog",
                     created_at=now - timedelta(seconds=30))
            conn.execute(
                """
                INSERT INTO ws_job_resource_slots
                    (resource_name, slot_number, job_id, lease_expires_at)
                VALUES
                    ('prism_worker', 1, 'job-running', NOW() + INTERVAL '10 minutes'),
                    ('prism_worker', 2, 'job-queued', NOW() - INTERVAL '10 minutes'),
                    ('design_bundle', 1, 'job-queued', NULL)
                """
            )
            conn.commit()

        workers.heartbeat(
            "prism:host:1:live",
            pool="prism",
            host="host",
            pid=11,
            started_at=now,
            concurrency=2,
            memory_budget_mib=4096,
            running_jobs=[],
        )
        workers.heartbeat(
            "prism:host:1:stale",
            pool="prism",
            host="host",
            pid=12,
            started_at=now,
            concurrency=2,
            memory_budget_mib=4096,
            running_jobs=[],
        )
        with self.scratch.connect() as conn:
            conn.execute(
                "UPDATE ws_ops_workers SET last_seen_at = NOW() - INTERVAL '10 minutes'"
                " WHERE worker_id = 'prism:host:1:stale'"
            )
            conn.commit()

    def test_it_reports_this_process_the_live_slots_and_the_queue(self) -> None:
        self._seed()

        result = runtime.pool_and_workers()

        self.assertEqual(result["process"], {"host": result["process"]["host"], "pid": os.getpid(), "kind": "api"})
        self.assertEqual(result["pool"]["pool"]["pool_size"], 2)
        self.assertEqual(result["memory_budget_mib"], 4096)

        resources = {row["resource"]: row for row in result["resources"]}
        self.assertEqual(resources["prism_worker"]["capacity"], 2)
        self.assertEqual(resources["prism_worker"]["in_use"], 1)
        self.assertEqual(resources["prism_worker"]["free"], 1)
        self.assertEqual(resources["design_bundle"]["in_use"], 0)

        queue = {(row["worker_pool"], row["kind"], row["status"]): row["count"] for row in result["queue"]}
        self.assertEqual(queue[("prism", "design_bundle", "queued")], 1)
        self.assertEqual(queue[("prism", "design_compare", "running")], 1)
        self.assertEqual(queue[("catalog", "catalog_validation", "queued")], 1)
        self.assertNotIn(("prism", "design_bundle", "completed"), queue)

        oldest = {row["worker_pool"]: row for row in result["oldest_queued"]}
        self.assertGreaterEqual(oldest["prism"]["age_seconds"], 170)
        self.assertLess(oldest["prism"]["age_seconds"], 240)
        self.assertGreaterEqual(oldest["catalog"]["age_seconds"], 20)

        workers_by_id = {row["worker_id"]: row for row in result["workers"]}
        self.assertFalse(workers_by_id["prism:host:1:live"]["stale"])
        self.assertTrue(workers_by_id["prism:host:1:stale"]["stale"])


@requires_scratch_postgres("ops cache tests")
class CacheStatsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.scratch = scratch_schema(self, "ops_caches", ledgers=(WORKSPACE_LEDGER,))
        patcher = patch.object(caches, "connect", self.scratch.connection)
        patcher.start()
        self.addCleanup(patcher.stop)
        caches.clear_measurements()
        self.addCleanup(caches.clear_measurements)

        self.root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.renders = self.root / "renders"
        self.upgrade = self.root / "upgrade-cache"
        self.renders.mkdir()
        self.upgrade.mkdir()
        (self.renders / "one.png").write_bytes(b"x" * 10)
        (self.renders / "two.png").write_bytes(b"y" * 20)
        (self.upgrade / "one.bin").write_bytes(b"z" * 5)
        patcher = patch.object(
            caches,
            "_cache_directories",
            return_value=[("renders", self.renders), ("upgrade-cache", self.upgrade)],
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def _seed(self) -> None:
        with self.scratch.connect() as conn:
            conn.execute(
                """
                INSERT INTO ws_ops_counters (minute, name, value) VALUES
                    (NOW(), 'git_read_cache.hit', 7),
                    (NOW(), 'git_read_cache.miss', 3),
                    (NOW(), 'render_cache.hit', 2),
                    (NOW(), 'bundle.upgrade_cache.miss', 4),
                    (NOW() - INTERVAL '2 hours', 'git_read_cache.hit', 100)
                """
            )
            conn.execute(
                """
                INSERT INTO ws_git_read_cache
                    (cache_key, cache_kind, repository_key, resolved_ref_sha, payload,
                     last_accessed_at)
                VALUES
                    ('a', 'log', 'repo', 'sha', '{"one": "two"}'::jsonb, NOW() - INTERVAL '2 hours'),
                    ('b', 'log', 'repo', 'sha', '{"three": "four"}'::jsonb, NOW())
                """
            )
            seed_repository(conn, "repo")
            seed_project(conn, "project", "repo")
            conn.execute(
                """
                INSERT INTO ws_design_bundles
                    (project_id, bundle_key, revision_key, generator_digest, archive_bytes)
                VALUES ('project', %s, %s, %s, 1234), ('project', %s, %s, %s, 4321)
                """,
                (HEX64, "b" * 64, "c" * 64, "d" * 64, "e" * 64, "f" * 64),
            )
            conn.commit()

    def test_hit_rates_sizes_and_relative_directory_names(self) -> None:
        self._seed()

        result = caches.cache_stats(60)

        by_name = {row["name"]: row for row in result["caches"]}
        self.assertEqual(by_name["git_read_cache"]["hits"], 7)
        self.assertEqual(by_name["git_read_cache"]["misses"], 3)
        self.assertAlmostEqual(by_name["git_read_cache"]["hit_rate"], 0.7)
        self.assertEqual(by_name["git_read_cache"]["table_rows"], 2)
        self.assertGreater(by_name["git_read_cache"]["table_bytes"], 0)
        self.assertIsNotNone(by_name["git_read_cache"]["oldest_access"])
        self.assertIsNotNone(by_name["git_read_cache"]["newest_access"])

        self.assertEqual(by_name["render_cache"]["hits"], 2)
        self.assertEqual(by_name["render_cache"]["misses"], 0)
        self.assertEqual(by_name["render_cache"]["disk_bytes"], 30)
        self.assertEqual(by_name["render_cache"]["disk_files"], 2)
        self.assertFalse(by_name["render_cache"]["disk_partial"])

        self.assertEqual(by_name["bundle.upgrade_cache"]["hit_rate"], 0.0)
        self.assertEqual(by_name["bundle.upgrade_cache"]["disk_bytes"], 5)

        self.assertEqual(result["bundle_store"], {"archives": 2, "archive_bytes": 5555})
        self.assertEqual(result["window_minutes"], 60)
        self.assertNotIn(str(self.root), json.dumps(result))

    def test_one_measurement_is_reused_until_it_expires_or_is_cleared(self) -> None:
        self._seed()
        first = caches.cache_stats(60)
        first_bytes = {row["name"]: row.get("disk_bytes") for row in first["caches"]}

        (self.renders / "three.png").write_bytes(b"w" * 1000)
        second = caches.cache_stats(60)
        self.assertEqual(
            {row["name"]: row.get("disk_bytes") for row in second["caches"]}, first_bytes
        )

        caches.clear_measurements()
        third = caches.cache_stats(60)
        by_name = {row["name"]: row for row in third["caches"]}
        self.assertEqual(by_name["render_cache"]["disk_bytes"], 1030)

    def test_the_walk_stops_at_the_file_limit_and_says_it_is_partial(self) -> None:
        for index in range(5):
            (self.renders / f"extra-{index}.png").write_bytes(b"q")

        with patch.object(caches, "MAX_WALK_FILES", 2):
            measured = caches._measure_directory(self.renders)

        self.assertTrue(measured["partial"])
        self.assertEqual(measured["files"], 2)

    def test_the_walk_stops_at_the_time_limit(self) -> None:
        with patch.object(caches, "MAX_WALK_SECONDS", 0.0):
            measured = caches._measure_directory(self.renders)

        self.assertTrue(measured["partial"])
        self.assertEqual(measured["files"], 0)


@requires_scratch_postgres("ops event health tests")
class EventAndWebhookHealthTests(unittest.TestCase):
    def setUp(self) -> None:
        self.scratch = scratch_schema(self, "ops_event_health", ledgers=(WORKSPACE_LEDGER,))
        patcher = patch.object(event_health, "connect", self.scratch.connection)
        patcher.start()
        self.addCleanup(patcher.stop)
        patcher = patch.object(settings, "PRISM_EVENT_RETENTION_DAYS", 14)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_head_retention_lag_and_delivery_error_rate(self) -> None:
        now = _now()
        password = "sample-" + "password"
        webhook = str(uuid.uuid4())
        quiet = str(uuid.uuid4())
        url = (
            f"https://bot:{password}@hooks.example.test:8443/deliver/abc?"
            + "token=" + "sample-value"
        )
        failure = "POST /deliver/abc failed: " + "token=" + "sample-secret"
        with self.scratch.connect() as conn:
            conn.execute("UPDATE ws_event_head SET cursor = 10")
            conn.execute(
                """
                INSERT INTO ws_events (id, kind, topic, created_at) VALUES
                    (8, 'bundle.built', 'project:p', NOW() - INTERVAL '20 minutes'),
                    (9, 'job.finished', 'project:p', NOW() - INTERVAL '10 minutes'),
                    (10, 'bundle.built', 'project:p', NOW() - INTERVAL '1 minute'),
                    (7, 'bundle.built', 'project:p', NOW() - INTERVAL '2 hours')
                """
            )
            conn.execute(
                """
                INSERT INTO ws_webhooks
                    (id, url, event_kinds, secret_envelope, status, cursor,
                     failing_since, attempts, next_attempt_at, last_status, last_error)
                VALUES
                    (%s, %s, ARRAY['bundle.built'], 'x', 'failing', 7,
                     NOW() - INTERVAL '1 hour', 3, NOW() + INTERVAL '5 minutes', 500, %s),
                    (%s, 'https://hooks.example.test/other', ARRAY['job.finished'], 'x',
                     'active', 10, NULL, 0, NULL, 200, NULL)
                """,
                (webhook, url, failure, quiet),
            )
            conn.execute(
                """
                INSERT INTO ws_webhook_deliveries (webhook_id, event_id, status_code, ok, error)
                VALUES
                    (%s, 8, 200, TRUE, NULL),
                    (%s, 9, 200, TRUE, NULL),
                    (%s, 10, 200, TRUE, NULL),
                    (%s, 10, 500, FALSE, 'boom'),
                    (%s, 9, 500, FALSE, 'old')
                """,
                (webhook, webhook, webhook, webhook, webhook),
            )
            conn.execute(
                "UPDATE ws_webhook_deliveries SET at = NOW() - INTERVAL '2 days'"
                " WHERE error = 'old'"
            )
            conn.commit()

        result = event_health.event_and_webhook_health()

        self.assertEqual(result["head_cursor"], 10)
        self.assertEqual(result["retention_days"], 14)
        self.assertIsNotNone(result["oldest_retained_at"])
        kinds = {row["kind"]: row["count"] for row in result["events_last_hour"]}
        self.assertEqual(kinds, {"bundle.built": 2, "job.finished": 1})

        by_id = {row["id"]: row for row in result["webhooks"]}
        failing = by_id[webhook]
        self.assertEqual(failing["host"], "hooks.example.test")
        self.assertEqual(failing["lag"], 3)
        self.assertEqual(failing["attempts"], 3)
        self.assertEqual(failing["last_status"], 500)
        self.assertIsNotNone(failing["failing_since"])
        self.assertIsNotNone(failing["next_attempt_at"])
        self.assertEqual(failing["deliveries_24h"], {
            "deliveries": 4, "ok": 3, "failed": 1, "error_rate": 0.25,
        })
        self.assertNotIn("sample-secret", failing["last_error"])
        self.assertIn(redaction.REDACTED, failing["last_error"])

        healthy = by_id[quiet]
        self.assertEqual(healthy["lag"], 0)
        self.assertEqual(healthy["deliveries_24h"]["deliveries"], 0)
        self.assertIsNone(healthy["last_error"])

        serialized = json.dumps(result)
        self.assertNotIn("deliver/abc", serialized)
        self.assertNotIn("sample-value", serialized)
        self.assertNotIn(password, serialized)


class OpsToolTests(unittest.TestCase):
    def test_the_runtime_tools_are_ops_reads(self) -> None:
        import app.services.mcp.tools as mcp_tools  # noqa: F401

        for name in (
            "get_pool_and_workers",
            "get_cache_stats",
            "get_event_and_webhook_health",
        ):
            with self.subTest(tool=name):
                with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
                    tool = registry.tool_named(name)
                self.assertIsNotNone(tool)
                assert tool is not None
                self.assertEqual(tool.action, "ops_read")
                self.assertTrue(tool.ops)
                self.assertFalse(tool.write)


@unittest.skipUnless(DATABASE_URL, "PRISM_DATABASE_URL is required")
@unittest.skipUnless(HAS_TEST_CLIENT, "starlette.testclient needs httpx")
class RouteTests(unittest.TestCase):
    pool = {
        "process": {"host": "host", "pid": 1, "kind": "api"},
        "pool": {},
        "workers": [],
        "resources": [],
        "queue": [],
        "oldest_queued": [],
        "memory_budget_mib": 4096,
    }
    caches_result = {"window_minutes": 60, "caches": [], "bundle_store": {"archives": 0, "archive_bytes": 0}}
    health = {
        "head_cursor": 0,
        "oldest_retained_at": None,
        "retention_days": 30,
        "events_last_hour": [],
        "webhooks": [],
    }

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

    @classmethod
    def tearDownClass(cls) -> None:
        for patcher in cls._patchers:
            patcher.stop()

    def _token(self, role: str, scopes: list[str]) -> dict:
        email = f"ops-runtime-{uuid.uuid4().hex[:8]}@example.test"
        access_service.upsert_user(email=email, name="ops")
        access_service.upsert_user_role(email, role, updated_by=email)
        _, token = personal_tokens.create(email, "ops", scopes, 30)
        return {"Authorization": f"Bearer {token}"}

    def test_an_admin_ops_token_reads_every_runtime_answer(self) -> None:
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            headers = self._token("admin", ["ops:read"])
            with patch.object(runtime, "pool_and_workers", return_value=self.pool):
                pool = self.client.get("/api/v1/ops/pool-and-workers", headers=headers)
            with patch.object(caches, "cache_stats", return_value=self.caches_result):
                cache = self.client.get("/api/v1/ops/caches?window_minutes=30", headers=headers)
            with patch.object(
                event_health, "event_and_webhook_health", return_value=self.health
            ):
                health = self.client.get("/api/v1/ops/event-health", headers=headers)

        self.assertEqual(pool.status_code, 200, pool.text)
        self.assertEqual(pool.json()["memory_budget_mib"], 4096)
        self.assertEqual(cache.status_code, 200, cache.text)
        self.assertEqual(health.status_code, 200, health.text)


if __name__ == "__main__":
    unittest.main()
