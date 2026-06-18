from __future__ import annotations

import threading
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core.security import (
    AuthenticatedUser,
    require_catalog_reader,
    require_catalog_writer,
)
from app.services.component_catalog_service import catalog_service
from app.services.workspace_service import workspace

router = APIRouter(prefix="/api/catalog", tags=["catalog"])

WORKFLOW_TRANSITIONS: dict[str, set[str]] = {
    "open": {"in_progress", "archived"},
    "in_progress": {"qa_review", "open", "archived"},
    "qa_review": {"done", "in_progress", "archived"},
    "done": {"released", "qa_review", "archived"},
    "released": {"archived", "open"},
    "archived": {"open"},
}

LEGACY_WORKFLOW_STAGE_MAP = {
    "draft": "open",
    "in_review": "qa_review",
    "qa_approved": "done",
    "deprecated": "archived",
}


def _normalize_workflow_stage(value: str) -> str:
    normalized = value.strip().lower()
    return LEGACY_WORKFLOW_STAGE_MAP.get(normalized, normalized)


def _can_transition_workflow(
    user: AuthenticatedUser, current_stage: str, next_stage: str
) -> bool:
    if current_stage == next_stage:
        return user.role in {"admin", "component_designer"} or (
            user.role == "component_qa" and current_stage == "qa_review"
        )
    if next_stage not in WORKFLOW_TRANSITIONS.get(current_stage, set()):
        return False
    if user.role == "admin":
        return True
    if user.role == "component_designer":
        return not (current_stage == "qa_review" and next_stage == "done")
    if user.role == "component_qa":
        return current_stage == "qa_review" and next_stage in {
            "done",
            "in_progress",
            "archived",
        }
    return False


def _update_validation_job(job_id: str, **fields: Any) -> None:
    workspace.update_job(job_id, **fields)


def _run_validation_job(job_id: str, component_ids: list[str] | None = None) -> None:
    errors: list[dict[str, str]] = []
    validated = 0
    component_payload: dict[str, Any] | None = None
    try:
        if component_ids is None:
            result = catalog_service.list_components(
                include_inactive=False, page=1, page_size=10000, lightweight=True
            )
            ids = [str(component["id"]) for component in result["items"]]
        else:
            ids = component_ids

        total = len(ids)
        if total == 0:
            _update_validation_job(
                job_id,
                status="completed",
                message="No components to validate",
                percent=100,
                validated=0,
                total=0,
                errors=[],
            )
            return

        _update_validation_job(
            job_id, message=f"Validating 0/{total} components", total=total
        )
        for index, component_id in enumerate(ids, start=1):
            _update_validation_job(
                job_id,
                message=f"Validating {index}/{total} components",
                percent=((index - 1) / total) * 100,
                current_component_id=component_id,
                validated=validated,
                errors=errors,
            )
            try:
                result = catalog_service.validate_component_klc(component_id)
                validated += 1
                if total == 1:
                    component_payload = result.get("component")
            except ValueError as exc:
                errors.append({"component_id": component_id, "error": str(exc)})

        _update_validation_job(
            job_id,
            status="completed",
            message=f"Validated {validated}/{total} components",
            percent=100,
            validated=validated,
            total=total,
            errors=errors,
            component=component_payload,
        )
    except Exception as exc:
        _update_validation_job(
            job_id,
            status="failed",
            message="KLC validation failed",
            percent=100,
            error=str(exc),
            validated=validated,
            errors=errors,
            component=component_payload,
        )


def _start_validation_job(component_ids: list[str] | None = None) -> str:
    job_id = str(uuid.uuid4())
    mode = "component" if component_ids and len(component_ids) == 1 else "catalog"
    workspace.create_job(
        job_id,
        "catalog_validation",
        status="running",
        message="Queued KLC validation",
        percent=0,
        mode=mode,
        component_ids=component_ids,
        validated=0,
        total=len(component_ids) if component_ids else None,
        errors=[],
    )
    thread = threading.Thread(
        target=_run_validation_job, args=(job_id, component_ids), daemon=True
    )
    thread.start()
    return job_id


def _update_preview_job(job_id: str, **fields: Any) -> None:
    workspace.update_job(job_id, **fields)


def _run_preview_job(job_id: str) -> None:
    try:

        def update_progress(counts: dict[str, Any]) -> None:
            total_assets = int(counts.get("total_assets") or 0)
            scanned_assets = int(counts.get("scanned_assets") or 0)
            percent = (
                100 if total_assets == 0 else (scanned_assets / total_assets) * 100
            )
            _update_preview_job(
                job_id,
                message=f"Generating previews {scanned_assets}/{total_assets}",
                percent=percent,
                **counts,
            )

        result = catalog_service.generate_missing_component_previews(
            progress_callback=update_progress
        )
        _update_preview_job(
            job_id,
            status="completed",
            message=(
                f"Generated {result.get('generated', 0)} missing previews; "
                f"{result.get('failed', 0)} failed"
            ),
            percent=100,
            **result,
        )
    except Exception as exc:
        _update_preview_job(
            job_id,
            status="failed",
            message="Preview generation failed",
            percent=100,
            error=str(exc),
        )


def _start_preview_job() -> str:
    job_id = str(uuid.uuid4())
    workspace.create_job(
        job_id,
        "catalog_preview_generation",
        status="running",
        message="Queued preview generation",
        percent=0,
        scanned_assets=0,
        generated=0,
        skipped_ready=0,
        failed=0,
        errors=[],
    )
    thread = threading.Thread(target=_run_preview_job, args=(job_id,), daemon=True)
    thread.start()
    return job_id


class CreateManualComponentRequest(BaseModel):
    value: str
    description: str
    datasheet: str
    manufacturer: str
    manufacturer_part_number: str
    category: str = ""
    package_name: str = ""
    vendor: str = ""
    vendor_part_number: str = ""
    mass_g: str = ""
    rqjc_c_w: str = ""
    rqjc_top_c_w: str = ""
    temp_max_c: str = ""
    temp_min_c: str = ""
    power_dissipation_w: str = ""
    rate: str = ""
    sap_code: str = ""


class UpdateComponentMetadataRequest(BaseModel):
    value: str | None = None
    description: str | None = None
    datasheet_url: str | None = None
    manufacturer: str | None = None
    mpn: str | None = None
    category: str | None = None
    package_name: str | None = None
    vendor: str | None = None
    vendor_part_number: str | None = None
    mass_g: str | None = None
    rqjc_c_w: str | None = None
    rqjc_top_c_w: str | None = None
    temp_max_c: str | None = None
    temp_min_c: str | None = None
    power_dissipation_w: str | None = None
    rate: str | None = None
    sap_code: str | None = None


class ReleaseStatusRequest(BaseModel):
    release_status: str = ""
    workflow_stage: str = ""


@router.get("/components")
async def list_catalog_components(
    q: str = Query(default=""),
    source: str | None = Query(default=None),
    availability_state: str | None = Query(default=None),
    workflow_stage: str | None = Query(default=None),
    validation_status: str | None = Query(default=None),
    category: str | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    sort_by: str = Query(default=""),
    sort_dir: str = Query(default="asc"),
    lightweight: bool = Query(default=False),
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    _ = user
    try:
        return catalog_service.list_components(
            query=q,
            source=source,
            availability_state=availability_state,
            workflow_stage=workflow_stage,
            validation_status=validation_status,
            category=category,
            include_inactive=include_inactive,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_dir=sort_dir,
            lightweight=lightweight,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/categories")
async def list_catalog_categories(
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    _ = user
    return {"categories": catalog_service.list_categories()}


@router.get("/workflow/summary")
async def workflow_summary(user: AuthenticatedUser = Depends(require_catalog_reader)):
    _ = user
    return catalog_service.workflow_summary()


@router.get("/health")
async def catalog_health(user: AuthenticatedUser = Depends(require_catalog_reader)):
    _ = user
    return catalog_service.catalog_health()


@router.post("/components")
async def create_catalog_component(
    payload: CreateManualComponentRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _ = user
    try:
        return catalog_service.create_manual_component(**payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/components/{component_id}")
async def get_catalog_component(
    component_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)
):
    _ = user
    component = catalog_service.get_component(component_id)
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return component


@router.patch("/components/{component_id}")
async def update_catalog_component(
    component_id: str,
    payload: UpdateComponentMetadataRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _ = user
    updates: dict[str, Any] = {
        key: value for key, value in payload.model_dump().items() if value is not None
    }
    try:
        component = catalog_service.update_component_metadata(component_id, updates)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return component


@router.post("/components/{component_id}/symbol-import")
async def import_symbol_library(
    component_id: str,
    file: UploadFile = File(...),
    target_library: str = Form(default=""),
    selected_symbol: str = Form(default=""),
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _ = user
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded symbol library was empty")

    try:
        return catalog_service.import_symbol_library(
            component_id,
            upload_name=file.filename or "uploaded.kicad_sym",
            payload=payload,
            target_library=target_library or component_id,
            selected_symbol=selected_symbol,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/components/{component_id}/footprint-import")
async def import_footprint(
    component_id: str,
    file: UploadFile = File(...),
    target_library: str = Form(default=""),
    selected_footprint: str = Form(default=""),
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _ = user
    payload = await file.read()
    if not payload:
        raise HTTPException(
            status_code=400, detail="Uploaded footprint payload was empty"
        )

    try:
        return catalog_service.import_footprint(
            component_id,
            upload_name=file.filename or "uploaded.kicad_mod",
            payload=payload,
            target_library=target_library or "Prism_Footprints",
            selected_footprint=selected_footprint,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/components/{component_id}/assets/{asset_type}")
async def import_auxiliary_asset(
    component_id: str,
    asset_type: str,
    file: UploadFile = File(...),
    target_library: str = Form(default=""),
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _ = user
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded asset payload was empty")

    try:
        return catalog_service.attach_auxiliary_asset(
            component_id,
            asset_type=asset_type,
            upload_name=file.filename or f"{asset_type}.bin",
            payload=payload,
            target_library=target_library or "Prism_Assets",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/components/{component_id}/assets/{asset_type}")
async def detach_component_asset(
    component_id: str,
    asset_type: str,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _ = user
    try:
        return catalog_service.detach_asset(component_id, asset_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/components/{component_id}")
async def delete_catalog_component(
    component_id: str, user: AuthenticatedUser = Depends(require_catalog_writer)
):
    _ = user
    if not catalog_service.delete_component(component_id):
        raise HTTPException(status_code=404, detail="Component not found")
    return {"ok": True}


@router.post("/components/{component_id}/release")
async def transition_release_status(
    component_id: str,
    payload: ReleaseStatusRequest,
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    try:
        stage = payload.workflow_stage or payload.release_status
        next_stage = _normalize_workflow_stage(stage)
        component_before = catalog_service.get_component(component_id)
        if not component_before:
            raise HTTPException(status_code=404, detail="Component not found")
        current_stage = _normalize_workflow_stage(
            str(
                component_before.get("workflow_stage")
                or component_before.get("release_status")
                or ""
            )
        )
        if not _can_transition_workflow(user, current_stage, next_stage):
            raise HTTPException(
                status_code=403,
                detail="Catalog workflow transition not allowed for this role",
            )
        component = catalog_service.set_release_status(component_id, stage)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return component


@router.post("/components/{component_id}/previews/regenerate")
async def regenerate_component_previews(
    component_id: str, user: AuthenticatedUser = Depends(require_catalog_writer)
):
    _ = user
    try:
        component = catalog_service.regenerate_component_previews(component_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return component


@router.post("/components/{component_id}/validate")
async def validate_component_klc(
    component_id: str, user: AuthenticatedUser = Depends(require_catalog_writer)
):
    _ = user
    job_id = _start_validation_job([component_id])
    return {"job_id": job_id, "status": "queued"}


@router.get("/components/{component_id}/validation")
async def get_component_validation(
    component_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)
):
    _ = user
    try:
        return catalog_service.get_component_validation(component_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/validation/run")
async def validate_catalog(user: AuthenticatedUser = Depends(require_catalog_writer)):
    _ = user
    job_id = _start_validation_job()
    return {"job_id": job_id, "status": "queued"}


@router.get("/validation/jobs/{job_id}")
async def get_validation_job(
    job_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)
):
    _ = user
    job = workspace.get_job(job_id, "catalog_validation")
    if not job:
        raise HTTPException(status_code=404, detail="Validation job not found")
    return job


@router.get("/validation/runs/{run_id}")
async def get_validation_run(
    run_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)
):
    _ = user
    run = catalog_service.get_validation_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Validation run not found")
    return run


@router.get("/validation/runs/{run_id}/{report_name}")
async def get_validation_report(
    run_id: str,
    report_name: str,
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    _ = user
    path = catalog_service.validation_report_path(run_id, report_name)
    if not path:
        raise HTTPException(status_code=404, detail="Validation report not found")
    media_type = (
        "application/json"
        if report_name.endswith(".json")
        else "application/xml"
        if report_name.endswith(".xml")
        else "text/plain"
    )
    return FileResponse(path, media_type=media_type, filename=path.name)


@router.post("/previews/generate-missing")
async def generate_missing_previews(
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _ = user
    job_id = _start_preview_job()
    return {"job_id": job_id, "status": "queued"}


@router.get("/previews/jobs/{job_id}")
async def get_preview_job(
    job_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)
):
    _ = user
    job = workspace.get_job(job_id, "catalog_preview_generation")
    if not job:
        raise HTTPException(status_code=404, detail="Preview generation job not found")
    return job


@router.post("/exports/kicad-dbl")
async def export_kicad_dbl_bundle(
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _ = user
    try:
        return catalog_service.export_kicad_dbl_bundle()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ─── Phase 2: CSV Import Routes ──────────────────────────────────────────────


@router.post("/components/import-csv")
async def import_metadata_csv(
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _ = user
    content = await file.read()
    try:
        csv_str = content.decode("utf-8")
        return catalog_service.import_metadata_csv(csv_str)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/stock/sync-csv")
async def import_stock_csv(
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _ = user
    content = await file.read()
    try:
        csv_str = content.decode("utf-8")
        return catalog_service.import_stock_csv(csv_str)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ─── Phase 2: Asset Browsing/Linking Routes ──────────────────────────────────


@router.get("/assets/browse")
async def browse_library_assets(
    asset_type: str = Query(...),
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _ = user
    try:
        files = catalog_service.browse_library_assets(asset_type)
        return {"files": files}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class LinkAssetRequest(BaseModel):
    file_path: str
    target_library: str = ""
    target_name: str = ""


@router.post("/components/{component_id}/assets/{asset_type}/link")
async def link_library_asset(
    component_id: str,
    asset_type: str,
    payload: LinkAssetRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _ = user
    try:
        return catalog_service.link_library_asset(
            component_id,
            asset_type,
            file_path_rel=payload.file_path,
            target_library=payload.target_library,
            target_name=payload.target_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
