"""The ops action tools (ADR scripting-and-mcp §11, D21; OPS-06).

Four tools, matching the fixed action list: ``cancel_job``, ``requeue_job``,
``rebuild_bundle`` and ``set_debug_logging``. Each calls the typed ``/api/ops``
route of the same name with the caller's bearer token, declares
``action="ops_act"`` and honest write annotations, and is listed only while
``PRISM_MCP_OPS_ENABLED`` is on (OPS-01). There is no arbitrary shell, SQL or
configuration tool.

``set_debug_logging`` is one tool over two routes: minutes above zero sets a
window, and zero clears it, so a model can undo its own change without knowing
that clearing is a ``DELETE``.
"""

from __future__ import annotations

import json
from typing import Any

from app.services.mcp import invoke
from app.services.mcp.registry import RouteRequest, Tool, register, write_annotations


def _object(
    properties: dict[str, Any],
    required: tuple[str, ...] = (),
    *,
    additional: bool = False,
) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": list(required),
        "additionalProperties": additional,
    }


_JOB_ID = {"type": "string", "minLength": 1, "description": "The Prism job id."}
_PROJECT_ID = {"type": "string", "minLength": 1, "description": "The Prism project id."}
_COMMIT = {
    "type": "string",
    "pattern": r"^[0-9a-f]{40}$",
    "description": (
        "The full 40-character commit sha whose bundle to rebuild. Omitted "
        "rebuilds the project's head."
    ),
}

#: ``set_debug_logging`` answers either a window or a cleared confirmation.
_DEBUG_OUTPUT = _object(
    {
        "until": {"type": "string", "description": "The deadline, as ISO 8601."},
        "loggers": {"type": "array", "items": {"type": "string"}},
        "cleared": {"type": "boolean"},
    }
)


def _commit_body(
    arguments: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    body: dict[str, Any] = {}
    if arguments.get("commit") is not None:
        body["commit"] = arguments["commit"]
    return {"project_id": arguments["project_id"]}, {}, body


async def _set_debug(
    app: Any,
    arguments: dict[str, Any],
    authorization: str,
    request: RouteRequest,
) -> dict[str, Any]:
    """Set a positive window, or clear it when ``minutes`` is zero."""

    minutes = int(arguments["minutes"])
    if minutes == 0:
        status, raw = await request(
            app, "delete", "/api/v1/ops/debug-logging", "", authorization, None
        )
    else:
        body: dict[str, Any] = {"minutes": minutes}
        if arguments.get("loggers") is not None:
            body["loggers"] = arguments["loggers"]
        status, raw = await request(
            app, "post", "/api/v1/ops/debug-logging", "", authorization, body
        )
    if not 200 <= status < 300:
        return invoke.route_error(status, raw)
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return invoke.error_result("invalid-response", "Prism answered without a debug window")
    return invoke.success_result(payload if isinstance(payload, dict) else {"result": payload})


register(
    Tool(
        name="cancel_job",
        title="Cancel a job",
        description=(
            "Ask one Prism job to cancel. A queued job is cancelled immediately; a "
            "running job is asked to stop, and its worker finalises the cancellation "
            "at its next checkpoint. It returns the status the request reached; it "
            "never deletes a job or its files."
        ),
        input_schema=_object({"job_id": _JOB_ID}, ("job_id",)),
        route=("post", "/api/v1/ops/jobs/{job_id}/cancel"),
        args=lambda arguments: ({"job_id": arguments["job_id"]}, {}),
        annotations=write_annotations(destructive=True),
        action="ops_act",
    )
)

register(
    Tool(
        name="requeue_job",
        title="Requeue a job",
        description=(
            "Put a failed or stuck Prism job back in the queue. Only a failed or "
            "retry-waiting job, or a running job whose worker lease has expired, can "
            "be requeued; a job someone asked to cancel cannot. A running job with a "
            "live lease is refused; cancel it instead and wait for it to stop. The attempt count is kept and "
            "the maximum is raised when needed."
        ),
        input_schema=_object({"job_id": _JOB_ID}, ("job_id",)),
        route=("post", "/api/v1/ops/jobs/{job_id}/requeue"),
        args=lambda arguments: ({"job_id": arguments["job_id"]}, {}),
        annotations=write_annotations(),
        action="ops_act",
    )
)

register(
    Tool(
        name="rebuild_bundle",
        title="Rebuild a design bundle",
        description=(
            "Drop one commit's cached design bundle and queue a rebuild that skips "
            "reuse. It rebuilds one project's bundle, never a release, and refuses "
            "while another design-bundle build of the project is active. Poll get_job "
            "with the returned job id until the build finishes."
        ),
        input_schema=_object(
            {"project_id": _PROJECT_ID, "commit": _COMMIT}, ("project_id",)
        ),
        route=("post", "/api/v1/ops/projects/{project_id}/rebuild-bundle"),
        args=_commit_body,
        annotations=write_annotations(destructive=True),
        action="ops_act",
    )
)

register(
    Tool(
        name="set_debug_logging",
        title="Set time-boxed debug logging",
        description=(
            "Raise Prism's own loggers to DEBUG for one to thirty minutes, or pass "
            "minutes 0 to clear the window now. Every API and worker process applies "
            "the same setting within about fifteen seconds and reverts at the "
            "deadline, with no restart. It changes no other configuration and cannot "
            "enable arbitrary loggers outside Prism's process."
        ),
        input_schema=_object(
            {
                "minutes": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 30,
                    "description": "Window length in minutes, 1 to 30; 0 clears it.",
                },
                "loggers": {
                    "type": "array",
                    "items": {"type": "string", "pattern": r"^app(\.[A-Za-z0-9_]+)*$"},
                    "maxItems": 20,
                    "description": "Prism logger names (app or app.*) to raise; default ['app'].",
                },
            },
            ("minutes",),
        ),
        # The tool dispatches to POST or DELETE itself; this is the clear route.
        route=("delete", "/api/v1/ops/debug-logging"),
        args=lambda arguments: ({}, {}),
        execute=_set_debug,
        output_schema=_DEBUG_OUTPUT,
        annotations=write_annotations(idempotent=True),
        action="ops_act",
    )
)


__all__: list[str] = []
