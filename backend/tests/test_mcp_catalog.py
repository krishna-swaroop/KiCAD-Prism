"""The catalog authoring tools (ADR scripting-and-mcp §12).

They drive ``invoke`` against a stub ASGI app that answers each route in turn,
so what is under test is the requests a tool makes: the guarded write's
``If-Match``, the argument names it maps, the validation wait, the preview
images, and the approval handoff that never calls a route.
"""

from __future__ import annotations

import asyncio
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.services.mcp import invoke, registry  # noqa: E402
from app.services.mcp import tools as _tools  # noqa: E402,F401
from app.services.mcp import tools_catalog_writes  # noqa: E402

READ_TOOLS = ["list_catalog_fields", "search_catalog_assets", "check_catalog_asset"]
WRITE_TOOLS = [
    "update_catalog_component",
    "create_asset_upload",
    "attach_catalog_asset",
    "reuse_catalog_asset",
    "validate_catalog_component",
    "update_catalog_representation",
    "remove_catalog_representation",
    "move_catalog_component",
    "request_catalog_approval",
]


class SequenceApp:
    """Answers each request with the next ``(status, body)`` and records them all."""

    def __init__(self, *responses: tuple[int, dict]) -> None:
        self.responses = list(responses)
        self.seen: list[dict] = []

    async def __call__(self, scope, receive, send) -> None:
        message = await receive()
        self.seen.append(
            {
                "method": scope["method"],
                "path": scope["path"],
                "query": scope["query_string"].decode(),
                "headers": dict(scope["headers"]),
                "body": json.loads(message["body"]) if message["body"] else None,
            }
        )
        status, body = self.responses.pop(0)
        await send({"type": "http.response.start", "status": status, "headers": []})
        await send({"type": "http.response.body", "body": json.dumps(body).encode()})


def run(app: SequenceApp, name: str, arguments: dict) -> dict:
    return asyncio.run(
        invoke.call_tool(app, registry.tool_named(name), arguments, authorization="Bearer t")
    )


class CatalogToolDefinitionTests(unittest.TestCase):
    def test_the_catalog_tools_are_grouped_as_reads_and_writes(self) -> None:
        self.assertEqual({registry.tool_named(name).group for name in READ_TOOLS}, {"read"})
        self.assertEqual({registry.tool_named(name).group for name in WRITE_TOOLS}, {"write"})

    def test_every_catalog_tool_needs_catalog_write_except_the_plain_reads(self) -> None:
        for name in READ_TOOLS + WRITE_TOOLS:
            with self.subTest(tool=name):
                tool = registry.tool_named(name)
                expected = None if name in {"list_catalog_fields", "search_catalog_assets"} else "catalog_write"
                self.assertEqual(tool.action, expected)
                self.assertEqual(tool.write, name in WRITE_TOOLS)

    def test_the_move_tool_offers_only_the_stages_an_agent_may_reach(self) -> None:
        schema = registry.tool_definition(registry.tool_named("move_catalog_component"))["inputSchema"]
        self.assertEqual(schema["properties"]["stage"]["enum"], ["in_progress", "qa_review"])
        result = run(SequenceApp(), "move_catalog_component", {"component_id": "c1", "stage": "done"})
        self.assertTrue(result["isError"])
        self.assertEqual(result["structuredContent"]["error"]["code"], "invalid-arguments")


class GuardedWriteTests(unittest.TestCase):
    def setUp(self) -> None:
        patcher = patch.object(settings, "PUBLIC_BASE_URL", "https://prism.test")
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_update_reads_the_revision_then_patches_with_if_match(self) -> None:
        app = SequenceApp((200, {"id": "c1", "current_revision_id": "r7"}), (200, {"id": "c1"}))
        result = run(
            app,
            "update_catalog_component",
            {
                "component_id": "c1",
                "datasheet": "https://st.test/ds.pdf",
                "manufacturer_part_number": "STM32N657X0H3Q",
                "extra_fields": {"package_pins": "264"},
                "change_summary": "Fill metadata",
            },
        )
        self.assertFalse(result["isError"], result)
        read, write = app.seen
        self.assertEqual((read["method"], read["path"]), ("GET", "/api/v1/catalog/components/c1"))
        self.assertEqual((write["method"], write["path"]), ("PATCH", "/api/v1/catalog/components/c1"))
        self.assertEqual(write["headers"][b"if-match"], b'"component:c1:r7"')
        self.assertEqual(
            write["body"],
            {
                "datasheet_url": "https://st.test/ds.pdf",
                "mpn": "STM32N657X0H3Q",
                "extra_fields": {"package_pins": "264"},
                "change_summary": "Fill metadata",
            },
        )
        self.assertEqual(
            result["structuredContent"]["link"],
            "https://prism.test/?section=library-manager&libraryView=catalog&component=c1&componentTab=overview",
        )

    def test_a_given_revision_is_sent_without_reading(self) -> None:
        app = SequenceApp((200, {"mode": "imported"}))
        run(
            app,
            "attach_catalog_asset",
            {"component_id": "c1", "asset_type": "3dmodel", "upload_id": "upl_" + "a" * 32, "revision_id": "r9"},
        )
        (write,) = app.seen
        self.assertEqual(write["path"], "/api/v1/catalog/components/c1/assets/3dmodel/attach")
        self.assertEqual(write["headers"][b"if-match"], b'"component:c1:r9"')
        self.assertEqual(write["body"], {"upload_id": "upl_" + "a" * 32})

    def test_a_stale_revision_comes_back_as_the_route_s_error(self) -> None:
        app = SequenceApp((412, {"detail": "head moved", "code": "revision_conflict"}))
        result = run(
            app, "reuse_catalog_asset", {"component_id": "c1", "asset_type": "footprint", "asset_id": "a1", "revision_id": "r1"}
        )
        self.assertTrue(result["isError"])
        self.assertEqual(app.seen[0]["body"], {"asset_id": "a1"})

    def test_moving_to_review_points_at_the_reviewer_s_page(self) -> None:
        app = SequenceApp((200, {"current_revision_id": "r2"}), (200, {"id": "c1", "workflow_stage": "qa_review"}))
        result = run(app, "move_catalog_component", {"component_id": "c1", "stage": "qa_review", "note": "Ready"})
        self.assertEqual(app.seen[1]["body"], {"workflow_stage": "qa_review", "review_note": "Ready"})
        self.assertIn("QA reviewer", result["content"][0]["text"])


def _pair(rep_id: str, symbol: str, footprint: str, default: bool = False) -> dict:
    return {"id": rep_id, "is_default": default, "symbol": {"id": symbol}, "footprint": {"id": footprint}}


class RepresentationToolTests(unittest.TestCase):
    def test_update_patches_the_representation_with_if_match(self) -> None:
        app = SequenceApp((200, {"current_revision_id": "r3"}), (200, {"id": "c1"}))
        result = run(
            app,
            "update_catalog_representation",
            {"component_id": "c1", "representation_id": "rep1", "footprint_asset_id": "fp2", "is_default": True},
        )
        self.assertFalse(result["isError"], result)
        write = app.seen[1]
        self.assertEqual((write["method"], write["path"]), ("PATCH", "/api/v1/catalog/components/c1/representations/rep1"))
        self.assertEqual(write["headers"][b"if-match"], b'"component:c1:r3"')
        self.assertEqual(
            write["body"],
            {"footprint_asset_id": "fp2", "is_default": True, "change_summary": "Update component representation"},
        )

    def test_remove_detaches_only_assets_no_other_pair_uses(self) -> None:
        before = {
            "current_revision_id": "r5",
            "representations": [_pair("keep", "sym2", "fp2", True), _pair("old", "sym2", "fp1")],
        }
        after = {"current_revision_id": "r6", "representations": [_pair("keep", "sym2", "fp2", True)]}
        app = SequenceApp((200, before), (200, after), (200, {"component": {**after, "current_revision_id": "r7"}}))
        result = run(app, "remove_catalog_representation", {"component_id": "c1", "representation_id": "old"})
        self.assertFalse(result["isError"], result)
        _, remove, detach = app.seen
        self.assertEqual((remove["method"], remove["path"]), ("DELETE", "/api/v1/catalog/components/c1/representations/old"))
        self.assertEqual(remove["headers"][b"if-match"], b'"component:c1:r5"')
        self.assertIsNone(remove["body"])
        self.assertEqual((detach["method"], detach["path"]), ("DELETE", "/api/v1/catalog/components/c1/assets/id/fp1"))
        self.assertEqual(detach["headers"][b"if-match"], b'"component:c1:r6"')
        self.assertEqual(result["structuredContent"]["detached_asset_ids"], ["fp1"])

    def test_keep_assets_skips_the_detach(self) -> None:
        before = {"current_revision_id": "r5", "representations": [_pair("keep", "s", "f", True), _pair("old", "s1", "f1")]}
        app = SequenceApp((200, before), (200, {"current_revision_id": "r6", "representations": []}))
        result = run(
            app, "remove_catalog_representation", {"component_id": "c1", "representation_id": "old", "keep_assets": True}
        )
        self.assertEqual(len(app.seen), 2)
        self.assertEqual(result["structuredContent"]["detached_asset_ids"], [])

    def test_an_unknown_representation_calls_no_write(self) -> None:
        app = SequenceApp((200, {"current_revision_id": "r5", "representations": []}))
        result = run(app, "remove_catalog_representation", {"component_id": "c1", "representation_id": "nope"})
        self.assertTrue(result["isError"])
        self.assertEqual(len(app.seen), 1)


class ValidationToolTests(unittest.TestCase):
    def test_it_waits_for_the_job_and_returns_the_findings(self) -> None:
        app = SequenceApp(
            (200, {"job_id": "j1", "status": "queued"}),
            (200, {"job_id": "j1", "status": "running"}),
            (200, {"job_id": "j1", "status": "completed"}),
            (200, {"summary": {"status": "failed", "error_count": 1}, "runs": []}),
        )
        with patch.object(tools_catalog_writes, "VALIDATION_POLL_SECONDS", 0):
            result = run(app, "validate_catalog_component", {"component_id": "c1"})
        self.assertFalse(result["isError"], result)
        self.assertEqual(
            [(seen["method"], seen["path"]) for seen in app.seen],
            [
                ("POST", "/api/v1/catalog/components/c1/validate"),
                ("GET", "/api/v1/catalog/validation/jobs/j1"),
                ("GET", "/api/v1/catalog/validation/jobs/j1"),
                ("GET", "/api/v1/catalog/components/c1/validation"),
            ],
        )
        self.assertEqual(result["structuredContent"]["summary"]["error_count"], 1)

    def test_a_failed_job_is_an_error(self) -> None:
        app = SequenceApp((200, {"job_id": "j1"}), (200, {"status": "failed"}))
        result = run(app, "validate_catalog_component", {"component_id": "c1"})
        self.assertTrue(result["isError"])


class CheckToolTests(unittest.TestCase):
    def test_previews_become_image_blocks(self) -> None:
        app = SequenceApp(
            (
                200,
                {
                    "asset_type": "symbol",
                    "name": "U",
                    "names": ["U"],
                    "sha256": "s",
                    "readable": True,
                    "kicad_message": "",
                    "klc": {"status": "warning", "error_count": 0, "warning_count": 2, "findings": []},
                    "previews": [{"unit": 1, "png_base64": "iVBOR"}, {"unit": 2, "png_base64": "iVBOS"}],
                },
            )
        )
        result = run(app, "check_catalog_asset", {"asset_type": "symbol", "content": "(kicad_symbol_lib)"})
        self.assertEqual(app.seen[0]["body"], {"asset_type": "symbol", "content": "(kicad_symbol_lib)"})
        images = [block for block in result["content"] if block["type"] == "image"]
        self.assertEqual([image["data"] for image in images], ["iVBOR", "iVBOS"])
        self.assertNotIn("previews", result["structuredContent"])
        self.assertEqual(result["structuredContent"]["preview_units"], [1, 2])
        self.assertIn("2 warnings", result["content"][-1]["text"])


class ApprovalHandoffTests(unittest.TestCase):
    def test_approval_is_handed_to_a_person_without_a_route(self) -> None:
        app = SequenceApp()
        with patch.object(settings, "PUBLIC_BASE_URL", "https://prism.test"):
            with self.assertRaises(invoke.HandoffRequired) as raised:
                run(app, "request_catalog_approval", {"component_id": "c1"})
        self.assertEqual(app.seen, [])
        self.assertIn("component=c1", raised.exception.url)


if __name__ == "__main__":
    unittest.main()
