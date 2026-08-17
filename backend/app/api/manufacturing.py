"""Manufacturing API: board specs, production runs, defects, and manufacturers.

Permission model (from the feature's design):

  * ``require_designer``            create/edit runs and specs, manage manufacturers
  * ``require_project_release_actor`` (designer/QA/admin) mark units good, log and
                                    resolve defects, attach evidence
  * ``require_viewer``              every read

Evidence blobs are stored in the Prism derived-asset store, never in a git checkout,
so the read-only-mirror invariant is untouched.
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.core.security import (
    AuthenticatedUser,
    require_designer,
    require_project_release_actor,
    require_run_status_actor,
    require_viewer,
)
from app.services import (
    board_spec_service,
    derived_assets,
    manufacturing_service as mfg,
    pcb_rules_service,
    spec_config_service,
)
from app.services.workspace_service import workspace

router = APIRouter()


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class ManufacturerRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    contact: str = ""
    website: str = ""
    notes: str = ""


class BoardSpecRequest(BaseModel):
    specs: dict = Field(default_factory=dict)
    source: dict = Field(default_factory=dict)
    active_sections: list[str] | None = None


class SpecConfigRequest(BaseModel):
    spec_config: str = Field(default="", max_length=100_000)


class TemplateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    spec_config: str = Field(default="", max_length=100_000)
    capabilities: dict = Field(default_factory=dict)


class TemplateUpdateRequest(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    spec_config: str | None = Field(default=None, max_length=100_000)
    capabilities: dict | None = None


class ApplyTemplateRequest(BaseModel):
    template_id: str = Field(min_length=1)


class AttachManufacturerRequest(BaseModel):
    manufacturer_id: str = Field(min_length=1)


class ProjectSpecCreateRequest(BaseModel):
    manufacturer_id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=200)
    spec_config: str = Field(default="", max_length=100_000)
    template_id: str | None = None


class ProjectSpecUpdateRequest(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    spec_config: str | None = Field(default=None, max_length=100_000)
    specs: dict | None = None
    source: dict | None = None
    active_sections: list[str] | None = None


class RunRequest(BaseModel):
    project_id: str = Field(min_length=1)
    manufacturer_id: str | None = None
    spec_id: str | None = None
    commit_sha: str = ""
    release_tag: str = ""
    quantity_ordered: int = Field(default=0, ge=0)
    notes: str = ""
    spec_snapshot: dict = Field(default_factory=dict)


class RunUpdateRequest(BaseModel):
    manufacturer_id: str | None = None
    commit_sha: str | None = None
    quantity_ordered: int | None = Field(default=None, ge=0)
    quantity_good: int | None = Field(default=None, ge=0)
    notes: str | None = None


class RunStatusRequest(BaseModel):
    status: str = Field(min_length=1)


class DefectRequest(BaseModel):
    category: str = "other"
    severity: str = "minor"
    quantity_affected: int = Field(default=1, ge=1)
    description: str = ""


class DefectUpdateRequest(BaseModel):
    category: str | None = None
    severity: str | None = None
    quantity_affected: int | None = Field(default=None, ge=1)
    description: str | None = None
    status: str | None = None


def _handle(func, *args, **kwargs):
    """Run a service call, mapping its ValueError into a 400."""
    try:
        return func(*args, **kwargs)
    except mfg.ManufacturingError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


# ---------------------------------------------------------------------------
# Manufacturers
# ---------------------------------------------------------------------------


@router.get("/manufacturers", dependencies=[Depends(require_viewer)])
async def list_manufacturers():
    return await asyncio.to_thread(mfg.list_manufacturers)


@router.post("/manufacturers", dependencies=[Depends(require_designer)])
async def create_manufacturer(request: ManufacturerRequest):
    mfr_id = await asyncio.to_thread(
        _handle, mfg.create_manufacturer,
        request.name, request.contact, request.website, request.notes,
    )
    return {"id": mfr_id}


@router.patch("/manufacturers/{mfr_id}", dependencies=[Depends(require_designer)])
async def update_manufacturer(mfr_id: str, request: ManufacturerRequest):
    updated = await asyncio.to_thread(
        _handle, mfg.update_manufacturer, mfr_id,
        name=request.name, contact=request.contact,
        website=request.website, notes=request.notes,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Manufacturer not found")
    return {"status": "success"}


@router.delete("/manufacturers/{mfr_id}", dependencies=[Depends(require_designer)])
async def delete_manufacturer(mfr_id: str):
    if not await asyncio.to_thread(mfg.delete_manufacturer, mfr_id):
        raise HTTPException(status_code=404, detail="Manufacturer not found")
    return {"status": "success"}


# ---------------------------------------------------------------------------
# Board specs (per project)
# ---------------------------------------------------------------------------


@router.get("/projects/{project_id}/board-spec", dependencies=[Depends(require_viewer)])
async def get_board_spec(project_id: str):
    return await asyncio.to_thread(mfg.get_board_spec, project_id)


@router.put("/projects/{project_id}/board-spec")
async def save_board_spec(
    project_id: str,
    request: BoardSpecRequest,
    user: AuthenticatedUser = Depends(require_designer),
):
    return await asyncio.to_thread(
        _handle, mfg.save_board_spec,
        project_id, request.specs, request.source,
        updated_by=user.email, active_sections=request.active_sections,
    )


@router.get("/projects/{project_id}/spec-sheet.pdf", dependencies=[Depends(require_viewer)])
async def download_spec_sheet(project_id: str):
    """A themed PDF spec sheet of the project's board specifications."""
    from fastapi.responses import Response

    from app.services import spec_sheet_pdf_service

    try:
        pdf = await asyncio.to_thread(spec_sheet_pdf_service.build_spec_sheet, project_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    project = await asyncio.to_thread(workspace.get_project_by_id, project_id)
    name = (project or {}).get("display_name") or (project or {}).get("name") or project_id
    safe = "".join(c for c in str(name) if c.isalnum() or c in " ._-").strip() or "board"
    filename = f"{safe} fab spec.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/projects/{project_id}/board-spec/extract", dependencies=[Depends(require_designer)])
async def extract_board_spec(project_id: str):
    """Suggest specs from the project's .kicad_pcb. Read-only; the caller decides
    whether to save them."""
    project = await asyncio.to_thread(workspace.get_project_by_id, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    pcb_rel = project.get("pcb_rel")
    if not pcb_rel:
        return {"suggested": {}, "reason": "This project has no board file to read."}
    import os

    pcb_path = os.path.join(project.get("path", ""), pcb_rel)
    suggested = await asyncio.to_thread(board_spec_service.extract_board_spec, pcb_path)
    return {"suggested": suggested}


@router.get("/pcb-rule-fields", dependencies=[Depends(require_viewer)])
async def get_pcb_rule_fields():
    """The canonical PCB rule/capability fields, so the UI need not hardcode them."""
    return {"fields": pcb_rules_service.PCB_RULE_FIELDS}


def _project_pcb_path(project_id: str) -> tuple[dict | None, str | None]:
    """Resolve a project and its .kicad_pcb path, or (project, None) when absent."""
    project = workspace.get_project_by_id(project_id)
    if not project:
        return None, None
    pcb_rel = project.get("pcb_rel")
    if not pcb_rel:
        return project, None
    import os

    return project, os.path.join(project.get("path", ""), pcb_rel)


@router.post("/projects/{project_id}/pcb-rules/extract", dependencies=[Depends(require_designer)])
async def extract_pcb_rules(project_id: str):
    """Read the board's fabrication rules from its KiCad files. Read-only."""
    project, pcb_path = await asyncio.to_thread(_project_pcb_path, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not pcb_path:
        return {"rules": {}, "reason": "This project has no board file to read."}
    rules = await asyncio.to_thread(pcb_rules_service.extract_pcb_rules, pcb_path)
    return {"rules": rules}


@router.get("/projects/{project_id}/spec-config", dependencies=[Depends(require_viewer)])
async def get_spec_config(project_id: str):
    """The project's spec schema: the raw .config text plus its parsed form."""
    spec = await asyncio.to_thread(mfg.get_board_spec, project_id)
    config_text = spec.get("spec_config") or ""
    parsed = spec_config_service.parse_spec_config(config_text)
    return {"spec_config": config_text, "parsed": parsed.to_dict()}


@router.put("/projects/{project_id}/spec-config")
async def save_spec_config(
    project_id: str,
    request: SpecConfigRequest,
    user: AuthenticatedUser = Depends(require_designer),
):
    """Save the project's spec schema text. The parsed form is returned so the
    editor can show sections and any errors without a second call."""
    saved = await asyncio.to_thread(
        _handle, mfg.save_spec_config, project_id, request.spec_config, updated_by=user.email
    )
    parsed = spec_config_service.parse_spec_config(saved.get("spec_config") or "")
    return {"spec_config": saved.get("spec_config") or "", "parsed": parsed.to_dict()}


@router.post("/spec-config/preview", dependencies=[Depends(require_designer)])
async def preview_spec_config(request: SpecConfigRequest):
    """Parse spec-config text without saving, for live editor validation."""
    parsed = spec_config_service.parse_spec_config(request.spec_config)
    return parsed.to_dict()


# ---------------------------------------------------------------------------
# Project manufacturers (attachments) and named specs
# ---------------------------------------------------------------------------


@router.get("/projects/{project_id}/manufacturers", dependencies=[Depends(require_viewer)])
async def list_project_manufacturers(project_id: str):
    return await asyncio.to_thread(mfg.list_project_manufacturers, project_id)


@router.post("/projects/{project_id}/manufacturers", dependencies=[Depends(require_designer)])
async def attach_manufacturer(project_id: str, request: AttachManufacturerRequest):
    await asyncio.to_thread(_handle, mfg.attach_manufacturer, project_id, request.manufacturer_id)
    return {"status": "success"}


@router.delete("/projects/{project_id}/manufacturers/{mfr_id}", dependencies=[Depends(require_designer)])
async def detach_manufacturer(project_id: str, mfr_id: str):
    if not await asyncio.to_thread(mfg.detach_manufacturer, project_id, mfr_id):
        raise HTTPException(status_code=404, detail="Manufacturer not attached to this project")
    return {"status": "success"}


@router.get("/projects/{project_id}/specs", dependencies=[Depends(require_viewer)])
async def list_project_specs(project_id: str, manufacturer_id: str | None = None):
    return await asyncio.to_thread(mfg.list_project_specs, project_id, manufacturer_id)


@router.post("/projects/{project_id}/specs")
async def create_project_spec(
    project_id: str,
    request: ProjectSpecCreateRequest,
    user: AuthenticatedUser = Depends(require_designer),
):
    spec_id = await asyncio.to_thread(
        _handle, mfg.create_project_spec, project_id, request.manufacturer_id, request.name,
        template_id=request.template_id, spec_config=request.spec_config, updated_by=user.email,
    )
    return {"id": spec_id}


@router.get("/specs/{spec_id}", dependencies=[Depends(require_viewer)])
async def get_project_spec(spec_id: str):
    spec = await asyncio.to_thread(mfg.get_project_spec, spec_id)
    if not spec:
        raise HTTPException(status_code=404, detail="Spec not found")
    parsed = spec_config_service.parse_spec_config(spec.get("spec_config") or "")
    return {**spec, "parsed": parsed.to_dict()}


@router.patch("/specs/{spec_id}")
async def update_project_spec(
    spec_id: str,
    request: ProjectSpecUpdateRequest,
    user: AuthenticatedUser = Depends(require_designer),
):
    updated = await asyncio.to_thread(
        _handle, mfg.update_project_spec, spec_id,
        updated_by=user.email, **request.model_dump(exclude_none=True),
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Spec not found or nothing to update")
    return {"status": "success"}


@router.delete("/specs/{spec_id}", dependencies=[Depends(require_designer)])
async def delete_project_spec(spec_id: str):
    if not await asyncio.to_thread(mfg.delete_project_spec, spec_id):
        raise HTTPException(status_code=404, detail="Spec not found")
    return {"status": "success"}


@router.post("/specs/{spec_id}/apply-template")
async def apply_template_to_spec(
    spec_id: str,
    request: ApplyTemplateRequest,
    user: AuthenticatedUser = Depends(require_designer),
):
    if not await asyncio.to_thread(
        _handle, mfg.apply_template_to_spec, spec_id, request.template_id, updated_by=user.email
    ):
        raise HTTPException(status_code=404, detail="Spec not found")
    return {"status": "success"}


# ---------------------------------------------------------------------------
# Spec templates (named, manufacturer-scoped)
# ---------------------------------------------------------------------------


@router.get("/templates", dependencies=[Depends(require_viewer)])
async def list_templates(manufacturer_id: str | None = None):
    """Templates for one manufacturer, or all. Names + metadata, not full config."""
    return await asyncio.to_thread(mfg.list_templates, manufacturer_id)


@router.get("/templates/{template_id}", dependencies=[Depends(require_viewer)])
async def get_template(template_id: str):
    """One template, including its full .config text."""
    template = await asyncio.to_thread(mfg.get_template, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.post("/manufacturers/{mfr_id}/templates", dependencies=[Depends(require_designer)])
async def create_template(mfr_id: str, request: TemplateRequest):
    template_id = await asyncio.to_thread(
        _handle, mfg.create_template, mfr_id, request.name, request.spec_config,
        capabilities=request.capabilities,
    )
    return {"id": template_id}


@router.patch("/templates/{template_id}", dependencies=[Depends(require_designer)])
async def update_template(template_id: str, request: TemplateUpdateRequest):
    updated = await asyncio.to_thread(
        _handle, mfg.update_template, template_id, **request.model_dump(exclude_none=True)
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Template not found or nothing to update")
    return {"status": "success"}


@router.delete("/templates/{template_id}", dependencies=[Depends(require_designer)])
async def delete_template(template_id: str):
    if not await asyncio.to_thread(mfg.delete_template, template_id):
        raise HTTPException(status_code=404, detail="Template not found")
    return {"status": "success"}


@router.post("/projects/{project_id}/spec-config/apply-template")
async def apply_template(
    project_id: str,
    request: ApplyTemplateRequest,
    user: AuthenticatedUser = Depends(require_designer),
):
    """Copy a template's .config into the project's own schema (copy-on-apply).

    The project then owns the copy and can edit it freely; later edits to the
    template do not touch projects that already applied it.
    """
    template = await asyncio.to_thread(mfg.get_template, request.template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    saved = await asyncio.to_thread(
        _handle, mfg.save_spec_config, project_id,
        template.get("spec_config") or "", updated_by=user.email,
    )
    parsed = spec_config_service.parse_spec_config(saved.get("spec_config") or "")
    return {"spec_config": saved.get("spec_config") or "", "parsed": parsed.to_dict()}


# ---------------------------------------------------------------------------
# Runs
# ---------------------------------------------------------------------------


@router.get("/runs", dependencies=[Depends(require_viewer)])
async def list_runs(project_id: str | None = None):
    return await asyncio.to_thread(mfg.list_runs, project_id)


@router.post("/runs")
async def create_run(request: RunRequest, user: AuthenticatedUser = Depends(require_designer)):
    run_id = await asyncio.to_thread(
        _handle, mfg.create_run, request.project_id,
        manufacturer_id=request.manufacturer_id,
        spec_id=request.spec_id,
        commit_sha=request.commit_sha,
        release_tag=request.release_tag,
        quantity_ordered=request.quantity_ordered,
        notes=request.notes,
        # An empty snapshot means "freeze the chosen spec for me"; only an
        # explicit non-empty one overrides that.
        spec_snapshot=request.spec_snapshot or None,
        created_by=user.email,
    )
    return {"id": run_id}


@router.get("/runs/{run_id}", dependencies=[Depends(require_viewer)])
async def get_run(run_id: str):
    run = await asyncio.to_thread(mfg.get_run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.get("/runs/{run_id}/report.pdf", dependencies=[Depends(require_viewer)])
async def download_run_report(run_id: str):
    """A themed PDF report of a run: info, spec snapshot, defects, and evidence."""
    from fastapi.responses import Response

    from app.services import run_report_pdf_service

    try:
        pdf = await asyncio.to_thread(run_report_pdf_service.build_run_report, run_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    run = await asyncio.to_thread(mfg.get_run, run_id)
    name = (run or {}).get("project_name") or (run or {}).get("project_id") or run_id
    safe = "".join(c for c in str(name) if c.isalnum() or c in " ._-").strip() or "run"
    # Include the job number so each report file is uniquely named.
    job = (run or {}).get("job_number")
    filename = f"{safe} {job} production report.pdf" if job else f"{safe} production report.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch("/runs/{run_id}", dependencies=[Depends(require_designer)])
async def update_run(run_id: str, request: RunUpdateRequest):
    updated = await asyncio.to_thread(
        _handle, mfg.update_run, run_id, **request.model_dump(exclude_none=True)
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Run not found or nothing to update")
    return {"status": "success"}


@router.patch("/runs/{run_id}/status", dependencies=[Depends(require_run_status_actor)])
async def update_run_status(run_id: str, request: RunStatusRequest):
    """Advance a run's status. QA/Admin only, mirroring component QA."""
    updated = await asyncio.to_thread(_handle, mfg.update_run, run_id, status=request.status)
    if not updated:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"status": "success"}


@router.delete("/runs/{run_id}", dependencies=[Depends(require_designer)])
async def delete_run(run_id: str):
    if not await asyncio.to_thread(mfg.delete_run, run_id):
        raise HTTPException(status_code=404, detail="Run not found")
    await asyncio.to_thread(derived_assets.discard_run_evidence, run_id)
    return {"status": "success"}


# ---------------------------------------------------------------------------
# Defects  (QA can act here, per require_project_release_actor)
# ---------------------------------------------------------------------------


@router.post("/runs/{run_id}/defects")
async def log_defect(
    run_id: str,
    request: DefectRequest,
    user: AuthenticatedUser = Depends(require_project_release_actor),
):
    def_id = await asyncio.to_thread(
        _handle, mfg.log_defect, run_id,
        category=request.category, severity=request.severity,
        quantity_affected=request.quantity_affected,
        description=request.description, logged_by=user.email,
    )
    return {"id": def_id}


@router.patch("/defects/{defect_id}", dependencies=[Depends(require_project_release_actor)])
async def update_defect(defect_id: str, request: DefectUpdateRequest):
    updated = await asyncio.to_thread(
        _handle, mfg.update_defect, defect_id, **request.model_dump(exclude_none=True)
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Defect not found or nothing to update")
    return {"status": "success"}


@router.delete("/defects/{defect_id}", dependencies=[Depends(require_project_release_actor)])
async def delete_defect(defect_id: str):
    defect = await asyncio.to_thread(mfg.get_defect, defect_id)
    if not defect:
        raise HTTPException(status_code=404, detail="Defect not found")
    # Drop the defect's evidence blobs along with the row.
    for item in defect.get("evidence") or []:
        await asyncio.to_thread(
            derived_assets.delete_evidence, defect["run_id"], item.get("digest", "")
        )
    await asyncio.to_thread(mfg.delete_defect, defect_id)
    return {"status": "success"}


# ---------------------------------------------------------------------------
# Evidence
# ---------------------------------------------------------------------------


@router.post("/defects/{defect_id}/evidence")
async def upload_evidence(
    defect_id: str,
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(require_project_release_actor),
):
    defect = await asyncio.to_thread(mfg.get_defect, defect_id)
    if not defect:
        raise HTTPException(status_code=404, detail="Defect not found")

    # Read one byte past the cap so an oversized upload is refused on its size.
    data = await file.read(derived_assets.MAX_EVIDENCE_BYTES + 1)
    media_type = file.content_type or "application/octet-stream"
    try:
        digest, media_type, size = await asyncio.to_thread(
            derived_assets.store_evidence, defect["run_id"], data, media_type
        )
    except derived_assets.EvidenceError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    kind = "report" if media_type == "application/pdf" else "photo"
    descriptor = {
        "kind": kind,
        "filename": file.filename or f"{digest[:12]}",
        "digest": digest,
        "media_type": media_type,
        "size": size,
    }
    evidence = list(defect.get("evidence") or [])
    # Replace an existing entry with the same digest rather than duplicating it.
    evidence = [item for item in evidence if item.get("digest") != digest]
    evidence.append(descriptor)
    await asyncio.to_thread(mfg.set_defect_evidence, defect_id, evidence)
    return descriptor


@router.get("/runs/{run_id}/evidence/{digest}", dependencies=[Depends(require_viewer)])
async def get_evidence(run_id: str, digest: str):
    from fastapi.responses import FileResponse

    path = await asyncio.to_thread(derived_assets.find_evidence, run_id, digest)
    if path is None:
        raise HTTPException(status_code=404, detail="Evidence not found")
    return FileResponse(str(path))


@router.delete("/defects/{defect_id}/evidence/{digest}", dependencies=[Depends(require_project_release_actor)])
async def delete_evidence(defect_id: str, digest: str):
    defect = await asyncio.to_thread(mfg.get_defect, defect_id)
    if not defect:
        raise HTTPException(status_code=404, detail="Defect not found")
    await asyncio.to_thread(derived_assets.delete_evidence, defect["run_id"], digest)
    evidence = [item for item in (defect.get("evidence") or []) if item.get("digest") != digest]
    await asyncio.to_thread(mfg.set_defect_evidence, defect_id, evidence)
    return {"status": "success"}
