"""Supply tools (ADR scripting-and-mcp §13, supply decision D8).

Reads answer "can we build this project and what stops it" and "how does this
library component stand": stock, price, health, local stock and its approved
alternates. They read what Prism already holds and never call a distributor.
Two writes follow a component: ``watch_component`` puts its part on watch, and
``refresh_component_supply`` asks for one fresh distributor read from the
interactive reserve. Connectors, settings, waivers and alternate approvals stay
with people in Prism.

Supply is component-first: a component's parts are its main part and the
alternates QA approved (``component_parts``). The tools take a component id or
a project id, never a loose part number, so they only reach library parts (D12).
"""

from __future__ import annotations

import json
from typing import Any

from app.core.config import settings
from app.core.links import catalog_component_url, project_url
from app.services.mcp import invoke
from app.services.mcp.registry import READ_ONLY_ANNOTATIONS, RouteRequest, Tool, presenter, register, write_annotations

_AT_RISK = ("error", "fatal")
#: Most approved parts ``get_component_supply`` reads, main part first.
MAX_PARTS = 6
#: Lines ``get_project_supply`` lists under ``attention``.
MAX_ATTENTION = 50
_PART_FIELDS = ("status", "problem_text", "lifecycle", "tracking", "price")


def _object(properties: dict[str, Any], required: tuple[str, ...] = ()) -> dict[str, Any]:
    return {"type": "object", "properties": properties, "required": list(required), "additionalProperties": False}


_PROJECT_ID = {"type": "string", "minLength": 1, "description": "The Prism project id."}
_COMPONENT_ID = {"type": "string", "minLength": 1, "description": "The catalog component id (search_catalog finds it)."}
_SUPPLY = "/api/v1/supply"


def _link(build: Any, *args: Any, **kwargs: Any) -> str | None:
    base = settings.PUBLIC_BASE_URL.strip().rstrip("/")
    return build(base, *args, **kwargs) if base else None


async def _get(app: Any, request: RouteRequest, authorization: str, path: str, query: str = "") -> tuple[Any, dict[str, Any] | None]:
    """The route's JSON, or the tool error its refusal becomes."""

    status, raw = await request(app, "get", path, query, authorization, None)
    if not 200 <= status < 300:
        return None, invoke.route_error(status, raw)
    return json.loads(raw.decode("utf-8")) if raw else None, None


async def _counted_parts(app: Any, request: RouteRequest, authorization: str, component_id: str) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    """The component's main part and approved alternates, main first."""

    listed, error = await _get(app, request, authorization, f"{_SUPPLY}/components/{component_id}/parts")
    if error:
        return [], error
    return [part for part in (listed or {}).get("parts", []) if part.get("approval") == "approved"], None


def _no_part() -> dict[str, Any]:
    return invoke.error_result("no_part", "This component has no manufacturer part number, so supply has nothing to read.")


async def _component_supply(app: Any, arguments: dict[str, Any], authorization: str, request: RouteRequest) -> dict[str, Any]:
    component_id = str(arguments["component_id"])
    counted, error = await _counted_parts(app, request, authorization, component_id)
    if error:
        return error
    parts = []
    for part in counted[:MAX_PARTS]:
        detail, error = await _get(app, request, authorization, f"{_SUPPLY}/parts/{part['part_id']}")
        if error:
            return error
        parts.append({
            "part_id": part["part_id"], "role": part["role"], "manufacturer": part["manufacturer"], "mpn": part["mpn"],
            "stock": detail.get("stock"),
            **{key: detail.get(key) for key in _PART_FIELDS},
        })
    local, error = await _get(app, request, authorization, f"{_SUPPLY}/components/{component_id}/local-stock")
    if error:
        return error
    watch, error = await _get(app, request, authorization, f"{_SUPPLY}/tracking/components/{component_id}")
    if error:
        return error
    stocks = [part["stock"] for part in parts if part["stock"] is not None]
    structured: dict[str, Any] = {
        "component_id": component_id,
        "parts": parts,
        "distributor_stock": sum(stocks) if stocks else None,
        "local_stock": {key: local.get(key) for key in ("available", "held", "at_vendor", "uom", "mixed_units")} | {"records": len(local.get("rows") or [])},
        "watch": watch.get("watch"),
        "more_parts": max(len(counted) - MAX_PARTS, 0),
    }
    if link := _link(catalog_component_url, component_id):
        structured["link"] = link
    return invoke.success_result(structured)


async def _alternatives(app: Any, arguments: dict[str, Any], authorization: str, request: RouteRequest) -> dict[str, Any]:
    counted, error = await _counted_parts(app, request, authorization, str(arguments["component_id"]))
    if error:
        return error
    main = next((part for part in counted if part["role"] == "main"), None)
    if main is None:
        return _no_part()
    found, error = await _get(app, request, authorization, f"{_SUPPLY}/parts/{main['part_id']}/cross-reference")
    if error:
        return error
    return invoke.success_result({
        "component_id": arguments["component_id"], "part": {key: main[key] for key in ("part_id", "manufacturer", "mpn")},
        "approved_alternates": [part["mpn"] for part in counted if part["role"] != "main"], "candidates": found,
    })


async def _refresh(app: Any, arguments: dict[str, Any], authorization: str, request: RouteRequest) -> dict[str, Any]:
    counted, error = await _counted_parts(app, request, authorization, str(arguments["component_id"]))
    if error:
        return error
    main = next((part for part in counted if part["role"] == "main"), None)
    if main is None:
        return _no_part()
    status, raw = await request(app, "post", f"{_SUPPLY}/parts/{main['part_id']}/refresh", "", authorization, None)
    if not 200 <= status < 300:
        return invoke.route_error(status, raw)
    return invoke.success_result({"component_id": arguments["component_id"], "part_id": main["part_id"], "mpn": main["mpn"], "read": json.loads(raw) if raw else None})


def _component_args(arguments: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    return {"component_id": arguments["component_id"]}, {}


register(
    Tool(
        name="get_project_supply",
        title="Get a project's supply",
        description=(
            "Whether a project's BOM can be built and what stops it: the cost for a build, how many boards the stock covers, "
            "and the lines that need a look (error or fatal status, short of stock, or not in the Component Database). A line "
            "counts its component's approved alternates. Reads the BOM Prism stored, calls no distributor. Then "
            "get_component_supply for one line's component."
        ),
        input_schema=_object({
            "project_id": _PROJECT_ID,
            "variant": {"type": "string", "maxLength": 120, "description": "A design variant; omit for the base design."},
            "build_quantity": {"type": "integer", "minimum": 1, "maximum": 1_000_000, "description": "Boards to build; omit for the project's usual build."},
        }, ("project_id",)),
        route=("get", f"{_SUPPLY}/projects/{{project_id}}/supply"),
        args=lambda arguments: ({"project_id": arguments["project_id"]}, {"variant": arguments.get("variant"), "build_quantity": arguments.get("build_quantity")}),
        annotations=dict(READ_ONLY_ANNOTATIONS),
    )
)

register(
    Tool(
        name="get_component_supply",
        title="Get a component's supply",
        description=(
            "How a library component stands: for its main part and each approved alternate, the status, distributor stock, "
            "lifecycle, price and how Prism follows it; then the local inventory (available, held, at a vendor) and its "
            "watch. Calls no distributor; refresh_component_supply asks for a fresh read."
        ),
        input_schema=_object({"component_id": _COMPONENT_ID}, ("component_id",)),
        route=("get", f"{_SUPPLY}/components/{{component_id}}/parts"),
        args=_component_args,
        execute=_component_supply,
        annotations=dict(READ_ONLY_ANNOTATIONS),
        output_schema=_object({}) | {"additionalProperties": True},
    )
)

register(
    Tool(
        name="find_part_alternatives",
        title="Find alternatives to a component's part",
        description=(
            "Parts distributors list as alternatives to a component's main part, closest first (direct, same form-fit-function, "
            "functional), and the alternates QA already approved. Footprint and pins are not compared. Proposing an alternate "
            "and approving it are people's steps in Prism."
        ),
        input_schema=_object({"component_id": _COMPONENT_ID}, ("component_id",)),
        route=("get", f"{_SUPPLY}/components/{{component_id}}/parts"),
        args=_component_args,
        execute=_alternatives,
        annotations=dict(READ_ONLY_ANNOTATIONS),
        output_schema=_object({}) | {"additionalProperties": True},
    )
)

register(
    Tool(
        name="watch_component",
        title="Watch a component's part",
        description=(
            "Put a library component's part on watch, so Prism reads its stock and price on a schedule and alerts on changes. "
            "Watching again changes only the packaging. Then get_component_supply."
        ),
        input_schema=_object({
            "component_id": _COMPONENT_ID,
            "packaging": {
                "type": "string", "enum": ["any", "cut_tape", "custom_reel", "tape_reel", "tray", "tube", "bulk"],
                "description": "The packaging to count stock in (default any).",
            },
        }, ("component_id",)),
        route=("put", f"{_SUPPLY}/tracking/components/{{component_id}}"),
        args=lambda arguments: ({"component_id": arguments["component_id"]}, {}, {"packaging": arguments.get("packaging") or "any"}),
        annotations=write_annotations(idempotent=True),
        action="supply_follow",
    )
)

register(
    Tool(
        name="refresh_component_supply",
        title="Refresh a component's supply",
        description=(
            "Read a library component's main part from its distributors now, from the interactive reserve. Allowed once every "
            "15 minutes per person and part; a refused read says when. Then get_component_supply."
        ),
        input_schema=_object({"component_id": _COMPONENT_ID}, ("component_id",)),
        route=("get", f"{_SUPPLY}/components/{{component_id}}/parts"),
        args=_component_args,
        execute=_refresh,
        annotations=write_annotations(),
        output_schema=_object({}) | {"additionalProperties": True},
        action="supply_write",
    )
)


def _attention(part: dict[str, Any]) -> bool:
    return part.get("status") in _AT_RISK or bool(part.get("short")) or part.get("in_library") is False


@presenter("get_project_supply")
def _present_project(arguments: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    """The rollup and the lines that need a look, not every line of the BOM."""

    structured = result.get("structuredContent")
    if result.get("isError") or not isinstance(structured, dict):
        return result
    project_id = str(arguments["project_id"])
    if not structured.get("available"):
        return invoke.success_result({"project_id": project_id, "available": False, "variants": structured.get("variants", [])})
    parts = structured.get("parts") or []
    flagged = [part for part in parts if _attention(part)]
    shaped: dict[str, Any] = {
        "project_id": project_id,
        "available": True,
        "variant": structured.get("variant", ""),
        "build_quantity": structured.get("build_quantity"),
        "rollup": structured.get("rollup"),
        "lines": len(parts),
        "attention": [
            {key: part.get(key) for key in ("key", "manufacturer", "mpn", "references", "quantity", "need", "status", "stock", "short", "lifecycle", "in_library", "prism_id")}
            | {"alternates": [alternate.get("mpn") for alternate in part.get("alternates") or []]}
            for part in flagged[:MAX_ATTENTION]
        ],
        "more_attention": max(len(flagged) - MAX_ATTENTION, 0),
        "releases": [
            {key: release.get(key) for key in ("tag", "status", "health")} | {"changed_since": len(release.get("changed_since") or [])}
            for release in structured.get("releases") or []
        ],
    }
    if link := _link(project_url, project_id, section="supply"):
        shaped["link"] = link
    return invoke.success_result(shaped)
