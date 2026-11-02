"""The v5.2 design, release and catalog write tools (ADR scripting-and-mcp §10).

A write tool calls the same typed ``/api/v1`` route the browser calls, under the
same policy action, with the caller's own bearer token. ``sync_project`` and
``start_release_build`` queue Prism jobs and return a handle for ``get_job``;
they change no design themselves. Catalog writes create an unreviewed record the
way the library workspace does.

Two steps are never a tool: approving or publishing a release is a person's
decision (D15), so ``request_release_approval`` hands back the Release Studio
URL instead of calling a route, and catalog QA stays with a person in Prism. A
successful result carries the page a person opens to continue the work, built by
``app.core.links``.
"""

from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.core.links import project_url
from app.services.mcp import invoke
from app.services.mcp.registry import Presenter, Tool, presenter, register, write_annotations

_FULL_SHA = r"^[0-9a-fA-F]{40}$"


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


_PROJECT_ID = {"type": "string", "minLength": 1, "description": "The Prism project id."}
_COMMIT = {
    "type": "string",
    "pattern": _FULL_SHA,
    "description": (
        "The full 40-character commit sha to build. Branches are not resolved "
        "here; call list_revisions to get a sha."
    ),
}
_CHANGE_SUMMARY = {
    "type": "string",
    "minLength": 1,
    "description": "One line describing this change for the component's history.",
}

#: ``CreateManualComponentRequest`` fields a model can fill; the route's
#: defaults cover the rest. ``manufacturer_part_number`` is the route's name for
#: the part identity.
_CATALOG_FIELDS = (
    "value",
    "description",
    "datasheet",
    "manufacturer",
    "manufacturer_part_number",
    "category",
    "package_name",
    "vendor",
    "vendor_part_number",
    "mass_g",
    "rqjc_c_w",
    "rqjc_top_c_w",
    "temp_max_c",
    "temp_min_c",
    "power_dissipation_w",
    "rate",
    "sap_code",
    "change_summary",
    "extra_fields",
)


def _base_url() -> str:
    return settings.PUBLIC_BASE_URL.strip().rstrip("/")


def _project_link(project_id: Any, *, section: str) -> str | None:
    base = _base_url()
    if not base or not isinstance(project_id, str) or not project_id:
        return None
    return project_url(base, project_id, section=section)


def _sync_args(arguments: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    return {"project_id": arguments["project_id"]}, {}


def _release_build_args(
    arguments: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    body: dict[str, Any] = {"commit_sha": arguments["commit"]}
    for key in ("config_key", "variant", "board", "schematic", "bom_preset"):
        if arguments.get(key) is not None:
            body[key] = arguments[key]
    return {"project_id": arguments["project_id"]}, {}, body


def _catalog_draft_args(
    arguments: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    return {}, {}, {key: arguments[key] for key in _CATALOG_FIELDS if key in arguments}


def _import_drafts_args(
    arguments: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    return {"session_id": arguments["session_id"]}, {}, {"drafts": arguments["drafts"]}


async def _approval_handoff(
    app: Any, arguments: dict[str, Any], authorization: str, request: Any
) -> dict[str, Any]:
    """Stop before any route: approval happens at this URL, by a person (D15)."""

    url = project_url(_base_url(), str(arguments["project_id"]), section="release-studio")
    invoke.handoff(url, "Approving a release needs a person in Prism.")


register(
    Tool(
        name="sync_project",
        title="Sync a project",
        description=(
            "Queue a sync of this project with its remote and return the job id. "
            "It starts a Prism job and changes no design itself; poll get_job with "
            "the returned job id until it completes."
        ),
        input_schema=_object({"project_id": _PROJECT_ID}, ("project_id",)),
        route=("post", "/api/v1/projects/{project_id}/sync"),
        args=_sync_args,
        annotations=write_annotations(idempotent=True),
        action="design",
    )
)

register(
    Tool(
        name="start_release_build",
        title="Start a release build",
        description=(
            "Queue a Release Studio candidate build for one commit. It builds a "
            "candidate; it never approves or publishes a release. Poll get_job with "
            "the returned job id until the build finishes."
        ),
        input_schema=_object(
            {
                "project_id": _PROJECT_ID,
                "commit": _COMMIT,
                "config_key": {
                    "type": "string",
                    "description": "The Release Studio configuration key (default release).",
                },
                "variant": {"type": "string", "description": "The design variant to build."},
                "board": {"type": "string", "description": "The board file to build."},
                "schematic": {"type": "string", "description": "The root schematic file."},
                "bom_preset": {"type": "string", "description": "The BOM preset to apply."},
            },
            ("project_id", "commit"),
        ),
        route=("post", "/api/v1/projects/{project_id}/release-studio/candidates"),
        args=_release_build_args,
        annotations=write_annotations(idempotent=True),
        action="design",
    )
)

register(
    Tool(
        name="request_release_approval",
        title="Request release approval",
        description=(
            "Open the project's Release Studio page and hand the step to a person. "
            "Approving or publishing a release is not something a tool may do; this "
            "tool never calls a route."
        ),
        input_schema=_object({"project_id": _PROJECT_ID}, ("project_id",)),
        # No route runs; the declaration only names the page the person opens.
        route=("post", "/api/v1/projects/{project_id}/release-studio/candidates"),
        args=lambda arguments: ({"project_id": arguments["project_id"]}, {}),
        execute=_approval_handoff,
        annotations=write_annotations(),
        output_schema=_object({}),
        action="design",
    )
)

register(
    Tool(
        name="create_catalog_draft",
        title="Create a catalog draft",
        description=(
            "Create an unreviewed catalog component draft. It starts in the open "
            "workflow stage; catalog review and release stay a person's decision in "
            "Prism's library workspace."
        ),
        input_schema=_object(
            {
                "value": {"type": "string", "minLength": 1, "description": "The component value."},
                "description": {"type": "string", "minLength": 1},
                "datasheet": {"type": "string", "description": "The datasheet URL."},
                "manufacturer": {"type": "string", "minLength": 1},
                "manufacturer_part_number": {"type": "string", "minLength": 1},
                "category": {"type": "string"},
                "package_name": {"type": "string"},
                "vendor": {"type": "string"},
                "vendor_part_number": {"type": "string"},
                "mass_g": {"type": "string"},
                "rqjc_c_w": {"type": "string"},
                "rqjc_top_c_w": {"type": "string"},
                "temp_max_c": {"type": "string"},
                "temp_min_c": {"type": "string"},
                "power_dissipation_w": {"type": "string"},
                "rate": {"type": "string"},
                "sap_code": {"type": "string"},
                "change_summary": _CHANGE_SUMMARY,
                "extra_fields": {
                    "type": "object",
                    "additionalProperties": {"type": "string"},
                    "description": "Custom metadata field values, keyed by field key (see list_catalog_fields).",
                },
            },
            (
                "value",
                "description",
                "datasheet",
                "manufacturer",
                "manufacturer_part_number",
                "change_summary",
            ),
        ),
        route=("post", "/api/v1/catalog/components"),
        args=_catalog_draft_args,
        annotations=write_annotations(),
        action="catalog_write",
    )
)

register(
    Tool(
        name="update_import_proposal",
        title="Save import proposal drafts",
        description=(
            "Save in-progress remediation for an import session's proposals, so a "
            "long import survives a reload. It does not accept or reject proposals, "
            "bulk-accept them, or release anything; those stay a person's action in "
            "Prism's library workspace. drafts maps each proposal id to its draft "
            "(metadata_overrides, asset_selections and asset_links)."
        ),
        input_schema=_object(
            {
                "session_id": {
                    "type": "string",
                    "minLength": 1,
                    "description": "The catalog import session id.",
                },
                "drafts": {
                    "type": "object",
                    "additionalProperties": {
                        "type": "object",
                        "additionalProperties": True,
                    },
                    "description": "Proposal id to its draft object.",
                },
            },
            ("session_id", "drafts"),
        ),
        route=("put", "/api/v1/catalog/import-sessions/{session_id}/proposals/drafts"),
        args=_import_drafts_args,
        annotations=write_annotations(),
        action="catalog_write",
    )
)


def _link_to(section: str) -> Presenter:
    """A presenter adding the project page, in ``section``, a person opens next."""

    def present(arguments: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
        structured = result.get("structuredContent")
        if result.get("isError") or not isinstance(structured, dict):
            return result
        link = _project_link(arguments.get("project_id"), section=section)
        if link:
            structured["link"] = link
        return result

    return present


presenter("sync_project")(_link_to("history"))
presenter("start_release_build")(_link_to("release-studio"))


__all__: list[str] = []
