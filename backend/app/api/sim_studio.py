"""Simulation Studio: the setup API (prism-sim-studio sim-adr-0017).

The TypeSpec in prism-sim-studio (``contracts/contracts/main.tsp``) describes
these routes. Everything 404s unless ``PRISM_SIM_STUDIO_ENABLED`` is set.
Reads, validation and preflight need a viewer; drafting and editing need a
designer. Writes are guarded with ``If-Match: "simsetup:<id>:<revision>"``.
"""

from __future__ import annotations

import asyncio
from typing import Any, Callable, TypeVar

from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse

from app.api._helpers import get_project_for_role_or_404
from app.core import errors, preconditions
from app.core.config import settings
from app.core.security import AuthenticatedUser, require_designer, require_viewer
from app.sim_studio.models import DraftSetupRequest, SubmitSetupRequest
from app.sim_studio import runs
from app.sim_studio.service import sim_studio
from app.sim_studio.store import ETAG_KIND

T = TypeVar("T")


def _require_enabled() -> None:
    if not settings.PRISM_SIM_STUDIO_ENABLED:
        raise HTTPException(status_code=404, detail="Simulation Studio is not enabled")


router = APIRouter(dependencies=[Depends(_require_enabled)])

SETUPS = "/projects/{project_id}/sim/a0/setups"
SETUP = SETUPS + "/{setup_id}"


async def _run(call: Callable[[], T]) -> T:
    return await asyncio.to_thread(call)


def _expected(request: Request, setup_id: str) -> int:
    return int(preconditions.int_version(preconditions.if_match(request, ETAG_KIND, setup_id)))


def _with_etag(record: dict[str, Any], response: Response, status_code: int = 200) -> dict[str, Any]:
    response.headers["ETag"] = record["etag"]
    response.status_code = status_code
    return record


def _project_path(project: Any) -> str:
    return str(getattr(project, "project_file", None) or f"{project.name}.kicad_pro")


@router.get("/sim/a0/catalog")
async def read_catalog(user: AuthenticatedUser = Depends(require_viewer)) -> dict[str, Any]:
    return sim_studio.catalog()


@router.get("/sim/a0/engines")
async def list_engines(user: AuthenticatedUser = Depends(require_viewer)) -> list[dict[str, Any]]:
    return await _run(runs.engine_descriptors)


@router.get(SETUPS)
async def list_setups(project_id: str, user: AuthenticatedUser = Depends(require_viewer)) -> list[dict[str, Any]]:
    get_project_for_role_or_404(project_id, user.role)
    return await _run(lambda: sim_studio.list(project_id))


@router.post(SETUPS, status_code=201)
async def draft_setup(
    project_id: str, body: DraftSetupRequest, response: Response,
    user: AuthenticatedUser = Depends(require_designer),
) -> dict[str, Any]:
    project = get_project_for_role_or_404(project_id, user.role)
    with errors.caller_errors((ValueError, 400), (RuntimeError, 503)):
        record = await _run(lambda: sim_studio.draft(project, _project_path(project), body, user.email))
    return _with_etag(record, response, 201)


@router.get(SETUP)
async def read_setup(
    project_id: str, setup_id: str, response: Response, user: AuthenticatedUser = Depends(require_viewer),
) -> dict[str, Any]:
    get_project_for_role_or_404(project_id, user.role)
    return _with_etag(await _run(lambda: sim_studio.read(project_id, setup_id)), response)


@router.put(SETUP)
async def replace_setup(
    project_id: str, setup_id: str, request: Request, response: Response,
    document: Any = Body(...), user: AuthenticatedUser = Depends(require_designer),
) -> dict[str, Any]:
    get_project_for_role_or_404(project_id, user.role)
    expected = _expected(request, setup_id)
    return _with_etag(await _run(lambda: sim_studio.replace(project_id, setup_id, expected, document)), response)


@router.patch(SETUP)
async def patch_setup(
    project_id: str, setup_id: str, request: Request, response: Response,
    operations: Any = Body(...), user: AuthenticatedUser = Depends(require_designer),
) -> dict[str, Any]:
    """RFC 6902 JSON Patch on the setup document (``application/json-patch+json`` or JSON)."""

    get_project_for_role_or_404(project_id, user.role)
    expected = _expected(request, setup_id)
    return _with_etag(await _run(lambda: sim_studio.patch(project_id, setup_id, expected, operations)), response)


@router.delete(SETUP, status_code=204)
async def delete_setup(
    project_id: str, setup_id: str, request: Request, user: AuthenticatedUser = Depends(require_designer),
) -> Response:
    get_project_for_role_or_404(project_id, user.role)
    expected = _expected(request, setup_id)
    await _run(lambda: sim_studio.delete(project_id, setup_id, expected))
    return Response(status_code=204)


async def _check(project_id: str, setup_id: str, stage: str, user: AuthenticatedUser) -> dict[str, Any]:
    project = get_project_for_role_or_404(project_id, user.role)
    with errors.caller_errors((ValueError, 400), (RuntimeError, 503)):
        return await _run(lambda: sim_studio.check(project, setup_id, stage))


@router.post(SETUP + "/validate")
async def validate_setup(
    project_id: str, setup_id: str, user: AuthenticatedUser = Depends(require_viewer),
) -> dict[str, Any]:
    return await _check(project_id, setup_id, "validate", user)


@router.post(SETUP + "/preflight")
async def preflight_setup(
    project_id: str, setup_id: str, user: AuthenticatedUser = Depends(require_viewer),
) -> dict[str, Any]:
    return await _check(project_id, setup_id, "preflight", user)



@router.post(SETUP + "/submit", status_code=202)
async def submit_setup(
    project_id: str, setup_id: str, body: SubmitSetupRequest, request: Request,
    user: AuthenticatedUser = Depends(require_designer),
) -> dict[str, Any]:
    """Freeze the current revision (If-Match), preflight it, and queue one analysis."""

    project = get_project_for_role_or_404(project_id, user.role)
    expected = _expected(request, setup_id)
    with errors.caller_errors((ValueError, 400), (RuntimeError, 503)):
        return await _run(lambda: sim_studio.submit(project, setup_id, expected, body.analysis_id, user.email))


RUNS = "/projects/{project_id}/sim/a0/runs"
RUN = RUNS + "/{run_id}"


@router.get(RUNS)
async def list_runs(project_id: str, user: AuthenticatedUser = Depends(require_viewer)) -> list[dict[str, Any]]:
    get_project_for_role_or_404(project_id, user.role)
    return await _run(lambda: sim_studio.list_runs(project_id))


@router.get(RUN)
async def read_run(project_id: str, run_id: str, user: AuthenticatedUser = Depends(require_viewer)) -> dict[str, Any]:
    get_project_for_role_or_404(project_id, user.role)
    return await _run(lambda: sim_studio.read_run(project_id, run_id))


@router.get(RUN + "/result")
async def read_result(project_id: str, run_id: str, user: AuthenticatedUser = Depends(require_viewer)) -> dict[str, Any]:
    get_project_for_role_or_404(project_id, user.role)
    row = await _run(lambda: sim_studio.run_row(project_id, run_id))
    if not row.get("result"):
        raise errors.NotFound("The run has no result yet", code="sim_result_pending")
    return row["result"]


@router.get(RUN + "/files/{path:path}")
async def read_result_file(
    project_id: str, run_id: str, path: str, user: AuthenticatedUser = Depends(require_viewer),
) -> FileResponse:
    get_project_for_role_or_404(project_id, user.role)
    row = await _run(lambda: sim_studio.run_row(project_id, run_id))
    return FileResponse(runs.result_file(row, path), media_type="application/json")


@router.get(RUN + "/materialization")
async def read_run_materialization(
    project_id: str, run_id: str, user: AuthenticatedUser = Depends(require_viewer),
) -> Response:
    """The bundle's analytic pack, so overlays index the geometry the engine solved."""

    get_project_for_role_or_404(project_id, user.role)
    row = await _run(lambda: sim_studio.run_row(project_id, run_id))
    data = await _run(lambda: runs.materialization(row))
    return Response(content=data, media_type="application/octet-stream",
                    headers={"Cache-Control": "private, max-age=86400, immutable"})


__all__ = ["router"]
