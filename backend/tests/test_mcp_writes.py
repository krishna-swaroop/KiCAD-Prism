"""The write-tool seam (ADR scripting-and-mcp §10, D13–D15).

These drive ``invoke`` against a stub ASGI app and ``/mcp``'s handler with a
stub tool, so they need no database: what is under test is how a write travels
(idempotency key, annotations) and the two outcomes a client must act on, the
scope challenge and the URL handoff.
"""

from __future__ import annotations

import asyncio
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import mcp as mcp_api  # noqa: E402
from app.core import policy  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.security import AuthenticatedUser  # noqa: E402
from app.services.mcp import audit, governance, invoke, registry  # noqa: E402
from app.services.mcp import tools as _tools  # noqa: E402,F401 - registers the tools
from app.services.mcp import tools_writes  # noqa: E402

#: The design and catalog-draft write tools this module checks one by one.
#: Rules every write tool must follow are checked over the registry instead.
DESIGN_WRITE_TOOLS = [
    "sync_project",
    "start_release_build",
    "request_release_approval",
    "create_catalog_draft",
    "update_import_proposal",
]

CHALLENGE = 'Bearer error="insufficient_scope", scope="comments:write", resource_metadata="x"'


class StubApp:
    """Records the request it is sent and answers with a fixed response."""

    def __init__(self, status: int = 201, body: dict | None = None, headers: list | None = None) -> None:
        self.status = status
        self.body = json.dumps(body if body is not None else {"id": "c1"}).encode("utf-8")
        self.headers = headers or []
        self.seen: dict = {}

    async def __call__(self, scope, receive, send) -> None:
        message = await receive()
        self.seen = {
            "method": scope["method"],
            "path": scope["path"],
            "headers": dict(scope["headers"]),
            "body": json.loads(message["body"]) if message["body"] else None,
        }
        await send({"type": "http.response.start", "status": self.status, "headers": self.headers})
        await send({"type": "http.response.body", "body": self.body})


def write_tool(**overrides) -> registry.Tool:
    fields = dict(
        name="stub_add_note",
        title="Add a note",
        description="Stub write tool.",
        input_schema={
            "type": "object",
            "properties": {"project_id": {"type": "string"}, "text": {"type": "string"}},
            "required": ["project_id", "text"],
            "additionalProperties": False,
        },
        route=("post", "/api/v1/projects/{project_id}/comments"),
        args=lambda a: ({"project_id": a["project_id"]}, {}, {"text": a["text"]}),
        annotations=registry.write_annotations(),
        action="comment",
    )
    fields.update(overrides)
    return registry.Tool(**fields)


def caller(auth_type: str, scopes: list[str]) -> AuthenticatedUser:
    return AuthenticatedUser(
        email="agent@example.test",
        name="Agent",
        role="designer",
        auth_type=auth_type,
        client_id="https://client.example/meta.json" if auth_type == policy.MCP_AUTH_TYPE else "",
        scopes=scopes,
    )


class RegistryTests(unittest.TestCase):
    def test_a_write_tool_advertises_an_idempotency_key_and_write_annotations(self) -> None:
        definition = registry.tool_definition(write_tool())
        self.assertIn("idempotencyKey", definition["inputSchema"]["properties"])
        self.assertEqual(definition["inputSchema"]["required"], ["project_id", "text"])
        self.assertFalse(definition["annotations"]["readOnlyHint"])
        self.assertFalse(definition["annotations"]["destructiveHint"])

    def test_a_read_tool_is_unchanged(self) -> None:
        tool = write_tool(action=None, annotations=registry.READ_ONLY_ANNOTATIONS)
        self.assertFalse(tool.write)
        self.assertNotIn("idempotencyKey", registry.tool_definition(tool)["inputSchema"]["properties"])


class RegistryContractTests(unittest.TestCase):
    """What every tool gets from the registry, whichever module declares it."""

    def listed(self) -> list[registry.Tool]:
        with mock.patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            return list(registry.tools())

    def test_tools_list_is_reads_then_writes_then_ops(self) -> None:
        groups = [tool.group for tool in self.listed()]
        self.assertEqual(groups, sorted(groups, key=registry.GROUP_ORDER.index))
        self.assertEqual(set(groups), set(registry.GROUP_ORDER))

    def test_a_tool_s_group_follows_what_it_declares(self) -> None:
        for tool in self.listed():
            with self.subTest(tool=tool.name):
                if tool.group == "write":
                    self.assertIsNotNone(tool.action)
                    self.assertFalse(tool.annotations["readOnlyHint"])
                elif tool.group == "read":
                    self.assertTrue(tool.annotations["readOnlyHint"])

    def test_every_tool_is_documented(self) -> None:
        root = Path(__file__).resolve().parents[2]
        automate = root / "website/src/content/docs/automate"
        pages = sorted(automate.glob("*.md"))
        self.assertTrue(pages, f"{automate} has no pages")
        automate_text = "\n".join(page.read_text(encoding="utf-8") for page in pages)
        adr = (root / "docs/architecture/adr-scripting-and-mcp.md").read_text(
            encoding="utf-8"
        )
        for document, text in (
            ("website/src/content/docs/automate/*.md", automate_text),
            ("docs/architecture/adr-scripting-and-mcp.md", adr),
        ):
            missing = [tool.name for tool in self.listed() if f"`{tool.name}`" not in text]
            self.assertEqual(missing, [], f"{document} does not name these tools")

    def test_a_presenter_binds_to_one_registered_tool(self) -> None:
        with self.assertRaises(ValueError):
            registry.presenter("no_such_tool")(lambda arguments, result: result)
        with self.assertRaises(ValueError):
            registry.presenter("get_bom")(lambda arguments, result: result)

    def test_a_tool_without_a_presenter_passes_results_through(self) -> None:
        result = {"structuredContent": {"x": 1}}
        self.assertIs(registry.present(registry.tool_named("get_job"), {}, result), result)


class WriteToolDefinitionTests(unittest.TestCase):
    def definitions(self) -> dict[str, dict]:
        return {
            name: registry.tool_definition(registry.tool_named(name))
            for name in DESIGN_WRITE_TOOLS
        }

    def test_every_write_tool_advertises_write_annotations_and_an_idempotency_key(self) -> None:
        writes = {
            tool.name: registry.tool_definition(tool)
            for tool in registry.tools()
            if tool.group == "write"
        }
        self.assertTrue(set(DESIGN_WRITE_TOOLS) <= set(writes))
        for name, definition in writes.items():
            with self.subTest(tool=name):
                self.assertEqual(definition["annotations"]["readOnlyHint"], False)
                self.assertEqual(definition["annotations"]["destructiveHint"], False)
                self.assertEqual(definition["annotations"]["openWorldHint"], False)
                self.assertIn("idempotencyKey", definition["inputSchema"]["properties"])
                self.assertEqual(definition["inputSchema"]["type"], "object")

    def test_only_the_job_tools_are_idempotent(self) -> None:
        for name, definition in self.definitions().items():
            with self.subTest(tool=name):
                self.assertEqual(
                    definition["annotations"]["idempotentHint"],
                    name in {"sync_project", "start_release_build"},
                )

    def test_each_tool_names_its_policy_action(self) -> None:
        self.assertEqual(registry.tool_named("sync_project").action, "design")
        self.assertEqual(registry.tool_named("start_release_build").action, "design")
        self.assertEqual(registry.tool_named("request_release_approval").action, "design")
        self.assertEqual(registry.tool_named("create_catalog_draft").action, "catalog_write")
        self.assertEqual(registry.tool_named("update_import_proposal").action, "catalog_write")

    def test_required_arguments(self) -> None:
        self.assertEqual(
            self.definitions()["start_release_build"]["inputSchema"]["required"],
            ["project_id", "commit"],
        )
        self.assertEqual(
            self.definitions()["update_import_proposal"]["inputSchema"]["required"],
            ["session_id", "drafts"],
        )
        self.assertIn(
            "change_summary",
            self.definitions()["create_catalog_draft"]["inputSchema"]["required"],
        )


class WriteRouteTests(unittest.TestCase):
    def call(self, name: str, arguments: dict, body: dict | None = None) -> StubApp:
        app = StubApp(200, body if body is not None else {"id": "c1", "job_id": "j1"})
        result = asyncio.run(
            invoke.call_tool(
                app,
                registry.tool_named(name),
                arguments,
                authorization="Bearer t",
            )
        )
        self.assertFalse(result["isError"], result)
        return app

    def test_sync_project_posts_to_the_sync_route(self) -> None:
        app = self.call("sync_project", {"project_id": "p1", "idempotencyKey": "k-1"})
        self.assertEqual(app.seen["method"], "POST")
        self.assertEqual(app.seen["path"], "/api/v1/projects/p1/sync")
        self.assertIsNone(app.seen["body"])
        self.assertEqual(app.seen["headers"][b"idempotency-key"], b"k-1")

    def test_start_release_build_maps_arguments_to_the_candidate_request(self) -> None:
        app = self.call(
            "start_release_build",
            {
                "project_id": "p1",
                "commit": "a" * 40,
                "config_key": "fabrication",
                "variant": "dvt",
                "board": "board.kicad_pcb",
                "schematic": "root.kicad_sch",
                "bom_preset": "default",
                "idempotencyKey": "k-2",
            },
            {"job": {"id": "j1"}},
        )
        self.assertEqual(app.seen["method"], "POST")
        self.assertEqual(
            app.seen["path"], "/api/v1/projects/p1/release-studio/candidates"
        )
        self.assertEqual(
            app.seen["body"],
            {
                "commit_sha": "a" * 40,
                "config_key": "fabrication",
                "variant": "dvt",
                "board": "board.kicad_pcb",
                "schematic": "root.kicad_sch",
                "bom_preset": "default",
            },
        )
        self.assertEqual(app.seen["headers"][b"idempotency-key"], b"k-2")

    def test_create_catalog_draft_posts_the_request_fields(self) -> None:
        app = self.call(
            "create_catalog_draft",
            {
                "value": "10k",
                "description": "Resistor",
                "datasheet": "https://example.test/r.pdf",
                "manufacturer": "Acme",
                "manufacturer_part_number": "R-10K",
                "change_summary": "Create a resistor draft",
                "extra_fields": {"tolerance": "1%"},
            },
            {"id": "component-1", "workflow_stage": "open"},
        )
        self.assertEqual(app.seen["method"], "POST")
        self.assertEqual(app.seen["path"], "/api/v1/catalog/components")
        self.assertEqual(
            app.seen["body"],
            {
                "value": "10k",
                "description": "Resistor",
                "datasheet": "https://example.test/r.pdf",
                "manufacturer": "Acme",
                "manufacturer_part_number": "R-10K",
                "change_summary": "Create a resistor draft",
                "extra_fields": {"tolerance": "1%"},
            },
        )

    def test_update_import_proposal_puts_the_drafts(self) -> None:
        drafts = {"proposal-1": {"metadata_overrides": {"value": "10k"}}}
        app = self.call(
            "update_import_proposal",
            {"session_id": "session-1", "drafts": drafts},
            {"saved": 1},
        )
        self.assertEqual(app.seen["method"], "PUT")
        self.assertEqual(
            app.seen["path"],
            "/api/v1/catalog/import-sessions/session-1/proposals/drafts",
        )
        self.assertEqual(app.seen["body"], {"drafts": drafts})


class WriteLinkTests(unittest.TestCase):
    def setUp(self) -> None:
        self.enterContext(
            mock.patch.object(settings, "PUBLIC_BASE_URL", "https://prism.test")
        )

    def test_a_queued_sync_links_to_the_project_history(self) -> None:
        result = registry.present(
            registry.tool_named("sync_project"),
            {"project_id": "p1"},
            {"structuredContent": {"job_id": "j1", "status": "started"}},
        )
        self.assertEqual(
            result["structuredContent"]["link"],
            "https://prism.test/project/p1?section=history",
        )

    def test_a_queued_build_links_to_release_studio(self) -> None:
        result = registry.present(
            registry.tool_named("start_release_build"),
            {"project_id": "p1", "commit": "a" * 40},
            {"structuredContent": {"job": {"id": "j1"}}},
        )
        self.assertEqual(
            result["structuredContent"]["link"],
            "https://prism.test/project/p1?section=release-studio",
        )

    def test_an_error_result_is_not_cited(self) -> None:
        result = registry.present(
            registry.tool_named("sync_project"),
            {"project_id": "p1"},
            {"structuredContent": {"error": {"code": "forbidden"}}, "isError": True},
        )
        self.assertNotIn("link", result["structuredContent"])


class HandoffTests(unittest.TestCase):
    def setUp(self) -> None:
        self.enterContext(
            mock.patch.object(settings, "PUBLIC_BASE_URL", "https://prism.test")
        )

    def test_request_release_approval_raises_the_people_only_handoff(self) -> None:
        app = StubApp()
        with self.assertRaises(invoke.HandoffRequired) as raised:
            asyncio.run(
                invoke.call_tool(
                    app,
                    registry.tool_named("request_release_approval"),
                    {"project_id": "p1"},
                    authorization="Bearer t",
                )
            )
        self.assertEqual(
            raised.exception.url, "https://prism.test/project/p1?section=release-studio"
        )
        self.assertIn("person", raised.exception.message)
        self.assertEqual(app.seen, {})


class InvokeTests(unittest.TestCase):
    def test_the_idempotency_key_travels_as_a_header_not_an_argument(self) -> None:
        app = StubApp()
        result = asyncio.run(
            invoke.call_tool(
                app,
                write_tool(),
                {"project_id": "p1", "text": "hi", "idempotencyKey": "k-1"},
                authorization="Bearer t",
            )
        )
        self.assertFalse(result["isError"])
        self.assertEqual(app.seen["headers"][b"idempotency-key"], b"k-1")
        self.assertEqual(app.seen["body"], {"text": "hi"})

    def test_a_bad_idempotency_key_is_an_argument_error(self) -> None:
        result = asyncio.run(
            invoke.call_tool(
                StubApp(), write_tool(), {"project_id": "p1", "text": "hi", "idempotencyKey": 7},
                authorization="Bearer t",
            )
        )
        self.assertTrue(result["isError"])
        self.assertEqual(result["structuredContent"]["error"]["code"], "invalid-arguments")

    def test_a_read_tool_does_not_accept_an_idempotency_key(self) -> None:
        tool = write_tool(action=None, annotations=registry.READ_ONLY_ANNOTATIONS)
        result = asyncio.run(
            invoke.call_tool(
                StubApp(), tool, {"project_id": "p1", "text": "hi", "idempotencyKey": "k"},
                authorization="Bearer t",
            )
        )
        self.assertEqual(result["structuredContent"]["error"]["code"], "invalid-arguments")

    def test_a_route_scope_challenge_raises(self) -> None:
        app = StubApp(
            403,
            {"detail": "comments:write scope required", "code": "forbidden"},
            [(b"www-authenticate", CHALLENGE.encode("latin-1"))],
        )
        with self.assertRaises(invoke.ScopeChallenge) as raised:
            asyncio.run(
                invoke.call_tool(app, write_tool(), {"project_id": "p1", "text": "hi"}, authorization="Bearer t")
            )
        self.assertEqual(raised.exception.challenge, CHALLENGE)

    def test_a_plain_403_stays_a_tool_error(self) -> None:
        app = StubApp(403, {"detail": "no", "code": "forbidden"})
        result = asyncio.run(
            invoke.call_tool(app, write_tool(), {"project_id": "p1", "text": "hi"}, authorization="Bearer t")
        )
        self.assertTrue(result["isError"])


class EndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.enterContext(mock.patch.object(governance, "current", return_value=governance.McpGovernance()))
        self.enterContext(
            mock.patch.object(governance, "project_for_arguments", new=mock.AsyncMock(return_value=None))
        )
        self.enterContext(mock.patch.object(settings, "PUBLIC_BASE_URL", "https://prism.test"))
        self.audit = self.enterContext(mock.patch.object(audit, "record_quietly"))

    def _call(self, tool: registry.Tool, user: AuthenticatedUser, arguments: dict | None = None):
        class Request:
            app = StubApp()

        payload = {
            "jsonrpc": "2.0",
            "id": 9,
            "method": "tools/call",
            "params": {"name": tool.name, "arguments": arguments or {"project_id": "p1", "text": "hi"}},
        }
        with mock.patch.object(registry, "tool_named", return_value=tool):
            return asyncio.run(mcp_api._handle(Request(), payload, "Bearer t", user))

    def test_an_mcp_client_without_the_scope_gets_http_403_with_the_challenge(self) -> None:
        response = self._call(write_tool(), caller(policy.MCP_AUTH_TYPE, ["api:read"]))
        self.assertEqual(response.status_code, 403)
        challenge = response.headers["www-authenticate"]
        self.assertIn('error="insufficient_scope"', challenge)
        self.assertIn('scope="comments:write"', challenge)
        self.assertEqual(json.loads(response.body)["code"], "insufficient-scope")
        self.assertEqual(self.audit.call_args.kwargs["outcome"], "refused")
        self.assertEqual(self.audit.call_args.kwargs["code"], "insufficient-scope")

    def test_an_mcp_client_with_the_scope_reaches_the_route(self) -> None:
        response = self._call(write_tool(), caller(policy.MCP_AUTH_TYPE, ["api:read", "comments:write"]))
        self.assertEqual(response.status_code, 200)
        self.assertFalse(json.loads(response.body)["result"]["isError"])

    def test_a_pat_gets_a_tool_error_not_a_challenge(self) -> None:
        tool = write_tool()
        with mock.patch.object(
            invoke,
            "call_tool",
            new=mock.AsyncMock(side_effect=invoke.ScopeChallenge(CHALLENGE, "comments:write scope required")),
        ):
            response = self._call(tool, caller("pat", ["api:read"]))
        self.assertEqual(response.status_code, 200)
        result = json.loads(response.body)["result"]
        self.assertTrue(result["isError"])
        self.assertEqual(result["structuredContent"]["error"]["code"], "insufficient-scope")

    def test_a_handoff_is_a_url_elicitation_error(self) -> None:
        async def execute(app, arguments, authorization, request):
            invoke.handoff("https://prism.test/project/p1?section=release-studio", "Approve the release in Prism.")

        tool = write_tool(execute=execute)
        response = self._call(tool, caller(policy.MCP_AUTH_TYPE, ["api:read", "comments:write"]))
        error = json.loads(response.body)["error"]
        self.assertEqual(error["code"], mcp_api.URL_ELICITATION_REQUIRED)
        elicitation = error["data"]["elicitations"][0]
        self.assertEqual(elicitation["mode"], "url")
        self.assertEqual(elicitation["url"], "https://prism.test/project/p1?section=release-studio")
        self.assertTrue(elicitation["elicitationId"])
        self.assertEqual(self.audit.call_args.kwargs["code"], "handoff")

    def test_request_release_approval_elicits_the_project_release_page(self) -> None:
        tool = registry.tool_named("request_release_approval")
        response = self._call(
            tool,
            caller(policy.MCP_AUTH_TYPE, ["api:read", "design:write"]),
            {"project_id": "p1"},
        )
        error = json.loads(response.body)["error"]
        self.assertEqual(error["code"], mcp_api.URL_ELICITATION_REQUIRED)
        self.assertEqual(
            error["data"]["elicitations"][0]["url"],
            "https://prism.test/project/p1?section=release-studio",
        )
        self.assertEqual(self.audit.call_args.kwargs["code"], "handoff")


if __name__ == "__main__":
    unittest.main()
