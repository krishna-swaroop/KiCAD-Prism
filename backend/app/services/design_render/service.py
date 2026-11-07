"""The ``render_view`` job, request normalisation and the render cache (ADR D9).

A render is identified by the hash of ``(project, resolved commit, normalised
request)``. Repeat calls therefore return the stored PNG without queueing
anything, and a call while the first one is still running returns the same job
id. The PNG and its JSON record live in the derived-asset store
(``derived_assets.render_dir``), not in a checkout.

Rendering itself runs on the worker under a ``render_view`` job: it opens the
revision's bundle, extracts the bundle's sources, computes highlight boxes from
the projections, runs kicad-cli and rasterises the cropped SVG with an overlay
(``plots``). A 3D render is kicad-cli's own PNG and carries no overlay.
"""

from __future__ import annotations

import hashlib
import json
import logging
import shutil
import time
from pathlib import Path
from typing import Any, Iterable, Mapping

from app.services.ops import stats as ops_stats
from app.core.errors import Invalid
from app.services import derived_assets, kicad_tools
from app.services.design_bundle import consumer
from app.services.design_bundle.errors import DesignDataFailed, DesignDataPending
from app.services.design_query import index as design_index
from app.services.design_query import revision as design_revision
from app.services.design_render import geometry, plots
from app.services.job_kinds import JobKind, JobSubject, memory_units, repository_lock
from app.services.job_runtime import (
    JobContext,
    JobResult,
    PermanentJobError,
    RetryableJobError,
)
from app.services.project_viewer_sources_bundle import effective_config
from app.services.workspace_service import workspace

logger = logging.getLogger(__name__)

KIND = "render_view"
PLACEMENTS = "projections/placements.json"
BOARD_OBJECTS = "projections/board-objects.json"
SEMANTIC_INDEX = "projections/semantic-index.json"

VALID_VIEWS = frozenset({"schematic", "pcb", "3d"})
VALID_LAYERS = frozenset({"front", "back", "copper", "all"})
VALID_SIDES = frozenset({"top", "bottom"})
ACTIVE_STATUSES = frozenset({"queued", "running", "retry_wait", "cancel_requested"})
TERMINAL_STATUSES = frozenset({"completed", "failed", "cancelled"})


def _jobs() -> Any:
    """The job service, looked up at call time so tests can install their own."""

    from app.services.job_service import jobs

    return jobs


# --------------------------------------------------------------- requests


def _unique(values: Iterable[Any]) -> list[str]:
    found: list[str] = []
    for value in values:
        text = str(value or "").strip()
        if text and text not in found:
            found.append(text)
    return found


class RenderRequestError(Invalid, ValueError):
    """A render request the caller must fix; its message is written for them."""

    code = "invalid-render"


def normalize_request(request: Mapping[str, Any] | None) -> dict[str, Any]:
    """The request with every default filled and every list deterministic.

    The output, and nothing else, is what the cache key hashes. A region keeps
    six decimals because a caller's float is only meaningful at that scale in
    millimetres (one nanometre); a highlight list is sorted and de-duplicated so
    argument order cannot split one render into two cache entries.
    """

    value = dict(request or {})
    view = str(value.get("view") or "").strip().lower()
    if view not in VALID_VIEWS:
        raise RenderRequestError(f"unknown render view: {value.get('view')!r}")
    layers = str(value.get("layers") or "front").strip().lower()
    if layers not in VALID_LAYERS:
        raise RenderRequestError(f"unknown PCB layer set: {value.get('layers')!r}")
    side = str(value.get("side") or "top").strip().lower()
    if side not in VALID_SIDES:
        raise RenderRequestError(f"unknown 3D side: {value.get('side')!r}")
    try:
        width = int(value.get("width") or 1200)
    except (TypeError, ValueError) as error:
        raise RenderRequestError("width must be an integer") from error
    if not plots.MIN_WIDTH <= width <= plots.MAX_WIDTH:
        raise RenderRequestError(f"width must be between {plots.MIN_WIDTH} and {plots.MAX_WIDTH}")

    # Fields the chosen view ignores are pinned to their defaults, so a caller
    # cannot split the cache with a layer set on a schematic or a camera side
    # on a PCB.
    if view == "schematic":
        layers, side = "front", "top"
    elif view == "pcb":
        side = "top"
    else:
        layers = "front"

    highlight = value.get("highlight") or {}
    if not isinstance(highlight, Mapping):
        raise RenderRequestError("highlight must be an object")
    components = sorted(_unique(highlight.get("components") or []))
    nets = sorted(_unique(highlight.get("nets") or []))

    region = value.get("region")
    normalized_region = None
    if region is not None:
        if not isinstance(region, Mapping):
            raise RenderRequestError("region must be an object")
        try:
            x = round(float(region["x"]), 6)
            y = round(float(region["y"]), 6)
            region_width = round(float(region["width"]), 6)
            region_height = round(float(region["height"]), 6)
        except (KeyError, TypeError, ValueError) as error:
            raise RenderRequestError("region needs numeric x, y, width and height") from error
        box = geometry.Box(x, y, x + region_width, y + region_height)
        if box.width <= 0 or box.height <= 0:
            raise RenderRequestError("region width and height must be positive")
        normalized_region = box.as_region()

    return {
        "view": view,
        "sheet": str(value["sheet"]).strip() if value.get("sheet") not in (None, "") else None,
        "layers": layers,
        "side": side,
        "highlight": {"components": components, "nets": nets},
        "region": normalized_region,
        "width": width,
    }


def render_id(project_id: str, commit: str, request: Mapping[str, Any]) -> str:
    """The stable id of one project's resolved request."""

    identity = {
        "project": project_id,
        "commit": commit,
        "request": normalize_request(request),
    }
    encoded = json.dumps(identity, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _anchor(project: Any) -> str | None:
    return str(getattr(project, "project_file", None) or "").strip() or None


# ----------------------------------------------------------------- cache


def _requested_highlights(request: Mapping[str, Any]) -> list[dict[str, Any]]:
    highlight = request.get("highlight") or {}
    records = [
        {"kind": "component", "key": key, "found": False}
        for key in highlight.get("components") or []
    ]
    records.extend({"kind": "net", "key": key, "found": False} for key in highlight.get("nets") or [])
    return records


def _record(
    project_id: str,
    commit: str,
    request: Mapping[str, Any],
    render_id: str,
    *,
    status: str,
    job_id: str | None = None,
) -> dict[str, Any]:
    now = time.time()
    return {
        "renderId": render_id,
        "status": status,
        "view": request["view"],
        "commit": commit,
        "projectId": project_id,
        "sheet": None,
        "layers": request["layers"],
        "side": request["side"],
        "region": request["region"],
        "width": request["width"],
        "height": None,
        "highlights": _requested_highlights(request),
        "jobId": job_id,
        "createdAt": now,
        "updatedAt": now,
    }


def _write(project: Any, render_id: str, record: dict[str, Any], *, anchor: str | None = None) -> None:
    record["updatedAt"] = time.time()
    derived_assets.write_render_record(
        getattr(project, "path", ""), render_id, record,
        anchor=anchor if anchor is not None else _anchor(project),
    )


def start_render(project: Any, request: Mapping[str, Any], *, requested_by: str = "") -> dict[str, Any]:
    """Start one render, or reuse the stored one; returns the start body."""

    row = workspace.get_project_by_id(str(project.id)) or {}
    anchor = str(row.get("project_file_rel") or "") or None
    commit = design_revision.resolve(project, request.get("revision"))
    normalized = normalize_request(request)
    identity = render_id(str(project.id), commit, normalized)
    existing = derived_assets.find_render(getattr(project, "path", ""), identity, anchor=anchor)
    if existing is not None:
        status = str(existing.get("status") or "")
        png = derived_assets.find_render_png(getattr(project, "path", ""), identity, anchor=anchor)
        if status == "completed" and png is not None:
            ops_stats.incr("render_cache.hit")
            return {"renderId": identity, "status": "completed"}
        job_id = str(existing.get("jobId") or "")
        job = _jobs().get(job_id) if job_id else None
        if job is not None and job.get("status") in ACTIVE_STATUSES:
            return {
                "renderId": identity,
                "jobId": job_id,
                "status": str(job.get("status") or "queued"),
            }

    payload = {
        "project_id": str(project.id),
        "project_file_rel": str(row.get("project_file_rel") or ""),
        "commit": commit,
        "render_id": identity,
        "request": normalized,
        "requested_by": requested_by,
    }
    queued = RENDER_VIEW.enqueue(
        payload,
        subject=JobSubject.of_project(row, str(project.id)),
        artifact_key=identity,
        requested_by=requested_by,
    )
    record = _record(
        str(project.id), commit, normalized, identity,
        status="queued", job_id=str(queued["job_id"]),
    )
    _write(project, identity, record, anchor=anchor)
    ops_stats.incr("render_cache.miss")
    return {"renderId": identity, "jobId": str(queued["job_id"]), "status": "queued"}


def get_render(project: Any, render_id: str) -> dict[str, Any] | None:
    """One render's record, refreshed from its job while it is still running."""

    record = derived_assets.find_render(
        getattr(project, "path", ""), render_id, anchor=_anchor(project)
    )
    if record is None:
        return None
    status = str(record.get("status") or "")
    job_id = str(record.get("jobId") or "")
    # A record that says `failed` can belong to an attempt the job runtime then
    # retried. Until the job itself ends, its row is the authority on the
    # render's state.
    if job_id and (status not in TERMINAL_STATUSES or status == "failed"):
        job = _jobs().get(job_id)
        if job is not None and job.get("status") != status:
            status = str(job.get("status") or status)
            if status in TERMINAL_STATUSES:
                record["status"] = status
                if status != "completed" and not record.get("error"):
                    record["error"] = str(job.get("error_code") or status)
                _write(project, render_id, record)
    png = derived_assets.find_render_png(
        getattr(project, "path", ""), render_id, anchor=_anchor(project)
    )
    result = {
        "renderId": record.get("renderId") or render_id,
        "status": status,
        "view":record.get("view") or "",
        "commit": record.get("commit") or "",
        "sheet": record.get("sheet"),
        "region": record.get("region"),
        "width": int(record.get("width") or 0),
        "height": record.get("height"),
        "highlights": record.get("highlights") or [],
        "pngUrl": (
            f"/api/v1/projects/{project.id}/renders/{render_id}.png"
            if png is not None and record.get("status") == "completed"
            else None
        ),
    }
    return result


def png_path(project: Any, render_id: str) -> Path | None:
    """The stored PNG of a completed render, or ``None``."""

    record = derived_assets.find_render(
        getattr(project, "path", ""), render_id, anchor=_anchor(project)
    )
    if not record or record.get("status") != "completed":
        return None
    return derived_assets.find_render_png(
        getattr(project, "path", ""), render_id, anchor=_anchor(project)
    )


# ------------------------------------------------------------------- job


def _open_bundle(project_id: str, commit: str, view: str, requested_by: str):
    # The three projections are one parse-stage set; asking for all of them
    # keeps ``_member`` from reading a path ``bundle_read`` never answered for.
    paths = [SEMANTIC_INDEX, BOARD_OBJECTS, PLACEMENTS]
    try:
        return consumer.bundle_read("RENDER_VIEW", project_id, commit, paths, requested_by=requested_by)
    except DesignDataPending as error:
        raise RetryableJobError(str(error), code="design-data-pending", retry_after_seconds=30) from error
    except DesignDataFailed as error:
        raise PermanentJobError(str(error), code="design-data-failed") from error


def _member(read: Any, path: str) -> Any:
    return read.json(path) if read.ready(path) else None


def _index_component(index: Mapping[str, Any], reference: str) -> Mapping[str, Any] | None:
    return geometry.index_component(index, reference)


def _first_sheet(
    index: Mapping[str, Any], board_objects: Mapping[str, Any] | None, references: Iterable[str]
) -> tuple[str, str | None]:
    """``(page, document path)`` for the first highlighted component."""

    for reference in references:
        component = _index_component(index, reference)
        if component is None:
            continue
        for sheet_ref in component.get("schematicRefs") or []:
            page = str(sheet_ref.get("page") or "1")
            document = geometry.document_for_symbol(board_objects, str(sheet_ref.get("symbolUuid") or ""))
            return page, str(document.get("path")) if document else None
    return "1", None


def _select_sheet(
    request: Mapping[str, Any],
    index: Mapping[str, Any],
    board_objects: Mapping[str, Any] | None,
    config: Mapping[str, Any],
) -> tuple[str, str | None]:
    """The page to plot and the board-objects document that describes it."""

    root = str(config.get("root_schematic") or "") or None
    root_document = geometry.document_for_path(board_objects, root) if root else None
    sheet = request.get("sheet")
    references = (request.get("highlight") or {}).get("components") or []

    if sheet and str(sheet).isdigit():
        page = str(sheet)
        document = root_document if page == "1" else None
        if document is None:
            for component in index.get("components") or []:
                for sheet_ref in component.get("schematicRefs") or []:
                    if str(sheet_ref.get("page") or "") != page:
                        continue
                    document = geometry.document_for_symbol(
                        board_objects, str(sheet_ref.get("symbolUuid") or "")
                    )
                    if document is not None:
                        break
                if document is not None:
                    break
        return page, str(document.get("path")) if document else root

    if sheet:
        for component in index.get("components") or []:
            for sheet_ref in component.get("schematicRefs") or []:
                if str(sheet_ref.get("sheetInstancePath") or "") == str(sheet):
                    page = str(sheet_ref.get("page") or "1")
                    document = geometry.document_for_symbol(
                        board_objects, str(sheet_ref.get("symbolUuid") or "")
                    )
                    return page, str(document.get("path")) if document else root
        return "1", root

    if references:
        page, document_path = _first_sheet(index, board_objects, references)
        return page, document_path or root
    return "1", root


def _pin_on_page(
    pin: Mapping[str, Any], index: Mapping[str, Any], page: str
) -> bool:
    component = _index_component(index, str(pin.get("reference") or ""))
    if component is None:
        return False
    refs = component.get("schematicRefs") or []
    return any(str(ref.get("page") or "") == page for ref in refs)


def _highlights(
    request: Mapping[str, Any],
    *,
    view: str,
    index: Mapping[str, Any],
    board_objects: Mapping[str, Any] | None,
    placements: Mapping[str, Any] | None,
    document: Mapping[str, Any] | None,
    page: str,
) -> list[geometry.Highlight]:
    highlight = request.get("highlight") or {}
    found: list[geometry.Highlight] = []
    if view == "schematic":
        for reference in highlight.get("components") or []:
            found.append(geometry.component_highlight_schematic(document, reference))
        for net in highlight.get("nets") or []:
            resolved = design_index.net(dict(index), net)
            if resolved is None:
                found.append(geometry.Highlight("net", net, None))
                continue
            pins = [pin for pin in resolved["pins"] if _pin_on_page(pin, index, page)]
            found.append(geometry.net_highlight_schematic(document, pins, net))
        return found
    if view == "pcb":
        for reference in highlight.get("components") or []:
            found.append(geometry.component_highlight(placements, reference))
        for net in highlight.get("nets") or []:
            resolved = design_index.net(dict(index), net)
            if resolved is None:
                found.append(geometry.Highlight("net", net, None))
                continue
            found.append(geometry.net_pcb_highlight(placements, board_objects, resolved["pins"], net))
        return found
    # 3D: report whether the element exists, but there is no box and no overlay.
    for reference in highlight.get("components") or []:
        known = _index_component(index, reference) is not None
        found.append(geometry.Highlight("component", reference, None, known=known))
    for net in highlight.get("nets") or []:
        found.append(geometry.Highlight("net", net, None, known=design_index.net(dict(index), net) is not None))
    return found


def _whole_box(
    view: str,
    *,
    page_box: geometry.Box,
    placements: Mapping[str, Any] | None,
    highlights: Iterable[geometry.Highlight],
) -> geometry.Box:
    if view == "pcb":
        return geometry.board_outline(placements) or page_box
    if view == "3d":
        return geometry.board_outline(placements) or geometry.Box(0.0, 0.0, 16.0, 9.0)
    return page_box


def _render(context: JobContext, row: Mapping[str, Any], payload: Mapping[str, Any]) -> dict[str, Any]:
    project_id = str(payload["project_id"])
    commit = str(payload["commit"])
    request = normalize_request(payload.get("request"))
    requested_by = str(payload.get("requested_by") or "")

    context.progress(stage="render-open", message="Opening the revision's design bundle", percent=5, force=True)
    read = _open_bundle(project_id, commit, request["view"], requested_by)
    config = effective_config(read) or {}
    index = _member(read, SEMANTIC_INDEX) or {}
    board_objects = _member(read, BOARD_OBJECTS)
    placements = _member(read, PLACEMENTS)

    if request["view"] == "schematic":
        source_path = str(config.get("root_schematic") or "")
    else:
        source_path = str(config.get("board") or "")
    if not source_path:
        raise PermanentJobError("the revision has no source for this view", code="render-source-missing")

    page, document_path = _select_sheet(request, index, board_objects, config)
    document = geometry.document_for_path(board_objects, document_path) if document_path else None
    highlights = _highlights(
        request,
        view=request["view"],
        index=index,
        board_objects=board_objects,
        placements=placements,
        document=document,
        page=page,
    )

    context.progress(stage="render-materialize", message="Extracting the revision's sources", percent=20, force=True)
    staging = context.staging_dir / "render"
    sources = read.extract(["sources/"]) / "sources"
    design = staging / "design"
    if design.exists():
        shutil.rmtree(design, ignore_errors=True)
    shutil.copytree(sources, design)
    output = staging / "out"
    output.mkdir(parents=True, exist_ok=True)

    tool = kicad_tools.kicad_cli().with_cancel(context.check_cancelled)
    if not tool.available():
        raise PermanentJobError("kicad-cli is not available", code="kicad-cli-unavailable")

    context.progress(stage="render-plot", message="Plotting with kicad-cli", percent=40, force=True)
    explicit = request.get("region")
    explicit_box = (
        geometry.Box(
            float(explicit["x"]),
            float(explicit["y"]),
            float(explicit["x"]) + float(explicit["width"]),
            float(explicit["y"]) + float(explicit["height"]),
        )
        if explicit
        else None
    )

    if request["view"] == "3d":
        region = explicit_box or _whole_box("3d", page_box=geometry.Box(0, 0, 16, 9), placements=placements, highlights=highlights)
        width, height = plots.output_size(region, request["width"])
        png = plots.render_3d(
            tool, design, source_path, side=request["side"], width=width, height=height,
            output=output / "render.png",
        )
        png, width, height = plots.cap_png(png, width, height)
        return {
            "png": png,
            "region": region.as_region(),
            "width": width,
            "height": height,
            "sheet": None,
            "highlights": highlights,
        }

    if request["view"] == "schematic":
        svg = plots.plot_schematic(tool, design, source_path, page=page, output_dir=output / "sch")
    else:
        svg = plots.plot_pcb(tool, design, source_path, layers=request["layers"], output=output / "pcb.svg")

    page_box = plots.parse_view_box(svg)
    region = explicit_box or geometry.fit_region(
        [item.box for item in highlights if item.box is not None],
        _whole_box(request["view"], page_box=page_box, placements=placements, highlights=highlights),
    )
    width, height = plots.output_size(region, request["width"])
    overlay = [item.box for item in highlights if item.box is not None]
    cropped = plots.crop_svg(svg, region, overlay, output_width=width)
    context.progress(stage="render-rasterize", message="Rasterising the render", percent=80, force=True)
    png = plots.rasterize_svg(cropped, width, height)
    png, width, height = plots.cap_png(png, width, height)
    return {
        "png": png,
        "region": region.as_region(),
        "width": width,
        "height": height,
        "sheet": page if request["view"] == "schematic" else None,
        "highlights": highlights,
    }


def run_render_view_job(context: JobContext) -> JobResult:
    payload = context.payload
    project_id = str(payload["project_id"])
    render_id = str(payload["render_id"])
    row = workspace.get_project_by_id(project_id)
    if not row:
        raise PermanentJobError("Project not found", code="project-not-found")
    if str(row.get("project_file_rel") or "") != str(payload.get("project_file_rel") or ""):
        raise RetryableJobError("Project anchor changed after the render was queued; retry the render")

    request = normalize_request(payload.get("request"))
    record = _record(
        project_id, str(payload["commit"]), request, render_id,
        status="running", job_id=context.job_id,
    )
    existing = derived_assets.find_render(
        str(row.get("path") or ""), render_id, anchor=str(row.get("project_file_rel") or "") or None
    )
    if existing:
        record["createdAt"] = existing.get("createdAt") or record["createdAt"]
    derived_assets.write_render_record(
        str(row.get("path") or ""), render_id, record,
        anchor=str(row.get("project_file_rel") or "") or None,
    )
    try:
        rendered = _render(context, row, payload)
        record.update(
            status="completed",
            view=request["view"],
            commit=str(payload["commit"]),
            sheet=rendered["sheet"],
            region=rendered["region"],
            width=rendered["width"],
            height=rendered["height"],
            highlights=[item.as_record() for item in rendered["highlights"]],
            error=None,
        )
        derived_assets.store_render(
            str(row.get("path") or ""), render_id, rendered["png"], record,
            anchor=str(row.get("project_file_rel") or "") or None,
        )
        derived_assets.prune_renders(
            str(row.get("path") or ""),
            keep=derived_assets.RENDER_BUDGET,
            anchor=str(row.get("project_file_rel") or "") or None,
        )
        return JobResult(
            message="Render ready",
            details={
                "renderId": render_id,
                "view": request["view"],
                "commit": str(payload["commit"]),
                "width": rendered["width"],
                "height": rendered["height"],
            },
        )
    except RetryableJobError:
        # The runtime may schedule another attempt. Writing `failed` here made
        # the record terminal while the job was still retrying; the job row is
        # the authority until it ends.
        raise
    except Exception as error:
        record.update(status="failed", error=str(getattr(error, "code", "") or type(error).__name__))
        derived_assets.write_render_record(
            str(row.get("path") or ""), render_id, record,
            anchor=str(row.get("project_file_rel") or "") or None,
        )
        raise


RENDER_VIEW = JobKind(
    KIND,
    run_render_view_job,
    resources={"prism_worker": 1, **memory_units(1024)},
    lock=repository_lock("read"),
    priority=110,
)
JOB_KINDS = (RENDER_VIEW,)

__all__ = [
    "JOB_KINDS",
    "KIND",
    "RENDER_VIEW",
    "get_render",
    "normalize_request",
    "png_path",
    "render_id",
    "run_render_view_job",
    "start_render",
]
