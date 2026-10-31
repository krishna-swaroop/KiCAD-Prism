"""The frontend's supply types are generated from the OpenAPI document (supply decision D4).

``scripts/export_supply_types.py`` writes ``frontend/src/types/supply.generated.ts``
from ``sdk/python/openapi.json``; ``test_sdk_drift`` keeps that document equal to
the live API, and this keeps the TypeScript equal to the document.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
EXPORT_SCRIPT = REPO_ROOT / "scripts" / "export_supply_types.py"

_spec = importlib.util.spec_from_file_location("export_supply_types", EXPORT_SCRIPT)
exporter = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(exporter)


def _document(paths: dict, schemas: dict) -> dict:
    return {"paths": paths, "components": {"schemas": schemas}}


def _answering(ref: str, body: str | None = None) -> dict:
    operation = {"responses": {"200": {"content": {"application/json": {"schema": {"$ref": f"#/components/schemas/{ref}"}}}}}}
    if body:
        operation["requestBody"] = {"content": {"application/json": {"schema": {"$ref": f"#/components/schemas/{body}"}}}}
    return operation


class SupplyTypesTests(unittest.TestCase):
    def test_the_committed_module_matches_the_document(self) -> None:
        result = subprocess.run([sys.executable, str(EXPORT_SCRIPT), "--check"], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_only_typed_supply_operations_are_exported(self) -> None:
        document = _document(
            {
                "/api/v1/supply/things": {"get": _answering("Thing"), "post": _answering("Thing", body="NewThing")},
                "/api/v1/supply/loose": {"post": {"requestBody": {"content": {"application/json": {"schema": {"$ref": "#/components/schemas/Loose"}}}},
                                                  "responses": {"200": {"content": {"application/json": {"schema": {"type": "object"}}}}}}},
                "/api/v1/projects": {"get": _answering("Project")},
            },
            {
                "Thing": {"type": "object", "properties": {"id": {"type": "string"}, "part": {"$ref": "#/components/schemas/Part"}}, "required": ["id"]},
                "Part": {"type": "object", "properties": {"mpn": {"type": "string"}}, "required": ["mpn"]},
                "NewThing": {"type": "object", "properties": {"name": {"type": "string"}}},
                "Loose": {"type": "object", "properties": {}},
                "Project": {"type": "object", "properties": {}},
            },
        )
        self.assertEqual(exporter.reachable(document, exporter.typed_roots(document)), ["NewThing", "Part", "Thing"])

    def test_types_render_as_typescript(self) -> None:
        schema = {
            "type": "object",
            "description": "A thing.",
            "required": ["state", "seen", "tags", "note", "range"],
            "properties": {
                "state": {"enum": ["open", "done"], "type": "string"},
                "seen": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                "tags": {"type": "array", "items": {"anyOf": [{"type": "string"}, {"type": "integer"}]}},
                "note": {"type": "object", "additionalProperties": {"type": "number"}},
                "extra": {"type": "object", "additionalProperties": True},
                "range": {"type": "array", "prefixItems": [{"type": "integer"}, {"type": "integer"}], "maxItems": 2, "minItems": 2},
            },
        }
        self.assertEqual(exporter._declaration("Thing", schema), "\n".join([
            "/** A thing. */",
            "export interface Thing {",
            '  state: "open" | "done";',
            "  seen: string | null;",
            "  tags: Array<string | number>;",
            "  note: Record<string, number>;",
            "  extra?: Record<string, unknown>;",
            "  range: [number, number];",
            "}",
        ]))

    def test_a_key_that_is_not_an_identifier_is_quoted(self) -> None:
        schema = {"type": "object", "properties": {"4w": {"type": "integer"}, "plain": {"type": "integer"}}, "required": ["4w", "plain"]}
        self.assertEqual(exporter._declaration("Weeks", schema), 'export interface Weeks {\n  "4w": number;\n  plain: number;\n}')

    def test_a_generic_list_is_one_typescript_generic(self) -> None:
        document = _document(
            {"/api/v1/supply/a": {"get": _answering("Items_A_")}, "/api/v1/supply/b": {"get": _answering("Items_B_")}},
            {
                "Items_A_": {"type": "object", "properties": {"items": {"type": "array", "items": {"$ref": "#/components/schemas/A"}}}, "required": ["items"]},
                "Items_B_": {"type": "object", "properties": {"items": {"type": "array", "items": {"$ref": "#/components/schemas/B"}}}, "required": ["items"]},
                "A": {"type": "object", "properties": {}},
                "B": {"type": "object", "properties": {}},
            },
        )
        module = exporter.render_module(document)
        self.assertEqual(module.count("export interface Items<T>"), 1)
        self.assertIn("  items: T[];", module)

    def test_two_models_with_one_name_are_refused(self) -> None:
        document = _document({"/api/v1/supply/a": {"get": _answering("app__api__x__Thing")}}, {"app__api__x__Thing": {"type": "object", "properties": {}}})
        with self.assertRaises(exporter.ExportError):
            exporter.reachable(document, exporter.typed_roots(document))


if __name__ == "__main__":
    unittest.main()
