"""The v5.1 read tools (ADR scripting-and-mcp §3.7, §7).

Each declaration names one task an agent actually asks for and the typed
``/api/v1`` route that answers it. Results are pinned to the revision named in
``revision``; a full commit sha is immutable, any other ref resolves at call
time. None of these tools writes, starts a job or resolves a comment.

Each tool's ``present`` hook (bound with ``registry.presenter``) is the small
result step ``/mcp`` applies after invocation: comments can be filtered by
status, and a result that names a project, a revision and an element carries
both a browser ``link`` and a ``prism://`` ``uri``. Both are built by
``app.core.links``, never spelled here.

Importing this module registers every tool: it imports the other tool modules
at its end. ``registry.tools()`` lists reads, then writes, then ops tools;
import order only sets the order within each group.
"""

from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.core.links import resource_uri, view_url
from app.services.mcp.registry import READ_ONLY_ANNOTATIONS, Tool, presenter, register

# The render tool registers from its own module; importing it first keeps it
# first among the reads.
from app.services.mcp import tools_render as _tools_render  # noqa: E402,F401

_FULL_SHA = 40


def _object(properties: dict[str, Any], required: tuple[str, ...] = ()) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": list(required),
        "additionalProperties": False,
    }


_PROJECT_ID = {"type": "string", "description": "The Prism project id."}
_REVISION = {
    "type": "string",
    "description": (
        "A full commit sha, branch or tag. The result is pinned to this "
        "revision; omitted, the project's default branch head is read."
    ),
}
_LIMIT = {"type": "integer", "minimum": 1, "maximum": 500}


def _list_revisions_args(arguments: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    return {"project_id": arguments["project_id"]}, {
        key: arguments.get(key) for key in ("limit",)
    }


def _search_projects_args(arguments: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    return {}, {"q": arguments.get("query"), "limit": arguments.get("limit")}


def _find_in_design_args(arguments: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    return {"project_id": arguments["project_id"]}, {
        "q": arguments["query"],
        "kind": arguments.get("kinds"),
        "revision": arguments.get("revision"),
        "limit": arguments.get("limit"),
    }


def _component_args(arguments: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    return (
        {"project_id": arguments["project_id"], "ref": arguments["reference"]},
        {"revision": arguments.get("revision")},
    )


def _net_args(arguments: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    return (
        {"project_id": arguments["project_id"], "name": arguments["net"]},
        {"revision": arguments.get("revision")},
    )


def _bom_args(arguments: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    return {"project_id": arguments["project_id"]}, {
        "commit": arguments.get("revision"),
        "assembly": arguments.get("assembly"),
    }


def _comparison_review_args(arguments: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    return (
        {"project_id": arguments["project_id"], "job_id": arguments["job_id"]},
        {"domain": arguments["domain"]},
    )


def _search_catalog_args(arguments: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    return {}, {"q": arguments["query"], "page_size": arguments.get("limit")}


register(
    Tool(
        name="search_projects",
        title="Search projects",
        description=(
            "Find projects in this Prism workspace by name, description or repository. "
            "Returns the same project summaries the workspace lists."
        ),
        input_schema=_object(
            {
                "query": {
                    "type": "string",
                    "description": "Text to match in name, description or repository; omit it to list every project.",
                },
                "limit": _LIMIT,
            }
        ),
        route=("get", "/api/v1/projects/search"),
        args=_search_projects_args,
        annotations=dict(READ_ONLY_ANNOTATIONS),
    )
)

register(
    Tool(
        name="get_project",
        title="Get a project",
        description=(
            "One project's registry record: name, description, repository, path and "
            "latest sync."
        ),
        input_schema=_object({"project_id": _PROJECT_ID}, ("project_id",)),
        route=("get", "/api/v1/projects/{project_id}"),
        args=lambda arguments: ({"project_id": arguments["project_id"]}, {}),
        annotations=dict(READ_ONLY_ANNOTATIONS),
    )
)

register(
    Tool(
        name="list_revisions",
        title="List revisions",
        description=(
            "A project's commit history, newest first, with the checkout's HEAD. Each "
            "entry carries a commit sha the other design tools accept as revision."
        ),
        input_schema=_object({"project_id": _PROJECT_ID, "limit": _LIMIT}, ("project_id",)),
        route=("get", "/api/v1/projects/{project_id}/commits"),
        args=_list_revisions_args,
        annotations=dict(READ_ONLY_ANNOTATIONS),
    )
)

register(
    Tool(
        name="find_in_design",
        title="Find in a design",
        description=(
            "Search a revision's components and nets by reference, value, field or name. "
            "Results are pinned to the revision named in revision."
        ),
        input_schema=_object(
            {
                "project_id": _PROJECT_ID,
                "query": {"type": "string", "minLength": 1, "description": "Text to find."},
                "kinds": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["component", "net"]},
                    "minItems": 1,
                    "description": "Restrict to components, nets, or both (default both).",
                },
                "revision": _REVISION,
                "limit": {"type": "integer", "minimum": 1, "maximum": 200},
            },
            ("project_id", "query"),
        ),
        route=("get", "/api/v1/projects/{project_id}/design/search"),
        args=_find_in_design_args,
        annotations=dict(READ_ONLY_ANNOTATIONS),
    )
)

register(
    Tool(
        name="get_component",
        title="Get a component",
        description=(
            "One component at a revision: value, footprint, sheet, assembly state, fields "
            "and pins with their nets. Results are pinned to the revision named in revision."
        ),
        input_schema=_object(
            {
                "project_id": _PROJECT_ID,
                "reference": {"type": "string", "minLength": 1, "description": "Reference designator, for example U1."},
                "revision": _REVISION,
            },
            ("project_id", "reference"),
        ),
        route=("get", "/api/v1/projects/{project_id}/design/components/{ref}"),
        args=_component_args,
        annotations=dict(READ_ONLY_ANNOTATIONS),
    )
)

register(
    Tool(
        name="get_net",
        title="Get a net",
        description=(
            "One net at a revision: pins, connected components, class and aliases. Net "
            "names may contain slashes. Results are pinned to the revision named in revision."
        ),
        input_schema=_object(
            {
                "project_id": _PROJECT_ID,
                "net": {"type": "string", "minLength": 1, "description": "The net name."},
                "revision": _REVISION,
            },
            ("project_id", "net"),
        ),
        route=("get", "/api/v1/projects/{project_id}/design/nets/{name}"),
        args=_net_args,
        annotations=dict(READ_ONLY_ANNOTATIONS),
    )
)

register(
    Tool(
        name="get_bom",
        title="Get the BOM",
        description=(
            "The engineering BOM of a revision, grouped exactly as the UI groups it, with "
            "the assembly filter. Results are pinned to the revision named in revision."
        ),
        input_schema=_object(
            {
                "project_id": _PROJECT_ID,
                "revision": _REVISION,
                "assembly": {
                    "type": "string",
                    "enum": ["all", "assembly"],
                    "description": "Every line, or only parts placed in the assembly.",
                },
            },
            ("project_id",),
        ),
        route=("get", "/api/v1/projects/{project_id}/bom"),
        args=_bom_args,
        annotations=dict(READ_ONLY_ANNOTATIONS),
    )
)

register(
    Tool(
        name="get_comparison_review",
        title="Get a comparison review",
        description=(
            "The server's review groups for one domain of a finished design comparison. "
            "Compare two commits in Prism or with the API, then poll get_job until it is done."
        ),
        input_schema=_object(
            {
                "project_id": _PROJECT_ID,
                "job_id": {"type": "string", "description": "The design-comparison job id."},
                "domain": {
                    "type": "string",
                    "enum": ["sch", "pcb"],
                    "description": "Schematic or PCB review groups.",
                },
            },
            ("project_id", "job_id", "domain"),
        ),
        route=("get", "/api/v1/projects/{project_id}/design-compare/{job_id}/review"),
        args=_comparison_review_args,
        annotations=dict(READ_ONLY_ANNOTATIONS),
    )
)

register(
    Tool(
        name="get_job",
        title="Get a job",
        description=(
            "One Prism job's status, stage and message. Poll this for comparison and bundle "
            "work; the job id is the handle, so no MCP session is needed."
        ),
        input_schema=_object(
            {"job_id": {"type": "string", "description": "The Prism job id."}},
            ("job_id",),
        ),
        route=("get", "/api/v1/jobs/{job_id}"),
        args=lambda arguments: ({"job_id": arguments["job_id"]}, {}),
        annotations=dict(READ_ONLY_ANNOTATIONS),
    )
)

register(
    Tool(
        name="list_comments",
        title="List comments",
        description=(
            "A project's comment threads with anchors, replies and capabilities. Filter "
            "with status; resolving or reopening stays a human action in Prism."
        ),
        input_schema=_object(
            {
                "project_id": _PROJECT_ID,
                "status": {
                    "type": "string",
                    "enum": ["OPEN", "RESOLVED", "open", "resolved"],
                    "description": "Only threads in this state.",
                },
            },
            ("project_id",),
        ),
        route=("get", "/api/v1/projects/{project_id}/comments"),
        args=lambda arguments: ({"project_id": arguments["project_id"]}, {}),
        annotations=dict(READ_ONLY_ANNOTATIONS),
    )
)

register(
    Tool(
        name="search_catalog",
        title="Search the catalog",
        description=(
            "Search the component catalog by part number, manufacturer or description. "
            "Returns catalog components, not project placements."
        ),
        input_schema=_object(
            {
                "query": {"type": "string", "description": "Text to search for."},
                "limit": _LIMIT,
            },
            ("query",),
        ),
        route=("get", "/api/v1/catalog/components"),
        args=_search_catalog_args,
        annotations=dict(READ_ONLY_ANNOTATIONS),
    )
)

register(
    Tool(
        name="get_catalog_component",
        title="Get a catalog component",
        description=(
            "One catalog component with its representations, assets, workflow stage and "
            "release state."
        ),
        input_schema=_object(
            {"component_id": {"type": "string", "description": "The catalog component id."}},
            ("component_id",),
        ),
        route=("get", "/api/v1/catalog/components/{component_id}"),
        args=lambda arguments: ({"component_id": arguments["component_id"]}, {}),
        annotations=dict(READ_ONLY_ANNOTATIONS),
    )
)

register(
    Tool(
        name="get_release_status",
        title="Get release status",
        description=(
            "A project's Release Studio candidates, their builds and each build's status. "
            "Approving or publishing a release happens in Prism, by a person."
        ),
        input_schema=_object({"project_id": _PROJECT_ID}, ("project_id",)),
        route=("get", "/api/v1/projects/{project_id}/release-studio/candidates"),
        args=lambda arguments: ({"project_id": arguments["project_id"]}, {}),
        annotations=dict(READ_ONLY_ANNOTATIONS),
    )
)


def _full_sha(value: Any) -> str | None:
    text = str(value or "").strip().lower()
    if len(text) == _FULL_SHA and all(character in "0123456789abcdef" for character in text):
        return text
    return None


def _link(
    project_id: str,
    commit: str | None,
    *,
    tab: str,
    sel: tuple[str, ...] = (),
    nets: tuple[str, ...] = (),
) -> str | None:
    base = settings.PUBLIC_BASE_URL.strip().rstrip("/")
    if not base:
        return None
    return view_url(base, project_id, tab=tab, commit=commit, sel=sel, nets=nets)


def _cite(
    structured: dict[str, Any],
    project_id: str,
    commit: str,
    kind: str,
    key: str | None,
    *,
    tab: str | None = None,
    sel: tuple[str, ...] = (),
    nets: tuple[str, ...] = (),
) -> None:
    """Add ``link``/``uri`` at the top level and, when given, on the element."""

    uri = resource_uri(project_id, commit, kind, key)
    link = _link(
        project_id,
        commit,
        tab=tab or {"component": "sch", "net": "pcb", "bom": "bom"}[kind],
        sel=sel,
        nets=nets,
    )
    structured["uri"] = uri
    if link:
        structured["link"] = link
    element = structured.get(kind)
    if isinstance(element, dict):
        element["uri"] = uri
        if link:
            element["link"] = link


def _view_tab(element: dict[str, Any]) -> str:
    """A component with a footprint opens on the board; a symbol-only one on its sheet."""

    return "pcb" if str(element.get("footprint") or "").strip() else "sch"


def _cite_search_hits(
    structured: dict[str, Any], project_id: str, commit: str
) -> None:
    """Give each search row the link that opens it in the viewer."""

    results = structured.get("results")
    if not isinstance(results, list):
        return
    for row in results:
        if not isinstance(row, dict):
            continue
        if row.get("kind") == "component":
            reference = str(row.get("reference") or "")
            link = _link(
                project_id,
                commit,
                tab=_view_tab(row),
                sel=(reference,) if reference else (),
            )
        elif row.get("kind") == "net":
            name = str(row.get("name") or "")
            link = _link(
                project_id,
                commit,
                tab="pcb",
                nets=(name,) if name else (),
            )
        else:
            continue
        if link:
            row["link"] = link


def _cited(arguments: dict[str, Any], result: dict[str, Any]) -> tuple[dict[str, Any], str] | None:
    """The result's structured content and project id, when it names a project to cite."""

    structured = result.get("structuredContent")
    if result.get("isError") or not isinstance(structured, dict):
        return None
    project_id = str(arguments.get("project_id") or "")
    return (structured, project_id) if project_id else None


def _revision_commit(structured: dict[str, Any]) -> str | None:
    revision = structured.get("revision") or {}
    return _full_sha(revision.get("commit") if isinstance(revision, dict) else None)


@presenter("list_comments")
def _present_comments(arguments: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    """Keep only the threads in the requested status; the route returns every one."""

    structured = result.get("structuredContent")
    wanted = str(arguments.get("status") or "").upper()
    comments = structured.get("comments") if isinstance(structured, dict) else None
    if wanted and isinstance(comments, list):
        structured["comments"] = [
            comment for comment in comments if str(comment.get("status") or "").upper() == wanted
        ]
    return result


@presenter("get_component")
def _present_component(arguments: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    found = _cited(arguments, result)
    commit = _revision_commit(found[0]) if found else None
    if found and commit:
        structured, project_id = found
        reference = str(arguments.get("reference") or "")
        _cite(
            structured,
            project_id,
            commit,
            "component",
            reference or None,
            tab=_view_tab(structured.get("component") or {}),
            sel=(reference,) if reference else (),
        )
    return result


@presenter("get_net")
def _present_net(arguments: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    found = _cited(arguments, result)
    commit = _revision_commit(found[0]) if found else None
    if found and commit:
        structured, project_id = found
        name = str(arguments.get("net") or "")
        _cite(structured, project_id, commit, "net", name or None, tab="pcb", nets=(name,) if name else ())
    return result


@presenter("find_in_design")
def _present_search(arguments: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    found = _cited(arguments, result)
    commit = _revision_commit(found[0]) if found else None
    if found and commit:
        _cite_search_hits(found[0], found[1], commit)
    return result


@presenter("get_bom")
def _present_bom(arguments: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    found = _cited(arguments, result)
    if found is None:
        return result
    structured, project_id = found
    commit = _full_sha(structured.get("commit")) or _full_sha(arguments.get("revision"))
    if commit:
        _cite(structured, project_id, commit, "bom", None)
    else:
        link = _link(project_id, None, tab="bom")
        if link:
            structured["link"] = link
    return result


__all__: list[str] = []


# The other tool modules. The registry groups reads, writes and ops tools
# itself; this order is only the order within each group, which clients see.
from app.services.mcp import tools_compare as _tools_compare  # noqa: E402, F401
from app.services.mcp import tools_catalog_reads as _tools_catalog_reads  # noqa: E402, F401
from app.services.mcp import tools_writes as _tools_writes  # noqa: E402, F401
from app.services.mcp import tools_comments as _tools_comments  # noqa: E402, F401
from app.services.mcp import tools_catalog_writes as _tools_catalog_writes  # noqa: E402, F401
from app.services.mcp import tools_supply as _tools_supply  # noqa: E402, F401
from app.services.mcp import tools_ops_jobs as _tools_ops_jobs  # noqa: E402, F401
from app.services.mcp import tools_ops_runtime as _tools_ops_runtime  # noqa: E402, F401
from app.services.mcp import tools_ops_profile as _tools_ops_profile  # noqa: E402, F401
from app.services.mcp import tools_ops_requests as _tools_ops_requests  # noqa: E402, F401
from app.services.mcp import tools_ops_actions as _tools_ops_actions  # noqa: E402, F401
