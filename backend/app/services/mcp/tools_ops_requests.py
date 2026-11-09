"""Ops diagnostics over MCP: route latency, the request log and slow queries (ADR §11, OPS-04b).

The four read tools call the typed ``/api/v1/ops`` routes, so the caller's
bearer token, the admin-only ``ops_read`` policy action and the response models
are the API's. They are listed only while ``PRISM_MCP_OPS_ENABLED`` is on, and
the registry marks them read-only; nothing here changes Prism.
"""

from __future__ import annotations

from typing import Any

from app.services.mcp.registry import READ_ONLY_ANNOTATIONS, Tool, register
from app.services.mcp.schema import object_schema as _object


_WINDOW = {
    "type": "integer",
    "minimum": 1,
    "maximum": 10080,
    "default": 60,
    "description": "The window in minutes (1 to 10080, at most seven days).",
}
_ROUTE_PREFIX = {
    "type": "string",
    "maxLength": 300,
    "description": "Only route templates with this literal prefix, such as /api/projects/.",
}
_LIMIT = {
    "type": "integer",
    "minimum": 1,
    "maximum": 500,
    "default": 50,
    "description": "Rows in the answer.",
}
_MIN_DURATION = {
    "type": "integer",
    "minimum": 0,
    "description": "Only requests that took at least this many milliseconds.",
}
_STATUS_MIN = {
    "type": "integer",
    "minimum": 100,
    "maximum": 599,
    "description": "Only requests whose status is at least this value.",
}
_ORDER = {
    "type": "string",
    "enum": ["total", "mean"],
    "default": "total",
    "description": "Rank statements by total time or mean time.",
}
_SLOW_LIMIT = {
    "type": "integer",
    "minimum": 1,
    "maximum": 100,
    "default": 20,
    "description": "Statements in the answer.",
}


def _route_latency_args(
    arguments: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    return (
        {},
        {
            "window_minutes": arguments.get("window_minutes"),
            "route_prefix": arguments.get("route_prefix"),
            "limit": arguments.get("limit"),
        },
    )


def _recent_requests_args(
    arguments: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    return (
        {},
        {
            "limit": arguments.get("limit"),
            "min_duration_ms": arguments.get("min_duration_ms"),
            "status_min": arguments.get("status_min"),
            "route_prefix": arguments.get("route_prefix"),
        },
    )


def _trace_args(arguments: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    return ({"request_id": arguments["request_id"]}, {})


def _slow_queries_args(
    arguments: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    return ({}, {"order": arguments.get("order"), "limit": arguments.get("limit")})


register(
    Tool(
        name="get_route_latency",
        title="Get route latency",
        description=(
            "Estimated p50, p95 and p99 latency, 4xx and 5xx rates and total time "
            "per route template over a window, merged across processes. Read-only."
        ),
        input_schema=_object(
            {
                "window_minutes": _WINDOW,
                "route_prefix": _ROUTE_PREFIX,
                "limit": _LIMIT,
            }
        ),
        route=("get", "/api/v1/ops/route-latency"),
        args=_route_latency_args,
        annotations=dict(READ_ONLY_ANNOTATIONS),
        action="ops_read",
    )
)

register(
    Tool(
        name="list_recent_requests",
        title="List recent requests",
        description=(
            "Recent slow, write and failed requests, newest first, so you can pick a "
            "request id for trace_request. Filter by duration, status or route. Read-only."
        ),
        input_schema=_object(
            {
                "limit": _LIMIT,
                "min_duration_ms": _MIN_DURATION,
                "status_min": _STATUS_MIN,
                "route_prefix": _ROUTE_PREFIX,
            }
        ),
        route=("get", "/api/v1/ops/requests"),
        args=_recent_requests_args,
        annotations=dict(READ_ONLY_ANNOTATIONS),
        action="ops_read",
    )
)

register(
    Tool(
        name="trace_request",
        title="Trace a request",
        description=(
            "One request id across its request-log rows, the jobs and events it created "
            "and any MCP audit rows. Identifiers and timings only; no payloads. Read-only."
        ),
        input_schema=_object(
            {
                "request_id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 64,
                    "description": "A request id from list_recent_requests.",
                },
            },
            ("request_id",),
        ),
        route=("get", "/api/v1/ops/requests/{request_id}"),
        args=_trace_args,
        annotations=dict(READ_ONLY_ANNOTATIONS),
        action="ops_read",
    )
)

register(
    Tool(
        name="get_slow_queries",
        title="Get slow queries",
        description=(
            "The slowest PostgreSQL statements by total or mean time, with calls, rows "
            "and shared block reads. Query text is redacted. Answers available=false with "
            "a reason when pg_stat_statements is not loaded. Read-only."
        ),
        input_schema=_object({"order": _ORDER, "limit": _SLOW_LIMIT}),
        route=("get", "/api/v1/ops/slow-queries"),
        args=_slow_queries_args,
        annotations=dict(READ_ONLY_ANNOTATIONS),
        action="ops_read",
    )
)


__all__: list[str] = []
