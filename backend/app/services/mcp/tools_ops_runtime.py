"""Ops runtime tools (ADR scripting-and-mcp §11, OPS-04c).

Three read tools over the typed ops routes: the process pool beside worker
heartbeats and queue depth, cache hit rates and sizes, and event-log and
webhook health. They are ``ops_read`` diagnostics, listed only while
``PRISM_MCP_OPS_ENABLED`` is on, and change nothing.
"""

from __future__ import annotations


from app.services.mcp.registry import READ_ONLY_ANNOTATIONS, Tool, register
from app.services.mcp.schema import object_schema as _object


register(
    Tool(
        name="get_pool_and_workers",
        title="Get pool and workers",
        description=(
            "This API process's PostgreSQL pool, every worker's heartbeat (with stale "
            "flags), resource slot usage, queue depth by pool, kind and status, and the "
            "oldest queued job's age."
        ),
        input_schema=_object({}),
        route=("get", "/api/v1/ops/pool-and-workers"),
        args=lambda arguments: ({}, {}),
        annotations=dict(READ_ONLY_ANNOTATIONS),
        action="ops_read",
    )
)

register(
    Tool(
        name="get_cache_stats",
        title="Get cache stats",
        description=(
            "Cache hit and miss counts and hit rates over a window, the git read cache's "
            "rows and payload bytes, and bounded on-disk bytes and file counts for each "
            "cache directory. Directory names are relative labels, never host paths."
        ),
        input_schema=_object(
            {
                "window_minutes": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 7 * 24 * 60,
                    "default": 60,
                    "description": "Minutes of hit/miss counters to aggregate.",
                }
            }
        ),
        route=("get", "/api/v1/ops/caches"),
        args=lambda arguments: ({}, {"window_minutes": arguments.get("window_minutes")}),
        annotations=dict(READ_ONLY_ANNOTATIONS),
        action="ops_read",
    )
)

register(
    Tool(
        name="get_event_and_webhook_health",
        title="Get event and webhook health",
        description=(
            "The event log's head cursor, oldest retained event, retention and the last "
            "hour's events by kind; per webhook, only the URL's host, its cursor lag, "
            "retry state and the last 24 hours' delivery error rate."
        ),
        input_schema=_object({}),
        route=("get", "/api/v1/ops/event-health"),
        args=lambda arguments: ({}, {}),
        annotations=dict(READ_ONLY_ANNOTATIONS),
        action="ops_read",
    )
)


__all__ = []
