"""The MCP tool registry (ADR scripting-and-mcp §3.7).

A tool is declared once, beside the route it reads: its name, the JSON Schema
an MCP client sees, the typed ``/api/v1`` route it calls, and how its arguments
become that route's path and query. The registry is deliberately plain module
API — the supply tools register into the same list later — and ``tools()``
returns every read, then every write, then the ops tools, each group in
registration order, so ``tools/list`` is deterministic whichever module was
imported first. A tool's ``group`` is derived from its action and annotations,
and its optional ``present`` hook shapes results (bound with ``presenter``).
``backend/app/services/mcp/AGENTS.md`` walks through adding a tool.

``output_schema`` is the route's ``200`` response schema from ``app.openapi()``
with ``$ref``s inlined. The resolver is small and depth-capped on purpose:
OpenAPI schemas are shallow, and a self-referential model must not loop.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any, Awaitable, Callable, Protocol

class RouteRequest(Protocol):
    """How a multi-step tool calls one ``/api/v1`` route as its caller.

    ``(app, method, path, query, authorization, json_body)`` answers
    ``(status, body bytes)``. ``if_match`` is a guarded write's ETag. Bodies are
    JSON only: a file travels through an upload slot (ADR §12, D30).
    """

    def __call__(
        self,
        app: Any,
        method: str,
        path: str,
        query: str,
        authorization: str,
        body: dict[str, Any] | None,
        *,
        if_match: str | None = None,
    ) -> Awaitable[tuple[int, bytes]]: ...

#: Shapes one finished result: ``(arguments, result) -> result``. It sees error
#: results too, and returns the result (usually the same object) unchanged when
#: there is nothing to add.
Presenter = Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]]

#: ``tools/list`` order: every read, then every write, then the ops tools
#: (ADR §10, §11). Within a group, tools keep their registration order.
GROUP_ORDER = ("read", "write", "ops")

#: A read tool says so rather than leaving a client to infer it.
READ_ONLY_ANNOTATIONS: dict[str, bool] = {
    "readOnlyHint": True,
    "idempotentHint": True,
    "openWorldHint": False,
}

#: Policy actions of the ops tools (ADR §11, D20).
OPS_ACTIONS = frozenset({"ops_read", "ops_act"})


def ops_enabled() -> bool:
    from app.core.config import settings  # registry stays import-light

    return bool(settings.PRISM_MCP_OPS_ENABLED)


#: The argument every write tool accepts (D13). Invoke sends it as the route's
#: ``Idempotency-Key`` header, so a client that retries a write with the same
#: key gets the first answer back instead of a second comment.
IDEMPOTENCY_KEY = "idempotencyKey"
IDEMPOTENCY_KEY_SCHEMA: dict[str, Any] = {
    "type": "string",
    "minLength": 1,
    "maxLength": 255,
    "description": "Optional. Reuse the same key when retrying this call, so the write happens once.",
}


def write_annotations(*, destructive: bool = False, idempotent: bool = False) -> dict[str, bool]:
    """Annotations for a tool that changes Prism (ADR §10, D13)."""

    return {
        "readOnlyHint": False,
        "destructiveHint": destructive,
        "idempotentHint": idempotent,
        "openWorldHint": False,
    }

_MAX_REF_DEPTH = 32


@dataclass(frozen=True)
class Tool:
    """One task-level read or write, and the route that answers it."""

    name: str
    title: str
    description: str
    input_schema: dict[str, Any]
    #: ``(method, path template)`` under ``/api/v1``, template parameters
    #: filled from the ``path_params`` ``args`` returns.
    route: tuple[str, str]
    #: ``arguments -> (path_params, query)``, or the same plus a JSON ``body``;
    #: ``None`` values are dropped. A body is sent only for a ``post`` route.
    args: Callable[
        [dict[str, Any]],
        tuple[dict[str, Any], dict[str, Any]]
        | tuple[dict[str, Any], dict[str, Any], dict[str, Any]],
    ]
    annotations: dict[str, bool]
    output_schema: dict[str, Any] | None = None
    #: A tool that needs more than one route (start then poll, then fetch
    #: bytes) handles itself and returns the whole ``CallToolResult``.
    execute: Callable[[Any, dict[str, Any], str, RouteRequest], Awaitable[dict[str, Any]]] | None = None
    #: The policy action a write needs (``comment``, ``design``,
    #: ``catalog_write``). Set only on write tools: ``/mcp`` checks it before the
    #: route runs, so a client missing the scope is asked for it (D14).
    action: str | None = None
    #: Result shaping after invocation (filters, citation links); see ``presenter``.
    present: Presenter | None = None

    @property
    def group(self) -> str:
        """``read``, ``write`` or ``ops``, from what the tool already declares."""
        if self.ops:
            return "ops"
        return "write" if self.write else "read"

    @property
    def write(self) -> bool:
        # An ops read declares its action (for the scope check) but changes nothing.
        return self.action is not None and not self.annotations.get("readOnlyHint", False)

    @property
    def ops(self) -> bool:
        """An ops diagnostic or action (ADR §11), listed only while ops is on."""
        return self.action in OPS_ACTIONS

    def advertised_input_schema(self) -> dict[str, Any]:
        """``input_schema``, plus ``idempotencyKey`` on a write tool."""

        if not self.write:
            return self.input_schema
        schema = dict(self.input_schema)
        schema["properties"] = {
            **(schema.get("properties") or {}),
            IDEMPOTENCY_KEY: IDEMPOTENCY_KEY_SCHEMA,
        }
        return schema


_TOOLS: list[Tool] = []


def register(tool: Tool) -> Tool:
    """Add ``tool`` to the registry. Duplicate names are a programming error."""

    if any(existing.name == tool.name for existing in _TOOLS):
        raise ValueError(f"a tool named {tool.name!r} is already registered")
    _TOOLS.append(tool)
    return tool


def presenter(name: str) -> Callable[[Presenter], Presenter]:
    """Attach the decorated function as the registered tool ``name``'s ``present`` hook.

    A module registers its tools first and defines their result shaping after,
    so the hook is bound by name rather than passed to ``Tool(...)``.
    """

    def bind(function: Presenter) -> Presenter:
        for index, tool in enumerate(_TOOLS):
            if tool.name == name:
                if tool.present is not None:
                    raise ValueError(f"tool {name!r} already has a presenter")
                _TOOLS[index] = replace(tool, present=function)
                return function
        raise ValueError(f"no tool named {name!r} is registered")

    return bind


def present(tool: Tool, arguments: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    """``result`` shaped by ``tool``'s hook, or unchanged when it has none."""

    return tool.present(arguments, result) if tool.present is not None else result


def tools() -> tuple[Tool, ...]:
    """Every available tool, grouped by ``GROUP_ORDER`` (ops tools only while ops is on).

    The sort is stable, so within a group the order is the registration order.
    """

    enabled = ops_enabled()
    listed = [tool for tool in _TOOLS if enabled or not tool.ops]
    return tuple(sorted(listed, key=lambda tool: GROUP_ORDER.index(tool.group)))


def tool_named(name: str) -> Tool | None:
    for tool in tools():
        if tool.name == name:
            return tool
    return None


def _inline(node: Any, schemas: dict[str, Any], depth: int) -> Any:
    """``node`` with local component ``$ref``s replaced by their schemas."""

    if depth <= 0:
        return {}
    if isinstance(node, dict):
        ref = node.get("$ref")
        if isinstance(ref, str):
            target = schemas.get(ref.rsplit("/", 1)[-1])
            if target is None:
                return {}
            resolved = _inline(target, schemas, depth - 1)
            siblings = {key: value for key, value in node.items() if key != "$ref"}
            if siblings and isinstance(resolved, dict):
                resolved = {**resolved, **_inline(siblings, schemas, depth - 1)}
            return resolved
        return {key: _inline(value, schemas, depth - 1) for key, value in node.items()}
    if isinstance(node, list):
        return [_inline(value, schemas, depth - 1) for value in node]
    return node


def response_schema(app: Any, route: tuple[str, str]) -> dict[str, Any] | None:
    """The route's JSON ``200`` response schema, or ``None`` when untyped.

    ``app`` is the FastAPI application the tool will call, so this reads the
    same document ``/api/v1/openapi.json`` publishes.
    """

    method, path = route
    document = app.openapi()
    operation = (document.get("paths") or {}).get(path, {}).get(method.lower()) or {}
    schema = (
        ((operation.get("responses") or {}).get("200") or {})
        .get("content", {})
        .get("application/json", {})
        .get("schema")
    )
    if not isinstance(schema, dict) or not schema:
        return None
    schemas = (document.get("components") or {}).get("schemas") or {}
    return output_schema(_inline(schema, schemas, _MAX_REF_DEPTH))


#: Keys a tool's ``present`` hook adds to a result to cite what it returned.
_CITATION_PROPERTIES = {
    "link": {"type": "string", "description": "The Prism page for this result."},
    "uri": {"type": "string", "description": "The prism:// resource URI for this result."},
}


def output_schema(route_schema: dict[str, Any]) -> dict[str, Any]:
    """The ``outputSchema`` for a tool whose route answers ``route_schema``.

    MCP requires an object. A route that answers a list (or anything else) has
    its body under ``result``, the same wrapping ``invoke`` applies, and an
    object route also admits the citation keys the presenter adds.
    """

    if route_schema.get("type") != "object":
        return {
            "type": "object",
            "properties": {"result": route_schema, **_CITATION_PROPERTIES},
            "required": ["result"],
        }
    schema = dict(route_schema)
    schema["properties"] = {**_CITATION_PROPERTIES, **(schema.get("properties") or {})}
    if schema.get("additionalProperties") is False:
        schema["additionalProperties"] = True
    return schema


def tool_definition(tool: Tool, app: Any | None = None) -> dict[str, Any]:
    """The MCP ``tools/list`` entry for ``tool``."""

    definition: dict[str, Any] = {
        "name": tool.name,
        "title": tool.title,
        "description": tool.description,
        "inputSchema": tool.advertised_input_schema(),
        "annotations": dict(tool.annotations),
    }
    output_schema = tool.output_schema
    if output_schema is None and app is not None:
        output_schema = response_schema(app, tool.route)
    if output_schema is not None:
        definition["outputSchema"] = output_schema
    return definition


def tool_definitions(app: Any | None = None) -> list[dict[str, Any]]:
    return [tool_definition(tool, app) for tool in tools()]


__all__ = [
    "GROUP_ORDER",
    "IDEMPOTENCY_KEY",
    "Presenter",
    "READ_ONLY_ANNOTATIONS",
    "Tool",
    "present",
    "presenter",
    "register",
    "response_schema",
    "tool_definition",
    "tool_definitions",
    "tool_named",
    "tools",
    "write_annotations",
]
