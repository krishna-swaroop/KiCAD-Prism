"""What MCP clients may reach, and the refusals that enforce it (ADR §3.11, D7).

An administrator decides one of two project scopes — every project the caller
can see, or a list — and which registered tools are switched off. The value is
one row in ``ws_mcp_governance``; :func:`current` caches it for a couple of
seconds so a request does not read it once per tool, and Settings' ``PUT``
clears the cache.

This module is the only place that answers "may this call run?". ``mcp.py``
asks it before invoking a tool and uses the helpers it returns, so a refusal is
shaped like the API's own 404 rather than a new error vocabulary. A read of the
policy that fails denies every tool instead of falling open.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.errors import Invalid
from app.services.mcp import invoke, registry
from app.services.workspace_connection import connect

logger = logging.getLogger(__name__)

#: The policy is read at most this often; Settings' save calls :func:`invalidate`.
_TTL_SECONDS = 2.0


class McpGovernance(BaseModel):
    """The workspace's MCP policy, in the spelling the Settings API uses."""

    model_config = ConfigDict(populate_by_name=True)

    project_scope: Literal["all", "listed"] = Field(default="all", alias="projectScope")
    project_ids: list[str] = Field(default_factory=list, alias="projectIds")
    disabled_tools: list[str] = Field(default_factory=list, alias="disabledTools")


_cached: McpGovernance | None = None
_loaded_at: float | None = None
_lock = threading.Lock()


def _load() -> McpGovernance:
    with connect() as conn:
        row = conn.execute(
            "SELECT project_scope, project_ids, disabled_tools"
            " FROM ws_mcp_governance WHERE singleton"
        ).fetchone()
    if not row:
        return McpGovernance()
    return McpGovernance(
        project_scope=row["project_scope"],
        project_ids=[str(value) for value in (row["project_ids"] or [])],
        disabled_tools=[str(value) for value in (row["disabled_tools"] or [])],
    )


def _deny_everything() -> McpGovernance:
    """The policy used when the row cannot be read: no project, no tool."""

    return McpGovernance(
        project_scope="listed",
        project_ids=[],
        disabled_tools=[tool.name for tool in registry.tools()],
    )


def current() -> McpGovernance:
    """The policy, from a short cache; a failed read denies every tool."""

    global _cached, _loaded_at
    now = time.monotonic()
    with _lock:
        if _cached is not None and _loaded_at is not None and now - _loaded_at <= _TTL_SECONDS:
            return _cached
    try:
        value = _load()
    except Exception:
        logger.warning("Could not read MCP governance; every tool is refused", exc_info=True)
        value = _deny_everything()
    with _lock:
        _cached = value
        _loaded_at = now
    return value


def invalidate() -> None:
    """Drop the cache after a write, so the next call sees the new policy."""

    global _cached, _loaded_at
    with _lock:
        _cached = None
        _loaded_at = None


def save(value: McpGovernance, *, role: str) -> McpGovernance:
    """Validate ``value`` against the registry and the projects, then store it."""

    from app.services.workspace_service import workspace

    disabled = list(dict.fromkeys(value.disabled_tools))
    unknown_tools = [name for name in disabled if registry.tool_named(name) is None]
    if unknown_tools:
        raise Invalid(
            f"Unknown tool: {', '.join(unknown_tools)}",
            code="unknown_tool",
        )

    project_ids = list(dict.fromkeys(value.project_ids))
    missing = [
        project_id
        for project_id in project_ids
        if workspace.get_project_for_role(project_id, role) is None
    ]
    if missing:
        raise Invalid(f"Unknown project: {', '.join(missing)}", code="unknown_project")

    normalized = McpGovernance(
        project_scope=value.project_scope,
        project_ids=project_ids,
        disabled_tools=disabled,
    )
    from psycopg.types.json import Jsonb

    with connect() as conn:
        conn.execute(
            """
            INSERT INTO ws_mcp_governance
                (singleton, project_scope, project_ids, disabled_tools, updated_at)
            VALUES (TRUE, %s, %s, %s, NOW())
            ON CONFLICT (singleton) DO UPDATE SET
                project_scope = EXCLUDED.project_scope,
                project_ids = EXCLUDED.project_ids,
                disabled_tools = EXCLUDED.disabled_tools,
                updated_at = NOW()
            """,
            (
                normalized.project_scope,
                Jsonb(normalized.project_ids),
                Jsonb(normalized.disabled_tools),
            ),
        )
    invalidate()
    return normalized


def tools_for_ui() -> list[dict[str, str]]:
    """Every registered tool, whether or not it is currently disabled."""

    return [{"name": tool.name, "title": tool.title} for tool in registry.tools()]


def visible_definitions(app: Any, value: McpGovernance) -> list[dict[str, Any]]:
    """The ``tools/list`` entries the policy still offers."""

    disabled = set(value.disabled_tools)
    return [
        registry.tool_definition(tool, app)
        for tool in registry.tools()
        if tool.name not in disabled
    ]


async def project_for_arguments(tool_name: str, arguments: dict[str, Any]) -> str | None:
    """The project a call names, resolving ``get_job`` through the job row.

    Catalog tools and project searches name no project. A job with no project is
    not project-scoped; a missing job is left to the route's own 404.
    """

    if tool_name == "get_job":
        job_id = arguments.get("job_id")
        if not isinstance(job_id, str) or not job_id:
            return None
        from app.services.job_service import jobs

        job = await asyncio.to_thread(jobs.get, job_id)
        project_id = job.get("project_id") if job else None
        return str(project_id) if project_id else None

    project_id = arguments.get("project_id")
    return str(project_id) if isinstance(project_id, str) and project_id else None


def refusal(value: McpGovernance, tool_name: str, project_id: str | None) -> dict[str, Any] | None:
    """The tool execution error that refuses this call, or ``None`` to run it."""

    if tool_name in value.disabled_tools:
        return invoke.tool_error(
            "tool-disabled",
            f"Tool {tool_name!r} is disabled by the workspace MCP policy.",
        )
    if project_id is None or value.project_scope != "listed":
        return None
    if project_id in value.project_ids:
        return None
    # The same body and text a hidden project gets from its route.
    return invoke.not_found_error()


def filter_search_projects(value: McpGovernance, result: dict[str, Any]) -> None:
    """Drop ``search_projects`` results outside a listed scope, in place."""

    if value.project_scope != "listed":
        return
    structured = result.get("structuredContent")
    if not isinstance(structured, dict):
        return
    results = structured.get("results")
    if not isinstance(results, list):
        return
    allowed = set(value.project_ids)
    structured["results"] = [
        row
        for row in results
        if isinstance(row, dict) and str(row.get("id")) in allowed
    ]


__all__ = [
    "McpGovernance",
    "current",
    "filter_search_projects",
    "invalidate",
    "project_for_arguments",
    "refusal",
    "save",
    "tools_for_ui",
    "visible_definitions",
]
