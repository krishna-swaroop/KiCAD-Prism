from __future__ import annotations

import logging
import re
import shutil
import subprocess
import tempfile
import threading
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

import app.services.project_service as project_service
from app.core.security import (
    AuthenticatedUser,
    require_catalog_reader,
    require_catalog_writer,
)
from app.services.component_catalog_service import catalog_service
from app.services.workspace_service import workspace

logger = logging.getLogger(__name__)

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


@router.get("/components/by-asset")
async def find_component_by_asset(
    type: str = Query(..., description="Asset type: 'symbol' or 'footprint'"),
    library: str = Query(..., description="Target library name (e.g. 'EasyEDA')"),
    name: str = Query(..., description="Target asset name (e.g. 'C0603')"),
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    _ = user
    component = catalog_service.find_component_by_asset(type, library, name)
    if not component:
        raise HTTPException(status_code=404, detail="No component found for this asset")
    return component


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


@router.get("/components/{component_id}/assets/{asset_type}/content/{filename:path}")
@router.get("/components/{component_id}/assets/{asset_type}/content")
async def get_asset_content(
    component_id: str,
    asset_type: str,
    filename: str = "",
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    """Return the raw file content of an asset for in-browser preview."""
    _ = user
    from pathlib import Path  # noqa: PLC0415

    component = catalog_service.get_component(component_id)
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")

    asset_stub = next(
        (a for a in component.get("assets", []) if a.get("asset_type") == asset_type),
        None,
    )
    if not asset_stub:
        raise HTTPException(status_code=404, detail=f"No {asset_type} asset attached")

    full_asset = catalog_service.get_asset_by_id(asset_stub["id"])
    if not full_asset:
        raise HTTPException(status_code=404, detail="Asset record not found")

    path = Path(full_asset.get("canonical_path", ""))
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Asset file not found on disk")

    filename = path.name
    content_type = full_asset.get("content_type") or "application/octet-stream"
    try:
        return FileResponse(
            path=str(path),
            media_type=content_type,
            filename=filename,
            headers={"X-Asset-Filename": filename},
        )
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


_KICAD_CLI_CANDIDATES = [
    r"C:\Program Files\KiCad\10.0\bin\kicad-cli.exe",
    r"C:\Program Files\KiCad\9.0\bin\kicad-cli.exe",
    r"C:\Program Files\KiCad\8.0\bin\kicad-cli.exe",
    "kicad-cli",
]

_MINIMAL_PCB_TEMPLATE = """\
(kicad_pcb
  (version 20240108)
  (generator "prism-export")
  (general (thickness 1.6))
  (paper "A4")
  (layers
    (0 "F.Cu" signal)
    (31 "B.Cu" signal)
    (32 "B.Adhes" user "B.Adhesive")
    (33 "F.Adhes" user "F.Adhesive")
    (34 "B.Paste" user)
    (35 "F.Paste" user)
    (36 "B.SilkS" user "B.Silkscreen")
    (37 "F.SilkS" user "F.Silkscreen")
    (38 "B.Mask" user)
    (39 "F.Mask" user)
    (44 "Edge.Cuts" user)
    (45 "Margin" user)
    (46 "B.CrtYd" user "B.Courtyard")
    (47 "F.CrtYd" user "F.Courtyard")
    (48 "B.Fab" user)
    (49 "F.Fab" user)
  )
  (setup (pad_to_mask_clearance 0))
  (gr_rect
    (start -{half_w} -{half_h})
    (end {half_w} {half_h})
    (layer "Edge.Cuts")
    (width 0.05)
  )
{footprint_block}
)
"""


def _find_kicad_cli() -> str | None:
    for candidate in _KICAD_CLI_CANDIDATES:
        found = shutil.which(candidate) or (Path(candidate).is_file() and candidate)
        if found:
            return str(found)
    return None


def _footprint_half_extents(mod_text: str, padding: float = 5.0) -> tuple[float, float]:
    """Return (half_w, half_h) of the footprint bounding box with padding (mm)."""
    coords: list[float] = []
    for m in re.finditer(r"\(\s*(?:start|end|at|xy)\s+([-\d.]+)\s+([-\d.]+)", mod_text):
        coords.append(float(m.group(1)))
        coords.append(float(m.group(2)))
    if not coords:
        return 50.0, 50.0
    xs = coords[0::2]
    ys = coords[1::2]
    half_w = max(abs(min(xs)), abs(max(xs))) + padding
    half_h = max(abs(min(ys)), abs(max(ys))) + padding
    return round(half_w, 3), round(half_h, 3)


def _strip_model_block(text: str) -> str:
    """Remove all (model ...) blocks from a footprint text (paren-balanced)."""
    out = []
    i = 0
    n = len(text)
    while i < n:
        # Check for start of a (model token
        if text[i] == "(" and text[i + 1 : i + 7] == "model ":
            depth = 1
            i += 1
            while i < n and depth > 0:
                if text[i] == "(":
                    depth += 1
                elif text[i] == ")":
                    depth -= 1
                i += 1
        else:
            out.append(text[i])
            i += 1
    return "".join(out)


def _mod_to_pcb_footprint(mod_text: str, lib_name: str, fp_name: str) -> str:
    """Convert a .kicad_mod (footprint or legacy module) into a PCB footprint block.

    Handles both modern ``(footprint ...)`` and legacy ``(module ...)`` formats.
    Returns the full block with corrected lib_id and ``(at 0 0)``.
    """
    text = mod_text.strip()

    # Normalise legacy (module ...) → (footprint ...) so downstream code is uniform
    text = re.sub(r"^\(module\b", "(footprint", text, count=1)

    # Replace the lib_id (first quoted string after the keyword) with lib_name:fp_name
    text = re.sub(
        r"^(\(footprint\s+)(?:\"[^\"]*\"|[^\s(]+)",
        rf'\1"{lib_name}:{fp_name}"',
        text,
        count=1,
    )

    # Ensure (at 0 0) is present; insert after the opening tag if missing
    if "(at " not in text:
        text = re.sub(
            r"(\(footprint\s+\"[^\"]*\"\s*)",
            r"\1(at 0 0) ",
            text,
            count=1,
        )
    else:
        # Replace existing (at ...) with (at 0 0)
        text = re.sub(r"\(at\s[^)]+\)", "(at 0 0)", text, count=1)

    # Indent the whole block by two spaces so it sits nicely inside kicad_pcb
    return "\n".join(
        "  " + line if line.strip() else line for line in text.splitlines()
    )


def _patch_model_path(mod_text: str, model_abs_path: str) -> str:
    """Replace any (model "...") path with the resolved absolute path."""
    abs_fwd = model_abs_path.replace("\\", "/")
    return re.sub(
        r'(\(model\s+)"[^"]*"',
        lambda m: f'{m.group(1)}"{abs_fwd}"',
        mod_text,
    )


@router.get("/components/{component_id}/assets/footprint/export-step")
async def export_footprint_step(
    component_id: str,
    hide_part: bool = Query(default=False),
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    """Export footprint + 3D model as a VRML file via kicad-cli. hide_part=true omits the 3D model."""
    _ = user
    kicad_cli = _find_kicad_cli()
    if not kicad_cli:
        raise HTTPException(
            status_code=503,
            detail="kicad-cli not found — install KiCad to enable STEP export",
        )

    component = catalog_service.get_component(component_id)
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")

    assets = component.get("assets", [])

    fp_stub = next((a for a in assets if a.get("asset_type") == "footprint"), None)
    if not fp_stub:
        raise HTTPException(status_code=404, detail="No footprint asset attached")

    full_fp = catalog_service.get_asset_by_id(fp_stub["id"])
    if not full_fp:
        raise HTTPException(status_code=404, detail="Footprint asset record not found")

    fp_path = Path(full_fp.get("canonical_path", ""))
    if not fp_path.is_file():
        raise HTTPException(status_code=404, detail="Footprint file not found on disk")

    mod_text = fp_path.read_text(encoding="utf-8")

    if hide_part:
        # Strip (model ...) blocks entirely so kicad-cli exports board/pads only.
        mod_text = _strip_model_block(mod_text)
    else:
        # Resolve 3D model path from catalog asset and patch into footprint so
        # kicad-cli can find it without needing ${KICAD_3RD_PARTY} resolved.
        model_stub = next((a for a in assets if a.get("asset_type") == "3dmodel"), None)
        if model_stub:
            full_model = catalog_service.get_asset_by_id(model_stub["id"])
            if full_model:
                model_path = full_model.get("canonical_path", "")
                if model_path and Path(model_path).is_file():
                    mod_text = _patch_model_path(mod_text, model_path)

    fp_name = fp_path.stem
    lib_name = "Prism"
    half_w, half_h = _footprint_half_extents(mod_text)
    footprint_block = _mod_to_pcb_footprint(mod_text, lib_name, fp_name)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)

        pcb_text = _MINIMAL_PCB_TEMPLATE.format(
            lib_name=lib_name,
            fp_name=fp_name,
            half_w=half_w,
            half_h=half_h,
            footprint_block=footprint_block,
        )
        pcb_file = tmp_path / "board.kicad_pcb"
        vrml_file = tmp_path / "board.wrl"
        pcb_file.write_text(pcb_text, encoding="utf-8")

        result = subprocess.run(
            [
                kicad_cli,
                "pcb",
                "export",
                "vrml",
                "--output",
                str(vrml_file),
                "--units",
                "mm",
                "--force",
                str(pcb_file),
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )

        if not vrml_file.is_file() or result.returncode != 0:
            detail = (result.stderr or result.stdout or "kicad-cli failed").strip()
            raise HTTPException(status_code=500, detail=f"VRML export failed: {detail}")

        vrml_bytes = vrml_file.read_bytes()

    return Response(
        content=vrml_bytes,
        media_type="model/vrml",
        headers={
            "Content-Disposition": f'attachment; filename="{fp_name}.wrl"',
            "X-Asset-Filename": f"{fp_name}.wrl",
        },
    )


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


def _extract_footprint_from_pcb(pcb_text: str, fp_name: str) -> str | None:
    """Extract a single (footprint ...) block whose library_link ends with fp_name."""
    # Find candidate start positions — match both quoted variants
    pattern = re.compile(r'\(footprint\s+"(?:[^"]*:)?' + re.escape(fp_name) + r'"')
    for m in pattern.finditer(pcb_text):
        start = m.start()
        depth = 0
        i = start
        n = len(pcb_text)
        while i < n:
            if pcb_text[i] == "(":
                depth += 1
            elif pcb_text[i] == ")":
                depth -= 1
                if depth == 0:
                    return pcb_text[start : i + 1]
            i += 1
    return None


def _normalize_symbol_block(block: str, bare_name: str) -> str:
    """Replace all occurrences of "lib:bare_name..." with "bare_name..." inside a symbol block.

    kicad-cli --symbol lookup uses the bare name; the block extracted from a schematic
    still carries the full "library:name" prefix on every sub-symbol reference.
    """
    # Replace the outer name and every sub-symbol name (e.g. "lib:name_1_1" → "name_1_1")
    return re.sub(
        r'"[^"]+:(' + re.escape(bare_name) + r'[^"]*)"',
        r'"\1"',
        block,
    )


def _extract_symbol_from_sch(sch_text: str, sym_name: str) -> str | None:
    """Extract (symbol "lib:name" ...) from the (lib_symbols ...) block."""
    # Locate lib_symbols block
    ls_match = re.search(r"\(lib_symbols\s", sch_text)
    if not ls_match:
        return None
    start = ls_match.start()
    depth = 0
    i = start
    n = len(sch_text)
    lib_symbols_end = n
    while i < n:
        if sch_text[i] == "(":
            depth += 1
        elif sch_text[i] == ")":
            depth -= 1
            if depth == 0:
                lib_symbols_end = i + 1
                break
        i += 1
    lib_block = sch_text[start:lib_symbols_end]
    # Match exactly "lib:sym_name" or just "sym_name", not sub-symbols like "lib:sym_name_1_1"
    pattern = re.compile(r'\(symbol\s+"(?:[^"]*:)?' + re.escape(sym_name) + r'"')
    for m in pattern.finditer(lib_block):
        sym_start = m.start()
        depth = 0
        i = sym_start
        block_len = len(lib_block)
        while i < block_len:
            if lib_block[i] == "(":
                depth += 1
            elif lib_block[i] == ")":
                depth -= 1
                if depth == 0:
                    return lib_block[sym_start : i + 1]
            i += 1
    return None


def _read_project_files(project_id: str) -> tuple[str | None, str | None]:
    """Return (pcb_text, sch_text) for a project, either may be None if file not found."""
    project = workspace.get_project_by_id(project_id)
    if not project:
        return None, None
    project_path = project["path"]
    pcb_path = project_service.find_pcb_file(project_path)
    sch_path = project_service.find_schematic_file(project_path)
    pcb_text = (
        Path(pcb_path).read_text(encoding="utf-8")
        if pcb_path and Path(pcb_path).is_file()
        else None
    )
    sch_text = (
        Path(sch_path).read_text(encoding="utf-8")
        if sch_path and Path(sch_path).is_file()
        else None
    )
    return pcb_text, sch_text


def _resolve_asset_block(
    asset_type: str, name: str, project_id: str
) -> tuple[str, str] | None:
    """Extract a footprint or symbol block from the project files.

    Returns (block_text, normalized_block_text) or None if not found.
    For footprint: searches PCB file. For symbol: searches SCH file.
    """
    pcb_text, sch_text = _read_project_files(project_id)
    if asset_type == "footprint":
        if not pcb_text:
            return None
        block = _extract_footprint_from_pcb(pcb_text, name)
        if not block:
            return None
        block = re.sub(r'^\(footprint\s+"[^"]*"', f'(footprint "{name}"', block)
        return block, block
    elif asset_type == "symbol":
        if not sch_text:
            return None
        block = _extract_symbol_from_sch(sch_text, name)
        if not block:
            return None
        block = _normalize_symbol_block(block, name)
        sym_lib = (
            f"(kicad_symbol_lib (version 20231120) (generator prism)\n  {block}\n)\n"
        )
        return block, sym_lib
    return None


class InlinePreviewRequest(BaseModel):
    asset_type: str  # "footprint" | "symbol"
    name: str  # bare name used for extraction (e.g. "C0603")
    project_id: str  # project to read files from


@router.post("/assets/extract-block")
async def extract_asset_block(
    payload: InlinePreviewRequest,
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    """Extract a raw footprint (.kicad_mod) or symbol (.kicad_sym) block from the project files."""
    _ = user
    if payload.asset_type not in ("footprint", "symbol"):
        raise HTTPException(
            status_code=400, detail="asset_type must be 'footprint' or 'symbol'"
        )
    result = _resolve_asset_block(payload.asset_type, payload.name, payload.project_id)
    if not result:
        raise HTTPException(
            status_code=404,
            detail=f"{payload.asset_type} '{payload.name}' not found in project files",
        )
    raw_block, wrapped = result
    if payload.asset_type == "footprint":
        return Response(
            content=raw_block.encode(),
            media_type="text/plain",
            headers={
                "Content-Disposition": f'attachment; filename="{payload.name}.kicad_mod"'
            },
        )
    else:
        return Response(
            content=wrapped.encode(),
            media_type="text/plain",
            headers={
                "Content-Disposition": f'attachment; filename="{payload.name}.kicad_sym"'
            },
        )


@router.post("/assets/inline-preview-svg")
async def render_inline_preview_svg(
    payload: InlinePreviewRequest,
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    """Extract a footprint/symbol from project files and render an SVG preview."""
    _ = user
    kicad_cli = _find_kicad_cli()
    logger.info(
        "inline-preview-svg: type=%s name=%s project=%s cli=%s",
        payload.asset_type,
        payload.name,
        payload.project_id,
        kicad_cli,
    )
    if not kicad_cli:
        raise HTTPException(status_code=503, detail="kicad-cli not found")
    if payload.asset_type not in ("footprint", "symbol"):
        raise HTTPException(
            status_code=400, detail="asset_type must be 'footprint' or 'symbol'"
        )

    result = _resolve_asset_block(payload.asset_type, payload.name, payload.project_id)
    if not result:
        raise HTTPException(
            status_code=404,
            detail=f"{payload.asset_type} '{payload.name}' not found in project files",
        )
    raw_block, wrapped = result

    name = payload.name
    with tempfile.TemporaryDirectory(prefix="prism_inline_svg_") as tmp:
        tmp_path = Path(tmp)

        if payload.asset_type == "footprint":
            lib_dir = tmp_path / "isolated.pretty"
            lib_dir.mkdir()
            (lib_dir / f"{name}.kicad_mod").write_text(raw_block, encoding="utf-8")
            ALL_FP_LAYERS = (
                "F.Cu,B.Cu,F.Paste,B.Paste,F.Silkscreen,B.Silkscreen,"
                "F.Fab,B.Fab,F.Courtyard,B.Courtyard,F.Adhesive,B.Adhesive,"
                "User.1,User.2,User.3,User.4,User.5"
            )
            cmd = [
                kicad_cli,
                "fp",
                "export",
                "svg",
                "--output",
                str(tmp_path),
                "--layers",
                ALL_FP_LAYERS,
                "--footprint",
                name,
                str(lib_dir),
            ]
        else:
            sym_file = tmp_path / f"{name}.kicad_sym"
            sym_file.write_text(wrapped, encoding="utf-8")
            cmd = [
                kicad_cli,
                "sym",
                "export",
                "svg",
                str(sym_file),
                "--output",
                str(tmp_path),
                "--symbol",
                name,
            ]

        logger.info("inline-preview-svg: running %s", cmd)
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=30, check=False
        )
        logger.info(
            "inline-preview-svg: rc=%d stdout=%r stderr=%r",
            proc.returncode,
            proc.stdout[:300],
            proc.stderr[:300],
        )
        candidates = sorted(tmp_path.glob("*.svg"))
        if not candidates:
            raise HTTPException(
                status_code=500, detail=f"SVG generation failed: {proc.stderr[:300]}"
            )
        return Response(content=candidates[0].read_bytes(), media_type="image/svg+xml")


@router.get("/assets/preview-svg")
async def get_asset_preview_svg(
    type: str = Query(..., description="Asset type: 'symbol' or 'footprint'"),
    library: str = Query(..., description="Target library name"),
    name: str = Query(..., description="Target asset name"),
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    """Return an SVG preview for a given library:name asset, generating it on demand if not cached."""
    _ = user
    svg_path = catalog_service.get_or_generate_preview_svg_path(type, library, name)
    if not svg_path or not svg_path.is_file():
        raise HTTPException(status_code=404, detail="Preview not available")
    return FileResponse(
        path=str(svg_path),
        media_type="image/svg+xml",
        filename=svg_path.name,
    )


@router.get("/assets/raw-content")
async def get_asset_raw_content(
    type: str = Query(..., description="Asset type: 'symbol' or 'footprint'"),
    library: str = Query(..., description="Target library name"),
    name: str = Query(..., description="Target asset name"),
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    """Serve the raw asset file for a given library:name pair without requiring a component match."""
    _ = user
    from pathlib import Path  # noqa: PLC0415

    asset = catalog_service.find_asset_by_library_name(type, library, name)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    path = Path(str(asset.get("canonical_path", "")))
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Asset file not found on disk")
    content_type = str(asset.get("content_type") or "application/octet-stream")
    return FileResponse(
        path=str(path),
        media_type=content_type,
        filename=path.name,
        headers={"X-Asset-Filename": path.name},
    )


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


# ─── Library Bulk Import ─────────────────────────────────────────────────────


@router.post("/library-import")
async def start_library_import(
    user: AuthenticatedUser = Depends(require_catalog_writer),
    file: UploadFile | None = File(default=None),
    source_path: str = Form(default=""),
    overwrite: bool = Form(default=False),
    generate_previews: bool = Form(default=True),
    create_stubs: bool = Form(default=True),
):
    _ = user
    from app.services.library_import_service import (
        start_library_import as _start,  # noqa: PLC0415
    )

    zip_bytes: bytes | None = None
    zip_filename = "library.zip"
    if file is not None:
        zip_bytes = await file.read()
        zip_filename = file.filename or "library.zip"
    elif not source_path:
        raise HTTPException(
            status_code=422, detail="Provide either a ZIP file or a source_path"
        )

    job_id = _start(
        source_path=source_path or None,
        zip_bytes=zip_bytes,
        zip_filename=zip_filename,
        overwrite=overwrite,
        generate_previews=generate_previews,
        create_stubs=create_stubs,
    )
    return {"job_id": job_id, "status": "running"}


@router.get("/library-import/{job_id}")
async def get_library_import_job(
    job_id: str,
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    _ = user
    from app.services.library_import_service import get_import_job  # noqa: PLC0415

    job = get_import_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Import job not found")
    return job


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
