#!/usr/bin/env python3
"""Generate the frontend's supply API types from the OpenAPI document.

``sdk/python/openapi.json`` is authoritative (``backend/tests/test_sdk_drift.py``
keeps it equal to the live API). This writes, as TypeScript, every model a typed
supply operation names: the operation's response model and its request body,
and the models those refer to. An operation is typed once its route declares a
``response_model``; untyped routes are left out, so supply moves over area by
area. ``backend/tests/test_supply_types.py`` fails when the committed module no
longer matches the document.

Usage::

    python3 scripts/export_supply_types.py            # write the module
    python3 scripts/export_supply_types.py --check    # exit 1 on drift
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
OPENAPI_PATH = REPO_ROOT / "sdk" / "python" / "openapi.json"
OUTPUT_PATH = REPO_ROOT / "frontend" / "src" / "types" / "supply.generated.ts"
SUPPLY_PATH = re.compile(r"^/api/v1/supply/")
# Pydantic names a generic model's schema ``Items_SupplyWorkItem_``; TypeScript gets ``Items<SupplyWorkItem>``.
GENERIC = re.compile(r"^(Items|Page)_(\w+?)_$")
REF = "#/components/schemas/"
IDENTIFIER = re.compile(r"^[A-Za-z_$][\w$]*$")


class ExportError(Exception):
    pass


def _ref_name(schema: dict[str, Any]) -> str | None:
    ref = schema.get("$ref")
    return ref[len(REF):] if isinstance(ref, str) and ref.startswith(REF) else None


def _refs(schema: Any) -> set[str]:
    found: set[str] = set()
    if isinstance(schema, dict):
        if name := _ref_name(schema):
            found.add(name)
        for value in schema.values():
            found |= _refs(value)
    elif isinstance(schema, list):
        for value in schema:
            found |= _refs(value)
    return found


def _json_schema(body: dict[str, Any] | None) -> dict[str, Any]:
    return ((body or {}).get("content") or {}).get("application/json", {}).get("schema") or {}


def typed_roots(document: dict[str, Any]) -> set[str]:
    """The models typed supply operations name directly."""

    roots: set[str] = set()
    for path, item in document.get("paths", {}).items():
        if not SUPPLY_PATH.match(path):
            continue
        for operation in item.values():
            if not isinstance(operation, dict) or "responses" not in operation:
                continue
            answered = set()
            for status, response in operation["responses"].items():
                if str(status).startswith("2"):
                    answered |= _refs(_json_schema(response))
            if answered:
                roots |= answered | _refs(_json_schema(operation.get("requestBody")))
    return roots


def reachable(document: dict[str, Any], roots: set[str]) -> list[str]:
    schemas = document.get("components", {}).get("schemas", {})
    seen: set[str] = set()
    pending = list(roots)
    while pending:
        name = pending.pop()
        if name in seen:
            continue
        if name not in schemas:
            raise ExportError(f"{name} is referred to but not defined")
        seen.add(name)
        pending.extend(_refs(schemas[name]) - seen)
    clashing = sorted(name for name in seen if "__" in name)
    if clashing:
        raise ExportError(f"two models share a name; give each its own: {', '.join(clashing)}")
    return sorted(seen)


def _type_name(name: str) -> str:
    match = GENERIC.match(name)
    return f"{match.group(1)}<{match.group(2)}>" if match else name


def _literal(value: Any) -> str:
    return json.dumps(value)


def render_type(schema: dict[str, Any], indent: str = "") -> str:
    if name := _ref_name(schema):
        return _type_name(name)
    if "const" in schema:
        return _literal(schema["const"])
    if "enum" in schema:
        return " | ".join(_literal(value) for value in schema["enum"])
    for key in ("anyOf", "oneOf"):
        if key in schema:
            members = []
            for member in schema[key]:
                text = render_type(member, indent)
                if text not in members:
                    members.append(text)
            return " | ".join(members)
    kind = schema.get("type")
    if isinstance(kind, list):
        return " | ".join(render_type({**schema, "type": one}, indent) for one in kind)
    if kind == "array" and "prefixItems" in schema:
        return "[" + ", ".join(render_type(item, indent) for item in schema["prefixItems"]) + "]"
    if kind == "array":
        inner = render_type(schema.get("items") or {}, indent)
        return f"Array<{inner}>" if " " in inner and not inner.startswith("{") else f"{inner}[]"
    if kind == "object" or "properties" in schema:
        if schema.get("properties"):
            return _object_body(schema, indent)
        extra = schema.get("additionalProperties")
        value = render_type(extra, indent) if isinstance(extra, dict) and extra else "unknown"
        return f"Record<string, {value}>"
    return {"string": "string", "integer": "number", "number": "number", "boolean": "boolean", "null": "null"}.get(kind, "unknown")


def _doc(text: str | None, indent: str) -> list[str]:
    if not text:
        return []
    lines = [line.rstrip() for line in text.strip().splitlines()]
    if len(lines) == 1:
        return [f"{indent}/** {lines[0]} */"]
    return [f"{indent}/**", *(f"{indent} * {line}".rstrip() for line in lines), f"{indent} */"]


def _object_body(schema: dict[str, Any], indent: str) -> str:
    required = set(schema.get("required") or [])
    inner = indent + "  "
    lines = ["{"]
    for field, value in schema.get("properties", {}).items():
        lines.extend(_doc(value.get("description"), inner))
        optional = "" if field in required else "?"
        name = field if IDENTIFIER.match(field) else json.dumps(field)
        lines.append(f"{inner}{name}{optional}: {render_type(value, inner)};")
    lines.append(f"{indent}}}")
    return "\n".join(lines)


def _declaration(name: str, schema: dict[str, Any], generic_arg: str | None = None) -> str:
    match = GENERIC.match(name)
    title = f"{match.group(1)}<T>" if match else name
    body = _object_body(schema, "") if schema.get("type") == "object" or "properties" in schema else None
    lines = _doc(schema.get("description"), "")
    if body is None:
        lines.append(f"export type {title} = {render_type(schema)};")
    else:
        if generic_arg:
            body = re.sub(rf"\b{re.escape(generic_arg)}\b", "T", body)
        lines.append(f"export interface {title} {body}")
    return "\n".join(lines)


def render_module(document: dict[str, Any]) -> str:
    schemas = document["components"]["schemas"]
    names = reachable(document, typed_roots(document))
    blocks: list[str] = []
    generics_done: set[str] = set()
    for name in names:
        match = GENERIC.match(name)
        if match:
            if match.group(1) in generics_done:
                continue
            generics_done.add(match.group(1))
            blocks.append(_declaration(name, schemas[name], generic_arg=match.group(2)))
        else:
            blocks.append(_declaration(name, schemas[name]))
    header = (
        "// Generated by scripts/export_supply_types.py from sdk/python/openapi.json.\n"
        "// Do not edit by hand; backend/tests/test_supply_types.py fails when this file is stale.\n"
        "//\n"
        "// The models typed supply routes declare. Untyped routes still use types/supply.ts.\n"
    )
    return header + "\n" + "\n\n".join(blocks) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python3 scripts/export_supply_types.py")
    parser.add_argument("--check", action="store_true", help="exit 1 when the committed module is stale")
    args = parser.parse_args(argv)
    try:
        text = render_module(json.loads(OPENAPI_PATH.read_text(encoding="utf-8")))
    except ExportError as error:
        print(f"export_supply_types: {error}", file=sys.stderr)
        return 2
    if args.check:
        current = OUTPUT_PATH.read_text(encoding="utf-8") if OUTPUT_PATH.exists() else ""
        if current != text:
            print(f"{OUTPUT_PATH.relative_to(REPO_ROOT)} is stale; run python3 scripts/export_supply_types.py", file=sys.stderr)
            return 1
        return 0
    OUTPUT_PATH.write_text(text, encoding="utf-8")
    print(f"wrote {OUTPUT_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
