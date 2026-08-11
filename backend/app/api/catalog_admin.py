from __future__ import annotations

import csv
import hashlib
import io
from itertools import chain
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.security import AuthenticatedUser, require_catalog_reader, require_catalog_writer
from app.services.component_catalog_service import catalog_service
from app.services.catalog_job_service import catalog_jobs
from app.services.local_artifact_store import artifact_store
from app.services.library_folder_import_service import configured_import_roots, resolve_server_import_path
from app.services.kicad_library_discovery import discover_library
from app.services import semantic_visualizer_service
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


def _can_transition_workflow(user: AuthenticatedUser, current_stage: str, next_stage: str) -> bool:
    if current_stage == next_stage:
        return user.role in {"admin", "component_designer"} or (user.role == "component_qa" and current_stage == "qa_review")
    if next_stage not in WORKFLOW_TRANSITIONS.get(current_stage, set()):
        return False
    if user.role == "admin":
        return True
    if user.role == "component_designer":
        return not (current_stage == "qa_review" and next_stage == "done")
    if user.role == "component_qa":
        return current_stage == "qa_review" and next_stage in {"done", "in_progress", "archived"}
    return False


def _enqueue_catalog_job(
    job_type: str,
    payload: dict[str, Any],
    *,
    actor: str,
    idempotency_key: str = "",
) -> dict[str, Any]:
    return catalog_jobs.enqueue(
        job_type,
        payload,
        created_by=actor,
        idempotency_key=idempotency_key,
    )


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
    change_summary: str = "Create component"
    extra_fields: dict[str, str] = Field(default_factory=dict)


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
    expected_revision_id: str = Field(min_length=1)
    change_summary: str = "Update component metadata"
    extra_fields: dict[str, str] | None = None


class MetadataFieldRequest(BaseModel):
    key: str = ""
    label: str = ""
    description: str = ""
    type: str = "text"
    unit: str = ""
    enum_values: list[str] = Field(default_factory=list)
    required: bool = False
    display_order: int | None = None


class MetadataGridPreferencesRequest(BaseModel):
    visible: list[str] = Field(default_factory=list)
    order: list[str] = Field(default_factory=list)
    widths: dict[str, int] = Field(default_factory=dict)
    pinned: list[str] = Field(default_factory=list)


class MetadataBatchItemRequest(BaseModel):
    component_id: str
    expected_revision_id: str
    patch: dict[str, str] = Field(default_factory=dict)


class CreateMetadataBatchRequest(BaseModel):
    items: list[MetadataBatchItemRequest] = Field(min_length=1, max_length=10000)
    change_summary: str = Field(default="Bulk update component metadata", min_length=1, max_length=500)


class ApplyMetadataBatchRequest(BaseModel):
    item_ids: list[str] = Field(default_factory=list, max_length=10000)


class ReleaseStatusRequest(BaseModel):
    release_status: str = ""
    workflow_stage: str = ""
    self_approval_override_reason: str = ""
    review_note: str = ""
    expected_revision_id: str = ""
    expected_manifest_hash: str = ""


class ProjectComponentSelectionRequest(BaseModel):
    component_uid: str = ""
    reference: str = ""
    schematic_uuid: str = ""
    pcb_footprint_uuid: str = ""


class ProjectImportRequest(BaseModel):
    scope: str
    project_id: str = ""
    source_revision: str = ""
    selection: ProjectComponentSelectionRequest | None = None


class FolderSnapshotRequest(BaseModel):
    display_name: str = "KiCad libraries"


class FolderInventoryFile(BaseModel):
    relative_path: str
    size_bytes: int = Field(default=0, ge=0)


class FolderDiscoveryRequest(BaseModel):
    files: list[FolderInventoryFile] = Field(default_factory=list, max_length=100000)
    footprint_resolutions: dict[str, str] = Field(default_factory=dict)


class FolderApprovalRequest(BaseModel):
    approved_component_ids: list[str] = Field(default_factory=list, max_length=100000)
    footprint_resolutions: dict[str, str] = Field(default_factory=dict)


class ServerFolderImportRequest(BaseModel):
    root_name: str
    subpath: str = ""
    display_name: str = ""


class AcceptProjectImportProposalRequest(BaseModel):
    metadata_overrides: dict[str, Any] = Field(default_factory=dict)
    asset_selections: dict[str, list[str]] = Field(default_factory=dict)
    # asset_type -> existing catalog asset id. Linking reuses that asset rather than
    # importing a duplicate copy of the project's own file.
    asset_links: dict[str, str] = Field(default_factory=dict)
    change_summary: str = "Import component from project"


class BulkAcceptItem(AcceptProjectImportProposalRequest):
    proposal_id: str = Field(min_length=1)


class BulkAcceptRequest(BaseModel):
    items: list[BulkAcceptItem] = Field(default_factory=list, max_length=500)


class SaveImportDraftsRequest(BaseModel):
    # proposal_id -> {metadata_overrides, asset_selections, asset_links}
    drafts: dict[str, dict[str, Any]] = Field(default_factory=dict)


@router.get("/components")
def list_catalog_components(
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
def list_catalog_categories(user: AuthenticatedUser = Depends(require_catalog_reader)):
    _ = user
    return {"categories": catalog_service.list_categories()}


@router.get("/workflow/summary")
def workflow_summary(user: AuthenticatedUser = Depends(require_catalog_reader)):
    _ = user
    return catalog_service.workflow_summary()


@router.get("/release-queue")
def release_queue(
    q: str = Query(default=""),
    workflow_stage: str = Query(default="all", pattern="^(all|qa_review|done)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    _ = user
    stages = "qa_review,done" if workflow_stage == "all" else workflow_stage
    try:
        result = catalog_service.list_components(
            query=q,
            workflow_stage=stages,
            include_inactive=False,
            page=page,
            page_size=page_size,
            sort_by="updated_at",
            sort_dir="desc",
            lightweight=True,
        )
        return {**result, "summary": catalog_service.release_queue_summary()}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/health")
def catalog_health(user: AuthenticatedUser = Depends(require_catalog_reader)):
    _ = user
    return catalog_service.catalog_health()


@router.post("/import-sessions/projects", status_code=202)
def create_project_import_session(
    payload: ProjectImportRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    visible_projects = {str(project["id"]) for project in workspace.get_all_projects(user.role)}
    if payload.scope in {"component", "project"} and payload.project_id not in visible_projects:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        selected_project_ids = sorted(visible_projects) if payload.scope == "all-projects" else [payload.project_id]
        project_revisions: dict[str, str] = {}
        for project_id in selected_project_ids:
            project = workspace.get_project_by_id(project_id)
            if not project:
                continue
            repo_root = semantic_visualizer_service._repo_root(Path(str(project["path"])))
            requested_ref = payload.source_revision if project_id == payload.project_id and payload.source_revision else "HEAD"
            project_revisions[project_id] = semantic_visualizer_service._resolve_commit(repo_root, requested_ref)
        session = catalog_service.create_project_import_session(
            scope=payload.scope,
            project_id=payload.project_id,
            project_ids=selected_project_ids,
            project_revisions=project_revisions,
            source_revision=project_revisions.get(payload.project_id, payload.source_revision),
            selection=payload.selection.model_dump(exclude_none=True) if payload.selection else None,
            actor=user.email,
        )
        job = _enqueue_catalog_job(
            "project_component_import",
            {"session_id": str(session["id"])},
            actor=user.email,
            idempotency_key=f"project-import:{session['id']}",
        )
        return {**session, "job_id": job["id"]}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _folder_snapshot_for_user(snapshot_id: str, user: AuthenticatedUser) -> dict[str, Any]:
    snapshot = artifact_store.get_snapshot(snapshot_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Folder snapshot not found")
    if user.role != "admin" and str(snapshot.get("created_by") or "") != user.email:
        raise HTTPException(status_code=403, detail="Folder snapshot access denied")
    return snapshot


@router.get("/import-sources/folder-roots")
def list_folder_import_roots(user: AuthenticatedUser = Depends(require_catalog_writer)):
    _ = user
    return {
        "items": [
            {"name": name, "path_hint": path.name}
            for name, path in configured_import_roots().items()
        ]
    }


@router.post("/import-snapshots/folders", status_code=201)
def create_folder_snapshot(
    payload: FolderSnapshotRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    return artifact_store.create_snapshot(
        source_type="browser",
        display_name=payload.display_name,
        created_by=user.email,
    )


@router.post("/import-snapshots/folders/{snapshot_id}/files", status_code=201)
async def upload_folder_snapshot_file(
    snapshot_id: str,
    relative_path: str = Form(...),
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _folder_snapshot_for_user(snapshot_id, user)
    try:
        artifact = artifact_store.put_stream(
            file.file,
            media_type=file.content_type or "application/octet-stream",
            artifact_kind="source",
            max_bytes=settings.CATALOG_IMPORT_MAX_FILE_BYTES,
        )
        artifact_store.add_snapshot_file(snapshot_id, relative_path, artifact)
        return {"relative_path": relative_path, "sha256": artifact.sha256, "size_bytes": artifact.size_bytes}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        await file.close()


@router.post("/import-snapshots/folders/{snapshot_id}/discover")
def discover_folder_snapshot(
    snapshot_id: str,
    payload: FolderDiscoveryRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    snapshot = _folder_snapshot_for_user(snapshot_id, user)
    if snapshot.get("status") != "uploading":
        raise HTTPException(status_code=409, detail="Folder snapshot is already immutable")
    try:
        source_files = artifact_store.snapshot_files(snapshot_id)
        discovery = discover_library(
            source_files,
            [item.model_dump() for item in payload.files],
            payload.footprint_resolutions,
        )
        identities = [
            {
                "manufacturer": str(component["metadata"].get("manufacturer") or ""),
                "mpn": str(component["metadata"].get("manufacturer_part_number") or ""),
            }
            for component in discovery["components"]
        ]
        existing = catalog_service.match_component_identities(identities)
        for component in discovery["components"]:
            metadata = component["metadata"]
            identity_key = "\0".join((
                str(metadata.get("manufacturer") or "").strip().casefold(),
                str(metadata.get("manufacturer_part_number") or "").strip().casefold(),
            ))
            component["existing_component"] = existing.get(identity_key)
        discovery["existing_component_count"] = sum(
            1 for component in discovery["components"] if component.get("existing_component")
        )
        return discovery
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/import-snapshots/folders/{snapshot_id}/complete", status_code=202)
def complete_folder_snapshot(
    snapshot_id: str,
    payload: FolderApprovalRequest | None = None,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _folder_snapshot_for_user(snapshot_id, user)
    try:
        snapshot = artifact_store.complete_snapshot(snapshot_id)
        session = catalog_service.create_project_import_session(
            scope="folder",
            selection={"snapshot_id": snapshot_id, "display_name": snapshot.get("display_name")},
            actor=user.email,
        )
        job = _enqueue_catalog_job(
            "folder_library_import",
            {
                "session_id": session["id"],
                "snapshot_id": snapshot_id,
                "approved_component_ids": list((payload or FolderApprovalRequest()).approved_component_ids),
                "footprint_resolutions": dict((payload or FolderApprovalRequest()).footprint_resolutions),
            },
            actor=user.email,
            idempotency_key=f"folder-import:{snapshot_id}",
        )
        return {**session, "job_id": job["id"]}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/import-snapshots/folders/server", status_code=202)
def create_server_folder_snapshot(
    payload: ServerFolderImportRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    try:
        source = resolve_server_import_path(payload.root_name, payload.subpath)
        snapshot = artifact_store.create_snapshot(
            source_type="server",
            display_name=payload.display_name.strip() or source.name,
            source_locator=f"{payload.root_name}:{payload.subpath}",
            created_by=user.email,
        )
        session = catalog_service.create_project_import_session(
            scope="folder",
            selection={"snapshot_id": snapshot["id"], "display_name": snapshot["display_name"]},
            actor=user.email,
        )
        job = _enqueue_catalog_job(
            "folder_library_import",
            {
                "session_id": session["id"],
                "snapshot_id": snapshot["id"],
                "server_source": {"root_name": payload.root_name, "subpath": payload.subpath},
            },
            actor=user.email,
            idempotency_key=f"server-folder-import:{snapshot['id']}",
        )
        return {**session, "job_id": job["id"]}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/import-sessions/{session_id}")
def get_project_import_session(
    session_id: str,
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    session = catalog_service.get_project_import_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Import session not found")
    if user.role != "admin" and str(session.get("created_by") or "") != user.email:
        raise HTTPException(status_code=403, detail="Import session access denied")
    return session


@router.get("/jobs/{job_id}")
def get_catalog_job(job_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    job = catalog_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Catalog job not found")
    if user.role != "admin" and str(job.get("created_by") or "") != user.email:
        raise HTTPException(status_code=403, detail="Catalog job access denied")
    return {**job, "events": catalog_jobs.events(job_id)}


@router.get("/import-sessions")
def list_project_import_sessions(user: AuthenticatedUser = Depends(require_catalog_reader)):
    return {
        "items": catalog_service.list_project_import_sessions(
            created_by=user.email,
            include_all=user.role == "admin",
        )
    }


def _import_session_for_user(session_id: str, user: AuthenticatedUser) -> dict[str, Any]:
    session = catalog_service.get_project_import_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Import session not found")
    if user.role != "admin" and str(session.get("created_by") or "") != user.email:
        raise HTTPException(status_code=403, detail="Import session access denied")
    return session


@router.get("/import-sessions/{session_id}/proposals")
def list_project_import_proposals(
    session_id: str,
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    _import_session_for_user(session_id, user)
    return {"items": catalog_service.list_project_import_proposals(session_id)}


def _project_import_proposal_for_user(proposal_id: str, user: AuthenticatedUser) -> dict[str, Any]:
    proposal = catalog_service.get_project_import_proposal(proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Import proposal not found")
    session = catalog_service.get_project_import_session(str(proposal["session_id"]))
    if not session:
        raise HTTPException(status_code=404, detail="Import session not found")
    if user.role != "admin" and str(session.get("created_by") or "") != user.email:
        raise HTTPException(status_code=403, detail="Import proposal access denied")
    return proposal


@router.post("/import-proposals/{proposal_id}/accept")
def accept_project_import_proposal(
    proposal_id: str,
    payload: AcceptProjectImportProposalRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _project_import_proposal_for_user(proposal_id, user)
    try:
        return catalog_service.accept_project_import_proposal(
            proposal_id,
            metadata_overrides=payload.metadata_overrides,
            asset_selections=payload.asset_selections,
            asset_links=payload.asset_links,
            actor=user.email,
            change_summary=payload.change_summary,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/import-sessions/{session_id}/proposals/bulk-accept")
def bulk_accept_project_import_proposals(
    session_id: str,
    payload: BulkAcceptRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    """Accept many remediated rows in one request.

    Rows are independent: one failure reports against that row and the rest still
    import. Resolving a 400-part board should not be an all-or-nothing action.
    """
    _import_session_for_user(session_id, user)

    results: list[dict[str, Any]] = []
    for item in payload.items:
        proposal = catalog_service.get_project_import_proposal(item.proposal_id)
        if not proposal or str(proposal.get("session_id") or "") != session_id:
            results.append(
                {"proposal_id": item.proposal_id, "status": "failed", "error": "Import proposal not found"}
            )
            continue
        try:
            accepted = catalog_service.accept_project_import_proposal(
                item.proposal_id,
                metadata_overrides=item.metadata_overrides,
                asset_selections=item.asset_selections,
                asset_links=item.asset_links,
                actor=user.email,
                change_summary=item.change_summary,
            )
        except ValueError as exc:
            results.append({"proposal_id": item.proposal_id, "status": "failed", "error": str(exc)})
            continue
        component = accepted.get("component") or {}
        results.append(
            {
                "proposal_id": item.proposal_id,
                "status": "accepted",
                "component_id": str(component.get("id") or ""),
            }
        )

    accepted_count = sum(1 for result in results if result["status"] == "accepted")
    return {
        "accepted": accepted_count,
        "failed": len(results) - accepted_count,
        "results": results,
    }


@router.put("/import-sessions/{session_id}/proposals/drafts")
def save_import_proposal_drafts(
    session_id: str,
    payload: SaveImportDraftsRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    """Persist in-progress remediation so a long import survives a reload."""
    _import_session_for_user(session_id, user)
    saved = catalog_service.save_project_import_drafts(session_id, payload.drafts)
    return {"saved": saved}


IMPORT_CSV_COLUMNS = (
    "proposal_id",
    "reference",
    "value",
    "manufacturer",
    "manufacturer_part_number",
    "description",
    "datasheet",
    "package_name",
    "footprint_asset_id",
    "status",
    "blocking_findings",
)


def _import_csv_row(proposal: dict[str, Any]) -> dict[str, str]:
    metadata = dict(proposal.get("metadata") or {})
    draft = dict(proposal.get("draft") or {})
    overrides = dict(draft.get("metadata_overrides") or {})
    links = dict(draft.get("asset_links") or {})

    def value_for(key: str, *, fallback_key: str = "") -> str:
        if key in overrides:
            return str(overrides[key] or "")
        return str(metadata.get(fallback_key or key) or "")

    blocking = [
        str(finding.get("code") or "")
        for finding in proposal.get("findings") or []
        if finding.get("severity") == "error"
    ]
    return {
        "proposal_id": str(proposal.get("id") or ""),
        "reference": str(proposal.get("reference") or ""),
        "value": value_for("value"),
        "manufacturer": value_for("manufacturer"),
        "manufacturer_part_number": value_for("manufacturer_part_number"),
        "description": value_for("description"),
        "datasheet": value_for("datasheet"),
        "package_name": value_for("package_name", fallback_key="footprint"),
        "footprint_asset_id": str(links.get("footprint") or ""),
        "status": str(proposal.get("status") or ""),
        "blocking_findings": " ".join(sorted(set(blocking))),
    }


@router.get("/import-sessions/{session_id}/proposals.csv")
def export_import_proposals_csv(
    session_id: str,
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    """Export the remediation grid so it can be completed in a spreadsheet."""
    _import_session_for_user(session_id, user)
    proposals = catalog_service.list_project_import_proposals(session_id)

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(IMPORT_CSV_COLUMNS), lineterminator="\n")
    writer.writeheader()
    for proposal in proposals:
        writer.writerow(_import_csv_row(proposal))

    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="prism-import-{session_id}.csv"',
        },
    )


@router.post("/import-sessions/{session_id}/proposals.csv")
async def import_proposals_csv(
    session_id: str,
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    """Apply an edited CSV back onto the session's drafts.

    Rows are matched by proposal_id and nothing is accepted here: the reviewer still
    sees the result in the grid and decides what to import.
    """
    _import_session_for_user(session_id, user)

    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded") from exc

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or "proposal_id" not in reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV must include a proposal_id column")

    known_ids = {
        str(proposal["id"]) for proposal in catalog_service.list_project_import_proposals(session_id)
    }
    metadata_columns = (
        "value",
        "manufacturer",
        "manufacturer_part_number",
        "description",
        "datasheet",
        "package_name",
    )

    drafts: dict[str, dict[str, Any]] = {}
    unknown_rows = 0
    for row in reader:
        proposal_id = str(row.get("proposal_id") or "").strip()
        if not proposal_id:
            continue
        if proposal_id not in known_ids:
            unknown_rows += 1
            continue
        overrides = {
            column: str(row.get(column) or "").strip()
            for column in metadata_columns
            if row.get(column) is not None
        }
        draft: dict[str, Any] = {"metadata_overrides": overrides}
        footprint_asset_id = str(row.get("footprint_asset_id") or "").strip()
        if footprint_asset_id:
            draft["asset_links"] = {"footprint": footprint_asset_id}
        drafts[proposal_id] = draft

    saved = catalog_service.save_project_import_drafts(session_id, drafts)
    return {"saved": saved, "skipped_unknown_rows": unknown_rows}


@router.get("/assets/search")
def search_catalog_assets(
    asset_type: str = Query(default="footprint"),
    q: str = Query(default=""),
    limit: int = Query(default=25, ge=1, le=100),
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    """Search existing catalog assets so an import can reference one instead of copying it."""
    try:
        return {"items": catalog_service.search_assets(asset_type=asset_type, query=q, limit=limit)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/import-proposals/{proposal_id}/reject")
def reject_project_import_proposal(
    proposal_id: str,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _project_import_proposal_for_user(proposal_id, user)
    try:
        return catalog_service.reject_project_import_proposal(proposal_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/components")
def create_catalog_component(
    payload: CreateManualComponentRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    try:
        data = payload.model_dump()
        change_summary = str(data.pop("change_summary"))
        return catalog_service.create_manual_component(actor=user.email, change_summary=change_summary, **data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/components/{component_id}")
def get_catalog_component(component_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    _ = user
    component = catalog_service.get_component(component_id)
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return component


@router.get("/components/{component_id}/revisions")
def list_component_revisions(component_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    _ = user
    try:
        return {"items": catalog_service.list_component_revisions(component_id)}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/components/{component_id}/revisions/compare")
def compare_component_revisions(
    component_id: str,
    before: str = Query(...),
    after: str = Query(...),
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    _ = user
    try:
        return catalog_service.compare_component_revisions(component_id, before, after)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/components/{component_id}/revisions/{revision_id}")
def get_component_revision(
    component_id: str,
    revision_id: str,
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    _ = user
    revision = catalog_service.get_component_revision(component_id, revision_id)
    if not revision:
        raise HTTPException(status_code=404, detail="Component revision not found")
    return revision


@router.get("/components/{component_id}/audit")
def list_component_audit(component_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    _ = user
    try:
        return {"items": catalog_service.list_component_audit_events(component_id)}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/components/{component_id}/audit/verify")
def verify_component_audit(component_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    _ = user
    try:
        return catalog_service.verify_component_audit_chain(component_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/components/{component_id}/usage")
def list_component_usage(
    component_id: str,
    mode: str = Query(default="current", pattern="^(current|history)$"),
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    try:
        visible_projects = {str(project["id"]) for project in workspace.get_all_projects(user.role)}
        items = catalog_service.list_component_usage(component_id, include_history=mode == "history")
        return {"items": [item for item in items if str(item.get("project_id") or "") in visible_projects]}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/components/{component_id}/reviews")
def list_component_reviews(component_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    _ = user
    try:
        return {"items": catalog_service.list_component_review_decisions(component_id)}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/components/{component_id}/releases")
def list_component_releases(component_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    _ = user
    try:
        return {"items": catalog_service.list_component_release_records(component_id)}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/previews/{preview_id}")
def get_catalog_preview(preview_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    _ = user
    preview = catalog_service.catalog_preview_path(preview_id)
    if not preview:
        raise HTTPException(status_code=404, detail="Preview not found")
    path, content_type = preview
    return FileResponse(path, media_type=content_type, headers={"Cache-Control": "private, max-age=300"})


@router.patch("/components/{component_id}")
def update_catalog_component(
    component_id: str,
    payload: UpdateComponentMetadataRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    request_data = payload.model_dump()
    expected_revision_id = str(request_data.pop("expected_revision_id") or "")
    change_summary = str(request_data.pop("change_summary") or "Update component metadata")
    updates: dict[str, Any] = {
        key: value
        for key, value in request_data.items()
        if value is not None
    }
    try:
        component = catalog_service.update_component_metadata(
            component_id,
            updates,
            actor=user.email,
            change_summary=change_summary,
            expected_revision_id=expected_revision_id,
        )
    except ValueError as exc:
        status_code = 409 if "revision conflict" in str(exc).lower() else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
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
            actor=user.email,
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
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded footprint payload was empty")

    try:
        return catalog_service.import_footprint(
            component_id,
            upload_name=file.filename or "uploaded.kicad_mod",
            payload=payload,
            target_library=target_library or "Prism_Footprints",
            selected_footprint=selected_footprint,
            actor=user.email,
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
            actor=user.email,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/components/{component_id}/assets/{asset_type}")
def detach_component_asset(
    component_id: str,
    asset_type: str,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    try:
        return catalog_service.detach_asset(component_id, asset_type, actor=user.email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/components/{component_id}")
def delete_catalog_component(component_id: str, user: AuthenticatedUser = Depends(require_catalog_writer)):
    if not catalog_service.delete_component(component_id, actor=user.email):
        raise HTTPException(status_code=404, detail="Component not found")
    return {"ok": True}


@router.post("/components/{component_id}/release")
def transition_release_status(
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
            str(component_before.get("workflow_stage") or component_before.get("release_status") or "")
        )
        if not _can_transition_workflow(user, current_stage, next_stage):
            raise HTTPException(status_code=403, detail="Catalog workflow transition not allowed for this role")
        override_reason = payload.self_approval_override_reason.strip()
        if override_reason and user.role != "admin":
            raise HTTPException(status_code=403, detail="Only administrators may override two-person approval")
        component = catalog_service.set_release_status(
            component_id,
            stage,
            actor=user.email,
            self_approval_override_reason=override_reason,
            review_note=payload.review_note,
            actor_role=user.role,
            expected_revision_id=payload.expected_revision_id,
            expected_manifest_hash=payload.expected_manifest_hash,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return component


@router.post("/components/{component_id}/previews/regenerate")
def regenerate_component_previews(component_id: str, user: AuthenticatedUser = Depends(require_catalog_writer)):
    try:
        component = catalog_service.regenerate_component_previews(component_id, actor=user.email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return component


@router.post("/components/{component_id}/validate")
def validate_component_klc(component_id: str, user: AuthenticatedUser = Depends(require_catalog_writer)):
    job = _enqueue_catalog_job(
        "catalog_validation",
        {"component_ids": [component_id]},
        actor=user.email,
    )
    return {"job_id": job["id"], "status": job["status"]}


@router.get("/components/{component_id}/validation")
def get_component_validation(component_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    _ = user
    try:
        return catalog_service.get_component_validation(component_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/validation/run")
def validate_catalog(user: AuthenticatedUser = Depends(require_catalog_writer)):
    job = _enqueue_catalog_job("catalog_validation", {"component_ids": None}, actor=user.email)
    return {"job_id": job["id"], "status": job["status"]}


@router.get("/validation/jobs/{job_id}")
def get_validation_job(job_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    _ = user
    job = catalog_jobs.get(job_id, "catalog_validation")
    if not job:
        raise HTTPException(status_code=404, detail="Validation job not found")
    return job


@router.get("/validation/runs/{run_id}")
def get_validation_run(run_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    _ = user
    run = catalog_service.get_validation_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Validation run not found")
    return run


@router.get("/validation/runs/{run_id}/{report_name}")
def get_validation_report(run_id: str, report_name: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    _ = user
    path = catalog_service.validation_report_path(run_id, report_name)
    if not path:
        raise HTTPException(status_code=404, detail="Validation report not found")
    media_type = "application/json" if report_name.endswith(".json") else "application/xml" if report_name.endswith(".xml") else "text/plain"
    return FileResponse(path, media_type=media_type, filename=path.name)


@router.post("/previews/generate-missing")
def generate_missing_previews(user: AuthenticatedUser = Depends(require_catalog_writer)):
    job = _enqueue_catalog_job("catalog_preview_generation", {}, actor=user.email)
    return {"job_id": job["id"], "status": job["status"]}


@router.get("/previews/jobs/{job_id}")
def get_preview_job(job_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    _ = user
    job = catalog_jobs.get(job_id, "catalog_preview_generation")
    if not job:
        raise HTTPException(status_code=404, detail="Preview generation job not found")
    return job


@router.post("/artifacts/maintenance", status_code=202)
def run_artifact_maintenance(user: AuthenticatedUser = Depends(require_catalog_writer)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")
    job = _enqueue_catalog_job("artifact_maintenance", {}, actor=user.email)
    return {"job_id": job["id"], "status": job["status"]}


# ─── Component metadata field registry and bulk editing ────────────────────

def _require_field_admin(user: AuthenticatedUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required to manage metadata field definitions")


def _metadata_batch_for_user(batch_id: str, user: AuthenticatedUser) -> dict[str, Any]:
    batch = catalog_service.get_metadata_batch(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Metadata batch not found")
    if user.role != "admin" and str(batch.get("created_by") or "").casefold() != user.email.casefold():
        raise HTTPException(status_code=403, detail="Metadata batch access denied")
    return batch


@router.get("/metadata/fields")
def list_metadata_fields(
    include_archived: bool = Query(default=False),
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    _ = user
    return {"schema": "prism.component_metadata_a1", "items": catalog_service.list_metadata_fields(include_archived=include_archived)}


@router.post("/metadata/fields", status_code=201)
def create_metadata_field(payload: MetadataFieldRequest, user: AuthenticatedUser = Depends(require_catalog_writer)):
    _require_field_admin(user)
    try:
        return catalog_service.create_metadata_field(payload.model_dump(), actor=user.email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/metadata/fields/{field_id}")
def update_metadata_field(field_id: str, payload: MetadataFieldRequest, user: AuthenticatedUser = Depends(require_catalog_writer)):
    _require_field_admin(user)
    try:
        return catalog_service.update_metadata_field(field_id, payload.model_dump(exclude_unset=True), actor=user.email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/metadata/fields/{field_id}/archive")
def archive_metadata_field(field_id: str, user: AuthenticatedUser = Depends(require_catalog_writer)):
    _require_field_admin(user)
    try:
        return catalog_service.set_metadata_field_archived(field_id, True, actor=user.email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/metadata/fields/{field_id}/restore")
def restore_metadata_field(field_id: str, user: AuthenticatedUser = Depends(require_catalog_writer)):
    _require_field_admin(user)
    try:
        return catalog_service.set_metadata_field_archived(field_id, False, actor=user.email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/metadata/grid-preferences")
def get_metadata_grid_preferences(user: AuthenticatedUser = Depends(require_catalog_reader)):
    return catalog_service.get_metadata_grid_preferences(user.email)


@router.put("/metadata/grid-preferences")
def save_metadata_grid_preferences(
    payload: MetadataGridPreferencesRequest,
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    return catalog_service.save_metadata_grid_preferences(user.email, payload.model_dump())


@router.get("/metadata/grid")
def metadata_grid(
    q: str = Query(default=""),
    availability_state: str | None = Query(default=None),
    workflow_stage: str | None = Query(default=None),
    validation_status: str | None = Query(default=None),
    category: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=200),
    sort_by: str = Query(default="updated_at"),
    sort_dir: str = Query(default="desc"),
    field: list[str] | None = Query(default=None),
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    _ = user
    try:
        return catalog_service.metadata_grid(
            query=q, availability_state=availability_state, workflow_stage=workflow_stage,
            validation_status=validation_status, category=category, page=page,
            page_size=page_size, sort_by=sort_by, sort_dir=sort_dir, field_keys=field,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/metadata/batches", status_code=201)
def create_metadata_batch(payload: CreateMetadataBatchRequest, user: AuthenticatedUser = Depends(require_catalog_writer)):
    try:
        return catalog_service.stage_metadata_batch(
            [item.model_dump() for item in payload.items], source="grid", actor=user.email,
            change_summary=payload.change_summary,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/metadata/batches/{batch_id}")
def get_metadata_batch(batch_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    return _metadata_batch_for_user(batch_id, user)


@router.post("/metadata/batches/{batch_id}/approve-fields")
def approve_metadata_batch_fields(batch_id: str, user: AuthenticatedUser = Depends(require_catalog_writer)):
    _require_field_admin(user)
    _metadata_batch_for_user(batch_id, user)
    try:
        return catalog_service.approve_metadata_batch_fields(batch_id, actor=user.email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/metadata/batches/{batch_id}/apply", status_code=202)
def apply_metadata_batch(
    batch_id: str,
    payload: ApplyMetadataBatchRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _metadata_batch_for_user(batch_id, user)
    selection_key = hashlib.sha256(
        "\n".join(sorted(payload.item_ids)).encode("utf-8")
    ).hexdigest()[:16] if payload.item_ids else "all"
    job = _enqueue_catalog_job(
        "catalog_metadata_batch",
        {"batch_id": batch_id, "item_ids": payload.item_ids, "actor": user.email},
        actor=user.email,
        idempotency_key=f"metadata-batch:{batch_id}:{selection_key}",
    )
    return {"batch_id": batch_id, "job_id": job["id"], "status": job["status"]}


@router.get("/metadata/jobs/{job_id}")
def get_metadata_job(job_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    job = catalog_jobs.get(job_id, "catalog_metadata_batch")
    if not job:
        raise HTTPException(status_code=404, detail="Metadata job not found")
    if user.role != "admin" and str(job.get("created_by") or "").casefold() != user.email.casefold():
        raise HTTPException(status_code=403, detail="Metadata job access denied")
    return job


@router.get("/metadata/export.csv")
def export_metadata_csv(
    field: list[str] | None = Query(default=None),
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    selected_fields = field
    if selected_fields is None:
        preferences = catalog_service.get_metadata_grid_preferences(user.email)
        if "visible" in preferences:
            selected_fields = [str(key) for key in preferences.get("visible") or []]
    try:
        return StreamingResponse(
            chain(("\ufeff",), catalog_service.iter_metadata_csv(field_keys=selected_fields)),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="prism-component-metadata.csv"'},
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/metadata/import-csv/preview", status_code=201)
async def preview_metadata_csv(
    file: UploadFile = File(...),
    change_summary: str = Form(default="Import component metadata from CSV"),
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="CSV file is empty")
    try:
        return catalog_service.preview_metadata_csv(content.decode("utf-8-sig"), actor=user.email, change_summary=change_summary)
    except (UnicodeDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        await file.close()


@router.get("/metadata/batches/{batch_id}/report.csv")
def metadata_batch_report(batch_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    batch = _metadata_batch_for_user(batch_id, user)
    output = ["component_id,mpn,status,error"]
    for item in batch["items"]:
        values = [item["component_id"], item["mpn"], item["validation_status"], item["error_message"]]
        output.append(",".join('"' + str(value).replace('"', '""') + '"' for value in values))
    return Response(
        content="\n".join(output) + "\n", media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="metadata-batch-{batch_id}.csv"'},
    )


@router.post("/exports/kicad-dbl")
def export_kicad_dbl_bundle(user: AuthenticatedUser = Depends(require_catalog_writer)):
    _ = user
    try:
        return catalog_service.export_kicad_dbl_bundle()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ─── Phase 2: CSV Import Routes ──────────────────────────────────────────────

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
def browse_library_assets(
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
def link_library_asset(
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
            actor=user.email,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
