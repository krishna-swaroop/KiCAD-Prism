"""The comment write tools (ADR scripting-and-mcp §10 D13–D16).

``add_comment`` posts a review comment anchored by design identity — a
component reference, a net name, a schematic sheet, or one comparison change —
never by coordinates. ``reply_to_comment`` answers an existing thread. Both
create rows exactly as the browser does, so the comment carries the MCP
client's identity and Prism marks it agent-authored; neither can edit or
delete.

``resolve_comment`` never writes: resolving a thread needs a person (D6), so the
tool hands the caller a URL where they do it (D15). Every tool's
``idempotencyKey`` travels as the route's ``Idempotency-Key`` header through
``invoke``; a retried call with the same key creates one comment.

Result shaping cites the created thread with the project URL grammar; comment
resources have no ``prism://`` kind yet, so a result carries ``link`` only.
"""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import quote

from app.core.config import settings
from app.core.links import project_url
from app.services.comments_store_service import COMMENT_CLASSES, COMMENT_SEVERITIES
from app.services.mcp import invoke
from app.services.mcp.registry import RouteRequest, Tool, register, write_annotations

_DOMAIN = {"schematic": "SCH", "pcb": "PCB"}
_RESOLVE_MESSAGE = "Resolving a comment needs a person in Prism."


def _object(properties: dict[str, Any], required: tuple[str, ...] = ()) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": list(required),
        "additionalProperties": False,
    }


_PROJECT_ID = {"type": "string", "minLength": 1, "description": "The Prism project id."}
_COMMENT_ID = {"type": "string", "minLength": 1, "description": "The Prism comment id."}
_CONTENT = {
    "type": "string",
    "minLength": 1,
    "maxLength": 16_000,
    "description": "The comment body, as Markdown or plain text.",
}
_COMMIT = {
    "type": "string",
    "description": (
        "The revision to anchor to: a full commit sha, branch or tag; omitted "
        "reads the project's default branch head."
    ),
}
_COMMENT_CLASS = {
    "type": "string",
    "enum": list(COMMENT_CLASSES),
    "description": "What kind of note this is (default general).",
}
_SEVERITY = {
    "type": "string",
    "enum": list(COMMENT_SEVERITIES),
    "description": "How urgent the note is (default info).",
}
_CHANGE = _object(
    {
        "jobId": {
            "type": "string",
            "minLength": 1,
            "description": "The finished design-comparison job; its base and head are read from it.",
        },
        "baseCommit": {"type": "string", "minLength": 1, "description": "The comparison's base commit."},
        "compareCommit": {"type": "string", "minLength": 1, "description": "The comparison's compared commit."},
        "domain": {
            "type": "string",
            "enum": ["schematic", "pcb"],
            "description": "Schematic or PCB review change.",
        },
        "semanticItemId": {
            "type": "string",
            "minLength": 1,
            "description": "The comparison change id the review row names.",
        },
    },
    ("domain", "semanticItemId"),
)


def _canvas_path(project_id: str) -> str:
    return f"/api/v1/projects/{quote(project_id, safe='')}/comments/anchored"


def _comparison_path(project_id: str) -> str:
    return f"/api/v1/projects/{quote(project_id, safe='')}/comparison-comments"


def _reply_path(project_id: str, comment_id: str) -> str:
    return (
        f"/api/v1/projects/{quote(project_id, safe='')}/comments/"
        f"{quote(comment_id, safe='')}/replies"
    )


def _job_path(job_id: str) -> str:
    return f"/api/v1/jobs/{quote(job_id, safe='')}"


def _public_base() -> str:
    return settings.PUBLIC_BASE_URL.strip().rstrip("/")


def comment_link(project_id: str, comment: dict[str, Any]) -> str | None:
    """The Prism page for one thread, or ``None`` without a public base URL."""

    base = _public_base()
    if not base or not project_id:
        return None
    comment_id = str(comment.get("id") or "")
    context = str(comment.get("context") or "")
    if str(comment.get("scope") or "") == "comparison":
        return project_url(
            base,
            project_id,
            section="history",
            base=str(comment.get("baseCommit") or ""),
            compare=str(comment.get("compareCommit") or ""),
            view="semantic",
            diff="sch" if context == "SCH" else "pcb",
            comment=comment_id,
        )
    anchor = comment.get("anchor")
    commit = str(anchor.get("commit") or "") if isinstance(anchor, dict) else ""
    return project_url(
        base,
        project_id,
        section="visualizers",
        tab="sch" if context == "SCH" else "pcb",
        commit=commit,
        comment=comment_id,
    )


def _created(project_id: str, comment: dict[str, Any]) -> dict[str, Any]:
    """The route's created thread, plus the Prism page for it."""

    link = comment_link(project_id, comment)
    if link:
        comment["link"] = link
    return invoke.success_result(comment)


def _payload(status: int, raw: bytes) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """``(body, error)``: the route's JSON object, or the tool execution error."""

    if not 200 <= status < 300:
        return None, invoke.route_error(status, raw)
    try:
        payload = json.loads(raw.decode("utf-8")) if raw else None
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None, invoke.error_result(
            "invalid-response", f"Prism answered {status} with a body that is not JSON"
        )
    if not isinstance(payload, dict):
        return None, invoke.error_result("invalid-response", "Prism answered without a JSON object")
    return payload, None


async def _add_canvas(
    app: Any, arguments: dict[str, Any], authorization: str, request: RouteRequest
) -> dict[str, Any]:
    project_id = str(arguments["project_id"])
    body: dict[str, Any] = {"content": arguments["content"]}
    for key in ("commit", "component", "net", "sheet", "view", "commentClass", "severity"):
        if arguments.get(key) is not None:
            body[key] = arguments[key]
    status, raw = await request(
        app, "post", _canvas_path(project_id), "", authorization, body
    )
    comment, error = _payload(status, raw)
    if error is not None:
        return error
    assert comment is not None
    return _created(project_id, comment)


async def _comparison_change(
    app: Any, arguments: dict[str, Any], authorization: str, request: RouteRequest
) -> tuple[dict[str, str] | None, dict[str, Any] | None]:
    """The comparison's base and head, from the change or from its job."""

    change = arguments["change"]
    base = str(change.get("baseCommit") or "")
    compare = str(change.get("compareCommit") or "")
    if base and compare:
        return {"base": base, "head": compare}, None

    job_id = str(change.get("jobId") or "")
    if not job_id:
        return None, invoke.error_result(
            "invalid-arguments",
            "Invalid arguments: change needs jobId, or baseCommit and compareCommit",
        )
    status, raw = await request(app, "get", _job_path(job_id), "", authorization, None)
    job, error = _payload(status, raw)
    if error is not None:
        return None, error
    assert job is not None
    metadata = job.get("result_metadata")
    metadata = metadata if isinstance(metadata, dict) else {}
    base = str(metadata.get("base") or job.get("base") or "")
    compare = str(metadata.get("head") or job.get("head") or "")
    if not base or not compare:
        state = str(job.get("status") or "unknown")
        return None, invoke.error_result("comparison-not-ready", f"Job status: {state}", status=409)
    return {"base": base, "head": compare}, None


async def _add_comparison(
    app: Any, arguments: dict[str, Any], authorization: str, request: RouteRequest
) -> dict[str, Any]:
    project_id = str(arguments["project_id"])
    change = arguments["change"]
    domain = _DOMAIN.get(str(change.get("domain") or "").strip().lower())
    if domain is None:
        return invoke.error_result("invalid-arguments", "change.domain must be 'schematic' or 'pcb'")
    semantic_item_id = str(change.get("semanticItemId") or "").strip()
    if not semantic_item_id:
        return invoke.error_result("invalid-arguments", "change.semanticItemId is required")

    commits, error = await _comparison_change(app, arguments, authorization, request)
    if error is not None:
        return error
    assert commits is not None
    body: dict[str, Any] = {
        "baseCommit": commits["base"],
        "compareCommit": commits["head"],
        "domain": domain,
        "content": arguments["content"],
        "semanticItemId": semantic_item_id,
        "anchorKind": "item",
    }
    for key in ("commentClass", "severity"):
        if arguments.get(key) is not None:
            body[key] = arguments[key]
    status, raw = await request(
        app, "post", _comparison_path(project_id), "", authorization, body
    )
    comment, error = _payload(status, raw)
    if error is not None:
        return error
    assert comment is not None
    return _created(project_id, comment)


async def add_comment(
    app: Any,
    arguments: dict[str, Any],
    authorization: str,
    request: RouteRequest,
) -> dict[str, Any]:
    """Post the one comment the arguments name: a design element or a change."""

    change = arguments.get("change")
    anchors = [key for key in ("component", "net", "sheet") if arguments.get(key)]
    if change is not None and anchors:
        return invoke.error_result(
            "invalid-arguments",
            "Invalid arguments: name either change or one of component, net, sheet, not both",
        )
    if change is not None:
        return await _add_comparison(app, arguments, authorization, request)
    return await _add_canvas(app, arguments, authorization, request)


async def reply_to_comment(
    app: Any,
    arguments: dict[str, Any],
    authorization: str,
    request: RouteRequest,
) -> dict[str, Any]:
    project_id = str(arguments["project_id"])
    comment_id = str(arguments["comment_id"])
    status, raw = await request(
        app,
        "post",
        _reply_path(project_id, comment_id),
        "",
        authorization,
        {"content": arguments["content"]},
    )
    created, error = _payload(status, raw)
    if error is not None:
        return error
    assert created is not None
    comment = created.get("comment")
    if isinstance(comment, dict):
        link = comment_link(project_id, comment)
        if link:
            created["link"] = link
    return invoke.success_result(created)


async def resolve_comment(
    app: Any,
    arguments: dict[str, Any],
    authorization: str,
    request: RouteRequest,
) -> dict[str, Any]:
    """Hand resolution to a person; the tool never changes the thread (D15)."""

    base = _public_base()
    project_id = str(arguments["project_id"])
    comment_id = str(arguments["comment_id"])
    if not base:
        return invoke.error_result(
            "handoff-unavailable",
            "This Prism deployment has no public URL; open the comment in Prism.",
        )
    invoke.handoff(
        project_url(base, project_id, section="visualizers", comment=comment_id),
        _RESOLVE_MESSAGE,
    )


register(
    Tool(
        name="add_comment",
        title="Add a review comment",
        description=(
            "Post a review comment anchored by design identity: a component reference, a "
            "net name, a schematic sheet, or one comparison change. Prism resolves the "
            "position from the revision's design bundle, and shows the comment as "
            "agent-authored."
        ),
        input_schema=_object(
            {
                "project_id": _PROJECT_ID,
                "content": _CONTENT,
                "component": {
                    "type": "string",
                    "minLength": 1,
                    "description": "Reference designator, for example R12.",
                },
                "net": {"type": "string", "minLength": 1, "description": "The net name."},
                "sheet": {
                    "type": "string",
                    "minLength": 1,
                    "description": "Schematic sheet instance path, sheet path, page or name.",
                },
                "change": {**_CHANGE, "description": "One comparison review change."},
                "view": {
                    "type": "string",
                    "enum": ["pcb", "sch"],
                    "description": "Board or schematic view (default: pcb for component and net, sch for sheet).",
                },
                "commit": _COMMIT,
                "commentClass": _COMMENT_CLASS,
                "severity": _SEVERITY,
            },
            ("project_id", "content"),
        ),
        route=("post", "/api/v1/projects/{project_id}/comments/anchored"),
        args=lambda arguments: ({"project_id": arguments["project_id"]}, {}, {}),
        execute=add_comment,
        annotations=write_annotations(),
        action="comment",
    )
)

register(
    Tool(
        name="reply_to_comment",
        title="Reply to a comment",
        description=(
            "Reply in an existing comment thread. The reply is shown as "
            "agent-authored; resolving the thread stays a person's action in Prism."
        ),
        input_schema=_object(
            {"project_id": _PROJECT_ID, "comment_id": _COMMENT_ID, "content": _CONTENT},
            ("project_id", "comment_id", "content"),
        ),
        route=("post", "/api/v1/projects/{project_id}/comments/{comment_id}/replies"),
        args=lambda arguments: (
            {"project_id": arguments["project_id"], "comment_id": arguments["comment_id"]},
            {},
            {"content": arguments["content"]},
        ),
        execute=reply_to_comment,
        annotations=write_annotations(),
        action="comment",
    )
)

register(
    Tool(
        name="resolve_comment",
        title="Resolve a comment",
        description=(
            "Resolving or reopening a comment needs a person in Prism. This tool never "
            "changes the thread: it returns the Prism page where the user resolves it."
        ),
        input_schema=_object(
            {"project_id": _PROJECT_ID, "comment_id": _COMMENT_ID},
            ("project_id", "comment_id"),
        ),
        route=("get", "/api/v1/projects/{project_id}"),
        args=lambda arguments: ({"project_id": arguments["project_id"]}, {}),
        execute=resolve_comment,
        annotations=write_annotations(idempotent=True),
        action="comment",
        output_schema=_object({"url": {"type": "string"}, "message": {"type": "string"}}),
    )
)


__all__ = ["add_comment", "comment_link", "reply_to_comment", "resolve_comment"]
