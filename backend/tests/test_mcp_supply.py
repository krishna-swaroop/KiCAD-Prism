"""The supply tools (ADR scripting-and-mcp §13).

They drive ``invoke`` against a stub ASGI app that answers each route in turn, so what is under test is the requests a tool makes
and how its answer is shaped: the component's approved parts, the trimmed project rollup and the one fresh read.
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.core.config import settings  # noqa: E402
from app.services.mcp import invoke, registry  # noqa: E402
from app.services.mcp import tools as _tools  # noqa: E402,F401
from test_mcp_catalog import SequenceApp  # noqa: E402

READ_TOOLS = ["get_project_supply", "get_component_supply", "find_part_alternatives"]
# Following a component is anyone who reads supply (supply_follow); reading now spends the reserve (supply_write).
WRITE_TOOLS = {"watch_component": "supply_follow", "refresh_component_supply": "supply_write"}
PARTS = {
    "parts": [
        {"part_id": "p_main", "role": "main", "approval": "approved", "manufacturer": "Acme", "mpn": "LM-1"},
        {"part_id": "p_alt", "role": "alternate", "approval": "approved", "manufacturer": "Acme", "mpn": "LM-2"},
        {"part_id": "p_wait", "role": "alternate", "approval": "pending", "manufacturer": "Acme", "mpn": "LM-3"},
    ]
}


def detail(total: int | None) -> dict:
    return {"stock": total, "status": "ok", "problem_text": "", "lifecycle": "active", "tracking": None, "price": {}, "history": [1] * 90}


def run(app: SequenceApp, name: str, arguments: dict) -> dict:
    tool = registry.tool_named(name)
    return registry.present(tool, arguments, asyncio.run(invoke.call_tool(app, tool, arguments, authorization="Bearer t")))


class SupplyToolTests(unittest.TestCase):
    def setUp(self) -> None:
        patcher = patch.object(settings, "PUBLIC_BASE_URL", "https://prism.example")
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_reads_are_reads_and_writes_need_their_route_role(self) -> None:
        for name in READ_TOOLS + list(WRITE_TOOLS):
            with self.subTest(tool=name):
                tool = registry.tool_named(name)
                self.assertEqual(tool.group, "write" if name in WRITE_TOOLS else "read")
                self.assertEqual(tool.action, WRITE_TOOLS.get(name))

    def test_a_component_reads_its_approved_parts_local_stock_and_watch(self) -> None:
        app = SequenceApp(
            (200, PARTS), (200, detail(120)), (200, detail(5000)),
            (200, {"available": 40.0, "held": 0.0, "at_vendor": 10.0, "uom": "pcs", "mixed_units": False, "rows": [{}, {}]}),
            (200, {"watch": None}),
        )
        result = run(app, "get_component_supply", {"component_id": "c1"})
        self.assertFalse(result["isError"])
        self.assertEqual([seen["path"] for seen in app.seen], [
            "/api/v1/supply/components/c1/parts", "/api/v1/supply/parts/p_main", "/api/v1/supply/parts/p_alt",
            "/api/v1/supply/components/c1/local-stock", "/api/v1/supply/tracking/components/c1",
        ])
        structured = result["structuredContent"]
        self.assertEqual([part["mpn"] for part in structured["parts"]], ["LM-1", "LM-2"], "a pending alternate is not read")
        self.assertEqual(structured["distributor_stock"], 5120)
        self.assertEqual(structured["local_stock"], {"available": 40.0, "held": 0.0, "at_vendor": 10.0, "uom": "pcs", "mixed_units": False, "records": 2})
        self.assertNotIn("history", structured["parts"][0], "the part sheet's history is not passed on")
        self.assertTrue(structured["link"].startswith("https://prism.example/?section=library-manager"))

    def test_a_refused_component_read_is_the_routes_refusal(self) -> None:
        app = SequenceApp((404, {"detail": "Component not found"}))
        result = run(app, "get_component_supply", {"component_id": "nope"})
        self.assertTrue(result["isError"])
        self.assertEqual(len(app.seen), 1)

    def test_alternatives_are_read_for_the_main_part(self) -> None:
        app = SequenceApp((200, PARTS), (200, {"candidates": [{"mpn": "X-1", "grade": "direct"}]}))
        result = run(app, "find_part_alternatives", {"component_id": "c1"})
        self.assertEqual(app.seen[1]["path"], "/api/v1/supply/parts/p_main/cross-reference")
        self.assertEqual(result["structuredContent"]["approved_alternates"], ["LM-2"])

    def test_a_component_without_a_part_has_nothing_to_read(self) -> None:
        result = run(SequenceApp((200, {"parts": []})), "refresh_component_supply", {"component_id": "c1"})
        self.assertEqual(result["structuredContent"]["error"]["code"], "no_part")

    def test_refresh_reads_the_main_part_once(self) -> None:
        app = SequenceApp((200, PARTS), (200, {"read": True}))
        result = run(app, "refresh_component_supply", {"component_id": "c1", "idempotencyKey": "k1"})
        self.assertFalse(result["isError"])
        self.assertEqual((app.seen[1]["method"], app.seen[1]["path"]), ("POST", "/api/v1/supply/parts/p_main/refresh"))
        self.assertEqual(app.seen[1]["headers"].get(b"idempotency-key"), b"k1")

    def test_watch_puts_the_packaging(self) -> None:
        app = SequenceApp((200, {"watch": {"packaging": "any"}}))
        run(app, "watch_component", {"component_id": "c1"})
        self.assertEqual((app.seen[0]["method"], app.seen[0]["path"], app.seen[0]["body"]), ("PUT", "/api/v1/supply/tracking/components/c1", {"packaging": "any"}))

    def test_a_project_lists_only_the_lines_that_need_a_look(self) -> None:
        line = {"key": "k", "manufacturer": "Acme", "mpn": "OK-1", "references": "R1", "quantity": 1, "need": 100, "status": "ok", "stock": 900,
                "short": False, "lifecycle": "active", "in_library": True, "prism_id": "c1", "alternates": []}
        overview = {
            "available": True, "variant": "", "build_quantity": 100, "rollup": {"can_build": 9},
            "parts": [
                line,
                line | {"key": "k2", "mpn": "BAD-1", "status": "fatal"},
                line | {"key": "k3", "mpn": "SHORT-1", "short": True, "alternates": [{"mpn": "ALT-1"}]},
                line | {"key": "k4", "mpn": "NEW-1", "in_library": False, "status": None},
            ],
            "releases": [{"tag": "v1", "status": "ok", "health": 90.0, "changed_since": [{"part_id": "p"}]}],
        }
        app = SequenceApp((200, overview))
        result = run(app, "get_project_supply", {"project_id": "prj", "build_quantity": 100})
        self.assertEqual((app.seen[0]["path"], app.seen[0]["query"]), ("/api/v1/supply/projects/prj/supply", "build_quantity=100"))
        structured = result["structuredContent"]
        self.assertEqual([part["mpn"] for part in structured["attention"]], ["BAD-1", "SHORT-1", "NEW-1"])
        self.assertEqual(structured["attention"][1]["alternates"], ["ALT-1"])
        self.assertEqual(structured["releases"], [{"tag": "v1", "status": "ok", "health": 90.0, "changed_since": 1}])
        self.assertEqual((structured["lines"], structured["link"]), (4, "https://prism.example/project/prj?section=supply"))
        self.assertIn("SHORT-1", result["content"][0]["text"], "the text block is the shaped result")

    def test_a_project_whose_bom_was_not_read_says_so(self) -> None:
        result = run(SequenceApp((200, {"available": False, "variants": ["lite"], "releases": []})), "get_project_supply", {"project_id": "prj"})
        self.assertEqual(result["structuredContent"], {"project_id": "prj", "available": False, "variants": ["lite"]})


if __name__ == "__main__":
    unittest.main()
