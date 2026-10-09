"""Catalog-scoped component research requests. Runtime credentials stay internal."""
from __future__ import annotations

import asyncio
import json
from typing import Any, Literal
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.security import AuthenticatedUser, require_catalog_reader, require_catalog_writer
from app.services.catalog import component_agent
from app.services.catalog.component_candidates import checked_candidates
from app.services.catalog_job_service import catalog_jobs
from app.services.component_catalog_service import catalog_service

router = APIRouter(prefix="/api/catalog", tags=["component-agent"])


class ComponentAgentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    manufacturer: str = Field(min_length=1, max_length=200)
    mpn: str = Field(min_length=1, max_length=200)
    component_id: str = Field(default="", max_length=100)
    expected_revision_id: str = Field(default="", max_length=100)
    source_urls: list[str] = Field(default_factory=list, max_length=12)
    thinking: bool = False
    instructions: str = Field(default="", max_length=4000)

    @field_validator("manufacturer", "mpn")
    @classmethod
    def identity_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Exact component identity is required")
        return value.strip()

    @field_validator("source_urls")
    @classmethod
    def public_urls(cls, values: list[str]) -> list[str]:
        for value in values:
            url = urlparse(value)
            if len(value) > 2048 or url.scheme != "https" or not url.hostname or url.username or url.password or url.port not in {None, 443}:
                raise ValueError("Sources must be public HTTPS document URLs")
        return values


@router.get("/agent-config")
def agent_config(user: AuthenticatedUser = Depends(require_catalog_reader)):
    return {"enabled": component_agent.enabled()}


@router.post("/agent-tasks", status_code=202)
def create_agent_task(payload: ComponentAgentRequest, user: AuthenticatedUser = Depends(require_catalog_writer)):
    if not component_agent.enabled():
        raise HTTPException(503, "Component agent is not configured")
    if payload.component_id:
        component = catalog_service.get_component(payload.component_id)
        if not component:
            raise HTTPException(404, "Component not found")
        if component["current_revision_id"] != payload.expected_revision_id:
            raise HTTPException(409, "Component changed; refresh before starting research")
        if component["manufacturer"] != payload.manufacturer or component["mpn"] != payload.mpn:
            raise HTTPException(409, "Requested identity must match the component revision")
    elif payload.expected_revision_id:
        raise HTTPException(400, "Revision requires a component")
    job = catalog_jobs.enqueue(component_agent.JOB_KIND, payload.model_dump(), created_by=user.email, max_attempts=1)
    return {"job_id": job["id"], "status": job["status"]}


def agent_job(task_id: str) -> dict:
    job = catalog_jobs.get(task_id, component_agent.JOB_KIND)
    if not job:
        raise HTTPException(404, "Component agent task not found")
    return job


@router.get("/agent-tasks/{task_id}")
def get_agent_task(task_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    job = agent_job(task_id)
    return {key: job.get(key) for key in ("id", "status", "message", "progress", "error_code", "error_message", "payload", "result", "created_at", "created_by")}


@router.post("/agent-tasks/{task_id}/cancel", status_code=202)
def cancel_agent_task(task_id: str, user: AuthenticatedUser = Depends(require_catalog_writer)):
    agent_job(task_id)
    return {"status": catalog_jobs.request_cancel(task_id, requested_by=user.email)}


async def agent_activity_events(task_id: str):
    """Stream bounded model snapshots; connection cancellation stops polling."""
    previous = None
    while True:
        job = await asyncio.to_thread(agent_job, task_id)
        result = job.get("result") or {}
        snapshot = json.dumps({"id": task_id, "status": job["status"], "trace": result.get("trace", [])}, separators=(",", ":"))
        if snapshot != previous:
            yield f"event: activity\ndata: {snapshot}\n\n"
            previous = snapshot
        else:
            yield ": keepalive\n\n"
        if job["status"] in {"completed", "failed", "cancelled"}:
            yield "event: end\ndata: {}\n\n"
            return
        await asyncio.sleep(1)


@router.get("/agent-tasks/{task_id}/events")
def stream_agent_activity(task_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    agent_job(task_id)
    return StreamingResponse(agent_activity_events(task_id), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/agent-tasks/{task_id}/candidates/{kind}")
def download_candidate(task_id: str, kind: Literal["symbol", "footprint"], user: AuthenticatedUser = Depends(require_catalog_reader)):
    job = agent_job(task_id)
    candidate = (job.get("result", {}).get("candidates", {}).get("files", {}).get(kind)) if job["status"] == "completed" else None
    if not candidate:
        raise HTTPException(404, "Candidate is not available")
    return Response(candidate["content"], media_type="text/plain", headers={"Content-Disposition": f'attachment; filename="{candidate["filename"]}"'})


class CheckSpecRequest(BaseModel):
    spec: Any
    documents: list[dict] | None = None


@router.post("/agent-internal/check-spec")
def check_agent_spec(payload: CheckSpecRequest, authorization: str = Header(default="")):
    scheme, _, token = authorization.partition(" ")
    if scheme != "Bearer" or not component_agent.internal_authorized(token):
        raise HTTPException(401, "Internal agent authentication required")
    # Pure validation/generation. This endpoint cannot read or mutate catalog data.
    return checked_candidates(payload.spec, documents=payload.documents)


class AttachCandidateRequest(BaseModel):
    expected_revision_id: str = Field(min_length=1, max_length=100)


@router.post("/agent-tasks/{task_id}/attach/{kind}")
def attach_candidate(task_id: str, kind: Literal["symbol", "footprint"], payload: AttachCandidateRequest,
                     user: AuthenticatedUser = Depends(require_catalog_writer)):
    from app.api.catalog_errors import raise_catalog_value_error
    job = agent_job(task_id)
    result = job.get("result", {})
    component_id = job.get("payload", {}).get("component_id")
    candidate = result.get("candidates", {}).get("files", {}).get(kind)
    if job["status"] != "completed" or not component_id or not candidate:
        raise HTTPException(400, "Completed component-bound candidate required")
    component = catalog_service.get_component(component_id)
    if not component:
        raise HTTPException(404, "Component not found")
    requested = job["payload"]
    if component["mpn"] != requested["mpn"] or component["manufacturer"] != requested["manufacturer"]:
        raise HTTPException(409, "Component identity changed; start a new research task")
    # Revalidate stored proposal and fetched-source evidence at the mutation boundary.
    checked = checked_candidates(result.get("spec"), identity={k: requested[k] for k in ("manufacturer", "mpn")}, documents=result.get("documents", []))
    candidate = checked.get("files", {}).get(kind)
    if not candidate:
        raise HTTPException(400, "Candidate no longer passes spec checks")
    args = {"upload_name": candidate["filename"], "payload": candidate["content"].encode(), "target_library": "PrismAgentCandidates",
            "actor": user.email, "expected_revision_id": payload.expected_revision_id}
    try:
        if kind == "symbol":
            response = catalog_service.import_symbol_library(component_id, selected_symbol=candidate["filename"][:-10], **args)
        else:
            response = catalog_service.import_footprint(component_id, selected_footprint=candidate["filename"][:-10], **args)
        return response
    except ValueError as error:
        raise_catalog_value_error(error)
