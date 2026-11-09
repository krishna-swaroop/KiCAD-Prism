"""Route latency, request tracing and slow queries (ADR §11, D23–D25, OPS-04b).

The percentile math is tested on crafted histograms. The PostgreSQL tests seed
rows into the workspace tables and read them back through the services, so the
same merge and join the routes use is exercised. Slow queries are optional:
whichever path the test database supports is tested and the other is skipped.
"""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.services import access_service, personal_tokens, workspace_service  # noqa: E402
from app.services.mcp import registry  # noqa: E402
from app.services.mcp import tools as mcp_tools  # noqa: F401,E402
from app.services.ops import latency, queries, trace  # noqa: E402
from app.services.ops.stats import BUCKETS_MS  # noqa: E402
from app.services.postgres_database import database  # noqa: E402

DATABASE_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()


def _buckets(**counts: int) -> list[int]:
    """A histogram with the named bucket indexes filled in."""

    buckets = [0] * (len(BUCKETS_MS) + 1)
    for index, count in counts.items():
        buckets[int(index)] = count
    return buckets


def _connection():
    return database.connection()


class PercentileTests(unittest.TestCase):
    def test_the_bucket_where_the_cumulative_count_crosses_is_the_estimate(self) -> None:
        # 50 requests under 1 ms, 40 under 20 ms, 10 under 50 ms.
        buckets = _buckets(**{"0": 50, "4": 40, "5": 10})

        self.assertEqual(latency._percentile(buckets, 0.50), (1.0, False))
        self.assertEqual(latency._percentile(buckets, 0.95), (50.0, False))
        self.assertEqual(latency._percentile(buckets, 0.99), (50.0, False))

    def test_a_quantile_in_the_overflow_bucket_is_null_and_flagged(self) -> None:
        buckets = _buckets(**{str(len(BUCKETS_MS)): 10})

        self.assertEqual(latency._percentile(buckets, 0.50), (None, True))
        self.assertEqual(latency._percentile(buckets, 0.99), (None, True))

        numbers = latency._numbers(buckets, 10, 0, 0)
        self.assertIsNone(numbers["p50Ms"])
        self.assertTrue(numbers["overflow"])

    def test_an_empty_histogram_has_no_estimate(self) -> None:
        self.assertEqual(latency._percentile(_buckets(), 0.95), (None, False))
        self.assertEqual(latency._estimated_total_ms(_buckets()), 0.0)

    def test_total_time_weights_each_bucket_by_its_midpoint(self) -> None:
        # 10 requests in (0, 1] and 10 in (10, 20]: 10 * 0.5 + 10 * 15.
        self.assertEqual(latency._estimated_total_ms(_buckets(**{"0": 10, "4": 10})), 155.0)


@unittest.skipUnless(DATABASE_URL, "PRISM_DATABASE_URL is required")
class PersistenceTests(unittest.TestCase):
    def setUp(self) -> None:
        workspace_service.workspace.initialize()
        self.route = f"/api/test/ops-{uuid.uuid4().hex[:10]}"
        self.request_id = f"req-{uuid.uuid4().hex[:12]}"
        self.addCleanup(self._cleanup)

    def _cleanup(self) -> None:
        with _connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            conn.execute("DELETE FROM ws_ops_route_stats WHERE route = %s", (self.route,))
            conn.execute("DELETE FROM ws_ops_requests WHERE request_id = %s", (self.request_id,))
            conn.execute("DELETE FROM ws_jobs WHERE request_id = %s", (self.request_id,))
            conn.execute("DELETE FROM ws_events WHERE request_id = %s", (self.request_id,))
            conn.execute("DELETE FROM ws_mcp_audit WHERE request_id = %s", (self.request_id,))
            conn.commit()

    def _seed_latency(self) -> None:
        with _connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            # Two minutes for the same route, as two processes would flush them.
            conn.execute(
                """
                INSERT INTO ws_ops_route_stats
                    (minute, method, route, count, status_4xx, status_5xx, buckets)
                VALUES
                    (NOW() - INTERVAL '5 minutes', 'GET', %s, 60, 0, 0, %s),
                    (NOW() - INTERVAL '4 minutes', 'GET', %s, 40, 1, 1, %s)
                """,
                (
                    self.route,
                    _buckets(**{"0": 60}),
                    self.route,
                    _buckets(**{"4": 38, str(len(BUCKETS_MS)): 2}),
                ),
            )
            conn.commit()

    def _seed_trace(self) -> None:
        event_id = uuid.uuid4().int % (2**62)
        with _connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            conn.execute(
                """
                INSERT INTO ws_ops_requests
                    (request_id, at, method, route, status, duration_ms, db_ms,
                     auth_type, user_email, client_id, details)
                VALUES (%s, NOW() - INTERVAL '2 minutes', 'GET', %s, 200, 12, 3,
                        'pat', 'a@example.test', 'client-1', '{"nested": true}'::jsonb)
                """,
                (self.request_id, self.route),
            )
            conn.execute(
                """
                INSERT INTO ws_jobs (id, kind, status, created_at, updated_at, started_at, completed_at, request_id)
                VALUES (%s, 'design_bundle', 'completed', NOW() - INTERVAL '2 minutes',
                        NOW() - INTERVAL '1 minute', NOW() - INTERVAL '2 minutes',
                        NOW() - INTERVAL '1 minute', %s)
                """,
                (f"job-{uuid.uuid4().hex[:10]}", self.request_id),
            )
            conn.execute(
                """
                INSERT INTO ws_events (id, created_at, kind, project_id, topic, payload, request_id)
                VALUES (%s, NOW() - INTERVAL '2 minutes', 'job.progress', %s, 'jobs',
                        '{"design": "must not be returned"}'::jsonb, %s)
                """,
                (event_id, f"project-{uuid.uuid4().hex[:8]}", self.request_id),
            )
            conn.execute(
                """
                INSERT INTO ws_mcp_audit (at, user_email, method, tool, outcome, code, duration_ms, request_id)
                VALUES (NOW() - INTERVAL '2 minutes', 'a@example.test', 'tools/call',
                        'get_job', 'ok', NULL, 12, %s)
                """,
                (self.request_id,),
            )
            conn.commit()

    def test_route_latency_merges_rows_and_reports_totals(self) -> None:
        self._seed_latency()

        result = latency.route_latency(window_minutes=60, route_prefix=self.route, limit=10)

        self.assertEqual(result["windowMinutes"], 60)
        [row] = result["routes"]
        self.assertEqual(row["method"], "GET")
        self.assertEqual(row["route"], self.route)
        self.assertEqual(row["count"], 100)
        self.assertEqual((row["status4xx"], row["status5xx"]), (1, 1))
        self.assertAlmostEqual(row["rate4xx"], 0.01)
        self.assertAlmostEqual(row["rate5xx"], 0.01)
        # 60 under 1 ms, 38 under 20 ms and two in overflow.
        self.assertEqual(row["p50Ms"], 1.0)
        self.assertEqual(row["p95Ms"], 20.0)
        self.assertIsNone(row["p99Ms"])
        self.assertTrue(row["overflow"])
        self.assertEqual(
            row["estimatedTotalMs"],
            round(60 * 0.5 + 38 * 15 + 2 * BUCKETS_MS[-1], 3),
        )
        self.assertEqual(result["totals"]["count"], 100)
        self.assertEqual(result["totals"]["routeCount"], 1)
        self.assertEqual(result["totals"]["p95Ms"], 20.0)

    def test_route_latency_orders_by_estimated_total_time(self) -> None:
        slow = f"{self.route}/slow"
        fast = f"{self.route}/fast"
        with _connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            conn.execute(
                """
                INSERT INTO ws_ops_route_stats
                    (minute, method, route, count, status_4xx, status_5xx, buckets)
                VALUES
                    (NOW() - INTERVAL '5 minutes', 'GET', %s, 1, 0, 0, %s),
                    (NOW() - INTERVAL '5 minutes', 'GET', %s, 100, 0, 0, %s)
                """,
                (slow, _buckets(**{"5": 2}), fast, _buckets(**{"0": 100})),
            )
            conn.commit()
            self.addCleanup(
                lambda: self._delete_routes((slow, fast))
            )

        result = latency.route_latency(window_minutes=60, route_prefix=self.route, limit=10)

        self.assertEqual([row["route"] for row in result["routes"]], [slow, fast])

    def _delete_routes(self, routes: tuple[str, ...]) -> None:
        with _connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            conn.execute("DELETE FROM ws_ops_route_stats WHERE route = ANY(%s)", (list(routes),))
            conn.commit()

    def test_trace_request_joins_jobs_events_and_audit_without_payloads(self) -> None:
        self._seed_trace()

        result = trace.trace_request(self.request_id)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["requestId"], self.request_id)
        [request] = result["requests"]
        self.assertEqual(request["route"], self.route)
        self.assertTrue(request["nested"])
        [job] = result["jobs"]
        self.assertEqual((job["kind"], job["status"]), ("design_bundle", "completed"))
        [event] = result["events"]
        self.assertEqual(event["topic"], "jobs")
        self.assertNotIn("payload", event)
        [audit] = result["audit"]
        self.assertEqual((audit["tool"], audit["outcome"]), ("get_job", "ok"))

    def test_an_unknown_request_id_has_no_trace(self) -> None:
        self.assertIsNone(trace.trace_request(f"missing-{uuid.uuid4().hex}"))

    def test_recent_requests_are_newest_first_and_filterable(self) -> None:
        self._seed_trace()
        other = f"req-{uuid.uuid4().hex[:12]}"
        with _connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            conn.execute(
                """
                INSERT INTO ws_ops_requests
                    (request_id, at, method, route, status, duration_ms, db_ms, auth_type)
                VALUES (%s, NOW() - INTERVAL '1 minute', 'POST', %s, 500, 6000, 0, 'session')
                """,
                (other, f"{self.route}/fast"),
            )
            conn.commit()
            self.addCleanup(
                lambda: self._delete_requests((self.request_id, other))
            )

        newest = trace.recent_requests(limit=10, route_prefix=self.route)
        self.assertEqual([row["requestId"] for row in newest], [other, self.request_id])
        slow = trace.recent_requests(
            limit=10, route_prefix=self.route, min_duration_ms=5000, status_min=500
        )
        self.assertEqual([row["requestId"] for row in slow], [other])

    def _delete_requests(self, request_ids: tuple[str, ...]) -> None:
        with _connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            conn.execute("DELETE FROM ws_ops_requests WHERE request_id = ANY(%s)", (list(request_ids),))
            conn.commit()

    def test_slow_queries_reports_either_statements_or_a_reason(self) -> None:
        result = queries.slow_queries()
        if result["available"]:
            self.skipTest("pg_stat_statements is loaded in this database")
        self.assertFalse(result["available"])
        self.assertTrue(result["reason"])
        self.assertEqual(result["queries"], [])

    def test_slow_queries_returns_redacted_statements_when_loaded(self) -> None:
        result = queries.slow_queries(order="mean", limit=5)
        if not result["available"]:
            self.skipTest("pg_stat_statements is not loaded in this database")
        self.assertEqual(result["order"], "mean")
        self.assertLessEqual(len(result["queries"]), 5)
        for row in result["queries"]:
            self.assertIsInstance(row["query"], str)
            self.assertLessEqual(len(row["query"]), queries.MAX_QUERY_CHARS)
            self.assertGreaterEqual(row["calls"], 0)


class McpToolTests(unittest.TestCase):
    NAMES = ("get_route_latency", "list_recent_requests", "trace_request", "get_slow_queries")

    def test_the_ops_tools_are_read_only(self) -> None:
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            for name in self.NAMES:
                tool = registry.tool_named(name)
                self.assertIsNotNone(tool)
                assert tool is not None
                self.assertEqual(tool.action, "ops_read")
                self.assertTrue(tool.ops)
                self.assertFalse(tool.write)
                self.assertTrue(tool.annotations["readOnlyHint"])


try:
    import starlette.testclient  # noqa: F401
    HAS_TEST_CLIENT = True
except RuntimeError:
    HAS_TEST_CLIENT = False


@unittest.skipUnless(DATABASE_URL, "PRISM_DATABASE_URL is required")
@unittest.skipUnless(HAS_TEST_CLIENT, "starlette.testclient needs httpx")
class RouteTests(unittest.TestCase):
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
        email = f"ops-{uuid.uuid4().hex[:8]}@example.test"
        access_service.upsert_user(email=email, name="ops")
        access_service.upsert_user_role(email, role, updated_by=email)
        _, token = personal_tokens.create(email, "ops", scopes, 30)
        return {"Authorization": f"Bearer {token}"}

    def test_an_admin_token_with_ops_read_reads_diagnostics(self) -> None:
        headers = self._token("admin", ["ops:read"])
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            latency_response = self.client.get("/api/v1/ops/route-latency?limit=1", headers=headers)
            requests_response = self.client.get("/api/v1/ops/requests?limit=1", headers=headers)
            queries_response = self.client.get("/api/v1/ops/slow-queries?limit=1", headers=headers)
        self.assertEqual(latency_response.status_code, 200, latency_response.text)
        self.assertIn("totals", latency_response.json())
        self.assertEqual(requests_response.status_code, 200, requests_response.text)
        self.assertIsInstance(requests_response.json(), list)
        self.assertEqual(queries_response.status_code, 200, queries_response.text)
        self.assertIn("available", queries_response.json())

    def test_an_unknown_request_id_is_a_typed_not_found(self) -> None:
        headers = self._token("admin", ["ops:read"])
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            response = self.client.get(
                f"/api/v1/ops/requests/missing-{uuid.uuid4().hex}", headers=headers
            )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["code"], "request-not-found")

    def test_a_seeded_request_is_traceable_through_the_route(self) -> None:
        request_id = f"req-{uuid.uuid4().hex[:12]}"
        route = f"/api/test/route-{uuid.uuid4().hex[:8]}"
        with _connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            conn.execute(
                """
                INSERT INTO ws_ops_requests
                    (request_id, at, method, route, status, duration_ms, db_ms, auth_type, details)
                VALUES (%s, NOW(), 'POST', %s, 201, 25, 4, 'pat', '{}'::jsonb)
                """,
                (request_id, route),
            )
            conn.commit()
        self.addCleanup(self._delete_request, request_id)

        headers = self._token("admin", ["ops:read"])
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            response = self.client.get(f"/api/v1/ops/requests/{request_id}", headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["requestId"], request_id)

    def _delete_request(self, request_id: str) -> None:
        with _connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            conn.execute("DELETE FROM ws_ops_requests WHERE request_id = %s", (request_id,))
            conn.commit()


if __name__ == "__main__":
    unittest.main()
