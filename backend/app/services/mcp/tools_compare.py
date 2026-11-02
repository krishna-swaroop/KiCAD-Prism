"""The comparison tools (ADR scripting-and-mcp §3.7).

A comparison is a Prism job, so the read set needs two calls, not one:
``compare_revisions`` starts the job and returns its handle, ``get_changes``
reads the review queue the Design Comparison workspace shows once the job is
done. Both go through the typed ``/api/v1`` routes like every other tool; the
body ``compare_revisions`` sends is the same one the browser sends.

``get_changes`` flattens the review route's groups into rows, in the route's
own order. Filters and the cursor are applied here because the route serves one
domain, not a page. The cursor names the job and an offset, base64-encoded, so a
client cannot accidentally page a different comparison.
"""

from __future__ import annotations

import base64
import binascii
import json
import re
from typing import Any

from app.core.config import settings
from app.core.links import project_url
from app.services.mcp import invoke
from app.services.mcp.registry import READ_ONLY_ANNOTATIONS, Tool, presenter, register


#: The tool speaks ``schematic``/``pcb``; the review route speaks ``sch``/``pcb``.
_REVIEW_DOMAIN = {"schematic": "sch", "pcb": "pcb"}
_KINDS = ("added", "changed", "removed")
_IMPACTS = (
    "mechanical",
    "fabrication",
    "electrical",
    "assembly",
    "constraints",
    "documentation",
)
_DEFAULT_LIMIT = 50
_MAX_LIMIT = 200



def _object(properties: dict[str, Any], required: tuple[str, ...] = ()) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": list(required),
        "additionalProperties": False,
    }


_PROJECT_ID = {"type": "string", "description": "The Prism project id."}
_JOB_ID = {"type": "string", "description": "The design-comparison job id."}
_DOMAIN = {
    "type": "string",
    "enum": ["schematic", "pcb"],
    "description": "Schematic or PCB review rows.",
}
_LIMIT = {
    "type": "integer",
    "minimum": 1,
    "maximum": _MAX_LIMIT,
    "default": _DEFAULT_LIMIT,
    "description": "Rows in this page; at most 200.",
}

_ROW_SCHEMA = _object(
    {
        "groupId": {"type": "string"},
        "kind": {"type": "string"},
        "impact": {"type": "string"},
        "section": {"type": "string"},
        "title": {"type": ["string", "null"]},
        "references": {"type": "array", "items": {"type": "string"}},
        "summary": {"type": "string"},
    }
)

_COMPARE_OUTPUT = _object(
    {
        "jobId": {"type": "string"},
        "status": {"type": "string"},
        "pollWith": {"type": "string"},
        "then": {"type": "string"},
        "link": {"type": "string"},
    },
    ("jobId", "status", "pollWith", "then"),
)

_CHANGES_OUTPUT = _object(
    {
        "jobId": {"type": "string"},
        "domain": {"type": "string", "enum": ["schematic", "pcb"]},
        "rows": {"type": "array", "items": _ROW_SCHEMA},
        "next": {"type": ["string", "null"]},
        "total": {"type": "integer"},
    },
    ("jobId", "domain", "rows", "next", "total"),
)


def _compare_args(
    arguments: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    return (
        {"project_id": arguments["project_id"]},
        {},
        {
            "base": arguments["base"],
            "head": arguments["head"],
            "include_unchanged": bool(arguments.get("include_unchanged", False)),
        },
    )


def _changes_args(arguments: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    return (
        {"project_id": arguments["project_id"], "job_id": arguments["job_id"]},
        {"domain": _REVIEW_DOMAIN[arguments["domain"]]},
    )


def comparison_link(project_id: Any, base: Any, head: Any) -> str | None:
    """The project's comparison view, when the deployment has a public URL."""

    base_url = settings.PUBLIC_BASE_URL.strip().rstrip("/")
    if not base_url or not project_id or not base or not head:
        return None
    return project_url(
        base_url,
        str(project_id),
        section="history",
        base=str(base),
        compare=str(head),
        view="semantic",
        diff="sch",
    )


register(
    Tool(
        name="compare_revisions",
        title="Compare two revisions",
        description=(
            "Start a design comparison between two commits. It starts a Prism job and "
            "changes no design. Without the tasks extension it returns at once with a "
            "job handle: poll get_job until the job is completed, then call get_changes "
            "with the same job id."
        ),
        input_schema=_object(
            {
                "project_id": _PROJECT_ID,
                "base": {
                    "type": "string",
                    "minLength": 1,
                    "description": "The base commit, branch or tag.",
                },
                "head": {
                    "type": "string",
                    "minLength": 1,
                    "description": "The commit, branch or tag to compare against base.",
                },
                "include_unchanged": {
                    "type": "boolean",
                    "default": False,
                    "description": "Include unchanged BOM rows in the comparison result.",
                },
            },
            ("project_id", "base", "head"),
        ),
        route=("post", "/api/v1/projects/{project_id}/design-compare"),
        args=_compare_args,
        annotations={
            "readOnlyHint": True,
            "idempotentHint": False,
            "openWorldHint": False,
        },
        output_schema=_COMPARE_OUTPUT,
    )
)

register(
    Tool(
        name="get_changes",
        title="Get a comparison's changes",
        description=(
            "The review rows of a finished design comparison, one row per review group "
            "in the queue's own order. Filter by kind, impact or an exact reference "
            "designator; page with next's opaque cursor."
        ),
        input_schema=_object(
            {
                "project_id": _PROJECT_ID,
                "job_id": _JOB_ID,
                "domain": _DOMAIN,
                "kind": {
                    "type": "string",
                    "enum": list(_KINDS),
                    "description": "Only rows whose group adds, changes or removes.",
                },
                "impact": {
                    "type": "string",
                    "enum": list(_IMPACTS),
                    "description": "Only rows owned by this discipline.",
                },
                "reference": {
                    "type": "string",
                    "minLength": 1,
                    "description": "Only rows whose references include this designator.",
                },
                "cursor": {
                    "type": "string",
                    "minLength": 1,
                    "description": "The previous page's next value.",
                },
                "limit": _LIMIT,
            },
            ("project_id", "job_id", "domain"),
        ),
        route=("get", "/api/v1/projects/{project_id}/design-compare/{job_id}/review"),
        args=_changes_args,
        annotations=dict(READ_ONLY_ANNOTATIONS),
        output_schema=_CHANGES_OUTPUT,
    )
)


@presenter("compare_revisions")
def _present_compare(arguments: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    if result.get("isError"):
        return result
    structured = result.get("structuredContent") or {}
    job_id = structured.get("job_id")
    if not isinstance(job_id, str) or not job_id:
        return invoke.error_result(
            "invalid-response", "Prism did not return a comparison job id"
        )

    shaped: dict[str, Any] = {
        "jobId": job_id,
        "status": "queued",
        "pollWith": "get_job",
        "then": "get_changes",
    }
    link = comparison_link(
        arguments.get("project_id"), arguments.get("base"), arguments.get("head")
    )
    if link:
        shaped["link"] = link
    result["structuredContent"] = shaped
    return result


def _natural_key(value: str) -> list[Any]:
    return [
        int(part) if part.isdigit() else part.casefold()
        for part in re.split(r"([0-9]+)", value)
    ]


def _references(group: dict[str, Any]) -> list[str]:
    """The group's designators, as the review route reports them."""

    supplied = group.get("references")
    if not isinstance(supplied, list):
        return []
    return sorted({str(value) for value in supplied if value}, key=_natural_key)


def _row(group: dict[str, Any]) -> dict[str, Any]:
    return {
        "groupId": str(group.get("id") or ""),
        "kind": str(group.get("kind") or ""),
        "impact": str(group.get("impact") or ""),
        "section": str(group.get("section") or ""),
        "title": group.get("title") if group.get("title") is not None else group.get("label"),
        "references": _references(group),
        "summary": str(group.get("summary") or ""),
    }


def _encode_cursor(job_id: str, offset: int) -> str:
    raw = json.dumps(
        {"job": job_id, "offset": offset}, separators=(",", ":")
    ).encode("utf-8")
    return base64.b64encode(raw).decode("ascii")


def _decode_cursor(cursor: str) -> dict[str, Any] | None:
    try:
        raw = base64.b64decode(cursor.encode("ascii"), validate=True)
        decoded = json.loads(raw.decode("utf-8"))
    except (binascii.Error, UnicodeDecodeError, UnicodeEncodeError, ValueError):
        return None
    return decoded if isinstance(decoded, dict) else None


@presenter("get_changes")
def _present_changes(
    arguments: dict[str, Any], result: dict[str, Any]
) -> dict[str, Any]:
    if result.get("isError"):
        error = (result.get("structuredContent") or {}).get("error") or {}
        if error.get("status") == 409 or error.get("code") == "http-409":
            detail = str(error.get("detail") or "")
            if not detail.startswith("Job status:"):
                detail = f"Job status: {detail or 'unknown'}"
            return invoke.error_result("comparison-running", detail, status=409)
        return result

    structured = result.get("structuredContent") or {}
    groups = structured.get("groups")
    if not isinstance(groups, list):
        return invoke.error_result(
            "invalid-response", "Prism did not return comparison review groups"
        )

    job_id = str(arguments.get("job_id") or structured.get("jobId") or "")
    domain = str(arguments.get("domain") or "")
    rows = [_row(group) for group in groups if isinstance(group, dict)]

    kind = arguments.get("kind")
    if isinstance(kind, str) and kind:
        rows = [row for row in rows if row["kind"] == kind]

    impact = arguments.get("impact")
    if isinstance(impact, str) and impact:
        rows = [row for row in rows if row["impact"] == impact]

    reference = arguments.get("reference")
    if isinstance(reference, str) and reference:
        wanted = reference.casefold()
        rows = [
            row
            for row in rows
            if any(str(value).casefold() == wanted for value in row["references"])
        ]

    total = len(rows)
    offset = 0
    cursor = arguments.get("cursor")
    if isinstance(cursor, str) and cursor:
        decoded = _decode_cursor(cursor)
        if decoded is None or decoded.get("job") != job_id:
            return invoke.error_result(
                "invalid-cursor", "cursor is not a cursor this comparison produced"
            )
        offset = decoded.get("offset")
        if not isinstance(offset, int) or offset < 0:
            return invoke.error_result(
                "invalid-cursor", "cursor is not a cursor this comparison produced"
            )

    limit = arguments.get("limit")
    limit = int(limit) if isinstance(limit, int) else _DEFAULT_LIMIT
    limit = min(max(limit, 1), _MAX_LIMIT)
    page = rows[offset : offset + limit]
    next_cursor = (
        _encode_cursor(job_id, offset + limit) if offset + limit < total else None
    )

    shaped = {
        "jobId": job_id,
        "domain": domain,
        "rows": page,
        "next": next_cursor,
        "total": total,
    }
    result["structuredContent"] = shaped
    return result


__all__ = ["comparison_link"]
