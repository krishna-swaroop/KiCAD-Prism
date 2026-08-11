"""Design Comparison API."""

from __future__ import annotations

from datetime import datetime, timezone
import asyncio
import json
from pathlib import Path
import tempfile
import threading
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from app.api._helpers import get_project_for_role_or_404
from app.core.security import AuthenticatedUser, require_viewer
from app.services import design_compare_service
from app.services.job_runtime import job_state_root

router = APIRouter(dependencies=[Depends(require_viewer)])

_DEBUG_LOG_PATH = (
    Path(tempfile.gettempdir()) / "kicad-prism-design-comparison-debug.jsonl"
)
_DEBUG_LOG_LOCK = threading.Lock()
_DEBUG_LOG_MAX_BYTES = 8 * 1024 * 1024


class DesignCompareRequest(BaseModel):
    base: str = Field(..., description="Explicit base commit SHA")
    head: str = Field(..., description="Explicit compare commit SHA")
    include_unchanged: bool = Field(
        False,
        description="Include unchanged BOM rows in the comparison result",
    )


class DesignCompareDebugEvent(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=128)
    sequence: int = Field(..., ge=0)
    event: str = Field(..., min_length=1, max_length=160)
    timestamp: str = Field(..., max_length=64)
    payload: dict[str, Any] = Field(default_factory=dict)
    reset: bool = False


@router.post("/{project_id}/design-compare/debug-log")
async def append_design_compare_debug_log(
    project_id: str,
    request: DesignCompareDebugEvent,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """Append one bounded JSONL transition event to the local temp log.

    This endpoint intentionally stores only the structured client payload and
    rotates a single temporary file. It exists to diagnose the combinatorial
    comparison-view transition paths without requiring users to transcribe the
    browser console.
    """

    get_project_for_role_or_404(project_id, user.role)
    record = {
        "serverTimestamp": datetime.now(timezone.utc).isoformat(),
        "projectId": project_id,
        "sessionId": request.session_id,
        "sequence": request.sequence,
        "event": request.event,
        "clientTimestamp": request.timestamp,
        "payload": request.payload,
    }
    encoded = json.dumps(record, separators=(",", ":"), default=str)
    if len(encoded.encode("utf-8")) > 128 * 1024:
        raise HTTPException(status_code=413, detail="Debug event is too large")

    with _DEBUG_LOG_LOCK:
        _DEBUG_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        if request.reset or (
            _DEBUG_LOG_PATH.exists()
            and _DEBUG_LOG_PATH.stat().st_size >= _DEBUG_LOG_MAX_BYTES
        ):
            _DEBUG_LOG_PATH.write_text("", encoding="utf-8")
        with _DEBUG_LOG_PATH.open("a", encoding="utf-8") as handle:
            handle.write(encoded)
            handle.write("\n")

    return {"status": "logged", "path": str(_DEBUG_LOG_PATH)}


@router.post("/{project_id}/design-compare")
async def start_design_compare(
    project_id: str,
    request: DesignCompareRequest,
    user: AuthenticatedUser = Depends(require_viewer),
):
    get_project_for_role_or_404(project_id, user.role)
    try:
        job_id = await asyncio.to_thread(
            design_compare_service.start_design_compare_job,
            project_id,
            request.base,
            request.head,
            include_unchanged=request.include_unchanged,
            requested_by=user.email,
        )
        return {"job_id": job_id}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/{project_id}/design-compare/{job_id}/status")
async def design_compare_status(
    project_id: str, job_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    get_project_for_role_or_404(project_id, user.role)
    status = await asyncio.to_thread(design_compare_service.get_job_status, job_id)
    if not status or status.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Job not found")
    return status


@router.get("/{project_id}/design-compare/{job_id}")
async def design_compare_result(
    project_id: str, job_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    get_project_for_role_or_404(project_id, user.role)
    status = await asyncio.to_thread(design_compare_service.get_job_status, job_id)
    if not status or status.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Job not found")
    if status.get("status") != "completed" and not status.get("result_version"):
        raise HTTPException(status_code=409, detail=f"Job status: {status.get('status')}")
    result = await asyncio.to_thread(design_compare_service.get_job_result, job_id)
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")
    if result.get("schema") == "prism.design_compare_bundle_v1":
        sidecars = {
            name: {
                **metadata,
                "url": (
                    f"/api/projects/{project_id}/design-compare/"
                    f"{job_id}/sidecars/{metadata.get('digest')}"
                ),
            }
            for name, metadata in (result.get("sidecars") or {}).items()
        }
        return JSONResponse(
            {**result, "sidecars": sidecars},
            headers={"Cache-Control": "private, no-cache"},
        )
    return result


@router.get("/{project_id}/design-compare/{job_id}/sidecars/{digest}")
async def design_compare_sidecar(
    project_id: str,
    job_id: str,
    digest: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    get_project_for_role_or_404(project_id, user.role)
    if len(digest) != 64 or any(character not in "0123456789abcdef" for character in digest):
        raise HTTPException(status_code=404, detail="Comparison sidecar not found")
    status = await asyncio.to_thread(design_compare_service.get_job_status, job_id)
    if (
        not status
        or status.get("project_id") != project_id
        or status.get("status") != "completed"
    ):
        raise HTTPException(status_code=404, detail="Comparison sidecar not found")
    artifact = await asyncio.to_thread(
        design_compare_service.get_job_sidecar,
        job_id,
        digest,
    )
    if not artifact:
        raise HTTPException(status_code=404, detail="Comparison sidecar not found")
    root = (job_state_root() / "artifacts" / "objects" / "sha256").resolve()
    path = Path(str(artifact.get("object_path") or "")).resolve()
    try:
        path.relative_to(root)
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Comparison sidecar not found") from error
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Comparison sidecar not found")
    return FileResponse(
        path,
        media_type=str(artifact.get("media_type") or "application/json"),
        headers={
            "ETag": f'"{digest}"',
            "Cache-Control": "private, max-age=31536000, immutable",
        },
    )


@router.delete("/{project_id}/design-compare/{job_id}")
async def delete_design_compare(
    project_id: str, job_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    get_project_for_role_or_404(project_id, user.role)
    status = await asyncio.to_thread(design_compare_service.get_job_status, job_id)
    if not status or status.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Job not found")
    await asyncio.to_thread(design_compare_service.delete_job, job_id)
    return {"status": "cancel_requested" if status.get("status") in {"queued", "running", "retry_wait", "cancel_requested"} else "retained"}
