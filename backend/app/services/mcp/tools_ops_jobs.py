"""Ops read tools for jobs and bundle builds (ADR scripting-and-mcp §11).

Both tools call the typed ``/api/v1/ops`` route of the same name, declare
``action="ops_read"`` and read-only annotations, and are listed only while
``PRISM_MCP_OPS_ENABLED`` is on (OPS-01). Their results are what the route
returns: identifiers, timings, counts and sizes, with every free-text field
already redacted by the service.
"""

from __future__ import annotations


from app.services.mcp.registry import READ_ONLY_ANNOTATIONS, Tool, register
from app.services.mcp.schema import object_schema as _object


_PROJECT_ID = {"type": "string", "description": "The Prism project id."}
_JOB_ID = {"type": "string", "description": "The Prism job id."}
_LOG_LINES = {
    "type": "integer",
    "minimum": 1,
    "maximum": 200,
    "description": "Lines of the redacted log tail to return (default 50).",
}


register(
    Tool(
        name="get_job_timeline",
        title="Get a job timeline",
        description=(
            "One Prism job's timeline: status, queue wait, every worker claim with how "
            "long it held the job, per-stage durations, the resource slots and locks it "
            "holds, and its redacted error and log tail. Use it to explain why a job was "
            "slow, retried or failed; it never returns the payload or result, which may "
            "hold design data."
        ),
        input_schema=_object({"job_id": _JOB_ID, "log_lines": _LOG_LINES}, ("job_id",)),
        route=("get", "/api/v1/ops/jobs/{job_id}/timeline"),
        args=lambda arguments: (
            {"job_id": arguments["job_id"]},
            {"log_lines": arguments.get("log_lines")},
        ),
        annotations=dict(READ_ONLY_ANNOTATIONS),
        action="ops_read",
    )
)

register(
    Tool(
        name="get_bundle_build_profile",
        title="Get a bundle build profile",
        description=(
            "How a design bundle build spent its time: each prism-kicad invocation and "
            "KiCad step with its exit, elapsed time and peak memory, the upgrade, refill "
            "and GLB cache hits, stage statuses, the failed or partial stages and the "
            "slowest step. It reports counts, timings and sizes, never design content."
        ),
        input_schema=_object(
            {
                "project_id": _PROJECT_ID,
                "commit": {
                    "type": "string",
                    "description": "A full commit sha, branch or tag; omitted, the project's head.",
                },
                "job_id": {
                    "type": "string",
                    "description": "A specific bundle job; its bundle is profiled whatever the commit.",
                },
            },
            ("project_id",),
        ),
        route=("get", "/api/v1/ops/projects/{project_id}/bundle-profile"),
        args=lambda arguments: (
            {"project_id": arguments["project_id"]},
            {"commit": arguments.get("commit"), "job_id": arguments.get("job_id")},
        ),
        annotations=dict(READ_ONLY_ANNOTATIONS),
        action="ops_read",
    )
)


__all__: list[str] = []
