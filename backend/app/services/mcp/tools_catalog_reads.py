"""Catalog reads for component authoring (ADR scripting-and-mcp §12).

An agent filling in a component needs three things before it writes: which
metadata fields this Prism defines (``list_catalog_fields``), whether the
library already holds the footprint or symbol it needs
(``search_catalog_assets``), and whether a file it made will be accepted
(``check_catalog_asset``). The check stores nothing; it returns KiCad's own
read error, the KLC findings and a PNG of each unit, so the agent can fix the
file before it becomes a revision.
"""

from __future__ import annotations

import json
from typing import Any

from app.services.mcp import invoke
from app.services.mcp.registry import READ_ONLY_ANNOTATIONS, RouteRequest, Tool, register


def _object(properties: dict[str, Any], required: tuple[str, ...] = ()) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": list(required),
        "additionalProperties": False,
    }


ASSET_TYPES = ["symbol", "footprint", "3dmodel", "spice"]
DRAFT_TYPES = ["symbol", "footprint"]
CONTENT = {
    "type": "string",
    "minLength": 1,
    "description": "The file's text, for a symbol or footprint you hold in full. Use upload_id for anything large.",
}
UPLOAD_ID = {
    "type": "string",
    "pattern": "^upl_[0-9a-f]{32}$",
    "description": "A file sent with create_asset_upload. Give this or content, not both.",
}
FILE_NAME = {"type": "string", "description": "The file name, with its extension (optional)."}


def draft_source(arguments: dict[str, Any]) -> dict[str, Any]:
    """The route's ``content``/``upload_id``/``file_name`` fields, as given."""

    return {key: arguments[key] for key in ("content", "upload_id", "file_name") if key in arguments}


def _check_result(structured: dict[str, Any]) -> dict[str, Any]:
    """Each preview as an image block; the structured result keeps the rest."""

    previews = structured.pop("previews", None) or []
    structured["preview_units"] = [preview.get("unit") for preview in previews]
    klc = structured.get("klc") or {}
    if structured.get("readable"):
        summary = (
            f"KiCad read {structured.get('asset_type')} {structured.get('name')!r}. "
            f"KLC {klc.get('status')}: {klc.get('error_count', 0)} errors, "
            f"{klc.get('warning_count', 0)} warnings. {len(previews)} preview(s) follow."
        )
    else:
        summary = f"KiCad could not read the file: {structured.get('kicad_message')}"
    content: list[dict[str, Any]] = [
        {"type": "image", "data": preview["png_base64"], "mimeType": "image/png"}
        for preview in previews
        if preview.get("png_base64")
    ]
    content.append({"type": "text", "text": f"{invoke.DATA_PREFIX}\n{summary}\n{invoke.text_block(structured)}"})
    return {
        "content": content,
        "structuredContent": structured,
        "isError": False,
        "_meta": dict(invoke.UNTRUSTED_META),
    }


async def _check_asset(
    app: Any, arguments: dict[str, Any], authorization: str, request: RouteRequest
) -> dict[str, Any]:
    body = {
        "asset_type": arguments["asset_type"],
        **draft_source(arguments),
        **({"name": arguments["name"]} if arguments.get("name") else {}),
    }
    status, raw = await request(app, "post", "/api/v1/catalog/drafts/check", "", authorization, body)
    if not 200 <= status < 300:
        return invoke.route_error(status, raw)
    try:
        structured = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return invoke.error_result("invalid-response", "Prism answered without a check result")
    return _check_result(structured)


register(
    Tool(
        name="list_catalog_fields",
        title="List catalog metadata fields",
        description=(
            "The metadata fields this Prism's component catalog defines: built-in ones "
            "and the custom fields an administrator added, with their type, unit, allowed "
            "values and whether they are required. Read this before filling a component, "
            "and put custom field values in extra_fields under each field's key."
        ),
        input_schema=_object({}),
        route=("get", "/api/v1/catalog/metadata/fields"),
        args=lambda arguments: ({}, {}),
        annotations=dict(READ_ONLY_ANNOTATIONS),
    )
)

register(
    Tool(
        name="search_catalog_assets",
        title="Search catalog assets",
        description=(
            "Find symbols, footprints or 3D models the catalog already stores, by name or "
            "library, most used first. Reuse one with reuse_catalog_asset instead of making "
            "a new file when the part comes in a standard package."
        ),
        input_schema=_object(
            {
                "asset_type": {"type": "string", "enum": ASSET_TYPES, "description": "Default footprint."},
                "query": {"type": "string", "description": "Text to match in the name or library, e.g. LQFP-64."},
                "limit": {"type": "integer", "minimum": 1, "maximum": 100},
            }
        ),
        route=("get", "/api/v1/catalog/assets/search"),
        args=lambda arguments: (
            {},
            {
                "asset_type": arguments.get("asset_type"),
                "q": arguments.get("query"),
                "limit": arguments.get("limit"),
            },
        ),
        annotations=dict(READ_ONLY_ANNOTATIONS),
    )
)

register(
    Tool(
        name="check_catalog_asset",
        title="Check a draft symbol or footprint",
        description=(
            "Check a symbol or footprint file before attaching it: whether KiCad can read "
            "it (with KiCad's own error when not), the KLC library-convention findings, and "
            "a PNG of each symbol unit or of the footprint. Nothing is stored, so fix the "
            "file and check again until it is clean, then attach it with "
            "attach_catalog_asset."
        ),
        input_schema=_object(
            {
                "asset_type": {"type": "string", "enum": DRAFT_TYPES},
                "content": CONTENT,
                "upload_id": UPLOAD_ID,
                "file_name": FILE_NAME,
                "name": {
                    "type": "string",
                    "description": "The symbol to check when the library holds several.",
                },
            },
            ("asset_type",),
        ),
        route=("post", "/api/v1/catalog/drafts/check"),
        args=lambda arguments: ({}, {}),
        execute=_check_asset,
        # The route's previews travel as image blocks, not in structuredContent.
        output_schema={
            "type": "object",
            "properties": {
                "asset_type": {"type": "string"},
                "name": {"type": "string"},
                "names": {"type": "array", "items": {"type": "string"}},
                "name_count": {"type": "integer"},
                "sha256": {"type": "string"},
                "readable": {"type": "boolean"},
                "kicad_message": {"type": "string"},
                "klc": {"type": ["object", "null"]},
                "preview_units": {"type": "array", "items": {"type": "integer"}},
            },
            "required": ["asset_type", "readable", "klc", "preview_units"],
        },
        annotations=dict(READ_ONLY_ANNOTATIONS),
        # Changes nothing, but runs KiCad and the checker for a catalog writer.
        action="catalog_write",
    )
)


__all__ = ["ASSET_TYPES", "CONTENT", "DRAFT_TYPES", "FILE_NAME", "UPLOAD_ID", "draft_source"]
