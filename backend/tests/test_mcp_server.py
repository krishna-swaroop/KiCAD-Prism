"""The read-only MCP server at /mcp (ADR scripting-and-mcp §3.7, §3.11).

The route tests drive the real application with a personal access token, so the
bearer path, ``policy.authorize``, folder visibility and the typed ``/api/v1``
routes are the ones a client meets. The invoke test calls a route the caller
may not see directly, proving the tool carries the caller's own authorization
instead of a privileged one.
"""

from __future__ import annotations

import asyncio
import os
import sys
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import psycopg  # noqa: E402
from psycopg.rows import dict_row  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.session import SESSION_COOKIE_NAME, create_session_token  # noqa: E402
from app.services import access_service, personal_tokens, session_store_service  # noqa: E402
from app.services.mcp import invoke, registry  # noqa: E402
from app.services.mcp import tools as _tools  # noqa: E402,F401 - registers the tools
from support.postgres import seed_folder, seed_project, seed_repository  # noqa: E402

DATABASE_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()

try:
    import starlette.testclient  # noqa: F401
    HAS_TEST_CLIENT = True
except RuntimeError:
    HAS_TEST_CLIENT = False

TEST_SECRET = "test-secret-at-least-32-characters-long-x"
BASE = "https://prism.test"
COMMIT = "0123456789abcdef0123456789abcdef01234567"

TOOL_ORDER = [
    "render_view",
    "search_projects",
    "get_project",
    "list_revisions",
    "find_in_design",
    "get_component",
    "get_net",
    "get_bom",
    "get_comparison_review",
    "get_job",
    "list_comments",
    "search_catalog",
    "get_catalog_component",
    "get_release_status",
    "compare_revisions",
    "get_changes",
    "list_catalog_fields",
    "search_catalog_assets",
    "check_catalog_asset",
    "get_project_supply",
    "get_component_supply",
    "find_part_alternatives",
    "sync_project",
    "start_release_build",
    "request_release_approval",
    "create_catalog_draft",
    "update_import_proposal",
    "add_comment",
    "reply_to_comment",
    "resolve_comment",
    "update_catalog_component",
    "create_asset_upload",
    "attach_catalog_asset",
    "reuse_catalog_asset",
    "validate_catalog_component",
    "update_catalog_representation",
    "remove_catalog_representation",
    "move_catalog_component",
    "request_catalog_approval",
    "watch_component",
    "refresh_component_supply",
]

#: The one place the client-visible tool order is written down: a change to it
#: is a change clients see. Every other list is derived from the registry.


def unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def use_user(role: str) -> tuple[str, str]:
    """A fresh account in ``role`` and an ``api:read`` token for it."""

    email = f"{unique('mcp')}@example.test"
    access_service.upsert_user(email=email, name=email.split("@")[0])
    access_service.upsert_user_role(email, role, updated_by=email)
    scopes = ["admin"] if role == "admin" else ["api:read"]
    _, token = personal_tokens.create(email, "mcp tests", scopes, 30)
    return email, token


def app_connection():
    conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
    conn.execute("SET search_path TO workspace, public")
    return conn


def comments_connection():
    conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
    conn.execute("SET search_path TO comments, public")
    return conn


def initialize(version: str = "2026-07-28") -> dict:
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": version,
            "capabilities": {},
            "clientInfo": {"name": "tests", "version": "1"},
        },
    }


def call(tool: str, arguments: dict, request_id: int = 2) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "method": "tools/call",
        "params": {"name": tool, "arguments": arguments},
    }


@unittest.skipUnless(DATABASE_URL, "PRISM_DATABASE_URL is required for the MCP server tests")
@unittest.skipUnless(HAS_TEST_CLIENT, "starlette.testclient needs httpx2 or httpx")
class McpServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from starlette.testclient import TestClient

        cls._patchers = [
            patch.object(settings, "AUTH_ENABLED_OVERRIDE", True),
            patch.object(settings, "PASSWORD_AUTH_ENABLED", True),
            patch.object(settings, "SESSION_SECRET", TEST_SECRET),
            patch.object(settings, "PUBLIC_BASE_URL", BASE),
            patch.object(settings, "PRISM_MCP_ENABLED", True),
        ]
        for patcher in cls._patchers:
            patcher.start()

        import app.main as main

        cls.main = main
        cls.TestClient = TestClient

    @classmethod
    def tearDownClass(cls) -> None:
        for patcher in getattr(cls, "_patchers", []):
            patcher.stop()

    def setUp(self) -> None:
        self.client = self.TestClient(self.main.app)
        self._repositories: list[str] = []
        self._projects: list[str] = []
        self._folders: list[str] = []
        self.addCleanup(self._cleanup)
        self.viewer_email, self.viewer_token = use_user("viewer")
        self.headers = {"Authorization": f"Bearer {self.viewer_token}"}

    def _cleanup(self) -> None:
        with app_connection() as conn:
            conn.execute("DELETE FROM ws_projects WHERE id = ANY(%s)", (self._projects,))
            conn.execute("DELETE FROM ws_repositories WHERE id = ANY(%s)", (self._repositories,))
            conn.execute("DELETE FROM ws_folders WHERE id = ANY(%s)", (self._folders,))
            conn.commit()

    # ------------------------------------------------------------- fixtures

    def _project(self, *, hidden: bool = False) -> str:
        suffix = uuid.uuid4().hex[:10]
        repository = f"repo-{suffix}"
        project = f"project-{suffix}"
        folder = None
        with app_connection() as conn:
            seed_repository(conn, repository)
            if hidden:
                folder = f"folder-{suffix}"
                seed_folder(
                    conn,
                    folder,
                    visibility_mode="roles",
                    allowed_roles=["designer", "admin"],
                )
                self._folders.append(folder)
            seed_project(
                conn,
                project,
                repository,
                name=f"Board {suffix}",
                folder_id=folder,
            )
            conn.commit()
        self._repositories.append(repository)
        self._projects.append(project)
        return project

    def post(self, payload, *, headers: dict | None = None, token: str | None = None, client=None):
        merged = dict(headers or {})
        if token is not None:
            merged["Authorization"] = f"Bearer {token}"
        return (client or self.client).post("/mcp", json=payload, headers=merged)

    def mcp(self, payload, **kwargs) -> dict:
        response = self.post(payload, **kwargs)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    # -------------------------------------------------------------- protocol

    def test_initialize_negotiates_the_protocol_and_publishes_capabilities(self) -> None:
        for requested in ("2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"):
            with self.subTest(requested=requested):
                result = self.mcp(initialize(requested), headers=self.headers)["result"]
                self.assertEqual(result["protocolVersion"], requested)

        fallback = self.mcp(initialize("1999-01-01"), headers=self.headers)["result"]
        self.assertEqual(fallback["protocolVersion"], "2026-07-28")
        self.assertEqual(
            fallback["capabilities"],
            {
                "tools": {"listChanged": False},
                "resources": {"subscribe": False, "listChanged": False},
                "extensions": {"io.modelcontextprotocol/tasks": {}},
            },
        )
        self.assertEqual(fallback["serverInfo"]["name"], "kicad-prism")
        self.assertEqual(fallback["serverInfo"]["version"], settings.PRISM_RELEASE)
        self.assertTrue(fallback["instructions"])

    def test_ping_and_unknown_method(self) -> None:
        ping = self.mcp({"jsonrpc": "2.0", "id": 3, "method": "ping"}, headers=self.headers)
        self.assertEqual(ping["result"], {})

        unknown = self.mcp(
            {"jsonrpc": "2.0", "id": 4, "method": "resources/subscribe"}, headers=self.headers
        )
        self.assertEqual(unknown["error"]["code"], -32601)

    def test_protocol_header_and_origin_are_checked(self) -> None:
        refused_version = self.post(
            initialize(),
            headers={**self.headers, "MCP-Protocol-Version": "1999-01-01"},
        )
        self.assertEqual(refused_version.status_code, 400)

        refused_origin = self.post(initialize(), headers={**self.headers, "Origin": "https://evil.example"})
        self.assertEqual(refused_origin.status_code, 403)

        allowed_origin = self.post(initialize(), headers={**self.headers, "Origin": "http://127.0.0.1:5173"})
        self.assertEqual(allowed_origin.status_code, 200)

        deployment_origin = self.post(initialize(), headers={**self.headers, "Origin": BASE})
        self.assertEqual(deployment_origin.status_code, 200)

    def test_notification_batch_and_transport_methods(self) -> None:
        notification = self.post(
            {"jsonrpc": "2.0", "method": "notifications/initialized"}, headers=self.headers
        )
        self.assertEqual(notification.status_code, 202)
        self.assertEqual(notification.content, b"")

        batch = self.post([initialize()], headers=self.headers)
        self.assertEqual(batch.status_code, 400)
        self.assertEqual(batch.json(), {"error": "batches are not supported"})

        self.assertEqual(self.client.get("/mcp", headers=self.headers).status_code, 405)
        self.assertEqual(self.client.delete("/mcp", headers=self.headers).status_code, 405)

    # ------------------------------------------------------------------ auth

    def test_missing_or_invalid_tokens_are_401_with_resource_metadata(self) -> None:
        expected = f'Bearer resource_metadata="{BASE}/.well-known/oauth-protected-resource"'
        for response in (
            self.post(initialize()),
            self.post(initialize(), headers={"Authorization": "Bearer not-a-token"}),
        ):
            with self.subTest(status=response.status_code):
                self.assertEqual(response.status_code, 401)
                self.assertEqual(response.headers["www-authenticate"], expected)

    def test_a_session_cookie_is_refused_even_beside_a_bearer(self) -> None:
        session_id, _ = session_store_service.create_session(
            email=self.viewer_email, name="Viewer", picture=""
        )
        client = self.TestClient(self.main.app)
        client.cookies.set(SESSION_COOKIE_NAME, create_session_token(session_id))
        response = self.post(initialize(), headers=self.headers, client=client)
        self.assertEqual(response.status_code, 401)

    def test_the_switch_off_answers_404(self) -> None:
        with patch.object(settings, "PRISM_MCP_ENABLED", False):
            self.assertEqual(self.post(initialize(), headers=self.headers).status_code, 404)
            self.assertEqual(
                self.client.get("/.well-known/oauth-protected-resource").status_code, 404
            )

    # --------------------------------------------------------------- tools

    def test_tools_list_is_deterministic_and_annotates_writes(self) -> None:
        first = self.mcp({"jsonrpc": "2.0", "id": 5, "method": "tools/list"}, headers=self.headers)
        second = self.mcp({"jsonrpc": "2.0", "id": 6, "method": "tools/list"}, headers=self.headers)
        self.assertEqual(first["result"], second["result"])

        listed = first["result"]["tools"]
        self.assertEqual([tool["name"] for tool in listed], TOOL_ORDER)
        for tool in listed:
            with self.subTest(tool=tool["name"]):
                if registry.tool_named(tool["name"]).write:
                    self.assertFalse(tool["annotations"]["readOnlyHint"])
                    self.assertFalse(tool["annotations"]["destructiveHint"])
                    self.assertIn("idempotencyKey", tool["inputSchema"]["properties"])
                else:
                    self.assertEqual(
                        tool["annotations"],
                        {
                            "readOnlyHint": True,
                            "idempotentHint": tool["name"] != "compare_revisions",
                            "openWorldHint": False,
                        },
                    )
                    self.assertNotIn("idempotencyKey", tool["inputSchema"]["properties"])
                self.assertEqual(tool["inputSchema"]["type"], "object")
                self.assertIn("properties", tool["inputSchema"])
        by_name = {tool["name"]: tool for tool in listed}
        self.assertIn("outputSchema", by_name["get_project"])
        self.assertIn("id", by_name["get_project"]["outputSchema"]["properties"])
        self.assertIn("outputSchema", by_name["get_component"])
        self.assertIn("outputSchema", by_name["get_net"])
        self.assertIn("outputSchema", by_name["add_comment"])
        self.assertIn("outputSchema", by_name["reply_to_comment"])
        self.assertIn("outputSchema", by_name["resolve_comment"])

    def test_get_project_matches_the_route_json(self) -> None:
        project = self._project()
        route = self.client.get(f"/api/v1/projects/{project}", headers=self.headers)
        self.assertEqual(route.status_code, 200, route.text)

        result = self.mcp(call("get_project", {"project_id": project}), headers=self.headers)["result"]
        self.assertFalse(result["isError"])
        structured = dict(result["structuredContent"])
        self.assertEqual(result["_meta"], {"source": "prism", "untrusted": True})
        self.assertEqual(structured, route.json())
        self.assertTrue(result["content"][0]["text"].startswith(invoke.DATA_PREFIX))

    def test_results_validate_against_their_output_schema(self) -> None:
        from jsonschema import Draft202012Validator

        project = self._project()
        listed = self.mcp({"jsonrpc": "2.0", "id": 9, "method": "tools/list"}, headers=self.headers)
        schemas = {tool["name"]: tool.get("outputSchema") for tool in listed["result"]["tools"]}
        for name, arguments in (
            ("get_project", {"project_id": project}),
            ("search_projects", {"query": project}),
        ):
            with self.subTest(tool=name):
                self.assertIsNotNone(schemas[name])
                self.assertEqual(schemas[name]["type"], "object")
                result = self.mcp(call(name, arguments), headers=self.headers)["result"]
                self.assertFalse(result["isError"], result)
                Draft202012Validator(schemas[name]).validate(result["structuredContent"])

    def test_search_projects_without_a_query_lists_the_visible_projects(self) -> None:
        # Found by a real MCP client, which had to search for "a" to list projects.
        visible = self._project()
        hidden = self._project(hidden=True)
        result = self.mcp(call("search_projects", {"limit": 500}), headers=self.headers)["result"]
        self.assertFalse(result["isError"], result)
        ids = {row["id"] for row in result["structuredContent"]["results"]}
        self.assertIn(visible, ids)
        self.assertNotIn(hidden, ids)

    def test_a_hidden_project_is_a_tool_execution_error(self) -> None:
        hidden = self._project(hidden=True)
        result = self.mcp(call("get_project", {"project_id": hidden}), headers=self.headers)["result"]
        self.assertTrue(result["isError"])
        self.assertEqual(result["structuredContent"]["error"]["status"], 404)
        self.assertEqual(result["content"][0]["text"], f"{invoke.DATA_PREFIX}\nnot_found: Project not found")

    def test_render_view_refuses_a_hidden_project(self) -> None:
        hidden = self._project(hidden=True)
        result = self.mcp(
            call("render_view", {"project_id": hidden, "view": "pcb"}),
            headers=self.headers,
        )["result"]
        self.assertTrue(result["isError"])
        self.assertEqual(result["structuredContent"]["error"]["status"], 404)
        self.assertIn("not_found", result["content"][0]["text"])

    def test_a_missing_required_argument_is_a_tool_execution_error(self) -> None:
        result = self.mcp(call("get_project", {}), headers=self.headers)["result"]
        self.assertTrue(result["isError"])
        self.assertIn("project_id", result["content"][0]["text"])
        self.assertEqual(result["structuredContent"]["error"]["code"], "invalid-arguments")

    # --------------------------------------------------------------- writes

    def assert_refused(self, name: str, arguments: dict) -> None:
        result = self.mcp(call(name, arguments), headers=self.headers)["result"]
        self.assertTrue(result["isError"], result)
        self.assertEqual(result["structuredContent"]["error"]["code"], "forbidden")
        self.assertIn("forbidden", result["content"][0]["text"])

    def test_a_viewer_without_design_write_cannot_sync(self) -> None:
        self.assert_refused("sync_project", {"project_id": self._project()})

    def test_a_viewer_without_design_write_cannot_start_a_release_build(self) -> None:
        self.assert_refused(
            "start_release_build",
            {"project_id": self._project(), "commit": COMMIT},
        )

    def test_a_viewer_without_catalog_write_cannot_create_a_catalog_draft(self) -> None:
        self.assert_refused(
            "create_catalog_draft",
            {
                "value": "10k",
                "description": "Resistor 10k 1%",
                "datasheet": "https://example.test/r.pdf",
                "manufacturer": "Acme",
                "manufacturer_part_number": "R-10K",
                "change_summary": "Create a resistor draft",
            },
        )

    def test_a_viewer_without_catalog_write_cannot_save_import_drafts(self) -> None:
        self.assert_refused(
            "update_import_proposal",
            {
                "session_id": unique("session"),
                "drafts": {"proposal": {"metadata_overrides": {"value": "10k"}}},
            },
        )

    def test_an_unknown_tool_is_a_protocol_error(self) -> None:
        response = self.mcp(
            {"jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": {"name": "nope"}},
            headers=self.headers,
        )
        self.assertEqual(response["error"]["code"], -32602)

    def test_list_comments_filters_by_status(self) -> None:
        project = self._project()
        with comments_connection() as conn:
            conn.execute(
                """
                INSERT INTO comments
                    (id, project_id, author, timestamp, status, context, location_x, location_y, content)
                VALUES (%s, %s, 'Priya', NOW(), 'OPEN', 'PCB', 0, 0, 'open'),
                       (%s, %s, 'Priya', NOW(), 'RESOLVED', 'PCB', 0, 0, 'resolved')
                """,
                (unique("c"), project, unique("c"), project),
            )
            conn.commit()
        try:
            result = self.mcp(
                call("list_comments", {"project_id": project, "status": "RESOLVED"}),
                headers=self.headers,
            )["result"]
            self.assertFalse(result["isError"])
            statuses = [comment["status"] for comment in result["structuredContent"]["comments"]]
            self.assertEqual(statuses, ["RESOLVED"])
        finally:
            with comments_connection() as conn:
                conn.execute("DELETE FROM comments WHERE project_id = %s", (project,))
                conn.commit()

    # ------------------------------------------------------------- resources

    def test_resources_list_and_templates(self) -> None:
        listed = self.mcp({"jsonrpc": "2.0", "id": 8, "method": "resources/list"}, headers=self.headers)
        self.assertEqual(listed["result"], {"resources": []})

        templates = self.mcp(
            {"jsonrpc": "2.0", "id": 9, "method": "resources/templates/list"}, headers=self.headers
        )["result"]["resourceTemplates"]
        self.assertEqual([template["name"] for template in templates], ["component", "net", "bom"])
        for template in templates:
            self.assertEqual(template["mimeType"], "application/json")
            self.assertIn("prism://project/{project_id}/rev/{commit}", template["uriTemplate"])

    def test_a_bad_resource_uri_is_minus_32602(self) -> None:
        response = self.mcp(
            {"jsonrpc": "2.0", "id": 10, "method": "resources/read", "params": {"uri": "https://nope"}},
            headers=self.headers,
        )
        self.assertEqual(response["error"]["code"], -32602)

    # --------------------------------------------------------------- invoke

    def test_invoke_carries_the_callers_authorization_header(self) -> None:
        probe = registry.Tool(
            name="probe",
            title="Probe",
            description="An admin-only route, used to prove whose token travels.",
            input_schema={"type": "object", "properties": {}},
            route=("get", "/api/v1/settings/access/users"),
            args=lambda arguments: ({}, {}),
            annotations=dict(registry.READ_ONLY_ANNOTATIONS),
        )

        refused = asyncio.run(
            invoke.call_tool(
                self.main.app,
                probe,
                {},
                authorization=f"Bearer {self.viewer_token}",
            )
        )
        self.assertTrue(refused["isError"])
        self.assertIn("forbidden", refused["content"][0]["text"])

        _, admin_token = use_user("admin")
        allowed = asyncio.run(
            invoke.call_tool(
                self.main.app,
                probe,
                {},
                authorization=f"Bearer {admin_token}",
            )
        )
        self.assertFalse(allowed["isError"])

    # -------------------------------------------------------------- citations

    def test_results_that_name_an_element_carry_a_link_and_uri(self) -> None:
        component = registry.present(
            registry.tool_named("get_component"),
            {"project_id": "project/one", "reference": "U1"},
            {
                "structuredContent": {
                    "revision": {"commit": COMMIT},
                    "component": {"reference": "U1", "footprint": "QFN-32"},
                }
            },
        )["structuredContent"]
        expected_uri = f"prism://project/project%2Fone/rev/{COMMIT}/component/U1"
        self.assertEqual(component["uri"], expected_uri)
        self.assertEqual(component["component"]["uri"], expected_uri)
        self.assertEqual(
            component["link"],
            f"{BASE}/project/project%2Fone?section=visualizers&tab=pcb"
            f"&commit={COMMIT}&sel=U1",
        )
        self.assertEqual(component["component"]["link"], component["link"])

        symbol = registry.present(
            registry.tool_named("get_component"),
            {"project_id": "project/one", "reference": "U2"},
            {
                "structuredContent": {
                    "revision": {"commit": COMMIT},
                    "component": {"reference": "U2", "footprint": ""},
                }
            },
        )["structuredContent"]
        self.assertIn("tab=sch", symbol["link"])
        self.assertIn("sel=U2", symbol["link"])

        net = registry.present(
            registry.tool_named("get_net"),
            {"project_id": "project/one", "net": "Power/+12V"},
            {"structuredContent": {"revision": {"commit": COMMIT}, "net": {"name": "Power/+12V"}}},
        )["structuredContent"]
        self.assertEqual(
            net["uri"], f"prism://project/project%2Fone/rev/{COMMIT}/net/Power%2F%2B12V"
        )
        self.assertEqual(net["net"]["uri"], net["uri"])
        self.assertEqual(
            net["link"],
            f"{BASE}/project/project%2Fone?section=visualizers&tab=pcb"
            f"&commit={COMMIT}&nets=Power%252F%252B12V",
        )

        bom = registry.present(
            registry.tool_named("get_bom"),
            {"project_id": "project/one", "revision": COMMIT},
            {"structuredContent": {"commit": COMMIT, "designKey": "k", "columns": [], "lines": []}},
        )["structuredContent"]
        self.assertEqual(bom["uri"], f"prism://project/project%2Fone/rev/{COMMIT}/bom")
        self.assertIn("tab=bom", bom["link"])

    def test_search_rows_link_to_what_they_name(self) -> None:
        found = registry.present(
            registry.tool_named("find_in_design"),
            {"project_id": "project/one", "query": "U"},
            {
                "structuredContent": {
                    "revision": {"commit": COMMIT},
                    "results": [
                        {"kind": "component", "reference": "U1", "footprint": "QFN-32"},
                        {"kind": "component", "reference": "U2", "footprint": ""},
                        {"kind": "net", "name": "Power/+12V"},
                    ],
                }
            },
        )["structuredContent"]
        rows = found["results"]
        self.assertEqual(
            rows[0]["link"],
            f"{BASE}/project/project%2Fone?section=visualizers&tab=pcb"
            f"&commit={COMMIT}&sel=U1",
        )
        self.assertIn("tab=sch", rows[1]["link"])
        self.assertIn("sel=U2", rows[1]["link"])
        self.assertEqual(
            rows[2]["link"],
            f"{BASE}/project/project%2Fone?section=visualizers&tab=pcb"
            f"&commit={COMMIT}&nets=Power%252F%252B12V",
        )


if __name__ == "__main__":
    unittest.main()
