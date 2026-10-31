"""Supply check on a project's BOM before release, and the snapshot frozen at publish.

Everyone who can read supply data may look. Projects follow the caller's role: a project the caller
cannot open is not found. The check reads existing semantic indexes and calls no distributor.
"""

from __future__ import annotations

from functools import partial
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.services.supply import clock
from app.api import supply_connectors
from app.api._helpers import get_project_for_role_or_404
from app.api.supply_call import run_supply
from app.api.supply_models import JobProgress
from app.api.supply_release_models import (
    ProjectPartsPage, ProjectSupply, ReleaseBomKept, ReleaseCheck, ReleaseCompliance, ReleaseSnapshot,
)
from app.core.security import AuthenticatedUser, require_supply_reader, require_supply_tracker
from app.services.supply import (
    catalog_read, compliance_draft, project_parts, project_supply, release_bom, release_check, release_source, usage,
)

from app.services.supply import release_snapshot as snapshot_jobs  # noqa: E402

router = APIRouter(prefix="/api/supply/projects", tags=["supply"])
_run = partial(run_supply, invalid="invalid_request")


def _store():
    # Resolved per call so a replaced connector service (tests) brings its own store.
    return supply_connectors.service.store


@router.get("/{project_id}/supply", response_model=ProjectSupply, response_model_exclude_unset=True)
async def project_overview(
    project_id: str,
    build_quantity: int | None = Query(default=None, ge=1, le=1_000_000),
    variant: str = Query(default="", max_length=120),
    spares: str = Query(default="", max_length=12),
    user: AuthenticatedUser = Depends(require_supply_reader),
) -> dict[str, Any]:
    """The project's parts, planned builds, releases (with what changed since) and line notes, from its stored BOM. Calls no distributor.
    ``spares`` is "auto" (by package) or a percent."""

    get_project_for_role_or_404(project_id, user.role)
    try:
        attrition = project_supply.attrition_of(spares)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return project_supply.overview(conn, project_id, variant, build_quantity, attrition)

    return await _run(read)


@router.get("/{project_id}/parts", response_model=ProjectPartsPage, response_model_exclude_unset=True)
async def project_parts_page(
    project_id: str,
    build_quantity: int | None = Query(default=None, ge=1, le=1_000_000),
    variant: str = Query(default="", max_length=120),
    spares: str = Query(default="", max_length=12),
    chip: str = Query(default="", max_length=20),
    q: str = Query(default="", max_length=200),
    only: str = Query(default="", max_length=60),
    vendor: str = Query(default="", max_length=80),
    sort: str = Query(default="", max_length=40),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=200),
    user: AuthenticatedUser = Depends(require_supply_reader),
) -> dict[str, Any]:
    """One page of the project's parts with their BOM lines for the build, the "needs a look" chips counted over the whole project
    (``chip`` keeps one), and the lines no part matches. ``q`` that is a board reference finds the lines that carry it."""

    get_project_for_role_or_404(project_id, user.role)
    try:
        attrition = project_supply.attrition_of(spares)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return project_parts.page(
                conn, project_id, variant=variant, build_quantity=build_quantity, attrition_percent=attrition, chip=chip, query=q,
                only=only, vendor=vendor, sort=sort, offset=offset, limit=limit, role=user.role,
            )

    return await _run(read)


@router.get(
    "/{project_id}/costing.zip",
    response_class=Response,
    responses={200: {"description": "The costing, trade classification and compliance files as one zip.", "content": {"application/zip": {}}}},
)
async def costing_zip(
    project_id: str,
    variant: str = Query(default="", max_length=120),
    build_quantity: int = Query(default=1, ge=1, le=1_000_000),
    user: AuthenticatedUser = Depends(require_supply_reader),
) -> Response:
    """The costing as a zip: the whole costing, the costing by distributor, the draft RoHS and REACH declaration and the trade classification."""

    project = get_project_for_role_or_404(project_id, user.role)

    def read() -> bytes | None:
        with _store().connection() as conn:
            return project_supply.costing_zip(conn, project_id, variant, build_quantity)

    content = await _run(read)
    if content is None:
        raise HTTPException(status_code=404, detail="This project's BOM has not been read yet")
    name = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in (project.name or project_id))[:60]
    return Response(content=content, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{name}-costing-{build_quantity}.zip"'})


def _build_of_project(project_id: str, build_id: str) -> None:
    """The build must belong to the project the caller can open."""

    from app.services import release_studio_service as store

    build = store.get_build(build_id)
    if build is None or str(build.get("project_id") or "") != project_id:
        raise HTTPException(status_code=404, detail="Build not found")


@router.get("/{project_id}/release-builds/{build_id}/check", response_model=ReleaseCheck)
async def release_check_for(
    project_id: str, build_id: str, user: AuthenticatedUser = Depends(require_supply_reader),
) -> dict[str, Any]:
    """The supply check of the BOM a release build exported: the run's variant and BOM preset, exactly what ships."""

    get_project_for_role_or_404(project_id, user.role)
    _build_of_project(project_id, build_id)

    def read() -> dict[str, Any]:
        try:
            read_bom = release_bom.lines_from_csv(release_source.build_bom_text(build_id), catalog_read.identities)
        except (release_source.NoBuildBom, release_bom.BomReadError) as exc:
            return {"available": False, "reason": str(exc)}
        with _store().connection() as conn:
            return {"available": True, **release_check.check(conn, read_bom.lines, without_number=read_bom.without_number)}

    return await _run(read)


@router.post("/{project_id}/release-builds/{build_id}/read-bom", response_model=ReleaseBomKept)
async def read_release_bom(
    project_id: str, build_id: str, user: AuthenticatedUser = Depends(require_supply_tracker),
) -> dict[str, Any]:
    """Keep the release's BOM lines as the project's usage, for a project Prism has never read. No distributor is asked and
    nothing is tracked: tracking is a separate decision, made on the project's Supply tab."""

    project = get_project_for_role_or_404(project_id, user.role)
    _build_of_project(project_id, build_id)

    def run() -> dict[str, Any]:

        try:
            read_bom = release_bom.lines_from_csv(release_source.build_bom_text(build_id), catalog_read.identities)
        except (release_source.NoBuildBom, release_bom.BomReadError) as exc:
            raise ValueError(str(exc)) from exc
        with _store().connection() as conn:
            stored = usage.store_project(
                conn, project_id, project.name or project_id, f"release:{build_id}|u{usage.USAGE_VERSION}", read_bom.lines,
                clock.now(),
            )
        return {"stored": stored, "parts": len(read_bom.lines), "without_number": read_bom.without_number}

    return await _run(run)


@router.get(
    "/{project_id}/releases/{build_id}/compliance",
    response_model=ReleaseCompliance,
    responses={200: {"content": {"text/csv": {}}, "description": "The draft as JSON, or as CSV with format=csv."}},
)
async def release_compliance(
    project_id: str,
    build_id: str,
    format: str = Query(default="json", pattern="^(json|csv)$"),
    user: AuthenticatedUser = Depends(require_supply_reader),
) -> Any:
    """The draft RoHS and REACH declaration as it stood when the release was published. A working document, not a declaration."""

    get_project_for_role_or_404(project_id, user.role)

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return release_check.get_snapshot(conn, project_id, build_id)

    snapshot = await _run(read)
    if snapshot["compliance"] is None:
        raise HTTPException(status_code=404, detail="This release was published before drafts were kept")
    if format == "csv":
        name = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in snapshot["tag"])[:60] or "release"
        return Response(
            content=compliance_draft.to_csv(snapshot["compliance"]),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{name}-compliance-draft.csv"'},
        )
    return {"tag": snapshot["tag"], "created_at": snapshot["created_at"], "draft": snapshot["compliance"]}


@router.get("/{project_id}/releases/{build_id}/supply", response_model=ReleaseSnapshot)
async def release_snapshot(
    project_id: str, build_id: str, user: AuthenticatedUser = Depends(require_supply_reader)
) -> dict[str, Any]:
    get_project_for_role_or_404(project_id, user.role)

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return release_check.get_snapshot(conn, project_id, build_id)

    return await _run(read)


@router.get("/{project_id}/releases/{build_id}/supply-status", response_model=JobProgress)
async def release_snapshot_status(
    project_id: str, build_id: str, user: AuthenticatedUser = Depends(require_supply_reader)
) -> dict[str, Any]:
    """Whether the release has its supply snapshot (``taken``), is waiting for it (``queued``), or could not have one."""

    get_project_for_role_or_404(project_id, user.role)

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return snapshot_jobs.status_of(conn, project_id, build_id)

    return await _run(read)
