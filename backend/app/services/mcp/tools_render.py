"""The ``render_view`` MCP tool (ADR D9, §3.7).

The tool starts the same typed POST route a browser or SDK calls, polls its
GET record for up to 30 s, and returns the PNG as an MCP image block once it
is ready. A render that is still running is not an error: the result carries
``{renderId, status}`` and tells the model to call ``render_view`` again with
the same arguments, which hits the render cache.

3D renders carry no highlight overlay. Their ``highlights`` list still says
whether each requested component or net was found, and the text says so.
"""

from __future__ import annotations

import asyncio
import base64
import json
import time
from typing import Any
from urllib.parse import quote

from app.core.config import settings
from app.core.links import resource_uri, view_url
from app.services.mcp import invoke
from app.services.mcp.registry import (
    READ_ONLY_ANNOTATIONS,
    RouteRequest,
    Tool,
    register,
)

POLL_TIMEOUT_SECONDS = 30.0
POLL_INTERVAL_SECONDS = 0.5


def _object(properties: dict[str, Any], required: tuple[str, ...] = ()) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": list(required),
        "additionalProperties": False,
    }


def _request_path(project_id: str, suffix: str = "") -> str:
    return f"/api/v1/projects/{quote(project_id, safe='')}/renders{suffix}"


def _body(arguments: dict[str, Any]) -> dict[str, Any]:
    fields = ("view", "revision", "sheet", "layers", "side", "highlight", "region", "width")
    return {key: arguments[key] for key in fields if arguments.get(key) is not None}


def _link(project_id: str, commit: str, view: str, highlights: Any) -> str | None:
    base = settings.PUBLIC_BASE_URL.strip().rstrip("/")
    if not base:
        return None
    tab = {"schematic": "sch", "pcb": "pcb", "3d": "3d"}.get(view, "sch")
    found = [
        item
        for item in highlights or []
        if isinstance(item, dict) and item.get("found") and item.get("key")
    ]
    sel = tuple(str(item["key"]) for item in found if item.get("kind") == "component")
    nets = tuple(str(item["key"]) for item in found if item.get("kind") == "net")
    return view_url(base, project_id, tab=tab, commit=commit, sel=sel, nets=nets)


def _summary(record: dict[str, Any]) -> str:
    lines = [
        f"Render {record.get('renderId')} of the {record.get('view')} view at "
        f"{record.get('commit')} is ready ({record.get('width')}x{record.get('height')} px)."
    ]
    if record.get("view") == "3d":
        lines.append("3D renders carry no highlight overlay; highlights only report found.")
    found = [
        f"{item.get('kind')} {item.get('key')} ({'found' if item.get('found') else 'not found'})"
        for item in record.get("highlights") or []
    ]
    if found:
        lines.append("Highlights: " + ", ".join(found) + ".")
    return "\n".join(lines)


def _image_result(record: dict[str, Any], png: bytes, *, project_id: str) -> dict[str, Any]:
    structured = dict(record)
    link = _link(
        project_id,
        str(record.get("commit") or ""),
        str(record.get("view") or ""),
        record.get("highlights") or [],
    )
    if link:
        structured["link"] = link
    structured["uri"] = resource_uri(
        project_id, str(record.get("commit") or ""), "render", str(record.get("renderId") or "")
    )
    text = f"{invoke.DATA_PREFIX}\n{_summary(structured)}"
    return {
        "content": [
            {
                "type": "image",
                "data": base64.b64encode(png).decode("ascii"),
                "mimeType": "image/png",
            },
            {"type": "text", "text": text},
        ],
        "structuredContent": structured,
        "isError": False,
        "_meta": dict(invoke.UNTRUSTED_META),
    }


def _pending_result(record: dict[str, Any]) -> dict[str, Any]:
    render_id = str(record.get("renderId") or "")
    status = str(record.get("status") or "running")
    structured = {"renderId": render_id, "status": status}
    text = (
        f"{invoke.DATA_PREFIX}\nRender {render_id} is still {status}. "
        "Call render_view again with the same arguments; a completed render is cached."
    )
    return {
        "content": [{"type": "text", "text": text}],
        "structuredContent": structured,
        "isError": False,
        "_meta": dict(invoke.UNTRUSTED_META),
    }


async def execute(
    app: Any,
    arguments: dict[str, Any],
    authorization: str,
    request: RouteRequest,
) -> dict[str, Any]:
    """Start, poll and fetch one render through the typed routes."""

    project_id = str(arguments["project_id"])
    status, raw = await request(
        app, "post", _request_path(project_id), "", authorization, _body(arguments)
    )
    if not 200 <= status < 300:
        return invoke.route_error(status, raw)
    try:
        started = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return invoke.error_result("invalid-response", "Prism answered without a render record")
    render_id = str(started.get("renderId") or "")
    if not render_id:
        return invoke.error_result("invalid-response", "Prism answered without a renderId")

    deadline = time.monotonic() + POLL_TIMEOUT_SECONDS
    record = started
    while True:
        status, raw = await request(
            app, "get", _request_path(project_id, f"/{render_id}"), "", authorization, None
        )
        if not 200 <= status < 300:
            return invoke.route_error(status, raw)
        try:
            record = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return invoke.error_result("invalid-response", "Prism answered without a render record")
        state = str(record.get("status") or "")
        if state == "completed":
            break
        if state in {"failed", "cancelled"}:
            return invoke.route_error(
                422,
                json.dumps(
                    {
                        "detail": f"The render ended {state}.",
                        "code": "render-failed",
                        "renderId": render_id,
                    }
                ).encode("utf-8"),
            )
        if time.monotonic() >= deadline:
            return _pending_result({"renderId": render_id, "status": state or "running"})
        await asyncio.sleep(POLL_INTERVAL_SECONDS)

    status, png = await request(
        app, "get", _request_path(project_id, f"/{render_id}.png"), "", authorization, None
    )
    if not 200 <= status < 300:
        return invoke.route_error(status, png)
    return _image_result(record, png, project_id=project_id)


register(
    Tool(
        name="render_view",
        title="Render a design view",
        description=(
            "A PNG of a schematic page, PCB layer set or 3D view at a revision, with "
            "chosen components or nets highlighted. The first call starts a worker "
            "render; call again with the same arguments while it is running. Renders "
            "are cached, so a completed view costs nothing to ask for again. 3D views "
            "carry no highlight overlay."
        ),
        input_schema=_object(
            {
                "project_id": {"type": "string", "description": "The Prism project id."},
                "view": {
                    "type": "string",
                    "enum": ["schematic", "pcb", "3d"],
                    "description": "Schematic page, PCB layer set, or 3D view.",
                },
                "revision": {
                    "type": "string",
                    "description": "A full commit sha, branch or tag; omitted reads HEAD.",
                },
                "sheet": {
                    "type": "string",
                    "description": (
                        "Schematic sheet instance path or page number; default the root "
                        "sheet, or the sheet of the first highlighted component."
                    ),
                },
                "layers": {
                    "type": "string",
                    "enum": ["front", "back", "copper", "all"],
                    "description": "PCB layer set (default front).",
                },
                "side": {
                    "type": "string",
                    "enum": ["top", "bottom"],
                    "description": "3D camera side (default top).",
                },
                "highlight": {
                    "type": "object",
                    "properties": {
                        "components": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Reference designators.",
                        },
                        "nets": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Net names.",
                        },
                    },
                    "additionalProperties": False,
                },
                "region": {
                    "type": "object",
                    "properties": {
                        "x": {"type": "number"},
                        "y": {"type": "number"},
                        "width": {"type": "number", "exclusiveMinimum": 0},
                        "height": {"type": "number", "exclusiveMinimum": 0},
                    },
                    "required": ["x", "y", "width", "height"],
                    "additionalProperties": False,
                    "description": "Crop in mm in the view's frame.",
                },
                "width": {"type": "integer", "minimum": 256, "maximum": 2048},
            },
            ("project_id", "view"),
        ),
        route=("post", "/api/v1/projects/{project_id}/renders"),
        args=lambda arguments: ({"project_id": arguments["project_id"]}, {}, _body(arguments)),
        execute=execute,
        annotations=dict(READ_ONLY_ANNOTATIONS),
        output_schema=_object(
            {
                "renderId": {"type": "string"},
                "status": {"type": "string"},
                "view": {"type": "string"},
                "commit": {"type": "string"},
                "link": {"type": "string"},
                "uri": {"type": "string"},
            },
            ("renderId", "status"),
        ),
    )
)

__all__ = ["execute"]
