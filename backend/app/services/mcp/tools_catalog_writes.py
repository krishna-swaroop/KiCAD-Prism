"""Catalog writes for component authoring (ADR scripting-and-mcp §12).

These take a component from Open to QA Review the way a librarian does in the
Library Manager: fill its metadata, attach a symbol, footprint and 3D model,
run validation, and send it for review. How the files were made is the agent's
business; Prism stores them through the same imports its upload buttons use.

Every edit to an existing component is guarded: a tool given ``revision_id``
sends it as ``If-Match``, and a component someone changed since the agent read
it answers 412 instead of being overwritten. Without ``revision_id`` the tool
reads the current revision first.

Attaching a corrected symbol or footprint adds a representation beside the old
one; ``update_catalog_representation`` and ``remove_catalog_representation``
replace and clear the superseded pair, detaching assets nothing else uses.

Approval stays a person's decision (D15): ``move_catalog_component`` stops at
QA Review, the route refuses an MCP client a sign-off whatever it asks for, and
``request_catalog_approval`` only hands back the page where a reviewer acts.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any
from urllib.parse import quote

from app.core.config import settings
from app.core.links import catalog_component_url
from app.services.mcp import invoke
from app.services.mcp.registry import RouteRequest, Tool, register, write_annotations
from app.services.mcp.tools_catalog_reads import (
    ASSET_TYPES,
    CONTENT,
    FILE_NAME,
    UPLOAD_ID,
    draft_source,
)

# Stages an agent may move a component to. Approval (done) and publishing
# (released) are a reviewer's; the route refuses them to an MCP client too.
AGENT_STAGES = ("in_progress", "qa_review")
VALIDATION_POLL_SECONDS = 1.0
VALIDATION_TIMEOUT_SECONDS = 90.0
_APPROVAL_MESSAGE = "Approving a catalog component needs a QA reviewer in Prism."

_COMPONENT_ID = {"type": "string", "minLength": 1, "description": "The catalog component id."}
_REVISION_ID = {
    "type": "string",
    "minLength": 1,
    "description": (
        "The component's current_revision_id as you last read it. The write is "
        "refused if the component changed since; omitted, the latest revision is used."
    ),
}
_COUNTERPART = {
    "type": "string",
    "description": "The symbol or footprint asset id this one pairs with, so they form one representation.",
}
_CHANGE_SUMMARY = {
    "type": "string",
    "minLength": 1,
    "description": "One line describing this change for the component's history.",
}
_TEXT = {"type": "string"}

#: ``update_catalog_component``'s argument names are ``create_catalog_draft``'s;
#: the route spells two of them differently.
_ROUTE_FIELD = {"datasheet": "datasheet_url", "manufacturer_part_number": "mpn"}
_METADATA_FIELDS = (
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
)


def _object(properties: dict[str, Any], required: tuple[str, ...] = ()) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": list(required),
        "additionalProperties": False,
    }


def _component_path(component_id: str, suffix: str = "") -> str:
    return f"/api/v1/catalog/components/{quote(component_id, safe='')}{suffix}"


def _link(component_id: str) -> str | None:
    base = settings.PUBLIC_BASE_URL.strip()
    return catalog_component_url(base, component_id) if base else None


def _decode(raw: bytes) -> Any:
    try:
        return json.loads(raw.decode("utf-8")) if raw else None
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None


def _success(payload: Any, component_id: str, note: str = "") -> dict[str, Any]:
    structured = payload if isinstance(payload, dict) else {"value": payload}
    link = _link(component_id)
    if link:
        structured["link"] = link
    text = invoke.text_block(structured)
    return {
        "content": [{"type": "text", "text": f"{note}\n{text}" if note else text}],
        "structuredContent": structured,
        "isError": False,
        "_meta": dict(invoke.UNTRUSTED_META),
    }


async def _if_match(
    app: Any, arguments: dict[str, Any], authorization: str, request: RouteRequest
) -> tuple[str | None, dict[str, Any] | None]:
    """The ``If-Match`` for this component, reading it when no revision was given."""

    component_id = str(arguments["component_id"])
    revision_id = arguments.get("revision_id")
    if not revision_id:
        status, raw = await request(app, "get", _component_path(component_id), "", authorization, None)
        if not 200 <= status < 300:
            return None, invoke.route_error(status, raw)
        revision_id = (_decode(raw) or {}).get("current_revision_id")
    if not revision_id:
        return None, invoke.error_result("invalid-response", "The component has no current revision")
    return f'"component:{component_id}:{revision_id}"', None


async def _guarded(
    app: Any,
    arguments: dict[str, Any],
    authorization: str,
    request: RouteRequest,
    method: str,
    suffix: str,
    body: dict[str, Any] | None,
    note: str = "",
) -> dict[str, Any]:
    component_id = str(arguments["component_id"])
    if_match, failed = await _if_match(app, arguments, authorization, request)
    if failed is not None:
        return failed
    status, raw = await request(
        app, method, _component_path(component_id, suffix), "", authorization, body, if_match=if_match
    )
    if not 200 <= status < 300:
        return invoke.route_error(status, raw)
    return _success(_decode(raw), component_id, note)


async def _update_component(
    app: Any, arguments: dict[str, Any], authorization: str, request: RouteRequest
) -> dict[str, Any]:
    body: dict[str, Any] = {
        _ROUTE_FIELD.get(key, key): arguments[key] for key in _METADATA_FIELDS if key in arguments
    }
    if arguments.get("extra_fields"):
        body["extra_fields"] = arguments["extra_fields"]
    body["change_summary"] = arguments["change_summary"]
    return await _guarded(app, arguments, authorization, request, "patch", "", body)


async def _attach_asset(
    app: Any, arguments: dict[str, Any], authorization: str, request: RouteRequest
) -> dict[str, Any]:
    asset_type = str(arguments["asset_type"])
    body = {
        **draft_source(arguments),
        **{key: arguments[key] for key in ("name", "counterpart_asset_id") if arguments.get(key)},
    }
    return await _guarded(
        app, arguments, authorization, request, "post", f"/assets/{asset_type}/attach", body
    )


async def _reuse_asset(
    app: Any, arguments: dict[str, Any], authorization: str, request: RouteRequest
) -> dict[str, Any]:
    asset_type = str(arguments["asset_type"])
    body = {key: arguments[key] for key in ("asset_id", "counterpart_asset_id") if arguments.get(key)}
    return await _guarded(app, arguments, authorization, request, "post", f"/assets/{asset_type}/reuse", body)


async def _validate_component(
    app: Any, arguments: dict[str, Any], authorization: str, request: RouteRequest
) -> dict[str, Any]:
    """Queue KLC validation, wait for it, and return the component's findings."""

    component_id = str(arguments["component_id"])
    status, raw = await request(
        app, "post", _component_path(component_id, "/validate"), "", authorization, {}
    )
    if not 200 <= status < 300:
        return invoke.route_error(status, raw)
    job_id = str((_decode(raw) or {}).get("job_id") or "")
    if not job_id:
        return invoke.error_result("invalid-response", "Prism answered without a validation job id")
    deadline = time.monotonic() + VALIDATION_TIMEOUT_SECONDS
    while True:
        status, raw = await request(
            app, "get", f"/api/v1/catalog/validation/jobs/{quote(job_id, safe='')}", "", authorization, None
        )
        if not 200 <= status < 300:
            return invoke.route_error(status, raw)
        state = str((_decode(raw) or {}).get("status") or "")
        if state in {"completed", "failed", "cancelled"}:
            break
        if time.monotonic() >= deadline:
            return _success(
                {"job_id": job_id, "status": state or "running"},
                component_id,
                "Validation is still running; call get_job with this job_id, then this tool again.",
            )
        await asyncio.sleep(VALIDATION_POLL_SECONDS)
    if state != "completed":
        return invoke.route_error(
            422,
            json.dumps({"detail": f"Validation ended {state}.", "code": "validation-failed", "job_id": job_id}).encode(),
        )
    status, raw = await request(
        app, "get", _component_path(component_id, "/validation"), "", authorization, None
    )
    if not 200 <= status < 300:
        return invoke.route_error(status, raw)
    return _success(_decode(raw), component_id)


async def _update_representation(
    app: Any, arguments: dict[str, Any], authorization: str, request: RouteRequest
) -> dict[str, Any]:
    body = {
        key: arguments[key]
        for key in ("symbol_asset_id", "footprint_asset_id", "is_default", "label")
        if key in arguments
    }
    body["change_summary"] = arguments.get("change_summary") or "Update component representation"
    suffix = f"/representations/{quote(str(arguments['representation_id']), safe='')}"
    return await _guarded(app, arguments, authorization, request, "patch", suffix, body)


def _representation_assets(representation: dict[str, Any]) -> set[str]:
    return {
        str(asset["id"])
        for asset in (representation.get("symbol"), representation.get("footprint"))
        if isinstance(asset, dict) and asset.get("id")
    }


async def _remove_representation(
    app: Any, arguments: dict[str, Any], authorization: str, request: RouteRequest
) -> dict[str, Any]:
    """Delete the representation, then detach its assets no other representation uses."""

    component_id = str(arguments["component_id"])
    representation_id = str(arguments["representation_id"])
    status, raw = await request(app, "get", _component_path(component_id), "", authorization, None)
    if not 200 <= status < 300:
        return invoke.route_error(status, raw)
    component = _decode(raw) or {}
    representations = component.get("representations") or []
    removed = next((item for item in representations if str(item.get("id")) == representation_id), None)
    if removed is None:
        return invoke.error_result("not-found", "The component has no representation with that id")
    revision_id = arguments.get("revision_id") or component.get("current_revision_id")
    if_match = f'"component:{component_id}:{revision_id}"'
    status, raw = await request(
        app,
        "delete",
        _component_path(component_id, f"/representations/{quote(representation_id, safe='')}"),
        "",
        authorization,
        None,
        if_match=if_match,
    )
    if not 200 <= status < 300:
        return invoke.route_error(status, raw)
    component = _decode(raw) or {}
    detached: list[str] = []
    if not arguments.get("keep_assets"):
        still_used = set().union(
            *(_representation_assets(item) for item in component.get("representations") or [])
        )
        for asset_id in sorted(_representation_assets(removed) - still_used):
            if_match = f'"component:{component_id}:{component.get("current_revision_id")}"'
            status, raw = await request(
                app,
                "delete",
                _component_path(component_id, f"/assets/id/{quote(asset_id, safe='')}"),
                "",
                authorization,
                None,
                if_match=if_match,
            )
            if not 200 <= status < 300:
                return invoke.route_error(status, raw)
            component = (_decode(raw) or {}).get("component") or component
            detached.append(asset_id)
    return _success({"component": component, "detached_asset_ids": detached}, component_id)


async def _move_component(
    app: Any, arguments: dict[str, Any], authorization: str, request: RouteRequest
) -> dict[str, Any]:
    stage = str(arguments["stage"])
    body = {"workflow_stage": stage}
    if arguments.get("note"):
        body["review_note"] = arguments["note"]
    note = (
        "The component is waiting for a QA reviewer, who approves it in Prism at the link below."
        if stage == "qa_review"
        else ""
    )
    return await _guarded(app, arguments, authorization, request, "post", "/release", body, note)


async def _approval_handoff(
    app: Any, arguments: dict[str, Any], authorization: str, request: RouteRequest
) -> dict[str, Any]:
    """Stop before any route: a reviewer approves at this URL (D15)."""

    url = catalog_component_url(settings.PUBLIC_BASE_URL.strip(), str(arguments["component_id"]))
    invoke.handoff(url, _APPROVAL_MESSAGE)


register(
    Tool(
        name="update_catalog_component",
        title="Update a catalog component",
        description=(
            "Fill in or correct a catalog component's metadata. Only the fields you give "
            "change; custom fields from list_catalog_fields go in extra_fields by key. Each "
            "call is a new revision with change_summary in its history."
        ),
        input_schema=_object(
            {
                "component_id": _COMPONENT_ID,
                "revision_id": _REVISION_ID,
                **{key: dict(_TEXT) for key in _METADATA_FIELDS},
                "extra_fields": {
                    "type": "object",
                    "additionalProperties": {"type": "string"},
                    "description": "Custom metadata field values, keyed by field key.",
                },
                "change_summary": _CHANGE_SUMMARY,
            },
            ("component_id", "change_summary"),
        ),
        route=("patch", "/api/v1/catalog/components/{component_id}"),
        args=lambda arguments: ({"component_id": arguments["component_id"]}, {}),
        execute=_update_component,
        annotations=write_annotations(idempotent=True),
        action="catalog_write",
    )
)

register(
    Tool(
        name="create_asset_upload",
        title="Open an asset upload",
        description=(
            "Get a one-time URL to send a file Prism cannot take inline, such as a STEP "
            "model. PUT the raw bytes to upload_url within 15 minutes (for example "
            "`curl -T model.step \"<upload_url>\"`); when upload_url is empty, prefix "
            "upload_path with Prism's address. Then pass upload_id to attach_catalog_asset "
            "or check_catalog_asset."
        ),
        input_schema=_object(
            {"file_name": {"type": "string", "minLength": 1, "description": "The file name, with its extension."}},
            ("file_name",),
        ),
        route=("post", "/api/v1/catalog/uploads"),
        args=lambda arguments: ({}, {}, {"file_name": arguments["file_name"]}),
        annotations=write_annotations(),
        action="catalog_write",
    )
)

register(
    Tool(
        name="attach_catalog_asset",
        title="Attach an asset to a component",
        description=(
            "Attach a symbol, footprint, 3D model (STEP) or SPICE model to a catalog "
            "component as a new revision. Give the file as content (text) or as an "
            "upload_id from create_asset_upload. Attach the symbol first, then the "
            "footprint with counterpart_asset_id set to the symbol's asset id. Prism embeds "
            "an attached 3D model in the footprint it serves. Check symbols and footprints "
            "with check_catalog_asset first. Attaching a corrected file adds a new "
            "representation; replace the old one with update_catalog_representation and "
            "remove_catalog_representation."
        ),
        input_schema=_object(
            {
                "component_id": _COMPONENT_ID,
                "asset_type": {"type": "string", "enum": ASSET_TYPES},
                "content": CONTENT,
                "upload_id": UPLOAD_ID,
                "file_name": FILE_NAME,
                "name": {
                    "type": "string",
                    "description": "The symbol or footprint to take when the file holds several.",
                },
                "counterpart_asset_id": _COUNTERPART,
                "revision_id": _REVISION_ID,
            },
            ("component_id", "asset_type"),
        ),
        route=("post", "/api/v1/catalog/components/{component_id}/assets/{asset_type}/attach"),
        args=lambda arguments: (
            {"component_id": arguments["component_id"], "asset_type": arguments["asset_type"]},
            {},
        ),
        execute=_attach_asset,
        annotations=write_annotations(),
        action="catalog_write",
    )
)

register(
    Tool(
        name="reuse_catalog_asset",
        title="Reuse a catalog asset",
        description=(
            "Give a component an asset the catalog already stores, by the id "
            "search_catalog_assets returned. The file is shared, not copied, so a standard "
            "footprint stays one asset however many parts use it."
        ),
        input_schema=_object(
            {
                "component_id": _COMPONENT_ID,
                "asset_type": {"type": "string", "enum": ASSET_TYPES},
                "asset_id": {"type": "string", "minLength": 1, "description": "The asset id to reuse."},
                "counterpart_asset_id": _COUNTERPART,
                "revision_id": _REVISION_ID,
            },
            ("component_id", "asset_type", "asset_id"),
        ),
        route=("post", "/api/v1/catalog/components/{component_id}/assets/{asset_type}/reuse"),
        args=lambda arguments: (
            {"component_id": arguments["component_id"], "asset_type": arguments["asset_type"]},
            {},
        ),
        execute=_reuse_asset,
        annotations=write_annotations(idempotent=True),
        action="catalog_write",
    )
)

register(
    Tool(
        name="validate_catalog_component",
        title="Validate a catalog component",
        description=(
            "Run KLC validation on a component's current symbol and footprint, wait for it "
            "(up to 90 seconds), and return the summary and each finding. A reviewer sees "
            "the same results."
        ),
        input_schema=_object({"component_id": _COMPONENT_ID}, ("component_id",)),
        route=("post", "/api/v1/catalog/components/{component_id}/validate"),
        args=lambda arguments: ({"component_id": arguments["component_id"]}, {}),
        execute=_validate_component,
        # The component's validation when the job finishes, its job handle while it runs.
        output_schema={"type": "object"},
        annotations=write_annotations(idempotent=True),
        action="catalog_write",
    )
)

register(
    Tool(
        name="update_catalog_representation",
        title="Update a component representation",
        description=(
            "Point one of a component's representations (a symbol and footprint pair) at "
            "other assets, rename it or make it the default. Use it after attaching a "
            "corrected symbol or footprint: set the default representation to the new "
            "asset ids, then remove_catalog_representation the one the attach added."
        ),
        input_schema=_object(
            {
                "component_id": _COMPONENT_ID,
                "representation_id": {"type": "string", "minLength": 1, "description": "From get_catalog_component."},
                "symbol_asset_id": {"type": "string", "minLength": 1},
                "footprint_asset_id": {"type": "string", "minLength": 1},
                "is_default": {"type": "boolean", "description": "true makes this the default representation."},
                "label": {"type": "string", "minLength": 1},
                "change_summary": _CHANGE_SUMMARY,
                "revision_id": _REVISION_ID,
            },
            ("component_id", "representation_id"),
        ),
        route=("patch", "/api/v1/catalog/components/{component_id}/representations/{representation_id}"),
        args=lambda arguments: (
            {"component_id": arguments["component_id"], "representation_id": arguments["representation_id"]},
            {},
        ),
        execute=_update_representation,
        annotations=write_annotations(idempotent=True),
        action="catalog_write",
    )
)

register(
    Tool(
        name="remove_catalog_representation",
        title="Remove a component representation",
        description=(
            "Remove one representation from a component, and detach its symbol and "
            "footprint when no other representation uses them, so superseded files stop "
            "being validated. keep_assets leaves the assets attached. A component keeps "
            "at least its default; the next one becomes default if you remove it."
        ),
        input_schema=_object(
            {
                "component_id": _COMPONENT_ID,
                "representation_id": {"type": "string", "minLength": 1, "description": "From get_catalog_component."},
                "keep_assets": {"type": "boolean", "description": "true keeps the removed pair's assets attached."},
                "revision_id": _REVISION_ID,
            },
            ("component_id", "representation_id"),
        ),
        route=("delete", "/api/v1/catalog/components/{component_id}/representations/{representation_id}"),
        args=lambda arguments: (
            {"component_id": arguments["component_id"], "representation_id": arguments["representation_id"]},
            {},
        ),
        execute=_remove_representation,
        output_schema={
            "type": "object",
            "properties": {
                "component": {"type": "object"},
                "detached_asset_ids": {"type": "array", "items": {"type": "string"}},
                "link": {"type": "string"},
            },
            "required": ["component", "detached_asset_ids"],
        },
        # Not destructive: the component gets a new revision; the old one keeps the pair.
        annotations=write_annotations(),
        action="catalog_write",
    )
)

register(
    Tool(
        name="move_catalog_component",
        title="Move a component's workflow stage",
        description=(
            "Move a component from Open to In progress while you work on it, then to QA "
            "Review when its metadata and assets are complete. Approval and release are a "
            "QA reviewer's decision in Prism; use request_catalog_approval for the link."
        ),
        input_schema=_object(
            {
                "component_id": _COMPONENT_ID,
                "stage": {"type": "string", "enum": list(AGENT_STAGES)},
                "note": {"type": "string", "description": "An optional note for the reviewer."},
                "revision_id": _REVISION_ID,
            },
            ("component_id", "stage"),
        ),
        route=("post", "/api/v1/catalog/components/{component_id}/release"),
        args=lambda arguments: ({"component_id": arguments["component_id"]}, {}),
        execute=_move_component,
        annotations=write_annotations(idempotent=True),
        action="catalog_write",
    )
)

register(
    Tool(
        name="request_catalog_approval",
        title="Request catalog approval",
        description=(
            "Open the component's page in Prism and hand approval to a QA reviewer. "
            "Approving or releasing a component is not something a tool may do; this tool "
            "never calls a route."
        ),
        input_schema=_object({"component_id": _COMPONENT_ID}, ("component_id",)),
        # No route runs; the declaration only names the transition a person makes.
        route=("post", "/api/v1/catalog/components/{component_id}/release"),
        args=lambda arguments: ({"component_id": arguments["component_id"]}, {}),
        execute=_approval_handoff,
        annotations=write_annotations(),
        output_schema=_object({}),
        action="catalog_write",
    )
)


__all__ = ["AGENT_STAGES"]
